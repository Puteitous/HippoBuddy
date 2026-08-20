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

/** 主视图类型 */
export type AppView = 'chat' | 'settings';

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
  /** Sidebar 是否折叠(从 localStorage 恢复) */
  sidebarCollapsed: boolean;
  /** SkillMarket 面板是否打开 */
  skillMarketOpen: boolean;
  /** 进入 Settings 视图时初始定位的设置页(由 ModelSelectorPanel 等外部触发,消费后重置为 'general') */
  settingsInitialPage: string;

  /** 设置会话列表 */
  setSessions: (sessions: Session[]) => void;
  /** 切换当前会话(同时重置 chatStore 由组件层处理) */
  setCurrentSession: (sessionId: string | null) => void;
  /** 设置会话模式 */
  setMode: (mode: SessionMode) => void;
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

  /** 切换 ActivityBar 可见性(同时持久化到 localStorage) */
  toggleActivityBar: () => void;
  /** 设置 Sidebar 折叠状态(同时持久化到 localStorage) */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 设置 SkillMarket 打开/关闭 */
  setSkillMarketOpen: (open: boolean) => void;
  /** 设置 Settings 视图初始页(消费后应重置为 'general') */
  setSettingsInitialPage: (page: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  currentSessionId: readCurrentSession(),
  mode: 'chat',
  workspacePath: '',
  view: 'chat',
  isLoadingSessions: false,
  sessionsError: null,

  activityBarHidden: readActivityBarHidden(),
  sidebarCollapsed: readSidebarCollapsed(),
  skillMarketOpen: false,
  settingsInitialPage: 'general',

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (sessionId) => {
    persistCurrentSession(sessionId);
    set({ currentSessionId: sessionId });
  },
  setMode: (mode) => set({ mode }),
  setWorkspacePath: (path) => set({ workspacePath: path }),
  setView: (view) => set({ view }),
  setIsLoadingSessions: (loading) => set({ isLoadingSessions: loading }),
  setSessionsError: (error) => set({ sessionsError: error }),

  updateSession: (sessionId, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
    })),

  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      currentSessionId:
        state.currentSessionId === sessionId ? null : state.currentSessionId,
    })),

  toggleActivityBar: () => {
    const next = !get().activityBarHidden;
    persistActivityBarHidden(next);
    set({ activityBarHidden: next });
  },

  setSidebarCollapsed: (collapsed) => {
    persistSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },

  setSkillMarketOpen: (open) => set({ skillMarketOpen: open }),
  setSettingsInitialPage: (page) => set({ settingsInitialPage: page }),
}));
