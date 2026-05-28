export class SplashScreen {
  constructor({ rightPanelShowBtn } = {}) {
    this._rightPanelShowBtn = rightPanelShowBtn || document.getElementById('rightPanelShowBtn');
    this._splashCleanupTimer = null;
  }

  startAnimation() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        splash.classList.add('splash-animating');
      });
    });

    splash.addEventListener('click', () => this._skip(), { once: true });
  }

  _skip() {
    const splash = document.getElementById('splashScreen');
    if (!splash || splash.classList.contains('splash-hidden')) return;

    if (this._splashCleanupTimer) {
      clearTimeout(this._splashCleanupTimer);
      this._splashCleanupTimer = null;
    }

    splash.classList.add('splash-hidden');

    setTimeout(() => {
      splash.style.display = 'none';
      document.body.classList.remove('page-loading');
      this._updateRightPanelUI();
    }, 150);
  }

  scheduleCleanup() {
    const splash = document.getElementById('splashScreen');
    if (!splash) {
      document.body.classList.remove('page-loading');
      return;
    }

    this._splashCleanupTimer = setTimeout(() => {
      splash.classList.add('splash-hidden');

      this._splashCleanupTimer = setTimeout(() => {
        splash.style.display = 'none';
        document.body.classList.remove('page-loading');
        this._updateRightPanelUI();
      }, 600);
    }, 2400);
  }

  _updateRightPanelUI() {
    const rp = document.getElementById('rightPanel');
    const rpt = document.getElementById('rightPanelToggle');
    if (rpt) rpt.title = '展开右侧面板';
    if (this._rightPanelShowBtn) {
      this._rightPanelShowBtn.style.display = '';
    }
  }
}
