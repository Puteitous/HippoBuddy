/**
 * 全局主题状态 (Zustand)
 *
 * 对齐旧版 static/js/state/app-state.js 的主题逻辑:
 *  - 主题值: light / dark / midnight / system(移除 data-theme 跟随系统)
 *  - 持久化: localStorage 'hippo-theme' + cookie 后备(与旧版同 key,新旧版共享)
 *  - toggleTheme: dark/midnight → light;light → 用户偏好的暗色(preferredDark)
 *  - 桌面端:启动时经 electronAPI.getTheme 校正(仅当未显式保存或为 light),
 *    变更时 electronAPI.setTheme 同步(Electron splash 保持一致)
 *
 * 3.7-3:从 GeneralSettingsPage 抽离,TopBar 主题按钮与设置页共用同一状态源。
 */
import { create } from 'zustand';
import { desktopBridge } from '@/utils/desktop-bridge';

export type Theme = 'light' | 'dark' | 'midnight' | 'glass' | 'system';

const THEME_KEY = 'hippo-theme';

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'midnight' || v === 'glass' || v === 'system') return v;
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return null;
}

function saveStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  // cookie 后备(对齐旧版 _saveTheme,30 天过期)
  try {
    document.cookie = `hippo-theme=${theme}; path=/; max-age=2592000; SameSite=Lax`;
  } catch {
    /* 忽略 */
  }
}

/** 应用主题到 <html data-theme>:system 时移除属性,由 CSS 跟随系统 */
function applyDataTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// 模块加载即同步应用已保存主题,避免刷新后首帧回落到 CSS prefers-color-scheme 兜底
// (系统深色时闪一下深色 hero)。对齐旧版 main.js initTheme 中的同步 setAttribute 行为。
applyDataTheme(readStoredTheme() ?? 'system');

interface ThemeState {
  /** 当前主题(含 system) */
  theme: Theme;
  /** 用户偏好的暗色主题(dark / midnight / glass),toggle 时从 light 跳回 */
  preferredDark: 'dark' | 'midnight' | 'glass';

  /**
   * 初始化主题(应用启动时调用一次):
   *  1. localStorage 优先;无则 system
   *  2. 桌面端首次校正:仅当未显式保存或为 light 时,用 Electron 系统主题覆盖
   */
  initTheme: () => Promise<void>;
  /** 设置指定主题(light / dark / midnight / system),持久化 + 同步桌面端 */
  applyTheme: (theme: Theme) => void;
  /** 快速切换:暗色 → light;light → 偏好暗色(对齐旧版 toggleTheme) */
  toggleTheme: () => Theme;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStoredTheme() ?? 'system',
  preferredDark: (() => {
    const t = readStoredTheme();
    return t === 'dark' || t === 'midnight' || t === 'glass' ? t : 'dark';
  })(),

  initTheme: async () => {
    const fromLS = readStoredTheme();
    let theme: Theme = fromLS ?? 'system';

    // 桌面端首次校正(对齐旧版 main.js:仅当未显式保存或为 light 时用系统主题)
    const sysTheme = await desktopBridge.getTheme();
    if (sysTheme && (!fromLS || fromLS === 'light')) {
      theme = sysTheme;
    }

    applyDataTheme(theme);
    set({
      theme,
      preferredDark: theme === 'dark' || theme === 'midnight' || theme === 'glass' ? theme : get().preferredDark,
    });

    // 同步到桌面端(下次启动 splash 保持一致;system 交由系统,不同步)
    if (theme !== 'system') {
      await desktopBridge.setTheme(theme);
    }
  },

  applyTheme: (theme) => {
    applyDataTheme(theme);
    saveStoredTheme(theme);

    let preferredDark = get().preferredDark;
    if (theme === 'dark' || theme === 'midnight' || theme === 'glass') {
      preferredDark = theme;
    }
    set({ theme, preferredDark });

    // 同步到 Electron(对齐旧版订阅逻辑;system 不同步)
    if (theme !== 'system') {
      void desktopBridge.setTheme(theme);
    }
  },

  toggleTheme: () => {
    const { theme, preferredDark } = get();
    const next: Theme =
      theme === 'dark' || theme === 'midnight' || theme === 'glass' ? 'light' : preferredDark;
    get().applyTheme(next);
    return next;
  },
}));
