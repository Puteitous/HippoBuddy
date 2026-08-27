import { describe, it, expect } from 'vitest';
import { combineChipsToMessage } from '@/utils/ref-chips';
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
});