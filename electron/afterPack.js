/**
 * electron-builder afterPack 钩子：确保随包分发的内置 JRE 保留「可执行位」。
 *
 * 背景
 *  - 运行时由 electron/main.js 执行 spawn(<resources>/jre/bin/java) 启动后端；
 *  - Linux 下 spawn 依赖文件在磁盘上的 mode，若 java 丢成 0644 会直接报 EACCES；
 *  - arm64 的 JRE 由独立 runner 用 jlink 生成后经 actions/upload-artifact 传递，
 *    而 GitHub Actions artifact 不保留文件权限，下载后 jre/bin/java 变为 0644；
 *  - electron-builder / fpm 不会补回该位，故在此统一 chmod。
 *
 * 该钩子对每个 platform+arch 的打包各执行一次，作用于「已解包的应用目录」
 * （写入 installer 之前），因此 AppImage / deb / dmg / zip 都会带上正确权限。
 */
const fs = require('fs');
const path = require('path');

/** 递归把目录本身设为 0755（保证可进入） */
function chmodDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    try {
      fs.chmodSync(full, 0o755);
    } catch {
      /* 忽略个别失败，避免影响打包 */
    }
    chmodDirs(full);
  }
}

/** 恢复 <jreDir>/bin 下所有可执行文件的可执行位 */
function restoreJreExecBits(jreDir) {
  if (!fs.existsSync(jreDir)) return false;
  chmodDirs(jreDir);

  const binDir = path.join(jreDir, 'bin');
  if (!fs.existsSync(binDir)) return false;

  for (const name of fs.readdirSync(binDir)) {
    const file = path.join(binDir, name);
    try {
      if (fs.statSync(file).isFile()) fs.chmodSync(file, 0o755);
    } catch {
      /* 忽略 */
    }
  }
  return true;
}

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName; // 'linux' | 'win32' | 'darwin'

  // Windows 不使用 Unix mode，无需处理
  if (platform !== 'linux' && platform !== 'darwin') return;

  // Linux: <appOutDir>/resources；macOS: <appOutDir>/<ProductName>.app/Contents/Resources
  const resourcesDirs = [path.join(appOutDir, 'resources')];
  try {
    for (const name of fs.readdirSync(appOutDir)) {
      if (name.endsWith('.app')) {
        resourcesDirs.push(path.join(appOutDir, name, 'Contents', 'Resources'));
      }
    }
  } catch {
    /* 忽略 */
  }

  for (const resourcesDir of resourcesDirs) {
    const jreDir = path.join(resourcesDir, 'jre');
    if (restoreJreExecBits(jreDir)) {
      console.log(`  • afterPack: 已恢复内置 JRE 可执行位 (${jreDir})`);
    }
  }
};
