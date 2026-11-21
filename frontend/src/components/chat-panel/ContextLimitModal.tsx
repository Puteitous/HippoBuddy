/**
 * ContextLimitModal - 上下文快满时弹窗，引导模型压缩当前上下文。
 *
 * 触发：当前会话 token 使用率 >= 90%，每个会话仅提示一次（ref Set 去重）。
 * 动作：向当前会话发送一条压缩指令，由模型调用 compact_context；
 * 工具会弹出确认卡片，用户确认后才会真正替换上下文，原始对话仍保留在历史中。
 *
 * 数据来源与 TokenMonitor 一致：基础统计 GET /api/sessions/:id/tokens + SSE token_update。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SessionTokenStats } from '@/types';
import { sessionApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { translate, useI18n } from '@/i18n';
import { useChatStream } from '@/hooks/useChatStream';
import { getTokenColor, mergeStats } from './tokenUtils';
import './ContextLimitModal.css';

/** 上下文使用率触发阈值：>= 时状态栏常驻胶囊入口，点击可弹「压缩上下文」。 */
const LIMIT_PERCENT = 90;

/** 强制阈值：流式输出期间若已达此值，直接中断当前流式并立即弹窗，避免无限等流式结束。 */
const FORCE_PERCENT = 97.5;

/** 用户点击「压缩上下文」后发给模型的指令。 */
const COMPACT_INSTRUCTION =
  '请压缩当前上下文：调用 compact_context，summary 保留当前目标、关键结论与文件路径、已完成操作、当前状态和下一步。';

export function ContextLimitModal(): ReactNode {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const lastTokenUpdate = useChatStore((s) =>
    currentSessionId ? (s.tokenUpdates[currentSessionId] ?? null) : null,
  );
  /** 手动入口(状态栏 Token 浮层底部按钮)打开标记 */
  const compactModalOpen = useAppStore((s) => s.compactModalOpen);
  const closeCompactModal = useAppStore((s) => s.closeCompactModal);

  const [baseStats, setBaseStats] = useState<SessionTokenStats | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // 每个会话仅提示一次（取消/切换后不再重复弹），避免打扰
  const hintedRef = useRef<Set<string>>(new Set());
  // 流式输出进行中，避免弹窗在 LLM 生成时弹出打断阅读
  const { abort, isSending, send } = useChatStream();

  const loadBase = useCallback(async (sessionId: string) => {
    try {
      const stats = await sessionApi.getTokens(sessionId);
      setBaseStats(stats);
    } catch {
      /* 静默失败，等待下一轮 token_update 再试 */
    }
  }, []);

  useEffect(() => {
    // 切换会话/进入时重置弹窗状态（达标 effect 会按需重新打开）
    setOpen(false);
    closeCompactModal();
    if (!currentSessionId) {
      setBaseStats(null);
      return;
    }
    void loadBase(currentSessionId);
  }, [currentSessionId, loadBase, closeCompactModal]);

  // 每回合终态 token_update 到达时校准基准（对齐 TokenMonitor 的 refreshedRef 思路）
  const refreshedRef = useRef<{ sessionId: string; total: number }>({ sessionId: '', total: -1 });
  useEffect(() => {
    if (!currentSessionId || !lastTokenUpdate?.hasKnownUsage) return;
    const cur = refreshedRef.current;
    if (cur.sessionId === currentSessionId && cur.total === lastTokenUpdate.totalTokens) return;
    refreshedRef.current = { sessionId: currentSessionId, total: lastTokenUpdate.totalTokens };
    void loadBase(currentSessionId);
  }, [currentSessionId, lastTokenUpdate, loadBase]);

  const stats = useMemo(() => mergeStats(baseStats, lastTokenUpdate), [baseStats, lastTokenUpdate]);

  // 流式结束/中途停止(isSending true→false)时重拉一次 token 基准，
  // 反映真实的上下文使用率（停止可能发生在“真实已超阈值但最后已知值未刷新”时）
  const prevIsSendingRef = useRef(false);
  useEffect(() => {
    const prev = prevIsSendingRef.current;
    prevIsSendingRef.current = isSending;
    if (prev && !isSending && currentSessionId) {
      void loadBase(currentSessionId);
    }
  }, [isSending, currentSessionId, loadBase]);

  // 满足阈值且该会话尚未提示 → 弹出。流式中：
  //  - 已达强制阈值 → 直接中断当前流式并立即弹窗（即使一直输出也兜底）
  //  - 未达强制阈值 → 等流式结束后再评估（避免生成中途打断）
  useEffect(() => {
    if (!currentSessionId) return;
    if (hintedRef.current.has(currentSessionId)) return; // 已真正弹过，跳过
    if (!stats.hasKnownUsage) return;
    if (stats.usagePercent < LIMIT_PERCENT) return; // 未达阈值，继续等

    // 流式中：未达强制档则不弹、不标记，等流式结束后 effect 重跑再评估
    if (isSending) {
      if (stats.usagePercent < FORCE_PERCENT) return;
      abort(); // 强制档：已达上限，中断当前生成并立即弹窗
    }
    // 仅在真正弹窗时标记该会话，避免“流式中被跳过”导致结束后不再弹
    hintedRef.current.add(currentSessionId);
    setOpen(true);
  }, [stats, currentSessionId, isSending, abort]);

  const handleCompact = useCallback(async () => {
    if (!currentSessionId || loading) return;
    setLoading(true);
    setOpen(false);
    closeCompactModal();
    try {
      // 流式强制中断档：先停止当前生成，再发起压缩指令
      if (isSending) abort();
      const ok = await send(COMPACT_INSTRUCTION);
      if (!ok) {
        setOpen(true);
        showToast(translate('chat.compactContextSendFail'), { type: 'error', duration: 4000 });
      }
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, loading, isSending, abort, send, closeCompactModal]);

  if (!currentSessionId) return null;

  const hasStats = stats.hasKnownUsage;
  const percent = hasStats ? stats.usagePercent : 0;
  const color = getTokenColor(percent);

  const handleClose = () => {
    setOpen(false);
    closeCompactModal();
  };

  // 未达阈值自动弹出、也未经手动入口触发时不渲染
  if (!open && !compactModalOpen) return null;

  // 展开 → 显示弹窗
  return createPortal(
    <div className="cl-modal-overlay" role="dialog" aria-modal="true">
      <div className="cl-modal">
        <div className="cl-modal-head">
          <span>{t('chat.compactContextTitle')}</span>
          <button
            type="button"
            className="cl-modal-close"
            aria-label={t('chat.compactContextCancel')}
            title={t('chat.compactContextCancel')}
            onClick={handleClose}
          >
            ×
          </button>
        </div>
        <p className="cl-modal-desc">{t('chat.compactContextDesc')}</p>
        <div className="cl-modal-meter">
          <div className="cl-modal-meter-track">
            <div
              className="cl-modal-meter-fill"
              style={{ width: `${Math.min(percent, 100)}%`, background: color }}
            />
          </div>
          <span className="cl-modal-percent" style={{ color }}>
            {percent.toFixed(1)}%
          </span>
        </div>
        <div className="cl-modal-actions">
          <button type="button" className="cl-btn" onClick={handleClose}>
            {t('chat.compactContextCancel')}
          </button>
          <button type="button" className="cl-btn cl-btn-primary" disabled={loading} onClick={handleCompact}>
            {loading ? (
              <>
                <span className="cl-spinner" aria-hidden />
                {t('chat.compactContextProcessing')}
              </>
            ) : (
              t('chat.compactContextAction')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}