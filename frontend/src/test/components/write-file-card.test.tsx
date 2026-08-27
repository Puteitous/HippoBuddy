import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WriteFileCard } from '@/components/tool-renderers/WriteFileCard';
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
  toRelativePath: (p: string) => {
    const root = '/ws/';
    return p.startsWith(root) ? p.slice(root.length) : p;
  },
}));

function makeRecord(over: Partial<ToolCallRecord>): ToolCallRecord {
  return { id: 'w1', name: 'write_file', status: 'success', args: {}, ...over } as ToolCallRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WriteFileCard', () => {
  it('展示精简相对路径与标题', () => {
    render(
      <WriteFileCard
        record={makeRecord({ args: { path: '/ws/src/new.ts', content: 'a\nb\nc' } })}
      />,
    );
    expect(screen.getByText('写入文件')).toBeInTheDocument();
    expect(screen.getByText('src/new.ts')).toBeInTheDocument();
  });

  it('成功态显示 +N 徽章(新增行数)与 diff added 行', () => {
    const { container } = render(
      <WriteFileCard record={makeRecord({ args: { path: '/ws/src/new.ts', content: 'a\nb\nc' } })} />,
    );
    // 3 行内容 → +3
    expect(screen.getByText('+3')).toBeInTheDocument();
    const diffLines = container.querySelectorAll('.diff-line.diff-added');
    expect(diffLines.length).toBe(3);
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('running 态显示 正在写入… 而无 diff', () => {
    const { container } = render(
      <WriteFileCard
        record={makeRecord({ status: 'running', args: { path: '/ws/x.ts', content: 'a' } })}
      />,
    );
    expect(screen.getByText('正在写入…')).toBeInTheDocument();
    expect(container.querySelector('.tool-diff')).toBeNull();
  });

  it('failed 态显示错误信息', () => {
    render(
      <WriteFileCard
        record={makeRecord({
          status: 'failed',
          args: { path: '/ws/x.ts' },
          error: '写文件失败',
        })}
      />,
    );
    expect(screen.getByText('写文件失败')).toBeInTheDocument();
  });

  it('无 content 时不渲染 diff', () => {
    const { container } = render(<WriteFileCard record={makeRecord({ args: { path: '/ws/x.ts' } })} />);
    expect(container.querySelector('.tool-diff')).toBeNull();
  });

  it('点击文件路径触发桌面端跳转(绝对路径)', () => {
    render(
      <WriteFileCard record={makeRecord({ args: { path: '/ws/src/new.ts', content: 'a' } })} />,
    );
    fireEvent.click(screen.getByText('src/new.ts'));
    expect(desktop.navigateToFile).toHaveBeenCalledWith('/ws/src/new.ts');
  });

  it('path 为空时不渲染路径行', () => {
    const { container } = render(<WriteFileCard record={makeRecord({ args: { content: 'a' } })} />);
    expect(container.querySelector('.tool-file-path')).toBeNull();
  });
});