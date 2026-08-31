/**
 * build-docx-preview.mjs — 使用 esbuild 将 docx-preview 打包为单个 ESM 文件
 *
 * docx-preview 的 dist 是 `import e from "jszip"` 裸模块说明符，浏览器原生
 * ESM 无法解析，因此用 esbuild 将 jszip 一并打包（照 build-codemirror.mjs 模式）。
 *
 * 输出到: frontend/public/js/vendor/docx-preview.js（自包含，可直接 import）
 *   (vite 构建时随 public 复制进 src/main/resources/static/js/vendor/docx-preview.js，
 *    为新版 React 前端自带的 /js/vendor/docx-preview.js 静态资源，不再依赖旧版 /static)
 *
 * 用法: node scripts/build-docx-preview.mjs
 */

import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

await esbuild.build({
  entryPoints: [path.join(root, 'src/main/resources/static/js/vendor/docx-preview-entry.js')],
  bundle: true,
  format: 'esm',
  outfile: path.join(root, 'frontend/public/js/vendor/docx-preview.js'),
  target: 'es2020',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
})

console.log('✅ docx-preview bundle 已生成')
