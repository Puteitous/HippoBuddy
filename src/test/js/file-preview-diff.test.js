/**
 * FilePreviewDiff 内联 diff 行信息提取单元测试
 *
 * 覆盖 extractLineInfo：
 *   - 纯新增（added / origText=null）
 *   - 单行替换（modified / origText=旧行内容）
 *   - 多行删除 + 多行插入配对（FIFO）
 *   - 纯删除（无映射，删除行不在当前文档）
 *   - equal 断开 delete/insert 配对
 *   - 删除/插入数量不齐（多余丢弃 / 多余视为新增）
 *   - 行号推进正确性
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { EditorView, EditorState } from '../../main/resources/static/js/vendor/codemirror.js';
import { extractLineInfo, buildDiffGutter, computeOverviewMarkers } from '../../main/resources/static/js/components/FilePreviewDiff.js';

// CM6 在 jsdom 环境需要 ResizeObserver（EditorView 构造时检测）
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const E = (text) => ({ type: 'equal', text });
const D = (text) => ({ type: 'delete', text });
const I = (text) => ({ type: 'insert', text });

describe('extractLineInfo', () => {
  it('纯新增行标记为 added，origText 为 null', () => {
    const info = extractLineInfo([E('a'), I('b'), E('c')]);
    expect(info.size).toBe(1);
    expect(info.get(2)).toEqual({ type: 'added', origText: null });
  });

  it('单行替换标记为 modified，origText 为旧行内容', () => {
    const info = extractLineInfo([E('a'), D('old'), I('new'), E('c')]);
    expect(info.size).toBe(1);
    expect(info.get(2)).toEqual({ type: 'modified', origText: 'old' });
  });

  it('多行删除 + 多行插入按 FIFO 配对', () => {
    const info = extractLineInfo([
      E('a'),
      D('o1'), D('o2'),
      I('n1'), I('n2'),
      E('b'),
    ]);
    expect(info.size).toBe(2);
    expect(info.get(2)).toEqual({ type: 'modified', origText: 'o1' });
    expect(info.get(3)).toEqual({ type: 'modified', origText: 'o2' });
  });

  it('纯删除行产生 deleted 锚点（中间删除锚定 equal 行）', () => {
    const info = extractLineInfo([E('a'), D('o'), E('b')]);
    expect(info.size).toBe(1);
    // 删除发生在第 2 行（equal b 处）→ 锚点 = 2
    expect(info.get(2)).toEqual({ type: 'deleted', origText: 'o' });
  });

  it('equal 行断开 delete/insert 配对：两侧是独立变更', () => {
    const info = extractLineInfo([D('o'), E('x'), I('n')]);
    expect(info.size).toBe(2);
    // equal 前的 delete 为纯删除 → 锚点 = 1（equal x 行）
    expect(info.get(1)).toEqual({ type: 'deleted', origText: 'o' });
    // delete 与 insert 被 equal 隔开 → insert 视为纯新增
    expect(info.get(2)).toEqual({ type: 'added', origText: null });
  });

  it('删除多于插入：多余删除产生 deleted 锚点，insert 仍为 modified', () => {
    const info = extractLineInfo([D('o1'), D('o2'), I('n')]);
    expect(info.size).toBe(2);
    expect(info.get(1)).toEqual({ type: 'modified', origText: 'o1' });
    // 末尾残留删除锚点 = 下一行（2），不覆盖行 1 的 modified
    expect(info.get(2)).toEqual({ type: 'deleted', origText: 'o2' });
  });

  it('文件末尾删除：锚点为当前文档下一行（色带侧 clamp 到末尾）', () => {
    const info = extractLineInfo([E('a'), D('b'), D('c')]);
    expect(info.size).toBe(1);
    // 文档当前仅 1 行（a），删除锚点 = curIdx = 2（越界由色带侧处理）
    expect(info.get(2)).toEqual({ type: 'deleted', origText: 'b\nc' });
  });

  it('全删空文档：锚点 clamp 到 1', () => {
    const info = extractLineInfo([D('a'), D('b')]);
    expect(info.size).toBe(1);
    expect(info.get(1)).toEqual({ type: 'deleted', origText: 'a\nb' });
  });

  it('插入多于删除：多余 insert 视为新增', () => {
    const info = extractLineInfo([D('o'), I('n1'), I('n2')]);
    expect(info.size).toBe(2);
    expect(info.get(1)).toEqual({ type: 'modified', origText: 'o' });
    expect(info.get(2)).toEqual({ type: 'added', origText: null });
  });

  it('多组变更行号正确推进', () => {
    const info = extractLineInfo([
      I('a'), // 行1：新增
      E('x'), // 行2：未变
      D('o'), // 删除行（不占行号）
      I('n'), // 行3：修改
    ]);
    expect(info.size).toBe(2);
    expect(info.get(1)).toEqual({ type: 'added', origText: null });
    expect(info.get(3)).toEqual({ type: 'modified', origText: 'o' });
  });

  it('null / 空数组返回空 Map', () => {
    expect(extractLineInfo(null).size).toBe(0);
    expect(extractLineInfo([]).size).toBe(0);
  });

  it('文件开头即删除（无 equal）也能正确配对', () => {
    const info = extractLineInfo([D('old'), I('new'), E('tail')]);
    expect(info.get(1)).toEqual({ type: 'modified', origText: 'old' });
  });
});

describe('buildDiffGutter', () => {
  it('null / 空 lineInfo 返回空数组（无 gutter 扩展注入）', () => {
    expect(buildDiffGutter(null)).toEqual([]);
    expect(buildDiffGutter(new Map())).toEqual([]);
  });

  it('有变更时返回非空扩展数组（含 gutter 配置）', () => {
    const lineInfo = new Map([[2, { type: 'added', origText: null }]]);
    const ext = buildDiffGutter(lineInfo);
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBeGreaterThan(0);
  });

  it('真实渲染：变更行生成 .cm-diff-gutter-marker 竖条（added/modified 分色）', () => {
    // 回归测试：lineMarker 的 line 是 BlockInfo（无 .number），
    // 必须用 lineAt(line.from).number 定位行号，否则所有 marker 返回 null、竖条不渲染
    const host = document.createElement('div');
    host.style.height = '500px';
    host.style.width = '500px';
    document.body.appendChild(host);

    const lineInfo = new Map([
      [1, { type: 'added', origText: null }],
      [3, { type: 'modified', origText: 'old' }],
    ]);
    const view = new EditorView({
      state: EditorState.create({
        doc: 'line1\nline2\nline3\nline4',
        extensions: [...buildDiffGutter(lineInfo)],
      }),
      parent: host,
    });

    const markers = host.querySelectorAll('.cm-diff-gutter-marker');
    const classes = [...markers].map((m) => m.className).sort();
    expect(classes).toEqual(['cm-diff-gutter-marker added', 'cm-diff-gutter-marker modified']);

    view.destroy();
    host.remove();
  });
});

describe('computeOverviewMarkers', () => {
  it('null / 空输入 / 非法尺寸返回空数组', () => {
    expect(computeOverviewMarkers(null, 100, 100)).toEqual([]);
    expect(computeOverviewMarkers([], 100, 100)).toEqual([]);
    expect(computeOverviewMarkers([{ top: 0, bottom: 10, type: 'added' }], 0, 100)).toEqual([]);
    expect(computeOverviewMarkers([{ top: 0, bottom: 10, type: 'added' }], 100, 0)).toEqual([]);
  });

  it('单块：按文档比例归一化到色带坐标', () => {
    // 文档高 1000 → 色带高 100；行 top 100 bottom 200 → 色带 top 10 height 10
    const markers = computeOverviewMarkers(
      [{ top: 100, bottom: 200, type: 'added' }],
      1000, 100
    );
    expect(markers.length).toBe(1);
    expect(markers[0].top).toBeCloseTo(10, 5);
    expect(markers[0].height).toBeCloseTo(10, 5);
    expect(markers[0].type).toBe('added');
  });

  it('极小高度块提升到最小 2px（再小的行在色带上不可见）', () => {
    // 1000 行文档中的 1 行：height = 1 * 0.1 = 0.1 → 提升为 2
    const markers = computeOverviewMarkers(
      [{ top: 500, bottom: 501, type: 'modified' }],
      1000, 100
    );
    expect(markers.length).toBe(1);
    expect(markers[0].height).toBe(2);
  });

  it('相邻同类型块合并成连续段', () => {
    const markers = computeOverviewMarkers([
      { top: 100, bottom: 101, type: 'added' },
      { top: 101, bottom: 102, type: 'added' },
    ], 1000, 100);
    expect(markers.length).toBe(1);
    // 两行各提升到最小 2px，top 相差 0.1 → 合并后段高 2.1
    expect(markers[0].type).toBe('added');
    expect(markers[0].top).toBeCloseTo(10, 5);
    expect(markers[0].height).toBe(2.1);
  });

  it('不同类型相邻块不合并（保留 added/modified 颜色语义）', () => {
    const markers = computeOverviewMarkers([
      { top: 100, bottom: 101, type: 'added' },
      { top: 101, bottom: 102, type: 'modified' },
    ], 1000, 100);
    expect(markers.length).toBe(2);
    expect(markers[0].type).toBe('added');
    expect(markers[1].type).toBe('modified');
  });

  it('deleted 类型透传且不与其他类型合并（红块独立语义）', () => {
    const markers = computeOverviewMarkers([
      { top: 100, bottom: 102, type: 'deleted' },
      { top: 102, bottom: 103, type: 'added' },
    ], 1000, 100);
    expect(markers.length).toBe(2);
    expect(markers[0].type).toBe('deleted');
    expect(markers[1].type).toBe('added');
    // 归一化坐标正确（top 100 → 10）
    expect(markers[0].top).toBeCloseTo(10, 5);
  });

  it('间隙 >= 1px 的同类型块不合并（保留视觉间隙）', () => {
    const markers = computeOverviewMarkers([
      { top: 100, bottom: 110, type: 'added' },
      { top: 130, bottom: 140, type: 'added' },
    ], 1000, 100);
    expect(markers.length).toBe(2);
  });

  it('底部越界时色块收回色带内（贴近底边，不溢出）', () => {
    // top 990 bottom 1010 → 归一化 top 99 height 2 → 99+2=101 > 100 → top 回收为 98
    const markers = computeOverviewMarkers(
      [{ top: 990, bottom: 1010, type: 'added' }],
      1000, 100
    );
    expect(markers.length).toBe(1);
    expect(markers[0].top + markers[0].height).toBeLessThanOrEqual(100);
  });

  it('多块混合：位置保持输入顺序且各自独立', () => {
    const markers = computeOverviewMarkers([
      { top: 100, bottom: 200, type: 'modified' },
      { top: 500, bottom: 600, type: 'added' },
    ], 1000, 100);
    expect(markers.length).toBe(2);
    expect(markers[0].top).toBeCloseTo(10, 5);
    expect(markers[1].top).toBeCloseTo(50, 5);
    expect(markers[0].type).toBe('modified');
    expect(markers[1].type).toBe('added');
  });
});
