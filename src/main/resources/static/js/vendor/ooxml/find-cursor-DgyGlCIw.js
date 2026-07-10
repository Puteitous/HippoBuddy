//#region \0rolldown/runtime.js
var e = Object.defineProperty, t = (t, n) => {
	let r = {};
	for (var i in t) e(r, i, {
		get: t[i],
		enumerable: !0
	});
	return n || e(r, Symbol.toStringTag, { value: "Module" }), r;
}, n = class e extends Error {
	code;
	constructor(t, n) {
		super(n), this.name = "OoxmlError", this.code = t, Object.setPrototypeOf(this, e.prototype);
	}
}, r = [
	208,
	207,
	17,
	224,
	161,
	177,
	26,
	225
], i = 4294967290, a = 512, o = 128, s = 4096, c = 8192, l = new Set([
	"WordDocument",
	"Workbook",
	"Book",
	"PowerPoint Document"
]), u = "EncryptionInfo";
function d(e) {
	if (e.length < a) return null;
	for (let t = 0; t < r.length; t++) if (e[t] !== r[t]) return null;
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(30, !0);
	if (n !== 9 && n !== 12) return "cfb-unknown";
	let i = 1 << n, o = t.getUint32(48, !0), s = f(t, e.length, i, o);
	if (s === null) return "cfb-unknown";
	if (s.has(u)) return "encrypted";
	for (let e of s) if (l.has(e)) return "legacy-binary-format";
	return "cfb-unknown";
}
function f(e, t, n, r) {
	if (!g(r)) return null;
	let i = /* @__PURE__ */ new Set(), a = Math.floor(n / o);
	if (a < 1) return null;
	let l = /* @__PURE__ */ new Set(), u = r, d = 0, f = 0;
	for (; g(u) && !(d++ > c || l.has(u));) {
		l.add(u);
		let r = h(u, n);
		if (r < 0 || r + n > t) return null;
		for (let t = 0; t < a; t++) {
			if (f++ > s) return i;
			let n = p(e, r + t * o);
			n && i.add(n);
		}
		let c = m(e, t, n, u);
		if (c === null) break;
		u = c;
	}
	return i;
}
function p(e, t) {
	let n = e.getUint16(t + 64, !0);
	if (n < 2 || n > 64) return "";
	let r = n / 2 - 1, i = "";
	for (let n = 0; n < r; n++) {
		let r = e.getUint16(t + n * 2, !0);
		if (r === 0) break;
		i += String.fromCharCode(r);
	}
	return i;
}
function m(e, t, n, r) {
	let i = Math.floor(n / 4);
	if (i < 1) return null;
	let a = Math.floor(r / i), o = r % i;
	if (a >= 109) return null;
	let s = 76 + a * 4;
	if (s + 4 > t) return null;
	let c = e.getUint32(s, !0);
	if (!g(c)) return null;
	let l = h(c, n), u = l + o * 4;
	return l < 0 || u + 4 > t ? null : e.getUint32(u, !0);
}
function h(e, t) {
	return (e + 1) * t;
}
function g(e) {
	return e >= 0 && e <= i;
}
//#endregion
//#region packages/core/src/errors/cfb-read.ts
var _ = [
	208,
	207,
	17,
	224,
	161,
	177,
	26,
	225
], v = 4294967290, y = 4294967294, b = 512, x = 128, S = 4e6, C = 8e6, w = 65536, T = 1e6;
function E(e, t) {
	if (e.length < b) return null;
	for (let t = 0; t < _.length; t++) if (e[t] !== _[t]) return null;
	let n = new DataView(e.buffer, e.byteOffset, e.byteLength), r = D(n);
	if (r === null) return null;
	let i = A(n, e.length, r);
	if (i === null) return null;
	let a = M(n, e.length, r, i, t);
	if (a === null || a.target === null) return null;
	let { target: o, root: s } = a;
	return o.size === 0 ? new Uint8Array() : o.size < r.miniStreamCutoff ? s === null ? null : te(n, e.length, r, i, s, o) : ee(n, e.length, r, i, o.startSector, o.size);
}
function D(e) {
	let t = e.getUint16(30, !0);
	if (t !== 9 && t !== 12) return null;
	let n = e.getUint16(32, !0);
	return n === 6 ? {
		sectorSize: 1 << t,
		miniSectorSize: 1 << n,
		miniStreamCutoff: e.getUint32(56, !0),
		firstDirSector: e.getUint32(48, !0),
		firstMiniFatSector: e.getUint32(60, !0),
		firstDifatSector: e.getUint32(68, !0),
		numDifatSectors: e.getUint32(72, !0)
	} : null;
}
function O(e, t) {
	return (e + 1) * t;
}
function k(e) {
	return e >= 0 && e <= v;
}
function A(e, t, n) {
	let { sectorSize: r } = n, i = [];
	for (let t = 0; t < 109; t++) {
		let n = e.getUint32(76 + t * 4, !0);
		k(n) && i.push(n);
	}
	let a = r / 4 - 1, o = n.firstDifatSector, s = /* @__PURE__ */ new Set(), c = 0;
	for (; k(o);) {
		if (c++ > T) return null;
		if (s.has(o)) break;
		s.add(o);
		let n = O(o, r);
		if (n < 0 || n + r > t) return null;
		for (let t = 0; t < a; t++) {
			let r = e.getUint32(n + t * 4, !0);
			k(r) && i.push(r);
		}
		o = e.getUint32(n + a * 4, !0);
	}
	return i;
}
function j(e, t, n, r, i) {
	let a = n / 4, o = Math.floor(i / a), s = i % a;
	if (o >= r.length) return null;
	let c = r[o];
	if (!k(c)) return null;
	let l = O(c, n) + s * 4;
	return l < 0 || l + 4 > t ? null : e.getUint32(l, !0);
}
function M(e, t, n, r, i) {
	let { sectorSize: a } = n, o = Math.floor(a / x);
	if (o < 1) return null;
	let s = null, c = null, l = /* @__PURE__ */ new Set(), u = n.firstDirSector, d = 0, f = 0;
	for (; k(u);) {
		if (d++ > S) return null;
		if (l.has(u)) break;
		l.add(u);
		let n = O(u, a);
		if (n < 0 || n + a > t) return null;
		for (let t = 0; t < o; t++) {
			if (f++ > w) return {
				target: s,
				root: c
			};
			let r = n + t * x, a = e.getUint8(r + 66);
			if (a === 0) continue;
			let o = e.getUint32(r + 116, !0), l = e.getUint32(r + 120, !0);
			if (a === 5) {
				c = {
					startSector: o,
					size: l
				};
				continue;
			}
			N(e, r) === i && (s = {
				startSector: o,
				size: l
			});
		}
		let p = j(e, t, a, r, u);
		if (p === null) break;
		u = p;
	}
	return {
		target: s,
		root: c
	};
}
function N(e, t) {
	let n = e.getUint16(t + 64, !0);
	if (n < 2 || n > 64) return "";
	let r = n / 2 - 1, i = "";
	for (let n = 0; n < r; n++) {
		let r = e.getUint16(t + n * 2, !0);
		if (r === 0) break;
		i += String.fromCharCode(r);
	}
	return i;
}
function ee(e, t, n, r, i, a) {
	let { sectorSize: o } = n, s = new Uint8Array(a), c = 0, l = i, u = /* @__PURE__ */ new Set(), d = 0;
	for (; k(l) && c < a;) {
		if (d++ > S || u.has(l)) return null;
		u.add(l);
		let n = O(l, o);
		if (n < 0 || n + o > t) return null;
		let i = Math.min(o, a - c);
		s.set(new Uint8Array(e.buffer, e.byteOffset + n, i), c), c += i;
		let f = j(e, t, o, r, l);
		if (f === null) return null;
		l = f;
	}
	return c === a ? s : null;
}
function te(e, t, n, r, i, a) {
	let { sectorSize: o, miniSectorSize: s } = n, c = ee(e, t, n, r, i.startSector, i.size);
	if (c === null) return null;
	let l = new Uint8Array(a.size), u = 0, d = a.startSector, f = /* @__PURE__ */ new Set(), p = 0, m = o / 4;
	for (; k(d) && u < a.size;) {
		if (p++ > C || f.has(d)) return null;
		f.add(d);
		let i = d * s;
		if (i < 0 || i + s > c.length) return null;
		let o = Math.min(s, a.size - u);
		l.set(c.subarray(i, i + o), u), u += o;
		let h = ne(e, t, n, r, m, d);
		if (h === null) return null;
		d = h;
	}
	return u === a.size ? l : null;
}
function ne(e, t, n, r, i, a) {
	let { sectorSize: o } = n, s = Math.floor(a / i), c = a % i, l = n.firstMiniFatSector, u = /* @__PURE__ */ new Set();
	for (let n = 0; n < s; n++) {
		if (!k(l) || u.has(l)) return null;
		u.add(l);
		let n = j(e, t, o, r, l);
		if (n === null) return null;
		l = n;
	}
	if (!k(l)) return null;
	let d = O(l, o) + c * 4;
	if (d < 0 || d + 4 > t) return null;
	let f = e.getUint32(d, !0);
	return f === y ? y : f;
}
//#endregion
//#region packages/core/src/crypto/encryption-info.ts
function P(e) {
	if (typeof atob == "function") {
		let t = atob(e), n = new Uint8Array(t.length);
		for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
		return n;
	}
	let t = globalThis.Buffer;
	if (t) return new Uint8Array(t.from(e, "base64"));
	throw Error("no base64 decoder available");
}
function F(e, t, n) {
	let r = RegExp(`<(?:[\\w]+:)?${t}\\b[^>]*>`).exec(e);
	if (!r) return null;
	let i = r[0], a = RegExp(`\\b${n}\\s*=\\s*"([^"]*)"`).exec(i);
	return a ? a[1] : null;
}
function I(e) {
	if (e === null) return null;
	let t = Number(e);
	return Number.isFinite(t) ? t : null;
}
function L(e, t) {
	let n = I(F(e, t, "saltSize")), r = I(F(e, t, "blockSize")), i = I(F(e, t, "keyBits")), a = I(F(e, t, "hashSize")), o = F(e, t, "cipherAlgorithm"), s = F(e, t, "cipherChaining"), c = F(e, t, "hashAlgorithm"), l = F(e, t, "saltValue");
	return n === null || r === null || i === null || a === null || !o || !s || !c || l === null ? null : {
		saltSize: n,
		blockSize: r,
		keyBits: i,
		hashSize: a,
		cipherAlgorithm: o,
		cipherChaining: s,
		hashAlgorithm: c,
		saltValue: P(l)
	};
}
function R(e) {
	if (e.length < 8) return { kind: "unknown" };
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !0), r = t.getUint16(2, !0);
	if (n === 4 && r === 4) {
		let t = z(e.subarray(8));
		return t ? {
			kind: "agile",
			descriptor: t
		} : { kind: "unknown" };
	}
	return r === 16 && (n === 3 || n === 4) ? { kind: "extensible" } : r === 2 && (n === 2 || n === 3 || n === 4) ? { kind: "standard" } : { kind: "unknown" };
}
function z(e) {
	let t = new TextDecoder("utf-8").decode(e), n = L(t, "keyData"), r = L(t, "encryptedKey");
	if (!n || !r) return null;
	let i = I(F(t, "encryptedKey", "spinCount")), a = F(t, "encryptedKey", "encryptedVerifierHashInput"), o = F(t, "encryptedKey", "encryptedVerifierHashValue"), s = F(t, "encryptedKey", "encryptedKeyValue");
	if (i === null || a === null || o === null || s === null) return null;
	let c = {
		...r,
		spinCount: i,
		encryptedVerifierHashInput: P(a),
		encryptedVerifierHashValue: P(o),
		encryptedKeyValue: P(s)
	}, l = null, u = F(t, "dataIntegrity", "encryptedHmacKey"), d = F(t, "dataIntegrity", "encryptedHmacValue");
	return u !== null && d !== null && (l = {
		encryptedHmacKey: P(u),
		encryptedHmacValue: P(d)
	}), {
		keyData: n,
		passwordKeyEncryptor: c,
		dataIntegrity: l
	};
}
//#endregion
//#region packages/core/src/crypto/agile.ts
var B = {
	verifierHashInput: new Uint8Array([
		254,
		167,
		210,
		118,
		59,
		75,
		158,
		121
	]),
	verifierHashValue: new Uint8Array([
		215,
		170,
		15,
		109,
		48,
		97,
		52,
		78
	]),
	keyValue: new Uint8Array([
		20,
		110,
		11,
		231,
		171,
		172,
		208,
		214
	]),
	hmacKey: new Uint8Array([
		95,
		178,
		173,
		1,
		12,
		185,
		225,
		246
	]),
	hmacValue: new Uint8Array([
		160,
		103,
		127,
		2,
		178,
		44,
		132,
		51
	])
}, V = 54, H = 4096, U = class extends Error {
	reason;
	constructor(e, t) {
		super(t), this.name = "AgileDecryptError", this.reason = e;
	}
};
function W() {
	let e = globalThis.crypto;
	if (!e || !e.subtle) throw new U("unsupported-encryption", "WebCrypto (globalThis.crypto.subtle) is unavailable; cannot decrypt.");
	return e.subtle;
}
function re(e) {
	switch (e.toUpperCase().replace(/[-_]/g, "")) {
		case "SHA512": return "SHA-512";
		case "SHA384": return "SHA-384";
		case "SHA256": return "SHA-256";
		case "SHA1": return "SHA-1";
		default: throw new U("unsupported-encryption", `Unsupported hashAlgorithm "${e}" (only SHA-1/256/384/512).`);
	}
}
function G(e) {
	if (e.cipherAlgorithm.toUpperCase() !== "AES") throw new U("unsupported-encryption", `Unsupported cipherAlgorithm "${e.cipherAlgorithm}" (only AES).`);
	if (e.cipherChaining.toLowerCase() !== "chainingmodecbc") throw new U("unsupported-encryption", `Unsupported cipherChaining "${e.cipherChaining}" (only ChainingModeCBC).`);
	if (e.keyBits !== 128 && e.keyBits !== 192 && e.keyBits !== 256) throw new U("unsupported-encryption", `Unsupported keyBits ${e.keyBits} (only 128/192/256).`);
}
function ie(...e) {
	let t = e.reduce((e, t) => e + t.length, 0), n = new Uint8Array(t), r = 0;
	for (let t of e) n.set(t, r), r += t.length;
	return n;
}
function ae(e) {
	let t = new Uint8Array(4);
	return new DataView(t.buffer).setUint32(0, e >>> 0, !0), t;
}
function oe(e) {
	let t = new Uint8Array(e.length * 2), n = new DataView(t.buffer);
	for (let t = 0; t < e.length; t++) n.setUint16(t * 2, e.charCodeAt(t), !0);
	return t;
}
async function se(e, t) {
	return new Uint8Array(await W().digest(e, t));
}
function ce(e, t) {
	if (e.length > t) return e.slice(0, t);
	let n = new Uint8Array(t);
	return n.set(e), e.length < t && n.fill(V, e.length), n;
}
async function K(e, t, n, r) {
	let i = re(t.hashAlgorithm), a = await se(i, ie(t.saltValue, oe(e)));
	for (let e = 0; e < n; e++) a = await se(i, ie(ae(e), a));
	return ce(await se(i, ie(a, r)), t.keyBits / 8);
}
async function q(e, t, n) {
	return ce(n ? await se(re(e.hashAlgorithm), ie(t, n)) : t, e.blockSize);
}
async function J(e, t, n) {
	let r = t.length;
	if (n.length === 0) return new Uint8Array();
	if (n.length % r !== 0) throw new U("corrupt", "ciphertext length is not a multiple of the block size");
	let i = await W().importKey("raw", e, { name: "AES-CBC" }, !1, ["decrypt"]), a = await W().importKey("raw", e, { name: "AES-CBC" }, !1, ["encrypt"]), o = n.subarray(n.length - r), s = Y(new Uint8Array(r).fill(r), o), c = ie(n, new Uint8Array(await W().encrypt({
		name: "AES-CBC",
		iv: new Uint8Array(r)
	}, a, s)).subarray(0, r)), l = new Uint8Array(await W().decrypt({
		name: "AES-CBC",
		iv: t
	}, i, c));
	return l.length >= n.length ? l.subarray(0, n.length) : l;
}
function Y(e, t) {
	let n = new Uint8Array(e.length);
	for (let r = 0; r < e.length; r++) n[r] = e[r] ^ t[r];
	return n;
}
async function le(e, t) {
	G(t);
	let n = re(t.hashAlgorithm), r = await J(await K(e, t, t.spinCount, B.verifierHashInput), await q(t, t.saltValue, null), t.encryptedVerifierHashInput), i = await J(await K(e, t, t.spinCount, B.verifierHashValue), await q(t, t.saltValue, null), t.encryptedVerifierHashValue);
	return ue((await se(n, r)).subarray(0, t.hashSize), i.subarray(0, t.hashSize));
}
function ue(e, t) {
	if (e.length !== t.length) return !1;
	let n = 0;
	for (let r = 0; r < e.length; r++) n |= e[r] ^ t[r];
	return n === 0;
}
async function de(e, t) {
	return await J(await K(e, t, t.spinCount, B.keyValue), await q(t, t.saltValue, null), t.encryptedKeyValue);
}
async function fe(e, t, n) {
	if (G(t), e.length < 8) throw new U("corrupt", "EncryptedPackage is shorter than its size prefix");
	let r = new DataView(e.buffer, e.byteOffset, e.byteLength), i = Number(r.getBigUint64(0, !0)), a = e.subarray(8);
	if (i > a.length) throw new U("corrupt", "EncryptedPackage size prefix exceeds the ciphertext");
	let o = n.slice(0, t.keyBits / 8), s = new Uint8Array(i), c = 0, l = 0;
	for (let e = 0; e < a.length; e += H) {
		let n = a.subarray(e, e + H), r = await J(o, await q(t, t.saltValue, ae(l)), n), u = Math.min(r.length, i - c);
		if (s.set(r.subarray(0, u), c), c += u, l++, c >= i) break;
	}
	if (c !== i) throw new U("corrupt", "decrypted output is shorter than the declared size");
	return s;
}
async function pe(e, t, n) {
	let { keyData: r, passwordKeyEncryptor: i } = e;
	if (G(r), G(i), !await le(n, i)) throw new U("invalid-password", "The supplied password is incorrect.");
	return fe(t, r, await de(n, i));
}
//#endregion
//#region packages/core/src/crypto/decrypt-ooxml.ts
var me = "EncryptionInfo", he = "EncryptedPackage";
async function ge(e, t) {
	let n = E(e, me), r = E(e, he);
	if (n === null || r === null) return {
		ok: !1,
		reason: "corrupt"
	};
	let i = R(n);
	if (i.kind !== "agile") return {
		ok: !1,
		reason: "unsupported-encryption"
	};
	try {
		return {
			ok: !0,
			data: await pe(i.descriptor, r, t)
		};
	} catch (e) {
		return e instanceof U ? {
			ok: !1,
			reason: e.reason
		} : {
			ok: !1,
			reason: "corrupt"
		};
	}
}
//#endregion
//#region packages/core/src/errors/cfb-guard.ts
function _e(e) {
	let t = d(e instanceof Uint8Array ? e : new Uint8Array(e));
	if (t !== null) switch (t) {
		case "encrypted": throw new n("encrypted", "This file is password-protected (MS-OFFCRYPTO). Pass LoadOptions.password to decrypt it.");
		case "legacy-binary-format": throw new n("legacy-binary-format", "This is a legacy binary Office file (.doc/.xls/.ppt), not OOXML.");
		case "cfb-unknown": throw new n("not-ooxml", "This file is an OLE2/Compound File container, not an OOXML (ZIP) document.");
		default: throw new n("not-ooxml", "This file is an OLE2/Compound File container of an unrecognised kind, not an OOXML (ZIP) document.");
	}
}
async function ve(e, t) {
	let r = e instanceof Uint8Array ? e : new Uint8Array(e), i = d(r);
	if (i === null) return r;
	if (i === "encrypted") {
		if (t === void 0) throw new n("encrypted", "This file is password-protected (MS-OFFCRYPTO). Pass LoadOptions.password to decrypt it.");
		let e = await ge(r, t);
		if (e.ok) return e.data;
		switch (e.reason) {
			case "invalid-password": throw new n("invalid-password", "The supplied password is incorrect.");
			case "unsupported-encryption": throw new n("unsupported-encryption", "This file uses an encryption scheme other than Agile ([MS-OFFCRYPTO]) that is not supported (Standard / Extensible / legacy binary encryption).");
			case "corrupt": throw new n("not-ooxml", "This file is an encrypted OLE2/Compound File container but its structure could not be read.");
			default: throw e.reason, new n("not-ooxml", "This encrypted file could not be decrypted.");
		}
	}
	return _e(r), r;
}
function ye(e) {
	return e.byteOffset === 0 && e.byteLength === e.buffer.byteLength && e.buffer instanceof ArrayBuffer ? e.buffer : e.slice().buffer;
}
//#endregion
//#region packages/core/src/fonts/font-registry.ts
var be = /* @__PURE__ */ new Map();
function xe(e, t, n) {
	let r = be.get(e);
	if (r && r.set === t) return r.refs++, {
		face: r.face,
		isNew: !1
	};
	let i = n();
	return be.set(e, {
		face: i,
		set: t,
		refs: 1
	}), {
		face: i,
		isNew: !0
	};
}
function Se(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) if (!t.has(n)) {
		t.add(n);
		for (let [e, t] of be) if (t.face === n) {
			if (t.refs--, t.refs <= 0) {
				try {
					t.set.delete(n);
				} catch {}
				be.delete(e);
			}
			break;
		}
	}
}
//#endregion
//#region packages/core/src/fonts/preload.ts
var Ce = 15e3;
function we(e) {
	return Promise.race([e, new Promise((e) => setTimeout(e, Ce))]);
}
var Te = /* @__PURE__ */ new Map();
function Ee(e) {
	let t = [], n = /@font-face\s*\{([^}]*)\}/g, r;
	for (; r = n.exec(e);) {
		let e = r[1], n = (t) => e.match(RegExp(`(?:^|;|\\n)\\s*${t}\\s*:\\s*([^;]+)`, "i"))?.[1].trim(), i = n("font-family"), a = n("src");
		if (!i || !a) continue;
		let o = {}, s = n("font-style");
		s && (o.style = s);
		let c = n("font-weight");
		c && (o.weight = c);
		let l = n("font-stretch");
		l && (o.stretch = l);
		let u = n("unicode-range");
		u && (o.unicodeRange = u), t.push({
			family: i.replace(/^['"]|['"]$/g, ""),
			src: a,
			descriptors: o
		});
	}
	return t;
}
function De() {
	return typeof document < "u" && document && document.fonts ? document.fonts : typeof self < "u" && self && "fonts" in self ? self.fonts : null;
}
function Oe(e, t) {
	let n = t.descriptors;
	return [
		"gfonts",
		e,
		t.family.toLowerCase(),
		n.style ?? "",
		n.weight ?? "",
		n.stretch ?? "",
		n.unicodeRange ?? "",
		t.src
	].join("|");
}
async function ke(e, t) {
	let n = De();
	if (!n || typeof FontFace > "u" || typeof fetch > "u") return [];
	let r = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Set();
	for (let n of e) {
		if (!n) continue;
		let e = n.toLowerCase();
		if (r.has(e)) continue;
		r.add(e);
		let s = t[e];
		if (!s) continue;
		a.add(s.url);
		let c = (s.loadFamily ?? n).toLowerCase();
		i.add(c);
		let l = o.get(s.url);
		l || (l = /* @__PURE__ */ new Set(), o.set(s.url, l)), l.add(c);
	}
	if (i.size === 0) return [];
	let c = await we(Promise.all([...a].map(async (e) => {
		let t = Te.get(e);
		if (t) return {
			url: e,
			rules: await t
		};
		let n = (async () => {
			try {
				let t = await fetch(e);
				if (!t.ok) throw Error(`HTTP ${t.status}`);
				return Ee(await t.text());
			} catch {
				Te.delete(e);
				for (let t of o.get(e) ?? []) s.add(t);
				return [];
			}
		})();
		return Te.set(e, n), {
			url: e,
			rules: await n
		};
	}))), l = [], u = [];
	for (let e of Array.isArray(c) ? c : []) for (let t of e.rules) {
		let { face: r, isNew: i } = xe(Oe(e.url, t), n, () => {
			let e = new FontFace(t.family, t.src, t.descriptors);
			return n.add(e), e;
		});
		l.push(r), i && u.push(r);
	}
	return u.length > 0 && await we(Promise.allSettled(u.map((e) => e.load())).then((e) => (e.forEach((e, t) => {
		e.status === "rejected" && s.add(u[t].family.replace(/['"]/g, "").toLowerCase());
	}), n.ready))), s.size > 0 && console.warn(`[ooxml] failed to preload web font(s): ${[...s].join(", ")}; falling back to system fonts (text may shift or differ).`), l;
}
function Ae(e) {
	Se(e);
}
//#endregion
//#region packages/core/src/fonts/google-fonts.ts
var je = "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap", Me = "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap", Ne = {
	calibri: {
		url: "https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&display=swap",
		loadFamily: "Carlito"
	},
	"calibri light": {
		url: "https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&display=swap",
		loadFamily: "Carlito"
	},
	cambria: {
		url: "https://fonts.googleapis.com/css2?family=Caladea:ital,wght@0,400;0,700;1,400;1,700&display=swap",
		loadFamily: "Caladea"
	},
	"cambria math": {
		url: "https://fonts.googleapis.com/css2?family=Caladea:ital,wght@0,400;0,700;1,400;1,700&display=swap",
		loadFamily: "Caladea"
	},
	"nunito sans": { url: "https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	nunito: { url: "https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	"open sans": { url: "https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	roboto: { url: "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	lato: { url: "https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	montserrat: { url: "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	poppins: { url: "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	raleway: { url: "https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	"playfair display": { url: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	ubuntu: { url: "https://fonts.googleapis.com/css2?family=Ubuntu:ital,wght@0,400;0,700;1,400;1,700&display=swap" },
	"sakkal majalla": {
		url: je,
		loadFamily: "Noto Naskh Arabic"
	},
	"traditional arabic": {
		url: je,
		loadFamily: "Noto Naskh Arabic"
	},
	"simplified arabic": {
		url: je,
		loadFamily: "Noto Naskh Arabic"
	},
	"arabic typesetting": {
		url: je,
		loadFamily: "Noto Naskh Arabic"
	},
	"univers next arabic": {
		url: Me,
		loadFamily: "Noto Sans Arabic"
	},
	"noto naskh arabic": {
		url: je,
		loadFamily: "Noto Naskh Arabic"
	},
	"noto sans arabic": {
		url: Me,
		loadFamily: "Noto Sans Arabic"
	}
};
//#endregion
//#region packages/core/src/fonts/scripts.ts
function Pe(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return /[ᄀ-ᇿ㄰-㆏가-힯]/.test(e) ? "kr" : /[぀-ヿ]/.test(e) ? "jp" : /jhenghei|微軟正黑|新細明|細明|pmingliu|mingliu|dfkai|標楷|華康|cns11643|kaiti tc|ming\s*liu/.test(t) || /新細明體|細明體|標楷體|微軟正黑體|華康/.test(e) ? "tc" : /simsun|nsimsun|simhei|simkai|simfang|yahei|dengxian|fangsong|kaiti|youyuan|lisu|stsong|stkaiti|stfangsong|stheiti|stxihei|stzhongsong|songti sc|heiti sc|微软雅黑/.test(t) || /宋体|黑体|楷体|仿宋|等线|微软雅黑|隶书|幼圆/.test(e) ? "sc" : /malgun|batang|gulim|dotum|gungsuh|nanum|new gulim|hancom|hy(gothic|graphic|namu)?/.test(t) ? "kr" : /\bmeiryo\b|\byu\s*(gothic|mincho)\b|yugothic|yumincho|hiragino|\bms\s*(gothic|mincho|pgothic|pmincho|ui\s*gothic)\b|\bms[pg]?(gothic|mincho)\b|ipa(ex)?(gothic|mincho)|noto\s+(sans|serif)\s+jp|游ゴシック|游明朝|ＭＳ|メイリオ|ヒラギノ/.test(t) || /游ゴシック|游明朝|ＭＳ ゴシック|ＭＳ 明朝|ＭＳ Ｐゴシック|メイリオ|ヒラギノ/.test(e) ? "jp" : null;
}
function Fe(e) {
	if (!e) return "sans";
	let t = e.toLowerCase();
	return /mono|courier|consolas|等幅|gothic_m/.test(t) ? "mono" : /roman|times|cambria|caladea|georgia|garamond|century(?!\s*gothic)|palatino|antiqua|didot|bodoni|playfair|source serif|noto serif|min\s*cho|明朝体|明朝|song|sung|simsun|nsimsun|batang|gungsuh|ming\s*liu|mingliu|pmingliu|fang\s*song|fangsong|kai\s*ti|kaiti|simkai|simfang|stsong|stkaiti|stfangsong|stzhongsong|新細明|細明|宋体|楷体|楷體|仿宋|標楷|游明朝|ＭＳ 明朝|ms mincho|yu mincho|hiragino mincho|ヒラギノ明朝/.test(t) || /新細明體|細明體|宋体|明朝|楷体|楷體|仿宋|標楷體|游明朝|ＭＳ 明朝/.test(e) ? "serif" : "sans";
}
function Ie(e) {
	return e >= 1424 && e <= 1535 || e >= 1536 && e <= 1791 || e >= 1792 && e <= 1871 || e >= 1872 && e <= 1919 || e >= 1920 && e <= 1983 || e >= 1984 && e <= 2047 || e >= 2048 && e <= 2111 || e >= 2112 && e <= 2143 || e >= 2144 && e <= 2303 || e >= 64285 && e <= 64335 || e >= 64336 && e <= 65023 || e >= 65136 && e <= 65279 || e >= 67584 && e <= 69631 || e >= 124928 && e <= 126975;
}
function Le(e, t) {
	let n = t === "serif" ? "Noto Serif" : "Noto Sans", r = {
		jp: [
			"jp",
			"sc",
			"tc",
			"kr"
		],
		sc: [
			"sc",
			"tc",
			"jp",
			"kr"
		],
		tc: [
			"tc",
			"sc",
			"jp",
			"kr"
		],
		kr: [
			"kr",
			"jp",
			"sc",
			"tc"
		]
	}, i = {
		kr: "KR",
		sc: "SC",
		tc: "TC",
		jp: "JP"
	};
	return r[e].map((e) => `${n} ${i[e]}`);
}
var Re = [
	"Noto Sans",
	"Noto Sans Hebrew",
	"Noto Sans Thai",
	"Noto Sans Devanagari"
], ze = ["Noto Serif", "Noto Serif Hebrew"], Be = (e) => `https://fonts.googleapis.com/css2?family=${e}:wght@400;700&display=swap`, Ve = {
	"noto sans kr": { url: Be("Noto+Sans+KR") },
	"noto sans sc": { url: Be("Noto+Sans+SC") },
	"noto sans tc": { url: Be("Noto+Sans+TC") },
	"noto sans jp": { url: Be("Noto+Sans+JP") },
	"noto serif kr": { url: Be("Noto+Serif+KR") },
	"noto serif sc": { url: Be("Noto+Serif+SC") },
	"noto serif tc": { url: Be("Noto+Serif+TC") },
	"noto serif jp": { url: Be("Noto+Serif+JP") },
	"noto sans": { url: Be("Noto+Sans") },
	"noto serif": { url: Be("Noto+Serif") },
	"noto sans devanagari": { url: Be("Noto+Sans+Devanagari") },
	"noto sans thai": { url: Be("Noto+Sans+Thai") },
	"noto sans hebrew": { url: Be("Noto+Sans+Hebrew") },
	"noto serif hebrew": { url: Be("Noto+Serif+Hebrew") }
};
function He(e, t) {
	let n = !1, r = !1, i = !1, a = !1, o = !1, s = !1, c = !1, l = !1, u = () => n && r && i && a && o && s && c && l;
	outer: for (let t of e) if (t) for (let e of t) {
		let t = e.codePointAt(0);
		if (t !== void 0 && !(t <= 591) && (t >= 4352 && t <= 4607 || t >= 12592 && t <= 12687 || t >= 44032 && t <= 55215 ? r = !0 : t >= 12352 && t <= 12543 ? i = !0 : t >= 13312 && t <= 19903 || t >= 19968 && t <= 40959 || t >= 63744 && t <= 64255 || t >= 131072 && t <= 195103 ? n = !0 : t >= 1536 && t <= 1791 || t >= 1872 && t <= 1919 || t >= 2208 && t <= 2303 || t >= 64336 && t <= 65023 || t >= 65136 && t <= 65279 ? a = !0 : t >= 3584 && t <= 3711 ? o = !0 : t >= 1424 && t <= 1535 || t >= 64285 && t <= 64335 ? s = !0 : t >= 2304 && t <= 2431 ? c = !0 : (t >= 1024 && t <= 1279 || t >= 880 && t <= 1023) && (l = !0), u())) break outer;
	}
	let d = [], f = /* @__PURE__ */ new Set();
	r && f.add("kr"), i && f.add("jp"), n && f.size === 0 && f.add(t ?? "jp");
	for (let e of [
		"kr",
		"sc",
		"tc",
		"jp"
	]) if (f.has(e)) {
		let t = {
			kr: "KR",
			sc: "SC",
			tc: "TC",
			jp: "JP"
		}[e];
		d.push(`Noto Sans ${t}`, `Noto Serif ${t}`);
	}
	return l && d.push("Noto Sans", "Noto Serif"), a && d.push("Noto Naskh Arabic", "Noto Sans Arabic"), o && d.push("Noto Sans Thai"), s && d.push("Noto Sans Hebrew", "Noto Serif Hebrew"), c && d.push("Noto Sans Devanagari"), d;
}
//#endregion
//#region packages/core/src/chart/layout.ts
function Ue(e, t, n) {
	return e.titleFontSizeHpt ? e.titleFontSizeHpt / 100 * n : Math.max(10, t * .085);
}
var We = .62;
function Ge(e, t, n, r, i) {
	if (!e.title) return {
		fontPx: 0,
		topPad: 0,
		bottomPad: 0,
		bandH: 0
	};
	let a = Ue(e, t, n), o = a + t * r + t * i, s = Math.min(Math.max(0, o - a), a * We);
	return {
		fontPx: a,
		topPad: s,
		bottomPad: o - a - s,
		bandH: o
	};
}
function Ke(e, t, n, r) {
	if (!e.showLegend) return null;
	let i = e.legendPos ?? "r", a = i === "l" ? "l" : i === "t" ? "t" : i === "b" ? "b" : "r";
	return a === "r" || a === "l" ? {
		side: a,
		reserveW: Math.max(80, t * r),
		reserveH: 0
	} : {
		side: a,
		reserveW: 0,
		reserveH: Math.max(18, n * .08)
	};
}
function qe(e) {
	return {
		legRightW: e?.side === "r" ? e.reserveW : 0,
		legLeftW: e?.side === "l" ? e.reserveW : 0,
		legTopH: e?.side === "t" ? e.reserveH : 0,
		legBottomH: e?.side === "b" ? e.reserveH : 0
	};
}
function Je(e, t, n) {
	return e ? e / 100 * n : Math.max(8, Math.min(10, t * .045));
}
function Ye(e) {
	return Math.max(8, e * .02);
}
function Xe(e, t, n, r) {
	let i = Je(e.catAxisTitleFontSizeHpt, n, r), a = Je(e.valAxisTitleFontSizeHpt, n, r);
	return {
		catFontPx: i,
		valFontPx: a,
		catBandH: e.catAxisTitle ? i + Ye(n) + 4 : 0,
		valBandW: e.valAxisTitle ? a + Ye(t) + 4 : 0
	};
}
var Ze = 2.25, Qe = 2.75;
function $e(e, t, n) {
	if (!e.title) return {
		fontPx: 0,
		topPad: 0,
		bottomPad: 0,
		bandH: 0
	};
	let r = Ue(e, t, n), i = r * Ze, a = Math.min(Math.max(0, i - r), r * We);
	return {
		fontPx: r,
		topPad: a,
		bottomPad: i - r - a,
		bandH: i
	};
}
function et(e) {
	return e * Qe;
}
function tt(e, t, n, r, i, a, o) {
	let s = o.titleBand ?? Ge(e, i, a, o.titleTopPadFrac ?? 0, o.titleBottomPadFrac ?? 0), c = Ke(e, r, i, o.legendSideReserveFrac), l = qe(c), u = Xe(e, r, i, a), d, f, p, m;
	if (o.radialGapFrac != null) {
		let e = i * o.radialGapFrac;
		p = r - l.legRightW - l.legLeftW, m = i - s.bandH - l.legTopH - l.legBottomH - e, d = t + l.legLeftW, f = n + s.bandH + l.legTopH + e;
	} else {
		let a = o.pad;
		if (!a) throw Error("computeChartFrame: cartesian frame requires params.pad");
		let s = o.honorPlotAreaManualLayout ? e.plotAreaManualLayout : null;
		s && s.w != null && s.h != null ? (d = t + s.x * r, f = n + s.y * i, p = s.w * r, m = s.h * i) : (d = t + a.l, f = n + a.t, p = r - a.l - a.r, m = i - a.t - a.b);
	}
	return {
		title: s,
		legend: c,
		legendBands: l,
		axisTitles: u,
		plotRect: {
			px0: d,
			py0: f,
			pw: p,
			ph: m
		},
		center: {
			cx: d + p / 2,
			cy: f + m / 2
		}
	};
}
//#endregion
//#region packages/core/src/chart/axis-scale.ts
function nt(e, t = 5) {
	if (e === 0) return 1;
	let n = e / t, r = 10 ** Math.floor(Math.log10(n)), i = n / r;
	return (i < 1.5 ? 1 : i < 3.5 ? 2 : i < 7.5 ? 5 : 10) * r;
}
function rt(e, t, n = 0) {
	if (e <= 0) return t;
	let r = e + (e - n) / 20;
	return Math.ceil(r / t) * t;
}
function it(e, t) {
	if (e >= 0) return 0;
	let n = Math.floor(e / t) * t;
	return Math.abs(n - e) < t * 1e-9 ? n - t : n;
}
var at = 42;
function ot(e) {
	return e == null || !isFinite(e) || e <= 0 ? 5 : Math.min(15, Math.max(4, Math.round(e / at)));
}
function st(e, t, n, r, i, a) {
	let o = nt(t - e, ot(i)), s = a != null && isFinite(a) && a > 0 ? a : o, c = n ?? it(e, o);
	return {
		min: c,
		max: r ?? rt(t, o, c),
		step: s
	};
}
function ct(e, t, n, r) {
	let i, a = r?.logBase;
	if (a != null && isFinite(a) && a >= 2 && t > 0 && n > 0) {
		let r = Math.log(t), a = Math.log(n) - r;
		i = a === 0 ? 0 : (Math.log(Math.max(e, Number.MIN_VALUE)) - r) / a;
	} else {
		let r = n - t;
		i = r === 0 ? 0 : (e - t) / r;
	}
	return r?.reversed ? 1 - i : i;
}
function lt(e, t, n, r, i) {
	let a = isFinite(n) && n >= 2 ? n : 10, o = (e) => Math.log(e) / Math.log(a), s = t > 0 ? t : 1, c = Math.floor(o(e > 0 ? e : s)), l = Math.ceil(o(s)), u = r ?? a ** +c, d = i ?? a ** +Math.max(l, c + 1), f = [], p = Math.ceil(o(u) - 1e-9), m = Math.floor(o(d) + 1e-9);
	for (let e = p; e <= m; e++) f.push(a ** +e);
	return {
		min: u,
		max: d,
		lines: f
	};
}
function ut(e, t, n, r) {
	let i = Math.min(e.length, t.length);
	if (i < 2) return {
		xs: [],
		ys: []
	};
	if (n === "linear") {
		let n = r?.intercept, a = 0, o = 0, s = 0, c = 0;
		for (let n = 0; n < i; n++) a += e[n], o += t[n], s += e[n] * e[n], c += e[n] * t[n];
		let l, u;
		if (n != null && isFinite(n)) {
			let e = s, t = c - n * a;
			l = e === 0 ? 0 : t / e, u = n;
		} else {
			let e = i * s - a * a;
			l = e === 0 ? 0 : (i * c - a * o) / e, u = (o - l * a) / i;
		}
		let d = e[0], f = e[i - 1];
		return {
			xs: [d, f],
			ys: [l * d + u, l * f + u]
		};
	}
	if (n === "movingAvg") {
		let n = Math.max(2, Math.round(r?.period ?? 2));
		if (i < n) return {
			xs: [],
			ys: []
		};
		let a = [], o = [];
		for (let r = n - 1; r < i; r++) {
			let i = 0;
			for (let e = 0; e < n; e++) i += t[r - e];
			a.push(e[r]), o.push(i / n);
		}
		return {
			xs: a,
			ys: o
		};
	}
	return {
		xs: [],
		ys: []
	};
}
//#endregion
//#region packages/core/src/units.ts
var dt = 12700, ft = 9525, pt = 4 / 3;
//#endregion
//#region packages/core/src/chart/axis-style.ts
function mt(e, t) {
	return e ? Math.max(.5, e / dt) * t : 1;
}
function ht(e, t, n) {
	return {
		color: e ? `#${e}` : "#aaa",
		width: mt(t, n)
	};
}
function gt(e, t, n) {
	return {
		color: e ? `#${e}` : "#e0e0e0",
		width: t ? mt(t, n) : .5
	};
}
function _t(e) {
	return e.catAxisCrossBetween !== "midCat";
}
//#endregion
//#region packages/core/src/excel-date.ts
var vt = 864e5, yt = Date.UTC(1899, 11, 30), bt = Date.UTC(1904, 0, 1);
function xt(e, t = !1) {
	if (t) return new Date(bt + e * vt);
	let n = e < 60 ? e + 1 : e;
	return new Date(yt + n * vt);
}
function St(e, t = !1) {
	if (t) return (e.getTime() - bt) / vt;
	let n = (e.getTime() - yt) / vt;
	return n <= 60 ? n - 1 : n;
}
//#endregion
//#region packages/core/src/text/round-decimal.ts
function Ct(e, t) {
	if (!Number.isFinite(e)) return String(e);
	let n = Math.max(0, Math.trunc(t)), r = e < 0, [i, a = ""] = wt(Math.abs(e).toString()).split("."), o = a.padEnd(n + 1, "0"), s = o.slice(0, n), c = o.charCodeAt(n) - 48, l = (i + s).split("").map((e) => e.charCodeAt(0) - 48);
	if (c >= 5) {
		let e = l.length - 1;
		for (; e >= 0; e--) if (l[e] === 9) l[e] = 0;
		else {
			l[e] += 1;
			break;
		}
		e < 0 && l.unshift(1);
	}
	let u = l.map((e) => String(e)).join(""), d = n, f = (d > 0 ? u.slice(0, u.length - d) : u) || "0", p = d > 0 ? u.slice(u.length - d) : "", m = f.replace(/^0+(?=\d)/, ""), h = p.length > 0 ? `${m}.${p}` : m, g = /^[0.]*$/.test(h) && !/[1-9]/.test(h);
	return r && !g ? `-${h}` : h;
}
function wt(e) {
	let t = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(e);
	if (!t) return e;
	let [, n, r = "", i] = t, a = parseInt(i, 10), o = n + r, s = n.length + a;
	return s <= 0 ? "0." + "0".repeat(-s) + o : s >= o.length ? o + "0".repeat(s - o.length) : o.slice(0, s) + "." + o.slice(s);
}
//#endregion
//#region packages/core/src/chart/chart-number-format.ts
function Tt(e) {
	return Number.isInteger(e) ? String(e) : Ct(e, 6).replace(/\.?0+$/, "");
}
function X(e, t, n = !1) {
	if (!t || t.trim().toLowerCase() === "general") return Tt(e);
	if (Dt(t)) return Ot(e, t, n);
	let r = kt(t), i;
	return i = e > 0 ? r[0] ?? t : e < 0 ? r[1] ?? r[0] ?? t : r[2] ?? r[0] ?? t, i === "" ? "" : (e < 0 && r.length < 2 ? "-" : "") + At(Math.abs(e), i);
}
function Et(e, t, n = !1) {
	if (!t || e.trim() === "") return e;
	let r = Number(e);
	return Number.isFinite(r) ? X(r, t, n) : e;
}
function Dt(e) {
	let t = !1;
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		if (r === "\"") {
			t = !t;
			continue;
		}
		if (!t) {
			if (r === "\\") {
				n++;
				continue;
			}
			if (r === "[") {
				for (; n < e.length && e[n] !== "]";) n++;
				continue;
			}
			if (r === "y" || r === "Y" || r === "d" || r === "D" || r === "m" || r === "M" || r === "h" || r === "H" || r === "s" || r === "S") return !0;
		}
	}
	return !1;
}
function Ot(e, t, n = !1) {
	let r = xt(Math.floor(e), n), i = r.getUTCFullYear(), a = r.getUTCMonth() + 1, o = r.getUTCDate(), s = (e - Math.floor(e)) * 86400, c = Math.floor(s / 3600), l = Math.floor(s % 3600 / 60), u = Math.floor(s % 60), d = "", f = !1, p = 0;
	for (; p < t.length;) {
		let e = t[p];
		if (e === "\"") {
			f = !f, p++;
			continue;
		}
		if (f) {
			d += e, p++;
			continue;
		}
		if (e === "\\" && p + 1 < t.length) {
			d += t[p + 1], p += 2;
			continue;
		}
		if (e === "[") {
			for (; p < t.length && t[p] !== "]";) p++;
			p < t.length && p++;
			continue;
		}
		if (e === "y" || e === "Y") {
			let e = 0;
			for (; p < t.length && (t[p] === "y" || t[p] === "Y");) e++, p++;
			d += e >= 3 ? String(i) : String(i % 100).padStart(2, "0");
			continue;
		}
		if (e === "m" || e === "M") {
			let e = 0;
			for (; p < t.length && (t[p] === "m" || t[p] === "M");) e++, p++;
			d.match(/[Hh]+\W*$/) ? d += e >= 2 ? String(l).padStart(2, "0") : String(l) : d += e >= 2 ? String(a).padStart(2, "0") : String(a);
			continue;
		}
		if (e === "d" || e === "D") {
			let e = 0;
			for (; p < t.length && (t[p] === "d" || t[p] === "D");) e++, p++;
			d += e >= 2 ? String(o).padStart(2, "0") : String(o);
			continue;
		}
		if (e === "h" || e === "H") {
			let e = 0;
			for (; p < t.length && (t[p] === "h" || t[p] === "H");) e++, p++;
			d += e >= 2 ? String(c).padStart(2, "0") : String(c);
			continue;
		}
		if (e === "s" || e === "S") {
			let e = 0;
			for (; p < t.length && (t[p] === "s" || t[p] === "S");) e++, p++;
			d += e >= 2 ? String(u).padStart(2, "0") : String(u);
			continue;
		}
		d += e, p++;
	}
	return d;
}
function kt(e) {
	let t = [], n = "";
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		if (i === "\\" && r + 1 < e.length) {
			n += i + e[r + 1], r++;
			continue;
		}
		if (i === "\"") {
			for (n += i, r++; r < e.length && e[r] !== "\"";) n += e[r], r++;
			r < e.length && (n += e[r]);
			continue;
		}
		if (i === "[") {
			for (n += i, r++; r < e.length && e[r] !== "]";) n += e[r], r++;
			r < e.length && (n += e[r]);
			continue;
		}
		if (i === ";") {
			t.push(n), n = "";
			continue;
		}
		n += i;
	}
	return t.push(n), t;
}
function At(e, t) {
	let n = [], r = 0, i = !1, a = !1;
	for (; r < t.length;) {
		let e = t[r];
		if (e === "\"") {
			r++;
			let e = "";
			for (; r < t.length && t[r] !== "\"";) e += t[r], r++;
			r < t.length && r++, n.push({
				kind: "lit",
				text: e
			});
			continue;
		}
		if (e === "\\" && r + 1 < t.length) {
			n.push({
				kind: "lit",
				text: t[r + 1]
			}), r += 2;
			continue;
		}
		if (e === "_" && r + 1 < t.length) {
			n.push({
				kind: "lit",
				text: " "
			}), r += 2;
			continue;
		}
		if (e === "*" && r + 1 < t.length) {
			r += 2;
			continue;
		}
		if (e === "[") {
			for (r++; r < t.length && t[r] !== "]";) r++;
			r < t.length && r++;
			continue;
		}
		if (e === "%") {
			a = !0, n.push({
				kind: "lit",
				text: "%"
			}), r++;
			continue;
		}
		if (e === "#" || e === "0" || e === "." || e === "," || e === "?") {
			let e = "";
			for (; r < t.length && (t[r] === "#" || t[r] === "0" || t[r] === "." || t[r] === "," || t[r] === "?");) e += t[r], r++;
			n.push({
				kind: "num",
				text: e
			}), i = !0;
			continue;
		}
		n.push({
			kind: "lit",
			text: e
		}), r++;
	}
	if (!i) return n.map((e) => e.text).join("");
	let o = a ? e * 100 : e, s = "";
	for (let e of n) e.kind === "num" && (s += e.text);
	let c = jt(o, s), l = !1;
	return n.map((e) => e.kind === "lit" ? e.text : l ? "" : (l = !0, c)).join("");
}
function jt(e, t) {
	let n = t.indexOf("."), r = n >= 0 ? t.slice(0, n) : t, i = n >= 0 ? t.slice(n + 1) : "", a = /,/.test(r), o = (i.match(/[#0?]/g) ?? []).length, s = (r.replace(/,/g, "").match(/0/g) ?? []).length, [c, l = ""] = Ct(e, o).split("."), u = c.padStart(s, "0"), d = a ? u.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : u;
	return o === 0 ? d : `${d}.${l.padEnd(o, "0")}`;
}
//#endregion
//#region packages/core/src/chart/text-elide.ts
var Mt = "…";
function Nt(e, t, n) {
	if (t === "" || n <= 0) return "";
	if (e.measureText(t).width <= n) return t;
	if (e.measureText(Mt).width > n) return "";
	let r = 0, i = t.length - 1, a = 0;
	for (; r <= i;) {
		let o = r + i >> 1;
		e.measureText(t.slice(0, o) + Mt).width <= n ? (a = o, r = o + 1) : i = o - 1;
	}
	let o = a > 0 ? t.charCodeAt(a - 1) : 0;
	return o >= 55296 && o <= 56319 && a--, t.slice(0, a) + Mt;
}
//#endregion
//#region packages/core/src/canvas/aux-canvas.ts
function Pt(e, t) {
	let n = Math.max(1, Math.ceil(e)), r = Math.max(1, Math.ceil(t));
	if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(n, r);
	if (typeof document < "u") {
		let e = document.createElement("canvas");
		return e.width = n, e.height = r, e;
	}
	return null;
}
//#endregion
//#region packages/core/src/shape/pattern-bitmaps.ts
var Ft = {
	pct5: [
		0,
		16,
		0,
		0,
		0,
		1,
		0,
		0
	],
	pct10: [
		136,
		0,
		34,
		0,
		136,
		0,
		34,
		0
	],
	pct20: [
		136,
		34,
		136,
		34,
		136,
		34,
		136,
		34
	],
	pct25: [
		136,
		85,
		34,
		85,
		136,
		85,
		34,
		85
	],
	pct30: [
		170,
		85,
		170,
		85,
		170,
		85,
		170,
		85
	],
	pct40: [
		170,
		119,
		170,
		221,
		170,
		119,
		170,
		221
	],
	pct50: [
		170,
		85,
		170,
		85,
		170,
		85,
		170,
		85
	],
	pct60: [
		221,
		85,
		119,
		85,
		221,
		85,
		119,
		85
	],
	pct70: [
		238,
		85,
		187,
		85,
		238,
		85,
		187,
		85
	],
	pct75: [
		238,
		170,
		187,
		170,
		238,
		170,
		187,
		170
	],
	pct80: [
		254,
		239,
		251,
		191,
		254,
		239,
		251,
		191
	],
	pct90: [
		255,
		239,
		255,
		251,
		255,
		239,
		255,
		251
	],
	horz: [
		255,
		0,
		0,
		0,
		255,
		0,
		0,
		0
	],
	vert: [
		136,
		136,
		136,
		136,
		136,
		136,
		136,
		136
	],
	ltHorz: [
		0,
		255,
		0,
		0,
		0,
		0,
		0,
		0
	],
	ltVert: [
		32,
		32,
		32,
		32,
		32,
		32,
		32,
		32
	],
	dkHorz: [
		255,
		255,
		0,
		0,
		255,
		255,
		0,
		0
	],
	dkVert: [
		204,
		204,
		204,
		204,
		204,
		204,
		204,
		204
	],
	narHorz: [
		255,
		0,
		255,
		0,
		255,
		0,
		255,
		0
	],
	narVert: [
		170,
		170,
		170,
		170,
		170,
		170,
		170,
		170
	],
	cross: [
		255,
		136,
		136,
		136,
		255,
		136,
		136,
		136
	],
	lgGrid: [
		255,
		128,
		128,
		128,
		128,
		128,
		128,
		128
	],
	smGrid: [
		255,
		136,
		136,
		136,
		255,
		136,
		136,
		136
	],
	dotGrid: [
		136,
		0,
		0,
		0,
		136,
		0,
		0,
		0
	],
	dnDiag: [
		128,
		64,
		32,
		16,
		8,
		4,
		2,
		1
	],
	upDiag: [
		1,
		2,
		4,
		8,
		16,
		32,
		64,
		128
	],
	ltDnDiag: [
		136,
		68,
		34,
		17,
		136,
		68,
		34,
		17
	],
	ltUpDiag: [
		17,
		34,
		68,
		136,
		17,
		34,
		68,
		136
	],
	dkDnDiag: [
		195,
		129,
		0,
		129,
		195,
		129,
		0,
		129
	],
	dkUpDiag: [
		195,
		129,
		0,
		129,
		195,
		129,
		0,
		129
	],
	wdDnDiag: [
		128,
		64,
		32,
		16,
		8,
		4,
		2,
		129
	],
	wdUpDiag: [
		1,
		2,
		4,
		8,
		16,
		32,
		64,
		129
	],
	diagCross: [
		129,
		66,
		36,
		24,
		24,
		36,
		66,
		129
	],
	horzBrick: [
		255,
		16,
		16,
		16,
		255,
		1,
		1,
		1
	],
	diagBrick: [
		129,
		66,
		36,
		24,
		36,
		66,
		129,
		0
	],
	lgCheck: [
		240,
		240,
		240,
		240,
		15,
		15,
		15,
		15
	],
	smCheck: [
		204,
		204,
		51,
		51,
		204,
		204,
		51,
		51
	],
	trellis: [
		165,
		90,
		165,
		90,
		165,
		90,
		165,
		90
	]
};
function It(e, t, n) {
	let r = Ft[e];
	if (!r) return null;
	let i = Pt(8, 8);
	if (!i) return null;
	let a = i.getContext("2d");
	if (!a) return null;
	a.fillStyle = Lt(n), a.fillRect(0, 0, 8, 8), a.fillStyle = Lt(t);
	for (let e = 0; e < 8; e++) {
		let t = r[e];
		for (let n = 0; n < 8; n++) t & 1 << 7 - n && a.fillRect(n, e, 1, 1);
	}
	return i;
}
function Lt(e) {
	return `rgba(${parseInt(e.slice(0, 2), 16)},${parseInt(e.slice(2, 4), 16)},${parseInt(e.slice(4, 6), 16)},${e.length >= 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1})`;
}
//#endregion
//#region packages/core/src/draw/dash.ts
function Rt(e, t) {
	return e.map((e) => e * t);
}
var zt = {
	dotted: [1, 2],
	dashed: [3, 2],
	dashSmallGap: [3, 1],
	dotDash: [
		1,
		2,
		3,
		2
	],
	dotDotDash: [
		1,
		2,
		1,
		2,
		3,
		2
	],
	dashDotStroked: [
		1,
		2,
		3,
		2
	]
};
function Bt(e, t) {
	let n = zt[e];
	return n ? Rt(n, t) : [];
}
var Vt = {
	hair: [1, 1],
	dashed: [4, 3],
	mediumDashed: [4, 3],
	dotted: [2, 2],
	dashDot: [
		4,
		2,
		1,
		2
	],
	mediumDashDot: [
		4,
		2,
		1,
		2
	],
	dashDotDot: [
		4,
		2,
		1,
		2,
		1,
		2
	],
	mediumDashDotDot: [
		4,
		2,
		1,
		2,
		1,
		2
	],
	slantDashDot: [
		5,
		3,
		1,
		3
	]
};
function Ht(e) {
	let t = Vt[e];
	return t ? Rt(t, 1) : [];
}
var Ut = {
	dash: [6, 3],
	dot: [1.5, 3],
	dashDot: [
		6,
		3,
		1.5,
		3
	],
	lgDash: [10, 4],
	lgDashDot: [
		10,
		4,
		1.5,
		4
	],
	lgDashDotDot: [
		10,
		4,
		1.5,
		4,
		1.5,
		4
	],
	sysDash: [4, 2],
	sysDot: [1, 2],
	sysDashDot: [
		4,
		2,
		1,
		2
	],
	sysDashDotDot: [
		4,
		2,
		1,
		2,
		1,
		2
	]
};
function Wt(e, t) {
	let n = Ut[e];
	return n ? Rt(n, t) : [];
}
var Gt = {
	dotted: [1.5, 3],
	dottedHeavy: [1.5, 3],
	dash: [6, 3],
	dashHeavy: [6, 3],
	dashLong: [10, 4],
	dashLongHeavy: [10, 4],
	dotDash: [
		6,
		3,
		1.5,
		3
	],
	dotDashHeavy: [
		6,
		3,
		1.5,
		3
	],
	dotDotDash: [
		6,
		3,
		1.5,
		3,
		1.5,
		3
	],
	dotDotDashHeavy: [
		6,
		3,
		1.5,
		3,
		1.5,
		3
	]
};
function Kt(e, t) {
	let n = Gt[e];
	return n ? Rt(n, t) : [];
}
//#endregion
//#region packages/core/src/shape/paint.ts
function qt(e, t = 1) {
	let n = e.charCodeAt(0) === 35 ? e.slice(1) : e;
	return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${n.length >= 8 ? parseInt(n.slice(6, 8), 16) / 255 : t})`;
}
function Jt(e) {
	let t = e.charCodeAt(0) === 35 ? e.slice(1) : e, n = parseInt(t.slice(0, 2), 16), r = parseInt(t.slice(2, 4), 16), i = parseInt(t.slice(4, 6), 16);
	return .299 * n + .587 * r + .114 * i;
}
function Yt(e) {
	return e && Jt(e) < 128 ? "#FFFFFF" : "#000000";
}
function Xt(e, t, n, r, i, a) {
	if (!e || e.fillType === "none") return null;
	if (e.fillType === "solid") return qt(e.color);
	if (e.fillType === "pattern") return Qt(e, t);
	if (e.fillType === "gradient") {
		let o = e.stops;
		if (o.length === 0) return null;
		if (o.length === 1) return qt(o[0].color);
		let s;
		if (e.gradType === "radial") {
			let e = n + i / 2, o = r + a / 2, c = Math.sqrt(i * i + a * a) / 2;
			s = t.createRadialGradient(e, o, 0, e, o, c);
		} else {
			let o = e.angle * Math.PI / 180, c = n + i / 2, l = r + a / 2, u = (Math.abs(Math.cos(o)) * i + Math.abs(Math.sin(o)) * a) / 2;
			s = t.createLinearGradient(c - Math.cos(o) * u, l - Math.sin(o) * u, c + Math.cos(o) * u, l + Math.sin(o) * u);
		}
		for (let e of o) s.addColorStop(Math.min(1, Math.max(0, e.position)), qt(e.color));
		return s;
	}
	return null;
}
var Zt = /* @__PURE__ */ new WeakMap();
function Qt(e, t) {
	let n = `${e.preset}|${e.fg}|${e.bg}`, r = Zt.get(t);
	r || (r = /* @__PURE__ */ new Map(), Zt.set(t, r));
	let i = r.get(n);
	if (i) return i;
	let a = It(e.preset, e.fg, e.bg);
	if (!a) return qt(e.fg);
	let o = t.createPattern(a, "repeat");
	return o ? (r.set(n, o), o) : qt(e.fg);
}
function $t(e, t, n) {
	if (!t) {
		e.strokeStyle = "transparent", e.lineWidth = 0, e.setLineDash([]);
		return;
	}
	e.strokeStyle = qt(t.color);
	let r = Math.max(.5, t.width * n);
	e.lineWidth = r, e.setLineDash(t.dashStyle ? Wt(t.dashStyle, r) : []);
}
//#endregion
//#region packages/core/src/chart/renderer.ts
var en = [
	"4472C4",
	"ED7D31",
	"A9D18E",
	"FF0000",
	"70AD47",
	"4BACC6",
	"FFC000",
	"9E480E",
	"843C0C",
	"636363",
	"255E91",
	"967300"
];
function tn(e, t) {
	return t?.color ? `#${t.color}` : `#${en[e % en.length]}`;
}
function nn(e, t) {
	let n = t.dataPointColors?.[e];
	return n ? `#${n}` : `#${en[e % en.length]}`;
}
function rn(e, t) {
	let n = e.startsWith("#") ? e.slice(1) : e;
	if (n.length < 6) return `#${n}`;
	let r = Math.max(0, Math.min(1, t)), i = Math.round(parseInt(n.slice(0, 2), 16) * r), a = Math.round(parseInt(n.slice(2, 4), 16) * r), o = Math.round(parseInt(n.slice(4, 6), 16) * r), s = (e) => e.toString(16).padStart(2, "0");
	return `#${s(i)}${s(a)}${s(o)}`;
}
function an(e, t) {
	return t && (t.startsWith("+mj") ? e.themeMajorFontLatin ?? null : t.startsWith("+mn") ? e.themeMinorFontLatin ?? null : t);
}
function Z(e, t, n) {
	let r = n === "major" ? e.themeMajorFontLatin : e.themeMinorFontLatin, i = an(e, t) ?? r;
	return i ? `"${i}", Calibri, Arial, sans-serif` : "sans-serif";
}
function on(e) {
	return e === "pie" || e === "doughnut";
}
function sn(e, t, n) {
	if (on(e)) {
		let e = t[0];
		return e ? nn(n, e) : `#${en[n % en.length]}`;
	}
	return tn(n, t[n]);
}
function cn(e, t, n, r, i, a, o, s, c, l = "sans-serif") {
	e.save(), e.font = `${o ? "bold " : ""}${a}px ${l}`, e.fillStyle = s;
	let u = Nt(e, t, c);
	i === "cat" ? (e.textAlign = "center", e.textBaseline = "middle", e.fillText(u, n, r)) : (e.translate(n, r), e.rotate(-Math.PI / 2), e.textAlign = "center", e.textBaseline = "middle", e.fillText(u, 0, 0)), e.restore();
}
function ln(e) {
	return e ? `#${e}` : "#555";
}
function un(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	if (t.valAxisTitle) {
		let r = n + u + Ye(i) + p / 2, a = s + l / 2;
		cn(e, t.valAxisTitle, r, a, "val", p, t.valAxisTitleFontBold ?? !0, ln(t.valAxisTitleFontColor), l, Z(t, t.valAxisTitleFontFace, "major"));
	}
	if (t.catAxisTitle) {
		let n = o + c / 2, i = r + a - d - Ye(a) - f / 2;
		cn(e, t.catAxisTitle, n, i, "cat", f, t.catAxisTitleFontBold ?? !0, ln(t.catAxisTitleFontColor), c, Z(t, t.catAxisTitleFontFace, "major"));
	}
}
function dn(e) {
	return e && (e === "line" || e === "stackedLine" || e === "stackedLinePct" || e === "radar" || e === "scatter" || e === "stock") ? "line" : "fill";
}
function fn(e, t, n) {
	if (e !== "scatter") return !1;
	let r = t ?? "marker";
	return (r === "line" || r === "lineMarker" || r === "lineNoMarker" || r === "smooth" || r === "smoothMarker" || r === "smoothNoMarker") && n.lineHidden !== !0;
}
function pn(e, t, n, r) {
	if (e !== "scatter") return null;
	let i = n[r];
	if (!i || fn(e, t, i)) return null;
	let a = i.markerSymbol ?? "circle";
	if (a === "none") return null;
	let o = tn(r, i);
	return {
		symbol: a,
		fill: i.markerFill ?? o.replace(/^#/, ""),
		line: i.markerLine ?? null
	};
}
function mn(e, t, n, r, i, a, o, s = null) {
	if (s) {
		Zn(e, r + a / 2, i + o / 2, s.symbol, o, s.fill, s.line, 1);
		return;
	}
	if (e.fillStyle = n, t === "line") {
		e.strokeStyle = n;
		let t = e.lineWidth;
		e.lineWidth = Math.max(1.5, o * .15), e.beginPath();
		let s = i + o / 2;
		e.moveTo(r, s), e.lineTo(r + a, s), e.stroke(), e.lineWidth = t;
	} else e.fillRect(r, i, a, o);
}
function hn(e, t, n) {
	if (on(t)) {
		let n = e[0], r = n ? n.values.length : 0, i = n?.categories ?? [];
		return Array.from({ length: r }, (n, r) => ({
			label: (i[r] ?? `Item ${r + 1}`).toString(),
			color: sn(t, e, r),
			marker: null
		}));
	}
	return e.map((r, i) => ({
		label: r.name || `Series ${i + 1}`,
		color: sn(t, e, i),
		marker: pn(t, n, e, i)
	}));
}
var gn = {
	fontFamily: "sans-serif",
	color: "#333",
	bold: !1,
	sizePx: null
};
function _n(e, t, n, r, i, a, o = "vertical", s, c = gn, l) {
	let u = dn(s), d = hn(t, s, l), f = c.bold ? "bold " : "";
	if (o === "horizontal") {
		let t = c.sizePx ?? Math.max(9, Math.min(12, a * .7));
		e.font = `${f}${t}px ${c.fontFamily}`, e.textBaseline = "middle";
		let o = Math.max(1, d.length), s = i - 10 - 4, l = d.map((t) => Nt(e, t.label, s)), p = l.map((t) => 14 + e.measureText(t).width), m = n + (i - (p.reduce((e, t) => e + t, 0) + 12 * (o - 1))) / 2, h = r + a / 2;
		for (let n = 0; n < d.length; n++) mn(e, u, d[n].color, m, h - t / 2, 10, t, d[n].marker), e.fillStyle = c.color, e.textAlign = "left", e.fillText(l[n], m + 10 + 4, h), m += p[n] + 12;
		return;
	}
	let p = c.sizePx ?? Math.max(9, Math.min(12, a / (d.length + 1)));
	e.font = `${f}${p}px ${c.fontFamily}`, e.textBaseline = "middle";
	let m = p + 4, h = i - 10 - 4, g = r + (a - m * d.length) / 2;
	for (let t = 0; t < d.length; t++) mn(e, u, d[t].color, n, g, 10, p, d[t].marker), e.fillStyle = c.color, e.textAlign = "left", e.fillText(Nt(e, d[t].label, h), n + 10 + 4, g + p / 2), g += m;
}
function vn(e) {
	let t = an(e, e.legendFontFace) ?? e.themeMinorFontLatin;
	return {
		fontFamily: t ? `"${t}", Calibri, Arial, sans-serif` : "sans-serif",
		color: e.legendFontColor ? `#${e.legendFontColor}` : "#333",
		bold: e.legendFontBold ?? !1,
		sizePx: e.legendFontSizeHpt == null ? null : e.legendFontSizeHpt / 100
	};
}
function yn(e, t, n, r, i, a, o, s, c, l, u, d) {
	if (!n) return;
	let f = vn(t), p = t.legendManualLayout;
	if (p && p.xMode === "edge" && p.yMode === "edge" && p.w > 0 && p.h > 0) {
		let n = r + p.x * a, s = i + p.y * o, c = p.w * a, l = p.h * o, u = c >= l ? "horizontal" : "vertical";
		_n(e, t.series, n, s, c, l, u, t.chartType, f, t.scatterStyle);
		return;
	}
	switch (n.side) {
		case "r":
			_n(e, t.series, r + a - n.reserveW + 4, c, n.reserveW - 8, u, "vertical", t.chartType, f, t.scatterStyle);
			break;
		case "l":
			_n(e, t.series, r + 4, c, n.reserveW - 8, u, "vertical", t.chartType, f, t.scatterStyle);
			break;
		case "t":
			_n(e, t.series, s, i + d, l, n.reserveH, "horizontal", t.chartType, f, t.scatterStyle);
			break;
		case "b":
			_n(e, t.series, s, i + o - n.reserveH, l, n.reserveH, "horizontal", t.chartType, f, t.scatterStyle);
			break;
	}
}
function bn(e, t, n, r, i, a, o, s = !1) {
	if (t === "none" || !t) return;
	let c = o ? Math.max(4, o + 2) : 4, l = e.strokeStyle, u = e.lineWidth;
	if (e.strokeStyle = a ?? "#888", e.lineWidth = o ?? 1, e.beginPath(), n === "val") {
		let n = r, a = i, o = s ? 1 : -1, l = t === "out" || t === "cross" ? o * c : 0, u = t === "in" || t === "cross" ? -o * c : 0;
		e.moveTo(n + l, a), e.lineTo(n + u, a);
	} else {
		let n = r, a = i, o = t === "out" || t === "cross" ? c : 0, s = t === "in" || t === "cross" ? -c : 0;
		e.moveTo(a, n + o), e.lineTo(a, n + s);
	}
	e.stroke(), e.strokeStyle = l, e.lineWidth = u;
}
function xn(e, t, n, r, i, a) {
	a && a.explicit ? (e.strokeStyle = a.color, e.lineWidth = a.width) : (e.strokeStyle = i ? "#aaa" : a?.color ?? "#e0e0e0", e.lineWidth = i ? 1 : a?.width ?? .5), e.beginPath(), e.moveTo(t, r), e.lineTo(t + n, r), e.stroke();
}
function Sn(e, t) {
	let { color: n, width: r } = gt(e.valAxisGridlineColor, e.valAxisGridlineWidthEmu, t);
	return {
		color: n,
		width: r,
		explicit: e.valAxisGridlineColor != null
	};
}
function Cn(e) {
	return e.catAxisMajorGridlines === !0;
}
function wn(e, t) {
	return gt(e.catAxisGridlineColor, e.catAxisGridlineWidthEmu, t);
}
function Tn(e, t) {
	if (t <= 0) return [];
	let n = _t(e), r = [], i = n ? t : t - 1;
	for (let e = 0; e <= i; e++) r.push(n ? e / t : t === 1 ? .5 : e / (t - 1));
	return r;
}
function En(e) {
	return e.valAxisOrientation === "maxMin";
}
function Dn(e) {
	return e.catAxisOrientation === "maxMin";
}
function On(e) {
	return e.valAxisMajorGridlines !== !1;
}
function kn(e, t, n, r) {
	let i = En(e), a = e.valAxisLogBase;
	if (a != null && isFinite(a) && a >= 2) {
		let { min: r, max: o, lines: s } = lt(t, n, a, e.valMin, e.valMax);
		return {
			min: r,
			max: o,
			step: s.length > 1 ? s[1] - s[0] : o - r,
			majorLines: s,
			minorLines: [],
			frac: (e) => ct(e, r, o, {
				logBase: a,
				reversed: i
			})
		};
	}
	let { min: o, max: s, step: c } = st(t, n, e.valMin, e.valMax, r, e.valAxisMajorUnit), l = s - o || 1, u = [], d = Math.round((s - o) / c);
	for (let e = 0; e <= d; e++) u.push(o + e * c);
	let f = [], p = e.valAxisMinorUnit;
	if (e.valAxisMinorGridlines && p != null && isFinite(p) && p > 0 && p < c) for (let e = o + p; e < s - 1e-9; e += p) Math.abs((e - o) / c - Math.round((e - o) / c)) > 1e-6 && f.push(e);
	return {
		min: o,
		max: s,
		step: c,
		majorLines: u,
		minorLines: f,
		frac: (e) => i ? 1 - (e - o) / l : (e - o) / l
	};
}
function An(e, t, n, r, i, a) {
	let o = t.trendLines;
	if (!o || o.length === 0) return;
	let s = [], c = [];
	for (let e = 0; e < t.values.length; e++) {
		let n = t.values[e];
		n != null && (s.push(e), c.push(n));
	}
	if (s.length < 2) return;
	let l = e.getLineDash ? e.getLineDash() : [];
	for (let t of o) {
		let o = ut(s, c, t.trendlineType, {
			period: t.period,
			intercept: t.intercept
		});
		if (o.xs.length < 2) continue;
		let l = o.xs, u = o.ys;
		if (t.trendlineType === "linear") {
			let e = (o.ys[1] - o.ys[0]) / (o.xs[1] - o.xs[0] || 1), n = t.backward ?? 0, r = t.forward ?? 0;
			l = [o.xs[0] - n, o.xs[1] + r], u = [o.ys[0] - e * n, o.ys[1] + e * r];
		}
		e.strokeStyle = t.lineColor ? `#${t.lineColor}` : n, e.lineWidth = t.lineWidthEmu ? mt(t.lineWidthEmu, a) : 1.5, e.setLineDash([6, 4]), e.beginPath();
		for (let t = 0; t < l.length; t++) {
			let n = r(l[t]), a = i(u[t]);
			t === 0 ? e.moveTo(n, a) : e.lineTo(n, a);
		}
		e.stroke();
	}
	e.setLineDash(l);
}
function jn(e, t, n) {
	return e ? e / 100 * n : Math.max(8, t * .045);
}
function Mn(e) {
	return e.catAxisTickLabelPos !== "none";
}
var Nn = 54e5;
function Pn(e) {
	let t = e.catAxisLabelRotation;
	return t == null || t === 0 || Math.abs(t) > Nn ? 0 : t / 6e4 * (Math.PI / 180);
}
function Fn(e, t, n, r, i) {
	if (i === 0) {
		e.fillText(t, n, r);
		return;
	}
	e.save(), e.translate(n, r), e.rotate(i), e.textAlign = "right", e.textBaseline = "middle", e.fillText(t, 0, 0), e.restore();
}
function In(e, t, n) {
	if (!e) return null;
	let r = [];
	for (let e of t) if (e.useSecondaryAxis === !0) for (let t of e.values) t != null && r.push(t);
	let i = r.length ? Math.min(...r) : 0, a = r.length ? Math.max(...r) : 1, { min: o, max: s, step: c } = st(Math.min(0, i), a, e.min, e.max, n, e.majorUnit), l = s - o || 1;
	return {
		min: o,
		max: s,
		step: c,
		makeToY: (e, t) => (n) => e + t - (n - o) / l * t
	};
}
function Ln(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	let m = i + o, { color: h, width: g } = ht(t.lineColor, t.lineWidthEmu, l);
	if (t.lineHidden || (e.strokeStyle = h, e.lineWidth = g, e.beginPath(), e.moveTo(m, a), e.lineTo(m, a + s), e.stroke()), !t.hidden) {
		e.font = `${u}px sans-serif`, e.fillStyle = t.fontColor ? `#${t.fontColor}` : f, e.textAlign = "left", e.textBaseline = "middle";
		let i = n.max - n.min || 1, a = Math.max(1, Math.round(i / n.step));
		for (let i = 0; i <= a; i++) {
			let a = n.min + i * n.step, o = r(a);
			bn(e, t.majorTickMark, "val", m, o, h, g, !0), e.fillText(X(a, t.formatCode ?? null, p), m + 14, o);
		}
	}
	if (t.title) {
		let n = t.titleFontSizeHpt ? t.titleFontSizeHpt / 100 * l : Math.max(9, c * .05);
		e.save(), e.fillStyle = t.titleFontColor ? `#${t.titleFontColor}` : t.fontColor ? `#${t.fontColor}` : "#555", e.font = `${t.titleFontBold ? "bold " : ""}${n}px sans-serif`, e.textAlign = "center", e.textBaseline = "middle", e.translate(i + o + d + n * .6, a + s / 2), e.rotate(Math.PI / 2), e.fillText(t.title, 0, 0), e.restore();
	}
}
function Rn(e, t, n, r, i, a) {
	if (!t.title) return;
	let o = an(t, t.titleFontFace), s = o ? `"${o}", Calibri, Arial, sans-serif` : "Calibri, Arial, sans-serif";
	e.font = `${t.titleFontBold ?? !0 ? "bold " : ""}${a}px ${s}`, e.fillStyle = t.titleFontColor ? `#${t.titleFontColor}` : "#333", e.textAlign = "center", e.textBaseline = "top", e.fillText(t.title, n + i / 2, r);
}
function zn(e) {
	if (e.categories.length > 0) return e.categories;
	let t = e.series[0];
	if (t?.categories && t.categories.length > 0) return t.categories;
	let n = 0;
	for (let t of e.series) t.values.length > n && (n = t.values.length);
	return n > 0 ? Array.from({ length: n }, (e, t) => String(t + 1)) : [];
}
function Bn(e, t, n, r, i, a, o, s, c, l = !1) {
	let u = s ?? "outEnd";
	if (e.fillStyle = c ? `#${c}` : "#333", o === "vertical") {
		let o = n + a / 2, s = l ? r + i : r, c = l ? r : r + i;
		u === "inBase" ? (e.textAlign = "center", e.textBaseline = l ? "top" : "bottom", e.fillText(t, o, l ? c + 2 : c - 2)) : u === "inEnd" ? (e.textAlign = "center", e.textBaseline = l ? "bottom" : "top", e.fillText(t, o, l ? s - 2 : s + 2)) : u === "ctr" ? (e.textAlign = "center", e.textBaseline = "middle", e.fillText(t, o, r + i / 2)) : (e.textAlign = "center", e.textBaseline = l ? "top" : "bottom", e.fillText(t, o, l ? s + 1 : s - 1));
	} else {
		let o = r + a / 2, s = l ? n : n + i, c = l ? n + i : n;
		u === "inBase" ? (e.textAlign = l ? "right" : "left", e.textBaseline = "middle", e.fillText(t, l ? c - 4 : c + 4, o)) : u === "inEnd" ? (e.textAlign = l ? "left" : "right", e.textBaseline = "middle", e.fillText(t, l ? s + 4 : s - 4, o)) : u === "ctr" ? (e.textAlign = "center", e.textBaseline = "middle", e.fillText(t, n + i / 2, o)) : (e.textAlign = l ? "right" : "left", e.textBaseline = "middle", e.fillText(t, l ? s - 2 : s + 2, o));
	}
}
function Vn(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = t.chartType === "clusteredBarH" || t.chartType === "stackedBarH" || t.chartType === "stackedBarHPct", l = t.chartType.startsWith("stacked"), u = t.chartType === "stackedBarPct" || t.chartType === "stackedBarHPct", d = t.series.filter((e) => e.seriesType !== "line"), f = t.series.filter((e) => e.seriesType === "line"), p = !c && t.secondaryValAxis && f.some((e) => e.useSecondaryAxis === !0) ? t.secondaryValAxis : null, m = zn(t), h = m.length;
	if (h === 0) return;
	let g = $e(t, s, r), _ = g.fontPx, v = g.topPad, y = g.bandH, b = jn(t.catAxisFontSizeHpt, s, r), x = jn(t.valAxisFontSizeHpt, s, r), S = Ke(t, o, s, .22), { legRightW: C, legLeftW: w, legTopH: T, legBottomH: E } = qe(S), D = Xe(t, o, s, r), O = D.catFontPx, k = D.valFontPx, A = D.catBandH, j = D.valBandW, M = y + T + x / 2 + 2, N = c ? (t.valAxisHidden ? s * .02 : et(x)) + A + E : et(b) + A + E, ee = s - M - N, te = c ? o - ((t.catAxisHidden ? o * .03 : o * .22) + j + w) - (C + o * .03) : 0, ne = (c ? te : ee) / r, P = 0, F = 0;
	for (let e = 0; e < h; e++) {
		let t = 0, n = 0;
		for (let r of d) {
			let i = r.values[e] ?? 0;
			l ? i >= 0 ? t += i : n += i : (P = Math.max(P, i), F = Math.min(F, i));
		}
		l && (P = Math.max(P, t), F = Math.min(F, n));
	}
	if (!u) {
		for (let e of f) if (!(p && e.useSecondaryAxis === !0)) for (let t = 0; t < h; t++) {
			let n = e.values[t];
			n != null && (P = Math.max(P, n), F = Math.min(F, n));
		}
	}
	u && (P = P > 0 ? 100 : 0, F = F < 0 ? -100 : 0), t.valMax != null && (P = t.valMax), t.valMin != null && (F = t.valMin), P === 0 && F === 0 && (P = 1);
	let I = kn(t, F, P, ne), { min: L, max: R, step: z } = I, B = In(p, f, ee / r), V = B ? B.min : 0, H = B ? B.max : 1, U = B ? B.step : 1, W = Math.max(8, Math.min(11, s / 20)), re = Math.max(8, Math.min(11, ee / 20)), G = e.font, ie = 0;
	if (!c && !t.valAxisHidden) {
		e.font = `${re}px ${Z(t, t.valAxisFontFace, "minor")}`;
		let n = 0, r = Math.round((R - L) / z);
		for (let i = 0; i <= r; i++) {
			let r = L + i * z, a = u ? `${Math.round(r)}%` : X(r, t.valAxisFormatCode, t.date1904);
			n = Math.max(n, e.measureText(a).width);
		}
		ie = n + 16;
	}
	let ae = p?.fontSizeHpt ? p.fontSizeHpt / 100 * r : W, oe = 0;
	if (p && !p.hidden) {
		e.font = `${ae}px sans-serif`;
		let n = 0, r = Math.round((H - V) / U);
		for (let i = 0; i <= r; i++) n = Math.max(n, e.measureText(X(V + i * U, p.formatCode ?? null, t.date1904)).width);
		oe = n + 18;
	}
	e.font = G;
	let se = p && p.title ? (p.titleFontSizeHpt ? p.titleFontSizeHpt / 100 * r : Math.max(9, s * .05)) + 8 : 0, ce = {
		t: M,
		r: C + o * .03 + oe + se,
		b: N,
		l: c ? (t.catAxisHidden ? o * .03 : o * .22) + j + w : w + j + ie
	};
	Rn(e, t, i, a + v, o, _);
	let { plotRect: { px0: K, py0: q, pw: J, ph: Y } } = tt(t, i, a, o, s, r, {
		titleBand: g,
		legendSideReserveFrac: .22,
		pad: ce,
		honorPlotAreaManualLayout: !0
	});
	if (J <= 0 || Y <= 0) return;
	t.plotAreaBg && (e.fillStyle = `#${t.plotAreaBg}`, e.fillRect(K, q, J, Y));
	let le = H - V || 1, ue = R - L || 1, de = (e) => q + Y - I.frac(e) * Y, fe = (e) => K + I.frac(e) * J, pe = de(0), me = fe(0), he = de, ge = B ? B.makeToY(q, Y) : de, _e = Sn(t, r), ve = Math.round(ue / z);
	e.textBaseline = "middle", e.font = `${Math.max(8, Math.min(11, Y / 20))}px ${Z(t, t.valAxisFontFace, "minor")}`;
	let ye = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555";
	if (e.fillStyle = ye, !t.valAxisHidden) {
		for (let t of I.minorLines) if (!c) xn(e, K, J, de(t), !1, _e);
		else {
			let n = fe(t);
			e.strokeStyle = _e.color, e.lineWidth = _e.width, e.beginPath(), e.moveTo(n, q), e.lineTo(n, q + Y), e.stroke();
		}
		let n = On(t), r = t.valAxisTickLabelPos !== "none";
		for (let i of I.majorLines) {
			let a = Math.abs(i) < z * 1e-9, o = u ? `${Math.round(i)}%` : X(i, t.valAxisFormatCode, t.date1904);
			if (c) {
				let t = fe(i);
				n && (e.strokeStyle = _e.explicit ? _e.color : a ? "#aaa" : _e.color, e.lineWidth = _e.explicit ? _e.width : a ? 1 : _e.width, e.beginPath(), e.moveTo(t, q), e.lineTo(t, q + Y), e.stroke()), r && (e.textAlign = "center", e.fillText(o, t, q + Y + 10));
			} else {
				let t = de(i);
				n && xn(e, K, J, t, a, _e), r && (e.textAlign = "right", e.fillText(o, K - 12, t));
			}
		}
	}
	if (!t.catAxisHidden && Cn(t)) {
		let n = wn(t, r);
		e.strokeStyle = n.color, e.lineWidth = n.width;
		for (let n of Tn(t, h)) {
			if (e.beginPath(), c) {
				let t = q + n * Y;
				e.moveTo(K, t), e.lineTo(K + J, t);
			} else {
				let t = K + n * J;
				e.moveTo(t, q), e.lineTo(t, q + Y);
			}
			e.stroke();
		}
	}
	let { color: be, width: xe } = ht(t.catAxisLineColor, t.catAxisLineWidthEmu, r), { color: Se, width: Ce } = ht(t.valAxisLineColor, t.valAxisLineWidthEmu, r), we = (t, n, r, i, a, o) => {
		e.strokeStyle = a, e.lineWidth = o, e.beginPath(), e.moveTo(t, n), e.lineTo(r, i), e.stroke();
	}, Te = !t.catAxisHidden && !t.catAxisLineHidden, Ee = !t.valAxisHidden && !t.valAxisLineHidden && t.valAxisLineColor != null, De = () => {
		if (c ? (Te && we(K, q, K, q + Y, be, xe), Ee && we(K, q + Y, K + J, q + Y, Se, Ce)) : (Te && we(K, q + Y, K + J, q + Y, be, xe), Ee && we(K, q, K, q + Y, Se, Ce)), !t.valAxisHidden && t.valAxisMajorTickMark && t.valAxisMajorTickMark !== "none") for (let n = 0; n <= ve; n++) {
			let r = L + n * z;
			c ? bn(e, t.valAxisMajorTickMark, "cat", q + Y, fe(r), Se, Ce) : bn(e, t.valAxisMajorTickMark, "val", K, de(r), Se, Ce);
		}
		if (!t.catAxisHidden && t.catAxisMajorTickMark && t.catAxisMajorTickMark !== "none") {
			let n = _t(t), r = n ? h : h - 1;
			for (let i = 0; i <= r; i++) {
				let r = n ? i / h : h === 1 ? .5 : i / (h - 1);
				c ? bn(e, t.catAxisMajorTickMark, "val", K, q + r * Y, be, xe) : bn(e, t.catAxisMajorTickMark, "cat", q + Y, K + r * J, be, xe);
			}
		}
	}, Oe = c ? Y / h : J / h, ke = l ? 1 : Math.max(1, d.length), Ae = l ? 0 : t.barOverlap ?? 0, je = t.barGapWidth ?? 150, Me = Oe / (1 + (ke - 1) * (1 - Ae / 100) + je / 100), Ne = l ? 0 : Me * (1 - Ae / 100), Pe = (Oe - (Me + (ke - 1) * Ne)) / 2;
	for (let n = 0; n < h; n++) {
		let i = 0, a = 0, o = 0;
		if (u) {
			for (let e of d) o += Math.abs(e.values[n] ?? 0);
			o === 0 && (o = 1);
		}
		for (let s = 0; s < d.length; s++) {
			let f = d[s], p = f.values[n] ?? 0, m = u ? p / o * 100 : p, g = m < 0, _ = tn(s, f);
			if (c) {
				let o = l ? s : d.length - 1 - s, c = l ? q + (h - 1 - n) * Oe + Pe : q + (h - 1 - n) * Oe + Pe + o * Ne, p = l ? fe(g ? a : i) : me, v = fe(l ? (g ? a : i) + m : m), y = Math.min(p, v), b = Math.abs(v - p);
				e.fillStyle = _, e.fillRect(y, c, b, Me), t.showDataLabels && m !== 0 && (e.font = `bold ${t.dataLabelFontSizeHpt ? t.dataLabelFontSizeHpt / 100 * r : Math.max(7, Math.min(11, Me * .6))}px ${Z(t, t.dataLabelFontFace, "minor")}`, Bn(e, u ? `${Math.round(m)}%` : X(m, t.dataLabelFormatCode ?? f.valFormatCode ?? null, t.date1904), y, c, b, Me, "horizontal", t.dataLabelPosition ?? null, f.labelColor ?? t.dataLabelFontColor ?? null, g));
			} else {
				let o = l ? K + n * Oe + Pe : K + n * Oe + Pe + s * Ne, c = l ? de(g ? a : i) : pe, d = de(l ? (g ? a : i) + m : m), p = Math.min(c, d), h = Math.abs(d - c);
				e.fillStyle = _, e.fillRect(o, p, Me, h), t.showDataLabels && m !== 0 && (e.font = `bold ${t.dataLabelFontSizeHpt ? t.dataLabelFontSizeHpt / 100 * r : Math.max(7, Math.min(11, Me * .6))}px ${Z(t, t.dataLabelFontFace, "minor")}`, Bn(e, u ? `${Math.round(m)}%` : X(m, t.dataLabelFormatCode ?? f.valFormatCode ?? null, t.date1904), o, p, h, Me, "vertical", t.dataLabelPosition ?? null, f.labelColor ?? t.dataLabelFontColor ?? null, g));
			}
			l && (g ? a += m : i += m);
		}
	}
	if (!t.catAxisHidden && Mn(t)) {
		e.fillStyle = t.catAxisFontColor ? `#${t.catAxisFontColor}` : "#555", e.font = `${Math.max(8, Math.min(11, Oe * .5))}px ${Z(t, t.catAxisFontFace, "minor")}`;
		let n = Oe - 4, r = K - 4 - (i + w + j), a = Pn(t);
		for (let i = 0; i < h; i++) {
			let o = Et((m[i] ?? "").toString(), t.catAxisFormatCode, t.date1904);
			if (c) {
				let t = q + (h - 1 - i) * Oe + Oe / 2;
				e.textAlign = "right", e.textBaseline = "middle", e.fillText(Nt(e, o, r), K - 4, t);
			} else {
				let t = K + i * Oe + Oe / 2;
				e.textAlign = "center", e.textBaseline = "top", Fn(e, Nt(e, o, a === 0 ? n : Y * .4), t, q + Y + 3, a);
			}
		}
	}
	if (f.length > 0 && !c) for (let t = 0; t < f.length; t++) {
		let n = f[t], i = tn(d.length + t, n), a = p && n.useSecondaryAxis === !0 ? ge : he;
		e.strokeStyle = i, e.lineWidth = 2, e.setLineDash([]), e.beginPath();
		let o = !1;
		for (let t = 0; t < h; t++) {
			let r = n.values[t];
			if (r == null) {
				o = !1;
				continue;
			}
			let i = K + t * Oe + Oe / 2, s = a(r);
			o ? e.lineTo(i, s) : (e.moveTo(i, s), o = !0);
		}
		if (e.stroke(), n.showMarker !== !1) for (let t = 0; t < h; t++) {
			let r = n.values[t];
			if (r == null) continue;
			let o = K + t * Oe + Oe / 2, s = a(r);
			e.fillStyle = i, e.beginPath(), e.arc(o, s, 3, 0, Math.PI * 2), e.fill();
		}
		An(e, n, i, (e) => K + e * Oe + Oe / 2, a, r);
	}
	if (De(), p) {
		let n = K + J, { color: i, width: a } = ht(p.lineColor, p.lineWidthEmu, r);
		if (p.lineHidden || we(n, q, n, q + Y, i, a), !p.hidden) {
			e.font = `${ae}px sans-serif`, e.fillStyle = p.fontColor ? `#${p.fontColor}` : ye, e.textAlign = "left", e.textBaseline = "middle";
			let r = Math.max(1, Math.round(le / U));
			for (let o = 0; o <= r; o++) {
				let r = V + o * U, s = ge(r);
				bn(e, p.majorTickMark, "val", n, s, i, a, !0), e.fillText(X(r, p.formatCode ?? null, t.date1904), n + 14, s);
			}
		}
		if (p.title) {
			let t = p.titleFontSizeHpt ? p.titleFontSizeHpt / 100 * r : Math.max(9, s * .05);
			e.save(), e.fillStyle = p.titleFontColor ? `#${p.titleFontColor}` : p.fontColor ? `#${p.fontColor}` : "#555", e.font = `${p.titleFontBold ? "bold " : ""}${t}px sans-serif`, e.textAlign = "center", e.textBaseline = "middle", e.translate(K + J + oe + t * .6, q + Y / 2), e.rotate(Math.PI / 2), e.fillText(p.title, 0, 0), e.restore();
		}
	}
	yn(e, c && !l ? {
		...t,
		series: [...t.series].reverse()
	} : t, S, i, a, o, s, K, q, J, Y, y + 2), un(e, t, i, a, o, s, K, q, J, Y, w, E, O, k);
}
function Hn(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = zn(t), l = c.length;
	if (l === 0) return;
	let u = t.chartType === "stackedLine" || t.chartType === "stackedLinePct", d = t.chartType === "stackedLinePct", f = d ? c.map((e, n) => {
		let r = 0;
		for (let e of t.series) r += Math.abs(e.values[n] ?? 0);
		return r || 1;
	}) : null, p = t.dispBlanksAs ?? "gap", m = (e, n) => {
		if (!u) return t.series[e].values[n] ?? 0;
		let r = 0;
		for (let i = 0; i <= e; i++) r += t.series[i].values[n] ?? 0;
		return d && f ? r / f[n] * 100 : r;
	}, h = !u && t.secondaryValAxis && t.series.some((e) => e.useSecondaryAxis === !0) ? t.secondaryValAxis : null, g = (e) => h != null && e.useSecondaryAxis === !0, _ = $e(t, s, r), v = _.fontPx, y = _.topPad, b = _.bandH, x = Ke(t, o, s, .22), { legRightW: S, legLeftW: C, legTopH: w, legBottomH: T } = qe(x), E = jn(t.catAxisFontSizeHpt, s, r), D = jn(t.valAxisFontSizeHpt, s, r), O = Xe(t, o, s, r), k = O.catFontPx, A = O.valFontPx, j = O.catBandH, M = O.valBandW, N = b + w + D / 2 + 2, ee = et(E) + j + T, te = s - N - ee, ne = In(h, t.series, te / r), P = Math.max(8, Math.min(11, s / 20)), F = h?.fontSizeHpt ? h.fontSizeHpt / 100 * r : P, I = 0;
	if (h && ne && !h.hidden) {
		let n = e.font;
		e.font = `${F}px sans-serif`;
		let r = 0, i = Math.round((ne.max - ne.min) / ne.step);
		for (let n = 0; n <= i; n++) r = Math.max(r, e.measureText(X(ne.min + n * ne.step, h.formatCode ?? null, t.date1904)).width);
		I = r + 18, e.font = n;
	}
	let L = h && h.title ? (h.titleFontSizeHpt ? h.titleFontSizeHpt / 100 * r : Math.max(9, s * .05)) + 8 : 0, R = {
		t: N,
		r: S + o * .05 + I + L,
		b: ee,
		l: D * 2.2 + 10 + M + C
	};
	Rn(e, t, i, a + y, o, v);
	let { plotRect: { px0: z, py0: B, pw: V, ph: H } } = tt(t, i, a, o, s, r, {
		titleBand: _,
		legendSideReserveFrac: .22,
		pad: R
	});
	if (V <= 0 || H <= 0) return;
	t.plotAreaBg && (e.fillStyle = `#${t.plotAreaBg}`, e.fillRect(z, B, V, H));
	let U = Infinity, W = -Infinity;
	for (let e = 0; e < l; e++) for (let n = 0; n < t.series.length; n++) {
		if (g(t.series[n]) || !u && t.series[n].values[e] == null) continue;
		let r = m(n, e);
		U = Math.min(U, r), W = Math.max(W, r);
	}
	isFinite(U) || (U = 0, W = 1);
	let re = t.valAxisLogBase != null && t.valAxisLogBase >= 2;
	t.valMin == null ? U > 0 && !re && (U = 0) : U = t.valMin, t.valMax == null ? W < 0 && (W = 0) : W = t.valMax, W === U && (W = U + 1);
	let G = kn(t, U, W, H / r);
	if (G.max - G.min === 0) return;
	let ie = (e) => B + H - G.frac(e) * H, ae = ne ? ne.makeToY(B, H) : ie, oe = (e) => g(e) ? ae : ie, se = _t(t), ce = Dn(t), K = se ? (e) => z + ((ce ? l - 1 - e : e) + .5) / l * V : (e) => {
		let t = ce ? l - 1 - e : e;
		return z + (l === 1 ? V / 2 : t / (l - 1) * V);
	};
	if (!t.valAxisHidden) {
		e.font = `${D}px ${Z(t, t.valAxisFontFace, "minor")}`, e.textBaseline = "middle";
		let n = Sn(t, r);
		for (let t of G.minorLines) xn(e, z, V, ie(t), !1, n);
		let i = On(t), a = t.valAxisTickLabelPos !== "none";
		for (let r of G.majorLines) {
			let o = ie(r);
			i && xn(e, z, V, o, r === 0, n), bn(e, t.valAxisMajorTickMark, "val", z, o), a && (e.fillStyle = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555", e.textAlign = "right", e.fillText(X(r, t.valAxisFormatCode, t.date1904), z - 6, o));
		}
	}
	if (!t.catAxisHidden && Cn(t)) {
		let n = wn(t, r);
		e.strokeStyle = n.color, e.lineWidth = n.width;
		for (let n of Tn(t, l)) {
			let t = z + n * V;
			e.beginPath(), e.moveTo(t, B), e.lineTo(t, B + H), e.stroke();
		}
	}
	e.strokeStyle = "#aaa", e.lineWidth = 1, !t.catAxisHidden && !t.catAxisLineHidden && (e.beginPath(), e.moveTo(z, B + H), e.lineTo(z + V, B + H), e.stroke()), !t.valAxisHidden && !t.valAxisLineHidden && (e.beginPath(), e.moveTo(z, B), e.lineTo(z, B + H), e.stroke());
	let q = Math.max(1, 2.25 * r), J = Math.max(2, 2.5 * r), Y = jn(t.dataLabelFontSizeHpt, s, r);
	for (let n = 0; n < t.series.length; n++) {
		let i = t.series[n], a = tn(n, i), o = oe(i);
		e.strokeStyle = a, e.lineWidth = q, e.setLineDash([]), e.beginPath();
		let s = i.smooth === !0, d = [], f = () => {
			d.length !== 0 && (e.moveTo(d[0].x, d[0].y), nr(e, d, s), d = []);
		};
		for (let e = 0; e < l; e++) {
			if (!u && i.values[e] == null) {
				if (p === "gap") {
					f();
					continue;
				}
				if (p === "span") continue;
			}
			d.push({
				x: K(e),
				y: o(m(n, e))
			});
		}
		f(), e.stroke();
		let h = (e) => m(n, e);
		for (let t of i.errBars ?? []) ar(e, i, t, l, K, o, h, a);
		e.fillStyle = a;
		let g = i.showMarker !== !1, _ = ir(i), v = or(e, i, c, l, K, o, h, H, r, t.date1904 ?? !1, u || p === "zero", Z(t, t.dataLabelFontFace, "minor"), t.dataLabelPosition ?? "r");
		v && (e.fillStyle = a);
		for (let s = 0; s < l; s++) {
			if (!u && i.values[s] == null && p !== "zero") continue;
			let c = m(n, s);
			if (g) if (_) {
				let t = (i.dataPointOverrides ?? []).find((e) => e.idx === s), n = t?.markerSymbol ?? i.markerSymbol ?? "circle";
				if (n !== "none") {
					let l = t?.markerSize ?? i.markerSize ?? 5, u = t?.markerFill ?? t?.color ?? i.markerFill ?? a, d = t?.markerLine ?? i.markerLine ?? null;
					Zn(e, K(s), o(c), n, l, u, d, r);
				}
			} else e.beginPath(), e.arc(K(s), o(c), J, 0, Math.PI * 2), e.fill();
			t.showDataLabels && !v && (er(e, K(s), o(c), Tt(c), t.dataLabelPosition ?? "r", Y, void 0, !1, Z(t, t.dataLabelFontFace, "minor"), g ? J + 1 : 2), e.fillStyle = a);
		}
		An(e, i, a, K, o, r);
	}
	if (!t.catAxisHidden) {
		let n = Math.max(1, Math.ceil(l / 8)), r = t.catAxisFontColor ? `#${t.catAxisFontColor}` : "#555";
		e.fillStyle = r, e.textAlign = "center", e.textBaseline = "top", e.font = `${E}px ${Z(t, t.catAxisFontFace, "minor")}`;
		let i = V / l * n - 4, a = Mn(t), o = Pn(t);
		for (let s = 0; s < l; s += n) {
			let n = K(s);
			bn(e, t.catAxisMajorTickMark, "cat", B + H, n), a && (e.fillStyle = r, Fn(e, Nt(e, Et((c[s] ?? "").toString(), t.catAxisFormatCode, t.date1904), o === 0 ? i : H * .4), n, B + H + 5, o));
		}
	}
	if (h && ne) {
		let n = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555";
		Ln(e, h, ne, ae, z, B, V, H, s, r, F, I, n, t.date1904);
	}
	yn(e, t, x, i, a, o, s, z, B, V, H, b + 2), un(e, t, i, a, o, s, z, B, V, H, C, T, k, A);
}
function Un(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = zn(t), l = c.length;
	if (l === 0) return;
	let u = t.series, d = u.length >= 4, f = d ? 0 : -1, p = +!!d, m = d ? 2 : 1, h = d ? 3 : 2, g = u[p], _ = u[m], v = u[h], y = f >= 0 ? u[f] : void 0, b = $e(t, s, r), x = b.fontPx, S = b.topPad, C = b.bandH, w = Ke(t, o, s, .22), { legRightW: T, legLeftW: E, legBottomH: D, legTopH: O } = qe(w), k = jn(t.catAxisFontSizeHpt, s, r), A = jn(t.valAxisFontSizeHpt, s, r), j = Xe(t, o, s, r), M = j.catFontPx, N = j.valFontPx, ee = j.catBandH, te = j.valBandW, ne = C + O + A / 2 + 2, P = et(k) + ee + D, F = {
		t: ne,
		r: T + o * .05,
		b: P,
		l: A * 2.2 + 10 + te + E
	};
	Rn(e, t, i, a + S, o, x);
	let { plotRect: { px0: I, py0: L, pw: R, ph: z } } = tt(t, i, a, o, s, r, {
		titleBand: b,
		legendSideReserveFrac: .22,
		pad: F
	});
	if (R <= 0 || z <= 0) return;
	t.plotAreaBg && (e.fillStyle = `#${t.plotAreaBg}`, e.fillRect(I, L, R, z));
	let B = Infinity, V = -Infinity;
	for (let e of u) for (let t = 0; t < l; t++) {
		let n = e.values[t];
		n != null && (B = Math.min(B, n), V = Math.max(V, n));
	}
	isFinite(B) || (B = 0, V = 1), t.valMin == null ? B > 0 && (B = 0) : B = t.valMin, t.valMax == null ? V < 0 && (V = 0) : V = t.valMax, V === B && (V = B + 1);
	let H = kn(t, B, V, z / r);
	if (H.max - H.min === 0) return;
	let U = (e) => L + z - H.frac(e) * z, W = _t(t), re = Dn(t), G = W ? (e) => I + ((re ? l - 1 - e : e) + .5) / l * R : (e) => {
		let t = re ? l - 1 - e : e;
		return I + (l === 1 ? R / 2 : t / (l - 1) * R);
	};
	if (!t.valAxisHidden) {
		e.font = `${A}px ${Z(t, t.valAxisFontFace, "minor")}`, e.textBaseline = "middle";
		let n = Sn(t, r);
		for (let t of H.minorLines) xn(e, I, R, U(t), !1, n);
		let i = On(t), a = t.valAxisTickLabelPos !== "none";
		for (let r of H.majorLines) {
			let o = U(r);
			i && xn(e, I, R, o, r === 0, n), bn(e, t.valAxisMajorTickMark, "val", I, o), a && (e.fillStyle = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555", e.textAlign = "right", e.fillText(X(r, t.valAxisFormatCode, t.date1904), I - 6, o));
		}
	}
	if (e.strokeStyle = "#aaa", e.lineWidth = 1, !t.catAxisHidden && !t.catAxisLineHidden && (e.beginPath(), e.moveTo(I, L + z), e.lineTo(I + R, L + z), e.stroke()), !t.valAxisHidden && !t.valAxisLineHidden && (e.beginPath(), e.moveTo(I, L), e.lineTo(I, L + z), e.stroke()), (t.stockHiLowLines ?? !0) && g != null && _ != null && g && _) {
		e.strokeStyle = t.stockHiLowLineColor ? `#${t.stockHiLowLineColor}` : "#595959", e.lineWidth = Math.max(1, .75 * r), e.setLineDash([]);
		for (let t = 0; t < l; t++) {
			let n = g.values[t], r = _.values[t];
			if (n == null || r == null) continue;
			let i = G(t);
			e.beginPath(), e.moveTo(i, U(n)), e.lineTo(i, U(r)), e.stroke();
		}
	}
	let ie = (t, n, i) => {
		if (!t) return;
		let a = tn(n, t), o = t.markerSymbol ?? null, s = o != null && o !== "none" && ir(t), c = Math.max(3, R / l * .22);
		for (let n = 0; n < l; n++) {
			let l = t.values[n];
			if (l == null) continue;
			let u = G(n), d = U(l);
			if (s) {
				Zn(e, u, d, o, t.markerSize ?? 3, t.markerFill ?? a, t.markerLine ?? null, r);
				continue;
			}
			e.strokeStyle = a, e.lineWidth = Math.max(1, .75 * r), e.beginPath();
			let f = i === "right" ? u : i === "left" ? u - c : u - c / 2, p = i === "right" ? u + c : i === "left" ? u : u + c / 2;
			e.moveTo(f, d), e.lineTo(p, d), e.stroke();
		}
	};
	if (ie(y, f, "left"), ie(v, h, "right"), u.length < 3) for (let e = 0; e < u.length; e++) ie(u[e], e, "both");
	if (!t.catAxisHidden) {
		let n = Math.max(1, Math.ceil(l / 8)), r = t.catAxisFontColor ? `#${t.catAxisFontColor}` : "#555";
		e.fillStyle = r, e.textAlign = "center", e.textBaseline = "top", e.font = `${k}px ${Z(t, t.catAxisFontFace, "minor")}`;
		let i = R / l * n - 4, a = Mn(t), o = Pn(t);
		for (let s = 0; s < l; s += n) {
			let n = G(s);
			bn(e, t.catAxisMajorTickMark, "cat", L + z, n), a && (e.fillStyle = r, Fn(e, Nt(e, Et((c[s] ?? "").toString(), t.catAxisFormatCode, t.date1904), o === 0 ? i : z * .4), n, L + z + 5, o));
		}
	}
	yn(e, t, w, i, a, o, s, I, L, R, z, C + 2), un(e, t, i, a, o, s, I, L, R, z, E, D, M, N);
}
function Wn(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = zn(t), l = c.length;
	if (l === 0) return;
	let u = t.chartType === "stackedArea" || t.chartType === "stackedAreaPct", d = t.chartType === "stackedAreaPct", f = d ? c.map((e, n) => {
		let r = 0;
		for (let e of t.series) r += Math.abs(e.values[n] ?? 0);
		return r || 1;
	}) : null, p = (e, n) => {
		let r = t.series[e].values[n] ?? 0;
		return d && f ? r / f[n] * 100 : r;
	}, m = !u && t.secondaryValAxis && t.series.some((e) => e.useSecondaryAxis === !0) ? t.secondaryValAxis : null, h = (e) => m != null && e.useSecondaryAxis === !0, g = $e(t, s, r), _ = g.fontPx, v = g.topPad, y = g.bandH, b = jn(t.catAxisFontSizeHpt, s, r), x = jn(t.valAxisFontSizeHpt, s, r), S = Ke(t, o, s, .22), { legRightW: C, legLeftW: w, legTopH: T, legBottomH: E } = qe(S), D = Xe(t, o, s, r), O = D.catFontPx, k = D.valFontPx, A = D.catBandH, j = D.valBandW, M = y + T + x / 2 + 2, N = et(b) + A + E, ee = s - M - N, te = In(m, t.series, ee / r), ne = Math.max(8, Math.min(11, s / 20)), P = m?.fontSizeHpt ? m.fontSizeHpt / 100 * r : ne, F = 0;
	if (m && te && !m.hidden) {
		let n = e.font;
		e.font = `${P}px sans-serif`;
		let r = 0, i = Math.round((te.max - te.min) / te.step);
		for (let n = 0; n <= i; n++) r = Math.max(r, e.measureText(X(te.min + n * te.step, m.formatCode ?? null, t.date1904)).width);
		F = r + 18, e.font = n;
	}
	let I = m && m.title ? (m.titleFontSizeHpt ? m.titleFontSizeHpt / 100 * r : Math.max(9, s * .05)) + 8 : 0, L = {
		t: M,
		r: C + o * .05 + F + I,
		b: N,
		l: o * .12 + j + w
	};
	Rn(e, t, i, a + v, o, _);
	let { plotRect: { px0: R, py0: z, pw: B, ph: V } } = tt(t, i, a, o, s, r, {
		titleBand: g,
		legendSideReserveFrac: .22,
		pad: L
	});
	if (B <= 0 || V <= 0) return;
	t.plotAreaBg && (e.fillStyle = `#${t.plotAreaBg}`, e.fillRect(R, z, B, V));
	let H = 0;
	for (let e = 0; e < l; e++) if (u) {
		let n = 0;
		for (let r = 0; r < t.series.length; r++) n += p(r, e);
		H = Math.max(H, n);
	} else for (let n of t.series) h(n) || (H = Math.max(H, n.values[e] ?? 0));
	d && (H = H > 0 ? 100 : 0), t.valMax != null && (H = t.valMax), H === 0 && (H = 1);
	let { max: U, step: W } = st(0, H, void 0, t.valMax, V / r, t.valAxisMajorUnit), re = _t(t), G = re ? (e) => R + (e + .5) / l * B : (e) => R + (l === 1 ? B / 2 : e / (l - 1) * B), ie = (e) => z + V - e / U * V, ae = te ? te.makeToY(z, V) : ie, oe = (e) => h(e) ? ae : ie, { color: se, width: ce } = ht(t.catAxisLineColor, t.catAxisLineWidthEmu, r), { color: K, width: q } = ht(t.valAxisLineColor, t.valAxisLineWidthEmu, r);
	if (!t.valAxisHidden) {
		let n = Sn(t, r), i = t.valAxisMinorUnit;
		if (t.valAxisMinorGridlines && i != null && isFinite(i) && i > 0 && i < W) for (let t = i; t < U - 1e-9; t += i) Math.abs(t / W - Math.round(t / W)) > 1e-6 && xn(e, R, B, ie(t), !1, n);
		if (On(t)) {
			let t = Math.round(U / W);
			for (let r = 0; r <= t; r++) xn(e, R, B, ie(r * W), r === 0, n);
		}
	}
	if (!t.catAxisHidden && Cn(t)) {
		let n = wn(t, r);
		e.strokeStyle = n.color, e.lineWidth = n.width;
		for (let n of Tn(t, l)) {
			let t = R + n * B;
			e.beginPath(), e.moveTo(t, z), e.lineTo(t, z + V), e.stroke();
		}
	}
	let J = u ? Array(l).fill(0) : null;
	for (let n = t.series.length - 1; n >= 0; n--) {
		let r = t.series[n], i = tn(n, r), a = z + V, o = oe(r), s = r.smooth === !0;
		if (e.beginPath(), u && J) {
			let t = [];
			for (let e = 0; e < l; e++) t.push({
				x: G(e),
				y: ie(p(n, e) + J[e])
			});
			e.moveTo(t[0].x, t[0].y), nr(e, t, s);
			for (let t = l - 1; t >= 0; t--) e.lineTo(G(t), ie(J[t]));
			for (let e = 0; e < l; e++) J[e] += p(n, e);
		} else {
			let t = [];
			for (let e = 0; e < l; e++) t.push({
				x: G(e),
				y: o(r.values[e] ?? 0)
			});
			e.moveTo(G(0), a), e.lineTo(t[0].x, t[0].y), nr(e, t, s), e.lineTo(G(l - 1), a);
		}
		e.closePath(), e.fillStyle = qt(i, .6), e.fill(), e.strokeStyle = i, e.lineWidth = 1.5, e.setLineDash([]), e.stroke();
	}
	{
		let n = Math.max(2, 2.5 * r), i = (e, n) => {
			if (u) {
				let r = 0;
				for (let i = e; i < t.series.length; i++) r += p(i, n);
				return r;
			}
			return t.series[e].values[n] ?? 0;
		};
		for (let a = 0; a < t.series.length; a++) {
			let o = t.series[a], s = tn(a, o), u = oe(o), d = (e) => i(a, e);
			for (let t of o.errBars ?? []) ar(e, o, t, l, G, u, d, s);
			if (o.showMarker === !0 || ir(o)) for (let t = 0; t < l; t++) {
				if (o.values[t] == null) continue;
				let i = (o.dataPointOverrides ?? []).find((e) => e.idx === t), a = i?.markerSymbol ?? o.markerSymbol ?? "circle";
				if (a === "none") continue;
				let c = G(t), l = u(d(t));
				ir(o) ? Zn(e, c, l, a, i?.markerSize ?? o.markerSize ?? 5, i?.markerFill ?? i?.color ?? o.markerFill ?? s, i?.markerLine ?? o.markerLine ?? null, r) : (e.fillStyle = s, e.beginPath(), e.arc(c, l, n, 0, Math.PI * 2), e.fill());
			}
			or(e, o, c, l, G, u, d, V, r, t.date1904 ?? !1, !0, Z(t, t.dataLabelFontFace, "minor"), t.dataLabelPosition ?? "ctr");
		}
	}
	if (!t.valAxisHidden) {
		e.font = `${Math.max(8, Math.min(11, V / 20))}px ${Z(t, t.valAxisFontFace, "minor")}`, e.textBaseline = "middle";
		let n = Math.round(U / W);
		for (let r = 0; r <= n; r++) {
			let n = r * W, i = ie(n);
			bn(e, t.valAxisMajorTickMark, "val", R, i, K, q), e.fillStyle = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555", e.textAlign = "right", e.fillText(X(n, t.valAxisFormatCode, t.date1904), R - 6, i);
		}
	}
	if (!t.catAxisHidden && !t.catAxisLineHidden && (e.strokeStyle = se, e.lineWidth = ce, e.beginPath(), e.moveTo(R, z + V), e.lineTo(R + B, z + V), e.stroke()), !t.valAxisHidden && !t.valAxisLineHidden && t.valAxisLineColor != null && (e.strokeStyle = K, e.lineWidth = q, e.beginPath(), e.moveTo(R, z), e.lineTo(R, z + V), e.stroke()), !t.catAxisHidden && t.catAxisMajorTickMark && t.catAxisMajorTickMark !== "none") if (re) for (let n = 0; n <= l; n++) bn(e, t.catAxisMajorTickMark, "cat", z + V, R + n / l * B, se, ce);
	else for (let n = 0; n < l; n++) bn(e, t.catAxisMajorTickMark, "cat", z + V, G(n), se, ce);
	if (!t.catAxisHidden) {
		e.fillStyle = t.catAxisFontColor ? `#${t.catAxisFontColor}` : "#555", e.textAlign = "center", e.textBaseline = "top", e.font = `${Math.max(8, Math.min(11, B / l * .8))}px ${Z(t, t.catAxisFontFace, "minor")}`;
		let n = c.map((e) => Et((e ?? "").toString(), t.catAxisFormatCode, t.date1904)), r = 0;
		for (let t = 0; t < l; t++) r = Math.max(r, e.measureText(n[t] ?? "").width);
		let i = Math.max(1, Math.ceil((r + 6) / (B / l))), a = B / l * i - 4;
		for (let t = 0; t < l; t += i) e.fillText(Nt(e, n[t] ?? "", a), G(t), z + V + 3);
	}
	if (m && te) {
		let n = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#555";
		Ln(e, m, te, ae, R, z, B, V, s, r, P, F, n, t.date1904);
	}
	yn(e, t, S, i, a, o, s, R, z, B, V, y + 2), un(e, t, i, a, o, s, R, z, B, V, w, E, O, k);
}
var Gn = .88;
function Kn(e, t, n, r, i) {
	let { x: a, y: o, w: s, h: c } = n, l = t.series[0];
	if (!l) return;
	let u = l.categories && l.categories.length > 0 ? l.categories : t.categories, d = l.values.map((e) => Math.abs(e ?? 0)), f = d.reduce((e, t) => e + t, 0);
	if (f === 0) return;
	let p = tt(t, a, o, s, c, i, {
		titleTopPadFrac: .035,
		titleBottomPadFrac: .035,
		legendSideReserveFrac: .28,
		radialGapFrac: .02
	}), m = p.title.fontPx, h = p.title.bandH;
	Rn(e, t, a, o + p.title.topPad, s, m);
	let g = p.legend, { px0: _, py0: v, pw: y, ph: b } = p.plotRect, x = p.center.cx, S = p.center.cy, C = Math.min(y, b) * .42, w = -Math.PI / 2 + (t.firstSliceAngle ?? 0) * Math.PI / 180, T = r ? Math.max(1, Math.min(90, t.holeSize ?? 50)) : 0, E = r ? t.series : [l], D = T / 100 * C, O = (C - D) / E.length, k = (e, t) => {
		let n = (e.dataPointOverrides ?? []).find((e) => e.idx === t)?.explosion ?? 0;
		return n > 0 ? n / 100 * C : 0;
	}, A = l.seriesDataLabels, j = A != null && (A.showVal || A.showCatName || A.showSerName || A.showPercent), M = t.showDataLabels && !j, N = Z(t, t.dataLabelFontFace, "minor");
	for (let t = 0; t < E.length; t++) {
		let n = E[t], i = n.values.map((e) => Math.abs(e ?? 0)), a = i.reduce((e, t) => e + t, 0);
		if (a === 0) continue;
		let o = C - t * O, s = o - O, c = w;
		for (let l = 0; l < i.length; l++) {
			let u = i[l] / a * Math.PI * 2, d = nn(l, n), f = c + u / 2, p = k(n, l), m = p > 0 ? Math.cos(f) * p : 0, h = p > 0 ? Math.sin(f) * p : 0;
			if (e.beginPath(), s > .01 ? (e.arc(x + m, S + h, o, c, c + u), e.arc(x + m, S + h, s, c + u, c, !0)) : (e.moveTo(x + m, S + h), e.arc(x + m, S + h, o, c, c + u)), e.closePath(), e.fillStyle = d, e.fill(), e.strokeStyle = "#fff", e.lineWidth = 1, e.stroke(), M && t === 0 && u > .15) {
				let t = C * (r ? .75 : .6), n = x + m + Math.cos(f) * t, o = S + h + Math.sin(f) * t, s = Math.round(i[l] / a * 100);
				e.font = `bold ${Math.max(8, C * .1)}px ${N}`, e.fillStyle = "#fff", e.textAlign = "center", e.textBaseline = "middle", e.fillText(`${s}%`, n, o);
			}
			c += u;
		}
	}
	if (j && qn(e, t, A, l, u, d, f, x, S, C, D, w, N, i, _, v, y, b), g) {
		let n = [{
			...l,
			categories: u
		}];
		yn(e, {
			...t,
			series: n
		}, g, a, o, s, c, _, v, y, b, h + 2);
	}
}
function qn(e, t, n, r, i, a, o, s, c, l, u, d, f, p, m, h, g, _) {
	if (n.labelBox) {
		Jn(e, t, n, r, i, a, o, s, c, l, d, f, p, m, g, h, _);
		return;
	}
	let v = r.dataLabelOverrides ?? [], y = d;
	for (let d = 0; d < a.length; d++) {
		let p = a[d] / o * Math.PI * 2, m = y + p / 2;
		y += p;
		let h = v.find((e) => e.idx === d);
		if (h?.deleted) continue;
		let g = h?.showCatName ?? n.showCatName, _ = h?.showSerName ?? n.showSerName, b = h?.showVal ?? n.showVal, x = h?.showPercent ?? n.showPercent, S;
		if (h && h.text) S = h.text;
		else {
			let e = [];
			g && e.push((i[d] ?? "").toString()), _ && e.push(r.name), b && e.push(X(a[d], n.formatCode ?? null, t.date1904 ?? !1)), x && e.push(`${Math.round(a[d] / o * 100)}%`), S = e.filter(Boolean).join(" ");
		}
		if (!S) continue;
		let C = (h?.position ?? n.position ?? "bestFit") === "outEnd", w = C ? l + Math.max(10, l * .12) : u > .01 ? (u + l) / 2 : l * Gn, T = s + Math.cos(m) * w, E = c + Math.sin(m) * w, D = h?.fontSizeHpt ?? n.fontSizeHpt, O = D ? D / 100 : Math.max(8, l * .1), k = h?.fontBold ?? n.fontBold, A = h?.fontColor ?? n.fontColor;
		e.font = `${k ? "bold " : ""}${O}px ${f}`, e.fillStyle = A ? `#${A}` : C ? "#333" : "#fff", e.textAlign = "center", e.textBaseline = "middle", e.fillText(S, T, E);
	}
}
function Jn(e, t, n, r, i, a, o, s, c, l, u, d, f, p, m, h, g) {
	let _ = r.dataLabelOverrides ?? [], v = (e) => _.find((t) => t.idx === e), y = n.fontSizeHpt ? n.fontSizeHpt / 100 : Math.max(9, l * .09), b = Math.max(4, y * .45), x = Math.max(2, y * .28), S = y * .22, C = n.labelBox, w = [], T = u;
	for (let u = 0; u < a.length; u++) {
		let p = a[u] / o * Math.PI * 2, m = T + p / 2;
		if (T += p, p <= 0) continue;
		let h = v(u);
		if (h?.deleted) continue;
		let g = h?.showCatName ?? n.showCatName, _ = h?.showSerName ?? n.showSerName, E = h?.showVal ?? n.showVal, D = h?.showPercent ?? n.showPercent, O = [];
		if (h && h.text) O.push(h.text);
		else {
			if (g) {
				let e = (i[u] ?? "").toString();
				e && O.push(e);
			}
			_ && r.name && O.push(r.name), E && O.push(X(a[u], n.formatCode ?? null, t.date1904 ?? !1)), D && O.push(`${Math.round(a[u] / o * 100)}%`);
		}
		if (O.length === 0) continue;
		let k = h?.fontSizeHpt ? h.fontSizeHpt / 100 : y, A = h?.fontBold ?? n.fontBold ?? !1, j = h?.fontColor ? `#${h.fontColor}` : n.fontColor ? `#${n.fontColor}` : "#000", M = h?.labelBox ?? C, N = M?.fill ? `#${M.fill}` : null, ee = M?.borderColor ? `#${M.borderColor}` : null, te = M?.borderWidthEmu ? Math.max(.75, M.borderWidthEmu / dt * f) : 1;
		e.font = `${A ? "bold " : ""}${k}px ${d}`;
		let ne = 0;
		for (let t of O) ne = Math.max(ne, e.measureText(t).width);
		let P = k + S, F = ne + b * 2, I = O.length * P - S + x * 2, L = s + Math.cos(m) * l, R = c + Math.sin(m) * l, z = Math.cos(m) < 0, B = Math.max(F, I) * .55 + l * .06, V = L + Math.cos(m) * B, H = R + Math.sin(m) * B;
		w.push({
			lines: O,
			midAngle: m,
			rimX: L,
			rimY: R,
			boxW: F,
			boxH: I,
			cxBox: V,
			cyBox: H,
			leftSide: z,
			fontColor: j,
			boxFill: N,
			boxBorder: ee,
			boxBorderPx: te,
			fontPx: k,
			bold: A
		});
	}
	let E = h + 2, D = h + g - 2, O = D - E, k = (e) => {
		if (e.length === 0) return;
		e.sort((e, t) => e.cyBox - t.cyBox);
		let t = 0;
		for (let n of e) t += n.boxH;
		if (t += (e.length - 1) * 3, t > O) {
			let t = e.reduce((e, t) => e + t.boxH, 0), n = e.length;
			if (n === 1) {
				e[0].cyBox = Math.min(Math.max(e[0].cyBox, E + e[0].boxH / 2), D - e[0].boxH / 2);
				return;
			}
			let r = (O - t) / (n - 1), i = E;
			for (let t of e) t.cyBox = i + t.boxH / 2, i += t.boxH + r;
			return;
		}
		for (let t = 1; t < e.length; t++) {
			let n = e[t - 1], r = e[t], i = (n.boxH + r.boxH) / 2 + 3;
			r.cyBox - n.cyBox < i && (r.cyBox = n.cyBox + i);
		}
		let n = e[e.length - 1].cyBox + e[e.length - 1].boxH / 2 - D;
		if (n > 0) for (let t of e) t.cyBox -= n;
		let r = E - (e[0].cyBox - e[0].boxH / 2);
		if (r > 0) for (let t of e) t.cyBox += r;
	};
	k(w.filter((e) => !e.leftSide)), k(w.filter((e) => e.leftSide));
	for (let e of w) e.cyBox = Math.max(E + e.boxH / 2, e.cyBox), e.cyBox = Math.min(D - e.boxH / 2, e.cyBox);
	let A = p + 2, j = p + m - 2;
	for (let e of w) {
		let t = e.boxW / 2;
		e.cxBox - t < A && (e.cxBox = A + t), e.cxBox + t > j && (e.cxBox = j - t);
	}
	let M = n.leaderLineColor ? `#${n.leaderLineColor}` : "#a6a6a6", N = n.leaderLineWidthEmu ? Math.max(.5, n.leaderLineWidthEmu / dt * f) : 1;
	for (let t of w) {
		let r = t.cxBox + (t.leftSide ? t.boxW / 2 : -t.boxW / 2), i = t.cyBox, a = r - t.rimX, o = i - t.rimY, s = Math.hypot(a, o);
		n.showLeaderLines && s > t.fontPx * .9 && (e.beginPath(), e.moveTo(t.rimX, t.rimY), e.lineTo(r, i), e.strokeStyle = M, e.lineWidth = N, e.stroke());
	}
	for (let t of w) {
		let n = t.cxBox - t.boxW / 2, r = t.cyBox - t.boxH / 2;
		t.boxFill && (e.fillStyle = t.boxFill, e.fillRect(n, r, t.boxW, t.boxH)), t.boxBorder && (e.strokeStyle = t.boxBorder, e.lineWidth = t.boxBorderPx, e.strokeRect(n, r, t.boxW, t.boxH)), e.font = `${t.bold ? "bold " : ""}${t.fontPx}px ${d}`, e.fillStyle = t.fontColor, e.textAlign = "center", e.textBaseline = "middle";
		let i = t.fontPx + S, a = t.cyBox - (t.lines.length * i - S) / 2 + t.fontPx / 2;
		for (let n = 0; n < t.lines.length; n++) e.fillText(t.lines[n], t.cxBox, a + n * i);
	}
}
function Yn(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = zn(t), l = c.length;
	if (l < 3) return;
	let u = tt(t, i, a, o, s, r, {
		titleTopPadFrac: .035,
		titleBottomPadFrac: .035,
		legendSideReserveFrac: .22,
		radialGapFrac: .02
	}), d = u.legend, f = u.title.fontPx;
	Rn(e, t, i, a + u.title.topPad, o, f);
	let { px0: p, py0: m, pw: h, ph: g } = u.plotRect, _ = u.center.cx, v = u.center.cy, y = Math.min(h, g) * .38, b = 0;
	for (let e of t.series) for (let t of e.values) b = Math.max(b, t ?? 0);
	t.valMax != null && (b = t.valMax), b === 0 && (b = 1);
	let { max: x, step: S } = st(0, b, void 0, t.valMax, void 0, t.valAxisMajorUnit), C = -Math.PI / 2, w = (e) => C + e / l * Math.PI * 2, T = Math.round(x / S), E = (e) => Math.min(e * S, x);
	e.strokeStyle = "#ddd", e.lineWidth = .5;
	for (let t = 1; t <= T; t++) {
		let n = E(t) / x * y;
		e.beginPath();
		for (let t = 0; t < l; t++) {
			let r = w(t), i = _ + Math.cos(r) * n, a = v + Math.sin(r) * n;
			t === 0 ? e.moveTo(i, a) : e.lineTo(i, a);
		}
		e.closePath(), e.stroke();
	}
	e.strokeStyle = "#bbb", e.lineWidth = .5;
	for (let t = 0; t < l; t++) {
		let n = w(t);
		e.beginPath(), e.moveTo(_, v), e.lineTo(_ + Math.cos(n) * y, v + Math.sin(n) * y), e.stroke();
	}
	if (!t.valAxisHidden) {
		e.font = `${jn(t.valAxisFontSizeHpt, s, r)}px ${Z(t, t.valAxisFontFace, "minor")}`, e.fillStyle = "#555", e.textAlign = "right", e.textBaseline = "middle";
		for (let t = 1; t <= T; t++) {
			let n = E(t), r = n / x * y;
			e.fillText(Tt(n), _ - 3, v - r);
		}
	}
	e.font = `${Math.max(8, Math.min(11, y * .2))}px ${Z(t, t.catAxisFontFace, "minor")}`, e.fillStyle = "#444", e.textBaseline = "middle";
	let D = _ - h / 2, O = _ + h / 2;
	for (let n = 0; n < l; n++) {
		let r = w(n), i = _ + Math.cos(r) * (y + 12), a = v + Math.sin(r) * (y + 12), o = Math.cos(r) < -.1 ? "right" : Math.cos(r) > .1 ? "left" : "center";
		e.textAlign = o;
		let s = o === "right" ? i - D : o === "left" ? O - i : 2 * Math.min(O - i, i - D), l = Et((c[n] ?? "").toString(), t.catAxisFormatCode, t.date1904);
		e.fillText(Nt(e, l, s), i, a);
	}
	let k = t.radarStyle === "filled", A = Math.max(2, y * .025);
	for (let n = 0; n < t.series.length; n++) {
		let r = t.series[n], i = tn(n, r), a = [];
		for (let e = 0; e < l; e++) {
			let t = r.values[e];
			if (t == null) {
				a.push(null);
				continue;
			}
			let n = t / x, i = w(e);
			a.push([_ + Math.cos(i) * y * n, v + Math.sin(i) * y * n]);
		}
		e.beginPath();
		let o = !1;
		for (let t of a) {
			if (t == null) {
				o = !1;
				continue;
			}
			o ? e.lineTo(t[0], t[1]) : (e.moveTo(t[0], t[1]), o = !0);
		}
		let s = a.every((e) => e != null);
		if (k && s ? (e.closePath(), e.fillStyle = qt(i, .25), e.fill()) : s && e.closePath(), e.strokeStyle = i, e.lineWidth = 2, e.stroke(), !k && r.showMarker !== !1) {
			e.fillStyle = i;
			for (let t of a) t != null && (e.beginPath(), e.arc(t[0], t[1], A, 0, Math.PI * 2), e.fill());
		}
	}
	yn(e, t, d, i, a, o, s, p, m, h, g, u.title.bandH + 2);
}
function Xn(e, t, n, r) {
	let { x: i, y: a, w: o, h: s } = n, c = $e(t, s, r), l = c.fontPx, u = c.topPad, d = jn(t.catAxisFontSizeHpt, s, r), f = jn(t.valAxisFontSizeHpt, s, r), p = Ke(t, o, s, .22), { legRightW: m, legLeftW: h, legTopH: g, legBottomH: _ } = qe(p), v = Xe(t, o, s, r), y = v.catFontPx, b = v.valFontPx, x = v.catBandH, S = v.valBandW;
	if (t.title) {
		let n = t.titleManualLayout;
		n && (n.x !== void 0 || n.y !== void 0) ? Rn(e, t, i + n.x * o, a + n.y * s, (n.w ?? .5) * o, l) : Rn(e, t, i, a + u, o, l);
	}
	let { plotRect: { px0: C, py0: w, pw: T, ph: E } } = tt(t, i, a, o, s, r, {
		titleBand: c,
		legendSideReserveFrac: .22,
		pad: {
			t: c.bandH + g + f / 2 + 2,
			r: m + o * .05,
			b: (t.catAxisHidden ? s * .04 : et(d)) + x + _,
			l: (t.valAxisHidden ? o * .04 : o * .12) + S + h
		},
		honorPlotAreaManualLayout: !0
	});
	if (T <= 0 || E <= 0) return;
	t.plotAreaBg && (e.fillStyle = `#${t.plotAreaBg}`, e.fillRect(C, w, T, E));
	let D = [], O = [];
	for (let e of t.series) {
		let t = e.categories ?? [];
		for (let e of t) {
			let t = parseFloat(e);
			isNaN(t) || D.push(t);
		}
		for (let t of e.values) t != null && O.push(t);
	}
	let k = D.length === 0;
	if (k) {
		let e = Math.max(...t.series.map((e) => e.values.length));
		for (let t = 0; t < e; t++) D.push(t);
	}
	let A = Math.min(...D), j = Math.max(...D), M = Math.min(...O), N = Math.max(...O);
	A === j && (--A, j += 1), M === N && (--M, N += 1), t.valMin == null ? M > 0 && (M = 0) : M = t.valMin, t.valMax != null && (N = t.valMax);
	let { min: ee, max: te, step: ne } = st(M, N, t.valMin, t.valMax, void 0, t.valAxisMajorUnit);
	if (M = ee, N = te, t.catAxisMin != null && (A = t.catAxisMin), t.catAxisMax != null && (j = t.catAxisMax), t.catAxisMin == null || t.catAxisMax == null) {
		let e = nt(j - A);
		e > 0 && (t.catAxisMin ?? (A = Math.floor(A / e) * e), t.catAxisMax ?? (j = Math.ceil(j / e) * e));
	}
	let P = (e) => C + (e - A) / (j - A) * T, F = (e) => w + E - (e - M) / (N - M) * E, I = Sn(t, r);
	if (!t.valAxisHidden) {
		let n = Math.max(8, Math.min(11, E / 20));
		e.font = `${t.valAxisFontBold ? "bold " : ""}${n}px ${Z(t, t.valAxisFontFace, "minor")}`;
		let i = Math.round((N - M) / ne) + 1;
		for (let n = 0; n < i; n++) {
			let i = M + n * ne;
			if (i > N + ne * .01) break;
			let a = F(i);
			e.strokeStyle = I.color, e.lineWidth = I.width, e.beginPath(), e.moveTo(C, a), e.lineTo(C + T, a), e.stroke(), e.fillStyle = "#555", e.textAlign = "right", e.textBaseline = "middle", e.fillText(X(i, t.valAxisFormatCode, t.date1904), C - 4, a);
			let o = t.valAxisLineColor ? `#${t.valAxisLineColor}` : void 0;
			bn(e, t.valAxisMajorTickMark, "val", C, a, o, mt(t.valAxisLineWidthEmu, r));
		}
	}
	let L = w + E;
	if (t.catAxisCrossesAt != null) L = tr(F(t.catAxisCrossesAt), w, w + E);
	else {
		let e = t.catAxisCrosses ?? "autoZero";
		e === "autoZero" && M < 0 && N > 0 ? L = tr(F(0), w, w + E) : e === "min" ? L = w + E : e === "max" && (L = w);
	}
	if (!t.catAxisHidden && !t.catAxisLineHidden && (e.save(), e.strokeStyle = t.catAxisLineColor ? `#${t.catAxisLineColor}` : "#888", e.lineWidth = mt(t.catAxisLineWidthEmu, r), e.lineCap = "butt", e.beginPath(), e.moveTo(C, L), e.lineTo(C + T, L), e.stroke(), e.restore()), !t.valAxisHidden && !t.valAxisLineHidden && (e.save(), e.strokeStyle = t.valAxisLineColor ? `#${t.valAxisLineColor}` : "#888", e.lineWidth = mt(t.valAxisLineWidthEmu, r), e.beginPath(), e.moveTo(C, w), e.lineTo(C, w + E), e.stroke(), e.restore()), !t.catAxisHidden) {
		let n = Math.max(8, Math.min(11, E / 20));
		e.font = `${t.catAxisFontBold ? "bold " : ""}${n}px ${Z(t, t.catAxisFontFace, "minor")}`;
		let i = nt(j - A), a = Math.round((j - A) / i) + 1;
		e.fillStyle = "#555", e.textAlign = "center", e.textBaseline = "top";
		for (let n = 0; n < a; n++) {
			let a = A + n * i;
			if (a > j + i * .01) break;
			let o = P(a);
			e.fillText(X(a, t.catAxisFormatCode, t.date1904), o, L + 4);
			let s = t.catAxisLineColor ? `#${t.catAxisLineColor}` : void 0;
			bn(e, t.catAxisMajorTickMark, "cat", L, o, s, mt(t.catAxisLineWidthEmu, r));
		}
	}
	let R = t.chartType === "bubble", z = R ? "marker" : t.scatterStyle ?? "marker", B = z === "line" || z === "lineMarker" || z === "lineNoMarker", V = z === "smooth" || z === "smoothMarker" || z === "smoothNoMarker", H = z === "lineNoMarker" || z === "smoothNoMarker";
	for (let n = 0; n < t.series.length; n++) {
		let i = t.series[n], a = tn(n, i), o = i.categories ?? [];
		for (let t of i.errBars ?? []) Qn(e, i, t, o, k, P, F, a);
		if ((B || V) && i.lineHidden !== !0) {
			let t = [];
			for (let e = 0; e < i.values.length; e++) {
				let n = i.values[e];
				if (n == null) continue;
				let r = k ? e : parseFloat(o[e] ?? "0");
				isNaN(r) || t.push({
					x: P(r),
					y: F(n)
				});
			}
			if (t.length >= 2) {
				if (e.save(), e.strokeStyle = i.color ? `#${i.color}` : a, e.lineWidth = 1.5, e.beginPath(), e.moveTo(t[0].x, t[0].y), V && t.length >= 3) for (let n = 0; n < t.length - 1; n++) {
					let r = t[n - 1] ?? t[n], i = t[n], a = t[n + 1], o = t[n + 2] ?? a, s = i.x + (a.x - r.x) / 6, c = i.y + (a.y - r.y) / 6, l = a.x - (o.x - i.x) / 6, u = a.y - (o.y - i.y) / 6;
					e.bezierCurveTo(s, c, l, u, a.x, a.y);
				}
				else for (let n = 1; n < t.length; n++) e.lineTo(t[n].x, t[n].y);
				e.stroke(), e.restore();
			}
		}
		if (!(H || i.showMarker === !1 || typeof i.markerSymbol == "string" && i.markerSymbol === "none")) {
			let t = 0;
			if (R && i.bubbleSizes && i.bubbleSizes.length > 0) {
				let e = Math.max(0, ...i.bubbleSizes.filter((e) => e != null));
				e > 0 && (t = Math.min(T, E) / Math.max(8, i.values.length * 1.6) / Math.sqrt(e));
			}
			for (let n = 0; n < i.values.length; n++) {
				let s = i.values[n];
				if (s == null) continue;
				let c = k ? n : parseFloat(o[n] ?? "0");
				if (isNaN(c)) continue;
				let l = (i.dataPointOverrides ?? []).find((e) => e.idx === n), u = l?.markerSymbol ?? i.markerSymbol ?? "circle", d = l?.markerSize ?? i.markerSize ?? 5;
				if (R && t > 0) {
					let e = i.bubbleSizes?.[n];
					e != null && e > 0 && (d = Math.sqrt(e) * t * 2 / r);
				}
				let f = l?.markerFill ?? l?.color ?? i.markerFill ?? a, p = l?.markerLine ?? i.markerLine ?? null;
				Zn(e, P(c), F(s), u, d, f, p, r);
			}
		}
		$n(e, i, o, k, P, F, E, r, t.date1904, Z(t, t.dataLabelFontFace, "minor"), t.dataLabelPosition ?? "r");
	}
	yn(e, t, p, i, a, o, s, C, w, T, E, c.bandH + 2), un(e, t, i, a, o, s, C, w, T, E, h, _, y, b);
}
function Zn(e, t, n, r, i, a, o, s) {
	let c = Math.max(2, i * s), l = c / 2, u = a.startsWith("#") ? a : `#${a}`, d = o ? o.startsWith("#") ? o : `#${o}` : null;
	switch (e.save(), e.fillStyle = u, d && (e.strokeStyle = d, e.lineWidth = 1), r) {
		case "square":
			e.fillRect(t - l, n - l, c, c), o && e.strokeRect(t - l, n - l, c, c);
			break;
		case "diamond":
			e.beginPath(), e.moveTo(t, n - l), e.lineTo(t + l, n), e.lineTo(t, n + l), e.lineTo(t - l, n), e.closePath(), e.fill(), o && e.stroke();
			break;
		case "triangle":
			e.beginPath(), e.moveTo(t, n - l), e.lineTo(t + l, n + l), e.lineTo(t - l, n + l), e.closePath(), e.fill(), o && e.stroke();
			break;
		case "x":
			e.strokeStyle = u, e.lineWidth = Math.max(1, c * .18), e.beginPath(), e.moveTo(t - l, n - l), e.lineTo(t + l, n + l), e.moveTo(t - l, n + l), e.lineTo(t + l, n - l), e.stroke();
			break;
		case "plus":
			e.strokeStyle = u, e.lineWidth = Math.max(1, c * .18), e.beginPath(), e.moveTo(t - l, n), e.lineTo(t + l, n), e.moveTo(t, n - l), e.lineTo(t, n + l), e.stroke();
			break;
		case "star":
			e.beginPath();
			for (let r = 0; r < 10; r++) {
				let i = r % 2 == 0 ? l : l * .45, a = -Math.PI / 2 + r * Math.PI / 5, o = t + Math.cos(a) * i, s = n + Math.sin(a) * i;
				r === 0 ? e.moveTo(o, s) : e.lineTo(o, s);
			}
			e.closePath(), e.fill(), o && e.stroke();
			break;
		case "dot":
			e.beginPath(), e.arc(t, n, Math.max(1, c * .25), 0, Math.PI * 2), e.fill();
			break;
		case "dash": {
			let r = Math.max(1, c * .25);
			e.fillRect(t - l, n - r / 2, c, r);
			break;
		}
		default:
			e.beginPath(), e.arc(t, n, l, 0, Math.PI * 2), e.fill(), o && e.stroke();
			break;
	}
	e.restore();
}
function Qn(e, t, n, r, i, a, o, s) {
	e.save(), e.strokeStyle = n.color ? `#${n.color}` : s, e.lineWidth = n.lineWidthEmu ? Math.max(.5, n.lineWidthEmu / dt) : 1, e.setLineDash(rr(n.dash));
	let c = n.barType === "plus" || n.barType === "both", l = n.barType === "minus" || n.barType === "both", u = n.dir === "x", d = e.lineWidth * 1.5;
	for (let s = 0; s < t.values.length; s++) {
		let f = t.values[s];
		if (f == null) continue;
		let p = i ? s : parseFloat(r[s] ?? "0");
		if (isNaN(p)) continue;
		let m = a(p), h = o(f), g = (t) => {
			let r = m, i = h;
			u ? r = a(p + t) : i = o(f + t), e.beginPath(), e.moveTo(m, h), e.lineTo(r, i), e.stroke(), n.noEndCap || (e.save(), e.setLineDash([]), e.beginPath(), u ? (e.moveTo(r, i - d), e.lineTo(r, i + d)) : (e.moveTo(r - d, i), e.lineTo(r + d, i)), e.stroke(), e.restore());
		};
		if (c) {
			let e = n.plus[s];
			e != null && g(e);
		}
		if (l) {
			let e = n.minus[s];
			e != null && g(-e);
		}
	}
	e.restore();
}
function $n(e, t, n, r, i, a, o, s, c = !1, l = "sans-serif", u = "r") {
	let d = t.dataLabelOverrides ?? [];
	if (d.length === 0 && !t.seriesDataLabels) return;
	let f = t.seriesDataLabels;
	for (let p = 0; p < t.values.length; p++) {
		let m = t.values[p];
		if (m == null) continue;
		let h = r ? p : parseFloat(n[p] ?? "0");
		if (isNaN(h)) continue;
		let g = d.find((e) => e.idx === p);
		if (g?.deleted) continue;
		let _ = g?.showCatName ?? f?.showCatName, v = g?.showSerName ?? f?.showSerName, y = g?.showVal ?? f?.showVal, b;
		if (g?.text) b = g.text;
		else if (y || v || _) {
			let e = [];
			if (_ && !r && e.push(n[p] ?? ""), v && e.push(t.name), y && e.push(X(m, f?.formatCode ?? null, c)), b = e.filter(Boolean).join(" "), !b) continue;
		} else continue;
		let x = g?.position ?? f?.position ?? u, S = g?.fontSizeHpt ?? f?.fontSizeHpt, C = S ? S / 100 * s : Math.max(9, Math.min(11, o / 25)), w = g?.fontColor ?? f?.fontColor, T = g?.fontBold ?? f?.fontBold ?? !1;
		er(e, i(h), a(m), b, x, C, w, T, l);
	}
}
function er(e, t, n, r, i, a, o, s, c = "sans-serif", l = 0) {
	e.save(), e.font = `${s ? "bold " : ""}${a}px ${c}`, e.fillStyle = o ? `#${o}` : "#333";
	let u = a * .6 + l, d = t, f = n;
	switch (i) {
		case "l":
			e.textAlign = "right", e.textBaseline = "middle", d = t - u;
			break;
		case "r":
			e.textAlign = "left", e.textBaseline = "middle", d = t + u;
			break;
		case "t":
			e.textAlign = "center", e.textBaseline = "bottom", f = n - u;
			break;
		case "b":
			e.textAlign = "center", e.textBaseline = "top", f = n + u;
			break;
		case "ctr":
			e.textAlign = "center", e.textBaseline = "middle";
			break;
		default:
			e.textAlign = "left", e.textBaseline = "middle", d = t + u;
			break;
	}
	let p = r.split(/\r?\n/), m = a * 1.15, h = m * p.length, g = f;
	e.textBaseline === "middle" ? g = f - (h - m) / 2 : e.textBaseline === "bottom" && (g = f - (h - m));
	for (let t of p) e.fillText(t, d, g), g += m;
	e.restore();
}
function tr(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function nr(e, t, n) {
	if (t.length !== 0) if (n && t.length >= 3) for (let n = 0; n < t.length - 1; n++) {
		let r = t[n - 1] ?? t[n], i = t[n], a = t[n + 1], o = t[n + 2] ?? a, s = i.x + (a.x - r.x) / 6, c = i.y + (a.y - r.y) / 6, l = a.x - (o.x - i.x) / 6, u = a.y - (o.y - i.y) / 6;
		e.bezierCurveTo(s, c, l, u, a.x, a.y);
	}
	else for (let n = 1; n < t.length; n++) e.lineTo(t[n].x, t[n].y);
}
function rr(e) {
	if (!e) return [];
	switch (e) {
		case "solid": return [];
		case "dot":
		case "sysDot": return [1, 2];
		case "dash":
		case "sysDash": return [4, 2];
		case "lgDash": return [8, 3];
		case "dashDot":
		case "sysDashDot": return [
			4,
			2,
			1,
			2
		];
		case "lgDashDot": return [
			8,
			3,
			1,
			3
		];
		case "dashDotDot":
		case "sysDashDotDot":
		case "lgDashDotDot": return [
			4,
			2,
			1,
			2,
			1,
			2
		];
		default: return [];
	}
}
function ir(e) {
	return e.markerSymbol != null || e.markerSize != null || e.markerFill != null || e.markerLine != null || e.dataPointOverrides != null && e.dataPointOverrides.length > 0;
}
function ar(e, t, n, r, i, a, o, s) {
	if (n.dir === "x") return;
	let c = n.barType === "plus" || n.barType === "both", l = n.barType === "minus" || n.barType === "both";
	e.save(), e.strokeStyle = n.color ? `#${n.color}` : s, e.lineWidth = n.lineWidthEmu ? Math.max(.5, n.lineWidthEmu / dt) : 1, e.setLineDash(rr(n.dash));
	let u = e.lineWidth * 1.5;
	for (let s = 0; s < r; s++) {
		if (t.values[s] == null) continue;
		let r = o(s), d = i(s), f = a(r), p = (t) => {
			let i = a(r + t);
			e.beginPath(), e.moveTo(d, f), e.lineTo(d, i), e.stroke(), n.noEndCap || (e.save(), e.setLineDash([]), e.beginPath(), e.moveTo(d - u, i), e.lineTo(d + u, i), e.stroke(), e.restore());
		};
		if (c) {
			let e = n.plus[s];
			e != null && p(e);
		}
		if (l) {
			let e = n.minus[s];
			e != null && p(-e);
		}
	}
	e.restore();
}
function or(e, t, n, r, i, a, o, s, c, l, u, d = "sans-serif", f = "t") {
	let p = t.dataLabelOverrides ?? [], m = t.seriesDataLabels;
	if (p.length === 0 && !m) return !1;
	for (let h = 0; h < r; h++) {
		if (t.values[h] == null && !u) continue;
		let r = o(h), g = p.find((e) => e.idx === h);
		if (g?.deleted) continue;
		let _ = g?.showCatName ?? m?.showCatName, v = g?.showSerName ?? m?.showSerName, y = g?.showVal ?? m?.showVal, b;
		if (g?.text) b = g.text;
		else if (y || v || _) {
			let e = [];
			if (_ && e.push(n[h] ?? ""), v && e.push(t.name), y && e.push(X(r, m?.formatCode ?? null, l)), b = e.filter(Boolean).join(" "), !b) continue;
		} else continue;
		let x = g?.position ?? m?.position ?? f, S = g?.fontSizeHpt ?? m?.fontSizeHpt, C = S ? S / 100 * c : Math.max(9, Math.min(11, s / 25)), w = g?.fontColor ?? m?.fontColor, T = g?.fontBold ?? m?.fontBold ?? !1;
		er(e, i(h), a(r), b, x, C, w, T, d);
	}
	return !0;
}
function sr(e, t, n) {
	let { x: r, y: i, w: a, h: o } = n, s = t.plotAreaManualLayout, c, l, u, d;
	if (s && s.w != null && s.h != null) c = r + s.x * a, l = i + s.y * o, u = s.w * a, d = s.h * o;
	else {
		let e = t.valAxisHidden ? a * .01 : a * .11, n = a * .01, s = o * .12, f = o * .14;
		c = r + e, l = i + s, u = a - e - n, d = o - s - f;
	}
	let f = t.series[0]?.values ?? [], p = t.categories, m = p.length;
	if (m === 0) return;
	let h = new Set(t.subtotalIndices), g = 0, _ = [];
	for (let e = 0; e < m; e++) {
		let t = f[e] ?? 0;
		if (e === 0 || h.has(e)) _.push({
			start: 0,
			end: t,
			isSub: !0,
			isPos: !0
		}), g = t;
		else {
			let e = t >= 0 ? g : g + t, n = t >= 0 ? g + t : g;
			_.push({
				start: e,
				end: n,
				isSub: !1,
				isPos: t >= 0
			}), g += t;
		}
	}
	let v = _.map((e) => e.end), y = _.map((e) => e.start), b = Math.max(...v, ...y), x = Math.min(...y, 0), S = b - x;
	if (S <= 0) return;
	let C = x < 0 ? x - S * .05 : 0, w = (b - C) * 1.1, T = C + w, E = nt(w);
	e.save();
	let D = Math.round(o * .042);
	if (e.font = `${D}px ${Z(t, t.valAxisFontFace, "minor")}`, !t.valAxisHidden) {
		e.strokeStyle = "#e8e8e8", e.lineWidth = .7, e.fillStyle = "#666", e.textAlign = "right", e.textBaseline = "middle";
		for (let n = Math.ceil(C / E) * E; n <= T; n += E) {
			let r = l + d * (1 - (n - C) / w);
			e.beginPath(), e.moveTo(c, r), e.lineTo(c + u, r), e.stroke(), e.fillText(X(n, t.valAxisFormatCode, t.date1904), c - 4, r);
		}
	}
	let O = !t.valAxisHidden && !t.valAxisLineHidden, k = !t.catAxisHidden && !t.catAxisLineHidden;
	(O || k) && (e.strokeStyle = "#bbb", e.lineWidth = 1, e.beginPath(), O ? (e.moveTo(c, l), e.lineTo(c, l + d), k && e.lineTo(c + u, l + d)) : k && (e.moveTo(c, l + d), e.lineTo(c + u, l + d)), e.stroke());
	let A = u / m, j = A / (1 + (t.barGapWidth ?? 150) / 100);
	_.forEach((n, r) => {
		let i = c + A * r + (A - j) / 2, a = l + d * (1 - (n.end - C) / w), s = l + d * (1 - (n.start - C) / w), u = Math.max(1, s - a);
		if (n.isSub ? (e.fillStyle = "#196ECA", e.fillRect(i, a, j, u)) : (e.strokeStyle = n.isPos ? "#5BA4E6" : "#E46970", e.lineWidth = 1.5, e.strokeRect(i + .75, a + .75, j - 1.5, u - 1.5)), r < m - 1) {
			let t = c + A * (r + 1) + (A - j) / 2, o = n.isPos ? a : s;
			e.strokeStyle = "#ccc", e.lineWidth = .8, e.setLineDash([3, 3]), e.beginPath(), e.moveTo(i + j, o), e.lineTo(t, o), e.stroke(), e.setLineDash([]);
		}
		let p = f[r] ?? 0, h = t.dataLabelFormatCode ?? t.series[0]?.valFormatCode ?? null, g = p < 0 ? `△ ${X(Math.abs(p), h, t.date1904)}` : X(p, h, t.date1904), _ = t.series[0]?.dataLabelColors?.[r] ?? null;
		e.fillStyle = _ ? `#${_}` : t.dataLabelFontColor ? `#${t.dataLabelFontColor}` : "#595959", e.font = `bold ${Math.round(o * .044)}px ${Z(t, t.dataLabelFontFace, "minor")}`, e.textAlign = "center", p < 0 ? (e.textBaseline = "top", e.fillText(g, i + j / 2, s + 3)) : (e.textBaseline = "bottom", e.fillText(g, i + j / 2, a - 3));
	}), e.textAlign = "center", e.textBaseline = "top", e.fillStyle = "#666", e.font = `${Math.round(o * .038)}px ${Z(t, t.catAxisFontFace, "minor")}`;
	let M = l + d + 4;
	for (let n = 0; n < m; n++) {
		let r = c + A * n + A / 2;
		Et(p[n], t.catAxisFormatCode, t.date1904).split(/\s+/).forEach((t, n) => e.fillText(t, r, M + n * (D + 2)));
	}
	e.restore();
}
function cr(e, t, n) {
	let r = e.length;
	if (r === 0) return 0;
	if (r === 1) return e[0];
	let i;
	n === "inclusive" ? i = t * (r - 1) + 1 : (i = t * (r + 1), i < 1 && (i = 1), i > r && (i = r));
	let a = Math.floor(i), o = i - a;
	return a >= r ? e[r - 1] : e[a - 1] + o * (e[a] - e[a - 1]);
}
function lr(e, t) {
	if (e.length === 0) return null;
	let n = [...e].sort((e, t) => e - t), r = cr(n, .25, t), i = cr(n, .5, t), a = cr(n, .75, t), o = a - r, s = r - 1.5 * o, c = a + 1.5 * o, l = [], u = [];
	for (let e of n) e < s || e > c ? u.push(e) : l.push(e);
	return {
		q1: r,
		median: i,
		q3: a,
		whiskerLo: l.length ? l[0] : n[0],
		whiskerHi: l.length ? l[l.length - 1] : n[n.length - 1],
		mean: e.reduce((e, t) => e + t, 0) / e.length,
		outliers: u,
		inner: l
	};
}
function ur(e, t, n, r) {
	let i = t.chartexBox;
	if (!i || i.categories.length === 0 || i.series.length === 0) return;
	let { x: a, y: o, w: s, h: c } = n, l = $e(t, c, r), u = jn(t.catAxisFontSizeHpt, c, r), d = jn(t.valAxisFontSizeHpt, c, r), f = tt(t, a, o, s, c, r, {
		titleBand: l,
		legendSideReserveFrac: 0,
		pad: {
			t: l.bandH + d / 2 + 2,
			r: s * .02,
			b: t.catAxisHidden ? c * .02 : et(u),
			l: t.valAxisHidden ? s * .02 : s * .1
		}
	});
	Rn(e, t, a, o + f.title.topPad, s, f.title.fontPx);
	let { px0: p, py0: m, pw: h, ph: g } = f.plotRect, _ = i.categories, v = _.length, y = i.series.length, b = Infinity, x = -Infinity;
	for (let e of i.series) for (let t of e.valuesByCategory) for (let e of t) e < b && (b = e), e > x && (x = e);
	if (!isFinite(b) || !isFinite(x)) return;
	let { min: S, max: C, step: w } = st(b, x, t.valMin, t.valMax, g / r, t.valAxisMajorUnit), T = C - S || 1, E = (e) => m + g * (1 - (e - S) / T), D = Z(t, t.valAxisFontFace, "minor"), O = jn(t.valAxisFontSizeHpt, c, r);
	if (e.save(), !t.valAxisHidden) {
		e.font = `${O}px ${D}`, e.textAlign = "right", e.textBaseline = "middle";
		for (let n = S; n <= C + 1e-6; n += w) {
			let r = E(n);
			e.strokeStyle = "#e6e6e6", e.lineWidth = 1, e.beginPath(), e.moveTo(p, r), e.lineTo(p + h, r), e.stroke(), e.fillStyle = t.valAxisFontColor ? `#${t.valAxisFontColor}` : "#595959", e.fillText(X(n, t.valAxisFormatCode, t.date1904), p - 4, r);
		}
	}
	!t.catAxisHidden && !t.catAxisLineHidden && (e.strokeStyle = "#bfbfbf", e.lineWidth = 1, e.beginPath(), e.moveTo(p, m + g), e.lineTo(p + h, m + g), e.stroke());
	let k = h / v, A = k / (1 + (t.barGapWidth ?? 150) / 100), j = A * .06, M = (A - j * (y - 1)) / y, N = (e) => {
		let n = t.chartexAccents?.[e % (t.chartexAccents?.length ?? 1)];
		return `#${i.series[e].color ?? n ?? en[e % en.length]}`;
	}, ee = jn(t.catAxisFontSizeHpt, c, r);
	for (let n = 0; n < v; n++) {
		let r = p + k * n + (k - A) / 2;
		for (let t = 0; t < y; t++) {
			let a = i.series[t], o = lr(a.valuesByCategory[n] ?? [], a.quartileMethod);
			if (!o) continue;
			let s = r + t * (M + j), c = s + M / 2, l = N(t), u = rn(l, .8), d = E(o.q1), f = E(o.q3), p = Math.min(d, f), m = Math.max(1, Math.abs(d - f)), h = M * .4;
			e.strokeStyle = u, e.lineWidth = 1, e.beginPath(), e.moveTo(c, E(o.whiskerHi)), e.lineTo(c, f), e.moveTo(c, d), e.lineTo(c, E(o.whiskerLo)), e.moveTo(c - h / 2, E(o.whiskerHi)), e.lineTo(c + h / 2, E(o.whiskerHi)), e.moveTo(c - h / 2, E(o.whiskerLo)), e.lineTo(c + h / 2, E(o.whiskerLo)), e.stroke(), e.fillStyle = l, e.fillRect(s, p, M, m), e.strokeStyle = u, e.lineWidth = .75, e.strokeRect(s + .375, p + .375, M - .75, m - .75);
			let g = E(o.median);
			if (e.strokeStyle = u, e.lineWidth = 1, e.beginPath(), e.moveTo(s, g), e.lineTo(s + M, g), e.stroke(), a.meanMarker) {
				let t = E(o.mean), n = Math.max(2, M * .14);
				e.strokeStyle = u, e.lineWidth = 1, e.beginPath(), e.moveTo(c - n, t - n), e.lineTo(c + n, t + n), e.moveTo(c + n, t - n), e.lineTo(c - n, t + n), e.stroke();
			}
			if (a.showOutliers) {
				e.fillStyle = l;
				let t = Math.max(1.5, M * .06);
				for (let n of o.outliers) e.beginPath(), e.arc(c, E(n), t, 0, Math.PI * 2), e.fill();
			}
		}
		if (!t.catAxisHidden) {
			e.font = `${ee}px ${Z(t, t.catAxisFontFace, "minor")}`, e.fillStyle = t.catAxisFontColor ? `#${t.catAxisFontColor}` : "#595959", e.textAlign = "center", e.textBaseline = "top";
			let r = _[n], i = p + k * n + k / 2;
			e.fillText(r, i, m + g + 4);
		}
	}
	e.restore();
}
function dr(e) {
	let t = {
		label: "",
		value: 0,
		depth: -1,
		children: [],
		branchIndex: -1,
		a0: 0,
		a1: 0
	};
	for (let n of e) {
		let e = t;
		for (let t = 0; t < n.path.length; t++) {
			let r = n.path[t], i = e.children.find((e) => e.label === r);
			i || (i = {
				label: r,
				value: 0,
				depth: t,
				children: [],
				branchIndex: t === 0 ? e.children.length : e.branchIndex,
				a0: 0,
				a1: 0
			}, e.children.push(i)), i.value += n.size, e = i;
		}
	}
	return t.value = t.children.reduce((e, t) => e + t.value, 0), t;
}
function fr(e) {
	let t = e.children.reduce((e, t) => e + t.value, 0);
	if (t <= 0) return;
	let n = e.a0;
	for (let r of e.children) {
		let i = (e.a1 - e.a0) * r.value / t;
		r.a0 = n, r.a1 = n + i, n = r.a1, fr(r);
	}
}
function pr(e) {
	return e.children.length === 0 ? e.depth : Math.max(...e.children.map(pr));
}
function mr(e, t, n, r) {
	let i = t.chartexSunburst;
	if (!i || i.rows.length === 0) return;
	let { x: a, y: o, w: s, h: c } = n, l = tt(t, a, o, s, c, r, {
		titleTopPadFrac: .035,
		titleBottomPadFrac: .035,
		legendSideReserveFrac: 0,
		radialGapFrac: .02
	});
	Rn(e, t, a, o + l.title.topPad, s, l.title.fontPx);
	let { px0: u, py0: d, pw: f, ph: p } = l.plotRect, m = u + f / 2, h = d + p / 2, g = Math.min(f, p) * .46, _ = dr(i.rows);
	if (_.value <= 0 || _.children.length === 0) return;
	_.a0 = -Math.PI / 2, _.a1 = -Math.PI / 2 + Math.PI * 2, fr(_);
	let v = pr(_) + 1, y = g * .18, b = (g - y) / v, x = t.chartexAccents, S = (e) => `#${x?.[e % x.length] ?? en[e % en.length]}`, C = Z(t, t.dataLabelFontFace, "minor"), w = Math.max(7, Math.min(13, g * .075)), T = Array.from({ length: v }, () => []), E = (e) => {
		e.depth >= 0 && T[e.depth].push(e), e.children.forEach(E);
	};
	E(_), e.save();
	for (let t = 0; t < v; t++) {
		let n = y + t * b, r = n + b;
		for (let i of T[t]) {
			let t = i.a1 - i.a0;
			if (t <= 1e-4) continue;
			e.beginPath(), e.arc(m, h, r, i.a0, i.a1), e.arc(m, h, n, i.a1, i.a0, !0), e.closePath(), e.fillStyle = S(i.branchIndex), e.fill(), e.strokeStyle = "#ffffff", e.lineWidth = 1, e.stroke();
			let a = (i.a0 + i.a1) / 2, o = (n + r) / 2, s = b - 4, c = t * o;
			if (s < w * .9 && c < w * .9) continue;
			e.save(), e.translate(m + Math.cos(a) * o, h + Math.sin(a) * o);
			let l = a + Math.PI / 2, u = l * 180 / Math.PI % 360;
			u > 90 && u < 270 && (l += Math.PI), e.rotate(l), e.font = `${w}px ${C}`, e.fillStyle = "#ffffff", e.textAlign = "center", e.textBaseline = "middle";
			let d = i.label.split(/\s+/).filter(Boolean), f = c - 2, p = [], g = "";
			for (let t of d) {
				let n = g ? `${g} ${t}` : t;
				e.measureText(n).width <= f || !g ? g = n : (p.push(g), g = t);
			}
			g && p.push(g);
			let _ = w * 1.05, v = Math.max(1, Math.floor(s / _)), y = p.slice(0, v).map((t) => Nt(e, t, f)), x = y.length * _;
			y.forEach((t, n) => {
				t !== "" && e.fillText(t, 0, -x / 2 + _ / 2 + n * _);
			}), e.restore();
		}
	}
	e.restore();
}
function hr(e, t, n, r = pt) {
	e.save();
	try {
		let { x: i, y: a, w: o, h: s } = n;
		if (t.chartBg && (e.fillStyle = `#${t.chartBg}`, e.fillRect(i, a, o, s)), t.chartBorderColor) {
			e.save(), e.strokeStyle = `#${t.chartBorderColor}`, e.lineWidth = t.chartBorderWidthEmu ? Math.max(.5, t.chartBorderWidthEmu / dt) * r : 1;
			let n = e.lineWidth;
			e.strokeRect(i + n / 2, a + n / 2, o - n, s - n), e.restore();
		}
		let c = t.chartexBox != null || t.chartexSunburst != null;
		if (t.series.length === 0 && !c) {
			e.fillStyle = "#888", e.font = "12px sans-serif", e.textAlign = "center", e.textBaseline = "middle", e.fillText("(no data)", i + o / 2, a + s / 2);
			return;
		}
		switch (t.chartType) {
			case "clusteredBar":
			case "clusteredBarH":
			case "stackedBar":
			case "stackedBarH":
			case "stackedBarPct":
			case "stackedBarHPct":
				Vn(e, t, n, r);
				break;
			case "line":
			case "stackedLine":
			case "stackedLinePct":
				Hn(e, t, n, r);
				break;
			case "area":
			case "stackedArea":
			case "stackedAreaPct":
				Wn(e, t, n, r);
				break;
			case "pie":
				Kn(e, t, n, !1, r);
				break;
			case "doughnut":
				Kn(e, t, n, !0, r);
				break;
			case "radar":
				Yn(e, t, n, r);
				break;
			case "scatter":
			case "bubble":
				Xn(e, t, n, r);
				break;
			case "waterfall":
				sr(e, t, n);
				break;
			case "stock":
				Un(e, t, n, r);
				break;
			case "boxWhisker":
				ur(e, t, n, r);
				break;
			case "sunburst":
				mr(e, t, n, r);
				break;
			default: e.fillStyle = "#888", e.font = "11px sans-serif", e.textAlign = "center", e.textBaseline = "middle", e.fillText(`Chart: ${t.chartType}`, i + o / 2, a + s / 2);
		}
	} finally {
		e.restore();
	}
}
//#endregion
//#region packages/core/src/autoResize.ts
function gr(e, t, n = {}) {
	let r = n.pauseWhenHidden ?? !0, i = null, a = 0, o = 0, s = null, c = !1, l = !1, u = () => {
		if (!l && !(r && typeof document < "u" && document.hidden)) {
			if (s) {
				c = !0;
				return;
			}
			i === null && (i = requestAnimationFrame(d));
		}
	}, d = async () => {
		if (i = null, l) return;
		let t = a, n = o;
		try {
			let r = e(t, n);
			s = r instanceof Promise ? r : Promise.resolve(), await s;
		} catch (e) {
			console.error("[autoResize] render failed:", e);
		} finally {
			s = null, c && !l && (c = !1, u());
		}
	}, f = new ResizeObserver((e) => {
		for (let t of e) {
			let e = t.contentRect;
			a = e.width, o = e.height;
		}
		u();
	});
	f.observe(t);
	let p = () => {
		typeof document < "u" && !document.hidden && u();
	};
	return r && typeof document < "u" && document.addEventListener("visibilitychange", p), () => {
		l = !0, f.disconnect(), i !== null && (cancelAnimationFrame(i), i = null), r && typeof document < "u" && document.removeEventListener("visibilitychange", p);
	};
}
var _r = {
	accentbordercallout1: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 112500"],
			["adj4", "val -38333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"x1",
					"y1"
				], [
					"l",
					"x2",
					"y2"
				]]
			}
		]
	},
	accentbordercallout2: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 112500"],
			["adj6", "val -46667"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"y1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x3",
						"y3"
					]
				]
			}
		]
	},
	accentbordercallout3: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 100000"],
			["adj6", "val -16667"],
			["adj7", "val 112963"],
			["adj8", "val -8333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"],
			["y4", "*/ h adj7 100000"],
			["x4", "*/ w adj8 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"y1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x3",
						"y3"
					],
					[
						"l",
						"x4",
						"y4"
					]
				]
			}
		]
	},
	accentcallout1: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 112500"],
			["adj4", "val -38333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"x1",
					"y1"
				], [
					"l",
					"x2",
					"y2"
				]]
			}
		]
	},
	accentcallout2: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 112500"],
			["adj6", "val -46667"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"y1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x3",
						"y3"
					]
				]
			}
		]
	},
	accentcallout3: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 100000"],
			["adj6", "val -16667"],
			["adj7", "val 112963"],
			["adj8", "val -8333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"],
			["y4", "*/ h adj7 100000"],
			["x4", "*/ w adj8 100000"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					["c"],
					[
						"l",
						"x1",
						"b"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"y1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x3",
						"y3"
					],
					[
						"l",
						"x4",
						"y4"
					]
				]
			}
		]
	},
	actionbuttonbackprevious: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g11",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonbeginning: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1 8"],
			["g15", "*/ g13 1 4"],
			["g16", "+- g11 g14 0"],
			["g17", "+- g11 g15 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g17",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"],
					[
						"m",
						"g16",
						"g9"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					[
						"l",
						"g16",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g17",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"],
					[
						"m",
						"g16",
						"g9"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					[
						"l",
						"g16",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g17",
						"vc"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					["c"],
					[
						"m",
						"g16",
						"g9"
					],
					[
						"l",
						"g16",
						"g10"
					],
					[
						"l",
						"g11",
						"g10"
					],
					[
						"l",
						"g11",
						"g9"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonblank: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	actionbuttondocument: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["dx1", "*/ ss 9 32"],
			["g11", "+- hc 0 dx1"],
			["g12", "+- hc dx1 0"],
			["g13", "*/ ss 3 16"],
			["g14", "+- g12 0 g13"],
			["g15", "+- g9 g13 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g11",
						"g9"
					],
					[
						"l",
						"g14",
						"g9"
					],
					[
						"l",
						"g12",
						"g15"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g9"
					],
					[
						"l",
						"g14",
						"g9"
					],
					[
						"l",
						"g14",
						"g15"
					],
					[
						"l",
						"g12",
						"g15"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g14",
						"g9"
					],
					[
						"l",
						"g14",
						"g15"
					],
					[
						"l",
						"g12",
						"g15"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g9"
					],
					[
						"l",
						"g14",
						"g9"
					],
					[
						"l",
						"g12",
						"g15"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"],
					[
						"m",
						"g12",
						"g15"
					],
					[
						"l",
						"g14",
						"g15"
					],
					[
						"l",
						"g14",
						"g9"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonend: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 3 4"],
			["g15", "*/ g13 7 8"],
			["g16", "+- g11 g14 0"],
			["g17", "+- g11 g15 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g16",
						"vc"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"],
					[
						"m",
						"g17",
						"g9"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g17",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g16",
						"vc"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"],
					[
						"m",
						"g17",
						"g9"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g17",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g16",
						"vc"
					],
					[
						"l",
						"g11",
						"g10"
					],
					[
						"l",
						"g11",
						"g9"
					],
					["c"],
					[
						"m",
						"g17",
						"g9"
					],
					[
						"l",
						"g12",
						"g9"
					],
					[
						"l",
						"g12",
						"g10"
					],
					[
						"l",
						"g17",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonforwardnext: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g12",
						"vc"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g12",
						"vc"
					],
					[
						"l",
						"g11",
						"g9"
					],
					[
						"l",
						"g11",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g12",
						"vc"
					],
					[
						"l",
						"g11",
						"g10"
					],
					[
						"l",
						"g11",
						"g9"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonhelp: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g11", "+- hc 0 dx2"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1 7"],
			["g15", "*/ g13 3 14"],
			["g16", "*/ g13 2 7"],
			["g19", "*/ g13 3 7"],
			["g20", "*/ g13 4 7"],
			["g21", "*/ g13 17 28"],
			["g23", "*/ g13 21 28"],
			["g24", "*/ g13 11 14"],
			["g27", "+- g9 g16 0"],
			["g29", "+- g9 g21 0"],
			["g30", "+- g9 g23 0"],
			["g31", "+- g9 g24 0"],
			["g33", "+- g11 g15 0"],
			["g36", "+- g11 g19 0"],
			["g37", "+- g11 g20 0"],
			["g41", "*/ g13 1 14"],
			["g42", "*/ g13 3 28"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g33",
						"g27"
					],
					[
						"a",
						"g16",
						"g16",
						"cd2",
						"cd2"
					],
					[
						"a",
						"g14",
						"g15",
						"0",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"3cd4",
						"-5400000"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g36",
						"g30"
					],
					[
						"l",
						"g36",
						"g29"
					],
					[
						"a",
						"g14",
						"g15",
						"cd2",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"cd4",
						"-5400000"
					],
					[
						"a",
						"g14",
						"g14",
						"0",
						"-10800000"
					],
					["c"],
					[
						"m",
						"hc",
						"g31"
					],
					[
						"a",
						"g42",
						"g42",
						"3cd4",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g33",
						"g27"
					],
					[
						"a",
						"g16",
						"g16",
						"cd2",
						"cd2"
					],
					[
						"a",
						"g14",
						"g15",
						"0",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"3cd4",
						"-5400000"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g36",
						"g30"
					],
					[
						"l",
						"g36",
						"g29"
					],
					[
						"a",
						"g14",
						"g15",
						"cd2",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"cd4",
						"-5400000"
					],
					[
						"a",
						"g14",
						"g14",
						"0",
						"-10800000"
					],
					["c"],
					[
						"m",
						"hc",
						"g31"
					],
					[
						"a",
						"g42",
						"g42",
						"3cd4",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g33",
						"g27"
					],
					[
						"a",
						"g16",
						"g16",
						"cd2",
						"cd2"
					],
					[
						"a",
						"g14",
						"g15",
						"0",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"3cd4",
						"-5400000"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g36",
						"g30"
					],
					[
						"l",
						"g36",
						"g29"
					],
					[
						"a",
						"g14",
						"g15",
						"cd2",
						"cd4"
					],
					[
						"a",
						"g41",
						"g42",
						"cd4",
						"-5400000"
					],
					[
						"a",
						"g14",
						"g14",
						"0",
						"-10800000"
					],
					["c"],
					[
						"m",
						"hc",
						"g31"
					],
					[
						"a",
						"g42",
						"g42",
						"3cd4",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonhome: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1 16"],
			["g15", "*/ g13 1 8"],
			["g16", "*/ g13 3 16"],
			["g17", "*/ g13 5 16"],
			["g18", "*/ g13 7 16"],
			["g19", "*/ g13 9 16"],
			["g20", "*/ g13 11 16"],
			["g21", "*/ g13 3 4"],
			["g22", "*/ g13 13 16"],
			["g23", "*/ g13 7 8"],
			["g24", "+- g9 g14 0"],
			["g25", "+- g9 g16 0"],
			["g26", "+- g9 g17 0"],
			["g27", "+- g9 g21 0"],
			["g28", "+- g11 g15 0"],
			["g29", "+- g11 g18 0"],
			["g30", "+- g11 g19 0"],
			["g31", "+- g11 g20 0"],
			["g32", "+- g11 g22 0"],
			["g33", "+- g11 g23 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"hc",
						"g9"
					],
					[
						"l",
						"g11",
						"vc"
					],
					[
						"l",
						"g28",
						"vc"
					],
					[
						"l",
						"g28",
						"g10"
					],
					[
						"l",
						"g33",
						"g10"
					],
					[
						"l",
						"g33",
						"vc"
					],
					[
						"l",
						"g12",
						"vc"
					],
					[
						"l",
						"g32",
						"g26"
					],
					[
						"l",
						"g32",
						"g24"
					],
					[
						"l",
						"g31",
						"g24"
					],
					[
						"l",
						"g31",
						"g25"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g32",
						"g26"
					],
					[
						"l",
						"g32",
						"g24"
					],
					[
						"l",
						"g31",
						"g24"
					],
					[
						"l",
						"g31",
						"g25"
					],
					["c"],
					[
						"m",
						"g28",
						"vc"
					],
					[
						"l",
						"g28",
						"g10"
					],
					[
						"l",
						"g29",
						"g10"
					],
					[
						"l",
						"g29",
						"g27"
					],
					[
						"l",
						"g30",
						"g27"
					],
					[
						"l",
						"g30",
						"g10"
					],
					[
						"l",
						"g33",
						"g10"
					],
					[
						"l",
						"g33",
						"vc"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"g9"
					],
					[
						"l",
						"g11",
						"vc"
					],
					[
						"l",
						"g12",
						"vc"
					],
					["c"],
					[
						"m",
						"g29",
						"g27"
					],
					[
						"l",
						"g30",
						"g27"
					],
					[
						"l",
						"g30",
						"g10"
					],
					[
						"l",
						"g29",
						"g10"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"g9"
					],
					[
						"l",
						"g31",
						"g25"
					],
					[
						"l",
						"g31",
						"g24"
					],
					[
						"l",
						"g32",
						"g24"
					],
					[
						"l",
						"g32",
						"g26"
					],
					[
						"l",
						"g12",
						"vc"
					],
					[
						"l",
						"g33",
						"vc"
					],
					[
						"l",
						"g33",
						"g10"
					],
					[
						"l",
						"g28",
						"g10"
					],
					[
						"l",
						"g28",
						"vc"
					],
					[
						"l",
						"g11",
						"vc"
					],
					["c"],
					[
						"m",
						"g31",
						"g25"
					],
					[
						"l",
						"g32",
						"g26"
					],
					[
						"m",
						"g33",
						"vc"
					],
					[
						"l",
						"g28",
						"vc"
					],
					[
						"m",
						"g29",
						"g10"
					],
					[
						"l",
						"g29",
						"g27"
					],
					[
						"l",
						"g30",
						"g27"
					],
					[
						"l",
						"g30",
						"g10"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttoninformation: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g11", "+- hc 0 dx2"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1 32"],
			["g17", "*/ g13 5 16"],
			["g18", "*/ g13 3 8"],
			["g19", "*/ g13 13 32"],
			["g20", "*/ g13 19 32"],
			["g22", "*/ g13 11 16"],
			["g23", "*/ g13 13 16"],
			["g24", "*/ g13 7 8"],
			["g25", "+- g9 g14 0"],
			["g28", "+- g9 g17 0"],
			["g29", "+- g9 g18 0"],
			["g30", "+- g9 g23 0"],
			["g31", "+- g9 g24 0"],
			["g32", "+- g11 g17 0"],
			["g34", "+- g11 g19 0"],
			["g35", "+- g11 g20 0"],
			["g37", "+- g11 g22 0"],
			["g38", "*/ g13 3 32"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"hc",
						"g9"
					],
					[
						"a",
						"dx2",
						"dx2",
						"3cd4",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"g9"
					],
					[
						"a",
						"dx2",
						"dx2",
						"3cd4",
						"21600000"
					],
					["c"],
					[
						"m",
						"hc",
						"g25"
					],
					[
						"a",
						"g38",
						"g38",
						"3cd4",
						"21600000"
					],
					[
						"m",
						"g32",
						"g28"
					],
					[
						"l",
						"g32",
						"g29"
					],
					[
						"l",
						"g34",
						"g29"
					],
					[
						"l",
						"g34",
						"g30"
					],
					[
						"l",
						"g32",
						"g30"
					],
					[
						"l",
						"g32",
						"g31"
					],
					[
						"l",
						"g37",
						"g31"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g35",
						"g30"
					],
					[
						"l",
						"g35",
						"g28"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "lighten",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"g25"
					],
					[
						"a",
						"g38",
						"g38",
						"3cd4",
						"21600000"
					],
					[
						"m",
						"g32",
						"g28"
					],
					[
						"l",
						"g35",
						"g28"
					],
					[
						"l",
						"g35",
						"g30"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g37",
						"g31"
					],
					[
						"l",
						"g32",
						"g31"
					],
					[
						"l",
						"g32",
						"g30"
					],
					[
						"l",
						"g34",
						"g30"
					],
					[
						"l",
						"g34",
						"g29"
					],
					[
						"l",
						"g32",
						"g29"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"g9"
					],
					[
						"a",
						"dx2",
						"dx2",
						"3cd4",
						"21600000"
					],
					["c"],
					[
						"m",
						"hc",
						"g25"
					],
					[
						"a",
						"g38",
						"g38",
						"3cd4",
						"21600000"
					],
					[
						"m",
						"g32",
						"g28"
					],
					[
						"l",
						"g35",
						"g28"
					],
					[
						"l",
						"g35",
						"g30"
					],
					[
						"l",
						"g37",
						"g30"
					],
					[
						"l",
						"g37",
						"g31"
					],
					[
						"l",
						"g32",
						"g31"
					],
					[
						"l",
						"g32",
						"g30"
					],
					[
						"l",
						"g34",
						"g30"
					],
					[
						"l",
						"g34",
						"g29"
					],
					[
						"l",
						"g32",
						"g29"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonmovie: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1455 21600"],
			["g15", "*/ g13 1905 21600"],
			["g16", "*/ g13 2325 21600"],
			["g17", "*/ g13 16155 21600"],
			["g18", "*/ g13 17010 21600"],
			["g19", "*/ g13 19335 21600"],
			["g20", "*/ g13 19725 21600"],
			["g21", "*/ g13 20595 21600"],
			["g22", "*/ g13 5280 21600"],
			["g23", "*/ g13 5730 21600"],
			["g24", "*/ g13 6630 21600"],
			["g25", "*/ g13 7492 21600"],
			["g26", "*/ g13 9067 21600"],
			["g27", "*/ g13 9555 21600"],
			["g28", "*/ g13 13342 21600"],
			["g29", "*/ g13 14580 21600"],
			["g30", "*/ g13 15592 21600"],
			["g31", "+- g11 g14 0"],
			["g32", "+- g11 g15 0"],
			["g33", "+- g11 g16 0"],
			["g34", "+- g11 g17 0"],
			["g35", "+- g11 g18 0"],
			["g36", "+- g11 g19 0"],
			["g37", "+- g11 g20 0"],
			["g38", "+- g11 g21 0"],
			["g39", "+- g9 g22 0"],
			["g40", "+- g9 g23 0"],
			["g41", "+- g9 g24 0"],
			["g42", "+- g9 g25 0"],
			["g43", "+- g9 g26 0"],
			["g44", "+- g9 g27 0"],
			["g45", "+- g9 g28 0"],
			["g46", "+- g9 g29 0"],
			["g47", "+- g9 g30 0"],
			["g48", "+- g9 g31 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g11",
						"g39"
					],
					[
						"l",
						"g11",
						"g44"
					],
					[
						"l",
						"g31",
						"g44"
					],
					[
						"l",
						"g32",
						"g43"
					],
					[
						"l",
						"g33",
						"g43"
					],
					[
						"l",
						"g33",
						"g47"
					],
					[
						"l",
						"g35",
						"g47"
					],
					[
						"l",
						"g35",
						"g45"
					],
					[
						"l",
						"g36",
						"g45"
					],
					[
						"l",
						"g38",
						"g46"
					],
					[
						"l",
						"g12",
						"g46"
					],
					[
						"l",
						"g12",
						"g41"
					],
					[
						"l",
						"g38",
						"g41"
					],
					[
						"l",
						"g37",
						"g42"
					],
					[
						"l",
						"g35",
						"g42"
					],
					[
						"l",
						"g35",
						"g41"
					],
					[
						"l",
						"g34",
						"g40"
					],
					[
						"l",
						"g32",
						"g40"
					],
					[
						"l",
						"g31",
						"g39"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g39"
					],
					[
						"l",
						"g11",
						"g44"
					],
					[
						"l",
						"g31",
						"g44"
					],
					[
						"l",
						"g32",
						"g43"
					],
					[
						"l",
						"g33",
						"g43"
					],
					[
						"l",
						"g33",
						"g47"
					],
					[
						"l",
						"g35",
						"g47"
					],
					[
						"l",
						"g35",
						"g45"
					],
					[
						"l",
						"g36",
						"g45"
					],
					[
						"l",
						"g38",
						"g46"
					],
					[
						"l",
						"g12",
						"g46"
					],
					[
						"l",
						"g12",
						"g41"
					],
					[
						"l",
						"g38",
						"g41"
					],
					[
						"l",
						"g37",
						"g42"
					],
					[
						"l",
						"g35",
						"g42"
					],
					[
						"l",
						"g35",
						"g41"
					],
					[
						"l",
						"g34",
						"g40"
					],
					[
						"l",
						"g32",
						"g40"
					],
					[
						"l",
						"g31",
						"g39"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g39"
					],
					[
						"l",
						"g31",
						"g39"
					],
					[
						"l",
						"g32",
						"g40"
					],
					[
						"l",
						"g34",
						"g40"
					],
					[
						"l",
						"g35",
						"g41"
					],
					[
						"l",
						"g35",
						"g42"
					],
					[
						"l",
						"g37",
						"g42"
					],
					[
						"l",
						"g38",
						"g41"
					],
					[
						"l",
						"g12",
						"g41"
					],
					[
						"l",
						"g12",
						"g46"
					],
					[
						"l",
						"g38",
						"g46"
					],
					[
						"l",
						"g36",
						"g45"
					],
					[
						"l",
						"g35",
						"g45"
					],
					[
						"l",
						"g35",
						"g47"
					],
					[
						"l",
						"g33",
						"g47"
					],
					[
						"l",
						"g33",
						"g43"
					],
					[
						"l",
						"g32",
						"g43"
					],
					[
						"l",
						"g31",
						"g44"
					],
					[
						"l",
						"g11",
						"g44"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonreturn: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 7 8"],
			["g15", "*/ g13 3 4"],
			["g16", "*/ g13 5 8"],
			["g17", "*/ g13 3 8"],
			["g18", "*/ g13 1 4"],
			["g19", "+- g9 g15 0"],
			["g20", "+- g9 g16 0"],
			["g21", "+- g9 g18 0"],
			["g22", "+- g11 g14 0"],
			["g23", "+- g11 g15 0"],
			["g24", "+- g11 g16 0"],
			["g25", "+- g11 g17 0"],
			["g26", "+- g11 g18 0"],
			["g27", "*/ g13 1 8"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g12",
						"g21"
					],
					[
						"l",
						"g23",
						"g9"
					],
					[
						"l",
						"hc",
						"g21"
					],
					[
						"l",
						"g24",
						"g21"
					],
					[
						"l",
						"g24",
						"g20"
					],
					[
						"a",
						"g27",
						"g27",
						"0",
						"cd4"
					],
					[
						"l",
						"g25",
						"g19"
					],
					[
						"a",
						"g27",
						"g27",
						"cd4",
						"cd4"
					],
					[
						"l",
						"g26",
						"g21"
					],
					[
						"l",
						"g11",
						"g21"
					],
					[
						"l",
						"g11",
						"g20"
					],
					[
						"a",
						"g17",
						"g17",
						"cd2",
						"-5400000"
					],
					[
						"l",
						"hc",
						"g10"
					],
					[
						"a",
						"g17",
						"g17",
						"cd4",
						"-5400000"
					],
					[
						"l",
						"g22",
						"g21"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g12",
						"g21"
					],
					[
						"l",
						"g23",
						"g9"
					],
					[
						"l",
						"hc",
						"g21"
					],
					[
						"l",
						"g24",
						"g21"
					],
					[
						"l",
						"g24",
						"g20"
					],
					[
						"a",
						"g27",
						"g27",
						"0",
						"cd4"
					],
					[
						"l",
						"g25",
						"g19"
					],
					[
						"a",
						"g27",
						"g27",
						"cd4",
						"cd4"
					],
					[
						"l",
						"g26",
						"g21"
					],
					[
						"l",
						"g11",
						"g21"
					],
					[
						"l",
						"g11",
						"g20"
					],
					[
						"a",
						"g17",
						"g17",
						"cd2",
						"-5400000"
					],
					[
						"l",
						"hc",
						"g10"
					],
					[
						"a",
						"g17",
						"g17",
						"cd4",
						"-5400000"
					],
					[
						"l",
						"g22",
						"g21"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g12",
						"g21"
					],
					[
						"l",
						"g22",
						"g21"
					],
					[
						"l",
						"g22",
						"g20"
					],
					[
						"a",
						"g17",
						"g17",
						"0",
						"cd4"
					],
					[
						"l",
						"g25",
						"g10"
					],
					[
						"a",
						"g17",
						"g17",
						"cd4",
						"cd4"
					],
					[
						"l",
						"g11",
						"g21"
					],
					[
						"l",
						"g26",
						"g21"
					],
					[
						"l",
						"g26",
						"g20"
					],
					[
						"a",
						"g27",
						"g27",
						"cd2",
						"-5400000"
					],
					[
						"l",
						"hc",
						"g19"
					],
					[
						"a",
						"g27",
						"g27",
						"cd4",
						"-5400000"
					],
					[
						"l",
						"g24",
						"g21"
					],
					[
						"l",
						"hc",
						"g21"
					],
					[
						"l",
						"g23",
						"g9"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	actionbuttonsound: {
		adj: [],
		gd: [
			["dx2", "*/ ss 3 8"],
			["g9", "+- vc 0 dx2"],
			["g10", "+- vc dx2 0"],
			["g11", "+- hc 0 dx2"],
			["g12", "+- hc dx2 0"],
			["g13", "*/ ss 3 4"],
			["g14", "*/ g13 1 8"],
			["g15", "*/ g13 5 16"],
			["g16", "*/ g13 5 8"],
			["g17", "*/ g13 11 16"],
			["g18", "*/ g13 3 4"],
			["g19", "*/ g13 7 8"],
			["g20", "+- g9 g14 0"],
			["g21", "+- g9 g15 0"],
			["g22", "+- g9 g17 0"],
			["g23", "+- g9 g19 0"],
			["g24", "+- g11 g15 0"],
			["g25", "+- g11 g16 0"],
			["g26", "+- g11 g18 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"g11",
						"g21"
					],
					[
						"l",
						"g11",
						"g22"
					],
					[
						"l",
						"g24",
						"g22"
					],
					[
						"l",
						"g25",
						"g10"
					],
					[
						"l",
						"g25",
						"g9"
					],
					[
						"l",
						"g24",
						"g21"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g21"
					],
					[
						"l",
						"g11",
						"g22"
					],
					[
						"l",
						"g24",
						"g22"
					],
					[
						"l",
						"g25",
						"g10"
					],
					[
						"l",
						"g25",
						"g9"
					],
					[
						"l",
						"g24",
						"g21"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"g11",
						"g21"
					],
					[
						"l",
						"g24",
						"g21"
					],
					[
						"l",
						"g25",
						"g9"
					],
					[
						"l",
						"g25",
						"g10"
					],
					[
						"l",
						"g24",
						"g22"
					],
					[
						"l",
						"g11",
						"g22"
					],
					["c"],
					[
						"m",
						"g26",
						"g21"
					],
					[
						"l",
						"g12",
						"g20"
					],
					[
						"m",
						"g26",
						"vc"
					],
					[
						"l",
						"g12",
						"vc"
					],
					[
						"m",
						"g26",
						"g22"
					],
					[
						"l",
						"g12",
						"g23"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			}
		]
	},
	arc: {
		adj: [["adj1", "val 16200000"], ["adj2", "val 0"]],
		gd: [
			["stAng", "pin 0 adj1 21599999"],
			["enAng", "pin 0 adj2 21599999"],
			["sw11", "+- enAng 0 stAng"],
			["sw12", "+- sw11 21600000 0"],
			["swAng", "?: sw11 sw11 sw12"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["wt2", "sin wd2 enAng"],
			["ht2", "cos hd2 enAng"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["sw0", "+- 21600000 0 stAng"],
			["da1", "+- swAng 0 sw0"],
			["g1", "max x1 x2"],
			["ir", "?: da1 r g1"],
			["sw1", "+- cd4 0 stAng"],
			["sw2", "+- 27000000 0 stAng"],
			["sw3", "?: sw1 sw1 sw2"],
			["da2", "+- swAng 0 sw3"],
			["g5", "max y1 y2"],
			["ib", "?: da2 b g5"],
			["sw4", "+- cd2 0 stAng"],
			["sw5", "+- 32400000 0 stAng"],
			["sw6", "?: sw4 sw4 sw5"],
			["da3", "+- swAng 0 sw6"],
			["g9", "min x1 x2"],
			["il", "?: da3 l g9"],
			["sw7", "+- 3cd4 0 stAng"],
			["sw8", "+- 37800000 0 stAng"],
			["sw9", "?: sw7 sw7 sw8"],
			["da4", "+- swAng 0 sw9"],
			["g13", "min y1 y2"],
			["it", "?: da4 t g13"],
			["cang1", "+- stAng 0 cd4"],
			["cang2", "+- enAng cd4 0"],
			["cang3", "+/ cang1 cang2 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd2",
					"stAng",
					"swAng"
				],
				[
					"l",
					"hc",
					"vc"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"stAng",
				"swAng"
			]]
		}]
	},
	bentarrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 43750"]
		],
		gd: [
			["a2", "pin 0 adj2 50000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["a3", "pin 0 adj3 50000"],
			["th", "*/ ss a1 100000"],
			["aw2", "*/ ss a2 100000"],
			["th2", "*/ th 1 2"],
			["dh2", "+- aw2 0 th2"],
			["ah", "*/ ss a3 100000"],
			["bw", "+- r 0 ah"],
			["bh", "+- b 0 dh2"],
			["bs", "min bw bh"],
			["maxAdj4", "*/ 100000 bs ss"],
			["a4", "pin 0 adj4 maxAdj4"],
			["bd", "*/ ss a4 100000"],
			["bd3", "+- bd 0 th"],
			["bd2", "max bd3 0"],
			["x3", "+- th bd2 0"],
			["x4", "+- r 0 ah"],
			["y3", "+- dh2 th 0"],
			["y4", "+- y3 dh2 0"],
			["y5", "+- dh2 bd 0"],
			["y6", "+- y3 bd2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"l",
					"y5"
				],
				[
					"a",
					"bd",
					"bd",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x4",
					"dh2"
				],
				[
					"l",
					"x4",
					"t"
				],
				[
					"l",
					"r",
					"aw2"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"a",
					"bd2",
					"bd2",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"th",
					"b"
				],
				["c"]
			]
		}]
	},
	bentconnector2: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	bentconnector3: {
		adj: [["adj1", "val 50000"]],
		gd: [["x1", "*/ w adj1 100000"]],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	bentconnector4: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["x1", "*/ w adj1 100000"],
			["x2", "+/ x1 r 2"],
			["y2", "*/ h adj2 100000"],
			["y1", "+/ t y2 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	bentconnector5: {
		adj: [
			["adj1", "val 50000"],
			["adj2", "val 50000"],
			["adj3", "val 50000"]
		],
		gd: [
			["x1", "*/ w adj1 100000"],
			["x3", "*/ w adj3 100000"],
			["x2", "+/ x1 x3 2"],
			["y2", "*/ h adj2 100000"],
			["y1", "+/ t y2 2"],
			["y3", "+/ b y2 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x3",
					"b"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	bentuparrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"]
		],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["a3", "pin 0 adj3 50000"],
			["y1", "*/ ss a3 100000"],
			["dx1", "*/ ss a2 50000"],
			["x1", "+- r 0 dx1"],
			["dx3", "*/ ss a2 100000"],
			["x3", "+- r 0 dx3"],
			["dx2", "*/ ss a1 200000"],
			["x2", "+- x3 0 dx2"],
			["x4", "+- x3 dx2 0"],
			["dy2", "*/ ss a1 100000"],
			["y2", "+- b 0 dy2"],
			["x0", "*/ x4 1 2"],
			["y3", "+/ y2 b 2"],
			["y15", "+/ y1 b 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"x4",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	bevel: {
		adj: [["adj", "val 12500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"x1"
					],
					[
						"l",
						"x2",
						"x1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x1",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "lightenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"x2",
						"x1"
					],
					[
						"l",
						"x1",
						"x1"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"b"
					],
					[
						"l",
						"x1",
						"y2"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"r",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "lighten",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"x1",
						"x1"
					],
					[
						"l",
						"x1",
						"y2"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darken",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x2",
						"x1"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"x1",
						"x1"
					],
					[
						"l",
						"x2",
						"x1"
					],
					[
						"l",
						"x2",
						"y2"
					],
					[
						"l",
						"x1",
						"y2"
					],
					["c"],
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"x1",
						"x1"
					],
					[
						"m",
						"l",
						"b"
					],
					[
						"l",
						"x1",
						"y2"
					],
					[
						"m",
						"r",
						"t"
					],
					[
						"l",
						"x2",
						"x1"
					],
					[
						"m",
						"r",
						"b"
					],
					[
						"l",
						"x2",
						"y2"
					]
				]
			}
		]
	},
	blockarc: {
		adj: [
			["adj1", "val 10800000"],
			["adj2", "val 0"],
			["adj3", "val 25000"]
		],
		gd: [
			["stAng", "pin 0 adj1 21599999"],
			["istAng", "pin 0 adj2 21599999"],
			["a3", "pin 0 adj3 50000"],
			["sw11", "+- istAng 0 stAng"],
			["sw12", "+- sw11 21600000 0"],
			["swAng", "?: sw11 sw11 sw12"],
			["iswAng", "+- 0 0 swAng"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["wt3", "sin wd2 istAng"],
			["ht3", "cos hd2 istAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["dx3", "cat2 wd2 ht3 wt3"],
			["dy3", "sat2 hd2 ht3 wt3"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["x3", "+- hc dx3 0"],
			["y3", "+- vc dy3 0"],
			["dr", "*/ ss a3 100000"],
			["iwd2", "+- wd2 0 dr"],
			["ihd2", "+- hd2 0 dr"],
			["wt2", "sin iwd2 istAng"],
			["ht2", "cos ihd2 istAng"],
			["wt4", "sin iwd2 stAng"],
			["ht4", "cos ihd2 stAng"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["dx4", "cat2 iwd2 ht4 wt4"],
			["dy4", "sat2 ihd2 ht4 wt4"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["x4", "+- hc dx4 0"],
			["y4", "+- vc dy4 0"],
			["sw0", "+- 21600000 0 stAng"],
			["da1", "+- swAng 0 sw0"],
			["g1", "max x1 x2"],
			["g2", "max x3 x4"],
			["g3", "max g1 g2"],
			["ir", "?: da1 r g3"],
			["sw1", "+- cd4 0 stAng"],
			["sw2", "+- 27000000 0 stAng"],
			["sw3", "?: sw1 sw1 sw2"],
			["da2", "+- swAng 0 sw3"],
			["g5", "max y1 y2"],
			["g6", "max y3 y4"],
			["g7", "max g5 g6"],
			["ib", "?: da2 b g7"],
			["sw4", "+- cd2 0 stAng"],
			["sw5", "+- 32400000 0 stAng"],
			["sw6", "?: sw4 sw4 sw5"],
			["da3", "+- swAng 0 sw6"],
			["g9", "min x1 x2"],
			["g10", "min x3 x4"],
			["g11", "min g9 g10"],
			["il", "?: da3 l g11"],
			["sw7", "+- 3cd4 0 stAng"],
			["sw8", "+- 37800000 0 stAng"],
			["sw9", "?: sw7 sw7 sw8"],
			["da4", "+- swAng 0 sw9"],
			["g13", "min y1 y2"],
			["g14", "min y3 y4"],
			["g15", "min g13 g14"],
			["it", "?: da4 t g15"],
			["x5", "+/ x1 x4 2"],
			["y5", "+/ y1 y4 2"],
			["x6", "+/ x3 x2 2"],
			["y6", "+/ y3 y2 2"],
			["cang1", "+- stAng 0 cd4"],
			["cang2", "+- istAng cd4 0"],
			["cang3", "+/ cang1 cang2 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd2",
					"stAng",
					"swAng"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"istAng",
					"iswAng"
				],
				["c"]
			]
		}]
	},
	bordercallout1: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 112500"],
			["adj4", "val -38333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"l",
				"x2",
				"y2"
			]]
		}]
	},
	bordercallout2: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 112500"],
			["adj6", "val -46667"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x3",
					"y3"
				]
			]
		}]
	},
	bordercallout3: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 100000"],
			["adj6", "val -16667"],
			["adj7", "val 112963"],
			["adj8", "val -8333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"],
			["y4", "*/ h adj7 100000"],
			["x4", "*/ w adj8 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x4",
					"y4"
				]
			]
		}]
	},
	bracepair: {
		adj: [["adj", "val 8333"]],
		gd: [
			["a", "pin 0 adj 25000"],
			["x1", "*/ ss a 100000"],
			["x2", "*/ ss a 50000"],
			["x3", "+- r 0 x2"],
			["x4", "+- r 0 x1"],
			["y2", "+- vc 0 x1"],
			["y3", "+- vc x1 0"],
			["y4", "+- b 0 x1"],
			["it", "*/ x1 29289 100000"],
			["il", "+- x1 it 0"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 it"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x2",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"-5400000"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"-5400000"
				],
				[
					"l",
					"x1",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"-5400000"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x2",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"-5400000"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"-5400000"
				],
				[
					"l",
					"x1",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				[
					"m",
					"x3",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"-5400000"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				]
			]
		}]
	},
	bracketpair: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"],
			["il", "*/ x1 29289 100000"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				[
					"m",
					"x2",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				]
			]
		}]
	},
	callout1: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 112500"],
			["adj4", "val -38333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"l",
				"x2",
				"y2"
			]]
		}]
	},
	callout2: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 112500"],
			["adj6", "val -46667"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x3",
					"y3"
				]
			]
		}]
	},
	callout3: {
		adj: [
			["adj1", "val 18750"],
			["adj2", "val -8333"],
			["adj3", "val 18750"],
			["adj4", "val -16667"],
			["adj5", "val 100000"],
			["adj6", "val -16667"],
			["adj7", "val 112963"],
			["adj8", "val -8333"]
		],
		gd: [
			["y1", "*/ h adj1 100000"],
			["x1", "*/ w adj2 100000"],
			["y2", "*/ h adj3 100000"],
			["x2", "*/ w adj4 100000"],
			["y3", "*/ h adj5 100000"],
			["x3", "*/ w adj6 100000"],
			["y4", "*/ h adj7 100000"],
			["x4", "*/ w adj8 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x4",
					"y4"
				]
			]
		}]
	},
	can: {
		adj: [["adj", "val 25000"]],
		gd: [
			["maxAdj", "*/ 50000 h ss"],
			["a", "pin 0 adj maxAdj"],
			["y1", "*/ ss a 200000"],
			["y2", "+- y1 y1 0"],
			["y3", "+- b 0 y1"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"a",
						"wd2",
						"y1",
						"cd2",
						"-10800000"
					],
					[
						"l",
						"r",
						"y3"
					],
					[
						"a",
						"wd2",
						"y1",
						"0",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "lighten",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"a",
						"wd2",
						"y1",
						"cd2",
						"cd2"
					],
					[
						"a",
						"wd2",
						"y1",
						"0",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"y1"
					],
					[
						"a",
						"wd2",
						"y1",
						"0",
						"cd2"
					],
					[
						"a",
						"wd2",
						"y1",
						"cd2",
						"cd2"
					],
					[
						"l",
						"r",
						"y3"
					],
					[
						"a",
						"wd2",
						"y1",
						"0",
						"cd2"
					],
					[
						"l",
						"l",
						"y1"
					]
				]
			}
		]
	},
	chartplus: {
		adj: [],
		gd: [],
		paths: [{
			w: 10,
			h: 10,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"5",
					"0"
				],
				[
					"l",
					"5",
					"10"
				],
				[
					"m",
					"0",
					"5"
				],
				[
					"l",
					"10",
					"5"
				]
			]
		}, {
			w: 10,
			h: 10,
			fill: null,
			stroke: !1,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"0",
					"10"
				],
				[
					"l",
					"10",
					"10"
				],
				[
					"l",
					"10",
					"0"
				],
				["c"]
			]
		}]
	},
	chartstar: {
		adj: [],
		gd: [],
		paths: [{
			w: 10,
			h: 10,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"10",
					"10"
				],
				[
					"m",
					"0",
					"10"
				],
				[
					"l",
					"10",
					"0"
				],
				[
					"m",
					"5",
					"0"
				],
				[
					"l",
					"5",
					"10"
				]
			]
		}, {
			w: 10,
			h: 10,
			fill: null,
			stroke: !1,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"0",
					"10"
				],
				[
					"l",
					"10",
					"10"
				],
				[
					"l",
					"10",
					"0"
				],
				["c"]
			]
		}]
	},
	chartx: {
		adj: [],
		gd: [],
		paths: [{
			w: 10,
			h: 10,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"10",
					"10"
				],
				[
					"m",
					"0",
					"10"
				],
				[
					"l",
					"10",
					"0"
				]
			]
		}, {
			w: 10,
			h: 10,
			fill: null,
			stroke: !1,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"0",
					"10"
				],
				[
					"l",
					"10",
					"10"
				],
				[
					"l",
					"10",
					"0"
				],
				["c"]
			]
		}]
	},
	chevron: {
		adj: [["adj", "val 50000"]],
		gd: [
			["maxAdj", "*/ 100000 w ss"],
			["a", "pin 0 adj maxAdj"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["x3", "*/ x2 1 2"],
			["dx", "+- x2 0 x1"],
			["il", "?: dx x1 l"],
			["ir", "?: dx x2 r"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				[
					"l",
					"x1",
					"vc"
				],
				["c"]
			]
		}]
	},
	chord: {
		adj: [["adj1", "val 2700000"], ["adj2", "val 16200000"]],
		gd: [
			["stAng", "pin 0 adj1 21599999"],
			["enAng", "pin 0 adj2 21599999"],
			["sw1", "+- enAng 0 stAng"],
			["sw2", "+- sw1 21600000 0"],
			["swAng", "?: sw1 sw1 sw2"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["wt2", "sin wd2 enAng"],
			["ht2", "cos hd2 enAng"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["x3", "+/ x1 x2 2"],
			["y3", "+/ y1 y2 2"],
			["midAng0", "*/ swAng 1 2"],
			["midAng", "+- stAng midAng0 cd2"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd2",
					"stAng",
					"swAng"
				],
				["c"]
			]
		}]
	},
	circulararrow: {
		adj: [
			["adj1", "val 12500"],
			["adj2", "val 1142319"],
			["adj3", "val 20457681"],
			["adj4", "val 10800000"],
			["adj5", "val 12500"]
		],
		gd: [
			["a5", "pin 0 adj5 25000"],
			["maxAdj1", "*/ a5 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["enAng", "pin 1 adj3 21599999"],
			["stAng", "pin 0 adj4 21599999"],
			["th", "*/ ss a1 100000"],
			["thh", "*/ ss a5 100000"],
			["th2", "*/ th 1 2"],
			["rw1", "+- wd2 th2 thh"],
			["rh1", "+- hd2 th2 thh"],
			["rw2", "+- rw1 0 th"],
			["rh2", "+- rh1 0 th"],
			["rw3", "+- rw2 th2 0"],
			["rh3", "+- rh2 th2 0"],
			["wtH", "sin rw3 enAng"],
			["htH", "cos rh3 enAng"],
			["dxH", "cat2 rw3 htH wtH"],
			["dyH", "sat2 rh3 htH wtH"],
			["xH", "+- hc dxH 0"],
			["yH", "+- vc dyH 0"],
			["rI", "min rw2 rh2"],
			["u1", "*/ dxH dxH 1"],
			["u2", "*/ dyH dyH 1"],
			["u3", "*/ rI rI 1"],
			["u4", "+- u1 0 u3"],
			["u5", "+- u2 0 u3"],
			["u6", "*/ u4 u5 u1"],
			["u7", "*/ u6 1 u2"],
			["u8", "+- 1 0 u7"],
			["u9", "sqrt u8"],
			["u10", "*/ u4 1 dxH"],
			["u11", "*/ u10 1 dyH"],
			["u12", "+/ 1 u9 u11"],
			["u13", "at2 1 u12"],
			["u14", "+- u13 21600000 0"],
			["u15", "?: u13 u13 u14"],
			["u16", "+- u15 0 enAng"],
			["u17", "+- u16 21600000 0"],
			["u18", "?: u16 u16 u17"],
			["u19", "+- u18 0 cd2"],
			["u20", "+- u18 0 21600000"],
			["u21", "?: u19 u20 u18"],
			["maxAng", "abs u21"],
			["aAng", "pin 0 adj2 maxAng"],
			["ptAng", "+- enAng aAng 0"],
			["wtA", "sin rw3 ptAng"],
			["htA", "cos rh3 ptAng"],
			["dxA", "cat2 rw3 htA wtA"],
			["dyA", "sat2 rh3 htA wtA"],
			["xA", "+- hc dxA 0"],
			["yA", "+- vc dyA 0"],
			["wtE", "sin rw1 stAng"],
			["htE", "cos rh1 stAng"],
			["dxE", "cat2 rw1 htE wtE"],
			["dyE", "sat2 rh1 htE wtE"],
			["xE", "+- hc dxE 0"],
			["yE", "+- vc dyE 0"],
			["dxG", "cos thh ptAng"],
			["dyG", "sin thh ptAng"],
			["xG", "+- xH dxG 0"],
			["yG", "+- yH dyG 0"],
			["dxB", "cos thh ptAng"],
			["dyB", "sin thh ptAng"],
			["xB", "+- xH 0 dxB 0"],
			["yB", "+- yH 0 dyB 0"],
			["sx1", "+- xB 0 hc"],
			["sy1", "+- yB 0 vc"],
			["sx2", "+- xG 0 hc"],
			["sy2", "+- yG 0 vc"],
			["rO", "min rw1 rh1"],
			["x1O", "*/ sx1 rO rw1"],
			["y1O", "*/ sy1 rO rh1"],
			["x2O", "*/ sx2 rO rw1"],
			["y2O", "*/ sy2 rO rh1"],
			["dxO", "+- x2O 0 x1O"],
			["dyO", "+- y2O 0 y1O"],
			["dO", "mod dxO dyO 0"],
			["q1", "*/ x1O y2O 1"],
			["q2", "*/ x2O y1O 1"],
			["DO", "+- q1 0 q2"],
			["q3", "*/ rO rO 1"],
			["q4", "*/ dO dO 1"],
			["q5", "*/ q3 q4 1"],
			["q6", "*/ DO DO 1"],
			["q7", "+- q5 0 q6"],
			["q8", "max q7 0"],
			["sdelO", "sqrt q8"],
			["ndyO", "*/ dyO -1 1"],
			["sdyO", "?: ndyO -1 1"],
			["q9", "*/ sdyO dxO 1"],
			["q10", "*/ q9 sdelO 1"],
			["q11", "*/ DO dyO 1"],
			["dxF1", "+/ q11 q10 q4"],
			["q12", "+- q11 0 q10"],
			["dxF2", "*/ q12 1 q4"],
			["adyO", "abs dyO"],
			["q13", "*/ adyO sdelO 1"],
			["q14", "*/ DO dxO -1"],
			["dyF1", "+/ q14 q13 q4"],
			["q15", "+- q14 0 q13"],
			["dyF2", "*/ q15 1 q4"],
			["q16", "+- x2O 0 dxF1"],
			["q17", "+- x2O 0 dxF2"],
			["q18", "+- y2O 0 dyF1"],
			["q19", "+- y2O 0 dyF2"],
			["q20", "mod q16 q18 0"],
			["q21", "mod q17 q19 0"],
			["q22", "+- q21 0 q20"],
			["dxF", "?: q22 dxF1 dxF2"],
			["dyF", "?: q22 dyF1 dyF2"],
			["sdxF", "*/ dxF rw1 rO"],
			["sdyF", "*/ dyF rh1 rO"],
			["xF", "+- hc sdxF 0"],
			["yF", "+- vc sdyF 0"],
			["x1I", "*/ sx1 rI rw2"],
			["y1I", "*/ sy1 rI rh2"],
			["x2I", "*/ sx2 rI rw2"],
			["y2I", "*/ sy2 rI rh2"],
			["dxI", "+- x2I 0 x1I"],
			["dyI", "+- y2I 0 y1I"],
			["dI", "mod dxI dyI 0"],
			["v1", "*/ x1I y2I 1"],
			["v2", "*/ x2I y1I 1"],
			["DI", "+- v1 0 v2"],
			["v3", "*/ rI rI 1"],
			["v4", "*/ dI dI 1"],
			["v5", "*/ v3 v4 1"],
			["v6", "*/ DI DI 1"],
			["v7", "+- v5 0 v6"],
			["v8", "max v7 0"],
			["sdelI", "sqrt v8"],
			["v9", "*/ sdyO dxI 1"],
			["v10", "*/ v9 sdelI 1"],
			["v11", "*/ DI dyI 1"],
			["dxC1", "+/ v11 v10 v4"],
			["v12", "+- v11 0 v10"],
			["dxC2", "*/ v12 1 v4"],
			["adyI", "abs dyI"],
			["v13", "*/ adyI sdelI 1"],
			["v14", "*/ DI dxI -1"],
			["dyC1", "+/ v14 v13 v4"],
			["v15", "+- v14 0 v13"],
			["dyC2", "*/ v15 1 v4"],
			["v16", "+- x1I 0 dxC1"],
			["v17", "+- x1I 0 dxC2"],
			["v18", "+- y1I 0 dyC1"],
			["v19", "+- y1I 0 dyC2"],
			["v20", "mod v16 v18 0"],
			["v21", "mod v17 v19 0"],
			["v22", "+- v21 0 v20"],
			["dxC", "?: v22 dxC1 dxC2"],
			["dyC", "?: v22 dyC1 dyC2"],
			["sdxC", "*/ dxC rw2 rI"],
			["sdyC", "*/ dyC rh2 rI"],
			["xC", "+- hc sdxC 0"],
			["yC", "+- vc sdyC 0"],
			["ist0", "at2 sdxC sdyC"],
			["ist1", "+- ist0 21600000 0"],
			["istAng", "?: ist0 ist0 ist1"],
			["isw1", "+- stAng 0 istAng"],
			["isw2", "+- isw1 0 21600000"],
			["iswAng", "?: isw1 isw2 isw1"],
			["p1", "+- xF 0 xC"],
			["p2", "+- yF 0 yC"],
			["p3", "mod p1 p2 0"],
			["p4", "*/ p3 1 2"],
			["p5", "+- p4 0 thh"],
			["xGp", "?: p5 xF xG"],
			["yGp", "?: p5 yF yG"],
			["xBp", "?: p5 xC xB"],
			["yBp", "?: p5 yC yB"],
			["en0", "at2 sdxF sdyF"],
			["en1", "+- en0 21600000 0"],
			["en2", "?: en0 en0 en1"],
			["sw0", "+- en2 0 stAng"],
			["sw1", "+- sw0 21600000 0"],
			["swAng", "?: sw0 sw0 sw1"],
			["wtI", "sin rw3 stAng"],
			["htI", "cos rh3 stAng"],
			["dxI", "cat2 rw3 htI wtI"],
			["dyI", "sat2 rh3 htI wtI"],
			["xI", "+- hc dxI 0"],
			["yI", "+- vc dyI 0"],
			["aI", "+- stAng 0 cd4"],
			["aA", "+- ptAng cd4 0"],
			["aB", "+- ptAng cd2 0"],
			["idx", "cos rw1 2700000"],
			["idy", "sin rh1 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xE",
					"yE"
				],
				[
					"a",
					"rw1",
					"rh1",
					"stAng",
					"swAng"
				],
				[
					"l",
					"xGp",
					"yGp"
				],
				[
					"l",
					"xA",
					"yA"
				],
				[
					"l",
					"xBp",
					"yBp"
				],
				[
					"l",
					"xC",
					"yC"
				],
				[
					"a",
					"rw2",
					"rh2",
					"istAng",
					"iswAng"
				],
				["c"]
			]
		}]
	},
	cloud: {
		adj: [],
		gd: [
			["il", "*/ w 2977 21600"],
			["it", "*/ h 3262 21600"],
			["ir", "*/ w 17087 21600"],
			["ib", "*/ h 17337 21600"],
			["g27", "*/ w 67 21600"],
			["g28", "*/ h 21577 21600"],
			["g29", "*/ w 21582 21600"],
			["g30", "*/ h 1235 21600"]
		],
		paths: [{
			w: 43200,
			h: 43200,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"3900",
					"14370"
				],
				[
					"a",
					"6753",
					"9190",
					"-11429249",
					"7426832"
				],
				[
					"a",
					"5333",
					"7267",
					"-8646143",
					"5396714"
				],
				[
					"a",
					"4365",
					"5945",
					"-8748475",
					"5983381"
				],
				[
					"a",
					"4857",
					"6595",
					"-7859164",
					"7034504"
				],
				[
					"a",
					"5333",
					"7273",
					"-4722533",
					"6541615"
				],
				[
					"a",
					"6775",
					"9220",
					"-2776035",
					"7816140"
				],
				[
					"a",
					"5785",
					"7867",
					"37501",
					"6842000"
				],
				[
					"a",
					"6752",
					"9215",
					"1347096",
					"6910353"
				],
				[
					"a",
					"7720",
					"10543",
					"3974558",
					"4542661"
				],
				[
					"a",
					"4360",
					"5918",
					"-16496525",
					"8804134"
				],
				[
					"a",
					"4345",
					"5945",
					"-14809710",
					"9151131"
				],
				["c"]
			]
		}, {
			w: 43200,
			h: 43200,
			fill: "none",
			stroke: !0,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"4693",
					"26177"
				],
				[
					"a",
					"4345",
					"5945",
					"5204520",
					"1585770"
				],
				[
					"m",
					"6928",
					"34899"
				],
				[
					"a",
					"4360",
					"5918",
					"4416628",
					"686848"
				],
				[
					"m",
					"16478",
					"39090"
				],
				[
					"a",
					"6752",
					"9215",
					"8257449",
					"844866"
				],
				[
					"m",
					"28827",
					"34751"
				],
				[
					"a",
					"6752",
					"9215",
					"387196",
					"959901"
				],
				[
					"m",
					"34129",
					"22954"
				],
				[
					"a",
					"5785",
					"7867",
					"-4217541",
					"4255042"
				],
				[
					"m",
					"41798",
					"15354"
				],
				[
					"a",
					"5333",
					"7273",
					"1819082",
					"1665090"
				],
				[
					"m",
					"38324",
					"5426"
				],
				[
					"a",
					"4857",
					"6595",
					"-824660",
					"891534"
				],
				[
					"m",
					"29078",
					"3952"
				],
				[
					"a",
					"4857",
					"6595",
					"-8950887",
					"1091722"
				],
				[
					"m",
					"22141",
					"4720"
				],
				[
					"a",
					"4365",
					"5945",
					"-9809656",
					"1061181"
				],
				[
					"m",
					"14000",
					"5192"
				],
				[
					"a",
					"6753",
					"9190",
					"-4002417",
					"739161"
				],
				[
					"m",
					"4127",
					"15789"
				],
				[
					"a",
					"6753",
					"9190",
					"9459261",
					"711490"
				]
			]
		}]
	},
	cloudcallout: {
		adj: [["adj1", "val -20833"], ["adj2", "val 62500"]],
		gd: [
			["dxPos", "*/ w adj1 100000"],
			["dyPos", "*/ h adj2 100000"],
			["xPos", "+- hc dxPos 0"],
			["yPos", "+- vc dyPos 0"],
			["ht", "cat2 hd2 dxPos dyPos"],
			["wt", "sat2 wd2 dxPos dyPos"],
			["g2", "cat2 wd2 ht wt"],
			["g3", "sat2 hd2 ht wt"],
			["g4", "+- hc g2 0"],
			["g5", "+- vc g3 0"],
			["g6", "+- g4 0 xPos"],
			["g7", "+- g5 0 yPos"],
			["g8", "mod g6 g7 0"],
			["g9", "*/ ss 6600 21600"],
			["g10", "+- g8 0 g9"],
			["g11", "*/ g10 1 3"],
			["g12", "*/ ss 1800 21600"],
			["g13", "+- g11 g12 0"],
			["g14", "*/ g13 g6 g8"],
			["g15", "*/ g13 g7 g8"],
			["g16", "+- g14 xPos 0"],
			["g17", "+- g15 yPos 0"],
			["g18", "*/ ss 4800 21600"],
			["g19", "*/ g11 2 1"],
			["g20", "+- g18 g19 0"],
			["g21", "*/ g20 g6 g8"],
			["g22", "*/ g20 g7 g8"],
			["g23", "+- g21 xPos 0"],
			["g24", "+- g22 yPos 0"],
			["g25", "*/ ss 1200 21600"],
			["g26", "*/ ss 600 21600"],
			["x23", "+- xPos g26 0"],
			["x24", "+- g16 g25 0"],
			["x25", "+- g23 g12 0"],
			["il", "*/ w 2977 21600"],
			["it", "*/ h 3262 21600"],
			["ir", "*/ w 17087 21600"],
			["ib", "*/ h 17337 21600"],
			["g27", "*/ w 67 21600"],
			["g28", "*/ h 21577 21600"],
			["g29", "*/ w 21582 21600"],
			["g30", "*/ h 1235 21600"],
			["pang", "at2 dxPos dyPos"]
		],
		paths: [
			{
				w: 43200,
				h: 43200,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"3900",
						"14370"
					],
					[
						"a",
						"6753",
						"9190",
						"-11429249",
						"7426832"
					],
					[
						"a",
						"5333",
						"7267",
						"-8646143",
						"5396714"
					],
					[
						"a",
						"4365",
						"5945",
						"-8748475",
						"5983381"
					],
					[
						"a",
						"4857",
						"6595",
						"-7859164",
						"7034504"
					],
					[
						"a",
						"5333",
						"7273",
						"-4722533",
						"6541615"
					],
					[
						"a",
						"6775",
						"9220",
						"-2776035",
						"7816140"
					],
					[
						"a",
						"5785",
						"7867",
						"37501",
						"6842000"
					],
					[
						"a",
						"6752",
						"9215",
						"1347096",
						"6910353"
					],
					[
						"a",
						"7720",
						"10543",
						"3974558",
						"4542661"
					],
					[
						"a",
						"4360",
						"5918",
						"-16496525",
						"8804134"
					],
					[
						"a",
						"4345",
						"5945",
						"-14809710",
						"9151131"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x23",
						"yPos"
					],
					[
						"a",
						"g26",
						"g26",
						"0",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x24",
						"g17"
					],
					[
						"a",
						"g25",
						"g25",
						"0",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x25",
						"g24"
					],
					[
						"a",
						"g12",
						"g12",
						"0",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: 43200,
				h: 43200,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"4693",
						"26177"
					],
					[
						"a",
						"4345",
						"5945",
						"5204520",
						"1585770"
					],
					[
						"m",
						"6928",
						"34899"
					],
					[
						"a",
						"4360",
						"5918",
						"4416628",
						"686848"
					],
					[
						"m",
						"16478",
						"39090"
					],
					[
						"a",
						"6752",
						"9215",
						"8257449",
						"844866"
					],
					[
						"m",
						"28827",
						"34751"
					],
					[
						"a",
						"6752",
						"9215",
						"387196",
						"959901"
					],
					[
						"m",
						"34129",
						"22954"
					],
					[
						"a",
						"5785",
						"7867",
						"-4217541",
						"4255042"
					],
					[
						"m",
						"41798",
						"15354"
					],
					[
						"a",
						"5333",
						"7273",
						"1819082",
						"1665090"
					],
					[
						"m",
						"38324",
						"5426"
					],
					[
						"a",
						"4857",
						"6595",
						"-824660",
						"891534"
					],
					[
						"m",
						"29078",
						"3952"
					],
					[
						"a",
						"4857",
						"6595",
						"-8950887",
						"1091722"
					],
					[
						"m",
						"22141",
						"4720"
					],
					[
						"a",
						"4365",
						"5945",
						"-9809656",
						"1061181"
					],
					[
						"m",
						"14000",
						"5192"
					],
					[
						"a",
						"6753",
						"9190",
						"-4002417",
						"739161"
					],
					[
						"m",
						"4127",
						"15789"
					],
					[
						"a",
						"6753",
						"9190",
						"9459261",
						"711490"
					]
				]
			}
		]
	},
	corner: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj1", "*/ 100000 h ss"],
			["maxAdj2", "*/ 100000 w ss"],
			["a1", "pin 0 adj1 maxAdj1"],
			["a2", "pin 0 adj2 maxAdj2"],
			["x1", "*/ ss a2 100000"],
			["dy1", "*/ ss a1 100000"],
			["y1", "+- b 0 dy1"],
			["cx1", "*/ x1 1 2"],
			["cy1", "+/ y1 b 2"],
			["d", "+- w 0 h"],
			["it", "?: d y1 t"],
			["ir", "?: d r x1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	cornertabs: {
		adj: [],
		gd: [
			["md", "mod w h 0"],
			["dx", "*/ 1 md 20"],
			["y1", "+- 0 b dx"],
			["x1", "+- 0 r dx"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"dx",
						"t"
					],
					[
						"l",
						"l",
						"dx"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"dx",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"dx"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"r",
						"y1"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"x1",
						"b"
					],
					["c"]
				]
			}
		]
	},
	cube: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 0 adj 100000"],
			["y1", "*/ ss a 100000"],
			["y4", "+- b 0 y1"],
			["y2", "*/ y4 1 2"],
			["y3", "+/ y1 b 2"],
			["x4", "+- r 0 y1"],
			["x2", "*/ x4 1 2"],
			["x3", "+/ y1 r 2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x4",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x4",
						"y1"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x4",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "lightenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"y1",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"x4",
						"y1"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"y1",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x4",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"m",
						"x4",
						"y1"
					],
					[
						"l",
						"x4",
						"b"
					]
				]
			}
		]
	},
	curvedconnector2: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"C",
				"wd2",
				"t",
				"r",
				"hd2",
				"r",
				"b"
			]]
		}]
	},
	curvedconnector3: {
		adj: [["adj1", "val 50000"]],
		gd: [
			["x2", "*/ w adj1 100000"],
			["x1", "+/ l x2 2"],
			["x3", "+/ r x2 2"],
			["y3", "*/ h 3 4"]
		],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"C",
					"x1",
					"t",
					"x2",
					"hd4",
					"x2",
					"vc"
				],
				[
					"C",
					"x2",
					"y3",
					"x3",
					"b",
					"r",
					"b"
				]
			]
		}]
	},
	curvedconnector4: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["x2", "*/ w adj1 100000"],
			["x1", "+/ l x2 2"],
			["x3", "+/ r x2 2"],
			["x4", "+/ x2 x3 2"],
			["x5", "+/ x3 r 2"],
			["y4", "*/ h adj2 100000"],
			["y1", "+/ t y4 2"],
			["y2", "+/ t y1 2"],
			["y3", "+/ y1 y4 2"],
			["y5", "+/ b y4 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"C",
					"x1",
					"t",
					"x2",
					"y2",
					"x2",
					"y1"
				],
				[
					"C",
					"x2",
					"y3",
					"x4",
					"y4",
					"x3",
					"y4"
				],
				[
					"C",
					"x5",
					"y4",
					"r",
					"y5",
					"r",
					"b"
				]
			]
		}]
	},
	curvedconnector5: {
		adj: [
			["adj1", "val 50000"],
			["adj2", "val 50000"],
			["adj3", "val 50000"]
		],
		gd: [
			["x3", "*/ w adj1 100000"],
			["x6", "*/ w adj3 100000"],
			["x1", "+/ x3 x6 2"],
			["x2", "+/ l x3 2"],
			["x4", "+/ x3 x1 2"],
			["x5", "+/ x6 x1 2"],
			["x7", "+/ x6 r 2"],
			["y4", "*/ h adj2 100000"],
			["y1", "+/ t y4 2"],
			["y2", "+/ t y1 2"],
			["y3", "+/ y1 y4 2"],
			["y5", "+/ b y4 2"],
			["y6", "+/ y5 y4 2"],
			["y7", "+/ y5 b 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"C",
					"x2",
					"t",
					"x3",
					"y2",
					"x3",
					"y1"
				],
				[
					"C",
					"x3",
					"y3",
					"x4",
					"y4",
					"x1",
					"y4"
				],
				[
					"C",
					"x5",
					"y4",
					"x6",
					"y6",
					"x6",
					"y5"
				],
				[
					"C",
					"x6",
					"y7",
					"x7",
					"b",
					"r",
					"b"
				]
			]
		}]
	},
	curveddownarrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 25000"]
		],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["a1", "pin 0 adj1 100000"],
			["th", "*/ ss a1 100000"],
			["aw", "*/ ss a2 100000"],
			["q1", "+/ th aw 4"],
			["wR", "+- wd2 0 q1"],
			["q7", "*/ wR 2 1"],
			["q8", "*/ q7 q7 1"],
			["q9", "*/ th th 1"],
			["q10", "+- q8 0 q9"],
			["q11", "sqrt q10"],
			["idy", "*/ q11 h q7"],
			["maxAdj3", "*/ 100000 idy ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["ah", "*/ ss adj3 100000"],
			["x3", "+- wR th 0"],
			["q2", "*/ h h 1"],
			["q3", "*/ ah ah 1"],
			["q4", "+- q2 0 q3"],
			["q5", "sqrt q4"],
			["dx", "*/ q5 wR h"],
			["x5", "+- wR dx 0"],
			["x7", "+- x3 dx 0"],
			["q6", "+- aw 0 th"],
			["dh", "*/ q6 1 2"],
			["x4", "+- x5 0 dh"],
			["x8", "+- x7 dh 0"],
			["aw2", "*/ aw 1 2"],
			["x6", "+- r 0 aw2"],
			["y1", "+- b 0 ah"],
			["swAng", "at2 ah dx"],
			["mswAng", "+- 0 0 swAng"],
			["iy", "+- b 0 idy"],
			["ix", "+/ wR x3 2"],
			["q12", "*/ th 1 2"],
			["dang2", "at2 idy q12"],
			["stAng", "+- 3cd4 swAng 0"],
			["stAng2", "+- 3cd4 0 dang2"],
			["swAng2", "+- dang2 0 cd4"],
			["swAng3", "+- cd4 dang2 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x6",
						"b"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x5",
						"y1"
					],
					[
						"a",
						"wR",
						"h",
						"stAng",
						"mswAng"
					],
					[
						"l",
						"x3",
						"t"
					],
					[
						"a",
						"wR",
						"h",
						"3cd4",
						"swAng"
					],
					[
						"l",
						"x8",
						"y1"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ix",
						"iy"
					],
					[
						"a",
						"wR",
						"h",
						"stAng2",
						"swAng2"
					],
					[
						"l",
						"l",
						"b"
					],
					[
						"a",
						"wR",
						"h",
						"cd2",
						"swAng3"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ix",
						"iy"
					],
					[
						"a",
						"wR",
						"h",
						"stAng2",
						"swAng2"
					],
					[
						"l",
						"l",
						"b"
					],
					[
						"a",
						"wR",
						"h",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x3",
						"t"
					],
					[
						"a",
						"wR",
						"h",
						"3cd4",
						"swAng"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"l",
						"x6",
						"b"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x5",
						"y1"
					],
					[
						"a",
						"wR",
						"h",
						"stAng",
						"mswAng"
					]
				]
			}
		]
	},
	curvedleftarrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 25000"]
		],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["a1", "pin 0 adj1 a2"],
			["th", "*/ ss a1 100000"],
			["aw", "*/ ss a2 100000"],
			["q1", "+/ th aw 4"],
			["hR", "+- hd2 0 q1"],
			["q7", "*/ hR 2 1"],
			["q8", "*/ q7 q7 1"],
			["q9", "*/ th th 1"],
			["q10", "+- q8 0 q9"],
			["q11", "sqrt q10"],
			["idx", "*/ q11 w q7"],
			["maxAdj3", "*/ 100000 idx ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["ah", "*/ ss a3 100000"],
			["y3", "+- hR th 0"],
			["q2", "*/ w w 1"],
			["q3", "*/ ah ah 1"],
			["q4", "+- q2 0 q3"],
			["q5", "sqrt q4"],
			["dy", "*/ q5 hR w"],
			["y5", "+- hR dy 0"],
			["y7", "+- y3 dy 0"],
			["q6", "+- aw 0 th"],
			["dh", "*/ q6 1 2"],
			["y4", "+- y5 0 dh"],
			["y8", "+- y7 dh 0"],
			["aw2", "*/ aw 1 2"],
			["y6", "+- b 0 aw2"],
			["x1", "+- l ah 0"],
			["swAng", "at2 ah dy"],
			["mswAng", "+- 0 0 swAng"],
			["ix", "+- l idx 0"],
			["iy", "+/ hR y3 2"],
			["q12", "*/ th 1 2"],
			["dang2", "at2 idx q12"],
			["swAng2", "+- dang2 0 swAng"],
			["swAng3", "+- swAng dang2 0"],
			["stAng3", "+- 0 0 dang2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y6"
					],
					[
						"l",
						"x1",
						"y4"
					],
					[
						"l",
						"x1",
						"y5"
					],
					[
						"a",
						"w",
						"hR",
						"swAng",
						"swAng2"
					],
					[
						"a",
						"w",
						"hR",
						"stAng3",
						"swAng3"
					],
					[
						"l",
						"x1",
						"y8"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"y3"
					],
					[
						"a",
						"w",
						"hR",
						"0",
						"-5400000"
					],
					[
						"l",
						"l",
						"t"
					],
					[
						"a",
						"w",
						"hR",
						"3cd4",
						"cd4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"y3"
					],
					[
						"a",
						"w",
						"hR",
						"0",
						"-5400000"
					],
					[
						"l",
						"l",
						"t"
					],
					[
						"a",
						"w",
						"hR",
						"3cd4",
						"cd4"
					],
					[
						"l",
						"r",
						"y3"
					],
					[
						"a",
						"w",
						"hR",
						"0",
						"swAng"
					],
					[
						"l",
						"x1",
						"y8"
					],
					[
						"l",
						"l",
						"y6"
					],
					[
						"l",
						"x1",
						"y4"
					],
					[
						"l",
						"x1",
						"y5"
					],
					[
						"a",
						"w",
						"hR",
						"swAng",
						"swAng2"
					]
				]
			}
		]
	},
	curvedrightarrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 25000"]
		],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["a1", "pin 0 adj1 a2"],
			["th", "*/ ss a1 100000"],
			["aw", "*/ ss a2 100000"],
			["q1", "+/ th aw 4"],
			["hR", "+- hd2 0 q1"],
			["q7", "*/ hR 2 1"],
			["q8", "*/ q7 q7 1"],
			["q9", "*/ th th 1"],
			["q10", "+- q8 0 q9"],
			["q11", "sqrt q10"],
			["idx", "*/ q11 w q7"],
			["maxAdj3", "*/ 100000 idx ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["ah", "*/ ss a3 100000"],
			["y3", "+- hR th 0"],
			["q2", "*/ w w 1"],
			["q3", "*/ ah ah 1"],
			["q4", "+- q2 0 q3"],
			["q5", "sqrt q4"],
			["dy", "*/ q5 hR w"],
			["y5", "+- hR dy 0"],
			["y7", "+- y3 dy 0"],
			["q6", "+- aw 0 th"],
			["dh", "*/ q6 1 2"],
			["y4", "+- y5 0 dh"],
			["y8", "+- y7 dh 0"],
			["aw2", "*/ aw 1 2"],
			["y6", "+- b 0 aw2"],
			["x1", "+- r 0 ah"],
			["swAng", "at2 ah dy"],
			["stAng", "+- cd2 0 swAng"],
			["mswAng", "+- 0 0 swAng"],
			["ix", "+- r 0 idx"],
			["iy", "+/ hR y3 2"],
			["q12", "*/ th 1 2"],
			["dang2", "at2 idx q12"],
			["swAng2", "+- dang2 0 cd4"],
			["swAng3", "+- cd4 dang2 0"],
			["stAng3", "+- cd2 0 dang2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"hR"
					],
					[
						"a",
						"w",
						"hR",
						"cd2",
						"mswAng"
					],
					[
						"l",
						"x1",
						"y4"
					],
					[
						"l",
						"r",
						"y6"
					],
					[
						"l",
						"x1",
						"y8"
					],
					[
						"l",
						"x1",
						"y7"
					],
					[
						"a",
						"w",
						"hR",
						"stAng",
						"swAng"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"th"
					],
					[
						"a",
						"w",
						"hR",
						"3cd4",
						"swAng2"
					],
					[
						"a",
						"w",
						"hR",
						"stAng3",
						"swAng3"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"hR"
					],
					[
						"a",
						"w",
						"hR",
						"cd2",
						"mswAng"
					],
					[
						"l",
						"x1",
						"y4"
					],
					[
						"l",
						"r",
						"y6"
					],
					[
						"l",
						"x1",
						"y8"
					],
					[
						"l",
						"x1",
						"y7"
					],
					[
						"a",
						"w",
						"hR",
						"stAng",
						"swAng"
					],
					[
						"l",
						"l",
						"hR"
					],
					[
						"a",
						"w",
						"hR",
						"cd2",
						"cd4"
					],
					[
						"l",
						"r",
						"th"
					],
					[
						"a",
						"w",
						"hR",
						"3cd4",
						"swAng2"
					]
				]
			}
		]
	},
	curveduparrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 25000"]
		],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["a1", "pin 0 adj1 100000"],
			["th", "*/ ss a1 100000"],
			["aw", "*/ ss a2 100000"],
			["q1", "+/ th aw 4"],
			["wR", "+- wd2 0 q1"],
			["q7", "*/ wR 2 1"],
			["q8", "*/ q7 q7 1"],
			["q9", "*/ th th 1"],
			["q10", "+- q8 0 q9"],
			["q11", "sqrt q10"],
			["idy", "*/ q11 h q7"],
			["maxAdj3", "*/ 100000 idy ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["ah", "*/ ss adj3 100000"],
			["x3", "+- wR th 0"],
			["q2", "*/ h h 1"],
			["q3", "*/ ah ah 1"],
			["q4", "+- q2 0 q3"],
			["q5", "sqrt q4"],
			["dx", "*/ q5 wR h"],
			["x5", "+- wR dx 0"],
			["x7", "+- x3 dx 0"],
			["q6", "+- aw 0 th"],
			["dh", "*/ q6 1 2"],
			["x4", "+- x5 0 dh"],
			["x8", "+- x7 dh 0"],
			["aw2", "*/ aw 1 2"],
			["x6", "+- r 0 aw2"],
			["y1", "+- t ah 0"],
			["swAng", "at2 ah dx"],
			["mswAng", "+- 0 0 swAng"],
			["iy", "+- t idy 0"],
			["ix", "+/ wR x3 2"],
			["q12", "*/ th 1 2"],
			["dang2", "at2 idy q12"],
			["swAng2", "+- dang2 0 swAng"],
			["mswAng2", "+- 0 0 swAng2"],
			["stAng3", "+- cd4 0 swAng"],
			["swAng3", "+- swAng dang2 0"],
			["stAng2", "+- cd4 0 dang2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x6",
						"t"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"l",
						"x7",
						"y1"
					],
					[
						"a",
						"wR",
						"h",
						"stAng3",
						"swAng3"
					],
					[
						"a",
						"wR",
						"h",
						"stAng2",
						"swAng2"
					],
					[
						"l",
						"x4",
						"y1"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"wR",
						"b"
					],
					[
						"a",
						"wR",
						"h",
						"cd4",
						"cd4"
					],
					[
						"l",
						"th",
						"t"
					],
					[
						"a",
						"wR",
						"h",
						"cd2",
						"-5400000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ix",
						"iy"
					],
					[
						"a",
						"wR",
						"h",
						"stAng2",
						"swAng2"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x6",
						"t"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"l",
						"x7",
						"y1"
					],
					[
						"a",
						"wR",
						"h",
						"stAng3",
						"swAng"
					],
					[
						"l",
						"wR",
						"b"
					],
					[
						"a",
						"wR",
						"h",
						"cd4",
						"cd4"
					],
					[
						"l",
						"th",
						"t"
					],
					[
						"a",
						"wR",
						"h",
						"cd2",
						"-5400000"
					]
				]
			}
		]
	},
	decagon: {
		adj: [["vf", "val 105146"]],
		gd: [
			["shd2", "*/ hd2 vf 100000"],
			["dx1", "cos wd2 2160000"],
			["dx2", "cos wd2 4320000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["dy1", "sin shd2 4320000"],
			["dy2", "sin shd2 2160000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y4", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"x1",
					"y3"
				],
				["c"]
			]
		}]
	},
	diagstripe: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 0 adj 100000"],
			["x2", "*/ w a 100000"],
			["x1", "*/ x2 1 2"],
			["x3", "+/ x2 r 2"],
			["y2", "*/ h a 100000"],
			["y1", "*/ y2 1 2"],
			["y3", "+/ y2 b 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	diamond: {
		adj: [],
		gd: [["ir", "*/ w 3 4"], ["ib", "*/ h 3 4"]],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"hc",
					"b"
				],
				["c"]
			]
		}]
	},
	dodecagon: {
		adj: [],
		gd: [
			["x1", "*/ w 2894 21600"],
			["x2", "*/ w 7906 21600"],
			["x3", "*/ w 13694 21600"],
			["x4", "*/ w 18706 21600"],
			["y1", "*/ h 2894 21600"],
			["y2", "*/ h 7906 21600"],
			["y3", "*/ h 13694 21600"],
			["y4", "*/ h 18706 21600"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"y3"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"x3",
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"l",
					"y3"
				],
				["c"]
			]
		}]
	},
	donut: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dr", "*/ ss a 100000"],
			["iwd2", "+- wd2 0 dr"],
			["ihd2", "+- hd2 0 dr"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				["c"],
				[
					"m",
					"dr",
					"vc"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"cd2",
					"-5400000"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"cd4",
					"-5400000"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"0",
					"-5400000"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"3cd4",
					"-5400000"
				],
				["c"]
			]
		}]
	},
	doublewave: {
		adj: [["adj1", "val 6250"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 12500"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["dx1", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs dx1"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx8", "?: of2 of2 0"],
			["x8", "+- r 0 dx8"],
			["dx3", "+/ dx2 x8 6"],
			["x3", "+- x2 dx3 0"],
			["dx4", "+/ dx2 x8 3"],
			["x4", "+- x2 dx4 0"],
			["x5", "+/ x2 x8 2"],
			["x6", "+- x5 dx3 0"],
			["x7", "+/ x6 x8 2"],
			["x9", "+- l dx8 0"],
			["x15", "+- r dx2 0"],
			["x10", "+- x9 dx3 0"],
			["x11", "+- x9 dx4 0"],
			["x12", "+/ x9 x15 2"],
			["x13", "+- x12 dx3 0"],
			["x14", "+/ x13 x15 2"],
			["x16", "+- r 0 x1"],
			["xAdj", "+- hc dx1 0"],
			["il", "max x2 x9"],
			["ir", "min x8 x15"],
			["it", "*/ h a1 50000"],
			["ib", "+- b 0 it"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x2",
					"y1"
				],
				[
					"C",
					"x3",
					"y2",
					"x4",
					"y3",
					"x5",
					"y1"
				],
				[
					"C",
					"x6",
					"y2",
					"x7",
					"y3",
					"x8",
					"y1"
				],
				[
					"l",
					"x15",
					"y4"
				],
				[
					"C",
					"x14",
					"y6",
					"x13",
					"y5",
					"x12",
					"y4"
				],
				[
					"C",
					"x11",
					"y6",
					"x10",
					"y5",
					"x9",
					"y4"
				],
				["c"]
			]
		}]
	},
	downarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 100000 h ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dy1", "*/ ss a2 100000"],
			["y1", "+- b 0 dy1"],
			["dx1", "*/ w a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["dy2", "*/ x1 dy1 wd2"],
			["y2", "+- y1 dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"hc",
					"b"
				],
				["c"]
			]
		}]
	},
	downarrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 64977"]
		],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 100000 h ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss h"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dx1", "*/ ss a2 100000"],
			["dx2", "*/ ss a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["dy3", "*/ ss a3 100000"],
			["y3", "+- b 0 dy3"],
			["y2", "*/ h a4 100000"],
			["y1", "*/ y2 1 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"l",
					"y2"
				],
				["c"]
			]
		}]
	},
	ellipse: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}]
	},
	ellipseribbon: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 12500"]
		],
		gd: [
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 25000 adj2 75000"],
			["q10", "+- 100000 0 a1"],
			["q11", "*/ q10 1 2"],
			["q12", "+- a1 0 q11"],
			["minAdj3", "max 0 q12"],
			["a3", "pin minAdj3 adj3 a1"],
			["dx2", "*/ w a2 200000"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- x2 wd8 0"],
			["x4", "+- r 0 x3"],
			["x5", "+- r 0 x2"],
			["x6", "+- r 0 wd8"],
			["dy1", "*/ h a3 100000"],
			["f1", "*/ 4 dy1 w"],
			["q1", "*/ x3 x3 w"],
			["q2", "+- x3 0 q1"],
			["y1", "*/ f1 q2 1"],
			["cx1", "*/ x3 1 2"],
			["cy1", "*/ f1 cx1 1"],
			["cx2", "+- r 0 cx1"],
			["q1", "*/ h a1 100000"],
			["dy3", "+- q1 0 dy1"],
			["q3", "*/ x2 x2 w"],
			["q4", "+- x2 0 q3"],
			["q5", "*/ f1 q4 1"],
			["y3", "+- q5 dy3 0"],
			["q6", "+- dy1 dy3 y3"],
			["q7", "+- q6 dy1 0"],
			["cy3", "+- q7 dy3 0"],
			["rh", "+- b 0 q1"],
			["q8", "*/ dy1 14 16"],
			["y2", "+/ q8 rh 2"],
			["y5", "+- q5 rh 0"],
			["y6", "+- y3 rh 0"],
			["cx4", "*/ x2 1 2"],
			["q9", "*/ f1 cx4 1"],
			["cy4", "+- q9 rh 0"],
			["cx5", "+- r 0 cx4"],
			["cy6", "+- cy3 rh 0"],
			["y7", "+- y1 dy3 0"],
			["cy7", "+- q1 q1 y7"],
			["y8", "+- b 0 dy1"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"Q",
						"cx1",
						"cy1",
						"x3",
						"y1"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x5",
						"y3"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"Q",
						"cx2",
						"cy1",
						"r",
						"t"
					],
					[
						"l",
						"x6",
						"y2"
					],
					[
						"l",
						"r",
						"rh"
					],
					[
						"Q",
						"cx5",
						"cy4",
						"x5",
						"y5"
					],
					[
						"l",
						"x5",
						"y6"
					],
					[
						"Q",
						"hc",
						"cy6",
						"x2",
						"y6"
					],
					[
						"l",
						"x2",
						"y5"
					],
					[
						"Q",
						"cx4",
						"cy4",
						"l",
						"rh"
					],
					[
						"l",
						"wd8",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x3",
						"y7"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x5",
						"y3"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x4",
						"y7"
					],
					[
						"Q",
						"hc",
						"cy7",
						"x3",
						"y7"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"Q",
						"cx1",
						"cy1",
						"x3",
						"y1"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x5",
						"y3"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"Q",
						"cx2",
						"cy1",
						"r",
						"t"
					],
					[
						"l",
						"x6",
						"y2"
					],
					[
						"l",
						"r",
						"rh"
					],
					[
						"Q",
						"cx5",
						"cy4",
						"x5",
						"y5"
					],
					[
						"l",
						"x5",
						"y6"
					],
					[
						"Q",
						"hc",
						"cy6",
						"x2",
						"y6"
					],
					[
						"l",
						"x2",
						"y5"
					],
					[
						"Q",
						"cx4",
						"cy4",
						"l",
						"rh"
					],
					[
						"l",
						"wd8",
						"y2"
					],
					["c"],
					[
						"m",
						"x2",
						"y5"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"m",
						"x5",
						"y3"
					],
					[
						"l",
						"x5",
						"y5"
					],
					[
						"m",
						"x3",
						"y1"
					],
					[
						"l",
						"x3",
						"y7"
					],
					[
						"m",
						"x4",
						"y7"
					],
					[
						"l",
						"x4",
						"y1"
					]
				]
			}
		]
	},
	ellipseribbon2: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 50000"],
			["adj3", "val 12500"]
		],
		gd: [
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 25000 adj2 75000"],
			["q10", "+- 100000 0 a1"],
			["q11", "*/ q10 1 2"],
			["q12", "+- a1 0 q11"],
			["minAdj3", "max 0 q12"],
			["a3", "pin minAdj3 adj3 a1"],
			["dx2", "*/ w a2 200000"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- x2 wd8 0"],
			["x4", "+- r 0 x3"],
			["x5", "+- r 0 x2"],
			["x6", "+- r 0 wd8"],
			["dy1", "*/ h a3 100000"],
			["f1", "*/ 4 dy1 w"],
			["q1", "*/ x3 x3 w"],
			["q2", "+- x3 0 q1"],
			["u1", "*/ f1 q2 1"],
			["y1", "+- b 0 u1"],
			["cx1", "*/ x3 1 2"],
			["cu1", "*/ f1 cx1 1"],
			["cy1", "+- b 0 cu1"],
			["cx2", "+- r 0 cx1"],
			["q1", "*/ h a1 100000"],
			["dy3", "+- q1 0 dy1"],
			["q3", "*/ x2 x2 w"],
			["q4", "+- x2 0 q3"],
			["q5", "*/ f1 q4 1"],
			["u3", "+- q5 dy3 0"],
			["y3", "+- b 0 u3"],
			["q6", "+- dy1 dy3 u3"],
			["q7", "+- q6 dy1 0"],
			["cu3", "+- q7 dy3 0"],
			["cy3", "+- b 0 cu3"],
			["rh", "+- b 0 q1"],
			["q8", "*/ dy1 14 16"],
			["u2", "+/ q8 rh 2"],
			["y2", "+- b 0 u2"],
			["u5", "+- q5 rh 0"],
			["y5", "+- b 0 u5"],
			["u6", "+- u3 rh 0"],
			["y6", "+- b 0 u6"],
			["cx4", "*/ x2 1 2"],
			["q9", "*/ f1 cx4 1"],
			["cu4", "+- q9 rh 0"],
			["cy4", "+- b 0 cu4"],
			["cx5", "+- r 0 cx4"],
			["cu6", "+- cu3 rh 0"],
			["cy6", "+- b 0 cu6"],
			["u7", "+- u1 dy3 0"],
			["y7", "+- b 0 u7"],
			["cu7", "+- q1 q1 u7"],
			["cy7", "+- b 0 cu7"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"b"
					],
					[
						"Q",
						"cx1",
						"cy1",
						"x3",
						"y1"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x5",
						"y3"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"Q",
						"cx2",
						"cy1",
						"r",
						"b"
					],
					[
						"l",
						"x6",
						"y2"
					],
					[
						"l",
						"r",
						"q1"
					],
					[
						"Q",
						"cx5",
						"cy4",
						"x5",
						"y5"
					],
					[
						"l",
						"x5",
						"y6"
					],
					[
						"Q",
						"hc",
						"cy6",
						"x2",
						"y6"
					],
					[
						"l",
						"x2",
						"y5"
					],
					[
						"Q",
						"cx4",
						"cy4",
						"l",
						"q1"
					],
					[
						"l",
						"wd8",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x3",
						"y7"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"l",
						"x2",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x5",
						"y3"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"l",
						"x4",
						"y7"
					],
					[
						"Q",
						"hc",
						"cy7",
						"x3",
						"y7"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"b"
					],
					[
						"l",
						"wd8",
						"y2"
					],
					[
						"l",
						"l",
						"q1"
					],
					[
						"Q",
						"cx4",
						"cy4",
						"x2",
						"y5"
					],
					[
						"l",
						"x2",
						"y6"
					],
					[
						"Q",
						"hc",
						"cy6",
						"x5",
						"y6"
					],
					[
						"l",
						"x5",
						"y5"
					],
					[
						"Q",
						"cx5",
						"cy4",
						"r",
						"q1"
					],
					[
						"l",
						"x6",
						"y2"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"Q",
						"cx2",
						"cy1",
						"x4",
						"y1"
					],
					[
						"l",
						"x5",
						"y3"
					],
					[
						"Q",
						"hc",
						"cy3",
						"x2",
						"y3"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"Q",
						"cx1",
						"cy1",
						"l",
						"b"
					],
					["c"],
					[
						"m",
						"x2",
						"y3"
					],
					[
						"l",
						"x2",
						"y5"
					],
					[
						"m",
						"x5",
						"y5"
					],
					[
						"l",
						"x5",
						"y3"
					],
					[
						"m",
						"x3",
						"y7"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"m",
						"x4",
						"y1"
					],
					[
						"l",
						"x4",
						"y7"
					]
				]
			}
		]
	},
	flowchartalternateprocess: {
		adj: [],
		gd: [
			["x2", "+- r 0 ssd6"],
			["y2", "+- b 0 ssd6"],
			["il", "*/ ssd6 29289 100000"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"ssd6"
				],
				[
					"a",
					"ssd6",
					"ssd6",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"a",
					"ssd6",
					"ssd6",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"ssd6",
					"ssd6",
					"0",
					"cd4"
				],
				[
					"l",
					"ssd6",
					"b"
				],
				[
					"a",
					"ssd6",
					"ssd6",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}]
	},
	flowchartcollate: {
		adj: [],
		gd: [["ir", "*/ w 3 4"], ["ib", "*/ h 3 4"]],
		paths: [{
			w: 2,
			h: 2,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"2",
					"0"
				],
				[
					"l",
					"1",
					"1"
				],
				[
					"l",
					"2",
					"2"
				],
				[
					"l",
					"0",
					"2"
				],
				[
					"l",
					"1",
					"1"
				],
				["c"]
			]
		}]
	},
	flowchartconnector: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}]
	},
	flowchartdecision: {
		adj: [],
		gd: [["ir", "*/ w 3 4"], ["ib", "*/ h 3 4"]],
		paths: [{
			w: 2,
			h: 2,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"1"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"2",
					"1"
				],
				[
					"l",
					"1",
					"2"
				],
				["c"]
			]
		}]
	},
	flowchartdelay: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd2"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	flowchartdisplay: {
		adj: [],
		gd: [["x2", "*/ w 5 6"]],
		paths: [{
			w: 6,
			h: 6,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"3"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"5",
					"0"
				],
				[
					"a",
					"1",
					"3",
					"3cd4",
					"cd2"
				],
				[
					"l",
					"1",
					"6"
				],
				["c"]
			]
		}]
	},
	flowchartdocument: {
		adj: [],
		gd: [["y1", "*/ h 17322 21600"], ["y2", "*/ h 20172 21600"]],
		paths: [{
			w: 21600,
			h: 21600,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"21600",
					"0"
				],
				[
					"l",
					"21600",
					"17322"
				],
				[
					"C",
					"10800",
					"17322",
					"10800",
					"23922",
					"0",
					"20172"
				],
				["c"]
			]
		}]
	},
	flowchartextract: {
		adj: [],
		gd: [["x2", "*/ w 3 4"]],
		paths: [{
			w: 2,
			h: 2,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"2"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"2",
					"2"
				],
				["c"]
			]
		}]
	},
	flowchartinputoutput: {
		adj: [],
		gd: [
			["x3", "*/ w 2 5"],
			["x4", "*/ w 3 5"],
			["x5", "*/ w 4 5"],
			["x6", "*/ w 9 10"]
		],
		paths: [{
			w: 5,
			h: 5,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"5"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"5",
					"0"
				],
				[
					"l",
					"4",
					"5"
				],
				["c"]
			]
		}]
	},
	flowchartinternalstorage: {
		adj: [],
		gd: [],
		paths: [
			{
				w: 1,
				h: 1,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"1"
					],
					[
						"l",
						"0",
						"1"
					],
					["c"]
				]
			},
			{
				w: 8,
				h: 8,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"8"
					],
					[
						"m",
						"0",
						"1"
					],
					[
						"l",
						"8",
						"1"
					]
				]
			},
			{
				w: 1,
				h: 1,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"1"
					],
					[
						"l",
						"0",
						"1"
					],
					["c"]
				]
			}
		]
	},
	flowchartmagneticdisk: {
		adj: [],
		gd: [["y3", "*/ h 5 6"]],
		paths: [
			{
				w: 6,
				h: 6,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"1"
					],
					[
						"a",
						"3",
						"1",
						"cd2",
						"cd2"
					],
					[
						"l",
						"6",
						"5"
					],
					[
						"a",
						"3",
						"1",
						"0",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: 6,
				h: 6,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"6",
					"1"
				], [
					"a",
					"3",
					"1",
					"0",
					"cd2"
				]]
			},
			{
				w: 6,
				h: 6,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"1"
					],
					[
						"a",
						"3",
						"1",
						"cd2",
						"cd2"
					],
					[
						"l",
						"6",
						"5"
					],
					[
						"a",
						"3",
						"1",
						"0",
						"cd2"
					],
					["c"]
				]
			}
		]
	},
	flowchartmagneticdrum: {
		adj: [],
		gd: [["x2", "*/ w 2 3"]],
		paths: [
			{
				w: 6,
				h: 6,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"1",
						"0"
					],
					[
						"l",
						"5",
						"0"
					],
					[
						"a",
						"1",
						"3",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"1",
						"6"
					],
					[
						"a",
						"1",
						"3",
						"cd4",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: 6,
				h: 6,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"5",
					"6"
				], [
					"a",
					"1",
					"3",
					"cd4",
					"cd2"
				]]
			},
			{
				w: 6,
				h: 6,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"1",
						"0"
					],
					[
						"l",
						"5",
						"0"
					],
					[
						"a",
						"1",
						"3",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"1",
						"6"
					],
					[
						"a",
						"1",
						"3",
						"cd4",
						"cd2"
					],
					["c"]
				]
			}
		]
	},
	flowchartmagnetictape: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"],
			["ang1", "at2 w h"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"hc",
					"b"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"ang1"
				],
				[
					"l",
					"r",
					"ib"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	flowchartmanualinput: {
		adj: [],
		gd: [],
		paths: [{
			w: 5,
			h: 5,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"1"
				],
				[
					"l",
					"5",
					"0"
				],
				[
					"l",
					"5",
					"5"
				],
				[
					"l",
					"0",
					"5"
				],
				["c"]
			]
		}]
	},
	flowchartmanualoperation: {
		adj: [],
		gd: [["x3", "*/ w 4 5"], ["x4", "*/ w 9 10"]],
		paths: [{
			w: 5,
			h: 5,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"5",
					"0"
				],
				[
					"l",
					"4",
					"5"
				],
				[
					"l",
					"1",
					"5"
				],
				["c"]
			]
		}]
	},
	flowchartmerge: {
		adj: [],
		gd: [["x2", "*/ w 3 4"]],
		paths: [{
			w: 2,
			h: 2,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"2",
					"0"
				],
				[
					"l",
					"1",
					"2"
				],
				["c"]
			]
		}]
	},
	flowchartmultidocument: {
		adj: [],
		gd: [
			["y2", "*/ h 3675 21600"],
			["y8", "*/ h 20782 21600"],
			["x3", "*/ w 9298 21600"],
			["x4", "*/ w 12286 21600"],
			["x5", "*/ w 18595 21600"]
		],
		paths: [
			{
				w: 21600,
				h: 21600,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"20782"
					],
					[
						"C",
						"9298",
						"23542",
						"9298",
						"18022",
						"18595",
						"18022"
					],
					[
						"l",
						"18595",
						"3675"
					],
					[
						"l",
						"0",
						"3675"
					],
					["c"],
					[
						"m",
						"1532",
						"3675"
					],
					[
						"l",
						"1532",
						"1815"
					],
					[
						"l",
						"20000",
						"1815"
					],
					[
						"l",
						"20000",
						"16252"
					],
					[
						"C",
						"19298",
						"16252",
						"18595",
						"16352",
						"18595",
						"16352"
					],
					[
						"l",
						"18595",
						"3675"
					],
					["c"],
					[
						"m",
						"2972",
						"1815"
					],
					[
						"l",
						"2972",
						"0"
					],
					[
						"l",
						"21600",
						"0"
					],
					[
						"l",
						"21600",
						"14392"
					],
					[
						"C",
						"20800",
						"14392",
						"20000",
						"14467",
						"20000",
						"14467"
					],
					[
						"l",
						"20000",
						"1815"
					],
					["c"]
				]
			},
			{
				w: 21600,
				h: 21600,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"3675"
					],
					[
						"l",
						"18595",
						"3675"
					],
					[
						"l",
						"18595",
						"18022"
					],
					[
						"C",
						"9298",
						"18022",
						"9298",
						"23542",
						"0",
						"20782"
					],
					["c"],
					[
						"m",
						"1532",
						"3675"
					],
					[
						"l",
						"1532",
						"1815"
					],
					[
						"l",
						"20000",
						"1815"
					],
					[
						"l",
						"20000",
						"16252"
					],
					[
						"C",
						"19298",
						"16252",
						"18595",
						"16352",
						"18595",
						"16352"
					],
					[
						"m",
						"2972",
						"1815"
					],
					[
						"l",
						"2972",
						"0"
					],
					[
						"l",
						"21600",
						"0"
					],
					[
						"l",
						"21600",
						"14392"
					],
					[
						"C",
						"20800",
						"14392",
						"20000",
						"14467",
						"20000",
						"14467"
					]
				]
			},
			{
				w: 21600,
				h: 21600,
				fill: "none",
				stroke: !1,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"20782"
					],
					[
						"C",
						"9298",
						"23542",
						"9298",
						"18022",
						"18595",
						"18022"
					],
					[
						"l",
						"18595",
						"16352"
					],
					[
						"C",
						"18595",
						"16352",
						"19298",
						"16252",
						"20000",
						"16252"
					],
					[
						"l",
						"20000",
						"14467"
					],
					[
						"C",
						"20000",
						"14467",
						"20800",
						"14392",
						"21600",
						"14392"
					],
					[
						"l",
						"21600",
						"0"
					],
					[
						"l",
						"2972",
						"0"
					],
					[
						"l",
						"2972",
						"1815"
					],
					[
						"l",
						"1532",
						"1815"
					],
					[
						"l",
						"1532",
						"3675"
					],
					[
						"l",
						"0",
						"3675"
					],
					["c"]
				]
			}
		]
	},
	flowchartofflinestorage: {
		adj: [],
		gd: [["x4", "*/ w 3 4"]],
		paths: [
			{
				w: 2,
				h: 2,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"2",
						"0"
					],
					[
						"l",
						"1",
						"2"
					],
					["c"]
				]
			},
			{
				w: 5,
				h: 5,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"2",
					"4"
				], [
					"l",
					"3",
					"4"
				]]
			},
			{
				w: 2,
				h: 2,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"2",
						"0"
					],
					[
						"l",
						"1",
						"2"
					],
					["c"]
				]
			}
		]
	},
	flowchartoffpageconnector: {
		adj: [],
		gd: [["y1", "*/ h 4 5"]],
		paths: [{
			w: 10,
			h: 10,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"10",
					"0"
				],
				[
					"l",
					"10",
					"8"
				],
				[
					"l",
					"5",
					"10"
				],
				[
					"l",
					"0",
					"8"
				],
				["c"]
			]
		}]
	},
	flowchartonlinestorage: {
		adj: [],
		gd: [["x2", "*/ w 5 6"]],
		paths: [{
			w: 6,
			h: 6,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"1",
					"0"
				],
				[
					"l",
					"6",
					"0"
				],
				[
					"a",
					"1",
					"3",
					"3cd4",
					"-10800000"
				],
				[
					"l",
					"1",
					"6"
				],
				[
					"a",
					"1",
					"3",
					"cd4",
					"cd2"
				],
				["c"]
			]
		}]
	},
	flowchartor: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"3cd4",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"0",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd4",
						"cd4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"hc",
						"t"
					],
					[
						"l",
						"hc",
						"b"
					],
					[
						"m",
						"l",
						"vc"
					],
					[
						"l",
						"r",
						"vc"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"3cd4",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"0",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd4",
						"cd4"
					],
					["c"]
				]
			}
		]
	},
	flowchartpredefinedprocess: {
		adj: [],
		gd: [["x2", "*/ w 7 8"]],
		paths: [
			{
				w: 1,
				h: 1,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"1"
					],
					[
						"l",
						"0",
						"1"
					],
					["c"]
				]
			},
			{
				w: 8,
				h: 8,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"8"
					],
					[
						"m",
						"7",
						"0"
					],
					[
						"l",
						"7",
						"8"
					]
				]
			},
			{
				w: 1,
				h: 1,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"0"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"1",
						"1"
					],
					[
						"l",
						"0",
						"1"
					],
					["c"]
				]
			}
		]
	},
	flowchartpreparation: {
		adj: [],
		gd: [["x2", "*/ w 4 5"]],
		paths: [{
			w: 10,
			h: 10,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"5"
				],
				[
					"l",
					"2",
					"0"
				],
				[
					"l",
					"8",
					"0"
				],
				[
					"l",
					"10",
					"5"
				],
				[
					"l",
					"8",
					"10"
				],
				[
					"l",
					"2",
					"10"
				],
				["c"]
			]
		}]
	},
	flowchartprocess: {
		adj: [],
		gd: [],
		paths: [{
			w: 1,
			h: 1,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"0"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"1",
					"1"
				],
				[
					"l",
					"0",
					"1"
				],
				["c"]
			]
		}]
	},
	flowchartpunchedcard: {
		adj: [],
		gd: [],
		paths: [{
			w: 5,
			h: 5,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"1"
				],
				[
					"l",
					"1",
					"0"
				],
				[
					"l",
					"5",
					"0"
				],
				[
					"l",
					"5",
					"5"
				],
				[
					"l",
					"0",
					"5"
				],
				["c"]
			]
		}]
	},
	flowchartpunchedtape: {
		adj: [],
		gd: [["y2", "*/ h 9 10"], ["ib", "*/ h 4 5"]],
		paths: [{
			w: 20,
			h: 20,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"0",
					"2"
				],
				[
					"a",
					"5",
					"2",
					"cd2",
					"-10800000"
				],
				[
					"a",
					"5",
					"2",
					"cd2",
					"cd2"
				],
				[
					"l",
					"20",
					"18"
				],
				[
					"a",
					"5",
					"2",
					"0",
					"-10800000"
				],
				[
					"a",
					"5",
					"2",
					"0",
					"cd2"
				],
				["c"]
			]
		}]
	},
	flowchartsort: {
		adj: [],
		gd: [["ir", "*/ w 3 4"], ["ib", "*/ h 3 4"]],
		paths: [
			{
				w: 2,
				h: 2,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"0",
						"1"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"2",
						"1"
					],
					[
						"l",
						"1",
						"2"
					],
					["c"]
				]
			},
			{
				w: 2,
				h: 2,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"0",
					"1"
				], [
					"l",
					"2",
					"1"
				]]
			},
			{
				w: 2,
				h: 2,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"0",
						"1"
					],
					[
						"l",
						"1",
						"0"
					],
					[
						"l",
						"2",
						"1"
					],
					[
						"l",
						"1",
						"2"
					],
					["c"]
				]
			}
		]
	},
	flowchartsummingjunction: {
		adj: [],
		gd: [
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"3cd4",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"0",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd4",
						"cd4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"il",
						"it"
					],
					[
						"l",
						"ir",
						"ib"
					],
					[
						"m",
						"ir",
						"it"
					],
					[
						"l",
						"il",
						"ib"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"3cd4",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"0",
						"cd4"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd4",
						"cd4"
					],
					["c"]
				]
			}
		]
	},
	flowchartterminator: {
		adj: [],
		gd: [
			["il", "*/ w 1018 21600"],
			["ir", "*/ w 20582 21600"],
			["it", "*/ h 3163 21600"],
			["ib", "*/ h 18437 21600"]
		],
		paths: [{
			w: 21600,
			h: 21600,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"3475",
					"0"
				],
				[
					"l",
					"18125",
					"0"
				],
				[
					"a",
					"3475",
					"10800",
					"3cd4",
					"cd2"
				],
				[
					"l",
					"3475",
					"21600"
				],
				[
					"a",
					"3475",
					"10800",
					"cd4",
					"cd2"
				],
				["c"]
			]
		}]
	},
	foldedcorner: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dy2", "*/ ss a 100000"],
			["dy1", "*/ dy2 1 5"],
			["x1", "+- r 0 dy2"],
			["x2", "+- x1 dy1 0"],
			["y2", "+- b 0 dy2"],
			["y1", "+- y2 dy1 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"y2"
					],
					[
						"l",
						"x1",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"b"
					],
					[
						"l",
						"x2",
						"y1"
					],
					[
						"l",
						"r",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x1",
						"b"
					],
					[
						"l",
						"x2",
						"y1"
					],
					[
						"l",
						"r",
						"y2"
					],
					[
						"l",
						"x1",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					[
						"l",
						"l",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"y2"
					]
				]
			}
		]
	},
	frame: {
		adj: [["adj1", "val 12500"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["x1", "*/ ss a1 100000"],
			["x4", "+- r 0 x1"],
			["y4", "+- b 0 x1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"],
				[
					"m",
					"x1",
					"x1"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"x4",
					"x1"
				],
				["c"]
			]
		}]
	},
	funnel: {
		adj: [],
		gd: [
			["d", "*/ ss 1 20"],
			["rw2", "+- wd2 0 d"],
			["rh2", "+- hd4 0 d"],
			["t1", "cos wd2 480000"],
			["t2", "sin hd4 480000"],
			["da", "at2 t1 t2"],
			["2da", "*/ da 2 1"],
			["stAng1", "+- cd2 0 da"],
			["swAng1", "+- cd2 2da 0"],
			["swAng3", "+- cd2 0 2da"],
			["rw3", "*/ wd2 1 4"],
			["rh3", "*/ hd4 1 4"],
			["ct1", "cos hd4 stAng1"],
			["st1", "sin wd2 stAng1"],
			["m1", "mod ct1 st1 0"],
			["n1", "*/ wd2 hd4 m1"],
			["dx1", "cos n1 stAng1"],
			["dy1", "sin n1 stAng1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- hd4 dy1 0"],
			["ct3", "cos rh3 da"],
			["st3", "sin rw3 da"],
			["m3", "mod ct3 st3 0"],
			["n3", "*/ rw3 rh3 m3"],
			["dx3", "cos n3 da"],
			["dy3", "sin n3 da"],
			["x3", "+- hc dx3 0"],
			["vc3", "+- b 0 rh3"],
			["y2", "+- vc3 dy3 0"],
			["x2", "+- wd2 0 rw2"],
			["cd", "*/ cd2 2 1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd4",
					"stAng1",
					"swAng1"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"a",
					"rw3",
					"rh3",
					"da",
					"swAng3"
				],
				["c"],
				[
					"m",
					"x2",
					"hd4"
				],
				[
					"a",
					"rw2",
					"rh2",
					"cd2",
					"-21600000"
				],
				["c"]
			]
		}]
	},
	gear6: {
		adj: [["adj1", "val 15000"], ["adj2", "val 3526"]],
		gd: [
			["a1", "pin 0 adj1 20000"],
			["a2", "pin 0 adj2 5358"],
			["th", "*/ ss a1 100000"],
			["lFD", "*/ ss a2 100000"],
			["th2", "*/ th 1 2"],
			["l2", "*/ lFD 1 2"],
			["l3", "+- th2 l2 0"],
			["rh", "+- hd2 0 th"],
			["rw", "+- wd2 0 th"],
			["dr", "+- rw 0 rh"],
			["maxr", "?: dr rh rw"],
			["ha", "at2 maxr l3"],
			["aA1", "+- 19800000 0 ha"],
			["aD1", "+- 19800000 ha 0"],
			["ta11", "cos rw aA1"],
			["ta12", "sin rh aA1"],
			["bA1", "at2 ta11 ta12"],
			["cta1", "cos rh bA1"],
			["sta1", "sin rw bA1"],
			["ma1", "mod cta1 sta1 0"],
			["na1", "*/ rw rh ma1"],
			["dxa1", "cos na1 bA1"],
			["dya1", "sin na1 bA1"],
			["xA1", "+- hc dxa1 0"],
			["yA1", "+- vc dya1 0"],
			["td11", "cos rw aD1"],
			["td12", "sin rh aD1"],
			["bD1", "at2 td11 td12"],
			["ctd1", "cos rh bD1"],
			["std1", "sin rw bD1"],
			["md1", "mod ctd1 std1 0"],
			["nd1", "*/ rw rh md1"],
			["dxd1", "cos nd1 bD1"],
			["dyd1", "sin nd1 bD1"],
			["xD1", "+- hc dxd1 0"],
			["yD1", "+- vc dyd1 0"],
			["xAD1", "+- xA1 0 xD1"],
			["yAD1", "+- yA1 0 yD1"],
			["lAD1", "mod xAD1 yAD1 0"],
			["a1", "at2 yAD1 xAD1"],
			["dxF1", "sin lFD a1"],
			["dyF1", "cos lFD a1"],
			["xF1", "+- xD1 dxF1 0"],
			["yF1", "+- yD1 dyF1 0"],
			["xE1", "+- xA1 0 dxF1"],
			["yE1", "+- yA1 0 dyF1"],
			["yC1t", "sin th a1"],
			["xC1t", "cos th a1"],
			["yC1", "+- yF1 yC1t 0"],
			["xC1", "+- xF1 0 xC1t"],
			["yB1", "+- yE1 yC1t 0"],
			["xB1", "+- xE1 0 xC1t"],
			["aD6", "+- 3cd4 ha 0"],
			["td61", "cos rw aD6"],
			["td62", "sin rh aD6"],
			["bD6", "at2 td61 td62"],
			["ctd6", "cos rh bD6"],
			["std6", "sin rw bD6"],
			["md6", "mod ctd6 std6 0"],
			["nd6", "*/ rw rh md6"],
			["dxd6", "cos nd6 bD6"],
			["dyd6", "sin nd6 bD6"],
			["xD6", "+- hc dxd6 0"],
			["yD6", "+- vc dyd6 0"],
			["xA6", "+- hc 0 dxd6"],
			["xF6", "+- xD6 0 lFD"],
			["xE6", "+- xA6 lFD 0"],
			["yC6", "+- yD6 0 th"],
			["swAng1", "+- bA1 0 bD6"],
			["aA2", "+- 1800000 0 ha"],
			["aD2", "+- 1800000 ha 0"],
			["ta21", "cos rw aA2"],
			["ta22", "sin rh aA2"],
			["bA2", "at2 ta21 ta22"],
			["yA2", "+- h 0 yD1"],
			["td21", "cos rw aD2"],
			["td22", "sin rh aD2"],
			["bD2", "at2 td21 td22"],
			["yD2", "+- h 0 yA1"],
			["yC2", "+- h 0 yB1"],
			["yB2", "+- h 0 yC1"],
			["xB2", "val xC1"],
			["swAng2", "+- bA2 0 bD1"],
			["aD3", "+- cd4 ha 0"],
			["td31", "cos rw aD3"],
			["td32", "sin rh aD3"],
			["bD3", "at2 td31 td32"],
			["yD3", "+- h 0 yD6"],
			["yB3", "+- h 0 yC6"],
			["aD4", "+- 9000000 ha 0"],
			["td41", "cos rw aD4"],
			["td42", "sin rh aD4"],
			["bD4", "at2 td41 td42"],
			["xD4", "+- w 0 xD1"],
			["xC4", "+- w 0 xC1"],
			["xB4", "+- w 0 xB1"],
			["aD5", "+- 12600000 ha 0"],
			["td51", "cos rw aD5"],
			["td52", "sin rh aD5"],
			["bD5", "at2 td51 td52"],
			["xD5", "+- w 0 xA1"],
			["xC5", "+- w 0 xB1"],
			["xB5", "+- w 0 xC1"],
			["xCxn1", "+/ xB1 xC1 2"],
			["yCxn1", "+/ yB1 yC1 2"],
			["yCxn2", "+- b 0 yCxn1"],
			["xCxn4", "+/ r 0 xCxn1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xA1",
					"yA1"
				],
				[
					"l",
					"xB1",
					"yB1"
				],
				[
					"l",
					"xC1",
					"yC1"
				],
				[
					"l",
					"xD1",
					"yD1"
				],
				[
					"a",
					"rw",
					"rh",
					"bD1",
					"swAng2"
				],
				[
					"l",
					"xC1",
					"yB2"
				],
				[
					"l",
					"xB1",
					"yC2"
				],
				[
					"l",
					"xA1",
					"yD2"
				],
				[
					"a",
					"rw",
					"rh",
					"bD2",
					"swAng1"
				],
				[
					"l",
					"xF6",
					"yB3"
				],
				[
					"l",
					"xE6",
					"yB3"
				],
				[
					"l",
					"xA6",
					"yD3"
				],
				[
					"a",
					"rw",
					"rh",
					"bD3",
					"swAng1"
				],
				[
					"l",
					"xB4",
					"yC2"
				],
				[
					"l",
					"xC4",
					"yB2"
				],
				[
					"l",
					"xD4",
					"yA2"
				],
				[
					"a",
					"rw",
					"rh",
					"bD4",
					"swAng2"
				],
				[
					"l",
					"xB5",
					"yC1"
				],
				[
					"l",
					"xC5",
					"yB1"
				],
				[
					"l",
					"xD5",
					"yA1"
				],
				[
					"a",
					"rw",
					"rh",
					"bD5",
					"swAng1"
				],
				[
					"l",
					"xE6",
					"yC6"
				],
				[
					"l",
					"xF6",
					"yC6"
				],
				[
					"l",
					"xD6",
					"yD6"
				],
				[
					"a",
					"rw",
					"rh",
					"bD6",
					"swAng1"
				],
				["c"]
			]
		}]
	},
	gear9: {
		adj: [["adj1", "val 10000"], ["adj2", "val 1763"]],
		gd: [
			["a1", "pin 0 adj1 20000"],
			["a2", "pin 0 adj2 2679"],
			["th", "*/ ss a1 100000"],
			["lFD", "*/ ss a2 100000"],
			["th2", "*/ th 1 2"],
			["l2", "*/ lFD 1 2"],
			["l3", "+- th2 l2 0"],
			["rh", "+- hd2 0 th"],
			["rw", "+- wd2 0 th"],
			["dr", "+- rw 0 rh"],
			["maxr", "?: dr rh rw"],
			["ha", "at2 maxr l3"],
			["aA1", "+- 18600000 0 ha"],
			["aD1", "+- 18600000 ha 0"],
			["ta11", "cos rw aA1"],
			["ta12", "sin rh aA1"],
			["bA1", "at2 ta11 ta12"],
			["cta1", "cos rh bA1"],
			["sta1", "sin rw bA1"],
			["ma1", "mod cta1 sta1 0"],
			["na1", "*/ rw rh ma1"],
			["dxa1", "cos na1 bA1"],
			["dya1", "sin na1 bA1"],
			["xA1", "+- hc dxa1 0"],
			["yA1", "+- vc dya1 0"],
			["td11", "cos rw aD1"],
			["td12", "sin rh aD1"],
			["bD1", "at2 td11 td12"],
			["ctd1", "cos rh bD1"],
			["std1", "sin rw bD1"],
			["md1", "mod ctd1 std1 0"],
			["nd1", "*/ rw rh md1"],
			["dxd1", "cos nd1 bD1"],
			["dyd1", "sin nd1 bD1"],
			["xD1", "+- hc dxd1 0"],
			["yD1", "+- vc dyd1 0"],
			["xAD1", "+- xA1 0 xD1"],
			["yAD1", "+- yA1 0 yD1"],
			["lAD1", "mod xAD1 yAD1 0"],
			["a1", "at2 yAD1 xAD1"],
			["dxF1", "sin lFD a1"],
			["dyF1", "cos lFD a1"],
			["xF1", "+- xD1 dxF1 0"],
			["yF1", "+- yD1 dyF1 0"],
			["xE1", "+- xA1 0 dxF1"],
			["yE1", "+- yA1 0 dyF1"],
			["yC1t", "sin th a1"],
			["xC1t", "cos th a1"],
			["yC1", "+- yF1 yC1t 0"],
			["xC1", "+- xF1 0 xC1t"],
			["yB1", "+- yE1 yC1t 0"],
			["xB1", "+- xE1 0 xC1t"],
			["aA2", "+- 21000000 0 ha"],
			["aD2", "+- 21000000 ha 0"],
			["ta21", "cos rw aA2"],
			["ta22", "sin rh aA2"],
			["bA2", "at2 ta21 ta22"],
			["cta2", "cos rh bA2"],
			["sta2", "sin rw bA2"],
			["ma2", "mod cta2 sta2 0"],
			["na2", "*/ rw rh ma2"],
			["dxa2", "cos na2 bA2"],
			["dya2", "sin na2 bA2"],
			["xA2", "+- hc dxa2 0"],
			["yA2", "+- vc dya2 0"],
			["td21", "cos rw aD2"],
			["td22", "sin rh aD2"],
			["bD2", "at2 td21 td22"],
			["ctd2", "cos rh bD2"],
			["std2", "sin rw bD2"],
			["md2", "mod ctd2 std2 0"],
			["nd2", "*/ rw rh md2"],
			["dxd2", "cos nd2 bD2"],
			["dyd2", "sin nd2 bD2"],
			["xD2", "+- hc dxd2 0"],
			["yD2", "+- vc dyd2 0"],
			["xAD2", "+- xA2 0 xD2"],
			["yAD2", "+- yA2 0 yD2"],
			["lAD2", "mod xAD2 yAD2 0"],
			["a2", "at2 yAD2 xAD2"],
			["dxF2", "sin lFD a2"],
			["dyF2", "cos lFD a2"],
			["xF2", "+- xD2 dxF2 0"],
			["yF2", "+- yD2 dyF2 0"],
			["xE2", "+- xA2 0 dxF2"],
			["yE2", "+- yA2 0 dyF2"],
			["yC2t", "sin th a2"],
			["xC2t", "cos th a2"],
			["yC2", "+- yF2 yC2t 0"],
			["xC2", "+- xF2 0 xC2t"],
			["yB2", "+- yE2 yC2t 0"],
			["xB2", "+- xE2 0 xC2t"],
			["swAng1", "+- bA2 0 bD1"],
			["aA3", "+- 1800000 0 ha"],
			["aD3", "+- 1800000 ha 0"],
			["ta31", "cos rw aA3"],
			["ta32", "sin rh aA3"],
			["bA3", "at2 ta31 ta32"],
			["cta3", "cos rh bA3"],
			["sta3", "sin rw bA3"],
			["ma3", "mod cta3 sta3 0"],
			["na3", "*/ rw rh ma3"],
			["dxa3", "cos na3 bA3"],
			["dya3", "sin na3 bA3"],
			["xA3", "+- hc dxa3 0"],
			["yA3", "+- vc dya3 0"],
			["td31", "cos rw aD3"],
			["td32", "sin rh aD3"],
			["bD3", "at2 td31 td32"],
			["ctd3", "cos rh bD3"],
			["std3", "sin rw bD3"],
			["md3", "mod ctd3 std3 0"],
			["nd3", "*/ rw rh md3"],
			["dxd3", "cos nd3 bD3"],
			["dyd3", "sin nd3 bD3"],
			["xD3", "+- hc dxd3 0"],
			["yD3", "+- vc dyd3 0"],
			["xAD3", "+- xA3 0 xD3"],
			["yAD3", "+- yA3 0 yD3"],
			["lAD3", "mod xAD3 yAD3 0"],
			["a3", "at2 yAD3 xAD3"],
			["dxF3", "sin lFD a3"],
			["dyF3", "cos lFD a3"],
			["xF3", "+- xD3 dxF3 0"],
			["yF3", "+- yD3 dyF3 0"],
			["xE3", "+- xA3 0 dxF3"],
			["yE3", "+- yA3 0 dyF3"],
			["yC3t", "sin th a3"],
			["xC3t", "cos th a3"],
			["yC3", "+- yF3 yC3t 0"],
			["xC3", "+- xF3 0 xC3t"],
			["yB3", "+- yE3 yC3t 0"],
			["xB3", "+- xE3 0 xC3t"],
			["swAng2", "+- bA3 0 bD2"],
			["aA4", "+- 4200000 0 ha"],
			["aD4", "+- 4200000 ha 0"],
			["ta41", "cos rw aA4"],
			["ta42", "sin rh aA4"],
			["bA4", "at2 ta41 ta42"],
			["cta4", "cos rh bA4"],
			["sta4", "sin rw bA4"],
			["ma4", "mod cta4 sta4 0"],
			["na4", "*/ rw rh ma4"],
			["dxa4", "cos na4 bA4"],
			["dya4", "sin na4 bA4"],
			["xA4", "+- hc dxa4 0"],
			["yA4", "+- vc dya4 0"],
			["td41", "cos rw aD4"],
			["td42", "sin rh aD4"],
			["bD4", "at2 td41 td42"],
			["ctd4", "cos rh bD4"],
			["std4", "sin rw bD4"],
			["md4", "mod ctd4 std4 0"],
			["nd4", "*/ rw rh md4"],
			["dxd4", "cos nd4 bD4"],
			["dyd4", "sin nd4 bD4"],
			["xD4", "+- hc dxd4 0"],
			["yD4", "+- vc dyd4 0"],
			["xAD4", "+- xA4 0 xD4"],
			["yAD4", "+- yA4 0 yD4"],
			["lAD4", "mod xAD4 yAD4 0"],
			["a4", "at2 yAD4 xAD4"],
			["dxF4", "sin lFD a4"],
			["dyF4", "cos lFD a4"],
			["xF4", "+- xD4 dxF4 0"],
			["yF4", "+- yD4 dyF4 0"],
			["xE4", "+- xA4 0 dxF4"],
			["yE4", "+- yA4 0 dyF4"],
			["yC4t", "sin th a4"],
			["xC4t", "cos th a4"],
			["yC4", "+- yF4 yC4t 0"],
			["xC4", "+- xF4 0 xC4t"],
			["yB4", "+- yE4 yC4t 0"],
			["xB4", "+- xE4 0 xC4t"],
			["swAng3", "+- bA4 0 bD3"],
			["aA5", "+- 6600000 0 ha"],
			["aD5", "+- 6600000 ha 0"],
			["ta51", "cos rw aA5"],
			["ta52", "sin rh aA5"],
			["bA5", "at2 ta51 ta52"],
			["td51", "cos rw aD5"],
			["td52", "sin rh aD5"],
			["bD5", "at2 td51 td52"],
			["xD5", "+- w 0 xA4"],
			["xC5", "+- w 0 xB4"],
			["xB5", "+- w 0 xC4"],
			["swAng4", "+- bA5 0 bD4"],
			["aD6", "+- 9000000 ha 0"],
			["td61", "cos rw aD6"],
			["td62", "sin rh aD6"],
			["bD6", "at2 td61 td62"],
			["xD6", "+- w 0 xA3"],
			["xC6", "+- w 0 xB3"],
			["xB6", "+- w 0 xC3"],
			["aD7", "+- 11400000 ha 0"],
			["td71", "cos rw aD7"],
			["td72", "sin rh aD7"],
			["bD7", "at2 td71 td72"],
			["xD7", "+- w 0 xA2"],
			["xC7", "+- w 0 xB2"],
			["xB7", "+- w 0 xC2"],
			["aD8", "+- 13800000 ha 0"],
			["td81", "cos rw aD8"],
			["td82", "sin rh aD8"],
			["bD8", "at2 td81 td82"],
			["xA8", "+- w 0 xD1"],
			["xD8", "+- w 0 xA1"],
			["xC8", "+- w 0 xB1"],
			["xB8", "+- w 0 xC1"],
			["aA9", "+- 3cd4 0 ha"],
			["aD9", "+- 3cd4 ha 0"],
			["td91", "cos rw aD9"],
			["td92", "sin rh aD9"],
			["bD9", "at2 td91 td92"],
			["ctd9", "cos rh bD9"],
			["std9", "sin rw bD9"],
			["md9", "mod ctd9 std9 0"],
			["nd9", "*/ rw rh md9"],
			["dxd9", "cos nd9 bD9"],
			["dyd9", "sin nd9 bD9"],
			["xD9", "+- hc dxd9 0"],
			["yD9", "+- vc dyd9 0"],
			["ta91", "cos rw aA9"],
			["ta92", "sin rh aA9"],
			["bA9", "at2 ta91 ta92"],
			["xA9", "+- hc 0 dxd9"],
			["xF9", "+- xD9 0 lFD"],
			["xE9", "+- xA9 lFD 0"],
			["yC9", "+- yD9 0 th"],
			["swAng5", "+- bA9 0 bD8"],
			["xCxn1", "+/ xB1 xC1 2"],
			["yCxn1", "+/ yB1 yC1 2"],
			["xCxn2", "+/ xB2 xC2 2"],
			["yCxn2", "+/ yB2 yC2 2"],
			["xCxn3", "+/ xB3 xC3 2"],
			["yCxn3", "+/ yB3 yC3 2"],
			["xCxn4", "+/ xB4 xC4 2"],
			["yCxn4", "+/ yB4 yC4 2"],
			["xCxn5", "+/ r 0 xCxn4"],
			["xCxn6", "+/ r 0 xCxn3"],
			["xCxn7", "+/ r 0 xCxn2"],
			["xCxn8", "+/ r 0 xCxn1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xA1",
					"yA1"
				],
				[
					"l",
					"xB1",
					"yB1"
				],
				[
					"l",
					"xC1",
					"yC1"
				],
				[
					"l",
					"xD1",
					"yD1"
				],
				[
					"a",
					"rw",
					"rh",
					"bD1",
					"swAng1"
				],
				[
					"l",
					"xB2",
					"yB2"
				],
				[
					"l",
					"xC2",
					"yC2"
				],
				[
					"l",
					"xD2",
					"yD2"
				],
				[
					"a",
					"rw",
					"rh",
					"bD2",
					"swAng2"
				],
				[
					"l",
					"xB3",
					"yB3"
				],
				[
					"l",
					"xC3",
					"yC3"
				],
				[
					"l",
					"xD3",
					"yD3"
				],
				[
					"a",
					"rw",
					"rh",
					"bD3",
					"swAng3"
				],
				[
					"l",
					"xB4",
					"yB4"
				],
				[
					"l",
					"xC4",
					"yC4"
				],
				[
					"l",
					"xD4",
					"yD4"
				],
				[
					"a",
					"rw",
					"rh",
					"bD4",
					"swAng4"
				],
				[
					"l",
					"xB5",
					"yC4"
				],
				[
					"l",
					"xC5",
					"yB4"
				],
				[
					"l",
					"xD5",
					"yA4"
				],
				[
					"a",
					"rw",
					"rh",
					"bD5",
					"swAng3"
				],
				[
					"l",
					"xB6",
					"yC3"
				],
				[
					"l",
					"xC6",
					"yB3"
				],
				[
					"l",
					"xD6",
					"yA3"
				],
				[
					"a",
					"rw",
					"rh",
					"bD6",
					"swAng2"
				],
				[
					"l",
					"xB7",
					"yC2"
				],
				[
					"l",
					"xC7",
					"yB2"
				],
				[
					"l",
					"xD7",
					"yA2"
				],
				[
					"a",
					"rw",
					"rh",
					"bD7",
					"swAng1"
				],
				[
					"l",
					"xB8",
					"yC1"
				],
				[
					"l",
					"xC8",
					"yB1"
				],
				[
					"l",
					"xD8",
					"yA1"
				],
				[
					"a",
					"rw",
					"rh",
					"bD8",
					"swAng5"
				],
				[
					"l",
					"xE9",
					"yC9"
				],
				[
					"l",
					"xF9",
					"yC9"
				],
				[
					"l",
					"xD9",
					"yD9"
				],
				[
					"a",
					"rw",
					"rh",
					"bD9",
					"swAng5"
				],
				["c"]
			]
		}]
	},
	halfframe: {
		adj: [["adj1", "val 33333"], ["adj2", "val 33333"]],
		gd: [
			["maxAdj2", "*/ 100000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["x1", "*/ ss a2 100000"],
			["g1", "*/ h x1 w"],
			["g2", "+- h 0 g1"],
			["maxAdj1", "*/ 100000 g2 ss"],
			["a1", "pin 0 adj1 maxAdj1"],
			["y1", "*/ ss a1 100000"],
			["dx2", "*/ y1 w h"],
			["x2", "+- r 0 dx2"],
			["dy2", "*/ x1 h w"],
			["y2", "+- b 0 dy2"],
			["cx1", "*/ x1 1 2"],
			["cy1", "+/ y2 b 2"],
			["cx2", "+/ x2 r 2"],
			["cy2", "*/ y1 1 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	heart: {
		adj: [],
		gd: [
			["dx1", "*/ w 49 48"],
			["dx2", "*/ w 10 48"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "+- t 0 hd3"],
			["il", "*/ w 1 6"],
			["ir", "*/ w 5 6"],
			["ib", "*/ h 2 3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"hc",
					"hd4"
				],
				[
					"C",
					"x3",
					"y1",
					"x4",
					"hd4",
					"hc",
					"b"
				],
				[
					"C",
					"x1",
					"hd4",
					"x2",
					"y1",
					"hc",
					"hd4"
				],
				["c"]
			]
		}]
	},
	heptagon: {
		adj: [["hf", "val 102572"], ["vf", "val 105210"]],
		gd: [
			["swd2", "*/ wd2 hf 100000"],
			["shd2", "*/ hd2 vf 100000"],
			["svc", "*/ vc  vf 100000"],
			["dx1", "*/ swd2 97493 100000"],
			["dx2", "*/ swd2 78183 100000"],
			["dx3", "*/ swd2 43388 100000"],
			["dy1", "*/ shd2 62349 100000"],
			["dy2", "*/ shd2 22252 100000"],
			["dy3", "*/ shd2 90097 100000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc dx3 0"],
			["x5", "+- hc dx2 0"],
			["x6", "+- hc dx1 0"],
			["y1", "+- svc 0 dy1"],
			["y2", "+- svc dy2 0"],
			["y3", "+- svc dy3 0"],
			["ib", "+- b 0 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x5",
					"y1"
				],
				[
					"l",
					"x6",
					"y2"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				["c"]
			]
		}]
	},
	hexagon: {
		adj: [["adj", "val 25000"], ["vf", "val 115470"]],
		gd: [
			["maxAdj", "*/ 50000 w ss"],
			["a", "pin 0 adj maxAdj"],
			["shd2", "*/ hd2 vf 100000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["dy1", "sin shd2 3600000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["q1", "*/ maxAdj -1 2"],
			["q2", "+- a q1 0"],
			["q3", "?: q2 4 2"],
			["q4", "?: q2 3 2"],
			["q5", "?: q2 q1 0"],
			["q6", "+/ a q5 q1"],
			["q7", "*/ q6 q4 -1"],
			["q8", "+- q3 q7 0"],
			["il", "*/ w q8 24"],
			["it", "*/ h q8 24"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 it"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"]
			]
		}]
	},
	homeplate: {
		adj: [["adj", "val 50000"]],
		gd: [
			["maxAdj", "*/ 100000 w ss"],
			["a", "pin 0 adj maxAdj"],
			["dx1", "*/ ss a 100000"],
			["x1", "+- r 0 dx1"],
			["ir", "+/ x1 r 2"],
			["x2", "*/ x1 1 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	horizontalscroll: {
		adj: [["adj", "val 12500"]],
		gd: [
			["a", "pin 0 adj 25000"],
			["ch", "*/ ss a 100000"],
			["ch2", "*/ ch 1 2"],
			["ch4", "*/ ch 1 4"],
			["y3", "+- ch ch2 0"],
			["y4", "+- ch ch 0"],
			["y6", "+- b 0 ch"],
			["y7", "+- b 0 ch2"],
			["y5", "+- y6 0 ch2"],
			["x3", "+- r 0 ch"],
			["x4", "+- r 0 ch2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"r",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					[
						"l",
						"x4",
						"ch2"
					],
					[
						"a",
						"ch4",
						"ch4",
						"0",
						"cd2"
					],
					[
						"l",
						"x3",
						"ch"
					],
					[
						"l",
						"ch2",
						"ch"
					],
					[
						"a",
						"ch2",
						"ch2",
						"3cd4",
						"-5400000"
					],
					[
						"l",
						"l",
						"y7"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd2",
						"-10800000"
					],
					[
						"l",
						"ch",
						"y6"
					],
					[
						"l",
						"x4",
						"y6"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					["c"],
					[
						"m",
						"ch2",
						"y4"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					[
						"a",
						"ch4",
						"ch4",
						"0",
						"-10800000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ch2",
						"y4"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					[
						"a",
						"ch4",
						"ch4",
						"0",
						"-10800000"
					],
					["c"],
					[
						"m",
						"x4",
						"ch"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-16200000"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd2",
						"-10800000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"y3"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x3",
						"ch"
					],
					[
						"l",
						"x3",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd2",
						"cd2"
					],
					[
						"l",
						"r",
						"y5"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					[
						"l",
						"ch",
						"y6"
					],
					[
						"l",
						"ch",
						"y7"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd2"
					],
					["c"],
					[
						"m",
						"x3",
						"ch"
					],
					[
						"l",
						"x4",
						"ch"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					[
						"m",
						"x4",
						"ch"
					],
					[
						"l",
						"x4",
						"ch2"
					],
					[
						"a",
						"ch4",
						"ch4",
						"0",
						"cd2"
					],
					[
						"m",
						"ch2",
						"y4"
					],
					[
						"l",
						"ch2",
						"y3"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd2",
						"cd2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd2"
					],
					[
						"m",
						"ch",
						"y3"
					],
					[
						"l",
						"ch",
						"y6"
					]
				]
			}
		]
	},
	irregularseal1: {
		adj: [],
		gd: [
			["x5", "*/ w 4627 21600"],
			["x12", "*/ w 8485 21600"],
			["x21", "*/ w 16702 21600"],
			["x24", "*/ w 14522 21600"],
			["y3", "*/ h 6320 21600"],
			["y6", "*/ h 8615 21600"],
			["y9", "*/ h 13937 21600"],
			["y18", "*/ h 13290 21600"]
		],
		paths: [{
			w: 21600,
			h: 21600,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"10800",
					"5800"
				],
				[
					"l",
					"14522",
					"0"
				],
				[
					"l",
					"14155",
					"5325"
				],
				[
					"l",
					"18380",
					"4457"
				],
				[
					"l",
					"16702",
					"7315"
				],
				[
					"l",
					"21097",
					"8137"
				],
				[
					"l",
					"17607",
					"10475"
				],
				[
					"l",
					"21600",
					"13290"
				],
				[
					"l",
					"16837",
					"12942"
				],
				[
					"l",
					"18145",
					"18095"
				],
				[
					"l",
					"14020",
					"14457"
				],
				[
					"l",
					"13247",
					"19737"
				],
				[
					"l",
					"10532",
					"14935"
				],
				[
					"l",
					"8485",
					"21600"
				],
				[
					"l",
					"7715",
					"15627"
				],
				[
					"l",
					"4762",
					"17617"
				],
				[
					"l",
					"5667",
					"13937"
				],
				[
					"l",
					"135",
					"14587"
				],
				[
					"l",
					"3722",
					"11775"
				],
				[
					"l",
					"0",
					"8615"
				],
				[
					"l",
					"4627",
					"7617"
				],
				[
					"l",
					"370",
					"2295"
				],
				[
					"l",
					"7312",
					"6320"
				],
				[
					"l",
					"8352",
					"2295"
				],
				["c"]
			]
		}]
	},
	irregularseal2: {
		adj: [],
		gd: [
			["x2", "*/ w 9722 21600"],
			["x5", "*/ w 5372 21600"],
			["x16", "*/ w 11612 21600"],
			["x19", "*/ w 14640 21600"],
			["y2", "*/ h 1887 21600"],
			["y3", "*/ h 6382 21600"],
			["y8", "*/ h 12877 21600"],
			["y14", "*/ h 19712 21600"],
			["y16", "*/ h 18842 21600"],
			["y17", "*/ h 15935 21600"],
			["y24", "*/ h 6645 21600"]
		],
		paths: [{
			w: 21600,
			h: 21600,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"11462",
					"4342"
				],
				[
					"l",
					"14790",
					"0"
				],
				[
					"l",
					"14525",
					"5777"
				],
				[
					"l",
					"18007",
					"3172"
				],
				[
					"l",
					"16380",
					"6532"
				],
				[
					"l",
					"21600",
					"6645"
				],
				[
					"l",
					"16985",
					"9402"
				],
				[
					"l",
					"18270",
					"11290"
				],
				[
					"l",
					"16380",
					"12310"
				],
				[
					"l",
					"18877",
					"15632"
				],
				[
					"l",
					"14640",
					"14350"
				],
				[
					"l",
					"14942",
					"17370"
				],
				[
					"l",
					"12180",
					"15935"
				],
				[
					"l",
					"11612",
					"18842"
				],
				[
					"l",
					"9872",
					"17370"
				],
				[
					"l",
					"8700",
					"19712"
				],
				[
					"l",
					"7527",
					"18125"
				],
				[
					"l",
					"4917",
					"21600"
				],
				[
					"l",
					"4805",
					"18240"
				],
				[
					"l",
					"1285",
					"17825"
				],
				[
					"l",
					"3330",
					"15370"
				],
				[
					"l",
					"0",
					"12877"
				],
				[
					"l",
					"3935",
					"11592"
				],
				[
					"l",
					"1172",
					"8270"
				],
				[
					"l",
					"5372",
					"7817"
				],
				[
					"l",
					"4502",
					"3625"
				],
				[
					"l",
					"8550",
					"6382"
				],
				[
					"l",
					"9722",
					"1887"
				],
				["c"]
			]
		}]
	},
	leftarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 100000 w ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dx2", "*/ ss a2 100000"],
			["x2", "+- l dx2 0"],
			["dy1", "*/ h a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["dx1", "*/ y1 dx2 hd2"],
			["x1", "+- x2  0 dx1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"b"
				],
				["c"]
			]
		}]
	},
	leftarrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 64977"]
		],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 100000 w ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss w"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dy1", "*/ ss a2 100000"],
			["dy2", "*/ ss a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y4", "+- vc dy1 0"],
			["x1", "*/ ss a3 100000"],
			["dx2", "*/ w a4 100000"],
			["x2", "+- r 0 dx2"],
			["x3", "+/ x2 r 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x1",
					"y4"
				],
				["c"]
			]
		}]
	},
	leftbrace: {
		adj: [["adj1", "val 8333"], ["adj2", "val 50000"]],
		gd: [
			["a2", "pin 0 adj2 100000"],
			["q1", "+- 100000 0 a2"],
			["q2", "min q1 a2"],
			["q3", "*/ q2 1 2"],
			["maxAdj1", "*/ q3 h ss"],
			["a1", "pin 0 adj1 maxAdj1"],
			["y1", "*/ ss a1 100000"],
			["y3", "*/ h a2 100000"],
			["y4", "+- y3 y1 0"],
			["dx1", "cos wd2 2700000"],
			["dy1", "sin y1 2700000"],
			["il", "+- r 0 dx1"],
			["it", "+- y1 0 dy1"],
			["ib", "+- b dy1 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"r",
					"b"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"hc",
					"y4"
				],
				[
					"a",
					"wd2",
					"y1",
					"0",
					"-5400000"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd4",
					"-5400000"
				],
				[
					"l",
					"hc",
					"y1"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd2",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"r",
					"b"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"hc",
					"y4"
				],
				[
					"a",
					"wd2",
					"y1",
					"0",
					"-5400000"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd4",
					"-5400000"
				],
				[
					"l",
					"hc",
					"y1"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd2",
					"cd4"
				]
			]
		}]
	},
	leftbracket: {
		adj: [["adj", "val 8333"]],
		gd: [
			["maxAdj", "*/ 50000 h ss"],
			["a", "pin 0 adj maxAdj"],
			["y1", "*/ ss a 100000"],
			["y2", "+- b 0 y1"],
			["dx1", "cos w 2700000"],
			["dy1", "sin y1 2700000"],
			["il", "+- r 0 dx1"],
			["it", "+- y1 0 dy1"],
			["ib", "+- b dy1 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"r",
					"b"
				],
				[
					"a",
					"w",
					"y1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"y1"
				],
				[
					"a",
					"w",
					"y1",
					"cd2",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"r",
					"b"
				],
				[
					"a",
					"w",
					"y1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"y1"
				],
				[
					"a",
					"w",
					"y1",
					"cd2",
					"cd4"
				]
			]
		}]
	},
	leftcirculararrow: {
		adj: [
			["adj1", "val 12500"],
			["adj2", "val -1142319"],
			["adj3", "val 1142319"],
			["adj4", "val 10800000"],
			["adj5", "val 12500"]
		],
		gd: [
			["a5", "pin 0 adj5 25000"],
			["maxAdj1", "*/ a5 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["enAng", "pin 1 adj3 21599999"],
			["stAng", "pin 0 adj4 21599999"],
			["th", "*/ ss a1 100000"],
			["thh", "*/ ss a5 100000"],
			["th2", "*/ th 1 2"],
			["rw1", "+- wd2 th2 thh"],
			["rh1", "+- hd2 th2 thh"],
			["rw2", "+- rw1 0 th"],
			["rh2", "+- rh1 0 th"],
			["rw3", "+- rw2 th2 0"],
			["rh3", "+- rh2 th2 0"],
			["wtH", "sin rw3 enAng"],
			["htH", "cos rh3 enAng"],
			["dxH", "cat2 rw3 htH wtH"],
			["dyH", "sat2 rh3 htH wtH"],
			["xH", "+- hc dxH 0"],
			["yH", "+- vc dyH 0"],
			["rI", "min rw2 rh2"],
			["u1", "*/ dxH dxH 1"],
			["u2", "*/ dyH dyH 1"],
			["u3", "*/ rI rI 1"],
			["u4", "+- u1 0 u3"],
			["u5", "+- u2 0 u3"],
			["u6", "*/ u4 u5 u1"],
			["u7", "*/ u6 1 u2"],
			["u8", "+- 1 0 u7"],
			["u9", "sqrt u8"],
			["u10", "*/ u4 1 dxH"],
			["u11", "*/ u10 1 dyH"],
			["u12", "+/ 1 u9 u11"],
			["u13", "at2 1 u12"],
			["u14", "+- u13 21600000 0"],
			["u15", "?: u13 u13 u14"],
			["u16", "+- u15 0 enAng"],
			["u17", "+- u16 21600000 0"],
			["u18", "?: u16 u16 u17"],
			["u19", "+- u18 0 cd2"],
			["u20", "+- u18 0 21600000"],
			["u21", "?: u19 u20 u18"],
			["u22", "abs u21"],
			["minAng", "*/ u22 -1 1"],
			["u23", "abs adj2"],
			["a2", "*/ u23 -1 1"],
			["aAng", "pin minAng a2 0"],
			["ptAng", "+- enAng aAng 0"],
			["wtA", "sin rw3 ptAng"],
			["htA", "cos rh3 ptAng"],
			["dxA", "cat2 rw3 htA wtA"],
			["dyA", "sat2 rh3 htA wtA"],
			["xA", "+- hc dxA 0"],
			["yA", "+- vc dyA 0"],
			["wtE", "sin rw1 stAng"],
			["htE", "cos rh1 stAng"],
			["dxE", "cat2 rw1 htE wtE"],
			["dyE", "sat2 rh1 htE wtE"],
			["xE", "+- hc dxE 0"],
			["yE", "+- vc dyE 0"],
			["wtD", "sin rw2 stAng"],
			["htD", "cos rh2 stAng"],
			["dxD", "cat2 rw2 htD wtD"],
			["dyD", "sat2 rh2 htD wtD"],
			["xD", "+- hc dxD 0"],
			["yD", "+- vc dyD 0"],
			["dxG", "cos thh ptAng"],
			["dyG", "sin thh ptAng"],
			["xG", "+- xH dxG 0"],
			["yG", "+- yH dyG 0"],
			["dxB", "cos thh ptAng"],
			["dyB", "sin thh ptAng"],
			["xB", "+- xH 0 dxB 0"],
			["yB", "+- yH 0 dyB 0"],
			["sx1", "+- xB 0 hc"],
			["sy1", "+- yB 0 vc"],
			["sx2", "+- xG 0 hc"],
			["sy2", "+- yG 0 vc"],
			["rO", "min rw1 rh1"],
			["x1O", "*/ sx1 rO rw1"],
			["y1O", "*/ sy1 rO rh1"],
			["x2O", "*/ sx2 rO rw1"],
			["y2O", "*/ sy2 rO rh1"],
			["dxO", "+- x2O 0 x1O"],
			["dyO", "+- y2O 0 y1O"],
			["dO", "mod dxO dyO 0"],
			["q1", "*/ x1O y2O 1"],
			["q2", "*/ x2O y1O 1"],
			["DO", "+- q1 0 q2"],
			["q3", "*/ rO rO 1"],
			["q4", "*/ dO dO 1"],
			["q5", "*/ q3 q4 1"],
			["q6", "*/ DO DO 1"],
			["q7", "+- q5 0 q6"],
			["q8", "max q7 0"],
			["sdelO", "sqrt q8"],
			["ndyO", "*/ dyO -1 1"],
			["sdyO", "?: ndyO -1 1"],
			["q9", "*/ sdyO dxO 1"],
			["q10", "*/ q9 sdelO 1"],
			["q11", "*/ DO dyO 1"],
			["dxF1", "+/ q11 q10 q4"],
			["q12", "+- q11 0 q10"],
			["dxF2", "*/ q12 1 q4"],
			["adyO", "abs dyO"],
			["q13", "*/ adyO sdelO 1"],
			["q14", "*/ DO dxO -1"],
			["dyF1", "+/ q14 q13 q4"],
			["q15", "+- q14 0 q13"],
			["dyF2", "*/ q15 1 q4"],
			["q16", "+- x2O 0 dxF1"],
			["q17", "+- x2O 0 dxF2"],
			["q18", "+- y2O 0 dyF1"],
			["q19", "+- y2O 0 dyF2"],
			["q20", "mod q16 q18 0"],
			["q21", "mod q17 q19 0"],
			["q22", "+- q21 0 q20"],
			["dxF", "?: q22 dxF1 dxF2"],
			["dyF", "?: q22 dyF1 dyF2"],
			["sdxF", "*/ dxF rw1 rO"],
			["sdyF", "*/ dyF rh1 rO"],
			["xF", "+- hc sdxF 0"],
			["yF", "+- vc sdyF 0"],
			["x1I", "*/ sx1 rI rw2"],
			["y1I", "*/ sy1 rI rh2"],
			["x2I", "*/ sx2 rI rw2"],
			["y2I", "*/ sy2 rI rh2"],
			["dxI", "+- x2I 0 x1I"],
			["dyI", "+- y2I 0 y1I"],
			["dI", "mod dxI dyI 0"],
			["v1", "*/ x1I y2I 1"],
			["v2", "*/ x2I y1I 1"],
			["DI", "+- v1 0 v2"],
			["v3", "*/ rI rI 1"],
			["v4", "*/ dI dI 1"],
			["v5", "*/ v3 v4 1"],
			["v6", "*/ DI DI 1"],
			["v7", "+- v5 0 v6"],
			["v8", "max v7 0"],
			["sdelI", "sqrt v8"],
			["v9", "*/ sdyO dxI 1"],
			["v10", "*/ v9 sdelI 1"],
			["v11", "*/ DI dyI 1"],
			["dxC1", "+/ v11 v10 v4"],
			["v12", "+- v11 0 v10"],
			["dxC2", "*/ v12 1 v4"],
			["adyI", "abs dyI"],
			["v13", "*/ adyI sdelI 1"],
			["v14", "*/ DI dxI -1"],
			["dyC1", "+/ v14 v13 v4"],
			["v15", "+- v14 0 v13"],
			["dyC2", "*/ v15 1 v4"],
			["v16", "+- x1I 0 dxC1"],
			["v17", "+- x1I 0 dxC2"],
			["v18", "+- y1I 0 dyC1"],
			["v19", "+- y1I 0 dyC2"],
			["v20", "mod v16 v18 0"],
			["v21", "mod v17 v19 0"],
			["v22", "+- v21 0 v20"],
			["dxC", "?: v22 dxC1 dxC2"],
			["dyC", "?: v22 dyC1 dyC2"],
			["sdxC", "*/ dxC rw2 rI"],
			["sdyC", "*/ dyC rh2 rI"],
			["xC", "+- hc sdxC 0"],
			["yC", "+- vc sdyC 0"],
			["ist0", "at2 sdxC sdyC"],
			["ist1", "+- ist0 21600000 0"],
			["istAng0", "?: ist0 ist0 ist1"],
			["isw1", "+- stAng 0 istAng0"],
			["isw2", "+- isw1 21600000 0"],
			["iswAng0", "?: isw1 isw1 isw2"],
			["istAng", "+- istAng0 iswAng0 0"],
			["iswAng", "+- 0 0 iswAng0"],
			["p1", "+- xF 0 xC"],
			["p2", "+- yF 0 yC"],
			["p3", "mod p1 p2 0"],
			["p4", "*/ p3 1 2"],
			["p5", "+- p4 0 thh"],
			["xGp", "?: p5 xF xG"],
			["yGp", "?: p5 yF yG"],
			["xBp", "?: p5 xC xB"],
			["yBp", "?: p5 yC yB"],
			["en0", "at2 sdxF sdyF"],
			["en1", "+- en0 21600000 0"],
			["en2", "?: en0 en0 en1"],
			["sw0", "+- en2 0 stAng"],
			["sw1", "+- sw0 0 21600000"],
			["swAng", "?: sw0 sw1 sw0"],
			["stAng0", "+- stAng swAng 0"],
			["swAng0", "+- 0 0 swAng"],
			["wtI", "sin rw3 stAng"],
			["htI", "cos rh3 stAng"],
			["dxI", "cat2 rw3 htI wtI"],
			["dyI", "sat2 rh3 htI wtI"],
			["xI", "+- hc dxI 0"],
			["yI", "+- vc dyI 0"],
			["aI", "+- stAng cd4 0"],
			["aA", "+- ptAng 0 cd4"],
			["aB", "+- ptAng cd2 0"],
			["idx", "cos rw1 2700000"],
			["idy", "sin rh1 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xE",
					"yE"
				],
				[
					"l",
					"xD",
					"yD"
				],
				[
					"a",
					"rw2",
					"rh2",
					"istAng",
					"iswAng"
				],
				[
					"l",
					"xBp",
					"yBp"
				],
				[
					"l",
					"xA",
					"yA"
				],
				[
					"l",
					"xGp",
					"yGp"
				],
				[
					"l",
					"xF",
					"yF"
				],
				[
					"a",
					"rw1",
					"rh1",
					"stAng0",
					"swAng0"
				],
				["c"]
			]
		}]
	},
	leftrightarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["x2", "*/ ss a2 100000"],
			["x3", "+- r 0 x2"],
			["dy", "*/ h a1 200000"],
			["y1", "+- vc 0 dy"],
			["y2", "+- vc dy 0"],
			["dx1", "*/ y1 x2 hd2"],
			["x1", "+- x2 0 dx1"],
			["x4", "+- x3 dx1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x3",
					"b"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"b"
				],
				["c"]
			]
		}]
	},
	leftrightarrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 48123"]
		],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 50000 w ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss wd2"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dy1", "*/ ss a2 100000"],
			["dy2", "*/ ss a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y4", "+- vc dy1 0"],
			["x1", "*/ ss a3 100000"],
			["x4", "+- r 0 x1"],
			["dx2", "*/ w a4 200000"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x1",
					"y4"
				],
				["c"]
			]
		}]
	},
	leftrightcirculararrow: {
		adj: [
			["adj1", "val 12500"],
			["adj2", "val 1142319"],
			["adj3", "val 20457681"],
			["adj4", "val 11942319"],
			["adj5", "val 12500"]
		],
		gd: [
			["a5", "pin 0 adj5 25000"],
			["maxAdj1", "*/ a5 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["enAng", "pin 1 adj3 21599999"],
			["stAng", "pin 0 adj4 21599999"],
			["th", "*/ ss a1 100000"],
			["thh", "*/ ss a5 100000"],
			["th2", "*/ th 1 2"],
			["rw1", "+- wd2 th2 thh"],
			["rh1", "+- hd2 th2 thh"],
			["rw2", "+- rw1 0 th"],
			["rh2", "+- rh1 0 th"],
			["rw3", "+- rw2 th2 0"],
			["rh3", "+- rh2 th2 0"],
			["wtH", "sin rw3 enAng"],
			["htH", "cos rh3 enAng"],
			["dxH", "cat2 rw3 htH wtH"],
			["dyH", "sat2 rh3 htH wtH"],
			["xH", "+- hc dxH 0"],
			["yH", "+- vc dyH 0"],
			["rI", "min rw2 rh2"],
			["u1", "*/ dxH dxH 1"],
			["u2", "*/ dyH dyH 1"],
			["u3", "*/ rI rI 1"],
			["u4", "+- u1 0 u3"],
			["u5", "+- u2 0 u3"],
			["u6", "*/ u4 u5 u1"],
			["u7", "*/ u6 1 u2"],
			["u8", "+- 1 0 u7"],
			["u9", "sqrt u8"],
			["u10", "*/ u4 1 dxH"],
			["u11", "*/ u10 1 dyH"],
			["u12", "+/ 1 u9 u11"],
			["u13", "at2 1 u12"],
			["u14", "+- u13 21600000 0"],
			["u15", "?: u13 u13 u14"],
			["u16", "+- u15 0 enAng"],
			["u17", "+- u16 21600000 0"],
			["u18", "?: u16 u16 u17"],
			["u19", "+- u18 0 cd2"],
			["u20", "+- u18 0 21600000"],
			["u21", "?: u19 u20 u18"],
			["maxAng", "abs u21"],
			["aAng", "pin 0 adj2 maxAng"],
			["ptAng", "+- enAng aAng 0"],
			["wtA", "sin rw3 ptAng"],
			["htA", "cos rh3 ptAng"],
			["dxA", "cat2 rw3 htA wtA"],
			["dyA", "sat2 rh3 htA wtA"],
			["xA", "+- hc dxA 0"],
			["yA", "+- vc dyA 0"],
			["dxG", "cos thh ptAng"],
			["dyG", "sin thh ptAng"],
			["xG", "+- xH dxG 0"],
			["yG", "+- yH dyG 0"],
			["dxB", "cos thh ptAng"],
			["dyB", "sin thh ptAng"],
			["xB", "+- xH 0 dxB 0"],
			["yB", "+- yH 0 dyB 0"],
			["sx1", "+- xB 0 hc"],
			["sy1", "+- yB 0 vc"],
			["sx2", "+- xG 0 hc"],
			["sy2", "+- yG 0 vc"],
			["rO", "min rw1 rh1"],
			["x1O", "*/ sx1 rO rw1"],
			["y1O", "*/ sy1 rO rh1"],
			["x2O", "*/ sx2 rO rw1"],
			["y2O", "*/ sy2 rO rh1"],
			["dxO", "+- x2O 0 x1O"],
			["dyO", "+- y2O 0 y1O"],
			["dO", "mod dxO dyO 0"],
			["q1", "*/ x1O y2O 1"],
			["q2", "*/ x2O y1O 1"],
			["DO", "+- q1 0 q2"],
			["q3", "*/ rO rO 1"],
			["q4", "*/ dO dO 1"],
			["q5", "*/ q3 q4 1"],
			["q6", "*/ DO DO 1"],
			["q7", "+- q5 0 q6"],
			["q8", "max q7 0"],
			["sdelO", "sqrt q8"],
			["ndyO", "*/ dyO -1 1"],
			["sdyO", "?: ndyO -1 1"],
			["q9", "*/ sdyO dxO 1"],
			["q10", "*/ q9 sdelO 1"],
			["q11", "*/ DO dyO 1"],
			["dxF1", "+/ q11 q10 q4"],
			["q12", "+- q11 0 q10"],
			["dxF2", "*/ q12 1 q4"],
			["adyO", "abs dyO"],
			["q13", "*/ adyO sdelO 1"],
			["q14", "*/ DO dxO -1"],
			["dyF1", "+/ q14 q13 q4"],
			["q15", "+- q14 0 q13"],
			["dyF2", "*/ q15 1 q4"],
			["q16", "+- x2O 0 dxF1"],
			["q17", "+- x2O 0 dxF2"],
			["q18", "+- y2O 0 dyF1"],
			["q19", "+- y2O 0 dyF2"],
			["q20", "mod q16 q18 0"],
			["q21", "mod q17 q19 0"],
			["q22", "+- q21 0 q20"],
			["dxF", "?: q22 dxF1 dxF2"],
			["dyF", "?: q22 dyF1 dyF2"],
			["sdxF", "*/ dxF rw1 rO"],
			["sdyF", "*/ dyF rh1 rO"],
			["xF", "+- hc sdxF 0"],
			["yF", "+- vc sdyF 0"],
			["x1I", "*/ sx1 rI rw2"],
			["y1I", "*/ sy1 rI rh2"],
			["x2I", "*/ sx2 rI rw2"],
			["y2I", "*/ sy2 rI rh2"],
			["dxI", "+- x2I 0 x1I"],
			["dyI", "+- y2I 0 y1I"],
			["dI", "mod dxI dyI 0"],
			["v1", "*/ x1I y2I 1"],
			["v2", "*/ x2I y1I 1"],
			["DI", "+- v1 0 v2"],
			["v3", "*/ rI rI 1"],
			["v4", "*/ dI dI 1"],
			["v5", "*/ v3 v4 1"],
			["v6", "*/ DI DI 1"],
			["v7", "+- v5 0 v6"],
			["v8", "max v7 0"],
			["sdelI", "sqrt v8"],
			["v9", "*/ sdyO dxI 1"],
			["v10", "*/ v9 sdelI 1"],
			["v11", "*/ DI dyI 1"],
			["dxC1", "+/ v11 v10 v4"],
			["v12", "+- v11 0 v10"],
			["dxC2", "*/ v12 1 v4"],
			["adyI", "abs dyI"],
			["v13", "*/ adyI sdelI 1"],
			["v14", "*/ DI dxI -1"],
			["dyC1", "+/ v14 v13 v4"],
			["v15", "+- v14 0 v13"],
			["dyC2", "*/ v15 1 v4"],
			["v16", "+- x1I 0 dxC1"],
			["v17", "+- x1I 0 dxC2"],
			["v18", "+- y1I 0 dyC1"],
			["v19", "+- y1I 0 dyC2"],
			["v20", "mod v16 v18 0"],
			["v21", "mod v17 v19 0"],
			["v22", "+- v21 0 v20"],
			["dxC", "?: v22 dxC1 dxC2"],
			["dyC", "?: v22 dyC1 dyC2"],
			["sdxC", "*/ dxC rw2 rI"],
			["sdyC", "*/ dyC rh2 rI"],
			["xC", "+- hc sdxC 0"],
			["yC", "+- vc sdyC 0"],
			["wtI", "sin rw3 stAng"],
			["htI", "cos rh3 stAng"],
			["dxI", "cat2 rw3 htI wtI"],
			["dyI", "sat2 rh3 htI wtI"],
			["xI", "+- hc dxI 0"],
			["yI", "+- vc dyI 0"],
			["lptAng", "+- stAng 0 aAng"],
			["wtL", "sin rw3 lptAng"],
			["htL", "cos rh3 lptAng"],
			["dxL", "cat2 rw3 htL wtL"],
			["dyL", "sat2 rh3 htL wtL"],
			["xL", "+- hc dxL 0"],
			["yL", "+- vc dyL 0"],
			["dxK", "cos thh lptAng"],
			["dyK", "sin thh lptAng"],
			["xK", "+- xI dxK 0"],
			["yK", "+- yI dyK 0"],
			["dxJ", "cos thh lptAng"],
			["dyJ", "sin thh lptAng"],
			["xJ", "+- xI 0 dxJ 0"],
			["yJ", "+- yI 0 dyJ 0"],
			["p1", "+- xF 0 xC"],
			["p2", "+- yF 0 yC"],
			["p3", "mod p1 p2 0"],
			["p4", "*/ p3 1 2"],
			["p5", "+- p4 0 thh"],
			["xGp", "?: p5 xF xG"],
			["yGp", "?: p5 yF yG"],
			["xBp", "?: p5 xC xB"],
			["yBp", "?: p5 yC yB"],
			["en0", "at2 sdxF sdyF"],
			["en1", "+- en0 21600000 0"],
			["en2", "?: en0 en0 en1"],
			["od0", "+- en2 0 enAng"],
			["od1", "+- od0 21600000 0"],
			["od2", "?: od0 od0 od1"],
			["st0", "+- stAng 0 od2"],
			["st1", "+- st0 21600000 0"],
			["st2", "?: st0 st0 st1"],
			["sw0", "+- en2 0 st2"],
			["sw1", "+- sw0 21600000 0"],
			["swAng", "?: sw0 sw0 sw1"],
			["ist0", "at2 sdxC sdyC"],
			["ist1", "+- ist0 21600000 0"],
			["istAng", "?: ist0 ist0 ist1"],
			["id0", "+- istAng 0 enAng"],
			["id1", "+- id0 0 21600000"],
			["id2", "?: id0 id1 id0"],
			["ien0", "+- stAng 0 id2"],
			["ien1", "+- ien0 0 21600000"],
			["ien2", "?: ien1 ien1 ien0"],
			["isw1", "+- ien2 0 istAng"],
			["isw2", "+- isw1 0 21600000"],
			["iswAng", "?: isw1 isw2 isw1"],
			["wtE", "sin rw1 st2"],
			["htE", "cos rh1 st2"],
			["dxE", "cat2 rw1 htE wtE"],
			["dyE", "sat2 rh1 htE wtE"],
			["xE", "+- hc dxE 0"],
			["yE", "+- vc dyE 0"],
			["wtD", "sin rw2 ien2"],
			["htD", "cos rh2 ien2"],
			["dxD", "cat2 rw2 htD wtD"],
			["dyD", "sat2 rh2 htD wtD"],
			["xD", "+- hc dxD 0"],
			["yD", "+- vc dyD 0"],
			["xKp", "?: p5 xE xK"],
			["yKp", "?: p5 yE yK"],
			["xJp", "?: p5 xD xJ"],
			["yJp", "?: p5 yD yJ"],
			["aL", "+- lptAng 0 cd4"],
			["aA", "+- ptAng cd4 0"],
			["aB", "+- ptAng cd2 0"],
			["aJ", "+- lptAng cd2 0"],
			["idx", "cos rw1 2700000"],
			["idy", "sin rh1 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xL",
					"yL"
				],
				[
					"l",
					"xKp",
					"yKp"
				],
				[
					"l",
					"xE",
					"yE"
				],
				[
					"a",
					"rw1",
					"rh1",
					"st2",
					"swAng"
				],
				[
					"l",
					"xGp",
					"yGp"
				],
				[
					"l",
					"xA",
					"yA"
				],
				[
					"l",
					"xBp",
					"yBp"
				],
				[
					"l",
					"xC",
					"yC"
				],
				[
					"a",
					"rw2",
					"rh2",
					"istAng",
					"iswAng"
				],
				[
					"l",
					"xJp",
					"yJp"
				],
				["c"]
			]
		}]
	},
	leftrightribbon: {
		adj: [
			["adj1", "val 50000"],
			["adj2", "val 50000"],
			["adj3", "val 16667"]
		],
		gd: [
			["a3", "pin 0 adj3 33333"],
			["maxAdj1", "+- 100000 0 a3"],
			["a1", "pin 0 adj1 maxAdj1"],
			["w1", "+- wd2 0 wd32"],
			["maxAdj2", "*/ 100000 w1 ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["x1", "*/ ss a2 100000"],
			["x4", "+- r 0 x1"],
			["dy1", "*/ h a1 200000"],
			["dy2", "*/ h a3 -200000"],
			["ly1", "+- vc dy2 dy1"],
			["ry4", "+- vc dy1 dy2"],
			["ly2", "+- ly1 dy1 0"],
			["ry3", "+- b 0 ly2"],
			["ly4", "*/ ly2 2 1"],
			["ry1", "+- b 0 ly4"],
			["ly3", "+- ly4 0 ly1"],
			["ry2", "+- b 0 ly3"],
			["hR", "*/ a3 ss 400000"],
			["x2", "+- hc 0 wd32"],
			["x3", "+- hc wd32 0"],
			["y1", "+- ly1 hR 0"],
			["y2", "+- ry2 0 hR"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"ly2"
					],
					[
						"l",
						"x1",
						"t"
					],
					[
						"l",
						"x1",
						"ly1"
					],
					[
						"l",
						"hc",
						"ly1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x4",
						"ry2"
					],
					[
						"l",
						"x4",
						"ry1"
					],
					[
						"l",
						"r",
						"ry3"
					],
					[
						"l",
						"x4",
						"b"
					],
					[
						"l",
						"x4",
						"ry4"
					],
					[
						"l",
						"hc",
						"ry4"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd4"
					],
					[
						"l",
						"x2",
						"ly3"
					],
					[
						"l",
						"x1",
						"ly3"
					],
					[
						"l",
						"x1",
						"ly4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"cd4"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x3",
						"ry2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"ly2"
					],
					[
						"l",
						"x1",
						"t"
					],
					[
						"l",
						"x1",
						"ly1"
					],
					[
						"l",
						"hc",
						"ly1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x4",
						"ry2"
					],
					[
						"l",
						"x4",
						"ry1"
					],
					[
						"l",
						"r",
						"ry3"
					],
					[
						"l",
						"x4",
						"b"
					],
					[
						"l",
						"x4",
						"ry4"
					],
					[
						"l",
						"hc",
						"ry4"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd4"
					],
					[
						"l",
						"x2",
						"ly3"
					],
					[
						"l",
						"x1",
						"ly3"
					],
					[
						"l",
						"x1",
						"ly4"
					],
					["c"],
					[
						"m",
						"x3",
						"y1"
					],
					[
						"l",
						"x3",
						"ry2"
					],
					[
						"m",
						"x2",
						"y2"
					],
					[
						"l",
						"x2",
						"ly3"
					]
				]
			}
		]
	},
	leftrightuparrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"]
		],
		gd: [
			["a2", "pin 0 adj2 50000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["q1", "+- 100000 0 maxAdj1"],
			["maxAdj3", "*/ q1 1 2"],
			["a3", "pin 0 adj3 maxAdj3"],
			["x1", "*/ ss a3 100000"],
			["dx2", "*/ ss a2 100000"],
			["x2", "+- hc 0 dx2"],
			["x5", "+- hc dx2 0"],
			["dx3", "*/ ss a1 200000"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc dx3 0"],
			["x6", "+- r 0 x1"],
			["dy2", "*/ ss a2 50000"],
			["y2", "+- b 0 dy2"],
			["y4", "+- b 0 dx2"],
			["y3", "+- y4 0 dx3"],
			["y5", "+- y4 dx3 0"],
			["il", "*/ dx3 x1 dx2"],
			["ir", "+- r 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y4"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"x1"
				],
				[
					"l",
					"x2",
					"x1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x5",
					"x1"
				],
				[
					"l",
					"x4",
					"x1"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x6",
					"y3"
				],
				[
					"l",
					"x6",
					"y2"
				],
				[
					"l",
					"r",
					"y4"
				],
				[
					"l",
					"x6",
					"b"
				],
				[
					"l",
					"x6",
					"y5"
				],
				[
					"l",
					"x1",
					"y5"
				],
				[
					"l",
					"x1",
					"b"
				],
				["c"]
			]
		}]
	},
	leftuparrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"]
		],
		gd: [
			["a2", "pin 0 adj2 50000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "+- 100000 0 maxAdj1"],
			["a3", "pin 0 adj3 maxAdj3"],
			["x1", "*/ ss a3 100000"],
			["dx2", "*/ ss a2 50000"],
			["x2", "+- r 0 dx2"],
			["y2", "+- b 0 dx2"],
			["dx4", "*/ ss a2 100000"],
			["x4", "+- r 0 dx4"],
			["y4", "+- b 0 dx4"],
			["dx3", "*/ ss a1 200000"],
			["x3", "+- x4 0 dx3"],
			["x5", "+- x4 dx3 0"],
			["y3", "+- y4 0 dx3"],
			["y5", "+- y4 dx3 0"],
			["il", "*/ dx3 x1 dx4"],
			["cx1", "+/ x1 x5 2"],
			["cy1", "+/ x1 y5 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y4"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"x1"
				],
				[
					"l",
					"x2",
					"x1"
				],
				[
					"l",
					"x4",
					"t"
				],
				[
					"l",
					"r",
					"x1"
				],
				[
					"l",
					"x5",
					"x1"
				],
				[
					"l",
					"x5",
					"y5"
				],
				[
					"l",
					"x1",
					"y5"
				],
				[
					"l",
					"x1",
					"b"
				],
				["c"]
			]
		}]
	},
	lightningbolt: {
		adj: [],
		gd: [
			["x1", "*/ w 5022 21600"],
			["x3", "*/ w 8472 21600"],
			["x4", "*/ w 8757 21600"],
			["x5", "*/ w 10012 21600"],
			["x8", "*/ w 12860 21600"],
			["x9", "*/ w 13917 21600"],
			["x11", "*/ w 16577 21600"],
			["y1", "*/ h 3890 21600"],
			["y2", "*/ h 6080 21600"],
			["y4", "*/ h 7437 21600"],
			["y6", "*/ h 9705 21600"],
			["y7", "*/ h 12007 21600"],
			["y10", "*/ h 14277 21600"],
			["y11", "*/ h 14915 21600"]
		],
		paths: [{
			w: 21600,
			h: 21600,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"8472",
					"0"
				],
				[
					"l",
					"12860",
					"6080"
				],
				[
					"l",
					"11050",
					"6797"
				],
				[
					"l",
					"16577",
					"12007"
				],
				[
					"l",
					"14767",
					"12877"
				],
				[
					"l",
					"21600",
					"21600"
				],
				[
					"l",
					"10012",
					"14915"
				],
				[
					"l",
					"12222",
					"13987"
				],
				[
					"l",
					"5022",
					"9705"
				],
				[
					"l",
					"7602",
					"8382"
				],
				[
					"l",
					"0",
					"3890"
				],
				["c"]
			]
		}]
	},
	line: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	lineinv: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"t"
			]]
		}]
	},
	mathdivide: {
		adj: [
			["adj1", "val 23520"],
			["adj2", "val 5880"],
			["adj3", "val 11760"]
		],
		gd: [
			["a1", "pin 1000 adj1 36745"],
			["ma1", "+- 0 0 a1"],
			["ma3h", "+/ 73490 ma1 4"],
			["ma3w", "*/ 36745 w h"],
			["maxAdj3", "min ma3h ma3w"],
			["a3", "pin 1000 adj3 maxAdj3"],
			["m4a3", "*/ -4 a3 1"],
			["maxAdj2", "+- 73490 m4a3 a1"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dy1", "*/ h a1 200000"],
			["yg", "*/ h a2 100000"],
			["rad", "*/ h a3 100000"],
			["dx1", "*/ w 73490 200000"],
			["y3", "+- vc 0 dy1"],
			["y4", "+- vc dy1 0"],
			["a", "+- yg rad 0"],
			["y2", "+- y3 0 a"],
			["y1", "+- y2 0 rad"],
			["y5", "+- b 0 y1"],
			["x1", "+- hc 0 dx1"],
			["x3", "+- hc dx1 0"],
			["x2", "+- hc 0 rad"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"hc",
					"y1"
				],
				[
					"a",
					"rad",
					"rad",
					"3cd4",
					"21600000"
				],
				["c"],
				[
					"m",
					"hc",
					"y5"
				],
				[
					"a",
					"rad",
					"rad",
					"cd4",
					"21600000"
				],
				["c"],
				[
					"m",
					"x1",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x1",
					"y4"
				],
				["c"]
			]
		}]
	},
	mathequal: {
		adj: [["adj1", "val 23520"], ["adj2", "val 11760"]],
		gd: [
			["a1", "pin 0 adj1 36745"],
			["2a1", "*/ a1 2 1"],
			["mAdj2", "+- 100000 0 2a1"],
			["a2", "pin 0 adj2 mAdj2"],
			["dy1", "*/ h a1 100000"],
			["dy2", "*/ h a2 200000"],
			["dx1", "*/ w 73490 200000"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y1", "+- y2 0 dy1"],
			["y4", "+- y3 dy1 0"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["yC1", "+/ y1 y2 2"],
			["yC2", "+/ y3 y4 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"],
				[
					"m",
					"x1",
					"y3"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"x1",
					"y4"
				],
				["c"]
			]
		}]
	},
	mathminus: {
		adj: [["adj1", "val 23520"]],
		gd: [
			["a1", "pin 0 adj1 100000"],
			["dy1", "*/ h a1 200000"],
			["dx1", "*/ w 73490 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"]
			]
		}]
	},
	mathmultiply: {
		adj: [["adj1", "val 23520"]],
		gd: [
			["a1", "pin 0 adj1 51965"],
			["th", "*/ ss a1 100000"],
			["a", "at2 w h"],
			["sa", "sin 1 a"],
			["ca", "cos 1 a"],
			["ta", "tan 1 a"],
			["dl", "mod w h 0"],
			["rw", "*/ dl 51965 100000"],
			["lM", "+- dl 0 rw"],
			["xM", "*/ ca lM 2"],
			["yM", "*/ sa lM 2"],
			["dxAM", "*/ sa th 2"],
			["dyAM", "*/ ca th 2"],
			["xA", "+- xM 0 dxAM"],
			["yA", "+- yM dyAM 0"],
			["xB", "+- xM dxAM 0"],
			["yB", "+- yM 0 dyAM"],
			["xBC", "+- hc 0 xB"],
			["yBC", "*/ xBC ta 1"],
			["yC", "+- yBC yB 0"],
			["xD", "+- r 0 xB"],
			["xE", "+- r 0 xA"],
			["yFE", "+- vc 0 yA"],
			["xFE", "*/ yFE 1 ta"],
			["xF", "+- xE 0 xFE"],
			["xL", "+- xA xFE 0"],
			["yG", "+- b 0 yA"],
			["yH", "+- b 0 yB"],
			["yI", "+- b 0 yC"],
			["xC2", "+- r 0 xM"],
			["yC3", "+- b 0 yM"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xA",
					"yA"
				],
				[
					"l",
					"xB",
					"yB"
				],
				[
					"l",
					"hc",
					"yC"
				],
				[
					"l",
					"xD",
					"yB"
				],
				[
					"l",
					"xE",
					"yA"
				],
				[
					"l",
					"xF",
					"vc"
				],
				[
					"l",
					"xE",
					"yG"
				],
				[
					"l",
					"xD",
					"yH"
				],
				[
					"l",
					"hc",
					"yI"
				],
				[
					"l",
					"xB",
					"yH"
				],
				[
					"l",
					"xA",
					"yG"
				],
				[
					"l",
					"xL",
					"vc"
				],
				["c"]
			]
		}]
	},
	mathnotequal: {
		adj: [
			["adj1", "val 23520"],
			["adj2", "val 6600000"],
			["adj3", "val 11760"]
		],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["crAng", "pin 4200000 adj2 6600000"],
			["2a1", "*/ a1 2 1"],
			["maxAdj3", "+- 100000 0 2a1"],
			["a3", "pin 0 adj3 maxAdj3"],
			["dy1", "*/ h a1 100000"],
			["dy2", "*/ h a3 200000"],
			["dx1", "*/ w 73490 200000"],
			["x1", "+- hc 0 dx1"],
			["x8", "+- hc dx1 0"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y1", "+- y2 0 dy1"],
			["y4", "+- y3 dy1 0"],
			["cadj2", "+- crAng 0 cd4"],
			["xadj2", "tan hd2 cadj2"],
			["len", "mod xadj2 hd2 0"],
			["bhw", "*/ len dy1 hd2"],
			["bhw2", "*/ bhw 1 2"],
			["x7", "+- hc xadj2 bhw2"],
			["dx67", "*/ xadj2 y1 hd2"],
			["x6", "+- x7 0 dx67"],
			["dx57", "*/ xadj2 y2 hd2"],
			["x5", "+- x7 0 dx57"],
			["dx47", "*/ xadj2 y3 hd2"],
			["x4", "+- x7 0 dx47"],
			["dx37", "*/ xadj2 y4 hd2"],
			["x3", "+- x7 0 dx37"],
			["dx27", "*/ xadj2 2 1"],
			["x2", "+- x7 0 dx27"],
			["rx7", "+- x7 bhw 0"],
			["rx6", "+- x6 bhw 0"],
			["rx5", "+- x5 bhw 0"],
			["rx4", "+- x4 bhw 0"],
			["rx3", "+- x3 bhw 0"],
			["rx2", "+- x2 bhw 0"],
			["dx7", "*/ dy1 hd2 len"],
			["rxt", "+- x7 dx7 0"],
			["lxt", "+- rx7 0 dx7"],
			["rx", "?: cadj2 rxt rx7"],
			["lx", "?: cadj2 x7 lxt"],
			["dy3", "*/ dy1 xadj2 len"],
			["dy4", "+- 0 0 dy3"],
			["ry", "?: cadj2 dy3 t"],
			["ly", "?: cadj2 t dy4"],
			["dlx", "+- w 0 rx"],
			["drx", "+- w 0 lx"],
			["dly", "+- h 0 ry"],
			["dry", "+- h 0 ly"],
			["xC1", "+/ rx lx 2"],
			["xC2", "+/ drx dlx 2"],
			["yC1", "+/ ry ly 2"],
			["yC2", "+/ y1 y2 2"],
			["yC3", "+/ y3 y4 2"],
			["yC4", "+/ dry dly 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"x6",
					"y1"
				],
				[
					"l",
					"lx",
					"ly"
				],
				[
					"l",
					"rx",
					"ry"
				],
				[
					"l",
					"rx6",
					"y1"
				],
				[
					"l",
					"x8",
					"y1"
				],
				[
					"l",
					"x8",
					"y2"
				],
				[
					"l",
					"rx5",
					"y2"
				],
				[
					"l",
					"rx4",
					"y3"
				],
				[
					"l",
					"x8",
					"y3"
				],
				[
					"l",
					"x8",
					"y4"
				],
				[
					"l",
					"rx3",
					"y4"
				],
				[
					"l",
					"drx",
					"dry"
				],
				[
					"l",
					"dlx",
					"dly"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x5",
					"y2"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"]
			]
		}]
	},
	mathplus: {
		adj: [["adj1", "val 23520"]],
		gd: [
			["a1", "pin 0 adj1 73490"],
			["dx1", "*/ w 73490 200000"],
			["dy1", "*/ h 73490 200000"],
			["dx2", "*/ ss a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dx2"],
			["y3", "+- vc dx2 0"],
			["y4", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x1",
					"y3"
				],
				["c"]
			]
		}]
	},
	moon: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 0 adj 87500"],
			["g0", "*/ ss a 100000"],
			["g0w", "*/ g0 w ss"],
			["g1", "+- ss 0 g0"],
			["g2", "*/ g0 g0 g1"],
			["g3", "*/ ss ss g1"],
			["g4", "*/ g3 2 1"],
			["g5", "+- g4 0 g2"],
			["g6", "+- g5 0 g0"],
			["g6w", "*/ g6 w ss"],
			["g7", "*/ g5 1 2"],
			["g8", "+- g7 0 g0"],
			["dy1", "*/ g8 hd2 ss"],
			["g10h", "+- vc 0 dy1"],
			["g11h", "+- vc dy1 0"],
			["g12", "*/ g0 9598 32768"],
			["g12w", "*/ g12 w ss"],
			["g13", "+- ss 0 g12"],
			["q1", "*/ ss ss 1"],
			["q2", "*/ g13 g13 1"],
			["q3", "+- q1 0 q2"],
			["q4", "sqrt q3"],
			["dy4", "*/ q4 hd2 ss"],
			["g15h", "+- vc 0 dy4"],
			["g16h", "+- vc dy4 0"],
			["g17w", "+- g6w 0 g0w"],
			["g18w", "*/ g17w 1 2"],
			["dx2p", "+- g0w g18w w"],
			["dx2", "*/ dx2p -1 1"],
			["dy2", "*/ hd2 -1 1"],
			["stAng1", "at2 dx2 dy2"],
			["enAngp1", "at2 dx2 hd2"],
			["enAng1", "+- enAngp1 0 21600000"],
			["swAng1", "+- enAng1 0 stAng1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"r",
					"b"
				],
				[
					"a",
					"w",
					"hd2",
					"cd4",
					"cd2"
				],
				[
					"a",
					"g18w",
					"dy1",
					"stAng1",
					"swAng1"
				],
				["c"]
			]
		}]
	},
	nonisoscelestrapezoid: {
		adj: [["adj1", "val 25000"], ["adj2", "val 25000"]],
		gd: [
			["maxAdj", "*/ 50000 w ss"],
			["a1", "pin 0 adj1 maxAdj"],
			["a2", "pin 0 adj2 maxAdj"],
			["x1", "*/ ss a1 200000"],
			["x2", "*/ ss a1 100000"],
			["dx3", "*/ ss a2 100000"],
			["x3", "+- r 0 dx3"],
			["x4", "+/ r x3 2"],
			["il", "*/ wd3 a1 maxAdj"],
			["adjm", "max a1 a2"],
			["it", "*/ hd3 adjm maxAdj"],
			["irt", "*/ wd3 a2 maxAdj"],
			["ir", "+- r 0 irt"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	nosmoking: {
		adj: [["adj", "val 18750"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dr", "*/ ss a 100000"],
			["iwd2", "+- wd2 0 dr"],
			["ihd2", "+- hd2 0 dr"],
			["ang", "at2 w h"],
			["ct", "cos ihd2 ang"],
			["st", "sin iwd2 ang"],
			["m", "mod ct st 0"],
			["n", "*/ iwd2 ihd2 m"],
			["drd2", "*/ dr 1 2"],
			["dang", "at2 n drd2"],
			["dang2", "*/ dang 2 1"],
			["swAng", "+- -10800000 dang2 0"],
			["t3", "at2 w h"],
			["stAng1", "+- t3 0 dang"],
			["stAng2", "+- stAng1 0 cd2"],
			["ct1", "cos ihd2 stAng1"],
			["st1", "sin iwd2 stAng1"],
			["m1", "mod ct1 st1 0"],
			["n1", "*/ iwd2 ihd2 m1"],
			["dx1", "cos n1 stAng1"],
			["dy1", "sin n1 stAng1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["x2", "+- hc 0 dx1"],
			["y2", "+- vc 0 dy1"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"3cd4",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				["c"],
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"stAng1",
					"swAng"
				],
				["c"],
				[
					"m",
					"x2",
					"y2"
				],
				[
					"a",
					"iwd2",
					"ihd2",
					"stAng2",
					"swAng"
				],
				["c"]
			]
		}]
	},
	notchedrightarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 100000 w ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dx2", "*/ ss a2 100000"],
			["x2", "+- r 0 dx2"],
			["dy1", "*/ h a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["x1", "*/ dy1 dx2 hd2"],
			["x3", "+- r 0 x1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y1"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"l",
					"y2"
				],
				[
					"l",
					"x1",
					"vc"
				],
				["c"]
			]
		}]
	},
	octagon: {
		adj: [["adj", "val 29289"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"],
			["il", "*/ x1 1 2"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"x1"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"x1"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"l",
					"y2"
				],
				["c"]
			]
		}]
	},
	parallelogram: {
		adj: [["adj", "val 25000"]],
		gd: [
			["maxAdj", "*/ 100000 w ss"],
			["a", "pin 0 adj maxAdj"],
			["x1", "*/ ss a 200000"],
			["x2", "*/ ss a 100000"],
			["x6", "+- r 0 x1"],
			["x5", "+- r 0 x2"],
			["x3", "*/ x5 1 2"],
			["x4", "+- r 0 x3"],
			["il", "*/ wd2 a maxAdj"],
			["q1", "*/ 5 a maxAdj"],
			["q2", "+/ 1 q1 12"],
			["il", "*/ q2 w 1"],
			["it", "*/ q2 h 1"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 it"],
			["q3", "*/ h hc x2"],
			["y1", "pin 0 q3 h"],
			["y2", "+- b 0 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"x5",
					"b"
				],
				["c"]
			]
		}]
	},
	pentagon: {
		adj: [["hf", "val 105146"], ["vf", "val 110557"]],
		gd: [
			["swd2", "*/ wd2 hf 100000"],
			["shd2", "*/ hd2 vf 100000"],
			["svc", "*/ vc  vf 100000"],
			["dx1", "cos swd2 1080000"],
			["dx2", "cos swd2 18360000"],
			["dy1", "sin shd2 1080000"],
			["dy2", "sin shd2 18360000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "+- svc 0 dy1"],
			["y2", "+- svc 0 dy2"],
			["it", "*/ y1 dx2 dx1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				["c"]
			]
		}]
	},
	pie: {
		adj: [["adj1", "val 0"], ["adj2", "val 16200000"]],
		gd: [
			["stAng", "pin 0 adj1 21599999"],
			["enAng", "pin 0 adj2 21599999"],
			["sw1", "+- enAng 0 stAng"],
			["sw2", "+- sw1 21600000 0"],
			["swAng", "?: sw1 sw1 sw2"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt2", "sin wd2 enAng"],
			["ht2", "cos hd2 enAng"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd2",
					"stAng",
					"swAng"
				],
				[
					"l",
					"hc",
					"vc"
				],
				["c"]
			]
		}]
	},
	piewedge: {
		adj: [],
		gd: [
			["g1", "cos w 13500000"],
			["g2", "sin h 13500000"],
			["x1", "+- r g1 0"],
			["y1", "+- b g2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"a",
					"w",
					"h",
					"cd2",
					"cd4"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	plaque: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"],
			["il", "*/ x1 70711 100000"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"-5400000"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"-5400000"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"-5400000"
				],
				["c"]
			]
		}]
	},
	plaquetabs: {
		adj: [],
		gd: [
			["md", "mod w h 0"],
			["dx", "*/ 1 md 20"],
			["y1", "+- 0 b dx"],
			["x1", "+- 0 r dx"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"dx",
						"t"
					],
					[
						"a",
						"dx",
						"dx",
						"0",
						"cd4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"a",
						"dx",
						"dx",
						"3cd4",
						"cd4"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"dx"
					],
					[
						"a",
						"dx",
						"dx",
						"cd4",
						"cd4"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x1",
						"b"
					],
					[
						"a",
						"dx",
						"dx",
						"cd2",
						"cd4"
					],
					[
						"l",
						"r",
						"b"
					],
					["c"]
				]
			}
		]
	},
	plus: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"],
			["d", "+- w 0 h"],
			["il", "?: d l x1"],
			["ir", "?: d r x2"],
			["it", "?: d x1 t"],
			["ib", "?: d y2 b"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"x1"
				],
				[
					"l",
					"x1",
					"x1"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x2",
					"x1"
				],
				[
					"l",
					"r",
					"x1"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"l",
					"y2"
				],
				["c"]
			]
		}]
	},
	quadarrow: {
		adj: [
			["adj1", "val 22500"],
			["adj2", "val 22500"],
			["adj3", "val 22500"]
		],
		gd: [
			["a2", "pin 0 adj2 50000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["q1", "+- 100000 0 maxAdj1"],
			["maxAdj3", "*/ q1 1 2"],
			["a3", "pin 0 adj3 maxAdj3"],
			["x1", "*/ ss a3 100000"],
			["dx2", "*/ ss a2 100000"],
			["x2", "+- hc 0 dx2"],
			["x5", "+- hc dx2 0"],
			["dx3", "*/ ss a1 200000"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc dx3 0"],
			["x6", "+- r 0 x1"],
			["y2", "+- vc 0 dx2"],
			["y5", "+- vc dx2 0"],
			["y3", "+- vc 0 dx3"],
			["y4", "+- vc dx3 0"],
			["y6", "+- b 0 x1"],
			["il", "*/ dx3 x1 dx2"],
			["ir", "+- r 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"x1"
				],
				[
					"l",
					"x2",
					"x1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x5",
					"x1"
				],
				[
					"l",
					"x4",
					"x1"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"x6",
					"y3"
				],
				[
					"l",
					"x6",
					"y2"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x6",
					"y5"
				],
				[
					"l",
					"x6",
					"y4"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"x4",
					"y6"
				],
				[
					"l",
					"x5",
					"y6"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"x2",
					"y6"
				],
				[
					"l",
					"x3",
					"y6"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"x1",
					"y5"
				],
				["c"]
			]
		}]
	},
	quadarrowcallout: {
		adj: [
			["adj1", "val 18515"],
			["adj2", "val 18515"],
			["adj3", "val 18515"],
			["adj4", "val 48123"]
		],
		gd: [
			["a2", "pin 0 adj2 50000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "+- 50000 0 a2"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 2 1"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin a1 adj4 maxAdj4"],
			["dx2", "*/ ss a2 100000"],
			["dx3", "*/ ss a1 200000"],
			["ah", "*/ ss a3 100000"],
			["dx1", "*/ w a4 200000"],
			["dy1", "*/ h a4 200000"],
			["x8", "+- r 0 ah"],
			["x2", "+- hc 0 dx1"],
			["x7", "+- hc dx1 0"],
			["x3", "+- hc 0 dx2"],
			["x6", "+- hc dx2 0"],
			["x4", "+- hc 0 dx3"],
			["x5", "+- hc dx3 0"],
			["y8", "+- b 0 ah"],
			["y2", "+- vc 0 dy1"],
			["y7", "+- vc dy1 0"],
			["y3", "+- vc 0 dx2"],
			["y6", "+- vc dx2 0"],
			["y4", "+- vc 0 dx3"],
			["y5", "+- vc dx3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"ah",
					"y3"
				],
				[
					"l",
					"ah",
					"y4"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"x4",
					"ah"
				],
				[
					"l",
					"x3",
					"ah"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x6",
					"ah"
				],
				[
					"l",
					"x5",
					"ah"
				],
				[
					"l",
					"x5",
					"y2"
				],
				[
					"l",
					"x7",
					"y2"
				],
				[
					"l",
					"x7",
					"y4"
				],
				[
					"l",
					"x8",
					"y4"
				],
				[
					"l",
					"x8",
					"y3"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x8",
					"y6"
				],
				[
					"l",
					"x8",
					"y5"
				],
				[
					"l",
					"x7",
					"y5"
				],
				[
					"l",
					"x7",
					"y7"
				],
				[
					"l",
					"x5",
					"y7"
				],
				[
					"l",
					"x5",
					"y8"
				],
				[
					"l",
					"x6",
					"y8"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"x3",
					"y8"
				],
				[
					"l",
					"x4",
					"y8"
				],
				[
					"l",
					"x4",
					"y7"
				],
				[
					"l",
					"x2",
					"y7"
				],
				[
					"l",
					"x2",
					"y5"
				],
				[
					"l",
					"ah",
					"y5"
				],
				[
					"l",
					"ah",
					"y6"
				],
				["c"]
			]
		}]
	},
	ribbon: {
		adj: [["adj1", "val 16667"], ["adj2", "val 50000"]],
		gd: [
			["a1", "pin 0 adj1 33333"],
			["a2", "pin 25000 adj2 75000"],
			["x10", "+- r 0 wd8"],
			["dx2", "*/ w a2 200000"],
			["x2", "+- hc 0 dx2"],
			["x9", "+- hc dx2 0"],
			["x3", "+- x2 wd32 0"],
			["x8", "+- x9 0 wd32"],
			["x5", "+- x2 wd8 0"],
			["x6", "+- x9 0 wd8"],
			["x4", "+- x5 0 wd32"],
			["x7", "+- x6 wd32 0"],
			["y1", "*/ h a1 200000"],
			["y2", "*/ h a1 100000"],
			["y4", "+- b 0 y2"],
			["y3", "*/ y4 1 2"],
			["hR", "*/ h a1 400000"],
			["y5", "+- b 0 hR"],
			["y6", "+- y2 0 hR"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"x4",
						"t"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x8",
						"y2"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"x7",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd2"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"x10",
						"y3"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x9",
						"y4"
					],
					[
						"l",
						"x9",
						"y5"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"cd4"
					],
					[
						"l",
						"x3",
						"b"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd4"
					],
					[
						"l",
						"x2",
						"y4"
					],
					[
						"l",
						"l",
						"y4"
					],
					[
						"l",
						"wd8",
						"y3"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x5",
						"hR"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"cd4"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x5",
						"y2"
					],
					["c"],
					[
						"m",
						"x6",
						"hR"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd2",
						"-5400000"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x6",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"x4",
						"t"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x8",
						"y2"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"x7",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd2"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"x10",
						"y3"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x9",
						"y4"
					],
					[
						"l",
						"x9",
						"y5"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"cd4"
					],
					[
						"l",
						"x3",
						"b"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd4"
					],
					[
						"l",
						"x2",
						"y4"
					],
					[
						"l",
						"l",
						"y4"
					],
					[
						"l",
						"wd8",
						"y3"
					],
					["c"],
					[
						"m",
						"x5",
						"hR"
					],
					[
						"l",
						"x5",
						"y2"
					],
					[
						"m",
						"x6",
						"y2"
					],
					[
						"l",
						"x6",
						"hR"
					],
					[
						"m",
						"x2",
						"y4"
					],
					[
						"l",
						"x2",
						"y6"
					],
					[
						"m",
						"x9",
						"y6"
					],
					[
						"l",
						"x9",
						"y4"
					]
				]
			}
		]
	},
	ribbon2: {
		adj: [["adj1", "val 16667"], ["adj2", "val 50000"]],
		gd: [
			["a1", "pin 0 adj1 33333"],
			["a2", "pin 25000 adj2 75000"],
			["x10", "+- r 0 wd8"],
			["dx2", "*/ w a2 200000"],
			["x2", "+- hc 0 dx2"],
			["x9", "+- hc dx2 0"],
			["x3", "+- x2 wd32 0"],
			["x8", "+- x9 0 wd32"],
			["x5", "+- x2 wd8 0"],
			["x6", "+- x9 0 wd8"],
			["x4", "+- x5 0 wd32"],
			["x7", "+- x6 wd32 0"],
			["dy1", "*/ h a1 200000"],
			["y1", "+- b 0 dy1"],
			["dy2", "*/ h a1 100000"],
			["y2", "+- b 0 dy2"],
			["y4", "+- t dy2 0"],
			["y3", "+/ y4 b 2"],
			["hR", "*/ h a1 400000"],
			["y6", "+- b 0 hR"],
			["y7", "+- y1 0 hR"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"b"
					],
					[
						"l",
						"x4",
						"b"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd2"
					],
					[
						"l",
						"x8",
						"y2"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x7",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"x10",
						"y3"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x9",
						"y4"
					],
					[
						"l",
						"x9",
						"hR"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"-5400000"
					],
					[
						"l",
						"x3",
						"t"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-5400000"
					],
					[
						"l",
						"x2",
						"y4"
					],
					[
						"l",
						"l",
						"y4"
					],
					[
						"l",
						"wd8",
						"y3"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x5",
						"y6"
					],
					[
						"a",
						"wd32",
						"hR",
						"0",
						"-5400000"
					],
					[
						"l",
						"x3",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd2"
					],
					[
						"l",
						"x5",
						"y2"
					],
					["c"],
					[
						"m",
						"x6",
						"y6"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"x6",
						"y2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"b"
					],
					[
						"l",
						"wd8",
						"y3"
					],
					[
						"l",
						"l",
						"y4"
					],
					[
						"l",
						"x2",
						"y4"
					],
					[
						"l",
						"x2",
						"hR"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x8",
						"t"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd4"
					],
					[
						"l",
						"x9",
						"y4"
					],
					[
						"l",
						"x9",
						"y4"
					],
					[
						"l",
						"r",
						"y4"
					],
					[
						"l",
						"x10",
						"y3"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"x7",
						"b"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"cd2"
					],
					[
						"l",
						"x8",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"x3",
						"y2"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"-10800000"
					],
					[
						"l",
						"x4",
						"y1"
					],
					[
						"a",
						"wd32",
						"hR",
						"3cd4",
						"cd2"
					],
					["c"],
					[
						"m",
						"x5",
						"y2"
					],
					[
						"l",
						"x5",
						"y6"
					],
					[
						"m",
						"x6",
						"y6"
					],
					[
						"l",
						"x6",
						"y2"
					],
					[
						"m",
						"x2",
						"y7"
					],
					[
						"l",
						"x2",
						"y4"
					],
					[
						"m",
						"x9",
						"y4"
					],
					[
						"l",
						"x9",
						"y7"
					]
				]
			}
		]
	},
	rightarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 100000 w ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dx1", "*/ ss a2 100000"],
			["x1", "+- r 0 dx1"],
			["dy1", "*/ h a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["dx2", "*/ y1 dx1 hd2"],
			["x2", "+- x1 dx2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"l",
					"y2"
				],
				["c"]
			]
		}]
	},
	rightarrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 64977"]
		],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 100000 w ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss w"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dy1", "*/ ss a2 100000"],
			["dy2", "*/ ss a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y4", "+- vc dy1 0"],
			["dx3", "*/ ss a3 100000"],
			["x3", "+- r 0 dx3"],
			["x2", "*/ w a4 100000"],
			["x1", "*/ x2 1 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	rightbrace: {
		adj: [["adj1", "val 8333"], ["adj2", "val 50000"]],
		gd: [
			["a2", "pin 0 adj2 100000"],
			["q1", "+- 100000 0 a2"],
			["q2", "min q1 a2"],
			["q3", "*/ q2 1 2"],
			["maxAdj1", "*/ q3 h ss"],
			["a1", "pin 0 adj1 maxAdj1"],
			["y1", "*/ ss a1 100000"],
			["y3", "*/ h a2 100000"],
			["y2", "+- y3 0 y1"],
			["y4", "+- b 0 y1"],
			["dx1", "cos wd2 2700000"],
			["dy1", "sin y1 2700000"],
			["ir", "+- l dx1 0"],
			["it", "+- y1 0 dy1"],
			["ib", "+- b dy1 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"a",
					"wd2",
					"y1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"hc",
					"y2"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd2",
					"-5400000"
				],
				[
					"a",
					"wd2",
					"y1",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"hc",
					"y4"
				],
				[
					"a",
					"wd2",
					"y1",
					"0",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"a",
					"wd2",
					"y1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"hc",
					"y2"
				],
				[
					"a",
					"wd2",
					"y1",
					"cd2",
					"-5400000"
				],
				[
					"a",
					"wd2",
					"y1",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"hc",
					"y4"
				],
				[
					"a",
					"wd2",
					"y1",
					"0",
					"cd4"
				]
			]
		}]
	},
	rightbracket: {
		adj: [["adj", "val 8333"]],
		gd: [
			["maxAdj", "*/ 50000 h ss"],
			["a", "pin 0 adj maxAdj"],
			["y1", "*/ ss a 100000"],
			["y2", "+- b 0 y1"],
			["dx1", "cos w 2700000"],
			["dy1", "sin y1 2700000"],
			["ir", "+- l dx1 0"],
			["it", "+- y1 0 dy1"],
			["ib", "+- b dy1 y1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !1,
			extrusionOk: !1,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"a",
					"w",
					"y1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"w",
					"y1",
					"0",
					"cd4"
				],
				["c"]
			]
		}, {
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"a",
					"w",
					"y1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"w",
					"y1",
					"0",
					"cd4"
				]
			]
		}]
	},
	round1rect: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "*/ ss a 100000"],
			["x1", "+- r 0 dx1"],
			["idx", "*/ dx1 29289 100000"],
			["ir", "+- r 0 idx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"a",
					"dx1",
					"dx1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	round2diagrect: {
		adj: [["adj1", "val 16667"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["x1", "*/ ss a1 100000"],
			["y1", "+- b 0 x1"],
			["a", "*/ ss a2 100000"],
			["x2", "+- r 0 a"],
			["y2", "+- b 0 a"],
			["dx1", "*/ x1 29289 100000"],
			["dx2", "*/ a 29289 100000"],
			["d", "+- dx1 0 dx2"],
			["dx", "?: d dx1 dx2"],
			["ir", "+- r 0 dx"],
			["ib", "+- b 0 dx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"a",
					"a",
					"a",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				],
				[
					"l",
					"a",
					"b"
				],
				[
					"a",
					"a",
					"a",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				["c"]
			]
		}]
	},
	round2samerect: {
		adj: [["adj1", "val 16667"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["tx1", "*/ ss a1 100000"],
			["tx2", "+- r 0 tx1"],
			["bx1", "*/ ss a2 100000"],
			["bx2", "+- r 0 bx1"],
			["by1", "+- b 0 bx1"],
			["d", "+- tx1 0 bx1"],
			["tdx", "*/ tx1 29289 100000"],
			["bdx", "*/ bx1 29289 100000"],
			["il", "?: d tdx bdx"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 bdx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"tx1",
					"t"
				],
				[
					"l",
					"tx2",
					"t"
				],
				[
					"a",
					"tx1",
					"tx1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"by1"
				],
				[
					"a",
					"bx1",
					"bx1",
					"0",
					"cd4"
				],
				[
					"l",
					"bx1",
					"b"
				],
				[
					"a",
					"bx1",
					"bx1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"tx1"
				],
				[
					"a",
					"tx1",
					"tx1",
					"cd2",
					"cd4"
				],
				["c"]
			]
		}]
	},
	roundrect: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["x1", "*/ ss a 100000"],
			["x2", "+- r 0 x1"],
			["y2", "+- b 0 x1"],
			["il", "*/ x1 29289 100000"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"a",
					"x1",
					"x1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"a",
					"x1",
					"x1",
					"0",
					"cd4"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"a",
					"x1",
					"x1",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}]
	},
	rttriangle: {
		adj: [],
		gd: [
			["it", "*/ h 7 12"],
			["ir", "*/ w 7 12"],
			["ib", "*/ h 11 12"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"l",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	smileyface: {
		adj: [["adj", "val 4653"]],
		gd: [
			["a", "pin -4653 adj 4653"],
			["x1", "*/ w 4969 21699"],
			["x2", "*/ w 6215 21600"],
			["x3", "*/ w 13135 21600"],
			["x4", "*/ w 16640 21600"],
			["y1", "*/ h 7570 21600"],
			["y3", "*/ h 16515 21600"],
			["dy2", "*/ h a 100000"],
			["y2", "+- y3 0 dy2"],
			["y4", "+- y3 dy2 0"],
			["dy3", "*/ h a 50000"],
			["y5", "+- y4 dy3 0"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"],
			["wR", "*/ w 1125 21600"],
			["hR", "*/ h 1125 21600"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"21600000"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x2",
						"y1"
					],
					[
						"a",
						"wR",
						"hR",
						"cd2",
						"21600000"
					],
					[
						"m",
						"x3",
						"y1"
					],
					[
						"a",
						"wR",
						"hR",
						"cd2",
						"21600000"
					]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [[
					"m",
					"x1",
					"y2"
				], [
					"Q",
					"hc",
					"y5",
					"x4",
					"y2"
				]]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"vc"
					],
					[
						"a",
						"wd2",
						"hd2",
						"cd2",
						"21600000"
					],
					["c"]
				]
			}
		]
	},
	snip1rect: {
		adj: [["adj", "val 16667"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "*/ ss a 100000"],
			["x1", "+- r 0 dx1"],
			["it", "*/ dx1 1 2"],
			["ir", "+/ x1 r 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"r",
					"dx1"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	snip2diagrect: {
		adj: [["adj1", "val 0"], ["adj2", "val 16667"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["lx1", "*/ ss a1 100000"],
			["lx2", "+- r 0 lx1"],
			["ly1", "+- b 0 lx1"],
			["rx1", "*/ ss a2 100000"],
			["rx2", "+- r 0 rx1"],
			["ry1", "+- b 0 rx1"],
			["d", "+- lx1 0 rx1"],
			["dx", "?: d lx1 rx1"],
			["il", "*/ dx 1 2"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"lx1",
					"t"
				],
				[
					"l",
					"rx2",
					"t"
				],
				[
					"l",
					"r",
					"rx1"
				],
				[
					"l",
					"r",
					"ly1"
				],
				[
					"l",
					"lx2",
					"b"
				],
				[
					"l",
					"rx1",
					"b"
				],
				[
					"l",
					"l",
					"ry1"
				],
				[
					"l",
					"l",
					"lx1"
				],
				["c"]
			]
		}]
	},
	snip2samerect: {
		adj: [["adj1", "val 16667"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["tx1", "*/ ss a1 100000"],
			["tx2", "+- r 0 tx1"],
			["bx1", "*/ ss a2 100000"],
			["bx2", "+- r 0 bx1"],
			["by1", "+- b 0 bx1"],
			["d", "+- tx1 0 bx1"],
			["dx", "?: d tx1 bx1"],
			["il", "*/ dx 1 2"],
			["ir", "+- r 0 il"],
			["it", "*/ tx1 1 2"],
			["ib", "+/ by1 b 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"tx1",
					"t"
				],
				[
					"l",
					"tx2",
					"t"
				],
				[
					"l",
					"r",
					"tx1"
				],
				[
					"l",
					"r",
					"by1"
				],
				[
					"l",
					"bx2",
					"b"
				],
				[
					"l",
					"bx1",
					"b"
				],
				[
					"l",
					"l",
					"by1"
				],
				[
					"l",
					"l",
					"tx1"
				],
				["c"]
			]
		}]
	},
	sniproundrect: {
		adj: [["adj1", "val 16667"], ["adj2", "val 16667"]],
		gd: [
			["a1", "pin 0 adj1 50000"],
			["a2", "pin 0 adj2 50000"],
			["x1", "*/ ss a1 100000"],
			["dx2", "*/ ss a2 100000"],
			["x2", "+- r 0 dx2"],
			["il", "*/ x1 29289 100000"],
			["ir", "+/ x2 r 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"dx2"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				[
					"l",
					"l",
					"x1"
				],
				[
					"a",
					"x1",
					"x1",
					"cd2",
					"cd4"
				],
				["c"]
			]
		}]
	},
	squaretabs: {
		adj: [],
		gd: [
			["md", "mod w h 0"],
			["dx", "*/ 1 md 20"],
			["y1", "+- 0 b dx"],
			["x1", "+- 0 r dx"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"t"
					],
					[
						"l",
						"dx",
						"t"
					],
					[
						"l",
						"dx",
						"dx"
					],
					[
						"l",
						"l",
						"dx"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"l",
						"y1"
					],
					[
						"l",
						"dx",
						"y1"
					],
					[
						"l",
						"dx",
						"b"
					],
					[
						"l",
						"l",
						"b"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x1",
						"t"
					],
					[
						"l",
						"r",
						"t"
					],
					[
						"l",
						"r",
						"dx"
					],
					[
						"l",
						"x1",
						"dx"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [
					[
						"m",
						"x1",
						"y1"
					],
					[
						"l",
						"r",
						"y1"
					],
					[
						"l",
						"r",
						"b"
					],
					[
						"l",
						"x1",
						"b"
					],
					["c"]
				]
			}
		]
	},
	star10: {
		adj: [["adj", "val 42533"], ["hf", "val 105146"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["swd2", "*/ wd2 hf 100000"],
			["dx1", "*/ swd2 95106 100000"],
			["dx2", "*/ swd2 58779 100000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["dy1", "*/ hd2 80902 100000"],
			["dy2", "*/ hd2 30902 100000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"],
			["y4", "+- vc dy1 0"],
			["iwd2", "*/ swd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "*/ iwd2 80902 100000"],
			["sdx2", "*/ iwd2 30902 100000"],
			["sdy1", "*/ ihd2 95106 100000"],
			["sdy2", "*/ ihd2 58779 100000"],
			["sx1", "+- hc 0 iwd2"],
			["sx2", "+- hc 0 sdx1"],
			["sx3", "+- hc 0 sdx2"],
			["sx4", "+- hc sdx2 0"],
			["sx5", "+- hc sdx1 0"],
			["sx6", "+- hc iwd2 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc sdy2 0"],
			["sy4", "+- vc sdy1 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y2"
				],
				[
					"l",
					"sx2",
					"sy2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx4",
					"sy1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"sx5",
					"sy2"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"sx6",
					"vc"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"sx5",
					"sy3"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"sx4",
					"sy4"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx3",
					"sy4"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"sx2",
					"sy3"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"sx1",
					"vc"
				],
				["c"]
			]
		}]
	},
	star12: {
		adj: [["adj", "val 37500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "cos wd2 1800000"],
			["dy1", "sin hd2 3600000"],
			["x1", "+- hc 0 dx1"],
			["x3", "*/ w 3 4"],
			["x4", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["y3", "*/ h 3 4"],
			["y4", "+- vc dy1 0"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "cos iwd2 900000"],
			["sdx2", "cos iwd2 2700000"],
			["sdx3", "cos iwd2 4500000"],
			["sdy1", "sin ihd2 4500000"],
			["sdy2", "sin ihd2 2700000"],
			["sdy3", "sin ihd2 900000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc 0 sdx3"],
			["sx4", "+- hc sdx3 0"],
			["sx5", "+- hc sdx2 0"],
			["sx6", "+- hc sdx1 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc 0 sdy3"],
			["sy4", "+- vc sdy3 0"],
			["sy5", "+- vc sdy2 0"],
			["sy6", "+- vc sdy1 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy3"
				],
				[
					"l",
					"x1",
					"hd4"
				],
				[
					"l",
					"sx2",
					"sy2"
				],
				[
					"l",
					"wd4",
					"y1"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx4",
					"sy1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"sx5",
					"sy2"
				],
				[
					"l",
					"x4",
					"hd4"
				],
				[
					"l",
					"sx6",
					"sy3"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx6",
					"sy4"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"sx5",
					"sy5"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"sx4",
					"sy6"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx3",
					"sy6"
				],
				[
					"l",
					"wd4",
					"y4"
				],
				[
					"l",
					"sx2",
					"sy5"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"sx1",
					"sy4"
				],
				["c"]
			]
		}]
	},
	star16: {
		adj: [["adj", "val 37500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "*/ wd2 92388 100000"],
			["dx2", "*/ wd2 70711 100000"],
			["dx3", "*/ wd2 38268 100000"],
			["dy1", "*/ hd2 92388 100000"],
			["dy2", "*/ hd2 70711 100000"],
			["dy3", "*/ hd2 38268 100000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc dx3 0"],
			["x5", "+- hc dx2 0"],
			["x6", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc 0 dy3"],
			["y4", "+- vc dy3 0"],
			["y5", "+- vc dy2 0"],
			["y6", "+- vc dy1 0"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "*/ iwd2 98079 100000"],
			["sdx2", "*/ iwd2 83147 100000"],
			["sdx3", "*/ iwd2 55557 100000"],
			["sdx4", "*/ iwd2 19509 100000"],
			["sdy1", "*/ ihd2 98079 100000"],
			["sdy2", "*/ ihd2 83147 100000"],
			["sdy3", "*/ ihd2 55557 100000"],
			["sdy4", "*/ ihd2 19509 100000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc 0 sdx3"],
			["sx4", "+- hc 0 sdx4"],
			["sx5", "+- hc sdx4 0"],
			["sx6", "+- hc sdx3 0"],
			["sx7", "+- hc sdx2 0"],
			["sx8", "+- hc sdx1 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc 0 sdy3"],
			["sy4", "+- vc 0 sdy4"],
			["sy5", "+- vc sdy4 0"],
			["sy6", "+- vc sdy3 0"],
			["sy7", "+- vc sdy2 0"],
			["sy8", "+- vc sdy1 0"],
			["idx", "cos iwd2 2700000"],
			["idy", "sin ihd2 2700000"],
			["il", "+- hc 0 idx"],
			["it", "+- vc 0 idy"],
			["ir", "+- hc idx 0"],
			["ib", "+- vc idy 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy4"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"sx2",
					"sy3"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"sx3",
					"sy2"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"sx4",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx5",
					"sy1"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"sx6",
					"sy2"
				],
				[
					"l",
					"x5",
					"y2"
				],
				[
					"l",
					"sx7",
					"sy3"
				],
				[
					"l",
					"x6",
					"y3"
				],
				[
					"l",
					"sx8",
					"sy4"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx8",
					"sy5"
				],
				[
					"l",
					"x6",
					"y4"
				],
				[
					"l",
					"sx7",
					"sy6"
				],
				[
					"l",
					"x5",
					"y5"
				],
				[
					"l",
					"sx6",
					"sy7"
				],
				[
					"l",
					"x4",
					"y6"
				],
				[
					"l",
					"sx5",
					"sy8"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx4",
					"sy8"
				],
				[
					"l",
					"x3",
					"y6"
				],
				[
					"l",
					"sx3",
					"sy7"
				],
				[
					"l",
					"x2",
					"y5"
				],
				[
					"l",
					"sx2",
					"sy6"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"sx1",
					"sy5"
				],
				["c"]
			]
		}]
	},
	star24: {
		adj: [["adj", "val 37500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "cos wd2 900000"],
			["dx2", "cos wd2 1800000"],
			["dx3", "cos wd2 2700000"],
			["dx4", "val wd4"],
			["dx5", "cos wd2 4500000"],
			["dy1", "sin hd2 4500000"],
			["dy2", "sin hd2 3600000"],
			["dy3", "sin hd2 2700000"],
			["dy4", "val hd4"],
			["dy5", "sin hd2 900000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc 0 dx4"],
			["x5", "+- hc 0 dx5"],
			["x6", "+- hc dx5 0"],
			["x7", "+- hc dx4 0"],
			["x8", "+- hc dx3 0"],
			["x9", "+- hc dx2 0"],
			["x10", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc 0 dy3"],
			["y4", "+- vc 0 dy4"],
			["y5", "+- vc 0 dy5"],
			["y6", "+- vc dy5 0"],
			["y7", "+- vc dy4 0"],
			["y8", "+- vc dy3 0"],
			["y9", "+- vc dy2 0"],
			["y10", "+- vc dy1 0"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "*/ iwd2 99144 100000"],
			["sdx2", "*/ iwd2 92388 100000"],
			["sdx3", "*/ iwd2 79335 100000"],
			["sdx4", "*/ iwd2 60876 100000"],
			["sdx5", "*/ iwd2 38268 100000"],
			["sdx6", "*/ iwd2 13053 100000"],
			["sdy1", "*/ ihd2 99144 100000"],
			["sdy2", "*/ ihd2 92388 100000"],
			["sdy3", "*/ ihd2 79335 100000"],
			["sdy4", "*/ ihd2 60876 100000"],
			["sdy5", "*/ ihd2 38268 100000"],
			["sdy6", "*/ ihd2 13053 100000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc 0 sdx3"],
			["sx4", "+- hc 0 sdx4"],
			["sx5", "+- hc 0 sdx5"],
			["sx6", "+- hc 0 sdx6"],
			["sx7", "+- hc sdx6 0"],
			["sx8", "+- hc sdx5 0"],
			["sx9", "+- hc sdx4 0"],
			["sx10", "+- hc sdx3 0"],
			["sx11", "+- hc sdx2 0"],
			["sx12", "+- hc sdx1 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc 0 sdy3"],
			["sy4", "+- vc 0 sdy4"],
			["sy5", "+- vc 0 sdy5"],
			["sy6", "+- vc 0 sdy6"],
			["sy7", "+- vc sdy6 0"],
			["sy8", "+- vc sdy5 0"],
			["sy9", "+- vc sdy4 0"],
			["sy10", "+- vc sdy3 0"],
			["sy11", "+- vc sdy2 0"],
			["sy12", "+- vc sdy1 0"],
			["idx", "cos iwd2 2700000"],
			["idy", "sin ihd2 2700000"],
			["il", "+- hc 0 idx"],
			["it", "+- vc 0 idy"],
			["ir", "+- hc idx 0"],
			["ib", "+- vc idy 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy6"
				],
				[
					"l",
					"x1",
					"y5"
				],
				[
					"l",
					"sx2",
					"sy5"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"sx3",
					"sy4"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"sx4",
					"sy3"
				],
				[
					"l",
					"x4",
					"y2"
				],
				[
					"l",
					"sx5",
					"sy2"
				],
				[
					"l",
					"x5",
					"y1"
				],
				[
					"l",
					"sx6",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx7",
					"sy1"
				],
				[
					"l",
					"x6",
					"y1"
				],
				[
					"l",
					"sx8",
					"sy2"
				],
				[
					"l",
					"x7",
					"y2"
				],
				[
					"l",
					"sx9",
					"sy3"
				],
				[
					"l",
					"x8",
					"y3"
				],
				[
					"l",
					"sx10",
					"sy4"
				],
				[
					"l",
					"x9",
					"y4"
				],
				[
					"l",
					"sx11",
					"sy5"
				],
				[
					"l",
					"x10",
					"y5"
				],
				[
					"l",
					"sx12",
					"sy6"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx12",
					"sy7"
				],
				[
					"l",
					"x10",
					"y6"
				],
				[
					"l",
					"sx11",
					"sy8"
				],
				[
					"l",
					"x9",
					"y7"
				],
				[
					"l",
					"sx10",
					"sy9"
				],
				[
					"l",
					"x8",
					"y8"
				],
				[
					"l",
					"sx9",
					"sy10"
				],
				[
					"l",
					"x7",
					"y9"
				],
				[
					"l",
					"sx8",
					"sy11"
				],
				[
					"l",
					"x6",
					"y10"
				],
				[
					"l",
					"sx7",
					"sy12"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx6",
					"sy12"
				],
				[
					"l",
					"x5",
					"y10"
				],
				[
					"l",
					"sx5",
					"sy11"
				],
				[
					"l",
					"x4",
					"y9"
				],
				[
					"l",
					"sx4",
					"sy10"
				],
				[
					"l",
					"x3",
					"y8"
				],
				[
					"l",
					"sx3",
					"sy9"
				],
				[
					"l",
					"x2",
					"y7"
				],
				[
					"l",
					"sx2",
					"sy8"
				],
				[
					"l",
					"x1",
					"y6"
				],
				[
					"l",
					"sx1",
					"sy7"
				],
				["c"]
			]
		}]
	},
	star32: {
		adj: [["adj", "val 37500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "*/ wd2 98079 100000"],
			["dx2", "*/ wd2 92388 100000"],
			["dx3", "*/ wd2 83147 100000"],
			["dx4", "cos wd2 2700000"],
			["dx5", "*/ wd2 55557 100000"],
			["dx6", "*/ wd2 38268 100000"],
			["dx7", "*/ wd2 19509 100000"],
			["dy1", "*/ hd2 98079 100000"],
			["dy2", "*/ hd2 92388 100000"],
			["dy3", "*/ hd2 83147 100000"],
			["dy4", "sin hd2 2700000"],
			["dy5", "*/ hd2 55557 100000"],
			["dy6", "*/ hd2 38268 100000"],
			["dy7", "*/ hd2 19509 100000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc 0 dx4"],
			["x5", "+- hc 0 dx5"],
			["x6", "+- hc 0 dx6"],
			["x7", "+- hc 0 dx7"],
			["x8", "+- hc dx7 0"],
			["x9", "+- hc dx6 0"],
			["x10", "+- hc dx5 0"],
			["x11", "+- hc dx4 0"],
			["x12", "+- hc dx3 0"],
			["x13", "+- hc dx2 0"],
			["x14", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc 0 dy3"],
			["y4", "+- vc 0 dy4"],
			["y5", "+- vc 0 dy5"],
			["y6", "+- vc 0 dy6"],
			["y7", "+- vc 0 dy7"],
			["y8", "+- vc dy7 0"],
			["y9", "+- vc dy6 0"],
			["y10", "+- vc dy5 0"],
			["y11", "+- vc dy4 0"],
			["y12", "+- vc dy3 0"],
			["y13", "+- vc dy2 0"],
			["y14", "+- vc dy1 0"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "*/ iwd2 99518 100000"],
			["sdx2", "*/ iwd2 95694 100000"],
			["sdx3", "*/ iwd2 88192 100000"],
			["sdx4", "*/ iwd2 77301 100000"],
			["sdx5", "*/ iwd2 63439 100000"],
			["sdx6", "*/ iwd2 47140 100000"],
			["sdx7", "*/ iwd2 29028 100000"],
			["sdx8", "*/ iwd2 9802 100000"],
			["sdy1", "*/ ihd2 99518 100000"],
			["sdy2", "*/ ihd2 95694 100000"],
			["sdy3", "*/ ihd2 88192 100000"],
			["sdy4", "*/ ihd2 77301 100000"],
			["sdy5", "*/ ihd2 63439 100000"],
			["sdy6", "*/ ihd2 47140 100000"],
			["sdy7", "*/ ihd2 29028 100000"],
			["sdy8", "*/ ihd2 9802 100000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc 0 sdx3"],
			["sx4", "+- hc 0 sdx4"],
			["sx5", "+- hc 0 sdx5"],
			["sx6", "+- hc 0 sdx6"],
			["sx7", "+- hc 0 sdx7"],
			["sx8", "+- hc 0 sdx8"],
			["sx9", "+- hc sdx8 0"],
			["sx10", "+- hc sdx7 0"],
			["sx11", "+- hc sdx6 0"],
			["sx12", "+- hc sdx5 0"],
			["sx13", "+- hc sdx4 0"],
			["sx14", "+- hc sdx3 0"],
			["sx15", "+- hc sdx2 0"],
			["sx16", "+- hc sdx1 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc 0 sdy3"],
			["sy4", "+- vc 0 sdy4"],
			["sy5", "+- vc 0 sdy5"],
			["sy6", "+- vc 0 sdy6"],
			["sy7", "+- vc 0 sdy7"],
			["sy8", "+- vc 0 sdy8"],
			["sy9", "+- vc sdy8 0"],
			["sy10", "+- vc sdy7 0"],
			["sy11", "+- vc sdy6 0"],
			["sy12", "+- vc sdy5 0"],
			["sy13", "+- vc sdy4 0"],
			["sy14", "+- vc sdy3 0"],
			["sy15", "+- vc sdy2 0"],
			["sy16", "+- vc sdy1 0"],
			["idx", "cos iwd2 2700000"],
			["idy", "sin ihd2 2700000"],
			["il", "+- hc 0 idx"],
			["it", "+- vc 0 idy"],
			["ir", "+- hc idx 0"],
			["ib", "+- vc idy 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy8"
				],
				[
					"l",
					"x1",
					"y7"
				],
				[
					"l",
					"sx2",
					"sy7"
				],
				[
					"l",
					"x2",
					"y6"
				],
				[
					"l",
					"sx3",
					"sy6"
				],
				[
					"l",
					"x3",
					"y5"
				],
				[
					"l",
					"sx4",
					"sy5"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"sx5",
					"sy4"
				],
				[
					"l",
					"x5",
					"y3"
				],
				[
					"l",
					"sx6",
					"sy3"
				],
				[
					"l",
					"x6",
					"y2"
				],
				[
					"l",
					"sx7",
					"sy2"
				],
				[
					"l",
					"x7",
					"y1"
				],
				[
					"l",
					"sx8",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx9",
					"sy1"
				],
				[
					"l",
					"x8",
					"y1"
				],
				[
					"l",
					"sx10",
					"sy2"
				],
				[
					"l",
					"x9",
					"y2"
				],
				[
					"l",
					"sx11",
					"sy3"
				],
				[
					"l",
					"x10",
					"y3"
				],
				[
					"l",
					"sx12",
					"sy4"
				],
				[
					"l",
					"x11",
					"y4"
				],
				[
					"l",
					"sx13",
					"sy5"
				],
				[
					"l",
					"x12",
					"y5"
				],
				[
					"l",
					"sx14",
					"sy6"
				],
				[
					"l",
					"x13",
					"y6"
				],
				[
					"l",
					"sx15",
					"sy7"
				],
				[
					"l",
					"x14",
					"y7"
				],
				[
					"l",
					"sx16",
					"sy8"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx16",
					"sy9"
				],
				[
					"l",
					"x14",
					"y8"
				],
				[
					"l",
					"sx15",
					"sy10"
				],
				[
					"l",
					"x13",
					"y9"
				],
				[
					"l",
					"sx14",
					"sy11"
				],
				[
					"l",
					"x12",
					"y10"
				],
				[
					"l",
					"sx13",
					"sy12"
				],
				[
					"l",
					"x11",
					"y11"
				],
				[
					"l",
					"sx12",
					"sy13"
				],
				[
					"l",
					"x10",
					"y12"
				],
				[
					"l",
					"sx11",
					"sy14"
				],
				[
					"l",
					"x9",
					"y13"
				],
				[
					"l",
					"sx10",
					"sy15"
				],
				[
					"l",
					"x8",
					"y14"
				],
				[
					"l",
					"sx9",
					"sy16"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx8",
					"sy16"
				],
				[
					"l",
					"x7",
					"y14"
				],
				[
					"l",
					"sx7",
					"sy15"
				],
				[
					"l",
					"x6",
					"y13"
				],
				[
					"l",
					"sx6",
					"sy14"
				],
				[
					"l",
					"x5",
					"y12"
				],
				[
					"l",
					"sx5",
					"sy13"
				],
				[
					"l",
					"x4",
					"y11"
				],
				[
					"l",
					"sx4",
					"sy12"
				],
				[
					"l",
					"x3",
					"y10"
				],
				[
					"l",
					"sx3",
					"sy11"
				],
				[
					"l",
					"x2",
					"y9"
				],
				[
					"l",
					"sx2",
					"sy10"
				],
				[
					"l",
					"x1",
					"y8"
				],
				[
					"l",
					"sx1",
					"sy9"
				],
				["c"]
			]
		}]
	},
	star4: {
		adj: [["adj", "val 12500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx", "cos iwd2 2700000"],
			["sdy", "sin ihd2 2700000"],
			["sx1", "+- hc 0 sdx"],
			["sx2", "+- hc sdx 0"],
			["sy1", "+- vc 0 sdy"],
			["sy2", "+- vc sdy 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx2",
					"sy1"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx2",
					"sy2"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx1",
					"sy2"
				],
				["c"]
			]
		}]
	},
	star5: {
		adj: [
			["adj", "val 19098"],
			["hf", "val 105146"],
			["vf", "val 110557"]
		],
		gd: [
			["a", "pin 0 adj 50000"],
			["swd2", "*/ wd2 hf 100000"],
			["shd2", "*/ hd2 vf 100000"],
			["svc", "*/ vc  vf 100000"],
			["dx1", "cos swd2 1080000"],
			["dx2", "cos swd2 18360000"],
			["dy1", "sin shd2 1080000"],
			["dy2", "sin shd2 18360000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "+- svc 0 dy1"],
			["y2", "+- svc 0 dy2"],
			["iwd2", "*/ swd2 a 50000"],
			["ihd2", "*/ shd2 a 50000"],
			["sdx1", "cos iwd2 20520000"],
			["sdx2", "cos iwd2 3240000"],
			["sdy1", "sin ihd2 3240000"],
			["sdy2", "sin ihd2 20520000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc sdx2 0"],
			["sx4", "+- hc sdx1 0"],
			["sy1", "+- svc 0 sdy1"],
			["sy2", "+- svc 0 sdy2"],
			["sy3", "+- svc ihd2 0"],
			["yAdj", "+- svc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y1"
				],
				[
					"l",
					"sx2",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"sx4",
					"sy2"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"hc",
					"sy3"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"sx1",
					"sy2"
				],
				["c"]
			]
		}]
	},
	star6: {
		adj: [["adj", "val 28868"], ["hf", "val 115470"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["swd2", "*/ wd2 hf 100000"],
			["dx1", "cos swd2 1800000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["y2", "+- vc hd4 0"],
			["iwd2", "*/ swd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx2", "*/ iwd2 1 2"],
			["sx1", "+- hc 0 iwd2"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc sdx2 0"],
			["sx4", "+- hc iwd2 0"],
			["sdy1", "sin ihd2 3600000"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc sdy1 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"hd4"
				],
				[
					"l",
					"sx2",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"x2",
					"hd4"
				],
				[
					"l",
					"sx4",
					"vc"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"sx3",
					"sy2"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx2",
					"sy2"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"sx1",
					"vc"
				],
				["c"]
			]
		}]
	},
	star7: {
		adj: [
			["adj", "val 34601"],
			["hf", "val 102572"],
			["vf", "val 105210"]
		],
		gd: [
			["a", "pin 0 adj 50000"],
			["swd2", "*/ wd2 hf 100000"],
			["shd2", "*/ hd2 vf 100000"],
			["svc", "*/ vc  vf 100000"],
			["dx1", "*/ swd2 97493 100000"],
			["dx2", "*/ swd2 78183 100000"],
			["dx3", "*/ swd2 43388 100000"],
			["dy1", "*/ shd2 62349 100000"],
			["dy2", "*/ shd2 22252 100000"],
			["dy3", "*/ shd2 90097 100000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc 0 dx3"],
			["x4", "+- hc dx3 0"],
			["x5", "+- hc dx2 0"],
			["x6", "+- hc dx1 0"],
			["y1", "+- svc 0 dy1"],
			["y2", "+- svc dy2 0"],
			["y3", "+- svc dy3 0"],
			["iwd2", "*/ swd2 a 50000"],
			["ihd2", "*/ shd2 a 50000"],
			["sdx1", "*/ iwd2 97493 100000"],
			["sdx2", "*/ iwd2 78183 100000"],
			["sdx3", "*/ iwd2 43388 100000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc 0 sdx3"],
			["sx4", "+- hc sdx3 0"],
			["sx5", "+- hc sdx2 0"],
			["sx6", "+- hc sdx1 0"],
			["sdy1", "*/ ihd2 90097 100000"],
			["sdy2", "*/ ihd2 22252 100000"],
			["sdy3", "*/ ihd2 62349 100000"],
			["sy1", "+- svc 0 sdy1"],
			["sy2", "+- svc 0 sdy2"],
			["sy3", "+- svc sdy3 0"],
			["sy4", "+- svc ihd2 0"],
			["yAdj", "+- svc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x1",
					"y2"
				],
				[
					"l",
					"sx1",
					"sy2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx4",
					"sy1"
				],
				[
					"l",
					"x5",
					"y1"
				],
				[
					"l",
					"sx6",
					"sy2"
				],
				[
					"l",
					"x6",
					"y2"
				],
				[
					"l",
					"sx5",
					"sy3"
				],
				[
					"l",
					"x4",
					"y3"
				],
				[
					"l",
					"hc",
					"sy4"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"sx2",
					"sy3"
				],
				["c"]
			]
		}]
	},
	star8: {
		adj: [["adj", "val 37500"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dx1", "cos wd2 2700000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["dy1", "sin hd2 2700000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["iwd2", "*/ wd2 a 50000"],
			["ihd2", "*/ hd2 a 50000"],
			["sdx1", "*/ iwd2 92388 100000"],
			["sdx2", "*/ iwd2 38268 100000"],
			["sdy1", "*/ ihd2 92388 100000"],
			["sdy2", "*/ ihd2 38268 100000"],
			["sx1", "+- hc 0 sdx1"],
			["sx2", "+- hc 0 sdx2"],
			["sx3", "+- hc sdx2 0"],
			["sx4", "+- hc sdx1 0"],
			["sy1", "+- vc 0 sdy1"],
			["sy2", "+- vc 0 sdy2"],
			["sy3", "+- vc sdy2 0"],
			["sy4", "+- vc sdy1 0"],
			["yAdj", "+- vc 0 ihd2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"sx1",
					"sy2"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"sx2",
					"sy1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"sx3",
					"sy1"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"sx4",
					"sy2"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"sx4",
					"sy3"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"sx3",
					"sy4"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"sx2",
					"sy4"
				],
				[
					"l",
					"x1",
					"y2"
				],
				[
					"l",
					"sx1",
					"sy3"
				],
				["c"]
			]
		}]
	},
	straightconnector1: {
		adj: [],
		gd: [],
		paths: [{
			w: null,
			h: null,
			fill: "none",
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	stripedrightarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 84375 w ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["x4", "*/ ss 5 32"],
			["dx5", "*/ ss a2 100000"],
			["x5", "+- r 0 dx5"],
			["dy1", "*/ h a1 200000"],
			["y1", "+- vc 0 dy1"],
			["y2", "+- vc dy1 0"],
			["dx6", "*/ dy1 dx5 hd2"],
			["x6", "+- r 0 dx6"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y1"
				],
				[
					"l",
					"ssd32",
					"y1"
				],
				[
					"l",
					"ssd32",
					"y2"
				],
				[
					"l",
					"l",
					"y2"
				],
				["c"],
				[
					"m",
					"ssd16",
					"y1"
				],
				[
					"l",
					"ssd8",
					"y1"
				],
				[
					"l",
					"ssd8",
					"y2"
				],
				[
					"l",
					"ssd16",
					"y2"
				],
				["c"],
				[
					"m",
					"x4",
					"y1"
				],
				[
					"l",
					"x5",
					"y1"
				],
				[
					"l",
					"x5",
					"t"
				],
				[
					"l",
					"r",
					"vc"
				],
				[
					"l",
					"x5",
					"b"
				],
				[
					"l",
					"x5",
					"y2"
				],
				[
					"l",
					"x4",
					"y2"
				],
				["c"]
			]
		}]
	},
	sun: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 12500 adj 46875"],
			["g0", "+- 50000 0 a"],
			["g1", "*/ g0 30274 32768"],
			["g2", "*/ g0 12540 32768"],
			["g3", "+- g1 50000 0"],
			["g4", "+- g2 50000 0"],
			["g5", "+- 50000 0 g1"],
			["g6", "+- 50000 0 g2"],
			["g7", "*/ g0 23170 32768"],
			["g8", "+- 50000 g7 0"],
			["g9", "+- 50000 0 g7"],
			["g10", "*/ g5 3 4"],
			["g11", "*/ g6 3 4"],
			["g12", "+- g10 3662 0"],
			["g13", "+- g11 3662 0"],
			["g14", "+- g11 12500 0"],
			["g15", "+- 100000 0 g10"],
			["g16", "+- 100000 0 g12"],
			["g17", "+- 100000 0 g13"],
			["g18", "+- 100000 0 g14"],
			["ox1", "*/ w 18436 21600"],
			["oy1", "*/ h 3163 21600"],
			["ox2", "*/ w 3163 21600"],
			["oy2", "*/ h 18436 21600"],
			["x8", "*/ w g8 100000"],
			["x9", "*/ w g9 100000"],
			["x10", "*/ w g10 100000"],
			["x12", "*/ w g12 100000"],
			["x13", "*/ w g13 100000"],
			["x14", "*/ w g14 100000"],
			["x15", "*/ w g15 100000"],
			["x16", "*/ w g16 100000"],
			["x17", "*/ w g17 100000"],
			["x18", "*/ w g18 100000"],
			["x19", "*/ w a 100000"],
			["wR", "*/ w g0 100000"],
			["hR", "*/ h g0 100000"],
			["y8", "*/ h g8 100000"],
			["y9", "*/ h g9 100000"],
			["y10", "*/ h g10 100000"],
			["y12", "*/ h g12 100000"],
			["y13", "*/ h g13 100000"],
			["y14", "*/ h g14 100000"],
			["y15", "*/ h g15 100000"],
			["y16", "*/ h g16 100000"],
			["y17", "*/ h g17 100000"],
			["y18", "*/ h g18 100000"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"r",
					"vc"
				],
				[
					"l",
					"x15",
					"y18"
				],
				[
					"l",
					"x15",
					"y14"
				],
				["c"],
				[
					"m",
					"ox1",
					"oy1"
				],
				[
					"l",
					"x16",
					"y13"
				],
				[
					"l",
					"x17",
					"y12"
				],
				["c"],
				[
					"m",
					"hc",
					"t"
				],
				[
					"l",
					"x18",
					"y10"
				],
				[
					"l",
					"x14",
					"y10"
				],
				["c"],
				[
					"m",
					"ox2",
					"oy1"
				],
				[
					"l",
					"x13",
					"y12"
				],
				[
					"l",
					"x12",
					"y13"
				],
				["c"],
				[
					"m",
					"l",
					"vc"
				],
				[
					"l",
					"x10",
					"y14"
				],
				[
					"l",
					"x10",
					"y18"
				],
				["c"],
				[
					"m",
					"ox2",
					"oy2"
				],
				[
					"l",
					"x12",
					"y17"
				],
				[
					"l",
					"x13",
					"y16"
				],
				["c"],
				[
					"m",
					"hc",
					"b"
				],
				[
					"l",
					"x14",
					"y15"
				],
				[
					"l",
					"x18",
					"y15"
				],
				["c"],
				[
					"m",
					"ox1",
					"oy2"
				],
				[
					"l",
					"x17",
					"y16"
				],
				[
					"l",
					"x16",
					"y17"
				],
				["c"],
				[
					"m",
					"x19",
					"vc"
				],
				[
					"a",
					"wR",
					"hR",
					"cd2",
					"21600000"
				],
				["c"]
			]
		}]
	},
	swoosharrow: {
		adj: [["adj1", "val 25000"], ["adj2", "val 16667"]],
		gd: [
			["a1", "pin 1 adj1 75000"],
			["maxAdj2", "*/ 70000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["ad1", "*/ h a1 100000"],
			["ad2", "*/ ss a2 100000"],
			["xB", "+- r 0 ad2"],
			["yB", "+- t ssd8 0"],
			["alfa", "*/ cd4 1 14"],
			["dx0", "tan ssd8 alfa"],
			["xC", "+- xB 0 dx0"],
			["dx1", "tan ad1 alfa"],
			["yF", "+- yB ad1 0"],
			["xF", "+- xB dx1 0"],
			["xE", "+- xF dx0 0"],
			["yE", "+- yF ssd8 0"],
			["dy2", "+- yE 0 t"],
			["dy22", "*/ dy2 1 2"],
			["dy3", "*/ h 1 20"],
			["yD", "+- t dy22 dy3"],
			["dy4", "*/ hd6 1 1"],
			["yP1", "+- hd6 dy4 0"],
			["xP1", "val wd6"],
			["dy5", "*/ hd6 1 2"],
			["yP2", "+- yF dy5 0"],
			["xP2", "val wd4"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"Q",
					"xP1",
					"yP1",
					"xB",
					"yB"
				],
				[
					"l",
					"xC",
					"t"
				],
				[
					"l",
					"r",
					"yD"
				],
				[
					"l",
					"xE",
					"yE"
				],
				[
					"l",
					"xF",
					"yF"
				],
				[
					"Q",
					"xP2",
					"yP2",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	teardrop: {
		adj: [["adj", "val 100000"]],
		gd: [
			["a", "pin 0 adj 200000"],
			["r2", "sqrt 2"],
			["tw", "*/ wd2 r2 1"],
			["th", "*/ hd2 r2 1"],
			["sw", "*/ tw a 100000"],
			["sh", "*/ th a 100000"],
			["dx1", "cos sw 2700000"],
			["dy1", "sin sh 2700000"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc 0 dy1"],
			["x2", "+/ hc x1 2"],
			["y2", "+/ vc y1 2"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd2",
					"cd4"
				],
				[
					"Q",
					"x2",
					"t",
					"x1",
					"y1"
				],
				[
					"Q",
					"r",
					"y2",
					"r",
					"vc"
				],
				[
					"a",
					"wd2",
					"hd2",
					"0",
					"cd4"
				],
				[
					"a",
					"wd2",
					"hd2",
					"cd4",
					"cd4"
				],
				["c"]
			]
		}]
	},
	trapezoid: {
		adj: [["adj", "val 25000"]],
		gd: [
			["maxAdj", "*/ 50000 w ss"],
			["a", "pin 0 adj maxAdj"],
			["x1", "*/ ss a 200000"],
			["x2", "*/ ss a 100000"],
			["x3", "+- r 0 x2"],
			["x4", "+- r 0 x1"],
			["il", "*/ wd3 a maxAdj"],
			["it", "*/ hd3 a maxAdj"],
			["ir", "+- r 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"x3",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	triangle: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 0 adj 100000"],
			["x1", "*/ w a 200000"],
			["x2", "*/ w a 100000"],
			["x3", "+- x1 wd2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"b"
				],
				["c"]
			]
		}]
	},
	uparrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 64977"]
		],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 100000 h ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss h"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dx1", "*/ ss a2 100000"],
			["dx2", "*/ ss a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "*/ ss a3 100000"],
			["dy2", "*/ h a4 100000"],
			["y2", "+- b 0 dy2"],
			["y3", "+/ y2 b 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				["c"]
			]
		}]
	},
	updownarrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 50000 h ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["y2", "*/ ss a2 100000"],
			["y3", "+- b 0 y2"],
			["dx1", "*/ w a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["dy1", "*/ x1 y2 wd2"],
			["y1", "+- y2 0 dy1"],
			["y4", "+- y3 dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"r",
					"y3"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"l",
					"y3"
				],
				[
					"l",
					"x1",
					"y3"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"]
			]
		}]
	},
	uparrow: {
		adj: [["adj1", "val 50000"], ["adj2", "val 50000"]],
		gd: [
			["maxAdj2", "*/ 100000 h ss"],
			["a1", "pin 0 adj1 100000"],
			["a2", "pin 0 adj2 maxAdj2"],
			["dy2", "*/ ss a2 100000"],
			["y2", "+- t dy2 0"],
			["dx1", "*/ w a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc dx1 0"],
			["dy1", "*/ x1 dy2 wd2"],
			["y1", "+- y2  0 dy1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"x1",
					"y2"
				],
				["c"]
			]
		}]
	},
	updownarrowcallout: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 48123"]
		],
		gd: [
			["maxAdj2", "*/ 50000 w ss"],
			["a2", "pin 0 adj2 maxAdj2"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["maxAdj3", "*/ 50000 h ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q2", "*/ a3 ss hd2"],
			["maxAdj4", "+- 100000 0 q2"],
			["a4", "pin 0 adj4 maxAdj4"],
			["dx1", "*/ ss a2 100000"],
			["dx2", "*/ ss a1 200000"],
			["x1", "+- hc 0 dx1"],
			["x2", "+- hc 0 dx2"],
			["x3", "+- hc dx2 0"],
			["x4", "+- hc dx1 0"],
			["y1", "*/ ss a3 100000"],
			["y4", "+- b 0 y1"],
			["dy2", "*/ h a4 200000"],
			["y2", "+- vc 0 dy2"],
			["y3", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x2",
					"y2"
				],
				[
					"l",
					"x2",
					"y1"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"x4",
					"y1"
				],
				[
					"l",
					"x3",
					"y1"
				],
				[
					"l",
					"x3",
					"y2"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"y3"
				],
				[
					"l",
					"x3",
					"y3"
				],
				[
					"l",
					"x3",
					"y4"
				],
				[
					"l",
					"x4",
					"y4"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"x1",
					"y4"
				],
				[
					"l",
					"x2",
					"y4"
				],
				[
					"l",
					"x2",
					"y3"
				],
				[
					"l",
					"l",
					"y3"
				],
				["c"]
			]
		}]
	},
	uturnarrow: {
		adj: [
			["adj1", "val 25000"],
			["adj2", "val 25000"],
			["adj3", "val 25000"],
			["adj4", "val 43750"],
			["adj5", "val 75000"]
		],
		gd: [
			["a2", "pin 0 adj2 25000"],
			["maxAdj1", "*/ a2 2 1"],
			["a1", "pin 0 adj1 maxAdj1"],
			["q2", "*/ a1 ss h"],
			["q3", "+- 100000 0 q2"],
			["maxAdj3", "*/ q3 h ss"],
			["a3", "pin 0 adj3 maxAdj3"],
			["q1", "+- a3 a1 0"],
			["minAdj5", "*/ q1 ss h"],
			["a5", "pin minAdj5 adj5 100000"],
			["th", "*/ ss a1 100000"],
			["aw2", "*/ ss a2 100000"],
			["th2", "*/ th 1 2"],
			["dh2", "+- aw2 0 th2"],
			["y5", "*/ h a5 100000"],
			["ah", "*/ ss a3 100000"],
			["y4", "+- y5 0 ah"],
			["x9", "+- r 0 dh2"],
			["bw", "*/ x9 1 2"],
			["bs", "min bw y4"],
			["maxAdj4", "*/ bs 100000 ss"],
			["a4", "pin 0 adj4 maxAdj4"],
			["bd", "*/ ss a4 100000"],
			["bd3", "+- bd 0 th"],
			["bd2", "max bd3 0"],
			["x3", "+- th bd2 0"],
			["x8", "+- r 0 aw2"],
			["x6", "+- x8 0 aw2"],
			["x7", "+- x6 dh2 0"],
			["x4", "+- x9 0 bd"],
			["x5", "+- x7 0 bd2"],
			["cx", "+/ th x7 2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"l",
					"bd"
				],
				[
					"a",
					"bd",
					"bd",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x4",
					"t"
				],
				[
					"a",
					"bd",
					"bd",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"x9",
					"y4"
				],
				[
					"l",
					"r",
					"y4"
				],
				[
					"l",
					"x8",
					"y5"
				],
				[
					"l",
					"x6",
					"y4"
				],
				[
					"l",
					"x7",
					"y4"
				],
				[
					"l",
					"x7",
					"x3"
				],
				[
					"a",
					"bd2",
					"bd2",
					"0",
					"-5400000"
				],
				[
					"l",
					"x3",
					"th"
				],
				[
					"a",
					"bd2",
					"bd2",
					"3cd4",
					"-5400000"
				],
				[
					"l",
					"th",
					"b"
				],
				["c"]
			]
		}]
	},
	verticalscroll: {
		adj: [["adj", "val 12500"]],
		gd: [
			["a", "pin 0 adj 25000"],
			["ch", "*/ ss a 100000"],
			["ch2", "*/ ch 1 2"],
			["ch4", "*/ ch 1 4"],
			["x3", "+- ch ch2 0"],
			["x4", "+- ch ch 0"],
			["x6", "+- r 0 ch"],
			["x7", "+- r 0 ch2"],
			["x5", "+- x6 0 ch2"],
			["y3", "+- b 0 ch"],
			["y4", "+- b 0 ch2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ch2",
						"b"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					[
						"l",
						"ch2",
						"y4"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd4",
						"-10800000"
					],
					[
						"l",
						"ch",
						"y3"
					],
					[
						"l",
						"ch",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x7",
						"t"
					],
					[
						"a",
						"ch2",
						"ch2",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x6",
						"ch"
					],
					[
						"l",
						"x6",
						"y4"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					["c"],
					[
						"m",
						"x4",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd4",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "darkenLess",
				stroke: !1,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"x4",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd4",
						"cd2"
					],
					["c"],
					[
						"m",
						"ch",
						"y4"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"3cd4"
					],
					[
						"a",
						"ch4",
						"ch4",
						"3cd4",
						"cd2"
					],
					["c"]
				]
			},
			{
				w: null,
				h: null,
				fill: "none",
				stroke: !0,
				extrusionOk: !1,
				cmds: [
					[
						"m",
						"ch",
						"y3"
					],
					[
						"l",
						"ch",
						"ch2"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd2",
						"cd4"
					],
					[
						"l",
						"x7",
						"t"
					],
					[
						"a",
						"ch2",
						"ch2",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"x6",
						"ch"
					],
					[
						"l",
						"x6",
						"y4"
					],
					[
						"a",
						"ch2",
						"ch2",
						"0",
						"cd4"
					],
					[
						"l",
						"ch2",
						"b"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"cd2"
					],
					["c"],
					[
						"m",
						"x3",
						"t"
					],
					[
						"a",
						"ch2",
						"ch2",
						"3cd4",
						"cd2"
					],
					[
						"a",
						"ch4",
						"ch4",
						"cd4",
						"cd2"
					],
					[
						"l",
						"x4",
						"ch2"
					],
					[
						"m",
						"x6",
						"ch"
					],
					[
						"l",
						"x3",
						"ch"
					],
					[
						"m",
						"ch2",
						"y3"
					],
					[
						"a",
						"ch4",
						"ch4",
						"3cd4",
						"cd2"
					],
					[
						"l",
						"ch",
						"y4"
					],
					[
						"m",
						"ch2",
						"b"
					],
					[
						"a",
						"ch2",
						"ch2",
						"cd4",
						"-5400000"
					],
					[
						"l",
						"ch",
						"y3"
					]
				]
			}
		]
	},
	wave: {
		adj: [["adj1", "val 12500"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 20000"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["dx1", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs dx1"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx5", "?: of2 of2 0"],
			["x5", "+- r 0 dx5"],
			["dx3", "+/ dx2 x5 3"],
			["x3", "+- x2 dx3 0"],
			["x4", "+/ x3 x5 2"],
			["x6", "+- l dx5 0"],
			["x10", "+- r dx2 0"],
			["x7", "+- x6 dx3 0"],
			["x8", "+/ x7 x10 2"],
			["x9", "+- r 0 x1"],
			["xAdj", "+- hc dx1 0"],
			["xAdj2", "+- hc 0 dx1"],
			["il", "max x2 x6"],
			["ir", "min x5 x10"],
			["it", "*/ h a1 50000"],
			["ib", "+- b 0 it"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x2",
					"y1"
				],
				[
					"C",
					"x3",
					"y2",
					"x4",
					"y3",
					"x5",
					"y1"
				],
				[
					"l",
					"x10",
					"y4"
				],
				[
					"C",
					"x8",
					"y6",
					"x7",
					"y5",
					"x6",
					"y4"
				],
				["c"]
			]
		}]
	},
	wedgeellipsecallout: {
		adj: [["adj1", "val -20833"], ["adj2", "val 62500"]],
		gd: [
			["dxPos", "*/ w adj1 100000"],
			["dyPos", "*/ h adj2 100000"],
			["xPos", "+- hc dxPos 0"],
			["yPos", "+- vc dyPos 0"],
			["sdx", "*/ dxPos h 1"],
			["sdy", "*/ dyPos w 1"],
			["pang", "at2 sdx sdy"],
			["stAng", "+- pang 660000 0"],
			["enAng", "+- pang 0 660000"],
			["dx1", "cos wd2 stAng"],
			["dy1", "sin hd2 stAng"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["dx2", "cos wd2 enAng"],
			["dy2", "sin hd2 enAng"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["stAng1", "at2 dx1 dy1"],
			["enAng1", "at2 dx2 dy2"],
			["swAng1", "+- enAng1 0 stAng1"],
			["swAng2", "+- swAng1 21600000 0"],
			["swAng", "?: swAng1 swAng1 swAng2"],
			["idx", "cos wd2 2700000"],
			["idy", "sin hd2 2700000"],
			["il", "+- hc 0 idx"],
			["ir", "+- hc idx 0"],
			["it", "+- vc 0 idy"],
			["ib", "+- vc idy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"xPos",
					"yPos"
				],
				[
					"l",
					"x1",
					"y1"
				],
				[
					"a",
					"wd2",
					"hd2",
					"stAng1",
					"swAng"
				],
				["c"]
			]
		}]
	},
	wedgerectcallout: {
		adj: [["adj1", "val -20833"], ["adj2", "val 62500"]],
		gd: [
			["dxPos", "*/ w adj1 100000"],
			["dyPos", "*/ h adj2 100000"],
			["xPos", "+- hc dxPos 0"],
			["yPos", "+- vc dyPos 0"],
			["dx", "+- xPos 0 hc"],
			["dy", "+- yPos 0 vc"],
			["dq", "*/ dxPos h w"],
			["ady", "abs dyPos"],
			["adq", "abs dq"],
			["dz", "+- ady 0 adq"],
			["xg1", "?: dxPos 7 2"],
			["xg2", "?: dxPos 10 5"],
			["x1", "*/ w xg1 12"],
			["x2", "*/ w xg2 12"],
			["yg1", "?: dyPos 7 2"],
			["yg2", "?: dyPos 10 5"],
			["y1", "*/ h yg1 12"],
			["y2", "*/ h yg2 12"],
			["t1", "?: dxPos l xPos"],
			["xl", "?: dz l t1"],
			["t2", "?: dyPos x1 xPos"],
			["xt", "?: dz t2 x1"],
			["t3", "?: dxPos xPos r"],
			["xr", "?: dz r t3"],
			["t4", "?: dyPos xPos x1"],
			["xb", "?: dz t4 x1"],
			["t5", "?: dxPos y1 yPos"],
			["yl", "?: dz y1 t5"],
			["t6", "?: dyPos t yPos"],
			["yt", "?: dz t6 t"],
			["t7", "?: dxPos yPos y1"],
			["yr", "?: dz y1 t7"],
			["t8", "?: dyPos yPos b"],
			["yb", "?: dz t8 b"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"xt",
					"yt"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"t"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"xr",
					"yr"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"xb",
					"yb"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"l",
					"b"
				],
				[
					"l",
					"l",
					"y2"
				],
				[
					"l",
					"xl",
					"yl"
				],
				[
					"l",
					"l",
					"y1"
				],
				["c"]
			]
		}]
	},
	wedgeroundrectcallout: {
		adj: [
			["adj1", "val -20833"],
			["adj2", "val 62500"],
			["adj3", "val 16667"]
		],
		gd: [
			["dxPos", "*/ w adj1 100000"],
			["dyPos", "*/ h adj2 100000"],
			["xPos", "+- hc dxPos 0"],
			["yPos", "+- vc dyPos 0"],
			["dq", "*/ dxPos h w"],
			["ady", "abs dyPos"],
			["adq", "abs dq"],
			["dz", "+- ady 0 adq"],
			["xg1", "?: dxPos 7 2"],
			["xg2", "?: dxPos 10 5"],
			["x1", "*/ w xg1 12"],
			["x2", "*/ w xg2 12"],
			["yg1", "?: dyPos 7 2"],
			["yg2", "?: dyPos 10 5"],
			["y1", "*/ h yg1 12"],
			["y2", "*/ h yg2 12"],
			["t1", "?: dxPos l xPos"],
			["xl", "?: dz l t1"],
			["t2", "?: dyPos x1 xPos"],
			["xt", "?: dz t2 x1"],
			["t3", "?: dxPos xPos r"],
			["xr", "?: dz r t3"],
			["t4", "?: dyPos xPos x1"],
			["xb", "?: dz t4 x1"],
			["t5", "?: dxPos y1 yPos"],
			["yl", "?: dz y1 t5"],
			["t6", "?: dyPos t yPos"],
			["yt", "?: dz t6 t"],
			["t7", "?: dxPos yPos y1"],
			["yr", "?: dz y1 t7"],
			["t8", "?: dyPos yPos b"],
			["yb", "?: dz t8 b"],
			["u1", "*/ ss adj3 100000"],
			["u2", "+- r 0 u1"],
			["v2", "+- b 0 u1"],
			["il", "*/ u1 29289 100000"],
			["ir", "+- r 0 il"],
			["ib", "+- b 0 il"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"u1"
				],
				[
					"a",
					"u1",
					"u1",
					"cd2",
					"cd4"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"xt",
					"yt"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"u2",
					"t"
				],
				[
					"a",
					"u1",
					"u1",
					"3cd4",
					"cd4"
				],
				[
					"l",
					"r",
					"y1"
				],
				[
					"l",
					"xr",
					"yr"
				],
				[
					"l",
					"r",
					"y2"
				],
				[
					"l",
					"r",
					"v2"
				],
				[
					"a",
					"u1",
					"u1",
					"0",
					"cd4"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"xb",
					"yb"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"u1",
					"b"
				],
				[
					"a",
					"u1",
					"u1",
					"cd4",
					"cd4"
				],
				[
					"l",
					"l",
					"y2"
				],
				[
					"l",
					"xl",
					"yl"
				],
				[
					"l",
					"l",
					"y1"
				],
				["c"]
			]
		}]
	}
}, vr = 216e5, yr = Math.PI * 2 / vr;
function br(e) {
	let t = e.trim().split(/\s+/);
	return {
		op: t[0],
		argTokens: t.slice(1)
	};
}
function xr(e, t, n) {
	let { w: r, h: i, adj: a } = e, o = Math.min(r, i), s = Math.max(r, i), c = Object.create(null);
	Object.assign(c, {
		w: r,
		h: i,
		l: 0,
		t: 0,
		r,
		b: i,
		hc: r / 2,
		vc: i / 2,
		wd2: r / 2,
		wd3: r / 3,
		wd4: r / 4,
		wd5: r / 5,
		wd6: r / 6,
		wd8: r / 8,
		wd10: r / 10,
		wd12: r / 12,
		wd16: r / 16,
		wd32: r / 32,
		hd2: i / 2,
		hd3: i / 3,
		hd4: i / 4,
		hd5: i / 5,
		hd6: i / 6,
		hd8: i / 8,
		hd10: i / 10,
		hd12: i / 12,
		hd16: i / 16,
		hd32: i / 32,
		ss: o,
		ssd2: o / 2,
		ssd4: o / 4,
		ssd6: o / 6,
		ssd8: o / 8,
		ssd16: o / 16,
		ssd32: o / 32,
		ls: s,
		lsd2: s / 2,
		lsd4: s / 4,
		lsd6: s / 6,
		lsd8: s / 8,
		lsd16: s / 16,
		lsd32: s / 32,
		cd: vr,
		cd2: vr / 2,
		cd4: vr / 4,
		cd8: vr / 8,
		"3cd4": 3 * vr / 4,
		"3cd8": 3 * vr / 8,
		"5cd8": 5 * vr / 8,
		"7cd8": 7 * vr / 8
	}), t.forEach(([e, t], n) => {
		let r = a[n];
		c[e] = typeof r == "number" ? r : u(t), e === "adj" && (c.adj1 = c.adj), e === "adj1" && (c.adj = c.adj1);
	});
	for (let [e, t] of n) c[e] = u(t);
	return {
		v: (e) => {
			if (e in c) return c[e];
			throw Error(`preset-shape: unknown name "${e}"`);
		},
		fmla: u,
		resolve: l
	};
	function l(e) {
		if (e in c) return c[e];
		let t = Number(e);
		if (Number.isFinite(t)) return t;
		throw Error(`preset-shape: cannot resolve "${e}"`);
	}
	function u(e) {
		let t = e.argTokens.map(l);
		return d(e.op, t, e);
	}
	function d(e, t, n) {
		switch (e) {
			case "val": return t[0];
			case "*/": return t[0] * t[1] / t[2];
			case "+-": return t[0] + t[1] - t[2];
			case "+/": return (t[0] + t[1]) / t[2];
			case "?:": return t[0] > 0 ? t[1] : t[2];
			case "abs": return Math.abs(t[0]);
			case "min": return Math.min(t[0], t[1]);
			case "max": return Math.max(t[0], t[1]);
			case "pin": return t[1] < t[0] ? t[0] : t[1] > t[2] ? t[2] : t[1];
			case "sqrt": return Math.sqrt(Math.max(0, t[0]));
			case "mod": return Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]);
			case "sin": return t[0] * Math.sin(t[1] * yr);
			case "cos": return t[0] * Math.cos(t[1] * yr);
			case "tan": return t[0] * Math.tan(t[1] * yr);
			case "at2": return Math.atan2(t[1], t[0]) / yr;
			case "cat2": return t[0] * Math.cos(Math.atan2(t[2], t[1]));
			case "sat2": return t[0] * Math.sin(Math.atan2(t[2], t[1]));
			default: throw Error(`preset-shape: unknown operator "${e}" in "${[n.op, ...n.argTokens].join(" ")}"`);
		}
	}
}
//#endregion
//#region packages/core/src/shape/preset-geometry/path-executor.ts
var Sr = Math.PI * 2 / 216e5;
function Cr(e, t, n, r, i, a, o) {
	let s = t.w == null ? 1 : a / t.w, c = t.h == null ? 1 : o / t.h, l = (e) => r + e * s, u = (e) => i + e * c, d = 0, f = 0;
	for (let r of t.cmds) switch (r[0]) {
		case "m": {
			let t = l(n.resolve(r[1])), i = u(n.resolve(r[2]));
			e.moveTo(t, i), d = t, f = i;
			break;
		}
		case "l": {
			let t = l(n.resolve(r[1])), i = u(n.resolve(r[2]));
			e.lineTo(t, i), d = t, f = i;
			break;
		}
		case "C": {
			let t = l(n.resolve(r[1])), i = u(n.resolve(r[2])), a = l(n.resolve(r[3])), o = u(n.resolve(r[4])), s = l(n.resolve(r[5])), c = u(n.resolve(r[6]));
			e.bezierCurveTo(t, i, a, o, s, c), d = s, f = c;
			break;
		}
		case "Q": {
			let t = l(n.resolve(r[1])), i = u(n.resolve(r[2])), a = l(n.resolve(r[3])), o = u(n.resolve(r[4]));
			e.quadraticCurveTo(t, i, a, o), d = a, f = o;
			break;
		}
		case "a": {
			let t = n.resolve(r[1]), i = n.resolve(r[2]), a = t * s, o = i * c, l = n.resolve(r[3]) * Sr, u = n.resolve(r[4]) * Sr, p = Math.PI * 2, m = (e) => Math.atan2(t * Math.sin(e), i * Math.cos(e)), h = m(l), g = Math.trunc(u / p), _ = u - g * p, v = m(l + _) - h;
			_ > 0 && v < 0 ? v += p : _ < 0 && v > 0 && (v -= p);
			let y = h + v + g * p, b = d - a * Math.cos(h), x = f - o * Math.sin(h);
			Math.abs(a) > 1e-6 && Math.abs(o) > 1e-6 && (e.ellipse(b, x, Math.abs(a), Math.abs(o), 0, h, y, u < 0), d = b + a * Math.cos(y), f = x + o * Math.sin(y));
			break;
		}
		case "c":
			e.closePath();
			break;
	}
}
//#endregion
//#region packages/core/src/shape/preset-geometry/index.ts
var wr = _r, Tr = /* @__PURE__ */ new WeakMap();
function Er(e) {
	let t = Tr.get(e);
	return t || (t = {
		adj: e.adj.map(([e, t]) => [e, br(t)]),
		gd: e.gd.map(([e, t]) => [e, br(t)])
	}, Tr.set(e, t)), t;
}
function Dr(e, t, n, r) {
	let i = Er(e);
	return xr({
		w: t,
		h: n,
		adj: r
	}, i.adj, i.gd);
}
function Or(e) {
	return e.toLowerCase() in wr;
}
function kr(e, t, n, r, i, a, o = []) {
	let s = wr[t.toLowerCase()];
	if (!s) return !1;
	let c = Dr(s, i, a, o);
	for (let t of s.paths) Cr(e, t, c, n, r, i, a);
	return !0;
}
var Ar = {
	wedgeroundrectcallout: "roundrect",
	wedgeellipsecallout: "ellipse",
	wedgerectcallout: null
}, jr = {
	adj: [],
	gd: [],
	paths: [{
		w: null,
		h: null,
		fill: null,
		stroke: !0,
		extrusionOk: !1,
		cmds: [
			[
				"m",
				"l",
				"t"
			],
			[
				"l",
				"r",
				"t"
			],
			[
				"l",
				"r",
				"b"
			],
			[
				"l",
				"l",
				"b"
			],
			["c"]
		]
	}]
};
function Mr(e, t, n) {
	let r = e[n];
	if (typeof r == "number") return r;
	let i = t.adj[n];
	return i && Number(i[1].replace(/^val\s+/, "")) || 0;
}
function Nr(e, t, n, r, i, a, o, s, c, l, u) {
	let d = t.toLowerCase(), f = wr[d];
	if (!f) return !1;
	if (d in Ar) {
		let e = Mr(o, f, 0), t = Mr(o, f, 1), n = i / 2 + i * e / 1e5, r = a / 2 + a * t / 1e5;
		if (n >= 0 && n <= i && r >= 0 && r <= a) {
			let e = Ar[d];
			e === "roundrect" ? (f = wr.roundrect, o = [Mr(o, wr[d], 2)]) : e && wr[e] ? (f = wr[e], o = []) : (f = jr, o = []);
		}
	}
	let p = Dr(f, i, a, o), m = !1, h = f.paths.length - 1;
	for (let t = 0; t < f.paths.length; t++) {
		let o = f.paths[t];
		e.beginPath(), Cr(e, o, p, n, r, i, a);
		let d = o.fill;
		if (d !== "none" && s != null) {
			e.save(), e.fillStyle = s, e.fill();
			let t = Fr(d);
			t && (e.fillStyle = t, e.fill()), e.restore(), m ||= (l(), !0);
		}
		if (o.stroke && c) {
			let e = t === h && (o.fill === "none" || o.fill == null);
			u?.skipTrailingStroke && e || c();
		}
	}
	return !0;
}
function Pr(e, t, n, r, i, a) {
	let o = wr[e.toLowerCase()];
	if (!o || o.paths.length === 0) return null;
	let s = o.paths[o.paths.length - 1], c = Dr(o, r, i, a), l = s.w == null ? 1 : r / s.w, u = s.h == null ? 1 : i / s.h, d = (e) => t + e * l, f = (e) => n + e * u, p = 0, m = 0, h = 0, g = 0, _ = 0, v = 0, y = !1, b = 0, x = 0, S = [];
	for (let e of s.cmds) switch (e[0]) {
		case "m":
			h = d(c.resolve(e[1])), g = f(c.resolve(e[2])), p = h, m = g, S.push({
				x: h,
				y: g
			});
			break;
		case "l": {
			let t = d(c.resolve(e[1])), n = f(c.resolve(e[2]));
			y ||= (_ = t - h, v = n - g, !0), b = t - h, x = n - g, h = t, g = n, S.push({
				x: h,
				y: g
			});
			break;
		}
		case "C": {
			let t = d(c.resolve(e[1])), n = f(c.resolve(e[2])), r = d(c.resolve(e[3])), i = f(c.resolve(e[4])), a = d(c.resolve(e[5])), o = f(c.resolve(e[6]));
			y ||= (_ = t - h, v = n - g, !0), b = a - r, x = o - i, h = a, g = o, S.push({
				x: h,
				y: g
			});
			break;
		}
	}
	let C = Math.atan2(v, _) + Math.PI;
	return {
		start: {
			x: p,
			y: m,
			angle: C
		},
		end: {
			x: h,
			y: g,
			angle: Math.atan2(x, b)
		},
		vertices: S
	};
}
function Fr(e) {
	switch (e) {
		case "lighten": return "rgba(255,255,255,0.30)";
		case "lightenLess": return "rgba(255,255,255,0.15)";
		case "darken": return "rgba(0,0,0,0.30)";
		case "darkenLess": return "rgba(0,0,0,0.15)";
		default: return null;
	}
}
//#endregion
//#region packages/core/src/image/svg-image-by-path.ts
var Ir = /* @__PURE__ */ new WeakMap(), Lr = 256;
function Rr(e) {
	let t = Ir.get(e);
	return t || (t = {
		imgs: /* @__PURE__ */ new Map(),
		urls: /* @__PURE__ */ new Map()
	}, Ir.set(e, t)), t;
}
function zr(e, t) {
	e.imgs.delete(t);
	let n = e.urls.get(t);
	n && (URL.revokeObjectURL(n), e.urls.delete(t));
}
function Br(e, t) {
	let n = Rr(t), r = n.imgs.get(e);
	if (r) return n.imgs.delete(e), n.imgs.set(e, r), r;
	let i = (async () => {
		let r = await t(e, "image/svg+xml"), i = URL.createObjectURL(r);
		n.urls.set(e, i);
		let a = new Image();
		return await new Promise((t, n) => {
			a.onload = () => {
				typeof a.decode == "function" ? a.decode().then(() => t()).catch(() => t()) : t();
			}, a.onerror = () => n(/* @__PURE__ */ Error(`svg load failed: ${e}`)), a.src = i;
		}), a;
	})();
	if (i.catch(() => zr(n, e)), n.imgs.set(e, i), n.imgs.size > Lr) {
		let e = n.imgs.keys().next().value;
		zr(n, e);
	}
	return i;
}
function Vr(e) {
	let t = Ir.get(e);
	if (t) {
		for (let e of t.urls.values()) URL.revokeObjectURL(e);
		t.urls.clear(), t.imgs.clear(), Ir.delete(e);
	}
}
//#endregion
//#region packages/core/src/image/pixel-budget.ts
var Hr = 32767, Ur = 1 << 26, Wr = Hr, Gr = Ur;
function Kr(e, t, n, r, i) {
	if (n < 40 || t + 40 > e.byteLength) return null;
	let a = e.getUint32(t, !0);
	if (a < 40) return null;
	let o = e.getInt32(t + 4, !0), s = e.getInt32(t + 8, !0), c = e.getUint16(t + 14, !0);
	if (e.getUint32(t + 16, !0) !== 0) return null;
	let l = s < 0, u = Math.abs(o), d = Math.abs(s);
	if (u <= 0 || d <= 0 || u > Wr || d > Wr || u * d > Gr) return null;
	let f = new Uint8ClampedArray(u * d * 4), p = u * c + 31 >> 5 << 2 >>> 0;
	if (r + p * d > r + i + p && r + p * d > e.byteLength) return null;
	let m = null;
	if (c <= 8) {
		let n = e.getUint32(t + 32, !0);
		n === 0 && (n = 1 << c);
		let r = t + a;
		m = [];
		for (let t = 0; t < n; t++) {
			let n = r + t * 4;
			if (n + 4 > e.byteLength) break;
			let i = e.getUint8(n), a = e.getUint8(n + 1), o = e.getUint8(n + 2);
			m.push(o << 16 | a << 8 | i);
		}
	}
	let h = (e, t, n, r, i, a) => {
		let o = (e * u + t) * 4;
		f[o] = n, f[o + 1] = r, f[o + 2] = i, f[o + 3] = a;
	}, g = !1;
	for (let t = 0; t < d; t++) {
		let n = l ? t : d - 1 - t, i = t, a = r + n * p;
		if (a + p > e.byteLength) break;
		if (c === 32) for (let t = 0; t < u; t++) {
			let n = a + t * 4, r = e.getUint8(n), o = e.getUint8(n + 1), s = e.getUint8(n + 2), c = e.getUint8(n + 3);
			c !== 0 && (g = !0), h(i, t, s, o, r, c);
		}
		else if (c === 24) {
			for (let t = 0; t < u; t++) {
				let n = a + t * 3;
				h(i, t, e.getUint8(n + 2), e.getUint8(n + 1), e.getUint8(n), 255);
			}
			g = !0;
		} else if (c === 8 && m) {
			for (let t = 0; t < u; t++) {
				let n = e.getUint8(a + t), r = m[n] ?? 0;
				h(i, t, r >> 16 & 255, r >> 8 & 255, r & 255, 255);
			}
			g = !0;
		} else if (c === 4 && m) {
			for (let t = 0; t < u; t++) {
				let n = e.getUint8(a + (t >> 1)), r = t & 1 ? n & 15 : n >> 4 & 15, o = m[r] ?? 0;
				h(i, t, o >> 16 & 255, o >> 8 & 255, o & 255, 255);
			}
			g = !0;
		} else if (c === 1 && m) {
			for (let t = 0; t < u; t++) {
				let n = e.getUint8(a + (t >> 3)) >> 7 - (t & 7) & 1, r = m[n] ?? 0;
				h(i, t, r >> 16 & 255, r >> 8 & 255, r & 255, 255);
			}
			g = !0;
		} else return null;
	}
	if (c === 32 && !g) for (let e = 3; e < f.length; e += 4) f[e] = 255;
	return {
		width: u,
		height: d,
		data: f
	};
}
function qr(e, t, n) {
	if (n < 40 || t + 40 > e.byteLength) return null;
	let r = e.getUint32(t, !0);
	if (r < 40) return null;
	let i = e.getUint16(t + 14, !0), a = 0;
	if (i <= 8) {
		let n = e.getUint32(t + 32, !0);
		n === 0 && (n = 1 << i), a = n;
	} else a = e.getUint32(t + 32, !0);
	let o = r + a * 4, s = t + o, c = n - o;
	return c <= 0 ? null : Kr(e, t, o, s, c);
}
function Jr(e, t, n, r, i, a) {
	try {
		let o = Pt(t.width, t.height);
		if (!o) return !1;
		let s = o.getContext("2d");
		if (!s) return !1;
		let c = s.createImageData(t.width, t.height);
		c.data.set(t.data), s.putImageData(c, 0, 0);
		let l = Math.min(n, i), u = Math.min(r, a), d = Math.abs(i - n), f = Math.abs(a - r);
		return e.drawImage(o, l, u, d, f), !0;
	} catch {
		return !1;
	}
}
//#endregion
//#region packages/core/src/image/emf.ts
var Q = {
	HEADER: 1,
	POLYBEZIER: 2,
	POLYGON: 3,
	POLYLINE: 4,
	POLYBEZIERTO: 5,
	POLYLINETO: 6,
	POLYPOLYLINE: 7,
	POLYPOLYGON: 8,
	SETWINDOWEXTEX: 9,
	SETWINDOWORGEX: 10,
	SETVIEWPORTEXTEX: 11,
	SETVIEWPORTORGEX: 12,
	EOF: 14,
	SETMAPMODE: 17,
	SETPOLYFILLMODE: 19,
	SETBKMODE: 18,
	SETTEXTALIGN: 22,
	SETTEXTCOLOR: 24,
	MOVETOEX: 27,
	SCALEVIEWPORTEXTEX: 31,
	SCALEWINDOWEXTEX: 32,
	SAVEDC: 33,
	RESTOREDC: 34,
	SETWORLDTRANSFORM: 35,
	MODIFYWORLDTRANSFORM: 36,
	SELECTOBJECT: 37,
	CREATEPEN: 38,
	CREATEBRUSHINDIRECT: 39,
	DELETEOBJECT: 40,
	ELLIPSE: 42,
	RECTANGLE: 43,
	LINETO: 54,
	BEGINPATH: 59,
	ENDPATH: 60,
	CLOSEFIGURE: 61,
	SELECTCLIPPATH: 67,
	EXTCREATEFONTINDIRECTW: 82,
	EXTTEXTOUTW: 84,
	POLYBEZIER16: 85,
	POLYGON16: 86,
	POLYLINE16: 87,
	POLYBEZIERTO16: 88,
	POLYLINETO16: 89,
	POLYPOLYLINE16: 90,
	POLYPOLYGON16: 91,
	CREATEMONOBRUSH: 93,
	CREATEDIBPATTERNBRUSHPT: 94,
	EXTCREATEPEN: 95,
	BITBLT: 76,
	STRETCHDIBITS: 81
}, Yr = {
	WHITE_BRUSH: 2147483648,
	LTGRAY_BRUSH: 2147483649,
	GRAY_BRUSH: 2147483650,
	DKGRAY_BRUSH: 2147483651,
	BLACK_BRUSH: 2147483652,
	NULL_BRUSH: 2147483653,
	WHITE_PEN: 2147483654,
	BLACK_PEN: 2147483655,
	NULL_PEN: 2147483656,
	DC_BRUSH: 2147483666,
	DC_PEN: 2147483662
}, Xr = {
	TEXT: 1,
	LOMETRIC: 2,
	HIMETRIC: 3,
	LOENGLISH: 4,
	HIENGLISH: 5,
	TWIPS: 6,
	ISOTROPIC: 7,
	ANISOTROPIC: 8
}, Zr = () => ({
	m11: 1,
	m12: 0,
	m21: 0,
	m22: 1,
	dx: 0,
	dy: 0
});
function Qr(e, t) {
	return {
		m11: e.m11 * t.m11 + e.m21 * t.m12,
		m12: e.m12 * t.m11 + e.m22 * t.m12,
		m21: e.m11 * t.m21 + e.m21 * t.m22,
		m22: e.m12 * t.m21 + e.m22 * t.m22,
		dx: e.m11 * t.dx + e.m21 * t.dy + e.dx,
		dy: e.m12 * t.dx + e.m22 * t.dy + e.dy
	};
}
var $r = class {
	p;
	constructor(e, t, n) {
		this.dv = e, this.end = n, this.p = t;
	}
	get pos() {
		return this.p;
	}
	set pos(e) {
		this.p = e;
	}
	get remaining() {
		return this.end - this.p;
	}
	i16() {
		let e = this.dv.getInt16(this.p, !0);
		return this.p += 2, e;
	}
	i32() {
		let e = this.dv.getInt32(this.p, !0);
		return this.p += 4, e;
	}
	u32() {
		let e = this.dv.getUint32(this.p, !0);
		return this.p += 4, e;
	}
	f32() {
		let e = this.dv.getFloat32(this.p, !0);
		return this.p += 4, e;
	}
	xform() {
		return {
			m11: this.f32(),
			m12: this.f32(),
			m21: this.f32(),
			m22: this.f32(),
			dx: this.f32(),
			dy: this.f32()
		};
	}
	skip(e) {
		this.p += e;
	}
};
function ei(e, t, n) {
	return e.wt.m11 * t + e.wt.m21 * n + e.wt.dx;
}
function ti(e, t, n) {
	return e.wt.m12 * t + e.wt.m22 * n + e.wt.dy;
}
function ni(e) {
	return e.winExtX === 0 ? 1 : e.vpExtX / e.winExtX;
}
function ri(e) {
	return e.winExtY === 0 ? 1 : e.vpExtY / e.winExtY;
}
function ii(e) {
	return Math.min(Math.abs(ni(e)), Math.abs(ri(e)));
}
function ai(e) {
	return e.mapMode === Xr.ISOTROPIC ? ni(e) < 0 ? -ii(e) : ii(e) : ni(e);
}
function oi(e) {
	return e.mapMode === Xr.ISOTROPIC ? ri(e) < 0 ? -ii(e) : ii(e) : ri(e);
}
function si(e, t) {
	return (t - e.winOrgX) * ai(e) + e.vpOrgX;
}
function ci(e, t) {
	return (t - e.winOrgY) * oi(e) + e.vpOrgY;
}
function li(e, t, n) {
	let r = si(e, ei(e, t, n)), i = ci(e, ti(e, t, n));
	return [(r - e.left) * e.W / e.boundsW, (i - e.top) * e.H / e.boundsH];
}
function ui(e) {
	return (Math.hypot(e.wt.m11, e.wt.m12) + Math.hypot(e.wt.m21, e.wt.m22)) / 2;
}
function di(e) {
	return (Math.abs(ai(e)) + Math.abs(oi(e))) / 2;
}
function fi(e) {
	return (e.W / e.boundsW + e.H / e.boundsH) / 2;
}
function pi(e) {
	return Math.hypot(e.wt.m21, e.wt.m22);
}
function mi(e) {
	return e.H / e.boundsH;
}
function hi(e, t) {
	let n = t * ui(e) * di(e) * fi(e);
	return Math.max(.75, n);
}
function gi(e, t) {
	if (e.mapMode = t, t === Xr.TEXT) {
		e.winOrgX = 0, e.winOrgY = 0, e.vpOrgX = 0, e.vpOrgY = 0, e.winExtX = 1, e.winExtY = 1, e.vpExtX = 1, e.vpExtY = 1;
		return;
	}
	if (t === Xr.ANISOTROPIC || t === Xr.ISOTROPIC || e.devPxPerMmX <= 0 || e.devPxPerMmY <= 0) return;
	let n = 25.4, r = t === Xr.LOMETRIC ? .1 : t === Xr.HIMETRIC ? .01 : t === Xr.LOENGLISH ? .01 * n : t === Xr.HIENGLISH ? .001 * n : t === Xr.TWIPS ? n / 1440 : 0;
	r <= 0 || (e.winOrgX = 0, e.winOrgY = 0, e.vpOrgX = 0, e.vpOrgY = 0, e.winExtX = 1, e.winExtY = 1, e.vpExtX = r * e.devPxPerMmX, e.vpExtY = -(r * e.devPxPerMmY));
}
var _i = {
	[Yr.WHITE_BRUSH]: {
		kind: "brush",
		fill: "#ffffff"
	},
	[Yr.LTGRAY_BRUSH]: {
		kind: "brush",
		fill: "#c0c0c0"
	},
	[Yr.GRAY_BRUSH]: {
		kind: "brush",
		fill: "#808080"
	},
	[Yr.DKGRAY_BRUSH]: {
		kind: "brush",
		fill: "#404040"
	},
	[Yr.BLACK_BRUSH]: {
		kind: "brush",
		fill: "#000000"
	},
	[Yr.NULL_BRUSH]: {
		kind: "brush",
		fill: null
	}
}, vi = {
	[Yr.WHITE_PEN]: {
		kind: "pen",
		stroke: "#ffffff",
		width: 1
	},
	[Yr.BLACK_PEN]: {
		kind: "pen",
		stroke: "#000000",
		width: 1
	},
	[Yr.NULL_PEN]: {
		kind: "pen",
		stroke: null,
		width: 1
	},
	[Yr.DC_PEN]: {
		kind: "pen",
		stroke: "#000000",
		width: 1
	}
};
function yi(e, t) {
	let n = _i[t];
	if (n) {
		e.curBrush = n;
		return;
	}
	let r = vi[t];
	if (r) {
		e.curPen = r;
		return;
	}
	t === Yr.DC_BRUSH && (e.curBrush = e.curBrush ?? {
		kind: "brush",
		fill: "#000000"
	});
}
function bi(e) {
	let t = 0, n = 0, r = 0, i = 0;
	for (let a = 0; a < e.data.length; a += 4) e.data[a + 3] !== 0 && (t += e.data[a], n += e.data[a + 1], r += e.data[a + 2], i++);
	if (i === 0) return "#808080";
	let a = (e) => Math.round(e / i).toString(16).padStart(2, "0");
	return `#${a(t)}${a(n)}${a(r)}`;
}
var xi = (e) => [e.i16(), e.i16()], Si = (e) => [e.i32(), e.i32()];
function Ci(e, t, n) {
	t.skip(16);
	let r = t.u32();
	if (r < 2 || r > 1048576 || !e.curPen || e.curPen.stroke == null) return;
	let { ctx: i } = e;
	i.beginPath();
	let a = 0, o = 0;
	for (let s = 0; s < r && !(t.remaining < 4); s++) {
		let [r, c] = n(t), [l, u] = li(e, r, c);
		s === 0 ? i.moveTo(l, u) : i.lineTo(l, u), a = r, o = c;
	}
	i.strokeStyle = e.curPen.stroke, i.lineWidth = hi(e, e.curPen.width), i.stroke(), e.drew = !0, e.curX = a, e.curY = o;
}
function wi(e, t, n) {
	t.skip(16);
	let r = t.u32();
	if (r < 1 || r > 1048576) return;
	let { ctx: i } = e, a = e.curPen != null && e.curPen.stroke != null;
	if (a) {
		i.beginPath();
		let [t, n] = li(e, e.curX, e.curY);
		i.moveTo(t, n);
	}
	for (let o = 0; o < r && !(t.remaining < 4); o++) {
		let [r, o] = n(t);
		if (a) {
			let [t, n] = li(e, r, o);
			i.lineTo(t, n);
		}
		e.curX = r, e.curY = o;
	}
	a && e.curPen && (i.strokeStyle = e.curPen.stroke, i.lineWidth = hi(e, e.curPen.width), i.stroke(), e.drew = !0);
}
function Ti(e, t, n) {
	t.skip(16);
	let r = t.u32();
	if (r < 2 || r > 1048576) return;
	let { ctx: i } = e;
	e.inPath || i.beginPath();
	let a = !1;
	for (let o = 0; o < r && !(t.remaining < 4); o++) {
		let [r, o] = n(t), [s, c] = li(e, r, o);
		a ? i.lineTo(s, c) : (i.moveTo(s, c), a = !0);
	}
	a && (i.closePath(), !e.inPath && (e.curBrush && e.curBrush.fill != null && (i.fillStyle = e.curBrush.fill, i.fill(e.fillRule), e.drew = !0), e.curPen && e.curPen.stroke != null && (i.strokeStyle = e.curPen.stroke, i.lineWidth = hi(e, e.curPen.width), i.stroke(), e.drew = !0)));
}
function Ei(e, t, n, r) {
	t.skip(16);
	let i = t.u32();
	if (i < 1 || i > 1048576) return;
	let a = [];
	for (let e = 0; e < i && !(t.remaining < 4); e++) a.push(n(t));
	if (a.length < (r ? 3 : 4)) {
		a.length && (e.curX = a[a.length - 1][0], e.curY = a[a.length - 1][1]);
		return;
	}
	let o = e.curPen != null && e.curPen.stroke != null, { ctx: s } = e;
	if (o) {
		s.beginPath();
		let t = r ? li(e, e.curX, e.curY) : li(e, a[0][0], a[0][1]);
		s.moveTo(t[0], t[1]);
	}
	let c = +!r;
	for (; c + 2 < a.length + +!!r; c += 3) {
		let t = a[c], n = a[c + 1], r = a[c + 2];
		if (!t || !n || !r) break;
		if (o) {
			let i = li(e, t[0], t[1]), a = li(e, n[0], n[1]), o = li(e, r[0], r[1]);
			s.bezierCurveTo(i[0], i[1], a[0], a[1], o[0], o[1]);
		}
		e.curX = r[0], e.curY = r[1];
	}
	o && e.curPen && (s.strokeStyle = e.curPen.stroke, s.lineWidth = hi(e, e.curPen.width), s.stroke(), e.drew = !0);
}
function Di(e, t, n, r) {
	t.skip(16);
	let i = t.u32(), a = t.u32();
	if (i <= 0 || i > 65536 || a <= 0 || a > 2097152) return;
	let o = [];
	for (let e = 0; e < i; e++) {
		if (t.remaining < 4) return;
		o.push(t.u32());
	}
	let { ctx: s } = e;
	e.inPath || s.beginPath();
	let c = !1;
	for (let i of o) {
		if (i < 2) {
			for (let e = 0; e < i && t.remaining >= 4; e++) n(t);
			continue;
		}
		for (let r = 0; r < i && !(t.remaining < 4); r++) {
			let [i, a] = n(t), [o, c] = li(e, i, a);
			r === 0 ? s.moveTo(o, c) : s.lineTo(o, c);
		}
		r && s.closePath(), c = !0;
	}
	!c || e.inPath || (r && e.curBrush && e.curBrush.fill != null && (s.fillStyle = e.curBrush.fill, s.fill(e.fillRule), e.drew = !0), e.curPen && e.curPen.stroke != null && (s.strokeStyle = e.curPen.stroke, s.lineWidth = hi(e, e.curPen.width), s.stroke(), e.drew = !0));
}
function Oi(e, t, n, r, i) {
	let { ctx: a } = e, o = li(e, t, n), s = li(e, r, n), c = li(e, r, i), l = li(e, t, i);
	e.inPath || a.beginPath(), a.moveTo(o[0], o[1]), a.lineTo(s[0], s[1]), a.lineTo(c[0], c[1]), a.lineTo(l[0], l[1]), a.closePath(), !e.inPath && (e.curBrush && e.curBrush.fill != null && (a.fillStyle = e.curBrush.fill, a.fill(e.fillRule), e.drew = !0), e.curPen && e.curPen.stroke != null && (a.strokeStyle = e.curPen.stroke, a.lineWidth = hi(e, e.curPen.width), a.stroke(), e.drew = !0));
}
function ki(e) {
	let t = e.u32(), n = e.u32(), r = e.i32();
	e.i32();
	let i = e.u32();
	return [t, {
		kind: "pen",
		stroke: (n & 255) == 5 ? null : aa(i),
		width: Math.abs(r)
	}];
}
function Ai(e) {
	let t = e.u32();
	e.skip(16);
	let n = e.u32(), r = e.u32();
	e.u32();
	let i = e.u32();
	return [t, {
		kind: "pen",
		stroke: (n & 255) == 5 ? null : aa(i),
		width: Math.abs(r)
	}];
}
function ji(e) {
	let t = e.u32(), n = e.u32(), r = e.u32();
	return e.u32(), [t, {
		kind: "brush",
		fill: n === 1 ? null : aa(r)
	}];
}
function Mi(e, t, n) {
	let r = e.u32();
	e.u32();
	let i = e.u32(), a = e.u32(), o = e.u32(), s = e.u32(), c = "#808080";
	try {
		let e = Kr(t, n + i, a, n + o, s);
		e && (c = bi(e));
	} catch {}
	return [r, {
		kind: "brush",
		fill: c
	}];
}
function Ni(e, t, n) {
	let r = e.u32(), i = n + 12, a = t.getInt32(i, !0), o = t.getInt32(i + 8, !0), s = t.getInt32(i + 16, !0), c = t.getUint8(i + 20), l = "";
	for (let e = 0; e < 32; e++) {
		let n = i + 28 + e * 2;
		if (n + 2 > t.byteLength) break;
		let r = t.getUint16(n, !0);
		if (r === 0) break;
		l += String.fromCharCode(r);
	}
	return [r, {
		kind: "font",
		height: Math.abs(a),
		weight: s,
		italic: c !== 0,
		face: l,
		escapement: o
	}];
}
function Pi(e, t, n, r) {
	t.skip(16), t.u32(), t.f32(), t.f32();
	let i = t.i32(), a = t.i32(), o = t.u32(), s = t.u32();
	if (t.u32(), o <= 0 || o > 65536) return;
	let c = "";
	for (let e = 0; e < o; e++) {
		let t = r + s + e * 2;
		if (t + 2 > n.byteLength) break;
		c += String.fromCharCode(n.getUint16(t, !0));
	}
	if (c.length === 0) return;
	let l = e.curFont, u = Math.abs(l?.height ?? 0) * pi(e) * Math.abs(oi(e)) * mi(e);
	if (!Number.isFinite(u) || u < 1) return;
	let { ctx: d } = e, [f, p] = li(e, i, a);
	d.fillStyle = e.textColor;
	let m = l && l.weight >= 700 ? "bold " : "";
	d.font = `${l?.italic ? "italic " : ""}${m}${u}px ${l?.face || "sans-serif"}`;
	let h = e.textAlign & 6;
	d.textAlign = h === 2 ? "right" : h === 6 ? "center" : "left", d.textBaseline = (e.textAlign & 24) == 24 ? "alphabetic" : "top";
	let g = l?.escapement ?? 0;
	try {
		if (g !== 0) {
			d.save();
			try {
				d.translate(f, p), d.rotate(-g / 10 * (Math.PI / 180)), d.fillText(c, 0, 0);
			} finally {
				d.restore();
			}
		} else d.fillText(c, f, p);
		e.drew = !0;
	} catch {}
}
function Fi(e, t, n, r, i, a, o, s, c, l, u) {
	if (i === 0 || o === 0) return;
	let d = Kr(t, n + r, i, n + a, o);
	if (!d) return;
	let [f, p] = li(e, s, c), [m, h] = li(e, l, u);
	Jr(e.ctx, d, f, p, m, h) && (e.drew = !0);
}
function Ii(e, t, n, r) {
	t.skip(16);
	let i = t.i32(), a = t.i32(), o = t.i32(), s = t.i32();
	t.u32(), t.i32(), t.i32(), t.skip(24), t.u32(), t.u32(), Fi(e, n, r, t.u32(), t.u32(), t.u32(), t.u32(), i, a, i + o, a + s);
}
function Li(e, t, n, r) {
	t.skip(16);
	let i = t.i32(), a = t.i32();
	t.i32(), t.i32(), t.i32(), t.i32();
	let o = t.u32(), s = t.u32(), c = t.u32(), l = t.u32();
	t.u32(), t.u32();
	let u = t.i32(), d = t.i32();
	Fi(e, n, r, o, s, c, l, i, a, i + u, a + d);
}
function Ri(e, t, n, r) {
	if (!ra(e) || n <= 0 || r <= 0) return !1;
	let i = new DataView(e.buffer, e.byteOffset, e.byteLength), a = {
		ctx: t,
		W: n,
		H: r,
		left: 0,
		top: 0,
		boundsW: n,
		boundsH: r,
		wt: Zr(),
		mapMode: Xr.TEXT,
		winOrgX: 0,
		winOrgY: 0,
		winExtX: 1,
		winExtY: 1,
		vpOrgX: 0,
		vpOrgY: 0,
		vpExtX: 1,
		vpExtY: 1,
		devPxPerMmX: 0,
		devPxPerMmY: 0,
		objects: /* @__PURE__ */ new Map(),
		curPen: null,
		curBrush: null,
		curFont: null,
		textColor: "#000000",
		bkMode: 1,
		textAlign: 0,
		fillRule: "nonzero",
		curX: 0,
		curY: 0,
		stack: [],
		drew: !1,
		inPath: !1
	}, o = 0;
	for (; o + 8 <= e.length;) {
		let n = i.getUint32(o, !0), r = i.getUint32(o + 4, !0);
		if (r < 8 || r & 3) break;
		let s = o + r;
		if (s > e.length || n === Q.EOF) break;
		let c = new $r(i, o + 8, s);
		try {
			switch (n) {
				case Q.HEADER: {
					let e = i.getInt32(o + 8, !0), t = i.getInt32(o + 12, !0), n = i.getInt32(o + 16, !0), r = i.getInt32(o + 20, !0);
					if (a.left = e, a.top = t, a.boundsW = Math.max(1, n - e), a.boundsH = Math.max(1, r - t), s >= o + 88) {
						let e = i.getInt32(o + 24, !0), t = i.getInt32(o + 28, !0), n = i.getInt32(o + 32, !0), r = i.getInt32(o + 36, !0), s = i.getInt32(o + 72, !0), c = i.getInt32(o + 76, !0), l = i.getInt32(o + 80, !0), u = i.getInt32(o + 84, !0), d = n - e, f = r - t;
						if (d > 0 && f > 0 && s > 0 && c > 0 && l > 0 && u > 0) {
							let n = s / (l * 100), r = c / (u * 100);
							a.left = e * n, a.top = t * r, a.boundsW = Math.max(1, d * n), a.boundsH = Math.max(1, f * r), a.devPxPerMmX = s / l, a.devPxPerMmY = c / u;
						}
					}
					break;
				}
				case Q.SETWORLDTRANSFORM:
					a.wt = c.xform();
					break;
				case Q.MODIFYWORLDTRANSFORM: {
					let e = c.xform(), t = c.u32();
					t === 1 ? a.wt = Zr() : t === 2 ? a.wt = Qr(e, a.wt) : t === 3 ? a.wt = Qr(a.wt, e) : t === 4 && (a.wt = e);
					break;
				}
				case Q.SETMAPMODE:
					gi(a, c.u32());
					break;
				case Q.SETWINDOWORGEX:
					a.winOrgX = c.i32(), a.winOrgY = c.i32();
					break;
				case Q.SETWINDOWEXTEX: {
					let e = c.i32(), t = c.i32();
					e !== 0 && (a.winExtX = e), t !== 0 && (a.winExtY = t);
					break;
				}
				case Q.SETVIEWPORTORGEX:
					a.vpOrgX = c.i32(), a.vpOrgY = c.i32();
					break;
				case Q.SETVIEWPORTEXTEX: {
					let e = c.i32(), t = c.i32();
					e !== 0 && (a.vpExtX = e), t !== 0 && (a.vpExtY = t);
					break;
				}
				case Q.SCALEWINDOWEXTEX: {
					let e = c.i32(), t = c.i32(), n = c.i32(), r = c.i32();
					t !== 0 && (a.winExtX = a.winExtX * e / t), r !== 0 && (a.winExtY = a.winExtY * n / r);
					break;
				}
				case Q.SCALEVIEWPORTEXTEX: {
					let e = c.i32(), t = c.i32(), n = c.i32(), r = c.i32();
					t !== 0 && (a.vpExtX = a.vpExtX * e / t), r !== 0 && (a.vpExtY = a.vpExtY * n / r);
					break;
				}
				case Q.SAVEDC:
					a.ctx.save(), a.stack.push({
						wt: { ...a.wt },
						mapMode: a.mapMode,
						winOrgX: a.winOrgX,
						winOrgY: a.winOrgY,
						winExtX: a.winExtX,
						winExtY: a.winExtY,
						vpOrgX: a.vpOrgX,
						vpOrgY: a.vpOrgY,
						vpExtX: a.vpExtX,
						vpExtY: a.vpExtY,
						curPen: a.curPen,
						curBrush: a.curBrush,
						curFont: a.curFont,
						textColor: a.textColor,
						bkMode: a.bkMode,
						textAlign: a.textAlign,
						fillRule: a.fillRule,
						curX: a.curX,
						curY: a.curY
					});
					break;
				case Q.RESTOREDC: {
					let e = c.i32(), t = Math.min(Math.abs(e) || 1, a.stack.length), n;
					for (let e = 0; e < t; e++) n = a.stack.pop(), a.ctx.restore();
					n && (a.wt = n.wt, a.mapMode = n.mapMode, a.winOrgX = n.winOrgX, a.winOrgY = n.winOrgY, a.winExtX = n.winExtX, a.winExtY = n.winExtY, a.vpOrgX = n.vpOrgX, a.vpOrgY = n.vpOrgY, a.vpExtX = n.vpExtX, a.vpExtY = n.vpExtY, a.curPen = n.curPen, a.curBrush = n.curBrush, a.curFont = n.curFont, a.textColor = n.textColor, a.bkMode = n.bkMode, a.textAlign = n.textAlign, a.fillRule = n.fillRule, a.curX = n.curX, a.curY = n.curY);
					break;
				}
				case Q.BEGINPATH:
					a.ctx.beginPath(), a.inPath = !0;
					break;
				case Q.CLOSEFIGURE:
					a.inPath && a.ctx.closePath();
					break;
				case Q.ENDPATH:
					a.inPath = !1;
					break;
				case Q.SELECTCLIPPATH:
					try {
						a.ctx.clip(a.fillRule);
					} catch {}
					break;
				case Q.SELECTOBJECT: {
					let e = c.u32();
					if (e & 2147483648) yi(a, e >>> 0);
					else {
						let t = a.objects.get(e);
						t?.kind === "pen" ? a.curPen = t : t?.kind === "brush" ? a.curBrush = t : t?.kind === "font" && (a.curFont = t);
					}
					break;
				}
				case Q.DELETEOBJECT: {
					let e = c.u32(), t = a.objects.get(e);
					t && (t === a.curPen && (a.curPen = null), t === a.curBrush && (a.curBrush = null), t === a.curFont && (a.curFont = null), a.objects.delete(e));
					break;
				}
				case Q.CREATEPEN: {
					let [e, t] = ki(c);
					a.objects.set(e, t);
					break;
				}
				case Q.EXTCREATEPEN: {
					let [e, t] = Ai(c);
					a.objects.set(e, t);
					break;
				}
				case Q.CREATEBRUSHINDIRECT: {
					let [e, t] = ji(c);
					a.objects.set(e, t);
					break;
				}
				case Q.CREATEMONOBRUSH:
				case Q.CREATEDIBPATTERNBRUSHPT: {
					let [e, t] = Mi(c, i, o);
					a.objects.set(e, t);
					break;
				}
				case Q.EXTCREATEFONTINDIRECTW: {
					let [e, t] = Ni(c, i, o);
					a.objects.set(e, t);
					break;
				}
				case Q.POLYLINE16:
					Ci(a, c, xi);
					break;
				case Q.POLYLINE:
					Ci(a, c, Si);
					break;
				case Q.POLYLINETO16:
					wi(a, c, xi);
					break;
				case Q.POLYLINETO:
					wi(a, c, Si);
					break;
				case Q.POLYGON16:
					Ti(a, c, xi);
					break;
				case Q.POLYGON:
					Ti(a, c, Si);
					break;
				case Q.POLYBEZIER16:
					Ei(a, c, xi, !1);
					break;
				case Q.POLYBEZIER:
					Ei(a, c, Si, !1);
					break;
				case Q.POLYBEZIERTO16:
					Ei(a, c, xi, !0);
					break;
				case Q.POLYBEZIERTO:
					Ei(a, c, Si, !0);
					break;
				case Q.POLYPOLYGON16:
					Di(a, c, xi, !0);
					break;
				case Q.POLYPOLYGON:
					Di(a, c, Si, !0);
					break;
				case Q.POLYPOLYLINE16:
					Di(a, c, xi, !1);
					break;
				case Q.POLYPOLYLINE:
					Di(a, c, Si, !1);
					break;
				case Q.MOVETOEX:
					a.curX = c.i32(), a.curY = c.i32();
					break;
				case Q.LINETO: {
					let e = c.i32(), n = c.i32();
					if (a.curPen && a.curPen.stroke != null) {
						let [r, i] = li(a, a.curX, a.curY), [o, s] = li(a, e, n);
						t.beginPath(), t.moveTo(r, i), t.lineTo(o, s), t.strokeStyle = a.curPen.stroke, t.lineWidth = hi(a, a.curPen.width), t.stroke(), a.drew = !0;
					}
					a.curX = e, a.curY = n;
					break;
				}
				case Q.RECTANGLE:
					Oi(a, c.i32(), c.i32(), c.i32(), c.i32());
					break;
				case Q.ELLIPSE: {
					let e = c.i32(), n = c.i32(), r = c.i32(), i = c.i32(), [o, s] = [(e + r) / 2, (n + i) / 2], [l, u] = li(a, o, s), [d] = li(a, r, s), [, f] = li(a, o, i), p = Math.abs(d - l), m = Math.abs(f - u);
					t.beginPath(), t.ellipse(l, u, p, m, 0, 0, Math.PI * 2), a.curBrush && a.curBrush.fill != null && (t.fillStyle = a.curBrush.fill, t.fill(a.fillRule), a.drew = !0), a.curPen && a.curPen.stroke != null && (t.strokeStyle = a.curPen.stroke, t.lineWidth = hi(a, a.curPen.width), t.stroke(), a.drew = !0);
					break;
				}
				case Q.SETPOLYFILLMODE:
					a.fillRule = c.u32() === 1 ? "evenodd" : "nonzero";
					break;
				case Q.SETTEXTCOLOR:
					a.textColor = aa(c.u32());
					break;
				case Q.SETTEXTALIGN:
					a.textAlign = c.u32();
					break;
				case Q.SETBKMODE:
					a.bkMode = c.u32();
					break;
				case Q.EXTTEXTOUTW:
					Pi(a, c, i, o);
					break;
				case Q.BITBLT:
					Ii(a, c, i, o);
					break;
				case Q.STRETCHDIBITS:
					Li(a, c, i, o);
					break;
				default: break;
			}
		} catch {}
		o = s;
	}
	return a.drew;
}
async function zi(e, t, n) {
	if (!ra(e) || t <= 0 || n <= 0) return null;
	let r = Pt(t, n);
	if (!r) return null;
	let i = r.getContext("2d");
	return !i || (i.lineJoin = "round", i.lineCap = "round", !Ri(e, i, t, n)) ? null : createImageBitmap(r);
}
//#endregion
//#region packages/core/src/image/raster-dimensions.ts
function Bi(e, t) {
	return e[t] << 8 | e[t + 1];
}
function Vi(e, t) {
	return (e[t] << 24 | e[t + 1] << 16 | e[t + 2] << 8 | e[t + 3]) >>> 0;
}
function Hi(e, t) {
	return e[t] | e[t + 1] << 8;
}
function Ui(e, t) {
	return e[t] | e[t + 1] << 8 | e[t + 2] << 16 | e[t + 3] << 24 | 0;
}
function Wi(e) {
	let t = e.length;
	return t >= 24 && e[0] === 137 && e[1] === 80 && e[2] === 78 && e[3] === 71 && e[4] === 13 && e[5] === 10 && e[6] === 26 && e[7] === 10 ? e[12] === 73 && e[13] === 72 && e[14] === 68 && e[15] === 82 ? {
		width: Vi(e, 16),
		height: Vi(e, 20)
	} : null : t >= 10 && e[0] === 71 && e[1] === 73 && e[2] === 70 && e[3] === 56 && (e[4] === 55 || e[4] === 57) && e[5] === 97 ? {
		width: Hi(e, 6),
		height: Hi(e, 8)
	} : t >= 26 && e[0] === 66 && e[1] === 77 ? Gi(e, 14) === 12 ? {
		width: Hi(e, 18),
		height: Hi(e, 20)
	} : {
		width: Math.abs(Ui(e, 18)),
		height: Math.abs(Ui(e, 22))
	} : t >= 16 && e[0] === 82 && e[1] === 73 && e[2] === 70 && e[3] === 70 && e[8] === 87 && e[9] === 69 && e[10] === 66 && e[11] === 80 ? Ki(e) : t >= 4 && e[0] === 255 && e[1] === 216 ? qi(e) : null;
}
function Gi(e, t) {
	return (e[t] | e[t + 1] << 8 | e[t + 2] << 16 | e[t + 3] << 24) >>> 0;
}
function Ki(e) {
	let t = e.length, n = e[12], r = e[13], i = e[14], a = e[15];
	if (n === 86 && r === 80 && i === 56 && a === 32) return t < 30 ? null : {
		width: Hi(e, 26) & 16383,
		height: Hi(e, 28) & 16383
	};
	if (n === 86 && r === 80 && i === 56 && a === 76) {
		if (t < 25 || e[20] !== 47) return null;
		let n = Gi(e, 21);
		return {
			width: (n & 16383) + 1,
			height: (n >>> 14 & 16383) + 1
		};
	}
	return n === 86 && r === 80 && i === 56 && a === 88 ? t < 30 ? null : {
		width: (e[24] | e[25] << 8 | e[26] << 16) + 1,
		height: (e[27] | e[28] << 8 | e[29] << 16) + 1
	} : null;
}
function qi(e) {
	let t = e.length, n = 2;
	for (; n + 1 < t;) {
		if (e[n] !== 255) {
			n += 1;
			continue;
		}
		let r = e[n + 1];
		if (r === 255) {
			n += 1;
			continue;
		}
		if (r === 216 || r === 1 || r >= 208 && r <= 215) {
			n += 2;
			continue;
		}
		if (r === 217 || n + 3 >= t) return null;
		let i = Bi(e, n + 2);
		if (r >= 192 && r <= 207 && r !== 196 && r !== 200 && r !== 204) {
			if (n + 8 >= t) return null;
			let r = Bi(e, n + 5);
			return {
				width: Bi(e, n + 7),
				height: r
			};
		}
		if (i < 2) return null;
		n += 2 + i;
	}
	return null;
}
function Ji(e) {
	let { width: t, height: n } = e;
	return !Number.isFinite(t) || !Number.isFinite(n) || t <= 0 || n <= 0 || t > 32767 || n > 32767 ? !0 : t * n > Ur;
}
function Yi(e) {
	let t = Wi(e);
	return t !== null && Ji(t);
}
//#endregion
//#region packages/core/src/image/wmf.ts
var Xi = {
	EOF: 0,
	SETPOLYFILLMODE: 262,
	SETWINDOWORG: 523,
	SETWINDOWEXT: 524,
	SELECTOBJECT: 301,
	DELETEOBJECT: 496,
	POLYGON: 804,
	POLYLINE: 805,
	POLYPOLYGON: 1336,
	RECTANGLE: 1051,
	CREATEPENINDIRECT: 762,
	CREATEBRUSHINDIRECT: 764,
	DIBBITBLT: 2368,
	DIBSTRETCHBLT: 2881,
	STRETCHDIBITS: 3907
}, Zi = 2596720087, Qi = 22, $i = 18, ea = 1179469088;
function ta(e, t) {
	if (e.length < t + $i) return !1;
	let n = e[t] | e[t + 1] << 8, r = e[t + 2] | e[t + 3] << 8;
	return (n === 1 || n === 2) && r === 9;
}
function na(e) {
	return e.length < 4 ? !1 : (e[0] | e[1] << 8 | e[2] << 16 | e[3] << 24) >>> 0 === Zi ? !0 : ta(e, 0);
}
function ra(e) {
	if (e.length < 44) return !1;
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength);
	return t.getUint32(0, !0) === 1 && t.getUint32(40, !0) === ea;
}
function ia(e) {
	return e === "image/wmf" || e === "image/emf";
}
function aa(e) {
	let t = e & 255, n = e >>> 8 & 255, r = e >>> 16 & 255, i = (e) => e.toString(16).padStart(2, "0");
	return `#${i(t)}${i(n)}${i(r)}`;
}
function oa(e, t) {
	for (let n = 0; n < e.length; n++) if (e[n] == null) {
		e[n] = t;
		return;
	}
	e.push(t);
}
var sa = class {
	p = 0;
	constructor(e, t, n) {
		this.b = e, this.end = n, this.p = t;
	}
	get remaining() {
		return this.end - this.p;
	}
	i16() {
		let e = this.u16();
		return e >= 32768 ? e - 65536 : e;
	}
	u16() {
		let e = this.b[this.p] | this.b[this.p + 1] << 8;
		return this.p += 2, e;
	}
	u32() {
		let e = (this.b[this.p] | this.b[this.p + 1] << 8 | this.b[this.p + 2] << 16 | this.b[this.p + 3] << 24) >>> 0;
		return this.p += 4, e;
	}
};
function ca(e, t) {
	return (t - e.orgX) * (e.W / e.extX);
}
function la(e, t) {
	return (t - e.orgY) * (e.H / e.extY);
}
function ua(e, t) {
	let n = t * Math.abs(e.W / e.extX);
	return n >= 1 ? n : 1;
}
var da = .001;
function fa(e, t, n) {
	return Math.abs(e - t) <= da || Math.abs(e - n) <= da;
}
function pa(e, t, n) {
	let r = [], i = n ? t.length : t.length - 1;
	for (let n = 0; n < i; n++) {
		let i = t[n], a = t[(n + 1) % t.length], o = Math.abs(i[0] - a[0]) <= da && fa(i[0], 0, e.W) && fa(a[0], 0, e.W), s = Math.abs(i[1] - a[1]) <= da && fa(i[1], 0, e.H) && fa(a[1], 0, e.H);
		o || s || r.push([i, a]);
	}
	return r;
}
function ma(e, t, n) {
	if (!e.curPen || e.curPen.stroke == null || t.length < 2) return;
	let { ctx: r } = e;
	if (r.strokeStyle = e.curPen.stroke, r.lineWidth = ua(e, e.curPen.width), !e.suppressBoundaryFrame) {
		r.beginPath(), r.moveTo(t[0][0], t[0][1]);
		for (let e = 1; e < t.length; e++) r.lineTo(t[e][0], t[e][1]);
		n && r.closePath(), r.stroke(), e.drew = !0;
		return;
	}
	let i = pa(e, t, n);
	if (i.length === 0) return;
	r.beginPath();
	let a = null;
	for (let [e, t] of i) (!a || a[0] !== e[0] || a[1] !== e[1]) && r.moveTo(e[0], e[1]), r.lineTo(t[0], t[1]), a = t;
	r.stroke(), e.drew = !0;
}
function ha(e, t, n) {
	let r = [];
	for (let i = 0; i < n && !(t.remaining < 4); i++) {
		let n = t.i16(), i = t.i16();
		r.push([ca(e, n), la(e, i)]);
	}
	return r;
}
function ga(e, t) {
	t.length < 2 || !e.curPen || e.curPen.stroke == null || ma(e, t, !1);
}
function _a(e, t) {
	if (t.length < 2) return;
	let { ctx: n } = e;
	if (e.curBrush && e.curBrush.fill != null) {
		n.beginPath(), n.moveTo(t[0][0], t[0][1]);
		for (let e = 1; e < t.length; e++) n.lineTo(t[e][0], t[e][1]);
		n.closePath(), n.fillStyle = e.curBrush.fill, n.fill(e.fillRule), e.drew = !0;
	}
	ma(e, t, !0);
}
function va(e, t) {
	let n = t.u16();
	if (n <= 0 || n > 65536) return;
	let r = [];
	for (let e = 0; e < n; e++) {
		if (t.remaining < 2) return;
		r.push(t.u16());
	}
	let { ctx: i } = e;
	i.beginPath();
	let a = !1;
	for (let n of r) {
		if (n < 2) {
			for (let e = 0; e < n && t.remaining >= 4; e++) t.i16(), t.i16();
			continue;
		}
		let r = ha(e, t, n);
		if (!(r.length < 2)) {
			i.moveTo(r[0][0], r[0][1]);
			for (let e = 1; e < r.length; e++) i.lineTo(r[e][0], r[e][1]);
			i.closePath(), a = !0;
		}
	}
	a && (e.curBrush && e.curBrush.fill != null && (i.fillStyle = e.curBrush.fill, i.fill(e.fillRule), e.drew = !0), e.curPen && e.curPen.stroke != null && (i.strokeStyle = e.curPen.stroke, i.lineWidth = ua(e, e.curPen.width), i.stroke(), e.drew = !0));
}
function ya(e) {
	let t = e.u16(), n = e.i16();
	e.i16();
	let r = e.u32();
	return {
		kind: "pen",
		stroke: (t & 255) == 5 ? null : aa(r),
		width: Math.abs(n)
	};
}
function ba(e) {
	let t = e.u16(), n = e.u32();
	return e.u16(), {
		kind: "brush",
		fill: t === 1 ? null : aa(n)
	};
}
function xa(e, t, n, r, i = !1) {
	if (!na(e)) return !1;
	let a = 0;
	(e.length >= 4 ? (e[0] | e[1] << 8 | e[2] << 16 | e[3] << 24) >>> 0 : 0) === Zi && (a = Qi);
	let o = a + $i;
	if (o > e.length) return !1;
	let s = {
		ctx: t,
		W: n,
		H: r,
		orgX: 0,
		orgY: 0,
		extX: n || 1,
		extY: r || 1,
		haveExt: !1,
		objects: [],
		curPen: null,
		curBrush: null,
		fillRule: "nonzero",
		drew: !1,
		suppressBoundaryFrame: i
	}, c = new DataView(e.buffer, e.byteOffset, e.byteLength);
	for (; o + 6 <= e.length;) {
		let t = c.getUint32(o, !0), n = c.getUint16(o + 4, !0);
		if (t < 3) break;
		let r = t * 2, i = o + r;
		if (i > e.length || n === Xi.EOF) break;
		let a = o + 6, l = new sa(e, a, i);
		switch (n) {
			case Xi.SETWINDOWORG:
				s.orgY = l.i16(), s.orgX = l.i16();
				break;
			case Xi.SETWINDOWEXT: {
				let e = l.i16(), t = l.i16();
				s.extY = e || 1, s.extX = t || 1, s.haveExt = !0;
				break;
			}
			case Xi.SETPOLYFILLMODE:
				s.fillRule = l.u16() === 1 ? "evenodd" : "nonzero";
				break;
			case Xi.CREATEPENINDIRECT:
				oa(s.objects, ya(l));
				break;
			case Xi.CREATEBRUSHINDIRECT:
				oa(s.objects, ba(l));
				break;
			case Xi.SELECTOBJECT: {
				let e = l.u16(), t = s.objects[e];
				t?.kind === "pen" ? s.curPen = t : t?.kind === "brush" && (s.curBrush = t);
				break;
			}
			case Xi.DELETEOBJECT: {
				let e = l.u16(), t = s.objects[e];
				t && (t === s.curPen && (s.curPen = null), t === s.curBrush && (s.curBrush = null), s.objects[e] = null);
				break;
			}
			case Xi.POLYLINE:
				ga(s, ha(s, l, l.i16()));
				break;
			case Xi.POLYGON:
				_a(s, ha(s, l, l.i16()));
				break;
			case Xi.POLYPOLYGON:
				va(s, l);
				break;
			case Xi.RECTANGLE: {
				let e = l.i16(), t = l.i16(), n = l.i16(), r = l.i16();
				_a(s, [
					[ca(s, r), la(s, n)],
					[ca(s, t), la(s, n)],
					[ca(s, t), la(s, e)],
					[ca(s, r), la(s, e)]
				]);
				break;
			}
			case Xi.STRETCHDIBITS: {
				l.u32(), l.i16(), l.i16(), l.i16(), l.i16(), l.u16();
				let e = l.i16(), t = l.i16(), n = l.i16(), r = l.i16(), o = a + 22, u = qr(c, o, i - o);
				if (u) {
					let i = ca(s, r), a = la(s, n), o = ca(s, r + t), c = la(s, n + e);
					Jr(s.ctx, u, i, a, o, c) && (s.drew = !0);
				}
				break;
			}
			case Xi.DIBSTRETCHBLT:
			case Xi.DIBBITBLT: break;
			default: break;
		}
		o = i;
	}
	return s.drew;
}
var Sa = 2e3, Ca = 2;
function wa(e, t) {
	let n = e > 0 ? e : 300, r = t > 0 ? t : 300, i = (e) => Math.max(1, Math.min(Sa, Math.round(e)));
	return {
		w: i(n * Ca),
		h: i(r * Ca)
	};
}
async function Ta(e, t, n, r = !1) {
	if (!na(e) || t <= 0 || n <= 0) return null;
	let i = Pt(t, n);
	if (!i) return null;
	let a = i.getContext("2d");
	return !a || (a.lineJoin = "round", a.lineCap = "round", !xa(e, a, t, n, r)) ? null : createImageBitmap(i);
}
async function Ea(e, t = {}) {
	let { widthPt: n = 0, heightPt: r = 0, suppressBoundaryFrame: i = !1 } = t, a = new Uint8Array(await e.slice(0, 64 * 1024).arrayBuffer());
	if (na(a)) {
		let { w: t, h: a } = wa(n, r);
		return Ta(new Uint8Array(await e.arrayBuffer()), t, a, i);
	}
	if (ra(a)) {
		let { w: t, h: i } = wa(n, r);
		return zi(new Uint8Array(await e.arrayBuffer()), t, i);
	}
	return Yi(a) ? null : createImageBitmap(e);
}
//#endregion
//#region packages/core/src/image/crop.ts
function Da(e) {
	let t = e;
	return {
		w: t.naturalWidth || (typeof t.width == "number" ? t.width : 0) || 0,
		h: t.naturalHeight || (typeof t.height == "number" ? t.height : 0) || 0
	};
}
function Oa(e, t) {
	if (!t || !(t.l || t.t || t.r || t.b)) return null;
	let { w: n, h: r } = Da(e);
	if (n <= 0 || r <= 0) return null;
	let i = (e) => Math.max(0, Math.min(1, e)), a = i(t.l) * n, o = i(t.t) * r;
	return {
		sx: a,
		sy: o,
		sw: Math.max(1, n - a - i(t.r) * n),
		sh: Math.max(1, r - o - i(t.b) * r)
	};
}
function ka(e, t, n, r, i, a, o) {
	let s = Oa(t, n);
	s ? e.drawImage(t, s.sx, s.sy, s.sw, s.sh, r, i, a, o) : e.drawImage(t, r, i, a, o);
}
function Aa(e, t, n, r) {
	if (!t || !ia(e)) return {
		widthPt: n,
		heightPt: r
	};
	let i = Math.max(.01, 1 - t.l - t.r), a = Math.max(.01, 1 - t.t - t.b);
	return {
		widthPt: n / i,
		heightPt: r / a
	};
}
//#endregion
//#region packages/core/src/image/duotone.ts
function ja(e) {
	return /^[0-9a-fA-F]{6}$/.test(e) ? [
		parseInt(e.slice(0, 2), 16),
		parseInt(e.slice(2, 4), 16),
		parseInt(e.slice(4, 6), 16)
	] : null;
}
function Ma(e, t, n) {
	return (.299 * e + .587 * t + .114 * n) / 255;
}
function Na(e, t, n) {
	let r = ja(t), i = ja(n);
	if (!r || !i) return e;
	let [a, o, s] = r, [c, l, u] = i, d = e.data;
	for (let e = 0; e < d.length; e += 4) {
		if (d[e + 3] === 0) continue;
		let t = Ma(d[e], d[e + 1], d[e + 2]);
		d[e] = Math.round(a + (c - a) * t), d[e + 1] = Math.round(o + (l - o) * t), d[e + 2] = Math.round(s + (u - s) * t);
	}
	return e;
}
var Pa = (e, t) => typeof OffscreenCanvas > "u" ? null : new OffscreenCanvas(e, t);
async function Fa(e, t, n) {
	let { width: r, height: i } = n;
	if (r <= 0 || i <= 0 || typeof createImageBitmap > "u") return e;
	let a = (n.offscreenFactory ?? Pa)(r, i);
	if (!a) return e;
	let o = a.getContext("2d");
	if (!o) return e;
	o.drawImage(e, 0, 0);
	let s;
	try {
		s = o.getImageData(0, 0, r, i);
	} catch {
		return e;
	}
	return Na(s, t.clr1, t.clr2), o.putImageData(s, 0, 0), createImageBitmap(a);
}
//#endregion
//#region packages/core/src/image/blip-gate.ts
function Ia(e) {
	return e.svgImagePath != null && e.srcRect == null;
}
//#endregion
//#region packages/core/src/math/mathml.ts
var La = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
}, Ra = (e) => e.replace(/[&<>"]/g, (e) => La[e]);
function za(e) {
	switch (e) {
		case "roman": return "normal";
		case "bold": return "bold";
		case "boldItalic": return "bold-italic";
		case "italic": return null;
	}
}
var Ba = new Set([..."⏞⏟⎴⎵︷︸⏜⏝{}[]()¯_‾"]), Va = "+−±∓×÷·∗⋅∘∙*/", Ha = "=≠<>≤≥≈≡∼≅≃→←↔⇒∈∉⊂⊆⊃⊇∝≪≫⊥≔", Ua = "([{⟨⌈⌊", Wa = ")]}⟩⌉⌋", Ga = ",;";
function Ka(e, t) {
	let n = za(t), r = n ? ` mathvariant="${n}"` : "", i = "", a = "", o = () => {
		a &&= (i += `<mn${r}>${Ra(a)}</mn>`, "");
	};
	for (let t of e) {
		if (t === " ") {
			o();
			continue;
		}
		if (t >= "0" && t <= "9") {
			a += t;
			continue;
		}
		o(), Va.includes(t) || Ha.includes(t) || Ga.includes(t) ? i += `<mo>${Ra(t)}</mo>` : Ua.includes(t) || Wa.includes(t) ? i += `<mo fence="true" stretchy="false">${Ra(t)}</mo>` : i += `<mi${r}>${Ra(t)}</mi>`;
	}
	return o(), i;
}
function qa(e) {
	return e.map(Ja).join("");
}
function $(e) {
	return `<mrow>${qa(e)}</mrow>`;
}
function Ja(e) {
	switch (e.kind) {
		case "run": return Ka(e.text, e.style);
		case "group": return $(e.items);
		case "fraction": return `<mfrac${e.bar === !1 ? " linethickness=\"0\"" : ""}>${$(e.num)}${$(e.den)}</mfrac>`;
		case "sup": return `<msup>${$(e.base)}${$(e.sup ?? [])}</msup>`;
		case "sub": return `<msub>${$(e.base)}${$(e.sub ?? [])}</msub>`;
		case "subSup": return `<msubsup>${$(e.base)}${$(e.sub ?? [])}${$(e.sup ?? [])}</msubsup>`;
		case "nary": return ro(e);
		case "delimiter": return io(e);
		case "radical": return e.index && e.index.length ? `<mroot>${$(e.radicand)}${$(e.index)}</mroot>` : `<msqrt>${qa(e.radicand)}</msqrt>`;
		case "limit": return eo(e);
		case "array": return to(e);
		case "groupChr": {
			let t = $(e.base), n = Ba.has(e.char), r = e.pos === "top" ? "mover" : "munder", i = `<mo stretchy="${n}">${Ra(e.char)}</mo>`;
			return n ? `<${r}>${t}${i}</${r}>` : `<${r} accent="true">${t}${i}</${r}>`;
		}
		case "bar": {
			let t = $(e.base), n = "<mo stretchy=\"true\">&#x2015;</mo>";
			return e.pos === "bot" ? `<munder>${t}${n}</munder>` : `<mover>${t}${n}</mover>`;
		}
		case "accent": return $a(e);
		case "func": return `<mrow>${$(e.name)}<mo>&#x2061;</mo>${$(e.arg)}</mrow>`;
		case "phant": return Ya(e);
		case "sPre": return `<mmultiscripts>${$(e.base)}<mprescripts/>${$(e.sub)}${$(e.sup)}</mmultiscripts>`;
		case "box": return $(e.base);
		case "borderBox": return Xa(e);
	}
}
function Ya(e) {
	let t = e.show ? qa(e.base) : `<mphantom>${qa(e.base)}</mphantom>`, n = [];
	return e.zeroWid && n.push("width=\"0\""), e.zeroAsc && n.push("height=\"0\""), e.zeroDesc && n.push("depth=\"0\""), n.length ? `<mpadded ${n.join(" ")}>${t}</mpadded>` : `<mrow>${t}</mrow>`;
}
function Xa(e) {
	let t = [], n = !e.hideTop, r = !e.hideBot, i = !e.hideLeft, a = !e.hideRight;
	n && r && i && a ? t.push("box") : (n && t.push("top"), r && t.push("bottom"), i && t.push("left"), a && t.push("right")), e.strikeH && t.push("horizontalstrike"), e.strikeV && t.push("verticalstrike"), e.strikeBltr && t.push("updiagonalstrike"), e.strikeTlbr && t.push("downdiagonalstrike");
	let o = qa(e.base);
	return t.length ? `<menclose notation="${t.join(" ")}">${o}</menclose>` : `<mrow>${o}</mrow>`;
}
var Za = {
	"̀": "`",
	"́": "´",
	"̂": "^",
	"̃": "~",
	"̆": "˘",
	"̇": "˙",
	"̈": "¨",
	"̌": "ˇ",
	"⃗": "→",
	"⃖": "←"
}, Qa = new Set([
	"̅",
	"̄",
	"¯",
	"‾",
	"̲",
	"̳"
]);
function $a(e) {
	let t = $(e.base);
	if (Qa.has(e.char)) return `<mover>${t}<mo stretchy="true">&#x2015;</mo></mover>`;
	let n = Za[e.char] ?? e.char;
	return `<mover accent="true">${t}<mo stretchy="${n === "→" || n === "←" ? "true" : "false"}">${Ra(n)}</mo></mover>`;
}
function eo(e) {
	let t = $(e.base), n = e.lower && e.lower.length ? $(e.lower) : null, r = e.upper && e.upper.length ? $(e.upper) : null;
	return n && r ? `<munderover>${t}${n}${r}</munderover>` : n ? `<munder>${t}${n}</munder>` : r ? `<mover>${t}${r}</mover>` : t;
}
function to(e) {
	let t = Math.max(1, ...e.rows.map((e) => e.length)), n;
	n = e.align === "eq" ? Array.from({ length: t }, (e, t) => t % 2 == 0 ? "right" : "left").join(" ") : e.align === "left" ? "left" : "center";
	let r = e.rows.map((e) => `<mtr>${e.map((e) => `<mtd>${qa(e)}</mtd>`).join("")}</mtr>`).join("");
	return `<mtable columnalign="${n}" rowspacing="0.2em" columnspacing="0.3em">${r}</mtable>`;
}
var no = new Set([..."∫∬∭∮∯∰∱∲∳⨌⨍⨎⨏⨐⨑⨒⨓⨔⨕⨖⨗"]);
function ro(e) {
	let t = e.limLoc === "subSup" ? !0 : e.limLoc === "undOvr" ? !1 : no.has(e.op), n = `<mo largeop="true">${Ra(e.op)}</mo>`, r = e.sub ?? [], i = e.sup ?? [], a;
	return a = t ? r.length && i.length ? `<msubsup>${n}${$(r)}${$(i)}</msubsup>` : r.length ? `<msub>${n}${$(r)}</msub>` : i.length ? `<msup>${n}${$(i)}</msup>` : n : r.length && i.length ? `<munderover>${n}${$(r)}${$(i)}</munderover>` : r.length ? `<munder>${n}${$(r)}</munder>` : i.length ? `<mover>${n}${$(i)}</mover>` : n, `<mrow>${a}${qa(e.body)}</mrow>`;
}
function io(e) {
	let t = (e) => `<mo fence="true" stretchy="true">${Ra(e)}</mo>`, n = e.items.map((e) => $(e)).join("<mo separator=\"true\">,</mo>");
	return `<mrow>${t(e.begChar)}${n}${t(e.endChar)}</mrow>`;
}
function ao(e, t) {
	return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${t ? "block" : "inline"}">${qa(e)}</math>`;
}
//#endregion
//#region packages/core/src/canvas/env.ts
function oo(e) {
	return typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement;
}
function so(e = 1) {
	return typeof window < "u" && window.devicePixelRatio || e;
}
//#endregion
//#region packages/core/src/canvas/crisp.ts
function co(e, t, n) {
	let r = Math.round(t * n) % 2 == 1 ? .5 : 0, i = e * n;
	return (Math.round(i - r) + r) / n - e;
}
//#endregion
//#region packages/core/src/canvas/clamp.ts
var lo = 32767, uo = 1 << 24;
function fo(e, t) {
	let n = Number.isFinite(e) && e > 0 ? Math.max(1, Math.round(e)) : 1, r = Number.isFinite(t) && t > 0 ? Math.max(1, Math.round(t)) : 1, i = Math.min(1, lo / n, lo / r), a = n * r, o = a > 16777216 ? Math.sqrt(uo / a) : 1, s = Math.min(i, o);
	return s >= 1 ? {
		width: n,
		height: r,
		scale: 1,
		clamped: !1
	} : {
		width: Math.max(1, Math.floor(n * s)),
		height: Math.max(1, Math.floor(r * s)),
		scale: s,
		clamped: !0
	};
}
//#endregion
//#region packages/core/src/worker/bridge.ts
function po() {
	let e = /* @__PURE__ */ Error("worker request aborted");
	return e.name = "AbortError", e;
}
var mo = class {
	_worker;
	_opts;
	_pending = /* @__PURE__ */ new Map();
	_nextId = 1;
	constructor(e, t) {
		this._worker = e, this._opts = t, this._worker.addEventListener("message", this._handle), this._worker.addEventListener("messageerror", this._handleWorkerError), this._worker.addEventListener("error", this._handleWorkerError);
	}
	_handle = (e) => {
		let t = e.data, n = this._opts.correlate(t);
		if (n === void 0) {
			this._opts.onUnsolicited?.(t);
			return;
		}
		let r = this._pending.get(n);
		if (!r) return;
		this._pending.delete(n), r.cleanup();
		let i = this._opts.toError?.(t);
		i === void 0 ? r.resolve(t) : r.reject(Error(i));
	};
	_handleWorkerError = (e) => {
		let t = "message" in e && e.message ? `: ${e.message}` : "";
		this._rejectAll(/* @__PURE__ */ Error(`Worker error${t}`));
	};
	_rejectAll(e) {
		let t = [...this._pending.values()];
		this._pending.clear();
		for (let n of t) n.cleanup(), n.reject(e);
	}
	nextId() {
		return this._nextId++;
	}
	request(e, t, n) {
		let r = this._nextId++, i = n?.timeoutMs ?? this._opts.timeoutMs, a = n?.signal;
		return new Promise((n, o) => {
			if (a?.aborted) {
				o(po());
				return;
			}
			let s, c;
			this._pending.set(r, {
				resolve: n,
				reject: o,
				cleanup: () => {
					s !== void 0 && (clearTimeout(s), s = void 0), c && a && (a.removeEventListener("abort", c), c = void 0);
				}
			}), i !== void 0 && (s = setTimeout(() => {
				let e = this._pending.get(r);
				e && (this._pending.delete(r), e.cleanup(), e.reject(/* @__PURE__ */ Error(`worker request timed out after ${i}ms`)));
			}, i)), a && (c = () => {
				let e = this._pending.get(r);
				e && (this._pending.delete(r), e.cleanup(), e.reject(po()));
			}, a.addEventListener("abort", c)), this._worker.postMessage(e(r), t);
		});
	}
	post(e, t) {
		this._worker.postMessage(e, t);
	}
	terminate() {
		this._worker.removeEventListener("message", this._handle), this._worker.removeEventListener("messageerror", this._handleWorkerError), this._worker.removeEventListener("error", this._handleWorkerError), this._worker.terminate(), this._rejectAll(/* @__PURE__ */ Error("Worker terminated"));
	}
}, ho = [
	"L",
	"R",
	"AL",
	"EN",
	"ES",
	"ET",
	"AN",
	"CS",
	"NSM",
	"BN",
	"B",
	"S",
	"WS",
	"ON",
	"LRE",
	"LRO",
	"RLE",
	"RLO",
	"PDF",
	"LRI",
	"RLI",
	"FSI",
	"PDI"
], go = [
	0,
	9,
	10,
	11,
	12,
	13,
	14,
	28,
	31,
	32,
	33,
	35,
	38,
	43,
	44,
	45,
	46,
	48,
	58,
	59,
	65,
	91,
	97,
	123,
	127,
	133,
	134,
	160,
	161,
	162,
	166,
	170,
	171,
	173,
	174,
	176,
	178,
	180,
	181,
	182,
	185,
	186,
	187,
	192,
	215,
	216,
	247,
	248,
	697,
	699,
	706,
	720,
	722,
	736,
	741,
	750,
	751,
	768,
	880,
	884,
	886,
	894,
	895,
	900,
	902,
	903,
	904,
	1014,
	1015,
	1155,
	1162,
	1418,
	1419,
	1421,
	1423,
	1424,
	1425,
	1470,
	1471,
	1472,
	1473,
	1475,
	1476,
	1478,
	1479,
	1480,
	1536,
	1542,
	1544,
	1545,
	1547,
	1548,
	1549,
	1550,
	1552,
	1563,
	1611,
	1632,
	1642,
	1643,
	1645,
	1648,
	1649,
	1750,
	1757,
	1758,
	1759,
	1765,
	1767,
	1769,
	1770,
	1774,
	1776,
	1786,
	1809,
	1810,
	1840,
	1867,
	1958,
	1969,
	1984,
	2027,
	2036,
	2038,
	2042,
	2045,
	2046,
	2070,
	2074,
	2075,
	2084,
	2085,
	2088,
	2089,
	2094,
	2137,
	2140,
	2144,
	2192,
	2194,
	2199,
	2208,
	2250,
	2274,
	2275,
	2307,
	2362,
	2363,
	2364,
	2365,
	2369,
	2377,
	2381,
	2382,
	2385,
	2392,
	2402,
	2404,
	2433,
	2434,
	2492,
	2493,
	2497,
	2501,
	2509,
	2510,
	2530,
	2532,
	2546,
	2548,
	2555,
	2556,
	2558,
	2559,
	2561,
	2563,
	2620,
	2621,
	2625,
	2627,
	2631,
	2633,
	2635,
	2638,
	2641,
	2642,
	2672,
	2674,
	2677,
	2678,
	2689,
	2691,
	2748,
	2749,
	2753,
	2758,
	2759,
	2761,
	2765,
	2766,
	2786,
	2788,
	2801,
	2802,
	2810,
	2816,
	2817,
	2818,
	2876,
	2877,
	2879,
	2880,
	2881,
	2885,
	2893,
	2894,
	2901,
	2903,
	2914,
	2916,
	2946,
	2947,
	3008,
	3009,
	3021,
	3022,
	3059,
	3065,
	3066,
	3067,
	3072,
	3073,
	3076,
	3077,
	3132,
	3133,
	3134,
	3137,
	3142,
	3145,
	3146,
	3150,
	3157,
	3159,
	3170,
	3172,
	3192,
	3199,
	3201,
	3202,
	3260,
	3261,
	3276,
	3278,
	3298,
	3300,
	3328,
	3330,
	3387,
	3389,
	3393,
	3397,
	3405,
	3406,
	3426,
	3428,
	3457,
	3458,
	3530,
	3531,
	3538,
	3541,
	3542,
	3543,
	3633,
	3634,
	3636,
	3643,
	3647,
	3648,
	3655,
	3663,
	3761,
	3762,
	3764,
	3773,
	3784,
	3791,
	3864,
	3866,
	3893,
	3894,
	3895,
	3896,
	3897,
	3898,
	3902,
	3953,
	3967,
	3968,
	3973,
	3974,
	3976,
	3981,
	3992,
	3993,
	4029,
	4038,
	4039,
	4141,
	4145,
	4146,
	4152,
	4153,
	4155,
	4157,
	4159,
	4184,
	4186,
	4190,
	4193,
	4209,
	4213,
	4226,
	4227,
	4229,
	4231,
	4237,
	4238,
	4253,
	4254,
	4957,
	4960,
	5008,
	5018,
	5120,
	5121,
	5760,
	5761,
	5787,
	5789,
	5906,
	5909,
	5938,
	5940,
	5970,
	5972,
	6002,
	6004,
	6068,
	6070,
	6071,
	6078,
	6086,
	6087,
	6089,
	6100,
	6107,
	6108,
	6109,
	6110,
	6128,
	6138,
	6144,
	6155,
	6158,
	6159,
	6160,
	6277,
	6279,
	6313,
	6314,
	6432,
	6435,
	6439,
	6441,
	6450,
	6451,
	6457,
	6460,
	6464,
	6465,
	6468,
	6470,
	6622,
	6656,
	6679,
	6681,
	6683,
	6684,
	6742,
	6743,
	6744,
	6751,
	6752,
	6753,
	6754,
	6755,
	6757,
	6765,
	6771,
	6781,
	6783,
	6784,
	6832,
	6878,
	6880,
	6892,
	6912,
	6916,
	6964,
	6965,
	6966,
	6971,
	6972,
	6973,
	6978,
	6979,
	7019,
	7028,
	7040,
	7042,
	7074,
	7078,
	7080,
	7082,
	7083,
	7086,
	7142,
	7143,
	7144,
	7146,
	7149,
	7150,
	7151,
	7154,
	7212,
	7220,
	7222,
	7224,
	7376,
	7379,
	7380,
	7393,
	7394,
	7401,
	7405,
	7406,
	7412,
	7413,
	7416,
	7418,
	7616,
	7680,
	8125,
	8126,
	8127,
	8130,
	8141,
	8144,
	8157,
	8160,
	8173,
	8176,
	8189,
	8191,
	8192,
	8203,
	8206,
	8207,
	8208,
	8232,
	8233,
	8234,
	8235,
	8236,
	8237,
	8238,
	8239,
	8240,
	8245,
	8260,
	8261,
	8287,
	8288,
	8294,
	8295,
	8296,
	8297,
	8298,
	8304,
	8305,
	8308,
	8314,
	8316,
	8319,
	8320,
	8330,
	8332,
	8335,
	8352,
	8400,
	8433,
	8448,
	8450,
	8451,
	8455,
	8456,
	8458,
	8468,
	8469,
	8470,
	8473,
	8478,
	8484,
	8485,
	8486,
	8487,
	8488,
	8489,
	8490,
	8494,
	8495,
	8506,
	8508,
	8512,
	8517,
	8522,
	8526,
	8528,
	8544,
	8585,
	8588,
	8592,
	8722,
	8723,
	8724,
	9014,
	9083,
	9109,
	9110,
	9258,
	9280,
	9291,
	9312,
	9352,
	9372,
	9450,
	9900,
	9901,
	10240,
	10496,
	11124,
	11126,
	11264,
	11493,
	11499,
	11503,
	11506,
	11513,
	11520,
	11647,
	11648,
	11744,
	11776,
	11870,
	11904,
	11930,
	11931,
	12020,
	12032,
	12246,
	12272,
	12288,
	12289,
	12293,
	12296,
	12321,
	12330,
	12334,
	12336,
	12337,
	12342,
	12344,
	12349,
	12352,
	12441,
	12443,
	12445,
	12448,
	12449,
	12539,
	12540,
	12736,
	12774,
	12783,
	12784,
	12829,
	12831,
	12880,
	12896,
	12924,
	12927,
	12977,
	12992,
	13004,
	13008,
	13175,
	13179,
	13278,
	13280,
	13311,
	13312,
	19904,
	19968,
	42128,
	42183,
	42509,
	42512,
	42607,
	42611,
	42612,
	42622,
	42624,
	42654,
	42656,
	42736,
	42738,
	42752,
	42786,
	42888,
	42889,
	43010,
	43011,
	43014,
	43015,
	43019,
	43020,
	43045,
	43047,
	43048,
	43052,
	43053,
	43064,
	43066,
	43124,
	43128,
	43204,
	43206,
	43232,
	43250,
	43263,
	43264,
	43302,
	43310,
	43335,
	43346,
	43392,
	43395,
	43443,
	43444,
	43446,
	43450,
	43452,
	43454,
	43493,
	43494,
	43561,
	43567,
	43569,
	43571,
	43573,
	43575,
	43587,
	43588,
	43596,
	43597,
	43644,
	43645,
	43696,
	43697,
	43698,
	43701,
	43703,
	43705,
	43710,
	43712,
	43713,
	43714,
	43756,
	43758,
	43766,
	43767,
	43882,
	43884,
	44005,
	44006,
	44008,
	44009,
	44013,
	44014,
	64285,
	64286,
	64287,
	64297,
	64298,
	64336,
	64451,
	64467,
	64830,
	64848,
	64912,
	64914,
	64968,
	64976,
	65008,
	65021,
	65024,
	65040,
	65050,
	65056,
	65072,
	65104,
	65105,
	65106,
	65107,
	65108,
	65109,
	65110,
	65119,
	65120,
	65122,
	65124,
	65127,
	65128,
	65129,
	65131,
	65132,
	65136,
	65279,
	65280,
	65281,
	65283,
	65286,
	65291,
	65292,
	65293,
	65294,
	65296,
	65306,
	65307,
	65313,
	65339,
	65345,
	65371,
	65382,
	65504,
	65506,
	65509,
	65511,
	65512,
	65519,
	65520,
	65529,
	65534,
	65536,
	65793,
	65794,
	65856,
	65933,
	65936,
	65949,
	65952,
	65953,
	66045,
	66046,
	66272,
	66273,
	66300,
	66422,
	66427,
	67584,
	67871,
	67872,
	68097,
	68100,
	68101,
	68103,
	68108,
	68112,
	68152,
	68155,
	68159,
	68160,
	68325,
	68327,
	68409,
	68416,
	68864,
	68900,
	68904,
	68912,
	68922,
	68928,
	68938,
	68969,
	68974,
	68975,
	69216,
	69247,
	69291,
	69293,
	69312,
	69328,
	69337,
	69370,
	69376,
	69424,
	69446,
	69457,
	69488,
	69506,
	69510,
	69632,
	69633,
	69634,
	69688,
	69703,
	69714,
	69734,
	69744,
	69745,
	69747,
	69749,
	69759,
	69762,
	69811,
	69815,
	69817,
	69819,
	69826,
	69827,
	69888,
	69891,
	69927,
	69932,
	69933,
	69941,
	70003,
	70004,
	70016,
	70018,
	70070,
	70079,
	70089,
	70093,
	70095,
	70096,
	70191,
	70194,
	70196,
	70197,
	70198,
	70200,
	70206,
	70207,
	70209,
	70210,
	70367,
	70368,
	70371,
	70379,
	70400,
	70402,
	70459,
	70461,
	70464,
	70465,
	70502,
	70509,
	70512,
	70517,
	70587,
	70593,
	70606,
	70607,
	70608,
	70609,
	70610,
	70611,
	70625,
	70627,
	70712,
	70720,
	70722,
	70725,
	70726,
	70727,
	70750,
	70751,
	70835,
	70841,
	70842,
	70843,
	70847,
	70849,
	70850,
	70852,
	71090,
	71094,
	71100,
	71102,
	71103,
	71105,
	71132,
	71134,
	71219,
	71227,
	71229,
	71230,
	71231,
	71233,
	71264,
	71277,
	71339,
	71340,
	71341,
	71342,
	71344,
	71350,
	71351,
	71352,
	71453,
	71454,
	71455,
	71456,
	71458,
	71462,
	71463,
	71468,
	71727,
	71736,
	71737,
	71739,
	71995,
	71997,
	71998,
	71999,
	72003,
	72004,
	72148,
	72152,
	72154,
	72156,
	72160,
	72161,
	72193,
	72199,
	72201,
	72203,
	72243,
	72249,
	72251,
	72255,
	72263,
	72264,
	72273,
	72279,
	72281,
	72284,
	72330,
	72343,
	72344,
	72346,
	72544,
	72545,
	72546,
	72549,
	72550,
	72551,
	72752,
	72759,
	72760,
	72766,
	72850,
	72872,
	72874,
	72881,
	72882,
	72884,
	72885,
	72887,
	73009,
	73015,
	73018,
	73019,
	73020,
	73022,
	73023,
	73030,
	73031,
	73032,
	73104,
	73106,
	73109,
	73110,
	73111,
	73112,
	73459,
	73461,
	73472,
	73474,
	73526,
	73531,
	73536,
	73537,
	73538,
	73539,
	73562,
	73563,
	73685,
	73693,
	73697,
	73714,
	78912,
	78913,
	78919,
	78934,
	90398,
	90410,
	90413,
	90416,
	92912,
	92917,
	92976,
	92983,
	94031,
	94032,
	94095,
	94099,
	94178,
	94179,
	94180,
	94181,
	113821,
	113823,
	113824,
	113828,
	117760,
	117974,
	118e3,
	118010,
	118013,
	118016,
	118452,
	118458,
	118481,
	118496,
	118513,
	118528,
	118574,
	118576,
	118599,
	119143,
	119146,
	119155,
	119163,
	119171,
	119173,
	119180,
	119210,
	119214,
	119273,
	119275,
	119296,
	119362,
	119365,
	119366,
	119552,
	119639,
	120513,
	120514,
	120539,
	120540,
	120571,
	120572,
	120597,
	120598,
	120629,
	120630,
	120655,
	120656,
	120687,
	120688,
	120713,
	120714,
	120745,
	120746,
	120771,
	120772,
	120782,
	120832,
	121344,
	121399,
	121403,
	121453,
	121461,
	121462,
	121476,
	121477,
	121499,
	121504,
	121505,
	121520,
	122880,
	122887,
	122888,
	122905,
	122907,
	122914,
	122915,
	122917,
	122918,
	122923,
	123023,
	123024,
	123184,
	123191,
	123566,
	123567,
	123628,
	123632,
	123647,
	123648,
	124140,
	124144,
	124398,
	124400,
	124643,
	124644,
	124646,
	124647,
	124654,
	124656,
	124661,
	124662,
	124928,
	125136,
	125143,
	125252,
	125259,
	126064,
	126144,
	126208,
	126288,
	126464,
	126704,
	126706,
	126720,
	126976,
	127020,
	127024,
	127124,
	127136,
	127151,
	127153,
	127168,
	127169,
	127184,
	127185,
	127222,
	127232,
	127243,
	127248,
	127279,
	127280,
	127338,
	127344,
	127405,
	127406,
	127584,
	127590,
	127744,
	128729,
	128732,
	128749,
	128752,
	128765,
	128768,
	128986,
	128992,
	129004,
	129008,
	129009,
	129024,
	129036,
	129040,
	129096,
	129104,
	129114,
	129120,
	129160,
	129168,
	129198,
	129200,
	129212,
	129216,
	129218,
	129232,
	129241,
	129280,
	129624,
	129632,
	129646,
	129648,
	129661,
	129664,
	129675,
	129678,
	129735,
	129736,
	129737,
	129741,
	129757,
	129759,
	129771,
	129775,
	129785,
	129792,
	129939,
	129940,
	130032,
	130042,
	130043,
	131070,
	131072,
	196606,
	196608,
	262142,
	262144,
	327678,
	327680,
	393214,
	393216,
	458750,
	458752,
	524286,
	524288,
	589822,
	589824,
	655358,
	655360,
	720894,
	720896,
	786430,
	786432,
	851966,
	851968,
	917502,
	917760,
	918e3,
	921600,
	983038,
	983040,
	1048574,
	1048576,
	1114110
], _o = [
	9,
	11,
	10,
	11,
	12,
	10,
	9,
	10,
	11,
	12,
	13,
	5,
	13,
	4,
	7,
	4,
	7,
	3,
	7,
	13,
	0,
	13,
	0,
	13,
	9,
	10,
	9,
	7,
	13,
	5,
	13,
	0,
	13,
	9,
	13,
	5,
	3,
	13,
	0,
	13,
	3,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	8,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	13,
	0,
	13,
	5,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	6,
	13,
	2,
	5,
	2,
	7,
	2,
	13,
	8,
	2,
	8,
	6,
	5,
	6,
	2,
	8,
	2,
	8,
	6,
	13,
	8,
	2,
	8,
	13,
	8,
	2,
	3,
	2,
	8,
	2,
	8,
	2,
	8,
	2,
	1,
	8,
	1,
	13,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	2,
	6,
	2,
	8,
	2,
	8,
	6,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	5,
	0,
	5,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	5,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	5,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	5,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	13,
	0,
	12,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	5,
	0,
	8,
	0,
	13,
	0,
	13,
	8,
	9,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	12,
	9,
	0,
	1,
	13,
	12,
	10,
	14,
	16,
	18,
	15,
	17,
	7,
	5,
	13,
	7,
	13,
	12,
	9,
	19,
	20,
	21,
	22,
	9,
	3,
	0,
	3,
	4,
	13,
	0,
	3,
	4,
	13,
	0,
	5,
	8,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	5,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	4,
	5,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	3,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	12,
	13,
	0,
	13,
	0,
	8,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	13,
	8,
	13,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	8,
	0,
	5,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	1,
	8,
	1,
	4,
	1,
	2,
	13,
	2,
	13,
	2,
	13,
	2,
	13,
	9,
	2,
	13,
	8,
	13,
	0,
	8,
	13,
	7,
	13,
	7,
	0,
	13,
	7,
	13,
	5,
	13,
	4,
	13,
	0,
	13,
	5,
	13,
	0,
	2,
	9,
	0,
	13,
	5,
	13,
	4,
	7,
	4,
	7,
	3,
	7,
	13,
	0,
	13,
	0,
	13,
	0,
	5,
	13,
	5,
	0,
	13,
	0,
	9,
	13,
	9,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	8,
	3,
	0,
	8,
	0,
	1,
	13,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	8,
	1,
	13,
	1,
	2,
	8,
	2,
	6,
	2,
	6,
	1,
	8,
	13,
	1,
	6,
	1,
	8,
	1,
	2,
	13,
	2,
	8,
	1,
	2,
	8,
	2,
	1,
	8,
	1,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	5,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	9,
	0,
	13,
	0,
	3,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	9,
	8,
	0,
	8,
	0,
	8,
	0,
	13,
	0,
	13,
	8,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	3,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	5,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	8,
	0,
	1,
	8,
	1,
	8,
	1,
	2,
	1,
	2,
	1,
	2,
	13,
	2,
	1,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	3,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	0,
	13,
	3,
	13,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	0,
	9,
	8,
	9,
	0,
	9,
	0,
	9,
	0,
	9
], vo = [
	40,
	41,
	41,
	40,
	60,
	62,
	62,
	60,
	91,
	93,
	93,
	91,
	123,
	125,
	125,
	123,
	171,
	187,
	187,
	171,
	3898,
	3899,
	3899,
	3898,
	3900,
	3901,
	3901,
	3900,
	5787,
	5788,
	5788,
	5787,
	8249,
	8250,
	8250,
	8249,
	8261,
	8262,
	8262,
	8261,
	8317,
	8318,
	8318,
	8317,
	8333,
	8334,
	8334,
	8333,
	8712,
	8715,
	8713,
	8716,
	8714,
	8717,
	8715,
	8712,
	8716,
	8713,
	8717,
	8714,
	8725,
	10741,
	8735,
	11262,
	8736,
	10659,
	8737,
	10651,
	8738,
	10656,
	8740,
	10990,
	8764,
	8765,
	8765,
	8764,
	8771,
	8909,
	8773,
	8780,
	8780,
	8773,
	8786,
	8787,
	8787,
	8786,
	8788,
	8789,
	8789,
	8788,
	8804,
	8805,
	8805,
	8804,
	8806,
	8807,
	8807,
	8806,
	8808,
	8809,
	8809,
	8808,
	8810,
	8811,
	8811,
	8810,
	8814,
	8815,
	8815,
	8814,
	8816,
	8817,
	8817,
	8816,
	8818,
	8819,
	8819,
	8818,
	8820,
	8821,
	8821,
	8820,
	8822,
	8823,
	8823,
	8822,
	8824,
	8825,
	8825,
	8824,
	8826,
	8827,
	8827,
	8826,
	8828,
	8829,
	8829,
	8828,
	8830,
	8831,
	8831,
	8830,
	8832,
	8833,
	8833,
	8832,
	8834,
	8835,
	8835,
	8834,
	8836,
	8837,
	8837,
	8836,
	8838,
	8839,
	8839,
	8838,
	8840,
	8841,
	8841,
	8840,
	8842,
	8843,
	8843,
	8842,
	8847,
	8848,
	8848,
	8847,
	8849,
	8850,
	8850,
	8849,
	8856,
	10680,
	8866,
	8867,
	8867,
	8866,
	8870,
	10974,
	8872,
	10980,
	8873,
	10979,
	8875,
	10981,
	8880,
	8881,
	8881,
	8880,
	8882,
	8883,
	8883,
	8882,
	8884,
	8885,
	8885,
	8884,
	8886,
	8887,
	8887,
	8886,
	8888,
	10204,
	8905,
	8906,
	8906,
	8905,
	8907,
	8908,
	8908,
	8907,
	8909,
	8771,
	8912,
	8913,
	8913,
	8912,
	8918,
	8919,
	8919,
	8918,
	8920,
	8921,
	8921,
	8920,
	8922,
	8923,
	8923,
	8922,
	8924,
	8925,
	8925,
	8924,
	8926,
	8927,
	8927,
	8926,
	8928,
	8929,
	8929,
	8928,
	8930,
	8931,
	8931,
	8930,
	8932,
	8933,
	8933,
	8932,
	8934,
	8935,
	8935,
	8934,
	8936,
	8937,
	8937,
	8936,
	8938,
	8939,
	8939,
	8938,
	8940,
	8941,
	8941,
	8940,
	8944,
	8945,
	8945,
	8944,
	8946,
	8954,
	8947,
	8955,
	8948,
	8956,
	8950,
	8957,
	8951,
	8958,
	8954,
	8946,
	8955,
	8947,
	8956,
	8948,
	8957,
	8950,
	8958,
	8951,
	8968,
	8969,
	8969,
	8968,
	8970,
	8971,
	8971,
	8970,
	9001,
	9002,
	9002,
	9001,
	10088,
	10089,
	10089,
	10088,
	10090,
	10091,
	10091,
	10090,
	10092,
	10093,
	10093,
	10092,
	10094,
	10095,
	10095,
	10094,
	10096,
	10097,
	10097,
	10096,
	10098,
	10099,
	10099,
	10098,
	10100,
	10101,
	10101,
	10100,
	10179,
	10180,
	10180,
	10179,
	10181,
	10182,
	10182,
	10181,
	10184,
	10185,
	10185,
	10184,
	10187,
	10189,
	10189,
	10187,
	10197,
	10198,
	10198,
	10197,
	10204,
	8888,
	10205,
	10206,
	10206,
	10205,
	10210,
	10211,
	10211,
	10210,
	10212,
	10213,
	10213,
	10212,
	10214,
	10215,
	10215,
	10214,
	10216,
	10217,
	10217,
	10216,
	10218,
	10219,
	10219,
	10218,
	10220,
	10221,
	10221,
	10220,
	10222,
	10223,
	10223,
	10222,
	10627,
	10628,
	10628,
	10627,
	10629,
	10630,
	10630,
	10629,
	10631,
	10632,
	10632,
	10631,
	10633,
	10634,
	10634,
	10633,
	10635,
	10636,
	10636,
	10635,
	10637,
	10640,
	10638,
	10639,
	10639,
	10638,
	10640,
	10637,
	10641,
	10642,
	10642,
	10641,
	10643,
	10644,
	10644,
	10643,
	10645,
	10646,
	10646,
	10645,
	10647,
	10648,
	10648,
	10647,
	10651,
	8737,
	10656,
	8738,
	10659,
	8736,
	10660,
	10661,
	10661,
	10660,
	10664,
	10665,
	10665,
	10664,
	10666,
	10667,
	10667,
	10666,
	10668,
	10669,
	10669,
	10668,
	10670,
	10671,
	10671,
	10670,
	10680,
	8856,
	10688,
	10689,
	10689,
	10688,
	10692,
	10693,
	10693,
	10692,
	10703,
	10704,
	10704,
	10703,
	10705,
	10706,
	10706,
	10705,
	10708,
	10709,
	10709,
	10708,
	10712,
	10713,
	10713,
	10712,
	10714,
	10715,
	10715,
	10714,
	10728,
	10729,
	10729,
	10728,
	10741,
	8725,
	10744,
	10745,
	10745,
	10744,
	10748,
	10749,
	10749,
	10748,
	10795,
	10796,
	10796,
	10795,
	10797,
	10798,
	10798,
	10797,
	10804,
	10805,
	10805,
	10804,
	10812,
	10813,
	10813,
	10812,
	10852,
	10853,
	10853,
	10852,
	10873,
	10874,
	10874,
	10873,
	10875,
	10876,
	10876,
	10875,
	10877,
	10878,
	10878,
	10877,
	10879,
	10880,
	10880,
	10879,
	10881,
	10882,
	10882,
	10881,
	10883,
	10884,
	10884,
	10883,
	10885,
	10886,
	10886,
	10885,
	10887,
	10888,
	10888,
	10887,
	10889,
	10890,
	10890,
	10889,
	10891,
	10892,
	10892,
	10891,
	10893,
	10894,
	10894,
	10893,
	10895,
	10896,
	10896,
	10895,
	10897,
	10898,
	10898,
	10897,
	10899,
	10900,
	10900,
	10899,
	10901,
	10902,
	10902,
	10901,
	10903,
	10904,
	10904,
	10903,
	10905,
	10906,
	10906,
	10905,
	10907,
	10908,
	10908,
	10907,
	10909,
	10910,
	10910,
	10909,
	10911,
	10912,
	10912,
	10911,
	10913,
	10914,
	10914,
	10913,
	10918,
	10919,
	10919,
	10918,
	10920,
	10921,
	10921,
	10920,
	10922,
	10923,
	10923,
	10922,
	10924,
	10925,
	10925,
	10924,
	10927,
	10928,
	10928,
	10927,
	10929,
	10930,
	10930,
	10929,
	10931,
	10932,
	10932,
	10931,
	10933,
	10934,
	10934,
	10933,
	10935,
	10936,
	10936,
	10935,
	10937,
	10938,
	10938,
	10937,
	10939,
	10940,
	10940,
	10939,
	10941,
	10942,
	10942,
	10941,
	10943,
	10944,
	10944,
	10943,
	10945,
	10946,
	10946,
	10945,
	10947,
	10948,
	10948,
	10947,
	10949,
	10950,
	10950,
	10949,
	10951,
	10952,
	10952,
	10951,
	10953,
	10954,
	10954,
	10953,
	10955,
	10956,
	10956,
	10955,
	10957,
	10958,
	10958,
	10957,
	10959,
	10960,
	10960,
	10959,
	10961,
	10962,
	10962,
	10961,
	10963,
	10964,
	10964,
	10963,
	10965,
	10966,
	10966,
	10965,
	10974,
	8870,
	10979,
	8873,
	10980,
	8872,
	10981,
	8875,
	10988,
	10989,
	10989,
	10988,
	10990,
	8740,
	10999,
	11e3,
	11e3,
	10999,
	11001,
	11002,
	11002,
	11001,
	11262,
	8735,
	11778,
	11779,
	11779,
	11778,
	11780,
	11781,
	11781,
	11780,
	11785,
	11786,
	11786,
	11785,
	11788,
	11789,
	11789,
	11788,
	11804,
	11805,
	11805,
	11804,
	11808,
	11809,
	11809,
	11808,
	11810,
	11811,
	11811,
	11810,
	11812,
	11813,
	11813,
	11812,
	11814,
	11815,
	11815,
	11814,
	11816,
	11817,
	11817,
	11816,
	11861,
	11862,
	11862,
	11861,
	11863,
	11864,
	11864,
	11863,
	11865,
	11866,
	11866,
	11865,
	11867,
	11868,
	11868,
	11867,
	12296,
	12297,
	12297,
	12296,
	12298,
	12299,
	12299,
	12298,
	12300,
	12301,
	12301,
	12300,
	12302,
	12303,
	12303,
	12302,
	12304,
	12305,
	12305,
	12304,
	12308,
	12309,
	12309,
	12308,
	12310,
	12311,
	12311,
	12310,
	12312,
	12313,
	12313,
	12312,
	12314,
	12315,
	12315,
	12314,
	65113,
	65114,
	65114,
	65113,
	65115,
	65116,
	65116,
	65115,
	65117,
	65118,
	65118,
	65117,
	65124,
	65125,
	65125,
	65124,
	65288,
	65289,
	65289,
	65288,
	65308,
	65310,
	65310,
	65308,
	65339,
	65341,
	65341,
	65339,
	65371,
	65373,
	65373,
	65371,
	65375,
	65376,
	65376,
	65375,
	65378,
	65379,
	65379,
	65378
], yo = [
	40,
	41,
	0,
	41,
	40,
	1,
	91,
	93,
	0,
	93,
	91,
	1,
	123,
	125,
	0,
	125,
	123,
	1,
	3898,
	3899,
	0,
	3899,
	3898,
	1,
	3900,
	3901,
	0,
	3901,
	3900,
	1,
	5787,
	5788,
	0,
	5788,
	5787,
	1,
	8261,
	8262,
	0,
	8262,
	8261,
	1,
	8317,
	8318,
	0,
	8318,
	8317,
	1,
	8333,
	8334,
	0,
	8334,
	8333,
	1,
	8968,
	8969,
	0,
	8969,
	8968,
	1,
	8970,
	8971,
	0,
	8971,
	8970,
	1,
	9001,
	9002,
	0,
	9002,
	9001,
	1,
	10088,
	10089,
	0,
	10089,
	10088,
	1,
	10090,
	10091,
	0,
	10091,
	10090,
	1,
	10092,
	10093,
	0,
	10093,
	10092,
	1,
	10094,
	10095,
	0,
	10095,
	10094,
	1,
	10096,
	10097,
	0,
	10097,
	10096,
	1,
	10098,
	10099,
	0,
	10099,
	10098,
	1,
	10100,
	10101,
	0,
	10101,
	10100,
	1,
	10181,
	10182,
	0,
	10182,
	10181,
	1,
	10214,
	10215,
	0,
	10215,
	10214,
	1,
	10216,
	10217,
	0,
	10217,
	10216,
	1,
	10218,
	10219,
	0,
	10219,
	10218,
	1,
	10220,
	10221,
	0,
	10221,
	10220,
	1,
	10222,
	10223,
	0,
	10223,
	10222,
	1,
	10627,
	10628,
	0,
	10628,
	10627,
	1,
	10629,
	10630,
	0,
	10630,
	10629,
	1,
	10631,
	10632,
	0,
	10632,
	10631,
	1,
	10633,
	10634,
	0,
	10634,
	10633,
	1,
	10635,
	10636,
	0,
	10636,
	10635,
	1,
	10637,
	10640,
	0,
	10638,
	10639,
	1,
	10639,
	10638,
	0,
	10640,
	10637,
	1,
	10641,
	10642,
	0,
	10642,
	10641,
	1,
	10643,
	10644,
	0,
	10644,
	10643,
	1,
	10645,
	10646,
	0,
	10646,
	10645,
	1,
	10647,
	10648,
	0,
	10648,
	10647,
	1,
	10712,
	10713,
	0,
	10713,
	10712,
	1,
	10714,
	10715,
	0,
	10715,
	10714,
	1,
	10748,
	10749,
	0,
	10749,
	10748,
	1,
	11810,
	11811,
	0,
	11811,
	11810,
	1,
	11812,
	11813,
	0,
	11813,
	11812,
	1,
	11814,
	11815,
	0,
	11815,
	11814,
	1,
	11816,
	11817,
	0,
	11817,
	11816,
	1,
	11861,
	11862,
	0,
	11862,
	11861,
	1,
	11863,
	11864,
	0,
	11864,
	11863,
	1,
	11865,
	11866,
	0,
	11866,
	11865,
	1,
	11867,
	11868,
	0,
	11868,
	11867,
	1,
	12296,
	12297,
	0,
	12297,
	12296,
	1,
	12298,
	12299,
	0,
	12299,
	12298,
	1,
	12300,
	12301,
	0,
	12301,
	12300,
	1,
	12302,
	12303,
	0,
	12303,
	12302,
	1,
	12304,
	12305,
	0,
	12305,
	12304,
	1,
	12308,
	12309,
	0,
	12309,
	12308,
	1,
	12310,
	12311,
	0,
	12311,
	12310,
	1,
	12312,
	12313,
	0,
	12313,
	12312,
	1,
	12314,
	12315,
	0,
	12315,
	12314,
	1,
	65113,
	65114,
	0,
	65114,
	65113,
	1,
	65115,
	65116,
	0,
	65116,
	65115,
	1,
	65117,
	65118,
	0,
	65118,
	65117,
	1,
	65288,
	65289,
	0,
	65289,
	65288,
	1,
	65339,
	65341,
	0,
	65341,
	65339,
	1,
	65371,
	65373,
	0,
	65373,
	65371,
	1,
	65375,
	65376,
	0,
	65376,
	65375,
	1,
	65378,
	65379,
	0,
	65379,
	65378,
	1
];
//#endregion
//#region packages/core/src/text/bidi/char-data.ts
function bo(e) {
	let t = 0, n = go.length - 1;
	for (; t < n;) {
		let r = t + n + 1 >> 1;
		go[r] <= e ? t = r : n = r - 1;
	}
	return _o[t];
}
function xo(e) {
	return ho[bo(e)];
}
var So = (() => {
	let e = /* @__PURE__ */ new Map();
	for (let t = 0; t < vo.length; t += 2) e.set(vo[t], vo[t + 1]);
	return e;
})();
function Co(e) {
	return So.get(e) ?? null;
}
var wo = (() => {
	let e = /* @__PURE__ */ new Map();
	for (let t = 0; t < yo.length; t += 3) e.set(yo[t], {
		pair: yo[t + 1],
		type: yo[t + 2] === 0 ? "o" : "c"
	});
	return e;
})();
function To(e) {
	return wo.get(e) ?? null;
}
var Eo = (e) => e === "RLE" || e === "LRE" || e === "RLO" || e === "LRO" || e === "PDF" || e === "BN", Do = (e) => e === "LRI" || e === "RLI" || e === "FSI", Oo = (e) => e === "B" || e === "S" || e === "WS" || e === "ON" || e === "FSI" || e === "LRI" || e === "RLI" || e === "PDI", ko = (e) => e & 1 ? e + 2 : e + 1, Ao = (e) => e & 1 ? e + 1 : e + 2;
function jo(e, t, n) {
	let r = 0;
	for (let i = t; i < n; i++) {
		let t = e[i];
		if (Do(t)) r++;
		else if (t === "PDI") r > 0 && r--;
		else if (r === 0) {
			if (t === "L") return 0;
			if (t === "R" || t === "AL") return 1;
		}
	}
	return 0;
}
function Mo(e) {
	let t = e.length, n = new Int32Array(t).fill(t), r = new Int32Array(t).fill(-1), i = [];
	for (let a = 0; a < t; a++) {
		let t = e[a];
		if (Do(t)) i.push(a);
		else if (t === "PDI" && i.length) {
			let e = i.pop();
			n[e] = a, r[a] = e;
		}
	}
	return {
		pdiOf: n,
		initOf: r
	};
}
function No(e, t, n) {
	let r = e.length, i = Array(r).fill(t), a = e.slice(), o = [{
		level: t,
		override: "neutral",
		isolate: !1
	}], s = 0, c = 0, l = 0, u = () => o[o.length - 1];
	for (let d = 0; d < r; d++) {
		let r = e[d];
		switch (r) {
			case "RLE":
			case "LRE":
			case "RLO":
			case "LRO": {
				i[d] = u().level;
				let e = r === "RLE" || r === "RLO" ? ko(u().level) : Ao(u().level);
				e <= 125 && s === 0 && c === 0 ? o.push({
					level: e,
					override: r === "RLO" ? "R" : r === "LRO" ? "L" : "neutral",
					isolate: !1
				}) : s === 0 && c++;
				break;
			}
			case "RLI":
			case "LRI":
			case "FSI": {
				i[d] = u().level;
				let t = u().override;
				t !== "neutral" && (a[d] = t);
				let f;
				f = r === "RLI" ? "R" : r === "LRI" ? "L" : jo(e, d + 1, n[d]) === 1 ? "R" : "L";
				let p = f === "R" ? ko(u().level) : Ao(u().level);
				p <= 125 && s === 0 && c === 0 ? (l++, o.push({
					level: p,
					override: "neutral",
					isolate: !0
				})) : s++;
				break;
			}
			case "PDI":
				if (s > 0) s--;
				else if (l > 0) {
					for (c = 0; !u().isolate;) o.pop();
					o.pop(), l--;
				}
				{
					i[d] = u().level;
					let e = u().override;
					e !== "neutral" && (a[d] = e);
				}
				break;
			case "PDF":
				i[d] = u().level, s > 0 || (c > 0 ? c-- : !u().isolate && o.length >= 2 && o.pop());
				break;
			case "B":
				o.length = 1, s = 0, c = 0, l = 0, i[d] = t;
				break;
			case "BN":
				i[d] = u().level;
				break;
			default: {
				i[d] = u().level;
				let e = u().override;
				e !== "neutral" && (a[d] = e);
				break;
			}
		}
	}
	return {
		levels: i,
		types: a
	};
}
function Po(e) {
	return e === 9001 ? 12296 : e === 9002 ? 12297 : e;
}
function Fo(e, t, n, r, i, a) {
	let o = e.length, s = [];
	for (let e = 0; e < o; e++) n[e] || s.push(e);
	let c = [];
	for (let e = 0; e < s.length; e++) {
		let n = s[e];
		e === 0 || t[n] !== t[s[e - 1]] ? c.push([n]) : c[c.length - 1].push(n);
	}
	let l = /* @__PURE__ */ new Map();
	for (let e of c) l.set(e[0], e);
	let u = (e) => e & 1 ? "R" : "L", d = [];
	for (let s of c) {
		let c = s[0];
		if (e[c] === "PDI" && a[c] !== -1) continue;
		let f = [], p = s;
		for (;;) {
			for (let e of p) f.push(e);
			let t = p[p.length - 1];
			if (Do(e[t]) && i[t] !== o) {
				let e = l.get(i[t]);
				if (e) {
					p = e;
					continue;
				}
			}
			break;
		}
		let m = t[f[0]], h = r;
		for (let e = f[0] - 1; e >= 0; e--) if (!n[e]) {
			h = t[e];
			break;
		}
		let g = u(Math.max(m, h)), _ = f[f.length - 1], v = r;
		if (!(Do(e[_]) && i[_] === o)) {
			for (let e = _ + 1; e < o; e++) if (!n[e]) {
				v = t[e];
				break;
			}
		}
		let y = u(Math.max(m, v));
		d.push({
			indices: f,
			level: m,
			sos: g,
			eos: y
		});
	}
	return d;
}
var Io = (e) => e === "L" ? "L" : e === "R" || e === "EN" || e === "AN" ? "R" : null;
function Lo(e, t, n, r, i) {
	let a = e.indices, o = a.length, { sos: s, eos: c, level: l } = e;
	for (let e = 0; e < o; e++) {
		let t = a[e];
		if (r[t] === "NSM") if (e === 0) r[t] = s;
		else {
			let n = r[a[e - 1]];
			r[t] = n === "LRI" || n === "RLI" || n === "FSI" || n === "PDI" ? "ON" : n;
		}
	}
	{
		let e = s;
		for (let t = 0; t < o; t++) {
			let n = r[a[t]];
			n === "R" || n === "L" || n === "AL" ? e = n : n === "EN" && e === "AL" && (r[a[t]] = "AN");
		}
	}
	for (let e = 0; e < o; e++) r[a[e]] === "AL" && (r[a[e]] = "R");
	for (let e = 1; e < o - 1; e++) {
		let t = r[a[e]], n = r[a[e - 1]], i = r[a[e + 1]];
		t === "ES" && n === "EN" && i === "EN" || t === "CS" && n === "EN" && i === "EN" ? r[a[e]] = "EN" : t === "CS" && n === "AN" && i === "AN" && (r[a[e]] = "AN");
	}
	for (let e = 0; e < o; e++) {
		if (r[a[e]] !== "ET") continue;
		let t = e;
		for (; t < o && r[a[t]] === "ET";) t++;
		let n = e > 0 ? r[a[e - 1]] : s, i = t < o ? r[a[t]] : c;
		if (n === "EN" || i === "EN") for (let n = e; n < t; n++) r[a[n]] = "EN";
		e = t - 1;
	}
	for (let e = 0; e < o; e++) {
		let t = r[a[e]];
		(t === "ES" || t === "ET" || t === "CS") && (r[a[e]] = "ON");
	}
	{
		let e = s;
		for (let t = 0; t < o; t++) {
			let n = r[a[t]];
			n === "R" || n === "L" ? e = n : n === "EN" && e === "L" && (r[a[t]] = "L");
		}
	}
	let u = l & 1 ? "R" : "L", d = u === "R" ? "L" : "R", f = [];
	{
		let e = [];
		outer: for (let n = 0; n < o; n++) {
			let i = a[n];
			if (r[i] !== "ON") continue;
			let o = To(t[i]);
			if (o) if (o.type === "o") {
				if (e.length === 63) break outer;
				e.push({
					expect: Po(o.pair),
					pos: n
				});
			} else {
				let r = Po(t[i]);
				for (let t = e.length - 1; t >= 0; t--) if (e[t].expect === r) {
					f.push({
						open: e[t].pos,
						close: n
					}), e.length = t;
					break;
				}
			}
		}
		f.sort((e, t) => e.open - t.open);
	}
	let p = (e, t) => {
		for (let i = e + 1; i < o && n[a[i]] === "NSM"; i++) r[a[i]] = t;
	};
	for (let { open: e, close: t } of f) {
		let n = !1, i = !1;
		for (let o = e + 1; o < t; o++) {
			let e = Io(r[a[o]]);
			e === u ? n = !0 : e === d && (i = !0);
		}
		let o = null;
		if (n) o = u;
		else if (i) {
			let t = s;
			for (let n = e - 1; n >= 0; n--) {
				let e = Io(r[a[n]]);
				if (e) {
					t = e;
					break;
				}
			}
			o = t === d ? d : u;
		}
		o && (r[a[e]] = o, r[a[t]] = o, p(e, o), p(t, o));
	}
	for (let e = 0; e < o; e++) {
		if (!Oo(r[a[e]])) continue;
		let t = e;
		for (; t < o && Oo(r[a[t]]);) t++;
		let n = e > 0 ? Io(r[a[e - 1]]) : s, i = t < o ? Io(r[a[t]]) : c;
		if (n && i && n === i) for (let i = e; i < t; i++) r[a[i]] = n;
		e = t - 1;
	}
	for (let e = 0; e < o; e++) Oo(r[a[e]]) && (r[a[e]] = u);
	for (let e = 0; e < o; e++) {
		let t = a[e], n = r[t];
		l & 1 ? (n === "L" || n === "EN" || n === "AN") && (i[t] += 1) : n === "R" ? i[t] += 1 : (n === "AN" || n === "EN") && (i[t] += 2);
	}
}
function Ro(e, t, n) {
	let r = e.length, i = Array(r);
	for (let t = 0; t < r; t++) i[t] = n?.[t] ?? xo(e[t]);
	let a = t === "rtl" ? 1 : t === "ltr" ? 0 : jo(i, 0, r), { pdiOf: o, initOf: s } = Mo(i), { levels: c, types: l } = No(i, a, o), u = Array(r);
	for (let e = 0; e < r; e++) u[e] = Eo(i[e]);
	let d = Fo(i, c, u, a, o, s), f = l.slice();
	for (let t of d) Lo(t, e, i, f, c);
	let p = (e) => {
		let t = i[e];
		return t === "WS" || Do(t) || t === "PDI" || u[e];
	};
	for (let e = 0; e < r; e++) {
		let t = i[e];
		if (t === "B" || t === "S") {
			c[e] = a;
			for (let t = e - 1; t >= 0 && p(t); t--) u[t] || (c[t] = a);
		}
	}
	for (let e = r - 1; e >= 0 && p(e); e--) u[e] || (c[e] = a);
	for (let e = 0; e < r; e++) u[e] && (c[e] = -1);
	return {
		levels: c,
		paragraphLevel: a
	};
}
function zo(e, t, n) {
	let r = [];
	for (let i = t; i < n; i++) {
		let t = e[i];
		t >= 0 && t <= 126 && r.push(i);
	}
	if (r.length === 0) return r;
	let i = 0, a = 127;
	for (let t of r) {
		let n = e[t];
		n > i && (i = n), n & 1 && n < a && (a = n);
	}
	for (let t = i; t >= a; t--) {
		let n = 0;
		for (; n < r.length;) if (e[r[n]] >= t) {
			let i = n + 1;
			for (; i < r.length && e[r[i]] >= t;) i++;
			for (let e = n, t = i - 1; e < t; e++, t--) {
				let n = r[e];
				r[e] = r[t], r[t] = n;
			}
			n = i;
		} else n++;
	}
	return r;
}
//#endregion
//#region packages/core/src/text/bidi/uax9/index.ts
function Bo(e) {
	let t = [], n = [], r = [];
	for (let i = 0; i < e.length;) {
		let a = e.codePointAt(i), o = a > 65535 ? 2 : 1;
		t.push(a), n.push(o), r.push(i), i += o;
	}
	return {
		cps: t,
		units: n,
		starts: r
	};
}
var Vo = class {
	computeLevels(e, t, n) {
		let { cps: r, units: i, starts: a } = Bo(e), { levels: o, paragraphLevel: s } = Ro(r, t, n ? r.map((e, t) => n[a[t]] ?? null) : void 0), c = new Uint8Array(e.length), l = 0;
		for (let e = 0; e < o.length; e++) {
			let t = o[e] === -1 ? 255 : o[e];
			for (let n = 0; n < i[e]; n++) c[l++] = t;
		}
		return {
			levels: c,
			paragraphLevel: s
		};
	}
	reorderVisual(e, t, n) {
		return zo(e, t, n);
	}
	getMirror(e) {
		return Co(e);
	}
};
function Ho() {
	return new Vo();
}
//#endregion
//#region packages/core/src/text/bidi/engine.ts
var Uo = null;
function Wo() {
	return Uo === null && (Uo = Ho()), Uo;
}
//#endregion
//#region packages/core/src/text/bidi/line-order.ts
var Go = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u202B\u202E\u2067]|[\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
function Ko(e) {
	return Go.test(e);
}
function qo(e, t, n) {
	let r = n.length, i = new Uint8Array(r);
	for (let a = 0; a < r; a++) {
		let r = e[n[a]];
		i[a] = r === 255 ? t : r;
	}
	return {
		order: Wo().reorderVisual(i, 0, r),
		segLevels: i
	};
}
//#endregion
//#region packages/core/src/text/kinsoku/rules.ts
var Jo = "”’）〕］｝〉》」』】〙〗〟｠»、。，．・：；／？！‐ー゠–〜～ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ゝゞヽヾ゛゜％‰℃°′″｡｣､･ｰﾞﾟ!),.:;?]}｠", Yo = "“‘（〔［｛〈《「『【〘〖〝｟«＄￥＃￡￠([{｟";
function Xo(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) t.add(n.codePointAt(0));
	return t;
}
function Zo(e) {
	return {
		enabled: e?.kinsoku !== !1,
		lineStartForbidden: Xo(e?.noLineBreaksBefore ?? Jo),
		lineEndForbidden: Xo(e?.noLineBreaksAfter ?? Yo)
	};
}
var Qo = Zo();
//#endregion
//#region packages/core/src/text/kinsoku/split.ts
function $o(e, t, n, r = 1) {
	if (!n.enabled || t <= 0 || t >= e.length) return t;
	let i = (t) => t < e.length && n.lineStartForbidden.has(e[t].codePointAt(0)), a = (t) => t >= 0 && n.lineEndForbidden.has(e[t].codePointAt(0)), o = t;
	for (; o > r && (i(o) || a(o - 1));) o--;
	return o <= r && (i(o) || a(o - 1)) ? t : o;
}
function es(e, t, n) {
	if (!t.enabled) return 0;
	let r = e.length - n;
	for (let n = 1; n <= r; n++) {
		let r = e[e.length - n];
		if (/\s/.test(r) || t.lineStartForbidden.has(r.codePointAt(0))) continue;
		let i = e[e.length - n - 1];
		if (!(i && t.lineEndForbidden.has(i.codePointAt(0)))) return n;
	}
	return 0;
}
//#endregion
//#region packages/core/src/text/cjk-ranges.ts
function ts(e) {
	return e >= 12288 && e <= 40959 || e >= 44032 && e <= 55203 || e >= 63744 && e <= 64255 || e >= 65280 && e <= 65519;
}
function ns(e) {
	return e === 32 || e === 9 || e === 10 || e === 13 ? !1 : !ts(e);
}
//#endregion
//#region packages/core/src/interaction/zoom.ts
var rs = .01;
function is(e, t) {
	return e * Math.exp(-t * rs);
}
function as(e, t, n, r, i) {
	let a = n > 0 ? r / n : 1, o = (e + t) * a - t, s = i.maxScroll > 0 ? i.maxScroll : 0;
	return o < 0 ? 0 : o > s ? s : o;
}
//#endregion
//#region packages/core/src/interaction/zoomable.ts
var os = Object.freeze([
	.25,
	.33,
	.5,
	.67,
	.75,
	.9,
	1,
	1.1,
	1.25,
	1.5,
	1.75,
	2,
	2.5,
	3,
	4
]), ss = .005;
function cs(e) {
	for (let t of os) if (t > e + ss) return t;
	return os[os.length - 1];
}
function ls(e) {
	for (let t = os.length - 1; t >= 0; t--) {
		let n = os[t];
		if (n < e - ss) return n;
	}
	return os[0];
}
function us(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function ds(e, t) {
	let { contentWidth: n, contentHeight: r, containerWidth: i, containerHeight: a } = e;
	if (n <= 0 || i <= 0) return 0;
	let o = i / n;
	if (t === "width") return o;
	if (r <= 0 || a <= 0) return 0;
	let s = a / r;
	return Math.min(o, s);
}
//#endregion
//#region packages/core/src/interaction/hyperlink.ts
var fs = [
	"http",
	"https",
	"mailto",
	"tel"
];
function ps(e) {
	let t = "";
	for (let n of e) {
		let e = n.codePointAt(0);
		e !== void 0 && e > 32 && (t += n);
	}
	let n = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t);
	return n ? n[1].toLowerCase() : null;
}
function ms(e, t = fs) {
	if (e === "") return null;
	let n = ps(e);
	return n === null || t.includes(n) ? e : null;
}
function hs(e, t = fs, n = typeof window < "u" ? window : void 0) {
	let r = ms(e, t);
	return r === null || !n ? !1 : (n.open(r, "_blank", "noopener,noreferrer"), !0);
}
//#endregion
//#region packages/core/src/text/line-metrics.ts
var gs = [
	[(e) => e.includes("meiryo") || e.includes("メイリオ"), {
		asc: 2210 / 2048,
		desc: 1059 / 2048
	}],
	[(e) => e.includes("sakkal majalla") || e.includes("majalla"), {
		asc: 1810 / 2048,
		desc: 1050 / 2048
	}],
	[(e) => e === "times new roman", {
		asc: 1825 / 2048,
		desc: 530 / 2048
	}],
	[(e) => e === "arial", {
		asc: 1854 / 2048,
		desc: 501 / 2048
	}]
];
function _s(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	for (let [e, n] of gs) if (e(t)) return n;
	return null;
}
function vs(e) {
	let t = _s(e);
	return t === null ? null : t.asc + t.desc;
}
function ys(e, t) {
	let n = vs(e);
	return n === null ? 0 : n * t;
}
function bs(e, t, n, r) {
	let i = _s(e);
	if (i === null) return {
		ascent: n,
		descent: r
	};
	let a = (i.asc + i.desc) * t;
	return n + r <= a ? {
		ascent: n,
		descent: r
	} : {
		ascent: i.asc * t,
		descent: i.desc * t
	};
}
//#endregion
//#region packages/core/src/search/text-index.ts
function xs(e) {
	let t = e.toLowerCase();
	if (t.length === e.length) return t;
	let n = "";
	for (let t of e) {
		let e = t.toLowerCase();
		n += e.length === t.length ? e : t;
	}
	return n;
}
function Ss(e) {
	let t = Array(e.length), n = 0, r = "";
	for (let i = 0; i < e.length; i++) t[i] = n, r += e[i].text, n += e[i].text.length;
	return {
		text: r,
		folded: xs(r),
		runStart: t,
		runCount: e.length
	};
}
function Cs(e, t) {
	let { runStart: n } = e, r = 0, i = n.length - 1;
	for (; r < i;) {
		let e = r + i + 1 >> 1;
		n[e] <= t ? r = e : i = e - 1;
	}
	return r;
}
function ws(e, t, n) {
	let { runStart: r, runCount: i, text: a } = e, o = [], s = Cs(e, t), c = t;
	for (; c < n && s < i;) {
		let e = s + 1 < i ? r[s + 1] : a.length, t = Math.min(n, e), l = c - r[s], u = t - r[s];
		u > l && o.push({
			runIndex: s,
			start: l,
			end: u
		}), c = t, s++;
	}
	return o;
}
function Ts(e, t, n = {}) {
	if (t.length === 0) return [];
	let r = n.caseSensitive ?? !1, i = r ? e.text : e.folded, a = r ? t : xs(t), o = [], s = 0, c = 0;
	for (;;) {
		let t = i.indexOf(a, s);
		if (t === -1) break;
		o.push({
			matchIndex: c,
			slices: ws(e, t, t + a.length)
		}), c++, s = t + a.length;
	}
	return o;
}
//#endregion
//#region packages/core/src/search/find-cursor.ts
function Es(e, t) {
	return t <= 0 ? -1 : e < 0 ? 0 : (e + 1) % t;
}
function Ds(e, t) {
	return t <= 0 ? -1 : e < 0 ? t - 1 : (e - 1 + t) % t;
}
//#endregion
export { Bt as $, ao as A, Br as B, Ko as C, xe as Ct, co as D, t as Dt, fo as E, n as Et, Da as F, br as G, Pr as H, Aa as I, hr as J, xr as K, Ea as L, Fa as M, Oa as N, so as O, ka as P, Xt as Q, Yi as R, qo as S, Se as St, mo as T, ye as Tt, Or as U, kr as V, Nr as W, Yt as X, $t as Y, qt as Z, ns as _, Ne as _t, bs as a, St as at, Qo as b, Ae as bt, ps as c, pt as ct, ds as d, Ve as dt, Kt as et, cs as f, Le as ft, ts as g, He as gt, is as h, Ie as ht, Ts as i, xt as it, Ia as j, oo as k, hs as l, Re as lt, as as m, Fe as mt, Ds as n, Pt as nt, ys as o, dt as ot, ls as p, Pe as pt, gr as q, Ss as r, Ct as rt, fs as s, ft as st, Es as t, Ht as tt, us as u, ze as ut, es as v, De as vt, Wo as w, ve as wt, Zo as x, we as xt, $o as y, ke as yt, Vr as z };
