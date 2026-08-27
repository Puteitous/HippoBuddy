import { describe, it, expect } from 'vitest';
import { getReasoningItems, supportsReasoningEffort } from '@/utils/reasoning-effort';

describe('reasoning-effort', () => {
  it('未知 Provider 返回空数组且不支持', () => {
    expect(getReasoningItems('unknown')).toEqual([]);
    expect(supportsReasoningEffort('unknown')).toBe(false);
  });

  it('deepseek 支持低/高/max 档位', () => {
    const items = getReasoningItems('deepseek');
    expect(items.map((i) => i.value)).toEqual(['', 'low', 'high', 'max']);
    expect(supportsReasoningEffort('deepseek')).toBe(true);
  });

  it('openai 支持 medium 档位', () => {
    const items = getReasoningItems('openai');
    expect(items.map((i) => i.value)).toEqual(['', 'low', 'medium', 'high']);
  });

  it('Provider 名不区分大小写与空格', () => {
    expect(getReasoningItems('  DeepSeek  ')).toHaveLength(4);
    expect(supportsReasoningEffort(' OPENAI ')).toBe(true);
  });

  it('空 Provider 视为未知', () => {
    expect(getReasoningItems('')).toEqual([]);
    expect(getReasoningItems('   ')).toEqual([]);
    expect(supportsReasoningEffort('')).toBe(false);
  });
});