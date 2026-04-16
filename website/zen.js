const __mods = Object.create(null);
function __def(id, fn){ __mods[id] = { fn: fn, exports: {}, loaded: false }; }
function __req(id){ var mod = __mods[id]; if(!mod){ throw new Error('Missing module: ' + id); } if(!mod.loaded){ mod.loaded = true; mod.fn(mod, mod.exports); } return mod.exports; }

__def('./src/zen/base64.js', function(module, __exp){
  // Patch root.btoa/root.atob to use URL-safe base64 (no +//, no padding).
  // Native btoa/atob are available in all modern browsers and Node.js 16+.

    var root = (typeof globalThis !== 'undefined') ? globalThis
      : (typeof global !== 'undefined' ? global
      : (typeof window !== 'undefined' ? window : this));
    var nativeBtoa = root.btoa && root.btoa.bind(root);
    var nativeAtob = root.atob && root.atob.bind(root);
    if (nativeBtoa) {
      root.btoa = function(data) {
        return nativeBtoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      };
    }
    if (nativeAtob) {
      root.atob = function(data) {
        var tmp = data.replace(/-/g, '+').replace(/_/g, '/');
        while (tmp.length % 4) { tmp += '='; }
        return nativeAtob(tmp);
      };
    }
});

__def('./src/zen/array.js', function(module, __exp){
  __req('./src/zen/base64.js');
  // This is Array extended to have .toString(['utf8'|'hex'|'base64'])
  function SeaArray() {}
  Object.assign(SeaArray, { from: Array.from })
  SeaArray.prototype = Object.create(Array.prototype)
  SeaArray.prototype.toString = function(enc, start, end) { enc = enc || 'utf8'; start = start || 0;
    const length = this.length
    if (enc === 'hex') {
      const buf = new Uint8Array(this)
      return [ ...Array(((end && (end + 1)) || length) - start).keys()]
      .map((i) => buf[ i + start ].toString(16).padStart(2, '0')).join('')
    }
    if (enc === 'utf8') {
      return Array.from(
        { length: (end || length) - start },
        (_, i) => String.fromCharCode(this[ i + start])
      ).join('')
    }
    if (enc === 'base64') {
      return btoa(this)
    }
  }

  __exp.default = SeaArray;
});

__def('./src/zen/buffer.js', function(module, __exp){
  __req('./src/zen/base64.js');
  var __array = __req('./src/zen/array.js').default;
  // This is Buffer implementation used in SEA. Functionality is mostly
  // compatible with NodeJS 'safe-buffer' and is used for encoding conversions
  // between binary and 'hex' | 'utf8' | 'base64'
  // See documentation and validation for safe implementation in:
  // https://github.com/feross/safe-buffer#update
  var SeaArray = __array;
  function SafeBuffer(...props) {
    console.warn('new SafeBuffer() is depreciated, please use SafeBuffer.from()')
    return SafeBuffer.from(...props)
  }
  SafeBuffer.prototype = Object.create(Array.prototype)
  Object.assign(SafeBuffer, {
    // (data, enc) where typeof data === 'string' then enc === 'utf8'|'hex'|'base64'
    from() {
      if (!Object.keys(arguments).length || arguments[0]==null) {
        throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
      }
      const input = arguments[0]
      let buf
      if (typeof input === 'string') {
        const enc = arguments[1] || 'utf8'
        if (enc === 'hex') {
          const bytes = input.match(/([\da-fA-F]{2})/g)
          .map((byte) => parseInt(byte, 16))
          if (!bytes || !bytes.length) {
            throw new TypeError('Invalid first argument for type \'hex\'.')
          }
          buf = SeaArray.from(bytes)
        } else if (enc === 'utf8' || 'binary' === enc) { // EDIT BY MARK: I think this is safe, tested it against a couple "binary" strings. This lets SafeBuffer match NodeJS Buffer behavior more where it safely btoas regular strings.
          const length = input.length
          const words = new Uint16Array(length)
          Array.from({ length: length }, (_, i) => words[i] = input.charCodeAt(i))
          buf = SeaArray.from(words)
        } else if (enc === 'base64') {
          const dec = atob(input)
          const length = dec.length
          const bytes = new Uint8Array(length)
          Array.from({ length: length }, (_, i) => bytes[i] = dec.charCodeAt(i))
          buf = SeaArray.from(bytes)
        } else if (enc === 'binary') { // deprecated by above comment
          buf = SeaArray.from(input) // some btoas were mishandled.
        } else {
          console.info('SafeBuffer.from unknown encoding: '+enc)
        }
        return buf
      }
      const byteLength = input.byteLength // what is going on here? FOR MARTTI
      const length = input.byteLength ? input.byteLength : input.length
      if (length) {
        let buf
        if (input instanceof ArrayBuffer) {
          buf = new Uint8Array(input)
        }
        return SeaArray.from(buf || input)
      }
    },
    // This is 'safe-buffer.alloc' sans encoding support
    alloc(length, fill = 0 /*, enc*/ ) {
      return SeaArray.from(new Uint8Array(Array.from({ length: length }, () => fill)))
    },
    // This is normal UNSAFE 'buffer.alloc' or 'new Buffer(length)' - don't use!
    allocUnsafe(length) {
      return SeaArray.from(new Uint8Array(Array.from({ length : length })))
    },
    // This puts together array of array like members
    concat(arr) { // octet array
      if (!Array.isArray(arr)) {
        throw new TypeError('First argument must be Array containing ArrayBuffer or Uint8Array instances.')
      }
      return SeaArray.from(arr.reduce((ret, item) => ret.concat(Array.from(item)), []))
    }
  })
  SafeBuffer.prototype.from = SafeBuffer.from
  SafeBuffer.prototype.toString = SeaArray.prototype.toString

  __exp.default = SafeBuffer;
});

__def('./src/zen/json.js', function(module, __exp){
  function ensureJsonAsync() {
    JSON.parseAsync = JSON.parseAsync || function(text, cb, reviver) {
      try { cb(undefined, JSON.parse(text, reviver)); } catch (error) { cb(error); }
    };
    JSON.stringifyAsync = JSON.stringifyAsync || function(value, cb, replacer, space) {
      try { cb(undefined, JSON.stringify(value, replacer, space)); } catch (error) { cb(error); }
    };
  }

  function parseAsync(text, cb, reviver) {
    ensureJsonAsync();
    return JSON.parseAsync(text, cb, reviver);
  }

  function stringifyAsync(value, cb, replacer, space) {
    ensureJsonAsync();
    return JSON.stringifyAsync(value, cb, replacer, space);
  }

  function createJsonPair(note) {
    const mark = (typeof note === 'function') ? note : function() {};
    return {
      parse: function(text, cb, reviver) {
        const started = +new Date;
        return parseAsync(text, function(error, raw) {
          cb(error, raw, mark(+new Date - started));
        }, reviver);
      },
      json: function(value, cb, replacer, space) {
        const started = +new Date;
        return stringifyAsync(value, function(error, raw) {
          cb(error, raw, mark(+new Date - started));
        }, replacer, space);
      }
    };
  }

  __exp.default = { ensureJsonAsync, parseAsync, stringifyAsync, createJsonPair };
});

__def('./src/zen/shim.js', function(module, __exp){
  var BufferApi = __req('./src/zen/buffer.js').default;
  var jsonAsync = __req('./src/zen/json.js').default;
  const globalScope = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {}));
  const api = { Buffer: globalScope.Buffer || BufferApi };
  const empty = {};

  jsonAsync.ensureJsonAsync();

  api.parse = function(text, reviver) {
    return new Promise(function(resolve, reject) {
      jsonAsync.parseAsync(text, function(error, raw) { error ? reject(error) : resolve(raw); }, reviver);
    });
  };

  api.stringify = function(value, replacer, space) {
    return new Promise(function(resolve, reject) {
      jsonAsync.stringifyAsync(value, function(error, raw) { error ? reject(error) : resolve(raw); }, replacer, space);
    });
  };

  if (!api.TextEncoder) { api.TextEncoder = globalScope.TextEncoder; }
  if (!api.TextDecoder) { api.TextDecoder = globalScope.TextDecoder; }

  api.crypto = globalScope.crypto;
  api.subtle = (globalScope.crypto || empty).subtle || (globalScope.crypto || empty).webkitSubtle;
  api.random = function(len) {
    return api.Buffer.from(api.crypto.getRandomValues(new Uint8Array(api.Buffer.alloc(len))));
  };

  // JS utility shims (ported from gun/shim.js)
  String.random = String.random || function(l, c) {
    var s = '';
    l = l || 24;
    c = c || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
    while (l-- > 0) { s += c.charAt(Math.floor(Math.random() * c.length)); }
    return s;
  };
  String.match = String.match || function(t, o) { var tmp, u;
    if ('string' !== typeof t) { return false; }
    if ('string' == typeof o) { o = {'=': o}; }
    o = o || {};
    tmp = (o['='] || o['*'] || o['>'] || o['<']);
    if (t === tmp) { return true; }
    if (u !== o['=']) { return false; }
    tmp = (o['*'] || o['>']);
    if (t.slice(0, (tmp||'').length) === tmp) { return true; }
    if (u !== o['*']) { return false; }
    if (u !== o['>'] && u !== o['<']) {
      return (t >= o['>'] && t <= o['<']) ? true : false;
    }
    if (u !== o['>'] && t >= o['>']) { return true; }
    if (u !== o['<'] && t <= o['<']) { return true; }
    return false;
  };
  String.hash = String.hash || function(s, c) {
    if (typeof s !== 'string') { return; }
    c = c || 0;
    if (!s.length) { return c; }
    for (var i = 0, l = s.length, n; i < l; ++i) {
      n = s.charCodeAt(i);
      c = ((c<<5)-c)+n;
      c |= 0;
    }
    return c;
  };
  var has = Object.prototype.hasOwnProperty;
  Object.plain = Object.plain || function(o) {
    return o ? (o instanceof Object && o.constructor === Object) || Object.prototype.toString.call(o).match(/^\[object (\w+)\]$/)[1] === 'Object' : false;
  };
  Object.empty = Object.empty || function(o, n) {
    for (var k in o) { if (has.call(o, k) && (!n || -1==n.indexOf(k))) { return false; } }
    return true;
  };
  Object.keys = Object.keys || function(o) {
    var l = [];
    for (var k in o) { if (has.call(o, k)) { l.push(k); } }
    return l;
  };

  function createImmediateFallback(sT, undefinedValue) {
    if (typeof MessageChannel == ''+undefinedValue) { return sT; }
    var channel = new MessageChannel();
    var fn;
    channel.port1.onmessage = function(e) { '' == e.data && fn(); };
    return function(q) { fn = q; channel.port2.postMessage(''); };
  }

  let undefinedValue;
  const timeoutApi = setTimeout;
  let pollLast = 0;
  let pollSpin = 0;
  let pollActive = 0;
  const immediateApi = (typeof setImmediate !== ''+undefinedValue && setImmediate) || createImmediateFallback(timeoutApi, undefinedValue);
  const clockApi = timeoutApi.check = timeoutApi.check || (typeof performance !== ''+undefinedValue && performance)
  || {now: function() { return +new Date; }};
  timeoutApi.hold = timeoutApi.hold || 9;
  timeoutApi.poll = timeoutApi.poll || function(task) {
    if (pollActive) {
      immediateApi(function() { pollLast = clockApi.now(); pollActive = 1; try { task(); } finally { pollActive = 0; } }, pollSpin=0);
      return;
    }
    if ((timeoutApi.hold >= (clockApi.now() - pollLast)) && pollSpin++ < 3333) {
      pollActive = 1;
      try { task(); } finally { pollActive = 0; }
      return;
    }
    immediateApi(function() { pollLast = clockApi.now(); pollActive = 1; try { task(); } finally { pollActive = 0; } }, pollSpin=0);
  };

  const pollApi = timeoutApi.poll;
  let turnIndex = 0;
  let turnTask;
  let turnQueue = [];
  const drainTurnQueue = function() {
    if (turnTask = turnQueue[turnIndex++]) { turnTask(); }
    if (turnIndex == turnQueue.length || 99 == turnIndex) {
      turnQueue = turn.s = turnQueue.slice(turnIndex);
      turnIndex = 0;
    }
    if (turnQueue.length) { pollApi(drainTurnQueue); }
  };
  const turn = timeoutApi.turn = timeoutApi.turn || function(task) { 1 == turnQueue.push(task) && pollApi(drainTurnQueue); };
  turn.s = turnQueue;

  const turnApi = timeoutApi.turn;
  timeoutApi.each = timeoutApi.each || function(list, fn, done, size) {
    size = size || 9;
    function next(batch, batchLength, result) {
      if (batchLength = (batch = (list||[]).splice(0, size)).length) {
        for (var i = 0; i < batchLength; i++) {
          if (undefinedValue !== (result = fn(batch[i]))) { break; }
        }
        if (undefinedValue === result) { turnApi(next); return; }
      }
      done && done(result);
    }
    next();
  };


  __exp.default = api;
});

__def('./src/zen/valid.js', function(module, __exp){
  let __defaultExport;


  // Valid values are a subset of JSON: null, binary, number (!Infinity), text,
  // or a soul relation. Arrays need special algorithms to handle concurrency,
  // so they are not supported directly. Use an extension that supports them if
  // needed but research their problems first.
  __defaultExport = function(v){
    // "deletes", nulling out keys.
    return v === null ||
  	"string" === typeof v ||
  	"boolean" === typeof v ||
  	// we want +/- Infinity to be, but JSON does not support it, sad face.
  	// can you guess what v === v checks for? ;)
  	("number" === typeof v && v != Infinity && v != -Infinity && v === v) ||
  	(!!v && "string" == typeof v["#"] && Object.keys(v).length === 1 && v["#"]);
  }


  __exp.default = __defaultExport;
});

__def('./src/zen/state.js', function(module, __exp){
  __req('./src/zen/shim.js');
  let __defaultExport;

      function State(){
          var t = +new Date;
          if(last < t){
              return N = 0, last = t + State.drift;
          }
          return last = t + ((N += 1) / D) + State.drift;
      }
      State.drift = 0;
      var NI = -Infinity, N = 0, D = 999, last = NI, u; // WARNING! In the future, on machines that are D times faster than 2016AD machines, you will want to increase D by another several orders of magnitude so the processing speed never out paces the decimal resolution (increasing an integer effects the state accuracy).
      State.is = function(n, k, o){ // convenience function to get the state on a key on a node and return it.
          var tmp = (k && n && n._ && n._['>']) || o;
          if(!tmp){ return }
          return ('number' == typeof (tmp = tmp[k]))? tmp : NI;
      }
      State.ify = function(n, k, s, v, soul){ // put a key's state on a node.
          (n = n || {})._ = n._ || {}; // safety check or init.
          if(soul){ n._['#'] = soul } // set a soul if specified.
          var tmp = n._['>'] || (n._['>'] = {}); // grab the states data.
          if(u !== k && k !== '_'){
              if('number' == typeof s){ tmp[k] = s } // add the valid state.
              if(u !== v){ n[k] = v } // Note: Not its job to check for valid values!
          }
          return n;
      }
      __defaultExport = State;

  __exp.default = __defaultExport;
});

__def('./src/zen/onto.js', function(module, __exp){
  let __defaultExport;


  // On event emitter generic javascript utility.
  __defaultExport = function onto(tag, arg, as){
  	if(!tag){ return {to: onto} }
  	var u, f = 'function' == typeof arg, tag = (this.tag || (this.tag = {}))[tag] || f && (
  		this.tag[tag] = {tag: tag, to: onto._ = { next: function(arg){ var tmp;
  			if(tmp = this.to){ tmp.next(arg) }
  	}}});
  	if(f){
  		var be = {
  			off: onto.off ||
  			(onto.off = function(){
  				if(this.next === onto._.next){ return !0 }
  				if(this === this.the.last){
  					this.the.last = this.back;
  				}
  				this.to.back = this.back;
  				this.next = onto._.next;
  				this.back.to = this.to;
  				if(this.the.last === this.the){
  					delete this.on.tag[this.the.tag];
  				}
  			}),
  			to: onto._,
  			next: arg,
  			the: tag,
  			on: this,
  			as: as,
  		};
  		(be.back = tag.last || tag).to = be;
  		return tag.last = be;
  	}
  	if((tag = tag.to) && u !== arg){ tag.next(arg) }
  	return tag;
  };


  __exp.default = __defaultExport;
});

__def('./src/zen/dup.js', function(module, __exp){
  __req('./src/zen/shim.js');
  let __defaultExport;

      function Dup(opt){
          var dup = {s:{}}, s = dup.s;
          opt = opt || {max: 999, age: 1000 * 9};//*/ 1000 * 9 * 3};
          dup.check = function(id){
              if(!s[id]){ return false }
              return dt(id);
          }
          var dt = dup.track = function(id){
              var it = s[id] || (s[id] = {});
              it.was = dup.now = +new Date;
              if(!dup.to){ dup.to = setTimeout(dup.drop, opt.age + 9) }
              if(dt.ed){ dt.ed(id) }
              return it;
          }
          dup.drop = function(age){
              dup.to = null;
              dup.now = +new Date;
              var l = Object.keys(s);
              console.STAT && console.STAT(dup.now, +new Date - dup.now, 'dup drop keys'); // prev ~20% CPU 7% RAM 300MB // now ~25% CPU 7% RAM 500MB
              setTimeout.each(l, function(id){ var it = s[id]; // TODO: .keys( is slow?
                  if(it && (age || opt.age) > (dup.now - it.was)){ return }
                  delete s[id];
              },0,99);
          }
          return dup;
      }
      __defaultExport = Dup;

  __exp.default = __defaultExport;
});

__def('./src/zen/ask.js', function(module, __exp){
  __req('./src/zen/onto.js');
  let __defaultExport;

      __defaultExport = function ask(cb, as){
          if(!this.on){ return }
          var lack = (this.opt||{}).lack || 9000;
          if(!('function' == typeof cb)){
              if(!cb){ return }
              var id = cb['#'] || cb, tmp = (this.tag||'')[id];
              if(!tmp){ return }
              if(as){
                  tmp = this.on(id, as);
                  clearTimeout(tmp.err);
                  tmp.err = setTimeout(function(){ tmp.off() }, lack);
              }
              return true;
          }
          var id = (as && as['#']) || random(9);
          if(!cb){ return id }
          var to = this.on(id, cb, as);
          to.err = to.err || setTimeout(function(){ to.off();
              to.next({err: "Error: No ACK yet.", lack: true});
          }, lack);
          return id;
      }
      var random = String.random || function(){ return Math.random().toString(36).slice(2) }

  __exp.default = __defaultExport;
});

__def('./src/zen/root.js', function(module, __exp){
  __req('./src/zen/shim.js');
  var __valid = __req('./src/zen/valid.js').default;
  var __state = __req('./src/zen/state.js').default;
  var __onto = __req('./src/zen/onto.js').default;
  var __dup = __req('./src/zen/dup.js').default;
  var __ask = __req('./src/zen/ask.js').default;
  let __defaultExport;

      function Zen(o){
          if(o instanceof Zen){ return (this._ = {$: this}).$ }
          if(!(this instanceof Zen)){ return new Zen(o) }
          return Zen.create(this._ = {$: this, opt: o});
      }

      Zen.is = function($){ return ($ instanceof Zen) || ($ && $._ && ($ === $._.$)) || false }

      Zen.version = 0.2020;

      Zen.chain = Zen.prototype;
      Zen.chain.toJSON = function(){};

      Zen.valid = __valid;
      Zen.state = __state;
      Zen.on = __onto;
      Zen.dup = __dup;
      Zen.ask = __ask;

      {
          Zen.create = function(at){
              at.root = at.root || at;
              at.graph = at.graph || {};
              at.on = at.on || Zen.on;
              at.ask = at.ask || Zen.ask;
              at.dup = at.dup || Zen.dup();
              var zen = at.$.opt(at.opt);
              if(!at.once){
                  at.on('in', universe, at);
                  at.on('out', universe, at);
                  at.on('put', map, at);
                  Zen.on('create', at);
                  at.on('create', at);
              }
              at.once = 1;
              return zen;
          }
          function universe(msg){
              // TODO: BUG! msg.out = null being set!
              //if(!F){ var eve = this; setTimeout(function(){ universe.call(eve, msg,1) },Math.random() * 100);return; } // ADD F TO PARAMS!
              if(!msg){ return }
              if(msg.out === universe){ this.to.next(msg); return }
              var eve = this, as = eve.as, at = as.at || as, zen = at.$, dup = at.dup, tmp, DBG = msg.DBG;
              (tmp = msg['#']) || (tmp = msg['#'] = text_rand(9));
              if(dup.check(tmp)){ return } dup.track(tmp);
              tmp = msg._; msg._ = ('function' == typeof tmp)? tmp : function(){};
              (msg.$ && (msg.$ === (msg.$._||'').$)) || (msg.$ = zen);
              if(msg['@'] && !msg.put){ ack(msg) }
              if(!at.ask(msg['@'], msg)){ // is this machine listening for an ack?
                  DBG && (DBG.u = +new Date);
                  if(msg.put){ put(msg); return } else
                  if(msg.get){ Zen.on.get(msg, zen) }
              }
              DBG && (DBG.uc = +new Date);
              eve.to.next(msg);
              DBG && (DBG.ua = +new Date);
              if(msg.nts || msg.NTS){ return } // TODO: This shouldn't be in core, but fast way to prevent NTS spread. Delete this line after all peers have upgraded to newer versions.
              msg.out = universe; at.on('out', msg);
              DBG && (DBG.ue = +new Date);
          }
          function put(msg){
              if(!msg){ return }
              var ctx = msg._||'', root = ctx.root = ((ctx.$ = msg.$||'')._||'').root;
              if(msg['@'] && ctx.faith && !ctx.miss){ // TODO: AXE may split/route based on 'put' what should we do here? Detect @ in AXE? I think we don't have to worry, as DAM will route it on @.
                  msg.out = universe;
                  root.on('out', msg);
                  return;
              }
              ctx.latch = root.hatch; ctx.match = root.hatch = [];
              var put = msg.put;
              var DBG = ctx.DBG = msg.DBG, S = +new Date; courtesyTime = courtesyTime || S;
              if(put['#'] && put['.']){ /*root && root.on('put', msg);*/ return } // TODO: BUG! This needs to call HAM instead.
              DBG && (DBG.p = S);
              ctx['#'] = msg['#'];
              ctx.msg = msg;
              ctx.all = 0;
              ctx.stun = 1;
              var nl = Object.keys(put);//.sort(); // TODO: This is unbounded operation, large graphs will be slower. Write our own CPU scheduled sort? Or somehow do it in below? Keys itself is not O(1) either, create ES5 shim over ?weak map? or custom which is constant.
              console.STAT && console.STAT(S, ((DBG||ctx).pk = +new Date) - S, 'put sort');
              var ni = 0, nj, kl, soul, node, states, err, tmp;
              function pop(o){
                  if(nj != ni){ nj = ni;
                      if(!(soul = nl[ni])){
                          console.STAT && console.STAT(S, ((DBG||ctx).pd = +new Date) - S, 'put');
                          fire(ctx);
                          return;
                      }
                      if(!(node = put[soul])){ err = ERR+cut(soul)+"no node." } else
                      if(!(tmp = node._)){ err = ERR+cut(soul)+"no meta." } else
                      if(soul !== tmp['#']){ err = ERR+cut(soul)+"soul not same." } else
                      if(!(states = tmp['>'])){ err = ERR+cut(soul)+"no state." }
                      kl = Object.keys(node||{}); // TODO: .keys( is slow
                  }
                  if(err){
                      msg.err = ctx.err = err; // invalid data should error and stun the message.
                      fire(ctx);
                      //console.log("handle error!", err) // handle!
                      return;
                  }
                  var i = 0, key; o = o || 0;
                  while(o++ < 9 && (key = kl[i++])){
                      if('_' === key){ continue }
                      var val = node[key], state = states[key];
                      if(u === state){ err = ERR+cut(key)+"on"+cut(soul)+"no state."; break }
                      if(!valid(val)){ err = ERR+cut(key)+"on"+cut(soul)+"bad "+(typeof val)+cut(val); break }
                      //ctx.all++; //ctx.ack[soul+key] = '';
                      ham(val, key, soul, state, msg);
                      ++courtesy; // courtesy count;
                  }
                  if((kl = kl.slice(i)).length){ turn(pop); return }
                  ++ni; kl = null; pop(o);
              }
              pop();
          } Zen.on.put = put;
          // TODO: MARK!!! clock below, reconnect sync, SEA certify wire merge, User.auth taking multiple times, // msg put, put, say ack, hear loop...
          // WASIS BUG! local peer not ack. .off other people: .open
          function ham(val, key, soul, state, msg){
              var ctx = msg._||'', root = ctx.root, graph = root.graph, lot, tmp;
              var vertex = graph[soul] || empty, was = state_is(vertex, key, 1), known = vertex[key];

              var DBG = ctx.DBG; if(tmp = console.STAT){ if(!graph[soul] || !known){ tmp.has = (tmp.has || 0) + 1 } }

              var now = State(), u;
              if(state > now){
                  if((tmp = state - now) > Ham.max){
                      msg.err = ctx.err = ERR+cut(key)+"on"+cut(soul)+"state too far in future."; fire(ctx); back(ctx); return;
                  }
                  setTimeout(function(){ ham(val, key, soul, state, msg) }, tmp > MD? MD : tmp); // Max Defer 32bit. :(
                  console.STAT && console.STAT(((DBG||ctx).Hf = +new Date), tmp, 'future');
                  return;
              }
              if(state < was){ /*old;*/ if(true || !ctx.miss){ return } } // but some chains have a cache miss that need to re-fire. // TODO: Improve in future. // for AXE this would reduce rebroadcast, but ZEN does it on message forwarding. // TURNS OUT CACHE MISS WAS NOT NEEDED FOR NEW CHAINS ANYMORE!!! DANGER DANGER DANGER, ALWAYS RETURN! (or am I missing something?)
              if(!ctx.faith){ // TODO: BUG? Can this be used for cache miss as well? // Yes this was a bug, need to check cache miss for RAD tests, but should we care about the faith check now? Probably not.
                  if(state === was && (val === known || L(val) <= L(known))){ /*console.log("same");*/ /*same;*/ if(!ctx.miss){ return } } // same
              }
              ctx.stun++; // TODO: 'forget' feature in SEA tied to this, bad approach, but hacked in for now. Any changes here must update there.
              var aid = msg['#']+ctx.all++, id = {toString: function(){ return aid }, _: ctx}; id.toJSON = id.toString; // this *trick* makes it compatible between old & new versions.
              root.dup.track(id)['#'] = msg['#']; // fixes new OK acks for RPC like RTC.
              DBG && (DBG.ph = DBG.ph || +new Date);
              root.on('put', {'#': id, '@': msg['@'], put: {'#': soul, '.': key, ':': val, '>': state}, ok: msg.ok, _: ctx});
          }
          function map(msg){
              var DBG; if(DBG = (msg._||'').DBG){ DBG.pa = +new Date; DBG.pm = DBG.pm || +new Date}
              var eve = this, root = eve.as, graph = root.graph, ctx = msg._, put = msg.put, soul = put['#'], key = put['.'], val = put[':'], state = put['>'], id = msg['#'], tmp;
              if((tmp = ctx.msg) && (tmp = tmp.put) && (tmp = tmp[soul])){ state_ify(tmp, key, state, val, soul) } // necessary! or else out messages do not get SEA transforms.
              //var bytes = ((graph[soul]||'')[key]||'').length||1;
              graph[soul] = state_ify(graph[soul], key, state, val, soul);
              if(tmp = (root.next||'')[soul]){
                  //tmp.bytes = (tmp.bytes||0) + ((val||'').length||1) - bytes;
                  //if(tmp.bytes > 2**13){ Zen.log.once('byte-limit', "Note: In the future, ZEN peers will enforce a ~4KB query limit. Please see https://zen.eco/docs/Page") }
                  tmp.on('in', msg)
              }
              fire(ctx);
              eve.to.next(msg);
          }
          function fire(ctx, msg){ var root;
              if(ctx.stop){ return }
              if(0 < --ctx.stun && !ctx.err){ return } // decrement always runs; early-return only if stun still positive AND no error.
              ctx.stop = 1;
              if(!(root = ctx.root)){ return }
              var tmp = ctx.match; tmp.end = 1;
              if(tmp === root.hatch){ if(!(tmp = ctx.latch) || tmp.end){ delete root.hatch } else { root.hatch = tmp } }
              ctx.hatch && ctx.hatch(); // TODO: rename/rework how put & this interact.
              setTimeout.each(ctx.match, function(cb){cb && cb()}); 
              if(!(msg = ctx.msg) || ctx.err || msg.err){ return }
              msg.out = universe;
              ctx.root.on('out', msg);

              courtesyCheck(); // courtesy check;
          }
          function ack(msg){ // aggregate ACKs.
              var id = msg['@'] || '', ctx, ok, tmp;
              if(!(ctx = id._)){
                  var dup = (dup = msg.$) && (dup = dup._) && (dup = dup.root) && (dup = dup.dup);
                  if(!(dup = dup.check(id))){ return }
                  msg['@'] = dup['#'] || msg['@']; // This doesn't do anything anymore, backtrack it to something else?
                  return;
              }
              ctx.acks = (ctx.acks||0) + 1;
              if(ctx.err = msg.err){
                  msg['@'] = ctx['#'];
                  fire(ctx); // TODO: BUG? How it skips/stops propagation of msg if any 1 item is error, this would assume a whole batch/resync has same malicious intent.
              }
              ctx.ok = msg.ok || ctx.ok;
              if(!ctx.stop && !ctx.crack){ ctx.crack = ctx.match && ctx.match.push(function(){back(ctx)}) } // handle synchronous acks. NOTE: If a storage peer ACKs synchronously then the PUT loop has not even counted up how many items need to be processed, so ctx.STOP flags this and adds only 1 callback to the end of the PUT loop.
              back(ctx);
          }
          function back(ctx){
              if(!ctx || !ctx.root){ return }
              if(ctx.stun || (ctx.acks||0) !== ctx.all){ return } // normalize acks: undefined treated as 0 before first storage ack arrives.
              ctx.root.on('in', {'@': ctx['#'], err: ctx.err, ok: ctx.err? u : ctx.ok || {'':1}});
          }

          var ERR = "Error: Invalid graph!";
          var cut = function(s){ return " '"+(''+s).slice(0,9)+"...' " }
          var L = JSON.stringify, MD = 2147483647, State = Zen.state;
          var Ham = ham; Ham.max = 1000 * 60 * 60 * 24 * 7; // 1 week: legit clock skew is seconds, not days.
          let courtesy = 0, courtesyTime, courtesyCheck = function(){
              if(courtesy > 999 && (courtesy / -(courtesyTime - (courtesyTime = +new Date)) > 1)){
                  Zen.window && console.log("Warning: You're syncing 1K+ records a second, faster than DOM can update - consider limiting query.");
                  courtesyCheck = function(){ courtesy = 0 };
              }
          };

      }

      {
          Zen.on.get = function(msg, zen){
              var root = zen._, get = msg.get, soul = get['#'], node = root.graph[soul], has = get['.'];
              var next = root.next || (root.next = {}), at = next[soul];

              // TODO: Azarattum bug, what is in graph is not same as what is in next. Fix!

              // queue concurrent GETs?
              // TODO: consider tagging original message into dup for DAM.
              // TODO: ^ above? In chat app, 12 messages resulted in same peer asking for `#user.pub` 12 times. (same with #user GET too, yipes!) // DAM note: This also resulted in 12 replies from 1 peer which all had same ##hash but none of them deduped because each get was different.
              // TODO: Moving quick hacks fixing these things to axe for now.
              // TODO: a lot of GET #foo then GET #foo."" happening, why?
              // TODO: DAM's ## hash check, on same get ACK, producing multiple replies still, maybe JSON vs YSON?
              // TMP note for now: viMZq1slG was chat LEX query #.
              /*if(zen !== (tmp = msg.$) && (tmp = (tmp||'')._)){
                  if(tmp.Q){ tmp.Q[msg['#']] = ''; return } // chain does not need to ask for it again.
                  tmp.Q = {};
              }*/
              /*if(u === has){
                  if(at.Q){
                      //at.Q[msg['#']] = '';
                      //return;
                  }
                  at.Q = {};
              }*/
              var ctx = msg._||{}, DBG = ctx.DBG = msg.DBG;
              DBG && (DBG.g = +new Date);
              //console.log("GET:", get, node, has, at);
              //if(!node && !at){ return root.on('get', msg) }
              //if(has && node){ // replace 2 below lines to continue dev?
              if(!node){ return root.on('get', msg) }
              if(has){
                  if('string' != typeof has || u === node[has]){
                      if(!((at||'').next||'')[has]){ root.on('get', msg); return }
                  }
                  node = state_ify({}, has, state_is(node, has), node[has], soul);
                  // If we have a key in-memory, do we really need to fetch?
                  // Maybe... in case the in-memory key we have is a local write
                  // we still need to trigger a pull/merge from peers.
              }
              //Zen.window? Zen.obj.copy(node) : node; // HNPERF: If !browser bump Performance? Is this too dangerous to reference root graph? Copy / shallow copy too expensive for big nodes. Zen.obj.to(node); // 1 layer deep copy // Zen.obj.copy(node); // too slow on big nodes
              node && ack(msg, node);
              root.on('get', msg); // send GET to storage adapters.
          }
          function ack(msg, node){
              var S = +new Date, ctx = msg._||{}, DBG = ctx.DBG = msg.DBG;
              var to = msg['#'], id = text_rand(9), keys = Object.keys(node||'').sort(), soul = ((node||'')._||'')['#'], kl = keys.length, j = 0, root = msg.$._.root, F = (node === root.graph[soul]);
              console.STAT && console.STAT(S, ((DBG||ctx).gk = +new Date) - S, 'got keys');
              // PERF: Consider commenting this out to force disk-only reads for perf testing? // TODO: .keys( is slow
              function go(){
                  S = +new Date;
                  var i = 0, k, put = {}, tmp;
                  while(i < 9 && (k = keys[i++])){
                      state_ify(put, k, state_is(node, k), node[k], soul);
                  }
                  keys = keys.slice(i);
                  (tmp = {})[soul] = put; put = tmp;
                  var faith; if(F){ faith = function(){}; faith.ram = faith.faith = true; } // HNPERF: We're testing performance improvement by skipping going through security again, but this should be audited.
                  tmp = keys.length;
                  console.STAT && console.STAT(S, -(S - (S = +new Date)), 'got copied some');
                  DBG && (DBG.ga = +new Date);
                  root.on('in', {'@': to, '#': id, put: put, '%': (tmp? (id = text_rand(9)) : u), $: root.$, _: faith, DBG: DBG});
                  console.STAT && console.STAT(S, +new Date - S, 'got in');
                  if(!tmp){ return }
                  setTimeout.turn(go);
              }
              node && go();
              if(!node){ root.on('in', {'@': msg['#']}) } // TODO: I don't think I like this, the default lS adapter uses this but "not found" is a sensitive issue, so should probably be handled more carefully/individually.
          } Zen.on.get.ack = ack;
      }

      {
          Zen.chain.opt = function(opt){
              opt = opt || {};
              var zen = this, at = zen._, tmp = opt.peers || opt;
              if(!Object.plain(opt)){ opt = {} }
              if(!Object.plain(at.opt)){ at.opt = opt }
              if('string' == typeof tmp){ tmp = [tmp] }
              if(!Object.plain(at.opt.peers)){ at.opt.peers = {}}
              if(tmp instanceof Array){
                  opt.peers = {};
                  tmp.forEach(function(url){
                      var p = {}; p.id = p.url = url;
                      opt.peers[url] = at.opt.peers[url] = at.opt.peers[url] || p;
                  })
              }
              obj_each(opt, function each(k){ var v = this[k];
                  if((this && this.hasOwnProperty(k)) || 'string' == typeof v || Object.empty(v)){ this[k] = v; return }
                  if(v && v.constructor !== Object && !(v instanceof Array)){ return }
                  obj_each(v, each);
              });
              at.opt.from = opt;
              Zen.on('opt', at);
              at.opt.uuid = at.opt.uuid || function uuid(l){ return Zen.state().toString(36).replace('.','') + String.random(l||12) }
              return zen;
          }
      }

      var obj_each = function(o,f){ Object.keys(o).forEach(f,o) }, text_rand = String.random, turn = setTimeout.turn, valid = Zen.valid, state_is = Zen.state.is, state_ify = Zen.state.ify, u, empty = {}, C;

      Zen.log = function(){
          var log = C && C.log;
          return (!Zen.log.off && 'function' == typeof log && log.apply(C, arguments)), [].slice.call(arguments).join(' ')
      };
      Zen.log.once = function(w,s,o){ return (o = Zen.log.once)[w] = o[w] || 0, o[w]++ || Zen.log(s) };

      ((typeof globalThis !== "undefined" && typeof window === "undefined" && typeof WorkerGlobalScope !== "undefined") ? ((globalThis.Zen = Zen).window = globalThis) : (typeof window !== "undefined" ? ((window.Zen = Zen).window = window) : undefined));
      ((globalThis.Zen = Zen).globalThis = globalThis);
      try{ if(typeof MODULE !== "undefined"){ MODULE.exports = Zen } }catch(e){}
      __defaultExport = Zen;

      (Zen.window||{}).console = (Zen.window||{}).console || {log: function(){}};
      (C = (typeof console !== 'undefined'? console : {log: function(){}})).only = function(i, s){
          var log = C && C.log;
          return (C.only.i && i === C.only.i && C.only.i++) && (('function' == typeof log && log.apply(C, arguments)) || s)
      };

  __exp.default = __defaultExport;
});

