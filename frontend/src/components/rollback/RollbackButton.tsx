/**
 * RollbackButton - 助手消息的"回滚到该轮之前"按钮 + 内联确认面板
 *
 * 对标旧版 components/RollbackPanel.js,流程:
 *  1. 点击按钮 → emit('rollback:prepare')(ChatPanel 订阅后中断当前生成)
 *     → 请求 POST /api/sessions/:id/rewind-check 收集目标消息后的文件变更
 *  2. 展示内联面板:文件变更列表(delete/add/restore)+ 取消 / 确认(全部回滚 / 仅回滚文件)
 *  3. 确认 → POST /api/sessions/:id/rewind
 *     - mode='files':仅回滚文件,保留会话,toast 提示
 *     - mode='all':重新加载会话消息;若会话被清空则删除会话;
 *       非空时把 lastUserMessage 通过 emit('rollback:restoreInput') 回填输入框
 *  4. 成功(两种模式)后 emit('rollback:completed', { paths, mode }),WorkspacePanel
 *     订阅后刷新被回滚文件的预览(3.8,对齐旧版 file:rollback-completed)
 *
 * 阶段 3.7-2 简化:
 *  - 面板内嵌在消息气泡内(旧版为独立 860px 块),宽度自适应
 *  - 文件图标用状态字母(D/A/M)替代旧版 file-icons 图片
 *  - 下拉选项用 CSS hover 展开(对齐旧版行为)
 *  - 中文硬编码,不引入 i18n
 */
import { useCallback, useState } from 'react';
import { api } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { emit } from '@/utils/eventBus';
import { showToast } from '@/utils/toastStore';
import type { RollbackPreviewFile } from '@/types';
import './RollbackButton.css';

/** 回滚面板状态机 */
type RollbackStatus = 'idle' | 'loading' | 'preview' | 'rolling';

interface RollbackButtonProps {
  /**
   * 回滚目标用户消息 id(该 assistant 消息之前最近的 user 消息)。
   * 后端将截断到该消息(含)之后的所有内容,并回滚其后的文件变更。
   */
  targetId: string;
}

export function RollbackButton({ targetId }: RollbackButtonProps) {
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

  // ── idle:仅回滚按钮 ────────────────────────────────────
  if (status === 'idle') {
    return (
      <button
        type="button"
        className="rollback-btn"
        title="回滚到该轮之前(文件与会话)"
        aria-label="回滚"
        onClick={handleOpen}
        disabled={!currentSessionId}
      >
        ↩
      </button>
    );
  }

  // ── loading / rolling:加载态 ────────────────────────────
  if (status === 'loading' || status === 'rolling') {
    return (
      <div className="rollback-inline rollback-inline-loading">
        <svg className="rollback-loading-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
        </svg>
        {status === 'loading' ? '正在检查文件变更…' : '正在回滚…'}
      </div>
    );
  }

  // ── preview:内联确认面板 ───────────────────────────────
  const changedFiles = previewFiles.filter(
    (f) => f.action === 'delete' || f.action === 'add' || f.action === 'restore',
  );

  return (
    <div className="rollback-inline">
      <div className="rollback-inline-header">
        <span className="rollback-inline-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <line x1="8" y1="5" x2="8" y2="9" />
            <line x1="8" y1="11" x2="8" y2="11.5" />
          </svg>
        </span>
        <span>回滚到该轮之前</span>
        <span className="rollback-inline-count">
          {changedFiles.length > 0 ? `${changedFiles.length} 个文件变更` : '无文件变更'}
        </span>
      </div>

      {changedFiles.length > 0 && (
        <>
          <div className="rollback-inline-files">
            {changedFiles.map((f) => {
              const info = actionInfo(f.action);
              return (
                <div key={f.filePath} className={`rollback-inline-file ${info.cls}`}>
                  <span className={`file-status-letter ${info.cls}`}>{info.letter}</span>
                  <span className="file-name" title={f.filePath}>{f.filePath}</span>
                  <span className="file-action-badge">{info.label}</span>
                  {(f.insertions > 0 || f.deletions > 0) && (
                    <span className="diff-stats">
                      {f.insertions > 0 && <span className="diff-add">+{f.insertions}</span>}
                      {f.deletions > 0 && <span className="diff-del">-{f.deletions}</span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rollback-inline-divider" />
        </>
      )}

      <div className="rollback-inline-footer">
        <button
          type="button"
          className="rollback-inline-btn rollback-inline-btn-cancel"
          onClick={handleCancel}
        >
          取消
        </button>
        <span className="rollback-inline-split">
          <button
            type="button"
            className="rollback-inline-btn rollback-inline-btn-confirm"
            onClick={() => handleConfirm('all')}
          >
            回滚
          </button>
          <button type="button" className="rollback-inline-split-toggle" title="更多选项" aria-label="更多选项">
            ▾
          </button>
          <span className="rollback-inline-split-dropdown">
            <button
              type="button"
              className="rollback-inline-btn rollback-inline-btn-confirm"
              onClick={() => handleConfirm('all')}
            >
              <span className="dropdown-check">✓</span>全部回滚(文件 + 会话)
            </button>
            <button
              type="button"
              className="rollback-inline-btn rollback-inline-btn-files"
              onClick={() => handleConfirm('files')}
            >
              <span className="dropdown-check-placeholder" />仅回滚文件
            </button>
          </span>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

/** 提取错误信息 */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 文件动作 → 状态字母 / 样式类 / 中文标签 */
function actionInfo(action: RollbackPreviewFile['action']): {
  letter: string;
  cls: 'action-delete' | 'action-add' | 'action-restore';
  label: string;
} {
  switch (action) {
    case 'delete':
      return { letter: 'D', cls: 'action-delete', label: '回滚后删除' };
    case 'add':
      return { letter: 'A', cls: 'action-add', label: '回滚后还原' };
    case 'restore':
      return { letter: 'M', cls: 'action-restore', label: '回滚后恢复' };
  }
}
