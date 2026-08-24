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
import type { ToolsConfigSection } from '@/types/config';

type Mode = 'strict' | 'relaxed';

function defaultTools(mode: Mode): ToolsConfigSection {
  return { mode, bash: { enabled: true, require_confirmation: true }, file: {}, subagent: { enabled: false },
    delete_file: { require_confirmation: true }, web_search: { enabled: false, provider: 'brave', api_key: '' } };
}

/** 仅工作区:盾牌(受限安全) */
function ShieldIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
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
      showToast('保存权限模式失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const isRelaxed = mode === 'relaxed';
  return (
    <div className="permission-badge" ref={rootRef}>
      <button
        type="button"
        className={`permission-badge-btn ${isRelaxed ? 'relaxed' : 'strict'}`}
        onClick={() => setOpen((v) => !v)}
        title={isRelaxed ? '全目录:可操作整个电脑上的文件' : '仅工作区:只能操作当前项目目录'}
        aria-label="切换权限模式"
        aria-expanded={open}
      >
        {isRelaxed
          ? <GlobeIcon className="permission-badge-icon relaxed" size={12} />
          : <ShieldIcon className="permission-badge-icon strict" size={12} />}
        <span className="permission-badge-text">{isRelaxed ? '全目录' : '仅工作区'}</span>
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
              <span className="permission-badge-opt-title">仅工作区</span>
              <span className="permission-badge-opt-desc">只能操作当前项目目录</span>
            </span>
          </button>
          <button
            type="button"
            className={`permission-badge-opt ${isRelaxed ? 'selected' : ''}`}
            onClick={() => select('relaxed')}
          >
            <GlobeIcon className="permission-badge-opt-icon relaxed" size={18} />
            <span className="permission-badge-opt-text">
              <span className="permission-badge-opt-title">全目录</span>
              <span className="permission-badge-opt-desc">可操作整台电脑的文件</span>
            </span>
          </button>
          <div className="permission-badge-menu-hint">
            确认卡片由设置页「工具」中的开关独立控制
          </div>
        </div>
      )}
    </div>
  );
}