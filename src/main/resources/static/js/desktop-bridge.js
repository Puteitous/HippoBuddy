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

    function truncatePath(path, maxLen) {
        maxLen = maxLen || 45;
        if (path.length <= maxLen) return path;
        const parts = path.replace(/\\/g, '/').split('/');
        if (parts.length <= 2) return path;
        const head = parts.slice(0, 2).join('/');
        const tail = parts.slice(-2).join('/');
        return head + '/.../' + tail;
    }

    const indicator = document.getElementById('workspaceIndicator');
    const pathEl = document.getElementById('workspacePath');
    const clearBtn = document.getElementById('workspaceClear');

    function showIndicator(path) {
        if (!indicator || !pathEl) return;
        pathEl.textContent = truncatePath(path);
        pathEl.title = path;
        indicator.style.display = '';
    }

    function hideIndicator() {
        if (!indicator) return;
        indicator.style.display = 'none';
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

        openFileDialog() {
            return send('openFileDialog');
        },

        getCurrentFolder() {
            return send('getCurrentFolder');
        },

        setCurrentFolder(path) {
            return send('setCurrentFolder', { path });
        }
    };

    if (api.isAvailable) {
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                send('clearCurrentFolder').catch(() => {});
                hideIndicator();
                showToast('工作区已清除');
            });
        }

        const btn = document.getElementById('desktopOpenFolderBtn');
        if (btn) {
            btn.style.display = '';
            btn.addEventListener('click', () => {
                api.openFileDialog()
                    .then((result) => {
                        if (result && result.path) {
                            api.setCurrentFolder(result.path);
                            showIndicator(result.path);
                            showToast('工作区已切换: ' + result.path);
                        }
                    })
                    .catch((err) => {
                        console.error('DesktopBridge: openFileDialog failed', err);
                        showToast('打开文件夹失败: ' + err.message);
                    });
            });
        }

        api.getCurrentFolder().then((result) => {
            if (result && result.path) {
                showIndicator(result.path);
            }
        }).catch(() => {});
    } else {
        console.warn('HippoDesktop: cefQuery not available, desktop-only features disabled');
    }

    return api;
})();

window.HippoDesktop = HippoDesktop;
