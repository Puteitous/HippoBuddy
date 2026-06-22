import { showToast } from '../utils/toast.js';
import { escapeHtml } from '../utils.js';
import { getFileIconInfo } from '../utils/file-icons.js';

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
    console.log('[Rollback] execute 触发', { currentSessionId });
    const rollbackBtn = msgDiv.querySelector('.rollback-btn');
    if (!rollbackBtn || rollbackBtn.classList.contains('rolling')) return;

    const assistantRow = msgDiv.closest('.message-row');
    if (!assistantRow) return;

    const existingPanel = assistantRow.nextElementSibling;
    if (existingPanel && existingPanel.classList.contains('rollback-inline')) {
      console.log('[Rollback] 关闭已展开的面板');
      this._animateRemove(existingPanel);
      return;
    }

    rollbackBtn.classList.add('rolling');
    rollbackBtn.innerHTML = '<span style="font-size:12px;">⋯</span>';

    if (this._chatPanel.currentAbortController) {
      this._chatPanel.stopGeneration();
    }

    const messageId = this._resolveMessageId(assistantRow);
    console.log('[Rollback] 解析到的 messageId:', messageId);
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
      console.log('[Rollback] 请求预览: sessionId=%s, messageId=%s', currentSessionId, messageId);
      const previewData = await this._chatService.rewindPreview(currentSessionId, messageId);
      console.log('[Rollback] 预览原始响应:', previewData);
      previewFiles = previewData.files || [];
      console.log('[Rollback] 预览文件列表(%d):', previewFiles.length, previewFiles.map(f => ({ filePath: f.filePath, action: f.action, insertions: f.insertions, deletions: f.deletions })));
    } catch (e) {
      console.error('[Rollback] 预览请求失败:', e);
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
      const filesBtn = panel.querySelector('.rollback-inline-btn-files');
      const confirmBtn = panel.querySelector('.rollback-inline-btn-confirm');

      const disableAll = () => {
        [cancelBtn, filesBtn, confirmBtn].forEach(b => { b.disabled = true; });
      };

      cancelBtn.addEventListener('click', () => {
        this._animateRemove(panel);
        resolve(null);
      });

      filesBtn.addEventListener('click', async () => {
        disableAll();
        filesBtn.textContent = '回滚中...';
        resolve('files');
      });

      confirmBtn.addEventListener('click', async () => {
        disableAll();
        confirmBtn.textContent = '回滚中...';
        resolve('all');
      });
    });

    if (!result) return;

    const mode = result; // 'files' or 'all'
    console.log('[Rollback] 用户确认回滚: mode=%s, sessionId=%s, messageId=%s', mode, currentSessionId, messageId);
    try {
      const rewindResult = await this._chatService.rewind(currentSessionId, messageId, mode);
      console.log('[Rollback] rewind 响应:', rewindResult);

      if (rewindResult.success) {
        panel.remove();

        if (mode === 'files') {
          // 仅回滚文件：不截断会话，只刷新文件变更状态
          console.log('[Rollback] 文件已回滚，保留会话记录');
          if (this._onUpdateFileChanges) this._onUpdateFileChanges();
          showToast(rewindResult.message || '文件已回滚', { type: 'success', duration: 4000 });
          return;
        }

        // 全部回滚：原有流程
        console.log('[Rollback] 回滚成功，重新加载会话消息');
        this._chatService.invalidateMessageCache(currentSessionId);
        this._chatContainer.classList.add('switching');
        const messages = await this._chatService.getSessionMessages(currentSessionId);
        console.log('[Rollback] 回滚后消息数:', messages.length);

        if (messages.length === 0) {
          console.log('[Rollback] 会话已清空，创建新会话');
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
    // 只保留有实际变动的文件（delete / add / restore）
    const changedFiles = previewFiles.filter(f =>
      f.action === 'delete' || f.action === 'add' || f.action === 'restore'
    );

    console.log('[Rollback] _buildPanel: 原始%d条, 过滤后%d条', previewFiles.length, changedFiles.length,
      changedFiles.map(f => ({ filePath: f.filePath, action: f.action })));

    let filesHtml = '';
    if (changedFiles.length > 0) {
      filesHtml = `
      <div class="rollback-inline-files">
        ${changedFiles.map(f => {
          let actionLabel, actionClass, statusLetter;
          if (f.action === 'delete') {
            actionLabel = '即将移除';
            actionClass = 'action-delete';
            statusLetter = 'D';
          } else if (f.action === 'add') {
            actionLabel = '即将还原';
            actionClass = 'action-add';
            statusLetter = 'A';
          } else {
            actionLabel = '即将恢复';
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
        <span>回滚到上一轮对话</span>
        <span class="rollback-inline-count">${changedFiles.length > 0 ? changedFiles.length + ' 个文件' : '无文件变更'}</span>
      </div>
      ${filesHtml}
      <div class="rollback-inline-footer">
        <span class="rollback-inline-actions">
          <button class="rollback-inline-btn rollback-inline-btn-cancel">取消</button>
          <button class="rollback-inline-btn rollback-inline-btn-files">回滚文件</button>
          <button class="rollback-inline-btn rollback-inline-btn-confirm">全部回滚</button>
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
