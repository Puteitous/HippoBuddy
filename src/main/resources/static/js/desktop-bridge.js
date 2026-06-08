/**
 * HippoDesktop — JCEF JS↔Java 双向通信桥
 *
 * 提供桌面端特有能力：
 *   1. 文件系统操作（readDir, readFile, writeFile）
 *   2. 系统对话框（openFileDialog）
 *   3. 工作区管理（get/set/clearCurrentFolder）
 *   4. 集成 HippoWorkspace 文件树/标签/预览
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

  const api = {
    get isAvailable() {
      return typeof window.cefQuery !== 'undefined';
    },

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

    getCurrentFolder() {
      return send('getCurrentFolder');
    },

    setCurrentFolder(path) {
      return send('setCurrentFolder', { path });
    },

    clearCurrentFolder() {
      return send('clearCurrentFolder').catch(() => {});
    },

    openDevTools() {
      return send('openDevTools');
    }
  };

  // ========== 桌面端初始化 ==========
  if (api.isAvailable) {
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
  } else {
    console.warn('HippoDesktop: cefQuery not available, desktop-only features disabled');
  }

  // ========== DevTools 按钮 ==========
  const devtoolsBtn = document.getElementById('devtoolsBtn');
  if (devtoolsBtn && api.isAvailable) {
    devtoolsBtn.style.display = '';
    devtoolsBtn.addEventListener('click', () => {
      api.openDevTools();
      showToast('正在打开 DevTools...');
    });
  }

  return api;
})();

window.HippoDesktop = HippoDesktop;
