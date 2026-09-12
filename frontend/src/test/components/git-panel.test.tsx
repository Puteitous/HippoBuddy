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

describe('GitPanel 提交信息草稿', () => {
  /** 已暂存:提交按钮可用 */
  function stagedEntry(path: string): GitStatusEntry {
    return { path, xy: 'M ', staged: true, unstaged: false, untracked: false };
  }

  function commitInput(): HTMLTextAreaElement {
    return document.querySelector('.git-panel-commit-input') as HTMLTextAreaElement;
  }

  async function renderStaged(): Promise<void> {
    gitApiMock.status.mockResolvedValue({ available: true, entries: [stagedEntry('file.txt')] });
    render(<GitPanel />);
    await screen.findByText('file.txt');
  }

  it('提交框关闭浏览器拼写检查(避免术语/中英混排被划红线)', async () => {
    await renderStaged();
    // jsdom 未实现 spellcheck 属性反射,直接断言渲染出的 attribute
    expect(commitInput().getAttribute('spellcheck')).toBe('false');
  });

  it('提交成功:输入框即清空(不等刷新完成)', async () => {
    gitApiMock.operate.mockResolvedValue({ success: true });
    await renderStaged();

    fireEvent.change(commitInput(), { target: { value: 'feat: hello' } });
    expect(commitInput().value).toBe('feat: hello');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'git.commit' }));
    });

    expect(commitInput().value).toBe('');
  });

  it('提交失败:回填原文案,避免用户重打', async () => {
    gitApiMock.operate.mockResolvedValue({ success: false, error: 'hook failed' });
    await renderStaged();

    fireEvent.change(commitInput(), { target: { value: 'feat: hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'git.commit' }));
    });

    expect(commitInput().value).toBe('feat: hello');
  });

  it('提交在途时面板被卸载,成功后重开不复现旧文案(草稿已写穿)', async () => {
    let resolveOperate: (v: { success: boolean }) => void = () => {};
    gitApiMock.operate.mockImplementation(
      () => new Promise<{ success: boolean }>((res) => { resolveOperate = res; }),
    );
    // 需为已暂存,提交按钮才可用(否则 commit() 直接 return,测不到写穿)
    gitApiMock.status.mockResolvedValue({ available: true, entries: [stagedEntry('file.txt')] });
    const { unmount } = render(<GitPanel />);
    await screen.findByText('file.txt');

    fireEvent.change(commitInput(), { target: { value: 'feat: hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'git.commit' }));

    // 请求在途:面板关闭(组件卸载),之后提交才成功
    unmount();
    await act(async () => {
      resolveOperate({ success: true });
    });

    // 重开:已提交的文案不应残留在输入框里
    render(<GitPanel />);
    await screen.findByText('file.txt');
    expect(commitInput().value).toBe('');
    await act(async () => {});
  });
});

describe('GitPanel 基于起始点新建分支', () => {
  /** 打开分支下拉(提供含 dev 的分支列表) */
  async function openBranchDropdown(): Promise<void> {
    gitApiMock.branch.mockResolvedValue({ current: 'main', names: ['main', 'dev'], remotes: [] });
    gitApiMock.status.mockResolvedValue({ available: true, entries: [unstagedEntry('file.txt')] });
    render(<GitPanel />);
    await screen.findByText('file.txt');
    fireEvent.click(screen.getByTitle('git.manageBranch'));
  }

  /** 在分支名上右键,弹出分支操作菜单 */
  function rightClickBranch(name: string): void {
    fireEvent.contextMenu(screen.getByText(name));
  }

  function branchDialogInput(): HTMLInputElement {
    return document.querySelector('.git-panel-input') as HTMLInputElement;
  }

  /** 填名字并确认 */
  async function submitDialog(name: string): Promise<void> {
    fireEvent.change(branchDialogInput(), { target: { value: name } });
    await act(async () => {
      fireEvent.click(screen.getByText('git.createBtn'));
    });
  }

  it('分支右键菜单含「基于此新建分支…」,弹窗提示起始点,提交带该起始点', async () => {
    await openBranchDropdown();
    rightClickBranch('dev');
    expect(screen.getByText('git.newBranchFrom')).toBeInTheDocument();

    fireEvent.click(screen.getByText('git.newBranchFrom'));
    // 弹窗出现并展示起始点提示
    expect(document.querySelector('.git-panel-input-hint')).not.toBeNull();

    await submitDialog('feature/x');
    expect(gitApiMock.operate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'createBranch', newName: 'feature/x', branch: 'dev' }),
    );
  });

  it('底部「新建分支…」缺省基于当前 HEAD(不传起始点)', async () => {
    await openBranchDropdown();
    fireEvent.click(screen.getByText('git.newBranch'));
    expect(document.querySelector('.git-panel-input-hint')).not.toBeNull();

    await submitDialog('hotfix');
    expect(gitApiMock.operate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'createBranch', newName: 'hotfix', branch: undefined }),
    );
  });

  it('重命名弹窗不显示起始点提示', async () => {
    await openBranchDropdown();
    rightClickBranch('dev');
    fireEvent.click(screen.getByText('git.renameBranch'));
    // 重命名与起始点无关,不应出现该提示行
    expect(document.querySelector('.git-panel-input-hint')).toBeNull();
  });
});
