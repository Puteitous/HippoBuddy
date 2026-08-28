/**
 * FileSearchCard - 文件类工具卡片(合并多种工具)
 *
 * 适用工具名:
 *  - read_file / read_office_file / write_office_file:读取/写入文件
 *  - grep / glob / list_directory:文件搜索
 *  - SearchCodebase:语义搜索
 *  - lint_diagnostics:lint 检查
 *  - undo_file:撤销文件
 *  - skill:技能调用
 *
 * 渲染:
 *  - 文件路径或搜索参数(根据工具名提取关键字段)
 *  - 结果摘要 / 完整结果
 *  - 错误信息(失败时)
 *
 * 注:旧版对 grep/glob/list_directory 等会解析后端的中文统计行,
 *     3.3 简化为直接展示 result 文本,后续若需要可扩展。
 */
import { FilePath, StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { translate, useI18n } from '@/i18n';

interface FileSearchArgs {
  path?: string;
  pattern?: string;
  file_pattern?: string;
  information_request?: string;
  query?: string;
  url?: string;
  paths?: string[];
  name?: string;
}

/** 按工具名提取主要参数(用于卡片摘要) */
function extractSummary(name: string, args: FileSearchArgs): string {
  if (name === 'read_file' || name === 'read_office_file' || name === 'write_office_file' || name === 'undo_file') {
    return args.path ?? '';
  }
  if (name === 'grep' || name === 'glob') {
    return args.pattern ?? '';
  }
  if (name === 'list_directory') {
    return args.path ?? translate('tool.common.projectRoot');
  }
  if (name === 'SearchCodebase') {
    return args.information_request ?? '';
  }
  if (name === 'lint_diagnostics') {
    return Array.isArray(args.paths) ? args.paths.join(', ') : '';
  }
  if (name === 'skill') {
    return args.name ? `skill: ${args.name}` : 'skill';
  }
  return '';
}

/** 按工具名取标题 i18n key */
function titleKeyFor(name: string): string {
  const keys: Record<string, string> = {
    read_file: 'tool.search.readFile',
    read_office_file: 'tool.search.readOffice',
    write_office_file: 'tool.search.writeOffice',
    grep: 'tool.search.grep',
    glob: 'tool.search.glob',
    list_directory: 'tool.search.listDirectory',
    SearchCodebase: 'tool.search.codebase',
    lint_diagnostics: 'tool.search.lint',
    undo_file: 'tool.search.undoFile',
    skill: 'tool.search.skill',
  };
  return keys[name] ?? name;
}

/** 按工具名取图标 */
function IconFor({ name }: { name: string }) {
  // 文件类(读取/写入/撤销)用文件图标
  if (
    name === 'read_file' ||
    name === 'read_office_file' ||
    name === 'write_office_file' ||
    name === 'undo_file' ||
    name === 'list_directory'
  ) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M9 2v3h3" />
      </svg>
    );
  }
  // 搜索类(grep/glob/SearchCodebase)用放大镜
  if (name === 'grep' || name === 'glob' || name === 'SearchCodebase') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" />
      </svg>
    );
  }
  // lint_diagnostics 用警告图标
  if (name === 'lint_diagnostics') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" />
        <line x1="8" y1="5" x2="8" y2="9" />
        <line x1="8" y1="11" x2="8.01" y2="11" />
      </svg>
    );
  }
  // skill / undo_file / 兜底用齿轮
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" />
    </svg>
  );
}

export function FileSearchCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<FileSearchArgs>(record.args);
  const summary = extractSummary(record.name, args);
  const isPathTool = ['read_file', 'read_office_file', 'write_office_file', 'undo_file', 'list_directory'].includes(record.name);
  const isFailed = record.status === 'failed';
  const isRunning = record.status === 'running';

  return (
    <ToolCardFrame
      className={`filesearch-card ${record.name}`}
      icon={<IconFor name={record.name} />}
      title={t(titleKeyFor(record.name))}
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={true}
    >
      {/* 路径类工具:用 FilePath(可点击跳转);其他用纯文本摘要 */}
      {summary && isPathTool && <FilePath path={summary} />}
      {summary && !isPathTool && <div className="tool-summary">{summary}</div>}

      {isRunning && <div className="tool-summary">{t('tool.timeline.running')}</div>}

      {!isRunning && record.result && (
        <div className="tool-result">
          <pre>{record.result}</pre>
        </div>
      )}

      {isFailed && record.error && <div className="tool-error">{record.error}</div>}
    </ToolCardFrame>
  );
}
