/**
 * Lightbox - 图片灯箱预览(阶段 3.8 对齐旧版 image-lightbox)
 *
 * 在聊天输入区缩略图点击时打开,支持:
 *  - 上一张 / 下一张切换
 *  - Esc / 点击背景关闭
 *  - 键盘 ← / → 切换,Esc 关闭
 *  - 展示文件名与索引 n/total
 */
import { useCallback, useEffect } from 'react';
import { useI18n } from '@/i18n';
import './Lightbox.css';

interface LightboxImage {
  /** dataUrl 或 src */
  src: string;
  /** 文件名(alt / 标题) */
  name: string;
}

interface LightboxProps {
  images: LightboxImage[];
  /** 当前展示的索引 */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const { t } = useI18n();
  const current = images[index];

  const prev = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  const next = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  // 键盘导航:Escape 关闭,←/→ 切换(锁定到打开的照片上)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [prev, next, onClose]);

  if (!current) return null;

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.preview', { name: current.name })}
      onClick={onClose}
    >
      <div className="lightbox-header">
        <span className="lightbox-filename" title={current.name}>
          {current.name}
        </span>
        <span className="lightbox-count">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          className="lightbox-close"
          onClick={onClose}
          aria-label={t('lightbox.close')}
          title={t('lightbox.closeTitle')}
        >
          ×
        </button>
      </div>

      <div className="lightbox-stage">
        <img src={current.src} alt={current.name} className="lightbox-img" onClick={(e) => e.stopPropagation()} />

        {images.length > 1 && (
          <>
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label={t('lightbox.prev')}
              title={t('lightbox.prevShortcut')}
            >
              ‹
            </button>
            <button
              type="button"
              className="lightbox-nav lightbox-next"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label={t('lightbox.next')}
              title={t('lightbox.nextShortcut')}
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}