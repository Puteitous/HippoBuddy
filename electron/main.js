/**
 * Hippo Buddy Desktop — Electron 主进程
 *
 * 加载 Java 后端 DashboardServer 提供的 Web UI，替代 JCEF 成为桌面壳。
 *
 * 启动方式：
 *   cd electron && npm start
 *
 * 环境变量：
 *   HIPPO_PORT  — Java 后端端口（默认 9090）
 *
 * Phase 1：基本窗口 + IPC 框架
 * Phase 2：迁移所有 JCEF Bridge Handler 到 Electron IPC
 * Phase 3：移除 JCEF 代码
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { spawn, exec } = require('child_process');
const { autoUpdater } = require('electron-updater');

const PORT = parseInt(process.env.HIPPO_PORT || '9090', 10);
const DEV = process.argv.includes('--dev');

let mainWindow = null;
let backendProcess = null;
let tray = null;

// ============================================================================
// 窗口状态持久化
// ============================================================================

const STATE_FILE = 'window-state.json';

function getStatePath() {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function loadWindowState() {
  try {
    const data = fs.readFileSync(getStatePath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** 保存窗口状态（防抖） */
let _saveTimer = null;
function saveWindowState() {
  if (!mainWindow) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const maximized = mainWindow.isMaximized();
      const bounds = mainWindow.getBounds();
      const state = { maximized, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      fs.mkdirSync(path.dirname(getStatePath()), { recursive: true });
      fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8');
    } catch { /* 静默忽略 */ }
  }, 300);
}

// ============================================================================
// Java 后端进程管理
// ============================================================================

function startBackend() {
  return new Promise((resolve, reject) => {
    // 优先查找已运行的进程（用户手动启动的情况）
    const http = require('http');
    const req = http.get(`http://localhost:${PORT}/cockpit`, (res) => {
      if (res.statusCode === 200) {
        console.log('[backend] Backend already running');
        resolve();
      } else {
        reject(new Error('后端异常'));
      }
    });
    req.on('error', () => {
      // 未运行 → 自启
      launchBackend(resolve, reject);
    });
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('超时')); });
  });
}

function launchBackend(resolve, reject) {
  if (app.isPackaged) {
    launchPackagedBackend(resolve, reject);
  } else {
    launchDevBackend(resolve, reject);
  }
}

/** 开发模式：用 Maven 编译 + 执行 */
function launchDevBackend(resolve, reject) {
  const isWin = process.platform === 'win32';
  const mvnCmd = isWin ? 'mvn.cmd' : 'mvn';
  const cwd = path.resolve(__dirname, '..');

  const proc = spawn(mvnCmd, [
    'compile', 'exec:java',
    '-Dexec.mainClass=com.example.agent.DesktopApplication',
  ], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: isWin, // Windows 上 .cmd 文件需要 shell
  });

  attachBackendHandlers(proc, resolve, reject);
}

