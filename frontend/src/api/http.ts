/**
 * 类型安全的 fetch 封装
 *
 * - 所有方法返回 Promise<T>,失败抛出 ApiError
 * - JSON 请求自动设置 Content-Type
 * - 错误响应统一解析为 { error: string } 提取消息
 */
import { ApiError } from './error';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** 解析后端错误响应,优先取 error 字段,失败回退到 statusText */
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    const msg = body?.error ?? body?.message ?? fallback;
    return typeof msg === 'string' ? msg : fallback;
  } catch {
    return fallback;
  }
}

/** GET 请求 */
export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `HTTP ${response.status}`);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

/** POST 请求(带 JSON body) */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `HTTP ${response.status}`);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

/** POST 请求(无响应体解析,用于只需 success 状态的接口) */
export async function postEmpty(url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `HTTP ${response.status}`);
    throw new ApiError(message, response.status);
  }
}

/** PUT 请求(带 JSON body) */
export async function putJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `HTTP ${response.status}`);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

/** DELETE 请求 */
export async function deleteJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `HTTP ${response.status}`);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}
