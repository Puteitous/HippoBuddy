/**
 * ooxml-bridge.ts — @silurus/ooxml 统一桥接层(新版前端)
 *
 * 与旧版 static/js/components/ooxml-bridge.js 同构,但:
 *   - 从后端静态资源运行时加载 vendor 模块(不进前端 bundle):
 *     dev 环境走 Vite proxy `/js` → 9090;生产注入 static 后同源可用
 *   - 提供 minimal TypeScript 类型(不依赖 vendor types 目录,避免构建期
 *     依赖后端资源路径)
 *
 * 动态 import 使用 `/* @vite-ignore *\/` 阻止 Vite 在构建期解析该路径,
 * 由浏览器在运行时发起请求。
 */

import { translate } from '@/i18n';

const VENDOR_BASE = '/js/vendor/ooxml';

// ────────────────────────── minimal 类型 ──────────────────────────

export interface PptxScrollViewerLike {
  load(url: string): Promise<void>;
  destroy(): void;
  getScale(): number;
  setScale(scale: number): void;
  fitWidth(): void;
  /** 幻灯片总数 */
  slideCount: number;
}

export interface DocxScrollViewerLike {
  load(url: string): Promise<void>;
  destroy(): void;
  getScale(): number;
  setScale(scale: number): void;
  fitWidth(): void;
  /** 页数 */
  pageCount: number;
}

export interface XlsxViewerLike {
  load(url: string): Promise<void>;
  destroy(): void;
}

export interface ScrollViewerOptions {
  math?: unknown;
  zoomMin?: number;
  zoomMax?: number;
  /** 禁用内置缩放(由自定义工具栏接管) */
  enableZoom?: boolean;
  enableTextSelection?: boolean;
  wasmUrl?: string;
  onScaleChange?: (scale: number) => void;
  onError?: (err: Error) => void;
}

export interface XlsxViewerOptions {
  onReady?: (sheetNames: string[]) => void;
  onSheetChange?: (index: number) => void;
  onSelectionChange?: (selection: unknown) => void;
  onError?: (err: Error) => void;
  wasmUrl?: string;
}

interface PptxModule {
  PptxScrollViewer: new (container: HTMLElement, opts: ScrollViewerOptions) => PptxScrollViewerLike;
}

interface DocxModule {
  DocxScrollViewer: new (container: HTMLElement, opts: ScrollViewerOptions) => DocxScrollViewerLike;
}

interface XlsxModule {
  XlsxViewer: new (container: HTMLElement, opts: XlsxViewerOptions) => XlsxViewerLike;
}

interface WasmManifest {
  pptx?: string;
  docx?: string;
  xlsx?: string;
}

// ────────────────────────── 模块缓存 ──────────────────────────

let _pptxModule: Promise<PptxModule> | null = null;
let _docxModule: Promise<DocxModule> | null = null;
let _xlsxModule: Promise<XlsxModule> | null = null;
let _wasmManifest: Promise<WasmManifest> | null = null;

function getPptxModule(): Promise<PptxModule> {
  if (!_pptxModule) {
    _pptxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/pptx.mjs`).catch((err: Error) => {
      _pptxModule = null; // 清除缓存,允许重试
      throw new Error(translate('ooxml.loadModuleFailed', { module: 'PPTX', detail: err.message }));
    });
  }
  return _pptxModule;
}

function getDocxModule(): Promise<DocxModule> {
  if (!_docxModule) {
    _docxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/docx.mjs`).catch((err: Error) => {
      _docxModule = null;
      throw new Error(translate('ooxml.loadModuleFailed', { module: 'DOCX', detail: err.message }));
    });
  }
  return _docxModule;
}

function getXlsxModule(): Promise<XlsxModule> {
  if (!_xlsxModule) {
    _xlsxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/xlsx.mjs`).catch((err: Error) => {
      _xlsxModule = null;
      throw new Error(translate('ooxml.loadModuleFailed', { module: 'XLSX', detail: err.message }));
    });
  }
  return _xlsxModule;
}

/** 读取 wasm-manifest(内容 hash 文件名,强缓存);失败时降级为无 hash 原始文件名 */
function getWasmManifest(): Promise<WasmManifest> {
  if (!_wasmManifest) {
    _wasmManifest = import(/* @vite-ignore */ `${VENDOR_BASE}/wasm-manifest.mjs`)
      .then((m) => (m?.default ?? {}) as WasmManifest)
      .catch(() => ({}));
  }
  return _wasmManifest;
}

// ────────────────────────── 创建函数 ──────────────────────────

/**
 * 创建 PptxScrollViewer 实例(自包含滚动视图,内置工具栏 + 缩放 + 文字选取)。
 * viewer.load(url) 后自动渲染。
 */
export async function createPptxScrollViewer(
  container: HTMLElement,
  url: string,
  opts: ScrollViewerOptions = {},
): Promise<PptxScrollViewerLike> {
  const mod = await getPptxModule();
  const manifest = await getWasmManifest();
  const viewer = new mod.PptxScrollViewer(container, {
    enableTextSelection: true,
    wasmUrl: `${VENDOR_BASE}/${manifest.pptx ?? 'pptx_parser_bg.wasm'}`,
    ...opts,
  });
  await viewer.load(url);
  return viewer;
}

/**
 * 创建 DocxScrollViewer 实例(自包含滚动视图,内置工具栏 + 缩放 + 文字选取)。
 */
export async function createDocxScrollViewer(
  container: HTMLElement,
  url: string,
  opts: ScrollViewerOptions = {},
): Promise<DocxScrollViewerLike> {
  const mod = await getDocxModule();
  const manifest = await getWasmManifest();
  const viewer = new mod.DocxScrollViewer(container, {
    enableTextSelection: true,
    wasmUrl: `${VENDOR_BASE}/${manifest.docx ?? 'docx_parser_bg.wasm'}`,
    ...opts,
  });
  await viewer.load(url);
  return viewer;
}

/**
 * 创建 XlsxViewer 实例(自包含,管理自己的容器 DOM + tab 栏 + canvas)。
 * viewer.load(url) 后自动渲染。
 */
export async function createXlsxViewer(
  container: HTMLElement,
  url: string,
  opts: XlsxViewerOptions = {},
): Promise<XlsxViewerLike> {
  const mod = await getXlsxModule();
  const manifest = await getWasmManifest();
  const viewer = new mod.XlsxViewer(container, {
    onError: (err: Error) => console.error('[ooxml] XLSX error:', err),
    wasmUrl: `${VENDOR_BASE}/${manifest.xlsx ?? 'xlsx_parser_bg.wasm'}`,
    ...opts,
  });
  await viewer.load(url);
  return viewer;
}

/**
 * 预加载 Silurus 模块(可选,提前触发模块下载,减少首次打开 Office 文件等待)。
 */
export function preloadOoxmlModules(types: Array<'pptx' | 'docx' | 'xlsx'> = ['pptx', 'docx', 'xlsx']): void {
  if (types.includes('pptx')) void getPptxModule();
  if (types.includes('docx')) void getDocxModule();
  if (types.includes('xlsx')) void getXlsxModule();
}
