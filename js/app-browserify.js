require("es5-shim")
require("babel/polyfill")
import {Promise} from 'es6-promise'
var Babel = require('babel-core')
import React, {Component} from 'react'

var program = `log(5000)
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


const prop = (val) => {
    return function(x){
        (typeof x !== 'undefined') && (val = x)
        return val
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
        pipe = (...args) => g1.next(args)

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
    logEmitted: chan()
}

/**
 * Returns a slice of the input collection that represents a single function scope
 * @param  {Array of <Tokens>} c
 * @return {Array of <Tokens>}
 */

let blob = new Blob([
    `
        this.onmessage = function(e){
            var f = new Function("(function(log){"+e.data+"})(function(x){postMessage(x)});")
            f()
        }
    `
    ]),
    blobURL = window.URL.createObjectURL(blob),
    worker = new Worker(blobURL)

// worker.onerror = (e) => console.error(e)
worker.onmessage = (e) => {
    channels.logEmitted.send(e.data)
}

channels.codeEdited.to((code) => {
    analyze(code)
})

const analyze = (program) => {
    try{
        const result = Babel.transform(program),
            {code} = result

        worker.postMessage(code)
    } catch(e){
        console.error(e)
    }
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
        channels.codeEdited.to(this.rerender)
        channels.logEmitted.to(this.append)
    }
    componentDidUnmount(){
        channel.codeEdited.unto(this.rerender)
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
