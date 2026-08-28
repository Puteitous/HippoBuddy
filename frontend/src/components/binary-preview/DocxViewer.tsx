/**
 * DocxViewer — DOCX 预览(React 容器,双引擎)
 *
 * 引擎编排(对齐旧版 BinaryPreview.showDocxDom):
 *   - 默认:docx-preview DOM 渲染(分页/换行/表格交给浏览器 CSS 引擎,
 *     复杂版式保真度高);缩放用 CSS zoom 作用于 .docx-wrapper
 *   - 解析失败:自动降级 Silurus DocxScrollViewer(Canvas 渲染)
 *   - fetch HTTP 失败:直接显示错误(网络/文件问题,换引擎无用,不降级)
 *
 * 缩放 API 统一抽象:docx-preview 模式操作 DOM zoom,silurus 模式操作
 * viewer.setScale,工具栏/快捷键共用同一套 zoomApi。
 */
import { useEffect, useRef, useState } from 'react';
import { fileApi } from '@/api/client';
import { translate, useI18n } from '@/i18n';
import { createDocxScrollViewer } from './ooxml-bridge';
import type { DocxScrollViewerLike } from './ooxml-bridge';
import './OoxmlViewer.css';

interface DocxViewerProps {
  /** 文件绝对路径 */
  filePath: string;
}

type ViewerStatus = 'loading' | 'ready' | 'error';

const ZOOM_STEP = 0.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

interface ZoomApi {
  get: () => number;
  set: (next: number) => void;
  fit: () => void;
}

interface DocxPreviewModule {
  renderAsync: (
    arrayBuffer: ArrayBuffer,
    host: HTMLElement,
    style?: unknown,
    options?: Record<string, unknown>,
  ) => Promise<void>;
}

/** docx-preview 模块(277KB,运行时动态加载,不进启动路径;失败可重试) */
const DOCX_PREVIEW_MODULE_URL = '/js/vendor/docx-preview.js';
let _docxPreviewModule: Promise<DocxPreviewModule> | null = null;
function loadDocxPreviewModule(): Promise<DocxPreviewModule> {
  if (!_docxPreviewModule) {
    // 变量路径:TS 推断为 Promise<any>,由浏览器运行时解析(dev 走 Vite /js 代理)
    _docxPreviewModule = import(/* @vite-ignore */ DOCX_PREVIEW_MODULE_URL).then(
      (m) => m as DocxPreviewModule,
    ).catch((err: Error) => {
      _docxPreviewModule = null;
      throw new Error(`${translate('ooxml.loadModuleFailedDocx')}: ${err.message}`);
    });
  }
  return _docxPreviewModule;
}

export function DocxViewer({ filePath }: DocxViewerProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomApiRef = useRef<ZoomApi | null>(null);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let silurusViewer: DocxScrollViewerLike | null = null;
    let cancelled = false;

    setStatus('loading');
    setError('');
    setZoom(1);
    zoomApiRef.current = null;
    const url = fileApi.rawUrl(filePath);

    void (async () => {
      try {
        // 1. 先取文件(HTTP 失败不降级)
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${translate('ooxml.loadFailed')}`);
        }
        const arrayBuffer = await resp.arrayBuffer();
        if (cancelled) return;

        // 2. docx-preview DOM 渲染(解析失败抛错 → 降级 Silurus)
        try {
          const { renderAsync } = await loadDocxPreviewModule();
          if (cancelled) return;
          host.innerHTML = '';
          await renderAsync(arrayBuffer, host, undefined, {
            className: 'docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            experimental: false,
          });
          if (cancelled) {
            host.innerHTML = '';
            return;
          }
          // docx-preview 缩放:CSS zoom 作用于 .docx-wrapper
          const wrap = (host.querySelector('.docx-wrapper') as HTMLElement | null) ?? host;
          zoomApiRef.current = {
            get: () => parseFloat(wrap.style.zoom) || 1,
            set: (next) => {
              wrap.style.zoom = String(next);
              setZoom(next);
            },
            fit: () => {
              const scale = zoomApiRef.current?.get() ?? 1;
              const base = wrap.scrollWidth / scale;
              const avail = host.clientWidth;
              if (avail <= 0 || base <= 0) return;
              const fit = Math.max(MIN_SCALE, Math.min(1, avail / base));
              zoomApiRef.current?.set(fit);
            },
          };
          zoomApiRef.current.fit();
          setStatus('ready');
          return;
        } catch (err) {
          if (cancelled) return;
          console.warn('[DocxViewer] docx-preview 解析失败,降级 Silurus:', err);
        }

        // 3. Silurus 降级
        host.innerHTML = '';
        silurusViewer = await createDocxScrollViewer(host, url, {
          zoomMin: MIN_SCALE,
          zoomMax: MAX_SCALE,
          enableZoom: false,
          onScaleChange: (scale) => {
            if (!cancelled) setZoom(scale);
          },
          onError: (err) => {
            if (cancelled) return;
            setError(err?.message ?? String(err));
            setStatus('error');
          },
        });
        if (cancelled) {
          silurusViewer.destroy();
          silurusViewer = null;
          return;
        }
        zoomApiRef.current = {
          get: () => silurusViewer?.getScale() ?? 1,
          set: (next) => silurusViewer?.setScale(next),
          fit: () => silurusViewer?.fitWidth(),
        };
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      silurusViewer?.destroy();
      zoomApiRef.current = null;
    };
  }, [filePath]);

  const applyZoom = (direction: 1 | -1) => {
    const api = zoomApiRef.current;
    if (!api) return;
    const cur = api.get();
    const next =
      direction > 0
        ? Math.min(MAX_SCALE, cur * (1 + ZOOM_STEP))
        : Math.max(MIN_SCALE, cur * (1 - ZOOM_STEP));
    api.set(next);
  };

  const fitWidth = () => {
    zoomApiRef.current?.fit();
  };

  return (
    <div className="ooxml-viewer">
      {status === 'ready' && (
        <div className="ooxml-toolbar">
          <button type="button" className="ooxml-toolbar-btn" onClick={() => applyZoom(-1)} title={t('ooxml.zoomOut')}>
            −
          </button>
          <button type="button" className="ooxml-toolbar-btn" onClick={() => applyZoom(1)} title={t('ooxml.zoomIn')}>
            +
          </button>
          <button type="button" className="ooxml-toolbar-btn" onClick={fitWidth} title={t('ooxml.fitWidth')}>
            ⟲
          </button>
          <span className="ooxml-toolbar-level">{Math.round(zoom * 100)}%</span>
        </div>
      )}
      {status === 'loading' && (
        <div className="ooxml-viewer-state">{t('ooxml.loadingDocx')}</div>
      )}
      {status === 'error' && (
        <div className="ooxml-viewer-state ooxml-viewer-error">
          <p className="ooxml-viewer-error-title">{t('ooxml.failedDocx')}</p>
          <p className="ooxml-viewer-error-detail">{error}</p>
          <a className="ooxml-viewer-download" href={fileApi.rawUrl(filePath)} target="_blank" rel="noreferrer">
            {t('ooxml.download')}
          </a>
        </div>
      )}
      <div ref={hostRef} className="ooxml-viewer-host" />
    </div>
  );
}
