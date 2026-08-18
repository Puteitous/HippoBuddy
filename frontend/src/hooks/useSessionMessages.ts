/**
 * useSessionMessages - 历史消息加载 Hook
 *
 * 行为:
 *  - 监听 currentSessionId 变化
 *  - 切换会话时先 reset chatStore(清空上一次会话的 messages/toolCalls/流式缓冲)
 *  - 再调用 api.sessions.getMessages 加载历史,写入 chatStore.messages
 *  - 维护 isLoadingMessages 状态(供 HistoryRenderer 显示 loading)
 *
 * 设计意图:
 *  - 把"切会话"的状态清理与历史加载集中到一处,避免 AppShell/ChatPanel 各自处理
 *  - 即使切到 Settings 视图,本 Hook 仍由 AppShell 调用,会话切换的副作用不会丢
 */
import { useEffect } from 'react';
import { api } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';

export function useSessionMessages(): void {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const reset = useChatStore((s) => s.reset);
  const setMessages = useChatStore((s) => s.setMessages);
  const setError = useChatStore((s) => s.setError);
  const setIsLoadingMessages = useChatStore((s) => s.setIsLoadingMessages);

  useEffect(() => {
    let cancelled = false;

    // 切换会话:先重置整个 chatStore(包括上一次的 messages/toolCalls/缓冲)
    reset();
    setError(null);

    if (!currentSessionId) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    (async () => {
      try {
        const data = await api.sessions.getMessages(currentSessionId);
        if (cancelled) return;
        setMessages(data);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setError(msg);
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, reset, setMessages, setError, setIsLoadingMessages]);
}
