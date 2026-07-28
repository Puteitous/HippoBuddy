import { escapeHtml } from '../../utils.js';

export function parseToolArgs(args) {
  try {
    return typeof args === 'string' ? JSON.parse(args) : args;
  } catch (e) {
    return {};
  }
}

export function parseTodos(args) {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return parsed.todos || [];
  } catch (e) {
    return [];
  }
}

/**
 * 解析 todo_write 工具调用的参数，返回 { mode, todos }。
 * mode 默认为 'merge'，todos 默认为 []。
 */
export function parseTodoArgs(args) {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return {
      mode: parsed.mode || 'merge',
      todos: parsed.todos || []
    };
  } catch (e) {
    return { mode: 'merge', todos: [] };
  }
}

/**
 * 合并两个扁平 todo 列表（按 id 合并）。
 * oldList 中未在 newList 提及的节点保留不变。
 * 用于前端流式增量更新 todo 树。
 *
 * todos 为扁平列表（每个节点含 parentId），不需要按树层级嵌套传参。
 * LLM 只需平铺要更新或新增的节点，系统自动按 id 匹配合并。
 */
export function deepMergeTodoList(oldList, newList) {
  const map = new Map();
  (oldList || []).forEach(todo => {
    map.set(todo.id, { ...todo });
  });
  (newList || []).forEach(newTodo => {
    if (map.has(newTodo.id)) {
      const existing = map.get(newTodo.id);
      if (newTodo.content !== undefined) existing.content = newTodo.content;
      if (newTodo.status !== undefined) existing.status = newTodo.status;
      if (newTodo.sessionId !== undefined) existing.sessionId = newTodo.sessionId;
      if (newTodo.parentId !== undefined) existing.parentId = newTodo.parentId;
    } else {
      // 新增节点
      map.set(newTodo.id, {
        id: newTodo.id,
        content: newTodo.content || (window.i18n?.t('tool.todo.unnamed') || '未命名任务'),
        status: newTodo.status || 'pending',
        parentId: newTodo.parentId || undefined
      });
    }
  });
  return Array.from(map.values());
}

/**
 * 将扁平的任务列表（含 parentId）按父子关系构建为树结构。
 * parentId 为 null/undefined 或不存在的 id → 根节点。
 * 兼容已为树结构的输入（有 children 字段），直接透传。
 *
 * @param {Array} flatList - 扁平任务列表 [{id, content, parentId, ...}]
 * @returns {Array} 树结构列表 [{id, content, children: [...]}, ...]
 */
export function buildTreeFromFlatList(flatList) {
  if (!flatList || flatList.length === 0) return [];

  // 如果已经是树结构（有 children 字段），直接返回
  if (flatList.some(n => n.children !== undefined)) {
    return flatList;
  }

  // 按 id 建立索引
  const nodeMap = new Map();
  flatList.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  const roots = [];

  flatList.forEach(node => {
    const treeNode = nodeMap.get(node.id);
    const parentId = node.parentId;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });

  return roots;
}

export function computeUnifiedDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const reversed = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversed.push({ type: 'same', content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({ type: 'added', content: newLines[j - 1] });
      j--;
    } else {
      reversed.push({ type: 'removed', content: oldLines[i - 1] });
      i--;
    }
  }
  return reversed.reverse();
}

export function countDiffStats(oldText, newText) {
  const diffLines = computeUnifiedDiff(oldText, newText);
  let insertions = 0, deletions = 0;
  for (const line of diffLines) {
    if (line.type === 'added') insertions++;
    else if (line.type === 'removed') deletions++;
  }
  return { insertions, deletions };
}

export function renderUnifiedDiff(diffLines) {
  let html = `<div class="unified-diff">`;
  for (const line of diffLines) {
    html += renderDiffLine(line);
  }
  html += `</div>`;
  return html;
}

export function renderDiffLine(line) {
  const cls = line.type === 'added' ? 'diff-added'
            : line.type === 'removed' ? 'diff-removed'
            : 'diff-context';
  const gutter = line.type === 'added' ? '+'
               : line.type === 'removed' ? '-'
               : ' ';
  return `<div class="diff-line ${cls}">
    <span class="diff-gutter">${gutter}</span>
    <span class="diff-line-content">${escapeHtml(line.content)}</span>
  </div>`;
}
