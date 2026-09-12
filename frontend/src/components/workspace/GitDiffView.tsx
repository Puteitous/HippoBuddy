/**
 * GitDiffView - git 源码管理面板打开的文件 diff 预览
 *
 * 数据源:GET /api/git/diff(gitApi.diff),渲染复用 FilePreviewDiff(unified + 词级高亮)。
 *
 * - worktree/staged:对比某个文件,自动由 workspace 前缀计算仓库内相对路径
 * - commit:先请求该提交的变更文件列表({@code files}),渲染列表;点击某个文件后再请求
 *   该文件的单文件 commit diff(父版本 vs 提交版本)。列表仅一个文件时自动进入 diff。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gitApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useI18n } from '@/i18n';
import type { DiffLine, WordDiffToken } from '@/types';
import { FilePreviewDiff } from './FilePreviewDiff';
import { FileTypeIcon } from '../FileTypeIcon';
import './GitDiffView.css';

interface GitDiffViewProps {
  /** 标签 path:文件级 = 文件绝对路径;commit = commit hash */
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
  const [commitFiles, setCommitFiles] = useState<string[] | null>(null);
  const [selFile, setSelFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCommit = side === 'commit';

  /** 文件级:由 workspace 前缀计算仓库内相对路径 */
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
    if (!isCommit) {
      // worktree / staged: 直接取单文件 diff
      setData(null);
      try {
        const resp = await gitApi.diff(workspace, side, relative, hash);
        setData({
          changes: resp.changes ?? [],
          wordDiff: resp.wordDiff ?? null,
          binary: resp.binary,
        });
        setCommitFiles(null);
      } catch (e) {
        setError(e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    // commit: 未选文件 → 取文件列表;已选文件 → 取单文件 commit diff
    const targetFile = selFile;
    setData(null);
    if (!targetFile) {
      try {
        const resp = await gitApi.diff(workspace, 'commit', undefined, hash);
        const files = resp.files ?? [];
        setCommitFiles(files);
        // 仅一个文件:自动进入单文件 diff
        if (files.length === 1) {
          setSelFile(files[0]);
        }
      } catch (e) {
        setError(e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const resp = await gitApi.diff(workspace, 'commit', targetFile, hash);
      setData({
        changes: resp.changes ?? [],
        wordDiff: resp.wordDiff ?? null,
        binary: resp.binary,
      });
    } catch (e) {
      setError(e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspace, side, isCommit, relative, hash, selFile, t]);

  // 切换对比目标(hash/side/文件)时复位选择
  useEffect(() => {
    setSelFile(null);
    setCommitFiles(null);
    setData(null);
    setError(null);
  }, [hash, side, filePath, workspace]);

  useEffect(() => {
    if (!workspace) {
      setError(t('git.notRepo'));
      return;
    }
    void load();
  }, [workspace, load, t]);

  const headerTitle =
    side === 'staged'
      ? t('git.diffStaged')
      : side === 'commit'
        ? (selFile ?? t('git.diffCommit'))
        : t('git.diffWorktree');

  return (
    <div className="git-diff-view">
      <div className="git-diff-view-header">
        <span className="git-diff-view-title" title={selFile ?? undefined}>{headerTitle}</span>
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

      {/* 提交文件列表 */}
      {!loading && !error && isCommit && !selFile && commitFiles !== null && (
        commitFiles.length === 0 ? (
          <div className="git-diff-view-message">{t('git.noChanges')}</div>
        ) : (
          <div className="git-diff-files">
            {commitFiles.map((f) => (
              <button
                key={f}
                type="button"
                className="git-diff-file-row"
                title={f}
                onClick={() => setSelFile(f)}
              >
                <span className="git-diff-file-icon" aria-hidden>
                  <FileTypeIcon fileName={f} size={14} />
                </span>
                <span className="git-diff-file-name">{f}</span>
              </button>
            ))}
          </div>
        )
      )}

      {/* diff 内容 */}
      {!loading && !error && isCommit && selFile && data && (
        data.binary ? (
          <div className="git-diff-view-message">{t('git.binary')}</div>
        ) : data.changes.length === 0 ? (
          <div className="git-diff-view-message">{t('git.noChanges')}</div>
        ) : (
          <FilePreviewDiff lines={data.changes} wordDiff={data.wordDiff ?? undefined} filePath={selFile} />
        )
      )}

      {/* worktree / staged 文件 diff */}
      {!loading && !error && !isCommit && data && (
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