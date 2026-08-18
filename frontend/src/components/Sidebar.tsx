/**
 * Sidebar - 左侧会话列表
 *
 * 功能:
 *  - 显示 appStore.sessions(加载中/错误/空/列表四态)
 *  - 点击会话切换 currentSessionId
 *  - 高亮当前会话
 *  - 显示会话运行状态(running 标记)
 *
 * 阶段 3.1:只读列表 + 切换。新建/重命名/删除在 3.7(ChatNav)实现。
 */
import { useAppStore } from '@/stores/appStore';
import type { Session } from '@/types';
import './Sidebar.css';

export function Sidebar() {
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const isLoading = useAppStore((s) => s.isLoadingSessions);
  const error = useAppStore((s) => s.sessionsError);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">会话</span>
        <span className="sidebar-count">{sessions.length}</span>
      </div>

      <div className="sidebar-body">
        {isLoading && <p className="sidebar-empty">加载中…</p>}

        {error && (
          <div className="sidebar-error">
            <p>加载会话失败</p>
            <pre>{error}</pre>
          </div>
        )}

        {!isLoading && !error && sessions.length === 0 && (
          <p className="sidebar-empty">暂无会话</p>
        )}

        {!isLoading && !error && sessions.length > 0 && (
          <ul className="session-list">
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === currentSessionId}
                onSelect={() => setCurrentSession(s.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

interface SessionItemProps {
  session: Session;
  active: boolean;
  onSelect: () => void;
}

function SessionItem({ session, active, onSelect }: SessionItemProps) {
  const title = session.title || '未命名会话';
  const time = formatTime(session.lastActivityAt ?? session.createdAt);

  return (
    <li
      className={`session-item ${active ? 'session-item-active' : ''}`}
      onClick={onSelect}
      title={title}
    >
      <div className="session-item-title">
        {session.running && <span className="session-running-dot" aria-label="running" />}
        <span className="session-item-name">{title}</span>
      </div>
      <div className="session-item-meta">
        <span className="session-item-mode">{session.mode ?? 'chat'}</span>
        <span className="session-item-time">{time}</span>
      </div>
    </li>
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
