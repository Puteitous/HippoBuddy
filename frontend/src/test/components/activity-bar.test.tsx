import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '@/components/ActivityBar';
import { useAppStore } from '@/stores/appStore';

const { previewStore, desktopBridge, toast } = vi.hoisted(() => ({
  previewStore: { openWeb: vi.fn() },
  desktopBridge: { getCurrentPath: vi.fn(() => '/ws') },
  toast: { showToast: vi.fn() },
}));

vi.mock('@/stores/previewStore', () => ({
  usePreviewStore: { getState: () => ({ openWeb: previewStore.openWeb }) },
}));
vi.mock('@/utils/desktop-bridge', () => ({ desktopBridge }));
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
  translate: (k: string) => k,
}));
vi.mock('@/components/chat-panel/TokenMonitor', () => ({ TokenMonitor: () => 'TOKEN_PANEL' }));
vi.mock('@/components/MetricsPanel', () => ({ MetricsPanel: () => 'METRICS_PANEL' }));

/** 按 data-attr 取按钮 */
function btn(attr: string, value: string): HTMLElement {
  const el = document.querySelector(`[data-${attr}="${value}"]`);
  if (!el) throw new Error(`button [data-${attr}="${value}"] not found`);
  return el as HTMLElement;
}

beforeEach(() => {
  useAppStore.setState({
    activityBarHidden: false,
    activityPanel: null,
    activityPanelPinned: false,
    skillMarketOpen: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ActivityBar', () => {
  it('渲染五个面板/动作按钮与底部隐藏按钮', () => {
    render(<ActivityBar />);
    expect(document.querySelector('[data-panel="token"]')).not.toBeNull();
    expect(document.querySelector('[data-panel="metrics"]')).not.toBeNull();
    expect(document.querySelector('[data-action="skillMarket"]')).not.toBeNull();
    expect(document.querySelector('[data-action="openBrowser"]')).not.toBeNull();
    expect(document.querySelector('[data-action="openTerminal"]')).not.toBeNull();
    expect(screen.getByTitle('activity.hide')).toBeInTheDocument();
  });

  it('hidden=true 时只显示展开按钮,点击后恢复活动栏', () => {
    useAppStore.setState({ activityBarHidden: true });
    render(<ActivityBar />);
    const showBtn = screen.getByTitle('activity.show');
    expect(document.querySelector('[data-panel="token"]')).toBeNull();
    fireEvent.click(showBtn);
    expect(useAppStore.getState().activityBarHidden).toBe(false);
  });

  it('点击 token 面板按钮:固定展开面板并渲染 TokenMonitor', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('panel', 'token'));
    expect(useAppStore.getState().activityPanel).toBe('token');
    expect(useAppStore.getState().activityPanelPinned).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('TOKEN_PANEL')).toBeInTheDocument();
  });

  it('点击 metrics 面板按钮:渲染 MetricsPanel 与面板标题', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('panel', 'metrics'));
    expect(useAppStore.getState().activityPanel).toBe('metrics');
    expect(screen.getByText('activity.monitor')).toBeInTheDocument();
    expect(screen.getByText('METRICS_PANEL')).toBeInTheDocument();
  });

  it('再次点击已固定的当前面板:取消固定并关闭', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('panel', 'token'));
    expect(useAppStore.getState().activityPanel).toBe('token');
    fireEvent.click(btn('panel', 'token'));
    expect(useAppStore.getState().activityPanel).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hover 面板按钮:非固定展开(不 pinned)', () => {
    render(<ActivityBar />);
    fireEvent.mouseEnter(btn('panel', 'metrics'));
    expect(useAppStore.getState().activityPanel).toBe('metrics');
    expect(useAppStore.getState().activityPanelPinned).toBe(false);
  });

  it('关闭按钮点击关闭面板', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('panel', 'token'));
    const close = screen.getByRole('button', { name: 'activity.panelClose' });
    fireEvent.click(close);
    expect(useAppStore.getState().activityPanel).toBeNull();
  });

  it('skillMarket 动作:打开技能市场', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('action', 'skillMarket'));
    expect(useAppStore.getState().skillMarketOpen).toBe(true);
  });

  it('openBrowser 动作:调用 previewStore.openWeb', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('action', 'openBrowser'));
    expect(previewStore.openWeb).toHaveBeenCalledWith('about:blank');
  });

  it('openTerminal 动作:无 Electron 环境时 toast 提示不支持', () => {
    render(<ActivityBar />);
    fireEvent.click(btn('action', 'openTerminal'));
    expect(toast.showToast).toHaveBeenCalledWith('topbar.terminalUnsupported', { type: 'warning' });
  });

  it('底部隐藏按钮:折叠活动栏', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByTitle('activity.hide'));
    expect(useAppStore.getState().activityBarHidden).toBe(true);
  });
});