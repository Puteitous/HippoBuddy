var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/jszip/dist/jszip.min.js
var require_jszip_min = __commonJS({
  "node_modules/jszip/dist/jszip.min.js"(exports, module) {
    !(function(e) {
      if ("object" == typeof exports && "undefined" != typeof module) module.exports = e();
      else if ("function" == typeof define && define.amd) define([], e);
      else {
        ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e();
      }
    })(function() {
      return (function s(a, o, h2) {
        function u(r, e2) {
          if (!o[r]) {
            if (!a[r]) {
              var t = "function" == typeof __require && __require;
              if (!e2 && t) return t(r, true);
              if (l) return l(r, true);
              var n = new Error("Cannot find module '" + r + "'");
              throw n.code = "MODULE_NOT_FOUND", n;
            }
            var i = o[r] = { exports: {} };
            a[r][0].call(i.exports, function(e3) {
              var t2 = a[r][1][e3];
              return u(t2 || e3);
            }, i, i.exports, s, a, o, h2);
          }
          return o[r].exports;
        }
        for (var l = "function" == typeof __require && __require, e = 0; e < h2.length; e++) u(h2[e]);
        return u;
      })({ 1: [function(e, t, r) {
        "use strict";
        var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        r.encode = function(e2) {
          for (var t2, r2, n, i, s, a, o, h2 = [], u = 0, l = e2.length, f = l, c2 = "string" !== d.getTypeOf(e2); u < e2.length; ) f = l - u, n = c2 ? (t2 = e2[u++], r2 = u < l ? e2[u++] : 0, u < l ? e2[u++] : 0) : (t2 = e2.charCodeAt(u++), r2 = u < l ? e2.charCodeAt(u++) : 0, u < l ? e2.charCodeAt(u++) : 0), i = t2 >> 2, s = (3 & t2) << 4 | r2 >> 4, a = 1 < f ? (15 & r2) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h2.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
          return h2.join("");
        }, r.decode = function(e2) {
          var t2, r2, n, i, s, a, o = 0, h2 = 0, u = "data:";
          if (e2.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
          var l, f = 3 * (e2 = e2.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
          if (e2.charAt(e2.length - 1) === p.charAt(64) && f--, e2.charAt(e2.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
          for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e2.length; ) t2 = p.indexOf(e2.charAt(o++)) << 2 | (i = p.indexOf(e2.charAt(o++))) >> 4, r2 = (15 & i) << 4 | (s = p.indexOf(e2.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e2.charAt(o++))), l[h2++] = t2, 64 !== s && (l[h2++] = r2), 64 !== a && (l[h2++] = n);
          return l;
        };
      }, { "./support": 30, "./utils": 32 }], 2: [function(e, t, r) {
        "use strict";
        var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
        function o(e2, t2, r2, n2, i2) {
          this.compressedSize = e2, this.uncompressedSize = t2, this.crc32 = r2, this.compression = n2, this.compressedContent = i2;
        }
        o.prototype = { getContentWorker: function() {
          var e2 = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t2 = this;
          return e2.on("end", function() {
            if (this.streamInfo.data_length !== t2.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
          }), e2;
        }, getCompressedWorker: function() {
          return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
        } }, o.createWorkerFrom = function(e2, t2, r2) {
          return e2.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t2.compressWorker(r2)).pipe(new a("compressedSize")).withStreamInfo("compression", t2);
        }, t.exports = o;
      }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(e, t, r) {
        "use strict";
        var n = e("./stream/GenericWorker");
        r.STORE = { magic: "\0\0", compressWorker: function() {
          return new n("STORE compression");
        }, uncompressWorker: function() {
          return new n("STORE decompression");
        } }, r.DEFLATE = e("./flate");
      }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(e, t, r) {
        "use strict";
        var n = e("./utils");
        var o = (function() {
          for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
            e2 = r2;
            for (var n2 = 0; n2 < 8; n2++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
            t2[r2] = e2;
          }
          return t2;
        })();
        t.exports = function(e2, t2) {
          return void 0 !== e2 && e2.length ? "string" !== n.getTypeOf(e2) ? (function(e3, t3, r2, n2) {
            var i = o, s = n2 + r2;
            e3 ^= -1;
            for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3[a])];
            return -1 ^ e3;
          })(0 | t2, e2, e2.length, 0) : (function(e3, t3, r2, n2) {
            var i = o, s = n2 + r2;
            e3 ^= -1;
            for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3.charCodeAt(a))];
            return -1 ^ e3;
          })(0 | t2, e2, e2.length, 0) : 0;
        };
      }, { "./utils": 32 }], 5: [function(e, t, r) {
        "use strict";
        r.base64 = false, r.binary = false, r.dir = false, r.createFolders = true, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
      }, {}], 6: [function(e, t, r) {
        "use strict";
        var n = null;
        n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
      }, { lie: 37 }], 7: [function(e, t, r) {
        "use strict";
        var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
        function h2(e2, t2) {
          a.call(this, "FlateWorker/" + e2), this._pako = null, this._pakoAction = e2, this._pakoOptions = t2, this.meta = {};
        }
        r.magic = "\b\0", s.inherits(h2, a), h2.prototype.processChunk = function(e2) {
          this.meta = e2.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e2.data), false);
        }, h2.prototype.flush = function() {
          a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], true);
        }, h2.prototype.cleanUp = function() {
          a.prototype.cleanUp.call(this), this._pako = null;
        }, h2.prototype._createPako = function() {
          this._pako = new i[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
          var t2 = this;
          this._pako.onData = function(e2) {
            t2.push({ data: e2, meta: t2.meta });
          };
        }, r.compressWorker = function(e2) {
          return new h2("Deflate", e2);
        }, r.uncompressWorker = function() {
          return new h2("Inflate", {});
        };
      }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(e, t, r) {
        "use strict";
        function A(e2, t2) {
          var r2, n2 = "";
          for (r2 = 0; r2 < t2; r2++) n2 += String.fromCharCode(255 & e2), e2 >>>= 8;
          return n2;
        }
        function n(e2, t2, r2, n2, i2, s2) {
          var a, o, h2 = e2.file, u = e2.compression, l = s2 !== O.utf8encode, f = I.transformTo("string", s2(h2.name)), c = I.transformTo("string", O.utf8encode(h2.name)), d = h2.comment, p = I.transformTo("string", s2(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h2.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h2.dir, k = h2.date, x = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
          t2 && !r2 || (x.crc32 = e2.crc32, x.compressedSize = e2.compressedSize, x.uncompressedSize = e2.uncompressedSize);
          var S = 0;
          t2 && (S |= 8), l || !_ && !g || (S |= 2048);
          var z = 0, C = 0;
          w && (z |= 16), "UNIX" === i2 ? (C = 798, z |= (function(e3, t3) {
            var r3 = e3;
            return e3 || (r3 = t3 ? 16893 : 33204), (65535 & r3) << 16;
          })(h2.unixPermissions, w)) : (C = 20, z |= (function(e3) {
            return 63 & (e3 || 0);
          })(h2.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
          var E = "";
          return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), { fileRecord: R.LOCAL_FILE_HEADER + E + f + b, dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n2, 4) + f + b + p };
        }
        var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
        function s(e2, t2, r2, n2) {
          i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t2, this.zipPlatform = r2, this.encodeFileName = n2, this.streamFiles = e2, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
        }
        I.inherits(s, i), s.prototype.push = function(e2) {
          var t2 = e2.meta.percent || 0, r2 = this.entriesCount, n2 = this._sources.length;
          this.accumulate ? this.contentBuffer.push(e2) : (this.bytesWritten += e2.data.length, i.prototype.push.call(this, { data: e2.data, meta: { currentFile: this.currentFile, percent: r2 ? (t2 + 100 * (r2 - n2 - 1)) / r2 : 100 } }));
        }, s.prototype.openedSource = function(e2) {
          this.currentSourceOffset = this.bytesWritten, this.currentFile = e2.file.name;
          var t2 = this.streamFiles && !e2.file.dir;
          if (t2) {
            var r2 = n(e2, t2, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            this.push({ data: r2.fileRecord, meta: { percent: 0 } });
          } else this.accumulate = true;
        }, s.prototype.closedSource = function(e2) {
          this.accumulate = false;
          var t2 = this.streamFiles && !e2.file.dir, r2 = n(e2, t2, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
          if (this.dirRecords.push(r2.dirRecord), t2) this.push({ data: (function(e3) {
            return R.DATA_DESCRIPTOR + A(e3.crc32, 4) + A(e3.compressedSize, 4) + A(e3.uncompressedSize, 4);
          })(e2), meta: { percent: 100 } });
          else for (this.push({ data: r2.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
          this.currentFile = null;
        }, s.prototype.flush = function() {
          for (var e2 = this.bytesWritten, t2 = 0; t2 < this.dirRecords.length; t2++) this.push({ data: this.dirRecords[t2], meta: { percent: 100 } });
          var r2 = this.bytesWritten - e2, n2 = (function(e3, t3, r3, n3, i2) {
            var s2 = I.transformTo("string", i2(n3));
            return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e3, 2) + A(e3, 2) + A(t3, 4) + A(r3, 4) + A(s2.length, 2) + s2;
          })(this.dirRecords.length, r2, e2, this.zipComment, this.encodeFileName);
          this.push({ data: n2, meta: { percent: 100 } });
        }, s.prototype.prepareNextSource = function() {
          this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
        }, s.prototype.registerPrevious = function(e2) {
          this._sources.push(e2);
          var t2 = this;
          return e2.on("data", function(e3) {
            t2.processChunk(e3);
          }), e2.on("end", function() {
            t2.closedSource(t2.previous.streamInfo), t2._sources.length ? t2.prepareNextSource() : t2.end();
          }), e2.on("error", function(e3) {
            t2.error(e3);
          }), this;
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
        }, s.prototype.error = function(e2) {
          var t2 = this._sources;
          if (!i.prototype.error.call(this, e2)) return false;
          for (var r2 = 0; r2 < t2.length; r2++) try {
            t2[r2].error(e2);
          } catch (e3) {
          }
          return true;
        }, s.prototype.lock = function() {
          i.prototype.lock.call(this);
          for (var e2 = this._sources, t2 = 0; t2 < e2.length; t2++) e2[t2].lock();
        }, t.exports = s;
      }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(e, t, r) {
        "use strict";
        var u = e("../compressions"), n = e("./ZipFileWorker");
        r.generateWorker = function(e2, a, t2) {
          var o = new n(a.streamFiles, t2, a.platform, a.encodeFileName), h2 = 0;
          try {
            e2.forEach(function(e3, t3) {
              h2++;
              var r2 = (function(e4, t4) {
                var r3 = e4 || t4, n3 = u[r3];
                if (!n3) throw new Error(r3 + " is not a valid compression method !");
                return n3;
              })(t3.options.compression, a.compression), n2 = t3.options.compressionOptions || a.compressionOptions || {}, i = t3.dir, s = t3.date;
              t3._compressWorker(r2, n2).withStreamInfo("file", { name: e3, dir: i, date: s, comment: t3.comment || "", unixPermissions: t3.unixPermissions, dosPermissions: t3.dosPermissions }).pipe(o);
            }), o.entriesCount = h2;
          } catch (e3) {
            o.error(e3);
          }
          return o;
        };
      }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(e, t, r) {
        "use strict";
        function n() {
          if (!(this instanceof n)) return new n();
          if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
          this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
            var e2 = new n();
            for (var t2 in this) "function" != typeof this[t2] && (e2[t2] = this[t2]);
            return e2;
          };
        }
        (n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.1", n.loadAsync = function(e2, t2) {
          return new n().loadAsync(e2, t2);
        }, n.external = e("./external"), t.exports = n;
      }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(e, t, r) {
        "use strict";
        var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
        function f(n2) {
          return new i.Promise(function(e2, t2) {
            var r2 = n2.decompressed.getContentWorker().pipe(new a());
            r2.on("error", function(e3) {
              t2(e3);
            }).on("end", function() {
              r2.streamInfo.crc32 !== n2.decompressed.crc32 ? t2(new Error("Corrupted zip : CRC32 mismatch")) : e2();
            }).resume();
          });
        }
        t.exports = function(e2, o) {
          var h2 = this;
          return o = u.extend(o || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: n.utf8decode }), l.isNode && l.isStream(e2) ? i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e2, true, o.optimizedBinaryString, o.base64).then(function(e3) {
            var t2 = new s(o);
            return t2.load(e3), t2;
          }).then(function(e3) {
            var t2 = [i.Promise.resolve(e3)], r2 = e3.files;
            if (o.checkCRC32) for (var n2 = 0; n2 < r2.length; n2++) t2.push(f(r2[n2]));
            return i.Promise.all(t2);
          }).then(function(e3) {
            for (var t2 = e3.shift(), r2 = t2.files, n2 = 0; n2 < r2.length; n2++) {
              var i2 = r2[n2], s2 = i2.fileNameStr, a2 = u.resolve(i2.fileNameStr);
              h2.file(a2, i2.decompressed, { binary: true, optimizedBinaryString: true, date: i2.date, dir: i2.dir, comment: i2.fileCommentStr.length ? i2.fileCommentStr : null, unixPermissions: i2.unixPermissions, dosPermissions: i2.dosPermissions, createFolders: o.createFolders }), i2.dir || (h2.file(a2).unsafeOriginalName = s2);
            }
            return t2.zipComment.length && (h2.comment = t2.zipComment), h2;
          });
        };
      }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(e, t, r) {
        "use strict";
        var n = e("../utils"), i = e("../stream/GenericWorker");
        function s(e2, t2) {
          i.call(this, "Nodejs stream input adapter for " + e2), this._upstreamEnded = false, this._bindStream(t2);
        }
        n.inherits(s, i), s.prototype._bindStream = function(e2) {
          var t2 = this;
          (this._stream = e2).pause(), e2.on("data", function(e3) {
            t2.push({ data: e3, meta: { percent: 0 } });
          }).on("error", function(e3) {
            t2.isPaused ? this.generatedError = e3 : t2.error(e3);
          }).on("end", function() {
            t2.isPaused ? t2._upstreamEnded = true : t2.end();
          });
        }, s.prototype.pause = function() {
          return !!i.prototype.pause.call(this) && (this._stream.pause(), true);
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
        }, t.exports = s;
      }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(e, t, r) {
        "use strict";
        var i = e("readable-stream").Readable;
        function n(e2, t2, r2) {
          i.call(this, t2), this._helper = e2;
          var n2 = this;
          e2.on("data", function(e3, t3) {
            n2.push(e3) || n2._helper.pause(), r2 && r2(t3);
          }).on("error", function(e3) {
            n2.emit("error", e3);
          }).on("end", function() {
            n2.push(null);
          });
        }
        e("../utils").inherits(n, i), n.prototype._read = function() {
          this._helper.resume();
        }, t.exports = n;
      }, { "../utils": 32, "readable-stream": 16 }], 14: [function(e, t, r) {
        "use strict";
        t.exports = { isNode: "undefined" != typeof Buffer, newBufferFrom: function(e2, t2) {
          if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e2, t2);
          if ("number" == typeof e2) throw new Error('The "data" argument must not be a number');
          return new Buffer(e2, t2);
        }, allocBuffer: function(e2) {
          if (Buffer.alloc) return Buffer.alloc(e2);
          var t2 = new Buffer(e2);
          return t2.fill(0), t2;
        }, isBuffer: function(e2) {
          return Buffer.isBuffer(e2);
        }, isStream: function(e2) {
          return e2 && "function" == typeof e2.on && "function" == typeof e2.pause && "function" == typeof e2.resume;
        } };
      }, {}], 15: [function(e, t, r) {
        "use strict";
        function s(e2, t2, r2) {
          var n2, i2 = u.getTypeOf(t2), s2 = u.extend(r2 || {}, f);
          s2.date = s2.date || /* @__PURE__ */ new Date(), null !== s2.compression && (s2.compression = s2.compression.toUpperCase()), "string" == typeof s2.unixPermissions && (s2.unixPermissions = parseInt(s2.unixPermissions, 8)), s2.unixPermissions && 16384 & s2.unixPermissions && (s2.dir = true), s2.dosPermissions && 16 & s2.dosPermissions && (s2.dir = true), s2.dir && (e2 = g(e2)), s2.createFolders && (n2 = _(e2)) && b.call(this, n2, true);
          var a2 = "string" === i2 && false === s2.binary && false === s2.base64;
          r2 && void 0 !== r2.binary || (s2.binary = !a2), (t2 instanceof c && 0 === t2.uncompressedSize || s2.dir || !t2 || 0 === t2.length) && (s2.base64 = false, s2.binary = true, t2 = "", s2.compression = "STORE", i2 = "string");
          var o2 = null;
          o2 = t2 instanceof c || t2 instanceof l ? t2 : p.isNode && p.isStream(t2) ? new m(e2, t2) : u.prepareContent(e2, t2, s2.binary, s2.optimizedBinaryString, s2.base64);
          var h3 = new d(e2, o2, s2);
          this.files[e2] = h3;
        }
        var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e2) {
          "/" === e2.slice(-1) && (e2 = e2.substring(0, e2.length - 1));
          var t2 = e2.lastIndexOf("/");
          return 0 < t2 ? e2.substring(0, t2) : "";
        }, g = function(e2) {
          return "/" !== e2.slice(-1) && (e2 += "/"), e2;
        }, b = function(e2, t2) {
          return t2 = void 0 !== t2 ? t2 : f.createFolders, e2 = g(e2), this.files[e2] || s.call(this, e2, null, { dir: true, createFolders: t2 }), this.files[e2];
        };
        function h2(e2) {
          return "[object RegExp]" === Object.prototype.toString.call(e2);
        }
        var n = { load: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, forEach: function(e2) {
          var t2, r2, n2;
          for (t2 in this.files) n2 = this.files[t2], (r2 = t2.slice(this.root.length, t2.length)) && t2.slice(0, this.root.length) === this.root && e2(r2, n2);
        }, filter: function(r2) {
          var n2 = [];
          return this.forEach(function(e2, t2) {
            r2(e2, t2) && n2.push(t2);
          }), n2;
        }, file: function(e2, t2, r2) {
          if (1 !== arguments.length) return e2 = this.root + e2, s.call(this, e2, t2, r2), this;
          if (h2(e2)) {
            var n2 = e2;
            return this.filter(function(e3, t3) {
              return !t3.dir && n2.test(e3);
            });
          }
          var i2 = this.files[this.root + e2];
          return i2 && !i2.dir ? i2 : null;
        }, folder: function(r2) {
          if (!r2) return this;
          if (h2(r2)) return this.filter(function(e3, t3) {
            return t3.dir && r2.test(e3);
          });
          var e2 = this.root + r2, t2 = b.call(this, e2), n2 = this.clone();
          return n2.root = t2.name, n2;
        }, remove: function(r2) {
          r2 = this.root + r2;
          var e2 = this.files[r2];
          if (e2 || ("/" !== r2.slice(-1) && (r2 += "/"), e2 = this.files[r2]), e2 && !e2.dir) delete this.files[r2];
          else for (var t2 = this.filter(function(e3, t3) {
            return t3.name.slice(0, r2.length) === r2;
          }), n2 = 0; n2 < t2.length; n2++) delete this.files[t2[n2].name];
          return this;
        }, generate: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, generateInternalStream: function(e2) {
          var t2, r2 = {};
          try {
            if ((r2 = u.extend(e2 || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: i.utf8encode })).type = r2.type.toLowerCase(), r2.compression = r2.compression.toUpperCase(), "binarystring" === r2.type && (r2.type = "string"), !r2.type) throw new Error("No output type specified.");
            u.checkSupport(r2.type), "darwin" !== r2.platform && "freebsd" !== r2.platform && "linux" !== r2.platform && "sunos" !== r2.platform || (r2.platform = "UNIX"), "win32" === r2.platform && (r2.platform = "DOS");
            var n2 = r2.comment || this.comment || "";
            t2 = o.generateWorker(this, r2, n2);
          } catch (e3) {
            (t2 = new l("error")).error(e3);
          }
          return new a(t2, r2.type || "string", r2.mimeType);
        }, generateAsync: function(e2, t2) {
          return this.generateInternalStream(e2).accumulate(t2);
        }, generateNodeStream: function(e2, t2) {
          return (e2 = e2 || {}).type || (e2.type = "nodebuffer"), this.generateInternalStream(e2).toNodejsStream(t2);
        } };
        t.exports = n;
      }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(e, t, r) {
        "use strict";
        t.exports = e("stream");
      }, { stream: void 0 }], 17: [function(e, t, r) {
        "use strict";
        var n = e("./DataReader");
        function i(e2) {
          n.call(this, e2);
          for (var t2 = 0; t2 < this.data.length; t2++) e2[t2] = 255 & e2[t2];
        }
        e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
          return this.data[this.zero + e2];
        }, i.prototype.lastIndexOfSignature = function(e2) {
          for (var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t2 && this.data[s + 1] === r2 && this.data[s + 2] === n2 && this.data[s + 3] === i2) return s - this.zero;
          return -1;
        }, i.prototype.readAndCheckSignature = function(e2) {
          var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.readData(4);
          return t2 === s[0] && r2 === s[1] && n2 === s[2] && i2 === s[3];
        }, i.prototype.readData = function(e2) {
          if (this.checkOffset(e2), 0 === e2) return [];
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./DataReader": 18 }], 18: [function(e, t, r) {
        "use strict";
        var n = e("../utils");
        function i(e2) {
          this.data = e2, this.length = e2.length, this.index = 0, this.zero = 0;
        }
        i.prototype = { checkOffset: function(e2) {
          this.checkIndex(this.index + e2);
        }, checkIndex: function(e2) {
          if (this.length < this.zero + e2 || e2 < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e2 + "). Corrupted zip ?");
        }, setIndex: function(e2) {
          this.checkIndex(e2), this.index = e2;
        }, skip: function(e2) {
          this.setIndex(this.index + e2);
        }, byteAt: function() {
        }, readInt: function(e2) {
          var t2, r2 = 0;
          for (this.checkOffset(e2), t2 = this.index + e2 - 1; t2 >= this.index; t2--) r2 = (r2 << 8) + this.byteAt(t2);
          return this.index += e2, r2;
        }, readString: function(e2) {
          return n.transformTo("string", this.readData(e2));
        }, readData: function() {
        }, lastIndexOfSignature: function() {
        }, readAndCheckSignature: function() {
        }, readDate: function() {
          var e2 = this.readInt(4);
          return new Date(Date.UTC(1980 + (e2 >> 25 & 127), (e2 >> 21 & 15) - 1, e2 >> 16 & 31, e2 >> 11 & 31, e2 >> 5 & 63, (31 & e2) << 1));
        } }, t.exports = i;
      }, { "../utils": 32 }], 19: [function(e, t, r) {
        "use strict";
        var n = e("./Uint8ArrayReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
          this.checkOffset(e2);
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(e, t, r) {
        "use strict";
        var n = e("./DataReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
          return this.data.charCodeAt(this.zero + e2);
        }, i.prototype.lastIndexOfSignature = function(e2) {
          return this.data.lastIndexOf(e2) - this.zero;
        }, i.prototype.readAndCheckSignature = function(e2) {
          return e2 === this.readData(4);
        }, i.prototype.readData = function(e2) {
          this.checkOffset(e2);
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./DataReader": 18 }], 21: [function(e, t, r) {
        "use strict";
        var n = e("./ArrayReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
          if (this.checkOffset(e2), 0 === e2) return new Uint8Array(0);
          var t2 = this.data.subarray(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(e, t, r) {
        "use strict";
        var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h2 = e("./Uint8ArrayReader");
        t.exports = function(e2) {
          var t2 = n.getTypeOf(e2);
          return n.checkSupport(t2), "string" !== t2 || i.uint8array ? "nodebuffer" === t2 ? new o(e2) : i.uint8array ? new h2(n.transformTo("uint8array", e2)) : new s(n.transformTo("array", e2)) : new a(e2);
        };
      }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(e, t, r) {
        "use strict";
        r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
      }, {}], 24: [function(e, t, r) {
        "use strict";
        var n = e("./GenericWorker"), i = e("../utils");
        function s(e2) {
          n.call(this, "ConvertWorker to " + e2), this.destType = e2;
        }
        i.inherits(s, n), s.prototype.processChunk = function(e2) {
          this.push({ data: i.transformTo(this.destType, e2.data), meta: e2.meta });
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(e, t, r) {
        "use strict";
        var n = e("./GenericWorker"), i = e("../crc32");
        function s() {
          n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
        }
        e("../utils").inherits(s, n), s.prototype.processChunk = function(e2) {
          this.streamInfo.crc32 = i(e2.data, this.streamInfo.crc32 || 0), this.push(e2);
        }, t.exports = s;
      }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(e, t, r) {
        "use strict";
        var n = e("../utils"), i = e("./GenericWorker");
        function s(e2) {
          i.call(this, "DataLengthProbe for " + e2), this.propName = e2, this.withStreamInfo(e2, 0);
        }
        n.inherits(s, i), s.prototype.processChunk = function(e2) {
          if (e2) {
            var t2 = this.streamInfo[this.propName] || 0;
            this.streamInfo[this.propName] = t2 + e2.data.length;
          }
          i.prototype.processChunk.call(this, e2);
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(e, t, r) {
        "use strict";
        var n = e("../utils"), i = e("./GenericWorker");
        function s(e2) {
          i.call(this, "DataWorker");
          var t2 = this;
          this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, e2.then(function(e3) {
            t2.dataIsReady = true, t2.data = e3, t2.max = e3 && e3.length || 0, t2.type = n.getTypeOf(e3), t2.isPaused || t2._tickAndRepeat();
          }, function(e3) {
            t2.error(e3);
          });
        }
        n.inherits(s, i), s.prototype.cleanUp = function() {
          i.prototype.cleanUp.call(this), this.data = null;
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, n.delay(this._tickAndRepeat, [], this)), true);
        }, s.prototype._tickAndRepeat = function() {
          this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
        }, s.prototype._tick = function() {
          if (this.isPaused || this.isFinished) return false;
          var e2 = null, t2 = Math.min(this.max, this.index + 16384);
          if (this.index >= this.max) return this.end();
          switch (this.type) {
            case "string":
              e2 = this.data.substring(this.index, t2);
              break;
            case "uint8array":
              e2 = this.data.subarray(this.index, t2);
              break;
            case "array":
            case "nodebuffer":
              e2 = this.data.slice(this.index, t2);
          }
          return this.index = t2, this.push({ data: e2, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(e, t, r) {
        "use strict";
        function n(e2) {
          this.name = e2 || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
        }
        n.prototype = { push: function(e2) {
          this.emit("data", e2);
        }, end: function() {
          if (this.isFinished) return false;
          this.flush();
          try {
            this.emit("end"), this.cleanUp(), this.isFinished = true;
          } catch (e2) {
            this.emit("error", e2);
          }
          return true;
        }, error: function(e2) {
          return !this.isFinished && (this.isPaused ? this.generatedError = e2 : (this.isFinished = true, this.emit("error", e2), this.previous && this.previous.error(e2), this.cleanUp()), true);
        }, on: function(e2, t2) {
          return this._listeners[e2].push(t2), this;
        }, cleanUp: function() {
          this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
        }, emit: function(e2, t2) {
          if (this._listeners[e2]) for (var r2 = 0; r2 < this._listeners[e2].length; r2++) this._listeners[e2][r2].call(this, t2);
        }, pipe: function(e2) {
          return e2.registerPrevious(this);
        }, registerPrevious: function(e2) {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.streamInfo = e2.streamInfo, this.mergeStreamInfo(), this.previous = e2;
          var t2 = this;
          return e2.on("data", function(e3) {
            t2.processChunk(e3);
          }), e2.on("end", function() {
            t2.end();
          }), e2.on("error", function(e3) {
            t2.error(e3);
          }), this;
        }, pause: function() {
          return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
        }, resume: function() {
          if (!this.isPaused || this.isFinished) return false;
          var e2 = this.isPaused = false;
          return this.generatedError && (this.error(this.generatedError), e2 = true), this.previous && this.previous.resume(), !e2;
        }, flush: function() {
        }, processChunk: function(e2) {
          this.push(e2);
        }, withStreamInfo: function(e2, t2) {
          return this.extraStreamInfo[e2] = t2, this.mergeStreamInfo(), this;
        }, mergeStreamInfo: function() {
          for (var e2 in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e2) && (this.streamInfo[e2] = this.extraStreamInfo[e2]);
        }, lock: function() {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.isLocked = true, this.previous && this.previous.lock();
        }, toString: function() {
          var e2 = "Worker " + this.name;
          return this.previous ? this.previous + " -> " + e2 : e2;
        } }, t.exports = n;
      }, {}], 29: [function(e, t, r) {
        "use strict";
        var h2 = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
        if (n.nodestream) try {
          o = e("../nodejs/NodejsStreamOutputAdapter");
        } catch (e2) {
        }
        function l(e2, o2) {
          return new a.Promise(function(t2, r2) {
            var n2 = [], i2 = e2._internalType, s2 = e2._outputType, a2 = e2._mimeType;
            e2.on("data", function(e3, t3) {
              n2.push(e3), o2 && o2(t3);
            }).on("error", function(e3) {
              n2 = [], r2(e3);
            }).on("end", function() {
              try {
                var e3 = (function(e4, t3, r3) {
                  switch (e4) {
                    case "blob":
                      return h2.newBlob(h2.transformTo("arraybuffer", t3), r3);
                    case "base64":
                      return u.encode(t3);
                    default:
                      return h2.transformTo(e4, t3);
                  }
                })(s2, (function(e4, t3) {
                  var r3, n3 = 0, i3 = null, s3 = 0;
                  for (r3 = 0; r3 < t3.length; r3++) s3 += t3[r3].length;
                  switch (e4) {
                    case "string":
                      return t3.join("");
                    case "array":
                      return Array.prototype.concat.apply([], t3);
                    case "uint8array":
                      for (i3 = new Uint8Array(s3), r3 = 0; r3 < t3.length; r3++) i3.set(t3[r3], n3), n3 += t3[r3].length;
                      return i3;
                    case "nodebuffer":
                      return Buffer.concat(t3);
                    default:
                      throw new Error("concat : unsupported type '" + e4 + "'");
                  }
                })(i2, n2), a2);
                t2(e3);
              } catch (e4) {
                r2(e4);
              }
              n2 = [];
            }).resume();
          });
        }
        function f(e2, t2, r2) {
          var n2 = t2;
          switch (t2) {
            case "blob":
            case "arraybuffer":
              n2 = "uint8array";
              break;
            case "base64":
              n2 = "string";
          }
          try {
            this._internalType = n2, this._outputType = t2, this._mimeType = r2, h2.checkSupport(n2), this._worker = e2.pipe(new i(n2)), e2.lock();
          } catch (e3) {
            this._worker = new s("error"), this._worker.error(e3);
          }
        }
        f.prototype = { accumulate: function(e2) {
          return l(this, e2);
        }, on: function(e2, t2) {
          var r2 = this;
          return "data" === e2 ? this._worker.on(e2, function(e3) {
            t2.call(r2, e3.data, e3.meta);
          }) : this._worker.on(e2, function() {
            h2.delay(t2, arguments, r2);
          }), this;
        }, resume: function() {
          return h2.delay(this._worker.resume, [], this._worker), this;
        }, pause: function() {
          return this._worker.pause(), this;
        }, toNodejsStream: function(e2) {
          if (h2.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
          return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e2);
        } }, t.exports = f;
      }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(e, t, r) {
        "use strict";
        if (r.base64 = true, r.array = true, r.string = true, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = false;
        else {
          var n = new ArrayBuffer(0);
          try {
            r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
          } catch (e2) {
            try {
              var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
            } catch (e3) {
              r.blob = false;
            }
          }
        }
        try {
          r.nodestream = !!e("readable-stream").Readable;
        } catch (e2) {
          r.nodestream = false;
        }
      }, { "readable-stream": 16 }], 31: [function(e, t, s) {
        "use strict";
        for (var o = e("./utils"), h2 = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
        u[254] = u[254] = 1;
        function a() {
          n.call(this, "utf-8 decode"), this.leftOver = null;
        }
        function l() {
          n.call(this, "utf-8 encode");
        }
        s.utf8encode = function(e2) {
          return h2.nodebuffer ? r.newBufferFrom(e2, "utf-8") : (function(e3) {
            var t2, r2, n2, i2, s2, a2 = e3.length, o2 = 0;
            for (i2 = 0; i2 < a2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o2 += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
            for (t2 = h2.uint8array ? new Uint8Array(o2) : new Array(o2), i2 = s2 = 0; s2 < o2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
            return t2;
          })(e2);
        }, s.utf8decode = function(e2) {
          return h2.nodebuffer ? o.transformTo("nodebuffer", e2).toString("utf-8") : (function(e3) {
            var t2, r2, n2, i2, s2 = e3.length, a2 = new Array(2 * s2);
            for (t2 = r2 = 0; t2 < s2; ) if ((n2 = e3[t2++]) < 128) a2[r2++] = n2;
            else if (4 < (i2 = u[n2])) a2[r2++] = 65533, t2 += i2 - 1;
            else {
              for (n2 &= 2 === i2 ? 31 : 3 === i2 ? 15 : 7; 1 < i2 && t2 < s2; ) n2 = n2 << 6 | 63 & e3[t2++], i2--;
              1 < i2 ? a2[r2++] = 65533 : n2 < 65536 ? a2[r2++] = n2 : (n2 -= 65536, a2[r2++] = 55296 | n2 >> 10 & 1023, a2[r2++] = 56320 | 1023 & n2);
            }
            return a2.length !== r2 && (a2.subarray ? a2 = a2.subarray(0, r2) : a2.length = r2), o.applyFromCharCode(a2);
          })(e2 = o.transformTo(h2.uint8array ? "uint8array" : "array", e2));
        }, o.inherits(a, n), a.prototype.processChunk = function(e2) {
          var t2 = o.transformTo(h2.uint8array ? "uint8array" : "array", e2.data);
          if (this.leftOver && this.leftOver.length) {
            if (h2.uint8array) {
              var r2 = t2;
              (t2 = new Uint8Array(r2.length + this.leftOver.length)).set(this.leftOver, 0), t2.set(r2, this.leftOver.length);
            } else t2 = this.leftOver.concat(t2);
            this.leftOver = null;
          }
          var n2 = (function(e3, t3) {
            var r3;
            for ((t3 = t3 || e3.length) > e3.length && (t3 = e3.length), r3 = t3 - 1; 0 <= r3 && 128 == (192 & e3[r3]); ) r3--;
            return r3 < 0 ? t3 : 0 === r3 ? t3 : r3 + u[e3[r3]] > t3 ? r3 : t3;
          })(t2), i2 = t2;
          n2 !== t2.length && (h2.uint8array ? (i2 = t2.subarray(0, n2), this.leftOver = t2.subarray(n2, t2.length)) : (i2 = t2.slice(0, n2), this.leftOver = t2.slice(n2, t2.length))), this.push({ data: s.utf8decode(i2), meta: e2.meta });
        }, a.prototype.flush = function() {
          this.leftOver && this.leftOver.length && (this.push({ data: s.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
        }, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e2) {
          this.push({ data: s.utf8encode(e2.data), meta: e2.meta });
        }, s.Utf8EncodeWorker = l;
      }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(e, t, a) {
        "use strict";
        var o = e("./support"), h2 = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
        function n(e2) {
          return e2;
        }
        function l(e2, t2) {
          for (var r2 = 0; r2 < e2.length; ++r2) t2[r2] = 255 & e2.charCodeAt(r2);
          return t2;
        }
        e("setimmediate"), a.newBlob = function(t2, r2) {
          a.checkSupport("blob");
          try {
            return new Blob([t2], { type: r2 });
          } catch (e2) {
            try {
              var n2 = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              return n2.append(t2), n2.getBlob(r2);
            } catch (e3) {
              throw new Error("Bug : can't construct the Blob.");
            }
          }
        };
        var i = { stringifyByChunk: function(e2, t2, r2) {
          var n2 = [], i2 = 0, s2 = e2.length;
          if (s2 <= r2) return String.fromCharCode.apply(null, e2);
          for (; i2 < s2; ) "array" === t2 || "nodebuffer" === t2 ? n2.push(String.fromCharCode.apply(null, e2.slice(i2, Math.min(i2 + r2, s2)))) : n2.push(String.fromCharCode.apply(null, e2.subarray(i2, Math.min(i2 + r2, s2)))), i2 += r2;
          return n2.join("");
        }, stringifyByChar: function(e2) {
          for (var t2 = "", r2 = 0; r2 < e2.length; r2++) t2 += String.fromCharCode(e2[r2]);
          return t2;
        }, applyCanBeUsed: { uint8array: (function() {
          try {
            return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
          } catch (e2) {
            return false;
          }
        })(), nodebuffer: (function() {
          try {
            return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
          } catch (e2) {
            return false;
          }
        })() } };
        function s(e2) {
          var t2 = 65536, r2 = a.getTypeOf(e2), n2 = true;
          if ("uint8array" === r2 ? n2 = i.applyCanBeUsed.uint8array : "nodebuffer" === r2 && (n2 = i.applyCanBeUsed.nodebuffer), n2) for (; 1 < t2; ) try {
            return i.stringifyByChunk(e2, r2, t2);
          } catch (e3) {
            t2 = Math.floor(t2 / 2);
          }
          return i.stringifyByChar(e2);
        }
        function f(e2, t2) {
          for (var r2 = 0; r2 < e2.length; r2++) t2[r2] = e2[r2];
          return t2;
        }
        a.applyFromCharCode = s;
        var c = {};
        c.string = { string: n, array: function(e2) {
          return l(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return c.string.uint8array(e2).buffer;
        }, uint8array: function(e2) {
          return l(e2, new Uint8Array(e2.length));
        }, nodebuffer: function(e2) {
          return l(e2, r.allocBuffer(e2.length));
        } }, c.array = { string: s, array: n, arraybuffer: function(e2) {
          return new Uint8Array(e2).buffer;
        }, uint8array: function(e2) {
          return new Uint8Array(e2);
        }, nodebuffer: function(e2) {
          return r.newBufferFrom(e2);
        } }, c.arraybuffer = { string: function(e2) {
          return s(new Uint8Array(e2));
        }, array: function(e2) {
          return f(new Uint8Array(e2), new Array(e2.byteLength));
        }, arraybuffer: n, uint8array: function(e2) {
          return new Uint8Array(e2);
        }, nodebuffer: function(e2) {
          return r.newBufferFrom(new Uint8Array(e2));
        } }, c.uint8array = { string: s, array: function(e2) {
          return f(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return e2.buffer;
        }, uint8array: n, nodebuffer: function(e2) {
          return r.newBufferFrom(e2);
        } }, c.nodebuffer = { string: s, array: function(e2) {
          return f(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return c.nodebuffer.uint8array(e2).buffer;
        }, uint8array: function(e2) {
          return f(e2, new Uint8Array(e2.length));
        }, nodebuffer: n }, a.transformTo = function(e2, t2) {
          if (t2 = t2 || "", !e2) return t2;
          a.checkSupport(e2);
          var r2 = a.getTypeOf(t2);
          return c[r2][e2](t2);
        }, a.resolve = function(e2) {
          for (var t2 = e2.split("/"), r2 = [], n2 = 0; n2 < t2.length; n2++) {
            var i2 = t2[n2];
            "." === i2 || "" === i2 && 0 !== n2 && n2 !== t2.length - 1 || (".." === i2 ? r2.pop() : r2.push(i2));
          }
          return r2.join("/");
        }, a.getTypeOf = function(e2) {
          return "string" == typeof e2 ? "string" : "[object Array]" === Object.prototype.toString.call(e2) ? "array" : o.nodebuffer && r.isBuffer(e2) ? "nodebuffer" : o.uint8array && e2 instanceof Uint8Array ? "uint8array" : o.arraybuffer && e2 instanceof ArrayBuffer ? "arraybuffer" : void 0;
        }, a.checkSupport = function(e2) {
          if (!o[e2.toLowerCase()]) throw new Error(e2 + " is not supported by this platform");
        }, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e2) {
          var t2, r2, n2 = "";
          for (r2 = 0; r2 < (e2 || "").length; r2++) n2 += "\\x" + ((t2 = e2.charCodeAt(r2)) < 16 ? "0" : "") + t2.toString(16).toUpperCase();
          return n2;
        }, a.delay = function(e2, t2, r2) {
          setImmediate(function() {
            e2.apply(r2 || null, t2 || []);
          });
        }, a.inherits = function(e2, t2) {
          function r2() {
          }
          r2.prototype = t2.prototype, e2.prototype = new r2();
        }, a.extend = function() {
          var e2, t2, r2 = {};
          for (e2 = 0; e2 < arguments.length; e2++) for (t2 in arguments[e2]) Object.prototype.hasOwnProperty.call(arguments[e2], t2) && void 0 === r2[t2] && (r2[t2] = arguments[e2][t2]);
          return r2;
        }, a.prepareContent = function(r2, e2, n2, i2, s2) {
          return u.Promise.resolve(e2).then(function(n3) {
            return o.blob && (n3 instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n3))) && "undefined" != typeof FileReader ? new u.Promise(function(t2, r3) {
              var e3 = new FileReader();
              e3.onload = function(e4) {
                t2(e4.target.result);
              }, e3.onerror = function(e4) {
                r3(e4.target.error);
              }, e3.readAsArrayBuffer(n3);
            }) : n3;
          }).then(function(e3) {
            var t2 = a.getTypeOf(e3);
            return t2 ? ("arraybuffer" === t2 ? e3 = a.transformTo("uint8array", e3) : "string" === t2 && (s2 ? e3 = h2.decode(e3) : n2 && true !== i2 && (e3 = (function(e4) {
              return l(e4, o.uint8array ? new Uint8Array(e4.length) : new Array(e4.length));
            })(e3))), e3) : u.Promise.reject(new Error("Can't read the data of '" + r2 + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
          });
        };
      }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(e, t, r) {
        "use strict";
        var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
        function h2(e2) {
          this.files = [], this.loadOptions = e2;
        }
        h2.prototype = { checkSignature: function(e2) {
          if (!this.reader.readAndCheckSignature(e2)) {
            this.reader.index -= 4;
            var t2 = this.reader.readString(4);
            throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t2) + ", expected " + i.pretty(e2) + ")");
          }
        }, isSignature: function(e2, t2) {
          var r2 = this.reader.index;
          this.reader.setIndex(e2);
          var n2 = this.reader.readString(4) === t2;
          return this.reader.setIndex(r2), n2;
        }, readBlockEndOfCentral: function() {
          this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
          var e2 = this.reader.readData(this.zipCommentLength), t2 = o.uint8array ? "uint8array" : "array", r2 = i.transformTo(t2, e2);
          this.zipComment = this.loadOptions.decodeFileName(r2);
        }, readBlockZip64EndOfCentral: function() {
          this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
          for (var e2, t2, r2, n2 = this.zip64EndOfCentralSize - 44; 0 < n2; ) e2 = this.reader.readInt(2), t2 = this.reader.readInt(4), r2 = this.reader.readData(t2), this.zip64ExtensibleData[e2] = { id: e2, length: t2, value: r2 };
        }, readBlockZip64EndOfCentralLocator: function() {
          if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
        }, readLocalFiles: function() {
          var e2, t2;
          for (e2 = 0; e2 < this.files.length; e2++) t2 = this.files[e2], this.reader.setIndex(t2.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t2.readLocalPart(this.reader), t2.handleUTF8(), t2.processAttributes();
        }, readCentralDir: function() {
          var e2;
          for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (e2 = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e2);
          if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
        }, readEndOfCentral: function() {
          var e2 = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
          if (e2 < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : new Error("Corrupted zip: can't find end of central directory");
          this.reader.setIndex(e2);
          var t2 = e2;
          if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
            if (this.zip64 = true, (e2 = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
            if (this.reader.setIndex(e2), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
            this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
          }
          var r2 = this.centralDirOffset + this.centralDirSize;
          this.zip64 && (r2 += 20, r2 += 12 + this.zip64EndOfCentralSize);
          var n2 = t2 - r2;
          if (0 < n2) this.isSignature(t2, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n2);
          else if (n2 < 0) throw new Error("Corrupted zip: missing " + Math.abs(n2) + " bytes.");
        }, prepareReader: function(e2) {
          this.reader = n(e2);
        }, load: function(e2) {
          this.prepareReader(e2), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
        } }, t.exports = h2;
      }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(e, t, r) {
        "use strict";
        var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h2 = e("./compressions"), u = e("./support");
        function l(e2, t2) {
          this.options = e2, this.loadOptions = t2;
        }
        l.prototype = { isEncrypted: function() {
          return 1 == (1 & this.bitFlag);
        }, useUTF8: function() {
          return 2048 == (2048 & this.bitFlag);
        }, readLocalPart: function(e2) {
          var t2, r2;
          if (e2.skip(22), this.fileNameLength = e2.readInt(2), r2 = e2.readInt(2), this.fileName = e2.readData(this.fileNameLength), e2.skip(r2), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
          if (null === (t2 = (function(e3) {
            for (var t3 in h2) if (Object.prototype.hasOwnProperty.call(h2, t3) && h2[t3].magic === e3) return h2[t3];
            return null;
          })(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
          this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t2, e2.readData(this.compressedSize));
        }, readCentralPart: function(e2) {
          this.versionMadeBy = e2.readInt(2), e2.skip(2), this.bitFlag = e2.readInt(2), this.compressionMethod = e2.readString(2), this.date = e2.readDate(), this.crc32 = e2.readInt(4), this.compressedSize = e2.readInt(4), this.uncompressedSize = e2.readInt(4);
          var t2 = e2.readInt(2);
          if (this.extraFieldsLength = e2.readInt(2), this.fileCommentLength = e2.readInt(2), this.diskNumberStart = e2.readInt(2), this.internalFileAttributes = e2.readInt(2), this.externalFileAttributes = e2.readInt(4), this.localHeaderOffset = e2.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
          e2.skip(t2), this.readExtraFields(e2), this.parseZIP64ExtraField(e2), this.fileComment = e2.readData(this.fileCommentLength);
        }, processAttributes: function() {
          this.unixPermissions = null, this.dosPermissions = null;
          var e2 = this.versionMadeBy >> 8;
          this.dir = !!(16 & this.externalFileAttributes), 0 == e2 && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e2 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = true);
        }, parseZIP64ExtraField: function() {
          if (this.extraFields[1]) {
            var e2 = n(this.extraFields[1].value);
            this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e2.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e2.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e2.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e2.readInt(4));
          }
        }, readExtraFields: function(e2) {
          var t2, r2, n2, i2 = e2.index + this.extraFieldsLength;
          for (this.extraFields || (this.extraFields = {}); e2.index + 4 < i2; ) t2 = e2.readInt(2), r2 = e2.readInt(2), n2 = e2.readData(r2), this.extraFields[t2] = { id: t2, length: r2, value: n2 };
          e2.setIndex(i2);
        }, handleUTF8: function() {
          var e2 = u.uint8array ? "uint8array" : "array";
          if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
          else {
            var t2 = this.findExtraFieldUnicodePath();
            if (null !== t2) this.fileNameStr = t2;
            else {
              var r2 = s.transformTo(e2, this.fileName);
              this.fileNameStr = this.loadOptions.decodeFileName(r2);
            }
            var n2 = this.findExtraFieldUnicodeComment();
            if (null !== n2) this.fileCommentStr = n2;
            else {
              var i2 = s.transformTo(e2, this.fileComment);
              this.fileCommentStr = this.loadOptions.decodeFileName(i2);
            }
          }
        }, findExtraFieldUnicodePath: function() {
          var e2 = this.extraFields[28789];
          if (e2) {
            var t2 = n(e2.value);
            return 1 !== t2.readInt(1) ? null : a(this.fileName) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
          }
          return null;
        }, findExtraFieldUnicodeComment: function() {
          var e2 = this.extraFields[25461];
          if (e2) {
            var t2 = n(e2.value);
            return 1 !== t2.readInt(1) ? null : a(this.fileComment) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
          }
          return null;
        } }, t.exports = l;
      }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(e, t, r) {
        "use strict";
        function n(e2, t2, r2) {
          this.name = e2, this.dir = r2.dir, this.date = r2.date, this.comment = r2.comment, this.unixPermissions = r2.unixPermissions, this.dosPermissions = r2.dosPermissions, this._data = t2, this._dataBinary = r2.binary, this.options = { compression: r2.compression, compressionOptions: r2.compressionOptions };
        }
        var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h2 = e("./stream/GenericWorker");
        n.prototype = { internalStream: function(e2) {
          var t2 = null, r2 = "string";
          try {
            if (!e2) throw new Error("No output type specified.");
            var n2 = "string" === (r2 = e2.toLowerCase()) || "text" === r2;
            "binarystring" !== r2 && "text" !== r2 || (r2 = "string"), t2 = this._decompressWorker();
            var i2 = !this._dataBinary;
            i2 && !n2 && (t2 = t2.pipe(new a.Utf8EncodeWorker())), !i2 && n2 && (t2 = t2.pipe(new a.Utf8DecodeWorker()));
          } catch (e3) {
            (t2 = new h2("error")).error(e3);
          }
          return new s(t2, r2, "");
        }, async: function(e2, t2) {
          return this.internalStream(e2).accumulate(t2);
        }, nodeStream: function(e2, t2) {
          return this.internalStream(e2 || "nodebuffer").toNodejsStream(t2);
        }, _compressWorker: function(e2, t2) {
          if (this._data instanceof o && this._data.compression.magic === e2.magic) return this._data.getCompressedWorker();
          var r2 = this._decompressWorker();
          return this._dataBinary || (r2 = r2.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r2, e2, t2);
        }, _decompressWorker: function() {
          return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h2 ? this._data : new i(this._data);
        } };
        for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], l = function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
        t.exports = n;
      }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(e, l, t) {
        (function(t2) {
          "use strict";
          var r, n, e2 = t2.MutationObserver || t2.WebKitMutationObserver;
          if (e2) {
            var i = 0, s = new e2(u), a = t2.document.createTextNode("");
            s.observe(a, { characterData: true }), r = function() {
              a.data = i = ++i % 2;
            };
          } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = "document" in t2 && "onreadystatechange" in t2.document.createElement("script") ? function() {
            var e3 = t2.document.createElement("script");
            e3.onreadystatechange = function() {
              u(), e3.onreadystatechange = null, e3.parentNode.removeChild(e3), e3 = null;
            }, t2.document.documentElement.appendChild(e3);
          } : function() {
            setTimeout(u, 0);
          };
          else {
            var o = new t2.MessageChannel();
            o.port1.onmessage = u, r = function() {
              o.port2.postMessage(0);
            };
          }
          var h2 = [];
          function u() {
            var e3, t3;
            n = true;
            for (var r2 = h2.length; r2; ) {
              for (t3 = h2, h2 = [], e3 = -1; ++e3 < r2; ) t3[e3]();
              r2 = h2.length;
            }
            n = false;
          }
          l.exports = function(e3) {
            1 !== h2.push(e3) || n || r();
          };
        }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
      }, {}], 37: [function(e, t, r) {
        "use strict";
        var i = e("immediate");
        function u() {
        }
        var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
        function o(e2) {
          if ("function" != typeof e2) throw new TypeError("resolver must be a function");
          this.state = n, this.queue = [], this.outcome = void 0, e2 !== u && d(this, e2);
        }
        function h2(e2, t2, r2) {
          this.promise = e2, "function" == typeof t2 && (this.onFulfilled = t2, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r2 && (this.onRejected = r2, this.callRejected = this.otherCallRejected);
        }
        function f(t2, r2, n2) {
          i(function() {
            var e2;
            try {
              e2 = r2(n2);
            } catch (e3) {
              return l.reject(t2, e3);
            }
            e2 === t2 ? l.reject(t2, new TypeError("Cannot resolve promise with itself")) : l.resolve(t2, e2);
          });
        }
        function c(e2) {
          var t2 = e2 && e2.then;
          if (e2 && ("object" == typeof e2 || "function" == typeof e2) && "function" == typeof t2) return function() {
            t2.apply(e2, arguments);
          };
        }
        function d(t2, e2) {
          var r2 = false;
          function n2(e3) {
            r2 || (r2 = true, l.reject(t2, e3));
          }
          function i2(e3) {
            r2 || (r2 = true, l.resolve(t2, e3));
          }
          var s2 = p(function() {
            e2(i2, n2);
          });
          "error" === s2.status && n2(s2.value);
        }
        function p(e2, t2) {
          var r2 = {};
          try {
            r2.value = e2(t2), r2.status = "success";
          } catch (e3) {
            r2.status = "error", r2.value = e3;
          }
          return r2;
        }
        (t.exports = o).prototype.finally = function(t2) {
          if ("function" != typeof t2) return this;
          var r2 = this.constructor;
          return this.then(function(e2) {
            return r2.resolve(t2()).then(function() {
              return e2;
            });
          }, function(e2) {
            return r2.resolve(t2()).then(function() {
              throw e2;
            });
          });
        }, o.prototype.catch = function(e2) {
          return this.then(null, e2);
        }, o.prototype.then = function(e2, t2) {
          if ("function" != typeof e2 && this.state === a || "function" != typeof t2 && this.state === s) return this;
          var r2 = new this.constructor(u);
          this.state !== n ? f(r2, this.state === a ? e2 : t2, this.outcome) : this.queue.push(new h2(r2, e2, t2));
          return r2;
        }, h2.prototype.callFulfilled = function(e2) {
          l.resolve(this.promise, e2);
        }, h2.prototype.otherCallFulfilled = function(e2) {
          f(this.promise, this.onFulfilled, e2);
        }, h2.prototype.callRejected = function(e2) {
          l.reject(this.promise, e2);
        }, h2.prototype.otherCallRejected = function(e2) {
          f(this.promise, this.onRejected, e2);
        }, l.resolve = function(e2, t2) {
          var r2 = p(c, t2);
          if ("error" === r2.status) return l.reject(e2, r2.value);
          var n2 = r2.value;
          if (n2) d(e2, n2);
          else {
            e2.state = a, e2.outcome = t2;
            for (var i2 = -1, s2 = e2.queue.length; ++i2 < s2; ) e2.queue[i2].callFulfilled(t2);
          }
          return e2;
        }, l.reject = function(e2, t2) {
          e2.state = s, e2.outcome = t2;
          for (var r2 = -1, n2 = e2.queue.length; ++r2 < n2; ) e2.queue[r2].callRejected(t2);
          return e2;
        }, o.resolve = function(e2) {
          if (e2 instanceof this) return e2;
          return l.resolve(new this(u), e2);
        }, o.reject = function(e2) {
          var t2 = new this(u);
          return l.reject(t2, e2);
        }, o.all = function(e2) {
          var r2 = this;
          if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
          var n2 = e2.length, i2 = false;
          if (!n2) return this.resolve([]);
          var s2 = new Array(n2), a2 = 0, t2 = -1, o2 = new this(u);
          for (; ++t2 < n2; ) h3(e2[t2], t2);
          return o2;
          function h3(e3, t3) {
            r2.resolve(e3).then(function(e4) {
              s2[t3] = e4, ++a2 !== n2 || i2 || (i2 = true, l.resolve(o2, s2));
            }, function(e4) {
              i2 || (i2 = true, l.reject(o2, e4));
            });
          }
        }, o.race = function(e2) {
          var t2 = this;
          if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
          var r2 = e2.length, n2 = false;
          if (!r2) return this.resolve([]);
          var i2 = -1, s2 = new this(u);
          for (; ++i2 < r2; ) a2 = e2[i2], t2.resolve(a2).then(function(e3) {
            n2 || (n2 = true, l.resolve(s2, e3));
          }, function(e3) {
            n2 || (n2 = true, l.reject(s2, e3));
          });
          var a2;
          return s2;
        };
      }, { immediate: 36 }], 38: [function(e, t, r) {
        "use strict";
        var n = {};
        (0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
      }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(e, t, r) {
        "use strict";
        var a = e("./zlib/deflate"), o = e("./utils/common"), h2 = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
        function p(e2) {
          if (!(this instanceof p)) return new p(e2);
          this.options = o.assign({ level: f, method: d, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, e2 || {});
          var t2 = this.options;
          t2.raw && 0 < t2.windowBits ? t2.windowBits = -t2.windowBits : t2.gzip && 0 < t2.windowBits && t2.windowBits < 16 && (t2.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
          var r2 = a.deflateInit2(this.strm, t2.level, t2.method, t2.windowBits, t2.memLevel, t2.strategy);
          if (r2 !== l) throw new Error(i[r2]);
          if (t2.header && a.deflateSetHeader(this.strm, t2.header), t2.dictionary) {
            var n2;
            if (n2 = "string" == typeof t2.dictionary ? h2.string2buf(t2.dictionary) : "[object ArrayBuffer]" === u.call(t2.dictionary) ? new Uint8Array(t2.dictionary) : t2.dictionary, (r2 = a.deflateSetDictionary(this.strm, n2)) !== l) throw new Error(i[r2]);
            this._dict_set = true;
          }
        }
        function n(e2, t2) {
          var r2 = new p(t2);
          if (r2.push(e2, true), r2.err) throw r2.msg || i[r2.err];
          return r2.result;
        }
        p.prototype.push = function(e2, t2) {
          var r2, n2, i2 = this.strm, s2 = this.options.chunkSize;
          if (this.ended) return false;
          n2 = t2 === ~~t2 ? t2 : true === t2 ? 4 : 0, "string" == typeof e2 ? i2.input = h2.string2buf(e2) : "[object ArrayBuffer]" === u.call(e2) ? i2.input = new Uint8Array(e2) : i2.input = e2, i2.next_in = 0, i2.avail_in = i2.input.length;
          do {
            if (0 === i2.avail_out && (i2.output = new o.Buf8(s2), i2.next_out = 0, i2.avail_out = s2), 1 !== (r2 = a.deflate(i2, n2)) && r2 !== l) return this.onEnd(r2), !(this.ended = true);
            0 !== i2.avail_out && (0 !== i2.avail_in || 4 !== n2 && 2 !== n2) || ("string" === this.options.to ? this.onData(h2.buf2binstring(o.shrinkBuf(i2.output, i2.next_out))) : this.onData(o.shrinkBuf(i2.output, i2.next_out)));
          } while ((0 < i2.avail_in || 0 === i2.avail_out) && 1 !== r2);
          return 4 === n2 ? (r2 = a.deflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === l) : 2 !== n2 || (this.onEnd(l), !(i2.avail_out = 0));
        }, p.prototype.onData = function(e2) {
          this.chunks.push(e2);
        }, p.prototype.onEnd = function(e2) {
          e2 === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
        }, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e2, t2) {
          return (t2 = t2 || {}).raw = true, n(e2, t2);
        }, r.gzip = function(e2, t2) {
          return (t2 = t2 || {}).gzip = true, n(e2, t2);
        };
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(e, t, r) {
        "use strict";
        var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
        function a(e2) {
          if (!(this instanceof a)) return new a(e2);
          this.options = d.assign({ chunkSize: 16384, windowBits: 0, to: "" }, e2 || {});
          var t2 = this.options;
          t2.raw && 0 <= t2.windowBits && t2.windowBits < 16 && (t2.windowBits = -t2.windowBits, 0 === t2.windowBits && (t2.windowBits = -15)), !(0 <= t2.windowBits && t2.windowBits < 16) || e2 && e2.windowBits || (t2.windowBits += 32), 15 < t2.windowBits && t2.windowBits < 48 && 0 == (15 & t2.windowBits) && (t2.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
          var r2 = c.inflateInit2(this.strm, t2.windowBits);
          if (r2 !== m.Z_OK) throw new Error(n[r2]);
          this.header = new s(), c.inflateGetHeader(this.strm, this.header);
        }
        function o(e2, t2) {
          var r2 = new a(t2);
          if (r2.push(e2, true), r2.err) throw r2.msg || n[r2.err];
          return r2.result;
        }
        a.prototype.push = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h2 = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = false;
          if (this.ended) return false;
          n2 = t2 === ~~t2 ? t2 : true === t2 ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e2 ? h2.input = p.binstring2buf(e2) : "[object ArrayBuffer]" === _.call(e2) ? h2.input = new Uint8Array(e2) : h2.input = e2, h2.next_in = 0, h2.avail_in = h2.input.length;
          do {
            if (0 === h2.avail_out && (h2.output = new d.Buf8(u), h2.next_out = 0, h2.avail_out = u), (r2 = c.inflate(h2, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o2 = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r2 = c.inflateSetDictionary(this.strm, o2)), r2 === m.Z_BUF_ERROR && true === f && (r2 = m.Z_OK, f = false), r2 !== m.Z_STREAM_END && r2 !== m.Z_OK) return this.onEnd(r2), !(this.ended = true);
            h2.next_out && (0 !== h2.avail_out && r2 !== m.Z_STREAM_END && (0 !== h2.avail_in || n2 !== m.Z_FINISH && n2 !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i2 = p.utf8border(h2.output, h2.next_out), s2 = h2.next_out - i2, a2 = p.buf2string(h2.output, i2), h2.next_out = s2, h2.avail_out = u - s2, s2 && d.arraySet(h2.output, h2.output, i2, s2, 0), this.onData(a2)) : this.onData(d.shrinkBuf(h2.output, h2.next_out)))), 0 === h2.avail_in && 0 === h2.avail_out && (f = true);
          } while ((0 < h2.avail_in || 0 === h2.avail_out) && r2 !== m.Z_STREAM_END);
          return r2 === m.Z_STREAM_END && (n2 = m.Z_FINISH), n2 === m.Z_FINISH ? (r2 = c.inflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === m.Z_OK) : n2 !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h2.avail_out = 0));
        }, a.prototype.onData = function(e2) {
          this.chunks.push(e2);
        }, a.prototype.onEnd = function(e2) {
          e2 === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
        }, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e2, t2) {
          return (t2 = t2 || {}).raw = true, o(e2, t2);
        }, r.ungzip = o;
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(e, t, r) {
        "use strict";
        var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
        r.assign = function(e2) {
          for (var t2 = Array.prototype.slice.call(arguments, 1); t2.length; ) {
            var r2 = t2.shift();
            if (r2) {
              if ("object" != typeof r2) throw new TypeError(r2 + "must be non-object");
              for (var n2 in r2) r2.hasOwnProperty(n2) && (e2[n2] = r2[n2]);
            }
          }
          return e2;
        }, r.shrinkBuf = function(e2, t2) {
          return e2.length === t2 ? e2 : e2.subarray ? e2.subarray(0, t2) : (e2.length = t2, e2);
        };
        var i = { arraySet: function(e2, t2, r2, n2, i2) {
          if (t2.subarray && e2.subarray) e2.set(t2.subarray(r2, r2 + n2), i2);
          else for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
        }, flattenChunks: function(e2) {
          var t2, r2, n2, i2, s2, a;
          for (t2 = n2 = 0, r2 = e2.length; t2 < r2; t2++) n2 += e2[t2].length;
          for (a = new Uint8Array(n2), t2 = i2 = 0, r2 = e2.length; t2 < r2; t2++) s2 = e2[t2], a.set(s2, i2), i2 += s2.length;
          return a;
        } }, s = { arraySet: function(e2, t2, r2, n2, i2) {
          for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
        }, flattenChunks: function(e2) {
          return [].concat.apply([], e2);
        } };
        r.setTyped = function(e2) {
          e2 ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
        }, r.setTyped(n);
      }, {}], 42: [function(e, t, r) {
        "use strict";
        var h2 = e("./common"), i = true, s = true;
        try {
          String.fromCharCode.apply(null, [0]);
        } catch (e2) {
          i = false;
        }
        try {
          String.fromCharCode.apply(null, new Uint8Array(1));
        } catch (e2) {
          s = false;
        }
        for (var u = new h2.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
        function l(e2, t2) {
          if (t2 < 65537 && (e2.subarray && s || !e2.subarray && i)) return String.fromCharCode.apply(null, h2.shrinkBuf(e2, t2));
          for (var r2 = "", n2 = 0; n2 < t2; n2++) r2 += String.fromCharCode(e2[n2]);
          return r2;
        }
        u[254] = u[254] = 1, r.string2buf = function(e2) {
          var t2, r2, n2, i2, s2, a = e2.length, o = 0;
          for (i2 = 0; i2 < a; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
          for (t2 = new h2.Buf8(o), i2 = s2 = 0; s2 < o; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
          return t2;
        }, r.buf2binstring = function(e2) {
          return l(e2, e2.length);
        }, r.binstring2buf = function(e2) {
          for (var t2 = new h2.Buf8(e2.length), r2 = 0, n2 = t2.length; r2 < n2; r2++) t2[r2] = e2.charCodeAt(r2);
          return t2;
        }, r.buf2string = function(e2, t2) {
          var r2, n2, i2, s2, a = t2 || e2.length, o = new Array(2 * a);
          for (r2 = n2 = 0; r2 < a; ) if ((i2 = e2[r2++]) < 128) o[n2++] = i2;
          else if (4 < (s2 = u[i2])) o[n2++] = 65533, r2 += s2 - 1;
          else {
            for (i2 &= 2 === s2 ? 31 : 3 === s2 ? 15 : 7; 1 < s2 && r2 < a; ) i2 = i2 << 6 | 63 & e2[r2++], s2--;
            1 < s2 ? o[n2++] = 65533 : i2 < 65536 ? o[n2++] = i2 : (i2 -= 65536, o[n2++] = 55296 | i2 >> 10 & 1023, o[n2++] = 56320 | 1023 & i2);
          }
          return l(o, n2);
        }, r.utf8border = function(e2, t2) {
          var r2;
          for ((t2 = t2 || e2.length) > e2.length && (t2 = e2.length), r2 = t2 - 1; 0 <= r2 && 128 == (192 & e2[r2]); ) r2--;
          return r2 < 0 ? t2 : 0 === r2 ? t2 : r2 + u[e2[r2]] > t2 ? r2 : t2;
        };
      }, { "./common": 41 }], 43: [function(e, t, r) {
        "use strict";
        t.exports = function(e2, t2, r2, n) {
          for (var i = 65535 & e2 | 0, s = e2 >>> 16 & 65535 | 0, a = 0; 0 !== r2; ) {
            for (r2 -= a = 2e3 < r2 ? 2e3 : r2; s = s + (i = i + t2[n++] | 0) | 0, --a; ) ;
            i %= 65521, s %= 65521;
          }
          return i | s << 16 | 0;
        };
      }, {}], 44: [function(e, t, r) {
        "use strict";
        t.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
      }, {}], 45: [function(e, t, r) {
        "use strict";
        var o = (function() {
          for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
            e2 = r2;
            for (var n = 0; n < 8; n++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
            t2[r2] = e2;
          }
          return t2;
        })();
        t.exports = function(e2, t2, r2, n) {
          var i = o, s = n + r2;
          e2 ^= -1;
          for (var a = n; a < s; a++) e2 = e2 >>> 8 ^ i[255 & (e2 ^ t2[a])];
          return -1 ^ e2;
        };
      }, {}], 46: [function(e, t, r) {
        "use strict";
        var h2, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
        function R(e2, t2) {
          return e2.msg = n[t2], t2;
        }
        function T(e2) {
          return (e2 << 1) - (4 < e2 ? 9 : 0);
        }
        function D(e2) {
          for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
        }
        function F(e2) {
          var t2 = e2.state, r2 = t2.pending;
          r2 > e2.avail_out && (r2 = e2.avail_out), 0 !== r2 && (c.arraySet(e2.output, t2.pending_buf, t2.pending_out, r2, e2.next_out), e2.next_out += r2, t2.pending_out += r2, e2.total_out += r2, e2.avail_out -= r2, t2.pending -= r2, 0 === t2.pending && (t2.pending_out = 0));
        }
        function N(e2, t2) {
          u._tr_flush_block(e2, 0 <= e2.block_start ? e2.block_start : -1, e2.strstart - e2.block_start, t2), e2.block_start = e2.strstart, F(e2.strm);
        }
        function U(e2, t2) {
          e2.pending_buf[e2.pending++] = t2;
        }
        function P(e2, t2) {
          e2.pending_buf[e2.pending++] = t2 >>> 8 & 255, e2.pending_buf[e2.pending++] = 255 & t2;
        }
        function L(e2, t2) {
          var r2, n2, i2 = e2.max_chain_length, s2 = e2.strstart, a2 = e2.prev_length, o2 = e2.nice_match, h3 = e2.strstart > e2.w_size - z ? e2.strstart - (e2.w_size - z) : 0, u2 = e2.window, l2 = e2.w_mask, f2 = e2.prev, c2 = e2.strstart + S, d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
          e2.prev_length >= e2.good_match && (i2 >>= 2), o2 > e2.lookahead && (o2 = e2.lookahead);
          do {
            if (u2[(r2 = t2) + a2] === p2 && u2[r2 + a2 - 1] === d2 && u2[r2] === u2[s2] && u2[++r2] === u2[s2 + 1]) {
              s2 += 2, r2++;
              do {
              } while (u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && s2 < c2);
              if (n2 = S - (c2 - s2), s2 = c2 - S, a2 < n2) {
                if (e2.match_start = t2, o2 <= (a2 = n2)) break;
                d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
              }
            }
          } while ((t2 = f2[t2 & l2]) > h3 && 0 != --i2);
          return a2 <= e2.lookahead ? a2 : e2.lookahead;
        }
        function j(e2) {
          var t2, r2, n2, i2, s2, a2, o2, h3, u2, l2, f2 = e2.w_size;
          do {
            if (i2 = e2.window_size - e2.lookahead - e2.strstart, e2.strstart >= f2 + (f2 - z)) {
              for (c.arraySet(e2.window, e2.window, f2, f2, 0), e2.match_start -= f2, e2.strstart -= f2, e2.block_start -= f2, t2 = r2 = e2.hash_size; n2 = e2.head[--t2], e2.head[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
              for (t2 = r2 = f2; n2 = e2.prev[--t2], e2.prev[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
              i2 += f2;
            }
            if (0 === e2.strm.avail_in) break;
            if (a2 = e2.strm, o2 = e2.window, h3 = e2.strstart + e2.lookahead, u2 = i2, l2 = void 0, l2 = a2.avail_in, u2 < l2 && (l2 = u2), r2 = 0 === l2 ? 0 : (a2.avail_in -= l2, c.arraySet(o2, a2.input, a2.next_in, l2, h3), 1 === a2.state.wrap ? a2.adler = d(a2.adler, o2, l2, h3) : 2 === a2.state.wrap && (a2.adler = p(a2.adler, o2, l2, h3)), a2.next_in += l2, a2.total_in += l2, l2), e2.lookahead += r2, e2.lookahead + e2.insert >= x) for (s2 = e2.strstart - e2.insert, e2.ins_h = e2.window[s2], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + 1]) & e2.hash_mask; e2.insert && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + x - 1]) & e2.hash_mask, e2.prev[s2 & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = s2, s2++, e2.insert--, !(e2.lookahead + e2.insert < x)); ) ;
          } while (e2.lookahead < z && 0 !== e2.strm.avail_in);
        }
        function Z(e2, t2) {
          for (var r2, n2; ; ) {
            if (e2.lookahead < z) {
              if (j(e2), e2.lookahead < z && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 !== r2 && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2)), e2.match_length >= x) if (n2 = u._tr_tally(e2, e2.strstart - e2.match_start, e2.match_length - x), e2.lookahead -= e2.match_length, e2.match_length <= e2.max_lazy_match && e2.lookahead >= x) {
              for (e2.match_length--; e2.strstart++, e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart, 0 != --e2.match_length; ) ;
              e2.strstart++;
            } else e2.strstart += e2.match_length, e2.match_length = 0, e2.ins_h = e2.window[e2.strstart], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + 1]) & e2.hash_mask;
            else n2 = u._tr_tally(e2, 0, e2.window[e2.strstart]), e2.lookahead--, e2.strstart++;
            if (n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
          }
          return e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
        }
        function W(e2, t2) {
          for (var r2, n2, i2; ; ) {
            if (e2.lookahead < z) {
              if (j(e2), e2.lookahead < z && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), e2.prev_length = e2.match_length, e2.prev_match = e2.match_start, e2.match_length = x - 1, 0 !== r2 && e2.prev_length < e2.max_lazy_match && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2), e2.match_length <= 5 && (1 === e2.strategy || e2.match_length === x && 4096 < e2.strstart - e2.match_start) && (e2.match_length = x - 1)), e2.prev_length >= x && e2.match_length <= e2.prev_length) {
              for (i2 = e2.strstart + e2.lookahead - x, n2 = u._tr_tally(e2, e2.strstart - 1 - e2.prev_match, e2.prev_length - x), e2.lookahead -= e2.prev_length - 1, e2.prev_length -= 2; ++e2.strstart <= i2 && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 != --e2.prev_length; ) ;
              if (e2.match_available = 0, e2.match_length = x - 1, e2.strstart++, n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            } else if (e2.match_available) {
              if ((n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1])) && N(e2, false), e2.strstart++, e2.lookahead--, 0 === e2.strm.avail_out) return A;
            } else e2.match_available = 1, e2.strstart++, e2.lookahead--;
          }
          return e2.match_available && (n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1]), e2.match_available = 0), e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
        }
        function M(e2, t2, r2, n2, i2) {
          this.good_length = e2, this.max_lazy = t2, this.nice_length = r2, this.max_chain = n2, this.func = i2;
        }
        function H() {
          this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
        }
        function G(e2) {
          var t2;
          return e2 && e2.state ? (e2.total_in = e2.total_out = 0, e2.data_type = i, (t2 = e2.state).pending = 0, t2.pending_out = 0, t2.wrap < 0 && (t2.wrap = -t2.wrap), t2.status = t2.wrap ? C : E, e2.adler = 2 === t2.wrap ? 0 : 1, t2.last_flush = l, u._tr_init(t2), m) : R(e2, _);
        }
        function K(e2) {
          var t2 = G(e2);
          return t2 === m && (function(e3) {
            e3.window_size = 2 * e3.w_size, D(e3.head), e3.max_lazy_match = h2[e3.level].max_lazy, e3.good_match = h2[e3.level].good_length, e3.nice_match = h2[e3.level].nice_length, e3.max_chain_length = h2[e3.level].max_chain, e3.strstart = 0, e3.block_start = 0, e3.lookahead = 0, e3.insert = 0, e3.match_length = e3.prev_length = x - 1, e3.match_available = 0, e3.ins_h = 0;
          })(e2.state), t2;
        }
        function Y(e2, t2, r2, n2, i2, s2) {
          if (!e2) return _;
          var a2 = 1;
          if (t2 === g && (t2 = 6), n2 < 0 ? (a2 = 0, n2 = -n2) : 15 < n2 && (a2 = 2, n2 -= 16), i2 < 1 || y < i2 || r2 !== v || n2 < 8 || 15 < n2 || t2 < 0 || 9 < t2 || s2 < 0 || b < s2) return R(e2, _);
          8 === n2 && (n2 = 9);
          var o2 = new H();
          return (e2.state = o2).strm = e2, o2.wrap = a2, o2.gzhead = null, o2.w_bits = n2, o2.w_size = 1 << o2.w_bits, o2.w_mask = o2.w_size - 1, o2.hash_bits = i2 + 7, o2.hash_size = 1 << o2.hash_bits, o2.hash_mask = o2.hash_size - 1, o2.hash_shift = ~~((o2.hash_bits + x - 1) / x), o2.window = new c.Buf8(2 * o2.w_size), o2.head = new c.Buf16(o2.hash_size), o2.prev = new c.Buf16(o2.w_size), o2.lit_bufsize = 1 << i2 + 6, o2.pending_buf_size = 4 * o2.lit_bufsize, o2.pending_buf = new c.Buf8(o2.pending_buf_size), o2.d_buf = 1 * o2.lit_bufsize, o2.l_buf = 3 * o2.lit_bufsize, o2.level = t2, o2.strategy = s2, o2.method = r2, K(e2);
        }
        h2 = [new M(0, 0, 0, 0, function(e2, t2) {
          var r2 = 65535;
          for (r2 > e2.pending_buf_size - 5 && (r2 = e2.pending_buf_size - 5); ; ) {
            if (e2.lookahead <= 1) {
              if (j(e2), 0 === e2.lookahead && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            e2.strstart += e2.lookahead, e2.lookahead = 0;
            var n2 = e2.block_start + r2;
            if ((0 === e2.strstart || e2.strstart >= n2) && (e2.lookahead = e2.strstart - n2, e2.strstart = n2, N(e2, false), 0 === e2.strm.avail_out)) return A;
            if (e2.strstart - e2.block_start >= e2.w_size - z && (N(e2, false), 0 === e2.strm.avail_out)) return A;
          }
          return e2.insert = 0, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : (e2.strstart > e2.block_start && (N(e2, false), e2.strm.avail_out), A);
        }), new M(4, 4, 8, 4, Z), new M(4, 5, 16, 8, Z), new M(4, 6, 32, 32, Z), new M(4, 4, 16, 16, W), new M(8, 16, 32, 32, W), new M(8, 16, 128, 128, W), new M(8, 32, 128, 256, W), new M(32, 128, 258, 1024, W), new M(32, 258, 258, 4096, W)], r.deflateInit = function(e2, t2) {
          return Y(e2, t2, v, 15, 8, 0);
        }, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e2, t2) {
          return e2 && e2.state ? 2 !== e2.state.wrap ? _ : (e2.state.gzhead = t2, m) : _;
        }, r.deflate = function(e2, t2) {
          var r2, n2, i2, s2;
          if (!e2 || !e2.state || 5 < t2 || t2 < 0) return e2 ? R(e2, _) : _;
          if (n2 = e2.state, !e2.output || !e2.input && 0 !== e2.avail_in || 666 === n2.status && t2 !== f) return R(e2, 0 === e2.avail_out ? -5 : _);
          if (n2.strm = e2, r2 = n2.last_flush, n2.last_flush = t2, n2.status === C) if (2 === n2.wrap) e2.adler = 0, U(n2, 31), U(n2, 139), U(n2, 8), n2.gzhead ? (U(n2, (n2.gzhead.text ? 1 : 0) + (n2.gzhead.hcrc ? 2 : 0) + (n2.gzhead.extra ? 4 : 0) + (n2.gzhead.name ? 8 : 0) + (n2.gzhead.comment ? 16 : 0)), U(n2, 255 & n2.gzhead.time), U(n2, n2.gzhead.time >> 8 & 255), U(n2, n2.gzhead.time >> 16 & 255), U(n2, n2.gzhead.time >> 24 & 255), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 255 & n2.gzhead.os), n2.gzhead.extra && n2.gzhead.extra.length && (U(n2, 255 & n2.gzhead.extra.length), U(n2, n2.gzhead.extra.length >> 8 & 255)), n2.gzhead.hcrc && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending, 0)), n2.gzindex = 0, n2.status = 69) : (U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 3), n2.status = E);
          else {
            var a2 = v + (n2.w_bits - 8 << 4) << 8;
            a2 |= (2 <= n2.strategy || n2.level < 2 ? 0 : n2.level < 6 ? 1 : 6 === n2.level ? 2 : 3) << 6, 0 !== n2.strstart && (a2 |= 32), a2 += 31 - a2 % 31, n2.status = E, P(n2, a2), 0 !== n2.strstart && (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), e2.adler = 1;
          }
          if (69 === n2.status) if (n2.gzhead.extra) {
            for (i2 = n2.pending; n2.gzindex < (65535 & n2.gzhead.extra.length) && (n2.pending !== n2.pending_buf_size || (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending !== n2.pending_buf_size)); ) U(n2, 255 & n2.gzhead.extra[n2.gzindex]), n2.gzindex++;
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), n2.gzindex === n2.gzhead.extra.length && (n2.gzindex = 0, n2.status = 73);
          } else n2.status = 73;
          if (73 === n2.status) if (n2.gzhead.name) {
            i2 = n2.pending;
            do {
              if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                s2 = 1;
                break;
              }
              s2 = n2.gzindex < n2.gzhead.name.length ? 255 & n2.gzhead.name.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
            } while (0 !== s2);
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.gzindex = 0, n2.status = 91);
          } else n2.status = 91;
          if (91 === n2.status) if (n2.gzhead.comment) {
            i2 = n2.pending;
            do {
              if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                s2 = 1;
                break;
              }
              s2 = n2.gzindex < n2.gzhead.comment.length ? 255 & n2.gzhead.comment.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
            } while (0 !== s2);
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.status = 103);
          } else n2.status = 103;
          if (103 === n2.status && (n2.gzhead.hcrc ? (n2.pending + 2 > n2.pending_buf_size && F(e2), n2.pending + 2 <= n2.pending_buf_size && (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), e2.adler = 0, n2.status = E)) : n2.status = E), 0 !== n2.pending) {
            if (F(e2), 0 === e2.avail_out) return n2.last_flush = -1, m;
          } else if (0 === e2.avail_in && T(t2) <= T(r2) && t2 !== f) return R(e2, -5);
          if (666 === n2.status && 0 !== e2.avail_in) return R(e2, -5);
          if (0 !== e2.avail_in || 0 !== n2.lookahead || t2 !== l && 666 !== n2.status) {
            var o2 = 2 === n2.strategy ? (function(e3, t3) {
              for (var r3; ; ) {
                if (0 === e3.lookahead && (j(e3), 0 === e3.lookahead)) {
                  if (t3 === l) return A;
                  break;
                }
                if (e3.match_length = 0, r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++, r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
              }
              return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
            })(n2, t2) : 3 === n2.strategy ? (function(e3, t3) {
              for (var r3, n3, i3, s3, a3 = e3.window; ; ) {
                if (e3.lookahead <= S) {
                  if (j(e3), e3.lookahead <= S && t3 === l) return A;
                  if (0 === e3.lookahead) break;
                }
                if (e3.match_length = 0, e3.lookahead >= x && 0 < e3.strstart && (n3 = a3[i3 = e3.strstart - 1]) === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3]) {
                  s3 = e3.strstart + S;
                  do {
                  } while (n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && i3 < s3);
                  e3.match_length = S - (s3 - i3), e3.match_length > e3.lookahead && (e3.match_length = e3.lookahead);
                }
                if (e3.match_length >= x ? (r3 = u._tr_tally(e3, 1, e3.match_length - x), e3.lookahead -= e3.match_length, e3.strstart += e3.match_length, e3.match_length = 0) : (r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++), r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
              }
              return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
            })(n2, t2) : h2[n2.level].func(n2, t2);
            if (o2 !== O && o2 !== B || (n2.status = 666), o2 === A || o2 === O) return 0 === e2.avail_out && (n2.last_flush = -1), m;
            if (o2 === I && (1 === t2 ? u._tr_align(n2) : 5 !== t2 && (u._tr_stored_block(n2, 0, 0, false), 3 === t2 && (D(n2.head), 0 === n2.lookahead && (n2.strstart = 0, n2.block_start = 0, n2.insert = 0))), F(e2), 0 === e2.avail_out)) return n2.last_flush = -1, m;
          }
          return t2 !== f ? m : n2.wrap <= 0 ? 1 : (2 === n2.wrap ? (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), U(n2, e2.adler >> 16 & 255), U(n2, e2.adler >> 24 & 255), U(n2, 255 & e2.total_in), U(n2, e2.total_in >> 8 & 255), U(n2, e2.total_in >> 16 & 255), U(n2, e2.total_in >> 24 & 255)) : (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), F(e2), 0 < n2.wrap && (n2.wrap = -n2.wrap), 0 !== n2.pending ? m : 1);
        }, r.deflateEnd = function(e2) {
          var t2;
          return e2 && e2.state ? (t2 = e2.state.status) !== C && 69 !== t2 && 73 !== t2 && 91 !== t2 && 103 !== t2 && t2 !== E && 666 !== t2 ? R(e2, _) : (e2.state = null, t2 === E ? R(e2, -3) : m) : _;
        }, r.deflateSetDictionary = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h3, u2, l2 = t2.length;
          if (!e2 || !e2.state) return _;
          if (2 === (s2 = (r2 = e2.state).wrap) || 1 === s2 && r2.status !== C || r2.lookahead) return _;
          for (1 === s2 && (e2.adler = d(e2.adler, t2, l2, 0)), r2.wrap = 0, l2 >= r2.w_size && (0 === s2 && (D(r2.head), r2.strstart = 0, r2.block_start = 0, r2.insert = 0), u2 = new c.Buf8(r2.w_size), c.arraySet(u2, t2, l2 - r2.w_size, r2.w_size, 0), t2 = u2, l2 = r2.w_size), a2 = e2.avail_in, o2 = e2.next_in, h3 = e2.input, e2.avail_in = l2, e2.next_in = 0, e2.input = t2, j(r2); r2.lookahead >= x; ) {
            for (n2 = r2.strstart, i2 = r2.lookahead - (x - 1); r2.ins_h = (r2.ins_h << r2.hash_shift ^ r2.window[n2 + x - 1]) & r2.hash_mask, r2.prev[n2 & r2.w_mask] = r2.head[r2.ins_h], r2.head[r2.ins_h] = n2, n2++, --i2; ) ;
            r2.strstart = n2, r2.lookahead = x - 1, j(r2);
          }
          return r2.strstart += r2.lookahead, r2.block_start = r2.strstart, r2.insert = r2.lookahead, r2.lookahead = 0, r2.match_length = r2.prev_length = x - 1, r2.match_available = 0, e2.next_in = o2, e2.input = h3, e2.avail_in = a2, r2.wrap = s2, m;
        }, r.deflateInfo = "pako deflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(e, t, r) {
        "use strict";
        t.exports = function() {
          this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
        };
      }, {}], 48: [function(e, t, r) {
        "use strict";
        t.exports = function(e2, t2) {
          var r2, n, i, s, a, o, h2, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C;
          r2 = e2.state, n = e2.next_in, z = e2.input, i = n + (e2.avail_in - 5), s = e2.next_out, C = e2.output, a = s - (t2 - e2.avail_out), o = s + (e2.avail_out - 257), h2 = r2.dmax, u = r2.wsize, l = r2.whave, f = r2.wnext, c = r2.window, d = r2.hold, p = r2.bits, m = r2.lencode, _ = r2.distcode, g = (1 << r2.lenbits) - 1, b = (1 << r2.distbits) - 1;
          e: do {
            p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
            t: for (; ; ) {
              if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
              else {
                if (!(16 & y)) {
                  if (0 == (64 & y)) {
                    v = m[(65535 & v) + (d & (1 << y) - 1)];
                    continue t;
                  }
                  if (32 & y) {
                    r2.mode = 12;
                    break e;
                  }
                  e2.msg = "invalid literal/length code", r2.mode = 30;
                  break e;
                }
                w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
                r: for (; ; ) {
                  if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
                    if (0 == (64 & y)) {
                      v = _[(65535 & v) + (d & (1 << y) - 1)];
                      continue r;
                    }
                    e2.msg = "invalid distance code", r2.mode = 30;
                    break e;
                  }
                  if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h2 < (k += d & (1 << y) - 1)) {
                    e2.msg = "invalid distance too far back", r2.mode = 30;
                    break e;
                  }
                  if (d >>>= y, p -= y, (y = s - a) < k) {
                    if (l < (y = k - y) && r2.sane) {
                      e2.msg = "invalid distance too far back", r2.mode = 30;
                      break e;
                    }
                    if (S = c, (x = 0) === f) {
                      if (x += u - y, y < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        x = s - k, S = C;
                      }
                    } else if (f < y) {
                      if (x += u + f - y, (y -= f) < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        if (x = 0, f < w) {
                          for (w -= y = f; C[s++] = c[x++], --y; ) ;
                          x = s - k, S = C;
                        }
                      }
                    } else if (x += f - y, y < w) {
                      for (w -= y; C[s++] = c[x++], --y; ) ;
                      x = s - k, S = C;
                    }
                    for (; 2 < w; ) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
                    w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
                  } else {
                    for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3); ) ;
                    w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
                  }
                  break;
                }
              }
              break;
            }
          } while (n < i && s < o);
          n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e2.next_in = n, e2.next_out = s, e2.avail_in = n < i ? i - n + 5 : 5 - (n - i), e2.avail_out = s < o ? o - s + 257 : 257 - (s - o), r2.hold = d, r2.bits = p;
        };
      }, {}], 49: [function(e, t, r) {
        "use strict";
        var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
        function L(e2) {
          return (e2 >>> 24 & 255) + (e2 >>> 8 & 65280) + ((65280 & e2) << 8) + ((255 & e2) << 24);
        }
        function s() {
          this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
        }
        function a(e2) {
          var t2;
          return e2 && e2.state ? (t2 = e2.state, e2.total_in = e2.total_out = t2.total = 0, e2.msg = "", t2.wrap && (e2.adler = 1 & t2.wrap), t2.mode = P, t2.last = 0, t2.havedict = 0, t2.dmax = 32768, t2.head = null, t2.hold = 0, t2.bits = 0, t2.lencode = t2.lendyn = new I.Buf32(n), t2.distcode = t2.distdyn = new I.Buf32(i), t2.sane = 1, t2.back = -1, N) : U;
        }
        function o(e2) {
          var t2;
          return e2 && e2.state ? ((t2 = e2.state).wsize = 0, t2.whave = 0, t2.wnext = 0, a(e2)) : U;
        }
        function h2(e2, t2) {
          var r2, n2;
          return e2 && e2.state ? (n2 = e2.state, t2 < 0 ? (r2 = 0, t2 = -t2) : (r2 = 1 + (t2 >> 4), t2 < 48 && (t2 &= 15)), t2 && (t2 < 8 || 15 < t2) ? U : (null !== n2.window && n2.wbits !== t2 && (n2.window = null), n2.wrap = r2, n2.wbits = t2, o(e2))) : U;
        }
        function u(e2, t2) {
          var r2, n2;
          return e2 ? (n2 = new s(), (e2.state = n2).window = null, (r2 = h2(e2, t2)) !== N && (e2.state = null), r2) : U;
        }
        var l, f, c = true;
        function j(e2) {
          if (c) {
            var t2;
            for (l = new I.Buf32(512), f = new I.Buf32(32), t2 = 0; t2 < 144; ) e2.lens[t2++] = 8;
            for (; t2 < 256; ) e2.lens[t2++] = 9;
            for (; t2 < 280; ) e2.lens[t2++] = 7;
            for (; t2 < 288; ) e2.lens[t2++] = 8;
            for (T(D, e2.lens, 0, 288, l, 0, e2.work, { bits: 9 }), t2 = 0; t2 < 32; ) e2.lens[t2++] = 5;
            T(F, e2.lens, 0, 32, f, 0, e2.work, { bits: 5 }), c = false;
          }
          e2.lencode = l, e2.lenbits = 9, e2.distcode = f, e2.distbits = 5;
        }
        function Z(e2, t2, r2, n2) {
          var i2, s2 = e2.state;
          return null === s2.window && (s2.wsize = 1 << s2.wbits, s2.wnext = 0, s2.whave = 0, s2.window = new I.Buf8(s2.wsize)), n2 >= s2.wsize ? (I.arraySet(s2.window, t2, r2 - s2.wsize, s2.wsize, 0), s2.wnext = 0, s2.whave = s2.wsize) : (n2 < (i2 = s2.wsize - s2.wnext) && (i2 = n2), I.arraySet(s2.window, t2, r2 - n2, i2, s2.wnext), (n2 -= i2) ? (I.arraySet(s2.window, t2, r2 - n2, n2, 0), s2.wnext = n2, s2.whave = s2.wsize) : (s2.wnext += i2, s2.wnext === s2.wsize && (s2.wnext = 0), s2.whave < s2.wsize && (s2.whave += i2))), 0;
        }
        r.inflateReset = o, r.inflateReset2 = h2, r.inflateResetKeep = a, r.inflateInit = function(e2) {
          return u(e2, 15);
        }, r.inflateInit2 = u, r.inflate = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h3, u2, l2, f2, c2, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
          if (!e2 || !e2.state || !e2.output || !e2.input && 0 !== e2.avail_in) return U;
          12 === (r2 = e2.state).mode && (r2.mode = 13), a2 = e2.next_out, i2 = e2.output, h3 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, f2 = o2, c2 = h3, x = N;
          e: for (; ; ) switch (r2.mode) {
            case P:
              if (0 === r2.wrap) {
                r2.mode = 13;
                break;
              }
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (2 & r2.wrap && 35615 === u2) {
                E[r2.check = 0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0), l2 = u2 = 0, r2.mode = 2;
                break;
              }
              if (r2.flags = 0, r2.head && (r2.head.done = false), !(1 & r2.wrap) || (((255 & u2) << 8) + (u2 >> 8)) % 31) {
                e2.msg = "incorrect header check", r2.mode = 30;
                break;
              }
              if (8 != (15 & u2)) {
                e2.msg = "unknown compression method", r2.mode = 30;
                break;
              }
              if (l2 -= 4, k = 8 + (15 & (u2 >>>= 4)), 0 === r2.wbits) r2.wbits = k;
              else if (k > r2.wbits) {
                e2.msg = "invalid window size", r2.mode = 30;
                break;
              }
              r2.dmax = 1 << k, e2.adler = r2.check = 1, r2.mode = 512 & u2 ? 10 : 12, l2 = u2 = 0;
              break;
            case 2:
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (r2.flags = u2, 8 != (255 & r2.flags)) {
                e2.msg = "unknown compression method", r2.mode = 30;
                break;
              }
              if (57344 & r2.flags) {
                e2.msg = "unknown header flags set", r2.mode = 30;
                break;
              }
              r2.head && (r2.head.text = u2 >> 8 & 1), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 3;
            case 3:
              for (; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              r2.head && (r2.head.time = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, E[2] = u2 >>> 16 & 255, E[3] = u2 >>> 24 & 255, r2.check = B(r2.check, E, 4, 0)), l2 = u2 = 0, r2.mode = 4;
            case 4:
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              r2.head && (r2.head.xflags = 255 & u2, r2.head.os = u2 >> 8), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 5;
            case 5:
              if (1024 & r2.flags) {
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.length = u2, r2.head && (r2.head.extra_len = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0;
              } else r2.head && (r2.head.extra = null);
              r2.mode = 6;
            case 6:
              if (1024 & r2.flags && (o2 < (d = r2.length) && (d = o2), d && (r2.head && (k = r2.head.extra_len - r2.length, r2.head.extra || (r2.head.extra = new Array(r2.head.extra_len)), I.arraySet(r2.head.extra, n2, s2, d, k)), 512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, r2.length -= d), r2.length)) break e;
              r2.length = 0, r2.mode = 7;
            case 7:
              if (2048 & r2.flags) {
                if (0 === o2) break e;
                for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.name += String.fromCharCode(k)), k && d < o2; ) ;
                if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
              } else r2.head && (r2.head.name = null);
              r2.length = 0, r2.mode = 8;
            case 8:
              if (4096 & r2.flags) {
                if (0 === o2) break e;
                for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.comment += String.fromCharCode(k)), k && d < o2; ) ;
                if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
              } else r2.head && (r2.head.comment = null);
              r2.mode = 9;
            case 9:
              if (512 & r2.flags) {
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (u2 !== (65535 & r2.check)) {
                  e2.msg = "header crc mismatch", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.head && (r2.head.hcrc = r2.flags >> 9 & 1, r2.head.done = true), e2.adler = r2.check = 0, r2.mode = 12;
              break;
            case 10:
              for (; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              e2.adler = r2.check = L(u2), l2 = u2 = 0, r2.mode = 11;
            case 11:
              if (0 === r2.havedict) return e2.next_out = a2, e2.avail_out = h3, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, 2;
              e2.adler = r2.check = 1, r2.mode = 12;
            case 12:
              if (5 === t2 || 6 === t2) break e;
            case 13:
              if (r2.last) {
                u2 >>>= 7 & l2, l2 -= 7 & l2, r2.mode = 27;
                break;
              }
              for (; l2 < 3; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              switch (r2.last = 1 & u2, l2 -= 1, 3 & (u2 >>>= 1)) {
                case 0:
                  r2.mode = 14;
                  break;
                case 1:
                  if (j(r2), r2.mode = 20, 6 !== t2) break;
                  u2 >>>= 2, l2 -= 2;
                  break e;
                case 2:
                  r2.mode = 17;
                  break;
                case 3:
                  e2.msg = "invalid block type", r2.mode = 30;
              }
              u2 >>>= 2, l2 -= 2;
              break;
            case 14:
              for (u2 >>>= 7 & l2, l2 -= 7 & l2; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if ((65535 & u2) != (u2 >>> 16 ^ 65535)) {
                e2.msg = "invalid stored block lengths", r2.mode = 30;
                break;
              }
              if (r2.length = 65535 & u2, l2 = u2 = 0, r2.mode = 15, 6 === t2) break e;
            case 15:
              r2.mode = 16;
            case 16:
              if (d = r2.length) {
                if (o2 < d && (d = o2), h3 < d && (d = h3), 0 === d) break e;
                I.arraySet(i2, n2, s2, d, a2), o2 -= d, s2 += d, h3 -= d, a2 += d, r2.length -= d;
                break;
              }
              r2.mode = 12;
              break;
            case 17:
              for (; l2 < 14; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (r2.nlen = 257 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ndist = 1 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ncode = 4 + (15 & u2), u2 >>>= 4, l2 -= 4, 286 < r2.nlen || 30 < r2.ndist) {
                e2.msg = "too many length or distance symbols", r2.mode = 30;
                break;
              }
              r2.have = 0, r2.mode = 18;
            case 18:
              for (; r2.have < r2.ncode; ) {
                for (; l2 < 3; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.lens[A[r2.have++]] = 7 & u2, u2 >>>= 3, l2 -= 3;
              }
              for (; r2.have < 19; ) r2.lens[A[r2.have++]] = 0;
              if (r2.lencode = r2.lendyn, r2.lenbits = 7, S = { bits: r2.lenbits }, x = T(0, r2.lens, 0, 19, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                e2.msg = "invalid code lengths set", r2.mode = 30;
                break;
              }
              r2.have = 0, r2.mode = 19;
            case 19:
              for (; r2.have < r2.nlen + r2.ndist; ) {
                for (; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (b < 16) u2 >>>= _, l2 -= _, r2.lens[r2.have++] = b;
                else {
                  if (16 === b) {
                    for (z = _ + 2; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    if (u2 >>>= _, l2 -= _, 0 === r2.have) {
                      e2.msg = "invalid bit length repeat", r2.mode = 30;
                      break;
                    }
                    k = r2.lens[r2.have - 1], d = 3 + (3 & u2), u2 >>>= 2, l2 -= 2;
                  } else if (17 === b) {
                    for (z = _ + 3; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    l2 -= _, k = 0, d = 3 + (7 & (u2 >>>= _)), u2 >>>= 3, l2 -= 3;
                  } else {
                    for (z = _ + 7; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    l2 -= _, k = 0, d = 11 + (127 & (u2 >>>= _)), u2 >>>= 7, l2 -= 7;
                  }
                  if (r2.have + d > r2.nlen + r2.ndist) {
                    e2.msg = "invalid bit length repeat", r2.mode = 30;
                    break;
                  }
                  for (; d--; ) r2.lens[r2.have++] = k;
                }
              }
              if (30 === r2.mode) break;
              if (0 === r2.lens[256]) {
                e2.msg = "invalid code -- missing end-of-block", r2.mode = 30;
                break;
              }
              if (r2.lenbits = 9, S = { bits: r2.lenbits }, x = T(D, r2.lens, 0, r2.nlen, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                e2.msg = "invalid literal/lengths set", r2.mode = 30;
                break;
              }
              if (r2.distbits = 6, r2.distcode = r2.distdyn, S = { bits: r2.distbits }, x = T(F, r2.lens, r2.nlen, r2.ndist, r2.distcode, 0, r2.work, S), r2.distbits = S.bits, x) {
                e2.msg = "invalid distances set", r2.mode = 30;
                break;
              }
              if (r2.mode = 20, 6 === t2) break e;
            case 20:
              r2.mode = 21;
            case 21:
              if (6 <= o2 && 258 <= h3) {
                e2.next_out = a2, e2.avail_out = h3, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, R(e2, c2), a2 = e2.next_out, i2 = e2.output, h3 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, 12 === r2.mode && (r2.back = -1);
                break;
              }
              for (r2.back = 0; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (g && 0 == (240 & g)) {
                for (v = _, y = g, w = b; g = (C = r2.lencode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                u2 >>>= v, l2 -= v, r2.back += v;
              }
              if (u2 >>>= _, l2 -= _, r2.back += _, r2.length = b, 0 === g) {
                r2.mode = 26;
                break;
              }
              if (32 & g) {
                r2.back = -1, r2.mode = 12;
                break;
              }
              if (64 & g) {
                e2.msg = "invalid literal/length code", r2.mode = 30;
                break;
              }
              r2.extra = 15 & g, r2.mode = 22;
            case 22:
              if (r2.extra) {
                for (z = r2.extra; l2 < z; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.length += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
              }
              r2.was = r2.length, r2.mode = 23;
            case 23:
              for (; g = (C = r2.distcode[u2 & (1 << r2.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (0 == (240 & g)) {
                for (v = _, y = g, w = b; g = (C = r2.distcode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                u2 >>>= v, l2 -= v, r2.back += v;
              }
              if (u2 >>>= _, l2 -= _, r2.back += _, 64 & g) {
                e2.msg = "invalid distance code", r2.mode = 30;
                break;
              }
              r2.offset = b, r2.extra = 15 & g, r2.mode = 24;
            case 24:
              if (r2.extra) {
                for (z = r2.extra; l2 < z; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.offset += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
              }
              if (r2.offset > r2.dmax) {
                e2.msg = "invalid distance too far back", r2.mode = 30;
                break;
              }
              r2.mode = 25;
            case 25:
              if (0 === h3) break e;
              if (d = c2 - h3, r2.offset > d) {
                if ((d = r2.offset - d) > r2.whave && r2.sane) {
                  e2.msg = "invalid distance too far back", r2.mode = 30;
                  break;
                }
                p = d > r2.wnext ? (d -= r2.wnext, r2.wsize - d) : r2.wnext - d, d > r2.length && (d = r2.length), m = r2.window;
              } else m = i2, p = a2 - r2.offset, d = r2.length;
              for (h3 < d && (d = h3), h3 -= d, r2.length -= d; i2[a2++] = m[p++], --d; ) ;
              0 === r2.length && (r2.mode = 21);
              break;
            case 26:
              if (0 === h3) break e;
              i2[a2++] = r2.length, h3--, r2.mode = 21;
              break;
            case 27:
              if (r2.wrap) {
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 |= n2[s2++] << l2, l2 += 8;
                }
                if (c2 -= h3, e2.total_out += c2, r2.total += c2, c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, a2 - c2) : O(r2.check, i2, c2, a2 - c2)), c2 = h3, (r2.flags ? u2 : L(u2)) !== r2.check) {
                  e2.msg = "incorrect data check", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.mode = 28;
            case 28:
              if (r2.wrap && r2.flags) {
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (u2 !== (4294967295 & r2.total)) {
                  e2.msg = "incorrect length check", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.mode = 29;
            case 29:
              x = 1;
              break e;
            case 30:
              x = -3;
              break e;
            case 31:
              return -4;
            case 32:
            default:
              return U;
          }
          return e2.next_out = a2, e2.avail_out = h3, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, (r2.wsize || c2 !== e2.avail_out && r2.mode < 30 && (r2.mode < 27 || 4 !== t2)) && Z(e2, e2.output, e2.next_out, c2 - e2.avail_out) ? (r2.mode = 31, -4) : (f2 -= e2.avail_in, c2 -= e2.avail_out, e2.total_in += f2, e2.total_out += c2, r2.total += c2, r2.wrap && c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, e2.next_out - c2) : O(r2.check, i2, c2, e2.next_out - c2)), e2.data_type = r2.bits + (r2.last ? 64 : 0) + (12 === r2.mode ? 128 : 0) + (20 === r2.mode || 15 === r2.mode ? 256 : 0), (0 == f2 && 0 === c2 || 4 === t2) && x === N && (x = -5), x);
        }, r.inflateEnd = function(e2) {
          if (!e2 || !e2.state) return U;
          var t2 = e2.state;
          return t2.window && (t2.window = null), e2.state = null, N;
        }, r.inflateGetHeader = function(e2, t2) {
          var r2;
          return e2 && e2.state ? 0 == (2 & (r2 = e2.state).wrap) ? U : ((r2.head = t2).done = false, N) : U;
        }, r.inflateSetDictionary = function(e2, t2) {
          var r2, n2 = t2.length;
          return e2 && e2.state ? 0 !== (r2 = e2.state).wrap && 11 !== r2.mode ? U : 11 === r2.mode && O(1, t2, n2, 0) !== r2.check ? -3 : Z(e2, t2, n2, n2) ? (r2.mode = 31, -4) : (r2.havedict = 1, N) : U;
        }, r.inflateInfo = "pako inflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(e, t, r) {
        "use strict";
        var D = e("../utils/common"), F = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], N = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], U = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], P = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
        t.exports = function(e2, t2, r2, n, i, s, a, o) {
          var h2, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
          for (b = 0; b <= 15; b++) O[b] = 0;
          for (v = 0; v < n; v++) O[t2[r2 + v]]++;
          for (k = g, w = 15; 1 <= w && 0 === O[w]; w--) ;
          if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
          for (y = 1; y < w && 0 === O[y]; y++) ;
          for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
          if (0 < z && (0 === e2 || 1 !== w)) return -1;
          for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
          for (v = 0; v < n; v++) 0 !== t2[r2 + v] && (a[B[t2[r2 + v]]++] = v);
          if (d = 0 === e2 ? (A = R = a, 19) : 1 === e2 ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
          for (; ; ) {
            for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h2 = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h2)] = p << 24 | m << 16 | _ | 0, 0 !== u; ) ;
            for (h2 = 1 << b - 1; E & h2; ) h2 >>= 1;
            if (0 !== h2 ? (E &= h2 - 1, E += h2) : E = 0, v++, 0 == --O[b]) {
              if (b === w) break;
              b = t2[r2 + a[v]];
            }
            if (k < b && (E & f) !== l) {
              for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0); ) x++, z <<= 1;
              if (C += 1 << x, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
              i[l = E & f] = k << 24 | x << 16 | c - s | 0;
            }
          }
          return 0 !== E && (i[c + E] = b - S << 24 | 64 << 16 | 0), o.bits = k, 0;
        };
      }, { "../utils/common": 41 }], 51: [function(e, t, r) {
        "use strict";
        t.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
      }, {}], 52: [function(e, t, r) {
        "use strict";
        var i = e("../utils/common"), o = 0, h2 = 1;
        function n(e2) {
          for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
        }
        var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], k = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], S = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], z = new Array(2 * (l + 2));
        n(z);
        var C = new Array(2 * f);
        n(C);
        var E = new Array(512);
        n(E);
        var A = new Array(256);
        n(A);
        var I = new Array(a);
        n(I);
        var O, B, R, T = new Array(f);
        function D(e2, t2, r2, n2, i2) {
          this.static_tree = e2, this.extra_bits = t2, this.extra_base = r2, this.elems = n2, this.max_length = i2, this.has_stree = e2 && e2.length;
        }
        function F(e2, t2) {
          this.dyn_tree = e2, this.max_code = 0, this.stat_desc = t2;
        }
        function N(e2) {
          return e2 < 256 ? E[e2] : E[256 + (e2 >>> 7)];
        }
        function U(e2, t2) {
          e2.pending_buf[e2.pending++] = 255 & t2, e2.pending_buf[e2.pending++] = t2 >>> 8 & 255;
        }
        function P(e2, t2, r2) {
          e2.bi_valid > d - r2 ? (e2.bi_buf |= t2 << e2.bi_valid & 65535, U(e2, e2.bi_buf), e2.bi_buf = t2 >> d - e2.bi_valid, e2.bi_valid += r2 - d) : (e2.bi_buf |= t2 << e2.bi_valid & 65535, e2.bi_valid += r2);
        }
        function L(e2, t2, r2) {
          P(e2, r2[2 * t2], r2[2 * t2 + 1]);
        }
        function j(e2, t2) {
          for (var r2 = 0; r2 |= 1 & e2, e2 >>>= 1, r2 <<= 1, 0 < --t2; ) ;
          return r2 >>> 1;
        }
        function Z(e2, t2, r2) {
          var n2, i2, s2 = new Array(g + 1), a2 = 0;
          for (n2 = 1; n2 <= g; n2++) s2[n2] = a2 = a2 + r2[n2 - 1] << 1;
          for (i2 = 0; i2 <= t2; i2++) {
            var o2 = e2[2 * i2 + 1];
            0 !== o2 && (e2[2 * i2] = j(s2[o2]++, o2));
          }
        }
        function W(e2) {
          var t2;
          for (t2 = 0; t2 < l; t2++) e2.dyn_ltree[2 * t2] = 0;
          for (t2 = 0; t2 < f; t2++) e2.dyn_dtree[2 * t2] = 0;
          for (t2 = 0; t2 < c; t2++) e2.bl_tree[2 * t2] = 0;
          e2.dyn_ltree[2 * m] = 1, e2.opt_len = e2.static_len = 0, e2.last_lit = e2.matches = 0;
        }
        function M(e2) {
          8 < e2.bi_valid ? U(e2, e2.bi_buf) : 0 < e2.bi_valid && (e2.pending_buf[e2.pending++] = e2.bi_buf), e2.bi_buf = 0, e2.bi_valid = 0;
        }
        function H(e2, t2, r2, n2) {
          var i2 = 2 * t2, s2 = 2 * r2;
          return e2[i2] < e2[s2] || e2[i2] === e2[s2] && n2[t2] <= n2[r2];
        }
        function G(e2, t2, r2) {
          for (var n2 = e2.heap[r2], i2 = r2 << 1; i2 <= e2.heap_len && (i2 < e2.heap_len && H(t2, e2.heap[i2 + 1], e2.heap[i2], e2.depth) && i2++, !H(t2, n2, e2.heap[i2], e2.depth)); ) e2.heap[r2] = e2.heap[i2], r2 = i2, i2 <<= 1;
          e2.heap[r2] = n2;
        }
        function K(e2, t2, r2) {
          var n2, i2, s2, a2, o2 = 0;
          if (0 !== e2.last_lit) for (; n2 = e2.pending_buf[e2.d_buf + 2 * o2] << 8 | e2.pending_buf[e2.d_buf + 2 * o2 + 1], i2 = e2.pending_buf[e2.l_buf + o2], o2++, 0 === n2 ? L(e2, i2, t2) : (L(e2, (s2 = A[i2]) + u + 1, t2), 0 !== (a2 = w[s2]) && P(e2, i2 -= I[s2], a2), L(e2, s2 = N(--n2), r2), 0 !== (a2 = k[s2]) && P(e2, n2 -= T[s2], a2)), o2 < e2.last_lit; ) ;
          L(e2, m, t2);
        }
        function Y(e2, t2) {
          var r2, n2, i2, s2 = t2.dyn_tree, a2 = t2.stat_desc.static_tree, o2 = t2.stat_desc.has_stree, h3 = t2.stat_desc.elems, u2 = -1;
          for (e2.heap_len = 0, e2.heap_max = _, r2 = 0; r2 < h3; r2++) 0 !== s2[2 * r2] ? (e2.heap[++e2.heap_len] = u2 = r2, e2.depth[r2] = 0) : s2[2 * r2 + 1] = 0;
          for (; e2.heap_len < 2; ) s2[2 * (i2 = e2.heap[++e2.heap_len] = u2 < 2 ? ++u2 : 0)] = 1, e2.depth[i2] = 0, e2.opt_len--, o2 && (e2.static_len -= a2[2 * i2 + 1]);
          for (t2.max_code = u2, r2 = e2.heap_len >> 1; 1 <= r2; r2--) G(e2, s2, r2);
          for (i2 = h3; r2 = e2.heap[1], e2.heap[1] = e2.heap[e2.heap_len--], G(e2, s2, 1), n2 = e2.heap[1], e2.heap[--e2.heap_max] = r2, e2.heap[--e2.heap_max] = n2, s2[2 * i2] = s2[2 * r2] + s2[2 * n2], e2.depth[i2] = (e2.depth[r2] >= e2.depth[n2] ? e2.depth[r2] : e2.depth[n2]) + 1, s2[2 * r2 + 1] = s2[2 * n2 + 1] = i2, e2.heap[1] = i2++, G(e2, s2, 1), 2 <= e2.heap_len; ) ;
          e2.heap[--e2.heap_max] = e2.heap[1], (function(e3, t3) {
            var r3, n3, i3, s3, a3, o3, h4 = t3.dyn_tree, u3 = t3.max_code, l2 = t3.stat_desc.static_tree, f2 = t3.stat_desc.has_stree, c2 = t3.stat_desc.extra_bits, d2 = t3.stat_desc.extra_base, p2 = t3.stat_desc.max_length, m2 = 0;
            for (s3 = 0; s3 <= g; s3++) e3.bl_count[s3] = 0;
            for (h4[2 * e3.heap[e3.heap_max] + 1] = 0, r3 = e3.heap_max + 1; r3 < _; r3++) p2 < (s3 = h4[2 * h4[2 * (n3 = e3.heap[r3]) + 1] + 1] + 1) && (s3 = p2, m2++), h4[2 * n3 + 1] = s3, u3 < n3 || (e3.bl_count[s3]++, a3 = 0, d2 <= n3 && (a3 = c2[n3 - d2]), o3 = h4[2 * n3], e3.opt_len += o3 * (s3 + a3), f2 && (e3.static_len += o3 * (l2[2 * n3 + 1] + a3)));
            if (0 !== m2) {
              do {
                for (s3 = p2 - 1; 0 === e3.bl_count[s3]; ) s3--;
                e3.bl_count[s3]--, e3.bl_count[s3 + 1] += 2, e3.bl_count[p2]--, m2 -= 2;
              } while (0 < m2);
              for (s3 = p2; 0 !== s3; s3--) for (n3 = e3.bl_count[s3]; 0 !== n3; ) u3 < (i3 = e3.heap[--r3]) || (h4[2 * i3 + 1] !== s3 && (e3.opt_len += (s3 - h4[2 * i3 + 1]) * h4[2 * i3], h4[2 * i3 + 1] = s3), n3--);
            }
          })(e2, t2), Z(s2, u2, e2.bl_count);
        }
        function X(e2, t2, r2) {
          var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h3 = 7, u2 = 4;
          for (0 === a2 && (h3 = 138, u2 = 3), t2[2 * (r2 + 1) + 1] = 65535, n2 = 0; n2 <= r2; n2++) i2 = a2, a2 = t2[2 * (n2 + 1) + 1], ++o2 < h3 && i2 === a2 || (o2 < u2 ? e2.bl_tree[2 * i2] += o2 : 0 !== i2 ? (i2 !== s2 && e2.bl_tree[2 * i2]++, e2.bl_tree[2 * b]++) : o2 <= 10 ? e2.bl_tree[2 * v]++ : e2.bl_tree[2 * y]++, s2 = i2, u2 = (o2 = 0) === a2 ? (h3 = 138, 3) : i2 === a2 ? (h3 = 6, 3) : (h3 = 7, 4));
        }
        function V(e2, t2, r2) {
          var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h3 = 7, u2 = 4;
          for (0 === a2 && (h3 = 138, u2 = 3), n2 = 0; n2 <= r2; n2++) if (i2 = a2, a2 = t2[2 * (n2 + 1) + 1], !(++o2 < h3 && i2 === a2)) {
            if (o2 < u2) for (; L(e2, i2, e2.bl_tree), 0 != --o2; ) ;
            else 0 !== i2 ? (i2 !== s2 && (L(e2, i2, e2.bl_tree), o2--), L(e2, b, e2.bl_tree), P(e2, o2 - 3, 2)) : o2 <= 10 ? (L(e2, v, e2.bl_tree), P(e2, o2 - 3, 3)) : (L(e2, y, e2.bl_tree), P(e2, o2 - 11, 7));
            s2 = i2, u2 = (o2 = 0) === a2 ? (h3 = 138, 3) : i2 === a2 ? (h3 = 6, 3) : (h3 = 7, 4);
          }
        }
        n(T);
        var q = false;
        function J(e2, t2, r2, n2) {
          P(e2, (s << 1) + (n2 ? 1 : 0), 3), (function(e3, t3, r3, n3) {
            M(e3), n3 && (U(e3, r3), U(e3, ~r3)), i.arraySet(e3.pending_buf, e3.window, t3, r3, e3.pending), e3.pending += r3;
          })(e2, t2, r2, true);
        }
        r._tr_init = function(e2) {
          q || ((function() {
            var e3, t2, r2, n2, i2, s2 = new Array(g + 1);
            for (n2 = r2 = 0; n2 < a - 1; n2++) for (I[n2] = r2, e3 = 0; e3 < 1 << w[n2]; e3++) A[r2++] = n2;
            for (A[r2 - 1] = n2, n2 = i2 = 0; n2 < 16; n2++) for (T[n2] = i2, e3 = 0; e3 < 1 << k[n2]; e3++) E[i2++] = n2;
            for (i2 >>= 7; n2 < f; n2++) for (T[n2] = i2 << 7, e3 = 0; e3 < 1 << k[n2] - 7; e3++) E[256 + i2++] = n2;
            for (t2 = 0; t2 <= g; t2++) s2[t2] = 0;
            for (e3 = 0; e3 <= 143; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
            for (; e3 <= 255; ) z[2 * e3 + 1] = 9, e3++, s2[9]++;
            for (; e3 <= 279; ) z[2 * e3 + 1] = 7, e3++, s2[7]++;
            for (; e3 <= 287; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
            for (Z(z, l + 1, s2), e3 = 0; e3 < f; e3++) C[2 * e3 + 1] = 5, C[2 * e3] = j(e3, 5);
            O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
          })(), q = true), e2.l_desc = new F(e2.dyn_ltree, O), e2.d_desc = new F(e2.dyn_dtree, B), e2.bl_desc = new F(e2.bl_tree, R), e2.bi_buf = 0, e2.bi_valid = 0, W(e2);
        }, r._tr_stored_block = J, r._tr_flush_block = function(e2, t2, r2, n2) {
          var i2, s2, a2 = 0;
          0 < e2.level ? (2 === e2.strm.data_type && (e2.strm.data_type = (function(e3) {
            var t3, r3 = 4093624447;
            for (t3 = 0; t3 <= 31; t3++, r3 >>>= 1) if (1 & r3 && 0 !== e3.dyn_ltree[2 * t3]) return o;
            if (0 !== e3.dyn_ltree[18] || 0 !== e3.dyn_ltree[20] || 0 !== e3.dyn_ltree[26]) return h2;
            for (t3 = 32; t3 < u; t3++) if (0 !== e3.dyn_ltree[2 * t3]) return h2;
            return o;
          })(e2)), Y(e2, e2.l_desc), Y(e2, e2.d_desc), a2 = (function(e3) {
            var t3;
            for (X(e3, e3.dyn_ltree, e3.l_desc.max_code), X(e3, e3.dyn_dtree, e3.d_desc.max_code), Y(e3, e3.bl_desc), t3 = c - 1; 3 <= t3 && 0 === e3.bl_tree[2 * S[t3] + 1]; t3--) ;
            return e3.opt_len += 3 * (t3 + 1) + 5 + 5 + 4, t3;
          })(e2), i2 = e2.opt_len + 3 + 7 >>> 3, (s2 = e2.static_len + 3 + 7 >>> 3) <= i2 && (i2 = s2)) : i2 = s2 = r2 + 5, r2 + 4 <= i2 && -1 !== t2 ? J(e2, t2, r2, n2) : 4 === e2.strategy || s2 === i2 ? (P(e2, 2 + (n2 ? 1 : 0), 3), K(e2, z, C)) : (P(e2, 4 + (n2 ? 1 : 0), 3), (function(e3, t3, r3, n3) {
            var i3;
            for (P(e3, t3 - 257, 5), P(e3, r3 - 1, 5), P(e3, n3 - 4, 4), i3 = 0; i3 < n3; i3++) P(e3, e3.bl_tree[2 * S[i3] + 1], 3);
            V(e3, e3.dyn_ltree, t3 - 1), V(e3, e3.dyn_dtree, r3 - 1);
          })(e2, e2.l_desc.max_code + 1, e2.d_desc.max_code + 1, a2 + 1), K(e2, e2.dyn_ltree, e2.dyn_dtree)), W(e2), n2 && M(e2);
        }, r._tr_tally = function(e2, t2, r2) {
          return e2.pending_buf[e2.d_buf + 2 * e2.last_lit] = t2 >>> 8 & 255, e2.pending_buf[e2.d_buf + 2 * e2.last_lit + 1] = 255 & t2, e2.pending_buf[e2.l_buf + e2.last_lit] = 255 & r2, e2.last_lit++, 0 === t2 ? e2.dyn_ltree[2 * r2]++ : (e2.matches++, t2--, e2.dyn_ltree[2 * (A[r2] + u + 1)]++, e2.dyn_dtree[2 * N(t2)]++), e2.last_lit === e2.lit_bufsize - 1;
        }, r._tr_align = function(e2) {
          P(e2, 2, 3), L(e2, m, z), (function(e3) {
            16 === e3.bi_valid ? (U(e3, e3.bi_buf), e3.bi_buf = 0, e3.bi_valid = 0) : 8 <= e3.bi_valid && (e3.pending_buf[e3.pending++] = 255 & e3.bi_buf, e3.bi_buf >>= 8, e3.bi_valid -= 8);
          })(e2);
        };
      }, { "../utils/common": 41 }], 53: [function(e, t, r) {
        "use strict";
        t.exports = function() {
          this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
        };
      }, {}], 54: [function(e, t, r) {
        (function(e2) {
          !(function(r2, n) {
            "use strict";
            if (!r2.setImmediate) {
              var i, s, t2, a, o = 1, h2 = {}, u = false, l = r2.document, e3 = Object.getPrototypeOf && Object.getPrototypeOf(r2);
              e3 = e3 && e3.setTimeout ? e3 : r2, i = "[object process]" === {}.toString.call(r2.process) ? function(e4) {
                process.nextTick(function() {
                  c(e4);
                });
              } : (function() {
                if (r2.postMessage && !r2.importScripts) {
                  var e4 = true, t3 = r2.onmessage;
                  return r2.onmessage = function() {
                    e4 = false;
                  }, r2.postMessage("", "*"), r2.onmessage = t3, e4;
                }
              })() ? (a = "setImmediate$" + Math.random() + "$", r2.addEventListener ? r2.addEventListener("message", d, false) : r2.attachEvent("onmessage", d), function(e4) {
                r2.postMessage(a + e4, "*");
              }) : r2.MessageChannel ? ((t2 = new MessageChannel()).port1.onmessage = function(e4) {
                c(e4.data);
              }, function(e4) {
                t2.port2.postMessage(e4);
              }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e4) {
                var t3 = l.createElement("script");
                t3.onreadystatechange = function() {
                  c(e4), t3.onreadystatechange = null, s.removeChild(t3), t3 = null;
                }, s.appendChild(t3);
              }) : function(e4) {
                setTimeout(c, 0, e4);
              }, e3.setImmediate = function(e4) {
                "function" != typeof e4 && (e4 = new Function("" + e4));
                for (var t3 = new Array(arguments.length - 1), r3 = 0; r3 < t3.length; r3++) t3[r3] = arguments[r3 + 1];
                var n2 = { callback: e4, args: t3 };
                return h2[o] = n2, i(o), o++;
              }, e3.clearImmediate = f;
            }
            function f(e4) {
              delete h2[e4];
            }
            function c(e4) {
              if (u) setTimeout(c, 0, e4);
              else {
                var t3 = h2[e4];
                if (t3) {
                  u = true;
                  try {
                    !(function(e5) {
                      var t4 = e5.callback, r3 = e5.args;
                      switch (r3.length) {
                        case 0:
                          t4();
                          break;
                        case 1:
                          t4(r3[0]);
                          break;
                        case 2:
                          t4(r3[0], r3[1]);
                          break;
                        case 3:
                          t4(r3[0], r3[1], r3[2]);
                          break;
                        default:
                          t4.apply(n, r3);
                      }
                    })(t3);
                  } finally {
                    f(e4), u = false;
                  }
                }
              }
            }
            function d(e4) {
              e4.source === r2 && "string" == typeof e4.data && 0 === e4.data.indexOf(a) && c(+e4.data.slice(a.length));
            }
          })("undefined" == typeof self ? void 0 === e2 ? this : e2 : self);
        }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
      }, {}] }, {}, [10])(10);
    });
  }
});

// node_modules/docx-preview/dist/docx-preview.mjs
var import_jszip = __toESM(require_jszip_min(), 1);
var RelationshipTypes;
(function(RelationshipTypes2) {
  RelationshipTypes2["OfficeDocument"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
  RelationshipTypes2["FontTable"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable";
  RelationshipTypes2["Image"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
  RelationshipTypes2["Numbering"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
  RelationshipTypes2["Styles"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
  RelationshipTypes2["StylesWithEffects"] = "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects";
  RelationshipTypes2["Theme"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
  RelationshipTypes2["Settings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
  RelationshipTypes2["WebSettings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings";
  RelationshipTypes2["Hyperlink"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
  RelationshipTypes2["Footnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
  RelationshipTypes2["Endnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
  RelationshipTypes2["Footer"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
  RelationshipTypes2["Header"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
  RelationshipTypes2["ExtendedProperties"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
  RelationshipTypes2["CoreProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
  RelationshipTypes2["CustomProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/custom-properties";
  RelationshipTypes2["Comments"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
  RelationshipTypes2["CommentsExtended"] = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
  RelationshipTypes2["AltChunk"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk";
})(RelationshipTypes || (RelationshipTypes = {}));
function parseRelationships(root, xml) {
  return xml.elements(root).map((e) => ({
    id: xml.attr(e, "Id"),
    type: xml.attr(e, "Type"),
    target: xml.attr(e, "Target"),
    targetMode: xml.attr(e, "TargetMode")
  }));
}
function escapeClassName(className) {
  return className?.replace(/[ .]+/g, "-").replace(/[&]+/g, "and").toLowerCase();
}
function encloseFontFamily(fontFamily) {
  return /^[^"'].*\s.*[^"']$/.test(fontFamily) ? `'${fontFamily}'` : fontFamily;
}
function splitPath(path) {
  let si = path.lastIndexOf("/") + 1;
  let folder = si == 0 ? "" : path.substring(0, si);
  let fileName = si == 0 ? path : path.substring(si);
  return [folder, fileName];
}
function resolvePath(path, base) {
  try {
    const prefix = "http://docx/";
    const url = new URL(path, prefix + base).toString();
    return url.substring(prefix.length);
  } catch {
    return `${base}${path}`;
  }
}
function keyBy(array, by) {
  return array.reduce((a, x) => {
    a[by(x)] = x;
    return a;
  }, {});
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject();
    reader.readAsDataURL(blob);
  });
}
function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}
function isString(item) {
  return typeof item === "string" || item instanceof String;
}
function mergeDeep(target, ...sources) {
  if (!sources.length)
    return target;
  const source = sources.shift();
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        const val = target[key] ?? (target[key] = {});
        mergeDeep(val, source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return mergeDeep(target, ...sources);
}
function asArray(val) {
  return Array.isArray(val) ? val : [val];
}
function clamp(val, min, max) {
  return min > val ? min : max < val ? max : val;
}
var ns$1 = {
  wordml: "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
};
var LengthUsage = {
  Dxa: { mul: 0.05, unit: "pt" },
  Emu: { mul: 1 / 12700, unit: "pt" },
  FontSize: { mul: 0.5, unit: "pt" },
  Border: { mul: 0.125, unit: "pt", min: 0.25, max: 12 },
  Point: { mul: 1, unit: "pt" },
  Percent: { mul: 0.02, unit: "%" }
};
function convertLength(val, usage = LengthUsage.Dxa) {
  if (val == null || /.+(p[xt]|[%])$/.test(val)) {
    return val;
  }
  var num = parseInt(val) * usage.mul;
  if (usage.min && usage.max)
    num = clamp(num, usage.min, usage.max);
  return `${num.toFixed(2)}${usage.unit}`;
}
function convertBoolean(v, defaultValue = false) {
  switch (v) {
    case "1":
      return true;
    case "0":
      return false;
    case "on":
      return true;
    case "off":
      return false;
    case "true":
      return true;
    case "false":
      return false;
    default:
      return defaultValue;
  }
}
function parseCommonProperty(elem, props, xml) {
  if (elem.namespaceURI != ns$1.wordml)
    return false;
  switch (elem.localName) {
    case "color":
      props.color = xml.attr(elem, "val");
      break;
    case "sz":
      props.fontSize = xml.lengthAttr(elem, "val", LengthUsage.FontSize);
      break;
    default:
      return false;
  }
  return true;
}
function parseXmlString(xmlString, trimXmlDeclaration = false) {
  if (trimXmlDeclaration)
    xmlString = xmlString.replace(/<[?].*[?]>/, "");
  xmlString = removeUTF8BOM(xmlString);
  const result = new DOMParser().parseFromString(xmlString, "application/xml");
  const errorText = hasXmlParserError(result);
  if (errorText)
    throw new Error(errorText);
  return result;
}
function hasXmlParserError(doc) {
  return doc.getElementsByTagName("parsererror")[0]?.textContent;
}
function removeUTF8BOM(data) {
  return data.charCodeAt(0) === 65279 ? data.substring(1) : data;
}
function serializeXmlString(elem) {
  return new XMLSerializer().serializeToString(elem);
}
var XmlParser = class {
  elements(elem, localName = null) {
    const result = [];
    for (let i = 0, l = elem.childNodes.length; i < l; i++) {
      let c = elem.childNodes.item(i);
      if (c.nodeType == Node.ELEMENT_NODE && (localName == null || c.localName == localName))
        result.push(c);
    }
    return result;
  }
  element(elem, localName) {
    for (let i = 0, l = elem.childNodes.length; i < l; i++) {
      let c = elem.childNodes.item(i);
      if (c.nodeType == 1 && c.localName == localName)
        return c;
    }
    return null;
  }
  elementAttr(elem, localName, attrLocalName) {
    var el = this.element(elem, localName);
    return el ? this.attr(el, attrLocalName) : void 0;
  }
  attrs(elem) {
    return Array.from(elem.attributes);
  }
  attr(elem, localName) {
    for (let i = 0, l = elem.attributes.length; i < l; i++) {
      let a = elem.attributes.item(i);
      if (a.localName == localName)
        return a.value;
    }
    return null;
  }
  intAttr(node, attrName, defaultValue = null) {
    var val = this.attr(node, attrName);
    return val ? parseInt(val) : defaultValue;
  }
  hexAttr(node, attrName, defaultValue = null) {
    var val = this.attr(node, attrName);
    return val ? parseInt(val, 16) : defaultValue;
  }
  floatAttr(node, attrName, defaultValue = null) {
    var val = this.attr(node, attrName);
    return val ? parseFloat(val) : defaultValue;
  }
  boolAttr(node, attrName, defaultValue = null) {
    return convertBoolean(this.attr(node, attrName), defaultValue);
  }
  lengthAttr(node, attrName, usage = LengthUsage.Dxa) {
    return convertLength(this.attr(node, attrName), usage);
  }
};
var globalXmlParser = new XmlParser();
var Part = class {
  constructor(_package, path) {
    this._package = _package;
    this.path = path;
  }
  async load() {
    this.rels = await this._package.loadRelationships(this.path);
    const xmlText = await this._package.load(this.path);
    const xmlDoc = this._package.parseXmlDocument(xmlText);
    if (this._package.options.keepOrigin) {
      this._xmlDocument = xmlDoc;
    }
    this.parseXml(xmlDoc.firstElementChild);
  }
  save() {
    this._package.update(this.path, serializeXmlString(this._xmlDocument));
  }
  parseXml(root) {
  }
};
var embedFontTypeMap = {
  embedRegular: "regular",
  embedBold: "bold",
  embedItalic: "italic",
  embedBoldItalic: "boldItalic"
};
function parseFonts(root, xml) {
  return xml.elements(root).map((el) => parseFont(el, xml));
}
function parseFont(elem, xml) {
  let result = {
    name: xml.attr(elem, "name"),
    embedFontRefs: []
  };
  for (let el of xml.elements(elem)) {
    switch (el.localName) {
      case "family":
        result.family = xml.attr(el, "val");
        break;
      case "altName":
        result.altName = xml.attr(el, "val");
        break;
      case "embedRegular":
      case "embedBold":
      case "embedItalic":
      case "embedBoldItalic":
        result.embedFontRefs.push(parseEmbedFontRef(el, xml));
        break;
    }
  }
  return result;
}
function parseEmbedFontRef(elem, xml) {
  return {
    id: xml.attr(elem, "id"),
    key: xml.attr(elem, "fontKey"),
    type: embedFontTypeMap[elem.localName]
  };
}
var FontTablePart = class extends Part {
  parseXml(root) {
    this.fonts = parseFonts(root, this._package.xmlParser);
  }
};
function parseContentTypes(root, xml) {
  return xml.elements(root).map((e) => ({
    extension: xml.attr(e, "Extension"),
    partName: xml.attr(e, "PartName"),
    contentType: xml.attr(e, "ContentType")
  }));
}
var OpenXmlPackage = class _OpenXmlPackage {
  constructor(_zip, options) {
    this._zip = _zip;
    this.options = options;
    this.xmlParser = new XmlParser();
  }
  get(path) {
    const p = normalizePath(path);
    return this._zip.files[p] ?? this._zip.files[p.replace(/\//g, "\\")];
  }
  update(path, content) {
    this._zip.file(path, content);
  }
  static async load(input, options) {
    const zip = await import_jszip.default.loadAsync(input);
    return new _OpenXmlPackage(zip, options);
  }
  save(type = "blob") {
    return this._zip.generateAsync({ type });
  }
  load(path, type = "string") {
    return this.get(path)?.async(type) ?? Promise.resolve(null);
  }
  async loadRelationships(path = null) {
    let relsPath = `_rels/.rels`;
    if (path != null) {
      const [f, fn] = splitPath(path);
      relsPath = `${f}_rels/${fn}.rels`;
    }
    const txt = await this.load(relsPath);
    return txt ? parseRelationships(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : null;
  }
  async loadContentTypes() {
    const txt = await this.load("[Content_Types].xml");
    return txt ? parseContentTypes(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : [];
  }
  parseXmlDocument(txt) {
    return parseXmlString(txt, this.options.trimXmlDeclaration);
  }
};
function normalizePath(path) {
  return path.startsWith("/") ? path.substr(1) : path;
}
var DocumentPart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
  parseXml(root) {
    this.body = this._documentParser.parseDocumentFile(root);
  }
};
function parseBorder(elem, xml) {
  return {
    type: xml.attr(elem, "val"),
    color: xml.attr(elem, "color"),
    size: xml.lengthAttr(elem, "sz", LengthUsage.Border),
    offset: xml.lengthAttr(elem, "space", LengthUsage.Point),
    frame: xml.boolAttr(elem, "frame"),
    shadow: xml.boolAttr(elem, "shadow")
  };
}
function parseBorders(elem, xml) {
  var result = {};
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "left":
        result.left = parseBorder(e, xml);
        break;
      case "top":
        result.top = parseBorder(e, xml);
        break;
      case "right":
        result.right = parseBorder(e, xml);
        break;
      case "bottom":
        result.bottom = parseBorder(e, xml);
        break;
    }
  }
  return result;
}
var SectionType;
(function(SectionType2) {
  SectionType2["Continuous"] = "continuous";
  SectionType2["NextPage"] = "nextPage";
  SectionType2["NextColumn"] = "nextColumn";
  SectionType2["EvenPage"] = "evenPage";
  SectionType2["OddPage"] = "oddPage";
})(SectionType || (SectionType = {}));
function parseSectionProperties(elem, xml = globalXmlParser) {
  var section = {};
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "pgSz":
        section.pageSize = {
          width: xml.lengthAttr(e, "w"),
          height: xml.lengthAttr(e, "h"),
          orientation: xml.attr(e, "orient")
        };
        break;
      case "type":
        section.type = xml.attr(e, "val");
        break;
      case "pgMar":
        section.pageMargins = {
          left: xml.lengthAttr(e, "left"),
          right: xml.lengthAttr(e, "right"),
          top: xml.lengthAttr(e, "top"),
          bottom: xml.lengthAttr(e, "bottom"),
          header: xml.lengthAttr(e, "header"),
          footer: xml.lengthAttr(e, "footer"),
          gutter: xml.lengthAttr(e, "gutter")
        };
        break;
      case "cols":
        section.columns = parseColumns(e, xml);
        break;
      case "headerReference":
        (section.headerRefs ?? (section.headerRefs = [])).push(parseFooterHeaderReference(e, xml));
        break;
      case "footerReference":
        (section.footerRefs ?? (section.footerRefs = [])).push(parseFooterHeaderReference(e, xml));
        break;
      case "titlePg":
        section.titlePage = xml.boolAttr(e, "val", true);
        break;
      case "pgBorders":
        section.pageBorders = parseBorders(e, xml);
        break;
      case "pgNumType":
        section.pageNumber = parsePageNumber(e, xml);
        break;
    }
  }
  return section;
}
function parseColumns(elem, xml) {
  return {
    numberOfColumns: xml.intAttr(elem, "num"),
    space: xml.lengthAttr(elem, "space"),
    separator: xml.boolAttr(elem, "sep"),
    equalWidth: xml.boolAttr(elem, "equalWidth", true),
    columns: xml.elements(elem, "col").map((e) => ({
      width: xml.lengthAttr(e, "w"),
      space: xml.lengthAttr(e, "space")
    }))
  };
}
function parsePageNumber(elem, xml) {
  return {
    chapSep: xml.attr(elem, "chapSep"),
    chapStyle: xml.attr(elem, "chapStyle"),
    format: xml.attr(elem, "fmt"),
    start: xml.intAttr(elem, "start")
  };
}
function parseFooterHeaderReference(elem, xml) {
  return {
    id: xml.attr(elem, "id"),
    type: xml.attr(elem, "type")
  };
}
function parseLineSpacing(elem, xml) {
  return {
    before: xml.lengthAttr(elem, "before"),
    after: xml.lengthAttr(elem, "after"),
    line: xml.intAttr(elem, "line"),
    lineRule: xml.attr(elem, "lineRule")
  };
}
function parseRunProperties(elem, xml) {
  let result = {};
  for (let el of xml.elements(elem)) {
    parseRunProperty(el, result, xml);
  }
  return result;
}
function parseRunProperty(elem, props, xml) {
  if (parseCommonProperty(elem, props, xml))
    return true;
  return false;
}
function parseParagraphProperties(elem, xml) {
  let result = {};
  for (let el of xml.elements(elem)) {
    parseParagraphProperty(el, result, xml);
  }
  return result;
}
function parseParagraphProperty(elem, props, xml) {
  if (elem.namespaceURI != ns$1.wordml)
    return false;
  if (parseCommonProperty(elem, props, xml))
    return true;
  switch (elem.localName) {
    case "tabs":
      props.tabs = parseTabs(elem, xml);
      break;
    case "sectPr":
      props.sectionProps = parseSectionProperties(elem, xml);
      break;
    case "numPr":
      props.numbering = parseNumbering$1(elem, xml);
      break;
    case "spacing":
      props.lineSpacing = parseLineSpacing(elem, xml);
      return false;
    case "textAlignment":
      props.textAlignment = xml.attr(elem, "val");
      return false;
    case "keepLines":
      props.keepLines = xml.boolAttr(elem, "val", true);
      break;
    case "keepNext":
      props.keepNext = xml.boolAttr(elem, "val", true);
      break;
    case "pageBreakBefore":
      props.pageBreakBefore = xml.boolAttr(elem, "val", true);
      break;
    case "outlineLvl":
      props.outlineLevel = xml.intAttr(elem, "val");
      break;
    case "pStyle":
      props.styleName = xml.attr(elem, "val");
      break;
    case "rPr":
      props.runProps = parseRunProperties(elem, xml);
      break;
    default:
      return false;
  }
  return true;
}
function parseTabs(elem, xml) {
  return xml.elements(elem, "tab").map((e) => ({
    position: xml.lengthAttr(e, "pos"),
    leader: xml.attr(e, "leader"),
    style: xml.attr(e, "val")
  }));
}
function parseNumbering$1(elem, xml) {
  var result = {};
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "numId":
        result.id = xml.attr(e, "val");
        break;
      case "ilvl":
        result.level = xml.intAttr(e, "val");
        break;
    }
  }
  return result;
}
function parseNumberingPart(elem, xml) {
  let result = {
    numberings: [],
    abstractNumberings: [],
    bulletPictures: []
  };
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "num":
        result.numberings.push(parseNumbering(e, xml));
        break;
      case "abstractNum":
        result.abstractNumberings.push(parseAbstractNumbering(e, xml));
        break;
      case "numPicBullet":
        result.bulletPictures.push(parseNumberingBulletPicture(e, xml));
        break;
    }
  }
  return result;
}
function parseNumbering(elem, xml) {
  let result = {
    id: xml.attr(elem, "numId"),
    overrides: []
  };
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "abstractNumId":
        result.abstractId = xml.attr(e, "val");
        break;
      case "lvlOverride":
        result.overrides.push(parseNumberingLevelOverrride(e, xml));
        break;
    }
  }
  return result;
}
function parseAbstractNumbering(elem, xml) {
  let result = {
    id: xml.attr(elem, "abstractNumId"),
    levels: []
  };
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "name":
        result.name = xml.attr(e, "val");
        break;
      case "multiLevelType":
        result.multiLevelType = xml.attr(e, "val");
        break;
      case "numStyleLink":
        result.numberingStyleLink = xml.attr(e, "val");
        break;
      case "styleLink":
        result.styleLink = xml.attr(e, "val");
        break;
      case "lvl":
        result.levels.push(parseNumberingLevel(e, xml));
        break;
    }
  }
  return result;
}
function parseNumberingLevel(elem, xml) {
  let result = {
    level: xml.intAttr(elem, "ilvl")
  };
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "start":
        result.start = xml.attr(e, "val");
        break;
      case "lvlRestart":
        result.restart = xml.intAttr(e, "val");
        break;
      case "numFmt":
        result.format = xml.attr(e, "val");
        break;
      case "lvlText":
        result.text = xml.attr(e, "val");
        break;
      case "lvlJc":
        result.justification = xml.attr(e, "val");
        break;
      case "lvlPicBulletId":
        result.bulletPictureId = xml.attr(e, "val");
        break;
      case "pStyle":
        result.paragraphStyle = xml.attr(e, "val");
        break;
      case "pPr":
        result.paragraphProps = parseParagraphProperties(e, xml);
        break;
      case "rPr":
        result.runProps = parseRunProperties(e, xml);
        break;
    }
  }
  return result;
}
function parseNumberingLevelOverrride(elem, xml) {
  let result = {
    level: xml.intAttr(elem, "ilvl")
  };
  for (let e of xml.elements(elem)) {
    switch (e.localName) {
      case "startOverride":
        result.start = xml.intAttr(e, "val");
        break;
      case "lvl":
        result.numberingLevel = parseNumberingLevel(e, xml);
        break;
    }
  }
  return result;
}
function parseNumberingBulletPicture(elem, xml) {
  var pict = xml.element(elem, "pict");
  var shape = pict && xml.element(pict, "shape");
  var imagedata = shape && xml.element(shape, "imagedata");
  return imagedata ? {
    id: xml.attr(elem, "numPicBulletId"),
    referenceId: xml.attr(imagedata, "id"),
    style: xml.attr(shape, "style")
  } : null;
}
var NumberingPart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
  parseXml(root) {
    Object.assign(this, parseNumberingPart(root, this._package.xmlParser));
    this.domNumberings = this._documentParser.parseNumberingFile(root);
  }
};
var StylesPart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
  parseXml(root) {
    this.styles = this._documentParser.parseStylesFile(root);
  }
};
var DomType;
(function(DomType2) {
  DomType2["Document"] = "document";
  DomType2["Paragraph"] = "paragraph";
  DomType2["Run"] = "run";
  DomType2["Break"] = "break";
  DomType2["NoBreakHyphen"] = "noBreakHyphen";
  DomType2["Table"] = "table";
  DomType2["Row"] = "row";
  DomType2["Cell"] = "cell";
  DomType2["Hyperlink"] = "hyperlink";
  DomType2["SmartTag"] = "smartTag";
  DomType2["Drawing"] = "drawing";
  DomType2["Image"] = "image";
  DomType2["Text"] = "text";
  DomType2["Tab"] = "tab";
  DomType2["Symbol"] = "symbol";
  DomType2["BookmarkStart"] = "bookmarkStart";
  DomType2["BookmarkEnd"] = "bookmarkEnd";
  DomType2["Footer"] = "footer";
  DomType2["Header"] = "header";
  DomType2["FootnoteReference"] = "footnoteReference";
  DomType2["EndnoteReference"] = "endnoteReference";
  DomType2["Footnote"] = "footnote";
  DomType2["Endnote"] = "endnote";
  DomType2["SimpleField"] = "simpleField";
  DomType2["ComplexField"] = "complexField";
  DomType2["Instruction"] = "instruction";
  DomType2["VmlPicture"] = "vmlPicture";
  DomType2["MmlMath"] = "mmlMath";
  DomType2["MmlMathParagraph"] = "mmlMathParagraph";
  DomType2["MmlFraction"] = "mmlFraction";
  DomType2["MmlFunction"] = "mmlFunction";
  DomType2["MmlFunctionName"] = "mmlFunctionName";
  DomType2["MmlNumerator"] = "mmlNumerator";
  DomType2["MmlDenominator"] = "mmlDenominator";
  DomType2["MmlRadical"] = "mmlRadical";
  DomType2["MmlBase"] = "mmlBase";
  DomType2["MmlDegree"] = "mmlDegree";
  DomType2["MmlSuperscript"] = "mmlSuperscript";
  DomType2["MmlSubscript"] = "mmlSubscript";
  DomType2["MmlPreSubSuper"] = "mmlPreSubSuper";
  DomType2["MmlSubArgument"] = "mmlSubArgument";
  DomType2["MmlSuperArgument"] = "mmlSuperArgument";
  DomType2["MmlNary"] = "mmlNary";
  DomType2["MmlDelimiter"] = "mmlDelimiter";
  DomType2["MmlRun"] = "mmlRun";
  DomType2["MmlEquationArray"] = "mmlEquationArray";
  DomType2["MmlLimit"] = "mmlLimit";
  DomType2["MmlLimitLower"] = "mmlLimitLower";
  DomType2["MmlMatrix"] = "mmlMatrix";
  DomType2["MmlMatrixRow"] = "mmlMatrixRow";
  DomType2["MmlBox"] = "mmlBox";
  DomType2["MmlBar"] = "mmlBar";
  DomType2["MmlGroupChar"] = "mmlGroupChar";
  DomType2["VmlElement"] = "vmlElement";
  DomType2["Inserted"] = "inserted";
  DomType2["Deleted"] = "deleted";
  DomType2["DeletedText"] = "deletedText";
  DomType2["Comment"] = "comment";
  DomType2["CommentReference"] = "commentReference";
  DomType2["CommentRangeStart"] = "commentRangeStart";
  DomType2["CommentRangeEnd"] = "commentRangeEnd";
  DomType2["AltChunk"] = "altChunk";
})(DomType || (DomType = {}));
var OpenXmlElementBase = class {
  constructor() {
    this.children = [];
    this.cssStyle = {};
  }
};
var WmlHeader = class extends OpenXmlElementBase {
  constructor() {
    super(...arguments);
    this.type = DomType.Header;
  }
};
var WmlFooter = class extends OpenXmlElementBase {
  constructor() {
    super(...arguments);
    this.type = DomType.Footer;
  }
};
var BaseHeaderFooterPart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
  parseXml(root) {
    this.rootElement = this.createRootElement();
    this.rootElement.children = this._documentParser.parseBodyElements(root);
  }
};
var HeaderPart = class extends BaseHeaderFooterPart {
  createRootElement() {
    return new WmlHeader();
  }
};
var FooterPart = class extends BaseHeaderFooterPart {
  createRootElement() {
    return new WmlFooter();
  }
};
function parseExtendedProps(root, xmlParser) {
  const result = {};
  for (let el of xmlParser.elements(root)) {
    switch (el.localName) {
      case "Template":
        result.template = el.textContent;
        break;
      case "Pages":
        result.pages = safeParseToInt(el.textContent);
        break;
      case "Words":
        result.words = safeParseToInt(el.textContent);
        break;
      case "Characters":
        result.characters = safeParseToInt(el.textContent);
        break;
      case "Application":
        result.application = el.textContent;
        break;
      case "Lines":
        result.lines = safeParseToInt(el.textContent);
        break;
      case "Paragraphs":
        result.paragraphs = safeParseToInt(el.textContent);
        break;
      case "Company":
        result.company = el.textContent;
        break;
      case "AppVersion":
        result.appVersion = el.textContent;
        break;
    }
  }
  return result;
}
function safeParseToInt(value) {
  if (typeof value === "undefined")
    return;
  return parseInt(value);
}
var ExtendedPropsPart = class extends Part {
  parseXml(root) {
    this.props = parseExtendedProps(root, this._package.xmlParser);
  }
};
function parseCoreProps(root, xmlParser) {
  const result = {};
  for (let el of xmlParser.elements(root)) {
    switch (el.localName) {
      case "title":
        result.title = el.textContent;
        break;
      case "description":
        result.description = el.textContent;
        break;
      case "subject":
        result.subject = el.textContent;
        break;
      case "creator":
        result.creator = el.textContent;
        break;
      case "keywords":
        result.keywords = el.textContent;
        break;
      case "language":
        result.language = el.textContent;
        break;
      case "lastModifiedBy":
        result.lastModifiedBy = el.textContent;
        break;
      case "revision":
        el.textContent && (result.revision = parseInt(el.textContent));
        break;
    }
  }
  return result;
}
var CorePropsPart = class extends Part {
  parseXml(root) {
    this.props = parseCoreProps(root, this._package.xmlParser);
  }
};
var DmlTheme = class {
};
function parseTheme(elem, xml) {
  var result = new DmlTheme();
  var themeElements = xml.element(elem, "themeElements");
  for (let el of xml.elements(themeElements)) {
    switch (el.localName) {
      case "clrScheme":
        result.colorScheme = parseColorScheme(el, xml);
        break;
      case "fontScheme":
        result.fontScheme = parseFontScheme(el, xml);
        break;
    }
  }
  return result;
}
function parseColorScheme(elem, xml) {
  var result = {
    name: xml.attr(elem, "name"),
    colors: {}
  };
  for (let el of xml.elements(elem)) {
    var srgbClr = xml.element(el, "srgbClr");
    var sysClr = xml.element(el, "sysClr");
    if (srgbClr) {
      result.colors[el.localName] = xml.attr(srgbClr, "val");
    } else if (sysClr) {
      result.colors[el.localName] = xml.attr(sysClr, "lastClr");
    }
  }
  return result;
}
function parseFontScheme(elem, xml) {
  var result = {
    name: xml.attr(elem, "name")
  };
  for (let el of xml.elements(elem)) {
    switch (el.localName) {
      case "majorFont":
        result.majorFont = parseFontInfo(el, xml);
        break;
      case "minorFont":
        result.minorFont = parseFontInfo(el, xml);
        break;
    }
  }
  return result;
}
function parseFontInfo(elem, xml) {
  return {
    latinTypeface: xml.elementAttr(elem, "latin", "typeface"),
    eaTypeface: xml.elementAttr(elem, "ea", "typeface"),
    csTypeface: xml.elementAttr(elem, "cs", "typeface")
  };
}
var ThemePart = class extends Part {
  constructor(pkg, path) {
    super(pkg, path);
  }
  parseXml(root) {
    this.theme = parseTheme(root, this._package.xmlParser);
  }
};
var WmlBaseNote = class {
};
var WmlFootnote = class extends WmlBaseNote {
  constructor() {
    super(...arguments);
    this.type = DomType.Footnote;
  }
};
var WmlEndnote = class extends WmlBaseNote {
  constructor() {
    super(...arguments);
    this.type = DomType.Endnote;
  }
};
var BaseNotePart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
};
var FootnotesPart = class extends BaseNotePart {
  constructor(pkg, path, parser) {
    super(pkg, path, parser);
  }
  parseXml(root) {
    this.notes = this._documentParser.parseNotes(root, "footnote", WmlFootnote);
  }
};
var EndnotesPart = class extends BaseNotePart {
  constructor(pkg, path, parser) {
    super(pkg, path, parser);
  }
  parseXml(root) {
    this.notes = this._documentParser.parseNotes(root, "endnote", WmlEndnote);
  }
};
function parseSettings(elem, xml) {
  var result = {};
  for (let el of xml.elements(elem)) {
    switch (el.localName) {
      case "defaultTabStop":
        result.defaultTabStop = xml.lengthAttr(el, "val");
        break;
      case "footnotePr":
        result.footnoteProps = parseNoteProperties(el, xml);
        break;
      case "endnotePr":
        result.endnoteProps = parseNoteProperties(el, xml);
        break;
      case "autoHyphenation":
        result.autoHyphenation = xml.boolAttr(el, "val");
        break;
    }
  }
  return result;
}
function parseNoteProperties(elem, xml) {
  var result = {
    defaultNoteIds: []
  };
  for (let el of xml.elements(elem)) {
    switch (el.localName) {
      case "numFmt":
        result.nummeringFormat = xml.attr(el, "val");
        break;
      case "footnote":
      case "endnote":
        result.defaultNoteIds.push(xml.attr(el, "id"));
        break;
    }
  }
  return result;
}
var SettingsPart = class extends Part {
  constructor(pkg, path) {
    super(pkg, path);
  }
  parseXml(root) {
    this.settings = parseSettings(root, this._package.xmlParser);
  }
};
function parseCustomProps(root, xml) {
  return xml.elements(root, "property").map((e) => {
    const firstChild = e.firstChild;
    return {
      formatId: xml.attr(e, "fmtid"),
      name: xml.attr(e, "name"),
      type: firstChild.nodeName,
      value: firstChild.textContent
    };
  });
}
var CustomPropsPart = class extends Part {
  parseXml(root) {
    this.props = parseCustomProps(root, this._package.xmlParser);
  }
};
var CommentsPart = class extends Part {
  constructor(pkg, path, parser) {
    super(pkg, path);
    this._documentParser = parser;
  }
  parseXml(root) {
    this.comments = this._documentParser.parseComments(root);
    this.commentMap = keyBy(this.comments, (x) => x.id);
  }
};
var CommentsExtendedPart = class extends Part {
  constructor(pkg, path) {
    super(pkg, path);
    this.comments = [];
  }
  parseXml(root) {
    const xml = this._package.xmlParser;
    for (let el of xml.elements(root, "commentEx")) {
      this.comments.push({
        paraId: xml.attr(el, "paraId"),
        paraIdParent: xml.attr(el, "paraIdParent"),
        done: xml.boolAttr(el, "done")
      });
    }
    this.commentMap = keyBy(this.comments, (x) => x.paraId);
  }
};
var topLevelRels = [
  { type: RelationshipTypes.OfficeDocument, target: "word/document.xml" },
  { type: RelationshipTypes.ExtendedProperties, target: "docProps/app.xml" },
  { type: RelationshipTypes.CoreProperties, target: "docProps/core.xml" },
  { type: RelationshipTypes.CustomProperties, target: "docProps/custom.xml" }
];
var WordDocument = class _WordDocument {
  constructor() {
    this.parts = [];
    this.partsMap = {};
    this.contentTypes = [];
  }
  static async load(blob, parser, options) {
    var d = new _WordDocument();
    d._options = options;
    d._parser = parser;
    d._package = await OpenXmlPackage.load(blob, options);
    d.rels = await d._package.loadRelationships();
    d.contentTypes = await d._package.loadContentTypes();
    await Promise.all(topLevelRels.map((rel) => {
      const r = d.rels.find((x) => x.type === rel.type) ?? rel;
      return d.loadRelationshipPart(r.target, r.type);
    }));
    return d;
  }
  save(type = "blob") {
    return this._package.save(type);
  }
  async loadRelationshipPart(path, type) {
    if (this.partsMap[path])
      return this.partsMap[path];
    if (!this._package.get(path))
      return null;
    let part = null;
    switch (type) {
      case RelationshipTypes.OfficeDocument:
        this.documentPart = part = new DocumentPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.FontTable:
        this.fontTablePart = part = new FontTablePart(this._package, path);
        break;
      case RelationshipTypes.Numbering:
        this.numberingPart = part = new NumberingPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.Styles:
        this.stylesPart = part = new StylesPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.Theme:
        this.themePart = part = new ThemePart(this._package, path);
        break;
      case RelationshipTypes.Footnotes:
        this.footnotesPart = part = new FootnotesPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.Endnotes:
        this.endnotesPart = part = new EndnotesPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.Footer:
        part = new FooterPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.Header:
        part = new HeaderPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.CoreProperties:
        this.corePropsPart = part = new CorePropsPart(this._package, path);
        break;
      case RelationshipTypes.ExtendedProperties:
        this.extendedPropsPart = part = new ExtendedPropsPart(this._package, path);
        break;
      case RelationshipTypes.CustomProperties:
        part = new CustomPropsPart(this._package, path);
        break;
      case RelationshipTypes.Settings:
        this.settingsPart = part = new SettingsPart(this._package, path);
        break;
      case RelationshipTypes.Comments:
        this.commentsPart = part = new CommentsPart(this._package, path, this._parser);
        break;
      case RelationshipTypes.CommentsExtended:
        this.commentsExtendedPart = part = new CommentsExtendedPart(this._package, path);
        break;
    }
    if (part == null)
      return Promise.resolve(null);
    this.partsMap[path] = part;
    this.parts.push(part);
    await part.load();
    if (part.rels?.length > 0) {
      const [folder] = splitPath(part.path);
      await Promise.all(part.rels.map((rel) => this.loadRelationshipPart(resolvePath(rel.target, folder), rel.type)));
    }
    return part;
  }
  async loadDocumentImage(id, part) {
    const path = this.getPathById(part ?? this.documentPart, id);
    return path ? this.blobToURL(await this._package.load(path, "blob"), path) : null;
  }
  async loadNumberingImage(id) {
    const path = this.getPathById(this.numberingPart, id);
    return path ? this.blobToURL(await this._package.load(path, "blob"), path) : null;
  }
  async loadFont(id, key) {
    const path = this.getPathById(this.fontTablePart, id);
    if (!path)
      return null;
    const x = await this._package.load(path, "uint8array");
    return x ? this.blobToURL(new Blob([deobfuscate(x, key)]), path) : x;
  }
  async loadAltChunk(id, part) {
    const path = this.getPathById(part ?? this.documentPart, id);
    return path ? this._package.load(path, "string") : Promise.resolve(null);
  }
  blobToURL(blob, path) {
    if (!blob)
      return null;
    if (path) {
      const ct = this.contentTypes.find((x) => x.partName === path || x.extension && path.endsWith(`.${x.extension}`));
      blob = ct ? new Blob([blob], { type: ct.contentType }) : blob;
    }
    if (this._options.useBase64URL) {
      return blobToBase64(blob);
    }
    return URL.createObjectURL(blob);
  }
  findPartByRelId(id, basePart = null) {
    var rel = (basePart.rels ?? this.rels).find((r) => r.id == id);
    const folder = basePart ? splitPath(basePart.path)[0] : "";
    return rel ? this.partsMap[resolvePath(rel.target, folder)] : null;
  }
  getPathById(part, id) {
    const rel = part.rels.find((x) => x.id == id);
    const [folder] = splitPath(part.path);
    return rel ? resolvePath(rel.target, folder) : null;
  }
};
function deobfuscate(data, guidKey) {
  const len = 16;
  const trimmed = guidKey.replace(/{|}|-/g, "");
  const numbers = new Array(len);
  for (let i = 0; i < len; i++)
    numbers[len - i - 1] = parseInt(trimmed.substring(i * 2, i * 2 + 2), 16);
  for (let i = 0; i < 32; i++)
    data[i] = data[i] ^ numbers[i % len];
  return data;
}
function parseBookmarkStart(elem, xml) {
  return {
    type: DomType.BookmarkStart,
    id: xml.attr(elem, "id"),
    name: xml.attr(elem, "name"),
    colFirst: xml.intAttr(elem, "colFirst"),
    colLast: xml.intAttr(elem, "colLast")
  };
}
function parseBookmarkEnd(elem, xml) {
  return {
    type: DomType.BookmarkEnd,
    id: xml.attr(elem, "id")
  };
}
var VmlElement = class extends OpenXmlElementBase {
  constructor() {
    super(...arguments);
    this.type = DomType.VmlElement;
    this.attrs = {};
  }
};
function parseVmlElement(elem, parser) {
  var result = new VmlElement();
  switch (elem.localName) {
    case "rect":
      result.tagName = "rect";
      Object.assign(result.attrs, { width: "100%", height: "100%" });
      break;
    case "oval":
      result.tagName = "ellipse";
      Object.assign(result.attrs, { cx: "50%", cy: "50%", rx: "50%", ry: "50%" });
      break;
    case "line":
      result.tagName = "line";
      break;
    case "shape":
      result.tagName = "g";
      break;
    case "textbox":
      result.tagName = "foreignObject";
      Object.assign(result.attrs, { width: "100%", height: "100%" });
      break;
    default:
      return null;
  }
  for (const at of globalXmlParser.attrs(elem)) {
    switch (at.localName) {
      case "style":
        result.cssStyleText = at.value;
        break;
      case "fillcolor":
        result.attrs.fill = at.value;
        break;
      case "from":
        const [x1, y1] = parsePoint(at.value);
        Object.assign(result.attrs, { x1, y1 });
        break;
      case "to":
        const [x2, y2] = parsePoint(at.value);
        Object.assign(result.attrs, { x2, y2 });
        break;
    }
  }
  for (const el of globalXmlParser.elements(elem)) {
    switch (el.localName) {
      case "stroke":
        Object.assign(result.attrs, parseStroke(el));
        break;
      case "fill":
        Object.assign(result.attrs, parseFill());
        break;
      case "imagedata":
        result.tagName = "image";
        Object.assign(result.attrs, { width: "100%", height: "100%" });
        result.imageHref = {
          id: globalXmlParser.attr(el, "id"),
          title: globalXmlParser.attr(el, "title")
        };
        break;
      case "txbxContent":
        result.children.push(...parser.parseBodyElements(el));
        break;
      default:
        const child = parseVmlElement(el, parser);
        child && result.children.push(child);
        break;
    }
  }
  return result;
}
function parseStroke(el) {
  return {
    "stroke": globalXmlParser.attr(el, "color"),
    "stroke-width": globalXmlParser.lengthAttr(el, "weight", LengthUsage.Emu) ?? "1px"
  };
}
function parseFill(el) {
  return {};
}
function parsePoint(val) {
  return val.split(",");
}
var WmlComment = class extends OpenXmlElementBase {
  constructor() {
    super(...arguments);
    this.type = DomType.Comment;
  }
};
var WmlCommentReference = class extends OpenXmlElementBase {
  constructor(id) {
    super();
    this.id = id;
    this.type = DomType.CommentReference;
  }
};
var WmlCommentRangeStart = class extends OpenXmlElementBase {
  constructor(id) {
    super();
    this.id = id;
    this.type = DomType.CommentRangeStart;
  }
};
var WmlCommentRangeEnd = class extends OpenXmlElementBase {
  constructor(id) {
    super();
    this.id = id;
    this.type = DomType.CommentRangeEnd;
  }
};
var autos = {
  shd: "inherit",
  color: "black",
  borderColor: "black",
  highlight: "transparent"
};
var supportedNamespaceURIs = [];
var mmlTagMap = {
  "oMath": DomType.MmlMath,
  "oMathPara": DomType.MmlMathParagraph,
  "f": DomType.MmlFraction,
  "func": DomType.MmlFunction,
  "fName": DomType.MmlFunctionName,
  "num": DomType.MmlNumerator,
  "den": DomType.MmlDenominator,
  "rad": DomType.MmlRadical,
  "deg": DomType.MmlDegree,
  "e": DomType.MmlBase,
  "sSup": DomType.MmlSuperscript,
  "sSub": DomType.MmlSubscript,
  "sPre": DomType.MmlPreSubSuper,
  "sup": DomType.MmlSuperArgument,
  "sub": DomType.MmlSubArgument,
  "d": DomType.MmlDelimiter,
  "nary": DomType.MmlNary,
  "eqArr": DomType.MmlEquationArray,
  "lim": DomType.MmlLimit,
  "limLow": DomType.MmlLimitLower,
  "m": DomType.MmlMatrix,
  "mr": DomType.MmlMatrixRow,
  "box": DomType.MmlBox,
  "bar": DomType.MmlBar,
  "groupChr": DomType.MmlGroupChar
};
var DocumentParser = class {
  constructor(options) {
    this.options = {
      ignoreWidth: false,
      debug: false,
      ...options
    };
  }
  parseNotes(xmlDoc, elemName, elemClass) {
    var result = [];
    for (let el of globalXmlParser.elements(xmlDoc, elemName)) {
      const node = new elemClass();
      node.id = globalXmlParser.attr(el, "id");
      node.noteType = globalXmlParser.attr(el, "type");
      node.children = this.parseBodyElements(el);
      result.push(node);
    }
    return result;
  }
  parseComments(xmlDoc) {
    var result = [];
    for (let el of globalXmlParser.elements(xmlDoc, "comment")) {
      const item = new WmlComment();
      item.id = globalXmlParser.attr(el, "id");
      item.author = globalXmlParser.attr(el, "author");
      item.initials = globalXmlParser.attr(el, "initials");
      item.date = globalXmlParser.attr(el, "date");
      item.children = this.parseBodyElements(el);
      result.push(item);
    }
    return result;
  }
  parseDocumentFile(xmlDoc) {
    var xbody = globalXmlParser.element(xmlDoc, "body");
    var background = globalXmlParser.element(xmlDoc, "background");
    var sectPr = globalXmlParser.element(xbody, "sectPr");
    return {
      type: DomType.Document,
      children: this.parseBodyElements(xbody),
      props: sectPr ? parseSectionProperties(sectPr, globalXmlParser) : {},
      cssStyle: background ? this.parseBackground(background) : {}
    };
  }
  parseBackground(elem) {
    var result = {};
    var color = xmlUtil.colorAttr(elem, "color");
    if (color) {
      result["background-color"] = color;
    }
    return result;
  }
  parseBodyElements(element) {
    var children = [];
    for (const elem of globalXmlParser.elements(element)) {
      switch (elem.localName) {
        case "p":
          children.push(this.parseParagraph(elem));
          break;
        case "altChunk":
          children.push(this.parseAltChunk(elem));
          break;
        case "tbl":
          children.push(this.parseTable(elem));
          break;
        case "sdt":
          children.push(...this.parseSdt(elem, (e) => this.parseBodyElements(e)));
          break;
      }
    }
    return children;
  }
  parseStylesFile(xstyles) {
    var result = [];
    for (const n of globalXmlParser.elements(xstyles)) {
      switch (n.localName) {
        case "style":
          result.push(this.parseStyle(n));
          break;
        case "docDefaults":
          result.push(this.parseDefaultStyles(n));
          break;
      }
    }
    return result;
  }
  parseDefaultStyles(node) {
    var result = {
      id: null,
      name: null,
      target: null,
      basedOn: null,
      styles: []
    };
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "rPrDefault":
          var rPr = globalXmlParser.element(c, "rPr");
          if (rPr)
            result.styles.push({
              target: "span",
              values: this.parseDefaultProperties(rPr, {})
            });
          break;
        case "pPrDefault":
          var pPr = globalXmlParser.element(c, "pPr");
          if (pPr)
            result.styles.push({
              target: "p",
              values: this.parseDefaultProperties(pPr, {})
            });
          break;
      }
    }
    return result;
  }
  parseStyle(node) {
    var result = {
      id: globalXmlParser.attr(node, "styleId"),
      isDefault: globalXmlParser.boolAttr(node, "default"),
      name: null,
      target: null,
      basedOn: null,
      styles: [],
      linked: null
    };
    switch (globalXmlParser.attr(node, "type")) {
      case "paragraph":
        result.target = "p";
        break;
      case "table":
        result.target = "table";
        break;
      case "character":
        result.target = "span";
        break;
    }
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "basedOn":
          result.basedOn = globalXmlParser.attr(n, "val");
          break;
        case "name":
          result.name = globalXmlParser.attr(n, "val");
          break;
        case "link":
          result.linked = globalXmlParser.attr(n, "val");
          break;
        case "next":
          result.next = globalXmlParser.attr(n, "val");
          break;
        case "aliases":
          result.aliases = globalXmlParser.attr(n, "val").split(",");
          break;
        case "pPr":
          result.styles.push({
            target: "p",
            values: this.parseDefaultProperties(n, {})
          });
          result.paragraphProps = parseParagraphProperties(n, globalXmlParser);
          break;
        case "rPr":
          result.styles.push({
            target: "span",
            values: this.parseDefaultProperties(n, {})
          });
          result.runProps = parseRunProperties(n, globalXmlParser);
          break;
        case "tblPr":
        case "tcPr":
          result.styles.push({
            target: "td",
            values: this.parseDefaultProperties(n, {})
          });
          break;
        case "tblStylePr":
          for (let s of this.parseTableStyle(n))
            result.styles.push(s);
          break;
        case "rsid":
        case "qFormat":
        case "hidden":
        case "semiHidden":
        case "unhideWhenUsed":
        case "autoRedefine":
        case "uiPriority":
          break;
        default:
          this.options.debug && console.warn(`DOCX: Unknown style element: ${n.localName}`);
      }
    }
    return result;
  }
  parseTableStyle(node) {
    var result = [];
    var type = globalXmlParser.attr(node, "type");
    var selector = "";
    var modificator = "";
    switch (type) {
      case "firstRow":
        modificator = ".first-row";
        selector = "tr.first-row td";
        break;
      case "lastRow":
        modificator = ".last-row";
        selector = "tr.last-row td";
        break;
      case "firstCol":
        modificator = ".first-col";
        selector = "td.first-col";
        break;
      case "lastCol":
        modificator = ".last-col";
        selector = "td.last-col";
        break;
      case "band1Vert":
        modificator = ":not(.no-vband)";
        selector = "td.odd-col";
        break;
      case "band2Vert":
        modificator = ":not(.no-vband)";
        selector = "td.even-col";
        break;
      case "band1Horz":
        modificator = ":not(.no-hband)";
        selector = "tr.odd-row";
        break;
      case "band2Horz":
        modificator = ":not(.no-hband)";
        selector = "tr.even-row";
        break;
      default:
        return [];
    }
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "pPr":
          result.push({
            target: `${selector} p`,
            mod: modificator,
            values: this.parseDefaultProperties(n, {})
          });
          break;
        case "rPr":
          result.push({
            target: `${selector} span`,
            mod: modificator,
            values: this.parseDefaultProperties(n, {})
          });
          break;
        case "tblPr":
        case "tcPr":
          result.push({
            target: selector,
            mod: modificator,
            values: this.parseDefaultProperties(n, {})
          });
          break;
      }
    }
    return result;
  }
  parseNumberingFile(node) {
    const levels = [];
    const nums = [];
    const bullets = [];
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "abstractNum":
          levels.push(...this.parseAbstractNumbering(n, bullets));
          break;
        case "numPicBullet":
          bullets.push(this.parseNumberingPicBullet(n));
          break;
        case "num":
          nums.push({
            numId: globalXmlParser.attr(n, "numId"),
            abstractNumId: globalXmlParser.elementAttr(n, "abstractNumId", "val")
          });
          break;
      }
    }
    return nums.flatMap((x) => levels.filter((lvl) => x.abstractNumId == lvl.id).map((lvl) => ({ ...lvl, id: x.numId })));
  }
  parseNumberingPicBullet(elem) {
    var pict = globalXmlParser.element(elem, "pict");
    var shape = pict && globalXmlParser.element(pict, "shape");
    var imagedata = shape && globalXmlParser.element(shape, "imagedata");
    return imagedata ? {
      id: globalXmlParser.intAttr(elem, "numPicBulletId"),
      src: globalXmlParser.attr(imagedata, "id"),
      style: globalXmlParser.attr(shape, "style")
    } : null;
  }
  parseAbstractNumbering(node, bullets) {
    var result = [];
    var id = globalXmlParser.attr(node, "abstractNumId");
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "lvl":
          result.push(this.parseNumberingLevel(id, n, bullets));
          break;
      }
    }
    return result;
  }
  parseNumberingLevel(id, node, bullets) {
    var result = {
      id,
      level: globalXmlParser.intAttr(node, "ilvl"),
      start: 1,
      pStyleName: void 0,
      pStyle: {},
      rStyle: {},
      suff: "tab"
    };
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "start":
          result.start = globalXmlParser.intAttr(n, "val");
          break;
        case "pPr":
          this.parseDefaultProperties(n, result.pStyle);
          break;
        case "rPr":
          this.parseDefaultProperties(n, result.rStyle);
          break;
        case "lvlPicBulletId":
          var bulletId = globalXmlParser.intAttr(n, "val");
          result.bullet = bullets.find((x) => x?.id == bulletId);
          break;
        case "lvlText":
          result.levelText = globalXmlParser.attr(n, "val");
          break;
        case "pStyle":
          result.pStyleName = globalXmlParser.attr(n, "val");
          break;
        case "numFmt":
          result.format = globalXmlParser.attr(n, "val");
          break;
        case "suff":
          result.suff = globalXmlParser.attr(n, "val");
          break;
      }
    }
    return result;
  }
  parseSdt(node, parser) {
    const sdtContent = globalXmlParser.element(node, "sdtContent");
    return sdtContent ? parser(sdtContent) : [];
  }
  parseChange(type, node, parentParser) {
    return {
      type,
      children: parentParser(node)?.children ?? [],
      id: globalXmlParser.attr(node, "id"),
      author: globalXmlParser.attr(node, "author"),
      date: globalXmlParser.attr(node, "date")
    };
  }
  parseAltChunk(node) {
    return { type: DomType.AltChunk, children: [], id: globalXmlParser.attr(node, "id") };
  }
  parseParagraph(node) {
    var result = { type: DomType.Paragraph, children: [] };
    for (let el of globalXmlParser.elements(node)) {
      switch (el.localName) {
        case "pPr":
          this.parseParagraphProperties(el, result);
          break;
        case "r":
          result.children.push(this.parseRun(el, result));
          break;
        case "hyperlink":
          result.children.push(this.parseHyperlink(el, result));
          break;
        case "smartTag":
          result.children.push(this.parseSmartTag(el, result));
          break;
        case "bookmarkStart":
          result.children.push(parseBookmarkStart(el, globalXmlParser));
          break;
        case "bookmarkEnd":
          result.children.push(parseBookmarkEnd(el, globalXmlParser));
          break;
        case "commentRangeStart":
          result.children.push(new WmlCommentRangeStart(globalXmlParser.attr(el, "id")));
          break;
        case "commentRangeEnd":
          result.children.push(new WmlCommentRangeEnd(globalXmlParser.attr(el, "id")));
          break;
        case "oMath":
        case "oMathPara":
          result.children.push(this.parseMathElement(el));
          break;
        case "sdt":
          result.children.push(...this.parseSdt(el, (e) => this.parseParagraph(e).children));
          break;
        case "ins":
          result.children.push(this.parseChange(DomType.Inserted, el, (e) => this.parseParagraph(e)));
          break;
        case "del":
          result.children.push(this.parseChange(DomType.Deleted, el, (e) => this.parseParagraph(e)));
          break;
      }
    }
    return result;
  }
  parseParagraphProperties(elem, paragraph) {
    this.parseDefaultProperties(elem, paragraph.cssStyle = {}, null, (c) => {
      if (parseParagraphProperty(c, paragraph, globalXmlParser))
        return true;
      switch (c.localName) {
        case "pStyle":
          paragraph.styleName = globalXmlParser.attr(c, "val");
          break;
        case "cnfStyle":
          paragraph.className = values.classNameOfCnfStyle(c);
          break;
        case "framePr":
          this.parseFrame(c, paragraph);
          break;
        case "rPr":
          break;
        default:
          return false;
      }
      return true;
    });
  }
  parseFrame(node, paragraph) {
    var dropCap = globalXmlParser.attr(node, "dropCap");
    if (dropCap == "drop")
      paragraph.cssStyle["float"] = "left";
  }
  parseHyperlink(node, parent) {
    var result = { type: DomType.Hyperlink, parent, children: [] };
    result.anchor = globalXmlParser.attr(node, "anchor");
    result.id = globalXmlParser.attr(node, "id");
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "r":
          result.children.push(this.parseRun(c, result));
          break;
      }
    }
    return result;
  }
  parseSmartTag(node, parent) {
    var result = { type: DomType.SmartTag, parent, children: [] };
    var uri = globalXmlParser.attr(node, "uri");
    var element = globalXmlParser.attr(node, "element");
    if (uri)
      result.uri = uri;
    if (element)
      result.element = element;
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "r":
          result.children.push(this.parseRun(c, result));
          break;
        case "smartTag":
          result.children.push(this.parseSmartTag(c, result));
          break;
      }
    }
    return result;
  }
  parseRun(node, parent) {
    var result = { type: DomType.Run, parent, children: [] };
    for (let c of globalXmlParser.elements(node)) {
      c = this.checkAlternateContent(c);
      switch (c.localName) {
        case "t":
          result.children.push({
            type: DomType.Text,
            text: c.textContent
          });
          break;
        case "delText":
          result.children.push({
            type: DomType.DeletedText,
            text: c.textContent
          });
          break;
        case "commentReference":
          result.children.push(new WmlCommentReference(globalXmlParser.attr(c, "id")));
          break;
        case "fldSimple":
          result.children.push({
            type: DomType.SimpleField,
            instruction: globalXmlParser.attr(c, "instr"),
            lock: globalXmlParser.boolAttr(c, "lock", false),
            dirty: globalXmlParser.boolAttr(c, "dirty", false)
          });
          break;
        case "instrText":
          result.fieldRun = true;
          result.children.push({
            type: DomType.Instruction,
            text: c.textContent
          });
          break;
        case "fldChar":
          result.fieldRun = true;
          result.children.push({
            type: DomType.ComplexField,
            charType: globalXmlParser.attr(c, "fldCharType"),
            lock: globalXmlParser.boolAttr(c, "lock", false),
            dirty: globalXmlParser.boolAttr(c, "dirty", false)
          });
          break;
        case "noBreakHyphen":
          result.children.push({ type: DomType.NoBreakHyphen });
          break;
        case "br":
          result.children.push({
            type: DomType.Break,
            break: globalXmlParser.attr(c, "type") || "textWrapping"
          });
          break;
        case "lastRenderedPageBreak":
          result.children.push({
            type: DomType.Break,
            break: "lastRenderedPageBreak"
          });
          break;
        case "sym":
          result.children.push({
            type: DomType.Symbol,
            font: encloseFontFamily(globalXmlParser.attr(c, "font")),
            char: globalXmlParser.hexAttr(c, "char")
          });
          break;
        case "tab":
          result.children.push({ type: DomType.Tab });
          break;
        case "footnoteReference":
          result.children.push({
            type: DomType.FootnoteReference,
            id: globalXmlParser.attr(c, "id")
          });
          break;
        case "endnoteReference":
          result.children.push({
            type: DomType.EndnoteReference,
            id: globalXmlParser.attr(c, "id")
          });
          break;
        case "drawing":
          let d = this.parseDrawing(c);
          if (d)
            result.children.push(d);
          break;
        case "pict":
          result.children.push(this.parseVmlPicture(c));
          break;
        case "rPr":
          this.parseRunProperties(c, result);
          break;
      }
    }
    return result;
  }
  parseMathElement(elem) {
    const propsTag = `${elem.localName}Pr`;
    const result = { type: mmlTagMap[elem.localName], children: [] };
    for (const el of globalXmlParser.elements(elem)) {
      const childType = mmlTagMap[el.localName];
      if (childType) {
        result.children.push(this.parseMathElement(el));
      } else if (el.localName == "r") {
        var run = this.parseRun(el);
        run.type = DomType.MmlRun;
        result.children.push(run);
      } else if (el.localName == propsTag) {
        result.props = this.parseMathProperies(el);
      }
    }
    return result;
  }
  parseMathProperies(elem) {
    const result = {};
    for (const el of globalXmlParser.elements(elem)) {
      switch (el.localName) {
        case "chr":
          result.char = globalXmlParser.attr(el, "val");
          break;
        case "vertJc":
          result.verticalJustification = globalXmlParser.attr(el, "val");
          break;
        case "pos":
          result.position = globalXmlParser.attr(el, "val");
          break;
        case "degHide":
          result.hideDegree = globalXmlParser.boolAttr(el, "val");
          break;
        case "begChr":
          result.beginChar = globalXmlParser.attr(el, "val");
          break;
        case "endChr":
          result.endChar = globalXmlParser.attr(el, "val");
          break;
      }
    }
    return result;
  }
  parseRunProperties(elem, run) {
    this.parseDefaultProperties(elem, run.cssStyle = {}, null, (c) => {
      switch (c.localName) {
        case "rStyle":
          run.styleName = globalXmlParser.attr(c, "val");
          break;
        case "vertAlign":
          run.verticalAlign = values.valueOfVertAlign(c, true);
          break;
        default:
          return false;
      }
      return true;
    });
  }
  parseVmlPicture(elem) {
    const result = { type: DomType.VmlPicture, children: [] };
    for (const el of globalXmlParser.elements(elem)) {
      const child = parseVmlElement(el, this);
      child && result.children.push(child);
    }
    return result;
  }
  checkAlternateContent(elem) {
    if (elem.localName != "AlternateContent")
      return elem;
    var choice = globalXmlParser.element(elem, "Choice");
    if (choice) {
      var requires = globalXmlParser.attr(choice, "Requires");
      var namespaceURI = elem.lookupNamespaceURI(requires);
      if (supportedNamespaceURIs.includes(namespaceURI))
        return choice.firstElementChild;
    }
    return globalXmlParser.element(elem, "Fallback")?.firstElementChild;
  }
  parseDrawing(node) {
    for (var n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "inline":
        case "anchor":
          return this.parseDrawingWrapper(n);
      }
    }
  }
  parseDrawingWrapper(node) {
    var result = { type: DomType.Drawing, children: [], cssStyle: {} };
    var isAnchor = node.localName == "anchor";
    let wrapType = null;
    let simplePos = globalXmlParser.boolAttr(node, "simplePos");
    globalXmlParser.boolAttr(node, "behindDoc");
    let posX = { relative: "page", align: "left", offset: "0" };
    let posY = { relative: "page", align: "top", offset: "0" };
    for (var n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "simplePos":
          if (simplePos) {
            posX.offset = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
            posY.offset = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
          }
          break;
        case "extent":
          result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
          result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
          break;
        case "positionH":
        case "positionV":
          if (!simplePos) {
            let pos = n.localName == "positionH" ? posX : posY;
            var alignNode = globalXmlParser.element(n, "align");
            var offsetNode = globalXmlParser.element(n, "posOffset");
            pos.relative = globalXmlParser.attr(n, "relativeFrom") ?? pos.relative;
            if (alignNode)
              pos.align = alignNode.textContent;
            if (offsetNode)
              pos.offset = convertLength(offsetNode.textContent, LengthUsage.Emu);
          }
          break;
        case "wrapTopAndBottom":
          wrapType = "wrapTopAndBottom";
          break;
        case "wrapNone":
          wrapType = "wrapNone";
          break;
        case "graphic":
          var g = this.parseGraphic(n);
          if (g)
            result.children.push(g);
          break;
      }
    }
    if (wrapType == "wrapTopAndBottom") {
      result.cssStyle["display"] = "block";
      if (posX.align) {
        result.cssStyle["text-align"] = posX.align;
        result.cssStyle["width"] = "100%";
      }
    } else if (wrapType == "wrapNone") {
      result.cssStyle["display"] = "block";
      result.cssStyle["position"] = "relative";
      result.cssStyle["width"] = "0px";
      result.cssStyle["height"] = "0px";
      if (posX.offset)
        result.cssStyle["left"] = posX.offset;
      if (posY.offset)
        result.cssStyle["top"] = posY.offset;
    } else if (isAnchor && (posX.align == "left" || posX.align == "right")) {
      result.cssStyle["float"] = posX.align;
    }
    return result;
  }
  parseGraphic(elem) {
    var graphicData = globalXmlParser.element(elem, "graphicData");
    for (let n of globalXmlParser.elements(graphicData)) {
      switch (n.localName) {
        case "pic":
          return this.parsePicture(n);
      }
    }
    return null;
  }
  parsePicture(elem) {
    var result = { type: DomType.Image, src: "", cssStyle: {} };
    var blipFill = globalXmlParser.element(elem, "blipFill");
    var blip = globalXmlParser.element(blipFill, "blip");
    var srcRect = globalXmlParser.element(blipFill, "srcRect");
    result.src = globalXmlParser.attr(blip, "embed");
    if (srcRect) {
      result.srcRect = [
        globalXmlParser.intAttr(srcRect, "l", 0) / 1e5,
        globalXmlParser.intAttr(srcRect, "t", 0) / 1e5,
        globalXmlParser.intAttr(srcRect, "r", 0) / 1e5,
        globalXmlParser.intAttr(srcRect, "b", 0) / 1e5
      ];
    }
    var spPr = globalXmlParser.element(elem, "spPr");
    var xfrm = globalXmlParser.element(spPr, "xfrm");
    result.cssStyle["position"] = "relative";
    if (xfrm) {
      result.rotation = globalXmlParser.intAttr(xfrm, "rot", 0) / 6e4;
      for (var n of globalXmlParser.elements(xfrm)) {
        switch (n.localName) {
          case "ext":
            result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
            result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
            break;
          case "off":
            result.cssStyle["left"] = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
            result.cssStyle["top"] = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
            break;
        }
      }
    }
    return result;
  }
  parseTable(node) {
    var result = { type: DomType.Table, children: [] };
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "tr":
          result.children.push(this.parseTableRow(c));
          break;
        case "tblGrid":
          result.columns = this.parseTableColumns(c);
          break;
        case "tblPr":
          this.parseTableProperties(c, result);
          break;
      }
    }
    return result;
  }
  parseTableColumns(node) {
    var result = [];
    for (const n of globalXmlParser.elements(node)) {
      switch (n.localName) {
        case "gridCol":
          result.push({ width: globalXmlParser.lengthAttr(n, "w") });
          break;
      }
    }
    return result;
  }
  parseTableProperties(elem, table) {
    table.cssStyle = {};
    table.cellStyle = {};
    this.parseDefaultProperties(elem, table.cssStyle, table.cellStyle, (c) => {
      switch (c.localName) {
        case "tblStyle":
          table.styleName = globalXmlParser.attr(c, "val");
          break;
        case "tblLook":
          table.className = values.classNameOftblLook(c);
          break;
        case "tblpPr":
          this.parseTablePosition(c, table);
          break;
        case "tblStyleColBandSize":
          table.colBandSize = globalXmlParser.intAttr(c, "val");
          break;
        case "tblStyleRowBandSize":
          table.rowBandSize = globalXmlParser.intAttr(c, "val");
          break;
        case "hidden":
          table.cssStyle["display"] = "none";
          break;
        default:
          return false;
      }
      return true;
    });
    switch (table.cssStyle["text-align"]) {
      case "center":
        delete table.cssStyle["text-align"];
        table.cssStyle["margin-left"] = "auto";
        table.cssStyle["margin-right"] = "auto";
        break;
      case "right":
        delete table.cssStyle["text-align"];
        table.cssStyle["margin-left"] = "auto";
        break;
    }
  }
  parseTablePosition(node, table) {
    var topFromText = globalXmlParser.lengthAttr(node, "topFromText");
    var bottomFromText = globalXmlParser.lengthAttr(node, "bottomFromText");
    var rightFromText = globalXmlParser.lengthAttr(node, "rightFromText");
    var leftFromText = globalXmlParser.lengthAttr(node, "leftFromText");
    table.cssStyle["float"] = "left";
    table.cssStyle["margin-bottom"] = values.addSize(table.cssStyle["margin-bottom"], bottomFromText);
    table.cssStyle["margin-left"] = values.addSize(table.cssStyle["margin-left"], leftFromText);
    table.cssStyle["margin-right"] = values.addSize(table.cssStyle["margin-right"], rightFromText);
    table.cssStyle["margin-top"] = values.addSize(table.cssStyle["margin-top"], topFromText);
  }
  parseTableRow(node) {
    var result = { type: DomType.Row, children: [] };
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "tc":
          result.children.push(this.parseTableCell(c));
          break;
        case "trPr":
        case "tblPrEx":
          this.parseTableRowProperties(c, result);
          break;
      }
    }
    return result;
  }
  parseTableRowProperties(elem, row) {
    row.cssStyle = this.parseDefaultProperties(elem, {}, null, (c) => {
      switch (c.localName) {
        case "cnfStyle":
          row.className = values.classNameOfCnfStyle(c);
          break;
        case "tblHeader":
          row.isHeader = globalXmlParser.boolAttr(c, "val");
          break;
        case "gridBefore":
          row.gridBefore = globalXmlParser.intAttr(c, "val");
          break;
        case "gridAfter":
          row.gridAfter = globalXmlParser.intAttr(c, "val");
          break;
        default:
          return false;
      }
      return true;
    });
  }
  parseTableCell(node) {
    var result = { type: DomType.Cell, children: [] };
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "tbl":
          result.children.push(this.parseTable(c));
          break;
        case "p":
          result.children.push(this.parseParagraph(c));
          break;
        case "tcPr":
          this.parseTableCellProperties(c, result);
          break;
      }
    }
    return result;
  }
  parseTableCellProperties(elem, cell) {
    cell.cssStyle = this.parseDefaultProperties(elem, {}, null, (c) => {
      switch (c.localName) {
        case "gridSpan":
          cell.span = globalXmlParser.intAttr(c, "val", null);
          break;
        case "vMerge":
          cell.verticalMerge = globalXmlParser.attr(c, "val") ?? "continue";
          break;
        case "cnfStyle":
          cell.className = values.classNameOfCnfStyle(c);
          break;
        default:
          return false;
      }
      return true;
    });
    this.parseTableCellVerticalText(elem, cell);
  }
  parseTableCellVerticalText(elem, cell) {
    const directionMap = {
      "btLr": {
        writingMode: "vertical-rl",
        transform: "rotate(180deg)"
      },
      "lrTb": {
        writingMode: "vertical-lr",
        transform: "none"
      },
      "tbRl": {
        writingMode: "vertical-rl",
        transform: "none"
      }
    };
    for (const c of globalXmlParser.elements(elem)) {
      if (c.localName === "textDirection") {
        const direction = globalXmlParser.attr(c, "val");
        const style = directionMap[direction] || { writingMode: "horizontal-tb" };
        cell.cssStyle["writing-mode"] = style.writingMode;
        cell.cssStyle["transform"] = style.transform;
      }
    }
  }
  parseDefaultProperties(elem, style = null, childStyle = null, handler = null) {
    style = style || {};
    for (const c of globalXmlParser.elements(elem)) {
      if (handler?.(c))
        continue;
      switch (c.localName) {
        case "jc":
          style["text-align"] = values.valueOfJc(c);
          break;
        case "textAlignment":
          style["vertical-align"] = values.valueOfTextAlignment(c);
          break;
        case "color":
          style["color"] = xmlUtil.colorAttr(c, "val", null, autos.color);
          break;
        case "sz":
          style["font-size"] = style["min-height"] = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
          break;
        case "shd":
          style["background-color"] = xmlUtil.colorAttr(c, "fill", null, autos.shd);
          break;
        case "highlight":
          style["background-color"] = xmlUtil.colorAttr(c, "val", null, autos.highlight);
          break;
        case "vertAlign":
          break;
        case "position":
          style.verticalAlign = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
          break;
        case "tcW":
          if (this.options.ignoreWidth)
            break;
        case "tblW":
          style["width"] = values.valueOfSize(c, "w");
          break;
        case "trHeight":
          this.parseTrHeight(c, style);
          break;
        case "strike":
          style["text-decoration"] = globalXmlParser.boolAttr(c, "val", true) ? "line-through" : "none";
          break;
        case "b":
          style["font-weight"] = globalXmlParser.boolAttr(c, "val", true) ? "bold" : "normal";
          break;
        case "i":
          style["font-style"] = globalXmlParser.boolAttr(c, "val", true) ? "italic" : "normal";
          break;
        case "caps":
          style["text-transform"] = globalXmlParser.boolAttr(c, "val", true) ? "uppercase" : "none";
          break;
        case "smallCaps":
          style["font-variant"] = globalXmlParser.boolAttr(c, "val", true) ? "small-caps" : "none";
          break;
        case "u":
          this.parseUnderline(c, style);
          break;
        case "ind":
        case "tblInd":
          this.parseIndentation(c, style);
          break;
        case "rFonts":
          this.parseFont(c, style);
          break;
        case "tblBorders":
          this.parseBorderProperties(c, childStyle || style);
          break;
        case "tblCellSpacing":
          style["border-spacing"] = values.valueOfMargin(c);
          style["border-collapse"] = "separate";
          break;
        case "pBdr":
          this.parseBorderProperties(c, style);
          break;
        case "bdr":
          style["border"] = values.valueOfBorder(c);
          break;
        case "tcBorders":
          this.parseBorderProperties(c, style);
          break;
        case "vanish":
          if (globalXmlParser.boolAttr(c, "val", true))
            style["display"] = "none";
          break;
        case "kern":
          break;
        case "noWrap":
          break;
        case "tblCellMar":
        case "tcMar":
          this.parseMarginProperties(c, childStyle || style);
          break;
        case "tblLayout":
          style["table-layout"] = values.valueOfTblLayout(c);
          break;
        case "vAlign":
          style["vertical-align"] = values.valueOfTextAlignment(c);
          break;
        case "spacing":
          if (elem.localName == "pPr")
            this.parseSpacing(c, style);
          break;
        case "wordWrap":
          if (globalXmlParser.boolAttr(c, "val"))
            style["overflow-wrap"] = "break-word";
          break;
        case "suppressAutoHyphens":
          style["hyphens"] = globalXmlParser.boolAttr(c, "val", true) ? "none" : "auto";
          break;
        case "lang":
          style["$lang"] = globalXmlParser.attr(c, "val");
          break;
        case "rtl":
        case "bidi":
          if (globalXmlParser.boolAttr(c, "val", true))
            style["direction"] = "rtl";
          break;
        case "bCs":
        case "iCs":
        case "szCs":
        case "tabs":
        case "outlineLvl":
        case "contextualSpacing":
        case "tblStyleColBandSize":
        case "tblStyleRowBandSize":
        case "webHidden":
        case "pageBreakBefore":
        case "suppressLineNumbers":
        case "keepLines":
        case "keepNext":
        case "widowControl":
        case "noProof":
          break;
        default:
          if (this.options.debug)
            console.warn(`DOCX: Unknown document element: ${elem.localName}.${c.localName}`);
          break;
      }
    }
    return style;
  }
  parseUnderline(node, style) {
    var val = globalXmlParser.attr(node, "val");
    if (val == null)
      return;
    switch (val) {
      case "dash":
      case "dashDotDotHeavy":
      case "dashDotHeavy":
      case "dashedHeavy":
      case "dashLong":
      case "dashLongHeavy":
      case "dotDash":
      case "dotDotDash":
        style["text-decoration"] = "underline dashed";
        break;
      case "dotted":
      case "dottedHeavy":
        style["text-decoration"] = "underline dotted";
        break;
      case "double":
        style["text-decoration"] = "underline double";
        break;
      case "single":
      case "thick":
        style["text-decoration"] = "underline";
        break;
      case "wave":
      case "wavyDouble":
      case "wavyHeavy":
        style["text-decoration"] = "underline wavy";
        break;
      case "words":
        style["text-decoration"] = "underline";
        break;
      case "none":
        style["text-decoration"] = "none";
        break;
    }
    var col = xmlUtil.colorAttr(node, "color");
    if (col)
      style["text-decoration-color"] = col;
  }
  parseFont(node, style) {
    var ascii = globalXmlParser.attr(node, "ascii");
    var asciiTheme = values.themeValue(node, "asciiTheme");
    var eastAsia = globalXmlParser.attr(node, "eastAsia");
    var fonts = [ascii, asciiTheme, eastAsia].filter((x) => x).map((x) => encloseFontFamily(x));
    if (fonts.length > 0)
      style["font-family"] = [...new Set(fonts)].join(", ");
  }
  parseIndentation(node, style) {
    var firstLine = globalXmlParser.lengthAttr(node, "firstLine");
    var hanging = globalXmlParser.lengthAttr(node, "hanging");
    var left = globalXmlParser.lengthAttr(node, "left");
    var start = globalXmlParser.lengthAttr(node, "start");
    var right = globalXmlParser.lengthAttr(node, "right");
    var end = globalXmlParser.lengthAttr(node, "end");
    if (firstLine)
      style["text-indent"] = firstLine;
    if (hanging)
      style["text-indent"] = `-${hanging}`;
    if (left || start)
      style["margin-inline-start"] = left || start;
    if (right || end)
      style["margin-inline-end"] = right || end;
  }
  parseSpacing(node, style) {
    var before = globalXmlParser.lengthAttr(node, "before");
    var after = globalXmlParser.lengthAttr(node, "after");
    var line = globalXmlParser.intAttr(node, "line", null);
    var lineRule = globalXmlParser.attr(node, "lineRule");
    if (before)
      style["margin-top"] = before;
    if (after)
      style["margin-bottom"] = after;
    if (line !== null) {
      switch (lineRule) {
        case "auto":
          style["line-height"] = `${(line / 240).toFixed(2)}`;
          break;
        case "atLeast":
          style["line-height"] = `calc(100% + ${line / 20}pt)`;
          break;
        default:
          style["line-height"] = style["min-height"] = `${line / 20}pt`;
          break;
      }
    }
  }
  parseMarginProperties(node, output) {
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "left":
          output["padding-left"] = values.valueOfMargin(c);
          break;
        case "right":
          output["padding-right"] = values.valueOfMargin(c);
          break;
        case "top":
          output["padding-top"] = values.valueOfMargin(c);
          break;
        case "bottom":
          output["padding-bottom"] = values.valueOfMargin(c);
          break;
      }
    }
  }
  parseTrHeight(node, output) {
    switch (globalXmlParser.attr(node, "hRule")) {
      case "exact":
        output["height"] = globalXmlParser.lengthAttr(node, "val");
        break;
      case "atLeast":
      default:
        output["height"] = globalXmlParser.lengthAttr(node, "val");
        break;
    }
  }
  parseBorderProperties(node, output) {
    for (const c of globalXmlParser.elements(node)) {
      switch (c.localName) {
        case "start":
        case "left":
          output["border-left"] = values.valueOfBorder(c);
          break;
        case "end":
        case "right":
          output["border-right"] = values.valueOfBorder(c);
          break;
        case "top":
          output["border-top"] = values.valueOfBorder(c);
          break;
        case "bottom":
          output["border-bottom"] = values.valueOfBorder(c);
          break;
      }
    }
  }
};
var knownColors = ["black", "blue", "cyan", "darkBlue", "darkCyan", "darkGray", "darkGreen", "darkMagenta", "darkRed", "darkYellow", "green", "lightGray", "magenta", "none", "red", "white", "yellow"];
var xmlUtil = class {
  static colorAttr(node, attrName, defValue = null, autoColor = "black") {
    var v = globalXmlParser.attr(node, attrName);
    if (v) {
      if (v == "auto") {
        return autoColor;
      } else if (knownColors.includes(v)) {
        return v;
      }
      return `#${v}`;
    }
    var themeColor = globalXmlParser.attr(node, "themeColor");
    return themeColor ? `var(--docx-${themeColor}-color)` : defValue;
  }
};
var values = class _values {
  static themeValue(c, attr) {
    var val = globalXmlParser.attr(c, attr);
    return val ? `var(--docx-${val}-font)` : null;
  }
  static valueOfSize(c, attr) {
    var type = LengthUsage.Dxa;
    switch (globalXmlParser.attr(c, "type")) {
      case "dxa":
        break;
      case "pct":
        type = LengthUsage.Percent;
        break;
      case "auto":
        return "auto";
    }
    return globalXmlParser.lengthAttr(c, attr, type);
  }
  static valueOfMargin(c) {
    return globalXmlParser.lengthAttr(c, "w");
  }
  static valueOfBorder(c) {
    var type = _values.parseBorderType(globalXmlParser.attr(c, "val"));
    if (type == "none")
      return "none";
    var color = xmlUtil.colorAttr(c, "color");
    var size = globalXmlParser.lengthAttr(c, "sz", LengthUsage.Border);
    return `${size} ${type} ${color == "auto" ? autos.borderColor : color}`;
  }
  static parseBorderType(type) {
    switch (type) {
      case "single":
        return "solid";
      case "dashDotStroked":
        return "solid";
      case "dashed":
        return "dashed";
      case "dashSmallGap":
        return "dashed";
      case "dotDash":
        return "dotted";
      case "dotDotDash":
        return "dotted";
      case "dotted":
        return "dotted";
      case "double":
        return "double";
      case "doubleWave":
        return "double";
      case "inset":
        return "inset";
      case "nil":
        return "none";
      case "none":
        return "none";
      case "outset":
        return "outset";
      case "thick":
        return "solid";
      case "thickThinLargeGap":
        return "solid";
      case "thickThinMediumGap":
        return "solid";
      case "thickThinSmallGap":
        return "solid";
      case "thinThickLargeGap":
        return "solid";
      case "thinThickMediumGap":
        return "solid";
      case "thinThickSmallGap":
        return "solid";
      case "thinThickThinLargeGap":
        return "solid";
      case "thinThickThinMediumGap":
        return "solid";
      case "thinThickThinSmallGap":
        return "solid";
      case "threeDEmboss":
        return "solid";
      case "threeDEngrave":
        return "solid";
      case "triple":
        return "double";
      case "wave":
        return "solid";
    }
    return "solid";
  }
  static valueOfTblLayout(c) {
    var type = globalXmlParser.attr(c, "val");
    return type == "fixed" ? "fixed" : "auto";
  }
  static classNameOfCnfStyle(c) {
    const val = globalXmlParser.attr(c, "val");
    const classes = [
      "first-row",
      "last-row",
      "first-col",
      "last-col",
      "odd-col",
      "even-col",
      "odd-row",
      "even-row",
      "ne-cell",
      "nw-cell",
      "se-cell",
      "sw-cell"
    ];
    if (val)
      return classes.filter((_, i) => val[i] == "1").join(" ");
    const attrs = [
      "firstRow",
      "lastRow",
      "firstColumn",
      "lastColumn",
      "oddVBand",
      "evenVBand",
      "oddHBand",
      "evenHBand",
      "firstRowLastColumn",
      "firstRowFirstColumn",
      "lastRowLastColumn",
      "lastRowFirstColumn"
    ];
    return classes.filter((_, i) => globalXmlParser.boolAttr(c, attrs[i])).join(" ");
  }
  static valueOfJc(c) {
    var type = globalXmlParser.attr(c, "val");
    switch (type) {
      case "start":
      case "left":
        return "left";
      case "center":
        return "center";
      case "end":
      case "right":
        return "right";
      case "both":
        return "justify";
    }
    return type;
  }
  static valueOfVertAlign(c, asTagName = false) {
    var type = globalXmlParser.attr(c, "val");
    switch (type) {
      case "subscript":
        return "sub";
      case "superscript":
        return asTagName ? "sup" : "super";
    }
    return asTagName ? null : type;
  }
  static valueOfTextAlignment(c) {
    var type = globalXmlParser.attr(c, "val");
    switch (type) {
      case "auto":
      case "baseline":
        return "baseline";
      case "top":
        return "top";
      case "center":
        return "middle";
      case "bottom":
        return "bottom";
    }
    return type;
  }
  static addSize(a, b) {
    if (a == null)
      return b;
    if (b == null)
      return a;
    return `calc(${a} + ${b})`;
  }
  static classNameOftblLook(c) {
    const val = globalXmlParser.hexAttr(c, "val", 0);
    let className = "";
    if (globalXmlParser.boolAttr(c, "firstRow") || val & 32)
      className += " first-row";
    if (globalXmlParser.boolAttr(c, "lastRow") || val & 64)
      className += " last-row";
    if (globalXmlParser.boolAttr(c, "firstColumn") || val & 128)
      className += " first-col";
    if (globalXmlParser.boolAttr(c, "lastColumn") || val & 256)
      className += " last-col";
    if (globalXmlParser.boolAttr(c, "noHBand") || val & 512)
      className += " no-hband";
    if (globalXmlParser.boolAttr(c, "noVBand") || val & 1024)
      className += " no-vband";
    return className.trim();
  }
};
var defaultTab = { pos: 0, leader: "none", style: "left" };
var maxTabs = 50;
function computePixelToPoint(container = document.body) {
  const temp = document.createElement("div");
  temp.style.width = "100pt";
  container.appendChild(temp);
  const result = 100 / temp.offsetWidth;
  container.removeChild(temp);
  return result;
}
function updateTabStop(elem, tabs, defaultTabSize, pixelToPoint = 72 / 96) {
  const p = elem.closest("p");
  const ebb = elem.getBoundingClientRect();
  const pbb = p.getBoundingClientRect();
  const pcs = getComputedStyle(p);
  const tabStops = tabs?.length > 0 ? tabs.map((t) => ({
    pos: lengthToPoint(t.position),
    leader: t.leader,
    style: t.style
  })).sort((a, b) => a.pos - b.pos) : [defaultTab];
  const lastTab = tabStops[tabStops.length - 1];
  const pWidthPt = pbb.width * pixelToPoint;
  const size = lengthToPoint(defaultTabSize);
  let pos = lastTab.pos + size;
  if (pos < pWidthPt) {
    for (; pos < pWidthPt && tabStops.length < maxTabs; pos += size) {
      tabStops.push({ ...defaultTab, pos });
    }
  }
  const marginLeft = parseFloat(pcs.marginLeft);
  const pOffset = pbb.left + marginLeft;
  const left = (ebb.left - pOffset) * pixelToPoint;
  const tab = tabStops.find((t) => t.style != "clear" && t.pos > left);
  if (tab == null)
    return;
  let width = 1;
  if (tab.style == "right" || tab.style == "center") {
    const tabStops2 = Array.from(p.querySelectorAll(`.${elem.className}`));
    const nextIdx = tabStops2.indexOf(elem) + 1;
    const range = document.createRange();
    range.setStart(elem, 1);
    if (nextIdx < tabStops2.length) {
      range.setEndBefore(tabStops2[nextIdx]);
    } else {
      range.setEndAfter(p);
    }
    const mul = tab.style == "center" ? 0.5 : 1;
    const nextBB = range.getBoundingClientRect();
    const offset = nextBB.left + mul * nextBB.width - (pbb.left - marginLeft);
    width = tab.pos - offset * pixelToPoint;
  } else {
    width = tab.pos - left;
  }
  elem.innerHTML = "&nbsp;";
  elem.style.textDecoration = "inherit";
  elem.style.wordSpacing = `${width.toFixed(0)}pt`;
  switch (tab.leader) {
    case "dot":
    case "middleDot":
      elem.style.textDecoration = "underline";
      elem.style.textDecorationStyle = "dotted";
      break;
    case "hyphen":
    case "heavy":
    case "underscore":
      elem.style.textDecoration = "underline";
      break;
  }
}
function lengthToPoint(length) {
  return parseFloat(length);
}
var ns;
(function(ns2) {
  ns2["html"] = "http://www.w3.org/1999/xhtml";
  ns2["svg"] = "http://www.w3.org/2000/svg";
  ns2["mathML"] = "http://www.w3.org/1998/Math/MathML";
})(ns || (ns = {}));
function h(elem) {
  if (isString(elem))
    return document.createTextNode(elem);
  if (elem instanceof Node)
    return elem;
  const { ns: ns2, tagName, className, style, children, ...props } = elem;
  if (tagName === "#fragment")
    return document.createDocumentFragment();
  if (tagName === "#comment")
    return document.createComment(children[0]);
  const result = ns2 ? document.createElementNS(ns2, tagName) : document.createElement(tagName);
  if (className)
    result.setAttribute("class", className);
  if (style) {
    if (isString(style)) {
      result.setAttribute("style", style);
    } else {
      Object.assign(result.style, style);
    }
  }
  if (props) {
    for (const [key, value] of Object.entries(props))
      if (value !== void 0)
        result[key] = value;
  }
  if (children)
    children.forEach((c) => result.appendChild(h(c)));
  return result;
}
function cx(...classNames) {
  return classNames.filter(Boolean).join(" ");
}
var HtmlRenderer = class {
  constructor() {
    this.className = "docx";
    this.styleMap = {};
    this.currentPart = null;
    this.tableVerticalMerges = [];
    this.currentVerticalMerge = null;
    this.tableCellPositions = [];
    this.currentCellPosition = null;
    this.footnoteMap = {};
    this.endnoteMap = {};
    this.currentEndnoteIds = [];
    this.usedHederFooterParts = [];
    this.currentTabs = [];
    this.commentMap = {};
    this.tasks = [];
    this.postRenderTasks = [];
    this.h = h;
  }
  async render(document2, options) {
    this.document = document2;
    this.options = options;
    this.className = options.className;
    this.rootSelector = options.inWrapper ? `.${this.className}-wrapper` : ":root";
    this.h = options.h ?? h;
    this.styleMap = null;
    this.tasks = [];
    if (this.options.renderComments && globalThis.Highlight) {
      this.commentHighlight = new Highlight();
    }
    const result = [...this.renderDefaultStyle()];
    if (document2.themePart) {
      result.push(...this.renderTheme(document2.themePart));
    }
    if (document2.stylesPart != null) {
      this.styleMap = this.processStyles(document2.stylesPart.styles);
      result.push(...this.renderStyles(document2.stylesPart.styles));
    }
    if (document2.numberingPart) {
      this.prodessNumberings(document2.numberingPart.domNumberings);
      result.push(...await this.renderNumbering(document2.numberingPart.domNumberings));
    }
    if (document2.footnotesPart) {
      this.footnoteMap = keyBy(document2.footnotesPart.notes, (x) => x.id);
    }
    if (document2.endnotesPart) {
      this.endnoteMap = keyBy(document2.endnotesPart.notes, (x) => x.id);
    }
    if (document2.settingsPart) {
      this.defaultTabSize = document2.settingsPart.settings?.defaultTabStop;
    }
    if (!options.ignoreFonts && document2.fontTablePart)
      result.push(...await this.renderFontTable(document2.fontTablePart));
    var sectionElements = this.renderSections(document2.documentPart.body);
    if (this.options.inWrapper) {
      result.push(this.renderWrapper(sectionElements));
    } else {
      result.push(...sectionElements);
    }
    if (this.commentHighlight && options.renderComments) {
      CSS.highlights.set(`${this.className}-comments`, this.commentHighlight);
    }
    this.postRenderTasks.forEach((t) => t());
    await Promise.allSettled(this.tasks);
    this.refreshTabStops();
    return result;
  }
  renderTheme(themePart) {
    const variables = {};
    const fontScheme = themePart.theme?.fontScheme;
    if (fontScheme) {
      if (fontScheme.majorFont) {
        variables["--docx-majorHAnsi-font"] = fontScheme.majorFont.latinTypeface;
      }
      if (fontScheme.minorFont) {
        variables["--docx-minorHAnsi-font"] = fontScheme.minorFont.latinTypeface;
      }
    }
    const colorScheme = themePart.theme?.colorScheme;
    if (colorScheme) {
      for (let [k, v] of Object.entries(colorScheme.colors)) {
        variables[`--docx-${k}-color`] = `#${v}`;
      }
    }
    const cssText = this.styleToString(`.${this.className}`, variables);
    return [
      this.h({ tagName: "#comment", children: ["docxjs document theme values"] }),
      this.h({ tagName: "style", children: [cssText] })
    ];
  }
  async renderFontTable(fontsPart) {
    const result = [];
    for (let f of fontsPart.fonts) {
      for (let ref of f.embedFontRefs) {
        try {
          const fontData = await this.document.loadFont(ref.id, ref.key);
          const cssValues = {
            "font-family": encloseFontFamily(f.name),
            "src": `url(${fontData})`
          };
          if (ref.type == "bold" || ref.type == "boldItalic") {
            cssValues["font-weight"] = "bold";
          }
          if (ref.type == "italic" || ref.type == "boldItalic") {
            cssValues["font-style"] = "italic";
          }
          result.push(this.h({ tagName: "#comment", children: [`docxjs ${f.name} font`] }));
          result.push(this.h({ tagName: "style", children: [this.styleToString(`@font-face`, cssValues)] }));
        } catch (e) {
          if (this.options.debug)
            console.warn(`Can't load font with id ${ref.id} and key ${ref.key}`);
        }
      }
    }
    return result;
  }
  processStyleName(className) {
    return className ? `${this.className}_${escapeClassName(className)}` : this.className;
  }
  processStyles(styles) {
    const stylesMap = keyBy(styles.filter((x) => x.id != null), (x) => x.id);
    for (const style of styles.filter((x) => x.basedOn)) {
      var baseStyle = stylesMap[style.basedOn];
      if (baseStyle) {
        style.paragraphProps = mergeDeep(style.paragraphProps, baseStyle.paragraphProps);
        style.runProps = mergeDeep(style.runProps, baseStyle.runProps);
        for (const baseValues of baseStyle.styles) {
          const styleValues = style.styles.find((x) => x.target == baseValues.target);
          if (styleValues) {
            this.copyStyleProperties(baseValues.values, styleValues.values);
          } else {
            style.styles.push({ ...baseValues, values: { ...baseValues.values } });
          }
        }
      } else if (this.options.debug)
        console.warn(`Can't find base style ${style.basedOn}`);
    }
    for (let style of styles) {
      style.cssName = this.processStyleName(style.id);
    }
    return stylesMap;
  }
  prodessNumberings(numberings) {
    for (let num of numberings.filter((n) => n.pStyleName)) {
      const style = this.findStyle(num.pStyleName);
      if (style?.paragraphProps?.numbering) {
        style.paragraphProps.numbering.level = num.level;
      }
    }
  }
  processElement(element) {
    if (element.children) {
      for (var e of element.children) {
        e.parent = element;
        if (e.type == DomType.Table) {
          this.processTable(e);
        } else {
          this.processElement(e);
        }
      }
    }
  }
  processTable(table) {
    for (var r of table.children) {
      for (var c of r.children) {
        c.cssStyle = this.copyStyleProperties(table.cellStyle, c.cssStyle, [
          "border-left",
          "border-right",
          "border-top",
          "border-bottom",
          "padding-left",
          "padding-right",
          "padding-top",
          "padding-bottom"
        ]);
        this.processElement(c);
      }
    }
  }
  copyStyleProperties(input, output, attrs = null) {
    if (!input)
      return output;
    if (output == null)
      output = {};
    if (attrs == null)
      attrs = Object.getOwnPropertyNames(input);
    for (var key of attrs) {
      if (input.hasOwnProperty(key) && !output.hasOwnProperty(key))
        output[key] = input[key];
    }
    return output;
  }
  createPageElement(className, props, docStyle) {
    const style = { ...docStyle };
    if (props) {
      if (props.pageMargins) {
        style.paddingLeft = props.pageMargins.left;
        style.paddingRight = props.pageMargins.right;
        style.paddingTop = props.pageMargins.top;
        style.paddingBottom = props.pageMargins.bottom;
      }
      if (props.pageSize) {
        if (!this.options.ignoreWidth)
          style.width = props.pageSize.width;
        if (!this.options.ignoreHeight)
          style.minHeight = props.pageSize.height;
      }
    }
    return this.h({ tagName: "section", className, style });
  }
  createSectionContent(props) {
    const style = {};
    if (props.columns && props.columns.numberOfColumns) {
      style.columnCount = `${props.columns.numberOfColumns}`;
      style.columnGap = props.columns.space;
      if (props.columns.separator) {
        style.columnRule = "1px solid black";
      }
    }
    return this.h({ tagName: "article", style });
  }
  renderSections(document2) {
    const result = [];
    this.processElement(document2);
    const sections = this.splitBySection(document2.children, document2.props);
    const pages = this.groupByPageBreaks(sections);
    let prevProps = null;
    for (let i = 0, l = pages.length; i < l; i++) {
      this.currentFootnoteIds = [];
      const section = pages[i][0];
      let props = section.sectProps;
      const pageElement = this.createPageElement(this.className, props, document2.cssStyle);
      this.options.renderHeaders && this.renderHeaderFooter(props.headerRefs, props, result.length, prevProps != props, pageElement);
      for (const sect of pages[i]) {
        var contentElement = this.createSectionContent(sect.sectProps);
        this.renderElements(sect.elements, contentElement);
        pageElement.appendChild(contentElement);
        props = sect.sectProps;
      }
      if (this.options.renderFootnotes) {
        const notes = this.renderNotes(this.currentFootnoteIds, this.footnoteMap);
        notes && pageElement.appendChild(notes);
      }
      if (this.options.renderEndnotes && i == l - 1) {
        const notes = this.renderNotes(this.currentEndnoteIds, this.endnoteMap);
        notes && pageElement.appendChild(notes);
      }
      this.options.renderFooters && this.renderHeaderFooter(props.footerRefs, props, result.length, prevProps != props, pageElement);
      result.push(pageElement);
      prevProps = props;
    }
    return result;
  }
  renderHeaderFooter(refs, props, page, firstOfSection, into) {
    if (!refs)
      return;
    var ref = (props.titlePage && firstOfSection ? refs.find((x) => x.type == "first") : null) ?? (page % 2 == 1 ? refs.find((x) => x.type == "even") : null) ?? refs.find((x) => x.type == "default");
    var part = ref && this.document.findPartByRelId(ref.id, this.document.documentPart);
    if (part) {
      this.currentPart = part;
      if (!this.usedHederFooterParts.includes(part.path)) {
        this.processElement(part.rootElement);
        this.usedHederFooterParts.push(part.path);
      }
      const [el] = this.renderElements([part.rootElement], into);
      if (props?.pageMargins) {
        if (part.rootElement.type === DomType.Header) {
          el.style.marginTop = `calc(${props.pageMargins.header} - ${props.pageMargins.top})`;
          el.style.minHeight = `calc(${props.pageMargins.top} - ${props.pageMargins.header})`;
        } else if (part.rootElement.type === DomType.Footer) {
          el.style.marginBottom = `calc(${props.pageMargins.footer} - ${props.pageMargins.bottom})`;
          el.style.minHeight = `calc(${props.pageMargins.bottom} - ${props.pageMargins.footer})`;
        }
      }
      this.currentPart = null;
    }
  }
  isPageBreakElement(elem) {
    if (elem.type != DomType.Break)
      return false;
    if (elem.break == "lastRenderedPageBreak")
      return !this.options.ignoreLastRenderedPageBreak;
    return elem.break == "page";
  }
  isPageBreakSection(prev, next) {
    if (!prev)
      return false;
    if (!next)
      return false;
    return prev.pageSize?.orientation != next.pageSize?.orientation || prev.pageSize?.width != next.pageSize?.width || prev.pageSize?.height != next.pageSize?.height;
  }
  splitBySection(elements, defaultProps) {
    var current = { sectProps: null, elements: [], pageBreak: false };
    var result = [current];
    for (let elem of elements) {
      if (elem.type == DomType.Paragraph) {
        const s = this.findStyle(elem.styleName);
        if (s?.paragraphProps?.pageBreakBefore) {
          current.sectProps = sectProps;
          current.pageBreak = true;
          current = { sectProps: null, elements: [], pageBreak: false };
          result.push(current);
        }
      }
      current.elements.push(elem);
      if (elem.type == DomType.Paragraph) {
        const p = elem;
        var sectProps = p.sectionProps;
        var pBreakIndex = -1;
        var rBreakIndex = -1;
        if (this.options.breakPages && p.children) {
          pBreakIndex = p.children.findIndex((r) => {
            rBreakIndex = r.children?.findIndex(this.isPageBreakElement.bind(this)) ?? -1;
            return rBreakIndex != -1;
          });
        }
        if (sectProps || pBreakIndex != -1) {
          current.sectProps = sectProps;
          current.pageBreak = pBreakIndex != -1;
          current = { sectProps: null, elements: [], pageBreak: false };
          result.push(current);
        }
        if (pBreakIndex != -1) {
          let breakRun = p.children[pBreakIndex];
          let splitRun = rBreakIndex < breakRun.children.length - 1;
          if (pBreakIndex < p.children.length - 1 || splitRun) {
            var children = elem.children;
            var newParagraph = { ...elem, children: children.slice(pBreakIndex) };
            elem.children = children.slice(0, pBreakIndex);
            current.elements.push(newParagraph);
            if (splitRun) {
              let runChildren = breakRun.children;
              let newRun = { ...breakRun, children: runChildren.slice(0, rBreakIndex) };
              elem.children.push(newRun);
              breakRun.children = runChildren.slice(rBreakIndex);
            }
          }
        }
      }
    }
    let currentSectProps = null;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].sectProps == null) {
        result[i].sectProps = currentSectProps ?? defaultProps;
      } else {
        currentSectProps = result[i].sectProps;
      }
    }
    return result;
  }
  groupByPageBreaks(sections) {
    let current = [];
    let prev;
    const result = [current];
    for (let s of sections) {
      current.push(s);
      if (this.options.ignoreLastRenderedPageBreak || s.pageBreak || this.isPageBreakSection(prev, s.sectProps))
        result.push(current = []);
      prev = s.sectProps;
    }
    return result.filter((x) => x.length > 0);
  }
  renderWrapper(children) {
    return this.h({ tagName: "div", className: `${this.className}-wrapper`, children });
  }
  renderDefaultStyle() {
    var c = this.className;
    var wrapperStyle = `
.${c}-wrapper { background: gray; padding: 30px; padding-bottom: 0px; display: flex; flex-flow: column; align-items: center; } 
.${c}-wrapper>section.${c} { background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); margin-bottom: 30px; }`;
    if (this.options.hideWrapperOnPrint) {
      wrapperStyle = `@media not print { ${wrapperStyle} }`;
    }
    var styleText = `${wrapperStyle}
.${c} { color: black; hyphens: auto; text-underline-position: from-font; }
section.${c} { box-sizing: border-box; display: flex; flex-flow: column nowrap; position: relative; overflow: hidden; }
section.${c}>article { margin-bottom: auto; z-index: 1; }
section.${c}>footer { z-index: 1; }
.${c} table { border-collapse: collapse; }
.${c} table td, .${c} table th { vertical-align: top; }
.${c} p { margin: 0pt; min-height: 1em; }
.${c} span { white-space: pre-wrap; overflow-wrap: break-word; }
.${c} a { color: inherit; text-decoration: inherit; }
.${c} svg { fill: transparent; }
`;
    if (this.options.renderComments) {
      styleText += `
.${c}-comment-ref { cursor: default; }
.${c}-comment-popover { display: none; z-index: 1000; padding: 0.5rem; background: white; position: absolute; box-shadow: 0 0 0.25rem rgba(0, 0, 0, 0.25); width: 30ch; }
.${c}-comment-ref:hover~.${c}-comment-popover { display: block; }
.${c}-comment-author,.${c}-comment-date { font-size: 0.875rem; color: #888; }
`;
    }
    return [
      this.h({ tagName: "#comment", children: ["docxjs library predefined styles"] }),
      this.h({ tagName: "style", children: [styleText] })
    ];
  }
  async renderNumbering(numberings) {
    var styleText = "";
    var resetCounters = [];
    for (var num of numberings) {
      var selector = `p.${this.numberingClass(num.id, num.level)}`;
      var listStyleType = "none";
      if (num.bullet) {
        let valiable = `--${this.className}-${num.bullet.src}`.toLowerCase();
        styleText += this.styleToString(`${selector}:before`, {
          "content": "' '",
          "display": "inline-block",
          "background": `var(${valiable})`
        }, num.bullet.style);
        try {
          const imgData = await this.document.loadNumberingImage(num.bullet.src);
          styleText += `${this.rootSelector} { ${valiable}: url(${imgData}) }`;
        } catch (e) {
          if (this.options.debug)
            console.warn(`Can't load numbering image with src ${num.bullet.src}`);
        }
      } else if (num.levelText) {
        let counter = this.numberingCounter(num.id, num.level);
        const counterReset = counter + " " + (num.start - 1);
        if (num.level > 0) {
          styleText += this.styleToString(`p.${this.numberingClass(num.id, num.level - 1)}`, {
            "counter-set": counterReset
          });
        }
        resetCounters.push(counterReset);
        styleText += this.styleToString(`${selector}:before`, {
          "content": this.levelTextToContent(num.levelText, num.suff, num.id, this.numFormatToCssValue(num.format)),
          "counter-increment": counter,
          ...num.rStyle
        });
      } else {
        listStyleType = this.numFormatToCssValue(num.format);
      }
      styleText += this.styleToString(selector, {
        "display": "list-item",
        "list-style-position": "inside",
        "list-style-type": listStyleType,
        ...num.pStyle
      });
    }
    if (resetCounters.length > 0) {
      styleText += this.styleToString(this.rootSelector, {
        "counter-reset": resetCounters.join(" ")
      });
    }
    return [
      this.h({ tagName: "#comment", children: ["docxjs document numbering styles"] }),
      this.h({ tagName: "style", children: [styleText] })
    ];
  }
  renderStyles(styles) {
    var styleText = "";
    const stylesMap = this.styleMap;
    const defautStyles = keyBy(styles.filter((s) => s.isDefault), (s) => s.target);
    for (const style of styles) {
      var subStyles = style.styles;
      if (style.linked) {
        var linkedStyle = style.linked && stylesMap[style.linked];
        if (linkedStyle)
          subStyles = subStyles.concat(linkedStyle.styles);
        else if (this.options.debug)
          console.warn(`Can't find linked style ${style.linked}`);
      }
      for (const subStyle of subStyles) {
        var selector = `${style.target ?? ""}.${style.cssName}`;
        if (style.target != subStyle.target)
          selector += ` ${subStyle.target}`;
        if (defautStyles[style.target] == style)
          selector = `.${this.className} ${style.target}, ` + selector;
        styleText += this.styleToString(selector, subStyle.values);
      }
    }
    return [
      this.h({ tagName: "#comment", children: ["docxjs document styles"] }),
      this.h({ tagName: "style", children: [styleText] })
    ];
  }
  renderNotes(noteIds, notesMap) {
    var notes = noteIds.map((id) => notesMap[id]).filter((x) => x);
    if (notes.length > 0) {
      return this.h({ tagName: "ol", children: this.renderElements(notes) });
    }
  }
  renderElement(elem) {
    switch (elem.type) {
      case DomType.Paragraph:
        return this.renderParagraph(elem);
      case DomType.BookmarkStart:
        return this.renderBookmarkStart(elem);
      case DomType.BookmarkEnd:
        return null;
      case DomType.Run:
        return this.renderRun(elem);
      case DomType.Table:
        return this.renderTable(elem);
      case DomType.Row:
        return this.renderTableRow(elem);
      case DomType.Cell:
        return this.renderTableCell(elem);
      case DomType.Hyperlink:
        return this.renderHyperlink(elem);
      case DomType.SmartTag:
        return this.renderSmartTag(elem);
      case DomType.Drawing:
        return this.renderDrawing(elem);
      case DomType.Image:
        return this.renderImage(elem);
      case DomType.Text:
        return this.renderText(elem);
      case DomType.Text:
        return this.renderText(elem);
      case DomType.DeletedText:
        return this.renderDeletedText(elem);
      case DomType.Tab:
        return this.renderTab(elem);
      case DomType.Symbol:
        return this.renderSymbol(elem);
      case DomType.Break:
        return this.renderBreak(elem);
      case DomType.Footer:
        return this.renderContainer(elem, "footer");
      case DomType.Header:
        return this.renderContainer(elem, "header");
      case DomType.Footnote:
      case DomType.Endnote:
        return this.renderContainer(elem, "li");
      case DomType.FootnoteReference:
        return this.renderFootnoteReference(elem);
      case DomType.EndnoteReference:
        return this.renderEndnoteReference(elem);
      case DomType.NoBreakHyphen:
        return this.h({ tagName: "wbr" });
      case DomType.VmlPicture:
        return this.renderVmlPicture(elem);
      case DomType.VmlElement:
        return this.renderVmlElement(elem);
      case DomType.MmlMath:
        return this.renderContainerNS(elem, ns.mathML, "math", { xmlns: ns.mathML });
      case DomType.MmlMathParagraph:
        return this.renderContainer(elem, "span");
      case DomType.MmlFraction:
        return this.renderContainerNS(elem, ns.mathML, "mfrac");
      case DomType.MmlBase:
        return this.renderContainerNS(elem, ns.mathML, elem.parent.type == DomType.MmlMatrixRow ? "mtd" : "mrow");
      case DomType.MmlNumerator:
      case DomType.MmlDenominator:
      case DomType.MmlFunction:
      case DomType.MmlLimit:
      case DomType.MmlBox:
        return this.renderContainerNS(elem, ns.mathML, "mrow");
      case DomType.MmlGroupChar:
        return this.renderMmlGroupChar(elem);
      case DomType.MmlLimitLower:
        return this.renderContainerNS(elem, ns.mathML, "munder");
      case DomType.MmlMatrix:
        return this.renderContainerNS(elem, ns.mathML, "mtable");
      case DomType.MmlMatrixRow:
        return this.renderContainerNS(elem, ns.mathML, "mtr");
      case DomType.MmlRadical:
        return this.renderMmlRadical(elem);
      case DomType.MmlSuperscript:
        return this.renderContainerNS(elem, ns.mathML, "msup");
      case DomType.MmlSubscript:
        return this.renderContainerNS(elem, ns.mathML, "msub");
      case DomType.MmlDegree:
      case DomType.MmlSuperArgument:
      case DomType.MmlSubArgument:
        return this.renderContainerNS(elem, ns.mathML, "mn");
      case DomType.MmlFunctionName:
        return this.renderContainerNS(elem, ns.mathML, "ms");
      case DomType.MmlDelimiter:
        return this.renderMmlDelimiter(elem);
      case DomType.MmlRun:
        return this.renderMmlRun(elem);
      case DomType.MmlNary:
        return this.renderMmlNary(elem);
      case DomType.MmlPreSubSuper:
        return this.renderMmlPreSubSuper(elem);
      case DomType.MmlBar:
        return this.renderMmlBar(elem);
      case DomType.MmlEquationArray:
        return this.renderMllList(elem);
      case DomType.Inserted:
        return this.renderInserted(elem);
      case DomType.Deleted:
        return this.renderDeleted(elem);
      case DomType.CommentRangeStart:
        return this.renderCommentRangeStart(elem);
      case DomType.CommentRangeEnd:
        return this.renderCommentRangeEnd(elem);
      case DomType.CommentReference:
        return this.renderCommentReference(elem);
      case DomType.AltChunk:
        return this.renderAltChunk(elem);
    }
    return null;
  }
  renderElements(elems, into) {
    if (elems == null)
      return null;
    var result = elems.flatMap((e) => this.renderElement(e)).filter((e) => e != null);
    if (into)
      result.forEach((c) => into.appendChild(isString(c) ? document.createTextNode(c) : c));
    return result;
  }
  renderContainer(elem, tagName, props) {
    return this.h({ tagName, children: this.renderElements(elem.children), ...props });
  }
  renderContainerNS(elem, ns2, tagName, props) {
    return this.h({ ns: ns2, tagName, children: this.renderElements(elem.children), ...props });
  }
  renderParagraph(elem) {
    var result = this.toHTML(elem, ns.html, "p");
    const style = this.findStyle(elem.styleName);
    elem.tabs ?? (elem.tabs = style?.paragraphProps?.tabs);
    const numbering = elem.numbering ?? style?.paragraphProps?.numbering;
    if (numbering) {
      result.classList.add(this.numberingClass(numbering.id, numbering.level));
    }
    return result;
  }
  renderHyperlink(elem) {
    const res = this.toH(elem, ns.html, "a");
    res.href = "";
    if (elem.id) {
      const rel = this.document.documentPart.rels.find((it) => it.id == elem.id && it.targetMode === "External");
      res.href = rel?.target ?? res.href;
    }
    if (elem.anchor) {
      res.href += `#${elem.anchor}`;
    }
    return this.h(res);
  }
  renderSmartTag(elem) {
    return this.renderContainer(elem, "span");
  }
  renderCommentRangeStart(commentStart) {
    if (!this.options.renderComments)
      return null;
    const rng = new Range();
    this.commentHighlight?.add(rng);
    const result = this.h({ tagName: "#comment", children: [`start of comment #${commentStart.id}`] });
    this.later(() => rng.setStart(result, 0));
    this.commentMap[commentStart.id] = rng;
    return result;
  }
  renderCommentRangeEnd(commentEnd) {
    if (!this.options.renderComments)
      return null;
    const rng = this.commentMap[commentEnd.id];
    const result = this.h({ tagName: "#comment", children: [`end of comment #${commentEnd.id}`] });
    this.later(() => rng?.setEnd(result, 0));
    return result;
  }
  renderCommentReference(commentRef) {
    if (!this.options.renderComments)
      return null;
    var comment = this.document.commentsPart?.commentMap[commentRef.id];
    if (!comment)
      return null;
    const commentRefEl = this.h({ tagName: "span", className: `${this.className}-comment-ref`, children: ["\u{1F4AC}"] });
    const commentsContainerEl = this.h({
      tagName: "div",
      className: `${this.className}-comment-popover`,
      children: [
        this.h({ tagName: "div", className: `${this.className}-comment-author`, children: [comment.author] }),
        this.h({ tagName: "div", className: `${this.className}-comment-date`, children: [new Date(comment.date).toLocaleString()] }),
        ...this.renderElements(comment.children)
      ]
    });
    return this.h({ tagName: "#fragment", children: [
      this.h({ tagName: "#comment", children: [`comment #${comment.id} by ${comment.author} on ${comment.date}`] }),
      commentRefEl,
      commentsContainerEl
    ] });
  }
  renderAltChunk(elem) {
    if (!this.options.renderAltChunks)
      return null;
    var result = this.h({ tagName: "iframe" });
    this.tasks.push(this.document.loadAltChunk(elem.id, this.currentPart).then((x) => {
      result.srcdoc = x;
    }));
    return result;
  }
  renderDrawing(elem) {
    var result = this.toHTML(elem, ns.html, "div");
    result.style.display = "inline-block";
    result.style.position = "relative";
    result.style.textIndent = "0px";
    return result;
  }
  renderImage(elem) {
    let result = this.toHTML(elem, ns.html, "img", []);
    let transform = elem.cssStyle?.transform;
    if (elem.srcRect && elem.srcRect.some((x) => x != 0)) {
      var [left, top, right, bottom] = elem.srcRect;
      transform = `scale(${1 / (1 - left - right)}, ${1 / (1 - top - bottom)})`;
      result.style["clip-path"] = `rect(${(100 * top).toFixed(2)}% ${(100 * (1 - right)).toFixed(2)}% ${(100 * (1 - bottom)).toFixed(2)}% ${(100 * left).toFixed(2)}%)`;
    }
    if (elem.rotation)
      transform = `rotate(${elem.rotation}deg) ${transform ?? ""}`;
    result.style.transform = transform?.trim();
    if (this.document) {
      this.tasks.push(this.document.loadDocumentImage(elem.src, this.currentPart).then((x) => {
        result.src = x;
      }));
    }
    return result;
  }
  renderText(elem) {
    return this.h(elem.text);
  }
  renderDeletedText(elem) {
    return this.options.renderChanges ? this.renderText(elem) : null;
  }
  renderBreak(elem) {
    return elem.break == "textWrapping" ? this.h({ tagName: "br" }) : null;
  }
  renderInserted(elem) {
    if (this.options.renderChanges)
      return this.renderChange(elem, "ins");
    return this.renderElements(elem.children);
  }
  renderDeleted(elem) {
    if (this.options.renderChanges)
      return this.renderChange(elem, "del");
    return null;
  }
  renderChange(elem, tag) {
    return this.renderContainer(elem, tag, {
      dateTime: elem.date
    });
  }
  renderSymbol(elem) {
    return this.h({ tagName: "span", children: [String.fromCharCode(elem.char)], style: { fontFamily: elem.font } });
  }
  renderFootnoteReference(elem) {
    this.currentFootnoteIds.push(elem.id);
    return this.h({ tagName: "sup", children: [`${this.currentFootnoteIds.length}`] });
  }
  renderEndnoteReference(elem) {
    this.currentEndnoteIds.push(elem.id);
    return this.h({ tagName: "sup", children: [`${this.currentEndnoteIds.length}`] });
  }
  renderTab(elem) {
    var tabSpan = this.h({ tagName: "span", children: ["\u2003"] });
    if (this.options.experimental) {
      tabSpan.className = this.tabStopClass();
      var stops = findParent(elem, DomType.Paragraph)?.tabs;
      this.currentTabs.push({ stops, span: tabSpan });
    }
    return tabSpan;
  }
  renderBookmarkStart(elem) {
    return this.h({ tagName: "span", id: elem.name });
  }
  renderRun(elem) {
    if (elem.fieldRun)
      return null;
    let children = this.renderElements(elem.children);
    if (elem.verticalAlign) {
      children = [this.h({ tagName: elem.verticalAlign, children: this.renderElements(elem.children) })];
    }
    const result = this.toHTML(elem, ns.html, "span", children);
    if (elem.id)
      result.id = elem.id;
    return result;
  }
  renderTable(elem) {
    this.tableCellPositions.push(this.currentCellPosition);
    this.tableVerticalMerges.push(this.currentVerticalMerge);
    this.currentVerticalMerge = {};
    this.currentCellPosition = { col: 0, row: 0 };
    const children = [];
    if (elem.columns)
      children.push(this.renderTableColumns(elem.columns));
    children.push(...this.renderElements(elem.children));
    this.currentVerticalMerge = this.tableVerticalMerges.pop();
    this.currentCellPosition = this.tableCellPositions.pop();
    return this.toHTML(elem, ns.html, "table", children);
  }
  renderTableColumns(columns) {
    const children = columns.map((x) => this.h({ tagName: "col", style: { width: x.width } }));
    return this.h({ tagName: "colgroup", children });
  }
  renderTableRow(elem) {
    this.currentCellPosition.col = 0;
    const children = [];
    if (elem.gridBefore)
      children.push(this.renderTableCellPlaceholder(elem.gridBefore));
    children.push(...this.renderElements(elem.children));
    if (elem.gridAfter)
      children.push(this.renderTableCellPlaceholder(elem.gridAfter));
    this.currentCellPosition.row++;
    return this.toHTML(elem, ns.html, "tr", children);
  }
  renderTableCellPlaceholder(colSpan) {
    return this.h({ tagName: "td", colSpan, style: { border: "none" } });
  }
  renderTableCell(elem) {
    let result = this.toHTML(elem, ns.html, "td");
    const key = this.currentCellPosition.col;
    if (elem.verticalMerge) {
      if (elem.verticalMerge == "restart") {
        this.currentVerticalMerge[key] = result;
        result.rowSpan = 1;
      } else if (this.currentVerticalMerge[key]) {
        this.currentVerticalMerge[key].rowSpan += 1;
        result.style.display = "none";
      }
    } else {
      this.currentVerticalMerge[key] = null;
    }
    if (elem.span)
      result.colSpan = elem.span;
    this.currentCellPosition.col += result.colSpan;
    return result;
  }
  renderVmlPicture(elem) {
    return this.renderContainer(elem, "div");
  }
  renderVmlElement(elem) {
    var container = this.h({ ns: ns.svg, tagName: "svg", style: elem.cssStyleText });
    const result = this.renderVmlChildElement(elem);
    if (elem.imageHref?.id) {
      this.tasks.push(this.document?.loadDocumentImage(elem.imageHref.id, this.currentPart).then((x) => result.setAttribute("href", x)));
    }
    container.appendChild(result);
    requestAnimationFrame(() => {
      const bb = container.firstElementChild.getBBox();
      container.setAttribute("width", `${Math.ceil(bb.x + bb.width)}`);
      container.setAttribute("height", `${Math.ceil(bb.y + bb.height)}`);
    });
    return container;
  }
  renderVmlChildElement(elem) {
    const result = this.createSvgElement(elem.tagName);
    Object.entries(elem.attrs).forEach(([k, v]) => result.setAttribute(k, v));
    for (let child of elem.children) {
      if (child.type == DomType.VmlElement) {
        result.appendChild(this.renderVmlChildElement(child));
      } else {
        result.appendChild(...asArray(this.renderElement(child)));
      }
    }
    return result;
  }
  renderMmlRadical(elem) {
    const base = elem.children.find((el) => el.type == DomType.MmlBase);
    if (elem.props?.hideDegree) {
      return this.createMathMLElement("msqrt", null, this.renderElements([base]));
    }
    const degree = elem.children.find((el) => el.type == DomType.MmlDegree);
    return this.createMathMLElement("mroot", null, this.renderElements([base, degree]));
  }
  renderMmlDelimiter(elem) {
    const children = [];
    children.push(this.createMathMLElement("mo", null, [elem.props.beginChar ?? "("]));
    children.push(...this.renderElements(elem.children));
    children.push(this.createMathMLElement("mo", null, [elem.props.endChar ?? ")"]));
    return this.createMathMLElement("mrow", null, children);
  }
  renderMmlNary(elem) {
    const children = [];
    const grouped = keyBy(elem.children, (x) => x.type);
    const sup = grouped[DomType.MmlSuperArgument];
    const sub = grouped[DomType.MmlSubArgument];
    const supElem = sup ? this.createMathMLElement("mo", null, asArray(this.renderElement(sup))) : null;
    const subElem = sub ? this.createMathMLElement("mo", null, asArray(this.renderElement(sub))) : null;
    const charElem = this.createMathMLElement("mo", null, [elem.props?.char ?? "\u222B"]);
    if (supElem || subElem) {
      children.push(this.createMathMLElement("munderover", null, [charElem, subElem, supElem]));
    } else if (supElem) {
      children.push(this.createMathMLElement("mover", null, [charElem, supElem]));
    } else if (subElem) {
      children.push(this.createMathMLElement("munder", null, [charElem, subElem]));
    } else {
      children.push(charElem);
    }
    children.push(...this.renderElements(grouped[DomType.MmlBase].children));
    return this.createMathMLElement("mrow", null, children);
  }
  renderMmlPreSubSuper(elem) {
    const children = [];
    const grouped = keyBy(elem.children, (x) => x.type);
    const sup = grouped[DomType.MmlSuperArgument];
    const sub = grouped[DomType.MmlSubArgument];
    const supElem = sup ? this.createMathMLElement("mo", null, asArray(this.renderElement(sup))) : null;
    const subElem = sub ? this.createMathMLElement("mo", null, asArray(this.renderElement(sub))) : null;
    const stubElem = this.createMathMLElement("mo", null);
    children.push(this.createMathMLElement("msubsup", null, [stubElem, subElem, supElem]));
    children.push(...this.renderElements(grouped[DomType.MmlBase].children));
    return this.createMathMLElement("mrow", null, children);
  }
  renderMmlGroupChar(elem) {
    const tagName = elem.props.verticalJustification === "bot" ? "mover" : "munder";
    const result = this.renderContainerNS(elem, ns.mathML, tagName);
    if (elem.props.char) {
      result.appendChild(this.createMathMLElement("mo", null, [elem.props.char]));
    }
    return result;
  }
  renderMmlBar(elem) {
    const style = {};
    switch (elem.props.position) {
      case "top":
        style.textDecoration = "overline";
        break;
      case "bottom":
        style.textDecoration = "underline";
        break;
    }
    return this.renderContainerNS(elem, ns.mathML, "mrow", { style });
  }
  renderMmlRun(elem) {
    return this.toHTML(elem, ns.mathML, "ms");
  }
  renderMllList(elem) {
    const children = this.renderElements(elem.children).map((x) => this.createMathMLElement("mtr", null, [
      this.createMathMLElement("mtd", null, [x])
    ]));
    return this.toHTML(elem, ns.mathML, "mtable", children);
  }
  toH(elem, ns2, tagName, children = null) {
    const { "$lang": lang, ...style } = elem.cssStyle ?? {};
    const className = cx(elem.className, elem.styleName && this.processStyleName(elem.styleName));
    return { ns: ns2, tagName, className, lang, style, children: children ?? this.renderElements(elem.children) };
  }
  toHTML(elem, ns2, tagName, children = null) {
    return this.h(this.toH(elem, ns2, tagName, children));
  }
  findStyle(styleName) {
    return styleName && this.styleMap?.[styleName];
  }
  numberingClass(id, lvl) {
    return `${this.className}-num-${id}-${lvl}`;
  }
  tabStopClass() {
    return `${this.className}-tab-stop`;
  }
  styleToString(selectors, values2, cssText = null) {
    let result = `${selectors} {\r
`;
    for (const key in values2) {
      if (key.startsWith("$"))
        continue;
      result += `  ${key}: ${values2[key]};\r
`;
    }
    if (cssText)
      result += cssText;
    return result + "}\r\n";
  }
  numberingCounter(id, lvl) {
    return `${this.className}-num-${id}-${lvl}`;
  }
  levelTextToContent(text, suff, id, numformat) {
    const suffMap = {
      "tab": "\\9",
      "space": "\\a0"
    };
    var result = text.replace(/%\d*/g, (s) => {
      let lvl = parseInt(s.substring(1), 10) - 1;
      return `"counter(${this.numberingCounter(id, lvl)}, ${numformat})"`;
    });
    return `"${result}${suffMap[suff] ?? ""}"`;
  }
  numFormatToCssValue(format) {
    var mapping = {
      none: "none",
      bullet: "disc",
      decimal: "decimal",
      lowerLetter: "lower-alpha",
      upperLetter: "upper-alpha",
      lowerRoman: "lower-roman",
      upperRoman: "upper-roman",
      decimalZero: "decimal-leading-zero",
      aiueo: "katakana",
      aiueoFullWidth: "katakana",
      chineseCounting: "simp-chinese-informal",
      chineseCountingThousand: "simp-chinese-informal",
      chineseLegalSimplified: "simp-chinese-formal",
      chosung: "hangul-consonant",
      ideographDigital: "cjk-ideographic",
      ideographTraditional: "cjk-heavenly-stem",
      ideographLegalTraditional: "trad-chinese-formal",
      ideographZodiac: "cjk-earthly-branch",
      iroha: "katakana-iroha",
      irohaFullWidth: "katakana-iroha",
      japaneseCounting: "japanese-informal",
      japaneseDigitalTenThousand: "cjk-decimal",
      japaneseLegal: "japanese-formal",
      thaiNumbers: "thai",
      koreanCounting: "korean-hangul-formal",
      koreanDigital: "korean-hangul-formal",
      koreanDigital2: "korean-hanja-informal",
      hebrew1: "hebrew",
      hebrew2: "hebrew",
      hindiNumbers: "devanagari",
      ganada: "hangul",
      taiwaneseCounting: "cjk-ideographic",
      taiwaneseCountingThousand: "cjk-ideographic",
      taiwaneseDigital: "cjk-decimal"
    };
    return mapping[format] ?? format;
  }
  refreshTabStops() {
    if (!this.options.experimental)
      return;
    setTimeout(() => {
      const pixelToPoint = computePixelToPoint();
      for (let tab of this.currentTabs) {
        updateTabStop(tab.span, tab.stops, this.defaultTabSize, pixelToPoint);
      }
    }, 500);
  }
  createElementNS(ns2, tagName, props, children) {
    return this.h({ ns: ns2, tagName, children, ...props });
  }
  createElement(tagName, props, children) {
    return this.createElementNS(ns.html, tagName, props, children);
  }
  createMathMLElement(tagName, props, children) {
    return this.createElementNS(ns.mathML, tagName, props, children);
  }
  createSvgElement(tagName, props, children) {
    return this.createElementNS(ns.svg, tagName, props, children);
  }
  later(func) {
    this.postRenderTasks.push(func);
  }
};
function findParent(elem, type) {
  var parent = elem.parent;
  while (parent != null && parent.type != type)
    parent = parent.parent;
  return parent;
}
var defaultOptions = {
  ignoreHeight: false,
  ignoreWidth: false,
  ignoreFonts: false,
  breakPages: true,
  debug: false,
  experimental: false,
  className: "docx",
  inWrapper: true,
  hideWrapperOnPrint: false,
  trimXmlDeclaration: true,
  ignoreLastRenderedPageBreak: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  useBase64URL: false,
  renderChanges: false,
  renderComments: false,
  renderAltChunks: true,
  h
};
function parseAsync(data, userOptions) {
  const ops = { ...defaultOptions, ...userOptions };
  return WordDocument.load(data, new DocumentParser(ops), ops);
}
async function renderDocument(document2, userOptions) {
  const ops = { ...defaultOptions, ...userOptions };
  const renderer = new HtmlRenderer();
  return await renderer.render(document2, ops);
}
async function renderAsync(data, bodyContainer, styleContainer, userOptions) {
  const doc = await parseAsync(data, userOptions);
  const nodes = await renderDocument(doc, userOptions);
  styleContainer ?? (styleContainer = bodyContainer);
  styleContainer.innerHTML = "";
  bodyContainer.innerHTML = "";
  for (let n of nodes) {
    const c = n.nodeName === "STYLE" ? styleContainer : bodyContainer;
    c.appendChild(n);
  }
  return doc;
}
export {
  renderAsync
};
