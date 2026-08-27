import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolTimeline } from '@/components/tool-renderers/ToolTimeline';
import type { TimelineToolItem } from '@/components/tool-renderers/tool-timeline-utils';

const { appState, previewState } = vi.hoisted(() => ({
  appState: { workspacePath: '/ws' },
  previewState: { openFile: vi.fn(), openDiff: vi.fn() },
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: { workspacePath: string }) => unknown) => sel(appState),
}));
vi.mock('@/stores/previewStore', () => ({
  usePreviewStore: Object.assign(
    () => null,
    { getState: () => previewState },
  ),
}));

const runningBash: TimelineToolItem = {
  id: 'b1',
  name: 'bash',
  status: 'running',
  args: { command: 'npm test' },
  progress: ['line1', 'line2'],
};
const successEdit: TimelineToolItem = {
  id: 'e1',
  name: 'edit_file',
  status: 'success',
  args: { path: '/ws/src/a.ts', old_text: 'a\nb', new_text: 'a\nB' },
  result: 'ok',
};
const deniedDelete: TimelineToolItem = {
  id: 'd1',
  name: 'delete_file',
  status: 'denied',
  args: { paths: ['/ws/tmp/x.js'] },
  content: '已拒绝删除',
};
const pendingConfirm: TimelineToolItem = {
  id: 'c1',
  name: 'bash',
  status: 'pending_confirmation',
  args: { command: 'rm -rf /tmp/y' },
  confirmationData: {
    confirmId: 'c1',
    command: 'rm -rf /tmp/y',
    riskLevel: 'high',
    riskReason: 'i18n:blocker.rm',
  },
};
const readItem: TimelineToolItem = {
  id: 'r1',
  name: 'read_file',
  status: 'success',
  args: { path: '/ws/src/b.ts' },
  result: 'file content',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ToolTimeline - 渲染', () => {
  it('items 为空返回空', () => {
    const { container } = render(<ToolTimeline items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('按 items 渲染对应行，并标记状态', () => {
    const { container } = render(
      <ToolTimeline items={[runningBash, successEdit, deniedDelete]} />,
    );
    expect(container.querySelector('[data-tool-name="bash"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-name="edit_file"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-name="delete_file"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-status="running"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-status="success"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-status="denied"]')).not.toBeNull();
  });

  it('edit_file 成功态摘要精简为相对路径并显示 diff 统计', () => {
    const { container } = render(<ToolTimeline items={[successEdit]} />);
    // workspacePath /ws → 摘要精简为 src/a.ts
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    // diff: 新增 1 行（B）删除 1 行（b）
    expect(container.querySelector('.timeline-diff-stats')).not.toBeNull();
    expect(container.querySelector('.diff-add')).toHaveTextContent('+1');
    expect(container.querySelector('.diff-del')).toHaveTextContent('-1');
  });

  it('bash running 带进度显示 spinner', () => {
    const { container } = render(<ToolTimeline items={[runningBash]} />);
    expect(container.querySelector('.tool-spinner')).not.toBeNull();
  });

  it('denied 状态展开显示 已拒绝删除（delete_file）', () => {
    render(<ToolTimeline items={[deniedDelete]} />);
    // 摘要被工作区根路径精简为相对路径
    fireEvent.click(screen.getByText('tmp/x.js'));
    expect(screen.getByText('已拒绝删除')).toBeInTheDocument();
  });

  it('pending_confirmation 默认展开并内嵌确认区', () => {
    render(<ToolTimeline items={[pendingConfirm]} />);
    // 默认展开 → 行内确认区渲染（命令同时出现于摘要与命令块）
    expect(screen.getByText('执行命令')).toBeInTheDocument();
    expect(screen.getAllByText('rm -rf /tmp/y').length).toBe(2);
    expect(screen.getByRole('button', { name: '执行' })).toBeInTheDocument();
  });
});

describe('ToolTimeline - 交互', () => {
  it('点击切换 expanded 类（展开/折叠）', () => {
    const { container } = render(<ToolTimeline items={[runningBash]} />);
    const row = container.querySelector('.tool-timeline-item') as HTMLElement;
    // 非待确认态默认折叠
    expect(row.className).not.toContain('expanded');
    fireEvent.click(screen.getByText('npm test'));
    expect(row.className).toContain('expanded');
    fireEvent.click(screen.getByText('npm test'));
    expect(row.className).not.toContain('expanded');
  });

  it('点击 running 展开后展示 progress 内容', () => {
    const { container } = render(<ToolTimeline items={[runningBash]} />);
    fireEvent.click(screen.getByText('npm test'));
    const code = container.querySelector('.timeline-detail-progress code');
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent('line1');
    expect(code).toHaveTextContent('line2');
  });

  it('edit_file 成功态显示 查看变更，点击触发 openDiff', () => {
    render(<ToolTimeline items={[successEdit]} />);
    const viewBtn = screen.getByText('查看变更');
    fireEvent.click(viewBtn);
    expect(previewState.openDiff).toHaveBeenCalledWith('/ws/src/a.ts', 'e1');
  });

  it('read_file 摘要点击触发 openFile 定位', () => {
    render(<ToolTimeline items={[readItem]} />);
    fireEvent.click(screen.getByText('src/b.ts'));
    expect(previewState.openFile).toHaveBeenCalledWith('/ws/src/b.ts');
  });
});