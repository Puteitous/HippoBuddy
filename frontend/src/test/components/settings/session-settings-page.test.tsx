import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SessionSettingsPage } from '@/components/settings/SessionSettingsPage';

const { configApi, toast } = vi.hoisted(() => ({
  configApi: { getFull: vi.fn(), updateFull: vi.fn() },
  toast: { showToast: vi.fn() },
}));

vi.mock('@/api/client', () => ({ configApi }));
// settings/toastStore re-export 自 utils/toastStore,mock 后两者同源
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));

/** 最近一次 updateFull 的 session 节 */
function lastSession() {
  const calls = configApi.updateFull.mock.calls;
  const call = calls[calls.length - 1] as [{ session: Record<string, unknown> }];
  return call[0].session;
}

function sessionSelect(container: HTMLElement): HTMLSelectElement {
  return container.querySelector('select') as HTMLSelectElement;
}

function cleanupSwitch(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

beforeEach(() => {
  configApi.getFull.mockResolvedValue({});
  configApi.updateFull.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SessionSettingsPage 加载', () => {
  it('加载中显示「加载中...」', async () => {
    render(<SessionSettingsPage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    await act(async () => {});
  });

  it('加载成功渲染会话管理标题与默认配置', async () => {
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    expect(screen.getByText('会话管理')).toBeInTheDocument();
    expect(screen.getByText('最大保存会话数')).toBeInTheDocument();
    // 默认:清理打开 + 最大保存会话数 1000(默认)
    expect(cleanupSwitch(container).checked).toBe(true);
    expect(sessionSelect(container).value).toBe('1000');
  });

  it('后端配置存在时覆盖默认值', async () => {
    configApi.getFull.mockResolvedValue({
      session: { max_saved_sessions: 200, enable_max_saved_cleanup: false },
    });
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    expect(cleanupSwitch(container).checked).toBe(false);
    expect(sessionSelect(container).value).toBe('200');
  });

  it('加载失败显示「配置不可用」并 toast 错误', async () => {
    configApi.getFull.mockRejectedValue(new Error('boom'));
    render(<SessionSettingsPage />);
    expect(await screen.findByText(/配置不可用:Error: boom/)).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledWith('加载会话配置失败:Error: boom', {
      type: 'error',
      duration: 3000,
    });
  });
});

describe('SessionSettingsPage 保存', () => {
  it('切换「清理历史会话」开关 → updateFull 携带 enable_max_saved_cleanup=false', async () => {
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    fireEvent.click(cleanupSwitch(container));
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastSession()).toMatchObject({ enable_max_saved_cleanup: false });
  });

  it('切换最大保存会话数下拉 → updateFull 携带 max_saved_sessions=100', async () => {
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    fireEvent.change(sessionSelect(container), { target: { value: '100' } });
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastSession()).toMatchObject({ max_saved_sessions: 100 });
  });

  it('保存时携带完整 session 节(保留其它字段默认值)', async () => {
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    fireEvent.change(sessionSelect(container), { target: { value: '500' } });
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalledTimes(1));
    const s = lastSession() as Record<string, unknown>;
    expect(s.max_saved_sessions).toBe(500);
    expect(s.enable_max_saved_cleanup).toBe(true);
    expect(s.cleanup_period_days).toBe(90);
    expect(s.enable_background_cleanup).toBe(true);
    expect(s.tombstone_threshold_mb).toBe(50);
  });

  it('保存失败 → toast 错误且本地开关保持切换后状态', async () => {
    configApi.updateFull.mockRejectedValue(new Error('boom'));
    const { container } = render(<SessionSettingsPage />);
    await screen.findByText('清理历史会话');
    fireEvent.click(cleanupSwitch(container));
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^保存会话配置失败:Error: boom/);
    expect(cleanupSwitch(container).checked).toBe(false);
  });
});