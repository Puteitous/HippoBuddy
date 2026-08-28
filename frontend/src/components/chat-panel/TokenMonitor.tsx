/**
 * TokenMonitor - 实时 Token 用量监控
 *
 * 阶段 3.4:补齐 ChatPanel 的 Token 用量显示能力。
 *
 * 数据来源:
 *  - 基准:GET /api/sessions/:id/tokens(切会话时拉取一次,提供 maxTokens + 会话累计字段)
 *  - 实时:chatStore.lastTokenUpdate(由 SSE token_update 事件驱动,覆盖 prompt/completion 等)
 *
 * 与旧版 TokenMonitor.js 的差异:
 *  - 不再轮询 30s(改为切会话 + SSE 驱动,降低后端压力)
 *  - 每个回合终态 token_update 到达时重拉一次基准,校准会话累计字段(statusbar tooltip 的会话总计)
 *  - 状态栏变体(statusBar):紧凑展示(百分比 + 进度条 + hover tooltip),主题色用 CSS 变量
 *  - Activity Bar 变体(非 statusBar):完整面板 TokenVisualPanel(字段 + 两张趋势图)
 *  - 每回合有实际用量变化时写入 chatStore.tokenHistory,驱动完整面板趋势图(对齐旧版
 *    appState.tokenHistory 的累积逻辑;切会话不清空)
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { sessionApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useI18n } from '@/i18n';
import type { SessionTokenStats } from '@/types';
import { getTokenColor, mergeStats } from './tokenUtils';
import type { MergedStats } from './tokenUtils';
import { TokenEmojiIcon } from './TokenEmojiIcon';
import { TokenVisualPanel } from './TokenVisualPanel';
import './TokenMonitor.css';

interface TokenMonitorProps {
  /** 状态栏变体:渲染为 柱状图图标 + 百分比(对齐旧版 statusBarToken),隐藏进度条与 counts */
  statusBar?: boolean;
}

