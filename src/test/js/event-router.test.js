import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRouter } from '../../main/resources/static/js/components/EventRouter.js';

describe('EventRouter.js', () => {
  let router;
  let handlers;

  beforeEach(() => {
    handlers = {
      waiting_user: vi.fn(),
      message_id: vi.fn(),
      thinking: vi.fn(),
      clear_content: vi.fn(),
      retry: vi.fn(),
      sse_error: vi.fn(),
      raw_error: vi.fn(),
      reasoning: vi.fn(),
      reasoning_done: vi.fn(),
      content: vi.fn(),
      tool_start: vi.fn(),
      tool_result: vi.fn(),
      tool_progress: vi.fn(),
      tool_confirmation: vi.fn()
    };
    router = new EventRouter(handlers);
  });

  it('分发 waiting_user 事件', () => {
    router.handle({ _eventType: 'waiting_user', question: '确认吗？' }, {}, {});
    expect(handlers.waiting_user).toHaveBeenCalledTimes(1);
  });

  it('分发 message_id 事件', () => {
    router.handle({ _eventType: 'message_id', id: 'msg-1' }, {}, {});
    expect(handlers.message_id).toHaveBeenCalledWith({ _eventType: 'message_id', id: 'msg-1' });
  });

  it('分发 thinking 事件', () => {
    router.handle({ _eventType: 'thinking' }, {}, {});
    expect(handlers.thinking).toHaveBeenCalledTimes(1);
  });

  it('分发 clear_content 事件', () => {
    const div = {};
    router.handle({ _eventType: 'clear_content' }, div, {});
    expect(handlers.clear_content).toHaveBeenCalledWith(div);
  });

  it('分发 retry 事件', () => {
    router.handle({ type: 'retry', message: '重试中' }, {}, {});
    expect(handlers.retry).toHaveBeenCalledWith({ type: 'retry', message: '重试中' }, {});
  });

  it('分发 sse error 事件', () => {
    router.handle({ _eventType: 'error', message: '服务错误' }, {}, {});
    expect(handlers.sse_error).toHaveBeenCalledWith({ _eventType: 'error', message: '服务错误' });
  });

  it('分发 raw error 事件', () => {
    router.handle({ type: 'raw', content: '解析失败' }, {}, {});
    expect(handlers.raw_error).toHaveBeenCalledWith({ type: 'raw', content: '解析失败' }, {});
  });

  it('分发 reasoning 事件', () => {
    router.handle({ _eventType: 'reasoning', reasoning: '思考中' }, {}, {});
    expect(handlers.reasoning).toHaveBeenCalledWith({ _eventType: 'reasoning', reasoning: '思考中' }, {});
  });

  it('分发 reasoning_done 事件', () => {
    router.handle({ _eventType: 'reasoning_done' }, {}, {});
    expect(handlers.reasoning_done).toHaveBeenCalledTimes(1);
  });

  it('分发 content 事件', () => {
    router.handle({ _eventType: 'content', content: 'Hello' }, {}, {});
    expect(handlers.content).toHaveBeenCalledWith({ _eventType: 'content', content: 'Hello' }, {});
  });

  it('分发 tool_start 事件', () => {
    router.handle({ _eventType: 'tool_start', name: 'bash' }, {}, {});
    expect(handlers.tool_start).toHaveBeenCalledWith({ _eventType: 'tool_start', name: 'bash' }, {});
  });

  it('分发 tool_result 事件', () => {
    router.handle({ _eventType: 'tool_result', name: 'bash', success: true }, {}, {});
    expect(handlers.tool_result).toHaveBeenCalledWith({ _eventType: 'tool_result', name: 'bash', success: true });
  });

  it('分发 tool_progress 事件', () => {
    router.handle({ _eventType: 'tool_progress', id: 'tc-1', line: 'progress...' }, {}, {});
    expect(handlers.tool_progress).toHaveBeenCalledWith({ _eventType: 'tool_progress', id: 'tc-1', line: 'progress...' });
  });

  it('分发 tool_confirmation 事件', () => {
    router.handle({ _eventType: 'tool_confirmation', confirmId: 'cf-1', command: 'rm -rf' }, {}, {});
    expect(handlers.tool_confirmation).toHaveBeenCalledWith({ _eventType: 'tool_confirmation', confirmId: 'cf-1', command: 'rm -rf' });
  });

  it('未知事件类型静默忽略', () => {
    router.handle({ _eventType: 'unknown_event', data: 'xxx' }, {}, {});
    for (const [, handler] of Object.entries(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });
});
