/**
 * ModelSettingsPage - 模型配置
 *
 * 列表(模型历史快照)+ 创建/编辑/删除
 *
 * 思考模式 / Reasoning Effort / 视觉能力根据 Provider 动态显示。
 * PUT /api/config/llm 时携带完整 body;编辑已有快照时携带 editingKey=旧 provider:model,
 * 便于后端定位并替换旧快照,避免保存后旧条目和新条目并存。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { showToast } from './toastStore';
import { getReasoningItems, supportsReasoningEffort } from '@/utils/reasoning-effort';
import type { LlmConfig, ModelSnapshot } from '@/types';

/** Provider 可选列表(与旧 main.js 一致) */
const PROVIDER_ITEMS: { label: string; value: string }[] = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'DeepSeek Responses', value: 'deepseek-responses' },
  { label: 'DashScope', value: 'dashscope' },
  { label: 'OpenAI', value: 'openai' },
  { label: '智谱', value: 'zhipu' },
  { label: '月之暗面', value: 'moonshot' },
  { label: 'MiniMax', value: 'minimax' },
  { label: '阶跃星辰', value: 'stepfun' },
  { label: '零一万物', value: 'lingyi' },
  { label: '豆包', value: 'doubao' },
  { label: '硅基流动', value: 'siliconflow' },
  { label: '讯飞', value: 'xunfei' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Local', value: 'local' },
];

const MAX_TOKENS_ITEMS = [
  { label: '默认', value: '0' },
  { label: '4,096', value: '4096' },
  { label: '8,192', value: '8192' },
  { label: '16,384', value: '16384' },
  { label: '32,768', value: '32768' },
  { label: '65,536', value: '65536' },
  { label: '131,072', value: '131072' },
];

const THINKING_SUPPORTED_PROVIDERS = ['deepseek', 'deepseek-responses', 'openai', 'anthropic'];
const VISION_SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google', 'gemini'];

const VISION_KEYWORDS = [
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-5',
  'o1', 'o3', 'o4',
  'claude-3', 'claude-4', 'claude-sonnet-4', 'claude-opus-4', 'claude-opus-5',
  'llava', 'bakllava', 'qwen', 'vl', 'cogvlm', 'glm-4v', 'glm-5v', 'glm-ocr', 'internvl', 'minicpm',
  'kimi',
];

function isThinkingSupported(provider: string) {
  if (!provider) return false;
  return THINKING_SUPPORTED_PROVIDERS.includes(provider.trim().toLowerCase());
}

function isVisionSupported(provider: string, model: string) {
  if (!provider) return false;
  const p = provider.trim().toLowerCase();
  if (VISION_SUPPORTED_PROVIDERS.includes(p)) return true;
  if (model) {
    const m = model.trim().toLowerCase();
    return VISION_KEYWORDS.some((kw) => m.includes(kw));
  }
  return false;
}

function getProviderLabel(value: string) {
  if (!value) return '';
  const item = PROVIDER_ITEMS.find((p) => p.value === value);
  return item ? item.label : value;
}

interface EditorState {
  /** null = 新建 */
  editingModel: ModelSnapshot | null;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyMasked: boolean;
  maxTokens: string;
  thinkingEnabled: boolean;
  reasoningEffort: string;
}

function emptyEditor(): EditorState {
  return {
    editingModel: null,
    provider: 'deepseek',
    model: '',
    baseUrl: '',
    apiKey: '',
    hasApiKey: false,
    apiKeyMasked: false,
    maxTokens: '0',
    thinkingEnabled: true,
    reasoningEffort: '',
  };
}

function modelToEditor(m: ModelSnapshot): EditorState {
  const effortItems = getReasoningItems(m.provider);
  return {
    editingModel: m,
    provider: m.provider || 'deepseek',
    model: m.model || '',
    baseUrl: m.baseUrl || '',
    apiKey: m.apiKeyMasked || '',
    hasApiKey: !!m.apiKeyMasked,
    apiKeyMasked: !!m.apiKeyMasked,
    maxTokens: String(m.maxTokens ?? 0),
    thinkingEnabled: m.thinkingEnabled !== undefined ? m.thinkingEnabled : true,
    reasoningEffort: effortItems.some((i) => i.value === (m.reasoningEffort || ''))
      ? m.reasoningEffort || ''
      : '',
  };
}

type PageMode = 'list' | 'edit' | 'create';

