import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVisionSupport } from '@/hooks/useVisionSupport';
import { emit, clear } from '@/utils/eventBus';

const { configApi, visionCheck } = vi.hoisted(() => ({
  configApi: { getLlm: vi.fn() },
  visionCheck: vi.fn(),
}));

vi.mock('@/api/client', () => ({ configApi }));
vi.mock('@/utils/image-vision', () => ({ isVisionProviderModel: visionCheck }));

beforeEach(() => {
  clear();
  vi.clearAllMocks();
  // 默认让 getLlm 有返回,避免 effect 内 .then 崩溃;各用例可按需覆盖
  configApi.getLlm.mockResolvedValue({ provider: 'x', model: 'y' });
  visionCheck.mockReturnValue(false);
});

describe('useVisionSupport', () => {
  it('初始返回 false', () => {
    const { result } = renderHook(() => useVisionSupport());
    expect(result.current).toBe(false);
  });

  it('拉取到当前模型后按是否支持视觉更新,并传入真实 provider/model', async () => {
    configApi.getLlm.mockResolvedValue({ provider: 'openai', model: 'gpt-4o' });
    visionCheck.mockReturnValue(true);
    const { result } = renderHook(() => useVisionSupport());
    await waitFor(() => expect(result.current).toBe(true));
    expect(visionCheck).toHaveBeenCalledWith('openai', 'gpt-4o');
  });

  it('拉取失败(如未配置)时保持 false', async () => {
    configApi.getLlm.mockRejectedValue(new Error('no llm'));
    const { result } = renderHook(() => useVisionSupport());
    await waitFor(() => expect(configApi.getLlm).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('llm:changed 事件即时切换视觉支持状态', async () => {
    configApi.getLlm.mockResolvedValue({ provider: 'a', model: 'no-vision' });
    visionCheck.mockReturnValue(false);
    const { result } = renderHook(() => useVisionSupport());
    await waitFor(() => expect(result.current).toBe(false));

    visionCheck.mockReturnValue(true);
    act(() => {
      emit('llm:changed', { provider: 'q', model: 'vision' });
    });
    expect(result.current).toBe(true);
    expect(visionCheck).toHaveBeenCalledWith('q', 'vision');
  });

  it('卸载后迟到的拉取结果不再更新状态(disposed 保护)', async () => {
    let resolveLlm!: (v: { provider: string; model: string }) => void;
    configApi.getLlm.mockReturnValue(new Promise((res) => (resolveLlm = res)));
    const { result, unmount } = renderHook(() => useVisionSupport());
    unmount();
    await act(async () => {
      resolveLlm({ provider: 'openai', model: 'gpt-4o' });
      await Promise.resolve();
    });
    // 状态保持初始 false,不因迟到 resolve 改变
    expect(result.current).toBe(false);
  });
});