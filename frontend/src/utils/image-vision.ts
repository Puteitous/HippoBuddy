/**
 * 图片视觉能力检测 + File → dataUrl 转换的纯函数工具。
 *
 * 与 ImageUpload.tsx 组件分开存放:
 *  - 共享检测逻辑,后续 ContextSelector / Settings 等也可复用
 *  - 避免 .tsx 同时导出非组件触发 react-refresh/only-export-components 告警
 *
 * 与旧版 ImageUpload.js 的对齐:
 *  - 视觉 provider / model 关键字列表保持一致
 *  - 文件大小上限 20MB 保持一致
 *  - dataUrl 转换:优先 createImageBitmap → canvas,失败降级到 Image + canvas
 *    (绕过被 pptx-preview.js 覆盖的 FileReader)
 */

import { translate } from '@/i18n';

/** 文件大小上限:20MB(与旧版一致) */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** 支持视觉能力的 provider 名(小写) */
const VISION_PROVIDERS = ['openai', 'anthropic', 'google', 'gemini'];

/** 支持视觉能力的 model 关键字(小写,包含即视为支持) */
const VISION_MODEL_KEYWORDS = [
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4-vision',
  'gpt-5',
  'o1',
  'o3',
  'o4',
  'claude-3',
  'claude-4',
  'claude-sonnet-4',
  'claude-opus-4',
  'claude-opus-5',
  'llava',
  'bakllava',
  'qwen',
  'vl',
  'vision',
  'cogvlm',
  'glm-4v',
  'glm-5v',
  'glm-ocr',
  'internvl',
  'minicpm',
  'kimi',
];

/** localStorage 中模型配置的 key(与旧版 app-state.js 对齐) */
const MODEL_CONFIG_STORAGE_KEY = 'hippo_model_config';

interface StoredModelConfig {
  provider?: string;
  model?: string;
}

/**
 * 判断指定 provider/model 是否支持视觉(图片上传)。
 *
 * 纯函数,供各种来源的当前模型复用(store 状态 / 后端接口 / localStorage 迁移)。
 */
export function isVisionProviderModel(provider?: string, model?: string): boolean {
  const p = (provider ?? '').toLowerCase();
  const m = (model ?? '').toLowerCase();
  if (VISION_PROVIDERS.includes(p)) return true;
  return VISION_MODEL_KEYWORDS.some((kw) => m.includes(kw));
}

/**
 * 检测当前模型是否支持视觉(图片上传)。
 *
 * 数据来源:localStorage `hippo_model_config`(旧版 SettingsPanel 写入的遗留 key)。
 * 数据缺失或解析失败时返回 false,UI 自动隐藏上传按钮。
 * 注意:新版前端不再写该 key;实时模型已改用 llm:changed 事件 + /api/config/llm,
 *       此函数保留仅为兼容旧版 localStorage 读取。
 */
export function isVisionSupported(): boolean {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as StoredModelConfig;
    return isVisionProviderModel(data.provider, data.model);
  } catch {
    return false;
  }
}

/** 生成简单的本地唯一 id(时间戳 + 随机数) */
export function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 将图片 File/Blob 转换为 base64 data URL。
 *
 * 优先使用 createImageBitmap + canvas(绕过被覆盖的 FileReader),
 * 失败时降级到 Image + canvas。
 *
 * @param file 图片文件
 * @returns data URL(用于 <img> 显示与提交给后端 ChatRequest.images)
 * @throws 当文件非图片或读取失败时抛错
 */
export async function fileToDataUrl(file: Blob): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      // 保留原始图片格式(JPEG 等照片转 PNG 会体积膨胀数倍),
      // 浏览器不支持该格式时 canvas 会自动降级为 image/png
      return canvas.toDataURL(file.type || 'image/png');
    } catch {
      // 降级到 Image 路径
    }
  }
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(file.type || 'image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(translate('chat.imageLoadFailed')));
    };
    img.src = url;
  });
}
