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
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { gitApi, type GitLogEntry, type GitStatusEntry } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import { on } from '@/utils/eventBus';
import { FileTypeIcon } from './FileTypeIcon';
import './GitPanel.css';

/** git 历史分批加载数量(懒加载分页) */
const LOG_BATCH = 20;

/** 提交信息草稿(模块级):面板随 ActivityBar 关闭/切换而卸载时保留已写内容,重开恢复 */
let commitDraft = '';

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
  // 真正未跟踪(??) → ?;已跟踪且有改动 → 优先暂存位字母,否则取工作区位字母
  if (e.untracked) return '?';
  if (e.xy.length >= 2) {
    if (e.xy[0] !== ' ') return e.xy[0];
    if (e.xy[1] !== ' ') return e.xy[1];
  }
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
  const [remoteBranchNames, setRemoteBranchNames] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [logEnded, setLogEnded] = useState(false);
  const [logLoadingMore, setLogLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commitMsg, setCommitMsg] = useState(commitDraft);
  /** AI 生成提交信息进行中 */
  const [aiMsgLoading, setAiMsgLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 当前正在执行的远端操作(fetch/pull/push),用于按钮 loading 并禁用其它操作 */
  const [remoteOp, setRemoteOp] = useState<'fetch' | 'pull' | 'push' | null>(null);
  /** 分支下拉是否展开 */
  const [branchOpen, setBranchOpen] = useState(false);
  /** 分支下拉中任一项的右键菜单(重命名/删除) */
  const [branchCtx, setBranchCtx] = useState<{ x: number; y: number; branch: string } | null>(null);
  /** 新建/重命名分支输入弹窗 */
  const [branchInput, setBranchInput] = useState<{ mode: 'create' | 'rename'; branch?: string } | null>(null);
  /** 变更行右键菜单 */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: GitStatusEntry } | null>(null);
  /** 历史行右键菜单 */
  const [logMenu, setLogMenu] = useState<{ x: number; y: number; entry: GitLogEntry } | null>(null);
  /** 待确认危险操作(discard/revert/cherry-pick) */
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const mountedRef = useRef(true);
  /** 自动刷新去抖定时器(AI 连续写文件时避免频繁打 git status) */
  const autoDebounceRef = useRef<number | null>(null);
  /** 分支切换按钮引用,用于下拉定位 */
  const branchTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** 提交信息 textarea 引用,用于自动增高 */
  const commitMsgRef = useRef<HTMLTextAreaElement | null>(null);
  /** 同步(远端操作)按钮引用,用于菜单定位 */
  const syncTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** 远端操作菜单是否展开 */
  const [syncOpen, setSyncOpen] = useState(false);
  /** 关闭右键菜单(点击外部) */
  const closeMenus = useCallback(() => {
    setCtxMenu(null);
    setLogMenu(null);
    setBranchOpen(false);
    setBranchCtx(null);
    setSyncOpen(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 提交信息 textarea 随内容自动增高(流式填充时也能实时变高)
  useEffect(() => {
    const el = commitMsgRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [commitMsg]);

  // 提交信息同步到模块级草稿,面板卸载后重开仍保留
  useEffect(() => {
    commitDraft = commitMsg;
  }, [commitMsg]);

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
          gitApi.branch(workspacePath).catch(() => ({ current: '', names: [] as string[], remotes: [] as string[] })),
          gitApi.log(workspacePath, LOG_BATCH, 0).catch(() => ({ entries: [] as GitLogEntry[] })),
        ]);
        if (!mountedRef.current) return;
        setAvailable(statusResult.available);
        setStatus(statusResult.entries ?? []);
        setCurrentBranch(branchResult.current);
        setBranchNames(branchResult.names);
        setRemoteBranchNames(branchResult.remotes ?? []);
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

  /** 仅刷新 git 状态(静默,不触发 loading 占位):供暂存/暂存批操作等不影响分支与历史的场景 */
  const refreshStatusOnly = useCallback(async () => {
      if (!workspacePath) return;
      try {
        const statusResult = await gitApi.status(workspacePath);
        if (!mountedRef.current) return;
        setAvailable(statusResult.available);
        setStatus(statusResult.entries ?? []);
        setError(null);
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [workspacePath],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // AI 写文件(write/edit/delete)或回滚完成后自动刷新 git 状态(仅状态,静默)。
  // 面板关闭时组件卸载、订阅自动解除;开启时匹配文件变更频率,去抖合并连续事件。
  useEffect(() => {
    const schedule = () => {
      if (autoDebounceRef.current != null) window.clearTimeout(autoDebounceRef.current);
      autoDebounceRef.current = window.setTimeout(() => {
        void refreshStatusOnly();
      }, 300);
    };
    const offPreview = on('file:preview-reload', schedule);
    const offRollback = on('rollback:completed', schedule);
    return () => {
      if (autoDebounceRef.current != null) window.clearTimeout(autoDebounceRef.current);
      offPreview();
      offRollback();
    };
  }, [refreshStatusOnly]);

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

  /** 执行写操作后刷新;失败写入 error。暂存类操作只刷新状态,其余操作全量刷新 */
  const runOperate = async (op: Parameters<typeof gitApi.operate>[0]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await gitApi.operate(op);
      if (res.success) {
        const statusOnly = op.action === 'add' || op.action === 'reset' || op.action === 'discard';
        await (statusOnly ? refreshStatusOnly() : refresh());
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

  /** AI 依据当前变更流式生成提交信息,逐增填充输入框(有暂存则暂存,否则未暂存) */
  const generateCommitMessage = async (): Promise<void> => {
    if (aiMsgLoading || !workspacePath || (stagedCount === 0 && unstagedEntries.length === 0)) return;
    setAiMsgLoading(true);
    setError(null);
    setCommitMsg('');
    try {
      await gitApi.commitMessage(workspacePath, (delta) => {
        setCommitMsg((prev) => prev + delta);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiMsgLoading(false);
    }
  };

  const checkout = (branch: string): void => {
    if (busy || branch === currentBranch) return;
    void runOperate({ action: 'checkout', path: workspacePath, branch });
  };

  /** 远端操作 fetch/pull/push;push 需当前分支,dangling HEAD 时禁用 */
  const runRemote = (action: 'fetch' | 'pull' | 'push'): void => {
    if (busy || (action === 'push' && !currentBranch)) return;
    setSyncOpen(false);
    setRemoteOp(action);
    void runOperate({
      action,
      path: workspacePath,
      branch: action === 'push' ? currentBranch : undefined,
    }).finally(() => setRemoteOp(null));
  };

  /** 分支下拉项:左键切换,右键弹分支操作菜单 */
  const openBranchCtx = (e: ReactMouseEvent, branch: string): void => {
    e.preventDefault();
    e.stopPropagation();
    setBranchCtx({ x: e.clientX, y: e.clientY, branch });
  };

  /** 分支右键菜单:重命名 / 删除(当前分支禁删) */
  const handleBranchMenu = (action: string): void => {
    const target = branchCtx;
    setBranchCtx(null);
    if (!target) return;
    if (action === 'rename') {
      setBranchInput({ mode: 'rename', branch: target.branch });
    } else if (action === 'delete') {
      setConfirm({
        title: t('git.deleteBranchTitle'),
        message: t('git.deleteBranchDesc', { branch: target.branch }),
        confirmLabel: t('git.deleteBranch'),
        onConfirm: () => void runOperate({ action: 'deleteBranch', path: workspacePath, branch: target.branch }),
      });
    }
  };

  /** 打开新建分支输入弹窗 */
  const openCreateBranchDialog = (): void => {
    setBranchOpen(false);
    setBranchInput({ mode: 'create' });
  };

  /** 新建/重命名分支输入弹窗提交 */
  const submitBranchInput = (name: string): void => {
    const target = branchInput;
    setBranchInput(null);
    if (!target || !name.trim()) return;
    if (target.mode === 'create') {
      void runOperate({ action: 'createBranch', path: workspacePath, newName: name.trim() });
    } else {
      void runOperate({ action: 'renameBranch', path: workspacePath, branch: target.branch, newName: name.trim() });
    }
  };

  const entries = status ?? [];
  const stagedEntries = useMemo(() => entries.filter(isStaged), [entries]);
  const unstagedEntries = useMemo(() => entries.filter(isUnstaged), [entries]);
  const stagedCount = stagedEntries.length;

  /** 变更行主按钮点击:打开对应 diff */
  const openWorktreeDiff = (e: GitStatusEntry): void => {
    openGitDiff(joinPath(workspacePath, e.path), { side: isStaged(e) ? 'staged' : 'worktree' });
  };

  /** 丢弃改动(变更行内按钮):走确认弹窗 */
  const discardEntry = (e: GitStatusEntry): void => {
    setConfirm({
      title: e.untracked ? t('git.discardDelTitle') : t('git.discardTitle'),
      message: e.untracked
        ? t('git.discardDelDesc', { path: e.path })
        : t('git.discardDesc', { path: e.path }),
      confirmLabel: e.untracked ? t('git.discardDelConfirm') : t('git.discard'),
      onConfirm: () => void runOperate({ action: 'discard', path: workspacePath, file: e.path }),
    });
  };

  const openCommitDiff = (entry: GitLogEntry): void => {
    openGitDiff(entry.hashFull || entry.hash, { side: 'commit', hash: entry.hashFull || entry.hash });
  };

  const openCtxMenu = (e: ReactMouseEvent, entry: GitStatusEntry): void => {
    e.preventDefault();
    e.stopPropagation();
    setLogMenu(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const openLogMenu = (e: ReactMouseEvent, entry: GitLogEntry): void => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);
    setLogMenu({ x: e.clientX, y: e.clientY, entry });
  };

  /** 变更行菜单:未跟踪文件 → 删除;否则 → 丢弃工作区改动 */
  const handleStatusMenu = (action: string): void => {
    const target = ctxMenu;
    setCtxMenu(null);
    if (!target) return;
    if (action === 'discard') {
      setConfirm({
        title: target.entry.untracked ? t('git.discardDelTitle') : t('git.discardTitle'),
        message: target.entry.untracked
          ? t('git.discardDelDesc', { path: target.entry.path })
          : t('git.discardDesc', { path: target.entry.path }),
        confirmLabel: target.entry.untracked ? t('git.discardDelConfirm') : t('git.discard'),
        onConfirm: () => void runOperate({ action: 'discard', path: workspacePath, file: target.entry.path }),
      });
    }
  };

  /** 历史行菜单:revert / cherry-pick */
  const handleLogMenu = (action: string): void => {
    const target = logMenu;
    setLogMenu(null);
    if (!target) return;
    const hash = target.entry.hashFull || target.entry.hash;
    if (action === 'revert') {
      setConfirm({
        title: t('git.revertTitle'),
        message: t('git.revertDesc', { subject: target.entry.subject }),
        confirmLabel: t('git.revert'),
        onConfirm: () => void runOperate({ action: 'revert', path: workspacePath, hash }),
      });
    } else if (action === 'cherryPick') {
      setConfirm({
        title: t('git.cherryPickTitle'),
        message: t('git.cherryPickDesc', { subject: target.entry.subject }),
        confirmLabel: t('git.cherryPick'),
        onConfirm: () => void runOperate({ action: 'cherryPick', path: workspacePath, hash }),
      });
    }
  };

  const confirmMessage = confirm?.message ?? '';

  if (!workspacePath) {
    return <div className="git-panel-empty">{t('git.notRepo')}</div>;
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <button
          type="button"
          className="git-panel-branch-trigger"
          ref={branchTriggerRef}
          title={t('git.manageBranch')}
          disabled={busy || !available}
          onClick={() => setBranchOpen((v) => !v)}
        >
          <span className="git-panel-branch-current">{currentBranch || t('git.noBranch')}</span>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
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
        <button
          type="button"
          className="git-panel-icon-btn git-panel-sync-btn"
          ref={syncTriggerRef}
          title={t('git.more')}
          aria-label={t('git.more')}
          disabled={busy || !available}
          onClick={() => { setSyncOpen((v) => !v); setBranchOpen(false); }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {/* 提交信息区(置于面板顶部,贴近 IDE 习惯) */}
      {!loading && available && (
        <div className="git-panel-commit">
          <div className="git-panel-commit-field">
            <textarea
              ref={commitMsgRef}
              className="git-panel-commit-input"
              rows={1}
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
              className="git-panel-icon-btn git-panel-ai-btn"
              title={t('git.commitMsgAI')}
              aria-label={t('git.commitMsgAI')}
              disabled={busy || aiMsgLoading || (stagedCount === 0 && unstagedEntries.length === 0)}
              onClick={() => void generateCommitMessage()}
            >
              {aiMsgLoading ? (
                <svg className="git-panel-ai-spin" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M13 8a5 5 0 1 1-1.5-3.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 2l1.2 3.2L12.5 6l-3.3.8L8 10l-1.2-3.2L3.5 6l3.3-.8L8 2zM12.5 11l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z" />
                </svg>
              )}
            </button>
          </div>
          <button
            type="button"
            className="git-panel-commit-btn"
            disabled={busy || commitMsg.trim() === '' || stagedCount === 0}
            onClick={commit}
          >
            {t('git.commit')}
          </button>
        </div>
      )}

      {loading && <div className="git-panel-placeholder">{t('git.loading')}</div>}
      {!loading && !available && <div className="git-panel-placeholder">{t('git.notRepo')}</div>}
      {!loading && error && <div className="git-panel-error">{error}</div>}

      {!loading && available && (
        <>
          {stagedCount > 0 && (
            <GitSection
              title={`${t('git.staged')} (${stagedCount})`}
              actionLabel={t('git.unstageAll')}
              onAction={() => stageAll(true)}
              disabled={busy}
            >
              {stagedEntries.map((e) => (
                <GitStatusRow
                  key={`s:${e.path}`}
                  entry={e}
                  busy={busy}
                  onOpen={() => openWorktreeDiff(e)}
                  onToggle={() => stageEntry(e)}
                  onDiscard={() => discardEntry(e)}
                  onContextMenu={(ev) => openCtxMenu(ev, e)}
                    toggleLabel={t('git.unstage')}
                />
              ))}
            </GitSection>
          )}

          {unstagedEntries.length > 0 && (
            <GitSection
              title={`${t('git.unstaged')} (${unstagedEntries.length})`}
              actionLabel={t('git.stageAll')}
              onAction={() => stageAll(false)}
              disabled={busy}
            >
              {unstagedEntries.map((e) => (
                <GitStatusRow
                  key={`u:${e.path}`}
                  entry={e}
                  busy={busy}
                  onOpen={() => openWorktreeDiff(e)}
                  onToggle={() => stageEntry(e)}
                  onDiscard={() => discardEntry(e)}
                  onContextMenu={(ev) => openCtxMenu(ev, e)}
                    toggleLabel={t('git.stage')}
                />
              ))}
            </GitSection>
          )}

          <GitSection title={t('git.history')} collapsible defaultCollapsed>
            {log.map((entry) => (
              <div
                key={entry.hashFull || entry.hash}
                role="button"
                tabIndex={0}
                className="git-panel-log-row"
                title={`${entry.author} · ${entry.hashFull}${entry.refs ? ` (${entry.refs})` : ''}`}
                onClick={() => openCommitDiff(entry)}
                onContextMenu={(e) => openLogMenu(e, entry)}
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

      {/* 右键菜单(portal 到 body,避免面板 overflow 裁剪) */}
      {ctxMenu && createPortal(
        <GitContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: ctxMenu.entry.untracked ? t('git.discardDelLabel') : t('git.discard'), action: 'discard', danger: true },
          ]}
          onSelect={handleStatusMenu}
          onClose={closeMenus}
        />,
        document.body,
      )}
      {logMenu && createPortal(
        <GitContextMenu
          x={logMenu.x}
          y={logMenu.y}
          items={[
            { label: t('git.revert'), action: 'revert', danger: true },
            { label: t('git.cherryPick'), action: 'cherryPick', danger: true },
          ]}
          onSelect={handleLogMenu}
          onClose={closeMenus}
        />,
        document.body,
      )}

      {/* 分支下拉(portal 到 body,避免面板 overflow 裁剪) */}
      {branchOpen && available && (
        <BranchDropdown
          triggerRef={branchTriggerRef}
          currentBranch={currentBranch}
          names={branchNames}
          remotes={remoteBranchNames}
          onCheckout={checkout}
          onOpenBranchCtx={openBranchCtx}
          onCreate={openCreateBranchDialog}
          onClose={() => setBranchOpen(false)}
        />
      )}
      {/* 同步(远端操作)菜单 */}
      {syncOpen && available && !busy && (
        <SyncMenu
          triggerRef={syncTriggerRef}
          remoteOp={remoteOp}
          pushDisabled={!currentBranch}
          onSelect={runRemote}
          onClose={() => setSyncOpen(false)}
        />
      )}
      {/* 分支项右键菜单:重命名 / 删除(当前分支禁删) */}
      {branchCtx && createPortal(
        <GitContextMenu
          x={branchCtx.x}
          y={branchCtx.y}
          items={[
            { label: t('git.renameBranch'), action: 'rename', danger: false },
            ...(branchCtx.branch !== currentBranch
              ? [{ label: t('git.deleteBranch'), action: 'delete', danger: true }]
              : []),
          ]}
          onSelect={handleBranchMenu}
          onClose={() => setBranchCtx(null)}
        />,
        document.body,
      )}
      {/* 分支新建/重命名输入弹窗 */}
      {branchInput && (
        <InputDialog
          title={branchInput.mode === 'create' ? t('git.newBranchTitle') : t('git.renameBranchTitle')}
          placeholder={t('git.branchPlaceholder')}
          initialValue={branchInput.mode === 'rename' ? branchInput.branch ?? '' : ''}
          submitLabel={branchInput.mode === 'create' ? t('git.createBtn') : t('git.renameBtn')}
          onCancel={() => setBranchInput(null)}
          onSubmit={submitBranchInput}
        />
      )}

      {/* 危险操作确认弹窗(复用 file-tree-modal-* 样式) */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirmMessage}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const pending = confirm;
            setConfirm(null);
            pending.onConfirm();
          }}
        />
      )}
    </div>
  );
}

/** 分组区块(标题 + 可选右侧操作);collapsible 时标题可点击收起/展开内容 */
function GitSection({
  title,
  actionLabel,
  onAction,
  disabled,
  collapsible = false,
  defaultCollapsed = false,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const toggle = (): void => setOpen((v) => !v);
  return (
    <div className="git-panel-section">
      <div
        className={`git-panel-section-header${collapsible ? ' collapsible' : ''}`}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        title={collapsible ? (open ? '' : undefined) : undefined}
        onClick={collapsible ? toggle : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        } : undefined}
      >
        <span className="git-panel-section-title">{title}</span>
        {collapsible && (
          <svg
            className="git-panel-section-caret"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
          </svg>
        )}
        {actionLabel && onAction && (
          <button type="button" className="git-panel-link" disabled={disabled} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {(!collapsible || open) && children}
    </div>
  );
}

/** 单条变更行:彩色图标 + 路径,点击开 diff;悬浮显示丢弃/暂存按钮;状态徽章置于行尾 */
function GitStatusRow({
  entry,
  busy,
  onOpen,
  onToggle,
  onDiscard,
  onContextMenu,
  toggleLabel,
}: {
  entry: GitStatusEntry;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDiscard: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  toggleLabel: string;
}) {
  const { t } = useI18n();
  const badge = badgeOf(entry);
  const badgeClass =
    badge === '+' ? 'add' : badge === 'D' ? 'del' : badge === '?' ? 'new' : 'mod';
  // 文件路径拆为「文件名」+「目录前缀」,文件名为主视觉,目录弱化显示在后
  const slash = entry.path.lastIndexOf('/');
  const fileName = slash >= 0 ? entry.path.slice(slash + 1) : entry.path;
  const dirName = slash >= 0 ? entry.path.slice(0, slash) : '';
  return (
    <div className="git-panel-row">
      <button
        type="button"
        className="git-panel-row-main"
        title={entry.path}
        onClick={onOpen}
        onContextMenu={onContextMenu}
      >
        <FileTypeIcon fileName={entry.path} size={14} className="git-panel-file-icon" />
        <span className="git-panel-name" title={entry.path}>{fileName}</span>
        {dirName && (
          <span className="git-panel-dir" title={entry.path}>{dirName}/</span>
        )}
      </button>
      <span className="git-panel-row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="git-panel-icon-btn git-panel-discard-btn"
          title={t('git.discard')}
          aria-label={t('git.discard')}
          disabled={busy}
          onClick={onDiscard}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9h6.8l.6-9M6.5 7v3.5M9.5 7v3.5" />
          </svg>
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
      </span>
      <span className={`git-panel-badge ${badgeClass}`}>{badge}</span>
    </div>
  );
}

/** 右键菜单项 */
interface CtxItem {
  label: string;
  action: string;
  danger?: boolean;
}

/** 右键菜单(复用 file-tree-context-* 样式,portal 渲染;点击外部关闭) */
function GitContextMenu({
  x,
  y,
  items,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  items: CtxItem[];
  onSelect: (action: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDown = () => onClose();
    // 延迟一帧绑定,避免本次右键冒泡立即关闭
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      className="file-tree-context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.action}
          className={`file-tree-context-item${item.danger ? ' danger' : ''}`}
          onClick={() => onSelect(item.action)}
        >
          <span className="file-tree-context-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 危险操作确认弹窗(复用 file-tree-modal-* 样式) */
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
      else if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <p className="file-tree-modal-message">{message}</p>
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onCancel}>
            {t('fileTree.cancelBtn')}
          </button>
          <button
            type="button"
            className="file-tree-modal-btn file-tree-modal-btn-danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 分支下拉列表(portal 到 body,定位在分支触发器下方;顶部过滤、本地/远端分组、底部新建) */
function BranchDropdown({
  triggerRef,
  currentBranch,
  names,
  remotes,
  onCheckout,
  onOpenBranchCtx,
  onCreate,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  currentBranch: string;
  names: string[];
  remotes: string[];
  onCheckout: (branch: string) => void;
  onOpenBranchCtx: (e: ReactMouseEvent, branch: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: el.offsetWidth });
    }
  }, [triggerRef]);

  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      // 左键/触屏关闭;右键(button=2)保留以弹分支项菜单
      if (ev.button !== 2) onClose();
    };
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  if (!pos) return null;
  const q = filter.trim().toLowerCase();
  // 当前分支缺失于 names 时并入(HEAD 游离时也让它可见);但 currentBranch 为空(detached)时不插入空项
  const local = currentBranch
    ? (names.includes(currentBranch) ? names : [currentBranch, ...names])
    : names;
  const localFiltered = q ? local.filter((b) => b.toLowerCase().includes(q)) : local;
  const remoteFiltered = q ? remotes.filter((r) => r.toLowerCase().includes(q)) : remotes;
  const showRemoteGroup = remoteFiltered.length > 0;
  return createPortal(
    <div
      className="file-tree-context-menu git-panel-branch-list"
      style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        className="git-panel-branch-filter"
        placeholder={t('git.branchFilter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {localFiltered.length === 0 && !showRemoteGroup ? (
        <div className="git-panel-branch-list-empty">{t('git.branchNoMatch')}</div>
      ) : (
        <>
          {localFiltered.map((b) => (
            <div
              key={b}
              className={`git-panel-branch-list-item${b === currentBranch ? ' current' : ''}`}
              title={b}
              onClick={() => {
                if (b !== currentBranch) onCheckout(b);
              }}
              onContextMenu={(e) => onOpenBranchCtx(e, b)}
            >
              <span className="git-panel-branch-list-name">{b}</span>
              {b === currentBranch && <span className="git-panel-branch-list-check">✓</span>}
            </div>
          ))}
          {showRemoteGroup && (
            <div className="git-panel-branch-list-grp">{t('git.branchRemote')}</div>
          )}
          {remoteFiltered.map((b) => (
            <div
              key={b}
              className="git-panel-branch-list-item"
              title={b}
              onClick={() => onCheckout(b)}
            >
              <span className="git-panel-branch-list-name">{b}</span>
            </div>
          ))}
        </>
      )}
      <div className="git-panel-branch-list-new" onClick={onCreate}>
        <span>{t('git.newBranch')}</span>
      </div>
    </div>,
    document.body,
  );
}

/** 同步(远端操作)菜单:拉取 / 拉取合并 / 推送(portal 到 body) */
function SyncMenu({
  triggerRef,
  remoteOp,
  pushDisabled,
  onSelect,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  remoteOp: 'fetch' | 'pull' | 'push' | null;
  pushDisabled: boolean;
  onSelect: (action: 'fetch' | 'pull' | 'push') => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: el.offsetWidth });
    }
  }, [triggerRef]);

  useEffect(() => {
    const onDown = () => onClose();
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  if (!pos) return null;
  const items = [
    { action: 'fetch' as const, label: t('git.fetch'), disabled: false },
    { action: 'pull' as const, label: t('git.pull'), disabled: false },
    { action: 'push' as const, label: t('git.push'), disabled: pushDisabled },
  ];
  return createPortal(
    <div
      className="file-tree-context-menu git-panel-sync-menu"
      style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.action}
          className={`git-panel-sync-item${item.disabled ? ' disabled' : ''}`}
          onClick={() => {
            if (!item.disabled) onSelect(item.action);
          }}
        >
          <span className="file-tree-context-label">
            {remoteOp === item.action ? `${t('git.loading')}…` : item.label}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** 新建/重命名分支输入弹窗(复用 file-tree-modal-* 样式) */
function InputDialog({
  title,
  placeholder,
  initialValue,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  initialValue: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const { t } = useI18n();
  const [val, setVal] = useState(initialValue);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onSubmit(val);
      else if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <input
            autoFocus
            className="git-panel-input"
            value={val}
            placeholder={placeholder}
            onChange={(e) => setVal(e.target.value)}
          />
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onCancel}>
            {t('fileTree.cancelBtn')}
          </button>
          <button
            type="button"
            className="file-tree-modal-btn file-tree-modal-btn-danger"
            disabled={!val.trim()}
            onClick={() => onSubmit(val.trim())}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}