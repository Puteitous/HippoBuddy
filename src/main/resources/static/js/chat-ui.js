import { formatTime } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { EventBus } from './utils/event-bus.js';
import { showToast } from './utils/toast.js';
import { ReviewState } from './utils/review-state.js';
import { getFileIconInfo } from './utils/file-icons.js';
import { diffModalManager } from './utils/diff-modal.js';
import { renderToolCard as renderToolCardFn, renderToolTimelineRow as renderToolTimelineRowFn } from './components/tool-renderers/index.js';
import { renderBashCard as renderBashCardFn } from './components/tool-renderers/bash.js';
import { renderEditFileCard as renderEditFileCardFn } from './components/tool-renderers/edit-file.js';
import { renderWriteFileCard as renderWriteFileCardFn } from './components/tool-renderers/write-file.js';
import { renderTodoWriteCard as renderTodoWriteCardFn } from './components/tool-renderers/todo-write.js';
import { renderAskUserCard as renderAskUserCardFn } from './components/tool-renderers/ask-user.js';
import { renderDefaultToolCard as renderDefaultToolCardFn } from './components/tool-renderers/default.js';
import { parseTodos as parseTodosFn, parseToolArgs as parseToolArgsFn } from './components/tool-renderers/shared.js';
import { parseAskUserArgs as parseAskUserArgsFn } from './components/tool-renderers/ask-user.js';

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
        <h1 class="empty-hero-title">HippoBuddy</h1>
        <p class="empty-hero-subtitle">你的 AI 桌面伙伴</p>
        <div class="empty-hero-input-area">
          <div class="hero-input-wrapper">
            <div class="empty-hero-input-refs" id="heroInputRefs"></div>
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
    
    // 解析 @path 引用并渲染为卡片
    const { refs, remainingContent } = this._parseRefsFromContent(content);
    if (refs && refs.length > 0) {
      const refsBar = document.createElement('div');
      refsBar.className = 'message-user-refs';
      refs.forEach(ref => {
        refsBar.appendChild(this._createRefChip(ref, true));
      });
      msgDiv.appendChild(refsBar);
    }

    const displayContent = remainingContent ?? content;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = displayContent;
    msgDiv.appendChild(contentDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(new Date());
    msgDiv.appendChild(timeDiv);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(displayContent).then(() => {
        copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
    btnContainer.appendChild(copyBtn);

    // btnContainer 先 append，让它在 msgDiv 左侧
    row.appendChild(btnContainer);
    row.appendChild(msgDiv);
    
    this.container.appendChild(row);
    if (animate) {
      if (this.container.dataset.emptyTransition) {
        row.style.setProperty('--msg-delay', '0.28s');
      }
      requestAnimationFrame(() => row.classList.add('animate-in'));
    }
    this.scrollToBottom();
    return { msgDiv, contentDiv, copyBtn, btnContainer, messageRow: row };
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

    const forkBtn = document.createElement('button');
    forkBtn.className = 'message-action-btn fork-btn';
    forkBtn.title = '从此处分叉为新会话';
    forkBtn.innerHTML = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;vertical-align:middle"><path fill="currentColor" d="m76.67 10c-7.366 0-13.337 5.97-13.337 13.333 0 6.204 4.258 11.374 10 12.861v7.139c0 1.841-1.494 3.333-3.333 3.333h-33.333c-3.77 0-7.207 1.299-10 3.412v-13.88c5.742-1.491 10-6.66 10-12.864 0-7.364-5.97-13.334-13.334-13.334s-13.333 5.97-13.333 13.333c0 6.204 4.258 11.374 10 12.858v27.617c-5.742 1.484-10 6.653-10 12.858 0 7.364 5.97 13.334 13.333 13.334s13.333-5.97 13.333-13.333c0-6.205-4.258-11.374-10-12.858v-.476c0-5.523 4.479-10 10-10h33.334c5.521 0 10-4.476 10-10v-7.137c5.739-1.488 10-6.657 10-12.863 0-7.363-5.97-13.333-13.33-13.333z"></path></svg>';
    forkBtn.addEventListener('click', () => {
      EventBus.emit('message:fork', msgDiv);
    });
    btnContainer.appendChild(forkBtn);

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

    const viewBtn = card.querySelector('.view-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const filePath = card.dataset.filePath;
        const toolCallId = card.dataset.toolCallId;
        if (filePath) {
          diffModalManager.show(filePath, toolCallId);
        }
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
    return renderToolCardFn(tool);
  }

  renderToolTimelineRow(tool) {
    return renderToolTimelineRowFn(tool);
  }

  renderBashCard(tool) {
    return renderBashCardFn(tool);
  }

  renderEditFileCard(tool) {
    return renderEditFileCardFn(tool);
  }

  renderWriteFileCard(tool) {
    return renderWriteFileCardFn(tool);
  }

  renderTodoWriteCard(tool) {
    return renderTodoWriteCardFn(tool);
  }

  renderAskUserCard(tool) {
    return renderAskUserCardFn(tool);
  }

  renderDefaultToolCard(tool) {
    return renderDefaultToolCardFn(tool);
  }

  parseTodos(args) {
    return parseTodosFn(args);
  }

  parseAskUserArgs(args) {
    return parseAskUserArgsFn(args);
  }

  parseToolArgs(args) {
    return parseToolArgsFn(args);
  }

  getTodoIcon(status) {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '⋯';
      default: return '○';
    }
  }

  /**
   * 从消息内容中解析开头的 @path 引用行，返回结构化 refs 和剩余文字
   */
  _parseRefsFromContent(content) {
    if (!content || typeof content !== 'string' || !content.startsWith('@')) {
      return { refs: null, remainingContent: content };
    }

    const lines = content.split('\n');
    const refs = [];
    let refEndIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('@')) {
        const pathPart = line.substring(1); // 去掉 @
        // 解析 @path:start-end 格式
        const lineMatch = pathPart.match(/^(.+?):(\d+)-(\d+)$/);
        if (lineMatch) {
          refs.push({ type: 'file', path: lineMatch[1], startLine: parseInt(lineMatch[2]), endLine: parseInt(lineMatch[3]) });
        } else {
          refs.push({ type: 'file', path: pathPart, startLine: null, endLine: null });
        }
        refEndIndex = i + 1;
      } else if (line === '' && refEndIndex > 0) {
        // 空行表示引用部分结束
        break;
      } else {
        break;
      }
    }

    const remainingContent = lines.slice(refEndIndex).join('\n').trim();
    return { refs, remainingContent };
  }

  /**
   * 根据 ref 对象创建引用卡片 DOM
   * @param {Object} ref - { type, path, startLine, endLine, text }
   * @param {boolean} [navigable=false] - 是否可点击跳转（历史消息卡片）
   */
  _createRefChip(ref, navigable = false) {
    const chip = document.createElement('span');
    chip.className = 'input-ref-chip';
    if (ref.type === 'file' && ref.path) {
      const fileName = ref.path.split('/').pop();
      const { iconFile } = getFileIconInfo(fileName);
      const hasLines = ref.startLine != null && ref.endLine != null;
      chip.innerHTML = `<img src="icons/${iconFile}" class="input-ref-chip-icon" draggable="false"> <span class="input-ref-chip-text">${fileName}</span>${hasLines ? `<span class="input-ref-chip-lines">${ref.startLine}-${ref.endLine}</span>` : ''}`;
      chip.title = hasLines ? `${ref.path}:${ref.startLine}-${ref.endLine}` : ref.path;
      if (navigable) {
        chip.classList.add('input-ref-chip-navigable');
        chip.dataset.filePath = ref.path;
        chip.dataset.startLine = ref.startLine ?? '';
        chip.dataset.endLine = ref.endLine ?? '';
      }
    } else if (ref.type === 'text' && ref.text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'input-ref-chip-text';
      textSpan.textContent = ref.text.length > 80 ? ref.text.slice(0, 80) + '…' : ref.text;
      chip.appendChild(textSpan);
    }
    if (!chip.classList.contains('input-ref-chip-navigable')) {
      chip.style.pointerEvents = 'none';
    }
    return chip;
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



