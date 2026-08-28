/**
 * ModelSelectorPanel - 顶部状态栏「模型 + 思考强度」两级选择面板
 *
 * 对标旧版 components/ModelSelectorPanel.js(433 行 → React 版本)。
 *
 * 结构:
 *  - 触发器:双信息按钮(模型名 · 档位),点击展开
 *  - 面板两级导航:
 *    - menu:模型 / 思考强度两个入口,右侧带当前值摘要(› 进二级)
 *    - models:历史模型列表 + 当前模型高亮 + 「添加模型」入口
 *    - effort:按 Provider 官方协议列出档位(Default/low/high/max 等),
 *      当前档位高亮;Thinking 关闭时第一级入口置灰不可进
 *
 * 数据源:GET /api/config/llm(configApi.getLlm()),打开面板时刷新。
 * 变更:直接 PUT /api/config/llm 快速切换(provider+model 从历史快照恢复;
 *       effort 切换携带 provider+model+reasoningEffort)。
 * 「添加模型」→ 切到 Settings 视图并定位模型页(appStore.settingsInitialPage)。
 *
 * 阶段 3.7-2 简化:
 *  - effort 档位表复用 utils/reasoning-effort.ts(与 ModelSettingsPage 共享)
 *  - 文案经 useI18n / translate 迁移,随语言切换
 *  - 面板 absolute 定位在 TopBar 内,向下弹出(right 对齐,防右侧溢出)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { showToast } from '@/utils/toastStore';
import { getReasoningItems, supportsReasoningEffort } from '@/utils/reasoning-effort';
import { emit } from '@/utils/eventBus';
import { useI18n, translate } from '@/i18n';
import type { LlmConfig, ModelSnapshot } from '@/types';
import './ModelSelectorPanel.css';

/** 面板二级导航层级:menu(摘要入口)→ models / effort(列表) */
type PanelLevel = 'menu' | 'models' | 'effort';

/** 「添加模型」入口的特殊 value */
const ADD_MODEL_VALUE = '__add_model__';

interface ModelSelectorPanelProps {
  /**
   * 面板弹出方向:bottom = 向下弹出(默认,TopBar 使用);
   * top = 向上弹出(输入卡底部状态栏使用,避免溢出屏幕)
   */
  placement?: 'bottom' | 'top';
}

