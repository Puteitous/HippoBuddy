/**
 * FileDiffView 词级 diff / 折叠算法单元测试
 *
 * 覆盖：
 *   - buildHunkSequence：git 式折叠（重叠块合并、远距离折叠、开头/末尾丢弃）
 *   - FileDiffView._renderWordLine：行内词级标记 HTML
 *   - 行号映射（oldNumAt / newNumAt 语义）与词级索引对齐
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHunkSequence, splitHighlightedLines, DIFF_CONTEXT_LINES } from '../../main/resources/static/js/components/FileDiffView.js';
import { FileDiffView } from '../../main/resources/static/js/components/FileDiffView.js';

// ── buildHunkSequence 折叠 ─────────────────────────────

describe('buildHunkSequence', () => {
  const mk = (type, content) => ({ type, content });

  it('无变更时全部折叠（头部/末尾丢弃）', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
    ];
    const seq = buildHunkSequence(changes);
    expect(seq).toEqual([]);
  });

  it('单个变更块保留前后上下文', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
      mk('removed', '6'), mk('added', '7'),
      mk('same', '8'), mk('same', '9'), mk('same', '10'), mk('same', '11'), mk('same', '12'),
    ];
    const seq = buildHunkSequence(changes);
    // 变更行下标 5,6 → 显示范围 [5-3, 6+3] = [2, 9]
    const types = seq.map(s => s.type);
    expect(types).toEqual(['same', 'same', 'same', 'removed', 'added', 'same', 'same', 'same']);
    expect(seq.map(s => s.idx)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('相邻变更块合并（中间未变化段不足 2*context 时不再折叠）', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'),
      mk('removed', '5'),
      mk('same', '6'), mk('same', '7'),
      mk('added', '8'),
      mk('same', '9'), mk('same', '10'),
    ];
    const seq = buildHunkSequence(changes);
    // 变更 4 与 7 的上下文重叠 → 不产生 hunk
    expect(seq.some(s => s.type === 'hunk')).toBe(false);
  });

  it('远距离变更块之间折叠为 hunk 项（from/to 指向原始下标）', () => {
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
    const hunks = seq.filter(s => s.type === 'hunk');
    expect(hunks.length).toBe(1);
    const hunk = hunks[0];
    // 变更 4 → 显示到 7；变更 17 → 显示从 14 起；折叠段 [8, 14)
    expect(hunk.from).toBe(8);
    expect(hunk.to).toBe(14);
    expect(hunk.count).toBe(6);
  });

  it('头部未变化段直接丢弃（与 git 一致）', () => {
    const changes = [
      mk('same', '1'), mk('same', '2'), mk('same', '3'), mk('same', '4'), mk('same', '5'),
      mk('removed', '6'), mk('added', '7'),
      mk('same', '8'), mk('same', '9'),
    ];
    const seq = buildHunkSequence(changes);
    expect(seq[0].idx).toBe(2); // 不从 0 开始
    expect(seq.some(s => s.type === 'hunk')).toBe(false); // 尾部不足 context 不折叠
  });

  it('上下文行数等于 DIFF_CONTEXT_LINES 常量', () => {
    expect(DIFF_CONTEXT_LINES).toBe(3);
  });
});

// ── _renderWordLine 词级标记 ────────────────────────────

describe('FileDiffView._renderWordLine', () => {
  let view;

  beforeEach(() => {
    const container = document.createElement('div');
    view = new FileDiffView(container);
  });

  it('removed 行：delete 词包 del，equal 原样', () => {
    const html = view._renderWordLine([
      { type: 'equal', value: 'const ' },
      { type: 'delete', value: 'foo' },
      { type: 'equal', value: ' = 1;' },
    ], 'removed');
    expect(html).toBe('const <del class="diff-word-del">foo</del> = 1;');
  });

  it('added 行：insert 词包 ins，equal 原样', () => {
    const html = view._renderWordLine([
      { type: 'equal', value: 'const ' },
      { type: 'insert', value: 'bar' },
      { type: 'equal', value: ' = 1;' },
    ], 'added');
    expect(html).toBe('const <ins class="diff-word-ins">bar</ins> = 1;');
  });

  it('全 equal 行：无标记', () => {
    const html = view._renderWordLine([
      { type: 'equal', value: 'hello' },
      { type: 'equal', value: ' world' },
    ], 'removed');
    expect(html).toBe('hello world');
  });

  it('特殊字符被转义，标记仍生效', () => {
    const html = view._renderWordLine([
      { type: 'delete', value: '<tag>&"' },
    ], 'removed');
    expect(html).toBe('<del class="diff-word-del">&lt;tag&gt;&amp;&quot;</del>');
  });

  it('空数组/空 token 安全返回', () => {
    expect(view._renderWordLine([], 'added')).toBe('');
    expect(view._renderWordLine(null, 'removed')).toBe('');
  });

  it('insert 词出现在 removed 行时按普通文本输出（防御）', () => {
    const html = view._renderWordLine([
      { type: 'insert', value: 'x' },
    ], 'removed');
    expect(html).toBe('x');
  });
});

// ── "在编辑器中打开"按钮回调 ───────────────────────────

describe('FileDiffView onOpenInEditor', () => {
  it('点击按钮触发 onOpenInEditor 回调并携带当前文件路径（无 diff 数据时 line 为 null）', async () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    const view = new FileDiffView(container, { onOpenInEditor: onOpen });

    // 模拟 load 设置当前文件（复用真实 load 的数据流）
    view._currentFilePath = 'src/app.js';
    view._openEditorBtn.click();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('src/app.js', null);
  });

  it('首个变更行为 added 时携带其新文件行号', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    const view = new FileDiffView(container, { onOpenInEditor: onOpen });
    view._currentFilePath = 'src/app.js';
    // changes: same(1) → added(2) → removed，首个变更 added 的新行号 = 2
    view._currentDiffData = {
      overall: true,
      changes: [
        { type: 'same', content: 'a' },
        { type: 'added', content: 'b' },
        { type: 'removed', content: 'c' },
      ],
    };
    view._openEditorBtn.click();
    expect(onOpen).toHaveBeenCalledWith('src/app.js', 2);
  });

  it('首个变更行为 removed 时定位到其后第一个新文件行的行号', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    const view = new FileDiffView(container, { onOpenInEditor: onOpen });
    view._currentFilePath = 'src/app.js';
    // changes: removed → same(1) → added(2)，删除点后第一行 same 的新行号 = 1
    view._currentDiffData = {
      overall: true,
      changes: [
        { type: 'removed', content: 'old' },
        { type: 'same', content: 'keep' },
        { type: 'added', content: 'new' },
      ],
    };
    view._openEditorBtn.click();
    expect(onOpen).toHaveBeenCalledWith('src/app.js', 1);
  });

  it('文件被删空（仅 removed 行）时 line 为 null', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    const view = new FileDiffView(container, { onOpenInEditor: onOpen });
    view._currentFilePath = 'src/app.js';
    view._currentDiffData = {
      changes: [
        { type: 'removed', content: 'a' },
        { type: 'removed', content: 'b' },
      ],
    };
    view._openEditorBtn.click();
    expect(onOpen).toHaveBeenCalledWith('src/app.js', null);
  });

  it('未提供 onOpenInEditor 时点击按钮不报错', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    view._currentFilePath = 'src/app.js';
    expect(() => view._openEditorBtn.click()).not.toThrow();
  });

  it('无当前文件时点击不触发回调', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    const view = new FileDiffView(container, { onOpenInEditor: onOpen });
    view._openEditorBtn.click();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

// ── splitHighlightedLines 跨行高亮切分 ─────────────────

describe('splitHighlightedLines', () => {
  it('单行无嵌套', () => {
    const html = '<span class="hljs-keyword">const</span> a';
    expect(splitHighlightedLines(html)).toEqual(['<span class="hljs-keyword">const</span> a']);
  });

  it('跨行 token 行尾补 </span>、行首重开同 class span', () => {
    const html = '<span class="hljs-string">line1\nline2</span>';
    const lines = splitHighlightedLines(html);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('<span class="hljs-string">line1</span>');
    expect(lines[1]).toBe('<span class="hljs-string">line2</span>');
  });
});

// ── 行号映射与词级索引对齐 ──────────────────────────────

describe('行号映射语义（oldNumAt/newNumAt 与词级索引一致）', () => {
  /**
   * 复刻 _renderDiff 中整体视图的行号映射算法，验证：
   * 行号从 1 开始、removed 用旧行号、added 用新行号、same 两表都有。
   * 该算法与后端 wordDiff 的 {old, new} 行组织互为索引契约。
   */
  function buildNumAt(changes) {
    const oldNumAt = new Map();
    const newNumAt = new Map();
    let o = 1, n = 1;
    for (let k = 0; k < changes.length; k++) {
      const t = changes[k].type;
      if (t === 'removed') { oldNumAt.set(k, o); o++; }
      else if (t === 'added') { newNumAt.set(k, n); n++; }
      else { oldNumAt.set(k, o); newNumAt.set(k, n); o++; n++; }
    }
    return { oldNumAt, newNumAt };
  }

  it('修改/删除/插入混合时行号与文件真实行对齐', () => {
    // 旧文件：L1 L2 L3 L4  新文件：L1 L2' L4 L5
    const changes = [
      { type: 'same', content: 'L1' },
      { type: 'removed', content: 'L2' },
      { type: 'added', content: 'L2p' },
      { type: 'same', content: 'L4' },
      { type: 'added', content: 'L5' },
    ];
    const { oldNumAt, newNumAt } = buildNumAt(changes);
    expect(oldNumAt.get(0)).toBe(1);
    expect(oldNumAt.get(1)).toBe(2);
    expect(oldNumAt.get(2)).toBe(undefined); // added 无旧行号
    expect(newNumAt.get(1)).toBe(undefined); // removed 无新行号
    expect(newNumAt.get(2)).toBe(2);
    expect(newNumAt.get(3)).toBe(3);
    expect(newNumAt.get(4)).toBe(4);
    // removed 用旧行号、added 用新行号 → 词级索引（wordDiff.old[行-1] / wordDiff.new[行-1]）必然命中
    expect(oldNumAt.get(1)).toBe(2);
    expect(newNumAt.get(2)).toBe(2);
  });

  it('展开段上下文行号与后续变更块衔接', () => {
    // 10 行 same 中夹一个变更，变更后续块行号连续
    const changes = [];
    for (let i = 1; i <= 10; i++) changes.push({ type: 'same', content: 'L' + i });
    changes.push({ type: 'removed', content: 'R' });
    changes.push({ type: 'added', content: 'A' });
    const { oldNumAt, newNumAt } = buildNumAt(changes);
    expect(oldNumAt.get(9)).toBe(10);   // 第 10 行 same
    expect(oldNumAt.get(10)).toBe(11);  // removed = 旧文件第 11 行
    expect(newNumAt.get(11)).toBe(11);  // added = 新文件第 11 行
  });
});

