/**
 * GeneralSettingsPage — 通用设置页面
 *
 * 主题切换、默认工作区路径
 */
import { appState } from '../../state/app-state.js';

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
              <button class="settings-toggle-btn" data-value="midnight">Midnight</button>
              <button class="settings-toggle-btn" data-value="system">跟随系统</button>
            </div>
          </div>
        </div>
        <div class="settings-field-horizontal desktop-only desktop-only-flex">
          <div class="settings-field-label">
            <div>默认工作区路径</div>
            <div class="settings-field-hint">(留空使用内置默认)</div>
          </div>
          <div class="settings-field-body" style="flex:1;">
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
        <div class="settings-field-horizontal desktop-only desktop-only-flex">
          <label class="settings-field-label">面板布局</label>
          <div class="settings-field-body">
            <div class="settings-toggle-group" id="settingsLayoutToggle">
              <button class="settings-toggle-btn" data-value="preview-left">预览在左</button>
              <button class="settings-toggle-btn" data-value="chat-left">聊天在左</button>
            </div>
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
          localStorage.setItem('hippo-theme', 'system');
        } else {
          appState.setTheme(theme);
        }
      });
    });

    // ── 工作区路径 ──
    const browseBtn = document.getElementById('settingsDefaultWorkspaceBrowse');
    if (browseBtn && window.HippoDesktop?.openFileDialog) {
      browseBtn.addEventListener('click', async () => {
        try {
          const result = await window.HippoDesktop.openFileDialog();
          if (result?.path) {
            const input = document.getElementById('settingsDefaultWorkspace');
            input.value = result.path;
            input.dispatchEvent(new Event('change', { bubbles: true }));
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

    // ── 面板布局切换 ──
    const mainContainer = document.querySelector('.main-container');
    const currentLayout = localStorage.getItem('hippo-layout') || 'preview-left';
    document.querySelectorAll('#settingsLayoutToggle .settings-toggle-btn').forEach(btn => {
      if (btn.dataset.value === currentLayout) btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsLayoutToggle .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const layout = btn.dataset.value;
        localStorage.setItem('hippo-layout', layout);
        if (mainContainer) {
          mainContainer.classList.toggle('layout-chat-first', layout === 'chat-left');
        }
      });
    });
  }

  destroy() {
    this._container = null;
  }
}
