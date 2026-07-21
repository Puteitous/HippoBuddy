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

const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { spawn, exec } = require('child_process');
const { autoUpdater } = require('electron-updater');

// 设置 Windows AppUserModelID，让 Java 后端子进程归到同一任务栏分组下
if (process.platform === 'win32') {
  app.setAppUserModelId('HippoBuddy');
}

// 单实例锁：防止用户多次启动产生多个后端进程，导致端口冲突和启动卡死
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[main] Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 第二个实例被触发时，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

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
// 主题持久化（Electron splash 与前端共享主题偏好）
// ============================================================================

const THEME_FILE = 'theme.json';

function getThemePath() {
  return path.join(app.getPath('userData'), THEME_FILE);
}

function getSavedTheme() {
  try {
    const data = fs.readFileSync(getThemePath(), 'utf-8');
    const parsed = JSON.parse(data);
    if (parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'midnight') {
      return parsed.theme;
    }
  } catch { /* 文件不存在或解析失败 */ }
  // 回退到系统主题
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function saveTheme(theme) {
  try {
    fs.mkdirSync(path.dirname(getThemePath()), { recursive: true });
    fs.writeFileSync(getThemePath(), JSON.stringify({ theme }, null, 2), 'utf-8');
  } catch { /* 静默忽略 */ }
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
      // 未运行 → 先清理可能残留的后端进程，再自启
      killStaleBackend();

      // 整个后端启动流程加超时
      // 开发模式用 Maven 编译需要更长时间，生产模式直接启动 JAR 较快
      const LAUNCH_TIMEOUT = app.isPackaged ? 60_000 : 180_000;
      let timeoutId = null;
      const launchPromise = new Promise((res, rej) => {
        launchBackend(res, rej);
      });
      const timeoutPromise = new Promise((_, rej) => {
        timeoutId = setTimeout(() => {
          stopBackend();
          rej(new Error(`后端启动超时（已等待 ${LAUNCH_TIMEOUT / 1000} 秒）`));
        }, LAUNCH_TIMEOUT);
      });

      Promise.race([launchPromise, timeoutPromise]).then(() => {
        // 启动成功后清除超时定时器，防止 stopBackend() 误杀进程
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      }).catch(reject);
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

  if (!fs.existsSync(jarPath)) {
    reject(new Error(`JAR 文件不存在: ${jarPath}`));
    return;
  }

  // 优先使用内置 JRE，其次系统 Java
  const bundledJava = path.join(resourcesPath, 'jre', 'bin',
    process.platform === 'win32' ? 'java.exe' : 'java');
  const hasBundledJre = fs.existsSync(bundledJava);

  let javaCmd;
  if (hasBundledJre) {
    javaCmd = bundledJava;
  } else {
    // 回退到系统 Java — 先检查版本
    const sysJava = process.platform === 'win32' ? 'java.exe' : 'java';
    let version = 0;
    try {
      const { execSync } = require('child_process');
      const raw = execSync(`"${sysJava}" -version 2>&1`).toString();
      const m = raw.match(/version "(\d+)/);
      version = m ? parseInt(m[1], 10) : 0;
    } catch {
      reject(new Error(
        '未找到系统 Java（java.exe），请安装 JDK 21+，或重新打包以内置 JRE。'
      ));
      return;
    }
    if (version < 21) {
      reject(new Error(
        `系统 Java 版本过低（${version}），需要 JDK 21+。请升级 Java 或重新打包以内置 JRE。`
      ));
      return;
    }
    javaCmd = sysJava;
  }

  // ── 数据目录策略 ──
  // 1. 优先读用户自定义配置 data-dir.conf（持久化在 Electron userData 根目录下，
  //    由 Java 后端 DataDirApiHandler 写入，确保更新/卸载后不丢失）
  // 2. 无自定义配置则使用默认 %APPDATA%/HippoBuddy/.hippo
  const userDataRoot = app.getPath('userData');
  const dataDirConfig = path.join(userDataRoot, 'data-dir.conf');
  let hippoDataDir;
  if (fs.existsSync(dataDirConfig)) {
    const customPath = fs.readFileSync(dataDirConfig, 'utf-8').trim();
    if (customPath && fs.existsSync(customPath)) {
      hippoDataDir = customPath;
    } else {
      console.error(`[backend] data-dir.conf 中的路径无效，回退到默认: ${customPath}`);
      hippoDataDir = path.join(userDataRoot, '.hippo');
    }
  } else {
    hippoDataDir = path.join(userDataRoot, '.hippo');
  }

  const proc = spawn(javaCmd, [
    `-Dhippo.data.dir=${hippoDataDir}`,
    `-Dhippo.userdata.root=${userDataRoot}`,
    '-cp', jarPath, mainClass
  ], {
    cwd: hippoDataDir,
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
    if (!resolved && (text.includes('[READY]') || text.includes('DashboardServer') || text.includes('Hippo Cockpit'))) {
      resolved = true;
      console.log('[backend] Process ready signal detected, verifying HTTP...');
      // 不要立即 resolve，改为轮询 HTTP 端点确认服务实际可响应
      waitForHttpReady(resolve, reject);
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
    if (!resolved) { resolved = true; reject(new Error(`后端进程异常退出 code=${code}`)); }
  });
}

/**
 * 轮询 HTTP 端点直到后端真正就绪。
 * 进程输出 [READY] 只是日志层面的，HTTP Server 可能还未完成绑定。
 * 这里每 500ms 尝试一次，最多等 30 次（15 秒）。
 */
function waitForHttpReady(resolve, reject) {
  const http = require('http');
  const MAX_ATTEMPTS = 30;
  let attempts = 0;

  function poll() {
    attempts++;
    const req = http.get(`http://localhost:${PORT}/cockpit`, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        console.log('[backend] HTTP endpoint ready');
        resolve();
      } else if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, 500);
      } else {
        reject(new Error('后端进程已输出就绪信号，但 HTTP 端点未正常响应'));
      }
    });
    req.on('error', () => {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, 500);
      } else {
        reject(new Error('等待 HTTP 就绪超时（15 秒）'));
      }
    });
    req.setTimeout(2000, () => { req.destroy(); });
  }

  poll();
}

