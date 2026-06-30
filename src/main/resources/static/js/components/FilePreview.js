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
  defaultHighlightStyle, syntaxHighlighting, scrollPastEnd,
  javascript, python, java, html, css, json, markdown, xml, yaml, sql,
  rust, php, go, sass } from '../vendor/codemirror.js'
import { SearchPanel } from './search-panel.js'
import { renderMarkdown } from '../markdown-renderer.js'
import { createDiffExtension } from './FilePreviewDiff.js'
import { BinaryPreview, isImageFile, isPdfFile, isSpreadsheetFile, isDocxFile, isPptxFile } from './file-binary-preview.js'
import { FilePreviewBrowser } from './file-preview-browser.js'
import { FilePreviewMdPreview } from './file-preview-md.js'

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

    /** @private Markdown 预览委托实例 */
    this._mdPreview = new FilePreviewMdPreview({
      container: this._container,
      renderMarkdown,
    });

    /** @private 内嵌浏览器委托实例 */
    this._browserPreview = new FilePreviewBrowser({
      container: this._container,
      onUrlChange: (url) => {
        this._currentPath = 'url:' + url;
        this._container.dataset.currentPath = this._currentPath;
        const ws = window.HippoWorkspace;
        if (ws && ws.onBrowserUrlChange) {
          ws.onBrowserUrlChange(url);
        }
      },
    });

    // 绑定搜索按钮
    this._registerSearchButton();
    // 绑定 MD 预览切换按钮
    this._registerMdToggleBtn();
    // 绑定 HTML 预览按钮
    this._registerHtmlPreviewBtn();
    // 绑定刷新按钮
    this._registerRefreshBtn();
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
    btn.addEventListener('click', async () => {
      if (!this._isMarkdown(this._currentPath) || !this._view) return;
      const prevMode = this._mdPreview.isPreview;
      const mode = await this._mdPreview.toggle(this._view.state.doc.toString());
      // 编辑模式时恢复编辑器显示
      if (prevMode) {
        this._view.dom.style.display = '';
        if (this._searchPanel) this._searchPanel.close();
      } else {
        this._view.dom.style.display = 'none';
        if (this._searchPanel) this._searchPanel.close();
      }
      this._updateSaveBtn();
      this._updateMdToggleBtn();
    });
  }

  /** @private 绑定 HTML 预览按钮 — 在内部浏览器中预览渲染效果 */
  _registerHtmlPreviewBtn() {
    const btn = document.getElementById('previewHtmlToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!this._currentPath) return;
      const displayName = this._currentPath.split('/').pop() || '预览';
      console.debug('[HTML预览] 点击预览按钮, path:', this._currentPath);
      if (!window.HippoWorkspace || !window.HippoWorkspace.openWebBrowser) return;
      // 通过 RawFileHandler 获取 HTML 内容，注入 <base> 标签使相对路径以服务器根目录为基准
      try {
        const resp = await fetch(`/api/file/raw?path=${encodeURIComponent(this._currentPath)}&t=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        // 注入 <base> 标签让相对路径（js/vendor/...）以服务器根目录为基准正确解析
        const patched = html.replace(/<head\b[^>]*>/i, match => `${match}<base href="${window.location.origin}/">`);
        // 先用 about:blank 创建 iframe 浏览器，地址栏保持干净
        window.HippoWorkspace.openWebBrowser('about:blank', displayName);
        // 等 iframe 创建完毕后通过 srcdoc 注入带 base 的 HTML
        setTimeout(() => {
          const iframe = this._container?.querySelector('.browser-iframe');
          const placeholder = this._container?.querySelector('.browser-placeholder');
          if (iframe) {
            iframe.style.display = '';
            iframe.srcdoc = patched;
          }
          if (placeholder) placeholder.style.display = 'none';
        }, 100);
      } catch (err) {
        console.error('[HTML预览] 加载失败:', err);
      }
    });
  }

  /** @private 绑定刷新按钮点击事件 */
  _registerRefreshBtn() {
    const btn = document.getElementById('previewRefreshBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!this._currentPath) return;
      this.show(this._currentPath);
    });
  }

  /** @private 显示/隐藏刷新按钮 */
  _updateRefreshBtn() {
    const btn = document.getElementById('previewRefreshBtn');
    if (!btn) return;
    btn.style.display = this._currentPath ? '' : 'none';
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

    // ── URL 协议前缀 → 委托 showBrowser（防御性，防止误调用）──
    if (filePath && filePath.startsWith('url:')) {
      this._destroyEditor();
      this._binaryViewType = 'browser';
      this._browserPreview.show(filePath.slice(4));
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── 图片 / PDF → 委托 BinaryPreview ──
    if (isImageFile(filePath) || isPdfFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = isImageFile(filePath) ? 'image' : 'pdf';
      this._binaryPreview.showImageOrPdf(filePath, this._binaryViewType);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── 表格文件（XLSX/XLS/CSV）→ 委托 BinaryPreview ──
    if (isSpreadsheetFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'spreadsheet';
      this._binaryPreview.showSpreadsheet(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── DOCX 文件 → 委托 BinaryPreview ──
    if (isDocxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'docx';
      this._binaryPreview.showDocx(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── PPTX 文件 → 委托 BinaryPreview ──
    if (isPptxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'pptx';
      this._binaryPreview.showPptx(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateStatusbar(filePath);
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
    this._initEditor(content, filePath);
    this._updateSaveBtn();
    this._updateMdToggleBtn();
    this._updateRefreshBtn();
    this._updateStatusbar(filePath);
    // HTML 文件显示预览按钮
    const htmlBtn = document.getElementById('previewHtmlToggleBtn');
    if (htmlBtn) {
      const ext = filePath.split('.').pop().toLowerCase();
      htmlBtn.style.display = (ext === 'html' || ext === 'htm') ? '' : 'none';
    }
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

  /**
   * 打开内嵌浏览器（委托给 FilePreviewBrowser）
   * @param {string} url - 要加载的 URL
   */
  showBrowser(url) {
    this._destroyEditor();
    this._binaryViewType = 'browser';
    this._currentPath = 'url:' + url;
    this._container.dataset.currentPath = this._currentPath;
    this._dirty = false;
    this._browserPreview.show(url);
    this._updateSaveBtn();
    this._updateMdToggleBtn();
    this._updateRefreshBtn();
    this._updateStatusbar(this._currentPath);
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
    this._updateRefreshBtn();
    this._updateStatusbar(null);
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
        scrollPastEnd(),
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
    this._mdPreview.destroy();
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
      if (searchBtn) searchBtn.style.display = this._mdPreview.isPreview ? 'none' : '';
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

  /** 更新 MD 预览切换按钮状态 */
  _updateMdToggleBtn() {
    const btn = document.getElementById('previewMdToggleBtn');
    if (!btn) return;

    if (this._isMarkdown(this._currentPath) && this._view) {
      btn.style.display = '';
      btn.classList.toggle('active', this._mdPreview.isPreview);
      btn.title = this._mdPreview.isPreview ? '编辑模式' : '预览模式';
      btn.innerHTML = this._mdPreview.isPreview
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

  /** 更新底部状态栏信息 */
  _updateStatusbar(filePath) {
    const statusbar = document.getElementById('filePreviewStatusbar');
    const rightEl = document.getElementById('statusbarRight');
    if (!statusbar || !rightEl) return;

    if (!filePath) {
      statusbar.style.display = 'none';
      return;
    }

    statusbar.style.display = '';

    const parts = [];

    if (isImageFile(filePath) || isPdfFile(filePath)) {
      const ext = filePath.split('.').pop().toUpperCase();
      parts.push(ext);
    } else if (isSpreadsheetFile(filePath)) {
      // 详细信息由 BinaryPreview 解析完成后覆盖更新
      parts.push(filePath.split('.').pop().toUpperCase());
    } else if (isDocxFile(filePath)) {
      // 详细信息由 BinaryPreview 解析完成后覆盖更新
      parts.push('DOCX');
    } else if (isPptxFile(filePath)) {
      // 详细信息由 BinaryPreview 解析完成后覆盖更新
      parts.push('PPTX');
    } else if (filePath.startsWith('url:')) {
      parts.push('Browser');
    } else {
      // 代码/文本文件
      const lang = this._getLanguageLabel(filePath);
      if (lang) parts.push(lang);
      parts.push('UTF-8');
      // 行数
      if (this._view) {
        const lineCount = this._view.state.doc.lines;
        parts.push(`${lineCount} 行`);
      }
    }

    rightEl.textContent = parts.join(' · ');
  }

  /** 获取文件扩展名对应的语言标签 */
  _getLanguageLabel(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const map = {
      js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
      mjs: 'JavaScript', cjs: 'JavaScript',
      py: 'Python',
      java: 'Java',
      html: 'HTML', htm: 'HTML', vue: 'Vue', svelte: 'Svelte',
      css: 'CSS', scss: 'SCSS', less: 'Less',
      json: 'JSON',
      md: 'Markdown', markdown: 'Markdown',
      xml: 'XML', svg: 'SVG',
      yaml: 'YAML', yml: 'YAML',
      sql: 'SQL',
      rs: 'Rust',
      php: 'PHP',
      go: 'Go',
      c: 'C', h: 'C',
      cpp: 'C++', hpp: 'C++', cc: 'C++', cxx: 'C++',
      cs: 'C#',
      rb: 'Ruby',
      swift: 'Swift',
      kt: 'Kotlin', kts: 'Kotlin',
      sh: 'Shell', bash: 'Shell', zsh: 'Shell',
      bat: 'Batch', cmd: 'Batch',
      ps1: 'PowerShell',
      dockerfile: 'Dockerfile',
      gradle: 'Gradle',
      toml: 'TOML',
      ini: 'INI', cfg: 'INI',
      conf: 'Config',
    };
    return map[ext] || ext.toUpperCase();
  }
}
