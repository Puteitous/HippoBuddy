import { describe, it, expect } from 'vitest';
import {
  getReasoningEffortItems,
  supportsReasoningEffort,
} from '../../main/resources/static/js/components/settings/ModelSettingsPage.js';

const values = (provider) => getReasoningEffortItems(provider).map(i => i.value);

describe('getReasoningEffortItems — 按 Provider 区分档位', () => {
  it('deepseek 支持 Default/low/high/max 四档', () => {
    expect(values('deepseek')).toEqual(['', 'low', 'high', 'max']);
  });

  it('deepseek-responses 支持 Default/low/high/max 四档', () => {
    expect(values('deepseek-responses')).toEqual(['', 'low', 'high', 'max']);
  });

  it('openai 支持 Default/low/medium/high（无 max，用官方 medium 档）', () => {
    expect(values('openai')).toEqual(['', 'low', 'medium', 'high']);
  });

  it('anthropic 无 effort 概念，返回空数组', () => {
    expect(getReasoningEffortItems('anthropic')).toEqual([]);
  });

  it('其余 OpenAI 兼容 Provider 不声明档位，返回空数组', () => {
    for (const p of ['dashscope', 'zhipu', 'moonshot', 'minimax', 'stepfun',
      'lingyi', 'doubao', 'siliconflow', 'xunfei', 'ollama', 'local']) {
      expect(getReasoningEffortItems(p), p).toEqual([]);
    }
  });

  it('null / 空串安全返回空数组', () => {
    expect(getReasoningEffortItems(null)).toEqual([]);
    expect(getReasoningEffortItems('')).toEqual([]);
    expect(getReasoningEffortItems(undefined)).toEqual([]);
  });

  it('大小写与首尾空格不敏感', () => {
    expect(values('DeepSeek')).toEqual(values('deepseek'));
    expect(values('  OPENAI  ')).toEqual(values('openai'));
  });
});

describe('supportsReasoningEffort — 是否支持档位字段', () => {
  it('deepseek 系与 openai 支持', () => {
    expect(supportsReasoningEffort('deepseek')).toBe(true);
    expect(supportsReasoningEffort('deepseek-responses')).toBe(true);
    expect(supportsReasoningEffort('openai')).toBe(true);
  });

  it('anthropic 与其他 Provider 不支持', () => {
    expect(supportsReasoningEffort('anthropic')).toBe(false);
    expect(supportsReasoningEffort('dashscope')).toBe(false);
    expect(supportsReasoningEffort('ollama')).toBe(false);
    expect(supportsReasoningEffort('')).toBe(false);
    expect(supportsReasoningEffort(null)).toBe(false);
  });
});
