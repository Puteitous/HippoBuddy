/**
 * useSessionStream - 读取当前会话的流式分区状态
 *
 * 流式状态按会话分区存储在 chatStore.sessionStreams 中(见 chatStore)。
 * 本 hook 返回当前会话的分区对象,组件解构其中的 messages / stream /
 * toolCalls / isSending 等字段,使渲染层始终只读「当前会话」的状态,
 * 避免其他会话的后台流串入当前视图。
 *
 * 会话无分区时返回稳定的只读空态(EMPTY_SESSION_STREAM 常量引用),
 * 避免切到无内存态会话时无限重渲染。
 */
import { useAppStore } from '@/stores/appStore';
import { useChatStore, EMPTY_SESSION_STREAM, type SessionStreamState } from '@/stores/chatStore';

export function useSessionStream(): SessionStreamState {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  return useChatStore((s) =>
    currentSessionId
      ? (s.sessionStreams[currentSessionId] ?? EMPTY_SESSION_STREAM)
      : EMPTY_SESSION_STREAM,
  );
}
