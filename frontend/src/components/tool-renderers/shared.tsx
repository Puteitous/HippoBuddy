/**
 * 工具卡片组件(仅组件导出)
 *
 * 提供:
 *  - ToolCardFrame:卡片外壳(图标 + 标题 + 状态徽章 + 折叠箭头 + 子内容)
 *  - StatusIcon / StatusBadge:按 ToolCallStatus 渲染 SVG 状态图标 + 文案
 *  - FilePath:文件路径行(点击跳转桌面端编辑器)
 *  - DiffView / DiffStatsBadge:统一 diff 渲染
 *
 * 非组件导出(常量 / 类型 / 纯函数)见 `./shared-utils`。
 *
 * 设计原则:
 *  - 所有 ToolCard 接收统一的 `record: ToolCallRecord` prop,避免参数风格发散
 *  - 状态徽章和图标集中在 shared,各卡片只关注自身专属内容
 *  - 折叠态由 ToolCardFrame 内部 useState 管理,外部可通过 defaultExpanded 控制
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import type { ToolCallStatus } from '@/types';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import { useI18n } from '@/i18n';
import type { DiffLine } from './shared-utils';
import { statusKey } from './shared-utils';

// ============================================================================
// 状态图标与徽章
// ============================================================================

/** 按 status 渲染对应 SVG 图标 */
export function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'success':
      return (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 8 7 11 12 5" />
        </svg>
      );
    case 'failed':
      return (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      );
    case 'running':
      return (
        <svg className="tool-spinner" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** 状态徽章(图标 + 文案) */
export function StatusBadge({ status, children }: { status: ToolCallStatus; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className={`tool-status-badge ${status}`}>
      <StatusIcon status={status} />
      {children ?? t(statusKey(status))}
    </span>
  );
}

// ============================================================================
// 卡片外壳
// ============================================================================

interface ToolCardFrameProps {
  /** 左侧主图标 */
  icon: ReactNode;
  /** 卡片标题(如"运行命令") */
  title: string;
  /** 右侧状态徽章(可选) */
  statusBadge?: ReactNode;
  /** 摘要行(标题下方的一行简述,如文件路径、命令文本) */
  summary?: ReactNode;
  /** 卡片正文(参数、结果、diff 等) */
  children?: ReactNode;
  /** 默认是否展开(默认 true) */
  defaultExpanded?: boolean;
  /** 是否允许折叠(true 时显示折叠箭头) */
  collapsible?: boolean;
  /** 卡片额外类名(用于按工具名定制样式) */
  className?: string;
}

/** 通用工具卡片外壳 */
export function ToolCardFrame({
  icon,
  title,
  statusBadge,
  summary,
  children,
  defaultExpanded = true,
  collapsible = true,
  className = '',
}: ToolCardFrameProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // 记录用户是否手动折叠过,避免 defaultExpanded 变为 true 时被自动撑开
  const userToggledRef = useRef(false);
  // 首卡挂载时 defaultExpanded 可能为 false(累计树/参数尚未就绪),数据到位后自动展开,
  // 但用户手动折叠过的状态不受影响。
  useEffect(() => {
    if (defaultExpanded && !userToggledRef.current) {
      setExpanded(true);
    }
  }, [defaultExpanded]);
  const hasBody = !!children || !!summary;
  const canToggle = collapsible && hasBody;
  const toggle = () => {
    userToggledRef.current = true;
    setExpanded((v) => !v);
  };

  return (
    <div className={`tool-card ${className}`.trim()}>
      <div
        className={`tool-header ${expanded ? 'expanded' : ''}`.trim()}
        onClick={canToggle ? toggle : undefined}
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle ? 0 : undefined}
        onKeyDown={
          canToggle
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        <span className="tool-icon">{icon}</span>
        <span className="tool-title">{title}</span>
        {statusBadge}
        {canToggle && (
          <span className={`tool-arrow ${expanded ? 'expanded' : ''}`.trim()}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 12 10 8 6 4" />
            </svg>
          </span>
        )}
      </div>
      {hasBody && expanded && (
        <div className="tool-body">
          {summary && <div className="tool-summary">{summary}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 文件路径显示(支持点击跳转)
// ============================================================================

interface FilePathProps {
  /** 绝对路径(将自动精简为相对路径显示) */
  path: string;
  /** 是否可点击跳转(默认 true) */
  clickable?: boolean;
}

/** 文件路径行:点击跳转到桌面端编辑器,显示精简相对路径 */
export function FilePath({ path, clickable = true }: FilePathProps) {
  if (!path) return null;
  const display = toRelativePath(path);
  const handleClick = clickable
    ? () => {
        // 跳转用原始绝对路径(后端要求绝对路径)
        desktopBridge.navigateToFile(path);
      }
    : undefined;
  return (
    <div
      className={`tool-file-path ${clickable ? 'clickable' : ''}`.trim()}
      onClick={handleClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={path}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M9 2v3h3" />
      </svg>
      <span>{display}</span>
    </div>
  );
}

// ============================================================================
// Diff 视图
// ============================================================================

/** Diff 行数徽章(如 +12 -3) */
export function DiffStatsBadge({ insertions, deletions }: { insertions: number; deletions: number }) {
  if (insertions === 0 && deletions === 0) return null;
  return (
    <span className="diff-stats-badge">
      {insertions > 0 && <span className="diff-add">+{insertions}</span>}
      {deletions > 0 && <span className="diff-del">-{deletions}</span>}
    </span>
  );
}

/** Diff 视图(逐行渲染 added/removed/same) */
export function DiffView({ diffLines }: { diffLines: DiffLine[] }) {
  if (diffLines.length === 0) return null;
  return (
    <div className="tool-diff">
      {diffLines.map((line, i) => {
        const cls = line.type === 'added' ? 'diff-added' : line.type === 'removed' ? 'diff-removed' : 'diff-context';
        const gutter = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        return (
          <div key={i} className={`diff-line ${cls}`}>
            <span className="diff-gutter">{gutter}</span>
            <span className="diff-line-content">{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
