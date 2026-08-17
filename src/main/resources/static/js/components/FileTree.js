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
import { showToast } from '../utils/toast.js';
import { apiGet } from '../utils.js';

/** 文件夹图标：关闭 = 旧版 16x16 经典图标；打开 = 48x48 描边风格翻开图标（展示尺寸均 14px） */
const FOLDER_ICON_CLOSED =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>';
const FOLDER_ICON_OPEN =
  '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 9V41L9 21H39.5V15C39.5 13.8954 38.6046 13 37.5 13H24L19 7H6C4.89543 7 4 7.89543 4 9Z"/>' +
  '<path d="M40 41L44 21H8.8125L4 41H40Z"/></svg>';

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
    this._loadingDirs = new Set();
    this._readDirCache = null;
    this._compactMaxDepth = 5;

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
    this._readDirCache = null;
    this._rootPath = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
    this._expandedDirs.clear();
    this._activeFilePath = null;
    this._gitStatus = null;
    this._container.innerHTML = '';
    await this._renderTree(rootPath, this._container);
    await this._fetchAndApplyGitStatus();
    this._setupRootDropTarget();
  }

  /** 根容器作为放置目标：拖拽文件/文件夹到根目录 */
  _setupRootDropTarget() {
    // 避免重复绑定
    if (this._container._rootDropSetup) return;
    this._container._rootDropSetup = true;

    this._container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._container.classList.add('drag-over');
    });

    this._container.addEventListener('dragleave', (e) => {
      this._container.classList.remove('drag-over');
    });

    this._container.addEventListener('drop', async (e) => {
      e.preventDefault();
      this._container.classList.remove('drag-over');

      const sourcePath = e.dataTransfer.getData('text/plain');
      if (!sourcePath || !this._rootPath) return;

      // 已经在根目录下则跳过
      const parentDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
      if (parentDir === this._rootPath) return;

      const fileName = sourcePath.split('/').pop();
      const destPath = this._rootPath + '/' + fileName;

      try {
        await window.HippoDesktop.rename(sourcePath, destPath);
        this._doRefresh();
        this._onRefresh();
        showToast(window.i18n.t('fileTree.movedToRoot') + fileName, { type: 'success' });
      } catch (err) {
        showToast(window.i18n.t('fileTree.moveFailed') + err.message, { type: 'error' });
      }
    });

    this._container.addEventListener('dragend', () => {
      this._container.classList.remove('drag-over');
    });
  }

  /**
   * 刷新文件树（保留展开 + 激活状态），外部调用 + 内部操作后自动调用
   */
  async refresh() {
    if (!this._rootPath) return;
    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }
    this._refreshDebounceTimer = setTimeout(async () => {
      this._refreshDebounceTimer = null;
      // 并行发起 git status 请求与树构建：树替换完成时徽标数据大概率已就绪，
      // 立即打上徽标，避免"徽标先消失、等请求返回再出现"的闪烁
      const statusPromise = this._fetchGitStatus();
      await this._doRefresh(true);
      await statusPromise;
      this._applyGitStatusClasses();
    }, 100);
  }

  async _doRefresh(skipGitStatus = false) {
    this._readDirCache = null;
    const preservedDirs = new Set(this._expandedDirs);
    const preservedActive = this._activeFilePath;
    try {
      // 离屏构建：在 DocumentFragment 中完整构建新树
      const tempContainer = document.createElement('div');
      await this._renderTree(this._rootPath, tempContainer);

      // 渲染已展开的子目录 — 按路径长度排序以保持父目录优先
      const sortedDirs = [...preservedDirs].sort((a, b) => a.length - b.length);
      for (const dirPath of sortedDirs) {
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
    // refresh() 并行优化时跳过内部 git status 请求（由调用方统一打徽标）；
    // 其余调用点（collapseAll / reveal / restoreExpandedDirs 等）不传参，保持原串行行为
    if (!skipGitStatus) await this._fetchAndApplyGitStatus();
  }

  /** 清空文件树 */
  clear() {
    this._rootPath = null;
    this._expandedDirs.clear();
    this._activeFilePath = null;
    this._gitStatus = null;
    this._container.innerHTML = '';
  }

  /** 折叠全部目录（保留根层级），滚动回顶部 */
  collapseAll() {
    if (!this._rootPath) return;
    this._expandedDirs.clear();
    this._loadingDirs.clear();
    this._activeFilePath = null;
    this._doRefresh().then(() => {
      this._container.scrollTop = 0;
    });
  }

  /** 高亮当前激活的文件/目录，并滚动到可视区域 */
  setActiveFile(filePath) {
    this._activeFilePath = filePath;
    const items = this._container.querySelectorAll('.file-tree-node');
    for (const el of items) {
      el.classList.toggle('active', el.dataset.path === filePath);
    }
    // 滚动到目标节点
    const activeEl = this._container.querySelector(
      `.file-tree-node[data-path="${this._escapeCss(filePath)}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * 获取当前展开的目录集合（用于持久化）
   * @returns {string[]}
   */
  getExpandedDirs() {
    return [...this._expandedDirs];
  }

  /**
   * 恢复展开的目录集合（从持久化数据恢复）
   * @param {string[]} dirs - 目录路径数组
   */
  restoreExpandedDirs(dirs) {
    if (Array.isArray(dirs) && dirs.length > 0) {
      this._expandedDirs = new Set(dirs);
    }
  }

  /**
   * 展开并高亮指定目录（在文件树中定位目录）
   * @param {string} dirPath - 绝对路径
   */
  async revealDirectory(dirPath) {
    const normalizedDir = dirPath.replace(/\\/g, '/').replace(/\/$/, '');
    if (!this._rootPath) return;
    if (!normalizedDir.startsWith(this._rootPath)) return;

    // 展开目标目录及其所有父目录
    let current = this._rootPath;
    const parts = normalizedDir.slice(this._rootPath.length).split('/').filter(Boolean);
    this._expandedDirs.add(current);
    for (const part of parts) {
      current = current + '/' + part;
      this._expandedDirs.add(current);
    }

    // 刷新树保留展开状态（_doRefresh 会读取 _activeFilePath 来恢复高亮）
    this._activeFilePath = normalizedDir;
    await this._doRefresh();

    // 高亮目标目录（_doRefresh 已从 _activeFilePath 恢复，但为保证即时性再确保一次）
    const targetEl = this._container.querySelector(
      `.file-tree-node[data-is-dir][data-path="${this._escapeCss(normalizedDir)}"]`
    );
    if (targetEl) {
      targetEl.classList.add('active');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * 展开文件的所有父目录并高亮该文件（从外部导航时使用）
   * @param {string} filePath - 文件绝对路径
   */
  async revealFile(filePath) {
    await this._revealParentDirs(filePath);
    this.setActiveFile(filePath);
  }

  /**
   * 展开文件的所有父目录，确保文件节点在 DOM 中可见
   * @param {string} filePath - 文件绝对路径
   * @returns {Promise<boolean>} 是否刷新了树
   */
  async _revealParentDirs(filePath) {
    if (!this._rootPath) return false;
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!dirPath || dirPath === this._rootPath) return false;
    if (!dirPath.startsWith(this._rootPath)) return false;

    const relativePath = dirPath.slice(this._rootPath.length);
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) return false;

    // 检查是否已经全部展开
    let allExpanded = true;
    let current = this._rootPath;
    for (const part of parts) {
      current = current + '/' + part;
      if (!this._expandedDirs.has(current)) {
        allExpanded = false;
      }
      this._expandedDirs.add(current);
    }

    if (allExpanded) return false;

    await this._doRefresh();
    return true;
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
    // 无论文件还是文件夹，都提供新建文件/文件夹选项
    // 对文件操作时，会创建在同级目录（父目录）下
    items.push(
      { action: 'new-file', label: window.i18n.t('fileTree.newFile'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="6" y1="9" x2="10" y2="9"/></svg>' },
      { action: 'new-folder', label: window.i18n.t('fileTree.newFolder'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><line x1="8" y1="8" x2="8" y2="12"/><line x1="6" y1="10" x2="10" y2="10"/></svg>' },
      { separator: true }
    );
    items.push(
      { action: 'copy-absolute', label: i18n.t('fileTree.copyAbsolutePath'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 2V1"/><path d="M10 2V1"/></svg>' },
      { action: 'copy-relative', label: i18n.t('fileTree.copyRelativePath'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a2 2 0 0 1 2 2v7"/><path d="M2 5l3-3"/><path d="M2 5l3 3"/></svg>' },
      { separator: true },
      { action: 'rename', label: i18n.t('fileTree.rename'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"/></svg>' },
      { action: 'delete', label: i18n.t('fileTree.delete'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5 4V2h6v2"/><path d="M3 4l1 10h8l1-10"/></svg>' }
    );
    if (window.HippoDesktop?.showItemInFolder) {
      items.push(
        { separator: true },
        { action: 'show-in-explorer', label: window.i18n.t('fileTree.showInExplorer'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>' }
      );
    }
    if (window.HippoDesktop?.openTerminal) {
      items.push(
        { separator: true },
        { action: 'open-in-terminal', label: window.i18n.t('fileTree.openInTerminal'), icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 4 8 8 4 12"/><line x1="11" y1="12" x2="13" y2="12"/></svg>' }
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
        // 如果目标不是目录，用其父目录作为新建路径
        const baseDir = this._ctxIsDir ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        const label = isFile ? window.i18n.t('fileTree.fileName') : window.i18n.t('fileTree.folderName');
        const hint = isFile ? window.i18n.t('fileTree.fileNameHint') : window.i18n.t('fileTree.folderNameHint');
        const name = await this._showInputDialog({
          title: isFile ? window.i18n.t('fileTree.newFile') : window.i18n.t('fileTree.newFolder'),
          label,
          hint,
          placeholder: isFile ? 'index.js' : 'my-folder'
        });
        if (!name) return;
        const newPath = baseDir + '/' + name;
        try {
          if (isFile) {
            await api.createFile(newPath);
          } else {
            await api.createDir(newPath);
          }
          this._doRefresh();
          this._onRefresh();
        } catch (err) {
          this._showToast(window.i18n.t('fileTree.createFailed') + err.message);
        }
        break;
      }
      case 'rename': {
        const oldName = targetPath.split('/').pop();
        const newName = await this._showInputDialog({
          title: i18n.t('fileTree.renameTitle'),
          label: i18n.t('fileTree.newName'),
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
          showToast(window.i18n.t('fileTree.renameFailed') + err.message, { type: 'error' });
        }
        break;
      }
      case 'delete': {
        const type = this._ctxIsDir ? i18n.t('fileTree.folder') : i18n.t('fileTree.file');
        const name = targetPath.split('/').pop();
        const confirmed = await this._showConfirmDialog({
          title: i18n.t('fileTree.delete') + type,
          message: i18n.t('fileTree.deleteConfirm', { name }),
          note: i18n.t('fileTree.deleteNote')
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
          showToast(window.i18n.t('fileTree.deleteFailed') + err.message, { type: 'error' });
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
      case 'open-in-terminal':
        if (api?.openTerminal) {
          // 如果是目录，在该目录打开；如果是文件，在父目录打开
          const termDir = this._ctxIsDir ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
          api.openTerminal(termDir).catch(() => {});
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
          <button class="file-tree-modal-btn file-tree-modal-btn-cancel">${i18n.t('fileTree.cancelBtn')}</button>
          <button class="file-tree-modal-btn file-tree-modal-btn-confirm">${i18n.t('fileTree.confirmBtn')}</button>
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
      titleEl.textContent = title || i18n.t('fileTree.inputTitle');
      msgEl.textContent = '';
      msgEl.style.display = 'none';
      inputWrap.style.display = '';
      inputLabel.textContent = label || '';
      inputEl.value = value || '';
      inputEl.placeholder = placeholder || '';
      inputHint.textContent = hint || '';
      confirmBtn.textContent = i18n.t('fileTree.confirmBtn');

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

      titleEl.textContent = title || i18n.t('fileTree.confirmTitle');
      msgEl.style.display = '';
      msgEl.innerHTML = message || '';
      inputWrap.style.display = 'none';
      confirmBtn.textContent = i18n.t('fileTree.deleteBtn');
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

  /**
   * 收起目录后确保节点仍在视口内；若已滚出视口则平滑滚回。
   * 等待一帧让收起后的 DOM 塌缩完成，再基于最新布局判断。
   */
  _ensureVisibleAfterCollapse(nodeEl) {
    requestAnimationFrame(() => {
      const container = this._container;
      if (!container || !nodeEl || !nodeEl.isConnected) return;
      const cRect = container.getBoundingClientRect();
      const nRect = nodeEl.getBoundingClientRect();
      const fullyVisible = nRect.top >= cRect.top && nRect.bottom <= cRect.bottom;
      if (!fullyVisible) {
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  _escapeCss(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return value.replace(/[!"#$%&'()*+,.\/:;<=>?@[\]^`{|}~ \\]/g, '\\$&');
  }

  /**
   * 缓存读取目录，避免 _resolveCompactChain 中重复 readDir
   */
  async _readDirCached(dirPath) {
    if (!this._readDirCache) {
      this._readDirCache = new Map();
    }
    if (this._readDirCache.has(dirPath)) {
      return this._readDirCache.get(dirPath);
    }
    try {
      const result = await window.HippoDesktop.readDir(dirPath);
      const entries = result && result.entries ? result.entries : [];
      this._readDirCache.set(dirPath, entries);
      return entries;
    } catch (err) {
      this._readDirCache.set(dirPath, null);
      return null;
    }
  }

  /**
   * 检测从 startPath 开始是否存在"单链"嵌套目录。
   * 单链：每层只有 1 个子目录且没有文件，一直延伸到分叉处。
   * 返回 { chain: string[], leafDir: string } 或 null。
   * chain 不包含 startPath 本身的 name，只包含后续链上目录名。
   */
  async _resolveCompactChain(startPath) {
    const names = [];
    let currentPath = startPath;

    for (let i = 0; i < this._compactMaxDepth; i++) {
      const entries = await this._readDirCached(currentPath);
      if (!entries) return null;

      const dirs = entries.filter(e => e.isDirectory && !e.name.startsWith('.'));
      const files = entries.filter(e => !e.isDirectory && !e.name.startsWith('.'));

      // 有文件或多于 1 个子目录 → 不是单链，停止
      if (files.length > 0) break;
      if (dirs.length !== 1) break;

      names.push(dirs[0].name);
      currentPath = currentPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + dirs[0].name;
    }

    if (names.length === 0) return null;
    return { chain: names, leafDir: currentPath };
  }

  // ==================== Git 状态 ====================

  /** 仅请求 git status 并更新 _gitStatus 数据（不打徽标），供并行刷新使用 */
  async _fetchGitStatus() {
    if (!this._rootPath) return;
    try {
      const data = await apiGet(`/api/git/status?path=${encodeURIComponent(this._rootPath)}`);
      this._gitStatus = data;
    } catch (e) {
      this._gitStatus = { available: false };
    }
  }

  /** 请求 git status 并按最新数据应用徽标（loadRoot / 常规 _doRefresh 使用，保持原行为） */
  async _fetchAndApplyGitStatus() {
    await this._fetchGitStatus();
    this._applyGitStatusClasses();
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
    // 初始化目录缓存，供 _resolveCompactChain 使用
    if (!this._readDirCache) {
      this._readDirCache = new Map();
    }
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
        // 尝试 compact 渲染（单链嵌套合并为一行）
        const compact = await this._resolveCompactChain(fullPath);
        if (compact) {
          nodeEl.dataset.path = compact.leafDir;
          this._renderCompactDirNode(entry, compact.chain, compact.leafDir, nodeEl, parentEl);
        } else {
          this._renderDirNode(entry, fullPath, nodeEl, parentEl);
        }
      } else {
        this._renderFileNode(entry, fullPath, nodeEl, parentEl);
      }
    }
  }

  /**
   * 渲染紧凑目录节点：将单链嵌套目录合并为 "a > b > c > d" 一行。
   * @param {Object} entry - 原始目录条目（含 name）
   * @param {string[]} chain - 后续链上的目录名列表
   * @param {string} leafDir - 链最深层目录的完整路径
   * @param {HTMLElement} nodeEl - 当前节点元素（data-path 已设为 leafDir）
   * @param {HTMLElement} parentEl - 父容器
   */
  _renderCompactDirNode(entry, chain, leafDir, nodeEl, parentEl) {
    nodeEl.dataset.isDir = 'true';
    const isExpanded = this._expandedDirs.has(leafDir);

    const toggleEl = document.createElement('span');
    toggleEl.className = 'file-tree-toggle' + (isExpanded ? ' expanded' : '');
    toggleEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 4 10 8 6 12"/></svg>';
    nodeEl.appendChild(toggleEl);

    const iconEl = document.createElement('span');
    iconEl.className = 'file-tree-icon folder';
    iconEl.innerHTML = isExpanded
      ? FOLDER_ICON_OPEN
      : FOLDER_ICON_CLOSED;
    nodeEl.appendChild(iconEl);

    // 显示 "entryName > child1 > child2 > child3"
    const nameEl = document.createElement('span');
    nameEl.className = 'file-tree-name file-tree-name-compact';
    nameEl.textContent = entry.name + ' › ' + chain.join(' › ');
    nodeEl.appendChild(nameEl);

    const childrenEl = document.createElement('div');
    childrenEl.className = 'file-tree-children';
    childrenEl.style.display = isExpanded ? '' : 'none';

    const toggleDir = async () => {
      const expanded = this._expandedDirs.has(leafDir);
      if (expanded) {
        this._expandedDirs.delete(leafDir);
        toggleEl.classList.remove('expanded');
        iconEl.innerHTML = FOLDER_ICON_CLOSED;
        childrenEl.style.display = 'none';
        childrenEl.innerHTML = '';
        this._loadingDirs.delete(leafDir);
        // 收起后确保节点仍在视口内（已滚出则平滑滚回）
        this._ensureVisibleAfterCollapse(nodeEl);
      } else {
        if (this._loadingDirs.has(leafDir)) return;
        this._loadingDirs.add(leafDir);
        this._expandedDirs.add(leafDir);
        toggleEl.classList.add('expanded');
        iconEl.innerHTML = FOLDER_ICON_OPEN;
        childrenEl.style.display = '';
        try {
          await this._renderTree(leafDir, childrenEl);
          this._applyGitStatusClasses();
        } finally {
          this._loadingDirs.delete(leafDir);
        }
      }
    };

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setActiveFile(leafDir);
      toggleDir();
    });

    nodeEl.addEventListener('contextmenu', (e) => {
      this._showContextMenu(e, leafDir, true);
    });

    nodeEl.draggable = true;
    nodeEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', leafDir);
      e.dataTransfer.setData('text/x-hippo-type', 'directory');
      e.dataTransfer.effectAllowed = 'copyMove';
    });

    nodeEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      nodeEl.classList.add('drag-over');
    });

    nodeEl.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      nodeEl.classList.remove('drag-over');
    });

    nodeEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      nodeEl.classList.remove('drag-over');

      const sourcePath = e.dataTransfer.getData('text/plain');
      if (!sourcePath) return;
      if (sourcePath === leafDir || sourcePath.startsWith(leafDir + '/')) return;

      const fileName = sourcePath.split('/').pop();
      const destPath = leafDir + '/' + fileName;

      try {
        await window.HippoDesktop.rename(sourcePath, destPath);
        this._doRefresh();
        this._onRefresh();
        showToast(window.i18n.t('fileTree.moved') + fileName, { type: 'success' });
      } catch (err) {
        showToast(window.i18n.t('fileTree.moveFailed') + err.message, { type: 'error' });
      }
    });

    nodeEl.addEventListener('dragend', () => {
      nodeEl.classList.remove('drag-over');
    });

    parentEl.appendChild(nodeEl);
    parentEl.appendChild(childrenEl);
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
      ? FOLDER_ICON_OPEN
      : FOLDER_ICON_CLOSED;
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
        iconEl.innerHTML = FOLDER_ICON_CLOSED;
        childrenEl.style.display = 'none';
        childrenEl.innerHTML = '';
        // 清理加载中标记，便于下次展开重新加载
        this._loadingDirs.delete(fullPath);
        // 收起后确保节点仍在视口内（已滚出则平滑滚回）
        this._ensureVisibleAfterCollapse(nodeEl);
      } else {
        // 防止异步加载未完成时重复点击导致竞态
        if (this._loadingDirs.has(fullPath)) return;
        this._loadingDirs.add(fullPath);
        this._expandedDirs.add(fullPath);
        toggleEl.classList.add('expanded');
        iconEl.innerHTML = FOLDER_ICON_OPEN;
        childrenEl.style.display = '';
        try {
          await this._renderTree(fullPath, childrenEl);
          this._applyGitStatusClasses();
        } finally {
          this._loadingDirs.delete(fullPath);
        }
      }
    };

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setActiveFile(fullPath);
      toggleDir();
    });

    nodeEl.addEventListener('contextmenu', (e) => {
      this._showContextMenu(e, fullPath, true);
    });

    nodeEl.draggable = true;
    nodeEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', fullPath);
      e.dataTransfer.setData('text/x-hippo-type', 'directory');
      e.dataTransfer.effectAllowed = 'copyMove';
    });

    // --- 作为放置目标：拖拽移动文件/文件夹到此目录 ---
    nodeEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      nodeEl.classList.add('drag-over');
    });

    nodeEl.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      nodeEl.classList.remove('drag-over');
    });

    nodeEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      nodeEl.classList.remove('drag-over');

      const sourcePath = e.dataTransfer.getData('text/plain');
      if (!sourcePath) return;

      // 禁止拖到自身 或 自己的子目录
      if (sourcePath === fullPath || sourcePath.startsWith(fullPath + '/')) return;

      const fileName = sourcePath.split('/').pop();
      const destPath = fullPath + '/' + fileName;

      // 同名文件已存在时不做任何操作（后端会报错）
      try {
        await window.HippoDesktop.rename(sourcePath, destPath);
        this._doRefresh();
        this._onRefresh();
        showToast(window.i18n.t('fileTree.moved') + fileName, { type: 'success' });
      } catch (err) {
        showToast(window.i18n.t('fileTree.moveFailed') + err.message, { type: 'error' });
      }
    });

    // 拖拽结束清理高亮
    nodeEl.addEventListener('dragend', () => {
      nodeEl.classList.remove('drag-over');
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
      e.dataTransfer.effectAllowed = 'copyMove';
      const dragImg = document.createElement('span');
      dragImg.textContent = '\uD83D\uDCC4';
      dragImg.style.position = 'absolute';
      dragImg.style.top = '-100px';
      document.body.appendChild(dragImg);
      e.dataTransfer.setDragImage(dragImg, 0, 0);
      setTimeout(() => document.body.removeChild(dragImg), 0);
    });

    nodeEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      // 先展开父目录，让文件节点在 DOM 中可见
      await this._revealParentDirs(fullPath);
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
