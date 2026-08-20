/**
 * 前端 i18n 迁移检查脚本
 *
 * 统计 frontend/src 下仍残留的硬编码中文字符串（JSX / 字符串字面量），
 * 帮助追踪渐进迁移进度。对齐 scripts/check-i18n.cjs（官网）的风格。
 *
 * 用法: node scripts/check-frontend-i18n.cjs [--list]
 *  默认只输出未迁移文件计数;加 --list 逐个列出残留行。
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'frontend/src');

const listFiles = process.argv.includes('--list');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// 匹配字符串字面量/JSX 文本中含中文的行（排除注释、说明文档与纯注释行）
const cnRe = /(["'`])[^"'\n`]*[\u4e00-\u9fa5][^"'\n`]*\1|>[^\n{<]*[\u4e00-\u9fa5][^\n{<]*</g;

const dirtyFiles = [];
let total = 0;
for (const file of walk(srcDir)) {
  const rel = path.relative(root, file);
  if (rel.includes('\\i18n\\')) continue; // 字典文件本身即中文，跳过
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
    if (cnRe.test(line)) hits.push(`${i + 1}: ${trimmed}`);
  });
  if (hits.length) {
    total += hits.length;
    dirtyFiles.push({ rel, hits });
  }
}

if (!dirtyFiles.length) {
  console.log('OK: 前端 i18n 迁移完成，未发现残留中文。');
  return;
}

console.log(`未迁移: ${dirtyFiles.length} 个文件,共 ${total} 处残留中文。`);
if (listFiles) {
  for (const f of dirtyFiles) {
    console.log(`\n${f.rel}`);
    f.hits.slice(0, 30).forEach((h) => console.log('  ' + h));
    if (f.hits.length > 30) console.log(`  ...(共 ${f.hits.length} 处)`);
  }
}