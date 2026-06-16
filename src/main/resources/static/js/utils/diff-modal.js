import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { EventBus } from './event-bus.js';

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
      this.filePathEl.textContent = filePath.split(/[/\\]/).pop();
    }

    if (this.timeline) {
      this.timeline.innerHTML = '<div class="diff-timeline-loading">加载中...</div>';
    }
    if (this.contentPanel) {
      this.contentPanel.innerHTML = '<div class="diff-empty">加载中...</div>';
    }
    if (this.statsEl) {
      this.statsEl.innerHTML = '';
    }
    if (this.rollbackBtn) {
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = '回滚此变更';
    }

    try {
      let url = `/api/files/diff?path=${encodeURIComponent(filePath)}&all=true`;
      if (toolCallId) {
        url += `&toolCallId=${encodeURIComponent(toolCallId)}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('加载失败');
      }
      const data = await response.json();
      this.allChanges = data.allChanges || [];
      this.renderTimeline();
      if (this.allChanges.length > 0) {
        const targetIndex = data.targetIndex != null ? data.targetIndex : this.allChanges.length - 1;
        this.selectChange(targetIndex);
      }
    } catch (e) {
      if (this.contentPanel) {
        this.contentPanel.innerHTML = `<div class="diff-empty">加载失败：${escapeHtml(e.message)}</div>`;
      }
      if (this.timeline) {
        this.timeline.innerHTML = '';
      }
    }
  }

  renderTimeline() {
    if (!this.timeline) return;

    if (this.allChanges.length === 0) {
      this.timeline.innerHTML = '<div class="diff-timeline-empty">无变更记录</div>';
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
      html += `
        <div class="diff-timeline-item ${isActive ? 'active' : ''}" data-index="${i}">
          <div class="diff-timeline-dot"></div>
          <div class="diff-timeline-content">
            <div class="diff-timeline-time">${escapeHtml(time)}</div>
            <div class="diff-timeline-tool">${escapeHtml(toolLabel)}</div>
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
  }

  renderDiff(data) {
    if (!this.contentPanel) return;

    if (!data.changes || data.changes.length === 0) {
      this.contentPanel.innerHTML = '<div class="diff-empty">无变更内容</div>';
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

    if (this.statsEl) {
      this.statsEl.innerHTML = `<span class="diff-added-count">+${addedCount}</span> <span class="diff-removed-count">-${removedCount}</span>`;
    }

    this.contentPanel.scrollTop = 0;
  }

  getToolLabel(toolName) {
    switch (toolName) {
      case 'edit_file': return '编辑文件';
      case 'write_file': return '写入文件';
      case 'delete_file': return '删除文件';
      default: return toolName;
    }
  }

  async rollbackCurrentFile() {
    if (!this.currentFilePath || !this.rollbackBtn) return;
    if (this.rollbackBtn.classList.contains('rolling')) return;

    this.rollbackBtn.classList.add('rolling');
    this.rollbackBtn.textContent = '回滚中...';

    try {
      const response = await fetch('/api/files/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: this.currentFilePath,
          toolCallId: this.currentToolCallId || undefined
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`文件已恢复：${this.currentFilePath.split(/[/\\]/).pop()}`, {
          type: 'success',
          duration: 3000
        });
        EventBus.emit('file:changes-updated');
        this.close();
      } else {
        showToast(`回滚失败：${result.error || '未知错误'}`, {
          type: 'error',
          duration: 3000
        });
        this.rollbackBtn.classList.remove('rolling');
        this.rollbackBtn.textContent = '回滚此变更';
      }
    } catch (e) {
      showToast(`回滚失败：${e.message}`, { type: 'error', duration: 3000 });
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = '回滚此变更';
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
