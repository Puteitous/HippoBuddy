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
import type { ContentPart, Message, ToolCall, ToolCallRecord } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { MessageBubble, MessageFooter } from './MessageBubble';
import { RollbackButton } from '../rollback/RollbackButton';
import { extractFilesFromToolCalls, type MessageFileProduct } from './message-utils';
import { ToolTimeline } from '../tool-renderers/ToolTimeline';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import { AskUserCard } from '../tool-renderers/AskUserCard';
import {
  fromToolMessage,
  TIMELINE_STANDALONE_TOOLS,
  type TimelineToolItem,
} from '../tool-renderers/tool-timeline-utils';
import {
  deepMergeTodoList,
  parseTodoArgs,
  type FlatTodo,
} from '../tool-renderers/shared-utils';
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
  tail?: ReactNode[];
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
  // 是否有工具正在等待确认(带 confirmationData)。确认阶段后端会发 complete 把
  // isSending 提前置 false(见 WebAgentOrchestrator 确认后 return false → finally 发
  // complete),但对话并未结束;若不额外兜底,旧回合 footer 会在确认期间浮现。
  const waitingConfirm = useChatStore((s) => s.toolCalls.some((tc) => !!tc.confirmationData));
  // ask_user 内联卡片数据(waiting_user 事件驱动,提交后固化为消息流只读记录)
  const askUserData = useChatStore((s) => s.askUserData);
  const waitingForUser = useChatStore((s) => s.waitingForUser);

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
  // 实时等待中渲染一张实时交互 ask 卡(整体末尾:历史 + 流式 tail 之后)。
  // 以 askUserData && waitingForUser 为准:请求提交后 commitAskUser 清空二者,
  // 该卡自动消失,由消息流内回合位置的只读 AskUserCard 接管。
  // 不在此处判断"历史上是否已出现过 ask",否则第二次及以后的 ask 会被一条
  // 历史 ask 记录误抑制;刷新后的历史只读 ask 因 askUserData 为 null 本就不走这里。
  const liveAsk =
    askUserData && waitingForUser ? <AskUserCard key="ask-user-live" /> : null;
  const baseRows = tail ? [...listRows, ...tail] : listRows;
  return (
    <div className="history-list">
      {/* 关键:必须把流式 tail 并进同一个 rows 数组(单一子数组)渲染。
          若写成 {renderMessageRows()}{tail} 两个并列子表达式,React 会对
          tail 与 renderMessageRows 各自独立做 diff——done 固化时
          s-{turn}-{idx} 从 tail 数组移入 rows 数组,React 视为"移除旧节点+
          追加新节点"而重新挂载,进入动画重放的根因即在此。 */}
      {liveAsk ? [...baseRows, liveAsk] : baseRows}
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
    // 会话级 todo 累计:按出现顺序深合并多次 todo_write 的增量,使每张 todo 卡片
    // 显示到当前为止的完整任务树(对齐旧版 HistoryRenderer 的 _todoHistoryCache)。
    let todoCache: FlatTodo[] = [];
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

      // ── 回合内 tool 结果索引:toolCallId → tool 消息(对齐旧版 HistoryRenderer 的 toolResults) ──
      const toolResults = new Map<string, Message>();
      for (const entry of round) {
        if (entry.kind === 'tool-card') {
          toolResults.set(entry.msg.toolCallId ?? entry.msg.id, entry.msg);
        } else if (entry.kind === 'timeline') {
          for (const m of entry.items) {
            toolResults.set(m.toolCallId ?? m.id, m);
          }
        }
      }
      // 已被 assistant.tool_calls 消费的 tool 消息 id(避免重复渲染)
      const consumed = new Set<string>();

      // 回合内是否有工具正在等待用户确认(带 confirmationData)。
      // 对齐旧版 HistoryRenderer:seg 为 tool 且 confirmationData && !result 时,
      // 给 assistant 加 pending-confirm class 隐藏 footer(对话未完成不显示操作按钮)。
      const hasPendingConfirm = round.some((e) =>
        e.kind === 'tool-card'
          ? !!e.msg.confirmationData
          : e.kind === 'timeline'
            ? e.items.some((m) => !!m.confirmationData)
            : false,
      );

      round.forEach((entry) => {
        if (entry.kind === 'assistant') {
          rows.push(
            <MessageBubble
              key={entry.msg.id}
              message={entry.msg}
              dataMessageId={entry.msg.id}
            />,
          );

          // ── 对齐旧版:用 assistant.tool_calls(含完整 args)+ 匹配的 tool 结果重建工具渲染。
          //    实时流固化的内存消息没有 tool_calls,走下方 timeline/tool-card 退化分支。 ──
          const calls = entry.msg.tool_calls;
          if (calls && calls.length > 0) {
            const tlItems: TimelineToolItem[] = [];
            for (const tc of calls) {
              const toolMsg = toolResults.get(tc.id);
              consumed.add(toolMsg ? toolMsg.id : tc.id);
              const item = buildToolItemFromCall(tc, toolMsg);
              if (TIMELINE_STANDALONE_TOOLS.has(item.name)) {
                // todo_write / ask_user:渲染完整独立卡片(带 args,todo 树可还原)。
                // todo_write 做会话级累计:按 id 深合并增量,每张卡片显示完整累计树(对齐旧版)。
                if (item.name === 'todo_write') {
                  const { mode, todos } = parseTodoArgs(item.args);
                  todoCache =
                    mode === 'replace'
                      ? deepMergeTodoList([], todos)
                      : deepMergeTodoList(todoCache, todos);
                  item.args = { mode, todos: todoCache };
                }
                rows.push(
                  <ToolCardDispatcher key={item.id} record={toolItemToRecord(item)} />,
                );
              } else {
                tlItems.push(item);
              }
            }
            if (tlItems.length > 0) {
              rows.push(<ToolTimeline key={`tl-${entry.msg.id}`} items={tlItems} />);
            }
          }
        } else if (entry.kind === 'timeline') {
          // 未被 assistant.tool_calls 消费的普通 tool 消息(实时固化内存消息)→ 退化 timeline
          const items = entry.items
            .filter((m) => !consumed.has(m.id))
            .map(fromToolMessage);
          if (items.length > 0) {
            rows.push(
              <ToolTimeline
                key={`tl-${entry.items[0].id}`}
                items={items}
              />,
            );
          }
        } else {
          // 独立工具卡片(todo_write / ask_user)——已被 assistant.tool_calls 消费则跳过
          if (!consumed.has(entry.msg.id)) {
            // ask_user:以 record(固化携带 question/options/answered)渲染只读卡。
            // TodoWrite 等其它独立工具仍走 MessageBubble。
            if (entry.msg.toolName === 'ask_user') {
              rows.push(
                <AskUserCard
                  key={entry.msg.id}
                  record={{
                    id: entry.msg.id,
                    name: 'ask_user',
                    args: entry.msg.args,
                    status: entry.msg.success === false ? 'failed' : 'success',
                    progress: [],
                    startedAt: entry.msg.timestamp ?? Date.now(),
                    result: extractText(entry.msg.content),
                  }}
                />,
              );
            } else {
              rows.push(
                <MessageBubble
                  key={entry.msg.id}
                  message={entry.msg}
                  dataMessageId={entry.msg.id}
                />,
              );
            }
          }
        }
      });

      // ── 回合级 footer:渲染在回合所有条目(assistant + 工具卡 + ask 卡)之后,作整回合的收尾操作条。
      //    条件:回合产出了 assistant 文本(纯工具回合抑制,避免复制的空 footer)+ 对话未结束阶段
      //    隐藏(流式发送中 / 工具待确认 / 等待 ask 回答),对齐旧版"回合结束后才显示操作条"。 ──
      const retryContent = roundUserContent;
      const forkTarget = roundUserId;
      if (
        roundText &&
        !isSending &&
        !waitingConfirm &&
        !waitingForUser &&
        !hasPendingConfirm
      ) {
        const anchor =
          round[0].kind === 'timeline' ? round[0].items[0].id : round[0].msg.id;
        rows.push(
          <MessageFooter
            key={`round-footer-${anchor}`}
            onCopy={() => {
              if (roundText) navigator.clipboard?.writeText(roundText).catch(() => {});
            }}
            onRetry={retryContent && onRetry ? () => onRetry(retryContent) : undefined}
            onFork={forkTarget && onFork ? () => onFork(forkTarget) : undefined}
            rollback={forkTarget ? <RollbackButton targetId={forkTarget} /> : undefined}
            files={roundFiles.length > 0 ? dedupeFiles(roundFiles) : undefined}
          />,
        );
      }

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

    // 不再在 renderMessageRows 末尾全局追加 ask 卡片(旧实现会导致:
    //  - askUserData 只写不清空 → 后续每回合末尾都冒出残留卡;
    //  - 追加到 listRows 末尾、被流式 tail 顶到前方 → 覆盖对应 timeline;
    //  - 与 assistant.tool_calls / tool-card 回合内渲染重复)。
    // 现在:
    //  - 实时等待(waiting_user):由组件层在"历史 + 流式 tail 之后"渲染一张实时卡;
    //  - 提交后:commitAskUser 固化为消息流内 tool 记录,由上方回合内路径渲染只读卡。
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

/**
 * 从 assistant.tool_calls 条目 + 匹配的 tool 结果消息构造带完整 args 的 Timeline 行。
 * 对齐旧版 HistoryRenderer.js 的 tool segment 重建:args 来自 tool_call.arguments,
 * 结果按 toolCallId 匹配;无匹配结果时按旧版"自愈"语义标记为 cancelled。
 */
function buildToolItemFromCall(tc: ToolCall, toolMsg?: Message): TimelineToolItem {
  const content = toolMsg ? extractText(toolMsg.content) : '';
  let status: TimelineToolItem['status'] = toolMsg
    ? toolMsg.success === false
      ? 'failed'
      : 'success'
    : 'cancelled';
  const lower = content.toLowerCase();
  if (lower.includes('用户拒绝')) {
    status = 'denied';
  } else if (lower.includes('cancelled') || lower.includes('user_cancelled')) {
    status = 'cancelled';
  } else if (lower.includes('interrupted')) {
    status = 'interrupted';
  }
  return {
    id: tc.id,
    name: tc.name,
    args: tc.arguments,
    status,
    result: content || undefined,
    content,
  };
}

/** 把 Timeline 行转成 ToolCallRecord,供 ToolCardDispatcher 渲染独立卡片(带 args) */
function toolItemToRecord(item: TimelineToolItem): ToolCallRecord {
  return {
    id: item.id,
    name: item.name,
    args: item.args,
    status: item.status === 'failed' ? 'failed' : 'success',
    progress: [],
    result: item.result,
    startedAt: 0,
  };
}
