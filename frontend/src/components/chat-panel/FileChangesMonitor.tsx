/**
 * FileChangesMonitor - 输入卡状态栏「文件变更」监控
 *
 * 对齐旧版 statusBarFiles(FileChangeManager.updateFileChanges + popover):
 *  - 状态栏项:文件图标 + 变更文件数(无变更时仅图标)
 *  - hover 显示悬浮面板,点击固定显示,点击外部关闭
 *  - 面板顶部:会话级汇总条(N 个文件 · +X -Y)
 *  - 面板列表:按文件路径分组(每组最新一条),A/M/D 状态字母,最多 10 条 + 溢出提示
 *  - 点击文件:emit 'workspace:openDiff' + 切到 Workspace 视图(对齐旧版 _openFileDiff)
 *
 * 数据源:fileApi.getChanges / fileApi.getSummary(与旧版 /api/files/changes 一致)
 * 刷新时机:挂载 + 会话切换 + 15s 轮询 + rollback:completed 事件(对齐旧版 file:changes-updated)
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { emit, on } from '@/utils/eventBus';
import type { RollbackCompletedPayload } from '@/utils/eventBus';
import './FileChangesMonitor.css';

interface ChangeRecord {
  filePath: string;
  toolName: string;
  timestamp: number;
  binary: boolean;
}

interface SummaryData {
  fileCount: number;
  insertions: number;
  deletions: number;
}

/** 按文件路径分组:每组保留最新一条 + 修改次数(对齐旧版 FileChangeManager 分组逻辑) */
interface GroupedChange {
  filePath: string;
  toolName: string;
  timestamp: number;
  count: number;
}

function groupChanges(changes: ChangeRecord[]): GroupedChange[] {
  const map = new Map<string, GroupedChange>();
  for (const c of changes) {
    const g = map.get(c.filePath);
    if (g) {
      g.count++;
      if (c.timestamp > g.timestamp) {
        g.timestamp = c.timestamp;
        g.toolName = c.toolName;
      }
    } else {
      map.set(c.filePath, {
        filePath: c.filePath,
        toolName: c.toolName,
        timestamp: c.timestamp,
        count: 1,
      });
    }
  }
  return [...map.values()];
}

/** Git 风格状态字母(对齐旧版:write_file→A,delete_file→D,其余→M) */
function statusOf(toolName: string): { letter: string; className: string } {
  if (toolName === 'delete_file') return { letter: 'D', className: 'status-deleted' };
  if (toolName === 'write_file') return { letter: 'A', className: 'status-added' };
  return { letter: 'M', className: 'status-modified' };
}

const REFRESH_INTERVAL_MS = 15000;
const MAX_VISIBLE = 10;

