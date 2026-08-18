/**
 * ContextSettingsPage - 上下文管理设置
 *
 * 配置项:
 *  - max_tokens(上下文窗口上限,默认 1000000)
 *  - per_tool_safe_limit(单工具结果截断上限,默认 20000)
 *
 * 行为:加载 /api/config → 取 context 节 → 两个 dropdown 各自变更后立即 PUT。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { showToast } from './toastStore';
import type { ContextConfigSection } from '@/types/config';

const MAX_TOKENS_ITEMS = [
  { label: '200,000', value: '200000' },
  { label: '400,000', value: '400000' },
  { label: '600,000', value: '600000' },
  { label: '800,000', value: '800000' },
  { label: '1,000,000 (默认)', value: '1000000' },
];

const TOOL_MAX_TOKENS_ITEMS = [
  { label: '5,000', value: '5000' },
  { label: '10,000', value: '10000' },
  { label: '20,000 (默认)', value: '20000' },
  { label: '30,000', value: '30000' },
  { label: '50,000', value: '50000' },
];

function defaultContext(): ContextConfigSection {
  return {
    max_tokens: 1000000,
    per_tool_safe_limit: 20000,
    global_hard_limit: 32000,
  };
}

export function ContextSettingsPage() {
  const [ctx, setCtx] = useState<ContextConfigSection>(defaultContext());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await configApi.getFull();
        if (cancelled) return;
        if (config.context) {
          setCtx({ ...defaultContext(), ...config.context });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
        showToast('加载上下文配置失败:' + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMaxTokensChange = async (value: string) => {
    const next: ContextConfigSection = {
      ...ctx,
      max_tokens: Math.max(1000, parseInt(value, 10)),
    };
    setCtx(next);
    try {
      await configApi.updateFull({ context: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存上下文配置失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const handlePerToolChange = async (value: string) => {
    const next: ContextConfigSection = {
      ...ctx,
      per_tool_safe_limit: Math.max(1000, parseInt(value, 10)),
    };
    setCtx(next);
    try {
      await configApi.updateFull({ context: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存上下文配置失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">上下文管理</h2>
        <p className="settings-page-desc">配置上下文窗口大小与截断策略。</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">配置不可用:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">上下文管理</h2>
      <p className="settings-page-desc">配置上下文窗口大小和截断策略,避免单次工具结果溢出。</p>
      <hr className="settings-page-divider" />

      <div className="settings-field-group-title">上下文窗口</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>最大 Token 数</div>
              <div className="settings-field-hint">超出后触发自动压缩</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(ctx.max_tokens)}
                onChange={(e) => handleMaxTokensChange(e.target.value)}
              >
                {MAX_TOKENS_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-field-group-title">工具结果截断</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>单工具最大 Token</div>
              <div className="settings-field-hint">单次工具输出超出时自动截断</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(ctx.per_tool_safe_limit)}
                onChange={(e) => handlePerToolChange(e.target.value)}
              >
                {TOOL_MAX_TOKENS_ITEMS.map((it) => (
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
