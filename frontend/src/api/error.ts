/**
 * API 错误类型
 *
 * 后端错误响应统一为 { "error": "..." } 结构
 * (SessionApiHandler / ConfigApiHandler / WorkspaceApiHandler 等)
 */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP 状态码 */
    public readonly status: number,
    /** 后端响应体(已解析,通常含 error 字段) */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
