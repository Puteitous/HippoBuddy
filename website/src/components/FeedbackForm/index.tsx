import {type FormEvent, type ReactNode, useRef, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Translate, {translate} from '@docusaurus/Translate';

import styles from './styles.module.css';

/* ===================================================================
 * 建议反馈表单 · Supabase (PostgREST + Storage) 直连
 *
 * 架构: 本网站是 GitHub Pages 纯静态站, 请求直接由浏览器发往
 *       Supabase, 无需自建后端。
 *   - 文本/标题/联系方式 → POST /rest/v1/feedback
 *   - 图片(可选, 单张)   → POST /storage/v1/object/feedback-images/...
 *                           提交时先传图, 再把公开 URL 写进 feedback 行。
 *
 * 安全模型 (重要):
 *   - anon/publishable key 对浏览器公开, 数据安全靠 RLS。
 *   - 表 feedback: 只放开 INSERT, SELECT 一律拒绝 → 访客只能写, 读不到数据。
 *   - 存储桶 feedback-images: 公开读(方便页面显示图), 只放行匿名上传。
 *     create policy "public upload feedback images"
 *       on storage.objects for insert to anon with check (
 *         bucket_id = 'feedback-images'
 *       );
 *
 * 连接参数来自 siteConfig.customFields(即构建时的环境变量):
 *   SUPABASE_URL / SUPABASE_ANON_KEY
 * =================================================================== */

const MAX_IMAGES = 2;

const FEEDBACK_TYPES = [
  {value: 'bug', key: 'bug'},
  {value: 'suggestion', key: 'suggestion'},
  {value: 'feature', key: 'feature'},
  {value: 'other', key: 'other'},
];

const TYPE_LABEL: Record<string, string> = {
  bug: '问题/Bug',
  suggestion: '功能建议',
  feature: '催更/新特性',
  other: '其他',
};

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
        let {width, height} = img;
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

function SuccessState({onAgain, type}: {onAgain: () => void; type: string}) {
  return (
    <div className={styles.success}>
      <div className={styles.successTitle}>
        <Translate>提交成功，感谢反馈！</Translate>
      </div>
      <p className={styles.successDesc}>
        <Translate>你的建议我们已收到，会认真评估。</Translate>
        {type === 'feature' && <Translate>（新特性类的反馈会优先评估）</Translate>}
      </p>
      <button type="button" className={styles.submit} onClick={onAgain}>
        <Translate>再提交一条</Translate>
      </button>
    </div>
  );
}

export default function FeedbackForm(props: {compact?: boolean}): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const {customFields} = siteConfig;
  const supabaseUrl = customFields?.supabaseUrl as string | undefined;
  const anonKey = customFields?.supabaseAnonKey as string | undefined;
  const configured = Boolean(supabaseUrl && anonKey);

  const [type, setType] = useState('suggestion');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [imageFiles, setImageFiles] = useState<{name: string; dataUrl: string}[]>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'unconfigured'>(
    'idle',
  );
  // 防重复提交: 正在提交时忽略后续 submit 事件(双击/连点也只插一条)
  const submittingRef = useRef(false);

  /* 点击选择与拖拽共用: 校验图片格式 + 压缩 + 追加到列表 */
  async function addImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (imageFiles.length >= MAX_IMAGES) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setImageFiles((prev) => [...prev, {name: file.name, dataUrl}]);
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
        imageFiles.map(async ({dataUrl}) => {
          const base64 = dataUrl.split(',')[1];
          const bin = atob(base64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const blob: Blob = new Blob([arr], {type: 'image/jpeg'});
          // 唯一文件名: uuid.jpeg → 避免覆盖冲突
          const fileName = `${crypto.randomUUID()}.jpg`;
          const upRes = await fetch(
            `${supabaseUrl}/storage/v1/object/feedback-images/${fileName}`,
            {
              method: 'POST',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'Content-Type': 'image/jpeg',
              },
              body: blob,
            },
          );
          if (!upRes.ok) throw new Error(`upload error ${upRes.status}`);
          return `${supabaseUrl}/storage/v1/object/public/feedback-images/${fileName}`;
        }),
      );

      const insRes = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
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

  const rootClass = props.compact ? styles.formCompact : styles.form;

  if (status === 'success') {
    return (
      <SuccessState
        onAgain={() => {
          setTitle('');
          setDescription('');
          setContact('');
          setImageFiles([]);
          setStatus('idle');
        }}
        type={type}
      />
    );
  }

  return (
    <form className={rootClass} onSubmit={handleSubmit}>
      {/* 类型 */}
      <div className={styles.field}>
        <span className={styles.label}>
          <Translate>反馈类型</Translate>
        </span>
        <div className={styles.typeGroup} role="radiogroup" aria-label={translate({message: '反馈类型'})}>
          {FEEDBACK_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              className={`${styles.typeBtn} ${type === t.value ? styles.typeBtnActive : ''}`}
              onClick={() => setType(t.value)}>
              <Translate>{TYPE_LABEL[t.value]}</Translate>
            </button>
          ))}
        </div>
      </div>

      {/* 标题 */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="feedback-title">
          <Translate>标题</Translate>
          <span className={styles.required}>*</span>
        </label>
        <input
          id="feedback-title"
          className={styles.input}
          value={title}
          maxLength={120}
          placeholder={translate({
            message: '一句话概括你的问题或建议',
            description: '反馈标题占位文案',
          })}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* 详细描述 */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="feedback-desc">
          <Translate>详细描述</Translate>
        </label>
        <textarea
          id="feedback-desc"
          className={styles.textarea}
          rows={props.compact ? 4 : 6}
          value={description}
          maxLength={2000}
          placeholder={translate({
            message: '越具体越好：触发场景、期望结果、复现步骤…',
            description: '反馈描述占位文案',
          })}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* 图片 (可选, 最多 2 张) */}
      <div className={styles.field}>
        <span className={styles.label}>
          <Translate>截图</Translate>
          <span className={styles.optional}><Translate>（选填，最多 2 张）</Translate></span>
        </span>
        <div className={styles.imageList}>
          {imageFiles.map(({dataUrl}, idx) => (
            <div key={idx} className={styles.imagePreview}>
              <img src={dataUrl} alt={translate({message: '反馈截图预览'})} />
              <button
                type="button"
                className={styles.imageRemove}
                aria-label={translate({message: '移除截图'})}
                onClick={() =>
                  setImageFiles((prev) => prev.filter((_, i) => i !== idx))
                }>
                ✕
              </button>
            </div>
          ))}
          {imageFiles.length < MAX_IMAGES && (
            <label
              className={`${styles.imagePicker} ${dragging ? styles.imagePickerDrag : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={(e) => {
                // 只在离开目标本身时复位, 否则子元素抖动
                if (e.currentTarget === e.target) setDragging(false);
              }}
              onDrop={handleDropImage}>
              <input type="file" accept="image/*" onChange={handlePickImage} hidden />
              {imgBusy ? (
                <Translate>处理中…</Translate>
              ) : (
                <>
                  <Translate>选择图片或拖拽到此处</Translate>
                  <span className={styles.imagePickerHint}>
                    <Translate>支持 jpg / png，最多 2 张</Translate>
                  </span>
                </>
              )}
            </label>
          )}
        </div>
      </div>

      {/* 联系方式 */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="feedback-contact">
          <Translate>联系方式</Translate>
          <span className={styles.optional}><Translate>（选填）</Translate></span>
        </label>
        <input
          id="feedback-contact"
          className={styles.input}
          value={contact}
          maxLength={80}
          placeholder={translate({
            message: '邮箱 / QQ / 微信，方便我们回复你',
            description: '联系方式占位文案',
          })}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>

      {status === 'unconfigured' && (
        <p className={styles.error}>
          <Translate>反馈服务尚未配置（缺少 Supabase 连接信息）。</Translate>
        </p>
      )}
      {status === 'error' && (
        <p className={styles.error}>
          <Translate>提交失败，请稍后重试，或提交到交流群反馈。</Translate>
        </p>
      )}

      {!configured ? (
        <button type="button" className={`${styles.submit} ${styles.submitDisabled}`} disabled>
          <Translate>暂不可用</Translate>
        </button>
      ) : (
        <button
          type="submit"
          className={`${styles.submit} ${!title.trim() || status === 'submitting' ? styles.submitDisabled : ''}`}
          disabled={!title.trim() || status === 'submitting'}>
          {status === 'submitting' ? (
            <Translate>提交中…</Translate>
          ) : (
            <Translate>提交反馈</Translate>
          )}
        </button>
      )}
    </form>
  );
}