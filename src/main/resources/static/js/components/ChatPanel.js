// 聊天面板核心组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { showToast } from '../utils/toast.js';

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
    
    // DOM 元素
    this.elements = {};
    
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
    if (window.sessionManagerInstance && appState.currentSessionId) {
      const sm = window.sessionManagerInstance;
      if (!sm.sessionNames || !sm.sessionNames[appState.currentSessionId]) {
        sm.setSessionName(appState.currentSessionId, content);
        sm.loadSessions();
      }
    }
    
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
    
    try {
      // 创建 AbortController 用于停止生成
      this.currentAbortController = new AbortController();
      
      const result = this.chatUI.appendAssistantMessage();
      contentDiv = result.contentDiv;
      copyBtn = result.copyBtn;
      retryBtn = result.retryBtn;
      btnContainer = result.btnContainer;
      
      // 绑定复制按钮（使用复制菜单功能）
      if (window.setupCopyButton) {
        window.setupCopyButton(copyBtn, contentDiv);
      } else {
        // 降级方案：直接复制纯文本
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
      }
      
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
        contentDiv.innerHTML = `<span style="color: var(--error-color);">错误：${error.message}</span>`;
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
      
      // 触发全局事件：消息发送完成
      if (window.onMessageSent) {
        window.onMessageSent();
      }
    }
  }
  
  /**
   * 处理 SSE 数据块
   */
  handleChunk(parsed, contentDiv, btnContainer) {
    if (this.isCompleted) return;
    
    console.log('📥 收到 SSE 事件:', parsed._eventType, parsed);
    
    // 处理 waiting_user 事件（优先处理，避免被其他逻辑拦截）
    if (parsed._eventType === 'waiting_user') {
      console.log('📥 收到 waiting_user 事件:', parsed);
      if (window.showAskUserCard) {
        window.showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input);
      }
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
    
    // 处理 clear_content 事件（清空 LLM 多余文本）
    if (parsed._eventType === 'clear_content') {
      console.log('🧹 清空内容');
      this.currentText = '';
      this.segments = [];
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
    
    // 处理 content 事件 - 流式显示
    if (parsed._eventType === 'content' && parsed.content) {
      this.currentText += parsed.content;
      this.renderSegments(contentDiv, this.segments, this.currentText);
      this.smartScroll();
      return;
    }
    
    // 处理 tool_start 事件
    if (parsed._eventType === 'tool_start' && parsed.name) {
      console.log('🔧 工具开始:', parsed.name);
      
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
        this.renderSegments(contentDiv, this.segments, this.currentText);
      }
      return;
    }
    
    // 处理 waiting_user 事件（嵌套的 ask_user）
    if (parsed._eventType === 'waiting_user') {
      if (window.showAskUserCard) {
        window.showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input);
      }
      return;
    }
  }
  
  /**
   * 渲染消息片段
   */
  async renderSegments(container, segments, currentText) {
    let html = '';
    for (const segment of segments) {
      if (segment.type === 'tool') {
        html += this.chatUI.renderToolCard(segment);
      } else if (segment.type === 'text' && segment.content) {
        html += await renderMarkdown(segment.content);
      }
    }
    if (currentText) {
      html += await renderMarkdown(currentText);
    }
    container.innerHTML = html;
    
    // 为工具卡片绑定事件（折叠/展开、撤销等）
    container.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
      if (this.chatUI.bindToolCardEvents) {
        this.chatUI.bindToolCardEvents(card);
      }
    });
    
    // 为 ask_user 卡片绑定事件
    container.querySelectorAll('.ask-user-card').forEach(card => {
      if (this.chatUI.bindAskUserEvents) {
        this.chatUI.bindAskUserEvents(card);
      }
    });
    
    this.smartScroll();
  }
  
  /**
   * 最终渲染（防抖）
   */
  async renderSegmentsFinal(container, segments, currentText) {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    await this.renderSegments(container, segments, currentText);
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
   * 设置发送状态
   */
  setSendingState(isSending) {
    this.isSendingMessage = isSending;
    
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = isSending;
      this.elements.sendBtn.style.display = isSending ? 'none' : 'inline-block';
    }
    if (this.elements.stopBtn) {
      this.elements.stopBtn.style.display = isSending ? 'inline-block' : 'none';
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    console.log('🛑 stopGeneration 被调用');
    console.log('  currentAbortController:', this.currentAbortController);
    
    if (!this.currentAbortController) {
      console.warn('⚠️ currentAbortController 为 null，无法停止');
      return;
    }
    
    if (this.isCompleted) {
      console.log('✅ 消息已完成，无需停止');
      return;
    }
    
    this.chatService.stopGeneration(this.currentAbortController);
    console.log('✅ abort() 已调用');
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
