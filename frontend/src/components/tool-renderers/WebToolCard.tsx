/**
 * WebToolCard - 联网搜索 / 抓取工具卡片
 *
 * 适用工具名:web_search / web_fetch
 *
 * 渲染:
 *  - 查询词 / URL
 *  - 结果摘要 / 完整结果
 *  - 错误信息(失败时)
 *
 * 注:旧版对 web_search 会统计"找到 N 项结果",3.3 简化为直接展示 result。
 */
import { StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { useI18n } from '@/i18n';

interface WebArgs {
  query?: string;
  url?: string;
}

export function WebToolCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<WebArgs>(record.args);
  const isSearch = record.name === 'web_search';
  const isFetch = record.name === 'web_fetch';
  const query = args.query ?? '';
  const url = args.url ?? '';
  const isRunning = record.status === 'running';
  const isFailed = record.status === 'failed';

  const summary = isSearch ? query : isFetch ? url : '';

  return (
    <ToolCardFrame
      className={`web-card ${record.name}`}
      icon={<WebIcon isSearch={isSearch} />}
      title={isSearch ? t('tool.web.searchTitle') : isFetch ? t('tool.web.fetchTitle') : t('tool.web.fallbackTitle')}
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={true}
    >
      {summary && <div className="tool-summary">{summary}</div>}

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

function WebIcon({ isSearch }: { isSearch: boolean }) {
  if (isSearch) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" />
      </svg>
    );
  }
  // web_fetch 用链接图标
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10l4-4" />
      <path d="M8 4l1-1a3 3 0 0 1 4 4l-1 1" />
      <path d="M8 12l-1 1a3 3 0 0 1-4-4l1-1" />
    </svg>
  );
}
