import { describe, it, expect, vi } from 'vitest';
import { renderMarkdown } from '@/utils/markdown';

// translate 直接返回 key,便于断言按钮文案出现
vi.mock('@/i18n', () => ({
  translate: (k: string) => k,
}));

describe('renderMarkdown', () => {
  it('空输入返回空字符串', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('纯文本渲染为段落', () => {
    const html = renderMarkdown('hello world');
    expect(html).toContain('hello world');
  });

  it('外部链接添加 target=_blank / rel / data-external', () => {
    const html = renderMarkdown('[host](https://example.com/path)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('data-external="true"');
    expect(html).toContain('href="https://example.com/path"');
  });

  it('内部链接(/ 或 #)不添加 target 与新标签属性', () => {
    const rel = renderMarkdown('[b](/api/file/raw)');
    expect(rel).not.toContain('target="_blank"');
    expect(rel).toContain('href="/api/file/raw"');
    const anchor = renderMarkdown('[c](#part)');
    expect(anchor).not.toContain('target="_blank"');
  });

  it('HTML 注入被 DOMPurify 净化(移除 script)', () => {
    const html = renderMarkdown('<script>alert(1)</script>hello');
    expect(html).not.toContain('<script');
    expect(html).toContain('hello');
  });

  it('代码块渲染为带语言标签、复制按钮与行号的 wrapper', () => {
    const html = renderMarkdown('```js\nconst a = 1;\n```');
    expect(html).toContain('code-block');
    expect(html).toContain('code-lang');
    expect(html).toContain('language-js');
    expect(html).toContain('code-copy-btn');
    // 复制按钮文案来自 translate('chatui.copy') → 直接是 key
    expect(html).toContain('chatui.copy');
    // 行号列含 1
    expect(html).toContain('code-ln-nums');
  });

  it('mermaid 代码块附带预览按钮', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```');
    expect(html).toContain('mermaid-preview-btn');
    expect(html).toContain('mermaid.preview');
  });
});