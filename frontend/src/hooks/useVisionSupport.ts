/**
 * useVisionSupport - 当前模型是否支持视觉(图片上传)。
 *
 * 共享给 ImageUpload(控制上传按钮可见性)与 ChatPanel(粘贴图片时校验),
 * 避免两处重复订阅 /api/config/llm 与 llm:changed。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { on, type LlmChangedPayload } from '@/utils/eventBus';
import { isVisionProviderModel } from '@/utils/image-vision';

export function useVisionSupport(): boolean {
  const [visionSupported, setVisionSupported] = useState(false);

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

  return visionSupported;
}