__def('./src/zen/base62.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const ALPHA_MAP = {};
  for (let i = 0; i < ALPHA.length; i++) { ALPHA_MAP[ALPHA[i]] = i; }
  const PUB_LEN = 44;

  function biToB62(n) {
    if (typeof n !== 'bigint' || n < 0n) {
      throw new Error('biToB62: input must be non-negative BigInt');
    }
    let out = '';
    let value = n;
    while (value > 0n) {
      out = ALPHA[Number(value % 62n)] + out;
      value = value / 62n;
    }
    while (out.length < PUB_LEN) { out = '0' + out; }
    if (out.length > PUB_LEN) {
      throw new Error('biToB62: value too large for ' + PUB_LEN + '-char base62');
    }
    return out;
  }

  function b62ToBI(s) {
    if (typeof s !== 'string' || s.length !== PUB_LEN) {
      throw new Error('b62ToBI: expected ' + PUB_LEN + '-char base62 string');
    }
    if (!/^[A-Za-z0-9]+$/.test(s)) {
      throw new Error('b62ToBI: invalid base62 characters');
    }
    let n = 0n;
    for (let i = 0; i < s.length; i++) {
      const c = ALPHA_MAP[s[i]];
      if (c === undefined) { throw new Error('b62ToBI: unknown char ' + s[i]); }
      n = n * 62n + BigInt(c);
    }
    return n;
  }

  function b64ToB62(s) {
    const hex = shim.Buffer.from(atob(s), 'binary').toString('hex');
    return biToB62(BigInt('0x' + (hex || '0')));
  }

  function b62ToB64(s) {
    const n = b62ToBI(s);
    const hex = n.toString(16).padStart(64, '0');
    return shim.Buffer.from(hex, 'hex').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function pubToJwkXY(pub) {
    if (typeof pub !== 'string') {
      throw new Error('pubToJwkXY: pub must be a string');
    }
    if (pub.length === 87 && pub[43] === '.') {
      const parts = pub.split('.');
      if (parts.length !== 2) { throw new Error('pubToJwkXY: invalid old pub format'); }
      return { x: parts[0], y: parts[1] };
    }
    if (pub.length === 88 && /^[A-Za-z0-9]{88}$/.test(pub)) {
      return {
        x: b62ToB64(pub.slice(0, 44)),
        y: b62ToB64(pub.slice(44))
      };
    }
    throw new Error('pubToJwkXY: unrecognised pub format');
  }

  function bufToB62(buf) {
    let out = '';
    for (let i = 0; i < buf.length; i += 32) {
      const end = Math.min(i + 32, buf.length);
      let hex = '';
      for (let p = 0; p < 32 - (end - i); p++) { hex += '00'; }
      for (let j = i; j < end; j++) {
        hex += ('0' + buf[j].toString(16)).slice(-2);
      }
      out += biToB62(BigInt('0x' + hex));
    }
    return out;
  }

  const base62 = { biToB62, b62ToBI, b64ToB62, b62ToB64, pubToJwkXY, bufToB62, PUB_LEN };
  __exp.default = base62;
});

__def('./src/zen/settings.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  var base62 = __req('./src/zen/base62.js').default;
  const settings = {};
  settings.pbkdf2 = { hash: { name: 'SHA-256' }, iter: 100000, ks: 64 };
  settings.ecdsa = {
    pair: { name: 'ECDSA', namedCurve: 'secp256k1' },
    sign: { name: 'ECDSA', hash: { name: 'SHA-256' } }
  };
  settings.ecdh = { name: 'ECDH', namedCurve: 'secp256k1' };

  settings.jwk = function(pub, d) {
    const xy = base62.pubToJwkXY(pub);
    const jwk = { kty: 'EC', crv: 'secp256k1', x: xy.x, y: xy.y, ext: true };
    jwk.key_ops = d ? ['sign'] : ['verify'];
    if (d) { jwk.d = (d.length === 44 && /^[A-Za-z0-9]{44}$/.test(d)) ? base62.b62ToB64(d) : d; }
    return jwk;
  };

  settings.keyToJwk = function(keyBytes) {
    const keyB64 = keyBytes.toString('base64');
    return {
      kty: 'oct',
      k: keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, ''),
      ext: false,
      alg: 'A256GCM'
    };
  };

  settings.check = function(t) {
    if (typeof t !== 'string') { return false; }
    if ('SEA{' === t.slice(0, 4)) { return true; }
    if ('{' !== t.slice(0, 1)) { return false; }
    try {
      const parsed = JSON.parse(t);
      return !!(parsed && (
        (typeof parsed.s === 'string' && Object.prototype.hasOwnProperty.call(parsed, 'm')) ||
        (typeof parsed.ct === 'string' && typeof parsed.iv === 'string' && typeof parsed.s === 'string')
      ));
    } catch (e) {}
    return false;
  };

  settings.parse = async function(t) {
    try {
      const yes = (typeof t === 'string');
      if (yes && 'SEA{' === t.slice(0, 4)) { t = t.slice(3); }
      return yes ? await shim.parse(t) : t;
    } catch (e) {}
    return t;
  };

  __exp.default = settings;
});

__def('./src/zen/sha256.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  async function sha256(data, algorithm) {
    const text = (typeof data === 'string') ? data : await shim.stringify(data);
    const hash = await shim.subtle.digest({ name: algorithm || 'SHA-256' }, new shim.TextEncoder().encode(text));
    return shim.Buffer.from(hash);
  }

  __exp.default = sha256;
});

__def('./src/zen/aeskey.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var sha256 = __req('./src/zen/sha256.js').default;
  async function aeskey(key, salt, opt) {
    opt = opt || {};
    const combo = key + (salt || shim.random(8)).toString('utf8');
    const hash = shim.Buffer.from(await sha256(combo), 'binary');
    const jwkKey = settings.keyToJwk(hash);
    return await shim.subtle.importKey('jwk', jwkKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  __exp.default = aeskey;
});

__def('./src/zen/keccak256.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  const MASK64 = (1n << 64n) - 1n;
  const RATE = 136;
  const OUTPUT_BYTES = 32;
  const SUFFIX = 0x01;
  const ROT = [
    0, 1, 62, 28, 27,
    36, 44, 6, 55, 20,
    3, 10, 43, 25, 39,
    41, 45, 15, 21, 8,
    18, 2, 61, 56, 14
  ];
  const RC = [
    0x0000000000000001n, 0x0000000000008082n,
    0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n,
    0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn,
    0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n,
    0x0000000080000001n, 0x8000000080008008n
  ];

  function rotl64(value, shift) {
    const amount = BigInt(shift & 63);
    if (!amount) { return value & MASK64; }
    return ((value << amount) | (value >> (64n - amount))) & MASK64;
  }

  function keccakF(state) {
    for (let round = 0; round < 24; round++) {
      const c = new Array(5);
      const d = new Array(5);
      const b = new Array(25);

      for (let x = 0; x < 5; x++) {
        c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
      }
      for (let x = 0; x < 5; x++) {
        d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      }
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          state[x + (5 * y)] ^= d[x];
        }
      }

      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const idx = x + (5 * y);
          b[y + (5 * ((2 * x + 3 * y) % 5))] = rotl64(state[idx], ROT[idx]);
        }
      }

      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          state[x + (5 * y)] = b[x + (5 * y)] ^ ((~b[((x + 1) % 5) + (5 * y)]) & b[((x + 2) % 5) + (5 * y)]);
        }
      }

      state[0] ^= RC[round];
    }
  }

  function xorBlock(state, block) {
    for (let i = 0; i < block.length; i++) {
      const lane = Math.floor(i / 8);
      const shift = BigInt((i % 8) * 8);
      state[lane] ^= BigInt(block[i]) << shift;
    }
  }

  function toBytes(data) {
    if (typeof data === 'string') {
      return new shim.TextEncoder().encode(data);
    }
    if (data instanceof Uint8Array) { return data; }
    if (data instanceof ArrayBuffer) { return new Uint8Array(data); }
    if (data && data.buffer instanceof ArrayBuffer) {
      return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
    }
    return new shim.TextEncoder().encode(String(data));
  }

  async function keccak256(data) {
    const bytes = toBytes(data);
    const state = new Array(25).fill(0n);
    let offset = 0;

    while ((offset + RATE) <= bytes.length) {
      xorBlock(state, bytes.subarray(offset, offset + RATE));
      keccakF(state);
      offset += RATE;
    }

    const finalBlock = new Uint8Array(RATE);
    finalBlock.set(bytes.subarray(offset));
    finalBlock[bytes.length - offset] ^= SUFFIX;
    finalBlock[RATE - 1] ^= 0x80;
    xorBlock(state, finalBlock);
    keccakF(state);

    const out = new Uint8Array(OUTPUT_BYTES);
    for (let i = 0; i < OUTPUT_BYTES; i++) {
      const lane = state[Math.floor(i / 8)];
      out[i] = Number((lane >> BigInt((i % 8) * 8)) & 0xffn);
    }
    return shim.Buffer.from(out);
  }

  __exp.default = keccak256;
});

__def('./src/zen/hash.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var sha256 = __req('./src/zen/sha256.js').default;
  var keccak256 = __req('./src/zen/keccak256.js').default;
  var base62 = __req('./src/zen/base62.js').default;
  function normhash(name) {
    const raw = (name || '').toString();
    const slim = raw.toLowerCase().replace(/[\s_-]/g, '');
    if (!slim) { return ''; }
    if (slim === 'keccak' || slim === 'keccak256') { return 'KECCAK-256'; }
    if (slim === 'sha1') { return 'SHA-1'; }
    if (slim === 'sha256') { return 'SHA-256'; }
    if (slim === 'sha384') { return 'SHA-384'; }
    if (slim === 'sha512') { return 'SHA-512'; }
    return raw;
  }

  function ishash(name) {
    const n = normhash(name);
    return n === 'KECCAK-256' || n.indexOf('SHA-') === 0;
  }

  function encbuf(data, enc) {
    if (enc === 'base62') { return base62.bufToB62(data); }
    if (enc === 'base64') { return shim.Buffer.from(data).toString('base64'); }
    return shim.Buffer.from(data).toString(enc);
  }

  async function digest(data, name) {
    const n = normhash(name);
    if (n === 'KECCAK-256') { return keccak256(data); }
    return sha256(data, n || undefined);
  }



  async function hash(data, pair, cb, opt) {
    try {
      opt = opt || {};
      let salt = (pair || {}).epub || pair;
      const enc = opt.encode || 'base62';

      if (salt instanceof Function) {
        cb = salt;
        salt = undefined;
      }
      if (data instanceof ArrayBuffer) {
        data = new Uint8Array(data);
        data = new shim.TextDecoder('utf-8').decode(data);
      }
      data = (typeof data === 'string') ? data : await shim.stringify(data);

      if (ishash(opt.name)) {
        let hashed = shim.Buffer.from(await digest(data, opt.name), 'binary');
        hashed = encbuf(hashed, enc);
        if (cb) { try { cb(hashed); } catch (e) { console.log(e); } }
        return hashed;
      }

      if (typeof salt === 'number') { salt = salt.toString(); }
      if (typeof opt.salt === 'number') { opt.salt = opt.salt.toString(); }
      salt = salt || shim.random(9);

      const key = await (shim.ossl || shim.subtle).importKey('raw', new shim.TextEncoder().encode(data), { name: opt.name || 'PBKDF2' }, false, ['deriveBits']);
      const bits = await (shim.ossl || shim.subtle).deriveBits({
        name: opt.name || 'PBKDF2',
        iterations: opt.iterations || settings.pbkdf2.iter,
        salt: new shim.TextEncoder().encode(opt.salt || salt),
        hash: opt.hash || settings.pbkdf2.hash
      }, key, opt.length || (settings.pbkdf2.ks * 8));
      data = shim.random(data.length);
      let out = shim.Buffer.from(bits, 'binary');
      out = encbuf(out, enc);
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) {
        try { cb(); } catch (cbErr) { console.log(cbErr); }
        return;
      }
      throw e;
    }
  }

  __exp.normhash = normhash;
  __exp.default = hash;
});

