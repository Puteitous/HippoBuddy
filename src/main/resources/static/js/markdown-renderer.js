import { escapeHtml } from './utils.js';

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

  marked.setOptions({
    renderer: renderer,
    breaks: options.breaks !== false,
    gfm: options.gfm !== false
  });

  return marked;
}

export async function renderMarkdown(text) {
  const marked = await initMarkdownRenderer({ enableHighlight: true });
  return marked.parse(text);
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
