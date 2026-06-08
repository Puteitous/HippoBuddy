/**
 * FileTree — 递归文件树组件
 *
 * 职责：
 *   1. 调用 HippoDesktop.readDir(path) 获取目录结构
 *   2. 递归渲染树节点（文件夹可展开/收起）
 *   3. 点击文件触发 onFileSelect 回调
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - highlight.js (hljs) — 用于识别文件语言图标
 */

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
  }

  /** 设置根路径并加载 */
  async loadRoot(rootPath) {
    this._rootPath = rootPath;
    this._expandedDirs.clear();
    this._activeFilePath = null;
    this._container.innerHTML = '';
    await this._renderTree(rootPath, this._container);
  }

  /** 清空文件树 */
  clear() {
    this._rootPath = null;
    this._expandedDirs.clear();
    this._activeFilePath = null;
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

    for (const entry of entries.entries) {
      const fullPath = dirPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + entry.name;
      const nodeEl = document.createElement('div');
      nodeEl.className = 'file-tree-node';
      nodeEl.dataset.path = fullPath;

      if (entry.isDirectory) {
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
        const toggleDir = () => {
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
            this._renderTree(fullPath, childrenEl);
          }
        };

        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleDir();
        });

        parentEl.appendChild(nodeEl);
        parentEl.appendChild(childrenEl);
      } else {
        // File node — no toggle arrow
        const spacer = document.createElement('span');
        spacer.className = 'file-tree-toggle';
        spacer.style.visibility = 'hidden';
        spacer.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 4 10 8 6 12"/></svg>';
        nodeEl.appendChild(spacer);

        // File icon
        const iconEl = document.createElement('span');
        iconEl.className = 'file-tree-icon file';
        iconEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3.5z"/><path d="M10 1.5V5h3.5"/></svg>';
        nodeEl.appendChild(iconEl);

        const nameEl = document.createElement('span');
        nameEl.className = 'file-tree-name';
        nameEl.textContent = entry.name;
        nodeEl.appendChild(nameEl);

        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onFileSelect(fullPath);
        });

        if (fullPath === this._activeFilePath) {
          nodeEl.classList.add('active');
        }

        parentEl.appendChild(nodeEl);
      }
    }
  }
}