__def('./src/zen/curves/utils.js', function(module, __exp){
  function createCurveCore(config) {
    const curve = config.curve;
    const P = config.P;
    const N = config.N;
    const A = config.A;
    const B = config.B;
    const G = config.G;
    const HALF_N = N >> 1n;
    const shim = config.shim;
    const base62 = config.base62;
    const settings = config.settings;
    const sha256 = config.sha256;
    const extras = config.extras || {};

    function mod(a, m) {
      return ((a % m) + m) % m;
    }

    function modPow(base, exp, modn) {
      let result = 1n;
      let value = mod(base, modn);
      let power = exp;
      while (power > 0n) {
        if (power & 1n) { result = mod(result * value, modn); }
        value = mod(value * value, modn);
        power >>= 1n;
      }
      return result;
    }

    function modInv(a, modn) {
      if (!a) { throw new Error('Inverse does not exist'); }
      return modPow(mod(a, modn), modn - 2n, modn);
    }

    function isPoint(point) {
      return !!point && typeof point.x === 'bigint' && typeof point.y === 'bigint';
    }

    function isOnCurve(point) {
      if (!isPoint(point)) { return false; }
      if (point.x < 0n || point.x >= P || point.y < 0n || point.y >= P) { return false; }
      return mod(point.y * point.y - (point.x * point.x * point.x + A * point.x + B), P) === 0n;
    }

    function pointAdd(left, right) {
      if (!left) { return right; }
      if (!right) { return left; }
      if (left.x === right.x && mod(left.y + right.y, P) === 0n) { return null; }
      let slope;
      if (left.x === right.x && left.y === right.y) {
        slope = mod((3n * mod(left.x * left.x, P) + A) * modInv(2n * left.y, P), P);
      } else {
        slope = mod((right.y - left.y) * modInv(right.x - left.x, P), P);
      }
      const x = mod(slope * slope - left.x - right.x, P);
      const y = mod(slope * (left.x - x) - left.y, P);
      return { x, y };
    }

    function pointMultiply(scalar, point) {
      let n = mod(scalar, N);
      if (!n || !point) { return null; }
      let result = null;
      let addend = point;
      while (n > 0n) {
        if (n & 1n) { result = pointAdd(result, addend); }
        addend = pointAdd(addend, addend);
        n >>= 1n;
      }
      return result;
    }

    function bytesToBigInt(bytes) {
      return BigInt('0x' + (Array.from(bytes).map(function(byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('') || '0'));
    }

    function bigIntToBytes(num, length) {
      let hex = num.toString(16);
      if (hex.length % 2) { hex = '0' + hex; }
      const raw = shim.Buffer.from(hex, 'hex');
      if (!length) { return new Uint8Array(raw); }
      if (raw.length > length) { return new Uint8Array(raw.slice(raw.length - length)); }
      const out = new Uint8Array(length);
      out.set(raw, length - raw.length);
      return out;
    }

    function concatBytes() {
      const chunks = Array.prototype.slice.call(arguments).map(function(chunk) {
        if (chunk instanceof Uint8Array) { return chunk; }
        if (Array.isArray(chunk)) { return Uint8Array.from(chunk); }
        if (typeof chunk === 'number') { return Uint8Array.from([chunk]); }
        if (chunk && chunk.buffer instanceof ArrayBuffer) { return new Uint8Array(chunk.buffer, chunk.byteOffset || 0, chunk.byteLength); }
        return new Uint8Array(0);
      });
      const length = chunks.reduce(function(total, chunk) { return total + chunk.length; }, 0);
      const out = new Uint8Array(length);
      let offset = 0;
      chunks.forEach(function(chunk) {
        out.set(chunk, offset);
        offset += chunk.length;
      });
      return out;
    }

    function utf8Bytes(data) {
      if (typeof data === 'string') { return new shim.TextEncoder().encode(data); }
      if (data instanceof Uint8Array) { return data; }
      if (data instanceof ArrayBuffer) { return new Uint8Array(data); }
      if (data && data.buffer instanceof ArrayBuffer) {
        return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
      }
      return new shim.TextEncoder().encode(String(data));
    }

    function decodeBase64Url(str) {
      const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
      return new Uint8Array(shim.Buffer.from(padded, 'base64'));
    }

    function encodeBase64(bytes, encoding) {
      return shim.Buffer.from(bytes).toString(encoding || 'base64');
    }

    function assertScalar(value, name) {
      if (value <= 0n || value >= N) {
        throw new Error((name || 'Scalar') + ' out of range');
      }
      return value;
    }

    function parseScalar(value, name) {
      if (typeof value === 'bigint') { return assertScalar(value, name); }
      if (typeof value !== 'string' || !value) { throw new Error((name || 'Scalar') + ' must be a string'); }
      const scalar = (/^[A-Za-z0-9]{44}$/.test(value))
        ? base62.b62ToBI(value)
        : bytesToBigInt(decodeBase64Url(value));
      return assertScalar(scalar, name);
    }

    function scalarToString(value) {
      return base62.biToB62(assertScalar(value));
    }

    function pointToPub(point) {
      if (!isOnCurve(point)) { throw new Error('Invalid public point'); }
      return base62.biToB62(point.x) + base62.biToB62(point.y);
    }

    function parsePub(pub) {
      if (typeof pub !== 'string') { throw new Error('Public key must be a string'); }
      let point;
      if (pub.length === 88 && /^[A-Za-z0-9]{88}$/.test(pub)) {
        point = {
          x: base62.b62ToBI(pub.slice(0, 44)),
          y: base62.b62ToBI(pub.slice(44))
        };
      } else if (pub.length === 87 && pub[43] === '.') {
        const parts = pub.split('.');
        point = {
          x: bytesToBigInt(decodeBase64Url(parts[0])),
          y: bytesToBigInt(decodeBase64Url(parts[1]))
        };
      } else {
        throw new Error('Unrecognized public key format');
      }
      if (!isOnCurve(point)) { throw new Error('Public key is not on ' + curve); }
      return point;
    }

    function publicFromPrivate(priv) {
      const point = pointMultiply(assertScalar(priv, 'Private key'), G);
      if (!point || !isOnCurve(point)) { throw new Error('Could not derive public key'); }
      return point;
    }

    function compactPoint(point) {
      return concatBytes([point.y & 1n ? 0x03 : 0x02], bigIntToBytes(point.x, 32));
    }

    async function shaBytes(data) {
      return new Uint8Array(await sha256(data));
    }

    async function hmacSha256(keyBytes, dataBytes) {
      const key = await shim.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
      return new Uint8Array(await shim.subtle.sign('HMAC', key, dataBytes));
    }

    async function deterministicK(priv, hashBytes, attempt) {
      const x = bigIntToBytes(priv, 32);
      const h1 = bigIntToBytes(bytesToBigInt(hashBytes) % N, 32);
      const extra = attempt ? Uint8Array.from([attempt & 255]) : new Uint8Array(0);
      let K = new Uint8Array(32);
      let V = new Uint8Array(32).fill(1);
      K = await hmacSha256(K, concatBytes(V, [0], x, h1, extra));
      V = await hmacSha256(K, V);
      K = await hmacSha256(K, concatBytes(V, [1], x, h1, extra));
      V = await hmacSha256(K, V);
      while (true) {
        V = await hmacSha256(K, V);
        const candidate = bytesToBigInt(V);
        if (candidate > 0n && candidate < N) { return candidate; }
        K = await hmacSha256(K, concatBytes(V, [0]));
        V = await hmacSha256(K, V);
      }
    }

    async function hashToScalar(seed, label) {
      const digest = await shaBytes(concatBytes(utf8Bytes(label), utf8Bytes(seed)));
      return (bytesToBigInt(digest) % (N - 1n)) + 1n;
    }

    async function randomScalar() {
      return (bytesToBigInt(shim.random(32)) % (N - 1n)) + 1n;
    }

    async function normalizeMessage(data) {
      if (typeof data === 'string') { return settings.check(data) ? data : await settings.parse(data); }
      return data;
    }

    async function finalize(result, opt, cb) {
      const out = opt && opt.raw ? result : (await shim.stringify(result));
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    }

    return Object.assign({
      curve, P, N, A, B, G, HALF_N,
      shim, base62, settings,
      mod, modPow, modInv,
      isPoint, isOnCurve,
      pointAdd, pointMultiply,
      bytesToBigInt, bigIntToBytes,
      concatBytes, utf8Bytes,
      decodeBase64Url, encodeBase64,
      parseScalar, assertScalar, scalarToString,
      pointToPub, parsePub, publicFromPrivate,
      compactPoint,
      shaBytes, hmacSha256, deterministicK,
      hashToScalar, randomScalar,
      normalizeMessage, finalize
    }, extras);
  }

  __exp.default = createCurveCore;
});

__def('./src/zen/curves/secp256k1.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  var base62 = __req('./src/zen/base62.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var aeskey = __req('./src/zen/aeskey.js').default;
  var sha256 = __req('./src/zen/sha256.js').default;
  var hash = __req('./src/zen/hash.js').default;
  var createCurveCore = __req('./src/zen/curves/utils.js').default;
  const P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
  const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const A = 0n;
  const B = 7n;
  const G = {
    x: BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'),
    y: BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8')
  };
  const core = createCurveCore({
    curve: 'secp256k1',
    P, N, A, B, G,
    shim, base62, settings, sha256,
    extras: { aeskey, hash }
  });
  const {
    HALF_N,
    mod, modPow, modInv,
    isPoint, isOnCurve,
    pointAdd, pointMultiply,
    bytesToBigInt, bigIntToBytes, concatBytes, utf8Bytes,
    decodeBase64Url, encodeBase64,
    parseScalar, assertScalar, scalarToString,
    pointToPub, parsePub, publicFromPrivate, compactPoint,
    shaBytes, hmacSha256, deterministicK, hashToScalar, randomScalar,
    normalizeMessage, finalize
  } = core;


  __exp.default = core;

  __exp.P = P;
  __exp.N = N;
  __exp.A = A;
  __exp.B = B;
  __exp.G = G;
  __exp.HALF_N = HALF_N;
  __exp.mod = mod;
  __exp.modPow = modPow;
  __exp.modInv = modInv;
  __exp.isPoint = isPoint;
  __exp.isOnCurve = isOnCurve;
  __exp.pointAdd = pointAdd;
  __exp.pointMultiply = pointMultiply;
  __exp.bytesToBigInt = bytesToBigInt;
  __exp.bigIntToBytes = bigIntToBytes;
  __exp.concatBytes = concatBytes;
  __exp.utf8Bytes = utf8Bytes;
  __exp.decodeBase64Url = decodeBase64Url;
  __exp.encodeBase64 = encodeBase64;
  __exp.parseScalar = parseScalar;
  __exp.assertScalar = assertScalar;
  __exp.scalarToString = scalarToString;
  __exp.pointToPub = pointToPub;
  __exp.parsePub = parsePub;
  __exp.publicFromPrivate = publicFromPrivate;
  __exp.compactPoint = compactPoint;
  __exp.shaBytes = shaBytes;
  __exp.hmacSha256 = hmacSha256;
  __exp.deterministicK = deterministicK;
  __exp.hashToScalar = hashToScalar;
  __exp.randomScalar = randomScalar;
  __exp.normalizeMessage = normalizeMessage;
  __exp.finalize = finalize;
  __exp.shim = shim;
  __exp.base62 = base62;
  __exp.settings = settings;
  __exp.aeskey = aeskey;
  __exp.hash = hash;
});

__def('./src/zen/curves/p256.js', function(module, __exp){
  // P-256 / secp256r1 curve — same Weierstrass math as secp256k1, different constants.
  // A = P - 3 (i.e. -3 mod P), so the doubling formula includes the A term.
  var shim = __req('./src/zen/shim.js').default;
  var base62 = __req('./src/zen/base62.js').default;
  var sha256 = __req('./src/zen/sha256.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var createCurveCore = __req('./src/zen/curves/utils.js').default;
  const P = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF');
  const N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
  const A = P - 3n; // -3 mod P
  const B = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B');
  const G = {
    x: BigInt('0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296'),
    y: BigInt('0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5')
  };
  __exp.default = createCurveCore({
    curve: 'p256',
    P, N, A, B, G,
    shim, base62, settings, sha256
  });
});

__def('./src/zen/curves/curves.js', function(module, __exp){
  var secp256k1 = __req('./src/zen/curves/secp256k1.js').default;
  var p256 = __req('./src/zen/curves/p256.js').default;
  const MAP = { secp256k1, p256, secp256r1: p256 };

  function crv(name) { return MAP[name] || MAP.secp256k1; }

  __exp.default = crv;
});

__def('./src/zen/verify.js', function(module, __exp){
  var crv = __req('./src/zen/curves/curves.js').default;
  async function verify(data, pair, cb, opt) {
    try {
      opt = opt || {};
      const c0 = crv(); // secp256k1 — for settings.parse (curve-independent)
      const msg = await c0.settings.parse(data);
      if (pair === false) {
        const raw = await c0.settings.parse(msg.m);
        if (cb) { try { cb(raw); } catch (e) { console.log(e); } }
        return raw;
      }
      const pub = pair && pair.pub ? pair.pub : pair;
      // Curve priority: embedded in signed data → pair.curve → opt.curve → secp256k1
      const c = crv((msg && msg.c) || (pair && pair.curve) || opt.curve);
      const pt = c.parsePub(pub);
      const h = await c.shaBytes(msg.m);
      const sig = new Uint8Array(c.shim.Buffer.from(msg.s || '', opt.encode || 'base64'));
      if (sig.length !== 64) { throw new Error('Invalid signature length'); }
      const r = c.bytesToBigInt(sig.slice(0, 32));
      const s = c.bytesToBigInt(sig.slice(32));
      if (r <= 0n || r >= c.N || s <= 0n || s >= c.N) { throw new Error('Signature out of range'); }
      const z  = c.mod(c.bytesToBigInt(h), c.N);
      const w  = c.modInv(s, c.N);
      const u1 = c.mod(z * w, c.N);
      const u2 = c.mod(r * w, c.N);
      const res = c.pointAdd(c.pointMultiply(u1, c.G), c.pointMultiply(u2, pt));
      if (!res || c.mod(res.x, c.N) !== r) { throw new Error('Signature did not match'); }
      const out = (typeof msg.m === 'string' && c.settings.check(msg.m))
        ? msg.m
        : await c.settings.parse(msg.m);
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) { try { cb(); } catch (x) { console.log(x); } return; }
      throw e;
    }
  }


  __exp.default = verify;

  __exp.verify = verify;
});

__def('./src/zen/sign.js', function(module, __exp){
  var crv = __req('./src/zen/curves/curves.js').default;
  async function sign(data, pair, cb, opt) {
    try {
      opt = opt || {};
      if (data === undefined) { throw new Error('`undefined` not allowed.'); }
      if (!pair || typeof pair === 'function' || !pair.priv) { throw new Error('No signing key.'); }
      const c = crv(pair.curve);
      const msg = await c.normalizeMessage(data);
      const h = await c.shaBytes(msg);
      const priv = c.parseScalar(pair.priv, 'Signing key');
      for (let i = 0; i < 16; i++) {
        const k = await c.deterministicK(priv, h, i);
        const pt = c.pointMultiply(k, c.G);
        if (!pt) { continue; }
        const r = c.mod(pt.x, c.N);
        if (!r) { continue; }
        let s = c.mod(c.modInv(k, c.N) * (c.mod(c.bytesToBigInt(h), c.N) + r * priv), c.N);
        if (!s) { continue; }
        if (s > c.HALF_N) { s = c.N - s; }
        const sig = c.concatBytes(c.bigIntToBytes(r, 32), c.bigIntToBytes(s, 32));
        const out = { m: msg, s: c.encodeBase64(sig, opt.encode || 'base64') };
        if (c.curve !== 'secp256k1') { out.c = c.curve; }
        return c.finalize(out, opt, cb);
      }
      throw new Error('Failed to sign');
    } catch (e) {
      if (cb) { try { cb(); } catch (x) { console.log(x); } return; }
      throw e;
    }
  }


  __exp.default = sign;

  __exp.sign = sign;
});

__def('./src/zen/security.js', function(module, __exp){
  var ZEN = __req('./src/zen/root.js').default;
  var verify = __req('./src/zen/verify.js').default;
  var hash = __req('./src/zen/hash.js').default;
  var sign = __req('./src/zen/sign.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var u;
  var Gun = ZEN;

  // --------------- pack / unpack ---------------

  settings.pack = function(d, cb, k, n, s) { // pack for verifying
    if (settings.check(d)) { return cb(d); }
    var f = 0, tmp;
    if (d && d['#'] && d['.'] && d['>']) { tmp = d[':']; f = 1; }
    JSON.parseAsync(f ? tmp : d, function(err, meta) {
      var sig = (u !== (meta || '')[':']) && (meta || '')['~'];
      if (!sig) { cb(d); return; }
      cb({ m: { '#': s || d['#'], '.': k || d['.'], ':': (meta || '')[':'], '>': d['>'] || (Gun.state && Gun.state.is ? Gun.state.is(n, k) : 0) }, s: sig });
    });
  };

  settings.unpack = function(d, k, n) {
    if (u === d) { return; }
    if (d && (u !== (tmp = d[':']))) { return tmp; }
    k = k || settings.fall_key;
    if (!n && settings.fall_val) { n = {}; n[k] = settings.fall_val; }
    if (!k || !n) { return; }
    if (d === n[k]) { return d; }
    if (!settings.check(n[k])) { return d; }
    var soul = (n && n._ && n._['#']) || settings.fall_soul;
    var s = (Gun.state && Gun.state.is ? Gun.state.is(n, k) : 0) || settings.fall_state;
    if (d && 4 === d.length && soul === d[0] && k === d[1] && fl(s) === fl(d[3])) {
      return d[2];
    }
    if (s < settings.shuffle_attack) { return d; }
  };
  var fl = Math.floor;
  var tmp;
  settings.shuffle_attack = 1546329600000;

  settings.pub = function(s) {
    if (!s) { return; }
    s = s.split('~')[1];
    if (!s) { return; }
    if ('@' === (s[0] || '')[0]) { return; }
    if (/^[A-Za-z0-9]{88}/.test(s)) { return s.slice(0, 88); }
    var parts = s.split(/[^\w_-]/).slice(0, 2);
    if (!parts || 2 !== parts.length) { return; }
    return parts.slice(0, 2).join('.');
  };

  // --------------- gun security middleware ---------------

  var valid = Gun && Gun.valid;
  var link_is = function(d, l) { return 'string' == typeof (l = valid && valid(d)) && l; };

  function check(msg) {
    var eve = this, at = eve.as, put = msg.put, soul = put['#'], key = put['.'], val = put[':'], state = put['>'], id = msg['#'];
    if (!soul || !key) { return; }

    if ((msg._ || '').faith && (at.opt || '').faith && 'function' == typeof msg._) {
      check.pipe.faith({ eve: eve, msg: msg, put: put, at: at }); return;
    }

    var no = function(why) { at.on('in', { '@': id, err: msg.err = why }); };

    var ctx = { eve: eve, msg: msg, at: at, put: put, soul: soul, key: key, val: val, state: state, id: id, no: no, pub: null };
    var pipeline = [check.pipe.forget];

    if ('~@' === soul) {
      pipeline.push(check.pipe.alias);
    } else if ('~@' === soul.slice(0, 2)) {
      pipeline.push(check.pipe.pubs);
    } else if ('~' === soul || '~/' === soul.slice(0, 2)) {
      pipeline.push(check.pipe.shard);
    } else if ((tmp = settings.pub(soul))) {
      ctx.pub = tmp;
      pipeline.push(check.pipe.pub);
    } else if (0 <= soul.indexOf('#')) {
      pipeline.push(check.pipe.hash);
    } else {
      pipeline.push(check.pipe.any);
    }

    var required = pipeline[1];
    for (var pi = 0; pi < check.plugins.length; pi++) {
      check.plugins[pi](ctx, pipeline);
    }
    if (required && pipeline.indexOf(required) < 0) { return no("Security stage removed."); }
    check.run(pipeline, ctx);
  }

  check.run = function(stages, ctx) {
    var no = ctx.no;
    var i = 0;
    var next = function() {
      if (i >= stages.length) { return; }
      var stage = stages[i++];
      var spent = false;
      var once = function() { if (!spent) { spent = true; next(); } };
      try { stage(ctx, once, no); } catch(e) { no(e && e.message || String(e)); }
    };
    next();
  };

  check.pipe = {
    faith: function(ctx) {
      var eve = ctx.eve, msg = ctx.msg, put = ctx.put;
      settings.pack(put, function(raw) {
        verify(raw, false, function(data) {
          put['='] = settings.unpack(data);
          eve.to.next(msg);
        });
      });
    },
    forget: function(ctx, next) {
      var soul = ctx.soul, state = ctx.state, msg = ctx.msg, tmp2;
      if (0 <= soul.indexOf('<?')) {
        tmp2 = parseFloat(soul.split('<?')[1] || '');
        if (tmp2 && (state < (Gun.state() - (tmp2 * 1000)))) {
          (tmp2 = msg._) && (tmp2.stun) && (tmp2.stun--);
          return;
        }
      }
      next();
    },
    alias:  function(ctx, next, reject) { check.alias(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject); },
    pubs:   function(ctx, next, reject) { check.pubs(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject); },
    shard:  function(ctx, next, reject) { check.shard(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject, ctx.at.user || ''); },
    pub:    function(ctx, next, reject) { check.pub(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject, ctx.at.user || '', ctx.pub); },
    hash:   function(ctx, next, reject) { check.hash(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject); },
    any:    function(ctx, next, reject) { check.any(ctx.eve, ctx.msg, ctx.val, ctx.key, ctx.soul, ctx.at, reject, ctx.at.user || ''); }
  };
  Object.freeze(check.pipe);

  check.plugins = [];
  check.use = function(fn) { check.plugins.push(fn); };

  function initSeaOpt(msg, ctx) {
    var o = Object.assign({}, ctx);
    try { Object.defineProperty(msg._, 'sea', { value: o, enumerable: false, configurable: true, writable: true }); } catch(e) { msg._.sea = o; }
    return o;
  }

  check.$sea = function(msg, user, pub) {
    var scope = msg._ || {};
    var ctx = scope.opt || ((scope.msg || {}).opt) || {};
    var opt = scope.sea || initSeaOpt(msg, ctx);
    var sea = (user && user._) || {};
    var is = (user && user.is) || {};
    var authenticator = opt.authenticator || sea.sea;
    var upub = opt.pub || (authenticator || {}).pub || is.pub || pub;
    if (!scope.done) { delete ctx.authenticator; delete ctx.pub; scope.done = true; }
    return { opt: opt, authenticator: authenticator, upub: upub };
  };

  check.next = function(eve, msg, no) {
    JSON.stringifyAsync(msg.put[':'], function(err, s) {
      if (err) { return no(err || "Stringify error."); }
      msg.put[':'] = s;
      return eve.to.next(msg);
    });
  };

  check.auth = function(msg, no, authenticator, done) {
    settings.pack(msg.put, function(packed) {
      if (!authenticator) { return no("Missing authenticator"); }
      if (typeof authenticator === 'function') {
        Promise.resolve(authenticator(packed)).then(async function(result) {
          if (u === result) { return no('Signature fail.'); }
          var data = (typeof result === 'string') ? await settings.parse(result) : result;
          if (!data || !data.m || !data.s) { return no('Invalid signature format'); }
          var parsed = settings.unpack(data.m);
          msg.put[':'] = { ':': parsed, '~': data.s };
          msg.put['='] = parsed;
          done(parsed);
        }).catch(function(e) { no(e && e.message ? e.message : 'Auth error'); });
        return;
      }
      sign(packed, authenticator, async function(data) {
        if (u === data) { return no('Signature fail.'); }
        if (!data.m || !data.s) { return no('Invalid signature format'); }
        var parsed = settings.unpack(data.m);
        msg.put[':'] = { ':': parsed, '~': data.s };
        msg.put['='] = parsed;
        done(parsed);
      }, { raw: 1 });
    });
  };

  check.$vfy = function(eve, msg, key, soul, pub, no, certificate, certificant, cb) {
    if (!(certificate || '').m || !(certificate || '').s || !certificant || !pub) { return; }
    return verify(certificate, pub, function(data) {
      if (u !== data && u !== data.e && msg.put['>'] && msg.put['>'] > parseFloat(data.e)) { return no("Certificate expired."); }
      if (u !== data && data.c && data.w && (data.c === certificant || data.c.indexOf('*') > -1 || data.c.indexOf(certificant) > -1)) {
        var path = soul.indexOf('/') > -1 ? soul.replace(soul.substring(0, soul.indexOf('/') + 1), '') : '';
        String.match = String.match || (Gun.text && Gun.text.match);
        var w = Array.isArray(data.w) ? data.w : (typeof data.w === 'object' || typeof data.w === 'string') ? [data.w] : [];
        for (var lex of w) {
          if ((String.match(path, lex['#']) && String.match(key, lex['.'])) || (!lex['.'] && String.match(path, lex['#'])) || (!lex['#'] && String.match(key, lex['.'])) || String.match((path ? path + '/' + key : key), lex['#'] || lex)) {
            if (lex['+'] && lex['+'].indexOf('*') > -1 && path && path.indexOf(certificant) == -1 && key.indexOf(certificant) == -1) { return no('Path "' + path + '" or key "' + key + '" must contain string "' + certificant + '".'); }
            if (data.wb && (typeof data.wb === 'string' || ((data.wb || {})['#']))) {
              var root = eve.as.root.$.back(-1);
              if (typeof data.wb === 'string' && '~' !== data.wb.slice(0, 1)) { root = root.get('~' + pub); }
              return root.get(data.wb).get(certificant).once(function(value) {
                if (value && (value === 1 || value === true)) { return no('Certificant ' + certificant + ' blocked.'); }
                return cb(data);
              });
            }
            return cb(data);
          }
        }
        return no("Certificate verification fail.");
      }
    });
  };

  check.guard = function(eve, msg, key, soul, at, no, data, next) {
    if (0 > key.indexOf('#')) { return next(); }
    check.hash(eve, msg, data, key, soul, at, no, next);
  };

  check.hash = function(eve, msg, val, key, soul, at, no, yes) {
    function base64ToHex(data) {
      var binaryStr = atob(data), a = [];
      for (var i = 0; i < binaryStr.length; i++) {
        var h = binaryStr.charCodeAt(i).toString(16);
        a.push(h.length === 1 ? '0' + h : h);
      }
      return a.join('');
    }
    var hashKey = key.split('#').pop();
    yes = yes || function() { eve.to.next(msg); };
    if (!hashKey || hashKey === key) { return yes(); }
    hash(val, null, function(b64hash) {
      var hexhash = base64ToHex(b64hash), b64slice = b64hash.slice(-20), hexslice = hexhash.slice(-20);
      if ([b64hash, b64slice, hexhash, hexslice].some(function(item) { return item.endsWith(hashKey); })) { return yes(); }
      no("Data hash not same as hash!");
    }, { name: 'SHA-256' });
  };

  check.alias = function(eve, msg, val, key, soul, at, no) {
    if (!val) { return no("Data must exist!"); }
    if ('~@' + key === link_is(val)) { return eve.to.next(msg); }
    no("Alias not same!");
  };

  check.pubs = function(eve, msg, val, key, soul, at, no) {
    if (!val) { return no("Alias must exist!"); }
    if (key === link_is(val)) { return eve.to.next(msg); }
    no("Alias not same!");
  };

  check.$sh = { pub: 88, cut: 2, min: 1, root: '~', pre: '~/', bad: /[^0-9a-zA-Z]/ };
  check.$sh.max = Math.ceil(check.$sh.pub / check.$sh.cut);

  check.$seg = function(seg, short) {
    if ('string' != typeof seg || !seg) { return; }
    if (short) {
      if (seg.length < check.$sh.min || seg.length > check.$sh.cut) { return; }
    } else {
      if (seg.length !== check.$sh.cut) { return; }
    }
    if (check.$sh.bad.test(seg)) { return; }
    return 1;
  };
  check.$path = function(soul) {
    if (check.$sh.root === soul) { return []; }
    if (check.$sh.pre !== (soul || '').slice(0, 2)) { return; }
    if ('/' === soul.slice(-1) || 0 <= soul.indexOf('//')) { return; }
    var path = soul.slice(2).split('/');
    for (var i = 0; i < path.length; i++) {
      if (!check.$seg(path[i])) { return; }
    }
    return path;
  };
  check.$kid = function(soul, key) {
    if (check.$sh.root === soul) { return check.$sh.pre + key; }
    return soul + '/' + key;
  };
  check.$pub = function(soul, key) {
    var path = check.$path(soul);
    if (!path) { return; }
    return path.join('') + key;
  };
  check.$leaf = function(soul, key) {
    var pub = check.$pub(soul, key);
    if (!pub || pub.length !== check.$sh.pub) { return; }
    if (settings.pub('~' + pub) !== pub) { return; }
    return pub;
  };

  check.$tag = async function(msg, cert, upub, $verify, next) {
    var _cert = await settings.parse(cert);
    if (_cert && _cert.m && _cert.s) { $verify(_cert, upub, function(_) { msg.put[':']['+'] = _cert; msg.put[':']['*'] = upub; next(); }); }
  };

  check.pass = function(eve, msg, raw, data, $verify) {
    if (raw['+'] && raw['+']['m'] && raw['+']['s'] && raw['*']) {
      return $verify(raw['+'], raw['*'], function(_) { msg.put['='] = data; return eve.to.next(msg); });
    }
    msg.put['='] = data;
    return eve.to.next(msg);
  };

  check.pub = async function(eve, msg, val, key, soul, at, no, user, pub, conf) {
    conf = conf || {};
    var $verify = function(certificate, certificant, cb) { return check.$vfy(eve, msg, key, soul, pub, no, certificate, certificant, cb); };
    var $next = function() { return check.next(eve, msg, no); };
    var sec = check.$sea(msg, user, pub);
    var opt = sec.opt, authenticator = sec.authenticator, upub = sec.upub;
    var cert = conf.nocert ? u : opt.cert;
    var $expect = function(data) {
      if (u === conf.want) { return 1; }
      if (data === conf.want) { return 1; }
      no(conf.err || "Unexpected payload.");
    };
    var raw = (await settings.parse(val)) || {};
    var $hash = function(data, next2) { check.guard(eve, msg, key, soul, at, no, data, next2); };

    if ('pub' === key && '~' + pub === soul) {
      if (val === pub) { return eve.to.next(msg); }
      return no("Account not same!");
    }

    if (((user && user.is) || authenticator) && upub && !raw['*'] && !raw['+'] && (pub === upub || (pub !== upub && cert))) {
      check.auth(msg, no, authenticator, function(data) {
        if (!$expect(data)) { return; }
        $hash(data, function() {
          if (pub !== upub && cert) { return check.$tag(msg, cert, upub, $verify, $next); }
          $next();
        });
      });
      return;
    }

    settings.pack(msg.put, function(packed) {
      verify(packed, raw['*'] || pub, function(data) {
        data = settings.unpack(data);
        if (u === data) { return no("Unverified data."); }
        if (!$expect(data)) { return; }
        var lnk = link_is(data);
        if (lnk && pub === settings.pub(lnk)) { (at.sea.own[lnk] = at.sea.own[lnk] || {})[pub] = 1; }
        $hash(data, function() { check.pass(eve, msg, raw, data, $verify); });
      });
    });
  };

  check.shard = async function(eve, msg, val, key, soul, at, no, user) {
    var path = check.$path(soul), link = link_is(val), expected, leaf, raw, claim;
    if (!path) { return no("Invalid shard soul path."); }
    if (!check.$seg(key, 1)) { return no("Invalid shard key."); }
    if ((path.length + 1) > check.$sh.max) { return no("Invalid shard depth."); }
    leaf = check.$leaf(soul, key);
    if (leaf) {
      if (!link) { return no("Shard leaf value must be a link."); }
      if (link !== '~' + leaf) { return no("Shard leaf link must point to ~pub."); }
      var lsec = check.$sea(msg, user, leaf);
      var lauthenticator = lsec.authenticator, lupub = lsec.upub || (lauthenticator || {}).pub;
      if (!lauthenticator) { return no("Shard leaf requires authenticator."); }
      if (lupub !== leaf) { return no("Shard leaf authenticator pub mismatch."); }
      check.auth(msg, no, lauthenticator, function(data) {
        if (link_is(data) !== link) { return no("Shard leaf signed payload mismatch."); }
        msg.put['='] = { '#': link };
        check.next(eve, msg, no);
      });
      return;
    }
    expected = check.$kid(soul, key);
    var prefix = check.$pub(soul, key);
    raw = link ? {} : ((await settings.parse(val)) || {});
    claim = (raw && typeof raw === 'object') ? raw['*'] : undefined;
    if (!claim) {
      if (!link) { return no("Shard intermediate value must be link."); }
      if (link !== expected) { return no("Invalid shard link target."); }
      var sec2 = check.$sea(msg, user);
      var authenticator2 = sec2.authenticator;
      claim = sec2.upub || ((authenticator2 || {}).pub);
      if (!authenticator2) { return no("Shard intermediate requires authenticator."); }
      if ('string' !== typeof claim || claim.length !== check.$sh.pub) { return no("Invalid shard intermediate pub."); }
      if (settings.pub('~' + claim) !== claim) { return no("Invalid shard intermediate pub format."); }
      if (0 !== claim.indexOf(prefix)) { return no("Shard pub prefix mismatch."); }
      check.auth(msg, no, authenticator2, function(data) {
        if (link_is(data) !== expected) { return no("Shard intermediate signed payload mismatch."); }
        msg.put[':']['*'] = claim;
        msg.put['='] = { '#': expected };
        check.next(eve, msg, no);
      });
      return;
    }
    var existing = ((at.graph || {})[soul] || {})[key];
    if (existing) {
      var existingParsed = await settings.parse(existing);
      if (existingParsed && link_is(existingParsed[':']) === expected) {
        msg.put['='] = { '#': expected };
        return eve.to.next(msg);
      }
    }
    if ('string' !== typeof claim || claim.length !== check.$sh.pub) { return no("Invalid shard intermediate pub."); }
    if (settings.pub('~' + claim) !== claim) { return no("Invalid shard intermediate pub format."); }
    if (0 !== claim.indexOf(prefix)) { return no("Shard pub prefix mismatch."); }
    if (link_is(raw[':']) !== expected) { return no("Invalid shard link target."); }
    settings.pack(msg.put, function(packed) {
      verify(packed, claim, function(data) {
        data = settings.unpack(data);
        if (u === data) { return no("Invalid shard intermediate signature."); }
        if (link_is(data) !== expected) { return no("Shard intermediate payload mismatch."); }
        msg.put['='] = data;
        eve.to.next(msg);
      });
    });
  };

  check.any = function(eve, msg, val, key, soul, at, no) {
    if (at.opt.secure) { return no("Soul missing public key at '" + key + "'."); }
    at.on('secure', function(msg2) {
      this.off();
      if (!at.opt.secure) { return eve.to.next(msg2); }
      no("Data cannot be changed.");
    }).on.on('secure', msg);
  };

  // --------------- gun plugin ---------------

  Gun.on('opt', function(at) {
    if (!at.sea) {
      at.sea = { own: {} };
      at.on('put', check, at);
    }
    this.to.next(at);
  });

  // --------------- exports ---------------

  var security = {
    check: check,
    opt: settings,
    verify: verify,
    hash: hash,
    sign: sign
  };

  __exp.default = security;
});

__def('./src/pen.js', function(module, __exp){
  var SecurityMod = __req('./src/zen/security.js').default;
  let __defaultExport;
  const __penWasmURL = new URL('./pen.wasm', import.meta.url);
  {

    var runtime = SecurityMod;

    // ── WASM init ───────────────────────────────────────────────────────────────

    var _wasm = null;
    var pen = {};

    function createPenReady() {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        return import('node:fs/promises').then(function(mod) {
          var readFile = (mod.readFile) || ((mod.default || {}).readFile);
          if (!readFile) { throw new Error('pen: fs.readFile unavailable'); }
          return readFile(__penWasmURL);
        }).then(function(bytes) {
          return WebAssembly.instantiate(bytes, {}).then(function(r) { _wasm = r; });
        });
      }
      if (typeof fetch !== 'undefined') {
        return fetch(__penWasmURL).then(function(r) {
            if (!r.ok) throw new Error('pen: fetch pen.wasm failed: ' + r.status + ' ' + r.url);
            return r.arrayBuffer();
          })
          .then(function(buf) { return WebAssembly.instantiate(buf, {}); })
          .then(function(r) { _wasm = r; });
      }
      return Promise.reject(new Error('pen: cannot load pen.wasm in this environment'));
    }

    pen.ready = createPenReady();

    function _view() {
      return new Uint8Array(_wasm.instance['exports'].memory.buffer);
    }

    // ── Wire encoding ────────────────────────────────────────────────────────────

    var _enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : {
      encode: function(s) {
        var buf = Buffer.from(s, 'utf8');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      }
    };

    function _writeReg(view, offset, val) {
      if (val === null || val === undefined) {
        view[offset++] = 0; return offset;
      }
      if (typeof val === 'boolean') {
        view[offset++] = 1; view[offset++] = val ? 1 : 0; return offset;
      }
      if (typeof val === 'number') {
        if (Number.isInteger(val) && val >= -0x8000000000000000 && val <= 0x7FFFFFFFFFFFFFFF) {
          view[offset++] = 2;
          var lo = val >>> 0;
          var hi = Math.floor(val / 0x100000000);
          view[offset++] = lo & 0xFF; view[offset++] = (lo >> 8) & 0xFF;
          view[offset++] = (lo >> 16) & 0xFF; view[offset++] = (lo >> 24) & 0xFF;
          var hlo = hi >>> 0;
          view[offset++] = hlo & 0xFF; view[offset++] = (hlo >> 8) & 0xFF;
          view[offset++] = (hlo >> 16) & 0xFF; view[offset++] = (hlo >> 24) & 0xFF;
          return offset;
        } else {
          view[offset++] = 3;
          var dv = new DataView(view.buffer, view.byteOffset + offset, 8);
          dv.setFloat64(0, val, true);
          offset += 8; return offset;
        }
      }
      if (typeof val === 'string') {
        view[offset++] = 4;
        var encoded = _enc.encode(val);
        var slen = Math.min(encoded.length, 0xFFFF);
        view[offset++] = slen & 0xFF; view[offset++] = (slen >> 8) & 0xFF;
        for (var i = 0; i < slen; i++) view[offset++] = encoded[i];
        return offset;
      }
      view[offset++] = 0; return offset;
    }

    // ── run ──────────────────────────────────────────────────────────────────────

    pen.run = function(bytecode, regs) {
      if (!_wasm) throw new Error('pen: not ready. await pen.ready first.');
      var exp = _wasm.instance.exports;
      var view = _view();

      exp.free();

      var base = exp.mem();
      var bclen = bytecode.length;
      view[base + 0] = bclen & 0xFF;
      view[base + 1] = (bclen >> 8) & 0xFF;
      view[base + 2] = (bclen >> 16) & 0xFF;
      view[base + 3] = (bclen >> 24) & 0xFF;

      for (var i = 0; i < bclen; i++) view[base + 4 + i] = bytecode[i];

      var regOff = base + 4 + bclen;
      var nregs  = regs ? regs.length : 0;
      view[regOff + 0] = nregs & 0xFF;
      view[regOff + 1] = (nregs >> 8) & 0xFF;
      view[regOff + 2] = (nregs >> 16) & 0xFF;
      view[regOff + 3] = (nregs >> 24) & 0xFF;

      var off = regOff + 4;
      for (var j = 0; j < nregs; j++) off = _writeReg(view, off, regs[j]);

      var result = exp.run();
      if (result === 1) return true;
      if (result === 0) return false;
      if (result === -2) throw new Error('PEN: bad version byte');
      if (result === -3) throw new Error('PEN: max recursion depth exceeded');
      throw new Error('PEN: runtime error (' + result + ')');
    };

    // ── pack / unpack (bytecode ↔ base62) ────────────────────────────────────────
    // Used to store bytecode as the soul/node-ID in GUN graph.
    // Soul format: '$' + pen.pack(bytecode)
    // e.g. '$abc123...' (variable length base62)

    var B62_ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var B62_MAP   = {};
    for (var _i = 0; _i < B62_ALPHA.length; _i++) B62_MAP[B62_ALPHA[_i]] = _i;

    function b62enc(n) {
      if (n === 0n) return B62_ALPHA[0];
      var s = '';
      while (n > 0n) { s = B62_ALPHA[Number(n % 62n)] + s; n = n / 62n; }
      return s;
    }

    function b62dec(s) {
      var n = 0n;
      for (var i = 0; i < s.length; i++) n = n * 62n + BigInt(B62_MAP[s[i]] || 0);
      return n;
    }

    pen.pack = function(buf) {
      var hex = '01';
      for (var i = 0; i < buf.length; i++) hex += ('0' + buf[i].toString(16)).slice(-2);
      return b62enc(BigInt('0x' + hex));
    };

    pen.unpack = function(s) {
      var n   = b62dec(s);
      var hex = n.toString(16);
      if (hex.length % 2) hex = '0' + hex;
      var bytes = [];
      for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
      return new Uint8Array(bytes.slice(1)); // drop sentinel 0x01
    };

    // ── Bytecode builder ─────────────────────────────────────────────────────────

    var bc = pen.bc = {};

    bc.uleb = function(n) {
      var bytes = []; n = n >>> 0;
      do { var b = n & 0x7F; n >>>= 7; if (n !== 0) b |= 0x80; bytes.push(b); } while (n !== 0);
      return bytes;
    };
    bc.sleb = function(n) {
      var bytes = [], more = true;
      while (more) {
        var b = n & 0x7F; n >>= 7;
        if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) more = false;
        else b |= 0x80;
        bytes.push(b);
      }
      return bytes;
    };

    bc.prog   = function(root) { return new Uint8Array([0x01].concat(root)); };
    bc.null_  = function()     { return [0x00]; };
    bc.true_  = function()     { return [0x01]; };
    bc.false_ = function()     { return [0x02]; };
    bc.str    = function(s)    { var bytes = Array.from(_enc.encode(s.slice(0, 255))); return [0x03, bytes.length].concat(bytes); };
    bc.uint   = function(n)    { return [0x04].concat(bc.uleb(n)); };
    bc.int    = function(n)    { return [0x07].concat(bc.sleb(n)); };
    bc.f64    = function(n)    { var buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, n, false); return [0x08].concat(Array.from(new Uint8Array(buf))); };
    bc.pass   = function()     { return [0x23]; };
    bc.fail   = function()     { return [0x24]; };
    bc.reg    = function(n)    { return [0x10, n]; };
    bc.r0     = function()     { return [0xF0]; };
    bc.r1     = function()     { return [0xF1]; };
    bc.r2     = function()     { return [0xF2]; };
    bc.r3     = function()     { return [0xF3]; };
    bc.r4     = function()     { return [0xF4]; };
    bc.r5     = function()     { return [0xF5]; };
    bc.r6     = function()     { return [0x10, 6]; }; // path register
    bc.local  = function(n)    { return [0xF8 + n]; };
    bc.intn   = function(n)    { return (n >= 0 && n <= 15) ? [0xE0 + n] : bc.uint(n); };

    bc.and    = function(exprs) { return [0x20, exprs.length].concat(...exprs); };
    bc.or     = function(exprs) { return [0x21, exprs.length].concat(...exprs); };
    bc.not    = function(a)     { return [0x22].concat(a); };

    bc.eq     = function(a, b)  { return [0x30].concat(a, b); };
    bc.ne     = function(a, b)  { return [0x31].concat(a, b); };
    bc.lt     = function(a, b)  { return [0x32].concat(a, b); };
    bc.gt     = function(a, b)  { return [0x33].concat(a, b); };
    bc.lte    = function(a, b)  { return [0x34].concat(a, b); };
    bc.gte    = function(a, b)  { return [0x35].concat(a, b); };

    bc.add    = function(a, b)  { return [0x40].concat(a, b); };
    bc.sub    = function(a, b)  { return [0x41].concat(a, b); };
    bc.mul    = function(a, b)  { return [0x42].concat(a, b); };
    bc.divu   = function(a, b)  { return [0x43].concat(a, b); };
    bc.mod    = function(a, b)  { return [0x44].concat(a, b); };
    bc.abs    = function(a)     { return [0x46].concat(a); };
    bc.neg    = function(a)     { return [0x47].concat(a); };

    bc.len    = function(a)          { return [0x50].concat(a); };
    bc.slice  = function(a, s, e)    { return [0x51].concat(a, s, e); };
    bc.seg    = function(a, sep, idx){ return [0x52].concat(a, [sep.charCodeAt(0)], idx); };
    bc.tonum  = function(a)          { return [0x53].concat(a); };
    bc.tostr  = function(a)          { return [0x54].concat(a); };
    bc.concat = function(a, b)       { return [0x55].concat(a, b); };
    bc.pre    = function(a, b)       { return [0x56].concat(a, b); };
    bc.suf    = function(a, b)       { return [0x57].concat(a, b); };
    bc.inc    = function(a, b)       { return [0x58].concat(a, b); };
    bc.upper  = function(a)          { return [0x5A].concat(a); };
    bc.lower  = function(a)          { return [0x5B].concat(a); };

    bc.iss    = function(a)          { return [0x60].concat(a); };
    bc.isn    = function(a)          { return [0x61].concat(a); };
    bc.isx    = function(a)          { return [0x62].concat(a); };
    bc.isb    = function(a)          { return [0x63].concat(a); };
    bc.lng    = function(a, mn, mx)  { return [0x64].concat(a, [mn, mx]); };

    bc.let_   = function(slot, def, body) { return [0x70, slot].concat(def, body); };
    bc.if_    = function(c, t, e)    { return [0x71].concat(c, t, e); };
    bc.segr   = function(reg, sep, idx) { return [0x80, reg, sep.charCodeAt(0), idx]; };
    bc.segrn  = function(reg, sep, idx) { return [0x81, reg, sep.charCodeAt(0), idx]; };

    // ── treeskip: advance pos past one expression node without evaluating ─────────
    // Used by scanpolicy to find where the root expression ends, so policy bytes
    // appended after the tree can be scanned without false positives.

    function treeskip(bytecode, pos) {
      var op = bytecode[pos++];
      if (op === 0x00 || op === 0x01 || op === 0x02 || op === 0x23 || op === 0x24) return pos;
      if (op === 0x03) { var len = bytecode[pos++]; return pos + len; }          // string
      if (op === 0x04 || op === 0x07) { while (bytecode[pos++] & 0x80) {}; return pos; }  // varint
      if (op === 0x08) return pos + 8;                                            // f64
      if (op === 0x10) return pos + 1;                                            // reg(n)
      if (op === 0x20 || op === 0x21) {                                           // and/or
        var n = bytecode[pos++]; for (var i = 0; i < n; i++) pos = treeskip(bytecode, pos); return pos;
      }
      if (op === 0x22) return treeskip(bytecode, pos);                            // not
      if (op >= 0x30 && op <= 0x35) { pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // 2-arg compare
      if (op >= 0x40 && op <= 0x45) { pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // 2-arg arith
      if (op === 0x46 || op === 0x47) return treeskip(bytecode, pos);             // abs/neg
      if (op === 0x50) return treeskip(bytecode, pos);                            // len
      if (op === 0x51) { pos = treeskip(bytecode, pos); pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // slice
      if (op === 0x52) { pos = treeskip(bytecode, pos); pos++; return treeskip(bytecode, pos); }  // seg
      if (op === 0x53 || op === 0x54) return treeskip(bytecode, pos);             // tonum/tostr
      if (op >= 0x55 && op <= 0x59) { pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // 2-arg string
      if (op === 0x5A || op === 0x5B) return treeskip(bytecode, pos);             // upper/lower
      if (op >= 0x60 && op <= 0x63) return treeskip(bytecode, pos);              // type checks
      if (op === 0x64) return treeskip(bytecode, pos) + 2;                       // lng: expr + [min][max]
      if (op === 0x70) { pos++; pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // let
      if (op === 0x71) { pos = treeskip(bytecode, pos); pos = treeskip(bytecode, pos); return treeskip(bytecode, pos); }  // if
      if (op === 0x80 || op === 0x81) return pos + 3;                            // segr/segrn macros
      if (op >= 0xE0 && op <= 0xEF) return pos;                                  // intn shorthands
      if ((op >= 0xF0 && op <= 0xF5) || op >= 0xF8) return pos;                 // reg shorthands
      return pos; // unknown — stop here (policy byte or EOF)
    }

    function readuleb(bytes, pos) {
      var value = 0, shift = 0, b = 0;
      do {
        if (pos >= bytes.length) return null;
        b = bytes[pos++];
        value |= (b & 0x7F) << shift;
        shift += 7;
      } while (b & 0x80);
      return { value: value >>> 0, next: pos };
    }

    function stableparams(value) {
      var seen = [];

      function normalize(v) {
        if (v === null) return null;

        var t = typeof v;
        if (t === 'string' || t === 'boolean') return v;
        if (t === 'number') {
          if (!isFinite(v)) throw new Error('PEN: params numbers must be finite');
          return v;
        }
        if (t === 'undefined') return undefined;
        if (t === 'function' || t === 'symbol' || t === 'bigint') {
          throw new Error('PEN: params must be JSON-serializable');
        }
        if (Array.isArray(v)) {
          return v.map(function(item) {
            var normalized = normalize(item);
            return normalized === undefined ? null : normalized;
          });
        }
        if (t === 'object') {
          if (seen.indexOf(v) >= 0) throw new Error('PEN: params must not be circular');
          seen.push(v);
          var out = {};
          Object.keys(v).sort().forEach(function(key) {
            var normalized = normalize(v[key]);
            if (normalized !== undefined) out[key] = normalized;
          });
          seen.pop();
          return out;
        }

        throw new Error('PEN: params must be JSON-serializable');
      }

      return JSON.stringify(normalize(value));
    }

    // ── scanpolicy: extract tail opcodes appended after expression root ───────────
    // Tail bytes (0xC0..) are appended AFTER the complete expression tree.
    // We use treeskip() to find where the tree ends, avoiding false positives from
    // integer/string byte values within the expression that happen to overlap tail opcodes.

    function scanpolicy(bytecode) {
      var p = { sign: false, cert: null, open: false, pow: null, params: null };
      if (!bytecode || bytecode.length < 2) return p;
      var pos = treeskip(bytecode, 1); // skip version byte + root expression
      for (var i = pos; i < bytecode.length;) {
        var op = bytecode[i++];
        if (op === 0xC0) { p.sign = true; continue; }
        if (op === 0xC1) {
          var clen = bytecode[i++] || 0, pub = '';
          if (i + clen > bytecode.length) return p;
          for (var cj = 0; cj < clen; cj++) pub += String.fromCharCode(bytecode[i++]);
          p.cert = pub;
          continue;
        }
        if (op === 0xC3) { p.open = true; continue; }
        if (op === 0xC4) {
          var pfield = bytecode[i++], pdiff = bytecode[i++];
          var ulen = bytecode[i++] || 0, unit = '';
          if (i + ulen > bytecode.length) return p;
          for (var ui = 0; ui < ulen; ui++) unit += String.fromCharCode(bytecode[i++]);
          p.pow = { field: pfield, difficulty: pdiff, unit: unit || '0' };
          continue;
        }
        if (op === 0xC5) {
          var metaLen = readuleb(bytecode, i);
          if (!metaLen) return p;
          i = metaLen.next;
          if (i + metaLen.value > bytecode.length) return p;
          var meta = '';
          for (var mi = 0; mi < metaLen.value; mi++) meta += String.fromCharCode(bytecode[i++]);
          try { p.params = JSON.parse(meta); } catch (e) { p.params = meta; }
          continue;
        }
        break;
      }
      return p;
    }

    pen.scanpolicy = scanpolicy;

    // ── applypolicy: enforce policy after predicate passes ────────────────────────
    // Handles sign (SGN/0xC0), cert (CRT/0xC1), open (NOA/0xC3), and no-policy.
    // PoW (0xC4) is handled in penStage before calling applypolicy.

    function applypolicy(policy, ctx, reject) {
      var eve = ctx.eve, msg = ctx.msg, at = ctx.at;
      var chk = runtime.check;

      if (policy.cert) {
        var raw = {}; try { raw = JSON.parse(ctx.val) || {}; } catch(e) {}
        if (!raw['+'] || !raw['*']) return reject('PEN: cert required');
        chk.$vfy(eve, msg, ctx.key, ctx.soul, policy.cert, reject, raw['+'], raw['*'], function() {
          chk.next(eve, msg, reject);
        });
        return;
      }

      if (policy.sign) {
        var sec = chk.$sea(msg, at.user || '', null);
        if (sec.authenticator) {
          chk.auth(msg, reject, sec.authenticator, function() {
            chk.next(eve, msg, reject);
          });
          return;
        }
        // Peer re-propagation path: verify existing signature
        var raw2 = {}; try { raw2 = JSON.parse(ctx.val) || {}; } catch(e) {}
        runtime.opt.pack(msg.put, function(packed) {
          runtime.verify(packed, raw2['*'] || sec.upub || null, function(data) {
            data = runtime.opt.unpack(data);
            if (data === void 0) return reject('PEN: valid signature required');
            chk.next(eve, msg, reject);
          });
        });
        return;
      }

      // open or no policy: forward directly without stringify
      eve.to.next(msg);
    }

    // ── penStage: pipeline stage for $-soul validation ────────────────────────────

    function penStage(ctx, next, reject) {
      var soul = ctx.soul;
      var slashIdx = soul.indexOf('/');
      var pencode  = slashIdx >= 0 ? soul.slice(1, slashIdx) : soul.slice(1);
      var pathpart = slashIdx >= 0 ? soul.slice(slashIdx + 1) : '';
      var bytecode;
      try { bytecode = pen.unpack(pencode); } catch(e) { return reject('PEN: invalid soul encoding'); }
      if (!bytecode || bytecode.length < 2) return reject('PEN: empty bytecode');
      if (bytecode.length > 512) return reject('PEN: bytecode too large');

      var policy = scanpolicy(bytecode);
      var sec = (runtime.check && runtime.check.$sea) ? runtime.check.$sea(ctx.msg, (ctx.at && ctx.at.user) || '', null) : {};
      var writer = sec.upub || ((sec.authenticator || {}).pub) || '';
      var regs = [
        ctx.key, ctx.val, soul,
        ctx.state || 0, Date.now(),
        writer,
        pathpart   // R[6]: path after pencode/ in soul (e.g. 'asdf-1234/hgfd-2345')
      ];

      pen.ready.then(function() {
        var ok;
        try { ok = pen.run(bytecode, regs); } catch(e) { return reject('PEN VM: ' + (e.message || e)); }
        if (!ok) return reject('PEN: predicate failed');

        if (policy.pow) {
          var field = regs[policy.pow.field] || '';
          return runtime.hash(field, null, function(hash) {
            var punit = policy.pow.unit || '0';
            var pdiff = (policy.pow.difficulty != null) ? policy.pow.difficulty : 1;
            var prefix = punit.repeat(pdiff);
            if ((hash || '').indexOf(prefix) !== 0) return reject('PEN: PoW insufficient');
            applypolicy(policy, ctx, reject);
          }, { name: 'SHA-256', encode: 'hex' });
        }

        applypolicy(policy, ctx, reject);
      });
    }

    if (runtime && runtime.check && runtime.check.use) {
      runtime.check.use(function(ctx, pipeline) {
        if (!ctx.soul || ctx.soul[0] !== '$') return;
        pipeline.splice(1, 0, penStage);
      });
    }

    // ── runtime.pen() — bytecode compiler ─────────────────────────────────────────
    // Compiles a high-level spec to bytecode and returns the soul string '$<base62>'
    //
    // spec.key   — expr to validate ctx.key   (R[0])
    // spec.val   — expr to validate ctx.val   (R[1])
    // spec.soul  — expr to validate ctx.soul  (R[2], full soul string)
    // spec.state — expr to validate ctx.state (R[3])
    // spec.path  — expr to validate path after pencode/ in soul (R[6])
    //              e.g. soul '$abc/foo/bar' → path 'foo/bar'
    // spec.params — JSON-serializable compile-time parameters that change soul
    //               identity without changing runtime validation semantics
    //
    // expr formats:
    //   "string"                      → EQ(field, str)
    //   { eq, ne, pre, suf, inc }     → string predicates
    //   { lt, gt, lte, gte }          → numeric comparisons
    //   { and, or, not }              → logical combinators
    //   { type: 'string|number|...' } → ISS/ISN/ISX/ISB
    //   { length: [min, max] }        → LNG
    //   { seg: {sep,idx,of,match} }   → SEG
    //   { let: {bind,def,body} }      → LET
    //   { if: {cond,then,else} }      → IF
    //   { reg: n }                    → REG(n) for LET locals
    //   { divu, mod, add, sub, mul }  → arithmetic
    //   { tonum, tostr }              → coercion

    function compileExpr(x, field_reg) {
      if (x === undefined || x === null) return bc.pass();
      if (typeof x === 'boolean') return x ? bc.pass() : bc.fail();
      if (typeof x === 'number')  return bc.intn(x);
      if (typeof x === 'string')  return bc.eq(field_reg, bc.str(x));

      var r = field_reg;

      if (x.and) return bc.and(x.and.map(function(e) { return compileExpr(e, r); }));
      if (x.or)  return bc.or(x.or.map(function(e)   { return compileExpr(e, r); }));
      if (x.not) return bc.not(compileExpr(x.not, r));

      if (x.eq  !== undefined) { if (Array.isArray(x.eq)) return bc.eq(compileVal(x.eq[0]), compileVal(x.eq[1])); return bc.eq(r, bc.str(String(x.eq))); }
      if (x.ne  !== undefined) { if (Array.isArray(x.ne)) return bc.ne(compileVal(x.ne[0]), compileVal(x.ne[1])); return bc.ne(r, bc.str(String(x.ne))); }
      if (x.pre !== undefined) return bc.pre(r, bc.str(String(x.pre)));
      if (x.suf !== undefined) return bc.suf(r, bc.str(String(x.suf)));
      if (x.inc !== undefined) return bc.inc(r, bc.str(String(x.inc)));

      if (x.lt  !== undefined) { if (Array.isArray(x.lt))  return bc.lt(compileVal(x.lt[0]),   compileVal(x.lt[1]));  return bc.lt(r,  bc.uint(x.lt));  }
      if (x.gt  !== undefined) { if (Array.isArray(x.gt))  return bc.gt(compileVal(x.gt[0]),   compileVal(x.gt[1]));  return bc.gt(r,  bc.uint(x.gt));  }
      if (x.lte !== undefined) { if (Array.isArray(x.lte)) return bc.lte(compileVal(x.lte[0]), compileVal(x.lte[1])); return bc.lte(r, bc.uint(x.lte)); }
      if (x.gte !== undefined) { if (Array.isArray(x.gte)) return bc.gte(compileVal(x.gte[0]), compileVal(x.gte[1])); return bc.gte(r, bc.uint(x.gte)); }

      if (x.type) {
        var t = x.type;
        if (t === 'string')  return bc.iss(r);
        if (t === 'number')  return bc.isn(r);
        if (t === 'null')    return bc.isx(r);
        if (t === 'bool')    return bc.isb(r);
      }

      if (x.length) return bc.lng(r, x.length[0], x.length[1]);

      if (x.seg) {
        var s = x.seg;
        var src = s.of ? compileVal(s.of) : r;
        var segexpr = bc.seg(src, s.sep || '_', compileVal({ num: s.idx || 0 }));
        if (s.match) return compileExpr(s.match, segexpr);
        return segexpr;
      }

      if (x.let) {
        var l = x.let;
        return bc.let_(l.bind, compileVal(l.def), compileExpr(l.body, r));
      }

      if (x.if) {
        return bc.if_(compileExpr(x.if.cond, r), compileExpr(x.if.then, r), compileExpr(x.if.else, r));
      }

      if (x.reg !== undefined) return bc.reg(x.reg);

      if (x.divu) return bc.divu(compileVal(x.divu[0]), compileVal(x.divu[1]));
      if (x.mod)  return bc.mod(compileVal(x.mod[0]),   compileVal(x.mod[1]));
      if (x.add)  return bc.add(compileVal(x.add[0]),   compileVal(x.add[1]));
      if (x.sub)  return bc.sub(compileVal(x.sub[0]),   compileVal(x.sub[1]));
      if (x.mul)  return bc.mul(compileVal(x.mul[0]),   compileVal(x.mul[1]));

      if (x.tonum) return bc.tonum(compileVal(x.tonum));
      if (x.tostr) return bc.tostr(compileVal(x.tostr));

      return bc.pass();
    }

    function compileVal(x) {
      if (typeof x === 'number') return bc.uint(x);
      if (typeof x === 'string') return bc.str(x);
      if (x && x.reg !== undefined) return bc.reg(x.reg);
      if (x && x.divu) return bc.divu(compileVal(x.divu[0]), compileVal(x.divu[1]));
      if (x && x.mod)  return bc.mod(compileVal(x.mod[0]),   compileVal(x.mod[1]));
      if (x && x.add)  return bc.add(compileVal(x.add[0]),   compileVal(x.add[1]));
      if (x && x.sub)  return bc.sub(compileVal(x.sub[0]),   compileVal(x.sub[1]));
      if (x && x.tonum) return bc.tonum(compileVal(x.tonum));
      if (x && x.seg) {
        var s = x.seg;
        var src = s.of ? compileVal(s.of) : bc.r0();
        return bc.seg(src, s.sep || '_', compileVal({ num: s.idx || 0 }));
      }
      if (x && x.num !== undefined) return bc.intn(x.num) ? bc.intn(x.num) : bc.uint(x.num);
      return bc.null_();
    }

    runtime.pen = function(spec) {
      var parts = [];

      if (spec.key)   parts.push(compileExpr(spec.key,   bc.r0()));
      if (spec.val)   parts.push(compileExpr(spec.val,   bc.r1()));
      if (spec.soul)  parts.push(compileExpr(spec.soul,  bc.r2()));
      if (spec.state) parts.push(compileExpr(spec.state, bc.r3()));
      if (spec.path)  parts.push(compileExpr(spec.path,  bc.r6()));

      var root = parts.length === 0 ? bc.pass()
               : parts.length === 1 ? parts[0]
               : bc.and(parts);

      // Build predicate bytecode, then append tail bytes AFTER expression root.
      // Tail bytes (0xC0..) are unreachable by WASM VM (which stops after root
      // expression), and are extracted by scanpolicy() on the GUN bridge layer.
      var pred = Array.from(bc.prog(root));

      if (spec.sign) pred.push(0xC0);
      if (spec.cert) {
        var cpub = Array.from(_enc.encode(String(spec.cert).slice(0, 255)));
        pred.push(0xC1, cpub.length);
        for (var ci = 0; ci < cpub.length; ci++) pred.push(cpub[ci]);
      }
      if (spec.open) pred.push(0xC3);
      if (spec.pow) {
        var powfield = (spec.pow.field || 0) & 0xFF;
        var powdiff  = (spec.pow.difficulty != null ? spec.pow.difficulty : 1) & 0xFF;
        var powunit  = spec.pow.unit ? String(spec.pow.unit).slice(0, 255) : '';
        var powubytes = Array.from(_enc.encode(powunit));
        pred.push(0xC4, powfield, powdiff, powubytes.length);
        for (var pi = 0; pi < powubytes.length; pi++) pred.push(powubytes[pi]);
      }
      if (spec.params !== undefined) {
        var params = stableparams(spec.params);
        var pbytes = Array.from(_enc.encode(params));
        pred.push(0xC5);
        Array.prototype.push.apply(pred, bc.uleb(pbytes.length));
        for (var qi = 0; qi < pbytes.length; qi++) pred.push(pbytes[qi]);
      }

      return '$' + pen.pack(new Uint8Array(pred));
    };

    // ── runtime.candle() — temporal window helper ─────────────────────────────────
    // Returns an expr (for use in spec.key) that validates the candle number
    // embedded at a key segment is within [current - back, current + fwd].
    //
    // opts: { seg: 0, sep: '_', size: 300000, back: 100, fwd: 2 }

    runtime.candle = function(opts) {
      var seg  = opts.seg  !== undefined ? opts.seg  : 0;
      var sep  = opts.sep  || '_';
      var size = opts.size || 300000;
      var back = opts.back !== undefined ? opts.back : 100;
      var fwd  = opts.fwd  !== undefined ? opts.fwd  : 2;

      return {
        let: {
          bind: 0,
          def: { divu: [{ reg: 4 }, size] },        // local[0] = floor(now / size)
          body: {
            let: {
              bind: 1,
              def: { tonum: { seg: { sep: sep, idx: seg, of: { reg: 0 } } } }, // local[1] = candle from key
              body: {
                and: [
                  { gte: [{ reg: 129 }, { sub: [{ reg: 128 }, back] }] },
                  { lte: [{ reg: 129 }, { add: [{ reg: 128 }, fwd]  }] }
                ]
              }
            }
          }
        }
      };
    };

    pen.pen = function(spec) {
      return runtime.pen(spec);
    };
    pen.candle = function(opts) {
      return runtime.candle(opts);
    };
  try { __defaultExport = pen; } catch(e) {}

  }
  __exp.default = __defaultExport;
});

__def('./src/zen/ripemd160.js', function(module, __exp){
  // Pure RIPEMD-160 implementation — no dependencies, no WebCrypto.
  // Spec: https://homes.esat.kuleuven.be/~bosselae/ripemd160.html

  const KL = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E];
  const KR = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000];

  // Message word indices
  const ML = [
     0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,
     7, 4,13, 1,10, 6,15, 3,12, 0, 9, 5, 2,14,11, 8,
     3,10,14, 4, 9,15, 8, 1, 2, 7, 0, 6,13,11, 5,12,
     1, 9,11,10, 0, 8,12, 4,13, 3, 7,15,14, 5, 6, 2,
     4, 0, 5, 9, 7,12, 2,10,14, 1, 3, 8,11, 6,15,13
  ];
  const MR = [
     5,14, 7, 0, 9, 2,11, 4,13, 6,15, 8, 1,10, 3,12,
     6,11, 3, 7, 0,13, 5,10,14,15, 8,12, 4, 9, 1, 2,
    15, 5, 1, 3, 7,14, 6, 9,11, 8,12, 2,10, 0, 4,13,
     8, 6, 4, 1, 3,11,15, 0, 5,12, 2,13, 9, 7,10,14,
    12,15,10, 4, 1, 5, 8, 7, 6, 2,13,14, 0, 3, 9,11
  ];

  // Shift amounts
  const SL = [
    11,14,15,12, 5, 8, 7, 9,11,13,14,15, 6, 7, 9, 8,
     7, 6, 8,13,11, 9, 7,15, 7,12,15, 9,11, 7,13,12,
    11,13, 6, 7,14, 9,13,15,14, 8,13, 6, 5,12, 7, 5,
    11,12,14,15,14,15, 9, 8, 9,14, 5, 6, 8, 6, 5,12,
     9,15, 5,11, 6, 8,13,12, 5,12,13,14,11, 8, 5, 6
  ];
  const SR = [
     8, 9, 9,11,13,15,15, 5, 7, 7, 8,11,14,14,12, 6,
     9,13,15, 7,12, 8, 9,11, 7, 7,12, 7, 6,15,13,11,
     9, 7,15,11, 8, 6, 6,14,12,13, 5,14,13,13, 7, 5,
    15, 5, 8,11,14,14, 6,14, 6, 9,12, 9,12, 5,15, 8,
     8, 5,12, 9,12, 5,14, 6, 8,13, 6, 5,15,13,11,11
  ];

  function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

  // Round selection functions (left: f1..f5, right: f5..f1)
  const FL = [
    (x, y, z) => (x ^ y ^ z) >>> 0,
    (x, y, z) => ((x & y) | (~x & z)) >>> 0,
    (x, y, z) => ((x | ~y) ^ z) >>> 0,
    (x, y, z) => ((x & z) | (y & ~z)) >>> 0,
    (x, y, z) => (x ^ (y | ~z)) >>> 0
  ];
  const FR = [FL[4], FL[3], FL[2], FL[1], FL[0]];

  function ripemd160(data) {
    const bytes = data instanceof Uint8Array ? data
      : data instanceof ArrayBuffer ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    const len = bytes.length;
    const bitLen = len * 8;
    const padLen = ((len + 9 + 63) & ~63);
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 8, bitLen >>> 0, true);
    dv.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);

    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    for (let off = 0; off < padLen; off += 64) {
      const M = [];
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);

      let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
      let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

      for (let i = 0; i < 80; i++) {
        const r = (i / 16) | 0;
        const sumL = (al + FL[r](bl, cl, dl) + M[ML[i]] + KL[r]) >>> 0;
        const tl = (rotl(sumL, SL[i]) + el) >>> 0;
        al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = tl;

        const sumR = (ar + FR[r](br, cr, dr) + M[MR[i]] + KR[r]) >>> 0;
        const tr = (rotl(sumR, SR[i]) + er) >>> 0;
        ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = tr;
      }

      const T = (h1 + cl + dr) >>> 0;
      h1 = (h2 + dl + er) >>> 0;
      h2 = (h3 + el + ar) >>> 0;
      h3 = (h4 + al + br) >>> 0;
      h4 = (h0 + bl + cr) >>> 0;
      h0 = T;
    }

    const out = new DataView(new ArrayBuffer(20));
    out.setUint32(0,  h0, true);
    out.setUint32(4,  h1, true);
    out.setUint32(8,  h2, true);
    out.setUint32(12, h3, true);
    out.setUint32(16, h4, true);
    return new Uint8Array(out.buffer);
  }

  __exp.default = ripemd160;
});

