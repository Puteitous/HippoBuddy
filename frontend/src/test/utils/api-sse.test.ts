import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseSseChunk, streamSse, type SseEvent } from '@/api/sse';

/** 构造一个可解出一串分片的 ReadableStream(字节流) */
function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

/** 拿到推送给 onEvent 的事件数组 */
async function collectEvents(str: string): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: byteStream([str]),
  });
  await streamSse('/api/chat', {}, (e) => events.push(e));
  return events;
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseSseChunk', () => {
  it('解析 event + data 为对象', () => {
    const r = parseSseChunk('event: content\ndata: {"content":"hi"}');
    expect(r).toEqual({ event: 'content', data: { content: 'hi' } });
  });

  it('data 多行时拼接,拼接后为合法 JSON(对象属性跨行)', () => {
    const r = parseSseChunk(
      'event: token_update\ndata: {"live":true,\ndata:  "totalTokens":10}',
    );
    expect(r).toEqual({ event: 'token_update', data: { live: true, totalTokens: 10 } });
  });

  it('complete 事件的 data 固定为 [DONE],不解析 JSON', () => {
    const r = parseSseChunk('event: complete\ndata: [DONE]');
    expect(r).toEqual({ event: 'complete', data: '[DONE]' });
  });

  it('data 为空或 {} 时降级为空对象', () => {
    expect(parseSseChunk('event: thinking')).toEqual({ event: 'thinking', data: {} });
    expect(parseSseChunk('event: reasoning_done\ndata: {}')).toEqual({
      event: 'reasoning_done',
      data: {},
    });
  });

  it('JSON 解析失败时降级为 { raw },不抛错', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = parseSseChunk('event: content\ndata: not-json{');
    expect(r).toEqual({ event: 'content', data: { raw: 'not-json{' } });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('无 event 行时返回 null', () => {
    expect(parseSseChunk('data: {"a":1}')).toBeNull();
  });

  it('忽略注释行(以 : 开头)', () => {
    const r = parseSseChunk(': heartbeat\nevent: done\ndata: {"reason":"stop_hook"}');
    expect(r?.event).toBe('done');
    expect(r?.data).toEqual({ reason: 'stop_hook' });
  });
});

describe('streamSse', () => {
  it('按空行切分多个事件并逐个回调', async () => {
    const events = await collectEvents(
      'event: thinking\ndata: {"turn":1}\n\nevent: content\ndata: {"content":"ok"}\n\n',
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: 'thinking' });
    expect(events[1]).toMatchObject({ event: 'content', data: { content: 'ok' } });
  });

  it('事件跨多个字节分片仍能正确切分', async () => {
    const raw = 'event: thinking\ndata: {"turn":1}\n\nevent: content\ndata: {"content":"ok"}\n\n';
    const events: SseEvent[] = [];
    // 每次只喂 1 个字符,验证跨分片缓冲
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: byteStream([...raw]),
    });
    await streamSse('/api/chat', {}, (e) => events.push(e));
    expect(events).toHaveLength(2);
    expect((events[1].data as { content: string }).content).toBe('ok');
  });

  it('无尾随空行的最后一个事件也能被处理', async () => {
    const events = await collectEvents('event: done\ndata: {"reason":"max_turns"}');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'done', data: { reason: 'max_turns' } });
  });

  it('单个事件(无尾随空行)也能被解析', async () => {
    const events = await collectEvents('event: thinking\ndata: {"turn":1}');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'thinking', data: { turn: 1 } });
  });

  it('请求失败且 body 为 JSON 时,抛提取的 error 消息', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'boom' }),
    });
    await expect(streamSse('/api/chat', {}, () => {})).rejects.toThrow('boom');
  });

  it('请求失败且 body 非 JSON 时,回退到 HTTP 状态码', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    });
    await expect(streamSse('/api/chat', {}, () => {})).rejects.toThrow('HTTP 404');
  });

  it('response.body 为空时抛错', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: null });
    await expect(streamSse('/api/chat', {}, () => {})).rejects.toThrow('Response body is null');
  });

  it('结束后释放 reader 锁', async () => {
    const releaseLock = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          const encoder = new TextEncoder();
          const inner = new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode('event: done\n\n'));
              c.close();
            },
          });
          const reader = inner.getReader();
          const rawRelease = reader.releaseLock.bind(reader);
          reader.releaseLock = () => {
            releaseLock();
            return rawRelease();
          };
          return reader;
        },
      },
    });
    await streamSse('/api/chat', {}, () => {});
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('携带 POST 方法、JSON 头与 body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: byteStream(['']),
    });
    const onEvent = vi.fn();
    await streamSse('/api/chat', { messages: [] }, onEvent);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ messages: [] }),
      }),
    );
  });
});