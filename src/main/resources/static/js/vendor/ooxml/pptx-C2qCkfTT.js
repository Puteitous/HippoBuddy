import { A as e, B as t, C as n, D as r, Dt as i, E as a, Et as o, F as s, G as c, H as l, I as u, J as d, K as f, M as p, N as m, O as h, Q as g, R as _, S as v, T as y, Tt as b, U as x, V as S, W as C, Y as w, Z as T, _t as E, b as D, bt as O, c as k, d as A, dt as j, f as M, ft as N, g as P, gt as F, h as I, i as L, j as R, k as z, l as B, lt as V, m as ee, mt as H, n as te, nt as U, o as W, ot as G, p as K, pt as ne, q as re, r as ie, s as ae, st as q, t as oe, u as se, ut as ce, w as le, wt as ue, y as de, yt as fe, z as pe } from "./find-cursor-DgyGlCIw.js";
import { a as me, c as he, d as ge, f as _e, h as ve, i as ye, l as be, m as xe, n as Se, o as Ce, p as we, r as Te, s as Ee, t as De, u as Oe } from "./highlight-rect-CBqVAarx.js";
import { t as ke } from "./mathjax-BRfWlbSJ.js";
import { n as Ae, r as je, t as Me } from "./visible-index-C4c37k-n.js";
//#region packages/pptx/src/text-layer.ts
function Ne(e, t, n, r, i) {
	e.innerHTML = "", e.style.width = `${n}px`, e.style.height = `${r}px`;
	let a = /* @__PURE__ */ new Map();
	for (let n of t) {
		let t = n.rotation + (n.textBodyRotation ?? 0), r = `${n.shapeX},${n.shapeY},${n.shapeW},${n.shapeH},${t}`;
		if (!a.has(r)) {
			let i = document.createElement("div");
			i.style.cssText = `position:absolute;left:${n.shapeX}px;top:${n.shapeY}px;width:${n.shapeW}px;height:${n.shapeH}px;pointer-events:all;overflow:hidden;`, t !== 0 && (i.style.transformOrigin = "center center", i.style.transform = `rotate(${t}deg)`), a.set(r, {
				div: i,
				x: n.shapeX,
				y: n.shapeY,
				w: n.shapeW,
				h: n.shapeH,
				rot: t
			}), e.appendChild(i);
		}
		let o = a.get(r), s = document.createElement("span");
		s.textContent = n.text;
		let c = i ? n.hyperlink : void 0;
		s.style.cssText = `position:absolute;left:${n.inShapeX}px;top:${n.inShapeY}px;font:${n.font};line-height:${n.h}px;letter-spacing:0;white-space:pre;color:transparent;cursor:${c ? "pointer" : "text"};`, c && i && (s.title = c.kind === "external" ? c.url : c.ref, s.addEventListener("click", (e) => {
			e.preventDefault(), i(c);
		})), o.div.appendChild(s);
	}
}
//#endregion
//#region packages/core/src/shape/custgeom-endpoints.ts
var J = 1e-9;
function Pe(e) {
	return e.cmd === "lineTo" || e.cmd === "cubicBezTo" || e.cmd === "arcTo";
}
function Fe(e, t, n, r) {
	let i = n === 0 ? 0 : n, a = r === 0 ? 0 : r;
	return {
		x: e,
		y: t,
		dx: i,
		dy: a,
		angle: Math.atan2(a, i)
	};
}
function Ie(e, t, n) {
	switch (n.cmd) {
		case "lineTo": return {
			dx: n.x - e,
			dy: n.y - t
		};
		case "cubicBezTo": {
			let r = n.x1 - e, i = n.y1 - t;
			return Math.abs(r) < J && Math.abs(i) < J && (r = n.x2 - e, i = n.y2 - t), Math.abs(r) < J && Math.abs(i) < J && (r = n.x - e, i = n.y - t), {
				dx: r,
				dy: i
			};
		}
		case "arcTo": {
			let e = n.stAng * Math.PI / 180, t = n.swAng < 0 ? -1 : 1;
			return {
				dx: -n.wr * Math.sin(e) * t,
				dy: n.hr * Math.cos(e) * t
			};
		}
		default: return {
			dx: 0,
			dy: 0
		};
	}
}
function Le(e, t, n) {
	switch (n.cmd) {
		case "moveTo":
		case "lineTo":
		case "cubicBezTo": return {
			x: n.x,
			y: n.y
		};
		case "arcTo": {
			if (n.wr <= 0 || n.hr <= 0) return {
				x: e,
				y: t
			};
			let r = n.stAng * Math.PI / 180, i = r + n.swAng * Math.PI / 180, a = e - n.wr * Math.cos(r), o = t - n.hr * Math.sin(r);
			return {
				x: a + n.wr * Math.cos(i),
				y: o + n.hr * Math.sin(i)
			};
		}
		default: return {
			x: e,
			y: t
		};
	}
}
function Re(e, t, n) {
	let { x: r, y: i } = Le(e, t, n);
	switch (n.cmd) {
		case "lineTo": return {
			dx: n.x - e,
			dy: n.y - t,
			x: r,
			y: i
		};
		case "cubicBezTo": {
			let a = n.x - n.x2, o = n.y - n.y2;
			return Math.abs(a) < J && Math.abs(o) < J && (a = n.x - n.x1, o = n.y - n.y1), Math.abs(a) < J && Math.abs(o) < J && (a = n.x - e, o = n.y - t), {
				dx: a,
				dy: o,
				x: r,
				y: i
			};
		}
		case "arcTo": {
			if (n.wr <= 0 || n.hr <= 0) return {
				dx: 0,
				dy: 0,
				x: r,
				y: i
			};
			let e = n.stAng * Math.PI / 180 + n.swAng * Math.PI / 180, t = n.swAng < 0 ? -1 : 1;
			return {
				dx: -n.wr * Math.sin(e) * t,
				dy: n.hr * Math.cos(e) * t,
				x: r,
				y: i
			};
		}
		default: return {
			dx: 0,
			dy: 0,
			x: r,
			y: i
		};
	}
}
function ze(e) {
	let t = 0, n = 0, r = !1;
	for (let i of e) i.cmd === "moveTo" && (r = !0), {x: t, y: n} = Le(t, n, i);
	return r ? {
		x: t,
		y: n
	} : null;
}
function Be(e) {
	if (e.some((e) => e.cmd === "close")) return !0;
	let t = e.find((e) => e.cmd === "moveTo");
	if (!t) return !1;
	let n = ze(e);
	return !n || !e.some(Pe) ? !1 : Math.abs(n.x - t.x) < J && Math.abs(n.y - t.y) < J;
}
function Ve(e) {
	let t = {
		start: null,
		end: null
	};
	if (!e || e.length === 0) return t;
	let n = e[0];
	if (n && n.length > 0 && !Be(n)) {
		let e = n.find((e) => e.cmd === "moveTo"), r = n.find(Pe);
		if (e && r) {
			let n = Ie(e.x, e.y, r);
			(Math.abs(n.dx) > J || Math.abs(n.dy) > J) && (t.start = Fe(e.x, e.y, -n.dx, -n.dy));
		}
	}
	let r = e[e.length - 1];
	if (r && r.length > 0 && !Be(r)) {
		let e = 0, n = 0, i = -1;
		for (let e = 0; e < r.length; e++) Pe(r[e]) && (i = e);
		if (i >= 0) {
			for (let t = 0; t < i; t++) ({x: e, y: n} = Le(e, n, r[t]));
			let a = Re(e, n, r[i]);
			(Math.abs(a.dx) > J || Math.abs(a.dy) > J) && (t.end = Fe(a.x, a.y, a.dx, a.dy));
		}
	}
	return t;
}
//#endregion
//#region packages/core/src/image/duotone-bitmap-by-path.ts
function He(e, t) {
	return t ? `${e}|duo:${t.clr1}:${t.clr2}` : e;
}
var Ue = /* @__PURE__ */ new WeakMap();
function We(e) {
	let t = Ue.get(e);
	return t || (t = /* @__PURE__ */ new Map(), Ue.set(e, t)), t;
}
async function Ge(e, t, n, r, i = {}) {
	let { offscreenFactory: a, ...o } = i, c = await Ee(e, t, r, o);
	if (!n || !c) return c;
	let l = We(r), u = He(e, n), d = l.get(u);
	return d || (d = (async () => {
		let { w: e, h: t } = s(c);
		return e <= 0 || t <= 0 ? c : await p(c, n, {
			width: e,
			height: t,
			offscreenFactory: a
		});
	})(), d.catch(() => l.delete(u)), l.set(u, d)), d;
}
function Ke(e) {
	let t = Ue.get(e);
	if (t) {
		for (let e of t.values()) e.then((e) => e?.close()).catch(() => {});
		t.clear(), Ue.delete(e);
	}
}
var qe = {
	textarchdown: {
		adj: [["adj", "val 0"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["nv1", "+- 0 0 v1"],
			["stAng", "?: nv1 v2 v1"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- adval 0 stAng"],
			["d2", "+- d1 0 21600000"],
			["v3", "+- 0 0 10800000"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["c0", "?: w1 d1 c1"],
			["swAng", "?: stAng c0 v3"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt2", "sin wd2 stAng"],
			["ht2", "cos hd2 stAng"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"wd2",
				"hd2",
				"stAng",
				"swAng"
			]]
		}]
	},
	textarchdownpour: {
		adj: [["adj1", "val 0"], ["adj2", "val 25000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["nv1", "+- 0 0 v1"],
			["stAng", "?: nv1 v2 v1"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- adval 0 stAng"],
			["d2", "+- d1 0 21600000"],
			["v3", "+- 0 0 10800000"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["c0", "?: w1 d1 c1"],
			["swAng", "?: stAng c0 v3"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt3", "sin iwd2 stAng"],
			["ht3", "cos ihd2 stAng"],
			["dx3", "cat2 iwd2 ht3 wt3"],
			["dy3", "sat2 ihd2 ht3 wt3"],
			["x3", "+- hc dx3 0"],
			["y3", "+- vc dy3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x3",
				"y3"
			], [
				"a",
				"iwd2",
				"ihd2",
				"stAng",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
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
	textarchup: {
		adj: [["adj", "val cd2"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["end", "?: v1 v1 v2"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- end 0 adval"],
			["d2", "+- 21600000 d1 0"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["swAng", "?: w1 d1 c1"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
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
				"adval",
				"swAng"
			]]
		}]
	},
	textarchuppour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["end", "?: v1 v1 v2"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- end 0 adval"],
			["d2", "+- 21600000 d1 0"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["swAng", "?: w1 d1 c1"],
			["wt1", "sin wd2 adval"],
			["ht1", "cos hd2 adval"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
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
				"adval",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"iwd2",
				"ihd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textbutton: {
		adj: [["adj", "val 10800000"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["bot", "+- 5400000 0 adval"],
			["lef", "+- 10800000 0 adval"],
			["top", "+- 16200000 0 adval"],
			["rig", "+- 21600000 0 adval"],
			["c3", "?: top adval 0"],
			["c2", "?: lef 10800000 c3"],
			["c1", "?: bot rig c2"],
			["stAng", "?: adval c1 0"],
			["w1", "+- 21600000 0 stAng"],
			["stAngB", "?: stAng w1 0"],
			["td1", "*/ bot 2 1"],
			["td2", "*/ top 2 1"],
			["ntd2", "+- 0 0 td2"],
			["w2", "+- 0 0 10800000"],
			["c6", "?: top ntd2 w2"],
			["c5", "?: lef 10800000 c6"],
			["c4", "?: bot td1 c5"],
			["v1", "?: adval c4 10800000"],
			["swAngT", "+- 0 0 v1"],
			["stT", "?: lef stAngB stAng"],
			["stB", "?: lef stAng stAngB"],
			["swT", "?: lef v1 swAngT"],
			["swB", "?: lef swAngT v1"],
			["wt1", "sin wd2 stT"],
			["ht1", "cos hd2 stT"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt2", "sin wd2 stB"],
			["ht2", "cos hd2 stB"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt3", "sin wd2 adj"],
			["ht3", "cos hd2 adj"],
			["dx3", "cat2 wd2 ht3 wt3"],
			["dy3", "sat2 hd2 ht3 wt3"],
			["x3", "+- hc dx3 0"],
			["y3", "+- vc dy3 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
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
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"vc"
				], [
					"l",
					"r",
					"vc"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x2",
					"y2"
				], [
					"a",
					"wd2",
					"hd2",
					"stB",
					"swB"
				]]
			}
		]
	},
	textbuttonpour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["bot", "+- 5400000 0 adval"],
			["lef", "+- 10800000 0 adval"],
			["top", "+- 16200000 0 adval"],
			["rig", "+- 21600000 0 adval"],
			["c3", "?: top adval 0"],
			["c2", "?: lef 10800000 c3"],
			["c1", "?: bot rig c2"],
			["stAng", "?: adval c1 0"],
			["w1", "+- 21600000 0 stAng"],
			["stAngB", "?: stAng w1 0"],
			["td1", "*/ bot 2 1"],
			["td2", "*/ top 2 1"],
			["ntd2", "+- 0 0 td2"],
			["w2", "+- 0 0 10800000"],
			["c6", "?: top ntd2 w2"],
			["c5", "?: lef 10800000 c6"],
			["c4", "?: bot td1 c5"],
			["v1", "?: adval c4 10800000"],
			["swAngT", "+- 0 0 v1"],
			["stT", "?: lef stAngB stAng"],
			["stB", "?: lef stAng stAngB"],
			["swT", "?: lef v1 swAngT"],
			["swB", "?: lef swAngT v1"],
			["wt1", "sin wd2 stT"],
			["ht1", "cos hd2 stT"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt6", "sin wd2 stB"],
			["ht6", "cos hd2 stB"],
			["dx6", "cat2 wd2 ht6 wt6"],
			["dy6", "sat2 hd2 ht6 wt6"],
			["x6", "+- hc dx6 0"],
			["y6", "+- vc dy6 0"],
			["adval2", "pin 40000 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 stT"],
			["ht2", "cos ihd2 stT"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt5", "sin iwd2 stB"],
			["ht5", "cos ihd2 stB"],
			["dx5", "cat2 iwd2 ht5 wt5"],
			["dy5", "sat2 ihd2 ht5 wt5"],
			["x5", "+- hc dx5 0"],
			["y5", "+- vc dy5 0"],
			["d1", "+- hd2 0 ihd2"],
			["d12", "*/ d1 1 2"],
			["yu", "+- vc 0 d12"],
			["yd", "+- vc d12 0"],
			["v1", "*/ d12 d12 1"],
			["v2", "*/ ihd2 ihd2 1"],
			["v3", "*/ v1 1 v2"],
			["v4", "+- 1 0 v3"],
			["v5", "*/ iwd2 iwd2 1"],
			["v6", "*/ v4 v5 1"],
			["v7", "sqrt v6"],
			["xl", "+- hc 0 v7"],
			["xr", "+- hc v7 0"],
			["wtadj", "sin iwd2 adj1"],
			["htadj", "cos ihd2 adj1"],
			["dxadj", "cat2 iwd2 htadj wtadj"],
			["dyadj", "sat2 ihd2 htadj wtadj"],
			["xadj", "+- hc dxadj 0"],
			["yadj", "+- vc dyadj 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
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
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x2",
					"y2"
				], [
					"a",
					"iwd2",
					"ihd2",
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"xl",
					"yu"
				], [
					"l",
					"xr",
					"yu"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"xl",
					"yd"
				], [
					"l",
					"xr",
					"yd"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x5",
					"y5"
				], [
					"a",
					"iwd2",
					"ihd2",
					"stB",
					"swB"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x6",
					"y6"
				], [
					"a",
					"wd2",
					"hd2",
					"stB",
					"swB"
				]]
			}
		]
	},
	textcandown: {
		adj: [["adj", "val 14286"]],
		gd: [
			["a", "pin 0 adj 33333"],
			["dy", "*/ a h 100000"],
			["y0", "+- t dy 0"],
			["y1", "+- b 0 dy"],
			["ncd2", "*/ cd2 -1 1"]
		],
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
				"a",
				"wd2",
				"dy",
				"cd2",
				"ncd2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"ncd2"
			]]
		}]
	},
	textcanup: {
		adj: [["adj", "val 85714"]],
		gd: [
			["a", "pin 66667 adj 100000"],
			["dy1", "*/ a h 100000"],
			["dy", "+- h 0 dy1"],
			["y0", "+- t dy1 0"],
			["y1", "+- t dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"cd2"
			]]
		}, {
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
				"a",
				"wd2",
				"dy",
				"cd2",
				"cd2"
			]]
		}]
	},
	textcascadedown: {
		adj: [["adj", "val 44444"]],
		gd: [
			["a", "pin 28570 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["dy2", "+- h 0 dy"],
			["dy3", "*/ dy2 1 4"],
			["y2", "+- t dy3 0"]
		],
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
				"y2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textcascadeup: {
		adj: [["adj", "val 44444"]],
		gd: [
			["a", "pin 28570 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["dy2", "+- h 0 dy"],
			["dy3", "*/ dy2 1 4"],
			["y2", "+- t dy3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
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
				"y1"
			]]
		}]
	},
	textchevron: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["y", "*/ a h 100000"],
			["y1", "+- t b y"]
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
					"y"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}, {
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
					"hc",
					"y1"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	textchevroninverted: {
		adj: [["adj", "val 75000"]],
		gd: [
			["a", "pin 50000 adj 100000"],
			["y", "*/ a h 100000"],
			["y1", "+- b 0 y"]
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
					"y1"
				],
				[
					"l",
					"r",
					"t"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}]
	},
	textcircle: {
		adj: [["adj", "val 10800000"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["d0", "+- adval 0 10800000"],
			["d1", "+- 10800000 0 adval"],
			["d2", "+- 21600000 0 adval"],
			["d3", "?: d1 d1 10799999"],
			["d4", "?: d0 d2 d3"],
			["swAng", "*/ d4 2 1"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
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
				"adval",
				"swAng"
			]]
		}]
	},
	textcirclepour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["d0", "+- adval 0 10800000"],
			["d1", "+- 10800000 0 adval"],
			["d2", "+- 21600000 0 adval"],
			["d3", "?: d1 d1 10799999"],
			["d4", "?: d0 d2 d3"],
			["swAng", "*/ d4 2 1"],
			["wt1", "sin wd2 adval"],
			["ht1", "cos hd2 adval"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
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
				"adval",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"iwd2",
				"ihd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textcurvedown: {
		adj: [["adj", "val 45977"]],
		gd: [
			["a", "pin 0 adj 56338"],
			["dy", "*/ a h 100000"],
			["gd1", "*/ dy 3 4"],
			["gd2", "*/ dy 5 4"],
			["gd3", "*/ dy 3 8"],
			["gd4", "*/ dy 1 8"],
			["gd5", "+- h 0 gd3"],
			["gd6", "+- gd4 h 0"],
			["y0", "+- t dy 0"],
			["y1", "+- t gd1 0"],
			["y2", "+- t gd2 0"],
			["y3", "+- t gd3 0"],
			["y4", "+- t gd4 0"],
			["y5", "+- t gd5 0"],
			["y6", "+- t gd6 0"],
			["x1", "+- l wd3 0"],
			["x2", "+- r 0 wd3"]
		],
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
				"C",
				"x1",
				"y1",
				"x2",
				"y2",
				"r",
				"y0"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y5"
			], [
				"C",
				"x1",
				"y6",
				"x2",
				"y6",
				"r",
				"y5"
			]]
		}]
	},
	textcurveup: {
		adj: [["adj", "val 45977"]],
		gd: [
			["a", "pin 0 adj 56338"],
			["dy", "*/ a h 100000"],
			["gd1", "*/ dy 3 4"],
			["gd2", "*/ dy 5 4"],
			["gd3", "*/ dy 3 8"],
			["gd4", "*/ dy 1 8"],
			["gd5", "+- h 0 gd3"],
			["gd6", "+- gd4 h 0"],
			["y0", "+- t dy 0"],
			["y1", "+- t gd1 0"],
			["y2", "+- t gd2 0"],
			["y3", "+- t gd3 0"],
			["y4", "+- t gd4 0"],
			["y5", "+- t gd5 0"],
			["y6", "+- t gd6 0"],
			["x1", "+- l wd3 0"],
			["x2", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y0"
			], [
				"C",
				"x1",
				"y2",
				"x2",
				"y1",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y5"
			], [
				"C",
				"x1",
				"y6",
				"x2",
				"y6",
				"r",
				"y5"
			]]
		}]
	},
	textdeflate: {
		adj: [["adj", "val 18750"]],
		gd: [
			["a", "pin 0 adj 37500"],
			["dy", "*/ a ss 100000"],
			["gd0", "*/ dy 4 3"],
			["gd1", "+- h 0 gd0"],
			["adjY", "+- t dy 0"],
			["y0", "+- t gd0 0"],
			["y1", "+- t gd1 0"],
			["x0", "+- l wd3 0"],
			["x1", "+- r 0 wd3"]
		],
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
				"C",
				"x0",
				"y0",
				"x1",
				"y0",
				"r",
				"t"
			]]
		}, {
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
				"C",
				"x0",
				"y1",
				"x1",
				"y1",
				"r",
				"b"
			]]
		}]
	},
	textdeflatebottom: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 6250 adj 100000"],
			["dy", "*/ a ss 100000"],
			["dy2", "+- h 0 dy"],
			["y1", "+- t dy 0"],
			["cp", "+- y1 0 dy2"]
		],
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
				"t"
			]]
		}, {
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
				"Q",
				"hc",
				"cp",
				"r",
				"b"
			]]
		}]
	},
	textdeflateinflate: {
		adj: [["adj", "val 35000"]],
		gd: [
			["a", "pin 5000 adj 95000"],
			["dy", "*/ a h 100000"],
			["del", "*/ h 5 100"],
			["dh1", "*/ h 45 100"],
			["dh2", "*/ h 55 100"],
			["yh", "+- dy 0 del"],
			["yl", "+- dy del 0"],
			["y3", "+- yh yh dh1"],
			["y4", "+- yl yl dh2"]
		],
		paths: [
			{
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
					"t"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"dh1"
				], [
					"Q",
					"hc",
					"y3",
					"r",
					"dh1"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"dh2"
				], [
					"Q",
					"hc",
					"y4",
					"r",
					"dh2"
				]]
			},
			{
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
					"b"
				]]
			}
		]
	},
	textdeflateinflatedeflate: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 3000 adj 47000"],
			["dy", "*/ a h 100000"],
			["del", "*/ h 3 100"],
			["ey1", "*/ h 30 100"],
			["ey2", "*/ h 36 100"],
			["ey3", "*/ h 63 100"],
			["ey4", "*/ h 70 100"],
			["by", "+- b 0 dy"],
			["yh1", "+- dy 0 del"],
			["yl1", "+- dy del 0"],
			["yh2", "+- by 0 del"],
			["yl2", "+- by del 0"],
			["y1", "+- yh1 yh1 ey1"],
			["y2", "+- yl1 yl1 ey2"],
			["y3", "+- yh2 yh2 ey3"],
			["y4", "+- yl2 yl2 ey4"]
		],
		paths: [
			{
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
					"t"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey1"
				], [
					"Q",
					"hc",
					"y1",
					"r",
					"ey1"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey2"
				], [
					"Q",
					"hc",
					"y2",
					"r",
					"ey2"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey3"
				], [
					"Q",
					"hc",
					"y3",
					"r",
					"ey3"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey4"
				], [
					"Q",
					"hc",
					"y4",
					"r",
					"ey4"
				]]
			},
			{
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
					"b"
				]]
			}
		]
	},
	textdeflatetop: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 0 adj 93750"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["cp", "+- y1 dy 0"]
		],
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
				"Q",
				"hc",
				"cp",
				"r",
				"t"
			]]
		}, {
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
				"b"
			]]
		}]
	},
	textdoublewave1: {
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
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
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
			["xAdj", "+- hc of 0"]
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
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x9",
					"y4"
				],
				[
					"C",
					"x10",
					"y5",
					"x11",
					"y6",
					"x12",
					"y4"
				],
				[
					"C",
					"x13",
					"y5",
					"x14",
					"y6",
					"x15",
					"y4"
				]
			]
		}]
	},
	textfadedown: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dx", "*/ a w 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"]
		],
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
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"b"
			], [
				"l",
				"x2",
				"b"
			]]
		}]
	},
	textfadeleft: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textfaderight: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
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
				"y1"
			]]
		}, {
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
				"y2"
			]]
		}]
	},
	textfadeup: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dx", "*/ a w 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"t"
			], [
				"l",
				"x2",
				"t"
			]]
		}, {
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
				"b"
			]]
		}]
	},
	textinflate: {
		adj: [["adj", "val 18750"]],
		gd: [
			["a", "pin 0 adj 20000"],
			["dy", "*/ a h 100000"],
			["gd", "*/ dy 1 3"],
			["gd0", "+- 0 0 gd"],
			["gd1", "+- h 0 gd0"],
			["ty", "+- t dy 0"],
			["by", "+- b 0 dy"],
			["y0", "+- t gd0 0"],
			["y1", "+- t gd1 0"],
			["x0", "+- l wd3 0"],
			["x1", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"C",
				"x0",
				"y0",
				"x1",
				"y0",
				"r",
				"ty"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"by"
			], [
				"C",
				"x0",
				"y1",
				"x1",
				"y1",
				"r",
				"by"
			]]
		}]
	},
	textinflatebottom: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 60000 adj 100000"],
			["dy", "*/ a h 100000"],
			["ty", "+- t dy 0"]
		],
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
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"Q",
				"hc",
				"b",
				"r",
				"ty"
			]]
		}]
	},
	textinflatetop: {
		adj: [["adj", "val 40000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dy", "*/ a h 100000"],
			["ty", "+- t dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"Q",
				"hc",
				"t",
				"r",
				"ty"
			]]
		}, {
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
				"b"
			]]
		}]
	},
	textplain: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 30000 adj 70000"],
			["mid", "*/ a w 100000"],
			["midDir", "+- mid 0 hc"],
			["dl", "+- mid 0 l"],
			["dr", "+- r 0 mid"],
			["dl2", "*/ dl 2 1"],
			["dr2", "*/ dr 2 1"],
			["dx", "?: midDir dr2 dl2"],
			["xr", "+- l dx 0"],
			["xl", "+- r 0 dx"],
			["tlx", "?: midDir l xl"],
			["trx", "?: midDir xr r"],
			["blx", "?: midDir xl l"],
			["brx", "?: midDir r xr"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"tlx",
				"t"
			], [
				"l",
				"trx",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"blx",
				"b"
			], [
				"l",
				"brx",
				"b"
			]]
		}]
	},
	textringinside: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 50000 adj 99000"],
			["dy", "*/ a h 100000"],
			["y", "+- t dy 0"],
			["r", "*/ dy 1 2"],
			["y1", "+- t r 0"],
			["y2", "+- b 0 r"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"21599999"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"21599999"
			]]
		}]
	},
	textringoutside: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 50000 adj 99000"],
			["dy", "*/ a h 100000"],
			["y", "+- t dy 0"],
			["r", "*/ dy 1 2"],
			["y1", "+- t r 0"],
			["y2", "+- b 0 r"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"-21599999"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"-21599999"
			]]
		}]
	},
	textslantdown: {
		adj: [["adj", "val 44445"]],
		gd: [
			["a", "pin 28569 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
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
				"y2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textslantup: {
		adj: [["adj", "val 55555"]],
		gd: [
			["a", "pin 0 adj 71431"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
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
				"y2"
			]]
		}]
	},
	textstop: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 14286 adj 50000"],
			["dx", "*/ w 1 3"],
			["dy", "*/ a h 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
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
					"y1"
				]
			]
		}, {
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
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"r",
					"y2"
				]
			]
		}]
	},
	texttriangle: {
		adj: [["adj", "val 50000"]],
		gd: [["a", "pin 0 adj 100000"], ["y", "*/ a h 100000"]],
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
					"y"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}, {
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
				"b"
			]]
		}]
	},
	texttriangleinverted: {
		adj: [["adj", "val 50000"]],
		gd: [["a", "pin 0 adj 100000"], ["y", "*/ a h 100000"]],
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
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}]
	},
	textwave1: {
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
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
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
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y1"
			], [
				"C",
				"x3",
				"y2",
				"x4",
				"y3",
				"x5",
				"y1"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x6",
				"y4"
			], [
				"C",
				"x7",
				"y5",
				"x8",
				"y6",
				"x10",
				"y4"
			]]
		}]
	},
	textwave2: {
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
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
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
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y1"
			], [
				"C",
				"x3",
				"y3",
				"x4",
				"y2",
				"x5",
				"y1"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x6",
				"y4"
			], [
				"C",
				"x7",
				"y6",
				"x8",
				"y5",
				"x10",
				"y4"
			]]
		}]
	},
	textwave4: {
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
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
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
			["xAdj", "+- hc of 0"]
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
					"y3",
					"x4",
					"y2",
					"x5",
					"y1"
				],
				[
					"C",
					"x6",
					"y3",
					"x7",
					"y2",
					"x8",
					"y1"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x9",
					"y4"
				],
				[
					"C",
					"x10",
					"y6",
					"x11",
					"y5",
					"x12",
					"y4"
				],
				[
					"C",
					"x13",
					"y6",
					"x14",
					"y5",
					"x15",
					"y4"
				]
			]
		}]
	}
}, Je = Math.PI * 2 / 216e5, Ye = qe, Xe = /* @__PURE__ */ new Map();
function Ze(e) {
	return e.toLowerCase() in Ye;
}
function Qe(e) {
	let t = Xe.get(e);
	if (t) return t;
	let n = Ye[e];
	return n ? (t = {
		adj: n.adj.map(([e, t]) => [e, c(t)]),
		gd: n.gd.map(([e, t]) => [e, c(t)]),
		paths: n.paths
	}, Xe.set(e, t), t) : null;
}
var $e = 48;
function et(e, t, n, r) {
	let i = e.w == null ? 1 : n / e.w, a = e.h == null ? 1 : r / e.h, o = (e) => e * i, s = (e) => e * a, c = [], l = 0, u = 0;
	for (let n of e.cmds) switch (n[0]) {
		case "m":
			l = o(t.resolve(n[1])), u = s(t.resolve(n[2])), c.push({
				x: l,
				y: u
			});
			break;
		case "l":
			l = o(t.resolve(n[1])), u = s(t.resolve(n[2])), c.push({
				x: l,
				y: u
			});
			break;
		case "C": {
			let e = o(t.resolve(n[1])), r = s(t.resolve(n[2])), i = o(t.resolve(n[3])), a = s(t.resolve(n[4])), d = o(t.resolve(n[5])), f = s(t.resolve(n[6]));
			for (let t = 1; t <= $e; t++) {
				let n = t / $e, o = 1 - n, s = o * o * o * l + 3 * o * o * n * e + 3 * o * n * n * i + n * n * n * d, p = o * o * o * u + 3 * o * o * n * r + 3 * o * n * n * a + n * n * n * f;
				c.push({
					x: s,
					y: p
				});
			}
			l = d, u = f;
			break;
		}
		case "Q": {
			let e = o(t.resolve(n[1])), r = s(t.resolve(n[2])), i = o(t.resolve(n[3])), a = s(t.resolve(n[4]));
			for (let t = 1; t <= $e; t++) {
				let n = t / $e, o = 1 - n, s = o * o * l + 2 * o * n * e + n * n * i, d = o * o * u + 2 * o * n * r + n * n * a;
				c.push({
					x: s,
					y: d
				});
			}
			l = i, u = a;
			break;
		}
		case "a": {
			let e = t.resolve(n[1]), r = t.resolve(n[2]), o = e * i, s = r * a, d = t.resolve(n[3]) * Je, f = t.resolve(n[4]) * Je, p = (t) => Math.atan2(e * Math.sin(t), r * Math.cos(t)), m = Math.PI * 2, h = p(d), g = Math.trunc(f / m), _ = f - g * m, v = p(d + _) - h;
			_ > 0 && v < 0 ? v += m : _ < 0 && v > 0 && (v -= m);
			let y = v + g * m, b = l - o * Math.cos(h), x = u - s * Math.sin(h), S = Math.max($e, Math.ceil(Math.abs(y) / m * 96));
			for (let e = 1; e <= S; e++) {
				let t = h + y * e / S;
				c.push({
					x: b + o * Math.cos(t),
					y: x + s * Math.sin(t)
				});
			}
			l = b + o * Math.cos(h + y), u = x + s * Math.sin(h + y);
			break;
		}
		case "c": break;
	}
	return c;
}
function tt(e) {
	let t = [0];
	for (let n = 1; n < e.length; n++) {
		let r = e[n].x - e[n - 1].x, i = e[n].y - e[n - 1].y;
		t.push(t[n - 1] + Math.hypot(r, i));
	}
	return t;
}
function nt(e, t, n, r) {
	let i = Qe(e.toLowerCase());
	if (!i || i.paths.length === 0) return null;
	let a = f({
		w: n,
		h: r,
		adj: t
	}, i.adj, i.gd), o = i.paths.length === 1, s = et(i.paths[0], a, n, r), c = o ? s : et(i.paths[i.paths.length - 1], a, n, r);
	return {
		top: s,
		bottom: c,
		topLen: tt(s),
		bottomLen: tt(c),
		singleEdge: o
	};
}
function rt(e, t, n) {
	let r = t[t.length - 1];
	if (e.length === 1 || r === 0) return {
		x: e[0].x,
		y: e[0].y,
		tx: 1,
		ty: 0
	};
	let i = Math.max(0, Math.min(1, n)) * r, a = 0, o = t.length - 1;
	for (; a < o - 1;) {
		let e = a + o >> 1;
		t[e] <= i ? a = e : o = e;
	}
	let s = t[o] - t[a] || 1, c = (i - t[a]) / s, l = e[a], u = e[o], d = u.x - l.x, f = u.y - l.y, p = Math.hypot(d, f) || 1;
	return {
		x: l.x + d * c,
		y: l.y + f * c,
		tx: d / p,
		ty: f / p
	};
}
function it(e) {
	return e.topLen[e.topLen.length - 1] ?? 0;
}
function at(e, t) {
	if (!e.singleEdge) return 1;
	let n = it(e);
	return n <= 0 ? 1 : Math.max(0, Math.min(1, t / n));
}
function ot(e, t, n, r) {
	if (e.singleEdge) {
		let i = rt(e.top, e.topLen, t), a = Math.atan2(i.ty, i.tx), o = i.ty, s = -i.tx, c = n * (1 - r);
		return {
			x: i.x - o * c,
			y: i.y - s * c,
			angle: a,
			vScale: 1,
			shear: 0
		};
	}
	let i = rt(e.top, e.topLen, t), a = rt(e.bottom, e.bottomLen, t), o = a.x - i.x, s = a.y - i.y, c = i.x + o * r, l = i.y + s * r, u = i.tx + a.tx, d = i.ty + a.ty, f = Math.atan2(d, u), p = Math.cos(f), m = Math.sin(f), h = (p * o + m * s) / (n > 0 ? n : 1), g = (-m * o + p * s) / (n > 0 ? n : 1);
	return {
		x: c,
		y: l,
		angle: f,
		vScale: g === 0 ? n > 0 ? Math.hypot(o, s) / n : 1 : g,
		shear: g === 0 ? 0 : h / g
	};
}
//#endregion
//#region packages/core/src/shape/effects.ts
function st(e, t) {
	return e * t;
}
function ct(e) {
	return e.getContext("2d") ?? null;
}
function lt(e, t, n, r) {
	let i = Math.max(0, Math.floor(e.x - t)), a = Math.max(0, Math.floor(e.y - t)), o = Math.min(n, Math.ceil(e.x + e.w + t)), s = Math.min(r, Math.ceil(e.y + e.h + t));
	return {
		x: i,
		y: a,
		w: Math.max(1, o - i),
		h: Math.max(1, s - a)
	};
}
function ut(e, t) {
	if (t.x === 0 && t.y === 0) return e;
	let n = t.x, r = t.y;
	return new Proxy(e, {
		get(e, t) {
			if (t === "setTransform") return (t) => {
				e.setTransform(t.a, t.b, t.c, t.d, t.e - n, t.f - r);
			};
			let i = Reflect.get(e, t);
			return typeof i == "function" ? i.bind(e) : i;
		},
		set(e, t, n) {
			return e[t] = n, !0;
		}
	});
}
function dt(e, t, n, r, i, a, o) {
	let s = st(r.blur, i), c = st(r.dist, i), l = r.dir * Math.PI / 180, u = Math.cos(l) * c, d = Math.sin(l) * c, f = lt(n, Math.ceil(3 * s + Math.abs(c)) + 2, a, o), p = U(f.w, f.h);
	if (!p) return;
	let m = ct(p);
	if (!m) return;
	let h = ut(m, f);
	h.save(), h.fillStyle = T(r.color, r.alpha), t(h), h.restore(), h.save(), h.globalCompositeOperation = "destination-out", h.filter = s > 0 ? `blur(${s}px)` : "none", h.translate(u, d), h.fillStyle = "#000", t(h), h.restore(), h.save(), h.globalCompositeOperation = "destination-in", h.filter = "none", h.fillStyle = "#000", t(h), h.restore(), e.save(), e.drawImage(p, f.x, f.y), e.restore();
}
function ft(e, t, n, r, i, a, o, s) {
	let c = st(r.radius, i);
	if (c <= 0) {
		t(e);
		return;
	}
	let l = lt(n, Math.ceil(c) + 2, a, o), u = n.x - l.x, d = n.y - l.y, f = U(l.w, l.h);
	if (!f) {
		t(e);
		return;
	}
	let p = ct(f);
	if (!p) {
		t(e);
		return;
	}
	let m = ut(p, l), h = s ?? t;
	t(m);
	let g = U(l.w, l.h), _ = U(l.w, l.h), v = g ? ct(g) : null, y = _ ? ct(_) : null;
	if (g && v && _ && y) {
		let t = ut(v, l);
		t.fillStyle = "#000", h(t), y.drawImage(f, u, d, n.w, n.h, u - c, d - c, n.w + c * 2, n.h + c * 2), y.drawImage(f, 0, 0), y.globalCompositeOperation = "destination-in", y.filter = `blur(${c / 3}px)`, y.drawImage(g, 0, 0), y.filter = "none", y.globalCompositeOperation = "source-over", e.save(), e.drawImage(_, l.x, l.y), e.restore();
		return;
	}
	e.save(), e.drawImage(f, 0, 0), e.restore();
}
function pt(e, t, n, r, i, a, o) {
	let s = U(a, o);
	if (!s) return;
	let c = ct(s);
	if (!c) return;
	let l = st(r.blur, i);
	c.save(), l > 0 && (c.filter = `blur(${l}px)`), t(c), c.restore(), c.save(), c.globalCompositeOperation = "destination-in";
	let u = n.y, d = n.y + n.h, f = c.createLinearGradient(0, d, 0, u), p = mt(r.stPos), m = mt(r.endPos);
	f.addColorStop(0, `rgba(0,0,0,${r.stA})`), p > 0 && f.addColorStop(p, `rgba(0,0,0,${r.stA})`), m < 1 && m > p && f.addColorStop(m, `rgba(0,0,0,${r.endA})`), f.addColorStop(1, `rgba(0,0,0,${r.endA})`), c.fillStyle = f, c.fillRect(0, 0, a, o), c.restore();
	let h = st(r.dist, i), g = r.dir * Math.PI / 180, _ = Math.cos(g) * h, v = Math.sin(g) * h;
	e.save(), e.translate(n.x + _, d + v), e.scale(r.sx, r.sy), e.translate(-n.x, -d), e.drawImage(s, 0, 0), e.restore();
}
function mt(e) {
	return e < 0 ? 0 : e > 1 ? 1 : e;
}
//#endregion
//#region packages/core/src/shape/scene3d-camera.ts
var Y = 26, ht = {
	orthographicFront: {
		kind: "orthographic",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: 0
	},
	perspectiveFront: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveRelaxed: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveRelaxedModerately: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveAbove: {
		kind: "perspective",
		baseLat: -20,
		baseLon: 0,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveBelow: {
		kind: "perspective",
		baseLat: 20,
		baseLon: 0,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveLeft: {
		kind: "perspective",
		baseLat: 0,
		baseLon: -20,
		baseRev: 0,
		fovDeg: Y
	},
	perspectiveRight: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 20,
		baseRev: 0,
		fovDeg: Y
	}
};
function gt(e, t) {
	let n = Array(9).fill(0);
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) {
		let a = 0;
		for (let n = 0; n < 3; n++) a += e[r * 3 + n] * t[n * 3 + i];
		n[r * 3 + i] = a;
	}
	return n;
}
function _t(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		1,
		0,
		0,
		0,
		n,
		-r,
		0,
		r,
		n
	];
}
function vt(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		n,
		0,
		r,
		0,
		1,
		0,
		-r,
		0,
		n
	];
}
function yt(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		n,
		-r,
		0,
		r,
		n,
		0,
		0,
		0,
		1
	];
}
function bt(e, t, n, r) {
	return [
		e[0] * t + e[1] * n + e[2] * r,
		e[3] * t + e[4] * n + e[5] * r,
		e[6] * t + e[7] * n + e[8] * r
	];
}
function xt(e, t) {
	let n = t ? t.lat : e.baseLat, r = t ? t.lon : e.baseLon;
	return gt(yt(-(t ? t.rev : e.baseRev)), gt(_t(-n), vt(-r)));
}
function St(e) {
	return ht[e] ?? ht.orthographicFront;
}
function Ct(e, t, n) {
	let r = St(e.prst), i = xt(r, e.rot);
	if (t <= 0 || n <= 0) return {
		corners: [
			{
				x: 0,
				y: 0
			},
			{
				x: t,
				y: 0
			},
			{
				x: t,
				y: n
			},
			{
				x: 0,
				y: n
			}
		],
		isAffine: !0,
		isIdentity: !0
	};
	let a = t / 2, o = n / 2, s = [
		[-a, -o],
		[a, -o],
		[a, o],
		[-a, o]
	], c = e.zoom ?? 1, l = Math.max(a, o), u;
	if (r.kind === "perspective") {
		let t = e.fov ?? r.fovDeg, n = Math.max(1, Math.min(179, t)) * Math.PI / 180, a = l / Math.tan(n / 2);
		u = s.map(([e, t]) => {
			let [n, r, o] = bt(i, e, t, 0), s = a - o, c = a / (Math.abs(s) < 1e-6 ? 1e-6 * Math.sign(s || 1) : s);
			return [n * c, r * c];
		});
	} else u = s.map(([e, t]) => {
		let [n, r] = bt(i, e, t, 0);
		return [n, r];
	});
	u = u.map(([e, t]) => [e * c, t * c]);
	let d = Infinity, f = Infinity, p = -Infinity, m = -Infinity;
	for (let [e, t] of u) e < d && (d = e), t < f && (f = t), e > p && (p = e), t > m && (m = t);
	let h = p - d || 1, g = m - f || 1, _ = Math.min(t / h, n / g), v = (d + p) / 2, y = (f + m) / 2, b = u.map(([e, r]) => ({
		x: t / 2 + (e - v) * _,
		y: n / 2 + (r - y) * _
	})), x = .001 * Math.max(t, n), S = b[0].x + b[2].x - (b[1].x + b[3].x), C = b[0].y + b[2].y - (b[1].y + b[3].y), w = Math.abs(S) < x && Math.abs(C) < x, T = [
		[0, 0],
		[t, 0],
		[t, n],
		[0, n]
	], E = !0;
	for (let e = 0; e < 4; e++) if (Math.abs(b[e].x - T[e][0]) > x || Math.abs(b[e].y - T[e][1]) > x) {
		E = !1;
		break;
	}
	return {
		corners: b,
		isAffine: w,
		isIdentity: E
	};
}
function wt(e) {
	let { isIdentity: t } = Ct(e, 1e3, 1e3);
	return !t;
}
function Tt(e, t, n, r) {
	let i = St(e.prst), a = xt(i, e.rot);
	if (t <= 0 || n <= 0 || r === 0) return {
		x: 0,
		y: 0
	};
	let o = t / 2, s = n / 2, c = Math.max(o, s), l = e.zoom ?? 1, u = (t) => {
		let [n, r, o] = bt(a, 0, 0, t);
		if (i.kind === "perspective") {
			let t = e.fov ?? i.fovDeg, a = Math.max(1, Math.min(179, t)) * Math.PI / 180, s = c / Math.tan(a / 2), u = s - o, d = s / (Math.abs(u) < 1e-6 ? 1e-6 * Math.sign(u || 1) : u);
			return [n * d * l, r * d * l];
		}
		return [n * l, r * l];
	}, [d, f] = u(0), [p, m] = u(-r);
	return {
		x: p - d,
		y: m - f
	};
}
//#endregion
//#region packages/core/src/shape/scene3d-draw.ts
function Et(e, t, n, r) {
	let i = e.x, a = e.y, o = t.x, s = t.y, c = n.x, l = n.y, u = r.x, d = r.y, f = o - c, p = u - c, m = i - o + c - u, h = s - l, g = d - l, _ = a - s + l - d, v, y;
	if (Math.abs(m) < 1e-12 && Math.abs(_) < 1e-12) v = 0, y = 0;
	else {
		let e = f * g - p * h;
		if (Math.abs(e) < 1e-12) return null;
		v = (m * g - p * _) / e, y = (f * _ - m * h) / e;
	}
	return [
		o - i + v * o,
		u - i + y * u,
		i,
		s - a + v * s,
		d - a + y * d,
		a,
		v,
		y,
		1
	];
}
function Dt(e, t, n) {
	let r = e[6] * t + e[7] * n + e[8];
	return {
		x: (e[0] * t + e[1] * n + e[2]) / r,
		y: (e[3] * t + e[4] * n + e[5]) / r
	};
}
var Ot = 1;
function kt(e, t) {
	let [n, r, i, a, o, s] = e, [c, l, u, d, f, p] = t;
	return [
		n * c + i * l,
		r * c + a * l,
		n * u + i * d,
		r * u + a * d,
		n * f + i * p + o,
		r * f + a * p + s
	];
}
function At(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	let p = c - o, m = l - s;
	if (p <= 0 || m <= 0) return;
	let h = (d.x - u.x) / p, g = (d.y - u.y) / p, _ = (f.x - u.x) / m, v = (f.y - u.y) / m, y = (Math.hypot(d.x - u.x, d.y - u.y) || 1) * a, b = (Math.hypot(f.x - u.x, f.y - u.y) || 1) * a, x = Ot * p / y, S = Ot * m / b, C = Math.max(0, o - x), w = Math.max(0, s - S), T = Math.min(n, c + x), E = Math.min(r, l + S), D = T - C, O = E - w;
	if (D <= 0 || O <= 0) return;
	e.save();
	let [k, A, j, M, N, P] = kt(i, [
		h,
		g,
		_,
		v,
		u.x - o * h - s * _,
		u.y - o * g - s * v
	]);
	e.setTransform(k, A, j, M, N, P), e.drawImage(t, C, w, D, O, C, w, D, O), e.restore();
}
function jt(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	let p = Dt(o, s, c), m = Dt(o, l, c), h = Dt(o, s, u), g = Dt(o, l, u), _ = (s + l) / 2, v = (c + u) / 2, y = Dt(o, _, v), b = {
		x: (p.x + m.x + h.x + g.x) / 4,
		y: (p.y + m.y + h.y + g.y) / 4
	}, x = Nt(i), S = Math.hypot(y.x - b.x, y.y - b.y) * x;
	if (f <= 0 || S <= d) {
		At(e, t, n, r, i, a, s * n, c * r, l * n, u * r, p, m, h);
		return;
	}
	l - s >= u - c ? (jt(e, t, n, r, i, a, o, s, c, _, u, d, f - 1), jt(e, t, n, r, i, a, o, _, c, l, u, d, f - 1)) : (jt(e, t, n, r, i, a, o, s, c, l, v, d, f - 1), jt(e, t, n, r, i, a, o, s, v, l, u, d, f - 1));
}
function Mt(e, t, n, r, i, a = .5) {
	if (n <= 0 || r <= 0) return;
	let [o, s, c, l] = i;
	if (Math.abs(o.x * s.y - s.x * o.y + s.x * c.y - c.x * s.y + c.x * l.y - l.x * c.y + l.x * o.y - o.x * l.y) / 2 < 1e-6) return;
	let u = Et(i[0], i[1], i[2], i[3]);
	if (!u) return;
	let d = t.getTransform(), f = [
		d.a,
		d.b,
		d.c,
		d.d,
		d.e,
		d.f
	], p = Nt(f);
	Rt(e, t, n, r, i, f, p, u, a, 14) || (It(), t.save(), t.beginPath(), t.moveTo(i[0].x, i[0].y), t.lineTo(i[1].x, i[1].y), t.lineTo(i[2].x, i[2].y), t.lineTo(i[3].x, i[3].y), t.closePath(), t.clip(), jt(t, e, n, r, f, p, u, 0, 0, 1, 1, a, 14), t.restore());
}
function Nt(e) {
	return Math.sqrt(Math.abs(e[0] * e[3] - e[1] * e[2])) || 1;
}
function Pt(e, t, n) {
	let r = Et(e[0], e[1], e[2], e[3]);
	if (!r) return null;
	let i = [
		[-t, -n],
		[1 + t, -n],
		[1 + t, 1 + n],
		[-t, 1 + n]
	], a = [];
	for (let [e, t] of i) {
		if (!(r[6] * e + r[7] * t + r[8] > 1e-9)) return null;
		a.push(Dt(r, e, t));
	}
	return a;
}
var Ft = !1;
function It() {
	Ft || (Ft = !0, typeof console < "u" && typeof console.warn == "function" && console.warn("[ooxml] scene3d: no offscreen canvas available — using the direct warp fallback (per-cell bleed only, no supersample). Textured-source seams may be faintly visible; the silhouette and geometry are unaffected."));
}
var Lt = 2;
function Rt(e, t, n, r, i, a, o, s, c, l) {
	let u = i.map((e) => ({
		x: a[0] * e.x + a[2] * e.y + a[4],
		y: a[1] * e.x + a[3] * e.y + a[5]
	})), d = Infinity, f = Infinity, p = -Infinity, m = -Infinity;
	for (let e of u) e.x < d && (d = e.x), e.y < f && (f = e.y), e.x > p && (p = e.x), e.y > m && (m = e.y);
	d = Math.floor(d) - 1, f = Math.floor(f) - 1, p = Math.ceil(p) + 1, m = Math.ceil(m) + 1;
	let h = p - d, g = m - f;
	if (h <= 0 || g <= 0) return !1;
	let _ = Math.max(1, Math.ceil(h * Lt)), v = Math.max(1, Math.ceil(g * Lt)), y = U(_, v);
	if (!y || y.width !== _ || y.height !== v) return !1;
	let b = y.getContext("2d") ?? null;
	if (!b) return !1;
	let x = Lt, S = [
		a[0] * x,
		a[1] * x,
		a[2] * x,
		a[3] * x,
		(a[4] - d) * x,
		(a[5] - f) * x
	];
	b.save(), b.setTransform(S[0], S[1], S[2], S[3], S[4], S[5]), b.beginPath(), b.moveTo(i[0].x, i[0].y), b.lineTo(i[1].x, i[1].y), b.lineTo(i[2].x, i[2].y), b.lineTo(i[3].x, i[3].y), b.closePath(), b.clip(), jt(b, e, n, r, S, o, s, 0, 0, 1, 1, c * x, l), b.restore(), t.save(), t.setTransform(1, 0, 0, 1, 0, 0);
	let C = t.imageSmoothingEnabled, w = t.imageSmoothingQuality;
	return t.imageSmoothingEnabled = !0, t.imageSmoothingQuality = "high", t.drawImage(y, 0, 0, h * x, g * x, d, f, h, g), t.imageSmoothingEnabled = C, t.imageSmoothingQuality = w, t.restore(), !0;
}
//#endregion
//#region packages/core/src/shape/bevel-shading.ts
function zt(e, t) {
	if (t <= 0) return () => 1;
	let n = (e) => Math.max(0, Math.min(1, e / t));
	switch (e) {
		case "hardEdge": {
			let e = qt;
			return (t) => {
				let r = Math.min(1, n(t) / e);
				return r * r * (3 - 2 * r);
			};
		}
		case "angle":
		case "slope": return (e) => n(e);
		case "circle":
		case "convex":
		case "softRound": return (e) => {
			let t = 1 - n(e);
			return Math.sqrt(Math.max(0, 1 - t * t));
		};
		default: return (e) => {
			let t = n(e);
			return t * t * (3 - 2 * t);
		};
	}
}
function Bt(e) {
	let t = e.length, n = new Float64Array(t);
	if (t === 0) return n;
	let r = new Int32Array(t), i = new Float64Array(t + 1), a = 0;
	r[0] = 0, i[0] = -Infinity, i[1] = Infinity;
	for (let n = 1; n < t; n++) {
		let t = (e[n] + n * n - (e[r[a]] + r[a] * r[a])) / (2 * n - 2 * r[a]);
		for (; t <= i[a];) a--, t = (e[n] + n * n - (e[r[a]] + r[a] * r[a])) / (2 * n - 2 * r[a]);
		a++, r[a] = n, i[a] = t, i[a + 1] = Infinity;
	}
	a = 0;
	for (let o = 0; o < t; o++) {
		for (; i[a + 1] < o;) a++;
		let t = o - r[a];
		n[o] = t * t + e[r[a]];
	}
	return n;
}
function Vt(e, t = 3) {
	if (e <= 0) return Array(t).fill(1);
	let n = Math.sqrt(12 * e * e / t + 1), r = Math.floor(n);
	r % 2 == 0 && r--;
	let i = r + 2, a = (12 * e * e - t * r * r - 4 * t * r - 3 * t) / (-4 * r - 4), o = Math.round(a), s = [];
	for (let e = 0; e < t; e++) s.push(e < o ? r : i);
	return s;
}
function Ht(e, t, n, r, i, a) {
	let o = 1 / (2 * i + 1);
	if (a) for (let a = 0; a < r; a++) {
		let r = a * n, s = 0;
		for (let t = 0; t <= i; t++) t < n && (s += e[r + t]);
		for (let a = 0; a < n; a++) {
			t[r + a] = s * o;
			let c = a + i + 1, l = a - i;
			c < n && (s += e[r + c]), l >= 0 && (s -= e[r + l]);
		}
	}
	else for (let a = 0; a < n; a++) {
		let s = 0;
		for (let t = 0; t <= i; t++) t < r && (s += e[t * n + a]);
		for (let c = 0; c < r; c++) {
			t[c * n + a] = s * o;
			let l = c + i + 1, u = c - i;
			l < r && (s += e[l * n + a]), u >= 0 && (s -= e[u * n + a]);
		}
	}
}
function Ut(e, t, n, r) {
	let i = Float64Array.from(e);
	if (r <= 0 || t <= 0 || n <= 0) return i;
	let a = new Float64Array(t * n);
	for (let e of Vt(r, 3)) {
		let r = Math.max(1, (e - 1) / 2);
		Ht(i, a, t, n, r, !0), Ht(a, i, t, n, r, !1);
	}
	return i;
}
function Wt(e, t, n, r = 128) {
	let i = new Float64Array(t * n);
	for (let a = 0; a < t * n; a++) i[a] = (e[a] ?? 0) >= r ? 0x56bc75e2d63100000 : 0;
	let a = new Float64Array(n);
	for (let e = 0; e < t; e++) {
		for (let r = 0; r < n; r++) a[r] = i[r * t + e];
		let r = Bt(a);
		for (let a = 0; a < n; a++) i[a * t + e] = r[a];
	}
	let o = new Float64Array(t);
	for (let e = 0; e < n; e++) {
		for (let n = 0; n < t; n++) o[n] = i[e * t + n];
		let n = Bt(o);
		for (let r = 0; r < t; r++) i[e * t + r] = n[r];
	}
	for (let e = 0; e < n; e++) for (let r = 0; r < t; r++) {
		let a = e * t + r;
		if (i[a] === 0) continue;
		let o = (e + 1) * (e + 1), s = (n - e) * (n - e), c = (r + 1) * (r + 1), l = (t - r) * (t - r), u = Math.min(o, s, c, l);
		u < i[a] && (i[a] = u);
	}
	for (let e = 0; e < t * n; e++) i[e] = Math.sqrt(i[e]);
	return i;
}
var Gt = .25, Kt = .35, qt = .5;
function Jt(e, t, n, r, i, a) {
	let o = new Float32Array(t * n * 3), s = new Uint8Array(t * n), c = new Float32Array(t * n);
	if (t <= 0 || n <= 0) return {
		normals: o,
		bandMask: s,
		bandWeight: c
	};
	let l = Wt(e, t, n), u = zt(i, r), d = (n, r) => (e[r * t + n] ?? 0) >= 128, f = (r > 0 ? a / r : 0) * r, p = Ut(l, t, n, Math.max(1, r * Gt)), m = (e) => {
		let t = u(Math.max(0, e - .5));
		return u(e + .5) - t;
	};
	for (let e = 0; e < n; e++) for (let i = 0; i < t; i++) {
		let a = e * t + i;
		if (!d(i, e)) {
			o[a * 3 + 2] = 1;
			continue;
		}
		let u = l[a], h = u > 0 && u < r;
		if (s[a] = +!!h, !h) {
			o[a * 3 + 2] = 1;
			continue;
		}
		let g = u / r, _ = 1 - Kt, v = 1;
		if (g > _) {
			let e = Math.min(1, (g - _) / Kt);
			v = 1 - e * e * (3 - 2 * e);
		}
		c[a] = v;
		let y = i > 0 ? i - 1 : i, b = i < t - 1 ? i + 1 : i, x = e > 0 ? e - 1 : e, S = e < n - 1 ? e + 1 : e, C = (p[e * t + b] - p[e * t + y]) / (b - y || 1), w = (p[S * t + i] - p[x * t + i]) / (S - x || 1), T = Math.hypot(C, w), E = 0, D = 0;
		T > 1e-9 && (E = -C / T, D = -w / T);
		let O = m(u) * f, k = O * E, A = O * D, j = 1, M = Math.hypot(k, A, j) || 1;
		k /= M, A /= M, j /= M, o[a * 3] = k, o[a * 3 + 1] = A, o[a * 3 + 2] = j;
	}
	return {
		normals: o,
		bandMask: s,
		bandWeight: c
	};
}
var Yt = 35 * Math.PI / 180, Xt = 12 * Math.PI / 180, Zt = {
	t: {
		x: 0,
		y: -1
	},
	b: {
		x: 0,
		y: 1
	},
	l: {
		x: -1,
		y: 0
	},
	r: {
		x: 1,
		y: 0
	},
	tl: {
		x: -1,
		y: -1
	},
	tr: {
		x: 1,
		y: -1
	},
	bl: {
		x: -1,
		y: 1
	},
	br: {
		x: 1,
		y: 1
	}
};
function Qt(e, t, n) {
	let r = n * Math.PI / 180, i = Math.cos(r), a = Math.sin(r);
	return {
		x: e * i - t * a,
		y: e * a + t * i
	};
}
function $t(e, t, n) {
	let r = Zt[t] ?? Zt.t;
	return n && n.rev && (r = Qt(r.x, r.y, n.rev)), tn(r.x, r.y, Yt);
}
function en(e) {
	let t = Math.hypot(e.x, e.y) || 1;
	return tn(-e.x / t, -e.y / t, Xt);
}
function tn(e, t, n) {
	let r = Math.hypot(e, t) || 1, i = Math.cos(n), a = Math.sin(n), o = e / r * i, s = t / r * i, c = a, l = Math.hypot(o, s, c) || 1;
	return {
		x: o / l,
		y: s / l,
		z: c / l
	};
}
var nn = 2, rn = {
	matte: {
		ambient: .62,
		diffuse: .45,
		specular: 0,
		shininess: 8
	},
	plastic: {
		ambient: .55,
		diffuse: .5,
		specular: .35,
		shininess: 22
	}
}, an = .8;
function on(e) {
	switch (e) {
		case "plastic":
		case "metal":
		case "clear":
		case "softEdge":
		case "shiny":
		case "softmetal": return "plastic";
		default: return "matte";
	}
}
function sn(e, t, n = !0) {
	let r = rn[e], i = {
		light: t,
		material: e,
		ambient: r.ambient,
		diffuse: r.diffuse,
		specular: r.specular,
		shininess: r.shininess
	};
	return n && (i.fillLight = en(t), i.fillDiffuse = i.diffuse * an), i;
}
function cn(e, t) {
	let n = e.x * t.light.x + e.y * t.light.y + e.z * t.light.z, r = t.diffuse * Math.max(0, n), i = 0;
	if (t.fillLight && t.fillDiffuse) {
		let n = e.x * t.fillLight.x + e.y * t.fillLight.y + e.z * t.fillLight.z;
		i = t.fillDiffuse * Math.max(0, n);
	}
	let a = 0;
	if (t.specular > 0) {
		let n = t.light.x, r = t.light.y, i = t.light.z + 1, o = Math.hypot(n, r, i) || 1, s = (e.x * n + e.y * r + e.z * i) / o;
		a = t.specular * Math.max(0, s) ** +t.shininess;
	}
	return Math.max(0, t.ambient + r + i + a);
}
function ln(e, t, n) {
	if (!e) return {
		x: 0,
		y: 0,
		w: t,
		h: n
	};
	let r = Math.max(0, Math.floor(e.x)), i = Math.max(0, Math.floor(e.y)), a = Math.min(t, Math.ceil(e.x + e.w)), o = Math.min(n, Math.ceil(e.y + e.h));
	return {
		x: r,
		y: i,
		w: Math.max(0, a - r),
		h: Math.max(0, o - i)
	};
}
function un(e, t, n) {
	let r = e.canvas.width, i = e.canvas.height;
	if (r <= 0 || i <= 0) return;
	let a = t.widthPx;
	if (a < .75) return;
	let { x: o, y: s, w: c, h: l } = ln(n, r, i);
	if (c <= 0 || l <= 0) return;
	let u = e.getImageData(o, s, c, l), d = u.data, f = new Uint8ClampedArray(c * l);
	for (let e = 0; e < c * l; e++) f[e] = d[e * 4 + 3];
	let { bandMask: p, bandWeight: m, normals: h } = Jt(f, c, l, a, t.prst, t.heightPx), g = sn(t.material, t.light), _ = cn({
		x: 0,
		y: 0,
		z: 1
	}, g) || 1;
	for (let e = 0; e < c * l; e++) {
		if (p[e] === 0) continue;
		let n = m[e];
		if (n <= 0) continue;
		let r = h[e * 3], i = h[e * 3 + 1], a = h[e * 3 + 2];
		t.bottom && (r = -r, i = -i);
		let o = 1 + (cn({
			x: r,
			y: i,
			z: a
		}, g) / _ - 1) * n, s = e * 4;
		if (o >= 1) {
			let e = Math.min(1, (o - 1) * nn);
			for (let t = 0; t < 3; t++) {
				let n = Math.min(255, d[s + t] * o);
				d[s + t] = n + (255 - n) * e;
			}
		} else d[s] = Math.max(0, d[s] * o), d[s + 1] = Math.max(0, d[s + 1] * o), d[s + 2] = Math.max(0, d[s + 2] * o);
	}
	e.putImageData(u, o, s);
}
function dn(e, t, n) {
	let r = e.canvas.width, i = e.canvas.height;
	if (r <= 0 || i <= 0) return;
	let a = t.offsetX, o = t.offsetY, s = Math.hypot(a, o);
	if (s < .75) return;
	let { x: c, y: l, w: u, h: d } = ln(n, r, i);
	if (u <= 0 || d <= 0) return;
	let f = e.getImageData(c, l, u, d), p = f.data, m = new Uint8ClampedArray(u * d);
	for (let e = 0; e < u * d; e++) m[e] = p[e * 4 + 3];
	let h = Math.max(1, Math.ceil(s)), [g, _, v] = t.rgb;
	for (let e = 0; e < d; e++) for (let t = 0; t < u; t++) {
		let n = e * u + t;
		if (m[n] >= 128) continue;
		let r = !1;
		for (let n = 1; n <= h; n++) {
			let i = n / h, s = Math.round(t - a * i), c = Math.round(e - o * i);
			if (!(s < 0 || c < 0 || s >= u || c >= d) && m[c * u + s] >= 128) {
				r = !0;
				break;
			}
		}
		if (!r) continue;
		let i = n * 4;
		p[i] = g, p[i + 1] = _, p[i + 2] = v, p[i + 3] = 255;
	}
	e.putImageData(f, c, l);
}
//#endregion
//#region packages/core/src/text/highlight-box.ts
function fn(e, t) {
	return {
		top: e - t * .85,
		height: t * 1.1
	};
}
//#endregion
//#region packages/core/src/nav/internal-target.ts
function pn(e, t) {
	let n = t.startsWith("/") ? [] : e.split("/").filter((e) => e !== "");
	for (let e of t.split("/")) if (e === "..") n.pop();
	else if (e === "." || e === "") continue;
	else n.push(e);
	return n.join("/");
}
function mn(e) {
	let t = /[?&]jump=([a-zA-Z]+)/.exec(e);
	if (!t) return null;
	let n = t[1].toLowerCase();
	return n === "firstslide" || n === "lastslide" || n === "nextslide" || n === "previousslide" ? n : null;
}
function hn(e, t, n) {
	if (!(n <= 0)) switch (e) {
		case "firstslide": return 0;
		case "lastslide": return n - 1;
		case "nextslide": return Math.min(t + 1, n - 1);
		case "previousslide": return Math.max(t - 1, 0);
	}
}
function gn(e, t, n, r, i, a, o = {}) {
	e.innerHTML = "", e.style.width = `${r}px`, e.style.height = `${i}px`;
	let s = o.match ?? "rgba(255, 214, 0, 0.42)", c = o.active ?? "rgba(255, 140, 0, 0.55)", l = /* @__PURE__ */ new Map(), u = (t) => {
		let n = t.rotation + (t.textBodyRotation ?? 0), r = `${t.shapeX},${t.shapeY},${t.shapeW},${t.shapeH},${n}`, i = l.get(r);
		return i || (i = document.createElement("div"), i.style.cssText = `position:absolute;left:${t.shapeX}px;top:${t.shapeY}px;width:${t.shapeW}px;height:${t.shapeH}px;pointer-events:none;overflow:hidden;`, n !== 0 && (i.style.transformOrigin = "center center", i.style.transform = `rotate(${n}deg)`), l.set(r, i), e.appendChild(i)), i;
	};
	for (let e of n) {
		let n = e.active ? c : s;
		for (let r of e.slices) {
			let e = t[r.runIndex];
			if (!e) continue;
			let i = a(e.font), { x: o, width: s } = De(e.text, r.start, r.end, i);
			if (s <= 0) continue;
			let c = document.createElement("div");
			c.style.cssText = `position:absolute;left:${e.inShapeX + o}px;top:${e.inShapeY}px;width:${s}px;height:${e.h}px;background:${n};pointer-events:none;`, u(e).appendChild(c);
		}
	}
}
//#endregion
//#region packages/pptx/src/find.ts
var _n = class {
	_slideRuns = /* @__PURE__ */ new Map();
	_matches = [];
	_active = -1;
	constructor(e, t) {
		this._slideCount = e, this._collectSlideRuns = t;
	}
	invalidate() {
		this._slideRuns.clear(), this._matches = [], this._active = -1;
	}
	slideRuns(e) {
		return this._slideRuns.get(e);
	}
	setSlideRuns(e, t) {
		this._slideRuns.set(e, t);
	}
	slideHighlights(e) {
		let t = [];
		for (let n = 0; n < this._matches.length; n++) {
			let r = this._matches[n];
			r.slide === e && t.push({
				slices: r.slices,
				active: n === this._active
			});
		}
		return t;
	}
	activeSlide() {
		let e = this._matches[this._active];
		return e ? e.slide : null;
	}
	matches() {
		return this._matches.map((e, t) => ({
			matchIndex: t,
			text: e.text,
			location: { slide: e.slide }
		}));
	}
	async find(e, t = {}) {
		if (this._matches = [], this._active = -1, e.length === 0) return [];
		let n = this._slideCount();
		for (let r = 0; r < n; r++) {
			let n = await this._ensureSlideRuns(r), i = ie(n);
			for (let a of L(i, e, t)) {
				let e = a.slices.map((e) => n[e.runIndex].text.slice(e.start, e.end)).join("");
				this._matches.push({
					slide: r,
					text: e,
					slices: a.slices
				});
			}
		}
		return this.matches();
	}
	next() {
		return this._active = oe(this._active, this._matches.length), this._activePublic();
	}
	prev() {
		return this._active = te(this._active, this._matches.length), this._activePublic();
	}
	_activePublic() {
		let e = this._matches[this._active];
		return e ? {
			matchIndex: this._active,
			text: e.text,
			location: { slide: e.slide }
		} : null;
	}
	async _ensureSlideRuns(e) {
		let t = this._slideRuns.get(e);
		if (t) return t;
		let n = await this._collectSlideRuns(e);
		return this._slideRuns.set(e, n), n;
	}
};
//#endregion
//#region packages/pptx/src/types.ts
function vn(e) {
	return e;
}
//#endregion
//#region packages/pptx/src/hyperlink.ts
function yn(e, t) {
	let n = e !== void 0 && e !== "" ? e : void 0, r = t !== void 0 && t !== "" ? t : void 0;
	if (n === void 0 && r === void 0) return;
	if (r !== void 0) return {
		kind: "internal",
		ref: n ?? r
	};
	let i = n, a = k(i);
	return a !== null && ae.includes(a) ? {
		kind: "external",
		url: i
	} : {
		kind: "internal",
		ref: i
	};
}
//#endregion
//#region packages/pptx/src/media-chrome.ts
function bn(e, t, n, r, i, a) {
	let o = Math.max(18, Math.min(32, Math.min(r, i) * .25));
	if (e.save(), e.shadowColor = "rgba(0, 0, 0, 0.3)", e.shadowBlur = o * .35, e.fillStyle = "rgba(20, 20, 20, 0.7)", e.beginPath(), e.arc(t, n, o, 0, Math.PI * 2), e.fill(), e.shadowColor = "transparent", e.shadowBlur = 0, e.fillStyle = "#fff", a === "paused") {
		e.beginPath();
		let r = o * .48;
		e.moveTo(t - r * .4, n - r), e.lineTo(t - r * .4, n + r), e.lineTo(t + r * .75, n), e.closePath(), e.fill();
	} else {
		let r = o * .2, i = o * .8, a = o * .15;
		e.fillRect(t - a - r, n - i / 2, r, i), e.fillRect(t + a, n - i / 2, r, i);
	}
	e.restore();
}
//#endregion
//#region packages/pptx/src/bidi-line.ts
var xn = (e) => {
	let t = e.text;
	return typeof t == "string" ? t : void 0;
};
function Sn(e) {
	for (let t of e) {
		let e = xn(t);
		if (e !== void 0 && n(e)) return !0;
	}
	return !1;
}
function Cn(e, t) {
	let n = e.length;
	if (n === 0) return {
		order: [],
		rtl: []
	};
	let r = "", i = Array(n);
	for (let t = 0; t < n; t++) {
		i[t] = r.length;
		let n = xn(e[t]) ?? "";
		r += n.length > 0 ? n : "￼";
	}
	let { levels: a, paragraphLevel: o } = le().computeLevels(r, t ? "rtl" : "ltr"), { order: s, segLevels: c } = v(a, o, i), l = Array(n);
	for (let e = 0; e < n; e++) l[e] = (c[e] & 1) == 1;
	return {
		order: s,
		rtl: l
	};
}
//#endregion
//#region packages/pptx/src/cjk-wrap.ts
function wn(e, t, n, r) {
	if (e.length === 0) return 0;
	let i = t === 0, a = 0, o = t;
	for (let t of e) {
		if (o + t.w > n) {
			if (a > 0 || !i) break;
			o += t.w, a++;
			break;
		}
		o += t.w, a++;
	}
	return a === 0 ? 0 : a >= e.length ? e.length : de(e.map((e) => e.ch), a, r, +!!i);
}
//#endregion
//#region packages/pptx/src/text-justify.ts
var Tn = (e) => /\s/.test(String.fromCodePoint(e));
function En(e, t, n, r, i) {
	if (r === "just" && i) return null;
	let a = t - n;
	if (a <= .5) return null;
	let o = ye(e, a, {
		firstContentSi: 0,
		lastDrawnSi: e.length,
		isGapChar: P,
		isWhitespace: Tn
	});
	if (!o) return null;
	let { perGap: s, perSeg: c } = o, l = [];
	for (let t = 0; t < e.length; t++) {
		let n = e[t], r = c.get(t), i = r?.trailingGap ? s : 0, a = r?.splitBefore;
		a && a.length > 0 ? l.push({
			...n,
			jext: i,
			splitBefore: [...a],
			perGap: s
		}) : l.push({
			...n,
			jext: i
		});
	}
	return l;
}
//#endregion
//#region packages/pptx/src/table-border-conflict.ts
function Dn(e) {
	if (!e) return {
		r: 0,
		g: 0,
		b: 0
	};
	let t = e.replace(/^#/, "");
	return t.length < 6 || /[^0-9a-fA-F]/.test(t.slice(0, 6)) ? {
		r: 0,
		g: 0,
		b: 0
	} : {
		r: parseInt(t.slice(0, 2), 16),
		g: parseInt(t.slice(2, 4), 16),
		b: parseInt(t.slice(4, 6), 16)
	};
}
function On(e) {
	let t = Dn(e);
	return .299 * t.r + .587 * t.g + .114 * t.b;
}
function kn(e, t) {
	if (!e && !t) return null;
	if (!e) return t;
	if (!t) return e;
	if (e.width !== t.width) return e.width > t.width ? e : t;
	let n = On(e.color), r = On(t.color);
	return n === r || n < r ? e : t;
}
//#endregion
//#region packages/pptx/src/renderer.ts
function X(e, t) {
	return e * t;
}
var Z = T;
function An(e, t, n, r, i, a, o) {
	let { top: s, height: c } = fn(n, i);
	e.fillStyle = a, e.fillRect(t, s, r, c), e.fillStyle = o;
}
function jn(e) {
	return !e || e.fillType === "none" ? null : e.fillType === "solid" ? Z(e.color) : e.fillType === "gradient" ? e.stops.length > 0 ? Z(e.stops[0].color) : null : e.fillType === "pattern" ? Z(e.fg) : null;
}
function Mn(e, t, n, r, i, a) {
	return g(e, t, n, r, i, a);
}
var Nn = /* @__PURE__ */ new WeakMap();
function Pn(e, t) {
	let n = e.tinted.get(t);
	if (n) return n;
	let r = e.img.naturalWidth || 1, i = e.img.naturalHeight || 1, a = document.createElement("canvas");
	a.width = r, a.height = i;
	let o = a.getContext("2d");
	return o ? (o.drawImage(e.img, 0, 0, r, i), o.globalCompositeOperation = "source-in", o.fillStyle = t, o.fillRect(0, 0, r, i), e.tinted.set(t, a), a) : e.img;
}
function Fn(e) {
	let t = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`, n = new Image();
	return new Promise((e, r) => {
		n.onload = () => e(n), n.onerror = r, n.src = t;
	});
}
var In = 256;
function Ln(e, t, n) {
	let r = Math.max(1, Math.round(t * In)), i = Math.max(1, Math.round(n * In));
	return e.replace(/<svg([^>]*?)>/, (e, t) => `<svg${t.replace(/\s(?:width|height)="[^"]*"/g, "")} width="${r}" height="${i}">`);
}
function Rn(e) {
	let t = [], n = (e) => {
		if (e) for (let n of e.paragraphs) for (let e of n.runs) e.type === "math" && t.push({
			nodes: e.nodes,
			display: e.display
		});
	};
	for (let t of e.elements) if (t.type === "shape") n(t.textBody);
	else if (t.type === "table") for (let e of t.rows) for (let t of e.cells) n(t.textBody);
	return t;
}
async function zn(t, n) {
	let r = Rn(t);
	if (r.length !== 0) {
		await n.loadMathJax();
		for (let t of r) if (!Nn.has(t.nodes)) try {
			let r = await n.mathMLToSvg(e(t.nodes, t.display)), i = await Fn(Ln(ke(r.svg, "#000000"), r.widthEm, r.ascentEm + r.descentEm));
			Nn.set(t.nodes, {
				img: i,
				widthEm: r.widthEm,
				ascentEm: r.ascentEm,
				descentEm: r.descentEm,
				tinted: /* @__PURE__ */ new Map()
			});
		} catch {}
	}
}
function Bn(e, t) {
	return e ? e.startsWith("+") ? e === "+mj-lt" || e === "+mj-ea" || e === "+mj-cs" ? t.themeMajorFont ?? "sans-serif" : t.themeMinorFont ?? "sans-serif" : e.split(",")[0].trim() || (t.themeMinorFont ?? "sans-serif") : t.themeMinorFont ?? "sans-serif";
}
var Vn = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui"
]);
function Hn(e) {
	let t = H(e);
	return t === "mono" ? "monospace" : t === "serif" ? "serif" : "sans-serif";
}
var Un = {
	calibri: "Carlito",
	"calibri light": "Carlito",
	cambria: "Caladea",
	"cambria math": "Caladea",
	"sakkal majalla": "Noto Naskh Arabic",
	"traditional arabic": "Noto Naskh Arabic",
	"simplified arabic": "Noto Naskh Arabic",
	"arabic typesetting": "Noto Naskh Arabic",
	"univers next arabic": "Noto Sans Arabic"
}, Wn = "\"Noto Naskh Arabic\", \"Noto Sans Arabic\"";
function Gn(e) {
	if (Un[e.toLowerCase()]?.includes("Arabic")) return !0;
	let t = e.toLowerCase();
	return /arabic|naskh|kufi|nastaliq|amiri|scheherazade|lateef|aldhabi|urdu|farsi|العرب|[؀-ۿ]/.test(t);
}
function Kn(e) {
	return e.map((e) => `"${e}"`).join(", ");
}
function qn(e) {
	let t = Hn(e), n = Un[e.toLowerCase()], r = n ? `"${n}", ` : "";
	if (Gn(e)) return `"${e}", ${r}${Wn}, ${t}`;
	let i = t === "serif" ? "serif" : "sans", a = ne(e);
	return `"${e}", ${r}${a ? `${Kn(N(a, i))}, ` : ""}${`${Kn(i === "serif" ? ce : V)}, `}${t}`;
}
function Jn(e) {
	return e ? e.kind === "external" ? `e:${e.url}` : `i:${e.ref}` : "";
}
function Q(e, t, n, r, i) {
	let a = t ? "italic " : "", o = e ? "bold " : "", s = Bn(r, i);
	return Vn.has(s) ? `${a}${o}${n}px ${s}` : `${a}${o}${n}px ${qn(s)}`;
}
function Yn(e) {
	return e.bullet.type === "char" || e.bullet.type === "autoNum" || vn(e.bullet).type === "blip";
}
function Xn(e, t) {
	return e ? 0 : Math.max(0, t);
}
function Zn(e, t, n, r, i, a, o) {
	let s = (t.defaultFontSize ?? 18) * G * a;
	for (let c of t.paragraphs) {
		let l = X(c.marL, a), u = X(c.marR, a), d = X(c.indent, a), f = Xn(Yn(c), d), p = n - r - i - l - u - f, m = 0;
		for (let n of c.runs) {
			if (n.type !== "text") continue;
			let r = n.fontSize == null ? c.defFontSize == null ? s : c.defFontSize * G * a : n.fontSize * G * a, i = Bn(n.fontFamily ?? c.defFontFamily ?? null, o);
			if (e.font = Q(n.bold ?? c.defBold ?? t.defaultBold ?? !1, n.italic ?? c.defItalic ?? t.defaultItalic ?? !1, r, i, o), m += e.measureText(n.text).width, m > p) return !0;
		}
	}
	return !1;
}
function Qn(e) {
	for (let t of e) if (P(t.codePointAt(0) ?? 0)) return !0;
	return !1;
}
function $(e) {
	let t = 0;
	for (let n of e) t++;
	return t;
}
function $n(e, t, n, r, i, a, o, s = !1, c = !1, l = 1, u, d = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, f = 0) {
	let p = [], m = () => n - (p.length === 0 ? f : 0), h = { segments: [] }, g = 0, _ = !1, v = !1, y = 0, b = (e = !1) => {
		e && (h.endsWithBreak = !0), p.push(h), h = { segments: [] }, g = 0, v = !1, _ = !1;
	}, x = (t, n, r, i, a, o, s, c) => {
		if (!t) return;
		e.font = n;
		let l = c?.letterSpacingPx ?? 0, u = e.measureText(t).width + l * $(t), d = c?.strikeDouble, f = c?.underlineStyle, p = c?.underlineColor, m = c?.shadow, _ = c?.outline, y = c?.highlight, b = c?.fontFamily, x = c?.hyperlink, S = (e) => !e.math && e.font === n && e.color === i && e.underline === a && (e.underlineStyle ?? "") === (f ?? "") && (e.underlineColor ?? "") === (p ?? "") && e.strikethrough === o && (e.strikeDouble ?? !1) === (d ?? !1) && (e.letterSpacingPx ?? 0) === l && e.baseline === s && e.shadow === m && e.outline === _ && (e.highlight ?? "") === (y ?? "") && (e.fontFamily ?? "") === (b ?? "") && Jn(e.hyperlink) === Jn(x);
		if (v && h.tabStop) {
			let e = h.tabStop.segments, c = e.at(-1);
			c && S(c) ? c.text += t : e.push({
				text: t,
				font: n,
				fontFamily: b,
				sizePx: r,
				color: i,
				underline: a,
				underlineStyle: f,
				underlineColor: p,
				strikethrough: o,
				strikeDouble: d,
				letterSpacingPx: l || void 0,
				baseline: s,
				shadow: m,
				outline: _,
				highlight: y,
				hyperlink: x
			});
		} else {
			g += u;
			let e = h.segments.at(-1);
			e && S(e) ? e.text += t : h.segments.push({
				text: t,
				font: n,
				fontFamily: b,
				sizePx: r,
				color: i,
				underline: a,
				underlineStyle: f,
				underlineColor: p,
				strikethrough: o,
				strikeDouble: d,
				letterSpacingPx: l || void 0,
				baseline: s,
				shadow: m,
				outline: _,
				highlight: y,
				hyperlink: x
			});
		}
	}, S = () => {
		let e = h.segments.at(-1);
		if (!e || e.math) return !1;
		let t = /^(.*\s)(\S+)$/s.exec(e.text), n;
		if (t) e.text = t[1], n = t[2];
		else if (h.segments.length > 1) h.segments.pop(), n = e.text;
		else return !1;
		return b(), x(n, e.font, e.sizePx, e.color, e.underline, e.strikethrough, e.baseline, {
			strikeDouble: e.strikeDouble,
			letterSpacingPx: e.letterSpacingPx,
			underlineStyle: e.underlineStyle,
			underlineColor: e.underlineColor,
			shadow: e.shadow,
			outline: e.outline,
			highlight: e.highlight,
			fontFamily: e.fontFamily
		}), !0;
	};
	for (let n of t.runs) {
		if (n.type === "break") {
			b(!0);
			continue;
		}
		if (n.type === "math") {
			let e = Nn.get(n.nodes), t = n.fontSize == null ? r : n.fontSize * G * a * l, o = e ? e.widthEm * t : 0, s = e ? e.ascentEm * t : 0, c = e ? e.descentEm * t : 0;
			(n.display && g > 0 || g + o > m() && g > 0) && b(), h.segments.push({
				text: "",
				font: `${t}px sans-serif`,
				sizePx: t,
				color: n.color ? Z(n.color) : i,
				underline: !1,
				strikethrough: !1,
				math: {
					nodes: n.nodes,
					display: n.display,
					width: o,
					ascent: s,
					descent: c
				}
			}), g += o, n.display && b();
			continue;
		}
		let f = n.fontSize == null ? r : n.fontSize * G * a * l, p = Bn(n.fontFamily ?? t.defFontFamily ?? null, d), C = n.fontFamilyEa ? Bn(n.fontFamilyEa, d) : null, w = n.fontFamilySym ? Bn(n.fontFamilySym, d) : null, T;
		T = n.color ? Z(n.color) : n.hyperlink && d.themeHlinkColor ? Z(d.themeHlinkColor) : i;
		let E = n.bold ?? t.defBold ?? s, O = n.italic ?? t.defItalic ?? c, k = Q(E, O, f, p, d), A = C ? Q(E, O, f, C, d) : k;
		e.font = k;
		let j = n.caps, M = n.text;
		(j === "all" || j === "small") && (M = M.toUpperCase());
		let N = n.fieldType === "slidenum" && u !== void 0 ? String(u) : M, F = n.underline || n.hyperlink !== void 0, I = {
			strikeDouble: n.strikeDouble === !0,
			letterSpacingPx: n.letterSpacing == null ? 0 : n.letterSpacing * G * a,
			underlineStyle: n.underlineStyle,
			underlineColor: n.underlineColor ? Z(n.underlineColor) : void 0,
			shadow: n.shadow,
			outline: n.outline,
			fontFamily: p,
			highlight: n.highlight ? Z(n.highlight) : void 0,
			hyperlink: yn(n.hyperlink)
		}, L = N.split(/(\s+)/);
		for (let r of L) {
			if (!r) continue;
			if (/^\t+$/.test(r)) {
				let e = o + g, r = (t.tabStops ?? []).find((t) => X(t.pos, a) > e);
				r ? (y = X(r.pos, a), r.algn === "r" || r.algn === "ctr" ? (v = !0, h.tabStop = {
					px: y,
					algn: r.algn,
					segments: []
				}) : g = y - o) : x(" ", k, f, T, F, n.strikethrough, void 0, I);
				continue;
			}
			e.font = k;
			let i = e.measureText(r).width, s = /^\s+$/.test(r);
			if (v) {
				x(r, k, f, T, F, n.strikethrough, n.baseline ?? void 0, I);
				continue;
			}
			let c = /[-]/;
			if (c.test(r) && (w != null || xe(p))) {
				let t = w ?? p;
				for (let i of r) {
					let r = i, a = k;
					if (c.test(i)) {
						let e = ve(i, t);
						e === i ? a = Q(E, O, f, t, d) : (r = e, a = Q(E, O, f, "sans-serif", d));
					}
					e.font = a;
					let o = e.measureText(r).width;
					g + o > m() && g > 0 && b(), x(r, a, f, T, F, n.strikethrough, n.baseline ?? void 0, I);
				}
				continue;
			}
			if (Qn(r)) {
				let i = [];
				for (let t of r) {
					let n = P(t.codePointAt(0) ?? 0) && C != null, r = n ? A : k, a = n ? C : p;
					e.font = r, i.push({
						ch: t,
						w: e.measureText(t).width,
						font: r,
						family: a
					});
				}
				if (t.eaLnBrk === !1) {
					let e = i.reduce((e, t) => e + t.w, 0);
					g > 0 && g + e > m() && b();
					for (let e of i) x(e.ch, e.font, f, T, F, n.strikethrough, n.baseline ?? void 0, {
						...I,
						fontFamily: e.family
					});
					continue;
				}
				let a = i;
				for (; a.length > 0;) {
					let e = wn(a, g, m(), D);
					if (e === 0) {
						b();
						continue;
					}
					for (let t = 0; t < e; t++) {
						let e = a[t];
						x(e.ch, e.font, f, T, F, n.strikethrough, n.baseline ?? void 0, {
							...I,
							fontFamily: e.family
						});
					}
					a = a.slice(e), a.length > 0 && b();
				}
				continue;
			}
			if (g + i <= m()) x(r, k, f, T, F, n.strikethrough, n.baseline ?? void 0, I), s && (_ = !0);
			else if (s) g > 0 && b();
			else if (i > m()) {
				g > 0 && b();
				for (let t of r) {
					e.font = k;
					let r = e.measureText(t).width;
					g + r > m() && g > 0 && b(), x(t, k, f, T, F, n.strikethrough, n.baseline ?? void 0, I);
				}
			} else if (!_) x(r, k, f, T, F, n.strikethrough, n.baseline ?? void 0, I);
			else {
				let e = r.codePointAt(0);
				e !== void 0 && D.lineStartForbidden.has(e) && /\S$/.test(h.segments.at(-1)?.text ?? "") && S() || b(), x(r, k, f, T, F, n.strikethrough, n.baseline ?? void 0, I);
			}
		}
	}
	return p.push(h), p;
}
async function er(e, t, n, r, i, a) {
	if (t && t.fillType === "image") {
		if (e.fillStyle = "#FFFFFF", e.fillRect(0, 0, n, r), !t.imagePath || !t.mimeType || !a) return;
		try {
			let o = await Ee(t.imagePath, t.mimeType, a, {
				widthPt: n / i / G,
				heightPt: r / i / G
			});
			if (!o) return;
			if (e.save(), e.beginPath(), e.rect(0, 0, n, r), e.clip(), t.alpha != null && (e.globalAlpha = t.alpha), t.tile) rr(e, o, t.tile, n, r, i);
			else {
				let i = t.fillRect ?? {}, a = i.l ?? 0, s = i.t ?? 0, c = i.r ?? 0, l = i.b ?? 0, u = a * n, d = s * r, f = n * (1 - a - c), p = r * (1 - s - l);
				e.drawImage(o, u, d, f, p);
			}
			e.restore();
		} catch {}
		return;
	}
	e.fillStyle = Mn(t, e, 0, 0, n, r) ?? "#FFFFFF", e.fillRect(0, 0, n, r);
}
var tr = 9525;
function nr(e, t, n, r, i) {
	let a;
	a = e === "t" || e === "ctr" || e === "b" ? (t - r) / 2 : e === "tr" || e === "r" || e === "br" ? t - r : 0;
	let o;
	return o = e === "l" || e === "ctr" || e === "r" ? (n - i) / 2 : e === "bl" || e === "b" || e === "br" ? n - i : 0, {
		ax: a,
		ay: o
	};
}
function rr(e, t, n, r, i, a) {
	let o = t.width * tr * n.sx * a, s = t.height * tr * n.sy * a;
	if (!(o > 0) || !(s > 0)) return;
	let c = n.flip === "x" || n.flip === "xy", l = n.flip === "y" || n.flip === "xy", u = U(o * (c ? 2 : 1), s * (l ? 2 : 1));
	if (!u) return;
	let d = u.getContext("2d");
	if (!d) return;
	let f = (e, n, r, i) => {
		d.save(), d.translate(e + (r ? o : 0), n + (i ? s : 0)), d.scale(r ? -1 : 1, i ? -1 : 1), d.drawImage(t, 0, 0, o, s), d.restore();
	};
	f(0, 0, !1, !1), c && f(o, 0, !0, !1), l && f(0, s, !1, !0), c && l && f(o, s, !0, !0);
	let p = e.createPattern(u, "repeat");
	if (!p) return;
	let { ax: m, ay: h } = nr(n.algn, r, i, o, s), g = m + X(n.tx, a), _ = h + X(n.ty, a);
	typeof p.setTransform == "function" && typeof DOMMatrix < "u" ? (p.setTransform(new DOMMatrix().translateSelf(g, _)), e.fillStyle = p, e.fillRect(0, 0, r, i)) : (e.save(), e.translate(g, _), e.fillStyle = p, e.fillRect(-g, -_, r, i), e.restore());
}
function ir(e, t, n) {
	if (!t) return;
	let r = t.dir * Math.PI / 180, i = X(t.dist, n);
	e.shadowColor = Z(t.color, t.alpha), e.shadowBlur = X(t.blur, n), e.shadowOffsetX = Math.cos(r) * i, e.shadowOffsetY = Math.sin(r) * i;
}
function ar(e, t, n) {
	t && (e.shadowColor = Z(t.color, t.alpha), e.shadowBlur = X(t.radius, n), e.shadowOffsetX = 0, e.shadowOffsetY = 0);
}
function or(e) {
	e.shadowColor = "transparent", e.shadowBlur = 0, e.shadowOffsetX = 0, e.shadowOffsetY = 0;
}
var sr = 8, cr = 1, lr = 1, ur = 256;
function dr(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	if (r <= 0) return;
	let m = e.measureText(t), h = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : r, g = m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : r * .25, _ = r * l * i, v = Math.min(ur, Math.max(1, Math.round(_ / sr))), y = (e) => fr(e, a, r, o, s, c, u, d), b = y(v), x = mr(b, a, o, s, c, u, d, l, i, -h, g);
	for (; x > lr && v < ur;) {
		let e = Math.min(ur, v * 2), t = y(e), n = mr(t, a, o, s, c, u, d, l, i, -h, g);
		if (n >= x * .75) {
			b = t;
			break;
		}
		v = e, b = t, x = n;
	}
	let S = 1e4, C = cr / (l * i), w = b.length - 1;
	for (let r = 0; r <= w; r++) {
		let { s0: i, s1: a, g: o } = b[r], s = (i + a) / 2;
		e.save(), e.translate(f + o.x, p + o.y), e.rotate(o.angle), o.shear !== 0 && e.transform(1, 0, o.shear, 1, 0, 0), (l !== 1 || o.vScale !== 1) && e.scale(l, o.vScale);
		let c = r === 0 ? -S : i - s - C, u = r === w ? S : a - s + C;
		e.beginPath(), e.rect(c, -S, u - c, 2 * S), e.clip(), e.fillText(t, -s + n / 2, 0), e.restore();
	}
}
function fr(e, t, n, r, i, a, o, s) {
	let c = Array(e);
	for (let l = 0; l < e; l++) {
		let u = l / e * n, d = (l + 1) / e * n;
		c[l] = {
			s0: u,
			s1: d,
			g: ot(t, (r + (u + d) / 2) / i * a, o, s)
		};
	}
	return c;
}
function pr(e, t, n, r) {
	let i = n * t, a = r * e.vScale, o = i + e.shear * a, s = Math.cos(e.angle), c = Math.sin(e.angle);
	return {
		x: e.x + s * o - c * a,
		y: e.y + c * o + s * a
	};
}
function mr(e, t, n, r, i, a, o, s, c, l, u) {
	let d = 0;
	for (let f of e) {
		let e = (f.s0 + f.s1) / 2;
		for (let p of [f.s0, f.s1]) {
			let m = ot(t, (n + p) / r * i, a, o);
			for (let t of [l, u]) {
				let n = pr(m, s, 0, t), r = pr(f.g, s, p - e, t), i = Math.hypot(r.x - n.x, r.y - n.y) * c;
				i > d && (d = i);
			}
		}
	}
	return d;
}
function hr(e, t, n, r, i, a, o, s, c, l, u) {
	let d = i, f = a, p = Math.max(1, o), m = Math.max(1, s), h = nt(n, r, p, m);
	if (!h) return;
	let g = t.defaultBold ?? !1, _ = t.defaultItalic ?? !1, v = (t.defaultFontSize ?? 18) * G * c, y = [];
	for (let n of t.paragraphs) {
		let t = $n(e, n, Infinity, n.defFontSize == null ? v : n.defFontSize * G * c, n.defColor ? Z(n.defColor) : l, c, 0, g, _, 1, void 0, u, 0);
		for (let e of t) y.push(e);
	}
	if (y.length === 0) return;
	e.save(), e.textAlign = "left", e.textBaseline = "alphabetic";
	let b = -1, x = () => {
		if (b >= 0) return b;
		let t = typeof e.getTransform == "function" ? e.getTransform() : null, n = t ? Math.abs(t.a * t.d - t.b * t.c) : 1;
		return b = n > 0 ? Math.sqrt(n) : 1, b;
	}, S = y.length;
	for (let t = 0; t < S; t++) {
		let n = y[t], r = t / S, i = (t + 1) / S, a = 0, o = 0, s = 0, c = 0;
		for (let t of n.segments) {
			if (t.math) {
				a += t.math.width, o = Math.max(o, t.sizePx), s = Math.max(s, t.math.ascent), c = Math.max(c, t.math.descent);
				continue;
			}
			e.font = t.font;
			let n = t.letterSpacingPx ?? 0, r = e.measureText(t.text);
			a += r.width + n * $(t.text), o = Math.max(o, t.sizePx), r.actualBoundingBoxAscent > 0 && (s = Math.max(s, r.actualBoundingBoxAscent)), r.actualBoundingBoxDescent > 0 && (c = Math.max(c, r.actualBoundingBoxDescent));
		}
		if (a <= 0) continue;
		let l = s + c > 0 ? s + c : o, u = h.singleEdge ? .8 : l > 0 ? s / l : .8, g = h.singleEdge ? 1 : p / a, _ = h.singleEdge ? m : l / (i - r), v = at(h, a), b = 0;
		for (let t of n.segments) {
			if (t.math) {
				b += t.math.width;
				continue;
			}
			e.font = t.font, e.fillStyle = t.color;
			let n = t.letterSpacingPx ?? 0, o = [...t.text];
			for (let t of o) {
				let o = e.measureText(t).width + n, s = r + u * (i - r);
				if (!h.singleEdge && o > 0) {
					dr(e, t, n, o, x(), h, b, a, v, g, _, s, d, f), b += o;
					continue;
				}
				let c = ot(h, (b + o / 2) / a * v, _, s);
				e.save(), e.translate(d + c.x, f + c.y), e.rotate(c.angle), c.shear !== 0 && e.transform(1, 0, c.shear, 1, 0, 0), (g !== 1 || c.vScale !== 1) && e.scale(g, c.vScale), e.fillText(t, -o / 2 + n / 2, 0), e.restore(), b += o;
			}
		}
	}
	e.restore();
}
function gr(e, t, n, r, i, a, o) {
	let s = Math.min(r, i);
	switch (e) {
		case "rightarrow":
		case "leftarrow": {
			let c = Math.min(Math.max(a ?? 5e4, 0), 1e5), l = s * Math.min(Math.max(o ?? 5e4, 0), 1e5) / 1e5, u = i * c / 2e5, d = n + i / 2 - u, f = 2 * u, p = Math.max(0, r - l);
			return e === "rightarrow" ? {
				tx: t,
				ty: d,
				tw: p,
				th: f
			} : {
				tx: t + l,
				ty: d,
				tw: p,
				th: f
			};
		}
		case "roundrect": {
			let e = s * Math.min(Math.max(a ?? 16667, 0), 1e5) / 1e5 * (1 - 1 / Math.SQRT2);
			return {
				tx: t + e,
				ty: n + e,
				tw: Math.max(0, r - 2 * e),
				th: Math.max(0, i - 2 * e)
			};
		}
		default: return null;
	}
}
function _r(e, t, n, r = "#000000", i, a = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, o, s) {
	let c = X(t.x, n), u = X(t.y, n), d = X(t.width, n), f = X(t.height, n);
	if (f === 0 && t.textBody?.verticalAnchor === "b") {
		if (t.stroke && (e.save(), Nr(e, t.stroke, n), e.beginPath(), e.moveTo(c, u), e.lineTo(c + d, u), e.stroke(), e.restore()), t.textBody) {
			let l = t.defaultTextColor ? Z(t.defaultTextColor) : null;
			Cr(e, t.textBody, c, u, d, f, n, l, t.rotation, t.flipH, t.flipV, r, i, a, o, !1, s);
		}
		return;
	}
	let p = t.scene3d && wt(t.scene3d.camera) ? t.scene3d : null;
	if (p && d > 0 && f > 0) {
		let o = e.getTransform(), s = Math.abs(o.a * o.d - o.b * o.c), l = s > 0 ? Math.sqrt(s) : 1, m = wr(t.sp3d, t.scene3d?.lightRig, t.sp3d?.prstMaterial, n, l), h = Tr(t.sp3d, p.camera, d, f, n, l);
		e.save(), (t.rotation !== 0 || t.flipH || t.flipV) && (e.translate(c + d / 2, u + f / 2), e.rotate(t.rotation * Math.PI / 180), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-(c + d / 2), -(u + f / 2)));
		let g = {
			...t,
			x: 0,
			y: 0,
			rotation: 0,
			flipH: !1,
			flipV: !1,
			scene3d: void 0
		};
		if (Er(e, p.camera, c, u, d, f, (e) => {
			_r(e, g, n, r, i, a, void 0);
		}, {
			bevels: m,
			extrusion: h ?? void 0,
			edgePadCss: (t.stroke ? t.stroke.width * n / 2 : 0) + (t.sp3d?.contourW ? t.sp3d.contourW * n : 0) + (h ? Math.hypot(h.offsetX, h.offsetY) / l : 0) + 2
		})) {
			e.restore();
			return;
		}
		e.restore();
	}
	e.save(), (t.rotation !== 0 || t.flipH || t.flipV) && (e.translate(c + d / 2, u + f / 2), e.rotate(t.rotation * Math.PI / 180), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-(c + d / 2), -(u + f / 2)));
	let m = t.geometry.toLowerCase(), h = Mn(t.fill, e, c, u, d, f);
	ir(e, t.shadow ?? null, n), t.shadow || ar(e, t.glow ?? null, n);
	let g = new Set([
		"line",
		"straightconnector1",
		"bentconnector2",
		"bentconnector3",
		"bentconnector4",
		"bentconnector5",
		"curvedconnector2",
		"curvedconnector3",
		"curvedconnector4",
		"curvedconnector5"
	]), _ = new Set([
		"callout1",
		"callout2",
		"callout3",
		"bordercallout1",
		"bordercallout2",
		"bordercallout3",
		"accentcallout1",
		"accentcallout2",
		"accentcallout3",
		"accentbordercallout1",
		"accentbordercallout2",
		"accentbordercallout3"
	]), v = (e) => _.has(e) || e === "line" || e === "straightconnector1" || e.startsWith("bentconnector"), y = !t.custGeom && x(m), b = (e, r) => {
		let i = r ?? h, a = r ? null : t.stroke ? () => {
			Nr(e, t.stroke, n), e.stroke();
		} : null, o = () => or(e);
		if (y && !r) {
			C(e, m, c, u, d, f, [
				t.adj,
				t.adj2,
				t.adj3,
				t.adj4,
				t.adj5,
				t.adj6,
				t.adj7,
				t.adj8
			], i, a, o, v(m) ? { skipTrailingStroke: !0 } : void 0);
			return;
		}
		e.beginPath(), t.custGeom && t.custGeom.length > 0 ? vr(e, t.custGeom, c, u, d, f) : _e(e, m, c, u, d, f, t.adj, t.adj2, t.adj3, t.adj4), i && m !== "arc" && (e.fillStyle = i, m === "donut" || m === "smileyface" || m === "frame" ? e.fill("evenodd") : e.fill(), r || o()), a && a();
	}, S = e.canvas.width || 0, w = e.canvas.height || 0, T = e.getTransform(), E = Math.abs(T.a * T.d - T.b * T.c), D = E > 0 ? Math.sqrt(E) : 1, O = {
		x: c * D,
		y: u * D,
		w: d * D,
		h: f * D
	}, k = n * D, A = (e) => {
		e.setTransform(T);
	};
	if (t.reflection && S > 0 && w > 0 && (e.save(), e.setTransform(new DOMMatrix()), pt(e, (e) => {
		A(e), b(e);
	}, O, t.reflection, k, S, w), e.restore()), t.softEdge && S > 0 && w > 0 ? (e.save(), e.setTransform(new DOMMatrix()), ft(e, (e) => {
		A(e), b(e);
	}, O, t.softEdge, k, S, w, (e) => {
		A(e), b(e, "#000");
	}), e.restore()) : b(e), t.innerShadow && S > 0 && w > 0 && (e.save(), e.setTransform(new DOMMatrix()), dt(e, (e) => {
		A(e), b(e, "#000");
	}, O, t.innerShadow, k, S, w), e.restore()), t.stroke && (g.has(m) || _.has(m))) {
		let r = l(m, c, u, d, f, [
			t.adj,
			t.adj2,
			t.adj3,
			t.adj4,
			t.adj5,
			t.adj6,
			t.adj7,
			t.adj8
		]);
		if (r) {
			let i = t.stroke.cmpd, a = m === "line" || m === "straightconnector1";
			if (v(m) && r.vertices.length >= 2 && !(i && a)) {
				let i = r.vertices.map((e) => ({
					x: e.x,
					y: e.y
				}));
				if (t.stroke.tailEnd) {
					let e = Oe(t.stroke.tailEnd, t.stroke, n);
					i[i.length - 1] = ge(i[i.length - 1], i[i.length - 2], e);
				}
				if (t.stroke.headEnd) {
					let e = Oe(t.stroke.headEnd, t.stroke, n);
					i[0] = ge(i[0], i[1], e);
				}
				Nr(e, t.stroke, n), e.beginPath(), e.moveTo(i[0].x, i[0].y);
				for (let t = 1; t < i.length; t++) e.lineTo(i[t].x, i[t].y);
				e.stroke();
			}
			i && a && Mr(e, r.start, r.end, t.stroke, i, n), t.stroke.tailEnd && be(e, r.end.x, r.end.y, r.end.angle, t.stroke.tailEnd, t.stroke, n), t.stroke.headEnd && be(e, r.start.x, r.start.y, r.start.angle, t.stroke.headEnd, t.stroke, n);
		}
	} else if (t.stroke && t.custGeom && t.custGeom.length > 0 && (t.stroke.headEnd && t.stroke.headEnd.type !== "none" || t.stroke.tailEnd && t.stroke.tailEnd.type !== "none")) {
		let { start: r, end: i } = Ve(t.custGeom);
		r && t.stroke.headEnd && t.stroke.headEnd.type !== "none" && be(e, c + r.x * d, u + r.y * f, Math.atan2(r.dy * f, r.dx * d), t.stroke.headEnd, t.stroke, n), i && t.stroke.tailEnd && t.stroke.tailEnd.type !== "none" && be(e, c + i.x * d, u + i.y * f, Math.atan2(i.dy * f, i.dx * d), t.stroke.tailEnd, t.stroke, n);
	}
	if (t.textBody) {
		let l = t.defaultTextColor ? Z(t.defaultTextColor) : null;
		if (e.save(), t.flipH || t.flipV) {
			let n = c + d / 2, r = u + f / 2;
			e.translate(n, r), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-n, -r);
		}
		let p = c, h = u, g = d, _ = f;
		if (t.textRect) p = X(t.textRect.x, n), h = X(t.textRect.y, n), g = X(t.textRect.width, n), _ = X(t.textRect.height, n);
		else if (m === "ellipse") {
			let e = d * (1 - 1 / Math.SQRT2) / 2, t = f * (1 - 1 / Math.SQRT2) / 2;
			p = c + e, h = u + t, g = d / Math.SQRT2, _ = f / Math.SQRT2;
		} else {
			let e = gr(m, c, u, d, f, t.adj, t.adj2);
			e && (p = e.tx, h = e.ty, g = e.tw, _ = e.th);
		}
		Cr(e, t.textBody, p, h, g, _, n, l, t.rotation, !1, !1, r, i, a, o, !1, s), e.restore();
	}
	e.restore();
}
var vr = we;
function yr(e, t) {
	let n = `${e}`, r = e >= 1 && e <= 26 ? String.fromCharCode(96 + e) : n, i = e >= 1 && e <= 26 ? String.fromCharCode(64 + e) : n, a = br(e).toLowerCase(), o = br(e), s = n.replace(/[0-9]/g, (e) => String.fromCharCode(65296 + (e.charCodeAt(0) - 48)));
	switch (t) {
		case "arabicPlain": return n;
		case "arabicPeriod": return `${n}.`;
		case "arabicParenR": return `${n})`;
		case "arabicParenBoth": return `(${n})`;
		case "arabicDbPlain": return s;
		case "arabicDbPeriod": return `${s}.`;
		case "alphaLcPlain": return r;
		case "alphaLcPeriod": return `${r}.`;
		case "alphaLcParenR": return `${r})`;
		case "alphaLcParenBoth": return `(${r})`;
		case "alphaUcPlain": return i;
		case "alphaUcPeriod": return `${i}.`;
		case "alphaUcParenR": return `${i})`;
		case "alphaUcParenBoth": return `(${i})`;
		case "romanLcPlain": return a;
		case "romanLcPeriod": return `${a}.`;
		case "romanLcParenR": return `${a})`;
		case "romanLcParenBoth": return `(${a})`;
		case "romanUcPlain": return o;
		case "romanUcPeriod": return `${o}.`;
		case "romanUcParenR": return `${o})`;
		case "romanUcParenBoth": return `(${o})`;
		default: return `${n}.`;
	}
}
function br(e) {
	let t = [
		1e3,
		900,
		500,
		400,
		100,
		90,
		50,
		40,
		10,
		9,
		5,
		4,
		1
	], n = [
		"M",
		"CM",
		"D",
		"CD",
		"C",
		"XC",
		"L",
		"XL",
		"X",
		"IX",
		"V",
		"IV",
		"I"
	], r = "";
	for (let i = 0; i < t.length; i++) for (; e >= t[i];) r += n[i], e -= t[i];
	return r;
}
function xr(e) {
	for (let t of e.runs) if (t.type === "text" && t.text !== "" || t.type === "math") return !0;
	return !1;
}
function Sr(e, t) {
	let n = xr(e);
	if (e.bullet.type === "char") return t.clear(), n ? ve(e.bullet.char, e.bullet.fontFamily ?? null) : "";
	if (e.bullet.type === "autoNum") {
		if (!n) return "";
		let r = e.lvl;
		return t.has(r) ? t.set(r, t.get(r) + 1) : t.set(r, e.bullet.startAt ?? 1), yr(t.get(r), e.bullet.numType);
	}
	return t.clear(), "";
}
function Cr(e, t, n, i, a, o, s, c = null, l = 0, u = !1, d = !1, f = "#000000", p, m = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, h, g = !1, _) {
	let v = t.vert === "vert" || t.vert === "eaVert", y = t.vert === "vert270";
	if (v || y) {
		let r = n + a / 2, u = i + o / 2, d = v ? 90 : -90, b = h ? (e) => h({
			...e,
			inShapeX: e.inShapeX - o / 2 + a / 2,
			inShapeY: e.inShapeY - a / 2 + o / 2,
			shapeX: n,
			shapeY: i,
			shapeW: a,
			shapeH: o,
			rotation: l,
			textBodyRotation: d
		}) : void 0;
		if (g) return a;
		e.save(), e.translate(r, u), e.rotate(y ? -Math.PI / 2 : Math.PI / 2), Cr(e, {
			...t,
			vert: "horz"
		}, -o / 2, -a / 2, o, a, s, c, 0, !1, !1, f, p, m, b, !1, _), e.restore();
		return;
	}
	let b = t.textWarp;
	if (!g && b && Ze(b.preset)) {
		hr(e, t, b.preset, b.adj ?? [], n, i, a, o, s, c ?? f, m);
		return;
	}
	let x = X(t.lIns, s), S = X(t.rIns, s), C = X(t.tIns, s), w = X(t.bIns, s), T = t.wrap !== "none", E = t.autoFit === "sp" ? T && Zn(e, t, a, x, S, s, m) : T, D = Math.max(1, t.numCol ?? 1), O = X(t.spcCol ?? 0, s), k = t.defaultBold ?? !1, A = t.defaultItalic ?? !1, j = c ?? f, M = (r) => {
		let i = (t.defaultFontSize ?? 18) * G * s * r, o = [], c = 0, l = /* @__PURE__ */ new Map();
		for (let u = 0; u < t.paragraphs.length; u++) {
			let d = t.paragraphs[u], f = X(d.marL, s), h = X(d.marR, s), g = X(d.indent, s), _ = d.defFontSize == null ? i : d.defFontSize * G * s * r, v = d.defColor ? Z(d.defColor) : j, y = Yn(d), b = (() => {
				for (let e of d.runs) if (e.type === "text" && e.fontSize != null) return e.fontSize;
				return null;
			})(), C = b == null ? _ : b * G * s * r, w = (() => {
				for (let e of d.runs) if (e.type === "text" && e.color) return e.color;
				return null;
			})(), T = w ? Z(w) : v, M = "", N = Q(!1, !1, C, "sans-serif", m), P = T, F = null;
			M = Sr(d, l);
			let I = vn(d.bullet);
			if (I.type === "char") {
				let e = I;
				N = Q(!1, !1, e.sizePct == null ? C : C * (e.sizePct / 100), M === e.char ? Bn(e.fontFamily ?? null, m) : "sans-serif", m), P = e.color ? Z(e.color) : T;
			} else if (I.type === "autoNum") N = Q(!1, !1, C, "sans-serif", m), P = T;
			else if (I.type === "blip") {
				let e = I, t = e.sizePct == null ? C : C * (e.sizePct / 100);
				F = {
					imagePath: e.imagePath,
					mimeType: e.mimeType,
					sizePx: t
				};
			}
			let L = D > 1 ? (a - x - S - (D - 1) * O) / D : a - x - S, R = n + x + f, z = n + x + f + g, B = L - f - h, V = $n(e, d, E ? B : Infinity, _, v, s, f, k, A, r, p, m, Xn(y, g)), ee = d.spaceBefore == null ? 0 : d.spaceBefore / 100 * G * s * r, H = d.spaceAfter == null ? 0 : d.spaceAfter / 100 * G * s * r;
			for (let n = 0; n < V.length; n++) {
				let r = V[n], i = n === 0, a = n === V.length - 1, l = 0, f = 0;
				for (let e of r.segments) {
					let t = e.math ? Math.max(e.sizePx, (e.math.ascent + e.math.descent) / 1.2) : e.sizePx;
					if (t > l && (l = t), !e.math) {
						let t = W(e.fontFamily, e.sizePx);
						t > f && (f = t);
					}
				}
				if (l === 0 && (l = _), i && M) {
					e.font = N;
					let t = e.measureText("M"), n = t.actualBoundingBoxAscent + t.actualBoundingBoxDescent;
					n > l && (l = n);
				}
				i && F && F.sizePx > l && (l = F.sizePx);
				let p = Math.max(l * 1.2, f), m;
				m = d.spaceLine ? d.spaceLine.type === "pct" ? p * (d.spaceLine.val / 1e5) : d.spaceLine.val * G * s : p, t.autoFit === "norm" && t.lnSpcReduction != null && d.spaceLine?.type !== "pts" && (m *= 1 - t.lnSpcReduction);
				let h = m + (a ? H : 0), v = i && u > 0 ? ee : 0, b = i ? Xn(y, g) : 0, x = r.segments.some((e) => e.text && e.text.length > 0 || e.math != null), S = i && x ? F : null;
				o.push({
					line: r,
					linePx: h,
					lineHeight: m,
					topGapPx: v,
					textXOffset: b,
					bulletLabel: i ? M : "",
					bulletFont: N,
					bulletColor: P,
					bulletX: z,
					bulletImage: S,
					textX: R,
					textMaxW: B,
					alignment: d.alignment,
					isLastLine: a,
					para: d
				}), c += h + v;
			}
		}
		return {
			allLines: o,
			totalHeight: c
		};
	}, { allLines: N, totalHeight: P } = M(1);
	if (t.autoFit === "norm") if (t.fontScale != null && t.fontScale > 0) t.fontScale < 1 && ({allLines: N, totalHeight: P} = M(t.fontScale));
	else {
		let e = o - C - w;
		if (P > e && e > 0) {
			let t = .1, n = 1;
			for (let r = 0; r < 6; r++) {
				let r = (t + n) / 2;
				M(r).totalHeight <= e ? t = r : n = r;
			}
			({allLines: N, totalHeight: P} = M(t));
		}
	}
	if (g) return C + P + w;
	let F = t.verticalAnchor ?? "t", I = i, L;
	o === 0 && F === "b" ? (L = C + P + w, I = i - L) : L = t.autoFit === "sp" ? Math.max(o, C + P + w) : o;
	let R, z = Math.max(0, L - C - w);
	R = F === "ctr" ? I + C + (z - P) / 2 : F === "b" ? I + L - w - P : I + C, e.save(), e.textAlign = "left", e.textBaseline = "alphabetic";
	let B = R, V = D > 1 ? (a - x - S - (D - 1) * O) / D + O : 0, ee = Math.max(0, L - C - w), H = o === 0 || P <= ee + .5, te = D > 1 && !H ? Math.ceil(N.length / D) : N.length, U = 0, K = 0;
	for (let c of N) {
		let { line: u, linePx: d, lineHeight: f, topGapPx: p, textXOffset: g, bulletLabel: v, bulletFont: y, bulletColor: b, bulletImage: S, alignment: C, isLastLine: w } = c;
		D > 1 && U < D - 1 && K >= te && (U++, K = 0, R = B), R += p, K++;
		let T = (t.rtlCol ? D - 1 - U : U) * V, E = c.textX + T, O = c.bulletX + T, k = c.textMaxW, A = c.para.rtl === !0, j = A || Sn(u.segments), M = 0, N = f * .8;
		for (let t of u.segments) {
			if (t.math) {
				M += t.math.width, N = Math.max(N, t.math.ascent);
				continue;
			}
			e.font = t.font;
			let n = e.measureText(t.text || "M"), r = t.letterSpacingPx ?? 0;
			M += t.text ? n.width + r * $(t.text) : 0, n.actualBoundingBoxAscent > 0 && (N = Math.max(N, n.actualBoundingBoxAscent));
		}
		let P = R + N;
		if (v) if (e.font = y, e.fillStyle = b, j && A) {
			let t = e.direction;
			e.direction = "rtl";
			let n = e.measureText(v).width;
			e.fillText(v, E + k + (E - O) - n, P), e.direction = t;
		} else e.fillText(v, O, P);
		if (S && _) {
			let t = he(S.imagePath, _);
			if (t) {
				let n = S.sizePx, r = t.height > 0 ? n * (t.width / t.height) : n, i = P - n;
				if (j && A) {
					let a = E + k + (E - O) - r;
					e.drawImage(t, a, i, r, n);
				} else e.drawImage(t, O, i, r, n);
			}
		}
		let F = E + g, I;
		I = C === "ctr" ? F + (k - g - M) / 2 : C === "r" ? E + k - M : F;
		let L = C === "just" || C === "justLow" ? "just" : C === "dist" || C === "thaiDist" ? "dist" : null, z = !!u.tabStop && u.tabStop.segments.length > 0, ee = w || (u.endsWithBreak ?? !1), H = (L && !j && !z ? En(u.segments, k - g, M, L, ee) : null) ?? u.segments, W = j ? Cn(u.segments, A) : null, G = H.length;
		for (let t = 0; t < G; t++) {
			let c = W ? W.order[t] : t, u = H[c], d = W ? W.rtl[c] : !1;
			j && (e.direction = d ? "rtl" : "ltr");
			let p = u.jext ?? 0, g = u.splitBefore, _ = u.perGap ?? 0, v = g && g.length > 0 ? g.length * _ : 0;
			if (u.math) {
				let t = Nn.get(u.math.nodes), n = u.math.width, r = u.math.ascent + u.math.descent;
				if (t && n > 0 && r > 0) {
					let i = P - u.math.ascent, a = Pn(t, u.color);
					e.drawImage(a, I, i, n, r);
				}
				I += n, I += p;
				continue;
			}
			e.font = u.font, e.fillStyle = u.color;
			let y = P + (u.baseline ? -(u.baseline / 1e5) * u.sizePx : 0), b = u.letterSpacingPx ?? 0;
			if (u.highlight && u.text) {
				let t = e.measureText(u.text).width + (b > 0 ? b * $(u.text) : 0) + v + p;
				An(e, I, y, t, u.sizePx, u.highlight, u.color);
			}
			let x = u.shadow;
			if (x) {
				let t = x.dir * Math.PI / 180, n = X(x.dist, s);
				e.save(), e.shadowColor = Z(x.color, x.alpha), e.shadowBlur = X(x.blur, s), e.shadowOffsetX = Math.cos(t) * n, e.shadowOffsetY = Math.sin(t) * n;
			}
			let S = (t, n, r) => {
				let i = r === "fill" ? e.fillText.bind(e) : e.strokeText.bind(e);
				if (b > 0 && t.length > 1) {
					let r = e, a = r.letterSpacing;
					try {
						r.letterSpacing = `${b}px`;
					} catch {}
					i(t, n, y);
					try {
						r.letterSpacing = a;
					} catch {}
				} else i(t, n, y);
			}, C = (t) => e.measureText(t).width, w = g && g.length > 0 ? Te([...u.text], g, _, C, b) : null, T = [...u.text], E = !!g && g.length === T.length - 1 && T.length > 1, D = (t) => {
				if (E) {
					let n = e, r = n.letterSpacing;
					try {
						n.letterSpacing = `${b + _}px`;
					} catch {}
					(t === "fill" ? e.fillText.bind(e) : e.strokeText.bind(e))(u.text, I, y);
					try {
						n.letterSpacing = r;
					} catch {}
				} else if (w) for (let { text: e, dx: n } of w) S(e, I + n, t);
				else S(u.text, I, t);
			};
			D("fill"), x && e.restore();
			let O = u.outline;
			O && O.width > 0 && (e.save(), e.lineWidth = Math.max(.5, X(O.width, s)), e.strokeStyle = O.color ? `#${O.color}` : u.color, e.lineJoin = "round", D("stroke"), e.restore()), e.font = u.font;
			let k = e.measureText(u.text).width + (b > 0 ? b * $(u.text) : 0) + v;
			if (h && u.text && h({
				text: u.text,
				inShapeX: I - n,
				inShapeY: R - i,
				w: k + p,
				h: f,
				fontSize: u.sizePx,
				font: u.font,
				shapeX: n,
				shapeY: i,
				shapeW: a,
				shapeH: o,
				rotation: l,
				hyperlink: u.hyperlink
			}), u.underline && me(e, I, y, k + p, u.sizePx, u.underlineColor ?? u.color, u.underlineStyle, m.dpr), u.strikethrough) {
				let t = Math.max(1, u.sizePx * .05);
				e.strokeStyle = u.color, e.lineWidth = t, e.setLineDash([]);
				let n = y - u.sizePx * .32;
				if (u.strikeDouble) {
					let i = t * .9, a = n - i, o = n + i;
					e.beginPath(), e.moveTo(I, a + r(a, t, m.dpr)), e.lineTo(I + k + p, a + r(a, t, m.dpr)), e.moveTo(I, o + r(o, t, m.dpr)), e.lineTo(I + k + p, o + r(o, t, m.dpr)), e.stroke();
				} else {
					let i = n + r(n, t, m.dpr);
					e.beginPath(), e.moveTo(I, i), e.lineTo(I + k + p, i), e.stroke();
				}
			}
			I += k, I += p;
		}
		if (j && (e.direction = "ltr"), u.tabStop && u.tabStop.segments.length > 0) {
			let t = n + x + u.tabStop.px, r = 0;
			for (let t of u.tabStop.segments) {
				e.font = t.font;
				let n = t.letterSpacingPx ?? 0;
				r += e.measureText(t.text).width + n * $(t.text);
			}
			let s;
			s = u.tabStop.algn === "r" ? t - r : u.tabStop.algn === "ctr" ? t - r / 2 : t;
			for (let t of u.tabStop.segments) {
				e.font = t.font, e.fillStyle = t.color;
				let r = t.letterSpacingPx ?? 0;
				if (t.highlight && t.text) {
					let n = e.measureText(t.text).width + r * $(t.text);
					An(e, s, P, n, t.sizePx, t.highlight, t.color);
				}
				if (r > 0 && t.text.length > 1) {
					let n = e, i = n.letterSpacing;
					try {
						n.letterSpacing = `${r}px`;
					} catch {}
					e.fillText(t.text, s, P);
					try {
						n.letterSpacing = i;
					} catch {}
				} else e.fillText(t.text, s, P);
				e.font = t.font;
				let c = e.measureText(t.text).width + r * $(t.text);
				h && t.text && h({
					text: t.text,
					inShapeX: s - n,
					inShapeY: R - i,
					w: c,
					h: f,
					fontSize: t.sizePx,
					font: t.font,
					shapeX: n,
					shapeY: i,
					shapeW: a,
					shapeH: o,
					rotation: l,
					hyperlink: t.hyperlink
				}), s += c;
			}
		}
		R += d;
	}
	e.restore();
}
function wr(e, t, n, r, i) {
	if (!e) return [];
	let a = $t(t?.rig ?? "threePt", t?.dir ?? "t", t?.rot), o = on(n), s = r * i, c = [];
	return e.bevelT && e.bevelT.w > 0 && e.bevelT.h > 0 && c.push({
		widthPx: e.bevelT.w * s,
		heightPx: e.bevelT.h * s,
		prst: e.bevelT.prst || "circle",
		material: o,
		light: a
	}), e.bevelB && e.bevelB.w > 0 && e.bevelB.h > 0 && c.push({
		widthPx: e.bevelB.w * s,
		heightPx: e.bevelB.h * s,
		prst: e.bevelB.prst || "circle",
		material: o,
		light: a,
		bottom: !0
	}), c;
}
function Tr(e, t, n, r, i, a) {
	if (!e || !e.extrusionH || e.extrusionH <= 0) return null;
	let o = e.extrusionH * i * a, s = Tt(t, n * a, r * a, o);
	if (Math.hypot(s.x, s.y) < .75) return null;
	let c = [
		64,
		64,
		64
	];
	if (e.extrusionClr) {
		let t = e.extrusionClr.replace("#", "");
		t.length >= 6 && (c = [
			parseInt(t.slice(0, 2), 16),
			parseInt(t.slice(2, 4), 16),
			parseInt(t.slice(4, 6), 16)
		]);
	}
	return {
		offsetX: s.x,
		offsetY: s.y,
		rgb: c
	};
}
function Er(e, t, n, r, i, a, o, s = {}) {
	if (i <= 0 || a <= 0) return !1;
	let c = e.getTransform(), l = Math.abs(c.a * c.d - c.b * c.c), u = l > 0 ? Math.sqrt(l) : 1, d = Math.max(0, Math.ceil((s.edgePadCss ?? 0) * u)), f = Ct(t, i, a), p = f.corners;
	if (d > 0) {
		let e = d / u, t = Pt(f.corners, e / i, e / a);
		t ? p = t : d = 0;
	}
	let m = d / u, h = Math.max(1, Math.ceil(i * u) + 2 * d), g = Math.max(1, Math.ceil(a * u) + 2 * d), _ = U(h, g);
	if (!_) return !1;
	let v = _.getContext("2d");
	if (!v) return !1;
	v.save(), v.scale(u, u), v.translate(m, m), o(v, 0, 0, i, a), v.restore();
	let y = Math.ceil(i * u), b = Math.ceil(a * u), x = (e) => ({
		x: d - e,
		y: d - e,
		w: y + 2 * e,
		h: b + 2 * e
	});
	if (s.extrusion) {
		let e = Math.ceil(Math.hypot(s.extrusion.offsetX, s.extrusion.offsetY)) + 2;
		dn(v, s.extrusion, x(e));
	}
	if (s.bevels && s.bevels.length > 0) for (let e of s.bevels) un(v, e, x(Math.ceil(e.widthPx) + 2));
	return s.paintEdges && (v.save(), v.scale(u, u), v.translate(m, m), s.paintEdges(v, 0, 0, i, a), v.restore()), Mt(_, e, h, g, p.map((e) => ({
		x: n + e.x,
		y: r + e.y
	}))), !0;
}
function Dr(e, t, n, r, i, a, o, s, c = 0) {
	if (r <= 0 || i <= 0 || a.length === 0) return !1;
	let l = e.getTransform(), u = Math.abs(l.a * l.d - l.b * l.c), d = u > 0 ? Math.sqrt(u) : 1, f = Math.max(0, Math.ceil(c * d)), p = f / d, m = Math.max(1, Math.ceil(r * d) + 2 * f), h = Math.max(1, Math.ceil(i * d) + 2 * f), g = U(m, h);
	if (!g) return !1;
	let _ = g.getContext("2d");
	if (!_) return !1;
	_.save(), _.scale(d, d), _.translate(p, p), o(_, 0, 0, r, i), _.restore();
	let v = Math.ceil(r * d), y = Math.ceil(i * d);
	for (let e of a) {
		let t = Math.ceil(e.widthPx) + 2;
		un(_, e, {
			x: f - t,
			y: f - t,
			w: v + 2 * t,
			h: y + 2 * t
		});
	}
	return s && (_.save(), _.scale(d, d), _.translate(p, p), s(_, 0, 0, r, i), _.restore()), e.drawImage(g, t - p, n - p, m / d, h / d), !0;
}
var Or = /* @__PURE__ */ new WeakMap();
function kr(e, t) {
	let n = Or.get(e);
	if (n) return n;
	let r = (async () => {
		let n = await t(e.posterPath), r = e.posterMimeType ? new Blob([n], { type: e.posterMimeType }) : n;
		if (_(new Uint8Array(await r.slice(0, 64 * 1024).arrayBuffer()))) throw Error("poster raster exceeds the pixel budget");
		return createImageBitmap(r);
	})();
	return Or.set(e, r), r;
}
async function Ar(e, n, r, i) {
	if (i) try {
		let a = n.mimeType === "image/svg+xml", { widthPt: o, heightPt: s } = u(n.mimeType, n.srcRect, n.width / G, n.height / G), c;
		if (R(n)) try {
			c = await t(n.svgImagePath, i);
		} catch {
			c = a ? await t(n.imagePath, i) : await Ge(n.imagePath, n.mimeType, n.duotone, i, {
				widthPt: o,
				heightPt: s
			});
		}
		else c = a ? await t(n.imagePath, i) : await Ge(n.imagePath, n.mimeType, n.duotone, i, {
			widthPt: o,
			heightPt: s
		});
		if (!c) return;
		e.save(), n.alpha != null && (e.globalAlpha *= n.alpha);
		let l = X(n.x, r), d = X(n.y, r), f = X(n.width, r), p = X(n.height, r);
		(n.rotation !== 0 || n.flipH || n.flipV) && (e.translate(l + f / 2, d + p / 2), e.rotate(n.rotation * Math.PI / 180), n.flipH && e.scale(-1, 1), n.flipV && e.scale(1, -1), e.translate(-(l + f / 2), -(d + p / 2)));
		let h = m(c, n.srcRect), g = (e, t, r, i, a) => {
			n.custGeom && n.custGeom.length > 0 ? vr(e, n.custGeom, t, r, i, a) : n.prstGeom && S(e, n.prstGeom, t, r, i, a, n.prstAdjust ?? []) || e.rect(t, r, i, a);
		}, _ = (e, t, n, r, i) => {
			e.beginPath(), g(e, t, n, r, i);
		}, v = (e, t, r, i, a) => {
			(n.prstGeom || n.custGeom && n.custGeom.length > 0) && (_(e, t, r, i, a), e.clip());
		}, y = (e, t, i, a, o) => {
			n.stroke && (e.save(), Nr(e, n.stroke, r), _(e, t, i, a, o), e.stroke(), e.restore());
		}, b = (e, t, i, a, o) => {
			let s = n.sp3d;
			if (s && (s.contourW ?? 0) > 0 && s.contourClr) {
				let n = Math.max(.5, s.contourW * r);
				e.save(), e.beginPath();
				let c = n * 2 + Math.max(a, o);
				e.rect(t - c, i - c, a + 2 * c, o + 2 * c), g(e, t, i, a, o), e.clip("evenodd"), e.beginPath(), _(e, t, i, a, o), e.strokeStyle = Z(s.contourClr), e.lineWidth = n * 2, e.setLineDash([]), e.stroke(), e.restore();
			}
		}, x = n.scene3d && wt(n.scene3d.camera) ? n.scene3d : null, C = (e, t, n, r, i) => {
			e.save(), v(e, t, n, r, i), h ? e.drawImage(c, h.sx, h.sy, h.sw, h.sh, t, n, r, i) : e.drawImage(c, t, n, r, i), e.restore();
		}, w = (e, t, n, r, i) => {
			C(e, t, n, r, i), y(e, t, n, r, i), b(e, t, n, r, i);
		}, T = (e, t, n, r, i) => {
			C(e, t, n, r, i), y(e, t, n, r, i);
		}, E = e.getTransform(), D = Math.abs(E.a * E.d - E.b * E.c), O = D > 0 ? Math.sqrt(D) : 1, k = wr(n.sp3d, n.scene3d?.lightRig, n.sp3d ? n.sp3d.prstMaterial : void 0, r, O), A = x ? Tr(n.sp3d, x.camera, f, p, r, O) : null, j = n.stroke ? n.stroke.width * r / 2 : 0, M = n.sp3d?.contourW ? n.sp3d.contourW * r : 0, N = A ? Math.hypot(A.offsetX, A.offsetY) / O : 0, P = j + M + N + 2, F = (e) => {
			if (x) {
				if (Er(e, x.camera, l, d, f, p, T, {
					bevels: k,
					extrusion: A ?? void 0,
					paintEdges: b,
					edgePadCss: P
				})) return;
			} else if (k.length > 0 && Dr(e, l, d, f, p, k, T, b, P)) return;
			w(e, l, d, f, p);
		}, I = (e, t, n, r, i, a) => {
			e.save(), v(e, n, r, i, a), e.fillStyle = t, e.fillRect(n, r, i, a), e.restore();
		}, L = (e, t) => {
			x && Er(e, x.camera, l, d, f, p, (e, n, r, i, a) => I(e, t, n, r, i, a)) || I(e, t, l, d, f, p);
		}, z = e.canvas.width || 0, B = e.canvas.height || 0, V = e.getTransform(), ee = Math.abs(V.a * V.d - V.b * V.c), H = ee > 0 ? Math.sqrt(ee) : 1, te = {
			x: l * H,
			y: d * H,
			w: f * H,
			h: p * H
		}, U = r * H, W = (e) => e.setTransform(V), K = z > 0 && B > 0;
		n.reflection && K && (e.save(), e.setTransform(new DOMMatrix()), pt(e, (e) => {
			W(e), F(e);
		}, te, n.reflection, U, z, B), e.restore()), n.shadow ? ir(e, n.shadow, r) : n.glow && ar(e, n.glow, r), n.softEdge && K ? (e.save(), e.setTransform(new DOMMatrix()), ft(e, (e) => {
			W(e), F(e);
		}, te, n.softEdge, U, z, B, (e) => {
			W(e), L(e, "#000");
		}), e.restore()) : F(e), (n.shadow || n.glow) && or(e), n.innerShadow && K && (e.save(), e.setTransform(new DOMMatrix()), dt(e, (e) => {
			W(e), L(e, "#000");
		}, te, n.innerShadow, U, z, B), e.restore()), e.restore();
	} catch {}
}
async function jr(e, t, n, r, i) {
	let a = X(t.x, n), o = X(t.y, n), s = X(t.width, n), c = X(t.height, n), l = !1;
	if (t.posterPath && r) try {
		let n = await kr(t, r);
		e.drawImage(n, a, o, s, c), l = !0;
	} catch {}
	l || (e.fillStyle = t.mediaKind === "video" ? "#111" : "#f0f0f0", e.fillRect(a, o, s, c)), !i && bn(e, a + s / 2, o + c / 2, s, c, "paused");
}
function Mr(e, t, n, r, i, a) {
	let o = Math.max(.5, X(r.width, a)), s = n.x - t.x, c = n.y - t.y, l = Math.hypot(s, c);
	if (l === 0) return;
	let u = -c / l, d = s / l, f;
	switch (i) {
		case "dbl":
			f = [{
				offset: -1 / 3,
				widthFrac: 1 / 3
			}, {
				offset: 1 / 3,
				widthFrac: 1 / 3
			}];
			break;
		case "thinThick":
			f = [{
				offset: -3 / 8,
				widthFrac: 1 / 4
			}, {
				offset: 1 / 4,
				widthFrac: 1 / 2
			}];
			break;
		case "thickThin":
			f = [{
				offset: -1 / 4,
				widthFrac: 1 / 2
			}, {
				offset: 3 / 8,
				widthFrac: 1 / 4
			}];
			break;
		case "tri":
			f = [
				{
					offset: -2 / 5,
					widthFrac: 1 / 5
				},
				{
					offset: 0,
					widthFrac: 3 / 5
				},
				{
					offset: 2 / 5,
					widthFrac: 1 / 5
				}
			];
			break;
		default: return;
	}
	e.save(), e.globalCompositeOperation = "destination-out", e.strokeStyle = "#000", e.lineWidth = o + .5, e.setLineDash([]), e.beginPath(), e.moveTo(t.x, t.y), e.lineTo(n.x, n.y), e.stroke(), e.globalCompositeOperation = "source-over", e.strokeStyle = Z(r.color);
	for (let r of f) {
		let i = u * (o * r.offset), a = d * (o * r.offset);
		e.lineWidth = Math.max(.5, o * r.widthFrac), e.beginPath(), e.moveTo(t.x + i, t.y + a), e.lineTo(n.x + i, n.y + a), e.stroke();
	}
	e.restore();
}
function Nr(e, t, n) {
	w(e, t, n);
}
function Pr(e, t, n, i, a = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}) {
	let o = X(t.x, n), s = X(t.y, n), c = t.cols.map((e) => X(e, n)), l = c.length, u = (e, t) => {
		let n = 0;
		for (let r = 0; r < t; r++) n += c[e + r] ?? 0;
		return n;
	}, d = t.rows.map((e) => X(e.height, n));
	for (let r = 0; r < t.rows.length; r++) {
		let o = t.rows[r];
		for (let t = 0; t < o.cells.length; t++) {
			let s = o.cells[t];
			if (s.hMerge || s.vMerge || (s.rowSpan || 1) > 1 || !s.textBody) continue;
			let c = u(t, s.gridSpan || 1), l = Cr(e, s.textBody, 0, 0, c, 0, n, null, 0, !1, !1, "#000000", i, a, void 0, !0) || 0;
			l > d[r] && (d[r] = l);
		}
	}
	for (let r = 0; r < t.rows.length; r++) {
		let o = t.rows[r];
		for (let t = 0; t < o.cells.length; t++) {
			let s = o.cells[t];
			if (s.hMerge || s.vMerge) continue;
			let c = s.rowSpan || 1;
			if (c <= 1 || !s.textBody) continue;
			let l = u(t, s.gridSpan || 1), f = Cr(e, s.textBody, 0, 0, l, 0, n, null, 0, !1, !1, "#000000", i, a, void 0, !0) || 0, p = 0;
			for (let e = 0; e < c && r + e < d.length; e++) p += d[r + e];
			if (f > p) {
				let e = (f - p) / c;
				for (let t = 0; t < c && r + t < d.length; t++) d[r + t] += e;
			}
		}
	}
	let f = c.reduce((e, t) => e + t, 0), p = Array(l);
	if (t.rtl) {
		let e = o + f;
		for (let t = 0; t < l; t++) e -= c[t], p[t] = e;
	} else {
		let e = o;
		for (let t = 0; t < l; t++) p[t] = e, e += c[t];
	}
	let m = (e, n) => t.rtl ? p[e + n - 1] : p[e], h = Array(t.rows.length);
	{
		let e = s;
		for (let n = 0; n < t.rows.length; n++) h[n] = e, e += d[n];
	}
	let g = [], _ = t.rows.map(() => Array(l).fill(-1));
	for (let e = 0; e < t.rows.length; e++) {
		let n = t.rows[e], r = h[e];
		for (let i = 0; i < n.cells.length; i++) {
			let a = n.cells[i];
			if (a.hMerge || a.vMerge) continue;
			let o = a.gridSpan || 1, s = a.rowSpan || 1, c = u(i, o), f = 0;
			for (let t = 0; t < s; t++) f += d[e + t] ?? 0;
			let p = m(i, o), h = Math.min(e + s - 1, t.rows.length - 1), v = g.length;
			g.push({
				cell: a,
				colX: p,
				rowY: r,
				cellW: c,
				cellH: f,
				ci: i,
				ri: e,
				span: o,
				lastRi: h
			});
			for (let t = e; t <= h; t++) for (let e = i; e < i + o && e < l; e++) _[t][e] = v;
		}
	}
	for (let { cell: t, colX: r, rowY: o, cellW: s, cellH: c } of g) {
		let l = jn(t.fill);
		if (l && (e.fillStyle = l, e.fillRect(r, o, s, c)), t.textBody) {
			let l = t.textColor ? Z(t.textColor) : null;
			Cr(e, t.textBody, r, o, s, c, n, l, 0, !1, !1, "#000000", i, a);
		}
	}
	let v = a.dpr, y = (e, t) => {
		if (e < 0 || e >= _.length || t < 0 || t >= l) return null;
		let n = _[e][t];
		return n < 0 ? null : g[n];
	}, b = (t, i, a, o, s) => {
		Nr(e, t, n);
		let c = i === o ? r(i, e.lineWidth, v) : 0, l = a === s ? r(a, e.lineWidth, v) : 0;
		e.beginPath(), e.moveTo(i + c, a + l), e.lineTo(o + c, s + l), e.stroke();
	};
	for (let r of g) {
		let { cell: i, colX: a, rowY: o, cellW: s, cellH: c } = r;
		e.save();
		let u = t.rtl ? i.borderR : i.borderL, d = t.rtl ? i.borderL : i.borderR, f = t.rtl ? r.ci + r.span === l : r.ci === 0, p = t.rtl ? r.ci === 0 : r.ci + r.span === l, m = t.rtl ? r.ci - 1 : r.ci + r.span, h = (e) => t.rtl ? e.borderR : e.borderL;
		r.ri === 0 && i.borderT && b(i.borderT, a, o, a + s, o), f && u && b(u, a, o, a, o + c);
		{
			let e;
			if (r.lastRi === t.rows.length - 1) e = i.borderB;
			else {
				let t = y(r.lastRi + 1, r.ci);
				e = kn(i.borderB, t ? t.cell.borderT : null);
			}
			e && b(e, a, o + c, a + s, o + c);
		}
		{
			let e;
			if (p) e = d;
			else {
				let t = y(r.ri, m);
				e = kn(d, t ? h(t.cell) : null);
			}
			e && b(e, a + s, o, a + s, o + c);
		}
		i.diagonalTL && (Nr(e, i.diagonalTL, n), e.beginPath(), e.moveTo(a, o), e.lineTo(a + s, o + c), e.stroke()), i.diagonalTR && (Nr(e, i.diagonalTR, n), e.beginPath(), e.moveTo(a + s, o), e.lineTo(a, o + c), e.stroke()), e.restore();
	}
}
function Fr(e, t, n, r) {
	e.save(), e.globalAlpha = t.opacity, e.fillStyle = t.color, e.fillRect(0, 0, n, r), e.restore();
}
var Ir = /* @__PURE__ */ new WeakMap();
function Lr(e, t, n, r, i) {
	e.save(), e.fillStyle = "#f7f7f8", e.fillRect(0, 0, t, n);
	let a = Math.max(12, Math.min(t, n) * .04);
	e.strokeStyle = "#c8ccd2", e.lineWidth = Math.max(1, Math.min(t, n) * .004), e.setLineDash([e.lineWidth * 6, e.lineWidth * 5]), e.strokeRect(a, a, t - a * 2, n - a * 2), e.setLineDash([]);
	let o = t / 2, s = Math.max(18, Math.min(t, n) * .14);
	e.fillStyle = "#b23b3b", e.textAlign = "center", e.textBaseline = "middle", e.font = `${s}px sans-serif`, e.fillText("⚠", o, n * .34);
	let c = Math.max(11, Math.min(t, n) * .045);
	e.fillStyle = "#333333", e.font = `600 ${c}px sans-serif`, e.fillText(`Slide ${r} could not be displayed`, o, n * .52);
	let l = Math.max(9, Math.min(t, n) * .028);
	e.fillStyle = "#666666", e.font = `${l}px sans-serif`;
	let u = t - a * 4, d = i.split(/\s+/), f = [], p = "";
	for (let t of d) {
		let n = p ? `${p} ${t}` : t;
		if (e.measureText(n).width > u && p ? (f.push(p), p = t) : p = n, f.length >= 4) break;
	}
	p && f.length < 4 && f.push(p);
	let m = l * 1.35, h = n * .6 + m;
	for (let t of f.slice(0, 4)) e.fillText(t, o, h), h += m;
	e.restore();
}
async function Rr(e, n, r, i, o = {}, s) {
	let c = (Ir.get(e) ?? 0) + 1;
	Ir.set(e, c);
	let l = () => Ir.get(e) !== c, f = o.width ?? ((z(e) ? e.offsetWidth : 0) || 960), p = f / r, m = Math.round(f), g = Math.round(i * p), _ = o.dpr ?? h(), v = a(m * _, g * _), y = v.clamped ? _ * v.scale : _;
	e.width = v.width, e.height = v.height, z(e) && (e.style.width = `${m}px`, e.style.display || (e.style.display = "block"));
	let b = e.getContext("2d");
	if (!b) throw Error("Could not get 2D context");
	if (b.scale(y, y), n.parseError) return Lr(b, m, g, n.slideNumber, n.parseError), e;
	let x = {
		themeMajorFont: o.majorFont ?? null,
		themeMinorFont: o.minorFont ?? null,
		themeHlinkColor: o.hlinkColor ?? null,
		dpr: y
	};
	if (await er(b, n.background, m, g, p, o.fetchImage), l() || (o.math && await zn(n, o.math), l())) return e;
	let S = o.defaultTextColor ? `#${o.defaultTextColor}` : "#000000", C = n.slideNumber;
	for (let e of n.elements) if (e.type === "picture" && o.fetchImage) {
		let n = e, r = n.mimeType === "image/svg+xml";
		if (R(n)) t(n.svgImagePath, o.fetchImage).catch(() => void 0);
		else if (r) t(n.imagePath, o.fetchImage).catch(() => void 0);
		else {
			let e = u(n.mimeType, n.srcRect, n.width / G, n.height / G);
			Ge(n.imagePath, n.mimeType, n.duotone, o.fetchImage, {
				widthPt: e.widthPt,
				heightPt: e.heightPt
			}).catch(() => void 0);
		}
	} else if (e.type === "media") {
		let t = e;
		t.posterPath && o.fetchMedia && kr(t, o.fetchMedia).catch(() => void 0);
	}
	if (o.fetchImage) {
		let t = o.fetchImage, r = /* @__PURE__ */ new Set();
		for (let e of n.elements) if (!(e.type !== "shape" || !e.textBody)) for (let t of e.textBody.paragraphs) {
			let e = vn(t.bullet);
			e.type === "blip" && r.add(`${e.imagePath} ${e.mimeType}`);
		}
		if (r.size > 0 && (await Promise.all([...r].map((e) => {
			let [n, r] = e.split(" ");
			return Ee(n, r, t).catch(() => void 0);
		})), l())) return e;
	}
	for (let t of n.elements) {
		if (l()) return e;
		if (t.type === "shape") _r(b, t, p, S, C, x, s, o.fetchImage);
		else if (t.type === "picture") await Ar(b, t, p, o.fetchImage);
		else if (t.type === "table") Pr(b, t, p, C, x);
		else if (t.type === "media") await jr(b, t, p, o.fetchMedia, o.skipMediaControls);
		else if (t.type === "chart") {
			let e = G * p;
			d(b, t.chart, {
				x: X(t.x, p),
				y: X(t.y, p),
				w: X(t.width, p),
				h: X(t.height, p)
			}, e);
		}
	}
	return l() || o.dim && Fr(b, o.dim, m, g), e;
}
//#endregion
//#region packages/pptx/src/tabular-text.ts
var zr = (e) => e >= "0" && e <= "9";
function Br(e) {
	let t = 0;
	for (let n = 0; n < 10; n++) t = Math.max(t, e.measureText(String(n)).width);
	return t;
}
function Vr(e, t, n) {
	let r = 0;
	for (let i of t) r += zr(i) ? n : e.measureText(i).width;
	return r;
}
function Hr(e, t, n, r, i) {
	let a = e.textAlign;
	e.textAlign = "left";
	let o = n;
	for (let n of t) if (zr(n)) {
		let t = e.measureText(n).width;
		e.fillText(n, o + (i - t) / 2, r), o += i;
	} else e.fillText(n, o, r), o += e.measureText(n).width;
	e.textAlign = a;
}
//#endregion
//#region packages/pptx/src/presentation-handle.ts
var Ur = (e, t) => e / q * t;
async function Wr(e, t, n) {
	let r = e.getContext("2d");
	if (!r) throw Error("2D context not available");
	let i = n.width / (n.slideWidthEmu / q);
	await n.drawBase();
	let a = document.createElement("canvas");
	a.width = e.width, a.height = e.height;
	let o = a.getContext("2d");
	if (!o) throw Error("base 2D context not available");
	o.drawImage(e, 0, 0);
	let s = [];
	for (let e of t) {
		let t;
		try {
			t = await n.fetchMedia(e.mediaPath);
		} catch {
			continue;
		}
		let r = e.mimeType || t.type, a = t.type === r ? t : new Blob([t], { type: r }), o = URL.createObjectURL(a), c = e.mediaKind === "video" ? document.createElement("video") : document.createElement("audio");
		c.src = o, c.preload = "metadata", e.mediaKind === "video" && (c.playsInline = !0);
		let l = {
			x: Ur(e.x, i),
			y: Ur(e.y, i),
			w: Ur(e.width, i),
			h: Ur(e.height, i)
		}, u = e.mediaKind === "audio" ? {
			x: l.x + l.w / 2 - Math.max(l.w, 260) / 2,
			y: l.y,
			w: Math.max(l.w, 260),
			h: l.h + 36
		} : l;
		s.push({
			el: e,
			rect: u,
			posterRect: l,
			media: c,
			objectUrl: o
		});
	}
	let c = null, l = !1, u = null, d = () => {
		r.setTransform(n.dpr, 0, 0, n.dpr, 0, 0);
		let t = e.width / n.dpr, i = e.height / n.dpr;
		r.drawImage(a, 0, 0, e.width, e.height, 0, 0, t, i);
		for (let e of s) {
			let t = e.media;
			if (e.el.mediaKind === "video" && t.readyState >= 2) {
				let { x: n, y: i, w: a, h: o } = e.posterRect;
				r.drawImage(t, n, i, a, o);
			}
			if (e === u || h?.state === e) Xr(r, e, t);
			else if (t.paused) {
				let { x: t, y: n, w: i, h: a } = e.posterRect;
				bn(r, t + i / 2, n + a / 2, i, a, "paused");
			}
		}
	}, f = () => {
		l || (d(), c = requestAnimationFrame(f));
	}, p = (t, r) => {
		let i = e.getBoundingClientRect(), a = e.width / n.dpr, o = e.height / n.dpr;
		return {
			x: (t - i.left) / i.width * a,
			y: (r - i.top) / i.height * o
		};
	}, m = (e, t) => {
		for (let n of s) {
			let { x: r, y: i, w: a, h: o } = n.rect;
			if (e < r || e > r + a || t < i || t > i + o) continue;
			let s = ni(n), c = s.y - 12, l = s.y + s.h + 8;
			return (Number.isFinite(n.media.duration) ? n.media.duration : 0) > 0 && e >= s.x && e <= s.x + s.w && t >= c && t <= l ? {
				kind: "seek",
				state: n,
				fraction: Math.max(0, Math.min(1, (e - s.x) / s.w))
			} : {
				kind: "toggle",
				state: n
			};
		}
		return null;
	}, h = null, g = (e, t) => {
		let n = Number.isFinite(e.media.duration) ? e.media.duration : 0;
		n <= 0 || (e.media.currentTime = n * t);
	}, _ = (t) => {
		let { x: n, y: r } = p(t.clientX, t.clientY), i = m(n, r);
		i && (i.kind === "seek" ? (h = {
			state: i.state,
			wasPlaying: !i.state.media.paused
		}, i.state.media.pause(), g(i.state, i.fraction), e.setPointerCapture(t.pointerId), t.preventDefault()) : i.state.media.paused ? i.state.media.play().catch(() => void 0) : i.state.media.pause());
	}, v = (e) => {
		let { x: t, y: n } = p(e.clientX, e.clientY);
		u = null;
		for (let e of s) {
			let { x: r, y: i, w: a, h: o } = e.rect;
			if (t >= r && t <= r + a && n >= i && n <= i + o) {
				u = e;
				break;
			}
		}
		if (h) {
			let e = ni(h.state), n = Math.max(0, Math.min(1, (t - e.x) / e.w));
			g(h.state, n);
		}
	}, y = () => {
		u = null;
	}, b = (t) => {
		if (!h) return;
		let { wasPlaying: n, state: r } = h;
		h = null, e.releasePointerCapture(t.pointerId), n && r.media.play().catch(() => void 0);
	};
	return s.length > 0 && (e.addEventListener("pointerdown", _), e.addEventListener("pointermove", v), e.addEventListener("pointerleave", y), e.addEventListener("pointerup", b), e.addEventListener("pointercancel", b), e.style.cursor = "pointer", f()), {
		play(e) {
			for (let t of s) (!e || t.el.mediaPath === e) && t.media.play().catch(() => void 0);
		},
		pause(e) {
			for (let t of s) (!e || t.el.mediaPath === e) && t.media.pause();
		},
		destroy() {
			if (!l) {
				l = !0, c !== null && cancelAnimationFrame(c), e.removeEventListener("pointerdown", _), e.removeEventListener("pointermove", v), e.removeEventListener("pointerleave", y), e.removeEventListener("pointerup", b), e.removeEventListener("pointercancel", b), e.style.cursor = "";
				for (let e of s) e.media.pause(), e.media.removeAttribute("src"), e.media.load(), URL.revokeObjectURL(e.objectUrl);
			}
		}
	};
}
var Gr = 28, Kr = 14, qr = 72, Jr = 10, Yr = 3;
function Xr(e, t, n) {
	let r = Number.isFinite(n.duration) ? n.duration : 0, i = r > 0 ? Math.min(1, n.currentTime / r) : 0, a = t.posterRect;
	bn(e, a.x + a.w / 2, a.y + a.h / 2, a.w, a.h, n.paused ? "paused" : "playing"), t.el.mediaKind === "audio" ? Qr(e, t, n, r, i) : Zr(e, t, n, r, i);
}
function Zr(e, t, n, r, i) {
	let { x: a, y: o, w: s, h: c } = t.rect, l = Math.max(28, Math.min(56, c * .22)), u = o + c - l;
	e.save();
	let d = e.createLinearGradient(0, u, 0, o + c);
	d.addColorStop(0, "rgba(0, 0, 0, 0)"), d.addColorStop(1, "rgba(0, 0, 0, 0.55)"), e.fillStyle = d, e.fillRect(a, u, s, l), e.restore();
	let f = ni(t);
	ei(e, f, i, r > 0), e.save(), e.font = "500 11px system-ui, -apple-system, sans-serif", e.textBaseline = "middle", e.shadowColor = "rgba(0, 0, 0, 0.75)", e.shadowBlur = 3, e.fillStyle = "rgba(255, 255, 255, 0.95)", $r(e, n.currentTime, r, f.x, f.y - 10, "bottom"), e.restore();
}
function Qr(e, t, n, r, i) {
	let a = ti(t.rect);
	e.save(), ri(e, a.x, a.y, a.w, a.h, a.h / 2), e.fillStyle = "rgba(20, 20, 20, 0.72)", e.fill(), e.font = "500 11px system-ui, -apple-system, sans-serif", e.textBaseline = "middle", e.fillStyle = "rgba(255, 255, 255, 0.95)", $r(e, n.currentTime, r, a.x + Kr, a.y + a.h / 2, "middle"), e.restore(), ei(e, ni(t), i, r > 0);
}
function $r(e, t, n, r, i, a) {
	let o = ii(t), s = ii(n), c = Br(e), l = Vr(e, o, c), u = Vr(e, s, c), d = e.measureText(" / ").width, f = Math.max(l, u);
	Hr(e, o, r + f - l, i, c);
	let p = e.textAlign;
	e.textAlign = "left", e.fillText(" / ", r + f, i), e.textAlign = p, Hr(e, s, r + f + d, i, c);
}
function ei(e, t, n, r) {
	let i = t.h / 2;
	if (e.save(), ri(e, t.x, t.y, t.w, t.h, i), e.fillStyle = "rgba(255, 255, 255, 0.35)", e.fill(), n > 0 && (ri(e, t.x, t.y, t.w * n, t.h, i), e.fillStyle = "#fff", e.fill()), r) {
		let r = Math.max(t.x + 5, Math.min(t.x + t.w - 5, t.x + t.w * n));
		e.shadowColor = "rgba(0, 0, 0, 0.3)", e.shadowBlur = 3, e.fillStyle = "#fff", e.beginPath(), e.arc(r, t.y + t.h / 2, 5, 0, Math.PI * 2), e.fill();
	}
	e.restore();
}
function ti(e) {
	let t = Math.max(220, e.w - 24);
	return {
		x: e.x + e.w / 2 - t / 2,
		y: e.y + e.h - Gr - 4,
		w: t,
		h: Gr
	};
}
function ni(e) {
	if (e.el.mediaKind === "audio") {
		let t = ti(e.rect), n = t.x + Kr + qr + Jr, r = Math.max(40, t.x + t.w - Kr - n);
		return {
			x: n,
			y: t.y + (t.h - Yr) / 2,
			w: r,
			h: Yr
		};
	}
	let t = e.rect, n = Math.max(12, t.w * .025), r = Math.max(12, Math.min(18, t.h * .05));
	return {
		x: t.x + n,
		y: t.y + t.h - Yr - r,
		w: t.w - n * 2,
		h: Yr
	};
}
function ri(e, t, n, r, i, a) {
	let o = Math.min(a, i / 2, r / 2);
	e.beginPath(), e.moveTo(t + o, n), e.lineTo(t + r - o, n), e.quadraticCurveTo(t + r, n, t + r, n + o), e.lineTo(t + r, n + i - o), e.quadraticCurveTo(t + r, n + i, t + r - o, n + i), e.lineTo(t + o, n + i), e.quadraticCurveTo(t, n + i, t, n + i - o), e.lineTo(t, n + o), e.quadraticCurveTo(t, n, t + o, n), e.closePath();
}
function ii(e) {
	if (!Number.isFinite(e) || e < 0) return "0:00";
	let t = Math.floor(e);
	return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
}
//#endregion
//#region packages/pptx/src/notes.ts
function ai(e, t) {
	return !Number.isInteger(t) || t < 0 || t >= e.length ? null : e[t].notes ?? null;
}
//#endregion
//#region packages/pptx/src/hidden.ts
function oi(e, t) {
	return !Number.isInteger(t) || t < 0 || t >= e.length ? !1 : e[t].hidden ?? !1;
}
//#endregion
//#region packages/pptx/src/slide-nav.ts
function si(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		r !== void 0 && r !== "" && !t.has(r) && t.set(r, n);
	}
	return t;
}
function ci(e, t) {
	if (e === "") return;
	let n = pn("ppt/slides", e);
	return t.get(n);
}
function li(e, t, n) {
	let r = mn(e);
	return r === null ? ci(e, t) : hn(r, n, t.size);
}
//#endregion
//#region packages/pptx/src/google-fonts.ts
var ui = {
	...E,
	...j
};
function* di(e) {
	for (let t of e?.paragraphs ?? []) for (let e of t.runs) e.type === "text" && (yield e.text);
}
function* fi(e) {
	for (let t of e.slides) for (let e of t.elements) if (e.type === "shape") yield* di(e.textBody);
	else if (e.type === "table") for (let t of e.rows) for (let e of t.cells) yield* di(e.textBody);
	else if (e.type === "chart") {
		e.chart.title && (yield e.chart.title);
		for (let t of e.chart.categories) yield t;
		for (let t of e.chart.series) t.name && (yield t.name);
	}
}
function pi(e) {
	let t = ne(e.majorFont) ?? ne(e.minorFont) ?? null;
	return [
		e.majorFont,
		e.minorFont,
		...F(fi(e), t)
	];
}
//#endregion
//#region packages/pptx/src/media-mime.ts
function mi(e, t) {
	for (let n of e.slides) for (let e of n.elements) {
		if (e.type !== "media") continue;
		let n = e;
		if (n.mediaPath === t) return n.mimeType;
		if (n.posterPath === t) return n.posterMimeType;
	}
	return "";
}
//#endregion
//#region packages/pptx/src/worker.ts?worker&inline
var hi = "function e(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var t=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function n(e){let t=globalThis.WebAssembly?.RuntimeError;if(t&&e instanceof t||e instanceof RangeError)return!0;if(e instanceof Error){let t=e.name;if(t===`RuntimeError`||t===`CompileError`||t===`LinkError`)return!0}return!1}var r=class{_init;_opts;_wasmInput=null;_initPromise=null;_poisoned=!1;_archive=null;constructor(e,t={}){this._init=e,this._opts=t}setWasmUrl(e){this._wasmInput=e,this._poisoned=!1,this._initPromise=this._init(e)}get archive(){return this._archive}setArchive(e){this._freeArchive(),this._archive=e}disposeArchive(){this._freeArchive()}_freeArchive(){this._archive!=null&&this._opts.freeArchive&&this._opts.freeArchive(this._archive),this._archive=null}get poisoned(){return this._poisoned}async ensureReady(){if(this._poisoned){if(this._wasmInput===null)throw Error(`WasmParserHost: setWasmUrl was never called`);let e=(this._opts.reinit??this._init)(this._wasmInput);this._initPromise=e,await e,this._poisoned=!1;return}if(this._initPromise===null)throw Error(`WasmParserHost: setWasmUrl was never called`);await this._initPromise}run(e){try{return e()}catch(e){throw n(e)?(this._poison(),new t(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`)):e}}poison(){this._poison()}_poison(){if(this._poisoned=!0,this._initPromise=null,this._archive!=null&&this._opts.freeArchive)try{this._opts.freeArchive(this._archive)}catch{}this._archive=null}},i=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,o.unregister(this),e}free(){let e=this.__destroy_into_raw();S.__wbg_pptxarchive_free(e,0)}extract_image(e){let t=h(e,S.__wbindgen_malloc,S.__wbindgen_realloc),n=x,r=S.pptxarchive_extract_image(this.__wbg_ptr,t,n);if(r[3])throw g(r[2]);var i=s(r[0],r[1]).slice();return S.__wbindgen_free(r[0],r[1]*1,1),i}extract_media(e){let t=h(e,S.__wbindgen_malloc,S.__wbindgen_realloc),n=x,r=S.pptxarchive_extract_media(this.__wbg_ptr,t,n);if(r[3])throw g(r[2]);var i=s(r[0],r[1]).slice();return S.__wbindgen_free(r[0],r[1]*1,1),i}constructor(e,t){let n=m(e,S.__wbindgen_malloc),r=x,i=S.pptxarchive_new(n,r,!p(t),p(t)?BigInt(0):t);if(i[2])throw g(i[1]);return this.__wbg_ptr=i[0]>>>0,o.register(this,this.__wbg_ptr,this),this}parse(){let e=S.pptxarchive_parse(this.__wbg_ptr);if(e[3])throw g(e[2]);var t=s(e[0],e[1]).slice();return S.__wbindgen_free(e[0],e[1]*1,1),t}to_markdown(){let e,t;try{let i=S.pptxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,g(i[2]);return e=n,t=r,u(n,r)}finally{S.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(i.prototype[Symbol.dispose]=i.prototype.free);function a(){return{__proto__:null,\"./pptx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(u(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(u(e,t))}finally{S.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=h(n,S.__wbindgen_malloc,S.__wbindgen_realloc),i=x;l().setInt32(e+4,i,!0),l().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return u(e,t)},__wbindgen_init_externref_table:function(){let e=S.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const o=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>S.__wbg_pptxarchive_free(e>>>0,1));function s(e,t){return e>>>=0,f().subarray(e/1,e/1+t)}let c=null;function l(){return(c===null||c.buffer.detached===!0||c.buffer.detached===void 0&&c.buffer!==S.memory.buffer)&&(c=new DataView(S.memory.buffer)),c}function u(e,t){return e>>>=0,y(e,t)}let d=null;function f(){return(d===null||d.byteLength===0)&&(d=new Uint8Array(S.memory.buffer)),d}function p(e){return e==null}function m(e,t){let n=t(e.length*1,1)>>>0;return f().set(e,n/1),x=e.length,n}function h(e,t,n){if(n===void 0){let n=b.encode(e),r=t(n.length,1)>>>0;return f().subarray(r,r+n.length).set(n),x=n.length,r}let r=e.length,i=t(r,1)>>>0,a=f(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=f().subarray(i+o,i+r),a=b.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return x=o,i}function g(e){let t=S.__wbindgen_externrefs.get(e);return S.__externref_table_dealloc(e),t}let _=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});_.decode();let v=0;function y(e,t){return v+=t,v>=2146435072&&(_=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),_.decode(),v=t),_.decode(f().subarray(e,e+t))}const b=new TextEncoder;`encodeInto`in b||(b.encodeInto=function(e,t){let n=b.encode(e);return t.set(n),{read:e.length,written:n.length}});let x=0,S;function C(e,t){return S=e.exports,c=null,d=null,S.__wbindgen_start(),S}async function w(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function T(e){if(S!==void 0)return S;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let t=a();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:n,module:r}=await w(await e,t);return C(n,r)}async function E(e){return S=void 0,c=null,d=null,T(e)}const D=new r(T,{freeArchive:e=>e.free(),reinit:E});self.onmessage=async t=>{let n=t.data;if(n.kind===`init`){D.setWasmUrl(e(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await D.ensureReady(),n.kind===`parse`){let e=typeof n.maxZipEntryBytes==`number`&&n.maxZipEntryBytes>0?BigInt(n.maxZipEntryBytes):void 0,t=new Uint8Array(n.buffer),a=D.run(()=>{let n=new i(t,e);return D.setArchive(n),n.parse()}).buffer,o={kind:`parsed`,id:r,presentationJson:a};self.postMessage(o,[a]);return}let e=D.archive;if(n.kind===`extractMedia`){if(!e)throw Error(`No pptx loaded`);let t=D.run(()=>e.extract_media(n.path).buffer),i={kind:`mediaExtracted`,id:r,bytes:t};self.postMessage(i,[t]);return}if(n.kind===`extractImage`){if(!e)throw Error(`No pptx loaded`);let t=D.run(()=>e.extract_image(n.path).buffer),i={kind:`imageExtracted`,id:r,bytes:t};self.postMessage(i,[t]);return}if(n.kind===`toMarkdown`){if(!e)throw Error(`No pptx loaded`);let t={kind:`markdownRendered`,id:r,markdown:D.run(()=>e.to_markdown())};self.postMessage(t);return}}catch(e){let t={kind:`error`,id:r,message:e instanceof Error?e.message:String(e)};self.postMessage(t)}};", gi = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", hi], { type: "text/javascript;charset=utf-8" });
function _i(e) {
	let t;
	try {
		if (t = gi && (self.URL || self.webkitURL).createObjectURL(gi), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(hi), {
			type: "module",
			name: e?.name
		});
	}
}
//#endregion
//#region packages/pptx/src/wasm/pptx_parser_bg.wasm?url
var vi = new URL("pptx_parser_bg.wasm", import.meta.url).href, yi = class e {
	_worker;
	_bridge;
	_mode = "main";
	_presentation = null;
	_meta = null;
	_slidePartIndex = null;
	_mediaCache = /* @__PURE__ */ new Map();
	_imageCache = /* @__PURE__ */ new Map();
	_googleFontFaces = [];
	_fetchImage = (e, t) => this.getImage(e, t);
	_math;
	constructor(e, t, n) {
		this._worker = e, this._mode = t, this._bridge = new y(this._worker, {
			correlate: (e) => e.id,
			toError: (e) => e.kind === "error" ? e.message : void 0
		});
		let r = new URL(n ?? vi, location.href).href;
		this._bridge.post({
			kind: "init",
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
		i = b(await ue(i, n.password));
		let a = new e(r === "worker" ? (await import("./render-worker-host-B_mY9aaj.js")).createRenderWorker() : new _i(), r, n.wasmUrl);
		return n.math && r === "worker" && console.warn("[ooxml] the math engine is unavailable in mode: 'worker'; equations will be skipped. Use mode: 'main' for documents with equations."), a._math = r === "worker" ? void 0 : n.math, await a._parse(i, n.maxZipEntryBytes, r === "worker" ? !!n.useGoogleFonts : !1, n.workerTimeoutMs), r === "main" && n.useGoogleFonts && a._presentation && (a._googleFontFaces = await fe(pi(a._presentation), ui)), a;
	}
	async _parse(e, t, n = !1, r) {
		let i = await this._bridge.request((r) => this._mode === "worker" ? {
			kind: "parse",
			id: r,
			buffer: e,
			maxZipEntryBytes: t,
			useGoogleFonts: n
		} : {
			kind: "parse",
			id: r,
			buffer: e,
			maxZipEntryBytes: t
		}, [e], { timeoutMs: r });
		if (this._mode === "worker") this._meta = i.meta;
		else {
			let { presentationJson: e } = i;
			this._presentation = JSON.parse(new TextDecoder().decode(new Uint8Array(e)));
		}
	}
	get slideCount() {
		return this._presentation?.slides.length ?? this._meta?.slideCount ?? 0;
	}
	get slideWidth() {
		return this._presentation?.slideWidth ?? this._meta?.slideWidth ?? 0;
	}
	get slideHeight() {
		return this._presentation?.slideHeight ?? this._meta?.slideHeight ?? 0;
	}
	get mode() {
		return this._mode;
	}
	getNotes(e) {
		return this._meta ? Number.isInteger(e) ? this._meta.notes[e] ?? null : null : ai(this._presentation?.slides ?? [], e);
	}
	isHidden(e) {
		return this._meta ? Number.isInteger(e) ? this._meta.hidden[e] ?? !1 : !1 : oi(this._presentation?.slides ?? [], e);
	}
	_partNames() {
		return this._meta ? this._meta.partNames : (this._presentation?.slides ?? []).map((e) => e.partName);
	}
	_partIndex() {
		return this._slidePartIndex ||= si(this._partNames()), this._slidePartIndex;
	}
	getSlideIndexByPartName(e) {
		return this._partIndex().get(e);
	}
	resolveInternalTarget(e, t = 0) {
		return li(e, this._partIndex(), t);
	}
	async renderSlide(e, t, n = {}) {
		if (this._mode === "worker") throw Error("renderSlide(canvas) is unavailable in mode: 'worker'; use renderSlideToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this._presentation) throw Error("Presentation not loaded");
		let r = this._presentation.slides[t];
		if (!r) throw Error(`Slide index ${t} out of range (count: ${this.slideCount})`);
		let i = n.dpr ?? h(), a = n.width ?? ((z(e) ? e.offsetWidth : 0) || 960);
		await Rr(e, r, this._presentation.slideWidth, this._presentation.slideHeight, {
			width: a,
			dpr: i,
			defaultTextColor: this._presentation.defaultTextColor,
			majorFont: this._presentation.majorFont,
			minorFont: this._presentation.minorFont,
			hlinkColor: this._presentation.hlinkColor ?? null,
			fetchMedia: (e) => this.getMedia(e),
			fetchImage: this._fetchImage,
			skipMediaControls: n.skipMediaControls,
			dim: n.dim,
			math: this._math
		}, n.onTextRun);
	}
	async renderSlideToBitmap(e, t = {}) {
		let n = t.width ?? 960, r = t.dpr ?? h();
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.slideCount) throw Error(`Slide index ${e} out of range (count: ${this.slideCount})`);
			let i = await this._bridge.request((i) => ({
				kind: "renderSlide",
				id: i,
				slideIndex: e,
				width: n,
				dpr: r,
				skipMediaControls: t.skipMediaControls,
				dim: t.dim
			}));
			if (t.onTextRun) for (let e of i.runs) t.onTextRun(e);
			return i.bitmap;
		}
		let i = new OffscreenCanvas(1, 1);
		return await this.renderSlide(i, e, {
			width: n,
			dpr: r,
			skipMediaControls: t.skipMediaControls,
			dim: t.dim,
			onTextRun: t.onTextRun
		}), i.transferToImageBitmap();
	}
	async collectSlideRuns(e, t = 960) {
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.slideCount) throw Error(`Slide index ${e} out of range (count: ${this.slideCount})`);
			return (await this._bridge.request((n) => ({
				kind: "collectRuns",
				id: n,
				slideIndex: e,
				width: t
			}))).runs;
		}
		let n = [], r = new OffscreenCanvas(1, 1);
		return await this.renderSlide(r, e, {
			width: t,
			onTextRun: (e) => n.push(e)
		}), n;
	}
	async getMedia(e) {
		let t = this._mediaCache.get(e);
		if (t) return t;
		let n = this._findMimeTypeForPath(e), r = (async () => {
			let t = (await this._bridge.request((t) => ({
				kind: "extractMedia",
				id: t,
				path: e
			}))).bytes;
			return new Blob([t], { type: n });
		})();
		return this._mediaCache.set(e, r), r;
	}
	_findMimeTypeForPath(e) {
		return this._presentation ? mi(this._presentation, e) : "";
	}
	async getImage(e, t) {
		let n = this._imageCache.get(e);
		if (n) return n;
		let r = (async () => {
			let n = (await this._bridge.request((t) => ({
				kind: "extractImage",
				id: t,
				path: e
			}))).bytes;
			return new Blob([n], { type: t });
		})();
		return this._imageCache.set(e, r), r;
	}
	async toMarkdown() {
		return (await this._bridge.request((e) => ({
			kind: "toMarkdown",
			id: e
		}))).markdown;
	}
	async presentSlide(e, t, n = {}) {
		if (this._mode === "main" && !this._presentation) throw Error("Presentation not loaded");
		if (!Number.isInteger(t) || t < 0 || t >= this.slideCount) throw Error(`Slide index ${t} out of range (count: ${this.slideCount})`);
		let r = n.dpr ?? h(), i = n.width ?? (e.offsetWidth || 960), a = this._mode === "worker" ? async () => {
			let a = await this.renderSlideToBitmap(t, {
				width: i,
				dpr: r,
				skipMediaControls: !0,
				dim: n.dim,
				onTextRun: n.onTextRun
			});
			e.width = a.width, e.height = a.height, e.style.width = `${Math.round(a.width / r)}px`, e.style.display || (e.style.display = "block");
			let o = e.getContext("2d");
			if (!o) throw Error("2D context not available");
			o.drawImage(a, 0, 0), a.close();
		} : () => this.renderSlide(e, t, {
			width: i,
			dpr: r,
			skipMediaControls: !0,
			dim: n.dim,
			onTextRun: n.onTextRun
		});
		return Wr(e, this._mode === "worker" ? this._meta?.mediaElements[t] ?? [] : this._presentation.slides[t].elements.filter((e) => e.type === "media"), {
			width: i,
			dpr: r,
			slideWidthEmu: this.slideWidth,
			fetchMedia: (e) => this.getMedia(e),
			fetchImage: this._fetchImage,
			drawBase: a
		});
	}
	destroy() {
		this._bridge.terminate(), this._presentation = null, this._meta = null, this._slidePartIndex = null, this._mediaCache.clear(), this._imageCache.clear(), this._googleFontFaces.length > 0 && (O(this._googleFontFaces), this._googleFontFaces = []), Ce(this._fetchImage), Ke(this._fetchImage), pe(this._fetchImage);
	}
}, bi = {
	color: "#ffffff",
	opacity: .6
}, xi = class {
	canvas;
	wrapper;
	_scale = null;
	_originalParent;
	_originalNextSibling;
	_originalDisplay;
	textLayer = null;
	highlightLayer = null;
	_find;
	_measureCtx = null;
	engine = null;
	opts;
	currentSlide = 0;
	_hiddenMode;
	handle = null;
	_mode;
	_bitmapCtx = null;
	_destroyed = !1;
	_loadGen = 0;
	constructor(e, t = {}) {
		this.opts = t, this.canvas = e, this._mode = t.mode ?? "main", this._hiddenMode = t.hiddenSlideMode ?? "show";
		let n = e.parentElement;
		this._originalParent = n, this._originalNextSibling = e.nextSibling, this._originalDisplay = e.style.display, this.wrapper = document.createElement("div"), this.wrapper.style.cssText = "position:relative;display:inline-block;vertical-align:top;", e.style.display || (e.style.display = "block"), n && n.insertBefore(this.wrapper, e), this.wrapper.appendChild(e), this._mode === "worker" && !t.enableMediaPlayback && (this._bitmapCtx = e.getContext("bitmaprenderer")), t.enableTextSelection && (this.textLayer = document.createElement("div"), this.textLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", this.wrapper.appendChild(this.textLayer)), this.highlightLayer = document.createElement("div"), this.highlightLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;", this.wrapper.appendChild(this.highlightLayer), this._find = new _n(() => this.slideCount, (e) => this._collectSlideRuns(e));
	}
	async load(e) {
		let t = ++this._loadGen, n = this.engine;
		try {
			let r = await yi.load(e, {
				useGoogleFonts: this.opts.useGoogleFonts,
				maxZipEntryBytes: this.opts.maxZipEntryBytes,
				workerTimeoutMs: this.opts.workerTimeoutMs,
				wasmUrl: this.opts.wasmUrl,
				math: this.opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			this.handle?.destroy(), this.handle = null, this.engine = r, n?.destroy(), this.currentSlide = this._initialSlide(), this._find.invalidate(), await this.renderCurrentSlide();
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this.opts.onError) {
				this.opts.onError(n);
				return;
			}
			throw n;
		}
	}
	async goToSlide(e) {
		!this.engine || this.slideCount === 0 || (this.currentSlide = Math.max(0, Math.min(e, this.slideCount - 1)), await this.renderCurrentSlide());
	}
	async nextSlide() {
		await this.goToSlide(this._step(1));
	}
	async prevSlide() {
		await this.goToSlide(this._step(-1));
	}
	_step(e) {
		return this._hiddenMode === "skip" && this.engine ? Ae(this.currentSlide, e, (e) => this.engine.isHidden(e), this.slideCount) : this.currentSlide + e;
	}
	_initialSlide() {
		return this._hiddenMode === "skip" && this.engine ? je(0, (e) => this.engine.isHidden(e), this.slideCount) : 0;
	}
	_dim() {
		return {
			color: this.opts.hiddenSlideDim?.color ?? bi.color,
			opacity: this.opts.hiddenSlideDim?.opacity ?? bi.opacity
		};
	}
	async setHiddenSlideMode(e) {
		this._hiddenMode = e, e === "skip" && this.engine && (this.currentSlide = je(this.currentSlide, (e) => this.engine.isHidden(e), this.slideCount)), await this.renderCurrentSlide();
	}
	get hiddenSlideMode() {
		return this._hiddenMode;
	}
	get visibleSlideCount() {
		if (!this.engine) return 0;
		let e = this.engine;
		return Me((t) => e.isHidden(t), this.slideCount);
	}
	get slideIndex() {
		return this.currentSlide;
	}
	get slideCount() {
		return this.engine?.slideCount ?? 0;
	}
	getNotes(e) {
		return this.engine?.getNotes(e) ?? null;
	}
	get canvasElement() {
		return this.canvas;
	}
	_naturalWidthPx() {
		let e = this.engine?.slideWidth ?? 0;
		return e > 0 ? e / q : 0;
	}
	_targetWidth() {
		if (this._scale === null) return this.opts.width ?? (this.canvas.offsetWidth || 960);
		let e = this._naturalWidthPx();
		return e <= 0 ? this.opts.width ?? (this.canvas.offsetWidth || 960) : Math.round(e * this._scale);
	}
	getScale() {
		if (this._scale !== null) return this._scale;
		let e = this._naturalWidthPx();
		return e <= 0 ? 1 : this._targetWidth() / e;
	}
	_zoomMin() {
		return this.opts.zoomMin ?? .1;
	}
	_zoomMax() {
		return this.opts.zoomMax ?? 4;
	}
	async setScale(e) {
		let t = se(e, this._zoomMin(), this._zoomMax()), n = t !== this.getScale();
		this._scale = t, await this.renderCurrentSlide(), n && this.opts.onScaleChange?.(t);
	}
	async zoomIn() {
		await this.setScale(M(this.getScale()));
	}
	async zoomOut() {
		await this.setScale(K(this.getScale()));
	}
	async fitWidth() {
		await this._fit("width");
	}
	async fitPage() {
		await this._fit("page");
	}
	async _fit(e) {
		if (!this.engine) return;
		let t = this.wrapper.parentElement;
		if (!t) return;
		let n = A({
			contentWidth: this.engine.slideWidth / q,
			contentHeight: this.engine.slideHeight / q,
			containerWidth: t.clientWidth,
			containerHeight: t.clientHeight
		}, e);
		n <= 0 || await this.setScale(n);
	}
	async renderCurrentSlide() {
		if (!this.engine) return;
		let e = this._hiddenMode === "dim" && this.engine.isHidden(this.currentSlide) ? this._dim() : void 0, t = this._targetWidth(), n = this.opts.dpr ?? (window.devicePixelRatio || 1), r = t / this.engine.slideWidth, i = Math.round(this.engine.slideHeight * r);
		this.canvas.style.width = `${t}px`, this.canvas.style.height = `${i}px`, this.handle?.destroy(), this.handle = null;
		let a = this._mode === "worker", o = [], s = (e) => o.push(e);
		try {
			if (this.opts.enableMediaPlayback) this.handle = await this.engine.presentSlide(this.canvas, this.currentSlide, {
				width: t,
				dpr: n,
				dim: e,
				onTextRun: s
			});
			else if (a) {
				let r = await this.engine.renderSlideToBitmap(this.currentSlide, {
					width: t,
					dpr: n,
					dim: e,
					onTextRun: s
				});
				this.canvas.width = r.width, this.canvas.height = r.height, this._bitmapCtx?.transferFromImageBitmap(r);
			} else await this.engine.renderSlide(this.canvas, this.currentSlide, {
				width: t,
				dpr: n,
				onTextRun: s,
				dim: e
			});
			this.opts.onSlideChange?.(this.currentSlide, this.slideCount);
		} catch (e) {
			this._reportRenderError(e);
		}
		this.textLayer && this._buildTextLayer(this.textLayer, o, t, i), this._find.setSlideRuns(this.currentSlide, o), this._buildHighlightLayer(o, t, i);
	}
	_buildHighlightLayer(e, t, n) {
		let r = this.highlightLayer;
		r && gn(r, e, this._find.slideHighlights(this.currentSlide), t, n, (e) => this._measureForFont(e));
	}
	_measureForFont(e) {
		this._measureCtx ||= document.createElement("canvas").getContext("2d");
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	async _collectSlideRuns(e) {
		return this.engine ? this.engine.collectSlideRuns(e, this._targetWidth()) : [];
	}
	async findText(e, t = {}) {
		if (!this.engine) return [];
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
		return e ? (e.location.slide === this.currentSlide ? this._redrawHighlights() : await this.goToSlide(e.location.slide), e) : (this._redrawHighlights(), null);
	}
	_redrawHighlights() {
		let e = this._find.slideRuns(this.currentSlide) ?? [], t = this._targetWidth(), n = this.engine ? Math.round(this.engine.slideHeight * (t / this.engine.slideWidth)) : 0;
		this._buildHighlightLayer(e, t, n);
	}
	_buildTextLayer(e, t, n, r) {
		Ne(e, t, n, r, (e) => this._onHyperlinkClick(e));
	}
	_onHyperlinkClick(e) {
		let t = this._resolveInternalSlideIndex(e);
		if (this.opts.onHyperlinkClick) {
			this.opts.onHyperlinkClick(t);
			return;
		}
		if (t.kind === "external") {
			B(t.url);
			return;
		}
		t.slideIndex !== void 0 && this.goToSlide(t.slideIndex);
	}
	_resolveInternalSlideIndex(e) {
		if (e.kind !== "internal" || e.slideIndex !== void 0) return e;
		let t = this.engine?.resolveInternalTarget(e.ref, this.currentSlide);
		return t === void 0 ? e : {
			...e,
			slideIndex: t
		};
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this.opts.onError ? this.opts.onError(t) : console.error("[ooxml] PptxViewer render failed:", t);
	}
	destroy() {
		if (this._destroyed = !0, this._loadGen++, this.handle?.destroy(), this.handle = null, this.engine?.destroy(), this._find.invalidate(), this._originalParent) {
			let e = this._originalNextSibling && this._originalNextSibling.parentNode === this._originalParent ? this._originalNextSibling : null;
			this._originalParent.insertBefore(this.canvas, e);
		} else this.canvas.parentNode && this.canvas.parentNode.removeChild(this.canvas);
		this.canvas.style.display = this._originalDisplay, this.wrapper.remove();
	}
}, Si = 150, Ci = "0 1px 3px rgba(0,0,0,0.2)", wi = class {
	_pres = null;
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
	_loadGen = 0;
	_slideInFlight = /* @__PURE__ */ new Set();
	_renderEpoch = 0;
	_settleTimer = null;
	_wheelListener = null;
	_pendingZoomAnchor = null;
	_resizeObserver = null;
	_prevBase = 0;
	_lastFitWidth = 0;
	_pageShadow;
	constructor(e, t = {}) {
		if (e.tagName === "CANVAS") throw Error("PptxScrollViewer takes a container element (e.g. a <div>), not a <canvas> — the viewer creates and manages its own canvases. Pass a block container; for the single-slide canvas API use PptxViewer.");
		if (this._container = e, this._opts = t, this._pageShadow = t.pageShadow ?? Ci, this._injected = !!t.presentation, this._injected) {
			let e = t.presentation;
			if (t.mode !== void 0 && t.mode !== e.mode) throw Error(`PptxScrollViewer: opts.mode='${t.mode}' conflicts with the injected engine's mode='${e.mode}'. Omit opts.mode when injecting an engine — the engine owns its render mode.`);
			this._pres = e, this._mode = e.mode;
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
		if (this._injected) throw Error("PptxScrollViewer.load() is unsupported when an engine is injected via opts.presentation; the injected engine is already loaded.");
		let t = ++this._loadGen, n = this._pres;
		try {
			let r = await yi.load(e, {
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
			if (this._pres = r, n?.destroy(), n) {
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
	get slideCount() {
		return this._pres?.slideCount ?? 0;
	}
	_slideWidthPx() {
		return this._pres.slideWidth / q * this._scale;
	}
	_slideHeightPx() {
		return this._pres.slideHeight / q * this._scale;
	}
	_fitWidthPx() {
		if (this._opts.width && this._opts.width > 0) return this._opts.width;
		let e = this._container.clientWidth || this._scrollHost.clientWidth;
		if (e <= 0) return 0;
		let { left: t, right: n } = this._padH(), r = e - t - n;
		return r > 0 ? r : 0;
	}
	_baseScale() {
		if (!this._pres || this._pres.slideCount === 0) return 0;
		let e = this._fitWidthPx(), t = this._pres.slideWidth / q;
		return e <= 0 || t <= 0 ? 0 : e / t;
	}
	relayout() {
		if (this._pres) {
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
		let e = this._pres.slideCount, t = this._slideHeightPx();
		this._heights = Array(e).fill(t);
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
	_slideIndexAtOffset(e, t) {
		let { offsets: n } = e, r = 0, i = n.length - 1, a = 0;
		for (; r <= i;) {
			let e = r + i >> 1;
			n[e] <= t ? (a = e, r = e + 1) : i = e - 1;
		}
		return a;
	}
	_range() {
		return Se(this._heights, this._gap(), this._scrollHost.scrollTop, this._scrollHost.clientHeight, this._overscan(), this._pad());
	}
	_syncSpacer() {
		let e = this._range();
		this._lastRange = e, this._spacer.style.height = `${e.totalHeight}px`, this._syncSpacerWidth();
	}
	_syncSpacerWidth() {
		let { left: e, right: t } = this._padH();
		this._spacer.style.width = `${this._slideWidthPx() + e + t}px`;
	}
	_onScroll() {
		!this._pres || !this._scaleEstablished || this._mountVisible();
	}
	_mountVisible() {
		if (!this._pres || this._pres.slideCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) if (this._slots.has(t)) this._positionSlot(this._slots.get(t), t, e);
		else {
			let n = this._acquireSlot();
			this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisibleSlideChange?.(e.topIndex, this._pres.slideCount));
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
			renderedSlide: -1,
			renderedScale: -1,
			bitmap: null,
			bitmapCtx: null
		};
	}
	_recycleSlot(e, t) {
		this._slots.delete(e), t.bitmap &&= (t.bitmap.close(), null), t.textLayer && (t.textLayer.innerHTML = "", t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = ""), t.renderedSlide = -1, t.renderedScale = -1, t.wrapper.remove(), this._free.push(t);
	}
	_positionSlot(e, t, n) {
		e.wrapper.style.top = `${n.offsets[t]}px`;
		let r = this._slideWidthPx();
		e.wrapper.style.width = `${r}px`, e.wrapper.style.height = `${this._slideHeightPx()}px`;
		let { left: i } = this._padH(), a = this._scrollHost.clientWidth;
		e.wrapper.style.left = `${Math.max(i, (a - r) / 2)}px`;
	}
	_dpr() {
		return this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1);
	}
	_renderSlot(e, t) {
		if (!this._pres || t.renderedSlide === e) return;
		t.renderedSlide = e;
		let n = this._dpr(), r = this._slideWidthPx(), i = this._renderEpoch, a = this._scale;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, a);
			return;
		}
		let o = [], s = !!this._opts.enableTextSelection && !!t.textLayer, c = s ? (e) => o.push(e) : void 0;
		this._pres.renderSlide(t.canvas, e, {
			width: r,
			dpr: n,
			onTextRun: c
		}).then(() => {
			i !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e || (t.renderedScale = a, s && t.textLayer && Ne(t.textLayer, o, Math.round(r), Math.round(this._slideHeightPx()), (e) => this._onHyperlinkClick(e)));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] PptxScrollViewer render failed:", t);
	}
	async _renderSlotBitmap(e, t, n, r, i) {
		if (this._slideInFlight.has(e) || this._slots.get(e) !== t) return;
		let a = this._renderEpoch;
		this._slideInFlight.add(e);
		let o = !1;
		t.bitmapCtx ||= t.canvas.getContext("bitmaprenderer");
		let s = !!this._opts.enableTextSelection && !!t.textLayer, c = [];
		try {
			let l = await this._pres.renderSlideToBitmap(e, {
				width: n,
				dpr: r,
				onTextRun: s ? (e) => c.push(e) : void 0
			});
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e) {
				l.close();
				return;
			}
			t.bitmap && t.bitmap.close(), t.bitmap = l, t.canvas.width = l.width, t.canvas.height = l.height, t.canvas.style.width = `${Math.round(l.width / r)}px`, t.canvas.style.height = `${Math.round(l.height / r)}px`, t.bitmapCtx?.transferFromImageBitmap(l), t.bitmap = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", s && Ne(t.textLayer, c, Math.round(n), Math.round(this._slideHeightPx()), (e) => this._onHyperlinkClick(e))), o = !0;
		} catch (e) {
			this._reportRenderError(e);
		} finally {
			this._slideInFlight.delete(e);
			let n = this._slots.get(e);
			!o && n && (n !== t || a !== this._renderEpoch) && !this._slideInFlight.has(e) && !this._destroyed && this._renderSlotBitmap(e, n, this._slideWidthPx(), this._dpr(), this._scale);
		}
	}
	setScale(e) {
		let t = this._opts.zoomMin ?? .1, n = this._opts.zoomMax ?? 4, r = Math.min(n, Math.max(t, e)), i = this._pendingZoomAnchor;
		if (this._pendingZoomAnchor = null, !this._pres || this._pres.slideCount === 0 || !this._scaleEstablished) {
			this._pendingScale = r;
			return;
		}
		if (r === this._scale) return;
		let a = this._scale, o = i ? i.y : 0, s = this._range(), c = this._scrollHost.scrollTop + o, l = this._slideIndexAtOffset(s, c), u = this._heights[l] || 0, d = u > 0 ? (c - s.offsets[l]) / u : 0;
		d = Math.min(1, Math.max(0, d));
		let f = this._padH().left, p = this._scrollHost.scrollLeft || 0;
		this._renderEpoch++, this._scale = r, this._recomputeHeights();
		let m = Se(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad());
		this._spacer.style.height = `${m.totalHeight}px`, this._syncSpacerWidth();
		let h = Math.max(0, m.totalHeight - this._scrollHost.clientHeight), g = (m.offsets[l] ?? 0) + d * (this._heights[l] || 0);
		if (this._scrollHost.scrollTop = Math.min(h, Math.max(0, g - o)), i) {
			let e = Math.max(0, (this._spacer.offsetWidth || 0) - this._scrollHost.clientWidth);
			this._scrollHost.scrollLeft = ee(p, i.x - f, a, r, { maxScroll: e });
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
		this.setScale(K(this.getScale()));
	}
	fitWidth() {
		this._fit("width");
	}
	fitPage() {
		this._fit("page");
	}
	_fit(e) {
		if (!this._pres || this._pres.slideCount === 0) return;
		let t = A({
			contentWidth: this._pres.slideWidth / q,
			contentHeight: this._pres.slideHeight / q,
			containerWidth: this._fitWidthPx(),
			containerHeight: this._scrollHost.clientHeight
		}, e);
		t <= 0 || this.setScale(t);
	}
	_previewVisible() {
		if (!this._pres || this._pres.slideCount === 0) return;
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
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisibleSlideChange?.(e.topIndex, this._pres.slideCount));
	}
	_previewSlot(e, t, n) {
		if (this._positionSlot(e, t, n), e.canvas.style.width = `${this._slideWidthPx()}px`, e.canvas.style.height = `${this._slideHeightPx()}px`, e.textLayer && e.renderedScale > 0) {
			let t = this._scale / e.renderedScale;
			e.textLayer.style.transformOrigin = "0 0", e.textLayer.style.transform = `scale(${t})`;
		}
	}
	_scheduleSettle() {
		this._settleTimer !== null && clearTimeout(this._settleTimer), this._settleTimer = setTimeout(() => {
			this._settleTimer = null, this._settleRender();
		}, Si);
	}
	_settleRender() {
		if (!(this._destroyed || !this._pres || this._pres.slideCount === 0)) for (let [e, t] of [...this._slots]) t.renderedScale !== this._scale && this._settleSlot(e, t);
	}
	_settleSlot(e, t) {
		if (!this._pres) return;
		let n = this._dpr(), r = this._slideWidthPx(), i = this._scale, a = this._renderEpoch;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, i);
			return;
		}
		let o = document.createElement("canvas");
		o.style.cssText = "display:block;background:#fff;", this._applyPageShadow(o);
		let s = [], c = !!this._opts.enableTextSelection && !!t.textLayer, l = c ? (e) => s.push(e) : void 0;
		this._pres.renderSlide(o, e, {
			width: r,
			dpr: n,
			onTextRun: l
		}).then(() => {
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e) return;
			let n = t.canvas;
			t.wrapper.insertBefore(o, n), n.remove(), t.canvas = o, t.bitmapCtx = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", c && Ne(t.textLayer, s, Math.round(r), Math.round(this._slideHeightPx()), (e) => this._onHyperlinkClick(e)));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	scrollToSlide(e, t) {
		if (!this._pres || this._pres.slideCount === 0 || !this._scaleEstablished) return;
		let n = Math.max(0, Math.min(e, this._pres.slideCount - 1)), r = Se(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad()), i = r.offsets[n] ?? 0, a = Math.max(0, r.totalHeight - this._scrollHost.clientHeight), o = Math.min(a, Math.max(0, i)), s = this._scrollHost;
		typeof s.scrollTo == "function" ? s.scrollTo({
			top: o,
			behavior: t?.behavior ?? "auto"
		}) : this._scrollHost.scrollTop = o, this._mountVisible();
	}
	_onHyperlinkClick(e) {
		let t = this._resolveInternalSlideIndex(e);
		if (this._opts.onHyperlinkClick) {
			this._opts.onHyperlinkClick(t);
			return;
		}
		if (t.kind === "external") {
			B(t.url);
			return;
		}
		t.slideIndex !== void 0 && this.scrollToSlide(t.slideIndex);
	}
	_resolveInternalSlideIndex(e) {
		if (e.kind !== "internal" || e.slideIndex !== void 0) return e;
		let t = this._pres?.resolveInternalTarget(e.ref, this._range().topIndex);
		return t === void 0 ? e : {
			...e,
			slideIndex: t
		};
	}
	_onResize() {
		if (!this._pres || this._pres.slideCount === 0) return;
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
	get topVisibleSlide() {
		return this._lastRange?.topIndex ?? 0;
	}
	mountedSlideIndicesForTest() {
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
		let t = this._range(), n = this._scrollHost.scrollTop + e, r = this._slideIndexAtOffset(t, n), i = this._heights[r] || 0;
		return {
			slide: r,
			frac: i > 0 ? Math.min(1, Math.max(0, (n - t.offsets[r]) / i)) : 0
		};
	}
	viewportYOfForTest(e, t) {
		return (this._range().offsets[e] ?? 0) + t * (this._heights[e] || 0) - this._scrollHost.scrollTop;
	}
	destroy() {
		this._destroyed = !0, this._loadGen++, this._scrollListener &&= (this._scrollHost.removeEventListener("scroll", this._scrollListener), null), this._wheelListener &&= (this._scrollHost.removeEventListener("wheel", this._wheelListener), null), this._resizeObserver?.disconnect(), this._resizeObserver = null, this._settleTimer !== null && (clearTimeout(this._settleTimer), this._settleTimer = null);
		for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
		this._free.length = 0, this._injected || this._pres?.destroy(), this._pres = null, this._wrapper.remove();
	}
}, Ti = /* @__PURE__ */ i({
	OoxmlError: () => o,
	PptxPresentation: () => yi,
	PptxScrollViewer: () => wi,
	PptxViewer: () => xi,
	autoResize: () => re,
	buildPptxHighlightLayer: () => gn,
	buildPptxTextLayer: () => Ne,
	openExternalHyperlink: () => B,
	renderSlide: () => Rr
});
//#endregion
export { Rr as a, yi as i, wi as n, gn as o, xi as r, Ne as s, Ti as t };
