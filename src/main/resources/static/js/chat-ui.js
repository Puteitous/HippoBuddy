import { escapeHtml, formatTime, safeParseJSON, truncateText } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { EventBus } from './utils/event-bus.js';
import { showToast } from './utils/toast.js';
import { ReviewState } from './utils/review-state.js';

export class ChatUI {
  constructor(container, options = {}) {
    this.container = container;
    this.rollbackFile = options.rollbackFile || null;
  }

  clear() {
    document.querySelector('.chat-panel')?.classList.remove('has-messages');
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-hero-logo"><span class="hippo-char">🦛</span></div>
        <h1 class="empty-hero-title">Hippo Code</h1>
        <p class="empty-hero-subtitle">你的 AI 编码助手</p>
        <div class="empty-hero-input-area">
          <div class="hero-input-wrapper">
            <textarea class="empty-hero-input" id="heroInput" placeholder="问点什么..." rows="1"></textarea>
            <button class="hero-send-btn" id="heroSendBtn" title="发送">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="15" x2="8" y2="1"/>
                        <polyline points="2 7 8 1 14 7"/>
                    </svg>
                </button>
          </div>
        </div>
        <div class="empty-hero-suggestions">
          <button class="empty-hero-suggestion" data-prompt="分析一下这个项目的结构和主要功能">分析项目结构</button>
          <button class="empty-hero-suggestion" data-prompt="解释当前代码的工作原理">解释代码</button>
          <button class="empty-hero-suggestion" data-prompt="为这段代码生成单元测试">生成测试</button>
        </div>
      </div>`;
    requestAnimationFrame(() => {
      const es = this.container.querySelector('.empty-state');
      if (es) {
        es.classList.add('animate');
        setTimeout(() => es.classList.remove('animate'), 1000);
      }
    });
  }

  removeEmptyState() {
    const emptyState = this.container.querySelector('.empty-state');
    if (emptyState) {
      if (emptyState.classList.contains('fade-out')) return;

      document.querySelector('.chat-panel')?.classList.add('has-messages');

      this.container.dataset.emptyTransition = 'true';

      emptyState.classList.add('fade-out');

      const onEnd = () => {
        emptyState.removeEventListener('transitionend', onEnd);
        emptyState.remove();
        delete this.container.dataset.emptyTransition;
      };
      emptyState.addEventListener('transitionend', onEnd);

      setTimeout(() => {
        emptyState.removeEventListener('transitionend', onEnd);
        if (emptyState.parentNode) emptyState.remove();
        delete this.container.dataset.emptyTransition;
      }, 400);
    }
  }

  appendUserMessage(content, messageId, animate = true) {
    this.removeEmptyState();
    const row = document.createElement('div');
    row.className = 'message-row user-row';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    if (messageId) msgDiv.dataset.messageId = messageId;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    msgDiv.appendChild(contentDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(new Date());
    msgDiv.appendChild(timeDiv);

    row.appendChild(msgDiv);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    btnContainer.appendChild(editBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
    btnContainer.appendChild(copyBtn);

    row.appendChild(btnContainer);
    
    this.container.appendChild(row);
    if (animate) {
      if (this.container.dataset.emptyTransition) {
        row.style.setProperty('--msg-delay', '0.28s');
      }
      requestAnimationFrame(() => row.classList.add('animate-in'));
    }
    this.scrollToBottom();
    return { msgDiv, contentDiv, editBtn, copyBtn, btnContainer, messageRow: row };
  }

  appendAssistantMessage(initialHTML = '<span class="typing-indicator">...</span>') {
    this.removeEmptyState();
    const row = document.createElement('div');
    row.className = 'message-row assistant-row';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.dataset.timestamp = Date.now().toString();
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = initialHTML;
    msgDiv.appendChild(contentDiv);

    row.appendChild(msgDiv);

    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';
    btnContainer.style.display = 'none';

    const retryBtn = document.createElement('button');
    retryBtn.className = 'message-action-btn';
    retryBtn.title = '重试';
    retryBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    btnContainer.appendChild(retryBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btnContainer.appendChild(copyBtn);

    const rollbackBtn = document.createElement('button');
    rollbackBtn.className = 'message-action-btn rollback-btn';
    rollbackBtn.title = '回退此消息的文件修改';
    rollbackBtn.innerHTML = '↩';
    rollbackBtn.addEventListener('click', () => {
      EventBus.emit('message:rollback', msgDiv);
    });
    btnContainer.appendChild(rollbackBtn);

    footer.appendChild(btnContainer);

    msgDiv.appendChild(footer);
    
    this.container.appendChild(row);
    requestAnimationFrame(() => row.classList.add('animate-in'));
    this.scrollToBottom();
    return { contentDiv, copyBtn, retryBtn, btnContainer, msgDiv, messageRow: row };
  }

  async appendAssistantMessageFromHistory(content, timestamp) {
    this.removeEmptyState();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = await renderMarkdown(content);
    msgDiv.appendChild(contentDiv);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btnContainer.appendChild(copyBtn);

    contentDiv.dataset.markdown = content;
    copyBtn.onclick = () => {
        const textToCopy = contentDiv.dataset.markdown || contentDiv.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      };
    
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    footer.appendChild(btnContainer);

    msgDiv.appendChild(footer);
    
    this.container.appendChild(msgDiv);
    return msgDiv;
  }

  appendToolCallCard(tool) {
    this.removeEmptyState();
    const cardHTML = this.renderToolCard(tool);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHTML;
    const card = tempDiv.firstElementChild;
    this.container.appendChild(card);
    this.scrollToBottom();
    
    // 绑定工具卡片事件（折叠/展开、撤销等）
    this.bindToolCardEvents(card);
    
    // 绑定 AskUser 卡片事件
    if (tool.name === 'ask_user') {
      this.bindAskUserEvents(card);
    }
    
    return card;
  }
  
  /**
   * 绑定工具卡片事件
   */
  bindToolCardEvents(card) {
    const header = card.querySelector('.tool-header, .tool-call-header');
    if (header && !header.hasAttribute('onclick')) {
      header.addEventListener('click', () => {
        header.classList.toggle('expanded');
        const details = header.nextElementSibling;
        if (details) details.classList.toggle('show');
      });
    }

    const undoBtn = card.querySelector('.undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleUndo(card);
      });
    }
  }

  async handleUndo(card) {
    const filePath = card.dataset.filePath;
    if (!filePath) return;

    const undoBtn = card.querySelector('.undo-btn');
    if (undoBtn) undoBtn.disabled = true;
    if (undoBtn) undoBtn.textContent = '撤销中...';

    try {
      if (!this.rollbackFile) {
        throw new Error('rollbackFile 未配置');
      }
      const result = await this.rollbackFile(filePath);

      if (result.success) {
        card.dataset.reviewStatus = 'rolled_back';
        ReviewState.markRolledBack(filePath);
        const actionBar = card.querySelector('.file-action-bar');
        if (actionBar) {
          actionBar.innerHTML = `<span class="file-action-status undone">↩ 已撤销</span>`;
        }
      } else {
        showToast(`撤销失败：${result.error || '未知错误'}`, { type: 'error', duration: 3000 });
        if (undoBtn) undoBtn.disabled = false;
        if (undoBtn) undoBtn.textContent = '↩ 撤销';
      }
    } catch (e) {
      showToast(`撤销失败：${e.message}`, { type: 'error', duration: 3000 });
      if (undoBtn) undoBtn.disabled = false;
      if (undoBtn) undoBtn.textContent = '↩ 撤销';
    }
  }
  
  /**
   * 绑定 AskUser 卡片事件
   */
  bindAskUserEvents(card) {
    console.log('🔧 绑定 AskUser 卡片事件');
    
    // 选项按钮点击事件
    const optionBtns = card.querySelectorAll('.option-btn');
    console.log('  找到选项按钮数量:', optionBtns.length);
    
    optionBtns.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const option = btn.getAttribute('data-option');
        console.log('📤 选项按钮被点击:', option);
        EventBus.emit('ask_user:respond', option);
      });
    });
  }

  renderToolCard(tool) {
    // 特殊工具类型处理
    if (tool.name === 'todo_write') {
      return this.renderTodoWriteCard(tool);
    }
    if (tool.name === 'ask_user') {
      return this.renderAskUserCard(tool);
    }
    if (tool.name === 'bash') {
      return this.renderBashCard(tool);
    }
    if (tool.name === 'edit_file') {
      return this.renderEditFileCard(tool);
    }
    if (tool.name === 'write_file') {
      return this.renderWriteFileCard(tool);
    }
    
    // 默认工具卡片
    return this.renderDefaultToolCard(tool);
  }

  renderToolTimelineRow(tool) {
    const name = tool.name;
    const isPendingConfirm = !!(tool.confirmationData);
    const status = isPendingConfirm ? 'pending_confirmation' : (tool.result || 'running');
    const detailHTML = this.renderToolTimelineDetailContent(tool);

    let summary = '';
    let diffStatsHtml = '';
    if (name === 'bash') {
      const args = this.parseToolArgs(tool.args);
      summary = args.command || '';
    } else if (name === 'read_file') {
      const args = this.parseToolArgs(tool.args);
      summary = args.path || '';
    } else if (name === 'grep') {
      const args = this.parseToolArgs(tool.args);
      summary = args.pattern || '';
    } else if (name === 'glob') {
      const args = this.parseToolArgs(tool.args);
      summary = args.pattern || '';
    } else if (name === 'SearchCodebase') {
      const args = this.parseToolArgs(tool.args);
      summary = args.information_request || '';
    } else if (name === 'edit_file' || name === 'write_file') {
      const args = this.parseToolArgs(tool.args);
      summary = args.path || '';
      if (status === 'success') {
        if (name === 'edit_file') {
          const oldText = args.old_text || '';
          const newText = args.new_text || '';
          const stats = this._countDiffStats(oldText, newText);
          if (stats.insertions > 0 || stats.deletions > 0) {
            diffStatsHtml = `<span class="timeline-diff-stats"><span class="diff-add">+${stats.insertions}</span><span class="diff-del">-${stats.deletions}</span></span>`;
          }
        } else if (name === 'write_file') {
          const content = args.content || '';
          const lineCount = content.split('\n').length;
          diffStatsHtml = `<span class="timeline-diff-stats"><span class="diff-add">+${lineCount}</span></span>`;
        }
      }
    } else {
      summary = name;
    }

    let statusSvg;
    if (isPendingConfirm) {
      statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
    } else if (status === 'running' && (name === 'edit_file' || name === 'write_file')) {
      statusSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
    } else if (status === 'success' && (name === 'edit_file' || name === 'write_file') && diffStatsHtml) {
      statusSvg = diffStatsHtml;
    } else if (status === 'success' && (name === 'edit_file' || name === 'write_file')) {
      statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
    } else {
      statusSvg = status === 'success'
        ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>'
        : status === 'error'
        ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
        : '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';
    }

    const toolSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z"/><line x1="10" y1="6" x2="12" y2="4"/></svg>';

    return `
      <div class="tool-timeline-item" data-tool-name="${escapeHtml(name)}" data-tool-status="${status}">
        <div class="tool-timeline-row" onclick="window.toggleToolTimeline(this)">
          <span class="tool-timeline-dot">${toolSvg}</span>
          <span class="tool-timeline-name">${escapeHtml(name)}</span>
          <span class="tool-timeline-summary">${escapeHtml(truncateText(summary, 60))}</span>
          <span class="tool-timeline-status ${status}">${statusSvg}</span>
          <span class="tool-timeline-arrow">▶</span>
        </div>
        <div class="tool-timeline-detail">${detailHTML}</div>
      </div>`;
  }

  renderToolTimelineDetailContent(tool) {
    const name = tool.name;
    const isSuccess = tool.result === 'success';
    const isError = tool.result === 'error';
    const isRunning = !tool.result;

    // 待确认状态：显示确认界面
    if (tool.confirmationData) {
      return this._renderConfirmationDetail(tool);
    }

    if (isRunning) {
      if (tool.progressLines && tool.progressLines.length > 0) {
        const lines = tool.progressLines.slice(-20);
        const stopBtn = tool.id
          ? `<button class="tool-abort-btn" data-tool-id="${escapeHtml(tool.id)}" onclick="window.abortToolCall(this)">■ 终止</button>`
          : '';
        return `<div class="timeline-detail-progress"><pre><code>${lines.map(l => escapeHtml(l)).join('\n')}</code></pre></div>${stopBtn}`;
      }
      const stopBtn = tool.id
        ? `<button class="tool-abort-btn" data-tool-id="${escapeHtml(tool.id)}" onclick="window.abortToolCall(this)">■ 终止</button>`
        : '';
      return `<div class="timeline-detail-status">运行中...</div>${stopBtn}`;
    }
    if (isError && tool.error) {
      return `<div class="timeline-detail-error">${escapeHtml(tool.error)}</div>`;
    }
    if (name === 'bash') {
      return this._renderBashDetail(tool);
    }
    if (name === 'edit_file') {
      return this._renderEditFileDetail(tool);
    }
    if (name === 'write_file') {
      return this._renderWriteFileDetail(tool);
    }
    if (name === 'read_file') {
      return this._renderReadFileDetail(tool);
    }
    if (name === 'grep') {
      return this._renderGrepDetail(tool);
    }
    if (name === 'glob') {
      return this._renderGlobDetail(tool);
    }
    if (name === 'SearchCodebase') {
      return this._renderSearchDetail(tool);
    }
    return this._renderDefaultToolDetail(tool);
  }

  _renderBashDetail(tool) {
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

  _computeUnifiedDiff(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');

    const m = oldLines.length;
    const n = newLines.length;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const reversed = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        reversed.push({ type: 'same', content: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        reversed.push({ type: 'added', content: newLines[j - 1] });
        j--;
      } else {
        reversed.push({ type: 'removed', content: oldLines[i - 1] });
        i--;
      }
    }
    return reversed.reverse();
  }

  _countDiffStats(oldText, newText) {
    const diffLines = this._computeUnifiedDiff(oldText, newText);
    let insertions = 0, deletions = 0;
    for (const line of diffLines) {
      if (line.type === 'added') insertions++;
      else if (line.type === 'removed') deletions++;
    }
    return { insertions, deletions };
  }

  _renderUnifiedDiff(diffLines) {
    let html = `<div class="unified-diff">`;
    for (const line of diffLines) {
      html += this._renderDiffLine(line);
    }
    html += `</div>`;
    return html;
  }

  _renderDiffLine(line) {
    const cls = line.type === 'added' ? 'diff-added'
              : line.type === 'removed' ? 'diff-removed'
              : 'diff-context';
    const gutter = line.type === 'added' ? '+'
                 : line.type === 'removed' ? '-'
                 : ' ';
    return `<div class="diff-line ${cls}">
      <span class="diff-gutter">${gutter}</span>
      <span class="diff-line-content">${escapeHtml(line.content)}</span>
    </div>`;
  }

  _renderEditFileDetail(tool) {
    const args = this.parseToolArgs(tool.args);
    const filePath = args.path || '';
    const oldText = args.old_text || '';
    const newText = args.new_text || '';

    const diffLines = this._computeUnifiedDiff(oldText, newText);

    let html = `<div class="timeline-detail-diff">`;
    html += this._renderUnifiedDiff(diffLines);
    html += `</div>`;
    return html;
  }

  _renderWriteFileDetail(tool) {
    const args = this.parseToolArgs(tool.args);
    const content = args.content || '';
    const diffLines = this._computeUnifiedDiff('', content);

    let html = `<div class="timeline-detail-diff">`;
    html += this._renderUnifiedDiff(diffLines);
    html += `</div>`;
    return html;
  }

  _renderReadFileDetail(tool) {
    const args = this.parseToolArgs(tool.args);
    const filePath = args.path || '';
    const content = tool.resultContent || '';
    let html = ``;
    if (content) {
      html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(content)}</code></pre></div>`;
    }
    return html;
  }

  _renderGrepDetail(tool) {
    const content = tool.resultContent || '';
    let html = '';
    if (content) {
      html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(content)}</code></pre></div>`;
    }
    return html;
  }

  _renderGlobDetail(tool) {
    const content = tool.resultContent || '';
    let html = '';
    if (content) {
      html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(content)}</code></pre></div>`;
    }
    return html;
  }

  _renderSearchDetail(tool) {
    const args = this.parseToolArgs(tool.args);
    const query = args.information_request || '';
    const content = tool.resultContent || '';
    let html = `<div class="timeline-detail-meta"><span class="timeline-detail-query">${escapeHtml(query)}</span></div>`;
    if (content) {
      html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(content)}</code></pre></div>`;
    }
    return html;
  }

  _renderDefaultToolDetail(tool) {
    let html = '';
    if (tool.resultContent) {
      html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(tool.resultContent)}</code></pre></div>`;
    } else {
      const args = this.parseToolArgs(tool.args);
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

  _renderConfirmationDetail(tool) {
    const data = tool.confirmationData;
    const cmd = data.command || '';
    const riskLevel = data.riskLevel || 'medium';
    const riskReason = data.riskReason || '';
    const riskLabel = riskLevel === 'high' ? '高风险' : riskLevel === 'low' ? '低风险' : '中风险';
    const riskSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';

    return `
      <div class="timeline-detail-confirmation ${riskLevel}">
        <div class="confirmation-header">
          <span class="confirmation-header-icon">${riskSvg}</span>
          <span class="confirmation-header-title">执行命令</span>
          <span class="risk-badge">${riskLabel}</span>
        </div>
        <div class="confirmation-body">
          <div class="confirmation-command"><pre><code>${escapeHtml(cmd)}</code></pre></div>
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
      </div>`;
  }

  renderTodoWriteCard(tool) {
    const todos = this.parseTodos(tool.args);
    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const todoIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><polyline points="5 7 7 9 11 5"/></svg>';
    const checkSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
    const dotSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

    return `
      <div class="tool-card todo-card">
        <div class="tool-header" onclick="window.toggleToolCardDetails(this)">
          <span class="tool-icon">${todoIcon}</span>
          <span class="tool-title">任务清单</span>
          <span class="tool-progress-label">${completed}/${total}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          ${total > 1 ? `
          <div class="todo-progress-bar">
            <div class="progress-track">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>` : ''}
          <div class="todo-list">
            ${todos.map(todo => {
              const isCompleted = todo.status === 'completed';
              const icon = isCompleted ? checkSvg : dotSvg;
              const statusClass = isCompleted ? 'done' : 'pending';
              const content = todo.content || '未命名任务';
              return `
                <div class="todo-item ${statusClass}">
                  <span class="todo-icon">${icon}</span>
                  <span class="todo-content">${escapeHtml(content)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderBashCard(tool) {
    const args = this.parseToolArgs(tool.args);
    const command = args.command || '';
    const workingDir = args.working_dir || '';
    const isSuccess = tool.result === 'success';
    const isError = tool.result === 'error';
    const isRunning = !tool.result;

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
      : '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';
    const statusText = isSuccess ? '成功' : isError ? '失败' : '运行中';

    const terminalSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="12" y2="12"/></svg>';
    const folderSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>';
    const exitSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 3 13 3 11 6 13 9 4 9"/></svg>';

    return `
      <div class="tool-card bash-card">
        <div class="tool-header">
          <span class="tool-icon">${terminalSvg}</span>
          <span class="tool-title">终端命令</span>
          <span class="tool-status-badge ${isSuccess ? 'success' : isError ? 'error' : 'running'}">${statusSvg} ${statusText}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="bash-command">${escapeHtml(command)}</div>
          ${workingDir ? `<div class="bash-meta">${folderSvg} ${escapeHtml(workingDir)}</div>` : ''}
          ${exitCode !== null ? `<div class="bash-meta">${exitSvg} 退出码: ${exitCode} ${duration ? `| ⏱ ${duration}ms` : ''}</div>` : ''}
          ${output ? `<div class="bash-output"><pre><code>${escapeHtml(output)}</code></pre></div>` : ''}
          ${isError && tool.error ? `<div class="bash-error">${escapeHtml(tool.error)}</div>` : ''}
        </div>
      </div>
    `;
  }

  renderEditFileCard(tool) {
    const args = this.parseToolArgs(tool.args);
    const filePath = args.path || '';
    const oldText = args.old_text || '';
    const newText = args.new_text || '';
    const isSuccess = tool.result === 'success';
    const isError = tool.result === 'error';
    const isRunning = !tool.result;

    const diffLines = this._computeUnifiedDiff(oldText, newText);
    let insertions = 0, deletions = 0;
    for (const line of diffLines) {
      if (line.type === 'added') insertions++;
      else if (line.type === 'removed') deletions++;
    }

    const editSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a2 2 0 0 1 3 3L5 14H2v-3l9-9z"/></svg>';
    const fileSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/></svg>';
    const xSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
    const spinnerSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
    const pendingSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

    let statusHtml;
    let statusClass;
    if (isRunning) {
      statusHtml = `${spinnerSvg} 执行中`;
      statusClass = 'running';
    } else if (isSuccess) {
      statusHtml = `<span class="diff-stats-badge"><span class="diff-add">+${insertions}</span><span class="diff-del">-${deletions}</span></span>`;
      statusClass = 'success';
    } else {
      statusHtml = `${xSvg} 失败`;
      statusClass = 'error';
    }

    return `
      <div class="tool-card editfile-card" data-file-path="${escapeHtml(filePath)}" data-review-status="pending">
        <div class="tool-header">
          <span class="tool-icon">${editSvg}</span>
          <span class="tool-title">编辑文件</span>
          <span class="tool-status-badge ${statusClass}">${statusHtml}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="editfile-path">${fileSvg} ${escapeHtml(filePath)}</div>
          ${isRunning ? '<div class="editfile-loading">正在编辑文件...</div>' : ''}
          ${isSuccess ? `
          <div class="editfile-diff">
            ${this._renderUnifiedDiff(diffLines)}
          </div>
          <div class="file-action-bar">
            <span class="file-action-status pending">${pendingSvg} 已生效</span>
            <button class="file-action-btn undo-btn">撤销</button>
          </div>` : ''}
          ${isError && tool.error ? `<div class="editfile-error">${escapeHtml(tool.error)}</div>` : ''}
        </div>
      </div>
    `;
  }

  renderWriteFileCard(tool) {
    const args = this.parseToolArgs(tool.args);
    const filePath = args.path || '';
    const content = args.content || '';
    const isSuccess = tool.result === 'success';
    const isError = tool.result === 'error';
    const isRunning = !tool.result;

    const diffLines = this._computeUnifiedDiff('', content);
    let insertions = 0;
    for (const line of diffLines) {
      if (line.type === 'added') insertions++;
    }

    const fileSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/></svg>';
    const xSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
    const spinnerSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
    const pendingSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

    let statusHtml;
    let statusClass;
    if (isRunning) {
      statusHtml = `${spinnerSvg} 执行中`;
      statusClass = 'running';
    } else if (isSuccess) {
      statusHtml = `<span class="diff-stats-badge"><span class="diff-add">+${insertions}</span></span>`;
      statusClass = 'success';
    } else {
      statusHtml = `${xSvg} 失败`;
      statusClass = 'error';
    }

    return `
      <div class="tool-card writefile-card" data-file-path="${escapeHtml(filePath)}" data-review-status="pending">
        <div class="tool-header">
          <span class="tool-icon">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
              <path d="M9 2v3h3"/>
            </svg>
          </span>
          <span class="tool-title">写入文件</span>
          <span class="tool-status-badge ${statusClass}">${statusHtml}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="writefile-path">${fileSvg} ${escapeHtml(filePath)}</div>
          ${isRunning ? '<div class="editfile-loading">正在写入文件...</div>' : ''}
          ${isSuccess ? `
          <div class="editfile-diff">
            ${this._renderUnifiedDiff(diffLines)}
          </div>
          <div class="file-action-bar">
            <span class="file-action-status pending">${pendingSvg} 已生效</span>
            <button class="file-action-btn undo-btn">撤销</button>
          </div>` : ''}
          ${isError && tool.error ? `<div class="writefile-error">${escapeHtml(tool.error)}</div>` : ''}
        </div>
      </div>
    `;
  }

  renderAskUserCard(tool) {
    const { question, options, allow_custom_input } = this.parseAskUserArgs(tool.args);
    const hasOptions = options && options.length > 0;

    const askIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="10" x2="8" y2="11"/><path d="M6.5 6.5c0-1 1-1.5 1.5-1.5s1.5.5 1.5 1.5c0 1-1.5 1.5-1.5 2.5"/></svg>';

    return `
      <div class="tool-card ask-user-card">
        <div class="tool-header" onclick="window.toggleToolCardDetails(this)">
          <span class="tool-icon">${askIcon}</span>
          <span class="tool-title">需要确认</span>
          <span class="arrow">▶</span>
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

  renderDefaultToolCard(tool) {
    let argsDisplay = '';
    if (tool.args) {
      try {
        const parsed = typeof tool.args === 'string' ? JSON.parse(tool.args) : tool.args;
        argsDisplay = `<div class="detail-row"><span class="detail-label">参数:</span><span class="detail-value">${escapeHtml(JSON.stringify(parsed, null, 2))}</span></div>`;
      } catch (e) {
        argsDisplay = `<div class="detail-row"><span class="detail-label">参数:</span><span class="detail-value">${escapeHtml(String(tool.args))}</span></div>`;
      }
    }

    let resultDisplay = '';
    if (tool.resultContent) {
      resultDisplay = `<div class="detail-row"><span class="detail-label">结果:</span><span class="detail-value tool-result-content">${escapeHtml(tool.resultContent)}</span></div>`;
    }

    const wrenchSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z"/><line x1="10" y1="6" x2="12" y2="4"/></svg>';
    const checkSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
    const xSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
    const dotSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

    let statusDisplay = '';
    if (tool.result === 'success') statusDisplay = `${checkSvg} 成功`;
    else if (tool.result === 'error') statusDisplay = `${xSvg} 失败`;
    else statusDisplay = `${dotSvg} 运行中`;

    return `
      <div class="tool-call-card">
        <div class="tool-call-header">
          <span class="tool-icon">${wrenchSvg}</span>
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-status ${tool.result || 'running'}">${statusDisplay}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          ${argsDisplay}
          ${resultDisplay}
          ${tool.error ? `<div class="detail-row"><span class="detail-label">错误:</span><span class="detail-value" style="color: var(--error-color);">${escapeHtml(tool.error)}</span></div>` : ''}
        </div>
      </div>
    `;
  }

  parseTodos(args) {
    try {
      const parsed = typeof args === 'string' ? JSON.parse(args) : args;
      return parsed.todos || [];
    } catch (e) {
      return [];
    }
  }

  parseAskUserArgs(args) {
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

  parseToolArgs(args) {
    try {
      return typeof args === 'string' ? JSON.parse(args) : args;
    } catch (e) {
      return {};
    }
  }

  getTodoIcon(status) {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '⋯';
      default: return '○';
    }
  }

  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  isNearBottom(threshold = 80) {
    return this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < threshold;
  }
}

window.toggleToolCall = function(header) {
  header.classList.toggle('expanded');
  const details = header.nextElementSibling;
  details.classList.toggle('show');
};

window.toggleToolTimeline = function(rowEl) {
  const item = rowEl.closest('.tool-timeline-item');
  if (!item) return;
  const detail = item.querySelector('.tool-timeline-detail');
  if (!detail) return;

  if (item.classList.contains('expanded')) {
    detail.style.maxHeight = '0';
    item.classList.remove('expanded');
  } else {
    item.classList.add('expanded');
    // 先解除 max-height 约束，让 scrollHeight 能测量到完整内容高度
    // 否则 CSS max-height: 0 + overflow: hidden 会影响 layout 导致 scrollHeight 返回极小值
    detail.style.maxHeight = 'none';
    const h = detail.scrollHeight;
    detail.style.maxHeight = '0';
    void detail.offsetHeight;
    detail.style.maxHeight = h + 'px';
  }
};

window.toggleToolCardDetails = function(headerEl) {
  const card = headerEl.closest('.tool-card');
  if (!card) return;
  const details = card.querySelector('.tool-call-details');
  if (!details) return;

  if (card.classList.contains('expanded')) {
    details.style.maxHeight = '0';
    card.classList.remove('expanded');
  } else {
    const h = details.scrollHeight;
    const isCapped = h > 300;
    details.style.maxHeight = isCapped ? '300px' : h + 'px';
    card.classList.add('expanded');
  }
};

window.abortToolCall = function(btnEl) {
  const toolCallId = btnEl.dataset.toolId;
  if (!toolCallId) return;

  btnEl.disabled = true;
  btnEl.textContent = '正在终止...';

  fetch('/api/tool/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolCallId })
  }).then(res => {
    if (res.ok) {
      btnEl.textContent = '已终止';
      btnEl.classList.add('aborted');
    } else {
      btnEl.textContent = '终止失败';
      btnEl.disabled = false;
    }
  }).catch(() => {
    btnEl.textContent = '终止失败';
    btnEl.disabled = false;
  });
};