__def('./src/zen/format.js', function(module, __exp){
  // Format converters for zen.pair() output.
  // Receives raw BigInt scalars and {x,y} curve points; returns {curve, pub, epub, priv, epriv}.
  var keccak256 = __req('./src/zen/keccak256.js').default;
  var ripemd160 = __req('./src/zen/ripemd160.js').default;
  var shim = __req('./src/zen/shim.js').default;
  // ── shared helpers ────────────────────────────────────────────────────────────

  function bigIntToBytes32(n) {
    let hex = n.toString(16).padStart(64, '0');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function toHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Binary SHA-256 — uses WebCrypto directly on raw bytes (NOT via sha256.js JSON path)
  async function sha256Bytes(bytes) {
    const hash = await shim.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return new Uint8Array(hash);
  }

  // Base58Check encode
  const B58_ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58Encode(bytes) {
    const digits = [0];
    for (let i = 0; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] * 256;
        digits[j] = carry % 58;
        carry = Math.floor(carry / 58);
      }
      while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
    }
    let result = '';
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1';
    for (let i = digits.length - 1; i >= 0; i--) result += B58_ALPHA[digits[i]];
    return result;
  }

  async function base58Check(payload) {
    const h1 = await sha256Bytes(payload);
    const h2 = await sha256Bytes(h1);
    const out = new Uint8Array(payload.length + 4);
    out.set(payload); out.set(h2.slice(0, 4), payload.length);
    return base58Encode(out);
  }

  // ── EVM format ────────────────────────────────────────────────────────────────

  async function evmAddress(pub) {
    const xBytes = bigIntToBytes32(pub.x);
    const yBytes = bigIntToBytes32(pub.y);
    const raw = new Uint8Array(64);
    raw.set(xBytes, 0); raw.set(yBytes, 32);
    // keccak256 of raw 64-byte uncompressed key (without 04 prefix)
    const hash = await keccak256(raw);
    const addrHex = toHex(hash.slice(-20));
    // EIP-55 checksum
    const ckHash = toHex(await keccak256(addrHex));
    let addr = '0x';
    for (let i = 0; i < 40; i++) {
      addr += parseInt(ckHash[i], 16) >= 8 ? addrHex[i].toUpperCase() : addrHex[i];
    }
    return addr;
  }

  function evmPrivHex(priv) {
    return '0x' + toHex(bigIntToBytes32(priv));
  }

  function evmEncPub(pub) {
    // Uncompressed pubkey: 0x04 + 32-byte x + 32-byte y
    const out = new Uint8Array(65);
    out[0] = 0x04;
    out.set(bigIntToBytes32(pub.x), 1);
    out.set(bigIntToBytes32(pub.y), 33);
    return '0x' + toHex(out);
  }

  // ── BTC format ────────────────────────────────────────────────────────────────

  function compressedPubBytes(pub) {
    const out = new Uint8Array(33);
    out[0] = pub.y & 1n ? 0x03 : 0x02;
    out.set(bigIntToBytes32(pub.x), 1);
    return out;
  }

  async function btcAddress(pub) {
    // P2PKH mainnet: Base58Check(0x00 + RIPEMD160(SHA256(compressed_pubkey)))
    const compressed = compressedPubBytes(pub);
    const sha = await sha256Bytes(compressed);
    const ripd = ripemd160(sha);
    const payload = new Uint8Array(21);
    payload[0] = 0x00;
    payload.set(ripd, 1);
    return base58Check(payload);
  }

  async function btcWIF(priv) {
    // WIF mainnet compressed: Base58Check(0x80 + 32-byte-priv + 0x01)
    const privBytes = bigIntToBytes32(priv);
    const payload = new Uint8Array(34);
    payload[0] = 0x80;
    payload.set(privBytes, 1);
    payload[33] = 0x01;
    return base58Check(payload);
  }

  function btcCompressedHex(pub) {
    return '0x' + toHex(compressedPubBytes(pub));
  }

  // ── main export ───────────────────────────────────────────────────────────────

  async function applyFormat(format, curveName, core, raw) {
    const { signPriv, signPub, encPriv, encPub } = raw;
    const out = { curve: curveName };

    if (format === 'zen') {
      if (signPriv) { out.priv = core.scalarToString(signPriv); }
      if (signPub)  { out.pub  = core.pointToPub(signPub); }
      if (encPriv)  { out.epriv = core.scalarToString(encPriv); }
      if (encPub)   { out.epub  = core.pointToPub(encPub); }
      return out;
    }

    if (format === 'evm') {
      if (signPub)  { out.pub   = await evmAddress(signPub); }
      if (signPriv) { out.priv  = evmPrivHex(signPriv); }
      if (encPub)   { out.epub  = evmEncPub(encPub); }
      if (encPriv)  { out.epriv = evmPrivHex(encPriv); }
      return out;
    }

    if (format === 'btc') {
      if (signPub)  { out.pub   = await btcAddress(signPub); }
      if (signPriv) { out.priv  = await btcWIF(signPriv); }
      if (encPub)   { out.epub  = btcCompressedHex(encPub); }
      if (encPriv)  { out.epriv = await btcWIF(encPriv); }
      return out;
    }

    throw new Error('Unknown format: ' + format + '. Supported: zen, evm, btc');
  }

  __exp.default = applyFormat;
});

