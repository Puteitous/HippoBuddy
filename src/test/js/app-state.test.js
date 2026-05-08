import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('app-state.js', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('AppState 初始化', () => {
    it('init() 返回自身以支持链式调用', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      expect(appState.init()).toBe(appState);
    });

    it('默认主题为 light', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      expect(appState.currentTheme).toBe('light');
    });

    it('从 localStorage 恢复主题', async () => {
      localStorage.setItem('hippo-theme', 'dark');
      vi.resetModules();
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      expect(appState.currentTheme).toBe('dark');
    });
  });

  describe('setState', () => {
    it('更新状态值', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentSessionId', 'session-123');
      expect(appState.currentSessionId).toBe('session-123');
    });

    it('触发已订阅的监听器', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentSessionId', null);
      const listener = vi.fn();
      appState.subscribe('currentSessionId', listener);

      appState.setState('currentSessionId', 'session-456');

      expect(listener).toHaveBeenCalledWith('session-456', null);
    });

    it('监听器收到新旧值', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentSessionId', 'old-value');
      const listener = vi.fn();
      appState.subscribe('currentSessionId', listener);

      appState.setState('currentSessionId', 'new-value');

      expect(listener).toHaveBeenCalledWith('new-value', 'old-value');
    });

    it('主题变更自动持久化到 localStorage', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentTheme', 'dark');
      expect(localStorage.getItem('hippo-theme')).toBe('dark');
    });
  });

  describe('subscribe', () => {
    it('返回取消订阅函数', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      const listener = vi.fn();
      const unsubscribe = appState.subscribe('currentSessionId', listener);

      unsubscribe();
      appState.setState('currentSessionId', 'test');

      expect(listener).not.toHaveBeenCalled();
    });

    it('多个监听器按顺序触发', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      const order = [];
      appState.subscribe('currentSessionId', () => order.push(1));
      appState.subscribe('currentSessionId', () => order.push(2));

      appState.setState('currentSessionId', 'test');

      expect(order).toEqual([1, 2]);
    });
  });

  describe('toggleTheme', () => {
    it('从 light 切换到 dark', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentTheme', 'light');
      const result = appState.toggleTheme();
      expect(result).toBe('dark');
      expect(appState.currentTheme).toBe('dark');
    });

    it('从 dark 切换到 light', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setState('currentTheme', 'dark');
      const result = appState.toggleTheme();
      expect(result).toBe('light');
      expect(appState.currentTheme).toBe('light');
    });
  });

  describe('addTokenRecord', () => {
    it('添加记录到 tokenHistory', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.tokenHistory = [];

      appState.addTokenRecord({ total: 100, prompt: 60, completion: 40 });

      expect(appState.tokenHistory).toHaveLength(1);
      expect(appState.tokenHistory[0].total).toBe(100);
      expect(appState.tokenHistory[0].prompt).toBe(60);
      expect(appState.tokenHistory[0].completion).toBe(40);
      expect(appState.tokenHistory[0].timestamp).toBeDefined();
    });

    it('不超过 maxTrendPoints 限制', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.tokenHistory = [];

      for (let i = 0; i < 35; i++) {
        appState.addTokenRecord({ total: i });
      }

      expect(appState.tokenHistory.length).toBeLessThanOrEqual(30);
    });
  });

  describe('getSystemPrompt / setSystemPrompt', () => {
    it('设置和获取系统提示词', async () => {
      const { appState } = await import('../../main/resources/static/js/state/app-state.js');
      appState.setSystemPrompt('你是一个助手');
      expect(appState.getSystemPrompt()).toBe('你是一个助手');
    });
  });
});