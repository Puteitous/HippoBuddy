import { escapeHtml, apiGet, apiPost } from '../utils.js';
import { showToast } from './toast.js';
import { EventBus } from './event-bus.js';
import { getFileIconInfo } from './file-icons.js';

export class DiffModalManager {
  constructor() {
    this.overlay = null;
    this.body = null;
    this.timeline = null;
    this.contentPanel = null;
    this.filePathEl = null;
    this.statsEl = null;
    this.rollbackBtn = null;
    this.currentFilePath = null;
    this.currentToolCallId = null;
    this.allChanges = [];
    this.activeIndex = -1;

    this.init();
  }

  init() {
    this.overlay = document.getElementById('diffModalOverlay');
    this.body = document.getElementById('diffModalBody');
    this.timeline = document.getElementById('diffTimeline');
    this.contentPanel = document.getElementById('diffContentPanel');
    this.filePathEl = document.getElementById('diffFilePath');
    this.statsEl = document.getElementById('diffStats');
    this.netStatsEl = document.getElementById('diffFileNetStats');
    this.rollbackBtn = document.getElementById('diffRollbackBtn');

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

    if (this.rollbackBtn) {
      this.rollbackBtn.addEventListener('click', () => this.rollbackCurrentFile());
    }
  }

  async show(filePath, toolCallId) {
    if (!this.overlay) {
      console.error('Diff modal not initialized');
      return;
    }

    this.currentFilePath = filePath;
    this.currentToolCallId = null;
    this.overlay.style.display = 'flex';

    if (this.filePathEl) {
      const fileName = filePath.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName);
      this.filePathEl.innerHTML = `<img class="diff-file-icon" src="icons/${iconFile}" draggable="false" alt=""> ${escapeHtml(fileName)}`;
    }

    // 重置标题栏净统计（等待接口返回后填充）
    if (this.netStatsEl) {
      this.netStatsEl.innerHTML = '';
      this.netStatsEl.style.display = 'none';
    }

    if (this.timeline) {
      this.timeline.innerHTML = `<div class="diff-timeline-loading">${window.i18n.t('diff.loading')}</div>`;
    }
    if (this.contentPanel) {
      this.contentPanel.innerHTML = `<div class="diff-empty">${window.i18n.t('diff.loading')}</div>`;
    }
    if (this.statsEl) {
      this.statsEl.innerHTML = '';
      this.statsEl.style.display = 'none';
    }
    if (this.rollbackBtn) {
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = window.i18n.t('diff.rollbackBtn');
    }