__def('./src/zen/pair.js', function(module, __exp){
  var crv = __req('./src/zen/curves/curves.js').default;
  var applyFormat = __req('./src/zen/format.js').default;
  async function derivepriv(c, priv, seed, label) {
    for (let i = 0; i < 100; i++) {
      const off = await c.hashToScalar(seed, label + (i ? i : ''));
      const d = c.mod(priv + off, c.N);
      if (d !== 0n) { return d; }
    }
    throw new Error('Failed to derive non-zero private key');
  }

  async function derivepub(c, pt, seed, label) {
    for (let i = 0; i < 100; i++) {
      const off = await c.hashToScalar(seed, label + (i ? i : ''));
      const d = c.pointAdd(pt, c.pointMultiply(off, c.G));
      if (d) { return d; }
    }
    throw new Error('Failed to derive valid public key');
  }

  async function pair(cb, opt) {
    try {
      opt = opt || {};
      const curveName = opt.curve || 'secp256k1';
      const c = crv(curveName);
      if (opt.curve && c.curve !== curveName && curveName !== 'secp256r1') { throw new Error('Unknown curve: ' + curveName); }
      const format = opt.format || 'zen';
      // Use c.curve as the canonical name for deterministic labels so that
      // aliases (secp256r1 → p256) produce the same key from the same seed.
      const labelCurve = c.curve;

      let spriv = null, spub = null, epriv = null, epub = null;

      if (opt.seed && (opt.priv || opt.epriv || opt.pub || opt.epub)) {
        // Additive derivation from existing key + seed
        if (opt.priv) {
          spriv = await derivepriv(c, c.parseScalar(opt.priv, 'Signing key'), opt.seed, 'ZEN.DERIVE|sign|');
          spub = c.publicFromPrivate(spriv);
        }
        if (opt.epriv) {
          epriv = await derivepriv(c, c.parseScalar(opt.epriv, 'Encryption key'), opt.seed, 'ZEN.DERIVE|encrypt|');
          epub = c.publicFromPrivate(epriv);
        }
        if (opt.pub) {
          spub = await derivepub(c, c.parsePub(opt.pub), opt.seed, 'ZEN.DERIVE|sign|');
        }
        if (opt.epub) {
          epub = await derivepub(c, c.parsePub(opt.epub), opt.seed, 'ZEN.DERIVE|encrypt|');
        }
      } else {
        // Generate fresh or restore from private / seed
        spriv = opt.priv  ? c.parseScalar(opt.priv,  'Signing key')    : null;
        epriv  = opt.epriv ? c.parseScalar(opt.epriv, 'Encryption key') : null;

        // Seed labels use canonical c.curve so aliases (secp256r1 ≡ p256) share the same key.
        // For secp256k1: 'ZEN|secp256k1|sign|' matches the original hardcoded value — backward compat.
        if (!spriv && opt.seed) { spriv = await c.hashToScalar(opt.seed, 'ZEN|' + labelCurve + '|sign|'); }
        if (!spriv  && opt.seed) { spriv = await c.hashToScalar(opt.seed, 'ZEN|' + labelCurve + '|sign|'); }
        if (!epriv  && opt.seed) { epriv = await c.hashToScalar(opt.seed, 'ZEN|' + labelCurve + '|encrypt|'); }
        if (!spriv  && !opt.pub)  { spriv = await c.randomScalar(); }
        if (!epriv  && !opt.epub) { epriv = await c.randomScalar(); }

        if (spriv) { spub = c.publicFromPrivate(spriv); }
        else if (opt.pub)  { spub = c.parsePub(opt.pub); }

        if (epriv)  { epub = c.publicFromPrivate(epriv); }
        else if (opt.epub) { epub = c.parsePub(opt.epub); }
      }

      const out = await applyFormat(format, labelCurve, c, { signPriv: spriv, signPub: spub, encPriv: epriv, encPub: epub });
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) {
        try { cb(); } catch (cbErr) { console.log(cbErr); }
        return;
      }
      throw e;
    }
  }


  __exp.default = pair;

  __exp.pair = pair;
});

__def('./src/zen/encrypt.js', function(module, __exp){
  var core = __req('./src/zen/curves/secp256k1.js').default;
  async function encrypt(data, pair, cb, opt) {
    try {
      opt = opt || {};
      const key = (pair || opt).epriv || pair;
      if (data === undefined) { throw new Error('`undefined` not allowed.'); }
      if (!key) { throw new Error('No encryption key.'); }
      const message = typeof data === 'string' ? data : await core.shim.stringify(data);
      const rand = { s: core.shim.random(9), iv: core.shim.random(15) };
      const aes = await core.aeskey(key, rand.s, opt);
      const ct = await core.shim.subtle.encrypt({
        name: opt.name || 'AES-GCM',
        iv: new Uint8Array(rand.iv)
      }, aes, new core.shim.TextEncoder().encode(message));
      const out = {
        ct: core.shim.Buffer.from(ct, 'binary').toString(opt.encode || 'base64'),
        iv: rand.iv.toString(opt.encode || 'base64'),
        s: rand.s.toString(opt.encode || 'base64')
      };
      return core.finalize(out, opt, cb);
    } catch (e) {
      if (cb) {
        try { cb(); } catch (cbErr) { console.log(cbErr); }
        return;
      }
      throw e;
    }
  }


  __exp.default = encrypt;

  __exp.encrypt = encrypt;
});

__def('./src/zen/decrypt.js', function(module, __exp){
  var core = __req('./src/zen/curves/secp256k1.js').default;
  async function decrypt(data, pair, cb, opt) {
    try {
      opt = opt || {};
      const key = (pair || opt).epriv || pair;
      if (!key) { throw new Error('No decryption key.'); }
      const parsed = await core.settings.parse(data);
      const salt = core.shim.Buffer.from(parsed.s, opt.encode || 'base64');
      const iv = core.shim.Buffer.from(parsed.iv, opt.encode || 'base64');
      const ct = core.shim.Buffer.from(parsed.ct, opt.encode || 'base64');
      const aes = await core.aeskey(key, salt, opt);
      const decrypted = await core.shim.subtle.decrypt({
        name: opt.name || 'AES-GCM',
        iv: new Uint8Array(iv),
        tagLength: 128
      }, aes, new Uint8Array(ct));
      const out = await core.settings.parse(new core.shim.TextDecoder('utf8').decode(decrypted));
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) {
        try { cb(); } catch (cbErr) { console.log(cbErr); }
        return;
      }
      throw e;
    }
  }


  __exp.default = decrypt;

  __exp.decrypt = decrypt;
});

__def('./src/zen/secret.js', function(module, __exp){
  var crv = __req('./src/zen/curves/curves.js').default;
  async function secret(epub, pair, cb, opt) {
    try {
      opt = opt || {};
      if (!pair || !pair.epriv) { throw new Error('No secret mix.'); }
      const c = crv(pair.curve);
      const peer = epub && epub.epub ? epub.epub : epub;
      const pt  = c.parsePub(peer);
      const priv = c.parseScalar(pair.epriv, 'Encryption key');
      const shared = c.pointMultiply(priv, pt);
      if (!shared) { throw new Error('Could not derive shared secret'); }
      const h = await c.shaBytes(c.compactPoint(shared));
      const out = c.base62.bufToB62(h);
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) { try { cb(); } catch (x) { console.log(x); } return; }
      throw e;
    }
  }


  __exp.default = secret;

  __exp.secret = secret;
});

__def('./src/zen/certify.js', function(module, __exp){
  var sign = __req('./src/zen/sign.js').default;
  /*
    The Certify Protocol was made out of love by a Vietnamese code enthusiast.
    Vietnamese people around the world deserve respect!
    IMPORTANT: A Certificate is like a Signature. No one knows who (authority)
    created/signed a cert until you put it into their graph.
  */

  // RAD/LEX object key detection
  var RAD = ['+', '#', '.', '=', '*', '>', '<'];
  function israd(obj) {
    if (!obj || typeof obj !== 'object') { return false; }
    for (var i = 0; i < RAD.length; i++) { if (RAD[i] in obj) { return true; } }
    return false;
  }

  // Normalize certificants → '*' | pub_string | [pub_string, ...]
  function normcerts(raw) {
    if (!raw) { return null; }
    if (typeof raw === 'string') {
      return raw.indexOf('*') > -1 ? '*' : raw;
    }
    if (!Array.isArray(raw) && typeof raw === 'object' && raw.pub) {
      return raw.pub;
    }
    if (Array.isArray(raw)) {
      if (raw.indexOf('*') > -1) { return '*'; }
      // single element short-circuit
      if (raw.length === 1 && raw[0]) {
        var x = raw[0];
        if (typeof x === 'string') { return x; }
        if (typeof x === 'object' && x.pub) { return x.pub; }
        return null;
      }
      var list = [];
      raw.forEach(function(x) {
        if (typeof x === 'string') { list.push(x); }
        else if (x && typeof x === 'object' && x.pub) { list.push(x.pub); }
      });
      return list.length > 0 ? list : null;
    }
    return null;
  }

  async function certify(certs, pol, auth, cb, opt) {
    try {
      opt = opt || {};
      pol = pol || {};

      var c = normcerts(certs);
      if (!c) { console.log('No certificant found.'); return; }

      var r = (pol.read) ? pol.read : null;
      var w = (pol.write) ? pol.write
            : (typeof pol === 'string' || Array.isArray(pol) || israd(pol)) ? pol
            : null;

      if (!r && !w) { console.log('No policy found.'); return; }

      var expiry = (opt.expiry !== undefined && opt.expiry !== null)
        ? parseFloat(opt.expiry) : null;

      var blk = opt.block || opt.blacklist || opt.ban || {};
      var rb = (blk.read && (typeof blk.read === 'string' || (blk.read || {})['#']))
        ? blk.read : null;
      var wb = typeof blk === 'string' ? blk
        : (blk.write && (typeof blk.write === 'string' || (blk.write || {})['#']))
          ? blk.write : null;

      var data = JSON.stringify(Object.assign(
        { c: c },
        expiry ? { e: expiry } : {},
        r ? { r: r } : {},
        w ? { w: w } : {},
        rb ? { rb: rb } : {},
        wb ? { wb: wb } : {}
      ));

      var cert = await sign(data, auth, null, { raw: 1 });
      var out = opt.raw ? cert : JSON.stringify(cert);
      if (cb) { try { cb(out); } catch (e) { console.log(e); } }
      return out;
    } catch (e) {
      if (cb) { try { cb(); } catch (x) { console.log(x); } return; }
      throw e;
    }
  }


  __exp.default = certify;

  __exp.certify = certify;
});

__def('./src/zen/keyid.js', function(module, __exp){
  var shim = __req('./src/zen/shim.js').default;
  var base62 = __req('./src/zen/base62.js').default;
  async function sha1hash(bytes) {
    const crypto = shim.ossl || shim.subtle;
    return crypto.digest({ name: 'SHA-1' }, new Uint8Array(bytes));
  }

  async function keyid(pub) {
    const xy = base62.pubToJwkXY(pub);
    const pb = shim.Buffer.concat(
      [xy.x, xy.y].map(function(t) {
        return shim.Buffer.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), 'binary');
      })
    );
    const id = shim.Buffer.concat([
      shim.Buffer.from([0x99, pb.length / 0x100, pb.length % 0x100]),
      pb
    ]);
    const hash = shim.Buffer.from(await sha1hash(id), 'binary');
    return hash.toString('hex', hash.length - 8);
  }

  __exp.default = keyid;
});

__def('./src/zen/runtime.js', function(module, __exp){
  var security = __req('./src/zen/security.js').default;

  __exp.default = security;

  __exp.security = security;
});

