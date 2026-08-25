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

///** 最大化状态变化回调（缓存一个，避免累加监听器） */
let _maximizedCallback = null;
ipcRenderer.on('window:maximized-changed', (_event, maximized) => {
  if (_maximizedCallback) _maximizedCallback(maximized);
});

/** 更新事件回调缓存 */
let _updateCallbacks = {};

ipcRenderer.on('update:checking', () => {
  _updateCallbacks.onChecking?.();
});
ipcRenderer.on('update:available', (_event, info) => {
  _updateCallbacks.onAvailable?.(info);
});
ipcRenderer.on('update:not-available', (_event, info) => {
  _updateCallbacks.onNotAvailable?.(info);
});
ipcRenderer.on('update:error', (_event, msg) => {
  _updateCallbacks.onError?.(msg);
});
ipcRenderer.on('update:download-progress', (_event, progress) => {
  _updateCallbacks.onDownloadProgress?.(progress);
});
ipcRenderer.on('update:downloaded', (_event, info) => {
  _updateCallbacks.onDownloaded?.(info);
});

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

  // 最大化状态变化事件（替代轮询）
  onMaximizedChanged: (callback) => { _maximizedCallback = callback; },
  removeMaximizedChangedListener: () => { _maximizedCallback = null; },

  // ===== 文件操作 =====
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  readFileBase64: (path) => ipcRenderer.invoke('fs:readFileBase64', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', path),
  createDir: (path) => ipcRenderer.invoke('fs:createDir', path),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFile: (path) => ipcRenderer.invoke('fs:deleteFile', path),
  showItemInFolder: (path) => ipcRenderer.invoke('fs:showItemInFolder', path),
  isDirectory: (path) => ipcRenderer.invoke('fs:isDirectory', path),

  // ===== 对话框 =====
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openImageDialog: () => ipcRenderer.invoke('dialog:openImage'),
  saveFileDialog: (content, suggestedName, mimeType) =>
    ipcRenderer.invoke('dialog:saveFile', content, suggestedName, mimeType),

  // ===== 外部链接 =====
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ===== DevTools =====
  openDevTools: () => ipcRenderer.send('devtools:open'),

  // ===== 终端 =====
  openTerminal: (path) => ipcRenderer.invoke('terminal:open', path),

  // ===== 自动更新 =====
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  cancelUpdate: () => ipcRenderer.invoke('update:cancel'),
  quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  onUpdateChecking: (cb) => { _updateCallbacks.onChecking = cb; },
  onUpdateAvailable: (cb) => { _updateCallbacks.onAvailable = cb; },
  onUpdateNotAvailable: (cb) => { _updateCallbacks.onNotAvailable = cb; },
  onUpdateError: (cb) => { _updateCallbacks.onError = cb; },
  onUpdateDownloadProgress: (cb) => { _updateCallbacks.onDownloadProgress = cb; },
  onUpdateDownloaded: (cb) => { _updateCallbacks.onDownloaded = cb; },
  removeAllUpdateListeners: () => { _updateCallbacks = {}; },

  // ===== 原生通知 =====
  showNotification: (title, body, icon) =>
    ipcRenderer.invoke('notification:show', { title, body, icon }),

  // ===== 主题同步 =====
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),

  // ===== Splash 启动画面 =====
  splashRetry: () => ipcRenderer.invoke('splash:retry'),
});
