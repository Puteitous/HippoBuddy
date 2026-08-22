/**
 * useRollback - 回滚交互的状态机与流程逻辑
 *
 * 从旧版 components/RollbackPanel.js 移植,供按钮与确认面板共享:
 *  - 按钮与面板拆分为两个展示组件(RollbackButton / RollbackPanel),
 *    本 hook 在组合组件 RoundRollback 中调用,统一驱动两者的状态。
 *
 * 流程:
 *  1. 点击按钮 → emit('rollback:prepare')(ChatPanel 订阅后中断当前生成)
 *     → 请求 POST /api/sessions/:id/rewind-check 收集目标消息后的文件变更
 *  2. 展示确认面板:文件变更列表(delete/add/restore)+ 取消 / 确认(全部回滚 / 仅回滚文件)
 *  3. 确认 → POST /api/sessions/:id/rewind
 *     - mode='files':仅回滚文件,保留会话,toast 提示
 *     - mode='all':重新加载会话消息;若会话被清空则删除会话;
 *       非空时把 lastUserMessage 通过 emit('rollback:restoreInput') 回填输入框
 *  4. 成功(两种模式)后 emit('rollback:completed', { paths, mode }),PreviewPanel
 *     订阅后刷新被回滚文件的预览(对齐旧版 file:rollback-completed)
 */
import { useCallback, useState } from 'react';
import { api } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { emit } from '@/utils/eventBus';
import { showToast } from '@/utils/toastStore';
import type { RollbackPreviewFile } from '@/types';

/** 回滚面板状态机 */
export type RollbackStatus = 'idle' | 'loading' | 'preview' | 'rolling';

/** 提取错误信息 */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useRollback(targetId: string) {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setMessages = useChatStore((s) => s.setMessages);
  const removeSession = useAppStore((s) => s.removeSession);

  const [status, setStatus] = useState<RollbackStatus>('idle');
  const [previewFiles, setPreviewFiles] = useState<RollbackPreviewFile[]>([]);

  /** 点击回滚按钮:先通知中断生成,再请求预览 */
  const handleOpen = useCallback(async () => {
    if (status !== 'idle' || !currentSessionId) return;
    // 通知 ChatPanel 中断当前生成(若有),避免回滚过程中 Agent 继续写文件
    emit('rollback:prepare', targetId);

    setStatus('loading');
    try {
      const res = await api.sessions.rewindCheck(currentSessionId, { messageId: targetId });
      setPreviewFiles(res.files ?? []);
      setStatus('preview');
    } catch (e) {
      setStatus('idle');
      showToast(`回滚检查失败:${errMsg(e)}`, { type: 'error', duration: 3000 });
    }
  }, [currentSessionId, status, targetId]);

  /** 取消:收起面板 */
  const handleCancel = useCallback(() => {
    setStatus('idle');
    setPreviewFiles([]);
  }, []);

  /** 执行回滚(mode: all=文件+截断会话 / files=仅回滚文件) */
  const handleConfirm = useCallback(
    async (mode: 'all' | 'files') => {
      if (status !== 'preview' || !currentSessionId) return;
      setStatus('rolling');
      try {
        const res = await api.sessions.rewind(currentSessionId, {
          messageId: targetId,
          mode,
        });

        if (!res.success) {
          setStatus('idle');
          showToast(`回滚失败:${res.message || '未知错误'}`, { type: 'error', duration: 3000 });
          return;
        }

        // 通知工作区刷新被回滚文件(对齐旧版 file:rollback-completed 语义:
        // 携带路径列表由监听方精确匹配,避免任意文件导致预览误刷新)
        emit('rollback:completed', {
          paths: previewFiles
            .map((f) => f?.filePath)
            .filter((p): p is string => Boolean(p)),
          mode,
        });

        if (mode === 'files') {
          // 仅回滚文件:保留会话,无需重载消息
          setStatus('idle');
          setPreviewFiles([]);
          showToast('文件已回滚', { type: 'success', duration: 4000 });
          return;
        }

        // 全部回滚:重载会话消息
        const messages = await api.sessions.getMessages(currentSessionId);
        if (messages.length === 0) {
          // 会话被清空 → 删除会话(removeSession 会把 currentSessionId 置 null)
          await api.sessions.delete(currentSessionId).catch(() => {
            /* 删除失败不阻塞 UI */
          });
          removeSession(currentSessionId);
          showToast('会话已清空', { type: 'info', duration: 4000 });
        } else {
          setMessages(messages);
          if (res.lastUserMessage) {
            // 回填输入框,便于用户基于原提问继续
            emit('rollback:restoreInput', res.lastUserMessage);
          }
          showToast('已回滚到指定轮次', { type: 'success', duration: 4000 });
        }

        setStatus('idle');
        setPreviewFiles([]);
      } catch (e) {
        // 失败保留面板,允许重试
        setStatus('preview');
        showToast(`回滚失败:${errMsg(e)}`, { type: 'error', duration: 3000 });
      }
    },
    [currentSessionId, status, targetId, setMessages, removeSession, previewFiles],
  );

  return {
    status,
    previewFiles,
    currentSessionId,
    handleOpen,
    handleCancel,
    handleConfirm,
  };
}
