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

  /** 打开文件为 preview 模式(已有同路径 tab 则仅激活) */
  openFile: (filePath: string) => void;
  /** 打开文件为 diff 模式(已有同路径 diff tab 则更新 toolCallId) */
  openDiff: (filePath: string, toolCallId?: string) => void;
  /** 激活指定标签 */
  setActivePath: (path: string | null) => void;
  /** 关闭标签(激活相邻标签) */
  closeTab: (filePath: string) => void;
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

export const usePreviewStore = create<PreviewState>((set) => ({
  tabs: [],
  activePath: null,
  previewReloadKey: 0,
  collapsed: readPreviewCollapsed(),

  openFile: (filePath) => {
    // 打开文件清除收起状态(对齐旧版 handleFileSelect removeItem)
    persistPreviewCollapsed(false);
    set((state) => {
      // 已存在同路径标签(preview 或 diff)则仅激活
      if (state.tabs.some((t) => t.path === filePath)) {
        return { activePath: filePath, collapsed: false };
      }
      const tab: FileTab = { path: filePath, name: basename(filePath), mode: 'preview' };
      return { tabs: [...state.tabs, tab], activePath: filePath, collapsed: false };
    });
  },

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

  closeTab: (filePath) =>
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
    }),

  forceReload: () => set((s) => ({ previewReloadKey: s.previewReloadKey + 1 })),

  replaceTabs: (updater) =>
    set((state) => ({ tabs: updater(state.tabs) })),

  collapsePreview: () => {
    persistPreviewCollapsed(true);
    set({ collapsed: true });
  },
}));
