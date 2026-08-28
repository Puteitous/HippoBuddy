import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '@/components/Sidebar';
import { useAppStore } from '@/stores/appStore';
import type { Session } from '@/types';

const { sessionApi, workspaceApi, toast, chatStore, previewStore } = vi.hoisted(() => ({
  sessionApi: { rename: vi.fn(), delete: vi.fn(), pin: vi.fn() },
  workspaceApi: { getCurrent: vi.fn(), setCurrent: vi.fn() },
  toast: { showToast: vi.fn() },
  chatStore: { sessionStreams: {} as Record<string, { isSending?: boolean; completedUnread?: boolean; stream: unknown[]; toolCalls: unknown[] }>, dismissSessionCompleted: vi.fn() },
  previewStore: { openFile: vi.fn(), activePath: null as string | null },
}));

vi.mock('@/api/client', () => ({ sessionApi, workspaceApi }));
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (sel: (s: unknown) => unknown) => sel(chatStore),
}));
vi.mock('@/stores/previewStore', () => ({
  usePreviewStore: (sel: (s: unknown) => unknown) => sel(previewStore),
}));
vi.mock('@/components/workspace/FileTree', () => ({
  FileTree: (props: { rootPath: string }) => <div data-testid="file-tree">{props.rootPath}</div>,
}));

/** 构造会话(必填字段齐全,时间戳可注入) */
function session(id: string, partial: Partial<Session> = {}): Session {
  return {
    id,
    title: '',
    messageCount: 0,
    active: false,
    running: false,
    createdAt: '',
    ...partial,
  };
}

/** jsdom 缺少 ResizeObserver/IntersectionObserver,stub 为空实现;raf 不回调保证无限滚动批次可控 */
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', MockObserver);
  vi.stubGlobal('IntersectionObserver', MockObserver);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  sessionApi.rename.mockResolvedValue({ success: true });
  sessionApi.delete.mockResolvedValue({ success: true });
  sessionApi.pin.mockResolvedValue({ success: true });
  workspaceApi.getCurrent.mockResolvedValue({ path: '' });
  workspaceApi.setCurrent.mockResolvedValue({ path: '' });
  chatStore.sessionStreams = {};
  previewStore.activePath = null;
  useAppStore.setState({
    sessions: [],
    currentSessionId: null,
    mode: 'coding',
    workspacePath: '',
    isLoadingSessions: false,
    sessionsError: null,
    sidebarCollapsed: false,
    sessionDisplayNames: {},
    sessionInputDrafts: {},
    heroPendingDraft: '',
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Sidebar 工具栏与折叠', () => {
  it('渲染折叠/新建按钮、视图胶囊、标题与会话计数', () => {
    useAppStore.setState({ sessions: [session('s1'), session('s2')] });
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: '收起会话面板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建会话' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '会话列表' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文件浏览' })).toBeInTheDocument();
    expect(screen.getByText('会话')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('点击折叠按钮折叠侧栏并持久化', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '收起会话面板' }));
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('hippo-sidebar-collapsed')).toBe('true');
  });

  it('sidebarCollapsed=true 时 aside 带 hidden class', () => {
    useAppStore.setState({ sidebarCollapsed: true });
    const { container } = render(<Sidebar />);
    expect(container.querySelector('aside.sidebar.hidden')).not.toBeNull();
  });

  it('点击新建会话生成 web-* 当前会话', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(useAppStore.getState().currentSessionId?.startsWith('web-')).toBe(true);
  });
});

describe('Sidebar 分组模式', () => {
  it('分组按钮默认 Project,点击切换到 Time 并持久化', () => {
    render(<Sidebar />);
    expect(screen.getByText('项目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切换分组方式' }));
    expect(screen.getByText('时间')).toBeInTheDocument();
    expect(localStorage.getItem('hippo-session-group-mode')).toBe('time');
  });

  it('再次点击切回 Project', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '切换分组方式' }));
    fireEvent.click(screen.getByRole('button', { name: '切换分组方式' }));
    expect(screen.getByText('项目')).toBeInTheDocument();
    expect(localStorage.getItem('hippo-session-group-mode')).toBe('project');
  });
});

