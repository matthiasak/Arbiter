require("es5-shim")
require("babel/polyfill")
import {Promise} from 'es6-promise'
var Babel = require('babel-core')
import React, {Component} from 'react'

var program = unescape(window.location.hash.slice(1)) || `/* (1) use log(..) to print output (both sync and async) to the right hand side.
 * (2) Warning: infinite loops will possibly freeze this tab, so take caution. */

log(5000)
let each = (c, fn) => c.forEach(fn)
each([{a:1},2,3], log)
`

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
            requestAnimationFrame(() => {g1.next(args)})
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

const blobContents = (code) => `
    (function(log){
        ${code}
    }).call(this, function(x){ postMessage(x) })
    `,
    getWorker = (code) => {
        let contents = blobContents(code),
            blob = new Blob([contents]),
            url = window.URL.createObjectURL(blob),
            w = new Worker(url)

        return w
    },
    // worker is a prop() with an "onSet"
    worker = prop(getWorker(), (worker_new, worker_old) => {
        // whenever we set a new worker,
        // set onmessage on the new worker,
        // and kill the old one
        worker_new.onmessage = (e) => {
            channels.logEmitted.send(e.data)
        }

        worker_old && worker_old.terminate()
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

@autobind
class Code extends Component {
    constructor(...p){
        super(...p)
        this.bind('_onKey', '_handleFormatting')
    }
    _handleFormatting(e){
        let {keyCode} = e,
            node = React.findDOMNode(this.refs.t)

        if(keyCode === 9){
            e.preventDefault()
            let s = node.selectionStart-1
            node.value = node.value.slice(0,s+1) + '    ' + node.value.slice(s+1)
            node.selectionStart = node.selectionEnd = s+5
        }
    }
    _onKey(e){
        let node = React.findDOMNode(this.refs.t)
        channels.codeEdited.send( node.value )
    }
    componentDidMount(){
        requestAnimationFrame(() => this._onKey())
    }
    render(){
        return (<textarea ref="t" onKeyUp={this._onKey} onKeyDown={this._handleFormatting}>{program}</textarea>)
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
    React.render(<TwoPainz />, qs('.container'))
}
