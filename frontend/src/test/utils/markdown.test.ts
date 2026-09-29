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

  it('代码块内含 $ 序列不会被当作替换指令破坏', () => {
    const html = renderMarkdown("## 标题\n\n```python\nimport re\nx = re.compile(r'^\\s*$')\n```\n\n**运行结果：**\n\n### 下一章\n");
    expect(html).toContain('<h3>下一章</h3>');
    // hljs 可能用 <span> 切分代码,但 $' 字样原样保留,不应被吞掉
    expect(html).toContain("r'^\\s*$'");
    // 不会被误注入成重复的 markdown 文本
    expect(html).not.toContain('CODE_');
  });

  it('换行衔接的 markdown 结构不被破坏(围栏块后内容正常渲染)', () => {
    const html = renderMarkdown('```text\n$$ 100\n```\n\n**说明**：余额 $$ 500。\n\n### 尾部\n');
    // $$ 在代码块内原样保留,且后续标题正常渲染
    expect(html).toContain('<h3>尾部</h3>');
    expect(html).toContain('<strong>说明</strong>');
  });
});