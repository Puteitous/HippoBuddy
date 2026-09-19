/**
 * GitHistoryList - 提交历史列表(懒加载分页) + 行内 diff 展开 + 悬浮详情卡片
 *
 * 悬浮卡片的「显示/隐藏/正文请求」由 useGitPanel 提供(showLogTip/hideLogTip/logTip 状态),
 * 本组件只负责把事件接到回调上,并渲染卡片内容。时间格式化与 %D 引用解析等纯函数随组件内聚。
 */
import { Fragment, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GitLogEntry } from '@/api/client';
import { useI18n } from '@/i18n';
import type { Lang } from '@/i18n/messages';
import { GitDiffView } from '../workspace/GitDiffView';
import { GitSection } from './GitStatusList';
import type { RefObject } from 'react';

/** 悬浮卡片显示延迟(ms):快速划过列表时不闪烁 */
const LOG_TIP_DELAY = 400;

/** 历史行悬浮详情卡片的内容形态(由 useGitPanel 的 logTip 状态驱动) */
export interface GitLogTipData {
  entry: GitLogEntry;
  body: string;
  top: number;
  left: number;
  /** 行左边界:右侧空间不足时用于向左翻转 */
  anchorLeft: number;
}

/** 相对时间(语言中性:s/m/h/d) —— 列表行内紧凑展示用 */
function relativeTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h`;
  return `${Math.floor(hour / 24)}d`;
}

/** 相对时间(本地化文本,如「12分钟前」/「12 minutes ago」)—— 悬浮卡片用 */
function relativeTimeText(iso: string, lang: Lang): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', { numeric: 'always' });
  if (sec < 60) return rtf.format(-sec, 'second');
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hour = Math.floor(min / 60);
  if (hour < 24) return rtf.format(-hour, 'hour');
  const day = Math.floor(hour / 24);
  if (day < 30) return rtf.format(-day, 'day');
  const month = Math.floor(day / 30);
  if (month < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.floor(month / 12), 'year');
}

/** 绝对时间(本地化,如「2026年9月12日 23:52」)—— 悬浮卡片用 */
function absoluteTimeText(iso: string, lang: Lang): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
}

/** 历史行引用标记(由 git log %D 解析) */
interface LogRef {
  label: string;
  /** head=本地分支/HEAD, remote=远端分支, tag=标签 */
  kind: 'head' | 'remote' | 'tag';
}

/** 解析 git log %D,如「HEAD -> main, origin/main, tag: v1.0」 */
function parseRefs(refs: string): LogRef[] {
  if (!refs) return [];
  const out: LogRef[] = [];
  for (const raw of refs.split(',')) {
    let s = raw.trim();
    if (!s) continue;
    let kind: LogRef['kind'] = 'head';
    if (s.startsWith('HEAD -> ')) {
      s = s.slice('HEAD -> '.length).trim();
    } else if (s === 'HEAD') {
      kind = 'head';
    } else if (s.startsWith('tag: ')) {
      s = s.slice('tag: '.length).trim();
      kind = 'tag';
    } else if (s.includes('/')) {
      kind = 'remote';
    }
    if (s) out.push({ label: s, kind });
  }
  return out;
}

/** 历史行悬浮详情卡片(portal 到 body,fixed 坐标;纯展示,不拦截鼠标事件)。
 *  由组装层渲染,以保持各 portal 在 body 的挂载顺序与拆分前一致。 */
export function GitLogTip({
  logTip,
  logTipRef,
}: {
  logTip: GitLogTipData;
  logTipRef: RefObject<HTMLDivElement>;
}) {
  const { lang } = useI18n();
  // 当前卡片引用的分支/标签标记(卡片未显示时为空数组)
  const logTipRefs = useMemo(() => parseRefs(logTip.entry.refs), [logTip]);
  return createPortal(
    <div
      ref={logTipRef}
      className="git-panel-log-tip"
      role="tooltip"
      style={{ left: logTip.left, top: logTip.top }}
    >
      <div className="git-panel-log-tip-meta">
        <span className="git-panel-log-tip-author">{logTip.entry.author}</span>
        <span className="git-panel-log-tip-time">
          {relativeTimeText(logTip.entry.date, lang)}
          <span className="git-panel-log-tip-abs">{absoluteTimeText(logTip.entry.date, lang)}</span>
        </span>
        <span className="git-panel-log-tip-hash" title={logTip.entry.hashFull}>{logTip.entry.hash}</span>
      </div>
      <div className="git-panel-log-tip-subject">{logTip.entry.subject}</div>
      {logTip.body && <div className="git-panel-log-tip-body">{logTip.body}</div>}
      {logTipRefs.length > 0 && (
        <div className="git-panel-log-tip-refs">
          {logTipRefs.map((r) => (
            <span key={r.label} className={`git-panel-log-tip-ref kind-${r.kind}`}>
              {r.label}
            </span>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function GitHistoryList({
  log,
  logEnded,
  logLoadingMore,
  expandedHash,
  busy,
  onToggleCommitDiff,
  onOpenLogMenu,
  onShowLogTip,
  onHideLogTip,
  onLoadMore,
}: {
  log: GitLogEntry[];
  logEnded: boolean;
  logLoadingMore: boolean;
  expandedHash: string | null;
  busy: boolean;
  onToggleCommitDiff: (entry: GitLogEntry) => void;
  onOpenLogMenu: (e: ReactMouseEvent, entry: GitLogEntry) => void;
  onShowLogTip: (el: HTMLElement, entry: GitLogEntry, delay: number) => void;
  onHideLogTip: () => void;
  onLoadMore: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (      <GitSection title={t('git.history')} collapsible defaultCollapsed storageKey="gitPanel.historyOpen" divider>
        {log.map((entry) => {
          const hashKey = entry.hashFull || entry.hash;
          return (
            <Fragment key={hashKey}>
              <div
                role="button"
                tabIndex={0}
                className={`git-panel-log-row${expandedHash === hashKey ? ' expanded' : ''}`}
                onClick={() => onToggleCommitDiff(entry)}
                onContextMenu={(e) => onOpenLogMenu(e, entry)}
                onMouseEnter={(e) => onShowLogTip(e.currentTarget, entry, LOG_TIP_DELAY)}
                onMouseLeave={onHideLogTip}
                onFocus={(e) => onShowLogTip(e.currentTarget, entry, 0)}
                onBlur={onHideLogTip}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCommitDiff(entry);
                  }
                }}
              >
                <span className="git-panel-log-subject">{entry.subject}</span>
                {entry.refs && <span className="git-panel-log-ref">{entry.refs}</span>}
                <span className="git-panel-log-time">{relativeTime(entry.date)}</span>
              </div>
              {expandedHash === hashKey && (
                <div className="git-panel-log-expand">
                  <GitDiffView filePath={hashKey} side="commit" hash={hashKey} bare />
                </div>
              )}
            </Fragment>
          );
        })}
        {!logEnded && (
          <button
            type="button"
            className="git-panel-log-more"
            disabled={busy || logLoadingMore}
            onClick={() => void onLoadMore()}
          >
            {logLoadingMore ? t('git.loading') : t('git.loadMore')}
          </button>
        )}
      </GitSection>
  );
}
