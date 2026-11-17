/**
 * SessionTabs - 会话标签栏
 *
 * 与 ChatPanelHeader 合并成一条(左侧标签、右侧操作):
 *  - 标签集合由 appStore.openTabs 维护,切换会话时自动加入,超限淘汰最久未激活的
 *  - 只负责视图切换:关闭标签不删除会话,会话仍可从 Sidebar / 历史下拉找回
 *  - 状态徽标直接复用 chatStore 的会话分区:运行中转圈、完成未读蓝点
 *  - 中键关闭标签(对齐浏览器/编辑器习惯)
 *  - 右键菜单:关闭当前/其他/右侧/全部 + 重命名、置顶、删除会话
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sessionApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useI18n, translate } from '@/i18n';
import { showToast } from '@/utils/toastStore';
import { sessionTitle } from '@/utils/session-title';

interface SessionTabProps {
  id: string;
  title: string;
  active: boolean;
  /** 是否处于重命名态(标题替换为输入框) */
  renaming: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
  onRenameSubmit: (id: string, value: string) => void;
  onRenameCancel: () => void;
}

/** 单个标签:独立订阅自己的会话分区,避免流式进度导致整栏重渲染 */
function SessionTab({
  id,
  title,
  active,
  renaming,
  onSelect,
  onClose,
  onMenu,
  onRenameSubmit,
  onRenameCancel,
}: SessionTabProps) {
  const { t } = useI18n();
  // 运行中:发送中 / 有流式缓冲 / 有工具调用(与侧栏、历史下拉的判定一致)
  const running = useChatStore((s) => {
    const st = s.sessionStreams[id];
    return !!st && (st.isSending || st.stream.length > 0 || st.toolCalls.length > 0);
  });
  // 完成未读:会话在后台跑完且用户尚未切回(切回时由 chatStore 清除)
  const unread = useChatStore((s) => s.sessionStreams[id]?.completedUnread === true);

  // Esc 取消时置位,避免随后的 blur 又把旧值提交一遍
  const cancelRenameRef = useRef(false);
  const [renameValue, setRenameValue] = useState(title);
  useEffect(() => {
    if (renaming) {
      cancelRenameRef.current = false;
      setRenameValue(title);
    }
  }, [renaming, title]);

  if (renaming) {
    return (
      <div className={`session-tab${active ? ' active' : ''}`} title={title}>
        <input
          autoFocus
          className="session-tab-rename"
          value={renameValue}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setRenameValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => {
            if (!cancelRenameRef.current) onRenameSubmit(id, renameValue);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              cancelRenameRef.current = true;
              onRenameCancel();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`session-tab${active ? ' active' : ''}`}
      title={title}
      onClick={() => onSelect(id)}
      onContextMenu={(e) => onMenu(e, id)}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onClose(id);
      }}
    >
      {running ? (
        <span className="session-tab-spinner" aria-label={t('chat.tabRunning')} />
      ) : unread ? (
        <span className="session-tab-dot" aria-label={t('chat.tabUnread')} />
      ) : null}
      <span className="session-tab-title">{title}</span>
      <button
        type="button"
        className="session-tab-close"
        title={t('chat.tabClose')}
        aria-label={t('chat.tabClose')}
        onClick={(e) => {
          e.stopPropagation();
          onClose(id);
        }}
      >
        ×
      </button>
    </div>
  );
}

/** 右键菜单状态(菜单作用于 id 指向的标签,不切换当前会话) */
interface MenuState {
  x: number;
  y: number;
  id: string;
}

interface MenuItem {
  action: string;
  label: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

export function SessionTabs() {
  const { t } = useI18n();
  const openTabs = useAppStore((s) => s.openTabs);
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  const sessionTabLimit = useAppStore((s) => s.sessionTabLimit);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeTabs = useAppStore((s) => s.closeTabs);
  const createNewSession = useAppStore((s) => s.createNewSession);
  const updateSession = useAppStore((s) => s.updateSession);
  const removeSession = useAppStore((s) => s.removeSession);

  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );

