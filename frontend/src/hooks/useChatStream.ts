/**
 * useChatStream - 流式对话 Hook(薄封装)
 *
 * 发送/中断的真实逻辑已收敛到 chatStore.sendUserMessage / abortUserMessage,
 * AbortController 由 chatStore 模块层持有,供主输入框、重试与 AskUserCard 答复
 * 共用同一请求通道。
 *
 * 本 Hook 仅负责:
 *  - 暴露 send / abort / isSending 稳定接口
 *  - 不再绑定生命周期(unmount 时自动 abort),避免任一持有该 Hook 的组件
 *    在正常卸载(如 ask 卡片提交后转为只读)时误终止仍应继续的流。
 */
import { useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStream } from '@/hooks/useSessionStream';
import type { ChatRequest } from '@/types';

export interface UseChatStreamResult {
  /** 发送消息(启动 SSE 流)。返回值表示是否成功发起请求。 */
  send: (message: string, options?: {
    mode?: ChatRequest['mode'];
    images?: string[];
    selectedRules?: string[];
  }) => Promise<boolean>;
  /** 中断当前流式请求 */
  abort: () => void;
  /** 是否正在发送 */
  isSending: boolean;
}

export function useChatStream(): UseChatStreamResult {
  const { isSending } = useSessionStream();
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const abortUserMessage = useChatStore((s) => s.abortUserMessage);

  const send = useCallback(
    (message: string, options?: {
      mode?: ChatRequest['mode'];
      images?: string[];
      selectedRules?: string[];
    }) => sendUserMessage(message, options),
    [sendUserMessage],
  );
  const abort = useCallback(() => abortUserMessage(), [abortUserMessage]);

  return { send, abort, isSending };
}