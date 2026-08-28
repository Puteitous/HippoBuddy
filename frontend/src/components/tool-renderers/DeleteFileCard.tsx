/**
 * DeleteFileCard - delete_file 工具卡片
 *
 * 渲染:
 *  - 删除的文件/目录列表(可点击跳转)
 *  - 结果摘要(成功数 / 失败数 / 跳过数)
 *  - 错误信息(失败时)
 *
 * 注:旧版区分"用户拒绝"场景显示"已取消",3.3 简化为统一 failed 状态。
 */
import { FilePath, StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';
import { useI18n } from '@/i18n';

interface DeleteFileArgs {
  paths?: string[];
}

export function DeleteFileCard({ record }: ToolCardProps) {
  const { t } = useI18n();
  const args = parseToolArgs<DeleteFileArgs>(record.args);
  const paths = Array.isArray(args.paths) ? args.paths : [];
  const isRunning = record.status === 'running';
  const isFailed = record.status === 'failed';

  return (
    <ToolCardFrame
      className="deletefile-card"
      icon={<TrashIcon />}
      title={t('tool.delete.title')}
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={true}
    >
      {paths.length > 0 && (
        <div className="tool-summary">
          {paths.length === 1 ? (
            <FilePath path={paths[0]} />
          ) : (
            <div>
              <div>{t('tool.delete.summary', { count: paths.length })}</div>
              {paths.map((p, i) => (
                <FilePath key={i} path={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {isRunning && <div className="tool-summary">{t('tool.delete.running')}</div>}

      {!isRunning && record.result && (
        <div className="tool-result">
          <pre>{record.result}</pre>
        </div>
      )}

      {isFailed && record.error && <div className="tool-error">{record.error}</div>}
    </ToolCardFrame>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h10" />
      <path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
    </svg>
  );
}
