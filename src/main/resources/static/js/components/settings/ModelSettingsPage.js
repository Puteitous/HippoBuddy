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

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

/** Provider 可选列表（与 main.js 一致） */
const PROVIDER_ITEMS = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'DeepSeek Responses', value: 'deepseek-responses' },
  { label: 'DashScope', value: 'dashscope' },
  { label: 'OpenAI', value: 'openai' },
  { label: _t('settingsPage.zhipu'), value: 'zhipu' },
  { label: _t('settingsPage.moonshot'), value: 'moonshot' },
  { label: 'MiniMax', value: 'minimax' },
  { label: _t('settingsPage.stepfun'), value: 'stepfun' },
  { label: _t('settingsPage.lingyi'), value: 'lingyi' },
  { label: _t('settingsPage.doubao'), value: 'doubao' },
  { label: _t('settingsPage.siliconflow'), value: 'siliconflow' },
  { label: _t('settingsPage.xunfei'), value: 'xunfei' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Local', value: 'local' },
];

const MAX_TOKENS_ITEMS = [
  { label: 'Default', value: '0' },
  { label: '4,096', value: '4096' },
  { label: '8,192', value: '8192' },
  { label: '16,384', value: '16384' },
  { label: '32,768', value: '32768' },
  { label: '65,536', value: '65536' },
  { label: '131,072', value: '131072' },
];

/** 各 Provider 支持的 Reasoning Effort 档位（按官方协议取值；空数组 = 不支持该字段）
 *  - deepseek 系：官方 low / high / max 三档
 *  - openai：官方 low / medium / high 三档（无 max）
 *  - anthropic：无 effort 概念（extended thinking 用 budget_tokens），不显示
 */
const REASONING_EFFORT_ITEMS_BY_PROVIDER = {
  'deepseek': [
    { label: 'Default', value: '' },
    { label: 'low', value: 'low' },
    { label: 'high', value: 'high' },
    { label: 'max', value: 'max' },
  ],
  'deepseek-responses': [
    { label: 'Default', value: '' },
    { label: 'low', value: 'low' },
    { label: 'high', value: 'high' },
    { label: 'max', value: 'max' },
  ],
  'openai': [
    { label: 'Default', value: '' },
    { label: 'low', value: 'low' },
    { label: 'medium', value: 'medium' },
    { label: 'high', value: 'high' },
  ],
};

/** 获取指定 Provider 的 Reasoning Effort 可选档位（空数组 = 不支持） */
export const getReasoningEffortItems = (provider) => {
  const p = (provider || '').trim().toLowerCase();
  return REASONING_EFFORT_ITEMS_BY_PROVIDER[p] || [];
};

/** 判断 Provider 是否支持 Reasoning Effort 档位 */
export const supportsReasoningEffort = (provider) => getReasoningEffortItems(provider).length > 0;

/** 支持思考模式的 Provider 列表 */
const THINKING_SUPPORTED_PROVIDERS = ['deepseek', 'deepseek-responses', 'openai', 'anthropic'];
const VISION_SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google', 'gemini'];

/** 根据 provider value 获取显示用 label */
const getProviderLabel = (value) => {
  if (!value) return '';
  const item = PROVIDER_ITEMS.find(p => p.value === value);
  return item ? item.label : value;
};

export class ModelSettingsPage {
  constructor() {
    this._providerDropdown = null;
    this._maxTokensDropdown = null;
    this._editingIndex = -1; // -1 = 列表视图, >=0 = 编辑索引, -2 = 新建
    /** provider -> 默认 base URL，选择厂商时自动填充 */
    this._llmDefaults = {};
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    this._destroyDropdowns();

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">${_t('settingsPage.modelTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.modelDesc')}</p>
      <hr class="settings-page-divider">

      <div class="settings-item-list-header">
        <h3>${_t('settingsPage.modelList')}</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-icon" id="settingsModelRefresh" title="${_t('settingsPage.modelRefresh')}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="settings-btn settings-btn-primary" id="settingsModelCreate">+ ${_t('settingsPage.modelAdd')}</button>
        </div>
      </div>

      <div class="settings-loading" id="settingsModelLoading" style="display:none;">${_t('settingsPage.modelLoading')}</div>
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
    if (this._reasoningEffortDropdown) {
      this._reasoningEffortDropdown.destroy();
      this._reasoningEffortDropdown = null;
    }
  }