__def('./src/zen/book.js', function(module, __exp){
  let __defaultExport;


  // TODO: BUG! Unbuild will make these globals... CHANGE unbuild to wrap files in a function.
  // Book is a replacement for JS objects, maps, dictionaries.
  var sT = setTimeout, B = sT.Book || (sT.Book = function(text){
  	var b = function book(word, is){
  		var has = b.all[word], p;
  		if(is === undefined){ return (has && has.is) || b.get(has || word) }
  		if(has){
  			if(p = has.page){
  				p.size += size(is) - size(has.is);
  				p.text = '';
  			}
  			has.text = '';
  			has.is = is;
  			return b;
  		}
  		//b.all[word] = {is: word}; return b;
  		return b.set(word, is);
  	};
  	// TODO: if from text, preserve the separator symbol.
  	b.list = [{from: text, size: (text||'').length, substring: sub, toString: to, book: b, get: b, read: list}];
  	b.page = page;
  	b.set = set;
  	b.get = get;
  	b.all = {};
  	return b;
  }), PAGE = 2**12;

  function page(word){
  	var b = this, l = b.list, i = spot(word, l, b.parse), p = l[i];
  	if('string' == typeof p){ l[i] = p = {size: -1, first: b.parse? b.parse(p) : p, substring: sub, toString: to, book: b, get: b, read: list} } // TODO: test, how do we arrive at this condition again?
  	//p.i = i;
  	return p;
  	// TODO: BUG! What if we get the page, it turns out to be too big & split, we must then RE get the page!
  }
  function get(word){
  	if(!word){ return }
  	if(undefined !== word.is){ return word.is } // JS falsey values!
  	var b = this, has = b.all[word];
  	if(has){ return has.is }
  	// get does an exact match, so we would have found it already, unless parseless page:
  	var page = b.page(word), l, has, a, i;
  	if(!page || !page.from){ return } // no parseless data
  	return got(word, page);
  }
  function got(word, page){
  	var b = page.book, l, has, a, i;
  	if(l = from(page)){ has = l[got.i = i = spot(word, l, B.decode)]; } // TODO: POTENTIAL BUG! This assumes that each word on a page uses the same serializer/formatter/structure. // TOOD: BUG!!! Not actually, but if we want to do non-exact radix-like closest-word lookups on a page, we need to check limbo & potentially sort first.
  	// parseless may return -1 from actual value, so we may need to test both. // TODO: Double check? I think this is correct.
  	if(has && word == has.word){ return (b.all[word] = has).is }
  	if('string' != typeof has){ has = l[got.i = i+=1] }
  	if(has && word == has.word){ return (b.all[word] = has).is }
  	a = slot(has) // Escape!
  	if(word != B.decode(a[0])){
  		has = l[got.i = i+=1]; // edge case bug?
  		a = slot(has); // edge case bug?
  		if(word != B.decode(a[0])){ return }
  	}
  	has = l[i] = b.all[word] = {word: ''+word, is: B.decode(a[1]), page: page, substring: subt, toString: tot}; // TODO: convert to a JS value!!! Maybe index! TODO: BUG word needs a page!!!! TODO: Check for other types!!!
  	return has.is;
  }

  function spot(word, sorted, parse){ parse = parse || spot.no || (spot.no = function(t){ return t }); // TODO: BUG???? Why is there substring()||0 ? // TODO: PERF!!! .toString() is +33% faster, can we combine it with the export?
  	var L = sorted, min = 0, page, found, l = (word=''+word).length, max = L.length, i = max/2;
  	while(((word < (page = (parse(L[i=i>>0])||'').substring())) || ((parse(L[i+1])||'').substring() <= word)) && i != min){ // L[i] <= word < L[i+1]
  		i += (page <= word)? (max - (min = i))/2 : -((max = i) - min)/2;
  	}
  	return i;
  }

  function from(a, t, l){
  	if('string' != typeof a.from){ return a.from }
  	//(l = a.from = (t = a.from||'').substring(1, t.length-1).split(t[0])); // slot
  	(l = a.from = slot(t = t||a.from||''));
  	return l;
  }
  function list(each){ each = each || function(x){return x} 
  	var i = 0, l = sort(this), w, r = [], p = this.book.parse || function(){};
  	//while(w = l[i++]){ r.push(each(slot(w)[1], p(w)||w, this)) }
  	while(w = l[i++]){ r.push(each(this.get(w = w.word||p(w)||w), w, this)) } // TODO: BUG! PERF?
  	return r;
  }

  function set(word, is){
  	// TODO: Perf on random write is decent, but short keys or seq seems significantly slower.
  	var b = this, has = b.all[word];
  	if(has){ return b(word, is) } // updates to in-memory items will always match exactly.
  	var page = b.page(word=''+word), tmp; // before we assume this is an insert tho, we need to check
  	if(page && page.from){ // if it could be an update to an existing word from parseless.
  		b.get(word);
  		if(b.all[word]){ return b(word, is) }
  	}
  	// MUST be an insert:
  	has = b.all[word] = {word: word, is: is, page: page, substring: subt, toString: tot};
  	page.first = (page.first < word)? page.first : word;
  	if(!page.limbo){ (page.limbo = []) }
  	page.limbo.push(has);
  	b(word, is);
  	page.size += size(word) + size(is);
  	if((b.PAGE || PAGE) < page.size){ split(page, b) }
  	return b;
  }

  function split(p, b){ // TODO: use closest hash instead of half.
  	//console.time();
  	//var S = performance.now();
  	var L = sort(p), l = L.length, i = l/2 >> 0, j = i, half = L[j], tmp;
  	//console.timeEnd();
  	var next = {first: half.substring(), size: 0, substring: sub, toString: to, book: b, get: b, read: list}, f = next.from = [];
  	while(tmp = L[i++]){
  		f.push(tmp);
  		next.size += (tmp.is||'').length||1;
  		tmp.page = next;
  	}
  	p.from = p.from.slice(0, j);
  	p.size -= next.size;
  	b.list.splice(spot(next.first, b.list)+1, 0, next); // TODO: BUG! Make sure next.first is decoded text. // TODO: BUG! spot may need parse too?
  	//console.timeEnd();
  	if(b.split){ b.split(next, p) }
  	//console.log(S = (performance.now() - S), 'split');
  	//console.BIG = console.BIG > S? console.BIG : S;
  }

  function slot(t){ return heal((t=t||'').substring(1, t.length-1).split(t[0]), t[0]) } B.slot = slot; // TODO: check first=last & pass `s`.
  function heal(l, s){ var i, e;
  	if(0 > (i = l.indexOf(''))){ return l } // ~700M ops/sec on 4KB of Math.random()s, even faster if escape does exist.
  	if('' == l[0] && 1 == l.length){ return [] } // annoying edge cases! how much does this slow us down?
  	//if((c=i+2+parseInt(l[i+1])) != c){ return [] } // maybe still faster than below?
  	if((e=i+2+parseInt((e=l[i+1]).substring(0, e.indexOf('"'))||e)) != e){ return [] } // NaN check in JS is weird.
  	l[i] = l.slice(i, e).join(s||'|'); // rejoin the escaped value
  	return l.slice(0,i+1).concat(heal(l.slice(e), s)); // merge left with checked right.
  }

  function size(t){ return (t||'').length||1 } // bits/numbers less size? Bug or feature?
  function subt(i,j){ return this.word }
  //function tot(){ return this.text = this.text || "'"+(this.word)+"'"+(this.is)+"'" }
  function tot(){ var tmp = {};
  	//if((tmp = this.page) && tmp.saving){ delete tmp.book.all[this.word]; } // TODO: BUG! Book can't know about RAD, this was from RAD, so this MIGHT be correct but we need to refactor. Make sure to add tests that will re-trigger this.
  	return this.text = this.text || ":"+B.encode(this.word)+":"+B.encode(this.is)+":";
  	tmp[this.word] = this.is;
  	return this.text = this.text || B.encode(tmp,'|',':').slice(1,-1);
  	//return this.text = this.text || "'"+(this.word)+"'"+(this.is)+"'";
  }
  function sub(i,j){ return (this.first||this.word||B.decode((from(this)||'')[0]||'')).substring(i,j) }
  function to(){ return this.text = this.text || text(this) }
  function text(p){ // PERF: read->[*] : text->"*" no edit waste 1 time perf.
  	if(p.limbo){ sort(p) } // TODO: BUG? Empty page meaning? undef, '', '||'?
  	return ('string' == typeof p.from)? p.from : '|'+(p.from||[]).join('|')+'|';
  }

  function sort(p, l){
  	var f = p.from = ('string' == typeof p.from)? slot(p.from) : p.from||[];
  	if(!(l = l || p.limbo)){ return f }
  	return mix(p).sort(function(a,b){
  		return (a.word||B.decode(''+a)) < (b.word||B.decode(''+b))? -1:1;
  	});
  }
  function mix(p, l){ // TODO: IMPROVE PERFORMANCE!!!! l[j] = i is 5X+ faster than .push(
  	l = l || p.limbo || []; p.limbo = null;
  	var j = 0, i, f = p.from;
  	while(i = l[j++]){
  		if(got(i.word, p)){
  			f[got.i] = i; // TODO: Trick: allow for a ZEN'S HAM CRDT hook here.
  		} else {
  			f.push(i); 
  		}
  	}
  	return f;
  }

  B.encode = function(d, s, u){ s = s || "|"; u = u || String.fromCharCode(32);
  	switch(typeof d){
  		case 'string': // text
  			var i = d.indexOf(s), c = 0;
  			while(i != -1){ c++; i = d.indexOf(s, i+1) }
  			return (c?s+c:'')+ '"' + d;
  		case 'number': return (d < 0)? ''+d : '+'+d;
  		case 'boolean': return d? '+' : '-';
  		case 'object': if(!d){ return ' ' } // TODO: BUG!!! Nested objects don't slot correctly
  			var l = Object.keys(d).sort(), i = 0, t = s, k, v;
  			while(k = l[i++]){ t += u+B.encode(k,s,u)+u+B.encode(d[k],s,u)+u+s }
  			return t;
  	}
  }
  B.decode = function(t, s){ s = s || "|";
  	if('string' != typeof t){ return }
  	switch(t){ case ' ': return null; case '-': return false; case '+': return true; }
  	switch(t[0]){
  		case '-': case '+': return parseFloat(t);
  		case '"': return t.slice(1);
  	}
  	return t.slice(t.indexOf('"')+1);
  }

  B.hash = function(s, c){ // via SO
  	if(typeof s !== 'string'){ return }
    c = c || 0; // CPU schedule hashing by
    if(!s.length){ return c }
    for(var i=0,l=s.length,n; i<l; ++i){
      n = s.charCodeAt(i);
      c = ((c<<5)-c)+n;
      c |= 0;
    }
    return c;
  }

  function record(key, val){ return key+B.encode(val)+"%"+key.length }
  function decord(t){
  	var o = {}, i = t.lastIndexOf("%"), c = parseFloat(t.slice(i+1));
  	o[t.slice(0,c)] = B.decode(t.slice(c,i));
  	return o;
  }

  try{__defaultExport =B}catch(e){}


  __exp.default = __defaultExport;
});

__def('./src/zen/chain.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  // WARNING: ZEN is very simple, but the JavaScript chaining API around ZEN
  // is complicated and was extremely hard to build. If you port ZEN to another
  // language, consider implementing an easier API to build.
  var Zen = __root;
  Zen.chain.chain = function(sub){
  	var zen = this, at = zen._, chain = new (sub || zen).constructor(zen), cat = chain._, root;
  	cat.root = root = at.root;
  	cat.id = ++root.once;
  	cat.back = zen._;
  	cat.on = Zen.on;
  	cat.on('in', Zen.on.in, cat); // For 'in' if I add my own listeners to each then I MUST do it before in gets called. If I listen globally for all incoming data instead though, regardless of individual listeners, I can transform the data there and then as well.
  	cat.on('out', Zen.on.out, cat); // However for output, there isn't really the global option. I must listen by adding my own listener individually BEFORE this one is ever called.
  	return chain;
  }

  function output(msg){
  	var put, get, at = this.as, back = at.back, root = at.root, tmp;
  	if(!msg.$){ msg.$ = at.$ }
  	this.to.next(msg);
  	if(at.err){ at.on('in', {put: at.put = u, $: at.$}); return }
  	if(get = msg.get){
  		/*if(u !== at.put){
  			at.on('in', at);
  			return;
  		}*/
  		if(root.pass){ root.pass[at.id] = at; } // will this make for buggy behavior elsewhere?
  		if(at.lex){ Object.keys(at.lex).forEach(function(k){ tmp[k] = at.lex[k] }, tmp = msg.get = msg.get || {}) }
  		if(get['#'] || at.soul){
  			get['#'] = get['#'] || at.soul;
  			//root.graph[get['#']] = root.graph[get['#']] || {_:{'#':get['#'],'>':{}}};
  			msg['#'] || (msg['#'] = text_rand(9)); // A3120 ?
  			back = (sget(root, get['#'])._);
  			if(!(get = get['.'])){ // soul
  				tmp = back.ask && back.ask['']; // check if we have already asked for the full node
  				(back.ask || (back.ask = {}))[''] = back; // add a flag that we are now.
  				if(u !== back.put){ // if we already have data,
  					back.on('in', back); // send what is cached down the chain
  					if(tmp){ return } // and don't ask for it again.
  				}
  				msg.$ = back.$;
  			} else
  			if(obj_has(back.put, get)){ // TODO: support #LEX !
  				tmp = back.ask && back.ask[get];
  				(back.ask || (back.ask = {}))[get] = back.$.get(get)._;
  				back.on('in', {get: get, put: {'#': back.soul, '.': get, ':': back.put[get], '>': state_is(root.graph[back.soul], get)}});
  				if(tmp){ return }
  			}
  				/*put = (back.$.get(get)._);
  				if(!(tmp = put.ack)){ put.ack = -1 }
  				back.on('in', {
  					$: back.$,
  					put: Zen.state.ify({}, get, Zen.state(back.put, get), back.put[get]),
  					get: back.get
  				});
  				if(tmp){ return }
  			} else
  			if('string' != typeof get){
  				var put = {}, meta = (back.put||{})._;
  				Zen.obj.map(back.put, function(v,k){
  					if(!Zen.text.match(k, get)){ return }
  					put[k] = v;
  				})
  				if(!Zen.obj.empty(put)){
  					put._ = meta;
  					back.on('in', {$: back.$, put: put, get: back.get})
  				}
  				if(tmp = at.lex){
  					tmp = (tmp._) || (tmp._ = function(){});
  					if(back.ack < tmp.ask){ tmp.ask = back.ack }
  					if(tmp.ask){ return }
  					tmp.ask = 1;
  				}
  			}
  			*/
  			root.ask(ack, msg); // A3120 ?
  			return root.on('in', msg);
  		}
  		//if(root.now){ root.now[at.id] = root.now[at.id] || true; at.pass = {} }
  		if(get['.']){
  			if(at.get){
  				msg = {get: {'.': at.get}, $: at.$};
  				(back.ask || (back.ask = {}))[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
  				return back.on('out', msg);
  			}
  			msg = {get: at.lex? msg.get : {}, $: at.$};
  			return back.on('out', msg);
  		}
  		(at.ask || (at.ask = {}))[''] = at;	 //at.ack = at.ack || -1;
  		if(at.get){
  			get['.'] = at.get;
  			(back.ask || (back.ask = {}))[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
  			return back.on('out', msg);
  		}
  	}
  	return back.on('out', msg);
  }; Zen.on.out = output;

  function input(msg, cat){ cat = cat || this.as; // TODO: V8 may not be able to optimize functions with different parameter calls, so try to do benchmark to see if there is any actual difference.
  	var root = cat.root, zen = msg.$ || (msg.$ = cat.$), at = (zen||'')._ || empty, tmp = msg.put||'', soul = tmp['#'], key = tmp['.'], change = (u !== tmp['='])? tmp['='] : tmp[':'], state = tmp['>'] || -Infinity, sat; // eve = event, at = data at, cat = chain at, sat = sub at (children chains).
  	if(u !== msg.put && (u === tmp['#'] || u === tmp['.'] || (u === tmp[':'] && u === tmp['=']) || u === tmp['>'])){ // convert from old format
  		if(!valid(tmp)){
  			if(!(soul = ((tmp||'')._||'')['#'])){ console.log("chain not yet supported for", tmp, '...', msg, cat); return; }
  			zen = sget(cat.root, soul);
  			return setTimeout.each(Object.keys(tmp).sort(), function(k){ // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync?
  				if('_' == k || u === (state = state_is(tmp, k))){ return }
  				cat.on('in', {$: zen, put: {'#': soul, '.': k, '=': tmp[k], '>': state}, VIA: msg});
  			});
  		}
  		cat.on('in', {$: at.back.$, put: {'#': soul = at.back.soul, '.': key = at.has || at.get, '=': tmp, '>': state_is(at.back.put, key)}, via: msg}); // TODO: This could be buggy! It assumes/approxes data, other stuff could have corrupted it.
  		return;
  	}
  	if((msg.seen||'')[cat.id]){ return } (msg.seen || (msg.seen = function(){}))[cat.id] = cat; // help stop some infinite loops

  	if(cat !== at){ // don't worry about this when first understanding the code, it handles changing contexts on a message. A soul chain will never have a different context.
  		Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] }, tmp = {}); // make copy of message
  		tmp.get = cat.get || tmp.get;
  		if(!cat.soul && !cat.has){ // if we do not recognize the chain type
  			tmp.$$$ = tmp.$$$ || cat.$; // make a reference to wherever it came from.
  		} else
  		if(at.soul){ // a has (property) chain will have a different context sometimes if it is linked (to a soul chain). Anything that is not a soul or has chain, will always have different contexts.
  			tmp.$ = cat.$;
  			tmp.$$ = tmp.$$ || at.$;
  		}
  		msg = tmp; // use the message with the new context instead;
  	}
  	unlink(msg, cat);

  	if((((cat.soul)/* && (cat.ask||'')['']*/) || msg.$$) && state >= state_is(root.graph[soul], key)){ // The root has an in-memory cache of the graph, but if our peer has asked for the data then we want a per deduplicated chain copy of the data that might have local edits on it.
  		(tmp = sget(root, soul)._).put = state_ify(tmp.put, key, state, change, soul);
  	}
  	if(!at.soul /*&& (at.ask||'')['']*/ && state >= state_is(root.graph[soul], key) && (sat = (sget(root, soul)._.next||'')[key])){ // Same as above here, but for other types of chains. // TODO: Improve perf by preventing echoes recaching.
  		sat.put = change; // update cache
  		if('string' == typeof (tmp = valid(change))){
  			sat.put = sget(root, tmp)._.put || change; // share same cache as what we're linking to.
  		}
  	}

  	this.to && this.to.next(msg); // 1st API job is to call all chain listeners.
  	// TODO: Make input more reusable by only doing these (some?) calls if we are a chain we recognize? This means each input listener would be responsible for when listeners need to be called, which makes sense, as they might want to filter.
  	cat.any && setTimeout.each(Object.keys(cat.any), function(any){ (any = cat.any[any]) && any(msg) },0,99); // 1st API job is to call all chain listeners. // TODO: .keys( is slow // BUG: Some re-in logic may depend on this being sync.
  	cat.echo && setTimeout.each(Object.keys(cat.echo), function(lat){ (lat = cat.echo[lat]) && lat.on('in', msg) },0,99); // & linked at chains // TODO: .keys( is slow // BUG: Some re-in logic may depend on this being sync.

  	if(((msg.$$||'')._||at).soul){ // comments are linear, but this line of code is non-linear, so if I were to comment what it does, you'd have to read 42 other comments first... but you can't read any of those comments until you first read this comment. What!? // shouldn't this match link's check?
  		// is there cases where it is a $$ that we do NOT want to do the following? 
  		if((sat = cat.next) && (sat = sat[key])){ // TODO: possible trick? Maybe have `ionmap` code set a sat? // TODO: Maybe we should do `cat.ask` instead? I guess does not matter.
  			tmp = {}; Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] });
  			tmp.$ = (msg.$$||msg.$).get(tmp.get = key); delete tmp.$$; delete tmp.$$$;
  			sat.on('in', tmp);
  		}
  	}

  	link(msg, cat);
  }; Zen.on.in = input;

  function link(msg, cat){ cat = cat || this.as || msg.$._;
  	if(msg.$$ && this !== Zen.on){ return } // $$ means we came from a link, so we are at the wrong level, thus ignore it unless overruled manually by being called directly.
  	if(!msg.put || cat.soul){ return } // But you cannot overrule being linked to nothing, or trying to link a soul chain - that must never happen.
  	var put = msg.put||'', link = put['=']||put[':'], tmp;
  	var root = cat.root, tat = sget(root, put['#']).get(put['.'])._;
  	if('string' != typeof (link = valid(link))){
  		if(this === Zen.on){ (tat.echo || (tat.echo = {}))[cat.id] = cat } // allow some chain to explicitly force linking to simple data.
  		return; // by default do not link to data that is not a link.
  	}
  	if((tat.echo || (tat.echo = {}))[cat.id] // we've already linked ourselves so we do not need to do it again. Except... (annoying implementation details)
  		&& !(root.pass||'')[cat.id]){ return } // if a new event listener was added, we need to make a pass through for it. The pass will be on the chain, not always the chain passed down. 
  	if(tmp = root.pass){ if(tmp[link+cat.id]){ return } tmp[link+cat.id] = 1 } // But the above edge case may "pass through" on a circular graph causing infinite passes, so we hackily add a temporary check for that.

  	(tat.echo||(tat.echo={}))[cat.id] = cat; // set ourself up for the echo! // TODO: BUG? Echo to self no longer causes problems? Confirm.

  	if(cat.has){ cat.link = link }
  	var sat = sget(root, tat.link = link)._; // grab what we're linking to.
  	(sat.echo || (sat.echo = {}))[tat.id] = tat; // link it.
  	var tmp = cat.ask||''; // ask the chain for what needs to be loaded next!
  	if(tmp[''] || cat.lex){ // we might need to load the whole thing // TODO: cat.lex probably has edge case bugs to it, need more test coverage.
  		sat.on('out', {get: {'#': link}});
  	}
  	setTimeout.each(Object.keys(tmp), function(get, sat){ // if sub chains are asking for data. // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync?
  		if(!get || !(sat = tmp[get])){ return }
  		sat.on('out', {get: {'#': link, '.': get}}); // go get it.
  	},0,99);
  }; Zen.on.link = link;

  function unlink(msg, cat){ // ugh, so much code for seemingly edge case behavior.
  	var put = msg.put||'', change = (u !== put['='])? put['='] : put[':'], root = cat.root, link, tmp;
  	if(u === change){ // 1st edge case: If we have a brand new database, no data will be found.
  		// TODO: BUG! because emptying cache could be async from below, make sure we are not emptying a newer cache. So maybe pass an Async ID to check against?
  		// TODO: BUG! What if this is a map? // Warning! Clearing things out needs to be robust against sync/async ops, or else you'll see `map val get put` test catastrophically fail because map attempts to link when parent graph is streamed before child value gets set. Need to differentiate between lack acks and force clearing.
  		if(cat.soul && u !== cat.put){ return } // data may not be found on a soul, but if a soul already has data, then nothing can clear the soul as a whole.
  		//if(!cat.has){ return }
  		tmp = (msg.$$||msg.$||'')._||'';
  		if(msg['@'] && (u !== tmp.put || u !== cat.put)){ return } // a "not found" from other peers should not clear out data if we have already found it.
  		//if(cat.has && u === cat.put && !(root.pass||'')[cat.id]){ return } // if we are already unlinked, do not call again, unless edge case. // TODO: BUG! This line should be deleted for "unlink deeply nested".
  		if(link = cat.link || msg.linked){
  			delete (sget(root, link)._.echo||'')[cat.id];
  		}
  		if(cat.has){ // TODO: Empty out links, maps, echos, acks/asks, etc.?
  			cat.link = null;
  		}
  		cat.put = u; // empty out the cache if, for example, alice's car's color no longer exists (relative to alice) if alice no longer has a car.
  		// TODO: BUG! For maps, proxy this so the individual sub is triggered, not all subs.
  		setTimeout.each(Object.keys(cat.next||''), function(get, sat){ // empty out all sub chains. // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync? // TODO: BUG? This will trigger deeper put first, does put logic depend on nested order? // TODO: BUG! For map, this needs to be the isolated child, not all of them.
  			if(!(sat = cat.next[get])){ return }
  			//if(cat.has && u === sat.put && !(root.pass||'')[sat.id]){ return } // if we are already unlinked, do not call again, unless edge case. // TODO: BUG! This line should be deleted for "unlink deeply nested".
  			if(link){ delete (sget(root, link).get(get)._.echo||'')[sat.id] }
  			sat.on('in', {get: get, put: u, $: sat.$}); // TODO: BUG? Add recursive seen check?
  		},0,99);
  		return;
  	}
  	if(cat.soul){ return } // a soul cannot unlink itself.
  	if(msg.$$){ return } // a linked chain does not do the unlinking, the sub chain does. // TODO: BUG? Will this cancel maps?
  	link = valid(change); // need to unlink anytime we are not the same link, though only do this once per unlink (and not on init).
  	tmp = msg.$._||'';
  	if(link === tmp.link || (cat.has && !tmp.link)){
  		if((root.pass||'')[cat.id] && 'string' !== typeof link){

  		} else {
  			return;
  		}
  	}
  	delete (tmp.echo||'')[cat.id];
  	unlink({get: cat.get, put: u, $: msg.$, linked: msg.linked = msg.linked || tmp.link}, cat); // unlink our sub chains.
  }; Zen.on.unlink = unlink;

  function ack(msg, ev){
  	//if(!msg['%'] && (this||'').off){ this.off() } // do NOT memory leak, turn off listeners! Now handled by .ask itself
  	// manhattan:
  	var as = this.as, at = as.$._, root = at.root, get = as.get||'', tmp = (msg.put||'')[get['#']]||'';
  	if(!msg.put || ('string' == typeof get['.'] && u === tmp[get['.']])){
  		if(u !== at.put){ return }
  		if(!at.soul && !at.has){ return } // TODO: BUG? For now, only core-chains will handle not-founds, because bugs creep in if non-core chains are used as $ but we can revisit this later for more powerful extensions.
  		at.ack = (at.ack || 0) + 1;
  		at.on('in', {
  			get: at.get,
  			put: at.put = u,
  			$: at.$,
  			'@': msg['@']
  		});
  		/*(tmp = at.Q) && setTimeout.each(Object.keys(tmp), function(id){ // TODO: Temporary testing, not integrated or being used, probably delete.
  			Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] }, tmp = {}); tmp['@'] = id; // copy message
  			root.on('in', tmp);
  		}); delete at.Q;*/
  		return;
  	}
  	(msg._||{}).miss = 1;
  	Zen.on.put(msg);
  	return; // eom
  }

  var empty = {}, u, text_rand = String.random, valid = Zen.valid, obj_has = function(o, k){ return o && Object.prototype.hasOwnProperty.call(o, k) }, state = Zen.state, state_is = state.is, state_ify = state.ify;
  function sget(root, soul){ root._sl = 1; var g = root.$.get(soul); root._sl = 0; return g }
});

__def('./src/zen/back.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root;
  Zen.chain.back = function(n, opt){ var tmp;
  	n = n || 1;
  	if(-1 === n || Infinity === n){
  		return this._.root.$;
  	} else
  	if(1 === n){
  		return (this._.back || this._).$;
  	}
  	var zen = this, at = zen._;
  	if(typeof n === 'string'){
  		n = n.split('.');
  	}
  	if(n instanceof Array){
  		var i = 0, l = n.length, tmp = at;
  		for(i; i < l; i++){
  			tmp = (tmp||empty)[n[i]];
  		}
  		if(u !== tmp){
  			return opt? zen : tmp;
  		} else
  		if((tmp = at.back)){
  			return tmp.$.back(n, opt);
  		}
  		return;
  	}
  	if('function' == typeof n){
  		var yes, tmp = {back: at};
  		while((tmp = tmp.back)
  		&& u === (yes = n(tmp, opt))){}
  		return yes;
  	}
  	if('number' == typeof n){
  		return (at.back || at).$.back(n - 1);
  	}
  	return this;
  }
  var empty = {}, u;
});

__def('./src/zen/put.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root;
  var PUT_CONTEXT = Symbol('put-context');
  Zen.chain.put = function(data, cb, opt, as){ // I rewrote it :)
  	var zen = this, at = zen._, root = at.root;
  	as = as || context(zen, data, cb, opt);
  	as.root = at.root;
  	as.run || (as.run = root.once);
  	stun(as, at.id); // set a flag for reads to check if this chain is writing.
  	as.ack = as.ack || cb;
  	as.via = as.via || zen;
  	as.data = as.data || data;
  	as.soul || (as.soul = at.soul || ('string' == typeof cb && cb));
  	var s = as.state = (u !== as.state)? as.state : Zen.state();
  	if('function' == typeof data){ data(function(d){ as.data = d; zen.put(u, u, u, as) }); return zen }
  	if(!as.soul){ return get(as), zen }
  	as.$ = root.$.get(as.soul); // TODO: This may not allow user chaining and similar?
  	as.todo = [{it: as.data, ref: as.$}];
  	as.turn = as.turn || turn;
  	as.ran = as.ran || ran;
  	//var path = []; as.via.back(at => { at.get && path.push(at.get.slice(0,9)) }); path = path.reverse().join('.');
  	// TODO: Perf! We only need to stun chains that are being modified, not necessarily written to.
  	function walk(){
  		var to = as.todo, at = to.pop(), d = at.it, cid = at.ref && at.ref._.id, v, k, cat, tmp, g;
  		stun(as, at.ref);
  		if(tmp = at.todo){
  			k = tmp.pop(); d = d[k];
  			if(tmp.length){ to.push(at) }
  		}
  		k && (to.path || (to.path = [])).push(k);
  		if(!(v = valid(d)) && !(g = Zen.is(d))){
  			if(!Object.plain(d)){ ran.err(as, "Invalid data: "+ check(d) +" at " + (as.via.back(function(at){at.get && tmp.push(at.get)}, tmp = []) || tmp.join('.'))+'.'+(to.path||[]).join('.')); return }
  			var seen = as.seen || (as.seen = []), i = seen.length;
  			while(i--){ if(d === (tmp = seen[i]).it){ v = d = tmp.link; break } }
  		}
  		if(k && v){ at.node = state_ify(at.node, k, s, d) } // handle soul later.
  		else {
  			if(!as.seen){ ran.err(as, "Data at root of graph must be a node (an object)."); return }
  			as.seen.push(cat = {it: d, link: {}, todo: g? [] : Object.keys(d).sort().reverse(), path: (to.path||[]).slice(), up: at}); // Any perf reasons to CPU schedule this .keys( ?
  			at.node = state_ify(at.node, k, s, cat.link);
  			!g && cat.todo.length && to.push(cat);
  			// ---------------
  			var id = as.seen.length;
  			(as.wait || (as.wait = {}))[id] = '';
  			tmp = (cat.ref = (g? d : k? at.ref.get(k) : at.ref))._;
  			(tmp = (d && (d._||'')['#']) || tmp.soul || tmp.link)? resolve({soul: tmp}) : cat.ref.get(resolve, {run: as.run, /*hatch: 0,*/ v2020:1, out:{get:{'.':' '}}}); // TODO: BUG! This should be resolve ONLY soul to prevent full data from being loaded. // Fixed now?
  			//setTimeout(function(){ if(F){ return } console.log("I HAVE NOT BEEN CALLED!", path, id, cat.ref._.id, k) }, 9000); var F; // MAKE SURE TO ADD F = 1 below!
  			function resolve(msg, eve){
  				var end = cat.link['#'];
  				if(eve){ eve.off(); eve.rid(msg) } // TODO: Too early! Check all peers ack not found.
  				// TODO: BUG maybe? Make sure this does not pick up a link change wipe, that it uses the changign link instead.
  				var soul = end || msg.soul || (tmp = (msg.$$||msg.$)._||'').soul || tmp.link || ((tmp = tmp.put||'')._||'')['#'] || tmp['#'] || (((tmp = msg.put||'') && msg.$$)? tmp['#'] : (tmp['=']||tmp[':']||'')['#']);
  				!end && stun(as, msg.$);
  				if(!soul && !at.link['#']){ // check soul link above us
  					(at.wait || (at.wait = [])).push(function(){ resolve(msg, eve) }) // wait
  					return;
  				}
  				if(!soul){
  					soul = [];
  					(msg.$$||msg.$).back(function(at){
  						if(tmp = at.soul || at.link){ return soul.push(tmp) }
  						soul.push(at.get);
  					});
  					soul = soul.reverse().join('/');
  				}
  				cat.link['#'] = soul;
  				!g && (((as.graph || (as.graph = {}))[soul] = (cat.node || (cat.node = {_:{}})))._['#'] = soul);
  				delete as.wait[id];
  				cat.wait && setTimeout.each(cat.wait, function(cb){ cb && cb() });
  				as.ran(as);
  			};
  			// ---------------
  		}
  		if(!to.length){ return as.ran(as) }
  		as.turn(walk);
  	}
  	walk();
  	return zen;
  }

  function context(zen, data, cb, opt){
  	var ctx = {};
  	ctx[PUT_CONTEXT] = 1;
  	ctx.opt = options(opt);
  	ctx.data = data;
  	ctx.ack = cb;
  	ctx.via = zen;
  	if(u !== ctx.opt.state){ ctx.state = ctx.opt.state }
  	if(u !== ctx.opt.soul){ ctx.soul = ctx.opt.soul }
  	if(u !== ctx.opt.ok){ ctx.ok = ctx.opt.ok }
  	if(u !== ctx.opt.acks){ ctx.acks = ctx.opt.acks }
  	return ctx;
  }

  function options(opt){
  	if(!opt || 'object' != typeof opt){ return {} }
  	return Object.assign({}, opt);
  }

  function stun(as, id){
  	if(!id){ return } id = (id._||'').id||id;
  	var run = as.root.stun || (as.root.stun = {on: Zen.on}), test = {}, tmp;
  	as.stun || (as.stun = run.on('stun', function(){ }));
  	if(tmp = run.on(''+id)){ tmp.the.last.next(test) }
  	if(test.run >= as.run){ return }
  	run.on(''+id, function(test){
  		if(as.stun.end){
  			this.off();
  			this.to.next(test);
  			return;
  		}
  		test.run = test.run || as.run;
  		test.stun = test.stun || as.stun; return;
  		if(this.to.to){
  			this.the.last.next(test);
  			return;
  		}
  		test.stun = as.stun;
  	});
  }

  function ran(as){
  	if(as.err){ ran.end(as.stun, as.root); return } // move log handle here.
  	if(as.todo.length || as.end || !Object.empty(as.wait)){ return } as.end = 1;
  	//(as.retry = function(){ as.acks = 0;
  	var cat = (as.$.back(-1)._), root = cat.root, ask = cat.ask(function(ack){
  		root.on('ack', ack);
  		if(ack.err && !ack.lack){ Zen.log(ack) }
  		if(++acks > (as.acks || 0)){ this.off() } // Adjustable ACKs! Only 1 by default.
  		if(!as.ack){ return }
  		as.ack(ack, this);
  	}, as.opt), acks = 0, stun = as.stun, tmp;
  	(tmp = function(){ // this is not official yet, but quick solution to hack in for now.
  		if(!stun){ return }
  		ran.end(stun, root);
  		setTimeout.each(Object.keys(stun = stun.add||''), function(cb){ if(cb = stun[cb]){cb()} }); // resume the stunned reads // Any perf reasons to CPU schedule this .keys( ?
  	}).hatch = tmp; // this is not official yet ^
  	//console.log(1, "PUT", as.run, as.graph);
  	if(as.ack && !as.ok){ as.ok = as.acks || 9 } // TODO: In future! Remove this! This is just old API support.
  	(as.via._).on('out', {put: as.out = as.graph, ok: as.ok && {'@': as.ok+1}, opt: as.opt, '#': ask, _: tmp});
  	//})();
  }; ran.end = function(stun,root){
  	stun.end = noop; // like with the earlier id, cheaper to make this flag a function so below callbacks do not have to do an extra type check.
  	if(stun.the.to === stun && stun === stun.the.last){ delete root.stun }
  	stun.off();
  }; ran.err = function(as, err){
  	(as.ack||noop).call(as, as.out = { err: as.err = Zen.log(err) });
  	as.ran(as);
  }

  function get(as){
  	var at = as.via._, tmp;
  	as.via = as.via.back(function(at){
  		if(at.soul || !at.get){ return at.$ }
  		tmp = as.data; (as.data = {})[at.get] = tmp;
  	});
  	if(!as.via || !as.via._.soul){
  		as.via = at.root.$.get(((as.data||'')._||'')['#'] || at.$.back('opt.uuid')())
  	}
  	as.via.put(as.data, as.ack, as.opt, as);


  	return;
  	if(at.get && at.back.soul){
  		tmp = as.data;
  		as.via = at.back.$;
  		(as.data = {})[at.get] = tmp; 
  		as.via.put(as.data, as.ack, as.opt, as);
  		return;
  	}
  }
  function check(d, tmp){ return ((d && (tmp = d.constructor) && tmp.name) || typeof d) }

  var u, empty = {}, noop = function(){}, turn = setTimeout.turn, valid = Zen.valid, state_ify = Zen.state.ify;
  var iife = function(fn,as){fn.call(as||empty)}
});

