/**
 * ToolsSettingsPage — 工具管理页面
 *
 * 配置内置工具行为：
 * - bash: { enabled, requireConfirmation }
 * - webSearch: { provider, apiKey }
 * - subagent: { enabled }
 * - delete_file: { requireConfirmation }
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 * 自动保存：checkbox/dropdown 变更后立即保存，text input 失焦后保存。
 */
import { showToast } from '../../utils/toast.js';
import { CustomDropdown } from '../../utils/dropdown.js';

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

const KEY_LABELS = {
  bash: _t('settingsPage.tools.bash'),
  delete_file: _t('settingsPage.tools.deleteFile'),
  web_search: _t('settingsPage.tools.webSearch'),
  subagent: _t('settingsPage.tools.subagent'),
};

const WEB_PROVIDER_ITEMS = [
  { label: 'Brave', value: 'brave' },
  { label: 'Google', value: 'google' },
  { label: 'Bing', value: 'bing' },
  { label: 'SearXNG', value: 'searxng' },
  { label: 'Tavily', value: 'tavily' },
];

export class ToolsSettingsPage {
  constructor() {
    this._config = null;
    this._webProviderDropdown = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';
    page.innerHTML = `
      <h2 class="settings-page-title">${_t('settingsPage.toolsTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.toolsDesc')}</p>
      <hr class="settings-page-divider">

      <div class="settings-loading" id="toolsLoading" style="display:block;">${_t('settingsPage.rulesLoading')}</div>
      <div id="toolsForm" style="display:none;"></div>
    `;

    container.appendChild(page);
    this._loadConfig();
  }

  destroy() {
    if (this._webProviderDropdown) this._webProviderDropdown.destroy();
    this._config = null;
  }

  async _loadConfig() {
    const { HippoDesktop } = window;

    if (!HippoDesktop || !HippoDesktop.getConfig) {
      this._showError(_t('settingsPage.configUnavailable'));
      return;
    }

    try {
      const config = await HippoDesktop.getConfig();
      this._config = config.tools || {};
      this._renderForm();
    } catch (e) {
      console.warn('加载工具配置失败:', e);
      this._showError(_t('settingsPage.loadFailed') + e.message);
    }
  }

  _showError(msg) {
    const form = document.getElementById('toolsForm');
    const loading = document.getElementById('toolsLoading');
    if (loading) loading.style.display = 'none';
    if (form) {
      form.style.display = 'block';
      form.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${msg}</p>`;
    }
  }

  _renderForm() {
    const loading = document.getElementById('toolsLoading');
    const form = document.getElementById('toolsForm');
    if (loading) loading.style.display = 'none';
    if (!form) return;

    const tools = this._config;

    // ── Bash 配置 ──
    const bash = tools.bash || {};

    // ── Delete File 配置 ──
    const deleteFile = tools.delete_file || {};

    // ── Web Search 配置 ──
    const webSearch = tools.web_search || {};

    // ── SubAgent 配置 ──
    const subagent = tools.subagent || {};

    form.style.display = 'block';
    form.innerHTML = `
      <!-- ===== Bash ===== -->
      <div class="settings-field-group-title">${KEY_LABELS.bash}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.toolsNeedConfirm')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="toolsBashConfirm" ${bash.require_confirmation !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Web Search ===== -->
      <div class="settings-field-group-title">${KEY_LABELS.web_search}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.toolsEnable')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="toolsWebEnabled" ${webSearch.enabled === true ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.toolsSearchProvider')}</div>
              <div class="settings-field-hint">${_t('settingsPage.toolsProviderHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="toolsWebProvider">${webSearch.provider || 'brave'}</button>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label" for="toolsWebApiKey">${_t('settingsPage.toolsApiKey')}</label>
            <div class="settings-field-body">
              <div class="settings-input-wrap" style="width:220px;">
                <input class="settings-input" id="toolsWebApiKey" type="password" value="${webSearch.api_key || ''}" placeholder="${_t('settingsPage.toolsApiKeyPh')}">
                <button class="settings-input-btn" id="toolsWebApiKeyToggle" title="${_t('settingsPage.toolsShowHide')}">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== SubAgent ===== -->
      <div class="settings-field-group-title">${KEY_LABELS.subagent}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.toolsEnable')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="toolsSubagentEnabled" ${subagent.enabled ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Delete File ===== -->
      <div class="settings-field-group-title">${KEY_LABELS.delete_file}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.toolsNeedConfirm')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="toolsDeleteFileConfirm" ${deleteFile.require_confirmation !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    // 初始化下拉框
    this._webProviderDropdown = new CustomDropdown({
      trigger: document.getElementById('toolsWebProvider'),
      items: WEB_PROVIDER_ITEMS,
      selectedValue: webSearch.provider || '',
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });

    // 绑定事件：API Key 显示/隐藏
    const toggleBtn = document.getElementById('toolsWebApiKeyToggle');
    const apiKeyInput = document.getElementById('toolsWebApiKey');
    if (toggleBtn && apiKeyInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    // 绑定 checkbox 自动保存
    const checkboxIds = ['toolsBashConfirm', 'toolsWebEnabled', 'toolsSubagentEnabled', 'toolsDeleteFileConfirm'];
    checkboxIds.forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this._saveConfig());
    });

    // 绑定 text input/textarea 失焦自动保存
    const inputIds = ['toolsWebApiKey'];
    inputIds.forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => this._saveConfig());
    });
  }

  async _saveConfig() {
    try {
      const values = {};

      // Bash
      const bashConfirm = document.getElementById('toolsBashConfirm')?.checked;
      values.bash = {
        require_confirmation: bashConfirm !== false,
      };

      // Web Search
      const webEnabled = document.getElementById('toolsWebEnabled')?.checked;
      const webProvider = this._webProviderDropdown?.getSelectedItem()?.value || '';
      values.web_search = {
        enabled: webEnabled !== false,
        provider: webProvider,
        api_key: document.getElementById('toolsWebApiKey')?.value || '',
      };

      // SubAgent
      const subagentEnabled = document.getElementById('toolsSubagentEnabled')?.checked;
      values.subagent = {
        enabled: subagentEnabled === true,
      };

      // Delete File
      const deleteFileConfirm = document.getElementById('toolsDeleteFileConfirm')?.checked;
      values.delete_file = {
        require_confirmation: deleteFileConfirm !== false,
      };

      const { HippoDesktop } = window;
      if (HippoDesktop?.updateConfig) {
        await HippoDesktop.updateConfig({ tools: values });
      } else {
        throw new Error('updateConfig 不可用');
      }
    } catch (e) {
      console.warn('保存工具配置失败:', e);
      showToast(_t('settingsPage.saveFailed') + e.message, { type: 'error', duration: 3000 });
    }
  }
}
