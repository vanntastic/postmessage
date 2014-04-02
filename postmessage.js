/**
 The MIT License

 Copyright (c) 2010 Daniel Park (http://metaweb.com, http://postmessage.freebaseapps.com)

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 **/
var NO_JQUERY = {};
(function(window, $, undefined) {

	if (!("console" in window)) {
		var c = window.console = {};
		c.log = c.warn = c.error = c.debug = function() {};
	}

	if ($ === NO_JQUERY) {
		// jQuery is optional
		$ = {
			fn: {},
			extend: function() {
				var a = arguments[0];
				for (var i = 1, len = arguments.length; i < len; i++) {
					var b = arguments[i];
					for (var prop in b) {
						a[prop] = b[prop];
					}
				}
				return a;
			}
		};
	}

	$.fn.pm = function() {
		console.log("usage: \nto send:    $.pm(options)\nto receive: $.pm.bind(type, fn, [origin])");
		return this;
	};

	// send postmessage
	$.pm = window.pm = function(options) {
		pm.send(options);
	};

	// bind postmessage handler
	$.pm.bind = window.pm.bind = function(type, fn, origin, hash, async_reply) {
		pm.bind(type, fn, origin, hash, async_reply === true);
	};

	$.pm.on = window.pm.on = function(type, fn, opts) {
		pm.on(type, fn, opts);
	};

	// unbind postmessage handler
	$.pm.unbind = window.pm.unbind = function(type, fn) {
		pm.unbind(type, fn);
	};

	// default postmessage origin on bind
	$.pm.origin = window.pm.origin = null;

	// default postmessage polling if using location hash to pass postmessages
	$.pm.poll = window.pm.poll = 200;

	var pm = {

		send: function(options) {
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
			var msg = {
				data: o.data,
				type: o.type
			};
			if (o.success) {
				msg.callback = pm._callback(o.success);
			}
			if (o.error) {
				msg.errback = pm._callback(o.error);
			}
			if (("postMessage" in target) && !o.hash) {
				pm._bind();
				target.postMessage(JSON.stringify(msg), o.origin || '*');
			} else {
				pm.hash._bind();
				pm.hash.send(o, msg);
			}
		},

		bind: function(type, fn, origin, hash, async_reply) {
			pm._replyBind(type, fn, origin, hash, async_reply);
		},

		/**
		 * on : syntactic sugar for bind, assumes hash polling is false
		 * and async is true
		 * @param  {string}   type : name of event to bind to
		 * @param  {Function} fn   : callback to execute, expects fn(data, success, error)
		 * @param  {object}   opts : options to pass to bind [hash:false,origin:'*',async:true]
		 */
		on: function(type, fn, opts) {
			opts = opts || {};
			var hash = opts.hash,
				origin = opts.origin || '*',
				async = opts.async || true;
			pm._replyBind(type, fn, origin, hash, async);
		},

		_replyBind: function(type, fn, origin, hash, isCallback) {
			if (("postMessage" in window) && !hash) {
				pm._bind();
			} else {
				pm.hash._bind();
			}
			var l = pm.data("listeners.postmessage");
			if (!l) {
				l = {};
				pm.data("listeners.postmessage", l);
			}
			var fns = l[type];
			if (!fns) {
				fns = [];
				l[type] = fns;
			}
			fns.push({
				fn: fn,
				callback: isCallback,
				origin: origin || $.pm.origin
			});
		},

		unbind: function(type, fn) {
			var l = pm.data("listeners.postmessage");
			if (l) {
				if (type) {
					if (fn) {
						// remove specific listener
						var fns = l[type];
						if (fns) {
							var m = [];
							for (var i = 0, len = fns.length; i < len; i++) {
								var o = fns[i];
								if (o.fn !== fn) {
									m.push(o);
								}
							}
							l[type] = m;
						}
					} else {
						// remove all listeners by type
						delete l[type];
					}
				} else {
					// unbind all listeners of all type
					for (var i in l) {
						delete l[i];
					}
				}
			}
		},

		data: function(k, v) {
			if (v === undefined) {
				return pm._data[k];
			}
			pm._data[k] = v;
			return v;
		},

		_data: {},

		_CHARS: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''),

		_random: function() {
			var r = [];
			for (var i = 0; i < 32; i++) {
				r[i] = pm._CHARS[0 | Math.random() * 32];
			};
			return r.join("");
		},

		_callback: function(fn) {
			var cbs = pm.data("callbacks.postmessage");
			if (!cbs) {
				cbs = {};
				pm.data("callbacks.postmessage", cbs);
			}
			var r = pm._random();
			cbs[r] = fn;
			return r;
		},

		_bind: function() {
			// are we already listening to message events on this w?
			if (!pm.data("listening.postmessage")) {
				if (window.addEventListener) {
					window.addEventListener("message", pm._dispatch, false);
				} else if (window.attachEvent) {
					window.attachEvent("onmessage", pm._dispatch);
				}
				pm.data("listening.postmessage", 1);
			}
		},

		_dispatch: function(e) {
			var src = e.source;
			try {
				var msg = JSON.parse(e.data);
			} catch (ex) {
				console.warn("postmessage data invalid json: ", ex);
				return;
			}
			if (!msg.type) {
				console.warn("postmessage message type required");
				return;
			}
			var cbs = pm.data("callbacks.postmessage") || {},
				cb = cbs[msg.type];
			if (cb) {
				cb(msg.data);
			} else {
				var l = pm.data("listeners.postmessage") || {};
				var fns = l[msg.type] || [];
				for (var i = 0, len = fns.length; i < len; i++) {
					var o = fns[i];

					if (o.origin && ((o.origin instanceof Array && o.origin.indexOf(e.origin) === -1) || ((typeof(o.origin) === 'string' || o.origin instanceof String) && o.origin !== '*' && e.origin !== o.origin))) {
						console.warn("postmessage message origin mismatch", e.origin, o.origin);
						if (msg.errback) {
							// notify post message errback
							var error = {
								message: "postmessage origin mismatch",
								origin: [e.origin, o.origin]
							};
							pm.send({
								target: e.source,
								data: error,
								type: msg.errback
							});
						}
						continue;
					}

					function sendReply(data) {
						if (msg.callback) {
							pm.send({
								target: src,
								data: data,
								type: msg.callback
							});
						}
					}

					function sendError(ex) {
						if (msg.errback) {
							pm.send({
								target: src,
								data: ex,
								type: msg.errback
							});
						}
					}

					try {
						if (o.callback) {
							o.fn(msg.data, sendReply, sendError, e);
						} else {
							sendReply(o.fn(msg.data, e));
						}
					} catch (ex) {
						if (msg.errback) {
							sendError(ex);
							// notify post message errback
							//pm.send({target:src, data:ex, type:msg.errback});
						} else {
							throw ex;
						}
					}
				};
			}
		}
	};

	// location hash polling
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
			} else {
				try {
					for (var i = 0, len = parent.frames.length; i < len; i++) {
						var f = parent.frames[i];
						if (f == window) {
							source_window = i;
							break;
						}
					};
				} catch (ex) {
					// Opera: security error trying to access parent.frames x-origin
					// juse use window.name
					source_window = window.name;
				}
			}
			if (source_window == null) {
				console.warn("postmessage windows must be direct parent/child windows and the child must be available through the parent window.frames list");
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
			var hash_id = "#x-postmessage-id=" + pm._random();
			target_window.location = target_url + hash_id + encodeURIComponent(JSON.stringify(hashmessage));
		},

		_regex: /^\#x\-postmessage\-id\=(\w{32})/,

		_regex_len: "#x-postmessage-id=".length + 32,

		_bind: function() {
			// are we already listening to message events on this w?
			if (!pm.data("polling.postmessage")) {
				setInterval(function() {
					var hash = "" + window.location.hash,
						m = pm.hash._regex.exec(hash);
					if (m) {
						var id = m[1];
						if (pm.hash._last !== id) {
							pm.hash._last = id;
							pm.hash._dispatch(hash.substring(pm.hash._regex_len));
						}
					}
				}, $.pm.poll || 200);
				pm.data("polling.postmessage", 1);
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
			} catch (ex) {
				// ignore since hash could've come from somewhere else
				return;
			}
			var msg = hash.postmessage,
				cbs = pm.data("callbacks.postmessage") || {},
				cb = cbs[msg.type];
			if (cb) {
				cb(msg.data);
			} else {
				var source_window;
				if (hash.source.name === "parent") {
					source_window = window.parent;
				} else {
					source_window = window.frames[hash.source.name];
				}
				var l = pm.data("listeners.postmessage") || {};
				var fns = l[msg.type] || [];
				for (var i = 0, len = fns.length; i < len; i++) {
					var o = fns[i];
					if (o.origin) {
						var origin = /https?\:\/\/[^\/]*/.exec(hash.source.url)[0];
						if ((o.origin instanceof Array && o.origin.indexOf(origin) === -1) || ((typeof(o.origin) === 'string' || o.origin instanceof String) && o.origin !== '*' && origin !== o.origin)) {
							//if (o.origin !== '*' && origin !== o.origin) {
							console.warn("postmessage message origin mismatch", origin, o.origin);
							if (msg.errback) {
								// notify post message errback
								var error = {
									message: "postmessage origin mismatch",
									origin: [origin, o.origin]
								};
								pm.send({
									target: source_window,
									data: error,
									type: msg.errback,
									hash: true,
									url: hash.source.url
								});
							}
							continue;
						}
					}

					function sendReply(data) {
						if (msg.callback) {
							pm.send({
								target: source_window,
								data: data,
								type: msg.callback,
								hash: true,
								url: hash.source.url
							});
						}
					}

					function sendError(ex) {
						if (msg.errback) {
							pm.send({
								target: source_window,
								data: ex,
								type: msg.errback,
								hash: true,
								url: hash.source.url
							});
						}
					}

					try {
						if (o.callback) {
							o.fn(msg.data, sendReply, sendError);
						} else {
							sendReply(o.fn(msg.data));
						}
					} catch (ex) {
						if (msg.errback) {
							// notify post message errback
							//pm.send({target:source_window, data:ex, type:msg.errback, hash:true, url:hash.source.url});
							sendError(ex);
						} else {
							throw ex;
						}
					}
				};
			}
		},

		_url: function(url) {
			// url minus hash part
			return ("" + url).replace(/#.*$/, "");
		}

	};

	$.extend(pm, {
		defaults: {
			target: null,
			/* target window (required) */
			url: null,
			/* target window url (required if no window.postMessage or hash == true) */
			type: null,
			/* message type (required) */
			data: null,
			/* message data (required) */
			success: null,
			/* success callback (optional) */
			error: null,
			/* error callback (optional) */
			origin: "*",
			/* postmessage origin (optional) */
			hash: false /* use location hash for message passing (optional) */
		}
	});

})(this, typeof jQuery === "undefined" ? NO_JQUERY : jQuery);

