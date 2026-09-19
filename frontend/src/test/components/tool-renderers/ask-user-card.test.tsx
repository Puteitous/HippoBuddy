import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskUserCard } from '@/components/tool-renderers/AskUserCard';
import type { ToolCallRecord } from '@/types';

const { appState, chatState, streamState } = vi.hoisted(() => ({
  appState: { currentSessionId: 's1' as string | null },
  chatState: {
    commitAskUser: vi.fn(),
    setError: vi.fn(),
    sendUserMessage: vi.fn(() => Promise.resolve()),
  },
  streamState: {
    askUserData: null as null | { question: string; options: string[] },
    waitingForUser: false,
  },
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: { currentSessionId: string | null }) => unknown) => sel(appState),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (sel: (s: typeof chatState) => unknown) => sel(chatState),
    { getState: () => chatState },
  ),
}));
vi.mock('@/hooks/useSessionStream', () => ({
  useSessionStream: () => streamState,
}));

const answeredRecord = {
  id: 'ask1',
  name: 'ask_user',
  status: 'success',
  args: { question: '继续执行？', options: ['是', '否'], answered: '是' },
} as unknown as ToolCallRecord;

const pendingRecord = {
  id: 'ask2',
  name: 'ask_user',
  status: 'running',
  args: { question: '选择方案？', options: ['方案A', '方案B'] },
} as unknown as ToolCallRecord;

beforeEach(() => {
  vi.clearAllMocks();
  streamState.askUserData = null;
  streamState.waitingForUser = false;
  appState.currentSessionId = 's1';
});

describe('AskUserCard - 只读历史态(record)', () => {
  it('只读卡(已答复)默认折叠,头部含 已回复 徽章,展开可见问题与回答', () => {
    render(<AskUserCard record={answeredRecord} />);
    // 默认折叠:标题+徽章可见,body 隐藏
    expect(screen.getByRole('button', { name: /需要确认已回复/ })).toBeInTheDocument();
    expect(screen.queryByText('继续执行？')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /需要确认已回复/ }));
    expect(screen.getByText('继续执行？')).toBeInTheDocument();
    // 已回答分支渲染回答文本、不渲染选项按钮
    expect(screen.getByText('是')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^[是否]$/ })).toHaveLength(0);
  });

  it('已答复只读卡展开后不可再提交', () => {
    render(<AskUserCard record={answeredRecord} />);
    fireEvent.click(screen.getByRole('button', { name: /需要确认已回复/ }));
    expect(chatState.sendUserMessage).not.toHaveBeenCalled();
    expect(chatState.commitAskUser).not.toHaveBeenCalled();
  });

  it('record 无 answered 时渲染禁用选项(只读),点击不提交', () => {
    render(<AskUserCard record={pendingRecord} />);
    // 展开只读卡
    fireEvent.click(screen.getByRole('button', { name: '需要确认' }));
    expect(screen.getByText('选择方案？')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: '方案A' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(chatState.commitAskUser).not.toHaveBeenCalled();
    expect(chatState.sendUserMessage).not.toHaveBeenCalled();
  });
});

describe('AskUserCard - 实时交互态(无 record)', () => {
  it('无 record 且无 askUserData 时不渲染', () => {
    const { container } = render(<AskUserCard />);
    expect(container.firstChild).toBeNull();
  });

  it('有 askUserData 且 waitingForUser 时默认展开、选项可点', () => {
    streamState.askUserData = { question: '确认操作？', options: ['继续', '取消'] };
    streamState.waitingForUser = true;
    render(<AskUserCard />);
    expect(screen.getByText('确认操作？')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续' })).not.toBeDisabled();
  });

  it('点击选项 → 固化回答 + 作为新消息发送', async () => {
    streamState.askUserData = { question: '确认操作？', options: ['继续', '取消'] };
    streamState.waitingForUser = true;
    render(<AskUserCard />);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(chatState.commitAskUser).toHaveBeenCalledWith('继续');
    expect(chatState.sendUserMessage).toHaveBeenCalledWith('继续');
    expect(chatState.setError).toHaveBeenCalledWith(null);
    await screen.findByRole('button', { name: '继续' });
  });

  it('currentSessionId 为 null 时不发送', () => {
    appState.currentSessionId = null;
    streamState.askUserData = { question: '确认操作？', options: ['继续'] };
    streamState.waitingForUser = true;
    render(<AskUserCard />);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(chatState.commitAskUser).not.toHaveBeenCalled();
    expect(chatState.sendUserMessage).not.toHaveBeenCalled();
  });

  it('waitingForUser 为 false 时收起、展开后选项禁用', () => {
    streamState.askUserData = { question: '确认操作？', options: ['继续'] };
    streamState.waitingForUser = false;
    render(<AskUserCard />);
    expect(screen.queryByText('确认操作？')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '需要确认' }));
    expect(screen.getByText('确认操作？')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled();
  });
});

describe('AskUserCard - 问题文本换行归一化', () => {
  it('转义换行序列还原为真实换行', () => {
    const { container } = render(
      <AskUserCard
        record={
          {
            id: 'a',
            name: 'ask_user',
            status: 'success',
            args: { question: '继续？\\n\\n确认', answered: 'ok' },
          } as unknown as ToolCallRecord
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /需要确认已回复/ }));
    const q = container.querySelector('.ask-user-question') as HTMLElement;
    expect(q.textContent).toBe('继续？\n\n确认');
  });
});