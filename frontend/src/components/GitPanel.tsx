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
 *   - 提交历史懒加载分页,行内展示 subject + refs + 相对时间;悬浮行显示完整详情卡片(短 hash/作者/相对+绝对时间/refs)
 *   - 点击变更文件 → Preview 区打开对应 git diff(worktree/staged)
 *   - 点击历史提交 → Preview 区打开该提交的全量 diff
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { gitApi, type GitLogEntry, type GitStatusEntry } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import type { Lang } from '@/i18n/messages';
import { on } from '@/utils/eventBus';
import { gitBadgeKindOf, gitBadgeLetter } from '@/utils/git-status';
import { showToast } from '@/utils/toastStore';
import { FileTypeIcon } from './FileTypeIcon';
import { GitDiffView } from './workspace/GitDiffView';
import './GitPanel.css';

/** git 历史分批加载数量(懒加载分页) */
const LOG_BATCH = 20;

/** 提交信息草稿(模块级):面板随 ActivityBar 关闭/切换而卸载时保留已写内容,重开恢复 */
let commitDraft = '';

/**
 * 面板数据快照(模块级):GitPanel 随 ActivityBar 面板关闭而整体卸载,状态归零,
 * 重开后 effect 里的 refresh() 会先置 loading 导致整面板闪一下"加载中"。
 * 这里把已拉取的数据存在模块级,重开时作首帧数据,刷新改为后台静默替换。
 */
interface GitPanelSnapshot {
  /** 快照归属的工作区;与当前工作区不一致时整份作废(避免串仓库数据) */
  workspacePath: string;
  status: GitStatusEntry[] | null;
  available: boolean;
  branchNames: string[];
  remoteBranchNames: string[];
  currentBranch: string;
  log: GitLogEntry[];
  logEnded: boolean;
}

let panelSnapshot: GitPanelSnapshot | null = null;

/** 仅供测试:重置面板快照与提交草稿,避免用例间相互污染(对齐 MetricsPanel 的 __reset 惯例) */
export function __resetGitPanelSnapshot(): void {
  panelSnapshot = null;
  commitDraft = '';
}

/** 按 XY 状态段判断某条目应归入已暂存分组 */
function isStaged(e: GitStatusEntry): boolean {
  return e.staged;
}

/** 归入未暂存分组(含未跟踪 ?? 文件) */
function isUnstaged(e: GitStatusEntry): boolean {
  return e.unstaged || e.untracked;
}

/** 拼接工作区根路径 + 相对路径 */
function joinPath(root: string, file: string): string {
  if (!root) return file;
  return root.replace(/\\+$/, '') + '/' + file;
}

/** 相对时间(语言中性:s/m/h/d) —— 列表行内紧凑展示用 */
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

/** 相对时间(本地化文本,如「12分钟前」/「12 minutes ago」)—— 悬浮卡片用 */
function relativeTimeText(iso: string, lang: Lang): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', { numeric: 'always' });
  if (sec < 60) return rtf.format(-sec, 'second');
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hour = Math.floor(min / 60);
  if (hour < 24) return rtf.format(-hour, 'hour');
  const day = Math.floor(hour / 24);
  if (day < 30) return rtf.format(-day, 'day');
  const month = Math.floor(day / 30);
  if (month < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.floor(month / 12), 'year');
}

/** 绝对时间(本地化,如「2026年9月12日 23:52」)—— 悬浮卡片用 */
function absoluteTimeText(iso: string, lang: Lang): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
}

/** 历史行引用标记(由 git log %D 解析) */
interface LogRef {
  label: string;
  /** head=本地分支/HEAD, remote=远端分支, tag=标签 */
  kind: 'head' | 'remote' | 'tag';
}

