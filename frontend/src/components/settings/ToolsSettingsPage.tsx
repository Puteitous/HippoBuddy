/**
 * ToolsSettingsPage - 工具管理设置
 *
 * 4 个工具组:
 *  - bash:           require_confirmation 开关
 *  - web_search:     enabled 开关 + provider 选择 + api_key 文本框
 *  - subagent:       enabled 开关
 *  - delete_file:    require_confirmation 开关
 *
 * 行为:checkbox/select 变更后立即 PUT;api_key 失焦后保存。
 * PUT 时传完整 tools 节(后端按 readerForUpdating 替换)。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { ToolsConfigSection } from '@/types/config';

const WEB_PROVIDER_ITEMS = [
  { label: 'Brave', value: 'brave' },
  { label: 'Google', value: 'google' },
  { label: 'Bing', value: 'bing' },
  { label: 'SearXNG', value: 'searxng' },
  { label: 'Tavily', value: 'tavily' },
];

function defaultTools(): ToolsConfigSection {
  return {
    mode: 'strict',
    bash: { enabled: true, require_confirmation: true },
    file: {},
    subagent: { enabled: false },
    delete_file: { require_confirmation: true },
    web_search: { enabled: false, provider: 'brave', api_key: '' },
  };
}

export function ToolsSettingsPage() {
  const { t } = useI18n();
  const [tools, setTools] = useState<ToolsConfigSection>(defaultTools());
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await configApi.getFull();
        if (cancelled) return;
        if (config.tools) {
          setTools({ ...defaultTools(), ...config.tools });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
        showToast(translate('settingsPage.toolsLoadFailedToast') + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 通用保存:接受部分 patch,合并到当前 tools,立即 PUT */
  const save = async (patch: Partial<ToolsConfigSection>) => {
    const next: ToolsConfigSection = {
      ...tools,
      ...patch,
    };
    setTools(next);
    try {
      await configApi.updateFull({ tools: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.toolsSaveFailedToast') + msg, { type: 'error', duration: 3000 });
    }
  };

  if (loading) {
    return <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">{t('settingsPage.toolsPageTitle')}</h2>
        <p className="settings-page-desc">{t('settingsPage.toolsPageDesc')}</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">{t('settingsPage.configUnavailableShort')}{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.toolsPageTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.toolsPageDesc')}</p>
      <hr className="settings-page-divider" />

      {/* Bash */}
      <div className="settings-field-group-title">{t('settingsPage.toolsGroupBash')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.toolsNeedConfirm')}</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tools.bash.require_confirmation !== false}
                  onChange={(e) =>
                    save({
                      bash: {
                        ...tools.bash,
                        require_confirmation: e.target.checked,
                      },
                    })
                  }
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Web Search */}
      <div className="settings-field-group-title">{t('settingsPage.toolsGroupWeb')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.toolsEnable')}</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tools.web_search.enabled === true}
                  onChange={(e) =>
                    save({
                      web_search: {
                        ...tools.web_search,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.toolsSearchProvider')}</div>
              <div className="settings-field-hint">{t('settingsPage.toolsProviderHint')}</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={tools.web_search.provider || 'brave'}
                onChange={(e) =>
                  save({
                    web_search: {
                      ...tools.web_search,
                      provider: e.target.value,
                    },
                  })
                }
              >
                {WEB_PROVIDER_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.toolsApiKey')}</label>
            <div className="settings-field-body">
              <div className="settings-input-wrap">
                <input
                  className="settings-input"
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={tools.web_search.api_key || ''}
                  placeholder={t('settingsPage.toolsApiKeyPh')}
                  onChange={(e) =>
                    save({
                      web_search: {
                        ...tools.web_search,
                        api_key: e.target.value,
                      },
                    })
                  }
                />
                <button
                  type="button"
                  className="settings-input-btn"
                  title={apiKeyVisible ? t('settingsPage.modelHide') : t('settingsPage.modelShow')}
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
        </div>
      </div>

      {/* SubAgent */}
      <div className="settings-field-group-title">{t('settingsPage.toolsGroupSubagent')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.toolsEnable')}</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tools.subagent.enabled === true}
                  onChange={(e) =>
                    save({
                      subagent: {
                        ...tools.subagent,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Delete File */}
      <div className="settings-field-group-title">{t('settingsPage.toolsGroupDelete')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.toolsNeedConfirm')}</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tools.delete_file.require_confirmation !== false}
                  onChange={(e) =>
                    save({
                      delete_file: {
                        ...tools.delete_file,
                        require_confirmation: e.target.checked,
                      },
                    })
                  }
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
