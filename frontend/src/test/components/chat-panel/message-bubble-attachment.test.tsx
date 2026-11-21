/**
 * 用户气泡的附件卡片渲染测试。
 *
 * 覆盖「超长粘贴文本渲染为附件卡片」的核心不变量:
 *  1. 围栏段落渲染为卡片(字节数标签),不再显示字面 ``` 反引号
 *  2. 卡片为单行按钮,点击在预览面板打开只读虚拟标签
 *  3. 正文段落与卡片共存且顺序正确
 *  4. 复制按钮取到的是去掉围栏的内容
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageBubble } from '@/components/chat-panel/MessageBubble';
import { usePreviewStore } from '@/stores/previewStore';
import type { Message } from '@/types';

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));

vi.mock('@/utils/markdown', () => ({
  renderMarkdown: (t: string) => (t ? `<p class="md">${t}</p>` : ''),
}));
vi.mock('@/utils/eventBus', () => ({ emit: emitMock }));
vi.mock('@/components/tool-renderers/ToolCardDispatcher', () => ({
  ToolCardDispatcher: ({ record }: { record: { name: string } }) => (
    <div data-tool-card={record.name}>{record.name}</div>
  ),
}));

function userMsg(content: Message['content']): Message {
  return { id: 'm1', role: 'user', content } as Message;
}

/** 模拟 combineChipsToMessage 对 paste 芯片的产出形态 */
function pastedMessage(body: string, typed = ''): Message['content'] {
  return typed ? `\`\`\`\n${body}\n\`\`\`\n\n${typed}` : `\`\`\`\n${body}\n\`\`\``;
}

beforeEach(() => {
  vi.clearAllMocks();
  usePreviewStore.getState().closeAll();
});

describe('用户消息 - 附件卡片', () => {
  it('围栏段落渲染为附件卡片,不显示字面反引号', () => {
    render(<MessageBubble message={userMsg(pastedMessage('log body'))} />);

    const card = document.querySelector('.msg-user-attach');
    expect(card).not.toBeNull();
    // 字面 ``` 不应出现在气泡文本中
    expect(document.querySelector('.msg-user-text')?.textContent ?? '').not.toContain('```');
    // 正文段落不存在(仅一个附件段落)
    expect(document.querySelector('.msg-user-text')).toBeNull();
  });

  it('卡片标签显示千分位字数', () => {
    const body = 'x'.repeat(5120);
    render(<MessageBubble message={userMsg(pastedMessage(body))} />);

    expect(screen.getByText(/5,120/)).toBeInTheDocument();
  });

  it('卡片为单行按钮,点击在预览面板打开只读虚拟标签', () => {
    render(<MessageBubble message={userMsg(pastedMessage('secret-log'))} />);

    // 原文不会直接铺在气泡里
    expect(screen.queryByText('secret-log')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /粘贴文本/ }));

    const state = usePreviewStore.getState();
    const tab = state.tabs.find((t) => t.path === state.activePath);
    expect(tab).toBeDefined();
    expect(tab?.mode).toBe('paste');
    expect(tab?.pasteContent).toBe('secret-log');
  });

  it('相同内容重复点击复用同一预览标签', () => {
    render(<MessageBubble message={userMsg(pastedMessage('repeat-body'))} />);

    const card = screen.getByRole('button', { name: /粘贴文本/ });
    fireEvent.click(card);
    fireEvent.click(card);

    expect(usePreviewStore.getState().tabs).toHaveLength(1);
  });

  it('卡片与正文共存时正文正常渲染且顺序为卡片在前', () => {
    render(<MessageBubble message={userMsg(pastedMessage('log body', '分析下这段报错'))} />);

    expect(screen.getByText('分析下这段报错')).toBeInTheDocument();
    const card = document.querySelector('.msg-user-attach');
    const text = document.querySelector('.msg-user-text');
    expect(card).not.toBeNull();
    expect(text).not.toBeNull();
    // 卡片应排在正文之前(DOM 顺序)
    expect(card!.compareDocumentPosition(text!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('多个围栏段落渲染为多张独立卡片,各自打开对应内容', () => {
    const raw = `\`\`\`\nfirst\n\`\`\`\n\n\`\`\`\nsecond\n\`\`\``;
    render(<MessageBubble message={userMsg(raw)} />);

    const cards = screen.getAllByRole('button', { name: /粘贴文本/ });
    expect(cards).toHaveLength(2);
    fireEvent.click(cards[1]);

    const state = usePreviewStore.getState();
    const tab = state.tabs.find((t) => t.path === state.activePath);
    expect(tab?.pasteContent).toBe('second');
  });

  it('临时粘贴文件引用渲染为卡片,点击打开真实文件', () => {
    const path = 'C:\\Users\\alice\\AppData\\Roaming\\HippoBuddy\\.hippo\\tmp\\paste\\2026-11-21\\paste-7228-abcd1234.txt';
    render(<MessageBubble message={userMsg(`@${path}\n\n分析`)} />);

    expect(document.querySelector('.msg-user-attach')).not.toBeNull();
    expect(screen.getByText(/7,228/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /粘贴文本/ }));

    const state = usePreviewStore.getState();
    expect(state.activePath).toBe(path);
    expect(state.tabs[0].mode).toBe('preview');
  });

  it('无围栏的普通文本消息不产生卡片', () => {
    render(<MessageBubble message={userMsg('普通消息')} />);

    expect(document.querySelector('.msg-user-attach')).toBeNull();
    expect(screen.getByText('普通消息')).toBeInTheDocument();
  });

  it('用户手写的带语言围栏代码块不被当作附件卡片', () => {
    const raw = '```js\nconst a = 1;\n```';
    render(<MessageBubble message={userMsg(raw)} />);

    expect(document.querySelector('.msg-user-attach')).toBeNull();
    // 整体作为单个正文段落原样保留(换行不折叠)
    const text = document.querySelector('.msg-user-text');
    expect(text?.textContent).toBe(raw);
  });

  it('多模态消息(文本 + 图片)不受影响', () => {
    const m = userMsg([
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
    ] as Message['content']);
    render(<MessageBubble message={m} />);

    expect(document.querySelector('.msg-user-attach')).toBeNull();
    expect(screen.getByText('看图')).toBeInTheDocument();
    expect(document.querySelector('.msg-user-thumb img')).not.toBeNull();
  });

  it('复制按钮取到去除围栏后的内容', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MessageBubble message={userMsg(pastedMessage('log body', '分析'))} />);
    fireEvent.click(screen.getByRole('button', { name: /复制/ }));

    expect(writeText).toHaveBeenCalledWith('log body\n\n分析');
  });
});
