/**
 * 编辑器内联 diff 标记工具(对齐旧版 FilePreviewDiff.js)
 *
 * 在 CM6 编辑器中标记 AI 对文件的修改,供 FilePreviewEditor 注入:
 *   - 整行淡背景(decoration):淡绿 = 新增/修改,淡红 = 删除锚点
 *   - 行号旁 gutter 竖条(gutter marker):绿条 = 新增(added),蓝条 = 修改(modified)
 *   - 滚动条整文色带(overview):右侧色块展示全文件改动分布
 *
 * 与 /api/diff/original 返回的原始内容(基线)做差:
 *   added        该行是纯新增(无对应旧行)
 *   modified     该行被改写
 *   deleted      该行附近被删除(锚定"删除发生处"的当前文档行,滚动条色带画短红块)
 */
import { type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, gutter, type DecorationSet, GutterMarker } from '@codemirror/view';

/** 大文件保护上限:超过则跳过 diff(避免阻塞 UI) */
const MAX_DIFF_LINES = 200000;
/** 小文件用 Myers 最优,大文件用线性扫描 */
const MYERS_MAX_LINES = 2000;

export type DiffLineType = 'added' | 'modified' | 'deleted';

/** 行变更信息(1-based 行号 → 变更类型 + 改前文本) */
export interface DiffLineInfo {
  type: DiffLineType;
  /** added 时为 null;modified 时为改前文本;deleted 时为被删行文本(\n 连接) */
  origText: string | null;
}

/** 变更序列项 */
interface EditOp {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/**
 * 计算 diff,返回 decoration set + 行变更信息 map。
 * originalContent 为 null 时返回空的 decoSet 与 null lineInfo。
 */
export function computeDiffInfo(
  doc: EditorState['doc'],
  originalContent: string | null | undefined,
): { decoSet: DecorationSet; lineInfo: Map<number, DiffLineInfo> | null } {
  if (originalContent == null) {
    return { decoSet: Decoration.none, lineInfo: null };
  }
  const origLines = originalContent.split('\n');
  const curLines = doc.toString().split('\n');

  // 内容完全相同 → 无 diff
  if (origLines.length === curLines.length && origLines.every((l, i) => l === curLines[i])) {
    return { decoSet: Decoration.none, lineInfo: null };
  }

  const changes = computeChanges(origLines, curLines);
  if (!changes) return { decoSet: Decoration.none, lineInfo: null };

  const lineInfo = extractLineInfo(changes);
  if (lineInfo.size === 0) return { decoSet: Decoration.none, lineInfo };

  // 构建 decoration set(整行背景)
  const sortedLines = [...lineInfo.entries()].sort((a, b) => a[0] - b[0]);
  const decos: Range<Decoration>[] = [];
  for (const [lineNum, info] of sortedLines) {
    const line = doc.line(lineNum);
    decos.push(Decoration.line({ class: `cm-diff-line-${info.type}` }).range(line.from));
  }

  return {
    decoSet: decos.length > 0 ? Decoration.set(decos) : Decoration.none,
    lineInfo,
  };
}

// ============================================================================
// Diff 算法(Myers + 线性回退,对齐旧版 FilePreviewDiff.js)
// ============================================================================

function computeChanges(origLines: string[], curLines: string[]): EditOp[] | null {
  const N = origLines.length;
  const M = curLines.length;
  if (N + M > MAX_DIFF_LINES) return null;
  if (N + M <= MYERS_MAX_LINES) return computeChangesMyers(origLines, curLines);
  return computeChangesLinear(origLines, curLines);
}

function computeChangesMyers(origLines: string[], curLines: string[]): EditOp[] | null {
  const N = origLines.length;
  const M = curLines.length;
  const max = N + M;
  const size = 2 * max + 1;
  const v = new Int32Array(size);
  const trace: Int32Array[] = [];

  v[max + 1] = 0;
  for (let d = 0; d <= max; d++) {
    const snap = new Int32Array(size);
    for (let k = -d; k <= d; k += 2) {
      const idx = k + max;
      let x: number;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
        x = v[idx + 1];
      } else {
        x = v[idx - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && origLines[x] === curLines[y]) {
        x++;
        y++;
      }
      v[idx] = x;
      snap[idx] = x;
      if (x >= N && y >= M) {
        return backtrackMyers(origLines, curLines, trace, d, k, max);
      }
    }
    trace.push(snap);
  }
  return null;
}

function backtrackMyers(
  origLines: string[],
  curLines: string[],
  trace: Int32Array[],
  lastD: number,
  lastK: number,
  max: number,
): EditOp[] {
  const N = origLines.length;
  const M = curLines.length;
  const script: EditOp[] = [];
  let d = lastD;
  let k = lastK;
  let x = N;
  let y = M;

  for (; d > 0; d--) {
    const snap = trace[d - 1];
    const idx = k + max;
    const prevK = k === -d || (k !== d && snap[idx - 1] < snap[idx + 1]) ? k + 1 : k - 1;
    const prevX = snap[prevK + max];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      script.unshift({ type: 'equal', text: origLines[x - 1] });
      x--;
      y--;
    }
    if (x === prevX) {
      script.unshift({ type: 'insert', text: curLines[y - 1] });
      y--;
    } else {
      script.unshift({ type: 'delete', text: origLines[x - 1] });
      x--;
    }
    k = prevK;
  }

