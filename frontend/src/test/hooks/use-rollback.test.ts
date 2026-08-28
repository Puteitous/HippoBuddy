import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRollback } from '@/components/rollback/useRollback';

vi.mock('@/i18n', () => ({
  translate: (s: string) => s,
}));

const { appState, chatFns, apiMock, emitMock, toastMock } = vi.hoisted(() => ({
  appState: {
    currentSessionId: 's1' as string | null,
    removeSession: vi.fn<(id: string) => void>(),
  },
  chatFns: { setMessages: vi.fn<(m: unknown[]) => void>(), setSessionMessages: vi.fn<(id: string, m: unknown[]) => void>() },
  apiMock: {
    sessions: {
      rewindCheck: vi.fn<(sid: string, body: unknown) => Promise<{ files: unknown[] }>>(),
      rewind: vi.fn<(sid: string, body: unknown) => Promise<Record<string, unknown>>>(
        () => Promise.resolve({ success: true }),
      ),
      getMessages: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
      delete: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
    },
  },
  emitMock: vi.fn<(event: string, payload?: unknown) => void>(),
  toastMock: { showToast: vi.fn<(msg: string, opts?: unknown) => void>() },
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: typeof appState) => unknown) => sel(appState),
    { getState: () => appState },
  ),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (sel: (s: typeof chatFns) => unknown) => sel(chatFns),
}));
vi.mock('@/api/client', () => ({ api: apiMock }));
vi.mock('@/utils/eventBus', () => ({ emit: emitMock }));
vi.mock('@/utils/toastStore', () => ({ showToast: toastMock.showToast }));

const files = [{ filePath: '/a.ts' }, { filePath: '/b.go' }];

beforeEach(() => {
  vi.clearAllMocks();
  appState.currentSessionId = 's1';
  apiMock.sessions.rewindCheck.mockResolvedValue({ files });
  apiMock.sessions.rewind.mockResolvedValue({ success: true });
  apiMock.sessions.getMessages.mockResolvedValue([{ id: 'm1' }]);
});

describe('useRollback', () => {
  it('初始 status 为 idle', () => {
    const { result } = renderHook(() => useRollback('t1'));
    expect(result.current.status).toBe('idle');
    expect(result.current.currentSessionId).toBe('s1');
  });

  it('handleOpen 成功:emit prepare + 进入 preview 并带上文件', async () => {
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(emitMock).toHaveBeenCalledWith('rollback:prepare', 't1');
    expect(apiMock.sessions.rewindCheck).toHaveBeenCalledWith('s1', { messageId: 't1' });
    expect(result.current.status).toBe('preview');
    expect(result.current.previewFiles).toEqual(files);
  });

  it('handleOpen 失败:回到 idle 并弹错误 toast', async () => {
    apiMock.sessions.rewindCheck.mockRejectedValue(new Error('check fail'));
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(result.current.status).toBe('idle');
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.failedcheck fail', {
      type: 'error',
      duration: 3000,
    });
  });

  it('currentSessionId 为 null 时 handleOpen 不动作', async () => {
    appState.currentSessionId = null;
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(apiMock.sessions.rewindCheck).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('handleCancel:回到 idle 并清空文件', async () => {
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
      await result.current.handleCancel();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.previewFiles).toEqual([]);
  });

  it('handleConfirm mode=files:emit completed + toast 文件已回滚 + 复位', async () => {
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    await act(async () => {
      await result.current.handleConfirm('files');
    });
    expect(apiMock.sessions.rewind).toHaveBeenCalledWith('s1', { messageId: 't1', mode: 'files' });
    expect(emitMock).toHaveBeenCalledWith('rollback:completed', { paths: ['/a.ts', '/b.go'], mode: 'files' });
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.fileRolledBack', { type: 'success', duration: 4000 });
    expect(result.current.status).toBe('idle');
  });

  it('handleConfirm mode=all 且非空:setMessages + restoreInput + 成功 toast', async () => {
    const messages = [{ id: 'm1' }];
    apiMock.sessions.getMessages.mockResolvedValue(messages);
    apiMock.sessions.rewind.mockResolvedValue({ success: true, lastUserMessage: '原问题' });
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    await act(async () => {
      await result.current.handleConfirm('all');
    });
    expect(chatFns.setSessionMessages).toHaveBeenCalledWith('s1', messages);
    expect(chatFns.setMessages).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith('rollback:restoreInput', '原问题');
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.rolledBack', { type: 'success', duration: 4000 });
    expect(result.current.status).toBe('idle');
  });

  it('handleConfirm mode=all 但会话被清空:删除会话并提示', async () => {
    apiMock.sessions.getMessages.mockResolvedValue([]);
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    await act(async () => {
      await result.current.handleConfirm('all');
    });
    expect(apiMock.sessions.delete).toHaveBeenCalledWith('s1');
    expect(appState.removeSession).toHaveBeenCalledWith('s1');
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.sessionCleared', { type: 'info', duration: 4000 });
  });

  it('回滚期间切会话:消息写回发起会话，restoreInput 不串入新会话', async () => {
    const messages = [{ id: 'm1' }];
    apiMock.sessions.getMessages.mockResolvedValue(messages);
    apiMock.sessions.rewind.mockResolvedValue({ success: true, lastUserMessage: '原问题' });
    // 让 rewind 挂起，模拟回滚进行中
    let releaseRewind: (() => void) | undefined;
    apiMock.sessions.rewind.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRewind = () => resolve({ success: true, lastUserMessage: '原问题' });
        }),
    );
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    let confirmPromise: Promise<void> | undefined;
    act(() => {
      confirmPromise = result.current.handleConfirm('all');
    });
    // 回滚进行中，用户切换到新会话 s2
    appState.currentSessionId = 's2';
    releaseRewind!();
    await act(async () => confirmPromise);
    // 消息写回发起会话 s1，而非当前 s2
    expect(chatFns.setSessionMessages).toHaveBeenCalledWith('s1', messages);
    // 输入框回填仅作用于当前视图：此时在 s2，不应 emit restoreInput
    expect(emitMock).not.toHaveBeenCalledWith('rollback:restoreInput', '原问题');
    // toast 仍正常提示成功
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.rolledBack', {
      type: 'success',
      duration: 4000,
    });
  });

  it('rewind 返回 success=false:回到 idle 并提示失败信息', async () => {
    apiMock.sessions.rewind.mockResolvedValue({ success: false, message: '没有可回滚内容' });
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    await act(async () => {
      await result.current.handleConfirm('files');
    });
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.failed没有可回滚内容', {
      type: 'error',
      duration: 3000,
    });
    expect(result.current.status).toBe('idle');
  });

  it('rewind 抛错:保留面板(preview)以便重试', async () => {
    apiMock.sessions.rewind.mockRejectedValue(new Error('rewind boom'));
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleOpen();
    });
    await act(async () => {
      await result.current.handleConfirm('files');
    });
    expect(result.current.status).toBe('preview');
    expect(toastMock.showToast).toHaveBeenCalledWith('rollback.failedrewind boom', { type: 'error', duration: 3000 });
  });

  it('status 不为 preview 时 handleConfirm 不动作', async () => {
    const { result } = renderHook(() => useRollback('t1'));
    await act(async () => {
      await result.current.handleConfirm('files');
    });
    expect(apiMock.sessions.rewind).not.toHaveBeenCalled();
  });
});