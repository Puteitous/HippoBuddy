import { describe, it, expect } from 'vitest';
import { combineChipsToMessage, messageToDraft } from '@/utils/ref-chips';
import type { RefChip } from '@/types';

function chip(partial: Partial<RefChip> & { kind: RefChip['kind']; text: string }): RefChip {
  return { id: partial.id ?? `c${Math.random()}`, ...partial };
}

describe('combineChipsToMessage', () => {
  it('无 chips 时返回 trim 后的键入文本', () => {
    expect(combineChipsToMessage([], '  hello  ')).toBe('hello');
  });

  it('仅 text chip 时整体包裹为代码块', () => {
    const chips = [chip({ kind: 'text', text: 'foo bar' })];
    expect(combineChipsToMessage(chips, '')).toBe('```\nfoo bar\n```');
  });

  it('file chip 生成 @path', () => {
    const chips = [chip({ kind: 'file', text: 'a.ts', filePath: 'src/a.ts' })];
    expect(combineChipsToMessage(chips, '')).toBe('@src/a.ts');
  });

  it('file chip 带选区行号生成 @path:start-end', () => {
    const chips = [chip({ kind: 'file', text: 'a.ts', filePath: 'src/a.ts', startLine: 3, endLine: 8 })];
    expect(combineChipsToMessage(chips, '')).toBe('@src/a.ts:3-8');
  });

  it('file chip 带选中文字时追加代码块', () => {
    const chips = [chip({ kind: 'file', text: 'a.ts', filePath: 'a.ts', selectedText: 'const x = 1' })];
    expect(combineChipsToMessage(chips, '')).toBe('@a.ts\n```\nconst x = 1\n```');
  });

  it('多个 chip 用换行连接,与键入文本之间用空行分隔', () => {
    const chips = [
      chip({ kind: 'file', text: 'a.ts', filePath: 'a.ts' }),
      chip({ kind: 'text', text: 'note' }),
    ];
    expect(combineChipsToMessage(chips, 'please review')).toBe('@a.ts\n```\nnote\n```\n\nplease review');
  });

  it('已含 ``` 的文本不再嵌套代码块', () => {
    const chips = [chip({ kind: 'text', text: '```js\ncode\n```' })];
    expect(combineChipsToMessage(chips, '')).toBe('```js\ncode\n```');
  });

  it('paste chip 用 selectedText 全文包裹代码块(text 只是展示标签)', () => {
    const content = Array.from({ length: 50 }, (_, i) => `line-${i}`).join('\n');
    const chips = [chip({ kind: 'paste', text: '粘贴文本 · 2,000 字', selectedText: content })];
    expect(combineChipsToMessage(chips, '')).toBe(`\`\`\`\n${content}\n\`\`\``);
  });

  it('paste chip 缺 selectedText 时回落用 text(不丢内容)', () => {
    const chips = [chip({ kind: 'paste', text: 'fallback' })];
    expect(combineChipsToMessage(chips, '')).toBe('```\nfallback\n```');
  });

  it('paste chip 与键入文本共存时以空行分隔', () => {
    const chips = [chip({ kind: 'paste', text: '粘贴文本 · 2,000 字', selectedText: 'log body' })];
    expect(combineChipsToMessage(chips, '分析下')).toBe('```\nlog body\n```\n\n分析下');
  });
});

describe('messageToDraft', () => {
  it('无围栏的纯文本 → text 保留、无芯片', () => {
    expect(messageToDraft('普通消息')).toEqual({ text: '普通消息', chips: [] });
  });

  it('空串 → 空草稿', () => {
    expect(messageToDraft('')).toEqual({ text: '', chips: [] });
  });

  it('围栏段落还原为 paste 芯片,内容为围栏内原文', () => {
    const draft = messageToDraft('```\nlog body\n```\n\n分析下这段报错');

    expect(draft.text).toBe('分析下这段报错');
    expect(draft.chips).toHaveLength(1);
    expect(draft.chips[0].kind).toBe('paste');
    expect(draft.chips[0].selectedText).toBe('log body');
  });

  it('多个围栏段落还原为多个芯片', () => {
    const draft = messageToDraft('```\nfirst\n```\n```\nsecond\n```');

    expect(draft.chips).toHaveLength(2);
    expect(draft.chips.map((c) => c.selectedText)).toEqual(['first', 'second']);
    expect(draft.text).toBe('');
  });

  it('保留围栏内容的换行', () => {
    const draft = messageToDraft('```\nline-1\nline-2\n```');
    expect(draft.chips[0].selectedText).toBe('line-1\nline-2');
  });

  it('芯片 id 唯一(多次还原不冲突)', () => {
    const a = messageToDraft('```\nbody\n```');
    const b = messageToDraft('```\nbody\n```');
    expect(a.chips[0].id).not.toBe(b.chips[0].id);
  });

  it('往返无损:草稿 → 消息 → 草稿 → 消息 得到同一字符串', () => {
    const original = combineChipsToMessage(
      [chip({ kind: 'paste', text: '粘贴文本 · 2,000 字', selectedText: 'log-1\nlog-2' })],
      '分析下这段报错',
    );

    const draft = messageToDraft(original);
    const again = combineChipsToMessage(draft.chips, draft.text);

    expect(again).toBe(original);
  });

  it('往返无损:多个芯片', () => {
    const original = combineChipsToMessage(
      [
        chip({ kind: 'paste', text: 'a', selectedText: 'first' }),
        chip({ kind: 'paste', text: 'b', selectedText: 'second' }),
      ],
      '看下这两个',
    );

    const draft = messageToDraft(original);
    expect(combineChipsToMessage(draft.chips, draft.text)).toBe(original);
  });

  it('文本在围栏之前时内容不丢,顺序规整为芯片在前', () => {
    const draft = messageToDraft('看下这个\n\n```\nbody\n```');

    // 两段内容都在
    expect(draft.text).toBe('看下这个');
    expect(draft.chips[0].selectedText).toBe('body');
    // 重组后芯片在前(草稿格式不记录穿插顺序,与既有草稿模型一致)
    expect(combineChipsToMessage(draft.chips, draft.text)).toBe('```\nbody\n```\n\n看下这个');
  });
});