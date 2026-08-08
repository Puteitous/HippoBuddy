const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const code = require(path.join(root, 'website/i18n/en/code.json'));
const keys = new Set(Object.keys(code));

const files = [
  path.join(root, 'website/src/pages/index.tsx'),
  path.join(root, 'website/src/components/HomepageFeatures/index.tsx'),
  path.join(root, 'website/src/components/HomepageMetrics/index.tsx'),
];

const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // 1) <Translate>字面量</Translate>（排除 {var} 动态形式）
  const re1 = /<Translate>([^<{][^<]*)<\/Translate>/g;
  let m;
  while ((m = re1.exec(src))) {
    const key = m[1].trim();
    if (key && !keys.has(key)) missing.push(f + ' -> <Translate> ' + key);
  }
  // 2) translate({message: 'xxx'})
  const re2 = /translate\(\{message: '([^']+)'\}\)/g;
  while ((m = re2.exec(src))) {
    const key = m[1];
    if (!keys.has(key)) missing.push(f + ' -> translate() ' + key);
  }
  // 3) 变量传入的 key（titleKey/descKey/labelKey/subKey/unitKey: '值'）
  const re3 = /(?:titleKey|descKey|labelKey|subKey|unitKey):\s*'([^']+)'/g;
  while ((m = re3.exec(src))) {
    const key = m[1];
    if (!keys.has(key)) missing.push(f + ' -> ' + m[0].split(':')[0] + ' ' + key);
  }
}

if (missing.length) {
  console.log('MISSING TRANSLATIONS:');
  missing.forEach(x => console.log('  ' + x));
  process.exit(1);
} else {
  console.log('OK: all translation keys referenced in src are present in code.json (' + keys.size + ' entries)');
}
