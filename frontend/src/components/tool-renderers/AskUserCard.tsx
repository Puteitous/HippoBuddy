/**
 * AskUserCard - ask_user 工具卡片(内联消息流,对齐旧版 ask segment)
 *
 * 渲染(对齐旧版 ask-user.js):
 *  - 问题文本
 *  - 选项按钮列表(若 options 提供)
 *  - 无状态徽章、无折叠箭头、无自定义输入框(与旧版一致)
 *
 * 数据源:
 *  - record(历史 / 固化后的 tool 消息):从 record.args 解析 question/options/answered,
 *    用于只读历史态,刷新后也能从消息流重建。
 *  - 无 record(实时等待):从 chatStore.askUserData 读取(waiting_user 事件驱动),
 *    后端对 ask_user 不发 tool_start,故实时渲染必须依赖该事件。
 *
 * 生命周期(对齐旧版):
 *  - 实时等待时:展示 question + 可点选项(结尾卡片,交互态)。
 *  - 提交回答后:由 chatStore.commitAskUser 固化为一条 tool 消息(record 渲染只读态),
 *    并清空全局 askUserData,卡片随副本保留在消息流,不再跨回合残留。
 */
import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStream } from '@/hooks/useSessionStream';
import { ToolCardFrame, StatusBadge } from './shared';
import { parseToolArgs } from './shared-utils';
import { useI18n } from '@/i18n';
import type { ToolCallRecord } from '@/types';

interface AskUserCardProps {
  record?: ToolCallRecord;
}

export function AskUserCard({ record }: AskUserCardProps = {}) {
  const { t } = useI18n();
  const { askUserData, waitingForUser } = useSessionStream();
  const commitAskUser = useChatStore((s) => s.commitAskUser);
  const setError = useChatStore((s) => s.setError);
  // 复用 store 内的统一发送通道(与主输入框同一请求、同一 AbortController)。
  // 不用 useChatStream:其不再随组件卸载自动 abort,但这里直接走 store 更明确,
  // 且提交后卡片即卸载,不影响仍应继续的回答流。
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const currentSessionId = useAppStore((s) => s.currentSessionId);

  const [submitting, setSubmitting] = useState(false);

  // 数据统一:record 优先(历史/固化只读),否则回退实时全局态(交互)。
  const fromRecord = !!record;
  let question = '';
  let options: string[] = [];
  let answered: string | null = null;
  if (record && record.args) {
    const a = parseToolArgs<{
      question?: unknown;
      options?: unknown;
      answered?: unknown;
    }>(record.args);
    question = typeof a.question === 'string' ? a.question : '';
    options = Array.isArray(a.options) ? (a.options as string[]).filter((x) => typeof x === 'string') : [];
    answered = typeof a.answered === 'string' ? a.answered : null;
  } else if (askUserData) {
    question = askUserData.question ?? '';
    options = Array.isArray(askUserData.options) ? askUserData.options : [];
    answered = askUserData.answered ?? null;
  }

  // 均无数据(未收到 waiting_user,且无历史记录)时不渲染
  if (!askUserData && !record) return null;

  // 后端经 JSON 序列化传递时,真实换行可能被编码为字面转义序列(如 "\n\n"),
  // 这类字符不被 white-space: pre-wrap 识别,会原样显示。统一还原为真实换行,
  // 交由 CSS pre-wrap 正确排版(对齐旧版 <br> 换行语义)。
  const normalizeBreaks = (s: string) => s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  const displayQuestion = normalizeBreaks(question);
  const displayAnswer = answered != null ? normalizeBreaks(answered) : null;

  // 仅"实时等待且未答复"才可交互;record 存在(历史/固化)或已答复一律只读,
  // 避免跨会话误提交,并保证刷新重建的卡片不会激活错误交互。
  const interactive = !fromRecord && answered == null && waitingForUser;

  // 提交回答:固化为只读历史 + 作为新一轮对话消息发送
  const submit = async (answer: string) => {
    if (!answer?.trim() || submitting) return;
    if (!currentSessionId) return;
    setSubmitting(true);
    try {
      // 先固化 ask_user 记录(含 answered)并清空实时全局态,使卡片转为只读历史
      commitAskUser(answer);
      setError(null);
      await sendUserMessage(answer);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ToolCardFrame
      className={`ask-user-card${interactive ? ' waiting-user-card' : ''}`}
      icon={
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <line x1="8" y1="10" x2="8" y2="11" />
          <path d="M6.5 6.5c0-1 1-1.5 1.5-1.5s1.5.5 1.5 1.5c0 1-1.5 1.5-1.5 2.5" />
        </svg>
      }
      title={t('tool.askUser.title')}
      // 已回复的只读卡在头部显示「已回复」徽章,收起时也能看出该 ask 已被答复
      statusBadge={
        !interactive && answered != null ? (
          <StatusBadge status="success">{t('tool.askUser.replied')}</StatusBadge>
        ) : undefined
      }
      // 实时等待态默认展开、不可折(保证选项可见可作答);
      // 只读态(已回复/历史)默认收起为紧凑卡、可点击展开查看问题与回答(对齐旧版已解决卡)
      defaultExpanded={interactive}
      collapsible={!interactive}
    >
      <div className="ask-user-question">{displayQuestion}</div>

      {answered != null ? (
        <div className="ask-user-answer">
          <span className="ask-user-answer-label">{t('tool.askUser.replied')}</span>
          <span className="ask-user-answer-text">{displayAnswer}</span>
        </div>
      ) : (
        options.length > 0 && (
          <div className="ask-user-options">
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className="ask-user-option-btn"
                onClick={interactive ? () => void submit(opt) : undefined}
                disabled={!interactive || submitting}
              >
                {opt}
              </button>
            ))}
          </div>
        )
      )}
    </ToolCardFrame>
  );
}