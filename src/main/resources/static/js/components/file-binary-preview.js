/**
 * BinaryPreview — 二进制文件预览组件
 *
 * 负责图片/PDF、表格（XLSX/XLS/CSV）、DOCX、PPTX 等二进制文件的只读预览。
 * 被 FilePreview 委托调用。
 *
 * 依赖的外部库（通过 &lt;script&gt; 标签在 HTML 中加载）：
 *   - js/vendor/xlsx.js（SheetJS）
 *   - js/vendor/mammoth.js
 *   - js/vendor/jszip.min.js（ZIP 解压，PPTX 依赖）
 *   - js/vendor/chart.umd.min.js（Chart.js，PPTX 图表渲染）
 *   - js/vendor/pptx-preview.js（PptxViewJS）
 *
 * Silurus 集成（POC）：
 *   - js/vendor/ooxml/ 下的 @silurus/ooxml 包
 *   - 通过 ooxml-bridge.js 动态导入
 */

import { createPptxScrollViewer, createDocxScrollViewer, createXlsxViewer, math } from './ooxml-bridge.js'

// ==================== 静态检测函数 ====================

export function isImageFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
}

export function isPdfFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.pdf');
}

export function isSpreadsheetFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['xlsx', 'xls', 'csv'].includes(ext);
}

export function isDocxFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.docx');
}

export function isPptxFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.pptx');
}

export function isHtmlFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['html', 'htm'].includes(ext);
}

// ==================== 工具函数 ====================

/** 转义 HTML 特殊字符 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 判断是否为 CSV 文件 */
export function isCsvFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.csv');
}

/**
 * 对 CSV 字节数组做编码检测和转换，返回 UTF-8 字符串。
 *
 * 检测策略：
 *   1. 检查 UTF-8 BOM → 去除 BOM，按 UTF-8 解码为字符串
 *   2. 尝试 UTF-8 解码（fatal 模式）→ 成功则返回字符串
 *   3. 失败 → 按 GBK 解码，返回字符串
 */
function decodeCSVToString(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length === 0) return '';

  let dataBytes = bytes;

  // 1. 检查 UTF-8 BOM（EF BB BF）→ 去除 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    dataBytes = bytes.slice(3);
  }

  // 2. 尝试 UTF-8 解码（fatal 模式：遇到非法序列抛异常）
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(dataBytes);
  } catch (_) {
    // 3. UTF-8 解码失败 → 按 GBK 解码
    try {
      return new TextDecoder('gbk').decode(dataBytes);
    } catch (e) {
      console.warn('BinaryPreview: CSV encoding fallback failed, returning empty', e);
      return '';
    }
  }
}

// ==================== BinaryPreview 类 ====================

/** 检测 CSV 字节数组的实际编码 */
function detectCSVEncoding(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length === 0) return 'UTF-8';
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'UTF-8 BOM';
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'UTF-8';
  } catch (_) {
    return 'GBK';
  }
}

/** 将 Silurus 的 (row, col) 0-indexed 坐标转为 A1 表示法（如 B2） */
function cellAddressToA1(row, col) {
  let colStr = '';
  let c = col;
  while (c >= 0) {
    colStr = String.fromCharCode((c % 26) + 65) + colStr;
    c = Math.floor(c / 26) - 1;
  }
  return `${colStr}${row + 1}`;
}

