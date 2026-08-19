/**
 * 聊天状态 (Zustand)
 *
 * 承载当前会话的消息列表、Agent 执行状态、流式增量缓冲、工具调用记录、
 * 待确认队列、联网搜索动作等。
 *
 * 阶段三 3.1:接入 18 种 SSE 事件 reducer,作为后续 ChatPanel/ToolRenderers
 * 的状态分发基础。
 */
import { create } from 'zustand';
import type { Message, ToolCallRecord, WebSearchAction } from '@/types';
import type {
  ChatSseEventName,
  ChatSseEventMap,
  ToolConfirmationPayload,
  TokenUpdatePayload,
} from '@/types/sse';
import type { SseEvent } from '@/api/sse';

/**
 * 一次 Token 用量快照记录(用于趋势图,对齐旧版 appState.tokenHistory)。
 * 每回合结束时有实际用量变化时追加一条;cacheRate 在估算模式(无已知 usage)为
 * undefined,渲染缓存趋势图时过滤。
 */
export interface TokenRecord {
  total: number;
  prompt: number;
  completion: number;
  percent: number;
  cacheRate: number | undefined;
}

/** tokenHistory 最大保留条数(趋势图只显示最近 30 条) */
const TOKEN_HISTORY_MAX = 200;

/**
 * 单轮流式渲染单元(对齐旧版 segment 时序模型)。
 *
 * 流式中把 content/reasoning/tool 按事件到达顺序交错存放于 `stream`,
 * 渲染层(如 ChatPanel)遍历该序列,文本/思考渲染为 assistant 气泡、
 * 连续普通工具合并 timeline,从而让"思考、文本、工具"按时间交错展示,
 * 不再像旧实现那样把工具固定堆在气泡尾部。
 */
export type StreamItem =
  | { kind: 'assistant'; turn: number; text: string; reasoning: string }
  | { kind: 'tool'; turn: number; callId: string };

/**
 * 把 chunk 追加到 `stream` 中最后一个 assistant 段:
 *  - 若末段是 assistant → 原地深拷贝后 mutate,保持顺序不变
 *  - 否则(末段为 tool 或序列为空)→ 追加 `fallback` 段(由调用方给定)
 */
function appendToLastAssistant(
  stream: StreamItem[],
  mutate: (a: Extract<StreamItem, { kind: 'assistant' }>) => void,
  fallback?: StreamItem | null,
): StreamItem[] {
  const last = stream[stream.length - 1];
  if (last && last.kind === 'assistant') {
    const next: Extract<StreamItem, { kind: 'assistant' }> = { ...last };
    mutate(next);
    return [...stream.slice(0, stream.length - 1), next];
  }
  if (fallback) return [...stream, fallback];
  return stream;
}

interface ChatState {
  // ── 消息与发送状态 ──────────────────────────────────────────
  /** 当前会话的历史消息列表(从 GET /api/sessions/:id/messages 加载 + 本地新增) */
  messages: Message[];
  /** 是否正在发送消息(Agent 执行中) */
  isSending: boolean;

