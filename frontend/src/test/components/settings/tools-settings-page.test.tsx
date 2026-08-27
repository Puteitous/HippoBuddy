import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToolsSettingsPage } from '@/components/settings/ToolsSettingsPage';

const { configApi, toast } = vi.hoisted(() => ({
  configApi: { getFull: vi.fn(), updateFull: vi.fn() },
  toast: { showToast: vi.fn() },
}));

vi.mock('@/api/client', () => ({ configApi }));
// settings/toastStore re-export 自 utils/toastStore,mock 后两者同源
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));

/** 按渲染顺序取 4 个开关:bash / web_search.enabled / subagent / delete_file */
function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

/** 断言最近一次 updateFull 的 tools 节 */
function lastTools() {
  const calls = configApi.updateFull.mock.calls;
  const call = calls[calls.length - 1] as [{ tools: Record<string, unknown> }];
  return call[0].tools;
}

beforeEach(() => {
  configApi.getFull.mockResolvedValue({});
  configApi.updateFull.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ToolsSettingsPage 加载', () => {
  it('加载中显示「加载中...」', async () => {
    render(<ToolsSettingsPage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    // flush 掉挂载 effect 的异步 setLoading,避免测试结束时未包裹 act 的更新
    await act(async () => {});
  });

  it('加载成功渲染 4 个工具组标题与默认开关状态', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    expect(screen.getByText('联网搜索')).toBeInTheDocument();
    expect(screen.getByText('子 Agent')).toBeInTheDocument();
    expect(screen.getByText('文件删除')).toBeInTheDocument();

    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(4);
    // 默认:bash/delete_file 需要确认勾选,web_search/subagent 未启用
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(boxes[2].checked).toBe(false);
    expect(boxes[3].checked).toBe(true);
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('brave');
  });

  it('后端配置存在时覆盖默认值', async () => {
    configApi.getFull.mockResolvedValue({
      tools: {
        mode: 'relaxed',
        bash: { require_confirmation: false },
        web_search: { enabled: true, provider: 'tavily', api_key: 'sk-123' },
        subagent: { enabled: true },
        delete_file: { require_confirmation: false },
      },
    });
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    const boxes = checkboxes(container);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].checked).toBe(true);
    expect(boxes[3].checked).toBe(false);
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('tavily');
    expect((container.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('sk-123');
  });

  it('加载失败显示「配置不可用」并 toast 错误', async () => {
    configApi.getFull.mockRejectedValue(new Error('boom'));
    render(<ToolsSettingsPage />);
    expect(await screen.findByText(/配置不可用:Error: boom/)).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledWith('加载工具配置失败:Error: boom', {
      type: 'error',
      duration: 3000,
    });
  });
});

describe('ToolsSettingsPage 保存', () => {
  it('切换 bash「需要确认」开关 → updateFull 携带 require_confirmation=false', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[0]);
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().bash).toMatchObject({ require_confirmation: false });
  });

  it('切换 web_search「启用」开关 → updateFull 携带 enabled=true', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[1]);
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().web_search).toMatchObject({ enabled: true });
  });

  it('切换搜索服务商 → updateFull 携带 provider', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.change(container.querySelector('select') as HTMLSelectElement, {
      target: { value: 'google' },
    });
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().web_search).toMatchObject({ provider: 'google' });
  });

  it('输入 API Key → updateFull 携带 api_key', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-new' } });
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().web_search).toMatchObject({ api_key: 'sk-new' });
  });

  it('显示/隐藏按钮切换 API Key 输入框 type', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.click(screen.getByTitle('显示'));
    const textInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(textInput).not.toBeNull();
    fireEvent.click(screen.getByTitle('隐藏'));
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('切换 subagent「启用」开关 → updateFull 携带 enabled=true', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[2]);
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().subagent).toMatchObject({ enabled: true });
  });

  it('切换 delete_file「需要确认」开关 → updateFull 携带 require_confirmation=false', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[3]);
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastTools().delete_file).toMatchObject({ require_confirmation: false });
  });

  it('连续保存保留其它工具组的既有值(完整 tools 节)', async () => {
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[0]); // bash 关闭确认
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalledTimes(1));
    const first = lastTools() as {
      bash: Record<string, unknown>;
      web_search: Record<string, unknown>;
      subagent: Record<string, unknown>;
      delete_file: Record<string, unknown>;
    };
    // 首次保存已含全部工具组的默认值,而非仅 bash
    expect(first.bash.require_confirmation).toBe(false);
    expect(first.web_search.enabled).toBe(false);
    expect(first.subagent.enabled).toBe(false);
    expect(first.delete_file.require_confirmation).toBe(true);
  });

  it('保存失败 → toast 错误且本地开关保持切换后状态', async () => {
    configApi.updateFull.mockRejectedValue(new Error('boom'));
    const { container } = render(<ToolsSettingsPage />);
    await screen.findByText('Bash 命令');
    fireEvent.click(checkboxes(container)[0]);
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^保存工具配置失败:Error: boom/);
    expect(checkboxes(container)[0].checked).toBe(false);
  });
});
