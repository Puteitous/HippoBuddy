/**
 * 聊天状态 (Zustand)
 *
 * 承载会话的消息列表、Agent 执行状态、流式增量缓冲、工具调用记录、
 * 待确认队列、联网搜索动作等。
 *
 * 流式状态按会话分区(sessionStreams):每个会话独立持有 messages / stream /
 * toolCalls / isSending 等,使「切到其他会话后原会话的流仍继续运行、切回可续看」
 * 成为可能,避免跨会话串扰。SSE 事件通过 routeSseEvent(sid, event) 定向写入
 * 对应会话分区;渲染层经 useSessionStream 读取当前会话分区。
 *
 * 阶段三 3.1:接入 18 种 SSE 事件 reducer,作为后续 ChatPanel/ToolRenderers
 * 的状态分发基础。
 */
import { create } from 'zustand';
import type { ContentPart, Message, ToolCallRecord, WebSearchAction } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { chatApi, sessionApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate } from '@/i18n';
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
  parseToolArgs,
  type FlatTodo,
} from '@/components/tool-renderers/shared-utils';
import { emit } from '@/utils/eventBus';
import { getDefaultProcessCollapsed } from '@/utils/process-view-config';

/**
 * 各会话发送中的 AbortController(sessionId → controller)。
 * 置于模块层而非组件,保证 useChatStream 与 AskUserCard 共用同一请求通道,
 * 各组件卸载不会误 abort 掉仍应继续的流(ask 卡片提交即卸载的历史缺陷)。
 * 按会话存 Map,支持多会话并发流,中止只作用于目标会话。
 */
const activeStreamControllers = new Map<string, AbortController>();

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
// 订阅 sessionStreams 变更时写回 localStorage。限制会话数与每会话条数,防超限。
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
  | { kind: 'assistant'; turn: number; text: string; reasoning: string; createdAt?: number }
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

/**
 * 单个会话的完整流式状态(per-session)。
 *
 * 每个会话独立持有,SSE 事件只写目标会话的分区,渲染层只读当前会话分区。
 * 这样切走会话时原会话的流仍能在后台继续累积,切回即可无缝续看实时进度。
 */
export interface SessionStreamState {
  /** 该会话的历史消息列表(已固化;来自加载 + 本地提交) */
  messages: Message[];
  /** 流式渲染序列(content / reasoning / tool 按事件顺序交错) */
  stream: StreamItem[];
  /** 工具调用运行时记录(tool_start/tool_progress/tool_result 聚合) */
  toolCalls: ToolCallRecord[];
  /** 是否正在发送消息(Agent 执行中) */
  isSending: boolean;
  /** 当前流式 assistant 消息的 id(message_id 事件分配) */
  streamingMessageId: string | null;
  /** 当前 Agent 循环轮次(thinking 事件推送) */
  currentTurn: number;
  /** 已分配的最大回合序号,跨用户消息请求单调递增,保证 assistant 固化 id 全局唯一 */
  maxTurn: number;
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done)。仅流式气泡需要传。 */
  isReasoning: boolean;
  /** 联网搜索动作列表(web_search_done 事件累积) */
  webSearchActions: WebSearchAction[];
  /** 联网搜索是否进行中(web_search_start 置 true,web_search_done 置 false) */
  webSearching: boolean;
  /** ask_user 的渲染数据(waiting_user 事件 payload);提交回答后 answered 记录答案 */
  askUserData: AskUserData | null;
  /** 是否等待用户输入(ask_user 工具,waiting_user 事件) */
  waitingForUser: boolean;
  /** 会话级 todo 累计树(按 id 深合并多次 todo_write 增量,跨回合持久) */
  todoList: FlatTodo[];
  /** 最后一次会话结束原因(done 事件携带的 reason) */
  doneReason: string | null;
  /** 后台任务已完成、待用户查看的标志(done 事件在非当前会话上触发时置 true,查看/点击后清除) */
  completedUnread: boolean;
  /** 警告消息列表(warning 事件累积,展示后可清除) */
  warnings: string[];
  /** 错误信息(error 事件或网络错误,无错误时为 null) */
  error: string | null;
  /** 是否正在加载历史消息(GET /api/sessions/:id/messages) */
  isLoadingMessages: boolean;
  /** 各回合处理过程(思考+工具调用)是否收起:roundKey → collapsed(回合级独立收起) */
  collapsedRounds: Record<string, boolean>;
  /** 当前回合处理过程开始时间(thinking 事件;无思考时取首个 tool_start) */
  processStartedAt?: number;
  /** 当前回合处理过程结束时间(最后一个 tool_result / reasoning_done / done) */
  processEndedAt?: number;
}

function emptySessionStream(): SessionStreamState {
  return {
    messages: [],
    stream: [],
    toolCalls: [],
    isSending: false,
    streamingMessageId: null,
    currentTurn: 0,
    maxTurn: 0,
    isReasoning: false,
    webSearchActions: [],
    webSearching: false,
    askUserData: null,
    waitingForUser: false,
    todoList: [],
    doneReason: null,
    completedUnread: false,
    warnings: [],
    error: null,
    isLoadingMessages: false,
    collapsedRounds: {},
    processStartedAt: undefined,
    processEndedAt: undefined,
  };
}

/** 只读空态(useSessionStream 在会话无分区时返回的稳定引用,避免无限重渲染) */
export const EMPTY_SESSION_STREAM: SessionStreamState = emptySessionStream();

