/**
 * DocxSilurusPreview — @silurus/ooxml DOCX 预览
 *
 * 使用 Silurus 引擎的 Canvas 逐页渲染 + 垂直滚动，替换 mammoth.js 的 HTML 转换。
 * DocxDocument 作为 headless 引擎，每页渲染到独立 Canvas。
 */

import { createDocxScrollViewer, math } from '../ooxml-bridge.js';
import { escapeHtml, updateStatusbarText } from './shared.js';

const ZOOM_STEP = 0.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/**
 * 使用 @silurus/ooxml 渲染 DOCX 预览
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件路径
 * @param {boolean} [forceRefresh] - 是否强制刷新
 * @param {Function} [onError] - 错误回调 (err) => void
 */
export async function renderDocxSilurus(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  try {
    container.innerHTML = `<div class="file-binary-preview loading">加载 DOCX 文件中（Silurus 引擎）...</div>`;

    container.innerHTML = '';
    container.style.position = 'relative';

    // 浮动缩放工具栏（复用 PPTX 样式）
    const toolbar = document.createElement('div');
    toolbar.className = 'pptx-toolbar';
    toolbar.innerHTML = `
      <button class="pptx-zoom-btn" data-action="zoom-out" title="缩小">−</button>
      <button class="pptx-zoom-btn" data-action="zoom-in" title="放大">+</button>
      <button class="pptx-zoom-btn pptx-zoom-reset" data-action="reset" title="适应宽度">⟲</button>
      <span class="pptx-zoom-level">100%</span>
    `;
    container.appendChild(toolbar);

    const zoomLevelEl = toolbar.querySelector('.pptx-zoom-level');

    const applyZoom = (direction) => {
      const cur = viewer.getScale();
      const next = direction > 0
        ? Math.min(MAX_SCALE, cur * (1 + ZOOM_STEP))
        : Math.max(MIN_SCALE, cur * (1 - ZOOM_STEP));
      viewer.setScale(next);
    };

    const sessionGen = container.dataset.sessionGen;

    const viewer = await createDocxScrollViewer(container, url, {
      math,
      zoomMin: MIN_SCALE,
      zoomMax: MAX_SCALE,
      enableZoom: false,
      onScaleChange: (scale) => {
        if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
      },
    });

    // 路径守卫：如果加载期间文件已切换或同文件被重新打开，丢弃此 viewer
    if (container.dataset.currentPath !== filePath || container.dataset.sessionGen !== sessionGen) {
      viewer.destroy();
      return;
    }

    // 工具栏事件
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'zoom-in') applyZoom(1);
      else if (btn.dataset.action === 'zoom-out') applyZoom(-1);
      else if (btn.dataset.action === 'reset') viewer.fitWidth();
    });

    // 自定义 Ctrl+滚轮缩放
    container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        applyZoom(e.deltaY > 0 ? -1 : 1);
      }
    }, { passive: false });

    updateStatusbarText(`DOCX (Silurus) · ${viewer.pageCount} 页`);
    container._silurusDoc = viewer;

    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        cleanupObserver.disconnect();
        try { viewer.destroy(); } catch {}
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });

  } catch (err) {
    console.error('BinaryPreview: Silurus docx parse failed', filePath, err);
    container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>DOCX 解析失败 (Silurus): ${escapeHtml(err.message)}</p>
    </div>`;
    if (onError) onError(err);
  }
}
