/**
 * ToolTimeline - 工具调用时间线(紧凑模式)
 *
 * 对齐旧版(RenderPipeline / HistoryRenderer)的 timeline 展示逻辑:
 *  - 连续的工具调用合并为一条时间线(.tool-timeline,左侧竖线)
 *  - 每个工具一行摘要(.tool-timeline-item > .tool-timeline-row):
 *    图标点 + 工具名 + 摘要(可点击跳转文件)+ 复制按钮(bash)+ 状态图标
 *  - 点击行展开/折叠详情(.tool-timeline-detail)
 *  - 状态语义:running / success / failed / cancelled /
 *    pending_confirmation(待确认态默认展开,确认 UI 行内渲染)
 *
 * 与旧版的差异(刻意简化):
 *  - 实时流 / 后端加载的历史消息均带完整 args(assistant.tool_calls 还原,见 HistoryRenderer),
 *    摘要、文件跳转、diff 与旧版一致;仅前端内存固化消息(实时结束未刷新)退化为工具名 + 内容首行
 *  - 「查看变更」按钮走 previewStore.openDiff 打开 diff 标签页(替代旧版 window.showFileDiff)
 */
import { memo, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useI18n } from '@/i18n';
import type { TimelineToolItem } from './tool-timeline-utils';
import { ToolTimelineConfirmation } from './ToolTimelineConfirmation';
import {
  computeUnifiedDiff,
  countDiffStats,
  parseToolArgs,
  timelineFilePath,
  timelineSummary,
} from './shared-utils';
// 依赖 tool-renderers.css 中的 .tool-spinner / .diff-* 等样式
// (Vite 对重复 import 会去重,与 ChatPanel 引入不冲突)
import './tool-renderers.css';
import './tool-timeline.css';

// ============================================================================
// 图标
// ============================================================================

/** 工具行图标(按工具名给不同 SVG,对齐旧版 toolSvg/工具专属图标) */
function TimelineDot({ name }: { name: string }) {
  if (name === 'bash') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 4 8 8 4 12" />
        <line x1="11" y1="12" x2="12" y2="12" />
      </svg>
    );
  }
  if (name === 'edit_file' || name === 'write_file') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2a2 2 0 0 1 3 3L5 14H2v-3l9-9z" />
      </svg>
    );
  }
  if (
    name === 'grep' ||
    name === 'glob' ||
    name === 'SearchCodebase' ||
    name === 'web_search'
  ) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" />
      </svg>
    );
  }
  if (name === 'web_fetch') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 10l4-4" />
        <path d="M8 4l1-1a3 3 0 0 1 4 4l-1 1" />
        <path d="M8 12l-1 1a3 3 0 0 1-4-4l1-1" />
      </svg>
    );
  }
  if (
    name === 'read_file' ||
    name === 'read_office_file' ||
    name === 'write_office_file' ||
    name === 'undo_file' ||
    name === 'list_directory'
  ) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M9 2v3h3" />
      </svg>
    );
  }
  // 兜底:齿轮(对齐旧版 toolSvg)
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z" />
      <line x1="10" y1="6" x2="12" y2="4" />
    </svg>
  );
}

// ============================================================================
// 状态图标
// ============================================================================

