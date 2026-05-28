import { showToast } from '../utils/toast.js';
import { escapeHtml } from '../utils.js';

export class RollbackPanel {
  constructor({ chatService, chatPanel, chatContainer, messageInput, onCreateNewSession, onUpdateFileChanges }) {
    this._chatService = chatService;
    this._chatPanel = chatPanel;
    this._chatContainer = chatContainer;
    this._messageInput = messageInput;
    this._onCreateNewSession = onCreateNewSession || null;
    this._onUpdateFileChanges = onUpdateFileChanges || null;
  }

  async execute(msgDiv, currentSessionId) {
    const rollbackBtn = msgDiv.querySelector('.rollback-btn');
    if (!rollbackBtn || rollbackBtn.classList.contains('rolling')) return;

    const assistantRow = msgDiv.closest('.message-row');
    if (!assistantRow) return;

    const existingPanel = assistantRow.nextElementSibling;
    if (existingPanel && existingPanel.classList.contains('rollback-inline')) {
      this._animateRemove(existingPanel);
      return;
    }

    rollbackBtn.classList.add('rolling');
    rollbackBtn.innerHTML = '<span style="font-size:12px;">⋯</span>';

    if (this._chatPanel.currentAbortController) {
      this._chatPanel.stopGeneration();
    }

    const messageId = this._resolveMessageId(assistantRow);
    if (!messageId) {
      showToast('无法确定上一轮对话的消息 ID，请刷新后重试', { type: 'error', duration: 3000 });
      rollbackBtn.innerHTML = '↩';
      rollbackBtn.classList.remove('rolling');
      return;
    }

    const loadingPanel = this._createLoadingPanel();
    assistantRow.insertAdjacentElement('afterend', loadingPanel);

    let previewFiles = [];
    try {
      const previewData = await this._chatService.rewindPreview(currentSessionId, messageId);
      previewFiles = previewData.files || [];
    } catch (e) {
      loadingPanel.remove();
      showToast('检查文件变更失败，请重试', { type: 'error', duration: 3000 });
      rollbackBtn.innerHTML = '↩';
      rollbackBtn.classList.remove('rolling');
      return;
    }

    loadingPanel.remove();

    const panel = this._buildPanel(previewFiles);
    assistantRow.insertAdjacentElement('afterend', panel);

    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    rollbackBtn.innerHTML = '↩';
    rollbackBtn.classList.remove('rolling');

    const result = await new Promise((resolve) => {
      const cancelBtn = panel.querySelector('.rollback-inline-btn-cancel');
      const confirmBtn = panel.querySelector('.rollback-inline-btn-confirm');

      cancelBtn.addEventListener('click', () => {
        this._animateRemove(panel);
        resolve(null);
      });

      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '回滚中...';
        cancelBtn.disabled = true;
        resolve('confirm');
      });
    });

    if (!result) return;

    try {
      const rewindResult = await this._chatService.rewind(currentSessionId, messageId);

      if (rewindResult.success) {
        panel.remove();

        this._chatService.invalidateMessageCache(currentSessionId);
        this._chatContainer.classList.add('switching');
        const messages = await this._chatService.getSessionMessages(currentSessionId);

        if (messages.length === 0) {
          try {
            await this._chatService.deleteSession(currentSessionId);
          } catch (_) {}
          this._chatService.invalidateMessageCache(currentSessionId);
          this._chatContainer.classList.remove('switching');
          if (this._onCreateNewSession) await this._onCreateNewSession();
          showToast('此会话已清空，已自动创建新会话', { type: 'info', duration: 4000 });
          return;
        }

        await this._chatPanel.loadHistoryMessages(messages, true);
        this._chatContainer.classList.remove('switching');
        requestAnimationFrame(() => {
          this._chatContainer.querySelectorAll('.message-row.animate-in').forEach(el => el.classList.remove('animate-in'));
        });
        if (this._onUpdateFileChanges) this._onUpdateFileChanges();

        if (rewindResult.lastUserMessage && this._messageInput) {
          this._messageInput.value = rewindResult.lastUserMessage;
          this._messageInput.style.height = 'auto';
          this._messageInput.style.height = this._messageInput.scrollHeight + 'px';
          this._messageInput.focus();
        }

        showToast(rewindResult.message || '已回滚到上一轮对话', { type: 'success', duration: 4000 });
      } else {
        this._animateRemove(panel);
        showToast(`回滚失败：${rewindResult.error || '未知错误'}`, { type: 'error', duration: 3000 });
      }
    } catch (e) {
      this._animateRemove(panel);
      showToast(`回滚失败：${e.message}`, { type: 'error', duration: 3000 });
    }

    this._chatContainer.classList.remove('switching');
  }

  _resolveMessageId(assistantRow) {
    let userRow = assistantRow?.previousElementSibling;
    let messageId = userRow?.querySelector('.message.user')?.dataset?.messageId;

    if (!messageId) {
      const isLastAssistant = !assistantRow?.nextElementSibling?.querySelector('.message.assistant');
      if (isLastAssistant && this._chatPanel._lastUserMessageId && !this._chatPanel._lastUserMessageId.startsWith('tmp-')) {
        messageId = this._chatPanel._lastUserMessageId;
      }
    }

    return messageId;
  }

  _createLoadingPanel() {
    const panel = document.createElement('div');
    panel.className = 'rollback-inline-loading';
    panel.innerHTML = `
      <svg class="loading-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      正在检查文件变更...
    `;
    return panel;
  }

  _buildPanel(previewFiles) {
    const fileSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/></svg>';

    let filesHtml = '';
    if (previewFiles.length > 0) {
      filesHtml = `
      <div class="rollback-inline-files">
        ${previewFiles.map(f => {
          const actionLabel = f.action === 'delete' ? '删除' : f.action === 'restore' ? '恢复' : '无变化';
          const actionClass = f.action === 'delete' ? 'action-delete' : f.action === 'restore' ? 'action-restore' : 'action-unchanged';
          let diffStats = '';
          if (f.action === 'restore' && (f.insertions > 0 || f.deletions > 0)) {
            const parts = [];
            if (f.insertions > 0) parts.push(`<span class="diff-add">+${f.insertions}</span>`);
            if (f.deletions > 0) parts.push(`<span class="diff-del">-${f.deletions}</span>`);
            diffStats = `<span class="diff-stats">${parts.join(' ')}</span>`;
          } else if (f.action === 'restore') {
            diffStats = `<span class="diff-stats"><span class="diff-none">无变动</span></span>`;
          }
          return `<div class="rollback-inline-file">
            <span class="file-icon">${fileSvg}</span>
            <span class="file-name" title="${escapeHtml(f.filePath)}">${escapeHtml(f.filePath.replace(/^.*[/\\]/, ''))}</span>
            <span class="file-action-badge ${actionClass}">${actionLabel}</span>
            ${diffStats}
          </div>`;
        }).join('')}
      </div>
      <div class="rollback-inline-divider"></div>`;
    }

    const panel = document.createElement('div');
    panel.className = 'rollback-inline';
    panel.innerHTML = `
      <div class="rollback-inline-header">
        <span class="rollback-inline-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <line x1="8" y1="5" x2="8" y2="9"/>
            <line x1="8" y1="11" x2="8" y2="11.5"/>
          </svg>
        </span>
        <span>回滚到上一轮对话</span>
        <span class="rollback-inline-count">${previewFiles.length > 0 ? previewFiles.length + ' 个文件' : '无文件变更'}</span>
      </div>
      ${filesHtml}
      <div class="rollback-inline-footer">
        <span class="rollback-inline-note">此操作无法撤销</span>
        <span class="rollback-inline-actions">
          <button class="rollback-inline-btn rollback-inline-btn-cancel">取消</button>
          <button class="rollback-inline-btn rollback-inline-btn-confirm">确认</button>
        </span>
      </div>
    `;
    return panel;
  }

  _animateRemove(panel) {
    panel.classList.add('rollback-inline-exit');
    panel.addEventListener('animationend', () => panel.remove(), { once: true });
  }
}
