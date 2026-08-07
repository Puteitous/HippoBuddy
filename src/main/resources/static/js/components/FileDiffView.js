/**
 * FileDiffView — 文件变更对比视图（共享渲染组件）
 *
 * 自包含一个完整 diff 查看器：左侧时间线 + 右侧逐行 diff 内容 + 底部统计/回滚。
 * 供两种宿主复用：
 *   - Diff 弹窗（diff-modal.js）内嵌
 *   - 预览区 diff 标签页（FilePreview.showDiff）
 *
 * 数据源：GET /api/files/diff?path=xxx&all=true
 * 视图：
 *   - "整体变更"（置顶）：整个会话内文件从最早到最新的 git 式对比（上下文 + hunk 折叠）
 *   - 历史时间线：每次工具变更的 diff（同样是"变更前 vs 变更后"完整文件对比，同样折叠）
 */

import { escapeHtml, apiGet, apiPost } from '../utils.js';
import { showToast } from '../utils/toast.js';
import { EventBus } from '../utils/event-bus.js';

// ── 语法高亮工具 ────────────────────────────────────────
// 扩展名 → highlight.js 语言名
const EXT_LANG_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', cs: 'csharp',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  php: 'php', swift: 'swift',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', md: 'markdown', markdown: 'markdown',
};

/**
 * 将 hljs 高亮后的整块 HTML 按 \n 切分为多行，每行保持标签闭合平衡。
 * 跨行 token（如多行注释/模板字符串）在行尾补 </span>、行首重开同 class 的 span，
 * 保证中间行颜色不中断，且每行 HTML 都是合法的。
 */