/** 行尾状态图标(对齐旧版 statusSvg 分支) */
function StatusGlyph({ item }: { item: TimelineToolItem }) {
  const { name, status } = item;

  // 待确认:感叹号圆圈
  if (status === 'pending_confirmation') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" />
        <line x1="8" y1="5" x2="8" y2="9" />
        <line x1="8" y1="11" x2="8.01" y2="11" />
      </svg>
    );
  }
  if (status === 'cancelled') {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <line x1="5" y1="5" x2="11" y2="11" />
      </svg>
    );
  }
  if (status === 'denied') {
    // 用户拒绝执行/删除:禁止符号(区别于 cancelled 的 ✕ 与 failed 的 ✖)
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="5.5" />
        <line x1="5" y1="8" x2="11" y2="8" />
      </svg>
    );
  }
  if (status === 'running') {
    return (
      <svg className="tool-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
    );
  }

  // 成功:edit_file / write_file 显示 +N/-M 统计,其余显示 ✓
  if (status === 'success' && (name === 'edit_file' || name === 'write_file')) {
    const stats = diffStatsFor(item);
    if (stats.insertions > 0 || stats.deletions > 0) {
      return (
        <span className="timeline-diff-stats">
          {stats.insertions > 0 && <span className="diff-add">+{stats.insertions}</span>}
          {stats.deletions > 0 && <span className="diff-del">-{stats.deletions}</span>}
        </span>
      );
    }
  }
  if (status === 'success') {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 8 7 11 12 5" />
      </svg>
    );
  }
  // failed
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

/** 计算 edit/write 的 diff 统计(仅在有 args 时可用) */
function diffStatsFor(item: TimelineToolItem): { insertions: number; deletions: number } {
  const args = parseToolArgs<{ old_text?: string; new_text?: string; content?: string }>(item.args);
  if (item.name === 'write_file') {
    const content = args.content ?? '';
    const lineCount = content.split('\n').length;
    return { insertions: lineCount, deletions: 0 };
  }
  const oldText = args.old_text ?? '';
  const newText = args.new_text ?? '';
  return countDiffStats(oldText, newText);
}

// ============================================================================
// 详情渲染
// ============================================================================

