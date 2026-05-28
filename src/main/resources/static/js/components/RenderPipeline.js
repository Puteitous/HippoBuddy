import { renderMarkdown } from '../markdown-renderer.js';
import { escapeHtml } from '../utils.js';

export class RenderPipeline {
  constructor(chatUI, callbacks = {}) {
    this.chatUI = chatUI;

    this._onAfterRender = callbacks.afterRender || null;
    this._onBindAskUserCard = callbacks.bindAskUserCard || null;
    this._onConfirmationClick = callbacks.onConfirmationClick || null;

    this.container = null;

    this._lastRenderTime = 0;
    this._renderThrottleTimer = null;
    this._pendingRender = null;
    this._streamingAnchor = null;
    this._lastSegmentCount = 0;
    this._pendingIsTextOnly = false;
    this._renderVersion = 0;
    this._renderScheduled = false;
    this._destroyed = false;
  }

  setContainer(container) {
    this.container = container;
  }

  markTextOnly() {
    this._pendingIsTextOnly = true;
  }

  scheduleRender(segments, currentText) {
    const THROTTLE_MS = 60;
    const now = Date.now();

    this._pendingRender = { segments, currentText, _isTextOnly: !!this._pendingIsTextOnly };
    this._pendingIsTextOnly = false;

    if (now - this._lastRenderTime >= THROTTLE_MS) {
      this._renderScheduled = false;
      this._lastRenderTime = now;
      this.doRender();
    } else if (!this._renderThrottleTimer) {
      const remaining = THROTTLE_MS - (now - this._lastRenderTime);
      this._renderScheduled = true;
      this._renderThrottleTimer = setTimeout(() => {
        this._renderThrottleTimer = null;
        this._renderScheduled = false;
        this._lastRenderTime = Date.now();
        this.doRender();
      }, remaining);
    }
  }

  flush(segments, currentText) {
    if (segments) {
      this._pendingRender = { segments, currentText, _isTextOnly: false };
    }
    if (this._renderScheduled) {
      return;
    }
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    if (this._pendingRender) {
      this._pendingRender._isTextOnly = false;
      this._lastRenderTime = Date.now();
      this.doRender();
    }
  }

  async renderFinal(segments, currentText) {
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = { segments, currentText };
    await this.doRender();
  }

