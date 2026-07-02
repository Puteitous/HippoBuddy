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

const MAX_TOKENS_ITEMS = [
  { label: '0 (不限制)', value: '0' },
  { label: '4,096', value: '4096' },
  { label: '8,192', value: '8192' },
  { label: '16,384 (默认)', value: '16384' },
  { label: '32,768', value: '32768' },
  { label: '65,536', value: '65536' },
  { label: '131,072', value: '131072' },
];

export class ModelSettingsPage {
  constructor() {
    this._providerDropdown = null;
    this._maxTokensDropdown = null;
    this._editingIndex = -1; // -1 = 列表视图, >=0 = 编辑索引, -2 = 新建
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    this._destroyDropdowns();

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">模型配置</h2>
      <p class="settings-page-desc">配置 AI 聊天模型 Provider、API Key 等参数</p>
      <hr class="settings-page-divider">

      <div class="settings-item-list-header">
        <h3>模型列表</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-icon" id="settingsModelRefresh" title="刷新">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="settings-btn settings-btn-primary" id="settingsModelCreate">+ 添加模型</button>
        </div>
      </div>

      <div class="settings-loading" id="settingsModelLoading" style="display:none;">加载中...</div>
      <div class="settings-items-error" id="settingsModelError" style="display:none;"></div>
      <div id="settingsModelList"></div>
    `;

    container.appendChild(page);

    document.getElementById('settingsModelRefresh')?.addEventListener('click', () => this._loadModelConfig());
    document.getElementById('settingsModelCreate')?.addEventListener('click', () => this._showCreateModel());

    this._loadModelConfig();
  }

  destroy() {
    this._destroyDropdowns();
    this._editingIndex = -1;
    this._container = null;
  }

  _destroyDropdowns() {
    if (this._providerDropdown) {
      this._providerDropdown.destroy();
      this._providerDropdown = null;
    }
    if (this._maxTokensDropdown) {
      this._maxTokensDropdown.destroy();
      this._maxTokensDropdown = null;
    }
  }

  // ==================== 加载列表 ====================

  async _loadModelConfig() {
    const loadingEl = document.getElementById('settingsModelLoading');
    const errorEl = document.getElementById('settingsModelError');
    const listEl = document.getElementById('settingsModelList');
    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';

    try {
      const data = await apiGet('/api/config/llm');
      this._renderModelHistoryList(data);
    } catch (e) {
      console.warn('加载模型配置失败:', e);
      if (errorEl) {
        errorEl.textContent = '加载失败，请重试';
        errorEl.style.display = 'block';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
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

    // 用当前配置的 provider+model 匹配历史列表，匹配到的标为 active
    const currentProvider = data.provider;
    const currentModel = data.model;
    let activeIndex = models.findIndex(m =>
      m.provider === currentProvider && (m.model === currentModel || m.name === currentModel)
    );
    if (activeIndex === -1) activeIndex = 0;

    // 把 active 项移到数组最前面，排在列表顶部
    if (activeIndex > 0) {
      const [item] = models.splice(activeIndex, 1);
      models.unshift(item);
      activeIndex = 0;
    }

    // 表头
    const headerHtml = `
      <div class="settings-model-header">
        <span class="settings-model-header-provider">服务商</span>
        <span class="settings-model-header-model">模型</span>
        <span class="settings-model-header-enabled">操作</span>
      </div>
    `;

    // 每行：服务商 | 模型 | 删除
    const itemsHtml = models.map((m, i) => {
      const isActive = i === activeIndex;
      return `
        <div class="settings-model-item ${isActive ? 'active' : ''}">
          <span class="settings-model-item-provider" title="${m.provider || ''}">${m.provider || ''}</span>
          <span class="settings-model-item-model" title="${m.model || m.name || ''}">${m.model || m.name || ''}</span>
          <button class="settings-model-item-delete" data-provider="${m.provider || ''}" data-model="${m.model || ''}" title="删除">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    const prevScrollTop = list.scrollTop;
    list.innerHTML = `<div class="settings-model-list">${headerHtml}${itemsHtml}</div>`;
    list.scrollTop = prevScrollTop;

    // 绑定事件：点击行 → 打开内联编辑器
    list.querySelectorAll('.settings-model-item').forEach((card, i) => {
      const m = models[i];
      if (!m) return;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.settings-model-item-delete')) return;
        this._showModelEditor(i);
      });
    });

    // 删除按钮事件
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

  // ==================== 打开编辑器 ====================

  _showModelEditor(index) {
    const listEl = document.getElementById('settingsModelList');
    if (!listEl) return;

    // 从 DOM 缓存的 models 已不可用，重新加载后打开编辑器
    // 直接读 data 属性
    this._editingIndex = index;
    this._loadModelConfigForEdit();
  }

  async _loadModelConfigForEdit() {
    try {
      const data = await apiGet('/api/config/llm');
      const models = data.modelHistory || [];
      const model = models[this._editingIndex];
      if (!model) {
        this._editingIndex = -1;
        this._renderModelHistoryList(data);
        return;
      }
      this._renderModelEditor(model, false);
    } catch (e) {
      console.warn('加载模型配置失败:', e);
      showToast('加载失败', { type: 'error', duration: 3000 });
    }
  }

  _showCreateModel() {
    this._editingIndex = -2;
    this._renderModelEditor(null, true);
  }

  _renderModelEditor(model, isNew) {
    const listEl = document.getElementById('settingsModelList');
    if (!listEl) return;

    this._destroyDropdowns();

    // 隐藏列表操作按钮
    const headerActions = document.querySelector('#settingsModelCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    const title = isNew ? '添加模型' : ('编辑模型: ' + (model.provider || '') + ' · ' + (model.model || model.name || ''));
    const saveText = isNew ? '创建' : '保存';
    const provider = model?.provider || 'dashscope';
    const modelName = model?.model || model?.name || '';
    const baseUrl = model?.baseUrl || '';
    const maxTokens = model?.maxTokens ?? 16384;
    const hasApiKey = model?.hasApiKey;
    const apiKeyValue = model?.apiKeyMasked || '';

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">${title}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="modelEditBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="modelEditSave">${saveText}</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">Provider</label>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="modelEditProvider">${provider}</button>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label" for="modelEditModel">Model</label>
            <div class="settings-field-body">
              <input class="settings-input" id="modelEditModel" type="text" value="${modelName}" placeholder="例如 qwen3.5-plus" style="width:220px;">
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label" for="modelEditApiKey">API Key</label>
            <div class="settings-field-body">
              <div class="settings-input-wrap" style="width:220px;">
                <input class="settings-input" id="modelEditApiKey" type="password" value="${apiKeyValue}" placeholder="输入 API Key">
                <button class="settings-input-btn" id="modelEditApiKeyToggle" title="显示/隐藏">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label" for="modelEditBaseUrl">Base URL</label>
            <div class="settings-field-body">
              <input class="settings-input" id="modelEditBaseUrl" type="text" value="${baseUrl}" placeholder="https://dashscope.aliyuncs.com" style="width:220px;">
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>Max Tokens</div>
              <div class="settings-field-hint">(单次输出上限，含思维链+回答，0=不限制)</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="modelEditMaxTokens">${maxTokens}</button>
            </div>
          </div>
        </div>
        <div class="settings-editor-status" id="modelEditStatus" style="display:none;"></div>
      </div>
    `;

    // 初始化 Provider 下拉
    const providerBtn = document.getElementById('modelEditProvider');
    if (providerBtn) {
      this._providerDropdown = new CustomDropdown({
        trigger: providerBtn,
        items: PROVIDER_ITEMS,
        placement: 'bottom-left',
      });
      this._providerDropdown.setSelectedValue(provider);
    }

    // 初始化 Max Tokens 下拉
    const maxTokensBtn = document.getElementById('modelEditMaxTokens');
    if (maxTokensBtn) {
      this._maxTokensDropdown = new CustomDropdown({
        trigger: maxTokensBtn,
        items: MAX_TOKENS_ITEMS,
        placement: 'bottom-left',
      });
      this._maxTokensDropdown.setSelectedValue(String(maxTokens));
    }

    // API Key 显示/隐藏
    const toggleBtn = document.getElementById('modelEditApiKeyToggle');
    const apiKeyInput = document.getElementById('modelEditApiKey');
    if (toggleBtn && apiKeyInput) {
      if (hasApiKey) apiKeyInput.dataset.masked = 'true';
      toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    // 返回
    document.getElementById('modelEditBack')?.addEventListener('click', () => this._closeEditor());

    // 保存
    document.getElementById('modelEditSave')?.addEventListener('click', () => this._handleSaveEditor(isNew));
  }

  async _handleSaveEditor(isNew) {
    const provider = this._providerDropdown?.getSelectedItem()?.value || 'dashscope';
    const modelValue = document.getElementById('modelEditModel')?.value?.trim() || '';
    const baseUrl = document.getElementById('modelEditBaseUrl')?.value?.trim() || '';
    const maxTokens = this._maxTokensDropdown?.getSelectedItem()?.value
      ? parseInt(this._maxTokensDropdown.getSelectedItem().value, 10)
      : undefined;
    const apiKeyInput = document.getElementById('modelEditApiKey');
    const statusEl = document.getElementById('modelEditStatus');
    const saveBtn = document.getElementById('modelEditSave');

    if (!modelValue) {
      if (statusEl) {
        statusEl.textContent = '⚠️ Model 名称不能为空';
        statusEl.className = 'settings-editor-status settings-editor-status-error';
        statusEl.style.display = 'block';
      }
      return;
    }

    const body = {
      provider,
      model: modelValue,
      baseUrl,
      maxTokens,
      apiKey: apiKeyInput?.value || '',
    };

    if (apiKeyInput?.dataset.masked === 'true') {
      delete body.apiKey;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = isNew ? '创建中…' : '保存中…';
    }

    try {
      const resp = await fetch('/api/config/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());

      if (statusEl) {
        statusEl.textContent = '✓ 已' + (isNew ? '创建' : '保存');
        statusEl.className = 'settings-editor-status settings-editor-status-success';
        statusEl.style.display = 'block';
      }
      if (saveBtn) saveBtn.textContent = '✓ 已' + (isNew ? '创建' : '保存');
      setTimeout(() => this._closeEditor(), 600);
    } catch (e) {
      console.warn(isNew ? '创建模型失败:' : '保存模型失败:', e);
      if (statusEl) {
        statusEl.textContent = '⚠️ ' + e.message;
        statusEl.className = 'settings-editor-status settings-editor-status-error';
        statusEl.style.display = 'block';
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isNew ? '创建' : '保存';
      }
    }
  }

  _closeEditor() {
    this._destroyDropdowns();
    this._editingIndex = -1;
    const headerActions = document.querySelector('#settingsModelCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = '';
    this._loadModelConfig();
  }
}
