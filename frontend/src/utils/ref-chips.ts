/**
 * 引用芯片(RefChip)的纯函数工具。
 *
 * 与 RefChips.tsx 组件分开存放:
 *  - 共享同一份合并逻辑(组件只展示,提交时由 ChatPanel 调用本函数)
 *  - 避免 .tsx 文件同时导出非组件触发 react-refresh/only-export-components 告警
 *
 * 合并规则(对齐旧版 RefChips.getCombinedInput):
 *  - file/rule chip:`@${filePath}` 或 `@${filePath}:${startLine}-${endLine}`
 *    带选中文字时,追加 ``` 代码块包裹的 selectedText
 *  - text chip:整段用 ``` 代码块包裹
 *  - 多个 chip 用 \n 连接;chip 段与 typed 文本之间用 \n\n 分隔
 */
import type { RefChip } from '@/types';

/**
 * 把 chips 列表与用户键入文本合并为最终发送给后端的消息体。
 *
 * @param chips 引用芯片列表
 * @param typed 用户在输入框中键入的纯文本(已 trim)
 * @returns 合并后的消息字符串;无内容时返回空串
 */
export function combineChipsToMessage(chips: RefChip[], typed: string): string {
  const refTexts = chips.map((c) => chipToMessageText(c)).filter(Boolean);
  const cleanTyped = typed.trim();
  if (refTexts.length === 0) return cleanTyped;
  const refBlock = refTexts.join('\n');
  return cleanTyped ? `${refBlock}\n\n${cleanTyped}` : refBlock;
}

/** 单个 chip → 消息文本段 */
function chipToMessageText(chip: RefChip): string {
  // 纯文本 chip:整体包裹为代码块
  if (chip.kind === 'text') {
    return wrapInCodeBlock(chip.text);
  }

  // file / rule chip:以 @path[:line-line] 形式发出,可选追加 selectedText 代码块
  const filePath = chip.filePath ?? chip.text;
  if (!filePath) return '';

  const hasLines = chip.startLine != null && chip.endLine != null;
  const ref = hasLines
    ? `@${filePath}:${chip.startLine}-${chip.endLine}`
    : `@${filePath}`;

  if (chip.selectedText) {
    return `${ref}\n${wrapInCodeBlock(chip.selectedText)}`;
  }
  return ref;
}

/** 用 ``` 代码块包裹文本(若已包含 ``` 则直接返回,避免嵌套) */
function wrapInCodeBlock(text: string): string {
  if (text.includes('```')) return text;
  return `\`\`\`\n${text}\n\`\`\``;
}
