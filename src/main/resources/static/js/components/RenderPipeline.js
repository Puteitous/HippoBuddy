import { renderMarkdown } from '../markdown-renderer.js';
import { escapeHtml } from '../utils.js';
import { appState } from '../state/app-state.js';

/**
 * RenderPipeline — 增量渲染管道
 *
 * 核心改进：按 segment 粒度增量更新 DOM，不再全量 replaceChildren。
 * 每个 segment 映射到独立的 render-unit，只有内容变化的单元才重建，
 * 未变化的单元（及其展开/折叠等交互状态）原地保留。
 *
 * DOM 结构：
 *   <div class="render-unit" data-unit="0" data-unit-type="thinking">  ← 单个 segment
 *   <div class="render-unit" data-unit="1" data-unit-type="text">
 *   <div class="render-unit tool-timeline" data-unit="2" data-unit-type="timeline">  ← 连续工具分组
 *     <div class="tool-timeline-item" data-timeline-seg="3">...</div>
 *     <div class="tool-timeline-item" data-timeline-seg="4">...</div>
 *   </div>
 *   <div class="render-unit streaming-region">  ← 始终在末尾
 */
export class RenderPipeline {
  constructor(chatUI, callbacks = {}) {
    this.chatUI = chatUI;

    this._onAfterRender = callbacks.afterRender || null;
    this._onBindAskUserCard = callbacks.bindAskUserCard || null;
    this._onConfirmationClick = callbacks.onConfirmationClick || null;

    this.container = null;

    this._lastRenderTime = 0;
    this._renderThrottleTimer = null;
    this._pendingRender = null;
    this._streamingAnchor = null;
    this._lastSegmentCount = 0;
    this._pendingIsTextOnly = false;
    this._renderVersion = 0;
    this._renderScheduled = false;
    this._flushing = false;
    this._destroyed = false;

    // 增量更新状态
    /** @type {Map<string, string>} key → fingerprint 映射，用于跨渲染轮次识别变化 */
    this._unitFingerprints = new Map();
  }

  // ==================== 指纹 ====================

  /**
   * 计算单个 segment 的指纹，用于检测内容是否变化。
   * 仅包含对渲染输出有影响的关键字段。
   */
  _segFingerprint(idx, seg) {
    if (seg.type === 'thinking') {
      // done 状态切换 + 内容长度 + 末尾采样（避免超长内容全量对比）
      return `T|${seg.done ? '1' : '0'}|${seg.content.length}|${seg.content.slice(-30)}`;
    }
    if (seg.type === 'web-search') {
      // done 状态 + actions 明细都影响渲染（完成态聚合摘要随 output_item.done 的 action 追加而更新）
      const actions = seg.actions || [];
      const actionsSig = actions
        .map(a => `${a.type}:${(a.queries || []).length}:${a.url || ''}:${a.pattern || ''}:${a.status || ''}`)
        .join('|');
      return `W|${seg.done ? '1' : '0'}|${actionsSig}`;
    }
    if (seg.type === 'text') {
      return `X|${seg.content.length}|${seg.content.slice(-30)}`;
    }
    if (seg.type === 'error') {
      return `E|${seg.content.length}|${seg.content.slice(-30)}|${(seg.detail || '').length}|${(seg.detail || '').slice(-30)}`;
    }
    if (seg.type === 'tool') {
      const result = seg.result || 'running';
      const hasConfirm = seg.confirmationData ? '1' : '0';
      const progress = (seg.progressLines || []).length;
      const argsStr = seg.args
        ? (typeof seg.args === 'string' ? seg.args : JSON.stringify(seg.args))
        : '';
      return `TL|${seg.name}|${result}|${hasConfirm}|${progress}|${argsStr.length}|${argsStr.slice(-30)}`;
    }
    return `${idx}`;
  }

  /**
   * 计算整批指纹（用于 scheduleRender 的快速去重）。
   * 包含 tool 段的 result 状态，确保用户点击停止后 tool 状态变化能被检测到，
   * 从而触发增量更新刷新 DOM，不再依赖 _healStuckToolCards 直接操作 DOM。
   */
  _computeFingerprint(segments, currentText) {
    const thinkingDone = segments
      .filter(s => s.type === 'thinking')
      .map(s => `${s.done}:${s.content.length}`)
      .join('|');
    const webSearchDone = segments
      .filter(s => s.type === 'web-search')
      .map(s => {
        const actions = s.actions || [];
        const actionsSig = actions
          .map(a => `${a.type}:${(a.queries || []).length}:${a.url || ''}:${a.pattern || ''}:${a.status || ''}`)
          .join('|');
        return `${s.done ? '1' : '0'}|${actionsSig}`;
      })
      .join('|');
    const toolStatuses = segments
      .filter(s => s.type === 'tool')
      .map(s => `${s.name}:${s.result || 'running'}`)
      .join('|');
    return { segments: segments.length, thinkingDone, webSearchDone, textLen: currentText.length, toolStatuses };
  }

