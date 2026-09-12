/**
 * GitPanel - 源码管理面板(ActivityBar 浮动面板)
 *
 * 数据源:后端 /api/git/* 系列(gitApi):
 *   status(已暂存/未暂存分组)、log(分页历史)、branch、operate(暂存/取消/提交/切分支)
 *
 * 交互:
 *   - 分支下拉切换 + 刷新
 *   - 「已暂存」「未暂存」分组,支持单个与全部暂存/取消暂存
 *   - 提交信息框(Ctrl/Cmd+Enter 提交,无已暂存或空内容时禁用)
 *   - 提交历史懒加载分页,展示 hash + subject + 作者 + 相对时间
 *   - 点击变更文件 → Preview 区打开对应 git diff(worktree/staged)
 *   - 点击历史提交 → Preview 区打开该提交的全量 diff
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gitApi, type GitLogEntry, type GitStatusEntry } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import './GitPanel.css';

/** git 历史分批加载数量(懒加载分页) */
const LOG_BATCH = 20;

/** 按 XY 状态段判断某条目应归入已暂存分组 */
function isStaged(e: GitStatusEntry): boolean {
  return e.staged;
}

/** 归入未暂存分组(含未跟踪 ?? 文件) */
function isUnstaged(e: GitStatusEntry): boolean {
  return e.unstaged || e.untracked;
}

/** 状态 Badge 字母:优先展示已暂存(X)位,否则未暂存(Y)位,未跟踪显示 ? */
function badgeOf(e: GitStatusEntry): string {
  if (!e.untracked && e.xy.length >= 2 && e.xy[0] !== ' ') return e.xy[0];
  return '?';
}

/** 拼接工作区根路径 + 相对路径 */
function joinPath(root: string, file: string): string {
  if (!root) return file;
  return root.replace(/\\+$/, '') + '/' + file;
}