/** 行详情内容(按工具名分支,复用现有卡片/输出样式) */
function TimelineDetail({ item }: { item: TimelineToolItem }) {
  const { t } = useI18n();
  const { name, status, progress, result, error, content, confirmationData } = item;

  // 待确认:行内渲染允许/拒绝(自带确认摘要,对齐旧版内嵌确认卡片)
  if (status === 'pending_confirmation' && confirmationData) {
    return <ToolTimelineConfirmation confirmationData={confirmationData} />;
  }
  if (status === 'pending_confirmation') {
    return <div className="timeline-detail-status pending">{t('tool.timeline.waitingConfirm')}</div>;
  }
  if (status === 'cancelled') {
    return <div className="timeline-detail-status cancelled">{t('tool.timeline.cancelledUnconfirmed')}</div>;
  }
  if (status === 'denied') {
    // 用户拒绝执行/删除:中性提示而非红色错误(对齐旧版 delete 被拒显示"已拒绝删除")
    return (
      <div className="timeline-detail-status denied">
        {item.name === 'delete_file' ? t('tool.timeline.deniedDelete') : t('tool.timeline.deniedRun')}
      </div>
    );
  }

  // 执行中:优先展示流式进度
  if (status === 'running') {
    if (progress && progress.length > 0) {
      return (
        <div className="timeline-detail-progress">
          <pre>
            <code>{progress.slice(-50).join('\n')}</code>
          </pre>
        </div>
      );
    }
    return <div className="timeline-detail-status">{t('tool.timeline.running')}</div>;
  }

  // 失败:展示错误
  if (status === 'failed') {
    return error ? <div className="timeline-detail-error">{error}</div> : null;
  }

  // 成功:按工具名展示详情
  if (name === 'bash') {
    return result ? (
      <div className="timeline-detail-output">
        <pre>
          <code>{result}</code>
        </pre>
      </div>
    ) : null;
  }
  if (name === 'edit_file' || name === 'write_file') {
    // 有 args 时渲染 diff;无 args(历史消息)退化为结果文本
    const args = parseToolArgs<{ old_text?: string; new_text?: string }>(item.args);
    if (args.old_text != null || args.new_text != null) {
      const diffLines = computeUnifiedDiff(args.old_text ?? '', args.new_text ?? '');
      if (diffLines.length > 0) {
        return (
          <div className="timeline-detail-diff">
            {diffLines.map((line, i) => (
              <div key={i} className={`diff-line ${line.type === 'added' ? 'diff-added' : line.type === 'removed' ? 'diff-removed' : 'diff-context'}`}>
                <span className="diff-gutter">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                <span className="diff-line-content">{line.content}</span>
              </div>
            ))}
          </div>
        );
      }
    }
    return result ? (
      <div className="timeline-detail-output">
        <pre>
          <code>{result}</code>
        </pre>
      </div>
    ) : null;
  }
  // 搜索类工具:只展示元信息摘要,具体匹配/文件列表在行首摘要已体现,
  // 无需完整展开(对齐旧版 renderGrepDetail / renderGlobDetail / renderListDirectoryDetail)
  if (name === 'grep') {
    const args = parseToolArgs<{ file_pattern?: string }>(item.args);
    const resultText = result || '';
    if (!resultText.trim() || resultText.includes('未找到匹配的内容')) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-grep-empty">{t('tool.grep.noMatch')}</span>
        </div>
      );
    }
    // 解析尾部统计信息(后端返回中文原文)
    let fileCount: number | null = null;
    let matchCount: number | null = null;
    const summaryMatch = resultText.match(/在\s*(\d+)\s*个文件中找到\s*(\d+)\s*处匹配/);
    if (summaryMatch) {
      fileCount = parseInt(summaryMatch[1], 10);
      matchCount = parseInt(summaryMatch[2], 10);
    }
    const totalMatch = resultText.match(/总计\s*(\d+)\s*处匹配/);
    if (totalMatch && matchCount === null) matchCount = parseInt(totalMatch[1], 10);
    return (
      <div className="timeline-detail-meta">
        {args.file_pattern && <span className="timeline-detail-grep-filter">{args.file_pattern}</span>}
        {matchCount !== null && (
          <span className="timeline-detail-grep-count">
            {fileCount !== null ? `${fileCount} ${t('tool.grep.files')}, ` : ''}
            {matchCount} {t('tool.grep.matches')}
          </span>
        )}
      </div>
    );
  }
  if (name === 'glob') {
    const resultText = result || '';
    if (!resultText.trim() || resultText.includes('未找到匹配的文件')) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-glob-empty">{t('tool.glob.noMatch')}</span>
        </div>
      );
    }
    let fileCount: number | null = null;
    let totalSize: string | null = null;
    const countMatch = resultText.match(/找到\s*(\d+)\s*个文件/);
    if (countMatch) fileCount = parseInt(countMatch[1], 10);
    const sizeMatch = resultText.match(/总大小:\s*(.+)/);
    if (sizeMatch) totalSize = sizeMatch[1];
    return (
      <div className="timeline-detail-meta">
        {fileCount !== null && (
          <span className="timeline-detail-glob-count">
            {fileCount} {t('tool.glob.files')}{totalSize ? ` | ${totalSize}` : ''}
          </span>
        )}
      </div>
    );
  }
  if (name === 'list_directory') {
    const resultText = result || '';
    if (!resultText || resultText.includes('(空目录)')) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-glob-empty">{t('tool.listDir.empty')}</span>
        </div>
      );
    }
    let dirCount: number | null = null;
    let fileCount: number | null = null;
    let totalSize: string | null = null;
    const statsMatch = resultText.match(/统计:\s*(\d+)\s*个目录,\s*(\d+)\s*个文件(?:,\s*总大小:\s*(.+))?/);
    if (statsMatch) {
      dirCount = parseInt(statsMatch[1], 10);
      fileCount = parseInt(statsMatch[2], 10);
      totalSize = statsMatch[3] || null;
    }
    const parts: string[] = [];
    if (dirCount !== null && fileCount !== null) {
      parts.push(`${dirCount} ${t('tool.listDir.dirs')}, ${fileCount} ${t('tool.listDir.files')}`);
    }
    if (totalSize) parts.push(totalSize);
    if (parts.length === 0) return null;
    return (
      <div className="timeline-detail-meta">
        <span className="timeline-detail-glob-count">{parts.join(' | ')}</span>
      </div>
    );
  }
  // web 工具:只展示元信息摘要,具体内容在行首摘要已体现,无需完整展开
  // (对齐旧版 renderWebSearchDetail / renderWebFetchDetail)
  if (name === 'web_search') {
    const resultText = result || '';
    if (!resultText.trim() || resultText.includes('未找到')) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-empty">{t('tool.web.resultNone')}</span>
        </div>
      );
    }
    // 统计结果数:按 "N. **标题**" 格式匹配
    const resultCount = (resultText.match(/\d+\. \*\*/g) ?? []).length;
    if (resultCount === 0) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-empty">{t('tool.web.resultNone')}</span>
        </div>
      );
    }
    return (
      <div className="timeline-detail-meta">
        <span className="timeline-detail-web-count">{t('tool.web.resultCount', { count: resultCount })}</span>
      </div>
    );
  }
  if (name === 'web_fetch') {
    const resultText = result || '';
    if (!resultText.trim()) {
      return (
        <div className="timeline-detail-meta">
          <span className="timeline-detail-empty">{t('tool.web.noContent')}</span>
        </div>
      );
    }
    const charCount = resultText.length;
    const kb = (charCount / 1024).toFixed(1);
    const isTruncated = resultText.includes('[内容过长，已截断');
    return (
      <div className="timeline-detail-meta">
        <span className="timeline-detail-web-count">
          {t('tool.web.charCount', { kb, count: charCount.toLocaleString() })}
        </span>
        {isTruncated && <span className="timeline-detail-web-truncated">{t('tool.web.truncatedLong')}</span>}
      </div>
    );
  }
  // 其他工具:直接展示结果/内容
  const body = result || content;
  if (!body) return null;
  return (
    <div className="timeline-detail-output">
      <pre>
        <code>{body}</code>
      </pre>
    </div>
  );
}

