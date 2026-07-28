import { escapeHtml } from '../../utils.js';
import { parseTodos, buildTreeFromFlatList } from './shared.js';

/**
 * 递归统计树中所有节点的完成数和总数。
 */
function countTreeStats(nodes) {
  let completed = 0, total = 0;
  for (const node of nodes) {
    total++;
    if (node.status === 'completed') completed++;
    if (node.children && node.children.length > 0) {
      const sub = countTreeStats(node.children);
      completed += sub.completed;
      total += sub.total;
    }
  }
  return { completed, total };
}

/**
 * 递归渲染树节点列表。
 */
function renderTree(nodes, depth) {
  return nodes.map(node => renderTreeNode(node, depth)).join('');
}

function renderTreeNode(node, depth) {
  const isCompleted = node.status === 'completed';
  const isInProgress = node.status === 'in_progress';
  const hasChildren = node.children && node.children.length > 0;

  let statusClass = isCompleted ? 'done' : (isInProgress ? 'in-progress' : 'pending');
  let iconSvg;
  if (isCompleted) {
    iconSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
  } else if (isInProgress) {
    iconSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>';
  } else {
    iconSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';
  }

  const content = node.content || (window.i18n?.t('tool.todo.unnamed') || '未命名任务');
  const sessionLink = node.sessionId
    ? `<span class="todo-session-link" title="${window.i18n?.t('tool.todo.jumpToSession') || '跳转到关联会话'}">🔗</span>`
    : '';

  // 树节点：有子节点时可折叠
  if (hasChildren) {
    const toggleIcon = '<svg class="todo-toggle-icon" viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>';
    return `
      <div class="todo-tree-item depth-${depth}">
        <div class="todo-node-row ${statusClass}" onclick="window.toggleTreeNode(this)">
          <span class="todo-node-toggle">${toggleIcon}</span>
          <span class="todo-icon">${iconSvg}</span>
          <span class="todo-content">${escapeHtml(content)}</span>
          ${sessionLink}
        </div>
        <div class="todo-tree-children">
          ${renderTree(node.children, depth + 1)}
        </div>
      </div>`;
  }

  // 叶子节点
  return `
    <div class="todo-tree-item depth-${depth}">
      <div class="todo-node-row ${statusClass}">
        <span class="todo-node-toggle-placeholder"></span>
        <span class="todo-icon">${iconSvg}</span>
        <span class="todo-content">${escapeHtml(content)}</span>
        ${sessionLink}
      </div>
    </div>`;
}

export function renderTodoWriteCard(tool) {
  const todos = parseTodos(tool.args);
  // 将扁平列表（含 parentId）构建为树结构再渲染
  const tree = buildTreeFromFlatList(todos);
  const { completed, total } = countTreeStats(tree);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const todoIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><polyline points="5 7 7 9 11 5"/></svg>';

  const treeHtml = renderTree(tree, 0);
  const isDefaultExpanded = tool.defaultExpanded && total > 0;

  return `
    <div class="tool-card todo-card${isDefaultExpanded ? ' expanded' : ''}">
      <div class="tool-header" onclick="window.toggleToolCardDetails(this)">
        <span class="tool-icon">${todoIcon}</span>
        <span class="tool-title">${window.i18n?.t('tool.todo.title') || '任务清单'}</span>
        <span class="tool-progress-label">${completed}/${total}</span>
        <span class="arrow"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 12 6 8 10 4"/></svg></span>
      </div>
      <div class="tool-call-details">
        ${total > 1 ? `
        <div class="todo-progress-bar">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>` : ''}
        <div class="todo-tree">
          ${treeHtml}
        </div>
      </div>
    </div>
  `;
}
