/**
 * SpreadsheetPreview — SheetJS 表格/CSV 预览
 *
 * 负责 XLSX / XLS / CSV 文件的解析和 HTML 表格渲染。
 * 依赖全局 window.XLSX（SheetJS）。
 */

import { escapeHtml, updateStatusbarText, isCsvFile } from './shared.js';

// ==================== CSV 编码检测与解码 ====================

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

// ==================== 表格渲染 ====================

const MAX_TOTAL_ROWS = 1000;
const DISPLAY_ROWS = 100;

/**
 * 通过 SheetJS 将表格文件渲染为 HTML 表格
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件路径
 * @param {boolean} [forceRefresh] - 是否强制刷新
 * @param {Function} [onError] - 错误回调 (err) => void
 */
export async function renderSpreadsheet(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      await showHttpError(container, resp, filePath, onError);
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
    container.innerHTML = html;

    // 更新全局状态栏
    if (isCsvFile(filePath)) {
      const enc = detectCSVEncoding(arrayBuffer);
      updateStatusbarText(`CSV · ${enc}`);
    } else {
      const ext = filePath.split('.').pop().toUpperCase();
      updateStatusbarText(`${ext} · ${workbook.SheetNames.length} sheet${workbook.SheetNames.length > 1 ? 's' : ''}`);
    }

    const tabs = container.querySelectorAll('.sheet-tab');
    const wrap = container.querySelector('.spreadsheet-table-wrap');
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
    container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>表格解析失败: ${escapeHtml(err.message)}</p>
    </div>`;
    if (onError) onError(err);
  }
}

/**
 * 显示 HTTP 错误提示（内部使用，避免与 BinaryPreview 耦合）
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
