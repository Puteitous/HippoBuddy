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
import { ImageBackgroundCropModal } from './ImageBackgroundCropModal';
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

/** 背景 data URL 体积预算(bytes):PNG 无损在 1920px 照片下可达数 MB,
   过大的 data URL 作为 CSS background 在 Electron/Chromium 中无法正常绘制,
   超限则逐步缩小直到可绘制(透明 PNG 只降分辨率、保留透明)。 */
const BG_URL_BUDGET = 1500 * 1024;

/**
 * 压缩图片 data URL:限制最长边并降质量,控制体积以便作为背景正常绘制。
 *  - 最长边超 maxEdge 时等比缩小(默认 1920,足够铺满常规屏幕)
 *  - PNG:若含透明度则保留 PNG;无透明则转 JPEG(体积小得多、可保留高清,避免被缩小)
 *  - 其余格式转 JPEG(quality)
 *  - 若输出仍超体积预算,进一步等比缩小(最低到约 1/8 边长)直到可绘制
 *  - 解码失败时抛异常,由调用方决定是否退回原图
 */
function compressImageDataUrl(dataUrl: string, maxEdge = 1920, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = img;
        const isPng = dataUrl.startsWith('data:image/png');
        const render = (edge: number, q: number): string => {
          const scale = Math.min(1, edge / Math.max(width, height));
          const w = Math.max(1, Math.round(width * scale));
          const h = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return dataUrl;
          ctx.drawImage(img, 0, 0, w, h);
          // PNG 仅在确实有透明度时才保留 PNG,否则转 JPEG 以减小体积、保留高清
          const keepPng = isPng && hasAlphaPixels(ctx, w, h);
          return keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', q);
        };
        const edge = Math.min(maxEdge, Math.max(width, height));
        let out = render(edge, quality);
        if (out.length > BG_URL_BUDGET) {
          // 超预算:每次缩小一半边长,直到在预算内(最低降到 1/8 边长)
          for (let f = 0.5; f >= 0.125; f /= 2) {
            const candidate = render(Math.max(2, Math.round(edge * f)), quality);
            if (candidate.length <= BG_URL_BUDGET || f <= 0.125) {
              out = candidate;
              break;
            }
          }
        }
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(translate('chat.readImageFailed')));
    img.src = dataUrl;
  });
}

