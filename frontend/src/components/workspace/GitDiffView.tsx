/**
 * GitDiffView - git 源码管理面板打开的文件 diff 预览
 *
 * 数据源:GET /api/git/diff(gitApi.diff),渲染复用 FilePreviewDiff(unified + 词级高亮)。
 *
 * - worktree/staged:对比某个文件,自动由 workspace 前缀计算仓库内相对路径
 * - commit:filePath 为文件路径时直接渲染该文件 commit diff(父版本 vs 提交版本);
 *   为 hash 时先请求该提交的变更文件列表({@code files})渲染列表,点击某个文件即打开独立
 *   标签页展示该文件 diff(IDE 源码管理面板交互,列表本身不内联切换)。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gitApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import type { DiffLine, WordDiffToken } from '@/types';
import { FilePreviewDiff } from './FilePreviewDiff';
import { FileTypeIcon } from '../FileTypeIcon';
import { gitCommitStatusKind, gitCommitStatusLetter } from '@/utils/git-status';
import './GitDiffView.css';

interface GitDiffViewProps {
  /** 标签 path:文件级 = 文件绝对路径;commit = commit hash */
  filePath: string;
  side?: 'worktree' | 'staged' | 'commit';
  hash?: string;
  /** 精简模式:隐藏标题+刷新头部。用于历史行内联展开的场景(标题已在行上,无独立窗口感) */
  bare?: boolean;
}

interface GitDiffData {
  changes: DiffLine[];
  wordDiff: { old: WordDiffToken[][]; new: WordDiffToken[][] } | null;
  binary: boolean;
}

/** 拼接工作区根路径 + 相对路径(与 GitPanel 同规则,点击文件列表开独立标签页用) */
function joinPath(root: string, file: string): string {
  if (!root) return file;
  return root.replace(/[/\\]+$/, '') + '/' + file;
}

export function GitDiffView({ filePath, side = 'worktree', hash, bare = false }: GitDiffViewProps) {
  const { t } = useI18n();
  const workspace = useAppStore((s) => s.workspacePath);
  const openGitDiff = usePreviewStore((s) => s.openGitDiff);
  const [data, setData] = useState<GitDiffData | null>(null);
  const [commitFiles, setCommitFiles] = useState<{ path: string; status?: string }[] | null>(null);
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

  /** commit 模式下 filePath 指向仓库内某个文件(而非 hash):直接渲染该文件 diff,不再先列文件 */
  const isFileCommit = isCommit && relative !== '';

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

    // commit: filePath 为文件 → 直接取该文件 diff;为 hash → 先列该提交的变更文件
    const targetFile = isFileCommit ? relative : null;
    setData(null);
    if (!targetFile) {
      try {
        const resp = await gitApi.diff(workspace, 'commit', undefined, hash);
        setCommitFiles(resp.files ?? []);
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
  }, [workspace, side, isCommit, isFileCommit, relative, hash, t]);

  // 切换对比目标(hash/side/文件)时复位状态
  useEffect(() => {
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
        ? (isFileCommit ? relative : t('git.diffCommit'))
        : t('git.diffWorktree');

  return (
    <div className={`git-diff-view${bare ? ' bare' : ''}`}>
      {!bare && (
        <div className="git-diff-view-header">
          <span className="git-diff-view-title" title={isFileCommit ? relative : undefined}>{headerTitle}</span>
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
      )}

      {loading && <div className="git-diff-view-message">{t('git.loading')}</div>}
      {!loading && error && (
        <div className="git-diff-view-message error">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>{t('chatui.retry')}</button>
        </div>
      )}

      {/* 提交文件列表:点击某项开独立标签页展示该文件 commit diff(而非在列表内切换) */}
      {!loading && !error && isCommit && !isFileCommit && commitFiles !== null && (
        commitFiles.length === 0 ? (
          <div className="git-diff-view-message">{t('git.noChanges')}</div>
        ) : (
          <div className="git-diff-files">
            {commitFiles.map((f) => {
              // 路径拆为「文件名」+「目录前缀」,文件名为主视觉、目录弱化在后,与变更行一致
              const slash = f.path.lastIndexOf('/');
              const fileName = slash >= 0 ? f.path.slice(slash + 1) : f.path;
              const dirName = slash >= 0 ? f.path.slice(0, slash) : '';
              const badge = gitCommitStatusLetter(f.status);
              const badgeKind = gitCommitStatusKind(f.status);
              return (
                <button
                  key={f.path}
                  type="button"
                  className="git-diff-file-row"
                  title={f.path}
                  onClick={() => openGitDiff(joinPath(workspace ?? '', f.path), { side: 'commit', hash })}
                >
                  <FileTypeIcon fileName={f.path} size={14} className="git-diff-file-icon" />
                  <span className="git-diff-file-name" title={f.path}>{fileName}</span>
                  {dirName && <span className="git-diff-file-dir" title={f.path}>{dirName}/</span>}
                  <span className={`git-panel-badge ${badgeKind}`}>{badge}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* diff 内容:commit 单文件(filePath 直接指向文件) */}
      {!loading && !error && isCommit && isFileCommit && data && (
        data.binary ? (
          <div className="git-diff-view-message">{t('git.binary')}</div>
        ) : data.changes.length === 0 ? (
          <div className="git-diff-view-message">{t('git.noChanges')}</div>
        ) : (
          <FilePreviewDiff lines={data.changes} wordDiff={data.wordDiff ?? undefined} filePath={relative} />
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