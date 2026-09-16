/**
 * docx-preview 打包入口 — 由 build-docx-preview.mjs 打包为 frontend/public/js/vendor/docx-preview.js
 *
 * 只导出 DocxDomPreview 需要的 API（renderAsync），esbuild 会把 jszip
 * 依赖一并打进去，产出浏览器可直接 import 的自包含 ESM 文件。
 *
 * 说明:此源文件此前因误删代码编辑器 vendor 资源而被移除(commit b990797),
 * 现恢复至 frontend/vendor/ 并随 git 跟踪(不能放 static/,vite 构建会清空该目录)。
 */
export { renderAsync } from 'docx-preview'