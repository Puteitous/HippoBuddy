import { escapeHtml, truncateText } from '../../utils.js';
import { parseToolArgs, countDiffStats } from './shared.js';
import { renderBashCard, renderBashDetail } from './bash.js';
import { renderEditFileCard, renderEditFileDetail } from './edit-file.js';
import { renderWriteFileCard, renderWriteFileDetail } from './write-file.js';
import { renderReadFileDetail, renderGrepDetail, renderGlobDetail, renderSearchDetail } from './file-search.js';
import { renderTodoWriteCard } from './todo-write.js';
import { renderAskUserCard } from './ask-user.js';
import { renderConfirmationDetail } from './confirmation.js';
import { renderDefaultToolCard, renderDefaultToolDetail } from './default.js';
import { renderDeleteFileConfirmCard, renderDeleteFileConfirmationDetail, renderDeleteFileDetail } from './delete-file.js';

export function renderToolCard(tool) {
  if (tool.name === 'todo_write') {
    return renderTodoWriteCard(tool);
  }
  if (tool.name === 'ask_user') {
    return renderAskUserCard(tool);
  }
  if (tool.name === 'bash') {
    return renderBashCard(tool);
  }
  if (tool.name === 'edit_file') {
    return renderEditFileCard(tool);
  }
  if (tool.name === 'write_file') {
    return renderWriteFileCard(tool);
  }
  if (tool.name === 'delete_file') {
    // 有确认数据时渲染确认卡片，否则渲染默认卡片
    if (tool.confirmationData) {
      return renderDeleteFileConfirmCard(tool);
    }
    return renderDefaultToolCard(tool);
  }
  return renderDefaultToolCard(tool);
}

export function renderToolTimelineDetailContent(tool) {
  const name = tool.name;
  const isCancelled = tool.result === 'cancelled';
  const isInterrupted = tool.result === 'interrupted';

  if (tool.confirmationData) {
    if (name === 'delete_file') {
      return renderDeleteFileConfirmationDetail(tool);
    }
    return renderConfirmationDetail(tool);
  }

  if (isCancelled) {
    return '<div class="timeline-detail-status cancelled">已取消（未确认）</div>';
  }

  if (isInterrupted) {
    return '<div class="timeline-detail-status interrupted">执行中断</div>';
  }

  if (!tool.result) {
    if (tool.progressLines && tool.progressLines.length > 0) {
      const lines = tool.progressLines.slice(-20);
      return `<div class="timeline-detail-progress"><pre><code>${lines.map(l => escapeHtml(l)).join('\n')}</code></pre></div>`;
    }
    return `<div class="timeline-detail-status">运行中...</div>`;
  }

  if (tool.result === 'error' && tool.error) {
    return `<div class="timeline-detail-error">${escapeHtml(tool.error)}</div>`;
  }

  if (name === 'bash') {
    return renderBashDetail(tool);
  }
  if (name === 'edit_file') {
    return renderEditFileDetail(tool);
  }
  if (name === 'write_file') {
    return renderWriteFileDetail(tool);
  }
  if (name === 'delete_file') {
    return renderDeleteFileDetail(tool);
  }
  if (name === 'read_file') {
    return renderReadFileDetail(tool);
  }
  if (name === 'grep') {
    return renderGrepDetail(tool);
  }
  if (name === 'glob') {
    return renderGlobDetail(tool);
  }
  if (name === 'SearchCodebase') {
    return renderSearchDetail(tool);
  }
  return renderDefaultToolDetail(tool);
}

