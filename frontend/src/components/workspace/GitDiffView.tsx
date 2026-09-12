/**
 * GitDiffView - git 源码管理面板打开的单文件/单提交 diff 预览
 *
 * 数据源:GET /api/git/diff(gitApi.diff),渲染复用 FilePreviewDiff(unified + 词级高亮)。
 *
 * - worktree/staged:对比某个文件,传递其仓库内相对路径
 * - commit(file 缺省):解析 git show 的全量 diff,展示该提交完整改动
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gitApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useI18n } from '@/i18n';
import type { DiffLine, WordDiffToken } from '@/types';
import { FilePreviewDiff } from './FilePreviewDiff';
import './GitDiffView.css';

interface GitDiffViewProps {
  /** 标签 path:文件级 = 文件绝对路径;commit 全量 = commit hash */
  filePath: string;
  side?: 'worktree' | 'staged' | 'commit';
  hash?: string;
}

interface GitDiffData {
  changes: DiffLine[];
  wordDiff: { old: WordDiffToken[][]; new: WordDiffToken[][] } | null;
  binary: boolean;
}

export function GitDiffView({ filePath, side = 'worktree', hash }: GitDiffViewProps) {
  const { t } = useI18n();
  const workspace = useAppStore((s) => s.workspacePath);
  const [data, setData] = useState<GitDiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 计算仓库内相对路径;workspace 前缀之外的 path(如 commit hash)视为全量 diff(不传 file) */
  const relative = useMemo(() => {
    if (!workspace) return filePath;
    const prefix = workspace.replace(/[/\\]+$/, '');
    if (filePath.startsWith(prefix + '/') || filePath.startsWith(prefix + '\\')) {
      return filePath.slice(prefix.length).replace(/^[/\\]+/, '');
    }
    return '';
  }, [workspace, filePath]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const sideVal = side === 'commit' && !relative ? 'commit' : side;
      const resp = await gitApi.diff(workspace, sideVal, relative || undefined, hash);
      setData({
        changes: resp.changes ?? [],
        wordDiff: resp.wordDiff ?? null,
        binary: resp.binary,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [workspace, relative, side, hash]);

  useEffect(() => {
    if (!workspace) {
      setError(t('git.notRepo'));
      return;
    }
    void load();
  }, [workspace, load, t]);

  return (
    <div className="git-diff-view">
      <div className="git-diff-view-header">
        <span className="git-diff-view-title">{t(`git.diff${side === 'staged' ? 'Staged' : side === 'commit' ? 'Commit' : 'Worktree'}`)}</span>
        <button
          type="button"
          className="git-diff-view-refresh"
          title={t('git.refresh')}
          aria-label={t('git.refresh')}
          onClick={() => void load()}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
            <polyline points="14 2 14 5 11 5" />
            <polyline points="2 14 2 11 5 11" />
          </svg>
        </button>
      </div>

      {loading && <div className="git-diff-view-message">{t('git.loading')}</div>}
      {!loading && error && (
        <div className="git-diff-view-message error">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>{t('chatui.retry')}</button>
        </div>
      )}
      {!loading && !error && data && (
        data.binary ? (
          <div className="git-diff-view-message">{t('git.binary')}</div>
        ) : data.changes.length === 0 ? (
          <div className="git-diff-view-message">{t('git.noChanges')}</div>
        ) : (
          <FilePreviewDiff lines={data.changes} wordDiff={data.wordDiff ?? undefined} filePath={relative} />
        )
      )}
    </div>
  );
}