/**
 * SessionSettingsPage — 会话管理页面
 *
 * 配置会话行为：
 * - autoSave（自动保存）
 * - maxHistory（历史记录条数）
 * - persistSessions（持久化开关）
 * - maxSavedSessions（最大保存会话数）
 * - autoResume（自动恢复上次会话）
 * - resumeTimeoutHours（自动恢复超时）
 * - 目录配置：historyFile / saveDirectory / sessionDirectory
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 * 自动保存：checkbox/dropdown 变更后立即保存，text input 失焦后保存。
 *
 * 清理策略：按最大保存会话数（maxSavedSessions）清理，时间驱动清理已禁用。
 */
import { showToast } from '../../utils/toast.js';
import { CustomDropdown } from '../../utils/dropdown.js';

const MAX_HISTORY_ITEMS = [
  { label: '10', value: '10' },
  { label: '20', value: '20' },
  { label: '50 (默认)', value: '50' },
  { label: '100', value: '100' },
  { label: '200', value: '200' },
];

const MAX_SAVED_SESSIONS_ITEMS = [
  { label: '100', value: '100' },
  { label: '200', value: '200' },
  { label: '500', value: '500' },
  { label: '1,000 (默认)', value: '1000' },
];

const RESUME_TIMEOUT_ITEMS = [
  { label: '12 小时', value: '12' },
  { label: '24 小时', value: '24' },
  { label: '72 小时 (默认)', value: '72' },
  { label: '168 小时 (7 天)', value: '168' },
];

export class SessionSettingsPage {
  constructor() {
    this._config = null;
    this._maxHistoryDropdown = null;
    this._maxSavedSessionsDropdown = null;
    this._resumeTimeoutDropdown = null;

  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">会话管理</h2>
      <p class="settings-page-desc">配置会话保存行为和自动清理策略</p>
      <hr class="settings-page-divider">

      <div class="settings-field-group-title">基本行为</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">自动保存</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="sessAutoSave">
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>

          <div class="settings-field-horizontal">
            <label class="settings-field-label">持久化会话</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="sessPersistSessions">
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>

          <div class="settings-field-horizontal">
            <label class="settings-field-label">自动恢复上次会话</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="sessAutoResume">
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>

          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>历史记录条数</div>
              <div class="settings-field-hint">CLI 历史保留条数</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="sessMaxHistory">50</button>
            </div>
          </div>

          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>最大保存会话数</div>
              <div class="settings-field-hint">0 = 禁用, 最大值 1000</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="sessMaxSavedSessions">1,000</button>
            </div>
          </div>

          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>恢复超时</div>
              <div class="settings-field-hint">自动恢复上次会话的超时小时数</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="sessResumeTimeout">72 小时</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">路径配置</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>历史文件路径</div>
              <div class="settings-field-hint">(CLI 历史存储位置)</div>
            </div>
            <div class="settings-field-body" style="flex:1;">
              <input class="settings-input" id="sessHistoryFile" type="text" placeholder=".hippo/cli-history">
            </div>
          </div>

          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>会话目录</div>
              <div class="settings-field-hint">(会话文件存储目录)</div>
            </div>
            <div class="settings-field-body" style="flex:1;">
              <input class="settings-input" id="sessSessionDir" type="text" placeholder="logs/sessions">
            </div>
          </div>

          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>保存目录</div>
              <div class="settings-field-hint">(可选，覆盖默认保存位置)</div>
            </div>
            <div class="settings-field-body" style="flex:1;">
              <input class="settings-input" id="sessSaveDir" type="text" placeholder="留空使用默认">
            </div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(page);

    // 初始化下拉框（每个都绑定 onSelect 自动保存）
    this._maxHistoryDropdown = new CustomDropdown({
      trigger: document.getElementById('sessMaxHistory'),
      items: MAX_HISTORY_ITEMS,
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });
    this._maxSavedSessionsDropdown = new CustomDropdown({
      trigger: document.getElementById('sessMaxSavedSessions'),
      items: MAX_SAVED_SESSIONS_ITEMS,
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });
    this._resumeTimeoutDropdown = new CustomDropdown({
      trigger: document.getElementById('sessResumeTimeout'),
      items: RESUME_TIMEOUT_ITEMS,
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });
    // 绑定 checkbox 自动保存
    const checkboxIds = ['sessAutoSave', 'sessPersistSessions', 'sessAutoResume'];
    checkboxIds.forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this._saveConfig());
    });

    // 绑定 text input 失焦自动保存
    const inputIds = ['sessHistoryFile', 'sessSessionDir', 'sessSaveDir'];
    inputIds.forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => this._saveConfig());
    });

    this._loadConfig();
  }

  destroy() {
    if (this._maxHistoryDropdown) this._maxHistoryDropdown.destroy();
    if (this._maxSavedSessionsDropdown) this._maxSavedSessionsDropdown.destroy();
    if (this._resumeTimeoutDropdown) this._resumeTimeoutDropdown.destroy();
    this._container = null;
    this._config = null;
  }

  // ==================== 加载 ====================

  async _loadConfig() {
    try {
      const config = await this._getConfig();
      this._config = config;
      const sess = config.session || {};

      this._setCheckbox('sessAutoSave', sess.auto_save);
      this._setCheckbox('sessPersistSessions', sess.persist_sessions);
      this._setCheckbox('sessAutoResume', sess.auto_resume);
      this._maxHistoryDropdown?.setSelectedValue(String(sess.max_history ?? 50));
      this._maxSavedSessionsDropdown?.setSelectedValue(String(sess.max_saved_sessions ?? 1000));
      this._resumeTimeoutDropdown?.setSelectedValue(String(sess.resume_timeout_hours ?? 72));

      this._setInput('sessHistoryFile', sess.history_file);
      this._setInput('sessSessionDir', sess.session_directory);
      this._setInput('sessSaveDir', sess.save_directory);
    } catch (e) {
      console.warn('加载会话配置失败:', e);
      showToast('加载配置失败', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 保存 ====================

  async _saveConfig() {
    const values = {
      session: {
        auto_save: document.getElementById('sessAutoSave')?.checked ?? true,
        persist_sessions: document.getElementById('sessPersistSessions')?.checked ?? true,
        auto_resume: document.getElementById('sessAutoResume')?.checked ?? true,

        max_history: parseInt(this._maxHistoryDropdown?.getSelectedItem()?.value, 10) || 50,
        max_saved_sessions: parseInt(this._maxSavedSessionsDropdown?.getSelectedItem()?.value, 10) || 1000,
        resume_timeout_hours: parseInt(this._resumeTimeoutDropdown?.getSelectedItem()?.value, 10) || 72,

        history_file: document.getElementById('sessHistoryFile')?.value?.trim() || '.hippo/cli-history',
        session_directory: document.getElementById('sessSessionDir')?.value?.trim() || 'logs/sessions',
        save_directory: document.getElementById('sessSaveDir')?.value?.trim() || null,
      },
    };

    try {
      await this._updateConfig(values);
    } catch (e) {
      console.warn('保存会话配置失败:', e);
      showToast('保存失败: ' + e.message, { type: 'error', duration: 3000 });
    }
  }

  // ==================== 辅助方法 ====================

  _setCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value ?? false;
  }

  _setInput(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.value = value;
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
