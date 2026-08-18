/**
 * ConfirmHandler - 工具确认弹窗
 *
 * 监听 chatStore.pendingConfirmations,渲染确认弹窗。
 *
 * 适用场景:
 *  - bash 高风险命令执行前需用户确认
 *  - delete_file 删除文件前需用户确认
 *
 * 用户操作:
 *  - 「允许」:调用 chatApi.confirmTool({ decision: 'allow' })
 *  - 「拒绝」:调用 chatApi.confirmTool({ decision: 'deny' })
 *  - 决策后从 pendingConfirmations 出队(dequeueConfirmation)
 *  - 后端调用失败时仅 console.warn,不阻塞 UI(用户可重试)
 *
 * 注:一次只处理队首的确认请求(避免多个弹窗叠加)。
 *     弹窗以浮层形式显示在屏幕中央,不嵌入消息流。
 */
import { useState } from 'react';
import { chatApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import type {
  BashToolConfirmationPayload,
  DeleteFileToolConfirmationPayload,
  ToolConfirmationPayload,
} from '@/types/sse';
import './ConfirmHandler.css';

/** 判定 payload 是否为 delete_file 确认 */
function isDeleteFilePayload(p: ToolConfirmationPayload): p is DeleteFileToolConfirmationPayload {
  return (p as DeleteFileToolConfirmationPayload).toolType === 'delete_file';
}

/** 判定 payload 是否为 bash 确认 */
function isBashPayload(p: ToolConfirmationPayload): p is BashToolConfirmationPayload {
  return !!(p as BashToolConfirmationPayload).command;
}

export function ConfirmHandler() {
  const pendingConfirmations = useChatStore((s) => s.pendingConfirmations);
  const dequeueConfirmation = useChatStore((s) => s.dequeueConfirmation);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const [submitting, setSubmitting] = useState(false);

  // 队列为空时不渲染
  if (pendingConfirmations.length === 0) return null;

  const current = pendingConfirmations[0];

  const handleDecision = async (decision: 'allow' | 'deny') => {
    if (submitting) return;
    if (!currentSessionId) return;
    setSubmitting(true);
    try {
      await chatApi.confirmTool({
        sessionId: currentSessionId,
        confirmId: current.confirmId,
        decision,
      });
      // 后端确认成功,出队
      dequeueConfirmation(current.confirmId);
    } catch (e) {
      // 后端调用失败,不阻塞 UI,允许重试
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      console.warn('[ConfirmHandler] confirmTool 调用失败:', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog">
        <div className="confirm-header">
          <span className="confirm-icon">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" />
              <line x1="8" y1="5" x2="8" y2="9" />
              <line x1="8" y1="11" x2="8.01" y2="11" />
            </svg>
          </span>
          <span className="confirm-title">
            {isDeleteFilePayload(current) ? '确认删除文件' : '确认执行命令'}
          </span>
        </div>

        <div className="confirm-body">
          {isBashPayload(current) && (
            <>
              <div className="confirm-command">
                <pre>{(current as BashToolConfirmationPayload).command}</pre>
              </div>
              {(current as BashToolConfirmationPayload).riskReason && (
                <div className="confirmation-reason">
                  {(current as BashToolConfirmationPayload).riskReason}
                </div>
              )}
            </>
          )}

          {isDeleteFilePayload(current) && (
            <>
              <div className="confirm-delete-summary">
                共 {(current as DeleteFileToolConfirmationPayload).totalCount} 项
                {(current as DeleteFileToolConfirmationPayload).truncated && ' (列表已截断)'}
              </div>
              <div className="confirm-delete-list">
                {(current as DeleteFileToolConfirmationPayload).files.map((f, i) => (
                  <div key={`f-${i}`} className="confirm-delete-item">📄 {f}</div>
                ))}
                {(current as DeleteFileToolConfirmationPayload).directories.map((d, i) => (
                  <div key={`d-${i}`} className="confirm-delete-item">📁 {d}/</div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="confirm-footer">
          <button
            type="button"
            className="confirmation-btn deny"
            onClick={() => void handleDecision('deny')}
            disabled={submitting}
          >
            拒绝
          </button>
          <button
            type="button"
            className="confirmation-btn allow"
            onClick={() => void handleDecision('allow')}
            disabled={submitting}
          >
            {submitting ? '处理中…' : '允许'}
          </button>
        </div>
      </div>
    </div>
  );
}
