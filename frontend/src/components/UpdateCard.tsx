/**
 * UpdateCard - 全局自动更新卡片
 *
 * 对齐旧版 static/js/main.js 的更新卡片：
 *  - 发现新版本 → 弹卡(下载 / 稍后)
 *  - 下载中 → 进度条
 *  - 下载完成 → 重启安装
 *  - 用户点「稍后」→ 卡片关闭(dismissed),后台下载仍继续;下载完成时由系统通知提醒
 *
 * 组件挂在 AppShell,全局仅实例一次。状态源是 stores/updateStore。
 *
 * 3.7-4:为新前端补齐自动更新能力。
 */
import { useI18n } from '@/i18n';
import { useUpdateStore } from '@/stores/updateStore';
import './UpdateCard.css';

/** 更新卡片(仅 available / downloading / downloaded 状态渲染) */
export function UpdateCard() {
  const { t } = useI18n();
  const status = useUpdateStore((s) => s.status);
  const info = useUpdateStore((s) => s.info);
  const progress = useUpdateStore((s) => s.progress);
  const download = useUpdateStore((s) => s.download);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (status !== 'available' && status !== 'downloading' && status !== 'downloaded') {
    return null;
  }

  const version = info?.version ? `v${info.version}` : '';
  const percent = progress?.percent ?? 0;
  const progressPct = Math.min(100, Math.max(0, Math.round(percent)));

  // releaseNotes 可能是字符串、对象数组或 null,统一转成文本展示
  const releaseNotesText = (() => {
    const notes = info?.releaseNotes;
    if (typeof notes === 'string') return notes;
    if (Array.isArray(notes)) {
      return notes.map((n) => `${n.version}: ${n.note ?? ''}`).join('\n');
    }
    return '';
  })();

  return (
    <div className="update-card" role="dialog" aria-live="polite">
      <div className="update-card-title">
        {status === 'available' && t('updater.newVersion', { version })}
        {status === 'downloading' && t('updater.downloading')}
        {status === 'downloaded' && t('updater.downloadReady')}
      </div>

      <div className="update-card-desc">
        {status === 'available' && releaseNotesText}
        {status === 'downloaded' && version}
      </div>

      {status === 'downloading' && (
        <div className="update-card-progress">
          <div className="update-card-progress-track">
            <div className="update-card-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="update-card-progress-text">{progressPct}%</span>
        </div>
      )}

      <div className="update-card-actions">
        {status === 'available' && (
          <>
            <button type="button" className="update-btn update-btn-ghost" onClick={dismiss}>
              {t('updater.later')}
            </button>
            <button
              type="button"
              className="update-btn update-btn-primary"
              onClick={() => {
                void download();
              }}
            >
              {t('updater.download')}
            </button>
          </>
        )}
        {status === 'downloading' && (
          <button type="button" className="update-btn update-btn-ghost" onClick={dismiss}>
            {t('updater.later')}
          </button>
        )}
        {status === 'downloaded' && (
          <button
            type="button"
            className="update-btn update-btn-primary"
            onClick={() => {
              void install();
            }}
          >
            {t('updater.restart')}
          </button>
        )}
      </div>
    </div>
  );
}
