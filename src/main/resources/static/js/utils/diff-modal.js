/**
 * DiffModalManager — 文件变更对比弹窗（薄壳）
 *
 * 负责弹窗的 header（文件名/净统计/关闭/文件树定位）与开关逻辑，
 * 时间线 + diff 内容 + 回滚等渲染全部委托给共享组件 FileDiffView。
 */

import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { getFileIconInfo } from './file-icons.js';
import { FileDiffView } from '../components/FileDiffView.js';

export class DiffModalManager {
  constructor() {
    this.overlay = null;
    this.viewHost = null;
    this.filePathEl = null;
    this.netStatsEl = null;
    this.currentFilePath = null;
    this._view = null; // FileDiffView 实例

    this.init();
  }

  init() {
    this.overlay = document.getElementById('diffModalOverlay');
    this.viewHost = document.getElementById('diffModalViewHost');
    this.filePathEl = document.getElementById('diffFilePath');
    this.netStatsEl = document.getElementById('diffFileNetStats');

    if (!this.overlay) {
      console.warn('Diff modal overlay not found');
      return;
    }

    this.bindEvents();
  }

  bindEvents() {
    if (!this.overlay) return;

    const closeBtn = document.getElementById('diffModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    this.overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // 点击文件名 → 在文件树中定位该文件
    if (this.filePathEl) {
      this.filePathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.revealInTree();
      });
    }
  }

  /**
   * 关闭弹窗并在文件树中定位当前文件（切换文件视图、展开父目录并高亮）。
   * 工作区未打开等降级场景给出提示。
   */
  async revealInTree() {
    if (!this.currentFilePath) return;
    const filePath = this.currentFilePath;
    this.close();

    const ws = window.HippoWorkspace;
    if (!ws || typeof ws.revealFileInTree !== 'function') {
      showToast(window.i18n.t('diff.revealNoWorkspace'), { type: 'warning', duration: 3000 });
      return;
    }
    const ok = await ws.revealFileInTree(filePath);
    if (!ok) {
      showToast(window.i18n.t('diff.revealNoWorkspace'), { type: 'warning', duration: 3000 });
    }
  }

  async show(filePath, toolCallId) {
    if (!this.overlay) {
      console.error('Diff modal not initialized');
      return;
    }

    this.currentFilePath = filePath;
    this.overlay.style.display = 'flex';

    // header：文件名 + 图标
    if (this.filePathEl) {
      const fileName = filePath.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName);
      this.filePathEl.innerHTML = `<img class="diff-file-icon" src="icons/${iconFile}" draggable="false" alt=""> ${escapeHtml(fileName)}`;
      this.filePathEl.title = window.i18n.t('diff.revealInTreeTip');
    }

    // header：净统计（由 FileDiffView 加载后回调填充）
    if (this.netStatsEl) {
      this.netStatsEl.innerHTML = '';
      this.netStatsEl.style.display = 'none';
    }

    // 重建视图实例（保证每次打开都是干净状态）
    if (this._view) {
      this._view.destroy();
      this._view = null;
    }
    if (this.viewHost) {
      this.viewHost.innerHTML = '';
      this._view = new FileDiffView(this.viewHost, {
        onNetStats: (ns) => this._updateNetStats(ns),
        onRollback: () => this.close(),
        // 点击"在编辑器中打开"→ 关闭弹窗并跳转到该文件的编辑 tab，定位到首个变更行
        onOpenInEditor: (fp, line) => {
          this.close();
          const ws = window.HippoWorkspace;
          if (ws && typeof ws.navigateToFile === 'function') {
            ws.navigateToFile(fp, line || undefined);
          }
        },
      });
      await this._view.load(filePath, toolCallId);
    }
  }

  _updateNetStats(netStats) {
    if (!this.netStatsEl) return;
    const ns = netStats || [0, 0];
    if (ns[0] > 0 || ns[1] > 0) {
      this.netStatsEl.innerHTML =
        `<span class="diff-file-netstats-add">+${ns[0]}</span>` +
        `<span class="diff-file-netstats-del">-${ns[1]}</span>`;
      this.netStatsEl.title = window.i18n.t('diff.netStatsTip');
      this.netStatsEl.style.display = 'inline-flex';
    } else {
      this.netStatsEl.innerHTML = '';
      this.netStatsEl.style.display = 'none';
    }
  }

  close() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.currentFilePath = null;
  }
}

export const diffModalManager = new DiffModalManager();
// 全局函数，供 inline onclick 使用（tool-timeline-view-btn）
// 统一分流：桌面端（有工作区标签系统）→ diff 标签页；Web 端 → 弹窗降级
window.showFileDiff = (filePath, toolCallId) => {
  const ws = window.HippoWorkspace;
  if (ws && ws.isAvailable && typeof ws.openFileDiff === 'function') {
    ws.openFileDiff(filePath, toolCallId);
  } else {
    diffModalManager.show(filePath, toolCallId);
  }
};
