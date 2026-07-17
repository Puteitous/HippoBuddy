/**
 * Mermaid 图表渲染器 — 懒加载 + 渲染逻辑
 *
 * 与 markdown-renderer.js 配合使用：
 *   1. markdown-renderer.js 在 renderer.code 中检测 language === 'mermaid'
 *      输出带预览按钮的代码块 HTML，按钮 onclick 调用 window.initMermaidPreview
 *   2. 本文件提供 window.initMermaidPreview 实现：按需加载 mermaid.min.js，
 *      渲染图表，支持一键切回源码
 */

/** 简单的 HTML 转义 */
function _escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 简易 Toast（不依赖外部模块，mermaid-renderer.js 是普通 script 加载） */
function _showToast(message, type) {
  // 复用已有的 toast-bottom 样式
  const el = document.createElement('div');
  el.className = 'toast-bottom';
  el.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : '◉ ') + message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

/** 全屏切换 */
function _toggleFullscreen(container) {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    container.requestFullscreen().catch(() => {
      // 一些环境不支持全屏，静默失败
    });
  }
}

/**
 * 获取"干净"的 SVG 字符串（剥离缩放/平移变换）
 * @param {SVGElement} svgEl - 可能带有 transform 的 SVG 元素
 * @returns {string} 序列化后的 SVG 字符串
 */
function _getCleanSvgString(svgEl) {
  const clone = svgEl.cloneNode(true);
  // 剥离缩放/平移变换，确保导出原始图表
  clone.style.transform = '';
  clone.removeAttribute('transform');
  clone.style.transformOrigin = '';
  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

/**
 * 通用文件下载（优先 showSaveFilePicker，降级 a.click）
 * @param {Blob} blob - 文件内容
 * @param {string} suggestedName - 建议文件名（含扩展名）
 * @param {string} mimeType - MIME 类型
 */
async function _downloadBlob(blob, suggestedName, mimeType) {
  // Electron 环境下：showSaveFilePicker 和 blob URL 导航都可能在 native 层
  // 存在兼容问题，改用桌面桥弹出原生系统另存为对话框。
  if (window.HippoDesktop?.isAvailable) {
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const result = await window.HippoDesktop.saveFileDialog(base64, suggestedName, mimeType);
      if (result?.path) {
        const fileName = suggestedName.replace(/[^\w.-]/g, '_');
        _showToast(i18n.t('mermaid.saved') + fileName, 'success');
      }
      return;
    } catch (e) {
      console.warn('HippoDesktop.saveFileDialog 失败，跳过下载', e);
      return;
    }
  }

  // 优先使用 File System Access API（Chrome 原生支持）
  if ('showSaveFilePicker' in window) {
    try {
      const ext = suggestedName.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: mimeType.startsWith('image/svg') ? i18n.t('mermaid.svgImage') : i18n.t('mermaid.pngImage'),
          accept: { [mimeType]: ['.' + ext] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // 用户取消保存（AbortError）或 API 不支持 → 静默降级
      if (e.name !== 'AbortError') {
        console.warn('showSaveFilePicker 失败，降级为 a.click 下载', e);
      } else {
        return; // 用户主动取消，不做任何事
      }
    }
  }
  // 降级：传统 a.click()（Web 浏览器）
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName.replace(/[^\w.-]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出 SVG 为文件 */
async function _downloadSvg(svgEl, filename) {
  const svgStr = _getCleanSvgString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  await _downloadBlob(blob, filename + '.svg', 'image/svg+xml');
}

/** 导出图表为 PNG（canvas 渲染），taint 时降级为 SVG */
async function _downloadPng(svgEl, filename) {
  const svgStr = _getCleanSvgString(svgEl);

  // 读取 SVG 尺寸
  const viewBox = svgEl.getAttribute('viewBox');
  let w = 800, h = 600;
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) { w = parts[2]; h = parts[3]; }
  } else {
    w = parseInt(svgEl.getAttribute('width')) || 800;
    h = parseInt(svgEl.getAttribute('height')) || 600;
  }

  try {
    const pngBlob = await _svgToPngBlob(svgStr, w, h);
    if (pngBlob) {
      await _downloadBlob(pngBlob, filename + '.png', 'image/png');
    } else {
      // canvas taint 等导致 toBlob 返回 null
      throw new Error('PNG 导出失败（canvas taint），降级为 SVG');
    }
  } catch (err) {
    console.warn('Mermaid PNG 导出失败，降级为 SVG:', err.message);
    // 降级为 SVG 导出
    await _downloadSvg(svgEl, filename);
  }
}

/**
 * 将 SVG 字符串渲染到 canvas 并导出为 PNG Blob
 * @param {string} svgStr - 干净的 SVG 字符串
 * @param {number} w - 逻辑宽度
 * @param {number} h - 逻辑高度
 * @returns {Promise<Blob|null>} PNG Blob，taint 时返回 null
 */
function _svgToPngBlob(svgStr, w, h) {
  return new Promise((resolve) => {
    const scale = 2; // 2x 清晰度
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // 部分浏览器中 tainted canvas 的 toBlob 不调回调也不抛异常，
      // 用超时兜底，避免 Promise 永不休止。
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 3000);
      try {
        canvas.toBlob((pngBlob) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(pngBlob); // taint 时 pngBlob 为 null
        }, 'image/png');
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** 是否已加载 mermaid 核心库 */
let _mermaidLoaded = false;
/** 是否正在加载中 */
let _mermaidLoading = false;
/** 加载队列（加载过程中收到的渲染请求） */
let _loadCallbacks = [];
/** 上次初始化时的主题 */
let _lastTheme = '';

/** 获取当前主题 */
function _getTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' || theme === 'midnight' ? 'dark' : 'default';
}

async function _loadMermaid() {
  const currentTheme = _getTheme();

  if (_mermaidLoaded) {
    // 库已加载，但主题变了 → 重新初始化
    if (currentTheme !== _lastTheme) {
      window.mermaid.initialize({
        theme: currentTheme,
        startOnLoad: false,
        securityLevel: 'loose',
      });
      _lastTheme = currentTheme;
    }
    return true;
  }

  if (_mermaidLoading) {
    // 已在加载中，返回一个等待中的 Promise
    return new Promise((resolve) => _loadCallbacks.push(resolve));
  }
  _mermaidLoading = true;

  try {
    // mermaid.min.js 作为 UMD 模块加载后挂到 window.mermaid
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/vendor/mermaid.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Mermaid 库加载失败'));
      document.head.appendChild(script);
    });

    if (!window.mermaid) {
      throw new Error('Mermaid 库加载后未找到 window.mermaid');
    }

    // 根据当前主题初始化
    window.mermaid.initialize({
      theme: currentTheme,
      startOnLoad: false,
      securityLevel: 'loose',
    });

    _lastTheme = currentTheme;
    _mermaidLoaded = true;
    // 唤醒等待中的回调
    _loadCallbacks.forEach((cb) => cb(true));
    _loadCallbacks = [];
    return true;
  } catch (err) {
    _loadCallbacks.forEach((cb) => cb(false));
    _loadCallbacks = [];
    throw err;
  } finally {
    _mermaidLoading = false;
  }
}

