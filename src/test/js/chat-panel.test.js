import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupDOM() {
  document.body.innerHTML = `
    <div id="chatContainer" style="height:500px;overflow:auto"></div>
    <textarea id="messageInput"></textarea>
    <button id="sendBtn">➤</button>
    <button id="stopBtn" style="display:none">⏹</button>
    <div id="newMsgHint" style="display:none"></div>
    <div id="promptModeBar"></div>
    <div id="promptModeOptions"></div>
    <button id="promptCustomBtn">⚙️</button>
    <button id="compactBtn">压缩</button>
  `;
}

describe('ChatPanel.js', () => {
  let ChatPanel;
  let chatPanel;
  let mockChatService;
  let mockChatUI;
  let container;

  beforeEach(async () => {
    setupDOM();
    container = document.getElementById('chatContainer');

    mockChatService = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration: vi.fn(),
    };

    mockChatUI = {
      appendUserMessage: vi.fn().mockReturnValue({
        msgDiv: document.createElement('div'),
        contentDiv: document.createElement('div'),
        editBtn: document.createElement('button'),
        btnContainer: document.createElement('div'),
      }),
      appendAssistantMessage: vi.fn().mockReturnValue({
        contentDiv: document.createElement('div'),
        copyBtn: document.createElement('button'),
        retryBtn: document.createElement('button'),
        btnContainer: document.createElement('div'),
        msgDiv: document.createElement('div'),
      }),
      scrollToBottom: vi.fn(),
      renderToolCard: vi.fn().mockReturnValue('<div class="tool-card">tool</div>'),
      renderToolTimelineRow: vi.fn().mockReturnValue('<div class="tool-timeline-row">tool</div>'),
      parseTodos: vi.fn().mockReturnValue([]),
      bindAskUserEvents: vi.fn(),
    };

    const mod = await import('../../main/resources/static/js/components/ChatPanel.js');
    ChatPanel = mod.ChatPanel;
    chatPanel = new ChatPanel(container, mockChatService, mockChatUI);
  });

  afterEach(() => {
    if (chatPanel) chatPanel.destroy();
    document.body.innerHTML = '';
  });

  describe('初始化', () => {
    it('构造函数设置默认状态', () => {
      expect(chatPanel.container).toBe(container);
      expect(chatPanel.chatService).toBe(mockChatService);
      expect(chatPanel.chatUI).toBe(mockChatUI);
      expect(chatPanel._activeSession).toBeNull();
      expect(chatPanel.isSendingMessage).toBe(false);
      expect(chatPanel.isCompleted).toBe(false);
      expect(chatPanel.currentAbortController).toBeNull();
      expect(chatPanel.lastUserMessage).toBe('');
    });

    it('init 获取 DOM 元素', () => {
      expect(chatPanel.elements.messageInput).toBe(document.getElementById('messageInput'));
      expect(chatPanel.elements.sendBtn).toBe(document.getElementById('sendBtn'));
      expect(chatPanel.elements.stopBtn).toBe(document.getElementById('stopBtn'));
      expect(chatPanel.elements.newMsgHint).toBe(document.getElementById('newMsgHint'));
    });
  });

  describe('setSendingState', () => {
    it('发送中时隐藏发送按钮，显示停止按钮并确保可用', () => {
      chatPanel.setSendingState(true);

      expect(chatPanel.isSendingMessage).toBe(true);
      expect(chatPanel.elements.sendBtn.disabled).toBe(true);
      expect(chatPanel.elements.sendBtn.style.display).toBe('none');
      expect(chatPanel.elements.stopBtn.disabled).toBe(false);
      expect(chatPanel.elements.stopBtn.style.display).toBe('inline-block');
    });

    it('非发送中时显示发送按钮，隐藏停止按钮', () => {
      chatPanel.setSendingState(false);

      expect(chatPanel.isSendingMessage).toBe(false);
      expect(chatPanel.elements.sendBtn.disabled).toBe(false);
      expect(chatPanel.elements.sendBtn.style.display).toBe('inline-block');
      expect(chatPanel.elements.stopBtn.style.display).toBe('none');
    });

    it('发送中重置停止按钮禁用状态 — 回归测试：修复前stopBtn被禁用后再次发送仍为灰色', () => {
      chatPanel.elements.stopBtn.disabled = true;

      chatPanel.setSendingState(true);

      expect(chatPanel.elements.stopBtn.disabled).toBe(false);
    });

    it('停止后重新发送，按钮可用 — 完整回归路径测试', () => {
      const controller = new AbortController();
      chatPanel.currentAbortController = controller;
      chatPanel.isCompleted = false;

      chatPanel.stopGeneration();

      expect(chatPanel.elements.stopBtn.disabled).toBe(true);

      chatPanel.setSendingState(true);

      expect(chatPanel.elements.stopBtn.disabled).toBe(false);
      expect(chatPanel.elements.stopBtn.style.display).toBe('inline-block');
    });
  });

  describe('stopGeneration', () => {
    it('调用 chatService.stopGeneration', () => {
      const controller = new AbortController();
      chatPanel.currentAbortController = controller;

      chatPanel.stopGeneration();

      expect(mockChatService.stopGeneration).toHaveBeenCalledWith(controller);
    });

    it('currentAbortController 为 null 时不报错', () => {
      chatPanel.currentAbortController = null;
      expect(() => chatPanel.stopGeneration()).not.toThrow();
    });

    it('消息已完成时跳过停止', () => {
      chatPanel.isCompleted = true;
      chatPanel.currentAbortController = new AbortController();

      chatPanel.stopGeneration();

      expect(mockChatService.stopGeneration).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('内容为空时直接返回', async () => {
      chatPanel.elements.messageInput.value = '';

      await chatPanel.sendMessage();

      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });

    it('调用 chatService.sendMessage 并传入参数', async () => {
      chatPanel.elements.messageInput.value = '你好';
      mockChatService.sendMessage.mockResolvedValue(undefined);

      await chatPanel.sendMessage();

      expect(mockChatService.sendMessage).toHaveBeenCalled();
      const args = mockChatService.sendMessage.mock.calls[0];
      expect(args[1]).toBe('你好');
    });

    it('发送后清空输入框', async () => {
      chatPanel.elements.messageInput.value = '测试消息';
      mockChatService.sendMessage.mockResolvedValue(undefined);

      await chatPanel.sendMessage();

      expect(chatPanel.elements.messageInput.value).toBe('');
    });

    it('发送中锁定输入状态', async () => {
      chatPanel.elements.messageInput.value = '测试';
      let resolvePromise;
      mockChatService.sendMessage.mockReturnValue(new Promise(resolve => { resolvePromise = resolve; }));

      const promise = chatPanel.sendMessage();
      expect(chatPanel.isSendingMessage).toBe(true);
      expect(chatPanel.elements.sendBtn.style.display).toBe('none');
      expect(chatPanel.elements.stopBtn.style.display).toBe('inline-block');

      resolvePromise();
      await promise;
      expect(chatPanel.isSendingMessage).toBe(false);
    });

    it('overrideContent 参数覆盖输入框内容', async () => {
      chatPanel.elements.messageInput.value = '输入框内容';
      mockChatService.sendMessage.mockResolvedValue(undefined);

      await chatPanel.sendMessage('覆盖内容');

      const args = mockChatService.sendMessage.mock.calls[0];
      expect(args[1]).toBe('覆盖内容');
    });

    it('AbortError 时显示已停止生成', async () => {
      chatPanel.elements.messageInput.value = '测试';
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockChatService.sendMessage.mockRejectedValue(abortError);

      await chatPanel.sendMessage();

      expect(chatPanel.isCompleted).toBe(true);
      expect(chatPanel.isSendingMessage).toBe(false);
    });
  });

  describe('handleChunk', () => {
    function createMockSession() {
      const session = {
        _segments: [],
        _currentText: '',
        _reasoningSegment: null,
        _hasReceivedData: false,
        _runningToolCallIds: new Set(),
        getSegments() { return this._segments; },
        getCurrentText() { return this._currentText; },
        setCurrentText(text) { this._currentText = text; },
        pushTextSegment() {
          if (this._currentText.trim()) {
            this._segments.push({ type: 'text', content: this._currentText });
            this._currentText = '';
          }
        },
        pushSegment(seg) { this._segments.push(seg); },
        clearAll() {
          this._currentText = '';
          this._segments = [];
          this._reasoningSegment = null;
        },
        clearReasoning() {
          if (this._reasoningSegment) {
            this._reasoningSegment.done = true;
            this._reasoningSegment = null;
          }
        },
        handleReasoning(parsed, contentDiv) {
          if (!this._hasReceivedData) {
            this._hasReceivedData = true;
            contentDiv.querySelector('.typing-indicator')?.remove();
          }
          if (!this._reasoningSegment) {
            this._reasoningSegment = { type: 'thinking', content: '', done: false };
            this._segments.push(this._reasoningSegment);
          }
          this._reasoningSegment.content += parsed.reasoning;
        },
        handleReasoningDone() {
          if (this._reasoningSegment) {
            this._reasoningSegment.done = true;
            this._reasoningSegment = null;
          }
        },
        handleContent(parsed, contentDiv) {
          if (this._reasoningSegment) {
            this._reasoningSegment.done = true;
            this._reasoningSegment = null;
          }
          this._currentText += parsed.content;
          if (!this._hasReceivedData) {
            this._hasReceivedData = true;
            contentDiv.querySelector('.typing-indicator')?.remove();
          }
        },
        handleToolStart(parsed, contentDiv) {
           if (!this._hasReceivedData) {
             this._hasReceivedData = true;
             contentDiv.querySelector('.typing-indicator')?.remove();
           }
           if (this._reasoningSegment) {
             this._reasoningSegment.done = true;
             this._reasoningSegment = null;
           }
         },
        handleToolResult(parsed) {
          const existingTool = this._segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
          if (existingTool) {
            existingTool.result = parsed.success ? 'success' : 'error';
            existingTool.error = parsed.error || null;
            existingTool.resultContent = parsed.result || null;
            if (parsed.args) existingTool.args = parsed.args;
            existingTool.confirmationData = null;
            existingTool.progressLines = null;
          }
        },
        handleToolProgress() {},
        handleToolConfirmation() {},
        getContentDiv() { return null; }
      };
      return session;
    }

    beforeEach(() => {
      chatPanel._activeSession = createMockSession();
    });

    it('处理 content 事件追加文本', () => {
      const contentDiv = document.createElement('div');
      const btnContainer = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'content', content: 'Hello' },
        contentDiv,
        btnContainer
      );

      expect(chatPanel._activeSession.getCurrentText()).toBe('Hello');
    });

    it('处理 message_id 事件', () => {
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      container.appendChild(userMsg);
      chatPanel._lastUserMsgDiv = userMsg;

      chatPanel.handleChunk(
        { _eventType: 'message_id', id: 'msg-123' },
        document.createElement('div'),
        document.createElement('div')
      );

      expect(userMsg.dataset.messageId).toBe('msg-123');
    });

    it('处理 clear_content 事件清空内容', () => {
      const session = chatPanel._activeSession;
      session.setCurrentText('已有文本');
      session._segments = [{ type: 'text', content: '已有' }];
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = 'some content';

      chatPanel.handleChunk(
        { _eventType: 'clear_content' },
        contentDiv,
        document.createElement('div')
      );

      expect(session.getCurrentText()).toBe('');
      expect(session.getSegments()).toEqual([]);
      expect(contentDiv.innerHTML).toBe('');
    });

    it('处理 error 事件显示错误', () => {
      const contentDiv = document.createElement('div');

      chatPanel.handleChunk(
        { type: 'error', content: '出错了' },
        contentDiv,
        document.createElement('div')
      );

      expect(contentDiv.innerHTML).toContain('出错了');
    });

    it('处理 tool_start 事件创建工具卡片', () => {
      const contentDiv = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'tool_start', name: 'bash', args: '{"command":"ls"}' },
        contentDiv,
        document.createElement('div')
      );

      const segments = chatPanel._activeSession.getSegments();
      expect(segments.length).toBe(1);
      expect(segments[0].type).toBe('tool');
      expect(segments[0].name).toBe('bash');
    });

    it('处理 tool_result 事件更新工具状态', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;
      session._segments.push({
        type: 'tool', name: 'bash', args: '{}', result: null, error: null
      });

      chatPanel.handleChunk(
        { _eventType: 'tool_result', name: 'bash', success: true },
        contentDiv,
        document.createElement('div')
      );

      expect(session.getSegments()[0].result).toBe('success');
    });

    it('isCompleted 为 true 时忽略后续事件', () => {
      chatPanel.isCompleted = true;

      chatPanel.handleChunk(
        { _eventType: 'content', content: 'should be ignored' },
        document.createElement('div'),
        document.createElement('div')
      );

      expect(chatPanel._activeSession.getCurrentText()).toBe('');
    });

    it('处理 reasoning 事件创建思考气泡', () => {
      const contentDiv = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'reasoning', reasoning: '让我想想' },
        contentDiv,
        document.createElement('div')
      );

      const session = chatPanel._activeSession;
      expect(session._reasoningSegment).toBeDefined();
      expect(session._reasoningSegment.type).toBe('thinking');
      expect(session._reasoningSegment.content).toBe('让我想想');
      expect(session.getSegments()[0]).toBe(session._reasoningSegment);
    });

    it('处理连续的 reasoning 事件追加内容', () => {
      const contentDiv = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'reasoning', reasoning: '第一步' },
        contentDiv,
        document.createElement('div')
      );
      chatPanel.handleChunk(
        { _eventType: 'reasoning', reasoning: '第二步' },
        contentDiv,
        document.createElement('div')
      );

      expect(chatPanel._activeSession._reasoningSegment.content).toBe('第一步第二步');
    });

    it('处理 reasoning_done 事件标记完成', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;
      session._reasoningSegment = { type: 'thinking', content: '思考中', done: false };
      session._segments.push(session._reasoningSegment);

      chatPanel.handleChunk(
        { _eventType: 'reasoning_done' },
        contentDiv,
        document.createElement('div')
      );

      expect(session._reasoningSegment).toBeNull();
      expect(session.getSegments()[0].done).toBe(true);
    });

    it('clear_content 清空时重置 _reasoningSegment', () => {
      const session = chatPanel._activeSession;
      session._reasoningSegment = { type: 'thinking', content: '一些思考', done: false };
      session._segments.push(session._reasoningSegment);
      const contentDiv = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'clear_content' },
        contentDiv,
        document.createElement('div')
      );

      expect(session._reasoningSegment).toBeNull();
      expect(session.getSegments().length).toBe(0);
    });

    it('reasoning 和 content 事件共存', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;

      chatPanel.handleChunk(
        { _eventType: 'reasoning', reasoning: '思考过程' },
        contentDiv,
        document.createElement('div')
      );
      chatPanel.handleChunk(
        { _eventType: 'reasoning_done' },
        contentDiv,
        document.createElement('div')
      );
      chatPanel.handleChunk(
        { _eventType: 'content', content: '最终答案' },
        contentDiv,
        document.createElement('div')
      );

      expect(session._reasoningSegment).toBeNull();
      expect(session.getSegments()[0].done).toBe(true);
      expect(session.getCurrentText()).toBe('最终答案');
    });

    it('content 后收到 waiting_user 时，先 flush currentText 再 push ask_user', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;

      chatPanel.handleChunk(
        { _eventType: 'content', content: 'LLM 生成的文本' },
        contentDiv,
        document.createElement('div')
      );

      expect(session.getCurrentText()).toBe('LLM 生成的文本');

      chatPanel.handleChunk(
        { _eventType: 'waiting_user', question: '确认吗？', options: ['是', '否'] },
        contentDiv,
        document.createElement('div')
      );

      const segments = session.getSegments();
      const textIdx = segments.findIndex(s => s.type === 'text');
      const askIdx = segments.findIndex(s => s.type === 'tool' && s.name === 'ask_user');
      expect(textIdx).toBeGreaterThanOrEqual(0);
      expect(askIdx).toBeGreaterThanOrEqual(0);
      expect(textIdx).toBeLessThan(askIdx);
      expect(segments[textIdx].content).toBe('LLM 生成的文本');
      expect(session.getCurrentText()).toBe('');
    });

    it('currentText 为空时 waiting_user 不创建多余 text segment', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;

      chatPanel.handleChunk(
        { _eventType: 'waiting_user', question: '直接询问？', options: ['好', '不好'] },
        contentDiv,
        document.createElement('div')
      );

      const textSegments = session.getSegments().filter(s => s.type === 'text');
      expect(textSegments).toHaveLength(0);
      expect(session.getSegments()[0].name).toBe('ask_user');
    });
  });

  describe('isNearBottom', () => {
    it('container 为 null 时返回 true', () => {
      const panel = new ChatPanel(null, mockChatService, mockChatUI);
      expect(panel.isNearBottom()).toBe(true);
      panel.destroy();
    });

    it('在底部附近返回 true', () => {
      Object.defineProperty(container, 'scrollTop', { value: 900, configurable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 50, configurable: true });

      expect(chatPanel.isNearBottom()).toBe(true);
    });

    it('远离底部返回 false', () => {
      Object.defineProperty(container, 'scrollTop', { value: 100, configurable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 50, configurable: true });

      expect(chatPanel.isNearBottom()).toBe(false);
    });
  });

  describe('startEditMessage', () => {
    it('创建编辑界面', () => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'message user';
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = '原始消息';
      msgDiv.appendChild(contentDiv);

      chatPanel.startEditMessage(msgDiv);

      expect(msgDiv.classList.contains('editing')).toBe(true);
      expect(msgDiv.querySelector('.message-edit-textarea')).toBeTruthy();
      expect(msgDiv.querySelector('.message-edit-textarea').value).toBe('原始消息');
    });

    it('已编辑状态不重复创建', () => {
      const msgDiv = document.createElement('div');
      msgDiv.classList.add('editing');
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = '原始消息';
      msgDiv.appendChild(contentDiv);

      chatPanel.startEditMessage(msgDiv);

      expect(msgDiv.querySelector('.message-edit-container')).toBeFalsy();
    });
  });

  describe('destroy', () => {
    it('清理时中止未完成的请求', () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');
      chatPanel.currentAbortController = controller;

      chatPanel.destroy();

      expect(abortSpy).toHaveBeenCalled();
    });
  });
});