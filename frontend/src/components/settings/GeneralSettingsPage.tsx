/**
 * GeneralSettingsPage - 通用设置
 *
 *  - 主题切换(状态与持久化收敛到 stores/themeStore,与 TopBar 主题按钮共用)
 *  - 语言切换(走 i18n store,切换后组件自动重渲染)
 *  - 工作区路径(GET/PUT /api/workspace/default,使用 workspaceApi)
 *  - 数据目录(GET/POST /api/settings/data-dir,变更后需重启)
 */
import { useEffect, useState } from 'react';
import { workspaceApi, dataDirApi, configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge } from '@/utils/desktop-bridge';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { useAppStore } from '@/stores/appStore';
import { useBackgroundStore, type BackgroundType } from '@/stores/backgroundStore';
import { useAccentStore } from '@/stores/accentStore';
import { useUpdateStore } from '@/stores/updateStore';
import { showToast } from './toastStore';
import { i18nStore, useI18n, translate } from '@/i18n';
import { setDefaultProcessView } from '@/utils/process-view-config';
import type { UiConfigSection, ToolsConfigSection } from '@/types/config';

/** 文件夹图标(对齐旧版 settings-input-btn 浏览按钮) */
function FolderIcon() {
  return (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const THEME_OPTIONS: { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settingsPage.generalLight' },
  { value: 'dark', labelKey: 'settingsPage.generalDark' },
  { value: 'midnight', labelKey: 'settingsPage.generalMidnight' },
  { value: 'glass', labelKey: 'settingsPage.generalGlass' },
  { value: 'system', labelKey: 'settingsPage.generalSystem' },
];

/** 自定义背景-渐变预设(毛玻璃主题下透出效果较好) */
const GRADIENT_PRESETS: { nameKey: string; css: string }[] = [
  { nameKey: 'settingsPage.presetTwilight', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { nameKey: 'settingsPage.presetDeepSea', css: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
  { nameKey: 'settingsPage.presetAurora', css: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { nameKey: 'settingsPage.presetSunset', css: 'linear-gradient(135deg, #f83600 0%, #f9d423 100%)' },
  { nameKey: 'settingsPage.presetSakura', css: 'linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)' },
  { nameKey: 'settingsPage.presetStarry', css: 'linear-gradient(135deg, #41295a 0%, #2f0743 100%)' },
];

const DEFAULT_BG_COLOR = '#5b6bbf';

/** 强调色取色器占位值:未自定义时向用户展示的默认颜色(与浅色主题默认 --accent 一致) */
const DEFAULT_ACCENT_COLOR = '#787c82';

/**
 * 压缩图片 data URL:限制最长边并降质量,控制体积以便存入 localStorage 并流畅渲染。
 *  - 最长边超 maxEdge 时等比缩小(默认 1920,足够铺满常规屏幕)
 *  - PNG 保留透明度(输出 PNG);其余格式转 JPEG(quality)
 *  - 解码失败时抛异常,由调用方决定是否退回原图
 */
function compressImageDataUrl(dataUrl: string, maxEdge = 1920, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = dataUrl.startsWith('data:image/png');
        resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(translate('chat.readImageFailed')));
    img.src = dataUrl;
  });
}

export function GeneralSettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const panelLayout = useAppStore((s) => s.panelLayout);
  const setPanelLayout = useAppStore((s) => s.setPanelLayout);
  const { t, lang } = useI18n();
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const [workspacePath, setWorkspacePath] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [dataDirRestartMsg, setDataDirRestartMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 回合默认展示模式:full=完整展示处理过程;result=只展示最终结果 */
  const [processView, setProcessView] = useState<'full' | 'result'>('full');
  /** 权限范围:strict=仅工作区;relaxed=放开整机访问 */
  const [scopeMode, setScopeMode] = useState<'strict' | 'relaxed'>('strict');
  /** 自定义背景(类型 + 值) */
  const background = useBackgroundStore((s) => s.background);
  const setBackground = useBackgroundStore((s) => s.setBackground);
  const resetBackground = useBackgroundStore((s) => s.resetBackground);
  /** 玻璃主题背景样式参数(模糊强度 / 面板遮罩浓度) */
  const glassStyle = useBackgroundStore((s) => s.glassStyle);
  const setGlassStyle = useBackgroundStore((s) => s.setGlassStyle);
  const persistGlassStyle = useBackgroundStore((s) => s.persistGlassStyle);
  /** 全局强调色(覆盖 --accent,联动按钮/激活标签/进度条等强调元素) */
  const accent = useAccentStore((s) => s.accent);
  const setAccent = useAccentStore((s) => s.setAccent);
  const resetAccent = useAccentStore((s) => s.resetAccent);
  /** 图片背景尺寸解析:cover=铺满 / contain=适应 / 其余按缩放百分比 */
  const bgSize = background.size && background.size !== 'cover' ? background.size : 'cover';
  const bgMode = bgSize === 'cover' ? 'cover' : bgSize === 'contain' ? 'contain' : 'scale';
  const scaleValue = bgMode === 'scale' ? parseInt(bgSize, 10) || 100 : 100;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [ws, dd, cfg] = await Promise.allSettled([
          workspaceApi.getDefault(),
          dataDirApi.get(),
          configApi.getFull(),
        ]);
        if (cancelled) return;
        if (ws.status === 'fulfilled') {
          setWorkspacePath(ws.value.path || '');
        }
        if (dd.status === 'fulfilled') {
          setDataDir(dd.value.path || '');
        }
        if (cfg.status === 'fulfilled') {
          const v = (cfg.value.ui?.default_process_view === 'result' ? 'result' : 'full');
          setProcessView(v);
          setDefaultProcessView(v);
          setScopeMode(cfg.value.tools?.mode === 'relaxed' ? 'relaxed' : 'strict');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProcessViewChange = async (value: 'full' | 'result') => {
    if (value === processView) return;
    setProcessView(value);
    setDefaultProcessView(value);
    try {
      // 读取当前 ui 再合并,避免覆盖其他 ui 配置(theme/prompt 等)
      const config = await configApi.getFull();
      const ui: UiConfigSection = {
        ...((config.ui ?? {}) as UiConfigSection),
        default_process_view: value,
      };
      await configApi.updateFull({ ui });
      showToast(
        value === 'result'
          ? t('settingsPage.generalProcessViewSavedResult')
          : t('settingsPage.generalProcessViewSavedFull'),
        { type: 'success', duration: 2000 },
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.generalProcessViewSaveFailed') + msg, { type: 'error', duration: 3000 });
    }
  };

  /** 保存权限范围:读取当前 tools 再合并 mode,避免覆盖其他工具配置 */
  const handleScopeModeChange = async (value: 'strict' | 'relaxed') => {
    if (value === scopeMode) return;
    setScopeMode(value);
    try {
      const config = await configApi.getFull();
      const tools: ToolsConfigSection = {
        ...((config.tools ?? {}) as ToolsConfigSection),
        mode: value,
      };
      await configApi.updateFull({ tools });
      showToast(
        value === 'relaxed'
          ? translate('settingsPage.generalScopeRelaxedToast')
          : translate('settingsPage.generalScopeStrictToast'),
        {
          type: 'success',
          duration: 2000,
        },
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.generalScopeSaveFailed') + msg, { type: 'error', duration: 3000 });
    }
  };

  /** 切换背景类型;切换到纯色/渐变/图片时保留可用旧值,避免误清空 */
  const handleBgTypeChange = (type: BackgroundType) => {
    if (type === background.type) return;
    if (type === 'none') {
      resetBackground();
      return;
    }
    if (type === 'color') {
      const value = /^#[0-9a-fA-F]{6}$/.test(background.value) ? background.value : DEFAULT_BG_COLOR;
      setBackground({ type, value });
      return;
    }
    if (type === 'gradient') {
      const value =
        background.type === 'gradient' && background.value
          ? background.value
          : GRADIENT_PRESETS[0].css;
      setBackground({ type, value });
      return;
    }
    // image:直接置空,始终停留在"选择图片"按钮,避免误用纯色/渐变的旧值作为图片源
    setBackground({ type, value: '' });
  };

  /** 选择本地图片作为背景:读成 base64 data URL,压缩后持久化(避免大图超出 localStorage 配额/渲染卡顿) */
  const handlePickImage = async () => {
    const path = await desktopBridge.openImageDialog();
    if (!path) return;
    const dataUrl = await desktopBridge.readImageAsDataUrl(path);
    if (!dataUrl) {
      showToast(translate('settingsPage.generalReadImageFailed'), { type: 'error', duration: 3000 });
      return;
    }
    try {
      const compressed = await compressImageDataUrl(dataUrl);
      setBackground({ type: 'image', value: compressed });
    } catch {
      // 压缩失败(解码异常)时退回原图,保证至少能使用
      setBackground({ type: 'image', value: dataUrl });
    }
  };

  const handleWorkspacePathChange = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    try {
      const result = await workspaceApi.setDefault(trimmed);
      setWorkspacePath(result.path);
      showToast(translate('settingsPage.generalWorkspaceSaved'), { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.generalWorkspaceSaveFailed') + msg, { type: 'error', duration: 3000 });
    }
  };

  const handleDataDirConfirm = async (newPath: string) => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    if (!window.confirm(translate('settingsPage.generalDataDirSwitch', { path: trimmed }))) return;
    try {
      const result = await dataDirApi.update(trimmed);
      if (result.success) {
        setDataDir(result.path || trimmed);
        setDataDirRestartMsg(true);
        showToast(translate('settingsPage.generalDataDirUpdated'), { type: 'success', duration: 2500 });
      } else {
        showToast(result.error || translate('settingsPage.generalModifyFailed'), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.generalNetworkError') + msg, { type: 'error', duration: 3000 });
    }
  };

  /** 背景样式参数(模糊强度/面板遮罩):玻璃主题下渲染;图片模式并入右侧栏,其余类型单独一段 */
  const glassStylePanel = theme === 'glass' ? (
    <div className="settings-bg-style">
      <div className="settings-bg-style-item">
        <span className="settings-bg-style-label">{t('settingsPage.generalBgBlur')}</span>
        <input
          type="range"
          min={0}
          max={40}
          step={2}
          value={glassStyle.blur}
          onChange={(e) => setGlassStyle({ blur: Number(e.target.value) })}
          onPointerUp={persistGlassStyle}
          onBlur={persistGlassStyle}
        />
        <span className="settings-bg-slider-val">{glassStyle.blur}px</span>
      </div>
      <div className="settings-bg-style-item">
        <span className="settings-bg-style-label">
          {t('settingsPage.generalBgPanelAlpha')}
        </span>
        <input
          type="range"
          min={0.4}
          max={0.95}
          step={0.05}
          value={glassStyle.panelAlpha}
          onChange={(e) => setGlassStyle({ panelAlpha: Number(e.target.value) })}
          onPointerUp={persistGlassStyle}
          onBlur={persistGlassStyle}
        />
        <span className="settings-bg-slider-val">{glassStyle.panelAlpha.toFixed(2)}</span>
      </div>
    </div>
  ) : null;

  if (loading) {
    return <div className="settings-loading">{t('settingsPage.modelLoading')}</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">{t('settingsPage.generalTitle')}</h2>
        <p className="settings-page-desc">{t('settingsPage.generalDesc')}</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">{t('settingsPage.configUnavailable')}:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.generalTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.generalDesc')}</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">{t('settingsPage.generalPersonalize')}</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.generalTheme')}</label>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-toggle-btn${theme === opt.value ? ' active' : ''}`}
                    onClick={() => applyTheme(opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 自定义背景:配合玻璃主题使用,背景从半透明面板内透出 */}
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalBackground')}</div>
              {/* 已在玻璃主题时无需提示;仅其他主题下提示搭配玻璃使用 */}
              {theme !== 'glass' && (
                <div className="settings-field-hint">{t('settingsPage.generalBackgroundHint')}</div>
              )}
            </div>
            <div className="settings-field-body">
              {/* 纵向容器:body 默认横向 flex,多个编辑块需改为纵向排列避免横排溢出 */}
              <div className="settings-bg-root">
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${background.type === 'none' ? ' active' : ''}`}
                  onClick={() => handleBgTypeChange('none')}
                >
                  {t('settingsPage.generalBgNone')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${background.type === 'color' ? ' active' : ''}`}
                  onClick={() => handleBgTypeChange('color')}
                >
                  {t('settingsPage.generalBgColor')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${background.type === 'gradient' ? ' active' : ''}`}
                  onClick={() => handleBgTypeChange('gradient')}
                >
                  {t('settingsPage.generalBgGradient')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${background.type === 'image' ? ' active' : ''}`}
                  onClick={() => handleBgTypeChange('image')}
                >
                  {t('settingsPage.generalBgImage')}
                </button>
              </div>

              {/* 背景样式参数:模糊强度 + 面板遮罩浓度;图片模式走右侧栏,其余类型独立一段 */}
              {background.type !== 'image' && glassStylePanel}

              {background.type === 'color' && (
                <div className="settings-bg-editor">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(background.value) ? background.value : DEFAULT_BG_COLOR}
                    onChange={(e) => setBackground({ type: 'color', value: e.target.value })}
                  />
                  <span className="settings-bg-color-hex">
                    {/^#[0-9a-fA-F]{6}$/.test(background.value) ? background.value : DEFAULT_BG_COLOR}
                  </span>
                </div>
              )}

              {background.type === 'gradient' && (
                <div className="settings-bg-swatches">
                  {GRADIENT_PRESETS.map((g) => (
                    <button
                      key={g.css}
                      type="button"
                      className={`settings-bg-swatch${background.value === g.css ? ' active' : ''}`}
                      style={{ background: g.css }}
                      title={t(g.nameKey)}
                      onClick={() => setBackground({ type: 'gradient', value: g.css })}
                    />
                  ))}
                </div>
              )}

              {background.type === 'image' && (
                <div className="settings-bg-split">
                  {/* 左栏:仅图片预览 */}
                  <div className="settings-bg-col">
                    {background.value ? (
                      /* 预览窗口:模拟玻璃主题下的铺满效果(半透明面板示意) */
                      <div
                        className="settings-bg-window"
                        style={{
                          background: `url("${background.value}") center / ${bgSize} no-repeat`,
                        }}
                      >
                        <div className="settings-bg-window-panel">
                          <span className="settings-bg-window-text">
                            {t('settingsPage.generalBgPreview')}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="settings-bg-pick" onClick={handlePickImage}>
                        {t('settingsPage.generalBgPickImage')}
                      </button>
                    )}
                  </div>

                  {/* 右栏:玻璃参数(模糊/遮罩) + 显示模式 + 移除,纵向堆叠 */}
                  <div className="settings-bg-col">
                    {glassStylePanel}

                    {background.value && (
                      <>
                        {/* 显示模式 + 缩放 */}
                        <div className="settings-bg-scale">
                          <div className="settings-toggle-group">
                            <button
                              type="button"
                              className={`settings-toggle-btn${bgMode === 'cover' ? ' active' : ''}`}
                              onClick={() => setBackground({ ...background, size: 'cover' })}
                            >
                              {t('settingsPage.generalBgCover')}
                            </button>
                            <button
                              type="button"
                              className={`settings-toggle-btn${bgMode === 'contain' ? ' active' : ''}`}
                              onClick={() => setBackground({ ...background, size: 'contain' })}
                            >
                              {t('settingsPage.generalBgContain')}
                            </button>
                            <button
                              type="button"
                              className={`settings-toggle-btn${bgMode === 'scale' ? ' active' : ''}`}
                              onClick={() =>
                                setBackground({ ...background, size: '100% auto' })
                              }
                            >
                              {t('settingsPage.generalBgScale')}
                            </button>
                          </div>

                          {bgMode === 'scale' && (
                            <div className="settings-bg-slider">
                              <input
                                type="range"
                                min={50}
                                max={200}
                                step={10}
                                value={scaleValue}
                                onChange={(e) =>
                                  setBackground({
                                    ...background,
                                    size: `${e.target.value}% auto`,
                                  })
                                }
                              />
                              <span className="settings-bg-slider-val">{scaleValue}%</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className="settings-bg-remove"
                          onClick={() => setBackground({ type: 'image', value: '' })}
                        >
                          {t('settingsPage.generalBgRemove')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* 强调色:覆盖全站 --accent,联动实心按钮/激活标签/进度条等强调元素 */}
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalAccent')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalAccentHint')}</div>
            </div>
            <div className="settings-field-body">
              <div className="settings-bg-root">
                <div className="settings-bg-editor">
                  <input
                    type="color"
                    value={accent || DEFAULT_ACCENT_COLOR}
                    onChange={(e) => setAccent(e.target.value)}
                  />
                  <span className="settings-bg-color-hex">
                    {accent || t('settingsPage.generalAccentAuto')}
                  </span>
                  {accent && (
                    <button type="button" className="settings-bg-remove" onClick={resetAccent}>
                      {t('settingsPage.generalBgReset')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.generalLanguage')}</label>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${lang === 'zh' ? ' active' : ''}`}
                  onClick={() => i18nStore.getState().setLang('zh')}
                >
                  {t('settingsPage.generalLangZh')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${lang === 'en' ? ' active' : ''}`}
                  onClick={() => i18nStore.getState().setLang('en')}
                >
                  {t('settingsPage.generalLangEn')}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <label className="settings-field-label">{t('settingsPage.generalLayout')}</label>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${panelLayout === 'preview-left' ? ' active' : ''}`}
                  onClick={() => setPanelLayout('preview-left')}
                >
                  {t('settingsPage.generalPreviewLeft')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${panelLayout === 'chat-left' ? ' active' : ''}`}
                  onClick={() => setPanelLayout('chat-left')}
                >
                  {t('settingsPage.generalChatLeft')}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalProcessView')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalProcessViewHint')}</div>
            </div>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${processView === 'full' ? ' active' : ''}`}
                  onClick={() => handleProcessViewChange('full')}
                >
                  {t('settingsPage.generalProcessViewFull')}
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${processView === 'result' ? ' active' : ''}`}
                  onClick={() => handleProcessViewChange('result')}
                >
                  {t('settingsPage.generalProcessViewResult')}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="settings-field-group-title">{t('settingsPage.generalOther')}</div>
        <div className="settings-field-group">
          <div className="settings-form">

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalScopeLabel')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalScopeHint')}</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={scopeMode}
                onChange={(e) => handleScopeModeChange(e.target.value as 'strict' | 'relaxed')}
              >
                <option value="strict">{t('settingsPage.generalScopeStrict')}</option>
                <option value="relaxed">{t('settingsPage.generalScopeRelaxed')}</option>
              </select>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalWorkspace')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalWorkspaceHint')}</div>
            </div>
            <div className="settings-field-body">
              <div className="settings-input-wrap" style={{ width: 360 }}>
                <input
                  className="settings-input"
                  type="text"
                  value={workspacePath}
                  placeholder={t('settingsPage.generalWorkspacePh')}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  onBlur={(e) => handleWorkspacePathChange(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-input-btn"
                  title={t('settingsPage.generalBrowseFolder')}
                  onClick={async () => {
                    const path = await desktopBridge.openFileDialog();
                    if (path) handleWorkspacePathChange(path);
                  }}
                >
                  <FolderIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalDataDir')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalDataDirHint')}</div>
            </div>
            <div className="settings-field-body">
              <div className="settings-input-wrap" style={{ width: 360 }}>
                <input
                  className="settings-input"
                  type="text"
                  value={dataDir}
                  placeholder={t('settingsPage.generalDataDirDefault')}
                  onChange={(e) => setDataDir(e.target.value)}
                  onBlur={(e) => handleDataDirConfirm(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-input-btn"
                  title={t('settingsPage.generalDataDirBrowse')}
                  onClick={async () => {
                    const path = await desktopBridge.openFileDialog();
                    if (path) handleDataDirConfirm(path);
                  }}
                >
                  <FolderIcon />
                </button>
              </div>
              {dataDirRestartMsg && (
                <span
                  style={{
                    marginLeft: 12,
                    fontSize: 12,
                    color: '#d97706',
                  }}
                >
                  {t('settingsPage.generalDataDirRestart')}
                </span>
              )}
            </div>
          </div>

          {desktopBridge.isDesktop && (
            <div className="settings-field-horizontal">
              <div className="settings-field-label">
                <div>{t('settingsPage.generalUpdate')}</div>
                <div className="settings-field-hint">{t('settingsPage.generalUpdateHint')}</div>
              </div>
              <div className="settings-field-body">
                <button
                  type="button"
                  className="settings-toggle-btn"
                  onClick={() => void checkForUpdates()}
                >
                  {t('settingsPage.generalCheckUpdate')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
