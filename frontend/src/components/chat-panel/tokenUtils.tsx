/**
 * tokenUtils - TokenMonitor 与 TokenVisualPanel 共享的类型与纯工具函数。
 *
 * 组件 TokenEmojiIcon 已拆至独立文件(react-refresh 仅导出组件规则),
 * 本文件只含纯工具与类型。逻辑与原 TokenMonitor.js 对齐:mergeStats(
 * 基准+实时合并)、getTokenColor(绿→黄→红渐变)。
 */
import type { SessionTokenStats } from '@/types';
import type { TokenUpdatePayload } from '@/types/sse';

/** 合并后的展示数据(基准统计 + SSE 实时增量) */
export interface MergedStats {
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

export const EMPTY_STATS: MergedStats = {
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
 * 把基准统计与实时增量合并为最终展示数据(对齐旧版 TokenMonitor.js)。
 *
 * 合并规则:
 *  - maxTokens 始终取基准(实时数据不携带)
 *  - 当前回合实时值覆盖 prompt/completion/total/cache
 *  - 会话累计字段保留基准(实时数据不携带)
 *  - 重新计算 usagePercent(基准的 maxTokens ÷ 实时的 total)
 */
export function mergeStats(
  base: SessionTokenStats | null,
  live: TokenUpdatePayload | null,
): MergedStats {
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
 * 根据使用率返回颜色(绿 → 黄 → 红 渐变,对齐旧版 getTokenColor)。
 */
export function getTokenColor(percent: number): string {
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
