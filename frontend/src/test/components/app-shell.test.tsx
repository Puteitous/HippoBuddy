import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';
import { useAppStore } from '@/stores/appStore';
import type { Session } from '@/types';

// AppShell 自身核心逻辑是「整机装配 + 视图切换 + 启动会话加载」；
// 子组件(TopBar/ActivityBar/Sidebar 等)均有独立测试,这里统一 stub 隔离,
// 只聚焦 AppShell 的装配与条件渲染。
const { getSessions } = vi.hoisted(() => ({ getSessions: vi.fn() }));

vi.mock('@/api/client', () => ({
  api: { getSessions },
  sessionApi: {},
  chatApi: {},
  configApi: {},
  workspaceApi: {},
  fileApi: {},
  skillsApi: {},
  rulesApi: {},
  dataDirApi: {},
  metricsApi: {},
}));

vi.mock('@/hooks/useSessionMessages', () => ({ useSessionMessages: () => {} }));
vi.mock('@/hooks/useCompletedTaskNotification', () => ({ useCompletedTaskNotification: () => {} }));
vi.mock('@/components/TopBar', () => ({ TopBar: () => <div data-testid="top-bar" /> }));
vi.mock('@/components/ActivityBar', () => ({ ActivityBar: () => <div data-testid="activity-bar" /> }));
vi.mock('@/components/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('@/components/SidebarResizer', () => ({ SidebarResizer: () => <div data-testid="sidebar-resizer" /> }));
vi.mock('@/components/chat-panel/ChatPanel', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock('@/components/settings/SettingsPanel', () => ({ SettingsPanel: () => <div data-testid="settings-panel" /> }));
vi.mock('@/components/workspace/PreviewPanel', () => ({ PreviewPanel: () => <div data-testid="preview-panel" /> }));
vi.mock('@/components/workspace/PreviewResizer', () => ({ PreviewResizer: () => <div data-testid="preview-resizer" /> }));
vi.mock('@/components/SkillMarket', () => ({
  SkillMarket: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="skill-market">
      <button onClick={onClose}>close-skill-market</button>
    </div>
  ),
}));
vi.mock('@/components/SelectionActions', () => ({ SelectionActions: () => <div data-testid="selection-actions" /> }));
vi.mock('@/components/OnboardingTour', () => ({ OnboardingTour: () => <div data-testid="onboarding-tour" /> }));
vi.mock('@/utils/toast', () => ({ ToastViewport: () => <div data-testid="toast-viewport" /> }));

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

const SESSIONS_CACHE_KEY = 'hippo-session-list-cache';

beforeEach(() => {
  localStorage.clear();
  getSessions.mockReset();
  useAppStore.setState({
    sessions: [],
    currentSessionId: null,
    mode: 'coding',
    view: 'chat',
    isLoadingSessions: false,
    sessionsError: null,
    skillMarketOpen: false,
    panelLayout: 'preview-left',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppShell 布局装配', () => {
  it('渲染四栏骨架 + 全局浮层', () => {
    render(<AppShell />);
    expect(screen.getByTestId('top-bar')).toBeInTheDocument();
    expect(screen.getByTestId('activity-bar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-resizer')).toBeInTheDocument();
    expect(screen.getByTestId('selection-actions')).toBeInTheDocument();
    expect(screen.getByTestId('toast-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-tour')).toBeInTheDocument();
  });

  it('view=chat 时主区渲染聊天面板 + 预览面板(并排)', () => {
    render(<AppShell />);
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
    expect(screen.getByTestId('preview-resizer')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skill-market')).not.toBeInTheDocument();
  });

  it('view=settings 时主区渲染设置面板,不渲染聊天', () => {
    useAppStore.setState({ view: 'settings' });
    render(<AppShell />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-layout')).not.toBeInTheDocument();
  });

  it('panelLayout=chat-left 时 chat-layout 追加 layout-chat-first 类', () => {
    useAppStore.setState({ panelLayout: 'chat-left' });
    const { container } = render(<AppShell />);
    expect(container.querySelector('.chat-layout.layout-chat-first')).not.toBeNull();
  });

  it('skillMarketOpen 时主区替换为技能市场,onClose 可关闭', () => {
    useAppStore.setState({ skillMarketOpen: true, view: 'chat' });
    render(<AppShell />);
    expect(screen.getByTestId('skill-market')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close-skill-market' }));
    expect(useAppStore.getState().skillMarketOpen).toBe(false);
    expect(screen.queryByTestId('skill-market')).not.toBeInTheDocument();
  });
});

describe('AppShell 启动会话加载', () => {
  it('无缓存时进入加载态,请求成功后填入会话并校正当前会话', async () => {
    getSessions.mockResolvedValue([session('s1', { mode: 'coding' })]);
    const { unmount } = render(<AppShell />);
    // 无缓存:命中 else 分支进入加载态(同步发生于 effect 内)
    expect(useAppStore.getState().isLoadingSessions).toBe(true);
    await waitFor(() => {
      expect(useAppStore.getState().isLoadingSessions).toBe(false);
    });
    expect(useAppStore.getState().sessions).toHaveLength(1);
    expect(useAppStore.getState().currentSessionId).toBe('s1');
    expect(getSessions).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('命中缓存时立即渲染列表,不进入加载态,再经后台请求刷新', async () => {
    localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify([session('c1')]));
    getSessions.mockResolvedValue([session('c1'), session('c2')]);
    const { unmount } = render(<AppShell />);
    // 缓存命中:立即填充会话,不置加载态
    expect(useAppStore.getState().isLoadingSessions).toBe(false);
    expect(useAppStore.getState().sessions.map((s) => s.id)).toEqual(['c1']);
    await waitFor(() => {
      expect(useAppStore.getState().sessions.map((s) => s.id)).toEqual(['c1', 'c2']);
    });
    expect(getSessions).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('持久化的当前会话已失效时,回退到缓存第一个会话', async () => {
    localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify([session('c1')]));
    getSessions.mockResolvedValue([session('c1')]);
    useAppStore.setState({ currentSessionId: 'stale' });
    const { unmount } = render(<AppShell />);
    await waitFor(() => {
      expect(useAppStore.getState().currentSessionId).toBe('c1');
    });
    unmount();
  });

  it('用户正在新建的 web-* 虚拟会话不被后台返回列表覆盖', async () => {
    getSessions.mockResolvedValue([session('s1')]);
    useAppStore.setState({ currentSessionId: 'web-123' });
    const { unmount } = render(<AppShell />);
    await waitFor(() => {
      expect(useAppStore.getState().isLoadingSessions).toBe(false);
    });
    // 虚拟会话保持原状,不跳回 data[0]
    expect(useAppStore.getState().currentSessionId).toBe('web-123');
    expect(useAppStore.getState().sessions.map((s) => s.id)).toEqual(['s1']);
    unmount();
  });

  it('请求失败时记录错误并结束加载态', async () => {
    getSessions.mockRejectedValue(new Error('boom'));
    const { unmount } = render(<AppShell />);
    await waitFor(() => {
      expect(useAppStore.getState().isLoadingSessions).toBe(false);
    });
    expect(useAppStore.getState().sessionsError).toContain('boom');
    unmount();
  });
});