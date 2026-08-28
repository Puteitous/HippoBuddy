/**
 * previewStore - 全局文件预览状态(Zustand)
 *
 * 布局对齐旧版后,文件树位于全局 Sidebar,预览面板位于主区聊天右侧,
 * 两者跨组件共享"打开的文件标签 / 激活文件"状态,故提升为全局 store。
 *
 * 由 Sidebar(FileTree 点击)写入,PreviewPanel 订阅渲染;
 * ChatPanel 工具卡片通过 eventBus 'workspace:openDiff' 触发打开 diff。
 */
import { create } from 'zustand';
import type { FileTab } from '@/types';
import { clearScrollPosition } from '@/utils/scroll-positions';
import { translate } from '@/i18n';

/** 预览面板收起状态持久化 key(与旧版 workspace-manager.js 同 key,新旧版共享) */
const PREVIEW_COLLAPSED_KEY = 'hippo-preview-collapsed';

function readPreviewCollapsed(): boolean {
  try {
    return localStorage.getItem(PREVIEW_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistPreviewCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PREVIEW_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

interface PreviewState {
  /** 打开的文件标签列表 */
  tabs: FileTab[];
  /** 当前激活的文件路径 */
  activePath: string | null;
  /** 回滚联动:命中当前预览文件时自增,强制 FilePreview 重建(重新加载回滚后内容) */
  previewReloadKey: number;
  /** 预览面板是否收起(用户主动收起,持久化;打开/切换文件时清除,对齐旧版 previewCollapseBtn) */
  collapsed: boolean;
  /** 每次 openFile 自增的跳转触发信号:即使 startLine 相同,点击引用芯片也会重新定位(对齐旧版每次点击卡片都 navigateToFile) */
  deepLinkTick: number;

  /** 打开文件为 preview 模式(已有同路径 tab 则仅激活;可选携带定位行) */
  openFile: (filePath: string, startLine?: number, endLine?: number) => void;
  /** 打开内嵌浏览器标签(已有同 URL tab 则仅激活;可选指定显示名) */
  openWeb: (url: string, displayName?: string) => void;
  /** 更新 web 标签当前地址(浏览器内导航后写回,切换回时按记忆地址重载) */
  updateWebUrl: (path: string, url: string) => void;
  /** 打开文件为 diff 模式(已有同路径 diff tab 则更新 toolCallId) */
  openDiff: (filePath: string, toolCallId?: string) => void;
  /** 激活指定标签 */
  setActivePath: (path: string | null) => void;
  /** 关闭标签(激活相邻标签) */
  closeTab: (filePath: string) => void;
  /** 关闭除指定外的所有标签(对齐旧版 closeOthers) */
  closeOthers: (filePath: string) => void;
  /** 关闭指定标签右侧的所有标签(对齐旧版 closeRight) */
  closeRight: (filePath: string) => void;
  /** 关闭所有标签(对齐旧版 closeAll) */
  closeAll: () => void;
  /** 拖拽排序:将 fromPath 移动到 toPath 前(insertBefore=true)或后(对齐旧版 drag drop) */
  reorderTabs: (fromPath: string, toPath: string, insertBefore: boolean) => void;
  /** 设置标签脏状态(未保存改动,对齐旧版 setDirty) */
  setTabDirty: (filePath: string, dirty: boolean) => void;
  /** 设置 md 预览/编辑模式(随标签持久化,切走切回保留;首次打开默认预览) */
  setMdMode: (filePath: string, mode: 'preview' | 'edit') => void;
  /** 设置 md 编辑态草稿(未保存内容;null 表示清空并回退磁盘内容) */
  setMdDraft: (filePath: string, content: string | null) => void;
  /** 批量更新标签(回滚后 diff 降级为 preview 等) */
  replaceTabs: (updater: (tabs: FileTab[]) => FileTab[]) => void;
  /** 强制重建当前预览(回滚后刷新内容) */
  forceReload: () => void;
  /** 收起预览面板(持久化到 localStorage,对齐旧版 previewCollapseBtn → hidePreview) */
  collapsePreview: () => void;
}

/** 取路径末段(类似 basename) */
function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** web 标签默认显示名:提取 URL 主机名,about:blank 等无主机时回退'浏览器'(对齐旧版 displayName 语义) */
function guessWebName(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname) return parsed.hostname;
  } catch {
    /* 非完整 URL,回退 */
  }
  return translate('browser.defaultName');
}

export const usePreviewStore = create<PreviewState>((set) => ({
  tabs: [],
  activePath: null,
  previewReloadKey: 0,
  collapsed: readPreviewCollapsed(),
  deepLinkTick: 0,

  openFile: (filePath, startLine, endLine) => {
    // 打开文件清除收起状态(对齐旧版 handleFileSelect removeItem)
    persistPreviewCollapsed(false);
    set((state) => {
      // 已存在同路径标签:若是 diff 则降级为 preview(对齐回滚降级语义)并激活;
      // 否则仅激活,但更新 startLine/endLine,保证已打开文件再次跳转(如选中引用点击)能定位到行
      const existing = state.tabs.find((t) => t.path === filePath);
      if (existing) {
        const tabs = state.tabs.map((t) =>
          t.path === filePath
            ? {
                ...t,
                mode: 'preview' as const,
                toolCallId: undefined,
                startLine,
                endLine,
              }
            : t,
        );
        return { tabs, activePath: filePath, collapsed: false, deepLinkTick: state.deepLinkTick + 1 };
      }
      const tab: FileTab = {
        path: filePath,
        name: basename(filePath),
        mode: 'preview',
        startLine,
        endLine,
      };
      return { tabs: [...state.tabs, tab], activePath: filePath, collapsed: false, deepLinkTick: state.deepLinkTick + 1 };
    });
  },

  openWeb: (url, displayName) => {
    // 打开浏览器清除收起状态(对齐 openFile:打开文件清除收起)
    persistPreviewCollapsed(false);
    set((state) => {
      // 已存在同 URL 的 web 标签:仅激活(对齐旧版 openWebTab 复用 tab)
      const existing = state.tabs.find((t) => t.mode === 'web' && t.url === url);
      if (existing) {
        return { activePath: existing.path, collapsed: false };
      }
      const tab: FileTab = { path: url, name: displayName ?? guessWebName(url), mode: 'web', url };
      return { tabs: [...state.tabs, tab], activePath: url, collapsed: false };
    });
  },

  updateWebUrl: (path, url) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.path === path && t.mode === 'web' ? { ...t, url } : t)),
    })),

  openDiff: (filePath, toolCallId) => {
    persistPreviewCollapsed(false);
    set((state) => {
      const existing = state.tabs.find((t) => t.path === filePath && t.mode === 'diff');
      if (existing) {
        return {
          tabs: state.tabs.map((t) =>
            t.path === filePath && t.mode === 'diff' ? { ...t, toolCallId } : t,
          ),
          activePath: filePath,
          collapsed: false,
        };
      }
      const tab: FileTab = { path: filePath, name: basename(filePath), mode: 'diff', toolCallId };
      return { tabs: [...state.tabs, tab], activePath: filePath, collapsed: false };
    });
  },

  setActivePath: (path) => {
    // 切换标签清除收起状态(对齐旧版 handleTabSelect removeItem)
    persistPreviewCollapsed(false);
    set({ activePath: path, collapsed: false });
  },

  closeTab: (filePath) => {
    // 关闭标签时清除该文件的滚动位置(对齐旧版 clearScrollPosition:重新打开从顶部开始)
    clearScrollPosition(filePath);
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.path === filePath);
      if (idx < 0) return state;
      const next = state.tabs.filter((t) => t.path !== filePath);
      let activePath = state.activePath;
      if (activePath === filePath) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        activePath = fallback ? fallback.path : null;
      }
      return { tabs: next, activePath };
    });
  },

  forceReload: () => set((s) => ({ previewReloadKey: s.previewReloadKey + 1 })),

  closeOthers: (filePath) => {
    clearScrollPosition(filePath);
    set((state) => {
      // 关闭除 filePath 外的所有标签,保留并激活 filePath(对齐旧版 closeOthers)
      return { tabs: state.tabs.filter((t) => t.path === filePath), activePath: filePath };
    });
  },

  closeRight: (filePath) => {
    clearScrollPosition(filePath);
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.path === filePath);
      if (idx < 0) return state;
      const tabs = state.tabs.slice(0, idx + 1);
      // 若激活标签在右侧被关闭,则激活到目标标签
      const rightClosed = state.tabs.slice(idx + 1).some((t) => t.path === state.activePath);
      const activePath = rightClosed ? filePath : state.activePath;
      return { tabs, activePath };
    });
  },

  closeAll: () => {
    set({ tabs: [], activePath: null });
  },

  reorderTabs: (fromPath, toPath, insertBefore) =>
    set((state) => {
      const fromIdx = state.tabs.findIndex((t) => t.path === fromPath);
      const toIdx = state.tabs.findIndex((t) => t.path === toPath);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return state;
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIdx, 1);
      // splice 后 toPath 索引可能偏移,重新定位
      const adjusted = tabs.findIndex((t) => t.path === toPath);
      const target = insertBefore ? adjusted : adjusted + 1;
      tabs.splice(target, 0, moved);
      return { tabs };
    }),

  setTabDirty: (filePath, dirty) =>
    set((state) => {
      if (!state.tabs.some((t) => t.path === filePath && t.dirty !== dirty)) return state;
      return {
        tabs: state.tabs.map((t) => (t.path === filePath ? { ...t, dirty } : t)),
      };
    }),

  setMdMode: (filePath, mode) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.path === filePath);
      if (!tab || tab.mdMode === mode) return state;
      return { tabs: state.tabs.map((t) => (t.path === filePath ? { ...t, mdMode: mode } : t)) };
    }),

  setMdDraft: (filePath, content) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.path === filePath);
      if (!tab || tab.mdDraft === content) return state;
      return { tabs: state.tabs.map((t) => (t.path === filePath ? { ...t, mdDraft: content } : t)) };
    }),

  replaceTabs: (updater) =>
    set((state) => ({ tabs: updater(state.tabs) })),

  collapsePreview: () => {
    persistPreviewCollapsed(true);
    set({ collapsed: true });
  },
}));
