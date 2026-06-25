import { escapeHtml, apiGet, apiPost } from '../utils.js';
import { showToast } from './toast.js';
import { diffModalManager } from './diff-modal.js';
import { EventBus } from './event-bus.js';
import { getFileIconInfo } from './file-icons.js';
import { appState } from '../state/app-state.js';

export class FileChangeManager {
  constructor() {
    this._refreshTimer = null;
    this._lastChangeSnapshot = null; // 记录上一次变更快照，用于检测新变更
    this._cachedFileGroups = new Map(); // 缓存分组后的文件列表，用于 popover 渲染
    this._popoverHideTimer = null; // 悬浮面板隐藏防抖定时器
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

    // ── 文件变更悬浮面板 hover 逻辑 ──
    this._bindPopoverHover();
  }

  _bindPopoverHover() {
    const statusBarFiles = document.getElementById('statusBarFiles');
    const popover = document.getElementById('statusBarFilesPopover');
    if (!statusBarFiles || !popover) return;

    const showPopover = () => {
      if (this._popoverHideTimer) {
        clearTimeout(this._popoverHideTimer);
        this._popoverHideTimer = null;
      }
      popover.classList.add('show');
    };

    const hidePopover = () => {
      if (this._popoverHideTimer) {
        clearTimeout(this._popoverHideTimer);
      }
      // 延迟 200ms 隐藏，避免移出时闪烁
      this._popoverHideTimer = setTimeout(() => {
        popover.classList.remove('show');
      }, 200);
    };

    statusBarFiles.addEventListener('mouseenter', showPopover);
    statusBarFiles.addEventListener('mouseleave', hidePopover);
    popover.addEventListener('mouseenter', showPopover);
    popover.addEventListener('mouseleave', hidePopover);

    // 点击状态栏文件项也切换显隐（点击时打开活动栏面板，隐藏 popover）
    statusBarFiles.addEventListener('click', () => {
      popover.classList.remove('show');
    });

    // 点击 popover 中的文件项 → 打开 diff 弹窗
    popover.addEventListener('click', (e) => {
      const fileItem = e.target.closest('.popover-file-item');
      if (fileItem) {
        const filePath = fileItem.dataset.path;
        if (filePath) {
          popover.classList.remove('show');
          diffModalManager.show(filePath);
        }
      }
    });
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

  async updateFileChanges(sessionId) {
    try {
      // 如果未传 sessionId，从 appState 获取当前会话 ID
      sessionId = sessionId || appState.currentSessionId;
      const url = sessionId
        ? `/api/files/changes?sessionId=${encodeURIComponent(sessionId)}`
        : '/api/files/changes';
      const changes = await apiGet(url);

      // 右侧面板 DOM 可能已被移除，安全查找
      const list = document.getElementById('fileChangesList');
      const empty = document.getElementById('fileChangesEmpty');
      const statusBarFiles = document.getElementById('statusBarFilesValue');

      // 无变更时的空状态
      if (!changes || changes.length === 0) {
        this._cachedFileGroups = new Map();
        this._renderFilesPopover();
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

      // 缓存分组数据给 popover 使用
      this._cachedFileGroups = fileGroups;

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

      // 渲染悬浮面板
      this._renderFilesPopover();
    } catch (e) {
      console.error('获取文件变更失败:', e);
    }
  }

  _renderFilesPopover() {
    const popoverBody = document.getElementById('filesPopoverBody');
    if (!popoverBody) return;

    if (this._cachedFileGroups.size === 0) {
      popoverBody.innerHTML = '<div class="popover-empty">暂无文件变更</div>';
      return;
    }

    // 按最近修改时间降序排列
    const sorted = Array.from(this._cachedFileGroups.values())
      .sort((a, b) => b.latest - a.latest);

    const MAX_VISIBLE = 10;
    const visible = sorted.slice(0, MAX_VISIBLE);
    const overflow = sorted.length - MAX_VISIBLE;

    let html = '';
    for (const c of visible) {
      const fileName = c.filePath.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName);

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

      html += `
        <div class="popover-file-item" data-path="${escapeHtml(c.filePath)}">
          <span class="file-icon"><img src="icons/${iconFile}" draggable="false" alt=""></span>
          <span class="file-name">${escapeHtml(fileName)}</span>
          <span class="file-status ${statusClass}">${statusLetter}</span>
        </div>
      `;
    }

    if (overflow > 0) {
      html += `<div class="popover-file-overflow">还有 ${overflow} 个文件变更</div>`;
    }

    popoverBody.innerHTML = html;
  }

  async _rollbackFile(filePath, btnEl) {
    if (btnEl.classList.contains('rolling')) return;
    btnEl.classList.add('rolling');
    btnEl.textContent = '回滚中...';

    try {
      const result = await apiPost('/api/files/rollback', { filePath });

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
