/**
 * GitPanel - 源码管理面板(ActivityBar 浮动面板)
 *
 * 组装层:状态与操作全部来自 useGitPanel,渲染拆分为纯展示子组件,
 * 本文件只保留「分区装配 + 弹层挂载」,并对测试导出 __resetGitPanelSnapshot。
 *
 * DOM 结构(含各 portal 在 body 的挂载顺序)与拆分前逐字节一致。
 *
 * 数据源:后端 /api/git/* 系列(gitApi):
 *   status(已暂存/未暂存分组)、log(分页历史)、branch、operate(暂存/取消/提交/切分支)
 */
// 测试契约:需要从本文件导出 __resetGitPanelSnapshot(react-refresh 要求仅导出组件,此处豁免)
/* eslint-disable react-refresh/only-export-components */
import { createPortal } from 'react-dom';
import { useGitPanel } from './useGitPanel';
import { GitHeader } from './GitHeader';
import { GitCommitBar } from './GitCommitBar';
import { GitStatusList } from './GitStatusList';
import { GitHistoryList, GitLogTip } from './GitHistoryList';
import { GitContextMenu, ConfirmDialog, BranchDropdown, SyncMenu, InputDialog } from './GitOverlays';
import './GitPanel.css';

export { __resetGitPanelSnapshot } from './gitPanelStore';