/** 生产模式：用打包的 JRE / 系统 Java 执行 JAR */
function launchPackagedBackend(resolve, reject) {
  const resourcesPath = process.resourcesPath;
  const jarPath = path.join(resourcesPath, 'hippo-agent.jar');
  const mainClass = 'com.example.agent.DesktopApplication';

  // 优先使用内置 JRE，其次系统 Java
  const bundledJava = path.join(resourcesPath, 'jre', 'bin',
    process.platform === 'win32' ? 'java.exe' : 'java');
  const javaCmd = fs.existsSync(bundledJava) ? bundledJava
    : (process.platform === 'win32' ? 'java.exe' : 'java');

  if (!fs.existsSync(jarPath)) {
    reject(new Error(`JAR 文件不存在: ${jarPath}`));
    return;
  }

  const proc = spawn(javaCmd, ['-cp', jarPath, mainClass], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  attachBackendHandlers(proc, resolve, reject);
}

/** 后端进程的通用输出/退出处理 */
function attachBackendHandlers(proc, resolve, reject) {
  backendProcess = proc;
  console.log(`[backend] Starting Java backend (PID=${proc.pid})`);

  let resolved = false;

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(`[backend:out] ${text}`);
    if (!resolved && (text.includes('HTTP Server 已就绪') || text.includes('Hippo Cockpit'))) {
      resolved = true;
      console.log('[backend] Backend ready');
      resolve();
    }
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[backend:err] ${data}`);
  });

  proc.on('error', (err) => {
    console.error('[backend] Launch failed:', err.message);
    if (!resolved) { resolved = true; reject(err); }
  });

  proc.on('exit', (code) => {
    console.log(`[backend] Process exited (code=${code})`);
    backendProcess = null;
    if (!resolved) { resolved = true; reject(new Error(`后端退出 code=${code}`)); }
  });
}

function stopBackend() {
  if (!backendProcess) return;

  const pid = backendProcess.pid;
  console.log(`[backend] Stopping Java backend (PID=${pid})`);

  if (process.platform === 'win32') {
    // Windows: 用 spawnSync 确保 taskkill 完成后再退出
    require('child_process').spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try { backendProcess.kill('SIGTERM'); } catch { /* 忽略 */ }
  }

  backendProcess = null;
}

// ============================================================================
// 窗口创建
// ============================================================================

function createWindow() {
  // 恢复上次窗口状态
  const savedState = loadWindowState();
  const windowOptions = {
    width: savedState?.width || 1280,
    height: savedState?.height || 800,
    minWidth: 800,
    minHeight: 500,
    x: savedState?.x,
    y: savedState?.y,
    frame: false,
    backgroundColor: '#edeff2',
    show: false,
    icon: path.join(__dirname, 'assets', 'icon2.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

  // 若上次是最大化状态，窗口创建后最大化
  if (savedState?.maximized) {
    mainWindow.maximize();
  }

  const url = `http://localhost:${PORT}/cockpit`;
  console.log(`[main] Loading: ${url}`);

  if (DEV) {
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    tryLoadWithRetry(url);
  }

  // ready-to-show 时正常显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 兜底：5 秒后无论后端是否就绪都显示窗口（避免窗口创建后一直 hidden）
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[main] Fallback: showing window (backend may not be ready yet, retrying)');
      mainWindow.show();
    }
  }, 5000);

  // 最大化/还原状态 → 推送到渲染进程（替代轮询）
  mainWindow.on('maximize', () => {
    saveWindowState();
    mainWindow.webContents.send('window:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    saveWindowState();
    mainWindow.webContents.send('window:maximized-changed', false);
  });

  // 窗口移动/缩放 → 持久化
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  // 关闭前保存状态
  mainWindow.on('close', saveWindowState);

  // 外部链接 → 系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 配置自动更新
  setupAutoUpdater();
}

/** 带重试的后端连接 */
function tryLoadWithRetry(url, retries = 60) {
  mainWindow.loadURL(url).catch(() => {
    if (retries > 0) {
      console.log(`[main] Waiting for backend... (${retries} retries left)`);
      setTimeout(() => tryLoadWithRetry(url, retries - 1), 1000);
    } else {
      console.error(`[main] Backend connection failed: ${url}`);
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,` +
        `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#edeff2">` +
        `<div style="text-align:center"><h2>无法连接到后端服务</h2>` +
        `<p>请确保 Java 后端已启动</p>` +
        `<p style="color:#888">${url}</p></div></body></html>`
      );
      mainWindow.show();
    }
  });
}

// ============================================================================
// IPC Handlers
// ============================================================================

// ---------- 窗口控制 ----------

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximizeOnly', () => {
  if (mainWindow && !mainWindow.isMaximized()) mainWindow.maximize();
});

ipcMain.on('window:restore', () => {
  if (mainWindow && mainWindow.isMaximized()) mainWindow.unmaximize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) {
    // 最小化到托盘而不是关闭
    mainWindow.hide();
  }
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ---------- DevTools ----------

ipcMain.handle('window:getState', () => {
  if (!mainWindow) return null;
  const bounds = mainWindow.getBounds();
  return {
    maximized: mainWindow.isMaximized(),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
});

// ---------- 文件操作 ----------

/** 读取目录内容，排序：目录在前，文件在后，按名称字母序 */
ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  const dir = path.resolve(dirPath);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const result = entries
    .map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  // 获取文件大小（目录大小为 0）
  const withSizes = await Promise.all(
    result.map(async (entry) => {
      let size = 0;
      if (!entry.isDirectory) {
        try {
          size = (await fs.promises.stat(path.join(dir, entry.name))).size;
        } catch { /* 忽略 */ }
      }
      return { ...entry, size };
    })
  );

  return { path: dirPath, entries: withSizes };
});

