/**
 * build-ooxml.mjs — 将 @silurus/ooxml 的 dist 文件复制到 vendor 目录
 *
 * Silurus 的发布包（.mjs + .js + .wasm）使用 import.meta.url 解析 WASM 路径，
 * 所以只需要原样复制到静态资源目录即可，无需 esbuild 额外打包。
 *
 * 输出到: src/main/resources/static/js/vendor/ooxml/
 *
 * 用法: node scripts/build-ooxml.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SRC = path.join(root, 'node_modules/@silurus/ooxml/dist')
const DST = path.join(root, 'src/main/resources/static/js/vendor/ooxml')

// 确保目标目录存在
fs.mkdirSync(DST, { recursive: true })

// 复制所有文件（.mjs / .js / .wasm / .d.ts）
let count = 0
for (const file of fs.readdirSync(SRC)) {
  const srcFile = path.join(SRC, file)
  const dstFile = path.join(DST, file)
  if (fs.statSync(srcFile).isFile()) {
    fs.cpSync(srcFile, dstFile, { force: true })
    count++
    console.log(`  ✓ ${file}`)
  }
}

// 也复制 types 目录
const typesSrc = path.join(SRC, 'types')
const typesDst = path.join(DST, 'types')
if (fs.existsSync(typesSrc)) {
  fs.cpSync(typesSrc, typesDst, { recursive: true, force: true })
  console.log(`  ✓ types/ (directory)`)
}

console.log(`\n✅ @silurus/ooxml 已复制到 js/vendor/ooxml/ (${count} 个文件)`)
