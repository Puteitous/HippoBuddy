/**
 * BashToolCard - bash 工具卡片
 *
 * 渲染:
 *  - 命令文本(深色背景等宽字体)
 *  - 工作目录(可选)
 *  - 流式进度(record.progress,执行中显示)
 *  - 最终结果(record.result,解析退出码/耗时)
 *  - 错误信息(record.error / record.status === 'failed')
 *
 * 注:旧版会解析后端返回的"命令/工作目录/退出码/执行时间"等多行文本,
 *     新版 3.3 简化处理:直接展示 result 文本,不再细分解析。
 *     若需要恢复解析,可在 parseBashResult 中扩展。
 */
import { StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { useI18n } from '@/i18n';

interface BashArgs {
  command?: string;
  working_dir?: string;
}

/** 终端图标 */
function TerminalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 4 8 8 4 12" />
      <line x1="11" y1="12" x2="12" y2="12" />
    </svg>
  );
}

export function BashToolCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<BashArgs>(record.args);
  const command = args.command ?? '';
  const workingDir = args.working_dir ?? '';
  const isRunning = record.status === 'running';
  const isFailed = record.status === 'failed';

  return (
    <ToolCardFrame
      className="bash-card"
      icon={<TerminalIcon />}
      title={t('tool.bash.runTitle')}
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={true}
    >
      {command && <div className="bash-command">{command}</div>}
      {workingDir && (
        <div className="bash-meta">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
          </svg>
          <span>{workingDir}</span>
        </div>
      )}

      {/* 流式进度(执行中) */}
      {isRunning && record.progress.length > 0 && (
        <div className="bash-progress">
          <pre>{record.progress.slice(-50).join('\n')}</pre>
        </div>
      )}

      {/* 最终结果 */}
      {!isRunning && record.result && (
        <div className="bash-output">
          <pre>{record.result}</pre>
        </div>
      )}

      {/* 错误信息 */}
      {isFailed && record.error && (
        <div className="tool-error">{record.error}</div>
      )}
    </ToolCardFrame>
  );
}
