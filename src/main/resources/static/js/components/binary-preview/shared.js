/**
 * shared — binary-preview 子模块共用工具函数
 */

// ==================== 文件类型检测 ====================

export function isImageFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
}

export function isPdfFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.pdf');
}

export function isSpreadsheetFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['xlsx', 'xls', 'csv'].includes(ext);
}

export function isDocxFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.docx');
}

export function isPptxFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.pptx');
}

export function isBinaryFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  const binaryExts = new Set([
    'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'zst', 'tgz', 'tzst', 'lz4',
    'exe', 'dll', 'so', 'dylib', 'wasm',
    'class', 'jar', 'war', 'ear',
    'pyc', 'pyo',
    'o', 'obj', 'lib', 'a', 'la',
    'iso', 'img', 'dmg', 'deb', 'rpm', 'msi', 'pkg',
    'db', 'sqlite', 'sqlite3',
    'bin', 'dat',
  ]);
  return binaryExts.has(ext);
}

export function isHtmlFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['html', 'htm'].includes(ext);
}

export function isCsvFile(filePath) {
  return filePath && filePath.toLowerCase().endsWith('.csv');
}

// ==================== HTML 工具 ====================

/** 转义 HTML 特殊字符 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 更新全局底部状态栏的右侧文本 */
export function updateStatusbarText(text) {
  const el = document.getElementById('statusbarRight');
  if (el) el.textContent = text;
}
