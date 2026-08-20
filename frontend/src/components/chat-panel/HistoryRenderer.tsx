/**
 * HistoryRenderer - 历史消息列表
 *
 * 职责:
 *  - 从 chatStore 读取历史消息并渲染为 MessageBubble 列表
 *  - 在加载中显示骨架占位
 *  - 在错误时显示错误提示
 *  - 在空会话时显示空态提示
 *
 * 历史消息的加载逻辑由 useSessionMessages Hook 负责(在 AppShell 调用),
 * 本组件只读 chatStore.messages / isLoadingMessages / error。
 */
import type { ReactNode } from 'react';
import type { ContentPart, Message } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { extractFilesFromToolCalls, type MessageFileProduct } from './message-utils';
import { ToolTimeline } from '../tool-renderers/ToolTimeline';
import { fromToolMessage, TIMELINE_STANDALONE_TOOLS } from '../tool-renderers/tool-timeline-utils';
import './HistoryRenderer.css';

interface HistoryRendererProps {
  /** 重试:重发指定用户消息内容(对齐旧版 retryBtn) */
  onRetry?: (content: string) => void;
  /** 分叉:从指定用户消息 id 分叉新会话(对齐旧版 forkBtn) */
  onFork?: (messageId: string) => void;
  /**
   * 实时流式 rows(尚未固化到 messages 的内容)。
   * 与历史 rows 渲染在同一 `.history-list` 容器、同一 key 体系,
   * 使 `done` 固化后 React 能复用原有 DOM 节点,避免卸载重挂的进入动画重放。
   */
  tail?: React.ReactNode;
}

/** 回合缓冲条目(保持消息原始顺序) */
type RoundEntry =
  | { kind: 'assistant'; msg: Message }
  | { kind: 'timeline'; items: Message[] }
  | { kind: 'tool-card'; msg: Message };

