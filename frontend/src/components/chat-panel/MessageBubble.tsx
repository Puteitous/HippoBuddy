/**
 * MessageBubble - 单条消息气泡
 *
 * 渲染规则:
 *  - role === 'user':右对齐,蓝色背景,纯文本或多模态(图片)
 *  - role === 'assistant':左对齐,Markdown 渲染,可折叠显示 reasoning_content
 *  - role === 'tool':构造 ToolCallRecord,交给 ToolCardDispatcher 渲染完整卡片
 *  - isStreaming === true:助手流式态,末尾带闪烁光标
 *
 * 阶段 3.3:
 *  - tool role 消息改用 ToolCardDispatcher(替代 3.2 的简略 ToolMessage)
 *  - 工具卡片支持命令、流式进度、diff、确认等完整能力
 */
import { memo, useMemo, useState } from 'react';
import type { ContentPart, Message, ToolCallRecord } from '@/types';
import { renderMarkdown } from '@/utils/markdown';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import { RollbackButton } from '../rollback/RollbackButton';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  /** 是否为流式态(末尾显示闪烁光标) */
  isStreaming?: boolean;
  /** 可选:挂载到根元素的 data-message-id,供 ChatNav 定位用 */
  dataMessageId?: string;
  /**
   * 可选:回滚目标用户消息 id(该 assistant 消息之前最近的 user 消息)。
   * 传入后 assistant 消息头部显示"回滚"按钮(阶段 3.7-2)。
   */
  rollbackTargetId?: string;
}

function MessageBubbleComponent({
  message,
  isStreaming = false,
  dataMessageId,
  rollbackTargetId,
}: MessageBubbleProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  // 助手消息的 HTML(Markdown 渲染 + DOMPurify 净化)
  const html = useMemo(() => {
    const text = extractText(message.content);
    return text ? renderMarkdown(text) : '';
  }, [message.content]);

  if (message.role === 'user') {
    return (
      <div className="msg-bubble msg-bubble-user" data-message-id={dataMessageId}>
        <UserContent content={message.content} />
        {isStreaming && <span className="msg-cursor" aria-hidden />}
      </div>
    );
  }

  if (message.role === 'tool') {
    // 从历史 tool role 消息构造 ToolCallRecord,复用 ToolCardDispatcher
    const record: ToolCallRecord = {
      id: message.toolCallId ?? message.id,
      name: message.toolName ?? 'tool',
      args: undefined,
      status: message.success === false ? 'failed' : 'success',
      progress: [],
      result: typeof message.content === 'string' ? message.content : extractText(message.content),
      startedAt: 0,
    };
    return (
      <div data-message-id={dataMessageId}>
        <ToolCardDispatcher record={record} />
      </div>
    );
  }

  // assistant
  return (
    <div className="msg-bubble msg-bubble-assistant" data-message-id={dataMessageId}>
      {rollbackTargetId && (
        <div className="msg-assistant-toolbar">
          <RollbackButton targetId={rollbackTargetId} />
        </div>
      )}
      {message.reasoning_content && (
        <details
          className="msg-reasoning"
          open={showReasoning}
          onToggle={(e) => setShowReasoning((e.target as HTMLDetailsElement).open)}
        >
          <summary>思考过程</summary>
          <pre className="msg-reasoning-body">{message.reasoning_content}</pre>
        </details>
      )}
      {html ? (
        <div
          className="msg-markdown"
          // marked + DOMPurify 已净化,可安全注入
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        isStreaming && <span className="msg-cursor" aria-hidden />
      )}
      {isStreaming && html && <span className="msg-cursor" aria-hidden />}
    </div>
  );
}

/** 用户消息内容(纯文本或多模态) */
function UserContent({ content }: { content: string | ContentPart[] }) {
  if (typeof content === 'string') {
    return <div className="msg-user-text">{content}</div>;
  }
  return (
    <div className="msg-user-multimodal">
      {content.map((part, i) => {
        if (part.type === 'text' && part.text) {
          return <div key={i} className="msg-user-text">{part.text}</div>;
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          return (
            <img
              key={i}
              src={part.image_url.url}
              alt="用户上传图片"
              className="msg-user-image"
            />
          );
        }
        return null;
      })}
    </div>
  );
}

/** 从消息 content 提取纯文本(用于 Markdown 渲染) */
function extractText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text ?? '')
    .join('\n');
}

export const MessageBubble = memo(MessageBubbleComponent);
