/**
 * FilePreview — 文件预览/编辑组件
 *
 * 文本/代码文件 → CodeMirror 6 编辑器（可编辑）
 * 图片/PDF/表格/DOCX → 委托给 BinaryPreview（只读）
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - js/vendor/codemirror.js（esbuild 打包的 CM6 bundle）
 *   - js/components/file-binary-preview.js（二进制预览委托）
 */

import { EditorView, keymap, EditorState, Compartment, basicSetup, oneDark, vsCodeLight,
  defaultHighlightStyle, syntaxHighlighting,
  javascript, python, java, html, css, json, markdown, xml, yaml, sql,
  rust, php, go, sass } from '../vendor/codemirror.js'
import { SearchPanel } from './search-panel.js'
import { renderMarkdown } from '../markdown-renderer.js'
import { createDiffExtension } from './FilePreviewDiff.js'
import { BinaryPreview, isImageFile, isPdfFile, isSpreadsheetFile, isDocxFile, isPptxFile, isHtmlFile } from './file-binary-preview.js'

/**
 * 文本/代码文件 → CodeMirror 6 编辑器（可编辑，支持 Ctrl+S 保存）。
 * 二进制文件 → 委托 BinaryPreview 以只读方式渲染。
 */

export class FilePreview {
  constructor({ container, onError, onDirtyChange }) {
    this._container = container;
    this._onError = onError || (() => {});
    this._onDirtyChange = onDirtyChange || (() => {});
    this._currentPath = null;
    this._content = '';
    this._dirty = false;
    this._view = null;
    /** @private Compartment 用于动态切换主题，避免重建编辑器 */
    this._themeCompartment = new Compartment();
    /** @private MutationObserver 监听 data-theme 变化 */
    this._themeObserver = null;
    /** @private 搜索面板实例 */
    this._searchPanel = null;
    /** @private MD 预览模式状态 */
    this._mdPreviewMode = false;
    /** @private MD 预览渲染容器 */
    this._mdPreviewEl = null;
    /** @private 当前编辑的图像内容（预览切换时重新渲染使用） */
    this._contentForPreview = '';
    /** @private TOC 侧边栏容器 */
    this._tocEl = null;
    /** @private TOC 滚动同步 IntersectionObserver */
    this._tocObserver = null;
    /** @private TOC 滚动同步 cleanup 回调 */
    this._tocScrollCleanup = null;
    /** @private TOC 折叠状态 */
    this._tocCollapsed = true;
    /** @private Compartment 用于动态切换 diff 扩展 */
    this._diffCompartment = new Compartment();
    /** @private AI 修改前的文件原始内容（用于 diff 对比） */
    this._originalContent = null;

    /** @private Map<string, number> 文件路径 → 上次滚动位置 */
    this._scrollPositions = new Map();
    /** @private 二进制预览类型：'image' | 'pdf' | 'spreadsheet' | 'docx' | null */
    this._binaryViewType = null;

    /** @private 二进制文件预览委托实例 */
    this._binaryPreview = new BinaryPreview({
      container: this._container,
      onError: this._onError,
    });

    // 绑定搜索按钮
    this._registerSearchButton();
    // 绑定 MD 预览切换按钮
    this._registerMdToggleBtn();
  }

  get currentPath() { return this._currentPath; }
  get isDirty() { return this._dirty; }

