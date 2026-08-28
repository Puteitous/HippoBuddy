/**
 * 应用全局状态 (Zustand)
 *
 * 当前阶段承载「会话列表」「当前会话」「模式」「工作区」「主视图切换」相关状态。
 * 阶段 3.1:加入 view(chat/settings)用于 AppShell 主区域切换。
 * 阶段 3.5:新增 view='workspace'(FileTree + FileTabs + FilePreview/FileDiffView)。
 * 阶段 3.7-1:新增 activityBarHidden / skillMarketOpen,替代旧版全局变量调用。
 * 2026-08-19:布局对齐旧版后移除 view='workspace';文件树移入全局 Sidebar(胶囊切换),
 * 预览面板(PreviewPanel)与聊天并排,相关状态迁至 previewStore。
 */
import { create } from 'zustand';
import type { Session, SessionMode } from '@/types';
import { configApi } from '@/api/client';


/** 主视图类型 */
export type AppView = 'chat' | 'settings';

/** 面板布局偏好(对齐旧版 hippo-layout):preview-left=预览靠左/聊天靠右,chat-left=聊天靠左/预览靠右 */
export type PanelLayout = 'preview-left' | 'chat-left';

/** 面板布局持久化 key(与旧版 GeneralSettingsPage 同 key,新旧版共享) */
const PANEL_LAYOUT_KEY = 'hippo-layout';

/** ActivityBar 浮动面板 id */
export type ActivityPanelId = 'token' | 'metrics';

