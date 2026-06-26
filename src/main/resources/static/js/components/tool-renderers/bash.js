import { escapeHtml } from '../../utils.js';
import { parseToolArgs } from './shared.js';

export function renderBashCard(tool) {
  const isPendingConfirm = !!(tool.confirmationData);

  // 待确认状态：显示确认 UI
  if (isPendingConfirm) {
    return renderBashConfirmCard(tool);
  }

  const args = parseToolArgs(tool.args);
  const command = args.command || '';
  const workingDir = args.working_dir || '';
  const isSuccess = tool.result === 'success';
  const isError = tool.result === 'error';
  const isRunning = !tool.result;
  const isCancelled = tool.result === 'cancelled';
  const isInterrupted = tool.result === 'interrupted';

  let output = '';
  let exitCode = null;
  let exitSuccess = true;
  let duration = null;
  if (tool.resultContent) {
    const lines = tool.resultContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('退出码:') || line.startsWith('退出代码:')) {
        const match = line.match(/(\d+)/);
        if (match) exitCode = match[1];
        exitSuccess = line.includes('成功');
      } else if (line.startsWith('执行时间:')) {
        const match = line.match(/(\d+)\s*ms/);
        if (match) duration = match[1];
      }
    }
    const outputStart = tool.resultContent.indexOf('输出:');
    if (outputStart >= 0) {
      output = tool.resultContent.substring(outputStart + 3);
      output = output.replace(/^[─]+/, '').trim();
      const endMarker = output.lastIndexOf('──');
      if (endMarker >= 0) output = output.substring(0, endMarker).trim();
    }
  }

  const statusSvg = isSuccess
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>'
    : isError
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
    : isCancelled
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>'
    : isInterrupted
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>'
    : '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
  const statusText = isSuccess ? '成功' : isError ? '失败' : isCancelled ? '已取消' : isInterrupted ? '中断' : '运行中';

  const terminalSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="12" y2="12"/></svg>';
  const folderSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>';
  const exitSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 3 13 3 11 6 13 9 4 9"/></svg>';

  return `
    <div class="tool-card bash-card">
      <div class="tool-header">
        <span class="tool-icon">${terminalSvg}</span>
        <span class="tool-title">终端命令</span>
        <span class="tool-status-badge ${isSuccess ? 'success' : isError ? 'error' : isCancelled ? 'cancelled' : isInterrupted ? 'interrupted' : 'running'}">${statusSvg} ${statusText}</span>
        <span class="arrow"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 12 10 8 6 4"/></svg></span>
      </div>
      <div class="tool-call-details">
        <div class="bash-command">${escapeHtml(command)}</div>
        ${workingDir ? `<div class="bash-meta" data-file-path="${escapeHtml(workingDir)}">${folderSvg} ${escapeHtml(workingDir)}</div>` : ''}
        ${exitCode !== null ? `<div class="bash-meta">${exitSvg} 退出码: ${exitCode} ${duration ? `| ⏱ ${duration}ms` : ''}</div>` : ''}
        ${output ? `<div class="bash-output"><pre><code>${escapeHtml(output)}</code></pre></div>` : ''}
        ${isError && tool.error ? `<div class="bash-error">${escapeHtml(tool.error)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderBashConfirmCard(tool) {
  const data = tool.confirmationData;
  const cmd = data.command || '';
  const riskLevel = data.riskLevel || 'medium';
  const riskReason = data.riskReason || '';
  const riskLabel = riskLevel === 'high' ? '高风险' : riskLevel === 'low' ? '低风险' : '中风险';
  const riskSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  const terminalSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="12" y2="12"/></svg>';

  return `
    <div class="tool-card bash-card">
      <div class="tool-header">
        <span class="tool-icon">${terminalSvg}</span>
        <span class="tool-title">终端命令</span>
        <span class="tool-status-badge pending_confirmation">${riskSvg} 等待确认</span>
        <span class="arrow">▶</span>
      </div>
      <div class="tool-call-details">
        <div class="bash-command">${escapeHtml(cmd)}</div>
        <div class="confirmation-body">
          ${riskReason ? `<div class="confirmation-reason">${escapeHtml(riskReason)}</div>` : ''}
          <div class="confirmation-footer">
            <label class="confirmation-auto-allow">
              <input type="checkbox" class="auto-allow-checkbox" data-confirm-id="${escapeHtml(data.confirmId)}">
              <span>本次会话不再询问此类命令</span>
            </label>
            <div class="confirmation-buttons">
              <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">拒绝</button>
              <button class="confirmation-btn allow" data-confirm-id="${escapeHtml(data.confirmId)}">执行</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderBashDetail(tool) {
  let output = '';
  let exitCode = null;
  let exitSuccess = true;
  let duration = null;
  if (tool.resultContent) {
    const lines = tool.resultContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('退出码:') || line.startsWith('退出代码:')) {
        const match = line.match(/(\d+)/);
        if (match) exitCode = match[1];
        exitSuccess = line.includes('成功');
      } else if (line.startsWith('执行时间:')) {
        const match = line.match(/(\d+)\s*ms/);
        if (match) duration = match[1];
      }
    }
    const outputStart = tool.resultContent.indexOf('输出:');
    if (outputStart >= 0) {
      output = tool.resultContent.substring(outputStart + 3);
      output = output.replace(/^[─]+/, '').trim();
      const endMarker = output.lastIndexOf('──');
      if (endMarker >= 0) output = output.substring(0, endMarker).trim();
    }
  }

  let html = '';
  if (output) {
    html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(output)}</code></pre></div>`;
  }
  if (exitCode !== null) {
    const successSvg = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
    const errorSvg = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
    const exitIcon = exitSuccess ? successSvg : errorSvg;
    const exitLabel = `退出码: ${exitCode}`;
    html += `<div class="timeline-detail-meta"><span class="timeline-detail-exit ${exitSuccess ? 'success' : 'error'}">${exitIcon} ${exitLabel}</span>${duration ? `<span class="timeline-detail-duration">⏱ ${duration}ms</span>` : ''}</div>`;
  }
  if (!html && tool.resultContent) {
    html = `<div class="timeline-detail-output"><pre><code>${escapeHtml(tool.resultContent)}</code></pre></div>`;
  }
  return html;
}
