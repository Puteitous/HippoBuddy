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

import { useAppStore } from '@/stores/appStore';

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

  /** 获取当前工作区根路径
   *  优先读 HippoWorkspace.currentPath(旧版注入);新版走 appStore.workspacePath(workspaceApi 拉取的可靠根),保证
   *  toRelativePath 等依赖能正确精简为相对路径。 */
  getCurrentPath(): string {
    return window.HippoWorkspace?.currentPath || useAppStore.getState().workspacePath || '';
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
        const result = await window.electronAPI.readFile(filePath);
        // Electron 封装返回 { path, content } 对象,归一化为纯文本(与 JCEF 一致)
        if (result && typeof result === 'object' && 'content' in result) {
          return typeof result.content === 'string' ? result.content : null;
        }
        return typeof result === 'string' ? result : null;
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
   * 写文本文件内容(对齐旧版 writeFile,供编辑器保存使用)
   * @param filePath 文件绝对路径
   * @param content 写入的文本内容
   * @returns 是否写入成功;无注入 / 失败时返回 false
   */
  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      // 成功返回 true 或 { path, size } 等非 error 对象;仅带 error 标记时才算失败
      if (window.electronAPI?.writeFile) {
        const result = await window.electronAPI.writeFile(filePath, content);
        return !(result && typeof result === 'object' && result.error);
      }
      if (window.HippoDesktop?.writeFile) {
        const result = await window.HippoDesktop.writeFile(filePath, content);
        return !(result && typeof result === 'object' && (result as Record<string, unknown>).error);
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] writeFile 失败:', e);
      return false;
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

  /** 创建空文件(对齐旧版 createFile) */
  async createFile(path: string): Promise<boolean> {
    try {
      if (window.electronAPI?.createFile) {
        await window.electronAPI.createFile(path);
        return true;
      }
      if (window.HippoDesktop?.createFile) {
        await window.HippoDesktop.createFile(path);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] createFile 失败:', e);
      return false;
    }
  },

  /** 创建文件夹(对齐旧版 createDir) */
  async createDir(path: string): Promise<boolean> {
    try {
      if (window.electronAPI?.createDir) {
        await window.electronAPI.createDir(path);
        return true;
      }
      if (window.HippoDesktop?.createDir) {
        await window.HippoDesktop.createDir(path);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] createDir 失败:', e);
      return false;
    }
  },

  /** 移动 / 重命名文件或文件夹(对齐旧版 rename) */
  async rename(oldPath: string, newPath: string): Promise<boolean> {
    try {
      // electron/HippoDesktop 的 rename 成功时返回结果对象而非 true,失败时抛异常;
      // 因此以「未抛错」判定成功,不能与 === true 比较。
      if (window.electronAPI?.rename) {
        await window.electronAPI.rename(oldPath, newPath);
        return true;
      }
      if (window.HippoDesktop?.rename) {
        await window.HippoDesktop.rename(oldPath, newPath);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] rename 失败:', e);
      return false;
    }
  },

  /** 删除文件或文件夹(对齐旧版 deleteFile) */
  async deleteFile(path: string): Promise<boolean> {
    try {
      if (window.electronAPI?.deleteFile) {
        await window.electronAPI.deleteFile(path);
        return true;
      }
      if (window.HippoDesktop?.deleteFile) {
        await window.HippoDesktop.deleteFile(path);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[desktopBridge] deleteFile 失败:', e);
      return false;
    }
  },

  /** 在终端中打开指定目录(对齐旧版 openTerminal) */
  async openTerminal(path: string): Promise<void> {
    try {
      await window.electronAPI?.openTerminal?.(path);
      await window.HippoDesktop?.openTerminal?.(path);
    } catch (e) {
      console.warn('[desktopBridge] openTerminal 失败:', e);
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

  /** 打开系统图片选择对话框(自定义背景用,仅桌面端有效) */
  async openImageDialog(): Promise<string | null> {
    try {
      const result = await window.electronAPI?.openImageDialog?.();
      return result?.path ?? null;
    } catch (e) {
      console.warn('[desktopBridge] openImageDialog 失败:', e);
      return null;
    }
  },

  /** 读取图片文件为 base64 data URL(自定义背景用) */
  async readImageAsDataUrl(filePath: string): Promise<string | null> {
    try {
      const result = await window.electronAPI?.readFileBase64?.(filePath);
      if (result && typeof result === 'object' && 'dataUrl' in result) {
        return typeof result.dataUrl === 'string' ? result.dataUrl : null;
      }
      return null;
    } catch (e) {
      console.warn('[desktopBridge] readImageAsDataUrl 失败:', e);
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

  // ────────────────────────── 自动更新 ──────────────────────────

  /** 手动检查更新(仅桌面端有效;非桌面端返回 { success: false }) */
  async checkForUpdates(): Promise<{ success: boolean; error?: string }> {
    try {
      if (window.electronAPI?.checkForUpdates) {
        const r = await window.electronAPI.checkForUpdates();
        if (r?.success) return { success: true };
        return { success: false, error: r?.error };
      }
      return { success: false };
    } catch (e) {
      console.warn('[desktopBridge] checkForUpdates 失败:', e);
      return { success: false, error: String(e) };
    }
  },

  /** 开始下载更新(仅桌面端有效) */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      if (window.electronAPI?.downloadUpdate) {
        const r = await window.electronAPI.downloadUpdate();
        if (r?.success) return { success: true };
        return { success: false, error: r?.error };
      }
      return { success: false };
    } catch (e) {
      console.warn('[desktopBridge] downloadUpdate 失败:', e);
      return { success: false, error: String(e) };
    }
  },

  /** 取消下载中更新(仅桌面端有效) */
  async cancelUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      if (window.electronAPI?.cancelUpdate) {
        const r = await window.electronAPI.cancelUpdate();
        if (r?.success) return { success: true };
        return { success: false, error: r?.error };
      }
      return { success: false };
    } catch (e) {
      console.warn('[desktopBridge] cancelUpdate 失败:', e);
      return { success: false, error: String(e) };
    }
  },

  /** 退出并安装更新(仅桌面端有效) */
  async quitAndInstall(): Promise<{ success: boolean }> {
    try {
      const r = await window.electronAPI?.quitAndInstall?.();
      return { success: r?.success ?? true };
    } catch (e) {
      console.warn('[desktopBridge] quitAndInstall 失败:', e);
      return { success: false };
    }
  },

  /**
   * 注册自动更新事件监听回调(每个事件一次,重复调用会覆盖上一个回调)。
   * 返回取消订阅函数,便于组件卸载时清理。
   */
  onUpdateEvents(handlers: {
    onChecking?: () => void;
    onAvailable?: (info: UpdateInfo) => void;
    onNotAvailable?: (info?: UpdateInfo) => void;
    onError?: (msg: string) => void;
    onDownloadProgress?: (progress: UpdateProgress) => void;
    onDownloaded?: (info: UpdateInfo) => void;
  }): () => void {
    const api = window.electronAPI;
    if (!api) return () => {};
    try {
      if (handlers.onChecking) api.onUpdateChecking?.(handlers.onChecking);
      if (handlers.onAvailable) api.onUpdateAvailable?.(handlers.onAvailable);
      if (handlers.onNotAvailable) api.onUpdateNotAvailable?.(handlers.onNotAvailable);
      if (handlers.onError) api.onUpdateError?.(handlers.onError);
      if (handlers.onDownloadProgress) api.onUpdateDownloadProgress?.(handlers.onDownloadProgress);
      if (handlers.onDownloaded) api.onUpdateDownloaded?.(handlers.onDownloaded);
    } catch (e) {
      console.warn('[desktopBridge] onUpdateEvents 失败:', e);
    }
    return () => {
      try {
        api.removeAllUpdateListeners?.();
      } catch (e) {
        console.warn('[desktopBridge] removeAllUpdateListeners 失败:', e);
      }
    };
  },

  // ────────────────────────── 原生通知 ──────────────────────────

  /** 发送系统原生通知(仅桌面端有效;非桌面端返回 { success: false }) */
  async showNotification(title: string, body: string, icon?: string): Promise<{ success: boolean; reason?: string }> {
    try {
      if (window.electronAPI?.showNotification) {
        const r = await window.electronAPI.showNotification(title, body, icon);
        return { success: r?.success ?? false, reason: r?.reason };
      }
      return { success: false };
    } catch (e) {
      console.warn('[desktopBridge] showNotification 失败:', e);
      return { success: false, reason: String(e) };
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
