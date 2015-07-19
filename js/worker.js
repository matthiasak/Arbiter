require('babel/polyfill')

global.onmessage = (e) => {
    (function(log, reset){
        eval(e.data)
    }).call(this, function(){
        Array.prototype.slice.call(arguments).forEach(function(x){
            postMessage({type: 'log', data: x})
        })
    }, function(){
        postMessage({type: 'reset'})
    })
}

