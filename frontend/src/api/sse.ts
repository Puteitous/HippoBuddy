/**
 * SSE (Server-Sent Events) 流式读取器
 *
 * 后端通过 SseWriter 发送的事件格式:
 *   event: <eventName>\n
 *   data: <payload>\n
 *   \n
 *
 * 前端用 fetch + ReadableStream 读取,逐行解析。
 * 不使用 EventSource 的原因:
 *  1. EventSource 只支持 GET,后端 /api/chat 是 POST
 *  2. EventSource 无法携带自定义请求体
 *  3. 需要支持 AbortController 主动中断
 */
import type { ChatSseEventMap, ChatSseEventName } from '@/types/sse';

/** 单个 SSE 事件 */
export interface SseEvent<K extends ChatSseEventName = ChatSseEventName> {
  event: K;
  data: ChatSseEventMap[K];
}

/**
 * 流式读取 SSE,按事件回调。
 *
 * @param url 请求地址
 * @param body 请求体
 * @param onEvent 事件回调(同步,逐个事件触发)
 * @param signal 可选,AbortController.signal 用于中断
 */
export async function streamSse<K extends ChatSseEventName>(
  url: string,
  body: unknown,
  onEvent: (event: SseEvent<K>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // 后端 /api/chat 在 SSE 启动前的同步错误(如 405)直接走 JSON 错误响应
    let message = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      message = errBody?.error ?? message;
    } catch {
      // 非 JSON 错误体,保留默认 message
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // SSE 协议:事件之间以 \n\n 分隔,每行 event:/data:
  // 后端 SseWriter.sendSseEvent 拼接的格式固定为 "event: X\ndata: Y\n\n"
  // 但 data 可能跨行(后端目前不会,但按 SSE 规范处理)
  try {
    // for(;;) 而非 while(true),规避 ESLint no-constant-condition
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按空行(\n\n)切分事件块
      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const event = parseSseChunk<K>(chunk);
        if (event) {
          onEvent(event);
        }
      }
    }

    // 处理 buffer 中可能残留的最后一个事件(无尾随 \n\n)
    const trimmed = buffer.trim();
    if (trimmed.length > 0) {
      const event = parseSseChunk<K>(trimmed);
      if (event) {
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 解析单个 SSE 事件块(由 \n\n 切分出的字符串)。
 *
 * 块内格式:
 *   event: <name>
 *   data: <payload>
 *
 * data 可能多行,需拼接。
 */
export function parseSseChunk<K extends ChatSseEventName>(chunk: string): SseEvent<K> | null {
  const lines = chunk.split('\n');
  let eventName: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
    // 忽略注释行(以 : 开头,如心跳 ": heartbeat")
  }

  if (!eventName) return null;

  const dataStr = dataLines.join('\n');
  let data: ChatSseEventMap[K];

  try {
    // complete 事件 data 为字符串 "[DONE]",特殊处理
    if (eventName === 'complete') {
      // 后端固定发送 [DONE],不解析为对象
      data = '[DONE]' as ChatSseEventMap[K];
    } else if (dataStr === '' || dataStr === '{}') {
      data = {} as ChatSseEventMap[K];
    } else {
      data = JSON.parse(dataStr) as ChatSseEventMap[K];
    }
  } catch {
    // JSON 解析失败时不阻断流,降级为字符串
    console.warn(`[sse] 解析 ${eventName} 的 data 失败:`, dataStr);
    data = { raw: dataStr } as unknown as ChatSseEventMap[K];
  }

  return { event: eventName as K, data };
}
