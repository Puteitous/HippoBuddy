/**
 * ProcessSection - 回合级「处理过程」折叠容器(统一收起按钮)
 *
 * 把一个回合的整个处理过程(思维链 reasoning + 工具调用 tool-cards/timeline)
 * 包成一个整体,头部是统一的摘要条(即收起按钮),点击在「展开完整过程」与
 * 「收起为一行摘要」之间切换。收起时通过 CSS 隐藏 .msg-reasoning / .tool-timeline
 * / .tool-card,回合的最终回复正文(content)不受影响、始终可见。
 *
 * 交互对齐 Codex 风格:折叠后只剩一行「已思考 · N 个工具 · 总耗时 X.Xs」。
 *
 * 说明:
 *  - 摘要条始终可见(既是摘要也是收起/展开开关),保证任何状态都能一键收起;
 *  - 收起状态为回合级独有:按「回合 user 消息 id(roundKey)」存储于
 *    chatStore.sessionStreams[].collapsedRounds,流式→固化保持一致;点哪回合只收哪回合。
 *  - 子节点 key 与两条渲染路径(流式 tail / HistoryRenderer)保持一致,实现 DOM 复用。
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { useI18n, translate } from '@/i18n';
import './ProcessSection.css';

/** 流程 SVG 图标(分层堆叠/收纳,传达「过程可折叠、可展开」,与思考段大脑图标区分) */
const PROCESS_SVG = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
);

/** 箭头图标(展开朝上、收起朝下) */
const CHEVRON_SVG = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export interface ProcessSectionProps {
  /** 是否整体收起(思考+工具折叠为一行摘要) */
  collapsed: boolean;
  /** 点击摘要条切换收起/展开 */
  onToggle: () => void;
  /** 本回合是否有思考过程 */
  hasThinking: boolean;
  /** 本回合工具调用数量 */
  toolCount: number;
  /** 本回合处理过程总耗时(ms,null 表示无法计算) */
  elapsedMs: number | null;
  /** 是否处于流式输出中:收起态下隐藏所有正文只留摘要条,固化后显示最终正文 */
  streaming?: boolean;
  /** 回合内过程内容(思维链气泡 + 工具时间线/卡片),最终正文不在此段被隐藏 */
  children: ReactNode;
}

function ProcessSectionComponent({
  collapsed,
  onToggle,
  hasThinking,
  toolCount,
  elapsedMs,
  streaming,
  children,
}: ProcessSectionProps) {
  const { t, lang } = useI18n();
  return (
    <div className={`process-section${collapsed ? ' collapsed' : ''}${streaming ? ' streaming' : ''}`}>
      <div
        className="process-summary"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? t('chat.expandProcess') : t('chat.collapseProcess')}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="process-summary-icon">{PROCESS_SVG}</span>
        <span className="process-summary-text">{buildSummary(streaming, hasThinking, toolCount, elapsedMs, lang)}</span>
        <span className={`process-summary-arrow${collapsed ? '' : ' expanded'}`}>{CHEVRON_SVG}</span>
      </div>
      <div className="process-body">{children}</div>
    </div>
  );
}

/** 折叠摘要文案:状态词 · N 个工具 · 总耗时 X.Xs(按可用信息裁剪)
 *  流式时用「处理中…」、固化后用「本次处理」,避免与单个思考段的「已思考」撞车 */
function buildSummary(
  streaming: boolean | undefined,
  hasThinking: boolean,
  toolCount: number,
  elapsedMs: number | null,
  _lang: string,
): string {
  const parts: string[] = [];
  if (hasThinking) parts.push(streaming ? translate('chat.processSummaryProcessing') : translate('chat.processSummaryRound'));
  if (toolCount > 0) parts.push(translate('chat.processSummaryTools', { count: toolCount }));
  if (elapsedMs != null) parts.push(translate('chat.processSummaryElapsed', { time: formatDuration(elapsedMs) }));
  return parts.length > 0 ? parts.join(' · ') : translate('chat.processSummary');
}

/** 时长格式化:毫秒 → "0.8s" / "12.4s" / "1m 05s" */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export const ProcessSection = memo(ProcessSectionComponent);
