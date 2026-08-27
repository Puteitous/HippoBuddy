import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast, dismissToast, clearToasts, subscribe, getSnapshot } from '@/utils/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearToasts();
  });

  it('showToast 追加一条 toast，默认 type 为 info、duration 为 2500', () => {
    const id = showToast('hello');
    const state = getSnapshot();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ id, message: 'hello', type: 'info', duration: 2500 });
  });

  it('showToast 支持覆盖 type 与 duration', () => {
    showToast('kaboom', { type: 'error', duration: 0 });
    expect(getSnapshot().items[0]).toMatchObject({ type: 'error', duration: 0 });
  });

  it('id 自增，多条互不干扰', () => {
    const a = showToast('a');
    const b = showToast('b');
    expect(b).toBe(a + 1);
    expect(getSnapshot().items.map((i) => i.message)).toEqual(['a', 'b']);
  });

  it('duration > 0 时到点自动消失', () => {
    showToast('auto', { duration: 1000 });
    expect(getSnapshot().items).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(getSnapshot().items).toHaveLength(0);
  });

  it('duration 为 0 时不自动消失，需手动 dismiss', () => {
    showToast('pin', { duration: 0 });
    vi.advanceTimersByTime(10_000);
    expect(getSnapshot().items).toHaveLength(1);
    clearToasts();
    expect(getSnapshot().items).toHaveLength(0);
  });

  it('dismissToast 只移除指定 toast', () => {
    const a = showToast('a', { duration: 0 });
    showToast('b', { duration: 0 });
    dismissToast(a);
    expect(getSnapshot().items.map((i) => i.message)).toEqual(['b']);
  });

  it('dismissToast 对不存在的 id 静默忽略', () => {
    showToast('a', { duration: 0 });
    dismissToast(9999);
    expect(getSnapshot().items).toHaveLength(1);
  });

  it('dismissToast 会清除对应定时器', () => {
    const id = showToast('x', { duration: 1000 });
    dismissToast(id);
    // 即使时间推进也不会再次消失出错（已被清除）
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(getSnapshot().items).toHaveLength(0);
  });

  it('clearToasts 移除全部 toast', () => {
    showToast('a', { duration: 0 });
    showToast('b', { duration: 0 });
    clearToasts();
    expect(getSnapshot().items).toHaveLength(0);
  });

  it('subscribe 在状态变化时被通知，unsubscribe 后不再通知', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    showToast('a', { duration: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    showToast('b', { duration: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});