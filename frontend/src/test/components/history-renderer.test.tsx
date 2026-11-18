import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import type { Message } from '@/types';
import { HistoryRenderer, type HistoryRendererHandle } from '@/components/chat-panel/HistoryRenderer';

const { state } = vi.hoisted(() => ({
  state: {
    messages: [] as unknown[],
    currentSessionId: 's1',
    t: (key: string, params?: Record<string, string | number>) =>
      params && params.count != null ? `${key}:${params.count}` : key,
  },
}));

vi.mock('@/hooks/useSessionStream', () => ({
  useSessionStream: () => ({
    messages: state.messages,
    isLoadingMessages: false,
    error: null,
    isSending: false,
    toolCalls: [],
    askUserData: null,
    waitingForUser: false,
    collapsedRounds: {},
    suggestions: [],
    suggestionsLoading: false,
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ toggleRoundCollapsed: vi.fn(), reloadSuggestions: vi.fn() }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ currentSessionId: state.currentSessionId }),
}));

vi.mock('@/i18n', () => ({ useI18n: () => ({ t: state.t }) }));

vi.mock('@/utils/process-view-config', () => ({ getDefaultProcessCollapsed: () => false }));

vi.mock('@/components/chat-panel/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string } }) => (
    <div data-message-id={message.id}>{message.id}</div>
  ),
  MessageFooter: () => null,
}));

vi.mock('@/components/chat-panel/ProcessSection', () => ({
  ProcessSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/chat-panel/SuggestedQuestions', () => ({ SuggestedQuestions: () => null }));

vi.mock('@/components/rollback/RollbackButton', () => ({
  RollbackButton: () => null,
  RollbackPanel: () => null,
}));

vi.mock('@/components/rollback/useRollback', () => ({
  useRollback: () => ({
    status: 'idle',
    previewFiles: [],
    currentSessionId: 's1',
    handleOpen: vi.fn(),
    handleCancel: vi.fn(),
    handleConfirm: vi.fn(),
  }),
}));

vi.mock('@/components/tool-renderers/ToolTimeline', () => ({ ToolTimeline: () => null }));
vi.mock('@/components/tool-renderers/ToolCardDispatcher', () => ({ ToolCardDispatcher: () => null }));
vi.mock('@/components/tool-renderers/AskUserCard', () => ({ AskUserCard: () => null }));

/** 构造 N 个回合(每回合 1 条 user + 1 条 assistant) */
function buildMessages(rounds: number): Message[] {
  const list: Message[] = [];
  for (let i = 1; i <= rounds; i++) {
    list.push({ id: `u${i}`, role: 'user', content: `q${i}`, timestamp: i } as Message);
    list.push({ id: `a${i}`, role: 'assistant', content: `a${i}`, timestamp: i } as Message);
  }
  return list;
}

describe('HistoryRenderer 历史窗口化', () => {
  beforeEach(() => {
    state.currentSessionId = 's1';
    state.messages = buildMessages(40);
  });

  it('首屏只渲染最近 30 个回合,并显示加载更早入口', () => {
    const { container } = render(<HistoryRenderer />);
    // 前 10 个回合被折叠
    expect(container.querySelector('[data-message-id="u10"]')).toBeNull();
    expect(container.querySelector('[data-message-id="u11"]')).not.toBeNull();
    expect(container.querySelector('[data-message-id="u40"]')).not.toBeNull();
    expect(container.querySelector('.history-load-earlier')?.textContent).toContain('10');
  });

  it('短会话不折叠、不显示加载更早', () => {
    state.messages = buildMessages(10);
    const { container } = render(<HistoryRenderer />);
    expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull();
    expect(container.querySelector('.history-load-earlier')).toBeNull();
  });

  it('点击加载更早后展开全部回合,入口消失', () => {
    const { container } = render(<HistoryRenderer />);
    fireEvent.click(container.querySelector('.history-load-earlier') as HTMLElement);
    expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull();
    expect(container.querySelector('.history-load-earlier')).toBeNull();
  });

  it('revealMessage 展开到目标消息所在回合', () => {
    const ref = createRef<HistoryRendererHandle>();
    const { container } = render(<HistoryRenderer ref={ref} />);
    act(() => {
      ref.current?.revealMessage('u1');
    });
    expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull();
  });

  it('revealAll 展开全部历史', () => {
    const ref = createRef<HistoryRendererHandle>();
    const { container } = render(<HistoryRenderer ref={ref} />);
    act(() => {
      ref.current?.revealAll();
    });
    expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull();
    expect(container.querySelector('.history-load-earlier')).toBeNull();
  });
});
