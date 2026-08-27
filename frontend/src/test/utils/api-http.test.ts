import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getJson, postJson, postEmpty, putJson, deleteJson } from '@/api/http';
import { ApiError } from '@/api/error';

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

function errResponse(status: number, body: unknown): Response {
  const isJson = typeof body === 'object';
  return {
    ok: false,
    status,
    json: isJson ? () => Promise.resolve(body) : () => Promise.reject(new Error('not json')),
  } as unknown as Response;
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('http', () => {
  it('getJson 用 GET 请求并返回解析后的 JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ ok: 1 }));
    await expect(getJson<{ ok: number }>('/api/x')).resolves.toEqual({ ok: 1 });
    expect(global.fetch).toHaveBeenCalledWith('/api/x', { method: 'GET' });
  });

  it('getJson 失败时抛 ApiError,message 取 error 字段', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse(403, { error: 'forbidden' }));
    const err = await getJson('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'forbidden', status: 403 });
  });

  it('错误体缺少 error 时回退 message 字段', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse(500, { message: 'boom' }));
    await expect(getJson('/api/x')).rejects.toMatchObject({ message: 'boom', status: 500 });
  });

  it('错误体非 JSON 时回退 HTTP 状态码', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse(404, 'plain text'));
    await expect(getJson('/api/x')).rejects.toMatchObject({ message: 'HTTP 404', status: 404 });
  });

  it('postJson 带 JSON body 与 Content-Type', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ ok: 1 }));
    await postJson('/api/x', { a: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      }),
    );
  });

  it('postJson body 未提供时不带 body 字段', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ ok: 1 }));
    await postJson('/api/x');
    const args = vi.mocked(global.fetch).mock.calls[0][1];
    expect((args as RequestInit).body).toBeUndefined();
  });

  it('postEmpty 成功时不解析 body', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ ok: 1 }));
    await expect(postEmpty('/api/x', { a: 1 })).resolves.toBeUndefined();
  });

  it('postEmpty 失败时抛 ApiError', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse(400, { error: 'bad' }));
    await expect(postEmpty('/api/x')).rejects.toMatchObject({ message: 'bad', status: 400 });
  });

  it('putJson 使用 PUT 方法并解析 body', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ saved: true }));
    await expect(putJson('/api/x', { p: 1 })).resolves.toEqual({ saved: true });
    expect(vi.mocked(global.fetch).mock.calls[0][1]).toMatchObject({ method: 'PUT' });
  });

  it('deleteJson 使用 DELETE 方法并解析 body', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ removed: true }));
    await expect(deleteJson('/api/x', { p: 1 })).resolves.toEqual({ removed: true });
    expect(vi.mocked(global.fetch).mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('deleteJson 失败时抛 ApiError', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse(500, { error: 'del-fail' }));
    await expect(deleteJson('/api/x')).rejects.toMatchObject({ message: 'del-fail', status: 500 });
  });
});