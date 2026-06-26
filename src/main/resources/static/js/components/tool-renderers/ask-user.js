import { escapeHtml } from '../../utils.js';

export function parseAskUserArgs(args) {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return {
      question: parsed.question || '',
      options: parsed.options || null,
      allow_custom_input: parsed.allow_custom_input !== false
    };
  } catch (e) {
    return { question: '', options: null, allow_custom_input: true };
  }
}

export function renderAskUserCard(tool) {
  const { question, options } = parseAskUserArgs(tool.args);
  const hasOptions = options && options.length > 0;

  const askIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="10" x2="8" y2="11"/><path d="M6.5 6.5c0-1 1-1.5 1.5-1.5s1.5.5 1.5 1.5c0 1-1.5 1.5-1.5 2.5"/></svg>';

  return `
    <div class="tool-card ask-user-card">
      <div class="tool-header" onclick="window.toggleToolCardDetails(this)">
        <span class="tool-icon">${askIcon}</span>
        <span class="tool-title">需要确认</span>
        <span class="arrow"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 12 6 8 10 4"/></svg></span>
      </div>
      <div class="tool-call-details">
        <div class="question-text">${escapeHtml(question)}</div>
        ${hasOptions ? `
          <div class="options-list">
            ${options.map((opt, i) => `
              <button class="option-btn" data-option="${escapeHtml(opt, true)}">${escapeHtml(opt)}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
