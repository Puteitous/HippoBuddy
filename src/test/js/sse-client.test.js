import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom 没有 EventSource，需要 mock
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = MockEventSource.OPEN;
    this.onopen = null;
    this.onerror = null;
  }
  addEventListener(event, handler) {
    this['_handler_' + event] = handler;
  }
  close() {
    this.readyState = MockEventSource.CLOSED;
  }
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
}

describe('sse-client.js', () => {
  let SSEClient;
  let client;

  beforeEach(() => {
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    if (client) client.close();
  });

  describe('初始化', () => {
    it('使用默认选项创建客户端', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      const defaultClient = new mod.SSEClient('/sse/test');
      expect(defaultClient.maxReconnectAttempts).toBe(10);
      expect(defaultClient.baseDelay).toBe(1000);
      expect(defaultClient.maxDelay).toBe(30000);
      defaultClient.close();
    });

    it('使用自定义选项创建客户端', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      SSEClient = mod.SSEClient;
      client = new SSEClient('/sse/test', {
        maxReconnectAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
      });
      expect(client.maxReconnectAttempts).toBe(3);
      expect(client.baseDelay).toBe(100);
      expect(client.maxDelay).toBe(1000);
    });

    it('未连接时返回 false', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      expect(client.isConnected()).toBeFalsy();
      expect(client.getReconnectAttempts()).toBe(0);
    });
  });

  describe('connect / close', () => {
    it('connect 创建 EventSource', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      client.connect();
      expect(client.es).toBeDefined();
      expect(client.es instanceof MockEventSource).toBe(true);
      expect(client.es.url).toContain('/sse/test');
    });

    it('close 关闭 EventSource 并清理定时器', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      client.connect();
      client.close();

      expect(client.isManualClose).toBe(true);
      expect(client.reconnectTimer).toBeNull();
    });

    it('重复 connect 会关闭旧连接', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      client.connect();
      const firstEs = client.es;

      client.connect();
      const secondEs = client.es;

      expect(firstEs).not.toBe(secondEs);
    });
  });

  describe('事件处理', () => {
    it('on 注册事件处理器', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      const handler = vi.fn();
      client.on('custom_event', handler);

      expect(client.eventHandlers.has('custom_event')).toBe(true);
      expect(client.eventHandlers.get('custom_event')).toBe(handler);
    });

    it('onOpen 设置打开回调', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      const handler = vi.fn();
      client.onOpen(handler);
      expect(client.onOpenHandler).toBe(handler);
    });

    it('onError 设置错误回调', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      const handler = vi.fn();
      client.onError(handler);
      expect(client.onErrorHandler).toBe(handler);
    });
  });

  describe('重连逻辑', () => {
    it('resetReconnectAttempts 重置重连计数', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      client.reconnectAttempts = 5;
      client.resetReconnectAttempts();
      expect(client.getReconnectAttempts()).toBe(0);
    });

    it('close 后不触发重连', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      const errorHandler = vi.fn();
      client.onError(errorHandler);
      client.connect();
      client.close();

      expect(client.isManualClose).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('未连接时返回 false', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      expect(client.isConnected()).toBeFalsy();
    });

    it('连接后返回 true', async () => {
      const mod = await import('../../main/resources/static/js/sse-client.js');
      client = new mod.SSEClient('/sse/test');
      client.connect();
      expect(client.isConnected()).toBe(true);
    });
  });
});