import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageBubble, MessageFooter } from '@/components/chat-panel/MessageBubble';
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

function msg(partial: Partial<Message> & { role: Message['role']; id?: string }): Message {
  return { content: '', ...partial, id: partial.id ?? 'm' } as Message;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MessageBubble - user', () => {
  it('渲染纯文本气泡与底部 footer', () => {
    render(<MessageBubble message={msg({ role: 'user', content: '你好' })} />);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(document.querySelector('.msg-bubble-user')).not.toBeNull();
    expect(document.querySelector('.message-footer')).not.toBeNull();
  });

  it('多模态：文本与图片', () => {
    const m = msg({
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
      ] as Message['content'],
    });
    render(<MessageBubble message={m} />);
    expect(screen.getByText('看图')).toBeInTheDocument();
    expect(document.querySelector('img.msg-user-image')).not.toBeNull();
  });

  it('isStreaming 时显示光标', () => {
    render(<MessageBubble message={msg({ role: 'user', content: 'x' })} isStreaming />);
    expect(document.querySelector('.msg-cursor')).not.toBeNull();
  });
});

describe('MessageBubble - assistant', () => {
  it('完全无内容时不渲染气泡', () => {
    const { container } = render(<MessageBubble message={msg({ role: 'assistant', content: '' })} />);
    expect(container.firstChild).toBeNull();
  });

  it('无 reasoning 时渲染 markdown 正文', () => {
    render(<MessageBubble message={msg({ role: 'assistant', content: '**加粗**' })} />);
    // mock renderMarkdown 输出 <p class="md">…</p>
    expect(document.querySelector('.msg-markdown')).not.toBeNull();
    expect(screen.getByText('**加粗**')).toBeInTheDocument();
    expect(document.querySelector('.msg-reasoning')).toBeNull();
  });

  it('reasoning 存在时默认折叠，点击展开', () => {
    const m = msg({ role: 'assistant', content: 'ok', reasoning_content: '思考过程' });
    const { container } = render(<MessageBubble message={m} />);
    expect(screen.getByText('已思考')).toBeInTheDocument();
    expect(container.querySelector('.msg-reasoning')!.className).not.toContain('expanded');
    fireEvent.click(screen.getByText('已思考'));
    expect(container.querySelector('.msg-reasoning')!.className).toContain('expanded');
    expect(screen.getByText('思考过程')).toBeInTheDocument();
  });

  it('流式思考中 label 为 思考中...', () => {
    const m = msg({ role: 'assistant', content: 'x', reasoning_content: '…' });
    render(<MessageBubble message={m} isStreaming isReasoning />);
    expect(screen.getByText('思考中...')).toBeInTheDocument();
  });

  it('className 拼接进 assistant 根元素', () => {
    const m = msg({ role: 'assistant', content: 'hello' });
    render(<MessageBubble message={m} className="round-final-text" />);
    expect(document.querySelector('.msg-bubble-assistant.round-final-text')).not.toBeNull();
  });

  it('web_searched 渲染聚合摘要行', () => {
    const m = msg({
      role: 'assistant',
      content: '',
      web_searched: true,
      web_search_actions: [
        { type: 'search', queries: ['a', 'b'] },
        { type: 'open_page', url: 'http://x.com' },
      ],
    });
    render(<MessageBubble message={m} />);
    expect(screen.getByText('已联网搜索 · 2 个关键词 · 打开 1 个网页')).toBeInTheDocument();
  });
});

describe('MessageBubble - tool', () => {
  it('走 ToolCardDispatcher 渲染（按 toolName）', () => {
    const m = msg({ role: 'tool', toolName: 'bash', toolCallId: 'tc1', content: 'ls -la' });
    render(<MessageBubble message={m} />);
    expect(document.querySelector('[data-tool-card="bash"]')).not.toBeNull();
  });
});

describe('MessageFooter', () => {
  it('渲染复制按钮与时间', () => {
    render(<MessageFooter time="12:30" onCopy={vi.fn()} />);
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument();
    expect(screen.getByText('12:30')).toBeInTheDocument();
  });

  it('onRetry / onFork 存在时渲染并触发回调', () => {
    const onRetry = vi.fn();
    const onFork = vi.fn();
    render(<MessageFooter time="" onCopy={vi.fn()} onRetry={onRetry} onFork={onFork} />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(screen.getByRole('button', { name: /分叉/ }));
    expect(onRetry).toHaveBeenCalled();
    expect(onFork).toHaveBeenCalled();
  });

  it('files 渲染文件指示器，点击触发 openDiff 事件', () => {
    render(
      <MessageFooter
        time=""
        onCopy={vi.fn()}
        files={[{ path: '/ws/src/a.ts', action: 'A' }]}
      />,
    );
    expect(document.querySelector('.message-file-indicator')).not.toBeNull();
    fireEvent.click(screen.getByText('a.ts'));
    expect(emitMock).toHaveBeenCalledWith('workspace:openDiff', { filePath: '/ws/src/a.ts' });
  });

  it('点击复制触发 onCopy 并短暂显示 已复制', () => {
    vi.useFakeTimers();
    const onCopy = vi.fn();
    render(<MessageFooter time="" onCopy={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(onCopy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});