/** 从 localStorage 读取面板布局(非法/缺失时回退默认 preview-left,对齐旧版默认) */
function readPanelLayout(): PanelLayout {
  try {
    const v = localStorage.getItem(PANEL_LAYOUT_KEY);
    if (v === 'preview-left' || v === 'chat-left') return v;
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return 'preview-left';
}

/** 面板布局写入 localStorage */
function persistPanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(PANEL_LAYOUT_KEY, layout);
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** ActivityBar 可见性持久化 key */
const ACTIVITY_BAR_HIDDEN_KEY = 'hippo-activity-bar-hidden';

function readActivityBarHidden(): boolean {
  try {
    return localStorage.getItem(ACTIVITY_BAR_HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistActivityBarHidden(hidden: boolean): void {
  try {
    localStorage.setItem(ACTIVITY_BAR_HIDDEN_KEY, hidden ? 'true' : 'false');
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 全局模式持久化 key(与旧版 app-state.js 同 key,新旧版共享;默认 coding 与后端默认一致) */
const MODE_KEY = 'hippo-agent-mode';

/** 从 localStorage 读取全局模式(非法/缺失时回退默认 coding) */
function readGlobalMode(): SessionMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'chat' || v === 'coding' || v === 'office') return v;
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return 'coding';
}

/** 全局模式写入 localStorage(用户显式切换模式时持久化,作为新会话/无记录会话的兜底) */
function persistGlobalMode(mode: SessionMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 当前会话 id 持久化 key(刷新后恢复上次会话) */
const CURRENT_SESSION_KEY = 'hippo-current-session';

function readCurrentSession(): string | null {
  try {
    const v = localStorage.getItem(CURRENT_SESSION_KEY);
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}

function persistCurrentSession(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_SESSION_KEY, id);
    else localStorage.removeItem(CURRENT_SESSION_KEY);
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 会话列表 localStorage 缓存 key(刷新后先展示缓存,再后台请求刷新对齐) */
const SESSIONS_CACHE_KEY = 'hippo-session-list-cache';

/** 从 localStorage 读取会话列表缓存(无缓存或损坏时返回空数组) */
export function readSessionsCache(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Session[]) : [];
  } catch {
    return [];
  }
}

/** 将会话列表写入 localStorage 缓存(空列表时清除,避免残留脏缓存) */
function persistSessionsCache(sessions: Session[]): void {
  try {
    if (sessions.length === 0) {
      localStorage.removeItem(SESSIONS_CACHE_KEY);
    } else {
      localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(sessions));
    }
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** Sidebar(左侧会话面板)折叠状态持久化 key */
const SIDEBAR_COLLAPSED_KEY = 'hippo-sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

interface AppState {
  /** 所有会话列表(来自 GET /api/sessions) */
  sessions: Session[];
  /** 当前选中的会话 id */
  currentSessionId: string | null;
  /** 当前会话模式 */
  mode: SessionMode;
  /** 各任务模式(coding/chat/office)的自定义系统提示词。某模式空串/缺省=未自定义,聊天时用该模式内置默认;持久化在 ui.system_prompts */
  systemPrompts: Record<string, string>;
  /** 是否已从后端加载过 systemPrompts(避免每次发送都请求) */
  systemPromptLoaded: boolean;
  /** 当前工作区路径 */
  workspacePath: string;
  /** 当前主视图(中间工作区显示 chat 还是 settings) */
  view: AppView;
  /** 会话列表是否正在加载 */
  isLoadingSessions: boolean;
  /** 会话列表加载错误 */
  sessionsError: string | null;

  /** ActivityBar 是否隐藏(从 localStorage 恢复) */
  activityBarHidden: boolean;
  /** 当前激活的 ActivityBar 浮动面板 id(null=无)。从状态栏等外部也可联动打开 */
  activityPanel: ActivityPanelId | null;
  /** 面板是否被点击固定展开(hover 预览为 false,不持久化) */
  activityPanelPinned: boolean;
  /** Sidebar 是否折叠(从 localStorage 恢复) */
  sidebarCollapsed: boolean;
  /** SkillMarket 面板是否打开 */
  skillMarketOpen: boolean;
  /** 进入 Settings 视图时初始定位的设置页(由 ModelSelectorPanel 等外部触发,消费后重置为 'general') */
  settingsInitialPage: string;
  /** 面板布局偏好(聊天/预览左右排布,从 localStorage 恢复,默认 preview-left 对齐旧版) */
  panelLayout: PanelLayout;

  /** 会话输入草稿(内存态,对齐旧版 appState._sessionInputDrafts;key = sessionId) */
  sessionInputDrafts: Record<string, string>;
  /** hero 待定草稿(内存态,对齐旧版 appState._heroPendingDraft;只在 hero 空态使用) */
  heroPendingDraft: string;
  /** 会话临时显示名(内存态,对齐旧版 sessionManager.sessionNames:首条消息时把无标题新会话置为「新会话」,真实标题生成后由 s.title 优先覆盖;key = sessionId) */
  sessionDisplayNames: Record<string, string>;

  /** 设置会话列表 */
  setSessions: (sessions: Session[]) => void;
  /** 切换当前会话(同时重置 chatStore 由组件层处理) */
  setCurrentSession: (sessionId: string | null) => void;
  /** 设置会话模式 */
  setMode: (mode: SessionMode) => void;
  /** 设置生效的自定义系统提示词(设置页保存后同步更新) */
  setSystemPrompt: (mode: SessionMode, prompt: string) => void;
  /** 从后端加载各模式自定义系统提示词(仅首次;后续发送直接读取) */
  loadSystemPrompt: () => Promise<void>;
  /** 设置工作区路径 */
  setWorkspacePath: (path: string) => void;
  /** 切换主视图 */
  setView: (view: AppView) => void;
  /** 设置会话列表加载状态 */
  setIsLoadingSessions: (loading: boolean) => void;
  /** 设置会话列表加载错误 */
  setSessionsError: (error: string | null) => void;

  /** 更新单个会话(用于 SSE 推送更新 messageCount/running 等) */
  updateSession: (sessionId: string, patch: Partial<Session>) => void;
  /** 删除会话 */
  removeSession: (sessionId: string) => void;
  /** 设置会话临时显示名(仅首次,不覆盖已有;对齐旧版 setSessionName) */
  setSessionDisplayName: (sessionId: string, name: string) => void;

  /** 切换 ActivityBar 可见性(同时持久化到 localStorage) */
  toggleActivityBar: () => void;
  /** 设置当前激活的 ActivityBar 浮动面板(外部可从状态栏等联动打开) */
  setActivityPanel: (panel: ActivityPanelId | null, pinned?: boolean) => void;
  /** 外部打开 ActivityBar 面板:确保活动栏可见并固定展开;若面板已固定打开则关闭(toggle) */
  openActivityPanel: (panel: ActivityPanelId) => void;
  /** 设置 Sidebar 折叠状态(同时持久化到 localStorage) */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 设置 SkillMarket 打开/关闭 */
  setSkillMarketOpen: (open: boolean) => void;
  /** 设置 Settings 视图初始页(消费后应重置为 'general') */
  setSettingsInitialPage: (page: string) => void;
  /** 设置面板布局(同时持久化到 localStorage,key 对齐旧版 hippo-layout) */
  setPanelLayout: (layout: PanelLayout) => void;

  /** 保存会话输入草稿(空内容不入库,对齐旧版 saveSessionInputDraft) */
  saveSessionInputDraft: (sessionId: string, text: string) => void;
  /** 清除会话输入草稿(对齐旧版 clearSessionInputDraft) */
  clearSessionInputDraft: (sessionId: string) => void;
  /** 保存 hero 待定草稿(对齐旧版 saveHeroPendingDraft) */
  saveHeroPendingDraft: (text: string) => void;
  /** 清除 hero 待定草稿(对齐旧版 clearHeroPendingDraft) */
  clearHeroPendingDraft: () => void;
  /** 新建会话:生成 web-* id,并把 hero 待定草稿带入新会话草稿(对齐旧版 createNewSession) */
  createNewSession: () => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  currentSessionId: readCurrentSession(),
  mode: readGlobalMode(),
  systemPrompts: {},
  systemPromptLoaded: false,
  workspacePath: '',
  view: 'chat',
  isLoadingSessions: false,
  sessionsError: null,

  activityBarHidden: readActivityBarHidden(),
  activityPanel: null,
  activityPanelPinned: false,
  sidebarCollapsed: readSidebarCollapsed(),
  skillMarketOpen: false,
  settingsInitialPage: 'general',
  panelLayout: readPanelLayout(),

  sessionInputDrafts: {},
  heroPendingDraft: '',
  sessionDisplayNames: {},

  setSessions: (sessions) => {
    persistSessionsCache(sessions);
    set((state) => {
      const patch: Partial<AppState> = { sessions };
      // 刷新/加载会话列表后,恢复当前会话已固化的 mode(对齐旧版 batchSetSessionModes);
      // 无记录时保持全局兜底 mode 不变
      const cur = state.currentSessionId;
      const curSession = sessions.find((s) => s.id === cur);
      if (curSession?.mode) patch.mode = curSession.mode;
      return patch;
    });
  },
  setCurrentSession: (sessionId) => {
    persistCurrentSession(sessionId);
    set((state) => {
      const patch: Partial<AppState> = { currentSessionId: sessionId };
      // 切换会话时恢复该会话已固化的 mode;无记录(新会话/虚拟会话)保持全局兜底不变
      const target = state.sessions.find((s) => s.id === sessionId);
      if (target?.mode) patch.mode = target.mode;
      return patch;
    });
  },
  setMode: (mode) => {
    persistGlobalMode(mode);
    set({ mode });
  },
  setSystemPrompt: (mode, prompt) =>
    set((s) => ({ systemPrompts: { ...s.systemPrompts, [mode]: prompt } })),
  loadSystemPrompt: async () => {
    if (get().systemPromptLoaded) return;
    try {
      const cfg = await configApi.getFull();
      set({ systemPrompts: cfg.ui?.system_prompts ?? {}, systemPromptLoaded: true });
    } catch {
      // 加载失败时不阻塞发送,回退为未自定义(使用内置默认提示词)
      set({ systemPromptLoaded: true });
    }
  },
  setWorkspacePath: (path) => set({ workspacePath: path }),
  setView: (view) => set({ view }),
  setIsLoadingSessions: (loading) => set({ isLoadingSessions: loading }),
  setSessionsError: (error) => set({ sessionsError: error }),

  updateSession: (sessionId, patch) => {
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...patch } : s,
      );
      persistSessionsCache(sessions);
      return { sessions };
    });
  },

  removeSession: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      persistSessionsCache(sessions);
      const removingCurrent = state.currentSessionId === sessionId;
      // 删除当前会话后回到 hero(currentSessionId=null):必须同步清除持久化的
      // 当前会话 id,否则刷新页面 readCurrentSession 会读到已删除会话,AppShell 兜底
      // 会把它当成失效会话并自动选中其它历史会话,导致回到 hero 的状态无法跨刷新保持。
      if (removingCurrent) {
        persistCurrentSession(null);
      }
      return {
        sessions,
        currentSessionId: removingCurrent ? null : state.currentSessionId,
      };
    });
  },

  setSessionDisplayName: (sessionId, name) => {
    const cur = get().sessionDisplayNames[sessionId];
    if (cur) return; // 仅首次,不覆盖(对齐旧版 setSessionName)
    set({ sessionDisplayNames: { ...get().sessionDisplayNames, [sessionId]: name } });
  },

  toggleActivityBar: () => {
    const next = !get().activityBarHidden;
    persistActivityBarHidden(next);
    set({ activityBarHidden: next });
  },

  setActivityPanel: (panel, pinned = false) => {
    set({ activityPanel: panel, activityPanelPinned: pinned });
  },

  openActivityPanel: (panel) => {
    const s = get();
    // 已固定打开同一面板 → 关闭(toggle);否则打开并确保活动栏可见
    if (s.activityPanel === panel && s.activityPanelPinned) {
      set({ activityPanel: null, activityPanelPinned: false });
      return;
    }
    if (s.activityBarHidden) {
      s.toggleActivityBar();
    }
    set({ activityPanel: panel, activityPanelPinned: true });
  },

  setSidebarCollapsed: (collapsed) => {
    persistSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },

  setSkillMarketOpen: (open) => set({ skillMarketOpen: open }),
  setSettingsInitialPage: (page) => set({ settingsInitialPage: page }),
  setPanelLayout: (layout) => {
    persistPanelLayout(layout);
    set({ panelLayout: layout });
  },

  saveSessionInputDraft: (sessionId, text) =>
    set((s) => ({ sessionInputDrafts: { ...s.sessionInputDrafts, [sessionId]: text } })),
  clearSessionInputDraft: (sessionId) =>
    set((s) => {
      const drafts = { ...s.sessionInputDrafts };
      delete drafts[sessionId];
      return { sessionInputDrafts: drafts };
    }),
  saveHeroPendingDraft: (text) => set({ heroPendingDraft: text }),
  clearHeroPendingDraft: () => set({ heroPendingDraft: '' }),
  createNewSession: () => {
    const id = `web-${Date.now()}`;
    const heroDraft = get().heroPendingDraft;
    set((s) => {
      const drafts = { ...s.sessionInputDrafts };
      // 新建会话时把 hero 待定草稿带入新会话(对齐旧版 createNewSession 的
      // savedDraft = getHeroPendingDraft 逻辑;空草稿不占位)
      if (heroDraft) drafts[id] = heroDraft;
      return { currentSessionId: id, sessionInputDrafts: drafts };
    });
    persistCurrentSession(id);
    return id;
  },
}));
