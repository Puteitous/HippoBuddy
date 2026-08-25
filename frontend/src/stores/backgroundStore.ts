/**
 * 自定义背景状态 (Zustand)
 *
 *  - 类型: none(无) / color(纯色) / gradient(渐变) / image(本地图片)
 *  - 持久化: localStorage 'hippo-background'(与 themeStore 同模式,纯前端偏好)
 *  - 应用方式:把 CSS 值写入 <html> 的 --app-bg 自定义属性,
 *    body 背景为 var(--app-bg, var(--bg-canvas)),未设置时回落到主题画布色。
 *  - 配合「玻璃」主题使用效果最佳:面板半透明 + 毛玻璃模糊,背景从面板内透出。
 */
import { create } from 'zustand';

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image';

export interface BackgroundConfig {
  type: BackgroundType;
  /** color: 十六进制色值;gradient: CSS 渐变字符串;image: base64 data URL */
  value: string;
  /** 仅 image 类型生效:background-size 值。默认 'cover'(铺满),如 'contain' / '120% auto' 等 */
  size?: string;
}

const BG_KEY = 'hippo-background';

const DEFAULT_BG: BackgroundConfig = { type: 'none', value: '' };

function readStored(): BackgroundConfig {
  try {
    const raw = localStorage.getItem(BG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BackgroundConfig;
      if (parsed && typeof parsed === 'object') {
        if (parsed.type === 'none') return { type: 'none', value: '' };
        if (
          (parsed.type === 'color' || parsed.type === 'gradient' || parsed.type === 'image') &&
          typeof parsed.value === 'string' &&
          parsed.value
        ) {
          const cfg: BackgroundConfig = { type: parsed.type, value: parsed.value };
          if (parsed.type === 'image' && typeof parsed.size === 'string' && parsed.size) {
            cfg.size = parsed.size;
          }
          return cfg;
        }
      }
    }
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return DEFAULT_BG;
}

function saveStored(cfg: BackgroundConfig): void {
  try {
    localStorage.setItem(BG_KEY, JSON.stringify(cfg));
  } catch {
    /* 忽略 */
  }
}

/** 把配置转成 body 可用的 CSS background 值;none 返回 null(回落到主题画布) */
function toCssBackground(cfg: BackgroundConfig): string | null {
  switch (cfg.type) {
    case 'color':
      return cfg.value;
    case 'gradient':
      return cfg.value;
    case 'image':
      return `url("${cfg.value}") center / ${cfg.size || 'cover'} no-repeat fixed`;
    default:
      return null;
  }
}

function applyBackground(cfg: BackgroundConfig): void {
  const css = toCssBackground(cfg);
  const root = document.documentElement;
  if (css == null) {
    root.style.removeProperty('--app-bg');
  } else {
    root.style.setProperty('--app-bg', css);
  }
}

// ============================================================
// 玻璃主题背景样式可调参数(暴露给用户自由调节)
//   blur:        背景模糊强度(px),0 = 不模糊(清晰)
//   panelAlpha:  面板遮罩透明度,越大越压暗背景、文字越可读
// 通过覆盖 --glass-blur / --glass-panel 生效(仅玻璃主题引用)
// ============================================================

export interface GlassStyle {
  blur: number;
  panelAlpha: number;
}

const DEFAULT_GLASS: GlassStyle = { blur: 26, panelAlpha: 0.4 };
const GLASS_KEY = 'hippo-glass-style';
/** 旧版 blurMode 存储 key(一次性迁移用) */
const OLD_BLUR_KEY = 'hippo-glass-blur';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function readGlassStyle(): GlassStyle {
  try {
    // 迁移旧版 blurMode(毛玻璃/清晰 二选一)为可调参数
    const old = localStorage.getItem(OLD_BLUR_KEY);
    if (old) {
      localStorage.removeItem(OLD_BLUR_KEY);
      const migrated =
        old === 'clear' ? { blur: 0, panelAlpha: 0.85 } : DEFAULT_GLASS;
      saveGlassStyle(migrated);
      return migrated;
    }
    const raw = localStorage.getItem(GLASS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GlassStyle>;
      const blur = typeof parsed.blur === 'number' && Number.isFinite(parsed.blur)
        ? parsed.blur : DEFAULT_GLASS.blur;
      const panelAlpha = typeof parsed.panelAlpha === 'number' && Number.isFinite(parsed.panelAlpha)
        ? parsed.panelAlpha : DEFAULT_GLASS.panelAlpha;
      return { blur: clamp(blur, 0, 60), panelAlpha: clamp(panelAlpha, 0.3, 1) };
    }
  } catch {
    /* 忽略 */
  }
  return DEFAULT_GLASS;
}

function saveGlassStyle(style: GlassStyle): void {
  try {
    localStorage.setItem(GLASS_KEY, JSON.stringify(style));
  } catch {
    /* 忽略 */
  }
}

function applyGlassStyle(style: GlassStyle): void {
  const root = document.documentElement;
  root.style.setProperty('--glass-blur', `${style.blur}px`);
  root.style.setProperty('--glass-panel', `rgba(22, 24, 32, ${style.panelAlpha})`);
}

// 模块加载即应用已保存背景与样式,避免刷新后首帧回落到画布底色
applyBackground(readStored());
applyGlassStyle(readGlassStyle());

interface BackgroundState {
  background: BackgroundConfig;
  /** 玻璃主题背景样式参数(模糊强度 / 面板遮罩浓度) */
  glassStyle: GlassStyle;
  /** 设置自定义背景(立即应用 + 持久化) */
  setBackground: (cfg: BackgroundConfig) => void;
  /** 恢复默认(无背景,回落到主题画布) */
  resetBackground: () => void;
  /** 更新玻璃背景样式参数(立即应用,不落盘;由 persistGlassStyle 在松手时持久化) */
  setGlassStyle: (style: Partial<GlassStyle>) => void;
  /** 将当前玻璃背景样式参数写入 localStorage(滑杆松手时调用,避免拖动过程频繁写盘) */
  persistGlassStyle: () => void;
}

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  background: readStored(),
  glassStyle: readGlassStyle(),

  setBackground: (cfg) => {
    applyBackground(cfg);
    saveStored(cfg);
    set({ background: cfg });
  },

  resetBackground: () => {
    applyBackground(DEFAULT_BG);
    saveStored(DEFAULT_BG);
    set({ background: DEFAULT_BG });
  },

  setGlassStyle: (patch) => {
    const next: GlassStyle = { ...get().glassStyle, ...patch };
    applyGlassStyle(next);
    set({ glassStyle: next });
  },

  persistGlassStyle: () => {
    saveGlassStyle(get().glassStyle);
  },
}));
