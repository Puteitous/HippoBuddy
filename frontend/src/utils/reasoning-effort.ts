/**
 * Reasoning Effort 工具函数(阶段 3.7-2 抽取共享)
 *
 * 从 ModelSettingsPage 抽出,供 ModelSettingsPage(设置页)与
 * ModelSelectorPanel(状态栏快速切换)复用同一份档位定义,避免两处重复。
 *
 * 档位表对齐旧版 ModelSettingsPage.js 的 REASONING_EFFORT_ITEMS_BY_PROVIDER。
 * 注意:放在 .ts 而非 .tsx,避免"组件文件同时导出非组件"触发
 * react-refresh/only-export-components 告警(与 utils/ref-chips.ts 同理)。
 */

import { translate } from '@/i18n';

/** 各 Provider 支持的 Reasoning Effort 档位(空串 = 默认,不传参) */
export const REASONING_EFFORT_ITEMS_BY_PROVIDER: Record<
  string,
  { label: string; value: string }[]
> = {
  deepseek: [
    { label: '默认', value: '' },
    { label: 'low', value: 'low' },
    { label: 'high', value: 'high' },
    { label: 'max', value: 'max' },
  ],
  'deepseek-responses': [
    { label: '默认', value: '' },
    { label: 'low', value: 'low' },
    { label: 'high', value: 'high' },
    { label: 'max', value: 'max' },
  ],
  openai: [
    { label: '默认', value: '' },
    { label: 'low', value: 'low' },
    { label: 'medium', value: 'medium' },
    { label: 'high', value: 'high' },
  ],
};

/** 读取指定 Provider 的档位列表(不区分大小写;未知 Provider 返回空数组) */
export function getReasoningItems(provider: string): { label: string; value: string }[] {
  const items =
    REASONING_EFFORT_ITEMS_BY_PROVIDER[(provider || '').trim().toLowerCase()] || [];
  // 「默认」档位(空 value)需国际化,返回翻译后的 label
  return items.map((item) =>
    item.value === '' ? { ...item, label: translate('modelSelector.default') } : item,
  );
}

/** 该 Provider 是否支持 Reasoning Effort(有档位列表即支持) */
export function supportsReasoningEffort(provider: string): boolean {
  return getReasoningItems(provider).length > 0;
}
