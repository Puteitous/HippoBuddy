import { describe, it, expect } from 'vitest';
import {
  PASTE_CHIP_CHAR_THRESHOLD,
  PASTE_CHIP_LINE_THRESHOLD,
  PASTE_CHIP_PREVIEW_CHARS,
  buildPastedLabel,
  buildPastedPreview,
  countLines,
  createPastedTextChip,
  formatCharCount,
  shouldConvertPasteToChip,
} from '@/utils/paste-attachment';

describe('shouldConvertPasteToChip', () => {
  it('空串 / 纯空白不转芯片(避免产生空芯片)', () => {
    expect(shouldConvertPasteToChip('')).toBe(false);
    expect(shouldConvertPasteToChip('   \n  \t ')).toBe(false);
  });

  it('短文本不转芯片', () => {
    expect(shouldConvertPasteToChip('帮我看下这段代码')).toBe(false);
    expect(shouldConvertPasteToChip('x'.repeat(PASTE_CHIP_CHAR_THRESHOLD - 1))).toBe(false);
  });

  it('字符数达到阈值即转芯片(边界含等号)', () => {
    expect(shouldConvertPasteToChip('x'.repeat(PASTE_CHIP_CHAR_THRESHOLD))).toBe(true);
    expect(shouldConvertPasteToChip('x'.repeat(PASTE_CHIP_CHAR_THRESHOLD + 1))).toBe(true);
  });

  it('字符数不足但行数达到阈值也转芯片', () => {
    const manyLines = Array.from({ length: PASTE_CHIP_LINE_THRESHOLD }, () => 'ab').join('\n');
    expect(manyLines.length).toBeLessThan(PASTE_CHIP_CHAR_THRESHOLD);
    expect(shouldConvertPasteToChip(manyLines)).toBe(true);
  });

  it('行数未达阈值且字符数不足时不转', () => {
    const fewLines = Array.from({ length: PASTE_CHIP_LINE_THRESHOLD - 1 }, () => 'ab').join('\n');
    expect(shouldConvertPasteToChip(fewLines)).toBe(false);
  });
});

describe('countLines', () => {
  it('空串记 0 行', () => {
    expect(countLines('')).toBe(0);
  });

  it('单行记 1 行,多行按 \\n 计数', () => {
    expect(countLines('abc')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
  });
});

describe('formatCharCount', () => {
  it('按千分位分组', () => {
    expect(formatCharCount(0)).toBe('0');
    expect(formatCharCount(999)).toBe('999');
    expect(formatCharCount(1000)).toBe('1,000');
    expect(formatCharCount(5120)).toBe('5,120');
    expect(formatCharCount(1234567)).toBe('1,234,567');
  });
});

describe('buildPastedLabel', () => {
  it('使用千分位字数生成展示标签', () => {
    const label = buildPastedLabel(5120);
    expect(label).toContain('5,120');
  });
});

describe('buildPastedPreview', () => {
  it('短内容原样返回', () => {
    expect(buildPastedPreview('hello')).toBe('hello');
  });

  it('超长内容截断并追加省略号', () => {
    const long = 'x'.repeat(PASTE_CHIP_PREVIEW_CHARS + 100);
    const preview = buildPastedPreview(long);
    expect(preview).toHaveLength(PASTE_CHIP_PREVIEW_CHARS + 1);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('createPastedTextChip', () => {
  it('生成 paste 芯片:text 为展示标签,selectedText 保存完整原文', () => {
    const content = 'x'.repeat(3000);
    const chip = createPastedTextChip(content, 'fixed-id');

    expect(chip.id).toBe('fixed-id');
    expect(chip.kind).toBe('paste');
    expect(chip.text).toContain('3,000');
    expect(chip.text).not.toBe(content);
    expect(chip.selectedText).toBe(content);
  });

  it('不传 id 时自动生成唯一 id', () => {
    const a = createPastedTextChip('aa');
    const b = createPastedTextChip('bb');
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('paste-')).toBe(true);
  });
});
