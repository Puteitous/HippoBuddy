/**
 * WriteFileCard - write_file 工具卡片
 *
 * 渲染:
 *  - 文件路径(可点击跳转)
 *  - 内容 diff(全部为 added,因为是新文件)
 *  - +N 行数统计
 *  - 错误信息(失败时)
 */
import { FilePath, StatusBadge, ToolCardFrame, DiffView, DiffStatsBadge } from './shared';
import { parseToolArgs, ToolCardProps, computeUnifiedDiff } from './shared-utils';
import { useI18n } from '@/i18n';

interface WriteFileArgs {
  path?: string;
  content?: string;
}

export function WriteFileCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<WriteFileArgs>(record.args);
  const filePath = args.path ?? '';
  const content = args.content ?? '';
  const isRunning = record.status === 'running';
  const isFailed = record.status === 'failed';

  const insertions = content ? content.split('\n').length : 0;
  const diffLines = content ? computeUnifiedDiff('', content) : [];

  return (
    <ToolCardFrame
      className="writefile-card"
      icon={<FileIcon />}
      title={t('tool.write.title')}
      statusBadge={
        isRunning ? (
          <StatusBadge status="running" />
        ) : record.status === 'success' ? (
          <DiffStatsBadge insertions={insertions} deletions={0} />
        ) : (
          <StatusBadge status="failed" />
        )
      }
      defaultExpanded={true}
    >
      {filePath && <FilePath path={filePath} />}

      {isRunning && <div className="tool-summary">{t('tool.write.runningShort')}</div>}

      {!isRunning && record.status === 'success' && diffLines.length > 0 && (
        <DiffView diffLines={diffLines} />
      )}

      {isFailed && record.error && <div className="tool-error">{record.error}</div>}
    </ToolCardFrame>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M9 2v3h3" />
    </svg>
  );
}
