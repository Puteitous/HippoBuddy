import { escapeHtml, formatTime, safeParseJSON } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { EventBus } from './utils/event-bus.js';

export class ChatUI {
  constructor(container) {
    this.container = container;
  }

  clear() {
    this.container.innerHTML = '<div class="empty-state">发送消息开始对话</div>';
  }

  removeEmptyState() {
    const emptyState = this.container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
  }

  appendUserMessage(content, messageId) {
    this.removeEmptyState();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    if (messageId) msgDiv.dataset.messageId = messageId;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    msgDiv.appendChild(contentDiv);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    btnContainer.appendChild(editBtn);

    msgDiv.appendChild(btnContainer);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(new Date());
    msgDiv.appendChild(timeDiv);
    
    this.container.appendChild(msgDiv);
    this.scrollToBottom();
    return { msgDiv, contentDiv, editBtn, btnContainer };
  }

  appendAssistantMessage(initialHTML = '<span class="typing-indicator">...</span>') {
    this.removeEmptyState();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.dataset.timestamp = Date.now().toString();
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = initialHTML;
    msgDiv.appendChild(contentDiv);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'message-actions';
    btnContainer.style.display = 'none';

    const retryBtn = document.createElement('button');
    retryBtn.className = 'message-action-btn';
    retryBtn.title = '重试';
    retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    btnContainer.appendChild(retryBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btnContainer.appendChild(copyBtn);

    const rollbackBtn = document.createElement('button');
    rollbackBtn.className = 'message-action-btn rollback-btn';
    rollbackBtn.title = '回退此消息的文件修改';
    rollbackBtn.innerHTML = '↩';
    rollbackBtn.addEventListener('click', () => {
      EventBus.emit('message:rollback', msgDiv);
    });
    btnContainer.appendChild(rollbackBtn);

    msgDiv.appendChild(btnContainer);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(new Date());
    msgDiv.appendChild(timeDiv);
    
    this.container.appendChild(msgDiv);
    this.scrollToBottom();
    return { contentDiv, copyBtn, retryBtn, btnContainer, msgDiv };
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

    copyBtn.onclick = () => {
        const textToCopy = contentDiv.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      };
    contentDiv.dataset.markdown = content;
    msgDiv.appendChild(btnContainer);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = timestamp ? formatTime(new Date(timestamp)) : formatTime(new Date());
    msgDiv.appendChild(timeDiv);
    
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
    if (header) {
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
        window.undoFileChange(undoBtn);
      });
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
    
    // 发送按钮点击事件
    const sendBtn = card.querySelector('.send-btn');
    console.log('  找到发送按钮:', sendBtn !== null);
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const textarea = card.querySelector('.ask-user-input');
        const userInput = textarea.value.trim();
        console.log('📤 发送按钮被点击，用户输入:', userInput);
        
        if (!userInput) {
          showToast('请输入你的回答', 'warning');
          return;
        }
        EventBus.emit('ask_user:respond', userInput);
      });
    }
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

  renderTodoWriteCard(tool) {
    const todos = this.parseTodos(tool.args);
    console.log('📋 renderTodoWriteCard - todos:', todos);
    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return `
      <div class="tool-card todo-card">
        <div class="tool-header expanded">
          <span class="tool-icon">📋</span>
          <span class="tool-title">任务清单</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details show">
          <div class="todo-progress-bar">
            <div class="progress-text">${progress}% (${completed}/${total}) 已完成</div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>
          <div class="todo-list">
            ${todos.map(todo => {
              const isCompleted = todo.status === 'completed';
              const icon = isCompleted ? '✅' : '○';
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
    let duration = null;
    if (tool.resultContent) {
      const lines = tool.resultContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('退出码:') || line.startsWith('退出代码:')) {
          const match = line.match(/(\d+)/);
          if (match) exitCode = match[1];
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

    const statusIcon = isSuccess ? '✅' : isError ? '❌' : '⋯';
    const statusText = isSuccess ? '成功' : isError ? '失败' : '运行中';

    return `
      <div class="tool-card bash-card">
        <div class="tool-header">
          <span class="tool-icon">💻</span>
          <span class="tool-title">终端命令</span>
          <span class="tool-status-badge ${isSuccess ? 'success' : isError ? 'error' : 'running'}">${statusIcon} ${statusText}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="bash-command">${escapeHtml(command)}</div>
          ${workingDir ? `<div class="bash-meta">📂 ${escapeHtml(workingDir)}</div>` : ''}
          ${exitCode !== null ? `<div class="bash-meta">🔚 退出码: ${exitCode} ${duration ? `| ⏱ ${duration}ms` : ''}</div>` : ''}
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

    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    return `
      <div class="tool-card editfile-card" data-file-path="${escapeHtml(filePath)}">
        <div class="tool-header">
          <span class="tool-icon">✏️</span>
          <span class="tool-title">编辑文件</span>
          <span class="tool-status-badge ${isSuccess ? 'success' : 'error'}">${isSuccess ? '✅ 成功' : '❌ 失败'}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="editfile-path">📁 ${escapeHtml(filePath)}</div>
          ${isSuccess ? `
          <div class="editfile-diff">
            <div class="diff-section diff-old">
              <div class="diff-label">❌ 原文本</div>
              ${oldLines.map((line, i) => `<div class="diff-line old"><span class="diff-line-num">${i + 1}</span><span class="diff-line-content">${escapeHtml(line)}</span></div>`).join('')}
            </div>
            <div class="diff-arrow">⬇</div>
            <div class="diff-section diff-new">
              <div class="diff-label">✅ 新文本</div>
              ${newLines.map((line, i) => `<div class="diff-line new"><span class="diff-line-num">${i + 1}</span><span class="diff-line-content">${escapeHtml(line)}</span></div>`).join('')}
            </div>
          </div>
          <div class="file-action-bar">
            <span class="file-action-status kept">✓ 已保留</span>
            <button class="file-action-btn undo-btn">↩ 撤销</button>
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

    const contentLines = content.split('\n');

    return `
      <div class="tool-card writefile-card" data-file-path="${escapeHtml(filePath)}">
        <div class="tool-header">
          <span class="tool-icon">📝</span>
          <span class="tool-title">写入文件</span>
          <span class="tool-status-badge ${isSuccess ? 'success' : 'error'}">${isSuccess ? '✅ 成功' : '❌ 失败'}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="writefile-path">📁 ${escapeHtml(filePath)}</div>
          ${isSuccess ? `
          <div class="writefile-content">
            <div class="writefile-label">📄 写入内容</div>
            <div class="writefile-lines">
              ${contentLines.map((line, i) => `<div class="writefile-line"><span class="writefile-line-num">${i + 1}</span><span class="writefile-line-content">${escapeHtml(line)}</span></div>`).join('')}
            </div>
          </div>
          <div class="file-action-bar">
            <span class="file-action-status kept">✓ 已保留</span>
            <button class="file-action-btn undo-btn">↩ 撤销</button>
          </div>` : ''}
          ${isError && tool.error ? `<div class="writefile-error">${escapeHtml(tool.error)}</div>` : ''}
        </div>
      </div>
    `;
  }

  renderAskUserCard(tool) {
    const { question, options, allow_custom_input } = this.parseAskUserArgs(tool.args);
    const hasOptions = options && options.length > 0;
    
    return `
      <div class="tool-card ask-user-card" data-question="${escapeHtml(question)}" data-allow-custom="${allow_custom_input !== false}">
        <div class="tool-header expanded">
          <span class="tool-icon">❓</span>
          <span class="tool-title">需要你的确认</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details show">
          <div class="question-text">${escapeHtml(question)}</div>
          ${hasOptions ? `
            <div class="options-list">
              ${options.map((opt, i) => `
                <button class="option-btn" data-option="${escapeHtml(opt, true)}">${escapeHtml(opt)}</button>
              `).join('')}
            </div>
          ` : ''}
          ${allow_custom_input !== false ? `
            <div class="custom-input-area">
              <textarea class="ask-user-input" placeholder="输入你的回答..."></textarea>
              <button class="send-btn">发送</button>
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
    
    return `
      <div class="tool-call-card">
        <div class="tool-call-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-status ${tool.result || 'running'}">${tool.result === 'success' ? '✓ 成功' : tool.result === 'error' ? '✗ 失败' : '⋯ 运行中'}</span>
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

window.undoFileChange = async function(btn) {
  const card = btn.closest('.editfile-card, .writefile-card');
  const filePath = card.dataset.filePath;
  if (!filePath) return;

  if (!confirm('确定要撤销对文件的修改吗？')) return;

  try {
    const response = await fetch('/api/files/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: filePath })
    });
    const result = await response.json();
    if (result.success) {
      const actionBar = card.querySelector('.file-action-bar');
      if (actionBar) {
        actionBar.innerHTML = '<span class="file-action-status undone">↩ 已撤销</span>';
      }
    } else {
      showToast('撤销失败：' + (result.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('撤销失败：' + e.message, 'error');
  }
};