  _fingerprintChanged(f) {
    const last = this._lastFingerprint;
    if (!last) return true;
    return last.segments !== f.segments
      || last.thinkingDone !== f.thinkingDone
      || last.webSearchDone !== f.webSearchDone
      || last.textLen !== f.textLen
      || last.toolStatuses !== f.toolStatuses;
  }

  // ==================== 外部接口 ====================

  setContainer(container) {
    this.container = container;
  }

  markTextOnly() {
    this._pendingIsTextOnly = true;
  }

  scheduleRender(segments, currentText) {
    if (this._flushing) {
      return;
    }

    const fp = this._computeFingerprint(segments, currentText);
    if (!this._fingerprintChanged(fp)) {
      return;
    }

    const THROTTLE_MS = 60;
    const now = Date.now();

    this._pendingRender = { segments, currentText, _isTextOnly: !!this._pendingIsTextOnly };
    this._pendingIsTextOnly = false;

    if (now - this._lastRenderTime >= THROTTLE_MS) {
      this._renderScheduled = false;
      this._lastRenderTime = now;
      this.doRender();
    } else if (!this._renderThrottleTimer) {
      const remaining = THROTTLE_MS - (now - this._lastRenderTime);
      this._renderScheduled = true;
      this._renderThrottleTimer = setTimeout(() => {
        this._renderThrottleTimer = null;
        this._renderScheduled = false;
        this._lastRenderTime = Date.now();
        this.doRender();
      }, remaining);
    }
  }

  flush(segments, currentText) {
    if (segments) {
      this._pendingRender = { segments, currentText, _isTextOnly: false };
    }
    if (this._flushing) {
      return;
    }
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    if (this._pendingRender) {
      this._pendingRender._isTextOnly = false;
      this._lastRenderTime = Date.now();
      this._lastFingerprint = null;
      this._flushing = true;
      this.doRender();
    }
  }

  async renderFinal(segments, currentText) {
    if (this._flushing) {
      this._pendingRender = { segments, currentText };
      return;
    }
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = { segments, currentText };
    await this.doRender();
  }

  // ==================== 渲染计划 ====================

  /**
   * 从 segments 构建渲染计划。
   * 返回 plan 数组，每个元素描述一个 render-unit 的内容。
   * 连续的非特殊 tool segment 合并为一个 timeline 组。
   */
  _buildPlan(segments) {
    const plan = [];
    let timelineItems = [];

    const flushTimeline = () => {
      if (timelineItems.length > 0) {
        // timeline 组的 key 用首个 segIdx 标识
        const key = `tl-${timelineItems[0].segIdx}`;
        plan.push({
          type: 'timeline',
          key,
          items: [...timelineItems],
          // 组指纹 = 所有子项指纹的聚合
          fingerprint: timelineItems.map(i => i.fingerprint).join('|')
        });
        timelineItems = [];
      }
    };

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const fp = this._segFingerprint(i, seg);

      if (seg.type === 'thinking') {
        flushTimeline();
        plan.push({ type: 'thinking', segIdx: i, key: `seg-${i}`, fingerprint: fp });
      } else if (seg.type === 'web-search') {
        flushTimeline();
        plan.push({ type: 'web-search', segIdx: i, key: `seg-${i}`, fingerprint: fp });
      } else if (seg.type === 'text') {
        flushTimeline();
        plan.push({ type: 'text', segIdx: i, key: `seg-${i}`, fingerprint: fp });
      } else if (seg.type === 'error') {
        flushTimeline();
        plan.push({ type: 'error', segIdx: i, key: `seg-${i}`, fingerprint: fp });
      } else if (seg.type === 'tool') {
        if (seg.name === 'todo_write' || seg.name === 'ask_user') {
          flushTimeline();
          plan.push({ type: 'tool-card', segIdx: i, key: `seg-${i}`, fingerprint: fp, toolName: seg.name });
        } else {
          timelineItems.push({ segIdx: i, seg, fingerprint: fp });
        }
      }
    }
    flushTimeline();

