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
import { useAppStore } from '@/stores/appStore';
import { chatApi } from '@/api/client';
import { ApiError } from '@/api/error';
import type { ChatRequest } from '@/types';
import type {
  ChatSseEventName,
  ChatSseEventMap,
  DeleteFileToolConfirmationPayload,
  ToolConfirmationPayload,
  TokenUpdatePayload,
} from '@/types/sse';
import type { SseEvent } from '@/api/sse';
import {
  deepMergeTodoList,
  parseTodoArgs,
  type FlatTodo,
} from '@/components/tool-renderers/shared-utils';

/**
 * 当前发送中的 AbortController。
 * 置于模块层而非组件,保证 useChatStream 与 AskUserCard 共用同一请求通道,
 * 各组件卸载不会误 abort 掉仍应继续的流(ask 卡片提交即卸载的历史缺陷)。
 */
let activeStreamController: AbortController | null = null;

/**
 * ask_user 交互数据源。
 * 数据完全来自后端 waiting_user 事件 payload,而非 tool_start —— 后端对 ask_user
 * 特意不发送 tool_start(见 WebAgentOrchestrator 两处排除),故前端渲染必须依赖本事件。
 */
export interface AskUserData {
  question: string;
  options: string[] | null;
  allow_custom_input: boolean;
  /** 用户提交的回答;非空表示已回应,卡片转为只读历史(对齐旧版 ask segment 保留) */
  answered?: string | null;
}

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

// ── 历史消息缓存(localStorage 持久化)─────────────────────────────
// 用于"刷新后恢复上次会话并免请求显示历史"。内存 messageCache 为权威,
// 订阅 messages 变更时写回 localStorage。限制会话数与每会话条数,防超限。
const MSG_CACHE_KEY = 'hippo-message-cache';
const MAX_CACHE_SESSIONS = 10;
const MAX_CACHE_MESSAGES_PER_SESSION = 300;

function loadMessageCache(): Record<string, Message[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MSG_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Message[]>) : {};
  } catch {
    return {};
  }
}

