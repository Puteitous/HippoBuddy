import { escapeHtml } from '../../utils.js';
import { parseToolArgs } from './shared.js';

// i18n 辅助函数
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

/** ───────── read_file 时间线详情 ─────────
 *  read_file 的摘要行已展示文件路径（可点击跳转），
 *  展开后无需额外内容，隐藏展开按钮。
 */
export function renderReadFileDetail(_tool) {
  return '';
}


/** ───────── read_office_file / write_office_file 时间线详情 ─────────
 *  与 read_file 同理，摘要行已展示文件路径，
 *  展开后无需额外内容，隐藏展开按钮。
 */
export function renderReadOfficeFileDetail(_tool) {
  return '';
}


/** ───────── grep 时间线详情 ─────────
 *  只展示搜索参数摘要（模式、过滤、匹配数），
 *  具体匹配结果在行首摘要已体现，无需展开。
 */
export function renderGrepDetail(tool) {
  const args = parseToolArgs(tool.args);
  const pattern = args.pattern || '';
  const filePattern = args.file_pattern || '';
  const resultContent = tool.resultContent || '';

  let html = '<div class="timeline-detail-meta">';

  // 后端始终返回中文，故用中文原文做检测，显示用 i18n 翻译
  if (!resultContent || resultContent.trim() === '' || resultContent.includes('未找到匹配的内容')) {
    html += `<span class="timeline-detail-grep-empty">${_t('tool.grep.noMatch')}</span>`;
    html += '</div>';
    return html;
  }

  // 解析尾部统计信息
  let fileCount = null;
  let matchCount = null;
  const summaryMatch = resultContent.match(/在\s*(\d+)\s*个文件中找到\s*(\d+)\s*处匹配/);
  if (summaryMatch) {
    fileCount = parseInt(summaryMatch[1], 10);
    matchCount = parseInt(summaryMatch[2], 10);
  }
  const totalMatch = resultContent.match(/总计\s*(\d+)\s*处匹配/);
  if (totalMatch && matchCount === null) {
    matchCount = parseInt(totalMatch[1], 10);
  }

  if (filePattern) {
    html += `<span class="timeline-detail-grep-filter">${escapeHtml(filePattern)}</span>`;
  }
  if (matchCount !== null) {
    html += `<span class="timeline-detail-grep-count">${fileCount !== null ? `${fileCount} ${_t('tool.grep.files')}, ` : ''}${matchCount} ${_t('tool.grep.matches')}</span>`;
  }
  html += '</div>';
  return html;
}


/** ───────── glob 时间线详情 ─────────
 *  只展示搜索参数摘要（模式、匹配数、总大小），
 *  具体文件列表在行首摘要已体现，无需展开。
 */
export function renderGlobDetail(tool) {
  const args = parseToolArgs(tool.args);
  const globPattern = args.pattern || '';
  const resultContent = tool.resultContent || '';

  let html = '<div class="timeline-detail-meta">';

  // 后端始终返回中文，故用中文原文做检测，显示用 i18n 翻译
  if (!resultContent || resultContent.trim() === '' || resultContent.includes('未找到匹配的文件')) {
    html += `<span class="timeline-detail-glob-empty">${_t('tool.glob.noMatch')}</span>`;
    html += '</div>';
    return html;
  }

  let fileCount = null;
  let totalSize = null;
  const countMatch = resultContent.match(/找到\s*(\d+)\s*个文件/);
  if (countMatch) fileCount = parseInt(countMatch[1], 10);
  const sizeMatch = resultContent.match(/总大小:\s*(.+)/);
  if (sizeMatch) totalSize = sizeMatch[1];

  if (fileCount !== null) {
    const sizeText = totalSize ? ` | ${escapeHtml(totalSize)}` : '';
    html += `<span class="timeline-detail-glob-count">${fileCount} ${_t('tool.glob.files')}${sizeText}</span>`;
  }
  html += '</div>';
  return html;
}


/** ───────── list_directory 时间线详情 ─────────
 *  只展示目录统计摘要（目录数、文件数、总大小），
 *  具体文件列表在行首摘要已体现，无需展开。
 */
export function renderListDirectoryDetail(tool) {
  const args = parseToolArgs(tool.args);
  const resultContent = tool.resultContent || '';

  let html = '<div class="timeline-detail-meta">';

  if (!resultContent || resultContent.includes('(空目录)')) {
    html += `<span class="timeline-detail-glob-empty">${_t('tool.listDir.empty')}</span>`;
    html += '</div>';
    return html;
  }

  // 解析统计信息: "统计: 3 个目录, 12 个文件, 总大小: 14.4KB"
  let dirCount = null;
  let fileCount = null;
  let totalSize = null;

  const statsMatch = resultContent.match(/统计:\s*(\d+)\s*个目录,\s*(\d+)\s*个文件(?:,\s*总大小:\s*(.+))?/);
  if (statsMatch) {
    dirCount = parseInt(statsMatch[1], 10);
    fileCount = parseInt(statsMatch[2], 10);
    totalSize = statsMatch[3] || null;
  }

  const parts = [];
  if (dirCount !== null && fileCount !== null) {
    parts.push(`${dirCount} ${_t('tool.listDir.dirs')}, ${fileCount} ${_t('tool.listDir.files')}`);
  }
  if (totalSize) {
    parts.push(totalSize);
  }
  if (parts.length > 0) {
    html += `<span class="timeline-detail-glob-count"> ${parts.join(' | ')}</span>`;
  }
  html += '</div>';
  return html;
}


/** ───────── SearchCodebase 时间线详情 ─────────
 *  保持原有设计：展示查询关键词 + 完整结果。
 */
export function renderSearchDetail(tool) {
  const args = parseToolArgs(tool.args);
  const query = args.information_request || '';
  const content = tool.resultContent || '';
  let html = `<div class="timeline-detail-meta"><span class="timeline-detail-query">${escapeHtml(query)}</span></div>`;
  if (content) {
    html += `<div class="timeline-detail-output"><pre><code>${escapeHtml(content)}</code></pre></div>`;
  }
  return html;
}
