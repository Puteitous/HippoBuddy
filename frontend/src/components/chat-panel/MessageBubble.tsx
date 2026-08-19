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
import type { ReactNode } from 'react';
import type { ContentPart, Message, ToolCall, ToolCallRecord } from '@/types';
import { renderMarkdown } from '@/utils/markdown';
import { desktopBridge } from '@/utils/desktop-bridge';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import { RollbackButton } from '../rollback/RollbackButton';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  /** 是否为流式态(末尾显示闪烁光标) */
  isStreaming?: boolean;
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done)。仅流式气泡需要传 */
  isReasoning?: boolean;
  /** 可选:挂载到根元素的 data-message-id,供 ChatNav 定位用 */
  dataMessageId?: string;
  /**
   * 可选:回滚目标用户消息 id(该 assistant 消息之前最近的 user 消息)。
   * 传入后 assistant 消息 footer 显示"回滚"按钮(阶段 3.7-2)。
   */
  rollbackTargetId?: string;
  /** 可选:重试回调(assistant,重发该轮之前的用户消息;对齐旧版 retryBtn) */
  onRetry?: () => void;
  /** 可选:分叉回调(assistant,从该轮之前的用户消息分叉新会话;对齐旧版 forkBtn) */
  onFork?: () => void;
  /** 可选:本轮文件产物(assistant footer 文件指示器;对齐旧版 fileIndicator) */
  files?: MessageFileProduct[];
  /**
   * 可选:覆盖复制内容。旧版复制的是整个回合的 markdown 拼接
   * (contentDiv.dataset.markdown = 所有 text segment join),仅回合最后一条
   * assistant 消息传入;默认复制本条消息内容。
   */
  copyContent?: string;
  /**
   * 可选:是否显示底部操作条(footer)。默认 true。
   * 回合分组后,仅回合最后一条 assistant 显示 footer;
   * 中间的 assistant 传 false 避免出现只有复制按钮的空 footer。
   */
  showFooter?: boolean;
}

/** 大脑 SVG 图标(对齐旧版 RenderPipeline.renderThinkingBubble) */
const THINK_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';

