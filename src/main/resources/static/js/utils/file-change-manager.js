import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { diffModalManager } from './diff-modal.js';
import { EventBus } from './event-bus.js';

export class FileChangeManager {
  constructor() {
    this._refreshTimer = null;
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

      list.innerHTML = Array.from(fileGroups.values()).map(c => {
        const fileName = c.filePath.split(/[/\\]/).pop();
        const time = new Date(c.latest).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const icon = c.toolName === 'delete_file' ? '🗑️' : '📝';
        const badge = c.count > 1 ? `<span class="file-change-badge">${c.count}次</span>` : '';
        return `
          <div class="file-change-item" data-path="${escapeHtml(c.filePath)}" style="cursor:pointer;">
            <span class="file-change-icon">${icon}</span>
            <div class="file-change-info">
              <div class="file-change-path" title="${escapeHtml(c.filePath)}">${escapeHtml(fileName)}</div>
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
