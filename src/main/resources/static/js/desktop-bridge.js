/**
 * HippoDesktop — Electron 桌面桥
 *
 * 通过 window.electronAPI 提供桌面端特有能力：
 *   1. 文件系统操作（readDir, readFile, writeFile）
 *   2. 系统对话框（openFileDialog）
 *   3. 工作区管理（get/set/clearCurrentFolder）
 *   4. 集成 HippoWorkspace 文件树/标签/预览
 *   5. 窗口控制（最小化、最大化/还原、关闭、拖拽）
 *
 * Web 端没有 electronAPI，所有功能自动降级。
 */

import { showBottomToast } from './utils/toast.js';

const HippoDesktop = (() => {
  /** 判断当前运行环境 */
  function getEnv() {
    if (window.electronAPI && window.electronAPI.isElectron) return 'electron';
    return 'web';
  }

  // ===== HTTP API 工具 =====
  async function httpGet(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  async function httpPut(url, body) {
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  async function httpDelete(url) {
    const resp = await fetch(url, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  // ========== 窗口最大化状态同步 ==========
  async function syncMaximizeState() {
    if (!window.electronAPI) return;
    try {
      const maximized = await window.electronAPI.isMaximized();
      const btn = document.getElementById('winMaximize');
      if (btn && typeof maximized === 'boolean') {
        btn.classList.toggle('is-maximized', maximized);
        btn.title = maximized ? i18n.t('window.restore') : i18n.t('html.header.maximize');
      }
      document.body.classList.toggle('window-maximized', maximized);
    } catch {
      // 忽略，非 Electron 端
    }
  }

  // ========== 窗口控制按钮绑定 ==========
  function initWindowControls() {
    if (!api.isAvailable) return;

    const minimizeBtn = document.getElementById('winMinimize');
    const maximizeBtn = document.getElementById('winMaximize');
    const closeBtn = document.getElementById('winClose');

    const controls = document.getElementById('windowControls');
    if (controls) controls.style.display = 'flex';

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        api.minimizeWindow().catch(() => {});
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        maximizeBtn.classList.toggle('is-maximized');
        maximizeBtn.title = maximizeBtn.classList.contains('is-maximized') ? i18n.t('window.restore') : i18n.t('html.header.maximize');
        api.toggleMaximize()
          .then(() => setTimeout(syncMaximizeState, 100))
          .catch(() => syncMaximizeState());
      });

      const header = document.querySelector('.header');
      if (header) {
        header.addEventListener('dblclick', (e) => {
          if (e.target.closest('button, .window-controls, .header-folder-dropdown, .header-brand-icon')) return;
          if (maximizeBtn) {
            maximizeBtn.classList.toggle('is-maximized');
            maximizeBtn.title = maximizeBtn.classList.contains('is-maximized') ? i18n.t('window.restore') : i18n.t('html.header.maximize');
          }
          api.toggleMaximize()
            .then(() => setTimeout(syncMaximizeState, 100))
            .catch(() => syncMaximizeState());
        });
      }
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        api.closeWindow().catch(() => {});
      });
    }

    // 最大化状态事件推送（替代 1s 轮询）
    window.electronAPI.onMaximizedChanged((maximized) => {
      const btn = document.getElementById('winMaximize');
      if (btn && typeof maximized === 'boolean') {
        btn.classList.toggle('is-maximized', maximized);
        btn.title = maximized ? i18n.t('window.restore') : i18n.t('html.header.maximize');
      }
      document.body.classList.toggle('window-maximized', maximized);
    });

    // 初始同步 + resize 兜底（用户拖拽还原时 Electron 可能不触发 unmaximize）
    setTimeout(syncMaximizeState, 500);
    window.addEventListener('resize', syncMaximizeState);
  }

  const api = {
    get isAvailable() {
      return window.electronAPI && window.electronAPI.isElectron;
    },

    // ===== 文件操作 =====
    readDir(path) {
      return window.electronAPI?.readDir(path);
    },

    readFile(path) {
      if (!window.electronAPI) return;
      return window.electronAPI.readFile(path);
    },

    writeFile(path, content) {
      return window.electronAPI?.writeFile(path, content);
    },

    isDirectory(path) {
      return window.electronAPI?.isDirectory(path);
    },

    openFileDialog() {
      return window.electronAPI?.openFileDialog();
    },

    saveFileDialog(base64Content, suggestedName, mimeType) {
      return window.electronAPI?.saveFileDialog(base64Content, suggestedName, mimeType);
    },

    // ===== 工作区（HTTP API） =====
    getCurrentFolder() {
      return httpGet('/api/workspace').then(r => ({ path: r.path }));
    },

    setCurrentFolder(path) {
      return httpPut('/api/workspace', { path });
    },

    clearCurrentFolder() {
      return httpDelete('/api/workspace').catch(() => {});
    },

    isDefaultWorkspace() {
      return httpGet('/api/workspace').then(r => ({ isDefault: r.isDefault }));
    },

    getDefaultWorkspace() {
      return httpGet('/api/workspace/default').then(r => ({ path: r.path }));
    },

    setDefaultWorkspace(path) {
      return httpPut('/api/workspace/default', { path });
    },

    // ===== 通用配置（HTTP API） =====
    getConfig() {
      return httpGet('/api/config');
    },

    updateConfig(values) {
      return httpPut('/api/config', { values }).then(() => ({ success: true }));
    },

    // ===== DevTools =====
    openDevTools() {
      return window.electronAPI?.openDevTools();
    },

    // ===== 文件系统工具 =====
    showItemInFolder(path) {
      return window.electronAPI?.showItemInFolder(path);
    },

    createFile(path) {
      return window.electronAPI?.createFile(path);
    },

    createDir(path) {
      return window.electronAPI?.createDir(path);
    },

    rename(oldPath, newPath) {
      return window.electronAPI?.rename(oldPath, newPath);
    },

    deleteFile(path) {
      return window.electronAPI?.deleteFile(path);
    },

    // ===== 窗口控制 =====
    minimizeWindow() {
      return window.electronAPI?.minimizeWindow();
    },

    maximizeWindow() {
      return window.electronAPI?.maximizeWindow();
    },

    restoreWindow() {
      return window.electronAPI?.restoreWindow();
    },

    toggleMaximize() {
      return window.electronAPI?.toggleMaximize();
    },

    closeWindow() {
      return window.electronAPI?.closeWindow();
    },

    isMaximized() {
      return window.electronAPI?.isMaximized();
    },

    getWindowState() {
      return window.electronAPI?.getWindowState();
    },

    // ===== 外部链接 =====
    openExternal(url) {
      return window.electronAPI?.openExternal(url);
    },

    // ===== 原生终端 =====
    openTerminal(path) {
      return window.electronAPI?.openTerminal(path);
    },

    // ===== 自动更新 =====
    checkForUpdates() {
      return window.electronAPI?.checkForUpdates();
    },
    downloadUpdate() {
      return window.electronAPI?.downloadUpdate();
    },
    cancelUpdate() {
      return window.electronAPI?.cancelUpdate();
    },
    quitAndInstall() {
      return window.electronAPI?.quitAndInstall();
    },
    onUpdateChecking(cb) {
      window.electronAPI?.onUpdateChecking(cb);
    },
    onUpdateAvailable(cb) {
      window.electronAPI?.onUpdateAvailable(cb);
    },
    onUpdateNotAvailable(cb) {
      window.electronAPI?.onUpdateNotAvailable(cb);
    },
    onUpdateError(cb) {
      window.electronAPI?.onUpdateError(cb);
    },
    onUpdateDownloadProgress(cb) {
      window.electronAPI?.onUpdateDownloadProgress(cb);
    },
    onUpdateDownloaded(cb) {
      window.electronAPI?.onUpdateDownloaded(cb);
    },
    removeAllUpdateListeners() {
      window.electronAPI?.removeAllUpdateListeners();
    },

    // ===== 原生通知 =====
    showNotification(title, body, icon) {
      return window.electronAPI?.showNotification(title, body, icon);
    }
  };

  // ========== 桌面端初始化 ==========
  if (api.isAvailable) {
    document.body.classList.add('desktop-window');

    const ws = window.HippoWorkspace;

    // 文件夹操作组（打开 + 最近文件夹下拉）
    const folderGroup = document.getElementById('headerFolderGroup');
    const openBtn = document.getElementById('desktopOpenFolderBtn');
    const recentDropdown = document.getElementById('recentFoldersDropdown');

    if (folderGroup) folderGroup.style.display = '';

    const handleOpenFolder = async () => {
      try {
        const result = await api.openFileDialog();
        if (result && result.path) {
          await api.setCurrentFolder(result.path);
          if (ws && ws.isAvailable) {
            await ws.openWorkspace(result.path);
          }
          showBottomToast('工作区已切换: ' + result.path);
        }
      } catch (err) {
        showBottomToast('打开文件夹失败: ' + err.message);
      }
    };

    if (openBtn) {
      openBtn.addEventListener('click', handleOpenFolder);
    }

    // 最近文件夹下拉 — 悬浮到文件夹操作组时展示
    if (folderGroup && recentDropdown) {
      let hoverTimer = null;

      if (ws && ws.isAvailable) {
        ws.renderRecentFolders?.();
      }

      folderGroup.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        recentDropdown.classList.add('show');
      });

      folderGroup.addEventListener('mouseleave', (e) => {
        const related = e.relatedTarget;
        if (related && (folderGroup.contains(related) || recentDropdown.contains(related))) return;
        hoverTimer = setTimeout(() => {
          recentDropdown.classList.remove('show');
        }, 100);
      });

      recentDropdown.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
      });

      recentDropdown.addEventListener('mouseleave', () => {
        hoverTimer = setTimeout(() => {
          recentDropdown.classList.remove('show');
        }, 100);
      });

      document.addEventListener('click', (e) => {
        if (!folderGroup.contains(e.target) && !recentDropdown.contains(e.target)) {
          recentDropdown.classList.remove('show');
        }
      });
    }

    // 恢复上次工作区
    if (ws && ws.isAvailable) {
      Promise.all([
        api.getCurrentFolder(),
        api.isDefaultWorkspace()
      ]).then(([folderResult, defaultResult]) => {
        if (folderResult && folderResult.path) {
          ws.openWorkspace(folderResult.path, defaultResult?.isDefault);
        }
      }).catch(() => {});
    } else {
      console.warn('HippoDesktop: HippoWorkspace not available');
    }

    // DevTools 按钮
    const devtoolsBtn = document.getElementById('devtoolsBtn');
    if (devtoolsBtn) {
      devtoolsBtn.style.display = '';
      devtoolsBtn.addEventListener('click', () => {
        api.openDevTools();
        showBottomToast('正在打开 DevTools...');
      });
    }

    // 刷新页面按钮
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.style.display = '';
      refreshBtn.addEventListener('click', () => {
        const hasSession = (() => { try { return !!localStorage.getItem('hippo-last-session-id'); } catch { return false; } })();
        location.href = hasSession ? '/cockpit?skipSplash=true' : '/cockpit';
      });
    }

    // ========== 外部链接拦截 ==========
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-external="true"]');
      if (!link) return;
      e.preventDefault();
      const url = link.getAttribute('href');
      if (url) {
        api.openExternal(url).catch(() => {
          window.open(url, '_blank');
        });
      }
    });

    initWindowControls();
  } else {
    console.warn('HippoDesktop: electronAPI not available, desktop-only features disabled');
  }

  return api;
})();

window.HippoDesktop = HippoDesktop;
