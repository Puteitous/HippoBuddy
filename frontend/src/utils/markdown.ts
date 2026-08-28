/**
 * Markdown 渲染工具
 *
 * 阶段 3.2 MVP:
 *  - 使用 marked v12 解析 Markdown 为 HTML
 *  - 使用 DOMPurify 净化 HTML,防止 XSS
 *  - 外部链接强制 target="_blank" + rel="noopener noreferrer"
 *  - 代码块使用 highlight.js 语法高亮(语言标签 + 复制按钮 + 行号,对齐旧版 cockpit)
 *  - KaTeX 数学公式渲染($$/$/\[\]/\(\) 四种语法 + 裸 \ce/\pu 化学式自动包裹,对齐旧版)
 *
 * 用法:
 *   import { renderMarkdown } from '@/utils/markdown';
 *   <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
 */
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// 加载 mhchem 扩展:注册 \ce/\pu 等化学式命令(对齐旧版 vendor/mhchem.min.js),否则 KaTeX 会把 \ce 当作未定义命令原样渲染
import 'katex/contrib/mhchem';
import { marked } from 'marked';
import { translate } from '@/i18n';
import { initMermaidPreview } from '@/utils/mermaid';

// 配置 marked:启用 GFM + breaks(单换行也换行)
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 未知语言自动识别时,超长代码不再触发 auto-detect,避免流式渲染卡顿
const HIGHLIGHT_AUTO_LIMIT = 5000;

// 自定义渲染器:外部链接新开标签页 + 代码块语法高亮
marked.use({
  renderer: {
    link(href, _title, text) {
      if (!href) return text || '';
      const isExternal = !href.startsWith('#') && !href.startsWith('/');
      const attrs = isExternal
        ? ' target="_blank" rel="noopener noreferrer" data-external="true"'
        : '';
      return `<a href="${escapeHtml(href)}"${attrs}>${text}</a>`;
    },
    code(code, infostring, _escaped) {
      return renderCodeBlock(code, infostring);
    },
  },
});

/**
 * 将围栏代码块渲染为带语法高亮的结构(语言标签 + 复制按钮 + 行号列)。
 * 结构对齐旧版 cockpit 的 .code-block-wrapper / .code-block-header / .code-block-body。
 * 复制按钮交互由本模块底部的全局事件委托实现(DOMPurify 会剥离内联 onclick)。
 */
function renderCodeBlock(code: string, infostring: string | undefined): string {
  const lang = (infostring || '').trim();
  const label = lang || 'text';

  // 语法高亮:已知语言用指定语法;未知且不过长时自动识别;否则纯文本转义
  let highlighted: string;
  try {
    if (hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(code, { language: lang }).value;
    } else if (code.length <= HIGHLIGHT_AUTO_LIMIT) {
      highlighted = hljs.highlightAuto(code).value;
    } else {
      highlighted = escapeHtml(code);
    }
  } catch {
    highlighted = escapeHtml(code);
  }
  // 去掉尾部空行带来的多余空行
  highlighted = highlighted.replace(/\n\s*$/, '');

  // 行号列(去掉末尾空行,与旧版行为一致)
  const lineCount = code.replace(/\n+$/, '').split('\n').length;
  const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  const langClass = lang ? ` language-${escapeHtml(lang)}` : '';

  // Mermaid 代码块附加「预览」按钮(对齐旧版 markdown-renderer.js):
  // 点击由全局事件委托接管,动态加载 mermaid 并渲染图表,避免首屏加载重依赖。
  const mermaidBtn =
    lang === 'mermaid'
      ? `<button type="button" class="mermaid-preview-btn" data-mermaid-preview>${translate('mermaid.preview')}</button>`
      : '';

  return (
    '<div class="code-block">' +
    '<div class="code-block-header">' +
    `<span class="code-lang">${escapeHtml(label)}</span>` +
    '<div class="code-header-actions">' +
    '<button type="button" class="code-copy-btn">' +
    translate('chatui.copy') +
    '</button>' +
    mermaidBtn +
    '</div>' +
    '</div>' +
    '<div class="code-block-body">' +
    `<div class="code-ln-nums"><pre>${lineNums}</pre></div>` +
    `<pre><code class="hljs${langClass}">${highlighted}</code></pre>` +
    '</div>' +
    '</div>'
  );
}

