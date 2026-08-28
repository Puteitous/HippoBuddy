import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletedTaskNotification } from '@/hooks/useCompletedTaskNotification';

vi.mock('@/i18n', () => ({
  translate: (s: string) => s,
}));

const { chatStore, appState, toast } = vi.hoisted(() => ({
  chatStore: { subscribe: vi.fn() },
  appState: { currentSessionId: 'current', sessions: [{ id: 'back1', title: '后台任务' }] },
  toast: { showToast: vi.fn() },
}));

vi.mock('@/stores/chatStore', () => ({ useChatStore: chatStore }));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => undefined, { getState: () => appState }),
}));
vi.mock('@/utils/toastStore', () => toast);

type SessionStream = { doneReason?: string | null };
interface StateLike {
  sessionStreams: Record<string, SessionStream>;
}

const subHandlers: Array<(s: StateLike, p: StateLike) => void> = [];

function mkState(reasonBySid: Record<string, string | null | undefined>): StateLike {
  const sessionStreams: Record<string, SessionStream> = {};
  for (const [sid, reason] of Object.entries(reasonBySid)) {
    sessionStreams[sid] = reason ? { doneReason: reason } : {};
  }
  return { sessionStreams };
}

beforeEach(() => {
  vi.clearAllMocks();
  subHandlers.length = 0;
  chatStore.subscribe.mockImplementation((cb: (s: StateLike, p: StateLike) => void) => {
    subHandlers.push(cb);
    return () => {};
  });
  appState.currentSessionId = 'current';
  appState.sessions = [];
});

describe('useCompletedTaskNotification', () => {
  it('挂载时订阅 chatStore', () => {
    renderHook(() => useCompletedTaskNotification());
    expect(chatStore.subscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it('后台非当前会话首次完成(doneReason 由空→非空)时弹 toast', () => {
    appState.currentSessionId = 'current';
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useCompletedTaskNotification());
    act(() => {
      subHandlers[0](mkState({ back1: 'stop_hook' }), mkState({ back1: undefined }));
    });
    expect(toast.showToast).toHaveBeenCalledWith(
      'chat.backgroundSessionCompleted',
      { type: 'success', duration: 4000 },
    );
  });

  it('当前正在查看的会话完成不弹提醒', () => {
    appState.currentSessionId = 'back1';
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useCompletedTaskNotification());
    act(() => {
      subHandlers[0](mkState({ back1: 'stop_hook' }), mkState({ back1: undefined }));
    });
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('doneReason 已非空(非首次完成)时不重复弹', () => {
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useCompletedTaskNotification());
    act(() => {
      subHandlers[0](mkState({ back1: 'stop_hook' }), mkState({ back1: 'length' }));
    });
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('doneReason 仍为空(null)时不弹', () => {
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useCompletedTaskNotification());
    act(() => {
      subHandlers[0](mkState({ back1: undefined }), mkState({ back1: undefined }));
    });
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('会话无标题/未在 sessions 中找到时用 sessionId 兜底', () => {
    renderHook(() => useCompletedTaskNotification());
    act(() => {
      subHandlers[0](mkState({ 'web-suffix123': 'done' }), mkState({ 'web-suffix123': undefined }));
    });
    // replace(/^web-/, '') → suffix123,slice(-6) 截取结尾 6 位 → fix123
    expect(toast.showToast).toHaveBeenCalledWith(
      'chat.backgroundSessionCompleted',
      { type: 'success', duration: 4000 },
    );
  });
});