export function ModelSelectorPanel({ placement = 'bottom' }: ModelSelectorPanelProps = {}) {
  const { t } = useI18n();
  const setView = useAppStore((s) => s.setView);
  const setSettingsInitialPage = useAppStore((s) => s.setSettingsInitialPage);

  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<PanelLevel>('menu');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await configApi.getLlm();
      setLlm(data);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      showToast(translate('modelSelector.loadFailed', { msg }), { type: 'error', duration: 3000 });
    }
  }, []);

  // 挂载时加载一次(触发器需要显示当前模型名)
  useEffect(() => {
    void load();
  }, [load]);

  // 打开面板:重置到第一级并刷新配置(后台可能已变更)
  useEffect(() => {
    if (open) {
      setLevel('menu');
      void load();
    }
  }, [open, load]);

  // 点击外部 / Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // 延迟一帧绑定,避免本次触发点击的冒泡误关闭
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // ── 快速切换(PUT /api/config/llm) ─────────────────────────
  const applyLlmUpdate = useCallback(
    async (body: Parameters<typeof configApi.updateLlm>[0], successMsg: string) => {
      try {
        await configApi.updateLlm(body);
        showToast(successMsg, { type: 'success', duration: 2000 });
        close();
        await load();
        // 广播模型变更,通知依赖当前模型能力的组件(如图片上传按钮)即时刷新
        if (body.provider || body.model) {
          emit('llm:changed', { provider: body.provider ?? '', model: body.model ?? '' });
        }
      } catch (e) {
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        showToast(translate('modelSelector.switchFailed', { msg }), { type: 'error', duration: 3000 });
      }
    },
    [close, load],
  );

  /** 选择模型(从历史快照恢复) */
  const handleModelSelect = useCallback(
    (provider: string, model: string) => {
      void applyLlmUpdate(
        { provider, model },
        translate('modelSelector.switched', { provider, model }),
      );
    },
    [applyLlmUpdate],
  );

  /** 选择思考强度档位 */
  const handleEffortSelect = useCallback(
    (provider: string, model: string, effort: string) => {
      void applyLlmUpdate(
        { provider, model, reasoningEffort: effort },
        translate('modelSelector.effortSet', { effort: effort || translate('modelSelector.default') }),
      );
    },
    [applyLlmUpdate],
  );

  /** 「添加模型」→ 切到 Settings 视图并定位模型页 */
  const handleAddModel = useCallback(() => {
    close();
    setSettingsInitialPage('model');
    setView('settings');
  }, [close, setSettingsInitialPage, setView]);

  // ── 数据辅助 ───────────────────────────────────────────────
  /** 当前模型在历史快照中的条目(含 reasoningEffort/thinkingEnabled) */
  const currentSnapshot = useCallback((): ModelSnapshot | null => {
    if (!llm) return null;
    const provider = (llm.provider || '').trim().toLowerCase();
    const model = llm.model || '';
    return (
      llm.modelHistory?.find(
        (s) => (s.provider || '').trim().toLowerCase() === provider && (s.model || '') === model,
      ) ?? null
    );
  }, [llm]);

  /** 归一化档位:不在当前 Provider 合法集内时回退默认(如 openai 下残留的 max) */
  const normalizedEffort = useCallback((): string => {
    if (!llm) return '';
    const items = getReasoningItems(llm.provider || '');
    const raw = currentSnapshot()?.reasoningEffort ?? '';
    return items.some((i) => i.value === raw) ? raw : '';
  }, [llm, currentSnapshot]);

  const currentCombo = useCallback((): string => {
    if (!llm) return '';
    return `${llm.provider || ''}:${llm.model || ''}`;
  }, [llm]);

  // ── 模型列表构建 ───────────────────────────────────────────
  const buildModelItems = useCallback(() => {
    const provider = llm?.provider || '';
    const model = llm?.model || '';
    const combo = `${provider}:${model}`;
    const items: Array<{ label: string; value: string; disabled?: boolean }> = [];
    const seen = new Set<string>();
    for (const snap of llm?.modelHistory ?? []) {
      const key = `${snap.provider || ''}:${snap.model || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ label: snap.model || key, value: key });
    }
    if (provider && model && !seen.has(combo)) {
      items.push({ label: model, value: combo });
    }
    if (items.length > 0) {
      items.push({ label: '—', value: '__divider__', disabled: true });
    }
    items.push({ label: translate('settingsPage.modelAdd'), value: ADD_MODEL_VALUE });
    if (items.length <= 1) {
      items.unshift({ label: translate('modelSelector.unconfigured'), value: '', disabled: true });
    }
    return items;
  }, [llm]);

  const provider = llm?.provider || '';
  const model = llm?.model || '';
  const supported = supportsReasoningEffort(provider);
  const snap = currentSnapshot();
  const thinkingEnabled = snap ? snap.thinkingEnabled !== false : true;
  const effort = normalizedEffort();
  const combo = currentCombo();

  return (
    <div className={`msp-root${placement === 'top' ? ' msp-placement-top' : ''}`} ref={rootRef}>
      {/* 触发器:模型名 · 档位 */}
      <button
        type="button"
        className={`msp-trigger${open ? ' msp-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t('modelSelector.triggerTitle')}
      >
        <span className="msp-trigger-model">{model || t('modelSelector.unconfigured')}</span>
        {effort && (
          <>
            <span className="msp-trigger-sep">·</span>
            <span className="msp-trigger-effort">{effort}</span>
          </>
        )}
        <svg
          className="msp-trigger-chevron"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 面板(向下弹出,right 对齐) */}
      {open && (
        <div className="msp-panel" role="menu">
          {level === 'menu' && (
            <>
              <button
                type="button"
                className="msp-menu-item"
                onClick={() => setLevel('models')}
              >
                <span className="msp-menu-label">{t('modelSelector.modelLabel')}</span>
                <span className="msp-menu-value">{model || t('modelSelector.unconfigured')}</span>
                <span className="msp-menu-arrow"><svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7988 12L29.7988 24L17.7988 36"/></svg></span>
              </button>
              {supported && (
                <button
                  type="button"
                  className={`msp-menu-item${!thinkingEnabled ? ' msp-disabled' : ''}`}
                  disabled={!thinkingEnabled}
                  title={thinkingEnabled ? '' : t('modelSelector.effortDisabled')}
                  onClick={() => setLevel('effort')}
                >
                  <span className="msp-menu-label">{t('modelSelector.effortLabel')}</span>
                  <span className="msp-menu-value">{effort || t('modelSelector.default')}</span>
                  <span className="msp-menu-arrow"><svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7988 12L29.7988 24L17.7988 36"/></svg></span>
                </button>
              )}
            </>
          )}

          {level === 'models' && (
            <>
              <div className="msp-header">
                <button
                  type="button"
                  className="msp-back"
                  onClick={() => setLevel('menu')}
                  title={t('modelSelector.back')}
                >
                  <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.79889 24H41.7989" />
                    <path d="M17.7988 36L5.79883 24L17.7988 12" />
                  </svg>
                </button>
                <span>{t('modelSelector.modelLabel')}</span>
              </div>
              <div className="msp-body">
                {buildModelItems().map((item, i) => {
                  if (item.value === '__divider__') {
                    return <div key={`d-${i}`} className="msp-divider" />;
                  }
                  const isSelected = item.value === combo && item.value !== '';
                  return (
                    <button
                      key={item.value || `empty-${i}`}
                      type="button"
                      className={`msp-item${isSelected ? ' msp-selected' : ''}${item.disabled ? ' msp-disabled' : ''}`}
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.value === ADD_MODEL_VALUE) {
                          handleAddModel();
                          return;
                        }
                        if (!item.value) return;
                        const colonIdx = item.value.indexOf(':');
                        if (colonIdx <= 0) return;
                        handleModelSelect(
                          item.value.substring(0, colonIdx),
                          item.value.substring(colonIdx + 1),
                        );
                      }}
                    >
                      <span className="msp-item-label">{item.label}</span>
                      {isSelected && <span className="msp-item-check"><svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 25l10 10 20-22"/></svg></span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {level === 'effort' && (
            <>
              <div className="msp-header">
                <button
                  type="button"
                  className="msp-back"
                  onClick={() => setLevel('menu')}
                  title={t('modelSelector.back')}
                >
                  <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.79889 24H41.7989" />
                    <path d="M17.7988 36L5.79883 24L17.7988 12" />
                  </svg>
                </button>
                <span>{t('modelSelector.effortLabel')}</span>
              </div>
              <div className="msp-body">
                {getReasoningItems(provider).map((item) => {
                  const isSelected = item.value === effort;
                  return (
                    <button
                      key={item.value || '__default__'}
                      type="button"
                      className={`msp-item${isSelected ? ' msp-selected' : ''}`}
                      onClick={() => handleEffortSelect(provider, model, item.value)}
                    >
                      <span className="msp-item-label">{item.label}</span>
                      {isSelected && <span className="msp-item-check"><svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 25l10 10 20-22"/></svg></span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
