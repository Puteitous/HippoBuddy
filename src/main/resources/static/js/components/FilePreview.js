/**
 * FilePreview — 文件预览/编辑组件
 *
 * 文本/代码文件 → CodeMirror 6 编辑器（可编辑）
 * 图片/PDF/表格/DOCX → 委托给 BinaryPreview（只读）
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - js/vendor/codemirror.js（esbuild 打包的 CM6 bundle）
 *   - js/components/binary-preview/BinaryPreview.js（二进制预览委托）
 */

import { EditorView, keymap, EditorState, Compartment, basicSetup, oneDark, vsCodeLight,
  defaultHighlightStyle, syntaxHighlighting, scrollPastEnd,
  javascript, python, java, html, css, json, markdown, xml, yaml, sql,
  rust, php, go, sass } from '../vendor/codemirror.js'
import { SearchPanel } from './search-panel.js'
import { renderMarkdown } from '../markdown-renderer.js'
import { computeDiffInfo, buildDiffGutter, computeOverviewMarkers } from './FilePreviewDiff.js'
import { BinaryPreview, isImageFile, isPdfFile, isSpreadsheetFile, isDocxFile, isPptxFile, isBinaryFile } from './binary-preview/BinaryPreview.js'
import { FilePreviewBrowser } from './file-preview-browser.js'
import { FilePreviewMdPreview } from './file-preview-md.js'
import { FileDiffView } from './FileDiffView.js'
import { appState } from '../state/app-state.js'

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
    /** @private 编辑后 diff 标记重算的防抖定时器句柄 */
    this._diffRefreshTimer = null;
    /** @private 当前文档的 diff 行信息（Map<行号, {type, origText}>，供 gutter 竖条 / 滚动条色带使用） */
    this._diffLineInfo = null;
    /** @private 滚动条整文色带容器（VS Code 式 overview，挂在 .cm-editor 下） */
    this._diffOverviewEl = null;
    /** @private 色带尺寸监听（ResizeObserver，观察 scrollDOM 尺寸变化） */
    this._diffOverviewRO = null;
    /** @private Compartment 用于动态切换自动换行，避免重建编辑器 */
    this._wrapCompartment = new Compartment();
    /** @private 当前文件是否启用自动换行 */
    this._wrapEnabled = false;
    /** @private localStorage 持久化键名：文件路径 → 是否自动换行 */
    this._WRAP_KEY = 'hippo-wrap-enabled';

    /** @private Map<string, number> 文件路径 → 上次滚动位置 */
    this._scrollPositions = new Map();
    /** @private localStorage 持久化键名 */
    this._SCROLL_KEY = 'hippo-scroll-positions';
    /** @private 滚动节流定时器句柄 */
    this._scrollThrottleTimer = null;
    /** @private 绑定的 scroll 回调引用，用于清理 */
    this._boundScrollHandler = null;
    /** @private 绑定的滚动条轨道点击回调引用，用于清理 */
    this._boundScrollbarClickHandler = null;
    /** @private 绑定的 beforeunload 回调引用，用于清理 */
    this._boundBeforeUnload = null;
    /** @private 二进制预览类型：'image' | 'pdf' | 'spreadsheet' | 'docx' | 'browser' | 'diff' | null */
    this._binaryViewType = null;
    /** @private diff 视图实例（diff 标签页模式） */
    this._diffView = null;
    /** @private diff 标签页重载防抖定时器（合并连续 file:changes-updated 事件） */
    this._reloadDiffDebounceTimer = null;
    /** @private 普通文件 reload 防抖定时器（合并 AI 连续写文件触发的多次重建） */
    this._reloadTimer = null;

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
    // 绑定自动换行按钮
    this._registerWrapBtn();
    // 绑定在外部程序中打开按钮（Office 文件）
    this._registerOpenInOfficeBtn();

    // ── 页面关闭/刷新前保存当前滚动位置 ──
    this._boundBeforeUnload = () => {
      this._captureScrollPosition();
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
      const mode = await this._mdPreview.toggle(this._view.state.doc.toString(), this._currentPath);
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
      this._updateWrapBtn();
    });
  }

  /** @private 绑定 HTML 预览按钮 — 在内部浏览器中预览渲染效果 */
  _registerHtmlPreviewBtn() {
    const btn = document.getElementById('previewHtmlToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!this._currentPath) return;
      const displayName = this._currentPath.split(/[/\\]/).pop() || '预览';
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
      // diff 标签页模式：重载 diff 视图，不走文件读取
      if (this._binaryViewType === 'diff') {
        this.reloadDiffView();
        return;
      }
      this.show(this._currentPath);
    });
  }

  /** @private 绑定自动换行按钮点击事件 */
  _registerWrapBtn() {
    const btn = document.getElementById('previewWrapBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!this._view || !this._currentPath) return;
      this._wrapEnabled = !this._wrapEnabled;
      // 通过 Compartment 动态切换换行，不重建编辑器、不丢光标/滚动位置
      this._view.dispatch({
        effects: this._wrapCompartment.reconfigure(
          this._wrapEnabled ? EditorView.lineWrapping : []
        ),
      });
      // 自动换行改变行高/文档高度：滚动条色带需按新比例重绘
      // （wrap 只改 scrollHeight 不触发 ResizeObserver，需主动刷新）
      this._renderDiffOverview();
      this._setWrapPreference(this._currentPath, this._wrapEnabled);
      this._updateWrapBtn();
    });
  }

  /** @private 读取文件是否启用自动换行（持久化优先，默认 md 换行、其余不换行） */
  _getWrapEnabled(filePath) {
    if (!filePath) return false;
    try {
      const raw = localStorage.getItem(this._WRAP_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (typeof obj[filePath] === 'boolean') return obj[filePath];
      }
    } catch (e) {
    }
    return this._isMarkdown(filePath);
  }

  /** @private 持久化文件换行偏好到 localStorage */
  _setWrapPreference(filePath, enabled) {
    if (!filePath) return;
    try {
      const raw = localStorage.getItem(this._WRAP_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj[filePath] = enabled;
      localStorage.setItem(this._WRAP_KEY, JSON.stringify(obj));
    } catch (e) {
    }
  }

  /** @private 同步换行按钮显示与激活态 */
  _updateWrapBtn() {
    const btn = document.getElementById('previewWrapBtn');
    if (!btn) return;
    // 仅文本/代码编辑器显示；二进制文件、md 预览模式、无文件时隐藏
    if (!this._view || !this._currentPath || this._mdPreview.isPreview) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    btn.classList.toggle('active', !!this._wrapEnabled);
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
    // diff: 前缀 → 委托 showDiff（防御性，防止误调用）
    if (filePath && filePath.startsWith('diff:')) {
      this.showDiff(filePath.slice(5));
      return;
    }

    // 渲染其他内容前，先摘除保活当前内嵌浏览器（若有），防止 iframe 被销毁导致页面状态丢失
    this._browserPreview.detach();

    // 上游（FileTabs onBeforeSwitch）已处理脏检查弹窗，此处只清理旧 dirty 状态
    if (this._dirty) {
      this._dirty = false;
      this._onDirtyChange(this._currentPath, false);
    }

    // 切换文件前保存当前文件的滚动位置（按行号+行内偏移）
    this._captureScrollPosition();

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
      this._updateWrapBtn();
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
      this._updateWrapBtn();
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
      this._updateWrapBtn();
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
      this._updateWrapBtn();
      this._updateOpenInOfficeBtn();
      this._updateStatusbar(filePath);
      return;
    }

    // ── DOCX 文件 → 委托 BinaryPreview（docx-preview 优先，失败降级 Silurus）──
    if (isDocxFile(filePath)) {
      this._destroyEditor();
      this._binaryViewType = 'docx';
      this._binaryPreview.showDocxDom(filePath);
      this._updateSearchBtn();
      this._updateMdToggleBtn();
      this._updateRefreshBtn();
      this._updateWrapBtn();
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
      this._updateWrapBtn();
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
      this._updateWrapBtn();
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
    this._updateWrapBtn();
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

  /**
   * 重新加载当前预览文件。
   * 防抖 150ms 合并连续触发（AI 一次回复可能连续写同一文件多次 → 多次 file:preview-reload），
   * 避免编辑器反复重建导致闪烁 / 滚动位置跳动。与 reloadDiffView 的防抖口径一致。
   */
  reload() {
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(async () => {
      this._reloadTimer = null;
      if (!this._currentPath) return;
      const path = this._currentPath;
      this._dirty = false;
      await this.show(path);
      // show 完成后立即用已有的 _originalContent（如有）做一次快速 diff 刷新，
      // 这样用户在等待 API 返回最新原始内容期间也能看到 diff 标记。
      // 之后 _fetchOriginalContent 的异步回调会校正为最新的原始内容基准。
      this._refreshDiffDecorations();
    }, 150);
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
      this._diffLineInfo = null; // 同步清空行信息，gutter / 色带标记不再生效
      this._removeDiffOverview(); // 同步移除滚动条色带（保存 = 接受内容，标记使命完成）
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
    // 先摘除保活当前内嵌浏览器（若有），再销毁编辑器清空容器，
    // 否则 _destroyEditor 的 innerHTML='' 会先销毁 iframe（从浏览器 A 直接切到 B 时 A 会丢失状态）
    this._browserPreview.detach();
    this._destroyEditor();
    this._binaryViewType = 'browser';
    this._currentPath = 'url:' + url;
    this._container.dataset.currentPath = this._currentPath;
    this._dirty = false;
    this._browserPreview.show(url);
    this._updateSearchBtn();
    this._updateMdToggleBtn();
    this._updateRefreshBtn();
    this._updateWrapBtn();
    this._updateStatusbar(this._currentPath);
  }

  /**
   * 释放指定 URL 的内嵌浏览器缓存（关闭 web 标签时调用，销毁 iframe 释放资源）
   * @param {string} url - 与打开时一致的 URL（不含 url: 前缀）
   */
  disposeBrowser(url) {
    this._browserPreview.dispose(url);
  }

  /**
   * 打开文件变更对比视图（diff 标签页模式，委托 FileDiffView）
   * @param {string} filePath - 目标文件真实路径（不含 diff: 前缀）
   * @param {string} [toolCallId] - 定位到该次变更；缺省默认展示"整体变更"
   */
  showDiff(filePath, toolCallId) {
    // 清理旧的重载防抖定时器（切换 diff 标签/重建视图时不得残留，防止回调命中已销毁实例）
    this._clearReloadDiffDebounce();
    // 渲染 diff 前，先摘除保活当前内嵌浏览器（若有），防止 iframe 被销毁导致页面状态丢失
    this._browserPreview.detach();
    // 先销毁旧的 diff 视图实例（_destroyEditor 会清空容器 DOM）
    if (this._diffView) {
      this._diffView.destroy();
      this._diffView = null;
    }
    this._destroyEditor();
    this._binaryViewType = 'diff';
    this._currentPath = 'diff:' + filePath;
    this._container.dataset.currentPath = this._currentPath;
    this._dirty = false;

    this._diffView = new FileDiffView(this._container, {
      onNetStats: () => this._updateStatusbar(this._currentPath),
      // 点击"在编辑器中打开"→ 跳转到该文件的编辑 tab（桌面端），并定位到首个变更行
      onOpenInEditor: (fp, line) => {
        if (window.HippoWorkspace && typeof window.HippoWorkspace.navigateToFile === 'function') {
          window.HippoWorkspace.navigateToFile(fp, line || undefined);
        }
      },
    });
    this._diffView.load(filePath, toolCallId);

    this._updateSearchBtn();
    this._updateMdToggleBtn();
    this._updateRefreshBtn();
    this._updateWrapBtn();
    this._updateOpenInOfficeBtn();
    this._updateStatusbar(this._currentPath);
  }

  /**
   * 若当前处于 diff 标签页模式，重新加载（回滚/外部变更后调用）。
   * 防抖合并连续触发（一次 edit 可能触发多次 file:changes-updated），
   * 避免重复请求/渲染导致 diff 预览区闪烁。
   */
  reloadDiffView() {
    if (this._binaryViewType !== 'diff' || !this._diffView) return;
    if (this._reloadDiffDebounceTimer) clearTimeout(this._reloadDiffDebounceTimer);
    this._reloadDiffDebounceTimer = setTimeout(() => {
      this._reloadDiffDebounceTimer = null;
      if (this._binaryViewType === 'diff' && this._diffView) {
        this._diffView.reload();
      }
    }, 150);
  }

  /** @private 清理 diff 标签页重载防抖定时器（销毁视图/切换标签时，防止残留回调触发已销毁的视图） */
  _clearReloadDiffDebounce() {
    if (this._reloadDiffDebounceTimer) {
      clearTimeout(this._reloadDiffDebounceTimer);
      this._reloadDiffDebounceTimer = null;
    }
  }

  clear() {
    // 清理 diff 标签页重载防抖定时器
    this._clearReloadDiffDebounce();
    // 清空容器前，先摘除保活当前内嵌浏览器（若有），防止 iframe 被销毁（收起预览后切回标签不丢状态）
    this._browserPreview.detach();
    if (this._diffView) {
      this._diffView.destroy();
      this._diffView = null;
    }
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
    this._updateWrapBtn();
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
      // 携带当前会话 ID：后端按会话过滤，只显示"这一轮会话"里 AI 对该文件的改动。
      // 刷新/重启后恢复同一会话 → 基线仍可查到，标记重新出现（保存仍清空基线）。
      const sid = (appState && appState.currentSessionId) || '';
      const resp = await fetch(`/api/diff/original?path=${encodeURIComponent(filePath)}&sessionId=${encodeURIComponent(sid)}`);
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
   * 编辑后防抖重算 diff 标记，保持标记与当前文档同步。
   * 仅当存在 AI 基线（_originalContent）时生效——保存后基线清空，不再重算，
   * 符合"保存 = 接受内容，标记使命完成"的语义。
   * 防抖合并连续输入（如快速打字/粘贴），避免每次击键触发全量 Myers 重算。
   */
  _scheduleDiffRefresh() {
    if (!this._view || this._originalContent == null) return;
    if (this._diffRefreshTimer) clearTimeout(this._diffRefreshTimer);
    this._diffRefreshTimer = setTimeout(() => {
      this._diffRefreshTimer = null;
      this._refreshDiffDecorations();
    }, 300);
  }

  /**
   * @private 使用当前的 _originalContent 重新计算并注入 diff decorations
   * 同时缓存行变更信息（_diffLineInfo）供 gutter 竖条 / 滚动条色带使用。
   * 可安全地多次调用，仅当 _view 和 _originalContent 都存在时生效
   */
  _refreshDiffDecorations() {
    if (!this._view || this._originalContent == null) return;
    const { decoSet, lineInfo } = computeDiffInfo(this._view.state.doc, this._originalContent);
    this._diffLineInfo = lineInfo;
    // 同时注入：整行淡背景（decoSet）+ 行号旁 gutter 竖条（IDE 式，绿=新增/蓝=修改）
    this._view.dispatch({
      effects: this._diffCompartment.reconfigure([
        EditorView.decorations.of(decoSet),
        ...buildDiffGutter(lineInfo),
      ]),
    });
    // 滚动条整文色带与 gutter 同源（同一份 lineInfo），一并刷新
    this._renderDiffOverview();
  }

  // ==================== 滚动条整文色带（VS Code 式 overview） ====================

  /**
   * 渲染滚动条旁的全文件改动分布色带。
   * 数据复用 _diffLineInfo（与 gutter 同源），映射到 .cm-editor 右侧色带。
   * 色块位置用"文档绝对坐标 × 比例"映射（computeOverviewMarkers），与滚动无关——
   * 滚动时零重算；仅数据变化（_refreshDiffDecorations）或尺寸变化（ResizeObserver）时重绘。
   */
  _renderDiffOverview() {
    if (!this._view || !this._diffLineInfo || this._diffLineInfo.size === 0 || this._originalContent == null) {
      this._removeDiffOverview();
      return;
    }
    const scrollDOM = this._view.scrollDOM;
    const docHeight = scrollDOM.scrollHeight;
    const stripHeight = scrollDOM.clientHeight;
    if (!(docHeight > 0) || !(stripHeight > 0)) return;

    // 收集变更行的文档像素范围（lineBlockAt 精确反映行高，含自动换行后的多行块）
    // deleted 是删除锚点（删除的行不在当前文档）：压缩为固定短块，表达"这一带被删过"，
    //   与 added/modified 的"实有行"形态区分；空文档（全删）时映射到色带顶部
    const lineBlocks = [];
    const DELETED_BLOCK_HEIGHT = 2;
    for (const [lineNum, info] of this._diffLineInfo) {
      if (info.type === 'deleted') {
        const anchorLine = Math.min(lineNum, this._view.state.doc.lines);
        let top = 0;
        if (anchorLine >= 1) {
          const block = this._view.lineBlockAt(this._view.state.doc.line(anchorLine).from);
          if (block) top = block.top;
        }
        lineBlocks.push({ top, bottom: top + DELETED_BLOCK_HEIGHT, type: 'deleted' });
        continue;
      }
      const block = this._view.lineBlockAt(this._view.state.doc.line(lineNum).from);
      if (!block) continue;
      lineBlocks.push({ top: block.top, bottom: block.bottom, type: info.type });
    }
    if (lineBlocks.length === 0) {
      this._removeDiffOverview();
      return;
    }

    const markers = computeOverviewMarkers(lineBlocks, docHeight, stripHeight);

    // 惰性创建容器：挂到 .cm-editor（CM6 baseTheme 保证 position:relative）下，
    // 作为 scrollDOM 的兄弟节点，absolute 定位不随内容滚动
    if (!this._diffOverviewEl) {
      const el = document.createElement('div');
      el.className = 'cm-diff-overview';
      this._view.dom.appendChild(el);
      this._diffOverviewEl = el;
    }
    const host = this._diffOverviewEl;
    host.textContent = '';
    for (const m of markers) {
      const seg = document.createElement('div');
      seg.className = `cm-diff-overview-marker ${m.type}`;
      seg.style.top = m.top + 'px';
      seg.style.height = m.height + 'px';
      host.appendChild(seg);
    }
  }

  /** 移除滚动条色带容器 */
  _removeDiffOverview() {
    if (this._diffOverviewEl) {
      this._diffOverviewEl.remove();
      this._diffOverviewEl = null;
    }
  }

  /**
   * 启动色带尺寸监听：scrollDOM 尺寸变化（窗口 resize / 面板开合）时重算比例。
   * 自动换行切换只改变 scrollHeight 不改变 clientHeight，不触发 RO，
   * 由 _registerWrapBtn 主动调用 _renderDiffOverview() 覆盖。
   */
  _startDiffOverviewObserver() {
    this._stopDiffOverviewObserver();
    if (this._view && typeof ResizeObserver === 'function') {
      this._diffOverviewRO = new ResizeObserver(() => {
        this._renderDiffOverview();
      });
      this._diffOverviewRO.observe(this._view.scrollDOM);
    }
  }

  _stopDiffOverviewObserver() {
    if (this._diffOverviewRO) {
      this._diffOverviewRO.disconnect();
      this._diffOverviewRO = null;
    }
  }

  // ==================== 滚动位置持久化 ====================

  /**
   * @private 处理原生滚动条轨道点击：直接跳到点击位置。
   * 浏览器默认行为是"逐页滚动"（相当于 PageUp/PageDown），
   * 这里用坐标判断点击是否落在轨道上（而非滑块/内容区），
   * 再按"滑块中心对齐到点击位置"的比例映射换算目标 scrollTop，并 preventDefault 掉原生行为。
   * @param {MouseEvent} e
   */
  _handleScrollbarClick(e) {
    if (e.button !== 0) return; // 只处理左键
    const scrollDOM = this._view && this._view.scrollDOM;
    if (!scrollDOM) return;

    const maxV = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const maxH = scrollDOM.scrollWidth - scrollDOM.clientWidth;
    // 内容不满一屏（无可滚动量）时不存在滚动条，直接放行
    if (maxV <= 0 && maxH <= 0) return;

    const rect = scrollDOM.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 滚动条区域 = 内容区（client 区）之外、元素边框之内
    const inVTrack = x >= scrollDOM.clientWidth && x < rect.width && y < scrollDOM.clientHeight;
    const inHTrack = y >= scrollDOM.clientHeight && y < rect.height && x < scrollDOM.clientWidth;
    if (!inVTrack && !inHTrack) return; // 点击内容区 / 滚动条 corner，不干预

    // 点中滑块：交给浏览器原生拖动，不拦截
    // 滑块几何近似：thumbH ≈ client² / scroll，thumbTop 按可滚动范围等比映射
    if (inVTrack && maxV > 0) {
      const trackH = scrollDOM.clientHeight;
      const thumbH = Math.max(20, trackH * trackH / scrollDOM.scrollHeight);
      const thumbTop = (scrollDOM.scrollTop / maxV) * (trackH - thumbH);
      if (y >= thumbTop && y <= thumbTop + thumbH) return;
      // 点击轨道：滑块中心对齐到点击位置 → scrollTop 按同比例映射
      const ratio = (y - thumbH / 2) / (trackH - thumbH);
      scrollDOM.scrollTop = Math.max(0, Math.min(maxV, ratio * maxV));
      e.preventDefault();
    } else if (inHTrack && maxH > 0) {
      const trackW = scrollDOM.clientWidth;
      const thumbW = Math.max(20, trackW * trackW / scrollDOM.scrollWidth);
      const thumbLeft = (scrollDOM.scrollLeft / maxH) * (trackW - thumbW);
      if (x >= thumbLeft && x <= thumbLeft + thumbW) return;
      const ratio = (x - thumbW / 2) / (trackW - thumbW);
      scrollDOM.scrollLeft = Math.max(0, Math.min(maxH, ratio * maxH));
      e.preventDefault();
    }
  }

  /**
   * @private 捕获当前滚动位置，存为 { line, offset }：
   *   line   = 视口顶部所在文档行号（内容变化后仍可定位）
   *   offset = 该行内已滚过的像素偏移（行高未变时精确还原）
   * 相比直接存 scrollTop 像素，AI 修改文件内容导致行高变化后仍能大致回到原位置。
   */
  _captureScrollPosition() {
    if (!this._view || !this._currentPath) return;
    const scrollDOM = this._view.scrollDOM;
    const top = scrollDOM.scrollTop;
    let pos = { line: 1, offset: 0 };
    try {
      if (top > 0) {
        const block = this._view.lineBlockAtHeight(top, 0);
        if (block && block.from != null) {
          const lineNo = this._view.state.doc.lineAt(block.from).number;
          pos = { line: lineNo, offset: Math.max(0, top - block.top) };
        }
      }
    } catch (e) {
      pos = { line: 1, offset: 0 };
    }
    this._scrollPositions.set(this._currentPath, pos);
    this._persistScrollPositions();
  }

  /** @private 将滚动位置持久化到 localStorage */
  _persistScrollPositions() {
    try {
      const obj = {};
      this._scrollPositions.forEach((val, key) => { obj[key] = val; });
      localStorage.setItem(this._SCROLL_KEY, JSON.stringify(obj));
    } catch (e) {
    }
  }

  /** @private 从 localStorage 加载滚动位置到内存（兼容旧版纯数字像素 / 新版 {line, offset}） */
  _loadScrollPositions() {
    try {
      const raw = localStorage.getItem(this._SCROLL_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'number' && val > 0) {
          this._scrollPositions.set(key, val);
        } else if (val && typeof val === 'object' && typeof val.line === 'number' && val.line > 0) {
          this._scrollPositions.set(key, { line: val.line, offset: val.offset || 0 });
        }
      }
    } catch (e) {
    }
  }

  /**
   * 清除指定文件的滚动位置记录（关闭标签时调用）
   * 从内存 Map 和 localStorage 中同时移除，确保重新打开文件时从顶部开始
   * @param {string} filePath
   */
  clearScrollPosition(filePath) {
    if (!filePath) return;
    this._scrollPositions.delete(filePath);
    // 同步更新 localStorage
    try {
      const raw = localStorage.getItem(this._SCROLL_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (filePath in obj) {
        delete obj[filePath];
        localStorage.setItem(this._SCROLL_KEY, JSON.stringify(obj));
      }
    } catch (e) {
    }
  }

  // ==================== CodeMirror ====================

  _initEditor(content, filePath) {
    this._destroyEditor();

    const lang = this._getLanguageExtension(filePath);
    const isDark = this._isDarkTheme();
    // 自动换行：默认 md 软换行、代码文件不换行；用户可通过工具栏按钮切换，
    // 选择记录到 localStorage（按文件路径），下次打开同一文件自动恢复。
    this._wrapEnabled = this._getWrapEnabled(filePath);
    const wrapExt = this._wrapEnabled ? EditorView.lineWrapping : [];

    const saveKeyBinding = keymap.of([{
      key: 'Mod-s',
      run: () => { this.save(); return true; }
    }]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        lang,
        this._wrapCompartment.of(wrapExt),
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
          // 编辑后防抖重算 diff 标记，保持标记与当前文档同步
          // （如：新改的行变绿、把 AI 改的行改回原样后绿色消失）
          this._scheduleDiffRefresh();
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
        const saved = this._scrollPositions.get(filePath);
        // 兼容两种存储格式：新版 {line, offset}（按行号定位，内容变化后仍可还原）；
        // 旧版纯数字（scrollTop 像素，直接使用）
        const isObj = saved && typeof saved === 'object' && typeof saved.line === 'number';
        // 等待 CM6 完成布局后再设置，最多重试 30 帧（≈500ms），大文件渲染慢也不至于丢失
        const tryRestoreScroll = (attempt = 0) => {
          if (!this._view) return;
          if (attempt > 30) return;
          // 确保 scrollDOM 已经有可滚动的内容，否则 CM6 后续布局会覆盖 scrollTop
          if (this._view.scrollDOM.scrollHeight > this._view.scrollDOM.clientHeight) {
            let target = 0;
            if (isObj) {
              try {
                const lineNo = Math.min(saved.line, this._view.state.doc.lines);
                const docLine = this._view.state.doc.line(lineNo);
                target = this._view.lineBlockAt(docLine.from).top + (saved.offset || 0);
              } catch (e) {
                target = 0;
              }
            } else {
              target = saved;
            }
            this._view.scrollDOM.scrollTop = target;
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
        this._captureScrollPosition();
      }, 1500);
    };
    this._view.scrollDOM.addEventListener('scroll', this._boundScrollHandler, { passive: true });

    // 原生滚动条轨道点击 → 直接跳到点击位置（替代浏览器默认的"逐页滚动"）
    this._boundScrollbarClickHandler = (e) => this._handleScrollbarClick(e);
    this._view.scrollDOM.addEventListener('mousedown', this._boundScrollbarClickHandler);

    this._startThemeObserver();
    // 滚动条整文色带：监听 scrollDOM 尺寸变化（resize/面板开合）重算比例
    this._startDiffOverviewObserver();
  }

  _destroyEditor() {
    this._mdPreview.destroy();
    this._stopThemeObserver();
    this._container._cmPreviewView = null;

    // 清理 reload 防抖定时器（切换文件/销毁时，防止残留回调触发已销毁视图的 show）
    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = null;
    }

    // 清理滚动节流定时器和事件监听
    if (this._scrollThrottleTimer) {
      clearTimeout(this._scrollThrottleTimer);
      this._scrollThrottleTimer = null;
    }
    // 清理 diff 标记重算防抖定时器（切文件/销毁编辑器时不得残留）
    if (this._diffRefreshTimer) {
      clearTimeout(this._diffRefreshTimer);
      this._diffRefreshTimer = null;
    }
    // 清理 diff 行信息（gutter / 色带标记的数据源）
    this._diffLineInfo = null;
    // 清理滚动条整文色带（容器 DOM + ResizeObserver）
    this._stopDiffOverviewObserver();
    this._removeDiffOverview();
    if (this._view && this._boundScrollHandler) {
      this._view.scrollDOM.removeEventListener('scroll', this._boundScrollHandler);
      this._boundScrollHandler = null;
    }
    if (this._view && this._boundScrollbarClickHandler) {
      this._view.scrollDOM.removeEventListener('mousedown', this._boundScrollbarClickHandler);
      this._boundScrollbarClickHandler = null;
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
      json, jsonl: json, jsonc: json, geojson: json,
      md: markdown, markdown, mdx: markdown,
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
    this._updateWrapBtn();
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
    } else if (filePath.startsWith('diff:')) {
      parts.push('Diff');
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
