/**
 * McpSettingsPage — MCP 配置页面
 *
 * 配置 MCP 服务：
 * - enabled / autoConnect / autoReconnect
 * - maxReconnectAttempts / reconnectDelaySeconds
 * - requestTimeout
 * - servers[] — 服务器列表 CRUD
 *
 * 每个服务器条目：
 * - id, name, type (stdio/sse)
 * - stdio: command + args
 * - sse: url
 * - env (key-value pairs)
 * - autoRegisterTools
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 * 自动保存：checkbox/dropdown 变更后立即保存，服务器编辑单独保存。
 */
import { showToast } from '../../utils/toast.js';
import { CustomDropdown } from '../../utils/dropdown.js';
import { ConfirmDialog } from '../../utils/modal.js';

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

const SERVER_TYPES = [
  { value: 'stdio', label: _t('settingsPage.mcpStdio') },
  { value: 'sse', label: _t('settingsPage.mcpSse') },
];

const MAX_RECONNECT_ITEMS = [
  { label: _t('settingsPage.mcpUnlimited'), value: '0' },
  { label: '3', value: '3' },
  { label: _t('settingsPage.mcpDefault', { n: '5' }), value: '5' },
  { label: '10', value: '10' },
  { label: '20', value: '20' },
];

const RECONNECT_DELAY_ITEMS = [
  { label: _t('settingsPage.mcpSec', { n: '1' }), value: '1' },
  { label: _t('settingsPage.mcpSec', { n: '3' }), value: '3' },
  { label: _t('settingsPage.mcpSecDefault', { n: '5' }), value: '5' },
  { label: _t('settingsPage.mcpSec', { n: '10' }), value: '10' },
  { label: _t('settingsPage.mcpSec', { n: '30' }), value: '30' },
];

const REQ_TIMEOUT_ITEMS = [
  { label: _t('settingsPage.mcpSec', { n: '10' }), value: '10000' },
  { label: _t('settingsPage.mcpSec', { n: '30' }), value: '30000' },
  { label: _t('settingsPage.mcpSecDefault', { n: '60' }), value: '60000' },
  { label: _t('settingsPage.mcpSec', { n: '120' }), value: '120000' },
  { label: _t('settingsPage.mcpSec', { n: '300' }), value: '300000' },
];

/** value 转换成 label 显示 */
function _timeoutLabel(valueMs, items) {
  const found = items.find(i => i.value === String(valueMs));
  return found ? found.label : _t('settingsPage.mcpMs', { n: String(valueMs) });
}

function _reconnectLabel(value, items) {
  const found = items.find(i => i.value === String(value));
  return found ? found.label : String(value);
}

export class McpSettingsPage {
  constructor() {
    this._config = null;
    this._editingServer = null; // 正在编辑的服务器 index
    this._maxReconnectDropdown = null;
    this._reconnectDelayDropdown = null;
    this._reqTimeoutDropdown = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';
    page.innerHTML = `
      <h2 class="settings-page-title">${_t('settingsPage.mcpTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.mcpDesc')}</p>
      <hr class="settings-page-divider">

      <div class="settings-loading" id="mcpLoading" style="display:block;">${_t('settingsPage.rulesLoading')}</div>
      <div id="mcpForm" style="display:none;"></div>
    `;

    container.appendChild(page);
    this._loadConfig();
  }

  destroy() {
    if (this._maxReconnectDropdown) this._maxReconnectDropdown.destroy();
    if (this._reconnectDelayDropdown) this._reconnectDelayDropdown.destroy();
    if (this._reqTimeoutDropdown) this._reqTimeoutDropdown.destroy();
    this._config = null;
    this._editingServer = null;
  }

  async _loadConfig() {
    const { HippoDesktop } = window;

    if (!HippoDesktop || !HippoDesktop.getConfig) {
      this._showError(_t('settingsPage.configUnavailable'));
      return;
    }

    try {
      const config = await HippoDesktop.getConfig();
      this._config = config.mcp || {};
      this._renderForm();
    } catch (e) {
      console.warn('加载 MCP 配置失败:', e);
      this._showError(_t('settingsPage.loadFailed') + e.message);
    }
  }

