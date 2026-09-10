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
 *  - text/paste chip:整段用 ``` 代码块包裹(优先 selectedText,paste 芯片的正文即存于此)
 *  - 多个 chip 用 \n 连接;chip 段与 typed 文本之间用 \n\n 分隔
 */
import type { RefChip } from '@/types';
import { parseUserContent } from './user-content';
import { createPastedTextChip } from './paste-attachment';

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
  // 纯文本 chip / 超长粘贴 chip:整体包裹为代码块
  // (paste 芯片的正文在 selectedText,text 只是展示标签;text 芯片沿用原行为)
  if (chip.kind === 'text' || chip.kind === 'paste') {
    return wrapInCodeBlock(chip.selectedText ?? chip.text);
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

/**
 * message → 输入框草稿的逆转换(与 combineChipsToMessage 互逆)。
 *
 * 场景:回滚(rewind)成功后把该轮用户消息回填输入框。后端存的是已拍平的消息字符串
 * (芯片正文被包裹为裸 ``` 围栏)。若原样塞回输入框,刚做的「长文本折叠为芯片」会被
 * 原地撤销——输入框又变回长文本墙,且夹杂字面反引号。
 * 故此处把围栏段落还原为芯片,使回填后的输入框与发送前的形态一致。
 *
 * 无损性:围栏内容 → paste 芯片 → 再次 combineChipsToMessage 可还原原字符串。
 *
 * 两点已知取舍(均不丢内容):
 *  - 短文本/选区芯片在消息里同为围栏形态,回填后统一为 paste 芯片
 *    (展示标签按字数生成,种类信息不再区分);
 *  - 草稿格式 { text, chips } 不记录两者的穿插顺序,而 combineChipsToMessage
 *    固定「芯片在前、文本在后」,故「文本在前」的消息回填后顺序会规整为芯片在前。
 */
export function messageToDraft(content: string): { text: string; chips: RefChip[] } {
  const chips: RefChip[] = [];
  const textParts: string[] = [];
  for (const seg of parseUserContent(content)) {
    if (seg.kind === 'attachment') {
      chips.push(createPastedTextChip(seg.content));
    } else {
      textParts.push(seg.text);
    }
  }
  return { text: textParts.join('\n\n'), chips };
}
