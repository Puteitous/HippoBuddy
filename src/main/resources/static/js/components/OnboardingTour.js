/**
 * OnboardingTour — 新手指引聚光灯导览
 *
 * 功能：
 *   - 首次启动时展示 5 步聚光灯引导
 *   - 高亮核心功能区域 + 气泡说明
 *   - 可随时跳过，localStorage 记录完成状态
 *
 * 流程：
 *   ① 顶部工具栏 → ② 对话输入区 → ③ 会话工具栏 → ④ 会话列表 → ⑤ 活动栏
 *
 * 使用：
 *   const tour = new OnboardingTour();
 *   tour.start();
 */

const STORAGE_KEY = 'hippo-onboarding-done';

export class OnboardingTour {
  constructor() {
    this.steps = this._buildSteps();
    this.currentIndex = 0;
    this._elements = {};   // { overlay, spotlight, tooltip, arrow }
    this._active = false;
    this._animating = false;
  }

  // ── 步骤定义 ──
  _buildSteps() {
    return [
      {
        id: 'header',
        type: 'spotlight',
        target: () => document.querySelector('.header-actions'),
        titleKey: 'onboarding.headerTitle',
        descKey: 'onboarding.headerDesc',
        tooltipPosition: 'below',
      },
      {
        id: 'chat',
        type: 'spotlight',
        target: () => {
          // 从 logo 顶部到输入框底部（宽度取容器完整范围）
          const emptyState = document.querySelector('.empty-state');
          if (emptyState) {
            const logo = emptyState.querySelector('.empty-hero-logo');
            const inputArea = emptyState.querySelector('.empty-hero-input-area');
            if (logo && inputArea) {
              const er = emptyState.getBoundingClientRect();
              const lr = logo.getBoundingClientRect();
              const ir = inputArea.getBoundingClientRect();
              return {
                getBoundingClientRect: () => ({
                  left: er.left,
                  top: lr.top,
                  right: er.right,
                  bottom: ir.bottom,
                  width: er.width,
                  height: ir.bottom - lr.top,
                })
              };
            }
          }
          // 降级
          return document.getElementById('messageInput')?.closest('.chat-input-area')
            || document.querySelector('.chat-input-container');
        },
        titleKey: 'onboarding.chatTitle',
        descKey: 'onboarding.chatDesc',
        tooltipPosition: 'above',
      },
      {
        id: 'session',
        type: 'spotlight',
        target: () => document.querySelector('.session-toolbar'),
        titleKey: 'onboarding.sessionTitle',
        descKey: 'onboarding.sessionDesc',
        tooltipPosition: 'right',
      },
      {
        id: 'session-list',
        type: 'spotlight',
        target: () => {
          const panel = document.getElementById('sessionPanel');
          if (!panel) return null;
          const header = panel.querySelector('.session-header');
          // 优先用 session-list，若隐藏（文件视图）则改用 file-tree-view
          let list = panel.querySelector('.session-list');
          if (list && list.offsetParent === null) {
            list = panel.querySelector('.file-tree-view');
          }
          if (header && list && list.offsetParent !== null) {
            const hr = header.getBoundingClientRect();
            const lr = list.getBoundingClientRect();
            return {
              getBoundingClientRect: () => ({
                left: Math.min(hr.left, lr.left),
                top: hr.top,
                right: Math.max(hr.right, lr.right),
                bottom: lr.bottom,
                width: Math.max(hr.right, lr.right) - Math.min(hr.left, lr.left),
                height: lr.bottom - hr.top,
              })
            };
          }
          return panel;
        },
        titleKey: 'onboarding.sessionListTitle',
        descKey: 'onboarding.sessionListDesc',
        tooltipPosition: 'right',
      },
      {
        id: 'tools',
        type: 'spotlight',
        target: () => document.getElementById('activityBar'),
        titleKey: 'onboarding.toolsTitle',
        descKey: 'onboarding.toolsDesc',
        tooltipPosition: 'right',
      },
    ];
  }

  // ── 入口 ──
  start() {
    if (this._active) return;
    // 检查是否已完成引导
    if (localStorage.getItem(STORAGE_KEY)) return;
    // 等 DOM 稳定后启动
    if (document.readyState === 'complete') {
      this._init();
    } else {
      window.addEventListener('load', () => this._init());
    }
  }

  /** 重置（调试用） */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── 初始化 ──
  _init() {
    this._active = true;
    this.currentIndex = 0;
    this._createOverlay();
    this._renderStep(0);
  }

