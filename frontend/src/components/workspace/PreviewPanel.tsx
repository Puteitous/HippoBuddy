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
import { useEffect, useMemo, useRef } from 'react';
import { usePreviewStore } from '@/stores/previewStore';
import { on as onEvent } from '@/utils/eventBus';
import type { RollbackCompletedPayload } from '@/utils/eventBus';
import { FileTabs } from './FileTabs';
import { FilePreview } from './FilePreview';
import { FileDiffView } from './FileDiffView';
import './PreviewPanel.css';

export function PreviewPanel() {
  const tabs = usePreviewStore((s) => s.tabs);
  const activePath = usePreviewStore((s) => s.activePath);
  const previewReloadKey = usePreviewStore((s) => s.previewReloadKey);
  const openDiff = usePreviewStore((s) => s.openDiff);
  const closeTab = usePreviewStore((s) => s.closeTab);
  const setActivePath = usePreviewStore((s) => s.setActivePath);
  const forceReload = usePreviewStore((s) => s.forceReload);
  const replaceTabs = usePreviewStore((s) => s.replaceTabs);
  const collapsed = usePreviewStore((s) => s.collapsed);

  // 订阅回调里读取最新 activePath(避免闭包捕获过期值)
  const activePathRef = useRef<string | null>(null);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

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

  // 无打开文件时不渲染(聊天占满主区,对齐旧版 preview-panel hidden);
  // 用户主动收起时同样隐藏(对齐旧版 hidePreview,标签保留,打开/切换文件时恢复)
  if (collapsed || !activeTab || !activePath || tabs.length === 0) return null;

  return (
    <div className="preview-panel">
      <FileTabs
        tabs={tabs}
        activePath={activePath}
        onSelect={setActivePath}
        onClose={closeTab}
      />
      <div className="preview-panel-content">
        {activeTab.mode === 'diff' ? (
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
  );
}
