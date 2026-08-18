/**
 * 全局轻量 Toast - 状态与 API
 *
 * 用法:
 *   import { showToast } from '@/utils/toastStore';
 *   showToast('保存成功', { type: 'success' });
 *   showToast('网络错误:xxx', { type: 'error' });
 *
 * 主壳(AppShell)挂载 <ToastViewport />(见 toast.tsx),任意组件直接调 showToast。
 *
 * 实现:vanilla JS + useSyncExternalStore,无新增依赖,无 React Context。
 * 文件拆分原因:react-refresh/only-export-components 要求组件文件只导出组件,
 * 故 store/API 与视图分置两个文件。
 *
 * 3.7-1:从 settings/toastStore.ts 提升到 utils/,供 SkillMarket / ActivityBar /
 * ChatNav / SearchPanel / ContextSelector 等全局组件复用。
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  /** 自动关闭时长(ms),默认 2500;0 表示不自动关闭 */
  duration: number;
}

export interface ShowToastOptions {
  type?: ToastType;
  duration?: number;
}

interface ToastState {
  items: ToastItem[];
}

let state: ToastState = { items: [] };
const listeners = new Set<() => void>();
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: ToastState) {
  state = next;
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return state;
}

function clearTimer(id: number) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

/** 触发一条 toast */
export function showToast(message: string, options: ShowToastOptions = {}) {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message,
    type: options.type ?? 'info',
    duration: options.duration ?? 2500,
  };
  setState({ items: [...state.items, item] });

  if (item.duration > 0) {
    const timer = setTimeout(() => dismissToast(id), item.duration);
    timers.set(id, timer);
  }
  return id;
}

/** 关闭指定 toast(若 id 未找到则忽略) */
export function dismissToast(id: number) {
  clearTimer(id);
  setState({ items: state.items.filter((i) => i.id !== id) });
}

/** 关闭全部 toast */
export function clearToasts() {
  for (const id of [...timers.keys()]) clearTimer(id);
  setState({ items: [] });
}