// ============================================================================
// 组件
// ============================================================================

interface ToolTimelineProps {
  /** 一组连续的工具调用(不含 todo_write/ask_user,由调用方分组) */
  items: TimelineToolItem[];
}

function ToolTimelineComponent({ items }: ToolTimelineProps) {
  if (items.length === 0) return null;

  return (
    <div className="tool-timeline">
      {items.map((item) => (
        <TimelineRow key={item.id} item={item} />
      ))}
    </div>
  );
}

/** 单行(摘要 + 可展开详情) */
const PATH_SUMMARY_TOOLS = [
  'read_file',
  'edit_file',
  'write_file',
  'undo_file',
  'read_office_file',
  'write_office_file',
  'delete_file',
  'lint_diagnostics',
  'list_directory',
];

function TimelineRow({ item }: { item: TimelineToolItem }) {
  const [expanded, setExpanded] = useState(item.status === 'pending_confirmation');
  const workspacePath = useAppStore((s) => s.workspacePath);

  const summary = useMemo(() => {
    let text = timelineSummary(item.name, item.args);
    if (text) {
      // 路径类工具:若路径以工作区根路径开头,精简为相对路径(更简洁易读,对齐旧版)
      // 注意:根路径需保留末位 `/`,且归一化反斜杠后再比对
      if (
        PATH_SUMMARY_TOOLS.includes(item.name) &&
        workspacePath &&
        (text = text.replace(/\\/g, '/')) &&
        text.startsWith(`${workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')}/`)
      ) {
        text = text.slice(`${workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')}/`.length);
      }
      return text;
    }
    // 无 args(历史消息)时退化为内容首行;
    // content 也为空(如流式首次 tool_start args 未到位)时留空,避免
    // summary 与 .tool-timeline-name 重复显示工具名。
    const body = item.content?.trim() ?? '';
    return body.split('\n')[0].slice(0, 120);
  }, [item.name, item.args, item.content, workspacePath]);
  const filePath = useMemo(() => timelineFilePath(item.name, item.args), [item.name, item.args]);

  const hasDetail = useMemo(() => {
    const { status, progress, result, error, content, confirmationData } = item;
    // 待确认:行内确认区必须展示
    if (status === 'pending_confirmation' && confirmationData) return true;
    if (status !== 'success') return !!(progress?.length || result || error || content);
    // 成功态:read_file / read_office_file / write_office_file / undo_file 的摘要行已展示路径,
    // 展开无额外内容,不可展开(对齐旧版 renderReadFileDetail / renderReadOfficeFileDetail / undo_file 返回空)
    if (
      item.name === 'read_file' ||
      item.name === 'read_office_file' ||
      item.name === 'write_office_file' ||
      item.name === 'undo_file'
    ) {
      return false;
    }
    // 成功态:bash/其他看 result;edit/write 有 args 必有 diff
    return !!(result || content);
  }, [item]);

  const handleRowClick = () => {
    if (!hasDetail) return;
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`tool-timeline-item${hasDetail ? '' : ' no-detail'}${expanded ? ' expanded' : ''}`}
      data-tool-name={item.name}
      data-tool-status={item.status}
    >
      <div
        className="tool-timeline-row"
        onClick={handleRowClick}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onKeyDown={
          hasDetail
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <span className="tool-timeline-dot">
          <TimelineDot name={item.name} />
        </span>
        <span className="tool-timeline-name">{item.name}</span>
        <span
          className="tool-timeline-summary"
          data-clickable={filePath ? '' : undefined}
          onClick={
            filePath
              ? (e) => {
                  e.stopPropagation();
                  // 应用内 openFile 跳转并定位行号(与文件引用芯片一致,
                  // 规避新版 Electron 无 HippoWorkspace.navigateToFile 的问题)
                  usePreviewStore.getState().openFile(filePath);
                }
              : undefined
          }
          title={filePath || summary}
        >
          {summary}
        </span>
        {item.name === 'bash' && summary && <CopyCommandButton command={summary} />}
        {item.name === 'edit_file' && item.status === 'success' && filePath && (
          <ViewDiffButton filePath={filePath} toolCallId={item.id} />
        )}
        {item.name === 'write_file' && item.status === 'success' && filePath && (
          <ViewDiffButton filePath={filePath} toolCallId={item.id} />
        )}
        <span className={`tool-timeline-status ${item.status}`}>
          <StatusGlyph item={item} />
        </span>
      </div>

      {hasDetail && (
        <div className="tool-timeline-detail">
          <TimelineDetail item={item} />
        </div>
      )}
    </div>
  );
}