describe('Sidebar 列表四态', () => {
  it('加载中显示「加载中...」', () => {
    useAppStore.setState({ isLoadingSessions: true });
    render(<Sidebar />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('加载失败显示错误文本', () => {
    useAppStore.setState({ sessionsError: 'network down' });
    render(<Sidebar />);
    expect(screen.getByText('加载会话失败')).toBeInTheDocument();
    expect(screen.getByText('network down')).toBeInTheDocument();
  });

  it('空列表显示「暂无会话」', () => {
    render(<Sidebar />);
    expect(screen.getByText('暂无会话')).toBeInTheDocument();
  });
});

describe('Sidebar 会话项与切换', () => {
  it('渲染会话名称/模式/时间,点击切换当前会话', () => {
    const ts = String(new Date(2024, 0, 15, 10, 30).getTime());
    useAppStore.setState({
      sessions: [session('s1', { title: '我的会话', mode: 'coding', createdAt: ts })],
    });
    const { container } = render(<Sidebar />);
    expect(screen.getByText('我的会话')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
    expect(container.querySelector('.session-item-time')?.textContent).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/);
    fireEvent.click(container.querySelector('.session-item') as HTMLElement);
    expect(useAppStore.getState().currentSessionId).toBe('s1');
  });

  it('当前会话项带 session-item-active class', () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '甲' }), session('s2', { title: '乙' })],
      currentSessionId: 's2',
    });
    const { container } = render(<Sidebar />);
    const items = container.querySelectorAll('.session-item');
    expect(items[0].classList.contains('session-item-active')).toBe(false);
    expect(items[1].classList.contains('session-item-active')).toBe(true);
  });

  it('无标题无显示名时兜底为「会话 <id后6位>」', () => {
    useAppStore.setState({ sessions: [session('web-1234567890')] });
    render(<Sidebar />);
    expect(screen.getByText('会话 567890')).toBeInTheDocument();
  });

  it('sessionDisplayNames 兜底显示名(title 为空时)', () => {
    useAppStore.setState({
      sessions: [session('s1')],
      sessionDisplayNames: { s1: '新会话' },
    });
    render(<Sidebar />);
    expect(screen.getByText('新会话')).toBeInTheDocument();
  });

  it('会话存在前端活跃流时显示 streaming spinner', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    chatStore.sessionStreams = { s1: { isSending: true, stream: [], toolCalls: [] } };
    const { container } = render(<Sidebar />);
    expect(container.querySelector('[aria-label="streaming"]')).not.toBeNull();
  });

  it('存在待确认工具调用时显示 awaiting-confirm 而非 streaming spinner', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    chatStore.sessionStreams = {
      s1: {
        isSending: true,
        stream: [],
        toolCalls: [{ id: 't1', name: 'bash', status: 'running', confirmationData: { confirmId: 'c1' } }],
      },
    };
    const { container } = render(<Sidebar />);
    expect(container.querySelector('[aria-label="awaiting-confirm"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="streaming"]')).toBeNull();
  });

  it('后台任务完成后显示小圆点,点击调用 dismissSessionCompleted 清除', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    chatStore.sessionStreams = {
      s1: { isSending: false, stream: [], toolCalls: [], completedUnread: true },
    };
    const { container } = render(<Sidebar />);
    const dot = container.querySelector('[aria-label="completed"]');
    expect(dot).not.toBeNull();
    fireEvent.click(dot as HTMLElement);
    expect(chatStore.dismissSessionCompleted).toHaveBeenCalledWith('s1');
  });

  it('当前正在查看的会话不显示「已完成」小圆点', () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '甲' })],
      currentSessionId: 's1',
    });
    chatStore.sessionStreams = {
      s1: { isSending: false, stream: [], toolCalls: [], completedUnread: true },
    };
    const { container } = render(<Sidebar />);
    expect(container.querySelector('[aria-label="completed"]')).toBeNull();
  });
});

