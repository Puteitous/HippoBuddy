/**
 * Sidebar - 左侧会话列表
 *
 * 对齐旧版 static/js/session-manager.js 的展示与交互:
 *  - 36px header:"会话历史"标题 + 搜索 + 分组下拉(图标)
 *  - 搜索:标题 / 项目名即时过滤,平铺展示并高亮命中片段
 *  - 会话列表四态(加载中/错误/空/列表),点击切换 currentSessionId
 *  - 高亮当前会话(灰底,对齐旧版 .session-item.active)
 *  - 运行中会话显示脉冲圆点
 *  - hover 显示操作按钮:✏ 重命名(内联输入框)、× 删除(内联二次确认)
 *  - 宽度由 --session-panel-width 控制,配合 SidebarResizer 拖拽调宽
 *  - 折叠状态存 appStore.sidebarCollapsed(localStorage 持久化),
 *    由 ActivityBar 的会话/文件视图按钮展开
 *  - 会话/文件视图由 appStore.sidebarView 驱动(ActivityBar 切换)
 *
 * 2026-08-19:对齐旧版 session-manager.js 的列表核心能力:
 *  - Project/Time 分组切换(持久化 key 与旧版一致:hippo-session-group-mode)
 *  - Project 分组:按 projectPath 分组,最新会话时间降序,"其他"置底;
 *    项目头可折叠(hippo-collapsed-projects),含打开工作区按钮,
 *    当前活跃会话所属项目 has-active 高亮
 *  - Time 分组:今天/昨天/7天内/30天内/更早(北京时区,sticky 分类头)
 *  - 无限滚动:每批 20 条,IntersectionObserver + sentinel(对齐旧版)
 *  - 会话命名兜底对齐旧版:title || "会话 <id后6位>"
 *  - 虚拟会话(新建未持久化的 web-*)不显示在列表,列表仅由已持久化会话驱动
 *  - 置顶会话:顶部独立置顶区(图钉图标),置顶会话从原分组移除仅在置顶区出现一次,
 *    空置顶区不渲染,独立于 project/time 分组模式且不被无限滚动裁掉;
 *    置顶状态持久化到后端 session.json 的 pinned 字段
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { sessionApi, workspaceApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { on } from '@/utils/eventBus';
import type { GitBranchChangedPayload, RollbackCompletedPayload } from '@/utils/eventBus';
import type { Session } from '@/types';
import { useI18n, translate } from '@/i18n';
import { desktopBridge } from '@/utils/desktop-bridge';
import { FileTree } from './workspace/FileTree';
import './Sidebar.css';

/** 无限滚动单批渲染条数(对齐旧版 _renderBatchSize) */
const BATCH_SIZE = 20;

/** 分组模式持久化 key(与旧版一致,可直接复用旧版存储) */
const GROUP_MODE_KEY = 'hippo-session-group-mode';
/** 折叠项目持久化 key(与旧版一致) */
const COLLAPSED_PROJECTS_KEY = 'hippo-collapsed-projects';
/** 无工作区路径的会话归入的"其他"分组 key */
const OTHER_PROJECT_KEY = '__other__';

type GroupMode = 'project' | 'time';

/** 渲染行:置顶分隔线(仅时间分组)/ 项目分组头 / 会话项 */
type Row =
  | { type: 'pinned-divider' }
  | { type: 'project-header'; projectKey: string; name: string; fullPath: string; collapsed: boolean }
  | { type: 'session'; session: Session; name: string; projectLabel?: string };

/** 搜索结果上限(避免极端情况一次性渲染过多行) */
const SEARCH_RESULT_LIMIT = 200;

/** 项目显示名(路径最后一段;未关联工作区时用「其他」) */
function projectLabelOf(s: Session, otherLabel: string): string {
  if (!s.projectPath) return otherLabel;
  const normalized = s.projectPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

/** 会话排序/分组用的时间戳(lastActivityAt 优先,回退 createdAt;对齐旧版) */
function sessionTime(s: Session): number {
  return parseInt(s.lastActivityAt || s.createdAt, 10) || 0;
}

/** 会话显示名(对齐旧版:s.title || sessionNames || '会话 ' + id 后 6 位) */
function sessionDisplayName(s: Session, displayNames: Record<string, string>): string {
  return s.title || displayNames[s.id] || translate('chat.sessionPrefix', { id: s.id.replace('web-', '').slice(-6) });
}

/** 归一化项目路径(反斜杠统一为正斜杠;无路径归入"其他") */
function projectKeyOf(s: Session): string {
  return s.projectPath ? s.projectPath.replace(/\\/g, '/') : OTHER_PROJECT_KEY;
}

function readGroupMode(): GroupMode {
  try {
    return localStorage.getItem(GROUP_MODE_KEY) === 'time' ? 'time' : 'project';
  } catch {
    return 'project';
  }
}

function readCollapsedProjects(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_PROJECTS_KEY) || '[]');
    return new Set<string>(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function persistCollapsedProjects(projects: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...projects]));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

