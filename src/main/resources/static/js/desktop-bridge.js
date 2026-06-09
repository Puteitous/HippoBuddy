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

const HippoDesktop = (() => {
  function send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!window.cefQuery) {
        reject(new Error('Not running in JCEF environment'));
        return;
      }
      window.cefQuery({
        request: JSON.stringify({ action, ...payload }),
        onSuccess: (response) => {
          try {
            resolve(JSON.parse(response));
          } catch {
            resolve(response);
          }
        },
        onFailure: (errCode, errMsg) => {
          reject(new Error(errMsg || `Error ${errCode}`));
        }
      });
    });
  }

  function showToast(msg) {
    const existing = document.getElementById('hippoDesktopToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'hippoDesktopToast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: '#1e1e1e', color: '#fff', padding: '10px 20px', borderRadius: '8px',
      fontSize: '14px', zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      opacity: '0', transition: 'opacity 0.3s'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ========== 拖拽状态 ==========
  let dragState = null;

  function initDrag() {
    const header = document.querySelector('.header');
    const brand = document.querySelector('.header-brand');
    if (!header || !brand) return;

    // 只有桌面端才启用拖拽
    if (!api.isAvailable) return;

    brand.addEventListener('mousedown', (e) => {
      // 排除对按钮/可交互元素的拖拽
      if (e.target.closest('button, .header-brand-icon, input, textarea, select')) return;

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
      const state = await send('windowGetState');
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

      // 双击标题栏切换最大化
      const brand = document.querySelector('.header-brand');
      if (brand) {
        brand.addEventListener('dblclick', (e) => {
          if (e.target.closest('button, .header-brand-icon')) return;
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

    // 监听最大化状态变化（定时轮询 + 事件后检查）
    setInterval(syncMaximizeState, 1000);

    // 初始同步
    setTimeout(syncMaximizeState, 500);

    // 窗口 resize 时也同步
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
      return send('readFile', { path });
    },

    writeFile(path, content) {
      return send('writeFile', { path, content });
    },

    openFileDialog() {
      return send('openFileDialog');
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

    // ===== DevTools =====
    openDevTools() {
      return send('openDevTools');
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
    }
  };

  // ========== 桌面端初始化 ==========
  if (api.isAvailable) {
    document.body.classList.add('desktop-window');

    // 检查 WorkspaceManager 是否可用
    const ws = window.HippoWorkspace;
    if (ws && ws.isAvailable) {
      // 打开文件夹按钮
      const openBtn = document.getElementById('desktopOpenFolderBtn');
      if (openBtn) {
        openBtn.style.display = '';
        openBtn.addEventListener('click', async () => {
          try {
            const result = await api.openFileDialog();
            if (result && result.path) {
              await api.setCurrentFolder(result.path);
              await ws.openWorkspace(result.path);
              showToast('工作区已切换: ' + result.path);
            }
          } catch (err) {
            console.error('openFolder failed', err);
            showToast('打开文件夹失败: ' + err.message);
          }
        });
      }

      // 恢复上次工作区
      api.getCurrentFolder().then((result) => {
        if (result && result.path) {
          ws.openWorkspace(result.path);
        }
      }).catch(() => {});
    } else {
      console.warn('HippoDesktop: HippoWorkspace not available');
      // 降级：只显示按钮，打开文件夹后只更新 indicator
      const openBtn = document.getElementById('desktopOpenFolderBtn');
      if (openBtn) {
        openBtn.style.display = '';
        openBtn.addEventListener('click', async () => {
          try {
            const result = await api.openFileDialog();
            if (result && result.path) {
              await api.setCurrentFolder(result.path);
              showToast('工作区已切换: ' + result.path);
            }
          } catch (err) {
            console.error('openFolder failed', err);
          }
        });
      }
    }

    // DevTools 按钮
    const devtoolsBtn = document.getElementById('devtoolsBtn');
    if (devtoolsBtn) {
      devtoolsBtn.style.display = '';
      devtoolsBtn.addEventListener('click', () => {
        api.openDevTools();
        showToast('正在打开 DevTools...');
      });
    }

    // 窗口控制按钮初始化（不再依赖 Java executeJavaScript 调用 _onReady）
    initWindowControls();
    initDrag();
  } else {
    console.warn('HippoDesktop: cefQuery not available, desktop-only features disabled');
  }

  return api;
})();

window.HippoDesktop = HippoDesktop;