/** 更新全局底部状态栏的右侧文本 */
function updateStatusbarText(text) {
  const el = document.getElementById('statusbarRight');
  if (el) el.textContent = text;
}

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
            <button class="img-zoom-btn img-zoom-reset" data-action="reset" title="重置">⟲</button>
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

    // 清理之前的 ResizeObserver（防止泄漏）
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

    // 图片加载完成后自动适配视口
    if (img.complete && img.naturalWidth > 0) {
      fitToViewport();
    } else {
      img.onload = fitToViewport;
    }

    function fitToViewport() {
      const vpRect = viewport.getBoundingClientRect();
      const vpW = vpRect.width;
      const vpH = vpRect.height;
      const padW = vpW * 0.92;   // 留 8% 边距
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

    const reset = () => {
      fitToViewport();
    };

    // 滚轮缩放
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    // 拖拽平移
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

    // 双击重置
    img.addEventListener('dblclick', reset);

    // 工具栏按钮
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

    // 窗口缩放时重新自适应（使用 ResizeObserver）
    const resizeObserver = new ResizeObserver(() => {
      fitToViewport();
    });
    resizeObserver.observe(viewport);
    viewport._imgResizeObserver = resizeObserver;
  }

  // ==================== 表格预览（XLSX / XLS / CSV）====================

  /** 通过 SheetJS 将表格文件渲染为 HTML 表格 */
  async showSpreadsheet(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    const MAX_TOTAL_ROWS = 1000;
    const DISPLAY_ROWS = 100;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        await this._showHttpError(resp, filePath);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();

      let sheetData;
      if (isCsvFile(filePath)) {
        // CSV: 解码为 UTF-8 字符串后传给 SheetJS，避免字节数组编码识别错误
        const csvString = decodeCSVToString(arrayBuffer);
        sheetData = csvString;
      } else {
        sheetData = new Uint8Array(arrayBuffer);
      }

      const workbook = XLSX.read(sheetData, { type: isCsvFile(filePath) ? 'string' : 'array' });

      const renderSheetTable = (sheet, sheetIdx) => {
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const totalRows = jsonData.length;
        const isOverflow = totalRows > MAX_TOTAL_ROWS;
        const displayData = isOverflow ? jsonData.slice(0, DISPLAY_ROWS) : jsonData;

        let tableHtml = '';
        if (displayData.length === 0) {
          tableHtml = '<div class="spreadsheet-empty">此 sheet 为空</div>';
        } else {
          tableHtml = '<table>';
          displayData.forEach((row, rowIdx) => {
            tableHtml += '<tr>';
            row.forEach((cell) => {
              const tag = rowIdx === 0 ? 'th' : 'td';
              const val = cell != null ? String(cell) : '';
              const cellClass = rowIdx === 0 ? '' : (!isNaN(val) && val !== '' ? 'num-cell' : 'text-cell');
              tableHtml += `<${tag}${cellClass ? ` class="${cellClass}"` : ''}>${escapeHtml(val)}</${tag}>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</table>';
        }

        if (isOverflow) {
          const remainingRows = totalRows - DISPLAY_ROWS;
          tableHtml += `<div class="spreadsheet-overflow-notice">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="8" r="6"/>
              <line x1="8" y1="5" x2="8" y2="8"/>
              <line x1="8" y1="10.5" x2="8.01" y2="10.5"/>
            </svg>
            仅显示前 ${DISPLAY_ROWS} 行，共 ${totalRows} 行（剩余 ${remainingRows} 行未显示）
          </div>`;
        }

        return { html: tableHtml, totalRows, isOverflow };
      };

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const firstRender = renderSheetTable(sheet, 0);

      let html = `<div class="file-spreadsheet-preview">`;

      if (workbook.SheetNames.length > 1) {
        html += `<div class="spreadsheet-sheet-tabs">
          ${workbook.SheetNames.map((name, i) => `
            <div class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet-index="${i}">
              ${escapeHtml(name)}
            </div>`).join('')}
        </div>`;
      }

      html += `<div class="spreadsheet-table-wrap">${firstRender.html}</div></div>`;
      this._container.innerHTML = html;

      // 更新全局状态栏
      if (isCsvFile(filePath)) {
        const enc = detectCSVEncoding(arrayBuffer);
        updateStatusbarText(`CSV · ${enc}`);
      } else {
        const ext = filePath.split('.').pop().toUpperCase();
        updateStatusbarText(`${ext} · ${workbook.SheetNames.length} sheet${workbook.SheetNames.length > 1 ? 's' : ''}`);
      }

      const tabs = this._container.querySelectorAll('.sheet-tab');
      const wrap = this._container.querySelector('.spreadsheet-table-wrap');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const idx = parseInt(tab.dataset.sheetIndex, 10);
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const name = workbook.SheetNames[idx];
          const s = workbook.Sheets[name];
          const rendered = renderSheetTable(s, idx);
          wrap.innerHTML = rendered.html;
        });
      });

    } catch (err) {
      console.error('BinaryPreview: spreadsheet parse failed', filePath, err);
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>表格解析失败: ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== XLSX 预览（Silurus @silurus/ooxml）====================

  /**
   * 使用 @silurus/ooxml 渲染 XLSX 预览。
   * XlsxViewer 自包含 Canvas + tab 栏，直接挂载到容器。
   *
   * 和现有的 showSpreadsheet 不同：
   *   - SheetJS 版本将数据转为 HTML 表格，无样式
   *   - Silurus 版本使用 Canvas 渲染，保留单元格样式/图表/格式
   */
  async showXlsxSilurus(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    let _sheetNames = [];
    let _currentSheetName = '';

    let _sessionGen; // 在路径守卫中使用

    try {
      this._container.innerHTML = `<div class="file-binary-preview loading">加载 XLSX 文件中（Silurus 引擎）...</div>`;

      // 清理容器，留给 XlsxViewer 管理
      this._container.innerHTML = '';
      this._container.style.position = 'relative';

      // 转发 sessionGen 给 thenable 闭包
      const container = this._container;
      _sessionGen = container.dataset.sessionGen;

      // 更新状态栏（纯位置信息，无选中单元格）
      const updateStatusbarSimple = () => {
        const count = _sheetNames.length;
        updateStatusbarText(`XLSX (Silurus) · ${count} sheet(s)`);
      };

      const viewer = await createXlsxViewer(this._container, url, {
        onReady: (sheetNames) => {
          _sheetNames = sheetNames;
          _currentSheetName = sheetNames[0] ?? '';
          updateStatusbarSimple();
        },
        onSheetChange: (index) => {
          _currentSheetName = _sheetNames[index] ?? '';
          // 选中清除后更新状态栏
          if (!viewer.selection) {
            updateStatusbarSimple();
          }
        },
        onSelectionChange: (selection) => {
          if (!selection) {
            updateStatusbarSimple();
            return;
          }
          const cellRef = cellAddressToA1(selection.anchor.row, selection.anchor.col);
          const count = _sheetNames.length;
          updateStatusbarText(
            `XLSX (Silurus) · ${_currentSheetName}!${cellRef} · ${count} sheet(s)`
          );
        },
      });

      // 路径守卫：如果加载期间文件已切换或同文件被重新打开，丢弃此 viewer
      if (container.dataset.currentPath !== filePath || container.dataset.sessionGen !== _sessionGen) {
        viewer.destroy();
        return;
      }

      // 更新状态栏
      updateStatusbarSimple();

      // 存储引用以便清理
      this._container._silurusViewer = viewer;

    } catch (err) {
      console.error('BinaryPreview: Silurus xlsx parse failed', filePath, err);
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>XLSX 解析失败 (Silurus): ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== DOCX 预览（mammoth.js）====================

  /** 通过 mammoth.js 将 DOCX 渲染为 HTML */
  async showDocx(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        await this._showHttpError(resp, filePath);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();

      const styleMap = [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
      ];
      const result = await mammoth.convertToHtml({
        arrayBuffer: arrayBuffer,
        styleMap: styleMap,
      });

      this._container.innerHTML = `
        <div class="file-docx-preview">
          <div class="docx-content">
            ${result.value}
          </div>
        </div>`;

      if (result.messages && result.messages.length > 0) {
        console.info('BinaryPreview: mammoth.js 转换警告:', result.messages);
      }

      // 更新全局状态栏
      const warnCount = result.messages ? result.messages.length : 0;
      updateStatusbarText(warnCount > 0 ? `DOCX · ⚠ ${warnCount} 条警告` : 'DOCX');

    } catch (err) {
      console.error('BinaryPreview: docx parse failed', filePath, err);
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>文档解析失败: ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== DOCX 预览（Silurus @silurus/ooxml）====================

  /**
   * 使用 @silurus/ooxml 渲染 DOCX 预览。
   * Canvas 逐页渲染 + 垂直滚动，替换 mammoth.js 的 HTML 转换。
   *
   * DocxDocument 作为 headless 引擎，每页渲染到独立 Canvas，
   * 与 showPptxSilurus 相同的 UI 模式。
   */
  async showDocxSilurus(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    const ZOOM_STEP = 0.15;
    const MIN_SCALE = 0.25;
    const MAX_SCALE = 4;

    try {
      this._container.innerHTML = `<div class="file-binary-preview loading">加载 DOCX 文件中（Silurus 引擎）...</div>`;

      const container = this._container;
      container.innerHTML = '';
      container.style.position = 'relative';

      // 浮动缩放工具栏（复用 PPTX 样式）
      const toolbar = document.createElement('div');
      toolbar.className = 'pptx-toolbar';
      toolbar.innerHTML = `
        <button class="pptx-zoom-btn" data-action="zoom-out" title="缩小">−</button>
        <button class="pptx-zoom-btn" data-action="zoom-in" title="放大">+</button>
        <button class="pptx-zoom-btn pptx-zoom-reset" data-action="reset" title="适配宽度">⟲</button>
        <span class="pptx-zoom-level">100%</span>
      `;
      container.appendChild(toolbar);

      const zoomLevelEl = toolbar.querySelector('.pptx-zoom-level');

      // 自定义缩放：禁用内置 zoom，用自定义步进
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
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>DOCX 解析失败 (Silurus): ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== PPTX 预览 ====================

  /** 通过 PptxViewJS 将 PPTX 渲染为纵向滚动预览（渐进渲染） */
  async showPptx(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    let _pptxScale = 1;
    const MIN_SCALE = 0.25;
    const MAX_SCALE = 4;
    const ZOOM_STEP = 0.25;

    let totalSlides = 1;
    let viewer = null;

    try {
      // 加载状态
      this._container.innerHTML = `<div class="file-binary-preview loading">加载 PPTX 文件中...</div>`;

      const resp = await fetch(url);
      if (!resp.ok) {
        await this._showHttpError(resp, filePath);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();

      // 初始化 PptxViewJS viewer
      viewer = new PptxViewJS.PPTXViewer({});
      await viewer.loadFile(new File([arrayBuffer], filePath.split('/').pop() || 'presentation.pptx'));

      totalSlides = viewer.slideCount || 1;
      _pptxScale = 1;

      // 更新全局状态栏
      updateStatusbarText(`PPTX · ${totalSlides} 页`);

      // ── 构建 UI ──
      const container = this._container;
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

      // 缩放指示器
      const zoomLevelEl = toolbar.querySelector('.pptx-zoom-level');

      // ── 辅助函数：计算 Canvas 基准尺寸 ──
      const calcCanvasSize = () => {
        const wrapWidth = scrollWrap.clientWidth;
        const availW = Math.max(200, wrapWidth - 48); // 左右 padding 各 24px
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

                                                          // ── 创建所有幻灯片页面 ──
      const initSize = calcCanvasSize();
      const slidePages = [];

      for (let i = 0; i < totalSlides; i++) {
        const page = document.createElement('div');
        page.className = 'pptx-slide-page';

        // Canvas（初始隐藏，渲染后显示）
        const canvas = document.createElement('canvas');
        canvas.className = 'pptx-canvas';
        canvas.dataset.slideIndex = i;
        canvas.width = initSize.w;
        canvas.height = initSize.h;
        canvas.style.width = `${initSize.styleW}px`;
        canvas.style.height = `${initSize.styleH}px`;
        canvas.style.display = 'none';

        // 占位提示（渲染前显示）
        const placeholder = document.createElement('div');
        placeholder.className = 'pptx-slide-placeholder';
        placeholder.style.width = `${initSize.styleW}px`;
        placeholder.style.height = `${initSize.styleH}px`;
        placeholder.textContent = `第 ${i + 1} 页`;

        // 页码标签
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

      // 观察所有页面（dataslide-index 通过 canvas 传递到 page）
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

      // ── 统一缩放（直接修改 Canvas/占位 CSS 尺寸，影响布局）──
      let _resizeGuard = false;

      const applyZoom = () => {
        _resizeGuard = true;
        slidePages.forEach(slide => {
          const w = Math.round(initSize.styleW * _pptxScale);
          const h = Math.round(initSize.styleH * _pptxScale);
          slide.canvas.style.width = `${w}px`;
          slide.canvas.style.height = `${h}px`;
          slide.placeholder.style.width = `${w}px`;
          slide.placeholder.style.height = `${h}px`;
        });
        if (zoomLevelEl) {
          zoomLevelEl.textContent = `${Math.round(_pptxScale * 100)}%`;
        }
        // 跳过缩放触发的 ResizeObserver 反馈循环
        setTimeout(() => { _resizeGuard = false; }, 60);
      };

      // ── 窗口 resize 重新适配（仅改 CSS 尺寸，不改像素缓冲，避免清空 Canvas）──
      let _resizeTimer;
      const resizeObserver = new ResizeObserver(() => {
        if (_resizeGuard) return;
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
          const newSize = calcCanvasSize();
          slidePages.forEach(slide => {
            if (slide.rendered) {
              const w = Math.round(newSize.styleW * _pptxScale);
              const h = Math.round(newSize.styleH * _pptxScale);
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
          _pptxScale = Math.min(MAX_SCALE, _pptxScale * (1 + ZOOM_STEP));
        } else if (action === 'zoom-out') {
          _pptxScale = Math.max(MIN_SCALE, _pptxScale * (1 - ZOOM_STEP));
        } else if (action === 'reset') {
          _pptxScale = 1;
        }
        applyZoom();
      });

      // ── Ctrl + 滚轮缩放 ──
      scrollWrap.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -1 : 1;
          _pptxScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, _pptxScale * (1 + delta * ZOOM_STEP)));
          applyZoom();
        }
      }, { passive: false });

      // ── 键盘快捷键（仅缩放） ──
      const keyHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
          e.preventDefault();
          _pptxScale = Math.min(MAX_SCALE, _pptxScale * (1 + ZOOM_STEP));
          applyZoom();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
          e.preventDefault();
          _pptxScale = Math.max(MIN_SCALE, _pptxScale * (1 - ZOOM_STEP));
          applyZoom();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
          e.preventDefault();
          _pptxScale = 1;
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
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>PPTX 解析失败: ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== PPTX 预览（Silurus @silurus/ooxml）====================

  /**
   * 使用 @silurus/ooxml 的 PptxScrollViewer 渲染 PPTX 预览。
   * 内置虚拟滚动 + 缩放 + 文字选取，替代自定义滚动容器实现。
   */
  async showPptxSilurus(filePath, _forceRefresh) {
    const encodedPath = encodeURIComponent(filePath);
    const cacheBust = _forceRefresh ? `&_t=${Date.now()}` : '';
    const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

    const ZOOM_STEP = 0.15;
    const MIN_SCALE = 0.25;
    const MAX_SCALE = 4;

    try {
      this._container.innerHTML = `<div class="file-binary-preview loading">加载 PPTX 文件中（Silurus 引擎）...</div>`;

      const container = this._container;
      container.innerHTML = '';
      container.style.position = 'relative';

      // 浮动缩放工具栏
      const toolbar = document.createElement('div');
      toolbar.className = 'pptx-toolbar';
      toolbar.innerHTML = `
        <button class="pptx-zoom-btn" data-action="zoom-out" title="缩小">−</button>
        <button class="pptx-zoom-btn" data-action="zoom-in" title="放大">+</button>
        <button class="pptx-zoom-btn pptx-zoom-reset" data-action="reset" title="适配宽度">⟲</button>
        <span class="pptx-zoom-level">100%</span>
      `;
      container.appendChild(toolbar);

      const zoomLevelEl = toolbar.querySelector('.pptx-zoom-level');

      // 自定义缩放：禁用内置 zoom，用自定义步进
      const applyZoom = (direction) => {
        const cur = viewer.getScale();
        const next = direction > 0
          ? Math.min(MAX_SCALE, cur * (1 + ZOOM_STEP))
          : Math.max(MIN_SCALE, cur * (1 - ZOOM_STEP));
        viewer.setScale(next);
      };

      const sessionGen = container.dataset.sessionGen;

      const viewer = await createPptxScrollViewer(container, url, {
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

      updateStatusbarText(`PPTX (Silurus) · ${viewer.slideCount} 页`);
      container._silurusPres = viewer;

      const cleanupObserver = new MutationObserver(() => {
        if (!document.body.contains(container)) {
          cleanupObserver.disconnect();
          try { viewer.destroy(); } catch {}
        }
      });
      cleanupObserver.observe(document.body, { childList: true, subtree: true });

    } catch (err) {
      console.error('BinaryPreview: Silurus pptx parse failed', filePath, err);
      this._container.innerHTML = `<div class="file-preview-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>PPTX 解析失败 (Silurus): ${escapeHtml(err.message)}</p>
      </div>`;
      this._onError(err);
    }
  }

  // ==================== HTML Web 预览 ====================

  /**
   * 渲染 HTML 文件预览 — 通过 iframe 加载渲染后的页面效果。
   *
   * 工具栏包含文件名和"在浏览器中打开"按钮。
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

    // 绑定"在浏览器中打开"按钮
    const openBtn = this._container.querySelector('.web-preview-open-btn');
    if (openBtn && window.HippoDesktop && window.HippoDesktop.openExternal) {
      openBtn.addEventListener('click', () => {
        window.HippoDesktop.openExternal(url).catch(() => {
          window.open(url, '_blank');
        });
      });
    } else if (openBtn) {
      // Web 端降级：直接 window.open
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
      detail = serverMsg || '文件大小超过预览上限（50MB），请在本地打开';
    } else if (status === 404) {
      title = '文件未找到';
      detail = serverMsg || '文件可能已被移动或删除';
    } else if (status === 400) {
      title = '请求错误';
      detail = serverMsg || '无效的文件路径';
    } else if (status >= 500) {
      title = '服务器错误';
      detail = serverMsg || '服务器处理文件时出错，请稍后重试';
    } else {
      detail = serverMsg || `请求失败（HTTP ${status}）`;
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