/** 读取文件内容，直接返回 UTF-8 文本（Electron IPC 原生支持 unicode） */
ipcMain.handle('fs:readFile', async (_event, filePath) => {
  const file = path.resolve(filePath);
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  const content = await fs.promises.readFile(file, 'utf-8');
  return {
    path: filePath,
    content,
  };
});

/** 写入文件内容 */
ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  const file = path.resolve(filePath);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content, 'utf-8');
  const stat = await fs.promises.stat(file);
  return { path: filePath, size: stat.size };
});

/** 创建空文件 */
ipcMain.handle('fs:createFile', async (_event, filePath) => {
  const file = path.resolve(filePath);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, '', 'utf-8');
  return { path: filePath };
});

/** 创建目录 */
ipcMain.handle('fs:createDir', async (_event, dirPath) => {
  const dir = path.resolve(dirPath);
  await fs.promises.mkdir(dir, { recursive: true });
  return { path: dirPath };
});

/** 重命名/移动 */
ipcMain.handle('fs:rename', async (_event, oldPath, newPath) => {
  const source = path.resolve(oldPath);
  const target = path.resolve(newPath);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.rename(source, target);
  return { oldPath, newPath };
});

/** 删除文件（移入回收站） */
ipcMain.handle('fs:deleteFile', async (_event, filePath) => {
  const target = path.resolve(filePath);
  await shell.trashItem(target);
  return { path: filePath };
});

/** 在文件管理器中显示 */
ipcMain.handle('fs:showItemInFolder', async (_event, filePath) => {
  shell.showItemInFolder(path.resolve(filePath));
  return {};
});

/** 检查路径是否为目录 */
ipcMain.handle('fs:isDirectory', async (_event, filePath) => {
  try {
    const stat = await fs.promises.stat(path.resolve(filePath));
    return { exists: true, isDirectory: stat.isDirectory() };
  } catch {
    return { exists: false, isDirectory: false };
  }
});

// ---------- 对话框 ----------

/** 打开文件夹选择对话框 */
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择工作区文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { path: null };
  }
  return { path: result.filePaths[0] };
});

/** 保存文件对话框 — 接收 base64 内容，弹出系统另存为对话框后写入文件 */
ipcMain.handle('dialog:saveFile', async (_event, content, suggestedName, mimeType) => {
  if (!content) return { path: null, error: '内容为空' };

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存文件',
    defaultPath: suggestedName,
  });

  if (result.canceled || !result.filePath) {
    return { path: null };
  }

  let filePath = result.filePath;

  // 确保扩展名正确
  if (suggestedName.includes('.')) {
    const expectedExt = suggestedName.slice(suggestedName.lastIndexOf('.'));
    if (!filePath.toLowerCase().endsWith(expectedExt.toLowerCase())) {
      filePath += expectedExt;
    }
  }

  const bytes = Buffer.from(content, 'base64');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, bytes);

  return { path: filePath, size: bytes.length };
});

// ---------- 外部链接 ----------

ipcMain.handle('shell:openExternal', async (_event, url) => {
  // 支持 file:// 协议和 http/https
  if (url.startsWith('file://')) {
    const filePath = fileURLToPath(url);
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const err = await shell.openPath(filePath);
    if (err) throw new Error(err);
    return {};
  } else {
    shell.openExternal(url);
    return {};
  }
});

// ---------- DevTools ----------

ipcMain.on('devtools:open', () => {
  if (mainWindow) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
});

// ---------- 终端 ----------

