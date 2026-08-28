/**
 * FileDiffView - 文件变更对比视图(对齐旧版 static/js/components/FileDiffView.js)
 *
 * 数据源:GET /api/files/diff?path=xxx&all=true(fileApi.getDiff)
 *
 * 视图三栏布局:
 *   - 头部:文件名 + 行数统计(+insertions / -deletions)+ 工具操作(刷新 / 打开位置)
 *   - 左侧时间线:「整体变更」置顶 + 每次工具变更逐条(点击切换整体/历史视图)
 *   - 主区:当前视图 diff(整体 = 净 diff;历史 = 该次变更 diff,均委托 FilePreviewDiff)
 *   - 底部:当前视图 +/- 统计 + 「在编辑器中打开」 + 「回滚此变更」
 *
 * 对齐旧版能力:
 *   - 历史时间线 + 整体/历史切换(默认展示整体变更)
 *   - 单次变更回滚(走 /api/files/rollback,按 toolCallId)
 *   - "在编辑器中打开"定位到当前视图首个变更行的新文件行号
 *   - 二进制文件隐藏回滚按钮并提示不可对比
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import { usePreviewStore } from '@/stores/previewStore';
import { showToast } from '@/utils/toastStore';
import { emit } from '@/utils/eventBus';
import { translate } from '@/i18n';
import type { DiffLine, FileChangeDiffItem, FileDiffResponse } from '@/types';
import { FilePreviewDiff } from './FilePreviewDiff';
import './FileDiffView.css';

interface FileDiffViewProps {
  /** 文件绝对路径 */
  filePath: string;
  /** 可选:聚焦的 toolCallId(传给后端定位 targetIndex;缺省默认展示整体变更) */
  toolCallId?: string;
}

interface DiffViewData {
  /** 当前渲染的 diff 内容 */
  changes: DiffLine[];
  /** 当前渲染的词级 diff */
  wordDiff?: FileChangeDiffItem['wordDiff'];
  /** 是否二进制(历史变更可能为二进制) */
  binary: boolean;
  /** 是否整体变更视图 */
  overall: boolean;
}

/** 当前选中的变更索引:-1 = 整体变更;0..n-1 = 历史变更 */
const OVERALL_INDEX = -1;

