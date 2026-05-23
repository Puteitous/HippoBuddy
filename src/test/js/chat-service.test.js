import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== chat-service.js ====================
describe('chat-service.js', () => {
  let ChatService;
  let chatService;

  beforeEach(async () => {
    const mod = await import('../../main/resources/static/js/chat-service.js');
    ChatService = mod.ChatService;
    chatService = new ChatService('', { maxRetries: 1, retryDelay: 10 });
  });

  describe('stopGeneration', () => {
    it('调用 abortController.abort()', () => {
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      chatService.stopGeneration(abortController);

      expect(abortSpy).toHaveBeenCalled();
    });

    it('abortController 为 null 时不报错', () => {
      expect(() => chatService.stopGeneration(null)).not.toThrow();
    });
  });

  describe('executeRequest SSE 解析', () => {
    function createMockResponse(events) {
      const encoder = new TextEncoder();
      const chunks = events.map(e => {
        let text = '';
        if (e.event) text += `event: ${e.event}\n`;
        text += `data: ${e.data}\n\n`;
        return encoder.encode(text);
      });

      return {
        ok: true,
        body: {
          getReader() {
            let index = 0;
            return {
              read() {
                if (index < chunks.length) {
                  return Promise.resolve({ done: false, value: chunks[index++] });
                }
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        }
      };
    }

    it('解析 message 事件中的 content', async () => {
      const mockResponse = createMockResponse([
        { event: 'message', data: '{"content":"Hello"}' },
        { event: 'done', data: '[DONE]' },
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      const result = await chatService.executeRequest(
        'session-1', 'hi', (chunk) => chunks.push(chunk), null
      );

      expect(result.hasContent).toBe(true);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Hello');
    });

    it('解析 message_id 事件', async () => {
      const mockResponse = createMockResponse([
        { event: 'message_id', data: '{"id":"msg-123"}' },
        { event: 'done', data: '[DONE]' },
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      const result = await chatService.executeRequest(
        'session-1', 'hi', (chunk) => chunks.push(chunk), null
      );

      expect(result.hasContent).toBe(true);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].id).toBe('msg-123');
    });

    it('解析 error 事件', async () => {
      const mockResponse = createMockResponse([
        { event: 'error', data: '{"message":"出错了"}' },
        { event: 'done', data: '[DONE]' },
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      const result = await chatService.executeRequest(
        'session-1', 'hi', (chunk) => chunks.push(chunk), null
      );

      expect(result.hasContent).toBe(true);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].message).toBe('出错了');
    });

    it('解析 tool_call 事件', async () => {
      const mockResponse = createMockResponse([
        { event: 'tool_call', data: '{"name":"bash","args":"ls"}' },
        { event: 'done', data: '[DONE]' },
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      const result = await chatService.executeRequest(
        'session-1', 'hi', (chunk) => chunks.push(chunk), null
      );

      expect(result.hasContent).toBe(true);
      expect(chunks[0].name).toBe('bash');
    });

    it('处理多行 data（JSON 跨多行）', async () => {
      const encoder = new TextEncoder();
      const multiLineData = '{"content":"Hello\\nWorld"}';
      const rawText = `event: message\ndata: ${multiLineData}\n\n`;
      const mockResponse = {
        ok: true,
        body: {
          getReader() {
            let read = false;
            return {
              read() {
                if (!read) {
                  read = true;
                  return Promise.resolve({ done: false, value: encoder.encode(rawText) });
                }
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        }
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      const result = await chatService.executeRequest(
        'session-1', 'hi', (chunk) => chunks.push(chunk), null
      );

      expect(result.hasContent).toBe(true);
      expect(chunks).toHaveLength(1);
    });

    it('HTTP 错误时抛出异常', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(chatService.executeRequest('session-1', 'hi'))
        .rejects.toThrow('HTTP error! status: 500');
    });

    it('AbortSignal 被触发时抛出 AbortError', async () => {
      const controller = new AbortController();
      const encoder = new TextEncoder();

      globalThis.fetch = vi.fn().mockImplementation((url, options) => {
        controller.abort();
        return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
      });

      await expect(chatService.executeRequest('session-1', 'hi', null, controller.signal))
        .rejects.toThrow();
    });
  });

  describe('sendMessage 重试逻辑', () => {
    it('空响应时自动重试', async () => {
      let getReaderCallCount = 0;
      const mockResponse = {
        ok: true,
        body: {
          getReader() {
            getReaderCallCount++;
            const isRetry = getReaderCallCount > 1;
            let dataReturned = false;
            return {
              read() {
                if (isRetry && !dataReturned) {
                  dataReturned = true;
                  const encoder = new TextEncoder();
                  return Promise.resolve({
                    done: false,
                    value: encoder.encode('event: message\ndata: {"content":"Hello"}\n\nevent: done\ndata: [DONE]\n\n')
                  });
                }
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        }
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const chunks = [];
      await chatService.sendMessage('session-1', 'hi', (chunk) => chunks.push(chunk));

      expect(getReaderCallCount).toBeGreaterThanOrEqual(2);
      expect(chunks.some(c => c.content === 'Hello')).toBe(true);
    });

    it('所有重试都失败时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            return {
              read() {
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        }
      });

      await expect(chatService.sendMessage('session-1', 'hi'))
        .rejects.toThrow('LLM 未返回有效内容');
    });
  });

  describe('API 方法', () => {
    it('getSessions 调用 /api/sessions', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 's1' }]),
      });

      const result = await chatService.getSessions();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/sessions');
      expect(result).toEqual([{ id: 's1' }]);
    });

    it('getSessionMessages 调用 /api/sessions/{id}/messages', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ role: 'user', content: 'hi' }]),
      });

      const result = await chatService.getSessionMessages('s1');

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/sessions/s1/messages');
      expect(result).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('getSessionMessages 返回 404 时返回空数组', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 404 });

      const result = await chatService.getSessionMessages('nonexistent');

      expect(result).toEqual([]);
    });

    it('deleteSession 调用 DELETE /api/sessions/{id}', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await chatService.deleteSession('s1');

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/sessions/s1', { method: 'DELETE' });
    });

    it('renameSession 调用 POST /api/sessions/{id}/rename', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await chatService.renameSession('s1', '新名称');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/rename',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: '新名称' }),
        })
      );
    });

    it('compactSession 调用 POST /api/sessions/{id}/compact', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await chatService.compactSession('s1', '压缩指令');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/compact',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ instruction: '压缩指令' }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('getTokenStats 调用 /api/sessions/{id}/tokens', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ currentTokens: 100, maxTokens: 8000 }),
      });

      const result = await chatService.getTokenStats('s1');

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/sessions/s1/tokens');
      expect(result.currentTokens).toBe(100);
    });

    it('truncateSession 调用 POST /api/sessions/{id}/truncate', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, message: '已截断' }),
      });

      const result = await chatService.truncateSession('s1', 'msg-123', 1000, 2000);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/truncate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: 'msg-123', startTime: 1000, endTime: 2000 }),
        })
      );
      expect(result).toEqual({ success: true, message: '已截断' });
    });

    it('truncateSession 不带时间戳参数时使用默认值', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await chatService.truncateSession('s1', 'msg-123');

      const callBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(callBody.messageId).toBe('msg-123');
      expect(callBody.startTime).toBeUndefined();
      expect(callBody.endTime).toBeUndefined();
    });

    it('truncateSession 请求失败时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'messageId is required' }),
      });

      await expect(
        chatService.truncateSession('s1', '')
      ).rejects.toThrow('messageId is required');
    });

    it('truncateSession 网络错误时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        chatService.truncateSession('s1', 'msg-123', 0, 1000)
      ).rejects.toThrow('Network error');
    });
  });
});