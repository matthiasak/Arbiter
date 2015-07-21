require("es5-shim")
require("babel/polyfill")
import {Promise} from 'es6-promise'
var Babel = require('babel-core')
import React, {Component} from 'react'
let codemirror = require('./codemirror')
let jsmode = require('./javascript')

const directions = `/* (1) use log(..) to print output (both sync and async) to the right hand side.
 * (2) use reset(..) from your own code to reset the output area.
 * (3) CMD+S to share a link to your code. */`
var program =
    unescape(window.location.hash.slice(1)) ||
    `${directions}

log(5000)
let each = (c, fn) => c.forEach(fn)
each([{a:1},2,3], log)
`

function prepEnvironment() {
    // Disable selecting of text
    document.onselectstart = function() {
        if (event.srcElement.type != "text" && event.srcElement.type != "textarea" && event.srcElement.type != "password") {
            return false
        } else {
            return true
        }
    }

    // Break out of frames

    function bust() {
        document.write = "";
        window.top.location = window.self.location;
        setTimeout(function() {
            document.body.innerHTML = ''
        }, 0)
        window.self.onload = function(evt) {
            document.body.innerHTML = ''
        }
    }

    if (window.top !== window.self) {
        try {
            if (window.top.location.host) {} else {
                bust()
            }
        } catch (ex) {
            bust()
        }
    }

    // Disable Context Menu
    document.oncontextmenu = function() {
        return false
    }

    // Disable dragging of HTML elements
    document.ondragstart = function() {
        return false
    }
}

const key = 'AIzaSyC70EBqy70L7fzc19pm_CBczzBxOK-JnhU'
const urlShortener = () => {
    googleShortener(window.location.toString())
}
const googleShortener = (longUrl) =>
    fetch(`https://www.googleapis.com/urlshortener/v1/url?key=${key}`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({longUrl})
        }
    ).then((r) => r.json()).then((data) => {
        window.prompt("Copy URL to clipboard:", data.id)
    })
const qs = (sel, el) => (el || document).querySelector(sel)

/**
 * TRANSDUCER stuff
 */

// resources
const clone = (data) => typeof data === 'undefined' ? data : JSON.parse(JSON.stringify(data))
const concat = (arr, x) => arr.concat([x])
const compose = (f, g) => (x) => f(g(x))
const each = (c, cb) => c.forEach(cb)
const c = compose
const map = (c, transform) => c.map(transform)
const reduce = (c, reducer, initial) => c.reduce(reducer, initial)
const filter = (c, pred) => c.filter(pred)
const ident = (x) => x
const until = (c, pred, hasBeenReached = false) =>
    c.reduce((a, v) => {
        !hasBeenReached && !(hasBeenReached = pred(v)) && a.push(v)
        return a
    }, [])
const last = (c) => c[c.length > 1 ? c.length-1 : 0]
const head = (c) => c[0]
const rest = (c) => c.slice(1)
const find = (c, pred) => {
    for(var i = 0, len = c.length; i < len; i++) {
        let r = c[i]
        if(pred(r)) return r
    }
    return null
}
const concatAll = (cc) => [].concat(...cc)
const ignores = (c, ignore) => filter(c, (x) => ignore.indexOf(x) === -1)
const count = (a) => a.length

/**
 * @example
 *
    let channel = chan()
    const each = (arr, cb) => arr.forEach(cb)

    // in module A
    channel.from((_) => {
        window.addEventListener('mousemove', _ )
    })

    // in module B
    channel.to((...args) => {
        console.log(...args)
    })
 *
 */


const prop = (val, onSet) => {
    if(val && onSet){
        onSet(val)
    }
    return function(x){
        if(typeof x !== 'undefined') {
            onSet(x, val)
            return (val = x)
        }
    }
}

const gen = function* ( cb = ()=>{} ){
    var x
    while(1) {
        x = cb(yield x)
    }
}

const chan = () => {
    let dests = new Set(),
        g1 = gen((args) => { for(var x of dests) x(...args) }),
        stack = [],
        pipe = (...args) => {
            setTimeout(() => {g1.next(args)}, 0)
        }

    g1.next()

    return {
        from: function(cb) {
            cb(pipe)
        },
        to: function(cb) {
            dests.add(cb)
        },
        unto: function(cb){
            dests.remove(cb)
        },
        send: (...args) => pipe(...args)
    }
}

