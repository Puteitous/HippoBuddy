/**
 * 超长粘贴文本 → 引用芯片(paste chip)的纯函数工具。
 *
 * 背景:
 *  - 输入框(contentEditable)直接承载几千字会撑高高度、拖慢输入与光标定位,
 *    且长文本混在正文里无法单独删除、token 计数也不准。
 *  - 故超过阈值时不再原样插入,而是折叠为一个芯片,内容整体随 selectedText 流转,
 *    发送时再展开为完整文本(ref-chips.ts 的 chipToMessageText)。
 *
 * 与 RefChip 的约定:
 *  - kind = 'paste'
 *  - text = 展示标签(如「粘贴文本 · 5,120 字」),不参与消息组装
 *  - selectedText = 完整原文(发送时使用)
 *
 * 纯函数,不依赖 DOM;便于单测与复用。
 */
import type { RefChip } from '@/types';
import { translate } from '@/i18n';

/** 转芯片的字符数阈值(达到即转) */
export const PASTE_CHIP_CHAR_THRESHOLD = 2000;
/** 转芯片的行数阈值(达到即转) */
export const PASTE_CHIP_LINE_THRESHOLD = 30;
/** 芯片 title 预览保留的最大字符数 */
export const PASTE_CHIP_PREVIEW_CHARS = 500;

/** 统计行数(空串记 0 行) */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

/**
 * 判断粘贴文本是否应折叠为芯片。
 * 空文本/纯空白不转(交由原有粘贴逻辑处理,避免产生空芯片)。
 */
export function shouldConvertPasteToChip(text: string): boolean {
  if (!text.trim()) return false;
  return text.length >= PASTE_CHIP_CHAR_THRESHOLD || countLines(text) >= PASTE_CHIP_LINE_THRESHOLD;
}

/** 千分位格式化(纯字符串实现,避免依赖 ICU) */
export function formatCharCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 生成芯片展示标签(如「粘贴文本 · 5,120 字」) */
export function buildPastedLabel(charCount: number): string {
  return translate('chat.pastedTextChipLabel', { count: formatCharCount(charCount) });
}

/** 截断出用于 title 预览的文本 */
export function buildPastedPreview(content: string): string {
  return content.length > PASTE_CHIP_PREVIEW_CHARS
    ? `${content.slice(0, PASTE_CHIP_PREVIEW_CHARS)}…`
    : content;
}

/**
 * 由粘贴文本构造 paste 芯片。
 *
 * @param content 粘贴的完整原文
 * @param id 可选自定义 id(不传则本地生成);便于测试注入稳定 id
 */
export function createPastedTextChip(content: string, id?: string): RefChip {
  return {
    id: id ?? `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'paste',
    text: buildPastedLabel(content.length),
    selectedText: content,
  };
}
