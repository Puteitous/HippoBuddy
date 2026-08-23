/**
 * Diff 语法高亮工具(纯函数,可单测)
 *
 * 平移旧版 static/js/components/FileDiffView.js 的语法高亮逻辑:
 * 将整块 diff 文本交给 highlight.js 高亮,再按 \n 切分为逐行 HTML,
 * 保持跨行 token(如多行注释/模板字符串)的标签闭合平衡,保证中间行颜色不中断。
 * 词级 diff 优先于语法高亮,本节仅在词级缺失时启用。
 */
import hljs from 'highlight.js';

/** 扩展名 → highlight.js 语言名(对齐旧版 FileDiffView EXT_LANG_MAP) */
const EXT_LANG_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', cs: 'csharp',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  php: 'php', swift: 'swift',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', md: 'markdown', markdown: 'markdown',
};

/** 大文件保护:超过该长度跳过高亮,避免阻塞 UI(对齐旧版 500KB) */
const DIFF_HIGHLIGHT_MAX_LEN = 500 * 1024;

/**
 * 将 hljs 高亮后的整块 HTML 按 \n 切分为多行,每行保持标签闭合平衡。
 * 跨行 token(如多行注释/模板字符串)在行尾补 </span>、行首重开同 class 的 span,
 * 保证中间行颜色不中断,且每行 HTML 都是合法的。
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  let current = '';
  const stack: string[] = [];
  let i = 0;
  const OPEN_TAG = '<span class="';
  const CLOSE_TAG = '</span>';

  while (i < html.length) {
    const ch = html[i];
    if (ch === '\n') {
      let close = '';
      for (let j = stack.length - 1; j >= 0; j--) close += CLOSE_TAG;
      lines.push(current + close);
      let reopen = '';
      for (const cls of stack) reopen += `${OPEN_TAG}${cls}">`;
      current = reopen;
      i++;
      continue;
    }
    if (ch === '<' && html.startsWith(OPEN_TAG, i)) {
      const end = html.indexOf('">', i + OPEN_TAG.length);
      if (end !== -1) {
        const cls = html.slice(i + OPEN_TAG.length, end);
        stack.push(cls);
        current += html.slice(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    if (ch === '<' && html.startsWith(CLOSE_TAG, i)) {
      stack.pop();
      current += CLOSE_TAG;
      i += CLOSE_TAG.length;
      continue;
    }
    current += ch;
    i++;
  }
  let close = '';
  for (let j = stack.length - 1; j >= 0; j--) close += CLOSE_TAG;
  lines.push(current + close);
  return lines;
}

/** 根据文件路径扩展名推断 hljs 语言名;无法推断返回 null */
export function detectHljsLanguage(filePath: string): string | null {
  if (!filePath) return null;
  const clean = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  const dotIdx = clean.lastIndexOf('.');
  const ext = dotIdx >= 0 ? clean.slice(dotIdx + 1).toLowerCase() : clean.toLowerCase();
  return EXT_LANG_MAP[ext] || null;
}

/**
 * 对整块 diff 文本做语法高亮并逐行切分。
 *
 * @param changes 原始逐行 diff(与后端返回顺序一致),取其 content 拼成整块文本
 * @param filePath 当前文件路径,用于按扩展名推断语言
 * @returns 与 changes 等长的行 HTML 数组;hljs 不可用 / 出错 / 超限时返回 null(调用方回退纯文本)
 */
export function highlightDiffLines(
  changes: Array<{ type: 'same' | 'removed' | 'added'; content: string }>,
  filePath: string,
): string[] | null {
  if (!changes || changes.length === 0) return null;

  const fullText = changes.map((c) => c.content || '').join('\n');
  // 大文件保护:超过阈值跳过高亮,避免阻塞 UI
  if (fullText.length > DIFF_HIGHLIGHT_MAX_LEN) return null;

  let highlighted: string;
  try {
    const lang = detectHljsLanguage(filePath);
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(fullText, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(fullText).value;
    }
  } catch {
    return null;
  }

  const lines = splitHighlightedLines(highlighted);
  // hljs 输出末尾保留换行时可能多出空行,截断到 changes 长度
  return lines.slice(0, changes.length);
}
