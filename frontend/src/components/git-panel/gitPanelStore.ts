/**
 * gitPanelStore - GitPanel 的模块级持久状态
 *
 * 面板随 ActivityBar 关闭/切换而整体卸载,状态归零。这里存放两个跨卸载周期
 * 需要保留的模块级数据,并统一提供读写入口,保证多文件拆分后只有一份归属:
 *  - panelSnapshot:已拉取的面板数据快照,重开时作首帧数据,刷新改为后台静默替换,
 *    避免整面板闪一下"加载中";
 *  - commitDraft:提交信息草稿,重开恢复已写内容。
 */
import type { GitLogEntry, GitStatusEntry } from '@/api/client';

/** 面板数据快照(模块级):重开面板时以同一工作区的快照作首帧数据 */
export interface GitPanelSnapshot {
  /** 快照归属的工作区;与当前工作区不一致时整份作废(避免串仓库数据) */
  workspacePath: string;
  status: GitStatusEntry[] | null;
  available: boolean;
  branchNames: string[];
  remoteBranchNames: string[];
  currentBranch: string;
  log: GitLogEntry[];
  logEnded: boolean;
}

let panelSnapshot: GitPanelSnapshot | null = null;

/** 提交信息草稿(模块级):面板随 ActivityBar 关闭/切换而卸载时保留已写内容,重开恢复 */
let commitDraft = '';

export function getPanelSnapshot(): GitPanelSnapshot | null {
  return panelSnapshot;
}

export function setPanelSnapshot(snapshot: GitPanelSnapshot): void {
  panelSnapshot = snapshot;
}

export function getCommitDraft(): string {
  return commitDraft;
}

export function setCommitDraft(draft: string): void {
  commitDraft = draft;
}

/** 仅供测试:重置面板快照与提交草稿,避免用例间相互污染(对齐 MetricsPanel 的 __reset 惯例) */
export function __resetGitPanelSnapshot(): void {
  panelSnapshot = null;
  commitDraft = '';
}
