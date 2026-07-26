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

// ── 从编辑脚本提取当前文档行的类型 ─────────────────────
// 返回 Map<lineNumber (1-based), 'added'|'modified'>

function extractLineTypes(changes) {
  const types = new Map()
  if (!changes) return types

  let curIdx = 1
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    if (c.type === 'equal') {
      curIdx++
    } else if (c.type === 'insert') {
      // 统一标记为 added（绿色），表示"AI 影响了这行"
      // 具体是新增还是修改，用户点工具"查看变更"看 unified diff 即可
      types.set(curIdx, 'added')
      curIdx++
    }
    // delete 行不在当前文档中，跳过
  }
  return types
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
  if (originalContent == null) return Decoration.none

  const origLines = originalContent.split('\n')
  const result = computeDiffData(doc, origLines)
  return result.decoSet
}

// ── 内部 diff 计算 ────────────────────────────────────

function computeDiffData(doc, origLines) {
  const curLines = doc.toString().split('\n')

  // 内容完全相同 → 无 diff
  if (origLines.length === curLines.length &&
      origLines.every((l, i) => l === curLines[i])) {
    return { decoSet: Decoration.none }
  }

  const changes = computeChanges(origLines, curLines)
  if (!changes) return { decoSet: Decoration.none }

  let lineTypes = extractLineTypes(changes)
  if (lineTypes.size === 0) return { decoSet: Decoration.none }

  // 构建 Decoration set
  // 注意：extractLineTypes 按行号递增遍历，但类型检查仍确保排序
  const sortedLines = [...lineTypes.entries()].sort((a, b) => a[0] - b[0])
  const decos = []
  for (const [lineNum, type] of sortedLines) {
    const line = doc.line(lineNum)
    decos.push(
      Decoration.line({ class: `cm-diff-line-${type}` }).range(line.from)
    )
  }

  return {
    decoSet: decos.length > 0 ? Decoration.set(decos) : Decoration.none,
  }
}
