/**
 * SessionSettingsPage — 会话管理页面
 *
 * 配置会话行为：
 * - maxSavedSessions（最大保存会话数）
 * 会话路径由 WorkspaceManager 自动管理，不可配置
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 * dropdown 变更后立即保存。
 *
 * 清理策略：按最大保存会话数（maxSavedSessions）清理，时间驱动清理已禁用。
 */
import { showToast } from '../../utils/toast.js';
import { CustomDropdown } from '../../utils/dropdown.js';

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

const MAX_SAVED_SESSIONS_ITEMS = [
  { label: '100', value: '100' },
  { label: '200', value: '200' },
  { label: '500', value: '500' },
  { label: _t('settingsPage.sessionDefault'), value: '1000' },
];

export class SessionSettingsPage {
  constructor() {
    this._config = null;
    this._maxSavedSessionsDropdown = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">${_t('settingsPage.sessionTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.sessionDesc')}</p>
      <hr class="settings-page-divider">

      <div class="settings-field-group-title">${_t('settingsPage.sessionSavePolicy')}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.sessionMaxSaved')}</div>
              <div class="settings-field-hint">${_t('settingsPage.sessionMaxHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="sessMaxSavedSessions">1,000</button>
            </div>
          </div>
        </div>
      </div>


    `;

    container.appendChild(page);

    // 初始化下拉框（绑定 onSelect 自动保存）
    this._maxSavedSessionsDropdown = new CustomDropdown({
      trigger: document.getElementById('sessMaxSavedSessions'),
      items: MAX_SAVED_SESSIONS_ITEMS,
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });

    this._loadConfig();
  }

  destroy() {
    if (this._maxSavedSessionsDropdown) this._maxSavedSessionsDropdown.destroy();
    this._container = null;
    this._config = null;
  }

  // ==================== 加载 ====================

  async _loadConfig() {
    try {
      const config = await this._getConfig();
      this._config = config;
      const sess = config.session || {};

      this._maxSavedSessionsDropdown?.setSelectedValue(String(sess.max_saved_sessions ?? 1000));

    } catch (e) {
      console.warn('加载会话配置失败:', e);
      showToast(_t('settingsPage.loadConfigFailed'), { type: 'error', duration: 3000 });
    }
  }

  // ==================== 保存 ====================

  async _saveConfig() {
    const values = {
      session: {
        max_saved_sessions: parseInt(this._maxSavedSessionsDropdown?.getSelectedItem()?.value, 10) || 1000,
      },
    };

    try {
      await this._updateConfig(values);
    } catch (e) {
      console.warn('保存会话配置失败:', e);
      showToast(_t('settingsPage.saveFailed') + e.message, { type: 'error', duration: 3000 });
    }
  }

  // ==================== 数据访问 ====================

  async _getConfig() {
    if (window.HippoDesktop?.getConfig) {
      return window.HippoDesktop.getConfig();
    }
    throw new Error('HippoDesktop.getConfig() 不可用');
  }

  async _updateConfig(values) {
    if (window.HippoDesktop?.updateConfig) {
      return window.HippoDesktop.updateConfig(values);
    }
    const resp = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }
}