export function renderToolTimelineRow(tool) {
  const name = tool.name;
  const isPendingConfirm = !!(tool.confirmationData);
  const status = isPendingConfirm ? 'pending_confirmation' : (tool.result || 'running');
  const detailHTML = renderToolTimelineDetailContent(tool);

  let summary = '';
  let diffStatsHtml = '';
  if (name === 'bash') {
    if (tool.confirmationData && tool.confirmationData.command) {
      summary = tool.confirmationData.command;
    } else if (tool._savedCommand) {
      summary = tool._savedCommand;
    } else {
      const args = parseToolArgs(tool.args);
      summary = args.command || '';
    }
  } else if (name === 'read_file') {
    const args = parseToolArgs(tool.args);
    summary = args.path || '';
  } else if (name === 'grep') {
    const args = parseToolArgs(tool.args);
    summary = args.pattern || '';
  } else if (name === 'glob') {
    const args = parseToolArgs(tool.args);
    summary = args.pattern || '';
  } else if (name === 'SearchCodebase') {
    const args = parseToolArgs(tool.args);
    summary = args.information_request || '';
  } else if (name === 'web_search') {
    const args = parseToolArgs(tool.args);
    summary = `"${args.query || ''}"`;
  } else if (name === 'web_fetch') {
    const args = parseToolArgs(tool.args);
    summary = args.url || '';
  } else if (name === 'delete_file') {
    const args = parseToolArgs(tool.args);
    if (args.paths && Array.isArray(args.paths)) {
      summary = args.paths.join(', ');
    } else {
      summary = '';
    }
  } else if (name === 'edit_file' || name === 'write_file') {
    const args = parseToolArgs(tool.args);
    summary = args.path || '';
    if (status === 'success') {
      if (name === 'edit_file') {
        const oldText = args.old_text || '';
        const newText = args.new_text || '';
        const stats = countDiffStats(oldText, newText);
        if (stats.insertions > 0 || stats.deletions > 0) {
          diffStatsHtml = `<span class="timeline-diff-stats"><span class="diff-add">+${stats.insertions}</span><span class="diff-del">-${stats.deletions}</span></span>`;
        }
      } else if (name === 'write_file') {
        const content = args.content || '';
        const lineCount = content.split('\n').length;
        diffStatsHtml = `<span class="timeline-diff-stats"><span class="diff-add">+${lineCount}</span></span>`;
      }
    }
  } else {
    summary = name;
  }

  let statusSvg;
  if (isPendingConfirm) {
    statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  } else if (status === 'cancelled') {
    statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
  } else if (status === 'interrupted') {
    statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  } else if (status === 'running' && (name === 'edit_file' || name === 'write_file')) {
    statusSvg = '<svg class="tool-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
  } else if (status === 'success' && (name === 'edit_file' || name === 'write_file') && diffStatsHtml) {
    statusSvg = diffStatsHtml;
  } else if (status === 'success' && (name === 'edit_file' || name === 'write_file')) {
    statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>';
  } else {
    statusSvg = status === 'success'
      ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 7 11 12 5"/></svg>'
      : status === 'error'
      ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
      : '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/></svg>';
  }

  const toolSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 0 0-3.5 5.7L2 12.2 3.8 14l4.5-4.5A4 4 0 1 0 10 2z"/><line x1="10" y1="6" x2="12" y2="4"/></svg>';

  // 查看变更按钮（edit_file/write_file 成功时显示）
  let viewBtnHtml = '';
  if (status === 'success' && (name === 'edit_file' || name === 'write_file')) {
    const args = parseToolArgs(tool.args);
    const fp = args.path || '';
    if (fp) {
      viewBtnHtml = `<span class="tool-timeline-view-btn" onclick="event.stopPropagation();window.showFileDiff('${escapeHtml(fp)}','${escapeHtml(tool.id||'')}')">查看</span>`;
    }
  }

  return `
    <div class="tool-timeline-item" data-tool-name="${escapeHtml(name)}" data-tool-status="${status}">
      <div class="tool-timeline-row" onclick="window.toggleToolTimeline(this)">
        <span class="tool-timeline-dot">${toolSvg}</span>
        <span class="tool-timeline-name">${escapeHtml(name)}</span>
        <span class="tool-timeline-summary">${escapeHtml(truncateText(summary, 60))}</span>
        <span class="tool-timeline-status ${status}">${statusSvg}</span>
        ${viewBtnHtml}
        <span class="tool-timeline-arrow">▶</span>
      </div>
      <div class="tool-timeline-detail">${detailHTML}</div>
    </div>`;
}
