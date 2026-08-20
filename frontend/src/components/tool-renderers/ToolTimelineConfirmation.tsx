/**
 * ToolTimelineConfirmation - timeline 行内的工具确认区(对齐旧版内嵌确认卡片)
 *
 * 当 bash / delete_file 工具处于待确认(pending_confirmation)状态时,
 * 在 timeline 行详情内渲染允许/拒绝按钮与确认摘要,替代旧版全局浮层。
 * 用户决策后调用 chatApi.confirmTool,成功后清除该工具记录的确认数据。
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

/** 判定确认数据是否为 delete_file */
function isDeleteFilePayload(
  p: ToolConfirmationPayload,
): p is DeleteFileToolConfirmationPayload {
  return (p as DeleteFileToolConfirmationPayload).toolType === 'delete_file';
}

/** 判定确认数据是否为 bash */
function isBashPayload(p: ToolConfirmationPayload): p is BashToolConfirmationPayload {
  return !!(p as BashToolConfirmationPayload).command;
}

interface ToolTimelineConfirmationProps {
  /** 挂载到工具记录上的原始确认数据(含 confirmId) */
  confirmationData: ToolConfirmationPayload;
}

export function ToolTimelineConfirmation({ confirmationData }: ToolTimelineConfirmationProps) {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const resolveToolConfirmation = useChatStore((s) => s.resolveToolConfirmation);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (decision: 'allow' | 'deny') => {
    if (submitting) return;
    if (!currentSessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      await chatApi.confirmTool({
        sessionId: currentSessionId,
        confirmId: confirmationData.confirmId,
        decision,
      });
      // 后端接受决策后,清除确认数据,行内确认区消失(工具随后由 tool_result 收口)
      resolveToolConfirmation(confirmationData.confirmId);
    } catch (e) {
      // 后端调用失败不阻塞 UI,允许重试
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
      console.warn('[ToolTimelineConfirmation] confirmTool 调用失败:', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="timeline-detail-confirmation">
      {isBashPayload(confirmationData) && (
        <div className="confirmation-command">
          <pre>{confirmationData.command}</pre>
        </div>
      )}

      {isBashPayload(confirmationData) && confirmationData.riskReason && (
        <div className="confirmation-reason">{confirmationData.riskReason}</div>
      )}

      {isDeleteFilePayload(confirmationData) && (
        <div className="confirmation-delete">
          <div className="confirmation-delete-summary">
            共 {confirmationData.totalCount} 项
            {confirmationData.truncated && ' (列表已截断)'}
          </div>
          {(confirmationData.files.length > 0 || confirmationData.directories.length > 0) && (
            <div className="confirmation-delete-list">
              {confirmationData.files.map((f, i) => (
                <div key={`f-${i}`} className="confirmation-delete-item">
                  文档 {f}
                </div>
              ))}
              {confirmationData.directories.map((d, i) => (
                <div key={`d-${i}`} className="confirmation-delete-item">
                  目录 {d}/
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="timeline-detail-error">{error}</div>}

      <div className="confirmation-footer">
        <div className="confirmation-buttons">
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