export function Sidebar() {
  const { t } = useI18n();
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const isLoading = useAppStore((s) => s.isLoadingSessions);
  const error = useAppStore((s) => s.sessionsError);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const createNewSession = useAppStore((s) => s.createNewSession);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  // 侧栏视图由活动栏（ActivityBar）切换,状态存 store 并持久化
  const sidebarView = useAppStore((s) => s.sidebarView);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath);
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  // 预览面板状态(文件树点击 → 打开主区预览)
  const previewOpenFile = usePreviewStore((s) => s.openFile);
  const previewActivePath = usePreviewStore((s) => s.activePath);

  // 侧栏视图(会话列表 / 文件树)由 store 驱动,见上方 sidebarView

  // 文件树刷新令牌(回滚完成后自增,对齐旧版"回滚 → 工作区联动刷新")
  const [fileTreeToken, setFileTreeToken] = useState(0);

  // 启动时若 store 无 workspacePath 则拉取一次(原 WorkspacePanel 职责)
  useEffect(() => {
    let cancelled = false;
    if (workspacePath) return;
    (async () => {
      try {
        const state = await workspaceApi.getCurrent();
        if (!cancelled && state.path) setWorkspacePath(state.path);
      } catch {
        /* 静默,等待 TopBar / Settings 主动设置 */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 回滚完成 → 刷新文件树
  useEffect(() => {
    const unsubscribe = on<RollbackCompletedPayload>('rollback:completed', () => {
      setFileTreeToken((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  // Git 分支切换成功 → 刷新文件树(工作区文件结构可能变化,需重新 readDir)
  useEffect(() => {
    const unsubscribe = on<GitBranchChangedPayload>('git:branch-changed', () => {
      setFileTreeToken((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  // AI 工具(write_file / edit_file / delete_file)写文件 → 刷新文件树
  // (对齐旧版"AI 改文件后预览/文件树联动"。delete_file 会对每个路径各发一次事件,
  //  这里做防抖合并,避免连续触发多次 readDir。)
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = on<string>('file:preview-reload', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFileTreeToken((t) => t + 1), 300);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // 工作区变化 → 让桌面端监听该目录(便于感知外部编辑器/终端等文件变更)。切工作区重设即自动换监听。
  useEffect(() => {
    if (!workspacePath) return;
    desktopBridge.watchWorkspace(workspacePath);
  }, [workspacePath]);

  // 桌面端文件系统监听回调 → 防抖刷新文件树(覆盖外部编辑、bash 命令等不在 AI 工具事件内的变更)
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = desktopBridge.onFileSystemChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFileTreeToken((t) => t + 1), 300);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // 预览面包屑点击目录段 → 切换到文件视图并让文件树展开/高亮该目录(对齐旧版 switchView('files') + revealDirectory)
  const [revealDir, setRevealDir] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = on<string>('workspace:reveal-dir', (dir) => {
      if (!dir) return;
      setRevealDir(dir);
      if (sidebarView !== 'files') setSidebarView('files');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarView]);

  // 分组模式 / 折叠项目(初始化读取 localStorage,与旧版 key 一致)
  const [groupMode, setGroupMode] = useState<GroupMode>(readGroupMode);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(readCollapsedProjects);
  // 分组方式下拉菜单
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);
  // 搜索(标题 / 项目名过滤,非持久化)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // 无限滚动:已渲染行数
  const [renderedCount, setRenderedCount] = useState(BATCH_SIZE);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // ── 无限滚动批次的重置控制 ──────────────────────────────
  // 记录上一次 rows 行数与分组结构,用于判定是否发生「结构性变化」。
  // 结构性变化(切换分组模式/折叠项目/列表整体缩短) → 重置批次为 BATCH_SIZE;
  // 普通后台刷新(updateSession 改 title/messageCount/running、getSessions、切会话)
  // 不应把用户已滚动出来的批次打回 BATCH_SIZE,否则列表会"滚着滚着又缩回"。
  const prevRowsLenRef = useRef(0);
  const prevGroupModeRef = useRef(groupMode);
  const prevCollapsedProjectsRef = useRef(collapsedProjects);

  // 打开搜索时自动聚焦输入框
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // 切到文件视图时收起搜索(避免回到会话视图时仍停留在搜索态)
  useEffect(() => {
    if (sidebarView !== 'files') return;
    setSearchOpen(false);
    setSearchQuery('');
  }, [sidebarView]);

  // 分组下拉:点击外部 / Esc 关闭
  useEffect(() => {
    if (!groupMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (groupMenuRef.current?.contains(e.target as Node)) return;
      setGroupMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGroupMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [groupMenuOpen]);

  /** 对齐旧版 createNewSession:生成 web-* 会话 id 并把 hero 待定草稿带入新会话;
   *  首次发送消息时才真正持久化;useSessionMessages 会自动 reset chatStore。 */
  const handleNewSession = () => {
    createNewSession();
  };

  /** 折叠项目头上的"新建对话":新建会话并切换到对应项目工作区 */
  const handleNewChatInProject = (path: string) => {
    handleNewSession();
    void openProjectWorkspace(path);
  };

  /** 退出搜索并恢复普通列表 */
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  /** 设置分组方式(持久化,key 与旧版一致) */
  const changeGroupMode = (mode: GroupMode) => {
    setGroupMode(mode);
    try {
      localStorage.setItem(GROUP_MODE_KEY, mode);
    } catch {
      /* 忽略 */
    }
    setGroupMenuOpen(false);
  };

  /** 折叠/展开项目(持久化,key 与旧版一致) */
  const toggleProject = (projectKey: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectKey)) next.delete(projectKey);
      else next.add(projectKey);
      persistCollapsedProjects(next);
      return next;
    });
  };

  /** 打开项目工作区(走新版 workspaceApi) */
  const openProjectWorkspace = async (path: string) => {
    try {
      const state = await workspaceApi.setCurrent(path);
      // 同步顶部工作区指示器(与 TopBar handleOpenFolder 的 applyWorkspace 一致)
      setWorkspacePath(state.path || path);
      showToast(translate('workspace.switched') + (state.path || path), { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('topbar.switchWorkspaceFailed', { err: msg }), { type: 'error' });
    }
  };

  /**
   * 计算渲染行:project 模式置顶会话并入所属项目并排在项目最前;
   * time 模式无项目概念,置顶会话单独置顶并以分隔线区隔。
   * 搜索态:标题 / 项目名命中的会话平铺展示(不分组、不置顶)。
   * 对齐旧版 renderSessionList / _computeRows / _injectVirtualSession。
   */
  const rows = useMemo<Row[]>(() => {
    const query = searchQuery.trim().toLowerCase();

    // 搜索态:强制平铺,按最近活跃降序;结果上限 SEARCH_RESULT_LIMIT
    if (query) {
      const otherLabel = t('session.other');
      return sessions
        .filter((s) => {
          const name = sessionDisplayName(s, sessionDisplayNames).toLowerCase();
          const project = s.projectPath ? s.projectPath.replace(/\\/g, '/').toLowerCase() : '';
          const label = projectLabelOf(s, otherLabel).toLowerCase();
          return name.includes(query) || project.includes(query) || label.includes(query);
        })
        .sort((a, b) => sessionTime(b) - sessionTime(a))
        .slice(0, SEARCH_RESULT_LIMIT)
        .map<Row>((s) => ({
          type: 'session',
          session: s,
          name: sessionDisplayName(s, sessionDisplayNames),
          projectLabel: projectLabelOf(s, otherLabel),
        }));
    }

    const pinnedSessions = sessions
      .filter((s) => s.pinned)
      .sort((a, b) => sessionTime(b) - sessionTime(a));
    const normalSessions = sessions.filter((s) => !s.pinned);
    // 按 lastActivityAt 降序(回退 createdAt)
    const sorted = [...normalSessions].sort((a, b) => sessionTime(b) - sessionTime(a));
    const rows: Row[] = [];

    if (groupMode === 'time') {
      // 时间模式:时间已常显在每行,不再渲染日期分类头,直接平铺。
      // 置顶会话无项目可归,保留顶部置顶区 + 分隔线。
      if (pinnedSessions.length > 0) {
        for (const s of pinnedSessions) {
          rows.push({ type: 'session', session: s, name: sessionDisplayName(s, sessionDisplayNames) });
        }
        rows.push({ type: 'pinned-divider' });
      }
      for (const s of sorted) {
        rows.push({ type: 'session', session: s, name: sessionDisplayName(s, sessionDisplayNames) });
      }
    } else {
      // 1. 按 projectPath 分组(路径统一 / 分隔,无路径归入"其他")。
      //    置顶会话并入所属项目:因按「置顶 → 普通」顺序入组,项目内天然置顶最前。
      const projectMap = new Map<string, Session[]>();
      for (const s of [...pinnedSessions, ...sorted]) {
        const key = projectKeyOf(s);
        if (!projectMap.has(key)) projectMap.set(key, []);
        projectMap.get(key)!.push(s);
      }

      // 2. 项目按最新会话时间降序;"其他"置底
      const projects = [...projectMap.entries()]
        .map(([projectKey, arr]) => {
          let latest = 0;
          for (const s of arr) latest = Math.max(latest, sessionTime(s));
          const fullPath = projectKey === OTHER_PROJECT_KEY ? '' : projectKey;
          const name = fullPath
            ? fullPath.split('/').filter(Boolean).pop() || fullPath
            : t('session.other');
          return { projectKey, fullPath, name, sessions: arr, latest };
        })
        .sort((a, b) => b.latest - a.latest);
      const otherIdx = projects.findIndex((p) => !p.fullPath);
      if (otherIdx > -1) {
        const [other] = projects.splice(otherIdx, 1);
        projects.push(other);
      }

      // 3. project-header → sessions(折叠项目跳过其下会话)
      for (const p of projects) {
        rows.push({
          type: 'project-header',
          projectKey: p.projectKey,
          name: p.name,
          fullPath: p.fullPath,
          collapsed: collapsedProjects.has(p.projectKey),
        });
        if (collapsedProjects.has(p.projectKey)) continue;
        for (const s of p.sessions) {
          rows.push({ type: 'session', session: s, name: sessionDisplayName(s, sessionDisplayNames) });
        }
      }
    }

    // 虚拟会话(新建未持久化的 web-*)不显示在会话列表,列表仅由已持久化会话驱动,
    // 刷新后行为即天然一致(不会出现"当前会话消失/不一致")。
    return rows;
  }, [sessions, groupMode, collapsedProjects, sessionDisplayNames, t, searchQuery]);

  /** 当前活跃会话所属项目 key(用于项目头 has-active 高亮;虚拟会话归入"其他") */
  const activeProjectKey = useMemo(() => {
    if (!currentSessionId) return null;
    const cur = sessions.find((s) => s.id === currentSessionId);
    return cur ? projectKeyOf(cur) : OTHER_PROJECT_KEY;
  }, [sessions, currentSessionId]);

  // 数据变化时重置无限滚动批次。
  // 仅当发生「结构性变化」(切换分组模式 / 折叠项目 / 列表整体缩短)时重置为 BATCH_SIZE;
  // 普通后台刷新(改 title/messageCount/running、getSessions、切会话)不应重置已滚动批次,
  // 避免列表"滚着滚着又缩回 BATCH_SIZE"导致显示不全。
  useEffect(() => {
    const prevLen = prevRowsLenRef.current;
    const structural =
      groupMode !== prevGroupModeRef.current ||
      collapsedProjects.size !== prevCollapsedProjectsRef.current.size ||
      rows.length < prevLen; // 行数减少(如删除会话)是真实结构收缩
    prevRowsLenRef.current = rows.length;
    prevGroupModeRef.current = groupMode;
    prevCollapsedProjectsRef.current = collapsedProjects;
    if (structural) {
      setRenderedCount(BATCH_SIZE);
      return;
    }
    // 非结构性变化:保留当前已滚动批次,但向上封顶不超出 rows 长度。
    // 关键修复:如果当前 renderedCount 已被压成 0(列表从"空"恢复时首次挂载被
    // Math.min(20,0) 清零),此时要给一个初始批次 min(BATCH_SIZE, rows.length),
    // 否则 visibleRows 永远是空数组,列表显示为空白。
    let next = Math.min(renderedCount, rows.length);
    if (rows.length > 0 && renderedCount === 0) {
      next = Math.min(BATCH_SIZE, rows.length);
    }
    setRenderedCount(next);
  }, [rows, groupMode, collapsedProjects, renderedCount]);

  // 搜索态一次性渲染全部命中(上限 SEARCH_RESULT_LIMIT),不参与无限滚动分批
  const searching = searchQuery.trim().length > 0;
  const visibleRows = searching ? rows : rows.slice(0, renderedCount);
  const hasMore = !searching && renderedCount < rows.length;

  // IntersectionObserver 无限滚动:滚动到底部附近时渲染下一批(对齐旧版 _attachSentinel)。
  // 依赖里必须包含 sidebarView:在「会话列表 ↔ 文件树」间切换时 .sidebar-body 会被卸载重建,
  // 若依赖不含 sidebarView,切回会话列表后本 effect 不会重跑,IntersectionObserver 仍观察着
  // 已卸载的旧 sentinel,新 sentinel 无人监听 → 列表只显示首批、滚到底也无法加载更多。
  // 刷新页面组件重挂载后 effect 全量重跑,故刷新后恢复正常(与此前吸顶效果同步修正)。
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const root = bodyRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRenderedCount((c) => Math.min(c + BATCH_SIZE, rows.length));
        }
      },
      { root, rootMargin: '150px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, rows, sidebarView]);

  // 兜底:列表未填满可视区时自动续批。
  // 结构性缩回(删会话/切分组/折项目)会把批次打回 BATCH_SIZE,此时若 sentinel
  // 已在可视范围内却未被 observer 触发(或位于视口上方够不到),列表会一直停留在
  // 开头那批、看似"只有几条"。这里以"是否产生滚动条"判定:未填满 → sentinel 必可见
  // → 主动补足,直到有滚动条(长列表)或全部渲染(短列表)。不改变长列表的无限滚动行为。
  // 含 sidebarView:视图切回会话列表后立即评估一次,配合上方 observer 重建双保险。
  useEffect(() => {
    if (!hasMore) return;
    const body = bodyRef.current;
    if (!body) return;
    const canGrow = body.scrollHeight - body.clientHeight < 1;
    if (!canGrow) return;
    const raf = requestAnimationFrame(() => {
      setRenderedCount((c) => Math.min(c + BATCH_SIZE, rows.length));
    });
    return () => cancelAnimationFrame(raf);
  }, [hasMore, rows, renderedCount, sidebarView]);

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' hidden' : ''}`}>
      {sidebarView === 'files' ? (
        /* 文件树视图(对齐旧版 .file-tree-view,替代会话列表) */
        <div className="sidebar-file-tree">
          {!workspacePath ? (
            <div className="sidebar-file-tree-empty">{t('sidebar.noWorkspace')}</div>
          ) : (
            <FileTree
              rootPath={workspacePath}
              onFileSelect={previewOpenFile}
              activePath={previewActivePath}
              revealDir={revealDir}
              refreshToken={fileTreeToken}
            />
          )}
        </div>
      ) : (
        <>
      {/* header:标题(左) + 搜索 / 分组下拉(右);搜索时整行替换为输入框 */}
      <div className="sidebar-header">
        {searchOpen ? (
          <div className="sidebar-search">
            <input
              ref={searchInputRef}
              className="sidebar-search-input"
              type="text"
              value={searchQuery}
              placeholder={t('sidebar.searchPlaceholder')}
              aria-label={t('sidebar.search')}
              autoComplete="off"
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
            />
            {searching && (
              <span className="sidebar-search-count">
                {t('sidebar.searchResults', { n: rows.length })}
              </span>
            )}
            <button
              type="button"
              className="sidebar-search-close"
              title={t('sidebar.searchClose')}
              aria-label={t('sidebar.searchClose')}
              onClick={closeSearch}
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <span className="sidebar-title">{t('sidebar.history')}</span>
            <span className="sidebar-header-spacer" />
            <button
              type="button"
              className="sidebar-icon-btn"
              title={t('sidebar.search')}
              aria-label={t('sidebar.search')}
              onClick={() => setSearchOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.7" y2="16.7" />
              </svg>
            </button>
            <div className="sidebar-group" ref={groupMenuRef}>
              <button
                type="button"
                className={`sidebar-icon-btn sidebar-group-btn${groupMenuOpen ? ' open' : ''}`}
                title={`${t('session.toggleGroup')}：${t(groupMode === 'project' ? 'session.groupProject' : 'session.groupTime')}`}
                aria-label={t('session.toggleGroup')}
                aria-haspopup="menu"
                aria-expanded={groupMenuOpen}
                onClick={() => setGroupMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L22 7L12 12L2 7L12 2Z" />
                  <path d="M2 12L12 17L22 12" />
                  <path d="M2 17L12 22L22 17" />
                </svg>
                <svg className="sidebar-group-caret" viewBox="0 0 8 8" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 3 4 5 6 3" />
                </svg>
              </button>
              {groupMenuOpen && (
                <div className="sidebar-group-menu" role="menu">
                  {(['project', 'time'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={groupMode === mode}
                      className={`sidebar-group-item${groupMode === mode ? ' active' : ''}`}
                      onClick={() => changeGroupMode(mode)}
                    >
                      <span className="sidebar-group-check">✓</span>
                      {t(mode === 'project' ? 'session.groupProject' : 'session.groupTime')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-body" ref={bodyRef}>
        {isLoading && <p className="sidebar-empty">{t('chat.loading')}</p>}

        {!isLoading && error && rows.length === 0 && (
          <div className="sidebar-error">
            <p>{t('sidebar.loadFailed')}</p>
            <pre>{error}</pre>
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <p className="sidebar-empty">{searching ? t('sidebar.searchEmpty') : t('sidebar.empty')}</p>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="session-list">
            {visibleRows.map((row) => {
              if (row.type === 'pinned-divider') {
                // 置顶区与普通列表之间的细分隔(无标题栏)
                return <div key="pinned-divider" className="session-pinned-divider" />;
              }
              if (row.type === 'project-header') {
                return (
                  <ProjectHeader
                    key={row.projectKey}
                    name={row.name}
                    fullPath={row.fullPath}
                    collapsed={row.collapsed}
                    active={row.projectKey === activeProjectKey}
                    onToggle={() => toggleProject(row.projectKey)}
                    onOpen={() => void openProjectWorkspace(row.fullPath)}
                    onNewChat={() => handleNewChatInProject(row.fullPath)}
                  />
                );
              }
              return (
                <SessionItem
                  key={row.session.id}
                  session={row.session}
                  active={row.session.id === currentSessionId}
                  onSelect={() => setCurrentSession(row.session.id)}
                  highlight={searching ? searchQuery.trim().toLowerCase() : undefined}
                  projectLabel={row.projectLabel}
                />
              );
            })}
            {hasMore && <div ref={sentinelRef} className="session-list-sentinel" />}
          </div>
        )}
      </div>
        </>
      )}
    </aside>
  );
}

/** 项目分组头:文件夹开/关图标 + 项目名 + 打开工作区按钮(对齐旧版 _createProjectHeaderElement) */
interface ProjectHeaderProps {
  name: string;
  fullPath: string;
  collapsed: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onNewChat: (path: string) => void;
}

function ProjectHeader({ name, fullPath, collapsed, active, onToggle, onOpen, onNewChat }: ProjectHeaderProps) {
  const { t } = useI18n();
  return (
    <div
      className={`session-project-header${collapsed ? ' collapsed' : ''}${active ? ' has-active' : ''}`}
      title={fullPath || undefined}
      onClick={onToggle}
    >
      {/* 文件夹-关/开两图标叠放,按 collapsed 状态切换 */}
      <span className="project-icon-wrap">
        <span className="project-icon-close">
          <svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" />
            <path d="M43 22H5" />
            <path d="M5 16V28" />
            <path d="M43 16V28" />
          </svg>
        </span>
        <span className="project-icon-open">
          <svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 28 3-5.8A4 4 0 0 1 18.48 20H40a4 4 0 0 1 3.88 5l-3.08 12a4 4 0 0 1-3.9 3H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4h7.8a4 4 0 0 1 3.38 1.8l1.62 2.4a4 4 0 0 0 3.34 1.8H36a4 4 0 0 1 4 4v4" />
          </svg>
        </span>
      </span>
      <span className="project-name">{name}</span>
      {collapsed && fullPath && (
        <button
          type="button"
          className="project-newchat-btn"
          title={t('sidebar.newChatInProject')}
          aria-label={t('sidebar.newChatInProject')}
          onClick={(e) => {
            e.stopPropagation();
            onNewChat(fullPath);
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h13.5a2 2 0 0 1 2 2z" />
            <line x1="8" y1="10" x2="16" y2="10" />
            <line x1="12" y1="6" x2="12" y2="14" />
          </svg>
        </button>
      )}
      {fullPath && (
        <button
          type="button"
          className="project-open-btn"
          title={t('sidebar.openProject')}
          aria-label={t('sidebar.openProject')}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 14l12-12" />
            <path d="M2 2h12v12" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface SessionItemProps {
  session: Session;
  active: boolean;
  onSelect: () => void;
  /** 搜索态:高亮关键字(小写) */
  highlight?: string;
  /** 搜索态:行内附带所属项目名 */
  projectLabel?: string;
}

function SessionItem({ session, active, onSelect, highlight, projectLabel }: SessionItemProps) {
  const { t } = useI18n();
  const updateSession = useAppStore((s) => s.updateSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  // 已在标签栏打开:纯提示标记,优先级低于运行中/待确认/完成未读
  const inTabs = useAppStore((s) => s.openTabs.includes(session.id));

  // 前端活跃流(对应会话在 sessionStreams 分区内的流式/工具调用进行中)——
  // 切走/新建其他会话后,原会话后台仍在流式,借此在会话项上提示续看。
  const streaming = useChatStore(
    (s) =>
      (s.sessionStreams[session.id]?.isSending === true ||
      (s.sessionStreams[session.id]?.stream.length ?? 0) > 0 ||
      (s.sessionStreams[session.id]?.toolCalls.length ?? 0) > 0),
  );

  // 等待确认:该会话存在挂起待决策的工具确认卡(toolCalls 中带 confirmationData)——
  // 此时 SSE 已暂停、需要用户回到该会话批准/拒绝,用独立图标与"流式中"的转圈区分。
  const awaitingConfirm = useChatStore(
    (s) => (s.sessionStreams[session.id]?.toolCalls ?? []).some((tc) => !!tc.confirmationData),
  );

  // 后台任务已完成、待用户查看:done 事件在非当前会话上置位,会话项亮小圆点提示,
  // 点击小圆点或切回该会话后由 dismissSessionCompleted 清除。
  const completedUnread = useChatStore(
    (s) => s.sessionStreams[session.id]?.completedUnread === true,
  );
  const dismissSessionCompleted = useChatStore((s) => s.dismissSessionCompleted);

  const title = sessionDisplayName(session, sessionDisplayNames);
  const time = formatTime(session.lastActivityAt ?? session.createdAt);

  // 重命名状态
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  // 删除确认状态
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 请求进行中(禁用交互,防止重复提交)
  const [busy, setBusy] = useState(false);

  // 进入重命名时自动聚焦并选中文本
  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  /** 提交重命名(blur / Enter 触发),对齐旧版 renameSession */
  const submitRename = async () => {
    const newName = renameValue.trim() || title;
    if (newName === title) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await sessionApi.rename(session.id, newName);
      updateSession(session.id, { title: newName });
      setRenaming(false);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('chat.renameFailed', { msg }), { type: 'error' });
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  };

  /** 切换置顶状态(置顶会话在列表最上方独立分区) */
  const handleTogglePin = async () => {
    const next = !session.pinned;
    setBusy(true);
    try {
      await sessionApi.pin(session.id, next);
      updateSession(session.id, { pinned: next });
      showToast(next ? translate('sidebar.pinnedSuccess') : translate('sidebar.unpinned'), { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('sidebar.pinFailed', { msg }), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** 执行删除(二次确认后),对齐旧版 deleteSession */
  const doDelete = async () => {
    setBusy(true);
    try {
      await sessionApi.delete(session.id);
      removeSession(session.id);
      // 对齐旧版:删除当前会话后自动新建临时会话
      if (active) {
        setCurrentSession(`web-${Date.now()}`);
      }
      showToast(translate('chat.sessionDeleted'), { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('chat.deleteFailed', { msg }), { type: 'error' });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  /** 取消重命名(Escape / 点击外部),对齐旧版:恢复原标题 */
  const cancelRename = () => {
    setRenameValue(title);
    setRenaming(false);
  };

  return (
    <div
      className={`session-item ${active ? 'session-item-active' : ''}`}
      onClick={(e) => {
        // 操作按钮 / 输入框 / 确认条内点击不触发会话切换(对齐旧版 closest('.session-actions') 判断)
        if ((e.target as HTMLElement).closest('.session-actions, .session-rename-input, .session-confirm-delete')) return;
        // 切回该会话即视为已查看,清掉"后台已完成"提醒
        dismissSessionCompleted(session.id);
        onSelect();
      }}
      title={renaming ? undefined : title}
    >
      <div className="session-item-title">
        {awaitingConfirm ? (
          <svg
            className="session-awaiting-confirm"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            aria-label="awaiting-confirm"
          >
            <title>{t('chat.awaitingConfirm')}</title>
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6.3 6.1a1.8 1.8 0 1 1 3.1 1.3c-.7.7-1.4 1-1.4 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
          </svg>
        ) : (
          streaming && <span className="session-streaming-spinner" aria-label="streaming" />
        )}
        {/* 后台任务已完成的小圆点提醒:优先级低于等待确认/流式中,点击仅清除提醒(不切换会话) */}
        {!awaitingConfirm && !streaming && completedUnread && !active && (
          <span
            className="session-completed-dot"
            aria-label="completed"
            title={t('sidebar.completedTip')}
            onClick={(e) => {
              e.stopPropagation();
              dismissSessionCompleted(session.id);
            }}
          />
        )}
        {renaming ? (
          <input
            ref={renameInputRef}
            className="session-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => { if (!busy) void submitRename(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                cancelRename();
              }
            }}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="session-item-name">
            {highlight ? <HighlightedText text={title} query={highlight} /> : title}
          </span>
        )}
      </div>

      {!renaming && confirmDelete ? (
        /* 删除二次确认条(对齐旧版 ConfirmDialog 的确认语义) */
        <div className="session-confirm-delete" onClick={(e) => e.stopPropagation()}>
          <span className="session-confirm-text">{t('chat.confirmDelete')}</span>
          <button
            type="button"
            className="session-confirm-btn confirm-yes"
            onClick={() => void doDelete()}
            disabled={busy}
            title={t('chat.confirmDeleteTitle')}
          >
            {busy ? '…' : t('session.delete')}
          </button>
          <button
            type="button"
            className="session-confirm-btn confirm-no"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
            title={t('chat.cancel')}
          >
            {t('chat.cancel')}
          </button>
        </div>
      ) : (
        !renaming && (
          <>
            <div className="session-item-meta">
              {projectLabel && (
                <span className="session-item-project" title={projectLabel}>{projectLabel}</span>
              )}
              <span className="session-item-time">{time}</span>
              {session.pinned && (
                <span className="session-pin-mark" title={t('sidebar.pinned')}>
                  <svg viewBox="0 0 48 48" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
                    <path d="M10.6963 17.5042C13.3347 14.8657 16.4701 14.9387 19.8781 16.8076L32.62 9.74509L31.8989 4.78683L43.2126 16.1005L38.2656 15.3907L31.1918 28.1214C32.9752 31.7589 33.1337 34.6647 30.4953 37.3032C30.4953 37.3032 26.235 33.0429 22.7171 29.525L6.44305 41.5564L18.4382 25.2461C14.9202 21.7281 10.6963 17.5042 10.6963 17.5042Z" />
                  </svg>
                </span>
              )}
              {/* 已在标签栏打开:与标签栏联动的灰点,放在行尾保持左侧状态图标区干净 */}
              {!awaitingConfirm && !streaming && !completedUnread && inTabs && (
                <span className="session-opened-mark" title={t('chat.tabOpened')} />
              )}
            </div>
            {/* hover 操作按钮(对齐旧版 .session-actions) */}
            <div className="session-actions">
              <button
                type="button"
                className={`pin-action${session.pinned ? ' pinned' : ''}`}
                title={session.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
                aria-label={session.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  setRenaming(false);
                  void handleTogglePin();
                }}
              >
                <svg viewBox="0 0 48 48" width="12" height="12" fill={session.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
                  <path d="M10.6963 17.5042C13.3347 14.8657 16.4701 14.9387 19.8781 16.8076L32.62 9.74509L31.8989 4.78683L43.2126 16.1005L38.2656 15.3907L31.1918 28.1214C32.9752 31.7589 33.1337 34.6647 30.4953 37.3032C30.4953 37.3032 26.235 33.0429 22.7171 29.525L6.44305 41.5564L18.4382 25.2461C14.9202 21.7281 10.6963 17.5042 10.6963 17.5042Z" />
                </svg>
              </button>
              <button
                type="button"
                title={t('session.rename')}
                aria-label={t('session.rename')}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  setRenameValue(title);
                  setRenaming(true);
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
              <button
                type="button"
                title={t('session.delete')}
                aria-label={t('session.delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

/** 时间戳格式化为相对时间(刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / N 周前) */
function formatTime(timestamp: string): string {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return '';
  const diff = Date.now() - n;
  if (diff < 60_000) return translate('sidebar.timeJustNow');
  if (diff < 3_600_000) {
    return translate('sidebar.timeMinutes', { n: Math.floor(diff / 60_000) });
  }
  if (diff < 86_400_000) {
    return translate('sidebar.timeHours', { n: Math.floor(diff / 3_600_000) });
  }
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return translate('sidebar.timeYesterday');
  if (days < 7) return translate('sidebar.timeDays', { n: days });
  if (days < 30) return translate('sidebar.timeWeeks', { n: Math.floor(days / 7) });
  if (days < 365) return translate('sidebar.timeMonths', { n: Math.floor(days / 30) });
  // 超过一年:回落到绝对日期,避免"13 个月前"这类难读的表述
  const date = new Date(n);
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 搜索命中片段高亮(大小写不敏感,高亮所有出现位置) */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx < 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let from = 0;
  let hit = idx;
  while (hit >= 0) {
    if (hit > from) parts.push(text.slice(from, hit));
    parts.push(<mark key={hit}>{text.slice(hit, hit + query.length)}</mark>);
    from = hit + query.length;
    hit = lower.indexOf(query, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}
