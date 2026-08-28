/**
 * Mermaid 图表渲染 — 懒加载 + 渲染 + 缩放/平移/全屏/导出(平移旧版 static/js/mermaid-renderer.js)
 *
 * 与 markdown.ts 配合:
 *   - markdown.ts 在 renderCodeBlock 中检测 language === 'mermaid',输出带「预览」按钮的代码块
 *   - 本模块通过全局事件委托接管按钮点击,按需动态 import('mermaid')(独立 chunk,不进首屏),
 *     渲染图表,支持缩放/平移/全屏/导出 PNG/SVG/一键切回源码
 *
 * 注意:预览容器是运行时插入 code-block 的 DOM 节点,消息流式重渲染时会重建(与旧版一致)。
 */
import { translate } from '@/i18n';
import { showToast } from '@/utils/toastStore';

/** 简单的 HTML 转义 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 全屏切换 */
function toggleFullscreen(container: HTMLElement): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    container.requestFullscreen().catch(() => {});
  }
}

/** 获取"干净"的 SVG 字符串(剥离缩放/平移变换) */
function getCleanSvgString(svgEl: SVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.style.transform = '';
  clone.removeAttribute('transform');
  clone.style.transformOrigin = '';
  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

/**
 * 通用文件下载(优先 Electron 桥,其次 showSaveFilePicker,最后 a.click 降级)
 * @param blob 文件内容
 * @param suggestedName 建议文件名(含扩展名)
 * @param mimeType MIME 类型
 */
async function downloadBlob(blob: Blob, suggestedName: string, mimeType: string): Promise<void> {
  // Electron 桌面端:通过主进程弹出原生另存为对话框(内容为 base64)
  if (window.electronAPI?.saveFileDialog) {
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const result = await window.electronAPI.saveFileDialog(base64, suggestedName, mimeType);
      if (result?.path) {
        const fileName = suggestedName.replace(/[^\w.-]/g, '_');
        showToast(translate('mermaid.saved') + fileName, { type: 'success' });
      }
      return;
    } catch (e) {
      console.warn('electronAPI.saveFileDialog 失败，跳过下载', e);
      return;
    }
  }

  // 优先使用 File System Access API(Chrome 原生支持)
  if ('showSaveFilePicker' in window) {
    try {
      const ext = suggestedName.split('.').pop();
      const handle = await (window as Window & { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker!({
        suggestedName,
        types: [
          {
            description: mimeType.startsWith('image/svg') ? translate('mermaid.svgImage') : translate('mermaid.pngImage'),
            accept: { [mimeType]: ['.' + ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // 用户取消保存(AbortError)或 API 不支持 → 静默降级
      if (e && typeof e === 'object' && 'name' in e && e.name === 'AbortError') return;
      console.warn('showSaveFilePicker 失败，降级为 a.click 下载', e);
    }
  }
  // 降级:传统 a.click()(Web 浏览器)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName.replace(/[^\w.-]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出 SVG 为文件 */
async function downloadSvg(svgEl: SVGElement, filename: string): Promise<void> {
  const svgStr = getCleanSvgString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  await downloadBlob(blob, filename + '.svg', 'image/svg+xml');
}

/** 导出图表为 PNG(canvas 渲染),taint 时降级为 SVG */
async function downloadPng(svgEl: SVGElement, filename: string): Promise<void> {
  const svgStr = getCleanSvgString(svgEl);

  // 读取 SVG 尺寸
  const viewBox = svgEl.getAttribute('viewBox');
  let w = 800;
  let h = 600;
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      w = parts[2];
      h = parts[3];
    }
  } else {
    w = parseInt(svgEl.getAttribute('width') ?? '800', 10) || 800;
    h = parseInt(svgEl.getAttribute('height') ?? '600', 10) || 600;
  }

  try {
    const pngBlob = await svgToPngBlob(svgStr, w, h);
    if (pngBlob) {
      await downloadBlob(pngBlob, filename + '.png', 'image/png');
    } else {
      throw new Error('PNG 导出失败(canvas taint),降级为 SVG');
    }
  } catch (err) {
    console.warn('Mermaid PNG 导出失败，降级为 SVG:', err);
    await downloadSvg(svgEl, filename);
  }
}

/** 将 SVG 字符串渲染到 canvas 并导出为 PNG Blob(taint 时返回 null) */
function svgToPngBlob(svgStr: string, w: number, h: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const scale = 2; // 2x 清晰度
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.scale(scale, scale);

    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // 部分浏览器中 tainted canvas 的 toBlob 不调回调也不抛异常,用超时兜底
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 3000);
      try {
        canvas.toBlob(
          (pngBlob) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(pngBlob);
          },
          'image/png',
        );
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/* ============================================================
   懒加载 mermaid(public/vendor/mermaid.min.js,动态 <script> 加载)
   与旧版 mermaid-renderer.js 完全一致:点击预览才注入 script,
   mermaid 不进 vite 打包,避免 build 时反复打包 100+ 方言 chunk。
   ============================================================ */

interface MermaidLike {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

let mermaidModule: MermaidLike | null = null;
let mermaidLoading: Promise<MermaidLike> | null = null;
let lastTheme = '';

/** 获取当前主题:dark/midnight → mermaid dark,其余 default */
function getTheme(): string {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' || theme === 'midnight' ? 'dark' : 'default';
}

/** 按需加载 mermaid;已加载但主题变化时重新 initialize */
async function loadMermaid(): Promise<MermaidLike> {
  const currentTheme = getTheme();

  if (mermaidModule) {
    if (currentTheme !== lastTheme) {
      mermaidModule.initialize({ theme: currentTheme, startOnLoad: false, securityLevel: 'loose' });
      lastTheme = currentTheme;
    }
    return mermaidModule;
  }

  if (mermaidLoading) return mermaidLoading;

  mermaidLoading = (async () => {
    // 动态注入 script 加载 vendor 单文件(相对路径,兼容 /app 子路径部署)
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/mermaid.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Mermaid 库加载失败'));
      document.head.appendChild(script);
    });

    const mmd = (window as Window & { mermaid?: MermaidLike }).mermaid;
    if (!mmd) throw new Error(translate('mermaid.windowNotFound'));

    mmd.initialize({ theme: currentTheme, startOnLoad: false, securityLevel: 'loose' });
    lastTheme = currentTheme;
    mermaidModule = mmd;
    return mmd;
  })();

  try {
    return await mermaidLoading;
  } catch (err) {
    mermaidLoading = null;
    throw err;
  }
}

/* ============================================================
   渲染到容器:loading → SVG + 缩放工具栏 + 平移/全屏/导出
   ============================================================ */

function buildToolbarHtml(): string {
  return (
    '<button class="mermaid-zoom-btn" data-zoom="out" title="' +
    translate('mermaid.zoomOut') +
    '">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/></svg>' +
    '</button>' +
    '<span class="mermaid-zoom-level">100%</span>' +
    '<button class="mermaid-zoom-btn" data-zoom="in" title="' +
    translate('mermaid.zoomIn') +
    '">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="8" x2="13" y2="8"/><line x1="8" y1="3" x2="8" y2="13"/></svg>' +
    '</button>' +
    '<button class="mermaid-zoom-btn" data-zoom="reset" title="' +
    translate('mermaid.zoomReset') +
    '">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0 1 11.2-3M14 8a6 6 0 0 1-11.2 3"/><polyline points="13 2 13 5 10 5"/><polyline points="3 14 3 11 6 11"/></svg>' +
    '</button>' +
    '<span class="mermaid-zoom-sep"></span>' +
    '<button class="mermaid-zoom-btn" data-zoom="fullscreen" title="' +
    translate('mermaid.fullscreen') +
    '">' +
    '<svg class="mermaid-fullscreen-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v4h4M13 7V3H9M3 7V3h4M13 9v4H9"/></svg>' +
    '</button>' +
    '<div class="mermaid-export-group">' +
    '<button class="mermaid-zoom-btn mermaid-export-btn" title="' +
    translate('mermaid.export') +
    '" data-zoom="export">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v7M5 7l3 3 3-3M3 12v1h10v-1"/></svg>' +
    '</button>' +
    '<div class="mermaid-export-menu">' +
    '<button class="mermaid-export-menu-item" data-export="png">' +
    translate('mermaid.exportPng') +
    '</button>' +
    '<button class="mermaid-export-menu-item" data-export="svg">' +
    translate('mermaid.exportSvg') +
    '</button>' +
    '</div>' +
    '</div>'
  );
}

/** 生成导出文件名(对齐旧版 diagram-YYYYMMDD-HHMMSS) */
function makeExportFilename(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    'diagram-' +
    now.getFullYear() +
    p(now.getMonth() + 1) +
    p(now.getDate()) +
    '-' +
    p(now.getHours()) +
    p(now.getMinutes()) +
    p(now.getSeconds())
  );
}

async function renderMermaid(container: HTMLElement, code: string, id: string): Promise<void> {
  container.innerHTML = '<div class="mermaid-loading">' + translate('mermaid.rendering') + '</div>';

  try {
    const mermaid = await loadMermaid();

    const { svg } = await mermaid.render('mermaid-' + id, code);
    container.innerHTML = '';

    // 缩放工具栏(初始构建,导出菜单由下方完整版覆盖)
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-zoom-toolbar';
    toolbar.innerHTML = buildToolbarHtml();

    // 缩放包裹层(放 SVG)
    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'mermaid-zoom-wrap';
    zoomWrap.innerHTML = svg;

    let zoomLevel = 1;
    let panX = 0;
    let panY = 0;
    const zoomStep = 0.25;
    const minZoom = 0.25;
    const maxZoom = 4;

    function updateTransform(): void {
      const svgEl = zoomWrap.querySelector('svg');
      if (svgEl) {
        (svgEl as SVGElement).style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        (svgEl as SVGElement).style.transformOrigin = '0 0';
      }
      const pct = Math.round(zoomLevel * 100);
      const levelEl = toolbar.querySelector('.mermaid-zoom-level');
      if (levelEl) levelEl.textContent = pct + '%';
    }

    function zoomIn(): void {
      zoomLevel = Math.min(maxZoom, zoomLevel + zoomStep);
      updateTransform();
    }
    function zoomOut(): void {
      zoomLevel = Math.max(minZoom, zoomLevel - zoomStep);
      updateTransform();
    }
    function zoomReset(): void {
      zoomLevel = 1;
      panX = 0;
      panY = 0;
      updateTransform();
    }

    // 鼠标拖拽平移
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panStartX = 0;
    let panStartY = 0;

    zoomWrap.addEventListener('mousedown', (e) => {
      if (zoomLevel <= 1 && panX === 0 && panY === 0) return;
      if ((e.target as HTMLElement).closest('.mermaid-zoom-toolbar')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      zoomWrap.style.cursor = 'grabbing';
      e.preventDefault();
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      updateTransform();
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      zoomWrap.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    toolbar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-zoom]') as HTMLElement | null;
      if (btn) {
        const action = btn.dataset.zoom;
        if (action === 'in') zoomIn();
        else if (action === 'out') zoomOut();
        else if (action === 'reset') zoomReset();
        else if (action === 'fullscreen') toggleFullscreen(container);
        else if (action === 'export') {
          toolbar.querySelector('.mermaid-export-menu')?.classList.toggle('show');
        }
        return;
      }
      // 导出菜单选项
      const exportItem = target.closest('[data-export]') as HTMLElement | null;
      if (exportItem) {
        const format = exportItem.dataset.export;
        const svgEl = zoomWrap.querySelector('svg') as SVGElement | null;
        if (!svgEl) return;
        toolbar.querySelector('.mermaid-export-menu')?.classList.remove('show');
        const filename = makeExportFilename();
        if (format === 'png') {
          // Mermaid SVG 常含 foreignObject(节点 HTML 文本),含 foreignObject 的 SVG
          // 画到 canvas 上一定会 taint,提前检测直接走 SVG 导出
          if (svgEl.querySelector('foreignObject')) {
            downloadSvg(svgEl, filename).catch(console.error);
          } else {
            downloadPng(svgEl, filename).catch(console.error);
          }
        } else if (format === 'svg') {
          downloadSvg(svgEl, filename).catch(console.error);
        }
        return;
      }
      // 点击工具栏其他区域关闭菜单
      toolbar.querySelector('.mermaid-export-menu')?.classList.remove('show');
    });

    // 点击工具栏外部关闭导出菜单(单例,避免重复注册)
    if (!window.__mermaidDocClickHandler) {
      window.__mermaidDocClickHandler = (e: MouseEvent) => {
        document.querySelectorAll('.mermaid-export-menu.show').forEach((menu) => {
          if (!(e.target as HTMLElement).closest('.mermaid-export-group')) {
            menu.classList.remove('show');
          }
        });
      };
      document.addEventListener('click', window.__mermaidDocClickHandler);
    }

    // 鼠标滚轮缩放(Ctrl/Command + 滚轮)
    zoomWrap.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      },
      { passive: false },
    );

    // 容器被替换时清理全局监听(消息重渲染会重建容器)
    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    container.addEventListener('remove', cleanup, { once: true });

    container.appendChild(toolbar);
    container.appendChild(zoomWrap);
  } catch (err) {
    console.error('Mermaid 渲染失败:', err);
    container.innerHTML =
      '<div class="mermaid-error">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
      '</svg>' +
      '<span>' +
      translate('mermaid.syntaxError') +
      '</span>' +
      '<span class="mermaid-error-detail">' +
      escapeHtml(err instanceof Error ? err.message : String(err)) +
      '</span>' +
      '</div>';
  }
}

/* ============================================================
   全局入口 — 由 markdown.ts 的点击委托调用
   从按钮所在的 code-block 读取源码,切换「源码 ↔ 图表」
   ============================================================ */

export function initMermaidPreview(btn: HTMLElement): void {
  const wrapper = btn.closest('.code-block');
  if (!wrapper) return;

  // 从 code 元素读取源码(高亮后 textContent 即原始代码)
  const codeEl = wrapper.querySelector('pre code');
  if (!codeEl) return;
  const code = codeEl.textContent ?? '';

  // 查找或创建图表预览容器
  let previewContainer = wrapper.querySelector<HTMLElement>('.mermaid-preview-container');
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.className = 'mermaid-preview-container';
    previewContainer.style.display = 'none';
    // 插入到 code-block-body 之后
    const body = wrapper.querySelector('.code-block-body');
    if (body && body.nextSibling) {
      wrapper.insertBefore(previewContainer, body.nextSibling);
    } else {
      wrapper.appendChild(previewContainer);
    }
  }

  const isPreviewVisible = previewContainer.style.display !== 'none';
  const codeBody = wrapper.querySelector('.code-block-body') as HTMLElement | null;

  if (isPreviewVisible) {
    // 当前显示图表 → 切回源码
    previewContainer.style.display = 'none';
    if (codeBody) codeBody.style.display = '';
    btn.textContent = translate('mermaid.preview');
    return;
  }

  // 切到预览
  if (codeBody) codeBody.style.display = 'none';

  // 检查源码和主题是否变化(对比上次渲染的缓存)
  const lastCode = previewContainer.dataset.lastCode;
  const lastThemeCache = previewContainer.dataset.lastTheme;
  const currentTheme = getTheme();
  if (lastCode === code && lastThemeCache === currentTheme && previewContainer.querySelector('svg')) {
    previewContainer.style.display = '';
    btn.textContent = translate('mermaid.showSource');
    return;
  }

  previewContainer.style.display = '';
  btn.textContent = translate('mermaid.showSource');

  const id = 'mmd-' + Math.random().toString(36).substr(2, 9);
  renderMermaid(previewContainer, code, id).then(() => {
    previewContainer!.dataset.lastCode = code;
    previewContainer!.dataset.lastTheme = currentTheme;
  });
}
