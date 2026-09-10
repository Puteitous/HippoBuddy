import { describe, it, expect } from 'vitest';
import {
  parseUserContent,
  userContentSegmentsToPlainText,
  userContentToCopyText,
} from '@/utils/user-content';
import type { ContentPart } from '@/types';

/** 模拟 combineChipsToMessage 的产出形态(裸 ``` 围栏包裹芯片正文) */
function fenced(content: string): string {
  return `\`\`\`\n${content}\n\`\`\``;
}

describe('parseUserContent', () => {
  it('空串返回空数组', () => {
    expect(parseUserContent('')).toEqual([]);
  });

  it('纯空白不产出段落(避免空气泡)', () => {
    expect(parseUserContent('   \n\n  ')).toEqual([]);
  });

  it('无围栏时整体作为文本段落', () => {
    expect(parseUserContent('你好')).toEqual([{ kind: 'text', text: '你好' }]);
  });

  it('保留普通文本的内部换行', () => {
    expect(parseUserContent('第一行\n第二行')).toEqual([
      { kind: 'text', text: '第一行\n第二行' },
    ]);
  });

  it('围栏段落解析为 attachment,内容为围栏内原文', () => {
    const raw = `${fenced('log-1\nlog-2')}\n\n分析下这段报错`;
    expect(parseUserContent(raw)).toEqual([
      { kind: 'attachment', content: 'log-1\nlog-2' },
      { kind: 'text', text: '分析下这段报错' },
    ]);
  });

  it('先文本后围栏时保持原顺序', () => {
    const raw = `看下这个\n\n${fenced('body')}`;
    expect(parseUserContent(raw)).toEqual([
      { kind: 'text', text: '看下这个' },
      { kind: 'attachment', content: 'body' },
    ]);
  });

  it('支持多个围栏段落', () => {
    const raw = `${fenced('a')}\n\n${fenced('b')}`;
    expect(parseUserContent(raw)).toEqual([
      { kind: 'attachment', content: 'a' },
      { kind: 'attachment', content: 'b' },
    ]);
  });

  it('带语言标识的围栏(用户手写 Markdown 代码块)不识别,按正文保留', () => {
    const raw = '```js\nconst a = 1;\n```';
    expect(parseUserContent(raw)).toEqual([{ kind: 'text', text: raw }]);
  });

  it('落单的裸围栏不作为附件开始(必须成对)', () => {
    // 仅有一个裸围栏:无法配对,整体按正文保留
    expect(parseUserContent('```\nonly')).toEqual([{ kind: 'text', text: '```\nonly' }]);
  });

  it('围栏未闭合时整体回落为文本,内容不丢失', () => {
    const raw = '```\n未闭合的内容';
    const segs = parseUserContent(raw);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('text');
    expect(userContentSegmentsToPlainText(segs)).toBe(raw);
  });

  it('围栏内容为空时仍产出 attachment 段落', () => {
    expect(parseUserContent('```\n\n```')).toEqual([{ kind: 'attachment', content: '' }]);
  });

  it('首尾围栏之间的空白行不计入内容', () => {
    // wrapInCodeBlock 形态:```\n内容\n```
    expect(parseUserContent(fenced('single'))).toEqual([
      { kind: 'attachment', content: 'single' },
    ]);
  });
});

describe('userContentSegmentsToPlainText', () => {
  it('附件内容原样取回,不保留人工围栏', () => {
    const segs = parseUserContent(`${fenced('body')}\n\n分析`);
    expect(userContentSegmentsToPlainText(segs)).toBe('body\n\n分析');
  });

  it('单段落时与原文一致', () => {
    const segs = parseUserContent('你好世界');
    expect(userContentSegmentsToPlainText(segs)).toBe('你好世界');
  });
});

describe('userContentToCopyText', () => {
  it('字符串:去掉围栏后返回用户实际内容', () => {
    expect(userContentToCopyText(`${fenced('body')}\n\n分析`)).toBe('body\n\n分析');
  });

  it('无围栏的纯文本原样返回', () => {
    expect(userContentToCopyText('普通消息')).toBe('普通消息');
  });

  it('多模态:仅拼接文本 part(与既有 extractText 行为一致)', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
    ];
    expect(userContentToCopyText(parts)).toBe('看图');
  });

  it('多模态无文本 part 时返回空串', () => {
    const parts: ContentPart[] = [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
    ];
    expect(userContentToCopyText(parts)).toBe('');
  });
});
