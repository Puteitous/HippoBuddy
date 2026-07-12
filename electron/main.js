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

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { spawn, exec } = require('child_process');

const PORT = parseInt(process.env.HIPPO_PORT || '9090', 10);
const DEV = process.argv.includes('--dev');

let mainWindow = null;

// ============================================================================
// 窗口创建
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#edeff2',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'hippo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = `http://localhost:${PORT}/cockpit`;
  console.log(`[main] Loading: ${url}`);

  if (DEV) {
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    tryLoadWithRetry(url);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
}

/** 带重试的后端连接 */
function tryLoadWithRetry(url, retries = 60) {
  mainWindow.loadURL(url).catch(() => {
    if (retries > 0) {
      console.log(`[main] 等待后端就绪... (剩余 ${retries} 次)`);
      setTimeout(() => tryLoadWithRetry(url, retries - 1), 1000);
    } else {
      console.error(`[main] 后端连接失败: ${url}`);
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
  if (mainWindow) mainWindow.close();
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
// 应用生命周期
// ============================================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
