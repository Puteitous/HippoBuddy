/**
 * 文件预览滚动位置持久化(对齐旧版 FilePreview.js 的 `hippo-scroll-positions`)。
 *
 * 存储结构:`{ [filePath]: { line, offset } | number }`
 *   - `{ line, offset }`:按行号 + 行内像素偏移定位(内容变化后仍可还原,新版格式)
 *   - `number`:旧版纯 scrollTop 像素格式(兼容读取旧版已存数据)
 *
 * 读写逻辑集中在此,供 FilePreviewEditor(恢复/保存)与 previewStore(关闭标签清除)共用。
 */
export type SavedScrollPosition = { line: number; offset: number } | number;

const STORAGE_KEY = 'hippo-scroll-positions';

/** 读取指定文件的滚动位置;无记录或格式非法返回 null */
export function readScrollPosition(filePath: string): SavedScrollPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const val = map[filePath];
    if (typeof val === 'number' && val > 0) return val;
    if (val && typeof val === 'object') {
      const v = val as { line?: unknown; offset?: unknown };
      if (typeof v.line === 'number' && v.line > 0) {
        return { line: v.line, offset: typeof v.offset === 'number' ? v.offset : 0 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** 写入指定文件的滚动位置 */
export function writeScrollPosition(filePath: string, pos: SavedScrollPosition): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    map[filePath] = pos;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 清除指定文件的滚动位置(关闭标签时调用,重新打开从顶部开始) */
export function clearScrollPosition(filePath: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (filePath in map) {
      delete map[filePath];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    /* ignore */
  }
}
