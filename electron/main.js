/**
 * Hippo Buddy Desktop — Electron 主进程
 *
 * 加载 Java 后端 DashboardServer 提供的 Web UI，替代 JCEF 成为桌面壳。
 *
 * 启动方式：
 *   npm run dev           React 重构版(dev,/app)
 *   npm run dev:cockpit   旧桌面端(dev,/cockpit)
 *   npm start             React 重构版(/app)
 *   npm run start:cockpit 旧桌面端(/cockpit)
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

// UI 入口选择：默认加载 React 重构后的 /app；
// 带 --cockpit（或 HIPPO_UI=cockpit）时回退旧桌面端 /cockpit。
// 用途：start / dev 默认打开新 UI；start:cockpit / dev:cockpit 走旧桌面端，二者互不影响。
const USE_COCKPIT_UI =
  process.argv.includes('--cockpit') || (process.env.HIPPO_UI || '').toLowerCase() === 'cockpit';
const UI_PATH = USE_COCKPIT_UI ? '/cockpit' : '/app';

function mainWindowHomeUrl() {
  return `http://localhost:${PORT}${UI_PATH}`;
}

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
    if (parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'midnight' || parsed.theme === 'glass') {
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
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      // 根路径现在会是 200 或 302(重定向到 /app),两者都说明后端可响应
      if (res.statusCode >= 200 && res.statusCode < 400) {
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

  // 确保数据目录存在（否则 spawn 的 cwd 会失败导致 ENOENT）
  if (!fs.existsSync(hippoDataDir)) {
    fs.mkdirSync(hippoDataDir, { recursive: true });
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
    if (!resolved && (text.includes('[READY]') || text.includes('DashboardServer'))) {
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
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 400) {
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
    backgroundColor: getSavedTheme() === 'dark' || getSavedTheme() === 'midnight' || getSavedTheme() === 'glass' ? '#1a1b1e' : '#edeff2',
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
    // 开发模式：直接加载后端 URL（默认 /app，带 --cockpit 时加载 /cockpit）
    const url = mainWindowHomeUrl();
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

  // 关闭前保存状态，非退出时隐藏到托盘而非关闭窗口
  //（Ctrl+W/Cmd+W 已在 before-input-event 中拦截，不会走到这里）
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

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

  // 刷新/重新加载宿主页面时，前端内存态会全部丢失（SSE/停止按钮/spinner 均失效），
  // 正在执行的任务将处于不可控状态。故在主进程拦截 did-start-loading（主进程不随页面销毁
  // 消失，比渲染层 beforeunload 更可靠），中断后端所有运行中的会话——「刷新即离开，统一停止」。
  // 与退出托盘菜单的中断逻辑（abortSessions(runningIds)）语义一致。
  mainWindow.webContents.on('did-start-loading', () => {
    if (!mainHomeLoaded) return; // 首次启动/splash 载入阶段不中断
    getRunningSessionIds().then((ids) => {
      if (ids.length) abortSessions(ids);
    });
  });

  // ⛔ 禁止 Ctrl+W / Cmd+W 关闭窗口（桌面端不需要浏览器标签页快捷键）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'w') {
      _event.preventDefault();
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
        console.log('[main] Backend ready after retry, loading UI...');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(
            `__updateStatus('Ready ✓')`
          ).catch(() => {});
          setTimeout(() => {
            mainWindow.webContents.executeJavaScript(
              `__hideWaves()`
            ).catch(() => {});
            // 等待波浪动画完全结束（0.8s 过渡 + 0.2s 延迟）后再加载主界面
            setTimeout(() => {
              mainWindow.loadURL(`${mainWindowHomeUrl()}?skipSplash=true`);
              mainWindow.setTitle('HippoBuddy');
              mainHomeLoaded = true; // 主界面已加载，此后真正的刷新才会中断运行中任务
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
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) {
      return { error: true, code: 'NOT_A_FILE' };
    }
    const content = await fs.promises.readFile(file, 'utf-8');
    return { path: filePath, content };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: true, code: 'ENOENT' };
    }
    return { error: true, code: 'UNKNOWN', message: err.message };
  }
});

/** 图片扩展名 → MIME 类型映射 */
const IMAGE_MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 读取图片文件，返回 base64 data URL（供自定义背景使用） */
ipcMain.handle('fs:readFileBase64', async (_event, filePath) => {
  const file = path.resolve(filePath);
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) {
      return { error: true, code: 'NOT_A_FILE' };
    }
    const mime = IMAGE_MIME_MAP[path.extname(file).toLowerCase()] || 'image/png';
    const buf = await fs.promises.readFile(file);
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: true, code: 'ENOENT' };
    }
    return { error: true, code: 'UNKNOWN', message: err.message };
  }
});

