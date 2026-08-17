import { showToast } from '../utils/toast.js';
import { escapeHtml } from '../utils.js';
import { getFileIconInfo } from '../utils/file-icons.js';
import { EventBus } from '../utils/event-bus.js';

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
      showToast(window.i18n.t('rollback.cantFindMsg'), { type: 'error', duration: 3000 });
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
      console.error('[Rollback] 预览请求失败:', e);
      loadingPanel.remove();
      showToast(window.i18n.t('rollback.checkFailed'), { type: 'error', duration: 3000 });
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
      const confirmBtn = panel.querySelector('.rollback-inline-split > .rollback-inline-btn-confirm');
      const split = panel.querySelector('.rollback-inline-split');
      const dropdownBtns = panel.querySelectorAll('.rollback-inline-split-dropdown [data-mode]');

      const disableAll = () => {
        cancelBtn.disabled = true;
        confirmBtn.disabled = true;
        dropdownBtns.forEach(b => { b.disabled = true; });
        split?.classList.add('disabled');
      };

      const onCancel = () => {
        this._animateRemove(panel);
        resolve(null);
      };

      const onConfirm = async (/** @type {Event} */ e) => {
        const btn = e.currentTarget;
        const mode = btn.dataset.mode || 'all';
        disableAll();
        btn.textContent = window.i18n.t('rollback.rollingBack');
        resolve(mode);
      };

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      dropdownBtns.forEach(btn => btn.addEventListener('click', onConfirm));
    });

    if (!result) return;

    const mode = result; // 'files' or 'all'
    try {
      const rewindResult = await this._chatService.rewind(currentSessionId, messageId, mode);

      if (rewindResult.success) {
        panel.remove();
        // 通知预览区域刷新（携带被回滚的文件路径列表，由监听方精确匹配，
        // 避免回滚任意文件导致当前预览被无故重建）
        const rollbackPaths = (previewFiles || []).map(f => f && f.filePath).filter(Boolean);
        EventBus.emit('file:rollback-completed', rollbackPaths);

        if (mode === 'files') {
          // 仅回滚文件：不截断会话，只刷新文件变更状态
          if (this._onUpdateFileChanges) this._onUpdateFileChanges();
          showToast(window.i18n.t('rollback.fileRolledBack'), { type: 'success', duration: 4000 });
          return;
        }

        // 全部回滚：原有流程
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
          showToast(window.i18n.t('rollback.sessionCleared'), { type: 'info', duration: 4000 });
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

                  showToast(window.i18n.t('rollback.rolledBack'), { type: 'success', duration: 4000 });
      } else {
        this._animateRemove(panel);
        showToast(window.i18n.t('rollback.failed') + (rewindResult.error || window.i18n.t('chatui.unknownError')), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      this._animateRemove(panel);
      showToast(window.i18n.t('rollback.failed') + e.message, { type: 'error', duration: 3000 });
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
    const _t = (k, params) => window.i18n.t(k, params);
    panel.innerHTML = `
      <svg class="loading-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      ${_t('rollback.checkingFiles')}
    `;
    return panel;
  }

  _buildPanel(previewFiles) {
    const _t = (k, params) => window.i18n.t(k, params);
    // 只保留有实际变动的文件（delete / add / restore）
    const changedFiles = previewFiles.filter(f =>
      f.action === 'delete' || f.action === 'add' || f.action === 'restore'
    );

    let filesHtml = '';
    if (changedFiles.length > 0) {
      filesHtml = `
      <div class="rollback-inline-files">
        ${changedFiles.map(f => {
          let actionLabel, actionClass, statusLetter;
          if (f.action === 'delete') {
            actionLabel = _t('rollback.actionDelete');
            actionClass = 'action-delete';
            statusLetter = 'D';
          } else if (f.action === 'add') {
            actionLabel = _t('rollback.actionAdd');
            actionClass = 'action-add';
            statusLetter = 'A';
          } else {
            actionLabel = _t('rollback.actionRestore');
            actionClass = 'action-restore';
            statusLetter = 'M';
          }
          const fileName = f.filePath.split(/[/\\]/).pop();
          const { iconFile } = getFileIconInfo(fileName);
          return `<div class="rollback-inline-file ${actionClass}">
            <img class="file-icon" src="icons/${iconFile}" draggable="false" alt="">
            <span class="file-name" title="${escapeHtml(f.filePath)}">${escapeHtml(f.filePath)}</span>
            <span class="file-action-badge ${actionClass}">${actionLabel}</span>
            <span class="file-status-letter ${actionClass}">${statusLetter}</span>
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
        <span>${_t('rollback.panelTitle')}</span>
        <span class="rollback-inline-count">${changedFiles.length > 0 ? changedFiles.length + _t('rollback.fileCount') : _t('rollback.noFileChanges')}</span>
      </div>
      ${filesHtml}
      <div class="rollback-inline-footer">
        <button class="rollback-inline-btn rollback-inline-btn-cancel">${_t('rollback.cancel')}</button>
        <span class="rollback-inline-split">
          <button class="rollback-inline-btn rollback-inline-btn-confirm">${_t('rollback.rollbackShort')}</button>
          <button class="rollback-inline-split-toggle" title="${_t('rollback.moreOptions')}">▾</button>
          <span class="rollback-inline-split-dropdown">
            <button class="rollback-inline-btn rollback-inline-btn-confirm" data-mode="all"><span class="dropdown-check">✓</span>${_t('rollback.rollbackAll')}</button>
            <button class="rollback-inline-btn rollback-inline-btn-files" data-mode="files"><span class="dropdown-check-placeholder"></span>${_t('rollback.rollbackFilesOnly')}</button>
          </span>
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
