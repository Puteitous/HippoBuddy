import { escapeHtml } from '../../utils.js';
import { parseToolArgs } from './shared.js';

// i18n 辅助函数
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

/**
 * 翻译后端返回的 riskReason。
 * 后端以 "i18n:key:param=value" 格式返回 i18n key，
 * 前端解析并翻译；不带前缀的旧格式原样返回。
 */
function translateRiskReason(reason) {
    if (!reason || !reason.startsWith('i18n:')) return reason;
    const body = reason.substring(5);
    const colonIdx = body.indexOf(':');
    const key = colonIdx > 0 ? body.substring(0, colonIdx) : body;
    const params = {};
    if (colonIdx > 0) {
        for (const seg of body.substring(colonIdx + 1).split(':')) {
            const eqIdx = seg.indexOf('=');
            if (eqIdx > 0) {
                params[seg.substring(0, eqIdx)] = decodeURIComponent(seg.substring(eqIdx + 1));
            }
        }
    }
    const translated = _t(key, params);
    return translated === key ? reason : translated;
}

/**
 * 解析 BashTool 后端返回的结果文本（BashTool.formatResult 格式）：
 *   命令执行结果
 *   命令: xxx
 *   工作目录: xxx
 *   退出码: 0 成功
 *   执行时间: 123 ms
 *   输出:
 *   <实际命令输出内容>
 *
 * 兼容中英文标记（输出:/Output: 及全角冒号），并按实际匹配长度偏移，
 * 修复原先硬编码 +3 字符偏移在英文界面下截取错位的问题。
 *
 * @returns {{output: string, exitCode: number|null, exitSuccess: boolean, duration: number|null,
 *            terminateFailed: boolean, pid: string|null, remedy: string|null}}
 */
function parseBashResultContent(resultContent) {
  const empty = { output: '', exitCode: null, exitSuccess: true, duration: null, terminateFailed: false, pid: null, remedy: null };
  if (!resultContent) return empty;

  const lines = resultContent.split('\n');
  let output = '';
  let exitCode = null;
  let exitSuccess = true;
  let duration = null;
  let terminateFailed = false;
  let pid = null;
  let remedy = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('终止失败')) {
      terminateFailed = true;
    }
    if (line.startsWith(_t('tool.bash.exitCode')) || line.startsWith('Exit Code:') || line.startsWith('退出代码:')) {
      // 支持负退出码（如 -1 表示终止失败）
      const match = line.match(/(-?\d+)/);
      if (match) exitCode = match[1];
      exitSuccess = line.includes(_t('tool.bash.success')) || line.includes('success') || line.includes('成功');
    } else if (line.startsWith(_t('tool.bash.execTime')) || line.startsWith('Execution Time:') || line.startsWith('执行时间:')) {
      const match = line.match(/(\d+)\s*ms/);
      if (match) duration = match[1];
    }
    const pidMatch = line.match(/进程\s*PID[:：]\s*(\d+)/);
    if (pidMatch) {
      pid = pidMatch[1];
    }
    if (line.includes('taskkill')) {
      // 只保留 taskkill 命令本身（去掉前缀"补救: 请在系统终端执行:"）
      const idx = line.indexOf('taskkill');
      remedy = line.substring(idx).trim();
    }
  }

  // 定位输出标记行（输出:/输出：/Output:/Output：），取第一个匹配行
  const outputMarker = resultContent.match(/^(?:输出:|输出：|Output:|Output：)/m);
  if (outputMarker) {
    const markerStart = outputMarker.index;
    const markerLen = outputMarker[0].length;
    output = resultContent.substring(markerStart + markerLen);
    // 去掉可能跟随的分隔线（──）
    output = output.replace(/^[─]+/, '').trim();
    const endMarker = output.lastIndexOf('──');
    if (endMarker >= 0) output = output.substring(0, endMarker).trim();
  }

  return { output, exitCode, exitSuccess, duration, terminateFailed, pid, remedy };
}

