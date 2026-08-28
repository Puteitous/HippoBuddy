/**
 * TodoWriteCard - todo_write 工具卡片
 *
 * 渲染扁平 todo 列表(含 parentId)为树形结构,显示进度条。
 * 状态:done / in_progress / pending
 */
import { ReactNode, useState } from 'react';
import { ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { useI18n } from '@/i18n';

interface TodoNode {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  parentId?: string | null;
  sessionId?: string | null;
  children?: TodoNode[];
}

interface TodoWriteArgs {
  mode?: string;
  todos?: TodoNode[];
}

/** 把扁平列表(含 parentId)构建为树 */
function buildTree(flat: TodoNode[]): TodoNode[] {
  if (!flat || flat.length === 0) return [];
  // 已经是树结构(有 children 字段)直接返回
  if (flat.some((n) => n.children !== undefined)) return flat;
  const map = new Map<string, TodoNode>();
  flat.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: TodoNode[] = [];
  flat.forEach((n) => {
    const treeNode = map.get(n.id)!;
    const parentId = n.parentId;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children!.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });
  return roots;
}

/** 递归统计完成数 */
function countStats(nodes: TodoNode[]): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const node of nodes) {
    total++;
    if (node.status === 'completed') completed++;
    if (node.children && node.children.length > 0) {
      const sub = countStats(node.children);
      completed += sub.completed;
      total += sub.total;
    }
  }
  return { completed, total };
}

/** 递归渲染树节点 */
function TreeNode({ node, depth }: { node: TodoNode; depth: number }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!node.children && node.children.length > 0;
  const statusClass =
    node.status === 'completed' ? 'done' : node.status === 'in_progress' ? 'in-progress' : 'pending';

  return (
    <div className={`todo-tree-item depth-${depth}`}>
      <div className={`todo-node-row ${statusClass}`}>
        <span
          className="todo-node-toggle"
          onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
          role={hasChildren ? 'button' : undefined}
        >
          {hasChildren ? (
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <polyline points="6 4 10 8 6 12" />
            </svg>
          ) : null}
        </span>
        <span className="todo-icon">
          {node.status === 'completed' ? (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 8 7 11 12 5" />
            </svg>
          ) : node.status === 'in_progress' ? (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="3" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="3" />
            </svg>
          )}
        </span>
        <span className="todo-content">{node.content || t('tool.todo.unnamed')}</span>
        {node.sessionId && (
          <span className="todo-session-link" title={t('tool.todo.jumpToSession')}>
            🔗
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="todo-tree-children">
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TodoWriteCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<TodoWriteArgs>(record.args);
  const flatList = Array.isArray(args.todos) ? args.todos : [];
  const tree = buildTree(flatList);
  const { completed, total } = countStats(tree);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const summary: ReactNode = total > 0 ? (
    <span>
      {completed} / {total}
    </span>
  ) : null;

  return (
    <ToolCardFrame
      className="todo-card"
      icon={
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="2" width="10" height="12" rx="1" />
          <polyline points="5 7 7 9 11 5" />
        </svg>
      }
      title={t('tool.todo.title')}
      statusBadge={summary}
      defaultExpanded={total > 0}
    >
      {total > 1 && (
        <div className="todo-progress-bar">
          <div className="todo-progress-track">
            <div className="todo-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <div className="todo-tree">
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} />
        ))}
      </div>
    </ToolCardFrame>
  );
}
