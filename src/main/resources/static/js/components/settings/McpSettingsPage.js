/**
 * McpSettingsPage — MCP 配置页面
 *
 * 配置 MCP 服务：
 * - enabled / autoConnect / autoReconnect
 * - maxReconnectAttempts / reconnectDelaySeconds
 * - connectionTimeout / requestTimeout
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
 */
import { showToast } from '../../utils/toast.js';
import { ConfirmDialog } from '../../utils/modal.js';

const SERVER_TYPES = [
  { value: 'stdio', label: 'STDIO（子进程）' },
  { value: 'sse', label: 'SSE（HTTP 流）' },
];

export class McpSettingsPage {
  constructor() {
    this._config = null;
    this._saveBtn = null;
    this._saveStatus = null;
    this._editingServer = null; // 正在编辑的服务器 index
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';
    page.innerHTML = `
      <h2 class="settings-page-title">MCP 配置</h2>
      <p class="settings-page-desc">管理 MCP 服务器连接和工具注册</p>
      <hr class="settings-page-divider">

      <div class="settings-loading" id="mcpLoading" style="display:block;">加载中...</div>
      <div id="mcpForm" style="display:none;"></div>
      <div class="settings-save-bar" id="mcpSaveBar" style="display:none;">
        <button class="settings-save-btn" id="mcpSaveBtn">保存配置</button>
        <span class="settings-editor-status" id="mcpSaveStatus" style="display:none;"></span>
      </div>
    `;

    container.appendChild(page);
    this._loadConfig();
  }

  destroy() {
    this._config = null;
    this._saveBtn = null;
    this._saveStatus = null;
    this._editingServer = null;
  }