/** HTML 实体转义(用于 href 属性值) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 将 Markdown 中的图片引用解析为可加载的绝对 URL(平移旧版 file-preview-md.js)。
 *
 * 规则:
 *   - http(s)://、data:、blob: 等协议 URL 原样返回(不做本地文件映射)
 *   - 绝对路径(/foo.png)或相对路径(./img/a.png / img/a.png)基于当前 MD 文件
 *     所在目录解析为绝对路径,再映射到 /api/file/raw?path=... 后端接口
 *   - 路径含 ?hash 片段时剥离(本地文件路径不含 URL 语法,否则 encodeURIComponent
 *     会把 ? 编码进 path 参数导致后端找不到文件)
 *
 * @param src 原始图片 src
 * @param baseDir 当前 MD 文件所在目录(绝对路径,含尾部分隔符);缺省时不做本地映射
 * @returns 可加载的图片 URL
 */
export function resolveImageSrc(src: string, baseDir?: string): string {
  if (!src) return src;
  // 协议 URL(网络图 / data: / blob: / file: 等)直接返回
  if (/^(https?:|data:|blob:|file:)/i.test(src)) return src;
  // 纯锚点 / 空引用
  if (src.startsWith('#')) return src;
  // 无法确定基准目录时保持原样
  if (!baseDir) return src;

  // 剥离 query / hash:本地文件路径不含 URL 语法
  const clean = src.split(/[?#]/)[0];
  if (!clean) return src;

  // 拼接绝对路径(兼容 Windows 反斜杠与 URL 正斜杠)
  const normSrc = clean.replace(/\\/g, '/');
  let abs: string;
  if (normSrc.startsWith('/')) {
    abs = baseDir + normSrc.replace(/^\/+/, '');
  } else {
    // 相对路径:基于 baseDir 解析(含 ./ 与 ../ 归一化)。
    // 归一化会把 baseDir 开头的空段一并跳过,导致丢失前导 '/';
    // 后端 RawFileHandler 要求绝对路径(Paths.get 相对 CWD 解析可能 404),
    // 故归一化后按 baseDir 是否以 '/' 开头补回前导(Windows 盘符开头则不补)。
    abs = baseDir + normSrc;
    const leading = abs.startsWith('/') ? '/' : '';
    const parts: string[] = [];
    for (const seg of abs.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    abs = leading + parts.join('/');
  }

  return '/api/file/raw?path=' + encodeURIComponent(abs);
}

/**
 * 在 marked 解析前,将裸的 \ce{...} 和 \pu{...}(不在 $/$$ 数学模式内、不在代码块内)
 * 自动包上 $ 分隔符。LLM 经常直接输出 \ce{H2O} 而不加 $,不加包裹 KaTeX 不会渲染。
 *
 * 用状态机扫描全程,准确判断 \ce{...} 是否已在 $$...$$ 或 $...$ 包裹中,
 * 避免对已处于数学模式的公式重复加 $(平移旧版 markdown-renderer.js 的 wrapBareMhchem)。
 */
function wrapBareMhchem(text: string): string {
  // 只保护围栏代码块(```...```),不保护行内反引号
  // 因为 LLM 常把 \ce{...} 放在行内反引号中当作"公式标记",实际应渲染为数学公式
  const fencedBlocks: { key: string; orig: string }[] = [];
  let blockIdx = 0;
  text = text.replace(/(```[\s\S]*?```)/g, (m) => {
    const key = `\x00CODE_${blockIdx++}\x00`;
    fencedBlocks.push({ key, orig: m });
    return key;
  });

  // 用状态机扫描全程,跟踪 $$/$ 数学模式的开关
  let result = '';
  let last = 0;
  let mathMode: 'normal' | 'inline' | 'display' = 'normal';

  const re = /(\\ce\{|\\pu\{|\$\$|\$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    const at = m.index;

    if (token === '$$') {
      mathMode = mathMode === 'display' ? 'normal' : 'display';
      continue;
    }
    if (token === '$') {
      mathMode = mathMode === 'inline' ? 'normal' : 'inline';
      continue;
    }

    // 匹配到 \ce{ 或 \pu{
    if (mathMode !== 'normal') continue; // 已在数学模式内,跳过

    const start = at;
    // 跳过前面有 \ 转义的(\\ce{...} 应原样显示)
    if (start > 0 && text[start - 1] === '\\') continue;

    const cmdLen = token.length; // 4
    let depth = 1;
    let i = start + cmdLen;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }

    // 检查是否被行内反引号包裹(LLM 常输出 `\ce{...}`)
    const hasBacktickBefore = start > 0 && text[start - 1] === '`';
    const hasBacktickAfter = i < text.length && text[i] === '`';

    if (hasBacktickBefore && hasBacktickAfter) {
      // `\ce{...}` → $\ce{...}$,去掉反引号
      result += text.slice(last, start - 1);
      result += '$' + text.slice(start, i) + '$';
      last = i + 1;
    } else {
      result += text.slice(last, start);
      result += '$' + text.slice(start, i) + '$';
      last = i;
    }
    re.lastIndex = last; // 从替换后的位置继续扫描
  }
  result += text.slice(last);

  // 恢复围栏代码块
  for (const { key, orig } of fencedBlocks) {
    result = result.replace(key, orig);
  }
  return result;
}

/** 反转义 HTML 实体(marked 对公式内容转义产生的常见实体) */
function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** 公式复制按钮图标(对齐旧版 .katex-copy-btn 的 copy svg) */
const KATEX_COPY_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/**
 * 对 marked 产出的 HTML 做 KaTeX 后渲染(平移旧版 markdown-renderer.js):
 *  - 先保护 <pre>/<code> 与已渲染的 katex 区域,避免误伤
 *  - 依次处理 $$...$$(行间)、$...$(行内)、\[...\](行间)、\(...\)(行内)
 *  - 公式块带「复制 LaTeX」按钮(类名 katex-copy-btn,由全局事件委托接管)
 */
function renderMath(html: string): string {
  const protectedBlocks: { key: string; match: string }[] = [];
  let idx = 0;
  html = html.replace(
    /(<pre[^>]*>[\s\S]*?<\/pre>)|(<code[^>]*>[\s\S]*?<\/code>)|(<div class="katex-block"[\s\S]*?<\/div>)|(<span class="katex[^"]*"[^>]*>[\s\S]*?<\/span>)/gi,
    (match) => {
      const key = `\x00KATEX_PROTECT_${idx++}\x00`;
      protectedBlocks.push({ key, match });
      return key;
    },
  );

  const copyBtn = `<button type="button" class="message-action-btn katex-copy-btn" title="${translate('chatui.copyLatex')}" aria-label="${translate('chatui.copyLatex')}">${KATEX_COPY_SVG}</button>`;

  // 行间公式 $$...$$(可跨行)
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
    try {
      // 去掉 marked 因 breaks:true 插入的 <br>,并反转义 &amp; 等实体
      let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
      // marked 在 GFM 模式下会将 \\(LaTeX 换行)解释为转义反斜杠,输出单 \
      // 把 \ 后跟空白(原 \\\n 的产物)恢复为 \\,这样 KaTeX 才能识别换行
      clean = clean.replace(/\\(?=\s)/g, '\\\\');
      // marked 也会吞掉 \[ 和 \] 中的反斜杠,同样恢复
      clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
      const result = katex.renderToString(clean, { displayMode: true, throwOnError: false });
      const latex = expr.replace(/<br\s*\/?>/gi, '\n').trim();
      return `<div class="katex-block" data-latex="${encodeURIComponent(latex)}">${result}${copyBtn}</div>`;
    } catch {
      return `$$${expr}$$`;
    }
  });
  // 行内公式 $...$(不跨行,避免误伤 $$)
  html = html.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_, expr) => {
    try {
      let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
      clean = clean.replace(/\\(?=\s)/g, '\\\\');
      clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
      return katex.renderToString(clean, { displayMode: false, throwOnError: false });
    } catch {
      return `$${expr}$`;
    }
  });
  // 行间公式 \[...\](LLM 常用替代 $$ 的写法)
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) => {
    try {
      let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
      clean = clean.replace(/\\(?=\s)/g, '\\\\');
      clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
      const result = katex.renderToString(clean, { displayMode: true, throwOnError: false });
      const latex = expr.replace(/<br\s*\/?>/gi, '\n').trim();
      return `<div class="katex-block" data-latex="${encodeURIComponent(latex)}">${result}${copyBtn}</div>`;
    } catch {
      return `[${expr}]`;
    }
  });
  // 行内公式 \(...\)
  html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_, expr) => {
    try {
      let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
      clean = clean.replace(/\\(?=\s)/g, '\\\\');
      clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
      return katex.renderToString(clean, { displayMode: false, throwOnError: false });
    } catch {
      return `(${expr})`;
    }
  });

  // 恢复受保护区域
  for (const { key, match } of protectedBlocks) {
    html = html.replace(key, match);
  }
  return html;
}

