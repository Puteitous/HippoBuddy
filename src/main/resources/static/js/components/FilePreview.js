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
import { computeDiffDecorations } from './FilePreviewDiff.js'
import { BinaryPreview, isImageFile, isPdfFile, isSpreadsheetFile, isDocxFile, isPptxFile, isBinaryFile } from './file-binary-preview.js'
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
    /** @private localStorage 持久化键名 */
    this._SCROLL_KEY = 'hippo-scroll-positions';
    /** @private 滚动节流定时器句柄 */
    this._scrollThrottleTimer = null;
    /** @private 绑定的 scroll 回调引用，用于清理 */
    this._boundScrollHandler = null;
    /** @private 绑定的 beforeunload 回调引用，用于清理 */
    this._boundBeforeUnload = null;
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
    // 绑定在外部程序中打开按钮（Office 文件）
    this._registerOpenInOfficeBtn();

    // ── 页面关闭/刷新前保存当前滚动位置 ──
    this._boundBeforeUnload = () => {
      if (this._view && this._currentPath) {
        const top = this._view.scrollDOM.scrollTop;
        this._scrollPositions.set(this._currentPath, top);
        this._persistScrollPositions();
      } else {
      }
    };
    window.addEventListener('beforeunload', this._boundBeforeUnload);
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
      this._updateSearchBtn();
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
      // 桌面端：直接用 file:// 协议在系统浏览器中打开，浏览器会以文件所在目录为基准
      // 解析相对路径（<script src="app.js"> → file:///F:/test/calculator/app.js），
      // 无需经过 HTTP Server，无资源加载限制
      if (window.HippoDesktop && window.HippoDesktop.openExternal) {
        const fileUrl = 'file:///' + encodeURI(this._currentPath.replace(/\\/g, '/'));
        window.HippoDesktop.openExternal(fileUrl);
      } else if (window.HippoWorkspace && window.HippoWorkspace.openWebBrowser) {
        // Web 端降级：通过 HTTP Server 获取 HTML 渲染
        const previewUrl = `/api/file/raw?path=${encodeURIComponent(this._currentPath)}&t=${Date.now()}`;
        window.HippoWorkspace.openWebBrowser(previewUrl, displayName);
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

  /** @private 绑定在外部程序中打开按钮（Office 文件） */
  _registerOpenInOfficeBtn() {
    const btn = document.getElementById('previewOpenInOfficeBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!this._currentPath) return;
      if (window.HippoDesktop && window.HippoDesktop.openExternal) {
        const fileUrl = 'file:///' + encodeURI(this._currentPath.replace(/\\/g, '/'));
        window.HippoDesktop.openExternal(fileUrl);
      }
    });
  }

  /** @private 显示/隐藏 Office 打开按钮并更新 title */
  _updateOpenInOfficeBtn() {
    const btn = document.getElementById('previewOpenInOfficeBtn');
    if (!btn) return;

    const path = this._currentPath;
    if (isDocxFile(path)) {
      btn.style.display = '';
      btn.title = i18n.t('preview.openInWord');
    } else if (isSpreadsheetFile(path)) {
      btn.style.display = '';
      btn.title = i18n.t('preview.openInExcel');
    } else if (isPptxFile(path)) {
      btn.style.display = '';
      btn.title = i18n.t('preview.openInPowerPoint');
    } else {
      btn.style.display = 'none';
    }
  }

  /** @private 显示/隐藏刷新按钮（仅二进制/Office/HTML 预览需要） */
  _updateRefreshBtn() {
    const btn = document.getElementById('previewRefreshBtn');
    if (!btn) return;
    btn.style.display = this._binaryViewType ? '' : 'none';
  }

  async show(filePath) {
    // 上游（FileTabs onBeforeSwitch）已处理脏检查弹窗，此处只清理旧 dirty 状态
    if (this._dirty) {
      this._dirty = false;
      this._onDirtyChange(this._currentPath, false);
    }

    // 切换文件前保存当前文件的滚动位置
    if (this._view && this._currentPath) {
      const oldTop = this._view.scrollDOM.scrollTop;
      this._scrollPositions.set(this._currentPath, oldTop);
      this._persistScrollPositions();
    }

    this._currentPath = filePath;
    this._container.dataset.currentPath = filePath;
    // 单调递增 generation，用于 Silurus 路径守卫防止同文件竞态
    this._sessionGen = (this._sessionGen || 0) + 1;
    this._container.dataset.sessionGen = String(this._sessionGen);
    this._dirty = false;
    // 重置二进制预览类型，后续分支会按需重新赋值；避免切换到代码文件时残留旧值
    this._binaryViewType = null;

    // ── URL 协议前缀 → 委托 showBrowser（防御性，防止误调用）──
    if (filePath && filePath.startsWith('url:')) {
      this._destroyEditor();
      this._binaryViewType = 'browser';
      this._browserPreview.show(filePath.slice(4));
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── 图片 / PDF → 委托 BinaryPreview ──
    if (isImageFile(filePath) || isPdfFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = isImageFile(filePath) ? 'image' : 'pdf';
      this._binaryPreview.showImageOrPdf(filePath, this._binaryViewType);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── XLSX 文件 → 委托 BinaryPreview（Silurus 引擎）──
    // .xls 和 .csv 仍走旧的 SheetJS 路径
    if (filePath && filePath.toLowerCase().endsWith('.xlsx')) {
      this._destroyEditor();
      this._binaryViewType = 'spreadsheet';
      this._binaryPreview.showXlsxSilurus(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── XLS / CSV → 委托 BinaryPreview（SheetJS 旧路径）──
    if (isSpreadsheetFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'spreadsheet';
      this._binaryPreview.showSpreadsheet(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── DOCX 文件 → 委托 BinaryPreview（Silurus 引擎）──
    if (isDocxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'docx';
      this._binaryPreview.showDocxSilurus(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── PPTX 文件 → 委托 BinaryPreview（Silurus 引擎）──
    if (isPptxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'pptx';
      this._binaryPreview.showPptxSilurus(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── 其他二进制文件（zip/exe/dll/jar 等）→ 只读提示，不解析预览 ──
    if (isBinaryFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'binary';
      this._container.innerHTML = this._buildBinaryPlaceholder(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    let content;
    try {
      const result = await window.HippoDesktop.readFile(filePath);
      if (!result || result.error) {
        const fileName = filePath.split(/[/\\]/).pop();
        let msg;
        if (!result) {
          msg = i18n.t('preview.readFailed');
        } else if (result.code === 'ENOENT') {
          msg = i18n.t('preview.fileNotFound') + ': ' + fileName;
        } else if (result.code === 'NOT_A_FILE') {
          msg = i18n.t('preview.readFailed') + ': ' + fileName;
        } else {
          msg = i18n.t('preview.readFailed') + ': ' + fileName;
        }
        this._showError(msg);
        this._onError(new Error(result?.code || 'UNKNOWN'));
        return;
      }
      content = result.content;
    } catch (err) {
      console.error('FilePreview: readFile failed', filePath, err);
      const fileName = filePath.split(/[/\\]/).pop();
      const errMsg = err?.message || '';
      const msg = errMsg.includes('ENOENT') || errMsg.includes('no such file')
        ? i18n.t('preview.fileNotFound') + ': ' + fileName
        : i18n.t('preview.readFailed') + ': ' + fileName;
      this._showError(msg);
      this._onError(err);
      return;
    }
    this._initEditor(content, filePath);
    this._updateSearchBtn();
    this._updateMdToggleBtn();
    this._updateRefreshBtn();
    this._updateOpenInOfficeBtn();
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
      // show 完成后立即用已有的 _originalContent（如有）做一次快速 diff 刷新，
      // 这样用户在等待 API 返回最新原始内容期间也能看到 diff 标记。
      // 之后 _fetchOriginalContent 的异步回调会校正为最新的原始内容基准。
      this._refreshDiffDecorations();
    }
  }

  async save() {
    if (!this._currentPath || !this._view || !this._dirty) return;
    const content = this._view.state.doc.toString();
    try {
      const result = await window.HippoDesktop.writeFile(this._currentPath, content);
      if (result && result.error) {
        const fileName = this._currentPath.split(/[/\\]/).pop();
        this._showError(i18n.t('preview.saveFailed') + ': ' + fileName);
        return;
      }
      this._content = content;
      this._dirty = false;
      this._originalContent = null; // 保存后清空原始内容基准，diff 标记自动清除
      this._onDirtyChange(this._currentPath, false);
      this._updateSearchBtn();
      // 重新配置 diff 扩展为空（清除 gutter 标记和行背景色）
      if (this._view) {
        this._view.dispatch({
          effects: this._diffCompartment.reconfigure([]),
        });
      }
    } catch (err) {
      const fileName = this._currentPath.split(/[/\\]/).pop();
      this._showError(i18n.t('preview.saveFailed') + ': ' + fileName);
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
    this._updateSearchBtn();
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
    this._updateSearchBtn();
    this._updateRefreshBtn();
    this._updateOpenInOfficeBtn();
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
    // 记录发起请求时的 sessionGen，回调时对比防止 stale 覆盖
    const gen = this._sessionGen || 0;
    try {
      const resp = await fetch(`/api/diff/original?path=${encodeURIComponent(filePath)}`);
      if (!resp.ok) {
        return;
      }
      const data = await resp.json();
      if (data.content === undefined || data.content === null) {
        return;
      }

      // 守卫：如果在此期间编辑器已被重建（切换文件等），丢弃本次结果
      if ((this._sessionGen || 0) !== gen) {
        return;
      }

      this._originalContent = data.content;

      // 激活 diff 标记：直接计算 Decoration set 并用 decorations.of() 静态注入
      this._refreshDiffDecorations();
    } catch (e) {
      // 静默失败：没有原始内容时不做 diff 标记
    }
  }

  /**
   * @private 使用当前的 _originalContent 重新计算并注入 diff decorations
   * 可安全地多次调用，仅当 _view 和 _originalContent 都存在时生效
   */
  _refreshDiffDecorations() {
    if (!this._view || this._originalContent == null) return;
    const decoSet = computeDiffDecorations(this._view.state.doc, this._originalContent);
    this._view.dispatch({
      effects: this._diffCompartment.reconfigure(
        EditorView.decorations.of(decoSet)
      ),
    });
  }

  // ==================== 滚动位置持久化 ====================

  /** @private 将滚动位置持久化到 localStorage */
  _persistScrollPositions() {
    try {
      const obj = {};
      this._scrollPositions.forEach((val, key) => { obj[key] = val; });
      localStorage.setItem(this._SCROLL_KEY, JSON.stringify(obj));
    } catch (e) {
    }
  }

  /** @private 从 localStorage 加载滚动位置到内存 */
  _loadScrollPositions() {
    try {
      const raw = localStorage.getItem(this._SCROLL_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'number' && val > 0) {
          this._scrollPositions.set(key, val);
        }
      }
    } catch (e) {
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
        // 选中文字时隐藏 .cm-activeLine（避免和选中背景视觉冲突）
        if (tr.selection) {
          const hasSelection = this._view.state.selection.ranges.some(r => !r.empty);
          this._container.classList.toggle('has-selection', hasSelection);
        }
        if (tr.docChanged) {
          const currentContent = this._view.state.doc.toString();
          if (currentContent === this._content) {
            // 撤销回原始内容，清除脏标记
            if (this._dirty) {
              this._dirty = false;
              this._onDirtyChange(this._currentPath, false);
              this._updateSearchBtn();
            }
          } else if (!this._dirty) {
            this._dirty = true;
            this._onDirtyChange(this._currentPath, true);
            this._updateSearchBtn();
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

    // 恢复上次滚动位置（先尝试从 localStorage 加载）
    if (filePath) {
      this._loadScrollPositions();
      if (this._scrollPositions.has(filePath)) {
        const savedTop = this._scrollPositions.get(filePath);
        // 等待 CM6 完成布局后再设置，最多重试 8 帧（≈130ms）
        const tryRestoreScroll = (attempt = 0) => {
          if (!this._view) return;
          if (attempt > 8) return;
          // 确保 scrollDOM 已经有可滚动的内容，否则 CM6 后续布局会覆盖 scrollTop
          if (this._view.scrollDOM.scrollHeight > this._view.scrollDOM.clientHeight) {
            this._view.scrollDOM.scrollTop = savedTop;
          } else {
            requestAnimationFrame(() => tryRestoreScroll(attempt + 1));
          }
        };
        requestAnimationFrame(() => tryRestoreScroll(0));
      }
    }

    // ── 节流保存滚动位置 ──
    // 用户滚动时每 1.5 秒自动保存到 localStorage，刷新后不会丢失
    this._boundScrollHandler = () => {
      if (this._scrollThrottleTimer) return;
      this._scrollThrottleTimer = setTimeout(() => {
        this._scrollThrottleTimer = null;
        if (this._view && this._currentPath) {
          const top = this._view.scrollDOM.scrollTop;
          this._scrollPositions.set(this._currentPath, top);
          this._persistScrollPositions();
        }
      }, 1500);
    };
    this._view.scrollDOM.addEventListener('scroll', this._boundScrollHandler, { passive: true });

    this._startThemeObserver();
  }

  _destroyEditor() {
    this._mdPreview.destroy();
    this._stopThemeObserver();
    this._container._cmPreviewView = null;

    // 清理滚动节流定时器和事件监听
    if (this._scrollThrottleTimer) {
      clearTimeout(this._scrollThrottleTimer);
      this._scrollThrottleTimer = null;
    }
    if (this._view && this._boundScrollHandler) {
      this._view.scrollDOM.removeEventListener('scroll', this._boundScrollHandler);
      this._boundScrollHandler = null;
    }

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
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' || theme === 'midnight';
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

  _updateSearchBtn() {
    const searchBtn = document.getElementById('previewSearchBtn');
    if (!searchBtn) return;

    if (this._currentPath) {
      // 二进制文件（图片/PDF）不显示搜索按钮
      if (this._binaryViewType) {
        searchBtn.style.display = 'none';
        return;
      }
      searchBtn.style.display = this._mdPreview.isPreview ? 'none' : '';
    } else {
      searchBtn.style.display = 'none';
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
      btn.title = this._mdPreview.isPreview ? i18n.t('preview.editMode') : i18n.t('preview.previewMode');
      btn.innerHTML = this._mdPreview.isPreview
        ? `<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round">
            <path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z"/>
            <path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z"/>
          </svg>`
        : `<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.85786 18C6.23858 21 4 24 4 24C4 24 12.9543 36 24 36C25.3699 36 26.7076 35.8154 28 35.4921M20.0318 12.5C21.3144 12.1816 22.6414 12 24 12C35.0457 12 44 24 44 24C44 24 41.7614 27 38.1421 30"/>
            <path d="M20.3142 20.6211C19.4981 21.5109 19 22.6972 19 23.9998C19 26.7612 21.2386 28.9998 24 28.9998C25.3627 28.9998 26.5981 28.4546 27.5 27.5705"/>
            <path d="M42 42L6 6"/>
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
    this._updateSearchBtn();
  }

  /** @private 构建二进制文件占位提示 HTML */
  _buildBinaryPlaceholder(filePath) {
    const ext = filePath.split('.').pop().toUpperCase();
    const fileName = filePath.split(/[/\\]/).pop();
    const canShowInFolder = typeof window.HippoDesktop !== 'undefined'
      && window.HippoDesktop
      && typeof window.HippoDesktop.showItemInFolder === 'function';
    const escapedFileName = this._escapeHtml(fileName);
    const escapedExt = this._escapeHtml(ext);
    // 路径中的反斜杠在 JS 字符串字面量中需转义，同时转义单引号
    const escapedPath = this._escapeHtml(filePath).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <p><strong>${escapedFileName}</strong></p>
      <p style="color:var(--text-muted);font-size:13px;margin-top:4px;">
        ${escapedExt} 文件无法在编辑器中预览，请在本地打开
      </p>
      ${canShowInFolder
        ? `<button class="file-preview-open-folder-btn" onclick="(async () => { try { await window.HippoDesktop.showItemInFolder('${escapedPath}'); } catch(e) { console.error(e); } })()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            在文件管理器中查看
          </button>`
        : ''
      }
    </div>`;
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
    } else if (this._binaryViewType === 'binary') {
      parts.push(filePath.split('.').pop().toUpperCase());
    } else {
      // 代码/文本文件
      const lang = this._getLanguageLabel(filePath);
      if (lang) parts.push(lang);
      parts.push('UTF-8');
      // 行数
      if (this._view) {
        const lineCount = this._view.state.doc.lines;
        parts.push(lineCount + (window.i18n ? window.i18n.t('preview.lines') : ' 行'));
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