export function renderBashCard(tool) {
  const isPendingConfirm = !!(tool.confirmationData);

  // 待确认状态：显示确认 UI
  if (isPendingConfirm) {
    return renderBashConfirmCard(tool);
  }

  const args = parseToolArgs(tool.args);
  const command = args.command || '';
  const workingDir = args.working_dir || '';
  const { output, exitCode, exitSuccess, duration, terminateFailed, pid, remedy } = parseBashResultContent(tool.resultContent);
  const isSuccess = tool.result === 'success';
  const isError = tool.result === 'error';
  const isRunning = !tool.result;
  const isCancelled = tool.result === 'cancelled';
  const isInterrupted = tool.result === 'interrupted';

  const statusSvg = isSuccess
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>'
    : isError
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
    : isCancelled
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>'
    : isInterrupted
    ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>'
    : '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
  const statusText = terminateFailed ? _t('tool.bash.terminateFailed')
    : isSuccess ? _t('tool.bash.success')
    : isError ? _t('tool.bash.failed')
    : isCancelled ? _t('tool.bash.cancelled')
    : isInterrupted ? _t('tool.bash.interrupted')
    : _t('tool.bash.running');
  const statusClass = terminateFailed ? 'error' : isSuccess ? 'success' : isError ? 'error' : isCancelled ? 'cancelled' : isInterrupted ? 'interrupted' : 'running';

  const terminalSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="12" y2="12"/></svg>';
  const folderSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>';
  const exitSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 3 13 3 11 6 13 9 4 9"/></svg>';

  return `
    <div class="tool-card bash-card">
      <div class="tool-header">
        <span class="tool-icon">${terminalSvg}</span>
        <span class="tool-title">${_t('tool.bash.title')}</span>
        <span class="tool-status-badge ${isSuccess ? 'success' : isError ? 'error' : isCancelled ? 'cancelled' : isInterrupted ? 'interrupted' : 'running'}">${statusSvg} ${statusText}</span>
        <span class="arrow"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 12 10 8 6 4"/></svg></span>
      </div>
      <div class="tool-call-details">
        <div class="bash-command">${escapeHtml(command)}</div>
        ${workingDir ? `<div class="bash-meta" data-file-path="${escapeHtml(workingDir)}">${folderSvg} ${escapeHtml(workingDir)}</div>` : ''}
        ${exitCode !== null ? `<div class="bash-meta">${exitSvg} ${_t('tool.bash.exitCode')} ${exitCode} ${duration ? `| ⏱ ${duration}ms` : ''}</div>` : ''}
        ${terminateFailed ? `<div class="bash-terminate-failed">
          <div class="bash-terminate-failed-title">⚠️ ${_t('tool.bash.terminateFailedHint')}</div>
          ${pid ? `<div class="bash-meta">${_t('tool.bash.pid')}: <code>${escapeHtml(pid)}</code></div>` : ''}
          ${remedy ? `<div class="bash-meta">${_t('tool.bash.remedy')}: <code>${escapeHtml(remedy)}</code></div>` : ''}
        </div>` : ''}
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
  const riskLabel = riskLevel === 'high' ? _t('tool.bash.highRisk') : riskLevel === 'low' ? _t('tool.bash.lowRisk') : _t('tool.bash.mediumRisk');
  const riskSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  const terminalSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="12" y2="12"/></svg>';

  return `
    <div class="tool-card bash-card">
      <div class="tool-header expanded">
        <span class="tool-icon">${terminalSvg}</span>
        <span class="tool-title">${_t('tool.bash.title')}</span>
        <span class="tool-status-badge pending_confirmation">${riskSvg} ${_t('tool.bash.waitConfirm')}</span>
        <span class="arrow">▶</span>
      </div>
      <div class="tool-call-details show">
        <div class="bash-command">${escapeHtml(cmd)}</div>
        <div class="confirmation-body">
          ${riskReason ? `<div class="confirmation-reason">${escapeHtml(translateRiskReason(riskReason))}</div>` : ''}
          <div class="confirmation-footer">
            <div class="confirmation-buttons">
              <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.bash.deny')}</button>
              <button class="confirmation-btn allow" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.bash.execute')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderBashDetail(tool) {
  const { output, exitCode, exitSuccess, duration, terminateFailed, pid, remedy } = parseBashResultContent(tool.resultContent);

  let html = '';
  if (terminateFailed) {
    html += `<div class="bash-terminate-failed">
      <div class="bash-terminate-failed-title">⚠️ ${_t('tool.bash.terminateFailedHint')}</div>
      ${pid ? `<div class="bash-meta">${_t('tool.bash.pid')}: <code>${escapeHtml(pid)}</code></div>` : ''}
      ${remedy ? `<div class="bash-meta">${_t('tool.bash.remedy')}: <code>${escapeHtml(remedy)}</code></div>` : ''}
    </div>`;
  }
  if (output) {
    html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(output)}</code></pre></div>`;
  }
  if (exitCode !== null) {
    const successSvg = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
    const errorSvg = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
    const exitIcon = exitSuccess ? successSvg : errorSvg;
    const exitLabel = `${_t('tool.bash.exitCode')} ${exitCode}`;
    html += `<div class="timeline-detail-meta"><span class="timeline-detail-exit ${exitSuccess ? 'success' : 'error'}">${exitIcon} ${exitLabel}</span>${duration ? `<span class="timeline-detail-duration">⏱ ${duration}ms</span>` : ''}</div>`;
  }
  if (!html && tool.resultContent) {
    html = `<div class="timeline-detail-output"><pre><code>${escapeHtml(tool.resultContent)}</code></pre></div>`;
  }
  return html;
}
