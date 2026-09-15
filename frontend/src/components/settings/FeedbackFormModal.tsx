/**
 * FeedbackFormModal - 建议反馈弹窗
 *
 * 迁移自官网(website/src/components/FeedbackForm)的表单逻辑:
 *  - Supabase (PostgREST + Storage) 直连, 先并行传图拿公开 URL, 再随反馈单条插入。
 *  - 字段: 类型 + 标题(必填) + 详细描述 + 联系方式 + 截图(最多 2 张)。
 *  - 图片前端 canvas 压缩到 ≤1MB(超限逐档降质, 长边限 1920)。
 *  - submittingRef 守卫防重复提交(双击/连点只插一条)。
 *
 * 与官网差异: 认证来源改成桌面端常量(feedback-config), i18n 走 useI18n。
 * 安全模型(RLS)不变——桌面端直连同样只放开 INSERT、拒绝 SELECT。
 */
import { createPortal } from 'react-dom';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { FEEDBACK_CONFIG } from '@/utils/feedback-config';
import './FeedbackFormModal.css';

const MAX_IMAGES = 2;

const FEEDBACK_TYPES = [
  { value: 'bug', labelKey: 'feedback.typeBug' },
  { value: 'suggestion', labelKey: 'feedback.typeSuggestion' },
  { value: 'feature', labelKey: 'feedback.typeFeature' },
  { value: 'other', labelKey: 'feedback.typeOther' },
];

