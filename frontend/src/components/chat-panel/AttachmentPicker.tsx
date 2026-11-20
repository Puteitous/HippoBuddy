/**
 * AttachmentPicker - 状态栏附件选择按钮(任意文件类型)
 *
 * 只负责选文件并回调,不区分类型;分流交给 InlineInput.addFiles,与拖拽共用:
 *  - 图片 → 图片管线(视觉识别、大小校验、缩略图预览)
 *  - 其他文件 → 输入框内生成文件引用芯片(路径引用,不复制文件)
 */
import { memo, useCallback, useRef } from 'react';
import { useI18n } from '@/i18n';
import './ImageUpload.css';

interface AttachmentPickerProps {
  onFiles: (files: File[]) => void;
  /** 是否禁用(Sending 时禁用按钮) */
  disabled?: boolean;
}

function AttachmentPickerComponent({ onFiles, disabled = false }: AttachmentPickerProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (fileList && fileList.length > 0) {
        onFiles(Array.from(fileList));
      }
      // 重置 value 以便同一文件可再次选择
      e.target.value = '';
    },
    [onFiles],
  );

  return (
    <>
      {/* 隐藏文件选择器:不限制 accept,任意文件均可选 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="attachment-input"
        onChange={handleFileInputChange}
        aria-hidden
      />

      <button
        type="button"
        className="attachment-btn"
        onClick={handleButtonClick}
        disabled={disabled}
        title={t('chat.addAttachmentTitle')}
        aria-label={t('chat.addAttachment')}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  );
}

export const AttachmentPicker = memo(AttachmentPickerComponent);
