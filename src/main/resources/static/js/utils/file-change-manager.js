import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { diffModalManager } from './diff-modal.js';
import { EventBus } from './event-bus.js';
import { ReviewState } from './review-state.js';

export class FileChangeManager {
  constructor() {
    this._refreshTimer = null;
    this._lastChangeSnapshot = null; // 记录上一次变更快照，用于检测新变更
  }

  init() {
    const list = document.getElementById('fileChangesList');
    if (list) {
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.file-change-item');
        if (!item) return;
        
        const filePath = item.dataset.path;
        if (!filePath) return;
        
        const rollbackBtn = e.target.closest('.file-change-rollback');
        if (rollbackBtn) {
          this._rollbackFile(filePath, rollbackBtn);
        } else {
          console.log('📂 FileChangeManager: 点击文件变更, path=', filePath);
          diffModalManager.show(filePath);
        }
      });
    } else {
      console.warn('FileChangeManager: #fileChangesList not found');
    }

    this.updateFileChanges();

    EventBus.on('file:changes-updated', () => {
      this.updateFileChanges();
    });

    EventBus.on('file:review-updated', () => {
      this.updateFileChanges();
    });

    this._refreshTimer = setInterval(() => {
      this.updateFileChanges();
    }, 15000);
  }

  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  async updateFileChanges() {
    try {
      const response = await fetch('/api/files/changes');
      if (!response.ok) return;
      const changes = await response.json();
      const list = document.getElementById('fileChangesList');
      const empty = document.getElementById('fileChangesEmpty');
      if (!list || !empty) return;

      if (!changes || changes.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        const statusBarFiles = document.getElementById('statusBarFilesValue');
        if (statusBarFiles) statusBarFiles.textContent = '0';
        return;
      }

      empty.style.display = 'none';

      // 按文件路径分组，只显示每组最新一条，附带修改次数
      const fileGroups = new Map();
      for (const c of changes) {
        const existing = fileGroups.get(c.filePath);
        if (existing) {
          existing.count++;
          if (c.timestamp > existing.latest) {
            existing.latest = c.timestamp;
            existing.toolName = c.toolName;
          }
        } else {
          fileGroups.set(c.filePath, {
            filePath: c.filePath,
            toolName: c.toolName,
            timestamp: c.timestamp,
            latest: c.timestamp,
            count: 1
          });
        }
      }

      const statusBarFiles = document.getElementById('statusBarFilesValue');
      if (statusBarFiles) statusBarFiles.textContent = `${fileGroups.size}`;

      // 检测是否有新变更（文件列表或时间戳变化），有则触发文件树刷新
      const currentSnapshot = JSON.stringify(Array.from(fileGroups.entries()).map(([k, v]) => [k, v.latest]));
      if (this._lastChangeSnapshot !== null && currentSnapshot !== this._lastChangeSnapshot) {
        EventBus.emit('file:changes-updated');
      }
      this._lastChangeSnapshot = currentSnapshot;

      list.innerHTML = Array.from(fileGroups.values()).map(c => {
        const fileName = c.filePath.split(/[/\\]/).pop();
        const time = new Date(c.latest).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const icon = c.toolName === 'delete_file'
          ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h10"/><path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6"/></svg>'
          : '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/></svg>';
        const badge = c.count > 1 ? `<span class="file-change-badge">${c.count}次</span>` : '';
        const reviewStatus = ReviewState.isRolledBack(c.filePath);
        const reviewDot = reviewStatus ? '<span class="file-review-dot rolled-back" title="已撤销">↩</span>' : '';
        return `
          <div class="file-change-item" data-path="${escapeHtml(c.filePath)}" style="cursor:pointer;">
            <span class="file-change-icon">${icon}</span>
            <div class="file-change-info">
              <div class="file-change-path" title="${escapeHtml(c.filePath)}">${escapeHtml(fileName)} ${reviewDot}</div>
              <div class="file-change-meta">
                <span>${escapeHtml(time)}</span>
                <span class="file-change-tool">${escapeHtml(c.toolName)}</span>
                ${badge}
              </div>
            </div>
            <button class="file-change-rollback">回滚</button>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('获取文件变更失败:', e);
    }
  }

  async _rollbackFile(filePath, btnEl) {
    if (btnEl.classList.contains('rolling')) return;
    btnEl.classList.add('rolling');
    btnEl.textContent = '回滚中...';

    try {
      const response = await fetch('/api/files/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const result = await response.json();

      if (result.success) {
        showToast(`文件已恢复：${filePath.split(/[/\\]/).pop()}`, { type: 'success', duration: 3000 });
        this.updateFileChanges();
        EventBus.emit('file:changes-updated');
      } else {
        showToast(`回滚失败：${result.error || '未知错误'}`, { type: 'error', duration: 3000 });
        btnEl.classList.remove('rolling');
        btnEl.textContent = '回滚';
      }
    } catch (e) {
      showToast(`回滚失败：${e.message}`, { type: 'error', duration: 3000 });
      btnEl.classList.remove('rolling');
      btnEl.textContent = '回滚';
    }
  }
}
