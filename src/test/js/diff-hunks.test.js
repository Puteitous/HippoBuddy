/**
 * diff-hunks 折叠算法单元测试(批次 A)
 *
 * 平移旧版 file-diff-view.test.js 中 buildHunkSequence 的用例,验证新版
 * frontend/src/utils/diff-hunks.ts 与旧版算法一致:
 *   - 重叠块合并、远距离折叠、开头/末尾丢弃
 *   - 上下文行数等于 DIFF_CONTEXT_LINES 常量
 */
import { describe, it, expect } from 'vitest';
import {
  buildHunkSequence,
  DIFF_CONTEXT_LINES,
} from '../../../frontend/src/utils/diff-hunks';

describe('buildHunkSequence', () => {
  const mk = (type, content) => ({ type, content });

  it('无变更时整体折叠为单个 hunk(可展开)', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
    ];
    const seq = buildHunkSequence(changes);
    expect(seq).toEqual([{ idx: -1, type: 'hunk', count: 5, from: 0, to: 5 }]);
  });

  it('单个变更块保留前后上下文(头尾折叠为 hunk)', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
      mk('removed', '6'), mk('added', '7'),
      mk('same', '8'), mk('same', '9'), mk('same', '10'), mk('same', '11'), mk('same', '12'),
    ];
    const seq = buildHunkSequence(changes);
    // 变更行下标 5,6 → 显示范围 [5-3, 6+3] = [2, 9];头部 idx0-1 与尾部 idx10-11 折叠为 hunk
    expect(seq).toEqual([
      { idx: -1, type: 'hunk', count: 2, from: 0, to: 2 },
      { idx: 2, type: 'same', content: '3' },
      { idx: 3, type: 'same', content: '4' },
      { idx: 4, type: 'same', content: '5' },
      { idx: 5, type: 'removed', content: '6' },
      { idx: 6, type: 'added', content: '7' },
      { idx: 7, type: 'same', content: '8' },
      { idx: 8, type: 'same', content: '9' },
      { idx: 9, type: 'same', content: '10' },
      { idx: -1, type: 'hunk', count: 2, from: 10, to: 12 },
    ]);
  });

  it('相邻变更块合并(中间未变化段不足 2*context 时不再折叠)', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'),
      mk('removed', '5'),
      mk('same', '6'), mk('same', '7'),
      mk('added', '8'),
      mk('same', '9'), mk('same', '10'),
    ];
    const seq = buildHunkSequence(changes);
    // 变更 4 与 7 的上下文重叠 → 中间不产生 hunk;仅头部 idx0 折叠为 hunk
    const hunks = seq.filter((s) => s.type === 'hunk');
    expect(hunks.length).toBe(1);
    expect(hunks[0]).toMatchObject({ count: 1, from: 0, to: 1 });
  });

  it('远距离变更块之间折叠为 hunk 项(from/to 指向原始下标;头部同样折叠)', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'),
      mk('removed', '5'),
      mk('same', '6'), mk('same', '7'), mk('same', '8'), mk('same', '9'),
      mk('same', '10'), mk('same', '11'), mk('same', '12'), mk('same', '13'),
      mk('same', '14'), mk('same', '15'), mk('same', '16'), mk('same', '17'),
      mk('added', '18'),
      mk('same', '19'), mk('same', '20'), mk('same', '21'),
    ];
    const seq = buildHunkSequence(changes);
    const hunks = seq.filter((s) => s.type === 'hunk');
    expect(hunks.length).toBe(2);
    expect(hunks[0]).toMatchObject({ count: 1, from: 0, to: 1 });
    // 变更 4 → 显示到 7;变更 17 → 显示从 14 起;折叠段 [8, 14)
    const mid = hunks.find((h) => h.from === 8);
    expect(mid).toMatchObject({ to: 14, count: 6 });
  });

  it('头部未变化段折叠为 hunk(可展开查看文件开头)', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
      mk('removed', '6'), mk('added', '7'),
      mk('same', '8'), mk('same', '9'),
    ];
    const seq = buildHunkSequence(changes);
    // 头部 idx0-1 折叠为 hunk;尾部 idx7-8 是变更块上下文(不足折叠)
    expect(seq[0]).toMatchObject({ type: 'hunk', count: 2, from: 0, to: 2 });
    expect(seq[1].idx).toBe(2); // 头部 hunk 之后从变更块上下文开始
    expect(seq.filter((s) => s.type === 'hunk').length).toBe(1);
  });

  it('上下文行数等于 DIFF_CONTEXT_LINES 常量', () => {
    expect(DIFF_CONTEXT_LINES).toBe(3);
  });
});