/**
 * http://www.JSON.org/json2.js
 **/
if (!("JSON" in window && window.JSON)) {
	JSON = {}
}(function() {
	function f(n) {
		return n < 10 ? "0" + n : n
	}
	if (typeof Date.prototype.toJSON !== "function") {
		Date.prototype.toJSON = function(key) {
			return this.getUTCFullYear() + "-" + f(this.getUTCMonth() + 1) + "-" + f(this.getUTCDate()) + "T" + f(this.getUTCHours()) + ":" + f(this.getUTCMinutes()) + ":" + f(this.getUTCSeconds()) + "Z"
		};
		String.prototype.toJSON = Number.prototype.toJSON = Boolean.prototype.toJSON = function(key) {
			return this.valueOf()
		}
	}
	var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
		escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
		gap, indent, meta = {
			"\b": "\\b",
			"\t": "\\t",
			"\n": "\\n",
			"\f": "\\f",
			"\r": "\\r",
			'"': '\\"',
			"\\": "\\\\"
		}, rep;

	function quote(string) {
		escapable.lastIndex = 0;
		return escapable.test(string) ? '"' + string.replace(escapable, function(a) {
			var c = meta[a];
			return typeof c === "string" ? c : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4)
		}) + '"' : '"' + string + '"'
	}

	function str(key, holder) {
		var i, k, v, length, mind = gap,
			partial, value = holder[key];
		if (value && typeof value === "object" && typeof value.toJSON === "function") {
			value = value.toJSON(key)
		}
		if (typeof rep === "function") {
			value = rep.call(holder, key, value)
		}
		switch (typeof value) {
			case "string":
				return quote(value);
			case "number":
				return isFinite(value) ? String(value) : "null";
			case "boolean":
			case "null":
				return String(value);
			case "object":
				if (!value) {
					return "null"
				}
				gap += indent;
				partial = [];
				if (Object.prototype.toString.apply(value) === "[object Array]") {
					length = value.length;
					for (i = 0; i < length; i += 1) {
						partial[i] = str(i, value) || "null"
					}
					v = partial.length === 0 ? "[]" : gap ? "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]" : "[" + partial.join(",") + "]";
					gap = mind;
					return v
				}
				if (rep && typeof rep === "object") {
					length = rep.length;
					for (i = 0; i < length; i += 1) {
						k = rep[i];
						if (typeof k === "string") {
							v = str(k, value);
							if (v) {
								partial.push(quote(k) + (gap ? ": " : ":") + v)
							}
						}
					}
				} else {
					for (k in value) {
						if (Object.hasOwnProperty.call(value, k)) {
							v = str(k, value);
							if (v) {
								partial.push(quote(k) + (gap ? ": " : ":") + v)
							}
						}
					}
				}
				v = partial.length === 0 ? "{}" : gap ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}" : "{" + partial.join(",") + "}";
				gap = mind;
				return v
		}
	}
	if (typeof JSON.stringify !== "function") {
		JSON.stringify = function(value, replacer, space) {
			var i;
			gap = "";
			indent = "";
			if (typeof space === "number") {
				for (i = 0; i < space; i += 1) {
					indent += " "
				}
			} else {
				if (typeof space === "string") {
					indent = space
				}
			}
			rep = replacer;
			if (replacer && typeof replacer !== "function" && (typeof replacer !== "object" || typeof replacer.length !== "number")) {
				throw new Error("JSON.stringify")
			}
			return str("", {
				"": value
			})
		}
	}
	if (typeof JSON.parse !== "function") {
		JSON.parse = function(text, reviver) {
			var j;

			function walk(holder, key) {
				var k, v, value = holder[key];
				if (value && typeof value === "object") {
					for (k in value) {
						if (Object.hasOwnProperty.call(value, k)) {
							v = walk(value, k);
							if (v !== undefined) {
								value[k] = v
							} else {
								delete value[k]
							}
						}
					}
				}
				return reviver.call(holder, key, value)
			}
			cx.lastIndex = 0;
			if (cx.test(text)) {
				text = text.replace(cx, function(a) {
					return "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4)
				})
			}
			if (/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {
				j = eval("(" + text + ")");
				return typeof reviver === "function" ? walk({
					"": j
				}, "") : j
			}
			throw new SyntaxError("JSON.parse")
		}
	}
}());
/**
 * Array.indexOf
 * Taken From https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
 **/
if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function(c) {
		if (this == null) {
			throw new TypeError()
		}
		var d = Object(this);
		var a = d.length >>> 0;
		if (a === 0) {
			return -1
		}
		var e = 0;
		if (arguments.length > 0) {
			e = Number(arguments[1]);
			if (e != e) {
				e = 0
			} else {
				if (e != 0 && e != Infinity && e != -Infinity) {
					e = (e > 0 || -1) * Math.floor(Math.abs(e))
				}
			}
		}
		if (e >= a) {
			return -1
		}
		var b = e >= 0 ? e : Math.max(a - Math.abs(e), 0);
		for (; b < a; b++) {
			if (b in d && d[b] === c) {
				return b
			}
		}
		return -1
	}
};