/* 图片压缩: 目标 JPEG ≤ maxSize 字节; 若边长过大先等比缩小; 转 JPEG 保底压缩 */
function compressImage(file: File, maxSize = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read error'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode error'));
      img.onload = () => {
        const MAX_EDGE = 1920;
        let { width, height } = img;
        if (width > MAX_EDGE || height > MAX_EDGE) {
          const k = MAX_EDGE / Math.max(width, height);
          width = Math.round(width * k);
          height = Math.round(height * k);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas error'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // 先按 0.85 质量转, 若仍超限则逐档降质
        let quality = 0.85;
        let out = canvas.toDataURL('image/jpeg', quality);
        while (out.length > maxSize * 1.33 && quality > 0.4) {
          quality -= 0.15;
          out = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(out);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

interface Props {
  onClose: () => void;
}

export function FeedbackFormModal({ onClose }: Props): ReactNode {
  const { t } = useI18n();
  const { supabaseUrl, supabaseAnonKey } = FEEDBACK_CONFIG;
  const configured = Boolean(supabaseUrl && supabaseAnonKey);

  const [type, setType] = useState('suggestion');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [imageFiles, setImageFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'unconfigured'>('idle');
  // 防重复提交: 正在提交时忽略后续 submit 事件(双击/连点也只插一条)
  const submittingRef = useRef(false);

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /* 点击选择与拖拽共用: 校验图片格式 + 压缩 + 追加到列表 */
  async function addImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (imageFiles.length >= MAX_IMAGES) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setImageFiles((prev) => [...prev, { name: file.name, dataUrl }]);
    } catch {
      // 压缩失败则忽略本次选择
    } finally {
      setImgBusy(false);
    }
  }

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await addImage(file);
  }

  function handleDropImage(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void addImage(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured) return;
    if (submittingRef.current) return; // 已在提交中, 忽略重复触发
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    submittingRef.current = true;
    setStatus('submitting');
    try {
      // 先并行上传所有截图, 拿到公开 URL 数组
      const imageUrls = await Promise.all(
        imageFiles.map(async ({ dataUrl }) => {
          const base64 = dataUrl.split(',')[1];
          const bin = atob(base64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const blob: Blob = new Blob([arr], { type: 'image/jpeg' });
          // 唯一文件名: uuid.jpeg → 避免覆盖冲突
          const fileName = `${crypto.randomUUID()}.jpg`;
          const upRes = await fetch(`${supabaseUrl}/storage/v1/object/feedback-images/${fileName}`, {
            method: 'POST',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'image/jpeg',
            },
            body: blob,
          });
          if (!upRes.ok) throw new Error(`upload error ${upRes.status}`);
          return `${supabaseUrl}/storage/v1/object/public/feedback-images/${fileName}`;
        }),
      );

      const insRes = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          type,
          title: trimmedTitle,
          description: description.trim(),
          contact: contact.trim() || null,
          image_urls: imageUrls.length ? imageUrls : null,
        }),
      });
      if (!insRes.ok) throw new Error(`insert error ${insRes.status}`);
      submittingRef.current = false;
      setStatus('success');
    } catch {
      submittingRef.current = false;
      setStatus('error');
    }
  }

  return createPortal(
    <div
      className="feedback-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('feedback.title')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && status !== 'submitting') onClose();
      }}
    >
      <div className="feedback-modal">
        <div className="feedback-modal-head">
          <span>{t('feedback.title')}</span>
          <button
            type="button"
            className="feedback-modal-close"
            onClick={onClose}
            disabled={status === 'submitting'}
            aria-label={t('feedback.close')}
          >
            ×
          </button>
        </div>

        <div className="feedback-modal-body">
          {status === 'success' ? (
            <div className="feedback-success">
              <div className="feedback-success-title">{t('feedback.success')}</div>
              <p className="feedback-success-desc">
                {t('feedback.successDesc')}
                {type === 'feature' && <span>{t('feedback.successFeature')}</span>}
              </p>
              <button
                type="button"
                className="feedback-submit"
                onClick={() => {
                  setTitle('');
                  setDescription('');
                  setContact('');
                  setImageFiles([]);
                  setStatus('idle');
                }}
              >
                {t('feedback.again')}
              </button>
            </div>
          ) : (
            <form className="feedback-form" onSubmit={handleSubmit}>
              {/* 类型 */}
              <div className="feedback-field">
                <span className="feedback-label">{t('feedback.type')}</span>
                <div className="feedback-type-group" role="radiogroup" aria-label={t('feedback.type')}>
                  {FEEDBACK_TYPES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={type === opt.value}
                      className={`feedback-type-btn${type === opt.value ? ' active' : ''}`}
                      onClick={() => setType(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 标题 */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-title">
                  {t('feedback.titleLabel')}
                  <span className="feedback-required">*</span>
                </label>
                <input
                  id="feedback-title"
                  className="feedback-input"
                  value={title}
                  maxLength={120}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={t('feedback.titlePh')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* 详细描述 */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-desc">
                  {t('feedback.descLabel')}
                </label>
                <textarea
                  id="feedback-desc"
                  className="feedback-textarea"
                  rows={5}
                  value={description}
                  maxLength={2000}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={t('feedback.descPh')}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* 图片 (可选, 最多 2 张) */}
              <div className="feedback-field">
                <span className="feedback-label">
                  {t('feedback.imageLabel')}
                  <span className="feedback-optional">{t('feedback.imageHint')}</span>
                </span>
                <div className="feedback-image-list">
                  {imageFiles.map(({ dataUrl }, idx) => (
                    <div key={idx} className="feedback-image-preview">
                      <img src={dataUrl} alt={t('feedback.imagePreview')} />
                      <button
                        type="button"
                        className="feedback-image-remove"
                        aria-label={t('feedback.imageRemove')}
                        onClick={() => setImageFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {imageFiles.length < MAX_IMAGES && (
                    <label
                      className={`feedback-image-picker${dragging ? ' drag' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!dragging) setDragging(true);
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget === e.target) setDragging(false);
                      }}
                      onDrop={handleDropImage}
                    >
                      <input type="file" accept="image/*" onChange={handlePickImage} hidden />
                      {imgBusy ? (
                        t('feedback.imageBusy')
                      ) : (
                        <>
                          {t('feedback.imagePick')}
                          <span className="feedback-image-picker-hint">{t('feedback.imageFormatHint')}</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>

              {/* 联系方式 */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-contact">
                  {t('feedback.contactLabel')}
                  <span className="feedback-optional">{t('feedback.contactHint')}</span>
                </label>
                <input
                  id="feedback-contact"
                  className="feedback-input"
                  value={contact}
                  maxLength={80}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={t('feedback.contactPh')}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>

              {status === 'unconfigured' && (
                <p className="feedback-error">{t('feedback.unconfigured')}</p>
              )}
              {status === 'error' && <p className="feedback-error">{t('feedback.error')}</p>}

              {!configured ? (
                <button type="button" className="feedback-submit feedback-submit-disabled" disabled>
                  {t('feedback.unavailable')}
                </button>
              ) : (
                <button
                  type="submit"
                  className={`feedback-submit${!title.trim() || status === 'submitting' ? ' feedback-submit-disabled' : ''}`}
                  disabled={!title.trim() || status === 'submitting'}
                >
                  {status === 'submitting' ? t('feedback.submitting') : t('feedback.submit')}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}