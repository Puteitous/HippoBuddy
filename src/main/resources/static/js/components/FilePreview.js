/**
 * FilePreview — 文件预览/编辑组件
 *
 * 使用 CodeMirror 6 实现语法高亮 + 编辑功能。
 * 文件打开即可以编辑，Ctrl+S 保存。
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - js/vendor/codemirror.js（esbuild 打包的 CM6 bundle）
 */

import { EditorView, keymap, EditorState, Compartment, basicSetup, oneDark,
  javascript, python, java, html, css, json, markdown, xml, yaml, sql,
  rust, php, go, sass } from '../vendor/codemirror.js'
import { SearchPanel } from './search-panel.js'
import { renderMarkdown } from '../markdown-renderer.js'
import { createDiffExtension } from './FilePreviewDiff.js'

/**
 * 支持文本编辑 + 图片/PDF 预览的扩展文件预览类。
 *
 * 文件类型自动检测：
 *   - 文本/代码文件 → CodeMirror 6 编辑器（可编辑）
 *   - 图片文件 → &lt;img&gt; 标签渲染（只读）
 *   - PDF 文件 → &lt;iframe&gt; 嵌入浏览器原生 PDF 查看器（只读）
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
    /** @private Compartment 用于动态切换 diff 扩展 */
    this._diffCompartment = new Compartment();
    /** @private AI 修改前的文件原始内容（用于 diff 对比） */
    this._originalContent = null;
    /** @private 二进制预览类型：'image' | 'pdf' | null */
    this._binaryViewType = null;

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

    this._currentPath = filePath;
    this._container.dataset.currentPath = filePath;
    this._dirty = false;

    // ── 图片 / PDF 等二进制文件 → 直接通过 HTTP 渲染预览 ──
    if (this._isImage(filePath) || this._isPdf(filePath)) {
      this._destroyEditor();
      this._showBinaryPreview(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── 表格文件（XLSX/XLS/CSV）→ 通过 SheetJS 渲染为 HTML 表格 ──
    if (this._isSpreadsheet(filePath)) {
      this._destroyEditor();
      this._showSpreadsheet(filePath);
      this._updateSaveBtn();
      this._updateMdToggleBtn();
      return;
    }

    // ── DOCX 文件 → 通过 mammoth.js 渲染为 HTML ──
    if (this._isDocx(filePath)) {
      this._destroyEditor();
      this._showDocx(filePath);
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

  clear() {
    this._destroyEditor();
    this._binaryViewType = null;
    this._currentPath = null;
    this._content = '';
    this._dirty = false;
    this._originalContent = null;
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
        this._themeCompartment.of(isDark ? oneDark : []),
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

    this._startThemeObserver();
  }

  _destroyEditor() {
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

  /** 监听 <html> data-theme 变化，动态切换 CM6 主题 */
  _startThemeObserver() {
    this._stopThemeObserver();
    this._themeObserver = new MutationObserver(() => {
      if (!this._view) return;
      const isDark = this._isDarkTheme();
      this._view.dispatch({
        effects: this._themeCompartment.reconfigure(isDark ? oneDark : []),
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
        this._mdPreviewEl.innerHTML = html;
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

  // ==================== 二进制文件预览（图片 / PDF）====================

  /** 判断是否为图片文件 */
  _isImage(filePath) {
    if (!filePath) return false;
    const ext = filePath.split('.').pop().toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
  }

  /** 判断是否为 PDF 文件 */
  _isPdf(filePath) {
    return filePath && filePath.toLowerCase().endsWith('.pdf');
  }

  /** 渲染二进制文件预览（图片用 &lt;img&gt;，PDF 用 &lt;iframe&gt;） */
  _showBinaryPreview(filePath) {
    this._binaryViewType = this._isImage(filePath) ? 'image' : 'pdf';
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;
    const fileName = filePath.split('/').pop() || filePath;

    const isDark = this._isDarkTheme();
    const bgColor = isDark ? '#1e1e1e' : '#f5f5f5';

    if (this._binaryViewType === 'image') {
      this._container.innerHTML = `
        <div class="file-binary-preview" style="
          display:flex; align-items:center; justify-content:center;
          flex:1; min-height:0; height:100%; overflow:auto;
          background:${bgColor}; padding:20px;">
          <img src="${url}" alt="${this._escapeHtml(fileName)}"
               style="max-width:100%; max-height:100%; object-fit:contain;"
               onerror="this.parentElement.innerHTML='<div class=\\'file-preview-placeholder\\' style=\\'color:var(--error-text);\\'><svg viewBox=\\'0 0 24 24\\' width=\\'32\\' height=\\'32\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/><line x1=\\'12\\' y1=\\'8\\' x2=\\'12\\' y2=\\'12\\'/><line x1=\\'12\\' y1=\\'16\\' x2=\\'12.01\\' y2=\\'16\\'/></svg><p>图片加载失败</p></div>'" />
        </div>`;
    } else {
      this._container.innerHTML = `
        <div class="file-binary-preview pdf" style="
          display:flex; flex-direction:column; flex:1; min-height:0; height:100%;
          background:${bgColor};">
          <iframe src="${url}" title="${this._escapeHtml(fileName)}"
                  style="flex:1; border:none; width:100%; height:100%;"></iframe>
        </div>`;
    }
  }

  // ==================== 表格文件预览（XLSX / XLS / CSV）====================

  /** 判断是否为表格文件 */
  _isSpreadsheet(filePath) {
    if (!filePath) return false;
    const ext = filePath.split('.').pop().toLowerCase();
    return ['xlsx', 'xls', 'csv'].includes(ext);
  }

  /** 通过 SheetJS 将表格文件渲染为 HTML 表格 */
  async _showSpreadsheet(filePath) {
    this._binaryViewType = 'spreadsheet';
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuffer = await resp.arrayBuffer();

      // SheetJS 解析
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

      // 构建 HTML
      const isDark = this._isDarkTheme();
      const tableBg = isDark ? '#1e1e1e' : '#ffffff';
      const headBg = isDark ? '#2d2d2d' : '#f5f5f5';
      const borderColor = isDark ? '#444' : '#e0e0e0';
      const textColor = isDark ? '#d4d4d4' : '#333';
      const altRowBg = isDark ? '#252526' : '#fafafa';

      let html = `<div class="file-spreadsheet-preview" style="
        display:flex; flex-direction:column; flex:1; min-height:0; height:100%;
        background:${tableBg};">

        <!-- 顶部信息栏 -->
        <div class="spreadsheet-info" style="
          padding:8px 16px; font-size:13px; color:${textColor};
          border-bottom:1px solid ${borderColor};
          background:${headBg}; display:flex; align-items:center; gap:12px;
          flex-shrink:0;">
          <span style="font-weight:600;">${this._escapeHtml(filePath.split('/').pop() || '')}</span>
          <span style="color:${isDark ? '#999' : '#888'}; font-size:12px;">
            ${workbook.SheetNames.length} 个 sheet · ${workbook.SheetNames[0]}（激活）
          </span>
        </div>`;

      // Sheet 标签栏
      if (workbook.SheetNames.length > 1) {
        html += `<div class="spreadsheet-sheet-tabs" style="
          display:flex; overflow-x:auto; flex-shrink:0;
          border-bottom:1px solid ${borderColor};
          background:${headBg}; padding:0 4px;">
          ${workbook.SheetNames.map((name, i) => `
            <div class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet-index="${i}"
                 style="
              padding:4px 14px; font-size:12px; cursor:pointer;
              color:${i === 0 ? textColor : isDark ? '#999' : '#888'};
              border-bottom:2px solid ${i === 0 ? '#007acc' : 'transparent'};
              white-space:nowrap; user-select:none;
              transition:color .15s, border-color .15s;">
              ${this._escapeHtml(name)}
            </div>`).join('')}
        </div>`;
      }

      // 表格容器
      html += `<div class="spreadsheet-table-wrap" style="
        flex:1; overflow:auto; min-height:0; padding:0;">`;

      // 渲染第一个 sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (jsonData.length === 0) {
        html += `<div style="padding:40px; text-align:center; color:${isDark ? '#888' : '#999'}; font-size:14px;">此 sheet 为空</div>`;
      } else {
        html += '<table style="border-collapse:collapse; width:auto; font-size:13px;">';
        jsonData.forEach((row, rowIdx) => {
          html += '<tr>';
          row.forEach((cell) => {
            const tag = rowIdx === 0 ? 'th' : 'td';
            const val = cell != null ? String(cell) : '';
            html += `<${tag} style="
              border:1px solid ${borderColor}; padding:4px 10px;
              text-align:${rowIdx === 0 || !isNaN(val) && val !== '' ? 'center' : 'left'};
              background:${rowIdx === 0 ? headBg : (rowIdx % 2 === 0 ? altRowBg : 'transparent')};
              color:${textColor};
              white-space:nowrap; font-weight:${rowIdx === 0 ? '600' : '400'};
              max-width:400px; overflow:hidden; text-overflow:ellipsis;">
              ${this._escapeHtml(val)}
            </${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
      }

      html += '</div></div>';
      this._container.innerHTML = html;

      // ── 绑定 sheet 切换事件 ──
      const tabs = this._container.querySelectorAll('.sheet-tab');
      const wrap = this._container.querySelector('.spreadsheet-table-wrap');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const idx = parseInt(tab.dataset.sheetIndex, 10);
          // 更新激活样式
          tabs.forEach(t => {
            t.style.color = isDark ? '#999' : '#888';
            t.style.borderBottomColor = 'transparent';
          });
          tab.style.color = textColor;
          tab.style.borderBottomColor = '#007acc';

          // 重新渲染选中 sheet
          const name = workbook.SheetNames[idx];
          const s = workbook.Sheets[name];
          const data = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
          let tableHtml = '';
          if (data.length === 0) {
            tableHtml = `<div style="padding:40px; text-align:center; color:${isDark ? '#888' : '#999'}; font-size:14px;">此 sheet 为空</div>`;
          } else {
            tableHtml = '<table style="border-collapse:collapse; width:auto; font-size:13px;">';
            data.forEach((row, rowIdx) => {
              tableHtml += '<tr>';
              row.forEach((cell) => {
                const tag = rowIdx === 0 ? 'th' : 'td';
                const val = cell != null ? String(cell) : '';
                tableHtml += `<${tag} style="
                  border:1px solid ${borderColor}; padding:4px 10px;
                  text-align:${rowIdx === 0 || (!isNaN(val) && val !== '') ? 'center' : 'left'};
                  background:${rowIdx === 0 ? headBg : (rowIdx % 2 === 0 ? altRowBg : 'transparent')};
                  color:${textColor};
                  white-space:nowrap; font-weight:${rowIdx === 0 ? '600' : '400'};
                  max-width:400px; overflow:hidden; text-overflow:ellipsis;">
                  ${this._escapeHtml(val)}
                </${tag}>`;
              });
              tableHtml += '</tr>';
            });
            tableHtml += '</table>';
          }
          wrap.innerHTML = tableHtml;

          // 更新顶部信息
          const infoSpan = this._container.querySelector('.spreadsheet-info span:last-child');
          if (infoSpan) {
            infoSpan.textContent = `${workbook.SheetNames.length} 个 sheet · ${name}（激活）`;
          }
        });
      });

    } catch (err) {
      console.error('FilePreview: spreadsheet parse failed', filePath, err);
      const isDark = this._isDarkTheme();
      this._container.innerHTML = `
        <div class="file-preview-placeholder" style="color:var(--error-text);">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>表格解析失败: ${this._escapeHtml(err.message)}</p>
        </div>`;
      this._onError(err);
    }
  }

  // ==================== DOCX 文件预览 ====================

  /** 判断是否为 DOCX 文件 */
  _isDocx(filePath) {
    return filePath && filePath.toLowerCase().endsWith('.docx');
  }

  /** 通过 mammoth.js 将 DOCX 渲染为 HTML */
  async _showDocx(filePath) {
    this._binaryViewType = 'docx';
    const encodedPath = encodeURIComponent(filePath);
    const url = `/api/file/raw?path=${encodedPath}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuffer = await resp.arrayBuffer();

      // mammoth.js 转换（带样式映射，处理 Word 常见样式）
      const styleMap = [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
      ];
      const result = await mammoth.convertToHtml({
        arrayBuffer: arrayBuffer,
        styleMap: styleMap,
      });

      const isDark = this._isDarkTheme();
      const bgColor = isDark ? '#1e1e1e' : '#ffffff';
      const textColor = isDark ? '#d4d4d4' : '#333';

      // 样式化后的文档容器
      this._container.innerHTML = `
        <div class="file-docx-preview" style="
          display:flex; flex-direction:column; flex:1; min-height:0; height:100%;">

          <!-- 顶部信息栏 -->
          <div class="docx-info" style="
            padding:8px 16px; font-size:13px; color:${textColor};
            border-bottom:1px solid ${isDark ? '#444' : '#e0e0e0'};
            background:${isDark ? '#2d2d2d' : '#f5f5f5'};
            display:flex; align-items:center; gap:12px; flex-shrink:0;">
            <span style="font-weight:600;">${this._escapeHtml(filePath.split('/').pop() || '')}</span>
            ${result.messages && result.messages.length > 0
              ? `<span title="${this._escapeHtml(result.messages.map(m => m.message).join('\n'))}"
                     style="color:${isDark ? '#d4a017' : '#b8860b'}; font-size:12px; cursor:help;">
                   ⚠ ${result.messages.length} 条样式警告
                 </span>`
              : ''}
          </div>

          <!-- 文档内容区 -->
          <div class="docx-content" style="
            flex:1; overflow:auto; min-height:0; padding:30px 40px;
            background:${bgColor}; color:${textColor};
            font-family:'Georgia','Times New Roman',serif; font-size:15px; line-height:1.7;">
            ${result.value}
          </div>
        </div>`;

      // 如果转换有警告，将它们渲染到控制台
      if (result.messages && result.messages.length > 0) {
        console.info('mammoth.js 转换警告:', result.messages);
      }

    } catch (err) {
      console.error('FilePreview: docx parse failed', filePath, err);
      this._container.innerHTML = `
        <div class="file-preview-placeholder" style="color:var(--error-text);">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>文档解析失败: ${this._escapeHtml(err.message)}</p>
        </div>`;
      this._onError(err);
    }
  }

  // ==================== 工具方法 ====================

  _showError(message) {
    this._destroyEditor();
    this._container.innerHTML = `
      <div class="file-preview-placeholder" style="color:var(--error-text);">
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
