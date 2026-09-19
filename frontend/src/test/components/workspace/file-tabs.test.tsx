import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTabs } from '@/components/workspace/FileTabs';
import type { FileTab } from '@/types';

vi.mock('@/components/FileTypeIcon', () => ({
  FileTypeIcon: () => <img data-testid="file-type-icon" alt="" />,
}));

/** 构造标签(必填字段齐全) */
function tab(path: string, partial: Partial<FileTab> = {}): FileTab {
  const name = path.split('/').pop() ?? path;
  return { path, name, mode: 'preview', ...partial };
}

interface Ctx {
  onSelect: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onCloseOthers: ReturnType<typeof vi.fn>;
  onCloseRight: ReturnType<typeof vi.fn>;
  onCloseAll: ReturnType<typeof vi.fn>;
  onReorder: ReturnType<typeof vi.fn>;
}
let handlers: Ctx;

function setup(tabs: FileTab[], activePath: string | null = null) {
  return render(
    <FileTabs
      tabs={tabs}
      activePath={activePath}
      onSelect={handlers.onSelect}
      onClose={handlers.onClose}
      onCloseOthers={handlers.onCloseOthers}
      onCloseRight={handlers.onCloseRight}
      onCloseAll={handlers.onCloseAll}
      onReorder={handlers.onReorder}
    />,
  );
}

beforeEach(() => {
  handlers = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseRight: vi.fn(),
    onCloseAll: vi.fn(),
    onReorder: vi.fn(),
  };
  // copy-path 上下文动作依赖 navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  // 标签栏滚动居中依赖 scrollTo,jsdom 不存在,stub 掉
  Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(),
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FileTabs 渲染', () => {
  it('渲染各标签名称与图标', () => {
    setup([tab('/a/index.ts'), tab('/a/readme.md')]);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
  });

  it('空标签渲染空容器', () => {
    const { container } = setup([]);
    expect(container.querySelector('.file-tabs-empty')).not.toBeNull();
  });

  it('激活标签带 active class 与 aria-selected', () => {
    setup([tab('/a/x.ts'), tab('/a/y.js')], '/a/x.ts');
    const tabEl = screen.getByText('x.ts').closest('.file-tab')!;
    expect(tabEl.classList.contains('active')).toBe(true);
    expect(tabEl).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { selected: true })?.getAttribute('title')).toBe('/a/x.ts');
  });

  it('diff 模式标签带 is-diff class 与 diff 标记,web 模式渲染网页图标', () => {
    setup([tab('/a/x.ts', { mode: 'diff' }), tab('/a/wiki', { mode: 'web' })]);
    const diffEl = screen.getByText('x.ts').closest('.file-tab')!;
    expect(diffEl.classList.contains('is-diff')).toBe(true);
    expect(screen.getByText('diff')).toBeInTheDocument();
    expect(diffEl.querySelector('img')).toBeNull(); // diff 用 svg 不是 FileTypeIcon
    const webEl = screen.getByText('wiki').closest('.file-tab')!;
    expect(webEl.classList.contains('is-diff')).toBe(false);
    expect(webEl.querySelector('svg')).not.toBeNull();
  });

  it('preview 模式文件使用 FileTypeIcon', () => {
    setup([tab('/a/data.json')]);
    expect(screen.getByTestId('file-type-icon')).toBeInTheDocument();
  });

  it('dirty 标签带 dirty class', () => {
    const { container } = setup([tab('/a/x.ts', { dirty: true }), tab('/a/clean.ts')]);
    const dirtyEl = container.querySelector('.file-tab.dirty')!;
    expect(dirtyEl?.getAttribute('title')).toBe('/a/x.ts');
  });
});

describe('FileTabs 交互', () => {
  it('点击标签触发 onSelect', () => {
    setup([tab('/a/x.ts'), tab('/a/y.js')], '/a/x.ts');
    fireEvent.click(screen.getByText('y.js'));
    expect(handlers.onSelect).toHaveBeenCalledWith('/a/y.js');
  });

  it('关闭按钮触发 onClose 并阻止冒泡', () => {
    setup([tab('/a/x.ts')], '/a/x.ts');
    const closeBtn = screen.getByRole('button', { name: '关闭' });
    fireEvent.click(closeBtn);
    expect(handlers.onClose).toHaveBeenCalledWith('/a/x.ts');
  });

  it('中键点击触发 onClose', () => {
    setup([tab('/a/x.ts')], '/a/x.ts');
    fireEvent(screen.getByText('x.ts'), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(handlers.onClose).toHaveBeenCalledWith('/a/x.ts');
  });
});

describe('FileTabs 右键菜单', () => {
  function openMenu(path: string) {
    const el = screen.getByText(path.split('/').pop()!).closest('.file-tab')!;
    fireEvent.contextMenu(el, { clientX: 60, clientY: 60 });
  }

  it('右键弹出菜单,关闭当前调用 onClose', () => {
    setup([tab('/a/x.ts'), tab('/a/y.js')], '/a/x.ts');
    openMenu('/a/y.js');
    fireEvent.click(screen.getByText('关闭当前'));
    expect(handlers.onClose).toHaveBeenCalledWith('/a/y.js');
  });

  it('关闭其他 / 关闭右侧 / 关闭全部分发对应回调', () => {
    setup([tab('/a/x.ts'), tab('/a/y.js'), tab('/a/z.py')], '/a/x.ts');
    openMenu('/a/y.js');
    fireEvent.click(screen.getByText('关闭其他'));
    expect(handlers.onCloseOthers).toHaveBeenCalledWith('/a/y.js');
    openMenu('/a/y.js');
    fireEvent.click(screen.getByText('关闭右侧'));
    expect(handlers.onCloseRight).toHaveBeenCalledWith('/a/y.js');
    openMenu('/a/y.js');
    fireEvent.click(screen.getByText('关闭全部'));
    expect(handlers.onCloseAll).toHaveBeenCalled();
  });

  it('复制路径写入剪贴板', async () => {
    setup([tab('/a/x.ts')], '/a/x.ts');
    openMenu('/a/x.ts');
    fireEvent.click(screen.getByText('复制路径'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/a/x.ts');
    });
  });
});