/**
 * 渲染 Mermaid 图表到指定容器
 * @param {HTMLElement} container - 图表容器
 * @param {string} code - Mermaid 源码
 * @param {string} id - 唯一标识
 */
async function _renderMermaid(container, code, id) {
      container.innerHTML = '<div class="mermaid-loading">' + i18n.t('mermaid.rendering') + '</div>';
  container.style.display = '';

  try {
    await _loadMermaid();

    // mermaid.render 会向 container 注入 SVG
    const { svg } = await window.mermaid.render('mermaid-' + id, code);
    container.innerHTML = '';

    // 缩放工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-zoom-toolbar';
    toolbar.innerHTML = `
      <button class="mermaid-zoom-btn" data-zoom="out" title="${i18n.t('mermaid.zoomOut')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/></svg>
      </button>
      <span class="mermaid-zoom-level">100%</span>
      <button class="mermaid-zoom-btn" data-zoom="in" title="${i18n.t('mermaid.zoomIn')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/><line x1="8" y1="3" x2="8" y2="13"/></svg>
      </button>
      <button class="mermaid-zoom-btn" data-zoom="reset" title="${i18n.t('mermaid.zoomReset')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0 1 11.2-3M14 8a6 6 0 0 1-11.2 3"/><polyline points="13 2 13 5 10 5"/><polyline points="3 14 3 11 6 11"/></svg>
      </button>
    `;

    // 缩放包裹层（放 SVG）
    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'mermaid-zoom-wrap';
    zoomWrap.innerHTML = svg;

    let zoomLevel = 1;
    let panX = 0;
    let panY = 0;
    const zoomStep = 0.25;
    const minZoom = 0.25;
    const maxZoom = 4;

    function updateTransform() {
      const svgEl = zoomWrap.querySelector('svg');
      if (svgEl) {
        svgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        svgEl.style.transformOrigin = '0 0';
      }
      const pct = Math.round(zoomLevel * 100);
      const levelEl = toolbar.querySelector('.mermaid-zoom-level');
      if (levelEl) levelEl.textContent = pct + '%';
    }

    function zoomIn() {
      zoomLevel = Math.min(maxZoom, zoomLevel + zoomStep);
      updateTransform();
    }

    function zoomOut() {
      zoomLevel = Math.max(minZoom, zoomLevel - zoomStep);
      updateTransform();
    }

    function zoomReset() {
      zoomLevel = 1;
      panX = 0;
      panY = 0;
      updateTransform();
    }

    // ── 鼠标拖拽平移 ──
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panStartX = 0;
    let panStartY = 0;

    zoomWrap.addEventListener('mousedown', (e) => {
      // 仅当缩放 > 1 或已平移时才启用拖拽
      if (zoomLevel <= 1 && panX === 0 && panY === 0) return;
      // 忽略工具栏点击
      if (e.target.closest('.mermaid-zoom-toolbar')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      zoomWrap.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      zoomWrap.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
    });

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-zoom]');
      if (btn) {
        const action = btn.dataset.zoom;
        if (action === 'in') zoomIn();
        else if (action === 'out') zoomOut();
        else if (action === 'reset') zoomReset();
        else if (action === 'fullscreen') _toggleFullscreen(container);
        else if (action === 'export') {
          // 切换导出菜单显示
          toolbar.querySelector('.mermaid-export-menu').classList.toggle('show');
        }
        return;
      }
      // 导出菜单选项
      const exportItem = e.target.closest('[data-export]');
      if (exportItem) {
        const format = exportItem.dataset.export;
        const svgEl = zoomWrap.querySelector('svg');
        if (!svgEl) return;
        // 关闭菜单
        toolbar.querySelector('.mermaid-export-menu').classList.remove('show');
        // 生成文件名（用当前时间）
        const now = new Date();
        const filename = 'diagram-' +
          now.getFullYear() +
          String(now.getMonth() + 1).padStart(2, '0') +
          String(now.getDate()).padStart(2, '0') +
          '-' +
          String(now.getHours()).padStart(2, '0') +
          String(now.getMinutes()).padStart(2, '0') +
          String(now.getSeconds()).padStart(2, '0');
        if (format === 'png') {
          // Mermaid SVG 常含 foreignObject（如节点中的 HTML 文本），
          // 只要含 foreignObject 的 SVG 画到 canvas 上就一定会 taint，
          // 导致 toBlob 失败。提前检测，直接走 SVG 导出，避免无谓的尝试。
          const hasForeignObject = svgEl.querySelector('foreignObject');
          if (hasForeignObject) {
            _downloadSvg(svgEl, filename).catch(console.error);
          } else {
            _downloadPng(svgEl, filename).catch(console.error);
          }
        } else if (format === 'svg') _downloadSvg(svgEl, filename).catch(console.error);
        return;
      }
      // 点击工具栏其他区域关闭菜单
      toolbar.querySelector('.mermaid-export-menu').classList.remove('show');
    });

    // 点击工具栏外部关闭导出菜单（单例，避免重复注册）
    if (!window.__mermaidDocClickHandler) {
      window.__mermaidDocClickHandler = (e) => {
        document.querySelectorAll('.mermaid-export-menu.show').forEach((menu) => {
          if (!e.target.closest('.mermaid-export-group')) {
            menu.classList.remove('show');
          }
        });
      };
      document.addEventListener('click', window.__mermaidDocClickHandler);
    }

    // 鼠标滚轮缩放（Ctrl/Command + 滚轮）
    zoomWrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }, { passive: false });

    // 构建工具栏（完整版）
    toolbar.innerHTML = `
      <button class="mermaid-zoom-btn" data-zoom="out" title="${i18n.t('mermaid.zoomOut')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/></svg>
      </button>
      <span class="mermaid-zoom-level">100%</span>
      <button class="mermaid-zoom-btn" data-zoom="in" title="${i18n.t('mermaid.zoomIn')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/><line x1="8" y1="3" x2="8" y2="13"/></svg>
      </button>
      <button class="mermaid-zoom-btn" data-zoom="reset" title="${i18n.t('mermaid.zoomReset')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0 1 11.2-3M14 8a6 6 0 0 1-11.2 3"/><polyline points="13 2 13 5 10 5"/><polyline points="3 14 3 11 6 11"/></svg>
      </button>
      <span class="mermaid-zoom-sep"></span>
      <button class="mermaid-zoom-btn" data-zoom="fullscreen" title="${i18n.t('mermaid.fullscreen')}">
        <svg class="mermaid-fullscreen-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v4h4M13 7V3H9M3 7V3h4M13 9v4H9"/></svg>
      </button>
      <div class="mermaid-export-group">
        <button class="mermaid-zoom-btn mermaid-export-btn" title="${i18n.t('mermaid.export')}" data-zoom="export">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v7M5 7l3 3 3-3M3 12v1h10v-1"/></svg>
        </button>
        <div class="mermaid-export-menu">
          <button class="mermaid-export-menu-item" data-export="png">${i18n.t('mermaid.exportPng')}</button>
          <button class="mermaid-export-menu-item" data-export="svg">${i18n.t('mermaid.exportSvg')}</button>
        </div>
      </div>
    `;

    container.appendChild(toolbar);
    container.appendChild(zoomWrap);
  } catch (err) {
    console.error('Mermaid 渲染失败:', err);
    container.innerHTML = `<div class="mermaid-error">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${i18n.t('mermaid.syntaxError')}</span>
      <span class="mermaid-error-detail">${_escapeHtml(err.message)}</span>
    </div>`;
  }
}