/** 相对时间(语言中性:s/m/h/d) */
function relativeTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h`;
  return `${Math.floor(hour / 24)}d`;
}

export function GitPanel() {
  const { t } = useI18n();
  const workspacePath = useAppStore((s) => s.workspacePath);
  const openGitDiff = usePreviewStore((s) => s.openGitDiff);

  const [status, setStatus] = useState<GitStatusEntry[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [branchNames, setBranchNames] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [logEnded, setLogEnded] = useState(false);
  const [logLoadingMore, setLogLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
      if (!workspacePath) {
        setStatus(null);
        setAvailable(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [statusResult, branchResult, logResult] = await Promise.all([
          gitApi.status(workspacePath),
          gitApi.branch(workspacePath).catch(() => ({ current: '', names: [] as string[] })),
          gitApi.log(workspacePath, LOG_BATCH, 0).catch(() => ({ entries: [] as GitLogEntry[] })),
        ]);
        if (!mountedRef.current) return;
        setAvailable(statusResult.available);
        setStatus(statusResult.entries ?? []);
        setCurrentBranch(branchResult.current);
        setBranchNames(branchResult.names);
        setLog(logResult.entries ?? []);
        setLogEnded((logResult.entries ?? []).length < LOG_BATCH);
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [workspacePath],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMoreLog = async (): Promise<void> => {
    if (!workspacePath || logLoadingMore || logEnded) return;
    setLogLoadingMore(true);
    try {
      const next = await gitApi.log(workspacePath, LOG_BATCH, log.length);
      if (!mountedRef.current) return;
      setLog((prev) => [...prev, ...(next.entries ?? [])]);
      if ((next.entries ?? []).length < LOG_BATCH) setLogEnded(true);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLogLoadingMore(false);
    }
  };

  /** 执行写操作后刷新;失败写入 error */
  const runOperate = async (op: Parameters<typeof gitApi.operate>[0]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await gitApi.operate(op);
      if (res.success) {
        await refresh();
        return true;
      }
      setError(res.error || t('git.commitFailed'));
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const stageEntry = (e: GitStatusEntry): void => {
    if (busy) return;
    void runOperate({ action: isStaged(e) ? 'reset' : 'add', path: workspacePath, file: e.path });
  };

  const stageAll = (staged: boolean): void => {
    if (busy) return;
    const op = staged ? { action: 'reset' as const, path: workspacePath } : { action: 'add' as const, path: workspacePath };
    void runOperate(op);
  };

  const commit = (): void => {
    const msg = commitMsg.trim();
    if (busy || msg === '' || stagedCount === 0) return;
    void runOperate({ action: 'commit', path: workspacePath, message: msg }).then((ok) => {
      if (ok) setCommitMsg('');
    });
  };

  const checkout = (branch: string): void => {
    if (busy || branch === currentBranch) return;
    void runOperate({ action: 'checkout', path: workspacePath, branch });
  };

  const entries = status ?? [];
  const stagedEntries = useMemo(() => entries.filter(isStaged), [entries]);
  const unstagedEntries = useMemo(() => entries.filter(isUnstaged), [entries]);
  const stagedCount = stagedEntries.length;

  const openWorktreeDiff = (e: GitStatusEntry): void => {
    openGitDiff(joinPath(workspacePath, e.path), { side: isStaged(e) ? 'staged' : 'worktree' });
  };

  const openCommitDiff = (entry: GitLogEntry): void => {
    openGitDiff(entry.hashFull || entry.hash, { side: 'commit', hash: entry.hashFull || entry.hash });
  };

  if (!workspacePath) {
    return <div className="git-panel-empty">{t('git.notRepo')}</div>;
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <select
          className="git-panel-branch"
          value={currentBranch}
          onChange={(e) => checkout(e.target.value)}
          disabled={busy || !available}
        >
          {currentBranch !== '' && <option value={currentBranch}>{currentBranch}</option>}
          {branchNames.filter((b) => b !== currentBranch).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <button
          type="button"
          className="git-panel-icon-btn"
          title={t('git.refresh')}
          aria-label={t('git.refresh')}
          onClick={() => void refresh()}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
            <polyline points="14 2 14 5 11 5" />
            <polyline points="2 14 2 11 5 11" />
          </svg>
        </button>
      </div>

      {loading && <div className="git-panel-placeholder">{t('git.loading')}</div>}
      {!loading && !available && <div className="git-panel-placeholder">{t('git.notRepo')}</div>}
      {!loading && error && <div className="git-panel-error">{error}</div>}

      {!loading && available && (
        <>
          <GitSection
            title={`${t('git.staged')} (${stagedCount})`}
            actionLabel={stagedCount > 0 ? t('git.unstageAll') : undefined}
            onAction={stagedCount > 0 ? () => stageAll(true) : undefined}
            disabled={busy}
          >
            {stagedEntries.length === 0 ? (
              <div className="git-panel-none">{t('git.noChanges')}</div>
            ) : (
              stagedEntries.map((e) => (
                <GitStatusRow
                  key={`s:${e.path}`}
                  entry={e}
                  busy={busy}
                  onOpen={() => openWorktreeDiff(e)}
                  onToggle={() => stageEntry(e)}
                    toggleLabel={t('git.unstage')}
                />
              ))
            )}
          </GitSection>

          <GitSection
            title={`${t('git.unstaged')} (${unstagedEntries.length})`}
            actionLabel={unstagedEntries.length > 0 ? t('git.stageAll') : undefined}
            onAction={unstagedEntries.length > 0 ? () => stageAll(false) : undefined}
            disabled={busy}
          >
            {unstagedEntries.length === 0 ? (
              <div className="git-panel-none">{t('git.noChanges')}</div>
            ) : (
              unstagedEntries.map((e) => (
                <GitStatusRow
                  key={`u:${e.path}`}
                  entry={e}
                  busy={busy}
                  onOpen={() => openWorktreeDiff(e)}
                  onToggle={() => stageEntry(e)}
                    toggleLabel={t('git.stage')}
                />
              ))
            )}
          </GitSection>

          <div className="git-panel-commit">
            <input
              className="git-panel-commit-input"
              placeholder={t('git.commitPlaceholder')}
              value={commitMsg}
              disabled={busy}
              onChange={(e) => { setCommitMsg(e.target.value); setError(null); }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commit();
              }}
            />
            <button
              type="button"
              className="git-panel-commit-btn"
              disabled={busy || commitMsg.trim() === '' || stagedCount === 0}
              onClick={commit}
            >
              {t('git.commit')}
            </button>
          </div>

          <GitSection title={t('git.history')}>
            {log.map((entry) => (
              <div
                key={entry.hashFull || entry.hash}
                role="button"
                tabIndex={0}
                className="git-panel-log-row"
                title={`${entry.author} · ${entry.hashFull}${entry.refs ? ` (${entry.refs})` : ''}`}
                onClick={() => openCommitDiff(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCommitDiff(entry);
                  }
                }}
              >
                <span className="git-panel-log-line1">
                  <span className="git-panel-log-hash">{entry.hash}</span>
                  <span className="git-panel-log-subject">{entry.subject}</span>
                </span>
                <span className="git-panel-log-line2">
                  {entry.refs && (
                    <span className="git-panel-log-ref">{entry.refs}</span>
                  )}
                  <span className="git-panel-log-meta">{entry.author} · {relativeTime(entry.date)}</span>
                </span>
              </div>
            ))}
            {!logEnded && (
              <button
                type="button"
                className="git-panel-log-more"
                disabled={busy || logLoadingMore}
                onClick={() => void loadMoreLog()}
              >
                {logLoadingMore ? t('git.loading') : t('git.loadMore')}
              </button>
            )}
          </GitSection>
        </>
      )}
    </div>
  );
}

/** 分组区块(标题 + 可选右侧操作) */
function GitSection({
  title,
  actionLabel,
  onAction,
  disabled,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="git-panel-section">
      <div className="git-panel-section-header">
        <span>{title}</span>
        {actionLabel && onAction && (
          <button type="button" className="git-panel-link" disabled={disabled} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** 单条变更行:状态徽章 + 路径,点击开 diff,右侧暂存/取消按钮 */
function GitStatusRow({
  entry,
  busy,
  onOpen,
  onToggle,
  toggleLabel,
}: {
  entry: GitStatusEntry;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  toggleLabel: string;
}) {
  const badge = badgeOf(entry);
  const badgeClass =
    badge === '+' ? 'add' : badge === 'D' ? 'del' : badge === '?' ? 'new' : 'mod';
  return (
    <div className="git-panel-row">
      <button
        type="button"
        className="git-panel-row-main"
        title={entry.path}
        onClick={onOpen}
      >
        <span className={`git-panel-badge ${badgeClass}`}>{badge}</span>
        <span className="git-panel-name">{entry.path}</span>
      </button>
      <button
        type="button"
        className="git-panel-icon-btn"
        title={toggleLabel}
        aria-label={toggleLabel}
        disabled={busy}
        onClick={onToggle}
      >
        {entry.staged ? (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8l8 0" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 3v10M3 8h10" />
          </svg>
        )}
      </button>
    </div>
  );
}