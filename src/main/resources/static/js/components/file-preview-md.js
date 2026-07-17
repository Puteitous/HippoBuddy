/**
 * FilePreviewMdPreview — Markdown 预览组件
 *
 * 将 Markdown 内容渲染为 HTML，支持 TOC 侧边栏、滚动同步、折叠。
 * 被 FilePreview 委托调用。
 *
 * 依赖：
 *   - renderMarkdown(content) → Promise<string>
 */

/** 转义 HTML 特殊字符 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export class FilePreviewMdPreview {
  constructor({ container, renderMarkdown }) {
    this._container = container;
    this._renderMarkdown = renderMarkdown;
    this._previewMode = false;
    /** @private MD 预览渲染容器 */
    this._mdPreviewEl = null;
    /** @private TOC 侧边栏容器 */
    this._tocEl = null;
    /** @private TOC 滚动同步 cleanup 回调 */
    this._tocScrollCleanup = null;
    /** @private TOC 折叠状态 */
    this._tocCollapsed = true;
  }

  get isPreview() {
    return this._previewMode;
  }

  /**
   * 切换预览/编辑模式
   * @param {string} content - CM6 编辑器当前内容
   * @returns {'preview' | 'edit'} 切换后的模式
   */
  async toggle(content) {
    if (this._previewMode) {
      // 切回编辑模式
      this._destroyPreview();
      this._previewMode = false;
      return 'edit';
    }

    // 切到预览模式
    this._ensurePreviewEl();
    this._mdPreviewEl.innerHTML = '<div class="file-md-preview-loading">渲染中...</div>';
    this._mdPreviewEl.style.display = '';
    this._previewMode = true;

    try {
      const html = await this._renderMarkdown(content);

      // 重置容器，构建 TOC + 内容双栏布局
      this._mdPreviewEl.innerHTML = '';

      // TOC 侧边栏
      this._tocEl = document.createElement('div');
      this._tocEl.className = 'file-md-toc';

      // 内容区
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'file-md-content';
      contentWrapper.innerHTML = html;

      this._mdPreviewEl.appendChild(this._tocEl);
      this._mdPreviewEl.appendChild(contentWrapper);

      // 注入 heading ID，构建并渲染 TOC
      this._buildAndRenderToc(contentWrapper);
      this._startTocScrollSync(contentWrapper);
    } catch (err) {
      this._mdPreviewEl.innerHTML = `<div class="file-preview-placeholder" style="color:var(--error-text);">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>渲染失败: ${escapeHtml(err.message)}</p>
      </div>`;
    }

    return 'preview';
  }

  destroy() {
    this._destroyPreview();
  }

  // ==================== 内部方法 ====================

  /** 确保 MD 预览容器存在 */
  _ensurePreviewEl() {
    if (!this._mdPreviewEl) {
      this._mdPreviewEl = document.createElement('div');
      this._mdPreviewEl.className = 'file-md-preview';
      this._mdPreviewEl.style.display = 'none';
      this._container.appendChild(this._mdPreviewEl);
    }
  }

  /** 销毁预览，清理所有子元素和事件监听 */
  _destroyPreview() {
    this._stopTocScrollSync();
    this._tocEl = null;
    if (this._mdPreviewEl) {
      this._mdPreviewEl.remove();
      this._mdPreviewEl = null;
    }
    this._previewMode = false;
  }

  /** 从内容区提取 heading、注入 ID、构建 TOC 树并渲染 */
  _buildAndRenderToc(contentWrapper) {
    const headings = contentWrapper.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
      this._tocEl.style.display = 'none';
      return;
    }
    this._tocEl.style.display = '';

    const usedIds = new Set();
    const tocItems = [];

    headings.forEach((h) => {
      const level = parseInt(h.tagName[1], 10); // 1, 2, 3
      const text = h.textContent.trim();
      if (!text) return;

      // 生成唯一 ID
      let id = text
        .toLowerCase()
        .trim()
        .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (!id) id = 'heading';
      let uniqueId = id;
      let counter = 1;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}-${counter++}`;
      }
      usedIds.add(uniqueId);

      h.id = uniqueId;
      tocItems.push({ id: uniqueId, text, level });
    });

    // 渲染 TOC
    let tocHtml = `<div class="file-md-toc-header">
      <span class="file-md-toc-title">${i18n.t('preview.tocTitle')}</span>
      <button class="file-md-toc-toggle" title="${i18n.t('preview.tocCollapse')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="10 3 5 8 10 13"/>
        </svg>
      </button>
    </div>`;
    let itemsHtml = '';
    for (const item of tocItems) {
      itemsHtml += `<a class="file-md-toc-item level-${item.level}" data-target="${item.id}" href="#${item.id}">${escapeHtml(item.text)}</a>`;
    }
    // 浮层面板（折叠 hover 时弹出）
    const floatingHtml = `<div class="file-md-toc-floating">
      <div class="file-md-toc-header">
        <span class="file-md-toc-title">${i18n.t('preview.tocTitle')}</span>
      </div>
      ${itemsHtml}
    </div>`;
    this._tocEl.innerHTML = tocHtml + itemsHtml + floatingHtml;
    this._tocEl.classList.toggle('collapsed', this._tocCollapsed);

    // 点击跳转（同时服务主面板和浮层面板中的 .file-md-toc-item）
    this._tocEl.addEventListener('click', (e) => {
      const link = e.target.closest('.file-md-toc-item');
      if (!link) return;
      e.preventDefault();
      const targetId = link.dataset.target;
      const target = document.getElementById(targetId);
      if (target) {
        // 同时高亮主面板和浮层面板中对应的项
        this._tocEl.querySelectorAll('.file-md-toc-item').forEach(l => l.classList.remove('active'));
        this._tocEl.querySelectorAll(`.file-md-toc-item[data-target="${targetId}"]`)
          .forEach(l => l.classList.add('active'));
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // 折叠/展开切换
    this._tocEl.querySelector('.file-md-toc-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleToc();
    });
  }

  /** 启动滚动同步：监听内容区 scroll，通过 offsetTop 算出当前章节 */
  _startTocScrollSync(contentWrapper) {
    this._stopTocScrollSync();

    const headings = contentWrapper.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;

    const tocLinks = this._tocEl ? this._tocEl.querySelectorAll('.file-md-toc-item') : null;
    if (!tocLinks || tocLinks.length === 0) return;

    let currentActiveId = null;
    let lastChangeTime = 0;
    const MIN_CHANGE_INTERVAL = 20; // 两次切换之间最小间隔 (ms)，避免快速滚动时闪烁

    /** 根据所有 heading 的 offsetTop 计算当前应高亮的 heading */
    const updateActive = () => {
      const scrollTop = contentWrapper.scrollTop;
      const headroom = 30; // 顶部预留偏移（px），让 heading 刚离开顶部时仍算"当前"
      let activeHeading = null;

      // 找最后一个 offsetTop ≤ scrollTop + headroom 的 heading
      for (const h of headings) {
        if (h.offsetTop <= scrollTop + headroom) {
          activeHeading = h;
        } else {
          break; // headings 按 DOM 顺序排列
        }
      }

      // 如果什么都没有（内容未滚动），选中第一个
      if (!activeHeading && headings.length > 0) {
        activeHeading = headings[0];
      }

      const newId = activeHeading ? activeHeading.id : null;
      if (newId === currentActiveId) return; // 相同就不更新
      if (newId === null) return; // 无效结果不更新

      // 防抖：快速滚动时避免频繁切换
      const now = Date.now();
      if (currentActiveId !== null && now - lastChangeTime < MIN_CHANGE_INTERVAL) return;

      currentActiveId = newId;
      lastChangeTime = now;

      // 更新 active 样式（同时高亮主面板和浮层面板中对应的项）
      tocLinks.forEach(link => link.classList.remove('active'));
      this._tocEl.querySelectorAll(`.file-md-toc-item[data-target="${newId}"]`)
        .forEach(link => link.classList.add('active'));
    };

    // scroll 事件监听（requestAnimationFrame 节流）
    let rafId = null;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActive();
      });
    };
    contentWrapper.addEventListener('scroll', onScroll, { passive: true });
    this._tocScrollCleanup = () => {
      contentWrapper.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };

    // 初始执行一次
    updateActive();
  }

  /** 停止 TOC 滚动同步 */
  _stopTocScrollSync() {
    if (this._tocScrollCleanup) {
      this._tocScrollCleanup();
      this._tocScrollCleanup = null;
    }
  }

  /** 折叠/展开 TOC 侧边栏 */
  _toggleToc() {
    if (!this._tocEl) return;
    this._tocCollapsed = !this._tocCollapsed;
    this._tocEl.classList.toggle('collapsed', this._tocCollapsed);

    // 更新 toggle 按钮图标
    const btn = this._tocEl.querySelector('.file-md-toc-toggle');
    if (btn) {
      btn.title = this._tocCollapsed ? i18n.t('preview.tocExpand') : i18n.t('preview.tocCollapse');
      btn.innerHTML = this._tocCollapsed
        ? `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 3 11 8 6 13"/>
          </svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="10 3 5 8 10 13"/>
          </svg>`;
    }
  }
}
