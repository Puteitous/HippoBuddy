/**
 * AboutSettingsPage - 关于
 *
 * 左侧导航底部的独立页(与设置项以分隔线区分,推到底部)。
 * 承载项目对外出口:应用名 / GitHub 仓库 / 项目主页(官网)。
 * 链接用 desktopBridge.openExternal 在系统浏览器打开(桌面端)或新标签页(dev)。
 */
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { desktopBridge } from '@/utils/desktop-bridge';
import { useUpdateStore } from '@/stores/updateStore';
import { FeedbackFormModal } from './FeedbackFormModal';
import './AboutSettingsPage.css';

/** 关于页 id(供 SettingsPanel 导航与渲染使用) */
export const ABOUT_PAGE_ID = 'about';

/** 对外链接:GitHub 仓库 / 官网 */
const LINKS = [
  {
    id: 'github',
    url: 'https://github.com/Puteitous/HippoBuddy',
    labelKey: 'settingsPage.aboutGithub',
    hintKey: 'settingsPage.aboutGithubHint',
  },
  {
    id: 'site',
    url: 'https://www.hippobuddy.cn',
    labelKey: 'settingsPage.aboutSite',
    hintKey: 'settingsPage.aboutSiteHint',
  },
];

export function AboutSettingsPage() {
  const { t } = useI18n();
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const updateStatus = useUpdateStore((s) => s.status);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** 应用版本号(桌面端 IPC 读取;非桌面/失败时为 null 则不显示) */
  const [version, setVersion] = useState<string | null>(null);
  /** dev 未打包环境:electron-updater 跳过检查,更新按钮置灰并提示 */
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    void desktopBridge.getAppVersion().then(setVersion);
    // 探测是否 dev 未打包(仅查询环境,不触发真实更新检查),据此禁用更新按钮
    void desktopBridge.checkDevMode().then(setDevMode);
  }, []);

  const openLink = (url: string) => desktopBridge.openExternal(url);

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.navAbout')}</h2>
      <p className="settings-page-desc">{t('settingsPage.aboutDesc')}</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group">
        <div className="about-logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
          </svg>
          <span className="about-name">
            HippoBuddy
            {version && <span className="about-version">v{version}</span>}
          </span>
        </div>

        <div className="settings-form">
          {LINKS.map((link) => (
            <div key={link.id} className="settings-field-horizontal">
              <div className="settings-field-label">
                <div>{t(link.labelKey)}</div>
                <div className="settings-field-hint">{t(link.hintKey)}</div>
              </div>
              <div className="settings-field-body">
                <div className="about-link-row">
                  <button type="button" className="settings-toggle-btn about-link-btn" onClick={() => openLink(link.url)}>
                    {link.url.replace(/^https?:\/\//, '')}
                  </button>
                  <button
                    type="button"
                    className="about-open-btn"
                    aria-label={`${t(link.labelKey)}`}
                    title={link.url}
                    onClick={() => openLink(link.url)}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14L21 3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalUpdate')}</div>
              {devMode ? (
                <div className="settings-field-hint">{t('settingsPage.updateDevHint')}</div>
              ) : (
                <div className="settings-field-hint">{t('settingsPage.generalUpdateHint')}</div>
              )}
            </div>
            <div className="settings-field-body">
              <button
                type="button"
                className="settings-toggle-btn"
                disabled={devMode || updateStatus === 'checking'}
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

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>{t('settingsPage.generalFeedback')}</div>
              <div className="settings-field-hint">{t('settingsPage.generalFeedbackHint')}</div>
            </div>
            <div className="settings-field-body">
              <button type="button" className="settings-toggle-btn" onClick={() => setFeedbackOpen(true)}>
                {t('settingsPage.generalFeedbackBtn')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackFormModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}