import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TopBar } from '@/components/TopBar';
import { useAppStore } from '@/stores/appStore';

const RECENT_KEY = 'hippo-recent-folders';

const { desktopBridge, workspaceApi, toast, i18n, themeStore } = vi.hoisted(() => {
  const desktopBridge = {
    isDesktop: false,
    isMaximized: vi.fn().mockResolvedValue(false),
    onMaximizedChanged: vi.fn(() => () => {}),
    toggleMaximize: vi.fn(),
    minimizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    openDevTools: vi.fn(),
    openFileDialog: vi.fn().mockResolvedValue(''),
  };
  const workspaceApi = { setCurrent: vi.fn(), resetCurrent: vi.fn(), getCurrent: vi.fn() };
  return {
    desktopBridge,
    workspaceApi,
    toast: { showToast: vi.fn() },
    i18n: { t: (k: string) => k, translate: (k: string) => k },
    themeStore: { theme: 'light' as string, toggleTheme: vi.fn() },
  };
});

vi.mock('@/utils/desktop-bridge', () => ({ desktopBridge }));
vi.mock('@/api/client', () => ({ workspaceApi }));
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: i18n.t }),
  translate: (k: string) => i18n.translate(k),
}));
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (sel: (s: unknown) => unknown) => sel(themeStore),
}));

beforeEach(() => {
  localStorage.clear();
  desktopBridge.isDesktop = false;
  themeStore.theme = 'light';
  workspaceApi.setCurrent.mockResolvedValue({ path: '/ws' });
  workspaceApi.resetCurrent.mockResolvedValue({ success: true });
  workspaceApi.getCurrent.mockResolvedValue({ path: '/default' });
  useAppStore.setState({ view: 'chat', sidebarCollapsed: false, workspacePath: '' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TopBar (浏览模式,isDesktop=false)', () => {
  it('渲染品牌名与设置/主题按钮', () => {
    render(<TopBar />);
    expect(screen.getByText('HippoBuddy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'html.header.settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'html.header.themeToggle' })).toBeInTheDocument();
  });

  it('不渲染桌面端专属控件(工作区/文件夹/DevTools/刷新/窗口控制)', () => {
    useAppStore.setState({ workspacePath: '/ws' });
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: 'html.header.openFolder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'html.header.devtools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'html.header.refresh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'html.header.minimize' })).not.toBeInTheDocument();
    expect(screen.queryByText('/ws')).not.toBeInTheDocument();
  });

  it('点击设置按钮切换到 Settings 视图', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.settings' }));
    expect(useAppStore.getState().view).toBe('settings');
  });

  it('点击主题切换按钮调用 toggleTheme', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.themeToggle' }));
    expect(themeStore.toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('侧栏折叠时显示展开按钮,点击取消折叠', () => {
    useAppStore.setState({ sidebarCollapsed: true });
    render(<TopBar />);
    const expand = screen.getByRole('button', { name: 'topbar.expandSessionPanel' });
    fireEvent.click(expand);
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('侧栏未折叠时不显示展开按钮', () => {
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: 'topbar.expandSessionPanel' })).not.toBeInTheDocument();
  });
});

describe('TopBar (桌面模式,isDesktop=true)', () => {
  it('有工作区路径时显示工作区指示器', () => {
    desktopBridge.isDesktop = true;
    useAppStore.setState({ workspacePath: '/ws/proj' });
    render(<TopBar />);
    expect(screen.getByText('/ws/proj')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'html.header.resetWorkspace' })).toBeInTheDocument();
  });

  it('无工作区路径时不显示指示器', () => {
    desktopBridge.isDesktop = true;
    render(<TopBar />);
    expect(screen.queryByText('/ws/proj')).not.toBeInTheDocument();
  });

  it('打开文件夹:选择路径后 setCurrent 并写入最近记录与 toast', async () => {
    desktopBridge.isDesktop = true;
    desktopBridge.openFileDialog.mockResolvedValue('/picked');
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.openFolder' }));
    await waitFor(() => expect(workspaceApi.setCurrent).toHaveBeenCalledWith('/picked'));
    expect(useAppStore.getState().workspacePath).toBe('/ws');
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')).toEqual(['/ws']);
  });

  it('打开文件夹但对话框取消:不调用 setCurrent', async () => {
    desktopBridge.isDesktop = true;
    desktopBridge.openFileDialog.mockResolvedValue('');
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.openFolder' }));
    expect(workspaceApi.setCurrent).not.toHaveBeenCalled();
  });

  it('重置工作区:resetCurrent + 重新拉取并回填', async () => {
    desktopBridge.isDesktop = true;
    useAppStore.setState({ workspacePath: '/ws' });
    workspaceApi.setCurrent.mockReset();
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.resetWorkspace' }));
    await waitFor(() => expect(workspaceApi.resetCurrent).toHaveBeenCalled());
    expect(workspaceApi.getCurrent).toHaveBeenCalled();
    expect(useAppStore.getState().workspacePath).toBe('/default');
    expect(toast.showToast).toHaveBeenCalled();
  });

  it('hover 打开文件夹按钮展开最近下拉(空态)', async () => {
    desktopBridge.isDesktop = true;
    const { container } = render(<TopBar />);
    fireEvent.mouseEnter(container.querySelector('.header-folder-group')!);
    expect(screen.getByText('topbar.noRecentFolders')).toBeInTheDocument();
    await act(async () => {}); // flush 桌面端 isMaximized 异步 setMaximized
  });

  it('有最近文件夹时下拉显示各项,点击项设为工作区', async () => {
    desktopBridge.isDesktop = true;
    localStorage.setItem(RECENT_KEY, JSON.stringify(['/a', '/b']));
    const { container } = render(<TopBar />);
    fireEvent.mouseEnter(container.querySelector('.header-folder-group')!);
    expect(screen.getByText('/a')).toBeInTheDocument();
    expect(screen.getByText('/b')).toBeInTheDocument();

    fireEvent.click(screen.getByText('/a'));
    await waitFor(() => expect(workspaceApi.setCurrent).toHaveBeenCalledWith('/a'));
    expect(useAppStore.getState().workspacePath).toBe('/ws');
  });

  it('从最近下拉移除某文件夹,不再显示', async () => {
    desktopBridge.isDesktop = true;
    localStorage.setItem(RECENT_KEY, JSON.stringify(['/a', '/b']));
    const { container } = render(<TopBar />);
    fireEvent.mouseEnter(container.querySelector('.header-folder-group')!);
    const removeBtn = container.querySelectorAll('.folder-item-remove')[0] as HTMLElement;
    fireEvent.click(removeBtn);
    expect(screen.queryByText('/a')).not.toBeInTheDocument();
    expect(screen.getByText('/b')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')).toEqual(['/b']);
    await act(async () => {}); // flush 桌面端 isMaximized 异步 setMaximized
  });

  it('窗口控制:最小化/最大化/关闭 调用 desktopBridge', async () => {
    desktopBridge.isDesktop = true;
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.minimize' }));
    expect(desktopBridge.minimizeWindow).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'html.header.maximize' }));
    expect(desktopBridge.toggleMaximize).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'html.header.close' }));
    expect(desktopBridge.closeWindow).toHaveBeenCalled();
    await act(async () => {}); // flush 桌面端 isMaximized 异步 setMaximized
  });

  it('DevTools 按钮打开开发者工具', () => {
    desktopBridge.isDesktop = true;
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'html.header.devtools' }));
    expect(desktopBridge.openDevTools).toHaveBeenCalled();
  });
});