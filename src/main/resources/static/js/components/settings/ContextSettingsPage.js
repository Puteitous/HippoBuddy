/**
 * ContextSettingsPage — 上下文管理页面
 *
 * 配置上下文窗口大小和截断策略：
 * - maxTokens（上下文窗口上限）
 * - policy（截断策略算法）
 * - perToolSafeLimit（单工具结果截断上限）
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 */
import { showToast } from '../../utils/toast.js';
import { CustomDropdown } from '../../utils/dropdown.js';

const MAX_TOKENS_ITEMS = [
  { label: '200,000', value: '200000' },
  { label: '400,000', value: '400000' },
  { label: '600,000', value: '600000' },
  { label: '800,000', value: '800000' },
  { label: '1,000,000 (默认)', value: '1000000' },
];

const TOOL_MAX_TOKENS_ITEMS = [
  { label: '5,000', value: '5000' },
  { label: '10,000', value: '10000' },
  { label: '20,000 (默认)', value: '20000' },
  { label: '30,000', value: '30000' },
  { label: '50,000', value: '50000' },
];

export class ContextSettingsPage {
  constructor() {
    this._config = null;
    this._maxTokensDropdown = null;
    this._toolMaxTokensDropdown = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">上下文管理</h2>
      <p class="settings-page-desc">配置上下文窗口大小和截断策略，控制发送给 LLM 的上下文量</p>
      <hr class="settings-page-divider">

      <div class="settings-field-group-title">上下文窗口</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>Max Tokens</div>
              <div class="settings-field-hint">上下文窗口上限</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="ctxMaxTokens">30,000</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">工具结果截断</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>工具结果截断上限</div>
              <div class="settings-field-hint">单工具结果最大 token 数，read 工具不设限</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="ctxToolMaxTokens">20,000</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-save-bar">
        <button class="settings-save-btn" id="ctxSave">保存配置</button>
      </div>
    `;

    container.appendChild(page);

    // 初始化下拉框
    this._maxTokensDropdown = new CustomDropdown({
      trigger: document.getElementById('ctxMaxTokens'),
      items: MAX_TOKENS_ITEMS,
      placement: 'bottom-left',
    });
    this._toolMaxTokensDropdown = new CustomDropdown({
      trigger: document.getElementById('ctxToolMaxTokens'),
      items: TOOL_MAX_TOKENS_ITEMS,
      placement: 'bottom-left',
    });

    this._bindEvents();
    this._loadConfig();
  }

  destroy() {
    if (this._maxTokensDropdown) this._maxTokensDropdown.destroy();
    if (this._toolMaxTokensDropdown) this._toolMaxTokensDropdown.destroy();
    this._container = null;
    this._config = null;
  }

  // ==================== 加载 ====================

  async _loadConfig() {
    try {
      const config = await this._getConfig();
      this._config = config;
      const ctx = config.context || {};

      this._maxTokensDropdown?.setSelectedValue(String(ctx.max_tokens ?? 30000));
      this._toolMaxTokensDropdown?.setSelectedValue(String(ctx.per_tool_safe_limit ?? 20000));

    } catch (e) {
      console.warn('加载上下文配置失败:', e);
      showToast('加载配置失败', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 保存 ====================

  async _saveConfig() {
    const maxTokens = parseInt(this._maxTokensDropdown?.getSelectedItem()?.value, 10) || 1000000;
    const perToolSafeLimit = parseInt(this._toolMaxTokensDropdown?.getSelectedItem()?.value, 10) || 20000;

    const values = {
      context: {
        max_tokens: Math.max(1000, maxTokens),
        per_tool_safe_limit: Math.max(1000, perToolSafeLimit),
      },
    };

    const saveBtn = document.getElementById('ctxSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }

    try {
      await this._updateConfig(values);
      showToast('上下文配置已保存', { type: 'success', duration: 2000 });
    } catch (e) {
      console.warn('保存上下文配置失败:', e);
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
    document.getElementById('ctxSave')?.addEventListener('click', () => this._saveConfig());
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
    // Web 端回退
    const resp = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }
}
