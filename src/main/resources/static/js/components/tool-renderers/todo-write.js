import { escapeHtml } from '../../utils.js';
import { parseTodos } from './shared.js';

export function renderTodoWriteCard(tool) {
  const todos = parseTodos(tool.args);
  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const todoIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><polyline points="5 7 7 9 11 5"/></svg>';
  const checkSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
  const dotSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';

  return `
    <div class="tool-card todo-card">
      <div class="tool-header" onclick="window.toggleToolCardDetails(this)">
        <span class="tool-icon">${todoIcon}</span>
        <span class="tool-title">任务清单</span>
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
        <div class="todo-list">
          ${todos.map(todo => {
            const isCompleted = todo.status === 'completed';
            const icon = isCompleted ? checkSvg : dotSvg;
            const statusClass = isCompleted ? 'done' : 'pending';
            const content = todo.content || '未命名任务';
            return `
              <div class="todo-item ${statusClass}">
                <span class="todo-icon">${icon}</span>
                <span class="todo-content">${escapeHtml(content)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
