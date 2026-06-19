        import fs from 'fs';
const files = [
  'src/main/resources/static/js/components/tool-renderers/edit-file.js',
  'src/main/resources/static/js/components/tool-renderers/write-file.js',
  'src/main/resources/static/js/components/tool-renderers/bash.js',
  'src/main/resources/static/js/components/tool-renderers/delete-file.js',
  'src/main/resources/static/js/components/tool-renderers/index.js',
  'src/main/resources/static/js/components/ChatPanel.js',
];
let ok = true;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const m = c.match(/`/g);
  const n = m ? m.length : 0;
  const bal = n % 2 === 0;
  console.log((bal ? 'OK' : 'XX') + ' ' + f + ' (' + n + ' backticks)');
  if (!bal) ok = false;
}
console.log(ok ? '\nAll passed' : '\nSome files have issues');
fs.unlinkSync('_check_bticks.mjs');
