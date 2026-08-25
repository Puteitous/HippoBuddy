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
import { showToast } from './toastStore';
import { MODE_ORDER } from '@/components/chat-panel/modePresetsData';
import type { SessionMode } from '@/types';
import type { UiConfigSection } from '@/types/config';

/** 模式 → 展示名(顺序沿用 MODE_ORDER) */
const MODE_LABELS: Record<SessionMode, string> = {
  chat: '聊天',
  coding: '编程',
  office: '办公',
};

export function PromptSettingsPage() {
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
        showToast('加载提示词失败:' + msg, { type: 'error', duration: 3000 });
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
      showToast('系统提示词已保存', { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存失败:' + msg, { type: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`恢复「${MODE_LABELS[activeMode]}」模式为内置默认提示词?`)) {
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
      <h2 className="settings-page-title">提示词</h2>
      <p className="settings-page-desc">
        查看并自定义各模式下模型使用的系统提示词。未自定义时显示该模式内置默认提示词。
      </p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">模式系统提示词</div>
      <div className="settings-field-group">
        {loading ? (
          <div className="settings-loading">加载中...</div>
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
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <textarea
              className="settings-editor-textarea"
              value={shownValue}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [activeMode]: e.target.value }))
              }
              placeholder={`编辑「${MODE_LABELS[activeMode]}」模式的系统提示词...`}
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
                上方为{shownValue === (defaults[activeMode] ?? '') ? '该模式内置默认' : '自定义'}
                提示词;实际发送时后端还会自动叠加项目规则、可用技能、当前工作区等信息。
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
                恢复默认
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}