interface ChatState {
  /** 按会话分区的流式状态(权威数据源;渲染层只读当前会话分区) */
  sessionStreams: Record<string, SessionStreamState>;
  /** 按 sessionId 缓存的历史消息(localStorage 持久化,刷新后复用) */
  messageCache: Record<string, Message[]>;

  /** 最近一次 Token 用量更新(token_update 事件;全局累积,驱动趋势图) */
  lastTokenUpdate: TokenUpdatePayload | null;
  /** Token 用量历史快照记录(全局累积,驱动趋势图,对齐旧版 appState.tokenHistory) */
  tokenHistory: TokenRecord[];

  // ── Actions:消息管理(作用于当前会话分区) ──────────────────
  /** 设置当前会话消息列表 */
  setMessages: (messages: Message[]) => void;
  /** 设置指定会话消息列表(允许跨会话精确写入;回滚/后台重载时避免切会话后写错分区) */
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  /** 追加消息到当前会话 */
  addMessage: (message: Message) => void;
  /** 更新当前会话指定 id 的消息 */
  updateMessage: (id: string, patch: Partial<Message>) => void;
  /** 删除当前会话指定 id 的消息 */
  removeMessage: (id: string) => void;
  /** 读取指定会话的缓存消息(未缓存返回 undefined) */
  getCachedMessages: (sessionId: string) => Message[] | undefined;
  /** 写入指定会话的缓存消息(内存 + localStorage) */
  putMessageCache: (sessionId: string, messages: Message[]) => void;

  // ── Actions:发送状态(作用于当前会话分区) ──────────────────
  /** 设置当前会话发送状态(开始/结束 Agent 循环) */
  setIsSending: (isSending: boolean) => void;
  /** 设置指定会话发送状态(允许跨会话精确控制,避免确认流等在切会话后误改当前会话) */
  setSessionIsSending: (sessionId: string, isSending: boolean) => void;
  /** 切换当前会话指定回合处理过程(思考+工具)的收起状态(回合级独立收起) */
  toggleRoundCollapsed: (roundKey: string) => void;

  // ── Actions:会话分区管理 ──────────────────────────────────
  /** 删除指定会话的流式分区(切走无活跃流时清理,释放内存) */
  resetSessionStream: (sessionId: string) => void;
  /** 指定会话是否仍处于活跃流(流式缓冲非空/发送中),切回时应直接续看而非重新加载 */
  hasActiveStream: (sessionId: string) => boolean;
  /** 读取指定会话的流式分区(不存在返回 undefined) */
  getSessionStreamState: (sessionId: string) => SessionStreamState | undefined;
  /** 清除指定会话的"后台任务已完成"提醒标记(点击会话项小圆点/切回该会话后调用) */
  dismissSessionCompleted: (sessionId: string) => void;

  // ── Actions:工具调用(作用于当前会话分区) ──────────────────
  /** 添加工具调用记录(tool_start) */
  addToolCall: (record: ToolCallRecord) => void;
  /** 会话级 todo 累计(todo_write 的 tool_start 驱动) */
  mergeTodoList: (mode: string, todos: FlatTodo[]) => void;
  /** 追加工具进度(tool_progress) */
  appendToolProgress: (id: string, line: string) => void;
  /** 完成工具调用(tool_result) */
  completeToolCall: (id: string, success: boolean, result?: string, error?: string) => void;
  /** 挂载工具确认数据到匹配的运行中工具记录 */
  attachToolConfirmation: (payload: ToolConfirmationPayload) => void;
  /** 清除指定 confirmId 对应的工具确认数据(用户已决策后调用) */
  resolveToolConfirmation: (confirmId: string) => void;
  /** 清空当前会话工具调用列表 */
  clearToolCalls: () => void;

  // ── Actions:确认 / 联网搜索(作用于当前会话分区) ───────────
  /** 追加联网搜索动作(web_search_done) */
  addWebSearchAction: (action: WebSearchAction) => void;
  /** 设置联网搜索进行中状态 */
  setWebSearching: (searching: boolean) => void;

  // ── Actions:Token / 状态 / 错误 ───────────────────────────
  /** 更新 Token 用量(token_update;全局) */
  setLastTokenUpdate: (payload: TokenUpdatePayload) => void;
  /** 追加一条 Token 用量历史记录(全局,去重,超出上限截断) */
  addTokenRecord: (record: TokenRecord) => void;
  /** 设置当前会话错误信息 */
  setError: (error: string | null) => void;
  /** 设置当前会话等待用户输入状态 */
  setWaitingForUser: (waiting: boolean) => void;
  /** 设置当前会话 ask_user 渲染数据 */
  setAskUserData: (data: AskUserData | null) => void;
  /** 推入当前会话警告消息 */
  pushWarning: (message: string) => void;
  /** 清空当前会话警告 */
  clearWarnings: () => void;
  /** 设置当前会话历史消息加载状态 */
  setIsLoadingMessages: (loading: boolean) => void;