describe('Sidebar 重命名', () => {
  it('点击重命名进入内联输入,blur 提交调用 rename 并更新标题', async () => {
    useAppStore.setState({ sessions: [session('s1', { title: '旧名' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '新名' } });
    fireEvent.blur(input);
    await waitFor(() => expect(sessionApi.rename).toHaveBeenCalledWith('s1', '新名'));
    expect(useAppStore.getState().sessions[0].title).toBe('新名');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('重命名未变化时不调用 API', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '旧名' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.blur(input);
    expect(sessionApi.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('重命名失败 toast 错误并退出编辑', async () => {
    sessionApi.rename.mockRejectedValue(new Error('boom'));
    useAppStore.setState({ sessions: [session('s1', { title: '旧名' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '新名' } });
    fireEvent.blur(input);
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^重命名失败: /);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Escape 取消重命名恢复原标题', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '旧名' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '改了' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('旧名')).toBeInTheDocument();
    expect(sessionApi.rename).not.toHaveBeenCalled();
  });
});

describe('Sidebar 删除会话', () => {
  it('点击删除出现二次确认条,确认后调用 delete 并移除会话', async () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText('确定删除？')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('确认删除'));
    await waitFor(() => expect(sessionApi.delete).toHaveBeenCalledWith('s1'));
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledWith('会话已删除', { type: 'success' });
  });

  it('删除当前会话后自动新建 web-* 会话', async () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '甲' })],
      currentSessionId: 's1',
    });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByTitle('确认删除'));
    await waitFor(() => expect(sessionApi.delete).toHaveBeenCalled());
    expect(useAppStore.getState().currentSessionId?.startsWith('web-')).toBe(true);
  });

  it('取消时保留会话不调用 API', () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByTitle('取消'));
    expect(sessionApi.delete).not.toHaveBeenCalled();
    expect(useAppStore.getState().sessions).toHaveLength(1);
    expect(screen.getByText('甲')).toBeInTheDocument();
  });

  it('删除失败 toast 错误并保留会话', async () => {
    sessionApi.delete.mockRejectedValue(new Error('boom'));
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByTitle('确认删除'));
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^删除失败: /);
    expect(useAppStore.getState().sessions).toHaveLength(1);
  });
});

describe('Sidebar 置顶会话', () => {
  it('点击置顶调用 pin 并更新 pinned 状态', async () => {
    useAppStore.setState({ sessions: [session('s1', { title: '甲' })] });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '置顶' }));
    await waitFor(() => expect(sessionApi.pin).toHaveBeenCalledWith('s1', true));
    expect(useAppStore.getState().sessions[0].pinned).toBe(true);
    expect(toast.showToast).toHaveBeenCalledWith('会话已置顶', { type: 'success' });
  });

  it('置顶会话进入顶部置顶区,普通分组不含', () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '置顶甲', pinned: true }), session('s2', { title: '普通乙' })],
    });
    const { container } = render(<Sidebar />);
    expect(container.querySelector('.session-pinned-header')).not.toBeNull();
    // 置顶区头部标题
    expect(screen.getByText('置顶')).toBeInTheDocument();
    // 置顶会话仅出现在置顶区(整个列表出现一次)
    expect(screen.getAllByText('置顶甲')).toHaveLength(1);
    expect(screen.getByText('普通乙')).toBeInTheDocument();
  });

  it('置顶区可折叠隐藏置顶会话', () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '置顶甲', pinned: true })],
    });
    const { container } = render(<Sidebar />);
    fireEvent.click(screen.getByTitle('收起置顶会话'));
    expect(localStorage.getItem('hippo-pinned-collapsed')).toBe('1');
    expect(screen.queryByText('置顶甲')).not.toBeInTheDocument();
    expect(container.querySelector('.session-pinned-collapse.collapsed')).not.toBeNull();
  });
});

