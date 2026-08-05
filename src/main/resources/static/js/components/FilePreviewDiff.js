/**
 * FilePreviewDiff — CodeMirror 6 内联 diff 标记工具函数
 *
 * 在编辑器中通过行背景色标记 AI 对文件的修改：
 * - 淡绿色背景 = AI 影响的行（新增或修改）
 *
 * 不做上下文行、不做合并块，只精确显示 Myers 算法算出的最小编辑行。
 * 绿 = AI 实际改了，无色 = 没改，清楚无歧义。
 *
 * 用户如需查看精确的逐行 diff（+/-），可点击工具卡片"查看变更"。
 *
 * 用法：
 *   import { computeDiffDecorations } from './FilePreviewDiff.js'
 *   const decoSet = computeDiffDecorations(view.state.doc, originalContent)
 *   view.dispatch({ effects: compartment.reconfigure(EditorView.decorations.of(decoSet)) })
 */

import {
  Decoration,
  gutter,
  GutterMarker,
} from '../vendor/codemirror.js'

// ── Diff 算法 ────────────────────────────────────────
// 在 origLines 和 curLines 之间计算编辑脚本，返回变更序列。
//
// 采用两级策略：
//   小文件（N+M ≤ MYERS_MAX_LINES）→ Myers 最优编辑脚本
//   大文件 → 线性扫描（O(N+M)，AI 局部编辑场景下结果与 Myers 接近）
//
// 安全上限 MAX_DIFF_LINES 作为兜底保护，超过则跳过 diff。

const MAX_DIFF_LINES = 200000
const MYERS_MAX_LINES = 2000

function computeChanges(origLines, curLines) {
  const N = origLines.length
  const M = curLines.length
  if (N + M > MAX_DIFF_LINES) return null

  if (N + M <= MYERS_MAX_LINES) {
    return computeChangesMyers(origLines, curLines)
  }
  return computeChangesLinear(origLines, curLines)
}

// ── Myers（小文件最优） ────────────────────────────────

function computeChangesMyers(origLines, curLines) {
  const N = origLines.length
  const M = curLines.length
  const max = N + M
  const size = 2 * max + 1
  const v = new Int32Array(size)
  const trace = []

  v[max + 1] = 0
  for (let d = 0; d <= max; d++) {
    const snap = new Int32Array(size)
    for (let k = -d; k <= d; k += 2) {
      const idx = k + max
      let x
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
        x = v[idx + 1]
      } else {
        x = v[idx - 1] + 1
      }
      let y = x - k
      while (x < N && y < M && origLines[x] === curLines[y]) {
        x++
        y++
      }
      v[idx] = x
      snap[idx] = x
      if (x >= N && y >= M) {
        return backtrackMyers(origLines, curLines, trace, snap, d, k, max)
      }
    }
    trace.push(snap)
  }
  return null
}

function backtrackMyers(origLines, curLines, trace, _lastSnap, lastD, lastK, max) {
  const N = origLines.length; const M = curLines.length
  const script = []
  let d = lastD; let k = lastK
  let x = N; let y = M

  for (; d > 0; d--) {
    const snap = trace[d - 1]
    const idx = k + max
    const prevK = (k === -d || (k !== d && snap[idx - 1] < snap[idx + 1]))
      ? k + 1
      : k - 1
    const prevX = snap[prevK + max]
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      script.unshift({ type: 'equal', text: origLines[x - 1] })
      x--; y--
    }

    if (x === prevX) {
      script.unshift({ type: 'insert', text: curLines[y - 1] })
      y--
    } else {
      script.unshift({ type: 'delete', text: origLines[x - 1] })
      x--
    }
    k = prevK
  }

  while (x > 0 && y > 0) {
    script.unshift({ type: 'equal', text: origLines[x - 1] })
    x--; y--
  }
  while (x > 0) {
    script.unshift({ type: 'delete', text: origLines[x - 1] })
    x--
  }
  while (y > 0) {
    script.unshift({ type: 'insert', text: curLines[y - 1] })
    y--
  }

  return script
}

