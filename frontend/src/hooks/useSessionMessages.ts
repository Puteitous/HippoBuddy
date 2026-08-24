/**
 * useSessionMessages - 历史消息加载 Hook
 *
 * 行为:
 *  - 监听 currentSessionId 变化
 *  - 目标会话已有内存流式分区(chatStore.sessionStreams)时:直接复用,不重置不加载,
 *    使「切回正在流式的会话」能无缝续看实时进度(该会话的 SSE 一直在后台写入分区)。
 *  - 目标会话无分区时:初始化空分区,再从缓存(localStorage)/后端加载历史。
 *  - 切走时:若上一会话无活跃流(流已结束),清理其分区释放内存;活跃流会话保留以便切回续看。
 *
 * 设计意图:
 *  - 流式状态按会话分区后,切会话不再需要 reset 清空全局流式缓冲(旧行为会丢失
 *    正在流式会话的进度并造成跨会话串扰),切换副作用集中在此处理。
 *  - 即使切到 Settings 视图,本 Hook 仍由 AppShell 调用,会话切换的副作用不会丢。
 */
import { useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { emit } from '@/utils/eventBus';

export function useSessionMessages(): void {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const resetSessionStream = useChatStore((s) => s.resetSessionStream);
  const hasActiveStream = useChatStore((s) => s.hasActiveStream);
  const setMessages = useChatStore((s) => s.setMessages);
  const setError = useChatStore((s) => s.setError);
  const setIsLoadingMessages = useChatStore((s) => s.setIsLoadingMessages);
  const getCachedMessages = useChatStore((s) => s.getCachedMessages);
  // 记录上一会话 id,用于切走时清理无活跃流分区
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 切走时:若上一会话无活跃流,清理其内存分区(释放内存)。
    // 活跃流会话(正在发送/流式缓冲非空)保留,切回时直接续看实时进度。
    const prev = prevSessionIdRef.current;
    if (prev && prev !== currentSessionId && !hasActiveStream(prev)) {
      resetSessionStream(prev);
    }
    prevSessionIdRef.current = currentSessionId;

    if (!currentSessionId) {
      // hero 空态:无选中会话,无需加载
      return;
    }

    // 目标会话已有内存分区(含活跃流或已固化消息)→ 直接复用,不重置不加载。
    // 这正是"切回正在流式的会话"的关键:分区内是 SSE 后台持续写入的最新状态,
    // 渲染层(useSessionStream)立即读到,实时续看。
    const hasStreamState = !!useChatStore.getState().sessionStreams[currentSessionId];
    if (hasStreamState) {
      setError(null);
      return;
    }

    // 无内存分区:初始化空分区,并从缓存/后端加载历史
    setError(null);
    // 命中缓存:立即展示历史,免除请求等待;仍走后台刷新对齐后端最新数据。
    const cached = getCachedMessages(currentSessionId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setIsLoadingMessages(false);
    } else {
      setIsLoadingMessages(true);
    }

    (async () => {
      try {
        const data = await api.sessions.getMessages(currentSessionId);
        if (cancelled) return;
        setMessages(data);
        // 后端 getMessages 已在返回前同步执行 loadSessionChanges(sessionId),
        // 此时该会话的变更数据已加载进内存。发出信号让依赖该数据的组件
        // (如 FileChangesMonitor) 刷新,而非与其并发请求造成竞态。
        emit('session:messages-loaded', { sessionId: currentSessionId });
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
  }, [currentSessionId, resetSessionStream, hasActiveStream, setMessages, setError, setIsLoadingMessages, getCachedMessages]);
}
