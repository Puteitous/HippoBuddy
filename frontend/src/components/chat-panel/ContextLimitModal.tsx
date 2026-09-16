/**
 * ContextLimitModal - 上下文快满时弹窗，提供「总结并新开会话」。
 *
 * 触发：当前会话 token 使用率 >= 95%，每个会话仅提示一次（ref Set 去重）。
 * 动作：调用 POST /api/sessions/:id/summarize-new，后端一次性生成总结并新建会话，
 * 成功后切到新会话（新会话首条 = 总结），原会话不变。
 *
 * 数据来源与 TokenMonitor 一致：基础统计 GET /api/sessions/:id/tokens + SSE token_update。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SessionTokenStats } from '@/types';
import { api, sessionApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { translate, useI18n } from '@/i18n';
import { useChatStream } from '@/hooks/useChatStream';
import { getTokenColor, mergeStats } from './tokenUtils';
import './ContextLimitModal.css';

/** 上下文使用率触发阈值：>= 时状态栏常驻胶囊入口，点击可弹「总结并新开会话」。 */
const LIMIT_PERCENT = 90;

/** 强制阈值：流式输出期间若已达此值，直接中断当前流式并立即弹窗，避免无限等流式结束。 */
const FORCE_PERCENT = 97.5;

export function ContextLimitModal(): ReactNode {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setSessions = useAppStore((s) => s.setSessions);
  const lastTokenUpdate = useChatStore((s) =>
    currentSessionId ? (s.tokenUpdates[currentSessionId] ?? null) : null,
  );

  const [baseStats, setBaseStats] = useState<SessionTokenStats | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // 每个会话仅提示一次（取消/切换后不再重复弹），避免打扰
  const hintedRef = useRef<Set<string>>(new Set());
  // 流式输出进行中，避免弹窗在 LLM 生成时弹出打断阅读
  const { abort, isSending } = useChatStream();

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
    if (!currentSessionId) {
      setBaseStats(null);
      return;
    }
    void loadBase(currentSessionId);
  }, [currentSessionId, loadBase]);

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

  const handleSummarize = useCallback(async () => {
    if (!currentSessionId || loading) return;
    setLoading(true);
    try {
      const res = await api.sessions.summarizeNew(currentSessionId);
      setLoading(false);
      setOpen(false);
      if (res.newSessionId) {
        setCurrentSession(res.newSessionId);
        api.getSessions().then(setSessions).catch(() => {});
        showToast(translate('chat.summarizeNewSuccess'), { type: 'success', duration: 4000 });
      }
    } catch (e) {
      setLoading(false);
      const msg = e instanceof Error ? e.message : String(e);
      showToast(translate('chat.summarizeNewFailMsg', { message: msg }), {
        type: 'error',
        duration: 4000,
      });
    }
  }, [currentSessionId, loading, setCurrentSession, setSessions]);

  if (!currentSessionId) return null;

  const hasStats = stats.hasKnownUsage;
  const percent = hasStats ? stats.usagePercent : LIMIT_PERCENT;
  const color = getTokenColor(percent);
  // 达到阈值后，入口胶囊常驻状态栏；未达阈值什么都不显示
  const overLimit = hasStats && stats.usagePercent >= LIMIT_PERCENT;
  if (!overLimit) return null;

  // 常驻胶囊：随时点击弹窗（去数字，纯入口，百分比由 TokenMonitor 展示）
  const pill = (
    <button
      type="button"
      className="cl-chip"
      title={t('chat.summarizeNewTitle')}
      aria-label={t('chat.summarizeNewTitle')}
      onClick={() => setOpen(true)}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 1.5 14.5 13h-13L8 1.5z" />
        <line x1="8" y1="6.5" x2="8" y2="9.5" />
        <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );

  // 未展开 → 显示常驻胶囊
  if (!open) return pill;

  // 展开 → 显示弹窗
  return createPortal(
    <div className="cl-modal-overlay" role="dialog" aria-modal="true">
      <div className="cl-modal">
        <div className="cl-modal-head">
          <span>{t('chat.summarizeNewTitle')}</span>
          <button
            type="button"
            className="cl-modal-close"
            aria-label={t('chat.summarizeNewCancel')}
            title={t('chat.summarizeNewCancel')}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <p className="cl-modal-desc">{t('chat.summarizeNewDesc')}</p>
        <div className="cl-modal-meter">
          <div className="cl-modal-meter-track">
            <div
              className="cl-modal-meter-fill"
              style={{ width: `${Math.min(percent, 100)}%`, background: color }}
            />
          </div>
          <span className="cl-modal-percent" style={{ color }}>
            {percent.toFixed(0)}%
          </span>
        </div>
        <div className="cl-modal-actions">
          <button type="button" className="cl-btn" onClick={() => setOpen(false)}>
            {t('chat.summarizeNewCancel')}
          </button>
          <button type="button" className="cl-btn cl-btn-primary" disabled={loading} onClick={handleSummarize}>
            {loading ? (
              <>
                <span className="cl-spinner" aria-hidden />
                {t('chat.summarizeNewProcessing')}
              </>
            ) : (
              t('chat.summarizeNewAction')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}