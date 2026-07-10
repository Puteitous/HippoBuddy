import { w as e } from "./find-cursor-DgyGlCIw.js";
//#region packages/core/src/text/bidi/segments.ts
function t(t, n) {
	return t === !0 ? "rtl" : t === !1 ? "ltr" : e().computeLevels(n, "auto").paragraphLevel === 1 ? "rtl" : "ltr";
}
//#endregion
export { t };
