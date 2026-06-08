/**
 * FilePreview — 只读文件预览组件
 *
 * 职责：
 *   1. 调用 HippoDesktop.readFile(path) 获取文件内容
 *   2. 使用 highlight.js 语法高亮渲染
 *   3. 支持暗色/亮色主题
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
   */
  constructor({ container, onError }) {
    this._container = container;
    this._onError = onError || (() => {});
    this._currentPath = null;
  }

  /** 加载并显示一个文件 */
  async show(filePath) {
    this._currentPath = filePath;

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

    this._render(filePath, content);
  }

  /** 重新加载当前文件（文件变更后刷新） */
  async reload() {
    if (this._currentPath) {
      await this.show(this._currentPath);
    }
  }

  /** 清除预览 */
  clear() {
    this._currentPath = null;
    this._container.innerHTML = '';
  }

  /** @returns {string|null} 当前预览的文件路径 */
  get currentPath() {
    return this._currentPath;
  }

  _render(filePath, content) {
    // 识别语言
    const lang = this._detectLanguage(filePath, content);

    // 尝试语法高亮
    let highlighted;
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      } else {
        highlighted = hljs.highlightAuto(content).value;
      }
    } catch {
      // 高亮失败，用纯文本
      highlighted = this._escapeHtml(content);
    }

    this._container.innerHTML = `
      <pre><code class="hljs">${highlighted}</code></pre>`;
  }

  _detectLanguage(filePath, content) {
    const ext = filePath.split('.').pop().toLowerCase();
    const extMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      dockerfile: 'dockerfile',
      vue: 'html',
      svelte: 'html',
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
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
