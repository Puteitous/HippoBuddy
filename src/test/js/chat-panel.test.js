import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupDOM() {
  document.body.innerHTML = `
    <div class="chat-panel has-messages">
      <div id="chatContainer" style="height:500px;overflow:auto"></div>
    </div>
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
    // 设置模型配置，避免 sendMessage 中的模型配置检查提前返回
    localStorage.setItem('hippo_model_config', JSON.stringify({ provider: 'test-provider', model: 'test-model' }));
    // 清理 RunningToolRegistry 单例，避免跨用例串扰
    const { RunningToolRegistry } = await import('../../main/resources/static/js/state/running-tool-registry.js');
    RunningToolRegistry.clear();

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
        fileIndicator: document.createElement('span'),
      }),
      scrollToBottom: vi.fn(),
      renderToolCard: vi.fn().mockReturnValue('<div class="tool-card">tool</div>'),
      renderToolTimelineRow: vi.fn().mockReturnValue('<div class="tool-timeline-row">tool</div>'),
      parseTodos: vi.fn().mockReturnValue([]),
      bindAskUserEvents: vi.fn(),
    };

    const mod = await import('../../main/resources/static/js/components/chat-panel/ChatPanel.js');
    ChatPanel = mod.ChatPanel;
    chatPanel = new ChatPanel(container, mockChatService, mockChatUI);
  });

  afterEach(() => {
    if (chatPanel) chatPanel.destroy();
    document.body.innerHTML = '';
    localStorage.removeItem('hippo_model_config');
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

    it('点击停止后立即恢复发送状态（不等 SSE abort 生效）', () => {
      chatPanel.setSendingState(true);
      chatPanel.currentAbortController = new AbortController();

      chatPanel.stopGeneration();

      expect(chatPanel.isSendingMessage).toBe(false);
      expect(chatPanel.elements.sendBtn.disabled).toBe(false);
      expect(chatPanel.elements.sendBtn.style.display).toBe('inline-block');
      expect(chatPanel.elements.stopBtn.style.display).toBe('none');
    });

    it('主流会话中运行的 bash toolCallId 也会发到 abort（统一走 RunningToolRegistry）', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      const { RunningToolRegistry } = await import('../../main/resources/static/js/state/running-tool-registry.js');
      appState.currentSessionId = 'session-test-abort';
      const controller = new AbortController();
      chatPanel.currentAbortController = controller;
      chatPanel.setSendingState(true);

      // 主/确认两条 SSE 流注册到同一个 Registry（MessageSession 与 ChatPanel 共用）
      RunningToolRegistry.add('call_main_bash_1');
      RunningToolRegistry.add('call_confirm_bash_2');

      const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
      const origFetch = global.fetch;
      global.fetch = fetchMock;
      try {
        chatPanel.stopGeneration();

        const bodies = fetchMock.mock.calls.map(([, opts]) => JSON.parse(opts.body));
        expect(bodies.some(b => b.toolCallId === 'call_main_bash_1')).toBe(true);
        expect(bodies.some(b => b.toolCallId === 'call_confirm_bash_2')).toBe(true);
        expect(bodies.some(b => b.toolCallId === null)).toBe(true); // 会话级兜底仍发送
        expect(RunningToolRegistry.all().length).toBe(0); // 停止后清空
      } finally {
        global.fetch = origFetch;
        delete appState.currentSessionId;
      }
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
        getSegments() { return this._segments; },
        getCurrentText() { return this._currentText; },
        setCurrentText(text) { this._currentText = text; },
        pushTextSegment() {
          if (this._currentText.trim()) {
            this._segments.push({ type: 'text', content: this._currentText });
            this._currentText = '';
          }
        },
        _pushTextSegment() {
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
          let existingTool = this._segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
          if (!existingTool && parsed.id) {
            existingTool = this._segments.find(s => s.type === 'tool' && s.id === parsed.id && !s.result);
          }
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
        getContentDiv() { return null; },
        pushError({ message, detail }) {
          if (this._reasoningSegment) {
            this._reasoningSegment.done = true;
            this._reasoningSegment = null;
          }
          this._currentText = '';
          this._segments.push({ type: 'error', content: message, detail: detail || null });
        }
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

      // 统一走 session.pushError → error segment（渲染为 .msg-error 红块）
      const errSeg = chatPanel._activeSession.getSegments().find(s => s.type === 'error');
      expect(errSeg).toBeDefined();
      expect(errSeg.content).toBe('出错了');
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

    it('处理 done(max_turns) 事件追加警示块', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;
      session.setCurrentText('已有部分输出');

      chatPanel.handleChunk(
        { _eventType: 'done', reason: 'max_turns' },
        contentDiv,
        document.createElement('div')
      );

      const segments = session.getSegments();
      // 流式文本先收尾成 text 段，再追加 warn 警示段
      expect(segments[0].type).toBe('text');
      expect(segments[0].content).toBe('已有部分输出');
      const warnSeg = segments.find(s => s.type === 'warn');
      expect(warnSeg).toBeDefined();
      expect(warnSeg.content).toBeTruthy();
      expect(warnSeg.detail).toBeTruthy();
      expect(session.getCurrentText()).toBe('');
    });

    it('done 事件 reason 非 max_turns 时不追加警示块', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;

      chatPanel.handleChunk(
        { _eventType: 'done', reason: 'normal' },
        contentDiv,
        document.createElement('div')
      );

      expect(session.getSegments().some(s => s.type === 'warn')).toBe(false);
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


  describe('destroy', () => {
    it('清理时中止未完成的请求', () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');
      chatPanel.currentAbortController = controller;

      chatPanel.destroy();

      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('定时自愈（_startStuckTimer / _clearStuckTimer）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('_startStuckTimer 30s 后触发 _healStuckToolCards', () => {
      const healSpy = vi.spyOn(chatPanel, '_healStuckToolCards');

      chatPanel._startStuckTimer();

      // 30s 前不应触发
      vi.advanceTimersByTime(29000);
      expect(healSpy).not.toHaveBeenCalled();

      // 到 30s
      vi.advanceTimersByTime(1000);
      expect(healSpy).toHaveBeenCalledTimes(1);
    });

    it('_clearStuckTimer 清除定时器', () => {
      const healSpy = vi.spyOn(chatPanel, '_healStuckToolCards');

      chatPanel._startStuckTimer();
      chatPanel._clearStuckTimer();

      // 即使到 30s 也不应触发
      vi.advanceTimersByTime(30000);
      expect(healSpy).not.toHaveBeenCalled();
    });

    it('_startStuckTimer 重复调用只保留最后一个定时器', () => {
      const healSpy = vi.spyOn(chatPanel, '_healStuckToolCards');

      chatPanel._startStuckTimer();
      chatPanel._startStuckTimer();
      chatPanel._startStuckTimer();

      vi.advanceTimersByTime(30000);
      expect(healSpy).toHaveBeenCalledTimes(1);
    });

    it('stopGeneration 清除 stuck 定时器', () => {
      const clearSpy = vi.spyOn(chatPanel, '_clearStuckTimer');

      chatPanel._startStuckTimer();
      chatPanel.stopGeneration('session-1');

      expect(clearSpy).toHaveBeenCalled();
    });

    it('sendMessage 完成后启动 stuck 定时器', async () => {
      const startSpy = vi.spyOn(chatPanel, '_startStuckTimer');

      // 模拟成功发送消息
      mockChatService.sendMessage.mockResolvedValue({ hasContent: true });
      chatPanel._activeSession = {
        start: vi.fn().mockResolvedValue(undefined),
        getSegments: () => [],
        getCurrentText: () => '',
        getContentDiv: () => null,
        getBtnContainer: () => null,
        healStuckCards: vi.fn().mockReturnValue([])
      };
      chatPanel.currentAbortController = new AbortController();

      await chatPanel.sendMessage('hello');

      expect(startSpy).toHaveBeenCalled();
    });

    it('sendMessage 开始时清除上一轮的 stuck 定时器，避免跨轮误伤', async () => {
      const clearSpy = vi.spyOn(chatPanel, '_clearStuckTimer');

      // 先启动一个定时器（模拟上一轮留下的）
      chatPanel._startStuckTimer();
      const oldTimer = chatPanel._stuckTimer;
      expect(oldTimer).not.toBeNull();

      // 模拟发送新消息
      mockChatService.sendMessage.mockResolvedValue({ hasContent: true });
      chatPanel._activeSession = {
        start: vi.fn().mockResolvedValue(undefined),
        getSegments: () => [],
        getCurrentText: () => '',
        getContentDiv: () => null,
        getBtnContainer: () => null,
        healStuckCards: vi.fn().mockReturnValue([])
      };
      chatPanel.currentAbortController = new AbortController();

      await chatPanel.sendMessage('hello');

      // _clearStuckTimer 应该在 sendMessage 开头被调用
      expect(clearSpy).toHaveBeenCalled();
      // 旧的定时器引用已被清除（_stuckTimer 现在是 sendMessage 末尾新设的，不是 oldTimer）
      expect(chatPanel._stuckTimer).not.toBe(oldTimer);
    });
  });

  describe('集成测试：损坏 JSON 的 tool_result 降级链路', () => {
    function createSession() {
      return {
        _segments: [],
        _currentText: '',
        _reasoningSegment: null,
        _hasReceivedData: false,
        getSegments() { return this._segments; },
        getCurrentText() { return this._currentText; },
        setCurrentText(text) { this._currentText = text; },
        pushTextSegment() {
          if (this._currentText.trim()) {
            this._segments.push({ type: 'text', content: this._currentText });
            this._currentText = '';
          }
        },
        _pushTextSegment() {
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
        handleReasoning() {},
        handleReasoningDone() {},
        handleContent() {},
        handleToolStart() {},
        handleToolResult(parsed) {
          let existingTool = this._segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
          if (!existingTool && parsed.id) {
            existingTool = this._segments.find(s => s.type === 'tool' && s.id === parsed.id && !s.result);
          }
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
        getContentDiv() { return null; },
        healStuckCards: vi.fn().mockReturnValue([])
      };
    }

    beforeEach(() => {
      chatPanel._activeSession = createSession();
    });

    it('缺失 name 的 tool_result 通过 EventRouter 兜底 + id fallback 标记 error', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;
      // 在 session 中放入一个 running 的 tool
      session._segments.push({
        type: 'tool', id: 'tc-1', name: 'edit_file', args: '{}', result: null
      });

      // 模拟 chat-service.js 正则兜底产出的对象：有 id 但没有 name
      chatPanel.handleChunk(
        { _eventType: 'tool_result', id: 'tc-1', success: false, error: '工具结果数据解析异常' },
        contentDiv,
        document.createElement('div')
      );

      const seg = session.getSegments()[0];
      expect(seg.result).toBe('error');
      expect(seg.error).toBe('工具结果数据解析异常');
    });

    it('完全损坏的 tool_result（无 id 无 name）不影响已有 segment', () => {
      const contentDiv = document.createElement('div');
      const session = chatPanel._activeSession;
      session._segments.push({
        type: 'tool', id: 'tc-1', name: 'edit_file', args: '{}', result: null
      });

      // 只有 _eventType，无 id 无 name（最极端情况）
      chatPanel.handleChunk(
        { _eventType: 'tool_result' },
        contentDiv,
        document.createElement('div')
      );

      // segment 不应被修改
      const seg = session.getSegments()[0];
      expect(seg.result).toBeNull();
    });
  });

  describe('hero 模式切换与会话模式记录同步', () => {
    /** 在文档中注入 hero 空态的模式胶囊 DOM（模拟 chatUI.clear() 渲染结果） */
    function mountHeroModeCapsule() {
      const hero = document.createElement('div');
      hero.innerHTML = `
        <span class="mode-capsule hero-mode-capsule" id="heroModeCapsule">
          <button class="mode-btn" data-mode="chat">Chat</button>
          <button class="mode-btn active" data-mode="coding">Code</button>
          <button class="mode-btn" data-mode="office">Office</button>
        </span>
        <div class="empty-presets" id="heroPresets"></div>
      `;
      document.body.appendChild(hero);
      return hero;
    }

    it('点击模式按钮会同步保存到当前会话模式记录 — 回归：修复前 _sessionModes 残留旧记录导致实际对话模式与 UI 不符', async () => {
      const hero = mountHeroModeCapsule();
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.currentSessionId = 'session-mode-sync';
      appState.setMode('coding');
      // 模拟 bug 场景：createNewSession 时用旧全局模式（chat）给新会话做了记录
      appState.saveSessionMode('session-mode-sync', 'chat');

      // 用户点击 coding 按钮（与全局模式相同，但会话记录仍是 chat）
      hero.querySelector('.mode-btn[data-mode="coding"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // 修复后：即使点击的是当前已激活模式，会话记录也会被同步为 coding
      expect(appState.getSessionMode('session-mode-sync')).toBe('coding');

      // 再点击 chat 按钮 → 全局模式更新 + 会话记录同步
      hero.querySelector('.mode-btn[data-mode="chat"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(appState.getMode()).toBe('chat');
      expect(appState.getSessionMode('session-mode-sync')).toBe('chat');

      // 清理：恢复默认模式，避免影响其他用例
      appState.setMode('coding');
      hero.remove();
    });

    it('点击模式按钮切换时预设标签同步渲染（syncUI → renderPresets）', async () => {
      const hero = mountHeroModeCapsule();
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.currentSessionId = 'session-mode-presets';
      appState.setMode('coding');

      hero.querySelector('.mode-btn[data-mode="office"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // office 模式应有对应的预设提示词标签
      const presetContainer = document.getElementById('heroPresets');
      expect(presetContainer.children.length).toBeGreaterThan(0);
      // office 模式按钮应高亮
      expect(hero.querySelector('.mode-btn[data-mode="office"]').classList.contains('active')).toBe(true);
      expect(hero.querySelector('.mode-btn[data-mode="coding"]').classList.contains('active')).toBe(false);
      // 会话记录同步为 office
      expect(appState.getSessionMode('session-mode-presets')).toBe('office');

      // 清理
      appState.setMode('coding');
      hero.remove();
    });
  });
});