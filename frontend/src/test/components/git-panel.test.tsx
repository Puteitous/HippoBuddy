import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GitPanel, __resetGitPanelSnapshot } from '@/components/GitPanel';
import { useAppStore } from '@/stores/appStore';
import type { GitStatusEntry } from '@/api/client';

const { gitApiMock, openGitDiff } = vi.hoisted(() => ({
  gitApiMock: {
    status: vi.fn(),
    branch: vi.fn(),
    log: vi.fn(),
    operate: vi.fn(),
    commitMessage: vi.fn(),
  },
  openGitDiff: vi.fn(),
}));

vi.mock('@/api/client', () => ({ gitApi: gitApiMock }));
vi.mock('@/stores/previewStore', () => ({
  usePreviewStore: (selector: (s: { openGitDiff: () => void }) => unknown) =>
    selector({ openGitDiff }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/utils/eventBus', () => ({ on: () => () => {} }));
vi.mock('@/components/FileTypeIcon', () => ({ FileTypeIcon: () => null }));

const WORKSPACE = '/ws';
const OTHER_WORKSPACE = '/ws-other';

/** 已跟踪、工作区有改动(未暂存) */
function unstagedEntry(path: string): GitStatusEntry {
  return { path, xy: ' M', staged: false, unstaged: true, untracked: false };
}

/** 恒挂起的 Promise:模拟"请求在途" */
function pending(): Promise<never> {
  return new Promise(() => {});
}

beforeEach(() => {
  __resetGitPanelSnapshot();
  useAppStore.setState({ workspacePath: WORKSPACE });
  gitApiMock.status.mockResolvedValue({ available: true, entries: [unstagedEntry('file.txt')] });
  gitApiMock.branch.mockResolvedValue({ current: 'main', names: ['main'], remotes: [] });
  gitApiMock.log.mockResolvedValue({ entries: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GitPanel 加载态与快照', () => {
  it('首次打开(无快照):显示加载占位,数据返回后渲染变更', async () => {
    render(<GitPanel />);
    expect(screen.getByText('git.loading')).toBeInTheDocument();
    expect(await screen.findByText('file.txt')).toBeInTheDocument();
    expect(screen.queryByText('git.loading')).not.toBeInTheDocument();
  });

  it('关闭后重开:直接用快照渲染,不再闪"加载中"', async () => {
    const { unmount } = render(<GitPanel />);
    await screen.findByText('file.txt');
    unmount();

    render(<GitPanel />);
    // 首帧即命中快照:既没有加载占位,也有内容
    expect(screen.queryByText('git.loading')).not.toBeInTheDocument();
    expect(screen.getByText('file.txt')).toBeInTheDocument();
    // 让重开后的后台刷新落地,避免测试结束后才更新状态(act 警告)
    await act(async () => {});
  });

  it('重开面板时后台刷新:请求在途也保持旧内容,不闪加载占位', async () => {
    const { unmount } = render(<GitPanel />);
    await screen.findByText('file.txt');
    unmount();

    // 重开后的刷新挂起(模拟慢请求)
    gitApiMock.status.mockImplementation(pending);
    render(<GitPanel />);
    expect(screen.queryByText('git.loading')).not.toBeInTheDocument();
    expect(screen.getByText('file.txt')).toBeInTheDocument();
  });

  it('点刷新:请求在途时旧内容保持在位', async () => {
    render(<GitPanel />);
    await screen.findByText('file.txt');

    gitApiMock.status.mockImplementation(pending);
    fireEvent.click(screen.getByLabelText('git.refresh'));

    expect(screen.queryByText('git.loading')).not.toBeInTheDocument();
    expect(screen.getByText('file.txt')).toBeInTheDocument();
  });

  it('刷新失败:展示错误而非一直占位', async () => {
    gitApiMock.status.mockRejectedValue(new Error('boom'));
    render(<GitPanel />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByText('git.loading')).not.toBeInTheDocument();
  });

  it('无工作区:提示非仓库', () => {
    useAppStore.setState({ workspacePath: '' });
    render(<GitPanel />);
    expect(screen.getByText('git.notRepo')).toBeInTheDocument();
  });

  it('切换工作区:旧仓库数据立即失效,不串仓库', async () => {
    render(<GitPanel />);
    await screen.findByText('file.txt');

    // 新仓库的请求挂起:若旧数据未清理,会继续显示上一个仓库的文件
    gitApiMock.status.mockImplementation(pending);
    act(() => {
      useAppStore.setState({ workspacePath: OTHER_WORKSPACE });
    });

    expect(screen.queryByText('file.txt')).not.toBeInTheDocument();
  });

  it('提交按钮在无已暂存内容时禁用', async () => {
    render(<GitPanel />);
    await screen.findByText('file.txt');
    const commitBtn = screen.getByRole('button', { name: 'git.commit' });
    expect(commitBtn).toBeDisabled();
  });
});

describe('GitPanel 状态徽章', () => {
  /** 构造条目(porcelain 语义) */
  function entry(path: string, xy: string): GitStatusEntry {
    return {
      path,
      xy,
      staged: xy[0] !== ' ' && xy[0] !== '?',
      unstaged: xy[1] !== ' ' || xy === '??',
      untracked: xy === '??',
    };
  }

  /** 取某变更行内的徽章元素(冲突态同时属于两组,取首个匹配即可) */
  function badgeOf(name: string): HTMLElement {
    return screen.getAllByText(name)[0].closest('.git-panel-row')!.querySelector('.git-panel-badge')!;
  }

  it('字母与配色统一按 utils/git-status 渲染(U/A 绿、M 琥珀、D 红、! 红)', async () => {
    gitApiMock.status.mockResolvedValue({
      available: true,
      entries: [
        entry('new.txt', '??'), // 未跟踪 → U
        entry('added.txt', 'A '), // 已暂存新增 → A
        entry('mod.txt', ' M'), // 修改 → M
        entry('del.txt', 'D '), // 删除 → D
        entry('conflict.txt', 'UU'), // 冲突 → !
      ],
    });
    render(<GitPanel />);
    await screen.findByText('new.txt');

    // 未跟踪为 U(与"已 add 的 A"区分),且不再显示成问号
    expect(badgeOf('new.txt').textContent).toBe('U');
    expect(badgeOf('new.txt').classList.contains('add')).toBe(true);

    expect(badgeOf('added.txt').textContent).toBe('A');
    expect(badgeOf('added.txt').classList.contains('add')).toBe(true);

    expect(badgeOf('mod.txt').textContent).toBe('M');
    expect(badgeOf('mod.txt').classList.contains('mod')).toBe(true);

    expect(badgeOf('del.txt').textContent).toBe('D');
    expect(badgeOf('del.txt').classList.contains('del')).toBe(true);

    // 冲突不会被显示成 U(那样会与未跟踪混淆)
    expect(badgeOf('conflict.txt').textContent).toBe('!');
    expect(badgeOf('conflict.txt').classList.contains('conflict')).toBe(true);
  });

  it('新增(A)用 add 类取色,不再落到 mod(修复已暂存新文件显示成橙色)', async () => {
    gitApiMock.status.mockResolvedValue({
      available: true,
      entries: [entry('added.txt', 'A ')],
    });
    render(<GitPanel />);
    await screen.findByText('added.txt');
    const badge = badgeOf('added.txt');
    expect(badge.classList.contains('add')).toBe(true);
    expect(badge.classList.contains('mod')).toBe(false);
  });
});
