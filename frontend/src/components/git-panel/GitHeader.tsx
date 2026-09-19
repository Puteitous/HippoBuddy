/**
 * GitHeader - 面板头部(分支切换 + 刷新 + 提交提示词设置 + 同步菜单触发)
 *
 * 仅负责按钮与 loading 态展示,下拉/菜单本体由 GitPanel 组装层渲染
 * (BranchDropdown/SyncMenu 需要面板级状态与回调)。展开态由组装层直接读取,
 * 不传入本组件,保持 DOM 结构零变化。
 */
import type { RefObject } from 'react';
import { useI18n } from '@/i18n';

export function GitHeader({
  currentBranch,
  available,
  busy,
  loading,
  remoteOp,
  branchTriggerRef,
  syncTriggerRef,
  onToggleBranch,
  onToggleSync,
  onRefresh,
  onOpenCommitPromptSettings,
}: {
  currentBranch: string;
  available: boolean;
  busy: boolean;
  loading: boolean;
  remoteOp: 'fetch' | 'pull' | 'push' | null;
  branchTriggerRef: RefObject<HTMLButtonElement>;
  syncTriggerRef: RefObject<HTMLButtonElement>;
  onToggleBranch: () => void;
  onToggleSync: () => void;
  onRefresh: () => void;
  onOpenCommitPromptSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="git-panel-header">
      <button
        type="button"
        className="git-panel-branch-trigger"
        ref={branchTriggerRef}
        title={t('git.manageBranch')}
        disabled={busy || !available}
        onClick={onToggleBranch}
      >
        <span className="git-panel-branch-current">{currentBranch || t('git.noBranch')}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <button
        type="button"
        className="git-panel-icon-btn"
        title={t('git.refresh')}
        aria-label={t('git.refresh')}
        disabled={loading}
        onClick={onRefresh}
      >
        <svg className={loading ? 'git-panel-spin' : undefined} viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
          <polyline points="14 2 14 5 11 5" />
          <polyline points="2 14 2 11 5 11" />
        </svg>
      </button>
      <button
        type="button"
        className="git-panel-icon-btn git-panel-prompt-btn"
        title={t('git.commitPromptSettings')}
        aria-label={t('git.commitPromptSettings')}
        disabled={busy || !available}
        onClick={onOpenCommitPromptSettings}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.5 2.5l3 3-6 6-3.5.5.5-3.5 6-6zM4 13h9" />
        </svg>
      </button>
      <button
        type="button"
        className="git-panel-icon-btn git-panel-sync-btn"
        ref={syncTriggerRef}
        title={t('git.more')}
        aria-label={remoteOp ? t('git.loading') : t('git.more')}
        disabled={busy || !available}
        onClick={onToggleSync}
      >
        {remoteOp ? (
          <span className="git-panel-btn-spin" role="status" aria-label={t('git.loading')} />
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>
    </div>
  );
}
