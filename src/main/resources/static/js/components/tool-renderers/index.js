import { escapeHtml, truncateText } from '../../utils.js';
import { parseToolArgs, countDiffStats } from './shared.js';
import { renderBashCard, renderBashDetail } from './bash.js';
import { renderEditFileCard, renderEditFileDetail } from './edit-file.js';
import { renderWriteFileCard, renderWriteFileDetail } from './write-file.js';
import { renderReadFileDetail, renderReadOfficeFileDetail, renderGrepDetail, renderGlobDetail, renderListDirectoryDetail, renderSearchDetail } from './file-search.js';
import { renderWebSearchDetail, renderWebFetchDetail } from './web.js';
import { renderTodoWriteCard } from './todo-write.js';
import { renderAskUserCard } from './ask-user.js';
import { renderConfirmationDetail } from './confirmation.js';
import { renderDefaultToolCard, renderDefaultToolDetail } from './default.js';
import { renderDeleteFileConfirmCard, renderDeleteFileConfirmationDetail, renderDeleteFileDetail } from './delete-file.js';

// i18n 辅助函数
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

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
    return `<div class="timeline-detail-status cancelled">${_t('tool.default.cancelled')}（${_t('tool.default.unconfirmed')}）</div>`;
  }

  if (isInterrupted) {
    return `<div class="timeline-detail-status interrupted">${_t('tool.default.interrupted')}</div>`;
  }

  if (!tool.result) {
    if (tool.progressLines && tool.progressLines.length > 0) {
      const lines = tool.progressLines.slice(-20);
      return `<div class="timeline-detail-progress"><pre><code>${lines.map(l => escapeHtml(l)).join('\n')}</code></pre></div>`;
    }
    return `<div class="timeline-detail-status">${_t('tool.default.runningWithEllipsis')}</div>`;
  }

  if (tool.result === 'error' && tool.error) {
    // delete_file 被用户拒绝时（后端返回 success:false, error: "用户拒绝了删除操作"），
    // 显示翻译后的提示而非后端回显的原始中文文本
    if (name === 'delete_file' && (
      tool.error.includes('拒绝') || tool.error.includes('denied') || tool.error.includes('rejected')
    )) {
      return `<div class="timeline-detail-status cancelled">${_t('tool.delete.denied')}</div>`;
    }
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
  if (name === 'read_office_file' || name === 'write_office_file') {
    return renderReadOfficeFileDetail(tool);
  }
  if (name === 'grep') {
    return renderGrepDetail(tool);
  }
  if (name === 'glob') {
    return renderGlobDetail(tool);
  }
  if (name === 'list_directory') {
    return renderListDirectoryDetail(tool);
  }
  if (name === 'SearchCodebase') {
    return renderSearchDetail(tool);
  }
  if (name === 'web_search') {
    return renderWebSearchDetail(tool);
  }
  if (name === 'web_fetch') {
    return renderWebFetchDetail(tool);
  }
  if (name === 'undo_file') {
    return '';
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
  } else if (name === 'lint_diagnostics') {
    const args = parseToolArgs(tool.args);
    if (args.paths && Array.isArray(args.paths)) {
      summary = args.paths.join(', ');
    } else {
      summary = '';
    }
  } else if (name === 'web_fetch') {
    const args = parseToolArgs(tool.args);
    summary = args.url || '';
  } else if (name === 'list_directory') {
    const args = parseToolArgs(tool.args);
    summary = args.path || '(项目根目录)';
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
  } else if (name === 'undo_file') {
    const args = parseToolArgs(tool.args);
    summary = args.path || '';
  } else if (name === 'read_office_file' || name === 'write_office_file') {
    const args = parseToolArgs(tool.args);
    summary = args.path || '';
  } else if (name === 'skill') {
    const args = parseToolArgs(tool.args);
    summary = 'skill: ' + (args.name || '');
  } else {
    summary = name;
  }

  // 提取文件路径（用于 timeline summary 可点击跳转）
  let summaryFilePath = '';
  if (name === 'read_file' || name === 'edit_file' || name === 'write_file'
      || name === 'undo_file'
      || name === 'read_office_file' || name === 'write_office_file') {
    const args = parseToolArgs(tool.args);
    summaryFilePath = args.path || '';
  } else if (name === 'delete_file') {
    const args = parseToolArgs(tool.args);
    if (args.paths && Array.isArray(args.paths)) {
      summaryFilePath = args.paths[0] || '';
    }
  } else if (name === 'lint_diagnostics') {
    const args = parseToolArgs(tool.args);
    if (args.paths && Array.isArray(args.paths)) {
      summaryFilePath = args.paths[0] || '';
    }
  } else if (name === 'list_directory') {
    const args = parseToolArgs(tool.args);
    summaryFilePath = args.path || '';
  }

  let statusSvg;
  if (isPendingConfirm) {
    statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  } else if (status === 'cancelled') {
    statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
  } else if (status === 'interrupted') {
    statusSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><line x1="8" y1="5" x2="8" y2="9"/><line x1="8" y1="11" x2="8.01" y2="11"/></svg>';
  } else if (status === 'running') {
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

  // 复制按钮（bash 悬浮时显示）
  let copyBtnHtml = '';
  if (name === 'bash' && summary) {
    const escapedSummary = escapeHtml(summary);
    const copySvg = '<svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z"/></svg>';
    copyBtnHtml = `<span class="tool-timeline-copy-btn" data-cmd="${escapedSummary}" onclick="event.stopPropagation();const t=this;const os=t.innerHTML;navigator.clipboard.writeText(t.getAttribute('data-cmd')).then(()=>{t.textContent='\\u2713';setTimeout(()=>t.innerHTML=os,1200)})" title="${_t('tool.bash.copyCmd')}">${copySvg}</span>`;
  }

  // 查看变更按钮（edit_file/write_file 预先占位，成功后才可见）
  let viewBtnHtml = '';
  if (name === 'edit_file' || name === 'write_file') {
    const args = parseToolArgs(tool.args);
    const fp = args.path || '';
    if (fp) {
      const jsFp = fp.replace(/\\/g, '/');
      const isVisible = status === 'success';
      viewBtnHtml = `<span class="tool-timeline-view-btn" style="${isVisible ? '' : 'display:none'}" onclick="event.stopPropagation();window.showFileDiff('${escapeHtml(jsFp)}','${escapeHtml(tool.id||'')}')">${_t('tool.default.view')}</span>`;
    }
  }

  // 如果文件路径以工作区根路径开头，精简为相对路径显示（更简洁易读）
  const pathTools = ['read_file', 'edit_file', 'write_file', 'undo_file',
                     'read_office_file', 'write_office_file', 'delete_file',
                     'lint_diagnostics', 'list_directory'];
  if (pathTools.includes(name) && summary && window.HippoWorkspace?.currentPath) {
    const root = window.HippoWorkspace.currentPath.replace(/\\/g, '/') + '/';
    const normSummary = summary.replace(/\\/g, '/');
    if (normSummary.startsWith(root)) {
      summary = normSummary.slice(root.length);
    }
  }

  // Windows 路径中的反斜杠在 JS 字符串字面量中会被解释为转义符（如 \t → tab），
  // 须替换为正斜杠以确保路径完整传递。
  const jsPath = summaryFilePath ? summaryFilePath.replace(/\\/g, '/') : '';

  // 详情为空时（如 read_file），隐藏展开箭头和详情区域
  const hasDetail = detailHTML && detailHTML.trim().length > 0;
  // 待确认的 timeline item 默认展开，让确认按钮直接可见
  const isExpanded = isPendingConfirm && hasDetail;

  return `
    <div class="tool-timeline-item${hasDetail ? '' : ' no-detail'}${isExpanded ? ' expanded' : ''}" data-tool-name="${escapeHtml(name)}" data-tool-status="${status}">
      <div class="tool-timeline-row"${hasDetail ? ' onclick="window.toggleToolTimeline(this)"' : ''}>
        <span class="tool-timeline-dot">${toolSvg}</span>
        <span class="tool-timeline-name">${escapeHtml(name)}</span>
        <span class="tool-timeline-summary"${summaryFilePath ? ` onclick="event.stopPropagation();window.HippoWorkspace?.navigateToFile?.('${escapeHtml(jsPath)}')" data-file-path="${escapeHtml(summaryFilePath)}"` : ''}>${escapeHtml(summary)}</span>
                ${copyBtnHtml}
        <span class="tool-timeline-status ${status}">${statusSvg}</span>
        ${viewBtnHtml}
      </div>
      ${hasDetail ? `<div class="tool-timeline-detail"${isExpanded ? ' style="max-height:none"' : ''}>${detailHTML}</div>` : ''}
    </div>`;
}
