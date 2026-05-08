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
      expect(chatPanel.segments).toEqual([]);
      expect(chatPanel.currentText).toBe('');
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
    it('发送中时隐藏发送按钮，显示停止按钮', () => {
      chatPanel.setSendingState(true);

      expect(chatPanel.isSendingMessage).toBe(true);
      expect(chatPanel.elements.sendBtn.disabled).toBe(true);
      expect(chatPanel.elements.sendBtn.style.display).toBe('none');
      expect(chatPanel.elements.stopBtn.style.display).toBe('inline-block');
    });

    it('非发送中时显示发送按钮，隐藏停止按钮', () => {
      chatPanel.setSendingState(false);

      expect(chatPanel.isSendingMessage).toBe(false);
      expect(chatPanel.elements.sendBtn.disabled).toBe(false);
      expect(chatPanel.elements.sendBtn.style.display).toBe('inline-block');
      expect(chatPanel.elements.stopBtn.style.display).toBe('none');
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
    it('处理 content 事件追加文本', () => {
      const contentDiv = document.createElement('div');
      const btnContainer = document.createElement('div');

      chatPanel.handleChunk(
        { _eventType: 'content', content: 'Hello' },
        contentDiv,
        btnContainer
      );

      expect(chatPanel.currentText).toBe('Hello');
    });

    it('处理 message_id 事件', () => {
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      container.appendChild(userMsg);

      chatPanel.handleChunk(
        { _eventType: 'message_id', id: 'msg-123' },
        document.createElement('div'),
        document.createElement('div')
      );

      expect(userMsg.dataset.messageId).toBe('msg-123');
    });

    it('处理 clear_content 事件清空内容', () => {
      chatPanel.currentText = '已有文本';
      chatPanel.segments = [{ type: 'text', content: '已有' }];
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = 'some content';

      chatPanel.handleChunk(
        { _eventType: 'clear_content' },
        contentDiv,
        document.createElement('div')
      );

      expect(chatPanel.currentText).toBe('');
      expect(chatPanel.segments).toEqual([]);
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

      expect(chatPanel.segments.length).toBe(1);
      expect(chatPanel.segments[0].type).toBe('tool');
      expect(chatPanel.segments[0].name).toBe('bash');
    });

    it('处理 tool_result 事件更新工具状态', () => {
      const contentDiv = document.createElement('div');
      chatPanel.segments.push({
        type: 'tool', name: 'bash', args: '{}', result: null, error: null
      });

      chatPanel.handleChunk(
        { _eventType: 'tool_result', name: 'bash', success: true },
        contentDiv,
        document.createElement('div')
      );

      expect(chatPanel.segments[0].result).toBe('success');
    });

    it('isCompleted 为 true 时忽略后续事件', () => {
      chatPanel.isCompleted = true;

      chatPanel.handleChunk(
        { _eventType: 'content', content: 'should be ignored' },
        document.createElement('div'),
        document.createElement('div')
      );

      expect(chatPanel.currentText).toBe('');
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
      expect(msgDiv.querySelector('.message-edit-container')).toBeTruthy();
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