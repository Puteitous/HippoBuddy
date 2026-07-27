/**
 * GeneralSettingsPage — 通用设置页面
 *
 * 主题切换、默认工作区路径
 */
import { appState } from '../../state/app-state.js';

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

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
          <label class="settings-field-label">${_t('settingsPage.generalLayout')}</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsLayoutToggle">
              <button class="settings-toggle-btn" data-value="preview-left">${_t('settingsPage.generalPreviewLeft')}</button>
              <button class="settings-toggle-btn" data-value="chat-left">${_t('settingsPage.generalChatLeft')}</button>
            </div>
          </div>
        </div>
        <div class="settings-field-horizontal desktop-only desktop-only-flex">
          <div class="settings-field-label">
            <div>${_t('settingsPage.generalWorkspace')}</div>
            <div class="settings-field-hint">${_t('settingsPage.generalWorkspaceHint')}</div>
          </div>
          <div class="settings-field-body" style="flex:1;max-width:360px;">
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
        <div class="settings-field-horizontal desktop-only desktop-only-flex" style="border-top:1px solid var(--border-color);padding-top:16px;">
          <div class="settings-field-label">
            <div>${_t('settingsPage.generalDataDir')}</div>
            <div class="settings-field-hint">${_t('settingsPage.generalDataDirHint')}</div>
          </div>
          <div class="settings-field-body" style="flex:1;max-width:360px;">
            <div class="settings-input-wrap">
              <input class="settings-input" id="settingsDataDir" type="text" readonly placeholder="${_t('settingsPage.generalDataDirDefault')}" style="cursor:default;background:var(--bg-tertiary, transparent);">
              <button class="settings-input-btn" id="settingsDataDirBrowse" title="${_t('settingsPage.generalDataDirBrowse')}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
            <div id="settingsDataDirRestartMsg" style="display:none;margin-top:8px;padding:6px 10px;border-radius:6px;background:var(--warning-bg, #fff3cd);color:var(--warning-color, #856404);font-size:13px;">
              ${_t('settingsPage.generalDataDirRestart')}
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

    // ── 数据目录 ──
    this._setupDataDir();
  }

  /** 数据目录：加载当前路径 + 浏览 + 变更确认 */
  _setupDataDir() {
    const input = document.getElementById('settingsDataDir');
    const browseBtn = document.getElementById('settingsDataDirBrowse');
    const restartMsg = document.getElementById('settingsDataDirRestartMsg');
    if (!input) return;

    // 加载当前数据目录
    this._fetchDataDir().then(info => {
      if (info?.path) {
        input.value = info.path;
        input.placeholder = info.path;
      } else {
        input.value = '';
        input.placeholder = _t('settingsPage.generalDataDirDefault');
      }
    }).catch(() => {});

    // 浏览按钮
    if (browseBtn && window.HippoDesktop?.openFileDialog) {
      browseBtn.addEventListener('click', async () => {
        try {
          const result = await window.HippoDesktop.openFileDialog();
          if (result?.path) {
            this._confirmChangeDataDir(result.path);
          }
        } catch (e) {
          // ignore
        }
      });
    }
  }

  /** 调用 API 获取当前数据目录信息 */
  async _fetchDataDir() {
    try {
      const resp = await fetch('/api/settings/data-dir');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('[DataDir] 获取数据目录失败:', e);
    }
    return null;
  }

  /** 确认变更数据目录 */
  async _confirmChangeDataDir(newPath) {
    const msg = _t('settingsPage.generalDataDirConfirm', { path: newPath });
    if (!confirm(msg)) return;

    const restartMsg = document.getElementById('settingsDataDirRestartMsg');
    const input = document.getElementById('settingsDataDir');

    try {
      const resp = await fetch('/api/settings/data-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath }),
      });
      const result = await resp.json();
      if (resp.ok && result.success) {
        if (input) input.value = result.path;
        if (restartMsg) restartMsg.style.display = 'block';
      } else {
        alert(result.error || '修改失败');
      }
    } catch (e) {
      alert('网络错误，请重试');
    }
  }

  destroy() {
    this._container = null;
  }
}
