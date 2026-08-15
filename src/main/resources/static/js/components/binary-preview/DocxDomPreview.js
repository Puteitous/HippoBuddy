/**
 * DocxDomPreview — docx-preview DOCX 预览（DOM 渲染）
 *
 * 使用 docx-preview 将 DOCX 渲染为 HTML DOM。分页/换行/表格等流式排版
 * 交给浏览器 CSS 引擎处理（对比 Silurus 的自研 Canvas 分页，复杂版式
 * 保真度更高）。
 *
 * 与 Silurus 路径的关系（BinaryPreview.showDocxDom 负责编排）：
 *   - 默认走本组件（docx-preview 优先）
 *   - renderAsync 解析失败 → 抛错，BinaryPreview 降级到 Silurus
 *   - fetch HTTP 失败 → 内部渲染错误 UI 并返回 false（降级无意义）
 *
 * 生命周期：
 *   - docx-preview 无 dispose API，卸载时清空 host.innerHTML 即可
 *   - 浮动缩放工具栏复用 .pptx-toolbar CSS（− / + / ⟲ 适应宽度）
 *   - 缩放用 CSS zoom 作用于 .docx-wrapper（Chromium/Electron 原生支持）
 *   - sessionGen + currentPath 双重路径守卫（与 Silurus 路径一致）
 */

import { escapeHtml, updateStatusbarText } from './shared.js';

const ZOOM_STEP = 0.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/** 动态加载 docx-preview 模块（缓存 Promise，失败可重试），避免 277KB 进启动路径 */
let _docxPreviewModule = null;
function getDocxPreviewModule() {
  if (!_docxPreviewModule) {
    _docxPreviewModule = import('../../vendor/docx-preview.js')
      .catch(err => {
        _docxPreviewModule = null; // 清除缓存，允许重试
        throw new Error(`加载 docx-preview 模块失败: ${err.message}`);
      });
  }
  return _docxPreviewModule;
}

/**
 * 渲染 DOCX（docx-preview 引擎）
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件绝对路径
 * @param {boolean} [forceRefresh] - 强制刷新（加 cache-bust 参数）
 * @param {Function} [onError] - HTTP 错误回调 (err) => void
 * @returns {Promise<boolean>}
 *   - true：渲染成功（或渲染期间文件已切换，静默退出）
 *   - false：HTTP 失败（已渲染错误 UI，不应降级）
 *   - 抛出：解析失败，由调用方降级到 Silurus
 */
export async function renderDocxDom(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  try {
    container.innerHTML = `<div class="file-binary-preview loading">加载 DOCX 文件中（docx-preview 引擎）...</div>`;

    const resp = await fetch(url);
    if (!resp.ok) {
      await showHttpError(container, resp, filePath, onError);
      return false;
    }
    const arrayBuffer = await resp.arrayBuffer();

    // 路径守卫（fetch 期间文件可能已切换）
    const sessionGen = container.dataset.sessionGen;
    if (container.dataset.currentPath !== filePath || container.dataset.sessionGen !== sessionGen) {
      return true; // 已切换，新文件的渲染流程已接管容器
    }

    // 渲染容器 + 浮动缩放工具栏（复用 PPTX 样式）
    container.innerHTML = '';
    container.style.position = 'relative';

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

    // 滚动容器（docx-preview 渲染进这里；.file-binary-preview 自身不滚动）
    const host = document.createElement('div');
    host.className = 'docx-dom-host';
    container.appendChild(host);

    // docx-preview 渲染：分页/换行/表格排版交给浏览器 CSS 引擎
    const { renderAsync } = await getDocxPreviewModule();
    await renderAsync(arrayBuffer, host, undefined, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      experimental: false,
    });

    // 路径守卫（渲染期间也可能切换文件）
    if (container.dataset.currentPath !== filePath || container.dataset.sessionGen !== sessionGen) {
      host.innerHTML = '';
      return true;
    }

    // 缩放：CSS zoom 作用于 docx-preview 的根容器 .docx-wrapper
    const wrap = host.querySelector('.docx-wrapper') || host;

    const getScale = () => parseFloat(wrap.style.zoom) || 1;
    const setScale = (next) => {
      wrap.style.zoom = String(next);
      if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(next * 100)}%`;
    };
    const applyZoom = (direction) => {
      const cur = getScale();
      const next = direction > 0
        ? Math.min(MAX_SCALE, cur * (1 + ZOOM_STEP))
        : Math.max(MIN_SCALE, cur * (1 - ZOOM_STEP));
      setScale(next);
    };
    const fitWidth = () => {
      // scrollWidth 在 zoom≠1 时返回已缩放值，除以当前 zoom 得原始宽度
      const base = wrap.scrollWidth / getScale();
      const avail = host.clientWidth;
      const scale = Math.max(MIN_SCALE, Math.min(1, avail / base));
      setScale(scale);
    };

    fitWidth();

    // 工具栏事件
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'zoom-in') applyZoom(1);
      else if (btn.dataset.action === 'zoom-out') applyZoom(-1);
      else if (btn.dataset.action === 'reset') fitWidth();
    });

    // Ctrl+滚轮缩放
    container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        applyZoom(e.deltaY > 0 ? -1 : 1);
      }
    }, { passive: false });

    // 状态栏：breakPages:true 时每页一个 .docx-page 元素
    const pageCount = host.querySelectorAll('.docx-page').length;
    updateStatusbarText(pageCount > 0 ? `DOCX · ${pageCount} 页` : 'DOCX');
    container._docxDomHost = host;

    // MutationObserver 清理：容器脱离 DOM 时清空渲染结果（无 dispose API）
    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        cleanupObserver.disconnect();
        host.innerHTML = '';
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });

    return true;

  } catch (err) {
    console.error('BinaryPreview: docx-preview parse failed', filePath, err);
    // 解析失败：清掉 loading 占位，抛给调用方降级 Silurus
    container.innerHTML = '';
    throw err;
  }
}

/** 显示 HTTP 错误提示（与 DocxPreview.js 同款私有实现，避免跨模块导出） */
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