  while (x > 0 && y > 0) {
    script.unshift({ type: 'equal', text: origLines[x - 1] });
    x--;
    y--;
  }
  while (x > 0) {
    script.unshift({ type: 'delete', text: origLines[x - 1] });
    x--;
  }
  while (y > 0) {
    script.unshift({ type: 'insert', text: curLines[y - 1] });
    y--;
  }
  return script;
}

const LINEAR_LOOKAHEAD = 50;

function computeChangesLinear(origLines: string[], curLines: string[]): EditOp[] {
  const changes: EditOp[] = [];
  let i = 0;
  let j = 0;
  const N = origLines.length;
  const M = curLines.length;

  while (i < N && j < M) {
    if (origLines[i] === curLines[j]) {
      changes.push({ type: 'equal', text: origLines[i] });
      i++;
      j++;
      continue;
    }
    let foundMatch = false;
    const maxK = Math.min(LINEAR_LOOKAHEAD, Math.max(N - i, M - j));
    for (let k = 1; k <= maxK && !foundMatch; k++) {
      if (i + k < N && origLines[i + k] === curLines[j]) {
        for (let dd = 0; dd < k; dd++) changes.push({ type: 'delete', text: origLines[i + dd] });
        i += k;
        foundMatch = true;
      } else if (j + k < M && origLines[i] === curLines[j + k]) {
        for (let ii = 0; ii < k; ii++) changes.push({ type: 'insert', text: curLines[j + ii] });
        j += k;
        foundMatch = true;
      }
    }
    if (!foundMatch) {
      changes.push({ type: 'delete', text: origLines[i] });
      changes.push({ type: 'insert', text: curLines[j] });
      i++;
      j++;
    }
  }
  while (i < N) {
    changes.push({ type: 'delete', text: origLines[i] });
    i++;
  }
  while (j < M) {
    changes.push({ type: 'insert', text: curLines[j] });
    j++;
  }
  return changes;
}

/**
 * 从编辑脚本提取当前文档行的变更信息。
 * added/modified/deleted 语义对齐旧版 extractLineInfo。
 */
function extractLineInfo(changes: EditOp[]): Map<number, DiffLineInfo> {
  const info = new Map<number, DiffLineInfo>();
  let curIdx = 1;
  let pendingDeletes: string[] = [];
  const flushDeletes = (atLine: number) => {
    if (pendingDeletes.length === 0) return;
    info.set(atLine, { type: 'deleted', origText: pendingDeletes.join('\n') });
    pendingDeletes = [];
  };
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.type === 'equal') {
      flushDeletes(curIdx);
      curIdx++;
    } else if (c.type === 'delete') {
      pendingDeletes.push(c.text);
    } else {
      const origText = pendingDeletes.length > 0 ? pendingDeletes.shift()! : null;
      info.set(curIdx, { type: origText != null ? 'modified' : 'added', origText });
      curIdx++;
    }
  }
  flushDeletes(curIdx);
  return info;
}

// ============================================================================
// Gutter 竖条标记(IDE 式)
// ============================================================================

class DiffGutterMarker extends GutterMarker {
  private type: DiffLineType;
  constructor(type: DiffLineType) {
    super();
    this.type = type;
  }
  eq(other: GutterMarker): boolean {
    return other instanceof DiffGutterMarker && other.type === this.type;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div');
    el.className = `cm-diff-gutter-marker ${this.type}`;
    return el;
  }
}

/** 构建 gutter 扩展(行号旁竖条);deleted 不画竖条 */
export function buildDiffGutter(lineInfo: Map<number, DiffLineInfo> | null): Extension[] {
  if (!lineInfo || lineInfo.size === 0) return [];
  return [
    gutter({
      class: 'cm-diff-gutter',
      lineMarker: (view, line) => {
        const info = lineInfo.get(view.state.doc.lineAt(line.from).number);
        return info && info.type !== 'deleted' ? new DiffGutterMarker(info.type) : null;
      },
    }),
  ];
}

// ============================================================================
// 滚动条整文色带(overview)
// ============================================================================

export interface OverviewLineBlock {
  top: number;
  bottom: number;
  type: DiffLineType;
}

export interface OverviewMarker {
  top: number;
  height: number;
  type: DiffLineType;
}

const OVERVIEW_MIN_HEIGHT = 2;
const OVERVIEW_MERGE_GAP = 1;

/**
 * 计算滚动条色带的色块(纯函数,归一化到色带坐标并合并相邻同类型块)。
 */
export function computeOverviewMarkers(
  lineBlocks: OverviewLineBlock[] | null,
  docHeight: number,
  stripHeight: number,
): OverviewMarker[] {
  if (!lineBlocks || lineBlocks.length === 0) return [];
  if (!(docHeight > 0) || !(stripHeight > 0)) return [];

  const scale = stripHeight / docHeight;
  const raw: OverviewMarker[] = [];
  for (const lb of lineBlocks) {
    if (lb == null || !(lb.bottom > lb.top)) continue;
    let top = lb.top * scale;
    let height = Math.max(OVERVIEW_MIN_HEIGHT, (lb.bottom - lb.top) * scale);
    if (top + height > stripHeight) {
      top = Math.max(0, stripHeight - height);
    }
    raw.push({ top, height, type: lb.type });
  }
  if (raw.length === 0) return [];

  const merged: OverviewMarker[] = [];
  for (const b of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === b.type && b.top - (last.top + last.height) < OVERVIEW_MERGE_GAP) {
      last.height = Math.round(Math.max(last.height, b.top + b.height - last.top) * 1000) / 1000;
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}