  // ── 创建遮罩 ──
  _createOverlay() {
    // 遮罩
    const overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.id = 'obOverlay';
    document.body.appendChild(overlay);
    this._elements.overlay = overlay;

    // 聚光灯
    const spotlight = document.createElement('div');
    spotlight.className = 'ob-spotlight';
    spotlight.id = 'obSpotlight';
    document.body.appendChild(spotlight);
    this._elements.spotlight = spotlight;

    // 箭头
    const arrow = document.createElement('div');
    arrow.className = 'ob-arrow';
    arrow.id = 'obArrow';
    document.body.appendChild(arrow);
    this._elements.arrow = arrow;
  }

  // ── 渲染步骤 ──
  _renderStep(index) {
    if (this._animating) return;
    const step = this.steps[index];
    if (!step) {
      this._finish();
      return;
    }

    this._animating = true;

    // 清除旧内容
    this._removeDynamicElements();

    this._renderSpotlight(step, index);

    this.currentIndex = index;
    this._animating = false;
  }

  // ── 聚光灯步骤 ──
  _renderSpotlight(step, stepIndex) {
    const targetEl = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
    if (!targetEl) {
      console.warn(`[Onboarding] 未找到目标元素: ${step.id}`);
      this._goTo(this.currentIndex + 1);
      return;
    }

    // 显示聚光灯和箭头
    this._elements.spotlight.style.display = '';
    this._elements.arrow.style.display = '';

    // 定位聚光灯
    this._positionSpotlight(targetEl);

    // 创建气泡
    const tooltip = document.createElement('div');
    tooltip.className = 'ob-tooltip';
    tooltip.id = 'obTooltip';

    const $t = (k) => window.i18n ? window.i18n.t(k) : k;
    const title = $t(step.titleKey);
    const desc = $t(step.descKey);

    const prevBtnHtml = stepIndex > 0
      ? `<button class="ob-btn ob-btn-prev" id="obPrevBtn">${$t('onboarding.prev')}</button>`
      : '';

    tooltip.innerHTML = `
      <div class="ob-tooltip-title">${title}</div>
      <div class="ob-tooltip-desc">${desc}</div>
      <div class="ob-tooltip-actions">
        <span class="ob-step-counter">${stepIndex + 1} / ${this.steps.length}</span>
        <div class="ob-btn-group">
          ${prevBtnHtml}
          <button class="ob-btn ob-btn-skip" id="obSkipBtn">${$t('onboarding.skip')}</button>
          <button class="ob-btn ob-btn-next" id="obNextBtn">${stepIndex < this.steps.length - 1 ? $t('onboarding.next') : $t('onboarding.done')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(tooltip);
    this._elements.tooltip = tooltip;

    // 定位气泡 + 箭头
    this._positionTooltip(tooltip, targetEl, step.tooltipPosition);

    // 绑定事件
    document.getElementById('obSkipBtn').addEventListener('click', () => this._finish());
    document.getElementById('obNextBtn').addEventListener('click', () => {
      this._goTo(stepIndex + 1);
    });
    const prevBtn = document.getElementById('obPrevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this._goTo(stepIndex - 1);
      });
    }
  }

  // ── 聚光灯定位 ──
  _positionSpotlight(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const padding = 6;
    const el = this._elements.spotlight;

    el.style.left = (rect.left - padding) + 'px';
    el.style.top = (rect.top - padding) + 'px';
    el.style.width = (rect.width + padding * 2) + 'px';
    el.style.height = (rect.height + padding * 2) + 'px';
  }

  // ── 工具：获取目标元素的定位 Rect（含聚光灯 padding，不依赖聚光灯 DOM） ──
  _getTargetRect(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const padding = 6;
    return {
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  }

  // ── 气泡+箭头定位（基于 targetEl，不依赖聚光灯 DOM 位置） ──
  _positionTooltip(tooltip, targetEl, position) {
    const r = this._getTargetRect(targetEl);
    const gap = 14;
    const arrow = this._elements.arrow;
    const arrowSize = 12;

    let top, left, arrowTop, arrowLeft, arrowRotation;

    // 先设为 visible 以便获取尺寸，但 opacity 0 防闪烁
    tooltip.style.opacity = '0';
    tooltip.style.visibility = 'hidden';
    // 强制回流获取尺寸
    const tW = tooltip.offsetWidth;
    const tH = tooltip.offsetHeight;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    switch (position) {
      case 'above': {
        top = r.top - gap - tH;
        left = r.centerX - tW / 2;
        arrowTop = r.top - gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '135deg';
        break;
      }
      case 'below': {
        top = r.bottom + gap;
        left = r.centerX - tW / 2;
        arrowTop = r.bottom + gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '-45deg';
        break;
      }
      case 'right': {
        top = r.centerY - tH / 2;
        left = r.right + gap;
        arrowTop = r.centerY - arrowSize / 2;
        arrowLeft = r.right + gap - arrowSize / 2;
        arrowRotation = '45deg';
        break;
      }
      case 'left': {
        top = r.centerY - tH / 2;
        left = r.left - gap - tW;
        arrowTop = r.centerY - arrowSize / 2;
        arrowLeft = r.left - gap - arrowSize / 2;
        arrowRotation = '-135deg';
        break;
      }
      default: {
        top = r.bottom + gap;
        left = r.centerX - tW / 2;
        arrowTop = r.bottom + gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '-45deg';
      }
    }

    // 边界修正（防止溢出屏幕）
    const margin = 12;
    if (left < margin) left = margin;
    if (left + tW > viewW - margin) left = viewW - margin - tW;
    if (top < margin) top = margin;
    if (top + tH > viewH - margin) top = viewH - margin - tH;

    // 箭头边界修正（与 tooltip 同步）
    if (arrowLeft < margin) arrowLeft = margin;
    if (arrowLeft + arrowSize > viewW - margin) arrowLeft = viewW - margin - arrowSize;
    if (arrowTop < margin) arrowTop = margin;
    if (arrowTop + arrowSize > viewH - margin) arrowTop = viewH - margin - arrowSize;

    // 应用位置
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '';
    tooltip.style.visibility = '';

    // 箭头位置
    arrow.style.left = arrowLeft + 'px';
    arrow.style.top = arrowTop + 'px';
    arrow.style.transform = `rotate(${arrowRotation})`;

    // 窗口 resize 时重新定位
    this._resizeHandler = () => {
      const newR = this._getTargetRect(targetEl);
      this._positionSpotlight(targetEl);
      this._repositionOnResize(tooltip, newR, position);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  _repositionOnResize(tooltip, r, position) {
    if (!tooltip || !r) return;
    const gap = 14;
    const arrow = this._elements.arrow;
    const arrowSize = 12;
    const tW = tooltip.offsetWidth;
    const tH = tooltip.offsetHeight;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const margin = 12;

    let top, left, arrowTop, arrowLeft, arrowRotation;

    switch (position) {
      case 'above':
        top = r.top - gap - tH;
        left = r.centerX - tW / 2;
        arrowTop = r.top - gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '135deg';
        break;
      case 'below':
        top = r.bottom + gap;
        left = r.centerX - tW / 2;
        arrowTop = r.bottom + gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '-45deg';
        break;
      case 'right':
        top = r.centerY - tH / 2;
        left = r.right + gap;
        arrowTop = r.centerY - arrowSize / 2;
        arrowLeft = r.right + gap - arrowSize / 2;
        arrowRotation = '45deg';
        break;
      case 'left':
        top = r.centerY - tH / 2;
        left = r.left - gap - tW;
        arrowTop = r.centerY - arrowSize / 2;
        arrowLeft = r.left - gap - arrowSize / 2;
        arrowRotation = '-135deg';
        break;
      default:
        top = r.bottom + gap;
        left = r.centerX - tW / 2;
        arrowTop = r.bottom + gap - arrowSize / 2;
        arrowLeft = r.centerX - arrowSize / 2;
        arrowRotation = '-45deg';
    }

    if (left < margin) left = margin;
    if (left + tW > viewW - margin) left = viewW - margin - tW;
    if (top < margin) top = margin;
    if (top + tH > viewH - margin) top = viewH - margin - tH;

    // 箭头边界修正（与 tooltip 同步）
    if (arrowLeft < margin) arrowLeft = margin;
    if (arrowLeft + arrowSize > viewW - margin) arrowLeft = viewW - margin - arrowSize;
    if (arrowTop < margin) arrowTop = margin;
    if (arrowTop + arrowSize > viewH - margin) arrowTop = viewH - margin - arrowSize;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    arrow.style.left = arrowLeft + 'px';
    arrow.style.top = arrowTop + 'px';
    arrow.style.transform = `rotate(${arrowRotation})`;
  }

  // ── 跳转 ──
  _goTo(index) {
    if (index >= this.steps.length) {
      this._finish();
      return;
    }
    // 清除 resize 监听
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this._renderStep(index);
  }

  // ── 移除动态元素 ──
  _removeDynamicElements() {
    if (this._elements.tooltip) {
      this._elements.tooltip.remove();
      this._elements.tooltip = null;
    }
  }

  // ── 结束引导 ──
  _finish() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this._cleanup();
    localStorage.setItem(STORAGE_KEY, '1');
    this._active = false;
  }

  _cleanup() {
    this._removeDynamicElements();
    if (this._elements.overlay) {
      this._elements.overlay.remove();
      this._elements.overlay = null;
    }
    if (this._elements.spotlight) {
      this._elements.spotlight.remove();
      this._elements.spotlight = null;
    }
    if (this._elements.tooltip) {
      this._elements.tooltip.remove();
      this._elements.tooltip = null;
    }
    if (this._elements.arrow) {
      this._elements.arrow.remove();
      this._elements.arrow = null;
    }
  }
}
