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
import { translate, useI18n } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { FileIcon } from '@/components/FileIcon';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import type {
  BashToolConfirmationPayload,
  DeleteFileToolConfirmationPayload,
  ToolConfirmationPayload,
} from '@/types/sse';

/** 翻译后端返回的 riskReason。
 *  后端以 "i18n:key:param=value" 格式返回 i18n key(对齐旧版 confirmation.js),
 *  解析 key 与参数后经前端字典翻译;不带 i18n: 前缀的旧格式原样返回。 */
function translateRiskReason(reason: string): string {
  if (!reason || !reason.startsWith('i18n:')) return reason;
  const body = reason.slice(5);
  const colonIdx = body.indexOf(':');
  const key = colonIdx > 0 ? body.slice(0, colonIdx) : body;
  const params: Record<string, string> = {};
  if (colonIdx > 0) {
    for (const seg of body.slice(colonIdx + 1).split(':')) {
      const eqIdx = seg.indexOf('=');
      if (eqIdx > 0) {
        params[seg.slice(0, eqIdx)] = decodeURIComponent(seg.slice(eqIdx + 1));
      }
    }
  }
  const translated = translate(key, params);
  return translated === key ? reason : translated;
}

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
  if (level === 'high') return translate('tool.confirm.highRisk');
  if (level === 'low') return translate('tool.confirm.lowRisk');
  return translate('tool.confirm.mediumRisk');
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
  const { t } = useI18n();
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
    // 确认/拒绝后进入新的 Agent 流(continueAfterConfirmation)。该流不发 sendUserMessage,
    // 需手动恢复 isSending=true,使确认后的流式期间回合 footer 保持隐藏(否则 isSending 已
    // 被 complete 置 false,旧回合 footer 会在确认后的流式途中误显示)。
    // 流内 done 事件会置 isSending=false;finally 兜底覆盖"流无 done 即被截断"的情况
    // (再次触发确认弹窗 / 异常),避免 isSending 卡 true 阻塞后续发送。
    const chatStore = useChatStore.getState();
    // isSending 记账必须绑定「发起确认的会话」而非当前选中会话:确认流进行中用户切换到
    // 新建会话时,若用会话无关的 setIsSending(true/false),会把新会话的 isSending 误置,
    // 干扰新会话自身的流式状态。这里统一按捕获的 currentSessionId 精确读写。
    chatStore.setSessionIsSending(currentSessionId, true);
    try {
      await chatApi.confirmTool(
        {
          sessionId: currentSessionId,
          confirmId: confirmationData.confirmId,
          decision,
        },
        (event) => {
          // /api/tool/confirm 为 SSE 流。事件必须定向路由到「发出确认的会话」
          // (currentSessionId,请求发起时捕获),而非「当前选中的会话」——
          // 否则确认流进行中用户切换到新建会话时,事件会串入新会话分区,
          // 导致 hero 消失并显示空会话 / 旧对话输出污染新会话。
          useChatStore.getState().routeSseEvent(currentSessionId as string, event);
        },
      );
    } catch (e) {
      // 后端调用失败不阻塞 UI,允许重试
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
      console.warn('[ToolTimelineConfirmation] confirmTool 调用失败:', msg);
    } finally {
      chatStore.setSessionIsSending(currentSessionId, false);
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
          <span className="confirmation-header-title">{t('tool.confirm.title')}</span>
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
          <div className="confirmation-reason">{translateRiskReason(confirmationData.riskReason)}</div>
        )}

        {isDelete && (
          <div className="delete-file-multi">
            <div className="delete-file-multi-header">
              <TrashIcon />
              <span>
                {t('modal.delete')} <strong>{deleteItems.length}</strong> {t('tool.delete.count')}
              </span>
            </div>
            <div className="delete-file-multi-list">
              {deleteItems.map((f, i) => (
                <div key={`item-${i}`} className="delete-file-list-item">
                  {/* 目录(以 / 结尾)用文件夹图标,文件用文件树同款按类型彩色图标 */}
                  {f.endsWith('/') ? (
                    <FileIcon kind="folder" size={13} className="delete-file-item-icon" />
                  ) : (
                    <FileTypeIcon fileName={f} size={13} className="delete-file-item-icon" />
                  )}
                  <span>{f}</span>
                </div>
              ))}
            </div>
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
              {isDelete ? t('tool.delete.keep') : t('tool.confirm.deny')}
            </button>
            <button
              type="button"
              className={`confirmation-btn allow${isDelete ? ' delete-confirm' : ''}`}
              onClick={() => void handleDecision('allow')}
              disabled={submitting}
            >
              {submitting ? t('tool.confirm.processing') : isDelete ? t('tool.delete.confirm') : t('tool.confirm.execute')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}