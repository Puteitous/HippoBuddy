/**
 * SettingsPanel — 全屏设置面板外壳
 *
 * 左侧导航竖条 + 右侧内容区
 * 负责：生命周期（打开/关闭/销毁）、导航渲染与切换
 * 每个页签由独立的 settings/*Page.js 渲染
 */
import { ModelSettingsPage } from './settings/ModelSettingsPage.js';
import { RulesSettingsPage } from './settings/RulesSettingsPage.js';
import { SkillsSettingsPage } from './settings/SkillsSettingsPage.js';
import { GeneralSettingsPage } from './settings/GeneralSettingsPage.js';
import { ContextSettingsPage } from './settings/ContextSettingsPage.js';
import { SessionSettingsPage } from './settings/SessionSettingsPage.js';
import { ToolsSettingsPage } from './settings/ToolsSettingsPage.js';
import { McpSettingsPage } from './settings/McpSettingsPage.js';

/** 导航项定义 */
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

const NAV_ITEMS = [
  { id: 'general',  key: 'settings.general',  label: () => _t('settings.general'), icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' },
  { id: 'model',    key: 'settings.model',    label: () => _t('settings.model'), icon: 'M4 4h16v16H4z M9 9h6v6H9z M2 12h2 M20 12h2 M12 2v2 M12 20v2' },
  { id: 'rules',    key: 'settings.rules',    label: () => _t('settings.rules'), icon: 'M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M14 2v4h4 M9 13l2 2 4-4' },
  { id: 'skills',   key: 'settings.skills',   label: () => _t('settings.skills'), icon: 'M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z' },
  { id: 'context',  key: 'settings.context',  label: () => _t('settings.context'),   icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { id: 'session',  key: 'settings.session',  label: () => _t('settings.session'), icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
  { id: 'tools',    key: 'settings.tools',    label: () => _t('settings.tools'), icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { id: 'mcp',      key: 'settings.mcp',      label: () => _t('settings.mcp'), icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
];

/** Page 类映射 */
const PAGE_CLASSES = {
  general:  GeneralSettingsPage,
  model:    ModelSettingsPage,
  rules:    RulesSettingsPage,
  skills:   SkillsSettingsPage,
  context:  ContextSettingsPage,
  session:  SessionSettingsPage,
  tools:    ToolsSettingsPage,
  mcp:      McpSettingsPage,
};

export class SettingsPanel {
  constructor() {
    this._overlay = null;
    this._contentEl = null;
    this._navItems = [];
    this._activePage = 'general';
    this._mainContainer = document.querySelector('.main-container');
    this._chatPanel = document.querySelector('.chat-panel');
    this._currentPageInstance = null;
    this._skillsPageInstance = null;
    this._previewWasHidden = true;

    // 清理旧版残留 key
    localStorage.removeItem('hippo-settings-width');

    // 语言切换时更新导航标签
    this._onI18nChange = () => {
      if (window.i18n && this._navEl) {
        window.i18n.applyToDOM(this._navEl);
      }
    };
    window.addEventListener('i18n:change', this._onI18nChange);

    this._init();
  }

  // ==================== 生命周期 ====================

  open() {
    if (!this._overlay) this._init();
    if (this._chatPanel) this._chatPanel.style.display = 'none';

    // 隐藏预览面板，记录原始状态
    const preview = document.querySelector('.preview-panel');
    this._previewWasHidden = !preview || preview.classList.contains('hidden');
    if (preview) preview.classList.add('hidden');

    // 填满 main-container 剩余空间
    this._overlay.style.display = 'flex';
    this._overlay.style.width = '';
    this._overlay.style.flex = '';

    this._switchPage(this._activePage);
  }

  close() {
    if (this._overlay) {
      this._overlay.style.display = 'none';
    }
    if (this._chatPanel) {
      this._chatPanel.style.display = '';
    }
    // 恢复预览面板原始状态
    if (!this._previewWasHidden) {
      const preview = document.querySelector('.preview-panel');
      if (preview) preview.classList.remove('hidden');
    }
    // 关闭设置面板时，刷新 hero 和底部的模型快速选择下拉框
    loadQuickModelConfig();
  }

  isOpen() {
    return this._overlay && this._overlay.style.display !== 'none';
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._chatPanel) {
      this._chatPanel.style.display = '';
    }
    // 恢复预览面板原始状态
    if (!this._previewWasHidden) {
      const preview = document.querySelector('.preview-panel');
      if (preview) preview.classList.remove('hidden');
    }
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
    }
    if (this._onI18nChange) {
      window.removeEventListener('i18n:change', this._onI18nChange);
    }
  }

  // ==================== 初始化 DOM ====================

  _init() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'settings-overlay';
    this._overlay.style.display = 'none';

    // ── 关闭按钮 ──
    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.title = _t('settings.close');
    closeBtn.setAttribute('data-i18n-title', 'settings.close');
    closeBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>';
    closeBtn.addEventListener('click', () => this.close());
    this._overlay.appendChild(closeBtn);

    // ── 主体 ──
    const body = document.createElement('div');
    body.className = 'settings-body';

    // 左侧导航
    const nav = document.createElement('nav');
    nav.className = 'settings-nav';
    this._navEl = nav;

    for (const item of NAV_ITEMS) {
      const navItem = document.createElement('button');
      navItem.className = 'settings-nav-item';
      navItem.dataset.page = item.id;

      const icon = document.createElement('span');
      icon.className = 'settings-nav-icon';
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>`;
      navItem.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = typeof item.label === 'function' ? item.label() : item.label;
      if (item.key) label.dataset.i18n = item.key;
      navItem.appendChild(label);

      navItem.addEventListener('click', () => this._switchPage(item.id));
      nav.appendChild(navItem);
      this._navItems.push(navItem);
    }

    body.appendChild(nav);

    // 右侧内容区
    const content = document.createElement('div');
    content.className = 'settings-content';
    this._contentEl = content;
    body.appendChild(content);

    this._overlay.appendChild(body);

    // ── 键盘关闭 ──
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    if (this._mainContainer) {
      this._mainContainer.appendChild(this._overlay);
    }
  }

  // ==================== 页面切换 ====================

  _switchPage(pageId) {
    this._activePage = pageId;

    // 更新导航高亮
    for (const item of this._navItems) {
      item.classList.toggle('active', item.dataset.page === pageId);
    }

    // 销毁旧页面
    if (this._currentPageInstance) {
      this._currentPageInstance.destroy();
      if (this._skillsPageInstance === this._currentPageInstance) {
        this._skillsPageInstance = null;
      }
      this._currentPageInstance = null;
    }

    // 清空内容区
    this._contentEl.innerHTML = '';

    // 创建并渲染新页面
    const PageClass = PAGE_CLASSES[pageId];
    if (PageClass) {
      this._currentPageInstance = new PageClass();
      this._currentPageInstance.render(this._contentEl);

      // 缓存 SkillsSettingsPage 实例，供 reloadSkills() 代理
      if (this._currentPageInstance instanceof SkillsSettingsPage) {
        this._skillsPageInstance = this._currentPageInstance;
      }
    }
  }

  // ==================== 对外接口 ====================

  /**
   * 刷新技能列表（供 SkillMarket 调用）
   */
  reloadSkills() {
    if (this._skillsPageInstance) {
      this._skillsPageInstance.reloadSkills();
    }
  }
}
