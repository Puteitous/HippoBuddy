/**
 * ImageBackgroundCropModal - 图片背景裁剪弹窗
 *
 * 弹窗中央是固定矩形取景区,图片在其后可通过滑杆/按钮放大缩小、拖拽移动;
 * 取景区即背景可见区域(铺满整屏)。实时预览背景,「应用」即时写盘并关闭,「取消」还原。
 */
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBackgroundStore, FULL_CROP, type CropRect } from '@/stores/backgroundStore';
import { useI18n } from '@/i18n';
import './ImageBackgroundCropModal.css';

interface Props {
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

export function ImageBackgroundCropModal({ onClose }: Props) {
  const { t } = useI18n();
  const background = useBackgroundStore((s) => s.background);
  const originalDataUrl = useBackgroundStore((s) => s.originalDataUrl);
  const updateImageCrop = useBackgroundStore((s) => s.updateImageCrop);
  const commitImageCrop = useBackgroundStore((s) => s.commitImageCrop);

  // 打开时的初始取景区:取消时还原
  const initialCropRef = useRef<CropRect>(background.crop ? { ...background.crop } : { ...FULL_CROP });

  // 取景区(viewport)像素尺寸:与底图/取景区换算依赖,需在布局后读取
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({ w: el.clientWidth || 360, h: el.clientHeight || 240 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 底图自然尺寸
  const [nat, setNat] = useState<{ iw: number; ih: number } | null>(null);
  useEffect(() => {
    if (!originalDataUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNat({ iw: img.naturalWidth, ih: img.naturalHeight });
      }
    };
    img.src = originalDataUrl;
  }, [originalDataUrl]);

  // 缩放倍数(相对铺满整屏的基准倍率)与图片左上角偏移(px)
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const initedRef = useRef(false);

  // 由当前 crop 反推 zoom/offset,使取景区在 viewport 居中铺满
  useLayoutEffect(() => {
    if (!nat || viewport.w === 0 || initedRef.current) return;
    initedRef.current = true;
    const crop = initialCropRef.current;
    const { iw, ih } = nat;
    const targetS = Math.max(viewport.w / (crop.w * iw), viewport.h / (crop.h * ih));
    const baseS = Math.max(viewport.w / iw, viewport.h / ih);
    setZoom(targetS / baseS);
    setOffset({
      x: -crop.x * iw * targetS + (viewport.w - crop.w * iw * targetS) / 2,
      y: -crop.y * ih * targetS + (viewport.h - crop.h * ih * targetS) / 2,
    });
  }, [nat, viewport.w, viewport.h]);

  // 底图/尺寸未就绪时先还原初始取景区,避免跳跃
  useEffect(() => {
    if (!nat) {
      updateImageCrop(initialCropRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat]);

  // 由 zoom/offset 计算归一化取景区,并实时应用到背景
  const rafRef = useRef<number | null>(null);
  /** 拖动/缩放过程中的最新取景区(草稿):松手或「应用」时才真正渲染并写盘 */
  const draftRef = useRef<CropRect | null>(null);
  /** zoom/offset 的实时镜像(滚轮高频缩放时读取,避免闭包里的陈旧 state) */
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  /** 钳制偏移(图片须始终覆盖取景区,zoom>=1 即铺满) */
  function clampOffset(z: number, o: { x: number; y: number }) {
    if (!nat || viewport.w === 0) return o;
    const { iw, ih } = nat;
    const baseS = Math.max(viewport.w / iw, viewport.h / ih);
    const s = baseS * z;
    return {
      x: Math.min(0, Math.max(viewport.w - iw * s, o.x)),
      y: Math.min(0, Math.max(viewport.h - ih * s, o.y)),
    };
  }

  /** 由 zoom/offset 计算归一化取景区 */
  function computeCrop(z: number, o: { x: number; y: number }): CropRect {
    const { iw, ih } = nat as { iw: number; ih: number };
    const baseS = Math.max(viewport.w / iw, viewport.h / ih);
    const s = baseS * z;
    const cx = Math.max(0, Math.min(1, -o.x / s / iw));
    const cy = Math.max(0, Math.min(1, -o.y / s / ih));
    const cw = Math.max(0, Math.min(1 - cx, viewport.w / s / iw));
    const ch = Math.max(0, Math.min(1 - cy, viewport.h / s / ih));
    return { x: cx, y: cy, w: cw, h: ch };
  }

  /**
   * 更新 zoom/offset 状态(弹窗取景区图片实时平移缩放,纯 CSS)。
   * 真正渲染裁剪图 + 写背景只在 commitDraft(松手/「应用」)时做一次,避免拖动帧频繁重算。
   */
  function applyTransform(z: number, o: { x: number; y: number }) {
    const clamped = clampOffset(z, o);
    setZoom(z);
    setOffset(clamped);
    if (nat && viewport.w > 0) {
      draftRef.current = computeCrop(z, clamped);
    }
  }

  /** 把最新取景区真正渲染到背景(仅一次),并即时落盘 */
  function commitDraft() {
    const draft = draftRef.current;
    if (draft) {
      updateImageCrop(draft);
    }
  }

  // 拖动取景区内的图片
  const draggingRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  function onViewportPointerDown(e: React.PointerEvent) {
    if (!nat) return;
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    draggingRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onViewportPointerMove(e: React.PointerEvent) {
    const d = draggingRef.current;
    if (!d) return;
    const next = { x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => applyTransform(zoom, next));
  }
  function endDrag() {
    draggingRef.current = null;
    commitDraft();
  }

  function changeZoom(nextZ: number) {
    if (!nat) return;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZ));
    // 以取景区中心为锚点缩放,保持观察中心不漂移
    const { iw, ih } = nat;
    const baseS = Math.max(viewport.w / iw, viewport.h / ih);
    const curS = baseS * zoomRef.current;
    // 视野中心的图像坐标 = (视野中心像素 - 图片左上角位移) / 当前缩放
    const centerImg = {
      x: (viewport.w / 2 - offsetRef.current.x) / curS,
      y: (viewport.h / 2 - offsetRef.current.y) / curS,
    };
    applyTransform(z, {
      x: viewport.w / 2 - centerImg.x * (baseS * z),
      y: viewport.h / 2 - centerImg.y * (baseS * z),
    });
    requestCommit();
  }

  // 滚轮缩放(以取景区中心为锚点),原生监听以 allow 阻止页面滚动
  const changeZoomRef = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    changeZoomRef.current = changeZoom;
  });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9; // 滚轮向上=放大,向下=缩小
      changeZoomRef.current(zoomRef.current * factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 缩放时实时把取景区提交到背景(rAF 节流,放大缩小一致)
  const zoomCommitRaf = useRef<number | null>(null);
  function requestCommit() {
    if (zoomCommitRaf.current) cancelAnimationFrame(zoomCommitRaf.current);
    zoomCommitRaf.current = requestAnimationFrame(() => {
      commitDraft();
    });
  }

  function reset() {
    if (!nat) return;
    const { iw, ih } = nat;
    const baseS = Math.max(viewport.w / iw, viewport.h / ih);
    applyTransform(1, { x: (viewport.w - iw * baseS) / 2, y: (viewport.h - ih * baseS) / 2 });
    requestCommit();
  }

  function apply() {
    commitDraft();
    commitImageCrop();
    onClose();
  }
  function cancel() {
    updateImageCrop(initialCropRef.current);
    commitImageCrop();
    onClose();
  }

  // Esc 关闭(等价取消)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseS = nat ? Math.max(viewport.w / nat.iw, viewport.h / nat.ih) : 1;
  const s = baseS * zoom;
  const imgStyle = nat
    ? {
        width: nat.iw * s,
        height: nat.ih * s,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }
    : undefined;

  return createPortal(
    <div
      className="bg-crop-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('settingsPage.generalBgCropTitle')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="bg-crop-modal">
        <div className="bg-crop-modal-head">
          <span>{t('settingsPage.generalBgCropTitle')}</span>
          <button
            type="button"
            className="bg-crop-modal-close"
            onClick={cancel}
            aria-label={t('settingsPage.generalBgClose')}
          >
            ×
          </button>
        </div>

        <div
          ref={viewportRef}
          className="bg-crop-viewport"
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {originalDataUrl && (
            <img
              className="bg-crop-viewport-img"
              src={originalDataUrl}
              alt=""
              draggable={false}
              style={imgStyle}
              onDragStart={(e) => e.preventDefault()}
            />
          )}
          {/* 固定取景区边框(不可移动/缩放,图片在其后移动) */}
          <div className="bg-crop-frame" />
        </div>

        {/* 缩放控制 */}
        <div className="bg-crop-controls">
          <button
            type="button"
            className="bg-crop-zoom-btn"
            onClick={() => changeZoom(zoom - 0.2)}
            disabled={!nat}
          >
            −
          </button>
          <input
            type="range"
            className="bg-crop-zoom-slider"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            value={zoom}
            disabled={!nat}
            onChange={(e) => changeZoom(parseFloat(e.target.value))}
          />
          <button
            type="button"
            className="bg-crop-zoom-btn"
            onClick={() => changeZoom(zoom + 0.2)}
            disabled={!nat}
          >
            +
          </button>
          <button type="button" className="bg-crop-reset" onClick={reset} disabled={!nat}>
            {t('settingsPage.generalBgReset')}
          </button>
        </div>

        <div className="bg-crop-actions">
          <button type="button" className="bg-crop-btn bg-crop-btn-cancel" onClick={cancel}>
            {t('settingsPage.generalBgCancel')}
          </button>
          <button type="button" className="bg-crop-btn bg-crop-btn-apply" onClick={apply} disabled={!nat}>
            {t('settingsPage.generalBgApply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}