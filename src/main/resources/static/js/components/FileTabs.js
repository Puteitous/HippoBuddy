/**
 * FileTabs — 文件标签栏组件
 *
 * 职责：
 *   1. 管理打开的文件标签列表
 *   2. 标签激活/切换/关闭
 *   3. 对外暴露 tab 状态变更回调
 *
 * 一个 tab 就是一个文件路径，tab 的去重由外部保证。
 */

export class FileTabs {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 标签容器 (#fileTabs)
   * @param {Function} options.onTabSelect - (filePath: string) => void
   * @param {Function} options.onTabClose - (filePath: string) => void
   */
  constructor({ container, onTabSelect, onTabClose }) {
    this._container = container;
    this._onTabSelect = onTabSelect || (() => {});
    this._onTabClose = onTabClose || (() => {});

    /** @type {Map<string, HTMLElement>} path → tab element */
    this._tabs = new Map();
    this._activePath = null;
    this._order = []; // 保持插入顺序
  }

  /** 获取当前激活的路径 */
  get activePath() {
    return this._activePath;
  }

  /** 获取所有已打开的路径 */
  get openPaths() {
    return this._order.slice();
  }

  /** 打开（或切换到）一个 tab */
  openTab(filePath, displayName) {
    const existing = this._tabs.get(filePath);
    if (existing) {
      this._selectTab(filePath);
      return;
    }

    const tabEl = document.createElement('div');
    tabEl.className = 'file-tab';
    tabEl.dataset.path = filePath;

    // Icon
    const iconEl = document.createElement('span');
    iconEl.className = 'file-tab-icon';
    iconEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3.5z"/><path d="M10 1.5V5h3.5"/></svg>';
    tabEl.appendChild(iconEl);

    // Name
    const nameEl = document.createElement('span');
    nameEl.className = 'file-tab-name';
    nameEl.textContent = displayName || this._getDisplayName(filePath);
    nameEl.title = filePath;
    tabEl.appendChild(nameEl);

    // Close button
    const closeEl = document.createElement('button');
    closeEl.className = 'file-tab-close';
    closeEl.textContent = '✕';
    closeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(filePath);
    });
    tabEl.appendChild(closeEl);

    // Click to select
    tabEl.addEventListener('click', () => {
      this._selectTab(filePath);
    });

    this._container.appendChild(tabEl);
    this._tabs.set(filePath, tabEl);
    this._order.push(filePath);
    this._selectTab(filePath);

    // 滚动标签到可见
    tabEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }

  /** 切换到指定 tab */
  _selectTab(filePath) {
    if (this._activePath === filePath) return;

    // 取消旧 tab 高亮
    if (this._activePath) {
      const oldEl = this._tabs.get(this._activePath);
      if (oldEl) oldEl.classList.remove('active');
    }

    this._activePath = filePath;
    const newEl = this._tabs.get(filePath);
    if (newEl) {
      newEl.classList.add('active');
      newEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }

    this._onTabSelect(filePath);
  }

  /** 关闭一个 tab */
  closeTab(filePath) {
    const tabEl = this._tabs.get(filePath);
    if (!tabEl) return;

    tabEl.remove();
    this._tabs.delete(filePath);
    const idx = this._order.indexOf(filePath);
    if (idx !== -1) this._order.splice(idx, 1);

    // 如果关闭的是当前激活的 tab，切换到相邻 tab
    if (this._activePath === filePath) {
      if (this._order.length > 0) {
        // 优先选左边的，没有则选右边的
        const nextIdx = Math.min(idx, this._order.length - 1);
        this._selectTab(this._order[nextIdx]);
      } else {
        this._activePath = null;
        this._onTabClose(filePath);
      }
    }

    this._onTabClose(filePath);
  }

  /** 关闭所有 tab */
  closeAll() {
    const paths = this._order.slice();
    for (const p of paths) {
      const el = this._tabs.get(p);
      if (el) el.remove();
      this._tabs.delete(p);
    }
    this._order = [];
    this._activePath = null;
    if (paths.length > 0) {
      this._onTabClose(paths[paths.length - 1]);
    }
  }

  /** 获取 tab 数量 */
  get count() {
    return this._order.length;
  }

  _getDisplayName(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
}