function MessageBubbleComponent({
  message,
  isStreaming = false,
  isReasoning = false,
  dataMessageId,
  rollbackTargetId,
  onRetry,
  onFork,
  files,
  copyContent,
  showFooter = true,
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
        {/* 消息底部操作条(对齐旧版 .message-footer:时间 + 复制按钮同一行) */}
        <MessageFooter
          time={formatMsgTime(message.timestamp)}
          onCopy={() => copyText(extractText(message.content))}
        />
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
      {message.reasoning_content && (
        <div
          className={`msg-reasoning ${
            isStreaming && isReasoning ? 'streaming' : 'completed'
          } ${showReasoning ? 'expanded' : ''}`}
        >
          <div
            className="msg-reasoning-header"
            role="button"
            tabIndex={0}
            aria-expanded={showReasoning}
            onClick={() => setShowReasoning((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowReasoning((v) => !v);
              }
            }}
          >
            <span
              className="msg-reasoning-icon"
              dangerouslySetInnerHTML={{ __html: THINK_SVG }}
            />
            <span className="msg-reasoning-label">
              {isStreaming && isReasoning ? '思考中...' : '已思考'}
            </span>
          </div>
          <div className="msg-reasoning-content">
            <div className="msg-reasoning-content-inner">
              {message.reasoning_content.replace(/\n{2,}/g, '\n')}
            </div>
          </div>
        </div>
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
      {/* 消息底部操作条(对齐旧版 assistant 的 .message-footer:
          重试 + 复制 + 回滚 + 分叉 + 文件产物;流式未完成时不显示;
          回合分组后仅最后一条 assistant 显示,中间的不显示) */}
      {!isStreaming && showFooter && (
        <MessageFooter
          onCopy={() => copyText(copyContent ?? extractText(message.content))}
          onRetry={onRetry}
          onFork={onFork}
          files={files}
          rollback={rollbackTargetId ? <RollbackButton targetId={rollbackTargetId} /> : undefined}
        />
      )}
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

/* ============================================================
   消息底部操作条(对齐旧版 .message-footer:时间 + 操作按钮同一行)
   旧版实现见 js/chat-ui.js appendUserMessage / HistoryRenderer.js
   ============================================================ */

/** 重试图标(对齐旧版 chat-ui.js 的 retry svg) */
const RETRY_SVG = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

/** 分叉图标(对齐旧版 chat-ui.js 的 fork svg) */
const FORK_SVG = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="6" cy="3" r="2" />
    <circle cx="6" cy="15" r="2" />
    <path d="M18 8v1a4 4 0 0 1-4 4H8" />
  </svg>
);

/** 文件产物图标(对齐旧版 HistoryRenderer 的 file svg) */
const FILE_SVG = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ paddingTop: 1 }}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

/** 复制图标(对齐旧版 chat-ui.js 的 copy svg) */
const COPY_SVG = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** 复制成功图标(对齐旧版复制成功后的 check svg) */
const CHECK_SVG = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** 复制文本到剪贴板(失败静默,对齐旧版 .catch(() => {})) */
function copyText(text: string): void {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** 时间戳格式化为 HH:MM(对齐旧版 toLocaleTimeString('zh-CN', { hour, minute })) */
function formatMsgTime(timestamp?: number): string {
  const t = timestamp && Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(t).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 消息产物文件(对齐旧版 extractFilesFromSegments 返回结构) */
export interface MessageFileProduct {
  /** 文件绝对路径 */
  path: string;
  /** 变更类型:A=新增 D=删除 M=修改 */
  action: 'A' | 'D' | 'M';
}

interface MessageFooterProps {
  /** 可选时间文本(旧版仅 user 消息显示) */
  time?: string;
  /** 复制回调(由调用方决定复制内容) */
  onCopy: () => void;
  /** 重试回调(assistant,可选;对齐旧版 retryBtn) */
  onRetry?: () => void;
  /** 分叉回调(assistant,可选;对齐旧版 forkBtn) */
  onFork?: () => void;
  /** 回滚按钮节点(assistant,可选;对齐旧版 rollbackBtn) */
  rollback?: ReactNode;
  /** 本轮文件产物(assistant,可选;对齐旧版 fileIndicator) */
  files?: MessageFileProduct[];
}

/** 消息底部操作条:时间 + 操作按钮(复制/重试/回滚/分叉/文件产物),对齐旧版交互 */
function MessageFooter({ time, onCopy, onRetry, onFork, rollback, files }: MessageFooterProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="message-footer">
      <div className="message-actions">
        {onRetry && (
          <button
            type="button"
            className="message-action-btn"
            title="重试"
            aria-label="重试"
            onClick={onRetry}
          >
            {RETRY_SVG}
          </button>
        )}
        <button
          type="button"
          className={`message-action-btn${copied ? ' copied' : ''}`}
          title={copied ? '已复制' : '复制'}
          aria-label={copied ? '已复制' : '复制'}
          onClick={handleCopy}
        >
          {copied ? CHECK_SVG : COPY_SVG}
        </button>
        {rollback}
        {onFork && (
          <button
            type="button"
            className="message-action-btn"
            title="分叉"
            aria-label="分叉"
            onClick={onFork}
          >
            {FORK_SVG}
          </button>
        )}
        {files && files.length > 0 && <FileIndicator files={files} />}
      </div>
      {time && <span className="message-time">{time}</span>}
    </div>
  );
}

/**
 * 文件产物指示器(对齐旧版 .message-file-indicator):
 * 显示"📄 N",hover 弹出文件列表(文件名 + 状态字母 A/M/D),点击跳转文件。
 */
function FileIndicator({ files }: { files: MessageFileProduct[] }) {
  return (
    <span className="message-file-indicator" title="查看文件产物">
      {FILE_SVG} {files.length}
      <div className="message-file-popover">
        {files.map((f) => (
          <div
            key={f.path}
            className="popover-file-item"
            onClick={() => desktopBridge.navigateToFile(f.path)}
          >
            <span className="file-name" title={f.path}>{toRelativePath(f.path)}</span>
            <span className={`file-status status-${statusClass(f.action)}`}>{f.action}</span>
          </div>
        ))}
      </div>
    </span>
  );
}

/** 动作字母 → 旧版 status 类名(status-added / status-modified / status-deleted) */
function statusClass(action: MessageFileProduct['action']): string {
  switch (action) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'M':
      return 'modified';
  }
}

/** 绝对路径精简为相对路径显示(对齐 shared.tsx toRelativePath 语义) */
function toRelativePath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * 从 assistant 消息的 tool_calls 提取本轮文件产物(对齐旧版
 * HistoryRenderer.extractFilesFromSegments):
 *  - write_file / edit_file / write_office_file → 取 path 类参数(action A/M)
 *  - delete_file → 取 paths 列表(action D)
 *  - 同一文件多次出现只保留一次
 */
export function extractFilesFromToolCalls(toolCalls?: ToolCall[]): MessageFileProduct[] {
  if (!toolCalls || toolCalls.length === 0) return [];

  const files: MessageFileProduct[] = [];
  for (const tc of toolCalls) {
    let args: unknown;
    try {
      args = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch {
      continue;
    }
    if (!args || typeof args !== 'object') continue;
    const a = args as Record<string, unknown>;

    let paths: string[] = [];
    let action: MessageFileProduct['action'] = 'M';
    if (tc.name === 'delete_file') {
      paths = Array.isArray(a.paths) ? (a.paths as string[]).filter((p): p is string => typeof p === 'string') : [];
      action = 'D';
    } else if (['write_file', 'edit_file', 'write_office_file'].includes(tc.name)) {
      const p =
        typeof a.path === 'string' ? a.path :
        typeof a.filePath === 'string' ? a.filePath :
        typeof a.file_path === 'string' ? a.file_path : '';
      if (p) paths = [p];
      if (tc.name === 'write_file' || tc.name === 'write_office_file') action = 'A';
    }

    for (const p of paths) {
      files.push({ path: p, action });
    }
  }

  // 去重:同一文件保留最后一次(以最新 action 为准)
  const seen = new Map<string, MessageFileProduct>();
  for (const f of files) seen.set(f.path, f);
  return Array.from(seen.values());
}

export const MessageBubble = memo(MessageBubbleComponent);