  _showError(msg) {
    const form = document.getElementById('mcpForm');
    const loading = document.getElementById('mcpLoading');
    if (loading) loading.style.display = 'none';
    if (form) {
      form.style.display = 'block';
      form.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${msg}</p>`;
    }
  }

  _renderForm() {
    const loading = document.getElementById('mcpLoading');
    const form = document.getElementById('mcpForm');
    if (loading) loading.style.display = 'none';
    if (!form) return;

    const mcp = this._config;

    form.style.display = 'block';
    form.innerHTML = `
      <!-- ===== 基本设置 ===== -->
      <div class="settings-field-group-title">${_t('settingsPage.mcpBasic')}</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.mcpEnabled')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpEnabled" ${mcp.enabled !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.mcpAutoConnect')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpAutoConnect" ${mcp.auto_connect !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.mcpAutoReconnect')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpAutoReconnect" ${mcp.auto_reconnect !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.mcpMaxReconnect')}</div>
              <div class="settings-field-hint">${_t('settingsPage.mcpMaxReconnectHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="mcpMaxReconnect">${_reconnectLabel(mcp.max_reconnect_attempts ?? 5, MAX_RECONNECT_ITEMS)}</button>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.mcpReconnectDelay')}</div>
              <div class="settings-field-hint">${_t('settingsPage.mcpReconnectHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="mcpReconnectDelay">${_reconnectLabel(mcp.reconnect_delay_seconds ?? 5, RECONNECT_DELAY_ITEMS)}</button>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <div class="settings-field-label">
              <div>${_t('settingsPage.mcpReqTimeout')}</div>
              <div class="settings-field-hint">${_t('settingsPage.mcpTimeoutHint')}</div>
            </div>
            <div class="settings-field-body">
              <button class="settings-input settings-provider-btn" id="mcpReqTimeout">${_timeoutLabel(mcp.request_timeout ?? 60000, REQ_TIMEOUT_ITEMS)}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 服务器列表 ===== -->
      <div class="settings-item-list-header">
        <h3>${_t('settingsPage.mcpServers')} (${(mcp.servers || []).length})</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-primary" id="mcpServerAdd">+ ${_t('settingsPage.mcpAddServer')}</button>
        </div>
      </div>
      <div id="mcpServerList"></div>
    `;

    // 初始化下拉框（每个都绑定 onSelect 自动保存）
    this._maxReconnectDropdown = new CustomDropdown({
      trigger: document.getElementById('mcpMaxReconnect'),
      items: MAX_RECONNECT_ITEMS,
      selectedValue: String(mcp.max_reconnect_attempts ?? 5),
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });
    this._reconnectDelayDropdown = new CustomDropdown({
      trigger: document.getElementById('mcpReconnectDelay'),
      items: RECONNECT_DELAY_ITEMS,
      selectedValue: String(mcp.reconnect_delay_seconds ?? 5),
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });
    this._reqTimeoutDropdown = new CustomDropdown({
      trigger: document.getElementById('mcpReqTimeout'),
      items: REQ_TIMEOUT_ITEMS,
      selectedValue: String(mcp.request_timeout ?? 60000),
      placement: 'bottom-left',
      onSelect: () => this._saveConfig(),
    });

    // 绑定 checkbox 自动保存
    const checkboxIds = ['mcpEnabled', 'mcpAutoConnect', 'mcpAutoReconnect'];
    checkboxIds.forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this._saveConfig());
    });

    // 添加服务器按钮
    document.getElementById('mcpServerAdd')?.addEventListener('click', () => this._showServerEditor(null));

    // 渲染服务器列表
    this._renderServerList();
  }

  _renderServerList() {
    const listEl = document.getElementById('mcpServerList');
    if (!listEl) return;

    const servers = this._config.servers || [];

    if (servers.length === 0) {
      listEl.innerHTML = `<div class="settings-items-empty">${_t('settingsPage.mcpNoServers')}<br><span style="font-size:11px;opacity:0.6;">${_t('settingsPage.mcpAddFirst')}</span></div>`;
      return;
    }

    listEl.innerHTML = '';
    const group = document.createElement('div');
    group.className = 'settings-item-group';

    const items = document.createElement('div');
    items.className = 'settings-items';

    servers.forEach((server, i) => {
      const item = document.createElement('div');
      item.className = 'settings-item settings-item-clickable';
      item.addEventListener('click', () => this._showServerEditor(i));

      // 类型标签
      const typeBadge = document.createElement('span');
      typeBadge.className = 'settings-item-badge';
      typeBadge.textContent = server.type === 'sse' ? 'SSE' : 'STDIO';
      typeBadge.style.marginRight = '6px';
      item.appendChild(typeBadge);

      // 信息
      const info = document.createElement('div');
      info.className = 'settings-item-info';

      const name = document.createElement('div');
      name.className = 'settings-item-name';
      name.textContent = server.name || server.id || _t('settingsPage.mcpUnnamed');
      info.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'settings-item-meta';
      if (server.type === 'sse') {
        meta.textContent = server.url || '';
      } else {
        meta.textContent = server.command ? server.command + (server.args?.length ? ' ' + server.args.join(' ') : '') : '';
      }
      info.appendChild(meta);

      item.appendChild(info);

      // 自动注册标签
      if (server.auto_register_tools !== false) {
        const badge = document.createElement('span');
        badge.className = 'settings-item-badge';
        badge.textContent = _t('settingsPage.mcpAutoRegister');
        badge.style.marginRight = '6px';
        item.appendChild(badge);
      }

      // 删除按钮
      const delBtn = document.createElement('button');
      delBtn.className = 'settings-item-del';
      delBtn.title = _t('settingsPage.rulesRefresh');
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteServer(i);
      });
      item.appendChild(delBtn);

      items.appendChild(item);
    });

    group.appendChild(items);
    listEl.appendChild(group);
  }

  async _deleteServer(index) {
    const servers = this._config.servers || [];
    const server = servers[index];
    if (!server) return;

    const name = server.name || server.id || _t('settingsPage.mcpUnnamed');
    const confirmed = await ConfirmDialog.confirmDelete(_t('settingsPage.mcpDeleteConfirm') + name + _t('settingsPage.mcpDeleteConfirmEnd'));
    if (!confirmed) return;

    servers.splice(index, 1);
    this._config.servers = servers;
    this._renderServerList();
    // 删除后自动保存
    this._saveConfig();
    showToast(_t('settingsPage.mcpServerDeleted') + name, { type: 'success', duration: 2000 });
  }

  _showServerEditor(index) {
    this._editingServer = index;
    const servers = this._config.servers || [];
    const server = index !== null && index >= 0 ? { ...servers[index] } : this._createEmptyServer();

    const listEl = document.getElementById('mcpServerList');
    if (!listEl) return;

    // 隐藏添加按钮
    const addBtn = document.getElementById('mcpServerAdd');
    if (addBtn) addBtn.style.display = 'none';

    const isNew = index === null || index < 0 || index >= servers.length;
    const type = server.type || 'stdio';
    const argsStr = (server.args || []).join(' ');
    const envEntries = Object.entries(server.env || {});

    let envHtml = '';
    if (envEntries.length === 0) {
      envHtml = `<div class="mcp-env-empty" style="font-size:12px;color:var(--text-muted);">${_t('settingsPage.mcpEnvNone')}</div>`;
    } else {
      envHtml = envEntries.map(([k, v], ei) => `
        <div class="mcp-env-row" style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
          <input class="settings-input mcp-env-key" type="text" value="${this._escapeHtml(k)}" placeholder="KEY" style="flex:1;font-family:var(--font-mono);font-size:12px;padding:4px 6px;">
          <input class="settings-input mcp-env-value" type="text" value="${this._escapeHtml(v)}" placeholder="VALUE" style="flex:2;font-family:var(--font-mono);font-size:12px;padding:4px 6px;">
          <button class="settings-input-btn mcp-env-remove" title="删除" style="padding:4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `).join('');
    }

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">${isNew ? _t('settingsPage.mcpAddServerTitle') : _t('settingsPage.mcpEditServerTitle')}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="mcpServerEditorBack">${_t('settingsPage.mcpBackToList')}</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="mcpServerEditorSave">${isNew ? _t('settingsPage.mcpAdd') : _t('settingsPage.mcpSave')}</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="mcpServerId">${_t('settingsPage.mcpServerId')} <span class="settings-field-hint">${_t('settingsPage.mcpServerIdHint')}</span></label>
            <input class="settings-input" id="mcpServerId" type="text" value="${this._escapeHtml(server.id || '')}" placeholder="${_t('settingsPage.mcpServerIdPh')}" ${!isNew ? 'readonly style="background:var(--bg-subtle);"' : ''}>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpServerName">${_t('settingsPage.mcpServerName')}</label>
            <input class="settings-input" id="mcpServerName" type="text" value="${this._escapeHtml(server.name || '')}" placeholder="${_t('settingsPage.mcpServerNamePh')}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">${_t('settingsPage.mcpType')}</label>
            <div class="settings-toggle-group" id="mcpServerType">
              ${SERVER_TYPES.map(t => `
                <button class="settings-toggle-btn ${t.value === type ? 'active' : ''}" data-value="${t.value}">${t.label}</button>
              `).join('')}
            </div>
          </div>

          <!-- STDIO 字段 -->
          <div id="mcpServerStdioFields" class="mcp-type-fields" style="display:${type === 'stdio' ? 'block' : 'none'};">
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerCommand">${_t('settingsPage.mcpCommand')}</label>
              <input class="settings-input" id="mcpServerCommand" type="text" value="${this._escapeHtml(server.command || '')}" placeholder="${_t('settingsPage.mcpCommandPh')}">
            </div>
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerArgs">${_t('settingsPage.mcpArgs')} <span class="settings-field-hint">${_t('settingsPage.mcpArgsHint')}</span></label>
              <input class="settings-input" id="mcpServerArgs" type="text" value="${this._escapeHtml(argsStr)}" placeholder="${_t('settingsPage.mcpArgsPh')}">
            </div>
          </div>

          <!-- SSE 字段 -->
          <div id="mcpServerSseFields" class="mcp-type-fields" style="display:${type === 'sse' ? 'block' : 'none'};">
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerUrl">${_t('settingsPage.mcpUrl')}</label>
              <input class="settings-input" id="mcpServerUrl" type="text" value="${this._escapeHtml(server.url || '')}" placeholder="${_t('settingsPage.mcpUrlPh')}">
            </div>
          </div>

          <!-- 环境变量 -->
          <div class="settings-field">
            <label class="settings-field-label">
              ${_t('settingsPage.mcpEnvVars')}
              <span class="settings-field-hint">${_t('settingsPage.mcpEnvHint')}</span>
            </label>
            <div id="mcpServerEnvList" style="margin-bottom:6px;">
              ${envHtml}
            </div>
            <button class="settings-btn" id="mcpServerEnvAdd" style="font-size:12px;">+ ${_t('settingsPage.mcpEnvAdd')}</button>
          </div>

          <!-- 自动注册工具 -->
          <div class="settings-field-horizontal">
            <label class="settings-field-label">${_t('settingsPage.mcpAutoRegTools')}</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpServerAutoReg" ${server.auto_register_tools !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定类型切换
    document.querySelectorAll('#mcpServerType .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mcpServerType .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.value;
        document.getElementById('mcpServerStdioFields').style.display = t === 'stdio' ? 'block' : 'none';
        document.getElementById('mcpServerSseFields').style.display = t === 'sse' ? 'block' : 'none';
      });
    });