/**
 * 全局入口 — 由 markdown-renderer 输出的按钮 onclick 调用
 * 从 code 元素的 data-raw-code 属性读取 Mermaid 源码
 * @param {HTMLElement} btnEl - 触发按钮
 */
window.initMermaidPreview = function (btnEl) {
  const wrapper = btnEl.closest('.code-block-wrapper');
  if (!wrapper) return;

  // 从 code 元素的 data-raw-code 读取源码
  const codeEl = wrapper.querySelector('code[data-raw-code]');
  if (!codeEl) return;
  const code = decodeURIComponent(codeEl.dataset.rawCode);

  // 查找或创建图表预览容器
  let previewContainer = wrapper.querySelector('.mermaid-preview-container');
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.className = 'mermaid-preview-container';
    previewContainer.style.display = 'none';
    // 插入到 code-block-body 之后
    const body = wrapper.querySelector('.code-block-body');
    if (body && body.nextSibling) {
      wrapper.insertBefore(previewContainer, body.nextSibling);
    } else {
      wrapper.appendChild(previewContainer);
    }
  }

  const isPreviewVisible = previewContainer.style.display !== 'none';
  const codeBody = wrapper.querySelector('.code-block-body');

  if (isPreviewVisible) {
    // 当前显示图表 → 切回源码
    previewContainer.style.display = 'none';
    if (codeBody) codeBody.style.display = '';
    btnEl.textContent = i18n.t('mermaid.preview');
    return;
  }

  // 切到预览
  if (codeBody) codeBody.style.display = 'none';

  // 检查源码和主题是否变化（对比上次渲染的缓存）
  const lastCode = previewContainer.dataset.lastCode;
  const lastTheme = previewContainer.dataset.lastTheme;
  const currentTheme = _getTheme();
  if (lastCode === code && lastTheme === currentTheme && previewContainer.querySelector('svg')) {
    // 源码未变且主题未变且已有 SVG，直接显示
    previewContainer.style.display = '';
    btnEl.textContent = i18n.t('mermaid.showSource');
    return;
  }

  previewContainer.style.display = '';
  btnEl.textContent = i18n.t('mermaid.showSource');

  // 生成唯一 ID
  const id = 'mmd-' + Math.random().toString(36).substr(2, 9);
  _renderMermaid(previewContainer, code, id).then(() => {
    previewContainer.dataset.lastCode = code;
    previewContainer.dataset.lastTheme = currentTheme;
  });
};
