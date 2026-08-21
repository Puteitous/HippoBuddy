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
  isVisionProviderModel,
} from '@/utils/image-vision';
import { configApi } from '@/api/client';
import { on, type LlmChangedPayload } from '@/utils/eventBus';
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 视觉能力是否支持(由当前生效模型的 provider/model 决定)
  const [visionSupported, setVisionSupported] = useState(false);
  // 内联错误提示(单条,3s 后自动消失)
  const [warning, setWarning] = useState<string | null>(null);

  // ── 视觉能力检测 ──────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    // 初始拉取当前生效模型
    configApi
      .getLlm()
      .then((llm) => {
        if (!disposed) setVisionSupported(isVisionProviderModel(llm.provider, llm.model));
      })
      .catch(() => {
        // 拉取失败保持隐藏(不可用即不当作用户上传入口)
      });
    // 订阅模型切换,即时刷新
    const offLlmChanged = on<LlmChangedPayload>('llm:changed', (payload) => {
      setVisionSupported(isVisionProviderModel(payload.provider, payload.model));
    });
    return () => {
      disposed = true;
      offLlmChanged();
    };
  }, []);

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
        setWarning(`图片 ${file.name} 超过 20MB 限制`);
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        onAdd({ id: generateImageId(), dataUrl, name: file.name, size: file.size });
      } catch (e) {
        setWarning(`读取图片失败: ${file.name}${e instanceof Error ? `(${e.message})` : ''}`);
      }
    },
    [onAdd],
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
        title="添加图片(也可在输入框中直接粘贴)"
        aria-label="上传图片"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
          <path d="M8.5 13.5 11 16l4.5-4.5" />
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
                aria-label={`移除 ${img.name}`}
                title={`移除 ${img.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {overflow > 0 && (
            <span className="image-upload-overflow" title={`还有 ${overflow} 张图片`}>
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const ImageUpload = memo(ImageUploadComponent);