  // ── 流式增量缓冲(当前回合) ─────────────────────────────────
  /** 当前流式 assistant 消息的 id(message_id 事件分配) */
  streamingMessageId: string | null;
  /** 当前 Agent 循环轮次(thinking 事件推送) */
  currentTurn: number;
  /** 流式渲染序列(content / reasoning / tool 按事件顺序交错) */
  stream: StreamItem[];
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done)。仅流式气泡需要传。 */
  isReasoning: boolean;

  // ── 工具调用 / 确认 / 联网搜索 ──────────────────────────────
  /** 当前会话的工具调用运行时记录(tool_start/tool_progress/tool_result 聚合) */
  toolCalls: ToolCallRecord[];
  /** 待用户确认的工具调用队列(tool_confirmation 事件入队,确认后出队) */
  pendingConfirmations: ToolConfirmationPayload[];
  /** 联网搜索动作列表(web_search_done 事件累积) */
  webSearchActions: WebSearchAction[];

  // ── Token / 状态 / 错误 ────────────────────────────────────
  /** 最近一次 Token 用量更新(token_update 事件) */
  lastTokenUpdate: TokenUpdatePayload | null;
  /** Token 用量历史快照记录(全局累积,驱动趋势图,对齐旧版 appState.tokenHistory) */
  tokenHistory: TokenRecord[];
  /** 最后一次会话结束原因(done 事件携带的 reason) */
  doneReason: string | null;
  /** 是否等待用户输入(ask_user 工具,waiting_user 事件) */
  waitingForUser: boolean;
  /** 警告消息列表(warning 事件累积,展示后可清除) */
  warnings: string[];
  /** 错误信息(error 事件或网络错误,无错误时为 null) */
  error: string | null;
  /** 是否正在加载历史消息(GET /api/sessions/:id/messages) */
  isLoadingMessages: boolean;

  // ── Actions:消息管理 ──────────────────────────────────────
  /** 设置消息列表(切换会话或加载历史时) */
  setMessages: (messages: Message[]) => void;
  /** 追加消息 */
  addMessage: (message: Message) => void;
  /** 更新指定 id 的消息 */
  updateMessage: (id: string, patch: Partial<Message>) => void;
  /** 删除指定 id 的消息 */
  removeMessage: (id: string) => void;

  // ── Actions:发送状态 ──────────────────────────────────────
  /** 设置发送状态(开始/结束 Agent 循环) */
  setIsSending: (isSending: boolean) => void;

  // ── Actions:流式缓冲 ──────────────────────────────────────
  /** 追加流式思考到当前流式序列的最后一个 assistant 段 */
  appendStreamingReasoning: (chunk: string) => void;
  /** 追加流式正文到当前流式序列:若末段是 tool,另起新 assistant 段 */
  appendStreamingContent: (chunk: string) => void;
  /** 追加一个工具单元到流式序列(tool_start) */
  pushStreamTool: (callId: string) => void;
  /** 重置流式缓冲(新回合或新会话时调用) */
  resetStreaming: () => void;
  /**
   * 提交当前流式缓冲为 assistant + tool 消息,并清空缓冲。
   *
   * 在以下场景调用:
   *  - `done` 事件:回合正常结束,提交最终内容
   *  - `thinking` 事件(多回合):提交上一回合内容,避免被 buffer reset 清空
   *  - 用户中断(AbortError):提交半成品内容,保留可见进度
   *
   * 无内容时为空操作;对已存在的同 id 消息跳过(避免重复提交)。
   */
  commitStreamingMessage: () => void;

  // ── Actions:工具调用 ──────────────────────────────────────
  /** 添加工具调用记录(tool_start) */
  addToolCall: (record: ToolCallRecord) => void;
  /** 追加工具进度(tool_progress) */
  appendToolProgress: (id: string, line: string) => void;
  /** 完成工具调用(tool_result) */
  completeToolCall: (id: string, success: boolean, result?: string, error?: string) => void;
  /** 清空工具调用列表(切换会话时) */
  clearToolCalls: () => void;

  // ── Actions:确认 / 联网搜索 ───────────────────────────────
  /** 入队确认请求(tool_confirmation) */
  enqueueConfirmation: (payload: ToolConfirmationPayload) => void;
  /** 出队确认请求(用户决策后) */
  dequeueConfirmation: (confirmId: string) => void;
  /** 追加联网搜索动作(web_search_done) */
  addWebSearchAction: (action: WebSearchAction) => void;

  // ── Actions:Token / 状态 / 错误 ───────────────────────────
  /** 更新 Token 用量(token_update) */
  setLastTokenUpdate: (payload: TokenUpdatePayload) => void;
  /** 追加一条 Token 用量历史记录(去重,超出上限截断) */
  addTokenRecord: (record: TokenRecord) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 设置等待用户输入状态(用户提交回答后置 false,关闭 AskUserCard) */
  setWaitingForUser: (waiting: boolean) => void;
  /** 推入警告消息 */
  pushWarning: (message: string) => void;
  /** 清空警告 */
  clearWarnings: () => void;
  /** 设置历史消息加载状态 */
  setIsLoadingMessages: (loading: boolean) => void;

  // ── Actions:SSE 事件统一入口 ─────────────────────────────
  /**
   * 统一 SSE 事件分发入口。
   *
   * 内部按 event.event 名称分发到上述 actions,组件层只需:
   *   streamSse(req, (e) => chatStore.handleSseEvent(e))
   */
  handleSseEvent: <K extends ChatSseEventName>(event: SseEvent<K>) => void;

  // ── Actions:全局重置 ─────────────────────────────────────
  /** 重置整个 store(切换会话时调用) */
  reset: () => void;
}

