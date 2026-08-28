/**
 * ImagePreview - 图片预览(阶段 3.8 对齐旧版 _initImageZoom 缩放交互)
 *
 * 对齐旧版 BinaryPreview.js showImageOrPdf / _initImageZoom:
 *  - 工具栏:缩小(−)/放大(+)/重置(⟲)
 *  - 视口内滚轮缩放,以鼠标位置为缩放中心
 *  - 拖拽平移、双击重置、初始自适应视口(fitToViewport)
 *  - 视口尺寸变化时重新适配
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { translate as i18nTranslate } from '@/i18n';
import './ImagePreview.css';

interface ImagePreviewProps {
  /** 图片原始 URL(/api/file/raw) */
  src: string;
  /** 图片文件名(用于 alt / 失败提示) */
  fileName: string;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const ZOOM_STEP = 0.25;

export function ImagePreview({ src, fileName }: ImagePreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 缩放/平移状态
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  // 拖拽状态(用 ref 避免闭包过期 + 重渲染)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  // 自适应后的基准缩放(供缩放步进从 fit 值出发,避免一步跳过比例)
  const fitScaleRef = useRef(1);
  const [loadFailed, setLoadFailed] = useState(false);
  // 是否已初始化视口尺寸(fitToViewport 需要)
  const dimensionsRef = useRef({ w: 0, h: 0 });

  const applyTransform = useCallback(
    (s: number, t: { x: number; y: number }) => {
      const img = imgRef.current;
      if (img) img.style.transform = `translate(${t.x}px, ${t.y}px) scale(${s})`;
    },
    [],
  );

  /** 自适应视口:图片完整可见,不超过原始大小 */
  const fitToViewport = useCallback(() => {
    const img = imgRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport || !img.naturalWidth || !img.naturalHeight) return;

    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    dimensionsRef.current = { w: vpW, h: vpH };
    const padW = vpW * 0.92;
    const padH = vpH * 0.85;
    const fit = Math.min(padW / img.naturalWidth, padH / img.naturalHeight, 1);
    fitScaleRef.current = fit;
    setScale(fit);
    setTranslate({ x: 0, y: 0 });
    applyTransform(fit, { x: 0, y: 0 });
  }, [applyTransform]);

  /** 以视口内某点为缩放中心调整缩放比例 */
  const zoomAt = useCallback(
    (newScale: number, cx: number, cy: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const vpW = rect.width;
      const vpH = rect.height;
      const nextTranslate = {
        x: translate.x - (newScale - scale) * ((cx - rect.left) / vpW - 0.5) * vpW,
        y: translate.y - (newScale - scale) * ((cy - rect.top) / vpH - 0.5) * vpH,
      };
      setScale(newScale);
      setTranslate(nextTranslate);
      applyTransform(newScale, nextTranslate);
    },
    [scale, translate, applyTransform],
  );

  // 滚轮缩放入口：React 的 onWheel 默认被注册为 passive 监听器，
  // 在其内部调用 preventDefault() 会抛 "Unable to preventDefault inside passive event listener".
  // 因此改用「原生 wheel 监听」并显式指定 { passive: false }，才能合法阻止页面滚动。
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});

  useEffect(() => {
    wheelHandlerRef.current = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, scale * (1 + direction * ZOOM_STEP)),
      );
      if (newScale !== scale) {
        zoomAt(newScale, e.clientX, e.clientY);
      }
    };
  }, [scale, zoomAt]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onNativeWheel = (e: WheelEvent) => wheelHandlerRef.current(e);
    viewport.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onNativeWheel);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const img = imgRef.current;
      if (!img) return;
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        baseX: translate.x,
        baseY: translate.y,
      };
      img.style.cursor = 'grabbing';
      e.preventDefault();
    },
    [translate],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const nextTranslate = { x: drag.baseX + dx, y: drag.baseY + dy };
      setTranslate(nextTranslate);
      applyTransform(scale, nextTranslate);
    },
    [scale, applyTransform],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current = { active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 };
    if (imgRef.current) imgRef.current.style.cursor = '';
  }, []);

  const onToolbar = useCallback(
    (action: 'zoom-in' | 'zoom-out' | 'reset') => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (action === 'zoom-in') {
        zoomAt(Math.min(MAX_SCALE, scale * (1 + ZOOM_STEP)), cx, cy);
      } else if (action === 'zoom-out') {
        zoomAt(Math.max(MIN_SCALE, scale * (1 - ZOOM_STEP)), cx, cy);
      } else {
        setScale(fitScaleRef.current);
        setTranslate({ x: 0, y: 0 });
        applyTransform(fitScaleRef.current, { x: 0, y: 0 });
      }
    },
    [scale, zoomAt, applyTransform],
  );

  // 视口尺寸变化时重新适配(对齐旧版 resizeObserver)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onResize = () => {
      if (dimensionsRef.current.w === viewport.clientWidth && dimensionsRef.current.h === viewport.clientHeight) {
        return;
      }
      fitToViewport();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToViewport]);

  return (
    <div className="image-preview file-binary-preview image">
      <div className="img-zoom-toolbar">
        <button type="button" className="img-zoom-btn" onClick={() => onToolbar('zoom-out')} title={i18nTranslate('preview.zoomOut')}>
          −
        </button>
        <button type="button" className="img-zoom-btn" onClick={() => onToolbar('zoom-in')} title={i18nTranslate('preview.zoomIn')}>
          +
        </button>
        <button type="button" className="img-zoom-btn img-zoom-reset" onClick={() => onToolbar('reset')} title={i18nTranslate('preview.zoomResetScale')}>
          ⟲
        </button>
      </div>
      <div
        ref={viewportRef}
        className="img-zoom-viewport"
      >
        {loadFailed ? (
          <div className="file-preview-placeholder">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor"
                 strokeWidth="1.5" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{i18nTranslate('preview.imageLoadFailed')}</p>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={src}
            alt={fileName}
            className="img-zoomable"
            draggable={false}
            onLoad={fitToViewport}
            onError={() => setLoadFailed(true)}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onDoubleClick={() => onToolbar('reset')}
          />
        )}
      </div>
    </div>
  );
}