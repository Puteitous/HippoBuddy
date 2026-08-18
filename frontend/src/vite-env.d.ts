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
    readFile?: (path: string) => Promise<string | null>;
    writeFile?: (path: string, content: string) => Promise<boolean>;
    createFile?: (path: string) => Promise<boolean>;
    createDir?: (path: string) => Promise<boolean>;
    rename?: (oldPath: string, newPath: string) => Promise<boolean>;
    deleteFile?: (path: string) => Promise<boolean>;
    showItemInFolder?: (path: string) => Promise<void>;
    isDirectory?: (path: string) => Promise<boolean>;
    openExternal?: (url: string) => Promise<void>;
    openTerminal?: (path: string) => Promise<void>;
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
