import { escapeHtml } from './utils.js';

/** 反转义 HTML 实体（&amp; &lt; &gt; &quot; &#39; 等），用于清理 marked 对公式内容的转义 */
function unescapeHtml(text) {
  const el = document.createElement('div');
  el.innerHTML = text;
  return el.textContent || el.innerText || '';
}

let markedInstance = null;
let hljsInstance = null;

async function loadMarked() {
  if (!markedInstance) {
    const hasWindow = typeof window !== 'undefined';
    if (hasWindow && typeof window.marked !== 'undefined') {
      markedInstance = window.marked;
    } else {
      try {
        const module = await import('./vendor/marked.min.js');
        markedInstance = module.marked || module.default || module;
      } catch {
        markedInstance = null;
      }
    }
  }
  return markedInstance;
}

async function loadHighlight() {
  if (!hljsInstance) {
    const hasWindow = typeof window !== 'undefined';
    if (hasWindow && typeof window.hljs !== 'undefined') {
      hljsInstance = window.hljs;
    } else {
      try {
        const module = await import('./vendor/highlight.min.js');
        hljsInstance = module.hljs || module.default || module;
      } catch {
        hljsInstance = null;
      }
    }
  }
  return hljsInstance;
}

export async function initMarkdownRenderer(options = {}) {
  const marked = await loadMarked();
  const hljs = options.enableHighlight ? await loadHighlight() : null;

  const renderer = new marked.Renderer();

  if (hljs && options.enableHighlight !== false) {
    renderer.code = function(obj) {
      const code = (typeof obj === 'object' && obj !== null) ? obj.text : obj;
      const language = (typeof obj === 'object' && obj !== null) ? (obj.lang || '') : '';
      const lang = language || 'plaintext';
      
      let highlighted;
      try {
        if (hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(code).value;
        }
      } catch (e) {
        highlighted = escapeHtml(code);
      }
      highlighted = highlighted.replace(/\n\s*$/, '');

      const codeLines = code.replace(/\n+$/, '').split('\n');
      const lineCount = codeLines.length;
      let lineNumsText = '';
      for (let i = 1; i <= lineCount; i++) {
        lineNumsText += i + '\n';
      }
      lineNumsText = lineNumsText.replace(/\n$/, '');

      const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
      return `<div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang">${lang}</span>
          <button class="copy-btn" onclick="window.copyCode('${codeId}')">复制</button>
        </div>
        <div class="code-block-body">
          <div class="code-ln-nums"><pre>${lineNumsText}</pre></div>
          <pre><code id="${codeId}" class="hljs language-${lang}" data-raw-code="${encodeURIComponent(code)}">${highlighted}</code></pre>
        </div>
      </div>`;
    };
  }

  // 覆写 link renderer：外部链接添加 target="_blank" 和 data-external 标记
  renderer.link = function(obj) {
    const href = typeof obj === 'object' && obj !== null ? obj.href : obj;
    const text = typeof obj === 'object' && obj !== null ? obj.text : '';
    const isExternal = href && !href.startsWith('#') && !href.startsWith('/');
    const attrs = isExternal
      ? ` target="_blank" rel="noopener noreferrer" data-external="true"`
      : '';
    return `<a href="${escapeHtml(href)}"${attrs}>${text}</a>`;
  };

  marked.setOptions({
    renderer: renderer,
    breaks: options.breaks !== false,
    gfm: options.gfm !== false
  });

  return marked;
}

/**
 * 在 marked 解析前，将裸的 \ce{...} 和 \pu{...}（不在 $/$$ 数学模式内、不在代码块内）自动包上 $ 分隔符。
 * LLM 经常直接输出 \ce{H2O} 而不加 $，不加包裹 KaTeX 不会渲染。
 *
 * 用状态机扫描全程，准确判断 \ce{...} 是否已在 $$...$$ 或 $...$ 包裹中，
 * 避免对已处于数学模式的公式重复加 $（这是之前用简单前一个字符判断的 bug）。
 */
