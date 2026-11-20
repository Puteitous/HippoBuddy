/**
 * useVisionSupport - 当前模型是否支持视觉(图片上传)。
 *
 * 用于 ChatPanel 的图片入口校验(粘贴/拖入/附件按钮选择的图片),
 * 订阅 /api/config/llm 与 llm:changed 即时刷新。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { on } from '@/utils/eventBus';
import { isVisionProviderModel } from '@/utils/image-vision';

/** 后端权威 supportsVision 未返回时回退到前端关键字启发式 */
function resolveVision(payload: { provider?: string; model?: string; supportsVision?: boolean }): boolean {
  if (typeof payload.supportsVision === 'boolean') return payload.supportsVision;
  return isVisionProviderModel(payload.provider, payload.model);
}

export function useVisionSupport(): boolean {
  const [visionSupported, setVisionSupported] = useState(false);

  useEffect(() => {
    let disposed = false;
    // 拉取配置并更新：后端 supportsVision 为权威结果(尊重用户在设置中的覆盖),
    // 缺失时回退到前端关键字启发式
    const refresh = () =>
      configApi
        .getLlm()
        .then((llm) => {
          if (!disposed) setVisionSupported(resolveVision(llm));
        })
        .catch(() => {
          // 拉取失败保持隐藏(不可用即不当作用户上传入口)
        });

    refresh();
    // 订阅模型切换,即时刷新(事件 payload 不带权威结果,统一重新拉取保证尊重覆盖值)
    const offLlmChanged = on('llm:changed', () => {
      refresh();
    });
    return () => {
      disposed = true;
      offLlmChanged();
    };
  }, []);

  return visionSupported;
}
