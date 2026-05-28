// 聊天面板核心组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { showToast } from '../utils/toast.js';
import { EventBus } from '../utils/event-bus.js';
import { RenderPipeline } from './RenderPipeline.js';
import { EventRouter } from './EventRouter.js';

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
    this._hasReceivedData = false;
    this._lastUserMsgDiv = null;
    this._lastUserMessageId = null;
    this._runningToolCallIds = new Set();
    this._destroyed = false;

    this.renderPipeline = new RenderPipeline(chatUI, {
      bindAskUserCard: (card) => this._bindAskUserCardEvents(card),
      onConfirmationClick: (e) => {
        const btn = e.currentTarget;
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
      },
      afterRender: () => this.smartScroll()
    });

    this.eventRouter = this._createEventRouter();

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
          if (this.isSendingMessage) return;
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
        if (this.isSendingMessage) return;
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
    console.log('📤 sendMessage 被调用', { overrideContent, editMessageId, isSending: this.isSendingMessage });
    
    // LLM 输出中禁止重复发送
    if (this.isSendingMessage) {
      console.log('⏭️ sendMessage 跳过：LLM 正在输出中');
      return;
    }
    
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

    // 自愈：新消息发送前，标记所有未完成的 tool 卡片为已取消
    // 这些卡片是因为用户忽略了确认弹窗而残留的
    this._healStuckToolCards();

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
    
    // 立即聚焦输入框，让光标在 LLM 思考/输出期间始终可见
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
    }
    
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
      this.renderPipeline.setContainer(contentDiv);
      
      // 绑定复制按钮
      this._setupCopyButton(copyBtn, contentDiv);
      
      // 绑定重试按钮
      retryBtn.onclick = () => {
        if (!this.lastUserMessage) return;
        this.chatService.stopGeneration(this.currentAbortController);
        this.currentAbortController = new AbortController();
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
        this.renderPipeline.setContainer(contentDiv);
        await this.renderPipeline.renderFinal(this.segments, '');
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
        this.renderPipeline.setContainer(contentDiv);
        await this.renderPipeline.renderFinal(this.segments, '');
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
  _createEventRouter() {
    return new EventRouter({
      waiting_user: (parsed, contentDiv) => {
        console.log('📥 收到 waiting_user 事件:', parsed);
        this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input, contentDiv);
      },

      message_id: (parsed) => {
        const userMsgDiv = this._lastUserMsgDiv;
        if (userMsgDiv) {
          userMsgDiv.dataset.messageId = parsed.id;
          this._lastUserMessageId = parsed.id;
        }
      },

      thinking: () => {
        if (this.currentText.trim()) {
          this.segments.push({ type: 'text', content: this.currentText });
          this.currentText = '';
        }
        this._reasoningSegment = null;
        this.renderPipeline.flush();
      },

      clear_content: (contentDiv) => {
        console.log('🧹 清空内容');
        this.currentText = '';
        this.segments = [];
        this._reasoningSegment = null;
        contentDiv.innerHTML = '';
      },

      retry: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🔄 ${escapeHtml(parsed.message)}</div>`;
        this.currentText = '';
        this.segments = [];
      },

      sse_error: (parsed) => {
        if (this._reasoningSegment) {
          this._reasoningSegment.done = true;
          this._reasoningSegment = null;
        }
        this.currentText = '⚠️ ' + parsed.message;
        this.renderPipeline.scheduleRender(this.segments, this.currentText);
      },

      raw_error: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<span style="color: var(--error-color);">❌ ${escapeHtml(parsed.content)}</span>`;
      },

      reasoning: (parsed, contentDiv) => {
        if (!this._hasReceivedData) {
          this._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        if (!this._reasoningSegment) {
          this._reasoningSegment = { type: 'thinking', content: '', done: false };
          this.segments.push(this._reasoningSegment);
        }
        this._reasoningSegment.content += parsed.reasoning;
        this.renderPipeline.scheduleRender(this.segments, this.currentText);
        this.smartScroll();
      },

      reasoning_done: () => {
        if (this._reasoningSegment) {
          this._reasoningSegment.done = true;
          this.renderPipeline.flush();
          this._reasoningSegment = null;
        }
      },

      content: (parsed, contentDiv) => {
        if (this._reasoningSegment) {
          this._reasoningSegment.done = true;
          this.renderPipeline.flush(this.segments, this.currentText);
          this._reasoningSegment = null;
        }
        this.currentText += parsed.content;
        if (!this._hasReceivedData) {
          this._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        this.renderPipeline.markTextOnly();
        this.renderPipeline.scheduleRender(this.segments, this.currentText);
        this.smartScroll();
      },

      tool_start: (parsed, contentDiv) => {
        if (parsed.id) {
          if (this._runningToolCallIds.has(parsed.id)) {
            return;
          }
          this._runningToolCallIds.add(parsed.id);
        }
        if (!this._hasReceivedData) {
          this._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        if (this._reasoningSegment) {
          this._reasoningSegment.done = true;
          this._reasoningSegment = null;
        }
        this.renderPipeline.flush();

        if (parsed.name === 'ask_user') {
        } else if (parsed.name === 'todo_write') {
          console.log('🔧 收到 todo_write 事件:', parsed);
          if (this.currentText.trim()) {
            this.segments.push({ type: 'text', content: this.currentText });
            this.currentText = '';
          }
          const existingTodoIndex = this.segments.findIndex(s =>
            s.type === 'tool' && s.name === 'todo_write' && !s.result
          );
          const incomingTodos = this.chatUI.parseTodos(parsed.args);
          let finalTodos;
          if (existingTodoIndex >= 0) {
            const oldSegment = this.segments[existingTodoIndex];
            const oldTodos = this.chatUI.parseTodos(oldSegment.args);
            const todoMap = new Map();
            oldTodos.forEach(todo => { todoMap.set(todo.id, { ...todo }); });
            incomingTodos.forEach(newTodo => {
              if (todoMap.has(newTodo.id)) {
                const existing = todoMap.get(newTodo.id);
                if (newTodo.content) existing.content = newTodo.content;
                if (newTodo.status) existing.status = newTodo.status;
              } else {
                todoMap.set(newTodo.id, {
                  id: newTodo.id,
                  content: newTodo.content || '未命名任务',
                  status: newTodo.status || 'pending'
                });
              }
            });
            finalTodos = Array.from(todoMap.values());
          } else {
            finalTodos = incomingTodos.map(todo => ({
              id: todo.id,
              content: todo.content || '未命名任务',
              status: todo.status || 'pending'
            }));
          }
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null
          };
          if (existingTodoIndex >= 0) {
            this.segments[existingTodoIndex] = todoSegment;
          } else {
            this.segments.push(todoSegment);
          }
          this.renderPipeline.flush(this.segments, this.currentText);
        } else {
          if (this.currentText.trim()) {
            this.segments.push({ type: 'text', content: this.currentText });
            this.currentText = '';
          }
          this.segments.push({
            type: 'tool', id: parsed.id || null, name: parsed.name,
            args: parsed.args, result: null, error: null
          });
          this.renderPipeline.flush(this.segments, this.currentText);
        }
      },

      tool_result: (parsed) => {
        const resultId = parsed.tool_call_id || parsed.id;
        if (resultId) {
          this._runningToolCallIds.delete(resultId);
        }
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
          if (parsed.args) {
            existingTool.args = parsed.args;
          }
          existingTool.confirmationData = null;
          existingTool.progressLines = null;
          this.renderPipeline.flush(this.segments, this.currentText);
          this.renderPipeline.scheduleRender(this.segments, this.currentText);
        }
      },

      tool_progress: (parsed) => {
        const existingTool = this.segments.find(s =>
          s.type === 'tool' && s.id === parsed.id && !s.result
        );
        if (existingTool) {
          existingTool.progressLines = existingTool.progressLines || [];
          existingTool.progressLines.push(parsed.line);
          this.renderPipeline.flush(this.segments, this.currentText);
          this.renderPipeline.scheduleRender(this.segments, this.currentText);
        }
      },

      tool_confirmation: (parsed) => {
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
          bashSegment._savedCommand = parsed.command;
          this.renderPipeline.flush(this.segments, this.currentText);
          this.renderPipeline.scheduleRender(this.segments, this.currentText);
        }
      }
    });
  }

  handleChunk(parsed, contentDiv, btnContainer) {
    if (this.isCompleted) return;
    this.eventRouter.handle(parsed, contentDiv, btnContainer);
  }
  
  async renderSegments(container, segments, currentText) {
    this.renderPipeline.setContainer(container);
    this.renderPipeline.scheduleRender(segments, currentText);
  }

  // RenderPipeline 接管了所有渲染调度和 DOM 构建
  
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
      
      this.renderPipeline.setContainer(container);
      this.renderPipeline.flush(this.segments, this.currentText);
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
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
    }
    this.currentAbortController = new AbortController();
    
    // 先将用户的选项作为用户消息气泡显示
    this.chatUI.appendUserMessage(message);
    
    const { contentDiv: responseContentDiv, btnContainer: responseBtnContainer, copyBtn: responseCopyBtn, retryBtn: responseRetryBtn, msgDiv: responseMsgDiv } = this.chatUI.appendAssistantMessage('');
    this._setupCopyButton(responseCopyBtn, responseContentDiv);
    this.renderPipeline.setContainer(responseContentDiv);
    
    const askUserMessage = message;
    responseRetryBtn.onclick = () => {
      if (!askUserMessage) return;
      this.chatService.stopGeneration(this.currentAbortController);
      this.isSendingMessage = false;
      this.currentAbortController = new AbortController();
      this._sendAskUserResponse(askUserMessage);
    };
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
          this.renderPipeline.scheduleRender(segments, currentText);
          this.chatUI.scrollToBottom();
          return;
        }
        
        if (parsed._eventType === 'reasoning_done') {
          if (reasoningSegment) {
            reasoningSegment.done = true;
            this.renderPipeline.flush();
            reasoningSegment = null;
          }
          return;
        }
        
        if (parsed._eventType === 'content' && parsed.content) {
          currentText += parsed.content;
          this.renderPipeline.markTextOnly();
          this.renderPipeline.scheduleRender(segments, currentText);
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
          this.renderPipeline.scheduleRender(segments, currentText);
          return;
        }
        
        if (parsed._eventType === 'tool_result' && parsed.name) {
          const existingTool = segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
          if (existingTool) {
            existingTool.result = parsed.success ? 'success' : 'error';
            existingTool.error = parsed.error || null;
            existingTool.resultContent = parsed.result || null;
            if (parsed.args) {
              existingTool.args = parsed.args;
            }
            this.renderPipeline.flush(segments, currentText);
            this.renderPipeline.scheduleRender(segments, currentText);
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
          this.renderPipeline.scheduleRender(segments, currentText);
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
      this.renderPipeline.renderFinal(segments, '');
      if (responseBtnContainer) responseBtnContainer.style.display = 'flex';
    }).catch(error => {
      if (error.name === 'AbortError') {
        if (currentText.trim()) {
          segments.push({ type: 'text', content: currentText });
        }
        this.renderPipeline.renderFinal(segments, '');
        responseContentDiv.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ 已停止生成</div>';
        if (responseBtnContainer) responseBtnContainer.style.display = 'flex';
        return;
      }
      console.error('发送失败:', error);
      const { message, detail } = this._classifyError(error);
      responseContentDiv.innerHTML = `
        <div style="color: var(--error-color); padding: 8px;">
          <div style="font-weight: 600; margin-bottom: 4px;">❌ ${escapeHtml(message)}</div>
          ${detail ? `<div style="font-size: 12px; opacity: 0.7;">${escapeHtml(detail)}</div>` : ''}
        </div>`;
      if (responseBtnContainer) responseBtnContainer.style.display = 'flex';
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
      this.renderPipeline.setContainer(contentDiv);
      this.renderPipeline.renderFinal(this.segments, '');
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

    // 自愈：停止生成时标记所有未完成的 tool 卡片
    this._healStuckToolCards();
  }

  /**
   * 自愈：标记所有未完成的 tool 卡片为已取消或中断
   * 用户忽略了确认弹窗，或停止了生成，需要修复 UI 状态
   */
  _healStuckToolCards() {
    let changed = false;
    for (const seg of this.segments) {
      if (seg.type !== 'tool' || seg.result) continue;

      if (seg.confirmationData) {
        // 有待确认信息但从未执行 → 用户忽略了确认弹窗
        seg.result = 'cancelled';
        seg.confirmationData = null;
        changed = true;
      } else if (seg.progressLines && seg.progressLines.length > 0) {
        // 有进度输出但没有最终结果 → 执行被中断
        seg.result = 'interrupted';
        changed = true;
      } else {
        // 既没有确认也没进度，只是一个空壳 → 已取消
        seg.result = 'cancelled';
        changed = true;
      }
    }

    if (changed) {
      const contentDiv = this._responseContentDiv;
      if (contentDiv) {
        // 直接操作 DOM，不触发 RenderPipeline 全量重建
        // flush → doRender 有 await renderMarkdown，会被后续新消息覆盖
        const statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
        contentDiv.querySelectorAll('.tool-timeline-item').forEach(item => {
          const cur = item.dataset.toolStatus;
          if (cur === 'running' || cur === 'pending_confirmation') {
            const hasProgress = !!item.querySelector('.tool-timeline-detail .timeline-detail-progress, .tool-timeline-detail .timeline-detail-status');
            const isCancelled = !hasProgress;
            item.dataset.toolStatus = isCancelled ? 'cancelled' : 'interrupted';
            item.classList.remove('expanded');
            const detail = item.querySelector('.tool-timeline-detail');
            if (detail) {
              detail.style.maxHeight = '0';
              detail.innerHTML = isCancelled
                ? '<div class="timeline-detail-status cancelled">已取消（未确认）</div>'
                : '<div class="timeline-detail-status interrupted">执行中断</div>';
            }
            const statusEl = item.querySelector('.tool-timeline-status');
            if (statusEl) {
              statusEl.className = `tool-timeline-status ${isCancelled ? 'cancelled' : 'interrupted'}`;
              statusEl.innerHTML = statusSvg;
            }
          }
        });
        // 收起 ask_user 卡片
        contentDiv.querySelectorAll('.tool-card.ask-user-card.expanded').forEach(card => {
          const details = card.querySelector('.tool-call-details');
          if (details) {
            details.style.maxHeight = '0';
            card.classList.remove('expanded');
          }
        });
      }
    }
  }

  /**
   * 从消息内容中移除 [会话中断] 标记文本。
   * 用户忽略确认弹窗后刷新页面时，后端 detectAndFixInterruption
   * 会给 assistant 消息追加中断提示。此方法在加载历史时将其滤除，
   * 避免用户看到"待执行的操作: bash"等无用信息。
   */
  _cleanInterruptionText(content) {
    if (!content) return content;
    const idx = content.indexOf('[会话中断]');
    if (idx === -1) return content;
    const cleaned = content.substring(0, idx).trim();
    return cleaned;
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
  async loadHistoryMessages(messages, noAnimation = false) {
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

          const rawContent = am.content || '';
          const amText = this._cleanInterruptionText(rawContent);
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
              } else {
                // 自愈：历史中 tool 没有对应结果 → 未完成，标记为已取消
                result = 'cancelled';
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

    let precedingUserContent = '';

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
            precedingUserContent = row.content;
            const userRow = document.createElement('div');
            userRow.className = 'message-row user-row';
            if (!noAnimation) {
              userRow.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
              userRow.classList.add('animate-in');
              rowIndex++;
            }

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
          if (!noAnimation) {
            rowEl.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
            rowEl.classList.add('animate-in');
            rowIndex++;
          }

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
                html += RenderPipeline.renderThinkingBubble(seg);
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

          const userContent = precedingUserContent;
          retryBtn.onclick = () => {
            if (!userContent) return;
            this.sendMessage(userContent);
          };

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
    this.renderPipeline.destroy();
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
