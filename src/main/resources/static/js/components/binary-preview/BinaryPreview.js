/**
 * BinaryPreview — 二进制文件预览组件（主路由）
 *
 * 职责：检测文件类型，将渲染委托给对应的子模块。
 *
 * 子模块（按格式拆分）：
 *   - SpreadsheetPreview.js   — SheetJS 表格/CSV
 *   - XlsxSilurusPreview.js   — Silurus XLSX
 *   - DocxPreview.js          — mammoth.js DOCX
 *   - DocxSilurusPreview.js   — Silurus DOCX
 *   - PptxPreview.js          — PptxViewJS PPTX
 *   - PptxSilurusPreview.js   — Silurus PPTX
 *
 * 内联方法（与实例状态紧密相关）：
 *   - showImageOrPdf() / _initImageZoom() — 图片/PDF 预览 + 缩放交互
 *   - showWebPreview()                      — HTML Web 预览
 *   - _showHttpError()                     — 统一错误 UI
 */

import {
  isImageFile, isPdfFile, isSpreadsheetFile,
  isDocxFile, isPptxFile, isBinaryFile,
  isHtmlFile, isCsvFile, escapeHtml,
} from './shared.js';
import { renderSpreadsheet } from './SpreadsheetPreview.js';
import { renderXlsxSilurus } from './XlsxSilurusPreview.js';
import { renderDocx } from './DocxPreview.js';
import { renderDocxDom } from './DocxDomPreview.js';
import { renderDocxSilurus } from './DocxSilurusPreview.js';
import { renderPptx } from './PptxPreview.js';
import { renderPptxSilurus } from './PptxSilurusPreview.js';

// 重新导出检测函数，保持与旧文件的接口兼容
export {
  isImageFile, isPdfFile, isSpreadsheetFile,
  isDocxFile, isPptxFile, isBinaryFile,
  isHtmlFile, isCsvFile,
};

export class BinaryPreview {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 渲染目标容器
   * @param {Function} [options.onError] - 错误回调 (err) => void
   */
  constructor({ container, onError }) {
    this._container = container;
    this._onError = onError || (() => {});
  }

  // ==================== 图片 / PDF 预览 ====================

  /**
   * 渲染图片或 PDF 预览
   * @param {string} filePath
   * @param {'image'|'pdf'} type
   */
  showImageOrPdf(filePath, type) {
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;
    const fileName = filePath.split('/').pop() || filePath;

    if (type === 'image') {
      this._container.style.position = 'relative';
      this._container.innerHTML = `
        <div class="file-binary-preview image">
          <div class="img-zoom-toolbar">
            <button class="img-zoom-btn" data-action="zoom-out" title="缩小">−</button>
            <button class="img-zoom-btn" data-action="zoom-in" title="放大">+</button>
            <button class="img-zoom-btn img-zoom-reset" data-action="reset" title="重置缩放">⟲</button>
          </div>
          <div class="img-zoom-viewport">
            <img src="${url}" alt="${escapeHtml(fileName)}" class="img-zoomable"
                 onerror="this.closest('.img-zoom-viewport').outerHTML='<div class=\\'file-preview-placeholder\\'><svg viewBox=\\'0 0 24 24\\' width=\\'32\\' height=\\'32\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/><line x1=\\'12\\' y1=\\'8\\' x2=\\'12\\' y2=\\'12\\'/><line x1=\\'12\\' y1=\\'16\\' x2=\\'12.01\\' y2=\\'16\\'/></svg><p>图片加载失败</p></div>'" />
          </div>
        </div>`;
      this._initImageZoom();
    } else {
      this._container.innerHTML = `
        <div class="file-binary-preview pdf">
          <iframe src="${url}" title="${escapeHtml(fileName)}"></iframe>
        </div>`;
    }
  }

