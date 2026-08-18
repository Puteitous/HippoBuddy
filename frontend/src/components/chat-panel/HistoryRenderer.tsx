/**
 * HistoryRenderer - 历史消息列表
 *
 * 职责:
 *  - 从 chatStore 读取历史消息并渲染为 MessageBubble 列表
 *  - 在加载中显示骨架占位
 *  - 在错误时显示错误提示
 *  - 在空会话时显示空态提示
 *
 * 历史消息的加载逻辑由 useSessionMessages Hook 负责(在 AppShell 调用),
 * 本组件只读 chatStore.messages / isLoadingMessages / error。
 */
import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAppStore } from '@/stores/appStore';
import { MessageBubble } from './MessageBubble';
import './HistoryRenderer.css';

export function HistoryRenderer() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoadingMessages);
  const error = useChatStore((s) => s.error);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  /** 最近一条 user 消息 id(供 assistant 消息计算回滚目标) */
  const lastUserIdRef = useRef<string | null>(null);

  // 切换会话时重置(避免残留上一会话的 user 消息 id)
  useEffect(() => {
    lastUserIdRef.current = null;
  }, [currentSessionId]);

  if (isLoading) {
    return (
      <div className="history-loading">
        <span className="history-loading-dot" />
        正在加载历史消息…
      </div>
    );
  }

  // 加载错误且无消息时显示错误;有消息时错误视为"过期"(可能是上次中断残留)
  if (error && messages.length === 0) {
    return <div className="history-error">无法加载历史消息:{error}</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="history-empty">
        空会话。在下方输入消息开始对话。
      </div>
    );
  }

  return (
    <div className="history-list">
      {messages.map((m) => {
        // 为每条 assistant 消息计算回滚目标:向前最近的 user 消息 id
        // (回滚 = 截断到该 user 消息及之后,含该消息本身)
        if (m.role === 'user') {
          lastUserIdRef.current = m.id;
          return <MessageBubble key={m.id} message={m} dataMessageId={m.id} />;
        }
        const targetId =
          m.role === 'assistant' && lastUserIdRef.current
            ? lastUserIdRef.current
            : undefined;
        return (
          <MessageBubble
            key={m.id}
            message={m}
            dataMessageId={m.id}
            rollbackTargetId={targetId}
          />
        );
      })}
    </div>
  );
}
