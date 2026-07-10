import { D as e, L as t, V as n, Z as r, et as i, g as a } from "./find-cursor-DgyGlCIw.js";
//#region packages/core/src/fonts/symbol-font.ts
var o = {
	167: "♣",
	168: "♦",
	169: "♥",
	170: "♠",
	171: "↔",
	172: "←",
	173: "↑",
	174: "→",
	175: "↓",
	183: "•",
	184: "÷",
	185: "≠",
	180: "×",
	176: "°",
	177: "±",
	163: "≤",
	179: "≥"
}, s = {
	33: "✏",
	34: "✂",
	36: "👓",
	74: "☺",
	75: "😐",
	76: "☹",
	118: "❖",
	167: "▪",
	108: "●",
	110: "■",
	116: "◆",
	119: "◆",
	251: "✗",
	252: "✓",
	253: "☒",
	254: "☑",
	223: "←",
	224: "→",
	225: "↑",
	226: "↓",
	227: "↖",
	228: "↗",
	229: "↙",
	230: "↘"
};
function c(e) {
	let t = {};
	for (let n of Object.keys(e)) {
		let r = Number(n);
		t[r] = e[r], t[61440 + r] = e[r];
	}
	return t;
}
var l = c(o), u = c(s);
function d(e, t) {
	if (!t) return e;
	let n = t.trim().toLowerCase(), r = n === "wingdings" ? u : n === "symbol" ? l : null;
	return r ? r[e.charCodeAt(0)] ?? e : e;
}
function f(e) {
	if (!e) return !1;
	let t = e.toLowerCase();
	return t === "symbol" || t.includes("wingdings");
}
function p(e, t) {
	if (!f(t) || e.length === 0) return [{
		text: e,
		mapped: !1
	}];
	let n = [], r = "", i = null;
	for (let a of e) {
		let e = d(a, t), o = e !== a;
		i === null || o === i ? (i = o, r += e) : (n.push({
			text: r,
			mapped: i
		}), i = o, r = e);
	}
	return r.length > 0 && n.push({
		text: r,
		mapped: i ?? !1
	}), n;
}
//#endregion
//#region packages/core/src/shape/custGeom.ts
function m(e, t, n, r, i, a) {
	for (let o of t) {
		let t = 0, s = 0;
		for (let c of o) switch (c.cmd) {
			case "moveTo":
				e.moveTo(n + c.x * i, r + c.y * a), t = c.x, s = c.y;
				break;
			case "lineTo":
				e.lineTo(n + c.x * i, r + c.y * a), t = c.x, s = c.y;
				break;
			case "cubicBezTo":
				e.bezierCurveTo(n + c.x1 * i, r + c.y1 * a, n + c.x2 * i, r + c.y2 * a, n + c.x * i, r + c.y * a), t = c.x, s = c.y;
				break;
			case "arcTo": {
				let o = c.wr * i, l = c.hr * a;
				if (o <= 0 || l <= 0) break;
				let u = c.stAng * Math.PI / 180, d = c.swAng * Math.PI / 180, f = n + t * i, p = r + s * a, m = f - o * Math.cos(u), h = p - l * Math.sin(u), g = u + d;
				e.ellipse(m, h, o, l, 0, u, g, d < 0), t = (m + o * Math.cos(g) - n) / i, s = (h + l * Math.sin(g) - r) / a;
				break;
			}
			case "close":
				e.closePath();
				break;
		}
	}
}
//#endregion
//#region packages/core/src/shape/preset.ts
function h(e, t, n, r, i, a, o, s = -Math.PI / 2) {
	let c = a * 2;
	for (let l = 0; l < c; l++) {
		let c = s + l * Math.PI / a, u = l % 2 == 0 ? 1 : o, d = t + r * u * Math.cos(c), f = n + i * u * Math.sin(c);
		l === 0 ? e.moveTo(d, f) : e.lineTo(d, f);
	}
	e.closePath();
}
function g(e, t, n, r, i, a, o = -Math.PI / 2) {
	for (let s = 0; s < a; s++) {
		let c = o + s * 2 * Math.PI / a, l = t + r * Math.cos(c), u = n + i * Math.sin(c);
		s === 0 ? e.moveTo(l, u) : e.lineTo(l, u);
	}
	e.closePath();
}
function _(e, t, n, r, i, a, o) {
	let s = (e) => Math.atan2(r * Math.sin(e), i * Math.cos(e)), c = s(a), l = s(a + o), u = t - r * Math.cos(c), d = n - i * Math.sin(c);
	return e.ellipse(u, d, Math.abs(r), Math.abs(i), 0, c, l, o < 0), {
		x: u + r * Math.cos(l),
		y: d + i * Math.sin(l)
	};
}
var v = {
	oval: "ellipse",
	rtriangle: "rttriangle",
	roundrectangle: "roundrect",
	flowchartsumingjunction: "flowchartsummingjunction"
}, y = new Set(/* @__PURE__ */ "ellipse.rttriangle.triangle.diamond.trapezoid.roundrect.snip1rect.frame.irregularseal1.irregularseal2.star4.star8.star12.star16.star24.star32.line.straightconnector1.callout1.bordercallout1.leftuparrow.quadarrowcallout.mathequal.mathplus.mathminus.flowchartdecision.flowchartmanualinput.flowchartconnector.flowchartinputoutput.flowchartmerge.flowchartextract.flowchartpreparation.flowchartcollate".split(".")), b = new Set([
	"accentcallout1",
	"accentbordercallout1",
	"flowchartpredefinedprocess",
	"flowchartsort",
	"flowchartinternalstorage",
	"flowchartsummingjunction"
]), x = new Set([
	"round2samerect",
	"round2diagrect",
	"dodecagon",
	"star10"
]);
function S(e, t, r, i, a, o, s = null, c = null, l = null, u = null) {
	let d = r + a / 2, f = i + o / 2;
	{
		let d = t.toLowerCase(), f = v[d] ?? d;
		if ((y.has(f) || b.has(f) || x.has(f)) && n(e, f, r, i, a, o, [
			s,
			c,
			l,
			u
		])) return;
	}
	switch (t.toLowerCase()) {
		case "parallelogram": {
			let t = a * Math.min(.5, (s ?? 25e3) / 1e5);
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a - t, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "pentagon":
			g(e, d, f, a / 2, o / 2, 5);
			break;
		case "hexagon":
			g(e, d, f, a / 2, o / 2, 6, 0);
			break;
		case "heptagon":
			g(e, d, f, a / 2, o / 2, 7);
			break;
		case "octagon":
			g(e, d, f, a / 2, o / 2, 8, -Math.PI / 8);
			break;
		case "decagon":
			g(e, d, f, a / 2, o / 2, 10);
			break;
		case "star5":
		case "star":
			h(e, d, f, a / 2, o / 2, 5, (s ?? 19098) / 5e4);
			break;
		case "star6":
			h(e, d, f, a / 2, o / 2, 6, (s ?? 28868) / 5e4, 0);
			break;
		case "star7":
			h(e, d, f, a / 2, o / 2, 7, (s ?? 34142) / 5e4);
			break;
		case "rightarrow": {
			let t = o * Math.min(1, (s ?? 5e4) / 1e5), n = a * Math.min(1, (c ?? 5e4) / 1e5), l = i + (o - t) / 2;
			e.moveTo(r, l), e.lineTo(r + a - n, l), e.lineTo(r + a - n, i), e.lineTo(r + a, f), e.lineTo(r + a - n, i + o), e.lineTo(r + a - n, l + t), e.lineTo(r, l + t), e.closePath();
			break;
		}
		case "leftarrow": {
			let t = o * Math.min(1, (s ?? 5e4) / 1e5), n = a * Math.min(1, (c ?? 5e4) / 1e5), l = i + (o - t) / 2;
			e.moveTo(r + a, l), e.lineTo(r + n, l), e.lineTo(r + n, i), e.lineTo(r, f), e.lineTo(r + n, i + o), e.lineTo(r + n, l + t), e.lineTo(r + a, l + t), e.closePath();
			break;
		}
		case "uparrow": {
			let t = a * Math.min(1, (s ?? 5e4) / 1e5), n = o * Math.min(1, (c ?? 5e4) / 1e5), l = r + (a - t) / 2;
			e.moveTo(d, i), e.lineTo(r + a, i + n), e.lineTo(l + t, i + n), e.lineTo(l + t, i + o), e.lineTo(l, i + o), e.lineTo(l, i + n), e.lineTo(r, i + n), e.closePath();
			break;
		}
		case "downarrow": {
			let t = a * Math.min(1, (s ?? 5e4) / 1e5), n = o * Math.min(1, (c ?? 5e4) / 1e5), l = r + (a - t) / 2;
			e.moveTo(d, i + o), e.lineTo(r + a, i + o - n), e.lineTo(l + t, i + o - n), e.lineTo(l + t, i), e.lineTo(l, i), e.lineTo(l, i + o - n), e.lineTo(r, i + o - n), e.closePath();
			break;
		}
		case "leftrightarrow": {
			let t = o * Math.min(1, (s ?? 5e4) / 1e5), n = a * Math.min(.5, (c ?? 25e3) / 1e5), l = i + (o - t) / 2;
			e.moveTo(r, f), e.lineTo(r + n, i), e.lineTo(r + n, l), e.lineTo(r + a - n, l), e.lineTo(r + a - n, i), e.lineTo(r + a, f), e.lineTo(r + a - n, i + o), e.lineTo(r + a - n, l + t), e.lineTo(r + n, l + t), e.lineTo(r + n, i + o), e.closePath();
			break;
		}
		case "updownarrow": {
			let t = a * Math.min(1, (s ?? 5e4) / 1e5), n = o * Math.min(.5, (c ?? 25e3) / 1e5), l = r + (a - t) / 2;
			e.moveTo(d, i), e.lineTo(r + a, i + n), e.lineTo(l + t, i + n), e.lineTo(l + t, i + o - n), e.lineTo(r + a, i + o - n), e.lineTo(d, i + o), e.lineTo(r, i + o - n), e.lineTo(l, i + o - n), e.lineTo(l, i + n), e.lineTo(r, i + n), e.closePath();
			break;
		}
		case "notchedrightarrow": {
			let t = o * Math.min(1, (s ?? 5e4) / 1e5), n = a * Math.min(1, (c ?? 35e3) / 1e5), l = i + (o - t) / 2, u = n * .43;
			e.moveTo(r, l), e.lineTo(r + a - n, l), e.lineTo(r + a - n, i), e.lineTo(r + a, f), e.lineTo(r + a - n, i + o), e.lineTo(r + a - n, l + t), e.lineTo(r, l + t), e.lineTo(r + u, f), e.closePath();
			break;
		}
		case "chevron": {
			let t = a * Math.min(1, Math.max(0, (s ?? 5e4) / 1e5));
			e.moveTo(r, i), e.lineTo(r + t, i), e.lineTo(r + a, f), e.lineTo(r + t, i + o), e.lineTo(r, i + o), t > 0 && e.lineTo(r + t, f), e.closePath();
			break;
		}
		case "homeplate": {
			let t = o * .4;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.lineTo(d, i + o), e.lineTo(r, i + o - t), e.closePath();
			break;
		}
		case "leftbracket": {
			let t = Math.min(o * Math.min(5e4, Math.max(0, s ?? 8333)) / 1e5, o / 2);
			e.moveTo(r + a, i), e.quadraticCurveTo(r, i, r, i + t), o - 2 * t > .5 && e.lineTo(r, i + o - t), e.quadraticCurveTo(r, i + o, r + a, i + o);
			break;
		}
		case "rightbracket": {
			let t = Math.min(o * Math.min(5e4, Math.max(0, s ?? 8333)) / 1e5, o / 2);
			e.moveTo(r, i), e.quadraticCurveTo(r + a, i, r + a, i + t), o - 2 * t > .5 && e.lineTo(r + a, i + o - t), e.quadraticCurveTo(r + a, i + o, r, i + o);
			break;
		}
		case "leftbrace": {
			let t = f, n = a * .45;
			e.moveTo(r + a, i), e.bezierCurveTo(r + a - n, i, r + a - n, t - o * .08, r, t), e.bezierCurveTo(r + a - n, t + o * .08, r + a - n, i + o, r + a, i + o);
			break;
		}
		case "rightbrace": {
			let t = f, n = a * .45;
			e.moveTo(r, i), e.bezierCurveTo(r + n, i, r + n, t - o * .08, r + a, t), e.bezierCurveTo(r + n, t + o * .08, r + n, i + o, r, i + o);
			break;
		}
		case "wedgerectcallout": {
			e.rect(r, i, a, o * .8);
			let t = r + a * .2, n = i + o;
			e.moveTo(r + a * .1, i + o * .8), e.lineTo(t, n), e.lineTo(r + a * .3, i + o * .8), e.closePath();
			break;
		}
		case "wedgeellipsecallout": {
			let t = (s ?? -2e4) / 1e5 * a, n = (c ?? 12e4) / 1e5 * o, r = d + t, i = f + n;
			e.ellipse(d, f, a / 2, o / 2, 0, 0, Math.PI * 2);
			let l = Math.atan2(n, t), u = Math.PI / 10, p = a / 2, m = o / 2, h = d + p * Math.cos(l - u), g = f + m * Math.sin(l - u), _ = d + p * Math.cos(l + u), v = f + m * Math.sin(l + u);
			e.moveTo(h, g), e.lineTo(r, i), e.lineTo(_, v), e.closePath();
			break;
		}
		case "cloudcallout": {
			let t = Math.min(a, o) * .22, n = [
				[d - a * .25, i + o * .35],
				[d - a * .1, i + o * .15],
				[d + a * .1, i + o * .1],
				[d + a * .28, i + o * .2],
				[d + a * .35, i + o * .4]
			];
			e.moveTo(n[0][0] - t, n[0][1]);
			for (let [r, i] of n) e.arc(r, i, t, Math.PI, 0);
			e.arc(d, i + o * .65, a * .45, 0, Math.PI), e.closePath();
			let r = d + (s ?? -2e4) / 1e5 * a, l = f + (c ?? 12e4) / 1e5 * o;
			e.moveTo(d + a * .05, i + o * .8), e.arc(r, l, Math.min(a, o) * .07, 0, Math.PI * 2);
			break;
		}
		case "bentconnector2":
		case "bentconnector3":
		case "bentconnector4":
		case "bentconnector5":
		case "curvedconnector2":
		case "curvedconnector3":
		case "curvedconnector4":
		case "curvedconnector5":
			e.moveTo(r, i), e.lineTo(r + a, i + o);
			break;
		case "heart":
			e.moveTo(d, i + o * .32), e.bezierCurveTo(d, i, r + a * .05, i, r, i + o * .3), e.bezierCurveTo(r, i + o * .68, d - a * .05, i + o * .78, d, i + o), e.bezierCurveTo(d + a * .05, i + o * .78, r + a, i + o * .68, r + a, i + o * .3), e.bezierCurveTo(r + a - a * .05, i, d, i, d, i + o * .32);
			break;
		case "donut": {
			let t = a / 2, n = o / 2, r = Math.min(t, n) * (s ?? 25e3) / 1e5, i = t - r, c = n - r;
			e.ellipse(d, f, t, n, 0, 0, Math.PI * 2, !1), e.moveTo(d + i, f), e.ellipse(d, f, i, c, 0, 0, Math.PI * 2, !0);
			break;
		}
		case "nosmoking":
		case "nosmokingsign": {
			let t = (s ?? 18750) / 1e5, n = a / 2, r = o / 2, i = n * (1 - 2 * t), c = r * (1 - 2 * t);
			e.ellipse(d, f, n, r, 0, 0, Math.PI * 2, !1), e.moveTo(d + i, f), e.ellipse(d, f, i, c, 0, 0, Math.PI * 2, !0), e.moveTo(d + i, f), e.ellipse(d, f, i, c, 0, 0, Math.PI / 2, !1), e.lineTo(d - i, f), e.ellipse(d, f, i, c, 0, Math.PI, 3 * Math.PI / 2, !1), e.closePath();
			break;
		}
		case "pie": {
			let t = (s ?? 0) / 216e5 * Math.PI * 2, n = (c ?? 162e5) / 216e5 * Math.PI * 2;
			e.moveTo(d, f), e.arc(d, f, Math.min(a, o) / 2, t, n), e.closePath();
			break;
		}
		case "cloud": {
			let t = o * .28;
			e.arc(r + a * .25, i + o * .55, t, Math.PI, Math.PI * 1.8), e.arc(r + a * .45, i + o * .35, t * 1.1, Math.PI * 1.3, Math.PI * 1.9), e.arc(r + a * .65, i + o * .4, t, Math.PI * 1.5, Math.PI * 2), e.arc(r + a * .8, i + o * .6, t * .9, Math.PI * 1.6, Math.PI * .1), e.arc(r + a * .55, i + o * .75, t, 0, Math.PI * .7), e.arc(r + a * .25, i + o * .7, t * .9, 0, Math.PI), e.closePath();
			break;
		}
		case "funnel":
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(d + a * .15, i + o), e.lineTo(d - a * .15, i + o), e.closePath();
			break;
		case "smileyface": {
			e.ellipse(d, f, a / 2, o / 2, 0, 0, Math.PI * 2), e.closePath();
			let t = a * .05, n = o * .05, r = f - o * .12;
			e.moveTo(d - a * .2 + t, r), e.ellipse(d - a * .2, r, t, n, 0, 0, Math.PI * 2), e.moveTo(d + a * .2 + t, r), e.ellipse(d + a * .2, r, t, n, 0, 0, Math.PI * 2), e.moveTo(d - a * .25, f + o * .05), e.quadraticCurveTo(d, f + o * .3, d + a * .25, f + o * .05);
			break;
		}
		case "document":
		case "foldedcorner": {
			let t = Math.min(a, o) * .15;
			e.moveTo(r, i), e.lineTo(r + a - t, i), e.lineTo(r + a, i + t), e.lineTo(r + a, i + o), e.lineTo(r, i + o), e.closePath(), e.moveTo(r + a - t, i), e.lineTo(r + a - t, i + t), e.lineTo(r + a, i + t);
			break;
		}
		case "snip2samerect": {
			let t = Math.min(a, o) * Math.min(5e4, Math.max(0, s ?? 16667)) / 1e5;
			e.moveTo(r, i), e.lineTo(r + a - t, i), e.lineTo(r + a, i + t), e.lineTo(r + a, i + o), e.lineTo(r + t, i + o), e.lineTo(r, i + o - t), e.closePath();
			break;
		}
		case "snip2diagrect": {
			let t = Math.min(a, o) * Math.min(5e4, Math.max(0, s ?? 16667)) / 1e5;
			e.moveTo(r + t, i), e.lineTo(r + a - t, i), e.lineTo(r + a, i + t), e.lineTo(r + a, i + o - t), e.lineTo(r + a - t, i + o), e.lineTo(r + t, i + o), e.lineTo(r, i + o - t), e.lineTo(r, i + t), e.closePath();
			break;
		}
		case "sniproundrect": {
			let t = Math.min(a, o) * Math.min(5e4, Math.max(0, s ?? 16667)) / 1e5;
			e.moveTo(r + t, i), e.lineTo(r + a - t, i), e.lineTo(r + a, i + t), e.lineTo(r + a, i + o), e.lineTo(r, i + o), e.quadraticCurveTo(r, i, r + t, i), e.closePath();
			break;
		}
		case "round1rect": {
			let t = Math.min(a, o) * Math.min(5e4, Math.max(0, s ?? 16667)) / 1e5;
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o), e.lineTo(r, i + o), e.lineTo(r, i + t), e.quadraticCurveTo(r, i, r + t, i), e.closePath();
			break;
		}
		case "plaque": {
			let t = Math.min(a, o) * .25;
			e.moveTo(r + t, i), e.lineTo(r + a - t, i), e.quadraticCurveTo(r + a, i, r + a, i + t), e.lineTo(r + a, i + o - t), e.quadraticCurveTo(r + a, i + o, r + a - t, i + o), e.lineTo(r + t, i + o), e.quadraticCurveTo(r, i + o, r, i + o - t), e.lineTo(r, i + t), e.quadraticCurveTo(r, i, r + t, i), e.closePath();
			break;
		}
		case "can": {
			let t = o * .1;
			e.ellipse(d, i + t, a / 2, t, 0, 0, Math.PI * 2), e.moveTo(r, i + t), e.lineTo(r, i + o - t), e.ellipse(d, i + o - t, a / 2, t, 0, Math.PI, 2 * Math.PI), e.lineTo(r + a, i + t);
			break;
		}
		case "cube": {
			let t = Math.min(a, o) * .2;
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.lineTo(r + a - t, i + o), e.lineTo(r, i + o), e.lineTo(r, i + t), e.closePath(), e.moveTo(r + t, i), e.lineTo(r + t, i + t), e.lineTo(r + a - t, i + t), e.moveTo(r + t, i + t), e.lineTo(r, i + t);
			break;
		}
		case "bevel": {
			let t = Math.min(a, o) * .1;
			e.rect(r, i, a, o), e.moveTo(r, i), e.lineTo(r + t, i + t), e.lineTo(r + a - t, i + t), e.lineTo(r + a, i), e.moveTo(r + a - t, i + t), e.lineTo(r + a - t, i + o - t), e.lineTo(r + a, i + o), e.moveTo(r + a - t, i + o - t), e.lineTo(r + t, i + o - t), e.lineTo(r, i + o), e.moveTo(r + t, i + o - t), e.lineTo(r + t, i + t);
			break;
		}
		case "halfframe": {
			let t = Math.min(a, o) * .25;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + t), e.lineTo(r + t, i + t), e.lineTo(r + t, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "corner": {
			let t = Math.min(a, o) * .25;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + t), e.lineTo(r + t, i + t), e.lineTo(r + t, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "flowchartalternateprocess":
		case "flowchartprocess": {
			let t = Math.min(a, o) * Math.min(5e4, Math.max(0, s ?? 16667)) / 1e5;
			e.roundRect(r, i, a, o, [{
				x: t,
				y: t
			}]);
			break;
		}
		case "flowchartterminator": {
			let t = Math.min(a, o) / 2;
			e.roundRect(r, i, a, o, [{
				x: t,
				y: t
			}]);
			break;
		}
		case "flowchartdocument": {
			let t = o * .1;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.bezierCurveTo(r + a * .75, i + o, r + a * .25, i + o - t * 2, r, i + o - t), e.closePath();
			break;
		}
		case "moon":
			e.arc(d, f, Math.min(a, o) / 2, -Math.PI / 2, Math.PI / 2), e.arc(d - a * .2, f, Math.min(a, o) / 2, Math.PI / 2, -Math.PI / 2, !0), e.closePath();
			break;
		case "arc": {
			let t = 216e5, n = (s ?? 162e5) / t * Math.PI * 2, r = (c ?? 54e5) / t * Math.PI * 2;
			e.ellipse(d, f, a / 2, o / 2, 0, n, n + r, r < 0);
			break;
		}
		case "mathmultiply": {
			let t = Math.min(a, o) * Math.min(51965, Math.max(0, s ?? 23520)) / 1e5, n = Math.atan2(o, a), c = Math.sin(n), l = Math.cos(n), u = t / 2 * c, d = t / 2 * l;
			e.moveTo(r + u, i - d), e.lineTo(r - u, i + d), e.lineTo(r + a - u, i + o + d), e.lineTo(r + a + u, i + o - d), e.closePath(), e.moveTo(r + a - u, i - d), e.lineTo(r + a + u, i + d), e.lineTo(r + u, i + o + d), e.lineTo(r - u, i + o - d), e.closePath();
			break;
		}
		case "mathdivide": {
			let t = Math.min(36745, Math.max(1e3, s ?? 23520)), n = (73490 + -t) / 4, r = 36745 * a / o, u = Math.min(Math.min(n, r), Math.max(1e3, l ?? 11760)), p = 73490 + 4 * u - t, m = Math.min(p, Math.max(0, c ?? 5880)), h = o * t / 2e5, g = o * m / 1e5, _ = o * u / 1e5, v = a * 73490 / 2e5, y = f - h, b = f + h, x = y - (g + _) - _, S = i + o - x, C = d - v, w = d + v;
			e.rect(C, y, w - C, b - y), e.moveTo(d + _, x + _), e.arc(d, x + _, _, 0, Math.PI * 2), e.moveTo(d + _, S - _), e.arc(d, S - _, _, 0, Math.PI * 2);
			break;
		}
		case "quadarrow": {
			let t = a * (s ?? 23e3) / 1e5, n = a * (c ?? 3e4) / 1e5, l = r + (a - t) / 2, u = i + (o - t) / 2;
			e.moveTo(d, i), e.lineTo(r + a - n, i + n), e.lineTo(r + a - n, u), e.lineTo(l + t, u), e.lineTo(l + t, i + n), e.lineTo(r + n, i + n), e.lineTo(r + a, f), e.lineTo(r + a - n, i + o - n), e.lineTo(l + t, i + o - n), e.lineTo(l + t, u + t), e.lineTo(r + a - n, u + t), e.lineTo(r + a - n, i + o - n), e.lineTo(d, i + o), e.lineTo(r + n, i + o - n), e.lineTo(r + n, u + t), e.lineTo(l, u + t), e.lineTo(l, i + o - n), e.lineTo(r, f), e.lineTo(r + n, i + n), e.lineTo(l, i + n), e.lineTo(l, u), e.lineTo(r + n, u), e.closePath();
			break;
		}
		case "wave": {
			let t = o * (s ?? 12500) / 1e5, n = i + t, c = i + o - t;
			e.moveTo(r, n), e.bezierCurveTo(r + a * .25, i, r + a * .25, i + t * 2, r + a * .5, n), e.bezierCurveTo(r + a * .75, i + t * 2, r + a * .75, i, r + a, n), e.lineTo(r + a, c), e.bezierCurveTo(r + a * .75, i + o, r + a * .75, i + o - t * 2, r + a * .5, c), e.bezierCurveTo(r + a * .25, i + o - t * 2, r + a * .25, i + o, r, c), e.closePath();
			break;
		}
		case "doublewave": {
			let t = o * (s ?? 6250) / 1e5, n = i + t, c = i + o - t;
			e.moveTo(r, n), e.bezierCurveTo(r + a * .25, i, r + a * .25, i + t * 2, r + a * .5, n), e.bezierCurveTo(r + a * .75, i + t * 2, r + a * .75, i, r + a, n), e.lineTo(r + a, c), e.bezierCurveTo(r + a * .75, i + o, r + a * .75, i + o - t * 2, r + a * .5, c), e.bezierCurveTo(r + a * .25, i + o - t * 2, r + a * .25, i + o, r, c), e.closePath();
			break;
		}
		case "sun": {
			let t = Math.min(a, o) / 2, n = t * ((s ?? 25e3) / 1e5 + .5), r = Math.min(n, t * .9), i = Math.PI / 16;
			for (let n = 0; n < 8; n++) {
				let a = n / 8 * Math.PI * 2;
				e.moveTo(d + r * Math.cos(a - i), f + r * Math.sin(a - i)), e.lineTo(d + t * Math.cos(a), f + t * Math.sin(a)), e.lineTo(d + r * Math.cos(a + i), f + r * Math.sin(a + i)), e.closePath();
			}
			e.moveTo(d + r, f), e.arc(d, f, r, 0, Math.PI * 2);
			break;
		}
		case "lightningbolt":
			e.moveTo(d + a * .1, i), e.lineTo(r, f - o * .05), e.lineTo(d + a * .05, f - o * .05), e.lineTo(d - a * .1, i + o), e.lineTo(r + a, f + o * .05), e.lineTo(d - a * .05, f + o * .05), e.closePath();
			break;
		case "bracketpair": {
			let t = o * Math.min(5e4, Math.max(0, s ?? 8333)) / 1e5;
			e.moveTo(r + a * .4, i), e.quadraticCurveTo(r, i, r, i + t), o - 2 * t > 0 && e.lineTo(r, i + o - t), e.quadraticCurveTo(r, i + o, r + a * .4, i + o), e.moveTo(r + a * .6, i), e.quadraticCurveTo(r + a, i, r + a, i + t), o - 2 * t > 0 && e.lineTo(r + a, i + o - t), e.quadraticCurveTo(r + a, i + o, r + a * .6, i + o);
			break;
		}
		case "bracepair": {
			let t = a * .2;
			e.moveTo(r + a * .4, i), e.bezierCurveTo(r + a * .4 - t, i, r + a * .4 - t, f - o * .08, r, f), e.bezierCurveTo(r + a * .4 - t, f + o * .08, r + a * .4 - t, i + o, r + a * .4, i + o), e.moveTo(r + a * .6, i), e.bezierCurveTo(r + a * .6 + t, i, r + a * .6 + t, f - o * .08, r + a, f), e.bezierCurveTo(r + a * .6 + t, f + o * .08, r + a * .6 + t, i + o, r + a * .6, i + o);
			break;
		}
		case "chord": {
			let t = (s ?? 27e5) / 216e5 * Math.PI * 2, n = (c ?? 162e5) / 216e5 * Math.PI * 2;
			e.ellipse(d, f, a / 2, o / 2, 0, t, n), e.closePath();
			break;
		}
		case "blockarc": {
			let t = Math.min(a, o) / 2, n = s ?? 108e5, r = c ?? 0, i = t * (1 - (l ?? 25e3) / 1e5), u = n / 216e5 * Math.PI * 2, p = r / 216e5 * Math.PI * 2;
			e.arc(d, f, t, u, p, !1), e.arc(d, f, i, p, u, !0), e.closePath();
			break;
		}
		case "teardrop": {
			let t = Math.min(a, o) * .4, n = r + t, s = i + o - t;
			e.arc(n, s, t, 0, Math.PI * 2 * .75), e.bezierCurveTo(n - t * .1, s - t, r + a - t, i + t, r + a, i), e.bezierCurveTo(r + a - t * .2, i + t * .5, n + t, s - t * 1.1, n + t, s), e.closePath();
			break;
		}
		case "diagstripe": {
			let t = o * (s ?? 5e4) / 1e5 * a / o;
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a - t, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "wedgeroundrectcallout": {
			let t = Math.min(a, o) * .1;
			e.roundRect(r, i, a, o * .85, t), e.moveTo(r + a * .1, i + o * .85), e.lineTo(r + a * .2, i + o), e.lineTo(r + a * .3, i + o * .85), e.closePath();
			break;
		}
		case "rightarrowcallout": {
			let t = o * (s ?? 5e4) / 1e5, n = a * (c ?? 5e4) / 1e5, l = i + (o - t) / 2;
			e.rect(r, l, n, t), e.moveTo(r + n, i), e.lineTo(r + a, f), e.lineTo(r + n, i + o), e.closePath();
			break;
		}
		case "leftarrowcallout": {
			let t = o * (s ?? 5e4) / 1e5, n = a * (c ?? 5e4) / 1e5, l = i + (o - t) / 2;
			e.rect(r + a - n, l, n, t), e.moveTo(r + a - n, i), e.lineTo(r, f), e.lineTo(r + a - n, i + o), e.closePath();
			break;
		}
		case "uparrowcallout": {
			let t = a * (s ?? 5e4) / 1e5, n = o * (c ?? 5e4) / 1e5, l = r + (a - t) / 2;
			e.rect(l, i + n, t, o - n), e.moveTo(r, i + n), e.lineTo(d, i), e.lineTo(r + a, i + n), e.closePath();
			break;
		}
		case "downarrowcallout": {
			let t = a * (s ?? 5e4) / 1e5, n = o * (c ?? 5e4) / 1e5, l = r + (a - t) / 2;
			e.rect(l, i, t, o - n), e.moveTo(r, i + o - n), e.lineTo(d, i + o), e.lineTo(r + a, i + o - n), e.closePath();
			break;
		}
		case "leftrightarrowcallout": {
			let t = o * (s ?? 5e4) / 1e5, n = a * (c ?? 25e3) / 1e5, l = i + (o - t) / 2;
			e.rect(r + n, l, a - 2 * n, t), e.moveTo(r + n, i), e.lineTo(r, f), e.lineTo(r + n, i + o), e.closePath(), e.moveTo(r + a - n, i), e.lineTo(r + a, f), e.lineTo(r + a - n, i + o), e.closePath();
			break;
		}
		case "leftrightuparrow": {
			let t = a * (s ?? 25e3) / 1e5, n = o * (c ?? 3e4) / 1e5, l = r + (a - t) / 2;
			e.moveTo(d, i), e.lineTo(r + a, i + n), e.lineTo(l + t, i + n), e.lineTo(l + t, i + o), e.lineTo(l, i + o), e.lineTo(l, i + n), e.lineTo(r, i + n), e.closePath();
			break;
		}
		case "uturnarrow": {
			let t = a * (s ?? 25e3) / 1e5, n = (a - t) / 2, c = Math.max(0, n - t), l = r + t + n, u = i + t + n, d = t * 2, f = i + o - t * 2.5;
			e.moveTo(r, i + o), e.lineTo(r, u), e.arc(l, u, n, Math.PI, 0), e.lineTo(r + a, f), e.lineTo(r + a + (d - t) / 2, f), e.lineTo(l + t / 2, i + o), e.lineTo(r + a - (d - t) / 2 - t, f), e.lineTo(r + a - t, f), e.lineTo(r + a - t, u), e.arc(l, u, c, 0, Math.PI, !0), e.lineTo(r + t, i + o), e.closePath();
			break;
		}
		case "bentarrow":
		case "bentuparrow": {
			let t = Math.min(a, o) * .25;
			e.moveTo(r, f - t / 2), e.lineTo(r + a - t * 2, f - t / 2), e.lineTo(r + a - t * 2, i + t), e.lineTo(r + a, f), e.lineTo(r + a - t * 2, i + o - t), e.lineTo(r + a - t * 2, f + t / 2), e.lineTo(r, f + t / 2), e.closePath();
			break;
		}
		case "plus": {
			let t = Math.min(a, o) * (s ?? 25e3) / 1e5;
			e.rect(d - t, i, 2 * t, o), e.rect(r, f - t, a, 2 * t);
			break;
		}
		case "mathnotequal": {
			let t = Math.min(5e4, Math.max(0, s ?? 23520)), n = Math.min(66e5, Math.max(42e5, c ?? 66e5)), r = Math.min(1e5 - 2 * t, Math.max(0, l ?? 11760)), u = o * t / 1e5, p = o * r / 2e5, m = a * 73490 / 2e5, h = o / 2, g = (n / 6e4 - 90) * Math.PI / 180, _ = h * Math.tan(g), v = Math.hypot(_, h) * u / h;
			e.rect(d - m, f - p - u, 2 * m, u), e.rect(d - m, f + p, 2 * m, u), e.moveTo(d + _ - v / 2, i), e.lineTo(d + _ + v / 2, i), e.lineTo(d - _ + v / 2, i + o), e.lineTo(d - _ - v / 2, i + o), e.closePath();
			break;
		}
		case "flowchartdelay": {
			let t = o / 2;
			e.moveTo(r, i), e.lineTo(r + a - t, i), e.arc(r + a - t, f, t, -Math.PI / 2, Math.PI / 2), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "flowchartdisplay": {
			let t = a * .2, n = a * .15;
			e.moveTo(r + t, i), e.lineTo(r + a - n, i), e.arc(r + a - n, f, o / 2, -Math.PI / 2, Math.PI / 2), e.lineTo(r + t, i + o), e.lineTo(r, f), e.closePath();
			break;
		}
		case "flowchartpunchedcard": {
			let t = a * .2;
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a - t, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "flowchartoffpageconnector": {
			let t = o * .3;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.lineTo(d, i + o), e.lineTo(r, i + o - t), e.closePath();
			break;
		}
		case "flowchartonlinestorage":
		case "flowchartmanuallabel":
		case "flowchartpuncheddisk":
			e.rect(r, i, a, o);
			break;
		case "horizontalscroll": {
			let t = Math.min(a, o) * .15;
			e.roundRect(r + t, i, a - t, o, t), e.moveTo(r + t, i + t * 2), e.arc(r + t, i + t, t, Math.PI / 2, Math.PI * 2.5);
			break;
		}
		case "verticalscroll": {
			let t = Math.min(a, o) * .15;
			e.roundRect(r, i + t, a, o - t, t), e.moveTo(r + t * 2, i + t), e.arc(r + t, i + t, t, 0, Math.PI * 2);
			break;
		}
		case "ribbon": {
			let t = Math.min(33333, Math.max(0, s ?? 16667)), n = a * Math.min(75e3, Math.max(25e3, c ?? 5e4)) / 2e5, l = a / 8, u = a / 32, d = a / 2 - n, f = a / 2 + n, p = d + u, m = f - u, h = d + l, g = f - l, _ = h - u, v = g + u, y = a - l, b = o * t / 2e5, x = o * t / 1e5, S = o - x, C = S / 2;
			e.moveTo(r, i), e.lineTo(r + _, i), e.lineTo(r + p, i + b), e.lineTo(r + m, i + x), e.lineTo(r + v, i + b), e.lineTo(r + a, i), e.lineTo(r + y, i + C), e.lineTo(r + a, i + S), e.lineTo(r + f, i + S), e.lineTo(r + f, i + o), e.lineTo(r + p, i + o), e.lineTo(r + d, i + S), e.lineTo(r, i + S), e.lineTo(r + l, i + C), e.closePath();
			break;
		}
		case "ribbon2": {
			let t = Math.min(33333, Math.max(0, s ?? 16667)), n = a * Math.min(75e3, Math.max(25e3, c ?? 5e4)) / 2e5, l = a / 8, u = a / 32, d = a / 2 - n, f = a / 2 + n, p = d + u, m = f - u, h = d + l, g = f - l, _ = h - u, v = g + u, y = a - l, b = o * t / 2e5, x = o * t / 1e5, S = o - b, C = o - x, w = x, T = (w + o) / 2;
			e.moveTo(r, i + o), e.lineTo(r + _, i + o), e.lineTo(r + p, i + S), e.lineTo(r + m, i + C), e.lineTo(r + v, i + S), e.lineTo(r + a, i + o), e.lineTo(r + y, i + T), e.lineTo(r + a, i + w), e.lineTo(r + f, i + w), e.lineTo(r + f, i), e.lineTo(r + p, i), e.lineTo(r + d, i + w), e.lineTo(r, i + w), e.lineTo(r + l, i + T), e.closePath();
			break;
		}
		case "ellipseribbon": {
			let t = Math.min(1e5, Math.max(0, s ?? 25e3)), n = Math.min(75e3, Math.max(25e3, c ?? 5e4)), u = Math.max(0, t - (1e5 - t) / 2), d = Math.min(t, Math.max(u, l ?? 12500)), f = a / 8, p = a * n / 2e5, m = a / 2 - p, h = m + f, g = a - h, _ = a - m, v = a - f, y = o * d / 1e5, b = 4 * y / a, x = b * (h - h * h / a), S = h / 2, C = b * S, w = a - S, T = o * t / 1e5, E = T - y, D = b * (m - m * m / a), O = D + E, k = y + E - O + y + E, A = o - T, j = (y * 14 / 16 + A) / 2, M = D + A, N = O + A, P = m / 2, F = b * P + A, I = a - P, L = k + A;
			e.moveTo(r, i), e.quadraticCurveTo(r + S, i + C, r + h, i + x), e.lineTo(r + m, i + O), e.quadraticCurveTo(r + a / 2, i + k, r + _, i + O), e.lineTo(r + g, i + x), e.quadraticCurveTo(r + w, i + C, r + a, i), e.lineTo(r + v, i + j), e.lineTo(r + a, i + A), e.quadraticCurveTo(r + I, i + F, r + _, i + M), e.lineTo(r + _, i + N), e.quadraticCurveTo(r + a / 2, i + L, r + m, i + N), e.lineTo(r + m, i + M), e.quadraticCurveTo(r + P, i + F, r, i + A), e.lineTo(r + f, i + j), e.closePath();
			break;
		}
		case "ellipseribbon2": {
			let t = Math.min(1e5, Math.max(0, s ?? 25e3)), n = Math.min(75e3, Math.max(25e3, c ?? 5e4)), u = Math.max(0, t - (1e5 - t) / 2), d = Math.min(t, Math.max(u, l ?? 12500)), f = a / 8, p = a * n / 2e5, m = a / 2 - p, h = m + f, g = a - h, _ = a - m, v = a - f, y = o * d / 1e5, b = 4 * y / a, x = o - b * (h - h * h / a), S = h / 2, C = o - b * S, w = a - S, T = o * t / 1e5, E = T - y, D = b * (m - m * m / a), O = D + E, k = o - O, A = y + E - O + y + E, j = o - A, M = o - T, N = o - (y * 14 / 16 + M) / 2, P = o - (D + M), F = o - (O + M), I = m / 2, L = o - (b * I + M), R = a - I, z = o - (A + M);
			e.moveTo(r, i + o), e.quadraticCurveTo(r + S, i + C, r + h, i + x), e.lineTo(r + m, i + k), e.quadraticCurveTo(r + a / 2, i + j, r + _, i + k), e.lineTo(r + g, i + x), e.quadraticCurveTo(r + w, i + C, r + a, i + o), e.lineTo(r + v, i + N), e.lineTo(r + a, i + T), e.quadraticCurveTo(r + R, i + L, r + _, i + P), e.lineTo(r + _, i + F), e.quadraticCurveTo(r + a / 2, i + z, r + m, i + F), e.lineTo(r + m, i + P), e.quadraticCurveTo(r + I, i + L, r, i + T), e.lineTo(r + f, i + N), e.closePath();
			break;
		}
		case "circulararrow": {
			let t = (c ?? 0) / 6e4 * Math.PI / 180, n = (s ?? 162e5) / 6e4 * Math.PI / 180, r = (l ?? 5e4) / 1e5, i = Math.min(a, o) / 2, u = i * (1 - r), p = (i + u) / 2, m = i - u, h = t + n;
			e.arc(d, f, i, t, h, !1), e.arc(d, f, u, h, t, !0), e.closePath();
			let g = Math.sin(h), _ = -Math.cos(h), v = m * 1.5, y = d + p * Math.cos(h) + v * g, b = f + p * Math.sin(h) + v * _;
			e.moveTo(y, b), e.lineTo(d + i * Math.cos(h), f + i * Math.sin(h)), e.lineTo(d + u * Math.cos(h), f + u * Math.sin(h)), e.closePath();
			break;
		}
		case "curvedrightarrow": {
			let t = Math.min(a, o), n = o / 2, u = 5e4 * o / t, d = Math.min(u, Math.max(0, c ?? 5e4)), f = t * Math.min(d, Math.max(0, s ?? 25e3)) / 1e5, p = t * d / 1e5, m = n - (f + p) / 4, h = (2 * m) ** 2 - f ** 2, g = 1e5 * (Math.sqrt(Math.max(0, h)) * a / (2 * m)) / t, v = t * Math.min(g, Math.max(0, l ?? 25e3)) / 1e5, y = Math.sqrt(Math.max(0, a * a - v * v)) * m / a, b = m + f, x = m + y, S = b + y, C = (p - f) / 2, w = x - C, T = S + C, E = o - p / 2, D = a - v, O = Math.atan2(v, y), k = -O, A = Math.PI - O;
			e.moveTo(r, i + m), _(e, r, i + m, a, m, Math.PI, k), e.lineTo(r + D, i + w), e.lineTo(r + a, i + E), e.lineTo(r + D, i + T), e.lineTo(r + D, i + S), _(e, r + D, i + S, a, m, A, O), e.closePath();
			break;
		}
		case "curvedleftarrow": {
			let t = Math.min(a, o), n = o / 2, u = 5e4 * o / t, d = Math.min(u, Math.max(0, c ?? 5e4)), f = t * Math.min(d, Math.max(0, s ?? 25e3)) / 1e5, p = t * d / 1e5, m = n - (f + p) / 4, h = (2 * m) ** 2 - f ** 2, g = Math.sqrt(Math.max(0, h)) * a / (2 * m), v = 1e5 * g / t, y = t * Math.min(v, Math.max(0, l ?? 25e3)) / 1e5, b = Math.sqrt(Math.max(0, a * a - y * y)) * m / a, x = m + f, S = m + b, C = x + b, w = (p - f) / 2, T = S - w, E = C + w, D = o - p / 2, O = y, k = Math.atan2(y, b), A = f / 2, j = Math.atan2(A, g), M = j - k, N = k - j, P = -j;
			e.moveTo(r, i + D), e.lineTo(r + O, i + T), e.lineTo(r + O, i + S);
			let F = _(e, r + O, i + S, a, m, k, M);
			_(e, F.x, F.y, a, m, P, N), e.lineTo(r + O, i + E), e.closePath();
			break;
		}
		case "curveduparrow": {
			let t = Math.min(a, o), n = a / 2, u = 5e4 * a / t, d = Math.min(u, Math.max(0, c ?? 5e4)), f = t * Math.min(1e5, Math.max(0, s ?? 25e3)) / 1e5, p = t * d / 1e5, m = n - (f + p) / 4, h = (2 * m) ** 2 - f ** 2, g = Math.sqrt(Math.max(0, h)) * o / (2 * m), v = 1e5 * g / t, y = t * Math.min(v, Math.max(0, l ?? 25e3)) / 1e5, b = Math.sqrt(Math.max(0, o * o - y * y)) * m / o, x = m + f, S = m + b, C = x + b, w = (p - f) / 2, T = S - w, E = C + w, D = a - p / 2, O = y, k = Math.atan2(y, b), A = f / 2, j = Math.atan2(A, g), M = j - k, N = k - j, P = Math.PI / 2 - k, F = Math.PI / 2 - j;
			e.moveTo(r + D, i), e.lineTo(r + E, i + O), e.lineTo(r + C, i + O);
			let I = _(e, r + C, i + O, m, o, P, N);
			_(e, I.x, I.y, m, o, F, M), e.lineTo(r + T, i + O), e.closePath();
			break;
		}
		case "curveddownarrow": {
			let t = Math.min(a, o), n = a / 2, u = 5e4 * a / t, d = Math.min(u, Math.max(0, c ?? 5e4)), f = t * Math.min(1e5, Math.max(0, s ?? 25e3)) / 1e5, p = t * d / 1e5, m = n - (f + p) / 4, h = (2 * m) ** 2 - f ** 2, g = Math.sqrt(Math.max(0, h)) * o / (2 * m), v = 1e5 * g / t, y = t * Math.min(v, Math.max(0, l ?? 25e3)) / 1e5, b = Math.sqrt(Math.max(0, o * o - y * y)) * m / o, x = m + f, S = m + b, C = x + b, w = (p - f) / 2, T = S - w, E = C + w, D = a - p / 2, O = o - y, k = Math.atan2(y, b), A = f / 2, j = Math.atan2(A, g), M = 3 * Math.PI / 2 + k;
			3 * Math.PI / 2 - j, j - Math.PI / 2, Math.PI / 2 - j, e.moveTo(r + D, i + o), e.lineTo(r + T, i + O), e.lineTo(r + S, i + O), _(e, r + S, i + O, m, o, M, -k), e.lineTo(r + x, i), _(e, r + x, i, m, o, 3 * Math.PI / 2, k), e.lineTo(r + E, i + O), e.closePath();
			break;
		}
		case "stripedrightarrow": {
			let t = Math.min(a, o), n = t / 32, l = t / 16, u = t / 8, d = t * (s ?? 5e4) / 1e5, p = a * (c ?? 5e4) / 1e5, m = f - d / 2, h = f + d / 2, g = r + a - p;
			e.rect(r, m, n, d), e.rect(r + l, m, l, d), e.rect(r + u, m, u, d), e.moveTo(g, m), e.lineTo(g, i), e.lineTo(r + a, f), e.lineTo(g, i + o), e.lineTo(g, h), e.lineTo(r + u * 2, h), e.lineTo(r + u * 2, m), e.closePath();
			break;
		}
		case "flowchartmagneticdisk": {
			let t = o * .15;
			e.moveTo(r, i + t), e.ellipse(d, i + t, a / 2, t, 0, Math.PI, 0), e.lineTo(r + a, i + o - t), e.ellipse(d, i + o - t, a / 2, t, 0, 0, Math.PI), e.lineTo(r, i + t), e.closePath(), e.moveTo(r + a, i + t), e.ellipse(d, i + t, a / 2, t, 0, 0, Math.PI);
			break;
		}
		case "flowchartmagneticdrum": {
			let t = a * .15;
			e.moveTo(r + t, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o), e.lineTo(r + t, i + o), e.ellipse(r + t, f, t, o / 2, 0, Math.PI / 2, -Math.PI / 2, !0), e.closePath(), e.moveTo(r + a, i), e.ellipse(r + a, f, t, o / 2, 0, -Math.PI / 2, Math.PI / 2);
			break;
		}
		case "flowchartmagnetictape": {
			let t = Math.min(a, o) / 2, n = d + t * .5;
			e.moveTo(d, i + o), e.arc(d, f, t, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * .875), e.lineTo(n, f + t * .5), e.lineTo(n, i + o), e.closePath();
			break;
		}
		case "flowchartpunchedtape": {
			let t = o * .12;
			e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.bezierCurveTo(r + a * .75, i + o, r + a * .25, i + o - t * 2, r, i + o - t), e.closePath(), e.moveTo(r, i + t), e.bezierCurveTo(r + a * .25, i, r + a * .75, i + t * 2, r + a, i + t);
			break;
		}
		case "flowchartmanualoperation": {
			let t = a * .15;
			e.moveTo(r + t, i), e.lineTo(r + a - t, i), e.lineTo(r + a, i + o), e.lineTo(r, i + o), e.closePath();
			break;
		}
		case "flowchartmultidocument": {
			let t = o * .1, n = a * .04;
			e.rect(r + n * 2, i - o * .08, a - n * 2, o * .1), e.rect(r + n, i - o * .04, a - n, o * .06), e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + a, i + o - t), e.bezierCurveTo(r + a * .75, i + o, r + a * .25, i + o - t * 2, r, i + o - t), e.closePath();
			break;
		}
		case "rttriangle":
			e.moveTo(r, i), e.lineTo(r, i + o), e.lineTo(r + a, i + o), e.closePath();
			break;
		default:
			e.rect(r, i, a, o);
			break;
	}
}
//#endregion
//#region packages/core/src/shape/arrow.ts
function C(e, t, n) {
	let r = Math.max(.5, t.width * n), i = e.w === "sm" ? 4 : e.w === "lg" ? 8 : 6, a = e.len === "sm" ? 4 : e.len === "lg" ? 8 : 6;
	return {
		lw: r,
		halfW: r * i / 2,
		len: r * a
	};
}
var w = new Set([
	"triangle",
	"stealth",
	"diamond",
	"oval"
]);
function T(e, t, n) {
	return w.has(e.type) ? C(e, t, n).len : 0;
}
function E(e, t, n) {
	if (n <= 0) return {
		x: e.x,
		y: e.y
	};
	let r = t.x - e.x, i = t.y - e.y, a = Math.hypot(r, i);
	if (a < 1e-9) return {
		x: e.x,
		y: e.y
	};
	let o = Math.min(n, a) / a;
	return {
		x: e.x + r * o,
		y: e.y + i * o
	};
}
function D(e, t, n, i, a, o, s) {
	if (a.type === "none") return;
	let { lw: c, halfW: l, len: u } = C(a, o, s), d = r(o.color);
	switch (e.save(), e.translate(t, n), e.rotate(i), e.fillStyle = d, e.strokeStyle = d, e.lineWidth = c, e.setLineDash([]), e.beginPath(), a.type) {
		case "triangle":
		case "stealth":
			e.moveTo(0, 0), e.lineTo(-u, -l), e.lineTo(-u, l), e.closePath(), e.fill();
			break;
		case "arrow":
			e.moveTo(0, 0), e.lineTo(-u, -l), e.moveTo(0, 0), e.lineTo(-u, l), e.stroke();
			break;
		case "diamond":
			e.moveTo(0, 0), e.lineTo(-u / 2, -l), e.lineTo(-u, 0), e.lineTo(-u / 2, l), e.closePath(), e.fill();
			break;
		case "oval":
			e.ellipse(-u / 2, 0, u / 2, l, 0, 0, Math.PI * 2), e.fill();
			break;
	}
	e.restore();
}
//#endregion
//#region packages/core/src/image/bitmap-image-by-path.ts
var O = 256, k = /* @__PURE__ */ new WeakMap();
function A(e) {
	let t = k.get(e);
	return t || (t = /* @__PURE__ */ new Map(), k.set(e, t)), t;
}
function j(e, n, r, i = {}) {
	let { widthPt: a = 0, heightPt: o = 0, suppressBoundaryFrame: s = !1 } = i, c = A(r), l = c.get(e);
	if (l) return c.delete(e), c.set(e, l), l.promise;
	let u = r(e, n).then((e) => t(e, {
		widthPt: a,
		heightPt: o,
		suppressBoundaryFrame: s
	})), d = { promise: u };
	if (u.then((e) => {
		d.bitmap = e;
	}).catch(() => {}), u.catch(() => c.delete(e)), c.set(e, d), c.size > O) {
		let e = c.keys().next().value, t = c.get(e);
		c.delete(e), t?.promise.then((e) => e?.close()).catch(() => {});
	}
	return u;
}
function M(e, t) {
	return k.get(t)?.get(e)?.bitmap;
}
function N(e) {
	let t = k.get(e);
	if (t) {
		for (let e of t.values()) e.promise.then((e) => e?.close()).catch(() => {});
		t.clear(), k.delete(e);
	}
}
//#endregion
//#region packages/core/src/text/underline.ts
function P(t, n, r, a, o, s, c, l = 1) {
	let u = Math.max(1, o * .05), d = c === "heavy" || (c?.endsWith("Heavy") ?? !1) ? u * 1.8 : u, f = r + Math.max(2, d), p = e(f, d, l);
	if (t.strokeStyle = s, t.lineWidth = d, t.setLineDash([]), c && c.startsWith("wavy")) {
		let e = d, r = d * 6;
		t.beginPath(), t.moveTo(n, f);
		let i = Math.max(1, d * .5);
		for (let o = 0; o <= a; o += i) {
			let i = f + Math.sin(o / r * Math.PI * 2) * e;
			t.lineTo(n + o, i);
		}
		if (t.stroke(), c === "wavyDbl") {
			t.beginPath(), t.moveTo(n, f + e * 2.5);
			for (let o = 0; o <= a; o += i) {
				let i = f + e * 2.5 + Math.sin(o / r * Math.PI * 2) * e;
				t.lineTo(n + o, i);
			}
			t.stroke();
		}
		return;
	}
	if (c === "dbl") {
		let r = d * 1.4, i = f - r / 2, o = f + r / 2;
		t.beginPath(), t.moveTo(n, i + e(i, d, l)), t.lineTo(n + a, i + e(i, d, l)), t.moveTo(n, o + e(o, d, l)), t.lineTo(n + a, o + e(o, d, l)), t.stroke();
		return;
	}
	t.setLineDash(i(c ?? "sng", d)), t.beginPath(), t.moveTo(n, f + p), t.lineTo(n + a, f + p), t.stroke(), t.setLineDash([]);
}
//#endregion
//#region packages/core/src/text/line-distribute.ts
var F = (e) => e === 32 || e === 12288;
function I(e, t, n = {}) {
	if (Math.abs(t) <= .5) return null;
	let r = n.firstContentSi ?? 0, i = n.lastDrawnSi ?? e.length - 1, o = n.minPerGap ?? -Infinity, s = n.isGapChar ?? a, c = n.isWhitespace ?? F, l = [];
	for (let t = r; t < e.length; t++) {
		let n = e[t];
		if (n === void 0) continue;
		if (n.text === void 0) {
			l.push({
				si: t,
				off: 0,
				ws: !1
			});
			continue;
		}
		let r = 0;
		for (let e of n.text) {
			let n = e.codePointAt(0);
			l.push({
				si: t,
				off: r,
				cp: n,
				ws: c(n)
			}), r++;
		}
	}
	let u = -1, d = -1;
	for (let e = 0; e < l.length; e++) l[e].ws || (u === -1 && (u = e), d = e);
	if (u === -1 || u === d) return null;
	let f = Array(l.length).fill(!1), p = 0;
	for (let e = u; e < d; e++) {
		let t = l[e];
		if (t.si === i) continue;
		if (t.ws) {
			f[e] = !0, p++;
			continue;
		}
		let n = l[e + 1];
		if (n.ws) continue;
		let r = t.cp, a = n.cp;
		(r !== void 0 && s(r) || a !== void 0 && s(a)) && (f[e] = !0, p++);
	}
	if (p === 0) return null;
	let m = t / p;
	t < 0 && m < o && (m = o);
	let h = /* @__PURE__ */ new Map();
	for (let e of l) e.cp !== void 0 && h.set(e.si, (h.get(e.si) ?? 0) + 1);
	let g = /* @__PURE__ */ new Map();
	for (let e = 0; e < l.length; e++) {
		if (!f[e]) continue;
		let t = l[e], n = g.get(t.si);
		n || (n = {
			splitBefore: [],
			trailingGap: !1,
			internalStretch: 0
		}, g.set(t.si, n));
		let r = h.get(t.si) ?? 0;
		t.cp === void 0 || t.off === r - 1 ? n.trailingGap = !0 : (n.splitBefore.push(t.off + 1), n.internalStretch += m);
	}
	return {
		perGap: m,
		perSeg: g
	};
}
//#endregion
//#region packages/core/src/text/justify-positions.ts
function L(e, t, n, r, i = 0) {
	let a = [], o = 0, s = 0;
	for (let c of t) a.push({
		text: e.slice(o, c).join(""),
		dx: r(e.slice(0, o).join("")) + o * i + s * n
	}), o = c, s++;
	return a.push({
		text: e.slice(o).join(""),
		dx: r(e.slice(0, o).join("")) + o * i + s * n
	}), a;
}
//#endregion
//#region packages/core/src/layout/virtual-scroll.ts
function R(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function z(e, t, n, r, i, a) {
	let o = e.length;
	if (o === 0) return {
		start: 0,
		end: -1,
		topIndex: 0,
		offsets: [],
		totalHeight: 0
	};
	let s = a?.leading ?? 0, c = a?.trailing ?? 0, l = Array(o), u = 0;
	for (let n = 0; n < o; n++) l[n] = s + u + n * t, u += e[n];
	let d = s + u + (o - 1) * t + c, f = 0, p = o;
	for (; f < p;) {
		let e = f + p >>> 1;
		l[e] <= n ? f = e + 1 : p = e;
	}
	let m = R(f - 1, 0, o - 1), h = n + r;
	for (f = 0, p = o; f < p;) {
		let e = f + p >>> 1;
		l[e] < h ? f = e + 1 : p = e;
	}
	let g = R(f - 1, 0, o - 1);
	return {
		start: R(m - i, 0, o - 1),
		end: R(g + i, 0, o - 1),
		topIndex: m,
		offsets: l,
		totalHeight: d
	};
}
//#endregion
//#region packages/core/src/search/highlight-rect.ts
function B(e, t, n, r) {
	let i = t <= 0 ? 0 : r(e.slice(0, t)), a = n >= e.length ? r(e) : r(e.slice(0, n));
	return {
		x: i,
		width: Math.max(0, a - i)
	};
}
//#endregion
export { P as a, M as c, E as d, S as f, p as g, d as h, I as i, D as l, f as m, z as n, N as o, m as p, L as r, j as s, B as t, T as u };