    // 环境变量增删
    document.getElementById('mcpServerEnvAdd')?.addEventListener('click', () => this._addEnvRow());
    document.querySelectorAll('.mcp-env-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.mcp-env-row')?.remove();
      });
    });

    // 返回
    document.getElementById('mcpServerEditorBack')?.addEventListener('click', () => this._closeServerEditor());

    // 保存
    document.getElementById('mcpServerEditorSave')?.addEventListener('click', () => this._saveServerEditor(isNew));
  }

  _addEnvRow() {
    const list = document.getElementById('mcpServerEnvList');
    if (!list) return;

    // 移除空状态提示
    const empty = list.querySelector('.mcp-env-empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'mcp-env-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';
    row.innerHTML = `
      <input class="settings-input mcp-env-key" type="text" placeholder="KEY"
        style="flex:1;font-family:var(--font-mono);font-size:12px;padding:4px 6px;">
      <input class="settings-input mcp-env-value" type="text" placeholder="VALUE"
        style="flex:2;font-family:var(--font-mono);font-size:12px;padding:4px 6px;">
      <button class="settings-input-btn mcp-env-remove" title="${_t('settingsPage.rulesRefresh')}" style="padding:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    list.appendChild(row);

    row.querySelector('.mcp-env-remove').addEventListener('click', () => row.remove());
  }

  _collectEnvFromForm() {
    const rows = document.querySelectorAll('#mcpServerEnvList .mcp-env-row');
    const env = {};
    rows.forEach(row => {
      const key = row.querySelector('.mcp-env-key')?.value?.trim();
      const val = row.querySelector('.mcp-env-value')?.value?.trim();
      if (key) {
        env[key] = val || '';
      }
    });
    return env;
  }

  _saveServerEditor(isNew) {
    const idInput = document.getElementById('mcpServerId');
    const nameInput = document.getElementById('mcpServerName');
    const typeBtn = document.querySelector('#mcpServerType .settings-toggle-btn.active');
    const commandInput = document.getElementById('mcpServerCommand');
    const argsInput = document.getElementById('mcpServerArgs');
    const urlInput = document.getElementById('mcpServerUrl');
    const autoRegChecked = document.getElementById('mcpServerAutoReg')?.checked;

    const id = idInput?.value?.trim();
    if (!id) {
      showToast(_t('settingsPage.mcpServerIdRequired'), { type: 'warning', duration: 2000 });
      return;
    }

    const type = typeBtn?.dataset.value || 'stdio';
    const server = {
      id,
      name: nameInput?.value?.trim() || id,
      type,
      auto_register_tools: autoRegChecked ?? true,
    };

    if (type === 'stdio') {
      server.command = commandInput?.value?.trim() || '';
      const argsRaw = argsInput?.value?.trim() || '';
      server.args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
      server.env = this._collectEnvFromForm();
    } else {
      server.url = urlInput?.value?.trim() || '';
    }

    const servers = this._config.servers || [];

    if (isNew) {
      // 检查 ID 唯一性
      if (servers.some(s => s.id === id)) {
        showToast(_t('settingsPage.mcpServerIdExists') + id + _t('settingsPage.mcpServerIdExistsEnd'), { type: 'warning', duration: 2000 });
        return;
      }
      servers.push(server);
    } else {
      const idx = this._editingServer;
      if (idx >= 0 && idx < servers.length) {
        // 如果 ID 变了，检查唯一性
        if (server.id !== servers[idx].id && servers.some((s, i) => i !== idx && s.id === server.id)) {
          showToast(_t('settingsPage.mcpServerIdExists') + id + _t('settingsPage.mcpServerIdExistsEnd'), { type: 'warning', duration: 2000 });
          return;
        }
        servers[idx] = server;
      }
    }

    this._config.servers = servers;
    this._closeServerEditor();
    // 服务器变更后自动保存
    this._saveConfig();
    showToast(isNew ? _t('settingsPage.mcpServerAdded') : _t('settingsPage.mcpServerSaved'), { type: 'success', duration: 2000 });
  }

  _closeServerEditor() {
    this._editingServer = null;
    const addBtn = document.getElementById('mcpServerAdd');
    if (addBtn) addBtn.style.display = '';
    this._renderServerList();
  }

  _createEmptyServer() {
    return { id: '', name: '', type: 'stdio', command: '', args: [], url: '', env: {}, auto_register_tools: true };
  }

  async _saveConfig() {
    try {
      const values = {};

      // 基本设置
      const enabled = document.getElementById('mcpEnabled')?.checked;
      const autoConnect = document.getElementById('mcpAutoConnect')?.checked;
      const autoReconnect = document.getElementById('mcpAutoReconnect')?.checked;
      const maxReconnectAttempts = parseInt(this._maxReconnectDropdown?.getSelectedItem()?.value, 10);
      const reconnectDelaySeconds = parseInt(this._reconnectDelayDropdown?.getSelectedItem()?.value, 10);
      const requestTimeout = parseInt(this._reqTimeoutDropdown?.getSelectedItem()?.value, 10);

      values.enabled = enabled !== false;
      values.auto_connect = autoConnect !== false;
      values.auto_reconnect = autoReconnect !== false;

      if (!isNaN(maxReconnectAttempts)) values.max_reconnect_attempts = maxReconnectAttempts;
      if (!isNaN(reconnectDelaySeconds)) values.reconnect_delay_seconds = reconnectDelaySeconds;
      if (!isNaN(requestTimeout)) values.request_timeout = requestTimeout;

      // 服务器列表（来自当前状态）
      values.servers = this._config.servers || [];

      const { HippoDesktop } = window;
      if (HippoDesktop?.updateConfig) {
        await HippoDesktop.updateConfig({ mcp: values });
      } else {
        throw new Error('updateConfig 不可用');
      }
    } catch (e) {
      console.warn('保存 MCP 配置失败:', e);
      showToast(_t('settingsPage.saveFailed') + e.message, { type: 'error', duration: 3000 });
    }
  }

  _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