function stopBackend() {
  // 1) 优先通过已知 PID 杀进程树
  if (backendProcess) {
    const pid = backendProcess.pid;
    console.log(`[backend] Stopping Java backend (PID=${pid})`);

    if (process.platform === 'win32') {
      require('child_process').spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try { backendProcess.kill('SIGTERM'); } catch { /* 忽略 */ }
    }

    backendProcess = null;
  }

  // 2) 兜底：按端口查杀（防止 cmd.exe 已退出但 Java 孤儿进程仍运行）
  killStaleBackend();
}

/** 清理残留的后端进程（Electron 非正常退出时，后端可能变成孤儿进程） */
function killStaleBackend() {
  if (process.platform !== 'win32') return;
  try {
    // 查找占用目标端口的 java 进程
    const { execSync } = require('child_process');
    const raw = execSync(
      `netstat -ano | findstr :${PORT} | findstr LISTENING`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 }
    );
    const pids = new Set();
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      console.log(`[backend] Killing stale process (PID=${pid})`);
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 3000 });
    }
  } catch {
    // 没有残留进程或命令失败 → 正常
  }
}

// ============================================================================
// 窗口创建
// ============================================================================

function createWindow() {
  // 恢复上次窗口状态
  const savedState = loadWindowState();
  const windowOptions = {
    width: savedState?.width || 1100,
    height: savedState?.height || 700,
    minWidth: 800,
    minHeight: 500,
    x: savedState?.x,
    y: savedState?.y,
    frame: false,
    backgroundColor: getSavedTheme() === 'dark' || getSavedTheme() === 'midnight' ? '#1a1b1e' : '#edeff2',
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

  if (DEV) {
    // 开发模式：直接加载后端 URL
    const url = `http://localhost:${PORT}/cockpit`;
    console.log(`[main] Loading: ${url}`);
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式：先加载本地 splash 页面（河马出水动画），后端就绪后自动切换
    const splashPath = path.join(__dirname, 'splash.html');
    // 读取保存的主题偏好，传给 splash 保持一致
    const theme = getSavedTheme();
    console.log(`[main] Loading splash: ${splashPath} (theme=${theme})`);
    mainWindow.loadFile(splashPath, { query: { theme } });
  }

  // ready-to-show 时显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 兜底：5 秒后强制显示窗口（避免窗口一直 hidden）
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[main] Fallback: showing window');
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

/** 设置 splash 页面与主进程的通信（状态更新 + 重试） */
function setupSplashCommunication() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // splash 加载完成后，更新状态文字
  const onSplashLoaded = () => {
    mainWindow.webContents.executeJavaScript(
      `__updateStatus('Starting...')`
    ).catch(() => {});
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', onSplashLoaded);
  } else {
    onSplashLoaded();
  }

  // 注册 IPC handler：splash 页面请求重试
  ipcMain.handle('splash:retry', async () => {
    console.log('[main] Splash retry requested');
    // 先更新 splash 状态
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `__updateStatus('Retrying...')`
      ).catch(() => {});
    }

    startBackend()
      .then(() => {
        console.log('[main] Backend ready after retry, loading cockpit...');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(
            `__updateStatus('Ready ✓')`
          ).catch(() => {});
          setTimeout(() => {
            mainWindow.webContents.executeJavaScript(
              `__hideWaves()`
            ).catch(() => {});
            // 等待波浪动画完全结束（0.8s 过渡 + 0.2s 延迟）后再加载 cockpit
            setTimeout(() => {
              mainWindow.loadURL(`http://localhost:${PORT}/cockpit?skipSplash=true`);
              mainWindow.setTitle('HippoBuddy');
            }, 1100);
          }, 500);
        }
      })
      .catch(err => {
        console.error('[main] Backend launch failed after retry:', err.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
          const safeMsg = (err.message || '未知错误').replace(/['\\]/g, '');
          mainWindow.webContents.executeJavaScript(
            `__showError('${safeMsg}')`
          ).catch(() => {});
        }
      });
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

// ---------- 主题 ----------

ipcMain.handle('theme:get', () => {
  return getSavedTheme();
});

ipcMain.handle('theme:set', (_event, theme) => {
  if (theme === 'dark' || theme === 'light' || theme === 'midnight') {
    saveTheme(theme);
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
  // 1. 先创建窗口，立即加载本地 splash（河马出水动画）
  createWindow();

  // 2. 启动 Java 后端，就绪后自动切换到实际页面
  if (!DEV) {
    // 生产模式：等 splash 显示就绪后设置重试回调，再启动后端
    setupSplashCommunication();

    startBackend()
      .then(() => {
        console.log('[main] Backend ready, loading cockpit...');
        if (mainWindow && !mainWindow.isDestroyed()) {
          // 先更新状态文字，给用户一个"准备就绪"的完成感
          mainWindow.webContents.executeJavaScript(
            `__showReady()`
          ).catch(() => {});
          // 稍等片刻让用户看到完成状态，再播放收尾动画
          setTimeout(() => {
            mainWindow.webContents.executeJavaScript(
              `__hideWaves()`
            ).catch(() => {});
            // 等待波浪动画完全结束（0.8s 过渡 + 0.2s 延迟）后再加载 cockpit
            setTimeout(() => {
              mainWindow.loadURL(`http://localhost:${PORT}/cockpit?skipSplash=true`);
              mainWindow.setTitle('HippoBuddy');
            }, 1100);
          }, 500);
        }
      })
      .catch(err => {
        console.error('[main] Backend launch failed:', err.message);
        // 通知 splash 显示错误（允许用户重试）
        if (mainWindow && !mainWindow.isDestroyed()) {
          const safeMsg = (err.message || '未知错误').replace(/['\\]/g, '');
          mainWindow.webContents.executeJavaScript(
            `__showError('${safeMsg}')`
          ).catch(() => {});
        }
      });
  } else {
    // 开发模式：后台启动后端（传统方式）
    startBackend().catch(err => {
      console.error('[main] Backend launch failed:', err.message);
    });
  }

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
