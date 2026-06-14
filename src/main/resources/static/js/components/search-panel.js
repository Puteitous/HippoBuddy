/**
 * SearchPanel — 浮动搜索面板（VS Code / IDEA 风格）
 *
 * 不依赖 CM6 panel 系统，作为独立浮层叠加在编辑器上方。
 * 搜索核心逻辑（高亮、导航、替换）通过 CM6 @codemirror/search API 驱动。
 *
 * 使用：
 *   const panel = new SearchPanel(view);
 *   panel.openFind();     // Ctrl+F
 *   panel.openReplace();  // Ctrl+H
 *   panel.close();        // Esc
 */

import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '../vendor/codemirror.js';

export class SearchPanel {
  constructor(view) {
    this._view = view;
    this._searchTimer = null;
    this._buildDOM();
    this._appendToEditor();
    this._bindEvents();
  }

  attachView(view) {
    this._view = view;
  }

  // ────────── 公开 API ──────────

  /** Ctrl+F 打开查找 */
  openFind() {
    this._replaceRow.style.display = 'none';
    this._show();
    this._focusFind();
  }

  /** Ctrl+H 打开替换 */
  openReplace() {
    this._replaceRow.style.display = '';
    this._show();
    this._focusFind();
  }

  /** 关闭面板 */
  close() {
    this._overlay.style.display = 'none';
    if (this._view) this._view.focus();
  }

  // ────────── DOM 构建 ──────────

  _buildDOM() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'cm-search-overlay';
    this._overlay.style.display = 'none';

    // ── 查找行 ──
    const findRow = document.createElement('div');
    findRow.className = 'cm-search-row';

    // 输入框 + 选项图标容器
    const inputWrap = document.createElement('div');
    inputWrap.className = 'cm-search-input-wrap';

    this._findInput = document.createElement('input');
    this._findInput.type = 'text';
    this._findInput.className = 'cm-search-input';
    this._findInput.placeholder = '查找';
    this._findInput.spellcheck = false;
    this._findInput.setAttribute('aria-label', '查找');

    // 选项组（图标形式，放在输入框右侧内部）
    const optGroup = document.createElement('div');
    optGroup.className = 'cm-search-opt-group';

    this._caseCb = this._createOpt(
      '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 12L5 2h4l3 10"/><path d="M3.5 8.5h7"/></svg>',
      'case', '区分大小写');
    this._regexCb = this._createOpt(
      '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="4.5" cy="4.5" r="2.5"/><path d="M6.5 6.5l5 5"/><path d="M9 4.5h4"/><path d="M11 2.5v4"/></svg>',
      'regex', '正则表达式');
    this._wordCb = this._createOpt(
      '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="10" height="8" rx="1"/><path d="M4.5 8v-2h2v2"/><path d="M9.5 6v4"/></svg>',
      'word', '全词匹配');

    optGroup.append(this._caseCb, this._regexCb, this._wordCb);
    inputWrap.append(this._findInput, optGroup);

    this._matchCount = document.createElement('span');
    this._matchCount.className = 'cm-match-count';

    const prevBtn = this._createBtn('↑', '上一个 (Shift+Enter)', () => this._nav('prev'));
    const nextBtn = this._createBtn('↓', '下一个 (Enter)', () => this._nav('next'));

    // 展开/收起替换的按钮
    this._expandBtn = document.createElement('button');
    this._expandBtn.className = 'cm-search-expand';
    this._expandBtn.textContent = '▼';
    this._expandBtn.title = '展开替换';
    this._expandBtn.addEventListener('click', () => this._toggleReplace());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cm-search-close';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭 (Esc)';
    closeBtn.addEventListener('click', () => this.close());

    findRow.append(inputWrap, this._matchCount, prevBtn, nextBtn, this._expandBtn, closeBtn);

    // ── 替换行 ──
    this._replaceRow = document.createElement('div');
    this._replaceRow.className = 'cm-search-row cm-replace-row';
    this._replaceRow.style.display = 'none';

    this._replaceInput = document.createElement('input');
    this._replaceInput.type = 'text';
    this._replaceInput.className = 'cm-search-input';
    this._replaceInput.placeholder = '替换';
    this._replaceInput.spellcheck = false;
    this._replaceInput.setAttribute('aria-label', '替换');

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'cm-search-action';
    replaceBtn.textContent = '替换';
    replaceBtn.addEventListener('click', () => this._doReplace());

    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.className = 'cm-search-action';
    replaceAllBtn.textContent = '全部替换';
    replaceAllBtn.addEventListener('click', () => this._doReplaceAll());

    this._replaceRow.append(this._replaceInput, replaceBtn, replaceAllBtn);