const channels = {
    codeEdited: chan(),
    logEmitted: chan(),
    codeCleared: chan()
}

/**
 * Returns a slice of the input collection that represents a single function scope
 * @param  {Array of <Tokens>} c
 * @return {Array of <Tokens>}
 */

const getWorker = (code) => {
        let w = new Worker('./dist/worker.js')
        requestAnimationFrame(() => {
            w.postMessage(code)
        })
        return w
    },
    // worker is a prop() with an "onSet"
    worker = prop(getWorker(), (worker_new, worker_old) => {
        // whenever we set a new worker,
        // set onmessage on the new worker,
        // and kill the old one
        worker_new.onmessage = (e) => {
            switch(e.data.type){
                case 'reset':
                    channels.codeCleared.send()
                    break;
                case 'log':
                    channels.logEmitted.send(e.data.data)
                    break;
            }

        }

        requestAnimationFrame(() => {
            if(!worker_old) return
            worker.onmessage = null
            worker_old.terminate()
        })
    })

// shortcut to restarting worker
worker.new = (code) => worker(getWorker(code))

channels.codeEdited.to((code) => {
    analyze(code)
})

let oldProgram = null
const analyze = (program) => {
    if(oldProgram === program.trim()) return
    try{
        const result = Babel.transform(program, {stage: 1}),
            {code} = result
        worker.new(code)
    } catch(e){
        console.error(e)
    }
    oldProgram = program.trim()
    window.location.hash = `#${escape(oldProgram)}`
    channels.codeCleared.send()
}

function autobind(target){
    target.prototype.bind = function(...names){ each(names, (n) => this[n] = this[n].bind(this) ) }
}

class TwoPainz extends Component {
    constructor(...p){
        super(...p)
    }
    render(){
        return (<div className="grid grid-2">
            <Code />
            <Results />
        </div>)
    }
}

const longest_common_substring_from_start = (a, b) => {
    let shorter = a.length > b.length ? a : b,
        longer = a.length <= b.length ? a : b
    for(let i=0, len = shorter.length; i<len; i++){
        if(shorter[i] !== longer[i]) return shorter.slice(0, i+1)
    }
    return shorter
}

@autobind
class Code extends Component {
    constructor(...p){
        super(...p)
        this.bind('_keyDown', '_keyUp')
        this.keys = {}
    }
    _keyDown(e){
        let {keyCode} = e
        this.keys[keyCode] = true

        if(this.keys[91] && this.keys[83]){
            e.preventDefault()
            urlShortener()
        }
    }
    _keyUp(e){
        let {keyCode} = e
        this.keys[keyCode] = false
        setTimeout(() => {
            this.keys = {}
        }, 50)
    }
    shouldComponentUpdate(){
        return false
    }
    componentDidMount(){
        this.editor = codemirror.fromTextArea(React.findDOMNode(this.refs.code), {
            lineNumbers: true,
            lineWrapping: true,
            indentUnit: 4,
            fixedGutter: false,
            mode: "javascript",
            inputStyle: "contenteditable",
            autofocus: true,
            theme: 'material'
        })
        this.editor.on('change', () => channels.codeEdited.send( this.editor.getValue() ))
        channels.codeEdited.send( this.editor.getValue() )
    }
    render(){
        return (<div onKeyDown={this._keyDown} onKeyUp={this._keyUp}><textarea ref='code'>{program}</textarea></div>)
    }
}

class Results extends Component {
    constructor(...p){
        super(...p)
        this.state = { logs: [] }
        this.append = (m) => {
            this.setState({ logs: concat(this.state.logs, m) })
        }
        this.rerender = () => {
            this.setState({ logs: [] })
        }
    }
    componentDidMount(){
        channels.codeCleared.to(this.rerender)
        channels.logEmitted.to(this.append)
    }
    componentDidUnmount(){
        channel.codeCleared.unto(this.rerender)
        channels.logEmitted.unto(this.append)
    }
    render(){
        let logs = map(this.state.logs, (a) => JSON.stringify(a)).join('\n')
        return (<textarea value={ logs } />)
    }
}

window.onload = function(){
    prepEnvironment()
    React.render(<TwoPainz />, qs('.container'))
}