/** 检测画布是否含有透明度(PNG 转 JPEG 前判断,避免透明像素被转成黑底) */
function hasAlphaPixels(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (!w || !h) return false;
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function GeneralSettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const panelLayout = useAppStore((s) => s.panelLayout);
  const setPanelLayout = useAppStore((s) => s.setPanelLayout);
  const { t, lang } = useI18n();
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const updateStatus = useUpdateStore((s) => s.status);
  const [workspacePath, setWorkspacePath] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [dataDirRestartMsg, setDataDirRestartMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 回合默认展示模式:full=完整展示处理过程;result=只展示最终结果 */
  const [processView, setProcessView] = useState<'full' | 'result'>('full');
  /** 权限范围:strict=仅工作区;relaxed=放开整机访问 */
  const [scopeMode, setScopeMode] = useState<'strict' | 'balanced' | 'relaxed'>('strict');
  /** 推荐问答开关:回合结束后是否用 LLM 生成推荐问题 */
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  /** 自定义背景(类型 + 值;image 模式下 value 为磁盘文件路径) */
  const background = useBackgroundStore((s) => s.background);
  const setBackground = useBackgroundStore((s) => s.setBackground);
  const resetBackground = useBackgroundStore((s) => s.resetBackground);
  /** 图片背景运行时 data URL(从磁盘读回,供设置页预览展示) */
  const imageDataUrl = useBackgroundStore((s) => s.imageDataUrl);
  /** 玻璃主题背景样式参数(模糊强度 / 面板遮罩浓度) */
  const glassStyle = useBackgroundStore((s) => s.glassStyle);
  const setGlassStyle = useBackgroundStore((s) => s.setGlassStyle);
  const persistGlassStyle = useBackgroundStore((s) => s.persistGlassStyle);
  /** 全局强调色(覆盖 --accent,联动按钮/激活标签/进度条等强调元素) */
  const accent = useAccentStore((s) => s.accent);
  const setAccent = useAccentStore((s) => s.setAccent);
  const resetAccent = useAccentStore((s) => s.resetAccent);
  /** 图片背景裁剪弹窗开关 */
  const [cropOpen, setCropOpen] = useState(false);

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
          const m = cfg.value.tools?.mode;
          setScopeMode(m === 'relaxed' ? 'relaxed' : m === 'balanced' ? 'balanced' : 'strict');
          setSuggestionsEnabled(cfg.value.ui?.suggestions_enabled !== false);
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
  const handleScopeModeChange = async (value: 'strict' | 'balanced' | 'relaxed') => {
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
          : value === 'balanced'
            ? translate('settingsPage.generalScopeBalancedToast')
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

  /** 保存推荐问答开关:读取当前 ui 再合并,避免覆盖其他 ui 配置 */
  const handleSuggestionsToggle = async (enabled: boolean) => {
    if (enabled === suggestionsEnabled) return;
    setSuggestionsEnabled(enabled);
    try {
      const config = await configApi.getFull();
      const ui: UiConfigSection = {
        ...((config.ui ?? {}) as UiConfigSection),
        suggestions_enabled: enabled,
      };
      await configApi.updateFull({ ui });
      // 同步内存值,使 chatStore 在 done 后立即感知开关(避免关闭后仍置 loading 闪一下)
      useAppStore.getState().setSuggestionsEnabled(enabled);
      showToast(
        enabled
          ? translate('settingsPage.generalSuggestionsEnabled')
          : translate('settingsPage.generalSuggestionsDisabled'),
        { type: 'success', duration: 2000 },
      );
    } catch (e) {
      setSuggestionsEnabled(!enabled);
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.generalSuggestionsSaveFailed') + msg, { type: 'error', duration: 3000 });
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

  /** 选择本地图片作为背景:读成 base64 data URL,压缩后落盘,localStorage 仅存磁盘路径 */
  const handlePickImage = async () => {
    const path = await desktopBridge.openImageDialog();
    if (!path) return;
    const dataUrl = await desktopBridge.readImageAsDataUrl(path);
    if (!dataUrl) {
      showToast(translate('settingsPage.generalReadImageFailed'), { type: 'error', duration: 3000 });
      return;
    }
    let finalDataUrl = dataUrl;
    try {
      finalDataUrl = await compressImageDataUrl(dataUrl);
    } catch {
      // 压缩失败(解码异常)时退回原图,保证至少能使用
      finalDataUrl = dataUrl;
    }
    // 图片本体写入磁盘,localStorage 只存路径——避免大图超出配额导致保存静默失败
    const savedPath = await desktopBridge.saveImageFile(finalDataUrl);
    if (!savedPath) {
      showToast(translate('settingsPage.generalSaveImageFailed'), { type: 'error', duration: 3000 });
      return;
    }
    setBackground({ type: 'image', value: savedPath });
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
          min={0}
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
            </div>
            <div className="settings-field-body">
              {/* 纵向容器:body 默认横向 flex,多个编辑块需改为纵向排列避免横排溢出 */}
              <div className="settings-bg-root">
              {/* 仅在非玻璃主题提示搭配玻璃使用;放编辑区顶部整宽显示,避免占据标签列宽把预览挤溢 */}
              {theme !== 'glass' && (
                <div className="settings-field-hint settings-bg-top-hint">
                  {t('settingsPage.generalBackgroundHint')}
                </div>
              )}
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
                  {/* 左栏:玻璃参数(模糊/遮罩) */}
                  <div className="settings-bg-col">
                    {glassStylePanel}
                  </div>

                  {/* 右栏:无图时放「选择图片」;有图时放效果预览(裁剪/移除悬浮按钮悬停显示) */}
                  <div className="settings-bg-col">
                    {background.value ? (
                      <div
                        className="settings-bg-window"
                        style={{
                          background: `url("${imageDataUrl}") center / cover no-repeat`,
                        }}
                      >
                        <div className="settings-bg-window-panel">
                          <span className="settings-bg-window-text">
                            {t('settingsPage.generalBgPreview')}
                          </span>
                        </div>
                        {/* 悬停显示的操作按钮 */}
                        <div className="settings-bg-window-actions">
                          <button
                            type="button"
                            className="settings-bg-window-btn"
                            onClick={() => setCropOpen(true)}
                          >
                            {t('settingsPage.generalBgCropButton')}
                          </button>
                          <button
                            type="button"
                            className="settings-bg-window-btn danger"
                            onClick={() => setBackground({ type: 'image', value: '' })}
                          >
                            {t('settingsPage.generalBgRemove')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="settings-bg-pick" onClick={handlePickImage}>
                        {t('settingsPage.generalBgPickImage')}
                      </button>
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
                onChange={(e) => handleScopeModeChange(e.target.value as 'strict' | 'balanced' | 'relaxed')}
              >
                <option value="strict">{t('settingsPage.generalScopeStrict')}</option>
                <option value="balanced">{t('settingsPage.generalScopeBalanced')}</option>
                <option value="relaxed">{t('settingsPage.generalScopeRelaxed')}</option>
              </select>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalSuggestions')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalSuggestionsHint')}</div>
            </div>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={suggestionsEnabled}
                  onChange={(e) => handleSuggestionsToggle(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
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
                  disabled={updateStatus === 'checking'}
                  onClick={() => void checkForUpdates()}
                >
                  {updateStatus === 'checking' ? (
                    <>
                      <span className="settings-toggle-btn-spinner" aria-hidden="true" />
                      {t('updater.checking')}
                    </>
                  ) : (
                    t('settingsPage.generalCheckUpdate')
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {cropOpen && <ImageBackgroundCropModal onClose={() => setCropOpen(false)} />}
    </div>
  );
}
