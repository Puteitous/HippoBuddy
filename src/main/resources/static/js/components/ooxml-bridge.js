/**
 * ooxml-bridge.js — @silurus/ooxml 统一桥接层
 *
 * 提供 PptxViewer / DocxViewer / XlsxViewer 的动态加载和统一生命周期管理。
 * 被 FilePreview → BinaryPreview 调用，替代原有的 PptxViewJS / mammoth.js / SheetJS。
 *
 * Silurus 的 .wasm 文件通过 new URL("...", import.meta.url) 同目录解析，
 * 所以只需确保 .wasm 文件与 .mjs/.js chunk 文件在同一目录下。
 *
 * 使用方式：
 *   // PptxPresentation（headless，滚动视图逐页渲染）
 *   import { getPptxPresentation } from './ooxml-bridge.js'
 *   const pres = await getPptxPresentation(url)
 *   await pres.renderSlide(canvas, 0, { width: 960 })
 *
 *   // PptxViewer（单 Canvas，自带导航）
 *   import { previewPptx } from './ooxml-bridge.js'
 *   const stop = await previewPptx(canvas, url)
 *   // 不再需要时：stop()
 */

const VENDOR_BASE = '../vendor/ooxml'

/** @type {Promise<typeof import('../vendor/ooxml/pptx.mjs')> | null} */
let _pptxModule = null
/** @type {Promise<typeof import('../vendor/ooxml/docx.mjs')> | null} */
let _docxModule = null
/** @type {Promise<typeof import('../vendor/ooxml/xlsx.mjs')> | null} */
let _xlsxModule = null

/** 动态加载 PPTX 模块（缓存） */
function getPptxModule() {
  if (!_pptxModule) {
    _pptxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/pptx.mjs`)
      .catch(err => {
        _pptxModule = null // 清除缓存，允许重试
        throw new Error(`加载 Silurus PPTX 模块失败: ${err.message}`)
      })
  }
  return _pptxModule
}

/**
 * 获取 PptxPresentation 实例（headless 引擎，适合滚动视图逐页渲染）。
 * 返回的实例可用于 renderSlide(canvas, index, opts)。
 *
 * @param {string} url - PPTX 文件 URL
 * @param {object} [opts]
 * @returns {Promise<instance>}
 */
export async function getPptxPresentation(url, opts = {}) {
  const mod = await getPptxModule()
  return await mod.PptxPresentation.load(url, opts)
}

/**
 * 获取 DocxDocument 实例（headless 引擎，适合滚动视图逐页渲染）。
 * 返回的实例可用于 renderPage(canvas, pageIndex, { width })。
 *
 * @param {string} url - DOCX 文件 URL
 * @param {object} [opts]
 * @returns {Promise<instance>}
 */
export async function getDocxDocument(url, opts = {}) {
  const mod = await getDocxModule()
  return await mod.DocxDocument.load(url, opts)
}

/**
 * 创建 XlsxViewer 实例（自包含，管理自己的容器 DOM + tab 栏 + canvas）。
 * viewer.load(url) 后自动渲染。
 *
 * @param {HTMLElement} container - 目标容器
 * @param {string} url - XLSX 文件 URL
 * @param {object} [opts]
 * @returns {Promise<instance>}
 */
export async function createXlsxViewer(container, url, opts = {}) {
  const mod = await getXlsxModule()
  const viewer = new mod.XlsxViewer(container, {
    onError: (err) => console.error('[ooxml] XLSX error:', err),
    ...opts,
  })
  await viewer.load(url)
  return viewer
}

/** 动态加载 DOCX 模块（缓存） */
function getDocxModule() {
  if (!_docxModule) {
    _docxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/docx.mjs`)
      .catch(err => {
        _docxModule = null
        throw new Error(`加载 Silurus DOCX 模块失败: ${err.message}`)
      })
  }
  return _docxModule
}

/** 动态加载 XLSX 模块（缓存） */
function getXlsxModule() {
  if (!_xlsxModule) {
    _xlsxModule = import(/* @vite-ignore */ `${VENDOR_BASE}/xlsx.mjs`)
      .catch(err => {
        _xlsxModule = null
        throw new Error(`加载 Silurus XLSX 模块失败: ${err.message}`)
      })
  }
  return _xlsxModule
}

/**
 * 使用 @silurus/ooxml 渲染 PPTX 预览（POC 阶段）。
 *
 * @param {HTMLCanvasElement} canvas - 渲染目标 Canvas
 * @param {string} url - PPTX 文件 URL（通过 /api/file/raw?path=... 获取）
 * @param {object} [opts]
 * @param {function} [opts.onSlideChange] - (index, total) => void
 * @returns {Promise<() => void>} 返回 stop 函数，调用后销毁 viewer
 */
export async function previewPptx(canvas, url, opts = {}) {
  const mod = await getPptxModule()
  const viewer = new mod.PptxViewer(canvas, {
    onSlideChange: opts.onSlideChange || (() => {}),
    onError: (err) => console.error('[ooxml] PPTX error:', err),
    // WASM 文件与 JS chunk 在同一目录，无需显式设置 wasmUrl
  })
  await viewer.load(url)
  return () => {
    viewer.destroy?.()
  }
}

/**
 * 使用 @silurus/ooxml 渲染 DOCX 预览。
 * Silurus 使用 Canvas 渲染，需提供 Canvas 元素。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<() => void>}
 */
export async function previewDocx(canvas, url, opts = {}) {
  const mod = await getDocxModule()
  const viewer = new mod.DocxViewer(canvas, {
    onError: (err) => console.error('[ooxml] DOCX error:', err),
  })
  await viewer.load(url)
  return () => {
    viewer.destroy?.()
  }
}

/**
 * 使用 @silurus/ooxml 渲染 XLSX 预览。
 * XlsxViewer 管理自己的容器 DOM（包含 tab 栏和 canvas）。
 *
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<() => void>}
 */
export async function previewXlsx(container, url, opts = {}) {
  const mod = await getXlsxModule()
  const viewer = new mod.XlsxViewer(container, {
    onError: (err) => console.error('[ooxml] XLSX error:', err),
  })
  await viewer.load(url)
  return () => {
    viewer.destroy?.()
  }
}

/**
 * 预加载 Silurus 模块（可选，用于提前触发模块下载）。
 * 在应用初始化时可以调用此函数，减少首次打开 Office 文件时的等待时间。
 */
export function preloadModules(types = ['pptx', 'docx', 'xlsx']) {
  if (types.includes('pptx')) getPptxModule()
  if (types.includes('docx')) getDocxModule()
  if (types.includes('xlsx')) getXlsxModule()
}