__def('./src/zen/get.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root;
  Zen.chain.get = function(key, cb, as){
  	var zen, tmp;
  	if(typeof key === 'string'){
  		if(key.length == 0) {	
  			(zen = this.chain())._.err = {err: Zen.log('0 length key!', key)};
  			if(cb){ cb.call(zen, zen._.err) }
  			return zen;
  		}
  		var back = this, cat = back._;
  		var next = cat.next || empty;
  		if(back === cat.root.$ && key.indexOf('/') >= 0 && !cat.root._sl && !cat.root.graph[key]){
  			var parts = key.split('/'), i = 0, cur = back._, ok = 1;
  			while(i < parts.length){
  				if(!((cur.next||{})[parts[i]])){ ok = 0; break }
  				cur = cur.next[parts[i++]].$._; 
  			}
  			if(ok){
  				var nav = back; i = 0;
  				while(i < parts.length){ nav = nav.get(parts[i++]) }
  				return nav;
  			}
  		}
  		if(!(zen = next[key])){
  			zen = key && cache(key, back);
  		}
  		zen = zen && zen.$;
  	} else
  	if('function' == typeof key){
  		if(true === cb){ return soul(this, key, cb, as), this }
  		zen = this;
  		var cat = zen._, opt = cb || {}, root = cat.root, id;
  		opt.at = cat;
  		opt.ok = key;
  		var wait = {}; // can we assign this to the at instead, like in once?
  		//var path = []; cat.$.back(at => { at.get && path.push(at.get.slice(0,9))}); path = path.reverse().join('.');
  		function any(msg, eve, f){
  			if(any.stun){ return }
  			if((tmp = root.pass) && !tmp[id]){ return }
  			var at = msg.$._, sat = (msg.$$||'')._, data = (sat||at).put, odd = (!at.has && !at.soul), test = {}, link, tmp;
  			if(odd || u === data){ // handles non-core
  				data = (u === ((tmp = msg.put)||'')['='])? (u === (tmp||'')[':'])? tmp : tmp[':'] : tmp['='];
  			}
  			if(link = ('string' == typeof (tmp = Zen.valid(data)))){
  				data = (u === (tmp = root.$.get(tmp)._.put))? opt.not? u : data : tmp;
  			}
  			if(opt.not && u === data){ return }
  			if(u === opt.stun){
  				if((tmp = root.stun) && tmp.on){
  					cat.$.back(function(a){ // our chain stunned?
  						tmp.on(''+a.id, test = {});
  						if((test.run || 0) < any.id){ return test } // if there is an earlier stun on gapless parents/self.
  					});
  					!test.run && tmp.on(''+at.id, test = {}); // this node stunned?
  					!test.run && sat && tmp.on(''+sat.id, test = {}); // linked node stunned?
  					if(any.id > test.run){
  						if(!test.stun || test.stun.end){
  							test.stun = tmp.on('stun');
  							test.stun = test.stun && test.stun.last;
  						}
  						if(test.stun && !test.stun.end){
  							//if(odd && u === data){ return }
  							//if(u === msg.put){ return } // "not found" acks will be found if there is stun, so ignore these.
  							(test.stun.add || (test.stun.add = {}))[id] = function(){ any(msg,eve,1) } // add ourself to the stun callback list that is called at end of the write.
  							return;
  						}
  					}
  				}
  				if(/*odd &&*/ u === data){ f = 0 } // if data not found, keep waiting/trying.
  				/*if(f && u === data){
  					cat.on('out', opt.out);
  					return;
  				}*/
  				if((tmp = root.hatch) && !tmp.end && u === opt.hatch && !f){ // quick hack! // What's going on here? Because data is streamed, we get things one by one, but a lot of developers would rather get a callback after each batch instead, so this does that by creating a wait list per chain id that is then called at the end of the batch by the hatch code in the root put listener.
  					if(wait[at.$._.id]){ return } wait[at.$._.id] = 1;
  					tmp.push(function(){any(msg,eve,1)});
  					return;
  				}; wait = {}; // end quick hack.
  			}
  			// call:
  			if(root.pass){ if(root.pass[id+at.id]){ return } root.pass[id+at.id] = 1 }
  			if(opt.on){ opt.ok.call(at.$, data, at.get, msg, eve || any); return } // TODO: Also consider breaking `this` since a lot of people do `=>` these days and `.call(` has slower performance.
  			if(opt.v2020){ opt.ok(msg, eve || any); return }
  			Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] }, tmp = {}); msg = tmp; msg.put = data; // 2019 COMPATIBILITY! TODO: GET RID OF THIS!
  			opt.ok.call(opt.as, msg, eve || any); // is this the right
  		};
  		any.at = cat;
  		//(cat.any||(cat.any=function(msg){ setTimeout.each(Object.keys(cat.any||''), function(act){ (act = cat.any[act]) && act(msg) },0,99) }))[id = String.random(7)] = any; // maybe switch to this in future?
  		(cat.any||(cat.any={}))[id = String.random(7)] = any;
  		any.off = function(){ any.stun = 1; if(!cat.any){ return } delete cat.any[id] }
  		any.rid = rid; // logic from old version, can we clean it up now?
  		any.id = opt.run || ++root.once; // used in callback to check if we are earlier than a write. // will this ever cause an integer overflow?
  		tmp = root.pass; (root.pass = {})[id] = 1; // Explanation: test trade-offs want to prevent recursion so we add/remove pass flag as it gets fulfilled to not repeat, however map map needs many pass flags - how do we reconcile?
  		opt.out = opt.out || {get: {}};
  		cat.on('out', opt.out);
  		root.pass = tmp;
  		return zen;
  	} else
  	if('number' == typeof key){
  		return this.get(''+key, cb, as);
  	} else
  	if('string' == typeof (tmp = valid(key))){
  		return this.get(tmp, cb, as);
  	} else
  	if(tmp = this.get.next){
  		zen = tmp(this, key);
  	}
  	if(!zen){
  		(zen = this.chain())._.err = {err: Zen.log('Invalid get request!', key)}; // CLEAN UP
  		if(cb){ cb.call(zen, zen._.err) }
  		return zen;
  	}
  	if(cb && 'function' == typeof cb){
  		zen.get(cb, as);
  	}
  	return zen;
  }
  function cache(key, back){
  	var cat = back._, next = cat.next, zen = back.chain(), at = zen._;
  	if(!next){ next = cat.next = {} }
  	next[at.get = key] = at;
  	if(back === cat.root.$){
  		at.soul = key;
  		//at.put = {};
  	} else
  	if(cat.soul || cat.has){
  		at.has = key;
  		//if(obj_has(cat.put, key)){
  			//at.put = cat.put[key];
  		//}
  	}
  	return at;
  }
  function soul(zen, cb, opt, as){
  	var cat = zen._, acks = 0, tmp;
  	if(tmp = cat.soul || cat.link){ return cb(tmp, as, cat) }
  	if(cat.jam){ return cat.jam.push([cb, as]) }
  	cat.jam = [[cb,as]];
  	zen.get(function go(msg, eve){
  		if(u === msg.put && !cat.root.opt.super && (tmp = Object.keys(cat.root.opt.peers).length) && ++acks <= tmp){ // TODO: super should not be in core code, bring AXE up into core instead to fix? // TODO: .keys( is slow
  			return;
  		}
  		eve.rid(msg);
  		var at = ((at = msg.$) && at._) || {}, i = 0, as;
  		tmp = cat.jam; delete cat.jam; // tmp = cat.jam.splice(0, 100);
  		//if(tmp.length){ process.nextTick(function(){ go(msg, eve) }) }
  		while(as = tmp[i++]){ //Zen.obj.map(tmp, function(as, cb){
  			var cb = as[0], id; as = as[1];
  			cb && cb(id = at.link || at.soul || Zen.valid(msg.put) || ((msg.put||{})._||{})['#'], as, msg, eve);
  		} //);
  	}, {out: {get: {'.':true}}});
  	return zen;
  }
  function rid(at){
  	var cat = this.at || this.on;
  	if(!at || cat.soul || cat.has){ return this.off() }
  	if(!(at = (at = (at = at.$ || at)._ || at).id)){ return }
  	var map = cat.map, tmp, seen;
  	//if(!map || !(tmp = map[at]) || !(tmp = tmp.at)){ return }
  	if(tmp = (seen = this.seen || (this.seen = {}))[at]){ return true }
  	seen[at] = true;
  	//tmp.echo[cat.id] = {}; // TODO: Warning: This unsubscribes ALL of this chain's listeners from this link, not just the one callback event.
  	//obj.del(map, at); // TODO: Warning: This unsubscribes ALL of this chain's listeners from this link, not just the one callback event.
  	return;
  }
  var empty = {}, valid = Zen.valid, u;
});

__def('./src/zen/on.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root;
  Zen.chain.on = function(tag, arg, eas, as){ // don't rewrite!
  	var zen = this, cat = zen._, root = cat.root, act, off, id, tmp;
  	if(typeof tag === 'string'){
  		if(!arg){ return cat.on(tag) }
  		act = cat.on(tag, arg, eas || cat, as);
  		if(eas && eas.$){
  			(eas.subs || (eas.subs = [])).push(act);
  		}
  		return zen;
  	}
  	var opt = arg;
  	(opt = (true === opt)? {change: true} : opt || {}).not = 1; opt.on = 1;
  	//opt.at = cat;
  	//opt.ok = tag;
  	//opt.last = {};
  	var wait = {}; // can we assign this to the at instead, like in once?
  	zen.get(tag, opt);
  	/*zen.get(function on(data,key,msg,eve){ var $ = this;
  		if(tmp = root.hatch){ // quick hack!
  			if(wait[$._.id]){ return } wait[$._.id] = 1;
  			tmp.push(function(){on.call($, data,key,msg,eve)});
  			return;
  		}; wait = {}; // end quick hack.
  		tag.call($, data,key,msg,eve);
  	}, opt); // TODO: PERF! Event listener leak!!!?*/
  	/*
  	function one(msg, eve){
  		if(one.stun){ return }
  		var at = msg.$._, data = at.put, tmp;
  		if(tmp = at.link){ data = root.$.get(tmp)._.put }
  		if(opt.not===u && u === data){ return }
  		if(opt.stun===u && (tmp = root.stun) && (tmp = tmp[at.id] || tmp[at.back.id]) && !tmp.end){ // Remember! If you port this into `.get(cb` make sure you allow stun:0 skip option for `.put(`.
  			tmp[id] = function(){one(msg,eve)};
  			return;
  		}
  		//tmp = one.wait || (one.wait = {}); console.log(tmp[at.id] === ''); if(tmp[at.id] !== ''){ tmp[at.id] = tmp[at.id] || setTimeout(function(){tmp[at.id]='';one(msg,eve)},1); return } delete tmp[at.id];
  		// call:
  		if(opt.as){
  			opt.ok.call(opt.as, msg, eve || one);
  		} else {
  			opt.ok.call(at.$, data, msg.get || at.get, msg, eve || one);
  		}
  	};
  	one.at = cat;
  	(cat.act||(cat.act={}))[id = String.random(7)] = one;
  	one.off = function(){ one.stun = 1; if(!cat.act){ return } delete cat.act[id] }
  	cat.on('out', {get: {}});*/
  	return zen;
  }
  // Rules:
  // 1. If cached, should be fast, but not read while write.
  // 2. Should not retrigger other listeners, should get triggered even if nothing found.
  // 3. If the same callback passed to many different once chains, each should resolve - an unsubscribe from the same callback should not effect the state of the other resolving chains, if you do want to cancel them all early you should mutate the callback itself with a flag & check for it at top of callback
  Zen.chain.once = function(cb, opt){ opt = opt || {}; // avoid rewriting
  	if(!cb){ return none(this,opt) }
  	var zen = this, cat = zen._, root = cat.root, data = cat.put, id = String.random(7), one, tmp;
  	zen.get(function(data,key,msg,eve){
  		var $ = this, at = $._, one = (at.one||(at.one={}));
  		if(eve.stun){ return } if('' === one[id]){ return }
  		if(true === (tmp = Zen.valid(data))){ once(); return }
  		if('string' == typeof tmp){ return }
  		clearTimeout((cat.one||'')[id]); // clear "not found" since they only get set on cat.
  		clearTimeout(one[id]); one[id] = setTimeout(once, opt.wait||99); // TODO: Bug? This doesn't handle plural chains.
  		function once(f){
  			if(!at.has && !at.soul){ at = {put: data, get: key} } // handles non-core messages.
  			if(u === (tmp = at.put)){ tmp = ((msg.$$||'')._||'').put }
  			if('string' == typeof Zen.valid(tmp)){
  				tmp = root.$.get(tmp)._.put;
  				if(tmp === u && !f){
  					one[id] = setTimeout(function(){ once(1) }, opt.wait||99); // TODO: Quick fix. Maybe use ack count for more predictable control?
  					return
  				}
  			}
  			//console.log("AND VANISHED", data);
  			if(eve.stun){ return } if('' === one[id]){ return } one[id] = '';
  			if(cat.soul || cat.has){ eve.off() } // TODO: Plural chains? // else { ?.off() } // better than one check?
  			cb.call($, tmp, at.get);
  			clearTimeout(one[id]); // clear "not found" since they only get set on cat. // TODO: This was hackily added, is it necessary or important? Probably not, in future try removing this. Was added just as a safety for the `&& !f` check.
  		};
  	}, {on: 1});
  	return zen;
  }
  function none(zen,opt,chain){
  	Zen.log.once("valonce", "Chainable val is experimental, its behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");
  	(chain = zen.chain())._.nix = zen.once(function(data, key){ chain._.on('in', this._) });
  	chain._.lex = zen._.lex; // TODO: Better approach in future? This is quick for now.
  	return chain;
  }

  Zen.chain.off = function(){
  	// make off more aggressive. Warning, it might backfire!
  	var zen = this, at = zen._, tmp;
  	var cat = at.back;
  	if(!cat){ return }
  	at.ack = 0; // so can resubscribe.
  	if(tmp = cat.next){
  		if(tmp[at.get]){
  			delete tmp[at.get];
  		} else {

  		}
  	}
  	// TODO: delete cat.one[map.id]?
  	if (tmp = cat.any) {
  		delete cat.any;
  		cat.any = {};
  	}
  	if(tmp = cat.ask){
  		delete tmp[at.get];
  	}
  	if(tmp = cat.put){
  		delete tmp[at.get];
  	}
  	if(tmp = at.soul){
  		delete cat.root.graph[tmp];
  	}
  	if(tmp = at.map){
  		Object.keys(tmp).forEach(function(i,at){ at = tmp[i]; //obj_map(tmp, function(at){
  			if(at.link){
  				cat.root.$.get(at.link).off();
  			}
  		});
  	}
  	if(tmp = at.next){
  		Object.keys(tmp).forEach(function(i,neat){ neat = tmp[i]; //obj_map(tmp, function(neat){
  			neat.$.off();
  		});
  	}
  	at.on('off', {});
  	return zen;
  }
  var empty = {}, noop = function(){}, u;
});

__def('./src/zen/map.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root, next = Zen.chain.get.next;
  Zen.chain.get.next = function(zen, lex){ var tmp;
  	if(!Object.plain(lex)){ return (next||noop)(zen, lex) }
  	if(tmp = ((tmp = lex['#'])||'')['='] || tmp){ return zen.get(tmp) }
  	(tmp = zen.chain()._).lex = lex; // LEX!
  	zen.on('in', function(eve){
  		if(String.match(eve.get|| (eve.put||'')['.'], lex['.'] || lex['#'] || lex)){
  			tmp.on('in', eve);
  		}
  		this.to.next(eve);
  	});
  	return tmp.$;
  }
  Zen.chain.map = function(cb, opt, t){
  	var zen = this, cat = zen._, lex, chain;
  	if(Object.plain(cb)){ lex = cb['.']? cb : {'.': cb}; cb = u }
  	if(!cb){
  		if(chain = cat.each){ return chain }
  		(cat.each = chain = zen.chain())._.lex = lex || chain._.lex || cat.lex;
  		chain._.nix = zen.back('nix');
  		zen.on('in', map, chain._);
  		return chain;
  	}
  	Zen.log.once("mapfn", "Map functions are experimental, their behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");
  	chain = zen.chain();
  	zen.map().on(function(data, key, msg, eve){
  		var next = (cb||noop).call(this, data, key, msg, eve);
  		if(u === next){ return }
  		if(data === next){ return chain._.on('in', msg) }
  		if(Zen.is(next)){ return chain._.on('in', next._) }
  		var tmp = {}; Object.keys(msg.put).forEach(function(k){ tmp[k] = msg.put[k] }, tmp); tmp['='] = next; 
  		chain._.on('in', {get: key, put: tmp});
  	});
  	return chain;
  }
  function map(msg){ this.to.next(msg);
  	var cat = this.as, zen = msg.$, at = zen._, put = msg.put, tmp;
  	if(!at.soul && !msg.$$){ return } // this line took hundreds of tries to figure out. It only works if core checks to filter out above chains during link tho. This says "only bother to map on a node" for this layer of the chain. If something is not a node, map should not work.
  	if((tmp = cat.lex) && !String.match(msg.get|| (put||'')['.'], tmp['.'] || tmp['#'] || tmp)){ return }
  	Zen.on.link(msg, cat);
  }
  var noop = function(){}, event = {stun: noop, off: noop}, u;
});

__def('./src/zen/set.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var Zen = __root;
  Zen.chain.set = function(item, cb, opt){
  	var zen = this, root = zen.back(-1), soul, tmp;
  	cb = cb || function(){};
  	opt = opt || {}; opt.item = opt.item || item;
  	if(soul = ((item||'')._||'')['#']){ (item = {})['#'] = soul } // check if node, make link.
  	if('string' == typeof (tmp = Zen.valid(item))){ return zen.get(soul = tmp).put(item, cb, opt) } // check if link
  	if(!Zen.is(item)){
  		if(Object.plain(item)){
  			item = root.get(soul = zen.back('opt.uuid')()).put(item);
  		}
  		return zen.get(soul || root.back('opt.uuid')(7)).put(item, cb, opt);
  	}
  	zen.put(function(go){
  		item.get(function(soul, o, msg){ // TODO: BUG! We no longer have this option? & go error not handled?
  			if(!soul){ return cb.call(zen, {err: Zen.log('Only a node can be linked! Not "' + msg.put + '"!')}) }
  			(tmp = {})[soul] = {'#': soul}; go(tmp);
  		},true);
  	})
  	return item;
  }
});

