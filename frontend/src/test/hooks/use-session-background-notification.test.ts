import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionBackgroundNotification } from '@/hooks/useSessionBackgroundNotification';

vi.mock('@/i18n', () => ({
  translate: (s: string) => s,
}));

const { chatStore, appState, toast, bridge, notifClicks } = vi.hoisted(() => {
  const notifClicks: Array<(payload: { sessionId?: string }) => void> = [];
  return {
    chatStore: { subscribe: vi.fn() },
    appState: {
      currentSessionId: 'current',
      sessions: [] as Array<{ id: string; title?: string }>,
      setCurrentSession: vi.fn(),
    },
    toast: { showToast: vi.fn() },
    bridge: {
      showNotification: vi.fn().mockResolvedValue({ success: true }),
      onNotificationClicked: vi.fn((cb: (payload: { sessionId?: string }) => void) => {
        notifClicks.push(cb);
        return () => {};
      }),
    },
    notifClicks,
  };
});

vi.mock('@/stores/chatStore', () => ({ useChatStore: chatStore }));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => undefined, { getState: () => appState }),
}));
vi.mock('@/utils/toastStore', () => toast);
vi.mock('@/utils/desktop-bridge', () => ({ desktopBridge: bridge }));

interface ToolCallLike { name: string; confirmationData?: unknown }
interface SessionStream {
  doneReason?: string | null;
  waitingForUser?: boolean;
  toolCalls?: ToolCallLike[];
}
interface StateLike { sessionStreams: Record<string, SessionStream> }

const subHandlers: Array<(s: StateLike, p: StateLike) => void> = [];
let hidden = false;

/** 覆写 document.hidden(jsdom getter 不可 spy,用 defineProperty 兜底) */
function setHidden(v: boolean) {
  hidden = v;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

function mkSummary(over: Partial<SessionStream> = {}): SessionStream {
  return { doneReason: null, waitingForUser: false, toolCalls: [], ...over };
}

function mkState(sid: string, cur: SessionStream): StateLike {
  return { sessionStreams: { [sid]: cur } };
}

beforeEach(() => {
  vi.clearAllMocks();
  subHandlers.length = 0;
  hidden = false;
  chatStore.subscribe.mockImplementation((cb: (s: StateLike, p: StateLike) => void) => {
    subHandlers.push(cb);
    return () => {};
  });
  appState.currentSessionId = 'current';
  appState.sessions = [];
});

describe('useSessionBackgroundNotification', () => {
  it('挂载时订阅 chatStore 与通知点击', () => {
    renderHook(() => useSessionBackgroundNotification());
    expect(chatStore.subscribe).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.onNotificationClicked).toHaveBeenCalled();
  });

  it('窗口隐藏时,会话完成发系统通知(带 sessionId)', () => {
    setHidden(true);
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        mkState('back1', mkSummary({ doneReason: 'stop_hook' })),
        { sessionStreams: { back1: mkSummary() } },
      );
    });
    expect(bridge.showNotification).toHaveBeenCalledWith(
      'chat.notifySessionDoneTitle', 'chat.notifySessionDoneBody',
      undefined, 'back1',
    );
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('窗口可见时,后台会话完成弹应用内 toast', () => {
    setHidden(false);
    appState.sessions = [{ id: 'back1', title: '后台任务' }];
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        mkState('back1', mkSummary({ doneReason: 'stop_hook' })),
        { sessionStreams: { back1: mkSummary() } },
      );
    });
    expect(bridge.showNotification).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledWith(
      'chat.backgroundSessionCompleted', { type: 'success', duration: 4000 },
    );
  });

  it('窗口可见且为当前会话时,完成不提醒(卡片已在屏上)', () => {
    setHidden(false);
    appState.currentSessionId = 'back1';
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        mkState('back1', mkSummary({ doneReason: 'stop_hook' })),
        { sessionStreams: { back1: mkSummary() } },
      );
    });
    expect(bridge.showNotification).not.toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('窗口隐藏时,ask_user 等待输入发系统通知', () => {
    setHidden(true);
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        mkState('back1', mkSummary({ waitingForUser: true })),
        { sessionStreams: { back1: mkSummary({ waitingForUser: false }) } },
      );
    });
    expect(bridge.showNotification).toHaveBeenCalledWith(
      'chat.notifyWaitTitle', 'chat.notifyWaitBody', undefined, 'back1',
    );
  });

  it('窗口隐藏时,工具确认卡片(confirmationData 由无→有)发系统通知', () => {
    setHidden(true);
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        {
          sessionStreams: {
            back1: mkSummary({ toolCalls: [{ name: 'bash', confirmationData: { confirmId: 'c1' } }] }),
          },
        },
        {
          sessionStreams: {
            back1: mkSummary({ toolCalls: [{ name: 'bash', confirmationData: undefined }] }),
          },
        },
      );
    });
    expect(bridge.showNotification).toHaveBeenCalledWith(
      'chat.notifyWaitTitle', 'chat.notifyWaitBody', undefined, 'back1',
    );
  });

  it('点击系统通知点击回调,切换到对应会话', () => {
    renderHook(() => useSessionBackgroundNotification());
    expect(bridge.onNotificationClicked).toHaveBeenCalled();
    act(() => { (notifClicks[0] as (p: { sessionId?: string }) => void)({ sessionId: 'back1' }); });
    expect(appState.setCurrentSession).toHaveBeenCalledWith('back1');
  });

  it('doneReason 非首次完成(prev 已非空)不重复通知', () => {
    setHidden(true);
    renderHook(() => useSessionBackgroundNotification());
    act(() => {
      subHandlers[0](
        mkState('back1', mkSummary({ doneReason: 'length' })),
        { sessionStreams: { back1: mkSummary({ doneReason: 'stop_hook' }) } },
      );
    });
    expect(bridge.showNotification).not.toHaveBeenCalled();
  });
});