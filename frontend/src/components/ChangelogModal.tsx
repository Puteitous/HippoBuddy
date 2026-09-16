/**
 * ChangelogModal - 升级后首次启动展示"新版本更新内容"
 *
 * 数据来自随包分发的 release-notes.json(经主进程 app:getStartupChangelog 判定):
 *  - 仅发生版本升级且当前版本存在更新内容时渲染,每个版本只弹一次;
 *  - 首次安装 / 重复启动 / dev(未打包)模式 / 无更新内容均不渲染;
 *  - 非阻塞、可关闭,样式对齐现有 UpdateCard。
 *
 * 挂在 AppShell,全局仅实例一次。
 */
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { desktopBridge } from '@/utils/desktop-bridge';
import './ChangelogModal.css';

export function ChangelogModal() {
  const { t } = useI18n();
  const [changelog, setChangelog] = useState<StartupChangelog | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    desktopBridge
      .getStartupChangelog()
      .then((data) => {
        if (cancelled) return;
        // notes 为空则视为无更新内容,不弹窗
        setChangelog(data && data.notes.length > 0 ? data : null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !changelog) return null;

  return (
    <div className="changelog-overlay" role="dialog" aria-modal="true">
      <div className="changelog-modal">
        <div className="changelog-header">
          <span className="changelog-badge">v{changelog.version}</span>
          <span className="changelog-title">{t('changelog.title')}</span>
          <button
            type="button"
            className="changelog-close"
            aria-label={t('changelog.acknowledge')}
            onClick={() => setChangelog(null)}
          >
            ×
          </button>
        </div>
        <ul className="changelog-list">
          {changelog.notes.map((note, i) => (
            <li key={i}>
              <svg className="changelog-check" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="changelog-note">{note}</span>
            </li>
          ))}
        </ul>
        <div className="changelog-actions">
          <button type="button" className="changelog-btn-primary" onClick={() => setChangelog(null)}>
            {t('changelog.acknowledge')}
          </button>
        </div>
      </div>
    </div>
  );
}