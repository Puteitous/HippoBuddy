/**
 * GitCommitBar - 提交信息区(textarea + AI 生成 + 提交按钮)
 *
 * 纯受控组件:值、禁用态与回调全部来自父级。textarea 引用由父级持有(commitMsgRef),
 * 供自动增高 effect 使用;Ctrl/Cmd+Enter 提交行为在组件内接线。
 */
import type { RefObject } from 'react';
import { useI18n } from '@/i18n';

export function GitCommitBar({
  commitMsg,
  commitMsgRef,
  busy,
  aiMsgLoading,
  canGenerate,
  canCommit,
  onCommitMsgChange,
  onCommit,
  onGenerate,
}: {
  commitMsg: string;
  commitMsgRef: RefObject<HTMLTextAreaElement>;
  busy: boolean;
  aiMsgLoading: boolean;
  /** 是否有可依据的变更(AI 按钮禁用条件:无已暂存且无未暂存) */
  canGenerate: boolean;
  /** 是否有已暂存内容(提交按钮禁用条件) */
  canCommit: boolean;
  onCommitMsgChange: (value: string) => void;
  onCommit: () => void;
  onGenerate: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div className="git-panel-commit">
      <div className="git-panel-commit-field">
        <textarea
          ref={commitMsgRef}
          className="git-panel-commit-input"
          rows={1}
          placeholder={t('git.commitPlaceholder')}
          value={commitMsg}
          disabled={busy}
          // 关闭浏览器原生拼写/语法检查(默认开启):提交信息常含术语/缩写/中英混排,
          // 红线纯属噪音,与项目其它输入框(设置页/搜索框等)保持一致
          spellCheck={false}
          onChange={(e) => onCommitMsgChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onCommit();
          }}
        />
        <button
          type="button"
          className="git-panel-icon-btn git-panel-ai-btn"
          title={t('git.commitMsgAI')}
          aria-label={t('git.commitMsgAI')}
          disabled={busy || aiMsgLoading || !canGenerate}
          onClick={() => void onGenerate()}
        >
          {aiMsgLoading ? (
            <svg className="git-panel-ai-spin" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M13 8a5 5 0 1 1-1.5-3.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 2l1.2 3.2L12.5 6l-3.3.8L8 10l-1.2-3.2L3.5 6l3.3-.8L8 2zM12.5 11l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z" />
            </svg>
          )}
        </button>
      </div>
      <button
        type="button"
        className="git-panel-commit-btn"
        disabled={busy || commitMsg.trim() === '' || !canCommit}
        onClick={onCommit}
      >
        {busy ? <span className="git-panel-btn-spin" role="status" aria-label={t('git.loading')} /> : t('git.commit')}
      </button>
    </div>
  );
}
