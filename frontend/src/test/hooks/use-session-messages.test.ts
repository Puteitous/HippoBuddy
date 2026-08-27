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
    // 后台仍刷新后端对齐
    await act(async () => {});
    expect(apiMock.sessions.getMessages).toHaveBeenCalledWith('s1');
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

  it('切走时清理无活跃流的上一个会话分区', () => {
    appState.currentSessionId = 's1';
    const { rerender } = renderHook(() => useSessionMessages());
    chatFns.hasActiveStream.mockReturnValue(false);
    appState.currentSessionId = 's2';
    rerender();
    expect(chatFns.resetSessionStream).toHaveBeenCalledWith('s1');
  });

  it('切走时保留有活跃流的上一个会话分区(供切回续看)', () => {
    appState.currentSessionId = 's1';
    const { rerender } = renderHook(() => useSessionMessages());
    chatFns.hasActiveStream.mockReturnValue(true);
    appState.currentSessionId = 's2';
    rerender();
    expect(chatFns.resetSessionStream).not.toHaveBeenCalled();
  });
});