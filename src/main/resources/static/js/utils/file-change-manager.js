import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { diffModalManager } from './diff-modal.js';
import { EventBus } from './event-bus.js';
import { getFileIconInfo } from './file-icons.js';

export class FileChangeManager {
  constructor() {
    this._refreshTimer = null;
    this._lastChangeSnapshot = null; // 记录上一次变更快照，用于检测新变更
  }

  init() {
    // Activity Bar 面板的列表点击（事件委托，面板 body 始终存在）
    const activityBody = document.getElementById('activityPanelBody');
    if (activityBody) {
      activityBody.addEventListener('click', (e) => {
        const target = e.target.closest('#abFileChangesList');
        if (target) {
          this._handleFileClick(e);
        }
      });
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

  _handleFileClick(e) {
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
  }

  async updateFileChanges() {
    try {
      const response = await fetch('/api/files/changes');
      if (!response.ok) return;
      const changes = await response.json();

      // 右侧面板 DOM 可能已被移除，安全查找
      const list = document.getElementById('fileChangesList');
      const empty = document.getElementById('fileChangesEmpty');
      const statusBarFiles = document.getElementById('statusBarFilesValue');

      // 无变更时的空状态
      if (!changes || changes.length === 0) {
        if (list) list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        const abEmpty = document.getElementById('abFileChangesEmpty');
        const abList = document.getElementById('abFileChangesList');
        if (abList) abList.innerHTML = '';
        if (abEmpty) abEmpty.style.display = 'block';
        if (statusBarFiles) statusBarFiles.textContent = '0';
        return;
      }

      if (empty) empty.style.display = 'none';
      const abEmpty = document.getElementById('abFileChangesEmpty');
      if (abEmpty) abEmpty.style.display = 'none';

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

      if (statusBarFiles) statusBarFiles.textContent = `${fileGroups.size}`;

      // 检测是否有新变更（文件列表或时间戳变化），有则触发文件树刷新
      const currentSnapshot = JSON.stringify(Array.from(fileGroups.entries()).map(([k, v]) => [k, v.latest]));
      if (this._lastChangeSnapshot !== null && currentSnapshot !== this._lastChangeSnapshot) {
        EventBus.emit('file:changes-updated');
      }
      this._lastChangeSnapshot = currentSnapshot;

      const workspaceRoot = window.HippoWorkspace?.currentPath;
      const fileHtml = Array.from(fileGroups.values()).map(c => {
        const fileName = c.filePath.split(/[/\\]/).pop();
        const displayPath = workspaceRoot && c.filePath.startsWith(workspaceRoot)
          ? c.filePath.slice(workspaceRoot.length + 1)
          : c.filePath;
        // 去掉路径末尾的文件名，只保留目录部分
        const dirPath = displayPath.endsWith(fileName)
          ? displayPath.slice(0, -fileName.length).replace(/[/\\]$/, '')
          : displayPath;
        const { iconFile } = getFileIconInfo(fileName);
        const icon = `<img class="file-change-icon-img" src="icons/${iconFile}" draggable="false" alt="">`;

        // Git-style status letter
        let statusLetter, statusClass;
        if (c.toolName === 'delete_file') {
          statusLetter = 'D';
          statusClass = 'status-deleted';
        } else if (c.toolName === 'write_file') {
          statusLetter = 'A';
          statusClass = 'status-added';
        } else {
          statusLetter = 'M';
          statusClass = 'status-modified';
        }

        const itemClass = c.toolName === 'delete_file' ? ' file-change-item-deleted' : '';
        return `
          <div class="file-change-item${itemClass}" data-path="${escapeHtml(c.filePath)}" style="cursor:pointer;">
            <span class="file-change-icon">${icon}</span>
            <div class="file-change-name" title="${escapeHtml(c.filePath)}">
              <span class="file-change-basename">${escapeHtml(fileName)}</span>
              <span class="file-change-path">${escapeHtml(dirPath)}</span>
            </div>
            <button class="file-change-rollback">回滚</button>
            <span class="file-change-status ${statusClass}">${statusLetter}</span>
          </div>
        `;
      }).join('');

      if (list) list.innerHTML = fileHtml;
      // 同步更新 Activity Bar 面板
      const abList = document.getElementById('abFileChangesList');
      if (abList) abList.innerHTML = fileHtml;
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