/** bash 命令复制按钮(悬浮行时显示) */
function CopyCommandButton({ command }: { command: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <span
      className="tool-timeline-copy-btn"
      onClick={handleCopy}
      title={copied ? t('chatui.copied') : t('tool.bash.copyCmd')}
      role="button"
      tabIndex={0}
    >
      {copied ? (
        <span className="tool-timeline-copy-ok">✓</span>
      ) : (
        <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" />
          <path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" />
        </svg>
      )}
    </span>
  );
}

/**
 * 查看变更按钮(edit_file / write_file 成功态显示,悬浮行时可见)。
 * 对齐旧版「查看变更」:点击打开该文件 diff 标签页并聚焦本次工具调用的变更。
 */
function ViewDiffButton({ filePath, toolCallId }: { filePath: string; toolCallId: string }) {
  const { t } = useI18n();
  const openDiff = () => {
    usePreviewStore.getState().openDiff(filePath, toolCallId);
  };

  return (
    <span
      className="tool-timeline-view-btn"
      onClick={(e) => {
        e.stopPropagation();
        openDiff();
      }}
      title={t('tool.write.viewChanges')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDiff();
        }
      }}
    >
      {t('tool.write.viewChanges')}
    </span>
  );
}

export const ToolTimeline = memo(ToolTimelineComponent);
