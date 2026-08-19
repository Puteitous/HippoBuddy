/**
 * TopBar - 顶部状态栏(对齐旧版 cockpit.html 的 .header)
 *
 * 职责(新版分层):
 *  - 应用级:品牌名(会话 id 与模型快速选择已移至聊天状态栏,见 ChatPanel)
 *  - 导航:Chat / Workspace / Settings 视图切换
 *  - 工具区(对齐旧版 .header-actions):
 *    - 工作区指示器(桌面端,显示当前工作区路径 + 重置)
 *    - 压缩上下文(有会话时显示,对齐旧版 compactBtn)
 *    - 打开文件夹 + 最近文件夹下拉(桌面端,对齐旧版 header-folder-group)
 *    - 设置(跳转 Settings 视图)、主题切换
 *    - DevTools / 刷新(桌面端)
 *    - 窗口控制:最小化 / 最大化 / 关闭(桌面端,对齐旧版 window-controls)
 *    - 窗口拖拽(-webkit-app-region: drag)与双击最大化(桌面端)
 *
 * 阶段 3.7-3:对齐旧版 header,补齐桌面端能力。
 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useThemeStore } from '@/stores/themeStore';
import { sessionApi, workspaceApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge } from '@/utils/desktop-bridge';
import { showToast } from '@/utils/toastStore';
import './TopBar.css';

/** 最近文件夹 localStorage key(与旧版 workspace-manager.js 同 key,新旧版共享) */
const RECENT_FOLDERS_KEY = 'hippo-recent-folders';
const MAX_RECENT_FOLDERS = 20;

