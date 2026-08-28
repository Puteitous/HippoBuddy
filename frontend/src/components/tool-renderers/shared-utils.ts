/**
 * 工具卡片非组件导出(常量 / 类型 / 纯函数)
 *
 * 从 `shared.tsx` 拆分出来,避免 react-refresh 因同一文件混合导出组件与非组件而告警。
 * 组件(StatusIcon / StatusBadge / ToolCardFrame / FilePath / DiffView 等)仍由 `shared.tsx` 导出。
 */
import type { ToolCallRecord, ToolCallStatus } from '@/types';
import { translate } from '@/i18n';

// ============================================================================
// Props 与工具名常量
// ============================================================================

/** 所有 ToolCard 的统一 props */
export interface ToolCardProps {
  /** 工具调用记录(包含 name/args/status/progress/result/error) */
  record: ToolCallRecord;
  /** 默认是否展开(可选,部分卡片在待确认态默认展开) */
  defaultExpanded?: boolean;
}

/** 文件类工具名集合(用于 FileSearchCard 匹配) */
export const FILE_SEARCH_TOOL_NAMES = new Set<string>([
  'read_file',
  'grep',
  'glob',
  'list_directory',
  'SearchCodebase',
  'read_office_file',
  'write_office_file',
  'lint_diagnostics',
  'undo_file',
  'skill',
]);

/** 联网类工具名集合(用于 WebToolCard 匹配) */
export const WEB_TOOL_NAMES = new Set<string>(['web_search', 'web_fetch']);

// ============================================================================
// 参数解析
// ============================================================================

/**
 * 把工具调用 args(JSON 字符串或对象)统一解析为对象。
 * 解析失败时返回空对象,避免抛错阻塞渲染。
 */
export function parseToolArgs<T = Record<string, unknown>>(args: unknown): T {
  if (!args) return {} as T;
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as T;
    } catch {
      return {} as T;
    }
  }
  return args as T;
}

// ============================================================================
// 状态文案(供 StatusBadge 使用)
// ============================================================================

/** 状态文案 key(供 StatusBadge / statusLabel 使用) */
export function statusKey(status: ToolCallStatus): string {
  switch (status) {
    case 'success': return 'tool.default.success';
    case 'failed': return 'tool.default.failed';
    case 'running': return 'tool.default.running';
    default: return status;
  }
}

/** 状态文案(非响应式,调用时读当前语言) */
export function statusLabel(status: ToolCallStatus): string {
  return translate(statusKey(status));
}

// ============================================================================
// 统一 Diff 算法(LCS)
// ============================================================================

export type DiffLineType = 'added' | 'removed' | 'same';

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

/**
 * 基于最长公共子序列(LCS)计算统一 diff。
 * 用于 edit_file/write_file 的变更展示。
 */
export function computeUnifiedDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // dp[i][j] = oldLines[0..i-1] 与 newLines[0..j-1] 的 LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 回溯生成 diff 行
  const reversed: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversed.push({ type: 'same', content: oldLines[i - 1] });
      i--;
      j--;
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

/** 统计 diff 的增删行数 */
export function countDiffStats(oldText: string, newText: string): { insertions: number; deletions: number } {
  const diff = computeUnifiedDiff(oldText, newText);
  let insertions = 0;
  let deletions = 0;
  for (const line of diff) {
    if (line.type === 'added') insertions++;
    else if (line.type === 'removed') deletions++;
  }
  return { insertions, deletions };
}

// ============================================================================
// todo_write 会话级累计(对齐旧版 shared.js 的 parseTodoArgs / deepMergeTodoList)
// ============================================================================

/** 扁平任务节点(含 parentId,按 id 合并后再由 TodoWriteCard 构建为树) */
export interface FlatTodo {
  id: string;
  content?: string;
  status?: string;
  parentId?: string | null;
  sessionId?: string | null;
}

/**
 * 解析 todo_write 的 args(JSON 字符串或对象)。
 * 对齐旧版 parseTodoArgs:失败时返回 { mode:'merge', todos:[] }。
 */
export function parseTodoArgs(args: unknown): { mode: string; todos: FlatTodo[] } {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : (args ?? {});
    return {
      mode: parsed?.mode ?? 'merge',
      todos: Array.isArray(parsed?.todos) ? (parsed.todos as FlatTodo[]) : [],
    };
  } catch {
    return { mode: 'merge', todos: [] };
  }
}