  /** 初始化图片缩放交互 */
  _initImageZoom() {
    const viewport = this._container.querySelector('.img-zoom-viewport');
    const img = viewport.querySelector('.img-zoomable');
    if (!img || !viewport) return;

    if (viewport._imgResizeObserver) {
      viewport._imgResizeObserver.disconnect();
      delete viewport._imgResizeObserver;
    }

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let dragStartTranslateX = 0;
    let dragStartTranslateY = 0;

    const MIN_SCALE = 0.1;
    const MAX_SCALE = 20;
    const ZOOM_STEP = 0.25;

    const applyTransform = () => {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    if (img.complete && img.naturalWidth > 0) {
      fitToViewport();
    } else {
      img.onload = fitToViewport;
    }

    function fitToViewport() {
      const vpRect = viewport.getBoundingClientRect();
      const vpW = vpRect.width;
      const vpH = vpRect.height;
      const padW = vpW * 0.92;
      const padH = vpH * 0.85;
      const fitScale = Math.min(padW / img.naturalWidth, padH / img.naturalHeight, 1);
      scale = fitScale;
      translateX = 0;
      translateY = 0;
      applyTransform();
    }

    const zoomAt = (newScale, cx, cy) => {
      const rect = viewport.getBoundingClientRect();
      const vpW = rect.width;
      const vpH = rect.height;
      const rx = (cx - rect.left) / vpW;
      const ry = (cy - rect.top) / vpH;
      translateX -= (newScale - scale) * (rx - 0.5) * vpW;
      translateY -= (newScale - scale) * (ry - 0.5) * vpH;
      scale = newScale;
      applyTransform();
    };

    const zoom = (delta, cx, cy) => {
      const direction = delta > 0 ? -1 : 1;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + direction * ZOOM_STEP)));
      if (newScale !== scale) {
        zoomAt(newScale, cx, cy);
      }
    };

    const reset = () => { fitToViewport(); };

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    img.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dragStartTranslateX = translateX;
      dragStartTranslateY = translateY;
      img.style.cursor = 'grabbing';
      img.style.transition = '';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      translateX = dragStartTranslateX + dx;
      translateY = dragStartTranslateY + dy;
      applyTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = '';
      }
    });

    img.addEventListener('dblclick', reset);

    this._container.querySelectorAll('.img-zoom-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'zoom-in') {
          const rect = viewport.getBoundingClientRect();
          zoom(-1, rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else if (action === 'zoom-out') {
          const rect = viewport.getBoundingClientRect();
          zoom(1, rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else if (action === 'reset') {
          reset();
        }
      });
    });

    const resizeObserver = new ResizeObserver(() => { fitToViewport(); });
    resizeObserver.observe(viewport);
    viewport._imgResizeObserver = resizeObserver;
  }

  // ==================== 格式路由 ====================

  /** SheetJS 表格预览（XLSX / XLS / CSV） */
  async showSpreadsheet(filePath, forceRefresh) {
    await renderSpreadsheet(this._container, filePath, forceRefresh, this._onError);
  }

  /** Silurus XLSX 预览 */
  async showXlsxSilurus(filePath, forceRefresh) {
    await renderXlsxSilurus(this._container, filePath, forceRefresh, this._onError);
  }

  /** mammoth.js DOCX 预览 */
  async showDocx(filePath, forceRefresh) {
    await renderDocx(this._container, filePath, forceRefresh, this._onError);
  }

  /**
   * docx-preview DOM 渲染（DOCX 默认引擎），解析失败自动降级 Silurus。
   * HTTP 失败（文件过大/不存在等）不降级——那是网络/文件问题，换引擎无用。
   */
  async showDocxDom(filePath, forceRefresh) {
    try {
      const ok = await renderDocxDom(this._container, filePath, forceRefresh, this._onError);
      if (ok === false) return; // HTTP 失败，已渲染错误 UI
      return; // 渲染成功（含"渲染期间已切换文件"的静默退出）
    } catch (err) {
      // 解析失败 → 降级 Silurus 引擎
      console.warn('BinaryPreview: docx-preview failed, falling back to Silurus', err);
      await renderDocxSilurus(this._container, filePath, forceRefresh, this._onError);
    }
  }

  /** Silurus DOCX 预览 */
  async showDocxSilurus(filePath, forceRefresh) {
    await renderDocxSilurus(this._container, filePath, forceRefresh, this._onError);
  }

  /** PptxViewJS PPTX 预览 */
  async showPptx(filePath, forceRefresh) {
    await renderPptx(this._container, filePath, forceRefresh, this._onError);
  }

  /** Silurus PPTX 预览 */
  async showPptxSilurus(filePath, forceRefresh) {
    await renderPptxSilurus(this._container, filePath, forceRefresh, this._onError);
  }

  // ==================== HTML Web 预览 ====================

  /**
   * 渲染 HTML 文件预览 — 通过 iframe 加载渲染后的页面效果
   */
  showWebPreview(filePath) {
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;
    const fileName = filePath.split('/').pop() || filePath;

    this._container.innerHTML = `
      <div class="file-web-preview">
        <div class="web-preview-toolbar">
          <span class="web-preview-filename">${escapeHtml(fileName)}</span>
          <button class="web-preview-open-btn" title="在系统浏览器中打开">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>
              <path d="M10 2h4v4"/>
              <path d="M14 2L8 8"/>
            </svg>
            在浏览器中打开
          </button>
        </div>
        <iframe class="web-preview-iframe" src="${url}"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          title="${escapeHtml(fileName)}"></iframe>
      </div>`;

    const openBtn = this._container.querySelector('.web-preview-open-btn');
    if (openBtn && window.HippoDesktop && window.HippoDesktop.openExternal) {
      openBtn.addEventListener('click', () => {
        window.HippoDesktop.openExternal(url).catch(() => {
          window.open(url, '_blank');
        });
      });
    } else if (openBtn) {
      openBtn.addEventListener('click', () => {
        window.open(url, '_blank');
      });
    }
  }

  // ==================== 错误提示 ====================

  /**
   * 根据 HTTP 状态码显示友好错误提示
   * @param {Response} resp
   * @param {string} filePath
   */
  async _showHttpError(resp, filePath) {
    let serverMsg = '';
    try {
      serverMsg = await resp.text();
    } catch (_) {}

    const status = resp.status;
    let title = '预览失败';
    let detail = '';

    if (status === 413) {
      title = '文件过大';
      detail = serverMsg || '文件体积超过服务端限制，无法加载预览';
    } else if (status === 404) {
      title = '文件未找到';
      detail = serverMsg || '文件不存在或已被删除';
    } else if (status === 400) {
      title = '请求错误';
      detail = serverMsg || '无法解析该文件';
    } else if (status >= 500) {
      title = '服务端错误';
      detail = serverMsg || '服务端处理失败';
    } else {
      detail = serverMsg || `HTTP 错误（${status}）`;
    }

    const canShowInFolder = typeof window.HippoDesktop !== 'undefined'
      && window.HippoDesktop
      && typeof window.HippoDesktop.showItemInFolder === 'function'
      && filePath;

    this._container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p style="font-size:13px; opacity:0.8;">${escapeHtml(detail)}</p>
      ${canShowInFolder
        ? `<button class="file-preview-open-folder-btn"
             onclick="HippoDesktop.showItemInFolder('${escapeHtml(filePath)}').catch(()=>{})">
             <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/>
             </svg>
             在文件管理器中查看
           </button>`
        : ''}
    </div>`;
    this._onError(new Error(`${title}: ${detail}`));
  }
}
