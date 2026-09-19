import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BashToolCard } from '@/components/tool-renderers/BashToolCard';
import { DeleteFileCard } from '@/components/tool-renderers/DeleteFileCard';
import { EditFileCard } from '@/components/tool-renderers/EditFileCard';
import { WebToolCard } from '@/components/tool-renderers/WebToolCard';
import type { ToolCallRecord } from '@/types';

const { appState, desktop } = vi.hoisted(() => ({
  appState: { workspacePath: '/ws' },
  desktop: { navigateToFile: vi.fn() },
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: { workspacePath: string }) => unknown) => sel(appState),
    { getState: () => appState },
  ),
}));
vi.mock('@/utils/desktop-bridge', () => ({
  desktopBridge: desktop,
  toRelativePath: (p: string) => (p.startsWith('/ws/') ? p.slice('/ws/'.length) : p),
}));

function rec(over: Partial<ToolCallRecord>): ToolCallRecord {
  return { id: 'r', name: 'bash', status: 'success', args: {}, ...over } as ToolCallRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BashToolCard', () => {
  it('渲染命令与工作目录', () => {
    render(<BashToolCard record={rec({ args: { command: 'npm test', working_dir: '/ws' } })} />);
    expect(screen.getByText('运行命令')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('/ws')).toBeInTheDocument();
  });

  it('running 且带 progress 时渲染流式进度(取最近 50 行)', () => {
    const progress = Array.from({ length: 60 }, (_, i) => `line${i}`);
    const { container } = render(
      <BashToolCard record={rec({ status: 'running', args: { command: 'x' }, progress })} />,
    );
    const pre = container.querySelector('.bash-progress pre') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('line59');
    expect(pre.textContent).toContain('line10'); // line59-line10 共 50 行
    expect(pre.textContent).not.toContain('line0'); // 前 10 行被截断
  });

  it('成功结束后显示最终结果', () => {
    render(<BashToolCard record={rec({ args: { command: 'x' }, result: 'ok done' })} />);
    expect(screen.getByText('ok done')).toBeInTheDocument();
  });

  it('failed 且带 error 时显示错误', () => {
    render(<BashToolCard record={rec({ status: 'failed', error: 'boom' })} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});

describe('DeleteFileCard', () => {
  it('多路径渲染 共 N 项 与各文件路径', () => {
    render(
      <DeleteFileCard record={rec({ args: { paths: ['/ws/a.ts', '/ws/b.js'] } })} />,
    );
    expect(screen.getByText('共 2 项:')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('b.js')).toBeInTheDocument();
  });

  it('单路径直接渲染路径行', () => {
    render(<DeleteFileCard record={rec({ args: { paths: ['/ws/only.ts'] } })} />);
    expect(screen.getByText('only.ts')).toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 项/)).toBeNull();
  });

  it('running 显示 正在删除…;成功后显示结果', () => {
    const { container, rerender } = render(
      <DeleteFileCard record={rec({ status: 'running', args: { paths: ['/ws/a.ts'] } })} />,
    );
    expect(screen.getByText('正在删除…')).toBeInTheDocument();
    rerender(<DeleteFileCard record={rec({ args: { paths: ['/ws/a.ts'] }, result: '已删除 1 个' })} />);
    expect(screen.getByText('已删除 1 个')).toBeInTheDocument();
    expect(container.querySelector('.tool-error')).toBeNull();
  });

  it('点击文件路径触发桌面端跳转', () => {
    render(<DeleteFileCard record={rec({ args: { paths: ['/ws/a.ts'] } })} />);
    fireEvent.click(screen.getByText('a.ts'));
    expect(desktop.navigateToFile).toHaveBeenCalledWith('/ws/a.ts');
  });
});

describe('EditFileCard', () => {
  it('显示相对路径与 diff 统计 +X -Y 及 diff 行', () => {
    const { container } = render(
      <EditFileCard record={rec({ args: { path: '/ws/a.ts', old_text: 'a\nb', new_text: 'a\nB' } })} />,
    );
    expect(screen.getByText('编辑文件')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(container.querySelector('.diff-add')).toHaveTextContent('+1');
    expect(container.querySelector('.diff-del')).toHaveTextContent('-1');
  });

  it('running 时显示 正在编辑… 而无 diff', () => {
    const { container } = render(
      <EditFileCard record={rec({ status: 'running', args: { path: '/ws/a.ts', old_text: 'a', new_text: 'b' } })} />,
    );
    expect(screen.getByText('正在编辑…')).toBeInTheDocument();
    expect(container.querySelector('.tool-diff')).toBeNull();
  });

  it('failed 且带 error 时显示错误', () => {
    render(<EditFileCard record={rec({ status: 'failed', error: 'edit fail' })} />);
    expect(screen.getByText('edit fail')).toBeInTheDocument();
  });

  it('点击文件路径触发桌面端跳转', () => {
    render(<EditFileCard record={rec({ args: { path: '/ws/a.ts', old_text: 'a', new_text: 'a' } })} />);
    fireEvent.click(screen.getByText('a.ts'));
    expect(desktop.navigateToFile).toHaveBeenCalledWith('/ws/a.ts');
  });
});

describe('WebToolCard', () => {
  it('web_search 显示 联网搜索 标题与查询词', () => {
    render(<WebToolCard record={rec({ name: 'web_search', args: { query: '天气' } })} />);
    expect(screen.getByText('联网搜索')).toBeInTheDocument();
    expect(screen.getByText('天气')).toBeInTheDocument();
  });

  it('web_fetch 显示 网页抓取 标题与 url', () => {
    render(<WebToolCard record={rec({ name: 'web_fetch', args: { url: 'https://example.com' } })} />);
    expect(screen.getByText('网页抓取')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('running 显示 执行中…;成功后显示结果', () => {
    const { container } = render(
      <WebToolCard record={rec({ name: 'web_search', status: 'running', args: { query: 'q' } })} />,
    );
    expect(screen.getByText('执行中…')).toBeInTheDocument();
    expect(container.querySelector('.tool-result')).toBeNull();
  });

  it('正则替换:成功后渲染结果,失败渲染错误', () => {
    const { rerender } = render(
      <WebToolCard record={rec({ name: 'web_search', args: { query: 'q' }, result: '结果文本' })} />,
    );
    expect(screen.getByText('结果文本')).toBeInTheDocument();
    rerender(<WebToolCard record={rec({ name: 'web_search', status: 'failed', args: { query: 'q' }, error: '搜索失败' })} />);
    expect(screen.getByText('搜索失败')).toBeInTheDocument();
  });
});