/**
 * 全局强调色状态 (Zustand)
 *
 *  - 通过覆盖 CSS 变量 --accent 实现。该变量是全站唯一强调色源头(映射 --primary-color),
 *    联动实心按钮、激活标签、进度条、高亮文字等所有强调元素。
 *  - 为空字符串表示使用主题默认强调色(light / dark / midnight / glass 各主题自带)。
 *  - 持久化: localStorage 'hippo-accent'
 *  - 应用方式:写入 <html> 的内联 --accent 自定义属性,内联优先级最高,可覆盖各主题默认值;
 *    用户自定义较白背景看不清时,可把强调色调深来提升对比度。
 */
import { create } from 'zustand';

const ACCENT_KEY = 'hippo-accent';
const DEFAULT_ACCENT = '';

function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function readStored(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return isValidHex(v) ? v : DEFAULT_ACCENT;
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return DEFAULT_ACCENT;
}

function saveStored(accent: string): void {
  try {
    if (accent) localStorage.setItem(ACCENT_KEY, accent);
    else localStorage.removeItem(ACCENT_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 应用到 <html>:覆盖 --accent;空值移除覆盖,回落到各主题默认强调色 */
function applyAccent(accent: string): void {
  const root = document.documentElement;
  if (accent) root.style.setProperty('--accent', accent);
  else root.style.removeProperty('--accent');
}

// 模块加载即应用已保存强调色,避免刷新后首帧回落到主题默认
applyAccent(readStored());

interface AccentState {
  /** 当前强调色(空字符串 = 使用主题默认) */
  accent: string;
  /** 设置强调色(立即应用 + 持久化) */
  setAccent: (accent: string) => void;
  /** 恢复主题默认强调色 */
  resetAccent: () => void;
}

export const useAccentStore = create<AccentState>((set, _get) => ({
  accent: readStored(),

  setAccent: (accent) => {
    applyAccent(accent);
    saveStored(accent);
    set({ accent });
  },

  resetAccent: () => {
    applyAccent(DEFAULT_ACCENT);
    saveStored(DEFAULT_ACCENT);
    set({ accent: DEFAULT_ACCENT });
  },
}));