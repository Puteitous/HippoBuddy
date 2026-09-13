/**
 * GitCommitPromptSettingsPage - Git 提交信息生成提示词设置
 *
 * 把 Git 面板「✨ 生成提交信息」所用 system prompt 暴露给用户自定义
 * (规定生成器行为:标题格式、语言、风格等)。用户包裹实际 diff 的模板固定使用内置默认,
 * 不在此暴露——那部分几乎没有自定义价值。
 * 加载时同时取用户自定义值(ui.git_commit_prompt)与内置默认值,未自定义时用内置默认展示
 * (可作编辑基线);「恢复默认」把输入框填回内置默认并保存。
 * 后端 GitCommitMessageHandler 对空白自定义值也会回退到内置默认,双重保障。
 */
import { useEffect, useState } from 'react';
import { configApi, gitApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { UiConfigSection } from '@/types/config';

export function GitCommitPromptSettingsPage() {
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
          gitApi.commitMessageDefaults().catch(() => null),
        ]);
        if (cancelled) return;
        const defaultValue = def?.systemPrompt ?? '';
        setDefaultPrompt(defaultValue);
        // 未自定义(空)字段用内置默认展示;自定义值优先
        setPrompt(cfg.ui?.git_commit_prompt ?? defaultValue);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        showToast(translate('settingsPage.gitCommitLoadFailedToast') + msg, {
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
        git_commit_prompt: prompt,
      };
      await configApi.updateFull({ ui });
      showToast(translate('settingsPage.gitCommitSavedToast'), { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.gitCommitSaveFailedToast') + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!defaultPrompt || !window.confirm(translate('settingsPage.gitCommitResetConfirm'))) return;
    setPrompt(defaultPrompt);
    await handleSave();
  };

  // 是否等于内置默认(用于顶部备注展示)
  const isDefault = defaultPrompt !== '' && prompt === defaultPrompt;

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.gitCommitPageTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.gitCommitPageDesc')}</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">{t('settingsPage.gitCommitSection')}</div>
      <div className="settings-field-group">
        {loading ? (
          <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>
        ) : (
          <div className="settings-form">
            <div
              style={{
                marginBottom: 12,
                fontSize: 12,
                color: 'var(--hb-text-soft, #6b7280)',
              }}
            >
              {isDefault
                ? t('settingsPage.gitCommitRemarkDefault')
                : t('settingsPage.gitCommitRemarkCustom')}
            </div>
            <div className="settings-field-label">{t('settingsPage.gitCommitPromptLabel')}</div>
            <textarea
              className="settings-editor-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('settingsPage.gitCommitSystemPh')}
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
              {t('settingsPage.gitCommitHint')}
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