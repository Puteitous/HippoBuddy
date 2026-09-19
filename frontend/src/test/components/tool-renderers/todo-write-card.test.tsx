import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodoWriteCard } from '@/components/tool-renderers/TodoWriteCard';
import type { ToolCallRecord } from '@/types';

function makeRecord(args: unknown, status = 'running'): ToolCallRecord {
  return { id: 't1', name: 'todo_write', status, args } as unknown as ToolCallRecord;
}

const flatTodos = [
  { id: 'a', content: '任务A', status: 'completed' },
  { id: 'a1', content: '子任务A1', status: 'pending', parentId: 'a' },
  { id: 'b', content: '任务B', status: 'in_progress' },
];

describe('TodoWriteCard', () => {
  it('标题与完成统计徽章(completed / total)', () => {
    render(<TodoWriteCard record={makeRecord({ todos: flatTodos })} />);
    expect(screen.getByText('任务清单')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('按 parentId 构建树:子任务缩进、进度条显示', () => {
    const { container } = render(<TodoWriteCard record={makeRecord({ todos: flatTodos })} />);
    // 根任务两个、子任务一个
    expect(container.querySelectorAll('.todo-tree-item.depth-0').length).toBe(2);
    expect(container.querySelectorAll('.todo-tree-item.depth-1').length).toBe(1);
    // 进度条存在(总任务 > 1)
    expect(container.querySelector('.todo-progress-bar')).not.toBeNull();
  });

  it('不同状态渲染对应状态类', () => {
    const { container } = render(<TodoWriteCard record={makeRecord({ todos: flatTodos })} />);
    expect(container.querySelector('.todo-node-row.done')).not.toBeNull();
    expect(container.querySelector('.todo-node-row.in-progress')).not.toBeNull();
    expect(container.querySelector('.todo-node-row.pending')).not.toBeNull();
  });

  it('点击父节点折叠箭头切换展开/折叠子级', () => {
    const { container } = render(<TodoWriteCard record={makeRecord({ todos: flatTodos })} />);
    expect(container.querySelector('.todo-tree-children')).not.toBeNull();
    const toggle = container.querySelector('.todo-node-toggle') as HTMLElement;
    fireEvent.click(toggle);
    expect(container.querySelector('.todo-tree-children')).toBeNull();
    fireEvent.click(toggle);
    expect(container.querySelector('.todo-tree-children')).not.toBeNull();
  });

  it('已是树结构(带 children)时直接透传,不重复建树', () => {
    const treeArgs = {
      todos: [{ id: 'x', content: '根', status: 'pending', children: [{ id: 'y', content: '子', status: 'completed' }] }],
    };
    const { container } = render(<TodoWriteCard record={makeRecord(treeArgs)} />);
    // 树被保留:子节点仍在 children 容器内,且完成数统计正确(1/2)
    expect(container.querySelector('.todo-tree-children')).not.toBeNull();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('空 todos 不渲染进度条与统计', () => {
    const { container } = render(<TodoWriteCard record={makeRecord({ todos: [] })} />);
    expect(screen.queryByText('任务清单')).toBeInTheDocument();
    expect(container.querySelector('.todo-progress-bar')).toBeNull();
    expect(screen.queryByText(/\d+\s\/\s\d+/)).toBeNull();
  });

  it('content 缺失时回退显示 未命名任务', () => {
    render(<TodoWriteCard record={makeRecord({ todos: [{ id: 'z', status: 'pending' }] })} />);
    expect(screen.getAllByText('未命名任务').length).toBe(1);
  });

  it('节点带 sessionId 时显示会话关联链接', () => {
    render(
      <TodoWriteCard
        record={makeRecord({ todos: [{ id: 's', content: '关联任务', status: 'pending', sessionId: 'web-abc123' }] })}
      />,
    );
    expect(screen.getByText('🔗')).toBeInTheDocument();
  });
});