  /** 判断指定 Provider 是否支持思考模式 */
  _isThinkingSupported(provider) {
    if (!provider) return false;
    return THINKING_SUPPORTED_PROVIDERS.includes(provider.trim().toLowerCase());
  }

  /** 判断指定 Provider 是否支持 Reasoning Effort 档位（有合法档位集才支持） */
  _supportsReasoningEffort(provider) {
    return supportsReasoningEffort(provider);
  }

  _isVisionSupported(provider, model) {
    if (!provider) return false;
    const p = provider.trim().toLowerCase();
    // provider 级别支持
    if (VISION_SUPPORTED_PROVIDERS.includes(p)) return true;
    // 模型名判断（常见视觉模型）
    if (model) {
      const m = model.trim().toLowerCase();
      const visionKeywords = ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-5',
        'o1', 'o3', 'o4',
        'claude-3', 'claude-4', 'claude-sonnet-4', 'claude-opus-4', 'claude-opus-5',
        'llava', 'bakllava', 'qwen', 'vl', 'cogvlm', 'glm-4v', 'glm-5v', 'glm-ocr', 'internvl', 'minicpm',
        'kimi'];
      return visionKeywords.some(kw => m.includes(kw));
    }
    return false;
  }

  /** 切换厂商时自动填充 Base URL（为空或仍是上一个厂商默认地址时替换，用户手动输入则保留） */
  _maybeAutofillBaseUrl(newProvider) {
    const baseUrlInput = document.getElementById('modelEditBaseUrl');
    if (!baseUrlInput || !this._llmDefaults) return;
    const oldProvider = this._providerDropdown?.getSelectedItem()?.value;
    const oldDefault = this._llmDefaults[oldProvider] || '';
    const newDefault = this._llmDefaults[newProvider] || '';
    const cur = baseUrlInput.value.trim();
    if (newDefault && (!cur || cur === oldDefault)) {
      baseUrlInput.value = newDefault;
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
      // 拉取各厂商默认 base URL（选择厂商时自动填充，失败静默降级）
      apiGet('/api/config/llm/defaults').then(d => { this._llmDefaults = d || {}; }).catch(() => {});
      const data = await apiGet('/api/config/llm');
      this._renderModelHistoryList(data);
    } catch (e) {
      console.warn('加载模型配置失败:', e);
      if (errorEl) {
        errorEl.textContent = _t('settingsPage.modelLoadFailed');
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
      list.innerHTML = `<div class="settings-model-empty">${_t('settingsPage.modelEmpty')}</div>`;
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

    // 保存当前列表数据，供打开编辑器时按 key 查找
    this._modelListData = models;

    // 表头
    const headerHtml = `
      <div class="settings-model-header">
        <span class="settings-model-header-provider">${_t('settingsPage.modelProviderCol')}</span>
        <span class="settings-model-header-model">${_t('settingsPage.modelModelCol')}</span>
        <span class="settings-model-header-enabled">${_t('settingsPage.modelActionCol')}</span>
      </div>
    `;

    // 每行：服务商 | 模型 | 删除
    const itemsHtml = models.map((m, i) => {
      const isActive = i === activeIndex;
      return `
        <div class="settings-model-item ${isActive ? 'active' : ''}">
          <span class="settings-model-item-provider" title="${m.provider || ''}">${getProviderLabel(m.provider)}</span>
          <span class="settings-model-item-model" title="${m.model || m.name || ''}">${m.model || m.name || ''}</span>
          <button class="settings-model-item-delete" data-provider="${m.provider || ''}" data-model="${m.model || ''}" title="${_t('settingsPage.modelDeleteTitle')}">
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
        this._showModelEditor(m);
      });
    });

    // 删除按钮事件
    list.querySelectorAll('.settings-model-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const provider = btn.dataset.provider;
        const model = btn.dataset.model;
        if (!provider || !model) return;
        const confirmed = await ConfirmDialog.confirmDelete(_t('settingsPage.modelDeleteConfirm') + provider + ':' + model + _t('settingsPage.modelDeleteConfirmEnd'));
        if (!confirmed) return;

        try {
          const result = await apiPost('/api/config/llm/history', { provider, model }, 'DELETE');
          if (result.success) {
            showToast(_t('settingsPage.modelDeleted') + provider + ' · ' + model, { type: 'success', duration: 2000 });
            this._loadModelConfig();
          } else {
            showToast(_t('settingsPage.modelDeleteFailed') + (result.message || _t('settingsPage.modelUnknownError')), { type: 'error', duration: 3000 });
          }
        } catch (e) {
          console.warn('删除模型失败:', e);
          showToast(_t('settingsPage.modelDeleteFailed') + e.message, { type: 'error', duration: 3000 });
        }
      });
    });
  }

  // ==================== 打开编辑器 ====================

  _showModelEditor(model) {
    const listEl = document.getElementById('settingsModelList');
    if (!listEl) return;

    // 直接使用传入的 model 对象，避免索引漂移
    this._editingModel = model;
    this._editingIndex = this._modelListData?.indexOf(model) ?? -1;
    this._renderModelEditor(model, false);
  }

  _showCreateModel() {
    this._editingIndex = -2;
    this._editingModel = null;
    this._renderModelEditor(null, true);
  }

  _renderModelEditor(model, isNew) {
    const listEl = document.getElementById('settingsModelList');
    if (!listEl) return;

    this._destroyDropdowns();

    // 隐藏列表操作按钮
    const headerActions = document.querySelector('#settingsModelCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    const title = isNew ? _t('settingsPage.modelCreate') : _t('settingsPage.modelEdit') + getProviderLabel(model.provider) + ' · ' + (model.model || model.name || '');
    const saveText = isNew ? _t('settingsPage.modelCreateAction') : _t('settingsPage.modelSaveAction');
    const provider = model?.provider || 'deepseek';
    const modelName = model?.model || model?.name || '';
    // 新建时预填默认厂商(deepseek)的 base URL
    const baseUrl = model?.baseUrl || (isNew ? (this._llmDefaults?.['deepseek'] || '') : '');
    const maxTokens = model?.maxTokens ?? 0;
    const hasApiKey = model?.hasApiKey;
    const apiKeyValue = model?.apiKeyMasked || '';
    const thinkingEnabled = model?.thinkingEnabled !== undefined ? model.thinkingEnabled : true;
    const reasoningEffort = model?.reasoningEffort ?? '';
    const isThinkingSupported = this._isThinkingSupported(provider);
    const isReasoningSupported = this._supportsReasoningEffort(provider);
    // 初始 effort 值不在当前 Provider 合法档位内时回退 Default（如 openai 下残留的 max）
    const effortItems = getReasoningEffortItems(provider);
    const normalizedEffort = effortItems.some(i => i.value === reasoningEffort) ? reasoningEffort : '';

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">${title}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="modelEditBack">${_t('settingsPage.modelBackToList')}</button>
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
              <input class="settings-input" id="modelEditModel" type="text" value="${modelName}" placeholder="${_t('settingsPage.modelNamePh')}" style="width:220px;">
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label" for="modelEditApiKey">API Key</label>
            <div class="settings-field-body">
              <div class="settings-input-wrap" style="width:220px;">
                <input class="settings-input" id="modelEditApiKey" type="password" value="${apiKeyValue}" placeholder="${_t('settingsPage.modelApiKeyPlaceholder')}">
                <button class="settings-input-btn" id="modelEditApiKeyToggle" title="${_t('settingsPage.modelShowHide')}">
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
              <input class="settings-input" id="modelEditBaseUrl" type="text" value="${baseUrl}" placeholder="${_t('settingsPage.modelBaseUrlPh')}" style="width:220px;">
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>Max Tokens</div>
              <div class="settings-field-hint">${_t('settingsPage.modelMaxTokensHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="modelEditMaxTokens">${maxTokens}</button>
            </div>
          </div>

          <!-- 思考模式配置（仅支持思考模式的 Provider 显示） -->
          <div class="settings-field-horizontal" id="modelEditThinkingSection" style="${isThinkingSupported ? '' : 'display:none;'}">
            <div class="settings-field-label">
              <div>Thinking Mode</div>
              <div class="settings-field-hint">${_t('settingsPage.modelThinkingHint')}</div>
            </div>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="modelEditThinkingEnabled" ${thinkingEnabled ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal" id="modelEditReasoningSection" style="${(isThinkingSupported && isReasoningSupported) ? '' : 'display:none;'}">
            <div class="settings-field-label">
              <div>Reasoning Effort</div>
              <div class="settings-field-hint">${_t('settingsPage.modelReasoningHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="modelEditReasoningEffort" ${(thinkingEnabled && isReasoningSupported) ? '' : 'disabled'}>${normalizedEffort || 'Default'}</button>
            </div>
          </div>

          <!-- 视觉能力指示 -->
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.vision')}</div>
              <div class="settings-field-hint">${_t('settingsPage.visionHint')}</div>
            </div>
            <div class="settings-field-body">
              <span class="settings-badge" id="modelEditVisionBadge" style="font-size:13px;padding:3px 10px;border-radius:4px;display:inline-flex;align-items:center;gap:4px;">
                ${this._isVisionSupported(provider, modelName)
                  ? '<span style="color:#22c55e">●</span> ' + _t('settingsPage.visionSupported')
                  : '<span style="color:#999">●</span> ' + _t('settingsPage.visionNotSupported')}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    // 初始化 Provider 下拉
    const providerBtn = document.getElementById('modelEditProvider');
    if (providerBtn) {
      this._providerDropdown = new CustomDropdown({
        trigger: providerBtn,
        items: PROVIDER_ITEMS,
        placement: 'bottom-left',
        onSelect: (item) => {
          // 切换厂商时，若 Base URL 为空或仍是上一个厂商的默认地址，则自动填充新厂商默认地址
          this._maybeAutofillBaseUrl(item.value);
          // Provider 变更时：显示/隐藏思考模式配置区，并按 Provider 更新档位选项
          const thinkingSupported = this._isThinkingSupported(item.value);
          const reasoningSupported = this._supportsReasoningEffort(item.value);
          const thinkingSection = document.getElementById('modelEditThinkingSection');
          const reasoningSection = document.getElementById('modelEditReasoningSection');
          if (thinkingSection) thinkingSection.style.display = thinkingSupported ? '' : 'none';
          if (reasoningSection) reasoningSection.style.display = (thinkingSupported && reasoningSupported) ? '' : 'none';

          // 档位选项随 Provider 切换；当前选中值不在新集内时回退 Default
          if (this._reasoningEffortDropdown) {
            const items = getReasoningEffortItems(item.value);
            this._reasoningEffortDropdown.setItems(items);
            const current = this._reasoningEffortDropdown.getSelectedItem();
            if (!items.some(i => i.value === (current ? current.value : null))) {
              this._reasoningEffortDropdown.setSelectedValue('');
            }
          }
        },
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

    // 初始化 Reasoning Effort 下拉（选项随 Provider 而定）
    const reasoningBtn = document.getElementById('modelEditReasoningEffort');
    if (reasoningBtn) {
      this._reasoningEffortDropdown = new CustomDropdown({
        trigger: reasoningBtn,
        items: effortItems,
        placement: 'bottom-left',
      });
      this._reasoningEffortDropdown.setSelectedValue(normalizedEffort);
    }

    // Thinking Mode 关闭时置灰 Reasoning Effort（仅开启思考时才可调档位）
    const thinkingCheckbox = document.getElementById('modelEditThinkingEnabled');
    if (thinkingCheckbox) {
      const syncReasoningDisabled = () => {
        if (reasoningBtn) reasoningBtn.disabled = !thinkingCheckbox.checked;
      };
      thinkingCheckbox.addEventListener('change', syncReasoningDisabled);
      syncReasoningDisabled(); // 初始状态对齐
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
    const provider = this._providerDropdown?.getSelectedItem()?.value || 'deepseek';
    const modelValue = document.getElementById('modelEditModel')?.value?.trim() || '';
    const baseUrl = document.getElementById('modelEditBaseUrl')?.value?.trim() || '';
    const maxTokens = this._maxTokensDropdown?.getSelectedItem()?.value
      ? parseInt(this._maxTokensDropdown.getSelectedItem().value, 10)
      : undefined;
    const apiKeyInput = document.getElementById('modelEditApiKey');
    const saveBtn = document.getElementById('modelEditSave');

    if (!modelValue) {
      showToast(_t('settingsPage.modelNameRequired'), { type: 'warning', duration: 2000 });
      return;
    }

    const body = {
      provider,
      model: modelValue,
      baseUrl,
      maxTokens,
      apiKey: apiKeyInput?.value || '',
    };

    // 编辑已有模型时，携带被编辑条目的 key(provider:model)，供后端定位并替换旧快照，
    // 避免保存后旧条目和新条目同时出现在历史列表中
    if (!isNew && this._editingModel) {
      const oldProvider = this._editingModel.provider || '';
      const oldModel = this._editingModel.model || this._editingModel.name || '';
      if (oldProvider && oldModel) {
        body.editingKey = oldProvider + ':' + oldModel;
      }
    }

    // 思考模式参数（仅支持的 Provider 才发送）
    if (this._isThinkingSupported(provider)) {
      const thinkingCheckbox = document.getElementById('modelEditThinkingEnabled');
      if (thinkingCheckbox) {
        body.thinkingEnabled = thinkingCheckbox.checked;
      }
      // Reasoning Effort 仅对支持档位的 Provider 发送（如 anthropic 无 effort 概念，不发送）
      if (this._supportsReasoningEffort(provider)) {
        const effortDropdown = this._reasoningEffortDropdown;
        if (effortDropdown) {
          body.reasoningEffort = effortDropdown.getSelectedItem()?.value || '';
        }
      }
    }

    if (apiKeyInput?.dataset.masked === 'true') {
      delete body.apiKey;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = isNew ? _t('settingsPage.modelCreating') : _t('settingsPage.modelSaving');
    }

    try {
      const resp = await fetch('/api/config/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());

      showToast((isNew ? _t('settingsPage.modelCreated') : _t('settingsPage.modelSaved')) + provider + ' · ' + modelValue, { type: 'success', duration: 2000 });
      setTimeout(() => this._closeEditor(), 400);
    } catch (e) {
      console.warn(isNew ? '创建模型失败:' : '保存模型失败:', e);
      showToast((isNew ? _t('settingsPage.modelCreateFailed') : _t('settingsPage.modelSaveFailed')) + e.message, { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isNew ? _t('settingsPage.modelCreateAction') : _t('settingsPage.modelSaveAction');
      }
    }
  }

  _closeEditor() {
    this._destroyDropdowns();
    this._editingIndex = -1;
    this._editingModel = null;
    const headerActions = document.querySelector('#settingsModelCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = '';
    this._loadModelConfig();
  }
}
