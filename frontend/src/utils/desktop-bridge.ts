/**
 * 桌面端桥接(Electron / JCEF / 浏览器 dev 三环境统一调用面)
 *
 * 把所有桌面端注入的全局 API 调用集中到一处,便于:
 *  - 在浏览器 dev 环境下安全降级(全局未注入时返回 noop / null)
 *  - 屏蔽 Electron(electronAPI)与 JCEF(HippoDesktop)的命名空间差异
 *  - 后续 3.7 接入更多组件时在此统一扩展
 *
 * 注:全局 Window 类型声明见 `src/vite-env.d.ts`,此处不再重复声明。
 *
 * 优先级:electronAPI(Electron) > HippoDesktop(旧 JCEF) > 浏览器 noop / null。
 */

/** 在浏览器环境或后端未注入时安全降级 */
export const desktopBridge = {
  // ────────────────────────── 导航 / 链接 ──────────────────────────

  /** 跳转到文件(在 Electron 桌面端打开编辑器定位) */
  navigateToFile(path: string, startLine?: number, endLine?: number): void {
    try {
      window.HippoWorkspace?.navigateToFile?.(path, startLine, endLine);
    } catch (e) {
      console.warn('[desktopBridge] navigateToFile 失败:', e);
    }
  },

  /** 打开外部链接 */
  openExternal(url: string): void {
    try {
      if (window.electronAPI?.openExternal) {
        void window.electronAPI.openExternal(url);
        return;
      }
      if (window.HippoWorkspace?.openExternal) {
        window.HippoWorkspace.openExternal(url);
        return;
      }
      // dev 环境降级:浏览器新开标签页
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('[desktopBridge] openExternal 失败:', e);
    }
  },

  /** 获取当前工作区根路径(未注入时返回空串) */
  getCurrentPath(): string {
    return window.HippoWorkspace?.currentPath ?? '';
  },

  // ────────────────────────── 文件系统 ──────────────────────────

  /**
   * 读取目录条目
   * @param dirPath 目录绝对路径
   * @returns 条目数组;无注入 / 失败 / 非目录时返回 null
   */
  async readDir(dirPath: string): Promise<DirEntry[] | null> {
    try {
      if (window.electronAPI?.readDir) {
        const result = await window.electronAPI.readDir(dirPath);
        return result?.entries ?? null;
      }
      if (window.HippoDesktop?.readDir) {
        const result = await window.HippoDesktop.readDir(dirPath);
        return result?.entries ?? null;
      }
      return null;
    } catch (e) {
      console.warn('[desktopBridge] readDir 失败:', e);
      return null;
    }
  },

  /**
   * 读取文本文件内容
   * @param filePath 文件绝对路径
   * @returns 文本内容;无注入 / 失败时返回 null
   */
  async readFile(filePath: string): Promise<string | null> {
    try {
      if (window.electronAPI?.readFile) {
        return await window.electronAPI.readFile(filePath);
      }
      if (window.HippoDesktop?.readFile) {
        return await window.HippoDesktop.readFile(filePath);
      }
      return null;
    } catch (e) {
      console.warn('[desktopBridge] readFile 失败:', e);
      return null;
    }
  },

  /**
   * 判断路径是否为目录
   * @returns true=目录;false=文件或不存在;无注入时返回 false
   */
  async isDirectory(path: string): Promise<boolean> {
    try {
      if (window.electronAPI?.isDirectory) {
        return await window.electronAPI.isDirectory(path);
      }
      if (window.HippoDesktop?.isDirectory) {
        return await window.HippoDesktop.isDirectory(path);
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] isDirectory 失败:', e);
      return false;
    }
  },

  /** 在系统资源管理器中显示文件 */
  async showItemInFolder(path: string): Promise<void> {
    try {
      await window.electronAPI?.showItemInFolder?.(path);
      await window.HippoDesktop?.showItemInFolder?.(path);
    } catch (e) {
      console.warn('[desktopBridge] showItemInFolder 失败:', e);
    }
  },
};

/**
 * 把工作区绝对路径精简为相对路径,便于在卡片中显示。
 * 若路径不以根路径开头,原样返回。
 */
export function toRelativePath(absPath: string): string {
  if (!absPath) return '';
  const root = desktopBridge.getCurrentPath();
  if (!root) return absPath;
  const normRoot = root.replace(/\\/g, '/') + '/';
  const normPath = absPath.replace(/\\/g, '/');
  if (normPath.startsWith(normRoot)) {
    return normPath.slice(normRoot.length);
  }
  return absPath;
}
