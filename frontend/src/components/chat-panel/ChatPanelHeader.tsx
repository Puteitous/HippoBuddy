/**
 * ChatPanelHeader - 聊天面板头部
 *
 * 对齐旧版 cockpit.html 的 .chat-panel-header:
 *  - 左侧:标题(当前会话名,无则 "Chat")+ 项目名后缀(.chat-panel-project)
 *  - 右侧:历史会话下拉(按时间分组,对齐旧版 updateHistoryDropdown)+ 新建会话 + 收起聊天
 *
 * 与新版 TopBar 的分工:
 *  - TopBar:应用级(品牌名 / 模型选择 / Chat-Workspace-Settings 视图切换)
 *  - ChatPanelHeader:会话级(当前会话标题 / 历史会话快捷切换 / 新建 / 收起聊天面板)
 * 两者职责不重叠,不重复。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { translate, useI18n } from '@/i18n';
import type { Session, SessionMode } from '@/types';

/** 历史下拉最大条数(对齐旧版 MAX_ITEMS = 40) */
const HISTORY_MAX_ITEMS = 40;

type TimeCategory = '今天' | '昨天' | '7天内' | '30天内' | '更早';

/** 按时间戳归类(对齐旧版 sessionManager.groupSessionsByTime) */
function categorize(timestamp: number): TimeCategory {
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();

  if (timestamp >= todayStart) return '今天';
  if (timestamp >= todayStart - day) return '昨天';
  if (timestamp >= todayStart - 7 * day) return '7天内';
  if (timestamp >= todayStart - 30 * day) return '30天内';
  return '更早';
}

/** 会话显示名(对齐旧版:优先 sessionNames / title,兜底 "会话 + 短 id") */
function sessionTitle(
  s: Session,
  displayNames: Record<string, string>,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (s.title && s.title.trim()) return s.title;
  if (displayNames[s.id]) return displayNames[s.id];
  const shortId = s.id.replace(/^web-/, '').slice(-6);
  return shortId ? t('chat.sessionPrefix', { id: shortId }) : t('chat.unnamedSession');
}

interface ChatPanelHeaderProps {
  /** 收起聊天面板(对齐旧版 chatCollapseBtn → chat-panel.collapsed) */
  onCollapse: () => void;
}

/** 模式 i18n key(悬浮面板展示用) */
const MODE_KEYS: Record<SessionMode, string> = {
  chat: 'chat.mode.chat',
  coding: 'chat.mode.code',
  office: 'chat.mode.office',
};

/** 时间分组 → i18n key(分组值本身为内部中文常量,展示时翻译) */
const CATEGORY_KEYS: Record<TimeCategory, string> = {
  '今天': 'session.today',
  '昨天': 'session.yesterday',
  '7天内': 'chat.history7d',
  '30天内': 'chat.history30d',
  '更早': 'session.earlier',
};

