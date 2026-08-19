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
    // 相对路径:基于 baseDir 解析(含 ./ 与 ../ 归一化)
    abs = baseDir + normSrc;
    const parts: string[] = [];
    for (const seg of abs.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    abs = parts.join('/');
  }

  return '/api/file/raw?path=' + encodeURIComponent(abs);
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