const initialState = {
  messages: [],
  isSending: false,

  streamingMessageId: null,
  currentTurn: 0,
  stream: [],
  isReasoning: false,

  toolCalls: [],
  pendingConfirmations: [],
  webSearchActions: [],

  lastTokenUpdate: null,
  tokenHistory: [],
  doneReason: null,
  waitingForUser: false,
  warnings: [],
  error: null,
  isLoadingMessages: false,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // ── 消息管理 ──────────────────────────────────────────────
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  removeMessage: (id) =>
    set((state) => ({ messages: state.messages.filter((m) => m.id !== id) })),

  // ── 发送状态 ──────────────────────────────────────────────
  setIsSending: (isSending) => set({ isSending }),

  // ── 流式缓冲 ──────────────────────────────────────────────
  appendStreamingReasoning: (chunk) =>
    set((state) => ({
      stream: appendToLastAssistant(state.stream, (a) => (a.reasoning += chunk)),
      isReasoning: true,
    })),
  appendStreamingContent: (chunk) =>
    set((state) => ({
      stream: appendToLastAssistant(
        state.stream,
        (a) => (a.text += chunk),
        // 末段不是 assistant(例如刚插入了 tool)时,另起一个新的 assistant 段,保证顺序正确
        state.stream.length > 0 && state.stream[state.stream.length - 1].kind !== 'tool'
          ? null
          : { kind: 'assistant', turn: state.currentTurn, text: chunk, reasoning: '' },
      ),
    })),
  pushStreamTool: (callId) =>
    set((state) => ({ stream: [...state.stream, { kind: 'tool', turn: state.currentTurn, callId }] })),
  resetStreaming: () =>
    set({
      streamingMessageId: null,
      currentTurn: 0,
      stream: [],
      isReasoning: false,
    }),
  commitStreamingMessage: () => {
    const state = get();
    // 无内容或已提交过(same id 已存在)时,无需提交
    if (
      (!state.streamingMessageId ||
        state.messages.some((m) => m.id === state.streamingMessageId)) &&
      state.stream.length === 0 &&
      state.toolCalls.length === 0
    ) {
      return;
    }
    const assistantIts = state.stream.filter((i) => i.kind === 'assistant');
    const text = assistantIts.map((i) => i.text).filter(Boolean).join('\n\n');
    const reasoning = assistantIts.map((i) => i.reasoning).filter(Boolean).join('\n\n');

    const additions: Message[] = [];
    // 消息 id:服务端分配优先,已占用则回退本地生成
    const sid =
      state.streamingMessageId && !state.messages.some((m) => m.id === state.streamingMessageId)
        ? state.streamingMessageId
        : `round-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    if (text) {
      additions.push({
        id: sid,
        role: 'assistant',
        content: text,
        reasoning_content: reasoning || undefined,
      });
    }
    // 把工具调用一并固化为 tool 消息,避免回合结束后工具卡片消失
    for (const tc of state.toolCalls) {
      if (state.messages.some((m) => m.id === tc.id)) continue;
      additions.push({
        id: tc.id,
        role: 'tool',
        toolCallId: tc.id,
        toolName: tc.name,
        content: tc.result ?? tc.error ?? '',
        success: tc.status !== 'failed',
      });
    }
    if (additions.length === 0 && state.stream.length === 0) return;
    set((s) => ({ messages: [...s.messages, ...additions], stream: [], toolCalls: [] }));
  },

  // ── 工具调用 ──────────────────────────────────────────────
  addToolCall: (record) =>
    set((state) => ({ toolCalls: [...state.toolCalls, record] })),
  appendToolProgress: (id, line) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.id === id ? { ...tc, progress: [...tc.progress, line] } : tc,
      ),
    })),
  completeToolCall: (id, success, result, error) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.id === id
          ? {
              ...tc,
              status: success ? 'success' : 'failed',
              result,
              error,
              endedAt: Date.now(),
            }
          : tc,
      ),
    })),
  clearToolCalls: () => set({ toolCalls: [] }),

  // ── 确认 / 联网搜索 ───────────────────────────────────────
  enqueueConfirmation: (payload) =>
    set((state) => ({ pendingConfirmations: [...state.pendingConfirmations, payload] })),
  dequeueConfirmation: (confirmId) =>
    set((state) => ({
      pendingConfirmations: state.pendingConfirmations.filter(
        (c) => c.confirmId !== confirmId,
      ),
    })),
  addWebSearchAction: (action) =>
    set((state) => ({ webSearchActions: [...state.webSearchActions, action] })),

  // ── Token / 状态 / 错误 ───────────────────────────
  setLastTokenUpdate: (payload) => set({ lastTokenUpdate: payload }),
  addTokenRecord: (record) =>
    set((state) => {
      const last = state.tokenHistory[state.tokenHistory.length - 1];
      const key = `${record.total}|${record.prompt}|${record.completion}`;
      if (last && `${last.total}|${last.prompt}|${last.completion}` === key) return state;
      return { tokenHistory: [...state.tokenHistory, record].slice(-TOKEN_HISTORY_MAX) };
    }),
  setError: (error) => set({ error }),
  setWaitingForUser: (waiting) => set({ waitingForUser: waiting }),
  pushWarning: (message) =>
    set((state) => ({ warnings: [...state.warnings, message] })),
  clearWarnings: () => set({ warnings: [] }),
  setIsLoadingMessages: (loading) => set({ isLoadingMessages: loading }),

  // ── SSE 事件统一分发入口 ──────────────────────────────────
  handleSseEvent: <K extends ChatSseEventName>(event: SseEvent<K>) => {
    // name 在调用点是某个具体的 K(子集于 ChatSseEventName),
    // 但 switch 需要按完整联合类型做 exhaustive 检查,故先窄化为 ChatSseEventName。
    const name = event.event as ChatSseEventName;
    const data = event.data;
    const store = get();

    switch (name) {
      // ── 消息 id 分配 ────────────────────────────────────
      case 'message_id': {
        const payload = data as ChatSseEventMap['message_id'];
        set({ streamingMessageId: payload.id });
        break;
      }

      // ── 思考阶段 ────────────────────────────────────────
      case 'thinking': {
        const payload = data as ChatSseEventMap['thinking'];
        // 多回合安全:在开启新一轮前,把上一回合内容(含工具)提交并清空缓冲。
        // 单回合场景由 done 事件负责提交,这里无内容时 commit 为空操作。
        store.commitStreamingMessage();
        set({
          currentTurn: payload.turn,
          // 新一轮开始,重置流式序列为初始 assistant 段(思考内容后续由 reasoning 追加)
          stream: [{ kind: 'assistant', turn: payload.turn, text: '', reasoning: '' }],
          isReasoning: true,
        });
        break;
      }
      case 'reasoning': {
        const payload = data as ChatSseEventMap['reasoning'];
        store.appendStreamingReasoning(payload.reasoning);
        break;
      }
      case 'reasoning_done': {
        set({ isReasoning: false });
        break;
      }

      // ── 回复内容 ────────────────────────────────────────
      case 'content': {
        const payload = data as ChatSseEventMap['content'];
        store.appendStreamingContent(payload.content);
        break;
      }

      // ── 工具调用 ────────────────────────────────────────
      case 'tool_start': {
        const payload = data as ChatSseEventMap['tool_start'];
        store.addToolCall({
          id: payload.id,
          name: payload.name,
          args: payload.args,
          status: 'running',
          progress: [],
          startedAt: Date.now(),
        });
        // 在流式序列中追加一个 tool 段,保持工具/文本/思考交错
        store.pushStreamTool(payload.id);
        break;
      }
      case 'tool_progress': {
        const payload = data as ChatSseEventMap['tool_progress'];
        store.appendToolProgress(payload.id, payload.line);
        break;
      }
      case 'tool_result': {
        const payload = data as ChatSseEventMap['tool_result'];
        store.completeToolCall(
          payload.id,
          payload.success,
          payload.result,
          payload.error,
        );
        break;
      }
      case 'tool_confirmation': {
        const payload = data as ChatSseEventMap['tool_confirmation'];
        store.enqueueConfirmation(payload);
        break;
      }

      // ── 联网搜索 ────────────────────────────────────────
      case 'web_search_start': {
        // 仅作开始标记,具体动作在 web_search_done 中携带
        // 阶段 3.3/3.4 接入 WebToolCard 时再细化 UI 反馈
        break;
      }
      case 'web_search_done': {
        const payload = data as ChatSseEventMap['web_search_done'];
        store.addWebSearchAction({
          type: payload.type,
          queries: payload.queries,
          url: payload.url,
          pattern: payload.pattern,
          status: payload.status,
        });
        break;
      }

      // ── Token 用量 ──────────────────────────────────────
      case 'token_update': {
        const payload = data as ChatSseEventMap['token_update'];
        store.setLastTokenUpdate(payload);
        break;
      }

      // ── 等待用户(ask_user) ──────────────────────────────
      case 'waiting_user': {
        set({ waitingForUser: true });
        break;
      }

      // ── Agent 循环控制 ──────────────────────────────────
      case 'continue': {
        // 继续下一轮,thinking 事件会重置流式缓冲,这里无需额外处理
        break;
      }
      case 'warning': {
        const payload = data as ChatSseEventMap['warning'];
        store.pushWarning(payload.message);
        break;
      }
      case 'error': {
        const payload = data as ChatSseEventMap['error'];
        store.setError(payload.message);
        set({ isSending: false });
        break;
      }
      case 'done': {
        const payload = data as ChatSseEventMap['done'];
        // 回合正常结束,提交最终 assistant 消息
        store.commitStreamingMessage();
        set({
          doneReason: payload.reason ?? null,
          isSending: false,
          isReasoning: false,
        });
        break;
      }
      case 'complete': {
        // 流结束标记(data 固定为 "[DONE]")
        set({ isSending: false });
        break;
      }

      // 兜底:理论上不会触发,因为 K 已被 ChatSseEventName 约束
      default: {
        const _exhaustive: never = name;
        void _exhaustive;
      }
    }
  },

  // ── 全局重置 ──────────────────────────────────────────────
  // 对齐旧版 appState:tokenHistory 为全局累积,切会话时不重置(趋势图保留历史)
  reset: () => set((s) => ({ ...initialState, tokenHistory: s.tokenHistory })),
}));