/* ============================================================
   渲染产物按钮交互(全局事件委托)
   DOMPurify 会剥离内联 onclick,故在 document 上注册一次委托,
   同时覆盖聊天(.msg-markdown)与文件预览(.file-md-preview)的渲染产物。
   ============================================================ */

/** 复制文本到剪贴板(失败静默,对齐旧版 .catch(() => {})) */
function copyText(text: string): void {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** 代码块复制:取同块 <code> 的 textContent(行号在独立的 .code-ln-nums 列,不受影响) */
function copyCodeBlock(btn: HTMLButtonElement): void {
  const codeEl = btn.closest('.code-block')?.querySelector<HTMLElement>('pre code');
  const text = codeEl?.textContent ?? '';
  if (!text) return;
  copyText(text);
  btn.textContent = translate('chatui.copied');
  btn.classList.add('copied');
  window.setTimeout(() => {
    btn.textContent = translate('chatui.copy');
    btn.classList.remove('copied');
  }, 2000);
}

/** 公式复制:取 katex-block 的 data-latex 原始 LaTeX */
function copyLatexBlock(btn: HTMLButtonElement): void {
  const block = btn.closest<HTMLElement>('.katex-block');
  const latex = block?.dataset.latex ? decodeURIComponent(block.dataset.latex) : '';
  if (!latex) return;
  copyText(latex);
  btn.classList.add('copied');
  window.setTimeout(() => btn.classList.remove('copied'), 2000);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const codeBtn = target.closest<HTMLButtonElement>('.code-copy-btn');
    if (codeBtn) {
      copyCodeBlock(codeBtn);
      return;
    }
    const katexBtn = target.closest<HTMLButtonElement>('.katex-copy-btn');
    if (katexBtn) {
      copyLatexBlock(katexBtn);
      return;
    }
    // Mermaid 预览按钮:懒加载渲染图表(独立于聊天/预览的渲染产物)
    const mermaidBtn = target.closest<HTMLButtonElement>('.mermaid-preview-btn');
    if (mermaidBtn) {
      initMermaidPreview(mermaidBtn);
    }
  });
}

/**
 * 将 Markdown 字符串渲染为安全的 HTML 字符串。
 *
 * 流程:裸 \ce/\pu 预处理 → marked 解析 → KaTeX 后渲染 → DOMPurify 净化。
 * 允许 target/rel(外部链接)、style(KaTeX 内联排版,DOMPurify 会清洗其 CSS 值)。
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  // 预处理:给裸 \ce{...}/\pu{...} 自动包 $,使 KaTeX 能渲染
  text = wrapBareMhchem(text);
  const rawHtml = marked.parse(text, { async: false }) as string;
  // KaTeX 后渲染(在净化前做;KaTeX 输出由库生成且对输入转义,可信)
  const htmlWithMath = renderMath(rawHtml);
  return DOMPurify.sanitize(htmlWithMath, {
    // style:KaTeX 依赖内联样式排版;DOMPurify 会对其 CSS 值做清洗,剥离 url()/expression 等风险
    ADD_ATTR: ['target', 'rel', 'data-external', 'style'],
  });
}
