import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionStream } from '@/hooks/useSessionStream';

const { appState, chatState, EMPTY } = vi.hoisted(() => {
  const EMPTY = { isSending: false, stream: '', toolCalls: [] };
  return {
    appState: { currentSessionId: null as string | null },
    chatState: { sessionStreams: {} as Record<string, unknown> },
    EMPTY,
  };
});

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: { currentSessionId: string | null }) => unknown) => sel(appState),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (sel: (s: { sessionStreams: Record<string, unknown> }) => unknown) => sel(chatState),
    { getState: () => chatState },
  ),
  EMPTY_SESSION_STREAM: EMPTY,
}));

beforeEach(() => {
  appState.currentSessionId = null;
  chatState.sessionStreams = {};
});

describe('useSessionStream', () => {
  it('currentSessionId 为 null 时返回稳定空态', () => {
    const { result } = renderHook(() => useSessionStream());
    expect(result.current).toBe(EMPTY);
  });

  it('currentSessionId 有值但该会话无分区时返回稳定空态', () => {
    appState.currentSessionId = 's1';
    chatState.sessionStreams = { s2: { isSending: true } };
    const { result } = renderHook(() => useSessionStream());
    expect(result.current).toBe(EMPTY);
  });

  it('currentSessionId 命中分区时返回该会话分区', () => {
    appState.currentSessionId = 's1';
    const s1 = { isSending: true, stream: 'xo', toolCalls: [1] };
    chatState.sessionStreams = { s1, s2: { isSending: false } };
    const { result } = renderHook(() => useSessionStream());
    expect(result.current).toBe(s1);
  });

  it('切换会话时返回目标分区', () => {
    appState.currentSessionId = 's1';
    const s1 = { isSending: true };
    const s2 = { isSending: false };
    chatState.sessionStreams = { s1, s2 };
    const { result, rerender } = renderHook(() => useSessionStream());
    expect(result.current).toBe(s1);
    appState.currentSessionId = 's2';
    rerender();
    expect(result.current).toBe(s2);
  });
});