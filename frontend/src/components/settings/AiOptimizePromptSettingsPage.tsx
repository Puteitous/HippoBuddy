/**
 * AiOptimizePromptSettingsPage - 输入区 AI 优化提示词设置
 *
 * 把输入框「✨ 优化」按钮所用 system prompt 暴露给用户自定义
 * (规定优化行为:润色表达、保留意图、语言风格等)。用户输入文本始终由前端原样
 * 作为 user 消息发送,不在此暴露——那部分没有自定义价值。
 * 加载时同时取用户自定义值(ui.ai_optimize_prompt)与内置默认值,未自定义时用内置默认展示
 * (可作编辑基线);「恢复默认」把输入框填回内置默认并保存。
 * 后端 AiOptimizeHandler 对空白自定义值也会回退到内置默认,双重保障。
 */
import { useEffect, useState } from 'react';
import { configApi, optimizeApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { UiConfigSection } from '@/types/config';

export function AiOptimizePromptSettingsPage() {
  const { t } = useI18n();
  /** 当前编辑值(未自定义时在加载后回填为内置默认) */
  const [prompt, setPrompt] = useState('');
  /** 内置默认提示词(供展示基线与恢复默认) */
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cfg, def] = await Promise.all([
          configApi.getFull(),
          optimizeApi.defaults().catch(() => null),
        ]);
        if (cancelled) return;
        const defaultValue = def?.systemPrompt ?? '';
        setDefaultPrompt(defaultValue);
        // 未自定义(空)字段用内置默认展示;自定义值优先
        setPrompt(cfg.ui?.ai_optimize_prompt ?? defaultValue);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        showToast(translate('settingsPage.aiOptimizeLoadFailedToast') + msg, {
          type: 'error',
          duration: 3000,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const cfg = await configApi.getFull();
      const ui: UiConfigSection = {
        ...((cfg.ui ?? {}) as UiConfigSection),
        ai_optimize_prompt: prompt,
      };
      await configApi.updateFull({ ui });
      showToast(translate('settingsPage.aiOptimizeSavedToast'), { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.aiOptimizeSaveFailedToast') + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!defaultPrompt || !window.confirm(translate('settingsPage.aiOptimizeResetConfirm'))) return;
    setPrompt(defaultPrompt);
    await handleSave();
  };

  return (
    <div>
      <div className="settings-field-group">
        {loading ? (
          <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>
        ) : (
          <div className="settings-form">
            <div className="settings-field-label">{t('settingsPage.aiOptimizePromptLabel')}</div>
            <textarea
              className="settings-editor-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('settingsPage.aiOptimizeSystemPh')}
              spellCheck={false}
              rows={10}
            />
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--hb-text-soft, #6b7280)',
              }}
            >
              {t('settingsPage.aiOptimizeHint')}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="settings-btn"
                onClick={handleReset}
                disabled={saving || defaultPrompt === ''}
              >
                {t('settingsPage.promptReset')}
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('settingsPage.promptSaving') : t('settingsPage.promptSave')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}