/** 在系统原生终端中打开指定目录，跨平台支持 */
ipcMain.handle('terminal:open', async (_event, dirPath) => {
  const cwd = dirPath && fs.existsSync(dirPath)
    ? path.resolve(dirPath)
    : process.env.USERPROFILE || process.env.HOME || __dirname;

  const platform = process.platform;

  if (platform === 'win32') {
    // Windows: cmd.exe 新窗口，cd 到目标目录
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}"`], {
      detached: true,
      stdio: 'ignore',
    });
  } else if (platform === 'darwin') {
    // macOS: Terminal.app
    spawn('open', ['-a', 'Terminal', cwd], {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    // Linux: 依次探测 gnome-terminal / konsole / xterm
    const terminals = [
      { cmd: 'gnome-terminal', args: ['--working-directory=', cwd].join('') },
      { cmd: 'konsole', args: ['--workdir', cwd] },
      { cmd: 'xterm', args: ['-e', `cd "${cwd}" && exec $SHELL -i`] },
    ];

    let launched = false;
    for (const t of terminals) {
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn(t.cmd, t.args instanceof Array ? t.args : [t.args], {
            detached: true,
            stdio: 'ignore',
          });
          proc.on('error', reject);
          proc.unref();
          // 成功启动后短时间内没有 error 就认为成功了
          setTimeout(resolve, 200);
        });
        launched = true;
        break;
      } catch {
        continue;
      }
    }

    if (!launched) {
      throw new Error('未找到可用的 Linux 终端模拟器');
    }
  }

  return {};
});

// ============================================================================
// 系统托盘
// ============================================================================

/** 创建系统托盘图标 */
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon2.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  }
  // fallback: 32×32 蓝色圆形
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        buf[offset] = 0x4F; buf[offset + 1] = 0x7C; buf[offset + 2] = 0xFF; buf[offset + 3] = 0xFF;
      } else {
        buf[offset + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  if (tray) return;

  tray = new Tray(createTrayIcon());
  tray.setToolTip('HippoBuddy');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: '检查更新',
      click: () => {
        mainWindow?.webContents.send('update:checking');
        autoUpdater.checkForUpdates();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 左键单击切换窗口可见性（需检查窗口是否已销毁）
  tray.on('click', () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    if (win?.isVisible()) {
      win.hide();
    } else {
      win?.show();
      win?.focus();
    }
  });
}

// ============================================================================
// 原生通知
// ============================================================================

ipcMain.handle('notification:show', async (_event, { title, body, icon }) => {
  if (!Notification.isSupported()) return { success: false, reason: '不支持通知' };
  const notif = new Notification({
    title: title || 'HippoBuddy',
    body: body || '',
    icon: icon || undefined,
  });
  notif.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  notif.show();
  return { success: true };
});

// ============================================================================
// 自动更新
// ============================================================================

/** 配置 autoUpdater（生产模式才启用） */
function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[updater] Dev mode, skipping auto-update');
    return;
  }

  // 日志
  autoUpdater.logger = console;
  autoUpdater.autoDownload = false; // 先通知用户，由用户决定是否下载
  autoUpdater.allowPrerelease = false;

  // ----- 事件监听 -----

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates…');
    mainWindow?.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] New version available:', info.version);
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] Already up to date:', info.version);
    mainWindow?.webContents.send('update:not-available', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Update check error:', err.message);
    mainWindow?.webContents.send('update:error', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      total: progress.total,
      transferred: progress.transferred,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] New version downloaded:', info.version);
    mainWindow?.webContents.send('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
    // 系统通知
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: '更新已就绪',
        body: `HippoBuddy ${info.version} 已下载完成，点击安装并重启。`,
      });
      notif.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('update:downloaded', {
          version: info.version,
          releaseNotes: info.releaseNotes,
        });
      });
      notif.show();
    }
  });
}

// ---------- IPC: 更新控制 ----------

ipcMain.handle('update:check', async () => {
  try {
    autoUpdater.checkForUpdates();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update:download', async () => {
  try {
    autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update:quitAndInstall', async () => {
  setImmediate(() => autoUpdater.quitAndInstall());
  return { success: true };
});

// ============================================================================
// 应用生命周期
// ============================================================================

app.whenReady().then(() => {
  // 1. 后台启动 Java 后端（不阻塞窗口创建）
  startBackend().catch(err => {
    console.error('[main] Backend launch failed:', err.message);
  });
  // 2. 立即创建窗口（tryLoadWithRetry 会在后台等后端就绪）
  createWindow();
  // 3. 创建系统托盘
  createTray();
});

app.on('window-all-closed', () => {
  // 有托盘时保留在后台，不退出
  if (!tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  stopBackend();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
});
