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
    this._lastUserMsgDiv = null;
    this._lastUserMessageId = null;
    this._runningToolCallIds = new Set();
    this._destroyed = false;

    // 增量渲染：streaming 文本快速更新
    this._streamingAnchor = null;
    this._lastSegmentCount = 0;
    this._pendingIsTextOnly = false;

    this.init();
  }
  
  init() {
    this.elements = {
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      stopBtn: document.getElementById('stopBtn'),
      newMsgHint: document.getElementById('newMsgHint'),
      compactBtn: document.getElementById('compactBtn')
    };
    
    this.bindEvents();
  }
  
  bindEvents() {
    if (!this.container) return;
    // 输入框事件
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      this.elements.messageInput.addEventListener('input', () => {
        const el = this.elements.messageInput;
        const prevHeight = el.style.height;
        el.style.height = 'auto';
        const newHeight = Math.min(el.scrollHeight, 300) + 'px';
        el.style.height = prevHeight || el.offsetHeight + 'px';
        void el.offsetHeight;
        el.style.height = newHeight;
      });
    }
    
    // Hero 输入框事件（事件代理）
    this.container.addEventListener('keydown', (e) => {
      const heroInput = e.target.closest('#heroInput');
      if (!heroInput) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const content = heroInput.value.trim();
        if (content) {
          heroInput.value = '';
          heroInput.style.height = 'auto';
          this.sendMessage(content);
        }
      }
    });
    
    this.container.addEventListener('input', (e) => {
      const heroInput = e.target.closest('#heroInput');
      if (!heroInput) return;
      const prevHeight = heroInput.style.height;
      heroInput.style.height = 'auto';
      const newHeight = Math.min(heroInput.scrollHeight, 300) + 'px';
      heroInput.style.height = prevHeight || heroInput.offsetHeight + 'px';
      void heroInput.offsetHeight;
      heroInput.style.height = newHeight;
    });
    
    // Hero 快捷建议按钮
    this.container.addEventListener('click', (e) => {
      // 河马互动：点击弹跳 + 吐泡泡
      const hippo = e.target.closest('.empty-hero-logo');
      if (hippo) {
        hippo.classList.remove('bouncing');
        void hippo.offsetWidth;
        hippo.classList.add('bouncing');
        setTimeout(() => hippo.classList.remove('bouncing'), 500);
        this._spawnHippoBubbles(hippo);
        this._spawnHippoSpeech(hippo);
        return;
      }
      
      const suggestionBtn = e.target.closest('.empty-hero-suggestion');
      if (suggestionBtn) {
        const prompt = suggestionBtn.dataset.prompt;
        if (prompt) {
          this.sendMessage(prompt);
        }
      }
      // Hero 发送按钮
      const heroSendBtn = e.target.closest('#heroSendBtn');
      if (heroSendBtn) {
        const heroInput = document.getElementById('heroInput');
        if (heroInput) {
          const content = heroInput.value.trim();
          if (content) {
            heroInput.value = '';
            heroInput.style.height = 'auto';
            this.sendMessage(content);
          }
        }
      }
    });
    
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
        if (this.isNearBottom(100)) {
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
    
    // 编辑模式：替换消息内容并删除后续消息
    if (editMsgDiv) {
      const row = editMsgDiv.closest('.message-row') || editMsgDiv;
      const contentDiv = editMsgDiv.querySelector('.message-content');
      if (contentDiv) contentDiv.textContent = content;
      let nextSibling = row.nextElementSibling;
      while (nextSibling) {
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      }
    } else {
      // 新增模式：添加用户消息
      const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      this._lastUserMessageId = tempId;
      const { msgDiv, editBtn } = this.chatUI.appendUserMessage(content, tempId);
      this._lastUserMsgDiv = msgDiv;
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
      this._responseContentDiv = contentDiv;
      this._responseBtnContainer = btnContainer;
      
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
      this.chatUI.scrollToBottom();
      
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
      this.chatUI.scrollToBottom();
      
    } finally {
      if (contentDiv) {
        contentDiv.dataset.markdown = this.currentText;
      }
      this.isCompleted = true;
      this.setSendingState(false);
      this.currentAbortController = null;
      
      if (this.elements.messageInput) {
        this.elements.messageInput.focus();
        // 明确将光标置于起始位置，避免空输入框时 placeholder 与光标位置的视觉混淆
        requestAnimationFrame(() => {
          this.elements.messageInput.setSelectionRange(0, 0);
          this.elements.messageInput.scrollLeft = 0;
        });
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
      this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input, contentDiv);
      return;
    }
    
    // 处理 message_id 事件（存储消息ID用于编辑和回滚功能）
    if (parsed._eventType === 'message_id' && parsed.id) {
      const userMsgDiv = this._lastUserMsgDiv;
      if (userMsgDiv) {
        userMsgDiv.dataset.messageId = parsed.id;
        this._lastUserMessageId = parsed.id;
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
    
    // 处理 SSE error 事件（来自后端的结构化错误，附带 message 字段）
    if (parsed._eventType === 'error' && parsed.message) {
      if (this._reasoningSegment) {
        this._reasoningSegment.done = true;
        this._reasoningSegment = null;
      }
      this.currentText = '⚠️ ' + parsed.message;
      this._scheduleRender(contentDiv, this.segments, this.currentText);
      return;
    }

    // 处理非 JSON 的原始事件（如解析失败的错误消息）
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
        // 强制重新渲染，将思考卡片从 "streaming"（思考中...）更新为 "completed"（已思考）
        // 直接设置 _pendingRender 确保即使节流渲染已完成也能触发 _doRender
        this._pendingRender = { container: contentDiv, segments: this.segments, currentText: this.currentText };
        this._flushRender();
        this._reasoningSegment = null;
      }
      return;
    }
    
    // 处理 content 事件 - 流式显示（带渲染节流）
    if (parsed._eventType === 'content' && parsed.content) {
      // 如果 reasoning_done 未正常到达，但 content 已经来了，隐式结束思考
      if (this._reasoningSegment) {
        this._reasoningSegment.done = true;
        this._pendingRender = { container: contentDiv, segments: this.segments, currentText: this.currentText };
        this._flushRender();
        this._reasoningSegment = null;
      }
      this.currentText += parsed.content;
      
      if (!this._hasReceivedData) {
        this._hasReceivedData = true;
        contentDiv.querySelector('.typing-indicator')?.remove();
      }
      
      this._pendingIsTextOnly = true;
      this._scheduleRender(contentDiv, this.segments, this.currentText);
      this.smartScroll();
      return;
    }
    
    // 处理 tool_start 事件
    if (parsed._eventType === 'tool_start' && parsed.name) {
      console.log('🔧 工具开始:', parsed.name);
      
      if (parsed.id) {
        this._runningToolCallIds.add(parsed.id);
      }
      
      if (!this._hasReceivedData) {
        this._hasReceivedData = true;
        contentDiv.querySelector('.typing-indicator')?.remove();
      }
      
      // 如果 reasoning_done 未正常到达，但 tool 已经来了，隐式结束思考
      if (this._reasoningSegment) {
        this._reasoningSegment.done = true;
        this._reasoningSegment = null;
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
      // 清理运行追踪
      const resultId = parsed.tool_call_id || parsed.id;
      if (resultId) {
        this._runningToolCallIds.delete(resultId);
      }
      
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
        existingTool.confirmationData = null;
        existingTool.progressLines = null; // 清除实时进度
        this._flushRender();
        this._scheduleRender(contentDiv, this.segments, this.currentText);
      }
      return;
    }

    // 处理 tool_progress 事件
    if (parsed._eventType === 'tool_progress' && parsed.id) {
      const existingTool = this.segments.find(s =>
        s.type === 'tool' && s.id === parsed.id && !s.result
      );
      if (existingTool) {
        existingTool.progressLines = existingTool.progressLines || [];
        existingTool.progressLines.push(parsed.line);
        this._flushRender();
        this._scheduleRender(contentDiv, this.segments, this.currentText);
      }
      return;
    }

    // 处理 tool_confirmation 事件
    if (parsed._eventType === 'tool_confirmation' && parsed.confirmId) {
      const bashSegment = this.segments.find(s =>
        s.type === 'tool' && s.name === 'bash' && !s.result && !s.confirmationData
      );
      if (bashSegment) {
        bashSegment.confirmationData = {
          confirmId: parsed.confirmId,
          command: parsed.command,
          riskLevel: parsed.riskLevel,
          riskReason: parsed.riskReason
        };
        this._flushRender();
        this._scheduleRender(contentDiv, this.segments, this.currentText);
      }
      return;
    }
    
    // 处理 waiting_user 事件（嵌套的 ask_user）
    if (parsed._eventType === 'waiting_user') {
      this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input, contentDiv);
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
    
    this._pendingRender = { container, segments, currentText, _isTextOnly: !!this._pendingIsTextOnly };
    this._pendingIsTextOnly = false;
    
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
   * 立即刷新挂起的渲染（总是全量重建——仅在纯文本 streaming 时走增量路径）
   */
  _flushRender() {
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    if (this._pendingRender) {
      this._pendingRender._isTextOnly = false;
      this._lastRenderTime = Date.now();
      this._doRender();
    }
  }
  
  /**
   * 保存当前卡片展开状态（防止 innerHTML 重建导致自动收起）
   */
  _saveCardStates(container) {
    const states = new Map();
    
    // 思考卡片：按索引保存 expanded 状态
    container.querySelectorAll('.thinking-row.completed').forEach((bubble, idx) => {
      states.set(`thinking:${idx}`, {
        expanded: bubble.classList.contains('expanded')
      });
    });
    
    // 工具卡片：按工具名称+索引保存 expanded 状态
    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      const header = card.querySelector('.tool-header, .tool-call-header');
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      // todo/ask_user: expanded 在 card 上；bash/edit/write: expanded 在 header 上
      const isExpanded = card.classList.contains('expanded') || header?.classList.contains('expanded') || false;
      states.set(`tool:${name}:${card.dataset.expandedKey || ''}`, {
        expanded: isExpanded || false
      });
    });
    
    // 时间线行：按工具名称保存 expanded 状态
    container.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const name = item.dataset.toolName || 'unknown';
      states.set(`timeline:${name}:${idx}`, {
        expanded: item.classList.contains('expanded')
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
    container.querySelectorAll('.thinking-row.completed').forEach((bubble, idx) => {
      const thinkingState = states.get(`thinking:${idx}`);
      if (thinkingState?.expanded) {
        bubble.classList.add('expanded');
        const content = bubble.querySelector('.thinking-row-content');
        if (content) {
          const h = content.scrollHeight;
          // 离屏 DOM 中 scrollHeight 可能为 0，用很大值兜底（自然高度）
          const isCapped = h > 300;
          content.style.maxHeight = (h > 0 ? (isCapped ? '300px' : h + 'px') : '9999px');
          content.style.overflowY = isCapped ? 'auto' : '';
        }
      }
    });
    
    // 恢复工具卡片
    container.querySelectorAll('.tool-card, .tool-call-card').forEach((card, idx) => {
      const nameEl = card.querySelector('.tool-title, .tool-name');
      const name = nameEl?.textContent || 'unknown';
      const key = `tool:${name}:${card.dataset.expandedKey || ''}`;
      const saved = states.get(key);
      
      if (saved?.expanded) {
        if (card.classList.contains('tool-card')) {
          // todo/ask_user: expanded 在 card 上，通过 JS 设 maxHeight
          card.classList.add('expanded');
          const details = card.querySelector('.tool-call-details');
          if (details) {
            const h = details.scrollHeight;
            details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
          }
        } else {
          // bash/edit/write: expanded 在 header 上，通过 CSS .show 控制
          const header = card.querySelector('.tool-header, .tool-call-header');
          const details = header?.nextElementSibling;
          header?.classList.add('expanded');
          details?.classList.add('show');
        }
      }
    });
    
    // 恢复时间线行状态
    container.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const name = item.dataset.toolName || 'unknown';
      const saved = states.get(`timeline:${name}:${idx}`);
      const isPendingConfirm = item.dataset.toolStatus === 'pending_confirmation';
      if (saved?.expanded || isPendingConfirm) {
        item.classList.add('expanded');
        const detail = item.querySelector('.tool-timeline-detail');
        if (detail) {
          const h = detail.scrollHeight;
          detail.style.maxHeight = h > 0 ? h + 'px' : '9999px';
        }
      }
    });
  }
  
  /**
   * 执行实际的 DOM 渲染
   *
   * — 纯文本 streaming（_isTextOnly）: 仅更新 .streaming-region，不碰已有 DOM
   * — 其他（新 segment / 工具状态变化）: 全量重建
   */
  async _doRender() {
    if (this._destroyed) return;
    const pending = this._pendingRender;
    if (!pending) return;
    this._pendingRender = null;
    
    const { container, segments, currentText, _isTextOnly } = pending;
    
    // ========== FAST PATH：仅 streaming 文本变化，无新 segment ==========
    if (_isTextOnly && this._streamingAnchor && this._streamingAnchor.isConnected &&
        this._lastSegmentCount === segments.length) {
      if (currentText) {
        this._streamingAnchor.innerHTML = await renderMarkdown(currentText);
        if (this._destroyed) return;
      } else {
        this._streamingAnchor.innerHTML = '';
      }
      this.smartScroll();
      return;
    }
    
    // ========== FULL REBUILD：新增 segment 或工具状态变化 ==========
    this._lastSegmentCount = segments.length;
    
    const chatContainer = this.container;
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
        html += this._renderThinkingBubble(segment);
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
        if (this._destroyed) return;
      }
    }
    flushToolTimeline();

    // 用已知容器包裹 streaming 文本，方便后续增量更新
    html += `<div class="streaming-region">`;
    if (currentText) {
      html += await renderMarkdown(currentText);
    }
    html += `</div>`;

    if (this._destroyed) return;

    // 从当前 DOM 中保存展开状态（在重建之前）
    const savedStates = this._saveCardStates(container);

    // 离屏构建新 DOM，恢复好状态后再原子置换
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'contents';
    tempDiv.innerHTML = html;

    // 1) 禁用所有可动画元素的 transition
    const animEls = tempDiv.querySelectorAll('.tool-timeline-detail, .thinking-row-content, .tool-card .tool-call-details');
    for (const el of animEls) {
      el.dataset._trans = el.style.transition || '';
      el.style.transition = 'none';
    }

    // 2) 在离屏 DOM 上恢复展开状态（此时用户完全看不见）
    this._restoreCardStates(tempDiv, savedStates);

    // 3) 恢复动画
    for (const el of animEls) {
      el.style.transition = el.dataset._trans;
      delete el.dataset._trans;
    }

    // 4) 原子置换：一次操作完成新旧 DOM 切换（零中间帧）
    container.replaceChildren(...tempDiv.children);

    // 保存 streaming anchor 引用
    this._streamingAnchor = container.querySelector('.streaming-region');

    // 恢复滚动位置（避免 DOM 重建导致滚动跳动）
    chatContainer.scrollTop = savedScrollTop;
    
    // 思考流式渲染时，自动滚动思考内容到底部
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
      this._bindAskUserCardEvents(card);
    });

    container.querySelectorAll('.confirmation-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const confirmId = btn.dataset.confirmId;
        const decision = btn.classList.contains('allow') ? 'allow' : 'deny';
        const item = btn.closest('.tool-timeline-item');
        const checkbox = item?.querySelector('.auto-allow-checkbox');
        const autoAllowSimilar = checkbox ? checkbox.checked : false;
        this._sendToolConfirmResponse(confirmId, decision, autoAllowSimilar);
        if (item) {
          const detail = item.querySelector('.tool-timeline-detail');
          if (detail) {
            detail.style.maxHeight = '0';
          }
          item.classList.remove('expanded');
        }
      });
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
    copyBtn.addEventListener('click', () => {
      const textToCopy = contentDiv.dataset.markdown || contentDiv.innerText;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
  }
  
  /**
   * 河马吐泡泡
   */
  _spawnHippoBubbles(hippoEl) {
    const state = hippoEl.closest('.empty-state');
    if (!state) return;
    const hippoRect = hippoEl.getBoundingClientRect();
    const stateRect = state.getBoundingClientRect();
    const cx = hippoRect.left - stateRect.left + hippoRect.width / 2;
    const cy = hippoRect.top - stateRect.top + hippoRect.height / 2;
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const bubble = document.createElement('div');
        bubble.className = 'hippo-bubble';
        const size = 6 + Math.random() * 5;
        const drift = (Math.random() - 0.5) * 30;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';
        bubble.style.left = (cx - size / 2) + 'px';
        bubble.style.top = (cy - size / 2) + 'px';
        bubble.style.setProperty('--bubble-drift', drift + 'px');
        state.appendChild(bubble);
        bubble.addEventListener('animationend', () => bubble.remove());
      }, i * 80);
    }
  }

  /**
   * 河马对话框气泡
   */
  _spawnHippoSpeech(hippoEl) {
    const existing = hippoEl.querySelector('.hippo-speech');
    if (existing) existing.remove();

    const speeches = [
      '代码写得不错嘛 🦛',
      '好热🫠',
      '想泡水💧',
      '饿了吗🍉',
      '今天吃什么',
      '又在写 bug 了？',
      '你好呀 👋',
      '让我看看…',
      '这个我熟！',
      '要帮忙吗？',
      '💤 有点困…',
      '该下班了 🕐',
      '正在思考中… 🤔',
      '快夸我快夸我',
      '🦛 哼！',
    ];

    const text = speeches[Math.floor(Math.random() * speeches.length)];

    const speech = document.createElement('div');
    speech.className = 'hippo-speech';
    speech.textContent = text;

    hippoEl.appendChild(speech);
    speech.addEventListener('animationend', () => speech.remove());
  }
  
  /**
   * 渲染思考气泡
   */
  _renderThinkingBubble(segment) {
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
  
  _showAskUserCard(question, options, allowCustomInput, container) {
    const segment = {
      type: 'tool',
      name: 'ask_user',
      args: JSON.stringify({
        question: question,
        options: options || [],
        allow_custom_input: allowCustomInput !== false
      }),
      result: null,
      error: null
    };
    
    if (container) {
      // 必须先将 currentText flush 为 text segment，再 push ask_user。
      // 否则渲染时 currentText 会追加在 ask 卡片之后，导致时序正确的 LLM 文本出现在卡片下方
      if (this.currentText.trim()) {
        this.segments.push({ type: 'text', content: this.currentText });
        this.currentText = '';
      }
      this.segments.push(segment);
      this._askUserContentDiv = container;
      
      if (this._renderThrottleTimer) {
        clearTimeout(this._renderThrottleTimer);
        this._renderThrottleTimer = null;
      }
      this._pendingRender = { container, segments: this.segments, currentText: this.currentText };
      this._lastRenderTime = Date.now();
      this._doRender().then(() => {
        this.chatUI.scrollToBottom();
      });
    } else {
      const { contentDiv } = this.chatUI.appendAssistantMessage('');
      const segments = [segment];
      this._askUserContentDiv = contentDiv;
      this.renderSegments(contentDiv, segments, '');
    }
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
          this._pendingIsTextOnly = true;
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
          if (reasoningSegment) {
            reasoningSegment.done = true;
            reasoningSegment = null;
          }
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

  _sendToolConfirmResponse(confirmId, decision, autoAllowSimilar) {
    const sessionId = appState.currentSessionId;
    if (!sessionId || !confirmId) return;

    const btn = document.querySelector(`.confirmation-btn.${decision}[data-confirm-id="${confirmId}"]`);
    if (btn) btn.disabled = true;

    this.isCompleted = false;

    fetch('/api/tool/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        confirmId,
        decision,
        autoAllowSimilar: !!autoAllowSimilar
      })
    }).then(async response => {
      if (!response.ok) {
        return response.json().then(err => {
          showToast(err.error || '确认请求失败', { type: 'error', duration: 4000 });
          if (btn) btn.disabled = false;
        });
      }

      const contentDiv = this._responseContentDiv;
      const btnContainer = this._responseBtnContainer;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let dataBuffer = '';

      const flushDataBuffer = () => {
        if (!dataBuffer) return;
        try {
          const parsed = JSON.parse(dataBuffer);
          parsed._eventType = currentEvent;
          this.handleChunk(parsed, contentDiv, btnContainer);
        } catch (e) {
          console.error('解析确认 SSE 数据失败:', e);
        }
        dataBuffer = '';
      };

      const processLines = (lines) => {
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            flushDataBuffer();
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataBuffer += line.substring(6);
          } else if (line === '') {
            flushDataBuffer();
          }
        }
        flushDataBuffer();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          processLines(lines);
        }

        if (buffer.trim()) {
          processLines(buffer.split('\n'));
        }
      } catch (e) {
        console.error('读取确认 SSE 流失败:', e);
      }

      if (this.currentText.trim()) {
        this.segments.push({ type: 'text', content: this.currentText });
      }
      this.renderSegmentsFinal(contentDiv, this.segments, '');
      this.isCompleted = true;

    }).catch(err => {
      console.error('确认请求失败:', err);
      showToast('确认请求失败', { type: 'error', duration: 4000 });
      if (btn) btn.disabled = false;
      this.isCompleted = true;
    });
  }
  
  _bindAskUserCardEvents(card) {
    const details = card.querySelector('.tool-call-details');
    if (!details) return;

    details.style.transition = 'none';
    const h = details.scrollHeight;
    details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
    details.style.transition = '';
    card.classList.add('expanded');

    const optionBtns = card.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const option = btn.getAttribute('data-option');
        if (option) {
          details.style.maxHeight = '0';
          card.classList.remove('expanded');
          this._sendAskUserResponse(option);
        }
      });
    });
  }
  
  /**
   * 智能滚动
   */
  smartScroll() {
    if (this.isNearBottom(100)) {
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
  
  isNearBottom(threshold = 100) {
    if (!this.container) return true;
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
    
    // 中止服务端正在运行的 bash 进程
    for (const toolCallId of this._runningToolCallIds) {
      fetch('/api/tool/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId })
      }).catch(() => {});
    }
    this._runningToolCallIds.clear();
    
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
    const row = msgDiv.closest('.message-row') || msgDiv;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = originalText;
    textarea.rows = Math.min(Math.max(originalText.split('\n').length, 4), 15);
    
    const editActions = document.createElement('div');
    editActions.className = 'message-edit-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-edit-cancel';
    cancelBtn.textContent = '取消';
    
    const sendBtn = document.createElement('button');
    sendBtn.className = 'message-edit-send';
    sendBtn.textContent = '发送';
    
    editActions.appendChild(cancelBtn);
    editActions.appendChild(sendBtn);
    
    contentDiv.style.display = 'none';
    const originalActions = row.querySelector('.message-actions');
    if (originalActions) originalActions.style.display = 'none';
    
    contentDiv.parentNode.insertBefore(textarea, contentDiv.nextSibling);
    row.appendChild(editActions);
    
    textarea.focus();
    
    // 取消编辑
    cancelBtn.onclick = () => {
      msgDiv.classList.remove('editing');
      textarea.remove();
      editActions.remove();
      contentDiv.style.display = '';
      if (originalActions) originalActions.style.display = '';
    };
    
    // 发送编辑
    sendBtn.onclick = () => {
      const newContent = textarea.value.trim();
      if (!newContent || newContent === originalText) {
        cancelBtn.click();
        return;
      }
      
      msgDiv.classList.remove('editing');
      textarea.remove();
      editActions.remove();
      this.sendMessage(newContent, msgDiv.dataset.messageId || '', msgDiv);
    };
    
    // 键盘事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        sendBtn.click();
      }
      if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
  }
  
  /**
   * 从服务端消息数组加载历史消息（会话切换时调用）
   */
  async loadHistoryMessages(messages) {
    const toolResults = {};
    for (const msg of messages) {
      if ((msg.role === 'tool' || msg.role === 'tool-result') && msg.toolCallId) {
        toolResults[msg.toolCallId] = msg;
      }
    }

    const messageRows = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'tool' || msg.role === 'tool-result') {
        i++;
        continue;
      }

      if (msg.role === 'user') {
        messageRows.push({ type: 'user', content: msg.content, id: msg.id });
        i++;
        continue;
      }

      if (msg.role === 'assistant') {
        const segments = [];
        let text = '';
        let firstMsgTime = null;

        while (i < messages.length) {
          const am = messages[i];

          if (am.role === 'tool' || am.role === 'tool-result') {
            i++;
            continue;
          }

          if (am.role !== 'assistant') {
            break;
          }

          const amText = am.content || '';
          const amReasoning = am.reasoning_content || '';
          const hasToolCalls = am.tool_calls && am.tool_calls.length > 0;

          if (!firstMsgTime && am.timestamp) {
            firstMsgTime = am.timestamp;
          }

          if (amText.trim() && !hasToolCalls) {
            if (text.trim()) segments.push({ type: 'text', content: text });
            if (amReasoning) {
              segments.push({ type: 'thinking', content: amReasoning, done: true });
            }
            text = amText;
            i++;
            break;
          }

          if (text.trim()) {
            segments.push({ type: 'text', content: text });
            text = '';
          }

          if (amReasoning) {
            segments.push({ type: 'thinking', content: amReasoning, done: true });
          }

          if (amText.trim()) {
            text = amText;
          }

          if (hasToolCalls) {
            if (text.trim()) {
              segments.push({ type: 'text', content: text });
              text = '';
            }

            for (const tc of am.tool_calls) {
              let result = null;
              let resultContent = null;
              let error = null;
              const tr = toolResults[tc.id];
              if (tr) {
                result = tr.success ? 'success' : 'error';
                resultContent = tr.content || null;
                if (!tr.success) error = resultContent;
              }
              segments.push({
                type: 'tool',
                name: tc.name,
                args: tc.arguments,
                result: result,
                resultContent: resultContent,
                error: error
              });
            }
          }
          i++;
        }

        if (text.trim()) {
          segments.push({ type: 'text', content: text });
        }

        messageRows.push({ type: 'assistant', segments, firstMsgTime });
      } else {
        i++;
      }
    }

    // Process markdown + DOM in batches — content appears progressively
    const BATCH_SIZE = 20;
    let isFirstBatch = true;

    this.container.innerHTML = '';

    for (let batchStart = 0; batchStart < messageRows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, messageRows.length);

      // Render markdown for text segments in this batch only
      const batchRenderTasks = [];
      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];
        if (row.type !== 'assistant') continue;
        for (const seg of row.segments) {
          if (seg.type === 'text' && seg.content && !seg._rendered) {
            batchRenderTasks.push(seg);
          }
        }
      }
      if (batchRenderTasks.length > 0) {
        const results = await Promise.all(batchRenderTasks.map(seg => renderMarkdown(seg.content)));
        for (let ti = 0; ti < batchRenderTasks.length; ti++) {
          batchRenderTasks[ti]._rendered = results[ti];
        }
      }

      // Build DOM for this batch
      const fragment = document.createDocumentFragment();
      const pendingUserEditBtns = [];
      let rowIndex = 0;

      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];

        if (row.type === 'user') {
          if (row.content && row.content.trim()) {
            const userRow = document.createElement('div');
            userRow.className = 'message-row user-row';
            userRow.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
            userRow.classList.add('animate-in');
            rowIndex++;

            const userMsgDiv = document.createElement('div');
            userMsgDiv.className = 'message user';
            if (row.id) userMsgDiv.dataset.messageId = row.id;

            const userContentDiv = document.createElement('div');
            userContentDiv.className = 'message-content';
            userContentDiv.textContent = row.content;
            userMsgDiv.appendChild(userContentDiv);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            userMsgDiv.appendChild(timeDiv);

            userRow.appendChild(userMsgDiv);

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
              navigator.clipboard.writeText(row.content).then(() => {
                copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                  copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                  copyBtn.classList.remove('copied');
                }, 2000);
              }).catch(() => {});
            });
            btnContainer.appendChild(copyBtn);
            userRow.appendChild(btnContainer);
            fragment.appendChild(userRow);
            pendingUserEditBtns.push({ editBtn, msgDiv: userMsgDiv });
          }
          continue;
        }

        if (row.type === 'assistant') {
          const segments = row.segments;
          const firstMsgTime = row.firstMsgTime;

          const rowEl = document.createElement('div');
          rowEl.className = 'message-row assistant-row';
          rowEl.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
          rowEl.classList.add('animate-in');
          rowIndex++;

          const msgDiv = document.createElement('div');
          msgDiv.className = 'message assistant';
          if (firstMsgTime) msgDiv.dataset.timestamp = firstMsgTime;
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';

          if (segments.length === 0) {
            contentDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🤖 AI 未返回有效响应，请尝试重新发送</div>';
          } else {
            let html = '';
            let toolTimelineHtml = '';
            const flushToolTimeline = () => {
              if (toolTimelineHtml) {
                html += `<div class="tool-timeline">${toolTimelineHtml}</div>`;
                toolTimelineHtml = '';
              }
            };
            for (const seg of segments) {
              if (seg.type === 'thinking') {
                flushToolTimeline();
                html += this._renderThinkingBubble(seg);
              } else if (seg.type === 'tool') {
                if (seg.name === 'todo_write' || seg.name === 'ask_user') {
                  flushToolTimeline();
                  html += this.chatUI.renderToolCard(seg);
                } else {
                  toolTimelineHtml += this.chatUI.renderToolTimelineRow(seg);
                }
              } else if (seg.type === 'text' && seg.content) {
                flushToolTimeline();
                html += seg._rendered || '';
              }
            }
            flushToolTimeline();
            contentDiv.innerHTML = html;
            contentDiv.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
              this.chatUI.bindToolCardEvents(card);
            });
          }
          msgDiv.appendChild(contentDiv);
          rowEl.appendChild(msgDiv);

          const btnContainer = document.createElement('div');
          btnContainer.className = 'message-actions';

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
          rollbackBtn.addEventListener('click', () => EventBus.emit('message:rollback', msgDiv));
          btnContainer.appendChild(rollbackBtn);

          const rawMarkdown = segments.filter(s => s.type === 'text').map(s => s.content).join('');
          contentDiv.dataset.markdown = rawMarkdown;

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

          const timeDiv = document.createElement('div');
          timeDiv.className = 'message-time';
          timeDiv.textContent = firstMsgTime
            ? new Date(firstMsgTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          footer.appendChild(timeDiv);
          msgDiv.appendChild(footer);
          fragment.appendChild(rowEl);
        }
      }

      if (isFirstBatch) {
        isFirstBatch = false;
        this.container.appendChild(fragment);
        // Reveal container after first batch is in DOM — no flash, no drop
        this.container.classList.remove('switching');
        // Yield to browser so first batch paints before remaining batches
        await new Promise(r => requestAnimationFrame(r));
      } else {
        this.container.appendChild(fragment);
      }

      if (pendingUserEditBtns.length > 0) {
        requestAnimationFrame(() => {
          for (const { editBtn, msgDiv } of pendingUserEditBtns) {
            editBtn.addEventListener('click', () => this.startEditMessage(msgDiv));
          }
        });
      }
    }

    this.chatUI.scrollToBottom();
  }

  /**
   * 销毁组件
   */
  destroy() {
    this._destroyed = true;
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = null;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }
}

window.toggleThinkingRow = function(headerEl) {
  const row = headerEl.closest('.thinking-row.completed');
  if (!row) return;
  const content = row.querySelector('.thinking-row-content');
  if (!content) return;

  if (row.classList.contains('expanded')) {
    content.style.maxHeight = '0';
    row.classList.remove('expanded');
    content.style.overflowY = '';
  } else {
    content.style.overflowY = 'hidden';
    const h = content.scrollHeight;
    const expandedPadding = 16;
    const totalH = h + expandedPadding;
    const isCapped = totalH > 300;
    content.style.maxHeight = isCapped ? '300px' : totalH + 'px';
    row.classList.add('expanded');
    if (toggleIcon) toggleIcon.textContent = '▼';
    const onEnd = (e) => {
      if (e.propertyName !== 'max-height') return;
      content.removeEventListener('transitionend', onEnd);
      if (isCapped) {
        content.style.overflowY = 'auto';
      }
    };
    content.addEventListener('transitionend', onEnd);
  }
};
