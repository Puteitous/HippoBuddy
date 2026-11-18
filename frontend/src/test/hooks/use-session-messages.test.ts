import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionMessages } from '@/hooks/useSessionMessages';

const { appState, chatFns, apiMock, emitMock } = vi.hoisted(() => {
  return {
    appState: { currentSessionId: null as string | null },
    chatFns: {
      resetSessionStream: vi.fn<(sid: string) => void>(),
      hasActiveStream: vi.fn<(sid: string) => boolean>(() => false),
      setMessages: vi.fn<(m: unknown[]) => void>(),
      setError: vi.fn<(e: unknown) => void>(),
      setIsLoadingMessages: vi.fn<(b: boolean) => void>(),
      getCachedMessages: vi.fn<() => unknown[] | null>(() => null),
      sessionStreams: {} as Record<string, unknown>,
    },
    apiMock: { sessions: { getMessages: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])) } },
    emitMock: vi.fn<(event: string, payload?: unknown) => void>(),
  };
});

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: { currentSessionId: string | null }) => unknown) => sel(appState),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (sel: (s: typeof chatFns) => unknown) => sel(chatFns),
    { getState: () => ({ sessionStreams: chatFns.sessionStreams }) },
  ),
}));
vi.mock('@/api/client', () => ({ api: apiMock }));
vi.mock('@/api/error', () => ({
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@/utils/eventBus', () => ({ emit: emitMock }));

beforeEach(() => {
  vi.clearAllMocks();
  appState.currentSessionId = null;
  chatFns.sessionStreams = {};
  chatFns.hasActiveStream.mockReturnValue(false);
  chatFns.getCachedMessages.mockReturnValue(null);
  // 真实 store 的分区回收会真正删除分区,测试里同步模拟,避免已回收的会话"复活"
  chatFns.resetSessionStream.mockImplementation((sid: string) => {
    delete chatFns.sessionStreams[sid];
  });
  apiMock.sessions.getMessages.mockResolvedValue([]);
});

afterEach(() => {
  chatFns.sessionStreams = {};
});

describe('useSessionMessages', () => {
  it('无 currentSessionId 时不发起加载', () => {
    renderHook(() => useSessionMessages());
    expect(apiMock.sessions.getMessages).not.toHaveBeenCalled();
  });

  it('无分区且无缓存:置 loading → 拉取后 setMessages + emit + 结束 loading', async () => {
    const data = [{ id: 'm1' }];
    apiMock.sessions.getMessages.mockResolvedValue(data);
    appState.currentSessionId = 's1';
    renderHook(() => useSessionMessages());
    expect(chatFns.setIsLoadingMessages).toHaveBeenCalledWith(true);
    await act(async () => {});
    expect(chatFns.setMessages).toHaveBeenCalledWith(data);
    expect(emitMock).toHaveBeenCalledWith('session:messages-loaded', { sessionId: 's1' });
    expect(chatFns.setIsLoadingMessages).toHaveBeenCalledWith(false);
  });

  it('命中缓存:立即渲染缓存且不进入 loading', async () => {
    chatFns.getCachedMessages.mockReturnValue([{ id: 'c1' }]);
    appState.currentSessionId = 's1';
    renderHook(() => useSessionMessages());
    expect(chatFns.setMessages).toHaveBeenCalledWith([{ id: 'c1' }]);
    expect(chatFns.setIsLoadingMessages).toHaveBeenCalledWith(false);
    // 后台仍刷新后端对齐(带 AbortSignal,切走时可中断)
    await act(async () => {});
    expect(apiMock.sessions.getMessages).toHaveBeenCalledWith('s1', expect.any(AbortSignal));
  });

  it('拉取失败:setError 且不 emit', async () => {
    apiMock.sessions.getMessages.mockRejectedValue(new Error('oops'));
    appState.currentSessionId = 's1';
    renderHook(() => useSessionMessages());
    await act(async () => {});
    expect(chatFns.setError).toHaveBeenCalledWith('Error: oops');
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('目标会话已有内存分区:直接复用,不拉取不加载', () => {
    chatFns.sessionStreams = { s1: { isSending: true } };
    appState.currentSessionId = 's1';
    renderHook(() => useSessionMessages());
    expect(apiMock.sessions.getMessages).not.toHaveBeenCalled();
    expect(chatFns.setIsLoadingMessages).not.toHaveBeenCalled();
  });

  it('切走时保留空闲分区(便于切回复用,不立即清理)', () => {
    chatFns.sessionStreams = { s1: { messages: [] } };
    appState.currentSessionId = 's1';
    const { rerender } = renderHook(() => useSessionMessages());
    chatFns.hasActiveStream.mockReturnValue(false);
    appState.currentSessionId = 's2';
    rerender();
    expect(chatFns.resetSessionStream).not.toHaveBeenCalled();
  });

  it('切回已保留的会话:复用内存分区,不重复请求历史', () => {
    const { rerender } = renderHook(() => useSessionMessages());
    appState.currentSessionId = 's1';
    rerender();
    // 模拟真实 store:s1 加载完成后留下内存分区
    chatFns.sessionStreams = { s1: { messages: [] } };
    appState.currentSessionId = 's2';
    rerender();
    appState.currentSessionId = 's1';
    rerender();
    // 仅 s1、s2 各请求一次;切回 s1 命中分区不再请求
    expect(apiMock.sessions.getMessages).toHaveBeenCalledTimes(2);
  });

  it('空闲分区超过保留时长后被回收', () => {
    vi.useFakeTimers();
    try {
      chatFns.sessionStreams = { s1: { messages: [] } };
      appState.currentSessionId = 's1';
      const { rerender } = renderHook(() => useSessionMessages());
      vi.advanceTimersByTime(6 * 60 * 1000);
      appState.currentSessionId = 's2';
      rerender();
      expect(chatFns.resetSessionStream).toHaveBeenCalledWith('s1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('空闲分区数量超限时淘汰最久未用的', () => {
    vi.useFakeTimers();
    try {
      chatFns.sessionStreams = { s1: {}, s2: {}, s3: {}, s4: {}, s5: {}, s6: {}, s7: {} };
      appState.currentSessionId = 's1';
      const { rerender } = renderHook(() => useSessionMessages());
      for (const sid of ['s2', 's3', 's4', 's5', 's6', 's7']) {
        vi.advanceTimersByTime(1000);
        appState.currentSessionId = sid;
        rerender();
      }
      // 空闲 6 个 > 上限 4 → 淘汰最久未用的 s1、s2
      expect(chatFns.resetSessionStream).toHaveBeenCalledWith('s1');
      expect(chatFns.resetSessionStream).toHaveBeenCalledWith('s2');
      expect(chatFns.resetSessionStream).not.toHaveBeenCalledWith('s6');
    } finally {
      vi.useRealTimers();
    }
  });

  it('切走时保留有活跃流的上一个会话分区(供切回续看)', () => {
    chatFns.sessionStreams = { s1: { isSending: true } };
    appState.currentSessionId = 's1';
    const { rerender } = renderHook(() => useSessionMessages());
    chatFns.hasActiveStream.mockReturnValue(true);
    appState.currentSessionId = 's2';
    rerender();
    expect(chatFns.resetSessionStream).not.toHaveBeenCalled();
  });
});