// ── 线性扫描（大文件回退） ────────────────────────────
// 用双指针遍历，当行不匹配时做有限范围的前瞻对齐。
// 时间复杂度 O(N+M)，不分配额外的 trace 数组，适合大文件。
// AI 的 edit 操作通常是局部连续变更，此算法在视觉上等价于 Myers。

const LINEAR_LOOKAHEAD = 50

function computeChangesLinear(origLines, curLines) {
  const changes = []
  let i = 0; let j = 0
  const N = origLines.length; const M = curLines.length

  while (i < N && j < M) {
    if (origLines[i] === curLines[j]) {
      changes.push({ type: 'equal', text: origLines[i] })
      i++; j++
      continue
    }

    // 行不匹配 → 前瞻查找对齐点
    let foundMatch = false
    const maxK = Math.min(LINEAR_LOOKAHEAD, Math.max(N - i, M - j))

    for (let k = 1; k <= maxK && !foundMatch; k++) {
      // 旧文件跳 k 行后匹配 → k 行删除
      if (i + k < N && origLines[i + k] === curLines[j]) {
        for (let d = 0; d < k; d++) {
          changes.push({ type: 'delete', text: origLines[i + d] })
        }
        i += k
        foundMatch = true
      }
      // 新文件跳 k 行后匹配 → k 行插入
      else if (j + k < M && origLines[i] === curLines[j + k]) {
        for (let ins = 0; ins < k; ins++) {
          changes.push({ type: 'insert', text: curLines[j + ins] })
        }
        j += k
        foundMatch = true
      }
    }

    // 前瞻未对齐 → 视为一行替换（delete + insert）
    if (!foundMatch) {
      changes.push({ type: 'delete', text: origLines[i] })
      changes.push({ type: 'insert', text: curLines[j] })
      i++; j++
    }
  }

  // 剩余行
  while (i < N) {
    changes.push({ type: 'delete', text: origLines[i] })
    i++
  }
  while (j < M) {
    changes.push({ type: 'insert', text: curLines[j] })
    j++
  }

  return changes
}

// ── 从编辑脚本提取当前文档行的变更信息 ─────────────────
// 返回 Map<lineNumber (1-based), { type: 'added'|'modified'|'deleted', origText: string|null }>
//   - added：该行是纯新增（AI 新插入，无对应旧行）→ origText = null
//   - modified：该行是修改（AI 改写了旧行）→ origText = 改前内容（旧文件对应行的文本）
//   - deleted：该行附近被 AI 删除过（删除的行不在当前文档，锚定"删除发生处"的当前文档行）
//       → origText = 被删行文本（多行以 \n 连接），当前供滚动条色带画短红块
// 锚点语义：delete 行被后续 insert 消费 → modified；未消费（被 equal 或文件末尾终结）→ deleted，
//   锚点行 = 删除发生处对应的当前文档行号（中间删除锚定 equal 行，末尾删除锚定最后一行）。
// origText 为 FIFO 配对的副产物，供 gutter 竖条按行标记（type）使用；
// 保留改前文本便于将来做"点击变更行 → 跳转 FileDiffView 对应位置"等增强。
// 导出为纯函数，便于单元测试（file-preview-diff.test.js）。

export function extractLineInfo(changes) {
  const info = new Map()
  if (!changes) return info

  let curIdx = 1
  let pendingDeletes = [] // 相邻 delete 行的改前文本（FIFO，与后续 insert 行配对）
  const flushDeletes = (atLine) => {
    if (pendingDeletes.length === 0) return
    // 纯删除（未与 insert 配对）：锚定删除发生处对应的当前文档行
    info.set(atLine, { type: 'deleted', origText: pendingDeletes.join('\n') })
    pendingDeletes = []
  }
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    if (c.type === 'equal') {
      // 等号行断开 delete/insert 配对：此前未配对的 delete 为纯删除，锚点 = 当前行
      flushDeletes(curIdx)
      curIdx++
    } else if (c.type === 'delete') {
      // 删除行不在当前文档中，只记改前文本待配对
      pendingDeletes.push(c.text)
    } else if (c.type === 'insert') {
      const origText = pendingDeletes.length > 0 ? pendingDeletes.shift() : null
      info.set(curIdx, { type: origText != null ? 'modified' : 'added', origText })
      curIdx++
    }
  }
  // 文件末尾残留的 delete：纯删除，锚点 = 当前文档下一行（curIdx，可能越界，
  // 由 FilePreview._renderDiffOverview 侧 clamp 到文档末尾；用 curIdx 而非 curIdx-1
  // 避免与最后一行的 modified/added 撞 key 覆盖）
  flushDeletes(curIdx)
  return info
}

