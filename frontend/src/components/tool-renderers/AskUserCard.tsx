/**
 * AskUserCard - ask_user 工具卡片
 *
 * 渲染:
 *  - 问题文本
 *  - 选项按钮列表(若 options 提供)
 *  - 自由输入框(若 allow_custom_input !== false)
 *
 * 提交流程:
 *  - 选项按钮:把选项作为消息内容调用 chatApi.stream
 *  - 自由输入:把输入文本作为消息内容调用 chatApi.stream
 *  - 提交后置 chatStore.waitingForUser = false(避免重复触发)
 *
 * 注:旧版 ask_user 提交后会清除 AskUserCard。
 *     新版 3.3 因为 chatStore.waitingForUser 控制是否显示,
 *     提交后置 false 即可让卡片消失。
 */
import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useChatStream } from '@/hooks/useChatStream';
import { StatusBadge, ToolCardFrame } from './shared';
import { parseToolArgs, ToolCardProps } from './shared-utils';

interface AskUserArgs {
  question?: string;
  options?: string[] | null;
  allow_custom_input?: boolean;
}

export function AskUserCard({ record }: ToolCardProps) {
  const args = parseToolArgs<AskUserArgs>(record.args);
  const question = args.question ?? '';
  const options = Array.isArray(args.options) ? args.options : [];
  const allowCustom = args.allow_custom_input !== false;

  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const waitingForUser = useChatStore((s) => s.waitingForUser);
  const setWaitingForUser = useChatStore((s) => s.setWaitingForUser);
  const setError = useChatStore((s) => s.setError);

  // 通过 useChatStream 复用主对话发送闭环(乐观更新 / SSE 分发 / 中断)
  const { send: sendStream } = useChatStream();

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 提交回答:作为新一轮对话消息发送
  const submit = async (answer: string) => {
    if (!answer.trim() || submitting) return;
    if (!currentSessionId) return;
    setSubmitting(true);
    setError(null);
    // 提交后立即关闭输入态,防止重复提交(卡片卸载)
    setWaitingForUser(false);
    try {
      await sendStream(answer);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptionClick = (opt: string) => {
    void submit(opt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(input);
      setInput('');
    }
  };

  // 若用户已提交,且不再 waitingForUser,则隐藏卡片
  if (!waitingForUser) {
    return null;
  }

  return (
    <ToolCardFrame
      className="ask-user-card"
      icon={
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <line x1="8" y1="10" x2="8" y2="11" />
          <path d="M6.5 6.5c0-1 1-1.5 1.5-1.5s1.5.5 1.5 1.5c0 1-1.5 1.5-1.5 2.5" />
        </svg>
      }
      title="需要确认"
      statusBadge={<StatusBadge status={record.status} />}
      defaultExpanded={true}
      collapsible={false}
    >
      <div className="ask-user-question">{question}</div>

      {options.length > 0 && (
        <div className="ask-user-options">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className="ask-user-option-btn"
              onClick={() => handleOptionClick(opt)}
              disabled={submitting}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {allowCustom && (
        <div className="ask-user-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入回答…(Enter 提交,Shift+Enter 换行)"
            rows={2}
            disabled={submitting}
          />
          <button
            type="button"
            className="confirmation-btn allow"
            onClick={() => {
              void submit(input);
              setInput('');
            }}
            disabled={submitting || !input.trim()}
          >
            {submitting ? '提交中…' : '提交'}
          </button>
        </div>
      )}
    </ToolCardFrame>
  );
}
