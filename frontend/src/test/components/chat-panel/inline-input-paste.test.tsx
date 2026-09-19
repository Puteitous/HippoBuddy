/**
 * InlineInput 粘贴行为测试。
 *
 * 覆盖「超长粘贴文本折叠为 paste 芯片」的核心不变量:
 *  1. 长文本转芯片,且正文不进入 DOM(旁路存储)
 *  2. 短文本走原路径,不转芯片
 *  3. 序列化时能从旁路回填全文(getContent → 发送组装依赖)
 *  4. 双击芯片可展开为文本(逃生口,换行还原为 <br>)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import InlineInput from '@/components/chat-panel/InlineInput';
import type { InlineInputHandle } from '@/components/chat-panel/InlineInput';
import type { RefChip } from '@/types';

/** 构造一次纯文本粘贴事件(无图片项) */
function pasteText(editor: HTMLElement, text: string) {
  fireEvent.paste(editor, {
    clipboardData: { items: [], getData: () => text },
  });
}

function renderInput() {
  const ref = createRef<InlineInputHandle>();
  const onDraftChange = vi.fn();
  const onSend = vi.fn();
  const { container } = render(
    <InlineInput ref={ref} onSend={onSend} onDraftChange={onDraftChange} />,
  );
  const editor = container.querySelector('.inline-input-editor') as HTMLElement;
  return { ref, container, editor, onDraftChange, onSend };
}

describe('InlineInput 粘贴超长文本', () => {
  beforeEach(() => {
    // jsdom 未实现 execCommand(短文本路径会用到),桩掉以避免噪声报错
    document.execCommand = vi.fn(() => true);
  });

  it('长文本折叠为 paste 芯片,正文不写入 DOM', () => {
    const { editor, container } = renderInput();
    const content = 'x'.repeat(5000);
    pasteText(editor, content);

    const chips = container.querySelectorAll('.inline-chip');
    expect(chips).toHaveLength(1);
    const chipEl = chips[0] as HTMLElement;

    // 展示标签带千分位字数,而非原文
    expect(chipEl.textContent).toContain('5,000');
    // 核心不变量:正文不进 dataset(否则每次序列化都要解析大字符串)
    expect(chipEl.dataset.chip).not.toContain(content);
    expect((chipEl.dataset.chip ?? '').length).toBeLessThan(500);
  });

  it('序列化时从旁路回填全文(kind/selectedText 正确)', () => {
    const { editor, ref } = renderInput();
    const content = 'y'.repeat(3000);
    pasteText(editor, content);

    const { chips } = ref.current!.getContent();
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe('paste');
    expect(chips[0].selectedText).toBe(content);
  });

  it('粘贴后通知草稿变更(内容可随草稿流转)', () => {
    const { editor, onDraftChange } = renderInput();
    const content = 'z'.repeat(2500);
    pasteText(editor, content);

    expect(onDraftChange).toHaveBeenCalled();
    const calls = onDraftChange.mock.calls as Array<[{ chips: RefChip[] }]>;
    const last = calls[calls.length - 1][0];
    expect(last.chips[0].selectedText).toBe(content);
  });

  it('短文本不转芯片,走原插入路径', () => {
    const { editor, container } = renderInput();
    pasteText(editor, '帮我看下这段代码');

    expect(container.querySelectorAll('.inline-chip')).toHaveLength(0);
    expect(document.execCommand).toHaveBeenCalled();
  });

  it('空粘贴不产生任何芯片', () => {
    const { editor, container } = renderInput();
    pasteText(editor, '   ');
    expect(container.querySelectorAll('.inline-chip')).toHaveLength(0);
  });

  it('双击芯片展开为文本,换行还原为 <br>', () => {
    const { editor, container } = renderInput();
    const content = 'line-1\nline-2\nline-3';
    // 该内容不足阈值,这里直接用芯片形态注入等价场景:构造超长内容后再展开校验换行
    pasteText(editor, `${content}\n${'pad'.repeat(700)}`);

    const chipEl = container.querySelector('.inline-chip') as HTMLElement;
    fireEvent.doubleClick(chipEl);

    expect(container.querySelectorAll('.inline-chip')).toHaveLength(0);
    // 3 个换行 → 前 3 行之间应有 2 个 <br>(padding 行同理)
    expect(editor.querySelectorAll('br').length).toBeGreaterThanOrEqual(3);
    expect(editor.textContent).toContain('line-1');
    expect(editor.textContent).toContain('line-3');
  });
});