export function ChatPanelHeader({ onCollapse }: ChatPanelHeaderProps) {
  const { t } = useI18n();
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const mode = useAppStore((s) => s.mode);
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const createNewSession = useAppStore((s) => s.createNewSession);

  /** 历史下拉是否展开(hover 展开 / 点击钉住 / 点击外部关闭,对齐旧版) */
  const [open, setOpen] = useState(false);
  /** 是否由点击"钉住":open 由 click 触发时,离开 wrapper 不关闭,需再点或点外部才关 */
  const pinnedOpenRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  /** 钉住打开(点击触发),离开也不自动关 */
  const pinOpen = () => {
    pinnedOpenRef.current = true;
    setOpen(true);
  };

  /** 关闭并解除钉住(wrapper 鼠标离开 / 点击外部 / 选择会话 / 新建会话) */
  const closeDropdown = () => {
    pinnedOpenRef.current = false;
    setOpen(false);
  };

  /** 历史项进入编辑(重命名/删除确认)时钉住,防止打字时鼠标移出误关面板 */
  const pinOnEdit = useCallback((editing: boolean) => {
    pinnedOpenRef.current = editing;
    if (editing) setOpen(true);
  }, []);

  // 点击外部关闭下拉(对齐旧版 document click 监听)
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [open]);

  // ── 标题 ────────────────────────────────────────────
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const title = currentSession ? sessionTitle(currentSession, sessionDisplayNames, t) : 'Chat';

  // ── 历史会话分组渲染 ──────────────────────────────────
  const grouped = useMemo(() => groupSessionsByTime(sessions), [sessions]);

  // ── 动作 ──────────────────────────────────────────────
  const handleNewSession = () => {
    // 对齐旧版 createNewSession:生成 web-* 会话 id 并把 hero 待定草稿带入新会话;
    // 首次发送消息时才真正持久化;useSessionMessages 会自动 reset chatStore。
    createNewSession();
    closeDropdown();
  };

  const handleSelectSession = (id: string) => {
    if (id !== currentSessionId) setCurrentSession(id);
    closeDropdown();
  };

  return (
    <div className="chat-panel-header">
      <div className="chat-panel-title-group">
        <span className="chat-panel-title" title={currentSession ? title : undefined}>
          {title}
        </span>
        {(workspacePath || mode) && (
          <div className="chat-panel-title-popover">
            {workspacePath && (
              <div className="popover-row">
                <span className="popover-label">{t('chat.workspacePath')}</span>
                <span className="popover-value">{workspacePath}</span>
              </div>
            )}
            <div className="popover-row">
              <span className="popover-label">{t('chat.currentMode')}</span>
              <span className="popover-value">{t(MODE_KEYS[mode]) ?? mode}</span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-header-actions">
        {/* 历史会话下拉 */}
        <div
          ref={wrapperRef}
          className="chat-history-wrapper"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            // 点击钉住时离开不关闭,悬浮预览态才自动关
            if (!pinnedOpenRef.current) setOpen(false);
          }}
        >
          <button
            type="button"
            className="chat-header-btn"
            title={t('chat.history')}
            aria-label={t('chat.history')}
            aria-expanded={open}
            onClick={() => {
              // 已钉住则点击关闭,否则点击钉住打开(hover 已展开时点击也会转为钉住)
              if (open && pinnedOpenRef.current) closeDropdown();
              else pinOpen();
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.5" />
              <polyline points="8 4.5 8 8 10.5 10" />
            </svg>
          </button>

          {/* 真实元素空隙桥:覆盖按钮与下拉间 4px 间距,避免鼠标下移误触发 mouseleave
              (不能用 ::before 伪元素,其 relatedTarget 解析为 null 会误判离开) */}
          <div className="chat-history-bridge" />

          {open && (
            <div className="chat-history-dropdown">
              {grouped.length === 0 ? (
                <div className="chat-history-empty">{t('chat.noHistory')}</div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category}>
                    <div className="chat-history-category">{t(CATEGORY_KEYS[group.category])}</div>
                    {group.sessions.map((s) => (
                      <HistoryItem
                        key={s.id}
                        session={s}
                        isCurrent={s.id === currentSessionId}
                        onSelect={() => handleSelectSession(s.id)}
                        onPinnedChange={pinOnEdit}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 新建会话 */}
        <button
          type="button"
          className="chat-header-btn"
          title={t('chat.newSession')}
          aria-label={t('chat.newSession')}
          onClick={handleNewSession}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="2" y1="8" x2="14" y2="8" />
          </svg>
        </button>

        {/* 收起聊天(对齐旧版 .panel-toggle-btn) */}
        <button
          type="button"
          className="panel-toggle-btn"
          title={t('chat.collapse')}
          aria-label={t('chat.collapse')}
          onClick={onCollapse}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 4 12 8 4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface HistoryItemProps {
  session: Session;
  isCurrent: boolean;
  onSelect: () => void;
  /** 编辑态(重命名/删除确认)变化时通知父级:进入编辑即钉住面板 */
  onPinnedChange: (editing: boolean) => void;
}

/** 历史下拉中的单条会话项:订阅该会话前端活跃流,流式/工具进行中时显示旋转提示
 *  对齐侧栏会话项交互:悬浮显示重命名/删除,重命名内联编辑,删除内联二次确认 */
function HistoryItem({ session, isCurrent, onSelect, onPinnedChange }: HistoryItemProps) {
  const { t } = useI18n();
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  const updateSession = useAppStore((s) => s.updateSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const streaming = useChatStore(
    (s) =>
      (s.sessionStreams[session.id]?.isSending === true ||
      (s.sessionStreams[session.id]?.stream.length ?? 0) > 0 ||
      (s.sessionStreams[session.id]?.toolCalls.length ?? 0) > 0),
  );
  // 等待确认:存在挂起待决策的工具确认卡,用独立图标与"流式中"的转圈区分(与侧栏会话项一致)
  const awaitingConfirm = useChatStore(
    (s) => (s.sessionStreams[session.id]?.toolCalls ?? []).some((tc) => !!tc.confirmationData),
  );
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const title = sessionTitle(session, sessionDisplayNames, t);

  // 编辑态(重命名/删除确认)变化时通知父级钉住面板,避免打字时鼠标移出误关
  useEffect(() => {
    onPinnedChange(renaming || confirmDelete);
  }, [renaming, confirmDelete, onPinnedChange]);

  // 进入重命名态时回填当前名并聚焦全选(对齐侧栏)
  useEffect(() => {
    if (renaming) {
      setRenameValue(title);
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  /** 提交重命名(blur / Enter 触发),对齐侧栏 submitRename */
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

  /** 执行删除(二次确认后),对齐侧栏 doDelete */
  const doDelete = async () => {
    setBusy(true);
    try {
      await sessionApi.delete(session.id);
      removeSession(session.id);
      // 对齐侧栏:删除当前会话后自动新建临时会话
      if (isCurrent) setCurrentSession(`web-${Date.now()}`);
      showToast(translate('chat.sessionDeleted'), { type: 'success' });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('chat.deleteFailed', { msg }), { type: 'error' });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className={`chat-history-item${isCurrent ? ' active' : ''}`}
      onClick={(e) => {
        // 操作按钮 / 输入框 / 确认条内点击不触发会话切换(对齐侧栏 closest 判断)
        if ((e.target as HTMLElement).closest('.chat-history-actions, .chat-history-rename-input, .chat-history-confirm')) return;
        onSelect();
      }}
      title={title}
    >
      {awaitingConfirm ? (
        <svg
          className="chat-history-awaiting-confirm"
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
        streaming && <span className="chat-history-spinner" aria-label="streaming" />
      )}
      {renaming ? (
        <input
          ref={renameInputRef}
          className="chat-history-rename-input"
          value={renameValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => void submitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitRename();
            else if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : confirmDelete ? (
        <div className="chat-history-confirm" onClick={(e) => e.stopPropagation()}>
          <span className="chat-history-confirm-text">{t('chat.confirmDelete')}</span>
          <button
            type="button"
            className="chat-history-confirm-btn confirm-yes"
            onClick={() => void doDelete()}
            disabled={busy}
            title={t('chat.confirmDeleteTitle')}
          >
            {busy ? '…' : t('session.delete')}
          </button>
          <button
            type="button"
            className="chat-history-confirm-btn confirm-no"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
            title={t('chat.cancel')}
          >
            {t('chat.cancel')}
          </button>
        </div>
      ) : (
        <>
          <span className="history-item-name">{title}</span>
          {/* hover 操作按钮(对齐侧栏 .session-actions) */}
          <div className="chat-history-actions">
            <button
              type="button"
              className="chat-history-action-btn"
              title={t('session.rename')}
              aria-label={t('session.rename')}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
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
              className="chat-history-action-btn"
              title={t('session.delete')}
              aria-label={t('session.delete')}
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(false);
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
      )}
    </div>
  );
}

/** 会话按时间分组(最多 40 条,按最近活跃倒序) */
function groupSessionsByTime(sessions: Session[]): { category: TimeCategory; sessions: Session[] }[] {
  const ordered = [...sessions].sort((a, b) => {
    const ta = Number(a.lastActivityAt ?? a.createdAt) || 0;
    const tb = Number(b.lastActivityAt ?? b.createdAt) || 0;
    return tb - ta;
  });

  const groups = new Map<TimeCategory, Session[]>();
  let total = 0;
  for (const s of ordered) {
    if (total >= HISTORY_MAX_ITEMS) break;
    const ts = Number(s.lastActivityAt ?? s.createdAt) || 0;
    const cat = ts > 0 ? categorize(ts) : '更早';
    const list = groups.get(cat) ?? [];
    list.push(s);
    groups.set(cat, list);
    total++;
  }

  const order: TimeCategory[] = ['今天', '昨天', '7天内', '30天内', '更早'];
  return order
    .filter((cat) => (groups.get(cat)?.length ?? 0) > 0)
    .map((cat) => ({ category: cat, sessions: groups.get(cat)! }));
}
