/**
 * RulesSettingsPage — 规则管理页面
 *
 * 规则文件列表（始终生效 / 手动引用分组）
 * 创建 / 编辑 / 删除规则
 */
import { apiGet, apiPost } from '../../utils.js';
import { showToast } from '../../utils/toast.js';
import { ConfirmDialog } from '../../utils/modal.js';

export class RulesSettingsPage {
  constructor() {
    this._rules = [];
    this._editingRule = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">规则管理</h2>
      <p class="settings-page-desc">管理项目级和用户级规则文件，按「始终生效」和「手动引用」分组</p>
      <hr class="settings-page-divider">

      <div class="settings-item-list-header">
        <h3>规则列表</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-icon" id="settingsRulesRefresh" title="刷新">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="settings-btn settings-btn-primary" id="settingsRulesCreate">+ 新建</button>
        </div>
      </div>

      <div class="settings-loading" id="settingsRulesLoading" style="display:none;">加载中...</div>
      <div class="settings-items-error" id="settingsRulesError" style="display:none;"></div>
      <div id="settingsRulesList"></div>
    `;

    container.appendChild(page);

    document.getElementById('settingsRulesRefresh')?.addEventListener('click', () => this._loadRules());
    document.getElementById('settingsRulesCreate')?.addEventListener('click', () => this._showCreateRuleModal());

    this._loadRules();
  }

  destroy() {
    this._editingRule = null;
    this._rules = [];
    this._container = null;
  }

  // ==================== 加载列表 ====================

  async _loadRules() {
    const loadingEl = document.getElementById('settingsRulesLoading');
    const errorEl = document.getElementById('settingsRulesError');
    const listEl = document.getElementById('settingsRulesList');
    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';

    try {
      const data = await apiGet('/api/rules/list');
      const projectRules = data.projectRules || [];
      const userRules = data.userRules || [];

      const always = [];
      const manual = [];

      for (const r of projectRules) {
        (r.mode === 'always' ? always : manual).push({ ...r, source: 'project' });
      }
      for (const r of userRules) {
        (r.mode === 'always' ? always : manual).push({ ...r, source: 'user' });
      }

      this._renderRulesList(listEl, always, manual);
    } catch (e) {
      console.warn('加载规则列表失败:', e);
      if (errorEl) {
        errorEl.textContent = '加载失败，请重试';
        errorEl.style.display = 'block';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  _renderRulesList(listEl, always, manual) {
    if (always.length === 0 && manual.length === 0) {
      listEl.innerHTML = '<div class="settings-items-empty">暂无规则文件<br><span style="font-size:11px;opacity:0.6;">点击「+ 新建」创建第一条规则</span></div>';
      return;
    }

    listEl.innerHTML = '';

    if (always.length > 0) {
      listEl.appendChild(this._createRuleGroup('始终生效', always, '⚡'));
    }
    if (manual.length > 0) {
      listEl.appendChild(this._createRuleGroup('手动引用', manual, '📋'));
    }
  }

  _createRuleGroup(label, rules, icon) {
    const group = document.createElement('div');
    group.className = 'settings-item-group';

    const header = document.createElement('div');
    header.className = 'settings-item-group-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'settings-item-group-label';
    labelEl.textContent = label;
    header.appendChild(labelEl);

    const count = document.createElement('span');
    count.className = 'settings-item-group-count';
    count.textContent = rules.length;
    header.appendChild(count);

    group.appendChild(header);

    const items = document.createElement('div');
    items.className = 'settings-items';

    for (const rule of rules) {
      const item = document.createElement('div');
      item.className = 'settings-item';
      item.addEventListener('click', () => this._showRuleDetail(rule));

      const iconEl = document.createElement('span');
      iconEl.className = 'settings-item-icon';
      iconEl.textContent = icon;
      item.appendChild(iconEl);

      const info = document.createElement('div');
      info.className = 'settings-item-info';

      const name = document.createElement('div');
      name.className = 'settings-item-name';
      name.textContent = rule.name;
      info.appendChild(name);

      if (rule.description && rule.description !== rule.name) {
        const meta = document.createElement('div');
        meta.className = 'settings-item-meta';
        meta.textContent = rule.description;
        info.appendChild(meta);
      }

      item.appendChild(info);

      const badge = document.createElement('span');
      badge.className = 'settings-item-badge';
      badge.textContent = rule.source === 'project' ? '项目' : '全局';
      item.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.className = 'settings-item-del';
      delBtn.title = '删除';
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteRule(rule);
      });
      item.appendChild(delBtn);

      items.appendChild(item);
    }

    group.appendChild(items);
    return group;
  }

  // ==================== 详情 / 编辑 ====================

  _showRuleDetail(rule) {
    this._editingRule = rule;
    this._renderRuleEditor(rule);
  }

  _renderRuleEditor(rule) {
    const listEl = document.getElementById('settingsRulesList');
    if (!listEl) return;

    const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">编辑规则：${rule.name}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsRuleEditorBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsRuleEditorSave">保存</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleEditorName">规则名称</label>
            <input class="settings-input" id="settingsRuleEditorName" type="text" value="${rule.name}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleEditorDesc">描述</label>
            <input class="settings-input" id="settingsRuleEditorDesc" type="text" value="${rule.description || ''}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">模式</label>
            <div class="settings-toggle-group" id="settingsRuleEditorMode">
              <button class="settings-toggle-btn ${rule.mode === 'always' ? 'active' : ''}" data-value="always">始终生效</button>
              <button class="settings-toggle-btn ${rule.mode !== 'always' ? 'active' : ''}" data-value="manual">手动引用</button>
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field-label">作用域</label>
            <div class="settings-toggle-group" id="settingsRuleEditorScope">
              <button class="settings-toggle-btn ${rule.source === 'project' ? 'active' : ''}" data-value="project">项目</button>
              <button class="settings-toggle-btn ${rule.source !== 'project' ? 'active' : ''}" data-value="user">全局</button>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsRuleEditorContent" placeholder="加载中..." spellcheck="false"></textarea>
      </div>
    `;

    this._loadRuleContent(rule);

    document.getElementById('settingsRuleEditorBack')?.addEventListener('click', () => {
      this._editingRule = null;
      if (headerActions) headerActions.style.display = '';
      this._loadRules();
    });

    document.getElementById('settingsRuleEditorSave')?.addEventListener('click', () => {
      this._saveRuleEditor(rule);
    });

    document.querySelectorAll('#settingsRuleEditorMode .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsRuleEditorMode .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    document.querySelectorAll('#settingsRuleEditorScope .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsRuleEditorScope .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  async _loadRuleContent(rule) {
    const textarea = document.getElementById('settingsRuleEditorContent');
    if (!textarea) return;

    try {
      const data = await apiGet('/api/rules/get?filePath=' + encodeURIComponent(rule.filePath));
      textarea.value = data.content || '';
      textarea.placeholder = '';
    } catch (e) {
      console.warn('加载规则内容失败:', e);
      textarea.value = '';
      textarea.placeholder = '加载失败';
    }
  }

  async _saveRuleEditor(rule) {
    const nameInput = document.getElementById('settingsRuleEditorName');
    const descInput = document.getElementById('settingsRuleEditorDesc');
    const textarea = document.getElementById('settingsRuleEditorContent');
    const modeBtn = document.querySelector('#settingsRuleEditorMode .settings-toggle-btn.active');
    const scopeBtn = document.querySelector('#settingsRuleEditorScope .settings-toggle-btn.active');
    const saveBtn = document.getElementById('settingsRuleEditorSave');

    if (!nameInput || !textarea) return;

    const name = nameInput.value.trim();
    const description = descInput?.value.trim() || '';
    const mode = modeBtn?.dataset.value || rule.mode;
    const scope = scopeBtn?.dataset.value || rule.source;
    const content = textarea.value;

    if (!name) {
      showToast('规则名称不能为空', { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }

    try {
      const result = await apiPost('/api/rules/update', {
        filePath: rule.filePath,
        name,
        description,
        mode,
        scope,
        content,
      });

      if (result.success) {
        showToast('规则已保存', { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = '✓ 已保存';
        rule.filePath = result.filePath || rule.filePath;
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._editingRule = null;
          this._loadRules();
        }, 400);
      } else {
        showToast('保存失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
        }
      }
    } catch (e) {
      console.warn('保存规则失败:', e);
      showToast('保存失败: 网络错误，请重试', { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    }
  }

  async _deleteRule(rule) {
    const confirmed = await ConfirmDialog.confirmDelete(`确定删除规则「${rule.name}」？`);
    if (!confirmed) return;

    try {
      const result = await apiPost('/api/rules/delete', { filePath: rule.filePath });
      if (result.success) {
        this._loadRules();
      } else {
        showToast('删除失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      console.warn('删除规则失败:', e);
      showToast('删除失败，请重试', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 创建 ====================

  _showCreateRuleModal() {
    const listEl = document.getElementById('settingsRulesList');
    if (!listEl) return;

    const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">新建规则</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsRuleCreateBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsRuleCreateSave">创建</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleCreateName">规则名称</label>
            <input class="settings-input" id="settingsRuleCreateName" type="text" placeholder="my-rule（字母、数字、连字符、下划线、点）">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleCreateDesc">描述</label>
            <input class="settings-input" id="settingsRuleCreateDesc" type="text" placeholder="简短说明">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">模式</label>
            <div class="settings-toggle-group" id="settingsRuleCreateMode">
              <button class="settings-toggle-btn active" data-value="always">始终生效</button>
              <button class="settings-toggle-btn" data-value="manual">手动引用</button>
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field-label">作用域</label>
            <div class="settings-toggle-group" id="settingsRuleCreateScope">
              <button class="settings-toggle-btn active" data-value="project">项目</button>
              <button class="settings-toggle-btn" data-value="user">全局</button>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsRuleCreateContent" placeholder="规则正文内容，Markdown 格式" spellcheck="false"></textarea>
      </div>
    `;

    document.getElementById('settingsRuleCreateBack')?.addEventListener('click', () => {
      if (headerActions) headerActions.style.display = '';
      this._loadRules();
    });

    document.getElementById('settingsRuleCreateSave')?.addEventListener('click', () => this._handleCreateRule());

    document.querySelectorAll('#settingsRuleCreateMode .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsRuleCreateMode .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    document.querySelectorAll('#settingsRuleCreateScope .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsRuleCreateScope .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  async _handleCreateRule() {
    const nameInput = document.getElementById('settingsRuleCreateName');
    const descInput = document.getElementById('settingsRuleCreateDesc');
    const textarea = document.getElementById('settingsRuleCreateContent');
    const modeBtn = document.querySelector('#settingsRuleCreateMode .settings-toggle-btn.active');
    const scopeBtn = document.querySelector('#settingsRuleCreateScope .settings-toggle-btn.active');
    const saveBtn = document.getElementById('settingsRuleCreateSave');

    const name = nameInput?.value?.trim();
    if (!name) {
      showToast('规则名称不能为空', { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '创建中…';
    }

    try {
      const result = await apiPost('/api/rules/create', {
        name,
        description: descInput?.value?.trim() || '',
        mode: modeBtn?.dataset?.value || 'always',
        scope: scopeBtn?.dataset?.value || 'project',
        content: textarea?.value || '',
      });

      if (result.success) {
        showToast('规则已创建', { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = '✓ 已创建';
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._loadRules();
        }, 400);
      } else {
        showToast('创建失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '创建';
        }
      }
    } catch (e) {
      console.warn('创建规则失败:', e);
      showToast('创建失败: 网络错误，请重试', { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '创建';
      }
    }
  }
}
