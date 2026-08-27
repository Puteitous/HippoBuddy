import { describe, it, expect } from 'vitest';
import {
  detectHljsLanguage,
  splitHighlightedLines,
  highlightDiffLines,
} from '@/utils/diff-highlight';

describe('detectHljsLanguage', () => {
  it('按扩展名映射到 hljs 语言', () => {
    expect(detectHljsLanguage('a.ts')).toBe('typescript');
    expect(detectHljsLanguage('a.jsx')).toBe('javascript');
    expect(detectHljsLanguage('a.go')).toBe('go');
    expect(detectHljsLanguage('a.md')).toBe('markdown');
    expect(detectHljsLanguage('a.html')).toBe('xml');
  });

  it('扩展名不区分大小写', () => {
    expect(detectHljsLanguage('a.TS')).toBe('typescript');
    expect(detectHljsLanguage('a.PY')).toBe('python');
  });

  it('同扩展名别名归一', () => {
    expect(detectHljsLanguage('a.h')).toBe('c');
    expect(detectHljsLanguage('a.hpp')).toBe('cpp');
    expect(detectHljsLanguage('a.yml')).toBe('yaml');
    expect(detectHljsLanguage('a.zsh')).toBe('bash');
  });

  it('未知扩展名或无扩展名返回 null', () => {
    expect(detectHljsLanguage('a.unknownext')).toBeNull();
    expect(detectHljsLanguage('a')).toBeNull();
    expect(detectHljsLanguage('')).toBeNull();
  });

  it('basename 用最后一个路径段，兼容 Windows 分隔符', () => {
    expect(detectHljsLanguage('/a/b/c.py')).toBe('python');
    expect(detectHljsLanguage('X:\\dir\\file.go')).toBe('go');
  });

  it('点开头的隐藏文件按文件名整体推断', () => {
    expect(detectHljsLanguage('.gitignore')).toBeNull();
  });
});

describe('splitHighlightedLines', () => {
  it('无跨行 token 时逐行切分并闭合', () => {
    const html = '<span class="hljs-keyword">const</span> x = 1';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="hljs-keyword">const</span> x = 1',
    ]);
  });

  it('跨行 token 在行尾补闭合、行首重开 span', () => {
    const html = '<span class="hljs-comment">/* a\nb */</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="hljs-comment">/* a</span>',
      '<span class="hljs-comment">b */</span>',
    ]);
  });

  it('多层嵌套跨行时保持标签平衡', () => {
    const html = '<span class="hljs-string"><span class="hljs-x">a\nb</span></span>';
    // 行 0:外层+内层均未闭合 → 补两个 </span>
    // 行 1:重开外层+内层 span，随后闭合到 '</span>' 前
    const lines = splitHighlightedLines(html);
    expect(lines).toHaveLength(2);
    // 每行 <span> 与 </span> 数量均衡
    for (const line of lines) {
      const opens = (line.match(/<span/g) || []).length;
      const closes = (line.match(/<\/span>/g) || []).length;
      expect(opens).toBe(closes);
    }
    expect(lines[0]).toBe('<span class="hljs-string"><span class="hljs-x">a</span></span>');
    expect(lines[1]).toBe(
      '<span class="hljs-string"><span class="hljs-x">b</span></span>',
    );
  });

  it('空字符串返回一个空行', () => {
    expect(splitHighlightedLines('')).toEqual(['']);
  });
});

describe('highlightDiffLines', () => {
  it('空输入返回 null', () => {
    expect(highlightDiffLines([], 'a.ts')).toBeNull();
    expect(highlightDiffLines(null as never, 'a.ts')).toBeNull();
  });

  it('超长文本（大文件保护）返回 null', () => {
    const longContent = 'x'.repeat(600 * 1024);
    const changes = [{ type: 'added' as const, content: longContent }];
    expect(highlightDiffLines(changes, 'a.ts')).toBeNull();
  });

  it('返回行数与 changes 等长', () => {
    const changes = [
      { type: 'added' as const, content: 'const a = 1' },
      { type: 'same' as const, content: 'console.log(a)' },
    ];
    const lines = highlightDiffLines(changes, 'a.ts');
    expect(lines).not.toBeNull();
    expect(lines!.length).toBe(2);
  });
});