export function ModelSettingsPage() {
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [models, setModels] = useState<ModelSnapshot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>('list');
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  /** provider -> 默认 base URL，选择厂商时自动填充 */
  const [defaultsByProvider, setDefaultsByProvider] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await configApi.getLlm();
      // 拉取各厂商默认 base URL（失败时静默降级，不影响模型列表加载）
      configApi
        .getLlmDefaults()
        .then((d) => setDefaultsByProvider(d || {}))
        .catch(() => {});
      setLlm(data);
      const list = data.modelHistory || [];
      let idx = list.findIndex(
        (m) =>
          m.provider === data.provider && m.model === data.model,
      );
      if (idx === -1) idx = 0;
      // 把 active 项移到最前
      if (list.length > 0 && idx > 0) {
        const [active] = list.splice(idx, 1);
        list.unshift(active);
        idx = 0;
      }
      setModels(list);
      setActiveIndex(idx);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (m: ModelSnapshot) => {
    setEditor(modelToEditor(m));
    setApiKeyVisible(false);
    setPageMode('edit');
  };

  const openCreate = () => {
    // 新建时预填当前默认厂商(deepseek)的 base URL
    setEditor({ ...emptyEditor(), baseUrl: defaultsByProvider['deepseek'] || '' });
    setApiKeyVisible(false);
    setPageMode('create');
  };

  const closeEditor = () => {
    setPageMode('list');
    setEditor(emptyEditor());
    load();
  };

  const handleProviderChange = (provider: string) => {
    const effortItems = getReasoningItems(provider);
    setEditor((prev) => {
      const oldDefault = defaultsByProvider[prev.provider] || '';
      const newDefault = defaultsByProvider[provider] || '';
      // 仅当用户尚未手动填写（为空或仍是上一个厂商的默认地址）时自动填充
      const baseUrl =
        !prev.baseUrl || prev.baseUrl === oldDefault ? newDefault : prev.baseUrl;
      return {
        ...prev,
        provider,
        baseUrl,
        reasoningEffort: effortItems.some((i) => i.value === prev.reasoningEffort)
          ? prev.reasoningEffort
          : '',
      };
    });
  };

  const handleSave = async () => {
    if (saving) return;
    const modelValue = editor.model.trim();
    if (!modelValue) {
      showToast('请输入模型名称', { type: 'warning', duration: 2000 });
      return;
    }
    const isNew = pageMode === 'create';
    const body: Record<string, unknown> = {
      provider: editor.provider,
      model: modelValue,
      baseUrl: editor.baseUrl.trim(),
      maxTokens: parseInt(editor.maxTokens, 10),
      apiKey: editor.apiKey,
    };
    // 编辑已有:携带 editingKey 让后端移除旧快照
    if (!isNew && editor.editingModel) {
      const oldProvider = editor.editingModel.provider || '';
      const oldModel = editor.editingModel.model || '';
      if (oldProvider && oldModel) {
        body.editingKey = `${oldProvider}:${oldModel}`;
      }
    }
    // 思考模式参数:仅支持的 Provider 才发送
    if (isThinkingSupported(editor.provider)) {
      body.thinkingEnabled = editor.thinkingEnabled;
      if (supportsReasoningEffort(editor.provider)) {
        body.reasoningEffort = editor.reasoningEffort;
      }
    }
    // 如果 apiKey 仍是遮掩形式,不修改后端 apiKey
    if (editor.apiKeyMasked) {
      delete body.apiKey;
    }

    setSaving(true);
    try {
      await configApi.updateLlm(body);
      showToast((isNew ? '模型已创建:' : '模型已保存:') + editor.provider + ' · ' + modelValue, {
        type: 'success',
        duration: 2000,
      });
      setTimeout(closeEditor, 400);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast((isNew ? '创建失败:' : '保存失败:') + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: ModelSnapshot) => {
    if (!m.provider || !m.model) return;
    if (!window.confirm(`确定删除模型快照「${m.provider}:${m.model}」?`)) return;
    try {
      const result = await configApi.deleteHistorySnapshot(m.provider, m.model);
      if (result.success) {
        showToast('已删除:' + m.provider + ' · ' + m.model, {
          type: 'success',
          duration: 2000,
        });
        load();
      } else {
        showToast('删除失败:' + (!result.removed ? '未找到记录' : '未知错误'), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('删除失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const renderList = () => {
    if (models.length === 0) {
      return <div className="settings-model-empty">暂无模型,点击右上角「+ 新建」添加第一个</div>;
    }
    return (
      <div className="settings-model-list">
        <div className="settings-model-header">
          <span className="settings-model-header-provider">服务商</span>
          <span className="settings-model-header-model">模型</span>
          <span className="settings-model-header-action">操作</span>
        </div>
        {models.map((m, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={`${m.provider}:${m.model}`}
              className={`settings-model-item${isActive ? ' active' : ''}`}
              onClick={() => openEdit(m)}
            >
              <span className="settings-model-item-provider" title={m.provider}>
                {getProviderLabel(m.provider)}
              </span>
              <span className="settings-model-item-model" title={m.model}>
                {m.model}
              </span>
              <button
                type="button"
                className="settings-model-item-delete"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(m);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderEditor = () => {
    const isNew = pageMode === 'create';
    const title = isNew
      ? '新建模型'
      : `编辑模型:${getProviderLabel(editor.provider)} · ${editor.model}`;
    const thinkingSupported = isThinkingSupported(editor.provider);
    const reasoningSupported = supportsReasoningEffort(editor.provider);
    const effortItems = getReasoningItems(editor.provider);
    const visionSupported = isVisionSupported(editor.provider, editor.model);

    return (
      <div className="settings-editor">
        <div className="settings-editor-header">
          <span className="settings-editor-title">{title}</span>
          <div className="settings-editor-actions">
            <button
              type="button"
              className="settings-editor-btn"
              onClick={closeEditor}
              disabled={saving}
            >
              返回列表
            </button>
            <button
              type="button"
              className="settings-editor-btn settings-editor-btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {isNew ? '创建' : '保存'}
            </button>
          </div>
        </div>
        <div className="settings-editor-fields">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">Provider</label>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={editor.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={saving}
              >
                {PROVIDER_ITEMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">Model</label>
            <div className="settings-field-body">
              <input
                className="settings-input"
                type="text"
                style={{ width: 240 }}
                value={editor.model}
                placeholder="deepseek-chat"
                onChange={(e) => setEditor({ ...editor, model: e.target.value })}
              />
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">API Key</label>
            <div className="settings-field-body">
              <div className="settings-input-wrap" style={{ width: 240 }}>
                <input
                  className="settings-input"
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={editor.apiKey}
                  placeholder={editor.apiKeyMasked ? '已配置(默认遮掩,修改请重新输入)' : '输入 API Key'}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      apiKey: e.target.value,
                      apiKeyMasked: false,
                      hasApiKey: false,
                    })
                  }
                />
                <button
                  type="button"
                  className="settings-input-btn"
                  title={apiKeyVisible ? '隐藏' : '显示'}
                  onClick={() => setApiKeyVisible((v) => !v)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">Base URL</label>
            <div className="settings-field-body">
              <input
                className="settings-input"
                type="text"
                style={{ width: 240 }}
                value={editor.baseUrl}
                placeholder="https://api.deepseek.com"
                onChange={(e) => setEditor({ ...editor, baseUrl: e.target.value })}
              />
            </div>
          </div>
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>Max Tokens</div>
              <div className="settings-field-hint">0 表示使用模型默认</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={editor.maxTokens}
                onChange={(e) => setEditor({ ...editor, maxTokens: e.target.value })}
                disabled={saving}
              >
                {MAX_TOKENS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {thinkingSupported && (
            <div className="settings-field-horizontal">
              <div className="settings-field-label">
                <div>Thinking Mode</div>
                <div className="settings-field-hint">开启思考模式以获得更深入推理</div>
              </div>
              <div className="settings-field-body">
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={editor.thinkingEnabled}
                    onChange={(e) =>
                      setEditor({ ...editor, thinkingEnabled: e.target.checked })
                    }
                  />
                  <span className="settings-switch-slider" />
                </label>
              </div>
            </div>
          )}

          {thinkingSupported && reasoningSupported && (
            <div className="settings-field-horizontal">
              <div className="settings-field-label">
                <div>Reasoning Effort</div>
                <div className="settings-field-hint">思考强度档位</div>
              </div>
              <div className="settings-field-body">
                <select
                  className="settings-select"
                  value={editor.reasoningEffort}
                  onChange={(e) =>
                    setEditor({ ...editor, reasoningEffort: e.target.value })
                  }
                  disabled={!editor.thinkingEnabled || saving}
                >
                  {effortItems.map((it) => (
                    <option key={it.value} value={it.value}>
                      {it.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>视觉能力</div>
              <div className="settings-field-hint">支持图像输入</div>
            </div>
            <div className="settings-field-body">
              <span className="settings-item-badge" style={{ fontSize: 13, padding: '3px 10px' }}>
                {visionSupported ? (
                  <>
                    <span style={{ color: '#22c55e' }}>●</span> 支持
                  </>
                ) : (
                  <>
                    <span style={{ color: '#9ca3af' }}>●</span> 不支持
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading && !llm) {
    return <div className="settings-loading">加载中...</div>;
  }

  if (loadError && !llm) {
    return (
      <div>
        <h2 className="settings-page-title">模型</h2>
        <p className="settings-page-desc">管理 LLM 服务商与历史快照。</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">加载失败:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">模型</h2>
      <p className="settings-page-desc">管理 LLM 服务商与历史快照,支持快速切换模型与配置 API Key。</p>
      <hr className="settings-page-divider" />

      {pageMode === 'list' ? (
        <>
          <div className="settings-item-list-header">
            <h3>历史快照</h3>
            <div className="settings-item-list-actions">
              <button
                type="button"
                className="settings-btn settings-btn-icon"
                title="刷新"
                onClick={load}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={openCreate}
              >
                + 新建
              </button>
            </div>
          </div>
          {loading ? <div className="settings-loading">加载中...</div> : renderList()}
        </>
      ) : (
        renderEditor()
      )}
    </div>
  );
}
