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

/** 上下文策略选项 */
const POLICY_ITEMS = [
  { label: '简单截断', value: 'simple' },
  { label: '滑动窗口', value: 'sliding' },
  { label: '重要性排序', value: 'priority' },
];

export class ContextSettingsPage {
  constructor() {
    this._config = null;
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
          <div class="settings-field">
            <label class="settings-field-label" for="ctxMaxTokens">
              Max Tokens <span class="settings-field-hint">(上下文窗口上限，最小 1000)</span>
            </label>
            <input class="settings-input" id="ctxMaxTokens" type="number" min="1000" step="1000" placeholder="30000">
          </div>

          <div class="settings-field-horizontal">
            <label class="settings-field-label">上下文策略</label>
            <div class="settings-field-body">
              <div class="settings-toggle-group" id="ctxPolicy">
                ${POLICY_ITEMS.map(p => `
                  <button class="settings-toggle-btn" data-value="${p.value}">${p.label}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">工具结果截断</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field">
            <label class="settings-field-label" for="ctxToolMaxTokens">
              工具结果截断上限 <span class="settings-field-hint">(单工具结果最大 token 数，最小 1000)</span>
            </label>
            <input class="settings-input" id="ctxToolMaxTokens" type="number" min="1000" step="1000" placeholder="20000">
          </div>
        </div>
      </div>

      <div class="settings-save-bar">
        <button class="settings-save-btn" id="ctxSave">保存配置</button>
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
      const ctx = config.context || {};

      const maxTokens = document.getElementById('ctxMaxTokens');
      const toolMaxTokens = document.getElementById('ctxToolMaxTokens');

      if (maxTokens) maxTokens.value = ctx.max_tokens ?? 30000;
      if (toolMaxTokens) toolMaxTokens.value = ctx.per_tool_safe_limit ?? 20000;

      // Policy
      const policyValue = ctx.policy || 'simple';
      document.querySelectorAll('#ctxPolicy .settings-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === policyValue);
      });

    } catch (e) {
      console.warn('加载上下文配置失败:', e);
      showToast('加载配置失败', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 保存 ====================

  async _saveConfig() {
    const maxTokens = parseInt(document.getElementById('ctxMaxTokens')?.value, 10) || 30000;
    const perToolSafeLimit = parseInt(document.getElementById('ctxToolMaxTokens')?.value, 10) || 20000;
    const policyBtn = document.querySelector('#ctxPolicy .settings-toggle-btn.active');

    const values = {
      context: {
        max_tokens: Math.max(1000, maxTokens),
        policy: policyBtn?.dataset.value || 'simple',
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

    // toggle 点击切换
    document.querySelectorAll('#ctxPolicy .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.settings-toggle-group');
        group.querySelectorAll('.settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
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
