/**
 * Sidebar - 左侧会话列表
 *
 * 对齐旧版 static/js/session-manager.js 的展示与交互:
 *  - 顶部圆角胶囊工具栏:折叠面板 + 新建会话
 *  - 36px header:图标 + "会话"标题 + 分组切换按钮 + 会话计数
 *  - 会话列表四态(加载中/错误/空/列表),点击切换 currentSessionId
 *  - 高亮当前会话(灰底,对齐旧版 .session-item.active)
 *  - 运行中会话显示脉冲圆点
 *  - hover 显示操作按钮:✏ 重命名(内联输入框)、× 删除(内联二次确认)
 *  - 宽度由 --session-panel-width 控制,配合 SidebarResizer 拖拽调宽
 *  - 折叠状态存 appStore.sidebarCollapsed(localStorage 持久化),
 *    折叠后由 TopBar 的逃生按钮展开
 *
 * 2026-08-19:对齐旧版 session-manager.js 的列表核心能力:
 *  - Project/Time 分组切换(持久化 key 与旧版一致:hippo-session-group-mode)
 *  - Project 分组:按 projectPath 分组,最新会话时间降序,"其他"置底;
 *    项目头可折叠(hippo-collapsed-projects),含打开工作区按钮,
 *    当前活跃会话所属项目 has-active 高亮
 *  - Time 分组:今天/昨天/7天内/30天内/更早(北京时区,sticky 分类头)
 *  - 无限滚动:每批 20 条,IntersectionObserver + sentinel(对齐旧版)
 *  - 虚拟会话注入:新建会话(web-*)未持久化时,显示在"其他"或"今天"分组
 *  - 会话命名兜底对齐旧版:title || "会话 <id后6位>"
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sessionApi, workspaceApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { on } from '@/utils/eventBus';
import type { RollbackCompletedPayload } from '@/utils/eventBus';
import type { Session } from '@/types';
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

/** 侧栏视图切换持久化 key(会话列表 / 文件树,对齐旧版 view-capsule) */
const SIDEBAR_VIEW_KEY = 'hippo-sidebar-view';

type GroupMode = 'project' | 'time';
type SidebarView = 'sessions' | 'files';

function readSidebarView(): SidebarView {
  try {
    return localStorage.getItem(SIDEBAR_VIEW_KEY) === 'files' ? 'files' : 'sessions';
  } catch {
    return 'sessions';
  }
}

/** 渲染行:项目分组头 / 时间分类头 / 会话项 */
type Row =
  | { type: 'project-header'; projectKey: string; name: string; fullPath: string; collapsed: boolean }
  | { type: 'category'; category: string }
  | { type: 'session'; session: Session; name: string };

/** 会话排序/分组用的时间戳(lastActivityAt 优先,回退 createdAt;对齐旧版) */
function sessionTime(s: Session): number {
  return parseInt(s.lastActivityAt || s.createdAt, 10) || 0;
}