export function HistoryRenderer({ onRetry, onFork, tail }: HistoryRendererProps) {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoadingMessages);
  const error = useChatStore((s) => s.error);
  // 是否正在流式发送。流式期间不显示回合末条 assistant 的 footer(对齐旧版:
  // 旧版按钮容器初始 display:none,整个 SSE 结束后才显示)
  const isSending = useChatStore((s) => s.isSending);

  if (isLoading) {
    return (
      <div className="history-loading">
        <span className="history-loading-dot" />
        正在加载历史消息…
      </div>
    );
  }

  // 加载错误且无消息时显示错误;有消息时错误视为"过期"(可能是上次中断残留)
  if (error && messages.length === 0) {
    return <div className="history-error">无法加载历史消息:{error}</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="history-empty">
        空会话。在下方输入消息开始对话。
      </div>
    );
  }

  const listRows = renderMessageRows();
  return (
    <div className="history-list">
      {/* 关键:必须把流式 tail 并进同一个 rows 数组(单一子数组)渲染。
          若写成 {renderMessageRows()}{tail} 两个并列子表达式,React 会对
          tail 与 renderMessageRows 各自独立做 diff——done 固化时
          s-{turn}-{idx} 从 tail 数组移入 rows 数组,React 视为"移除旧节点+
          追加新节点"而重新挂载,进入动画重放的根因即在此。 */}
      {tail ? [...listRows, ...tail] : listRows}
    </div>
  );

  /**
   * 渲染消息列表,按"回合"分组(对齐旧版 HistoryRenderer 的 while 合并语义):
   *
   * 回合 = 一条 user 消息之后的连续 assistant/tool 消息。旧版把一个回合合并为
   * 单个 .message.assistant,整个回合只有一个 footer,且 footer 聚合整轮信息:
   *  - 复制:所有 text segment 的 markdown 拼接(roundText)
   *  - 重试 / 回滚 / 分叉:该轮 user 消息的内容 / id
   *  - 文件产物:回合内所有工具的文件列表(roundFiles)
   *
   * 新版保持每条 assistant 消息独立渲染气泡,但 footer 只出现在回合的最后一条
   * assistant 消息上(其余 assistant 消息不显示 footer),避免一个回合出现多个操作条。
   * 若回合内没有 assistant 消息(纯工具回合,异常情况),则不渲染 footer。
   */
  function renderMessageRows(): ReactNode[] {
    const rows: ReactNode[] = [];
    let toolGroup: Message[] = [];

    // ── 当前回合缓冲 ──
    const round: RoundEntry[] = [];
    let roundText = '';
    let roundFiles: MessageFileProduct[] = [];
    let roundUserId: string | null = null;
    let roundUserContent: string | null = null;

    const flushToolGroup = () => {
      if (toolGroup.length === 0) return;
      round.push({ kind: 'timeline', items: toolGroup });
      toolGroup = [];
    };

    const flushRound = () => {
      if (round.length === 0) return;

      // 回合最后一条 assistant 消息(承载聚合 footer)
      let lastAssistantIdx = -1;
      for (let i = round.length - 1; i >= 0; i--) {
        if (round[i].kind === 'assistant') {
          lastAssistantIdx = i;
          break;
        }
      }

      round.forEach((entry, idx) => {
        if (entry.kind === 'assistant') {
          const isLast = idx === lastAssistantIdx;
          // 局部 const 便于 TS 在闭包内收窄(roundUserId 等为 let 变量)
          const retryContent = isLast && roundUserContent ? roundUserContent : null;
          const forkTarget = isLast && roundUserId ? roundUserId : null;
          rows.push(
            <MessageBubble
              key={entry.msg.id}
              message={entry.msg}
              dataMessageId={entry.msg.id}
              // 仅回合最后一条 assistant 显示 footer,中间的不显示
              // (避免出现只有复制按钮的空 footer,对齐旧版单卡片单 footer);
              // 流式发送期间一律不显示(对齐旧版整个 SSE 结束后才显示按钮)
              showFooter={isLast && !isSending}
              rollbackTargetId={forkTarget ?? undefined}
              onRetry={retryContent && onRetry ? () => onRetry(retryContent) : undefined}
              onFork={forkTarget && onFork ? () => onFork(forkTarget) : undefined}
              files={isLast && roundFiles.length > 0 ? dedupeFiles(roundFiles) : undefined}
              copyContent={isLast && roundText ? roundText : undefined}
            />,
          );
        } else if (entry.kind === 'timeline') {
          rows.push(
            <ToolTimeline
              key={`tl-${entry.items[0].id}`}
              items={entry.items.map(fromToolMessage)}
            />,
          );
        } else {
          // 独立工具卡片(todo_write / ask_user)
          rows.push(
            <MessageBubble
              key={entry.msg.id}
              message={entry.msg}
              dataMessageId={entry.msg.id}
            />,
          );
        }
      });

      // 清空回合缓冲
      round.length = 0;
      roundText = '';
      roundFiles = [];
      roundUserId = null;
      roundUserContent = null;
    };

    for (const m of messages) {
      if (m.role === 'user') {
        // 上一条 user 之后的回合结束;记录本轮 user 作为下个回合的 retry/fork/rollback 目标
        flushRound();
        roundUserId = m.id;
        roundUserContent = extractText(m.content);
        rows.push(<MessageBubble key={m.id} message={m} dataMessageId={m.id} />);
        continue;
      }
      if (m.role === 'assistant') {
        flushToolGroup();
        round.push({ kind: 'assistant', msg: m });
        roundText = roundText ? `${roundText}\n${extractText(m.content)}` : extractText(m.content);
        roundFiles = roundFiles.concat(extractFilesFromToolCalls(m.tool_calls));
        continue;
      }
      // tool:连续普通工具累积为 timeline,独立工具(todo_write/ask_user)单独卡片
      if (m.toolName && !TIMELINE_STANDALONE_TOOLS.has(m.toolName)) {
        toolGroup.push(m);
      } else {
        flushToolGroup();
        round.push({ kind: 'tool-card', msg: m });
      }
    }
    flushToolGroup();
    flushRound();

    return rows;
  }
}

/** 从消息 content 提取纯文本(user 消息重试重发用) */
function extractText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text ?? '')
    .join('\n');
}

/** 回合内多文件列表去重(同一文件保留最后一次,对齐旧版 seen Map) */
function dedupeFiles(files: MessageFileProduct[]): MessageFileProduct[] {
  const seen = new Map<string, MessageFileProduct>();
  for (const f of files) seen.set(f.path, f);
  return Array.from(seen.values());
}
