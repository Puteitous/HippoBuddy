/**
 * SessionSettingsPage - 会话管理设置
 *
 * 配置项:max_saved_sessions(最大保存会话数,默认 1000)
 * 会话路径由 WorkspaceManager 自动管理,不可配置。
 *
 * 行为:加载 /api/config → 取 session 节 → dropdown 选中值变更后立即 PUT。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { showToast } from './toastStore';
import type { SessionConfigSection } from '@/types/config';

const MAX_SAVED_SESSIONS_ITEMS = [
  { label: '100', value: '100' },
  { label: '200', value: '200' },
  { label: '500', value: '500' },
  { label: '默认(1000)', value: '1000' },
];

function defaultSession(): SessionConfigSection {
  return {
    max_saved_sessions: 1000,
    cleanup_period_days: 90,
    enable_background_cleanup: true,
    tombstone_threshold_mb: 50,
  };
}

export function SessionSettingsPage() {
  const [session, setSession] = useState<SessionConfigSection>(defaultSession());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 加载配置
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await configApi.getFull();
        if (cancelled) return;
        if (config.session) {
          setSession({ ...defaultSession(), ...config.session });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
        showToast('加载会话配置失败:' + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (value: string) => {
    const next: SessionConfigSection = { ...session, max_saved_sessions: parseInt(value, 10) };
    setSession(next);
    try {
      await configApi.updateFull({ session: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存会话配置失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">会话管理</h2>
        <p className="settings-page-desc">配置会话保存与清理策略。</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">配置不可用:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">会话管理</h2>
      <p className="settings-page-desc">配置会话保存与清理策略。会话路径由 WorkspaceManager 自动管理,不可配置。</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">保存策略</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>最大保存会话数</div>
              <div className="settings-field-hint">超出后自动清理最早归档会话</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(session.max_saved_sessions)}
                onChange={(e) => handleChange(e.target.value)}
              >
                {MAX_SAVED_SESSIONS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