/** 解析 git log %D,如「HEAD -> main, origin/main, tag: v1.0」 */
function parseRefs(refs: string): LogRef[] {
  if (!refs) return [];
  const out: LogRef[] = [];
  for (const raw of refs.split(',')) {
    let s = raw.trim();
    if (!s) continue;
    let kind: LogRef['kind'] = 'head';
    if (s.startsWith('HEAD -> ')) {
      s = s.slice('HEAD -> '.length).trim();
    } else if (s === 'HEAD') {
      kind = 'head';
    } else if (s.startsWith('tag: ')) {
      s = s.slice('tag: '.length).trim();
      kind = 'tag';
    } else if (s.includes('/')) {
      kind = 'remote';
    }
    if (s) out.push({ label: s, kind });
  }
  return out;
}

/** 悬浮卡片显示延迟(ms):快速划过列表时不闪烁 */
const LOG_TIP_DELAY = 400;

/** 悬浮卡片与列表行的间距(px) */
const LOG_TIP_GAP = 8;

/** 提交正文请求超时(ms):超时按"无正文"展示卡片,避免悬停后长时间无反馈 */
const LOG_BODY_TIMEOUT = 1500;

export function GitPanel() {
  const { t, lang } = useI18n();
  const workspacePath = useAppStore((s) => s.workspacePath);
  const openGitDiff = usePreviewStore((s) => s.openGitDiff);

  // 重开面板时以同一工作区的快照作首帧数据:有数据就直接渲染,刷新在后台静默替换,
  // 避免先闪一下"加载中"。快照缺失(首次打开/换了项目)时才走占位。
  const cached = panelSnapshot && panelSnapshot.workspacePath === workspacePath ? panelSnapshot : null;

  const [status, setStatus] = useState<GitStatusEntry[] | null>(cached?.status ?? null);
  const [available, setAvailable] = useState(cached?.available ?? true);
  const [branchNames, setBranchNames] = useState<string[]>(cached?.branchNames ?? []);
  const [remoteBranchNames, setRemoteBranchNames] = useState<string[]>(cached?.remoteBranchNames ?? []);
  const [currentBranch, setCurrentBranch] = useState(cached?.currentBranch ?? '');
  const [log, setLog] = useState<GitLogEntry[]>(cached?.log ?? []);
  const [logEnded, setLogEnded] = useState(cached?.logEnded ?? false);
  const [logLoadingMore, setLogLoadingMore] = useState(false);
  /** 当前在行内展开 diff 的提交 hash(null = 全部收起) */
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
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
  /** 新建/重命名分支输入弹窗;startPoint 仅新建时使用(缺省基于当前 HEAD) */
  const [branchInput, setBranchInput] = useState<{
    mode: 'create' | 'rename';
    branch?: string;
    startPoint?: string;
  } | null>(null);
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
  /** AI 流式生成提交信息的中止控制器:面板卸载时中止,避免卸载后继续写入 */
  const aiAbortRef = useRef<AbortController | null>(null);
  /** 同步(远端操作)按钮引用,用于菜单定位 */
  const syncTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** 远端操作菜单是否展开 */
  const [syncOpen, setSyncOpen] = useState(false);
  /** 历史行悬浮详情卡片(portal 到 body,fixed 定位) */
  const [logTip, setLogTip] = useState<{
    entry: GitLogEntry;
    /** 提交正文(多行,已 trim);取不到或超时为空串 */
    body: string;
    top: number;
    left: number;
    /** 行左边界:右侧空间不足时用于向左翻转 */
    anchorLeft: number;
  } | null>(null);
  /** 悬浮卡片 DOM 引用,用于渲染后测量尺寸并校正溢出 */
  const logTipRef = useRef<HTMLDivElement | null>(null);
  /** 悬浮卡片延迟显示定时器 */
  const logTipTimerRef = useRef<number | null>(null);
  /**
   * 提交正文缓存(hash → body)。提交不可变:同一 hash 内容永远相同,故缓存不会失效,
   * 无需任何过期策略。空串表示"取过但无正文/失败",避免反复请求。
   */
  const logBodyCacheRef = useRef<Map<string, string>>(new Map());
  /** 悬浮请求序号:仅最新一次悬停的结果可落地,避免快速划过时旧响应覆盖当前卡片 */
  const logTipSeqRef = useRef(0);

  /**
   * 是否需要整面板加载占位:仅"没有可渲染数据且非错误态"时显示。
   *  - 重开面板:快照已回填 status(非 null),刷新在后台静默替换,不再闪"加载中";
   *  - 首次打开:status 为 null,首帧即进入占位,不会先闪一个空面板;
   *  - 加载失败:交给下方 error 渲染,不占用位。
   */
  const showLoading = status === null && !error;

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
      // 卸载时中止在途的 AI 流:否则增量回来会对已卸载组件 setState(落空),
      // 且请求继续占用连接直到流结束
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
    };
  }, []);

  /** 上一次的工作区路径:用于识别"切换了项目"这一变化(首帧不算) */
  const prevPathRef = useRef(workspacePath);

  // 切换工作区:旧仓库数据立即失效。面板此时可能并未卸载(固定在 ActivityBar 上),
  // 若不清理会短暂展示上一个仓库的变更;清空后由下方的 refresh 重新拉取。
  useEffect(() => {
    if (prevPathRef.current === workspacePath) return;
    prevPathRef.current = workspacePath;
    setStatus(null);
    setAvailable(true);
    setBranchNames([]);
    setRemoteBranchNames([]);
    setCurrentBranch('');
    setLog([]);
    setLogEnded(false);
    setError(null);
  }, [workspacePath]);

  // 提交信息 textarea 随内容自动增高(流式填充时也能实时变高)
  // 依赖 showLoading:首帧无数据时提交区不渲染,数据返回后提交区才挂载,
  // 需在挂载那一帧重新测量高度,否则草稿多行却显示成一行。
  useEffect(() => {
    const el = commitMsgRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [commitMsg, showLoading]);

  // 提交信息同步到模块级草稿,面板卸载后重开仍保留
  useEffect(() => {
    commitDraft = commitMsg;
  }, [commitMsg]);

  /**
   * 写回模块级快照:面板卸载后重开时作首帧数据。
   * 只传入本次真正变化的字段(其余沿用同一工作区的旧快照),避免额外状态搬运。
   */
  const saveSnapshot = useCallback(
    (patch: Partial<Omit<GitPanelSnapshot, 'workspacePath'>>) => {
      const base = panelSnapshot && panelSnapshot.workspacePath === workspacePath ? panelSnapshot : null;
      panelSnapshot = {
        workspacePath,
        status: patch.status ?? base?.status ?? null,
        available: patch.available ?? base?.available ?? true,
        branchNames: patch.branchNames ?? base?.branchNames ?? [],
        remoteBranchNames: patch.remoteBranchNames ?? base?.remoteBranchNames ?? [],
        currentBranch: patch.currentBranch ?? base?.currentBranch ?? '',
        log: patch.log ?? base?.log ?? [],
        logEnded: patch.logEnded ?? base?.logEnded ?? false,
      };
    },
    [workspacePath],
  );

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
        const nextLog = logResult.entries ?? [];
        const nextLogEnded = nextLog.length < LOG_BATCH;
        // 先写快照:即便请求返回时面板已被关闭,数据也不丢,下次打开可直接复用
        saveSnapshot({
          status: statusResult.entries ?? [],
          available: statusResult.available,
          branchNames: branchResult.names,
          remoteBranchNames: branchResult.remotes ?? [],
          currentBranch: branchResult.current,
          log: nextLog,
          logEnded: nextLogEnded,
        });
        if (!mountedRef.current) return;
        setAvailable(statusResult.available);
        setStatus(statusResult.entries ?? []);
        setCurrentBranch(branchResult.current);
        setBranchNames(branchResult.names);
        setRemoteBranchNames(branchResult.remotes ?? []);
        setLog(nextLog);
        setLogEnded(nextLogEnded);
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [workspacePath, saveSnapshot],
  );

  /** 仅刷新 git 状态(静默,不触发 loading 占位):供暂存/暂存批操作等不影响分支与历史的场景 */
  const refreshStatusOnly = useCallback(async () => {
      if (!workspacePath) return;
      try {
        const statusResult = await gitApi.status(workspacePath);
        // 同样先写快照(AI 自动刷新期间面板可能已被关闭)
        saveSnapshot({ status: statusResult.entries ?? [], available: statusResult.available });
        if (!mountedRef.current) return;
        setAvailable(statusResult.available);
        setStatus(statusResult.entries ?? []);
        setError(null);
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [workspacePath, saveSnapshot],
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
      const nextEntries = next.entries ?? [];
      const merged = [...log, ...nextEntries];
      const ended = logEnded || nextEntries.length < LOG_BATCH;
      // 先写快照,面板若已关闭也不会丢这批数据
      saveSnapshot({ log: merged, logEnded: ended });
      if (!mountedRef.current) return;
      setLog(merged);
      if (ended) setLogEnded(true);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLogLoadingMore(false);
    }
  };

  /** 执行写操作后刷新;失败弹 toast(不自动关闭)。暂存类操作只刷新状态,其余操作全量刷新 */
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
      showToast(res.error || t('git.commitFailed'), { type: 'error', duration: 0 });
      return false;
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { type: 'error', duration: 0 });
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

  /**
   * 写入提交信息:同步写穿模块级草稿。
   * 草稿只跟随"用户/流程的显式意图",不靠 effect 兜底 —— effect 在组件卸载后不再执行,
   * 若清空只走 setState(如提交成功回调),面板已关闭时就会落空,旧文案残留在草稿里重开复活。
   */
  const writeCommitMsg = (value: string): void => {
    commitDraft = value;
    setCommitMsg(value);
  };

  const commit = (): void => {
    const msg = commitMsg.trim();
    if (busy || msg === '' || stagedCount === 0) return;
    // 乐观清空:不等 runOperate 内部那轮 status/branch/log 刷新回来(仓库大时会明显迟滞)
    writeCommitMsg('');
    void runOperate({ action: 'commit', path: workspacePath, message: msg }).then((ok) => {
      if (!ok) writeCommitMsg(msg); // 失败(hook 拒绝/无变更等)回填,避免用户重打
      if (ok) showToast(t('git.commitSuccess'), { type: 'success' });
    });
  };

  /** AI 依据当前变更流式生成提交信息,逐增填充输入框(有暂存则暂存,否则未暂存) */
  const generateCommitMessage = async (): Promise<void> => {
    if (aiMsgLoading || !workspacePath || (stagedCount === 0 && unstagedEntries.length === 0)) return;
    setAiMsgLoading(true);
    setError(null);
    writeCommitMsg('');
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      await gitApi.commitMessage(
        workspacePath,
        (delta) => setCommitMsg((prev) => prev + delta),
        controller.signal,
      );
    } catch (e) {
      // 面板卸载引发的中止不是错误,不弹提示;已生成的片段保留在草稿里
      if (!controller.signal.aborted && mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      if (mountedRef.current) setAiMsgLoading(false);
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
    })
      .then((ok) => {
        if (ok) showToast({ fetch: t('git.fetchSuccess'), pull: t('git.pullSuccess'), push: t('git.pushSuccess') }[action], { type: 'success' });
      })
      .finally(() => setRemoteOp(null));
  };

  /** 分支下拉项:左键切换,右键弹分支操作菜单 */
  const openBranchCtx = (e: ReactMouseEvent, branch: string): void => {
    e.preventDefault();
    e.stopPropagation();
    setBranchCtx({ x: e.clientX, y: e.clientY, branch });
  };

  /** 分支右键菜单:基于此新建 / 重命名 / 删除(当前分支禁删) */
  const handleBranchMenu = (action: string): void => {
    const target = branchCtx;
    setBranchCtx(null);
    if (!target) return;
    if (action === 'createFrom') {
      setBranchInput({ mode: 'create', startPoint: target.branch });
    } else if (action === 'rename') {
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
      // 带 startPoint 时以该分支/远端分支为起点(后端 createBranch 支持可选起始点)
      void runOperate({
        action: 'createBranch',
        path: workspacePath,
        newName: name.trim(),
        branch: target.startPoint,
      });
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

  /**
   * 点击历史行:在该行下方内联展开/收起该提交的 diff(IDE 源码管理面板常用交互),
   * 不再跳转独立标签页。同一时刻仅展开一行,展开新行自动收起旧行。
   */
  const toggleCommitDiff = (entry: GitLogEntry): void => {
    const key = entry.hashFull || entry.hash;
    setExpandedHash((prev) => (prev === key ? null : key));
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

  /** 取消待显示的悬浮卡片定时器 */
  const clearLogTipTimer = useCallback(() => {
    if (logTipTimerRef.current !== null) {
      window.clearTimeout(logTipTimerRef.current);
      logTipTimerRef.current = null;
    }
  }, []);

  /** 隐藏历史行悬浮卡片 */
  const hideLogTip = useCallback(() => {
    clearLogTipTimer();
    // 递增序号使在途请求作废:鼠标已移开,响应回来不应再弹出卡片
    logTipSeqRef.current += 1;
    setLogTip(null);
  }, [clearLogTipTimer]);

  /**
   * 显示历史行悬浮卡片。
   * 鼠标进入用延迟(LOG_TIP_DELAY)避免快速划过列表时闪烁;键盘 focus 传 0 立即显示。
   * 位置取行右边缘外侧,超出视口时由下方 useLayoutEffect 校正。
   *
   * 正文与卡片同时出现(而非先弹卡片再撑高),避免高度突变造成跳动;
   * 因此延迟到点后先查缓存,未命中则请求,拿到结果才渲染卡片。
   * 请求异常/超时(LOG_BODY_TIMEOUT)按"无正文"展示并写入空串缓存,不阻塞卡片。
   */
  const showLogTip = useCallback(
    (el: HTMLElement, entry: GitLogEntry, delay: number) => {
      clearLogTipTimer();
      const seq = ++logTipSeqRef.current;
      const key = entry.hashFull || entry.hash;
      logTipTimerRef.current = window.setTimeout(() => {
        logTipTimerRef.current = null;
        // 期间鼠标已移开或已移到别的行:丢弃本次
        if (logTipSeqRef.current !== seq) return;
        // 位置在真正落地时才测量:正文请求往返期间列表可能已滚动,旧 rect 会失准
        const place = (body: string) => {
          if (logTipSeqRef.current !== seq) return;
          const rect = el.getBoundingClientRect();
          setLogTip({
            entry,
            body,
            top: rect.top,
            left: rect.right + LOG_TIP_GAP,
            anchorLeft: rect.left,
          });
        };

        const cached = logBodyCacheRef.current.get(key);
        if (cached !== undefined) {
          place(cached);
          return;
        }

        let settled = false;
        const timeoutTimer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          logBodyCacheRef.current.set(key, '');
          place('');
        }, LOG_BODY_TIMEOUT);
        void gitApi
          .commitBody(workspacePath, key)
          .then((res) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutTimer);
            const body = res.body ?? '';
            logBodyCacheRef.current.set(key, body);
            place(body);
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutTimer);
            logBodyCacheRef.current.set(key, '');
            place('');
          });
      }, delay);
    },
    [clearLogTipTimer, workspacePath],
  );

  /** 面板滚动/窗口缩放时关闭卡片:卡片是 fixed 定位,不随内容移动,留着会飘在错误位置 */
  useEffect(() => {
    if (!logTip) return;
    const close = () => setLogTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [logTip]);

  /** 卸载时清理未触发的延迟定时器 */
  useEffect(() => () => clearLogTipTimer(), [clearLogTipTimer]);

  /** 渲染后测量卡片尺寸:右侧空间不足则翻到行左侧,底部越界则上移,避免溢出视口 */
  useLayoutEffect(() => {
    const el = logTipRef.current;
    if (!logTip || !el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const maxLeft = window.innerWidth - w - LOG_TIP_GAP;
    const nextLeft =
      logTip.left > maxLeft
        ? Math.max(LOG_TIP_GAP, logTip.anchorLeft - w - LOG_TIP_GAP)
        : logTip.left;
    const nextTop = Math.min(logTip.top, Math.max(LOG_TIP_GAP, window.innerHeight - h - LOG_TIP_GAP));
    if (nextLeft !== logTip.left || nextTop !== logTip.top) {
      setLogTip((prev) => (prev ? { ...prev, left: nextLeft, top: nextTop } : prev));
    }
  }, [logTip]);

  /** 当前卡片引用的分支/标签标记(卡片未显示时为空数组) */
  const logTipRefs = useMemo(() => (logTip ? parseRefs(logTip.entry.refs) : []), [logTip]);

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
          disabled={loading}
          onClick={() => void refresh()}
        >
          <svg className={loading ? 'git-panel-spin' : undefined} viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
          aria-label={remoteOp ? t('git.loading') : t('git.more')}
          disabled={busy || !available}
          onClick={() => { setSyncOpen((v) => !v); setBranchOpen(false); }}
        >
          {remoteOp ? (
            <span className="git-panel-btn-spin" role="status" aria-label={t('git.loading')} />
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          )}
        </button>
      </div>

      {/* 提交信息区(置于面板顶部,贴近 IDE 习惯) */}
      {!showLoading && available && (
        <div className="git-panel-commit">
          <div className="git-panel-commit-field">
            <textarea
              ref={commitMsgRef}
              className="git-panel-commit-input"
              rows={1}
              placeholder={t('git.commitPlaceholder')}
              value={commitMsg}
              disabled={busy}
              // 关闭浏览器原生拼写/语法检查(默认开启):提交信息常含术语/缩写/中英混排,
              // 红线纯属噪音,与项目其它输入框(设置页/搜索框等)保持一致
              spellCheck={false}
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
            {busy ? <span className="git-panel-btn-spin" role="status" aria-label={t('git.loading')} /> : t('git.commit')}
          </button>
        </div>
      )}

      {showLoading && <div className="git-panel-placeholder">{t('git.loading')}</div>}
      {!showLoading && !available && <div className="git-panel-placeholder">{t('git.notRepo')}</div>}
      {!showLoading && error && <div className="git-panel-error">{error}</div>}

      {!showLoading && available && (
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

          <GitSection title={t('git.history')} collapsible defaultCollapsed storageKey="gitPanel.historyOpen" divider>
            {log.map((entry) => {
              const hashKey = entry.hashFull || entry.hash;
              return (
                <Fragment key={hashKey}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`git-panel-log-row${expandedHash === hashKey ? ' expanded' : ''}`}
                    onClick={() => toggleCommitDiff(entry)}
                    onContextMenu={(e) => openLogMenu(e, entry)}
                    onMouseEnter={(e) => showLogTip(e.currentTarget, entry, LOG_TIP_DELAY)}
                    onMouseLeave={hideLogTip}
                    onFocus={(e) => showLogTip(e.currentTarget, entry, 0)}
                    onBlur={hideLogTip}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCommitDiff(entry);
                      }
                    }}
                  >
                    <span className="git-panel-log-subject">{entry.subject}</span>
                    {entry.refs && <span className="git-panel-log-ref">{entry.refs}</span>}
                    <span className="git-panel-log-time">{relativeTime(entry.date)}</span>
                  </div>
                  {expandedHash === hashKey && (
                    <div className="git-panel-log-expand">
                      <GitDiffView filePath={hashKey} side="commit" hash={hashKey} bare />
                    </div>
                  )}
                </Fragment>
              );
            })}
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

      {/* 历史行悬浮详情卡片(portal 到 body,避免面板 overflow 裁剪;纯展示不拦截事件) */}
      {logTip && createPortal(
        <div
          ref={logTipRef}
          className="git-panel-log-tip"
          role="tooltip"
          style={{ left: logTip.left, top: logTip.top }}
        >
          <div className="git-panel-log-tip-meta">
            <span className="git-panel-log-tip-author">{logTip.entry.author}</span>
            <span className="git-panel-log-tip-time">
              {relativeTimeText(logTip.entry.date, lang)}
              <span className="git-panel-log-tip-abs">{absoluteTimeText(logTip.entry.date, lang)}</span>
            </span>
            <span className="git-panel-log-tip-hash" title={logTip.entry.hashFull}>{logTip.entry.hash}</span>
          </div>
          <div className="git-panel-log-tip-subject">{logTip.entry.subject}</div>
          {logTip.body && <div className="git-panel-log-tip-body">{logTip.body}</div>}
          {logTipRefs.length > 0 && (
            <div className="git-panel-log-tip-refs">
              {logTipRefs.map((r) => (
                <span key={r.label} className={`git-panel-log-tip-ref kind-${r.kind}`}>
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>,
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
      {/* 分支项右键菜单:基于此新建 / 重命名 / 删除(当前分支禁删) */}
      {branchCtx && createPortal(
        <GitContextMenu
          x={branchCtx.x}
          y={branchCtx.y}
          items={[
            { label: t('git.newBranchFrom'), action: 'createFrom', danger: false },
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
          // 新建时提示起始点:显式选择的分支,否则当前 HEAD(git branch <name> 的默认语义)
          hint={
            branchInput.mode === 'create'
              ? t('git.branchFromHint', {
                  branch: branchInput.startPoint || t('git.branchFromHead'),
                })
              : undefined
          }
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
  storageKey,
  divider = false,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** 提供时折叠状态持久化到 localStorage,重开面板/刷新后保持一致;缺省仅当前会话生效 */
  storageKey?: string;
  /** 分组上方加细分隔线+间距,用于与语义不同的区块(如历史 vs 当前变更)区隔 */
  divider?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) return stored === '1';
      } catch {
        /* localStorage 不可用(隐私模式等)时退回默认状态 */
      }
    }
    return !defaultCollapsed;
  });
  const toggle = (): void => {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? '1' : '0');
        } catch {
          /* 忽略写入失败 */
        }
      }
      return next;
    });
  };
  return (
    <div className={`git-panel-section${divider ? ' git-panel-section--divider' : ''}`}>
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
  // 字母与配色统一由 utils/git-status 给出(与文件树共用同一套规则)
  const badge = gitBadgeLetter(entry);
  const badgeKind = gitBadgeKindOf(entry);
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
      <span className={`git-panel-badge ${badgeKind}`}>{badge}</span>
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
        // 分支名非自然语言,关闭浏览器原生拼写检查避免误划红线(与项目其它输入框一致)
        spellCheck={false}
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
    // 点击菜单内部不关闭,避免 pointerdown 先关掉菜单导致 item 的 click 落空
    const onDown = (e: PointerEvent) => {
      const el = document.querySelector('.git-panel-sync-menu');
      if (el && el.contains(e.target as Node)) return;
      onClose();
    };
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
  hint,
  onCancel,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  initialValue: string;
  submitLabel: string;
  /** 可选说明文字(如新建分支的起始点) */
  hint?: string;
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
            // 分支名非自然语言,关闭浏览器原生拼写检查避免误划红线(与项目其它输入框一致)
            spellCheck={false}
            onChange={(e) => setVal(e.target.value)}
          />
          {hint && <div className="git-panel-input-hint">{hint}</div>}
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