    // ── 组装（不再有独立的 .cm-search-options 行） ──
    this._overlay.append(findRow, this._replaceRow);
  }

  _appendToEditor() {
    const tryAppend = () => {
      if (!this._view) return;
      const editorDom = this._view.dom;
      if (!editorDom) return;
      const parent = editorDom.closest('.file-preview') || editorDom.parentElement;
      if (parent && !this._overlay.parentElement) {
        // 确保父容器有 position:relative 用于浮层定位
        const style = getComputedStyle(parent);
        if (style.position === 'static') parent.style.position = 'relative';
        parent.appendChild(this._overlay);
      }
    };
    tryAppend();
    if (!this._overlay.parentElement) {
      setTimeout(tryAppend, 200);
    }
  }

  _createBtn(text, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'cm-search-nav-btn';
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _createOpt(svg, name, title) {
    const wrap = document.createElement('label');
    wrap.className = 'cm-search-opt';
    wrap.title = title;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.opt = name;
    const span = document.createElement('span');
    span.className = 'cm-search-opt-icon';
    span.innerHTML = svg;
    wrap.append(cb, span);
    return wrap;
  }

  // ────────── 事件绑定 ──────────

  _bindEvents() {
    this._findInput.addEventListener('input', () => this._debouncedSearch());
    this._replaceInput.addEventListener('input', () => this._debouncedSearch());
    this._findInput.addEventListener('keydown', (e) => this._onKeydown(e));
    this._replaceInput.addEventListener('keydown', (e) => this._onKeydown(e));

    this._caseCb.querySelector('input').addEventListener('change', () => this._doSearch());
    this._regexCb.querySelector('input').addEventListener('change', () => this._doSearch());
    this._wordCb.querySelector('input').addEventListener('change', () => this._doSearch());
  }

  // ────────── 显示逻辑 ──────────

  _show() {
    this._initFromSelection();
    this._overlay.style.display = '';
  }

  _focusFind() {
    this._findInput.focus();
    this._findInput.select();
  }

  _initFromSelection() {
    if (!this._view) return;
    const sel = this._view.state.sliceDoc(
      this._view.state.selection.main.from,
      this._view.state.selection.main.to
    );
    if (sel && sel.trim() && !this._findInput.value) {
      this._findInput.value = sel;
      this._doSearch();
    }
  }

  _toggleReplace() {
    const show = this._replaceRow.style.display === 'none';
    this._replaceRow.style.display = show ? '' : 'none';
    this._expandBtn.textContent = show ? '▲' : '▼';
  }

  // ────────── 搜索 ──────────

  _debouncedSearch() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._doSearch(), 200);
  }

  _buildQuery(searchText, replaceText) {
    return new SearchQuery({
      search: searchText || '',
      replace: replaceText || '',
      caseSensitive: this._caseCb.querySelector('input').checked,
      regexp: this._regexCb.querySelector('input').checked,
      wholeWord: this._wordCb.querySelector('input').checked,
    });
  }

  _doSearch() {
    const text = this._findInput.value;
    if (!text) {
      this._clearSearch();
      return;
    }

    const query = this._buildQuery(text, this._replaceInput?.value || '');
    this._view.dispatch({ effects: setSearchQuery.of(query) });
    findNext(this._view);
    this._updateMatchCount(query);
  }

  _clearSearch() {
    const empty = new SearchQuery({ search: '', replace: '' });
    this._view.dispatch({ effects: setSearchQuery.of(empty) });
    this._matchCount.textContent = '';
  }

  _updateMatchCount(query) {
    if (!query || !query.search) {
      this._matchCount.textContent = '';
      return;
    }
    try {
      const text = this._view.state.doc.toString();
      const searchText = this._findInput.value;
      if (!searchText) { this._matchCount.textContent = ''; return; }

      // 用正则统计匹配数（与 SearchQuery 设置保持一致）
      let re;
      if (query.regexp) {
        const flags = query.caseSensitive ? 'g' : 'gi';
        re = new RegExp(searchText, flags);
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = query.caseSensitive ? 'g' : 'gi';
        re = new RegExp(escaped, flags);
      }

      const matches = text.match(re);
      const count = matches ? matches.length : 0;

      // 当前匹配索引 ≈ 光标位置前的匹配数
      const before = text.slice(0, this._view.state.selection.main.from);
      const beforeMatches = before.match(re);
      const currentIdx = beforeMatches ? beforeMatches.length : 0;

      this._matchCount.textContent = count > 0 ? Math.min(currentIdx + 1, count) + '/' + count : '0/0';
      this._matchCount.className = 'cm-match-count' + (count === 0 ? ' no-match' : '');
    } catch (e) {
      console.error('[SearchPanel] _updateMatchCount error:', e);
      this._matchCount.textContent = '';
    }
  }

  // ────────── 导航 ──────────

  _nav(dir) {
    if (dir === 'next') findNext(this._view);
    else findPrevious(this._view);
    const text = this._findInput.value;
    if (text) {
      const query = this._buildQuery(text);
      this._updateMatchCount(query);
    }
  }

  // ────────── 替换 ──────────

  _doReplace() {
    const text = this._findInput.value;
    const replaceText = this._replaceInput.value;
    if (!text) return;
    const query = this._buildQuery(text, replaceText);
    this._view.dispatch({ effects: setSearchQuery.of(query) });
    replaceNext(this._view);
    this._updateMatchCount(query);
  }

  _doReplaceAll() {
    const text = this._findInput.value;
    const replaceText = this._replaceInput.value;
    if (!text) return;
    const query = this._buildQuery(text, replaceText);
    this._view.dispatch({ effects: setSearchQuery.of(query) });
    replaceAll(this._view);
    this._updateMatchCount(query);
    this._findInput.focus();
  }

  // ────────── 键盘 ──────────

  _onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) this._nav('prev');
      else this._nav('next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }
}
