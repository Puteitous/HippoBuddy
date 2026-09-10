/**
 * user-content - 用户消息正文的解析与展示辅助(纯函数)。
 *
 * 背景:
 *  输入框里的引用芯片(paste/text)在发送时由 combineChipsToMessage 拍平为纯文本,
 *  其中芯片正文被 wrapInCodeBlock 包裹成「裸 ``` 围栏」段落:
 *
 *      ```
 *      <粘贴的几千字>
 *      ```
 *
 *      分析下这段报错
 *
 *  用户气泡若整段按纯文本渲染,第一眼看到的是两个反引号,且几千字直接铺满气泡。
 *  故在此把裸围栏段落解析出来,交由 UI 渲染成可折叠的附件卡片;
 *  围栏内的原文仍是普通文本,不丢失内容。
 *
 * 判定规则(刻意收窄,降低误判):
 *  - 仅识别「整行只有 ``` 」的行(允许缩进),即 wrapInCodeBlock 产出的形态;
 *  - 带语言标识的围栏(```js 等,用户手写的 Markdown 代码块)不识别,按正文保留。
 *
 * 与 MessageBubble 组件拆分:组件文件只导出组件,纯函数放本文件,便于单测。
 */
import type { ContentPart } from '@/types';

/** 代码围栏标记(与 utils/ref-chips.ts 的 wrapInCodeBlock 保持一致) */
const FENCE = '```';

/** 用户消息正文的一个段落 */
export type UserContentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'attachment'; content: string };

/** 是否为「裸 ``` 围栏」行(允许缩进;带语言标识的 ```js 不算) */
function isBareFence(line: string): boolean {
  return line.trim() === FENCE;
}

/**
 * 把用户消息文本解析为「正文段落 + 附件段落」序列。
 *
 * - 成对的裸 ``` 围栏包裹的部分 → attachment(内容为围栏内原文)
 * - 其余部分 → text(保持原样,含内部换行)
 * - 落单的裸围栏(如用户手写 ```js 代码块的收尾围栏)→ 按 text 保留,不吞内容
 * - 纯空白段落不产出(避免空气泡)
 *
 * 已知局限:若同一条消息里既有用户手写的 ```js 代码块、又有芯片附件,
 * 前者的收尾围栏可能与后者的起始围栏配成一对,导致分段错位。
 * 此时内容不会丢失,仅呈现形态不理想;用户气泡为纯文本语义,可接受。
 */
export function parseUserContent(raw: string): UserContentSegment[] {
  if (!raw) return [];

  const lines = raw.split('\n');

  // 裸围栏行号(升序)。最后一个永远无法作为「开始」——它后面没有可配对的围栏,
  // 据此把用户的收尾围栏排除在附件识别之外。
  const fenceLineNos: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isBareFence(lines[i])) fenceLineNos.push(i);
  }
  const lastFenceNo = fenceLineNos.length > 0 ? fenceLineNos[fenceLineNos.length - 1] : -1;

  const segments: UserContentSegment[] = [];
  let textBuffer: string[] = [];
  let attachBuffer: string[] | null = null;

  const flushText = () => {
    if (textBuffer.length === 0) return;
    // trim 掉段落首尾空白:消息由「对话文本 + 芯片」拼装而来,首尾换行/空格都是拼接产物
    // (combineChipsToMessage 也已对键入文本做过 trim),保留会导致气泡顶部出现空行
    const text = textBuffer.join('\n').trim();
    if (text) segments.push({ kind: 'text', text });
    textBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isBareFence(line)) {
      if (attachBuffer === null) {
        // 仅当其后仍有裸围栏(即能配对)时才视为附件开始
        if (i < lastFenceNo) {
          flushText();
          attachBuffer = [];
          continue;
        }
      } else {
        // 配对成功 → 附件段落
        segments.push({ kind: 'attachment', content: attachBuffer.join('\n') });
        attachBuffer = null;
        continue;
      }
    }

    (attachBuffer ?? textBuffer).push(line);
  }

  // 理论上不会发生(收尾围栏必被配对):兜底按文本处理,确保内容不丢
  if (attachBuffer !== null) {
    textBuffer = [FENCE, ...attachBuffer];
  }
  flushText();

  return segments;
}

/** 把段落序列还原为纯文本(附件内容原样取回,不含人工围栏) */
export function userContentSegmentsToPlainText(segments: UserContentSegment[]): string {
  return segments
    .map((seg) => (seg.kind === 'attachment' ? seg.content : seg.text))
    .join('\n\n');
}

/**
 * 取用户消息用于「复制」的文本:去掉人工添加的围栏,还原用户实际表达的内容。
 * 多模态(含图片)时仅拼接文本 part,与原有 extractText 行为一致。
 */
export function userContentToCopyText(content: string | ContentPart[]): string {
  if (typeof content !== 'string') {
    return content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text ?? '')
      .join('\n');
  }
  return userContentSegmentsToPlainText(parseUserContent(content));
}
