/**
 * FilePreviewDiff — CodeMirror 6 内联 diff 标记插件
 *
 * 在编辑器中通过行背景色 + 左侧边框显示 AI 对文件的修改：
 * - 绿色左边框 + 淡绿色背景 = 新增行
 * - 红色左边框 + 淡红色背景 = 修改行
 *
 * 用法：
 *   import { createDiffExtension } from './FilePreviewDiff.js'
 *   extensions: [ ...basicSetup, ...createDiffExtension(originalContent) ]
 */

import {
  StateField,
  Decoration,
  EditorView,
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
      // 前一条为 delete → 属于修改而非纯粹新增
      types.set(curIdx, i > 0 && changes[i - 1].type === 'delete' ? 'modified' : 'added')
      curIdx++
    }
    // delete 行不在当前文档中，跳过
  }
  return types
}

// ── 创建 CM6 扩展 ─────────────────────────────────────

/**
 * @param {string} originalContent - AI 修改前的原始内容
 * @returns {import('@codemirror/view').Extension[]}
 */
export function createDiffExtension(originalContent) {
  if (originalContent == null) return []
  const origLines = originalContent.split('\n')

  // StateField：保存 diff 计算结果
  const diffField = StateField.define({
    create(state) {
      return computeDiffData(state.doc, origLines)
    },
    update(data, tr) {
      if (!tr.docChanged) return data
      return computeDiffData(tr.state.doc, origLines)
    },
  })

  // Decoration set：行背景色 + 左侧边框
  const decoExt = EditorView.decorations.from(diffField, (data) => {
    if (!data) return Decoration.none
    return data.decoSet
  })

  return [diffField, decoExt]
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
  if (!changes) {
    return { decoSet: Decoration.none }
  }

  const lineTypes = extractLineTypes(changes)

  // 构建 Decoration set
  const decos = []
  for (const [lineNum, type] of lineTypes) {
    const line = doc.line(lineNum)
    decos.push(
      Decoration.line({ class: `cm-diff-line-${type}` }).range(line.from)
    )
  }

  return {
    decoSet: decos.length > 0 ? Decoration.set(decos) : Decoration.none,
  }
}