function persistMessageCache(cache: Record<string, Message[]>): void {
  try {
    const ids = Object.keys(cache);
    const trimmed: Record<string, Message[]> = {};
    for (const id of ids.slice(-MAX_CACHE_SESSIONS)) {
      trimmed[id] = cache[id].slice(-MAX_CACHE_MESSAGES_PER_SESSION);
    }
    const raw = JSON.stringify(trimmed);
    if (raw.length >= 4_000_000) {
      // 仍超限则进一步缩水为最近 4 个会话、每会话最近 120 条
      const slim: Record<string, Message[]> = {};
      for (const id of ids.slice(-4)) slim[id] = cache[id].slice(-120);
      localStorage.setItem(MSG_CACHE_KEY, JSON.stringify(slim));
    } else {
      localStorage.setItem(MSG_CACHE_KEY, raw);
    }
  } catch {
    /* 存储不可用/超限时静默忽略,缓存降级为仅内存 */
  }
}

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
  /** 按 sessionId 缓存的历史消息(localStorage 持久化,刷新后复用) */
  messageCache: Record<string, Message[]>;
  /** 是否正在发送消息(Agent 执行中) */
  isSending: boolean;

  // ── 流式增量缓冲(当前回合) ─────────────────────────────────
  /** 当前流式 assistant 消息的 id(message_id 事件分配) */
  streamingMessageId: string | null;
  /** 当前 Agent 循环轮次(thinking 事件推送) */
  currentTurn: number;
  /** 已分配的最大回合序号,跨用户消息请求单调递增,保证 assistant 固化 id 全局唯一 */
  maxTurn: number;
  /** 流式渲染序列(content / reasoning / tool 按事件顺序交错) */
  stream: StreamItem[];
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done)。仅流式气泡需要传。 */
  isReasoning: boolean;

  // ── 工具调用 / 确认 / 联网搜索 ──────────────────────────────
  /** 当前会话的工具调用运行时记录(tool_start/tool_progress/tool_result 聚合) */
  toolCalls: ToolCallRecord[];
  /**
   * 会话级 todo 累计树(按 id 深合并多次 todo_write 增量)。
   * 对齐旧版 _todoTreeCacheHolder:跨回合持久保留,使后续 merge 增量能基于历史完整树,
   * 而非仅当前回合片段。reset(切换会话)时随 initialState 重置。
   */
  todoList: FlatTodo[];
  /** 联网搜索动作列表(web_search_done 事件累积) */
  webSearchActions: WebSearchAction[];
  /** 联网搜索是否进行中(web_search_start 置 true,web_search_done 置 false,驱动实时流瞬态行) */
  webSearching: boolean;

  // ── Token / 状态 / 错误 ────────────────────────────────────
  /** 最近一次 Token 用量更新(token_update 事件) */
  lastTokenUpdate: TokenUpdatePayload | null;
  /** Token 用量历史快照记录(全局累积,驱动趋势图,对齐旧版 appState.tokenHistory) */
  tokenHistory: TokenRecord[];
  /** 最后一次会话结束原因(done 事件携带的 reason) */
  doneReason: string | null;
  /** 是否等待用户输入(ask_user 工具,waiting_user 事件) */
  waitingForUser: boolean;
  /** ask_user 的渲染数据(waiting_user 事件 payload);提交回答后 answered 记录答案,保留为历史 */
  askUserData: AskUserData | null;
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
  /** 读取指定会话的缓存消息(未缓存返回 undefined) */
  getCachedMessages: (sessionId: string) => Message[] | undefined;
  /** 写入指定会话的缓存消息(内存 + localStorage) */
  putMessageCache: (sessionId: string, messages: Message[]) => void;

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
  /**
   * 固化一次 ask_user 答复为消息流中的只读 tool 记录(对齐旧版 pushSegment 保留历史):
   *  - 追加一条 role:'tool' / toolName:'ask_user' 消息,args 携带 question/options/answered,
   *    供 HistoryRenderer 在回合内以 record 渲染只读 AskUserCard。
   *  - 清空 askUserData / waitingForUser,消除"只写不清空导致的跨回合末尾残留"。
   * 提交回答(AskUserCard 点击选项)后立即调用,随后再发送用户消息。
   */
  commitAskUser: (answer: string) => void;
  /**
   * 统一发送入口(主输入框 / 重试 / AskUserCard 答复共用):
   *  - 乐观追加用户消息、重置流式缓冲、清空工具记录、置 isSending;
   *  - 建立 AbortController 并持有在模块层,供 abortUserMessage 统一中断;
   *  - 通过 handleSseEvent 分发 SSE 事件。
   * 由 useChatStream 与 AskUserCard 共同调用,避免各组件持独立请求通道
   * 在卸载时误终止仍应继续的流(ask 卡片提交即卸载的历史缺陷)。
   */
  sendUserMessage: (
    message: string,
    options?: {
      mode?: ChatRequest['mode'];
      images?: string[];
      selectedRules?: string[];
    },
  ) => Promise<boolean>;
  /** 中断当前发送(abort 流 + 通知后端 + 提交半成品),供 useChatStream.abort 调用 */
  abortUserMessage: () => void;

  // ── Actions:工具调用 ──────────────────────────────────────
  /** 添加工具调用记录(tool_start) */
  addToolCall: (record: ToolCallRecord) => void;
  /**
   * 会话级 todo 累计(todo_write 的 tool_start 驱动):
   * replace 清空重建,merge 在会话累计上按 id 深合并(对齐旧版 _mergeTodos)。
   */
  mergeTodoList: (mode: string, todos: FlatTodo[]) => void;
  /** 追加工具进度(tool_progress) */
  appendToolProgress: (id: string, line: string) => void;
  /** 完成工具调用(tool_result) */
  completeToolCall: (id: string, success: boolean, result?: string, error?: string) => void;
  /**
   * 挂载工具确认数据到匹配的运行中工具记录。
   * 按工具名匹配(bash / delete_file),对齐旧版按名称绑定未完成段。
   */
  attachToolConfirmation: (payload: ToolConfirmationPayload) => void;
  /** 清除指定 confirmId 对应的工具确认数据(用户已决策后调用) */
  resolveToolConfirmation: (confirmId: string) => void;
  /** 清空工具调用列表(切换会话时) */
  clearToolCalls: () => void;

  // ── Actions:确认 / 联网搜索 ───────────────────────────────
  /** 追加联网搜索动作(web_search_done) */
  addWebSearchAction: (action: WebSearchAction) => void;
  /** 设置联网搜索进行中状态(web_search_start=true / web_search_done=false) */
  setWebSearching: (searching: boolean) => void;

  // ── Actions:Token / 状态 / 错误 ───────────────────────────
  /** 更新 Token 用量(token_update) */
  setLastTokenUpdate: (payload: TokenUpdatePayload) => void;
  /** 追加一条 Token 用量历史记录(去重,超出上限截断) */
  addTokenRecord: (record: TokenRecord) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 设置等待用户输入状态(用户提交回答后置 false,关闭 AskUserCard) */
  setWaitingForUser: (waiting: boolean) => void;
  /** 设置 ask_user 渲染数据(waiting_user 事件驱动) */
  setAskUserData: (data: AskUserData | null) => void;
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
  messageCache: loadMessageCache(),
  isSending: false,

  streamingMessageId: null,
  currentTurn: 0,
  maxTurn: 0,
  stream: [],
  isReasoning: false,

  toolCalls: [],
  todoList: [],
  webSearchActions: [],
  webSearching: false,

  lastTokenUpdate: null,
  tokenHistory: [],
  doneReason: null,
  waitingForUser: false,
  askUserData: null,
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
  getCachedMessages: (sessionId) => get().messageCache[sessionId],
  putMessageCache: (sessionId, messages) => {
    set((state) => ({ messageCache: { ...state.messageCache, [sessionId]: messages } }));
    persistMessageCache(get().messageCache);
  },

  // ── 发送状态 ──────────────────────────────────────────────
  setIsSending: (isSending) => set({ isSending }),

  // ── 流式缓冲 ──────────────────────────────────────────────
  appendStreamingReasoning: (chunk) =>
    set((state) => ({
      stream: appendToLastAssistant(
        state.stream,
        (a) => (a.reasoning += chunk),
        // 末段是 tool 时另起 assistant 段，与 appendStreamingContent 保持对称，
        // 防御"tool 之后又输出 reasoning"的后置思考模型（正常供应商不触发）。
        state.stream.length > 0 && state.stream[state.stream.length - 1].kind !== 'tool'
          ? null
          : { kind: 'assistant', turn: state.currentTurn, text: '', reasoning: chunk },
      ),
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
    set((state) => {
      // 同一工具 id 的 tool_start 可能重复到达(流式首段 + executeToolCalls 第二次带完整 args):
      // stream 中已存在的 callId 不重复追加,否则 tool 段重复会令 timeline 把同一工具渲染成两行
      if (state.stream.some((it) => it.kind === 'tool' && it.callId === callId)) return state;
      return { stream: [...state.stream, { kind: 'tool', turn: state.currentTurn, callId }] };
    }),
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
    const additions: Message[] = [];
    // 已存在于 messages 的 id(防同一次固化幂等重复:commitStreamingMessage 可能被
    // 多次触发,thinking 事件还会按 turn 重置 stream,导致同 id 段 s-{turn}-{idx} 被重复固化。
    // 仅 assistant 需要按 id 去重;刷新后走后端历史(id 恒常)本就不在此路径,故刷新正常)
    const existingIds = new Set<string>(state.messages.map((m) => m.id));
    const addedAssistantIds = new Set<string>();
    // 按 stream 原始顺序逐段固化 assistant 与 tool,id 与流式渲染 key 保持一致:
    //  - assistant → `s-{turn}-{streamIdx}`
    //  - tool      → `{callId}`(与流式 timeline/卡片 key 一致)
    // 使 done 后 HistoryRenderer 能以相同 key + 相同容器复用同一 DOM 节点,
    // 彻底避免"流式卸载 → 历史重挂"导致的进入动画重放。
    const addedToolIds = new Set<string>();
    state.stream.forEach((item, idx) => {
      if (item.kind === 'assistant') {
        const text = item.text || '';
        const reasoning = item.reasoning || '';
        if (!text && !reasoning) return;
        const id = `s-${item.turn}-${idx}`;
        // 幂等:同 id 已存在(本次新增或历史 messages)则跳过,避免空气重复
        if (existingIds.has(id) || addedAssistantIds.has(id)) return;
        addedAssistantIds.add(id);
        additions.push({
          id,
          role: 'assistant',
          content: text,
          reasoning_content: reasoning || undefined,
        });
        return;
      }
      const tc = state.toolCalls.find((t) => t.id === item.callId);
      if (!tc || addedToolIds.has(tc.id)) return;
      addedToolIds.add(tc.id);
      // todo_write 固化时携带会话累计树,使未刷新(前端直接固化)的渲染与 streaming
      // 一致不空白;后端历史加载走 assistant.tool_calls,不使用该字段。
      const withArgs =
        tc.name === 'todo_write'
          ? { args: { mode: 'merge', todos: state.todoList } }
          : {};
      additions.push({
        id: tc.id,
        role: 'tool',
        toolCallId: tc.id,
        toolName: tc.name,
        content: tc.result ?? tc.error ?? '',
        // 仅显式成功(success)才记为成功;denied/failed/running 均为失败/未完成
        success: tc.status === 'success',
        ...withArgs,
      });
    });
    if (additions.length === 0 && state.stream.length === 0) return;

    // 联网搜索动作固化:挂到回合最后一条 assistant 消息(供 HistoryRenderer 复用 WebSearchRow
    // 渲染完成态聚合摘要),并清空实时累积,使下一回合的搜索独立显示。
    // 时序:thinking(回合切换)/ done(流结束)都会调用本方法,此时 actions 属于刚结束的回合。
    const webActions = state.webSearchActions;
    if (additions.length > 0 && webActions.length > 0) {
      const last = additions[additions.length - 1];
      if (last.role === 'assistant') {
        last.web_searched = true;
        last.web_search_actions = webActions;
      }
    }
    set((s) => ({
      messages: [...s.messages, ...additions],
      stream: [],
      // 保留待确认(未决策)的工具记录:确认区需在流结束后仍可见(对齐旧版回合级
      // 行内确认),由 ChatPanel.pendingConfirmRecords 独立渲染;决策后 confirmationData
      // 被清除(completeToolCall),下次固化为普通已执行记录。
      toolCalls: s.toolCalls.filter((tc) => !!tc.confirmationData),
      webSearchActions: [],
      webSearching: false,
    }));
  },

  // ── 工具调用 ──────────────────────────────────────────────
  addToolCall: (record) =>
    set((state) => {
      const idx = state.toolCalls.findIndex((tc) => tc.id === record.id);
      // 同一工具 id 已存在(流式场景后端对同一调用发两次 tool_start,第二次带完整 args):
      // 更新该记录而非新增,避免 toolCalls 出现重复条目(对齐旧版 MessageSession 的合并语义)
      if (idx === -1) return { toolCalls: [...state.toolCalls, record] };
      const next = [...state.toolCalls];
      next[idx] = { ...next[idx], ...record };
      return { toolCalls: next };
    }),
  mergeTodoList: (mode, todos) =>
    set((state) => ({
      // replace 清空重建;merge 在会话累计上深合并(跨回合持久)。
      todoList:
        mode === 'replace'
          ? deepMergeTodoList([], todos)
          : deepMergeTodoList(state.todoList, todos),
    })),
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
              // 用户拒绝(确认 deny 后 tool_result.error 含"用户拒绝")→ denied 而非 failed,
              // 供渲染层展示"已拒绝执行/删除"而不是红色失败态(对齐旧版)
              status: success
                ? 'success'
                : /用户拒绝|denied|rejected/i.test(error ?? '')
                  ? 'denied'
                  : 'failed',
              result,
              error,
              endedAt: Date.now(),
            }
          : tc,
      ),
    })),
  attachToolConfirmation: (payload) =>
    set((state) => {
      // 判断目标工具名:delete_file 带 toolType,其余(bash)视为 bash
      const name = (payload as DeleteFileToolConfirmationPayload).toolType === 'delete_file'
        ? 'delete_file'
        : 'bash';
      // 找到该名称下"未挂确认数据"的工具记录挂载确认数据(对齐旧版
      // MessageSession 的 `!seg.result && !seg.confirmationData` 匹配,不依赖 running 状态字段)
      const idx = state.toolCalls.findIndex(
        (tc) => tc.name === name && !tc.confirmationData,
      );
      if (idx === -1) return state;
      const next = [...state.toolCalls];
      next[idx] = { ...next[idx], confirmationData: payload };
      return { toolCalls: next };
    }),
  resolveToolConfirmation: (confirmId) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.confirmationData && tc.confirmationData.confirmId === confirmId
          ? { ...tc, confirmationData: undefined }
          : tc,
      ),
    })),
  clearToolCalls: () => set({ toolCalls: [] }),

  // ── 确认 / 联网搜索 ───────────────────────────────────────
  addWebSearchAction: (action) =>
    set((state) => ({ webSearchActions: [...state.webSearchActions, action] })),
  setWebSearching: (searching) => set({ webSearching: searching }),

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
  setAskUserData: (data) => set({ askUserData: data }),
  commitAskUser: (answer) => {
    const { askUserData } = get();
    if (!askUserData) return;
    const q = askUserData.question ?? '';
    const opts = Array.isArray(askUserData.options)
      ? (askUserData.options as unknown[]).filter((x) => typeof x === 'string')
      : [];
    const msg: Message = {
      id: `ask-${Date.now()}`,
      role: 'tool',
      toolCallId: '',
      toolName: 'ask_user',
      content: answer,
      success: true,
      // args 携带完整渲染数据(question/options/answered),供只读 AskUserCard 重建
      args: { question: q, options: opts, answered: answer },
    };
    set((s) => ({
      messages: [...s.messages, msg],
      askUserData: null,
      waitingForUser: false,
    }));
  },
  sendUserMessage: async (message, options) => {
    if (get().isSending) return false;
    const { currentSessionId, mode } = useAppStore.getState();
    if (!currentSessionId) {
      get().setError('未选中会话,无法发送消息。');
      return false;
    }
    if (!message.trim()) {
      get().setError('消息内容不能为空。');
      return false;
    }

    // 乐观更新:本地立即追加用户消息,再进入流式状态(对齐主输入框发送流程)
    // 若当前正处于等待 ask(ask_user 未回复),此次发送即视为对该 ask 的文字回答,
    // 先固化一条 ask 记录(含 answered),使底部实时 ask 卡转为消息流内只读卡并自动收起
    // (对齐点选项的 commitAskUser;点选项路径此时 askUserData 已为空,不会重复固化)。
    if (get().askUserData) get().commitAskUser(message);
    get().addMessage({ id: `local-${Date.now()}`, role: 'user', content: message });
    get().resetStreaming();
    get().clearToolCalls();
    // 预分配唯一回合序号:保证某些没有任何 thinking 事件(仅 content)的请求,
    // appendStreamingContent 创建 assistant 段时 currentTurn 也已全局唯一,避免跨请求撞 id s-0-0。
    // 若有 thinking 事件,会基于已递增的 maxTurn 再 +1,依然唯一。
    set((s) => ({ maxTurn: s.maxTurn + 1, currentTurn: s.maxTurn + 1 }));
    // 清空等待中的 ask:用户在输入框直接以文字回复(而非点 as卡选项)时,
    // commitAskUser 不会被调用,若不在此清除,askUserData/waitingForUser 残留,
    // HistoryRenderer 的实时 ask 卡会一直钉在底部(刷新后才消失)。
    // 对主动发出的任意消息清除等待态均无副作用(无 ask 时本就有 null/false)。
    set({ isSending: true, error: null, askUserData: null, waitingForUser: false });

    const controller = new AbortController();
    activeStreamController = controller;
    const request: ChatRequest = {
      sessionId: currentSessionId,
      message,
      mode: options?.mode ?? mode,
      images: options?.images,
      selectedRules: options?.selectedRules,
    };

    try {
      // 事件统一交回 handleSseEvent 分发
      await chatApi.stream(request, (event) => get().handleSseEvent(event), controller.signal);
      return true;
    } catch (e) {
      // 用户主动中断:AbortError → 提交已累积的半成品内容(若有)
      if (e instanceof DOMException && e.name === 'AbortError') {
        get().commitStreamingMessage();
        set({ isSending: false });
        return false;
      }
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      set({ error: msg, isSending: false });
      return false;
    } finally {
      if (activeStreamController === controller) activeStreamController = null;
    }
  },
  abortUserMessage: () => {
    // 1. 客户端终止 fetch
    activeStreamController?.abort();
    // 2. 通知后端停止 Agent 循环(防止后端继续消耗 token)
    const { currentSessionId } = useAppStore.getState();
    if (currentSessionId) {
      void chatApi
        .abortTool({ sessionId: currentSessionId })
        .catch((e) => {
          console.warn('[chatStore] 后端 abortTool 调用失败:', e);
        });
    }
    // 3. 提交已累积的半成品内容 + 结束发送状态
    get().commitStreamingMessage();
    set({ isSending: false });
  },
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
        set((state) => {
          // 后端 payload.turn 在每条用户消息的请求内可能重复(多轮对话跨请求从同值起),
          // 直接拿它作 assistant 固化 id(s-{turn}-{idx})会跨轮撞 id,导致第二轮 assistant
          // 在固化去重时被误跳过而消失。这里改由前端单调递增分配:取 max(maxTurn, raw) + 1,
          // 保证跨请求唯一。tail 与固化共用同一 turn,id 一致且不会重复。
          const raw = typeof payload.turn === 'number' ? payload.turn : 0;
          const next = Math.max(state.maxTurn, raw) + 1;
          return {
            currentTurn: next,
            maxTurn: next,
            // 新一轮开始,重置流式序列为初始 assistant 段(思考内容后续由 reasoning 追加)
            stream: [{ kind: 'assistant', turn: next, text: '', reasoning: '' }],
            isReasoning: true,
          };
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
        if (payload.name === 'todo_write') {
          // todo_write 立即合并到会话级累计(残缺 args 解析失败 → merge + [] ,无副作用)。
          const { mode, todos } = parseTodoArgs(payload.args);
          store.mergeTodoList(mode, todos);
        }
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
        // 内嵌确认:挂载到对应运行中工具记录(timeline 行内渲染允许/拒绝),对齐旧版
        store.attachToolConfirmation(payload);
        break;
      }

      // ── 联网搜索 ────────────────────────────────────────
      case 'web_search_start': {
        // 置进行中标记,驱动 ChatPanel 实时流瞬态行「正在联网搜索…」
        set({ webSearching: true });
        break;
      }
      case 'web_search_done': {
        const payload = data as ChatSseEventMap['web_search_done'];
        // 搜索完成,清除进行中标记并累积动作明细(渲染层据此聚合摘要)
        set({ webSearching: false });
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
        const payload = data as unknown as AskUserData;
        // 关键:ask_user 轮结束时后端发 complete(仅置 isSending=false、不固化流式前文),
        // 而非 done(会 commitStreamingMessage)。若不在此显式固化,isSending 置 false 后
        // 流式 tail 被切断、messages 又无前文,导致 ask 前的 assistant 文本/timeline 消失。
        // 对齐旧版:ask 是 assistant 消息内容的一部分,前文本应在消息流中持续存在。
        store.commitStreamingMessage();
        // 从事件 payload 取渲染数据(question/options/allow_custom_input),不依赖 tool_start
        store.setAskUserData({
          question: payload.question ?? '',
          options: Array.isArray(payload.options) ? payload.options : null,
          allow_custom_input: payload.allow_custom_input !== false,
        });
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
  // 对齐旧版 appState:tokenHistory 为全局累积,切会话时不重置(趋势图保留历史);
  // messageCache 同样保留,避免重置覆盖为初始快照而丢失已写入的缓存。
  reset: () =>
    set((s) => ({
      ...initialState,
      tokenHistory: s.tokenHistory,
      messageCache: s.messageCache,
    })),
}));

// ── 消息缓存自动持久化 ─────────────────────────────────────────────
// 订阅消息变更,非空 messages 写回当前会话缓存(localStorage)。过滤重复
// 触发(reset 产生的空数组不写),避免把待恢复的历史缓存误清空。
let prevMessages: Message[] | null = null;
useChatStore.subscribe((state) => {
  if (state.messages === prevMessages) return;
  prevMessages = state.messages;
  if (state.messages.length === 0) return;
  const id = useAppStore.getState().currentSessionId;
  if (!id) return;
  useChatStore.getState().putMessageCache(id, state.messages);
});
