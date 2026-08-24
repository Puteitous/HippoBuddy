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
import { showToast } from './toastStore';
import { i18nStore, useI18n } from '@/i18n';
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
  { value: 'system', labelKey: 'settingsPage.generalSystem' },
];

export function GeneralSettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const panelLayout = useAppStore((s) => s.panelLayout);
  const setPanelLayout = useAppStore((s) => s.setPanelLayout);
  const { t, lang } = useI18n();
  const [workspacePath, setWorkspacePath] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [dataDirRestartMsg, setDataDirRestartMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 回合默认展示模式:full=完整展示处理过程;result=只展示最终结果 */
  const [processView, setProcessView] = useState<'full' | 'result'>('full');
  /** 权限范围:strict=仅工作区;relaxed=放开整机访问 */
  const [scopeMode, setScopeMode] = useState<'strict' | 'relaxed'>('strict');

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
      showToast('保存默认展示模式失败:' + msg, { type: 'error', duration: 3000 });
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
      showToast(value === 'relaxed' ? '已切换为全目录访问' : '已切换为仅工作区访问', {
        type: 'success',
        duration: 2000,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存权限范围失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const handleWorkspacePathChange = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    try {
      const result = await workspaceApi.setDefault(trimmed);
      setWorkspacePath(result.path);
      showToast('默认工作区已保存', { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存默认工作区失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const handleDataDirConfirm = async (newPath: string) => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    if (!window.confirm(`确定将数据目录切换为:${trimmed}?需要重启应用后生效。`)) return;
    try {
      const result = await dataDirApi.update(trimmed);
      if (result.success) {
        setDataDir(result.path || trimmed);
        setDataDirRestartMsg(true);
        showToast('数据目录已更新,重启后生效', { type: 'success', duration: 2500 });
      } else {
        showToast(result.error || '修改失败', { type: 'error', duration: 3000 });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('网络错误:' + msg, { type: 'error', duration: 3000 });
    }
  };

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

      <div className="settings-field-group-title">{t('settingsPage.generalBasic')}</div>
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

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>权限范围</div>
              <div className="settings-field-hint">仅工作区 = 只能操作当前项目目录；全目录 = 放开整机访问。</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={scopeMode}
                onChange={(e) => handleScopeModeChange(e.target.value as 'strict' | 'relaxed')}
              >
                <option value="strict">仅工作区</option>
                <option value="relaxed">全目录</option>
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
        </div>
      </div>
    </div>
  );
}