function TokenMonitorComponent({ statusBar = false }: TokenMonitorProps) {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const lastTokenUpdate = useChatStore((s) => s.lastTokenUpdate);

  const [baseStats, setBaseStats] = useState<SessionTokenStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 切会话时拉取基准统计
  const loadBase = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const stats = await sessionApi.getTokens(sessionId);
      setBaseStats(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBaseStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      setBaseStats(null);
      setError(null);
      return;
    }
    void loadBase(currentSessionId);
  }, [currentSessionId, loadBase]);

  // 每回合终态 token_update 到达时重拉基准统计,校准会话累计字段。
  // 后端仅在回合终态推送一次 usage(Responses 协议 completed/incomplete 或
  // chat-completions 最后一帧),故此处天然「每回合一次」;用 ref 按会话+total 去重,
  // 避免依赖 baseStats(setState 会引发循环),也不需恢复旧版 30s 轮询。
  const refreshedRef = useRef<{ sessionId: string; total: number }>({ sessionId: '', total: -1 });
  useEffect(() => {
    if (!currentSessionId || !lastTokenUpdate?.hasKnownUsage) return;
    const cur = refreshedRef.current;
    if (cur.sessionId === currentSessionId && cur.total === lastTokenUpdate.totalTokens) return;
    refreshedRef.current = { sessionId: currentSessionId, total: lastTokenUpdate.totalTokens };
    void loadBase(currentSessionId);
  }, [currentSessionId, lastTokenUpdate, loadBase]);

  // 合并实时数据
  const stats = useMemo<MergedStats>(() => mergeStats(baseStats, lastTokenUpdate), [
    baseStats,
    lastTokenUpdate,
  ]);
  const color = getTokenColor(stats.usagePercent);
  const barWidth = Math.min(stats.usagePercent, 100);

  // ── 写入全局历史(驱动完整面板趋势图,对齐旧版 addTokenRecord 去重) ──────
  const addTokenRecord = useChatStore((s) => s.addTokenRecord);
  const lastRecordKeyRef = useRef('');
  useEffect(() => {
    if (!stats.hasKnownUsage) return;
    const key = `${stats.totalTokens}|${stats.promptTokens}|${stats.completionTokens}`;
    if (key === lastRecordKeyRef.current) return;
    lastRecordKeyRef.current = key;
    if (stats.totalTokens > 0 || stats.promptTokens > 0 || stats.completionTokens > 0) {
      addTokenRecord({
        total: stats.totalTokens,
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        percent: stats.usagePercent,
        cacheRate: stats.hasKnownUsage ? stats.cacheHitRate : undefined,
      });
    }
  }, [stats, addTokenRecord]);

  // ── 状态栏悬浮面板(对齐旧版 status-bar-tooltip 自定义浮层) ──────────
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; bottom: number } | null>(null);
  const statusBarRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback(() => {
    const el = statusBarRef.current;
    if (!el || !baseStats || stats.maxTokens === 0) return;
    const rect = el.getBoundingClientRect();
    // 对齐旧版定位:left 相对按钮左移 25px,bottom 在按钮上方 8px
    setTooltipPos({
      left: rect.left - 25,
      bottom: window.innerHeight - rect.top + 8,
    });
    setTooltipOpen(true);
  }, [baseStats, stats.maxTokens]);

  const hideTooltip = useCallback(() => {
    setTooltipOpen(false);
  }, []);

  // 点击状态栏 → 打开公共 Token 统计面板(对齐旧版 statusBarToken 联动,复用左侧 ActivityBar 面板)
  const openActivityTokenPanel = useAppStore((s) => s.openActivityPanel);
  const handleStatusBarClick = useCallback(() => {
    hideTooltip();
    openActivityTokenPanel('token');
  }, [hideTooltip, openActivityTokenPanel]);

  // 渲染后校正:超出右侧边界时右对齐(对齐旧版 offsetWidth 检测逻辑)
  useLayoutEffect(() => {
    if (!tooltipOpen || !tooltipPos || !tooltipRef.current || !statusBarRef.current) return;
    const tipWidth = tooltipRef.current.offsetWidth;
    const anchorRect = statusBarRef.current.getBoundingClientRect();
    const rightEdge = window.innerWidth - 16;
    let left = anchorRect.left - 25;
    if (anchorRect.left - 30 + tipWidth > rightEdge) {
      left = rightEdge - tipWidth;
    }
    setTooltipPos((prev) =>
      prev && prev.left === left ? prev : { left, bottom: window.innerHeight - anchorRect.top + 8 },
    );
  }, [tooltipOpen, tooltipPos, stats]);

  // ── 状态栏变体 ─────────────────────────────────────────────────────
  if (statusBar) {
    if (!currentSessionId) {
      return null;
    }

    if (loading && !baseStats) {
      return (
        <span className="token-monitor token-monitor-loading" title={t('tokenMonitor.loading')}>
          Token …
        </span>
      );
    }

    if (error && !baseStats) {
      return (
        <span className="token-monitor token-monitor-error" title={error}>
          {t('tokenMonitor.unavailable')}
        </span>
      );
    }

    if (!baseStats || stats.maxTokens === 0) {
      // 对齐旧版 statusBarTokenValue 初始值:无基准数据时仍显示 0%
      return (
        <span
          ref={statusBarRef}
          className="token-monitor token-monitor-statusbar"
          title={t('tokenMonitor.usage')}
          role="status"
          aria-live="polite"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onClick={handleStatusBarClick}
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="2" y="10" width="3" height="4" rx="0.5" />
            <rect x="6.5" y="6" width="3" height="8" rx="0.5" />
            <rect x="11" y="2" width="3" height="12" rx="0.5" />
          </svg>
          <span className="token-monitor-percent">0%</span>
        </span>
      );
    }

    // 有基准数据:图标 + 百分比 + hover 悬浮面板(对齐旧版 statusBarToken)
    return (
      <>
        <span
          ref={statusBarRef}
          className="token-monitor token-monitor-statusbar"
          role="status"
          aria-live="polite"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onClick={handleStatusBarClick}
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="2" y="10" width="3" height="4" rx="0.5" />
            <rect x="6.5" y="6" width="3" height="8" rx="0.5" />
            <rect x="11" y="2" width="3" height="12" rx="0.5" />
          </svg>
          {/* 对齐旧版 statusBarTokenValue:仅百分比,无 ✓/~ 标记、无渐变颜色 */}
          <span className="token-monitor-percent">{stats.usagePercent.toFixed(1)}%</span>
        </span>
        {tooltipOpen &&
          tooltipPos &&
          createPortal(
            <div
              ref={tooltipRef}
              className="status-bar-tooltip"
              style={{ left: tooltipPos.left, bottom: tooltipPos.bottom }}
              role="tooltip"
            >
              <div className="sbt-header">
                <span>{t('tokenMonitor.usage')}</span>
                <span className="sbt-percent" style={{ color }}>
                  <TokenEmojiIcon percent={stats.usagePercent} />
                  {stats.usagePercent.toFixed(1)}%
                </span>
              </div>
              <div className="sbt-bar-track">
                <div
                  className="sbt-bar-fill"
                  style={{ width: `${barWidth}%`, background: color }}
                />
              </div>
              <div className="sbt-row">
                <span>{t('tokenMonitor.current')}</span>
                <span>
                  {stats.currentTokens.toLocaleString()} / {stats.maxTokens.toLocaleString()}
                </span>
              </div>
              {(stats.cacheHitTokens > 0 || stats.sessionCacheHitTokens > 0) && (
                <>
                  <div className="sbt-divider" />
                  <div className="sbt-row">
                    <span>{t('tokenPanel.cacheHit')}</span>
                    <span>
                      {stats.cacheHitTokens.toLocaleString()} (
                      {stats.cacheHitRate.toFixed(1)}%)
                    </span>
                  </div>
                </>
              )}
              <div className="sbt-divider" />
              <div className="sbt-row sbt-total">
                <span>{t('tokenMonitor.sessionTotal')}</span>
                <span>{stats.sessionTotalTokens.toLocaleString()} tokens</span>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  // ── Activity Bar 变体:完整 Token 统计面板(字段 + 两张趋势图) ──────────
  return <TokenVisualPanel stats={stats} />;
}

export const TokenMonitor = memo(TokenMonitorComponent);