import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultProcessCollapsed, setDefaultProcessView } from '@/utils/process-view-config';

describe('process-view-config', () => {
  beforeEach(() => {
    setDefaultProcessView('full'); // 重置模块级默认值,避免用例互相影响
  });

  it('full 模式下默认不收起', () => {
    setDefaultProcessView('full');
    expect(getDefaultProcessCollapsed()).toBe(false);
  });

  it('result 模式下默认收起', () => {
    setDefaultProcessView('result');
    expect(getDefaultProcessCollapsed()).toBe(true);
  });

  it('兜底:未知值按 full 处理', () => {
    setDefaultProcessView('whatever');
    expect(getDefaultProcessCollapsed()).toBe(false);
  });

  it('空值/undefined/null 按 full 处理', () => {
    setDefaultProcessView(undefined);
    expect(getDefaultProcessCollapsed()).toBe(false);
    setDefaultProcessView('asdf');
    expect(getDefaultProcessCollapsed()).toBe(false);
  });
});