function splitHighlightedLines(html) {
  const lines = [];
  let current = '';
  const stack = [];
  let i = 0;
  const OPEN_TAG = '<span class="';

  while (i < html.length) {
    const ch = html[i];
    if (ch === '\n') {
      let close = '';
      for (let j = stack.length - 1; j >= 0; j--) close += '</span>';
      lines.push(current + close);
      let reopen = '';
      for (const cls of stack) reopen += `${OPEN_TAG}${cls}">`;
      current = reopen;
      i++;
      continue;
    }
    if (ch === '<' && html.startsWith(OPEN_TAG, i)) {
      const end = html.indexOf('">', i + OPEN_TAG.length);
      if (end !== -1) {
        const cls = html.slice(i + OPEN_TAG.length, end);
        stack.push(cls);
        current += html.slice(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    if (ch === '<' && html.startsWith('</span>', i)) {
      stack.pop();
      current += '</span>';
      i += 7;
      continue;
    }
    current += ch;
    i++;
  }
  let close = '';
  for (let j = stack.length - 1; j >= 0; j--) close += '</span>';
  lines.push(current + close);
  return lines;
}

// ── git 式整体 diff 折叠 ────────────────────────────────
// 整体视图时每个变更块前后保留的上下文行数
const DIFF_CONTEXT_LINES = 3;

/**
 * 将整文件 diff（含大量 same 上下文行）折叠为 git 风格：
 * 每个变更块前后保留 DIFF_CONTEXT_LINES 行上下文，连续未变化的段折叠为 hunk 分隔行。
 * 头部/尾部未变化段同样折叠为 hunk（默认收起，点击可展开查看完整文件），不留永久盲区。
 * 返回显示序列：[{ idx: 原始changes下标, type, content } | { idx: -1, type: 'hunk', count, from, to }]
 * hunk 项的 from/to 为折叠段在原始 changes 中的下标范围 [from, to)，供"展开上下文"使用。
 */
function buildHunkSequence(changes) {
  const n = changes.length;
  const show = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = changes[i].type;
    if (t === 'added' || t === 'removed') {
      for (let j = Math.max(0, i - DIFF_CONTEXT_LINES); j <= Math.min(n - 1, i + DIFF_CONTEXT_LINES); j++) {
        show[j] = true;
      }
    }
  }

  const out = [];
  let i = 0;
  while (i < n) {
    if (show[i]) {
      out.push({ idx: i, type: changes[i].type, content: changes[i].content || '' });
      i++;
    } else {
      let j = i;
      while (j < n && !show[j]) j++;
      // 未显示段（含头部/尾部）一律折叠为 hunk，点击可展开；展开全部时一并对齐
      out.push({ idx: -1, type: 'hunk', count: j - i, from: i, to: j });
      i = j;
    }
  }
  return out;
}

// 单个折叠段允许展开的最大行数，超过则提示无法展开（防大文件渲染卡顿）
const HUNK_EXPAND_MAX_LINES = 3000;

export class FileDiffView {
  /**
   * @param {HTMLElement} container - 挂载容器（组件会 append 自身到容器）
   * @param {Object} [options]
   * @param {Function} [options.onNetStats] - (netStats: [add, del]) 净统计回调（弹窗 header / 状态栏用）
   * @param {Function} [options.onRollback] - 回滚成功后回调（弹窗关闭 / 标签页刷新用）
   * @param {Function} [options.onOpenInEditor] - (filePath, line) 点击"在编辑器中打开"回调；
   *   line 为当前选中视图首个变更行对应的新文件行号（1-based，可能为 null 表示无法定位）。
   *   宿主据此跳转到编辑 tab 并滚动到该行。
   */
  constructor(container, options = {}) {
    this._container = container;
    this._options = options;
    this._currentFilePath = null;
    this._currentToolCallId = '';
    this._allChanges = [];
    this._netDiff = null;
    this._activeIndex = -1;
    /** 已展开的折叠段集合（整体视图）：存 hunk 的 from 下标 */
    this._expandedHunks = new Set();
    /** 当前渲染的 diff 数据（供展开/收起后重渲染） */
    this._currentDiffData = null;
    this._destroyed = false;

    // 自包含 DOM：时间线 + 内容面板 + 底部统计/回滚
    this._el = document.createElement('div');
    this._el.className = 'file-diff-view';
    this._el.innerHTML = `
      <div class="diff-view-body">
        <div class="diff-timeline"></div>
        <div class="diff-content-panel">
          <div class="diff-empty">${window.i18n ? window.i18n.t('diff.loading') : '加载中...'}</div>
        </div>
      </div>
      <div class="diff-view-footer">
        <div class="diff-stats"></div>
        <button class="diff-open-editor-btn">${window.i18n ? window.i18n.t('diff.openInEditor') : '在编辑器中打开'}</button>
        <button class="diff-rollback-btn">${window.i18n ? window.i18n.t('diff.rollbackBtn') : '回滚此变更'}</button>
      </div>
    `;
    container.appendChild(this._el);

    this._timeline = this._el.querySelector('.diff-timeline');
    this._contentPanel = this._el.querySelector('.diff-content-panel');
    this._statsEl = this._el.querySelector('.diff-stats');
    this._rollbackBtn = this._el.querySelector('.diff-rollback-btn');
    this._rollbackBtn.addEventListener('click', () => this._rollbackCurrentFile());
    this._openEditorBtn = this._el.querySelector('.diff-open-editor-btn');
    this._openEditorBtn.addEventListener('click', () => {
      if (this._options.onOpenInEditor && this._currentFilePath) {
        // 携带当前选中视图首个变更行的新文件行号，宿主可据此滚动到对应行
        this._options.onOpenInEditor(this._currentFilePath, this._getFirstChangeLine());
      }
    });
  }

  get filePath() { return this._currentFilePath; }
  getCurrentToolCallId() { return this._currentToolCallId; }

  /**
   * 加载指定文件的变更对比。
   * @param {string} filePath
   * @param {string} [toolCallId] - 传入时定位到该次变更；缺省时默认展示"整体变更"
   * @param {Object} [options]
   * @param {boolean} [options.silent=false] - 静默刷新：请求返回前保留现有 DOM（不显示加载态），
   *   数据就绪后原地更新并恢复刷新前的视图；用于外部变更后 reload，避免每次闪烁。
   */
  async load(filePath, toolCallId, options = {}) {
    const silent = !!options.silent;
    this._currentFilePath = filePath;

    // 静默刷新时记录当前视图，数据返回后据此恢复（变更列表可能已变化，index 会失效）
    const prevActiveIndex = silent ? this._activeIndex : null;
    const prevToolCallId = silent ? this._currentToolCallId : '';

    if (!silent) {
      this._currentToolCallId = toolCallId || '';

      // 重置加载状态（仅首次加载/切换文件时显示加载态；静默刷新保留旧 DOM 直到新数据就绪）
      this._timeline.innerHTML = `<div class="diff-timeline-loading">${this._t('diff.loading')}</div>`;
      this._contentPanel.innerHTML = `<div class="diff-empty">${this._t('diff.loading')}</div>`;
      this._statsEl.innerHTML = '';
      this._statsEl.style.display = 'none';
      this._rollbackBtn.classList.remove('rolling');
      this._rollbackBtn.textContent = this._t('diff.rollbackBtn');
      this._rollbackBtn.style.display = '';
    }

    try {
      let url = `/api/files/diff?path=${encodeURIComponent(filePath)}&all=true`;
      if (toolCallId) {
        url += `&toolCallId=${encodeURIComponent(toolCallId)}`;
      }
      const data = await apiGet(url);
      if (this._destroyed) return;

      this._allChanges = data.allChanges || [];
      this._netDiff = data.netDiff || null;
      this._netWordDiff = data.netWordDiff || null;

      // 净统计回调（弹窗 header / 标签页状态栏）
      if (this._options.onNetStats) {
        this._options.onNetStats(data.netStats || [0, 0]);
      }

      this._renderTimeline();

      const hasNetDiff = Array.isArray(this._netDiff) && this._netDiff.length > 0;

      // ── 静默刷新：原地更新，不闪烁 ──
      if (silent) {
        if (prevActiveIndex === -1 && hasNetDiff) {
          // 刷新前在"整体变更"视图 → 恢复整体视图
          this._selectChange(-1);
        } else if (this._allChanges.length > 0) {
          // 刷新前选中某条历史变更：优先按 toolCallId 定位（列表可能已变）；
          // 找不到（该次变更被回滚）则降级到最后一条
          let targetIndex = -1;
          if (prevToolCallId) {
            targetIndex = this._allChanges.findIndex(c => c.toolCallId === prevToolCallId);
          }
          if (targetIndex < 0) {
            targetIndex = this._allChanges.length - 1;
          }
          this._selectChange(targetIndex);
        } else {
          // 所有变更均被回滚：显示空状态
          this._contentPanel.innerHTML = '';
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'diff-empty';
          emptyDiv.textContent = this._t('diff.noRecords');
          this._contentPanel.appendChild(emptyDiv);
          this._rollbackBtn.style.display = 'none';
          this._statsEl.style.display = 'none';
        }
        return;
      }

      // ── 首次加载 / 切换文件 ──
      if (!toolCallId && hasNetDiff) {
        this._selectChange(-1);
      } else if (this._allChanges.length > 0) {
        let targetIndex = data.targetIndex != null ? data.targetIndex : this._allChanges.length - 1;
        if (targetIndex < 0) {
          // 指定变更已被回滚，降级到最后一个
          targetIndex = this._allChanges.length - 1;
          this._showRollbackWarning();
        }
        this._selectChange(targetIndex);
      } else {
        // 无变更记录
        this._contentPanel.innerHTML = '';
        if (toolCallId) {
          this._showRollbackWarning();
        }
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'diff-empty';
        emptyDiv.textContent = toolCallId
          ? this._t('diff.noRecordsRollback')
          : this._t('diff.noRecords');
        this._contentPanel.appendChild(emptyDiv);
        this._rollbackBtn.style.display = 'none';
        this._statsEl.style.display = 'none';
      }
    } catch (e) {
      if (this._destroyed) return;
      // 静默刷新失败：保留现有内容，仅 toast 提示，避免内容被清空后无法恢复
      if (silent) {
        showToast(this._t('diff.loadFailed') + e.message, { type: 'error', duration: 3000 });
        return;
      }
      this._contentPanel.innerHTML = `<div class="diff-empty">${this._t('diff.loadFailed')}${escapeHtml(e.message)}</div>`;
      this._timeline.innerHTML = '';
    }
  }

  /** 重新加载当前文件（回滚/外部变更后刷新）——静默刷新，不闪烁且恢复原视图 */
  async reload() {
    if (this._currentFilePath) {
      await this.load(this._currentFilePath, '', { silent: true });
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._container = null;
    this._currentFilePath = null;
  }

  // ==================== 内部：渲染 ====================

  _t(key, params) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key, params);
    }
    return key;
  }

  _renderTimeline() {
    if (!this._timeline) return;

    if (this._allChanges.length === 0) {
      this._timeline.innerHTML = `<div class="diff-timeline-empty">${this._t('diff.noRecords')}</div>`;
      return;
    }

    const hasNetDiff = Array.isArray(this._netDiff) && this._netDiff.length > 0;
    let html = '';

    // 置顶条目：整体变更（最早 vs 最新，git 式对比）
    if (hasNetDiff) {
      const isOverallActive = this._activeIndex === -1;
      // 净统计：只统计变更行
      let netAdded = 0, netRemoved = 0;
      for (const ch of this._netDiff) {
        if (ch.type === 'added') netAdded++;
        else if (ch.type === 'removed') netRemoved++;
      }
      const statsHtml = (netAdded > 0 || netRemoved > 0)
        ? `<span class="diff-timeline-stats"><span class="diff-added-count">+${netAdded}</span> <span class="diff-removed-count">-${netRemoved}</span></span>`
        : '';

      html += `
        <div class="diff-timeline-item overall ${isOverallActive ? 'active' : ''}" data-index="-1">
          <div class="diff-timeline-dot"></div>
          <div class="diff-timeline-content">
            <div class="diff-timeline-time">${escapeHtml(this._t('diff.overall'))}</div>
            <div class="diff-timeline-tool">${statsHtml}</div>
          </div>
        </div>
        <div class="diff-timeline-divider"></div>
      `;
    }

    for (let i = 0; i < this._allChanges.length; i++) {
      const c = this._allChanges[i];
      const time = new Date(c.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const toolLabel = this._getToolLabel(c.toolName);
      const isActive = i === this._activeIndex;

      // 统计该次变更的 +/- 数量
      let added = 0, removed = 0;
      if (c.changes) {
        for (const ch of c.changes) {
          if (ch.type === 'added') added++;
          if (ch.type === 'removed') removed++;
        }
      }
      const statsHtml = (added > 0 || removed > 0)
        ? `<span class="diff-timeline-stats"><span class="diff-added-count">+${added}</span> <span class="diff-removed-count">-${removed}</span></span>`
        : '';

      html += `
        <div class="diff-timeline-item ${isActive ? 'active' : ''}" data-index="${i}">
          <div class="diff-timeline-dot"></div>
          <div class="diff-timeline-content">
            <div class="diff-timeline-time">${escapeHtml(time)}</div>
            <div class="diff-timeline-tool">${escapeHtml(toolLabel)} ${statsHtml}</div>
          </div>
        </div>
      `;
    }
    this._timeline.innerHTML = html;

    this._timeline.querySelectorAll('.diff-timeline-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this._selectChange(idx);
      });
    });
  }

  _selectChange(index) {
    // 切换视图时重置折叠段展开状态
    this._expandedHunks.clear();

    // -1 = 整体变更视图（最早 vs 最新）；0..n-1 = 具体历史变更
    if (index === -1) {
      this._activeIndex = -1;
      this._timeline.querySelectorAll('.diff-timeline-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.index) === -1);
      });

      // 整体视图：不可回滚，隐藏回滚按钮
      this._currentToolCallId = '';
      this._rollbackBtn.style.display = 'none';

      const netData = {
        changes: this._netDiff || [],
        binary: false,
        overall: true,
        wordDiff: this._netWordDiff || null
      };
      this._renderDiff(netData);
      return;
    }

    if (index < 0 || index >= this._allChanges.length) return;
    this._activeIndex = index;

    this._timeline.querySelectorAll('.diff-timeline-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.index) === index);
    });

    const c = this._allChanges[index];
    this._currentToolCallId = c.toolCallId || '';
    this._renderDiff(c);

    // 二进制文件：隐藏回滚按钮
    this._rollbackBtn.style.display = c.binary ? 'none' : '';
  }

  _renderDiff(data, preserveScrollTop) {
    if (!this._contentPanel) return;

    // 保存当前数据，供展开/收起折叠段后重渲染
    this._currentDiffData = data;

    if (data.binary) {
      this._contentPanel.innerHTML = `<div class="diff-binary-notice">${this._t('diff.binary')}</div>`;
      this._updateStats(0, 0);
      return;
    }

    if (!data.changes || data.changes.length === 0) {
      this._contentPanel.innerHTML = `<div class="diff-empty">${this._t('diff.noContent')}</div>`;
      this._updateStats(0, 0);
      return;
    }

    let addedCount = 0;
    let removedCount = 0;
    let html = '';

    // 词级 diff（行内精确变更）：{old: [...], new: [...]}，按行号索引
    const wordDiff = data.wordDiff || null;

    // 整块高亮后按行切分（对原始 changes 序列高亮，hunk 折叠项不参与）
    const highlightedLines = this._highlightDiffLines(data.changes);

    // 行号映射表：预计算每个原始下标对应的旧/新文件行号。
    // 覆盖全部 changes（含被折叠/丢弃的头部上下文段），保证行号是绝对准确的文件行号。
    // 历史视图的 diff 同样是"变更前完整文件 vs 变更后完整文件"的逐行对比，
    // 顺序递增即真实文件行号，与整体视图共用同一映射算法，折叠/展开后行号依旧准确。
    const oldNumAt = new Map();
    const newNumAt = new Map();
    let o = 1, n = 1;
    for (let k = 0; k < data.changes.length; k++) {
      const t = data.changes[k].type;
      if (t === 'removed') { oldNumAt.set(k, o); o++; }
      else if (t === 'added') { newNumAt.set(k, n); n++; }
      else { oldNumAt.set(k, o); newNumAt.set(k, n); o++; n++; }
    }

    // git 式折叠上下文行：整体视图与历史视图一致。
    // 每个变更块前后保留 DIFF_CONTEXT_LINES 行上下文，连续未变化段折叠为 hunk；
    // 头部/尾部未变化段同样折叠为 hunk（默认收起，点击可展开查看完整文件）。
    const displaySeq = buildHunkSequence(data.changes);

    // 折叠段工具条：展开全部 / 收起全部（按钮带当前折叠段计数）；无折叠段时不渲染
    let toolbarHtml = '';
    const hunks = displaySeq.filter(it => it.type === 'hunk');
    if (hunks.length > 0) {
      const collapsedCount = hunks.filter(h => !this._expandedHunks.has(h.from)).length;
      const allExpanded = collapsedCount === 0;
      toolbarHtml = `
        <div class="diff-toolbar">
          <button class="diff-toolbar-btn" data-action="${allExpanded ? 'collapse' : 'expand'}">${allExpanded ? escapeHtml(this._t('diff.collapseAll')) : escapeHtml(this._t('diff.expandAll', { count: collapsedCount }))}</button>
        </div>`;
    }

    for (const item of displaySeq) {
      // hunk 折叠分隔行：未展开时跳过；已展开时渲染收起行 + 完整上下文
      if (item.type === 'hunk') {
        const isExpanded = this._expandedHunks.has(item.from);

        if (!isExpanded) {
          html += `<div class="diff-line diff-hunk clickable" data-hunk-from="${item.from}" title="${escapeHtml(this._t('diff.hunkExpandTip'))}"><span class="diff-hunk-info">⋯ ${escapeHtml(this._t('diff.hunkSkipped', { count: item.count }))}</span></div>`;
          continue;
        }

        // 已展开：先渲染"收起"提示行，再渲染该段完整上下文行（行号查表，绝对准确）
        html += `<div class="diff-line diff-hunk clickable" data-hunk-from="${item.from}" title="${escapeHtml(this._t('diff.hunkCollapseTip'))}"><span class="diff-hunk-info">⋯ ${escapeHtml(this._t('diff.hunkExpanded', { count: item.count }))}</span></div>`;
        for (let k = item.from; k < item.to; k++) {
          const ch = data.changes[k];
          const c = ch.content || '';
          const contentHtml = (highlightedLines && k < highlightedLines.length)
            ? highlightedLines[k]
            : escapeHtml(c);
          html += `<div class="diff-line same">
            <span class="diff-line-num">${newNumAt.get(k)}</span>
            <span class="diff-line-type same"> </span>
            <span class="diff-line-content">${contentHtml}</span>
          </div>`;
        }
        continue;
      }

      const type = item.type;
      const content = item.content;
      const typeSymbol = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';

      if (type === 'added') addedCount++;
      if (type === 'removed') removedCount++;

      // 行号：查映射表取绝对行号（removed 旧行号 / added 新行号 / same 两表都有）。
      // 与之前"顺序递增"完全等价（历史视图的 diff 就是完整文件对比，递增即真实行号），
      // 折叠/展开后行号依旧准确。
      const numHtml = type === 'removed' ? oldNumAt.get(item.idx) : newNumAt.get(item.idx);
      const lineNoForWord = numHtml; // removed 用旧行号 / added 用新行号，供词级标记索引

      // 词级标记（行内精确变更）：按行号索引 wordDiff 对应行。
      // removed 行查 wordDiff.old[旧行号-1]，added 行查 wordDiff.new[新行号-1]；
      // 该行存在 delete/insert 词时才做词级渲染，否则回退整行高亮/纯文本。
      let wordTokens = null;
      if (type !== 'same' && wordDiff) {
        const lines = type === 'removed' ? wordDiff.old : wordDiff.new;
        const toks = lines && Array.isArray(lines) ? lines[lineNoForWord - 1] : null;
        if (toks && toks.some(t => (type === 'removed' ? t.type === 'delete' : t.type === 'insert'))) {
          wordTokens = toks;
        }
      }

      // 词级优先；否则高亮失败或长度不匹配时回退纯文本
      const contentHtml = wordTokens
        ? this._renderWordLine(wordTokens, type)
        : ((highlightedLines && item.idx < highlightedLines.length) ? highlightedLines[item.idx] : escapeHtml(content));

      html += `<div class="diff-line ${type}">
        <span class="diff-line-num">${numHtml}</span>
        <span class="diff-line-type ${type}">${typeSymbol}</span>
        <span class="diff-line-content">${contentHtml}</span>
      </div>`;
    }

    this._contentPanel.innerHTML = `<div class="diff-content${toolbarHtml ? ' has-toolbar' : ''}">${toolbarHtml}${html}</div>`;
    this._updateStats(addedCount, removedCount);

    // 绑定折叠段展开/收起点击事件
    this._contentPanel.querySelectorAll('.diff-line.diff-hunk.clickable').forEach(el => {
      el.addEventListener('click', () => this._toggleHunk(parseInt(el.dataset.hunkFrom)));
    });

    // 绑定"展开全部 / 收起全部"工具条按钮
    const toolbarBtn = this._contentPanel.querySelector('.diff-toolbar-btn');
    if (toolbarBtn) {
      toolbarBtn.addEventListener('click', () => {
        if (toolbarBtn.dataset.action === 'expand') this._expandAllHunks();
        else this._collapseAllHunks();
      });
    }

    // 展开/收起重渲染时保留原滚动位置，避免跳动
    if (preserveScrollTop != null) {
      this._contentPanel.scrollTop = preserveScrollTop;
      return;
    }

    // 立即定位到第一个变更行，与 innerHTML 在同一帧内完成，避免闪烁
    const firstChange = this._contentPanel.querySelector('.diff-line.added, .diff-line.removed');
    if (firstChange) {
      const panel = this._contentPanel;
      panel.scrollTop = Math.max(0, firstChange.offsetTop - panel.clientHeight / 2 + firstChange.offsetHeight / 2);
    }
  }

  /**
   * 展开/收起整体视图中的某个折叠上下文段。
   * @param {number} hunkFrom - hunk 项的 from 下标
   */
  _toggleHunk(hunkFrom) {
    if (hunkFrom == null || !this._currentDiffData) return;

    // 展开前检查该段大小，超限提示不展开
    if (!this._expandedHunks.has(hunkFrom)) {
      const seq = buildHunkSequence(this._currentDiffData.changes);
      const hunk = seq.find(it => it.type === 'hunk' && it.from === hunkFrom);
      if (hunk && hunk.count > HUNK_EXPAND_MAX_LINES) {
        showToast(this._t('diff.hunkTooLarge'), { type: 'warning', duration: 2500 });
        return;
      }
      this._expandedHunks.add(hunkFrom);
    } else {
      this._expandedHunks.delete(hunkFrom);
    }

    // 保留当前滚动位置重渲染
    this._rerenderPreservingScroll();
  }

  /** 展开全部折叠段（跳过超限段；无可展开段时 toast 提示） */
  _expandAllHunks() {
    if (!this._currentDiffData) return;
    const seq = buildHunkSequence(this._currentDiffData.changes);
    const hunks = seq.filter(it => it.type === 'hunk');
    if (hunks.length === 0) return;
    const expandable = hunks.filter(h => h.count <= HUNK_EXPAND_MAX_LINES);
    if (expandable.length === 0) {
      showToast(this._t('diff.hunkTooLarge'), { type: 'warning', duration: 2500 });
      return;
    }
    for (const h of expandable) this._expandedHunks.add(h.from);
    this._rerenderPreservingScroll();
  }

  /** 收起全部折叠段 */
  _collapseAllHunks() {
    this._expandedHunks.clear();
    this._rerenderPreservingScroll();
  }

  /** 保留当前滚动位置重渲染当前 diff 数据（展开/收起后调用，避免跳动） */
  _rerenderPreservingScroll() {
    const panel = this._contentPanel;
    const savedTop = panel ? panel.scrollTop : 0;
    this._renderDiff(this._currentDiffData, savedTop);
  }

  /**
   * 计算当前选中视图首个变更行对应的新文件行号（1-based），供"在编辑器中打开"定位。
   *
   * 语义：编辑 tab 打开的是文件当前内容（最新版本），故一律定位到"新文件中存在的行"。
   * - 首个变更行是 added → 直接取其新行号（该行就在新文件里）
   * - 首个变更行是 removed → 该行在新文件中不存在，向后取紧随其后的第一个
   *   added/same 行的新行号（删除点之后的位置）
   * - 整个文件只剩删除（删空）→ 无行可定位，返回 null
   *
   * 行号口径与 `_renderDiff` 一致：新文件行号从 1 起，对 added/same 行递增、
   * removed 行不占位；整体视图（绝对行号）与历史视图（该次变更完整 diff）同源。
   * @returns {number|null}
   */
  _getFirstChangeLine() {
    const data = this._currentDiffData;
    if (!data || !Array.isArray(data.changes) || data.changes.length === 0) return null;
    const changes = data.changes;

    // 找到首个变更行（added/removed）下标
    let firstIdx = -1;
    for (let k = 0; k < changes.length; k++) {
      if (changes[k].type === 'added' || changes[k].type === 'removed') {
        firstIdx = k;
        break;
      }
    }
    if (firstIdx === -1) return null;

    // 从 firstIdx 起找第一个"新文件中存在的行"（added/same），返回其新行号
    let newLineNum = 1;
    for (let k = 0; k < changes.length; k++) {
      if (changes[k].type === 'removed') continue;
      if (k >= firstIdx) return newLineNum;
      newLineNum++;
    }
    // 仅剩删除（文件删空）→ 无法定位
    return null;
  }

  /**
   * 渲染词级标记行：把词 token 序列转为 HTML。
   * removed 行中 delete 词包 <del>，added 行中 insert 词包 <ins>，其余原样输出。
   * @param {Array<{type: string, value: string}>} tokens
   * @param {'removed'|'added'} lineType
   */
  _renderWordLine(tokens, lineType) {
    let html = '';
    for (const t of tokens || []) {
      const v = escapeHtml(t.value != null ? t.value : '');
      if (lineType === 'removed' && t.type === 'delete') {
        html += `<del class="diff-word-del">${v}</del>`;
      } else if (lineType === 'added' && t.type === 'insert') {
        html += `<ins class="diff-word-ins">${v}</ins>`;
      } else {
        html += v;
      }
    }
    return html;
  }

  /**
   * 对 diff 行做语法高亮：将整个 diff 文本块交给 highlight.js 高亮，
   * 再按行切分（保持跨行 token 的标签平衡）。
   * 返回与 changes 等长的行 HTML 数组；hljs 不可用 / 出错 / 超限时返回 null（调用方回退纯文本）。
   */
  _highlightDiffLines(changes) {
    const hljs = window.hljs;
    if (!hljs || !changes || changes.length === 0) return null;

    const fullText = changes.map(c => c.content || '').join('\n');
    // 大文件保护：超过 500KB 跳过高亮，避免阻塞 UI
    if (fullText.length > 500 * 1024) return null;

    let highlighted;
    try {
      const lang = this._detectLanguage(this._currentFilePath);
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(fullText, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(fullText).value;
      }
    } catch (e) {
      return null;
    }

    const lines = splitHighlightedLines(highlighted);
    // hljs 输出末尾保留换行时可能多出空行，截断到 changes 长度
    return lines.slice(0, changes.length);
  }

  /** 根据文件路径扩展名推断 hljs 语言名；无法推断返回 null */
  _detectLanguage(filePath) {
    if (!filePath) return null;
    const ext = filePath.split(/[./\\]/).pop().toLowerCase();
    return EXT_LANG_MAP[ext] || null;
  }

  /**
   * 更新底部统计栏：显示当前选中变更的 +/- 行数。
   * 无变更（二进制文件 / 空 diff）时清空并隐藏。
   */
  _updateStats(added, removed) {
    if (!this._statsEl) return;
    if (added === 0 && removed === 0) {
      this._statsEl.innerHTML = '';
      this._statsEl.style.display = 'none';
      return;
    }
    this._statsEl.innerHTML =
      `<span class="diff-added-count">+${added}</span>` +
      `<span class="diff-removed-count">-${removed}</span>`;
    this._statsEl.style.display = 'inline-flex';
  }

  _showRollbackWarning() {
    // 在内容面板顶部插入提示条
    const warning = document.createElement('div');
    warning.className = 'diff-rollback-warning';
    warning.textContent = this._t('diff.rolledBack');
    if (this._contentPanel) {
      this._contentPanel.prepend(warning);
    }
  }

  _getToolLabel(toolName) {
    switch (toolName) {
      case 'edit_file': return this._t('diff.typeEdit');
      case 'write_file': return this._t('diff.typeWrite');
      case 'delete_file': return this._t('diff.typeDelete');
      default: return toolName;
    }
  }

  // ==================== 内部：回滚 ====================

  async _rollbackCurrentFile() {
    if (!this._currentFilePath || !this._rollbackBtn) return;
    if (this._rollbackBtn.classList.contains('rolling')) return;

    this._rollbackBtn.classList.add('rolling');
    this._rollbackBtn.textContent = this._t('diff.rollingBack');

    try {
      const result = await apiPost('/api/files/rollback', {
        filePath: this._currentFilePath,
        toolCallId: this._currentToolCallId || undefined
      });

      if (result.success) {
        showToast(this._t('diff.rollbackSuccess') + this._currentFilePath.split(/[/\\]/).pop(), {
          type: 'success',
          duration: 3000
        });
        EventBus.emit('file:changes-updated');
        if (this._options.onRollback) {
          this._options.onRollback();
        }
      } else {
        showToast(this._t('diff.rollbackFailed') + (result.error || this._t('chatui.unknownError')), {
          type: 'error',
          duration: 3000
        });
        this._rollbackBtn.classList.remove('rolling');
        this._rollbackBtn.textContent = this._t('diff.rollbackBtn');
      }
    } catch (e) {
      showToast(this._t('diff.rollbackFailed') + e.message, { type: 'error', duration: 3000 });
      this._rollbackBtn.classList.remove('rolling');
      this._rollbackBtn.textContent = this._t('diff.rollbackBtn');
    }
  }
}

// 导出纯函数供单元测试（vitest）复用；对运行时无影响
export { buildHunkSequence, splitHighlightedLines, DIFF_CONTEXT_LINES, HUNK_EXPAND_MAX_LINES };
