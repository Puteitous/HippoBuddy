/**
 * shared.ts — binary-preview 共用工具(文件类型检测)
 *
 * 从旧版 binary-preview/shared.js 精简:仅保留 Office 三件套检测,
 * 图片/PDF 已由 FilePreview 处理,HTML 预览留 3.8。
 */

export function isDocxFile(filePath: string | null | undefined): boolean {
  return !!filePath && filePath.toLowerCase().endsWith('.docx');
}

export function isPptxFile(filePath: string | null | undefined): boolean {
  return !!filePath && filePath.toLowerCase().endsWith('.pptx');
}

export function isXlsxFile(filePath: string | null | undefined): boolean {
  return !!filePath && filePath.toLowerCase().endsWith('.xlsx');
}

export function isXlsFile(filePath: string | null | undefined): boolean {
  return !!filePath && filePath.toLowerCase().endsWith('.xls');
}
