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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { Session } from '@/types';

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
function sessionTitle(s: Session): string {
  if (s.title && s.title.trim()) return s.title;
  const shortId = s.id.replace(/^web-/, '').slice(-6);
  return shortId ? `会话 ${shortId}` : '未命名会话';
}

interface ChatPanelHeaderProps {
  /** 收起聊天面板(对齐旧版 chatCollapseBtn → chat-panel.collapsed) */
  onCollapse: () => void;
}

export function ChatPanelHeader({ onCollapse }: ChatPanelHeaderProps) {
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);

  /** 历史下拉是否展开(hover 展开 / 点击外部关闭,对齐旧版) */
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭下拉(对齐旧版 document click 监听)
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [open]);

  // ── 标题与项目名 ──────────────────────────────────────
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const title = currentSession ? sessionTitle(currentSession) : 'Chat';
  const projectName = workspacePath
    ? workspacePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''
    : '';

  // ── 历史会话分组渲染 ──────────────────────────────────
  const grouped = useMemo(() => groupSessionsByTime(sessions), [sessions]);

  // ── 动作 ──────────────────────────────────────────────
  const handleNewSession = () => {
    // 对齐旧版 createNewSession:前端生成 web-<timestamp> 会话 id,
    // 首次发送消息时才真正持久化;useSessionMessages 会自动 reset chatStore。
    const id = `web-${Date.now()}`;
    setCurrentSession(id);
    setOpen(false);
  };

  const handleSelectSession = (id: string) => {
    if (id !== currentSessionId) setCurrentSession(id);
    setOpen(false);
  };

  return (
    <div className="chat-panel-header">
      <div className="chat-panel-title-group">
        <span className="chat-panel-title" title={currentSession ? title : undefined}>
          {title}
        </span>
        {projectName && <span className="chat-panel-project">{projectName}</span>}
      </div>

      <div className="chat-header-actions">
        {/* 历史会话下拉 */}
        <div
          ref={wrapperRef}
          className="chat-history-wrapper"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            className="chat-header-btn"
            title="历史会话"
            aria-label="历史会话"
            aria-expanded={open}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.5" />
              <polyline points="8 4.5 8 8 10.5 10" />
            </svg>
          </button>

          {open && (
            <div className="chat-history-dropdown">
              {grouped.length === 0 ? (
                <div className="chat-history-empty">暂无历史会话</div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category}>
                    <div className="chat-history-category">{group.category}</div>
                    {group.sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`chat-history-item${s.id === currentSessionId ? ' active' : ''}`}
                        onClick={() => handleSelectSession(s.id)}
                        title={sessionTitle(s)}
                      >
                        <span className="history-item-name">{sessionTitle(s)}</span>
                      </div>
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
          title="新建会话"
          aria-label="新建会话"
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
          title="收起聊天"
          aria-label="收起聊天"
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
