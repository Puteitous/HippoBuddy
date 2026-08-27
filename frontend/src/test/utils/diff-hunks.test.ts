import { describe, it, expect } from 'vitest';
import { buildHunkSequence, type DiffHunkLine } from '@/utils/diff-hunks';

function line(type: DiffHunkLine['type'], content = ''): DiffHunkLine {
  return { type, content };
}

describe('buildHunkSequence', () => {
  it('空数组返回空序列', () => {
    expect(buildHunkSequence([])).toEqual([]);
  });

  it('变更行保留前后 DIFF_CONTEXT_LINES 行上下文', () => {
    // 10 行 same, 中间一处 added, index=5
    const changes: DiffHunkLine[] = Array.from({ length: 10 }, (_, i) => line('same', `s${i}`));
    changes[5] = line('added', '+x');

    const out = buildHunkSequence(changes);
    // 显示行: 2..8 (index 5 前后各保留 3 个上下文), 头尾段 [0,2) 与 [9,10) 折叠
    const diffLines = out.filter((i): i is Extract<typeof i, { idx: number }> => i.type !== 'hunk');
    expect(diffLines.map((i) => i.idx)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(diffLines[3].type).toBe('added');
  });

  it('连续未变化段折叠为 hunk,并携带原始下标范围', () => {
    const changes2: DiffHunkLine[] = [
      line('same', 'x0'),
      line('added', '+a'),
      line('same', 'x1'),
      line('same', 'x2'),
      line('same', 'x3'),
      line('same', 'x4'),
      line('same', 'x5'),
      line('same', 'x6'),
      line('same', 'x7'),
      line('same', 'x8'),
      line('same', 'x9'),
      // index=11 added: 到结尾无未显示段
      line('added', '+b'),
    ];
    const out = buildHunkSequence(changes2);
    // added 在 index=1,显示 0..4; index=11 added 显示 8..11; 中间 5..7 折叠
    const markers = out.filter((i): i is Extract<typeof i, { type: 'hunk' }> => i.type === 'hunk');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ type: 'hunk', from: 5, to: 8, count: 3 });
  });

  it('尾部/头部未变化段折叠为 hunk', () => {
    const changes: DiffHunkLine[] = [
      line('same', 'h1'),
      line('same', 'h2'),
      line('same', 'h3'),
      line('same', 'h4'),
      line('same', 'h5'),
      line('added', '+a'),
    ];
    const out = buildHunkSequence(changes);
    const markers = out.filter((i): i is Extract<typeof i, { type: 'hunk' }> => i.type === 'hunk');
    // added 在 index=5,显示 2..5; 头部 0..2 折叠
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ from: 0, to: 2 });
  });
});