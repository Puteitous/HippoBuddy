/**
 * Markdown 渲染工具
 *
 * 阶段 3.2 MVP:
 *  - 使用 marked v12 解析 Markdown 为 HTML
 *  - 使用 DOMPurify 净化 HTML,防止 XSS
 *  - 外部链接强制 target="_blank" + rel="noopener noreferrer"
 *  - 暂不引入 highlight.js 语法高亮、行号、Mermaid、KaTeX(留待 3.4 增强)
 *
 * 用法:
 *   import { renderMarkdown } from '@/utils/markdown';
 *   <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// 配置 marked:启用 GFM + breaks(单换行也换行)
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 自定义渲染器:外部链接新开标签页
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
  },
});

/** HTML 实体转义(用于 href 属性值) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 将 Markdown 字符串渲染为安全的 HTML 字符串。
 *
 * 内部先用 marked 解析,再用 DOMPurify 净化。允许 target/rel 属性
 * (用于链接新开标签页),其余按 DOMPurify 默认策略。
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  const rawHtml = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target', 'rel', 'data-external'],
  });
}
