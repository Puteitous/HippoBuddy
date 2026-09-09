/**
 * SuggestedQuestions - 推荐问答卡片
 *
 * 回合正常结束(done)后异步生成 2-3 个可点击的后续问题:
 *  - 点击问题主体:直接作为下一条用户消息发送
 *  - 点击右侧按钮:将问题内容填入输入框(可编辑后再发送)
 * 加载中渲染省略号占位,生成失败(空列表)时不渲染本组件。
 */
import { useI18n } from '@/i18n';
import './SuggestedQuestions.css';

interface SuggestedQuestionsProps {
  /** 已生成的推荐问题(空数组且非加载中时不渲染) */
  questions: string[];
  /** 是否正在异步生成 */
  loading: boolean;
  /** 点击问题主体 → 直接发送 */
  onSend: (q: string) => void;
  /** 点击右侧按钮 → 填入输入框 */
  onFillInput: (q: string) => void;
  /** 点击头部刷新按钮 → 换一批重新生成 */
  onReload?: () => void;
}

export function SuggestedQuestions({
  questions,
  loading,
  onSend,
  onFillInput,
  onReload,
}: SuggestedQuestionsProps) {
  const { t } = useI18n();

  if (!loading && questions.length === 0) return null;

  return (
    <div className="suggested-questions">
      <div className="suggested-questions-header">
        <span className="suggested-questions-title">{t('chat.suggestedQuestions')}</span>
        {onReload && (
          <button
            type="button"
            className="suggested-questions-refresh"
            title={t('chat.suggestedRefresh')}
            aria-label={t('chat.suggestedRefresh')}
            disabled={loading}
            onClick={onReload}
          >
            <svg
              viewBox="0 0 16 16"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
              <path d="M13.5 1.5v3h-3" />
            </svg>
          </button>
        )}
      </div>
      {loading ? (
        <div className="suggested-questions-loading" aria-label={t('chat.suggestedLoading')}>
          <span className="suggested-questions-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : (
        <div className="suggested-questions-list">
          {questions.map((q, i) => (
            <div
              key={i}
              className="suggested-question"
              onClick={() => onSend(q)}
              role="button"
              tabIndex={0}
              title={t('chat.suggestedSend')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSend(q);
                }
              }}
            >
              <span className="suggested-question-text">{q}</span>
              <button
                type="button"
                className="suggested-question-fill"
                title={t('chat.suggestedFillInput')}
                aria-label={t('chat.suggestedFillInput')}
                onClick={(e) => {
                  e.stopPropagation();
                  onFillInput(q);
                }}
              >
                <svg
                  viewBox="0 0 48 48"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* 写字板 + 笔:表示「填入输入框」后编辑 */}
                  <path d="M42 26V40C42 41.1046 41.1046 42 40 42H8C6.89543 42 6 41.1046 6 40V8C6 6.89543 6.89543 6 8 6L22 6" />
                  <path d="M14 26.7199V34H21.3172L42 13.3081L34.6951 6L14 26.7199Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
