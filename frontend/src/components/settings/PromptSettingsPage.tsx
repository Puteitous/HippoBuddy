/**
 * PromptSettingsPage - 提示词设置
 *
 * 把各任务模式(coding/chat/office)使用的系统提示词暴露给用户,并允许自定义:
 *  - 顶部三态切换模式,下方单一 textarea:若某模式已自定义则显示自定义内容,
 *    否则显示该模式的内置默认基础提示词(供查看与作为编辑起点)。
 *  - 「保存」把各模式的自定义草稿写入 ui.system_prompts;未编辑过的模式不写入(保持未自定义)。
 *  - 「恢复默认」删除当前模式的自定义草稿并保存,textarea 回退显示内置默认基础提示词。
 *  - 聊天发送时按当前会话模式取对应自定义值;未自定义则后端使用内置默认(含规则/技能/工作区增强)。
 */
import { useEffect, useState } from 'react';
import { configApi, systemPromptApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import { MODE_ORDER } from '@/components/chat-panel/modePresetsData';
import type { SessionMode } from '@/types';
import type { UiConfigSection } from '@/types/config';

/** 模式 → 展示 i18n key(顺序沿用 MODE_ORDER) */
const MODE_LABEL_KEYS: Record<SessionMode, string> = {
  chat: 'settingsPage.promptModeChat',
  coding: 'settingsPage.promptModeCoding',
  office: 'settingsPage.promptModeOffice',
};

export function PromptSettingsPage() {
  const { t } = useI18n();
  /** 各模式已自定义的内容(key=模式;仅含用户自定义过的) */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** 各模式内置默认基础提示词(懒加载缓存) */
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [activeMode, setActiveMode] = useState<SessionMode>('coding');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cfg = await configApi.getFull();
        if (cancelled) return;
        setDrafts(cfg.ui?.system_prompts ?? {});
        // 默认选中当前会话使用的模式;当前模式不在内置三态时回退 coding
        const cur = useAppStore.getState().mode;
        setActiveMode((MODE_ORDER as SessionMode[]).includes(cur) ? cur : 'coding');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        showToast(translate('settingsPage.promptLoadFailedToast') + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 懒加载当前模式的默认基础提示词(未缓存时)
  useEffect(() => {
    let cancelled = false;
    if (defaults[activeMode] !== undefined) return;
    (async () => {
      try {
        const data = await systemPromptApi.getDefault(activeMode);
        if (cancelled) return;
        setDefaults((d) => ({ ...d, [activeMode]: data.prompt }));
      } catch {
        /* 默认提示词加载失败时留空展示 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMode, defaults]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const cfg = await configApi.getFull();
      const ui: UiConfigSection = {
        ...((cfg.ui ?? {}) as UiConfigSection),
        system_prompts: drafts,
      };
      await configApi.updateFull({ ui });
      // 同步到 appStore,聊天发送时立即按模式生效(未自定义的模式为未设置,后端走默认)
      for (const m of MODE_ORDER as SessionMode[]) {
        useAppStore.getState().setSystemPrompt(m, drafts[m] ?? '');
      }
      showToast(translate('settingsPage.promptSavedToast'), { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.promptSaveFailedToast') + msg, { type: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(translate('settingsPage.promptResetConfirm', { mode: translate(MODE_LABEL_KEYS[activeMode]) }))) {
      return;
    }
    const next = { ...drafts };
    delete next[activeMode];
    setDrafts(next);
    await handleSave();
  };

  /** textarea 展示值:已自定义则显示自定义,否则显示该模式默认基础提示词 */
  const shownValue = drafts[activeMode] ?? defaults[activeMode] ?? '';

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.promptPageTitle')}</h2>
      <p className="settings-page-desc">
        {t('settingsPage.promptPageDesc')}
      </p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">{t('settingsPage.promptSection')}</div>
      <div className="settings-field-group">
        {loading ? (
          <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>
        ) : (
          <div className="settings-form">
            <div className="settings-toggle-group" style={{ marginBottom: 12 }}>
              {MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`settings-toggle-btn${activeMode === m ? ' active' : ''}`}
                  onClick={() => setActiveMode(m)}
                >
                  {t(MODE_LABEL_KEYS[m])}
                </button>
              ))}
            </div>
            <textarea
              className="settings-editor-textarea"
              value={shownValue}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [activeMode]: e.target.value }))
              }
              placeholder={t('settingsPage.promptEditPh', {
                mode: t(MODE_LABEL_KEYS[activeMode]),
              })}
              spellCheck={false}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 12,
                color: 'var(--hb-text-soft, #6b7280)',
              }}
            >
              <span>
                {t('settingsPage.promptRemark', {
                  kind:
                    shownValue === (defaults[activeMode] ?? '')
                      ? t('settingsPage.promptRemarkDefault')
                      : t('settingsPage.promptRemarkCustom'),
                })}
              </span>
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
                disabled={saving}
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