// ── 展开全部 / 收起全部 ──────────────────────────────

describe('FileDiffView 展开全部 / 收起全部', () => {
  /** 两个远距离变更块 → 产生 1 个折叠段（整体视图数据） */
  function twoHunkData() {
    const changes = [];
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'H' + i });
    changes.push({ type: 'added', content: 'A1' });
    for (let i = 0; i < 10; i++) changes.push({ type: 'same', content: 'M' + i });
    changes.push({ type: 'added', content: 'A2' });
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'T' + i });
    return { overall: true, changes };
  }

  it('有折叠段时渲染工具条按钮（展开全部动作）', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    view._renderDiff(twoHunkData());
    const btn = container.querySelector('.diff-toolbar-btn');
    expect(btn).toBeTruthy();
    expect(btn.dataset.action).toBe('expand');
  });

  it('无折叠段时不渲染工具条', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    // 单变更块，无 hunk
    const changes = [];
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'L' + i });
    changes.push({ type: 'added', content: 'A' });
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'T' + i });
    view._renderDiff({ overall: true, changes });
    expect(container.querySelector('.diff-toolbar-btn')).toBeNull();
  });

  it('展开全部 → 收起全部闭环：状态与按钮动作切换', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    view._renderDiff(twoHunkData());

    // 展开全部
    container.querySelector('.diff-toolbar-btn').click();
    expect(view._expandedHunks.size).toBe(1);
    expect(container.querySelector('.diff-toolbar-btn').dataset.action).toBe('collapse');

    // 收起全部
    container.querySelector('.diff-toolbar-btn').click();
    expect(view._expandedHunks.size).toBe(0);
    expect(container.querySelector('.diff-toolbar-btn').dataset.action).toBe('expand');
  });

  it('全部折叠段超限时展开全部不展开并 toast 提示', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    // 两个变更块之间夹 3010 行未变化 → 折叠段 count 3004 > 3000 超限
    const changes = [];
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'H' + i });
    changes.push({ type: 'added', content: 'A1' });
    for (let i = 0; i < 3010; i++) changes.push({ type: 'same', content: 'M' + i });
    changes.push({ type: 'added', content: 'A2' });
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'T' + i });
    view._renderDiff({ overall: true, changes });
    view._expandAllHunks();
    expect(view._expandedHunks.size).toBe(0); // 超限段未被展开
  });

  it('混合场景：可展开段 + 超限段 → 展开全部只展开可展开段', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    // 变更块1 → 8 行 same → 变更块2 → 3010 行 same → 变更块3
    // hunk1（块1~块2 之间）count 2 可展开；hunk2（块2~块3 之间）count 3004 超限
    const changes = [];
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'H' + i });
    changes.push({ type: 'added', content: 'A1' });
    for (let i = 0; i < 8; i++) changes.push({ type: 'same', content: 'M1_' + i });
    changes.push({ type: 'added', content: 'A2' });
    for (let i = 0; i < 3010; i++) changes.push({ type: 'same', content: 'M2_' + i });
    changes.push({ type: 'added', content: 'A3' });
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'T' + i });
    view._renderDiff({ overall: true, changes });
    view._expandAllHunks();
    // 只展开了可展开的 hunk1（超限的 hunk2 被跳过）
    expect(view._expandedHunks.size).toBe(1);
  });

  it('多段时展开全部覆盖所有可展开段', () => {
    const container = document.createElement('div');
    const view = new FileDiffView(container);
    // 三个远距离变更块 → 2 个折叠段
    const changes = [];
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'H' + i });
    changes.push({ type: 'added', content: 'A1' });
    for (let i = 0; i < 10; i++) changes.push({ type: 'same', content: 'M1_' + i });
    changes.push({ type: 'added', content: 'A2' });
    for (let i = 0; i < 10; i++) changes.push({ type: 'same', content: 'M2_' + i });
    changes.push({ type: 'removed', content: 'R' });
    for (let i = 0; i < 3; i++) changes.push({ type: 'same', content: 'T' + i });
    view._renderDiff({ overall: true, changes });
    view._expandAllHunks();
    expect(view._expandedHunks.size).toBe(2); // 2 个折叠段全部展开
  });
});