/** 会话显示名(对齐旧版:s.title || '会话 ' + id 后 6 位) */
function sessionDisplayName(s: Session): string {
  return s.title || `会话 ${s.id.replace('web-', '').slice(-6)}`;
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

/** 按时间分组:今天/昨天/7天内/30天内/更早(北京时区;对齐旧版 groupSessionsByTime) */
function groupSessionsByTime(sessions: Session[]): Array<[string, Session[]]> {
  const now = Date.now();
  const BEIJING_OFFSET = 8 * 3600 * 1000;
  const dayIndex = (ts: number) => Math.floor((ts + BEIJING_OFFSET) / 86400000);
  const today = dayIndex(now);

  const buckets: Record<string, Session[]> = {
    '今天': [],
    '昨天': [],
    '7天内': [],
    '30天内': [],
    '更早': [],
  };

  for (const s of sessions) {
    const ts = parseInt(s.lastActivityAt || s.createdAt, 10);
    if (isNaN(ts)) {
      buckets['更早'].push(s);
      continue;
    }
    const daysAgo = today - dayIndex(ts);
    if (daysAgo === 0) buckets['今天'].push(s);
    else if (daysAgo === 1) buckets['昨天'].push(s);
    else if (daysAgo <= 7) buckets['7天内'].push(s);
    else if (daysAgo <= 30) buckets['30天内'].push(s);
    else buckets['更早'].push(s);
  }

  return Object.entries(buckets).filter(([, arr]) => arr.length > 0);
}

export function Sidebar() {
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const isLoading = useAppStore((s) => s.isLoadingSessions);
  const error = useAppStore((s) => s.sessionsError);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const createNewSession = useAppStore((s) => s.createNewSession);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath);
  // 预览面板状态(文件树点击 → 打开主区预览)
  const previewOpenFile = usePreviewStore((s) => s.openFile);
  const previewActivePath = usePreviewStore((s) => s.activePath);

  // 侧栏视图(会话列表 / 文件树)持久化切换
  const [sidebarView, setSidebarViewState] = useState<SidebarView>(readSidebarView);
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

  const switchSidebarView = (v: SidebarView) => {
    setSidebarViewState(v);
    try {
      localStorage.setItem(SIDEBAR_VIEW_KEY, v);
    } catch {
      /* 忽略 */
    }
  };

  // 分组模式 / 折叠项目(初始化读取 localStorage,与旧版 key 一致)
  const [groupMode, setGroupMode] = useState<GroupMode>(readGroupMode);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(readCollapsedProjects);
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

  /** 对齐旧版 createNewSession:生成 web-* 会话 id 并把 hero 待定草稿带入新会话;
   *  首次发送消息时才真正持久化;useSessionMessages 会自动 reset chatStore。 */
  const handleNewSession = () => {
    createNewSession();
  };

  /** 切换 Project/Time 分组(持久化,key 与旧版一致) */
  const toggleGroupMode = () => {
    setGroupMode((m) => {
      const next = m === 'project' ? 'time' : 'project';
      try {
        localStorage.setItem(GROUP_MODE_KEY, next);
      } catch {
        /* 忽略 */
      }
      return next;
    });
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

  /** 打开项目工作区(对齐旧版 HippoWorkspace.openWorkspace,走新版 workspaceApi) */
  const openProjectWorkspace = async (path: string) => {
    try {
      await workspaceApi.setCurrent(path);
      showToast('工作区已切换: ' + path, { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(`切换工作区失败: ${msg}`, { type: 'error' });
    }
  };

  /**
   * 计算渲染行:排序 → 分组(project/time) → 注入虚拟会话。
   * 对齐旧版 renderSessionList / _computeRows / _injectVirtualSession。
   */
  const rows = useMemo<Row[]>(() => {
    // 按 lastActivityAt 降序(回退 createdAt)
    const sorted = [...sessions].sort((a, b) => sessionTime(b) - sessionTime(a));
    const rows: Row[] = [];

    if (groupMode === 'time') {
      for (const [category, arr] of groupSessionsByTime(sorted)) {
        rows.push({ type: 'category', category });
        for (const s of arr) {
          rows.push({ type: 'session', session: s, name: sessionDisplayName(s) });
        }
      }
    } else {
      // 1. 按 projectPath 分组(路径统一 / 分隔,无路径归入"其他")
      const projectMap = new Map<string, Session[]>();
      for (const s of sorted) {
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
            : '其他';
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
          rows.push({ type: 'session', session: s, name: sessionDisplayName(s) });
        }
      }
    }

    // 4. 虚拟会话注入:当前会话未持久化(新建 web-*)时,显示在"其他"或"今天"
    const currentInList = sessions.some((s) => s.id === currentSessionId);
    if (!currentInList && currentSessionId) {
      const virtual: Session = {
        id: currentSessionId,
        messageCount: 0,
        createdAt: String(Date.now()),
        active: false,
        running: false,
        projectPath: '',
      };
      const vname = sessionDisplayName(virtual);
      if (groupMode === 'time') {
        const todayIdx = rows.findIndex((r) => r.type === 'category' && r.category === '今天');
        if (todayIdx !== -1) {
          rows.splice(todayIdx + 1, 0, { type: 'session', session: virtual, name: vname });
        } else {
          rows.unshift({ type: 'category', category: '今天' }, { type: 'session', session: virtual, name: vname });
        }
      } else {
        const otherIdx = rows.findIndex((r) => r.type === 'project-header' && r.projectKey === OTHER_PROJECT_KEY);
        if (otherIdx !== -1) {
          // 对齐旧版:"其他"分组折叠时不显示其下虚拟会话(展开后 rows 重算会重新注入)
          const otherHeader = rows[otherIdx];
          if (otherHeader.type === 'project-header' && !otherHeader.collapsed) {
            rows.splice(otherIdx + 1, 0, { type: 'session', session: virtual, name: vname });
          }
        } else {
          rows.unshift(
            { type: 'project-header', projectKey: OTHER_PROJECT_KEY, name: '其他', fullPath: '', collapsed: false },
            { type: 'session', session: virtual, name: vname },
          );
        }
      }
    }

    return rows;
  }, [sessions, groupMode, collapsedProjects, currentSessionId]);

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
    const structural =
      groupMode !== prevGroupModeRef.current ||
      collapsedProjects.size !== prevCollapsedProjectsRef.current.size ||
      rows.length < prevRowsLenRef.current; // 行数减少(如删除会话)是真实结构收缩
    prevRowsLenRef.current = rows.length;
    prevGroupModeRef.current = groupMode;
    prevCollapsedProjectsRef.current = collapsedProjects;
    if (structural) {
      setRenderedCount(BATCH_SIZE);
      return;
    }
    // 非结构性变化:保留当前已滚动批次,但向上封顶不超出 rows 长度,
    // 避免后台刷新导致 renderedCount 虚高而渲染不足(hasMore 判定用)。
    setRenderedCount((c) => Math.min(c, rows.length));
  }, [rows, groupMode, collapsedProjects]);

  const visibleRows = rows.slice(0, renderedCount);
  const hasMore = renderedCount < rows.length;

  // IntersectionObserver 无限滚动:滚动到底部附近时渲染下一批(对齐旧版 _attachSentinel)
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
  }, [hasMore, rows]);

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' hidden' : ''}`}>
      {/* 顶部圆角胶囊工具栏(对齐旧版 .session-toolbar) */}
      <div className="sidebar-toolbar">
        <button
          type="button"
          className="toolbar-btn"
          title="折叠会话面板"
          aria-label="折叠会话面板"
          onClick={() => setSidebarCollapsed(true)}
        >
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 10.5H40" />
            <path d="M24 19.5H40" />
            <path d="M24 28.5H40" />
            <path d="M8 37.5H40" />
            <path d="M16 19L8 24L16 29V19Z" fill="none" />
          </svg>
        </button>

        <button
          type="button"
          className="toolbar-btn"
          title="新建会话"
          aria-label="新建会话"
          onClick={handleNewSession}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <div className="toolbar-spacer" />

        {/* 侧栏视图切换胶囊(对齐旧版 .view-capsule:会话列表 ↔ 文件浏览) */}
        <div className="sidebar-view-capsule">
          <button
            type="button"
            className={`capsule-btn${sidebarView === 'sessions' ? ' active' : ''}`}
            title="会话列表"
            aria-label="会话列表"
            onClick={() => switchSidebarView('sessions')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="10" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className={`capsule-btn${sidebarView === 'files' ? ' active' : ''}`}
            title="文件浏览"
            aria-label="文件浏览"
            onClick={() => switchSidebarView('files')}
          >
            <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <circle cx="38" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <circle cx="38" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <circle cx="38" cy="38" r="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <path d="M34 38L22 38V10H34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 24L34 24" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {sidebarView === 'files' ? (
        /* 文件树视图(对齐旧版 .file-tree-view,替代会话列表) */
        <div className="sidebar-file-tree">
          {!workspacePath ? (
            <div className="sidebar-file-tree-empty">未设置工作区</div>
          ) : (
            <FileTree
              rootPath={workspacePath}
              onFileSelect={previewOpenFile}
              activePath={previewActivePath}
              refreshToken={fileTreeToken}
            />
          )}
        </div>
      ) : (
        <>
      {/* header:图标 + 标题 + 分组切换 + 计数 */}
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          <svg className="sidebar-header-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 2H2.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2.5l2 2 2-2h4.5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
          </svg>
          <span className="sidebar-title">会话</span>
          <button
            type="button"
            className="group-mode-toggle"
            title="切换分组方式"
            aria-label="切换分组方式"
            onClick={toggleGroupMode}
          >
            {groupMode === 'project' ? 'Project' : 'Time'}
          </button>
        </div>
        <span className="sidebar-count">{sessions.length}</span>
      </div>

      <div className="sidebar-body" ref={bodyRef}>
        {isLoading && <p className="sidebar-empty">加载中…</p>}

        {error && (
          <div className="sidebar-error">
            <p>加载会话失败</p>
            <pre>{error}</pre>
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <p className="sidebar-empty">暂无会话</p>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="session-list">
            {visibleRows.map((row) => {
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
                  />
                );
              }
              if (row.type === 'category') {
                return (
                  <div key={row.category} className="session-category">
                    {row.category}
                  </div>
                );
              }
              return (
                <SessionItem
                  key={row.session.id}
                  session={row.session}
                  active={row.session.id === currentSessionId}
                  onSelect={() => setCurrentSession(row.session.id)}
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
}

function ProjectHeader({ name, fullPath, collapsed, active, onToggle, onOpen }: ProjectHeaderProps) {
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
      {fullPath && (
        <button
          type="button"
          className="project-open-btn"
          title="打开工作区"
          aria-label="打开工作区"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 11l6-6" />
            <path d="M5 5h6v6" />
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
}

function SessionItem({ session, active, onSelect }: SessionItemProps) {
  const updateSession = useAppStore((s) => s.updateSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);

  // 前端活跃流(对应会话在 sessionStreams 分区内的流式/工具调用进行中)——
  // 切走/新建其他会话后,原会话后台仍在流式,借此在会话项上提示续看。
  const streaming = useChatStore(
    (s) =>
      (s.sessionStreams[session.id]?.isSending === true ||
      (s.sessionStreams[session.id]?.stream.length ?? 0) > 0 ||
      (s.sessionStreams[session.id]?.toolCalls.length ?? 0) > 0),
  );

  const title = sessionDisplayName(session);
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
      showToast(`重命名失败: ${msg}`, { type: 'error' });
      setRenaming(false);
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
      showToast('会话已删除', { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(`删除失败: ${msg}`, { type: 'error' });
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
        onSelect();
      }}
      title={renaming ? undefined : title}
    >
      <div className="session-item-title">
        {streaming && <span className="session-streaming-spinner" aria-label="streaming" />}
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
          <span className="session-item-name">{title}</span>
        )}
      </div>

      {!renaming && confirmDelete ? (
        /* 删除二次确认条(对齐旧版 ConfirmDialog 的确认语义) */
        <div className="session-confirm-delete" onClick={(e) => e.stopPropagation()}>
          <span className="session-confirm-text">确认删除？</span>
          <button
            type="button"
            className="session-confirm-btn confirm-yes"
            onClick={() => void doDelete()}
            disabled={busy}
            title="确认删除"
          >
            {busy ? '…' : '删除'}
          </button>
          <button
            type="button"
            className="session-confirm-btn confirm-no"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
            title="取消"
          >
            取消
          </button>
        </div>
      ) : (
        !renaming && (
          <>
            <div className="session-item-meta">
              <span className="session-item-mode">{session.mode ?? 'coding'}</span>
              <span className="session-item-time">{time}</span>
            </div>
            {/* hover 操作按钮(对齐旧版 .session-actions) */}
            <div className="session-actions">
              <button
                type="button"
                title="重命名"
                aria-label="重命名"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  setRenameValue(title);
                  setRenaming(true);
                }}
              >
                ✏
              </button>
              <button
                type="button"
                title="删除"
                aria-label="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                ×
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

/** 时间戳格式化为简短显示 */
function formatTime(timestamp: string): string {
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return '';
  const date = new Date(n);
  // 简化显示:MM-DD HH:mm
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
