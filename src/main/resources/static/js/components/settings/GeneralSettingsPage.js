/**
 * GeneralSettingsPage — 通用设置页面
 *
 * 主题切换、默认工作区路径
 */
import { appState } from '../../state/app-state.js';

const _t = (key) => window.i18n ? window.i18n.t(key) : key;

export class GeneralSettingsPage {
  constructor() {
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">${_t('settingsPage.generalTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.generalDesc')}</p>
      <hr class="settings-page-divider">
      <div class="settings-field-group-title">${_t('settingsPage.generalBasic')}</div>
      <div class="settings-field-group">
      <div class="settings-form">
        <div class="settings-field-horizontal">
          <label class="settings-field-label">${_t('settingsPage.generalTheme')}</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsThemeToggle">
              <button class="settings-toggle-btn" data-value="light">${_t('settingsPage.generalLight')}</button>
              <button class="settings-toggle-btn" data-value="dark">${_t('settingsPage.generalDark')}</button>
              <button class="settings-toggle-btn" data-value="midnight">${_t('settingsPage.generalMidnight')}</button>
              <button class="settings-toggle-btn" data-value="system">${_t('settingsPage.generalSystem')}</button>
            </div>
          </div>
        </div>
        <div class="settings-field-horizontal">
          <label class="settings-field-label">${_t('settingsPage.generalLanguage')}</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsLangToggle">
              <button class="settings-toggle-btn" data-value="zh">${_t('settingsPage.generalLangZh')}</button>
              <button class="settings-toggle-btn" data-value="en">${_t('settingsPage.generalLangEn')}</button>
            </div>
          </div>
        </div>
        <div class="settings-field-horizontal desktop-only desktop-only-flex">
          <div class="settings-field-label">
            <div>${_t('settingsPage.generalWorkspace')}</div>
            <div class="settings-field-hint">${_t('settingsPage.generalWorkspaceHint')}</div>
          </div>
          <div class="settings-field-body" style="flex:1;">
            <div class="settings-input-wrap">
              <input class="settings-input" id="settingsDefaultWorkspace" type="text" placeholder="${_t('settingsPage.generalWorkspacePh')}">
              <button class="settings-input-btn" id="settingsDefaultWorkspaceBrowse" title="${_t('settingsPage.generalBrowseFolder')}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="settings-field-horizontal desktop-only desktop-only-flex">
          <label class="settings-field-label">${_t('settingsPage.generalLayout')}</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsLayoutToggle">
              <button class="settings-toggle-btn" data-value="preview-left">${_t('settingsPage.generalPreviewLeft')}</button>
              <button class="settings-toggle-btn" data-value="chat-left">${_t('settingsPage.generalChatLeft')}</button>
            </div>
          </div>
        </div>
      </div>
      </div>
    `;

    container.appendChild(page);

    // 读取当前主题
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'system';
    document.querySelectorAll('#settingsThemeToggle .settings-toggle-btn').forEach(btn => {
      if (btn.dataset.value === currentTheme) btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsThemeToggle .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.dataset.value;
        if (theme === 'system') {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('hippo-theme', 'system');
        } else {
          appState.setTheme(theme);
        }
      });
    });

    // ── 语言切换 ──
    const currentLang = window.i18n ? window.i18n.currentLang : 'zh';
    document.querySelectorAll('#settingsLangToggle .settings-toggle-btn').forEach(btn => {
      if (btn.dataset.value === currentLang) btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsLangToggle .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const lang = btn.dataset.value;
        if (window.i18n) {
          window.i18n.setLang(lang);
          // 重新渲染当前页面以刷新所有文本
          this.render(this._container);
        }
      });
    });

    // ── 工作区路径 ──
    const browseBtn = document.getElementById('settingsDefaultWorkspaceBrowse');
    if (browseBtn && window.HippoDesktop?.openFileDialog) {
      browseBtn.addEventListener('click', async () => {
        try {
          const result = await window.HippoDesktop.openFileDialog();
          if (result?.path) {
            const input = document.getElementById('settingsDefaultWorkspace');
            input.value = result.path;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (e) {
          // ignore
        }
      });
    }

    // 加载默认工作区路径
    const workspaceInput = document.getElementById('settingsDefaultWorkspace');
    if (workspaceInput && window.HippoDesktop?.getDefaultWorkspace) {
      window.HippoDesktop.getDefaultWorkspace().then(result => {
        workspaceInput.value = result?.path || '';
      }).catch(() => {});
    }

    // 失焦时自动保存工作区路径
    if (workspaceInput && window.HippoDesktop?.setDefaultWorkspace) {
      workspaceInput.addEventListener('change', () => {
        window.HippoDesktop.setDefaultWorkspace(workspaceInput.value.trim()).catch(() => {});
      });
    }

    // ── 面板布局切换 ──
    const mainContainer = document.querySelector('.main-container');
    const currentLayout = localStorage.getItem('hippo-layout') || 'preview-left';
    document.querySelectorAll('#settingsLayoutToggle .settings-toggle-btn').forEach(btn => {
      if (btn.dataset.value === currentLayout) btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsLayoutToggle .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const layout = btn.dataset.value;
        localStorage.setItem('hippo-layout', layout);
        if (mainContainer) {
          mainContainer.classList.toggle('layout-chat-first', layout === 'chat-left');
        }
      });
    });
  }

  destroy() {
    this._container = null;
  }
}
