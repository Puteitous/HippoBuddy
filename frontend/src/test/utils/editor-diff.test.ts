import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { computeDiffInfo, computeOverviewMarkers } from '@/utils/editor-diff';

describe('computeOverviewMarkers', () => {
  it('空输入返回空数组', () => {
    expect(computeOverviewMarkers(null, 100, 100)).toEqual([]);
    expect(computeOverviewMarkers([], 100, 100)).toEqual([]);
  });

  it('docHeight 或 stripHeight 非正数时返回空数组', () => {
    expect(computeOverviewMarkers([{ top: 0, bottom: 10, type: 'added' }], 0, 100)).toEqual([]);
    expect(computeOverviewMarkers([{ top: 0, bottom: 10, type: 'added' }], 100, 0)).toEqual([]);
  });

  it('normalized bug block：无效 block（bottom <= top）被跳过', () => {
    expect(
      computeOverviewMarkers([{ top: 5, bottom: 5, type: 'added' }], 100, 100),
    ).toEqual([]);
  });

  it('按比例缩放坐标', () => {
    const result = computeOverviewMarkers(
      [{ top: 0, bottom: 10, type: 'added' }],
      100,
      50,
    );
    expect(result).toEqual([{ top: 0, height: 5, type: 'added' }]);
  });

  it('块高度低于最小 2px 时抬升到 2px', () => {
    // 原始高度 1px 会被抬到 2px
    const result = computeOverviewMarkers(
      [{ top: 0, bottom: 20, type: 'added' }],
      200,
      10,
    );
    expect(result[0].height).toBe(2);
  });

  it('超出色带底部时 clamp 回 strip 内', () => {
    const result = computeOverviewMarkers(
      [{ top: 98, bottom: 100, type: 'deleted' }],
      100,
      50,
    );
    // scale=0.5 → top 49, height max(2,1)=2 → 49+2=51>50 → top=48
    expect(result).toEqual([{ top: 48, height: 2, type: 'deleted' }]);
  });

  it('相邻同类型块合并', () => {
    const result = computeOverviewMarkers(
      [
        { top: 0, bottom: 10, type: 'added' },
        { top: 10, bottom: 15, type: 'added' },
      ],
      100,
      100,
    );
    expect(result).toEqual([{ top: 0, height: 15, type: 'added' }]);
  });

  it('不同类别块不合并', () => {
    const result = computeOverviewMarkers(
      [
        { top: 0, bottom: 10, type: 'added' },
        { top: 10, bottom: 15, type: 'deleted' },
      ],
      100,
      100,
    );
    expect(result).toEqual([
      { top: 0, height: 10, type: 'added' },
      { top: 10, height: 5, type: 'deleted' },
    ]);
  });
});

describe('computeDiffInfo', () => {
  it('originalContent 为 null 时返回空 decoSet 与 null lineInfo', () => {
    const doc = Text.of(['a']);
    const res = computeDiffInfo(doc, null);
    expect(res.lineInfo).toBeNull();
    expect(res.decoSet).toBe(Decoration.none);
  });

  it('内容完全一致时返回空', () => {
    const doc = Text.of(['a', 'b']);
    const res = computeDiffInfo(doc, 'a\nb');
    expect(res.lineInfo).toBeNull();
    expect(res.decoSet).toBe(Decoration.none);
  });

  it('追加行标记为 added（origText 为 null）', () => {
    // 文档末尾换行:orig 'a\n' → ['a','']，当前 'a\nb\n' → ['a','b','']
    const doc = Text.of(['a', 'b', '']);
    const res = computeDiffInfo(doc, 'a\n');
    expect(res.lineInfo!.get(2)).toEqual({ type: 'added', origText: null });
    expect(res.decoSet).not.toBe(Decoration.none);
  });

  it('改写行标记为 modified（保留改前文本）', () => {
    const doc = Text.of(['a', 'Y', '']);
    const res = computeDiffInfo(doc, 'a\nX\n');
    expect(res.lineInfo!.get(2)).toEqual({ type: 'modified', origText: 'X' });
  });

  it('删除行标记为 deleted（保留被删文本，锚定到当前文档行）', () => {
    // 当前 'a\n' → ['a','']，原 'a\nb\n' → ['a','b','']，deleted 锚定到第 2 行(末尾空行)
    const doc = Text.of(['a', '']);
    const res = computeDiffInfo(doc, 'a\nb\n');
    expect(res.lineInfo!.get(2)).toEqual({ type: 'deleted', origText: 'b' });
  });

  it('连续删除多行合并为单条 deleted 记录', () => {
    const doc = Text.of(['a', 'd']);
    const res = computeDiffInfo(doc, 'a\nb\nc\nd');
    expect(res.lineInfo!.get(2)).toEqual({
      type: 'deleted',
      origText: 'b\nc',
    });
  });
});