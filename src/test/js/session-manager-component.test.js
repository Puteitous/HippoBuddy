import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SessionManager.js', () => {
  let SessionManager;
  let sessionManager;
  let listContainer;
  let onSessionSwitch;

  beforeEach(async () => {
    listContainer = document.createElement('div');
    onSessionSwitch = vi.fn();

    const mod = await vi.importActual('../../main/resources/static/js/session-manager.js');
    SessionManager = mod.SessionManager;
    sessionManager = new SessionManager(listContainer, onSessionSwitch);
    // Default to time mode for existing tests; project mode tested separately
    sessionManager._groupMode = 'time';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('初始化', () => {
    it('构造函数设置容器和回调', () => {
      expect(sessionManager.listContainer).toBe(listContainer);
      expect(sessionManager.onSessionSwitch).toBe(onSessionSwitch);
      expect(sessionManager.sessionNames).toEqual({});
      expect(sessionManager.currentSessionId).toBeNull();
    });
  });

  describe('setCurrentSession / getCurrentSession', () => {
    it('设置和获取当前会话 ID', () => {
      sessionManager.setCurrentSession('session-123');
      expect(sessionManager.getCurrentSession()).toBe('session-123');
    });

    it('未设置时返回 null', () => {
      expect(sessionManager.getCurrentSession()).toBeNull();
    });
  });

  describe('setSessionName', () => {
    it('首次设置会话名称', () => {
      sessionManager.setSessionName('s1', '我的会话');
      expect(sessionManager.sessionNames['s1']).toBe('我的会话');
    });

    it('已存在名称时不覆盖', () => {
      sessionManager.sessionNames['s1'] = '已有名称';
      sessionManager.setSessionName('s1', '新名称');
      expect(sessionManager.sessionNames['s1']).toBe('已有名称');
    });

    it('长名称被截断', () => {
      sessionManager.setSessionName('s1', '这是一段很长的会话名称');
      expect(sessionManager.sessionNames['s1'].length).toBeLessThanOrEqual(23);
    });
  });

  describe('renderSessionList', () => {
    function createSession(id, createdAt, title) {
      return { id, createdAt: String(createdAt), title: title || null };
    }

    it('空会话列表不渲染任何内容', () => {
      sessionManager.renderSessionList([]);
      expect(listContainer.innerHTML).toBe('');
    });

    it('渲染会话项并包含名称和时间', () => {
      const sessions = [createSession('s1', Date.now(), '测试会话')];
      sessionManager.setCurrentSession('s1');

      sessionManager.renderSessionList(sessions);

      expect(listContainer.innerHTML).toContain('测试会话');
    });

    it('当前会话添加 active 类', () => {
      const sessions = [createSession('s1', Date.now())];
      sessionManager.setCurrentSession('s1');

      sessionManager.renderSessionList(sessions);

      const item = listContainer.querySelector('.session-item');
      expect(item.classList.contains('active')).toBe(true);
    });

    it('非当前会话没有 active 类', () => {
      const sessions = [createSession('s1', Date.now())];
      sessionManager.setCurrentSession('s2');

      sessionManager.renderSessionList(sessions);

      const items = listContainer.querySelectorAll('.session-item');
      const s1Item = Array.from(items).find(item => item.innerHTML.includes('s1'));
      expect(s1Item).toBeTruthy();
      expect(s1Item.classList.contains('active')).toBe(false);
    });

    it('点击会话项触发 onSessionSwitch', () => {
      const sessions = [createSession('s1', Date.now())];

      sessionManager.renderSessionList(sessions);

      const item = listContainer.querySelector('.session-item');
      item.click();

      expect(onSessionSwitch).toHaveBeenCalledWith('s1');
    });

    it('点击操作按钮不触发 onSessionSwitch', () => {
      const sessions = [createSession('s1', Date.now())];

      sessionManager.renderSessionList(sessions);

      const actionBtn = listContainer.querySelector('.session-actions button');
      actionBtn.click();

      expect(onSessionSwitch).not.toHaveBeenCalled();
    });

    it('按时间倒序排列会话', () => {
      const now = Date.now();
      const sessions = [
        createSession('old', now - 100000),
        createSession('new', now),
      ];

      sessionManager.renderSessionList(sessions);

      const items = listContainer.querySelectorAll('.session-item');
      expect(items[0].innerHTML).toContain('new');
      expect(items[1].innerHTML).toContain('old');
    });

    it('按时间分组显示分类标题', () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const sessions = [
        createSession('today', now),
        createSession('yesterday', now - dayMs),
        createSession('older', now - 7 * dayMs),
      ];

      sessionManager.renderSessionList(sessions);

      const categories = listContainer.querySelectorAll('.session-category');
      const categoryTexts = Array.from(categories).map(c => c.textContent);
      expect(categoryTexts).toContain('今天');
      expect(categoryTexts).toContain('昨天');
    });

    it('当前会话不在列表中时追加到顶部', () => {
      const sessions = [createSession('s1', Date.now())];
      sessionManager.setCurrentSession('orphan-session');
      sessionManager.sessionNames['orphan-session'] = '孤立会话';

      sessionManager.renderSessionList(sessions);

      const firstItem = listContainer.querySelector('.session-item');
      expect(firstItem.innerHTML).toContain('孤立会话');
      expect(firstItem.classList.contains('active')).toBe(true);
    });
  });

  describe('createNewSession', () => {
    it('生成新的会话 ID', async () => {
      sessionManager.chatService.getSessions = vi.fn().mockResolvedValue([]);

      const newId = await sessionManager.createNewSession();

      expect(newId).toMatch(/^web-\d+$/);
      expect(sessionManager.currentSessionId).toBe(newId);
    });
  });

  describe('deleteSession', () => {
    it('确认后调用 chatService.deleteSession', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      sessionManager.chatService.deleteSession = vi.fn().mockResolvedValue(undefined);
      sessionManager.chatService.getSessions = vi.fn().mockResolvedValue([]);
      sessionManager.sessionNames['s1'] = '测试会话';
      sessionManager.currentSessionId = 's1';

      const event = { stopPropagation: vi.fn() };
      await sessionManager.deleteSession('s1', event);

      expect(sessionManager.chatService.deleteSession).toHaveBeenCalledWith('s1');
      expect(event.stopPropagation).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('取消确认时不删除', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      sessionManager.chatService.deleteSession = vi.fn();

      const event = { stopPropagation: vi.fn() };
      await sessionManager.deleteSession('s1', event);

      expect(sessionManager.chatService.deleteSession).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('parseTimestamp', () => {
    it('解析数字字符串为整数', () => {
      expect(sessionManager.parseTimestamp('123456')).toBe(123456);
    });

    it('解析非法字符串返回 NaN', () => {
      expect(sessionManager.parseTimestamp('not-a-number')).toBeNaN();
    });
  });

  describe('formatTimestamp', () => {
    it('格式化时间戳为 HH:MM 格式', () => {
      const date = new Date();
      date.setHours(14, 30, 0, 0);
      const result = sessionManager.formatTimestamp(String(date.getTime()));
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});