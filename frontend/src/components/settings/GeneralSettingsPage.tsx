/**
 * GeneralSettingsPage - 通用设置
 *
 *  - 主题切换(状态与持久化收敛到 stores/themeStore,与 TopBar 主题按钮共用)
 *  - 语言切换(3.6 不实现 i18n,disabled 占位)
 *  - 工作区路径(GET/PUT /api/workspace/default,使用 workspaceApi)
 *  - 数据目录(GET/POST /api/settings/data-dir,变更后需重启)
 */
import { useEffect, useState } from 'react';
import { workspaceApi, dataDirApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { showToast } from './toastStore';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'midnight', label: '午夜' },
  { value: 'system', label: '跟随系统' },
];

export function GeneralSettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [workspacePath, setWorkspacePath] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [dataDirRestartMsg, setDataDirRestartMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [ws, dd] = await Promise.allSettled([
          workspaceApi.getDefault(),
          dataDirApi.get(),
        ]);
        if (cancelled) return;
        if (ws.status === 'fulfilled') {
          setWorkspacePath(ws.value.path || '');
        }
        if (dd.status === 'fulfilled') {
          setDataDir(dd.value.path || '');
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
    return <div className="settings-loading">加载中...</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">通用</h2>
        <p className="settings-page-desc">应用基础设置。</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">配置不可用:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">通用</h2>
      <p className="settings-page-desc">应用基础设置,主题、语言、默认工作区等。</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">基础</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">主题</label>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-toggle-btn${theme === opt.value ? ' active' : ''}`}
                    onClick={() => applyTheme(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <label className="settings-field-label">语言</label>
            <div className="settings-field-body">
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${lang === 'zh' ? ' active' : ''}`}
                  onClick={() => setLang('zh')}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${lang === 'en' ? ' active' : ''}`}
                  onClick={() => {
                    setLang('en');
                    showToast('英文界面将在后续版本支持', { type: 'warning', duration: 2500 });
                  }}
                >
                  English
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>默认工作区</div>
              <div className="settings-field-hint">作为应用启动时的初始工作区</div>
            </div>
            <div className="settings-field-body">
              <input
                className="settings-input"
                type="text"
                value={workspacePath}
                placeholder="选择工作区路径"
                onChange={(e) => setWorkspacePath(e.target.value)}
                onBlur={(e) => handleWorkspacePathChange(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>数据目录</div>
              <div className="settings-field-hint">变更后需要重启应用生效</div>
            </div>
            <div className="settings-field-body">
              <input
                className="settings-input"
                type="text"
                value={dataDir}
                placeholder="默认"
                onChange={(e) => setDataDir(e.target.value)}
                onBlur={(e) => handleDataDirConfirm(e.target.value)}
              />
              {dataDirRestartMsg && (
                <span
                  style={{
                    marginLeft: 12,
                    fontSize: 12,
                    color: '#d97706',
                  }}
                >
                  重启后生效
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
