/**
 * DocxPreview — mammoth.js DOCX 预览
 *
 * 通过 mammoth.js 将 DOCX 文件转换为 HTML，适合快速查看文档内容。
 * 样式保留有限，如需精确还原请使用 Silurus 引擎（DocxSilurusPreview）。
 */

import { escapeHtml, updateStatusbarText } from './shared.js';

/**
 * 通过 mammoth.js 将 DOCX 渲染为 HTML
 * @param {HTMLElement} container - 渲染目标容器
 * @param {string} filePath - 文件路径
 * @param {boolean} [forceRefresh] - 是否强制刷新
 * @param {Function} [onError] - 错误回调 (err) => void
 */
export async function renderDocx(container, filePath, forceRefresh, onError) {
  const encodedPath = encodeURIComponent(filePath);
  const cacheBust = forceRefresh ? `&_t=${Date.now()}` : '';
  const url = `/api/file/raw?path=${encodedPath}${cacheBust}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      await showHttpError(container, resp, filePath, onError);
      return;
    }
    const arrayBuffer = await resp.arrayBuffer();

    const styleMap = [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Quote'] => blockquote:fresh",
    ];
    const result = await mammoth.convertToHtml({
      arrayBuffer: arrayBuffer,
      styleMap: styleMap,
    });

    container.innerHTML = `
      <div class="file-docx-preview">
        <div class="docx-content">
          ${result.value}
        </div>
      </div>`;

    if (result.messages && result.messages.length > 0) {
      console.info('BinaryPreview: mammoth.js 转换警告:', result.messages);
    }

    const warnCount = result.messages ? result.messages.length : 0;
    updateStatusbarText(
      warnCount > 0
        ? `DOCX · ⚠ ${warnCount} 条警告`
        : 'DOCX'
    );

  } catch (err) {
    console.error('BinaryPreview: docx parse failed', filePath, err);
    container.innerHTML = `<div class="file-preview-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>文档解析失败: ${escapeHtml(err.message)}</p>
    </div>`;
    if (onError) onError(err);
  }
}

/**
 * 显示 HTTP 错误提示
 */
async function showHttpError(container, resp, filePath, onError) {
  let serverMsg = '';
  try {
    serverMsg = await resp.text();
  } catch (_) {}

  const status = resp.status;
  let title = '预览失败';
  let detail = '';

  if (status === 413) {
    title = '文件过大';
    detail = serverMsg || '文件体积超过服务端限制，无法加载预览';
  } else if (status === 404) {
    title = '文件未找到';
    detail = serverMsg || '文件不存在或已被删除';
  } else if (status === 400) {
    title = '请求错误';
    detail = serverMsg || '无法解析该文件';
  } else if (status >= 500) {
    title = '服务端错误';
    detail = serverMsg || '服务端处理失败';
  } else {
    detail = serverMsg || `HTTP 错误（${status}）`;
  }

  container.innerHTML = `<div class="file-preview-placeholder">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p style="font-size:13px; opacity:0.8;">${escapeHtml(detail)}</p>
  </div>`;
  if (onError) onError(new Error(`${title}: ${detail}`));
}
