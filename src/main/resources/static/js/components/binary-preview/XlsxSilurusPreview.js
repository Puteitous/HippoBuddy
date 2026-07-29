/**
 * XlsxSilurusPreview — @silurus/ooxml XLSX 预览
 *
 * 使用 Silurus 引擎的 Canvas 渲染，保留单元格样式/图表/格式。
 * 与 SheetJS 版本的 HTML 表格渲染不同，此模块直接挂载 XlsxViewer 到容器。
 */

import { createXlsxViewer } from '../ooxml-bridge.js';
import { escapeHtml, updateStatusbarText } from './shared.js';

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

/**
 * 使用 @silurus/ooxml 渲染 XLSX 预览
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件路径
 * @param {boolean} [forceRefresh] - 是否强制刷新
 * @param {Function} [onError] - 错误回调 (err) => void
 */
export async function renderXlsxSilurus(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  let _sheetNames = [];
  let _currentSheetName = '';

  let _sessionGen;

  try {
    container.innerHTML = `<div class="file-binary-preview loading">加载 XLSX 文件中（Silurus 引擎）...</div>`;

    // 清理容器，留给 XlsxViewer 管理
    container.innerHTML = '';
    container.style.position = 'relative';

    _sessionGen = container.dataset.sessionGen;

    const updateStatusbarSimple = () => {
      const count = _sheetNames.length;
      updateStatusbarText(`XLSX (Silurus) · ${count} sheet(s)`);
    };

    const viewer = await createXlsxViewer(container, url, {
      onReady: (sheetNames) => {
        _sheetNames = sheetNames;
        _currentSheetName = sheetNames[0] ?? '';
        updateStatusbarSimple();
      },
      onSheetChange: (index) => {
        _currentSheetName = _sheetNames[index] ?? '';
        updateStatusbarSimple();
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

    updateStatusbarSimple();
    container._silurusViewer = viewer;

  } catch (err) {
    console.error('BinaryPreview: Silurus xlsx parse failed', filePath, err);
    container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>XLSX 解析失败 (Silurus): ${escapeHtml(err.message)}</p>
    </div>`;
    if (onError) onError(err);
  }
}
