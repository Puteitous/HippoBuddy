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
 * - 后台清理：周期/阈值
 * - 目录配置：historyFile / saveDirectory / sessionDirectory
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 */
import { showToast } from '../../utils/toast.js';

export class SessionSettingsPage {
  constructor() {
    this._config = null;
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

          <div class="settings-field">
            <label class="settings-field-label" for="sessMaxHistory">
              历史记录条数 <span class="settings-field-hint">(CLI 历史保留条数)</span>
            </label>
            <input class="settings-input" id="sessMaxHistory" type="number" min="0" step="10" placeholder="50">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessMaxSavedSessions">
              最大保存会话数 <span class="settings-field-hint">(0 = 禁用, 最大值 1000)</span>
            </label>
            <input class="settings-input" id="sessMaxSavedSessions" type="number" min="0" max="1000" step="50" placeholder="1000">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessResumeTimeout">
              恢复超时 <span class="settings-field-hint">(自动恢复上次会话的超时小时数)</span>
            </label>
            <input class="settings-input" id="sessResumeTimeout" type="number" min="0" step="1" placeholder="72">
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">后台清理</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">启用后台清理</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="sessEnableCleanup">
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessCleanupPeriod">
              清理周期 <span class="settings-field-hint">(天, 1–365)</span>
            </label>
            <input class="settings-input" id="sessCleanupPeriod" type="number" min="1" max="365" step="1" placeholder="30">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessTombstoneThreshold">
              碎片阈值 <span class="settings-field-hint">(WAL 碎片超过此值(MB)时触发清理)</span>
            </label>
            <input class="settings-input" id="sessTombstoneThreshold" type="number" min="1" step="5" placeholder="50">
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">路径配置</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field">
            <label class="settings-field-label" for="sessHistoryFile">
              历史文件路径 <span class="settings-field-hint">(CLI 历史存储位置)</span>
            </label>
            <input class="settings-input" id="sessHistoryFile" type="text" placeholder=".hippo/cli-history">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessSessionDir">
              会话目录 <span class="settings-field-hint">(会话文件存储目录)</span>
            </label>
            <input class="settings-input" id="sessSessionDir" type="text" placeholder="logs/sessions">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="sessSaveDir">
              保存目录 <span class="settings-field-hint">(可选，覆盖默认保存位置)</span>
            </label>
            <input class="settings-input" id="sessSaveDir" type="text" placeholder="留空使用默认">
          </div>
        </div>
      </div>

      <div class="settings-save-bar">
        <button class="settings-save-btn" id="sessSave">保存配置</button>
      </div>
    `;

    container.appendChild(page);

    this._bindEvents();
    this._loadConfig();
  }

  destroy() {
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
      this._setCheckbox('sessEnableCleanup', sess.enable_background_cleanup);

      this._setInput('sessMaxHistory', sess.max_history);
      this._setInput('sessMaxSavedSessions', sess.max_saved_sessions);
      this._setInput('sessResumeTimeout', sess.resume_timeout_hours);
      this._setInput('sessCleanupPeriod', sess.cleanup_period_days);
      this._setInput('sessTombstoneThreshold', sess.tombstone_threshold_mb);
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
        enable_background_cleanup: document.getElementById('sessEnableCleanup')?.checked ?? true,

        max_history: parseInt(document.getElementById('sessMaxHistory')?.value, 10) || 50,
        max_saved_sessions: parseInt(document.getElementById('sessMaxSavedSessions')?.value, 10) || 1000,
        resume_timeout_hours: parseInt(document.getElementById('sessResumeTimeout')?.value, 10) || 72,
        cleanup_period_days: parseInt(document.getElementById('sessCleanupPeriod')?.value, 10) || 30,
        tombstone_threshold_mb: parseInt(document.getElementById('sessTombstoneThreshold')?.value, 10) || 50,

        history_file: document.getElementById('sessHistoryFile')?.value?.trim() || '.hippo/cli-history',
        session_directory: document.getElementById('sessSessionDir')?.value?.trim() || 'logs/sessions',
        save_directory: document.getElementById('sessSaveDir')?.value?.trim() || null,
      },
    };

    const saveBtn = document.getElementById('sessSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }

    try {
      await this._updateConfig(values);
      showToast('会话配置已保存', { type: 'success', duration: 2000 });
    } catch (e) {
      console.warn('保存会话配置失败:', e);
      showToast('保存失败: ' + e.message, { type: 'error', duration: 3000 });
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存配置';
      }
    }
  }

  // ==================== 事件绑定 ====================

  _bindEvents() {
    document.getElementById('sessSave')?.addEventListener('click', () => this._saveConfig());
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
