/**
 * Diff hunk 折叠工具(纯函数,可单测)
 *
 * 平移旧版 static/js/components/FileDiffView.js 的 buildHunkSequence:
 * 将整文件 diff(含大量 same 上下文行)折叠为 git 风格——每个变更块前后保留
 * DIFF_CONTEXT_LINES 行上下文,连续未变化的段折叠为 hunk 分隔行;
 * 头部/尾部未变化段同样折叠(默认收起,点击可展开查看完整文件)。
 */

/** 整体视图时每个变更块前后保留的上下文行数 */
export const DIFF_CONTEXT_LINES = 3;

/** 单个折叠段允许展开的最大行数,超过则提示无法展开(防大文件渲染卡顿) */
export const HUNK_EXPAND_MAX_LINES = 3000;

/** 行级 diff 行类型(与后端 DiffComputer.computeDiffAsMap 一致) */
export interface DiffHunkLine {
  type: 'same' | 'removed' | 'added';
  content: string;
}

/** 折叠后的显示序列项:普通 diff 行 */
export interface DiffShowLine {
  /** 原始 changes 下标 */
  idx: number;
  type: DiffHunkLine['type'];
  content: string;
}

/** 折叠后的显示序列项:hunk 分隔行 */
export interface DiffHunkMarker {
  idx: -1;
  type: 'hunk';
  /** 折叠段包含的行数 */
  count: number;
  /** 折叠段在原始 changes 中的下标范围 [from, to) */
  from: number;
  to: number;
}

export type DiffDisplayItem = DiffShowLine | DiffHunkMarker;

/**
 * 将整文件 diff 折叠为 git 风格显示序列。
 *
 * @param changes 原始逐行 diff(与后端返回顺序一致)
 * @returns 显示序列;hunk 项的 from/to 为折叠段在原始 changes 中的下标范围,
 *          供"展开上下文"后按原始下标取行。
 */
export function buildHunkSequence(changes: DiffHunkLine[]): DiffDisplayItem[] {
  const n = changes.length;
  const show = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = changes[i].type;
    if (t === 'added' || t === 'removed') {
      for (let j = Math.max(0, i - DIFF_CONTEXT_LINES); j <= Math.min(n - 1, i + DIFF_CONTEXT_LINES); j++) {
        show[j] = true;
      }
    }
  }

  const out: DiffDisplayItem[] = [];
  let i = 0;
  while (i < n) {
    if (show[i]) {
      out.push({ idx: i, type: changes[i].type, content: changes[i].content || '' });
      i++;
    } else {
      let j = i;
      while (j < n && !show[j]) j++;
      // 未显示段(含头部/尾部)一律折叠为 hunk,点击可展开;展开全部时一并对齐
      out.push({ idx: -1, type: 'hunk', count: j - i, from: i, to: j });
      i = j;
    }
  }
  return out;
}