  async _loadConfig() {
    const { HippoDesktop } = window;

    if (!HippoDesktop || !HippoDesktop.getConfig) {
      this._showError('配置 API 不可用（仅桌面端支持）');
      return;
    }

    try {
      const config = await HippoDesktop.getConfig();
      this._config = config.mcp || {};
      this._renderForm();
    } catch (e) {
      console.warn('加载 MCP 配置失败:', e);
      this._showError('加载配置失败: ' + e.message);
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
    const saveBar = document.getElementById('mcpSaveBar');
    if (loading) loading.style.display = 'none';
    if (!form) return;

    const mcp = this._config;

    form.style.display = 'block';
    form.innerHTML = `
      <!-- ===== 基本设置 ===== -->
      <div class="settings-field-group-title">基本设置</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field-horizontal">
            <label class="settings-field-label">启用 MCP</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpEnabled" ${mcp.enabled !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label">自动连接</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpAutoConnect" ${mcp.auto_connect !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field-horizontal">
            <label class="settings-field-label">自动重连</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpAutoReconnect" ${mcp.auto_reconnect !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpMaxReconnect">
              最大重连次数 <span class="settings-field-hint">(0 = 不限制)</span>
            </label>
            <input class="settings-input" id="mcpMaxReconnect" type="number" min="0" value="${mcp.max_reconnect_attempts ?? 5}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpReconnectDelay">
              重连间隔 <span class="settings-field-hint">(秒)</span>
            </label>
            <input class="settings-input" id="mcpReconnectDelay" type="number" min="1" value="${mcp.reconnect_delay_seconds ?? 5}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpConnTimeout">
              连接超时 <span class="settings-field-hint">(毫秒)</span>
            </label>
            <input class="settings-input" id="mcpConnTimeout" type="number" min="1000" step="1000" value="${mcp.connection_timeout ?? 30000}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpReqTimeout">
              请求超时 <span class="settings-field-hint">(毫秒)</span>
            </label>
            <input class="settings-input" id="mcpReqTimeout" type="number" min="1000" step="1000" value="${mcp.request_timeout ?? 60000}">
          </div>
        </div>
      </div>

      <!-- ===== 服务器列表 ===== -->
      <div class="settings-item-list-header">
        <h3>服务器 (${(mcp.servers || []).length})</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-primary" id="mcpServerAdd">+ 添加服务器</button>
        </div>
      </div>
      <div id="mcpServerList"></div>
    `;

    // 添加服务器按钮
    document.getElementById('mcpServerAdd')?.addEventListener('click', () => this._showServerEditor(null));

    // 渲染服务器列表
    this._renderServerList();

    // 保存按钮
    this._saveBtn = document.getElementById('mcpSaveBtn');
    this._saveStatus = document.getElementById('mcpSaveStatus');
    if (this._saveBtn) {
      this._saveBtn.addEventListener('click', () => this._saveConfig());
    }

    if (saveBar) saveBar.style.display = '';
  }

  _renderServerList() {
    const listEl = document.getElementById('mcpServerList');
    if (!listEl) return;

    const servers = this._config.servers || [];

    if (servers.length === 0) {
      listEl.innerHTML = '<div class="settings-items-empty">暂无 MCP 服务器<br><span style="font-size:11px;opacity:0.6;">点击「+ 添加服务器」添加第一个</span></div>';
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
      name.textContent = server.name || server.id || '(未命名)';
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
        badge.textContent = '自动注册';
        badge.style.marginRight = '6px';
        item.appendChild(badge);
      }

      // 删除按钮
      const delBtn = document.createElement('button');
      delBtn.className = 'settings-item-del';
      delBtn.title = '删除';
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

    const name = server.name || server.id || '未命名';
    const confirmed = await ConfirmDialog.confirmDelete(`确定删除 MCP 服务器「${name}」？`);
    if (!confirmed) return;

    servers.splice(index, 1);
    this._config.servers = servers;
    this._renderServerList();
    showToast('已删除服务器: ' + name, { type: 'success', duration: 2000 });
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
      envHtml = `<div class="mcp-env-empty" style="font-size:12px;color:var(--text-muted);">暂无环境变量</div>`;
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
          <span class="settings-editor-title">${isNew ? '添加服务器' : '编辑服务器'}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="mcpServerEditorBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="mcpServerEditorSave">${isNew ? '添加' : '保存'}</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="mcpServerId">ID <span class="settings-field-hint">(唯一标识，字母数字连字符)</span></label>
            <input class="settings-input" id="mcpServerId" type="text" value="${this._escapeHtml(server.id || '')}" placeholder="my-mcp-server" ${!isNew ? 'readonly style="background:var(--bg-subtle);"' : ''}>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="mcpServerName">名称</label>
            <input class="settings-input" id="mcpServerName" type="text" value="${this._escapeHtml(server.name || '')}" placeholder="我的 MCP 服务器">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">类型</label>
            <div class="settings-toggle-group" id="mcpServerType">
              ${SERVER_TYPES.map(t => `
                <button class="settings-toggle-btn ${t.value === type ? 'active' : ''}" data-value="${t.value}">${t.label}</button>
              `).join('')}
            </div>
          </div>

          <!-- STDIO 字段 -->
          <div id="mcpServerStdioFields" class="mcp-type-fields" style="display:${type === 'stdio' ? 'block' : 'none'};">
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerCommand">命令</label>
              <input class="settings-input" id="mcpServerCommand" type="text" value="${this._escapeHtml(server.command || '')}" placeholder="npx">
            </div>
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerArgs">参数 <span class="settings-field-hint">(空格分隔)</span></label>
              <input class="settings-input" id="mcpServerArgs" type="text" value="${this._escapeHtml(argsStr)}" placeholder="-y @modelcontextprotocol/server-filesystem /path">
            </div>
          </div>

          <!-- SSE 字段 -->
          <div id="mcpServerSseFields" class="mcp-type-fields" style="display:${type === 'sse' ? 'block' : 'none'};">
            <div class="settings-field">
              <label class="settings-field-label" for="mcpServerUrl">URL</label>
              <input class="settings-input" id="mcpServerUrl" type="text" value="${this._escapeHtml(server.url || '')}" placeholder="http://localhost:3000/sse">
            </div>
          </div>

          <!-- 环境变量 -->
          <div class="settings-field">
            <label class="settings-field-label">
              环境变量
              <span class="settings-field-hint">(仅 STDIO 类型生效)</span>
            </label>
            <div id="mcpServerEnvList" style="margin-bottom:6px;">
              ${envHtml}
            </div>
            <button class="settings-btn" id="mcpServerEnvAdd" style="font-size:12px;">+ 添加变量</button>
          </div>

          <!-- 自动注册工具 -->
          <div class="settings-field-horizontal">
            <label class="settings-field-label">自动注册工具</label>
            <div class="settings-field-body">
              <label class="settings-switch">
                <input type="checkbox" id="mcpServerAutoReg" ${server.auto_register_tools !== false ? 'checked' : ''}>
                <span class="settings-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="settings-editor-status" id="mcpServerEditorStatus" style="display:none;"></div>
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
      <button class="settings-input-btn mcp-env-remove" title="删除" style="padding:4px;">
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
    const statusEl = document.getElementById('mcpServerEditorStatus');

    const id = idInput?.value?.trim();
    if (!id) {
      if (statusEl) {
        statusEl.textContent = '⚠️ 服务器 ID 不能为空';
        statusEl.className = 'settings-editor-status settings-editor-status-error';
        statusEl.style.display = 'block';
      }
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
        if (statusEl) {
          statusEl.textContent = '⚠️ 服务器 ID "' + id + '" 已存在';
          statusEl.className = 'settings-editor-status settings-editor-status-error';
          statusEl.style.display = 'block';
        }
        return;
      }
      servers.push(server);
    } else {
      const idx = this._editingServer;
      if (idx >= 0 && idx < servers.length) {
        // 如果 ID 变了，检查唯一性
        if (server.id !== servers[idx].id && servers.some((s, i) => i !== idx && s.id === server.id)) {
          if (statusEl) {
            statusEl.textContent = '⚠️ 服务器 ID "' + id + '" 已存在';
            statusEl.className = 'settings-editor-status settings-editor-status-error';
            statusEl.style.display = 'block';
          }
          return;
        }
        servers[idx] = server;
      }
    }

    this._config.servers = servers;
    this._closeServerEditor();
    showToast(isNew ? '✓ 服务器已添加' : '✓ 服务器已保存', { type: 'success', duration: 2000 });
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
    if (!this._saveBtn) return;
    this._saveBtn.disabled = true;
    this._saveBtn.textContent = '保存中…';

    try {
      const values = {};

      // 基本设置
      const enabled = document.getElementById('mcpEnabled')?.checked;
      const autoConnect = document.getElementById('mcpAutoConnect')?.checked;
      const autoReconnect = document.getElementById('mcpAutoReconnect')?.checked;
      const maxReconnectAttempts = parseInt(document.getElementById('mcpMaxReconnect')?.value, 10);
      const reconnectDelaySeconds = parseInt(document.getElementById('mcpReconnectDelay')?.value, 10);
      const connectionTimeout = parseInt(document.getElementById('mcpConnTimeout')?.value, 10);
      const requestTimeout = parseInt(document.getElementById('mcpReqTimeout')?.value, 10);

      values.enabled = enabled !== false;
      values.auto_connect = autoConnect !== false;
      values.auto_reconnect = autoReconnect !== false;

      if (!isNaN(maxReconnectAttempts)) values.max_reconnect_attempts = maxReconnectAttempts;
      if (!isNaN(reconnectDelaySeconds)) values.reconnect_delay_seconds = reconnectDelaySeconds;
      if (!isNaN(connectionTimeout)) values.connection_timeout = connectionTimeout;
      if (!isNaN(requestTimeout)) values.request_timeout = requestTimeout;

      // 服务器列表（来自当前状态）
      values.servers = this._config.servers || [];

      const { HippoDesktop } = window;
      if (HippoDesktop?.updateConfig) {
        await HippoDesktop.updateConfig({ mcp: values });
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
        // 重新加载配置，同步最新数据
        this._loadConfig();
      }, 1200);
    } catch (e) {
      console.warn('保存 MCP 配置失败:', e);
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

  _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
