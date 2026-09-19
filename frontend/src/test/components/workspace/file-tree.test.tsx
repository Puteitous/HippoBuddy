import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTree } from '@/components/workspace/FileTree';

const { readDir, getJson } = vi.hoisted(() => ({ readDir: vi.fn(), getJson: vi.fn() }));

vi.mock('@/utils/desktop-bridge', () => ({
  desktopBridge: { readDir },
}));
vi.mock('@/api/http', () => ({ getJson }));
vi.mock('@/utils/toastStore', () => ({ showToast: vi.fn() }));
vi.mock('@/components/FileIcon', () => ({ FileIcon: () => <span data-testid="file-icon" /> }));
vi.mock('@/components/FileTypeIcon', () => ({ FileTypeIcon: () => <img data-testid="file-type-icon" alt="" /> }));

const ROOT = '/test-workspace';
const EXPANDED_KEY = 'hippo-file-tree-expanded';

function dir(name: string): DirEntry {
  return { name, isDirectory: true };
}
function file(name: string): DirEntry {
  return { name, isDirectory: false };
}

/** 用「目录路径 → 条目」映射驱动 readDir,避免 mockResolvedValue 全路径同值导致的递归嵌套 */
function mockTree(map: Record<string, DirEntry[]>): void {
  readDir.mockImplementation(async (p: string) => map[p] ?? null);
}

function nodeOf(text: string): HTMLElement {
  return screen.getByText(text).closest('.file-tree-node')!;
}
function storedExpanded(): Record<string, string[]> {
  return JSON.parse(localStorage.getItem(EXPANDED_KEY) || '{}');
}

beforeEach(() => {
  localStorage.clear();
  readDir.mockReset();
  // jsdom 缺少 scrollIntoView / ResizeObserver,补齐避免组件报错
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FileTree 渲染分支', () => {
  it('未设置 rootPath 显示未设置工作区', () => {
    mockTree({});
    render(<FileTree rootPath="" activePath={null} onFileSelect={vi.fn()} />);
    expect(screen.getByText('未设置工作区')).toBeInTheDocument();
  });

  it('空目录显示空目录', async () => {
    mockTree({ [ROOT]: [] });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('空目录')).toBeInTheDocument());
  });

  it('渲染目录与文件节点(目录优先)', async () => {
    mockTree({ [ROOT]: [file('b.js'), dir('a')] });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
    const list = document.querySelectorAll('.file-tree-list > li');
    // 排序:目录 a 在文件 b.js 之前
    expect(list[0].textContent).toContain('a');
    expect(list[1].textContent).toContain('b.js');
  });

  it('readDir 返回 null 时显示错误与重试', async () => {
    mockTree({});
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/无法读取目录/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});

describe('FileTree 递归展开与高亮(activePath)', () => {
  const TREE: Record<string, DirEntry[]> = {
    [ROOT]: [dir('src'), file('README.md')],
    [ROOT + '/src']: [dir('components'), file('index.ts')],
    [ROOT + '/src/components']: [file('FileTree.tsx')],
  };

  it('对工作区内文件逐层展开全部祖先并高亮', async () => {
    mockTree(TREE);
    render(
      <FileTree
        rootPath={ROOT}
        activePath={ROOT + '/src/components/FileTree.tsx'}
        onFileSelect={vi.fn()}
      />,
    );
    // 初始:仅根一层(src + README)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument());
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.queryByText('FileTree.tsx')).not.toBeInTheDocument();

    // 逐层展开到文件
    await waitFor(() => expect(screen.getByText('components')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('FileTree.tsx')).toBeInTheDocument());

    // 高亮文件节点
    await waitFor(() => {
      expect(nodeOf('FileTree.tsx').classList.contains('active')).toBe(true);
    });
    // 祖先目录展开
    expect(nodeOf('src').classList.contains('expanded')).toBe(true);
    expect(nodeOf('components').classList.contains('expanded')).toBe(true);

    // 展开集持久化
    await waitFor(() => {
      expect(storedExpanded()[ROOT]).toEqual(
        expect.arrayContaining([ROOT + '/src', ROOT + '/src/components']),
      );
    });
  });

  it('越界路径(非工作区内)不触发展开', async () => {
    mockTree(TREE);
    render(
      <FileTree rootPath={ROOT} activePath="/outside/x.md" onFileSelect={vi.fn()} />,
    );
    // src 不展开 → 其子项不渲染
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument());
    expect(nodeOf('src').classList.contains('expanded')).toBe(false);
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
    expect(localStorage.getItem(EXPANDED_KEY)).toBeNull();
  });
});

describe('FileTree revealDir(面包屑定位)', () => {
  const TREE: Record<string, DirEntry[]> = {
    [ROOT]: [dir('src'), file('README.md')],
    [ROOT + '/src']: [dir('components'), file('index.ts')],
    [ROOT + '/src/components']: [],
  };

  it('展开目标目录全部祖先并高亮目录节点', async () => {
    mockTree(TREE);
    render(
      <FileTree
        rootPath={ROOT}
        activePath={null}
        revealDir={ROOT + '/src/components'}
        onFileSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('components')).toBeInTheDocument());
    const node = nodeOf('components');
    expect(node.classList.contains('is-dir')).toBe(true);
    expect(node.classList.contains('active')).toBe(true);
    expect(nodeOf('src').classList.contains('expanded')).toBe(true);
  });
});

