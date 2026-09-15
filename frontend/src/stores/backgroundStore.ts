/**
 * 自定义背景状态 (Zustand)
 *
 *  - 类型: none(无) / color(纯色) / gradient(渐变) / image(本地图片)
 *  - 持久化: localStorage 'hippo-background'(与 themeStore 同模式,纯前端偏好)。
 *    image 模式下 value 仅存【磁盘文件路径】(图片本体写入用户数据目录的 background/ 下),
 *    避免大图塞进 localStorage 超出配额导致静默丢失;运行时再读回 data URL 应用。
 *  - 取景裁剪: image 模式的 crop 是【归一化取景区】(相对原图 0..1),裁剪区铺满整屏作为背景。
 *    编辑器拖动/缩放取景框时,通过 updateImageCrop 实时重绘裁剪图并应用到 --app-bg。
 *  - 应用方式:把 CSS 值写入 <html> 的 --app-bg 自定义属性,
 *    body 背景为 var(--app-bg, var(--bg-canvas)),未设置时回落到主题画布色。
 *  - 配合「玻璃」主题使用效果最佳:面板半透明 + 毛玻璃模糊,背景从面板内透出。
 */
import { create } from 'zustand';
import { desktopBridge } from '@/utils/desktop-bridge';

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image';

/** 图片取景区(归一化 0..1,相对原图宽高) */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackgroundConfig {
  type: BackgroundType;
  /** color: 十六进制色值;gradient: CSS 渐变字符串;image: 磁盘文件路径(或旧版内联 data URL) */
  value: string;
  /** 仅 image 类型生效:归一化取景区;缺省视为整图,裁剪区铺满整屏 */
  crop?: CropRect;
}

