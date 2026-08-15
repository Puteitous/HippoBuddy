/**
 * docx-preview 打包入口 — 由 build-docx-preview.mjs 打包为 js/vendor/docx-preview.js
 *
 * 只导出 DocxDomPreview 需要的 API（renderAsync），esbuild 会把 jszip
 * 依赖一并打进去，产出浏览器可直接 import 的自包含 ESM 文件。
 */
export { renderAsync } from 'docx-preview'