    try {
      let url = `/api/files/diff?path=${encodeURIComponent(filePath)}&all=true`;
      if (toolCallId) {
        url += `&toolCallId=${encodeURIComponent(toolCallId)}`;
      }
      const data = await apiGet(url);
      this.allChanges = data.allChanges || [];

      // 标题栏净统计：整个文件的净变化（最早 original vs 最新 newContent）
      if (this.netStatsEl) {
        const ns = data.netStats;
        if (ns && (ns[0] > 0 || ns[1] > 0)) {
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

      this.renderTimeline();
      if (this.allChanges.length > 0) {
        let targetIndex = data.targetIndex != null ? data.targetIndex : this.allChanges.length - 1;
        if (targetIndex < 0) {
          // 指定变更已被回滚，降级到最后一个
          targetIndex = this.allChanges.length - 1;
          this.showRollbackWarning();
        }
        this.selectChange(targetIndex);
      } else {
        // 无变更记录
        if (this.contentPanel) {
          this.contentPanel.innerHTML = '';
          if (toolCallId) {
            this.showRollbackWarning();
          }
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'diff-empty';
          emptyDiv.textContent = toolCallId
            ? window.i18n.t('diff.noRecordsRollback')
            : window.i18n.t('diff.noRecords');
          this.contentPanel.appendChild(emptyDiv);
        }
      }
    } catch (e) {
      if (this.contentPanel) {
        this.contentPanel.innerHTML = `<div class="diff-empty">${window.i18n.t('diff.loadFailed')}${escapeHtml(e.message)}</div>`;
      }
      if (this.timeline) {
        this.timeline.innerHTML = '';
      }
    }
  }

  renderTimeline() {
    if (!this.timeline) return;

    if (this.allChanges.length === 0) {
      this.timeline.innerHTML = `<div class="diff-timeline-empty">${window.i18n.t('diff.noRecords')}</div>`;
      return;
    }

    let html = '';
    for (let i = 0; i < this.allChanges.length; i++) {
      const c = this.allChanges[i];
      const time = new Date(c.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const toolLabel = this.getToolLabel(c.toolName);
      const isActive = i === this.activeIndex;

      // 统计该次变更的 +/- 数量
      let added = 0, removed = 0;
      if (c.changes) {
        for (const ch of c.changes) {
          if (ch.type === 'added') added++;
          if (ch.type === 'removed') removed++;
        }
      }
      const statsHtml = (added > 0 || removed > 0)
        ? `<span class="diff-timeline-stats"><span class="diff-added-count">+${added}</span> <span class="diff-removed-count">-${removed}</span></span>`
        : '';

      html += `
        <div class="diff-timeline-item ${isActive ? 'active' : ''}" data-index="${i}">
          <div class="diff-timeline-dot"></div>
          <div class="diff-timeline-content">
            <div class="diff-timeline-time">${escapeHtml(time)}</div>
            <div class="diff-timeline-tool">${escapeHtml(toolLabel)} ${statsHtml}</div>
          </div>
        </div>
      `;
    }
    this.timeline.innerHTML = html;

    this.timeline.querySelectorAll('.diff-timeline-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this.selectChange(idx);
      });
    });
  }

  selectChange(index) {
    if (index < 0 || index >= this.allChanges.length) return;
    this.activeIndex = index;

    this.timeline.querySelectorAll('.diff-timeline-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.index) === index);
    });

    const c = this.allChanges[index];
    this.currentToolCallId = c.toolCallId || '';
    this.renderDiff(c);

    // 二进制文件：隐藏回滚按钮
    if (this.rollbackBtn) {
      this.rollbackBtn.style.display = c.binary ? 'none' : 'inline-block';
    }
  }

  renderDiff(data) {
    if (!this.contentPanel) return;

    if (data.binary) {
      this.contentPanel.innerHTML = `<div class="diff-binary-notice">${window.i18n.t('diff.binary')}</div>`;
      this.updateStats(0, 0);
      return;
    }

    if (!data.changes || data.changes.length === 0) {
      this.contentPanel.innerHTML = `<div class="diff-empty">${window.i18n.t('diff.noContent')}</div>`;
      this.updateStats(0, 0);
      return;
    }

    let addedCount = 0;
    let removedCount = 0;
    let html = '';
    let lineNum = 1;

    for (const change of data.changes) {
      const type = change.type;
      const content = change.content || '';
      const typeSymbol = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';

      if (type === 'added') addedCount++;
      if (type === 'removed') removedCount++;

      html += `<div class="diff-line ${type}">
        <span class="diff-line-num">${type === 'removed' ? '' : lineNum}</span>
        <span class="diff-line-type ${type}">${typeSymbol}</span>
        <span class="diff-line-content">${escapeHtml(content)}</span>
      </div>`;

      if (type !== 'removed') lineNum++;
    }

    this.contentPanel.innerHTML = `<div class="diff-content">${html}</div>`;
    this.updateStats(addedCount, removedCount);

    // 立即定位到第一个变更行，与 innerHTML 在同一帧内完成，避免闪烁
    const firstChange = this.contentPanel.querySelector('.diff-line.added, .diff-line.removed');
    if (firstChange) {
      const panel = this.contentPanel;
      panel.scrollTop = Math.max(0, firstChange.offsetTop - panel.clientHeight / 2 + firstChange.offsetHeight / 2);
    }
  }

  /**
   * 更新底部统计栏：显示当前选中变更的 +/- 行数。
   * 无变更（二进制文件 / 空 diff）时清空并隐藏。
   */
  updateStats(added, removed) {
    if (!this.statsEl) return;
    if (added === 0 && removed === 0) {
      this.statsEl.innerHTML = '';
      this.statsEl.style.display = 'none';
      return;
    }
    this.statsEl.innerHTML =
      `<span class="diff-added-count">+${added}</span>` +
      `<span class="diff-removed-count">-${removed}</span>`;
    this.statsEl.style.display = 'inline-flex';
  }

  showRollbackWarning() {
    // 在内容面板顶部插入提示条
    const warning = document.createElement('div');
    warning.className = 'diff-rollback-warning';
    warning.textContent = window.i18n.t('diff.rolledBack');
    if (this.contentPanel) {
      this.contentPanel.prepend(warning);
    }
  }

  getToolLabel(toolName) {
    switch (toolName) {
      case 'edit_file': return window.i18n.t('diff.typeEdit');
      case 'write_file': return window.i18n.t('diff.typeWrite');
      case 'delete_file': return window.i18n.t('diff.typeDelete');
      default: return toolName;
    }
  }

  async rollbackCurrentFile() {
    if (!this.currentFilePath || !this.rollbackBtn) return;
    if (this.rollbackBtn.classList.contains('rolling')) return;

    this.rollbackBtn.classList.add('rolling');
    this.rollbackBtn.textContent = window.i18n.t('diff.rollingBack');

    try {
      const result = await apiPost('/api/files/rollback', {
        filePath: this.currentFilePath,
        toolCallId: this.currentToolCallId || undefined
      });

      if (result.success) {
        showToast(window.i18n.t('diff.rollbackSuccess') + this.currentFilePath.split(/[/\\]/).pop(), {
          type: 'success',
          duration: 3000
        });
        EventBus.emit('file:changes-updated');
        this.close();
      } else {
        showToast(window.i18n.t('diff.rollbackFailed') + (result.error || window.i18n.t('chatui.unknownError')), {
          type: 'error',
          duration: 3000
        });
        this.rollbackBtn.classList.remove('rolling');
        this.rollbackBtn.textContent = window.i18n.t('diff.rollbackBtn');
      }
    } catch (e) {
      showToast(window.i18n.t('diff.rollbackFailed') + e.message, { type: 'error', duration: 3000 });
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = window.i18n.t('diff.rollbackBtn');
    }
  }

  close() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.currentFilePath = null;
    this.currentToolCallId = null;
    this.allChanges = [];
    this.activeIndex = -1;
  }
}

export const diffModalManager = new DiffModalManager();
// 全局函数，供 inline onclick 使用（tool-timeline-view-btn）
window.showFileDiff = (filePath, toolCallId) => diffModalManager.show(filePath, toolCallId);
