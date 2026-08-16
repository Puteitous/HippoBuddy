export class EventRouter {
  constructor(handlers) {
    this.handlers = handlers;
  }

  handle(parsed, contentDiv, btnContainer) {
    if (parsed._eventType === 'waiting_user') {
      this.handlers.waiting_user(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'message_id' && parsed.id) {
      this.handlers.message_id(parsed);
      return;
    }

    if (parsed._eventType === 'thinking') {
      this.handlers.thinking();
      return;
    }

    if (parsed._eventType === 'clear_content') {
      this.handlers.clear_content(contentDiv);
      return;
    }

    if (parsed.type === 'retry') {
      this.handlers.retry(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'error' && parsed.message) {
      this.handlers.sse_error(parsed);
      return;
    }

    if (parsed.type === 'raw' || parsed.type === 'error') {
      this.handlers.raw_error(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'reasoning' && parsed.reasoning) {
      this.handlers.reasoning(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'reasoning_done') {
      this.handlers.reasoning_done();
      return;
    }

    if (parsed._eventType === 'web_search_start') {
      this.handlers.web_search_start(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'web_search_done') {
      this.handlers.web_search_done(parsed);
      return;
    }

    if (parsed._eventType === 'content' && parsed.content) {
      this.handlers.content(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'tool_start' && parsed.name) {
      this.handlers.tool_start(parsed, contentDiv);
      return;
    }

    if (parsed._eventType === 'tool_result' && parsed.name) {
      this.handlers.tool_result(parsed);
      return;
    }

    if (parsed._eventType === 'tool_progress' && parsed.id) {
      this.handlers.tool_progress(parsed);
      return;
    }

    if (parsed._eventType === 'tool_confirmation' && parsed.confirmId) {
      this.handlers.tool_confirmation(parsed);
      return;
    }

    if (parsed._eventType === 'token_update' && parsed.hasKnownUsage) {
      this.handlers.token_update(parsed);
      return;
    }

    // 会话结束事件（后端 done SSE，如达到 MAX_TURNS 上限时 reason=max_turns）。
    // 前端此前静默丢弃，导致用户看不到"达到 50 轮上限、任务可能未完成"的提示。
    if (parsed._eventType === 'done' && parsed.reason) {
      this.handlers.done(parsed);
      return;
    }

    if (parsed._eventType === 'waiting_user') {
      this.handlers.waiting_user(parsed, contentDiv);
      return;
    }

    // 兜底：tool_result 的 JSON 损坏导致 name 字段缺失，仍然尝试路由
    if (parsed._eventType === 'tool_result') {
      this.handlers.tool_result(parsed);
      return;
    }
  }
}