describe('FileTree 展开/折叠与持久化', () => {
  it('点击目录切换展开状态并持久化', async () => {
    mockTree({
      [ROOT]: [dir('src'), file('README.md')],
      [ROOT + '/src']: [file('index.ts')],
    });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument());

    const src = nodeOf('src');
    expect(localStorage.getItem(EXPANDED_KEY)).toBeNull();

    // 展开:加载子项
    fireEvent.click(src);
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument());
    await waitFor(() => {
      expect(storedExpanded()[ROOT]).toEqual([ROOT + '/src']);
    });

    // 折叠:卸载子项
    fireEvent.click(nodeOf('src'));
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
    await waitFor(() => {
      expect((storedExpanded()[ROOT] as string[]).includes(ROOT + '/src')).toBe(false);
    });
  });

  it('折叠全部清空展开集合并持久化', async () => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify({ [ROOT]: [ROOT + '/a', ROOT + '/b'] }));
    mockTree({ [ROOT]: [dir('a'), dir('b'), file('c.txt')] });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '折叠全部' }));
    await waitFor(() => expect(storedExpanded()[ROOT]).toEqual([]));
  });

  it('从 localStorage 恢复已展开目录', async () => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify({ [ROOT]: [ROOT + '/a'] }));
    mockTree({
      [ROOT]: [dir('a'), file('x.txt')],
      [ROOT + '/a']: [file('y.js')],
    });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('y.js')).toBeInTheDocument());
    expect(nodeOf('a').classList.contains('expanded')).toBe(true);
  });
});

describe('FileTree 点击回调', () => {
  it('点击文件调用 onFileSelect(带完整路径)', async () => {
    const onSelect = vi.fn();
    mockTree({ [ROOT]: [dir('src'), file('index.ts')] });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={onSelect} />);
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument());
    fireEvent.click(screen.getByText('index.ts'));
    expect(onSelect).toHaveBeenCalledWith(ROOT + '/index.ts');
  });
});

describe('FileTree git 徽章', () => {
  /** 取文件节点内的 git 徽章元素 */
  function badgeOf(text: string): HTMLElement | null {
    return nodeOf(text).querySelector('.file-tree-status-badge');
  }

  /** 断言某文件徽章的字母与配色类别 */
  async function expectBadge(name: string, letter: string, kind: string): Promise<void> {
    await waitFor(() => expect(badgeOf(name)?.textContent).toBe(letter));
    expect(badgeOf(name)!.classList.contains(`status-${kind}`)).toBe(true);
  }

  /** 注入 git status 条目(按 porcelain 语义补齐 staged/unstaged/untracked) */
  function mockGit(files: Array<{ path: string; xy: string }>): void {
    getJson.mockResolvedValue({
      available: true,
      entries: files.map((f) => ({
        path: f.path,
        xy: f.xy,
        staged: f.xy[0] !== ' ' && f.xy[0] !== '?',
        unstaged: f.xy[1] !== ' ' || f.xy === '??',
        untracked: f.xy === '??',
      })),
    });
  }

  it('未跟踪显示 U(绿),不再与文件树原有的 A 混用', async () => {
    mockTree({ [ROOT]: [file('new.txt')] });
    mockGit([{ path: 'new.txt', xy: '??' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('new.txt', 'U', 'add');
  });

  it('已暂存新增显示 A(绿),与未跟踪同为新增色但字母可区分', async () => {
    mockTree({ [ROOT]: [file('added.txt')] });
    mockGit([{ path: 'added.txt', xy: 'A ' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('added.txt', 'A', 'add');
  });

  it('修改显示 M(琥珀)', async () => {
    mockTree({ [ROOT]: [file('mod.txt')] });
    mockGit([{ path: 'mod.txt', xy: ' M' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('mod.txt', 'M', 'mod');
  });

  it('删除显示 D(红)', async () => {
    mockTree({ [ROOT]: [file('del.txt')] });
    mockGit([{ path: 'del.txt', xy: 'D ' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('del.txt', 'D', 'del');
  });

  it('重命名显示 R(琥珀),信息比原先并入 M 更准', async () => {
    mockTree({ [ROOT]: [file('new-name.ts')] });
    mockGit([{ path: 'new-name.ts', xy: 'R ' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('new-name.ts', 'R', 'mod');
  });

  it('冲突显示 !(红),不会被误当成未跟踪的 U', async () => {
    mockTree({ [ROOT]: [file('conflict.txt')] });
    mockGit([{ path: 'conflict.txt', xy: 'UU' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await expectBadge('conflict.txt', '!', 'conflict');
  });

  it('节点 class 同步带上配色类别,供文件名染色', async () => {
    mockTree({ [ROOT]: [file('mod.txt')] });
    mockGit([{ path: 'mod.txt', xy: ' M' }]);
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(badgeOf('mod.txt')?.textContent).toBe('M'));
    expect(nodeOf('mod.txt').classList.contains('status-mod')).toBe(true);
  });

  it('git 不可用时不渲染徽章', async () => {
    mockTree({ [ROOT]: [file('plain.txt')] });
    getJson.mockResolvedValue({ available: false, entries: [] });
    render(<FileTree rootPath={ROOT} activePath={null} onFileSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('plain.txt')).toBeInTheDocument());
    expect(badgeOf('plain.txt')).toBeNull();
  });
});