export function GitPanel() {
  const p = useGitPanel();
  // 解构成局部 const:TS 对属性访问(p.confirm)不做闭包收窄,局部 const 可保证非空
  const confirm = p.confirm;

  if (!p.workspacePath) {
    return <div className="git-panel-empty">{p.t('git.notRepo')}</div>;
  }

  return (
    <div className="git-panel">
      <GitHeader
        currentBranch={p.currentBranch}
        available={p.available}
        busy={p.busy}
        loading={p.loading}
        remoteOp={p.remoteOp}
        branchTriggerRef={p.branchTriggerRef}
        syncTriggerRef={p.syncTriggerRef}
        onToggleBranch={() => p.setBranchOpen((v) => !v)}
        onToggleSync={() => {
          p.setSyncOpen((v) => !v);
          p.setBranchOpen(false);
        }}
        onRefresh={() => void p.refresh()}
        onOpenCommitPromptSettings={p.openCommitPromptSettings}
      />

      {/* 提交信息区(置于面板顶部,贴近 IDE 习惯) */}
      {!p.showLoading && p.available && (
        <GitCommitBar
          commitMsg={p.commitMsg}
          commitMsgRef={p.commitMsgRef}
          busy={p.busy}
          aiMsgLoading={p.aiMsgLoading}
          canGenerate={p.stagedCount > 0 || p.unstagedEntries.length > 0}
          canCommit={p.stagedCount > 0}
          onCommitMsgChange={(value) => {
            p.setCommitMsg(value);
            p.setError(null);
          }}
          onCommit={p.commit}
          onGenerate={p.generateCommitMessage}
        />
      )}

      {p.showLoading && <div className="git-panel-placeholder">{p.t('git.loading')}</div>}
      {!p.showLoading && !p.available && (
        <div className="git-panel-empty">
          <div className="git-panel-empty-desc">{p.t('git.notRepo')}</div>
          <div className="git-panel-empty-hint">{p.t('git.initRepoDesc')}</div>
          <button
            type="button"
            className="git-panel-init-btn"
            disabled={p.busy}
            onClick={p.initRepo}
          >
            {p.busy ? <span className="git-panel-btn-spin" role="status" aria-label={p.t('git.loading')} /> : p.t('git.initRepo')}
          </button>
        </div>
      )}
      {!p.showLoading && p.error && <div className="git-panel-error">{p.error}</div>}

      {!p.showLoading && p.available && (
        <>
          {p.stagedCount > 0 && (
            <GitStatusList
              title={`${p.t('git.staged')} (${p.stagedCount})`}
              actionLabel={p.t('git.unstageAll')}
              entries={p.stagedEntries}
              busy={p.busy}
              prefix="s"
              toggleLabel={p.t('git.unstage')}
              onAction={() => p.stageAll(true)}
              onOpen={p.openWorktreeDiff}
              onToggle={p.stageEntry}
              onDiscard={p.discardEntry}
              onContextMenu={p.openCtxMenu}
            />
          )}

          {p.unstagedEntries.length > 0 && (
            <GitStatusList
              title={`${p.t('git.unstaged')} (${p.unstagedEntries.length})`}
              actionLabel={p.t('git.stageAll')}
              entries={p.unstagedEntries}
              busy={p.busy}
              prefix="u"
              toggleLabel={p.t('git.stage')}
              onAction={() => p.stageAll(false)}
              onOpen={p.openWorktreeDiff}
              onToggle={p.stageEntry}
              onDiscard={p.discardEntry}
              onContextMenu={p.openCtxMenu}
            />
          )}

          <GitHistoryList
            log={p.log}
            logEnded={p.logEnded}
            logLoadingMore={p.logLoadingMore}
            expandedHash={p.expandedHash}
            busy={p.busy}
            onToggleCommitDiff={p.toggleCommitDiff}
            onOpenLogMenu={p.openLogMenu}
            onShowLogTip={p.showLogTip}
            onHideLogTip={p.hideLogTip}
            onLoadMore={p.loadMoreLog}
          />
        </>
      )}

      {/* 右键菜单(portal 到 body,避免面板 overflow 裁剪) */}
      {p.ctxMenu && createPortal(
        <GitContextMenu
          x={p.ctxMenu.x}
          y={p.ctxMenu.y}
          items={[
            { label: p.ctxMenu.entry.untracked ? p.t('git.discardDelLabel') : p.t('git.discard'), action: 'discard', danger: true },
          ]}
          onSelect={p.handleStatusMenu}
          onClose={p.closeMenus}
        />,
        document.body,
      )}
      {p.logMenu && createPortal(
        <GitContextMenu
          x={p.logMenu.x}
          y={p.logMenu.y}
          items={[
            { label: p.t('git.revert'), action: 'revert', danger: true },
            { label: p.t('git.cherryPick'), action: 'cherryPick', danger: true },
          ]}
          onSelect={p.handleLogMenu}
          onClose={p.closeMenus}
        />,
        document.body,
      )}

      {/* 历史行悬浮详情卡片(portal 到 body,避免面板 overflow 裁剪;纯展示不拦截事件) */}
      {p.logTip && <GitLogTip logTip={p.logTip} logTipRef={p.logTipRef} />}

      {/* 分支下拉(portal 到 body,避免面板 overflow 裁剪) */}
      {p.branchOpen && p.available && (
        <BranchDropdown
          triggerRef={p.branchTriggerRef}
          currentBranch={p.currentBranch}
          names={p.branchNames}
          remotes={p.remoteBranchNames}
          onCheckout={p.checkout}
          onOpenBranchCtx={p.openBranchCtx}
          onCreate={p.openCreateBranchDialog}
          onClose={() => p.setBranchOpen(false)}
        />
      )}
      {/* 同步(远端操作)菜单 */}
      {p.syncOpen && p.available && !p.busy && (
        <SyncMenu
          triggerRef={p.syncTriggerRef}
          remoteOp={p.remoteOp}
          pushDisabled={!p.currentBranch}
          onSelect={p.runRemote}
          onClose={() => p.setSyncOpen(false)}
        />
      )}
      {/* 分支项右键菜单:基于此新建 / 重命名 / 删除(当前分支禁删) */}
      {p.branchCtx && createPortal(
        <GitContextMenu
          x={p.branchCtx.x}
          y={p.branchCtx.y}
          items={[
            { label: p.t('git.newBranchFrom'), action: 'createFrom', danger: false },
            { label: p.t('git.renameBranch'), action: 'rename', danger: false },
            ...(p.branchCtx.branch !== p.currentBranch
              ? [{ label: p.t('git.deleteBranch'), action: 'delete', danger: true }]
              : []),
          ]}
          onSelect={p.handleBranchMenu}
          onClose={() => p.setBranchCtx(null)}
        />,
        document.body,
      )}
      {/* 分支新建/重命名输入弹窗 */}
      {p.branchInput && (
        <InputDialog
          title={p.branchInput.mode === 'create' ? p.t('git.newBranchTitle') : p.t('git.renameBranchTitle')}
          placeholder={p.t('git.branchPlaceholder')}
          initialValue={p.branchInput.mode === 'rename' ? p.branchInput.branch ?? '' : ''}
          submitLabel={p.branchInput.mode === 'create' ? p.t('git.createBtn') : p.t('git.renameBtn')}
          // 新建时提示起始点:显式选择的分支,否则当前 HEAD(git branch <name> 的默认语义)
          hint={
            p.branchInput.mode === 'create'
              ? p.t('git.branchFromHint', {
                  branch: p.branchInput.startPoint || p.t('git.branchFromHead'),
                })
              : undefined
          }
          onCancel={() => p.setBranchInput(null)}
          onSubmit={p.submitBranchInput}
        />
      )}

      {/* 危险操作确认弹窗(复用 file-tree-modal-* 样式) */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={p.confirmMessage}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => p.setConfirm(null)}
          onConfirm={() => {
            const pending = confirm;
            p.setConfirm(null);
            pending.onConfirm();
          }}
        />
      )}
    </div>
  );
}
