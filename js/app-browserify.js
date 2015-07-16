require("es5-shim")
require("babel/polyfill")
import {Promise} from 'es6-promise'
var Babel = require('babel-core')
import React, {Component} from 'react'

var program = `
let prop = (v) => (x) => {
    (typeof x !== 'undefined') && (v = x)
    return x
}
function sum1(a,b){
    return a+b
}
let sum2 = (a,b) => a+b
let test = 'helloooooooooooooooooo'
`

const qs = (sel, el) => (el || document).querySelector(sel)
const clone = (data) => typeof data === 'undefined' ? data : JSON.parse(JSON.stringify(data))

/**
 * TRANSDUCER stuff
 */

// resources
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
        g1 = gen((args) => { for(var x of dests) x(...args) })

    g1.next()

    return {
        from: function(cb) {
            let pipe = (...args) => g1.next(args)
            cb(pipe)
        },
        to: function(cb) {
            dests.add(cb)
        },
        unto: function(cb){
            dests.remove(cb)
        }
    }
}

const channel = chan()
const NAMES = (x) => x.type && !!(x.type.label || '').match(/^(name)$/)
const EOF = (x) => x.type && !!(x.type.label || '').match(/^eof$/)
const SEMICOLON = (x) => x.type && !!(x.type.label || '').match(/^;$/)
const KEYWORD = (i) => (x) => x.type && (x.type.keyword || '').match(i)
const LABEL = (i) => (x) => x.type && (x.type.label || '').match(i)
const findKeyword = (c, i) => find(c, KEYWORD(i))
const findLabel = (c, i) => find(c, LABEL(i))
const isCurlyLeft = LABEL(/\{/)
const isCurlyRight = LABEL(/\}/)
const flatten = (c) => map(c, (token) => token.value || token.type && token.type.label).join(' ')
const logEach = (c) => each(c, (x) => console.log(x))
/**
 * Returns a slice of the input collection that represents a single function scope
 * @param  {Array of <Tokens>} c
 * @return {Array of <Tokens>}
 */

const extractScope = (c) => {
    let functionToken = findKeyword(c, 'function')
    if(!functionToken) return null // no scopes found

    let afterFunctionToken = c.slice(c.indexOf(functionToken)),
        curlies = filter(afterFunctionToken, LABEL(/[\{\}]/)), // look for all curlies
        depth = 0,
        scopeEnd = null

    each(curlies, (v, i) => {
        if(isCurlyLeft(v)) {
            depth++
        } else {
            depth --
        }
        if(depth === 0 && !scopeEnd){
            scopeEnd = v
        }
    })

    return afterFunctionToken.slice(0, afterFunctionToken.indexOf(scopeEnd)+1)
}

const extractScopes = (c) => {
    var nextScope,
        scopes = []
    do{
        nextScope = extractScope(c)
        if(nextScope){
            scopes.push(nextScope)
            c = [].concat( c.slice(0, c.indexOf(head(nextScope))), c.slice(c.indexOf(last(nextScope))) )
        }
    }
    while(nextScope)

    return scopes
}

const extractVarAssignment = (c) => {
    let varToken = findLabel(c, 'var')
    if(!varToken) return null // no vars found

    let varList = c.slice(c.indexOf(varToken)),
        varNames = until(varList, SEMICOLON), // var x[ = ...], y[, ...]] ;
        tokens = []

    for(var i = 0, len = varNames.length; i < len; i++){
        let token = varNames[i]
        if(token.value === '='){
            console.log(varNames[i+1], i, varNames)
            varNames[i+1].value = `prop(${varNames[i+1].value})`
            tokens.push(varNames[i+1])
        }
    }

    return tokens
}

const extractVarAssignments = (c) => {
    var nextVar,
        vars = []

    do{
        nextVar = extractVarAssignment(c) // var x[, y[, ...]] ;
        if(nextVar){
            vars.push(nextVar)
            // create a new array, removing what we just pushed to vars
            c = c.slice(c.indexOf(last(nextVar)) + 1)
        }
    }
    while(nextVar)

    return vars
}

const buildTree = (c) => {
    let scopes = extractScopes(c),
        subtree = {
            assignments: extractVarAssignments(ignores(c, concatAll(scopes) )),
            scopes: map(scopes, compose(buildTree, rest)),
            names: []
        }
    return subtree
}
const analyze = (program) => {
    try{
        const result = Babel.transform(program),
            {code} = result,
            es5 = Babel.transform(code),
            {ast} = es5,
            p = new Array(ast.program.loc.end.line).fill([]),
            tokens = ast.tokens

        // logEach(tokens)

        // -- 1
        // anytime a variable is declared (arguments, regular scope) we must
        // wrap it with prop(); args will be turned into props in function body (any function body, must consider scope)
        // let names = filter(tokens, NAMES)
        // let scopes = buildTree(until(tokens, EOF))
        // console.log(scopes)
        // -- 2
        // anytime a variable is then used, we must add () after it

        let arr = []
        let codeResult = `(function(log){
            ${code}
        })(
            function(x){ arr.push(x) }
        )`
        eval(codeResult)
        return arr.join('\n')

    } catch(e){
        console.error(e)
    }
}

function autobind(target){
    target.prototype.bind = function(name){ this[name] = this[name].bind(this) }
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
        channel.from((_) => {
            this.from = _
        })
        this.bind('_onKeyUp')
    }
    _onKeyUp(e){
        this.from( React.findDOMNode(this.refs.t).value )
    }
    componentDidMount(){
        requestAnimationFrame(this._onKeyUp)
    }
    render(){
        return (<textarea ref="t" onChange={this._onKeyUp}>{program}</textarea>)
    }
}

class Results extends Component {
    constructor(...p){
        super(...p)
        this.state = { program: '' }
        this.rerender = (program) => {
            this.setState({ program: analyze(program) })
        }
    }
    componentDidMount(){
        channel.to(this.rerender)
    }
    componentDidUnmount(){
        channel.unto(this.rerender)
    }
    render(){
        return (<textarea value={this.state.program} />)
    }
}

window.onload = function(){
    React.render(<TwoPainz />, qs('.container'))
}
