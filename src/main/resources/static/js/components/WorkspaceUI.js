export class WorkspaceUI {
  constructor({ onOpenFolder, onClear, showToast }) {
    this._onOpenFolder = onOpenFolder || null;
    this._onClear = onClear || null;
    this._showToast = showToast || null;

    this._indicator = document.getElementById('workspaceIndicator');
    this._pathEl = document.getElementById('workspacePath');
    this._clearBtn = document.getElementById('workspaceClear');
    this._openBtn = document.getElementById('desktopOpenFolderBtn');

    this._bindEvents();
  }

  _bindEvents() {
    if (this._clearBtn && this._onClear) {
      this._clearBtn.addEventListener('click', () => {
        this._onClear();
        this.hide();
        if (this._showToast) this._showToast('工作区已清除');
      });
    }

    if (this._openBtn) {
      this._openBtn.style.display = '';
      this._openBtn.addEventListener('click', () => {
        if (this._onOpenFolder) {
          this._onOpenFolder().then((path) => {
            if (path) {
              this.show(path);
              if (this._showToast) this._showToast('工作区已切换: ' + path);
            }
          }).catch((err) => {
            console.error('WorkspaceUI: openFolder failed', err);
            if (this._showToast) this._showToast('打开文件夹失败: ' + err.message);
          });
        }
      });
    }
  }

  show(path) {
    if (!this._indicator || !this._pathEl) return;
    this._pathEl.textContent = WorkspaceUI.truncatePath(path);
    this._pathEl.title = path;
    this._indicator.style.display = '';
  }

  hide() {
    if (!this._indicator) return;
    this._indicator.style.display = 'none';
  }

  static truncatePath(path, maxLen = 45) {
    if (path.length <= maxLen) return path;
    const parts = path.replace(/\\/g, '/').split('/');
    if (parts.length <= 2) return path;
    const head = parts.slice(0, 2).join('/');
    const tail = parts.slice(-2).join('/');
    return head + '/.../' + tail;
  }
}
