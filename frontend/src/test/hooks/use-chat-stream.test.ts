import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream } from '@/hooks/useChatStream';

const { chatState, streamState } = vi.hoisted(() => ({
  chatState: {
    sendUserMessage: vi.fn(() => Promise.resolve(true)),
    abortUserMessage: vi.fn(),
  },
  streamState: { isSending: false },
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (sel: (s: typeof chatState) => unknown) => sel(chatState),
}));
vi.mock('@/hooks/useSessionStream', () => ({
  useSessionStream: () => streamState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  streamState.isSending = false;
});

describe('useChatStream', () => {
  it('暴露 send / abort / isSending', () => {
    const { result } = renderHook(() => useChatStream());
    expect(typeof result.current.send).toBe('function');
    expect(typeof result.current.abort).toBe('function');
    expect(result.current.isSending).toBe(false);
  });

  it('send 转发到 sendUserMessage 并透传返回值', async () => {
    const { result } = renderHook(() => useChatStream());
    let ret = true;
    await act(async () => {
      ret = await result.current.send('你好');
    });
    expect(chatState.sendUserMessage).toHaveBeenCalledWith('你好', undefined);
    expect(ret).toBe(true);
  });

  it('send 携带 options(mode/images/selectedRules)', () => {
    const { result } = renderHook(() => useChatStream());
    act(() => {
      result.current.send('go', { mode: 'coding', images: ['img1'], selectedRules: ['r1'] });
    });
    expect(chatState.sendUserMessage).toHaveBeenCalledWith('go', {
      mode: 'coding',
      images: ['img1'],
      selectedRules: ['r1'],
    });
  });

  it('abort 转发到 abortUserMessage', () => {
    const { result } = renderHook(() => useChatStream());
    act(() => result.current.abort());
    expect(chatState.abortUserMessage).toHaveBeenCalledTimes(1);
  });

  it('isSending 来自 useSessionStream,变化时同步', () => {
    const { result, rerender } = renderHook(() => useChatStream());
    streamState.isSending = true;
    rerender();
    expect(result.current.isSending).toBe(true);
  });
});