/**
 * 模式预设模块 — 管理多模式（chat/office/coding）的预设提示词和 UI 切换
 */
import { appState } from '../../state/app-state.js';

// ── i18n 辅助 ──
const _ = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

// ── 多模式预设提示词 ──
export const MODE_PRESETS = {
  chat: [
    { label: () => _('preset.brainstorm'), icon: 'M12 2a5 5 0 0 0-5 5c0 2 1 3.5 2.5 4.5V15a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3.5C16 10.5 17 9 17 7a5 5 0 0 0-5-5z M9 17h6', prompt: () => _('preset.prompt.brainstorm') },
    { label: () => _('preset.polish'), icon: 'M17 3a2 2 0 0 1 2 2L9 15l-4 1 1-4Z M15 5l4 4', prompt: () => _('preset.prompt.polish') },
    { label: () => _('preset.explain'), icon: 'M4 6h16v14H4z M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2', prompt: () => _('preset.prompt.explain') },
    { label: () => _('preset.translate'), icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M6 4.5a16 16 0 0 0 0 15 M18 4.5a16 16 0 0 1 0 15', prompt: () => _('preset.prompt.translate') },
  ],
  office: [
    { label: () => _('preset.weeklyReport'), icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-4-4z M14 2v4h4 M8 10h8 M8 14h6', prompt: () => _('preset.prompt.weeklyReport') },
    { label: () => _('preset.analyzeData'), icon: 'M4 20h16 M6 16v-4 M12 16v-8 M18 16v-6', prompt: () => _('preset.prompt.analyzeData') },
    { label: () => _('preset.pptOutline'), icon: 'M2 3h20v12H2z M8 21h8 M12 15v6', prompt: () => _('preset.prompt.pptOutline') },
    { label: () => _('preset.meetingMinutes'), icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M8 11h8 M8 15h5', prompt: () => _('preset.prompt.meetingMinutes') },
  ],
  coding: [
    { label: () => _('preset.codeReview'), icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-6-6', prompt: () => _('preset.prompt.codeReview') },
    { label: () => _('preset.generateTest'), icon: 'M9 3v7L4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 10V3 M9 3h6', prompt: () => _('preset.prompt.generateTest') },
    { label: () => _('preset.explainCode'), icon: 'M8 6l-5 6 5 6 M16 6l5 6-5 6', prompt: () => _('preset.prompt.explainCode') },
    { label: () => _('preset.refactor'), icon: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M20.5 15a9 9 0 0 1-14.9 3.4L1 14', prompt: () => _('preset.prompt.refactor') },
  ],
};

/** 模式对应的标语 */
const SLOGAN_MAP = { chat: "Let's Chat!", office: "Let's Work!", coding: "Let's Code!" };

/**
 * ModePresets — 管理模式预设的 UI 交互
 * 作为 ChatPanel 的委托对象，通过 chatPanel 引用访问主实例的状态和方法
 */
export class ModePresets {
  constructor(chatPanel) {
    /** @type {import('./ChatPanel.js').ChatPanel} */
    this.chatPanel = chatPanel;
    /** @type {number|null} 标题动画计时器 */
    this._titleAnimTimer = null;
  }

  /** 绑定模式切换事件 */
  bindEvents() {
    document.addEventListener('click', (e) => {
      // 模式按钮
      const modeBtn = e.target.closest('.mode-btn');
      if (modeBtn) {
        const mode = modeBtn.dataset.mode;
        if (!mode) return;
        if (mode === appState.getMode()) {
          // 点击当前已激活的模式：无需切换，但仍需确保会话记录与 UI 一致，
          // 防止 _sessionModes 中残留旧记录导致发送时模式错乱。
          appState.saveSessionMode(appState.currentSessionId, mode);
          return;
        }
        appState.setMode(mode);
        // 同步保存到当前会话的模式记录，确保发送消息时读取到的是用户刚选择的模式。
        // 否则 getSessionMode() 会优先命中 _sessionModes 里残留的旧记录，导致实际对话模式与 UI 不符。
        appState.saveSessionMode(appState.currentSessionId, mode);
        this.syncUI(mode, true);
        return;
      }
      // 预设提示词按钮
      const presetBtn = e.target.closest('.mode-preset-btn');
      if (presetBtn) {
        const prompt = presetBtn.dataset.prompt;
        if (!prompt) return;
        this.fillPresetToInput(prompt);
      }
    });
  }

  /** 同步模式 UI（高亮激活按钮 + 更新标语 + 更新预设标签） */
  syncUI(mode, animate = false) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (animate) {
      this._animateTitleSwitch(mode);
    } else {
      const titleLast = document.querySelector('.title-last');
      if (titleLast) titleLast.textContent = SLOGAN_MAP[mode] || "Let's Code!";
    }
    this.renderPresets(mode);
  }

  /** 切换标题标语：旧文字淡出 → 更新 → 新文字飞入 */
  _animateTitleSwitch(newMode) {
    // 取消前一次动画的 pending timeout，防止快速点击冲突
    if (this._titleAnimTimer) {
      clearTimeout(this._titleAnimTimer);
      this._titleAnimTimer = null;
    }

    const titleLast = document.querySelector('.title-last');
    if (!titleLast) return;

    const newText = SLOGAN_MAP[newMode] || "Let's Code!";
    // 只有不处于活跃动画且文字相同时才跳过，防止快速切回时卡在淡出态
    if (!this._titleAnimTimer && titleLast.textContent === newText) {
      // 清理前一次动画中断后残留的 inline style
      titleLast.style.transition = '';
      titleLast.style.maxWidth = '';
      titleLast.style.transform = '';
      titleLast.style.opacity = '';
      return;
    }

    const MAX_W = '300px';

    // 1. 旧文字淡出 + 右滑 + 折叠宽度 → title-first 自然居中
    titleLast.style.transition = 'opacity 0.2s ease, transform 0.28s ease, max-width 0.3s ease';
    titleLast.style.maxWidth = MAX_W;
    void titleLast.offsetWidth; // 强制 reflow，让 max-width 生效
    titleLast.style.opacity = '0';
    titleLast.style.transform = 'translateX(20px)';
    titleLast.style.maxWidth = '0';

    this._titleAnimTimer = setTimeout(() => {
      // 2. 更新文字，重置到右侧起始位置（宽度折叠为 0）
      titleLast.textContent = newText;
      titleLast.style.transition = 'none';
      titleLast.style.maxWidth = '0';
      titleLast.style.opacity = '0';
      titleLast.style.transform = 'translateX(100px)';

      // 3. 强制 reflow
      void titleLast.offsetWidth;

      // 4. 飞入 + 弹性回弹 + 展开宽度 → 整体居中
      titleLast.style.transition = 'opacity 0.35s ease, transform 1s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.4s ease 0.05s';
      titleLast.style.maxWidth = MAX_W;
      titleLast.style.opacity = '1';
      titleLast.style.transform = 'translateX(0)';

      // 5. 清理 inline style
      this._titleAnimTimer = setTimeout(() => {
        titleLast.style.transition = '';
        titleLast.style.maxWidth = '';
        titleLast.style.transform = '';
        titleLast.style.opacity = '';
        this._titleAnimTimer = null;
      }, 900);
    }, 350);
  }

  /** 渲染当前模式的预设提示词标签 */
  renderPresets(mode) {
    const container = document.getElementById('heroPresets');
    if (!container) return;
    const presets = MODE_PRESETS[mode] || MODE_PRESETS.coding;
    container.innerHTML = presets.map(p => {
      const promptText = typeof p.prompt === 'function' ? p.prompt() : p.prompt;
      const labelText = typeof p.label === 'function' ? p.label() : p.label;
      return `<button class="mode-preset-btn" data-prompt="${this._escapeAttr(promptText)}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${p.icon}"/></svg>
        ${labelText}
      </button>`;
    }).join('');
  }

  /** 点击预设标签 → 填充到输入框并聚焦 */
  fillPresetToInput(prompt) {
    const input = document.getElementById('messageInput');
    if (!input) return;
    input.value = prompt;
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(prompt.length, prompt.length);
  }

  /** 转义 HTML 属性，防 XSS */
  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
