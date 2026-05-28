import { WorkspaceUI } from './components/WorkspaceUI.js';

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
        const workspaceUI = new WorkspaceUI({
            showToast,
            onClear: () => send('clearCurrentFolder').catch(() => {}),
            onOpenFolder: async () => {
                const result = await api.openFileDialog();
                if (result && result.path) {
                    await api.setCurrentFolder(result.path);
                    return result.path;
                }
                return null;
            }
        });

        api.getCurrentFolder().then((result) => {
            if (result && result.path) {
                workspaceUI.show(result.path);
            }
        }).catch(() => {});
    } else {
        console.warn('HippoDesktop: cefQuery not available, desktop-only features disabled');
    }

    return api;
})();

window.HippoDesktop = HippoDesktop;
