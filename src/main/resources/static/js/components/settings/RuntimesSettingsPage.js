/**
 * RuntimesSettingsPage — 运行时路径配置页面
 *
 * 配置各语言的运行时可执行文件路径（桌面端特有）：
 * - node（JS/TS/JSON/HTML/CSS）
 * - python（Python）
 * - go（Go）
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 * 文件选择器通过 HippoDesktop.openFileDialog() 唤起。
 */
import { showToast } from '../../utils/toast.js';

const RUNTIME_ITEMS = [
  { key: 'node',   label: 'Node.js',      hint: '用于 JS/TS/JSON/HTML/CSS 诊断', defaultPath: 'node',      icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { key: 'python', label: 'Python',       hint: '用于 Python 诊断',              defaultPath: 'python',    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { key: 'go',     label: 'Go',           hint: '用于 Go 诊断',                  defaultPath: 'go',        icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
];

export class RuntimesSettingsPage {
  constructor() {
    this._config = null;
    this._saveBtn = null;
    this._saveStatus = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';
    page.innerHTML = `
      <h2 class="settings-page-title">运行时路径</h2>
      <p class="settings-page-desc">配置各语言运行时可执行文件路径，解决系统 PATH 不完整的问题</p>
      <hr class="settings-page-divider">

      <div class="settings-loading" id="runtimesLoading" style="display:block;">加载中...</div>
      <div id="runtimesForm" style="display:none;"></div>
      <div class="settings-save-bar" id="runtimesSaveBar" style="display:none;">
        <button class="settings-save-btn" id="runtimesSaveBtn">保存配置</button>
        <span class="settings-editor-status" id="runtimesSaveStatus" style="display:none;"></span>
      </div>
    `;

    container.appendChild(page);
    this._loadConfig();
  }

  destroy() {
    this._config = null;
    this._saveBtn = null;
    this._saveStatus = null;
  }

  async _loadConfig() {
    const { HippoDesktop } = window;

    if (!HippoDesktop || !HippoDesktop.getConfig) {
      this._showError('配置 API 不可用（仅桌面端支持）');
      return;
    }

    try {
      const config = await HippoDesktop.getConfig();
      this._config = config.runtimes || {};
      this._renderForm();
    } catch (e) {
      console.warn('加载运行时配置失败:', e);
      this._showError('加载配置失败: ' + e.message);
    }
  }

  _showError(msg) {
    const form = document.getElementById('runtimesForm');
    const loading = document.getElementById('runtimesLoading');
    if (loading) loading.style.display = 'none';
    if (form) {
      form.style.display = 'block';
      form.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${msg}</p>`;
    }
  }

  _renderForm() {
    const loading = document.getElementById('runtimesLoading');
    const form = document.getElementById('runtimesForm');
    const saveBar = document.getElementById('runtimesSaveBar');
    if (loading) loading.style.display = 'none';
    if (!form) return;

    const runtimes = this._config;

    let itemsHtml = '';
    for (const rt of RUNTIME_ITEMS) {
      const currentPath = runtimes[rt.key] || '';
      const nameId = `runtime_${rt.key}_name`;
      const pathId = `runtime_${rt.key}_path`;
      const browseId = `runtime_${rt.key}_browse`;

      itemsHtml += `
        <div class="settings-field">
          <label class="settings-field-label" for="${pathId}">${rt.label}</label>
          <div class="settings-field-hint" style="margin:-2px 0 4px 0;">${rt.hint}</div>
          <div class="settings-input-wrap">
            <input class="settings-input settings-input-mono" id="${pathId}" type="text"
              value="${currentPath}" placeholder="${rt.defaultPath}（留空使用系统 PATH）">
            <button class="settings-input-btn desktop-only" id="${browseId}" title="选择可执行文件">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    form.style.display = 'block';
    form.innerHTML = `
      <div class="settings-field-group-title">运行时路径</div>
      <div class="settings-field-group">
        <div class="settings-form">
          ${itemsHtml}
        </div>
      </div>
      <p style="margin:12px 0 0 0;font-size:12px;color:var(--text-muted);">
        留空的运行时会使用系统 PATH 中的同名命令。桌面端可通过文件夹图标选择可执行文件。
      </p>
    `;

    // 绑定文件选择器
    for (const rt of RUNTIME_ITEMS) {
      const browseBtn = document.getElementById(`runtime_${rt.key}_browse`);
      const pathInput = document.getElementById(`runtime_${rt.key}_path`);
      if (browseBtn && pathInput) {
        browseBtn.addEventListener('click', async () => {
          try {
            const result = await window.HippoDesktop.openFileDialog();
            if (result && result.path) {
              pathInput.value = result.path;
            }
          } catch (e) {
            // 忽略
          }
        });
      }
    }

    // 保存按钮
    this._saveBtn = document.getElementById('runtimesSaveBtn');
    this._saveStatus = document.getElementById('runtimesSaveStatus');
    if (this._saveBtn) {
      this._saveBtn.addEventListener('click', () => this._saveConfig());
    }

    if (saveBar) saveBar.style.display = '';
  }

  async _saveConfig() {
    if (!this._saveBtn) return;
    this._saveBtn.disabled = true;
    this._saveBtn.textContent = '保存中…';

    try {
      const values = {};
      for (const rt of RUNTIME_ITEMS) {
        const input = document.getElementById(`runtime_${rt.key}_path`);
        const val = input?.value?.trim() || '';
        if (val) {
          values[rt.key] = val;
        }
      }

      const { HippoDesktop } = window;
      if (HippoDesktop?.updateConfig) {
        await HippoDesktop.updateConfig({ runtimes: values });
      } else {
        throw new Error('updateConfig 不可用');
      }

      if (this._saveStatus) {
        this._saveStatus.textContent = '✓ 配置已保存';
        this._saveStatus.className = 'settings-editor-status settings-editor-status-success';
        this._saveStatus.style.display = 'block';
      }
      if (this._saveBtn) {
        this._saveBtn.textContent = '✓ 已保存';
      }
      setTimeout(() => {
        if (this._saveBtn) {
          this._saveBtn.disabled = false;
          this._saveBtn.textContent = '保存配置';
        }
        if (this._saveStatus) {
          this._saveStatus.style.display = 'none';
        }
      }, 1200);
    } catch (e) {
      console.warn('保存运行时配置失败:', e);
      if (this._saveStatus) {
        this._saveStatus.textContent = '⚠️ 保存失败: ' + e.message;
        this._saveStatus.className = 'settings-editor-status settings-editor-status-error';
        this._saveStatus.style.display = 'block';
      }
      if (this._saveBtn) {
        this._saveBtn.disabled = false;
        this._saveBtn.textContent = '保存配置';
      }
    }
  }
}
