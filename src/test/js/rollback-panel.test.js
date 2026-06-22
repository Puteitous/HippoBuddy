import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('RollbackPanel.js', () => {
  let RollbackPanel;
  let panel;
  let mockChatService;
  let mockChatPanel;
  let mockChatContainer;

  beforeEach(async () => {
    mockChatService = {
      rewindPreview: vi.fn(),
      rewind: vi.fn(),
      invalidateMessageCache: vi.fn(),
      deleteSession: vi.fn(),
      getSessionMessages: vi.fn()
    };
    mockChatPanel = {
      currentAbortController: null,
      stopGeneration: vi.fn(),
      _lastUserMessageId: null,
      loadHistoryMessages: vi.fn()
    };
    mockChatContainer = document.createElement('div');

    const mod = await import('../../main/resources/static/js/components/RollbackPanel.js');
    RollbackPanel = mod.RollbackPanel;
    panel = new RollbackPanel({
      chatService: mockChatService,
      chatPanel: mockChatPanel,
      chatContainer: mockChatContainer,
      messageInput: null,
      onCreateNewSession: vi.fn(),
      onUpdateFileChanges: vi.fn()
    });
  });

  describe('_createLoadingPanel', () => {
    it('创建 loading 面板', () => {
      const el = panel._createLoadingPanel();
      expect(el.className).toBe('rollback-inline-loading');
      expect(el.innerHTML).toContain('正在检查文件变更');
    });
  });

  describe('_buildPanel', () => {
    it('有文件预览时构建面板', () => {
      const files = [
        { filePath: '/a/b.js', action: 'restore', insertions: 5, deletions: 3 },
        { filePath: '/c/d.css', action: 'delete' }
      ];
      const el = panel._buildPanel(files);
      expect(el.className).toBe('rollback-inline');
      expect(el.querySelector('.rollback-inline-count').textContent).toContain('2 个文件');
      expect(el.querySelectorAll('.rollback-inline-file').length).toBe(2);
      expect(el.querySelector('.file-status-letter.action-restore')).toBeDefined();
      expect(el.querySelector('.file-status-letter.action-restore').textContent).toBe('M');
      expect(el.querySelector('.file-status-letter.action-delete').textContent).toBe('D');
    });

    it('无文件时显示无变更', () => {
      const el = panel._buildPanel([]);
      expect(el.querySelector('.rollback-inline-count').textContent).toContain('无文件变更');
      expect(el.querySelector('.rollback-inline-files')).toBeNull();
    });
  });

  describe('_resolveMessageId', () => {
    it('从 user 消息的 dataset 中获取 messageId', () => {
      const container2 = document.createElement('div');
      const userRow = document.createElement('div');
      userRow.className = 'message-row user-row';
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userMsg.dataset.messageId = 'msg-123';
      userRow.appendChild(userMsg);
      container2.appendChild(userRow);

      const assistantRow = document.createElement('div');
      assistantRow.className = 'message-row assistant-row';
      container2.appendChild(assistantRow);

      const id = panel._resolveMessageId(assistantRow);
      expect(id).toBe('msg-123');
    });

    it('当 user 无 messageId 时回退到 _lastUserMessageId', () => {
      mockChatPanel._lastUserMessageId = 'msg-456';
      const c = document.createElement('div');
      const assistantRow = document.createElement('div');
      assistantRow.className = 'message-row assistant-row';
      c.appendChild(assistantRow);
      const userRow = document.createElement('div');
      userRow.className = 'message-row user-row';
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userRow.appendChild(userMsg);
      c.insertBefore(userRow, assistantRow);

      const id = panel._resolveMessageId(assistantRow);
      expect(id).toBe('msg-456');
    });

    it('无 user 且无 lastUserMessageId 时返回 undefined', () => {
      const c = document.createElement('div');
      const assistantRow = document.createElement('div');
      assistantRow.className = 'message-row assistant-row';
      c.appendChild(assistantRow);
      const userRow = document.createElement('div');
      userRow.className = 'message-row user-row';
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userRow.appendChild(userMsg);
      c.insertBefore(userRow, assistantRow);

      const id = panel._resolveMessageId(assistantRow);
      expect(id).toBeUndefined();
    });
  });

  describe('_animateRemove', () => {
    it('添加退出动画 class 并在动画结束后移除', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      panel._animateRemove(el);
      expect(el.classList.contains('rollback-inline-exit')).toBe(true);
      el.dispatchEvent(new Event('animationend'));
      expect(document.body.contains(el)).toBe(false);
      document.body.innerHTML = '';
    });
  });
});
