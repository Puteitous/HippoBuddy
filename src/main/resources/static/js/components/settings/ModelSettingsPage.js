/**
 * ModelSettingsPage — 模型配置页面
 *
 * Provider/API Key/Model/Base URL/Max Tokens 配置
 * 模型历史快照列表（点击回填）
 */
import { apiGet, apiPost } from '../../utils.js';
import { CustomDropdown } from '../../utils/dropdown.js';
import { showToast } from '../../utils/toast.js';
import { ConfirmDialog } from '../../utils/modal.js';

/** Provider 可选列表（与 main.js 一致） */
const PROVIDER_ITEMS = [
  { label: 'DashScope', value: 'dashscope' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '智谱 GLM', value: 'zhipu' },
  { label: 'Kimi (月之暗面)', value: 'moonshot' },
  { label: 'MiniMax', value: 'minimax' },
  { label: '阶跃星辰', value: 'stepfun' },
  { label: '零一万物', value: 'lingyi' },
  { label: '豆包 (字节)', value: 'doubao' },
  { label: '硅基流动', value: 'siliconflow' },
  { label: '讯飞星火', value: 'xunfei' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Local', value: 'local' },
];

export class ModelSettingsPage {
  constructor() {
    this._providerDropdown = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    // 销毁旧 Provider 下拉，避免 DOM 重建后 trigger 失效
    if (this._providerDropdown) {
      this._providerDropdown.destroy();
      this._providerDropdown = null;
    }

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">模型配置</h2>
      <p class="settings-page-desc">配置 AI 聊天模型 Provider、API Key 等参数</p>
      <hr class="settings-page-divider">

      <div class="settings-field">
        <label class="settings-field-label">已添加的模型</label>
        <div class="settings-model-list" id="settingsModelList">
          <div class="settings-model-empty">暂无已添加的模型</div>
        </div>
      </div>

      <div class="settings-field-group-title">模型参数</div>
      <div class="settings-field-group">
        <div class="settings-form" id="settingsModelForm">
        <div class="settings-field">
          <label class="settings-field-label">Provider</label>
          <div class="settings-provider-wrap">
            <button class="settings-input settings-provider-btn" id="settingsProvider">DashScope</button>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="settingsModel">Model</label>
          <input class="settings-input" id="settingsModel" type="text" placeholder="例如 qwen3.5-plus">
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="settingsApiKey">API Key</label>
          <div class="settings-input-wrap">
            <input class="settings-input" id="settingsApiKey" type="password" placeholder="输入 API Key">
            <button class="settings-input-btn" id="settingsApiKeyToggle" title="显示/隐藏">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="settingsBaseUrl">Base URL</label>
          <input class="settings-input" id="settingsBaseUrl" type="text" placeholder="https://dashscope.aliyuncs.com">
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="settingsMaxTokens">
            Max Tokens <span class="settings-field-hint">(单次输出上限, 0=不限制)</span>
          </label>
          <input class="settings-input" id="settingsMaxTokens" type="number" min="0" placeholder="0">
        </div>
      </div>
      </div>
      <div class="settings-save-bar">
        <button class="settings-save-btn" id="settingsModelSave">保存配置</button>
      </div>
    `;

    container.appendChild(page);

    this._bindModelEvents();
    this._loadModelConfig();
  }

  destroy() {
    if (this._providerDropdown) {
      this._providerDropdown.destroy();
      this._providerDropdown = null;
    }
    this._container = null;
  }

  // ==================== 事件绑定 ====================

  _bindModelEvents() {
    // Provider 下拉
    const providerBtn = document.getElementById('settingsProvider');
    if (providerBtn && !this._providerDropdown) {
      this._providerDropdown = new CustomDropdown({
        trigger: providerBtn,
        items: PROVIDER_ITEMS,
        placement: 'bottom-left',
      });
    }

    // API Key 显示/隐藏
    const toggleBtn = document.getElementById('settingsApiKeyToggle');
    const apiKeyInput = document.getElementById('settingsApiKey');
    if (toggleBtn && apiKeyInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    // 保存
    const saveBtn = document.getElementById('settingsModelSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._saveModelConfig());
    }
  }

  // ==================== 加载 / 保存 ====================

  async _loadModelConfig() {
    try {
      const data = await apiGet('/api/config/llm');

      // Provider
      if (this._providerDropdown) {
        this._providerDropdown.setSelectedValue(data.provider || 'dashscope');
      }

      const modelInput = document.getElementById('settingsModel');
      const baseUrlInput = document.getElementById('settingsBaseUrl');
      const maxTokensInput = document.getElementById('settingsMaxTokens');
      const apiKeyInput = document.getElementById('settingsApiKey');

      if (modelInput) modelInput.value = data.model || '';
      if (baseUrlInput) baseUrlInput.value = data.baseUrl || '';
      if (maxTokensInput) maxTokensInput.value = data.maxTokens || '';

      if (data.hasApiKey) {
        apiKeyInput.value = data.apiKeyMasked || '';
        apiKeyInput.dataset.masked = 'true';
      } else {
        apiKeyInput.value = '';
        delete apiKeyInput.dataset.masked;
      }

      this._renderModelHistoryList(data);
    } catch (e) {
      console.warn('加载模型配置失败:', e);
      showToast('加载模型配置失败', 'error');
    }
  }

  async _saveModelConfig() {
    const body = {
      provider: this._providerDropdown ? this._providerDropdown.getSelectedItem()?.value || 'dashscope' : 'dashscope',
      model: document.getElementById('settingsModel')?.value || '',
      baseUrl: document.getElementById('settingsBaseUrl')?.value || '',
      apiKey: document.getElementById('settingsApiKey')?.value || '',
      maxTokens: document.getElementById('settingsMaxTokens')?.value
        ? parseInt(document.getElementById('settingsMaxTokens').value, 10)
        : undefined,
    };

    const apiKeyInput = document.getElementById('settingsApiKey');
    if (apiKeyInput?.dataset.masked === 'true') {
      delete body.apiKey;
    }

    try {
      const resp = await fetch('/api/config/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());

      showToast('配置已保存', { type: 'success', duration: 2000 });
      await this._loadModelConfig();
    } catch (e) {
      showToast('保存失败: ' + e.message, { type: 'error', duration: 3000 });
    }
  }

  // ==================== 历史快照列表 ====================

  _renderModelHistoryList(data) {
    const list = document.getElementById('settingsModelList');
    if (!list) return;

    const models = data.modelHistory || [];

    if (models.length === 0) {
      list.innerHTML = '<div class="settings-model-empty">暂无已添加的模型</div>';
      return;
    }

    list.innerHTML = models.map((m, i) => `
      <div class="settings-model-item ${i === 0 ? 'active' : ''}">
        <div class="settings-model-item-info">
          <div class="settings-model-item-provider">${m.provider || ''}</div>
          <div class="settings-model-item-model">${m.model || m.name || ''}</div>
        </div>
        <div class="settings-model-item-actions">
          <button class="settings-model-item-delete" data-provider="${m.provider || ''}" data-model="${m.model || ''}" title="删除">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // 绑定事件
    list.querySelectorAll('.settings-model-item').forEach((card, i) => {
      const m = models[i];
      if (!m) return;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.settings-model-item-delete')) return;
        list.querySelectorAll('.settings-model-item.active').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this._fillModelForm(m);
      });
    });

    list.querySelectorAll('.settings-model-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const provider = btn.dataset.provider;
        const model = btn.dataset.model;
        if (!provider || !model) return;
        const confirmed = await ConfirmDialog.confirmDelete(`确定从历史记录中删除模型「${provider}:${model}」？`);
        if (!confirmed) return;

        try {
          const result = await apiPost('/api/config/llm/history', { provider, model }, 'DELETE');
          if (result.success) {
            showToast('已删除模型: ' + provider + ' · ' + model, { type: 'success', duration: 2000 });
            this._loadModelConfig();
          } else {
            showToast('删除失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
          }
        } catch (e) {
          console.warn('删除模型失败:', e);
          showToast('删除失败: ' + e.message, { type: 'error', duration: 3000 });
        }
      });
    });
  }

  /** 将历史模型填入当前表单 */
  _fillModelForm(m) {
    if (this._providerDropdown) {
      this._providerDropdown.setSelectedValue(m.provider || 'dashscope');
    }
    const modelInput = document.getElementById('settingsModel');
    const baseUrlInput = document.getElementById('settingsBaseUrl');
    const maxTokensInput = document.getElementById('settingsMaxTokens');
    if (modelInput) modelInput.value = m.model || '';
    if (baseUrlInput) baseUrlInput.value = m.baseUrl || '';
    if (maxTokensInput) maxTokensInput.value = m.maxTokens || '';
    showToast('已填入模型配置，点击「保存配置」生效', { type: 'info', duration: 2000 });
  }
}
