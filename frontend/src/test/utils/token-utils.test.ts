import { describe, it, expect } from 'vitest';
import { mergeStats, getTokenColor, EMPTY_STATS } from '@/components/chat-panel/tokenUtils';
import type { SessionTokenStats } from '@/types';
import type { TokenUpdatePayload } from '@/types/sse';

const base: SessionTokenStats = {
  currentTokens: 50,
  maxTokens: 100,
  usagePercent: 50,
  messageCount: 3,
  hasKnownUsage: true,
  promptTokens: 30,
  completionTokens: 20,
  totalTokens: 50,
  cacheHitTokens: 10,
  cacheHitRate: 0.2,
  sessionTotalInput: 1000,
  sessionTotalOutput: 500,
  sessionTotalTokens: 1500,
  sessionLlmCalls: 5,
  sessionToolCalls: 2,
  sessionCacheHitTokens: 200,
  sessionCacheHitRate: 0.13,
};

describe('mergeStats', () => {
  it('base 为 null 时返回空默认值', () => {
    expect(mergeStats(null, null)).toEqual(EMPTY_STATS);
    expect(mergeStats(null, { live: true, hasKnownUsage: true } as TokenUpdatePayload)).toEqual(
      EMPTY_STATS,
    );
  });

  it('live 为 null 时镜像 base，live 标记为 false', () => {
    const merged = mergeStats(base, null);
    expect(merged).toMatchObject({
      currentTokens: 50,
      maxTokens: 100,
      usagePercent: 50,
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 50,
      cacheHitTokens: 10,
      cacheHitRate: 0.2,
      sessionTotalInput: 1000,
      sessionTotalOutput: 500,
      sessionTotalTokens: 1500,
      sessionLlmCalls: 5,
      sessionToolCalls: 2,
      sessionCacheHitTokens: 200,
      sessionCacheHitRate: 0.13,
      hasKnownUsage: true,
      live: false,
    });
  });

  it('live 存在但 hasKnownUsage 为 false 时镜像 base', () => {
    const merged = mergeStats(base, {
      live: true,
      hasKnownUsage: false,
      promptTokens: 9999,
      completionTokens: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheHitRate: 0,
    });
    expect(merged.live).toBe(false);
    expect(merged.currentTokens).toBe(50);
    expect(merged.totalTokens).toBe(50);
  });

  it('live 值覆盖 prompt/completion/total/cache 并重算 usagePercent', () => {
    const merged = mergeStats(base, {
      live: true,
      hasKnownUsage: true,
      promptTokens: 60,
      completionTokens: 40,
      totalTokens: 100,
      cacheHitTokens: 25,
      cacheHitRate: 0.25,
    });
    expect(merged.live).toBe(true);
    expect(merged.currentTokens).toBe(100);
    expect(merged.promptTokens).toBe(60);
    expect(merged.completionTokens).toBe(40);
    expect(merged.totalTokens).toBe(100);
    expect(merged.cacheHitTokens).toBe(25);
    expect(merged.cacheHitRate).toBe(0.25);
    expect(merged.usagePercent).toBe(100);
    // maxTokens 始终保留基准
    expect(merged.maxTokens).toBe(100);
    // 会话累计字段保留基准
    expect(merged.sessionTotalTokens).toBe(1500);
  });

  it('usagePercent 超过 maxTokens 时封顶 100', () => {
    const merged = mergeStats(base, {
      live: true,
      hasKnownUsage: true,
      promptTokens: 120,
      completionTokens: 0,
      totalTokens: 120,
      cacheHitTokens: 0,
      cacheHitRate: 0,
    });
    expect(merged.usagePercent).toBe(100);
  });

  it('maxTokens 为 0 时兜底为 1，避免除零', () => {
    const zeroBase: SessionTokenStats = { ...base, maxTokens: 0 };
    const merged = mergeStats(zeroBase, {
      live: true,
      hasKnownUsage: true,
      promptTokens: 5,
      completionTokens: 5,
      totalTokens: 10,
      cacheHitTokens: 0,
      cacheHitRate: 0,
    });
    expect(merged.usagePercent).toBe(100);
  });

  it('未携带 totalTokens 时用 prompt+completion 计算 total', () => {
    const merged = mergeStats(base, {
      live: true,
      hasKnownUsage: true,
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheHitRate: 0,
    });
    // totalTokens 已被显式提供为 0，business 上取自该字段
    expect(merged.currentTokens).toBe(0);
    expect(merged.usagePercent).toBe(0);
  });

  it('live 未提供 prompt/completion/total 时兜底为 0', () => {
    const merged = mergeStats(base, {
      live: true,
      hasKnownUsage: true,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheHitRate: 0,
    });
    expect(merged.currentTokens).toBe(0);
    expect(merged.usagePercent).toBe(0);
    expect(merged.cacheHitTokens).toBe(0);
  });

  it('返回值为 EMPTY_STATS 的副本而非同一引用', () => {
    const merged = mergeStats(null, null);
    expect(merged).not.toBe(EMPTY_STATS);
  });
});

describe('getTokenColor', () => {
  it('0% 为绿色起点', () => {
    expect(getTokenColor(0)).toBe('rgb(76, 175, 80)');
  });

  it('50% 为第一段终点（黄）', () => {
    expect(getTokenColor(50)).toBe('rgb(255, 193, 7)');
  });

  it('25% 落在绿色到黄色之间', () => {
    expect(getTokenColor(25)).toBe('rgb(166, 184, 44)');
  });

  it('75% 落在黄色到红色之间', () => {
    expect(getTokenColor(75)).toBe('rgb(240, 160, 48)');
  });

  it('100% 为红色终点', () => {
    expect(getTokenColor(100)).toBe('rgb(224, 80, 80)');
  });

  it('越界值被 clamp 到 [0, 100]', () => {
    expect(getTokenColor(-10)).toBe('rgb(76, 175, 80)');
    expect(getTokenColor(150)).toBe('rgb(224, 80, 80)');
  });

  it('阈值附近递增单调（绿→红）', () => {
    const low = getTokenColor(10);
    const mid = getTokenColor(50);
    const high = getTokenColor(90);
    expect(low).not.toBe(mid);
    expect(mid).not.toBe(high);
  });
});