const BG_KEY = 'hippo-background';

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

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
          if (parsed.type === 'image' && parsed.crop) {
            const c = parsed.crop;
            if ([c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
              cfg.crop = normalizeCrop(c);
            }
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 取景区归一化与边界收紧;非法/过小视为整图 */
function normalizeCrop(c?: CropRect): CropRect {
  if (!c) return { ...FULL_CROP };
  const w = clamp(c.w || 0, 0, 1);
  const h = clamp(c.h || 0, 0, 1);
  if (w < 0.05 || h < 0.05) return { ...FULL_CROP };
  return { x: clamp(c.x || 0, 0, 1 - w), y: clamp(c.y || 0, 0, 1 - h), w, h };
}

/** 把配置转成 body 可用的 CSS background 值;none 返回 null(回落到主题画布) */
function toCssBackground(cfg: BackgroundConfig): string | null {
  switch (cfg.type) {
    case 'color':
      return cfg.value;
    case 'gradient':
      return cfg.value;
    default:
      return null;
  }
}

/**
 * 应用背景到 <html> 的 --app-bg。
 * color/gradient 直接写 CSS;image 提供 dataUrl 时裁剪区铺满整屏(cover),否则移除。
 */
function applyBackground(cfg: BackgroundConfig, dataUrl?: string): void {
  const root = document.documentElement;
  if (cfg.type === 'image') {
    if (dataUrl) {
      root.style.setProperty(
        '--app-bg',
        `url("${dataUrl}") center / cover no-repeat fixed`,
      );
    } else {
      root.style.removeProperty('--app-bg');
    }
    return;
  }
  const css = toCssBackground(cfg);
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
      return { blur: clamp(blur, 0, 60), panelAlpha: clamp(panelAlpha, 0, 1) };
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

// ============================================================
// 图片取景裁剪:缓存解码后的原图,拖框/缩放时实时重绘裁剪区应用到 --app-bg
// ============================================================

/** 模块级缓存:解码后的原图 + 其上 data URL(供编辑器高频取景裁剪,免反复读盘) */
let imgCache: { img: HTMLImageElement; dataUrl: string } | null = null;

/** 从磁盘路径(或旧版内联 data URL)解析原图 data URL */
function resolveOriginalUrl(value: string): Promise<string | null> {
  if (value.startsWith('data:')) return Promise.resolve(value);
  return desktopBridge.readImageAsDataUrl(value);
}

/** 背景 data URL 体积预算(bytes):与上传压缩一致,超限则缩小,避免过大 PNG 无法绘制 */
const BG_URL_BUDGET = 1500 * 1024;

/** 渲染指定宽高的 PNG data URL */
function canvasToPng(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** 把取景区从原图画到 canvas,产出裁剪图 data URL(带体积预算,超限自动缩小) */
function renderCrop(img: HTMLImageElement, crop: CropRect): string {
  try {
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const sx = crop.x * iw;
    const sy = crop.y * ih;
    const sw = crop.w * iw;
    const sh = crop.h * ih;
    let out = canvasToPng(img, sx, sy, sw, sh, Math.round(sw), Math.round(sh));
    if (out.length > BG_URL_BUDGET) {
      // 超预算:整体缩放边长(以目标宽为准),直到在预算内(最低缩到 1/4)
      for (let f = 0.5; f >= 0.25; f -= 0.125) {
        const candidate = canvasToPng(
          img, sx, sy, sw, sh,
          Math.max(1, Math.round(sw * f)),
          Math.max(1, Math.round(sh * f)),
        );
        if (candidate.length <= BG_URL_BUDGET || f <= 0.25) {
          out = candidate;
          break;
        }
      }
    }
    return out;
  } catch {
    return '';
  }
}

/**
 * 载入图片背景:解析原图 → 先直接以整图 cover 兜底首帧(兼容内联 data URL/解码前),
 * 解码成功后按 crop 裁剪重绘并回填。加载过程与应用在浏览器/桌面端解码均支持。
 */
async function doLoadImage(cfg: BackgroundConfig): Promise<void> {
  const isInline = cfg.value.startsWith('data:');
  // 内联路径保持同步应用,保证同一同步帧内背景即生效(兼容既有测试/首帧)
  const url = isInline ? cfg.value : await resolveOriginalUrl(cfg.value).catch(() => null);
  if (!url) {
    applyBackground(cfg);
    return;
  }
  applyBackground(cfg, url);
  useBackgroundStore.setState({ originalDataUrl: url, imageDataUrl: url });
  // 尝试解码原图并缓存,供裁剪编辑器实时取景;解码失败则保持整图 cover 兜底
  const img = new Image();
  img.onload = () => {
    imgCache = { img, dataUrl: url };
    const crop = normalizeCrop(cfg.crop);
    const out = renderCrop(img, crop) || url;
    applyBackground(cfg, out);
    useBackgroundStore.setState({ imageDataUrl: out });
  };
  img.onerror = () => {
    /* 已应用整图 cover 兜底,忽略 */
  };
  img.src = url;
}

// 模块加载即应用已保存背景与样式,避免刷新后首帧回落到画布底色
const INITIAL_BG = readStored();
applyBackground(INITIAL_BG);
applyGlassStyle(readGlassStyle());

interface BackgroundState {
  background: BackgroundConfig;
  /** 运行时缓存的背景图 data URL(裁剪后铺满整屏,供设置页预览等展示用) */
  imageDataUrl: string;
  /** 解码后的原图 data URL(裁剪编辑器用作底图 + 宽高比) */
  originalDataUrl: string;
  /** 玻璃主题背景样式参数(模糊强度 / 面板遮罩浓度) */
  glassStyle: GlassStyle;
  /** 设置自定义背景(立即应用 + 持久化) */
  setBackground: (cfg: BackgroundConfig) => void;
  /** 实时更新取景区(拖框/缩放时高频调用,防抖落盘) */
  updateImageCrop: (crop: CropRect) => void;
  /** 立即将当前取景区写盘并在关闭防抖计时器(弹窗「应用」时调用,确保即时持久化) */
  commitImageCrop: () => void;
  /** 恢复默认(无背景,回落到主题画布) */
  resetBackground: () => void;
  /** 更新玻璃背景样式参数(立即应用,不落盘;由 persistGlassStyle 在松手时持久化) */
  setGlassStyle: (style: Partial<GlassStyle>) => void;
  /** 将当前玻璃背景样式参数写入 localStorage(滑杆松手时调用,避免拖动过程频繁写盘) */
  persistGlassStyle: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  background: INITIAL_BG,
  imageDataUrl: '',
  originalDataUrl: '',
  glassStyle: readGlassStyle(),

  setBackground: (cfg) => {
    // 从图片背景切换/移除时,清理上一张磁盘文件,避免堆积
    const prev = get().background;
    if (prev.type === 'image' && prev.value && prev.value !== cfg.value) {
      void desktopBridge.deleteImageFile(prev.value);
    }
    if (cfg.type === 'image') {
      // 持久化仅存磁盘路径 + 取景区(localStorage 体积极小);图片本体已在磁盘
      saveStored(cfg);
      set({ background: cfg, imageDataUrl: '', originalDataUrl: '' });
      if (cfg.value) {
        void doLoadImage(cfg);
      } else {
        // 空路径 = 移除图片背景
        applyBackground(cfg);
      }
      return;
    }
    applyBackground(cfg);
    saveStored(cfg);
    set({ background: cfg, imageDataUrl: '', originalDataUrl: '' });
  },

  updateImageCrop: (raw) => {
    const crop = normalizeCrop(raw);
    const cfg: BackgroundConfig = { ...get().background, crop };
    set({ background: cfg });
    // 有缓存原图则实时重绘;否则保持当前背景
    if (imgCache) {
      const out = renderCrop(imgCache.img, crop);
      if (out) {
        applyBackground(cfg, out);
        set({ imageDataUrl: out });
      }
    }
    // 防抖落盘,避免拖动帧频繁写 localStorage
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => saveStored(cfg), 250);
  },

  commitImageCrop: () => {
    if (persistTimer) clearTimeout(persistTimer);
    saveStored(get().background);
  },

  resetBackground: () => {
    const prev = get().background;
    if (prev.type === 'image' && prev.value) {
      void desktopBridge.deleteImageFile(prev.value);
    }
    applyBackground(DEFAULT_BG);
    saveStored(DEFAULT_BG);
    set({ background: DEFAULT_BG, imageDataUrl: '', originalDataUrl: '' });
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

// 启动时若为已保存的图片背景,异步读盘回填(模块加载时的同步 applyBackground 无法读文件)
if (INITIAL_BG.type === 'image' && INITIAL_BG.value) {
  void doLoadImage(INITIAL_BG);
}