/** 写入文件内容 */
ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  const file = path.resolve(filePath);
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, content, 'utf-8');
    const stat = await fs.promises.stat(file);
    return { path: filePath, size: stat.size };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: true, code: 'ENOENT' };
    }
    return { error: true, code: 'UNKNOWN', message: err.message };
  }
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

/** 打开图片文件选择对话框（供自定义背景使用） */
ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择背景图片',
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'] },
    ],
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
  if (theme === 'dark' || theme === 'light' || theme === 'midnight' || theme === 'glass') {
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
// 后端 HTTP 辅助（退出确认用）
// ============================================================================

/** GET 后端 JSON API（带超时） */
function backendGetJson(path) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.get({ host: 'localhost', port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('后端响应解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

/** POST 后端 JSON API（带超时） */
function backendPostJson(path, bodyObj) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const payload = JSON.stringify(bodyObj || {});
    const req = http.request({
      host: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(payload);
    req.end();
  });
}

/** 是否已加载过主界面（首个完成标志，避免首次启动/splash 载入时误中断任务） */
let mainHomeLoaded = false;

/** 查询所有正在执行任务的会话 ID（后端不可达时返回空数组，不阻塞退出） */
async function getRunningSessionIds() {
  try {
    const sessions = await backendGetJson('/api/sessions');
    if (!Array.isArray(sessions)) return [];
    return sessions
      .filter(s => s && s.running === true)
      .map(s => s.id)
      .filter(Boolean);
  } catch (err) {
    console.warn('[main] 查询运行中会话失败:', err.message);
    return [];
  }
}

/** 中断指定会话的任务（复用停止按钮的 /api/tool/abort 接口） */
async function abortSessions(sessionIds) {
  for (const id of sessionIds) {
    try {
      await backendPostJson('/api/tool/abort', { sessionId: id });
      console.log(`[main] 已发送中断请求: sessionId=${id}`);
    } catch (err) {
      console.warn(`[main] 中断会话失败: sessionId=${id}, error=${err.message}`);
    }
  }
}

/** 执行真正的退出：标记退出 → 销毁托盘 → quit（触发 will-quit → stopBackend） */
function doQuit() {
  app.isQuitting = true;
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}

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
      click: async () => {
        // 查询是否有正在执行的任务：有 → 弹确认框（关闭并中断 / 取消），无 → 直接退出
        const runningIds = await getRunningSessionIds();
        if (runningIds.length > 0) {
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: '任务正在执行中',
            message: `有 ${runningIds.length} 个任务正在执行，退出应用将中断它们。`,
            detail: '退出后未完成的任务进度将丢失。若想保留任务继续运行，请点击"取消"，窗口可最小化到托盘。',
            buttons: ['取消', '关闭并中断'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          });
          if (response !== 1) {
            // 用户选择取消 → 不退出，任务继续
            return;
          }
          // 用户确认中断 → 先发送中断请求，给 Agent 一点时间落盘当前状态，再退出
          await abortSessions(runningIds);
          await new Promise(r => setTimeout(r, 1500));
        }
        doQuit();
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

/** 启动时的静默自动检查标志：为 true 时 error 事件不转发给前端（不打扰用户） */
let _silentAutoCheck = false;

// ---------- "待安装更新"持久化 ----------
// 用户点 × 关闭"下载完成"卡片后，把版本信息写到 userData，
// 下次启动时若仍未安装（版本号低于待安装版本）则再次提示"重启安装"。

const PENDING_UPDATE_FILE = 'update-pending.json';

function getPendingUpdatePath() {
  return path.join(app.getPath('userData'), PENDING_UPDATE_FILE);
}

/** 读取待安装更新信息，无则返回 null */
function readPendingUpdate() {
  try {
    const data = JSON.parse(fs.readFileSync(getPendingUpdatePath(), 'utf-8'));
    if (data && data.version) return data;
  } catch { /* 文件不存在或损坏 */ }
  return null;
}

/** 记录待安装更新（下载完成后调用） */
function writePendingUpdate(version, releaseNotes) {
  try {
    fs.mkdirSync(path.dirname(getPendingUpdatePath()), { recursive: true });
    fs.writeFileSync(getPendingUpdatePath(), JSON.stringify({
      version,
      releaseNotes: releaseNotes || null,
      savedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
  } catch { /* 静默忽略 */ }
}

/** 清除待安装更新记录（安装/退出清理时调用） */
function clearPendingUpdate() {
  try { fs.unlinkSync(getPendingUpdatePath()); } catch { /* 不存在则忽略 */ }
}

/** 简单版本号比较：a > b 返回 1，a < b 返回 -1，相等返回 0 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

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
    if (_silentAutoCheck) return; // 启动静默检查不通知前端
    console.log('[updater] Checking for updates…');
    mainWindow?.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    _silentAutoCheck = false;
    console.log('[updater] New version available:', info.version);
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    _silentAutoCheck = false;
    console.log('[updater] Already up to date:', info.version);
    mainWindow?.webContents.send('update:not-available', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    // 启动静默检查失败（如网络不可用）不打扰用户，仅记日志
    if (_silentAutoCheck) {
      _silentAutoCheck = false;
      console.warn('[updater] Auto check failed (silent):', err.message);
      return;
    }
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
    // 持久化"待安装"标志：用户点 × 暂不安装时，下次启动仍会提示重启安装
    writePendingUpdate(info.version, info.releaseNotes);
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

  // ----- 启动后自动检查 -----
  // 关键：必须等 UI 页面加载完成后再检查（而不是固定的 5 秒）。
  // 后端 Java 启动需要 10~30 秒，期间窗口停留在 splash 页面；
  // 若此时触发检查，update:* 事件会发给 splash 而丢失（splash 无监听器）。
  // 监听 did-finish-load 并确认 URL 是主界面（/app 或 /cockpit）后，再延迟 1 秒执行，
  // 确保前端 initAutoUpdater() 已注册所有监听器。
  let _autoCheckDone = false;
  const _onMainUILoaded = () => {
    const url = mainWindow?.webContents.getURL() || '';
    if (!(url.includes('/app') || url.includes('/cockpit')) || _autoCheckDone) return;
    _autoCheckDone = true;

    // ① 上次有已下载但未安装的更新？先提示重启安装（更新文件仍在本机缓存）
    const pending = readPendingUpdate();
    if (pending && compareVersions(pending.version, app.getVersion()) > 0) {
      console.log(`[updater] Pending update found (v${pending.version}), prompting install`);
      mainWindow?.webContents.send('update:downloaded', {
        version: pending.version,
        releaseNotes: pending.releaseNotes,
      });
    }

    // ② 静默自动检查（失败/无新版不打扰用户）
    setTimeout(() => {
      console.log('[updater] Auto check for updates on startup');
      _silentAutoCheck = true; // 本次检查失败时不转发 error 给前端
      autoUpdater.checkForUpdates().catch((err) => {
        _silentAutoCheck = false;
        console.warn('[updater] Auto check failed (silent):', err.message);
      });
    }, 1000); // 等前端监听器注册完成（did-finish-load 时 ES module 已执行，再加 1s 保险）
  };
  mainWindow?.webContents.on('did-finish-load', _onMainUILoaded);
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

ipcMain.handle('update:cancel', async () => {
  try {
    if (typeof autoUpdater.cancelUpdate === 'function') {
      autoUpdater.cancelUpdate();
      console.log('[updater] Download cancelled by user');
      return { success: true };
    }
    return { success: false, error: '当前平台不支持取消下载' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update:quitAndInstall', async () => {
  clearPendingUpdate(); // 安装后不再需要待安装标志
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
        console.log('[main] Backend ready, loading UI...');
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
            // 等待波浪动画完全结束（0.8s 过渡 + 0.2s 延迟）后再加载主界面
            setTimeout(() => {
              mainWindow.loadURL(`${mainWindowHomeUrl()}?skipSplash=true`);
              mainWindow.setTitle('HippoBuddy');
              mainHomeLoaded = true; // 主界面已加载，此后真正的刷新才会中断运行中任务
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
