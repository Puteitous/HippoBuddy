import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRenderMarkdown = vi.fn(async (text) => `<div class="md">${text}</div>`);

vi.mock('../../main/resources/static/js/markdown-renderer.js', () => ({
  renderMarkdown: mockRenderMarkdown
}));

vi.mock('../../main/resources/static/js/utils/toast.js', () => ({
  showToast: vi.fn()
}));

// Mock EventBus.emit for ask_user:respond testing
const mockEventBusEmit = vi.fn();
vi.mock('../../main/resources/static/js/utils/event-bus.js', () => ({
  EventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: mockEventBusEmit
  }
}));

describe('ChatUI', () => {
  let ChatUI, chatUI, container;

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.height = '500px';
    container.style.overflow = 'auto';
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true });
    container.scrollTop = 0;

    window.currentAskUserCallback = vi.fn();
    window.rollbackMessageChanges = vi.fn();
    window.showToast = vi.fn();

    const mod = await vi.importActual('../../main/resources/static/js/chat-ui.js');
    ChatUI = mod.ChatUI;
    chatUI = new ChatUI(container, {
      rollbackFile: vi.fn().mockResolvedValue({ success: true })
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('保存 container 引用', () => {
      expect(chatUI.container).toBe(container);
    });
  });

  describe('clear', () => {
    it('清空容器并显示空状态', () => {
      container.innerHTML = '<div>some content</div>';
      chatUI.clear();
      expect(container.innerHTML).toContain('empty-state');
      expect(container.innerHTML).toContain('你的 AI 桌面伙伴');
    });
  });

  describe('removeEmptyState', () => {
    it('移除空状态元素', () => {
      container.innerHTML = '<div class="empty-state">empty</div><div>content</div>';
      chatUI.removeEmptyState();
      const emptyState = container.querySelector('.empty-state');
      expect(emptyState.classList.contains('fade-out')).toBe(true);
      emptyState.dispatchEvent(new Event('transitionend'));
      expect(container.querySelector('.empty-state')).toBeNull();
      expect(container.children.length).toBe(1);
    });

    it('没有空状态时不报错', () => {
      container.innerHTML = '<div>content</div>';
      expect(() => chatUI.removeEmptyState()).not.toThrow();
    });
  });

  describe('appendUserMessage', () => {
    it('创建用户消息 DOM 结构', () => {
      const result = chatUI.appendUserMessage('hello world', 'msg-1');
      const msgDiv = container.querySelector('.message.user');
      expect(msgDiv).not.toBeNull();
      expect(msgDiv.dataset.messageId).toBe('msg-1');
      expect(msgDiv.querySelector('.message-content').textContent).toBe('hello world');
      expect(result.msgDiv).toBe(msgDiv);
      expect(result.contentDiv).not.toBeNull();
      expect(result.editBtn).not.toBeNull();
    });

    it('移除空状态', () => {
      container.innerHTML = '<div class="empty-state">empty</div>';
      chatUI.appendUserMessage('test');
      const emptyState = container.querySelector('.empty-state');
      emptyState.dispatchEvent(new Event('transitionend'));
      expect(container.querySelector('.empty-state')).toBeNull();
    });

    it('不传 messageId 时不设置 data-message-id', () => {
      chatUI.appendUserMessage('test');
      const msgDiv = container.querySelector('.message.user');
      expect(msgDiv.hasAttribute('data-message-id')).toBe(false);
    });
  });

  describe('appendAssistantMessage', () => {
    it('创建助手消息 DOM 结构', () => {
      const result = chatUI.appendAssistantMessage();
      const msgDiv = container.querySelector('.message.assistant');
      expect(msgDiv).not.toBeNull();
      expect(msgDiv.dataset.timestamp).toBeTruthy();
      expect(msgDiv.querySelector('.typing-indicator')).not.toBeNull();
      expect(result.contentDiv).not.toBeNull();
      expect(result.copyBtn).not.toBeNull();
      expect(result.retryBtn).not.toBeNull();
      expect(result.msgDiv).toBe(msgDiv);
    });

    it('使用自定义初始 HTML', () => {
      chatUI.appendAssistantMessage('<div class="custom">hello</div>');
      const contentDiv = container.querySelector('.message-content');
      expect(contentDiv.innerHTML).toBe('<div class="custom">hello</div>');
    });

    it('操作按钮容器默认隐藏', () => {
      chatUI.appendAssistantMessage();
      const btnContainer = container.querySelector('.message-actions');
      expect(btnContainer.style.display).toBe('none');
    });
  });

  describe('appendAssistantMessageFromHistory', () => {
    it('创建历史助手消息', async () => {
      const timestamp = new Date('2025-01-01T12:00:00').getTime();
      const msgDiv = await chatUI.appendAssistantMessageFromHistory('hello **world**', timestamp);
      expect(msgDiv.className).toContain('assistant');
      const contentDiv = msgDiv.querySelector('.message-content');
      expect(contentDiv).not.toBeNull();
      expect(contentDiv.dataset.markdown).toBe('hello **world**');
    });
  });

  describe('appendToolCallCard', () => {
    it('追加工具卡片并绑定事件', () => {
      const tool = { name: 'bash', args: '{"command":"ls"}', result: 'success', resultContent: '输出:\nfile.txt\n──' };
      const card = chatUI.appendToolCallCard(tool);
      expect(card).not.toBeNull();
      expect(card.classList.contains('bash-card')).toBe(true);
      expect(container.contains(card)).toBe(true);
    });

    it('移除空状态', () => {
      container.innerHTML = '<div class="empty-state">empty</div>';
      chatUI.appendToolCallCard({ name: 'bash', args: '{}' });
      const emptyState = container.querySelector('.empty-state');
      emptyState.dispatchEvent(new Event('transitionend'));
      expect(container.querySelector('.empty-state')).toBeNull();
    });
  });

  describe('bindToolCardEvents', () => {
    it('点击 header 切换折叠状态', () => {
      const card = document.createElement('div');
      card.className = 'tool-card';
      card.innerHTML = `
        <div class="tool-header">
          <span class="tool-title">test</span>
          <span class="arrow">▶</span>
        </div>
        <div class="tool-call-details">
          <div class="bash-command">ls</div>
        </div>
      `;
      chatUI.bindToolCardEvents(card);

      const header = card.querySelector('.tool-header');
      const details = card.querySelector('.tool-call-details');

      expect(header.classList.contains('expanded')).toBe(false);
      expect(details.classList.contains('show')).toBe(false);

      header.click();
      expect(header.classList.contains('expanded')).toBe(true);
      expect(details.classList.contains('show')).toBe(true);

      header.click();
      expect(header.classList.contains('expanded')).toBe(false);
      expect(details.classList.contains('show')).toBe(false);
    });

    it('点击 undo-btn 撤销文件变更', () => {
      const card = document.createElement('div');
      card.className = 'tool-card editfile-card';
      card.dataset.filePath = '/test/file.txt';
      card.innerHTML = `
        <div class="tool-header">header</div>
        <div class="tool-call-details">
          <div class="file-action-bar">
            <button class="undo-btn">↩ 撤销</button>
          </div>
        </div>
      `;
      chatUI.bindToolCardEvents(card);

      const undoBtn = card.querySelector('.undo-btn');
      undoBtn.click();

      expect(undoBtn.disabled).toBe(true);
      expect(undoBtn.textContent).toBe('撤销中...');
    });

    it('没有 header 时不报错', () => {
      const card = document.createElement('div');
      expect(() => chatUI.bindToolCardEvents(card)).not.toThrow();
    });
  });

  describe('renderToolCard', () => {
    it('bash 工具调用 renderBashCard', () => {
      const html = chatUI.renderToolCard({ name: 'bash', args: '{}' });
      expect(html).toContain('bash-card');
      expect(html).toContain('终端命令');
    });

    it('edit_file 工具调用 renderEditFileCard', () => {
      const html = chatUI.renderToolCard({ name: 'edit_file', args: '{}' });
      expect(html).toContain('editfile-card');
      expect(html).toContain('编辑文件');
    });

    it('write_file 工具调用 renderWriteFileCard', () => {
      const html = chatUI.renderToolCard({ name: 'write_file', args: '{}' });
      expect(html).toContain('writefile-card');
      expect(html).toContain('写入文件');
    });

    it('ask_user 工具调用 renderAskUserCard', () => {
      const html = chatUI.renderToolCard({ name: 'ask_user', args: '{}' });
      expect(html).toContain('ask-user-card');
      expect(html).toContain('需要确认');
    });

    it('todo_write 工具调用 renderTodoWriteCard', () => {
      const html = chatUI.renderToolCard({ name: 'todo_write', args: '{}' });
      expect(html).toContain('todo-card');
      expect(html).toContain('任务清单');
    });

    it('未知工具使用默认卡片', () => {
      const html = chatUI.renderToolCard({ name: 'unknown_tool', args: '{}' });
      expect(html).toContain('tool-call-card');
      expect(html).toContain('unknown_tool');
    });
  });

  describe('renderBashCard', () => {
    it('渲染运行中状态', () => {
      const html = chatUI.renderBashCard({ name: 'bash', args: '{"command":"ls -la"}' });
      expect(html).toContain('bash-card');
      expect(html).toContain('ls -la');
      expect(html).toContain('运行中');
    });

    it('渲染成功状态', () => {
      const html = chatUI.renderBashCard({
        name: 'bash',
        args: '{"command":"ls","working_dir":"/home"}',
        result: 'success',
        resultContent: '输出:\nfile1.txt\nfile2.txt\n──\n退出码: 0\n执行时间: 10ms'
      });
      expect(html).toContain('成功');
      expect(html).toContain('file1.txt');
      expect(html).toContain('退出码: 0');
      expect(html).toContain('10ms');
      expect(html).toContain('/home');
    });

    it('渲染失败状态', () => {
      const html = chatUI.renderBashCard({
        name: 'bash',
        args: '{"command":"invalid"}',
        result: 'error',
        error: 'command not found'
      });
      expect(html).toContain('失败');
      expect(html).toContain('command not found');
    });

    it('没有内联 onclick', () => {
      const html = chatUI.renderBashCard({ name: 'bash', args: '{}' });
      expect(html).not.toContain('onclick=');
    });
  });

  describe('renderEditFileCard', () => {
    it('渲染成功状态带 diff', () => {
      const html = chatUI.renderEditFileCard({
        name: 'edit_file',
        args: '{"path":"/test/file.js","old_text":"old content","new_text":"new content"}',
        result: 'success'
      });
      expect(html).toContain('editfile-card');
      expect(html).toContain('/test/file.js');
      expect(html).toContain('diff-removed');
      expect(html).toContain('diff-added');
      expect(html).toContain('old content');
      expect(html).toContain('new content');
      expect(html).toContain('已生效');
      expect(html).toContain('undo-btn');
    });

    it('渲染失败状态', () => {
      const html = chatUI.renderEditFileCard({
        name: 'edit_file',
        args: '{"path":"/test/file.js"}',
        result: 'error',
        error: 'file not found'
      });
      expect(html).toContain('失败');
      expect(html).toContain('file not found');
      expect(html).not.toContain('已保留');
    });

    it('没有内联 onclick', () => {
      const html = chatUI.renderEditFileCard({ name: 'edit_file', args: '{}', result: 'success' });
      expect(html).not.toContain('onclick=');
    });
  });

  describe('renderWriteFileCard', () => {
    it('渲染成功状态带内容', () => {
      const html = chatUI.renderWriteFileCard({
        name: 'write_file',
        args: '{"path":"/test/new.txt","content":"line1\\nline2\\nline3"}',
        result: 'success'
      });
      expect(html).toContain('writefile-card');
      expect(html).toContain('/test/new.txt');
      expect(html).toContain('line1');
      expect(html).toContain('line2');
      expect(html).toContain('line3');
      expect(html).toContain('已生效');
      expect(html).toContain('undo-btn');
    });

    it('渲染失败状态', () => {
      const html = chatUI.renderWriteFileCard({
        name: 'write_file',
        args: '{"path":"/test/new.txt"}',
        result: 'error',
        error: 'permission denied'
      });
      expect(html).toContain('失败');
      expect(html).toContain('permission denied');
      expect(html).not.toContain('已保留');
    });

    it('没有内联 onclick', () => {
      const html = chatUI.renderWriteFileCard({ name: 'write_file', args: '{}', result: 'success' });
      expect(html).not.toContain('onclick=');
    });
  });

  describe('renderAskUserCard', () => {
    it('渲染问题文本', () => {
      const html = chatUI.renderAskUserCard({
        name: 'ask_user',
        args: '{"question":"确认执行此操作？"}'
      });
      expect(html).toContain('ask-user-card');
      expect(html).toContain('确认执行此操作？');
    });

    it('渲染选项按钮', () => {
      const html = chatUI.renderAskUserCard({
        name: 'ask_user',
        args: '{"question":"选择一项","options":["是","否","取消"]}'
      });
      expect(html).toContain('option-btn');
      expect(html).toContain('是');
      expect(html).toContain('否');
      expect(html).toContain('取消');
    });

    it('allow_custom_input=false 时隐藏输入框', () => {
      const html = chatUI.renderAskUserCard({
        name: 'ask_user',
        args: '{"question":"选择","options":["A","B"],"allow_custom_input":false}'
      });
      expect(html).not.toContain('ask-user-input');
      expect(html).not.toContain('send-btn');
    });

    it('header 使用内联 onclick 切换折叠', () => {
      const html = chatUI.renderAskUserCard({ name: 'ask_user', args: '{"question":"?"}' });
      expect(html).toContain('onclick=');
    });
  });

  describe('renderTodoWriteCard', () => {
    it('渲染任务列表和进度', () => {
      const html = chatUI.renderTodoWriteCard({
        name: 'todo_write',
        args: JSON.stringify({
          todos: [
            { content: '任务1', status: 'completed' },
            { content: '任务2', status: 'pending' },
            { content: '任务3', status: 'pending' }
          ]
        })
      });
      expect(html).toContain('todo-card');
      expect(html).toContain('任务1');
      expect(html).toContain('任务2');
      expect(html).toContain('任务3');
      expect(html).toContain('1/3');
    });

    it('空任务列表不报错', () => {
      const html = chatUI.renderTodoWriteCard({ name: 'todo_write', args: '{}' });
      expect(html).toContain('todo-card');
      expect(html).toContain('0/0');
    });

    it('header 使用内联 onclick 切换折叠', () => {
      const html = chatUI.renderTodoWriteCard({ name: 'todo_write', args: '{}' });
      expect(html).toContain('onclick=');
    });
  });

  describe('renderDefaultToolCard', () => {
    it('渲染工具名称和参数', () => {
      const html = chatUI.renderDefaultToolCard({
        name: 'custom_tool',
        args: '{"key":"value"}',
        result: 'success',
        resultContent: '操作完成'
      });
      expect(html).toContain('tool-call-card');
      expect(html).toContain('custom_tool');
      expect(html).toContain('成功');
      expect(html).toContain('操作完成');
    });

    it('渲染错误信息', () => {
      const html = chatUI.renderDefaultToolCard({
        name: 'custom_tool',
        args: '{}',
        result: 'error',
        error: 'something went wrong'
      });
      expect(html).toContain('失败');
      expect(html).toContain('something went wrong');
    });

    it('没有内联 onclick', () => {
      const html = chatUI.renderDefaultToolCard({ name: 't', args: '{}' });
      expect(html).not.toContain('onclick=');
    });
  });

  describe('bindAskUserEvents', () => {
    beforeEach(() => {
      mockEventBusEmit.mockClear();
    });

    it('选项按钮点击触发 ask_user:respond 事件', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <div class="options-list">
          <button class="option-btn" data-option="是">是</button>
          <button class="option-btn" data-option="否">否</button>
        </div>
      `;
      chatUI.bindAskUserEvents(card);

      card.querySelectorAll('.option-btn').forEach(btn => btn.click());
      expect(mockEventBusEmit).toHaveBeenCalledTimes(2);
      expect(mockEventBusEmit).toHaveBeenCalledWith('ask_user:respond', '是');
      expect(mockEventBusEmit).toHaveBeenCalledWith('ask_user:respond', '否');
    });

    it('没有选项按钮时不报错', () => {
      const card = document.createElement('div');
      expect(() => chatUI.bindAskUserEvents(card)).not.toThrow();
    });
  });

  describe('parseTodos', () => {
    it('解析字符串参数', () => {
      const result = chatUI.parseTodos(JSON.stringify({ todos: [{ content: 'task', status: 'pending' }] }));
      expect(result).toEqual([{ content: 'task', status: 'pending' }]);
    });

    it('解析对象参数', () => {
      const result = chatUI.parseTodos({ todos: [{ content: 'task', status: 'completed' }] });
      expect(result).toEqual([{ content: 'task', status: 'completed' }]);
    });

    it('非法参数返回空数组', () => {
      expect(chatUI.parseTodos('invalid')).toEqual([]);
      expect(chatUI.parseTodos({})).toEqual([]);
    });
  });

  describe('parseAskUserArgs', () => {
    it('解析字符串参数', () => {
      const result = chatUI.parseAskUserArgs(JSON.stringify({ question: '确认？', options: ['是'], allow_custom_input: false }));
      expect(result.question).toBe('确认？');
      expect(result.options).toEqual(['是']);
      expect(result.allow_custom_input).toBe(false);
    });

    it('默认 allow_custom_input 为 true', () => {
      const result = chatUI.parseAskUserArgs(JSON.stringify({ question: '确认？' }));
      expect(result.allow_custom_input).toBe(true);
    });

    it('非法参数返回默认值', () => {
      const result = chatUI.parseAskUserArgs('invalid');
      expect(result.question).toBe('');
      expect(result.options).toBeNull();
      expect(result.allow_custom_input).toBe(true);
    });
  });

  describe('parseToolArgs', () => {
    it('解析字符串参数', () => {
      const result = chatUI.parseToolArgs('{"command":"ls"}');
      expect(result).toEqual({ command: 'ls' });
    });

    it('解析对象参数', () => {
      const result = chatUI.parseToolArgs({ command: 'ls' });
      expect(result).toEqual({ command: 'ls' });
    });

    it('非法参数返回空对象', () => {
      expect(chatUI.parseToolArgs('invalid')).toEqual({});
    });
  });

  describe('scrollToBottom', () => {
    it('设置 scrollTop 为 scrollHeight', () => {
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
      chatUI.scrollToBottom();
      expect(container.scrollTop).toBe(1000);
    });
  });

  describe('isNearBottom', () => {
    it('在底部附近返回 true', () => {
      container.scrollTop = 450;
      expect(chatUI.isNearBottom(80)).toBe(true);
    });

    it('不在底部附近返回 false', () => {
      container.scrollTop = 0;
      expect(chatUI.isNearBottom(80)).toBe(false);
    });
  });
});