/// <reference types="vite/client" />

// ============================================================================
// 桌面端桥接全局 API 类型声明
//
// 实际注入的 namespace 因宿主而异:
//   - Electron 桌面端(electron/preload.js):window.electronAPI
//   - JCEF / Java 桌面端(旧 cockpit):window.HippoDesktop
//   - 浏览器 dev 环境:未注入,desktopBridge 内部降级为 noop / null
//
// desktopBridge.ts 把这三类差异收敛到统一调用面,业务代码只走 desktopBridge。
// ============================================================================

interface Window {
  // ── Electron 桌面端(electron/preload.js 注入) ──
  electronAPI?: {
    platform?: string;
    isElectron?: boolean;
    readDir?: (path: string) => Promise<DirEntryResult | null>;
    /** Electron 封装返回 { path, content } 对象(desktopBridge 内部归一化为纯文本) */
    readFile?: (path: string) => Promise<{ path?: string; content?: string; error?: boolean; code?: string; message?: string } | string | null>;
    /** 读取图片文件，返回 base64 data URL（自定义背景用） */
    readFileBase64?: (path: string) => Promise<{ dataUrl?: string; error?: boolean; code?: string; message?: string } | null>;
    /** Electron 封装返回 { path, size } 对象(desktopBridge 内部判定 error 标记) */
    writeFile?: (path: string, content: string) => Promise<{ path?: string; size?: number; error?: boolean; code?: string; message?: string }>;
    createFile?: (path: string) => Promise<boolean>;
    createDir?: (path: string) => Promise<boolean>;
    rename?: (oldPath: string, newPath: string) => Promise<boolean>;
    deleteFile?: (path: string) => Promise<boolean>;
    showItemInFolder?: (path: string) => Promise<void>;
    isDirectory?: (path: string) => Promise<boolean>;
    openExternal?: (url: string) => Promise<void>;
    openTerminal?: (path: string) => Promise<void>;

    // ── 窗口控制(对齐旧版 desktop-bridge.js 的 window:* IPC) ──
    minimizeWindow?: () => Promise<void>;
    maximizeWindow?: () => void;
    restoreWindow?: () => void;
    toggleMaximize?: () => Promise<boolean | void>;
    closeWindow?: () => Promise<void>;
    isMaximized?: () => Promise<boolean>;
    getWindowState?: () => Promise<{ maximized?: boolean } | null>;
    /** 最大化状态变化事件(替代轮询),重复订阅会覆盖上一个回调 */
    onMaximizedChanged?: (callback: (maximized: boolean) => void) => void;
    removeMaximizedChangedListener?: () => void;

    // ── 对话框 ──
    openFileDialog?: () => Promise<{ path?: string } | null>;
    openImageDialog?: () => Promise<{ path?: string } | null>;
    saveFileDialog?: (
      content: string,
      suggestedName?: string,
      mimeType?: string,
    ) => Promise<{ path?: string } | null>;

    // ── DevTools ──
    openDevTools?: () => void;

    // ── 自动更新(对齐 electron/preload.js 的 update:* IPC) ──
    checkForUpdates?: () => Promise<{ success?: boolean; error?: string }>;
    downloadUpdate?: () => Promise<{ success?: boolean; error?: string }>;
    cancelUpdate?: () => Promise<{ success?: boolean; error?: string }>;
    quitAndInstall?: () => Promise<{ success?: boolean }>;
    onUpdateChecking?: (cb: () => void) => void;
    onUpdateAvailable?: (cb: (info: UpdateInfo) => void) => void;
    onUpdateNotAvailable?: (cb: (info?: UpdateInfo) => void) => void;
    onUpdateError?: (cb: (msg: string) => void) => void;
    onUpdateDownloadProgress?: (cb: (progress: UpdateProgress) => void) => void;
    onUpdateDownloaded?: (cb: (info: UpdateInfo) => void) => void;
    removeAllUpdateListeners?: () => void;

    // ── 原生通知(对齐 electron/preload.js 的 notification:* IPC) ──
    showNotification?: (title: string, body: string, icon?: string) => Promise<{ success?: boolean; reason?: string }>;

    // ── 主题同步(Electron 侧 splash 保持一致) ──
    getTheme?: () => Promise<'dark' | 'light' | 'midnight'>;
    setTheme?: (theme: string) => Promise<void>;
  };

  // ── JCEF / Java 桌面端(旧 cockpit 注入) ──
  HippoDesktop?: {
    readDir?: (path: string) => Promise<DirEntryResult | null>;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, content: string) => Promise<boolean>;
    createFile?: (path: string) => Promise<boolean>;
    createDir?: (path: string) => Promise<boolean>;
    rename?: (oldPath: string, newPath: string) => Promise<boolean>;
    deleteFile?: (path: string) => Promise<boolean>;
    showItemInFolder?: (path: string) => Promise<void>;
    isDirectory?: (path: string) => Promise<boolean>;
    openTerminal?: (path: string) => Promise<void>;
  };

  // ── 新前端统一桥接入口(desktopBridge 优先消费 electronAPI/HippoDesktop) ──
  HippoWorkspace?: {
    navigateToFile?: (path: string, startLine?: number, endLine?: number) => void;
    openExternal?: (url: string) => void;
    /** 当前工作区根路径(用于把绝对路径精简为相对路径) */
    currentPath?: string;
  };

  // ── Mermaid 图表渲染(mermaid.ts 全局导出菜单关闭委托) ──
  __mermaidDocClickHandler?: (e: MouseEvent) => void;
}

/** desktopBridge.readDir 返回的目录条目结构(Electron / JCEF 一致) */
interface DirEntryResult {
  entries: DirEntry[];
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
  /** 文件大小(字节);目录可能不返回 */
  size?: number;
}

/** 自动更新信息(对齐 electron-updater 的 UpdateInfo) */
interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | { version: string; note: string }[] | null;
}

/** 下载进度(对齐 electron-updater 的 ProgressInfo) */
interface UpdateProgress {
  bytesPerSecond?: number;
  percent?: number;
  total?: number;
  transferred?: number;
}
