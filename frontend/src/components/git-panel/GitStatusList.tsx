/**
 * GitStatusList - 已暂存/未暂存变更列表
 *
 * 由「分组区块 GitSection」+「单条变更行 GitStatusRow」组成,通过 props 接收数据与回调,
 * 不含任何面板级状态。GitSection 同时供 GitHistoryList 复用(历史分组)。
 */
import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { GitStatusEntry } from '@/api/client';
import { useI18n } from '@/i18n';
import { gitBadgeKindOf, gitBadgeLetter } from '@/utils/git-status';
import { FileTypeIcon } from '../FileTypeIcon';

/** 分组区块(标题 + 可选右侧操作);collapsible 时标题可点击收起/展开内容 */
export function GitSection({
  title,
  actionLabel,
  onAction,
  disabled,
  collapsible = false,
  defaultCollapsed = false,
  storageKey,
  divider = false,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** 提供时折叠状态持久化到 localStorage,重开面板/刷新后保持一致;缺省仅当前会话生效 */
  storageKey?: string;
  /** 分组上方加细分隔线+间距,用于与语义不同的区块(如历史 vs 当前变更)区隔 */
  divider?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) return stored === '1';
      } catch {
        /* localStorage 不可用(隐私模式等)时退回默认状态 */
      }
    }
    return !defaultCollapsed;
  });
  const toggle = (): void => {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? '1' : '0');
        } catch {
          /* 忽略写入失败 */
        }
      }
      return next;
    });
  };
  return (
    <div className={`git-panel-section${divider ? ' git-panel-section--divider' : ''}`}>
      <div
        className={`git-panel-section-header${collapsible ? ' collapsible' : ''}`}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        title={collapsible ? (open ? '' : undefined) : undefined}
        onClick={collapsible ? toggle : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        } : undefined}
      >
        <span className="git-panel-section-title">{title}</span>
        {collapsible && (
          <svg
            className="git-panel-section-caret"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
          </svg>
        )}
        {actionLabel && onAction && (
          <button type="button" className="git-panel-link" disabled={disabled} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {(!collapsible || open) && children}
    </div>
  );
}

/** 单条变更行:彩色图标 + 路径,点击开 diff;悬浮显示丢弃/暂存按钮;状态徽章置于行尾 */
function GitStatusRow({
  entry,
  busy,
  onOpen,
  onToggle,
  onDiscard,
  onContextMenu,
  toggleLabel,
}: {
  entry: GitStatusEntry;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDiscard: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  toggleLabel: string;
}) {
  const { t } = useI18n();
  // 字母与配色统一由 utils/git-status 给出(与文件树共用同一套规则)
  const badge = gitBadgeLetter(entry);
  const badgeKind = gitBadgeKindOf(entry);
  // 文件路径拆为「文件名」+「目录前缀」,文件名为主视觉,目录弱化显示在后
  const slash = entry.path.lastIndexOf('/');
  const fileName = slash >= 0 ? entry.path.slice(slash + 1) : entry.path;
  const dirName = slash >= 0 ? entry.path.slice(0, slash) : '';
  return (
    <div className="git-panel-row">
      <button
        type="button"
        className="git-panel-row-main"
        title={entry.path}
        onClick={onOpen}
        onContextMenu={onContextMenu}
      >
        <FileTypeIcon fileName={entry.path} size={14} className="git-panel-file-icon" />
        <span className="git-panel-name" title={entry.path}>{fileName}</span>
        {dirName && (
          <span className="git-panel-dir" title={entry.path}>{dirName}/</span>
        )}
      </button>
      <span className="git-panel-row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="git-panel-icon-btn git-panel-discard-btn"
          title={t('git.discard')}
          aria-label={t('git.discard')}
          disabled={busy}
          onClick={onDiscard}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9h6.8l.6-9M6.5 7v3.5M9.5 7v3.5" />
          </svg>
        </button>
        <button
          type="button"
          className="git-panel-icon-btn"
          title={toggleLabel}
          aria-label={toggleLabel}
          disabled={busy}
          onClick={onToggle}
        >
          {entry.staged ? (
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8l8 0" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v10M3 8h10" />
            </svg>
          )}
        </button>
      </span>
      <span className={`git-panel-badge ${badgeKind}`}>{badge}</span>
    </div>
  );
}

/**
 * 变更列表(一个分组):内部以 prefix 生成行 key(staged 用 's',unstaged 用 'u'),
 * 与拆分前保持一致,避免列表重排时 key 冲突。
 */
export function GitStatusList({
  title,
  actionLabel,
  entries,
  busy,
  prefix,
  toggleLabel,
  onAction,
  onOpen,
  onToggle,
  onDiscard,
  onContextMenu,
}: {
  title: string;
  actionLabel: string;
  entries: GitStatusEntry[];
  busy: boolean;
  /** 行 key 前缀('s' | 'u'),与拆分前保持一致 */
  prefix: 's' | 'u';
  toggleLabel: string;
  onAction: () => void;
  onOpen: (e: GitStatusEntry) => void;
  onToggle: (e: GitStatusEntry) => void;
  onDiscard: (e: GitStatusEntry) => void;
  onContextMenu: (e: ReactMouseEvent, entry: GitStatusEntry) => void;
}) {
  return (
    <GitSection title={title} actionLabel={actionLabel} onAction={onAction} disabled={busy}>
      {entries.map((e) => (
        <GitStatusRow
          key={`${prefix}:${e.path}`}
          entry={e}
          busy={busy}
          onOpen={() => onOpen(e)}
          onToggle={() => onToggle(e)}
          onDiscard={() => onDiscard(e)}
          onContextMenu={(ev) => onContextMenu(ev, e)}
          toggleLabel={toggleLabel}
        />
      ))}
    </GitSection>
  );
}
