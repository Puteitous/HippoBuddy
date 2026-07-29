/**
 * PptxPreview — PptxViewJS PPTX 预览
 *
 * 通过 PptxViewJS 将 PPTX 渲染为纵向滚动预览。
 * 使用 IntersectionObserver 渐进渲染，仅渲染可视区域附近的幻灯片。
 * 支持缩放、Ctrl+滚轮、键盘快捷键。
 */

import { escapeHtml, updateStatusbarText } from './shared.js';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;

/**
 * 通过 PptxViewJS 将 PPTX 渲染为纵向滚动预览（渐进渲染）
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件路径
 * @param {boolean} [forceRefresh] - 是否强制刷新
 * @param {Function} [onError] - 错误回调 (err) => void
 */
export async function renderPptx(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  let pptxScale = 1;
  let totalSlides = 1;
  let viewer = null;

  try {
    // 加载状态
    container.innerHTML = `<div class="file-binary-preview loading">加载 PPTX 文件中...</div>`;

    const resp = await fetch(url);
    if (!resp.ok) {
      await showHttpError(container, resp, filePath, onError);
      return;
    }
    const arrayBuffer = await resp.arrayBuffer();

    // 初始化 PptxViewJS viewer
    viewer = new PptxViewJS.PPTXViewer({});
    await viewer.loadFile(new File([arrayBuffer], filePath.split('/').pop() || 'presentation.pptx'));

    totalSlides = viewer.slideCount || 1;
    pptxScale = 1;

    updateStatusbarText(`PPTX · ${totalSlides} 页`);

    // ── 构建 UI ──
    container.innerHTML = '';
    container.style.position = 'relative';

    // 吸顶工具栏（仅缩放）
    const toolbar = document.createElement('div');
    toolbar.className = 'pptx-toolbar';
    toolbar.innerHTML = `
      <button class="pptx-zoom-btn" data-action="zoom-out" title="缩小">−</button>
      <button class="pptx-zoom-btn" data-action="zoom-in" title="放大">+</button>
      <button class="pptx-zoom-btn pptx-zoom-reset" data-action="reset" title="重置缩放">⟲</button>
      <span class="pptx-zoom-level">100%</span>
    `;
    container.appendChild(toolbar);

    // 滚动容器
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'pptx-scroll-container';
    container.appendChild(scrollWrap);

    const zoomLevelEl = toolbar.querySelector('.pptx-zoom-level');

    // ── 辅助函数：计算 Canvas 基准尺寸 ──
    const calcCanvasSize = () => {
      const wrapWidth = scrollWrap.clientWidth;
      const availW = Math.max(200, wrapWidth - 48);
      const maxCanvasW = Math.min(availW, 900);
      const dpr = window.devicePixelRatio || 1;
      return {
        w: Math.round(maxCanvasW * dpr),
        h: Math.round(maxCanvasW * 9 / 16 * dpr),
        styleW: maxCanvasW,
        styleH: maxCanvasW * 9 / 16,
      };
    };

    // ── 渲染单页幻灯片 ──
    const renderSlide = async (canvas, slideIndex) => {
      try {
        await viewer.renderSlide(slideIndex, canvas);
        canvas.dataset.rendered = 'true';
      } catch (err) {
        console.error('BinaryPreview: pptx render slide failed', slideIndex, err);
      }
    };

    const initSize = calcCanvasSize();
    const slidePages = [];

    for (let i = 0; i < totalSlides; i++) {
      const page = document.createElement('div');
      page.className = 'pptx-slide-page';

      const canvas = document.createElement('canvas');
      canvas.className = 'pptx-canvas';
      canvas.dataset.slideIndex = i;
      canvas.width = initSize.w;
      canvas.height = initSize.h;
      canvas.style.width = `${initSize.styleW}px`;
      canvas.style.height = `${initSize.styleH}px`;
      canvas.style.display = 'none';

      const placeholder = document.createElement('div');
      placeholder.className = 'pptx-slide-placeholder';
      placeholder.style.width = `${initSize.styleW}px`;
      placeholder.style.height = `${initSize.styleH}px`;
      placeholder.textContent = `第 ${i + 1} 页`;

      const numLabel = document.createElement('div');
      numLabel.className = 'pptx-slide-number';
      numLabel.textContent = `${i + 1} / ${totalSlides}`;

      page.appendChild(placeholder);
      page.appendChild(canvas);
      page.appendChild(numLabel);
      scrollWrap.appendChild(page);

      slidePages.push({ page, canvas, placeholder, rendered: false });
    }

    // ── IntersectionObserver 渐进渲染 ──
    const io = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const pageEl = entry.target;
        const idx = parseInt(pageEl.dataset.slideIndex, 10);
        const slide = slidePages[idx];
        if (!slide || slide.rendered) return;

        slide.rendered = true;
        io.unobserve(pageEl);
        await renderSlide(slide.canvas, idx);
        slide.canvas.style.display = '';
        slide.placeholder.style.display = 'none';
      });
    }, {
      root: scrollWrap,
      rootMargin: '300px 0px',
    });

    slidePages.forEach((slide, i) => {
      slide.page.dataset.slideIndex = i;
      io.observe(slide.page);
    });

    // 强制渲染前 3 页，确保首屏即时展示
    const initialRenderCount = Math.min(3, totalSlides);
    for (let i = 0; i < initialRenderCount; i++) {
      const slide = slidePages[i];
      slide.rendered = true;
      io.unobserve(slide.page);
      await renderSlide(slide.canvas, i);
      slide.canvas.style.display = '';
      slide.placeholder.style.display = 'none';
    }

    // ── 统一缩放 ──
    let resizeGuard = false;

    const applyZoom = () => {
      resizeGuard = true;
      slidePages.forEach(slide => {
        const w = Math.round(initSize.styleW * pptxScale);
        const h = Math.round(initSize.styleH * pptxScale);
        slide.canvas.style.width = `${w}px`;
        slide.canvas.style.height = `${h}px`;
        slide.placeholder.style.width = `${w}px`;
        slide.placeholder.style.height = `${h}px`;
      });
      if (zoomLevelEl) {
        zoomLevelEl.textContent = `${Math.round(pptxScale * 100)}%`;
      }
      setTimeout(() => { resizeGuard = false; }, 60);
    };

    // ── 窗口 resize 重新适配 ──
    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeGuard) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newSize = calcCanvasSize();
        slidePages.forEach(slide => {
          if (slide.rendered) {
            const w = Math.round(newSize.styleW * pptxScale);
            const h = Math.round(newSize.styleH * pptxScale);
            slide.canvas.style.width = `${w}px`;
            slide.canvas.style.height = `${h}px`;
          }
          slide.placeholder.style.width = `${newSize.styleW}px`;
          slide.placeholder.style.height = `${newSize.styleH}px`;
        });
        Object.assign(initSize, newSize);
      }, 200);
    });
    resizeObserver.observe(scrollWrap);

    // ── 工具栏缩放事件 ──
    toolbar.addEventListener('click', (e) => {
      const zoomBtn = e.target.closest('.pptx-zoom-btn');
      if (!zoomBtn) return;
      const action = zoomBtn.dataset.action;
      if (action === 'zoom-in') {
        pptxScale = Math.min(MAX_SCALE, pptxScale * (1 + ZOOM_STEP));
      } else if (action === 'zoom-out') {
        pptxScale = Math.max(MIN_SCALE, pptxScale * (1 - ZOOM_STEP));
      } else if (action === 'reset') {
        pptxScale = 1;
      }
      applyZoom();
    });

    // ── Ctrl + 滚轮缩放 ──
    scrollWrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        pptxScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pptxScale * (1 + delta * ZOOM_STEP)));
        applyZoom();
      }
    }, { passive: false });

    // ── 键盘快捷键 ──
    const keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        pptxScale = Math.min(MAX_SCALE, pptxScale * (1 + ZOOM_STEP));
        applyZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        pptxScale = Math.max(MIN_SCALE, pptxScale * (1 - ZOOM_STEP));
        applyZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        pptxScale = 1;
        applyZoom();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // ── 清理 ──
    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        document.removeEventListener('keydown', keyHandler);
        resizeObserver.disconnect();
        io.disconnect();
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });

  } catch (err) {
    console.error('BinaryPreview: pptx parse failed', filePath, err);
    container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>PPTX 解析失败: ${escapeHtml(err.message)}</p>
    </div>`;
    if (onError) onError(err);
  }
}

/**
 * 显示 HTTP 错误提示
 */
async function showHttpError(container, resp, filePath, onError) {
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

  container.innerHTML = `<div class="file-preview-placeholder">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p style="font-size:13px; opacity:0.8;">${escapeHtml(detail)}</p>
  </div>`;
  if (onError) onError(new Error(`${title}: ${detail}`));
}