  async doRender() {
    if (this._destroyed) return;
    this._renderVersion++;
    const renderVersion = this._renderVersion;
    const pending = this._pendingRender;
    if (!pending) return;
    this._pendingRender = null;

    const { segments, currentText, _isTextOnly } = pending;
    const container = this.container;
    if (!container) return;

    if (_isTextOnly && this._streamingAnchor && this._streamingAnchor.isConnected &&
        this._lastSegmentCount === segments.length) {
      if (currentText) {
        this._streamingAnchor.innerHTML = await renderMarkdown(currentText);
        if (this._destroyed) return;
      } else {
        this._streamingAnchor.innerHTML = '';
      }
      this._notifyAfterRender(container);
      return;
    }

    this._lastSegmentCount = segments.length;

    const chatContainer = this.container.closest('.chat-container') || this.container;
    const savedScrollTop = chatContainer.scrollTop;

    let html = '';
    let toolTimelineHtml = '';

    const flushToolTimeline = () => {
      if (toolTimelineHtml) {
        html += `<div class="tool-timeline">${toolTimelineHtml}</div>`;
        toolTimelineHtml = '';
      }
    };

    for (const segment of segments) {
      if (segment.type === 'thinking') {
        flushToolTimeline();
        html += RenderPipeline.renderThinkingBubble(segment);
      } else if (segment.type === 'tool') {
        if (segment.name === 'todo_write' || segment.name === 'ask_user') {
          flushToolTimeline();
          html += this.chatUI.renderToolCard(segment);
        } else {
          toolTimelineHtml += this.chatUI.renderToolTimelineRow(segment);
        }
      } else if (segment.type === 'text' && segment.content) {
        flushToolTimeline();
        html += await renderMarkdown(segment.content);
        if (this._destroyed || renderVersion !== this._renderVersion) return;
      }
    }
    flushToolTimeline();

    html += `<div class="streaming-region">`;
    if (currentText) {
      html += await renderMarkdown(currentText);
    }
    html += `</div>`;

    if (this._destroyed || renderVersion !== this._renderVersion) return;

    const savedStates = this._saveCardStates(container);

    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'contents';
    tempDiv.innerHTML = html;

    const animEls = tempDiv.querySelectorAll('.tool-timeline-detail, .thinking-row-content, .tool-card .tool-call-details');
    for (const el of animEls) {
      el.dataset._trans = el.style.transition || '';
      el.style.transition = 'none';
    }

    this._restoreCardStates(tempDiv, savedStates);

    for (const el of animEls) {
      el.style.transition = el.dataset._trans;
      delete el.dataset._trans;
    }

    if (renderVersion !== this._renderVersion) return;
    container.replaceChildren(...tempDiv.children);

    this._streamingAnchor = container.querySelector('.streaming-region');

    chatContainer.scrollTop = savedScrollTop;

    const streamingRow = container.querySelector('.thinking-row.streaming .thinking-row-content');
    if (streamingRow) {
      streamingRow.scrollTop = streamingRow.scrollHeight;
    }

    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      if (this.chatUI.bindToolCardEvents) {
        this.chatUI.bindToolCardEvents(card);
      }
    });

    container.querySelectorAll('.ask-user-card').forEach(card => {
      if (this._onBindAskUserCard) this._onBindAskUserCard(card);
    });

    container.querySelectorAll('.confirmation-btn').forEach(btn => {
      if (this._onConfirmationClick) {
        btn.addEventListener('click', this._onConfirmationClick);
      }
    });

    this._notifyAfterRender(container);
  }

  _notifyAfterRender(container) {
    if (this._onAfterRender) {
      this._onAfterRender(container);
    }
  }

  _saveCardStates(container) {
    const states = new Map();

    container.querySelectorAll('.thinking-row.completed').forEach((bubble, idx) => {
      states.set(`thinking:${idx}`, {
        expanded: bubble.classList.contains('expanded')
      });
    });

    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      const header = card.querySelector('.tool-header, .tool-call-header');
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      const isExpanded = card.classList.contains('expanded') || header?.classList.contains('expanded') || false;
      states.set(`tool:${name}:${card.dataset.expandedKey || ''}`, {
        expanded: isExpanded || false
      });
    });

    container.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const name = item.dataset.toolName || 'unknown';
      states.set(`timeline:${name}:${idx}`, {
        expanded: item.classList.contains('expanded')
      });
    });

    return states;
  }

  _restoreCardStates(container, states) {
    if (!states || states.size === 0) return;

    container.querySelectorAll('.thinking-row.completed').forEach((bubble, idx) => {
      const thinkingState = states.get(`thinking:${idx}`);
      if (thinkingState?.expanded) {
        bubble.classList.add('expanded');
        const content = bubble.querySelector('.thinking-row-content');
        if (content) {
          const h = content.scrollHeight;
          const isCapped = h > 300;
          content.style.maxHeight = (h > 0 ? (isCapped ? '300px' : h + 'px') : '9999px');
          content.style.overflowY = isCapped ? 'auto' : '';
        }
      }
    });

    container.querySelectorAll('.tool-card, .tool-call-card').forEach((card, idx) => {
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      const key = `tool:${name}:${card.dataset.expandedKey || ''}`;
      const saved = states.get(key);

      if (saved?.expanded) {
        if (card.classList.contains('tool-card')) {
          card.classList.add('expanded');
          const details = card.querySelector('.tool-call-details');
          if (details) {
            const h = details.scrollHeight;
            details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
          }
        } else {
          const header = card.querySelector('.tool-header, .tool-call-header');
          const details = header?.nextElementSibling;
          header?.classList.add('expanded');
          details?.classList.add('show');
        }
      }
    });

    container.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const name = item.dataset.toolName || 'unknown';
      const saved = states.get(`timeline:${name}:${idx}`);
      const isPendingConfirm = item.dataset.toolStatus === 'pending_confirmation';
      const isCancelled = item.dataset.toolStatus === 'cancelled' || item.dataset.toolStatus === 'interrupted';
      if ((saved?.expanded || isPendingConfirm) && !isCancelled) {
        item.classList.add('expanded');
        const detail = item.querySelector('.tool-timeline-detail');
        if (detail) {
          const h = detail.scrollHeight;
          detail.style.maxHeight = h > 0 ? h + 'px' : '9999px';
        }
      }
    });
  }

  static renderThinkingBubble(segment) {
    const normalized = segment.content.replace(/\n{2,}/g, '\n');
    const escapedContent = escapeHtml(normalized);
    const thinkSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';

    if (segment.done) {
      return `
        <div class="thinking-row completed">
          <div class="thinking-row-header" onclick="window.toggleThinkingRow(this)">
            <span class="thinking-row-icon">${thinkSvg}</span>
            <span class="thinking-row-label">已思考</span>
          </div>
          <div class="thinking-row-content">${escapedContent}</div>
        </div>`;
    }

    return `
      <div class="thinking-row streaming">
        <div class="thinking-row-header">
          <span class="thinking-row-icon">${thinkSvg}</span>
          <span class="thinking-row-label">思考中...</span>
        </div>
        <div class="thinking-row-content">${escapedContent}</div>
      </div>`;
  }

  destroy() {
    this._destroyed = true;
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = null;
    this.container = null;
  }
}
