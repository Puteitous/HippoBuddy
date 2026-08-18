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
 *  - 不画趋势图 / 缓存命中率图(留 3.7 MetricsPanel)
 *  - 紧凑展示:百分比 + 进度条 + hover tooltip
 *  - 主题色用 CSS 变量,不读 document.documentElement
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { sessionApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import type { SessionTokenStats } from '@/types';
import type { TokenUpdatePayload } from '@/types/sse';
import './TokenMonitor.css';

interface MergedStats {
  currentTokens: number;
  maxTokens: number;
  usagePercent: number;
  hasKnownUsage: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheHitRate: number;
  sessionTotalInput: number;
  sessionTotalOutput: number;
  sessionTotalTokens: number;
  sessionLlmCalls: number;
  sessionToolCalls: number;
  sessionCacheHitTokens: number;
  sessionCacheHitRate: number;
  /** 是否为实时合并值(标注视觉标记) */
  live: boolean;
}

const EMPTY_STATS: MergedStats = {
  currentTokens: 0,
  maxTokens: 0,
  usagePercent: 0,
  hasKnownUsage: false,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheHitRate: 0,
  sessionTotalInput: 0,
  sessionTotalOutput: 0,
  sessionTotalTokens: 0,
  sessionLlmCalls: 0,
  sessionToolCalls: 0,
  sessionCacheHitTokens: 0,
  sessionCacheHitRate: 0,
  live: false,
};

/**
 * 把基准统计与实时增量合并为最终展示数据。
 *
 * 合并规则:
 *  - maxTokens 始终取基准(实时数据不携带)
 *  - 当前回合实时值覆盖 prompt/completion/total/cache
 *  - 会话累计字段保留基准(实时数据不携带)
 *  - 重新计算 usagePercent(基准的 maxTokens ÷ 实时的 total)
 */
function mergeStats(base: SessionTokenStats | null, live: TokenUpdatePayload | null): MergedStats {
  if (!base) return { ...EMPTY_STATS };
  if (!live || !live.hasKnownUsage) {
    return {
      currentTokens: base.currentTokens,
      maxTokens: base.maxTokens,
      usagePercent: base.usagePercent,
      hasKnownUsage: base.hasKnownUsage,
      promptTokens: base.promptTokens ?? 0,
      completionTokens: base.completionTokens ?? 0,
      totalTokens: base.totalTokens ?? 0,
      cacheHitTokens: base.cacheHitTokens ?? 0,
      cacheHitRate: base.cacheHitRate ?? 0,
      sessionTotalInput: base.sessionTotalInput ?? 0,
      sessionTotalOutput: base.sessionTotalOutput ?? 0,
      sessionTotalTokens: base.sessionTotalTokens ?? 0,
      sessionLlmCalls: base.sessionLlmCalls ?? 0,
      sessionToolCalls: base.sessionToolCalls ?? 0,
      sessionCacheHitTokens: base.sessionCacheHitTokens ?? 0,
      sessionCacheHitRate: base.sessionCacheHitRate ?? 0,
      live: false,
    };
  }
  const prompt = live.promptTokens ?? 0;
  const completion = live.completionTokens ?? 0;
  const total = live.totalTokens ?? prompt + completion;
  const max = base.maxTokens || 1;
  const usagePercent = Math.min((total * 100) / max, 100);
  return {
    currentTokens: total,
    maxTokens: base.maxTokens,
    usagePercent,
    hasKnownUsage: true,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cacheHitTokens: live.cacheHitTokens ?? 0,
    cacheHitRate: live.cacheHitRate ?? 0,
    sessionTotalInput: base.sessionTotalInput ?? 0,
    sessionTotalOutput: base.sessionTotalOutput ?? 0,
    sessionTotalTokens: base.sessionTotalTokens ?? 0,
    sessionLlmCalls: base.sessionLlmCalls ?? 0,
    sessionToolCalls: base.sessionToolCalls ?? 0,
    sessionCacheHitTokens: base.sessionCacheHitTokens ?? 0,
    sessionCacheHitRate: base.sessionCacheHitRate ?? 0,
    live: true,
  };
}

/**
 * 根据使用率返回颜色(绿 → 黄 → 红 渐变)。
 * 与旧版 getTokenColor 对齐。
 */
function getTokenColor(percent: number): string {
  const p = Math.min(Math.max(percent, 0), 100) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (p <= 0.5) {
    const t = p / 0.5;
    r = Math.round(76 + (255 - 76) * t);
    g = Math.round(175 + (193 - 175) * t);
    b = Math.round(80 + (7 - 80) * t);
  } else if (p <= 0.75) {
    const t = (p - 0.5) / 0.25;
    r = Math.round(255 + (240 - 255) * t);
    g = Math.round(193 + (160 - 193) * t);
    b = Math.round(7 + (48 - 7) * t);
  } else {
    const t = (p - 0.75) / 0.25;
    r = Math.round(240 + (224 - 240) * t);
    g = Math.round(160 + (80 - 160) * t);
    b = Math.round(48 + (80 - 48) * t);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function TokenMonitorComponent() {
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

  // 合并实时数据
  const stats = useMemo(() => mergeStats(baseStats, lastTokenUpdate), [baseStats, lastTokenUpdate]);
  const color = getTokenColor(stats.usagePercent);
  const barWidth = Math.min(stats.usagePercent, 100);
  const accuracyMark = stats.hasKnownUsage ? '✓' : '~';
  const accuracyTitle = stats.hasKnownUsage
    ? '真实值(来自 LLM 返回)'
    : '估算值(首轮回退模式)';
  const overThreshold = stats.usagePercent > 80;

  if (!currentSessionId) {
    return null;
  }

  if (loading && !baseStats) {
    return (
      <span className="token-monitor token-monitor-loading" title="加载中…">
        Token …
      </span>
    );
  }

  if (error && !baseStats) {
    return (
      <span className="token-monitor token-monitor-error" title={error}>
        Token 不可用
      </span>
    );
  }

  if (!baseStats || stats.maxTokens === 0) {
    return null;
  }

  // 构造 hover tooltip 文本(浏览器原生 title,3.4 简化,不引入自定义浮层)
  const tooltipLines = [
    `${accuracyTitle}${stats.live ? '(实时)' : ''}`,
    `├─ Prompt: ${stats.promptTokens.toLocaleString()}`,
    `├─ Completion: ${stats.completionTokens.toLocaleString()}`,
    `└─ Total: ${stats.totalTokens.toLocaleString()}`,
    '',
    `当前: ${stats.currentTokens.toLocaleString()} / ${stats.maxTokens.toLocaleString()}`,
    `会话累计: ${stats.sessionTotalTokens.toLocaleString()} tokens`,
    `LLM 调用: ${stats.sessionLlmCalls.toLocaleString()}`,
    `工具调用: ${stats.sessionToolCalls.toLocaleString()}`,
    stats.cacheHitTokens > 0
      ? `缓存命中: ${stats.cacheHitTokens.toLocaleString()} (${stats.cacheHitRate.toFixed(1)}%)`
      : '',
    stats.sessionCacheHitTokens > 0
      ? `会话缓存: ${stats.sessionCacheHitTokens.toLocaleString()} (${stats.sessionCacheHitRate.toFixed(1)}%)`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      className="token-monitor"
      title={tooltipLines}
      role="status"
      aria-live="polite"
    >
      <span className="token-monitor-percent" style={{ color }}>
        {accuracyMark} {stats.usagePercent.toFixed(1)}%
      </span>
      <span className="token-monitor-bar-track">
        <span
          className="token-monitor-bar-fill"
          style={{
            width: `${barWidth}%`,
            background: color,
            boxShadow: overThreshold ? `0 0 6px ${color}` : 'none',
          }}
        />
      </span>
      <span className="token-monitor-counts">
        {stats.totalTokens.toLocaleString()} / {stats.maxTokens.toLocaleString()}
      </span>
    </span>
  );
}

export const TokenMonitor = memo(TokenMonitorComponent);
