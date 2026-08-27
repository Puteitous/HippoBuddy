import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readScrollPosition,
  writeScrollPosition,
  clearScrollPosition,
} from '@/utils/scroll-positions';

const KEY = 'hippo-scroll-positions';
const FILE = '/a/b.ts';

describe('scroll-positions', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('无记录返回 null', () => {
    expect(readScrollPosition(FILE)).toBeNull();
  });

  it('写入并读回 { line, offset } 格式', () => {
    writeScrollPosition(FILE, { line: 12, offset: 40 });
    expect(readScrollPosition(FILE)).toEqual({ line: 12, offset: 40 });
  });

  it('写入数值（旧版纯 scrollTop）格式原样读回', () => {
    writeScrollPosition(FILE, 350);
    expect(readScrollPosition(FILE)).toBe(350);
  });

  it('读取时 line 缺失或非法返回 null', () => {
    localStorage.setItem(KEY, JSON.stringify({ [FILE]: { offset: 10 } }));
    expect(readScrollPosition(FILE)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ [FILE]: { line: 0 } }));
    expect(readScrollPosition(FILE)).toBeNull();
  });

  it('offset 缺失时兜底为 0', () => {
    localStorage.setItem(KEY, JSON.stringify({ [FILE]: { line: 5 } }));
    expect(readScrollPosition(FILE)).toEqual({ line: 5, offset: 0 });
  });

  it('多个文件互不影响，写入相同 key 覆盖', () => {
    writeScrollPosition('/a.ts', { line: 1, offset: 0 });
    writeScrollPosition('/b.ts', { line: 2, offset: 0 });
    writeScrollPosition('/a.ts', { line: 99, offset: 0 });
    expect(readScrollPosition('/a.ts')).toEqual({ line: 99, offset: 0 });
    expect(readScrollPosition('/b.ts')).toEqual({ line: 2, offset: 0 });
  });

  it('clearScrollPosition 删除指定条目，其他保留', () => {
    writeScrollPosition('/a.ts', { line: 1, offset: 0 });
    writeScrollPosition('/b.ts', { line: 2, offset: 0 });
    clearScrollPosition('/a.ts');
    expect(readScrollPosition('/a.ts')).toBeNull();
    expect(readScrollPosition('/b.ts')).toEqual({ line: 2, offset: 0 });
  });

  it('clearScrollPosition 不存在的文件幂等无害', () => {
    expect(() => clearScrollPosition('/nope.ts')).not.toThrow();
  });

  it('存储为非法 JSON 时读/写/清均安全降级', () => {
    localStorage.setItem(KEY, '{{{bad');
    expect(readScrollPosition(FILE)).toBeNull();
    expect(() => writeScrollPosition(FILE, { line: 1, offset: 0 })).not.toThrow();
    expect(() => clearScrollPosition(FILE)).not.toThrow();
  });
});