  const listRef = useRef<HTMLDivElement | null>(null);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // 兜底:刷新后恢复的当前会话(或其它入口直接设置 currentSessionId)不在标签栏时补一个标签
  useEffect(() => {
    if (!currentSessionId || openTabs.includes(currentSessionId)) return;
    const known =
      currentSessionId.startsWith('web-') || sessions.some((s) => s.id === currentSessionId);
    if (known) setCurrentSession(currentSessionId);
  }, [currentSessionId, openTabs, sessions, setCurrentSession]);

  // 激活标签被挤出可视区时横向滚动到可见位置
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('.session-tab.active');
    // scrollIntoView 在 jsdom 等测试环境不存在,可选调用避免测试环境报错
    active?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [currentSessionId, openTabs.length]);

  /**
   * 滚轮横向滚动:横向溢出容器默认不响应垂直滚轮,这里把滚轮位移转成 scrollLeft。
   * 必须用原生监听并 passive:false —— React 的 onWheel 是 passive 的,preventDefault 无效。
   * 未溢出时不拦截,滚轮仍作用在页面/消息区上。
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // 触控板横向滑动优先用 deltaX,否则用垂直滚轮驱动横向
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      // deltaMode: 0=像素(Chrome/Electron), 1=行(Firefox), 2=页
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += delta * unit;
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // 点击其它位置 / 键盘 Esc 关闭右键菜单
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // 延迟一帧绑定,避免本次右键事件立即关闭
    const id = window.setTimeout(() => document.addEventListener('pointerdown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const titleOf = useCallback(
    (id: string) => {
      const s = sessionById.get(id);
      // 虚拟会话(新建未发送)不在 sessions 列表中,用 id 兜底生成显示名
      return sessionTitle(s ?? { id, title: '' }, sessionDisplayNames, t);
    },
    [sessionById, sessionDisplayNames, t],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (id !== currentSessionId) setCurrentSession(id);
    },
    [currentSessionId, setCurrentSession],
  );

  const handleMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    // 定位菜单并保证不超出视口(菜单高度按最多 8 项估算)
    const menuW = 176;
    const menuH = 8 * 30 + 2 * 7 + 8;
    let left = e.clientX;
    let top = e.clientY;
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
    if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
    setMenu({ x: Math.max(4, left), y: Math.max(4, top), id });
  }, []);

  // 会话操作只在已落库的会话上提供;虚拟会话(web-*)仅能关闭
  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const session = sessionById.get(menu.id);
    if (!session) {
      return [
        { action: 'close', label: t('chat.tabCloseCurrent') },
        { action: 'close-all', label: t('chat.tabCloseAll') },
      ];
    }
    return [
      { action: 'close', label: t('chat.tabCloseCurrent') },
      { action: 'close-others', label: t('chat.tabCloseOthers') },
      { action: 'close-right', label: t('chat.tabCloseRight') },
      { action: 'close-all', label: t('chat.tabCloseAll') },
      { action: 'rename', label: t('session.rename'), separatorBefore: true },
      { action: 'pin', label: session.pinned ? t('sidebar.unpin') : t('sidebar.pin') },
      { action: 'delete', label: t('session.delete'), danger: true, separatorBefore: true },
    ];
  }, [menu, sessionById, t]);

  /** 重命名提交:同 Value 直接退出,否则写后端并同步列表标题 */
  const handleRenameSubmit = useCallback(
    async (id: string, value: string) => {
      const title = titleOf(id);
      const next = value.trim();
      setRenamingId(null);
      if (!next || next === title) return;
      try {
        await sessionApi.rename(id, next);
        updateSession(id, { title: next });
      } catch (e) {
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        showToast(translate('chat.renameFailed', { msg }), { type: 'error' });
      }
    },
    [titleOf, updateSession],
  );

  /** 删除会话(已二次确认);removeSession 内部会同步移出标签并处理激活回落 */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await sessionApi.delete(id);
      removeSession(id);
      showToast(translate('chat.sessionDeleted'), { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('chat.deleteFailed', { msg }), { type: 'error' });
    }
  }, [deleteTarget, removeSession]);

  const runMenuAction = useCallback(
    async (action: string) => {
      if (!menu) return;
      const id = menu.id;
      setMenu(null);
      switch (action) {
        case 'close':
          closeTab(id);
          break;
        case 'close-others':
          closeTabs(openTabs.filter((tabId) => tabId !== id));
          break;
        case 'close-right': {
          const idx = openTabs.indexOf(id);
          if (idx >= 0) closeTabs(openTabs.slice(idx + 1));
          break;
        }
        case 'close-all':
          closeTabs([...openTabs]);
          break;
        case 'rename':
          setRenamingId(id);
          break;
        case 'pin': {
          const session = sessionById.get(id);
          if (!session) break;
          const pinned = !session.pinned;
          try {
            await sessionApi.pin(id, pinned);
            updateSession(id, { pinned });
            showToast(
              pinned ? translate('sidebar.pinnedSuccess') : translate('sidebar.unpinned'),
              { type: 'success' },
            );
          } catch (e) {
            const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
            showToast(translate('sidebar.pinFailed', { msg }), { type: 'error' });
          }
          break;
        }
        case 'delete':
          setDeleteTarget({ id, title: titleOf(id) });
          break;
        default:
          break;
      }
    },
    [menu, closeTab, closeTabs, openTabs, sessionById, updateSession, titleOf],
  );

  return (
    <>
      <div className="session-tabs-scroll" ref={listRef}>
        {openTabs.map((id) => (
          <SessionTab
            key={id}
            id={id}
            title={titleOf(id)}
            active={id === currentSessionId}
            renaming={renamingId === id}
            onSelect={handleSelect}
            onClose={closeTab}
            onMenu={handleMenu}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingId(null)}
          />
        ))}
      </div>

      {/* 上限为 0 表示不限,只显示当前数量 */}
      <span className="session-tabs-count" title={t('chat.tabLimit')}>
        {sessionTabLimit > 0 ? `${openTabs.length}/${sessionTabLimit}` : openTabs.length}
      </span>

      <button
        type="button"
        className="session-tab-new"
        title={t('chat.newSession')}
        aria-label={t('chat.newSession')}
        onClick={() => createNewSession()}
      >
        +
      </button>

      {/* 右键菜单(portal 渲染,避免被标签栏 overflow 裁剪) */}
      {menu &&
        createPortal(
          <div
            className="session-tabs-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menuItems.map((item) => (
              <Fragment key={item.action}>
                {item.separatorBefore && <div className="session-tabs-menu-sep" />}
                <div
                  className={`session-tabs-menu-item${item.danger ? ' danger' : ''}`}
                  onClick={() => void runMenuAction(item.action)}
                >
                  {item.label}
                </div>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}

      {/* 删除会话确认(破坏性操作,二次确认) */}
      {deleteTarget &&
        createPortal(
          <div
            className="file-tree-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeleteTarget(null);
            }}
          >
            <div className="file-tree-modal">
              <div className="file-tree-modal-header">
                <span className="file-tree-modal-title">{t('session.delete')}</span>
              </div>
              <div className="file-tree-modal-body">
                <p className="file-tree-modal-message">
                  {t('chat.tabDeleteConfirm', { name: deleteTarget.title })}
                </p>
              </div>
              <div className="file-tree-modal-footer">
                <button
                  type="button"
                  className="file-tree-modal-btn"
                  onClick={() => setDeleteTarget(null)}
                >
                  {t('fileTree.cancelBtn')}
                </button>
                <button
                  type="button"
                  className="file-tree-modal-btn file-tree-modal-btn-danger"
                  onClick={() => void handleDeleteConfirm()}
                >
                  {t('deleteConfirm.confirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
