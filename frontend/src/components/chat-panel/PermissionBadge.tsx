/**
 * PermissionBadge - 输入框底部的权限模式徽章。
 *
 * 平时显示一个小徽章(严格/宽松模式),点击展开下拉切换,切换后 PUT /api/config 持久化。
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
        title={isRelaxed ? '宽松模式:可操作全目录,跳过确认' : '严格模式:仅工作区,危险操作需确认'}
        aria-label="切换权限模式"
        aria-expanded={open}
      >
        <span className="permission-badge-dot" aria-hidden />
        <span className="permission-badge-text">{isRelaxed ? '宽松模式' : '严格模式'}</span>
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
            <span className="permission-badge-opt-dot strict" aria-hidden />
            严格模式(仅工作区 + 需确认)
          </button>
          <button
            type="button"
            className={`permission-badge-opt ${isRelaxed ? 'selected' : ''}`}
            onClick={() => select('relaxed')}
          >
            <span className="permission-badge-opt-dot relaxed" aria-hidden />
            宽松模式(全目录 + 跳过确认)
          </button>
        </div>
      )}
    </div>
  );
}