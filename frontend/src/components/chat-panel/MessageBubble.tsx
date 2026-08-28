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
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContentPart, Message, ToolCallRecord, WebSearchAction } from '@/types';
import { renderMarkdown } from '@/utils/markdown';
import { emit } from '@/utils/eventBus';
import { useI18n, translate } from '@/i18n';
import { FileTypeIcon } from '../FileTypeIcon';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import type { MessageFileProduct } from './message-utils';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  /** 是否为流式态(末尾显示闪烁光标) */
  isStreaming?: boolean;
  /** 是否处于思考阶段(reasoning 已开始但未收到 reasoning_done)。仅流式气泡需要传 */
  isReasoning?: boolean;
  /** 可选:挂载到根元素的 data-message-id,供 ChatNav 定位用 */
  dataMessageId?: string;
  /** 附加到 assistant 根元素的额外 class(如回合最终正文标记 round-final-text) */
  className?: string;
}

/** 大脑 SVG 图标(对齐旧版 RenderPipeline.renderThinkingBubble) */
const THINK_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';

function MessageBubbleComponent({
  message,
  isStreaming = false,
  isReasoning = false,
  dataMessageId,
  className,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const [showReasoning, setShowReasoning] = useState(false);

  // 思考内容滚动跟随(对齐旧版 RenderPipeline 的 smartScroll):
  // 流式期间若用户未主动上滚,则自动跟随到最新输出位置;若用户上滚阅读则不打断。
  const reasoningRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // 流式 content 增长时,贴近底部则跟随输出
  useEffect(() => {
    if (!userScrolledUp && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [message.reasoning_content, userScrolledUp]);

  // 助手消息的 HTML(Markdown 渲染 + DOMPurify 净化)
  const html = useMemo(() => {
    const text = extractText(message.content);
    return text ? renderMarkdown(text) : '';
  }, [message.content]);

  if (message.role === 'user') {
    return (
      <div className="msg-user-wrap" data-message-id={dataMessageId}>
        <div className="msg-bubble msg-bubble-user">
          <UserContent content={message.content} />
          {isStreaming && <span className="msg-cursor" aria-hidden />}
        </div>
        {/* 消息底部操作条(对齐旧版 .message-user-wrap .message-footer:
            独立于气泡外的下一行,时间 + 复制按钮同一行) */}
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
      // 前端固化路径携带 args(如 todo_write 完整累计树);后端历史加载无此字段时为 undefined
      args: message.args,
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
  // 完全无可见内容(无 reasoning / web 行 / markdown)时不渲染气泡,避免出现空气泡。
  // 覆盖"仅调用工具、未输出文本"的轮次(刷新后与工具卡分离渲染)以及任何流的空段。
  // 工具卡仍由独立的 tool 消息正常展示;流式 thinking 初始空段已由调用方(ChatPanel
  // streamRows 的 !text && !reasoning 过滤)先行跳过,非空段有内容不受影响。
  if (
    !message.reasoning_content &&
    !(message.web_searched && message.web_search_actions) &&
    !html
  ) {
    return null;
  }
  return (
    <div
      className={`msg-bubble msg-bubble-assistant${className ? ` ${className}` : ''}`}
      data-message-id={dataMessageId}
    >
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
              {isStreaming && isReasoning ? t('chat.reasoningThinking') : t('chat.reasoningDone')}
            </span>
          </div>
          <div className="msg-reasoning-content">
            <div
              ref={reasoningRef}
              className="msg-reasoning-content-inner"
              onScroll={(e) => {
                // 贴近底部视为跟随态,否则视为用户上滚阅读(不与自动跟随冲突)
                const el = e.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                setUserScrolledUp(!nearBottom);
              }}
            >
              {message.reasoning_content.replace(/\n{2,}/g, '\n')}
            </div>
          </div>
        </div>
      )}
      {message.web_searched && message.web_search_actions && (
        <WebSearchRow actions={message.web_search_actions} />
      )}
      {html ? (
        <div
          className="msg-markdown"
          // marked + DOMPurify 已净化,可安全注入;复制/公式按钮由 markdown.ts 全局事件委托接管
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </div>
  );
}

/** 联网搜索摘要行(对齐旧版 RenderPipeline.renderWebSearchRow 完成态) */
function WebSearchRow({ actions }: { actions: WebSearchAction[] }) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const summary = useMemo(() => buildWebSearchSummary(actions), [actions, lang]);
  const detailGroups = useMemo(() => buildWebSearchDetailGroups(actions, t), [actions, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleable = detailGroups.length > 0;

  return (
    <div className={`web-search-row completed${expanded ? ' expanded' : ''}`}>
      <div
        className={`web-search-row-header${toggleable ? ' toggleable' : ''}`}
        role={toggleable ? 'button' : undefined}
        tabIndex={toggleable ? 0 : undefined}
        aria-expanded={expanded}
        title={toggleable ? t('chat.expandWebSearchDetail') : undefined}
        onClick={toggleable ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={
          toggleable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <span className="web-search-row-icon">{SEARCH_SVG}</span>
        <span className="web-search-row-label">{summary}</span>
        {toggleable && <span className="web-search-row-chevron">{CHEVRON_SVG}</span>}
      </div>
      {toggleable && <div className="web-search-row-detail">{detailGroups}</div>}
    </div>
  );
}

/** 联网搜索瞬态行(实时流进行中显示,对齐旧版 renderWebSearchRow 流式态) */
export function WebSearchStreamingRow() {
  const { t } = useI18n();
  return (
    <div className="web-search-row streaming">
      <div className="web-search-row-header">
        <span className="web-search-row-icon">{SEARCH_SVG}</span>
        <span className="web-search-row-label">{t('chat.webSearchStreaming')}</span>
      </div>
    </div>
  );
}

const SEARCH_SVG = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const CHEVRON_SVG = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/** 聚合摘要(对齐旧版 _buildWebSearchSummary):统计搜索词 / 打开的网页 / 页内查找 */
function buildWebSearchSummary(actions: WebSearchAction[]): string {
  if (!actions.length) return translate('chat.webSearchBase');
  let queryCount = 0;
  let openCount = 0;
  let findCount = 0;
  for (const a of actions) {
    if (!a || !a.type) continue;
    if (a.type === 'search') {
      queryCount += Array.isArray(a.queries) ? a.queries.length : 0;
    } else if (a.type === 'open_page') {
      if (a.status !== 'failed') openCount++;
    } else if (a.type === 'find_in_page') {
      if (a.status !== 'failed') findCount++;
    }
  }
  const parts: string[] = [];
  if (queryCount > 0) parts.push(translate('chat.webSearchQueryCount', { count: queryCount }));
  if (openCount > 0) parts.push(translate('chat.webSearchOpenCount', { count: openCount }));
  if (findCount > 0) parts.push(translate('chat.webSearchFindCount', { count: findCount }));
  return parts.length > 0 ? translate('chat.webSearchJoined', { parts: parts.join(' · ') }) : translate('chat.webSearchBase');
}

/** 展开详情分组(对齐旧版 _buildWebSearchDetails):搜索词 / 打开的网页 / 页内查找 */
function buildWebSearchDetailGroups(actions: WebSearchAction[], t: (k: string, p?: Record<string, string | number>) => string): ReactNode[] {
  const queries: string[] = [];
  const pages: { url: string; failed: boolean }[] = [];
  const finds: { url: string; pattern: string; failed: boolean }[] = [];
  for (const a of actions) {
    if (!a || !a.type) continue;
    if (a.type === 'search') {
      if (Array.isArray(a.queries)) {
        queries.push(...a.queries.filter((q) => q && q.length > 0));
      }
    } else if (a.type === 'open_page') {
      pages.push({ url: stripWsCallId(a.url), failed: a.status === 'failed' });
    } else if (a.type === 'find_in_page') {
      finds.push({ url: stripWsCallId(a.url), pattern: a.pattern || '', failed: a.status === 'failed' });
    }
  }

  const groups: ReactNode[] = [];
  if (queries.length) {
    groups.push(
      <div key="q" className="web-search-detail-group">
        <div className="web-search-detail-title">{t('chat.webSearchTitleQueries')}</div>
        {queries.map((q, i) => (
          <div key={i} className="web-search-detail-item">{q}</div>
        ))}
      </div>,
    );
  }
  if (pages.length) {
    groups.push(
      <div key="p" className="web-search-detail-group">
        <div className="web-search-detail-title">{t('chat.webSearchTitlePages')}</div>
        {pages.map((p, i) => (
          <div key={i} className={`web-search-detail-item${p.failed ? ' failed' : ''}`}>
            {buildWebUrlLink(p.url)}
          </div>
        ))}
      </div>,
    );
  }
  if (finds.length) {
    groups.push(
      <div key="f" className="web-search-detail-group">
        <div className="web-search-detail-title">{t('chat.webSearchTitleFinds')}</div>
        {finds.map((f, i) => (
          <div key={i} className={`web-search-detail-item${f.failed ? ' failed' : ''}`}>
            {buildWebUrlLink(f.url)}
            {f.pattern ? ` · ${f.pattern}` : ''}
          </div>
        ))}
      </div>,
    );
  }
  return groups;
}

/** 剥掉服务端附加的 #ws_call_id=xxx 尾巴(对齐旧版 _stripWsCallId) */
function stripWsCallId(url?: string): string {
  if (!url) return '';
  return url.replace(/#ws_call_id=[^#]*$/, '');
}

/** 仅 http/https 生成可点击链接,其余协议回退纯文本(对齐旧版 _buildWebUrlLink) */
function buildWebUrlLink(url: string): ReactNode {
  if (!url) return null;
  const display = url.length > 60 ? `${url.slice(0, 60)}…` : url;
  if (!/^https?:\/\//i.test(url)) return display;
  return (
    <a className="web-search-detail-link" href={url} target="_blank" rel="noopener noreferrer">
      {display}
    </a>
  );
}

/** 用户消息内容(纯文本或多模态)，支持长内容折叠 */
const COLLAPSE_THRESHOLD = 200; // px，超过此高度自动折叠

function UserContent({ content }: { content: string | ContentPart[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsible, setCollapsible] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      setCollapsible(contentRef.current.scrollHeight > COLLAPSE_THRESHOLD);
    }
  }, [content]);

  const inner = (
    <div className="msg-user-text">{typeof content === 'string' ? content : extractText(content)}</div>
  );

  return (
    <>
      {/* 内容容器：折叠态 max-height + 渐隐遮罩，按钮保持在容器外确保始终可见可点 */}
      <div ref={contentRef} className={`msg-user-collapsible${collapsible ? ' collapsible' : ''}${expanded ? ' expanded' : ''}`}>
        {typeof content === 'string' ? (
          inner
        ) : (
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
                    alt={t('chat.userImageAlt')}
                    className="msg-user-image"
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          className={`msg-user-expand-btn${expanded ? ' open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t('chat.collapseContent') : t('chat.expandFullText')}
          title={expanded ? t('chat.collapseContent') : t('chat.expandFullText')}
        >
          {expanded ? (
            /* 展开态:朝上的收拢箭头 */
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3.5 10L8 5.5 12.5 10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            /* 收起态:居中三个点 */
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="3.5" cy="8" r="1.6" />
              <circle cx="8" cy="8" r="1.6" />
              <circle cx="12.5" cy="8" r="1.6" />
            </svg>
          )}
        </button>
      )}
    </>
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
export function MessageFooter({ time, onCopy, onRetry, onFork, rollback, files }: MessageFooterProps) {
  const { t } = useI18n();
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
            title={t('chatui.retry')}
            aria-label={t('chatui.retry')}
            onClick={onRetry}
          >
            {RETRY_SVG}
          </button>
        )}
        <button
          type="button"
          className={`message-action-btn${copied ? ' copied' : ''}`}
          title={copied ? t('chatui.copied') : t('chatui.copy')}
          aria-label={copied ? t('chatui.copied') : t('chatui.copy')}
          onClick={handleCopy}
        >
          {copied ? CHECK_SVG : COPY_SVG}
        </button>
        {rollback}
        {onFork && (
          <button
            type="button"
            className="message-action-btn"
            title={t('chatui.fork')}
            aria-label={t('chatui.fork')}
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
  const { t } = useI18n();
  return (
    <span className="message-file-indicator" title={t('chatui.viewFileProducts')}>
      {FILE_SVG} {files.length}
      <div className="message-file-popover">
        {files.map((f) => {
          const fileName = toRelativePath(f.path);
          return (
            <div
              key={f.path}
              className="popover-file-item"
              // 点击打开该文件的 diff 视图(对齐旧版 showFileDiff 语义:消息产物点开看"这轮改了什么")
              onClick={() => emit('workspace:openDiff', { filePath: f.path })}
            >
              <FileTypeIcon fileName={fileName} size={14} />
              <span className="file-name" title={f.path}>{fileName}</span>
              <span className={`file-status status-${statusClass(f.action)}`}>{f.action}</span>
            </div>
          );
        })}
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

export const MessageBubble = memo(MessageBubbleComponent);
