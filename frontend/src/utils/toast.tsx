/**
 * 全局轻量 Toast - 视图组件
 *
 * 用法:在 AppShell(或主壳)挂载一次 <ToastViewport />。
 * 任意组件触发 toast,请从 './toastStore' 引入 showToast / dismissToast / clearToasts。
 *
 * 文件拆分原因:react-refresh/only-export-components 要求组件文件只导出组件,
 * 故 store/API 与视图分置 toastStore.ts。
 *
 * 3.7-1:从 settings/toast.tsx 提升到 utils/,供全局复用。
 */
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, dismissToast } from './toastStore';

/** Toast 视图(在主壳中挂载一次) */
export function ToastViewport() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (snapshot.items.length === 0) return null;
  return (
    <div className="settings-toast-viewport" role="status" aria-live="polite">
      {snapshot.items.map((t) => (
        <div
          key={t.id}
          className={`settings-toast settings-toast-${t.type}`}
          onClick={() => dismissToast(t.id)}
        >
          <span className="settings-toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : t.type === 'warning' ? '!' : 'i'}
          </span>
          <span className="settings-toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
