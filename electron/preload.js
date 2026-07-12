/**
 * Hippo Buddy Desktop — Preload Script
 *
 * 通过 contextBridge 在主进程和渲染进程之间建立安全的 IPC 桥梁。
 * contextIsolation: true 下，渲染进程无法直接访问 Node.js API。
 *
 * 对应 JCEF 6 个 Bridge Handler 的 Electron IPC 替代：
 *   WindowHandler     →  window:*         ✅
 *   DialogHandler     →  dialog:*         ✅
 *   ExternalLinkHandler → shell:*        ✅
 *   DevToolsHandler   →  devtools:*      ✅
 *   FileHandler       →  fs:*            ✅
 *   TerminalHandler   →  terminal:*      ✅
 *   ConfigHandler     →  迁至 HTTP API（Phase 3）
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ===== 环境信息 =====
  platform: process.platform,
  isElectron: true,

  // ===== 窗口控制 =====
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximizeOnly'),
  restoreWindow: () => ipcRenderer.send('window:restore'),
  toggleMaximize: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getWindowState: () => ipcRenderer.invoke('window:getState'),

  // ===== 文件操作 =====
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', path),
  createDir: (path) => ipcRenderer.invoke('fs:createDir', path),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFile: (path) => ipcRenderer.invoke('fs:deleteFile', path),
  showItemInFolder: (path) => ipcRenderer.invoke('fs:showItemInFolder', path),
  isDirectory: (path) => ipcRenderer.invoke('fs:isDirectory', path),

  // ===== 对话框 =====
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (content, suggestedName, mimeType) =>
    ipcRenderer.invoke('dialog:saveFile', content, suggestedName, mimeType),

  // ===== 外部链接 =====
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ===== DevTools =====
  openDevTools: () => ipcRenderer.send('devtools:open'),

  // ===== 终端 =====
  openTerminal: (path) => ipcRenderer.invoke('terminal:open', path),
});
