import { describe, it, expect, afterEach } from 'vitest';
import {
  isVisionProviderModel,
  isVisionSupported,
  generateImageId,
  MAX_IMAGE_SIZE_BYTES,
} from '@/utils/image-vision';

describe('isVisionProviderModel', () => {
  it('白名单 provider 直接支持，与 model 无关', () => {
    expect(isVisionProviderModel('openai', 'gpt-3.5')).toBe(true);
    expect(isVisionProviderModel('anthropic', 'claude-2')).toBe(true);
    expect(isVisionProviderModel('google', 'any-model')).toBe(true);
  });

  it('provider 名小写化不敏感', () => {
    expect(isVisionProviderModel('OpenAI', 'gpt-3.5')).toBe(true);
    expect(isVisionProviderModel('ANTHROPIC', 'claude-2')).toBe(true);
  });

  it('白名单外 provider 靠 model 关键字匹配', () => {
    expect(isVisionProviderModel('deepseek', 'gpt-4o')).toBe(true);
    expect(isVisionProviderModel('deepseek', 'qwen-vl-max')).toBe(true);
    expect(isVisionProviderModel('deepseek', 'glm-4v')).toBe(true);
    expect(isVisionProviderModel('deepseek', 'kimi')).toBe(true);
  });

  it('model 关键字子串匹配且忽略大小写', () => {
    expect(isVisionProviderModel('', 'MyGPT-4o-Custom')).toBe(true);
    expect(isVisionProviderModel('', 'Vision-Model')).toBe(true);
  });

  it('无 provider、无匹配 model 时返回 false', () => {
    expect(isVisionProviderModel()).toBe(false);
    expect(isVisionProviderModel('deepseek', 'deepseek-chat')).toBe(false);
    expect(isVisionProviderModel('', '')).toBe(false);
  });
});

describe('isVisionSupported', () => {
  const KEY = 'hippo_model_config';
  afterEach(() => localStorage.removeItem(KEY));

  it('无配置返回 false', () => {
    expect(isVisionSupported()).toBe(false);
  });

  it('provider 命中时支持', () => {
    localStorage.setItem(KEY, JSON.stringify({ provider: 'openai' }));
    expect(isVisionSupported()).toBe(true);
  });

  it('model 关键字命中时支持', () => {
    localStorage.setItem(KEY, JSON.stringify({ provider: 'deepseek', model: 'gpt-4o' }));
    expect(isVisionSupported()).toBe(true);
  });

  it('解析失败或非法 JSON 返回 false', () => {
    localStorage.setItem(KEY, 'not-json{{{');
    expect(isVisionSupported()).toBe(false);
  });
});

describe('generateImageId', () => {
  it('返回 img- 前缀的唯一 id，多次生成不重复', () => {
    const a = generateImageId();
    const b = generateImageId();
    expect(a.startsWith('img-')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('MAX_IMAGE_SIZE_BYTES', () => {
  it('上限为 20MB', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });
});