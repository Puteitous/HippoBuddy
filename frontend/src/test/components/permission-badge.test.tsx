import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionBadge } from '@/components/chat-panel/PermissionBadge';

const { configApiProps, toast, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    configApiProps: { getFull: vi.fn(), updateFull: vi.fn() },
    toast: { showToast: vi.fn() },
    ApiError,
  };
});

vi.mock('@/api/client', () => ({
  configApi: configApiProps,
}));
vi.mock('@/api/error', () => ({ ApiError }));
vi.mock('@/components/settings/toastStore', () => ({
  showToast: toast.showToast,
}));

beforeEach(() => {
  vi.clearAllMocks();
  configApiProps.getFull.mockResolvedValue({ tools: { mode: 'strict' } });
  configApiProps.updateFull.mockResolvedValue({ success: true });
});

describe('PermissionBadge', () => {
  it('默认显示 仅工作区(strict)', async () => {
    render(<PermissionBadge />);
    expect(await screen.findByRole('button', { name: /切换权限模式/ })).toBeInTheDocument();
    expect(screen.getByText('仅工作区')).toBeInTheDocument();
  });

  it('拉取到 relaxed 配置时显示 全目录', async () => {
    configApiProps.getFull.mockResolvedValue({ tools: { mode: 'relaxed' } });
    render(<PermissionBadge />);
    expect(await screen.findByText('全目录')).toBeInTheDocument();
  });

  it('拉取失败或 mode 非法时保持 strict', async () => {
    configApiProps.getFull.mockRejectedValue(new Error('net'));
    const { rerender } = render(<PermissionBadge />);
    expect(await screen.findByText('仅工作区')).toBeInTheDocument();

    configApiProps.getFull.mockResolvedValue({ tools: { mode: 'weird' } });
    rerender(<PermissionBadge />);
    expect(await screen.findByText('仅工作区')).toBeInTheDocument();
  });

  it('点击展开下拉,显示两个选项', async () => {
    render(<PermissionBadge />);
    await screen.findByText('仅工作区');
    fireEvent.click(screen.getByRole('button', { name: /切换权限模式/ }));
    expect(screen.getByText('可操作整台电脑的文件')).toBeInTheDocument();
    expect(screen.getByText('只能操作当前项目目录')).toBeInTheDocument();
  });

  it('切换为 全目录 → 合并 tools 保留其它配置并 updateFull', async () => {
    configApiProps.getFull.mockResolvedValue({
      tools: { mode: 'strict', bash: { enabled: false, require_confirmation: true } },
    });
    render(<PermissionBadge />);
    await screen.findByText('仅工作区');
    fireEvent.click(screen.getByRole('button', { name: /切换权限模式/ }));
    fireEvent.click(screen.getByText('可操作整台电脑的文件'));

    await waitFor(() => expect(configApiProps.updateFull).toHaveBeenCalled());
    const [arg] = configApiProps.updateFull.mock.calls[0];
    expect(arg.tools.mode).toBe('relaxed');
    // 合并保留既有 bash 配置(未被 defaultTools 覆盖)
    expect(arg.tools.bash).toEqual({ enabled: false, require_confirmation: true });
    // 下拉关闭
    expect(screen.queryByText('可操作整台电脑的文件')).not.toBeInTheDocument();
  });

  it('切换失败时弹错误 toast,并回滚模式状态', async () => {
    configApiProps.getFull.mockResolvedValue({ tools: { mode: 'strict' } });
    configApiProps.updateFull.mockRejectedValue(new ApiError(500, 'save fail'));
    render(<PermissionBadge />);
    await screen.findByText('仅工作区');
    fireEvent.click(screen.getByRole('button', { name: /切换权限模式/ }));
    fireEvent.click(screen.getByText('可操作整台电脑的文件'));

    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(toast.showToast).toHaveBeenCalledWith('保存权限模式失败:save fail', {
      type: 'error',
      duration: 3000,
    });
  });

  it('点击外部区域关闭下拉', async () => {
    render(<PermissionBadge />);
    await screen.findByText('仅工作区');
    fireEvent.click(screen.getByRole('button', { name: /切换权限模式/ }));
    expect(screen.getByText('可操作整台电脑的文件')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('可操作整台电脑的文件')).not.toBeInTheDocument();
  });
});