function FileChangesMonitorComponent() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setView = useAppStore((s) => s.setView);
  const workspacePath = useAppStore((s) => s.workspacePath);

  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  /** popover 是否固定显示(点击状态栏项切换) */
  const [pinned, setPinned] = useState(false);
  /** popover 是否 hover 显示 */
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /** 拉取变更 + 汇总(失败静默,等待下次刷新) */
  const load = useCallback(async (sessionId: string | null) => {
    try {
      const [ch, sm] = await Promise.all([
        fileApi.getChanges(sessionId ?? undefined),
        sessionId ? fileApi.getSummary(sessionId) : Promise.resolve(null),
      ]);
      if (!mountedRef.current) return;
      setChanges(Array.isArray(ch) ? ch : []);
      setSummary(sm);
    } catch {
      // 后端不可用 / 网络错误:静默,不影响主流程
    }
  }, []);

  // 挂载 + 会话切换 + 15s 轮询
  useEffect(() => {
    mountedRef.current = true;
    void load(currentSessionId);
    const timer = setInterval(() => void load(currentSessionId), REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [currentSessionId, load]);

  // 回滚完成后刷新(对齐旧版 file:changes-updated)
  useEffect(() => {
    const offRollback = on<RollbackCompletedPayload>('rollback:completed', () => {
      void load(currentSessionId);
    });
    return offRollback;
  }, [currentSessionId, load]);

  const groups = useMemo(
    () => groupChanges(changes).sort((a, b) => b.timestamp - a.timestamp),
    [changes],
  );

  const showPopover = pinned || hovered;

  // ── hover 显示/隐藏(200ms 防抖,对齐旧版 _bindPopoverHover) ──
  const handleEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setHovered(true);
  }, []);

  const handleLeave = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHovered(false), 200);
  }, []);

  // 点击外部取消固定并隐藏(对齐旧版 document click)
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [pinned]);

  // 点击文件 → 打开 diff(桌面端/新版统一走 workspace:openDiff + 切视图)
  const openFileDiff = useCallback(
    (filePath: string) => {
      setPinned(false);
      setHovered(false);
      emit('workspace:openDiff', { filePath });
      setView('workspace');
    },
    [setView],
  );

  /** 相对工作区根的展示路径(对齐旧版 updateFileChanges 的 root 裁剪) */
  const displayPath = useCallback(
    (filePath: string) => {
      if (!workspacePath) return filePath;
      const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
      const norm = filePath.replace(/\\/g, '/');
      return norm.startsWith(root) ? norm.slice(root.length) : filePath;
    },
    [workspacePath],
  );

  const countText = groups.length > 0 ? String(groups.length) : '';

  return (
    <span
      ref={rootRef}
      className="chat-panel-status-item chat-panel-files-monitor"
      title="文件变更"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={() => setPinned((v) => !v)}
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M9 2v3h3" />
      </svg>
      {countText !== '' && <span className="chat-panel-status-value">{countText}</span>}

      {showPopover && (
        <div className="chat-panel-files-popover">
          {/* 会话级汇总条(对齐旧版 #filesPopoverSummary) */}
          {summary && summary.fileCount > 0 && (
            <div className="fcs-summary">
              <span className="fcs-count">{summary.fileCount} 个文件</span>
              <span className="fcs-stats">
                <span className="fcs-add">+{summary.insertions}</span>
                <span className="fcs-del">-{summary.deletions}</span>
              </span>
            </div>
          )}

          <div className="chat-panel-files-body">
            {groups.length === 0 ? (
              <div className="chat-panel-files-empty">暂无文件变更</div>
            ) : (
              <>
                {groups.slice(0, MAX_VISIBLE).map((g) => {
                  const st = statusOf(g.toolName);
                  const fileName = g.filePath.split(/[/\\]/).pop() || g.filePath;
                  const dir = displayPath(g.filePath);
                  const dirPart = dir.endsWith(fileName)
                    ? dir.slice(0, -fileName.length).replace(/[/\\]$/, '')
                    : dir;
                  return (
                    <div
                      key={g.filePath}
                      className={`chat-panel-files-item${g.toolName === 'delete_file' ? ' is-deleted' : ''}`}
                      data-path={g.filePath}
                      onClick={() => openFileDiff(g.filePath)}
                      title={g.filePath}
                    >
                      <span className="chat-panel-files-icon">
                        <svg
                          viewBox="0 0 16 16"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                          <path d="M9 2v3h3" />
                        </svg>
                      </span>
                      <span className="chat-panel-files-name">
                        <span className="chat-panel-files-basename">{fileName}</span>
                        {dirPart && <span className="chat-panel-files-path">{dirPart}</span>}
                      </span>
                      {g.count > 1 && (
                        <span className="chat-panel-files-count" title={`修改 ${g.count} 次`}>
                          ×{g.count}
                        </span>
                      )}
                      <span className={`chat-panel-files-status ${st.className}`}>{st.letter}</span>
                    </div>
                  );
                })}
                {groups.length > MAX_VISIBLE && (
                  <div className="chat-panel-files-overflow">
                    还有 {groups.length - MAX_VISIBLE} 个文件
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

export const FileChangesMonitor = memo(FileChangesMonitorComponent);
