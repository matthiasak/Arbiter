require('babel/polyfill')

let each = (c, fn) => c.forEach(fn)
let log = (...args) => {
    let x = args.map((arg) => {
        if(typeof arg === 'function') return arg.toString()
        if(arg instanceof Object && arg.__proto__ !== Object.prototype) return arg.toString()
        return arg
    })
    postMessage({ type: 'log', data: x.length > 1 ? x : x[0] })
}
let reset = () => postMessage({type: 'reset'})

global.onmessage = (e) => {
    new Function('log', 'reset', e.data)(log, reset)
}