  // ── Actions:发送 ──────────────────────────────────────────
  /**
   * 统一发送入口(主输入框 / 重试 / AskUserCard 答复共用,作用于当前会话):
   *  - 乐观追加用户消息、重置流式缓冲、清空工具记录、置 isSending;
   *  - 建立 AbortController 并按会话登记在模块层 Map,供 abortUserMessage 定向中断;
   *  - 通过 routeSseEvent(sid, event) 定向分发 SSE 事件到本会话分区。
   */
  sendUserMessage: (
    message: string,
    options?: {
      mode?: ChatRequest['mode'];
      images?: string[];
      selectedRules?: string[];
    },
  ) => Promise<boolean>;
  /** 中断当前会话的发送(abort 对应流的 controller + 通知后端 + 提交半成品) */
  abortUserMessage: () => void;
  /** 固化当前会话 ask_user 答复为消息流只读记录 */
  commitAskUser: (answer: string) => void;
  /**
   * 提交指定会话的流式缓冲为 assistant + tool 消息,并清空缓冲。
   * 在以下场景调用:
   *  - `done` 事件:回合正常结束,提交最终内容
   *  - `thinking` 事件(多回合):提交上一回合内容,避免被 buffer reset 清空
   *  - 用户中断(AbortError):提交半成品内容,保留可见进度
   * 无内容时为空操作;对已存在的同 id 消息跳过(避免重复提交)。
   */
  commitStreamingMessage: (sessionId: string) => void;

  // ── Actions:SSE 事件入口 ─────────────────────────────────
  /** 定向 SSE 事件分发(按会话)。
   * 发送方在请求发起时绑定 sessionId,事件只写入该会话分区,
   * 不污染其他会话的视图/消息列表。
   * (历史缺陷:曾提供 session-agnostic 的 handleSseEvent 按「当前选中会话」路由,
   * 确认流进行中一旦切换到新建会话,事件便串入新会话分区导致串扰,已移除。)
   */
  routeSseEvent: <K extends ChatSseEventName>(sessionId: string, event: SseEvent<K>) => void;
}

