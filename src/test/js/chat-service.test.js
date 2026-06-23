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

    it('tool_result JSON 损坏时通过正则兜底提取 id/name/success', async () => {
      // 模拟 tool_result 的 data 中包含未转义字符导致 JSON.parse 失败
      const encoder = new TextEncoder();
      const rawText = 'event: tool_result\ndata: {"id":"tc-1","name":"edit_file","success":true,"result":"内容含有未转义\\n换行","args":{"path":"bad\\file"}}\n\nevent: done\ndata: [DONE]\n\n';
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

      // 即使 JSON 损坏，正则兜底也能提取出关键字段
      const toolResultChunk = chunks.find(c => c._eventType === 'tool_result');
      expect(toolResultChunk).toBeDefined();
      expect(toolResultChunk.id).toBe('tc-1');
      expect(toolResultChunk.name).toBe('edit_file');
      expect(toolResultChunk.success).toBe(true);
      expect(result.hasContent).toBe(true);
    });

    it('tool_result JSON 完全损坏无法正则恢复时回退到 raw_error', async () => {
      // 完全乱数据，正则也救不回来
      const encoder = new TextEncoder();
      const rawText = 'event: tool_result\ndata: {{{{完全乱掉了}}}\n\nevent: done\ndata: [DONE]\n\n';
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

      // 应回退到 raw 类型数据
      const rawChunk = chunks.find(c => c.type === 'tool_result');
      expect(rawChunk).toBeDefined();
      expect(rawChunk.content).toBe('{{{{完全乱掉了}}}');
      expect(result.hasContent).toBe(true);
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

    it('generateTitle 调用 POST /api/sessions/{id}/title 并返回标题', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: '帮我写一个React组件', source: 'generated' }),
      });

      const result = await chatService.generateTitle('s1');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/title',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual({ title: '帮我写一个React组件', source: 'generated' });
    });

    it('generateTitle 请求失败时返回 null', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 404 });

      const result = await chatService.generateTitle('nonexistent');

      expect(result).toBeNull();
    });

    it('generateTitle 网络异常时返回 null', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await chatService.generateTitle('s1');

      expect(result).toBeNull();
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

    it('rewind 调用 POST /api/sessions/{id}/rewind', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, filesChanged: 2 }),
      });

      const result = await chatService.rewind('s1', 'msg-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/rewind',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: 'msg-123', mode: 'all' }),
        })
      );
      expect(result).toEqual({ success: true, filesChanged: 2 });
    });

    it('rewind 发送正确的请求体（默认 mode=all）', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await chatService.rewind('s1', 'msg-123');

      const callBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(callBody.messageId).toBe('msg-123');
      expect(callBody.mode).toBe('all');
    });

    it('rewind 支持 mode 参数', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await chatService.rewind('s1', 'msg-123', 'files');

      const callBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(callBody.messageId).toBe('msg-123');
      expect(callBody.mode).toBe('files');
    });

    it('rewind 请求失败时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'messageId is required' }),
      });

      await expect(
        chatService.rewind('s1', '')
      ).rejects.toThrow('messageId is required');
    });

    it('rewind 网络错误时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        chatService.rewind('s1', 'msg-123')
      ).rejects.toThrow('Network error');
    });

    it('rewindPreview 调用 POST /api/sessions/{id}/rewind-check', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [{ path: 'test.java', action: 'restore' }] }),
      });

      const result = await chatService.rewindPreview('s1', 'msg-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/rewind-check',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: 'msg-123' }),
        })
      );
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('test.java');
      expect(result.files[0].action).toBe('restore');
    });

    it('rewindPreview 请求失败时返回空文件列表', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

      const result = await chatService.rewindPreview('s1', 'msg-unknown');

      expect(result).toEqual({ files: [] });
    });

    it('rewindPreview 网络错误时返回空文件列表', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await chatService.rewindPreview('s1', 'msg-123');

      expect(result).toEqual({ files: [] });
    });

    it('forkSession 调用 POST /api/sessions/{id}/fork', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ newSessionId: 's1_fork_123', messageCount: 5 }),
      });

      const result = await chatService.forkSession('s1', 'msg-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sessions/s1/fork',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: 'msg-123' }),
        })
      );
      expect(result.newSessionId).toBe('s1_fork_123');
      expect(result.messageCount).toBe(5);
    });

    it('forkSession 请求失败时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'messageId is required' }),
      });

      await expect(
        chatService.forkSession('s1', '')
      ).rejects.toThrow('messageId is required');
    });

    it('forkSession 网络错误时抛出错误', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        chatService.forkSession('s1', 'msg-123')
      ).rejects.toThrow('Network error');
    });

  });
});