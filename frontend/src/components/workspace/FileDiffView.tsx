/**
 * FileDiffView - 文件变更对比视图(阶段 3.5 简化版)
 *
 * 数据源:GET /api/files/diff?path=xxx&all=true(fileApi.getDiff)
 *
 * 视图:
 *   - 头部:文件名 + 行数统计(+insertions / -deletions)+ 工具操作
 *   - 主体:整文件净 diff(netDiff 逐行渲染,委托 FilePreviewDiff)
 *
 * 简化(留 3.7):
 *   - 不实现历史时间线(仅显示净 diff)
 *   - 不实现 hunk 折叠 / 上下文折叠
 *   - 不实现回滚按钮(留 3.7 RollbackPanel)
 *   - 不实现词级(word-level)行内高亮
 *   - 不实现差分同步滚动
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import type { FileDiffResponse } from '@/types';
import { FilePreviewDiff } from './FilePreviewDiff';
import './FileDiffView.css';

interface FileDiffViewProps {
  /** 文件绝对路径 */
  filePath: string;
  /** 可选:聚焦的 toolCallId(传给后端定位 targetIndex) */
  toolCallId?: string;
}

export function FileDiffView({ filePath, toolCallId }: FileDiffViewProps) {
  const [data, setData] = useState<FileDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string, tcId?: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const resp = await fileApi.getDiff(path, tcId);
      setData(resp);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filePath, toolCallId);
  }, [filePath, toolCallId, load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const [ins, del] = data.netStats ?? [0, 0];
    return { insertions: ins, deletions: del };
  }, [data]);

  return (
    <div className="file-diff-view">
      <div className="file-diff-view-header">
        <div className="file-diff-view-title">
          <span className="file-diff-view-name">{basename(filePath)}</span>
          <span className="file-diff-view-path" title={filePath}>
            {toRelativePath(filePath) || filePath}
          </span>
        </div>
        <div className="file-diff-view-stats">
          {stats && (
            <>
              <span className="diff-stat-add" title="新增行数">+{stats.insertions}</span>
              <span className="diff-stat-del" title="删除行数">-{stats.deletions}</span>
            </>
          )}
        </div>
        <div className="file-diff-view-actions">
          <button
            type="button"
            onClick={() => void load(filePath, toolCallId)}
            title="重新加载"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => void desktopBridge.showItemInFolder(filePath)}
            title="在资源管理器中显示"
          >
            打开位置
          </button>
        </div>
      </div>
      <div className="file-diff-view-body">
        {loading && <div className="file-diff-view-loading">加载中…</div>}
        {error && (
          <div className="file-diff-view-error">
            <p>{error}</p>
            <button type="button" onClick={() => void load(filePath, toolCallId)}>重试</button>
          </div>
        )}
        {!loading && !error && data && (
          data.netDiff && data.netDiff.length > 0 ? (
            <FilePreviewDiff lines={data.netDiff} />
          ) : (
            <div className="file-diff-view-empty">
              {data.allChanges.length === 0
                ? '该文件暂无变更记录'
                : '文件为二进制或无文本差异'}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}
