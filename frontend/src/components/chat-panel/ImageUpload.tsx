/**
 * ImageUpload - 图片上传 + 预览
 *
 * 阶段 3.4:补齐 ChatPanel 的多模态能力。
 *
 * 设计要点:
 *  - 受控组件:images state 由 ChatPanel 持有,本组件通过 onAdd/onRemove 通知变更
 *  - 上传按钮可见性:依赖当前模型是否支持视觉。
 *    初始拉取 GET /api/config/llm,切换模型时订阅 llm:changed 事件即时刷新。
 *  - 触发方式:按钮点击 → 隐藏 input[type=file](粘贴由 ChatPanel 在输入框上
 *    直接 onPaste 处理,因输入框不在 .image-upload 内部)
 *  - 大小校验:超过 20MB 给出 toast-like 内联警告(无第三方依赖)
 *  - 缩略图:点击在新标签打开 dataUrl(简化,不引入 image-lightbox)
 *
 * 与旧版 ImageUpload.js 的差异:
 *  - 不再使用 EventBus / showToast,改为受控 props + 简单 inline warning
 *  - 不实现 _ensureFileInput 兜底(input 直接挂在组件 JSX 里,不会丢失)
 *  - 不实现 image-lightbox(可点击放大,简化为新标签打开)
 *  - 拖拽上传留待 3.7
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { PendingImage } from '@/types';
import {
  MAX_IMAGE_SIZE_BYTES,
  fileToDataUrl,
  generateImageId,
} from '@/utils/image-vision';
import { useVisionSupport } from '@/hooks/useVisionSupport';
import { useI18n } from '@/i18n';
import './ImageUpload.css';

interface ImageUploadProps {
  images: PendingImage[];
  onAdd: (image: PendingImage) => void;
  onRemove: (id: string) => void;
  /** 是否禁用(Sending 时禁用按钮) */
  disabled?: boolean;
  /** 是否渲染缩略图预览(对齐旧版布局时预览移出状态栏,由宿主在附件行渲染) */
  showPreview?: boolean;
}

function ImageUploadComponent({
  images,
  onAdd,
  onRemove,
  disabled = false,
  showPreview = true,
}: ImageUploadProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 视觉能力是否支持(由当前生效模型的 provider/model 决定)
  const visionSupported = useVisionSupport();
  // 内联错误提示(单条,3s 后自动消失)
  const [warning, setWarning] = useState<string | null>(null);

  // 警告 3s 后自动消失
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 3000);
    return () => clearTimeout(t);
  }, [warning]);

  // ── 添加图片(从 File 读取为 dataUrl 后通知 ChatPanel) ─────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setWarning(t('chat.imageTooLarge', { name: file.name }));
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        onAdd({ id: generateImageId(), dataUrl, name: file.name, size: file.size });
      } catch (e) {
        const err = e instanceof Error ? ` (${e.message})` : '';
        setWarning(t('chat.readImageFailedUpload', { name: file.name, err }));
      }
    },
    [onAdd, t],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList) return;
      Array.from(fileList).forEach((f) => void handleFile(f));
      // 重置 value 以便同一文件可再次选择
      e.target.value = '';
    },
    [handleFile],
  );

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── 缩略图点击放大(新标签打开 dataUrl,简化处理) ─────────
  const handleThumbClick = useCallback((dataUrl: string, name: string) => {
    window.open(dataUrl, '_blank', `noopener,noreferrer,title=${encodeURIComponent(name)}`);
  }, []);

  // 视觉能力不支持时,整个组件不渲染(避免误用)
  if (!visionSupported) return null;

  const hasImages = images.length > 0;
  const maxShow = 5;
  const showImages = images.slice(0, maxShow);
  const overflow = images.length - maxShow;

  return (
    <div className="image-upload">
      {/* 隐藏文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="image-upload-input"
        onChange={handleFileInputChange}
        aria-hidden
      />

      {/* 上传按钮 */}
      <button
        type="button"
        className="image-upload-btn"
        onClick={handleButtonClick}
        disabled={disabled}
        title={t('chat.addImageTitle')}
        aria-label={t('chat.uploadImage')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>

      {/* 内联警告(无第三方依赖,3s 自动消失) */}
      {warning && <span className="image-upload-warning">{warning}</span>}

      {/* 缩略图列表(showPreview=false 时由宿主在附件行渲染,对齐旧版 .input-img-preview) */}
      {showPreview && hasImages && (
        <div className="image-upload-previews">
          {showImages.map((img) => (
            <div key={img.id} className="image-upload-thumb-wrapper">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="image-upload-thumb"
                onClick={() => handleThumbClick(img.dataUrl, img.name)}
              />
              <button
                type="button"
                className="image-upload-remove"
                onClick={() => onRemove(img.id)}
                aria-label={t('chat.removeImage', { name: img.name })}
                title={t('chat.removeImage', { name: img.name })}
              >
                ×
              </button>
            </div>
          ))}
          {overflow > 0 && (
            <span className="image-upload-overflow" title={t('chat.moreImages', { count: overflow })}>
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const ImageUpload = memo(ImageUploadComponent);