    return plan;
  }

  // ==================== 核心渲染 ====================

  async doRender() {
    if (this._destroyed) return;
    this._renderVersion++;
    const renderVersion = this._renderVersion;
    const pending = this._pendingRender;
    if (!pending) {
      return;
    }
    this._pendingRender = null;

    const { segments, currentText, _isTextOnly } = pending;
    const container = this.container;
    if (!container) {
      return;
    }

    // ---- 纯文本快捷路径 ----
    if (_isTextOnly && this._streamingAnchor && this._streamingAnchor.isConnected &&
        this._lastSegmentCount === segments.length) {
      const savedSH = container.scrollHeight;
      const savedST = container.scrollTop;
      if (currentText) {
        const md = await renderMarkdown(currentText);
        if (this._destroyed || renderVersion !== this._renderVersion) return;
        this._streamingAnchor.innerHTML = md;
      } else {
        this._streamingAnchor.innerHTML = '';
      }
      // 内容大量增长时，若用户原在底部附近则自动跟随
      if ((savedSH - savedST - container.clientHeight) < 100 && container.scrollHeight > savedSH) {
        container.scrollTop = container.scrollHeight;
      }
      this._notifyAfterRender(container);
      return;
    }
    this._lastSegmentCount = segments.length;

    // 整批指纹去重
    const fp = this._computeFingerprint(segments, currentText);
    if (!this._fingerprintChanged(fp)) {
      return;
    }
    this._lastFingerprint = fp;

    const chatContainer = container.closest('.chat-container') || container;
    const savedScrollTop = chatContainer.scrollTop;
    const savedScrollHeight = chatContainer.scrollHeight;

    // ---- 构建渲染计划 ----
    const plan = this._buildPlan(segments);

    // ---- 增量同步 DOM ----
    await this._syncDOM(container, plan, segments, currentText, renderVersion);
    if (this._destroyed || renderVersion !== this._renderVersion) return;

    // 更新 streamingAnchor 引用
    this._streamingAnchor = container.querySelector('.streaming-region');

    // ---- 后处理 ----
    // 设置程序化滚动标记，防止 scroll 事件误将这次恢复操作用户上滚
    appState._programmaticScroll = true;
    chatContainer.scrollTop = savedScrollTop;
    appState._programmaticScroll = false;

    // ── todo 卡片展开等 DOM 变更导致 scrollHeight 显著增长时，若用户原在底部附近则自动跟随 ──
    // _animateTodoExpand 会在 _syncDOM 中展开卡片（如 128~400px），导致 scrollHeight 增大，
    // scrollTop 恢复后被"垫高"，距底 > 100px 使 smartScroll 无法跟随。
    // 此处检测：展开前距底 < 100px（在底部附近）且 scrollHeight 增长 → 主动 scrollToBottom
    const newScrollHeight = chatContainer.scrollHeight;
    const wasNearBottom = (savedScrollHeight - savedScrollTop - chatContainer.clientHeight) < 100;
    if (wasNearBottom && newScrollHeight > savedScrollHeight) {
      chatContainer.scrollTop = newScrollHeight;
    }

    const streamingRow = container.querySelector('.thinking-row.streaming .thinking-row-content');
    if (streamingRow) {
      streamingRow.scrollTop = streamingRow.scrollHeight;
    }

    // ⚠️ 必须先绑定 ask-user-card，再绑定通用 tool-card
    // ask-user-card 同时有 tool-card 和 ask-user-card 两个类，
    // 如果先走通用 tool-card 绑定会被标记 data-events-bound，
    // 导致后续 .ask-user-card:not([data-events-bound]) 选择器无法匹配，
    // 造成 option-btn 点击事件永远无法绑定。
    container.querySelectorAll('.ask-user-card:not([data-events-bound])').forEach(card => {
      if (this._onBindAskUserCard) this._onBindAskUserCard(card);
      card.dataset.eventsBound = '1';
    });

    // 事件绑定（只绑定新增/变更的卡片）
    container.querySelectorAll('.tool-card:not([data-events-bound]), .tool-call-card:not([data-events-bound])').forEach(card => {
      if (this.chatUI.bindToolCardEvents) {
        this.chatUI.bindToolCardEvents(card);
      }
      card.dataset.eventsBound = '1';
    });

    container.querySelectorAll('.confirmation-btn:not([data-events-bound])').forEach(btn => {
      if (this._onConfirmationClick) {
        btn.addEventListener('click', this._onConfirmationClick);
      }
      btn.dataset.eventsBound = '1';
    });

    this._notifyAfterRender(container);

    // 处理 flush 期间堆积的 pendingRender
    if (this._pendingRender) {
      this._flushing = false;
      this.flush();
    } else {
      this._flushing = false;
    }
  }

  // ==================== 增量 DOM 同步 ====================

  /**
   * 将渲染计划增量同步到 DOM。
   * 策略：
   *  - 对 plan 中每个 unit，在 container 中按顺序定位对应的 DOM 节点（data-unit key 匹配）
   *  - 指纹未变 → 跳过（保留交互状态）
   *  - 指纹变了 → 只更新该 unit 的内容
   *  - 新增 unit → 在正确位置插入
   *  - 多余的 DOM 节点 → 移除
   */
  async _syncDOM(container, plan, segments, currentText, renderVersion) {
    // 收集现有 render-unit（不含 .streaming-region）
    const existingUnits = [];
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i];
      if (child.classList.contains('streaming-region')) continue;
      if (child.dataset.unit !== undefined) {
        existingUnits.push(child);
      }
    }

    // 建立 key → DOM 映射
    const existingMap = new Map();
    for (const el of existingUnits) {
      existingMap.set(el.dataset.unit, el);
    }

    // 标记所有现有 key，后续移除未匹配的
    const usedKeys = new Set();

    // 第一遍：确定哪些需要更新/新增，渲染 HTML
    const jobs = []; // { key, html, unit, isNew }
    for (const unit of plan) {
      const existingEl = existingMap.get(unit.key);
      usedKeys.add(unit.key);

      if (existingEl) {
        // 检查指纹是否变化（跨渲染轮次对比）
        const oldFp = this._unitFingerprints.get(unit.key);
        if (oldFp === unit.fingerprint) {
          // 指纹未变——跳过
          if (unit.type === 'timeline') {
            // timeline 组内子项可能因 data-fp 变化（独立于组指纹），
            // 但这里组指纹未变说明所有子项也没变，无需检查。
            // 保留原有的 _syncTimelineItems 兜底以防万一：
            const hasChanges = this._syncTimelineItems(existingEl, unit, segments);
            if (hasChanges) {
              this._unitFingerprints.set(unit.key, unit.fingerprint);
            }
          }
          continue;
        }
        // 指纹变了——timeline 组走逐项对比，其他类型走全量替换
        if (unit.type === 'timeline') {
          const hasChanges = this._syncTimelineItems(existingEl, unit, segments);
          if (hasChanges) {
            this._unitFingerprints.set(unit.key, unit.fingerprint);
          }
          // 不加入 jobs——_syncTimelineItems 已处理 DOM 变更，不做 innerHTML 全量替换
        } else {
          jobs.push({ key: unit.key, unit, isNew: false });
        }
      } else {
        // 新增 unit
        jobs.push({ key: unit.key, unit, isNew: true });
      }
    }

    if (jobs.length === 0 && existingMap.size === plan.length) {
      // 没有任何单元变化，但 streaming-region 仍需更新
      await this._updateStreamingRegion(container, currentText, renderVersion);
      return;
    }

    // 第二遍：渲染 HTML（异步，text segment 需要 renderMarkdown）
    for (const job of jobs) {
      const html = await this._renderUnitHtml(job.unit, segments, currentText, renderVersion);
      if (html === null) return; // 渲染被取消
      job.html = html;
    }

    if (this._destroyed || renderVersion !== this._renderVersion) return;

    // 第三遍：应用 DOM 变更
    // 策略：按 plan 顺序遍历，确保每个位置节点正确
    let planIdx = 0;

    // 先移除所有不在 plan 中的多余节点
    for (const [key, el] of existingMap) {
      if (!usedKeys.has(key)) {
        el.remove();
      }
    }

    // 遍历 plan，调整 DOM 顺序
    let childIdx = 0;

    for (const unit of plan) {
      // 跳过非 render-unit 的子元素（如残留节点），找到下一个 render-unit
      while (childIdx < container.children.length) {
        const child = container.children[childIdx];
        if (child.classList.contains('streaming-region')) break;
        if (child.dataset.unit !== undefined) break;
        // 非 render-unit 的残留节点，移除
        const stale = child;
        stale.remove();
        // childIdx 不变，继续检查当前位置
      }

      const existingEl = existingMap.get(unit.key);
      const job = jobs.find(j => j.key === unit.key);

      if (job && job.isNew) {
        // 新增节点：插入到正确位置（在 streaming-region 之前）
        const el = this._createUnitElement(unit, job.html);
        const sr = container.querySelector('.streaming-region');
        if (sr) {
          container.insertBefore(el, sr);
        } else {
          container.appendChild(el);
        }
        existingMap.set(unit.key, el);
        this._unitFingerprints.set(unit.key, unit.fingerprint);
        childIdx++; // 因为新插入了节点，当前位置后移

        // 对 todo 卡片：触发展开动画（从折叠 → 展开，触发 CSS transition）
        if (unit.toolName === 'todo_write') {
          this._animateTodoExpand(el);
        }
      } else if (existingEl) {
        if (job) {
          // 对 tool-card 类型，保存展开/折叠交互状态，避免 innerHTML 替换丢失
          let savedCardState = null;
          if (unit.type === 'tool-card') {
            savedCardState = this._saveToolCardState(existingEl);
          }

          // 更新内容（替换 innerHTML）
          existingEl.innerHTML = job.html;

          // 恢复 tool-card 交互状态
          if (unit.type === 'tool-card' && savedCardState) {
            this._restoreToolCardState(existingEl, savedCardState);
          }

          // 对 todo_write：如果新渲染需要默认展开但被旧状态覆盖了，触发展开动画
          if (unit.toolName === 'todo_write') {
            const seg = segments[unit.segIdx];
            if (seg && seg.defaultExpanded) {
              this._animateTodoExpand(existingEl);
            }
          }

          // 恢复关键 class
          if (unit.type === 'timeline') {
            existingEl.className = 'render-unit tool-timeline';
            // 重新标记 timeline items 的 data-timeline-seg
            this._tagTimelineItemsInEl(existingEl, unit);
          } else {
            existingEl.className = 'render-unit';
          }
          existingEl.dataset.unitType = unit.type;
          this._unitFingerprints.set(unit.key, unit.fingerprint);
        }
        // 确保位置正确
        const currentPos = Array.from(container.children).indexOf(existingEl);
        if (currentPos !== childIdx) {
          const refChild = childIdx < container.children.length ? container.children[childIdx] : null;
          if (refChild !== existingEl) {
            container.insertBefore(existingEl, refChild);
          }
        }
        childIdx++;
      }
    }

    // 移除末尾多余的非 streaming 节点
    while (childIdx < container.children.length) {
      const child = container.children[childIdx];
      if (child.classList.contains('streaming-region')) break;
      child.remove();
    }

    // ---- 更新 streaming-region ----
    await this._updateStreamingRegion(container, currentText, renderVersion);
  }

  /**
   * 更新 streaming-region 的内容
   */
  async _updateStreamingRegion(container, currentText, renderVersion) {
    let sr = container.querySelector('.streaming-region');
    if (!sr) {
      sr = document.createElement('div');
      sr.className = 'streaming-region';
      container.appendChild(sr);
    }
    if (currentText) {
      const md = await renderMarkdown(currentText);
      if (this._destroyed || renderVersion !== this._renderVersion) return;
      sr.innerHTML = md;
    } else {
      sr.innerHTML = '';
    }
  }

  /**
   * 创建 render-unit 的 DOM 元素
   */
  _createUnitElement(unit, html) {
    const el = document.createElement('div');
    el.dataset.unit = unit.key;
    el.dataset.unitType = unit.type;
    if (unit.type === 'timeline') {
      el.className = 'render-unit tool-timeline';
    } else {
      el.className = 'render-unit';
    }
    el.innerHTML = html;

    // 为 timeline 内的每个 tool-timeline-item 标记 data-timeline-seg
    if (unit.type === 'timeline') {
      this._tagTimelineItemsInEl(el, unit);
    }

    return el;
  }

  /**
   * 渲染单个 plan unit 的 HTML 内容。
   * 不包含外层 render-unit 包裹。
   */
  async _renderUnitHtml(unit, segments, currentText, renderVersion) {
    if (unit.type === 'thinking') {
      const seg = segments[unit.segIdx];
      return RenderPipeline.renderThinkingBubble(seg);
    }

    if (unit.type === 'web-search') {
      const seg = segments[unit.segIdx];
      return RenderPipeline.renderWebSearchRow(seg);
    }

    if (unit.type === 'text') {
      const seg = segments[unit.segIdx];
      if (seg.content) {
        const md = await renderMarkdown(seg.content);
        if (this._destroyed || renderVersion !== this._renderVersion) return null;
        return md;
      }
      return '';
    }

    if (unit.type === 'error') {
      const seg = segments[unit.segIdx];
      return RenderPipeline.renderErrorBlock(seg);
    }

    if (unit.type === 'warn') {
      const seg = segments[unit.segIdx];
      return RenderPipeline.renderWarnBlock(seg);
    }

    if (unit.type === 'tool-card') {
      const seg = segments[unit.segIdx];
      return this.chatUI.renderToolCard(seg);
    }

    if (unit.type === 'timeline') {
      let html = '';
      for (const item of unit.items) {
        const seg = segments[item.segIdx];
        html += this.chatUI.renderToolTimelineRow(seg);
      }
      return html;
    }

    return '';
  }

  /**
   * 同步 timeline 组内部的 tool-timeline-item。
   * 只更新有变化的 item，保留未变化的 item（及展开状态）。
   * @returns {boolean} 是否有任何 item 发生了变化
   */
  _syncTimelineItems(timelineEl, unit, segments) {
    let changed = false;

    // 收集现有 items — 优先用 data-timeline-seg 定位，没有则按位置回退
    const itemMap = new Map();
    for (let i = 0; i < timelineEl.children.length; i++) {
      const child = timelineEl.children[i];
      let segIdx = child.dataset.timelineSeg;
      if (segIdx !== undefined) {
        itemMap.set(parseInt(segIdx), child);
      } else if (i < unit.items.length) {
        // 回退：按位置推断 segIdx
        segIdx = unit.items[i].segIdx;
        child.dataset.timelineSeg = String(segIdx);
        itemMap.set(segIdx, child);
      }
    }

    // 新 plan 中的 items
    const newItemKeys = new Set();

    for (const item of unit.items) {
      newItemKeys.add(item.segIdx);
      const existingItem = itemMap.get(item.segIdx);
      if (!existingItem) {
        // 新增 item — 追加到 timeline 末尾
        const seg = segments[item.segIdx];
        const html = this._tagTimelineItem(item.segIdx, item.fingerprint, this.chatUI.renderToolTimelineRow(seg));
        timelineEl.insertAdjacentHTML('beforeend', html);
        changed = true;
        continue;
      }

      // 检查 fingerprint 变化
      const oldFp = existingItem.dataset.fp;
      if (oldFp !== item.fingerprint) {
        // 替换前保存展开状态（expanded class + max-height），
        // 避免工具仍在运行中（progress/result 变化触发指纹变更）时，
        // outerHTML 替换导致用户已展开的详情被自动收起
        const wasExpanded = existingItem.classList.contains('expanded');
        const oldStatus = existingItem.dataset.toolStatus || '';
        let savedDetailMaxHeight = null;
        if (wasExpanded) {
          const detailEl = existingItem.querySelector('.tool-timeline-detail');
          if (detailEl) {
            savedDetailMaxHeight = detailEl.style.maxHeight || null;
          }
        }

        // 替换该 item
        const seg = segments[item.segIdx];
        existingItem.outerHTML = this._tagTimelineItem(item.segIdx, item.fingerprint, this.chatUI.renderToolTimelineRow(seg));

        // 恢复展开状态
        // 但如果是从 pending_confirmation（待确认）变为其他状态（确认通过/拒绝），
        // 说明内容已从"确认按钮"切换为"执行结果"，不应保持展开。
        const isConfirmResolved = oldStatus === 'pending_confirmation';
        if (wasExpanded && !isConfirmResolved) {
          const newItem = timelineEl.querySelector(`[data-timeline-seg="${item.segIdx}"]`);
          if (newItem) {
            newItem.classList.add('expanded');
            if (savedDetailMaxHeight) {
              const newDetail = newItem.querySelector('.tool-timeline-detail');
              if (newDetail) {
                newDetail.style.maxHeight = savedDetailMaxHeight;
              }
            }
          }
        }
        changed = true;
      }
    }

    // 移除多余的 items
    for (const [segIdx, el] of itemMap) {
      if (!newItemKeys.has(segIdx)) {
        el.remove();
        changed = true;
      }
    }

    // 为所有 items 更新 fingerprint（新创建的已在上面的 _tagTimelineItem 中设置）
    for (const item of unit.items) {
      const itemEl = timelineEl.querySelector(`[data-timeline-seg="${item.segIdx}"]`);
      if (itemEl && !itemEl.dataset.fp) {
        itemEl.dataset.fp = item.fingerprint;
      }
    }

    return changed;
  }

  /**
   * 给 tool-timeline-item 的 HTML 添加 data-timeline-seg 和 data-fp 属性。
   * 注意：不能用 replace('<div class="tool-timeline-item', ...) 的方式注入，
   * 因为原始 HTML 可能在 class 后还有其他属性（如 expanded、no-detail），
   * 字符串替换会把 class 值截断，导致 expanded 等类名游离在 class 属性之外。
   * 正确做法：找到开标签的末尾 >，在 > 前注入属性。
   */
  _tagTimelineItem(segIdx, fp, html) {
    const tagEnd = html.indexOf('>');
    if (tagEnd === -1) return html;
    const attrs = ` data-timeline-seg="${segIdx}" data-fp="${escapeHtml(fp)}"`;
    return html.slice(0, tagEnd) + attrs + html.slice(tagEnd);
  }

  /**
   * 对 todo 卡片触发展开。
   * 直接设 max-height，不做折叠→展开动画。
   * 动画过程中 scrollHeight 渐变会导致滚动跟随丢失。
   */
  _animateTodoExpand(renderUnitEl) {
    const card = renderUnitEl.querySelector('.todo-card');
    if (!card || !card.classList.contains('expanded')) return;
    const details = card.querySelector('.tool-call-details');
    if (!details) return;

    const h = details.scrollHeight;
    if (h <= 0) return;
    const isCapped = h > 400;
    details.style.maxHeight = isCapped ? '400px' : h + 'px';
  }

  /**
   * 给已存在的 DOM 元素内的 timeline items 标记 data-timeline-seg
   */
  _tagTimelineItemsInEl(el, unit) {
    const items = el.querySelectorAll('.tool-timeline-item');
    for (let i = 0; i < items.length && i < unit.items.length; i++) {
      const item = unit.items[i];
      items[i].dataset.timelineSeg = String(item.segIdx);
      items[i].dataset.fp = item.fingerprint;
    }
  }

  // ==================== tool-card 交互状态保存/恢复 ====================

  /**
   * 保存 tool-card 的交互状态（展开/折叠、todo 树节点折叠），
   * 用于 innerHTML 替换后恢复，避免用户交互状态丢失。
   */
  _saveToolCardState(renderUnitEl) {
    const card = renderUnitEl.querySelector('.tool-card');
    if (!card) return null;

    const state = {};

    // 1. 卡片整体展开状态（expanded class + max-height）
    state.cardExpanded = card.classList.contains('expanded');
    const details = card.querySelector('.tool-call-details');
    if (details) {
      state.detailMaxHeight = details.style.maxHeight || null;
    }

    // 2. todo 树节点折叠状态（按 DFS 顺序保存 collapsed class）
    state.todoCollapsed = [];
    const treeItems = card.querySelectorAll('.todo-tree-item');
    treeItems.forEach(item => {
      state.todoCollapsed.push(item.classList.contains('collapsed'));
    });

    return state;
  }

  /**
   * 恢复 tool-card 的交互状态
   */
  _restoreToolCardState(renderUnitEl, state) {
    if (!state) return;

    const card = renderUnitEl.querySelector('.tool-card');
    if (!card) return;

    // 1. 恢复卡片整体展开状态
    if (state.cardExpanded) {
      card.classList.add('expanded');
      if (state.detailMaxHeight) {
        const details = card.querySelector('.tool-call-details');
        if (details) {
          details.style.maxHeight = state.detailMaxHeight;
        }
      }
    }

    // 2. 恢复 todo 树节点折叠状态（按 DFS 顺序匹配）
    if (state.todoCollapsed && state.todoCollapsed.length > 0) {
      const treeItems = card.querySelectorAll('.todo-tree-item');
      let idx = 0;
      treeItems.forEach(item => {
        if (idx < state.todoCollapsed.length && state.todoCollapsed[idx]) {
          item.classList.add('collapsed');
        }
        idx++;
      });
    }
  }

  // ==================== 后处理 ====================

  _notifyAfterRender(container) {
    if (this._onAfterRender) {
      this._onAfterRender(container);
    }
  }

  // ==================== 静态工具 ====================

  static renderThinkingBubble(segment) {
    const normalized = segment.content.replace(/\n{2,}/g, '\n');
    const escapedContent = escapeHtml(normalized);
    const thinkSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';

    if (segment.done) {
      return `
        <div class="thinking-row completed">
          <div class="thinking-row-header" onclick="window.toggleThinkingRow(this)">
            <span class="thinking-row-icon">${thinkSvg}</span>
            <span class="thinking-row-label">${window.i18n.t('render.thinkingDone')}</span>
          </div>
          <div class="thinking-row-content">${escapedContent}</div>
        </div>`;
    }

    return `
      <div class="thinking-row streaming">
        <div class="thinking-row-header">
          <span class="thinking-row-icon">${thinkSvg}</span>
          <span class="thinking-row-label">${window.i18n.t('render.thinking')}</span>
        </div>
        <div class="thinking-row-content">${escapedContent}</div>
      </div>`;
  }

  /**
   * 渲染服务端联网搜索标记（Responses API web_search 内置工具）。
   * 轻量状态行：进行中显示「正在联网搜索…」，完成显示「已联网搜索」。
   * 完成态若携带 action 明细（search 搜索词 / open_page 网页 / find_in_page 页内查找），
   * 聚合成摘要行（如「已联网搜索 · 3 个关键词 · 打开 4 个网页」）；无 action 时回退旧文案。
   * 不模拟 tool 卡片（不含搜索结果正文/来源摘要，仅元数据）。
   */
  static renderWebSearchRow(segment) {
    const searchSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
    const chevronSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    if (segment.done) {
      const details = RenderPipeline._buildWebSearchDetails(segment);
      const toggleable = details.length > 0;
      return `
        <div class="web-search-row completed">
          <div class="web-search-row-header${toggleable ? ' toggleable' : ''}" ${toggleable ? `onclick="window.toggleWebSearchRow(this)" title="${window.i18n.t('render.webSearchToggleHint')}"` : ''}>
            <span class="web-search-row-icon">${searchSvg}</span>
            <span class="web-search-row-label">${RenderPipeline._buildWebSearchSummary(segment)}</span>
            ${toggleable ? `<span class="web-search-row-chevron">${chevronSvg}</span>` : ''}
          </div>
          ${details}
        </div>`;
    }
    return `
      <div class="web-search-row streaming">
        <div class="web-search-row-header">
          <span class="web-search-row-icon">${searchSvg}</span>
          <span class="web-search-row-label">${window.i18n.t('render.webSearching')}</span>
        </div>
      </div>`;
  }

  /**
   * 渲染统一错误块（.msg-error：❌ 图标 + 加粗标题 + 小字 detail）。
   * segment 结构：{ type:'error', content: 主文案, detail: 原始详情（可选） }。
   * 与 MessageSession catch 兜底共用同一模板，保证 5 种错误形态视觉一致。
   */
  static renderErrorBlock(segment) {
    const title = escapeHtml(segment.content || '');
    const detail = segment.detail ? escapeHtml(segment.detail) : '';
    return `
      <div class="msg-error">
        <span class="msg-error-icon">❌</span>
        <div class="msg-error-body">
          <div class="msg-error-title">${title}</div>
          ${detail ? `<div class="msg-error-detail">${detail}</div>` : ''}
        </div>
      </div>`;
  }

  /**
   * 渲染统一警示块（.msg-warn：⚠️ 图标 + 加粗标题 + 小字 detail）。
   * segment 结构：{ type:'warn', content: 主文案, detail: 详情（可选） }。
   * 用于非错误但需要提醒的场景，如达到 MAX_TURNS 工具调用轮数上限。
   */
  static renderWarnBlock(segment) {
    const title = escapeHtml(segment.content || '');
    const detail = segment.detail ? escapeHtml(segment.detail) : '';
    return `
      <div class="msg-warn">
        <span class="msg-warn-icon">⚠️</span>
        <div class="msg-warn-body">
          <div class="msg-warn-title">${title}</div>
          ${detail ? `<div class="msg-warn-detail">${detail}</div>` : ''}
        </div>
      </div>`;
  }

  /**
   * 生成联网搜索完成态的展开详情（点击摘要行展开查看具体内容）。
   * 按动作类型分组：搜索关键词（queries）/ 打开的网页（url）/ 页内查找（url + pattern）。
   * 无 action 时不生成详情容器（旧会话兼容，行不可展开）。
   */
  static _buildWebSearchDetails(segment) {
    const actions = (segment && segment.actions) || [];
    if (!actions.length) return '';
    const groups = [];
    const queries = [];
    const pages = [];
    const finds = [];
    for (const action of actions) {
      if (!action || !action.type) continue;
      if (action.type === 'search') {
        if (Array.isArray(action.queries)) {
          for (const q of action.queries) {
            if (q && q.length > 0) queries.push(escapeHtml(q));
          }
        }
      } else if (action.type === 'open_page') {
        pages.push({ url: RenderPipeline._stripWsCallId(action.url), failed: action.status === 'failed' });
      } else if (action.type === 'find_in_page') {
        finds.push({
          url: RenderPipeline._stripWsCallId(action.url),
          pattern: action.pattern || '',
          failed: action.status === 'failed'
        });
      }
    }
    if (queries.length) {
      groups.push(`<div class="web-search-detail-group">
        <div class="web-search-detail-title">${window.i18n.t('render.webSearchDetailQueries')}</div>
        ${queries.map(q => `<div class="web-search-detail-item">${q}</div>`).join('')}
      </div>`);
    }
    if (pages.length) {
      groups.push(`<div class="web-search-detail-group">
        <div class="web-search-detail-title">${window.i18n.t('render.webSearchDetailPages')}</div>
        ${pages.map(p => `<div class="web-search-detail-item${p.failed ? ' failed' : ''}">${RenderPipeline._buildWebUrlLink(p.url)}${p.failed ? window.i18n.t('render.webSearchDetailFailed') : ''}</div>`).join('')}
      </div>`);
    }
    if (finds.length) {
      groups.push(`<div class="web-search-detail-group">
        <div class="web-search-detail-title">${window.i18n.t('render.webSearchDetailFinds')}</div>
        ${finds.map(f => `<div class="web-search-detail-item${f.failed ? ' failed' : ''}">${RenderPipeline._buildWebUrlLink(f.url)}${f.pattern ? ` · ${escapeHtml(f.pattern)}` : ''}${f.failed ? window.i18n.t('render.webSearchDetailFailed') : ''}</div>`).join('')}
      </div>`);
    }
    if (!groups.length) return '';
    return `<div class="web-search-row-detail">${groups.join('')}</div>`;
  }

  /** 剥掉服务端附加的 #ws_call_id=xxx 尾巴（展示用）。 */
  static _stripWsCallId(url) {
    if (!url) return '';
    return url.replace(/#ws_call_id=[^#]*$/, '');
  }

  /** 超长 URL 截断（60 字符 + 省略号）。 */
  static _truncateUrl(url) {
    if (!url) return '';
    return url.length > 60 ? url.slice(0, 60) + '…' : url;
  }

  /**
   * 生成可点击的网页链接（打开网页 / 页内查找条目用）。
   * <p>
   * 安全防御：
   * <ul>
   *   <li>仅 http/https 协议生成 &lt;a&gt;，其余协议（如 javascript:）回退纯文本展示</li>
   *   <li>href 与显示文本均 escapeHtml；显示文本超长截断，href 用完整地址</li>
   *   <li>target=_blank 配 rel=noopener noreferrer（防 tabnabbing）</li>
   * </ul>
   * </p>
   */
  static _buildWebUrlLink(url) {
    if (!url) return '';
    const display = escapeHtml(RenderPipeline._truncateUrl(url));
    if (!/^https?:\/\//i.test(url)) return display;
    const href = escapeHtml(url);
    return `<a class="web-search-detail-link" href="${href}" target="_blank" rel="noopener noreferrer">${display}</a>`;
  }

  /**
   * 生成联网搜索完成态的聚合摘要。
   * 统计 actions 中的搜索词数（search.queries 累计）、成功打开的网页数（open_page 且非 failed）、
   * 页内查找次数（find_in_page 且非 failed）；无 actions 或无有效计数时回退「已联网搜索」。
   */
  static _buildWebSearchSummary(segment) {
    const actions = (segment && segment.actions) || [];
    if (!actions.length) {
      return window.i18n.t('render.webSearchDone');
    }
    let queryCount = 0;
    let openCount = 0;
    let findCount = 0;
    for (const action of actions) {
      if (!action || !action.type) continue;
      if (action.type === 'search') {
        queryCount += Array.isArray(action.queries) ? action.queries.length : 0;
      } else if (action.type === 'open_page') {
        // failed 动作不计入成功打开数
        if (action.status !== 'failed') openCount++;
      } else if (action.type === 'find_in_page') {
        if (action.status !== 'failed') findCount++;
      }
    }
    const parts = [];
    if (queryCount > 0) {
      parts.push(queryCount === 1
        ? window.i18n.t('render.webSearchQueryOne')
        : window.i18n.t('render.webSearchQueries', { n: queryCount }));
    }
    if (openCount > 0) {
      parts.push(openCount === 1
        ? window.i18n.t('render.webSearchOpenPageOne')
        : window.i18n.t('render.webSearchOpenPages', { n: openCount }));
    }
    if (findCount > 0) {
      parts.push(findCount === 1
        ? window.i18n.t('render.webSearchFindPageOne')
        : window.i18n.t('render.webSearchFindPages', { n: findCount }));
    }
    if (!parts.length) {
      return window.i18n.t('render.webSearchDone');
    }
    return window.i18n.t('render.webSearchSummary', { detail: parts.join('') });
  }

  // ==================== 生命周期 ====================

  destroy() {
    this._destroyed = true;
    if (this._renderThrottleTimer) {
      clearTimeout(this._renderThrottleTimer);
      this._renderThrottleTimer = null;
    }
    this._pendingRender = null;
    this._unitFingerprints.clear();
    this.container = null;
  }
}
