/**
 * DefaultToolCard - 兜底工具卡片
 *
 * 用于未识别工具名的工具调用。
 *
 * 渲染:
 *  - 工具名(原始 name)
 *  - 参数(JSON 美化)
 *  - 结果(若存在)
 *  - 错误信息(失败时)
 */
import { StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { useI18n } from '@/i18n';

export function DefaultToolCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs(record.args);
  const isFailed = record.status === 'failed';
  const isRunning = record.status === 'running';

  const argsJson = (() => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(record.args);
    }
  })();

  return (
    <ToolCardFrame
      className="default-card"
      icon={
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z" />
          <line x1="10" y1="6" x2="12" y2="4" />
        </svg>
      }
      title={record.name}
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={false}
    >
      {isRunning && <div className="tool-summary">{t('tool.timeline.running')}</div>}

      {Object.keys(args).length > 0 && (
        <div className="tool-args">
          <div className="tool-detail-row">
            <span className="tool-detail-label">{t('tool.default.parameters')}</span>
            <pre>{argsJson}</pre>
          </div>
        </div>
      )}

      {!isRunning && record.result && (
        <div className="tool-result">
          <div className="tool-detail-row">
            <span className="tool-detail-label">{t('tool.default.result')}</span>
            <pre>{record.result}</pre>
          </div>
        </div>
      )}

      {isFailed && record.error && <div className="tool-error">{record.error}</div>}
    </ToolCardFrame>
  );
}
