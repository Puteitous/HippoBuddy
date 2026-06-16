import { escapeHtml } from '../../utils.js';
import { parseToolArgs, computeUnifiedDiff, renderUnifiedDiff } from './shared.js';

export function renderWriteFileCard(tool) {
  const args = parseToolArgs(tool.args);
  const filePath = args.path || '';
  const content = args.content || '';
  const isSuccess = tool.result === 'success';
  const isError = tool.result === 'error';
  const isRunning = !tool.result;

  const diffLines = computeUnifiedDiff('', content);
  let insertions = 0;
  for (const line of diffLines) {
    if (line.type === 'added') insertions++;
  }

  const fileSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/></svg>';
  const xSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
  const spinnerSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
  const pendingSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

  let statusHtml;
  let statusClass;
  if (isRunning) {
    statusHtml = `${spinnerSvg} 执行中`;
    statusClass = 'running';
  } else if (isSuccess) {
    statusHtml = `<span class="diff-stats-badge"><span class="diff-add">+${insertions}</span></span>`;
    statusClass = 'success';
  } else {
    statusHtml = `${xSvg} 失败`;
    statusClass = 'error';
  }

  return `
    <div class="tool-card writefile-card" data-file-path="${escapeHtml(filePath)}" data-review-status="pending" data-tool-call-id="${tool.id}">
      <div class="tool-header">
        <span class="tool-icon">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path d="M9 2v3h3"/>
          </svg>
        </span>
        <span class="tool-title">写入文件</span>
        <span class="tool-status-badge ${statusClass}">${statusHtml}</span>
        <span class="arrow">▶</span>
      </div>
      <div class="tool-call-details">
        <div class="writefile-path">${fileSvg} ${escapeHtml(filePath)}</div>
        ${isRunning ? '<div class="editfile-loading">正在写入文件...</div>' : ''}
        ${isSuccess ? `
        <div class="editfile-diff">
          ${renderUnifiedDiff(diffLines)}
        </div>
        <div class="file-action-bar">
          <span class="file-action-status pending">${pendingSvg} 已生效</span>
          <button class="file-action-btn view-btn">查看变更</button>
          <button class="file-action-btn undo-btn">撤销</button>
        </div>` : ''}
        ${isError && tool.error ? `<div class="writefile-error">${escapeHtml(tool.error)}</div>` : ''}
      </div>
    </div>
  `;
}

export function renderWriteFileDetail(tool) {
  const args = parseToolArgs(tool.args);
  const content = args.content || '';
  const diffLines = computeUnifiedDiff('', content);

  let html = `<div class="timeline-detail-diff">`;
  html += renderUnifiedDiff(diffLines);
  html += `</div>`;
  return html;
}
