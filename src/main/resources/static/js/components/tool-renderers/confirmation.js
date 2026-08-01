import { escapeHtml } from '../../utils.js';

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
        ${riskReason ? `<div class="confirmation-reason">${escapeHtml(translateRiskReason(riskReason))}</div>` : ''}
        <div class="confirmation-footer">
          <div class="confirmation-buttons">
            <button class="confirmation-btn deny" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.confirm.deny')}</button>
            <button class="confirmation-btn allow" data-confirm-id="${escapeHtml(data.confirmId)}">${_t('tool.confirm.execute')}</button>
          </div>
        </div>
      </div>
    </div>`;
}
