/** ───────── web_search 时间线详情 ─────────
 *  只展示搜索参数摘要（查询词、结果数），
 *  具体搜索结果在行首摘要已体现，无需展开。
 */
export function renderWebSearchDetail(tool) {
  const resultContent = tool.resultContent || '';
  const _t = (k, params) => window.i18n ? window.i18n.t(k, params) : k;

  if (!resultContent || resultContent.includes('未找到')) {
    return `<div class="timeline-detail-meta"><span class="timeline-detail-empty">${_t('tool.webSearch.noResults')}</span></div>`;
  }

  // 统计结果数：按 "N. **标题**" 格式匹配
  let resultCount = 0;
  const itemMatch = resultContent.match(/\d+\. \*\*/g);
  if (itemMatch) {
    resultCount = itemMatch.length;
  }

  if (resultCount === 0) {
    return `<div class="timeline-detail-meta"><span class="timeline-detail-empty">${_t('tool.webSearch.noResults')}</span></div>`;
  }

  return `<div class="timeline-detail-meta"><span class="timeline-detail-web-count">${_t('tool.webSearch.results', { count: resultCount })}</span></div>`;
}


/** ───────── web_fetch 时间线详情 ─────────
 *  只展示抓取摘要（内容大小），
 *  具体网页内容在行首摘要已体现，无需展开。
 */
export function renderWebFetchDetail(tool) {
  const resultContent = tool.resultContent || '';
  const _t = (k, params) => window.i18n ? window.i18n.t(k, params) : k;

  if (!resultContent) {
    return `<div class="timeline-detail-meta"><span class="timeline-detail-empty">${_t('tool.webFetch.noContent')}</span></div>`;
  }

  // 计算内容大小
  const charCount = resultContent.length;
  const kb = (charCount / 1024).toFixed(1);
  const isTruncated = resultContent.includes('[内容过长，已截断');

  let html = '<div class="timeline-detail-meta">';
  html += `<span class="timeline-detail-web-count">${kb}KB (${charCount.toLocaleString()} ${_t('tool.webFetch.chars')})</span>`;
  if (isTruncated) {
    html += `<span class="timeline-detail-web-truncated">${_t('tool.webFetch.truncated')}</span>`;
  }
  html += '</div>';
  return html;
}
