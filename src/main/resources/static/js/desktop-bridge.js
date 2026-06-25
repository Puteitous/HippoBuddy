/**
 * HippoDesktop — JCEF JS↔Java 双向通信桥
 *
 * 提供桌面端特有能力：
 *   1. 文件系统操作（readDir, readFile, writeFile）
 *   2. 系统对话框（openFileDialog）
 *   3. 工作区管理（get/set/clearCurrentFolder）
 *   4. 集成 HippoWorkspace 文件树/标签/预览
 *   5. 窗口控制（最小化、最大化/还原、关闭、拖拽）
 *
 * Web 端没有 cefQuery，所有功能自动降级。
 */

import { showBottomToast } from './utils/toast.js';

const HippoDesktop = (() => {
  // DevTools 状态默认空函数，防止 Java 端在按钮初始化前调用
  window.__devToolsOpen = function() {};

  function send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!window.cefQuery) {
        reject(new Error('Not running in JCEF environment'));
        return;
      }

      // openFileDialog / saveFileDialog 使用 executeJavaScript 回调（避免 CEF 异步查询超时问题）
      if (action === 'openFileDialog') {
        window._onOpenFolderResult = (result) => {
          resolve(result);
        };
      }
      if (action === 'saveFileDialog') {
        window._onSaveFileDialogResult = (result) => {
          resolve(result);
        };
      }

      window.cefQuery({
        request: JSON.stringify({ action, ...payload }),
        onSuccess: (response) => {
          // openFileDialog / saveFileDialog 会先收到 {"status":"pending"}，忽略它，等待 executeJavaScript 回调
          if (action === 'openFileDialog' || action === 'saveFileDialog') return;
          try {
            resolve(JSON.parse(response));
          } catch {
            resolve(response);
          }
        },
        onFailure: (errCode, errMsg) => {
          // openFileDialog / saveFileDialog 的 onFailure 也忽略（真正的错误由超时处理兜底）
          if (action === 'openFileDialog' || action === 'saveFileDialog') return;
          reject(new Error(errMsg || `Error ${errCode}`));
        }
      });
    });
  }

  // ========== 拖拽状态 ==========
  let dragState = null;

  function initDrag() {
    const header = document.querySelector('.header');
    if (!header) return;

    // 只有桌面端才启用拖拽
    if (!api.isAvailable) return;

    header.addEventListener('mousedown', (e) => {
      // 排除对按钮/可交互元素的拖拽
      if (e.target.closest('button, .header-brand-icon, .window-controls, input, textarea, select')) return;

      dragState = {
        startX: e.screenX,
        startY: e.screenY,
        winX: window.screenX,
        winY: window.screenY
      };
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragState) return;
      const dx = e.screenX - dragState.startX;
      const dy = e.screenY - dragState.startY;
      api.moveWindow(dragState.winX + dx, dragState.winY + dy);
    });

    document.addEventListener('mouseup', () => {
      dragState = null;
    });
  }

  // ========== 窗口最大化状态同步 ==========
  async function syncMaximizeState() {
    try {
      const state = await send('windowIsMaximized');
      const btn = document.getElementById('winMaximize');
      if (btn && state && typeof state.maximized === 'boolean') {
        btn.classList.toggle('is-maximized', state.maximized);
        btn.title = state.maximized ? '还原' : '最大化';
      }
    } catch {
      // 忽略，非桌面端
    }
  }

  // ========== 窗口控制按钮绑定 ==========
  function initWindowControls() {
    if (!api.isAvailable) return;

    const minimizeBtn = document.getElementById('winMinimize');
    const maximizeBtn = document.getElementById('winMaximize');
    const closeBtn = document.getElementById('winClose');

    // 显示窗口控制区域
    const controls = document.getElementById('windowControls');
    if (controls) controls.style.display = 'flex';

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        api.minimizeWindow().catch(() => {});
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        // 先立刻切换图标，提供即时反馈
        maximizeBtn.classList.toggle('is-maximized');
        maximizeBtn.title = maximizeBtn.classList.contains('is-maximized') ? '还原' : '最大化';
        api.toggleMaximize()
          .then(() => setTimeout(syncMaximizeState, 100))
          .catch(() => syncMaximizeState());
      });

      // 双击标题栏空白区域切换最大化
      const header = document.querySelector('.header');
      if (header) {
        header.addEventListener('dblclick', (e) => {
          // 排除按钮、窗口控件、下拉菜单等交互元素
          if (e.target.closest('button, .window-controls, .header-folder-dropdown, .header-brand-icon')) return;
          if (maximizeBtn) {
            maximizeBtn.classList.toggle('is-maximized');
            maximizeBtn.title = maximizeBtn.classList.contains('is-maximized') ? '还原' : '最大化';
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

    // 监听最大化状态变化（定时轮询，windowIsMaximized 只读缓存字段，不阻塞 EDT）
    setInterval(syncMaximizeState, 1000);

    // 初始同步
    setTimeout(syncMaximizeState, 500);

    // 窗口 resize 时同步（例如拖拽改变窗口大小后还原/最大化）
    window.addEventListener('resize', syncMaximizeState);
  }

  const api = {
    get isAvailable() {
      return typeof window.cefQuery !== 'undefined';
    },

    // ===== 文件操作 =====
    readDir(path) {
      return send('readDir', { path });
    },

    readFile(path) {
      return send('readFile', { path }).then(result => {
        // JCEF bridge 对 U+10000 以上字符传输有 bug
        // 使用 base64 绕过编码问题
        if (result.encoding === 'base64') {
          const binary = atob(result.content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          result.content = new TextDecoder('utf-8').decode(bytes);
        }
        return result;
      });
    },

    writeFile(path, content) {
      // JCEF bridge 对 U+10000 以上字符传输有 bug，用 base64 绕过
      const encoded = new TextEncoder().encode(content);
      const base64 = btoa(String.fromCharCode(...encoded));
      return send('writeFile', { path, content: base64, encoding: 'base64' });
    },

    isDirectory(path) {
      return send('isDirectory', { path });
    },

    openFileDialog() {
      return send('openFileDialog');
    },

    /**
     * 打开系统"另存为"对话框，将 base64 内容保存到用户选择的路径。
     * 绕过 CEF 下载机制（blob URL 导航在 JCEF 中可能闪退）。
     *
     * @param {string} base64Content - 文件的 base64 编码内容
     * @param {string} suggestedName - 建议文件名（含扩展名）
     * @param {string} mimeType - MIME 类型（用于文件过滤器）
     * @returns {Promise<{path: string|null, size?: number}>}
     */
    saveFileDialog(base64Content, suggestedName, mimeType) {
      return send('saveFileDialog', {
        content: base64Content,
        suggestedName,
        mimeType,
      });
    },

    // ===== 工作区 =====
    getCurrentFolder() {
      return send('getCurrentFolder');
    },

    setCurrentFolder(path) {
      return send('setCurrentFolder', { path });
    },

    clearCurrentFolder() {
      return send('clearCurrentFolder').catch(() => {});
    },

    isDefaultWorkspace() {
      return send('isDefaultWorkspace');
    },

    getDefaultWorkspace() {
      return send('getDefaultWorkspace');
    },

    setDefaultWorkspace(path) {
      return send('setDefaultWorkspace', { path });
    },

    // ===== DevTools =====
    openDevTools() {
      return send('openDevTools');
    },

    // ===== 文件系统工具 =====
    showItemInFolder(path) {
      return send('showItemInFolder', { path });
    },

    createFile(path) {
      return send('createFile', { path });
    },

    createDir(path) {
      return send('createDir', { path });
    },

    rename(oldPath, newPath) {
      return send('rename', { oldPath, newPath });
    },

    deleteFile(path) {
      return send('deleteFile', { path });
    },

    // ===== 窗口控制 =====
    minimizeWindow() {
      return send('windowMinimize');
    },

    maximizeWindow() {
      return send('windowMaximize');
    },

    restoreWindow() {
      return send('windowRestore');
    },

    toggleMaximize() {
      return send('windowToggleMaximize');
    },

    closeWindow() {
      return send('windowClose');
    },

    isMaximized() {
      return send('windowIsMaximized').then(r => r && r.maximized);
    },

    moveWindow(x, y) {
      return send('windowMove', { x, y });
    },

    getWindowState() {
      return send('windowGetState');
    },

    // ===== 外部链接 =====
    openExternal(url) {
      return send('openExternal', { url });
    },

    // ===== 原生终端 =====
    openTerminal(path) {
      return send('openTerminal', { path });
    }
  };

  // ========== 桌面端初始化 ==========
  if (api.isAvailable) {
    document.body.classList.add('desktop-window');

    // 检查 WorkspaceManager 是否可用
    const ws = window.HippoWorkspace;

    // 文件夹操作组（打开 + 最近文件夹下拉）
    const folderGroup = document.getElementById('headerFolderGroup');
    const openBtn = document.getElementById('desktopOpenFolderBtn');
    const recentDropdown = document.getElementById('recentFoldersDropdown');

    if (folderGroup) folderGroup.style.display = '';

    // 打开文件夹按钮
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

      // 初始化时渲染一次，后续数据变化时 workspace-manager 内会同步更新
      if (ws && ws.isAvailable) {
        ws.renderRecentFolders?.();
      }

      folderGroup.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        recentDropdown.classList.add('show');
      });

      folderGroup.addEventListener('mouseleave', (e) => {
        // 如果鼠标移到了下拉菜单本身，不关闭
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

      // 点击下拉外部关闭
      document.addEventListener('click', (e) => {
        if (!folderGroup.contains(e.target) && !recentDropdown.contains(e.target)) {
          recentDropdown.classList.remove('show');
        }
      });
    }

    // 检查 WorkspaceManager 是否可用
    if (ws && ws.isAvailable) {
      // 恢复上次工作区，同时获取是否为默认工作区
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

    // DevTools 状态同步：Java 端在打开/关闭时调用此函数
    window.__devToolsOpen = function(open) {
      if (devtoolsBtn) {
        devtoolsBtn.disabled = open;
        devtoolsBtn.style.opacity = open ? '0.4' : '';
        devtoolsBtn.style.pointerEvents = open ? 'none' : '';
      }
    };

    // 刷新页面按钮
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.style.display = '';
      refreshBtn.addEventListener('click', () => {
        location.reload();
      });
    }

    // ========== 外部链接拦截：阻止 JCEF 导航，改走系统浏览器 ==========
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-external="true"]');
      if (!link) return;
      e.preventDefault();
      const url = link.getAttribute('href');
      if (url) {
        api.openExternal(url).catch(() => {
          // 兜底：直接用 JS 打开
          window.open(url, '_blank');
        });
      }
    });

    // 窗口控制按钮初始化（不再依赖 Java executeJavaScript 调用 _onReady）
    initWindowControls();
    initDrag();
  } else {
    console.warn('HippoDesktop: cefQuery not available, desktop-only features disabled');
  }

  return api;
})();

window.HippoDesktop = HippoDesktop;
