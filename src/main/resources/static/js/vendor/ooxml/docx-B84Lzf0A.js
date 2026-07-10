import { $ as e, A as t, B as n, C as r, Ct as i, D as a, Dt as o, E as s, Et as c, F as l, H as u, I as d, J as f, M as p, O as m, P as h, Q as g, S as _, St as v, T as y, Tt as b, U as x, W as S, X as C, Y as w, _t as T, a as E, b as D, bt as O, ct as k, d as A, dt as j, f as M, ft as N, g as P, gt as F, h as I, ht as L, i as R, j as z, k as B, l as V, lt as H, m as U, mt as W, n as G, o as K, p as q, pt as J, q as ee, r as te, t as Y, u as ne, ut as re, v as ie, vt as ae, w as oe, wt as se, x as X, xt as ce, y as le, yt as ue, z as de } from "./find-cursor-DgyGlCIw.js";
import { a as fe, d as pe, f as me, g as he, h as ge, i as _e, l as ve, m as ye, n as be, o as xe, p as Se, r as Ce, s as we, t as Te, u as Ee } from "./highlight-rect-CBqVAarx.js";
import { t as De } from "./mathjax-BRfWlbSJ.js";
import { t as Oe } from "./segments-BLmJVJRb.js";
//#region packages/core/src/fonts/embedded.ts
function ke(e, t) {
	let n = Ae(t), r = e.slice(), i = Math.min(32, r.length);
	for (let e = 0; e < i; e++) r[e] ^= n[e % 16];
	return r;
}
function Ae(e) {
	let t = e.replace(/[{}\-\s]/g, "");
	if (t.length !== 32 || /[^0-9a-fA-F]/.test(t)) throw Error(`invalid fontKey GUID: ${e}`);
	let n = new Uint8Array(16);
	for (let e = 0; e < 16; e++) n[e] = parseInt(t.slice(e * 2, e * 2 + 2), 16);
	return n.reverse();
}
function je(e, t, n, r) {
	let i = 2166136261;
	for (let e = 0; e < r.length; e++) i ^= r[e], i = Math.imul(i, 16777619);
	return `${e}|${t}|${n}|${r.length}|${(i >>> 0).toString(16)}`;
}
async function Me(e, t = 30 * 1024 * 1024) {
	let n = ae();
	if (!n || typeof FontFace > "u") return [];
	let r = [], a = [], o = [];
	for (let s of e) try {
		if (s.bytes.length === 0 || s.bytes.length > t) {
			o.push(s.family);
			continue;
		}
		let e = s.odttf ? ke(s.bytes, s.fontKey ?? "") : s.bytes, { face: c, isNew: l } = i(`embedded:${je(s.family, s.weight, s.style, e)}`, n, () => {
			let t = e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength), r = new FontFace(s.family, t, {
				weight: s.weight,
				style: s.style
			});
			return n.add(r), r;
		});
		r.push(c), l && a.push(c);
	} catch {
		o.push(s.family);
	}
	return a.length > 0 && await ce(Promise.allSettled(a.map((e) => e.load())).then((e) => (e.forEach((e, t) => {
		e.status === "rejected" && o.push(a[t].family);
	}), n.ready))), o.length > 0 && console.warn(`[ooxml] failed to register embedded font(s): ${[...new Set(o)].join(", ")}; falling back to substitute fonts (text may shift or differ).`), r;
}
function Ne(e) {
	v(e);
}
//#endregion
//#region packages/core/src/draw/double-border.ts
function Pe(e, t) {
	let n = Math.max(1, Math.round(e * t / 3)), r = Math.max(1, Math.round(e * t / 3));
	return {
		railDev: n,
		gapDev: r,
		spanDev: 2 * n + r
	};
}
function Fe(e, t, n, r, i, a, o) {
	let { railDev: s, gapDev: c, spanDev: l } = Pe(a, o);
	if (n === i) {
		let i = Math.round(n * o - l / 2);
		e.fillRect(t, i / o, r - t, s / o), e.fillRect(t, (i + s + c) / o, r - t, s / o);
	} else {
		let r = Math.round(t * o - l / 2);
		e.fillRect(r / o, n, s / o, i - n), e.fillRect((r + s + c) / o, n, s / o, i - n);
	}
}
//#endregion
//#region packages/core/src/text/vertical-orientation.generated.ts
var Ie = [
	"U",
	"R",
	"Tu",
	"Tr"
], Le = [
	0,
	167,
	168,
	169,
	170,
	174,
	175,
	177,
	178,
	188,
	191,
	215,
	216,
	247,
	248,
	746,
	748,
	4352,
	4608,
	5121,
	5760,
	6320,
	6400,
	8214,
	8215,
	8216,
	8218,
	8220,
	8222,
	8224,
	8226,
	8240,
	8242,
	8251,
	8253,
	8258,
	8259,
	8263,
	8266,
	8273,
	8274,
	8293,
	8294,
	8413,
	8417,
	8418,
	8421,
	8448,
	8450,
	8451,
	8458,
	8463,
	8464,
	8467,
	8469,
	8470,
	8472,
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
	8501,
	8512,
	8517,
	8523,
	8524,
	8526,
	8527,
	8586,
	8588,
	8592,
	8734,
	8735,
	8756,
	8758,
	8960,
	8968,
	8972,
	8992,
	8996,
	9001,
	9003,
	9004,
	9085,
	9115,
	9150,
	9166,
	9167,
	9168,
	9169,
	9180,
	9186,
	9251,
	9252,
	9472,
	9632,
	9754,
	9760,
	10088,
	10102,
	10132,
	11026,
	11056,
	11088,
	11098,
	11159,
	11160,
	11192,
	11218,
	11219,
	11244,
	11248,
	11264,
	11856,
	11858,
	11904,
	12289,
	12291,
	12296,
	12306,
	12308,
	12320,
	12336,
	12337,
	12353,
	12354,
	12355,
	12356,
	12357,
	12358,
	12359,
	12360,
	12361,
	12362,
	12387,
	12388,
	12419,
	12420,
	12421,
	12422,
	12423,
	12424,
	12430,
	12431,
	12437,
	12439,
	12443,
	12445,
	12448,
	12449,
	12450,
	12451,
	12452,
	12453,
	12454,
	12455,
	12456,
	12457,
	12458,
	12483,
	12484,
	12515,
	12516,
	12517,
	12518,
	12519,
	12520,
	12526,
	12527,
	12533,
	12535,
	12540,
	12541,
	12583,
	12584,
	12724,
	12728,
	12731,
	12732,
	12784,
	12800,
	13055,
	13144,
	13179,
	13184,
	42192,
	43360,
	43392,
	44032,
	55296,
	57344,
	64256,
	65040,
	65056,
	65072,
	65097,
	65104,
	65107,
	65112,
	65113,
	65119,
	65123,
	65127,
	65136,
	65281,
	65282,
	65288,
	65290,
	65292,
	65293,
	65294,
	65295,
	65306,
	65308,
	65311,
	65312,
	65339,
	65340,
	65341,
	65342,
	65343,
	65344,
	65371,
	65377,
	65504,
	65507,
	65508,
	65512,
	65520,
	65529,
	65532,
	65534,
	67968,
	68e3,
	71040,
	71168,
	72192,
	72384,
	77824,
	83584,
	94176,
	101888,
	110576,
	110898,
	110899,
	110928,
	110931,
	110933,
	110934,
	110948,
	110952,
	111360,
	118464,
	118736,
	118784,
	119296,
	119520,
	119680,
	120832,
	121520,
	126976,
	127488,
	127490,
	129024,
	129280,
	129792,
	131072,
	196606,
	196608,
	262142,
	983040,
	1048574,
	1048576,
	1114110
], Re = [
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	3,
	1,
	3,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	3,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	2,
	0,
	3,
	0,
	3,
	0,
	3,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	3,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	3,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	2,
	0,
	1,
	3,
	0,
	1,
	0,
	1,
	2,
	0,
	3,
	0,
	2,
	1,
	2,
	0,
	3,
	1,
	2,
	0,
	3,
	0,
	3,
	0,
	3,
	0,
	3,
	1,
	0,
	3,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	2,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1,
	0,
	1
];
//#endregion
//#region packages/core/src/text/vertical-orientation.ts
function ze(e) {
	let t = 0, n = Le.length - 1;
	for (; t < n;) {
		let r = t + n + 1 >> 1;
		Le[r] <= e ? t = r : n = r - 1;
	}
	return Re[t];
}
function Be(e) {
	return Ie[ze(e)];
}
function Ve(e) {
	return He.get(e) ?? null;
}
var He = new Map([
	[65292, 65040],
	[12289, 65041],
	[12290, 65042]
]);
function Ue(e) {
	return We.get(e) ?? null;
}
var We = new Map([
	[65288, 65077],
	[65289, 65078],
	[65371, 65079],
	[65373, 65080],
	[12308, 65081],
	[12309, 65082],
	[12304, 65083],
	[12305, 65084],
	[12298, 65085],
	[12299, 65086],
	[12296, 65087],
	[12297, 65088],
	[12300, 65089],
	[12301, 65090],
	[12302, 65091],
	[12303, 65092]
]), Ge = [
	[1e3, "M"],
	[900, "CM"],
	[500, "D"],
	[400, "CD"],
	[100, "C"],
	[90, "XC"],
	[50, "L"],
	[40, "XL"],
	[10, "X"],
	[9, "IX"],
	[5, "V"],
	[4, "IV"],
	[1, "I"]
];
function Ke(e) {
	let t = "", n = e;
	for (let [e, r] of Ge) for (; n >= e;) t += r, n -= e;
	return t;
}
function qe(e, t) {
	let n = t.length, r = Math.floor((e - 1) / n) + 1;
	return t[(e - 1) % n].repeat(r);
}
var Je = Array.from({ length: 26 }, (e, t) => String.fromCharCode(65 + t)), Ye = /* @__PURE__ */ "أ.ب.ت.ث.ج.ح.خ.د.ذ.ر.ز.س.ش.ص.ض.ط.ظ.ع.غ.ف.ق.ك.ل.م.ن.ه.و.ي".split("."), Xe = /* @__PURE__ */ "أ.ب.ج.د.ه.و.ز.ح.ط.ي.ك.ل.م.ن.س.ع.ف.ص.ق.ر.ش.ت.ث.خ.ذ.ض.غ.ظ".split("."), Ze = [
	"א",
	"ב",
	"ג",
	"ד",
	"ה",
	"ו",
	"ז",
	"ח",
	"ט",
	"י",
	"כ",
	"ל",
	"מ",
	"נ",
	"ס",
	"ע",
	"פ",
	"צ",
	"ק",
	"ר",
	"ש",
	"ת"
], Qe = [
	...Z(1072, 1080),
	...Z(1082, 1087),
	...Z(1088, 1097),
	"ы",
	"э",
	"ю",
	"я"
], $e = [
	...Z(1040, 1048),
	...Z(1050, 1055),
	...Z(1056, 1065),
	"Ы",
	"Э",
	"Ю",
	"Я"
], et = [
	"ก",
	"ข",
	"ค",
	...Z(3591, 3619),
	"ล",
	...Z(3623, 3630)
], tt = [
	"ㄱ",
	"ㄴ",
	"ㄷ",
	"ㄹ",
	"ㅁ",
	"ㅂ",
	"ㅅ",
	"ㅇ",
	"ㅈ",
	"ㅊ",
	"ㅋ",
	"ㅌ",
	"ㅍ",
	"ㅎ"
], nt = [
	"가",
	"나",
	"다",
	"라",
	"마",
	"바",
	"사",
	"아",
	"자",
	"차",
	"카",
	"타",
	"파",
	"하"
], rt = Z(2325, 2361), it = [
	...Z(2309, 2324),
	"अं",
	"अः"
];
function Z(e, t) {
	let n = [];
	for (let r = e; r <= t; r++) n.push(String.fromCodePoint(r));
	return n;
}
function at(e, t) {
	return String(e).split("").map((e) => t[e.charCodeAt(0) - 48]).join("");
}
var ot = Z(65296, 65305), st = Z(3664, 3673), ct = Z(2406, 2415), lt = [
	"〇",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
], ut = [
	"영",
	"일",
	"이",
	"삼",
	"사",
	"오",
	"육",
	"칠",
	"팔",
	"구"
], dt = [
	"零",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
], ft = [
	"○",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
];
function pt(e, t) {
	if (e < 10) return t[e];
	if (e < 100) {
		let n = Math.floor(e / 10), r = e % 10, i = n === 1 ? "十" : t[n] + "十";
		return r === 0 ? i : i + t[r];
	}
	return at(e, t);
}
function mt(e, t) {
	switch (t) {
		case "upperRoman": return e >= 1 ? Ke(e) : String(e);
		case "lowerRoman": return e >= 1 ? Ke(e).toLowerCase() : String(e);
		case "upperLetter": return e >= 1 ? qe(e, Je) : String(e);
		case "lowerLetter": return e >= 1 ? qe(e, Je).toLowerCase() : String(e);
		case "arabicAlpha": return e >= 1 ? qe(e, Ye) : String(e);
		case "arabicAbjad": return e >= 1 ? qe(e, Xe) : String(e);
		case "russianLower": return e >= 1 ? qe(e, Qe) : String(e);
		case "russianUpper": return e >= 1 ? qe(e, $e) : String(e);
		case "thaiLetters": return e >= 1 ? qe(e, et) : String(e);
		case "chosung": return e >= 1 ? qe(e, tt) : String(e);
		case "ganada": return e >= 1 ? qe(e, nt) : String(e);
		case "hindiVowels": return e >= 1 ? qe(e, rt) : String(e);
		case "hindiConsonants": return e >= 1 ? qe(e, it) : String(e);
		case "hebrew1": return e >= 1 ? vt(e) : String(e);
		case "hebrew2": return e >= 1 ? yt(e) : String(e);
		case "hex": return e >= 1 ? e.toString(16).toUpperCase() : String(e);
		case "numberInDash": return e >= 1 ? `- ${e} -` : String(e);
		case "decimalZero": return e >= 1 && e <= 9 ? `0${e}` : String(e);
		case "decimalFullWidth": return e >= 1 ? at(e, ot) : String(e);
		case "decimalHalfWidth": return String(e);
		case "thaiNumbers": return e >= 1 ? at(e, st) : String(e);
		case "hindiNumbers": return e >= 1 ? at(e, ct) : String(e);
		case "ideographDigital":
		case "japaneseDigitalTenThousand": return e >= 1 ? at(e, lt) : String(e);
		case "koreanDigital": return e >= 1 ? at(e, ut) : String(e);
		case "koreanDigital2": return e >= 1 ? at(e, dt) : String(e);
		case "taiwaneseDigital": return e >= 1 ? at(e, ft) : String(e);
		case "chineseCounting": return e >= 1 ? pt(e, lt) : String(e);
		case "taiwaneseCounting": return e >= 1 ? pt(e, ft) : String(e);
		case "chineseCountingThousand": return e >= 1 ? Ot(e, xt) : String(e);
		case "taiwaneseCountingThousand": return e >= 1 ? Ot(e, St) : String(e);
		case "chineseLegalSimplified": return e >= 1 ? Ot(e, wt) : String(e);
		case "ideographLegalTraditional": return e >= 1 ? Ot(e, Et) : String(e);
		case "japaneseCounting": return e >= 1 ? Ot(e, bt) : String(e);
		case "japaneseLegal": return e >= 1 ? Ot(e, Tt) : String(e);
		case "koreanCounting": return e >= 1 ? Ot(e, Ct) : String(e);
		case "koreanLegal": return e >= 1 ? jt(e) : String(e);
		default: return String(e);
	}
}
var ht = [
	"",
	"א",
	"ב",
	"ג",
	"ד",
	"ה",
	"ו",
	"ז",
	"ח",
	"ט"
], gt = [
	"",
	"י",
	"כ",
	"ל",
	"מ",
	"נ",
	"ס",
	"ע",
	"פ",
	"צ"
], _t = [
	"",
	"ק",
	"ר",
	"ש",
	"ת",
	"ך",
	"ם",
	"ן",
	"ף",
	"ץ"
];
function vt(e) {
	let t = "", n = e, r = Math.floor(n / 1e3);
	n %= 1e3;
	let i = Math.floor(n / 100);
	if (n %= 100, r > 0 && (t += ht[r % 10]), t += _t[i], n === 15) return t + "טו";
	if (n === 16) return t + "טז";
	let a = Math.floor(n / 10), o = n % 10;
	return t += gt[a], t += ht[o], t;
}
function yt(e) {
	let t = Ze.length, n = Math.floor((e - 1) / t);
	return Ze[e - t * n - 1] + "ת".repeat(n);
}
var bt = {
	digits: dt,
	ten: "十",
	hundred: "百",
	thousand: "千",
	myriad: "万",
	elideOne: !0,
	insertZero: !1
}, xt = {
	...bt,
	elideOne: !1,
	insertZero: !0
}, St = { ...xt }, Ct = {
	digits: [
		"영",
		"일",
		"이",
		"삼",
		"사",
		"오",
		"육",
		"칠",
		"팔",
		"구"
	],
	ten: "십",
	hundred: "백",
	thousand: "천",
	myriad: "만",
	elideOne: !0,
	insertZero: !1
}, wt = {
	digits: [
		"零",
		"壹",
		"贰",
		"叁",
		"肆",
		"伍",
		"陆",
		"柒",
		"捌",
		"玖"
	],
	ten: "拾",
	hundred: "佰",
	thousand: "仟",
	myriad: "万",
	elideOne: !1,
	insertZero: !0
}, Tt = {
	digits: [
		"零",
		"壱",
		"弐",
		"参",
		"四",
		"伍",
		"六",
		"七",
		"八",
		"九"
	],
	ten: "拾",
	hundred: "百",
	thousand: "阡",
	myriad: "萬",
	elideOne: !1,
	insertZero: !1
}, Et = {
	digits: [
		"零",
		"壹",
		"貳",
		"參",
		"肆",
		"伍",
		"陸",
		"柒",
		"捌",
		"玖"
	],
	ten: "拾",
	hundred: "佰",
	thousand: "仟",
	myriad: "萬",
	elideOne: !1,
	insertZero: !1
};
function Dt(e, t, n) {
	let r = Math.floor(e / 1e3) % 10, i = Math.floor(e / 100) % 10, a = Math.floor(e / 10) % 10, o = e % 10, s = [
		{
			digit: r,
			unit: t.thousand
		},
		{
			digit: i,
			unit: t.hundred
		},
		{
			digit: a,
			unit: t.ten
		},
		{
			digit: o,
			unit: ""
		}
	], c = "", l = !1, u = !1;
	for (let { digit: e, unit: r } of s) {
		if (e === 0) {
			l && (u = !0);
			continue;
		}
		u &&= (t.insertZero && (c += t.digits[0]), !1), n && e === 1 && r ? c += r : c += t.digits[e] + r, l = !0;
	}
	return c;
}
function Ot(e, t) {
	if (e >= 1e8) {
		let n = Math.floor(e / 1e8), r = e % 1e8, i = Ot(n, t) + "億";
		return r === 0 ? i : i + (t.insertZero && r < 1e7 ? t.digits[0] : "") + Ot(r, t);
	}
	let n = Math.floor(e / 1e4), r = e % 1e4, i = "";
	return n > 0 && (i += Dt(n, t, t.elideOne) + t.myriad), r > 0 && (t.insertZero && n > 0 && r < 1e3 && (i += t.digits[0]), i += Dt(r, t, t.elideOne)), i;
}
var kt = [
	"",
	"하나",
	"둘",
	"셋",
	"넷",
	"다섯",
	"여섯",
	"일곱",
	"여덟",
	"아홉"
], At = [
	"",
	"열",
	"스물",
	"서른",
	"마흔",
	"쉰",
	"예순",
	"일흔",
	"여든",
	"아흔"
];
function jt(e) {
	if (e >= 100) return String(e);
	let t = Math.floor(e / 10), n = e % 10;
	return At[t] + kt[n];
}
//#endregion
//#region packages/core/src/text/field-format-switch.ts
var Mt = {
	Arabic: "decimal",
	ArabicDash: "numberInDash",
	Hex: "hex",
	Roman: "upperRoman",
	roman: "lowerRoman",
	ALPHABETIC: "upperLetter",
	alphabetic: "lowerLetter",
	ARABICABJAD: "arabicAbjad",
	ARABICALPHA: "arabicAlpha",
	HEBREW1: "hebrew1",
	HEBREW2: "hebrew2",
	HINDIARABIC: "hindiNumbers",
	HINDILETTER1: "hindiVowels",
	HINDILETTER2: "hindiConsonants",
	THAIARABIC: "thaiNumbers",
	THAILETTER: "thaiLetters",
	CHOSUNG: "chosung",
	GANADA: "ganada",
	DBCHAR: "decimalFullWidth",
	SBCHAR: "decimalHalfWidth"
};
function Nt(e) {
	let t = /\\\*\s+(\S+)/g, n;
	for (; (n = t.exec(e)) !== null;) {
		let e = Mt[n[1]];
		if (e) return e;
	}
	return null;
}
//#endregion
//#region packages/core/src/text/date-time-picture.ts
var Pt = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December"
], Ft = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
], It = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday"
], Lt = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
], Rt = (e) => e < 10 ? `0${e}` : `${e}`;
function zt(e) {
	let t = /\\@\s*"([^"]*)"/.exec(e);
	if (t) return t[1];
	let n = /\\@\s*(\S+)/.exec(e);
	return n ? n[1] : null;
}
function Bt(e, t) {
	let n = t.getFullYear(), r = t.getMonth(), i = t.getDate(), a = t.getDay(), o = t.getHours(), s = o % 12 == 0 ? 12 : o % 12, c = t.getMinutes(), l = t.getSeconds(), u = o >= 12, d = "", f = 0, p = e.length;
	for (; f < p;) {
		let t = e[f];
		if (t === "'") {
			f++;
			let t = "";
			for (; f < p;) {
				if (e[f] === "'") {
					if (e[f + 1] === "'") {
						t += "'", f += 2;
						continue;
					}
					f++;
					break;
				}
				t += e[f++];
			}
			d += t;
			continue;
		}
		if (/[A-Za-z]/.test(t)) {
			let u = f;
			for (; u < p && e[u] === t;) u++;
			let m = e.slice(f, u).length, h = t.toLowerCase(), g = null;
			if (t === "y" || t === "Y" ? g = m >= 4 ? String(n).padStart(4, "0") : Rt(n % 100) : t === "M" ? g = m >= 4 ? Pt[r] : m === 3 ? Ft[r] : m === 2 ? Rt(r + 1) : String(r + 1) : h === "d" ? g = m >= 4 ? It[a] : m === 3 ? Lt[a] : m === 2 ? Rt(i) : String(i) : t === "H" ? g = m >= 2 ? Rt(o) : String(o) : t === "h" ? g = m >= 2 ? Rt(s) : String(s) : t === "m" ? g = m >= 2 ? Rt(c) : String(c) : t === "s" ? g = m >= 2 ? Rt(l) : String(l) : (h === "a" || h === "p") && (g = null), g !== null) {
				d += g, f = u;
				continue;
			}
			if (!(h === "a" || h === "p")) return null;
		}
		let m = /^([AaPp])([Mm])?\/([AaPp])([Mm])?/.exec(e.slice(f));
		if (m) {
			let e = m[2] !== void 0;
			d += e ? u ? "PM" : "AM" : u ? "P" : "A", f += m[0].length;
			continue;
		}
		d += t, f++;
	}
	return d;
}
//#endregion
//#region packages/docx/src/worker.ts?worker&inline
var Vt = "var e=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,n.unregister(this),e}free(){let e=this.__destroy_into_raw();v.__wbg_docxarchive_free(e,0)}extract_image(e){let t=d(e,v.__wbindgen_malloc,v.__wbindgen_realloc),n=_,i=v.docxarchive_extract_image(this.__wbg_ptr,t,n);if(i[3])throw f(i[2]);var a=r(i[0],i[1]).slice();return v.__wbindgen_free(i[0],i[1]*1,1),a}constructor(e,t){let r=u(e,v.__wbindgen_malloc),i=_,a=v.docxarchive_new(r,i,!l(t),l(t)?BigInt(0):t);if(a[2])throw f(a[1]);return this.__wbg_ptr=a[0]>>>0,n.register(this,this.__wbg_ptr,this),this}parse(){let e=v.docxarchive_parse(this.__wbg_ptr);if(e[3])throw f(e[2]);var t=r(e[0],e[1]).slice();return v.__wbindgen_free(e[0],e[1]*1,1),t}to_markdown(){let e,t;try{let i=v.docxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,f(i[2]);return e=n,t=r,o(n,r)}finally{v.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(e.prototype[Symbol.dispose]=e.prototype.free);function t(){return{__proto__:null,\"./docx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(o(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(o(e,t))}finally{v.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=d(n,v.__wbindgen_malloc,v.__wbindgen_realloc),i=_;a().setInt32(e+4,i,!0),a().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return o(e,t)},__wbindgen_init_externref_table:function(){let e=v.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const n=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>v.__wbg_docxarchive_free(e>>>0,1));function r(e,t){return e>>>=0,c().subarray(e/1,e/1+t)}let i=null;function a(){return(i===null||i.buffer.detached===!0||i.buffer.detached===void 0&&i.buffer!==v.memory.buffer)&&(i=new DataView(v.memory.buffer)),i}function o(e,t){return e>>>=0,h(e,t)}let s=null;function c(){return(s===null||s.byteLength===0)&&(s=new Uint8Array(v.memory.buffer)),s}function l(e){return e==null}function u(e,t){let n=t(e.length*1,1)>>>0;return c().set(e,n/1),_=e.length,n}function d(e,t,n){if(n===void 0){let n=g.encode(e),r=t(n.length,1)>>>0;return c().subarray(r,r+n.length).set(n),_=n.length,r}let r=e.length,i=t(r,1)>>>0,a=c(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=c().subarray(i+o,i+r),a=g.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return _=o,i}function f(e){let t=v.__wbindgen_externrefs.get(e);return v.__externref_table_dealloc(e),t}let p=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});p.decode();let m=0;function h(e,t){return m+=t,m>=2146435072&&(p=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),p.decode(),m=t),p.decode(c().subarray(e,e+t))}const g=new TextEncoder;`encodeInto`in g||(g.encodeInto=function(e,t){let n=g.encode(e);return t.set(n),{read:e.length,written:n.length}});let _=0,v;function y(e,t){return v=e.exports,i=null,s=null,v.__wbindgen_start(),v}async function b(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function x(e){if(v!==void 0)return v;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let n=t();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:r,module:i}=await b(await e,n);return y(r,i)}async function S(e){return v=void 0,i=null,s=null,x(e)}function C(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var w=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function T(e){let t=globalThis.WebAssembly?.RuntimeError;if(t&&e instanceof t||e instanceof RangeError)return!0;if(e instanceof Error){let t=e.name;if(t===`RuntimeError`||t===`CompileError`||t===`LinkError`)return!0}return!1}const E=new class{_init;_opts;_wasmInput=null;_initPromise=null;_poisoned=!1;_archive=null;constructor(e,t={}){this._init=e,this._opts=t}setWasmUrl(e){this._wasmInput=e,this._poisoned=!1,this._initPromise=this._init(e)}get archive(){return this._archive}setArchive(e){this._freeArchive(),this._archive=e}disposeArchive(){this._freeArchive()}_freeArchive(){this._archive!=null&&this._opts.freeArchive&&this._opts.freeArchive(this._archive),this._archive=null}get poisoned(){return this._poisoned}async ensureReady(){if(this._poisoned){if(this._wasmInput===null)throw Error(`WasmParserHost: setWasmUrl was never called`);let e=(this._opts.reinit??this._init)(this._wasmInput);this._initPromise=e,await e,this._poisoned=!1;return}if(this._initPromise===null)throw Error(`WasmParserHost: setWasmUrl was never called`);await this._initPromise}run(e){try{return e()}catch(e){throw T(e)?(this._poison(),new w(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`)):e}}poison(){this._poison()}_poison(){if(this._poisoned=!0,this._initPromise=null,this._archive!=null&&this._opts.freeArchive)try{this._opts.freeArchive(this._archive)}catch{}this._archive=null}}(x,{freeArchive:e=>e.free(),reinit:S});self.onmessage=async t=>{let n=t.data;if(n.type===`init`){E.setWasmUrl(C(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await E.ensureReady(),n.type===`parse`){let t=typeof n.maxZipEntryBytes==`number`&&n.maxZipEntryBytes>0?BigInt(n.maxZipEntryBytes):void 0,i=new Uint8Array(n.data),a=E.run(()=>{let n=new e(i,t);return E.setArchive(n),n.parse()}).buffer,o={type:`parsed`,id:r,documentJson:a};self.postMessage(o,[a]);return}let t=E.archive;if(n.type===`extractImage`){if(!t)throw Error(`No docx loaded`);let e=E.run(()=>t.extract_image(n.path).buffer),i={type:`imageExtracted`,id:r,bytes:e};self.postMessage(i,[e]);return}if(n.type===`toMarkdown`){if(!t)throw Error(`No docx loaded`);let e={type:`markdownRendered`,id:r,markdown:E.run(()=>t.to_markdown())};self.postMessage(e);return}}catch(e){let t={type:`error`,id:r,message:String(e)};self.postMessage(t)}};", Ht = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", Vt], { type: "text/javascript;charset=utf-8" });
function Ut(e) {
	let t;
	try {
		if (t = Ht && (self.URL || self.webkitURL).createObjectURL(Ht), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Vt), {
			type: "module",
			name: e?.name
		});
	}
}
//#endregion
//#region packages/docx/src/wasm/docx_parser_bg.wasm?url
var Wt = new URL("docx_parser_bg.wasm", import.meta.url).href;
//#endregion
//#region packages/docx/src/page-numbering.ts
function Gt(e) {
	return e?.[0]?.sectionPageNumType ?? null;
}
function Kt(e) {
	return e?.[0]?.sectionHF;
}
function qt(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n = 0; n < e.length; n++) for (let r of e[n]) {
		let e = r.sectionHF;
		t.has(e) || t.set(e, n);
	}
	return t;
}
function Jt(e) {
	let t = [], n = qt(e), r = 0;
	for (let i = 0; i < e.length; i++) {
		let a = Gt(e[i]), o = a?.fmt ?? "decimal";
		if ((i === 0 || Kt(e[i]) !== Kt(e[i - 1])) && a?.start != null) {
			let t = n.get(Kt(e[i])) ?? i;
			r = a.start + (i - t);
		} else r += 1;
		t.push({
			displayNumber: r,
			format: o
		});
	}
	return t;
}
//#endregion
//#region packages/docx/src/underline-map.ts
var Yt = {
	double: "dbl",
	dotted: "dotted",
	dottedHeavy: "dottedHeavy",
	dash: "dash",
	dashLong: "dashLong",
	dashLongHeavy: "dashLongHeavy",
	dotDash: "dotDash",
	dotDotDash: "dotDotDash",
	wavyHeavy: "wavyHeavy",
	single: "sng",
	wave: "wavy",
	wavyDouble: "wavyDbl",
	dashedHeavy: "dashHeavy",
	dashDotHeavy: "dotDashHeavy",
	dashDotDotHeavy: "dotDotDashHeavy",
	thick: "heavy",
	words: "sng"
};
function Xt(e) {
	return e ? Yt[e] ?? "sng" : "sng";
}
//#endregion
//#region packages/docx/src/cell-border-conflict.ts
var Zt = {
	single: 1,
	thick: 2,
	double: 3,
	dotted: 4,
	dashed: 5,
	dotDash: 6,
	dotDotDash: 7,
	triple: 8,
	thinThickSmallGap: 9,
	thickThinSmallGap: 10,
	thinThickThinSmallGap: 11,
	thinThickMediumGap: 12,
	thickThinMediumGap: 13,
	thinThickThinMediumGap: 14,
	thinThickLargeGap: 15,
	thickThinLargeGap: 16,
	thinThickThinLargeGap: 17,
	wave: 18,
	doubleWave: 19,
	dashSmallGap: 20,
	dashDotStroked: 21,
	threeDEmboss: 22,
	threeDEngrave: 23,
	outset: 24,
	inset: 25
}, Qt = {
	double: 2,
	triple: 3,
	thinThickSmallGap: 2,
	thickThinSmallGap: 2,
	thinThickThinSmallGap: 3,
	thinThickMediumGap: 2,
	thickThinMediumGap: 2,
	thinThickThinMediumGap: 3,
	thinThickLargeGap: 2,
	thickThinLargeGap: 2,
	thinThickThinLargeGap: 3,
	doubleWave: 2
}, $t = [
	"single",
	"thick",
	"double",
	"dotted",
	"dashed",
	"dotDash",
	"dotDotDash",
	"triple",
	"thinThickSmallGap",
	"thickThinSmallGap",
	"thinThickThinSmallGap",
	"thinThickMediumGap",
	"thickThinMediumGap",
	"thinThickThinMediumGap",
	"thinThickLargeGap",
	"thickThinLargeGap",
	"thinThickThinLargeGap",
	"wave",
	"doubleWave",
	"dashSmallGap",
	"dashDotStroked",
	"threeDEmboss",
	"threeDEngrave",
	"outset",
	"inset"
];
function en(e) {
	return Zt[e] ?? 0;
}
function tn(e) {
	return Qt[e] ?? 1;
}
function nn(e) {
	return tn(e) * en(e);
}
function rn(e) {
	let t = $t.indexOf(e);
	return t === -1 ? $t.length : t;
}
function an(e) {
	return e.style === "nil" || e.style === "none";
}
function on(e) {
	if (!e) return {
		r: 0,
		g: 0,
		b: 0
	};
	let t = e.replace(/^#/, "");
	return t.length !== 6 || /[^0-9a-fA-F]/.test(t) ? {
		r: 0,
		g: 0,
		b: 0
	} : {
		r: parseInt(t.slice(0, 2), 16),
		g: parseInt(t.slice(2, 4), 16),
		b: parseInt(t.slice(4, 6), 16)
	};
}
function sn(e, t) {
	let n = on(e), r = on(t), i = (e) => e.r + e.b + 2 * e.g, a = (e) => e.b + 2 * e.g, o = (e) => e.g;
	for (let e of [
		i,
		a,
		o
	]) {
		let t = e(n) - e(r);
		if (t !== 0) return t;
	}
	return 0;
}
function cn(e, t) {
	let n = e && !an(e.spec) ? e : null, r = t && !an(t.spec) ? t : null;
	if (!n && !r) return null;
	if (!n) return r;
	if (!r || n.source === "cell" && r.source === "table") return n;
	if (r.source === "cell" && n.source === "table") return r;
	let i = nn(n.spec.style), a = nn(r.spec.style);
	if (i !== a) return i > a ? n : r;
	let o = rn(n.spec.style), s = rn(r.spec.style);
	if (o !== s) return o < s ? n : r;
	let c = sn(n.spec.color, r.spec.color);
	return c === 0 || c < 0 ? n : r;
}
//#endregion
//#region packages/docx/src/bidi-line.ts
var ln = (e) => {
	let t = e.text;
	return typeof t == "string" ? t : void 0;
}, un = (e) => e.rtl === !0, dn = (e) => e.digitsAsAN === !0, fn = (e) => "isTab" in e;
function pn(e) {
	for (let t of e) {
		if (un(t)) return !0;
		let e = ln(t);
		if (e !== void 0 && r(e)) return !0;
	}
	return !1;
}
var mn = /[\p{P}\p{S}]/u;
function hn(e, t) {
	let n = e.length;
	if (n === 0) return {
		order: [],
		rtl: []
	};
	let r = "", i = Array(n), a = Array(n), o, s = () => {
		for (o ||= []; o.length < r.length;) o.push(null);
		return o;
	};
	for (let t = 0; t < n; t++) {
		let n = ln(e[t]) ?? "";
		if (i[t] = r.length, r += n.length > 0 ? n : "￼", a[t] = r.length, fn(e[t])) s()[i[t]] = "S";
		else if (n.length > 0 && (dn(e[t]) || un(e[t]))) {
			let n = s(), o = dn(e[t]), c = un(e[t]);
			for (let e = i[t]; e < a[t]; e++) {
				let t = r.charCodeAt(e);
				o && t >= 48 && t <= 57 ? n[e] = "AN" : c && mn.test(r[e]) && (n[e] = "R");
			}
		}
	}
	if (o) for (; o.length < r.length;) o.push(null);
	let { levels: c, paragraphLevel: l } = oe().computeLevels(r, t ? "rtl" : "ltr", o), { order: u } = _(c, l, i), d = Array(n);
	for (let e = 0; e < n; e++) {
		let t = a[e];
		for (; t > i[e] && r[t - 1] === " ";) t--;
		let n = !1;
		for (let r = i[e]; r < t; r++) {
			let e = c[r];
			if (e !== 255 && (e & 1) == 1) {
				n = !0;
				break;
			}
		}
		d[e] = n;
	}
	return {
		order: u,
		rtl: d
	};
}
function gn(e, t) {
	switch (e) {
		case "center": return "center";
		case "both":
		case "justify":
		case "distribute":
		case "lowKashida":
		case "mediumKashida":
		case "highKashida":
		case "thaiDistribute": return "justify";
		case "end":
		case "right": return t ? "left" : "right";
		case "start":
		case "left":
		case void 0:
		default: return t ? "right" : "left";
	}
}
function _n(e) {
	switch (e) {
		case "both":
		case "justify":
		case "distribute":
		case "lowKashida":
		case "mediumKashida":
		case "highKashida":
		case "thaiDistribute": return !0;
		default: return !1;
	}
}
function vn(e) {
	return e === "distribute" || e === "thaiDistribute";
}
var yn = .05;
function bn(e) {
	return (72 - yn) * e;
}
function xn(e) {
	return e === "square" || e === "topAndBottom" || e === "tight" || e === "through";
}
function Sn(e, t, n, r, i, a, o, s) {
	return e < a - .01 && t > i + .01 && n < s - .01 && r > o + .01;
}
function Cn(e, t, n) {
	let r = e.slice().sort((e, t) => e.l - t.l), i = t, a = null, o = (e, t) => {
		t - e > (a ? a.r - a.l : 0) && (a = {
			l: e,
			r: t
		});
	};
	for (let e of r) if (e.l > i && o(i, Math.min(e.l, n)), i = Math.max(i, Math.min(e.r, n)), i >= n) break;
	return i < n && o(i, n), a;
}
function wn(e, t, n, r, i, a) {
	for (let t = 0; t < 16; t++) {
		let t = e + n, r = null;
		for (let n of a) n.mode === "topAndBottom" && t > n.yTop && e < n.yBottom && (r = r === null ? n.yBottom : Math.max(r, n.yBottom));
		if (r === null) break;
		e = r;
	}
	let o = r, s = r + i, c = Math.max(t, 1), l = 0, u = i;
	for (let t = 0; t < 64; t++) {
		let t = e + n, r = [], d = [];
		for (let n of a) if (n.mode === "square" && !(t <= n.yTop || e >= n.yBottom)) switch (d.push(n), n.side) {
			case "left":
				r.push({
					l: n.xLeft,
					r: s
				});
				break;
			case "right":
				r.push({
					l: o,
					r: n.xRight
				});
				break;
			default:
				r.push({
					l: n.xLeft,
					r: n.xRight
				});
				break;
		}
		if (d.length === 0) {
			l = 0, u = i;
			break;
		}
		let f = Cn(r, o, s);
		if (f && f.r - f.l >= c) {
			l = Math.max(0, f.l - o), u = Math.min(i - l, f.r - f.l), u < 0 && (u = 0);
			break;
		}
		let p = Math.max(...d.map((e) => e.yBottom));
		if (p <= e) {
			l = 0, u = i;
			break;
		}
		e = p;
	}
	return {
		topY: e,
		xOffset: l,
		maxWidth: u
	};
}
function Tn(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	for (let p = 0; p < 16; p++) {
		let p = e - i, m = e + n + a, h = t - o, g = t + r + s, _ = f.filter((e) => (l ? e.paraId !== c : u !== "table" || e.kind === "table") && Sn(p, m, h, g, e.xLeft, e.xRight, e.yTop, e.yBottom));
		if (_.length === 0) return {
			x: e,
			y: t
		};
		let v = Math.max(..._.map((e) => e.xRight)) + i;
		if (v + n + a <= d + .5) {
			e = v;
			continue;
		}
		t = Math.max(..._.map((e) => e.yBottom)) + o;
	}
	return {
		x: e,
		y: t
	};
}
function En(e, t) {
	for (let n = 0; n < 16; n++) {
		let n = e;
		for (let r of t) r.mode === "topAndBottom" && e >= r.yTop && e < r.yBottom && (n = Math.max(n, r.yBottom));
		if (n === e) return e;
		e = n;
	}
	return e;
}
//#endregion
//#region packages/docx/src/text-distribute.ts
function Dn(e, t, n, r, i = -Infinity, a = !0) {
	return _e(e, t, {
		firstContentSi: n,
		lastDrawnSi: r,
		minPerGap: i,
		...a ? {} : { isGapChar: () => !1 }
	});
}
function On(e) {
	if (!e) return 0;
	let t = 0;
	for (let n of e.perSeg.values()) t += n.splitBefore.length + +!!n.trailingGap;
	return e.perGap * t;
}
function kn(e, t, n, r, i) {
	return t >= 0 ? null : Dn(e, t, n, r, -i * .25, !1);
}
//#endregion
//#region packages/docx/src/frame-geometry.ts
function An(e, t) {
	let n = t.scale;
	switch (e) {
		case "margin": return {
			left: t.marginLeft * n,
			right: (t.pageWidth - t.marginRight) * n
		};
		case "page": return {
			left: 0,
			right: t.pageWidth * n
		};
		default: return {
			left: t.contentX,
			right: t.contentX + t.contentW
		};
	}
}
function jn(e, t, n, r) {
	let i = r.scale;
	switch (e) {
		case "margin": return {
			start: r.marginTop * i,
			end: r.pageH - r.marginBottom * i
		};
		case "page": return {
			start: 0,
			end: r.pageH
		};
		default: return {
			start: t,
			end: t + n
		};
	}
}
function Mn(e, t, n, r) {
	switch (e) {
		case "center": return t + (n - t - r) / 2;
		case "right":
		case "outside": return n - r;
		default: return t;
	}
}
function Nn(e, t, n) {
	switch (e) {
		case "center": return t.start + (t.end - t.start - n) / 2;
		case "bottom":
		case "outside": return t.end - n;
		default: return t.start;
	}
}
function Pn(e, t, n) {
	return e + t <= n.end ? e : Math.max(n.start, n.end - t);
}
function Fn(e, t, n, r, i, a) {
	let o = t.scale, s = e.dropCap === "drop" || e.dropCap === "margin", c = An(e.hAnchor, t), l = jn(e.vAnchor, n, i, t), u = e.w == null ? r : e.w * o, d;
	if (s) d = Math.max(1, e.lines) * a;
	else {
		let t = e.h == null ? 0 : e.h * o;
		d = e.hRule === "exact" ? t : e.hRule === "atLeast" ? Math.max(t, i) : i;
	}
	let f;
	f = e.dropCap === "drop" ? c.left : e.dropCap === "margin" ? c.left - u : e.xAlign ? Mn(e.xAlign, c.left, c.right, u) : c.left + (e.x == null ? 0 : e.x * o);
	let p;
	p = s ? l.start : e.yAlign && e.vAnchor !== "text" ? Nn(e.yAlign, l, d) : l.start + (e.y == null ? 0 : e.y * o), (e.vAnchor === "page" || e.vAnchor === "margin") && (p = Pn(p, d, l));
	let m = e.wrap === "around" || e.wrap === "auto" ? e.hSpace * o : 0, h = e.vSpace * o;
	return {
		x: f,
		y: p,
		w: u,
		h: d,
		exLeft: f - m,
		exRight: f + u + m,
		exTop: p - h,
		exBottom: p + d + h
	};
}
function In(e, t) {
	let n = t.x, r = t.y;
	if (t.avoidOverlap) {
		let i = Tn(n, r, t.w, t.h, t.dl, t.dr, t.dt, t.db, t.paraId, t.allowOverlap ?? !0, t.kind, e.pageWidth * e.scale, e.floats);
		n = i.x, r = i.y;
	}
	let i = {
		kind: t.kind,
		mode: t.mode,
		imageKey: t.imageKey,
		imageX: n,
		imageY: r,
		imageW: t.w,
		imageH: t.h,
		xLeft: n - t.dl,
		xRight: n + t.w + t.dr,
		yTop: r - t.dt,
		yBottom: r + t.h + t.db,
		side: t.side,
		distLeft: t.dl,
		distRight: t.dr,
		distTop: t.dt,
		distBottom: t.db,
		paraId: t.paraId,
		drawn: t.drawn
	};
	return e.floats.push(i), i;
}
function Ln(e, t, n) {
	if (t.wrap === "none" || e.w <= 0 || e.h <= 0) return;
	let r = n.floatParaSeq++, i = t.wrap === "notBeside" ? "topAndBottom" : "square";
	In(n, {
		x: e.x,
		y: e.y,
		w: e.w,
		h: e.h,
		dl: e.x - e.exLeft,
		dr: e.exRight - (e.x + e.w),
		dt: e.y - e.exTop,
		db: e.exBottom - (e.y + e.h),
		kind: "frame",
		mode: i,
		side: t.dropCap === "drop" || t.dropCap === "margin" ? "right" : "bothSides",
		imageKey: "",
		drawn: !0,
		paraId: r,
		avoidOverlap: !1
	});
}
//#endregion
//#region packages/docx/src/float-table-geometry.ts
function Rn(e, t, n, r, i, a = !1) {
	let o = t.scale, s = e.horzSpecified ? An(e.horzAnchor, t) : An("text", t), c = jn(e.vertAnchor, n, i, t), l;
	l = e.tblpXSpec ? Mn(e.tblpXSpec, s.left, s.right, r) : s.left + e.tblpX * o;
	let u;
	return u = e.tblpYSpec && e.vertAnchor !== "text" ? Nn(e.tblpYSpec, c, i) : c.start + e.tblpY * o, !a && (e.vertAnchor === "page" || e.vertAnchor === "margin") && (u = Pn(u, i, c)), {
		x: l,
		y: u,
		w: r,
		h: i
	};
}
function zn(e, t, n, r, i) {
	if (e.w <= 0 || e.h <= 0) return;
	let a = n.scale, o = t.leftFromText * a, s = t.rightFromText * a, c = t.topFromText * a, l = t.bottomFromText * a, u = n.floatParaSeq++;
	In(n, {
		x: e.x,
		y: e.y,
		w: e.w,
		h: e.h,
		dl: o,
		dr: s,
		dt: c,
		db: l,
		kind: "table",
		mode: "square",
		side: r,
		imageKey: "",
		drawn: !0,
		paraId: u,
		avoidOverlap: !0,
		allowOverlap: i
	});
}
function Bn(e, t) {
	let n = (t.contentX + (t.contentX + t.contentW)) / 2;
	return e.x + e.w <= n ? "right" : e.x >= n ? "left" : "bothSides";
}
//#endregion
//#region packages/docx/src/anchor-geometry.ts
function Vn(e, t, n) {
	let { scale: r } = n, i = n.pageWidth * r, a = n.marginLeft * r, o = n.marginRight * r;
	switch (e ?? (t ? "margin" : "page")) {
		case "page": return {
			start: 0,
			end: i
		};
		case "leftMargin": return {
			start: 0,
			end: a
		};
		case "rightMargin": return {
			start: i - o,
			end: i
		};
		case "insideMargin": return {
			start: 0,
			end: a
		};
		case "outsideMargin": return {
			start: i - o,
			end: i
		};
		case "character":
		case "column": return {
			start: n.contentX,
			end: n.contentX + n.contentW
		};
		default: return {
			start: a,
			end: i - o
		};
	}
}
function Hn(e, t, n, r) {
	let { scale: i } = r, a = r.marginTop * i, o = r.marginBottom * i;
	switch (e ?? (t ? "paragraph" : "page")) {
		case "page": return {
			start: 0,
			end: r.pageH
		};
		case "topMargin": return {
			start: 0,
			end: a
		};
		case "bottomMargin": return {
			start: r.pageH - o,
			end: r.pageH
		};
		case "paragraph":
		case "line": return {
			start: n,
			end: r.pageH
		};
		default: return {
			start: a,
			end: r.pageH - o
		};
	}
}
function Un(e, t, n, r, i, a, o, s) {
	let { scale: c } = i, l = Vn(a, t, i), u = n * c;
	if (o != null) return l.start + (l.end - l.start) * o + u;
	if (!e) return l.start + u;
	let d = l.end - l.start, f = s == null ? r : s * c;
	switch (e) {
		case "center": return l.start + (d - f) / 2 + u;
		case "right":
		case "outside": return l.end - f + u;
		default: return l.start + u;
	}
}
function Wn(e, t, n, r, i, a, o, s, c) {
	let { scale: l } = a, u = Hn(o, t, i, a), d = n * l;
	if (s != null) return u.start + (u.end - u.start) * s + d;
	if (!e) return u.start + d;
	let f = u.end - u.start, p = c == null ? r : c * l;
	switch (e) {
		case "center": return u.start + (f - p) / 2 + d;
		case "bottom":
		case "outside": return u.end - p + d;
		default: return u.start + d;
	}
}
function Gn(e, t, n) {
	let r = t;
	for (let i = t + 1; i < e.rows.length; i++) {
		let t = e.rows[i], a = 0, o = !1;
		for (let e of t.cells) {
			if (a === n) {
				e.vMerge === !1 && (o = !0);
				break;
			}
			if (a > n) break;
			a += e.colSpan;
		}
		if (!o) break;
		r = i;
	}
	return r;
}
function Kn(e, t, n, r) {
	if (e.rowHeight != null && e.rowHeightRule === "exact") return e.rowHeight * n;
	let i = e.rowHeight != null && (e.rowHeightRule === "atLeast" || e.rowHeightRule === "auto") ? e.rowHeight * n : 10 * n, a = 0;
	for (let n of e.cells) {
		let e = Math.min(n.colSpan, t.length - a);
		if (n.vMerge !== !0 && n.vMerge !== !1) {
			let o = r(n, t.slice(a, a + e).reduce((e, t) => e + t, 0));
			o > i && (i = o);
		}
		a += e;
	}
	return i;
}
function qn(e, t, n, r) {
	let i = e.rows.map((e) => Kn(e, t, n, r));
	for (let n = 0; n < e.rows.length; n++) {
		let a = 0;
		for (let o of e.rows[n].cells) {
			let s = Math.min(o.colSpan, t.length - a);
			if (o.vMerge === !0) {
				let c = r(o, t.slice(a, a + s).reduce((e, t) => e + t, 0)), l = Gn(e, n, a), u = 0;
				for (let e = n; e <= l; e++) u += i[e];
				u < c && (i[l] += c - u);
			}
			a += s;
		}
	}
	return i;
}
//#endregion
//#region packages/docx/src/line-layout.ts
var Jn = /* @__PURE__ */ new WeakMap(), Yn = new Set([
	"sakkal majalla",
	"traditional arabic",
	"simplified arabic",
	"arabic typesetting",
	"univers next arabic",
	"noto naskh arabic",
	"noto sans arabic"
]), Xn = new Set([
	"sakkal majalla",
	"traditional arabic",
	"simplified arabic",
	"arabic typesetting",
	"noto naskh arabic"
]);
function Zn(e) {
	return Yn.has(e.toLowerCase());
}
function Qn(e) {
	return e.map((e) => `"${e}"`).join(", ");
}
var $n = ["Noto Naskh Arabic", "Noto Sans Arabic"];
function er(e) {
	let t = e && e !== "jp" ? N(e, "sans") : [
		"Noto Sans JP",
		"Hiragino Sans",
		"Meiryo",
		...N("jp", "sans").slice(1)
	];
	return e == null ? `${Qn([
		...H,
		"Arial",
		"Helvetica",
		"Liberation Sans",
		...t,
		...$n
	])}, sans-serif` : `${Qn([
		...t,
		...$n,
		...H
	])}, sans-serif`;
}
function tr(e) {
	let t = e && e !== "jp" ? N(e, "serif") : [
		"Yu Mincho",
		"YuMincho",
		"Hiragino Mincho ProN",
		"MS Mincho",
		"Noto Serif JP",
		...N("jp", "serif").slice(1)
	];
	return e == null ? `${Qn([
		...re,
		"Times New Roman",
		"Cambria",
		"Liberation Serif",
		...t,
		...$n
	])}, serif` : `${Qn([
		...t,
		...$n,
		...re
	])}, serif`;
}
var nr = /* @__PURE__ */ new WeakMap();
function rr(e, t = {}) {
	let n = nr.get(t) ?? (() => {
		let e = /* @__PURE__ */ new Map();
		return nr.set(t, e), e;
	})(), r = e ?? "\0null", i = n.get(r);
	if (i !== void 0) return i;
	let a = ir(e, t);
	return n.set(r, a), a;
}
function ir(e, t) {
	if (!e) return er(null);
	let n = `"${((e) => e.replace(/"/g, "\\\""))(e)}"`, r = e.toLowerCase(), i = J(e);
	if (Zn(e)) return Xn.has(r) ? `${n}, "Noto Naskh Arabic", "Noto Sans Arabic", "Noto Serif", "Noto Sans JP", "Hiragino Sans", serif` : `${n}, "Noto Sans Arabic", "Noto Naskh Arabic", "Noto Sans JP", "Hiragino Sans", sans-serif`;
	let a = t[e];
	if (a && a !== "auto") switch (a) {
		case "roman": return `${n}, ${tr(i)}`;
		case "swiss": return `${n}, ${er(i)}`;
		case "modern": return `${n}, "Courier New", monospace`;
		default: break;
	}
	let o = W(e);
	if (o === "serif") return `${n}, ${tr(i)}`;
	if (o === "mono") return `${n}, "Courier New", monospace`;
	if (i == null || i === "jp") {
		if (r.includes("meiryo") || e.includes("メイリオ")) return `${n}, "Meiryo UI", "Meiryo", ${er(i)}`;
		if (e.includes("游ゴシック") || /\byu\s*gothic\b/i.test(e) || r.includes("yugothic")) return `${n}, "Yu Gothic", "YuGothic", ${er(i)}`;
		if (r.includes("ipa")) return `${n}, "IPAexGothic", ${er(i)}`;
		if (r.includes("segoe")) return `${n}, "Segoe UI", ${Qn([...$n, ...H])}, sans-serif`;
	}
	return `${n}, ${er(i)}`;
}
function Q(e, t, n, r, i = {}) {
	return `${t ? "italic" : "normal"} ${e ? "bold" : "normal"} ${n}px ${rr(r, i)}`;
}
function ar(e, t) {
	let n = (e.smallCaps ? Math.max(e.fontSize - 2, 1) : e.fontSize) * t;
	return e.vertAlign && (n *= .65), n;
}
function or(e) {
	for (let t of e.runs) if (t.type === "text" || t.type === "field") return t.fontSize;
	return typeof e.defaultFontSize == "number" ? e.defaultFontSize : 10;
}
function sr(e) {
	for (let t of e.runs) if (t.type === "text" || t.type === "field") return t.fontFamily;
	return e.defaultFontFamily ?? null;
}
function cr(e, t) {
	return K(sr(e), or(e) * t);
}
var lr = /[ᄀ-ᇿ⺀-⿟　-〿぀-ヿ㄰-㆏㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/u;
function ur(e, t) {
	return !e || e.charSpacePt == null || e.type !== "linesAndChars" && e.type !== "snapToChars" ? 0 : e.charSpacePt * t;
}
function dr(e) {
	let t = 0;
	for (let n of e) lr.test(n) && t++;
	return t;
}
function fr(e, t) {
	if (t === 0 || e.length === 0) return 0;
	let n = [...e];
	return dr(e) === n.length ? n.length * t : 0;
}
function pr(e, t, n) {
	return e + fr(t, n);
}
function mr(e, t) {
	return (e.charSpacing ?? 0) * t;
}
function hr(e) {
	return e.charScale ?? 1;
}
function gr(e, t, n, r) {
	return e.tateChuYoko ? e.fontSize * r : t * hr(e) + fr(e.text, n) + [...e.text].length * mr(e, r);
}
function _r(e) {
	return !e || !e.linePitchPt || e.linePitchPt <= 0 ? !1 : e.type === "lines" || e.type === "linesAndChars";
}
function vr(e, t, n, r, i, a, o = 0, s = !1) {
	let c = t + n, l = Math.max(c, o), u = _r(i), d = u ? i.linePitchPt * r : 0, f = () => s ? Math.max(d, Math.ceil(c / d) * d) : Math.max(c, d), p = e !== null && e.explicit !== !0;
	return !e || (e.rule === "exact" || e.rule === "auto") && e.value <= 0 ? u ? f() : l : e.rule === "auto" ? u ? p ? f() : Math.max(c, d * e.value) : l * e.value : e.rule === "exact" ? e.value * r : e.rule === "atLeast" ? Math.max(l, e.value * r) : l;
}
function yr(e, t) {
	return {
		asc: e * t * .8,
		desc: e * t * .2
	};
}
function br(e, t, n, r) {
	return E(t, r, e.fontBoundingBoxAscent ?? e.actualBoundingBoxAscent ?? n * .8, e.fontBoundingBoxDescent ?? e.actualBoundingBoxDescent ?? n * .2);
}
function xr(e, t, n, r, i = !1, a, o = {}) {
	let s = or(e), c = sr(e), l, u;
	if (a) {
		let e = a.font;
		a.font = Q(!1, !1, s * t, c, o);
		let n = a.measureText(i ? "あ" : "x");
		a.font = e, {ascent: l, descent: u} = br(n, c, s * t, s * t);
	} else ({asc: l, desc: u} = yr(s, t));
	return vr(e.lineSpacing, l, u, t, n, r, cr(e, t), i);
}
function Sr(e) {
	let t = [];
	for (let n of e) {
		let e = n.toLowerCase() === n && n.toUpperCase() !== n, r = /\s/.test(n) ? t[t.length - 1]?.reduced ?? !1 : e, i = t[t.length - 1];
		i && i.reduced === r ? i.text += n : t.push({
			text: n,
			reduced: r
		});
	}
	return t.length ? t : [{
		text: e,
		reduced: !1
	}];
}
function Cr(e, t) {
	for (let n = t - 1; n >= 0; n--) {
		let t = e[n];
		if (t.type === "text" || t.type === "field") return t.fontSize;
	}
	for (let n = t + 1; n < e.length; n++) {
		let t = e[n];
		if (t.type === "text" || t.type === "field") return t.fontSize;
	}
	return 10;
}
function wr(e, t) {
	if (e.fieldType === "page") return mt(t.displayPageNumber ?? t.pageIndex + 1, Nt(e.instruction) ?? t.pageNumberFormat ?? "decimal");
	if (e.fieldType === "numPages") {
		let n = Nt(e.instruction) ?? "decimal";
		return mt(t.totalPages, n);
	}
	if (e.fieldType === "date" || e.fieldType === "time") {
		let n = zt(e.instruction);
		if (n) {
			let e = Bt(n, new Date(t.currentDateMs ?? Date.now()));
			if (e !== null) return e;
		}
		return e.fallbackText;
	}
	return e.fallbackText;
}
function Tr(e) {
	for (let t = 0; t < e.length;) {
		let n = e.codePointAt(t);
		if (P(n)) return !0;
		t += n > 65535 ? 2 : 1;
	}
	return !1;
}
function Er(e, t, n, r = 0, i = 1, a = 0) {
	let o = [...t], s = 0, c = o.length;
	for (; s < c;) {
		let t = s + c + 1 >> 1, l = o.slice(0, t).join("");
		e.measureText(l).width * i + fr(l, r) + t * a <= n ? s = t : c = t - 1;
	}
	return o.slice(0, s).join("");
}
var Dr = new Set([
	"ar",
	"fa",
	"ur",
	"he",
	"iw",
	"yi",
	"ji",
	"ps",
	"sd",
	"ug",
	"dv",
	"syr",
	"ckb"
]);
function Or(e, t) {
	if (e) {
		let t = e.split("-")[0].toLowerCase();
		if (Dr.has(t)) return !0;
	}
	return t;
}
function kr(e) {
	let t = [], n = null, r = "";
	for (let i of e) {
		let e = i.codePointAt(0);
		if (!/\p{L}/u.test(i)) {
			r += i;
			continue;
		}
		let a = L(e);
		n === null ? (n = a, r += i) : a === n ? r += i : (t.push({
			text: r,
			cs: n
		}), n = a, r = i);
	}
	return r.length > 0 && t.push({
		text: r,
		cs: n ?? !1
	}), t;
}
function Ar(e) {
	let t = [], n = null, r = "";
	for (let i of e) {
		let e = P(i.codePointAt(0));
		n === null || e === n ? (n = e, r += i) : (t.push({
			text: r,
			ea: n
		}), n = e, r = i);
	}
	return r.length > 0 && t.push({
		text: r,
		ea: n ?? !1
	}), t;
}
function jr(e) {
	let t = (e) => e >= 48 && e <= 57, n = (e) => e === "." || e === "," || e === ":" || e === "/" || e === "\xA0", r = [], i = "", a = null;
	for (let o = 0; o < e.length; o++) {
		let s = e[o], c = t(s.charCodeAt(0));
		!c && a === !0 && n(s) && t(e.charCodeAt(o + 1)) && (c = !0), a === null || c === a ? i += s : (r.push(i), i = s), a = c;
	}
	return i.length > 0 && r.push(i), r.length ? r : [e];
}
function Mr(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = n;
		for (; r < e.length && e[r] !== " ";) r++;
		for (; r < e.length && e[r] === " ";) r++;
		r > n && t.push(e.slice(n, r)), n = r;
	}
	return t.length ? t : [e];
}
var Nr = .25;
function Pr(e) {
	let t = e?.defaultTabStop;
	return t != null && t > 0 ? t : 36;
}
function Fr(e, t, n) {
	let r = null, i = 0;
	for (let n of t) n.pos > i && (i = n.pos), n.pos > e && (r === null || n.pos < r.pos) && (r = n);
	let a = null;
	if (n > 0) {
		let t = Math.ceil((Math.max(e, i) + 1e-6) / n) * n;
		t <= e && (t += n), a = {
			pos: t,
			alignment: "left"
		};
	}
	return r && a ? r.pos <= a.pos ? r : a : r ?? a;
}
function Ir(e, t, n) {
	let r = null, i = 0;
	for (let n of t) n.pos > i && (i = n.pos), n.pos > e && (r === null || n.pos < r.pos) && (r = n);
	let a = null;
	if (n > 0) {
		let t = Math.ceil((Math.max(e, i) + 1e-6) / n) * n;
		t <= e && (t += n), a = {
			pos: t,
			alignment: "left"
		};
	}
	return r && a ? r.pos <= a.pos ? r : a : r ?? a;
}
function Lr(e, t, n, r, i) {
	let a = e.length, o = e.map((e) => e.width), s = Array(a).fill(void 0), c = (t) => {
		let n = 0;
		for (let r = t; r < a && !e[r].isTab; r++) n += o[r];
		return n;
	}, l = n;
	for (let n = 0; n < a; n++) {
		if (!e[n].isTab) {
			l += o[n];
			continue;
		}
		let a = Ir(l, t, i);
		if (!a) {
			o[n] = 0;
			continue;
		}
		let u = c(n + 1), d;
		d = a.alignment === "right" ? a.pos - u : a.alignment === "center" ? a.pos - u / 2 : a.pos, d + u > r && (d = r - u), d < l && (d = l), o[n] = d - l, s[n] = a.leader, l = d;
	}
	return e.map((e, t) => ({
		width: o[t],
		leader: s[t]
	}));
}
function Rr(e, t) {
	if (e === t) return !0;
	if (e.enabled !== t.enabled) return !1;
	let n = (e, t) => {
		if (e.size !== t.size) return !1;
		for (let n of e) if (!t.has(n)) return !1;
		return !0;
	};
	return n(e.lineStartForbidden, t.lineStartForbidden) && n(e.lineEndForbidden, t.lineEndForbidden);
}
function zr(e) {
	for (let t of e.runs) if (t.type === "field") {
		let e = t.fieldType;
		if (e === "page" || e === "numPages" || e === "date" || e === "time") return !0;
	} else if (t.type === "text" && t.noteRef) return !0;
	return !1;
}
function Br(e, t) {
	let n = [], r = (e, r, i) => {
		let a = !1, o = r.ruby, s = o ? {
			text: o.text,
			fontSizePt: o.fontSizePt
		} : void 0, c = r.revision, l = r, u = l.rtl === !0 ? !0 : void 0, d = l.hyperlink ? {
			kind: "external",
			url: l.hyperlink
		} : l.hyperlinkAnchor ? {
			kind: "internal",
			ref: l.hyperlinkAnchor
		} : void 0, f = l.rtl === !0 || l.cs === !0, p = l.fontSizeCs ?? r.fontSize, m = l.fontFamilyCs ?? r.fontFamily, h = l.boldCs ?? r.bold, g = l.italicCs ?? r.italic, _ = r.fontFamilyEastAsia ?? r.fontFamily, v = (f || l.rtl === !0) && Or(l.langBidi, l.rtl === !0), y = !0, b = !1, x = (e, o, f) => {
			n.push({
				text: e,
				bold: o ? h : r.bold,
				italic: o ? g : r.italic,
				underline: r.underline,
				underlineStyle: r.underlineStyle,
				underlineColor: r.underlineColor,
				strikethrough: r.strikethrough,
				fontSize: o ? p : r.fontSize,
				color: r.color,
				fontFamily: f,
				vertAlign: i,
				measuredWidth: 0,
				smallCaps: a,
				joinPrev: b ? !0 : void 0,
				doubleStrikethrough: r.doubleStrikethrough ?? !1,
				highlight: r.highlight ?? null,
				emphasisMark: r.emphasisMark,
				background: r.background ?? null,
				colorAuto: l.colorAuto ?? !1,
				border: l.border ?? null,
				ruby: y ? s : void 0,
				revision: c,
				rtl: u,
				digitsAsAN: v ? !0 : void 0,
				eaFloorFamily: _,
				hyperlink: d,
				charSpacing: l.charSpacing,
				charScale: l.charScale,
				position: l.position,
				kerning: l.kerning,
				tateChuYoko: t.verticalCJK && l.eastAsianVert === !0 ? !0 : void 0,
				tateChuYokoCompress: t.verticalCJK && l.eastAsianVert === !0 && l.eastAsianVertCompress === !0 ? !0 : void 0
			}), y = !1, b = !1;
		}, S = (e, t) => {
			let n = t === "cs", i = t === "cs" ? m : t === "ea" ? _ : r.fontFamily;
			if (ye(i)) {
				for (let t of he(e, i)) x(t.text, n, t.mapped ? null : i);
				return;
			}
			x(e, n, i);
		}, C = (e) => {
			for (let t of Ar(e)) S(t.text, t.ea ? "ea" : "latin");
		}, w = r.smallCaps ? Sr(e) : [{
			text: e,
			reduced: !1
		}], T = "";
		for (let e of w) {
			a = e.reduced, b = T.length > 0 && !/\s$/.test(T), T = e.text;
			let t = r.allCaps || r.smallCaps ? e.text.toUpperCase() : e.text;
			for (let e of Mr(t)) if (f) if (v) for (let t of jr(e)) S(t, "cs");
			else S(e, "cs");
			else for (let t of kr(e)) t.cs ? S(t.text, "cs") : C(t.text);
		}
	};
	for (let i of e) if (i.type === "text") {
		let e = i, a = e.noteRef ? e.noteRef.id ? t.noteNumbers?.get(`${e.noteRef.kind}:${e.noteRef.id}`) : t.currentNoteNumber : void 0;
		if (e.noteRef) {
			let t = a == null ? e.text || "" : String(a);
			t.length > 0 && r(t, e, e.vertAlign ?? "super");
			continue;
		}
		let o = e.text.split("	");
		for (let t = 0; t < o.length; t++) o[t].length > 0 && r(o[t], e, e.vertAlign), t < o.length - 1 && n.push({
			isTab: !0,
			fontSize: e.fontSize,
			measuredWidth: 0,
			bold: e.bold,
			italic: e.italic
		});
	} else if (i.type === "image") {
		let e = i;
		n.push({
			imagePath: e.imagePath,
			mimeType: e.mimeType,
			widthPt: e.widthPt,
			heightPt: e.heightPt,
			anchor: e.anchor ?? !1,
			anchorXPt: e.anchorXPt ?? 0,
			anchorYPt: e.anchorYPt ?? 0,
			anchorXFromMargin: e.anchorXFromMargin ?? !1,
			anchorYFromPara: e.anchorYFromPara ?? !1,
			colorReplaceFrom: e.colorReplaceFrom,
			duotone: e.duotone,
			alpha: e.alpha,
			srcRect: e.srcRect ?? void 0,
			measuredWidth: 0
		});
	} else if (i.type === "chart") {
		let e = i;
		n.push({
			imagePath: "",
			mimeType: "",
			widthPt: e.widthPt,
			heightPt: e.heightPt,
			anchor: e.anchor ?? !1,
			anchorXPt: e.anchorXPt ?? 0,
			anchorYPt: e.anchorYPt ?? 0,
			anchorXFromMargin: e.anchorXFromMargin ?? !1,
			anchorYFromPara: e.anchorYFromPara ?? !1,
			chart: e.chart,
			measuredWidth: 0
		});
	} else if (i.type === "break") {
		if (i.breakType === "line") {
			let t = Cr(e, e.indexOf(i));
			n.push({
				lineBreak: !0,
				fontSize: t,
				measuredWidth: 0
			});
		}
	} else if (i.type === "field") {
		let e = i, n = wr(e, t);
		n && r(n, e, e.vertAlign);
	} else if (i.type === "math") {
		let t = i.fontSize || Cr(e, e.indexOf(i));
		n.push({
			mathNodes: i.nodes,
			display: i.display,
			fontSize: t,
			color: null,
			measuredWidth: 0,
			mathAscent: 0,
			mathDescent: 0,
			jc: i.jc
		});
	} else i.type === "ptab" && n.push({
		isTab: !0,
		fontSize: i.fontSize || Cr(e, e.indexOf(i)),
		measuredWidth: 0,
		leader: i.leader,
		ptab: {
			alignment: i.alignment,
			relativeTo: i.relativeTo
		}
	});
	for (let e = 1; e < n.length; e++) {
		let t = n[e];
		if (!("text" in t) || t.joinPrev) continue;
		let r = t.text.codePointAt(0);
		if (r === void 0 || !D.lineStartForbidden.has(r)) continue;
		let i = n[e - 1];
		!("text" in i) || /\s$/.test(i.text) || (t.joinPrev = !0);
	}
	return n;
}
function Vr(e, t, n, r, i, a = [], o, s = {}, c = 0, l = D, u = 0, d = 36, f = n, p = !1) {
	let m = [], h = [], g = 0, _ = 0, v = 0, y = 0, b = 0, x = 0, S = !0, C = n, w = 0, T = o?.startPageY ?? 0, E = () => bn(i), O = (e = 0) => {
		if (w = 0, C = n, !o) return;
		let t = 10 * i, r = wn(T, e, t, o.paraX, n, o.floats);
		T = r.topY, w = r.xOffset, C = r.maxWidth;
	}, k = () => C - (S ? r : 0), A = p ? a.map((e) => ({
		pos: e.pos * i,
		alignment: e.alignment,
		leader: e.leader
	})) : [], j = d * i, M = () => {
		if (!p || !h.some((e) => "isTab" in e)) return;
		let e = Lr(h.map((e) => ({
			isTab: "isTab" in e,
			width: e.measuredWidth
		})), A, f - (w + C) + (S ? r : 0), f + c, j), t = 0;
		for (let n = 0; n < h.length; n++) {
			let r = h[n];
			"isTab" in r && (t += e[n].width - r.measuredWidth, r.measuredWidth = e[n].width, r.leader = e[n].leader);
		}
		g += t;
	}, N = !1, P = (e, t = !1) => {
		M();
		let n = e === void 0 ? v || 10 : e, r = y > 0 || b > 0, a = r ? y : n * i * .8, s = r ? b : n * i * .2;
		m.push({
			segments: h,
			height: n,
			ascent: a,
			descent: s,
			intendedSingle: x,
			xOffset: w,
			availWidth: C,
			topY: o ? T : void 0,
			hasRuby: N,
			endsWithBreak: t
		}), o && (T += o.lineBoxH(a, s, N, x)), h = [], g = 0, _ = 0, v = 0, y = 0, b = 0, x = 0, N = !1, S = !1, O(E());
	}, F = (e, t, n, r, a, o = 0) => {
		if (h.push(e), g += t, _ += o, n > v && (v = n), r > y && (y = r), a > b && (b = a), !("isTab" in e) && !("imagePath" in e) && !("mathNodes" in e)) {
			let t = e;
			t.ruby && (N = !0);
			let n = t.smallCaps && !t.vertAlign ? t.fontSize * i : I(t), r = K(t.fontFamily, n);
			r > x && (x = r);
		}
	}, I = (e) => ar(e, i), L = null, R = (t) => {
		t !== L && (e.font = t, L = t);
	}, z = (t) => {
		if (t.kerning == null) return null;
		let n = e.fontKerning;
		return e.fontKerning = t.fontSize >= t.kerning ? "normal" : "none", n;
	}, B = (t) => {
		t != null && (e.fontKerning = t);
	}, V = (t) => {
		R(Q(t.bold, t.italic, I(t), t.fontFamily, s));
		let n = z(t), r = e.measureText(t.text);
		return B(n), r;
	}, H = (e) => gr(e, V(e).width, u, i), U = (t, n) => {
		R(Q(t.bold, t.italic, I(t), t.fontFamily, s));
		let r = z(t), a = e.measureText(n).width;
		return B(r), a * hr(t) + fr(n, u) + [...n].length * mr(t, i);
	}, W = (e) => "isTab" in e ? e.measuredWidth || 0 : "imagePath" in e ? e.widthPt * i : "mathNodes" in e ? e.measuredWidth || 0 : "lineBreak" in e ? 0 : H(e), G = [...t], q = null;
	for (O(E()); G.length > 0;) {
		let t = G.shift();
		if ("lineBreak" in t) {
			P(t.fontSize, !0), q = t.fontSize;
			continue;
		}
		if (q = null, "isTab" in t) {
			if (p && !t.ptab) {
				t.measuredWidth = 0, F(t, 0, t.fontSize, t.fontSize * i * .8, t.fontSize * i * .2);
				continue;
			}
			let e = g + (S ? r : 0);
			if (t.ptab) {
				let r = t.ptab.relativeTo === "indent" ? 0 : -c, a = t.ptab.relativeTo === "indent" ? n : f, o = t.ptab.alignment === "left" ? r : t.ptab.alignment === "center" ? (r + a) / 2 : a, s = 0;
				for (let e of G) {
					if ("isTab" in e || "lineBreak" in e) break;
					s += W(e);
				}
				let l = t.ptab.alignment === "center" ? .5 : +(t.ptab.alignment === "right"), d = o - e - s * l;
				if (d <= 0) {
					if (h.length > 0) {
						P(), G.unshift(t);
						continue;
					}
					d = 0;
				}
				if (t.measuredWidth = d, F(t, d, t.fontSize, t.fontSize * i * .8, t.fontSize * i * .2), t.ptab.alignment !== "left") for (; G.length > 0;) {
					let e = G[0];
					if ("isTab" in e || "lineBreak" in e) break;
					if (G.shift(), "imagePath" in e) {
						let t = e.widthPt * i;
						e.measuredWidth = t, F(e, t, e.heightPt, e.heightPt * i, 0);
					} else if ("mathNodes" in e) F(e, e.measuredWidth || 0, e.fontSize, e.mathAscent || 0, e.mathDescent || 0);
					else {
						let t = V(e), n = gr(e, t.width, u, i);
						e.measuredWidth = n;
						let r = t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent ?? e.fontSize * i * .8, a = t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent ?? e.fontSize * i * .2;
						F(e, n, e.fontSize, r, a);
					}
				}
				continue;
			}
			let o = Fr(e + c, a.map((e) => ({
				pos: e.pos * i,
				alignment: e.alignment,
				leader: e.leader
			})), d * i), s = o ? o.pos - c : e;
			if (o && o.alignment !== "left" && o.alignment !== "bar" && o.alignment !== "clear") {
				let n = s;
				t.leader = o.leader;
				let r = 0;
				for (let e of G) {
					if ("isTab" in e || "lineBreak" in e) break;
					r += W(e);
				}
				let a = o.alignment === "center" ? .5 : 1, c = n - e - r * a;
				for (c <= 0 && (c = t.fontSize * i * .25), t.measuredWidth = c, F(t, c, t.fontSize, t.fontSize * i * .8, t.fontSize * i * .2); G.length > 0;) {
					let e = G[0];
					if ("isTab" in e || "lineBreak" in e) break;
					if (G.shift(), "imagePath" in e) {
						let t = e.widthPt * i;
						e.measuredWidth = t, F(e, t, e.heightPt, e.heightPt * i, 0);
					} else if ("mathNodes" in e) F(e, e.measuredWidth || 0, e.fontSize, e.mathAscent || 0, e.mathDescent || 0);
					else {
						let t = V(e), n = gr(e, t.width, u, i);
						e.measuredWidth = n;
						let r = t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent ?? e.fontSize * i * .8, a = t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent ?? e.fontSize * i * .2;
						F(e, n, e.fontSize, r, a);
					}
				}
				continue;
			}
			let l = s - e;
			if (o && (t.leader = o.leader), l <= 0) {
				P(), G.unshift(t);
				continue;
			}
			if (g + l > k() && h.length > 0) {
				P(), G.unshift(t);
				continue;
			}
			t.measuredWidth = l, F(t, l, t.fontSize, t.fontSize * i * .8, t.fontSize * i * .2);
			continue;
		}
		if ("imagePath" in t) {
			if (t.anchor) {
				t.measuredWidth = 0;
				continue;
			}
			let e = t.widthPt * i, n = t.heightPt, r = t.heightPt * i;
			t.measuredWidth = e, h.length > 0 && g + e > k() && P(), F(t, e, n, r, 0);
			continue;
		}
		if ("mathNodes" in t) {
			let e = Jn.get(t.mathNodes);
			if (!e) {
				t.measuredWidth = 0;
				continue;
			}
			let n = t.fontSize * i, r = e.widthEm * n, a = e.ascentEm * n, o = e.descentEm * n;
			t.measuredWidth = r, t.mathAscent = a, t.mathDescent = o;
			let s = Math.max(a, n * .8), c = Math.max(o, n * .2);
			h.length > 0 && g + r > k() && P(), F(t, r, t.fontSize, s, c);
			continue;
		}
		let o = t, m = V(o), v = gr(o, m.width, u, i), y = o.fontSize, b = o.fontSize * i, x = m, C = I(o);
		if (o.smallCaps && !o.vertAlign && C !== b) {
			let t = e.font;
			e.font = Q(o.bold, o.italic, b, o.fontFamily, s), x = e.measureText(o.text || "X"), e.font = t, C = b;
		}
		let w = br(x, o.fontFamily, b, C), T = w.ascent, E = w.descent;
		o.ruby && (T += o.ruby.fontSizePt * i * 1.5);
		let O = o.text.replace(/ +$/, ""), A = o.text.endsWith(" ") ? v - U(o, O) : 0, j = v - A, M = _ * Nr;
		if (!o.joinPrev && h.length > 0 && G[0]?.joinPrev && !Tr(o.text)) {
			let e = v, t = A;
			for (let n = 0; n < G.length && G[n].joinPrev; n++) {
				let r = G[n];
				if (Tr(r.text)) {
					let n = [...r.text], i = 0;
					for (; i < n.length && D.lineStartForbidden.has(n[i].codePointAt(0));) i++;
					if (i < n.length) {
						e += U(r, n.slice(0, i).join("")), t = 0;
						break;
					}
				}
				let i = H(r);
				e += i;
				let a = r.text.replace(/ +$/, "");
				t = r.text.endsWith(" ") ? i - U(r, a) : 0;
			}
			g + (e - t) > k() + M && P();
		}
		if (g + j <= k() + M) o.measuredWidth = v, F(o, v, y, T, E, A);
		else if (Tr(o.text)) {
			let t = k() - g;
			e.font = Q(o.bold, o.italic, I(o), o.fontFamily, s);
			let n = t > 0 ? Er(e, o.text, t, u, hr(o), mr(o, i)) : "", r = [...o.text], a = [...n].length, c = le(r, a, l, h.length > 0 ? 0 : 1), d = r.slice(0, c).join("");
			if (d.length > 0) {
				let e = U(o, d);
				F({
					...o,
					text: d,
					measuredWidth: e
				}, e, y, T, E);
				let t = o.text.slice(d.length);
				t && G.unshift({
					...o,
					text: t,
					measuredWidth: 0
				});
			} else if (h.length > 0) {
				let e = null, t = o.text.codePointAt(0), n = h[h.length - 1];
				if (t !== void 0 && l.lineStartForbidden.has(t) && "text" in n) {
					let t = n, r = [...t.text], i = ie(r, l, h.length > 1 ? 0 : 1);
					if (i > 0) {
						let n = r.slice(0, r.length - i).join(""), a = r.slice(r.length - i).join("");
						if (e = {
							...t,
							text: a,
							measuredWidth: U(t, a)
						}, n) {
							let e = U(t, n);
							g -= t.measuredWidth - e, h[h.length - 1] = {
								...t,
								text: n,
								measuredWidth: e
							};
						} else g -= t.measuredWidth, h.pop();
					}
				}
				P(), G.unshift(o), e && G.unshift(e);
			} else {
				let e = [...o.text][0] ?? "";
				if (e) {
					let t = U(o, e);
					F({
						...o,
						text: e,
						measuredWidth: t
					}, t, y, T, E);
					let n = o.text.slice(e.length);
					n && G.unshift({
						...o,
						text: n,
						measuredWidth: 0
					});
				}
			}
		} else if (h.length === 0) {
			let t = k();
			e.font = Q(o.bold, o.italic, I(o), o.fontFamily, s);
			let n = [...o.text], r = t > 0 ? [...Er(e, o.text, t, u, hr(o), mr(o, i))].length : 0;
			if (r < 1 && (r = 1), r >= n.length) o.measuredWidth = v, F(o, v, y, T, E);
			else {
				let e = n.slice(0, r).join(""), t = U(o, e);
				F({
					...o,
					text: e,
					measuredWidth: t
				}, t, y, T, E), G.unshift({
					...o,
					text: n.slice(r).join(""),
					measuredWidth: 0
				});
			}
		} else P(), G.unshift(o);
	}
	return h.length > 0 ? P() : q !== null && P(q), m;
}
function Hr(e, t, n, r, i) {
	if (t === 1) return e;
	let a = (e) => {
		let a = ar(e, t);
		n.font = Q(e.bold, e.italic, a, e.fontFamily, r);
		let o = n.measureText(e.text), s = pr(o.width, e.text, i), c = e.fontSize * t, l = o, u = a;
		e.smallCaps && !e.vertAlign && u !== c && (n.font = Q(e.bold, e.italic, c, e.fontFamily, r), l = n.measureText(e.text || "X"), u = c);
		let d = br(l, e.fontFamily, c, u), f = e.ruby ? d.ascent + e.ruby.fontSizePt * t * 1.5 : d.ascent, p = e.smallCaps && !e.vertAlign ? c : a, m = K(e.fontFamily, p);
		return {
			advance: s,
			asc: f,
			desc: d.descent,
			intended: m
		};
	};
	return e.map((e) => {
		let n = 0, r = 0, i = 0, o = !1, s = e.segments.map((e) => {
			if ("isTab" in e) return {
				...e,
				measuredWidth: e.measuredWidth * t
			};
			if ("imagePath" in e) return e.anchor ? {
				...e,
				measuredWidth: 0
			} : {
				...e,
				measuredWidth: e.widthPt * t
			};
			if ("mathNodes" in e) {
				let i = {
					...e,
					measuredWidth: e.measuredWidth * t
				};
				return i.mathAscent *= t, i.mathDescent *= t, n = Math.max(n, i.mathAscent, e.fontSize * t * .8), r = Math.max(r, i.mathDescent, e.fontSize * t * .2), i;
			}
			let s = e, c = a(s);
			return o = !0, c.asc > n && (n = c.asc), c.desc > r && (r = c.desc), c.intended > i && (i = c.intended), {
				...s,
				measuredWidth: c.advance
			};
		});
		return !o && n === 0 && r === 0 && (n = e.ascent * t, r = e.descent * t, i = e.intendedSingle * t), {
			...e,
			segments: s,
			ascent: n,
			descent: r,
			intendedSingle: i,
			xOffset: e.xOffset * t,
			availWidth: e.availWidth * t,
			topY: e.topY === void 0 ? void 0 : e.topY * t
		};
	});
}
function Ur(e) {
	return {
		type: "text",
		text: e.text,
		bold: e.bold ?? !1,
		italic: e.italic ?? !1,
		underline: !1,
		strikethrough: !1,
		fontSize: e.fontSizePt,
		color: e.color ?? null,
		fontFamily: e.fontFamily ?? null,
		fontFamilyEastAsia: e.fontFamilyEastAsia ?? null,
		isLink: !1,
		background: null,
		vertAlign: null,
		hyperlink: null
	};
}
function Wr(e, t, n, r) {
	return {
		ctx: e,
		scale: t,
		fontFamilyClasses: n,
		images: r,
		kinsoku: D,
		defaultTabPt: 36
	};
}
//#endregion
//#region packages/docx/src/emphasis-mark.ts
function Gr(e, t, n, r) {
	let i = [...e], a = [], o = "";
	for (let e = 0; e < i.length; e++) {
		let s = i[e], c = n + t(o) + e * r, l = o + s, u = n + t(l) + (e + 1) * r;
		o = l, /\s/u.test(s) || a.push({ centerX: (c + u) / 2 });
	}
	return a;
}
function Kr(e, t) {
	let n = t * .07;
	switch (e) {
		case "circle": return {
			shape: "circle",
			radius: n,
			above: !0
		};
		case "comma": return {
			shape: "comma",
			radius: n,
			above: !0
		};
		case "underDot": return {
			shape: "dot",
			radius: n,
			above: !1
		};
		default: return {
			shape: "dot",
			radius: n,
			above: !0
		};
	}
}
//#endregion
//#region packages/docx/src/vertical-text.ts
function qr(e) {
	let t = Be(e);
	return t === "U" || t === "Tu" ? "upright" : t === "Tr" ? "rotate" : "sideways";
}
var Jr = new Set([65294]);
function Yr(e) {
	return Jr.has(e) ? {
		dx: .4,
		dy: -.4
	} : {
		dx: 0,
		dy: 0
	};
}
function Xr(e, t, n) {
	let r = e.textBaseline;
	e.textBaseline = "alphabetic";
	let i = e.measureText(t);
	e.textBaseline = r;
	let a = i.fontBoundingBoxAscent, o = i.fontBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" && (a !== 0 || o !== 0) ? (a - o) / 2 : .38 * n;
}
function Zr(e, t) {
	let n = e.textAlign, r = e.textBaseline;
	e.textAlign = "center", e.textBaseline = "middle";
	let i = e.measureText(t);
	e.textAlign = n, e.textBaseline = r;
	let a = i.actualBoundingBoxAscent, o = i.actualBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" ? (a - o) / 2 : 0;
}
function Qr(e, t, n, r, i, a) {
	let o = e.textAlign, s = e.textBaseline, c = Xr(e, t, i), l = 0;
	for (let s of t) {
		let t = s.codePointAt(0) ?? 0, u = qr(t), d = e.measureText(s).width + a, f = u === "rotate" ? Ue(t) : null;
		if (u === "upright" || f !== null) {
			let a = f === null ? Ve(t) : null, o = f === null ? a : f, c = o === null ? s : String.fromCodePoint(o), u = n + l + d / 2, p = o === null ? Yr(t) : {
				dx: 0,
				dy: 0
			}, m = a !== null, h = p.dy === 0 && !m ? Zr(e, c) / i : 0;
			e.save(), e.translate(u, r), e.rotate(-Math.PI / 2), e.textAlign = "center", e.textBaseline = "middle", e.fillText(c, p.dx * i, (h + p.dy) * i), e.restore();
		} else if (u === "rotate") {
			let t = n + l + d / 2;
			e.textAlign = "center", e.textBaseline = "middle", e.fillText(s, t, r);
		} else e.textAlign = o, e.textBaseline = "alphabetic", e.fillText(s, n + l, r + c);
		l += d;
	}
	e.textAlign = o, e.textBaseline = s;
}
function $r(e, t, n, r, i, a, o, s) {
	let c = e.textAlign, l = e.textBaseline, u = 1;
	if (s) {
		let n = e.measureText(t), r = n.fontBoundingBoxAscent, a = n.fontBoundingBoxDescent;
		if (typeof r == "number" && typeof a == "number") {
			let e = r + a;
			e > i && e > 0 && (u = i / e);
		}
	}
	let d = n + a / 2;
	e.save(), e.translate(d, r), e.rotate(-Math.PI / 2), e.scale(o, u), e.textAlign = "center", e.textBaseline = "middle", e.fillText(t, 0, 0), e.restore(), e.textAlign = c, e.textBaseline = l;
}
function ei(e, t, n, r, i, a) {
	let o = t + r / 2, s = n + i / 2;
	e.save(), e.translate(o, s), e.rotate(-Math.PI / 2), a(-i / 2, -r / 2, i, r), e.restore();
}
function ti(e, t, n, r, i) {
	return {
		x: t,
		y: i - (e + n),
		w: r,
		h: n
	};
}
function ni(e, t, n, r) {
	return r ? {
		left: n - t,
		top: e,
		transform: "rotate(90deg)"
	} : null;
}
//#endregion
//#region packages/docx/src/renderer.ts
var ri = {
	yellow: "#FFFF00",
	cyan: "#00FFFF",
	green: "#00FF00",
	magenta: "#FF00FF",
	blue: "#0000FF",
	red: "#FF0000",
	darkBlue: "#000080",
	darkCyan: "#008080",
	darkGreen: "#008000",
	darkMagenta: "#800080",
	darkRed: "#800000",
	darkYellow: "#808000",
	darkGray: "#808080",
	lightGray: "#C0C0C0",
	black: "#000000",
	white: "#FFFFFF"
};
function ii(e) {
	return ai(e).length > 0;
}
function ai(e) {
	let t = [], n = (e) => {
		for (let n of e) n.type === "math" && t.push({
			nodes: n.nodes,
			display: n.display
		});
	}, r = (e) => {
		if ("runs" in e && n(e.runs), "rows" in e) for (let t of e.rows) for (let e of t.cells) for (let t of e.content) r(t);
	};
	return e.forEach(r), t;
}
function oi(e) {
	let t = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`, n = new Image();
	return new Promise((e, r) => {
		n.onload = () => e(n), n.onerror = r, n.src = t;
	});
}
async function si(e, n) {
	let r = ai(e);
	if (r.length !== 0) {
		await n.loadMathJax();
		for (let e of r) if (!Jn.has(e.nodes)) try {
			let r = await n.mathMLToSvg(t(e.nodes, e.display)), i = await oi(De(r.svg, "#000000"));
			Jn.set(e.nodes, {
				img: i,
				widthEm: r.widthEm,
				ascentEm: r.ascentEm,
				descentEm: r.descentEm
			});
		} catch {}
	}
}
function ci(e) {
	return e == null ? Date.now() : typeof e == "number" ? e : e.getTime();
}
function li(e, t, n) {
	let r = e;
	return t && (r += `|clr:${t}`), n && (r += `|duo:${n.clr1}:${n.clr2}`), r;
}
var ui = /* @__PURE__ */ new WeakMap();
function di(e) {
	let t = ui.get(e);
	return t || (t = /* @__PURE__ */ new Map(), ui.set(e, t)), t;
}
function fi(e) {
	let t = ui.get(e);
	if (t) {
		for (let e of t.values()) e.then((e) => e.close()).catch(() => {});
		t.clear(), ui.delete(e);
	}
}
var pi = [
	"#C00000",
	"#0070C0",
	"#00B050",
	"#7030A0",
	"#E97132",
	"#196B24",
	"#9E480E",
	"#525252"
];
function mi(e) {
	if (!e) return pi[0];
	let t = 2166136261;
	for (let n = 0; n < e.length; n++) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return pi[Math.abs(t) % pi.length];
}
function hi(e) {
	let t = /* @__PURE__ */ new Map(), n = (e) => {
		let n = li(e.imagePath, e.colorReplaceFrom, e.duotone), r = t.get(n);
		r ? (r.widthPt = Math.max(r.widthPt, e.widthPt), r.heightPt = Math.max(r.heightPt, e.heightPt), r.hasCrop = r.hasCrop || e.hasCrop) : t.set(n, e);
	}, r = (e) => {
		let t = e.numbering, r = t?.picBulletImagePath;
		if (r && t) {
			let i = Fo(t, e);
			n({
				imagePath: r,
				mimeType: t.picBulletMimeType ?? "",
				widthPt: i.w,
				heightPt: i.h
			});
		}
	}, i = (e) => {
		for (let t of e) if (t.type === "image") {
			let e = t;
			n({
				imagePath: e.imagePath,
				mimeType: e.mimeType,
				svgImagePath: e.svgImagePath,
				colorReplaceFrom: e.colorReplaceFrom,
				duotone: e.duotone,
				...d(e.mimeType, e.srcRect, e.widthPt ?? 0, e.heightPt ?? 0),
				hasCrop: e.srcRect != null
			});
		} else if (t.type === "shape") {
			let e = t;
			for (let t of e.textBlocks ?? []) t.imagePath && n({
				imagePath: t.imagePath,
				mimeType: t.mimeType ?? "",
				svgImagePath: t.svgImagePath,
				widthPt: t.imageWidthPt ?? 0,
				heightPt: t.imageHeightPt ?? 0
			});
		}
	}, a = (e) => {
		for (let t of e.rows) for (let e of t.cells) for (let t of e.content) if (t.type === "paragraph") {
			let e = t;
			r(e), i(e.runs);
		} else t.type === "table" && a(t);
	}, o = (e) => {
		for (let t of e) {
			if (t.type === "paragraph") {
				let e = t;
				r(e), i(e.runs);
			}
			t.type === "table" && a(t);
		}
	};
	return o(e.body), e.headers.default && o(e.headers.default.body), e.headers.first && o(e.headers.first.body), e.headers.even && o(e.headers.even.body), e.footers.default && o(e.footers.default.body), e.footers.first && o(e.footers.first.body), e.footers.even && o(e.footers.even.body), [...t.values()];
}
async function gi(e, t) {
	let n = parseInt(t.slice(0, 2), 16), r = parseInt(t.slice(2, 4), 16), i = parseInt(t.slice(4, 6), 16), a = new OffscreenCanvas(e.width, e.height), o = a.getContext("2d");
	o.drawImage(e, 0, 0);
	let s = o.getImageData(0, 0, e.width, e.height), c = s.data;
	for (let e = 0; e < c.length; e += 4) c[e] === n && c[e + 1] === r && c[e + 2] === i && (c[e + 3] = 0);
	return o.putImageData(s, 0, 0), createImageBitmap(a);
}
async function _i(e, t, n, r, i = 0, a = 0, o) {
	let s = await we(e, t, r, {
		widthPt: i,
		heightPt: a,
		suppressBoundaryFrame: !0
	});
	if (!s) return null;
	if (!n && !o) return s;
	let c = di(r), u = li(e, n, o), d = c.get(u);
	return d || (d = (async () => {
		let e = s;
		if (n && (e = await gi(e, n)), o) {
			let { w: t, h: n } = l(e);
			t > 0 && n > 0 && (e = await p(e, o, {
				width: t,
				height: n
			}));
		}
		return e;
	})(), d.catch(() => c.delete(u)), c.set(u, d)), d;
}
async function vi(e, t) {
	if (!t) return /* @__PURE__ */ new Map();
	let r = t, i = hi(e), a = await Promise.all(i.map(async (e) => {
		let t = e.mimeType === "image/svg+xml", i = {
			svgImagePath: e.svgImagePath,
			srcRect: e.hasCrop || null
		};
		try {
			let a;
			if (z(i)) try {
				a = await n(i.svgImagePath, r);
			} catch {
				a = t ? await n(e.imagePath, r) : await _i(e.imagePath, e.mimeType, e.colorReplaceFrom, r, e.widthPt, e.heightPt, e.duotone);
			}
			else a = t ? await n(e.imagePath, r) : await _i(e.imagePath, e.mimeType, e.colorReplaceFrom, r, e.widthPt, e.heightPt, e.duotone);
			return a ? [li(e.imagePath, e.colorReplaceFrom, e.duotone), a] : null;
		} catch {
			return null;
		}
	}));
	return new Map(a.filter((e) => e !== null));
}
var yi = /* @__PURE__ */ new WeakMap();
function bi(e) {
	let t = e.textDirection;
	return t === "tbRl" || t === "tbRlV" || t === "tbLrV";
}
function xi(e) {
	return {
		...e,
		pageWidth: e.pageHeight,
		pageHeight: e.pageWidth,
		marginLeft: e.marginTop,
		marginTop: e.marginRight,
		marginRight: e.marginBottom,
		marginBottom: e.marginLeft,
		headerDistance: e.headerDistance,
		footerDistance: e.footerDistance
	};
}
function Si(e) {
	return bi(e.section) ? {
		...e,
		section: xi(e.section)
	} : e;
}
function Ci(e, t, n) {
	return bi(e) ? {
		widthPt: n,
		heightPt: t
	} : {
		widthPt: t,
		heightPt: n
	};
}
function wi(e, t, n, r) {
	e.save();
	let i = Math.max(24, Math.min(t, n) * .06);
	e.strokeStyle = "#c8ccd2", e.lineWidth = Math.max(1, Math.min(t, n) * .003), e.setLineDash([e.lineWidth * 6, e.lineWidth * 5]), e.strokeRect(i, i, t - i * 2, n - i * 2), e.setLineDash([]);
	let a = t / 2, o = Math.min(t, n), s = Math.max(24, o * .09);
	e.fillStyle = "#b23b3b", e.textAlign = "center", e.textBaseline = "middle", e.font = `${s}px sans-serif`, e.fillText("⚠", a, n * .34);
	let c = Math.max(13, o * .032);
	e.fillStyle = "#333333", e.font = `600 ${c}px sans-serif`, e.fillText("This document could not be displayed", a, n * .44);
	let l = Math.max(10, o * .02);
	e.fillStyle = "#666666", e.font = `${l}px sans-serif`;
	let u = t - i * 4, d = r.split(/\s+/), f = [], p = "";
	for (let t of d) {
		let n = p ? `${p} ${t}` : t;
		if (e.measureText(n).width > u && p ? (f.push(p), p = t) : p = n, f.length >= 4) break;
	}
	p && f.length < 4 && f.push(p);
	let m = l * 1.4, h = n * .5 + m;
	for (let t of f.slice(0, 4)) e.fillText(t, a, h), h += m;
	e.restore();
}
async function Ti(e, t, n, r = {}) {
	let i = (yi.get(t) ?? 0) + 1;
	yi.set(t, i);
	let a = () => yi.get(t) !== i, o = r.dpr ?? m(), c = t.getContext("2d"), l = X(e.settings), u = bi(e.section), d = Si(e), f = r.prebuiltPages ?? Qi(d, c, d.fontFamilyClasses ?? {}, l, d.footnotes ?? []), p = Math.max(r.totalPages ?? f.length, f.length), h = f[n] ?? f[0] ?? [], g = Jt(f)[n] ?? {
		displayNumber: n + 1,
		format: "decimal"
	}, _ = va(f, n, d).geom, v = {
		...d.section,
		..._
	}, y = u ? v.pageHeight : v.pageWidth, b = u ? v.pageWidth : v.pageHeight, x = r.width ?? y * 1.3333333333333333, S = x / y, C = b * S, w = s(x * o, C * o), T = w.clamped ? o * w.scale : o;
	if (t.width = w.width, t.height = w.height, B(t) && (t.style.width = `${x}px`, t.style.height = `${C}px`, t.style.display || (t.style.display = "block")), c.scale(T, T), c.fillStyle = "#ffffff", c.fillRect(0, 0, x, C), e.parseError != null) {
		wi(c, x, C, e.parseError);
		return;
	}
	u && (c.translate(x, 0), c.rotate(Math.PI / 2));
	let E = await vi(e, r.fetchImage);
	if (a()) return;
	let D = ji(e.footnotes), O = ji(e.endnotes), k = /* @__PURE__ */ new Map();
	for (let [e, t] of D) k.set(`footnote:${e}`, t);
	for (let [e, t] of O) k.set(`endnote:${e}`, t);
	let A = aa(e.body), j = $(v.marginTop), M = $(v.marginBottom), N = {
		ctx: c,
		scale: S,
		dpr: T,
		contentX: v.marginLeft * S,
		contentW: (v.pageWidth - v.marginLeft - v.marginRight) * S,
		y: j * S,
		pageH: v.pageHeight * S,
		defaultColor: r.defaultTextColor ?? "#000000",
		pageIndex: n,
		totalPages: p,
		displayPageNumber: g.displayNumber,
		pageNumberFormat: g.format,
		images: E,
		dryRun: !1,
		marginLeft: v.marginLeft,
		marginRight: v.marginRight,
		marginTop: j,
		marginBottom: M,
		pageWidth: v.pageWidth,
		floats: [],
		floatParaSeq: 0,
		docGrid: {
			type: v.docGridType ?? null,
			linePitchPt: v.docGridLinePitch ?? null,
			charSpacePt: v.docGridCharSpace == null ? null : v.docGridCharSpace / 4096
		},
		docEastAsian: A,
		fontFamilyClasses: e.fontFamilyClasses ?? {},
		kinsoku: l,
		defaultTabPt: Pr(e.settings),
		mathDefJc: e.settings?.mathDefJc,
		onTextRun: r.onTextRun,
		showTrackChanges: r.showTrackChanges ?? !0,
		currentDateMs: ci(r.currentDate),
		noteNumbers: k,
		verticalCJK: u,
		verticalPhys: u ? {
			pageWidth: y,
			pageHeight: b,
			marginLeft: v.marginBottom,
			marginRight: v.marginTop,
			marginTop: $(v.marginLeft),
			marginBottom: $(v.marginRight),
			cssWidthPx: x
		} : void 0
	}, P = Ji(f, n, e), F = 0;
	if (P) {
		let e = ba(P, N);
		ya(P, v.headerDistance * S, N), F = Gi(e, v.marginTop * S, v.headerDistance * S);
	}
	let I = qi(f, n, e), L = 0;
	if (I) {
		let e = ba(I, N);
		ya(I, C - v.footerDistance * S - e, N), L = Wi(e, v.marginBottom * S, v.footerDistance * S);
	}
	let R = Li(v), z = j * S + F, V = {
		...N,
		y: z
	}, H = v.lineNumbering;
	if (H && R.length <= 1) {
		V.lineNumbering = {
			countBy: H.countBy,
			start: H.start,
			distancePt: H.distance ?? Ri,
			fontSizePt: zi(e)
		};
		let t = H.start;
		if ((H.restart === "continuous" || H.restart === "newSection") && n > 0) {
			let e = H.start;
			for (let t = 0; t < n; t++) {
				let n = {
					...V,
					y: 0,
					dryRun: !0,
					floats: [],
					lineNumberCounter: e
				};
				Ea(f[t] ?? [], n, Li(v), 0), e = n.lineNumberCounter ?? e;
			}
			t = e;
		}
		V.lineNumberCounter = t;
	}
	let U = v.vAlign;
	if ((U === "center" || U === "bottom") && F === 0) {
		let e = j * S, t = C - M * S - L - e, n = {
			...V,
			y: 0,
			dryRun: !0,
			floats: [],
			lineNumbering: void 0,
			lineNumberCounter: void 0
		};
		Ea(h, n, R, 0);
		let r = n.y;
		r < t && (V.y = e + (U === "center" ? (t - r) / 2 : t - r));
	}
	if (v.pageBorders && v.pageBorders.zOrder === "back" && Bi(v.pageBorders, n) && Vi(c, v.pageBorders, v, S), v.columns?.sep) {
		let e = /* @__PURE__ */ new Set(), t = [];
		for (let n of h) {
			let r = n.colGeom ?? R;
			r.length > 1 && !e.has(r) && (e.add(r), t.push(r));
		}
		t.length === 0 && R.length > 1 && t.push(R);
		for (let e of t) Ta(c, e, v, S);
	}
	Ea(h, V, R, F), Di(h, e, N, S, C, v, L), n === p - 1 && Oi(e, V, S, C, v), v.pageBorders && v.pageBorders.zOrder !== "back" && Bi(v.pageBorders, n) && Vi(c, v.pageBorders, v, S);
}
function Ei(e, t, n, r, i, a, o = 36) {
	return Fi(e, ea(t, n, r, i, a, o), n.pageWidth - n.marginLeft - n.marginRight);
}
function Di(e, t, n, r, i, o, s = 0) {
	if (!t.footnotes || t.footnotes.length === 0) return;
	let c = Mi(t.footnotes), l = [], u = /* @__PURE__ */ new Set();
	for (let t of e) for (let e of Pi(t)) !u.has(e) && c.has(e) && (u.add(e), l.push(e));
	if (l.length === 0) return;
	let d = 0, f = 0;
	for (let e of l) {
		let t = c.get(e);
		if (!t) continue;
		let r = Ei(t, n.ctx, o, n.fontFamilyClasses, n.kinsoku, n.docEastAsian, n.defaultTabPt);
		d += r.total, f = r.trailingSpaceAfter;
	}
	let p = Math.max(0, d - f), m = ki * r, h = i - $(o.marginBottom) * r - s - p * r, g = o.marginLeft * r, _ = Math.round(h - m), v = n.ctx;
	v.save(), v.strokeStyle = n.defaultColor;
	let y = Math.max(1, Math.round(.5 * r));
	v.lineWidth = y;
	let b = a(_, y, n.dpr);
	v.beginPath(), v.moveTo(g, _ + b), v.lineTo(g + (o.pageWidth - o.marginLeft - o.marginRight) * r / 3, _ + b), v.stroke(), v.restore();
	let x = {
		...n,
		y: h
	};
	for (let e of l) {
		let n = c.get(e);
		n && (x.currentNoteNumber = t.footnotes.findIndex((t) => t.id === e) + 1, Da(n.content.filter((e) => e.type === "paragraph"), x));
	}
}
function Oi(e, t, n, r, i) {
	if (!e.endnotes || e.endnotes.length === 0) return;
	let o = e.endnotes.filter((e) => e.content.some((e) => e.type === "paragraph" && e.runs.length > 0));
	if (o.length === 0) return;
	let s = t.ctx, c = t.y + ki * 2 * n;
	if (c >= r - $(i.marginBottom) * n) return;
	let l = i.marginLeft * n;
	s.save(), s.strokeStyle = t.defaultColor;
	let u = Math.max(1, Math.round(.5 * n));
	s.lineWidth = u;
	let d = Math.round(c), f = a(d, u, t.dpr);
	s.beginPath(), s.moveTo(l, d + f), s.lineTo(l + (i.pageWidth - i.marginLeft - i.marginRight) * n / 3, d + f), s.stroke(), s.restore();
	let p = {
		...t,
		y: c + ki * n,
		lineNumbering: void 0,
		lineNumberCounter: void 0
	};
	for (let t of o) p.currentNoteNumber = e.endnotes.findIndex((e) => e.id === t.id) + 1, Da(t.content.filter((e) => e.type === "paragraph"), p);
}
var ki = 6, Ai = {
	default: null,
	first: null,
	even: null
};
function ji(e) {
	let t = /* @__PURE__ */ new Map();
	return e && e.forEach((e, n) => t.set(e.id, n + 1)), t;
}
function Mi(e) {
	let t = /* @__PURE__ */ new Map();
	if (!e) return t;
	for (let n of e) t.set(n.id, n);
	return t;
}
function Ni(e) {
	let t = [];
	for (let n of e) {
		if (n.type !== "text") continue;
		let e = n.noteRef;
		e && e.kind === "footnote" && e.id && t.push(e.id);
	}
	return t;
}
function Pi(e) {
	if (e.type === "paragraph") return Ni(e.runs);
	if (e.type === "table") {
		let t = [];
		for (let n of e.rows) for (let e of n.cells) for (let n of e.content) t.push(...Pi(n));
		return t;
	}
	return [];
}
function Fi(e, t, n) {
	let r = 0, i = 0;
	for (let a of e.content) {
		if (a.type !== "paragraph") continue;
		let e = a;
		r += ta(t, e, n, !1), i = e.spaceAfter;
	}
	return {
		total: r,
		trailingSpaceAfter: i
	};
}
function Ii(e, t, n, r) {
	let { total: i, trailingSpaceAfter: a } = Fi(e, t, n);
	return Math.max(0, i - a) + (r ? ki : 0);
}
function Li(e) {
	let t = e.pageWidth - e.marginLeft - e.marginRight, n = e.columns;
	if (!n || n.count <= 1) return [{
		xPt: e.marginLeft,
		wPt: Math.max(1, t)
	}];
	if (!n.equalWidth && n.cols.length > 0) {
		let t = [], r = e.marginLeft;
		for (let e of n.cols) t.push({
			xPt: r,
			wPt: Math.max(1, e.widthPt)
		}), r += e.widthPt + e.spacePt;
		return t;
	}
	let r = n.count, i = n.spacePt, a = Math.max(1, (t - (r - 1) * i) / r), o = [];
	for (let t = 0; t < r; t++) o.push({
		xPt: e.marginLeft + t * (a + i),
		wPt: a
	});
	return o;
}
var Ri = 18;
function zi(e) {
	for (let t of e.body) if (t.type === "paragraph") {
		let e = t;
		if (typeof e.defaultFontSize == "number") return e.defaultFontSize;
		for (let t of e.runs) if (t.type === "text") return t.fontSize;
	}
	return 10;
}
function Bi(e, t) {
	switch (e.display) {
		case "firstPage": return t === 0;
		case "notFirstPage": return t !== 0;
		default: return !0;
	}
}
function Vi(e, t, n, r) {
	let i = t.offsetFrom === "text", a = i ? n.marginLeft : 0, o = i ? n.pageWidth - n.marginRight : n.pageWidth, s = i ? $(n.marginTop) : 0, c = i ? n.pageHeight - $(n.marginBottom) : n.pageHeight, l = (e) => ({
		width: e.width,
		color: e.color ?? null,
		style: e.style
	}), u = (s + (t.top?.space ?? 0)) * r, d = (c - (t.bottom?.space ?? 0)) * r, f = (a + (t.left?.space ?? 0)) * r, p = (o - (t.right?.space ?? 0)) * r;
	t.top && Co(e, f, u, p, u, l(t.top), r, 1), t.bottom && Co(e, f, d, p, d, l(t.bottom), r, 1), t.left && Co(e, f, u, f, d, l(t.left), r, 1), t.right && Co(e, p, u, p, d, l(t.right), r, 1);
}
var Hi = {
	top: 0,
	bottom: 0
};
function Ui(e, t, n, r = {}, i = D, a = [], o = [], s = 36) {
	let c = () => $(k.marginTop), l = () => $(k.marginBottom), u = () => k.pageHeight - c() - l(), d = ea(n, t, r, i, aa(e), s), f = Mi(a), p = f.size > 0, m = [0], h = (n) => {
		for (let r = n; r < e.length; r++) {
			let n = e[r];
			if (n.type === "sectionBreak") return Li({
				...t,
				...n.geom ?? {},
				columns: n.columns ?? null
			});
		}
		return Li(t);
	}, g = (n) => {
		for (let t = n; t < e.length; t++) {
			let n = e[t];
			if (n.type === "sectionBreak") return n.kind ?? "nextPage";
		}
		return t.sectionStart ?? "nextPage";
	}, _ = (t) => Ca(e, t) && g(t + 2) === "continuous", v = (t) => _(t) ? (e[t].spaceBefore ?? 0) === 0 : !1, y = (t) => {
		for (let n = t; n < e.length; n++) {
			let t = e[n];
			if (t.type === "sectionBreak") return {
				headers: t.headers ?? Ai,
				footers: t.footers ?? Ai,
				titlePage: t.titlePage ?? !1
			};
		}
	}, b = Ki(t), x = (t) => {
		for (let n = t; n < e.length; n++) {
			let t = e[n];
			if (t.type === "sectionBreak") return t.geom ?? b;
		}
		return b;
	}, S = (n) => {
		for (let t = n; t < e.length; t++) {
			let n = e[t];
			if (n.type === "sectionBreak") return n.pageNumType ?? null;
		}
		return t.pageNumType ?? null;
	}, C = h(0), w = 0, T = () => C[w].xPt, E = () => C[w].wPt, O = y(0), k = x(0), A = S(0), j = 0, M = 0, N = null, P = () => c() + j, F = (e) => {
		let t = d.contentX, n = d.contentW;
		d.contentX = T() * d.scale, d.contentW = E() * d.scale;
		try {
			return e();
		} finally {
			d.contentX = t, d.contentW = n;
		}
	}, I = [[]], L = 0, R = null, z = 0;
	d.y = c(), d.floats = [], d.floatParaSeq = 0, d.pageAnchorPrescanned = /* @__PURE__ */ new Set();
	let B = (t) => {
		d.pageAnchorPrescanned = /* @__PURE__ */ new Set(), to(e, t, d);
	};
	B(0);
	let V = /* @__PURE__ */ new Set(), H = (e) => o.length === 0 ? Hi : o[Math.min(e, o.length - 1)] ?? Hi, U = () => {
		let e = H(I.length - 1);
		return u() - (m[I.length - 1] ?? 0) - e.bottom - e.top;
	}, W = (e) => {
		let t = 0;
		for (let n = 0; n < e.length; n++) {
			let r = f.get(e[n]);
			if (!r) continue;
			let i = (m[I.length - 1] ?? 0) === 0 && n === 0;
			t += Ii(r, d, E(), i);
		}
		return t;
	}, G = () => {
		m[I.length - 1] = 0, V = /* @__PURE__ */ new Set();
	}, K = (e) => {
		I[I.length - 1].length > 0 && (I.push([]), L = 0, w = 0, j = 0, M = 0, N = null, R = null, z = 0, d.y = c(), d.floats = [], d.floatParaSeq = 0, B(e), G(), te(e));
	}, q = () => {
		M = Math.max(M, L), w++, L = j, R = null, z = 0, d.y = c() + j;
	}, J = (e) => {
		w < C.length - 1 ? q() : K(e);
	}, ee = (t, n) => {
		let r = {
			...d,
			y: c(),
			floats: [],
			floatParaSeq: 0
		}, i = 0, a = 0, o = null, s = !1;
		for (let c = t; c < e.length; c++) {
			let t = e[c];
			if (t.type === "sectionBreak" || t.type === "pageBreak") {
				s = !0;
				break;
			}
			if (t.type !== "columnBreak") {
				if (t.type === "paragraph") {
					let e = t;
					if (e.pageBreakBefore) return {
						height: Infinity,
						terminated: !1
					};
					if (e.framePr) continue;
					let s = xa(o, e) || _(c), l = s ? 0 : e.spaceBefore;
					i += ta(r, e, n, s, 0) - Math.min(a, l), a = e.spaceAfter, o = e;
				} else if (t.type === "table") {
					let e = t;
					if (e.tblpPr) continue;
					i += ca(r, e, n).reduce((e, t) => e + t, 0), a = 0, o = null;
				}
			}
		}
		return {
			height: i,
			terminated: s
		};
	}, te = (e) => {
		N = null;
		let t = C.length;
		if (t < 2) return;
		let { height: n, terminated: r } = ee(e, C[0].wPt);
		if (!r || !Number.isFinite(n)) return;
		let i = U() - j;
		i <= 0 || n > t * i || (N = n / t);
	}, Y = (e) => N != null && w < C.length - 1 && L > j && L + e > j + N, ne = (e) => {
		let t = 0;
		for (let n of e.runs) if (n.type === "image") {
			let e = n;
			if (!e.anchor || !e.anchorYFromPara) continue;
			let r = (e.anchorYPt ?? 0) + e.heightPt;
			r > t && (t = r);
		} else if (n.type === "shape") {
			let e = n;
			if (!e.anchorYFromPara) continue;
			let r = Wa(e, d, d.y);
			if (r.h <= 0) continue;
			let i = (e.anchorYPt ?? 0) + r.h;
			i > t && (t = i);
		}
		return t;
	}, re = (t) => {
		let n = e[t];
		return n ? n.type === "paragraph" ? ta(d, n, E(), !1) : n.type === "table" ? ua(d, n, E()) : 0 : 0;
	}, ie = (e) => {
		e.colIndex = w, e.colGeom = C, e.colTopPt = P(), e.sectionHF = O, e.sectionGeom = k, e.sectionPageNumType = A, I[I.length - 1].push(e);
	};
	te(0);
	for (let t = 0; t < e.length; t++) {
		let n = e[t];
		if (n.type === "columnBreak") {
			J(t + 1);
			continue;
		}
		if (n.type === "pageBreak") {
			I.push([]), L = 0, j = 0, M = 0, N = null, R = null, z = 0, d.y = c(), d.floats = [], d.floatParaSeq = 0, B(t + 1), G(), (n.parity === "odd" && I.length % 2 == 0 || n.parity === "even" && I.length % 2 == 1) && (I.push([]), G());
			continue;
		}
		if (n.type === "sectionBreak") {
			C = h(t + 1), w = 0, O = y(t + 1), k = x(t + 1), A = S(t + 1);
			let e = g(t + 1);
			if (e === "continuous") {
				let e = Math.max(M, L);
				L = e, d.y = c() + e, j = e, M = e, R = null, z = 0, te(t + 1);
			} else I.push([]), L = 0, j = 0, M = 0, N = null, R = null, z = 0, d.y = c(), d.floats = [], d.floatParaSeq = 0, B(t + 1), G(), te(t + 1), (e === "oddPage" && I.length % 2 == 0 || e === "evenPage" && I.length % 2 == 1) && (I.push([]), G());
			continue;
		}
		if (n.type === "paragraph") {
			let r = n;
			if (r.pageBreakBefore && K(t), r.framePr) {
				let i = r.framePr, a = Aa(e, n, d), o = F(() => ja(r, d, a)), s = o.y + o.h - d.y, c = i.vAnchor !== "page" && i.vAnchor !== "margin" && s > 0 && L + s > U(), l = s > 0 && s <= U();
				L > 0 && c && l && J(t), F(() => {
					Ln(ja(r, d, a), r.framePr, d);
				}), ie(n);
				continue;
			}
			let i = xa(R, r), a = _(t);
			if (a && (n.sectionBreakSpacer = !0), v(t)) {
				n.collapsedSpacer = !0, ie(n);
				continue;
			}
			let o = i || a, s = Sa(r) && v(t + 1);
			s && (n.leadsCollapsedRun = !0);
			let l = o ? 0 : r.spaceBefore, u = i || s ? z : Math.min(z, l);
			L -= u, d.y -= u;
			let h = d.floats.length, g = d.floatParaSeq, y = d.y;
			eo(r, d, y);
			let b = e[t + 1], x = b?.type === "paragraph" && jo(r, b), S = ta(d, r, E(), o, T(), x), D = [], P = 0;
			if (p) {
				let e = /* @__PURE__ */ new Set();
				for (let t of Ni(r.runs)) V.has(t) || e.has(t) || f.has(t) && (e.add(t), D.push(t));
				P = W(D);
			}
			let B = r.keepNext ? re(t + 1) : 0, H = S - r.spaceAfter, G = H + B + P, q = ne(r), ee = q > 0 && L + q > U(), te = q > 0 && q <= U(), ae = L > 0 && ee && te, oe = L > 0 && L + G > U(), se = r.keepLines || B > 0 || P > 0, X = !r.keepLines || S > U(), ce = Y(H) && !X, le = B > 0 && N != null && Y(H + B) && H + B <= N;
			if (ae || ce || le || oe && se && G <= U()) {
				let e = I.length;
				J(t), I.length > e ? (eo(r, d, d.y), p && D.length > 0 && (P = W(D))) : (d.floats.length = h, d.floatParaSeq = g, eo(r, d, d.y));
			}
			let ue = U(), de = () => N != null && w < C.length - 1 ? Math.min(U(), j + N) : U();
			if (H > de() - L && X) {
				let e = sa(d, r, E(), o, T(), L, ue, I, (e) => {
					M = Math.max(M, e), J(t);
				}, () => w, C, () => j, de, () => O, () => k, () => A);
				L = e.endY, d.y = c() + e.endY, p && D.length > 0 && (D = D.filter((e) => !V.has(e)), P = W(D));
			} else ie(n), L += S, d.y += S;
			if (p && D.length > 0) {
				let e = I.length - 1;
				m[e] = (m[e] ?? 0) + P;
				for (let e of D) V.add(e);
			}
			R = r, z = r.spaceAfter;
		} else if (n.type === "table") {
			let e = n;
			if (e.tblpPr) {
				let r = e.tblpPr, i = () => F(() => {
					let t = E() * d.scale, n = io(e, t, d), i = n.rowHeights.reduce((e, t) => e + t, 0);
					return {
						box: Rn(r, d, d.y, n.tableW, i),
						rawBox: Rn(r, d, d.y, n.tableW, i, !0),
						layout: n,
						contentWPt: t / d.scale
					};
				}), a = i(), o = r.vertAnchor !== "page" && r.vertAnchor !== "margin";
				o || (() => {
					let e = a.rawBox.y, t = a.rawBox.y + a.rawBox.h, n = a.rawBox.x, r = a.rawBox.x + a.rawBox.w;
					return d.floats.some((i) => i.kind === "table" && t - i.yTop > .01 && i.yBottom - e > .01 && r - i.xLeft > .01 && i.xRight - n > .01);
				})() && I[I.length - 1].length > 0 && (J(t), L = j, a = i());
				let s = a.box.y + a.box.h - d.y, l = o && s > 0 && L + s > U(), f = a.rawBox.y - c(), p = !o && a.rawBox.h > u();
				if (o && l || p) {
					let n = o ? a.box.y - d.y : f - L, i = ga(e, r, a.layout.colWidths, a.layout.rowHeights, n, a.contentWPt, () => L, () => j, () => U(), () => J(t), (t) => {
						F(() => {
							let n = t, r = t.tblpPr, i = (n.tableColWidthsPt ?? []).reduce((e, t) => e + t, 0) * d.scale, a = (n.tableRowHeightsPt ?? []).reduce((e, t) => e + t, 0) * d.scale, o = r.vertAnchor === "page" || r.vertAnchor === "margin", s = Rn(r, d, d.y, i, a, o);
							zn(s, r, d, Bn(s, d), e.overlap !== "never");
						}), ie(t);
					});
					L = i, d.y = c() + i, R = null, z = 0;
					continue;
				}
				F(() => {
					let t = Bn(a.box, d);
					zn(a.box, r, d, t, e.overlap !== "never");
				}), ma(n, a.layout.colWidths, a.layout.rowHeights, a.contentWPt), ie(n);
				continue;
			}
			let r = E(), { colWidthsPt: i, rowHeightsPt: a } = la(d, e, r), o = a.reduce((e, t) => e + t, 0), s = [], l = 0;
			if (p) {
				let e = /* @__PURE__ */ new Set();
				for (let t of Pi(n)) V.has(t) || e.has(t) || !f.has(t) || (e.add(t), s.push(t));
				l = W(s);
			}
			let h = U() - l, g = () => {
				if (!p || s.length === 0) return;
				s = s.filter((e) => !V.has(e));
				let e = W(s), t = I.length - 1;
				m[t] = (m[t] ?? 0) + e;
				for (let e of s) V.add(e);
			};
			if (o > h) {
				let n = ha(e, a, L, h, I, (e) => {
					M = Math.max(M, e), J(t);
				}, () => w, C, () => j, c(), () => O, () => k, () => A, {
					colWidthsPt: i,
					contentWPt: r
				});
				L = n, d.y = c() + n, g();
			} else (Y(o) || L + o > h) && J(t), ma(n, i, a, r), ie(n), L += o, d.y += o, g();
			R = null;
		}
	}
	return I;
}
function Wi(e, t, n) {
	return t < 0 ? 0 : Math.max(0, n + e - t);
}
function Gi(e, t, n) {
	return t < 0 ? 0 : Math.max(0, n + e - t);
}
function $(e) {
	return Math.abs(e);
}
function Ki(e) {
	return {
		pageWidth: e.pageWidth,
		pageHeight: e.pageHeight,
		marginTop: e.marginTop,
		marginRight: e.marginRight,
		marginBottom: e.marginBottom,
		marginLeft: e.marginLeft,
		headerDistance: e.headerDistance,
		footerDistance: e.footerDistance
	};
}
function qi(e, t, n) {
	let r = va(e, t, n);
	return _a(r.footers, r.isFirstPageOfSection, t % 2 == 1, r.titlePage, n.section.evenAndOddHeaders);
}
function Ji(e, t, n) {
	let r = va(e, t, n);
	return _a(r.headers, r.isFirstPageOfSection, t % 2 == 1, r.titlePage, n.section.evenAndOddHeaders);
}
var Yi = .5;
function Xi(e, t, n) {
	return e.map((r, i) => {
		let a = qi(e, i, t);
		if (!a) return 0;
		let o = ba(a, n), s = e[i]?.[0]?.sectionGeom;
		return Wi(o, s?.marginBottom ?? t.section.marginBottom, s?.footerDistance ?? t.section.footerDistance);
	});
}
function Zi(e, t, n) {
	return e.map((r, i) => {
		let a = Ji(e, i, t);
		if (!a) return 0;
		let o = ba(a, n), s = e[i]?.[0]?.sectionGeom;
		return Gi(o, s?.marginTop ?? t.section.marginTop, s?.headerDistance ?? t.section.headerDistance);
	});
}
function Qi(e, t, n, r, i) {
	let a = Pr(e.settings), o = Ui(e.body, e.section, t, n, r, i, [], a), s = ea(t, e.section, n, r, aa(e.body), a), c = Xi(o, e, s), l = Zi(o, e, s), u = (e) => e.some((e) => e > Yi);
	if (!u(c) && !u(l)) return o;
	let d = o.map((e, t) => ({
		top: l[t] ?? 0,
		bottom: c[t] ?? 0
	}));
	return Ui(e.body, e.section, t, n, r, i, d, a);
}
function $i(e) {
	let t = new OffscreenCanvas(1, 1).getContext("2d");
	if (!t) return [e.body];
	let n = Si(e);
	return Qi(n, t, n.fontFamilyClasses ?? {}, X(n.settings), n.footnotes ?? []);
}
function ea(e, t, n = {}, r = D, i = !1, a = 36) {
	return {
		ctx: e,
		scale: 1,
		dpr: 1,
		contentX: t.marginLeft,
		contentW: t.pageWidth - t.marginLeft - t.marginRight,
		y: 0,
		pageH: t.pageHeight,
		defaultColor: "#000000",
		pageIndex: 0,
		totalPages: 1,
		images: /* @__PURE__ */ new Map(),
		dryRun: !0,
		marginLeft: t.marginLeft,
		marginRight: t.marginRight,
		marginTop: $(t.marginTop),
		marginBottom: $(t.marginBottom),
		pageWidth: t.pageWidth,
		floats: [],
		floatParaSeq: 0,
		docGrid: {
			type: t.docGridType ?? null,
			linePitchPt: t.docGridLinePitch ?? null,
			charSpacePt: t.docGridCharSpace == null ? null : t.docGridCharSpace / 4096
		},
		docEastAsian: i,
		fontFamilyClasses: n,
		kinsoku: r,
		defaultTabPt: a,
		showTrackChanges: !1
	};
}
function ta(e, t, n, r = !1, i = 0, a = !1) {
	let o = t.bidi === !0 ? t.indentRight : t.indentLeft, s = t.bidi === !0 ? t.indentLeft : t.indentRight, c = Math.max(1, n - o - s), l = i + o, u = Br(t.runs, e), d = ra(t), f = oa(t, e), p = e.floats.length > 0, m = e.y, h = m + (r ? 0 : t.spaceBefore);
	p && (h = En(h, e.floats));
	let g = () => {
		if (p) {
			let n = wn(h, Io(t, 1), 10, l, c, e.floats);
			n.topY > h && (h = n.topY);
		}
		h += xr(t, 1, f, d, e.docEastAsian, e.ctx, e.fontFamilyClasses);
	};
	if (u.length === 0) g();
	else {
		let n = p ? {
			startPageY: h,
			paraX: l,
			floats: e.floats,
			lineBoxH: (e, n, r, i) => vr(t.lineSpacing, e, n, 1, f, d, i ?? 0, ia(t)),
			pageH: e.pageH
		} : void 0, r = Vr(e.ctx, u, c, t.indentFirst, 1, t.tabStops, n, e.fontFamilyClasses, o, e.kinsoku, ur(f, 1), e.defaultTabPt, c + s, t.bidi === !0);
		if (r.length === 0) g();
		else if (d) {
			let e = na(Math.max(0, ...r.map((e) => vr(t.lineSpacing, e.ascent, e.descent, 1, f, !0, e.intendedSingle, ia(t)))), f, 1);
			for (let t of r) t.topY !== void 0 && t.topY > h && (h = t.topY), h += e;
		} else for (let e of r) e.topY !== void 0 && e.topY > h && (h = e.topY), h += vr(t.lineSpacing, e.ascent, e.descent, 1, f, !1, e.intendedSingle, ia(t));
	}
	let _ = a ? 0 : Do(t.borders);
	return h += Math.max(t.spaceAfter, _), h - m;
}
function na(e, t, n) {
	if (!t || !t.linePitchPt || t.linePitchPt <= 0 || t.type !== "lines" && t.type !== "linesAndChars") return e;
	let r = t.linePitchPt * n;
	return r <= 0 ? e : e <= r ? r : Math.ceil(e / r) * r;
}
function ra(e) {
	for (let t of e.runs) if (t.type === "text" && t.ruby) return !0;
	return !1;
}
function ia(e) {
	for (let t of e.runs) if (t.type === "text" && lr.test(t.text)) return !0;
	return !1;
}
function aa(e) {
	for (let t of e) if (t.type === "paragraph") {
		if (ia(t)) return !0;
	} else if (t.type === "table") {
		for (let e of t.rows) for (let t of e.cells) if (aa(t.content)) return !0;
	}
	return !1;
}
function oa(e, t) {
	return e.snapToGrid === !1 ? {
		type: null,
		linePitchPt: null
	} : t.docGrid;
}
function sa(e, t, n, r, i, a, o, s, c, l, u, d, f, p, m, h) {
	let g = d ?? (() => 0), _ = f ?? (() => o), v = (t) => (l && (t.colIndex = l()), u && (t.colGeom = u), d && (t.colTopPt = (m ? $(m().marginTop) : e.marginTop) + g()), p && (t.sectionHF = p()), m && (t.sectionGeom = m()), h && (t.sectionPageNumType = h()), t), y = t.bidi === !0 ? t.indentRight : t.indentLeft, b = t.bidi === !0 ? t.indentLeft : t.indentRight, x = Math.max(1, n - y - b), S = i + y, C = () => {
		let o = ta(e, t, n, r, i), l = a;
		return a > 0 && a + o - t.spaceAfter > _() && (c(a), l = g(), o = ta(e, t, n, r, i)), s[s.length - 1].push(v(t)), { endY: l + o };
	}, w = Br(t.runs, e);
	if (w.length === 0) return C();
	let T = e.floats.length > 0 ? {
		startPageY: e.y,
		paraX: S,
		floats: e.floats,
		lineBoxH: (n, r, i, a) => vr(t.lineSpacing, n, r, 1, e.docGrid, ra(t), a ?? 0, ia(t)),
		pageH: e.pageH
	} : void 0, E = Vr(e.ctx, w, x, t.indentFirst, 1, t.tabStops, T, e.fontFamilyClasses, y, e.kinsoku, ur(oa(t, e), 1), e.defaultTabPt, x + b, t.bidi === !0);
	if (E.length === 0) return C();
	let D = ra(t), O = !zr(t), k = (n) => vr(t.lineSpacing, n.ascent, n.descent, 1, e.docGrid, D, n.intendedSingle, ia(t)), A = D ? na(Math.max(0, ...E.map(k)), e.docGrid, 1) : 0, j = E.map((e) => D ? A : k(e)), M = r ? 0 : t.spaceBefore, N = t.spaceAfter, P = 0, F = a, I = !0;
	for (; P < E.length;) {
		let n = _() - F, r = I ? M : 0, i = P, a = P;
		for (; a < E.length && r + j[a] <= n;) r += j[a], a++;
		if (a === i) {
			if (F > 0) {
				c(F), F = g(), I = !0;
				continue;
			}
			a = i + 1, r += j[i];
		}
		if (t.widowControl !== !1 && a < E.length && (E.length - a === 1 && a - i >= 2 && (a--, r -= j[a]), i === 0 && a - i === 1 && F > 0)) {
			c(F), F = g(), I = !0;
			continue;
		}
		let o = a === E.length;
		o && (r += N);
		let l = {
			...t,
			type: "paragraph",
			lineSlice: {
				start: i,
				end: a
			}
		};
		O && La(l, E, {
			paraW: x,
			firstIndent: t.indentFirst,
			tabOriginPx: y,
			gridDeltaPx: ur(oa(t, e), 1),
			hasFloats: T !== void 0,
			kinsoku: e.kinsoku
		}), s[s.length - 1].push(v(l)), P = a, F += r, o || (c(F), F = g(), I = !0);
	}
	return { endY: F };
}
function ca(e, t, n) {
	return la(e, t, n).rowHeightsPt;
}
function la(e, t, n) {
	let r = fa(t, n, e);
	return {
		colWidthsPt: r,
		rowHeightsPt: qn(t, r, 1, (n, r) => ao(n, t, r, 1, e))
	};
}
function ua(e, t, n) {
	return ca(e, t, n).reduce((e, t) => e + t, 0);
}
function da(e, t, n) {
	let { ctx: r, fontFamilyClasses: i } = n, a = 0, o = (e) => {
		for (let t of e.runs) {
			if (t.type !== "text") continue;
			let e = t;
			if (!e.text) continue;
			let n = e.rtl === !0 || e.cs === !0;
			r.font = Q(n ? e.boldCs ?? e.bold : e.bold, n ? e.italicCs ?? e.italic : e.italic, n ? e.fontSizeCs ?? e.fontSize : e.fontSize, n ? e.fontFamilyCs ?? e.fontFamily : e.fontFamily, i);
			for (let t of e.text.split("	")) for (let e of Mr(t)) {
				let t = e.replace(/\s+$/u, "");
				if (!t) continue;
				let n = Tr(t) ? Math.max(...[...t].map((e) => r.measureText(e).width)) : r.measureText(t).width;
				n > a && (a = n);
			}
		}
	};
	for (let t of e.content) t.type === "paragraph" && o(t);
	if (a === 0) return 0;
	let s = mo(e, t);
	return a + s.left + s.right;
}
function fa(e, t, n) {
	let r = e.colWidths.length;
	if (r === 0) return [];
	let i = e.colWidths, a = e.tblpPr ? Math.max(t, n.pageWidth) : t, o = Array(r).fill(0);
	for (let t of e.rows) {
		let a = 0;
		for (let s of t.cells) {
			let t = Math.min(Math.max(s.colSpan, 1), r - a), c = da(s, e, n);
			if (c > 0) if (t === 1) c > o[a] && (o[a] = c);
			else {
				let e = i.slice(a, a + t), n = e.reduce((e, t) => e + t, 0);
				for (let r = 0; r < t; r++) {
					let i = c * (n > 0 ? e[r] / n : 1 / t);
					i > o[a + r] && (o[a + r] = i);
				}
			}
			a += t;
		}
	}
	let s = (e) => {
		let t = e.reduce((e, t) => e + t, 0);
		if (t <= a || t <= 0) return e;
		let n = o.reduce((e, t) => e + t, 0);
		if (n >= a) {
			let t = a / n;
			return n > 0 ? o.map((e) => e * t) : e.map(() => a / r);
		}
		let i = e.slice(), s = Array(r).fill(!1);
		for (let t = 0; t < r; t++) {
			let t = a, n = 0;
			for (let a = 0; a < r; a++) s[a] ? t -= i[a] : n += e[a];
			if (n <= 0) break;
			let c = !1;
			for (let a = 0; a < r; a++) {
				if (s[a]) continue;
				let r = t * (e[a] / n);
				r < o[a] ? (i[a] = o[a], s[a] = !0, c = !0) : i[a] = r;
			}
			if (!c) break;
		}
		return i;
	};
	if (e.layout === "fixed") {
		let e = i.slice(), t = e.reduce((e, t) => e + t, 0);
		if (t > a && t > 0) {
			let n = a / t;
			return e.map((e) => e * n);
		}
		return e;
	}
	let c = e.widthPt != null || e.widthPct != null;
	if (i.reduce((e, t) => e + t, 0) > 0 && c) return s(i.map((e, t) => Math.max(e, o[t])));
	let l = Array(r).fill(0), u = Array(r).fill(!1), d = (e) => e.widthPt == null ? e.widthPct == null ? null : e.widthPct / 5e3 * t : e.widthPt;
	for (let t of e.rows) {
		let e = 0;
		for (let n of t.cells) {
			let t = Math.min(Math.max(n.colSpan, 1), r - e);
			if (t === 1) {
				let t = d(n);
				t != null && (t > l[e] && (l[e] = t), u[e] = !0);
			}
			e += t;
		}
	}
	for (let t of e.rows) {
		let e = 0;
		for (let n of t.cells) {
			let t = Math.min(Math.max(n.colSpan, 1), r - e);
			if (t > 1) {
				let r = d(n);
				if (r != null) {
					let n = i.slice(e, e + t), a = n.reduce((e, t) => e + t, 0), o = n.reduce((t, n, r) => t + (u[e + r] ? l[e + r] : n), 0);
					if (r > o) {
						let s = r - o;
						for (let r = 0; r < t; r++) {
							let o = a > 0 ? n[r] / a : 1 / t, c = u[e + r] ? l[e + r] : i[e + r];
							l[e + r] = c + s * o, u[e + r] = !0;
						}
					}
				}
			}
			e += t;
		}
	}
	return s(l.map((e, t) => Math.max(u[t] ? e : i[t], o[t])));
}
function pa(e, t) {
	return t <= 0 ? !0 : !e.rows[t].cells.some((e) => e.vMerge === !1);
}
function ma(e, t, n, r) {
	e.tableColWidthsPt = t, e.tableRowHeightsPt = n, e.tableLayoutInputs = {
		scale: 1,
		contentWPt: r
	};
}
function ha(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	let m = c ?? (() => 0), h = e.rows.length, g = 0;
	for (; g < h && e.rows[g].isHeader;) g++;
	let _ = e.rows.slice(0, g), v = t.slice(0, g).reduce((e, t) => e + t, 0), y = t.slice(0, g), b = n, x = 0, S = !0;
	for (; x < h;) {
		let n = !S && g > 0 && x >= g, C = r - b, w = n ? v : 0, T = x;
		for (; T < h;) {
			let n = t[T];
			if (T > x && w + n > C && pa(e, T)) break;
			w += n, T++;
		}
		let E = e.rows.slice(x, T), D = n ? [..._, ...E] : E, O = {
			...e,
			type: "table",
			rows: D
		};
		if (o && (O.colIndex = o()), s && (O.colGeom = s), c && l != null && (O.colTopPt = l + m()), u && (O.sectionHF = u()), d && (O.sectionGeom = d()), f && (O.sectionPageNumType = f()), p) {
			let e = n ? [...y, ...t.slice(x, T)] : t.slice(x, T);
			ma(O, p.colWidthsPt, e, p.contentWPt);
		}
		i[i.length - 1].push(O), b += w, x = T, S = !1, x < h && (a(b), b = m());
	}
	return b;
}
function ga(e, t, n, r, i, a, o, s, c, l, u) {
	let d = r.length, f = 0, p = !0;
	for (; f < d;) {
		let m = p ? o() + i : s(), h = c() - m;
		if (r[f] > h && m > s()) {
			l(), p = !1;
			continue;
		}
		let g = 0, _ = f;
		for (; _ < d;) {
			let t = r[_];
			if (_ > f && g + t > h && pa(e, _)) break;
			g += t, _++;
		}
		let v = p ? t : {
			...t,
			vertAnchor: "text",
			tblpY: 0,
			tblpYSpec: void 0
		}, y = {
			...e,
			type: "table",
			rows: e.rows.slice(f, _),
			tblpPr: v
		};
		ma(y, n, r.slice(f, _), a), u?.(y), f = _, p = !1, f < d && l();
	}
	return s();
}
function _a(e, t, n, r, i) {
	return r && t && e.first ? e.first : i && n && e.even ? e.even : e.default ?? null;
}
function va(e, t, n) {
	let r = (t) => e[t]?.[0]?.sectionHF, i = r(t);
	return {
		headers: i?.headers ?? n.headers,
		footers: i?.footers ?? n.footers,
		titlePage: i?.titlePage ?? n.section.titlePage,
		isFirstPageOfSection: t === 0 || r(t - 1) !== i,
		geom: e[t]?.[0]?.sectionGeom ?? Ki(n.section)
	};
}
function ya(e, t, n) {
	let r = {
		...n,
		y: t
	};
	Ea(e.body, r);
}
function ba(e, t) {
	let n = {
		...t,
		y: 0,
		dryRun: !0,
		floats: []
	};
	return Ea(e.body, n), n.y;
}
function xa(e, t) {
	return !!(e?.contextualSpacing && t.contextualSpacing && e.styleId && e.styleId === t.styleId);
}
function Sa(e) {
	return !(e.runs ?? []).some((e) => {
		let t = e;
		return t.type === "text" ? (t.text ?? "").length > 0 : !0;
	});
}
function Ca(e, t) {
	let n = e[t];
	return !n || n.type !== "paragraph" || e[t + 1]?.type !== "sectionBreak" ? !1 : Sa(n);
}
function wa(e, t, n) {
	let r = 0, i = null, a = 0;
	for (let o of e) if (o.type === "paragraph") {
		let e = o, s = xa(i, e), c = s ? 0 : e.spaceBefore, l = s ? a : Math.min(a, c);
		r += t(o) - (s ? e.spaceBefore : 0) * n - l * n, i = e, a = e.spaceAfter;
	} else r += t(o), i = null, a = 0;
	return r;
}
function Ta(e, t, n, r) {
	let i = $(n.marginTop) * r, a = (n.pageHeight - $(n.marginBottom)) * r;
	e.save(), e.strokeStyle = "#000000", e.lineWidth = Math.max(1, Math.round(.5 * r));
	for (let n = 0; n < t.length - 1; n++) {
		let o = t[n].xPt + t[n].wPt, s = t[n + 1].xPt, c = Math.round((o + s) / 2 * r) + .5;
		e.beginPath(), e.moveTo(c, i), e.lineTo(c, a), e.stroke();
	}
	e.restore();
}
function Ea(e, t, n, r = 0) {
	let i = null, a = 0;
	t.pageAnchorPrescanned = /* @__PURE__ */ new Set(), to(e, 0, t);
	let o = t.deferFront;
	t.deferFront = [];
	let s = -1, c, l = (e, t) => (e.colGeom ?? n) === (t.colGeom ?? n) && (e.colIndex ?? 0) === (t.colIndex ?? 0), u = (e, t) => {
		if (!t || t.type !== "paragraph" || !l(e, t)) return null;
		let n = t;
		return n.framePr ? null : n;
	}, d = (t) => u(e[t], e[t - 1]), f = (t) => u(e[t], e[t + 1]);
	for (let o = 0; o < e.length; o++) {
		let l = e[o], u = l.colGeom ?? n, p = !!u && u.length > 1, m = l.colIndex ?? 0;
		if (p && (u !== c || m !== s)) {
			let e = u[Math.min(m, u.length - 1)];
			t.contentX = e.xPt * t.scale, t.contentW = e.wPt * t.scale, m > s && u === c && (t.y = (l.colTopPt ?? t.marginTop) * t.scale + r), i = null, a = 0, s = m, c = u;
		} else if (!p && u && u.length === 1 && u !== c) {
			c && c.length > 1 && l.colTopPt != null && (t.y = Math.max(t.y, l.colTopPt * t.scale + r));
			let e = u[0];
			t.contentX = e.xPt * t.scale, t.contentW = e.wPt * t.scale, i = null, a = 0, s = m, c = u;
		}
		if (l.type === "paragraph") {
			let n = l, r = l.lineSlice;
			if (n.framePr) {
				Ma(n, t, Aa(e, l, t));
				continue;
			}
			if (l.collapsedSpacer) continue;
			let s = xa(i, n), c = !!l.sectionBreakSpacer, u = s || c, p = !!l.leadsCollapsedRun, m = u ? 0 : n.spaceBefore;
			t.y -= (s || p ? a : Math.min(a, m)) * t.scale;
			let h = !!r && r.start > 0, g = Ao(n.borders) ? {
				suppressTop: jo(d(o), n),
				suppressBottom: jo(n, f(o))
			} : void 0;
			Pa(n, t, u || h, r, !1, g), i = n, a = n.spaceAfter;
		} else if (l.type === "table") {
			let e = l;
			fo(e, t), e.tblpPr || (i = null, a = 0);
		}
	}
	let p = t.deferFront ?? [];
	t.deferFront = o;
	for (let e of p) e();
}
function Da(e, t) {
	let n = null, r = 0;
	for (let i = 0; i < e.length; i++) {
		let a = e[i], o = xa(n, a), s = o ? 0 : a.spaceBefore;
		t.y -= Math.min(r, s) * t.scale;
		let c = e[i - 1] ?? null, l = e[i + 1] ?? null;
		Pa(a, t, o, void 0, !1, Ao(a.borders) ? {
			suppressTop: jo(c, a),
			suppressBottom: jo(a, l)
		} : void 0), n = a, r = a.spaceAfter;
	}
}
function Oa(e) {
	switch (e) {
		case "left": return "left";
		case "right": return "right";
		default: return "center";
	}
}
function ka(e, t, n) {
	let { ctx: r, scale: i, dryRun: a } = t, { grid: o, paraHasRuby: s, contentX: c, indLeft: l, paraW: u, textAreaTopY: d, paragraphStartY: f, markTop: p, totalLines: m, lineSlice: h, borderMerge: g } = n, _ = Math.max(0, p - d);
	p > t.y && (t.y = p);
	let v = t.y, y = xr(e, i, o, s, t.docEastAsian, r, t.fontFamilyClasses);
	if (e.shading && !a) {
		r.fillStyle = `#${e.shading}`;
		let t = To(c + l, v, u, y, e.borders, g, i);
		r.fillRect(t.x, t.y, t.w, t.h);
	}
	t.y += y, e.borders && !a && Eo(r, c + l, v, u, y, e.borders, i, t.dpr, g), (!h || h.end >= m) && (t.y += Math.max(e.spaceAfter, Do(e.borders, g)) * i), (!h || h.start === 0) && Ha(e, t, f + _);
}
function Aa(e, t, n) {
	let r = e.indexOf(t);
	for (let t = r + 1; t < e.length; t++) {
		let r = e[t];
		if (r.type !== "paragraph") continue;
		let i = r;
		if (!i.framePr) return xr(i, n.scale, oa(i, n), ra(i), n.docEastAsian, n.ctx, n.fontFamilyClasses);
	}
	let i = t;
	return xr(i, n.scale, oa(i, n), ra(i), n.docEastAsian, n.ctx, n.fontFamilyClasses);
}
function ja(e, t, n) {
	let r = e.framePr, { scale: i } = t, a = t.y, o = oa(e, t), s = ra(e), c = Br(e.runs, t), l = c.length === 0 ? [] : Vr(t.ctx, c, 1e5, 0, i, e.tabStops, void 0, t.fontFamilyClasses, 0, t.kinsoku, ur(o, i), t.defaultTabPt);
	return Fn(r, t, a, l.length === 0 ? 0 : Math.max(...l.map((e) => e.segments.reduce((e, t) => e + t.measuredWidth, 0))), l.reduce((t, n) => t + vr(e.lineSpacing, n.ascent, n.descent, i, o, s, n.intendedSingle, ia(e)), 0), n);
}
function Ma(e, t, n) {
	let r = e.framePr, i = t.y, a = ja(e, t, n), o = t.contentX, s = t.contentW;
	t.contentX = a.x, t.contentW = Math.max(a.w, a.exRight - a.x), t.y = a.y, Pa(e, t, !0, void 0, !0), t.contentX = o, t.contentW = s, t.y = i, Ln(a, r, t);
}
function Na(e, t, n, r) {
	let { ctx: i, scale: a, fontFamilyClasses: o } = t, s = "", c = 0, l = null, u = 0, d = 0;
	if (e.numbering) {
		s = e.numbering.text, c = e.numbering.tab * a;
		let f = e.numbering.suff || "tab", p = e.numbering.picBulletImagePath;
		if (p) {
			let n = t.images.get(li(p));
			if (n) {
				let t = Fo(e.numbering, e);
				l = {
					bmp: n,
					w: t.w * a,
					h: t.h * a
				};
			}
		}
		let m;
		l ? m = l.w : (i.font = Q(!1, !1, or(e) * a, No(e.numbering), o), m = i.measureText(Po(e.numbering)).width);
		let h = e.numbering.jc || "left";
		d = h === "right" ? -m : h === "center" ? -m / 2 : 0;
		let g = r + d + m;
		if (f !== "tab") u = g + (f === "space" ? i.measureText(" ").width : 0);
		else if (g > 0) {
			let r = Fr(n + g, (e.tabStops ?? []).map((e) => ({
				pos: e.pos * a,
				alignment: e.alignment,
				leader: e.leader
			})), t.defaultTabPt * a);
			r && (u = r.pos - n);
		}
	}
	return {
		numTab: c,
		picBullet: l,
		numBodyOffset: u,
		markerJcShiftPx: d,
		hasMarker: s !== "" || l !== null
	};
}
function Pa(e, t, n = !1, r, i = !1, a) {
	let { ctx: o, scale: s, contentX: c, contentW: l, defaultColor: u, dryRun: d, fontFamilyClasses: f } = t, p = t.y;
	n || (t.y += e.spaceBefore * s), i || eo(e, t, p), Ha(e, t, p, "behind"), t.y = En(t.y, t.floats);
	let m = t.y, h = e.bidi === !0, g = i ? 0 : (h ? e.indentRight : e.indentLeft) * s, _ = i ? 0 : (h ? e.indentLeft : e.indentRight) * s, v = i ? 0 : e.indentFirst * s, { numTab: y, picBullet: b, numBodyOffset: x, markerJcShiftPx: S, hasMarker: C } = Na(e, t, g, v), w = c + g, T = w + v, E = l - g - _, D = Br(e.runs, t), O = ra(e), k = oa(e, t), A = () => {
		if (t.floats.length === 0) return m;
		let n = 10 * s;
		return wn(m, Io(e, s), n, w, E, t.floats).topY;
	};
	if (D.length === 0) {
		ka(e, t, {
			grid: k,
			paraHasRuby: O,
			contentX: c,
			indLeft: g,
			paraW: E,
			textAreaTopY: m,
			paragraphStartY: p,
			markTop: A(),
			totalLines: 0,
			lineSlice: void 0,
			borderMerge: a
		});
		return;
	}
	let j = t.floats.length > 0 ? {
		startPageY: t.y,
		paraX: w,
		floats: t.floats,
		lineBoxH: (t, n, r, i) => vr(e.lineSpacing, t, n, s, k, O, i ?? 0, ia(e)),
		pageH: t.pageH
	} : void 0, M = C && !h ? x : T - w, N = ur(k, s), P = e, F = l / s - (i ? 0 : h ? e.indentRight : e.indentLeft) - (i ? 0 : h ? e.indentLeft : e.indentRight), I = i ? 0 : h ? e.indentRight : e.indentLeft, L = C && !h ? x / s : e.indentFirst, R = ur(k, 1), z = Ra && P.layoutLines !== void 0 && P.layoutLinesInputs !== void 0 && P.layoutLinesInputs.scale === 1 && !j && !P.layoutLinesInputs.hasFloats && Math.abs(P.layoutLinesInputs.paraW - F) <= 1e-6 * Math.max(1, Math.abs(F)) && P.layoutLinesInputs.firstIndent === L && P.layoutLinesInputs.tabOriginPx === I && P.layoutLinesInputs.gridDeltaPx === R && Rr(P.layoutLinesInputs.kinsoku, t.kinsoku), B = i ? 0 : h ? e.indentLeft : e.indentRight, V = E + _, H = F + B, U = z ? Hr(P.layoutLines, s, o, t.fontFamilyClasses, N) : j ? Vr(o, D, E, M, s, e.tabStops, j, t.fontFamilyClasses, g, t.kinsoku, N, t.defaultTabPt, V, h) : Hr(Vr(o, D, F, L, 1, e.tabStops, void 0, t.fontFamilyClasses, I, t.kinsoku, R, t.defaultTabPt, H, h), s, o, t.fontFamilyClasses, N), W = (() => {
		if (D.some((e) => "isTab" in e)) return null;
		let t = e.tabStops ?? [];
		if (t.length === 0) return null;
		let n = t.reduce((e, t) => t.pos < e.pos ? t : e);
		if (n.alignment !== "decimal") return null;
		let r = e.runs.map((e) => e.text ?? "").join("").trim();
		return r === "" || !/^[+\-(]?[\d., ]+\)?%?$/.test(r) ? null : n.pos * s - g;
	})();
	if (U.length === 0) {
		ka(e, t, {
			grid: k,
			paraHasRuby: O,
			contentX: c,
			indLeft: g,
			paraW: E,
			textAreaTopY: m,
			paragraphStartY: p,
			markTop: A(),
			totalLines: U.length,
			lineSlice: r,
			borderMerge: a
		});
		return;
	}
	let G = O ? na(Math.max(0, ...U.map((t) => vr(e.lineSpacing, t.ascent, t.descent, s, k, !0, t.intendedSingle, ia(e)))), k, s) : 0, K = (t) => O ? G : vr(e.lineSpacing, t.ascent, t.descent, s, k, !1, t.intendedSingle, ia(e)), q = r ? r.start : 0, J = r ? r.end : U.length, ee = Math.min(J, U.length);
	if (e.shading && !d) {
		let t = wo(U, q, ee, m, K);
		o.fillStyle = `#${e.shading}`;
		let n = To(c + g, m, E, t, e.borders, a, s);
		o.fillRect(n.x, n.y, n.w, n.h);
	}
	let te = _n(e.alignment), Y = vn(e.alignment), ne = h || pn(D), re = {
		ctx: o,
		scale: s,
		state: t,
		para: e,
		dryRun: d,
		defaultColor: u,
		fontFamilyClasses: f,
		contentX: c,
		contentW: l,
		lines: U,
		grid: k,
		paraX: w,
		firstLineX: T,
		paraW: E,
		indLeft: g,
		indFirst: v,
		baseRtl: h,
		hasMarker: C,
		numTab: y,
		numBodyOffset: x,
		markerJcShiftPx: S,
		picBullet: b,
		isJustified: te,
		stretchLastLine: Y,
		alignEdge: gn(e.alignment, h),
		paraNeedsBidi: ne,
		decimalAutoTabPx: W,
		drawGridDeltaPx: ur(k, s),
		lineHForLine: K
	};
	for (let e = q; e < ee; e++) Fa(e, re);
	if (e.borders && !d) {
		let n = t.y - m;
		Eo(o, c + g, m, E, n, e.borders, s, t.dpr, a);
	}
	(!r || r.end >= U.length) && (t.y += Math.max(e.spaceAfter, Do(e.borders, a)) * s), (!r || r.start === 0) && Ha(e, t, p);
}
function Fa(e, t) {
	let { ctx: n, scale: r, state: i, para: o, dryRun: s, defaultColor: c, fontFamilyClasses: l, contentX: u, contentW: d, lines: f, grid: p, paraX: m, firstLineX: h, paraW: g, indLeft: _, indFirst: v, baseRtl: y, hasMarker: b, numTab: x, numBodyOffset: S, markerJcShiftPx: w, picBullet: T, isJustified: E, stretchLastLine: D, alignEdge: O, paraNeedsBidi: k, decimalAutoTabPx: A, drawGridDeltaPx: j, lineHForLine: M } = t, N = f[e], P = e === 0, F = e === f.length - 1;
	N.topY !== void 0 && N.topY > i.y && (i.y = N.topY);
	let I = M(N), L = N.ascent + N.descent, R = i.y + (I - L) / 2 + N.ascent, z = m + N.xOffset, B = N.availWidth, V = P && !y ? b ? z + S : z + v : z, H = y && P ? B - v : B, U = k ? hn(N.segments, y) : null;
	k && (n.textAlign = "left");
	let W = N.segments.length, G = U ? U.order[W - 1] : W - 1, K = N.segments.reduce((e, t) => e + t.measuredWidth, 0), q = H - (V - z) - K, J = F || (N.endsWithBreak ?? !1), ee = E && (!J || D), te = null, Y = 0, ne = 0;
	if (!k) for (let e = 0; e < W; e++) {
		let t = N.segments[e];
		if (!("text" in t) || /\S/.test(t.text)) {
			ne = e;
			break;
		}
	}
	let re = 0;
	if (!ee && q < 0) {
		let e = kn(N.segments.map((e) => "text" in e ? { text: e.text } : {}), q, ne, k ? G : W, N.ascent);
		e && (te = e.perSeg, Y = e.perGap, re = On(e));
	}
	let ie = q - re, ae = 0, oe = N.segments.length === 1 && "mathNodes" in N.segments[0] && N.segments[0].display ? N.segments[0] : null, se = (oe ? Oa(oe.jc ?? i.mathDefJc ?? "centerGroup") : null) ?? O;
	if (se === "right" ? ae = ie : se === "center" ? ae = ie / 2 : se === "justify" && y && !ee && (ae = ie), A != null && K > 0 && (ae = Math.max(0, m + A - K - V)), V += ae, P && b && !s) if (T) {
		let { bmp: e, w: t, h: r } = T, i = R - r, a = y ? V + K + x - t : z + v + w;
		n.drawImage(e, a, i, t, r);
	} else {
		let e = or(o) * r;
		if (n.font = Q(!1, !1, e, No(o.numbering), l), n.fillStyle = c, y) {
			let e = n.textAlign, t = n.direction;
			n.textAlign = "left", n.direction = "rtl";
			let r = Po(o.numbering), i = n.measureText(r).width;
			n.fillText(r, V + K + x - i, R), n.textAlign = e, n.direction = t;
		} else {
			let t = Po(o.numbering), r = z + v + w;
			i.verticalCJK ? Qr(n, t, r, R, e, 0) : n.fillText(t, r, R);
		}
	}
	if (ee) {
		let e = H - (V - z) - K, t = -N.ascent * .25, n = Dn(N.segments.map((e) => "text" in e ? { text: e.text } : {}), e, ne, k ? G : W, t, e > 0);
		te = n ? n.perSeg : null, Y = n ? n.perGap : 0;
	}
	let X = null, ce = () => {
		if (!X) return;
		let e = X;
		X = null;
		let t = Math.max(1, e.border.width * r), i = (e.border.space ?? 0) * r;
		n.strokeStyle = e.border.color ? `#${e.border.color}` : c, n.lineWidth = t, n.strokeRect(e.left - i, e.top - i, e.right - e.left + 2 * i, e.bottom - e.top + 2 * i);
	};
	for (let e = 0; e < W; e++) {
		let t = U ? U.order[e] : e, u = N.segments[t];
		if (U && (n.direction = U.rtl[t] ? "rtl" : "ltr"), "text" in u || ce(), "isTab" in u) {
			!s && u.leader && u.leader !== "none" && u.measuredWidth > 1 && Ba(n, u.leader, V, R, u.measuredWidth, u.fontSize * r, c, u.bold, u.italic), V += u.measuredWidth;
			continue;
		}
		if ("imagePath" in u) {
			s || Va(n, u, V, R, r, i.images, !!i.verticalCJK), V += u.measuredWidth;
			continue;
		}
		if ("mathNodes" in u) {
			let e = Jn.get(u.mathNodes);
			if (!s && e) {
				let t = u.fontSize * r, i = e.widthEm * t, a = (e.ascentEm + e.descentEm) * t, o = R - e.ascentEm * t;
				n.drawImage(e.img, V, o, i, a);
			}
			V += u.measuredWidth;
			continue;
		}
		let d = u, f = te?.get(t), p = f?.internalStretch ?? 0;
		if (!s) {
			let e = ar(d, r), t = -(d.position ?? 0) * r, s = (d.vertAlign === "super" ? -d.fontSize * r * .35 : d.vertAlign === "sub" ? d.fontSize * r * .15 : 0) + t;
			n.font = Q(d.bold, d.italic, e, d.fontFamily, l);
			let u = d.charScale ?? 1, m = (d.charSpacing ?? 0) * r, h = n.fontKerning;
			d.kerning != null && (n.fontKerning = d.fontSize >= d.kerning ? "normal" : "none");
			let g = d.measuredWidth + p, _ = g + (f?.trailingGap && !k && /\s$/.test(d.text) ? Y : 0), v = R + s - e * .85, y = e * 1.1;
			d.highlight && (n.fillStyle = ri[d.highlight] ?? "#FFFF00", n.fillRect(V, v, _, y)), d.background && (n.fillStyle = `#${d.background}`, n.fillRect(V, v, _, y));
			let b = d.border && d.border.style !== "none" && d.border.style !== "nil" ? d.border : null;
			if (b) {
				let e = v, t = e + y;
				X && Mo(X.border, b) ? (X.right = V + _, X.top = Math.min(X.top, e), X.bottom = Math.max(X.bottom, t)) : (ce(), X = {
					border: b,
					left: V,
					right: V + _,
					top: e,
					bottom: t
				});
			} else ce();
			let x = i.showTrackChanges && !!d.revision, S = x ? mi(d.revision.author) : null, w, T = d.background ?? o.shading ?? i.containerShading ?? null;
			w = S || (d.color ? `#${d.color}` : d.colorAuto || T != null ? C(T) : c), n.fillStyle = w;
			let E = fr(d.text, j);
			if (i.verticalCJK && d.tateChuYoko) $r(n, d.text, V, R + s, e, g, u, !!d.tateChuYokoCompress);
			else if (i.verticalCJK) Qr(n, d.text, V, R + s, e, E === 0 ? 0 : j);
			else if (E !== 0) {
				let e = [...d.text], t = (e) => n.measureText(e).width, r = j + m, i = u !== 1, a = Ce(e, f?.splitBefore ?? [], Y / u, t, r / u), o = n.letterSpacing;
				i && (n.save(), n.translate(V, 0), n.scale(u, 1));
				let c = i ? 0 : V;
				n.letterSpacing = `${r / u}px`;
				for (let { text: e, dx: t } of a) n.fillText(e, c + t, R + s);
				n.letterSpacing = o, i && n.restore();
			} else if (f && f.splitBefore.length > 0) {
				let e = [...d.text], t = u !== 1, r = t ? 0 : V, i = n.letterSpacing;
				if (t && (n.save(), n.translate(V, 0), n.scale(u, 1)), f.splitBefore.length === e.length - 1) n.letterSpacing = `${(Y + m) / u}px`, n.fillText(d.text, r, R + s);
				else {
					let t = (e) => n.measureText(e).width;
					for (let { text: i, dx: a } of Ce(e, f.splitBefore, Y / u, t, m / u)) n.letterSpacing = `${m / u}px`, n.fillText(i, r + a, R + s);
				}
				n.letterSpacing = i, t && n.restore();
			} else if (u !== 1) {
				n.save(), n.translate(V, 0), n.scale(u, 1);
				let e = n.letterSpacing;
				m !== 0 && (n.letterSpacing = `${m / u}px`), n.fillText(d.text, 0, R + s), n.letterSpacing = e, n.restore();
			} else if (m !== 0) {
				let e = n.letterSpacing;
				n.letterSpacing = `${m}px`, n.fillText(d.text, V, R + s), n.letterSpacing = e;
			} else n.fillText(d.text, V, R + s);
			if (d.kerning != null && (n.fontKerning = h), d.ruby) {
				let t = d.ruby.fontSizePt * r, i = Q(d.bold, d.italic, t, d.fontFamily, l);
				n.save(), n.font = i;
				let a = n.measureText(d.ruby.text).width, o = V + (g - a) / 2, c = R + s - e * .85 - t * .1;
				n.fillStyle = w, n.fillText(d.ruby.text, o, c), n.restore();
			}
			if (d.emphasisMark) {
				let t = Kr(d.emphasisMark, e), r = !!f && f.splitBefore.length > 0 && f.splitBefore.length === [...d.text].length - 1, i = E === 0 ? r ? Y : 0 : j, a = Gr(d.text, (e) => n.measureText(e).width, V, i), o = e * .06, s = t.above ? v - o - t.radius : v + y + o + t.radius;
				n.save(), n.fillStyle = w, n.strokeStyle = w;
				for (let { centerX: e } of a) t.shape === "circle" ? (n.lineWidth = Math.max(.5, t.radius * .35), n.beginPath(), n.arc(e, s, t.radius, 0, Math.PI * 2), n.stroke()) : t.shape === "comma" ? (n.beginPath(), n.arc(e, s, t.radius, 0, Math.PI * 2), n.fill(), n.beginPath(), n.moveTo(e - t.radius * .5, s + t.radius * .2), n.lineTo(e + t.radius * .5, s + t.radius * .2), n.lineTo(e - t.radius * .1, s + t.radius * 1.4), n.closePath(), n.fill()) : (n.beginPath(), n.arc(e, s, t.radius, 0, Math.PI * 2), n.fill());
				n.restore();
			}
			if (i.onTextRun && d.text) {
				let t = ni(V, i.y, i.verticalPhys?.cssWidthPx ?? 0, !!i.verticalCJK);
				i.onTextRun({
					text: d.text,
					x: t ? t.left : V,
					y: t ? t.top : i.y,
					w: g,
					h: I,
					fontSize: e,
					font: n.font,
					transform: t?.transform,
					hyperlink: d.hyperlink,
					eastAsianVert: i.verticalCJK && d.tateChuYoko ? !0 : void 0
				});
			}
			let D = w, O = Math.max(.5, e * .05), A = x && d.revision?.kind === "insertion", M = x && d.revision?.kind === "deletion";
			if (d.underline || A) {
				let t = R + s + e * .12, r = A ? void 0 : d.underlineStyle;
				if (r) {
					let a = d.underlineColor && d.underlineColor !== "auto" ? `#${d.underlineColor}` : D, o = Math.max(1, e * .05), s = t - Math.max(2, o);
					fe(n, V, s, _, e, a, Xt(r), i.dpr), n.setLineDash([]);
				} else {
					n.strokeStyle = !A && d.underlineColor && d.underlineColor !== "auto" ? `#${d.underlineColor}` : D, n.lineWidth = O;
					let e = t + a(t, O, i.dpr);
					n.beginPath(), n.moveTo(V, e), n.lineTo(V + _, e), n.stroke();
				}
			}
			if (d.strikethrough || M) {
				n.strokeStyle = D, n.lineWidth = O;
				let t = R + s - e * .3, r = t + a(t, O, i.dpr);
				n.beginPath(), n.moveTo(V, r), n.lineTo(V + _, r), n.stroke();
			}
			if (d.doubleStrikethrough) {
				n.strokeStyle = D, n.lineWidth = O;
				let t = R + s - e * .35, r = R + s - e * .22, o = t + a(t, O, i.dpr), c = r + a(r, O, i.dpr);
				n.beginPath(), n.moveTo(V, o), n.lineTo(V + _, o), n.stroke(), n.beginPath(), n.moveTo(V, c), n.lineTo(V + _, c), n.stroke();
			}
		}
		V += d.measuredWidth + p, f?.trailingGap && (V += Y);
	}
	if (ce(), k && (n.direction = "ltr"), i.lineNumbering && i.lineNumberCounter !== void 0) {
		let e = i.lineNumberCounter;
		e % i.lineNumbering.countBy === 0 && !s && Ia(n, e, R, u, i.lineNumbering, r, i.defaultColor), i.lineNumberCounter = e + 1;
	}
	i.y += I;
}
function Ia(e, t, n, r, i, a, o) {
	e.save(), e.fillStyle = o, e.font = Q(!1, !1, i.fontSizePt * a, null, {});
	let s = e.textAlign;
	e.textAlign = "right", e.fillText(String(t), r - i.distancePt * a, n), e.textAlign = s, e.restore();
}
function La(e, t, n) {
	let r = e;
	r.layoutLines = t, r.layoutLinesInputs = {
		scale: 1,
		...n
	};
}
var Ra = !0, za = !0;
function Ba(e, t, n, r, i, a, o, s, c) {
	let l = t === "hyphen" ? "-" : t === "underscore" || t === "heavy" ? "_" : t === "middleDot" ? "·" : ".";
	e.save(), e.font = `${`${c ? "italic " : ""}${s ? "bold " : ""}`}${a}px serif`, e.fillStyle = o;
	let u = e.measureText(l).width;
	if (u > 0) {
		let a = t === "dot" || t === "middleDot" ? u * 1.5 : u, o = u * .5, s = n + i - a - o;
		for (let t = n + o; t <= s; t += a) e.fillText(l, t, r);
	}
	e.restore();
}
function Va(e, t, n, r, i, a, o) {
	if (t.anchor) return;
	let s = t.widthPt * i, c = t.heightPt * i, l = r - c, u = (t) => {
		o ? ei(e, n, l, s, c, t) : t(n, l, s, c);
	};
	if (t.chart) {
		let n = t.chart;
		u((t, r, a, o) => f(e, n, {
			x: t,
			y: r,
			w: a,
			h: o
		}, i));
		return;
	}
	let d = a.get(li(t.imagePath, t.colorReplaceFrom, t.duotone));
	if (!d) return;
	let p = t.alpha != null && t.alpha < 1;
	p && (e.save(), e.globalAlpha *= t.alpha), u((n, r, i, a) => h(e, d, t.srcRect, n, r, i, a)), p && e.restore();
}
function Ha(e, t, n, r = "front") {
	if (!t.dryRun) {
		if (r === "behind") {
			let r = e.runs.filter((e) => e.type === "shape" && !!e.behindDoc).slice().sort((e, t) => (e.zOrder ?? 0) - (t.zOrder ?? 0));
			for (let e of r) qa(e, t, n);
			return;
		}
		if (t.deferFront) {
			let r = t.contentX, i = t.contentW;
			t.deferFront.push(() => {
				let a = t.contentX, o = t.contentW, s = t.deferFront;
				t.contentX = r, t.contentW = i, t.deferFront = null, Ha(e, t, n, "front"), t.contentX = a, t.contentW = o, t.deferFront = s;
			});
			return;
		}
		for (let r of e.runs) {
			if (r.type === "shape") {
				let e = r;
				if (e.behindDoc) continue;
				qa(e, t, n);
				continue;
			}
			if (r.type === "chart") {
				let e = r;
				if (!e.anchor) continue;
				let { x: i, y: a, w: o, h: s } = Za({
					widthPt: e.widthPt,
					heightPt: e.heightPt,
					anchorXPt: e.anchorXPt,
					anchorYPt: e.anchorYPt,
					anchorXFromMargin: e.anchorXFromMargin,
					anchorYFromPara: e.anchorYFromPara
				}, t, n), c = e.chart;
				t.verticalCJK ? ei(t.ctx, i, a, o, s, (e, n, r, i) => f(t.ctx, c, {
					x: e,
					y: n,
					w: r,
					h: i
				}, t.scale)) : f(t.ctx, c, {
					x: i,
					y: a,
					w: o,
					h: s
				}, t.scale);
				continue;
			}
			if (r.type !== "image") continue;
			let e = r;
			if (!e.anchor || xn(e.wrapMode)) continue;
			let i = t.images.get(li(e.imagePath, e.colorReplaceFrom, e.duotone));
			if (!i) continue;
			let { x: a, y: o, w: s, h: c } = Za(e, t, n), l = e.alpha != null && e.alpha < 1;
			l && (t.ctx.save(), t.ctx.globalAlpha *= e.alpha), t.verticalCJK ? ei(t.ctx, a, o, s, c, (n, r, a, o) => h(t.ctx, i, e.srcRect ?? void 0, n, r, a, o)) : h(t.ctx, i, e.srcRect ?? void 0, a, o, s, c), l && t.ctx.restore();
		}
	}
}
function Ua(e) {
	if (e) return {
		type: e.type,
		w: e.w,
		len: e.len
	};
}
function Wa(e, t, n) {
	let { scale: r } = t, i = e.widthPt * r, a = e.heightPt * r, o = e.anchorXPt, s = e.anchorYPt, c = e.groupWidthPt ?? null, l = e.groupHeightPt ?? null;
	if (e.widthPct != null) {
		let n = Vn(e.widthRelativeFrom, !1, t), a = (n.end - n.start) * e.widthPct / r;
		if (e.groupWidthPt != null && e.groupWidthPt > 0) {
			let t = a / e.groupWidthPt;
			i = e.widthPt * r * t, o = e.anchorXPt * t;
		} else i = a * r;
		c = a;
	}
	if (e.heightPct != null) {
		let i = Hn(e.heightRelativeFrom, !1, n, t), o = (i.end - i.start) * e.heightPct / r;
		if (e.groupHeightPt != null && e.groupHeightPt > 0) {
			let t = o / e.groupHeightPt;
			a = e.heightPt * r * t, s = e.anchorYPt * t;
		} else a = o * r;
		l = o;
	}
	return {
		x: Un(e.anchorXAlign, e.anchorXFromMargin, o, i, t, e.anchorXRelativeFrom, e.pctPosH, c),
		y: Wn(e.anchorYAlign, e.anchorYFromPara, s, a, n, t, e.anchorYRelativeFrom, e.pctPosV, l),
		w: i,
		h: a
	};
}
function Ga(e) {
	return e && e.fillType === "solid" ? `#${e.color}` : null;
}
function Ka(e, t, n, r, i, a, o, s, c, l = {}) {
	let u = t.string;
	if (!u || i <= 0 || a <= 0) return;
	e.save(), e.font = Q(t.bold ?? !1, t.italic ?? !1, 100, t.fontFamily ?? null, l);
	let d = e.measureText(u), f = d.width || 100, p = (d.fontBoundingBoxAscent ?? d.actualBoundingBoxAscent ?? 100 * .8) + (d.fontBoundingBoxDescent ?? d.actualBoundingBoxDescent ?? 100 * .2) || 100, m = n + i / 2, h = r + a / 2;
	e.translate(m, h), o !== 0 && e.rotate(o * Math.PI / 180), e.scale(i / f, a / p), e.textAlign = "center", e.textBaseline = "middle", e.globalAlpha = Math.max(0, Math.min(1, c)), e.fillStyle = s ?? "#c0c0c0", e.fillText(u, 0, 0), e.restore();
}
function qa(e, t, n) {
	let { ctx: r, scale: i } = t, { x: a, y: o, w: s, h: c } = Wa(e, t, n), l = e.presetGeometry?.toLowerCase() ?? "", d = l === "line" || l.startsWith("straightconnector") || l.startsWith("bentconnector") || l.startsWith("curvedconnector"), f = l === "line" || l.startsWith("straightconnector") || l.startsWith("bentconnector");
	if (s < 0 || c < 0 || (d ? s === 0 && c === 0 : s === 0 || c === 0)) return;
	if (e.textPath && e.textPath.string.length > 0) {
		Ka(r, e.textPath, a, o, s, c, e.rotation ?? 0, Ga(e.fill), e.fillOpacity ?? 1, t.fontFamilyClasses);
		return;
	}
	let p = e.rotation ?? 0, m = e.flipH ?? !1, h = e.flipV ?? !1;
	r.save(), (p !== 0 || m || h) && (r.translate(a + s / 2, o + c / 2), p !== 0 && r.rotate(p * Math.PI / 180), m && r.scale(-1, 1), h && r.scale(1, -1), r.translate(-(a + s / 2), -(o + c / 2)));
	let _ = e.presetGeometry?.toLowerCase() ?? "", v = !!e.presetGeometry && x(_), y = e.adjValues ?? [], b = g(e.fill, r, a, o, s, c), C = e.stroke && (e.strokeWidth ?? 0) > 0 ? {
		color: e.stroke,
		width: e.strokeWidth ?? 0,
		dashStyle: e.strokeDash ?? void 0,
		headEnd: Ua(e.headEnd),
		tailEnd: Ua(e.tailEnd)
	} : null, T = C ? () => {
		w(r, C, i), r.stroke();
	} : null;
	if (v ? S(r, _, a, o, s, c, [
		y[0] ?? null,
		y[1] ?? null,
		y[2] ?? null,
		y[3] ?? null,
		y[4] ?? null,
		y[5] ?? null,
		y[6] ?? null,
		y[7] ?? null
	], b, T, () => {}, f ? { skipTrailingStroke: !0 } : void 0) : (r.beginPath(), e.presetGeometry ? me(r, e.presetGeometry, a, o, s, c, y[0] ?? null, y[1] ?? null, y[2] ?? null, y[3] ?? null) : Se(r, e.subpaths, a, o, s, c), b && (r.fillStyle = b, r.fill()), T && T()), C && (C.headEnd || C.tailEnd) && d) {
		let t = u(l, a, o, s, c, e.adjValues ?? []);
		if (t) {
			if (r.setLineDash([]), f && t.vertices.length >= 2) {
				let e = t.vertices.map((e) => ({
					x: e.x,
					y: e.y
				}));
				if (C.tailEnd) {
					let t = Ee(C.tailEnd, C, i);
					e[e.length - 1] = pe(e[e.length - 1], e[e.length - 2], t);
				}
				if (C.headEnd) {
					let t = Ee(C.headEnd, C, i);
					e[0] = pe(e[0], e[1], t);
				}
				w(r, C, i), r.beginPath(), r.moveTo(e[0].x, e[0].y);
				for (let t = 1; t < e.length; t++) r.lineTo(e[t].x, e[t].y);
				r.stroke();
			}
			C.tailEnd && ve(r, t.end.x, t.end.y, t.end.angle, C.tailEnd, C, i), C.headEnd && ve(r, t.start.x, t.start.y, t.start.angle, C.headEnd, C, i);
		}
	}
	r.restore(), e.textBlocks && e.textBlocks.length > 0 && Ya(e, a, o, s, c, r, i, t.fontFamilyClasses, t.images, t);
}
function Ja(e, t, n, r) {
	let i = (e ?? 0) * r, a = (t ?? 0) * r;
	return i <= 0 || a <= 0 ? {
		w: n,
		h: n
	} : i <= n ? {
		w: i,
		h: a
	} : {
		w: n,
		h: n / i * a
	};
}
function Ya(e, t, n, r, i, a, o, s = {}, c = /* @__PURE__ */ new Map(), l) {
	let u = l ?? Wr(a, o, s, c), d = u.defaultColor ?? "#000000", f = e.defaultTextColor ? `#${e.defaultTextColor}` : d, p = e.textBlocks ?? [], m = (e.textInsetL ?? 0) * o, h = (e.textInsetT ?? 0) * o, g = (e.textInsetR ?? 0) * o, _ = (e.textInsetB ?? 0) * o, v = t + m, y = Math.max(0, r - m - g), b = n + h, x = Math.max(0, i - h - _), S = (e) => {
		let t = (e.indentLeft ?? 0) * o, n = (e.indentRight ?? 0) * o, r = (e.indentFirst ?? 0) * o, i = Math.max(0, y - t - n);
		return {
			leftPx: t,
			firstPx: r,
			paraW: i,
			firstLineW: Math.max(0, i - r)
		};
	}, C = (e, t, n, r, i, c, l) => {
		let u = K(e ?? null, r), d = K(c ?? null, r), f = l ?? Math.max(u, d), p = d > u ? c ?? null : e ?? null;
		a.font = Q(t, n, r, p, s);
		let m = a.measureText("Mg"), h = E(p, r, m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? r * .8, m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? r * .2), g = h.ascent + h.descent, _ = vr(i.lineSpacingRule ? {
			value: i.lineSpacingVal ?? 0,
			rule: i.lineSpacingRule
		} : null, h.ascent, h.descent, o, void 0, !1, f, !1);
		return {
			lineH: _,
			baselineOffset: (_ - g) / 2 + h.ascent
		};
	}, w = (e, t) => {
		let n = null, r = 0;
		for (let e of t.segments) {
			if (!("text" in e)) continue;
			let t = e;
			(!n || t.fontSize > n.fontSize) && (n = t);
			let i = t.fontSize * o;
			r = Math.max(r, K(t.fontFamily ?? null, i), K(t.eaFloorFamily ?? null, i));
		}
		let i = (n?.fontSize ?? e.fontSizePt) * o;
		return C(n?.fontFamily ?? e.fontFamily, n?.bold ?? e.bold ?? !1, n?.italic ?? e.italic ?? !1, i, e, n?.eaFloorFamily ?? e.fontFamily, r);
	}, T = p.map((e) => {
		let t = S(e);
		if (e.imagePath) {
			let { w: n, h: r } = Ja(e.imageWidthPt ?? 0, e.imageHeightPt ?? 0, t.firstLineW, o);
			return {
				kind: "image",
				fitW: n,
				fitH: r,
				ind: t
			};
		}
		let n = Br((e.runs && e.runs.length > 0 ? e.runs : [{
			text: e.text,
			fontSizePt: e.fontSizePt,
			color: e.color,
			fontFamily: e.fontFamily,
			bold: e.bold,
			italic: e.italic
		}]).map(Ur), u), r = Oe(e.bidi, e.text) === "rtl", i = Vr(a, n, t.paraW, t.firstPx, o, e.tabStops ?? [], void 0, s, t.leftPx, u.kinsoku, 0, u.defaultTabPt, t.paraW, r), c = i.map((t) => w(e, t));
		return {
			kind: "text",
			lines: i,
			lineHeights: c.map((e) => e.lineH),
			baselineOffsets: c.map((e) => e.baselineOffset),
			baseRtl: r,
			alignment: e.alignment,
			ind: t
		};
	}), D = (e) => e.kind === "image" ? e.fitH : e.lineHeights.reduce((e, t) => e + t, 0), O = p.map((e) => (e.spaceBefore ?? 0) * o), k = p.map((e) => (e.spaceAfter ?? 0) * o), A = (e) => e > 0 ? Math.max(O[e], k[e - 1]) : O[e], j = T.reduce((e, t, n) => e + A(n) + D(t), 0), M = e.textAnchor ?? "t", N;
	N = M === "b" ? b + Math.max(0, x - j) : M === "ctr" ? b + Math.max(0, (x - j) / 2) : b;
	let P = e.textAutofit === "none";
	P && (a.save(), a.beginPath(), a.rect(t, n, r, i), a.clip());
	for (let e = 0; e < p.length; e++) {
		let t = p[e], n = T[e];
		if (N += A(e), n.kind === "image") {
			let { fitW: e, fitH: r, ind: i } = n, o = v + i.leftPx + i.firstPx, s = i.firstLineW, l = t.imagePath ? c.get(li(t.imagePath)) : void 0;
			if (l) {
				let n = o + Math.max(0, (s - e) / 2);
				t.alignment === "left" || t.alignment === "both" ? n = o : t.alignment === "right" && (n = o + Math.max(0, s - e)), a.drawImage(l, n, N, e, r);
			}
			N += r;
			continue;
		}
		if (n.kind === "text") {
			let { lines: e, baseRtl: t, ind: r } = n, i = _n(n.alignment) ? "justify" : gn(n.alignment, t), c = i === "justify", l = vn(n.alignment), u = t || e.some((e) => pn(e.segments));
			a.textAlign = "left";
			for (let d = 0; d < e.length; d++) {
				let p = e[d], m = d === 0, h = d === e.length - 1, g = n.lineHeights[d], _ = N + n.baselineOffsets[d], y = v + r.leftPx + (m ? r.firstPx : 0), b = m ? r.firstLineW : r.paraW, x = p.segments.length, S = u ? hn(p.segments, t) : null, C = S ? S.order[x - 1] : x - 1, w = p.segments.reduce((e, t) => e + t.measuredWidth, 0), T = h || (p.endsWithBreak ?? !1), E = c && (!T || l), D = b - w, O = null, k = 0, A = 0;
				if (!u) for (let e = 0; e < x; e++) {
					let t = p.segments[e];
					if (!("text" in t) || /\S/.test(t.text)) {
						A = e;
						break;
					}
				}
				let j = 0;
				if (!E && D < 0) {
					let e = kn(p.segments.map((e) => "text" in e ? { text: e.text } : {}), D, A, u ? C : x, p.ascent);
					e && (O = e.perSeg, k = e.perGap, j = On(e));
				}
				let M = D - j, P = 0;
				E || (i === "right" ? P = Math.max(0, M) : i === "center" ? P = Math.max(0, M / 2) : i === "justify" && t && (P = Math.max(0, M)));
				let F = y + P;
				if (E) {
					let e = -p.ascent * .25, t = Dn(p.segments.map((e) => "text" in e ? { text: e.text } : {}), D, A, u ? C : x, e, D > 0);
					O = t ? t.perSeg : null, k = t ? t.perGap : 0;
				}
				for (let e = 0; e < x; e++) {
					let t = S ? S.order[e] : e, n = p.segments[t];
					if (S && (a.direction = S.rtl[t] ? "rtl" : "ltr"), "isTab" in n) {
						n.leader && n.leader !== "none" && n.measuredWidth > 1 && Ba(a, n.leader, F, _, n.measuredWidth, n.fontSize * o, f, n.bold, n.italic), F += n.measuredWidth;
						continue;
					}
					if ("imagePath" in n || "mathNodes" in n) {
						F += n.measuredWidth;
						continue;
					}
					let r = n, i = O?.get(t), c = i?.internalStretch ?? 0, l = ar(r, o), d = r.vertAlign === "super" ? -r.fontSize * o * .35 : r.vertAlign === "sub" ? r.fontSize * o * .15 : 0;
					if (a.font = Q(r.bold, r.italic, l, r.fontFamily, s), a.fillStyle = r.color ? `#${r.color}` : f, i && i.splitBefore.length > 0) {
						let e = [...r.text];
						if (i.splitBefore.length === e.length - 1) {
							let e = a.letterSpacing;
							a.letterSpacing = `${k}px`, a.fillText(r.text, F, _ + d), a.letterSpacing = e;
						} else {
							let t = (e) => a.measureText(e).width;
							for (let { text: n, dx: r } of Ce(e, i.splitBefore, k, t)) a.fillText(n, F + r, _ + d);
						}
					} else a.fillText(r.text, F, _ + d);
					F += r.measuredWidth + c, i?.trailingGap && !u && /\s$/.test(r.text) && (F += k);
				}
				N += g;
			}
			continue;
		}
	}
	P && a.restore(), a.direction = "ltr";
}
function Xa(e) {
	let t = e.verticalPhys;
	return t ? {
		...e,
		pageWidth: t.pageWidth,
		marginLeft: t.marginLeft,
		marginRight: t.marginRight,
		marginTop: t.marginTop,
		marginBottom: t.marginBottom,
		pageH: t.pageHeight * e.scale
	} : e;
}
function Za(e, t, n) {
	let r = t.scale, i = e.widthPt * r, a = e.heightPt * r, o = (e.distLeft ?? 0) * r, s = (e.distRight ?? 0) * r, c = (e.distTop ?? 0) * r, l = (e.distBottom ?? 0) * r;
	if (t.verticalPhys) {
		let r = Xa(t), u = ti(Un(e.anchorXAlign, e.anchorXFromMargin ?? !1, e.anchorXPt ?? 0, i, r, e.anchorXRelativeFrom ?? null, null, null), Wn(e.anchorYAlign, e.anchorYFromPara ?? !1, e.anchorYPt ?? 0, a, n, r, e.anchorYRelativeFrom ?? null, null, null), i, a, t.verticalPhys.cssWidthPx);
		return {
			x: u.x,
			y: u.y,
			w: u.w,
			h: u.h,
			dl: c,
			dr: l,
			dt: s,
			db: o
		};
	}
	return {
		x: Un(e.anchorXAlign, e.anchorXFromMargin ?? !1, e.anchorXPt ?? 0, i, t, e.anchorXRelativeFrom ?? null, null, null),
		y: Wn(e.anchorYAlign, e.anchorYFromPara ?? !1, e.anchorYPt ?? 0, a, n, t, e.anchorYRelativeFrom ?? null, null, null),
		w: i,
		h: a,
		dl: o,
		dr: s,
		dt: c,
		db: l
	};
}
function Qa(e, t) {
	if (e == null) return !t;
	switch (e) {
		case "paragraph":
		case "line":
		case "character": return !1;
		default: return !0;
	}
}
function $a(e) {
	return xn(e.wrapMode) ? Qa(e.anchorYRelativeFrom ?? null, e.anchorYFromPara ?? !1) : !1;
}
function eo(e, t, n) {
	let r = t.floatParaSeq++, i = t.pageAnchorPrescanned?.has(e) ?? !1;
	for (let a of e.runs) if (a.type === "image") {
		let e = a;
		if (i && $a(e)) continue;
		no(e, t, n, r);
	} else if (a.type === "shape") {
		let e = a;
		if (i && $a(e)) continue;
		ro(e, t, n, r);
	}
}
function to(e, t, n) {
	n.pageAnchorPrescanned ||= /* @__PURE__ */ new Set();
	for (let r = t; r < e.length; r++) {
		let t = e[r];
		if (!t) continue;
		if (t.type === "pageBreak") break;
		if (t.type === "sectionBreak") {
			let e = t;
			if (e.kind && e.kind !== "continuous") break;
			continue;
		}
		if (t.type !== "paragraph") continue;
		let i = t;
		if (n.pageAnchorPrescanned.has(i)) continue;
		let a = !1;
		for (let e of i.runs) if (e.type === "image") {
			if ($a(e)) {
				a = !0;
				break;
			}
		} else if (e.type === "shape" && $a(e)) {
			a = !0;
			break;
		}
		if (!a) continue;
		let o = n.floatParaSeq++;
		for (let e of i.runs) if (e.type === "image") {
			let t = e;
			if (!$a(t)) continue;
			no(t, n, 0, o);
		} else if (e.type === "shape") {
			let t = e;
			if (!$a(t)) continue;
			ro(t, n, 0, o);
		}
		n.pageAnchorPrescanned.add(i);
	}
}
function no(e, t, n, r) {
	if (!e.anchor || !xn(e.wrapMode)) return;
	let i = e.wrapMode === "topAndBottom" ? "topAndBottom" : "square", a = Za(e, t, n), { w: o, h: s, dl: c, dr: l, dt: u, db: d } = a, f = e.allowOverlap ?? !0, p = li(e.imagePath, e.colorReplaceFrom, e.duotone), m = In(t, {
		x: a.x,
		y: a.y,
		w: o,
		h: s,
		dl: c,
		dr: l,
		dt: u,
		db: d,
		kind: "shape",
		mode: i,
		side: e.wrapSide ?? "bothSides",
		imageKey: p,
		drawn: !1,
		paraId: r,
		avoidOverlap: !0,
		allowOverlap: f
	});
	if (!t.dryRun) {
		let n = t.images.get(p);
		if (n) {
			let r = e.alpha != null && e.alpha < 1;
			r && (t.ctx.save(), t.ctx.globalAlpha *= e.alpha), t.verticalCJK ? ei(t.ctx, m.imageX, m.imageY, m.imageW, m.imageH, (r, i, a, o) => h(t.ctx, n, e.srcRect ?? void 0, r, i, a, o)) : h(t.ctx, n, e.srcRect ?? void 0, m.imageX, m.imageY, m.imageW, m.imageH), r && t.ctx.restore();
		}
		m.drawn = !0;
	}
}
function ro(e, t, n, r) {
	if (!xn(e.wrapMode)) return;
	let { x: i, y: a, w: o, h: s } = Wa(e, t, n);
	if (o <= 0 || s <= 0) return;
	let c = e.wrapMode === "topAndBottom" ? "topAndBottom" : "square", l = t.scale;
	In(t, {
		x: i,
		y: a,
		w: o,
		h: s,
		dl: (e.distLeft ?? 0) * l,
		dr: (e.distRight ?? 0) * l,
		dt: (e.distTop ?? 0) * l,
		db: (e.distBottom ?? 0) * l,
		kind: "shape",
		mode: c,
		side: e.wrapSide ?? "bothSides",
		imageKey: "",
		drawn: !0,
		paraId: r,
		avoidOverlap: !0,
		allowOverlap: !0
	});
}
function io(e, t, n) {
	let { scale: r } = n, i = e, a = t / r, o = i.tableLayoutInputs;
	if (za && o !== void 0 && i.tableColWidthsPt !== void 0 && i.tableRowHeightsPt !== void 0 && o.scale === 1 && i.tableRowHeightsPt.length === e.rows.length && Math.abs(o.contentWPt - a) <= 1e-6 * Math.max(1, Math.abs(a))) {
		let e = i.tableColWidthsPt.map((e) => e * r), t = i.tableRowHeightsPt.map((e) => e * r);
		return {
			colWidths: e,
			tableW: e.reduce((e, t) => e + t, 0),
			rowHeights: t
		};
	}
	let s = fa(e, a, n).map((e) => e * r);
	return {
		colWidths: s,
		tableW: s.reduce((e, t) => e + t, 0),
		rowHeights: qn(e, s, r, (t, i) => ao(t, e, i, r, n))
	};
}
function ao(e, t, n, r, i) {
	let a = mo(e, t), o = n - (a.left + a.right) * r, s = vo(e.content);
	return (a.top + a.bottom) * r + wa(s, (e) => go(i, e, o, r), r);
}
function oo(e, t, n, r, i, a, o) {
	let { scale: s, dryRun: c } = o, l = e.bidiVisual === !0, u = [], d = e.rows.map(() => Array(t.length).fill(-1)), f = a;
	for (let a = 0; a < e.rows.length; a++) {
		let p = e.rows[a], m = r[a], h = i, g = 0;
		for (let _ of p.cells) {
			let v = Math.min(_.colSpan, t.length - g), y = t.slice(g, g + v).reduce((e, t) => e + t, 0), b = l ? i + n - (h - i) - y : h;
			if (_.vMerge !== !1) {
				let n = m, i = a;
				if (_.vMerge === !0) {
					let t = Gn(e, a, g);
					i = t, n = 0;
					for (let e = a; e <= t; e++) n += r[e];
				}
				let l = {
					topRow: a === 0,
					bottomRow: i === e.rows.length - 1,
					leftCol: g === 0,
					rightCol: g + v === t.length
				}, h = p.rowHeightRule === "exact" && _.vMerge !== !0;
				if (c) ho(_, e, y, s, o);
				else {
					let e = u.length;
					u.push({
						cell: _,
						x: b,
						y: f,
						w: y,
						h: n,
						edges: l,
						clipExact: h,
						ci: g,
						ri: a,
						span: v,
						lastRi: i
					});
					for (let n = a; n <= i && n < d.length; n++) for (let r = g; r < g + v && r < t.length; r++) d[n][r] = e;
				}
			}
			h += y, g += v;
		}
		f += m;
	}
	for (let t of u) _o(t.cell, e, t.x, t.y, t.w, t.h, o, t.clipExact);
	let p = o.ctx, m = o.dpr;
	for (let t of u) {
		let { x: n, y: r, w: i, h: a } = t, o = so(t.cell.borders, e.borders, t.edges, l), c = l ? t.edges.rightCol : t.edges.leftCol, f = l ? t.edges.leftCol : t.edges.rightCol, h = l ? t.ci - 1 : t.ci + t.span;
		if (t.edges.topRow) {
			let e = bo(o.top?.spec ?? null);
			e && Co(p, n, r, n + i, r, e, s, m);
		}
		if (c) {
			let e = bo(o.left?.spec ?? null);
			e && Co(p, n, r, n, r + a, e, s, m);
		}
		{
			let c;
			if (t.edges.bottomRow) c = bo(o.bottom?.spec ?? null);
			else {
				let n = co(u, d, t.lastRi + 1, t.ci, l, e.borders);
				c = lo(o.bottom, n?.top ?? null);
			}
			c && Co(p, n, r + a, n + i, r + a, c, s, m);
		}
		{
			let c;
			if (f) c = bo(o.right?.spec ?? null);
			else {
				let n = co(u, d, t.ri, h, l, e.borders);
				c = lo(o.right, n?.left ?? null);
			}
			c && Co(p, n + i, r, n + i, r + a, c, s, m);
		}
	}
	return f;
}
function so(e, t, n, r) {
	let i = (n, r, i) => {
		if (n) return {
			spec: n,
			source: "cell"
		};
		let a = r ? i : e.insideH ?? t.insideH;
		return a ? {
			spec: a,
			source: "table"
		} : null;
	}, a = (n, r, i) => {
		if (n) return {
			spec: n,
			source: "cell"
		};
		let a = r ? i : e.insideV ?? t.insideV;
		return a ? {
			spec: a,
			source: "table"
		} : null;
	};
	return {
		top: i(e.top, n.topRow, t.top),
		bottom: i(e.bottom, n.bottomRow, t.bottom),
		left: r ? a(e.right, n.rightCol, t.right) : a(e.left, n.leftCol, t.left),
		right: r ? a(e.left, n.leftCol, t.left) : a(e.right, n.rightCol, t.right)
	};
}
function co(e, t, n, r, i, a) {
	if (n < 0 || n >= t.length || r < 0 || r >= t[n].length) return null;
	let o = t[n][r];
	if (o < 0) return null;
	let s = e[o];
	return so(s.cell.borders, a, s.edges, i);
}
function lo(e, t) {
	let n = cn(e, t);
	return n ? bo(n.spec) : null;
}
function uo(e, t) {
	let n = e.tblpPr, r = t.y, i = t.contentX, a = t.contentW, { colWidths: o, tableW: s, rowHeights: c } = io(e, t.contentW, t), l = Rn(n, t, r, s, c.reduce((e, t) => e + t, 0)), u = Bn(l, t);
	t.contentX = l.x, t.contentW = s, oo(e, o, s, c, l.x, l.y, t), t.contentX = i, t.contentW = a, t.y = r, zn(l, n, t, u, e.overlap !== "never");
}
function fo(e, t) {
	if (e.tblpPr) {
		uo(e, t);
		return;
	}
	let { contentX: n, contentW: r, scale: i } = t, a = e.tblInd != null && e.jc === "left", { colWidths: o, tableW: s, rowHeights: c } = io(e, a && e.tblInd < 0 ? t.pageWidth * i : r, t), l = e.jc === "center" ? n + Math.max(0, (r - s) / 2) : e.jc === "right" ? n + Math.max(0, r - s) : n;
	if (a) {
		let t = e.tblInd * i;
		l = e.bidiVisual === !0 ? n + r - t - s : n + t;
	}
	t.y = oo(e, o, s, c, l, t.y, t);
}
function po(e, t, n, r) {
	let i = Br(t.runs, e), a = ra(t), o = oa(t, e);
	if (i.length === 0) return xr(t, r, o, a, e.docEastAsian, e.ctx, e.fontFamilyClasses);
	let s = (t.bidi === !0 ? t.indentRight : t.indentLeft) * r, c = (t.bidi === !0 ? t.indentLeft : t.indentRight) * r, l = Math.max(1, n - s - c), u = Vr(e.ctx, i, l, t.indentFirst * r, r, t.tabStops, void 0, e.fontFamilyClasses, s, e.kinsoku, ur(o, r), e.defaultTabPt, t.bidi === !0 ? l + c : l, t.bidi === !0);
	if (r === 1 && !zr(t) && La(t, u, {
		paraW: l,
		firstIndent: t.indentFirst,
		tabOriginPx: s,
		gridDeltaPx: ur(o, 1),
		hasFloats: !1,
		kinsoku: e.kinsoku
	}), a) {
		let e = na(Math.max(0, ...u.map((e) => vr(t.lineSpacing, e.ascent, e.descent, r, o, !0, e.intendedSingle, ia(t)))), o, r);
		return u.length * e;
	}
	return u.reduce((e, n) => e + vr(t.lineSpacing, n.ascent, n.descent, r, o, !1, n.intendedSingle, ia(t)), 0);
}
function mo(e, t) {
	return {
		top: e.marginTop ?? t.cellMarginTop,
		bottom: e.marginBottom ?? t.cellMarginBottom,
		left: e.marginLeft ?? t.cellMarginLeft,
		right: e.marginRight ?? t.cellMarginRight
	};
}
function ho(e, t, n, r, i) {
	let a = mo(e, t), o = a.left * r, s = a.right * r, c = n - o - s;
	for (let t of e.content) go(i, t, c, r);
}
function go(e, t, n, r) {
	if (t.type === "paragraph") {
		let i = t;
		return po(e, i, n, r) + (i.spaceBefore + Math.max(i.spaceAfter, Do(i.borders))) * r;
	}
	return ua(e, t, n / r) * r;
}
function _o(e, t, n, r, i, a, o, s = !1) {
	let { ctx: c, scale: l } = o;
	e.background && (c.fillStyle = `#${e.background}`, c.fillRect(n, r, i, a));
	let u = mo(e, t), d = u.top * l, f = u.bottom * l, p = u.left * l, m = u.right * l, h = {
		...o,
		contentX: n + p,
		contentW: i - p - m,
		y: r + d,
		lineNumbering: void 0,
		lineNumberCounter: void 0,
		containerShading: e.background ?? o.containerShading,
		floats: [],
		floatParaSeq: 0
	};
	if (e.vAlign === "center" || e.vAlign === "bottom") {
		let t = vo(e.content), n = t.reduce((e, t) => e + go(h, t, i - p - m, l), 0), o = t[0], s = t[t.length - 1], c = o && o.type === "paragraph" ? o.spaceBefore * l : 0;
		n -= c, s && s.type === "paragraph" && (n -= s.spaceAfter * l), e.vAlign === "center" ? h.y = r + (a - n) / 2 - c : h.y = r + a - n - f - c;
	}
	s ? (c.save(), c.beginPath(), c.rect(0, r, c.canvas.width, a), c.clip(), yo(e.content, h), c.restore()) : yo(e.content, h);
}
function vo(e) {
	if (e.length < 2) return e;
	let t = e[e.length - 1], n = e[e.length - 2];
	return t.type !== "paragraph" || n.type === "paragraph" || t.runs.length > 0 ? e : e.slice(0, -1);
}
function yo(e, t) {
	let n = null, r = 0;
	for (let i of e) if (i.type === "paragraph") {
		let e = i, a = xa(n, e), o = a ? 0 : e.spaceBefore;
		t.y -= (a ? r : Math.min(r, o)) * t.scale, Pa(e, t, a), n = e, r = e.spaceAfter;
	} else i.type === "table" && (fo(i, t), n = null, r = 0);
}
function bo(e) {
	return !e || e.style === "none" || e.style === "nil" ? null : e;
}
function xo(e, t, n, r, i, o, s, c) {
	e.lineWidth = o;
	let l = n === i, u = t === r, d = l ? 0 : c, f = l ? c : 0, p = u ? a(t + d, o, s) : 0, m = l ? a(n + f, o, s) : 0;
	e.beginPath(), e.moveTo(t + d + p, n + f + m), e.lineTo(r + d + p, i + f + m), e.stroke();
}
function So(t, n) {
	return e(t, n);
}
function Co(e, t, n, r, i, a, o, s = 1) {
	e.save(), e.strokeStyle = a.color ? `#${a.color}` : "#000000";
	let c = Math.max(.5, a.width * o);
	if (a.style === "double") {
		e.fillStyle = e.strokeStyle, Fe(e, t, n, r, i, c, s), e.restore();
		return;
	}
	let l = So(a.style, c);
	l.length && e.setLineDash(l), xo(e, t, n, r, i, c, s, 0), e.restore();
}
function wo(e, t, n, r, i) {
	let a = r;
	for (let r = t; r < n; r++) {
		let t = e[r];
		t.topY !== void 0 && t.topY > a && (a = t.topY), a += i(t);
	}
	return a - r;
}
function To(e, t, n, r, i, a, o) {
	if (!i) return {
		x: e,
		y: t,
		w: n,
		h: r
	};
	let s = (e) => e && e.style !== "none" ? (e.space ?? 0) * o : 0, c = a?.suppressTop ? i.between : i.top, l = s(i.left), u = s(i.right), d = s(c), f = a?.suppressBottom ? 0 : s(i.bottom);
	return {
		x: e - l,
		y: t - d,
		w: n + l + u,
		h: r + d + f
	};
}
function Eo(e, t, n, r, i, a, o, s = 1, c) {
	let l = (t, n, r, i, a) => {
		!t || t.style === "none" || Co(e, n, r, i, a, {
			width: t.width,
			color: t.color,
			style: t.style
		}, o, s);
	}, u = (e) => (e?.space ?? 0) * o, d = c?.suppressTop ? a.between : a.top;
	l(d, t, n - u(d), t + r, n - u(d)), c?.suppressBottom || l(a.bottom, t, n + i + u(a.bottom), t + r, n + i + u(a.bottom)), l(a.left, t - u(a.left), n, t - u(a.left), n + i), l(a.right, t + r + u(a.right), n, t + r + u(a.right), n + i);
}
function Do(e, t) {
	if (!e || t?.suppressBottom) return 0;
	let n = e.bottom;
	return !n || n.style === "none" ? 0 : (n.space ?? 0) + (n.width ?? 0) / 2;
}
function Oo(e, t) {
	let n = (e) => e == null || e.style === "none" ? null : e, r = n(e), i = n(t);
	return r == null || i == null ? r == null && i == null : r.style === i.style && r.width === i.width && (r.space ?? 0) === (i.space ?? 0) && (r.color ?? null) === (i.color ?? null);
}
function ko(e, t) {
	return e == null || t == null ? !1 : Oo(e.top, t.top) && Oo(e.bottom, t.bottom) && Oo(e.left, t.left) && Oo(e.right, t.right) && Oo(e.between, t.between);
}
function Ao(e) {
	if (!e) return !1;
	let t = (e) => e != null && e.style !== "none";
	return t(e.top) || t(e.bottom) || t(e.left) || t(e.right) || t(e.between);
}
function jo(e, t) {
	return !e || !t || e.framePr || t.framePr || !Ao(e.borders) || !Ao(t.borders) ? !1 : ko(e.borders, t.borders);
}
function Mo(e, t) {
	return e.style === t.style && e.width === t.width && (e.space ?? 0) === (t.space ?? 0) && (e.color ?? null) === (t.color ?? null);
}
function No(e) {
	let t = e.text.codePointAt(0) ?? 0, n = e.fontFamily ?? null;
	return P(t) ? e.fontFamilyEastAsia ?? n : n;
}
function Po(e) {
	return ge(e.text, e.fontFamily ?? null);
}
function Fo(e, t) {
	let n = or(t);
	return {
		w: e.picBulletWidthPt ?? n,
		h: e.picBulletHeightPt ?? n
	};
}
function Io(e, t) {
	return or(e) * t;
}
//#endregion
//#region packages/docx/src/bookmark-nav.ts
function Lo(e, t) {
	if (e.type === "paragraph") {
		for (let n of e.bookmarks ?? []) t(n);
		return;
	}
	if (e.type === "table") for (let n of e.rows) for (let e of n.cells) for (let n of e.content) Lo(n, t);
}
function Ro(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n = 0; n < e.length; n++) for (let r of e[n]) Lo(r, (e) => {
		e !== "" && !t.has(e) && t.set(e, n);
	});
	return t;
}
//#endregion
//#region packages/docx/src/google-fonts.ts
var zo = {
	...T,
	...j
};
function* Bo(e) {
	let t = function* (e) {
		for (let t of e) if (t.type === "text") yield t.text;
		else if (t.type === "field") yield t.fallbackText;
		else if (t.type === "shape") for (let e of t.textBlocks ?? []) yield e.text;
	}, n = function* (e) {
		if ("runs" in e && (yield* t(e.runs)), "rows" in e) for (let t of e.rows) for (let e of t.cells) for (let t of e.content) yield* n(t);
	}, r = function* (e) {
		for (let t of e ?? []) yield* n(t);
	};
	yield* r(e.body);
	for (let t of [e.headers, e.footers]) for (let e of [
		t?.default,
		t?.first,
		t?.even
	]) yield* r(e?.body);
	for (let t of [...e.footnotes ?? [], ...e.endnotes ?? []]) yield* r(t.content);
}
function Vo(e) {
	let t = J(e.majorFont) ?? J(e.minorFont) ?? null;
	return [
		e.majorFont,
		e.minorFont,
		...F(Bo(e), t)
	];
}
//#endregion
//#region packages/docx/src/embedded-fonts.ts
async function Ho(e, t) {
	let n = e.embeddedFonts;
	if (!n || n.length === 0) return [];
	let r = (await Promise.all(n.map(async (e) => {
		try {
			let n = await t(e.partPath);
			return {
				family: e.fontName,
				bytes: n,
				odttf: e.partPath.toLowerCase().endsWith(".odttf"),
				fontKey: e.fontKey,
				weight: Uo(e.style),
				style: Wo(e.style)
			};
		} catch {
			return null;
		}
	}))).filter((e) => e !== null);
	return r.length === 0 ? [] : Me(r);
}
function Uo(e) {
	return e === "bold" || e === "boldItalic" ? "bold" : "normal";
}
function Wo(e) {
	return e === "italic" || e === "boldItalic" ? "italic" : "normal";
}
//#endregion
//#region packages/docx/src/document.ts
var Go = class e {
	_document = null;
	_meta = null;
	_pages = null;
	_bookmarkPages = null;
	_mode = "main";
	_worker;
	_bridge;
	_imageCache = /* @__PURE__ */ new Map();
	_embeddedFontFaces = [];
	_googleFontFaces = [];
	_fetchImage = (e, t) => this.getImage(e, t);
	constructor(e, t, n) {
		this._worker = e, this._mode = t, this._bridge = new y(this._worker, {
			correlate: (e) => e.id,
			toError: (e) => e.type === "error" ? e.message : void 0
		});
		let r = new URL(n ?? Wt, location.href).href;
		this._bridge.post({
			type: "init",
			wasmUrl: r
		});
	}
	static async load(t, n = {}) {
		let r = n.mode ?? "main";
		if (r === "worker" && (typeof Worker > "u" || typeof OffscreenCanvas > "u")) throw Error("mode: 'worker' requires Worker and OffscreenCanvas support");
		let i;
		if (typeof t == "string") {
			let e = await fetch(t);
			if (!e.ok) throw Error(`Failed to fetch: ${e.status} ${e.statusText}`);
			i = await e.arrayBuffer();
		} else i = t;
		i = b(await se(i, n.password));
		let a = new e(r === "worker" ? (await import("./render-worker-host-CSA5bTZW.js")).createRenderWorker() : new Ut(), r, n.wasmUrl);
		return n.math && r === "worker" && console.warn("[ooxml] the math engine is unavailable in mode: 'worker'; equations will be skipped. Use mode: 'main' for documents with equations."), await a._parse(i, n.maxZipEntryBytes, r === "worker" ? !!n.useGoogleFonts : !1, n.workerTimeoutMs), r === "main" && n.useGoogleFonts && a._document && (a._googleFontFaces = await ue(Vo(a._document), zo)), r === "main" && a._document?.embeddedFonts?.length && (a._embeddedFontFaces = await Ho(a._document, (e) => a.getFontBytes(e))), r === "main" && n.math && a._document && ii(a._document.body) && await si(a._document.body, n.math), a;
	}
	async _parse(e, t, n = !1, r) {
		let i = await this._bridge.request((r) => this._mode === "worker" ? {
			type: "parse",
			id: r,
			data: e,
			maxZipEntryBytes: t,
			useGoogleFonts: n
		} : {
			type: "parse",
			id: r,
			data: e,
			maxZipEntryBytes: t
		}, [e], { timeoutMs: r });
		if (this._mode === "worker") this._meta = i.meta;
		else {
			let { documentJson: e } = i;
			this._document = JSON.parse(new TextDecoder().decode(new Uint8Array(e)));
		}
	}
	destroy() {
		this._bridge.terminate(), this._document = null, this._meta = null, this._pages = null, this._bookmarkPages = null, this._imageCache.clear(), this._embeddedFontFaces.length > 0 && (Ne(this._embeddedFontFaces), this._embeddedFontFaces = []), this._googleFontFaces.length > 0 && (O(this._googleFontFaces), this._googleFontFaces = []), xe(this._fetchImage), fi(this._fetchImage), de(this._fetchImage);
	}
	async getImage(e, t) {
		let n = this._imageCache.get(e);
		if (n) return n;
		let r = this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		})).then((e) => {
			let n = e.bytes;
			return new Blob([n], { type: t });
		});
		return this._imageCache.set(e, r), r;
	}
	async getFontBytes(e) {
		let t = (await this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		}))).bytes;
		return new Uint8Array(t);
	}
	async toMarkdown() {
		return (await this._bridge.request((e) => ({
			type: "toMarkdown",
			id: e
		}))).markdown;
	}
	get pageCount() {
		return this._meta ? this._meta.pageCount : this._document ? this._getPages().length : 0;
	}
	get mode() {
		return this._mode;
	}
	get document() {
		if (this._meta && !this._document) throw Error("the raw document model stays in the worker in mode: 'worker'; use mode: 'main' if you need direct model access");
		if (!this._document) throw Error("Document not loaded");
		return this._document;
	}
	get comments() {
		return this._meta?.comments ?? this._document?.comments ?? [];
	}
	get footnotes() {
		return this._meta?.footnotes ?? this._document?.footnotes ?? [];
	}
	get endnotes() {
		return this._meta?.endnotes ?? this._document?.endnotes ?? [];
	}
	_getPages() {
		return this._pages ? this._pages : this._document ? (this._pages = $i(this._document), this._pages) : [];
	}
	_getBookmarkPages() {
		return this._bookmarkPages ||= this._meta ? new Map(this._meta.bookmarkPages) : Ro(this._getPages()), this._bookmarkPages;
	}
	getBookmarkPage(e) {
		return this._getBookmarkPages().get(e);
	}
	pageSize(e) {
		if (this._meta) {
			let t = this._meta.pageSizes, n = t[Math.max(0, Math.min(e, t.length - 1))];
			return n ? {
				widthPt: n.widthPt,
				heightPt: n.heightPt
			} : {
				widthPt: 0,
				heightPt: 0
			};
		}
		if (!this._document) return {
			widthPt: 0,
			heightPt: 0
		};
		let t = this._getPages(), n = t[Math.max(0, Math.min(e, t.length - 1))]?.[0]?.sectionGeom;
		return Ci(this._document.section, n?.pageWidth ?? this._document.section.pageWidth, n?.pageHeight ?? this._document.section.pageHeight);
	}
	renderPage(e, t, n = {}) {
		if (this._mode === "worker") throw Error("renderPage(canvas) is unavailable in mode: 'worker'; use renderPageToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this._document) throw Error("Document not loaded");
		let r = this._getPages();
		return Ti(this._document, e, t, {
			...n,
			totalPages: r.length,
			prebuiltPages: r,
			fetchImage: this._fetchImage
		});
	}
	async renderPageToBitmap(e, t = {}) {
		let { onTextRun: n, ...r } = t, i = {
			...r,
			dpr: r.dpr ?? m()
		};
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.pageCount) throw Error(`Page index ${e} out of range (count: ${this.pageCount})`);
			let t = await this._bridge.request((t) => ({
				type: "renderPage",
				id: t,
				pageIndex: e,
				opts: i
			}));
			if (n) for (let e of t.runs) n(e);
			return t.bitmap;
		}
		let a = new OffscreenCanvas(1, 1);
		return await this.renderPage(a, e, {
			...i,
			onTextRun: n
		}), a.transferToImageBitmap();
	}
	async collectPageRuns(e, t = {}) {
		let n = {
			...t,
			dpr: t.dpr ?? m()
		};
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.pageCount) throw Error(`Page index ${e} out of range (count: ${this.pageCount})`);
			return (await this._bridge.request((t) => ({
				type: "collectRuns",
				id: t,
				pageIndex: e,
				opts: n
			}))).runs;
		}
		let r = [], i = typeof OffscreenCanvas < "u" ? new OffscreenCanvas(1, 1) : globalThis.document?.createElement("canvas");
		return await this.renderPage(i, e, {
			...n,
			onTextRun: (e) => r.push(e)
		}), r;
	}
};
//#endregion
//#region packages/docx/src/tate-chu-yoko-overlay.ts
function Ko(e, t) {
	if (!e.eastAsianVert) return 1;
	let n = t(e.text);
	return !(n > 0) || e.w >= n ? 1 : e.w / n;
}
//#endregion
//#region packages/docx/src/text-layer.ts
function qo(e, t, n, r, i, a) {
	e.innerHTML = "", e.style.width = n, e.style.height = r;
	for (let n of t) {
		let t = document.createElement("span");
		t.textContent = n.text;
		let r = n.transform ?? "";
		if (a && n.eastAsianVert) {
			let e = Ko(n, a(n.font));
			e !== 1 && (r = `${r ? `${r} ` : ""}scaleX(${e})`);
		}
		let o = r ? `transform:${r};transform-origin:top left;` : "", s = i ? n.hyperlink : void 0, c = s ? "pointer" : "text";
		t.style.cssText = `position:absolute;left:${n.x}px;top:${n.y}px;font:${n.font};line-height:${n.h}px;letter-spacing:0;` + o + `white-space:pre;color:transparent;cursor:${c};pointer-events:all;`, s && i && (t.title = s.kind === "external" ? s.url : s.ref, t.addEventListener("click", () => i(s))), e.appendChild(t);
	}
}
function Jo(e, t, n, r, i, a, o = {}) {
	e.innerHTML = "", e.style.width = r, e.style.height = i;
	let s = o.match ?? "rgba(255, 214, 0, 0.42)", c = o.active ?? "rgba(255, 140, 0, 0.55)";
	for (let r of n) {
		let n = r.active ? c : s;
		for (let i of r.slices) {
			let r = t[i.runIndex];
			if (!r) continue;
			let o = a(r.font), s = Te(r.text, i.start, i.end, o), c = Ko(r, o), l = s.x * c, u = s.width * c;
			if (u <= 0) continue;
			let d = document.createElement("div"), f = r.transform ? `transform:${r.transform};transform-origin:top left;` : "";
			d.style.cssText = `position:absolute;left:${r.x + l}px;top:${r.y}px;width:${u}px;height:${r.h}px;` + f + `background:${n};pointer-events:none;`, e.appendChild(d);
		}
	}
}
//#endregion
//#region packages/docx/src/find.ts
var Yo = class {
	_pageRuns = /* @__PURE__ */ new Map();
	_matches = [];
	_active = -1;
	constructor(e, t) {
		this._pageCount = e, this._collectPageRuns = t;
	}
	invalidate() {
		this._pageRuns.clear(), this._matches = [], this._active = -1;
	}
	pageRuns(e) {
		return this._pageRuns.get(e);
	}
	setPageRuns(e, t) {
		this._pageRuns.set(e, t);
	}
	_matchAt(e) {
		return this._matches[e];
	}
	pageHighlights(e) {
		let t = [];
		for (let n = 0; n < this._matches.length; n++) {
			let r = this._matches[n];
			r.page === e && t.push({
				slices: r.slices,
				active: n === this._active
			});
		}
		return t;
	}
	activePage() {
		let e = this._matchAt(this._active);
		return e ? e.page : null;
	}
	matches() {
		return this._matches.map((e, t) => ({
			matchIndex: t,
			text: e.text,
			location: { page: e.page }
		}));
	}
	async find(e, t = {}) {
		if (this._matches = [], this._active = -1, e.length === 0) return [];
		let n = this._pageCount();
		for (let r = 0; r < n; r++) {
			let n = await this._ensurePageRuns(r), i = te(n);
			for (let a of R(i, e, t)) {
				let e = a.slices.map((e) => n[e.runIndex].text.slice(e.start, e.end)).join("");
				this._matches.push({
					page: r,
					text: e,
					slices: a.slices
				});
			}
		}
		return this.matches();
	}
	next() {
		return this._active = Y(this._active, this._matches.length), this._activePublic();
	}
	prev() {
		return this._active = G(this._active, this._matches.length), this._activePublic();
	}
	_activePublic() {
		let e = this._matchAt(this._active);
		return e ? {
			matchIndex: this._active,
			text: e.text,
			location: { page: e.page }
		} : null;
	}
	async _ensurePageRuns(e) {
		let t = this._pageRuns.get(e);
		if (t) return t;
		let n = await this._collectPageRuns(e);
		return this._pageRuns.set(e, n), n;
	}
}, Xo = class {
	_doc = null;
	_currentPage = 0;
	_scale = null;
	_canvas;
	_wrapper;
	_originalParent = null;
	_originalNextSibling = null;
	_originalDisplay = "";
	_textLayer = null;
	_highlightLayer = null;
	_find;
	_measureCtx = null;
	_opts;
	_mode;
	_bitmapCtx = null;
	_destroyed = !1;
	_loadGen = 0;
	constructor(e, t = {}) {
		this._canvas = e, this._opts = t, this._mode = t.mode ?? "main";
		let n = e.parentElement;
		this._originalParent = n, this._originalNextSibling = e.nextSibling, this._originalDisplay = e.style.display, this._wrapper = document.createElement("div"), this._wrapper.style.cssText = "position:relative;display:inline-block;vertical-align:top;", e.style.display || (e.style.display = "block"), n && n.insertBefore(this._wrapper, e), this._wrapper.appendChild(e), this._mode === "worker" && (this._bitmapCtx = e.getContext("bitmaprenderer")), t.enableTextSelection && (this._textLayer = document.createElement("div"), this._textLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", this._wrapper.appendChild(this._textLayer)), this._highlightLayer = document.createElement("div"), this._highlightLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;", this._wrapper.appendChild(this._highlightLayer), this._find = new Yo(() => this.pageCount, (e) => this._collectPageRuns(e));
	}
	async load(e) {
		let t = ++this._loadGen, n = this._doc;
		try {
			let r = await Go.load(e, {
				useGoogleFonts: this._opts.useGoogleFonts,
				maxZipEntryBytes: this._opts.maxZipEntryBytes,
				workerTimeoutMs: this._opts.workerTimeoutMs,
				wasmUrl: this._opts.wasmUrl,
				math: this._opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			this._doc = r, n?.destroy(), this._currentPage = 0, this._find.invalidate(), await this._render();
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this._opts.onError) {
				this._opts.onError(n);
				return;
			}
			throw n;
		}
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	get currentPage() {
		return this._currentPage;
	}
	get canvasElement() {
		return this._canvas;
	}
	async goToPage(e) {
		this._doc && (this._currentPage = Math.max(0, Math.min(e, this.pageCount - 1)), await this._render());
	}
	async nextPage() {
		await this.goToPage(this._currentPage + 1);
	}
	async prevPage() {
		await this.goToPage(this._currentPage - 1);
	}
	_naturalWidthPx() {
		return !this._doc || this._doc.pageCount === 0 ? 0 : this._doc.pageSize(this._currentPage).widthPt * k;
	}
	_renderWidth() {
		if (this._scale === null) return this._opts.width;
		let e = this._naturalWidthPx();
		return e <= 0 ? this._opts.width : Math.round(e * this._scale);
	}
	getScale() {
		if (this._scale !== null) return this._scale;
		let e = this._naturalWidthPx();
		return e <= 0 ? 1 : this._opts.width && this._opts.width > 0 ? this._opts.width / e : 1;
	}
	_zoomMin() {
		return this._opts.zoomMin ?? .1;
	}
	_zoomMax() {
		return this._opts.zoomMax ?? 4;
	}
	async setScale(e) {
		let t = ne(e, this._zoomMin(), this._zoomMax()), n = t !== this.getScale();
		this._scale = t, await this._render(), n && this._opts.onScaleChange?.(t);
	}
	async zoomIn() {
		await this.setScale(M(this.getScale()));
	}
	async zoomOut() {
		await this.setScale(q(this.getScale()));
	}
	async fitWidth() {
		await this._fit("width");
	}
	async fitPage() {
		await this._fit("page");
	}
	async _fit(e) {
		if (!this._doc || this._doc.pageCount === 0) return;
		let t = this._doc.pageSize(this._currentPage), n = this._fitContainer();
		if (!n) return;
		let r = A({
			contentWidth: t.widthPt * k,
			contentHeight: t.heightPt * k,
			containerWidth: n.clientWidth,
			containerHeight: n.clientHeight
		}, e);
		r <= 0 || await this.setScale(r);
	}
	_fitContainer() {
		return this._opts.container ?? this._wrapper.parentElement ?? null;
	}
	async findText(e, t = {}) {
		if (!this._doc) return [];
		let n = await this._find.find(e, t);
		return this._redrawHighlights(), n;
	}
	async findNext() {
		return this._activateMatch(this._find.next());
	}
	async findPrev() {
		return this._activateMatch(this._find.prev());
	}
	clearFind() {
		this._find.invalidate(), this._redrawHighlights();
	}
	async _activateMatch(e) {
		return e ? (e.location.page === this._currentPage ? this._redrawHighlights() : await this.goToPage(e.location.page), e) : (this._redrawHighlights(), null);
	}
	_redrawHighlights() {
		let e = this._find.pageRuns(this._currentPage) ?? [];
		this._buildHighlightLayer(e);
	}
	destroy() {
		if (this._destroyed = !0, this._loadGen++, this._doc?.destroy(), this._doc = null, this._find.invalidate(), this._originalParent) {
			let e = this._originalNextSibling && this._originalNextSibling.parentNode === this._originalParent ? this._originalNextSibling : null;
			this._originalParent.insertBefore(this._canvas, e);
		} else this._canvas.parentNode && this._canvas.parentNode.removeChild(this._canvas);
		this._canvas.style.display = this._originalDisplay, this._wrapper.remove();
	}
	async _render() {
		try {
			await this._renderPage();
		} catch (e) {
			this._reportRenderError(e);
		}
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] DocxViewer render failed:", t);
	}
	async _renderPage() {
		if (!this._doc) return;
		let e = this._mode === "worker", t = this._renderWidth(), n = [], r = (e) => n.push(e);
		if (e) {
			let e = this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1), n = await this._doc.renderPageToBitmap(this._currentPage, {
				width: t,
				dpr: this._opts.dpr,
				defaultTextColor: this._opts.defaultTextColor,
				showTrackChanges: this._opts.showTrackChanges,
				currentDate: this._opts.currentDate,
				onTextRun: r
			});
			this._canvas.width = n.width, this._canvas.height = n.height, this._canvas.style.width = `${Math.round(n.width / e)}px`, this._canvas.style.height = `${Math.round(n.height / e)}px`, this._bitmapCtx?.transferFromImageBitmap(n);
		} else await this._doc.renderPage(this._canvas, this._currentPage, {
			...this._opts,
			width: t,
			onTextRun: r
		});
		this._textLayer && this._buildTextLayer(this._textLayer, n), this._find.setPageRuns(this._currentPage, n), this._buildHighlightLayer(n), this._opts.onPageChange?.(this._currentPage, this.pageCount);
	}
	_buildHighlightLayer(e) {
		let t = this._highlightLayer;
		if (!t) return;
		let n = this._canvas.style.width || this._canvas.width + "px", r = this._canvas.style.height || this._canvas.height + "px";
		Jo(t, e, this._find.pageHighlights(this._currentPage), n, r, (e) => this._measureForFont(e));
	}
	_measureForFont(e) {
		this._measureCtx ||= document.createElement("canvas").getContext("2d");
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	async _collectPageRuns(e) {
		return this._doc ? this._doc.collectPageRuns(e, {
			width: this._renderWidth(),
			dpr: this._opts.dpr,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			currentDate: this._opts.currentDate
		}) : [];
	}
	_buildTextLayer(e, t) {
		qo(e, t, this._canvas.style.width || this._canvas.width + "px", this._canvas.style.height || this._canvas.height + "px", this._hyperlinkHandler(), (e) => this._measureForFont(e));
	}
	_hyperlinkHandler() {
		return this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				V(e.url);
				return;
			}
			let t = this._doc?.getBookmarkPage(e.ref);
			t !== void 0 && this.goToPage(t);
		});
	}
}, Zo = 150, Qo = "0 1px 3px rgba(0,0,0,0.2)", $o = class {
	_doc = null;
	_injected;
	_opts;
	_container;
	_wrapper;
	_scrollHost;
	_spacer;
	_mode;
	_scale = 1;
	_scaleEstablished = !1;
	_pendingScale = null;
	_slots = /* @__PURE__ */ new Map();
	_free = [];
	_heights = [];
	_lastRange = null;
	_lastTopIndex = -1;
	_scrollListener = null;
	_destroyed = !1;
	_measureCtx;
	_loadGen = 0;
	_bitmapInFlight = /* @__PURE__ */ new Set();
	_renderEpoch = 0;
	_settleTimer = null;
	_wheelListener = null;
	_pendingZoomAnchor = null;
	_resizeObserver = null;
	_prevBase = 0;
	_lastFitWidth = 0;
	_pageShadow;
	constructor(e, t = {}) {
		if (e.tagName === "CANVAS") throw Error("DocxScrollViewer takes a container element (e.g. a <div>), not a <canvas> — the viewer creates and manages its own canvases. Pass a block container; for the single-page canvas API use DocxViewer.");
		if (this._container = e, this._opts = t, this._pageShadow = t.pageShadow ?? Qo, this._injected = !!t.document, this._injected) {
			let e = t.document;
			if (t.mode !== void 0 && t.mode !== e.mode) throw Error(`DocxScrollViewer: opts.mode='${t.mode}' conflicts with the injected engine's mode='${e.mode}'. Omit opts.mode when injecting an engine — the engine owns its render mode.`);
			this._doc = e, this._mode = e.mode;
		} else this._mode = t.mode ?? "main";
		this._wrapper = document.createElement("div"), this._wrapper.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;", this._scrollHost = document.createElement("div"), this._scrollHost.style.cssText = "position:absolute;inset:0;overflow:auto;", t.background && (this._scrollHost.style.background = t.background), this._spacer = document.createElement("div"), this._spacer.style.cssText = "position:absolute;top:0;left:0;width:1px;height:0;pointer-events:none;", this._scrollHost.appendChild(this._spacer), this._wrapper.appendChild(this._scrollHost), this._container.appendChild(this._wrapper), this._scrollListener = () => this._onScroll(), this._scrollHost.addEventListener("scroll", this._scrollListener), this._opts.enableZoom !== !1 && (this._wheelListener = (e) => {
			if (!(e.ctrlKey || e.metaKey) || (e.preventDefault(), e.deltaY === 0)) return;
			let t = this._scrollHost.getBoundingClientRect(), n = e.clientX - t.left, r = e.clientY - t.top;
			this._pendingZoomAnchor = Number.isFinite(n) && Number.isFinite(r) ? {
				x: n,
				y: r
			} : null, this.setScale(I(this._scale, e.deltaY));
		}, this._scrollHost.addEventListener("wheel", this._wheelListener, { passive: !1 })), typeof ResizeObserver < "u" && (this._resizeObserver = new ResizeObserver(() => this._onResize()), this._resizeObserver.observe(this._container)), this._injected && this.relayout();
	}
	async load(e) {
		if (this._injected) throw Error("DocxScrollViewer.load() is unsupported when an engine is injected via opts.document; the injected engine is already loaded.");
		let t = ++this._loadGen, n = this._doc;
		try {
			let r = await Go.load(e, {
				useGoogleFonts: this._opts.useGoogleFonts,
				maxZipEntryBytes: this._opts.maxZipEntryBytes,
				workerTimeoutMs: this._opts.workerTimeoutMs,
				wasmUrl: this._opts.wasmUrl,
				math: this._opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			if (this._doc = r, n?.destroy(), n) {
				for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
				this._lastTopIndex = -1;
			}
			this.relayout();
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this._opts.onError) {
				this._opts.onError(n);
				return;
			}
			throw n;
		}
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	_pageWidthPx(e) {
		return this._doc.pageSize(e).widthPt * k * this._scale;
	}
	_pageHeightPx(e) {
		return this._doc.pageSize(e).heightPt * k * this._scale;
	}
	_fitWidthPx() {
		if (this._opts.width && this._opts.width > 0) return this._opts.width;
		let e = this._container.clientWidth || this._scrollHost.clientWidth;
		if (e <= 0) return 0;
		let { left: t, right: n } = this._padH(), r = e - t - n;
		return r > 0 ? r : 0;
	}
	_baseScale() {
		if (!this._doc || this._doc.pageCount === 0) return 0;
		let e = this._fitWidthPx();
		if (e <= 0) return 0;
		let t = this._doc.pageSize(0).widthPt;
		return t <= 0 ? 0 : e / (t * k);
	}
	relayout() {
		if (this._doc) {
			if (!this._scaleEstablished) {
				let e = this._baseScale();
				if (e > 0) {
					if (this._scale = e, this._prevBase = e, this._lastFitWidth = this._fitWidthPx(), this._scaleEstablished = !0, this._pendingScale !== null) {
						let e = this._pendingScale;
						this._pendingScale = null, e !== this._scale && (this._scale = e, this._opts.onScaleChange?.(e));
					}
				} else return;
			}
			this._recomputeHeights(), this._syncSpacer(), this._mountVisible();
		}
	}
	_recomputeHeights() {
		let e = this._doc.pageCount, t = Array(e);
		for (let n = 0; n < e; n++) t[n] = this._pageHeightPx(n);
		this._heights = t;
	}
	_gap() {
		return this._opts.gap ?? 16;
	}
	_overscan() {
		return this._opts.overscan ?? 1;
	}
	_pad() {
		let e = this._gap();
		return {
			leading: this._opts.paddingTop ?? e,
			trailing: this._opts.paddingBottom ?? e
		};
	}
	_padH() {
		let e = this._gap();
		return {
			left: this._opts.paddingLeft ?? e,
			right: this._opts.paddingRight ?? e
		};
	}
	_pageIndexAtOffset(e, t) {
		let { offsets: n } = e, r = 0, i = n.length - 1, a = 0;
		for (; r <= i;) {
			let e = r + i >> 1;
			n[e] <= t ? (a = e, r = e + 1) : i = e - 1;
		}
		return a;
	}
	_range() {
		return be(this._heights, this._gap(), this._scrollHost.scrollTop, this._scrollHost.clientHeight, this._overscan(), this._pad());
	}
	_syncSpacer() {
		let e = this._range();
		this._lastRange = e, this._spacer.style.height = `${e.totalHeight}px`, this._syncSpacerWidth();
	}
	_syncSpacerWidth() {
		let { left: e, right: t } = this._padH(), n = 0;
		for (let e = 0; e < this._heights.length; e++) {
			let t = this._pageWidthPx(e);
			t > n && (n = t);
		}
		this._spacer.style.width = `${n + e + t}px`;
	}
	_onScroll() {
		!this._doc || !this._scaleEstablished || this._mountVisible();
	}
	_mountVisible() {
		if (!this._doc || this._doc.pageCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) if (this._slots.has(t)) this._positionSlot(this._slots.get(t), t, e);
		else {
			let n = this._acquireSlot();
			this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisiblePageChange?.(e.topIndex, this._doc.pageCount));
	}
	_applyPageShadow(e) {
		this._pageShadow !== !1 && (e.style.boxShadow = this._pageShadow);
	}
	_acquireSlot() {
		let e = this._free.pop();
		if (e) return this._scrollHost.appendChild(e.wrapper), e;
		let t = document.createElement("div");
		t.style.cssText = "position:absolute;";
		let n = document.createElement("canvas");
		n.style.cssText = "display:block;background:#fff;", this._applyPageShadow(n), t.appendChild(n);
		let r = null;
		return this._opts.enableTextSelection && (r = document.createElement("div"), r.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", t.appendChild(r)), this._scrollHost.appendChild(t), {
			wrapper: t,
			canvas: n,
			textLayer: r,
			renderedPage: -1,
			renderedScale: -1,
			bitmap: null,
			bitmapCtx: null
		};
	}
	_recycleSlot(e, t) {
		this._slots.delete(e), t.bitmap &&= (t.bitmap.close(), null), t.textLayer && (t.textLayer.innerHTML = "", t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = ""), t.renderedPage = -1, t.renderedScale = -1, t.wrapper.remove(), this._free.push(t);
	}
	_positionSlot(e, t, n) {
		e.wrapper.style.top = `${n.offsets[t]}px`;
		let r = this._pageWidthPx(t), i = this._pageHeightPx(t);
		e.wrapper.style.width = `${r}px`, e.wrapper.style.height = `${i}px`;
		let { left: a } = this._padH(), o = this._scrollHost.clientWidth;
		e.wrapper.style.left = `${Math.max(a, (o - r) / 2)}px`;
	}
	_dpr() {
		return this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1);
	}
	_renderSlot(e, t) {
		if (!this._doc || t.renderedPage === e) return;
		t.renderedPage = e;
		let n = this._dpr(), r = this._pageWidthPx(e), i = this._renderEpoch, a = this._scale;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, a);
			return;
		}
		let o = [], s = !!this._opts.enableTextSelection && !!t.textLayer, c = s ? (e) => o.push(e) : void 0;
		this._doc.renderPage(t.canvas, e, {
			width: r,
			dpr: n,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			onTextRun: c
		}).then(() => {
			i !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e || (t.renderedScale = a, s && t.textLayer && qo(t.textLayer, o, t.canvas.style.width || `${t.canvas.width}px`, t.canvas.style.height || `${t.canvas.height}px`, this._hyperlinkHandler(), (e) => this._measureForFont(e)));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	_hyperlinkHandler() {
		return this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				V(e.url);
				return;
			}
			let t = this._doc?.getBookmarkPage(e.ref);
			t !== void 0 && this.scrollToPage(t);
		});
	}
	_measureForFont(e) {
		this._measureCtx === void 0 && (this._measureCtx = document.createElement("canvas").getContext("2d"));
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] DocxScrollViewer render failed:", t);
	}
	async _renderSlotBitmap(e, t, n, r, i) {
		if (this._bitmapInFlight.has(e) || this._slots.get(e) !== t) return;
		let a = this._renderEpoch;
		this._bitmapInFlight.add(e);
		let o = !1;
		t.bitmapCtx ||= t.canvas.getContext("bitmaprenderer");
		let s = !!this._opts.enableTextSelection && !!t.textLayer, c = [];
		try {
			let l = await this._doc.renderPageToBitmap(e, {
				width: n,
				dpr: r,
				defaultTextColor: this._opts.defaultTextColor,
				showTrackChanges: this._opts.showTrackChanges,
				onTextRun: s ? (e) => c.push(e) : void 0
			});
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e) {
				l.close();
				return;
			}
			t.bitmap && t.bitmap.close(), t.bitmap = l, t.canvas.width = l.width, t.canvas.height = l.height, t.canvas.style.width = `${Math.round(l.width / r)}px`, t.canvas.style.height = `${Math.round(l.height / r)}px`, t.bitmapCtx?.transferFromImageBitmap(l), t.bitmap = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", s && qo(t.textLayer, c, t.canvas.style.width || `${t.canvas.width}px`, t.canvas.style.height || `${t.canvas.height}px`, this._hyperlinkHandler(), (e) => this._measureForFont(e))), o = !0;
		} catch (e) {
			this._reportRenderError(e);
		} finally {
			this._bitmapInFlight.delete(e);
			let n = this._slots.get(e);
			!o && n && (n !== t || a !== this._renderEpoch) && !this._bitmapInFlight.has(e) && !this._destroyed && this._renderSlotBitmap(e, n, this._pageWidthPx(e), this._dpr(), this._scale);
		}
	}
	setScale(e) {
		let t = this._opts.zoomMin ?? .1, n = this._opts.zoomMax ?? 4, r = Math.min(n, Math.max(t, e)), i = this._pendingZoomAnchor;
		if (this._pendingZoomAnchor = null, !this._doc || this._doc.pageCount === 0 || !this._scaleEstablished) {
			this._pendingScale = r;
			return;
		}
		if (r === this._scale) return;
		let a = this._scale, o = i ? i.y : 0, s = this._range(), c = this._scrollHost.scrollTop + o, l = this._pageIndexAtOffset(s, c), u = this._heights[l] || 0, d = u > 0 ? (c - s.offsets[l]) / u : 0;
		d = Math.min(1, Math.max(0, d));
		let f = this._padH().left, p = this._scrollHost.scrollLeft || 0;
		this._renderEpoch++, this._scale = r, this._recomputeHeights();
		let m = be(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad());
		this._spacer.style.height = `${m.totalHeight}px`, this._syncSpacerWidth();
		let h = Math.max(0, m.totalHeight - this._scrollHost.clientHeight), g = (m.offsets[l] ?? 0) + d * (this._heights[l] || 0);
		if (this._scrollHost.scrollTop = Math.min(h, Math.max(0, g - o)), i) {
			let e = Math.max(0, (this._spacer.offsetWidth || 0) - this._scrollHost.clientWidth);
			this._scrollHost.scrollLeft = U(p, i.x - f, a, r, { maxScroll: e });
		}
		this._previewVisible(), this._scheduleSettle(), this._opts.onScaleChange?.(r);
	}
	getScale() {
		return this._scaleEstablished ? this._scale : this._pendingScale ?? 1;
	}
	zoomIn() {
		this.setScale(M(this.getScale()));
	}
	zoomOut() {
		this.setScale(q(this.getScale()));
	}
	fitWidth() {
		this._fit("width");
	}
	fitPage() {
		this._fit("page");
	}
	_fit(e) {
		if (!this._doc || this._doc.pageCount === 0) return;
		let t = this._doc.pageSize(0), n = A({
			contentWidth: t.widthPt * k,
			contentHeight: t.heightPt * k,
			containerWidth: this._fitWidthPx(),
			containerHeight: this._scrollHost.clientHeight
		}, e);
		n <= 0 || this.setScale(n);
	}
	_previewVisible() {
		if (!this._doc || this._doc.pageCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) {
			let n = this._slots.get(t);
			if (n) this._previewSlot(n, t, e);
			else {
				let n = this._acquireSlot();
				this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
			}
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisiblePageChange?.(e.topIndex, this._doc.pageCount));
	}
	_previewSlot(e, t, n) {
		if (this._positionSlot(e, t, n), e.canvas.style.width = `${this._pageWidthPx(t)}px`, e.canvas.style.height = `${this._pageHeightPx(t)}px`, e.textLayer && e.renderedScale > 0) {
			let t = this._scale / e.renderedScale;
			e.textLayer.style.transformOrigin = "0 0", e.textLayer.style.transform = `scale(${t})`;
		}
	}
	_scheduleSettle() {
		this._settleTimer !== null && clearTimeout(this._settleTimer), this._settleTimer = setTimeout(() => {
			this._settleTimer = null, this._settleRender();
		}, Zo);
	}
	_settleRender() {
		if (!(this._destroyed || !this._doc || this._doc.pageCount === 0)) for (let [e, t] of [...this._slots]) t.renderedScale !== this._scale && this._settleSlot(e, t);
	}
	_settleSlot(e, t) {
		if (!this._doc) return;
		let n = this._dpr(), r = this._pageWidthPx(e), i = this._scale, a = this._renderEpoch;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, i);
			return;
		}
		let o = document.createElement("canvas");
		o.style.cssText = "display:block;background:#fff;", this._applyPageShadow(o);
		let s = [], c = !!this._opts.enableTextSelection && !!t.textLayer, l = c ? (e) => s.push(e) : void 0;
		this._doc.renderPage(o, e, {
			width: r,
			dpr: n,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			onTextRun: l
		}).then(() => {
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e) return;
			let n = t.canvas;
			t.wrapper.insertBefore(o, n), n.remove(), t.canvas = o, t.bitmapCtx = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", c && qo(t.textLayer, s, o.style.width || `${o.width}px`, o.style.height || `${o.height}px`, this._hyperlinkHandler(), (e) => this._measureForFont(e)));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	scrollToPage(e, t) {
		if (!this._doc || this._doc.pageCount === 0 || !this._scaleEstablished) return;
		let n = Math.max(0, Math.min(e, this._doc.pageCount - 1)), r = be(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad()), i = r.offsets[n] ?? 0, a = Math.max(0, r.totalHeight - this._scrollHost.clientHeight), o = Math.min(a, Math.max(0, i)), s = this._scrollHost;
		typeof s.scrollTo == "function" ? s.scrollTo({
			top: o,
			behavior: t?.behavior ?? "auto"
		}) : this._scrollHost.scrollTop = o, this._mountVisible();
	}
	_onResize() {
		if (!this._doc || this._doc.pageCount === 0) return;
		if (!this._scaleEstablished) {
			this.relayout();
			return;
		}
		let e = this._baseScale();
		if (e <= 0) return;
		let t = this._fitWidthPx();
		if (t === this._lastFitWidth) {
			this._mountVisible();
			return;
		}
		this._lastFitWidth = t;
		let n = this._prevBase > 0 ? this._scale / this._prevBase : 1;
		this._prevBase = e, this.setScale(e * n), this._mountVisible();
	}
	get topVisiblePage() {
		return this._lastRange?.topIndex ?? 0;
	}
	mountedPageIndicesForTest() {
		return [...this._slots.keys()];
	}
	scaleForTest() {
		return this._scale;
	}
	baseScaleForTest() {
		return this._baseScale();
	}
	renderEpochForTest() {
		return this._renderEpoch;
	}
	resizeForTest() {
		this._onResize();
	}
	contentAtViewportYForTest(e) {
		let t = this._range(), n = this._scrollHost.scrollTop + e, r = this._pageIndexAtOffset(t, n), i = this._heights[r] || 0;
		return {
			page: r,
			frac: i > 0 ? Math.min(1, Math.max(0, (n - t.offsets[r]) / i)) : 0
		};
	}
	viewportYOfForTest(e, t) {
		return (this._range().offsets[e] ?? 0) + t * (this._heights[e] || 0) - this._scrollHost.scrollTop;
	}
	destroy() {
		this._destroyed = !0, this._loadGen++, this._scrollListener &&= (this._scrollHost.removeEventListener("scroll", this._scrollListener), null), this._wheelListener &&= (this._scrollHost.removeEventListener("wheel", this._wheelListener), null), this._resizeObserver?.disconnect(), this._resizeObserver = null, this._settleTimer !== null && (clearTimeout(this._settleTimer), this._settleTimer = null);
		for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
		this._free.length = 0, this._injected || this._doc?.destroy(), this._doc = null, this._wrapper.remove();
	}
};
//#endregion
//#region packages/docx/src/types.ts
function es(e) {
	let t = [];
	for (let n of e.content) {
		if (n.type !== "paragraph") continue;
		let e = "";
		for (let t of n.runs) t.type === "text" && !t.noteRef && (e += t.text);
		e = e.trim(), e && t.push(e);
	}
	return t.join(" ");
}
//#endregion
//#region src/docx.ts
var ts = /* @__PURE__ */ o({
	DocxDocument: () => Go,
	DocxScrollViewer: () => $o,
	DocxViewer: () => Xo,
	OoxmlError: () => c,
	autoResize: () => ee,
	buildDocxHighlightLayer: () => Jo,
	buildDocxTextLayer: () => qo,
	noteText: () => es,
	openExternalHyperlink: () => V
});
//#endregion
export { Jo as a, Xo as i, es as n, qo as o, $o as r, Go as s, ts as t };