function wrapBareMhchem(text) {
  // 只保护围栏代码块（```...```），不保护行内反引号
  // 因为 LLM 常把 \ce{...} 放在行内反引号中当作"公式标记"，实际应渲染为数学公式
  const fencedBlocks = [];
  let blockIdx = 0;
  text = text.replace(/(```[\s\S]*?```)/g, (m) => {
    const key = `\x00CODE_${blockIdx++}\x00`;
    fencedBlocks.push({ key, orig: m });
    return key;
  });

  // 用状态机扫描全程，跟踪 $$/$ 数学模式的开关
  let result = '';
  let last = 0;
  /** @type {'normal'|'inline'|'display'} */
  let mathMode = 'normal';

  const re = /(\\ce\{|\\pu\{|\$\$|\$)/g;
  let m;
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
    if (mathMode !== 'normal') continue; // 已在数学模式内，跳过

    const start = at;
    // 跳过前面有 \ 转义的（\\ce{...} 应原样显示）
    if (start > 0 && text[start - 1] === '\\') continue;

    const cmdLen = token.length; // 4
    let depth = 1;
    let i = start + cmdLen;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }

    // 检查是否被行内反引号包裹（LLM 常输出 `\ce{...}`）
    const hasBacktickBefore = start > 0 && text[start - 1] === '`';
    const hasBacktickAfter = i < text.length && text[i] === '`';

    if (hasBacktickBefore && hasBacktickAfter) {
      // `\ce{...}` → $\ce{...}$，去掉反引号
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

let _cachedMarked = null;

export async function renderMarkdown(text) {
  if (!_cachedMarked) {
    _cachedMarked = await initMarkdownRenderer({ enableHighlight: true });
  }
  // 预处理：给裸 \ce{...} / \pu{...} 自动包 $，使 KaTeX 能渲染
  text = wrapBareMhchem(text);
  let html = _cachedMarked.parse(text);

  // 若 KaTeX 已加载，对 $...$ / $$...$$ 公式做后渲染
  // 注意：这里在 HTML 字符串层面用正则替换，而非 DOM 层面，
  // 因为 marked 的 breaks:true 会将 \n 转为 <br>，导致 auto-render
  // 的 DOM 文本节点扫描无法识别跨 <br> 的 $$...$$ 公式块。
  if (window.katex) {
    // 保护代码块和已渲染的 katex 区域，避免误伤
    const protectedBlocks = [];
    let idx = 0;
    html = html.replace(/(<pre[^>]*>[\s\S]*?<\/pre>)|(<code[^>]*>[\s\S]*?<\/code>)|(<div class="katex-block"[\s\S]*?<\/div>)|(<span class="katex[^"]*"[^>]*>[\s\S]*?<\/span>)/gi, (match) => {
      const key = `\x00KATEX_PROTECT_${idx++}\x00`;
      protectedBlocks.push({ key, match });
      return key;
    });

    // 行间公式 $$...$$（可跨行）
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      try {
        // 去掉 marked 因 breaks:true 插入的 <br>，并反转义 &amp; 等实体
        let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
        // marked 在 GFM 模式下会将 \\（LaTeX 换行）解释为转义反斜杠，输出单 \ 
        // 把 \ 后跟空白（原 \\\n 的产物）恢复为 \\，这样 KaTeX 才能识别换行
        clean = clean.replace(/\\(?=\s)/g, '\\\\');
        // marked 也会吞掉 \[ 和 \] 中的反斜杠，同样恢复
        clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
        const result = window.katex.renderToString(clean, { displayMode: true, throwOnError: false });
        const latex = expr.replace(/<br\s*\/?>/gi, '\n').trim();
        return `<div class="katex-block" data-latex="${encodeURIComponent(latex)}">${result}<button class="message-action-btn katex-copy-btn" title="复制 LaTeX 源码" onclick="window.copyLatex(this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
      } catch (e) {
        return `$$${expr}$$`;
      }
    });
    // 行内公式 $...$（不跨行，避免误伤 $$）
    html = html.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_, expr) => {
      try {
        let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
        clean = clean.replace(/\\(?=\s)/g, '\\\\');
        clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
        return window.katex.renderToString(clean, { displayMode: false, throwOnError: false });
      } catch (e) {
        return `$${expr}$`;
      }
    });
    // 行间公式 \[...\]（LLM 常用替代 $$ 的写法）
    html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) => {
      try {
        let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
        clean = clean.replace(/\\(?=\s)/g, '\\\\');
        clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
        const result = window.katex.renderToString(clean, { displayMode: true, throwOnError: false });
        const latex = expr.replace(/<br\s*\/?>/gi, '\n').trim();
        return `<div class="katex-block" data-latex="${encodeURIComponent(latex)}">${result}<button class="message-action-btn katex-copy-btn" title="复制 LaTeX 源码" onclick="window.copyLatex(this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
      } catch (e) {
        return `[${expr}]`;
      }
    });
    // 行内公式 \(...\)
    html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_, expr) => {
      try {
        let clean = unescapeHtml(expr.replace(/<br\s*\/?>/gi, ' ').trim());
        clean = clean.replace(/\\(?=\s)/g, '\\\\');
        clean = clean.replace(/\\([\[\]])/g, '\\\\$1');
        return window.katex.renderToString(clean, { displayMode: false, throwOnError: false });
      } catch (e) {
        return `(${expr})`;
      }
    });

    // 恢复受保护区域
    for (const { key, match } of protectedBlocks) {
      html = html.replace(key, match);
    }
  }

  return html;
}

export function copyCode(codeId) {
  const codeEl = document.getElementById(codeId);
  if (codeEl) {
    const rawCode = codeEl.dataset.rawCode
      ? decodeURIComponent(codeEl.dataset.rawCode)
      : codeEl.textContent;
    navigator.clipboard.writeText(rawCode).then(() => {
      const btn = codeEl.closest('.code-block-wrapper').querySelector('.copy-btn');
      btn.textContent = '已复制';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '复制';
        btn.classList.remove('copied');
      }, 2000);
    });
  }
}

window.copyCode = copyCode;
window.copyLatex = function(btn) {
  const block = btn.closest('.katex-block');
  if (!block) return;
  const latex = decodeURIComponent(block.dataset.latex || '');
  navigator.clipboard.writeText(latex).then(() => {
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      btn.classList.remove('copied');
    }, 2000);
  });
};
