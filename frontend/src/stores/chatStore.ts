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
  /** 流式回复内容缓冲(content 事件累积) */
  streamingContent: string;
  /** 流式思考内容缓冲(reasoning 事件累积) */
  streamingReasoning: string;
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done) */
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
  /** 累积流式内容(content 事件) */
  appendStreamingContent: (chunk: string) => void;
  /** 累积流式思考(reasoning 事件) */
  appendStreamingReasoning: (chunk: string) => void;
  /** 重置流式缓冲(新回合或新会话时调用) */
  resetStreaming: () => void;
  /**
   * 提交当前流式内容为 assistant 消息。
   *
   * 在以下场景调用:
   *  - `done` 事件:回合正常结束,提交最终内容
   *  - `thinking` 事件(多回合):提交上一回合内容,避免被 buffer reset 清空
   *  - 用户中断(AbortError):提交半成品内容,保留可见进度
   *
   * 已存在同 id 消息时跳过(避免重复提交)。
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
  streamingContent: '',
  streamingReasoning: '',
  isReasoning: false,

  toolCalls: [],
  pendingConfirmations: [],
  webSearchActions: [],

  lastTokenUpdate: null,
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
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  appendStreamingReasoning: (chunk) =>
    set((state) => ({ streamingReasoning: state.streamingReasoning + chunk })),
  resetStreaming: () =>
    set({
      streamingMessageId: null,
      currentTurn: 0,
      streamingContent: '',
      streamingReasoning: '',
      isReasoning: false,
    }),
  commitStreamingMessage: () => {
    const state = get();
    // 没有内容或没分配 id 时,无需提交
    if (!state.streamingContent || !state.streamingMessageId) return;
    // 避免重复提交(同 id 已存在则跳过)
    if (state.messages.some((m) => m.id === state.streamingMessageId)) return;
    state.addMessage({
      id: state.streamingMessageId,
      role: 'assistant',
      content: state.streamingContent,
      reasoning_content: state.streamingReasoning || undefined,
    });
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
        // 多回合安全:在重置缓冲前,把上一回合的内容提交为 assistant 消息
        // 单回合场景由 done 事件负责提交,这里 isSending 检查可避免首次误提交
        store.commitStreamingMessage();
        set({
          currentTurn: payload.turn,
          streamingContent: '',
          streamingReasoning: '',
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
  reset: () => set({ ...initialState }),
}));
