/**
 * PreviewPanel - 文件预览面板(对齐旧版 preview-panel)
 *
 * 布局对齐旧版后,文件树位于全局 Sidebar,预览面板与聊天并排显示在主区右侧。
 * 本组件仅负责:文件标签栏 + 预览/diff 内容渲染,并订阅跨组件事件:
 *   - 'workspace:openDiff'(ChatPanel 工具卡片) → 打开 diff tab
 *   - 'rollback:completed'(回滚完成) → diff 降级为 preview + 强制重建预览
 *
 * 状态由全局 previewStore 承载(文件树在 Sidebar,跨组件共享)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreviewStore } from '@/stores/previewStore';
import { on as onEvent } from '@/utils/eventBus';
import type { RollbackCompletedPayload } from '@/utils/eventBus';
import type { FileTab } from '@/types';
import { translate } from '@/i18n';
import { FileTabs } from './FileTabs';
import { FilePreview } from './FilePreview';
import { FileDiffView } from './FileDiffView';
import { WebPreviewBrowser } from './WebPreviewBrowser';
import './PreviewPanel.css';

export function PreviewPanel() {
  const tabs = usePreviewStore((s) => s.tabs);
  const activePath = usePreviewStore((s) => s.activePath);
  const previewReloadKey = usePreviewStore((s) => s.previewReloadKey);
  const openDiff = usePreviewStore((s) => s.openDiff);
  const closeTab = usePreviewStore((s) => s.closeTab);
  const closeOthers = usePreviewStore((s) => s.closeOthers);
  const closeRight = usePreviewStore((s) => s.closeRight);
  const closeAll = usePreviewStore((s) => s.closeAll);
  const reorderTabs = usePreviewStore((s) => s.reorderTabs);
  const setActivePath = usePreviewStore((s) => s.setActivePath);
  const forceReload = usePreviewStore((s) => s.forceReload);
  const replaceTabs = usePreviewStore((s) => s.replaceTabs);
  const updateWebUrl = usePreviewStore((s) => s.updateWebUrl);
  const collapsed = usePreviewStore((s) => s.collapsed);
  const deepLinkTick = usePreviewStore((s) => s.deepLinkTick);

  // 订阅回调里读取最新 activePath(避免闭包捕获过期值)
  const activePathRef = useRef<string | null>(null);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);
  // AI 工具写/编辑/删除当前预览文件 → 防抖重建预览(对齐旧版 file:preview-reload 的 150ms 防抖)
  const reloadTimerRef = useRef<number | null>(null);
  const pendingReloadPathRef = useRef<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

  // 脏检查把关:关闭单个标签 / 切换标签时,若目标会话含未保存改动,先用局部确认弹窗拦截,
  // 确认后才真正执行动作。确认逻辑统一在 UI 层,store 保持同步纯净。
  //   - 关闭:判定"被关闭标签"是否 dirty
  //   - 切换:判定"当前激活(将要离开)标签"是否 dirty
  type ConfirmIntent =
    | { kind: 'close'; tab: FileTab }
    | { kind: 'switch'; from: FileTab; to: string }
    | { kind: 'batch'; names: string[]; run: () => void };
  const [confirm, setConfirm] = useState<ConfirmIntent | null>(null);

  const handleCloseTab = useCallback(
    (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (tab?.dirty) {
        setConfirm({ kind: 'close', tab });
        return;
      }
      closeTab(path);
    },
    [tabs, closeTab],
  );

  // 切换同样把关:当前激活标签 dirty 时拦截(对齐旧版 onBeforeSwitch)
  const handleSelectTab = useCallback(
    (path: string) => {
      if (path === activePath) return;
      const from = tabs.find((t) => t.path === activePath && t.dirty);
      if (from) {
        setConfirm({ kind: 'switch', from, to: path });
        return;
      }
      setActivePath(path);
    },
    [tabs, activePath, setActivePath],
  );

  // 确认后执行对应动作
  const confirmAction = useCallback(() => {
    if (!confirm) return;
    if (confirm.kind === 'close') {
      closeTab(confirm.tab.path);
    } else if (confirm.kind === 'switch') {
      setActivePath(confirm.to);
    } else {
      confirm.run();
    }
    setConfirm(null);
  }, [confirm, closeTab, setActivePath]);

  // 批量关闭把关:收集实际被关闭的脏文件,聚合到一次确认。(对齐旧版 _confirmBatchClose)
  const guardBatch = useCallback(
    (dirty: FileTab[], run: () => void) => {
      if (dirty.length === 0) {
        run();
        return;
      }
      setConfirm({ kind: 'batch', names: dirty.map((t) => t.name), run });
    },
    [],
  );

  const handleCloseOthers = useCallback(
    (path: string) => {
      guardBatch(tabs.filter((t) => t.path !== path && t.dirty), () => closeOthers(path));
    },
    [tabs, guardBatch, closeOthers],
  );

  const handleCloseRight = useCallback(
    (path: string) => {
      const idx = tabs.findIndex((t) => t.path === path);
      const rightDirty = idx >= 0 ? tabs.slice(idx + 1).filter((t) => t.dirty) : [];
      guardBatch(rightDirty, () => closeRight(path));
    },
    [tabs, guardBatch, closeRight],
  );

  const handleCloseAll = useCallback(() => {
    guardBatch(tabs.filter((t) => t.dirty), () => closeAll());
  }, [tabs, guardBatch, closeAll]);

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
        replaceTabs((prev) => {
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
          forceReload();
        }
      },
    );
    return unsubscribe;
  }, [forceReload, replaceTabs]);

  // 订阅 eventBus 'file:preview-reload'(AI 工具 write/edit/delete 命中当前预览文件 → 自动重载)。
  // 防抖 150ms 合并 AI 一次回复对同一文件的连续写/编辑,避免预览区反复重建闪烁/滚动跳动
  // (对齐旧版 FilePreview.reload() 的防抖口径)。仅命中 preview 标签,不处理 diff 视图。
  useEffect(() => {
    const unsubscribe = onEvent<string>(
      'file:preview-reload',
      (path) => {
        if (!path) return;
        const s = usePreviewStore.getState();
        const cur = s.activePath;
        if (!cur || normalizePath(cur) !== normalizePath(path)) return;
        const tab = s.tabs.find((t) => t.path === cur);
        if (!tab || tab.mode !== 'preview') return;
        pendingReloadPathRef.current = path;
        if (reloadTimerRef.current != null) return;
        reloadTimerRef.current = window.setTimeout(() => {
          reloadTimerRef.current = null;
          const target = pendingReloadPathRef.current;
          pendingReloadPathRef.current = null;
          if (!target) return;
          usePreviewStore.getState().forceReload();
        }, 150);
      },
    );
    return () => {
      unsubscribe();
      if (reloadTimerRef.current != null) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      pendingReloadPathRef.current = null;
    };
  }, []);

  // 无打开文件时不渲染(聊天占满主区,对齐旧版 preview-panel hidden);
  // 用户主动收起时同样隐藏(对齐旧版 hidePreview,标签保留,打开/切换文件时恢复)
  if (collapsed || !activeTab || !activePath || tabs.length === 0) return null;

  return (
    <div className="preview-panel">
      <FileTabs
        tabs={tabs}
        activePath={activePath}
        onSelect={handleSelectTab}
        onClose={handleCloseTab}
        onCloseOthers={handleCloseOthers}
        onCloseRight={handleCloseRight}
        onCloseAll={handleCloseAll}
        onReorder={reorderTabs}
      />
      <div className="preview-panel-content">
        {/* 主可视区:同一时刻仅渲染一份内容 —— diff、内嵌浏览器 或 文件预览。
            切走 web 标签即卸载(预览区不残留浏览器),切回时按记忆地址开 WebPreviewBrowser 重载 */}
        {activeTab.mode === 'diff' ? (
          <FileDiffView
            key={`diff-${activePath}-${activeTab.toolCallId ?? ''}`}
            filePath={activePath}
            toolCallId={activeTab.toolCallId}
          />
        ) : activeTab.mode === 'web' ? (
          <WebPreviewBrowser
            key={activePath}
            url={activeTab.url ?? activePath}
            displayName={activeTab.name}
            onNavigate={(url) => updateWebUrl(activePath, url)}
          />
        ) : (
          <FilePreview
            key={`preview-${activePath}-${previewReloadKey}`}
            filePath={activePath}
            startLine={activeTab.startLine}
            endLine={activeTab.endLine}
            deepLinkTick={deepLinkTick}
          />
        )}
      </div>
      {confirm && (
        <ConfirmDirtyClose
          kind={confirm.kind}
          name={confirm.kind === 'close' ? confirm.tab.name : confirm.kind === 'switch' ? confirm.from.name : ''}
          names={confirm.kind === 'batch' ? confirm.names : undefined}
          action={confirm.kind === 'close' ? translate('preview.actionClose') : confirm.kind === 'switch' ? translate('preview.actionSwitch') : translate('preview.actionClose')}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}

/**
 * 未保存改动确认弹窗(复用 FileTree 的 file-tree-modal-* 样式类,保持弹窗视觉统一)。
 * 覆盖三类场景(对齐旧版 onBeforeClose / onBeforeSwitch / _confirmBatchClose):
 *   - close:关闭单个 dirty 标签
 *   - switch:切换标签且当前激活标签 dirty
 *   - batch:批量关闭(关闭其他/右侧/全部),将脏文件聚合成列表一次确认
 */
function ConfirmDirtyClose({
  kind,
  name,
  names,
  action,
  onCancel,
  onConfirm,
}: {
  kind: 'close' | 'switch' | 'batch';
  name: string;
  names?: string[];
  action: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isBatch = kind === 'batch';
  const count = names?.length ?? 0;
  return (
    <div className="file-tree-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{translate('modal.unsavedTitle')}</span>
        </div>
        <div className="file-tree-modal-body">
          {isBatch ? (
            <>
              <p className="file-tree-modal-message">{translate('preview.unsavedBatch', { count, action })}</p>
              <ul className="file-tree-modal-names">
                {names?.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </>
          ) : (
            <p className="file-tree-modal-message">
              <strong>{name}</strong>{translate('preview.unsavedSingle', { action })}
            </p>
          )}
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onCancel}>
            {translate('modal.cancel')}
          </button>
          <button type="button" className="file-tree-modal-btn file-tree-modal-btn-danger" onClick={onConfirm}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 规范化文件路径用于比较(统一分隔符 + 小写,对齐旧版 preview-reload 匹配) */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}