function readRecentFolders(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FOLDERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function persistRecentFolders(folders: string[]): void {
  try {
    localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

export function TopBar() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath);

  const isSending = useChatStore((s) => s.isSending);
  const setMessages = useChatStore((s) => s.setMessages);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const isDesktop = desktopBridge.isDesktop;

  // ── 窗口最大化状态(桌面端) ──────────────────────────────
  const [maximized, setMaximized] = useState(false);
  // ── 压缩上下文进行中 ────────────────────────────────────
  const [compacting, setCompacting] = useState(false);
  // ── 最近文件夹下拉 ──────────────────────────────────────
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentFolders, setRecentFolders] = useState<string[]>(readRecentFolders);
  const folderGroupRef = useRef<HTMLDivElement | null>(null);

  // 桌面端初始化:body class + 最大化状态订阅 + 初始同步(对齐旧版 desktop-bridge.js)
  useEffect(() => {
    if (!desktopBridge.isDesktop) return;
    document.body.classList.add('desktop-window');

    let cancelled = false;
    const applyMax = (m: boolean) => {
      if (cancelled) return;
      setMaximized(m);
      document.body.classList.toggle('window-maximized', m);
    };

    void desktopBridge.isMaximized().then((m) => {
      if (!cancelled) applyMax(m);
    });
    // 最大化状态变化事件(替代轮询)
    const unsubscribe = desktopBridge.onMaximizedChanged(applyMax);
    // resize 兜底(用户拖拽还原时 Electron 可能不触发 unmaximize)
    window.addEventListener('resize', () => {
      void desktopBridge.isMaximized().then((m) => {
        if (!cancelled) applyMax(m);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
      document.body.classList.remove('desktop-window', 'window-maximized');
    };
  }, []);

  // 点击外部关闭最近文件夹下拉(对齐旧版 document click 监听)
  useEffect(() => {
    if (!recentOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      if (folderGroupRef.current && !folderGroupRef.current.contains(e.target as Node)) {
        setRecentOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [recentOpen]);

  // ── 窗口控制(对齐旧版 desktop-bridge.js initWindowControls) ──
  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    // 双击空白区域切换最大化;按钮/下拉/品牌图标不响应(对齐旧版排除列表)
    if (target.closest('button, .window-controls, .header-folder-dropdown, .top-bar-brand-icon')) return;
    void desktopBridge.toggleMaximize();
  };

  const handleMinimize = () => desktopBridge.minimizeWindow();
  const handleMaximizeToggle = () => {
    // 乐观更新,onMaximizedChanged 事件会校正最终状态(对齐旧版先 toggle class)
    setMaximized((m) => !m);
    void desktopBridge.toggleMaximize();
  };
  const handleClose = () => desktopBridge.closeWindow();

  // ── 工作区(打开文件夹 / 最近下拉 / 重置) ──────────────────
  const applyWorkspace = (path: string) => {
    setWorkspacePath(path);
    setRecentFolders((prev) => {
      const next = [path, ...prev.filter((f) => f !== path)].slice(0, MAX_RECENT_FOLDERS);
      persistRecentFolders(next);
      return next;
    });
  };

  const handleOpenFolder = async () => {
    const path = await desktopBridge.openFileDialog();
    if (!path) return;
    try {
      const state = await workspaceApi.setCurrent(path);
      applyWorkspace(state.path || path);
      showToast('工作区已切换: ' + (state.path || path), { type: 'success', duration: 2500 });
    } catch (e) {
      showToast('打开文件夹失败: ' + errMsg(e), { type: 'error', duration: 3000 });
    }
  };

  const handleSelectRecentFolder = async (path: string) => {
    setRecentOpen(false);
    try {
      const state = await workspaceApi.setCurrent(path);
      applyWorkspace(state.path || path);
      showToast('工作区已切换: ' + (state.path || path), { type: 'success', duration: 2000 });
    } catch (e) {
      showToast('切换工作区失败: ' + errMsg(e), { type: 'error', duration: 3000 });
    }
  };

  const handleRemoveRecentFolder = (path: string) => {
    setRecentFolders((prev) => {
      const next = prev.filter((f) => f !== path);
      persistRecentFolders(next);
      return next;
    });
  };

  const handleClearWorkspace = async () => {
    try {
      await workspaceApi.resetCurrent();
      setWorkspacePath('');
      showToast('已重置到默认工作区', { type: 'success', duration: 2000 });
    } catch (e) {
      showToast('重置工作区失败: ' + errMsg(e), { type: 'error', duration: 3000 });
    }
  };

  // ── 压缩上下文(对齐旧版 handleCompact) ────────────────────
  const handleCompact = async () => {
    if (!currentSessionId || compacting || isSending) return;
    // 与旧版 prompt 交互一致:留空则自动智能压缩
    const instruction = window.prompt(
      '输入压缩指令（可选）：\n\n例如："保留所有代码示例"、"只保留重要信息"\n\n留空则自动智能压缩',
    );
    if (instruction === null) return; // 用户取消

    setCompacting(true);
    try {
      const result = await sessionApi.compact(currentSessionId, instruction || undefined);
      showToast(
        `压缩完成！方法：${result.method}\n原始${result.originalCount}条 → 压缩后${result.compactedCount}条\n减少${result.reducedCount}条，节省Token ${result.savedTokens.toLocaleString()}(${result.savedPercent}%)\n\n摘要：${result.summary}`,
        { type: 'success', duration: 8000 },
      );
      // compact 后端会重写会话消息,重新拉取刷新列表
      const msgs = await sessionApi.getMessages(currentSessionId);
      setMessages(msgs);
    } catch (e) {
      showToast('压缩失败: ' + errMsg(e), { type: 'error', duration: 4000 });
    } finally {
      setCompacting(false);
    }
  };

  // ── 工具按钮 ─────────────────────────────────────────────
  const handleSettings = () => setView('settings');
  const handleDevTools = () => {
    desktopBridge.openDevTools();
    showToast('正在打开 DevTools...', { type: 'info', duration: 1500 });
  };
  const handleRefresh = () => {
    window.location.reload();
  };

  const isDarkTheme = theme === 'dark' || theme === 'midnight';

  return (
    <header className="top-bar" onDoubleClick={handleHeaderDoubleClick}>
      <div className="top-bar-brand">
        <span className="top-bar-brand-icon" aria-hidden>
          <svg viewBox="0 0 64 64" width="20" height="20">
            <use href="#hippoIcon" />
          </svg>
        </span>
        <span className="top-bar-name">HippoBuddy</span>
        <span className="top-bar-tag">React + TS</span>
        {/* 侧栏折叠时的逃生展开按钮(对齐旧版 header 中 toolbar-escape) */}
        {sidebarCollapsed && (
          <button
            type="button"
            className="top-bar-sidebar-show"
            title="展开会话面板"
            aria-label="展开会话面板"
            onClick={() => setSidebarCollapsed(false)}
          >
            <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10.5H40" />
              <path d="M24 19.5H40" />
              <path d="M24 28.5H40" />
              <path d="M8 37.5H40" />
              <path d="M16 19L8 24L16 29V19Z" fill="none" />
            </svg>
          </button>
        )}
      </div>

      <nav className="top-bar-nav">
        <button
          type="button"
          className={`top-bar-tab ${view === 'chat' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`top-bar-tab ${view === 'workspace' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('workspace')}
        >
          Workspace
        </button>
        <button
          type="button"
          className={`top-bar-tab ${view === 'settings' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('settings')}
        >
          Settings
        </button>
      </nav>

      {/* 工具区(对齐旧版 .header-actions) */}
      <div className="top-bar-actions">
        {/* 工作区指示器(桌面端,有工作区时显示) */}
        {isDesktop && workspacePath.trim() && (
          <div className="workspace-indicator" title={workspacePath}>
            <svg className="workspace-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="workspace-path">{workspacePath}</span>
            <button className="workspace-clear" title="重置到默认工作区" aria-label="重置到默认工作区" onClick={handleClearWorkspace}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <g transform="translate(0, 0.8)">
                  <path d="M2 7l6-5 6 5" />
                  <path d="M4 6v6h3v-3h2v3h3V6" />
                </g>
              </svg>
            </button>
          </div>
        )}

        {/* 压缩上下文(有会话时显示) */}
        {currentSessionId && (
          <button
            type="button"
            className="top-bar-icon-btn"
            title="压缩上下文"
            aria-label="压缩上下文"
            disabled={compacting || isSending}
            onClick={handleCompact}
          >
            {compacting ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="top-bar-spin">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 14h6m0 0v6m0-6l-6 6M20 10h-6m0 0V4m0 6l6-6" />
              </svg>
            )}
          </button>
        )}

        {/* 打开文件夹 + 最近文件夹下拉(桌面端,hover 展开对齐旧版) */}
        {isDesktop && (
          <div
            ref={folderGroupRef}
            className="header-folder-group"
            onMouseEnter={() => setRecentOpen(true)}
            onMouseLeave={() => setRecentOpen(false)}
          >
            <button
              type="button"
              className="top-bar-icon-btn"
              title="打开工作区文件夹"
              aria-label="打开工作区文件夹"
              onClick={handleOpenFolder}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {recentOpen && (
              <div className="header-folder-dropdown show">
                <div className="header-folder-dropdown-header">最近打开的文件夹</div>
                {recentFolders.length === 0 ? (
                  <div className="header-folder-dropdown-empty">暂无最近文件夹</div>
                ) : (
                  recentFolders.map((f) => (
                    <div
                      key={f}
                      className="header-folder-dropdown-item"
                      title={f}
                      onClick={() => handleSelectRecentFolder(f)}
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
                      </svg>
                      <span className="folder-item-path">{f}</span>
                      <button
                        type="button"
                        className="folder-item-remove"
                        title="移除"
                        aria-label="移除"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRecentFolder(f);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 设置(跳转 Settings 视图,title 对齐旧版"模型配置") */}
        <button
          type="button"
          className="top-bar-icon-btn"
          title="模型配置"
          aria-label="模型配置"
          onClick={handleSettings}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* 主题切换(图标随主题:暗色显示太阳,浅色显示月亮) */}
        <button
          type="button"
          className="top-bar-icon-btn"
          title="切换主题"
          aria-label="切换主题"
          onClick={toggleTheme}
        >
          {isDarkTheme ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* DevTools(桌面端) */}
        {isDesktop && (
          <button
            type="button"
            className="top-bar-icon-btn desktop-only"
            title="打开 DevTools"
            aria-label="打开 DevTools"
            onClick={handleDevTools}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </button>
        )}

        {/* 刷新页面(桌面端) */}
        {isDesktop && (
          <button
            type="button"
            className="top-bar-icon-btn desktop-only"
            title="刷新页面 (Ctrl+F5)"
            aria-label="刷新页面"
            onClick={handleRefresh}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}

        {/* 窗口控制按钮组(桌面端无标题栏时显示) */}
        {isDesktop && (
          <div className="window-controls">
            <button
              type="button"
              className="window-btn window-btn-minimize"
              title="最小化"
              aria-label="最小化"
              onClick={handleMinimize}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="6" x2="10" y2="6" />
              </svg>
            </button>
            <button
              type="button"
              className={`window-btn window-btn-maximize${maximized ? ' is-maximized' : ''}`}
              title={maximized ? '还原' : '最大化'}
              aria-label={maximized ? '还原' : '最大化'}
              onClick={handleMaximizeToggle}
            >
              <svg className="win-icon-maximize" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
              <svg className="win-icon-restore" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="1.5" y="4" width="6.5" height="6.5" rx="1" />
                <path d="M4 4V2.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9.5" />
              </svg>
            </button>
            <button
              type="button"
              className="window-btn window-btn-close"
              title="关闭"
              aria-label="关闭"
              onClick={handleClose}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
                <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