// ── 纯函数：计算 diff 的 Decoration set ───────────────
//
// 不依赖 StateField，直接根据编辑器当前文档和原始内容计算出 Decoration set，
// 供外部通过 EditorView.decorations.of() 注入。
//
// 为什么不用 StateField + EditorView.decorations.from？
//   在 Compartment.reconfigure 动态注入场景下，该组合存在 CM6 内部
//   facet 依赖链求值间隙，decoration 被正确计算但不会渲染到 DOM。
//   改用纯函数 + decorations.of() 静态注入可彻底规避此问题。
//
// @param {import('@codemirror/state').EditorState} doc - 当前编辑器 state.doc
// @param {string} originalContent - AI 修改前的原始内容
// @returns {DecorationSet} Decoration.none 或 Decoration.set(...)

export function computeDiffDecorations(doc, originalContent) {
  return computeDiffInfo(doc, originalContent).decoSet
}

// ── 合并导出：Decoration set + 行变更信息 ──────────────
// FilePreview 一次调用同时拿到装饰集与行信息（gutter 竖条 / 滚动条色带用），
// 避免 decoSet 与 lineInfo 各算一次 diff。
// @returns {{ decoSet: DecorationSet, lineInfo: Map<number, {type, origText}> | null }}

export function computeDiffInfo(doc, originalContent) {
  if (originalContent == null) {
    return { decoSet: Decoration.none, lineInfo: null }
  }
  const origLines = originalContent.split('\n')
  return computeDiffData(doc, origLines)
}

// ── 内部 diff 计算 ────────────────────────────────────

function computeDiffData(doc, origLines) {
  const curLines = doc.toString().split('\n')

  // 内容完全相同 → 无 diff
  if (origLines.length === curLines.length &&
      origLines.every((l, i) => l === curLines[i])) {
    return { decoSet: Decoration.none, lineInfo: null }
  }

  const changes = computeChanges(origLines, curLines)
  if (!changes) return { decoSet: Decoration.none, lineInfo: null }

  const lineInfo = extractLineInfo(changes)
  if (lineInfo.size === 0) return { decoSet: Decoration.none, lineInfo }

  // 构建 Decoration set
  // 注意：extractLineInfo 按行号递增遍历，但类型检查仍确保排序
  const sortedLines = [...lineInfo.entries()].sort((a, b) => a[0] - b[0])
  const decos = []
  for (const [lineNum, info] of sortedLines) {
    const line = doc.line(lineNum)
    decos.push(
      Decoration.line({ class: `cm-diff-line-${info.type}` }).range(line.from)
    )
  }

  return {
    decoSet: decos.length > 0 ? Decoration.set(decos) : Decoration.none,
    lineInfo,
  }
}

// ── Gutter 竖条标记（IDE 式）──────────────────────────
// 在编辑器左侧行号旁渲染窄色条，标记 AI 变更行：
//   绿条 = 新增（added），蓝条 = 修改（modified）
// 不遮挡代码，与 VS Code / JetBrains 的 gutter 标记一致。
// 数据来源：computeDiffInfo 返回的 lineInfo（Map<行号, {type, origText}>）。

class DiffGutterMarker extends GutterMarker {
  constructor(type) {
    super()
    this.type = type
  }
  eq(other) {
    return this.type === other.type
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = `cm-diff-gutter-marker ${this.type}`
    return el
  }
}

