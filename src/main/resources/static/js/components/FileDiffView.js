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
 *   - 历史时间线：每次工具变更的逐行 diff
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
 * 每个变更块前后保留 DIFF_CONTEXT_LINES 行上下文，连续未变化的中间段折叠为 hunk 分隔行。
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
      // 仅在两个显示段之间的中间段折叠；头部/尾部未变化段直接丢弃
      if (i > 0 && j < n) {
        out.push({ idx: -1, type: 'hunk', count: j - i, from: i, to: j });
      }
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
        <button class="diff-rollback-btn">${window.i18n ? window.i18n.t('diff.rollbackBtn') : '回滚此变更'}</button>
      </div>
    `;
    container.appendChild(this._el);

    this._timeline = this._el.querySelector('.diff-timeline');
    this._contentPanel = this._el.querySelector('.diff-content-panel');
    this._statsEl = this._el.querySelector('.diff-stats');
    this._rollbackBtn = this._el.querySelector('.diff-rollback-btn');
    this._rollbackBtn.addEventListener('click', () => this._rollbackCurrentFile());
  }

  get filePath() { return this._currentFilePath; }
  getCurrentToolCallId() { return this._currentToolCallId; }

  /**
   * 加载指定文件的变更对比。
   * @param {string} filePath
   * @param {string} [toolCallId] - 传入时定位到该次变更；缺省时默认展示"整体变更"
   */
  async load(filePath, toolCallId) {
    this._currentFilePath = filePath;
    this._currentToolCallId = '';

    // 重置加载状态
    this._timeline.innerHTML = `<div class="diff-timeline-loading">${this._t('diff.loading')}</div>`;
    this._contentPanel.innerHTML = `<div class="diff-empty">${this._t('diff.loading')}</div>`;
    this._statsEl.innerHTML = '';
    this._statsEl.style.display = 'none';
    this._rollbackBtn.classList.remove('rolling');
    this._rollbackBtn.textContent = this._t('diff.rollbackBtn');
    this._rollbackBtn.style.display = '';

    try {
      let url = `/api/files/diff?path=${encodeURIComponent(filePath)}&all=true`;
      if (toolCallId) {
        url += `&toolCallId=${encodeURIComponent(toolCallId)}`;
      }
      const data = await apiGet(url);
      if (this._destroyed) return;

      this._allChanges = data.allChanges || [];
      this._netDiff = data.netDiff || null;

      // 净统计回调（弹窗 header / 标签页状态栏）
      if (this._options.onNetStats) {
        this._options.onNetStats(data.netStats || [0, 0]);
      }

      this._renderTimeline();

      const hasNetDiff = Array.isArray(this._netDiff) && this._netDiff.length > 0;
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
      this._contentPanel.innerHTML = `<div class="diff-empty">${this._t('diff.loadFailed')}${escapeHtml(e.message)}</div>`;
      this._timeline.innerHTML = '';
    }
  }

  /** 重新加载当前文件（回滚/外部变更后刷新） */
  async reload() {
    if (this._currentFilePath) {
      await this.load(this._currentFilePath);
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
        overall: true
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
    let newLineNum = 1;
    let oldLineNum = 1;

    const isOverall = !!data.overall;

    // 整块高亮后按行切分（对原始 changes 序列高亮，hunk 折叠项不参与）
    const highlightedLines = this._highlightDiffLines(data.changes);

    // 整体视图：预计算每个原始下标对应的旧/新文件行号。
    // 覆盖全部 changes（含被折叠/丢弃的头部上下文段），保证行号是绝对准确的文件行号。
    let oldNumAt = null, newNumAt = null;
    if (isOverall) {
      oldNumAt = new Map();
      newNumAt = new Map();
      let o = 1, n = 1;
      for (let k = 0; k < data.changes.length; k++) {
        const t = data.changes[k].type;
        if (t === 'removed') { oldNumAt.set(k, o); o++; }
        else if (t === 'added') { newNumAt.set(k, n); n++; }
        else { oldNumAt.set(k, o); newNumAt.set(k, n); o++; n++; }
      }
    }

    // 整体视图：git 式折叠上下文行；历史视图：逐行原样渲染
    const displaySeq = isOverall
      ? buildHunkSequence(data.changes)
      : data.changes.map((ch, idx) => ({ idx, type: ch.type, content: ch.content || '' }));

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

      // 高亮失败或长度不匹配时回退纯文本
      const contentHtml = (highlightedLines && item.idx < highlightedLines.length)
        ? highlightedLines[item.idx]
        : escapeHtml(content);

      // 行号：整体视图查表（绝对行号）；历史视图递增计数（该次变更的完整 diff 从 1 开始）
      let numHtml;
      if (isOverall && newNumAt) {
        numHtml = type === 'removed' ? oldNumAt.get(item.idx) : newNumAt.get(item.idx);
      } else {
        numHtml = type === 'removed' ? oldLineNum : newLineNum;
        if (type !== 'added') oldLineNum++;
        if (type !== 'removed') newLineNum++;
      }

      html += `<div class="diff-line ${type}">
        <span class="diff-line-num">${numHtml}</span>
        <span class="diff-line-type ${type}">${typeSymbol}</span>
        <span class="diff-line-content">${contentHtml}</span>
      </div>`;
    }

    this._contentPanel.innerHTML = `<div class="diff-content">${html}</div>`;
    this._updateStats(addedCount, removedCount);

    // 绑定折叠段展开/收起点击事件
    this._contentPanel.querySelectorAll('.diff-line.diff-hunk.clickable').forEach(el => {
      el.addEventListener('click', () => this._toggleHunk(parseInt(el.dataset.hunkFrom)));
    });

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
    const panel = this._contentPanel;
    const savedTop = panel ? panel.scrollTop : 0;
    this._renderDiff(this._currentDiffData, savedTop);
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
