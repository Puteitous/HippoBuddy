import { describe, it, expect, afterEach, vi } from 'vitest';
import { initMermaidPreview } from '@/utils/mermaid';

vi.mock('@/i18n', () => ({
  translate: (k: string) => k,
}));
vi.mock('@/utils/toastStore', () => ({
  showToast: vi.fn(),
}));

function buildCodeBlock(code: string): { wrapper: HTMLElement; btn: HTMLButtonElement } {
  document.body.innerHTML = `
    <div class="code-block">
      <div class="code-block-body"><pre><code>${code}</code></pre></div>
    </div>
  `;
  const wrapper = document.body.querySelector('.code-block') as HTMLElement;
  const btn = document.createElement('button');
  btn.className = 'mermaid-preview-btn';
  btn.textContent = 'mermaid.preview';
  wrapper.appendChild(btn);
  return { wrapper, btn };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('initMermaidPreview', () => {
  it('按钮不在 code-block 内时静默返回', () => {
    const btn = document.createElement('button');
    expect(() => initMermaidPreview(btn)).not.toThrow();
  });

  it('首次点击:创建预览容器、隐藏源码、按钮切为 显示源码', () => {
    const { wrapper, btn } = buildCodeBlock('graph TD\\nA-->B');
    initMermaidPreview(btn);

    const container = wrapper.querySelector('.mermaid-preview-container') as HTMLElement | null;
    expect(container).not.toBeNull();
    if (container) expect(container.style.display).toBe(''); // 预览可见
    expect((wrapper.querySelector('.code-block-body') as HTMLElement).style.display).toBe('none');
    expect(btn.textContent).toBe('mermaid.showSource');
  });

  it('再次点击(图表已显示):切回源码、按钮恢复为 预览', () => {
    const { wrapper, btn } = buildCodeBlock('graph TD\\nA-->B');
    initMermaidPreview(btn);
    // 再次点击 → 切回源码
    initMermaidPreview(btn);

    const container = wrapper.querySelector('.mermaid-preview-container') as HTMLElement | null;
    if (container) expect(container.style.display).toBe('none');
    expect((wrapper.querySelector('.code-block-body') as HTMLElement).style.display).toBe('');
    expect(btn.textContent).toBe('mermaid.preview');
  });

  it('容器已存在时复用,不重复创建', () => {
    const { wrapper, btn } = buildCodeBlock('graph TD\\nA-->B');
    initMermaidPreview(btn);
    const first = wrapper.querySelector('.mermaid-preview-container');
    initMermaidPreview(btn); // 切回源码
    initMermaidPreview(btn); // 再切回预览 → 复用同一容器
    expect(wrapper.querySelectorAll('.mermaid-preview-container').length).toBe(1);
    expect(wrapper.querySelector('.mermaid-preview-container')).toBe(first);
  });
});