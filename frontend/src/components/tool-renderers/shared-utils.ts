/**
 * 工具卡片非组件导出(常量 / 类型 / 纯函数)
 *
 * 从 `shared.tsx` 拆分出来,避免 react-refresh 因同一文件混合导出组件与非组件而告警。
 * 组件(StatusIcon / StatusBadge / ToolCardFrame / FilePath / DiffView 等)仍由 `shared.tsx` 导出。
 */
import type { ToolCallRecord, ToolCallStatus } from '@/types';

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

/** 状态文案 */
export function statusLabel(status: ToolCallStatus): string {
  switch (status) {
    case 'success': return '成功';
    case 'failed': return '失败';
    case 'running': return '执行中';
    default: return status;
  }
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
