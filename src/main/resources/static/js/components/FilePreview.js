/**
 * FilePreview — 文件预览/编辑组件
 *
 * 职责：
 *   1. 调用 HippoDesktop.readFile(path) 获取文件内容
 *   2. 渲染语法高亮预览（只读模式）
 *   3. 编辑模式：显示 textarea，Ctrl+S 保存
 *   4. 通知外部 dirty 状态变化
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - 全局 hljs（highlight.js）
 */

export class FilePreview {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 预览内容容器 (#filePreviewContent)
   * @param {Function} options.onError - (err: Error) => void
   * @param {Function} options.onDirtyChange - (filePath: string|null, dirty: boolean) => void
   */
  constructor({ container, onError, onDirtyChange }) {
    this._container = container;
    this._onError = onError || (() => {});
    this._onDirtyChange = onDirtyChange || (() => {});
    this._currentPath = null;
    this._content = '';
    this._editing = false;
    this._dirty = false;
  }

  /** @returns {string|null} */
  get currentPath() {
    return this._currentPath;
  }

  /** @returns {boolean} */
  get isEditing() {
    return this._editing;
  }

  /** @returns {boolean} */
  get isDirty() {
    return this._dirty;
  }

  /** 加载并显示一个文件（只读模式） */
  async show(filePath) {
    // 如果当前有未保存修改，阻止切换
    if (this._editing && this._dirty) {
      if (!confirm('当前文件有未保存的修改，确定要切换吗？')) return;
    }

    this._currentPath = filePath;
    this._editing = false;
    this._dirty = false;

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
    this._renderReadonly(filePath, content);
  }

  /** 重新加载当前文件 */
  async reload() {
    if (this._currentPath) {
      this._editing = false;
      this._dirty = false;
      await this.show(this._currentPath);
    }
  }

  /** 切换编辑模式 */
  toggleEdit() {
    if (!this._currentPath) return;
    if (this._editing) {
      this._exitEdit();
    } else {
      this._enterEdit();
    }
  }

  /** 保存当前编辑的内容 */
  async save() {
    if (!this._currentPath || !this._editing || !this._dirty) return;

    const textarea = this._container.querySelector('.file-preview-textarea');
    if (!textarea) return;

    const content = textarea.value;
    try {
      await window.HippoDesktop.writeFile(this._currentPath, content);
      this._content = content;
      this._dirty = false;
      this._onDirtyChange(this._currentPath, false);
      this._exitEdit();
      this._renderReadonly(this._currentPath, content);
    } catch (err) {
      this._showError('保存失败: ' + err.message);
    }
  }

  /** 清除预览 */
  clear() {
    this._currentPath = null;
    this._content = '';
    this._editing = false;
    this._dirty = false;
    this._container.innerHTML = '';
    this._updateEditBtn();
  }

  // ==================== 只读模式 ====================

  _renderReadonly(filePath, content) {
    const lang = this._detectLanguage(filePath, content);

    let highlighted;
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      } else {
        highlighted = hljs.highlightAuto(content).value;
      }
    } catch {
      highlighted = this._escapeHtml(content);
    }

    const lineCount = content.split('\n').length;
    const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

    this._container.innerHTML = `
      <div class="file-preview-code">
        <pre class="file-preview-lines" aria-hidden="true">${lineNums}</pre>
        <pre><code class="hljs">${highlighted}</code></pre>
      </div>`;
    this._container.dataset.currentPath = filePath;
    this._updateEditBtn();
  }

  // ==================== 编辑模式 ====================

  _enterEdit() {
    const textarea = document.createElement('textarea');
    textarea.className = 'file-preview-textarea';
    textarea.value = this._content;
    textarea.spellcheck = false;

    this._dirty = false;
    this._editing = true;
    this._onDirtyChange(this._currentPath, false);
    this._container.innerHTML = '';
    this._container.appendChild(textarea);

    // Ctrl+S 保存
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });

    // 内容变化标记 dirty
    textarea.addEventListener('input', () => {
      if (!this._dirty) {
        this._dirty = true;
        this._onDirtyChange(this._currentPath, true);
      }
    });

    // 聚焦
    setTimeout(() => textarea.focus(), 50);
    this._updateEditBtn();
  }

  _exitEdit() {
    this._editing = false;
    this._dirty = false;
    this._onDirtyChange(this._currentPath, false);
    if (this._content) {
      this._renderReadonly(this._currentPath, this._content);
    }
  }

  // ==================== 按钮状态同步 ====================

  _updateEditBtn() {
    const btn = document.getElementById('previewEditBtn');
    if (!btn) return;

    if (this._currentPath) {
      btn.style.display = '';
      if (this._editing) {
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 4.5l-4 4"/>
            <path d="M6.5 11l-3 1 1-3 5.5-5.5a1.5 1.5 0 0 1 2 2L6.5 11z"/>
            <path d="M10 3.5l2 2"/>
          </svg>`;
        btn.title = '退出编辑 (Ctrl+E)';
      } else {
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"/>
          </svg>`;
        btn.title = '编辑文件 (Ctrl+E)';
      }
    } else {
      btn.style.display = 'none';
    }
  }

  // ==================== 工具方法 ====================

  _detectLanguage(filePath, content) {
    const ext = filePath.split('.').pop().toLowerCase();
    const extMap = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
      php: 'php', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
      cs: 'csharp', swift: 'swift', kt: 'kotlin', scala: 'scala',
      html: 'html', css: 'css', scss: 'scss', less: 'less',
      json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
      md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash',
      zsh: 'bash', dockerfile: 'dockerfile', vue: 'html', svelte: 'html',
    };
    return extMap[ext] || null;
  }

  _showError(message) {
    this._container.innerHTML = `
      <div class="file-preview-placeholder" style="color:var(--error-text);">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${this._escapeHtml(message)}</p>
      </div>`;
    this._updateEditBtn();
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
