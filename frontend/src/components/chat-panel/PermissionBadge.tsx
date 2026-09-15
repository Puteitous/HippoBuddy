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

type Mode = 'strict' | 'balanced' | 'relaxed';

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

/** 读写分离:左右对称的书本(读可出工作区、写仍限工作区) */
function BalancedIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg id="permission-balanced" viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
      className={className} aria-hidden>
      <path d="m21.036 4.182a10.04 10.04 0 0 0 -5.609-.843 4.747 4.747 0 0 0 -3.427 2.173 4.748 4.748 0 0 0 -3.426-2.174 10.034 10.034 0 0 0 -5.608.843 1.264 1.264 0 0 0 -.716 1.139v13.006a1.233 1.233 0 0 0 .494.992 1.266 1.266 0 0 0 1.107.2 8.741 8.741 0 0 1 7.733 1.1c.01.007.022.009.032.015s.019.016.03.022.025 0 .036.009a.672.672 0 0 0 .636 0c.012-.005.025 0 .036-.009s.019-.015.03-.022.022-.008.032-.015a8.738 8.738 0 0 1 7.733-1.1 1.273 1.273 0 0 0 1.107-.2 1.233 1.233 0 0 0 .494-.992v-13.006a1.265 1.265 0 0 0 -.714-1.138zm-14.302 13.412a11.827 11.827 0 0 0 -2.984.406v-12.529a8.438 8.438 0 0 1 4.641-.644 3.26 3.26 0 0 1 2.859 3.233v10.63a9.783 9.783 0 0 0 -4.516-1.096zm13.516.406a10.221 10.221 0 0 0 -7.5.694v-10.634a3.26 3.26 0 0 1 2.858-3.233 10.088 10.088 0 0 1 1.235-.078 8.128 8.128 0 0 1 3.407.722z" />
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
        setMode(m === 'relaxed' ? 'relaxed' : m === 'balanced' ? 'balanced' : 'strict');
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

  const titleKey = mode === 'relaxed' ? 'permission.relaxedTitle' : mode === 'balanced' ? 'permission.balancedTitle' : 'permission.strictTitle';
  const labelKey = mode === 'relaxed' ? 'permission.relaxed' : mode === 'balanced' ? 'permission.balanced' : 'permission.strict';
  return (
    <div className="permission-badge" ref={rootRef}>
      <button
        type="button"
        className={`permission-badge-btn ${mode}`}
        onClick={() => setOpen((v) => !v)}
        title={t(titleKey)}
        aria-label={t('permission.switchLabel')}
        aria-expanded={open}
      >
        {mode === 'relaxed'
          ? <GlobeIcon className="permission-badge-icon relaxed" size={12} />
          : mode === 'balanced'
            ? <BalancedIcon className="permission-badge-icon balanced" size={12} />
            : <ShieldIcon className="permission-badge-icon strict" size={12} />}
        <span className="permission-badge-text">{t(labelKey)}</span>
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
            className={`permission-badge-opt ${mode === 'strict' ? 'selected' : ''}`}
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
            className={`permission-badge-opt ${mode === 'balanced' ? 'selected' : ''}`}
            onClick={() => select('balanced')}
          >
            <BalancedIcon className="permission-badge-opt-icon balanced" size={18} />
            <span className="permission-badge-opt-text">
              <span className="permission-badge-opt-title">{t('permission.balanced')}</span>
              <span className="permission-badge-opt-desc">{t('permission.balancedDesc')}</span>
            </span>
          </button>
          <button
            type="button"
            className={`permission-badge-opt ${mode === 'relaxed' ? 'selected' : ''}`}
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