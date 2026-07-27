import { escapeHtml } from '../../utils.js';
import { parseToolArgs } from './shared.js';

// i18n 辅助函数
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

export function renderDefaultToolCard(tool) {
  let argsDisplay = '';
  if (tool.args) {
    try {
      const parsed = typeof tool.args === 'string' ? JSON.parse(tool.args) : tool.args;
      argsDisplay = `<div class="detail-row"><span class="detail-label">${_t('tool.default.parameters')}</span><span class="detail-value">${escapeHtml(JSON.stringify(parsed, null, 2))}</span></div>`;
    } catch (e) {
      argsDisplay = `<div class="detail-row"><span class="detail-label">${_t('tool.default.parameters')}</span><span class="detail-value">${escapeHtml(String(tool.args))}</span></div>`;
    }
  }

  let resultDisplay = '';
  if (tool.resultContent) {
    resultDisplay = `<div class="detail-row"><span class="detail-label">${_t('tool.default.result')}</span><span class="detail-value tool-result-content">${escapeHtml(tool.resultContent)}</span></div>`;
  }

  const cancelSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
  const warnSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  const wrenchSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z"/><line x1="10" y1="6" x2="12" y2="4"/></svg>';
  const checkSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
  const xSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
  const spinnerSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';

  let statusDisplay = '';
  if (tool.result === 'success') statusDisplay = `${checkSvg} ${_t('tool.default.success')}`;
  else if (tool.result === 'error') statusDisplay = `${xSvg} ${_t('tool.default.failed')}`;
  else if (tool.result === 'cancelled') statusDisplay = `${cancelSvg} ${_t('tool.default.cancelled')}`;
  else if (tool.result === 'interrupted') statusDisplay = `${warnSvg} ${_t('tool.default.interrupted')}`;
  else statusDisplay = `${spinnerSvg} ${_t('tool.default.running')}`;

  return `
    <div class="tool-call-card">
      <div class="tool-call-header">
        <span class="tool-icon">${wrenchSvg}</span>
        <span class="tool-name">${escapeHtml(tool.name)}</span>
        <span class="tool-status ${tool.result || 'running'}">${statusDisplay}</span>
        <span class="arrow"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 12 10 8 6 4"/></svg></span>
      </div>
      <div class="tool-call-details">
        ${argsDisplay}
        ${resultDisplay}
        ${tool.error ? `<div class="detail-row"><span class="detail-label">${_t('tool.default.error')}</span><span class="detail-value" style="color: var(--error-color);">${escapeHtml(tool.error)}</span></div>` : ''}
      </div>
    </div>
  `;
}

export function renderDefaultToolDetail(tool) {
  let html = '';
  if (tool.resultContent) {
    html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(tool.resultContent)}</code></pre></div>`;
  } else {
    const args = parseToolArgs(tool.args);
    const entries = Object.entries(args).slice(0, 3);
    if (entries.length > 0) {
      html += '<div class="timeline-detail-meta">';
      html += entries.map(([k, v]) => {
        const val = typeof v === 'string' && v.length > 120 ? v.substring(0, 120) + '...' : v;
        return `<span class="timeline-detail-arg"><span class="arg-key">${escapeHtml(k)}</span><span class="arg-val">${escapeHtml(typeof val === 'string' ? val : JSON.stringify(val))}</span></span>`;
      }).join('');
      html += '</div>';
    }
  }
  return html;
}
