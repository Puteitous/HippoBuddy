/**
 * MarkdownPreview - Markdown 文件预览(批次 A 对齐旧版 file-preview-md.js)
 *
 * 渲染策略:
 *   - renderMarkdown(content) 渲染为净化 HTML(marked12 + DOMPurify,防 XSS)
 *   - 渲染后遍历 <img> 重写本地相对路径 → /api/file/raw?path=...(resolveImageSrc)
 *   - TOC 侧边栏:注入 heading ID、构建 h1-h3 目录,点击跳转、滚动同步高亮、可折叠
 *
 * 由 FilePreview 委托调用,仅做预览(方案甲:md 直接渲染预览,不做编辑)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown, resolveImageSrc } from '@/utils/markdown';
import { translate } from '@/i18n';
import './MarkdownPreview.css';

interface MarkdownPreviewProps {
  /** 文件绝对路径(用于解析图片相对路径) */
  filePath: string;
  /** Markdown 原文 */
  content: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function MarkdownPreview({ filePath, content }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocCollapsed, setTocCollapsed] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 渲染后:重写本地图片 src + 注入 heading ID 构建 TOC
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    // 基准目录:MD 文件所在目录(绝对路径 + 尾分隔符),用于解析图片相对路径
    let baseDir: string | null = null;
    if (filePath) {
      const norm = filePath.replace(/\\/g, '/');
      const slashIdx = norm.lastIndexOf('/');
      baseDir = slashIdx >= 0 ? norm.slice(0, slashIdx + 1) : '';
    }
    contentEl.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.getAttribute('src');
      if (!rawSrc) return;
      const resolved = resolveImageSrc(rawSrc, baseDir ?? undefined);
      if (resolved !== rawSrc) img.setAttribute('src', resolved);
    });

    // 注入唯一 heading ID,构建 TOC
    const headings = contentEl.querySelectorAll('h1, h2, h3');
    const items: TocItem[] = [];
    const usedIds = new Set<string>();
    headings.forEach((h) => {
      const level = parseInt(h.tagName[1], 10); // 1, 2, 3
      const text = (h.textContent ?? '').trim();
      if (!text) return;
      let id = text
        .toLowerCase()
        .trim()
        .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (!id) id = 'heading';
      let uniqueId = id;
      let counter = 1;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}-${counter++}`;
      }
      usedIds.add(uniqueId);
      h.id = uniqueId;
      items.push({ id: uniqueId, text, level });
    });
    setTocItems(items);
    setActiveId(items.length > 0 ? items[0].id : null);
  }, [filePath, html]);

  // 滚动同步:监听内容区 scroll,通过 offsetTop 算出当前章节高亮 TOC
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || tocItems.length === 0) return;
    const headings = contentEl.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;

    let currentActiveId: string | null = null;
    let lastChangeTime = 0;
    const MIN_CHANGE_INTERVAL = 20; // 快速滚动时避免频繁切换
    let rafId: number | null = null;

    const updateActive = () => {
      const scrollTop = contentEl.scrollTop;
      const headroom = 30; // 顶部预留偏移,让 heading 刚离开顶部时仍算"当前"
      let active: HTMLElement | null = null;
      for (const h of Array.from(headings)) {
        const hEl = h as HTMLElement;
        if (hEl.offsetTop <= scrollTop + headroom) active = hEl;
        else break;
      }
      if (!active && headings.length > 0) active = headings[0] as HTMLElement;
      const newId = active ? active.id : null;
      if (!newId || newId === currentActiveId) return;
      const now = Date.now();
      if (currentActiveId !== null && now - lastChangeTime < MIN_CHANGE_INTERVAL) return;
      currentActiveId = newId;
      lastChangeTime = now;
      setActiveId(newId);
    };

    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActive();
      });
    };
    contentEl.addEventListener('scroll', onScroll, { passive: true });
    updateActive();

    return () => {
      contentEl.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [tocItems]);

  const scrollToHeading = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      setActiveId(id);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="file-md-preview">
      {tocItems.length > 0 && (
        <div className={`file-md-toc ${tocCollapsed ? 'collapsed' : ''}`}>
          <div className="file-md-toc-header">
            <span className="file-md-toc-title">{translate('preview.tocTitle')}</span>
            <button
              type="button"
              className="file-md-toc-toggle"
              title={tocCollapsed ? translate('preview.tocExpand') : translate('preview.tocCollapse')}
              onClick={() => setTocCollapsed((v) => !v)}
            >
              {tocCollapsed ? (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 3 11 8 6 13" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="10 3 5 8 10 13" />
                </svg>
              )}
            </button>
          </div>
          {tocItems.map((item) => (
            <a
              key={item.id}
              className={`file-md-toc-item level-${item.level} ${activeId === item.id ? 'active' : ''}`}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToHeading(item.id);
              }}
            >
              {item.text}
            </a>
          ))}
          {/* 折叠后的悬浮浮层面板(hover 弹出) */}
          <div className="file-md-toc-floating">
            <div className="file-md-toc-header">
              <span className="file-md-toc-title">{translate('preview.tocTitle')}</span>
            </div>
            {tocItems.map((item) => (
              <a
                key={item.id}
                className={`file-md-toc-item level-${item.level} ${activeId === item.id ? 'active' : ''}`}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToHeading(item.id);
                }}
              >
                {item.text}
              </a>
            ))}
          </div>
        </div>
      )}
      <div
        ref={contentRef}
        className="file-md-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
