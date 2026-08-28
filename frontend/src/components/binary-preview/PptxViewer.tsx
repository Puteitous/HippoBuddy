/**
 * PptxViewer — @silurus/ooxml PPTX 预览(React 容器)
 *
 * 使用 Silurus PptxScrollViewer(内置虚拟滚动 + 文字选取),
 * 自定义缩放工具栏(禁用内置 zoom,步进 0.15,范围 0.25~4,对齐旧版)。
 *
 * 生命周期:
 *   - 挂载/文件切换:创建 viewer 并 load;onScaleChange 驱动 zoom 显示
 *   - 卸载:cancelled 标记 + destroy,防止异步 setState 竞态
 */
import { useEffect, useRef, useState } from 'react';
import { fileApi } from '@/api/client';
import { useI18n } from '@/i18n';
import { createPptxScrollViewer } from './ooxml-bridge';
import type { PptxScrollViewerLike } from './ooxml-bridge';
import './OoxmlViewer.css';

interface PptxViewerProps {
  /** 文件绝对路径 */
  filePath: string;
}

type ViewerStatus = 'loading' | 'ready' | 'error';

const ZOOM_STEP = 0.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

export function PptxViewer({ filePath }: PptxViewerProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxScrollViewerLike | null>(null);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let viewer: PptxScrollViewerLike | null = null;
    let cancelled = false;

    setStatus('loading');
    setError('');
    setZoom(1);
    const url = fileApi.rawUrl(filePath);

    void (async () => {
      try {
        viewer = await createPptxScrollViewer(host, url, {
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
          viewer.destroy();
          viewer = null;
          return;
        }
        viewerRef.current = viewer;
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [filePath]);

  const applyZoom = (direction: 1 | -1) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const cur = viewer.getScale();
    const next =
      direction > 0
        ? Math.min(MAX_SCALE, cur * (1 + ZOOM_STEP))
        : Math.max(MIN_SCALE, cur * (1 - ZOOM_STEP));
    viewer.setScale(next);
  };

  const fitWidth = () => {
    viewerRef.current?.fitWidth();
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
        <div className="ooxml-viewer-state">{t('ooxml.loadingPptx')}</div>
      )}
      {status === 'error' && (
        <div className="ooxml-viewer-state ooxml-viewer-error">
          <p className="ooxml-viewer-error-title">{t('ooxml.failedPptx')}</p>
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