__def('./src/zen/mesh.js', function(module, __exp){
  __req('./src/zen/shim.js');
  var jsonAsync = __req('./src/zen/json.js').default;
  let __defaultExport;

      var noop = function(){}
      var pair = jsonAsync.createJsonPair(function(d){ return json.sucks(d) });
      var parse = pair.parse;
      var json = pair.json;
      json.sucks = function(d){ if(d > 99){ console.log("Warning: JSON blocking CPU detected. Add `zen/lib/yson.js` to fix."); json.sucks = noop } }

      function Mesh(root){
          var mesh = function(){};
          var opt = root.opt || {};
          opt.log = opt.log || console.log;
          opt.gap = opt.gap || opt.wait || 0;
          opt.max = opt.max || (opt.memory? (opt.memory * 999 * 999) : 300000000) * 0.3;
          opt.pack = opt.pack || (opt.max * 0.01 * 0.01);
          opt.puff = opt.puff || 9; // IDEA: do a start/end benchmark, divide ops/result.
          var puff = setTimeout.turn || setTimeout;

          var dup = root.dup, dup_check = dup.check, dup_track = dup.track;

          var ST = +new Date, LT = ST;

          var hear = mesh.hear = function(raw, peer){
              if(!raw){ return }
              if(opt.max <= raw.length){ return mesh.say({dam: '!', err: "Message too big!"}, peer) }
              if(mesh === this){
                  /*if('string' == typeof raw){ try{
                      var stat = console.STAT || {};
                      //console.log('HEAR:', peer.id, (raw||'').slice(0,250), ((raw||'').length / 1024 / 1024).toFixed(4));

                      //console.log(setTimeout.turn.s.length, 'stacks', parseFloat((-(LT - (LT = +new Date))/1000).toFixed(3)), 'sec', parseFloat(((LT-ST)/1000 / 60).toFixed(1)), 'up', stat.peers||0, 'peers', stat.has||0, 'has', stat.memhused||0, stat.memused||0, stat.memax||0, 'heap mem max');
                  }catch(e){ console.log('DBG err', e) }}*/
                  hear.d += raw.length||0 ; ++hear.c } // STATS!
              var S = peer.SH = +new Date;
              var tmp = raw[0], msg;
              //raw && raw.slice && console.log("hear:", ((peer.wire||'').headers||'').origin, raw.length, raw.slice && raw.slice(0,50)); //tc-iamunique-tc-package-ds1
              if('[' === tmp){
                  parse(raw, function(err, msg){
                      if(err || !msg){ return mesh.say({dam: '!', err: "DAM JSON parse error."}, peer) }
                      console.STAT && console.STAT(+new Date, msg.length, '# on hear batch');
                      var P = opt.puff;
                      function go(){
                          var S = +new Date;
                          var i = 0, m; while(i < P && (m = msg[i++])){ mesh.hear(m, peer) }
                          msg = msg.slice(i); // slicing after is faster than shifting during.
                          console.STAT && console.STAT(S, +new Date - S, 'hear loop');
                          flush(peer); // force send all synchronously batched acks.
                          if(!msg.length){ return }
                          puff(go, 0);
                      }
                      go();
                  });
                  raw = ''; // 
                  return;
              }
              if('{' === tmp || ((raw['#'] || Object.plain(raw)) && (msg = raw))){
                  if(msg){ return hear.one(msg, peer, S) }
                  parse(raw, function(err, msg){
                      if(err || !msg){ return mesh.say({dam: '!', err: "DAM JSON parse error."}, peer) }
                      hear.one(msg, peer, S);
                  });
                  return;
              }
          }
          hear.one = function(msg, peer, S){ // S here is temporary! Undo.
              var id, hash, tmp, ash, DBG;
              if(msg.DBG){ msg.DBG = DBG = {DBG: msg.DBG} }
              DBG && (DBG.h = S);
              DBG && (DBG.hp = +new Date);
              if(!(id = msg['#'])){ id = msg['#'] = String.random(9) }
              if(tmp = dup_check(id)){ return }
              // DAM logic:
              if(!(hash = msg['##']) && false && u !== msg.put){ /*hash = msg['##'] = Type.obj.hash(msg.put)*/ } // disable hashing for now // TODO: impose warning/penalty instead (?)
              if(hash && (tmp = msg['@'] || (msg.get && id)) && dup.check(ash = tmp+hash)){ return } // Imagine A <-> B <=> (C & D), C & D reply with same ACK but have different IDs, B can use hash to dedup. Or if a GET has a hash already, we shouldn't ACK if same.
              (msg._ = function(){}).via = mesh.leap = peer;
              if((tmp = msg['><']) && 'string' == typeof tmp){ tmp.slice(0,99).split(',').forEach(function(k){ this[k] = 1 }, (msg._).yo = {}) } // Peers already sent to, do not resend.
              // DAM ^
              if(tmp = msg.dam){
                  (dup_track(id)||{}).via = peer;
                  if(tmp = mesh.hear[tmp]){
                      tmp(msg, peer, root);
                  }
                  return;
              }
              if(tmp = msg.ok){ msg._.near = tmp['/'] }
              var S = +new Date;
              DBG && (DBG.is = S); peer.SI = id;
              dup_track.ed = function(d){
                  if(id !== d){ return }
                  dup_track.ed = 0;
                  if(!(d = dup.s[id])){ return }
                  d.via = peer;
                  if(msg.get){ d.it = msg }
              }
              root.on('in', mesh.last = msg);
              DBG && (DBG.hd = +new Date);
              console.STAT && console.STAT(S, +new Date - S, msg.get? 'msg get' : msg.put? 'msg put' : 'msg');
              dup_track(id); // in case 'in' does not call track.
              if(ash){ dup_track(ash) } //dup.track(tmp+hash, true).it = it(msg);
              mesh.leap = mesh.last = null; // warning! mesh.leap could be buggy.
          }
          var tomap = function(k,i,m){m(k,true)};
          hear.c = hear.d = 0;

          {
              var SMIA = 0;
              var loop;
              mesh.hash = function(msg, peer){ var h, s, t;
                  var S = +new Date;
                  json(msg.put, function hash(err, text){
                      var ss = (s || (s = t = text||'')).slice(0, 32768); // 1024 * 32
                    h = String.hash(ss, h); s = s.slice(32768);
                    if(s){ puff(hash, 0); return }
                      console.STAT && console.STAT(S, +new Date - S, 'say json+hash');
                    msg._.$put = t;
                    msg['##'] = h;
                    mesh.say(msg, peer);
                    delete msg._.$put;
                  }, sort);
              }
              function sort(k, v){ var tmp;
                  if(!(v instanceof Object)){ return v }
                  Object.keys(v).sort().forEach(sorta, {to: tmp = {}, on: v});
                  return tmp;
              } function sorta(k){ this.to[k] = this.on[k] }

              var say = mesh.say = function(msg, peer){ var tmp;
                  if((tmp = this) && (tmp = tmp.to) && tmp.next){ tmp.next(msg) } // compatible with middleware adapters.
                  if(!msg){ return false }
                  var id, hash, raw, ack = msg['@'];
      //if(opt.super && (!ack || !msg.put)){ return } // TODO: MANHATTAN STUB //OBVIOUSLY BUG! But squelch relay. // :( get only is 100%+ CPU usage :(
                  var meta = msg._||(msg._=function(){});
                  var DBG = msg.DBG, S = +new Date; meta.y = meta.y || S; if(!peer){ DBG && (DBG.y = S) }
                  if(!(id = msg['#'])){ id = msg['#'] = String.random(9) }
                  !loop && dup_track(id);//.it = it(msg); // track for 9 seconds, default. Earth<->Mars would need more! // always track, maybe move this to the 'after' logic if we split function.
                  //if(msg.put && (msg.err || (dup.s[id]||'').err)){ return false } // TODO: in theory we should not be able to stun a message, but for now going to check if it can help network performance preventing invalid data to relay.
                  if(!(hash = msg['##']) && u !== msg.put && !meta.via && ack){ mesh.hash(msg, peer); return } // TODO: Should broadcasts be hashed?
                  if(!peer && ack){ peer = ((tmp = dup.s[ack]) && (tmp.via || ((tmp = tmp.it) && (tmp = tmp._) && tmp.via))) || ((tmp = mesh.last) && ack === tmp['#'] && mesh.leap) } // warning! mesh.leap could be buggy! mesh last check reduces this. // TODO: CLEAN UP THIS LINE NOW? `.it` should be reliable.
                  if(!peer && ack){ // still no peer, then ack daisy chain 'tunnel' got lost.
                      if(dup.s[ack]){ return } // in dups but no peer hints that this was ack to ourself, ignore.
                      console.STAT && console.STAT(+new Date, ++SMIA, 'total no peer to ack to'); // TODO: Delete this now. Dropping lost ACKs is protocol fine now.
                      return false;
                  } // TODO: Temporary? If ack via trace has been lost, acks will go to all peers, which trashes browser bandwidth. Not relaying the ack will force sender to ask for ack again. Note, this is technically wrong for mesh behavior.
                  if(ack && !msg.put && !hash && ((dup.s[ack]||'').it||'')['##']){ return false } // If we're saying 'not found' but a relay had data, do not bother sending our not found. // Is this correct, return false? // NOTE: ADD PANIC TEST FOR THIS!
                  if(!peer && mesh.way){ return mesh.way(msg) }
                  DBG && (DBG.yh = +new Date);
                  if(!(raw = meta.raw)){ mesh.raw(msg, peer); return }
                  DBG && (DBG.yr = +new Date);
                  if(!peer || !peer.id){
                      if(!Object.plain(peer || opt.peers)){ return false }
                      var S = +new Date;
                      var P = opt.puff, ps = opt.peers, pl = Object.keys(peer || opt.peers || {}); // TODO: .keys( is slow
                      console.STAT && console.STAT(S, +new Date - S, 'peer keys');
                      function go(){
                          var S = +new Date;
                          //Type.obj.map(peer || opt.peers, each); // in case peer is a peer list.
                          loop = 1; var wr = meta.raw; meta.raw = raw; // quick perf hack
                          var i = 0, p; while(i < 9 && (p = (pl||'')[i++])){
                              if(!(p = ps[p] || (peer||'')[p])){ continue }
                              mesh.say(msg, p);
                          }
                          meta.raw = wr; loop = 0;
                          pl = pl.slice(i); // slicing after is faster than shifting during.
                          console.STAT && console.STAT(S, +new Date - S, 'say loop');
                          if(!pl.length){ return }
                          puff(go, 0);
                          ack && dup_track(ack); // keep for later
                      }
                      go();
                      return;
                  }
                  // TODO: PERF: consider splitting function here, so say loops do less work.
                  if(!peer.wire && mesh.wire){ mesh.wire(peer) }
                  if(id === peer.last){ return } peer.last = id;  // was it just sent?
                  if(peer === meta.via){ return false } // don't send back to self.
                  if((tmp = meta.yo) && (tmp[peer.url] || tmp[peer.pid] || tmp[peer.id]) /*&& !o*/){ return false }
                  console.STAT && console.STAT(S, ((DBG||meta).yp = +new Date) - (meta.y || S), 'say prep');
                  !loop && ack && dup_track(ack); // streaming long responses needs to keep alive the ack.
                  if(peer.batch){
                      peer.tail = (tmp = peer.tail || 0) + raw.length;
                      if(peer.tail <= opt.pack){
                          peer.batch += (tmp?',':'')+raw;
                          return;
                      }
                      flush(peer);
                  }
                  peer.batch = '['; // Prevents double JSON!
                  var ST = +new Date;
                  setTimeout(function(){
                      console.STAT && console.STAT(ST, +new Date - ST, '0ms TO');
                      flush(peer);
                  }, opt.gap); // TODO: queuing/batching might be bad for low-latency video game performance! Allow opt out?
                  send(raw, peer);
                  console.STAT && (ack === peer.SI) && console.STAT(S, +new Date - peer.SH, 'say ack');
              }
              mesh.say.c = mesh.say.d = 0;
              // TODO: this caused a out-of-memory crash!
              mesh.raw = function(msg, peer){ // TODO: Clean this up / delete it / move logic out!
                  if(!msg){ return '' }
                  var meta = (msg._) || {}, put, tmp;
                  if(tmp = meta.raw){ return tmp }
                  if('string' == typeof msg){ return msg }
                  var hash = msg['##'], ack = msg['@'];
                  if(hash && ack){
                      if(!meta.via && dup_check(ack+hash)){ return false } // for our own out messages, memory & storage may ack the same thing, so dedup that. Tho if via another peer, we already tracked it upon hearing, so this will always trigger false positives, so don't do that!
                      if(tmp = (dup.s[ack]||'').it){
                          if(hash === tmp['##']){ return false } // if ask has a matching hash, acking is optional.
                          if(!tmp['##']){ tmp['##'] = hash } // if none, add our hash to ask so anyone we relay to can dedup. // NOTE: May only check against 1st ack chunk, 2nd+ won't know and still stream back to relaying peers which may then dedup. Any way to fix this wasted bandwidth? I guess force rate limiting breaking change, that asking peer has to ask for next lexical chunk.
                      }
                  }
                  if(!msg.dam && !msg['@']){
                      var i = 0, to = []; tmp = opt.peers;
                      for(var k in tmp){ var p = tmp[k]; // TODO: Make it up peers instead!
                          to.push(p.url || p.pid || p.id);
                          if(++i > 6){ break }
                      }
                      if(i > 1){ msg['><'] = to.join() } // TODO: BUG! This gets set regardless of peers sent to! Detect?
                  }
                  if(msg.put && (tmp = msg.ok)){ msg.ok = {'@':(tmp['@']||1)-1, '/': (tmp['/']==msg._.near)? mesh.near : tmp['/']}; }
                  if(put = meta.$put){
                      tmp = {}; Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] });
                      tmp.put = ':])([:';
                      json(tmp, function(err, raw){
                          if(err){ return } // TODO: Handle!!
                          var S = +new Date;
                          tmp = raw.indexOf('"put":":])([:"');
                          res(u, raw = raw.slice(0, tmp+6) + put + raw.slice(tmp + 14));
                          console.STAT && console.STAT(S, +new Date - S, 'say slice');
                      });
                      return;
                  }
                  json(msg, res);
                  function res(err, raw){
                      if(err){ return } // TODO: Handle!!
                      meta.raw = raw; //if(meta && (raw||'').length < (999 * 99)){ meta.raw = raw } // HNPERF: If string too big, don't keep in memory.
                      mesh.say(msg, peer);
                  }
              }
          }

          function flush(peer){
              var tmp = peer.batch, t = 'string' == typeof tmp, l;
              if(t){ tmp += ']' }// TODO: Prevent double JSON!
              peer.batch = peer.tail = null;
              if(!tmp){ return }
              if(t? 3 > tmp.length : !tmp.length){ return } // TODO: ^
              if(!t){try{tmp = (1 === tmp.length? tmp[0] : JSON.stringify(tmp));
              }catch(e){return opt.log('DAM JSON stringify error', e)}}
              if(!tmp){ return }
              send(tmp, peer);
          }
          // for now - find better place later.
          function send(raw, peer){ try{
              var wire = peer.wire;
              if(peer.say){
                  peer.say(raw);
              } else
              if(wire.send){
                  wire.send(raw);
              }
              mesh.say.d += raw.length||0; ++mesh.say.c; // STATS!
          }catch(e){
              (peer.queue = peer.queue || []).push(raw);
          }}

          mesh.near = 0;
          mesh.hi = function(peer){
              var wire = peer.wire, tmp;
              if(!wire){ mesh.wire((peer.length && {url: peer, id: peer}) || peer); return }
              if(peer.id){
                  opt.peers[peer.url || peer.id] = peer;
              } else {
                  tmp = peer.id = peer.id || peer.url || String.random(9);
                  mesh.say({dam: '?', pid: root.opt.pid}, opt.peers[tmp] = peer);
                  delete dup.s[peer.last]; // IMPORTANT: see https://zen.eco/docs/DAM#self
              }
              if(!peer.met){
                  mesh.near++;
                  peer.met = +(new Date);
                  root.on('hi', peer)
              }
              // @rogowski I need this here by default for now to fix go1dfish's bug
              tmp = peer.queue; peer.queue = [];
              setTimeout.each(tmp||[],function(msg){
                  send(msg, peer);
              },0,9);
              //Type.obj.native && Type.obj.native(); // dirty place to check if other JS polluted.
          }
          mesh.bye = function(peer){
              peer.met && --mesh.near;
              delete peer.met;
              root.on('bye', peer);
              var tmp = +(new Date); tmp = (tmp - (peer.met||tmp));
              mesh.bye.time = ((mesh.bye.time || tmp) + tmp) / 2;
          }
          mesh.hear['!'] = function(msg, peer){ opt.log('Error:', msg.err) }
          mesh.hear['?'] = function(msg, peer){
              if(msg.pid){
                  if(!peer.pid){ peer.pid = msg.pid }
                  if(msg['@']){ return }
              }
              mesh.say({dam: '?', pid: opt.pid, '@': msg['#']}, peer);
              delete dup.s[peer.last]; // IMPORTANT: see https://zen.eco/docs/DAM#self
          }
          mesh.hear['mob'] = function(msg, peer){ // NOTE: AXE will overload this with better logic.
              if(!msg.peers){ return }
              var peers = Object.keys(msg.peers), one = peers[(Math.random()*peers.length) >> 0];
              if(!one){ return }
              mesh.bye(peer);
              mesh.hi(one);
          }

          root.on('create', function(root){
              root.opt.pid = root.opt.pid || String.random(9);
              this.to.next(root);
              root.on('out', mesh.say);
          });

          root.on('bye', function(peer, tmp){
              peer = opt.peers[peer.id || peer] || peer;
              this.to.next(peer);
              peer.bye? peer.bye() : (tmp = peer.wire) && tmp.close && tmp.close();
              delete opt.peers[peer.id];
              peer.wire = null;
          });

          var gets = {};
          root.on('bye', function(peer, tmp){ this.to.next(peer);
              if(tmp = console.STAT){ tmp.peers = mesh.near; }
              if(!(tmp = peer.url)){ return } gets[tmp] = true;
              setTimeout(function(){ delete gets[tmp] },opt.lack || 9000);
          });
          root.on('hi', function(peer, tmp){ this.to.next(peer);
              if(tmp = console.STAT){ tmp.peers = mesh.near }
              if(opt.super){ return } // temporary (?) until we have better fix/solution?
              var souls = Object.keys(root.next||''); // TODO: .keys( is slow
              if(souls.length > 9999 && !console.SUBS){ console.log(console.SUBS = "Warning: You have more than 10K live GETs, which might use more bandwidth than your screen can show - consider `.off()`.") }
              setTimeout.each(souls, function(soul){ var node = root.next[soul];
                  if(opt.super || (node.ask||'')['']){ mesh.say({get: {'#': soul}}, peer); return }
                  setTimeout.each(Object.keys(node.ask||''), function(key){ if(!key){ return }
                      // is the lack of ## a !onion hint?
                      mesh.say({'##': String.hash((root.graph[soul]||'')[key]), get: {'#': soul, '.': key}}, peer);
                      // TODO: Switch this so Book could route?
                  })
              });
          });

          return mesh;
      }
      var empty = {}, ok = true, u;

      try{ __defaultExport = Mesh }catch(e){}

  __exp.default = __defaultExport;
});

__def('./src/zen/websocket.js', function(module, __exp){
  var __root = __req('./src/zen/root.js').default;
  var __mesh = __req('./src/zen/mesh.js').default;
  var Zen = __root;
  Zen.Mesh = __mesh;

  // TODO: resync upon reconnect online/offline
  //window.ononline = window.onoffline = function(){ console.log('online?', navigator.onLine) }

  Zen.on('opt', function(root){
  	this.to.next(root);
  	if(root.once){ return }
  	var opt = root.opt;
  	if(false === opt.WebSocket){ return }

  	var env = Zen.window || {};
  	var websocket = opt.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;
  	if(!websocket){ return }
  	opt.WebSocket = websocket;

  	var mesh = opt.mesh = opt.mesh || Zen.Mesh(root);

  	var wired = mesh.wire || opt.wire;
  	mesh.wire = opt.wire = open;
  	function open(peer){ try{
  		if(!peer || !peer.url){ return wired && wired(peer) }
  		var url = peer.url.replace(/^http/, 'ws');
  		var wire = peer.wire = new opt.WebSocket(url);
  		wire.onclose = function(){
  			reconnect(peer);
  			opt.mesh.bye(peer);
  		};
  		wire.onerror = function(err){
  			reconnect(peer);
  		};
  		wire.onopen = function(){
  			opt.mesh.hi(peer);
  		}
  		wire.onmessage = function(msg){
  			if(!msg){ return }
  			opt.mesh.hear(msg.data || msg, peer);
  		};
  		return wire;
  	}catch(e){ opt.mesh.bye(peer) }}

  	setTimeout(function(){ !opt.super && root.on('out', {dam:'hi'}) },1); // it can take a while to open a socket, so maybe no longer lazy load for perf reasons?

  	var wait = 2 * 999;
  	function reconnect(peer){
  		clearTimeout(peer.defer);
  		if(!opt.peers[peer.url]){ return }
  		if(doc && peer.retry <= 0){ return }
  		peer.retry = (peer.retry || opt.retry+1 || 60) - ((-peer.tried + (peer.tried = +new Date) < wait*4)?1:0);
  		peer.defer = setTimeout(function to(){
  			if(doc && doc.hidden){ return setTimeout(to,wait) }
  			open(peer);
  		}, wait);
  	}
  	var doc = (''+u !== typeof document) && document;
  });
  var noop = function(){}, u;
});

__def('./src/zen/locstore.js', function(module, __exp){
  var Zen = __req('./src/zen/root.js').default;
  var jsonAsync = __req('./src/zen/json.js').default;
  var env = (typeof process !== 'undefined' && process.env) || {};

  var noop = function(){}, store, u;
  try{store = (Zen.window||noop).localStorage}catch(e){}
  if(!store){
  	if(!env.ZEN_SILENCE_TEST_WARNINGS){
  		Zen.log("Warning: No localStorage exists to persist data to!");
  	}
  	store = {setItem: function(k,v){this[k]=v}, removeItem: function(k){delete this[k]}, getItem: function(k){return this[k]}};
  }

  var pair = jsonAsync.createJsonPair();
  var parse = pair.parse;
  var json = pair.json;

  Zen.on('create', function lg(root){
  	this.to.next(root);
  	var opt = root.opt, graph = root.graph, acks = [], disk, to, size, stop;
  	if(false === opt.localStorage){
  		// Memory-only mode: no disk writes but still ack puts so callbacks fire.
  		root.on('put', function(msg){
  			this.to.next(msg);
  			if(!msg['@']){ root.on('in', {'@': msg['#'], ok: 1}) }
  		});
  		return;
  	}
  	opt.prefix = opt.file || 'zen/';
  	try{ disk = lg[opt.prefix] = lg[opt.prefix] || JSON.parse(size = store.getItem(opt.prefix)) || {}; // TODO: Perf! This will block, should we care, since limited to 5MB anyways?
  	}catch(e){ disk = lg[opt.prefix] = {}; }
  	size = (size||'').length;

  	root.on('get', function(msg){
  		this.to.next(msg);
  		var lex = msg.get, soul, data, tmp, u;
  		if(!lex || !(soul = lex['#'])){ return }
  		data = disk[soul] || u;
  		if(data && (tmp = lex['.']) && !Object.plain(tmp)){ // pluck!
  			data = Zen.state.ify({}, tmp, Zen.state.is(data, tmp), data[tmp], soul);
  		}
  		//if(data){ (tmp = {})[soul] = data } // back into a graph.
  		//setTimeout(function(){
  		Zen.on.get.ack(msg, data); //root.on('in', {'@': msg['#'], put: tmp, lS:1});// || root.$});
  		//}, Math.random() * 10); // FOR TESTING PURPOSES!
  	});

  	root.on('put', function(msg){
  		this.to.next(msg); // remember to call next middleware adapter
  		var put = msg.put, soul = put['#'], key = put['.'], id = msg['#'], ok = msg.ok||'', tmp; // pull data off wire envelope
  		disk[soul] = Zen.state.ify(disk[soul], key, put['>'], put[':'], soul); // merge into disk object
  		if(stop && size > (4999880)){ root.on('in', {'@': id, err: "localStorage max!"}); return; }
  		//if(!msg['@']){ acks.push(id) } // then ack any non-ack write. // TODO: use batch id.
  		if(!msg['@'] && (!msg._.via || Math.random() < (ok['@'] / ok['/']))){ acks.push(id) } // then ack any non-ack write. // TODO: use batch id.
  		if(to){ return }
  		to = setTimeout(flush, 9+(size / 333)); // 0.1MB = 0.3s, 5MB = 15s 
  	});
  	function flush(){
  		if(!acks.length && ((setTimeout.turn||'').s||'').length){ setTimeout(flush,99); return; } // defer if "busy" && no saves.
  		var err, ack = acks; clearTimeout(to); to = false; acks = [];
  		json(disk, function(err, tmp){
  			try{!err && store.setItem(opt.prefix, tmp);
  			}catch(e){ err = stop = e || "localStorage failure" }
  			if(err){
  				Zen.log(err + " Consider using ZEN's IndexedDB plugin for RAD for more storage space, https://zen.eco/docs/RAD#install");
  				root.on('localStorage:error', {err: err, get: opt.prefix, put: disk});
  			}
  			size = tmp.length;

  			//if(!err && !Object.empty(opt.peers)){ return } // only ack if there are no peers. // Switch this to probabilistic mode
  			setTimeout.each(ack, function(id){
  				root.on('in', {'@': id, err: err, ok: 0}); // localStorage isn't reliable, so make its `ok` code be a low number.
  			},0,99);
  		})
  	}

  });
});

__def('./src/zen/graph.js', function(module, __exp){
  __req('./src/zen/book.js');
  __req('./src/zen/chain.js');
  __req('./src/zen/back.js');
  __req('./src/zen/put.js');
  __req('./src/zen/get.js');
  __req('./src/zen/on.js');
  __req('./src/zen/map.js');
  __req('./src/zen/set.js');
  __req('./src/zen/mesh.js');
  __req('./src/zen/websocket.js');
  __req('./src/zen/locstore.js');
  var ZEN = __req('./src/zen/root.js').default;
  if (!ZEN.chain.then) {
    ZEN.chain.then = function(cb, opt) {
      var zen = this;
      var p = new Promise(function(res) { zen.once(res, opt); });
      return cb ? p.then(cb) : p;
    };
  }

  const graph = {
    core: ZEN,
    chain: ZEN.chain,
    create(opt = {}) {
      return ZEN(opt);
    },
    is(value) {
      return ZEN.is(value);
    }
  };


  __exp.default = graph;

  __exp.graph = graph;
});

__def('./src/zen/index.js', function(module, __exp){
  var PEN = __req('./src/pen.js').default;
  var secp256k1 = __req('./src/zen/curves/secp256k1.js').default;
  var settings = __req('./src/zen/settings.js').default;
  var pair = __req('./src/zen/pair.js').default;
  var sign = __req('./src/zen/sign.js').default;
  var verify = __req('./src/zen/verify.js').default;
  var encrypt = __req('./src/zen/encrypt.js').default;
  var decrypt = __req('./src/zen/decrypt.js').default;
  var secret = __req('./src/zen/secret.js').default;
  var shim = __req('./src/zen/shim.js').default;
  var hash = __req('./src/zen/hash.js').default;
  var certify = __req('./src/zen/certify.js').default;
  var keyid = __req('./src/zen/keyid.js').default;
  var security = __req('./src/zen/runtime.js').default;
  var graph = __req('./src/zen/graph.js').default;
  var hasOwn = Object.prototype.hasOwnProperty;
  var STATIC_SKIP = { length: 1, name: 1, prototype: 1 };
  var CHAIN_SKIP = { constructor: 1 };
  var ZEN_SKIP = {};
  async function finalizeSigned(result, opt, cb) {
    try {
      if (!(opt || {}).raw) {
        result = await shim.stringify(result);
      }
      if (cb) { try { cb(result); } catch (e) { console.log(e); } }
      return result;
    } catch (e) {
      return result;
    }
  }
  var SECP256K1 = {
    curve: secp256k1.curve,
    base62: secp256k1.base62,
    isOnCurve: secp256k1.isOnCurve,
    parsePub: secp256k1.parsePub,
    pointToPub: secp256k1.pointToPub,
    pair: pair,
    sign: sign,
    verify: verify,
    encrypt: encrypt,
    decrypt: decrypt,
    secret: secret,
    hash: hash,
    certify: certify
  };

  function mirrorStatics(target, source) {
    Object.getOwnPropertyNames(source).forEach(function(name) {
      if (STATIC_SKIP[name] || ZEN_SKIP[name] || hasOwn.call(target, name)) { return }
      var desc = Object.getOwnPropertyDescriptor(source, name);
      if (!desc) { return }
      Object.defineProperty(target, name, desc);
    });
  }

  function mirrorMethods(target, source, pick) {
    Object.getOwnPropertyNames(source).forEach(function(name) {
      if (ZEN_SKIP[name] || (pick && !pick(name)) || hasOwn.call(target, name)) { return }
      var desc = Object.getOwnPropertyDescriptor(source, name);
      if (!desc || 'function' !== typeof desc.value) { return }
      Object.defineProperty(target, name, {
        configurable: true,
        writable: true,
        value: function(...args) {
          return this.constructor[name](...args);
        }
      });
    });
  }

  function mirrorChain(target, source) {
    Object.getOwnPropertyNames(source).forEach(function(name) {
      if (CHAIN_SKIP[name] || hasOwn.call(target, name)) { return }
      var desc = Object.getOwnPropertyDescriptor(source, name);
      if (!desc || 'function' !== typeof desc.value) { return }
      Object.defineProperty(target, name, {
        configurable: true,
        writable: true,
        value: function(...args) {
          return this._graph[name](...args);
        }
      });
    });
  }

  class ZEN {
    constructor(opt = {}) {
      this.OPT = opt;
      this._graphInstance = opt.graph || opt.zen || opt.ZEN || opt.GUN || opt.gun || null;
      this._graphOpt = this._graphInstance ? null : (opt.graphOpt || opt.zenOpt || opt.ZENOpt || opt.GUNOpt || opt.gunOpt || opt);
    }

    static pen(spec = {}) { return PEN.pen(spec) }
    static candle(opts = {}) { return PEN.candle(opts) }
    static pair(...args) { return pair(...args) }
    static async sign(data, pairLike, cb, opt) {
      opt = opt || {};
      if (data === undefined) { throw new Error('`undefined` not allowed.'); }
      var parsed = await settings.parse(data);
      var check = opt.check = opt.check || parsed;
      if (typeof pairLike !== 'function' && (settings.check(check) || (check && check.s && check.m))) {
        try {
          if (undefined !== (await verify(check, pairLike))) {
            return finalizeSigned(await settings.parse(check), opt, cb);
          }
        } catch (e) {}
      }
      if (typeof pairLike === 'function') {
        var signed = await pairLike(data);
        if (signed && signed.authenticatorData) {
          return finalizeSigned({
            m: parsed,
            s: signed.signature ? shim.Buffer.from(signed.signature, 'binary').toString(opt.encode || 'base64') : undefined,
            a: shim.Buffer.from(signed.authenticatorData, 'binary').toString('base64'),
            c: shim.Buffer.from(signed.clientDataJSON, 'binary').toString('base64')
          }, opt, cb);
        }
        return finalizeSigned({
          m: parsed,
          s: typeof signed === 'string'
            ? signed
            : signed && signed.signature
              ? shim.Buffer.from(signed.signature, 'binary').toString(opt.encode || 'base64')
              : undefined
        }, opt, cb);
      }
      return sign(data, pairLike, cb, opt);
    }
    static verify(...args) { return verify(...args) }
    static encrypt(...args) { return encrypt(...args) }
    static decrypt(...args) { return decrypt(...args) }
    static secret(...args) { return secret(...args) }
    static hash(...args) { return hash(...args) }
    static certify(...args) { return certify(...args) }

    get _graph() {
      if (!this._graphInstance) {
        this._graphInstance = graph.create(this._graphOpt || {});
      }
      return this._graphInstance;
    }

    get SECP256K1() { return SECP256K1 }
    get ready() { return PEN.ready }

    use(runtime) {
      this._graphInstance = runtime;
      return this;
    }

    chain() { return this._graph }
    pen(spec = {}) { return this.constructor.pen(spec) }
    candle(opts = {}) { return this.constructor.candle(opts) }
    pair(...args) { return this.constructor.pair(...args) }
    sign(...args) { return this.constructor.sign(...args) }
    verify(...args) { return this.constructor.verify(...args) }
    encrypt(...args) { return this.constructor.encrypt(...args) }
    decrypt(...args) { return this.constructor.decrypt(...args) }
    secret(...args) { return this.constructor.secret(...args) }
    hash(...args) { return this.constructor.hash(...args) }
    certify(...args) { return this.constructor.certify(...args) }

    get(...args) { return this._graph.get(...args) }
    put(...args) { return this._graph.put(...args) }
    on(...args) { return this._graph.on(...args) }
    once(...args) { return this._graph.once(...args) }
    map(...args) { return this._graph.map(...args) }
    set(...args) { return this._graph.set(...args) }
    back(...args) { return this._graph.back(...args) }
  }

  mirrorStatics(ZEN, graph.core);
  mirrorStatics(ZEN, PEN);
  mirrorMethods(ZEN.prototype, PEN, function(name) { return !CHAIN_SKIP[name] });
  mirrorChain(ZEN.prototype, graph.chain);

  ZEN.SECP256K1 = SECP256K1;
  ZEN.Buffer = shim.Buffer;
  ZEN.random = shim.random;
  ZEN.keyid = keyid;
  ZEN.graph = graph;
  ZEN.security = security;
  ZEN.check = security.check;
  ZEN.opt = security.opt;


  __exp.default = ZEN;

  __exp.ZEN = ZEN;
});

const __zen = __req('./src/zen/index.js');
const ZEN = __zen.default;
export { ZEN };
export default ZEN;
