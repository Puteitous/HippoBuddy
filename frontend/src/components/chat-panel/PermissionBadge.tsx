/**
 * PermissionBadge - 输入框底部的权限模式徽章。
 *
 * 平时显示一个小徽章(仅工作区/全目录),点击展开下拉切换,切换后 PUT /api/config 持久化。
 * 确认卡片由设置页「工具」中的 require_confirmation 开关独立控制,与权限范围无关。
 * 数据自行从 configApi 读取,与 ToolsSettingsPage 保持一致,避免引入全局 config store。
 */
import { useEffect, useState, useRef } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { showToast } from '../settings/toastStore';
import { useI18n } from '@/i18n';
import type { ToolsConfigSection } from '@/types/config';

type Mode = 'strict' | 'relaxed';

function defaultTools(mode: Mode): ToolsConfigSection {
  return { mode, bash: { enabled: true, require_confirmation: true }, file: {}, subagent: { enabled: false },
    delete_file: { require_confirmation: true }, web_search: { enabled: false, provider: 'brave', api_key: '' } };
}

/** 仅工作区:盾牌打勾(受限/安全校验通过) */
function ShieldIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="4"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9.25564L24.0086 4L42 9.25564V20.0337C42 31.3622 34.7502 41.4194 24.0026 45.0005C13.2521 41.4195 6 31.36 6 20.0287V9.25564Z" />
      <path d="M15 23L22 30L34 18" />
    </svg>
  );
}

/** 全目录:地球(全范围访问) */
function GlobeIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function PermissionBadge() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('strict');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await configApi.getFull();
        if (cancelled) return;
        const m = config.tools?.mode;
        setMode(m === 'relaxed' ? 'relaxed' : 'strict');
      } catch {
        // 读取失败保持默认 strict,不打扰
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const select = async (m: Mode) => {
    setMode(m);
    setOpen(false);
    try {
      // 读取当前 tools 再合并 mode,避免覆盖其他工具配置(如 bash/web_search 等)
      const config = await configApi.getFull();
      const tools: ToolsConfigSection = {
        ...defaultTools(m),
        ...((config.tools ?? {}) as ToolsConfigSection),
        mode: m,
      };
      await configApi.updateFull({ tools });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(t('permission.saveFailed', { msg }), { type: 'error', duration: 3000 });
    }
  };

  const isRelaxed = mode === 'relaxed';
  return (
    <div className="permission-badge" ref={rootRef}>
      <button
        type="button"
        className={`permission-badge-btn ${isRelaxed ? 'relaxed' : 'strict'}`}
        onClick={() => setOpen((v) => !v)}
        title={isRelaxed ? t('permission.relaxedTitle') : t('permission.strictTitle')}
        aria-label={t('permission.switchLabel')}
        aria-expanded={open}
      >
        {isRelaxed
          ? <GlobeIcon className="permission-badge-icon relaxed" size={12} />
          : <ShieldIcon className="permission-badge-icon strict" size={12} />}
        <span className="permission-badge-text">{isRelaxed ? t('permission.relaxed') : t('permission.strict')}</span>
        <svg
          viewBox="0 0 16 16"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ opacity: 0.7 }}
        >
          <polyline points="2 5 8 11 14 5" />
        </svg>
      </button>
      {open && (
        <div className="permission-badge-menu">
          <button
            type="button"
            className={`permission-badge-opt ${!isRelaxed ? 'selected' : ''}`}
            onClick={() => select('strict')}
          >
            <ShieldIcon className="permission-badge-opt-icon strict" size={18} />
            <span className="permission-badge-opt-text">
              <span className="permission-badge-opt-title">{t('permission.strict')}</span>
              <span className="permission-badge-opt-desc">{t('permission.strictDesc')}</span>
            </span>
          </button>
          <button
            type="button"
            className={`permission-badge-opt ${isRelaxed ? 'selected' : ''}`}
            onClick={() => select('relaxed')}
          >
            <GlobeIcon className="permission-badge-opt-icon relaxed" size={18} />
            <span className="permission-badge-opt-text">
              <span className="permission-badge-opt-title">{t('permission.relaxed')}</span>
              <span className="permission-badge-opt-desc">{t('permission.relaxedDesc')}</span>
            </span>
          </button>
          <div className="permission-badge-menu-hint">
            {t('permission.confirmHint')}
          </div>
        </div>
      )}
    </div>
  );
}