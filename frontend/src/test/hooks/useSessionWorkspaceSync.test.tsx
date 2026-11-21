import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useSessionWorkspaceSync } from '@/hooks/useSessionWorkspaceSync';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import type { Session } from '@/types';

const { setCurrent, showToast } = vi.hoisted(() => ({
  setCurrent: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  workspaceApi: { setCurrent },
}));

vi.mock('@/utils/toastStore', () => ({ showToast }));

function Probe() {
  useSessionWorkspaceSync();
  return null;
}

function session(id: string, projectPath?: string, running = false): Session {
  return {
    id,
    title: '',
    messageCount: 0,
    active: false,
    running,
    createdAt: '',
    projectPath,
  };
}

beforeEach(() => {
  localStorage.clear();
  setCurrent.mockReset();
  showToast.mockReset();
  setCurrent.mockResolvedValue({ path: 'E:/proj/B', isDefault: false });
  useAppStore.setState({ sessions: [], currentSessionId: null, workspacePath: '' });
  useChatStore.setState({ sessionStreams: {} });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSessionWorkspaceSync', () => {
  it('归属工作区与当前不同时自动切换', async () => {
    useAppStore.setState({
      sessions: [session('s1', 'E:/proj/B')],
      currentSessionId: 's1',
      workspacePath: 'E:/proj/A',
    });
    render(<Probe />);

    await waitFor(() => expect(setCurrent).toHaveBeenCalledWith('E:/proj/B'));
    await waitFor(() => expect(useAppStore.getState().workspacePath).toBe('E:/proj/B'));
  });

  it('路径相同时不发起切换', async () => {
    useAppStore.setState({
      sessions: [session('s1', 'E:\\proj\\B')],
      currentSessionId: 's1',
      workspacePath: 'e:/proj/b/',
    });
    render(<Probe />);

    await Promise.resolve();
    expect(setCurrent).not.toHaveBeenCalled();
  });

  it('有会话正在运行时保持当前工作区并提示', async () => {
    useAppStore.setState({
      sessions: [session('s1', 'E:/proj/B'), session('s2', 'E:/proj/C', true)],
      currentSessionId: 's1',
      workspacePath: 'E:/proj/A',
    });
    render(<Probe />);

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(setCurrent).not.toHaveBeenCalled();
  });

  it('会话无归属路径时不动作', async () => {
    useAppStore.setState({
      sessions: [session('s1')],
      currentSessionId: 's1',
      workspacePath: 'E:/proj/A',
    });
    render(<Probe />);

    await Promise.resolve();
    expect(setCurrent).not.toHaveBeenCalled();
  });
});
