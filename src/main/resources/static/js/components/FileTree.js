/**
 * FileTree — 递归文件树组件
 *
 * 职责：
 *   1. 调用 HippoDesktop.readDir(path) 获取目录结构
 *   2. 递归渲染树节点（文件夹可展开/收起）
 *   3. 点击文件触发 onFileSelect 回调
 *   4. 从后端拉取 git status 并标记文件状态
 *   5. 右键菜单：新建文件/文件夹、重命名、删除、复制路径等
 *   6. 提供 refresh() 保留展开状态重新加载
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - highlight.js (hljs) — 用于识别文件语言图标
 */

import { getFileIconInfo } from '../utils/file-icons.js';

export class FileTree {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 渲染容器 (#fileTreeBody)
   * @param {Function} options.onFileSelect - (filePath: string) => void
   * @param {Function} options.onRefresh - () => void 操作后刷新文件树
   * @param {Function} options.onError - (err: Error) => void
   */
  constructor({ container, onFileSelect, onRefresh, onError }) {
    this._container = container;
    this._onFileSelect = onFileSelect || (() => {});
    this._onRefresh = onRefresh || (() => {});
    this._onError = onError || (() => {});
    this._rootPath = null;
    this._expandedDirs = new Set();
    this._activeFilePath = null;
    this._gitStatus = null;
    this._refreshDebounceTimer = null;

    // 右键菜单
    this._contextMenuEl = this._createContextMenu();
    this._ctxTargetPath = null;
    this._ctxIsDir = false;

    // 模态弹窗
    this._modalEl = this._createModal();
    this._modalResolve = null;

    // 全局事件
    this._contextMenuCloseHandler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && this._contextMenuEl.contains(e.target)) return;
      this._hideContextMenu();
    };
    document.addEventListener('mousedown', this._contextMenuCloseHandler);
    document.addEventListener('keydown', this._contextMenuCloseHandler);
  }

  /** 销毁，清理资源 */
  destroy() {
    document.removeEventListener('mousedown', this._contextMenuCloseHandler);
    document.removeEventListener('keydown', this._contextMenuCloseHandler);
    if (this._contextMenuEl && this._contextMenuEl.parentNode) {
      this._contextMenuEl.parentNode.removeChild(this._contextMenuEl);
    }
    if (this._modalEl && this._modalEl.parentNode) {
      this._modalEl.parentNode.removeChild(this._modalEl);
    }
    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }
  }

  // ==================== 读取/加载 ====================

  /** 设置根路径并加载 */
  async loadRoot(rootPath) {
    this._rootPath = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
    this._expandedDirs.clear();
    this._activeFilePath = null;
    this._gitStatus = null;
    this._container.innerHTML = '';
    await this._renderTree(rootPath, this._container);
    await this._fetchAndApplyGitStatus();
  }

  /**
   * 刷新文件树（保留展开 + 激活状态），外部调用 + 内部操作后自动调用
   */
  async refresh() {
    if (!this._rootPath) return;
    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }
    this._refreshDebounceTimer = setTimeout(() => {
      this._refreshDebounceTimer = null;
      this._doRefresh();
    }, 100);
  }

  async _doRefresh() {
    const preservedDirs = new Set(this._expandedDirs);
    const preservedActive = this._activeFilePath;
    try {
      // 离屏构建：在 DocumentFragment 中完整构建新树
      const tempContainer = document.createElement('div');
      await this._renderTree(this._rootPath, tempContainer);

      // 渲染已展开的子目录
      for (const dirPath of preservedDirs) {
        const nodeEl = tempContainer.querySelector(
          `.file-tree-node[data-is-dir][data-path="${this._escapeCss(dirPath)}"]`
        );
        if (!nodeEl) continue;
        const childrenEl = nodeEl.nextElementSibling;
        if (childrenEl && childrenEl.classList.contains('file-tree-children')) {
          childrenEl.style.display = '';
          await this._renderTree(dirPath, childrenEl);
        }
      }

      // 原子替换：同一帧内完成清空 + 挂载，消除空白帧
      this._container.replaceChildren(...tempContainer.childNodes);

      // 恢复选中高亮
      this._activeFilePath = preservedActive;
      if (preservedActive) {
        const activeEl = this._findDirNode(preservedActive) || this._findFileNode(preservedActive);
        if (activeEl) activeEl.classList.add('active');
      }
    } catch (err) {
      console.error('FileTree.refresh error:', err);
      this._onError(err);
    }
    await this._fetchAndApplyGitStatus();
  }

  /** 清空文件树 */
  clear() {
    this._rootPath = null;
    this._expandedDirs.clear();
    this._activeFilePath = null;
    this._gitStatus = null;
    this._container.innerHTML = '';
  }

  /** 高亮当前激活的文件 */
  setActiveFile(filePath) {
    this._activeFilePath = filePath;
    const items = this._container.querySelectorAll('.file-tree-node');
    for (const el of items) {
      el.classList.toggle('active', el.dataset.path === filePath);
    }
  }

  // ==================== 右键菜单 ====================

  _createContextMenu() {
    const el = document.createElement('div');
    el.className = 'file-tree-context-menu';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.file-tree-context-item');
      if (!item) return;
      const action = item.dataset.action;
      this._handleContextAction(action);
      this._hideContextMenu();
    });
    return el;
  }

  _buildContextMenu(isDir) {
    const items = [];
    if (isDir) {
      items.push(
        { action: 'new-file', label: '新建文件', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="6" y1="9" x2="10" y2="9"/></svg>' },
        { action: 'new-folder', label: '新建文件夹', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><line x1="8" y1="8" x2="8" y2="12"/><line x1="6" y1="10" x2="10" y2="10"/></svg>' },
        { separator: true }
      );
    }
    items.push(
      { action: 'copy-absolute', label: '复制绝对路径', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 2V1"/><path d="M10 2V1"/></svg>' },
      { action: 'copy-relative', label: '复制相对路径', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a2 2 0 0 1 2 2v7"/><path d="M2 5l3-3"/><path d="M2 5l3 3"/></svg>' },
      { separator: true },
      { action: 'rename', label: '重命名', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"/></svg>' },
      { action: 'delete', label: '删除', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5 4V2h6v2"/><path d="M3 4l1 10h8l1-10"/></svg>' }
    );
    if (window.HippoDesktop?.showItemInFolder) {
      items.push(
        { separator: true },
        { action: 'show-in-explorer', label: '在资源管理器中显示', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>' }
      );
    }
    return items.map(item => {
      if (item.separator) return '<div class="file-tree-context-separator"></div>';
      return `<div class="file-tree-context-item" data-action="${item.action}">
        <span class="ctx-icon">${item.icon}</span>
        <span class="ctx-label">${item.label}</span>
      </div>`;
    }).join('');
  }

  _showContextMenu(e, filePath, isDir) {
    e.preventDefault();
    e.stopPropagation();
    this._ctxTargetPath = filePath;
    this._ctxIsDir = isDir;

    const el = this._contextMenuEl;
    el.innerHTML = this._buildContextMenu(isDir);
    el._targetPath = filePath;

    const menuW = 210;
    const itemCount = el.querySelectorAll('.file-tree-context-item').length;
    const sepCount = el.querySelectorAll('.file-tree-context-separator').length;
    const menuH = itemCount * 32 + sepCount * 1 + 8;
    let left = e.clientX;
    let top = e.clientY;
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
    if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.classList.add('show');
  }

  _hideContextMenu() {
    this._contextMenuEl.classList.remove('show');
    this._ctxTargetPath = null;
  }

  async _handleContextAction(action) {
    const targetPath = this._ctxTargetPath;
    if (!targetPath) return;

    const api = window.HippoDesktop;

    switch (action) {
      case 'new-file':
      case 'new-folder': {
        const isFile = action === 'new-file';
        const label = isFile ? '文件名' : '文件夹名';
        const hint = isFile ? '例如: index.js' : '例如: my-folder';
        const name = await this._showInputDialog({
          title: isFile ? '新建文件' : '新建文件夹',
          label,
          hint,
          placeholder: isFile ? 'index.js' : 'my-folder'
        });
        if (!name) return;
        const newPath = targetPath + '/' + name;
        try {
          if (isFile) {
            await api.createFile(newPath);
          } else {
            await api.createDir(newPath);
          }
          this._doRefresh();
          this._onRefresh();
        } catch (err) {
          this._showToast('创建失败: ' + err.message);
        }
        break;
      }
      case 'rename': {
        const oldName = targetPath.split('/').pop();
        const newName = await this._showInputDialog({
          title: '重命名',
          label: '新名称',
          value: oldName
        });
        if (!newName || newName === oldName) return;
        const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
        const newPath = parentPath + '/' + newName;
        try {
          await api.rename(targetPath, newPath);
          this._doRefresh();
          this._onRefresh();
        } catch (err) {
          this._showToast('重命名失败: ' + err.message);
        }
        break;
      }
      case 'delete': {
        const type = this._ctxIsDir ? '文件夹' : '文件';
        const name = targetPath.split('/').pop();
        const confirmed = await this._showConfirmDialog({
          title: '删除' + type,
          message: `确定要删除 <strong>${name}</strong> 吗？`,
          note: this._ctxIsDir ? '只能删除空文件夹' : undefined
        });
        if (!confirmed) return;
        try {
          await api.deleteFile(targetPath);
          // 如果删除的是当前激活的文件，取消激活状态
          if (targetPath === this._activeFilePath) {
            this._activeFilePath = null;
          }
          this._doRefresh();
          this._onRefresh();
        } catch (err) {
          this._showToast('删除失败: ' + err.message);
        }
        break;
      }
      case 'copy-absolute':
        this._copyToClipboard(targetPath);
        break;
      case 'copy-relative': {
        const relative = this._rootPath && targetPath.startsWith(this._rootPath + '/')
          ? targetPath.slice(this._rootPath.length + 1)
          : targetPath;
        this._copyToClipboard(relative);
        break;
      }
      case 'show-in-explorer':
        if (api?.showItemInFolder) {
          api.showItemInFolder(targetPath).catch(() => {});
        }
        break;
    }
  }

  // ==================== 模态弹窗 ====================

  _createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'file-tree-modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="file-tree-modal">
        <div class="file-tree-modal-header">
          <span class="file-tree-modal-title"></span>
        </div>
        <div class="file-tree-modal-body">
          <div class="file-tree-modal-message"></div>
          <div class="file-tree-modal-input-wrap" style="display:none;">
            <label class="file-tree-modal-input-label"></label>
            <input class="file-tree-modal-input" type="text" spellcheck="false" autocomplete="off">
            <span class="file-tree-modal-input-hint"></span>
          </div>
        </div>
        <div class="file-tree-modal-footer">
          <button class="file-tree-modal-btn file-tree-modal-btn-cancel">取消</button>
          <button class="file-tree-modal-btn file-tree-modal-btn-confirm">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * 显示输入弹窗（新建文件/文件夹、重命名）
   * @returns {Promise<string|null>} 输入值，取消返回 null
   */
  _showInputDialog({ title, label, hint, placeholder, value }) {
    return new Promise(resolve => {
      const overlay = this._modalEl;
      const titleEl = overlay.querySelector('.file-tree-modal-title');
      const bodyEl = overlay.querySelector('.file-tree-modal-body');
      const msgEl = overlay.querySelector('.file-tree-modal-message');
      const inputWrap = overlay.querySelector('.file-tree-modal-input-wrap');
      const inputLabel = overlay.querySelector('.file-tree-modal-input-label');
      const inputEl = overlay.querySelector('.file-tree-modal-input');
      const inputHint = overlay.querySelector('.file-tree-modal-input-hint');
      const cancelBtn = overlay.querySelector('.file-tree-modal-btn-cancel');
      const confirmBtn = overlay.querySelector('.file-tree-modal-btn-confirm');

      // 配置
      titleEl.textContent = title || '输入';
      msgEl.textContent = '';
      msgEl.style.display = 'none';
      inputWrap.style.display = '';
      inputLabel.textContent = label || '';
      inputEl.value = value || '';
      inputEl.placeholder = placeholder || '';
      inputHint.textContent = hint || '';
      confirmBtn.textContent = '确认';

      // 聚焦并全选
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);

      // 清理
      const cleanup = () => {
        overlay.style.display = 'none';
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        inputEl.removeEventListener('keydown', onKeydown);
      };

      const onCancel = () => { cleanup(); resolve(null); };
      const onConfirm = () => {
        const val = inputEl.value.trim();
        if (!val) {
          inputEl.classList.add('error');
          inputEl.focus();
          return;
        }
        cleanup();
        resolve(val);
      };
      const onKeydown = (e) => {
        if (e.key === 'Enter') onConfirm();
        else if (e.key === 'Escape') onCancel();
        else inputEl.classList.remove('error');
      };

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      inputEl.addEventListener('keydown', onKeydown);

      overlay.style.display = 'flex';
      // 触发动画
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  /**
   * 显示确认弹窗（删除）
   * @returns {Promise<boolean>}
   */
  _showConfirmDialog({ title, message, note }) {
    return new Promise(resolve => {
      const overlay = this._modalEl;
      const titleEl = overlay.querySelector('.file-tree-modal-title');
      const bodyEl = overlay.querySelector('.file-tree-modal-body');
      const msgEl = overlay.querySelector('.file-tree-modal-message');
      const inputWrap = overlay.querySelector('.file-tree-modal-input-wrap');
      const cancelBtn = overlay.querySelector('.file-tree-modal-btn-cancel');
      const confirmBtn = overlay.querySelector('.file-tree-modal-btn-confirm');

      titleEl.textContent = title || '确认';
      msgEl.style.display = '';
      msgEl.innerHTML = message || '';
      inputWrap.style.display = 'none';
      confirmBtn.textContent = '删除';
      confirmBtn.className = 'file-tree-modal-btn file-tree-modal-btn-confirm btn-danger';

      const cleanup = () => {
        overlay.style.display = 'none';
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        document.removeEventListener('keydown', onKeydown);
        confirmBtn.className = 'file-tree-modal-btn file-tree-modal-btn-confirm';
      };

      const onCancel = () => { cleanup(); resolve(false); };
      const onConfirm = () => { cleanup(); resolve(true); };
      const onKeydown = (e) => {
        if (e.key === 'Enter') onConfirm();
        else if (e.key === 'Escape') onCancel();
      };

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      document.addEventListener('keydown', onKeydown);

      overlay.style.display = 'flex';
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  _showToast(msg) {
    const existing = document.querySelector('.file-tree-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'file-tree-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ==================== 辅助 ====================

  _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(text));
    } else {
      this._fallbackCopy(text);
    }
  }

  _fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch (e) { console.error('复制失败:', e); }
    document.body.removeChild(textarea);
  }

  _findDirNode(path) {
    return this._container.querySelector(`.file-tree-node[data-is-dir][data-path="${this._escapeCss(path)}"]`);
  }

  _findFileNode(path) {
    return this._container.querySelector(`.file-tree-node:not([data-is-dir])[data-path="${this._escapeCss(path)}"]`);
  }

  _escapeCss(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return value.replace(/[!"#$%&'()*+,.\/:;<=>?@[\]^`{|}~ \\]/g, '\\$&');
  }

  // ==================== Git 状态 ====================

  async _fetchAndApplyGitStatus() {
    if (!this._rootPath) return;
    try {
      const resp = await fetch(`/api/git/status?path=${encodeURIComponent(this._rootPath)}`);
      if (!resp.ok) return;
      this._gitStatus = await resp.json();
      this._applyGitStatusClasses();
    } catch (e) {
      this._gitStatus = { available: false };
    }
  }

  _applyGitStatusClasses() {
    if (!this._gitStatus || !this._gitStatus.available) return;
    const files = this._gitStatus.files || {};
    const nodes = this._container.querySelectorAll('.file-tree-node:not([data-is-dir])');
    const rootPath = this._rootPath ? this._rootPath.replace(/\\/g, '/').replace(/\/$/, '') : '';
    for (const node of nodes) {
      const filePath = node.dataset.path;
      let relativePath = filePath;
      if (rootPath && relativePath.startsWith(rootPath + '/')) {
        relativePath = relativePath.slice(rootPath.length + 1);
      }
      const status = files[relativePath];
      node.classList.remove('status-modified', 'status-added', 'status-deleted');
      const oldBadge = node.querySelector('.file-tree-status-badge');
      if (oldBadge) oldBadge.remove();
      if (status === 'M') {
        node.classList.add('status-modified');
        const badge = document.createElement('span');
        badge.className = 'file-tree-status-badge status-modified';
        badge.textContent = 'M';
        node.appendChild(badge);
      } else if (status === 'A') {
        node.classList.add('status-added');
        const badge = document.createElement('span');
        badge.className = 'file-tree-status-badge status-added';
        badge.textContent = '+';
        node.appendChild(badge);
      } else if (status === 'D') {
        node.classList.add('status-deleted');
        const badge = document.createElement('span');
        badge.className = 'file-tree-status-badge status-deleted';
        badge.textContent = 'D';
        node.appendChild(badge);
      }
    }
  }

  // ==================== 渲染 ====================

  async _renderTree(dirPath, parentEl) {
    let entries;
    try {
      entries = await window.HippoDesktop.readDir(dirPath);
    } catch (err) {
      console.error('FileTree: readDir failed', dirPath, err);
      this._onError(err);
      return;
    }
    if (!entries || !entries.entries) return;

    const sorted = [...entries.entries].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      const fullPath = dirPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + entry.name;
      const nodeEl = document.createElement('div');
      nodeEl.className = 'file-tree-node';
      nodeEl.dataset.path = fullPath;
      if (entry.isDirectory) {
        this._renderDirNode(entry, fullPath, nodeEl, parentEl);
      } else {
        this._renderFileNode(entry, fullPath, nodeEl, parentEl);
      }
    }
  }

  _renderDirNode(entry, fullPath, nodeEl, parentEl) {
    nodeEl.dataset.isDir = 'true';
    const isExpanded = this._expandedDirs.has(fullPath);

    const toggleEl = document.createElement('span');
    toggleEl.className = 'file-tree-toggle' + (isExpanded ? ' expanded' : '');
    toggleEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 4 10 8 6 12"/></svg>';
    nodeEl.appendChild(toggleEl);

    const iconEl = document.createElement('span');
    iconEl.className = 'file-tree-icon folder';
    iconEl.innerHTML = isExpanded
      ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="currentColor" fill-opacity="0.1"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>';
    nodeEl.appendChild(iconEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'file-tree-name';
    nameEl.textContent = entry.name;
    nodeEl.appendChild(nameEl);

    const childrenEl = document.createElement('div');
    childrenEl.className = 'file-tree-children';
    childrenEl.style.display = isExpanded ? '' : 'none';

    const toggleDir = async () => {
      const expanded = this._expandedDirs.has(fullPath);
      if (expanded) {
        this._expandedDirs.delete(fullPath);
        toggleEl.classList.remove('expanded');
        iconEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>';
        childrenEl.style.display = 'none';
        childrenEl.innerHTML = '';
      } else {
        this._expandedDirs.add(fullPath);
        toggleEl.classList.add('expanded');
        iconEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="currentColor" fill-opacity="0.1"/></svg>';
        childrenEl.style.display = '';
        await this._renderTree(fullPath, childrenEl);
        this._applyGitStatusClasses();
      }
    };

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDir();
    });

    nodeEl.addEventListener('contextmenu', (e) => {
      this._showContextMenu(e, fullPath, true);
    });

    nodeEl.draggable = true;
    nodeEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', fullPath);
      e.dataTransfer.setData('text/x-hippo-type', 'directory');
      e.dataTransfer.effectAllowed = 'copy';
    });

    parentEl.appendChild(nodeEl);
    parentEl.appendChild(childrenEl);
  }

  _renderFileNode(entry, fullPath, nodeEl, parentEl) {
    const spacer = document.createElement('span');
    spacer.className = 'file-tree-toggle';
    spacer.style.visibility = 'hidden';
    spacer.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 4 10 8 6 12"/></svg>';
    nodeEl.appendChild(spacer);

    const { iconFile } = getFileIconInfo(entry.name);
    const iconEl = document.createElement('img');
    iconEl.className = 'file-tree-icon file';
    iconEl.src = 'icons/' + iconFile;
    iconEl.draggable = false;
    iconEl.alt = '';
    iconEl.loading = 'lazy';
    nodeEl.appendChild(iconEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'file-tree-name';
    nameEl.textContent = entry.name;
    nodeEl.appendChild(nameEl);

    nodeEl.draggable = true;
    nodeEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', fullPath);
      e.dataTransfer.setData('text/x-hippo-type', 'file');
      e.dataTransfer.effectAllowed = 'copy';
      const dragImg = document.createElement('span');
      dragImg.textContent = '\uD83D\uDCC4';
      dragImg.style.position = 'absolute';
      dragImg.style.top = '-100px';
      document.body.appendChild(dragImg);
      e.dataTransfer.setDragImage(dragImg, 0, 0);
      setTimeout(() => document.body.removeChild(dragImg), 0);
    });

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onFileSelect(fullPath);
    });

    nodeEl.addEventListener('contextmenu', (e) => {
      this._showContextMenu(e, fullPath, false);
    });

    if (fullPath === this._activeFilePath) {
      nodeEl.classList.add('active');
    }

    parentEl.appendChild(nodeEl);
  }
}