export const useChatStore = create<ChatState>((set, get) => {
  // 当前会话 id 快捷读取
  const sidOf = () => useAppStore.getState().currentSessionId;

  /** 就地更新指定会话分区(不存在则按空态初始化) */
  function updateSession(sid: string, fn: (s: SessionStreamState) => void): void {
    set((state) => {
      const cur = state.sessionStreams[sid];
      const next = cur ? { ...cur } : emptySessionStream();
      fn(next);
      return { sessionStreams: { ...state.sessionStreams, [sid]: next } };
    });
  }

  return {
    sessionStreams: {},
    messageCache: loadMessageCache(),
    lastTokenUpdate: null,
    tokenHistory: [],

    // ── 消息管理(当前会话分区) ──────────────────────────────
    setMessages: (messages) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.messages = messages;
      });
    },
    setSessionMessages: (sessionId, messages) => {
      updateSession(sessionId, (s) => {
        s.messages = messages;
      });
    },
    addMessage: (message) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.messages = [...s.messages, message];
      });
    },
    updateMessage: (id, patch) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.messages = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      });
    },
    removeMessage: (id) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.messages = s.messages.filter((m) => m.id !== id);
      });
    },
    getCachedMessages: (sessionId) => get().messageCache[sessionId],
    putMessageCache: (sessionId, messages) => {
      set((state) => ({ messageCache: { ...state.messageCache, [sessionId]: messages } }));
      persistMessageCache(get().messageCache);
    },

    // ── 发送状态(当前会话分区) ──────────────────────────────
    setIsSending: (isSending) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.isSending = isSending;
      });
    },
    setSessionIsSending: (sessionId, isSending) => {
      updateSession(sessionId, (s) => {
        s.isSending = isSending;
      });
    },
    toggleRoundCollapsed: (roundKey) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        // 未记录过则按默认值得出初始态后翻转,保证只翻转目标回合
        const cur = s.collapsedRounds[roundKey] ?? getDefaultProcessCollapsed();
        s.collapsedRounds = { ...s.collapsedRounds, [roundKey]: !cur };
      });
    },

    // ── 会话分区管理 ────────────────────────────────────────
    resetSessionStream: (sessionId) =>
      set((state) => {
        if (!state.sessionStreams[sessionId]) return state;
        const next = { ...state.sessionStreams };
        delete next[sessionId];
        return { sessionStreams: next };
      }),
    hasActiveStream: (sessionId) => {
      const s = get().sessionStreams[sessionId];
      return !!s && (s.isSending || s.stream.length > 0 || s.toolCalls.length > 0);
    },
    getSessionStreamState: (sessionId) => get().sessionStreams[sessionId],
    dismissSessionCompleted: (sessionId) => {
      // 仅当该会话已有内存分区时才清除提醒标记;分区不存在(会话从未在本端触发过
      // done)时直接返回。绝不能像 updateSession 那样为不存在的分区新建空分区——
      // Sidebar 点击会话项时会先调用本方法再切换 currentSessionId,若这里新建了
      // 空分区,useSessionMessages 会命中「已有分区直接复用」而早退,导致历史消息
      // 不加载、点击会话后停留在空对话而非跳转到对应历史面板。
      set((state) => {
        const cur = state.sessionStreams[sessionId];
        if (!cur) return {};
        return {
          sessionStreams: {
            ...state.sessionStreams,
            [sessionId]: { ...cur, completedUnread: false },
          },
        };
      });
    },

    // ── 工具调用(当前会话分区) ──────────────────────────────
    addToolCall: (record) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        const idx = s.toolCalls.findIndex((tc) => tc.id === record.id);
        // 同一工具 id 已存在(流式场景后端对同一调用发两次 tool_start,第二次带完整 args):
        // 更新该记录而非新增,避免 toolCalls 出现重复条目
        if (idx === -1) {
          s.toolCalls = [...s.toolCalls, record];
          return;
        }
        const next = [...s.toolCalls];
        next[idx] = { ...next[idx], ...record };
        s.toolCalls = next;
      });
    },
    mergeTodoList: (mode, todos) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        // replace 清空重建;merge 在会话累计上深合并(跨回合持久)。
        s.todoList =
          mode === 'replace'
            ? deepMergeTodoList([], todos)
            : deepMergeTodoList(s.todoList, todos);
      });
    },
    appendToolProgress: (id, line) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.toolCalls = s.toolCalls.map((tc) =>
          tc.id === id ? { ...tc, progress: [...tc.progress, line] } : tc,
        );
      });
    },
    completeToolCall: (id, success, result, error) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.toolCalls = s.toolCalls.map((tc) =>
          tc.id === id
            ? {
                ...tc,
                // 用户拒绝(确认 deny 后 tool_result.error 含"用户拒绝")→ denied 而非 failed
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
        );
      });
    },
    attachToolConfirmation: (payload) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        const name = (payload as DeleteFileToolConfirmationPayload).toolType === 'delete_file'
          ? 'delete_file'
          : 'bash';
        const idx = s.toolCalls.findIndex((tc) => tc.name === name && !tc.confirmationData);
        if (idx === -1) return;
        const next = [...s.toolCalls];
        next[idx] = { ...next[idx], confirmationData: payload };
        s.toolCalls = next;
      });
    },
    resolveToolConfirmation: (confirmId) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.toolCalls = s.toolCalls.map((tc) =>
          tc.confirmationData && tc.confirmationData.confirmId === confirmId
            ? { ...tc, confirmationData: undefined }
            : tc,
        );
      });
    },
    clearToolCalls: () => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.toolCalls = [];
      });
    },

    // ── 确认 / 联网搜索(当前会话分区) ───────────────────────
    addWebSearchAction: (action) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.webSearchActions = [...s.webSearchActions, action];
      });
    },
    setWebSearching: (searching) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.webSearching = searching;
      });
    },

    // ── Token(全局) ─────────────────────────────────────────
    setLastTokenUpdate: (payload) => set({ lastTokenUpdate: payload }),
    addTokenRecord: (record) =>
      set((state) => {
        const last = state.tokenHistory[state.tokenHistory.length - 1];
        const key = `${record.total}|${record.prompt}|${record.completion}`;
        if (last && `${last.total}|${last.prompt}|${last.completion}` === key) return state;
        return { tokenHistory: [...state.tokenHistory, record].slice(-TOKEN_HISTORY_MAX) };
      }),

    // ── 状态 / 错误(当前会话分区) ───────────────────────────
    setError: (error) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.error = error;
      });
    },
    setWaitingForUser: (waiting) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.waitingForUser = waiting;
      });
    },
    setAskUserData: (data) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.askUserData = data;
      });
    },
    pushWarning: (message) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.warnings = [...s.warnings, message];
      });
    },
    clearWarnings: () => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.warnings = [];
      });
    },
    setIsLoadingMessages: (loading) => {
      const sid = sidOf();
      if (!sid) return;
      updateSession(sid, (s) => {
        s.isLoadingMessages = loading;
      });
    },

    // ── ask_user 固化(当前会话分区) ─────────────────────────
    commitAskUser: (answer) => {
      const sid = sidOf();
      if (!sid) return;
      const sess = get().sessionStreams[sid];
      if (!sess?.askUserData) return;
      const q = sess.askUserData.question ?? '';
      const opts = Array.isArray(sess.askUserData.options)
        ? (sess.askUserData.options as unknown[]).filter((x) => typeof x === 'string')
        : [];
      const msg: Message = {
        id: `ask-${Date.now()}`,
        role: 'tool',
        toolCallId: '',
        toolName: 'ask_user',
        content: answer,
        success: true,
        args: { question: q, options: opts, answered: answer },
      };
      updateSession(sid, (s) => {
        s.messages = [...s.messages, msg];
        s.askUserData = null;
        s.waitingForUser = false;
      });
    },

    // ── 发送 / 中断(当前会话) ───────────────────────────────
    sendUserMessage: async (message, options) => {
      const { currentSessionId: sid, mode } = useAppStore.getState();
      if (!sid) return false;
      const sess = get().sessionStreams[sid];
      if (sess?.isSending) return false;
      // 纯图片消息(无文字)也允许发送:仅当既无文本又无图片时才拦截
      const images = options?.images;
      if (!message.trim() && !(images && images.length > 0)) return false;

      // 乐观更新:本地立即追加用户消息,再进入流式状态(对齐主输入框发送流程)
      // 若当前正处于等待 ask(ask_user 未回复),此次发送即视为对该 ask 的文字回答,
      // 先固化一条 ask 记录(含 answered),使底部实时 ask 卡转为消息流内只读卡并自动收起。
      if (sess?.askUserData) get().commitAskUser(message);
      // 乐观更新:构造与后端返回一致的多模态 content。
      let optimisticContent: string | ContentPart[] = message;
      if (images && images.length > 0) {
        const parts: ContentPart[] = [{ type: 'text', text: message }];
        for (const url of images) parts.push({ type: 'image_url', image_url: { url } });
        optimisticContent = parts;
      }
      updateSession(sid, (s) => {
        s.messages = [...s.messages, { id: `local-${Date.now()}`, role: 'user', content: optimisticContent }];
        s.stream = [];
        s.toolCalls = [];
        // 新一轮开始重置 doneReason:使「后台任务完成提醒」按每一轮触发,而非会话终生只提醒一次
        // (配合 done 事件的哨兵归一,清空后由空→非空即代表本回合刚完成)
        s.doneReason = null;
        // 新一轮开始即代表用户回到该会话操作,清掉"后台已完成"提醒标记
        s.completedUnread = false;
        // 新请求开始,重置处理过程计时(thinking/tool_start 事件会重新写入)
        s.processStartedAt = undefined;
        s.processEndedAt = undefined;
        // 预分配唯一回合序号:保证某些没有任何 thinking 事件(仅 content)的请求,
        // appendStreamingContent 创建 assistant 段时 currentTurn 也已全局唯一。
        s.maxTurn = s.maxTurn + 1;
        s.currentTurn = s.maxTurn + 1;
        // 清空等待中的 ask + 残留状态
        s.isSending = true;
        s.error = null;
        s.askUserData = null;
        s.waitingForUser = false;
      });

      const controller = new AbortController();
      activeStreamControllers.set(sid, controller);
      const request: ChatRequest = {
        sessionId: sid,
        message,
        mode: options?.mode ?? mode,
        images: options?.images,
        selectedRules: options?.selectedRules,
      };
      // 携带当前模式的自定义系统提示词(空则后端使用该模式默认提示词含规则/技能增强)
      if (!useAppStore.getState().systemPromptLoaded) {
        await useAppStore.getState().loadSystemPrompt();
      }
      const sp = useAppStore.getState().systemPrompts[request.mode ?? ''];
      if (sp) request.systemPrompt = sp;

      // 自动生成会话标题(基于本条消息,不覆盖用户手动重命名;静默失败,保留现有标题)。
      // 对齐旧版 ChatPanel._generateSessionTitle:传递 message 原文以解决标题 API 比
      // Chat API 先抵达后端的竞态,不阻塞本次流式请求。
      // 对齐旧版 session:auto-name:首条消息时先把无标题新会话的显示名置为「新会话」,
      // 等 generateTitle 返回真实标题后由 updateSession 覆盖(s.title 优先于临时名)。
      const curSession = useAppStore.getState().sessions.find((x) => x.id === sid);
      if (!curSession?.title) {
        useAppStore.getState().setSessionDisplayName(sid, translate('session.defaultName'));
      }
      void sessionApi
        .generateTitle(sid, message || (images && images.length > 0 ? translate('chat.imageTitle') : ''))
        .then((res) => {
          const title = res?.title;
          if (title) useAppStore.getState().updateSession(sid, { title });
        })
        .catch(() => {
          // 静默失败,保留现有标题
        });

      try {
        // 事件定向分发给本会话分区
        await chatApi.stream(request, (event) => get().routeSseEvent(sid, event), controller.signal);
        return true;
      } catch (e) {
        // 用户主动中断:AbortError → 提交已累积的半成品内容(若有)
        if (e instanceof DOMException && e.name === 'AbortError') {
          get().commitStreamingMessage(sid);
          updateSession(sid, (s) => {
            s.isSending = false;
          });
          return false;
        }
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        updateSession(sid, (s) => {
          s.error = msg;
          s.isSending = false;
        });
        return false;
      } finally {
        if (activeStreamControllers.get(sid) === controller) activeStreamControllers.delete(sid);
      }
    },
    abortUserMessage: () => {
      const sid = sidOf();
      if (!sid) return;
      // 1. 客户端终止对应会话的 fetch
      activeStreamControllers.get(sid)?.abort();
      // 2. 通知后端停止该会话 Agent 循环(防止后端继续消耗 token)
      void chatApi
        .abortTool({ sessionId: sid })
        .catch((e) => {
          console.warn('[chatStore] 后端 abortTool 调用失败:', e);
        });
      // 3. 提交已累积的半成品内容 + 结束发送状态
      get().commitStreamingMessage(sid);
      updateSession(sid, (s) => {
        s.isSending = false;
      });
    },

    // ── SSE 事件定向分发 ────────────────────────────────────
    routeSseEvent: <K extends ChatSseEventName>(sid: string, event: SseEvent<K>) => {
      const name = event.event as ChatSseEventName;
      const data = event.data;

      switch (name) {
        // ── 消息 id 分配 ────────────────────────────────────
        case 'message_id': {
          const payload = data as ChatSseEventMap['message_id'];
          updateSession(sid, (s) => {
            s.streamingMessageId = payload.id;
            // 对齐旧版(ChatPanel 在 message_id 事件把用户消息定位 id 更新为后端真实 uuid):
            // 乐观追加的 user 消息其 `id` 是 local-* 临时值,后端 JSONL 以该 uuid 为准,
            // 回滚/分叉依赖它在存储中定位,不关联真实 uuid 则后端永远匹配不到而失效。
            // 这里不替换 `id`(渲染 key 保持稳定,避免 key 变化重挂重放进场动画),
            // 而是记到该消息的 `serverId`,由 HistoryRenderer 以 `serverId ?? id` 取目标。
            // 仅更新最近一条 local- user 消息(即当前请求对应的乐观消息)。
            for (let i = s.messages.length - 1; i >= 0; i--) {
              const m = s.messages[i];
              if (m.role === 'user' && m.id.startsWith('local-')) {
                const next = s.messages.slice();
                next[i] = { ...next[i], serverId: payload.id };
                s.messages = next;
                break;
              }
            }
          });
          break;
        }

        // ── 思考阶段 ────────────────────────────────────────
        case 'thinking': {
          const payload = data as ChatSseEventMap['thinking'];
          updateSession(sid, (s) => {
            // 后端 payload.turn 在每条用户消息的请求内可能重复(多轮对话跨请求从同值起),
            // 直接拿它作 assistant 固化 id(s-{turn}-{idx})会跨轮撞 id。这里改由前端
            // 单调递增分配:取 max(maxTurn, raw) + 1,保证跨请求唯一。
            const raw = typeof payload.turn === 'number' ? payload.turn : 0;
            const next = Math.max(s.maxTurn, raw) + 1;
            s.currentTurn = next;
            s.maxTurn = next;
            // 同回合多阶段思考:追加新 assistant 段,不再中途固化/重置 stream。
            // 若此处 commit 并清空,HistoryRenderer 会提前渲染已固化部分,与流式 tail
            // 的继续阶段各包一个 ProcessSection(同 key)并存 → 一回合出现两个摘要条。
            // 追加后整个回合全程由流式 tail 渲染单个 section,done 时一次固化完整回合。
            s.stream = [
              ...s.stream,
              { kind: 'assistant', turn: next, text: '', reasoning: '', createdAt: Date.now() },
            ];
            s.isReasoning = true;
            // 处理过程(思考+工具)总耗时:仅回合起始记录起点;同一回合内后续思考
            // (工具调用后重新思考)不重置,使摘要条耗时为回合级累计而非逐段计时。
            if (s.processStartedAt == null) s.processStartedAt = Date.now();
            s.processEndedAt = undefined;
          });
          break;
        }
        case 'reasoning': {
          const payload = data as ChatSseEventMap['reasoning'];
          updateSession(sid, (s) => {
            const chunk = payload.reasoning;
            s.stream = appendToLastAssistant(
              s.stream,
              (a) => (a.reasoning += chunk),
              s.stream.length > 0 && s.stream[s.stream.length - 1].kind !== 'tool'
                ? null
                : {
                    kind: 'assistant',
                    turn: s.currentTurn,
                    text: '',
                    reasoning: chunk,
                    createdAt: Date.now(),
                  },
            );
            s.isReasoning = true;
          });
          break;
        }
        case 'reasoning_done': {
          updateSession(sid, (s) => {
            s.isReasoning = false;
            s.processEndedAt = Math.max(s.processEndedAt ?? 0, Date.now());
          });
          break;
        }

        // ── 回复内容 ────────────────────────────────────────
        case 'content': {
          const payload = data as ChatSseEventMap['content'];
          updateSession(sid, (s) => {
            const chunk = payload.content;
            s.stream = appendToLastAssistant(
              s.stream,
              (a) => (a.text += chunk),
              s.stream.length > 0 && s.stream[s.stream.length - 1].kind !== 'tool'
                ? null
                : {
                    kind: 'assistant',
                    turn: s.currentTurn,
                    text: chunk,
                    reasoning: '',
                    createdAt: Date.now(),
                  },
            );
          });
          break;
        }

        // ── 工具调用 ────────────────────────────────────────
        case 'tool_start': {
          const payload = data as ChatSseEventMap['tool_start'];
          updateSession(sid, (s) => {
            // 无 thinking 事件(思考被禁用等)的回合,以首个工具开始作为过程起点
            if (s.processStartedAt == null) s.processStartedAt = Date.now();
            if (payload.name === 'todo_write') {
              const { mode, todos } = parseTodoArgs(payload.args);
              s.todoList =
                mode === 'replace'
                  ? deepMergeTodoList([], todos)
                  : deepMergeTodoList(s.todoList, todos);
            }
            const idx = s.toolCalls.findIndex((tc) => tc.id === payload.id);
            if (idx === -1) {
              s.toolCalls = [
                ...s.toolCalls,
                {
                  id: payload.id,
                  name: payload.name,
                  args: payload.args,
                  status: 'running',
                  progress: [],
                  startedAt: Date.now(),
                },
              ];
            } else {
              const next = [...s.toolCalls];
              next[idx] = { ...next[idx], ...payload };
              s.toolCalls = next;
            }
            // 在流式序列中追加一个 tool 段(同一 callId 不重复追加)
            if (!s.stream.some((it) => it.kind === 'tool' && it.callId === payload.id)) {
              s.stream = [...s.stream, { kind: 'tool', turn: s.currentTurn, callId: payload.id }];
            }
          });
          break;
        }
        case 'tool_progress': {
          const payload = data as ChatSseEventMap['tool_progress'];
          updateSession(sid, (s) => {
            s.toolCalls = s.toolCalls.map((tc) =>
              tc.id === payload.id ? { ...tc, progress: [...tc.progress, payload.line] } : tc,
            );
          });
          break;
        }
        case 'tool_result': {
          const payload = data as ChatSseEventMap['tool_result'];
          updateSession(sid, (s) => {
            s.toolCalls = s.toolCalls.map((tc) =>
              tc.id === payload.id
                ? {
                    ...tc,
                    status: payload.success
                      ? 'success'
                      : /用户拒绝|denied|rejected/i.test(payload.error ?? '')
                        ? 'denied'
                        : 'failed',
                    result: payload.result,
                    error: payload.error,
                    endedAt: Date.now(),
                  }
                : tc,
            );
            // 处理过程结束时间随最后一个工具结果更新(时间只前进)
            s.processEndedAt = Math.max(s.processEndedAt ?? 0, Date.now());
          });
          // AI 写/编辑/删除文件后,通知预览面板重载命中文件
          emitFilePreviewReload(payload);
          break;
        }
        case 'tool_confirmation': {
          const payload = data as ChatSseEventMap['tool_confirmation'];
          updateSession(sid, (s) => {
            const name = (payload as DeleteFileToolConfirmationPayload).toolType === 'delete_file'
              ? 'delete_file'
              : 'bash';
            const idx = s.toolCalls.findIndex((tc) => tc.name === name && !tc.confirmationData);
            if (idx === -1) return;
            const next = [...s.toolCalls];
            next[idx] = { ...next[idx], confirmationData: payload };
            s.toolCalls = next;
          });
          break;
        }

        // ── 联网搜索 ────────────────────────────────────────
        case 'web_search_start': {
          updateSession(sid, (s) => {
            s.webSearching = true;
          });
          break;
        }
        case 'web_search_done': {
          const payload = data as ChatSseEventMap['web_search_done'];
          updateSession(sid, (s) => {
            s.webSearching = false;
            s.webSearchActions = [
              ...s.webSearchActions,
              {
                type: payload.type,
                queries: payload.queries,
                url: payload.url,
                pattern: payload.pattern,
                status: payload.status,
              },
            ];
          });
          break;
        }

        // ── Token 用量(全局) ────────────────────────────────
        case 'token_update': {
          const payload = data as ChatSseEventMap['token_update'];
          get().setLastTokenUpdate(payload);
          break;
        }

        // ── 等待用户(ask_user) ──────────────────────────────
        case 'waiting_user': {
          const payload = data as unknown as AskUserData;
          // 关键:ask_user 轮结束时后端发 complete(仅置 isSending=false、不固化流式前文),
          // 而非 done(会 commitStreamingMessage)。若不在此显式固化,isSending 置 false 后
          // 流式 tail 被切断、messages 又无前文,导致 ask 前的 assistant 文本/timeline 消失。
          get().commitStreamingMessage(sid);
          updateSession(sid, (s) => {
            s.askUserData = {
              question: payload.question ?? '',
              options: Array.isArray(payload.options) ? payload.options : null,
              allow_custom_input: payload.allow_custom_input !== false,
            };
            s.waitingForUser = true;
          });
          break;
        }

        // ── Agent 循环控制 ──────────────────────────────────
        case 'continue': {
          // 继续下一轮,thinking 事件会重置流式缓冲,这里无需额外处理
          break;
        }
        case 'warning': {
          const payload = data as ChatSseEventMap['warning'];
          updateSession(sid, (s) => {
            s.warnings = [...s.warnings, payload.message];
          });
          break;
        }
        case 'error': {
          const payload = data as ChatSseEventMap['error'];
          updateSession(sid, (s) => {
            s.error = payload.message;
            s.isSending = false;
          });
          break;
        }
        case 'done': {
          const payload = data as ChatSseEventMap['done'];
          // 回合正常结束,提交最终 assistant 消息
          get().commitStreamingMessage(sid);
          // 后台(非当前)会话完成:置"已完成待查看"标记,在会话列表项亮小圆点,
          // 直到用户点击小圆点或切回该会话后才清除。
          if (sid !== useAppStore.getState().currentSessionId) {
            updateSession(sid, (s) => {
              s.completedUnread = true;
            });
          }
          updateSession(sid, (s) => {
            // 正常完成时后端发 done {} (reason 为空)。若不兜底, doneReason 会一直是 null,
            // 后台任务完成提醒钩子按「doneReason 由空→非空」判定会永远不触发。
            // 这里归一到哨兵值,使正常完成也能被识别为一次「刚完成」。
            s.doneReason = payload.reason ?? 'completed';
            s.isSending = false;
            s.isReasoning = false;
            // 回合结束,处理过程计时定格
            s.processEndedAt = Math.max(s.processEndedAt ?? 0, Date.now());
          });
          break;
        }
        case 'complete': {
          // 流结束标记(data 固定为 "[DONE]")
          updateSession(sid, (s) => {
            s.isSending = false;
          });
          break;
        }

        // 兜底:理论上不会触发,因为 K 已被 ChatSseEventName 约束
        default: {
          const _exhaustive: never = name;
          void _exhaustive;
        }
      }
    },
    // ── 流式缓冲提交(指定会话) ──────────────────────────────
    commitStreamingMessage: (sid) => {
      const sess = get().sessionStreams[sid];
      if (!sess) return;
      // 无内容或已提交过(same id 已存在)时,无需提交
      if (
        (!sess.streamingMessageId ||
          sess.messages.some((m) => m.id === sess.streamingMessageId)) &&
        sess.stream.length === 0 &&
        sess.toolCalls.length === 0
      ) {
        return;
      }
      const additions: Message[] = [];
      // 已存在于 messages 的 id(防同一次固化幂等重复:commitStreamingMessage 可能被
      // 多次触发,thinking 事件还会按 turn 重置 stream,导致同 id 段 s-{turn}-{idx} 被重复固化。
      // 仅 assistant 需要按 id 去重;刷新后走后端历史(id 恒常)本就不在此路径,故刷新正常)
      const existingIds = new Set<string>(sess.messages.map((m) => m.id));
      const addedAssistantIds = new Set<string>();
      // 按 stream 原始顺序逐段固化 assistant 与 tool,id 与流式渲染 key 保持一致:
      //  - assistant → `s-{turn}-{streamIdx}`
      //  - tool      → `{callId}`(与流式 timeline/卡片 key 一致)
      // 使 done 后 HistoryRenderer 能以相同 key + 相同容器复用同一 DOM 节点,
      // 彻底避免"流式卸载 → 历史重挂"导致的进入动画重放。
      const addedToolIds = new Set<string>();
      sess.stream.forEach((item, idx) => {
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
            // 用段创建时间作时间戳:HistoryRenderer 据此计算回合处理过程总耗时
            timestamp: item.createdAt ?? Date.now(),
          });
          return;
        }
        const tc = sess.toolCalls.find((t) => t.id === item.callId);
        if (!tc || addedToolIds.has(tc.id)) return;
        addedToolIds.add(tc.id);
        // todo_write 固化时携带会话累计树,使未刷新(前端直接固化)的渲染与 streaming
        // 一致不空白;后端历史加载走 assistant.tool_calls,不使用该字段。
        // 携带 args 使未刷新固化的渲染与刷新后的历史一致:
        // todo_write 固化会话累计树;其余工具透传原始 args,供 timelineFilePath 解析
        // 出 path,「查看变更」按钮在固化后也能显示(对齐旧版 args 全程携带)。
        const withArgs =
          tc.name === 'todo_write'
            ? { args: { mode: 'merge', todos: sess.todoList } }
            : tc.args != null
              ? { args: tc.args }
              : {};
        additions.push({
          id: tc.id,
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: tc.result ?? tc.error ?? '',
          // 仅显式成功(success)才记为成功;denied/failed/running 均为失败/未完成
          success: tc.status === 'success',
          // 用工具真实开始时间作时间戳,保证历史回合耗时计算准确
          timestamp: tc.startedAt || Date.now(),
          ...withArgs,
        });
      });
      if (additions.length === 0 && sess.stream.length === 0) return;

      // 联网搜索动作固化:挂到回合最后一条 assistant 消息(供 HistoryRenderer 复用
      // WebSearchRow 渲染完成态聚合摘要),并清空实时累积,使下一回合的搜索独立显示。
      const webActions = sess.webSearchActions;
      if (additions.length > 0 && webActions.length > 0) {
        const last = additions[additions.length - 1];
        if (last.role === 'assistant') {
          last.web_searched = true;
          last.web_search_actions = webActions;
        }
      }
      updateSession(sid, (s) => {
        s.messages = [...s.messages, ...additions];
        s.stream = [];
        // 固化即最终定稿:置 false,避免中止流后(abort 不再收到 reasoning_done)
        // isReasoning 永远卡 true,导致 ChatPanel tail 仍以 hasThinking=true 包一个
        // 空 body 的 ProcessSection,与已固化回合的 process-{roundKey} 重 key,
        // 出现双摘要条 / React 重复 key 告警。
        s.isReasoning = false;
        // 保留待确认(未决策)的工具记录:确认区需在流结束后仍可见(对齐旧版回合级
        // 行内确认),由 ChatPanel.pendingConfirmRecords 独立渲染;决策后 confirmationData
        // 被清除(completeToolCall),下次固化为普通已执行记录。
        s.toolCalls = s.toolCalls.filter((tc) => !!tc.confirmationData);
        s.webSearchActions = [];
        s.webSearching = false;
      });
    },
  };
});

