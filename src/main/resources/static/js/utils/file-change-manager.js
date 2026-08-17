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
    this._popoverPinned = false; // 悬浮面板是否被点击固定显示
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

    // 外部文件变更检测（简化 A：磁盘快照对比轮询，感知延迟 ≤ 15s）
    // 立即执行一次用于初始化快照（首次调用后端不返回变更，不会误报）
    this.checkExternalChanges();
    this._externalTimer = setInterval(() => {
      this.checkExternalChanges();
    }, 15000);

    // ── 文件变更悬浮面板 hover 逻辑 ──
    this._bindPopoverHover();
  }

  /**
   * 检测外部程序（非 AI 工具）对工作区文件的修改。
   * 后端通过磁盘快照对比识别变更并做 AI 写入去重；有变更时广播
   * file:external-changed 事件，由 workspace-manager 负责刷新文件树、
   * 重载预览（含 dirty 保护）。失败静默，等待下次轮询重试。
   */
  async checkExternalChanges() {
    try {
      const root = window.HippoWorkspace?.currentPath;
      if (!root) return;
      const data = await apiGet(`/api/files/snapshot?path=${encodeURIComponent(root)}`);
      if (!data || !Array.isArray(data.changes) || data.changes.length === 0) return;
      EventBus.emit('file:external-changed', { changes: data.changes });
    } catch (e) {
      // 后端不可用 / 网络错误等：静默失败，不影响主流程
    }
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
      // 固定显示时移出不隐藏，需点击或点击外部关闭
      if (this._popoverPinned) return;
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

    // 点击状态栏文件项 → 切换 popover 固定显示（不再联动 Activity 面板）
    statusBarFiles.addEventListener('click', () => {
      this._popoverPinned = !this._popoverPinned;
      if (this._popoverHideTimer) {
        clearTimeout(this._popoverHideTimer);
        this._popoverHideTimer = null;
      }
      if (this._popoverPinned) {
        popover.classList.add('show');
      } else {
        popover.classList.remove('show');
      }
    });

    // 点击 popover 外部取消固定并隐藏（排除状态栏项和 popover 自身）
    document.addEventListener('click', (e) => {
      if (!this._popoverPinned) return;
      if (statusBarFiles.contains(e.target) || popover.contains(e.target)) return;
      this._popoverPinned = false;
      popover.classList.remove('show');
    });

    // 点击 popover 中的文件项 → 打开 diff（桌面端标签页 / Web 端弹窗）
    popover.addEventListener('click', (e) => {
      const fileItem = e.target.closest('.popover-file-item');
      if (fileItem) {
        const filePath = fileItem.dataset.path;
        if (filePath) {
          this._popoverPinned = false;
          popover.classList.remove('show');
          this._openFileDiff(filePath);
        }
      }
    });
  }

  /**
   * 打开文件变更对比：桌面端打开 diff 标签页（可常驻回看），
   * Web 端（无工作区标签系统）降级为弹窗。
   * @param {string} filePath
   */
  _openFileDiff(filePath) {
    const ws = window.HippoWorkspace;
    if (ws && ws.isAvailable && typeof ws.openFileDiff === 'function') {
      ws.openFileDiff(filePath);
    } else {
      diffModalManager.show(filePath);
    }
  }

  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._externalTimer) {
      clearInterval(this._externalTimer);
      this._externalTimer = null;
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
      this._openFileDiff(filePath);
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
        this._hideSummary();
        if (statusBarFiles) statusBarFiles.textContent = '';
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
        // 仿照 tool-renderers/index.js 的做法：统一正斜杠后再比较，
        // 避免 Windows 上因反斜杠/正斜杠不匹配导致 startsWith 判断失败
        let displayPath = c.filePath;
        if (workspaceRoot) {
          const root = workspaceRoot.replace(/\\/g, '/') + '/';
          const normPath = c.filePath.replace(/\\/g, '/');
          if (normPath.startsWith(root)) {
            displayPath = normPath.slice(root.length);
          }
        }
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
        const rollbackHtml = c.binary ? '' : `<button class="file-change-rollback">${window.i18n.t('fileChanges.rollback')}</button>`;
        return `
          <div class="file-change-item${itemClass}" data-path="${escapeHtml(c.filePath)}" style="cursor:pointer;">
            <span class="file-change-icon">${icon}</span>
            <div class="file-change-name" title="${escapeHtml(c.filePath)}">
              <span class="file-change-basename">${escapeHtml(fileName)}</span>
              <span class="file-change-path">${escapeHtml(dirPath)}</span>
            </div>
            ${rollbackHtml}
            <span class="file-change-status ${statusClass}">${statusLetter}</span>
          </div>
        `;
      }).join('');

      if (list) list.innerHTML = fileHtml;
      // 同步更新 Activity Bar 面板
      const abList = document.getElementById('abFileChangesList');
      if (abList) abList.innerHTML = fileHtml;

      // 异步获取会话级汇总并渲染（失败静默，不影响主列表）
      this._updateSummary(sessionId);

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
      popoverBody.innerHTML = `<div class="popover-empty">${window.i18n.t('fileChanges.empty')}</div>`;
      const popoverSummary = document.getElementById('filesPopoverSummary');
      if (popoverSummary) {
        popoverSummary.innerHTML = '';
        popoverSummary.style.display = 'none';
      }
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
      html += `<div class="popover-file-overflow">${window.i18n.t('fileChanges.overflow', { overflow })}</div>`;
    }

    popoverBody.innerHTML = html;
  }

  /**
   * 获取会话级文件变更汇总（净变化行数 + 文件计数），失败静默。
   */
  async _updateSummary(sessionId) {
    try {
      const url = sessionId
        ? `/api/files/summary?sessionId=${encodeURIComponent(sessionId)}`
        : '/api/files/summary';
      const summary = await apiGet(url);
      this._renderSummary(summary);
    } catch (e) {
      // 汇总接口失败不影响主列表：隐藏汇总条
      this._hideSummary();
    }
  }

  /**
   * 渲染会话级汇总条（活动栏文件面板顶部 + 状态栏 popover 顶部）。
   * 格式：N 个文件 · +X -Y（A/M/D 细分见列表，不重复展示）
   */
  _renderSummary(summary) {
    const html = this._buildSummaryHtml(summary);
    const targets = ['abFileChangesSummary', 'filesPopoverSummary'];
    for (const id of targets) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (html) {
        el.innerHTML = html;
        el.style.display = 'flex';
      } else {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    }
  }

  /** 构建汇总条 HTML；无有效数据返回 null */
  _buildSummaryHtml(summary) {
    if (!summary || summary.fileCount === 0) return null;
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    return `
      <span class="fcs-count">${t('fileChanges.summaryFiles', { count: summary.fileCount })}</span>
      <span class="fcs-stats">
        <span class="fcs-add">+${summary.insertions}</span>
        <span class="fcs-del">-${summary.deletions}</span>
      </span>
    `;
  }

  /** 隐藏所有位置的汇总条（活动栏面板 + 状态栏 popover） */
  _hideSummary() {
    const targets = ['abFileChangesSummary', 'filesPopoverSummary'];
    for (const id of targets) {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    }
  }

  async _rollbackFile(filePath, btnEl) {
    if (btnEl.classList.contains('rolling')) return;
    btnEl.classList.add('rolling');
    btnEl.textContent = window.i18n.t('fileChanges.rollingBack');

    try {
      const result = await apiPost('/api/files/rollback', { filePath });

      if (result.success) {
        showToast(window.i18n.t('fileChanges.rollbackSuccess') + filePath.split(/[/\\]/).pop(), { type: 'success', duration: 3000 });
        this.updateFileChanges();
        EventBus.emit('file:changes-updated');
        // 通知预览区域刷新（携带被回滚的文件路径，由监听方精确匹配，避免无关文件被重建）
        EventBus.emit('file:rollback-completed', filePath);
      } else {
        showToast(window.i18n.t('fileChanges.rollbackFailed') + (result.error || window.i18n.t('chatui.unknownError')), { type: 'error', duration: 3000 });
        btnEl.classList.remove('rolling');
        btnEl.textContent = window.i18n.t('fileChanges.rollback');
      }
    } catch (e) {
      showToast(window.i18n.t('fileChanges.rollbackFailed') + e.message, { type: 'error', duration: 3000 });
      btnEl.classList.remove('rolling');
      btnEl.textContent = window.i18n.t('fileChanges.rollback');
    }
  }
}
