/**
 * WorkspacePanel - 工作区面板容器(阶段 3.5)
 *
 * 组合布局:
 *   ┌────────────┬─────────────────────────────────┐
 *   │  FileTree  │  FileTabs                       │
 *   │            ├─────────────────────────────────┤
 *   │            │  FilePreview / FileDiffView     │
 *   └────────────┴─────────────────────────────────┘
 *
 * 状态:
 *   - tabs: FileTab[] 打开的文件列表(本地 React state)
 *   - activePath: 当前激活的文件路径
 *   - rootPath: 工作区根路径(从 appStore.workspacePath 读;为空时启动加载)
 *
 * 路径来源:启动时调 workspaceApi.getCurrent() → appStore.setWorkspacePath
 *
 * 阶段 3.7-1:接入 eventBus 'workspace:openDiff',让 ChatPanel 工具卡片
 * 触发打开 diff tab。
 * 阶段 3.8:接入 eventBus 'rollback:completed',回滚成功后刷新被回滚文件:
 *   - preview tab → 强制重建(重新加载回滚后内容)
 *   - diff tab   → 降级为 preview(回滚后该工具调用的 diff 已无意义)
 *   - 未挂载时事件自然丢失:切回 Workspace 视图会全新挂载,无陈旧缓存问题
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workspaceApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { on as onEvent } from '@/utils/eventBus';
import type { RollbackCompletedPayload } from '@/utils/eventBus';
import type { FileTab } from '@/types';
import { FileTree } from './FileTree';
import { FileTabs } from './FileTabs';
import { FilePreview } from './FilePreview';
import { FileDiffView } from './FileDiffView';
import './WorkspacePanel.css';

export function WorkspacePanel() {
  const workspacePath = useAppStore((s) => s.workspacePath);
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath);

  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  // 回滚联动:命中当前预览文件时自增,强制 FilePreview 重建(重新加载回滚后内容)
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  // 订阅回调里读取最新 activePath(避免闭包捕获过期值)
  const activePathRef = useRef<string | null>(null);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // 启动时若 store 无 workspacePath,则拉取一次
  useEffect(() => {
    let cancelled = false;
    async function loadRoot() {
      if (workspacePath) return;
      setRootLoading(true);
      setRootError(null);
      try {
        const state = await workspaceApi.getCurrent();
        if (cancelled) return;
        setWorkspacePath(state.path);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setRootError(msg);
      } finally {
        if (!cancelled) setRootLoading(false);
      }
    }
    void loadRoot();
    return () => {
      cancelled = true;
    };
    // 仅挂载时执行一次;store 变化由其他视图(3.6 Settings)负责再次拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

  const openFile = useCallback((filePath: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === filePath && t.mode === 'preview');
      if (existing) return prev;
      // 若已有同路径 diff 标签,激活它而不是新建 preview
      const existingDiff = prev.find((t) => t.path === filePath);
      if (existingDiff) return prev;
      const name = basename(filePath);
      return [...prev, { path: filePath, name, mode: 'preview' as const }];
    });
    setActivePath(filePath);
  }, []);

  // openDiff:让 ChatPanel 工具卡片通过 eventBus 触发打开 diff tab
  const openDiff = useCallback((filePath: string, toolCallId?: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === filePath && t.mode === 'diff');
      if (existing) {
        // 已存在则更新 toolCallId
        return prev.map((t) =>
          t.path === filePath && t.mode === 'diff'
            ? { ...t, toolCallId }
            : t,
        );
      }
      const name = basename(filePath);
      return [...prev, { path: filePath, name, mode: 'diff' as const, toolCallId }];
    });
    setActivePath(filePath);
  }, []);

  // 订阅 eventBus 'workspace:openDiff'(ChatPanel 工具卡片触发)
  useEffect(() => {
    const unsubscribe = onEvent<{ filePath: string; toolCallId?: string }>(
      'workspace:openDiff',
      (payload) => {
        if (!payload) return;
        openDiff(payload.filePath, payload.toolCallId);
      },
    );
    return unsubscribe;
  }, [openDiff]);

  // 订阅 eventBus 'rollback:completed'(回滚成功后刷新被回滚文件的预览)
  useEffect(() => {
    const unsubscribe = onEvent<RollbackCompletedPayload>(
      'rollback:completed',
      (payload) => {
        if (!payload || !Array.isArray(payload.paths) || payload.paths.length === 0) return;
        const paths = payload.paths;
        // 1) 被回滚文件的 diff tab 降级为 preview(回滚后该工具调用的 diff 已无意义,
        //    改为展示回滚后的当前内容;避免关闭 tab 导致空态)
        setTabs((prev) => {
          let changed = false;
          const next = prev.map((t) => {
            if (!paths.includes(t.path) || t.mode !== 'diff') return t;
            changed = true;
            return { ...t, mode: 'preview' as const, toolCallId: undefined, startLine: undefined, endLine: undefined };
          });
          return changed ? next : prev;
        });
        // 2) 当前预览文件被回滚 → 强制重建 FilePreview 重新加载
        const cur = activePathRef.current;
        if (cur && paths.includes(cur)) {
          setPreviewReloadKey((k) => k + 1);
        }
      },
    );
    return unsubscribe;
  }, []);

  const closeTab = useCallback((filePath: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === filePath);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.path !== filePath);
      // 若关闭的是当前激活的,激活相邻 tab
      setActivePath((cur) => {
        if (cur !== filePath) return cur;
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        return fallback ? fallback.path : null;
      });
      return next;
    });
  }, []);

  return (
    <section className="workspace-panel">
      <aside className="workspace-panel-sidebar">
        {rootLoading ? (
          <div className="workspace-panel-root-loading">加载工作区…</div>
        ) : rootError ? (
          <div className="workspace-panel-root-error">
            <p>加载工作区失败</p>
            <pre>{rootError}</pre>
          </div>
        ) : (
          <FileTree
            rootPath={workspacePath}
            onFileSelect={openFile}
            activePath={activePath}
          />
        )}
      </aside>
      <div className="workspace-panel-main">
        <FileTabs
          tabs={tabs}
          activePath={activePath}
          onSelect={setActivePath}
          onClose={closeTab}
        />
        <div className="workspace-panel-content">
          {!activeTab || !activePath ? (
            <div className="workspace-panel-empty">
              <p>从左侧文件树选择一个文件查看</p>
              <p className="workspace-panel-empty-hint">
                或在 ChatPanel 工具卡片中点击"查看 diff"打开变更视图
              </p>
            </div>
          ) : activeTab.mode === 'diff' ? (
            <FileDiffView
              key={`diff-${activePath}-${activeTab.toolCallId ?? ''}`}
              filePath={activePath}
              toolCallId={activeTab.toolCallId}
            />
          ) : (
            <FilePreview
              key={`preview-${activePath}-${previewReloadKey}`}
              filePath={activePath}
              startLine={activeTab.startLine}
              endLine={activeTab.endLine}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}