export function FileDiffView({ filePath, toolCallId }: FileDiffViewProps) {
  const [data, setData] = useState<FileDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 当前选中视图索引(初始按 toolCallId / 整体决定,load 后校正)
  const [activeIndex, setActiveIndex] = useState<number>(OVERALL_INDEX);
  // 回滚进行中(按钮 loading,防重复点击)
  const [rolling, setRolling] = useState(false);
  // 收起预览面板(对齐 FilePreview 的 panel-toggle-btn,标签保留;打开/切换文件时恢复)
  const collapsePreview = usePreviewStore((s) => s.collapsePreview);

  const load = useCallback(async (path: string, tcId?: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const resp = await fileApi.getDiff(path, tcId);
      setData(resp);
      // 默认视图:传入 toolCallId 时聚焦对应历史变更(用后端 targetIndex + 前端兜底匹配),
      // 否则展示整体变更(与旧版一致)
      setActiveIndex(resolveInitialIndex(resp, tcId));
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filePath, toolCallId);
  }, [filePath, toolCallId, load]);

  // 当前选中视图的渲染数据
  const viewData: DiffViewData | null = useMemo(() => {
    if (!data) return null;
    if (activeIndex === OVERALL_INDEX) {
      return { changes: data.netDiff ?? [], wordDiff: data.netWordDiff, binary: false, overall: true };
    }
    const c = data.allChanges[activeIndex];
    if (!c) return null;
    return { changes: c.changes ?? [], wordDiff: c.wordDiff, binary: !!c.binary, overall: false };
  }, [data, activeIndex]);

  // 当前选中变更的 toolCallId(整体视图为空 → 无回滚按钮)
  const activeToolCallId =
    activeIndex !== OVERALL_INDEX ? data?.allChanges[activeIndex]?.toolCallId ?? '' : '';

  // 是否二进制:仅历史变更可能为二进制;整体视图恒为文本 diff
  const isBinary = viewData?.overall ? false : !!viewData?.binary;

  const selectIndex = useCallback((idx: number) => setActiveIndex(idx), []);

  const handleRollback = useCallback(async () => {
    if (!filePath || !activeToolCallId || rolling) return;
    setRolling(true);
    try {
      const res = await fileApi.rollback(filePath, activeToolCallId);
      if (res.success) {
        showToast(translate('diff.rollbackSuccess') + basename(filePath), { type: 'success', duration: 3000 });
        // 通知预览等刷新被回滚文件;并在事件后才重新加载(让所有订阅方先感知本次回滚)
        emit('rollback:completed', { paths: [filePath], mode: 'files' });
        await load(filePath, toolCallId);
      } else {
        showToast(translate('diff.rollbackFailed') + (res.error || translate('chatui.unknownError')), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      showToast(translate('diff.rollbackFailed') + String(e), { type: 'error', duration: 3000 });
    } finally {
      setRolling(false);
    }
  }, [filePath, activeToolCallId, rolling, load, toolCallId]);

  const handleOpenInEditor = useCallback(() => {
    if (!filePath || !viewData) return;
    const line = getFirstChangeLine(viewData.changes);
    // 对齐旧版:切到 preview tab 并定位到首个变更行的新行号(替代依赖旧版全局 HippoWorkspace 的无反应调用)
    usePreviewStore.getState().openFile(filePath, line ?? undefined);
  }, [filePath, viewData]);

  return (
    <div className="file-diff-view">
      <div className="file-diff-view-header">
        <div className="file-diff-view-title">
          <span className="file-diff-view-name">{basename(filePath)}</span>
          <span className="file-diff-view-path" title={filePath}>
            {toRelativePath(filePath) || filePath}
          </span>
        </div>
        <div className="file-diff-view-actions">
          <button
            type="button"
            className="preview-btn"
            onClick={() => void load(filePath, toolCallId)}
            title={translate('diff.refresh')}
            aria-label={translate('diff.refresh')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
              <polyline points="14 2 14 5 11 5" />
              <polyline points="2 14 2 11 5 11" />
            </svg>
          </button>
          <button
            type="button"
            className="preview-btn"
            onClick={() => void desktopBridge.showItemInFolder(filePath)}
            title={translate('diff.showInFolder')}
            aria-label={translate('diff.showInFolder')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 2h4v4" />
              <path d="M14 2L8 8" />
              <path d="M11 10v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
            </svg>
          </button>
          {/* 收起预览(对齐 FilePreview 的 panel-toggle-btn,标签保留,打开/切换文件时恢复) */}
          <button
            type="button"
            className="panel-toggle-btn"
            onClick={collapsePreview}
            title={translate('diff.collapse')}
            aria-label={translate('diff.collapse')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="12 4 4 8 12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!loading && !error && data && (
        <div className="file-diff-view-layout">
          <FileDiffTimeline
            allChanges={data.allChanges}
            hasNetDiff={Array.isArray(data.netDiff) && data.netDiff.length > 0}
            activeIndex={activeIndex}
            onSelect={selectIndex}
          />
          <div className="file-diff-view-body">
            {viewData &&
              (viewData.binary ? (
                <div className="file-diff-view-empty">{translate('diff.binary')}</div>
              ) : viewData.changes.length > 0 ? (
                <FilePreviewDiff
                  lines={viewData.changes}
                  wordDiff={viewData.wordDiff}
                  filePath={filePath}
                />
              ) : (
                <div className="file-diff-view-empty">
                  {data.allChanges.length === 0 ? translate('diff.noRecords') : translate('diff.noContent')}
                </div>
              ))}
          </div>
        </div>
      )}

      {loading && <div className="file-diff-view-loading">{translate('diff.loading')}</div>}
      {error && (
        <div className="file-diff-view-error">
          <p>{error}</p>
          <button type="button" onClick={() => void load(filePath, toolCallId)}>{translate('chatui.retry')}</button>
        </div>
      )}

      <FileDiffViewFooter
        changes={viewData?.changes ?? []}
        isBinary={isBinary}
        hasHistory={!!data && data.allChanges.length > 0}
        activeToolCallId={activeToolCallId}
        rolling={rolling}
        onOpenInEditor={handleOpenInEditor}
        onRollback={() => void handleRollback()}
      />
    </div>
  );
}

// ============================================================================
// 时间线组件
// ============================================================================

interface FileDiffTimelineProps {
  allChanges: FileChangeDiffItem[];
  hasNetDiff: boolean;
  activeIndex: number;
  onSelect: (index: number) => void;
}

function FileDiffTimeline({ allChanges, hasNetDiff, activeIndex, onSelect }: FileDiffTimelineProps) {
  if (allChanges.length === 0) {
    return <div className="file-diff-timeline empty">{translate('diff.noRecords')}</div>;
  }

  return (
    <div className="file-diff-timeline">
      {/* 置顶条目:整体变更 */}
      {hasNetDiff && (
        <>
          <TimelineItem
            active={activeIndex === OVERALL_INDEX}
            title={translate('diff.overall')}
            label={translate('diff.overall')}
            stats={netStatsOf(allChanges)}
            onClick={() => onSelect(OVERALL_INDEX)}
          />
          <div className="file-diff-timeline-divider" />
        </>
      )}
      {allChanges.map((c, i) => {
        const [added, removed] = countDiff(c.changes);
        return (
          <TimelineItem
            key={c.toolCallId || c.timestamp || i}
            active={activeIndex === i}
            title={formatTime(c.timestamp)}
            label={toolLabel(c.toolName)}
            stats={{ added, removed }}
            onClick={() => onSelect(i)}
          />
        );
      })}
    </div>
  );
}

interface TimelineItemProps {
  active: boolean;
  title: string;
  label: string;
  stats: { added: number; removed: number };
  onClick: () => void;
}

function TimelineItem({ active, title, label, stats, onClick }: TimelineItemProps) {
  return (
    <div className={`file-diff-timeline-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="file-diff-timeline-dot" />
      <div className="file-diff-timeline-content">
        <div className="file-diff-timeline-time">{title}</div>
        <div className="file-diff-timeline-tool">
          {label}
          {(stats.added > 0 || stats.removed > 0) && (
            <span className="file-diff-timeline-stats">
              <span className="diff-stat-add">+{stats.added}</span>
              <span className="diff-stat-del">-{stats.removed}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 底部操作栏
// ============================================================================

interface FileDiffViewFooterProps {
  changes: DiffLine[];
  isBinary: boolean;
  hasHistory: boolean;
  activeToolCallId: string;
  rolling: boolean;
  onOpenInEditor: () => void;
  onRollback: () => void;
}

function FileDiffViewFooter({
  changes,
  isBinary,
  hasHistory,
  activeToolCallId,
  rolling,
  onOpenInEditor,
  onRollback,
}: FileDiffViewFooterProps) {
  const [added, removed] = countDiff(changes);
  const showStats = added > 0 || removed > 0;
  // 回滚按钮仅历史变更且非二进制时显示
  const showRollback = hasHistory && activeToolCallId.length > 0 && !isBinary;

  return (
    <div className="file-diff-view-footer">
      {showStats && (
        <div className="file-diff-view-stat">
          <span className="diff-stat-add">+{added}</span>
          <span className="diff-stat-del">-{removed}</span>
        </div>
      )}
      <div className="file-diff-view-footer-actions">
        <button
          type="button"
          className="file-diff-view-open-btn"
          onClick={onOpenInEditor}
          title={translate('diff.openInEditor')}
        >
          {translate('diff.openInEditor')}
        </button>
        {showRollback && (
          <button
            type="button"
            className="file-diff-view-rollback-btn"
            onClick={onRollback}
            disabled={rolling}
            title={translate('diff.rollbackBtn')}
          >
            {rolling ? translate('diff.rollingBack') : translate('diff.rollbackBtn')}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 工具函数(对齐旧版 FileDiffView.js)
// ============================================================================

/** 按 toolCallId 解析初始视图索引:未指定 → 整体变更;指定 → 聚焦对应历史(找不到降级整体) */
function resolveInitialIndex(data: FileDiffResponse, tcId?: string): number {
  if (!tcId) return OVERALL_INDEX;
  if (data && data.allChanges.length > 0) {
    const idx = data.allChanges.findIndex((c) => c.toolCallId === tcId);
    if (idx >= 0) return idx;
  }
  return OVERALL_INDEX;
}

/** 工具名 → 中文标签(对齐旧版 _getToolLabel) */
function toolLabel(toolName: string): string {
  switch (toolName) {
    case 'edit_file':
      return translate('diff.typeEdit');
    case 'write_file':
      return translate('diff.typeWrite');
    case 'delete_file':
      return translate('diff.typeDelete');
    default:
      return toolName;
  }
}

/** 统计一组 diff 的 +/- 行数(二进制/空返回 0) */
function countDiff(changes: DiffLine[] | undefined): [number, number] {
  if (!changes) return [0, 0];
  let added = 0;
  let removed = 0;
  for (const ch of changes) {
    if (ch.type === 'added') added++;
    else if (ch.type === 'removed') removed++;
  }
  return [added, removed];
}

/** 净 diff 的 +/- 行数(整体变更时间线条目用) */
function netStatsOf(allChanges: FileChangeDiffItem[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const c of allChanges) {
    const [a, r] = countDiff(c.changes);
    added += a;
    removed += r;
  }
  return { added, removed };
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 计算当前视图首个变更行对应的新文件行号(1-based),供"在编辑器中打开"定位。
 * 语义:编辑打开的是文件当前内容,故一律定位到"新文件中存在的行":
 *   added → 其新行号;removed → 向后取紧随其后的第一个 added/same 的新行号;
 *   整个文件只剩删除 → 返回 null。
 */
function getFirstChangeLine(changes: DiffLine[]): number | null {
  if (!changes || changes.length === 0) return null;
  let firstIdx = -1;
  for (let k = 0; k < changes.length; k++) {
    if (changes[k].type === 'added' || changes[k].type === 'removed') {
      firstIdx = k;
      break;
    }
  }
  if (firstIdx === -1) return null;
  let newLineNum = 1;
  for (let k = 0; k < changes.length; k++) {
    if (changes[k].type === 'removed') continue;
    if (k >= firstIdx) return newLineNum;
    newLineNum++;
  }
  return null;
}

function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}