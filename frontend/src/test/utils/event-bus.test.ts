import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on, off, emit, clear } from '@/utils/eventBus';

describe('eventBus', () => {
  beforeEach(() => {
    clear(); // 清空模块级监听,避免用例间串扰
  });

  it('on + emit 触发订阅者并携带 payload', () => {
    const handler = vi.fn();
    on('skills:changed', handler);
    emit('skills:changed', { foo: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ foo: 1 });
  });

  it('on 返回取消订阅函数,调用后不再收到事件', () => {
    const handler = vi.fn();
    const unsubscribe = on('rules:changed', handler);
    emit('rules:changed');
    unsubscribe();
    emit('rules:changed');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('off 显式解除订阅', () => {
    const handler = vi.fn();
    on('llm:changed', handler);
    off('llm:changed', handler);
    emit('llm:changed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('同一事件可订阅多个 handler,触发时全部执行', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('selection:add-to-input', a);
    on('selection:add-to-input', b);
    emit('selection:add-to-input');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('handler 抛异常不中断同一事件的其它订阅者', () => {
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    on('ui:activityBarToggled', boom);
    on('ui:activityBarToggled', ok);
    emit('ui:activityBarToggled');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('无订阅者时 emit 不抛错', () => {
    expect(() => emit('skills:changed', 1)).not.toThrow();
  });

  it('clear(event) 只清空指定事件,clear() 清空全部', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('skills:changed', a);
    on('rules:changed', b);
    clear('skills:changed');
    emit('skills:changed');
    emit('rules:changed');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);

    clear();
    emit('rules:changed');
    expect(b).toHaveBeenCalledTimes(1); // 全清后不再增加
  });
});