/**
 * 按 id 深合并两个扁平 todo 列表(对齐旧版 deepMergeTodoList):
 *  - newList 中已存在的 id → 仅更新被提及的字段(content/status/sessionId/parentId)
 *  - newList 中的新 id → 追加(默认 status: 'pending')
 *  - oldList 未被提及时保持不变(保留完整累计状态)
 */
export function deepMergeTodoList(
  oldList: FlatTodo[],
  newList: FlatTodo[],
): FlatTodo[] {
  const map = new Map<string, FlatTodo>();
  (oldList || []).forEach((t) => map.set(t.id, { ...t }));
  (newList || []).forEach((nt) => {
    const existing = map.get(nt.id);
    if (existing) {
      if (nt.content !== undefined) existing.content = nt.content;
      if (nt.status !== undefined) existing.status = nt.status;
      if (nt.sessionId !== undefined) existing.sessionId = nt.sessionId;
      if (nt.parentId !== undefined) existing.parentId = nt.parentId;
    } else {
      map.set(nt.id, {
        id: nt.id,
        content: nt.content ?? '',
        status: nt.status || 'pending',
        parentId: nt.parentId ?? null,
        sessionId: nt.sessionId ?? null,
      });
    }
  });
  return Array.from(map.values());
}

// ============================================================================
// Timeline 摘要提取(对齐旧版 renderToolTimelineRow 的 summary 逻辑)
// ============================================================================

/**
 * 按工具名从 args 提取 timeline 行摘要文本。
 *
 * 对齐旧版 tool-renderers/index.js 的 summary 分支:
 *  - bash:命令文本
 *  - read_file / edit_file / write_file / undo_file / read_office_file /
 *    write_office_file:文件路径
 *  - grep / glob:pattern
 *  - SearchCodebase:information_request
 *  - web_search:"查询词"
 *  - web_fetch:url
 *  - lint_diagnostics / delete_file:paths 列表
 *  - list_directory:path
 *  - skill:skill: <name>
 *  - 其他:工具名兜底
 *
 * @param name 工具名
 * @param args 工具参数(JSON 字符串或对象)
 * @returns 摘要文本(可为空串)
 */
export function timelineSummary(name: string, args: unknown): string {
  const a = parseToolArgs<Record<string, unknown>>(args);
  switch (name) {
    case 'bash':
      return typeof a.command === 'string' ? a.command : '';
    case 'read_file':
    case 'edit_file':
    case 'write_file':
    case 'undo_file':
    case 'read_office_file':
    case 'write_office_file':
      return typeof a.path === 'string' ? a.path : '';
    case 'grep':
    case 'glob':
      return typeof a.pattern === 'string' ? a.pattern : '';
    case 'SearchCodebase':
      return typeof a.information_request === 'string' ? a.information_request : '';
    case 'web_search': {
      const q = typeof a.query === 'string' ? a.query : '';
      return q ? `"${q}"` : '';
    }
    case 'web_fetch':
      return typeof a.url === 'string' ? a.url : '';
    case 'lint_diagnostics':
    case 'delete_file':
      return Array.isArray(a.paths) ? (a.paths as unknown[]).join(', ') : '';
    case 'list_directory':
      return typeof a.path === 'string' ? a.path : translate('tool.common.projectRoot');
    case 'skill':
      return typeof a.name === 'string' ? `skill: ${a.name}` : '';
    default:
      return name;
  }
}

/**
 * 从 args 提取 timeline 行可点击跳转的文件路径。
 * 无路径时返回空串。
 */
export function timelineFilePath(name: string, args: unknown): string {
  const a = parseToolArgs<Record<string, unknown>>(args);
  switch (name) {
    case 'read_file':
    case 'edit_file':
    case 'write_file':
    case 'undo_file':
    case 'read_office_file':
    case 'write_office_file':
    case 'list_directory':
      return typeof a.path === 'string' ? a.path : '';
    case 'delete_file':
    case 'lint_diagnostics':
      return Array.isArray(a.paths) && (a.paths as unknown[]).length > 0
        ? String((a.paths as unknown[])[0])
        : '';
    default:
      return '';
  }
}
