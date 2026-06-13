/**
 * FileTabs — 文件标签栏组件
 *
 * 职责：
 *   1. 管理打开的文件标签列表
 *   2. 标签激活/切换/关闭
 *   3. 右键菜单（关闭当前/其他/右侧/全部、复制路径）
 *   4. 拖拽排序
 *   5. 中键关闭、滚轮横向滚动
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
    this._order = [];
    this._dragPath = null;

    // 右键菜单
    this._ctxMenu = this._createContextMenu();
    this._ctxTargetPath = null;

    // 滚轮横向滚动
    this._container.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        this._container.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    // 点击其他地方关闭右键菜单
    this._onDocClick = (e) => {
      if (this._ctxMenu && !this._ctxMenu.contains(e.target)) {
        this._hideContextMenu();
      }
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('contextmenu', this._onDocClick);
  }

  /** 获取当前激活的路径 */
  get activePath() {
    return this._activePath;
  }

  /** 获取所有已打开的路径 */
  get openPaths() {
    return this._order.slice();
  }

  get count() {
    return this._order.length;
  }

  /** 设置/清除 tab 的脏状态（未保存修改） */
  setDirty(filePath, dirty) {
    const tabEl = this._tabs.get(filePath);
    if (!tabEl) return;
    tabEl.classList.toggle('dirty', dirty);
  }

  /** 销毁，清理副作用 */
  destroy() {
    if (this._ctxMenu && this._ctxMenu.parentNode) {
      this._ctxMenu.parentNode.removeChild(this._ctxMenu);
    }
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('contextmenu', this._onDocClick);
  }

  // ==================== 打开 / 切换 ====================

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

    // 中键关闭
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(filePath);
      }
    });

    // 右键菜单
    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e, filePath);
    });

    // 拖拽
    this._setupDragEvents(tabEl, filePath);

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

  // ==================== 关闭 ====================

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

  /** 关闭除指定的以外所有 tab */
  closeOthers(filePath) {
    const paths = this._order.filter(p => p !== filePath);
    for (const p of paths) {
      this.closeTab(p);
    }
  }

  /** 关闭指定 tab 右侧的所有 tab */
  closeRight(filePath) {
    const idx = this._order.indexOf(filePath);
    if (idx === -1) return;
    const paths = this._order.slice(idx + 1);
    for (const p of paths) {
      this.closeTab(p);
    }
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

  // ==================== 右键菜单 ====================

  _createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'file-tabs-context-menu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div class="ctx-item" data-action="close-current">关闭当前</div>
      <div class="ctx-item" data-action="close-others">关闭其他</div>
      <div class="ctx-item" data-action="close-right">关闭右侧</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="close-all">关闭全部</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="copy-path">复制文件路径</div>
    `;

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.ctx-item');
      if (!item) return;
      const action = item.dataset.action;
      this._handleContextAction(action);
      this._hideContextMenu();
    });

    document.body.appendChild(menu);
    return menu;
  }

  _showContextMenu(e, filePath) {
    this._ctxTargetPath = filePath;

    // 定位菜单
    const menuW = 180;
    const menuH = this._ctxMenu.querySelectorAll('.ctx-item').length * 32 + 8;
    let left = e.clientX;
    let top = e.clientY;
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
    if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    this._ctxMenu.style.left = left + 'px';
    this._ctxMenu.style.top = top + 'px';
    this._ctxMenu.style.display = 'block';
  }

  _hideContextMenu() {
    this._ctxMenu.style.display = 'none';
    this._ctxTargetPath = null;
  }

  _handleContextAction(action) {
    const target = this._ctxTargetPath;
    if (!target) return;

    switch (action) {
      case 'close-current':
        this.closeTab(target);
        break;
      case 'close-others':
        this.closeOthers(target);
        break;
      case 'close-right':
        this.closeRight(target);
        break;
      case 'close-all':
        this.closeAll();
        break;
      case 'copy-path':
        navigator.clipboard.writeText(target).catch(() => {});
        break;
    }
  }

  // ==================== 拖拽排序 ====================

  _setupDragEvents(tabEl, filePath) {
    tabEl.draggable = true;

    tabEl.addEventListener('dragstart', (e) => {
      this._dragPath = filePath;
      tabEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', filePath);
      // 拖拽时不显示默认半透明克隆
      const ghost = document.createElement('div');
      ghost.style.position = 'absolute';
      ghost.style.top = '-1000px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => document.body.removeChild(ghost), 0);
    });

    tabEl.addEventListener('dragend', () => {
      this._dragPath = null;
      this._container.querySelectorAll('.file-tab').forEach(el => {
        el.classList.remove('dragging', 'drop-before', 'drop-after');
      });
    });

    tabEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!this._dragPath || this._dragPath === filePath) return;
      e.dataTransfer.dropEffect = 'move';

      // 清除所有 drop 标记
      this._container.querySelectorAll('.file-tab').forEach(el => {
        el.classList.remove('drop-before', 'drop-after');
      });

      // 判断拖拽方向：鼠标在 tab 左半还是右半
      const rect = tabEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        tabEl.classList.add('drop-before');
      } else {
        tabEl.classList.add('drop-after');
      }
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drop-before', 'drop-after');
    });

    tabEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!this._dragPath || this._dragPath === filePath) return;

      const fromPath = this._dragPath;
      const toPath = filePath;
      const fromIdx = this._order.indexOf(fromPath);
      const toIdx = this._order.indexOf(toPath);
      if (fromIdx === -1 || toIdx === -1) return;

      const rect = tabEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midX;

      // 从 _order 中移除源
      this._order.splice(fromIdx, 1);
      // 计算目标新位置（移除源后 toIdx 可能变化）
      const adjustedToIdx = this._order.indexOf(toPath);
      const targetIdx = insertBefore ? adjustedToIdx : adjustedToIdx + 1;

      // 插入到目标位置
      this._order.splice(targetIdx, 0, fromPath);

      // 重新排列 DOM
      const fromEl = this._tabs.get(fromPath);
      const toEl = this._tabs.get(toPath);
      if (fromEl && toEl) {
        if (insertBefore) {
          this._container.insertBefore(fromEl, toEl);
        } else {
          this._container.insertBefore(fromEl, toEl.nextSibling);
        }
      }

      // 清理状态
      this._container.querySelectorAll('.file-tab').forEach(el => {
        el.classList.remove('dragging', 'drop-before', 'drop-after');
      });
      this._dragPath = null;
    });
  }

  // ==================== 工具方法 ====================

  _getDisplayName(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
}
