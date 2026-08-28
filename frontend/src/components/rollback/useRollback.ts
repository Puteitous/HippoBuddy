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
import { translate } from '@/i18n';
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
  const setSessionMessages = useChatStore((s) => s.setSessionMessages);
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
      showToast(translate('rollback.failed') + errMsg(e), { type: 'error', duration: 3000 });
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
      // 捕获「发起回滚的会话」:回滚是一把一把的 REST 请求,期间用户可能切换到
      // 其他会话。后续重载消息必须写回本会话分区,而非「当前选中会话」,
      // 否则会把 A 的回滚结果串入 B(与确认流事件串会话同源的隐患)。
      const sid = currentSessionId;
      try {
        const res = await api.sessions.rewind(sid, {
          messageId: targetId,
          mode,
        });

        if (!res.success) {
          setStatus('idle');
          showToast(translate('rollback.failed') + (res.message || translate('chatui.unknownError')), { type: 'error', duration: 3000 });
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
          showToast(translate('rollback.fileRolledBack'), { type: 'success', duration: 4000 });
          return;
        }

        // 全部回滚:重载会话消息
        const messages = await api.sessions.getMessages(sid);
        if (messages.length === 0) {
          // 会话被清空 → 删除会话(removeSession 会把 currentSessionId 置 null)
          // removeSession(sid) 用显式 id,无论当前选中谁都能正确移除目标会话。
          await api.sessions.delete(sid).catch(() => {
            /* 删除失败不阻塞 UI */
          });
          removeSession(sid);
          showToast(translate('rollback.sessionCleared'), { type: 'info', duration: 4000 });
        } else {
          // 绑定写回「发起回滚的会话」分区:即使期间切到其他会话,也不污染新会话视图
          setSessionMessages(sid, messages);
          if (res.lastUserMessage) {
            // 输入框回填只作用于「当前视图」:仅当仍停留在该会话时才回填,
            // 切换后不把 A 的追问填入 B 的输入框。
            if (useAppStore.getState().currentSessionId === sid) {
              emit('rollback:restoreInput', res.lastUserMessage);
            }
          }
          showToast(translate('rollback.rolledBack'), { type: 'success', duration: 4000 });
        }

        setStatus('idle');
        setPreviewFiles([]);
      } catch (e) {
        // 失败保留面板,允许重试
        setStatus('preview');
        showToast(translate('rollback.failed') + errMsg(e), { type: 'error', duration: 3000 });
      }
    },
    [currentSessionId, status, targetId, setSessionMessages, removeSession, previewFiles],
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
