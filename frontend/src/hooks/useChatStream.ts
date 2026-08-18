/**
 * useChatStream - 流式对话 Hook
 *
 * 封装:
 *  - 启动 streamSse 并将事件分发到 chatStore.handleSseEvent
 *  - 维护 AbortController,提供 abort()
 *  - 发送前置:本地立即追加用户消息(乐观更新),设置 isSending
 *  - 异常处理:网络错误 / 用户中断 / 后端 SSE error 事件统一落到 chatStore.error
 *  - 中断时:同步调用 chatApi.abortTool 通知后端停止 Agent 循环,
 *    并把已累积的流式内容 commitStreamingMessage 到 messages
 *
 * 阶段 3.2:接入 ChatPanel,提供完整的发送/中断闭环。
 */
import { useCallback, useEffect, useRef } from 'react';
import { chatApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import type { ChatRequest, Message } from '@/types';

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
  const abortRef = useRef<AbortController | null>(null);

  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const mode = useAppStore((s) => s.mode);
  const isSending = useChatStore((s) => s.isSending);

  // 直接从 store 取最新方法引用,避免闭包过期
  const handleSseEvent = useChatStore((s) => s.handleSseEvent);
  const setIsSending = useChatStore((s) => s.setIsSending);
  const setError = useChatStore((s) => s.setError);
  const addMessage = useChatStore((s) => s.addMessage);
  const resetStreaming = useChatStore((s) => s.resetStreaming);
  const commitStreamingMessage = useChatStore((s) => s.commitStreamingMessage);
  // 清空上一轮工具调用记录(已固化为 messages 中的 tool role 消息)
  const clearToolCalls = useChatStore((s) => s.clearToolCalls);

  // 组件卸载时中断未完成的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (
      message: string,
      options?: {
        mode?: ChatRequest['mode'];
        images?: string[];
        selectedRules?: string[];
      },
    ): Promise<boolean> => {
      // ── 前置校验 ───────────────────────────────────────────
      if (!currentSessionId) {
        setError('未选中会话,无法发送消息。');
        return false;
      }
      if (!message.trim()) {
        setError('消息内容不能为空。');
        return false;
      }
      if (isSending) {
        // 已有请求进行中,避免并发
        return false;
      }

      // ── 乐观更新:本地立即追加用户消息 ─────────────────────
      const userMessage: Message = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: message,
      };
      addMessage(userMessage);

      // ── 重置流式缓冲,进入发送状态 ─────────────────────────
      resetStreaming();
      // 清空上一轮工具调用记录(已固化为 messages 中的 tool role 消息)
      clearToolCalls();
      setIsSending(true);
      setError(null);

      // ── 创建 AbortController ───────────────────────────────
      const controller = new AbortController();
      abortRef.current = controller;

      const request: ChatRequest = {
        sessionId: currentSessionId,
        message,
        mode: options?.mode ?? mode,
        images: options?.images,
        selectedRules: options?.selectedRules,
      };

      try {
        await chatApi.stream(
          request,
          (event) => handleSseEvent(event),
          controller.signal,
        );
        return true;
      } catch (e) {
        // 用户主动中断:AbortError
        if (e instanceof DOMException && e.name === 'AbortError') {
          // 提交已累积的半成品内容(若有),保留可见进度
          commitStreamingMessage();
          setIsSending(false);
          return false;
        }
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setError(msg);
        setIsSending(false);
        return false;
      } finally {
        abortRef.current = null;
      }
    },
    [
      currentSessionId,
      mode,
      isSending,
      handleSseEvent,
      setIsSending,
      setError,
      addMessage,
      resetStreaming,
      clearToolCalls,
      commitStreamingMessage,
    ],
  );

  const abort = useCallback(() => {
    // 1. 客户端终止 fetch
    abortRef.current?.abort();
    // 2. 通知后端停止 Agent 循环(防止后端继续消耗 token)
    if (currentSessionId) {
      void chatApi
        .abortTool({ sessionId: currentSessionId })
        .catch((e) => {
          // 后端中断失败不应阻塞 UI,仅记录到控制台
          console.warn('[useChatStream] 后端 abortTool 调用失败:', e);
        });
    }
    // 3. 提交已累积的半成品内容
    commitStreamingMessage();
    // 4. 结束发送状态
    setIsSending(false);
  }, [currentSessionId, commitStreamingMessage, setIsSending]);

  return { send, abort, isSending };
}
