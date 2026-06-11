/**
 * FileTree — 递归文件树组件
 *
 * 职责：
 *   1. 调用 HippoDesktop.readDir(path) 获取目录结构
 *   2. 递归渲染树节点（文件夹可展开/收起）
 *   3. 点击文件触发 onFileSelect 回调
 *   4. 从后端拉取 git status 并标记文件状态
 *   5. 提供 refresh() 保留展开状态重新加载
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
   * @param {Function} options.onError - (err: Error) => void
   */
  constructor({ container, onFileSelect, onError }) {
    this._container = container;
    this._onFileSelect = onFileSelect || (() => {});
    this._onError = onError || (() => {});
    this._rootPath = null;
    this._expandedDirs = new Set();
    this._activeFilePath = null;
    this._gitStatus = null; // { available: boolean, files: { [path]: 'M'|'A'|'D' } }
    this._refreshDebounceTimer = null;
    this._contextMenuEl = this._createContextMenu();
    // 全局关闭：点击其他位置或 Escape 关闭菜单
    this._contextMenuCloseHandler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      // 点击菜单本身不关闭
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
    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }
  }

  // ========== 右键菜单 ==========

  _createContextMenu() {
    const el = document.createElement('div');
    el.className = 'file-tree-context-menu';
    el.innerHTML = `
      <div class="file-tree-context-item" data-action="copy-absolute">
        <span class="ctx-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 2V1"/><path d="M10 2V1"/></svg></span>
        <span class="ctx-label">复制绝对路径</span>
      </div>
      <div class="file-tree-context-item" data-action="copy-relative">
        <span class="ctx-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a2 2 0 0 1 2 2v7"/><path d="M2 5l3-3"/><path d="M2 5l3 3"/></svg></span>
        <span class="ctx-label">复制相对路径</span>
      </div>
      <div class="file-tree-context-separator" data-action="sep1"></div>
      <div class="file-tree-context-item" data-action="show-in-explorer">
        <span class="ctx-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg></span>
        <span class="ctx-label">在资源管理器中显示</span>
      </div>
    `;

    el.addEventListener('click', (e) => {
      const item = e.target.closest('.file-tree-context-item');
      if (!item) return;
      const action = item.dataset.action;
      const targetPath = el._targetPath;
      if (!targetPath) return;

      if (action === 'copy-absolute') {
        this._copyToClipboard(targetPath);
        this._hideContextMenu();
      } else if (action === 'copy-relative') {
        const relative = this._rootPath && targetPath.startsWith(this._rootPath + '/')
          ? targetPath.slice(this._rootPath.length + 1)
          : targetPath;
        this._copyToClipboard(relative);
        this._hideContextMenu();
      } else if (action === 'show-in-explorer') {
        if (window.HippoDesktop?.showItemInFolder) {
          window.HippoDesktop.showItemInFolder(targetPath).catch(() => {});
        }
        this._hideContextMenu();
      }
    });

    document.body.appendChild(el);
    return el;
  }

  _showContextMenu(e, filePath, isDir) {
    e.preventDefault();
    e.stopPropagation();

    const el = this._contextMenuEl;
    el._targetPath = filePath;

    // 根据 node 类型调整菜单项可见性
    const showInExplorer = el.querySelector('[data-action="show-in-explorer"]');
    if (showInExplorer) {
      showInExplorer.style.display = window.HippoDesktop?.showItemInFolder ? '' : 'none';
    }
    // 目录下分隔线也可能需要调整，这里保持简单

    // 定位：确保菜单不超出视口
    const menuW = 200;
    const menuH = el.querySelectorAll('.file-tree-context-item, .file-tree-context-separator').length * 34 + 8;
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
  }

  _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        this._fallbackCopy(text);
      });
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
    try {
      document.execCommand('copy');
    } catch (e) {
      console.error('复制失败:', e);
    }
    document.body.removeChild(textarea);
  }

  /** 设置根路径并加载（完整加载，清空展开状态） */
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
   * 刷新文件树（保留当前展开的目录 + 激活的文件）
   * 在 AI 工具（write/edit/delete）执行后调用
   * 带防抖：多次快速调用只执行最后一次
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
      this._container.innerHTML = '';
      await this._renderTree(this._rootPath, this._container);
      // 重新展开之前展开的目录 — 使用 nextElementSibling 查找 children 容器
      // 避免 CSS.escape 兼容性问题或 + 相邻兄弟选择器的 DOM 结构敏感问题
      for (const dirPath of preservedDirs) {
        const nodeEl = this._findDirNode(dirPath);
        if (!nodeEl) continue;
        const childrenEl = nodeEl.nextElementSibling;
        if (childrenEl && childrenEl.classList.contains('file-tree-children')) {
          childrenEl.style.display = '';
          await this._renderTree(dirPath, childrenEl);
        }
      }
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

  /** 在容器中查找目录节点 */
  _findDirNode(path) {
    return this._container.querySelector(`.file-tree-node[data-is-dir][data-path="${this._escapeCss(path)}"]`);
  }

  /** 在容器中查找文件节点 */
  _findFileNode(path) {
    return this._container.querySelector(`.file-tree-node:not([data-is-dir])[data-path="${this._escapeCss(path)}"]`);
  }

  /** 安全地转义 CSS 选择器中的属性值 */
  _escapeCss(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(value);
    }
    // CSS.escape polyfill（精简版）
    return value.replace(/[!"#$%&'()*+,.\/:;<=>?@[\]^`{|}~ \\]/g, '\\$&');
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

  // ========== 内部：Git 状态 ==========

  async _fetchAndApplyGitStatus() {
    if (!this._rootPath) return;
    try {
      const resp = await fetch(`/api/git/status?path=${encodeURIComponent(this._rootPath)}`);
      if (!resp.ok) return;
      this._gitStatus = await resp.json();
      this._applyGitStatusClasses();
    } catch (e) {
      // git 不可用时静默降级
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
      // 将绝对路径转为相对路径，匹配后端 git status 的 key
      let relativePath = filePath;
      if (rootPath && relativePath.startsWith(rootPath + '/')) {
        relativePath = relativePath.slice(rootPath.length + 1);
      }
      const status = files[relativePath];
      // 清除旧状态
      node.classList.remove('status-modified', 'status-added', 'status-deleted');
      // 移除旧 badge
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

  // ========== 内部：渲染 ==========

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

    // 排序：目录在前，文件在后，各自按字母排序
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

    // Toggle arrow
    const toggleEl = document.createElement('span');
    toggleEl.className = 'file-tree-toggle' + (isExpanded ? ' expanded' : '');
    toggleEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>';
    nodeEl.appendChild(toggleEl);

    // Folder icon
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

    // Children container
    const childrenEl = document.createElement('div');
    childrenEl.className = 'file-tree-children';
    childrenEl.style.display = isExpanded ? '' : 'none';

    // Toggle expand/collapse
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

    parentEl.appendChild(nodeEl);
    parentEl.appendChild(childrenEl);
  }

  _renderFileNode(entry, fullPath, nodeEl, parentEl) {
    // File node — no toggle arrow
    const spacer = document.createElement('span');
    spacer.className = 'file-tree-toggle';
    spacer.style.visibility = 'hidden';
    spacer.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 4 10 8 6 12"/></svg>';
    nodeEl.appendChild(spacer);

    // File icon — Material Icon Theme SVG
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
