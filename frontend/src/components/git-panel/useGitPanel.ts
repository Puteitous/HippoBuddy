/**
 * useGitPanel - GitPanel 的状态与操作层
 *
 * 从原 GitPanel.tsx 主组件中剥离的全部 state/ref/handler 与副作用。
 * 渲染层(header/提交区/列表/历史)与弹层均为纯展示组件,只接收本 hook 返回值。
 *
 * 行为钉子(拆分时逐行保留,不得顺手优化):
 *  - saveSnapshot 先写快照再 setState:面板卸载期间请求返回也不丢数据;
 *  - commit() 乐观清空 + 失败回填,草稿写穿不走 effect 兜底;
 *  - AI 流式增量填充 + 兜底清洗 + 卸载中止;
 *  - 所有异步回调挂 mountedRef 门控。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { gitApi, type GitLogEntry, type GitStatusEntry } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import { emit, on } from '@/utils/eventBus';
import type { GitBranchChangedPayload } from '@/utils/eventBus';
import { showToast } from '@/utils/toastStore';
import {
  getPanelSnapshot,
  setPanelSnapshot,
  getCommitDraft,
  setCommitDraft,
  type GitPanelSnapshot,
} from './gitPanelStore';

/** git 历史分批加载数量(懒加载分页) */
const LOG_BATCH = 20;

/** 悬浮卡片与列表行的间距(px) */
const LOG_TIP_GAP = 8;

/** 提交正文请求超时(ms):超时按"无正文"展示卡片,避免悬停后长时间无反馈 */
const LOG_BODY_TIMEOUT = 1500;

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

export function useGitPanel() {
  const { t } = useI18n();
  const workspacePath = useAppStore((s) => s.workspacePath);
  const openGitDiff = usePreviewStore((s) => s.openGitDiff);
  const setView = useAppStore((s) => s.setView);
  const setSettingsInitialPage = useAppStore((s) => s.setSettingsInitialPage);

  /** 跳转设置页定位「Git 提交信息」提示词,便于就地调整生成提交信息的 system prompt */
  const openCommitPromptSettings = useCallback(() => {
    setSettingsInitialPage('prompt:gitCommit');
    setView('settings');
  }, [setSettingsInitialPage, setView]);

  // 重开面板时以同一工作区的快照作首帧数据:有数据就直接渲染,刷新在后台静默替换,
  // 避免先闪一下"加载中"。快照缺失(首次打开/换了项目)时才走占位。
  const cached = (() => {
    const snapshot = getPanelSnapshot();
    return snapshot && snapshot.workspacePath === workspacePath ? snapshot : null;
  })();

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
  const [commitMsg, setCommitMsg] = useState(getCommitDraft());
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
  const branchTriggerRef = useRef<HTMLButtonElement>(null);
  /** 提交信息 textarea 引用,用于自动增高 */
  const commitMsgRef = useRef<HTMLTextAreaElement>(null);
  /** AI 流式生成提交信息的中止控制器:面板卸载时中止,避免卸载后继续写入 */
  const aiAbortRef = useRef<AbortController | null>(null);
  /** 同步(远端操作)按钮引用,用于菜单定位 */
  const syncTriggerRef = useRef<HTMLButtonElement>(null);
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
  const logTipRef = useRef<HTMLDivElement>(null);
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
    setCommitDraft(commitMsg);
  }, [commitMsg]);

  /**
   * 写回模块级快照:面板卸载后重开时作首帧数据。
   * 只传入本次真正变化的字段(其余沿用同一工作区的旧快照),避免额外状态搬运。
   */
  const saveSnapshot = useCallback(
    (patch: Partial<Omit<GitPanelSnapshot, 'workspacePath'>>) => {
      const base = (() => {
        const snapshot = getPanelSnapshot();
        return snapshot && snapshot.workspacePath === workspacePath ? snapshot : null;
      })();
      setPanelSnapshot({
        workspacePath,
        status: patch.status ?? base?.status ?? null,
        available: patch.available ?? base?.available ?? true,
        branchNames: patch.branchNames ?? base?.branchNames ?? [],
        remoteBranchNames: patch.remoteBranchNames ?? base?.remoteBranchNames ?? [],
        currentBranch: patch.currentBranch ?? base?.currentBranch ?? '',
        log: patch.log ?? base?.log ?? [],
        logEnded: patch.logEnded ?? base?.logEnded ?? false,
      });
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
    setCommitDraft(value);
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

  /** 初始化当前目录为 git 仓库;成功后走 runOperate 内的全量 refresh,空态自动切换为普通面板 */
  const initRepo = (): void => {
    if (busy) return;
    void runOperate({ action: 'init', path: workspacePath }).then((ok) => {
      if (ok) showToast(t('git.initSuccess'), { type: 'success' });
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
      // 兜底清洗:部分模型(或自定义提示词)会在输出首尾包 Markdown 代码块(```),提交信息应为纯文本
      setCommitMsg((prev) => {
        const fenced = prev.match(/^```[^\n]*\n?([\s\S]*?)\n?```\s*$/);
        return (fenced ? fenced[1] : prev).trim();
      });
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
    // 切分支会改变工作区文件结构:成功后广播 git:branch-changed,供 Sidebar 刷新文件树
    void runOperate({ action: 'checkout', path: workspacePath, branch }).then((ok) => {
      if (ok) emit<GitBranchChangedPayload>('git:branch-changed', { branch });
    });
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

  const entries = useMemo(() => status ?? [], [status]);
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

  return {
    t,
    workspacePath,
    status,
    available,
    branchNames,
    remoteBranchNames,
    currentBranch,
    log,
    logEnded,
    logLoadingMore,
    expandedHash,
    loading,
    busy,
    commitMsg,
    setCommitMsg,
    aiMsgLoading,
    error,
    remoteOp,
    branchOpen,
    setBranchOpen,
    branchCtx,
    setBranchCtx,
    branchInput,
    setBranchInput,
    ctxMenu,
    logMenu,
    confirm,
    syncOpen,
    setSyncOpen,
    logTip,
    logTipRef,
    branchTriggerRef,
    commitMsgRef,
    syncTriggerRef,
    showLoading,
    stagedEntries,
    unstagedEntries,
    stagedCount,
    confirmMessage,
    openCommitPromptSettings,
    closeMenus,
    refresh,
    refreshStatusOnly,
    loadMoreLog,
    runOperate,
    stageEntry,
    stageAll,
    writeCommitMsg,
    commit,
    initRepo,
    generateCommitMessage,
    checkout,
    runRemote,
    openBranchCtx,
    handleBranchMenu,
    openCreateBranchDialog,
    submitBranchInput,
    openWorktreeDiff,
    discardEntry,
    toggleCommitDiff,
    openCtxMenu,
    openLogMenu,
    handleStatusMenu,
    handleLogMenu,
    showLogTip,
    hideLogTip,
    setError,
    setConfirm,
  };
}
