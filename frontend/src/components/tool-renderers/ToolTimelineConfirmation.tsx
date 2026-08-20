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

/** 风险徽章文案(对齐旧版 i18n tool.confirm.*) */
function riskLabel(level: string): string {
  if (level === 'high') return '高风险';
  if (level === 'low') return '低风险';
  return '中风险';
}

/** 风险警告图标(圆圈感叹号,对齐旧版 confirmation.js) */
function RiskIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" />
      <line x1="8" y1="5" x2="8" y2="9" />
      <line x1="8" y1="11" x2="8.01" y2="11" />
    </svg>
  );
}

/** 垃圾桶图标(对齐旧版 delete-file.js) */
function TrashIcon() {
  return (
    <svg
      className="delete-file-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h10" />
      <path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
    </svg>
  );
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
    // 立即清除确认数据,行内确认区消失;工具状态由确认流 tool_result 收口
    resolveToolConfirmation(confirmationData.confirmId);
    try {
      await chatApi.confirmTool(
        {
          sessionId: currentSessionId,
          confirmId: confirmationData.confirmId,
          decision,
        },
        (event) => {
          // /api/tool/confirm 为 SSE 流,复用主对话事件分发更新工具状态与后续回复
          useChatStore.getState().handleSseEvent(event);
        },
      );
    } catch (e) {
      // 后端调用失败不阻塞 UI,允许重试
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
      console.warn('[ToolTimelineConfirmation] confirmTool 调用失败:', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isBash = isBashPayload(confirmationData);
  const isDelete = isDeleteFilePayload(confirmationData);

  // 组装 delete_file 待删除项(文件 + 目录/,对齐旧版 delete-file.js)
  const deleteItems = isDelete
    ? [...confirmationData.files, ...confirmationData.directories.map((d) => `${d}/`)]
    : [];

  return (
    <div
      className={`timeline-detail-confirmation${isBash ? ` ${confirmationData.riskLevel || 'medium'}` : ''}`}
    >
      {isBash && (
        <div className="confirmation-header">
          <span className="confirmation-header-icon">
            <RiskIcon />
          </span>
          <span className="confirmation-header-title">执行命令</span>
          <span className="risk-badge">{riskLabel(confirmationData.riskLevel || 'medium')}</span>
        </div>
      )}

      <div className="confirmation-body">
        {isBash && (
          <div className="confirmation-command">
            <pre>
              <code>{confirmationData.command}</code>
            </pre>
          </div>
        )}

        {isBash && confirmationData.riskReason && (
          <div className="confirmation-reason">{confirmationData.riskReason}</div>
        )}

        {isDelete &&
          (deleteItems.length === 1 ? (
            <div className="delete-file-simple">
              <TrashIcon />
              <span className="delete-file-label">删除:</span>
              <span className="delete-file-path">{deleteItems[0]}</span>
            </div>
          ) : (
            <div className="delete-file-multi">
              <div className="delete-file-multi-header">
                <TrashIcon />
                <span>
                  删除 <strong>{deleteItems.length}</strong> 个文件
                </span>
              </div>
              <div className="delete-file-multi-list">
                {deleteItems.map((f, i) => (
                  <div key={`item-${i}`} className="delete-file-list-item">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}

        {error && <div className="timeline-detail-error">{error}</div>}

        <div className="confirmation-footer">
          <div className="confirmation-buttons">
            <button
              type="button"
              className="confirmation-btn deny"
              onClick={() => void handleDecision('deny')}
              disabled={submitting}
            >
              {isDelete ? '保留' : '拒绝'}
            </button>
            <button
              type="button"
              className={`confirmation-btn allow${isDelete ? ' delete-confirm' : ''}`}
              onClick={() => void handleDecision('allow')}
              disabled={submitting}
            >
              {submitting ? '处理中…' : isDelete ? '删除' : '执行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}