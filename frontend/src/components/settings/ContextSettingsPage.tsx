/**
 * ContextSettingsPage - 上下文管理设置
 *
 * 配置项:
 *  - max_tokens(上下文窗口上限,默认 1000000)
 *  - per_tool_safe_limit(单工具结果截断上限,默认 20000)
 *  - global_hard_limit(全局硬上限,默认 32000)
 *  - max_agent_turns(自动执行轮数上限,默认 50,0 表示不限制)
 *
 * 行为:加载 /api/config → 取 context 节 → 两个 dropdown 各自变更后立即 PUT。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { ContextConfigSection } from '@/types/config';

const MAX_TOKENS_ITEMS = [
  { label: '200,000', value: '200000' },
  { label: '400,000', value: '400000' },
  { label: '600,000', value: '600000' },
  { label: '800,000', value: '800000' },
  { labelKey: 'settingsPage.contextMaxTokensDefault', value: '1000000' },
];

const TOOL_MAX_TOKENS_ITEMS = [
  { label: '5,000', value: '5000' },
  { label: '10,000', value: '10000' },
  { labelKey: 'settingsPage.contextToolDefault', value: '20000' },
  { label: '30,000', value: '30000' },
  { label: '50,000', value: '50000' },
];

const MAX_AGENT_TURNS_ITEMS = [
  { labelKey: 'settingsPage.contextTurns10', value: '10' },
  { labelKey: 'settingsPage.contextTurns25', value: '25' },
  { labelKey: 'settingsPage.contextTurns50', value: '50' },
  { labelKey: 'settingsPage.contextTurns100', value: '100' },
  { labelKey: 'settingsPage.contextUnlimited', value: '0' },
];

function defaultContext(): ContextConfigSection {
  return {
    max_tokens: 1000000,
    per_tool_safe_limit: 20000,
    global_hard_limit: 32000,
    max_agent_turns: 50,
  };
}

export function ContextSettingsPage() {
  const { t } = useI18n();
  const [ctx, setCtx] = useState<ContextConfigSection>(defaultContext());
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
        if (config.context) {
          setCtx({ ...defaultContext(), ...config.context });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
        showToast(translate('settingsPage.contextLoadFailedToast') + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMaxTokensChange = async (value: string) => {
    const next: ContextConfigSection = {
      ...ctx,
      max_tokens: Math.max(1000, parseInt(value, 10)),
    };
    setCtx(next);
    try {
      await configApi.updateFull({ context: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.contextSaveFailedToast') + msg, { type: 'error', duration: 3000 });
    }
  };

  const handlePerToolChange = async (value: string) => {
    const next: ContextConfigSection = {
      ...ctx,
      per_tool_safe_limit: Math.max(1000, parseInt(value, 10)),
    };
    setCtx(next);
    try {
      await configApi.updateFull({ context: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.contextSaveFailedToast') + msg, { type: 'error', duration: 3000 });
    }
  };

  const handleMaxAgentTurnsChange = async (value: string) => {
    const next: ContextConfigSection = {
      ...ctx,
      max_agent_turns: Math.max(0, parseInt(value, 10)),
    };
    setCtx(next);
    try {
      await configApi.updateFull({ context: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.contextSaveFailedToast') + msg, { type: 'error', duration: 3000 });
    }
  };

  if (loading) {
    return <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">{t('settingsPage.contextTitle')}</h2>
        <p className="settings-page-desc">{t('settingsPage.contextDescShort')}</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">{t('settingsPage.configUnavailableShort')}{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.contextTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.contextDescShort')}</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">{t('settingsPage.contextWindow')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.contextMaxTokensLabel')}</div>
              <div className="settings-field-hint">{t('settingsPage.contextMaxTokensHint')}</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(ctx.max_tokens)}
                onChange={(e) => handleMaxTokensChange(e.target.value)}
              >
                {MAX_TOKENS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.labelKey ? t(it.labelKey) : it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-field-group-title">{t('settingsPage.contextToolTrunc')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.contextToolMaxLabel')}</div>
              <div className="settings-field-hint">{t('settingsPage.contextToolHint')}</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(ctx.per_tool_safe_limit)}
                onChange={(e) => handlePerToolChange(e.target.value)}
              >
                {TOOL_MAX_TOKENS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.labelKey ? t(it.labelKey) : it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-field-group-title">{t('settingsPage.contextAutoExec')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.contextMaxTurns')}</div>
              <div className="settings-field-hint">{t('settingsPage.contextMaxTurnsHint')}</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(ctx.max_agent_turns ?? 50)}
                onChange={(e) => handleMaxAgentTurnsChange(e.target.value)}
              >
                {MAX_AGENT_TURNS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {t(it.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
