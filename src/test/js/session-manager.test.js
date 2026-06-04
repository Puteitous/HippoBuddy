import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== session-manager.js ====================
describe('session-manager.js', () => {
  let SessionManager;
  let sessionManager;
  let mockContainer;

  beforeEach(async () => {
    const mod = await import('../../main/resources/static/js/session-manager.js');
    SessionManager = mod.SessionManager;

    mockContainer = document.createElement('div');
    sessionManager = new SessionManager(mockContainer, vi.fn());
  });

  describe('parseTimestamp', () => {
    it('解析数字字符串为整数', () => {
      expect(sessionManager.parseTimestamp('1234567890')).toBe(1234567890);
    });

    it('解析非法字符串返回 NaN', () => {
      expect(sessionManager.parseTimestamp('not-a-number')).toBeNaN();
    });

    it('解析空字符串返回 NaN', () => {
      expect(sessionManager.parseTimestamp('')).toBeNaN();
    });
  });

  describe('formatTimestamp', () => {
    it('格式化时间戳为 HH:MM 格式', () => {
      const date = new Date(2024, 0, 1, 14, 30, 0);
      const result = sessionManager.formatTimestamp(date.getTime().toString());
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('groupSessionsByTime', () => {
    it('将今天的会话归入"今天"分组', () => {
      const BEIJING_OFFSET = 8 * 3600 * 1000;
      const now = Date.now();
      const beijingNow = now + BEIJING_OFFSET;
      const startOfBeijingDay = Math.floor(beijingNow / 86400000) * 86400000;
      const safeTimestamp = startOfBeijingDay + 10 * 3600 * 1000 - BEIJING_OFFSET;

      const sessions = [
        { id: 's1', createdAt: safeTimestamp.toString() },
        { id: 's2', createdAt: (safeTimestamp - 3600000).toString() },
      ];

      const groups = sessionManager.groupSessionsByTime(sessions);

      expect(groups['今天']).toHaveLength(2);
      expect(groups['昨天']).toHaveLength(0);
      expect(groups['7天内']).toHaveLength(0);
      expect(groups['30天内']).toHaveLength(0);
    });

    it('将昨天的会话归入"昨天"分组', () => {
      const yesterday = Date.now() - 86400000;
      const sessions = [
        { id: 's1', createdAt: yesterday.toString() },
      ];

      const groups = sessionManager.groupSessionsByTime(sessions);

      expect(groups['昨天']).toHaveLength(1);
    });

    it('将7天内的会话归入"7天内"分组', () => {
      const threeDaysAgo = Date.now() - 3 * 86400000;
      const sessions = [
        { id: 's1', createdAt: threeDaysAgo.toString() },
      ];

      const groups = sessionManager.groupSessionsByTime(sessions);

      expect(groups['7天内']).toHaveLength(1);
    });

    it('将更早的会话归入"更早"分组', () => {
      const thirtyFiveDaysAgo = Date.now() - 35 * 86400000;
      const sessions = [
        { id: 's1', createdAt: thirtyFiveDaysAgo.toString() },
      ];

      const groups = sessionManager.groupSessionsByTime(sessions);

      expect(groups['更早']).toHaveLength(1);
    });

    it('空会话列表返回全空分组', () => {
      const groups = sessionManager.groupSessionsByTime([]);

      expect(groups['今天']).toHaveLength(0);
      expect(groups['昨天']).toHaveLength(0);
      expect(groups['7天内']).toHaveLength(0);
      expect(groups['30天内']).toHaveLength(0);
      expect(groups['更早']).toHaveLength(0);
    });
  });

  describe('setCurrentSession / getCurrentSession', () => {
    it('设置和获取当前会话 ID', () => {
      sessionManager.setCurrentSession('session-abc');
      expect(sessionManager.getCurrentSession()).toBe('session-abc');
    });

    it('未设置时返回 null', () => {
      expect(sessionManager.getCurrentSession()).toBeNull();
    });
  });

  describe('setSessionName', () => {
    it('设置会话名称（仅首次）', () => {
      sessionManager.setSessionName('s1', '我的会话');
      expect(sessionManager.sessionNames['s1']).toBe('我的会话');
    });

    it('已存在名称时不覆盖', () => {
      sessionManager.sessionNames['s1'] = '已有名称';
      sessionManager.setSessionName('s1', '新名称');
      expect(sessionManager.sessionNames['s1']).toBe('已有名称');
    });

    it('长名称被截断', () => {
      sessionManager.setSessionName('s1', 'a'.repeat(50));
      expect(sessionManager.sessionNames['s1'].length).toBeLessThanOrEqual(23);
    });
  });
});