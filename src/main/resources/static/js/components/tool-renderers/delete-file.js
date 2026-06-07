import { escapeHtml } from '../../utils.js';

/**
 * 公共：渲染 delete_file 确认内容（文件列表 + 恢复提示 + 确认按钮）。
 * @param {object} data - confirmationData
 * @param {boolean} forCard - true 时 CSS 类名前缀固定为 delete-file-（在 .tool-card 内），
 *                             false 时加上 .timeline-detail-confirmation 作用域（在时间线内）
 */
function _renderDeleteFileConfirmBody(data) {
  const files = data.files || [];
  const directories = data.directories || [];
  const items = [...files, ...directories.map(d => d + '/')];

  const trashIcon = '<svg class="delete-file-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h10"/><path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6"/></svg>';

  if (items.length === 1) {
    return `
      <div class="delete-file-simple">
        ${trashIcon}
        <span class="delete-file-label">删除:</span>
        <span class="delete-file-path">${escapeHtml(items[0])}</span>
      </div>
      <div class="confirmation-footer">
        <div class="confirmation-buttons">
          <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">保留</button>
          <button class="confirmation-btn allow delete-confirm" data-confirm-id="${escapeHtml(data.confirmId)}">删除</button>
        </div>
      </div>`;
  }

  const fileListHtml = items.map(f => `
    <div class="delete-file-list-item">${escapeHtml(f)}</div>
  `).join('');

  return `
    <div class="delete-file-multi">
      <div class="delete-file-multi-header">
        ${trashIcon}
        <span>删除 <strong>${items.length}</strong> 个文件</span>
      </div>
      <div class="delete-file-multi-list">
        ${fileListHtml}
      </div>
    </div>
    <div class="confirmation-footer">
      <div class="confirmation-buttons">
        <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">保留</button>
        <button class="confirmation-btn allow delete-confirm" data-confirm-id="${escapeHtml(data.confirmId)}">删除</button>
      </div>
    </div>`;
}

/**
 * 渲染 delete_file 工具的确认卡片（tool card 模式）。
 */
export function renderDeleteFileConfirmCard(tool) {
  const data = tool.confirmationData;
  if (!data) return '';

  const deleteSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h10"/><path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6"/></svg>';

  return `
    <div class="tool-card delete-file-card">
      <div class="tool-header">
        <span class="tool-icon">${deleteSvg}</span>
        <span class="tool-title">删除文件</span>
        <span class="tool-status-badge pending_confirmation">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/>
            <line x1="8" y1="5" x2="8" y2="9"/>
            <line x1="8" y1="11" x2="8.01" y2="11"/>
          </svg>
          等待确认
        </span>
        <span class="arrow">▶</span>
      </div>
      <div class="tool-call-details">
        ${_renderDeleteFileConfirmBody(data)}
      </div>
    </div>`;
}

/**
 * 渲染 delete_file 工具的时间线确认详情（时间线模式）。
 */
export function renderDeleteFileConfirmationDetail(tool) {
  const data = tool.confirmationData;
  if (!data) return '';

  return `
    <div class="timeline-detail-confirmation">
      <div class="confirmation-body">
        ${_renderDeleteFileConfirmBody(data)}
      </div>
    </div>`;
}

/**
 * 渲染 delete_file 工具的时间线详情（执行结果）。
 */
export function renderDeleteFileDetail(tool) {
  if (!tool.result) {
    return '<div class="timeline-detail-status">运行中...</div>';
  }

  if (tool.result === 'error' && tool.error) {
    return `<div class="timeline-detail-error">${escapeHtml(tool.error)}</div>`;
  }

  const resultText = typeof tool.result === 'string' ? tool.result : '';
  const lines = resultText.split('\n').filter(l => l.trim());

  // 解析结果：检查是否有成功/失败/跳过的分类
  const deletedLines = [];
  const failedLines = [];
  const skippedLines = [];
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('已删除')) {
      currentSection = 'deleted';
      deletedLines.push(line);
    } else if (line.startsWith('删除失败')) {
      currentSection = 'failed';
      failedLines.push(line);
    } else if (line.startsWith('已跳过') || line.startsWith('路径不存在')) {
      currentSection = 'skipped';
      skippedLines.push(line);
    } else if (line.startsWith('  - ')) {
      if (currentSection === 'deleted') deletedLines.push(line);
      else if (currentSection === 'failed') failedLines.push(line);
      else if (currentSection === 'skipped') skippedLines.push(line);
    }
  }

  let detailHtml = '';

  if (deletedLines.length > 0) {
    const count = deletedLines.length - 1; // 减去标题行
    detailHtml += `<div class="timeline-detail-section success">
      <div class="section-title">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>
        已删除 ${count} 个文件
      </div>
      <pre><code>${deletedLines.join('\n')}</code></pre>
    </div>`;
  }

  if (failedLines.length > 0) {
    detailHtml += `<div class="timeline-detail-section error">
      <div class="section-title">❌ ${failedLines.join('\n')}</div>
    </div>`;
  }

  if (skippedLines.length > 0) {
    detailHtml += `<div class="timeline-detail-section warn">
      <div class="section-title">⚠️ ${skippedLines.join('\n')}</div>
    </div>`;
  }

  return detailHtml || `<pre><code>${escapeHtml(resultText)}</code></pre>`;
}
