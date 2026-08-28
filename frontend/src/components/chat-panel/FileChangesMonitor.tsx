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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '@/i18n';
import { fileApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { emit, on } from '@/utils/eventBus';
import type { RollbackCompletedPayload, SessionMessagesLoadedPayload } from '@/utils/eventBus';
import { FileTypeIcon } from '../FileTypeIcon';
import './FileChangesMonitor.css';

interface ChangeRecord {
  filePath: string;
  toolName: string;
  timestamp: number;
  binary: boolean;
  /** 该文件在会话内的净变化行数(后端按 filePath 分组用 netDiffStats 计算) */
  insertions: number;
  deletions: number;
}

interface SummaryData {
  fileCount: number;
  insertions: number;
  deletions: number;
}

/** 按文件路径分组:每组保留最新一条 + 修改次数 + 净变化行数(对齐旧版 FileChangeManager 分组逻辑) */
interface GroupedChange {
  filePath: string;
  toolName: string;
  timestamp: number;
  count: number;
  /** 该文件在会话内的净变化行数(由后端随每条变更返回,组内任一条相同) */
  insertions: number;
  deletions: number;
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
        insertions: c.insertions,
        deletions: c.deletions,
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
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const workspacePath = useAppStore((s) => s.workspacePath);

  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  /** popover 是否固定显示(点击状态栏项切换) */
  const [pinned, setPinned] = useState(false);
  /** popover 是否 hover 显示 */
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  /** 智能居中:面板越出 .chat-panel 边界时用于水平平移回退的偏移量 */
  const [popoverX, setPopoverX] = useState(0);
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

  // 会话切换、历史消息加载完成后刷新,用事件里的 sessionId(而非并发读取 currentSessionId)。
  // 后端 getMessages 已在返回前执行 loadSessionChanges 把该会话变更加载进内存,
  // 本组件此刻再 getChanges 即可读到数据,复刻旧版 switchSession 顺序语义,避免"切回不显示"。
  useEffect(() => {
    const offLoaded = on<SessionMessagesLoadedPayload>('session:messages-loaded', (payload) => {
      void load(payload.sessionId);
    });
    return offLoaded;
  }, [load]);

  const groups = useMemo(
    () => groupChanges(changes).sort((a, b) => b.timestamp - a.timestamp),
    [changes],
  );

  const showPopover = pinned || hovered;

  // ── 智能居中:面板默认围绕触发点居中,越出 .chat-panel 边界时平移回退到边距内 ──
  // 触发点在聊天面板左半区,当 chat 面板较窄时居中会让面板左边越界,这里用
  // getBoundingClientRect 测量触发点与 chat 面板的左右边界,计算所需的水平偏移。
  useLayoutEffect(() => {
    if (!showPopover) return;
    const root = rootRef.current;
    const popover = popoverRef.current;
    if (!root || !popover) return;

    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      // .chat-panel 是本组件最近的祖先容器(输入卡状态栏,非滚动容器,固定可见)
      const panel = root.closest('.chat-panel');
      const panelRect = panel?.getBoundingClientRect();

      let nextX = 0;
      if (panelRect) {
        const GAP = 8; // 面板距 chat 面板左右边界的最小间距
        // 面板假定位于触发点正上方(bottom:100%),同一水平中线
        const left = rootRect.left + rootRect.width / 2 - popoverRect.width / 2 + nextX;
        const right = left + popoverRect.width;
        if (left < panelRect.left + GAP) {
          nextX = panelRect.left + GAP - (rootRect.left + rootRect.width / 2 - popoverRect.width / 2);
        } else if (right > panelRect.right - GAP) {
          nextX = panelRect.right - GAP - (rootRect.left + rootRect.width / 2 + popoverRect.width / 2);
        }
      }
      setPopoverX((prev) => (prev === nextX ? prev : nextX));
    };

    measure();
    // popover 尺寸固定,无需监听 resize;但内容变化(组数)可能改变高度,低频场景可忽略
  }, [showPopover]);

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

  // 点击文件 → 打开 diff(桌面端/新版统一走 workspace:openDiff,PreviewPanel 全局订阅)
  const openFileDiff = useCallback(
    (filePath: string) => {
      setPinned(false);
      setHovered(false);
      emit('workspace:openDiff', { filePath });
    },
    [],
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
      title={t('fileChanges.title')}
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
        <div
          ref={popoverRef}
          className="chat-panel-files-popover"
          style={{ '--popover-x': `${popoverX}px` } as CSSProperties}
        >
          {/* 会话级汇总条(对齐旧版 #filesPopoverSummary) */}
          {summary && summary.fileCount > 0 && (
            <div className="fcs-summary">
              <span className="fcs-count">{t('fileChanges.summaryFiles', { count: summary.fileCount })}</span>
              <span className="fcs-stats">
                <span className="fcs-add">+{summary.insertions}</span>
                <span className="fcs-del">-{summary.deletions}</span>
              </span>
            </div>
          )}

          <div className="chat-panel-files-body">
            {groups.length === 0 ? (
              <div className="chat-panel-files-empty">{t('fileChanges.empty')}</div>
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
                        <FileTypeIcon fileName={fileName} size={14} />
                      </span>
                      <span className="chat-panel-files-name">
                        <span className="chat-panel-files-basename">{fileName}</span>
                        {dirPart && <span className="chat-panel-files-path">{dirPart}</span>}
                      </span>
                      {g.count > 1 && (
                        <span className="chat-panel-files-count" title={t('fileChanges.modified', { count: g.count })}>
                          ×{g.count}
                        </span>
                      )}
                      <span className="chat-panel-files-stats">
                        <span className="fcs-add">+{g.insertions}</span>
                        <span className="fcs-del">-{g.deletions}</span>
                      </span>
                      <span className={`chat-panel-files-status ${st.className}`}>{st.letter}</span>
                    </div>
                  );
                })}
                {groups.length > MAX_VISIBLE && (
                  <div className="chat-panel-files-overflow">
                    {t('fileChanges.overflow', { overflow: groups.length - MAX_VISIBLE })}
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
