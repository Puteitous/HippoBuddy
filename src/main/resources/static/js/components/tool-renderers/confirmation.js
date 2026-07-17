import { escapeHtml } from '../../utils.js';

// i18n 辅助函数
const _t = (key) => window.i18n ? window.i18n.t(key) : key;

export function renderConfirmationDetail(tool) {
  const data = tool.confirmationData;
  const cmd = data.command || '';
  const riskLevel = data.riskLevel || 'medium';
  const riskReason = data.riskReason || '';
  const riskLabel = riskLevel === 'high' ? _t('tool.confirm.highRisk') : riskLevel === 'low' ? _t('tool.confirm.lowRisk') : _t('tool.confirm.mediumRisk');
  const riskSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';

  return `
    <div class="timeline-detail-confirmation ${riskLevel}">
      <div class="confirmation-header">
        <span class="confirmation-header-icon">${riskSvg}</span>
        <span class="confirmation-header-title">${_t('tool.confirm.title')}</span>
        <span class="risk-badge">${riskLabel}</span>
      </div>
      <div class="confirmation-body">
        <div class="confirmation-command"><pre><code>${escapeHtml(cmd)}</code></pre></div>
        ${riskReason ? `<div class="confirmation-reason">${escapeHtml(riskReason)}</div>` : ''}
        <div class="confirmation-footer">
          <label class="confirmation-auto-allow">
            <input type="checkbox" class="auto-allow-checkbox" data-confirm-id="${escapeHtml(data.confirmId)}">
            <span>${_t('tool.confirm.dontAskAgain')}</span>
          </label>
          <div class="confirmation-buttons">
            <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.confirm.deny')}</button>
            <button class="confirmation-btn allow" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.confirm.execute')}</button>
          </div>
        </div>
      </div>
    </div>`;
}