// ── 消息缓存自动持久化 ─────────────────────────────────────────────
// 订阅 sessionStreams 变化,把每个会话的 messages 写回对应缓存(localStorage)。
// 用数组引用比对过滤重复触发(未变化/空数组不写),避免把待恢复的历史缓存误清空。
const prevMessagesBySession = new Map<string, Message[]>();
useChatStore.subscribe((state) => {
  for (const [sid, sess] of Object.entries(state.sessionStreams)) {
    const msgs = sess.messages;
    if (prevMessagesBySession.get(sid) === msgs) continue;
    prevMessagesBySession.set(sid, msgs);
    if (msgs.length === 0) continue;
    useChatStore.getState().putMessageCache(sid, msgs);
  }
});

// ── AI 工具文件变更 → 预览刷新 ───────────────────────────────────────
/**
 * 从 tool_result 事件提取文件操作,通知预览面板重载(对齐旧版
 * _emitFileEventsFromToolResult 的 preview-reload 部分):
 *   - write_file / edit_file → emit 'file:preview-reload' 携带 args.path
 *   - delete_file           → 对 args.paths 中每个路径各 emit 一次
 * 由 PreviewPanel 订阅,命中当前预览文件时自动重载,AI 写代码时预览实时更新。
 */
function emitFilePreviewReload(payload: ChatSseEventMap['tool_result']): void {
  if (!payload.args) return;
  const args = parseToolArgs<Record<string, unknown>>(payload.args);
  if (payload.name === 'write_file' || payload.name === 'edit_file') {
    if (typeof args.path === 'string') emit('file:preview-reload', args.path);
  } else if (payload.name === 'delete_file' && Array.isArray(args.paths)) {
    for (const p of args.paths) {
      if (typeof p === 'string') emit('file:preview-reload', p);
    }
  }
}