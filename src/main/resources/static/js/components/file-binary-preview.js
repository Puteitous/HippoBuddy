/**
 * BinaryPreview — 二进制文件预览组件
 *
 * 负责图片/PDF、表格（XLSX/XLS/CSV）、DOCX 等二进制文件的只读预览。
 * 被 FilePreview 委托调用。
 *
 * 依赖的外部库（通过 &lt;script&gt; 标签在 HTML 中加载）：
 *   - js/vendor/xlsx.js（SheetJS）
 *   - js/vendor/mammoth.js
 */

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

// ==================== 工具函数 ====================

/** 转义 HTML 特殊字符 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 格式化字节数 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
}

/** 判断是否为 CSV 文件 */
function isCsvFile(filePath) {
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
      this._container.innerHTML = `
        <div class="file-binary-preview image">
          <div class="img-zoom-toolbar">
            <button class="img-zoom-btn" data-action="zoom-out" title="缩小">−</button>
            <span class="img-zoom-level">100%</span>
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
    const levelEl = this._container.querySelector('.img-zoom-level');
    if (!img || !viewport) return;

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
      levelEl.textContent = `${Math.round(scale * 100)}%`;
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
      scale = 1;
      translateX = 0;
      translateY = 0;
      img.style.transition = 'transform 0.2s ease';
      applyTransform();
      setTimeout(() => { img.style.transition = ''; }, 200);
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
  }

  // ==================== 表格预览（XLSX / XLS / CSV）====================

  /** 通过 SheetJS 将表格文件渲染为 HTML 表格 */
  async showSpreadsheet(filePath) {
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;

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

      const fileName = filePath.split('/').pop() || '';
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const firstRender = renderSheetTable(sheet, 0);

      let html = `<div class="file-spreadsheet-preview">

        <div class="spreadsheet-info">
          <span class="file-name">${escapeHtml(fileName)}</span>
          <span class="sheet-count">
            ${workbook.SheetNames.length} 个 sheet · ${sheetName}（激活）
          </span>
          ${firstRender.isOverflow
            ? `<span class="spreadsheet-size-warn" title="文件过大，仅显示前 ${DISPLAY_ROWS} 行">
                 ${escapeHtml(formatFileSize(arrayBuffer.byteLength))}
               </span>`
            : `<span class="spreadsheet-size">${escapeHtml(formatFileSize(arrayBuffer.byteLength))}</span>`}
        </div>`;

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

      const tabs = this._container.querySelectorAll('.sheet-tab');
      const wrap = this._container.querySelector('.spreadsheet-table-wrap');
      const infoSpan = this._container.querySelector('.spreadsheet-info .sheet-count');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const idx = parseInt(tab.dataset.sheetIndex, 10);
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const name = workbook.SheetNames[idx];
          const s = workbook.Sheets[name];
          const rendered = renderSheetTable(s, idx);
          wrap.innerHTML = rendered.html;

          if (infoSpan) {
            infoSpan.textContent = `${workbook.SheetNames.length} 个 sheet · ${name}（激活）`;
          }
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

  // ==================== DOCX 预览 ====================

  /** 通过 mammoth.js 将 DOCX 渲染为 HTML */
  async showDocx(filePath) {
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;

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
          <div class="docx-info">
            <span class="file-name">${escapeHtml(filePath.split('/').pop() || '')}</span>
            ${result.messages && result.messages.length > 0
              ? `<span class="docx-warning light"
                     title="${escapeHtml(result.messages.map(m => m.message).join('\n'))}">
                   ⚠ ${result.messages.length} 条样式警告
                 </span>`
              : ''}
          </div>
          <div class="docx-content">
            ${result.value}
          </div>
        </div>`;

      if (result.messages && result.messages.length > 0) {
        console.info('BinaryPreview: mammoth.js 转换警告:', result.messages);
      }

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
