import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefChips } from '@/components/chat-panel/RefChips';
import type { RefChip } from '@/types';

function chip(partial: Partial<RefChip> & { id: string }): RefChip {
  return { kind: 'file', text: partial.id, ...partial } as RefChip;
}

describe('RefChips', () => {
  it('chips 为空返回空', () => {
    const { container } = render(<RefChips chips={[]} onRemove={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('file chip 渲染文件名、文本与行号范围（start-end）', () => {
    const c = chip({ id: '1', kind: 'file', text: 'app.ts', filePath: '/ws/src/app.ts', startLine: 3, endLine: 8 });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('app.ts')).toBeInTheDocument();
    expect(within(item).getByText('3-8')).toBeInTheDocument();
  });

  it('file chip 无行号时只显示文本', () => {
    const c = chip({ id: '1', kind: 'file', text: 'app.ts', filePath: '/ws/src/app.ts' });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    expect(screen.queryByText(/^\d+-\d+$/)).toBeNull();
  });

  it('file chip 行号 title 为 完整路径:始行-末行', () => {
    const c = chip({ id: '1', kind: 'file', text: 'app.ts', filePath: '/ws/src/app.ts', startLine: 3, endLine: 8 });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    expect(screen.getByRole('listitem').getAttribute('title')).toBe('/ws/src/app.ts:3-8');
  });

  it('rule chip title 标注 规则 id', () => {
    const c = chip({ id: '1', kind: 'rule', text: 'rule.md', filePath: '/ws/.trae/rules/rule.md', ruleId: 'r-1' });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    expect(screen.getByRole('listitem').getAttribute('title')).toContain('规则 id: r-1');
  });

  it('text chip title 为完整文本（不做截断）', () => {
    const normal = chip({ id: '1', kind: 'text', text: 'SELECT * FROM users' });
    const { rerender } = render(<RefChips chips={[normal]} onRemove={vi.fn()} />);
    expect(screen.getByRole('listitem').getAttribute('title')).toBe('SELECT * FROM users');

    const longText = 'x'.repeat(210);
    const long = chip({ id: '2', kind: 'text', text: longText });
    rerender(<RefChips chips={[long]} onRemove={vi.fn()} />);
    // text 芯片 title 原样透传完整文本
    expect(screen.getByRole('listitem').getAttribute('title')).toBe(longText);
  });

  it('file chip 选中文字 title 携带「选中文字:」', () => {
    const c = chip({
      id: '1',
      kind: 'file',
      text: 'app.ts',
      filePath: '/ws/src/app.ts',
      selectedText: 'const a = 1',
    });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    expect(screen.getByRole('listitem').getAttribute('title')).toContain('选中文字:');
    expect(screen.getByRole('listitem').getAttribute('title')).toContain('const a = 1');
  });

  it('file chip 选中文字超 200 字符在 title 中截断', () => {
    const long = 'y'.repeat(220);
    const c = chip({
      id: '1',
      kind: 'file',
      text: 'app.ts',
      filePath: '/ws/src/app.ts',
      selectedText: long,
    });
    render(<RefChips chips={[c]} onRemove={vi.fn()} />);
    const title = screen.getByRole('listitem').getAttribute('title') ?? '';
    // 「选中文字:\n」+ 200 字符 + …
    expect(title).toContain('选中文字:');
    expect(title).toContain('…');
    expect(title.match(/y/g)?.length).toBe(200);
  });

  it('点击关闭按钮触发 onRemove(id)', async () => {
    const onRemove = vi.fn();
    const c = chip({ id: 'c-42', kind: 'file', text: 'app.ts', filePath: '/ws/src/app.ts' });
    render(<RefChips chips={[c]} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: '移除引用' }));
    expect(onRemove).toHaveBeenCalledWith('c-42');
  });

  it('多个 chips 各自独立的移除按钮', async () => {
    const onRemove = vi.fn();
    const a = chip({ id: 'a', kind: 'file', text: 'a.ts', filePath: '/ws/a.ts' });
    const b = chip({ id: 'b', kind: 'text', text: 'hello' });
    render(<RefChips chips={[a, b]} onRemove={onRemove} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    await userEvent.click(within(items[1]).getByRole('button', { name: '移除引用' }));
    expect(onRemove).toHaveBeenCalledWith('b');
  });
});