// ── 滚动条整文色带（VS Code 式 overview）────────────────
// 把每个变更行映射成滚动条旁色带上的一个色块，一眼看到全文件改动分布。
// 与 gutter 同源（同一份 _diffLineInfo），但这里的输入是"行的文档像素范围"：
//   由调用方用 view.lineBlockAt(行首) 取得 {top, bottom}（文档绝对坐标，含 wrap 行高），
//   本函数只做 归一化 + 合并，纯函数便于单元测试。
//
// 归一化：scale = stripHeight / docHeight，色块 top/height = 行坐标 × scale。
//   注意：使用文档绝对坐标比例映射，位置与滚动无关——滚动时零重算。
// 合并规则（防密集改动糊成一片）：
//   - 单块最小高度 2px（再小的行在色带上不可见）
//   - 相邻同类型块（间隙 < 1px）合并成连续段
//   - 不同类型（added/modified）即使相邻也不合并，保留颜色语义

const OVERVIEW_MIN_HEIGHT = 2
const OVERVIEW_MERGE_GAP = 1

/**
 * 计算滚动条色带的色块列表（纯函数）。
 * @param {Array<{top:number, bottom:number, type:'added'|'modified'}>|null} lineBlocks
 *   变更行的文档绝对像素范围（view.lineBlockAt 返回的 block 提取）
 * @param {number} docHeight 文档总高度（scrollDOM.scrollHeight）
 * @param {number} stripHeight 色带可用高度（scrollDOM.clientHeight）
 * @returns {Array<{top:number, height:number, type:'added'|'modified'}>}
 *   归一化到色带坐标（top ∈ [0, stripHeight]）的色块，已做最小高度/相邻合并
 */
export function computeOverviewMarkers(lineBlocks, docHeight, stripHeight) {
  if (!lineBlocks || lineBlocks.length === 0) return []
  if (!(docHeight > 0) || !(stripHeight > 0)) return []

  const scale = stripHeight / docHeight
  const raw = []
  for (const lb of lineBlocks) {
    if (lb == null || !(lb.bottom > lb.top)) continue
    let top = lb.top * scale
    let height = Math.max(OVERVIEW_MIN_HEIGHT, (lb.bottom - lb.top) * scale)
    // 底部越界时把色块收回色带内（贴近底边）
    if (top + height > stripHeight) {
      top = Math.max(0, stripHeight - height)
    }
    raw.push({ top, height, type: lb.type })
  }
  if (raw.length === 0) return []

  // 相邻同类型块合并成连续段（间隙 < OVERVIEW_MERGE_GAP 视为连续）
  const merged = []
  for (const b of raw) {
    const last = merged[merged.length - 1]
    if (last && last.type === b.type && b.top - (last.top + last.height) < OVERVIEW_MERGE_GAP) {
      // 段范围 = 从 last 起点到两块中较远终点；round 到 3 位小数消除浮点累积误差
      last.height = Math.round(Math.max(last.height, b.top + b.height - last.top) * 1000) / 1000
    } else {
      merged.push(b)
    }
  }
  return merged
}

/**
 * 构建 gutter 扩展（行号旁竖条标记）。
 * @param {Map<number, {type: 'added'|'modified', origText}>|null} lineInfo
 * @returns {Array} CM6 扩展数组（无变更时为 []，直接 reconfigure 空数组即可）
 */
export function buildDiffGutter(lineInfo) {
  if (!lineInfo || lineInfo.size === 0) return []
  return gutter({
    class: 'cm-diff-gutter',
    // 只为视口内的行调用，性能开销小；按行查 lineInfo 决定是否画竖条
    // 注意：lineMarker 的 line 是 BlockInfo（属性 from/length/top/height，无 .number），
    //   必须用 lineAt(line.from) 取文档行号，直接读 line.number 恒为 undefined
    // deleted 不画竖条：锚点行是删除发生处的现存行，画条会误导成"这行被改"，
    //   删除的呈现交给滚动条色带（短红块，见 FilePreview._renderDiffOverview）
    lineMarker: (view, line) => {
      const info = lineInfo.get(view.state.doc.lineAt(line.from).number)
      return info && info.type !== 'deleted' ? new DiffGutterMarker(info.type) : null
    },
  })
}
