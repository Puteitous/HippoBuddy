/**
 * Chat SSE 事件类型定义
 *
 * 事件来源:后端 com.example.agent.web.orchestrator.WebAgentOrchestrator
 * 与 ChatApiHandler 通过 sseWriter.sendSseEvent(eventName, payload) 发送。
 * 每个事件对应一种 payload 结构,前端按 event 名称分发到对应的 reducer。
 */

// ============================================================================
// SSE 事件名称(后端 sendSseEvent 第一参数)
// ============================================================================

export type ChatSseEventName =
  | 'message_id'
  | 'thinking'
  | 'reasoning'
  | 'reasoning_done'
  | 'content'
  | 'tool_start'
  | 'tool_progress'
  | 'tool_result'
  | 'tool_confirmation'
  | 'web_search_start'
  | 'web_search_done'
  | 'token_update'
  | 'waiting_user'
  | 'continue'
  | 'warning'
  | 'error'
  | 'done'
  | 'complete';

// ============================================================================
// 各事件 payload 结构
// ============================================================================

/** 新消息 id 分配(用户/编辑后) */
export interface MessageIdPayload {
  id: string;
}

/** 开始新一轮 Agent 循环 */
export interface ThinkingPayload {
  turn: number;
}

/** 流式思考内容增量 */
export interface ReasoningPayload {
  reasoning: string;
}

/** 思考阶段结束(空对象) */
export type ReasoningDonePayload = Record<string, never>;

/** 流式回复内容增量 */
export interface ContentPayload {
  content: string;
}

/** 工具调用开始 */
export interface ToolStartPayload {
  id: string;
  name: string;
  /** 参数(JSON 对象或字符串,后端 safeArgs 兜底为 textNode) */
  args: unknown;
}

/** 工具执行进度(bash 逐行输出) */
export interface ToolProgressPayload {
  id: string;
  line: string;
}

/** 工具执行结果 */
export interface ToolResultPayload {
  id: string;
  name: string;
  success: boolean;
  /** 成功时的输出内容 */
  result?: string;
  /** 失败时的错误信息 */
  error?: string;
  /** 参数(同 ToolStartPayload.args) */
  args?: unknown;
}

/** bash 工具确认请求 */
export interface BashToolConfirmationPayload {
  confirmId: string;
  command: string;
  riskLevel: string;
  riskReason: string;
}

/** delete_file 工具确认请求 */
export interface DeleteFileToolConfirmationPayload {
  confirmId: string;
  toolType: 'delete_file';
  totalCount: number;
  files: string[];
  directories: string[];
  truncated: boolean;
}

export type ToolConfirmationPayload = BashToolConfirmationPayload | DeleteFileToolConfirmationPayload;

/** 联网搜索开始(空对象) */
export type WebSearchStartPayload = Record<string, never>;

/** 联网搜索完成,携带动作明细 */
export interface WebSearchDonePayload {
  type: string;
  queries?: string[];
  url?: string;
  pattern?: string;
  status?: string;
}

/** Token 用量实时更新 */
export interface TokenUpdatePayload {
  live: true;
  hasKnownUsage: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheHitRate: number;
}

/** 等待用户输入(ask_user 工具的回复) */
export interface WaitingUserPayload {
  /** raw result 字符串 */
  [key: string]: unknown;
}

/** Agent 继续下一轮 */
export interface ContinuePayload {
  reason: string;
  nextTurn: number;
}

/** 警告消息 */
export interface WarningPayload {
  message: string;
}

/** 错误事件 */
export interface ErrorPayload {
  /** 错误码(可空,后端 LlmErrorClassifier 常量) */
  code?: string;
  message: string;
  /** 详细信息(可空) */
  detail?: string;
}

/** Agent 结束 */
export interface DonePayload {
  /** 结束原因: stop_hook / length / max_turns / 空 */
  reason?: string;
}

/** 流结束标记(固定字符串 "[DONE]") */
export type CompletePayload = '[DONE]';

// ============================================================================
// 事件 → payload 映射(用于类型安全的分发)
// ============================================================================

export interface ChatSseEventMap {
  message_id: MessageIdPayload;
  thinking: ThinkingPayload;
  reasoning: ReasoningPayload;
  reasoning_done: ReasoningDonePayload;
  content: ContentPayload;
  tool_start: ToolStartPayload;
  tool_progress: ToolProgressPayload;
  tool_result: ToolResultPayload;
  tool_confirmation: ToolConfirmationPayload;
  web_search_start: WebSearchStartPayload;
  web_search_done: WebSearchDonePayload;
  token_update: TokenUpdatePayload;
  waiting_user: WaitingUserPayload;
  continue: ContinuePayload;
  warning: WarningPayload;
  error: ErrorPayload;
  done: DonePayload;
  complete: CompletePayload;
}
