/**
 * GeneralSettingsPage — 通用设置页面
 *
 * 主题切换、默认工作区路径
 */
export class GeneralSettingsPage {
  constructor() {
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">通用设置</h2>
      <p class="settings-page-desc">界面、行为等通用偏好设置</p>
      <hr class="settings-page-divider">
      <div class="settings-field-group-title">基本偏好</div>
      <div class="settings-field-group">
      <div class="settings-form">
        <div class="settings-field-horizontal">
          <label class="settings-field-label">主题模式</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsThemeToggle">
              <button class="settings-toggle-btn" data-value="light">浅色</button>
              <button class="settings-toggle-btn" data-value="dark">深色</button>
              <button class="settings-toggle-btn" data-value="system">跟随系统</button>
            </div>
          </div>
        </div>
        <div class="settings-field desktop-only">
          <label class="settings-field-label" for="settingsDefaultWorkspace">
            默认工作区路径 <span class="settings-field-hint">(留空使用内置默认)</span>
          </label>
          <div class="settings-input-wrap">
            <input class="settings-input" id="settingsDefaultWorkspace" type="text" placeholder="留空则使用内置默认路径">
            <button class="settings-input-btn" id="settingsDefaultWorkspaceBrowse" title="选择文件夹">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      </div>
    `;

    container.appendChild(page);

    // 读取当前主题
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'system';
    document.querySelectorAll('#settingsThemeToggle .settings-toggle-btn').forEach(btn => {
      if (btn.dataset.value === currentTheme) btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsThemeToggle .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.dataset.value;
        if (theme === 'system') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', theme);
        }
        localStorage.setItem('hippo-theme', theme);
      });
    });

    // ── 工作区路径 ──
    const browseBtn = document.getElementById('settingsDefaultWorkspaceBrowse');
    if (browseBtn && window.HippoDesktop?.selectDirectory) {
      browseBtn.addEventListener('click', async () => {
        try {
          const result = await window.HippoDesktop.selectDirectory();
          if (result?.path) {
            document.getElementById('settingsDefaultWorkspace').value = result.path;
          }
        } catch (e) {
          // ignore
        }
      });
    }

    // 加载默认工作区路径
    const workspaceInput = document.getElementById('settingsDefaultWorkspace');
    if (workspaceInput && window.HippoDesktop?.getDefaultWorkspace) {
      window.HippoDesktop.getDefaultWorkspace().then(result => {
        workspaceInput.value = result?.path || '';
      }).catch(() => {});
    }

    // 失焦时自动保存工作区路径
    if (workspaceInput && window.HippoDesktop?.setDefaultWorkspace) {
      workspaceInput.addEventListener('change', () => {
        window.HippoDesktop.setDefaultWorkspace(workspaceInput.value.trim()).catch(() => {});
      });
    }
  }

  destroy() {
    this._container = null;
  }
}
