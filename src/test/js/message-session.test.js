import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('MessageSession.js', () => {
  let MessageSession;
  let session;
  let mockChatUI;
  let mockRenderPipeline;
  let mockChatService;
  let contentDiv;
  let btnContainer;

  beforeEach(async () => {
    contentDiv = document.createElement('div');
    btnContainer = document.createElement('div');
    const retryBtn = document.createElement('button');
    const copyBtn = document.createElement('button');

    mockChatUI = {
      appendAssistantMessage: vi.fn().mockReturnValue({
        contentDiv,
        btnContainer,
        copyBtn,
        retryBtn,
        msgDiv: document.createElement('div')
      }),
      scrollToBottom: vi.fn(),
      parseTodos: vi.fn().mockReturnValue([])
    };

    mockRenderPipeline = {
      setContainer: vi.fn(),
      scheduleRender: vi.fn(),
      flush: vi.fn(),
      markTextOnly: vi.fn(),
      renderFinal: vi.fn().mockResolvedValue(undefined)
    };

    mockChatService = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      executeRequest: vi.fn().mockResolvedValue(undefined)
    };

    const mod = await import('../../main/resources/static/js/components/MessageSession.js');
    MessageSession = mod.MessageSession;
    session = new MessageSession({
      chatUI: mockChatUI,
      renderPipeline: mockRenderPipeline,
      chatService: mockChatService
    });
  });

  describe('初始化', () => {
    it('segments 和 currentText 初始为空', () => {
      expect(session.getSegments()).toEqual([]);
      expect(session.getCurrentText()).toBe('');
    });

    it('contentDiv 初始为 null', () => {
      expect(session.getContentDiv()).toBeNull();
    });
  });

  describe('状态管理方法', () => {
    it('pushTextSegment 将 currentText 转为 segment', () => {
      session.setCurrentText('hello');
      session.pushTextSegment();
      expect(session.getSegments().length).toBe(1);
      expect(session.getSegments()[0].type).toBe('text');
      expect(session.getSegments()[0].content).toBe('hello');
      expect(session.getCurrentText()).toBe('');
    });

    it('currentText 为空时 pushTextSegment 不创建 segment', () => {
      session.pushTextSegment();
      expect(session.getSegments().length).toBe(0);
    });

    it('pushSegment 追加 segment', () => {
      session.pushSegment({ type: 'tool', name: 'bash' });
      expect(session.getSegments().length).toBe(1);
      expect(session.getSegments()[0].name).toBe('bash');
    });

    it('clearAll 重置所有状态', () => {
      session.setCurrentText('text');
      session.pushSegment({ type: 'tool', name: 'bash' });
      session.clearAll();
      expect(session.getSegments()).toEqual([]);
      expect(session.getCurrentText()).toBe('');
    });

    it('clearReasoning 标记并清除 reasoning segment', () => {
      session._reasoningSegment = { type: 'thinking', content: '思考', done: false };
      session.clearReasoning();
      expect(session._reasoningSegment).toBeNull();
    });
  });

  describe('handleReasoning', () => {
    it('创建新的 reasoning segment', () => {
      session.handleReasoning({ reasoning: '思考过程' }, contentDiv);
      expect(session._reasoningSegment).toBeDefined();
      expect(session._reasoningSegment.content).toBe('思考过程');
      expect(session.getSegments()[0]).toBe(session._reasoningSegment);
    });

    it('追加 reasoning 内容', () => {
      session.handleReasoning({ reasoning: '第一步' }, contentDiv);
      session.handleReasoning({ reasoning: '第二步' }, contentDiv);
      expect(session._reasoningSegment.content).toBe('第一步第二步');
    });
  });

  describe('handleReasoningDone', () => {
    it('标记 reasoning 完成', () => {
      session._reasoningSegment = { type: 'thinking', content: '思考', done: false };
      session.getSegments().push(session._reasoningSegment);
      session.handleReasoningDone();
      expect(session._reasoningSegment).toBeNull();
      expect(session.getSegments()[0].done).toBe(true);
    });
  });

  describe('handleContent', () => {
    it('追加 content 文本', () => {
      session.handleContent({ content: 'Hello' }, contentDiv);
      expect(session.getCurrentText()).toBe('Hello');
    });

    it('追加多个 content 块', () => {
      session.handleContent({ content: 'Hello' }, contentDiv);
      session.handleContent({ content: ' World' }, contentDiv);
      expect(session.getCurrentText()).toBe('Hello World');
    });

    it('content 到达时隐式结束 reasoning', () => {
      session._reasoningSegment = { type: 'thinking', content: '思考', done: false };
      session.getSegments().push(session._reasoningSegment);
      session.handleContent({ content: '答案' }, contentDiv);
      expect(session._reasoningSegment).toBeNull();
    });
  });

  describe('handleToolStart', () => {
    it('标记 hasReceivedData', () => {
      expect(session._hasReceivedData).toBe(false);
      session.handleToolStart({ name: 'bash', id: 'tc-1' }, contentDiv);
      expect(session._hasReceivedData).toBe(true);
    });

    it('隐式结束 reasoning', () => {
      session._reasoningSegment = { type: 'thinking', content: '思考', done: false };
      session.getSegments().push(session._reasoningSegment);
      session.handleToolStart({ name: 'bash' }, contentDiv);
      expect(session._reasoningSegment).toBeNull();
    });
  });

  describe('handleToolResult', () => {
    it('更新工具状态', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', args: '{}', result: null, error: null });
      session.handleToolResult({ name: 'bash', success: true });
      expect(session.getSegments()[0].result).toBe('success');
    });

    it('按 tool_call_id 匹配', () => {
      session.getSegments().push({ type: 'tool', id: 'tc-1', name: 'bash', args: '{}', result: null });
      session.handleToolResult({ tool_call_id: 'tc-1', name: 'bash', success: false, error: '失败' });
      expect(session.getSegments()[0].result).toBe('error');
      expect(session.getSegments()[0].error).toBe('失败');
    });

    it('清除 confirmationData', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', args: '{}', result: null, confirmationData: { confirmId: 'cf-1' } });
      session.handleToolResult({ name: 'bash', success: true });
      expect(session.getSegments()[0].confirmationData).toBeNull();
    });

    it('通过 id 兜底匹配（name 字段缺失时的 fallback）', () => {
      session.getSegments().push({ type: 'tool', id: 'tc-1', name: 'bash', args: '{}', result: null });
      // 模拟 name 缺失（如 JSON 损坏场景），只有 id
      session.handleToolResult({ id: 'tc-1', success: false, error: 'JSON 解析异常' });
      expect(session.getSegments()[0].result).toBe('error');
      expect(session.getSegments()[0].error).toBe('JSON 解析异常');
    });

    it('同时缺失 name 和 id 时不应匹配', () => {
      session.getSegments().push({ type: 'tool', id: 'tc-1', name: 'bash', args: '{}', result: null });
      session.handleToolResult({ success: true });
      // 无匹配，segment 的 result 仍为 null
      expect(session.getSegments()[0].result).toBeNull();
    });
  });

  describe('handleToolProgress', () => {
    it('追加进度行', () => {
      session.getSegments().push({ type: 'tool', id: 'tc-1', name: 'bash', result: null });
      session.handleToolProgress({ id: 'tc-1', line: '正在执行...' });
      expect(session.getSegments()[0].progressLines).toEqual(['正在执行...']);
    });
  });

  describe('handleToolConfirmation', () => {
    it('设置确认数据', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', result: null });
      session.handleToolConfirmation({ confirmId: 'cf-1', command: 'rm -rf', riskLevel: 'high', riskReason: '危险操作' });
      const seg = session.getSegments()[0];
      expect(seg.confirmationData.confirmId).toBe('cf-1');
      expect(seg.confirmationData.command).toBe('rm -rf');
    });
  });

  describe('updateTodoAtIndex', () => {
    it('替换指定位置的 segment', () => {
      session.getSegments().push({ type: 'tool', name: 'todo_write', args: '{}', result: null });
      session.updateTodoAtIndex(0, { type: 'tool', name: 'todo_write', args: '{"todos":[]}', result: null });
      expect(session.getSegments()[0].args).toBe('{"todos":[]}');
    });
  });

  describe('healStuckCards', () => {
    it('标记待确认的卡片为已取消', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', result: null, confirmationData: { confirmId: 'cf-1' } });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(1);
      expect(modified[0]).toMatchObject({ name: 'bash', toStatus: 'cancelled' });
      expect(session.getSegments()[0].result).toBe('cancelled');
    });

    it('标记有进度的卡片为已中断', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', result: null, progressLines: ['进度1'] });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(1);
      expect(modified[0]).toMatchObject({ name: 'bash', toStatus: 'interrupted' });
      expect(session.getSegments()[0].result).toBe('interrupted');
    });

    it('空壳卡片标记为已取消', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', result: null });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(1);
      expect(modified[0]).toMatchObject({ name: 'bash', toStatus: 'cancelled' });
      expect(session.getSegments()[0].result).toBe('cancelled');
    });

    it('已有结果的卡片不处理', () => {
      session.getSegments().push({ type: 'tool', name: 'bash', result: 'success' });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(0);
    });

    it('没有工具卡片时不触发修改', () => {
      session.getSegments().push({ type: 'text', content: 'hello' });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(0);
    });

    it('混合场景：已成功的跳过，stuck 的标记为取消', () => {
      session.getSegments().push({ type: 'tool', name: 'edit_file', result: 'success' });
      session.getSegments().push({ type: 'tool', name: 'bash', result: null });
      session.getSegments().push({ type: 'tool', name: 'write_file', result: 'success' });
      const modified = session.healStuckCards();
      expect(modified.length).toBe(1);
      expect(modified[0]).toMatchObject({ name: 'bash', toStatus: 'cancelled' });
      // 已成功的不会被改
      expect(session.getSegments()[0].result).toBe('success');
      expect(session.getSegments()[2].result).toBe('success');
    });
  });

  describe('start()', () => {
    it('调用 chatService.sendMessage', async () => {
      mockChatService.sendMessage.mockResolvedValue(undefined);
      await session.start({
        sessionId: 's-1',
        content: '你好',
        signal: null,
        systemPrompt: '你是助手',
        editMessageId: null,
        useExecuteRequest: false
      });
      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        's-1', '你好', expect.any(Function), null, '你是助手', null, undefined
      );
    });

    it('useExecuteRequest 时调用 executeRequest', async () => {
      mockChatService.executeRequest.mockResolvedValue(undefined);
      await session.start({
        sessionId: 's-1',
        content: 'ask response',
        signal: null,
        useExecuteRequest: true
      });
      expect(mockChatService.executeRequest).toHaveBeenCalledWith(
        's-1', 'ask response', expect.any(Function), null, null, null
      );
    });

    it('创建 assistant message', async () => {
      mockChatService.sendMessage.mockResolvedValue(undefined);
      await session.start({
        sessionId: 's-1', content: 'hi', signal: null, useExecuteRequest: false
      });
      expect(mockChatUI.appendAssistantMessage).toHaveBeenCalledTimes(1);
      expect(mockRenderPipeline.setContainer).toHaveBeenCalledWith(contentDiv);
    });

    it('AbortError 时显示已停止生成', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockChatService.sendMessage.mockRejectedValue(abortError);

      await session.start({
        sessionId: 's-1', content: 'test', signal: null, useExecuteRequest: false
      });

      expect(contentDiv.innerHTML).toContain('已停止生成');
    });

    it('网络错误时显示错误消息', async () => {
      const netError = new TypeError('Failed to fetch');
      mockChatService.sendMessage.mockRejectedValue(netError);

      await session.start({
        sessionId: 's-1', content: 'test', signal: null, useExecuteRequest: false
      });

      expect(contentDiv.innerHTML).toContain('网络连接失败');
    });

    it('segments 为空且无 currentText 时显示空响应占位', async () => {
      mockChatService.sendMessage.mockResolvedValue(undefined);
      await session.start({
        sessionId: 's-1', content: 'empty', signal: null, useExecuteRequest: false
      });
      expect(contentDiv.innerHTML).toContain('未返回有效响应');
    });
  });

  describe('destroy', () => {
    it('重置所有状态', () => {
      session.setCurrentText('text');
      session.pushSegment({ type: 'tool' });
      session.destroy();
      expect(session.getSegments()).toEqual([]);
      expect(session.getCurrentText()).toBe('');
      expect(session.getContentDiv()).toBeNull();
    });
  });

  describe('mergeTodos', () => {
    it('首次创建时补充缺失字段', () => {
      const result = session._mergeTodos(-1, [{ id: 't1', content: '任务1', status: 'pending' }]);
      expect(result).toEqual([{ id: 't1', content: '任务1', status: 'pending' }]);
    });

    it('更新时保留旧任务', () => {
      session.getSegments().push({
        type: 'tool', name: 'todo_write',
        args: JSON.stringify({ todos: [{ id: 't1', content: '旧任务', status: 'pending' }] }),
        result: null
      });
      const result = session._mergeTodos(0, [
        { id: 't1', content: '新任务', status: 'completed' },
        { id: 't2', content: '新任务2', status: 'pending' }
      ]);
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('新任务');
      expect(result[0].status).toBe('completed');
      expect(result[1].id).toBe('t2');
    });
  });
});
