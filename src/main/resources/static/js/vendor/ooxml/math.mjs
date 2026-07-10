import { n as e } from "./mathjax-BRfWlbSJ.js";
//#region packages/core/assets/mathjax-stix2.js?url
var t = new URL("mathjax-stix2.js", import.meta.url).href, n = null;
function r() {
	return new URL(t, import.meta.url).href;
}
function i(e) {
	return new Promise((t, n) => {
		let r = document.createElement("script");
		r.src = e, r.async = !0, r.onload = () => t(), r.onerror = () => n(/* @__PURE__ */ Error(`Failed to load math engine from ${e}`)), document.head.appendChild(r);
	});
}
function a() {
	return n || (n = (async () => {
		let e = globalThis.__ooxmlStix2;
		if (e) return e;
		if (typeof document > "u") throw Error("Math rendering requires a DOM (browser environment)");
		await i(r());
		let t = globalThis.__ooxmlStix2;
		if (!t) throw Error("Math engine failed to initialize");
		return t;
	})(), n);
}
async function o() {
	await a();
}
async function s(t) {
	let n = (await a()).mathml2svg(t);
	return {
		svg: n,
		...e(n)
	};
}
//#endregion
//#region src/math.ts
var c = {
	loadMathJax: o,
	mathMLToSvg: s
};
//#endregion
export { c as math };
