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
 *  - 收起状态与会话级 store(chatStore.processCollapsed)联动,流式→固化保持一致;
 *  - 子节点 key 与两条渲染路径(流式 tail / HistoryRenderer)保持一致,实现 DOM 复用。
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import './ProcessSection.css';

/** 大脑 SVG 图标(与 MessageBubble 思考图标同一套,复用视觉) */
const THINK_SVG = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
    <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
    <path d="M6 18a4 4 0 0 1-1.967-.516" />
    <path d="M19.967 17.484A4 4 0 0 1 18 18" />
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
  return (
    <div className={`process-section${collapsed ? ' collapsed' : ''}${streaming ? ' streaming' : ''}`}>
      <div
        className="process-summary"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? '展开完整处理过程' : '收起处理过程'}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="process-summary-icon">{THINK_SVG}</span>
        <span className="process-summary-text">{buildSummary(hasThinking, toolCount, elapsedMs)}</span>
        <span className={`process-summary-arrow${collapsed ? '' : ' expanded'}`}>{CHEVRON_SVG}</span>
      </div>
      <div className="process-body">{children}</div>
    </div>
  );
}

/** 折叠摘要文案:已思考 · N 个工具 · 总耗时 X.Xs(按可用信息裁剪) */
function buildSummary(hasThinking: boolean, toolCount: number, elapsedMs: number | null): string {
  const parts: string[] = [];
  if (hasThinking) parts.push('已思考');
  if (toolCount > 0) parts.push(`${toolCount} 个工具`);
  if (elapsedMs != null) parts.push(`总耗时 ${formatDuration(elapsedMs)}`);
  return parts.length > 0 ? parts.join(' · ') : '处理过程';
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
