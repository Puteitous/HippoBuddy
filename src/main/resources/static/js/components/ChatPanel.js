// 聊天面板核心组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { showToast } from '../utils/toast.js';
import { EventBus } from '../utils/event-bus.js';

export class ChatPanel {
  constructor(container, chatService, chatUI) {
    this.container = container;
    this.chatService = chatService;
    this.chatUI = chatUI;
    
    // 状态
    this.segments = [];
    this.currentText = '';
    this.isSendingMessage = false;
    this.isCompleted = false;
    this.currentAbortController = null;
    this.lastUserMessage = '';
    this.renderTimer = null;
    
    // 渲染性能优化
    this._lastRenderTime = 0;
    this._renderThrottleTimer = null;
    this._pendingRender = null;
    this._hasReceivedData = false;
    
    this.init();
  }
  
  init() {
    this.elements = {
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      stopBtn: document.getElementById('stopBtn'),
      newMsgHint: document.getElementById('newMsgHint'),
      promptModeBar: document.getElementById('promptModeBar'),
      promptModeOptions: document.getElementById('promptModeOptions'),
      promptCustomBtn: document.getElementById('promptCustomBtn'),
      compactBtn: document.getElementById('compactBtn')
    };
    
    this.bindEvents();
  }
  
  bindEvents() {
    // 输入框事件
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      this.elements.messageInput.addEventListener('input', () => {
        this.elements.messageInput.style.height = 'auto';
        this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 150) + 'px';
      });
    }
    
    // 发送按钮
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    }
    
    // 停止按钮
    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener('click', () => this.stopGeneration());
    }
    
    // 滚动事件
    if (this.container) {
      this.container.addEventListener('scroll', () => {
        if (this.isNearBottom()) {
          appState.userScrolledUp = false;
          if (this.elements.newMsgHint) {
            this.elements.newMsgHint.style.display = 'none';
          }
        } else {
          appState.userScrolledUp = true;
          if (this.elements.newMsgHint) {
            this.elements.newMsgHint.style.display = 'flex';
          }
        }
      });
    }
    
    // 点击新消息提示
    if (this.elements.newMsgHint) {
      this.elements.newMsgHint.addEventListener('click', () => {
        this.chatUI.scrollToBottom();
      });
    }
  }
  
  /**
   * 发送消息
   */
  async sendMessage(overrideContent, editMessageId, editMsgDiv) {
    console.log('📤 sendMessage 被调用', { overrideContent, editMessageId });
    
    // 重置状态
    this.isCompleted = false;
    this._hasReceivedData = false;
    
    const content = (typeof overrideContent === 'string' && overrideContent)
      ? overrideContent
      : this.elements.messageInput?.value.trim() || '';
    
    if (!content) {
      console.log('⏭️ sendMessage 跳过：内容为空');
      return;
    }

    // 清空输入框
    if (!overrideContent && !editMessageId && this.elements.messageInput) {
      this.elements.messageInput.value = '';
      this.elements.messageInput.style.height = 'auto';
    }
    
    this.lastUserMessage = content;
    
    // 自动重命名会话（首次发送消息时）
    EventBus.emit('session:auto-name', { sessionId: appState.currentSessionId, content });
    
    // 编辑模式：删除后续消息
    if (editMessageId && editMsgDiv) {
      const contentDiv = editMsgDiv.querySelector('.message-content');
      if (contentDiv) contentDiv.textContent = content;
      const nextSibling = editMsgDiv.nextElementSibling;
      while (nextSibling) {
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      }
    } else {
      // 新增模式：添加用户消息
      const { msgDiv, editBtn } = this.chatUI.appendUserMessage(content);
      if (editBtn) {
        editBtn.addEventListener('click', () => this.startEditMessage(msgDiv));
      }
    }
    
    // 锁定输入
    this.setSendingState(true);
    
    // 创建助手消息容器
    let contentDiv, copyBtn, retryBtn, btnContainer;
    this.segments = [];
    this.currentText = '';
    this._reasoningSegment = null;
    
    try {
      // 创建 AbortController 用于停止生成
      this.currentAbortController = new AbortController();
      
      const result = this.chatUI.appendAssistantMessage();
      contentDiv = result.contentDiv;
      copyBtn = result.copyBtn;
      retryBtn = result.retryBtn;
      btnContainer = result.btnContainer;
      
      // 绑定复制按钮
      this._setupCopyButton(copyBtn, contentDiv);
      
      // 绑定重试按钮
      retryBtn.onclick = () => {
        if (!this.lastUserMessage) return;
        this.chatService.stopGeneration(this.currentAbortController);
        this.currentAbortController = new AbortController();
        contentDiv.innerHTML = '<span class="typing-indicator">...</span>';
        this.segments = [];
        this.currentText = '';
        btnContainer.style.display = 'none';
        this.sendMessage(this.lastUserMessage);
      };
      
      // 调用聊天服务
      await this.chatService.sendMessage(
        appState.currentSessionId,
        content,
        (parsed) => this.handleChunk(parsed, contentDiv, btnContainer),
        this.currentAbortController?.signal,
        appState.getSystemPrompt(),
        editMessageId || null
      );
      
      // 渲染最终内容
      if (this.currentText.trim()) {
        this.segments.push({ type: 'text', content: this.currentText });
      }
      
      if (this.segments.length === 0 && !this.currentText.trim()) {
        contentDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🤖 AI 未返回有效响应，请尝试重新发送</div>';
      } else {
        await this.renderSegmentsFinal(contentDiv, this.segments, '');
      }
      
      btnContainer.style.display = 'flex';
      
    } catch (error) {
      console.error('sendMessage 异常:', error.message);
      console.log('  error.name:', error.name);
      console.log('  error.constructor.name:', error.constructor.name);
      
      if (error.name === 'AbortError' || error.constructor.name === 'AbortError') {
        console.log('🛑 捕获到 AbortError，显示已停止生成');
        if (this.currentText.trim()) {
          this.segments.push({ type: 'text', content: this.currentText });
        }
        await this.renderSegmentsFinal(contentDiv, this.segments, '');
        contentDiv.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ 已停止生成</div>';
      } else {
        const { message, detail } = this._classifyError(error);
        contentDiv.innerHTML = `
          <div style="color: var(--error-color); padding: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">❌ ${escapeHtml(message)}</div>
            ${detail ? `<div style="font-size: 12px; opacity: 0.7;">${escapeHtml(detail)}</div>` : ''}
          </div>`;
        showToast(message, { type: 'error', duration: 6000 });
      }
      
      if (btnContainer) btnContainer.style.display = 'flex';
      
    } finally {
      if (contentDiv) {
        contentDiv.dataset.markdown = this.currentText;
      }
      this.isCompleted = true;
      this.setSendingState(false);
      this.currentAbortController = null;
      
      if (this.elements.messageInput) {
        this.elements.messageInput.focus();
      }
      
      // 通知完成
      EventBus.emit('message:sent');
    }
  }
  
  /**
   * 处理 SSE 数据块
   */
  handleChunk(parsed, contentDiv, btnContainer) {
    if (this.isCompleted) return;
    
    if (parsed._eventType !== 'reasoning' && parsed._eventType !== 'content') {
      console.log('📥 收到 SSE 事件:', parsed._eventType, parsed);
    }
    
    // 处理 waiting_user 事件（优先处理，避免被其他逻辑拦截）
    if (parsed._eventType === 'waiting_user') {
      console.log('📥 收到 waiting_user 事件:', parsed);
      this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input);
      return;
    }
    
    // 处理 message_id 事件（存储消息ID用于编辑功能）
    if (parsed._eventType === 'message_id' && parsed.id) {
      const userMsgDiv = document.querySelector('.message.user:last-child');
      if (userMsgDiv && !userMsgDiv.dataset.messageId) {
        userMsgDiv.dataset.messageId = parsed.id;
      }
      return;
    }
    
    // 处理 thinking 事件 - 新轮次思考开始，重置 reasoning 状态
    if (parsed._eventType === 'thinking') {
      if (this.currentText.trim()) {
        this.segments.push({ type: 'text', content: this.currentText });
        this.currentText = '';
      }
      this._reasoningSegment = null;
      this._flushRender();
      return;
    }
    
    // 处理 clear_content 事件（清空 LLM 多余文本）
    if (parsed._eventType === 'clear_content') {
      console.log('🧹 清空内容');
      this.currentText = '';
      this.segments = [];
      this._reasoningSegment = null;
      contentDiv.innerHTML = '';
      return;
    }
    
    // 处理 retry 事件
    if (parsed.type === 'retry') {
      contentDiv.innerHTML = `<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🔄 ${escapeHtml(parsed.message)}</div>`;
      this.currentText = '';
      this.segments = [];
      return;
    }
    
    // 处理非 JSON 的原始事件（如错误消息）
    if (parsed.type === 'raw' || parsed.type === 'error') {
      contentDiv.innerHTML = `<span style="color: var(--error-color);">❌ ${escapeHtml(parsed.content)}</span>`;
      return;
    }
    
    // 处理 reasoning 事件 - 思考过程流式显示
    if (parsed._eventType === 'reasoning' && parsed.reasoning) {
      if (!this._hasReceivedData) {
        this._hasReceivedData = true;
        contentDiv.querySelector('.typing-indicator')?.remove();
      }
      
      if (!this._reasoningSegment) {
        this._reasoningSegment = { type: 'thinking', content: '', done: false };
        this.segments.push(this._reasoningSegment);
      }
      this._reasoningSegment.content += parsed.reasoning;
      this._scheduleRender(contentDiv, this.segments, this.currentText);
      this.smartScroll();
      return;
    }
    
    // 处理 reasoning_done 事件 - 思考过程结束
    if (parsed._eventType === 'reasoning_done') {
      if (this._reasoningSegment) {
        this._reasoningSegment.done = true;
        this._flushRender();
        this._reasoningSegment = null;
      }
      return;
    }
    
    // 处理 content 事件 - 流式显示（带渲染节流）
    if (parsed._eventType === 'content' && parsed.content) {
      this.currentText += parsed.content;
      
      if (!this._hasReceivedData) {
        this._hasReceivedData = true;
        contentDiv.querySelector('.typing-indicator')?.remove();
      }
      
      this._scheduleRender(contentDiv, this.segments, this.currentText);
      this.smartScroll();
      return;
    }
    
    // 处理 tool_start 事件
    if (parsed._eventType === 'tool_start' && parsed.name) {
      console.log('🔧 工具开始:', parsed.name);
      
      if (!this._hasReceivedData) {
        this._hasReceivedData = true;
        contentDiv.querySelector('.typing-indicator')?.remove();
      }
      
      // 立即刷新任何未完成的节流渲染，确保 segments 最新
      this._flushRender();
      
      // ask_user 工具不在这里渲染，等待 waiting_user 事件处理
      if (parsed.name === 'ask_user') {
        // 跳过渲染，但继续处理后续事件（不 return）
      } else if (parsed.name === 'todo_write') {
        console.log('🔧 收到 todo_write 事件:', parsed);
        // todo_write 工具：更新或创建卡片
        if (this.currentText.trim()) {
          this.segments.push({ type: 'text', content: this.currentText });
          this.currentText = '';
        }
        
        // 查找是否已有 todo_write 工具卡片
        const existingTodoIndex = this.segments.findIndex(s => 
          s.type === 'tool' && s.name === 'todo_write' && !s.result
        );
        
        // 解析当前的 todos
        const incomingTodos = this.chatUI.parseTodos(parsed.args);
        console.log('🔧 todo_write - 收到的 todos:', incomingTodos);
        console.log('  收到数量:', incomingTodos.length);
        
        let finalTodos;
        
        // 如果是更新（已有卡片），合并到现有列表
        if (existingTodoIndex >= 0) {
          const oldSegment = this.segments[existingTodoIndex];
          const oldTodos = this.chatUI.parseTodos(oldSegment.args);
          console.log('🔧 todo_write - 旧的 todos:', oldTodos);
          console.log('  旧的数量:', oldTodos.length);
          
          // 创建映射：id -> todo
          const todoMap = new Map();
          
          // 先放入所有旧的
          oldTodos.forEach(todo => {
            todoMap.set(todo.id, { ...todo });
          });
          
          // 用新的更新（只更新匹配的 id）
          incomingTodos.forEach(newTodo => {
            if (todoMap.has(newTodo.id)) {
              // 更新现有任务
              const existing = todoMap.get(newTodo.id);
              if (newTodo.content) existing.content = newTodo.content;
              if (newTodo.status) existing.status = newTodo.status;
              console.log('  更新任务 id=' + newTodo.id, existing);
            } else {
              // 新任务
              todoMap.set(newTodo.id, {
                id: newTodo.id,
                content: newTodo.content || '未命名任务',
                status: newTodo.status || 'pending'
              });
              console.log('  新增任务 id=' + newTodo.id);
            }
          });
          
          finalTodos = Array.from(todoMap.values());
          console.log('✅ 合并后数量:', finalTodos.length);
        } else {
          console.log('🆕 首次创建 todo 卡片');
          // 首次创建，补充缺失的 content
          finalTodos = incomingTodos.map(todo => ({
            id: todo.id,
            content: todo.content || '未命名任务',
            status: todo.status || 'pending'
          }));
        }
        
        // 更新 args 为最终的完整列表
        parsed.args = JSON.stringify({ todos: finalTodos });
        
        const todoSegment = { 
          type: 'tool', 
          id: parsed.id || null,
          name: 'todo_write', 
          args: parsed.args, 
          result: null, 
          error: null 
        };
        
        if (existingTodoIndex >= 0) {
          // 更新已有的 todo 卡片
          this.segments[existingTodoIndex] = todoSegment;
        } else {
          // 创建新的 todo 卡片
          this.segments.push(todoSegment);
        }
        this.renderSegments(contentDiv, this.segments, this.currentText);
      } else {
        // 其他工具：创建新卡片
        if (this.currentText.trim()) {
          this.segments.push({ type: 'text', content: this.currentText });
          this.currentText = '';
        }
        this.segments.push({ 
          type: 'tool', 
          id: parsed.id || null,
          name: parsed.name, 
          args: parsed.args, 
          result: null, 
          error: null 
        });
        this.renderSegments(contentDiv, this.segments, this.currentText);
      }
      return;
    }
    
    // 处理 tool_result 事件
    if (parsed._eventType === 'tool_result' && parsed.name) {
      // 优先匹配 toolCallId，如果没有则匹配 name
      let existingTool;
      if (parsed.tool_call_id) {
        existingTool = this.segments.find(s => s.type === 'tool' && s.id === parsed.tool_call_id && !s.result);
      }
      if (!existingTool) {
        existingTool = this.segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
      }
      
      if (existingTool) {
        existingTool.result = parsed.success ? 'success' : 'error';
        existingTool.error = parsed.error || null;
        existingTool.resultContent = parsed.result || null;
        this._flushRender();
        this._scheduleRender(contentDiv, this.segments, this.currentText);
      }
      return;
    }
    
    // 处理 waiting_user 事件（嵌套的 ask_user）
    if (parsed._eventType === 'waiting_user') {
      this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input);
      return;
    }
  }
  
  /**
   * 渲染消息片段（带节流）
   */
  async renderSegments(container, segments, currentText) {
    this._scheduleRender(container, segments, currentText);
  }
  
  /**
   * 调度节流渲染：内容快速到达时合并渲染，最多每 ~60ms 一次
   */
  _scheduleRender(container, segments, currentText) {
    const THROTTLE_MS = 60;
    const now = Date.now();
    
    this._pendingRender = { container, segments, currentText };
    
    if (now - this._lastRenderTime >= THROTTLE_MS) {
      this._lastRenderTime = now;
      this._doRender();
    } else if (!this._renderThrottleTimer) {
      this._renderThrottleTimer = setTimeout(() => {
        this._renderThrottleTimer = null;
        this._lastRenderTime = Date.now();
        this._doRender();
      }, THROTTLE_MS);
    }
  }
  
  /**
   * 立即刷新挂起的渲染
   */
  _flushRender() {
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    if (this._pendingRender) {
      this._lastRenderTime = Date.now();
      this._doRender();
    }
  }
  
  /**
   * 保存当前卡片展开状态（防止 innerHTML 重建导致自动收起）
   */
  _saveCardStates(container) {
    const states = new Map();
    
    // 思考卡片：按索引保存 data-expanded 状态
    container.querySelectorAll('.thinking-bubble.completed').forEach((bubble, idx) => {
      const content = bubble.querySelector('.thinking-content');
      states.set(`thinking:${idx}`, {
        expanded: bubble.dataset.expanded === 'true',
        display: content ? content.style.display : ''
      });
    });
    
    // 工具卡片：按工具名称+索引保存 expanded 状态
    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      const header = card.querySelector('.tool-header, .tool-call-header');
      const isExpanded = header?.classList.contains('expanded');
      // 用工具名+内容hash做key
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      states.set(`tool:${name}:${card.dataset.expandedKey || ''}`, {
        expanded: isExpanded || false
      });
    });
    
    return states;
  }
  
  /**
   * 恢复卡片展开状态
   */
  _restoreCardStates(container, states) {
    if (!states || states.size === 0) return;
    
    // 恢复思考卡片（按索引匹配）
    container.querySelectorAll('.thinking-bubble.completed').forEach((bubble, idx) => {
      const thinkingState = states.get(`thinking:${idx}`);
      if (thinkingState?.expanded) {
        bubble.dataset.expanded = 'true';
        const content = bubble.querySelector('.thinking-content');
        if (content) content.style.display = 'block';
        const toggleIcon = bubble.querySelector('.toggle-icon');
        if (toggleIcon) toggleIcon.textContent = '▼';
      }
    });
    
    // 恢复工具卡片
    container.querySelectorAll('.tool-card, .tool-call-card').forEach((card, idx) => {
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      const key = `tool:${name}:${card.dataset.expandedKey || ''}`;
      const saved = states.get(key);
      
      if (saved?.expanded) {
        const header = card.querySelector('.tool-header, .tool-call-header');
        const details = header?.nextElementSibling;
        header?.classList.add('expanded');
        details?.classList.add('show');
      }
    });
  }
  
  /**
   * 执行实际的 DOM 渲染
   */
  async _doRender() {
    const pending = this._pendingRender;
    if (!pending) return;
    this._pendingRender = null;
    
    const { container, segments, currentText } = pending;
    
    // 保存展开状态（防止 innerHTML 重建导致卡片收起）
    const savedStates = this._saveCardStates(container);
    
    let html = '';
    for (const segment of segments) {
      if (segment.type === 'thinking') {
        html += this._renderThinkingBubble(segment);
      } else if (segment.type === 'tool') {
        html += this.chatUI.renderToolCard(segment);
      } else if (segment.type === 'text' && segment.content) {
        html += await renderMarkdown(segment.content);
      }
    }
    if (currentText) {
      html += await renderMarkdown(currentText);
    }
    container.innerHTML = html;
    
    // 恢复展开状态
    this._restoreCardStates(container, savedStates);
    
    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      if (this.chatUI.bindToolCardEvents) {
        this.chatUI.bindToolCardEvents(card);
      }
    });
    
    container.querySelectorAll('.ask-user-card').forEach(card => {
      this._bindAskUserCardEvents(card);
    });
    
    this.smartScroll();
  }
  
  /**
   * 最终渲染（立即执行）
   */
  async renderSegmentsFinal(container, segments, currentText) {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = { container, segments, currentText };
    await this._doRender();
  }
  
  _setupCopyButton(copyBtn, contentDiv) {
    const btnContainer = copyBtn.parentNode;
    if (!btnContainer) {
      copyBtn.onclick = () => {
        const textToCopy = contentDiv.innerText;
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      };
      return;
    }
    
    const menu = document.createElement('div');
    menu.className = 'copy-menu';
    menu.innerHTML = `
      <div class="copy-menu-item" data-type="markdown">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        复制 Markdown
        <span class="copy-shortcut">MD</span>
      </div>
      <div class="copy-menu-item" data-type="text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        复制纯文本
        <span class="copy-shortcut">TXT</span>
      </div>
    `;
    
    btnContainer.appendChild(menu);
    
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      document.querySelectorAll('.copy-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
      });
      
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.copy-menu-item');
      if (!item) return;
      
      const type = item.dataset.type;
      let textToCopy;
      
      if (type === 'markdown') {
        textToCopy = contentDiv.dataset.markdown || contentDiv.innerHTML;
      } else {
        textToCopy = contentDiv.innerText;
      }
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        menu.style.display = 'none';
        const label = type === 'markdown' ? 'Markdown' : '纯文本';
        showToast(`已复制 ${label}`, { type: 'success', duration: 2000 });
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        showToast('复制失败', { type: 'error', duration: 3000 });
      });
    });
    
    document.addEventListener('click', () => {
      menu.style.display = 'none';
    }, { passive: true });
  }
  
  /**
   * 渲染思考气泡
   */
  _renderThinkingBubble(segment) {
    const escapedContent = escapeHtml(segment.content);
    
    if (segment.done) {
      return `
        <div class="thinking-bubble completed" data-expanded="false">
          <div class="thinking-header" onclick="this.closest('.thinking-bubble').dataset.expanded = this.closest('.thinking-bubble').dataset.expanded === 'true' ? 'false' : 'true'; this.querySelector('.toggle-icon').textContent = this.closest('.thinking-bubble').dataset.expanded === 'true' ? '▼' : '▶'; const content = this.nextElementSibling; if(content) content.style.display = this.closest('.thinking-bubble').dataset.expanded === 'true' ? 'block' : 'none';">
            <span class="thinking-icon">💭</span>
            <span class="thinking-label">已思考</span>
            <span class="toggle-icon">▶</span>
          </div>
          <div class="thinking-content" style="display:none;">${escapedContent}</div>
        </div>`;
    }
    
    return `
      <div class="thinking-bubble streaming">
        <div class="thinking-header">
          <span class="thinking-spinner"></span>
          <span class="thinking-label">思考中...</span>
        </div>
        <div class="thinking-content">${escapedContent}</div>
      </div>`;
  }
  
  _showAskUserCard(question, options, allowCustomInput) {
    const { contentDiv } = this.chatUI.appendAssistantMessage('');
    
    const segments = [{
      type: 'tool',
      name: 'ask_user',
      args: JSON.stringify({
        question: question,
        options: options || [],
        allow_custom_input: allowCustomInput !== false
      }),
      result: null,
      error: null
    }];
    
    this._askUserContentDiv = contentDiv;
    this.renderSegments(contentDiv, segments, '');
  }
  
  _sendAskUserResponse(message) {
    if (!message || this.isSendingMessage) return;
    
    const sessionId = appState.currentSessionId;
    if (!sessionId) return;
    
    this.isSendingMessage = true;
    this.setSendingState(true);
    this.currentAbortController = new AbortController();
    
    const { contentDiv: responseContentDiv } = this.chatUI.appendAssistantMessage('');
    let currentText = '';
    let segments = [];
    let reasoningSegment = null;
    
    this.chatService.executeRequest(
      sessionId,
      message,
      (parsed) => {
        if (parsed._eventType === 'reasoning' && parsed.reasoning) {
          if (!reasoningSegment) {
            reasoningSegment = { type: 'thinking', content: '', done: false };
            segments.push(reasoningSegment);
          }
          reasoningSegment.content += parsed.reasoning;
          this._scheduleRender(responseContentDiv, segments, currentText);
          this.chatUI.scrollToBottom();
          return;
        }
        
        if (parsed._eventType === 'reasoning_done') {
          if (reasoningSegment) {
            reasoningSegment.done = true;
            this._flushRender();
            reasoningSegment = null;
          }
          return;
        }
        
        if (parsed._eventType === 'content' && parsed.content) {
          currentText += parsed.content;
          this._scheduleRender(responseContentDiv, segments, currentText);
          this.chatUI.scrollToBottom();
          return;
        }
        
        if (parsed._eventType === 'clear_content') {
          currentText = '';
          segments = [];
          reasoningSegment = null;
          responseContentDiv.innerHTML = '';
          return;
        }
        
        if (parsed._eventType === 'tool_start' && parsed.name) {
          if (currentText.trim()) {
            segments.push({ type: 'text', content: currentText });
            currentText = '';
          }
          segments.push({
            type: 'tool',
            name: parsed.name,
            args: parsed.args || '{}',
            result: null,
            error: null
          });
          this._scheduleRender(responseContentDiv, segments, currentText);
          return;
        }
        
        if (parsed._eventType === 'tool_result' && parsed.name) {
          const existingTool = segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
          if (existingTool) {
            existingTool.result = parsed.success ? 'success' : 'error';
            existingTool.error = parsed.error || null;
            existingTool.resultContent = parsed.result || null;
            this._flushRender();
            this._scheduleRender(responseContentDiv, segments, currentText);
          }
          return;
        }
        
        if (parsed._eventType === 'waiting_user') {
          this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input);
          return;
        }
        
        if (parsed._eventType === 'error' && parsed.message) {
          currentText = '⚠️ ' + parsed.message;
          this._scheduleRender(responseContentDiv, segments, currentText);
          this.chatUI.scrollToBottom();
          return;
        }
        
        if (parsed._eventType === 'done') {
          return;
        }
      },
      this.currentAbortController?.signal,
      null,
      null
    ).then(() => {
      if (currentText.trim()) {
        segments.push({ type: 'text', content: currentText });
      }
      this.renderSegmentsFinal(responseContentDiv, segments, '');
    }).catch(error => {
      if (error.name === 'AbortError') {
        if (currentText.trim()) {
          segments.push({ type: 'text', content: currentText });
        }
        this.renderSegmentsFinal(responseContentDiv, segments, '');
        responseContentDiv.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ 已停止生成</div>';
        return;
      }
      console.error('发送失败:', error);
      const { message, detail } = this._classifyError(error);
      responseContentDiv.innerHTML = `
        <div style="color: var(--error-color); padding: 8px;">
          <div style="font-weight: 600; margin-bottom: 4px;">❌ ${escapeHtml(message)}</div>
          ${detail ? `<div style="font-size: 12px; opacity: 0.7;">${escapeHtml(detail)}</div>` : ''}
        </div>`;
      showToast(message, { type: 'error', duration: 6000 });
    }).finally(() => {
      this.isSendingMessage = false;
      this.setSendingState(false);
      this.currentAbortController = null;
      EventBus.emit('message:sent');
    });
  }
  
  _bindAskUserCardEvents(card) {
    const optionBtns = card.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const option = btn.getAttribute('data-option');
        if (option) this._sendAskUserResponse(option);
      });
    });
    
    const sendBtn = card.querySelector('.send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const textarea = card.querySelector('.ask-user-input');
        const userInput = textarea?.value.trim();
        if (!userInput) {
          showToast('请输入你的回答', 'warning');
          return;
        }
        this._sendAskUserResponse(userInput);
      });
    }
  }
  
  /**
   * 智能滚动
   */
  smartScroll() {
    if (this.isNearBottom()) {
      this.chatUI.scrollToBottom();
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'none';
      }
      appState.userScrolledUp = false;
    } else {
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'flex';
      }
      appState.userScrolledUp = true;
    }
  }
  
  /**
   * 检查是否在底部
   */
  isNearBottom() {
    if (!this.container) return true;
    
    const threshold = 100;
    const scrollTop = this.container.scrollTop;
    const scrollHeight = this.container.scrollHeight;
    const clientHeight = this.container.clientHeight;
    
    return scrollHeight - scrollTop - clientHeight < threshold;
  }
  
  /**
   * 将错误分类为用户友好的消息
   */
  _classifyError(error) {
    const msg = error.message || '';
    
    if (error.name === 'TypeError' && (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
      return { message: '网络连接失败，请检查后端服务是否正常运行', detail: '无法与服务器建立连接，请确认服务已启动且网络通畅' };
    }
    
    if (msg.includes('超时') || msg.includes('timeout') || msg.includes('Timeout')) {
      return { message: '请求超时，服务响应时间过长', detail: '请稍后重试，或检查服务是否负载过高' };
    }
    
    if (msg.includes('HTTP error') || /status:? \d{3}/i.test(msg)) {
      const statusMatch = msg.match(/(\d{3})/);
      const status = statusMatch ? statusMatch[1] : '';
      if (status === '502' || status === '503' || status === '504') {
        return { message: `服务暂时不可用 (${status})`, detail: '后端服务暂时无法处理请求，请稍后重试' };
      }
      if (status === '429') {
        return { message: '请求过于频繁 (429)', detail: '请稍后重试' };
      }
      if (status === '401' || status === '403') {
        return { message: `权限不足 (${status})`, detail: '请检查认证信息是否正确' };
      }
      return { message: `服务异常 (${status || msg})`, detail: '请稍后重试，如问题持续请联系管理员' };
    }
    
    if (msg.includes('LLM 未返回有效内容')) {
      return { message: 'AI 未返回有效响应', detail: '请尝试重新发送消息' };
    }
    
    return { message: msg || '未知错误', detail: null };
  }
  
  /**
   * 设置发送状态
   */
  setSendingState(isSending) {
    this.isSendingMessage = isSending;
    
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = isSending;
      this.elements.sendBtn.style.display = isSending ? 'none' : 'inline-block';
    }
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = !isSending;
      this.elements.stopBtn.style.display = isSending ? 'inline-block' : 'none';
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (!this.currentAbortController) {
      return;
    }
    
    if (this.isCompleted) {
      return;
    }
    
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = true;
    }
    
    this.chatService.stopGeneration(this.currentAbortController);
  }
  
  /**
   * 开始编辑消息
   */
  startEditMessage(msgDiv) {
    const contentDiv = msgDiv.querySelector('.message-content');
    if (!contentDiv) return;
    
    if (msgDiv.classList.contains('editing')) return;
    msgDiv.classList.add('editing');
    
    const originalText = contentDiv.textContent;
    
    const editContainer = document.createElement('div');
    editContainer.className = 'message-edit-container';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = originalText;
    textarea.rows = Math.min(Math.max(originalText.split('\n').length, 2), 8);
    
    const editActions = document.createElement('div');
    editActions.className = 'message-edit-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-edit-cancel';
    cancelBtn.textContent = '取消';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-edit-save';
    saveBtn.textContent = '保存并重新生成';
    
    editActions.appendChild(cancelBtn);
    editActions.appendChild(saveBtn);
    editContainer.appendChild(textarea);
    editContainer.appendChild(editActions);
    
    contentDiv.style.display = 'none';
    const btnContainer = msgDiv.querySelector('.message-actions');
    if (btnContainer) btnContainer.style.display = 'none';
    
    contentDiv.parentNode.insertBefore(editContainer, contentDiv.nextSibling);
    
    textarea.focus();
    textarea.select();
    
    // 取消编辑
    cancelBtn.onclick = () => {
      msgDiv.classList.remove('editing');
      editContainer.remove();
      contentDiv.style.display = '';
      if (btnContainer) btnContainer.style.display = '';
    };
    
    // 保存编辑
    saveBtn.onclick = () => {
      const newContent = textarea.value.trim();
      if (!newContent || newContent === originalText) {
        cancelBtn.click();
        return;
      }
      
      const messageId = msgDiv.dataset.messageId;
      msgDiv.classList.remove('editing');
      editContainer.remove();
      
      if (messageId) {
        this.sendMessage(newContent, messageId, msgDiv);
      } else {
        contentDiv.textContent = newContent;
        contentDiv.style.display = '';
        if (btnContainer) btnContainer.style.display = '';
      }
    };
    
    // 键盘事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }
}
