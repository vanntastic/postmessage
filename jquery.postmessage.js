(function($) {

     if (!("console" in window)) {
         window.console = {};
         window.console.log = window.console.warn = window.console.error = window.console.debug = function(){};
     }

     $.fn.postmessage = function() {
         console.log("usage: \nto send:    $.postmessage(options)\nto receive: $.postmessage.bind(type, fn, [origin])");
         return this;
     };

     var pm = $.postmessage = $.pm = function(options) {
         pm.send(options);
     };

     /**
      * options - @see $.postmessage.defaults
      */
     pm.send = function(options) {
         var o = $.extend({}, pm.defaults, options),
         target = o.target;
         if (!o.target) {
             console.warn("postmessage target window required");
             return;
         }
         if (!o.type) {
             console.warn("postmessage type required");
             return;
         }
         var msg = {data:o.data, type:o.type};
         if (o.success) {
             msg.callback = pm._callback(o.success);
         }
         if (o.error) {
             msg.errback = pm._callback(o.error);
         }

         if (("postMessage" in target) && !o.hash) {
             pm._bind();
             target.postMessage(JSON.stringify(msg), o.origin || '*');
         }
         else {
             pm.hash._bind();
             pm.hash.send(o, msg);
         }
     };


     pm.bind = function(type, fn, origin, hash) {
         if (("postMessage" in window) && !hash) {
             pm._bind();
         }
         else {
             pm.hash._bind();
         }
         var l = $(document).data("listeners.postmessage");
         if (!l) {
             l = {};
             $(document).data("listeners.postmessage", l);
         }
         var fns = l[type];
         if (!fns) {
             fns = [];
             l[type] = fns;
         }
         fns.push({fn:fn, origin:origin || pm.origin});
     };

     pm.unbind = function(type, fn) {
         var l = $(document).data("listeners.postmessage");
         if (l) {
             if (type) {
                 if (fn) {
                     // remove specific listener
                     var fns = l[type];
                     if (fns) {
                         l[type] = $.grep(fns, function(o,i) { return o.fn !== fn; });
                     }
                 }
                 else {
                     // remove all listeners by type
                     delete l[type];
                 }
             }
             else {
                 // unbind all listeners of all type
                 l = {};
             }
         }
     };

     /**
      * set global origin
      */
     pm.origin = null;

     /**
      * default options
      */
     pm.defaults = {
         target: null,  /* target window (required) */
         url: null,     /* target window url (required if no window.postMessage or hash == true) */
         type: null,    /* message type (required) */
         data: null,    /* message data (required) */
         success: null, /* success callback (optional) */
         error: null,   /* error callback (optional) */
         origin: "*",   /* postmessage origin (optional) */
         hash: false    /* use location hash for message passing (optional) */
     };

     pm._CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

     pm._random = function() {
         var r = [];
         for (var i=0; i<32; i++) {
             r[i] = pm._CHARS[0 | Math.random() * 32];
         };
         return r.join("");
     };


     pm._callback = function(fn) {
         var cbs = $(document).data("callbacks.postmessage");
         if (!cbs) {
             cbs = {};
             $(document).data("callbacks.postmessage", cbs);
         }
         var r = pm._random();
         cbs[r] = fn;
         return r;
     };

     pm._bind = function() {
         // are we already listening to message events on this w?
         if (!$(document).data("listening.postmessage")) {
             if (window.addEventListener) {
                 window.addEventListener("message", pm._dispatch, false);
             }
             else if (window.attachEvent) {
                 window.attachEvent("onmessage", pm._dispatch);
             }
             $(document).data("listening.postmessage", 1);
         }
     };

     pm._dispatch = function(e) {
         //console.log("$.postmessage.dispatch", e, this);
         try {
             var msg = JSON.parse(e.data);
         }
         catch (ex) {
             console.warn("postmessage data invalid json: ", ex);
             return;
         }

         if (!msg.type) {
             console.warn("postmessage message type required");
             return;
         }

         var cbs = $(document).data("callbacks.postmessage") || {},
         cb = cbs[msg.type];
         if (cb) {
             cb(msg.data);
         }
         else {
             var l = $(document).data("listeners.postmessage") || {};
             var fns = l[msg.type] || [];
             $.each(fns, function(i,o) {
                        if (o.origin && e.origin !== o.origin) {
                            console.warn("postmessage message origin mismatch", e.origin, o.origin);
                            if (msg.errback) {
                                // notify post message errback
                                var error = {
                                    message: "postmessage origin mismatch",
                                    origin: [e.origin, o.origin]
                                };
                                pm.send({target:e.source, data: error, type: msg.errback});
                            }
                            return;
                        }
                        try {
                            var r = o.fn(msg.data);
                            if (msg.callback) {
                                pm.send({target:e.source, data: r, type: msg.callback});
                            }
                        }
                        catch (ex) {
                            if (msg.errback) {
                                // notify post message errback
                                pm.send({target:e.source, data: ex, type: msg.errback});
                            }
                        }
                    });
         }
     };

     pm.hash = {

         send: function(options, msg) {
             //console.log("hash.send", target_window, options, msg);
             var target_window = options.target,
             target_url = options.url;
             if (!target_url) {
                 console.warn("postmessage target window url is required");
                 return;
             }
             target_url = pm.hash._url(target_url);
             var source_window,
             source_url = pm.hash._url(window.location.href);

             if (window == target_window.parent) {
                 source_window = "parent";
             }
             else {
                 $.each(parent.frames, function(i,n) {
                            if (n == window) {
                                source_window = i;
                                return false;
                            }
                        });
             }

             if (source_window == null) {
                 console.warn("postmessage windows must be direct parent/child windows and the child must be available through the window.frames list");
                 return;
             }

             var hashmessage = {
                 "x-requested-with": "postmessage",
                 source: {
                     name: source_window,
                     url: source_url
                 },
                 postmessage: msg
             };

             //pm.hash._bind(window);

             var hash_id = "#x-postmessage-id=" + pm._random();

             target_window.location = target_url + hash_id + encodeURIComponent(JSON.stringify(hashmessage));
         },

         _regex: /^\#x\-postmessage\-id\=(\w{32})/,
         _regex_len: "#x-postmessage-id=".length + 32,

         _bind: function() {
             // are we already listening to message events on this w?
             if ($(document).data("polling.postmessage") !=  1) {
                 $(document).data("polling.postmessage", 1);

                 setInterval(function() {
                                 var hash = "" + window.location.hash;
                                 var m = $.postmessage.hash._regex.exec(hash);
                                 if (m) {
                                     var id = m[1];
                                     if ($.postmessage.hash._last !== id) {
                                         $.postmessage.hash._last = id;
                                         $.postmessage.hash._dispatch(hash.substring($.postmessage.hash._regex_len));
                                     }
                                 }
                             }, 200);


             }
             else {

             }
         },

         _dispatch: function(hash) {
             if (!hash) {
                 return;
             }


             try {
                 hash = JSON.parse(decodeURIComponent(hash));

                 if (!(hash['x-requested-with'] === 'postmessage' &&
                       hash.source && hash.source.name != null && hash.source.url && hash.postmessage)) {
                     // ignore since hash could've come from somewhere else
                     return;
                 }
             }
             catch (ex) {
                 // ignore since hash could've come from somewhere else
                 return;
             }

             var msg = hash.postmessage,
             cbs = $(document).data("callbacks.postmessage") || {},
             cb = cbs[msg.type];
             if (cb) {
                 cb(msg.data);
             }
             else {
                 var source_window;
                 if (hash.source.name === "parent") {
                     source_window = window.parent;
                 }
                 else {
                     source_window = window.frames[hash.source.name];
                 }
                 var l = $(document).data("listeners.postmessage") || {};
                 var fns = l[msg.type] || [];

                 $.each(fns, function(i,o) {
                            if (o.origin) {
                                var origin = /https?\:\/\/[^\/]*/.exec(hash.source.url)[0];
                                if (origin !== o.origin) {
                                    console.warn("postmessage message origin mismatch", origin, o.origin);
                                    if (msg.errback) {
                                        // notify post message errback
                                        var error = {
                                            message: "postmessage origin mismatch",
                                            origin: [origin, o.origin]
                                        };
                                        $.postmessage({target: source_window, data: error, type: msg.errback, hash:true, url:hash.source.url});
                                    }
                                    return;
                                }
                            }
                            try {
                                var r = o.fn(msg.data);
                                if (msg.callback) {
                                    $.postmessage({target:source_window, data: r, type: msg.callback, hash:true, url:hash.source.url});
                                }
                            }
                            catch (ex) {
                                if (msg.errback) {
                                    // notify post message errback
                                    $.postmessage({target:source_window, data: ex, type: msg.errback, hash:true, url:hash.source.url});
                                }
                            }
                        });
             }
         },

         _url: function(url) {
             // url minus hash part
             return (""+url).replace(/#.*$/, "");
         }

     };

 })(jQuery);

/**
 * http://www.JSON.org/json2.js
 **/
if (! ("JSON" in window && window.JSON)){JSON={}}(function(){function f(n){return n<10?"0"+n:n}if(typeof Date.prototype.toJSON!=="function"){Date.prototype.toJSON=function(key){return this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z"};String.prototype.toJSON=Number.prototype.toJSON=Boolean.prototype.toJSON=function(key){return this.valueOf()}}var cx=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,escapable=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},rep;function quote(string){escapable.lastIndex=0;return escapable.test(string)?'"'+string.replace(escapable,function(a){var c=meta[a];return typeof c==="string"?c:"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+string+'"'}function str(key,holder){var i,k,v,length,mind=gap,partial,value=holder[key];if(value&&typeof value==="object"&&typeof value.toJSON==="function"){value=value.toJSON(key)}if(typeof rep==="function"){value=rep.call(holder,key,value)}switch(typeof value){case"string":return quote(value);case"number":return isFinite(value)?String(value):"null";case"boolean":case"null":return String(value);case"object":if(!value){return"null"}gap+=indent;partial=[];if(Object.prototype.toString.apply(value)==="[object Array]"){length=value.length;for(i=0;i<length;i+=1){partial[i]=str(i,value)||"null"}v=partial.length===0?"[]":gap?"[\n"+gap+partial.join(",\n"+gap)+"\n"+mind+"]":"["+partial.join(",")+"]";gap=mind;return v}if(rep&&typeof rep==="object"){length=rep.length;for(i=0;i<length;i+=1){k=rep[i];if(typeof k==="string"){v=str(k,value);if(v){partial.push(quote(k)+(gap?": ":":")+v)}}}}else{for(k in value){if(Object.hasOwnProperty.call(value,k)){v=str(k,value);if(v){partial.push(quote(k)+(gap?": ":":")+v)}}}}v=partial.length===0?"{}":gap?"{\n"+gap+partial.join(",\n"+gap)+"\n"+mind+"}":"{"+partial.join(",")+"}";gap=mind;return v}}if(typeof JSON.stringify!=="function"){JSON.stringify=function(value,replacer,space){var i;gap="";indent="";if(typeof space==="number"){for(i=0;i<space;i+=1){indent+=" "}}else{if(typeof space==="string"){indent=space}}rep=replacer;if(replacer&&typeof replacer!=="function"&&(typeof replacer!=="object"||typeof replacer.length!=="number")){throw new Error("JSON.stringify")}return str("",{"":value})}}if(typeof JSON.parse!=="function"){JSON.parse=function(text,reviver){var j;function walk(holder,key){var k,v,value=holder[key];if(value&&typeof value==="object"){for(k in value){if(Object.hasOwnProperty.call(value,k)){v=walk(value,k);if(v!==undefined){value[k]=v}else{delete value[k]}}}}return reviver.call(holder,key,value)}cx.lastIndex=0;if(cx.test(text)){text=text.replace(cx,function(a){return"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})}if(/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:\s*\[)+/g,""))){j=eval("("+text+")");return typeof reviver==="function"?walk({"":j},""):j}throw new SyntaxError("JSON.parse")}}}());
