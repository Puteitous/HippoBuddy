/**
 * EditFileCard - edit_file 工具卡片
 *
 * 渲染:
 *  - 文件路径(可点击跳转)
 *  - old_text → new_text 的统一 diff
 *  - +X -Y 行数统计
 *  - 错误信息(失败时)
 */
import { FilePath, StatusBadge, ToolCardFrame, DiffView, DiffStatsBadge } from './shared';
import { parseToolArgs, ToolCardProps, computeUnifiedDiff, countDiffStats } from './shared-utils';
import { useI18n } from '@/i18n';

interface EditFileArgs {
  path?: string;
  old_text?: string;
  new_text?: string;
}

export function EditFileCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<EditFileArgs>(record.args);
  const filePath = args.path ?? '';
  const oldText = args.old_text ?? '';
  const newText = args.new_text ?? '';
  const isRunning = record.status === 'running';
  const isFailed = record.status === 'failed';

  const diffLines = !isRunning ? computeUnifiedDiff(oldText, newText) : [];
  const stats = !isRunning ? countDiffStats(oldText, newText) : { insertions: 0, deletions: 0 };

  return (
    <ToolCardFrame
      className="editfile-card"
      icon={<EditIcon />}
      title={t('tool.edit.title')}
      statusBadge={
        isRunning ? (
          <StatusBadge status="running" />
        ) : record.status === 'success' ? (
          <DiffStatsBadge insertions={stats.insertions} deletions={stats.deletions} />
        ) : (
          <StatusBadge status="failed" />
        )
      }
      defaultExpanded={true}
    >
      {filePath && <FilePath path={filePath} />}

      {isRunning && <div className="tool-summary">{t('tool.edit.runningShort')}</div>}

      {!isRunning && record.status === 'success' && diffLines.length > 0 && (
        <DiffView diffLines={diffLines} />
      )}

      {isFailed && record.error && <div className="tool-error">{record.error}</div>}
    </ToolCardFrame>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2a2 2 0 0 1 3 3L5 14H2v-3l9-9z" />
    </svg>
  );
}