  /** @private 绑定搜索按钮点击事件 */
  _registerSearchButton() {
    const btn = document.getElementById('previewSearchBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (this._searchPanel) this._searchPanel.openFind();
    });
  }

  /** @private 绑定 MD 预览切换按钮 */
  _registerMdToggleBtn() {
    const btn = document.getElementById('previewMdToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => this._toggleMdPreview());
  }

  async show(filePath) {
    // 上游（FileTabs onBeforeSwitch）已处理脏检查弹窗，此处只清理旧 dirty 状态
    if (this._dirty) {
      this._dirty = false;
      this._onDirtyChange(this._currentPath, false);
    }

    // 切换文件前保存当前文件的滚动位置
    if (this._view && this._currentPath) {
      this._scrollPositions.set(this._currentPath, this._view.scrollDOM.scrollTop);
    }

    this._currentPath = filePath;
    this._container.dataset.currentPath = filePath;
    this._dirty = false;

    // ── 图片 / PDF → 委托 BinaryPreview ──
    if (isImageFile(filePath) || isPdfFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = isImageFile(filePath) ? 'image' : 'pdf';
      this._binaryPreview.showImageOrPdf(filePath, this._binaryViewType);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── 表格文件（XLSX/XLS/CSV）→ 委托 BinaryPreview ──
    if (isSpreadsheetFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'spreadsheet';
      this._binaryPreview.showSpreadsheet(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── DOCX 文件 → 委托 BinaryPreview ──
    if (isDocxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'docx';
      this._binaryPreview.showDocx(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── PPTX 文件 → 委托 BinaryPreview ──
    if (isPptxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'pptx';
      this._binaryPreview.showPptx(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── HTML 文件 → 委托 BinaryPreview Web 预览 ──
    if (isHtmlFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'web';
      this._binaryPreview.showWebPreview(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    let content;
    try {
      const result = await window.HippoDesktop.readFile(filePath);
      content = result.content;
    } catch (err) {
      console.error('FilePreview: readFile failed', filePath, err);
      this._showError('无法读取文件: ' + err.message);
      this._onError(err);
      return;
    }

    this._content = content;
    this._contentForPreview = content;
    this._initEditor(content, filePath);
    this._mdPreviewMode = false;
    this._updateSaveBtn();
    this._updateMdToggleBtn();
    // 异步获取原始内容用于 diff 标记（不影响打开速度）
    this._fetchOriginalContent(filePath);
  }

  async reload() {
    if (this._currentPath) {
      const path = this._currentPath;
      this._dirty = false;
      await this.show(path);
    }
  }

  async save() {
    if (!this._currentPath || !this._view || !this._dirty) return;
    const content = this._view.state.doc.toString();
    try {
      await window.HippoDesktop.writeFile(this._currentPath, content);
      this._content = content;
      this._dirty = false;
      this._originalContent = null; // 保存后清空原始内容基准，diff 标记自动清除
      this._onDirtyChange(this._currentPath, false);
      this._updateSaveBtn();
      // 重新配置 diff 扩展为空（清除 gutter 标记和行背景色）
      if (this._view) {
        this._view.dispatch({
          effects: this._diffCompartment.reconfigure([]),
        });
      }
    } catch (err) {
      this._showError('保存失败: ' + err.message);
    }
  }

  // ==================== Web 浏览器 ====================

  /**
   * 渲染内嵌浏览器 — 地址栏 + iframe
   * @param {string} url - 要加载的 URL
   */
  showBrowser(url) {
    this._destroyEditor();
    this._binaryViewType = 'browser';
    this._currentPath = 'url:' + url;
    this._container.dataset.currentPath = this._currentPath;
    this._dirty = false;

    const encodedUrl = encodeURI(url);
    const displayUrl = url;

    this._container.innerHTML = `
      <div class="file-browser-preview">
        <div class="browser-toolbar">
          <button class="browser-nav-btn" data-action="back" title="后退" disabled>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="10 4 6 8 10 12"/></svg>
          </button>
          <button class="browser-nav-btn" data-action="forward" title="前进" disabled>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 4 10 8 6 12"/></svg>
          </button>
          <button class="browser-nav-btn browser-refresh-btn" data-action="refresh" title="刷新">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 8 12 10 10 8"/><path d="M12 10a6 6 0 1 1-2-7"/></svg>
          </button>
          <div class="browser-url-bar">
            <input type="text" class="browser-url-input" value="${displayUrl}" spellcheck="false" autofocus>
            <button class="browser-go-btn" title="前往">前往</button>
          </div>
          <button class="browser-open-btn" title="在系统浏览器中打开">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>
              <path d="M10 2h4v4"/>
              <path d="M14 2L8 8"/>
            </svg>
          </button>
        </div>
        ${url === 'about:blank'
          ? `<div class="browser-placeholder">
               <div class="browser-placeholder-content">
                 <svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" opacity="0.3">
                   <path d="M437,75A256,256,0,0,0,75,437,256,256,0,0,0,437,75ZM256,492c-30.84,0-60.34-23.7-83.08-66.72-10.76-20.36-19.32-43.8-25.49-69.28H364.57c-6.17,25.48-14.73,48.92-25.49,69.28C316.34,468.3,286.84,492,256,492ZM143.16,336a450.51,450.51,0,0,1,0-160H368.84A439.33,439.33,0,0,1,376,256a439.33,439.33,0,0,1-7.16,80ZM256,20c30.84,0,60.34,23.7,83.08,66.72,10.76,20.36,19.32,43.8,25.49,69.28H147.43c6.17-25.48,14.73-48.92,25.49-69.28C195.66,43.7,225.16,20,256,20ZM389.15,176H478a236,236,0,0,1,0,160H389.15A460.57,460.57,0,0,0,396,256,460.57,460.57,0,0,0,389.15,176Zm80.58-20H385.1c-6.63-28.94-16.16-55.58-28.33-78.62-10.34-19.57-22.14-35.67-35-48A237.09,237.09,0,0,1,469.73,156ZM190.21,29.34c-12.84,12.37-24.64,28.47-35,48-12.17,23-21.7,49.68-28.33,78.62H42.27A237.09,237.09,0,0,1,190.21,29.34ZM34,176h88.88a470.58,470.58,0,0,0,0,160H34a236,236,0,0,1,0-160Zm8.3,180H126.9c6.63,28.94,16.16,55.58,28.33,78.62,10.34,19.57,22.14,35.67,35,48A237.09,237.09,0,0,1,42.27,356ZM321.79,482.66c12.84-12.37,24.64-28.47,35-48,12.17-23,21.7-49.68,28.33-78.62h84.63A237.09,237.09,0,0,1,321.79,482.66Z"/>
                 </svg>
                 <span class="browser-placeholder-text">在地址栏输入网址后回车</span>
               </div>
             </div>
             <iframe class="browser-iframe" style="display:none;" src="about:blank"
               sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
               loading="lazy" title="${displayUrl}"></iframe>`
          : `<iframe class="browser-iframe" src="${encodedUrl}"
               sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
               loading="lazy" title="${displayUrl}"></iframe>`
        }
      </div>`;

    this._updateSaveBtn();
    this._updateMdToggleBtn();

    // 绑定事件
    this._bindBrowserEvents(url);
  }

  /** @private 绑定浏览器工具栏事件 */
  _bindBrowserEvents(currentUrl) {
    const container = this._container;
    const iframe = container.querySelector('.browser-iframe');
    const placeholder = container.querySelector('.browser-placeholder');
    const urlInput = container.querySelector('.browser-url-input');
    const goBtn = container.querySelector('.browser-go-btn');
    const refreshBtn = container.querySelector('.browser-refresh-btn');
    const backBtn = container.querySelector('[data-action="back"]');
    const fwdBtn = container.querySelector('[data-action="forward"]');
    const openBtn = container.querySelector('.browser-open-btn');

    if (!urlInput) return;

    // 地址栏回车 / 前往按钮
    const navigate = () => {
      let rawUrl = urlInput.value.trim();
      if (!rawUrl) return;
      // 自动补全协议
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
        urlInput.value = rawUrl;
      }
      if (iframe) {
        iframe.style.display = '';
        iframe.src = rawUrl;
      }
      if (placeholder) placeholder.style.display = 'none';
      // 更新当前 URL
      this._currentPath = 'url:' + rawUrl;
      this._container.dataset.currentPath = this._currentPath;
      // 通知外部 URL 变更
      const ws = window.HippoWorkspace;
      if (ws && ws.onBrowserUrlChange) {
        ws.onBrowserUrlChange(rawUrl);
      }
    };

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate();
    });
    if (goBtn) goBtn.addEventListener('click', navigate);

    // 刷新
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        iframe.src = iframe.src;
      });
    }

    // 后退 / 前进（尝试调用 iframe 的 history API）
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        try { iframe.contentWindow.history.back(); } catch {}
      });
    }
    if (fwdBtn) {
      fwdBtn.addEventListener('click', () => {
        try { iframe.contentWindow.history.forward(); } catch {}
      });
    }

    // 在系统浏览器中打开
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const url = urlInput.value;
        if (window.HippoDesktop && window.HippoDesktop.openExternal) {
          window.HippoDesktop.openExternal(url).catch(() => {
            window.open(url, '_blank');
          });
        } else {
          window.open(url, '_blank');
        }
      });
    }
  }

  clear() {
    this._destroyEditor();
    this._binaryViewType = null;
    this._currentPath = null;
    this._content = '';
    this._dirty = false;
    this._originalContent = null;
    this._scrollPositions.clear();
    delete this._container.dataset.currentPath;
    this._updateSaveBtn();
  }

  /**
   * 滚动到指定行并聚焦，可选选中范围并居中
   * @param {number} line - 1-based 起始行号
   * @param {number} [endLine] - 1-based 结束行号（可选），提供则选中起始到结束行范围
   */
  scrollToLine(line, endLine) {
    if (!this._view) return;
    const fromLine = Math.max(0, line - 1);
    const docLine = this._view.state.doc.line(fromLine + 1);
    if (!docLine) return;

    let selection;
    if (endLine && endLine > line) {
      const toLine = Math.min(endLine, this._view.state.doc.lines);
      const endDocLine = this._view.state.doc.line(toLine);
      selection = { anchor: docLine.from, head: endDocLine.to };
    } else {
      selection = { anchor: docLine.from };
    }

    this._view.dispatch({ selection });

    // 将目标行定位到视口上方约 1/4 处
    requestAnimationFrame(() => {
      const lineBlock = this._view.lineBlockAt(docLine.from);
      if (lineBlock) {
        const scrollDOM = this._view.scrollDOM;
        scrollDOM.scrollTop = lineBlock.top - scrollDOM.clientHeight * 0.25;
      }
    });

    this._view.focus();
  }

  /** @private 获取 AI 修改前的文件原始内容，用于 diff 标记 */
  async _fetchOriginalContent(filePath) {
    try {
      const resp = await fetch(`/api/diff/original?path=${encodeURIComponent(filePath)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.content === undefined || data.content === null) return;

      this._originalContent = data.content;

      // 激活 diff 扩展
      if (this._view) {
        this._view.dispatch({
          effects: this._diffCompartment.reconfigure(
            createDiffExtension(this._originalContent)
          ),
        });
      }
    } catch (e) {
      console.debug('FilePreview: no original content for', filePath);
    }
  }

  // ==================== CodeMirror ====================

  _initEditor(content, filePath) {
    this._destroyEditor();

    const lang = this._getLanguageExtension(filePath);
    const isDark = this._isDarkTheme();

    const saveKeyBinding = keymap.of([{
      key: 'Mod-s',
      run: () => { this.save(); return true; }
    }]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        lang,
        this._themeCompartment.of(isDark ? oneDark : this._getLightTheme()),
        this._diffCompartment.of([]), // 暂不启用 diff，等 _fetchOriginalContent 完成后激活
        saveKeyBinding,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    this._view = new EditorView({
      state,
      parent: this._container,
      dispatch: (tr) => {
        this._view.update([tr]);
        if (tr.docChanged) {
          const currentContent = this._view.state.doc.toString();
          if (currentContent === this._content) {
            // 撤销回原始内容，清除脏标记
            if (this._dirty) {
              this._dirty = false;
              this._onDirtyChange(this._currentPath, false);
              this._updateSaveBtn();
            }
          } else if (!this._dirty) {
            this._dirty = true;
            this._onDirtyChange(this._currentPath, true);
            this._updateSaveBtn();
          }
        }
      },
    });

    // 挂到 DOM 上，供 selection-actions 计算行号引用
    this._container._cmPreviewView = this._view;

    // 初始化搜索面板
    this._searchPanel = new SearchPanel(this._view);

    // ── MD 预览容器 ──
    this._mdPreviewEl = document.createElement('div');
    this._mdPreviewEl.className = 'file-md-preview';
    this._mdPreviewEl.style.display = 'none';
    this._container.appendChild(this._mdPreviewEl);

    // ── 拦截 Ctrl+F / Ctrl+H ──
    //
    // 使用 capture phase（第三个参数 true）在 CM6 内部 keymap 处理前拦截事件。
    //
    // 为什么不用 CM6 keymap 覆盖？
    //   CM6 defaultKeymap 中 "Ctrl-f" 绑定了 cursorCharRight（Emacs 风格），
    //   这个绑定会优先匹配成功并 return true，导致我们的 Mod-f 覆盖永远无法生效。
    //
    // 为什么用 capture phase？
    //   capture phase 在 CM6 内部 dispatch 之前执行，preventDefault() +
    //   stopImmediatePropagation() 可以直接阻止事件到达 CM6 的 keymap 系统。
    //
    // 注意事项：
    //   - 只在 编辑器内快捷键冲突 时用此方案，新增快捷键优先用 CM6 keymap.of()
    //   - _destroyEditor() 中必须 removeEventListener 清理
    //   - scope: 'editor' 在此场景无效，因为 defaultKeymap 也有相同 key
    this._view.dom.addEventListener('keydown', this._boundSearchShortcut = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (this._searchPanel) this._searchPanel.openFind();
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (this._searchPanel) this._searchPanel.openReplace();
        }
      }
    }, true); // capture phase

    // 暴露搜索方法（供外部如 DevTools 调用）
    window.__cmOpenFind = () => {
      if (this._view) {
        this._view.focus();
        if (this._searchPanel) this._searchPanel.openFind();
      }
    };

    // 恢复上次滚动位置
    if (filePath && this._scrollPositions.has(filePath)) {
      requestAnimationFrame(() => {
        if (this._view) {
          this._view.scrollDOM.scrollTop = this._scrollPositions.get(filePath);
        }
      });
    }

    this._startThemeObserver();
  }

  _destroyEditor() {
    this._stopTocScrollSync();
    this._stopThemeObserver();
    this._container._cmPreviewView = null;
    if (this._view) {
      if (this._boundSearchShortcut) {
        this._view.dom.removeEventListener('keydown', this._boundSearchShortcut, true);
        this._boundSearchShortcut = null;
      }
      this._view.destroy();
      this._view = null;
      this._searchPanel = null;
      this._mdPreviewEl = null;
    }
    this._container.innerHTML = '';
  }

  /** 当前是否为深色主题 */
  _isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /** 获取浅色主题，vsCodeLight 不可用时降级到 defaultHighlightStyle */
  _getLightTheme() {
    if (typeof vsCodeLight !== 'undefined') return vsCodeLight;
    console.warn('FilePreview: vsCodeLight 未加载，降级到 defaultHighlightStyle');
    return syntaxHighlighting(defaultHighlightStyle);
  }

  /** 监听 <html> data-theme 变化，动态切换 CM6 主题 */
  _startThemeObserver() {
    this._stopThemeObserver();
    this._themeObserver = new MutationObserver(() => {
      if (!this._view) return;
      const isDark = this._isDarkTheme();
      const ext = isDark ? oneDark : this._getLightTheme();
      this._view.dispatch({
        effects: this._themeCompartment.reconfigure(ext),
      });
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  _stopThemeObserver() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
  }

  _getLanguageExtension(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const map = {
      js: javascript, jsx: javascript, ts: javascript, tsx: javascript, mjs: javascript, cjs: javascript,
      py: python,
      java,
      html, htm: html, vue: html, svelte: html,
      css, scss: sass, less: sass,
      json,
      md: markdown, markdown,
      xml, svg: xml,
      yaml, yml: yaml,
      sql,
      rs: rust,
      php,
      go,
    };
    const langFn = map[ext];
    return langFn ? langFn() : [];
  }

  // ==================== 按钮状态同步 ====================

  _updateSaveBtn() {
    const btn = document.getElementById('previewSaveBtn');
    const searchBtn = document.getElementById('previewSearchBtn');
    if (!btn) return;

    if (this._currentPath) {
      // 二进制文件（图片/PDF）不显示保存和搜索按钮
      if (this._binaryViewType) {
        btn.style.display = 'none';
        if (searchBtn) searchBtn.style.display = 'none';
        return;
      }
      btn.style.display = '';
      if (searchBtn) searchBtn.style.display = this._mdPreviewMode ? 'none' : '';
      if (this._dirty) {
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 4l-7 7L3 8"/>
          </svg>`;
        btn.title = '保存 (Ctrl+S)';
        btn.classList.add('dirty');
      } else {
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 4l-7 7L3 8"/>
          </svg>`;
        btn.title = '已保存';
        btn.classList.remove('dirty');
      }
    } else {
      btn.style.display = 'none';
      if (searchBtn) searchBtn.style.display = 'none';
    }
  }

  // ==================== MD 预览切换 ====================

  /** 判断是否为 Markdown 文件 */
  _isMarkdown(filePath) {
    return filePath && filePath.toLowerCase().endsWith('.md');
  }

  /** 切换 MD 预览/编辑模式 */
  async _toggleMdPreview() {
    if (!this._isMarkdown(this._currentPath) || !this._view) return;

    if (this._mdPreviewMode) {
      // 切回编辑模式
      this._mdPreviewEl.style.display = 'none';
      this._view.dom.style.display = '';
      this._view.focus();
      this._mdPreviewMode = false;
      this._stopTocScrollSync();
      this._tocEl = null;
    } else {
      // 切到预览模式
      const content = this._view.state.doc.toString();
      this._contentForPreview = content;
      this._mdPreviewEl.innerHTML = '<div class="file-md-preview-loading">渲染中...</div>';
      this._mdPreviewEl.style.display = '';
      this._view.dom.style.display = 'none';
      // 关闭搜索面板（预览模式下不可用）
      if (this._searchPanel) this._searchPanel.close();

      try {
        const html = await renderMarkdown(content);

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
          <p>渲染失败: ${this._escapeHtml(err.message)}</p>
        </div>`;
      }
      this._mdPreviewMode = true;
    }
    this._updateSaveBtn();
    this._updateMdToggleBtn();
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

    headings.forEach((h, index) => {
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
      <span class="file-md-toc-title">目录</span>
      <button class="file-md-toc-toggle" title="收起目录">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="10 3 5 8 10 13"/>
        </svg>
      </button>
    </div>`;
    let itemsHtml = '';
    for (const item of tocItems) {
      itemsHtml += `<a class="file-md-toc-item level-${item.level}" data-target="${item.id}" href="#${item.id}">${this._escapeHtml(item.text)}</a>`;
    }
    // 浮层面板（折叠 hover 时弹出）
    const floatingHtml = `<div class="file-md-toc-floating">
      <div class="file-md-toc-header">
        <span class="file-md-toc-title">目录</span>
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
    if (this._tocObserver) {
      this._tocObserver.disconnect();
      this._tocObserver = null;
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
      btn.title = this._tocCollapsed ? '展开目录' : '收起目录';
      btn.innerHTML = this._tocCollapsed
        ? `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 3 11 8 6 13"/>
          </svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="10 3 5 8 10 13"/>
          </svg>`;
    }
  }

  /** 更新 MD 预览切换按钮状态 */
  _updateMdToggleBtn() {
    const btn = document.getElementById('previewMdToggleBtn');
    if (!btn) return;

    if (this._isMarkdown(this._currentPath) && this._view) {
      btn.style.display = '';
      btn.classList.toggle('active', this._mdPreviewMode);
      btn.title = this._mdPreviewMode ? '编辑模式' : '预览模式';
      btn.innerHTML = this._mdPreviewMode
        ? `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 1.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1z"/>
            <line x1="5" y1="4" x2="11" y2="4"/>
            <line x1="5" y1="7" x2="11" y2="7"/>
            <line x1="5" y1="10" x2="9" y2="10"/>
          </svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 3v10l5-3.5L11 13l4-2.5V3l-4 2.5L6 3 1 6.5z"/>
            <path d="M6 3v7.5"/>
            <path d="M11 5.5V13"/>
          </svg>`;
    } else {
      btn.style.display = 'none';
    }
  }

  _showError(message) {
    this._destroyEditor();
    this._container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>${this._escapeHtml(message)}</p>
    </div>`;
    this._updateSaveBtn();
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