describe('Sidebar 项目分组', () => {
  it('project 模式按项目分组渲染项目头,折叠隐藏其下会话', () => {
    useAppStore.setState({
      sessions: [
        session('s1', { title: '甲', projectPath: '/e:/proj/A' }),
        session('s2', { title: '乙', projectPath: '/e:/proj/A' }),
      ],
    });
    const { container } = render(<Sidebar />);
    expect(container.querySelector('.session-project-header')).not.toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(screen.getByText('乙')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.session-project-header') as HTMLElement);
    expect(screen.queryByText('甲')).not.toBeInTheDocument();
    expect(screen.queryByText('乙')).not.toBeInTheDocument();
    expect(localStorage.getItem('hippo-collapsed-projects')).toContain('/e:/proj/A');
  });

  it('无路径会话归入「其他」且置底', () => {
    const now = Date.now();
    useAppStore.setState({
      sessions: [
        session('s1', { title: '甲', projectPath: '/e:/proj/A', lastActivityAt: String(now - 50000) }),
        session('s2', { title: '乙', projectPath: '/e:/proj/B', lastActivityAt: String(now - 100000) }),
        session('s3', { title: '丙', lastActivityAt: String(now) }),
      ],
    });
    const { container } = render(<Sidebar />);
    const names = [...container.querySelectorAll('.project-name')].map((el) => el.textContent);
    expect(names).toEqual(['A', 'B', '其他']);
    expect(screen.getByText('丙')).toBeInTheDocument();
  });

  it('打开工作区按钮调用 setCurrent 并 toast 成功', async () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '甲', projectPath: '/e:/proj/A' })],
    });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }));
    await waitFor(() => expect(workspaceApi.setCurrent).toHaveBeenCalledWith('/e:/proj/A'));
    expect(toast.showToast).toHaveBeenCalledWith('工作区已切换: /e:/proj/A', { type: 'success' });
  });

  it('打开工作区失败 toast 错误', async () => {
    workspaceApi.setCurrent.mockRejectedValue(new Error('boom'));
    useAppStore.setState({
      sessions: [session('s1', { title: '甲', projectPath: '/e:/proj/A' })],
    });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }));
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^切换工作区失败: /);
  });

  it('当前会话所属项目头带 has-active', () => {
    useAppStore.setState({
      sessions: [
        session('s1', { title: '甲', projectPath: '/e:/proj/A' }),
        session('s2', { title: '乙', projectPath: '/e:/proj/B' }),
      ],
      currentSessionId: 's1',
    });
    const { container } = render(<Sidebar />);
    const headers = container.querySelectorAll('.session-project-header');
    expect(headers[0].classList.contains('has-active')).toBe(true);
    expect(headers[1].classList.contains('has-active')).toBe(false);
  });
});

describe('Sidebar 时间分组', () => {
  it('time 模式按时间渲染分类头(今天)', () => {
    localStorage.setItem('hippo-session-group-mode', 'time');
    useAppStore.setState({
      sessions: [session('s1', { title: '甲', lastActivityAt: String(Date.now()) })],
    });
    render(<Sidebar />);
    expect(screen.getByText('今天')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
  });
});

describe('Sidebar 视图切换(文件树)', () => {
  it('文件视图:未设置工作区时显示空态', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '文件浏览' }));
    expect(screen.getByText('未设置工作区')).toBeInTheDocument();
  });

  it('文件视图:有工作区渲染 FileTree,切回会话视图恢复列表', () => {
    useAppStore.setState({
      sessions: [session('s1', { title: '甲' })],
      workspacePath: '/ws',
    });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: '文件浏览' }));
    expect(screen.getByTestId('file-tree')).toHaveTextContent('/ws');
    fireEvent.click(screen.getByRole('button', { name: '会话列表' }));
    expect(screen.getByText('甲')).toBeInTheDocument();
  });
});

describe('Sidebar 无限滚动', () => {
  it('超过 20 条时只渲染首批 20 行并保留 sentinel(含 project-header)', () => {
    const sessions = Array.from({ length: 25 }, (_, i) => session(`s${i}`, { title: `会话${i}` }));
    useAppStore.setState({ sessions });
    const { container } = render(<Sidebar />);
    // rows 首行是「其他」project-header,其后才是会话项
    expect(container.querySelectorAll('.session-item')).toHaveLength(19);
    expect(container.querySelectorAll('.session-project-header')).toHaveLength(1);
    expect(container.querySelector('.session-list-sentinel')).not.toBeNull();
  });
});
