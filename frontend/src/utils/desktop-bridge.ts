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
  // ────────────────────────── 环境判断 ──────────────────────────

  /** 是否运行在桌面端(Electron / JCEF 注入过桥接 API) */
  get isDesktop(): boolean {
    return !!(window.electronAPI?.isElectron || window.HippoDesktop);
  },

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

  // ────────────────────────── 窗口控制(对齐旧版 desktop-bridge.js) ──────────────────────────

  /** 最小化窗口(仅桌面端有效) */
  minimizeWindow(): void {
    try {
      void window.electronAPI?.minimizeWindow?.();
    } catch (e) {
      console.warn('[desktopBridge] minimizeWindow 失败:', e);
    }
  },

  /** 最大化窗口 */
  maximizeWindow(): void {
    try {
      window.electronAPI?.maximizeWindow?.();
    } catch (e) {
      console.warn('[desktopBridge] maximizeWindow 失败:', e);
    }
  },

  /** 还原窗口 */
  restoreWindow(): void {
    try {
      window.electronAPI?.restoreWindow?.();
    } catch (e) {
      console.warn('[desktopBridge] restoreWindow 失败:', e);
    }
  },

  /** 最大化 / 还原切换 */
  async toggleMaximize(): Promise<void> {
    try {
      await window.electronAPI?.toggleMaximize?.();
    } catch (e) {
      console.warn('[desktopBridge] toggleMaximize 失败:', e);
    }
  },

  /** 关闭窗口 */
  closeWindow(): void {
    try {
      void window.electronAPI?.closeWindow?.();
    } catch (e) {
      console.warn('[desktopBridge] closeWindow 失败:', e);
    }
  },

  /** 查询当前是否最大化 */
  async isMaximized(): Promise<boolean> {
    try {
      const v = await window.electronAPI?.isMaximized?.();
      return v === true;
    } catch (e) {
      console.warn('[desktopBridge] isMaximized 失败:', e);
      return false;
    }
  },

  /**
   * 订阅最大化状态变化(替代轮询)。
   * @returns 取消订阅函数
   */
  onMaximizedChanged(callback: (maximized: boolean) => void): () => void {
    try {
      window.electronAPI?.onMaximizedChanged?.(callback);
    } catch (e) {
      console.warn('[desktopBridge] onMaximizedChanged 失败:', e);
    }
    return () => {
      try {
        window.electronAPI?.removeMaximizedChangedListener?.();
      } catch {
        /* 忽略 */
      }
    };
  },

  // ────────────────────────── 对话框 ──────────────────────────

  /** 打开系统文件夹选择对话框(仅桌面端有效) */
  async openFileDialog(): Promise<string | null> {
    try {
      const result = await window.electronAPI?.openFileDialog?.();
      return result?.path ?? null;
    } catch (e) {
      console.warn('[desktopBridge] openFileDialog 失败:', e);
      return null;
    }
  },

  // ────────────────────────── DevTools ──────────────────────────

  /** 打开 DevTools(仅桌面端有效) */
  openDevTools(): void {
    try {
      window.electronAPI?.openDevTools?.();
    } catch (e) {
      console.warn('[desktopBridge] openDevTools 失败:', e);
    }
  },

  // ────────────────────────── 主题同步 ──────────────────────────

  /** 读取桌面端主题(Electron 侧 splash 与主窗口保持一致) */
  async getTheme(): Promise<'dark' | 'light' | 'midnight' | null> {
    try {
      const t = await window.electronAPI?.getTheme?.();
      if (t === 'dark' || t === 'light' || t === 'midnight') return t;
      return null;
    } catch (e) {
      console.warn('[desktopBridge] getTheme 失败:', e);
      return null;
    }
  },

  /** 同步主题到桌面端 */
  async setTheme(theme: string): Promise<void> {
    try {
      await window.electronAPI?.setTheme?.(theme);
    } catch (e) {
      console.warn('[desktopBridge] setTheme 失败:', e);
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
