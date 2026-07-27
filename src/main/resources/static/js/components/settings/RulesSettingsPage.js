/**
 * RulesSettingsPage — 规则管理页面
 *
 * 规则文件列表（始终生效 / 手动引用分组）
 * 创建 / 编辑 / 删除规则
 */
import { apiGet, apiPost } from '../../utils.js';
import { showToast } from '../../utils/toast.js';
import { ConfirmDialog } from '../../utils/modal.js';

const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

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
      <h2 class="settings-page-title">${_t('settingsPage.rulesTitle')}</h2>
      <p class="settings-page-desc">${_t('settingsPage.rulesDesc')}</p>
      <hr class="settings-page-divider">

      <div class="settings-item-list-header">
        <h3>${_t('settingsPage.rulesList')}</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-icon" id="settingsRulesRefresh" title="${_t('settingsPage.rulesRefresh')}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="settings-btn settings-btn-primary" id="settingsRulesCreate">+ ${_t('settingsPage.rulesCreate')}</button>
        </div>
      </div>

      <div class="settings-loading" id="settingsRulesLoading" style="display:none;">${_t('settingsPage.rulesLoading')}</div>
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
        errorEl.textContent = _t('settingsPage.rulesLoadFailed');
        errorEl.style.display = 'block';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  _renderRulesList(listEl, always, manual) {
    if (always.length === 0 && manual.length === 0) {
      listEl.innerHTML = `<div class="settings-items-empty">${_t('settingsPage.rulesEmpty')}<br><span style="font-size:11px;opacity:0.6;">${_t('settingsPage.rulesEmptyHint')}</span></div>`;
      return;
    }

    listEl.innerHTML = '';

    if (always.length > 0) {
      listEl.appendChild(this._createRuleGroup(_t('settingsPage.rulesGroupAlways'), always, '⚡'));
    }
    if (manual.length > 0) {
      listEl.appendChild(this._createRuleGroup(_t('settingsPage.rulesGroupManual'), manual, '📋'));
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
      badge.textContent = rule.source === 'project' ? _t('settingsPage.rulesProject') : _t('settingsPage.rulesGlobal');
      item.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.className = 'settings-item-del';
      delBtn.title = _t('settingsPage.rulesDelete');
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
          <span class="settings-editor-title">${_t('settingsPage.rulesEditTitle')}${rule.name}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsRuleEditorBack">${_t('settingsPage.rulesBackToList')}</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsRuleEditorSave">${_t('settingsPage.rulesSave')}</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleEditorName">${_t('settingsPage.rulesName')}</label>
            <input class="settings-input" id="settingsRuleEditorName" type="text" value="${rule.name}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleEditorDesc">${_t('settingsPage.rulesDesc')}</label>
            <input class="settings-input" id="settingsRuleEditorDesc" type="text" value="${rule.description || ''}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">${_t('settingsPage.rulesMode')}</label>
            <div class="settings-toggle-group" id="settingsRuleEditorMode">
              <button class="settings-toggle-btn ${rule.mode === 'always' ? 'active' : ''}" data-value="always">${_t('settingsPage.rulesGroupAlways')}</button>
              <button class="settings-toggle-btn ${rule.mode !== 'always' ? 'active' : ''}" data-value="manual">${_t('settingsPage.rulesGroupManual')}</button>
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field-label">${_t('settingsPage.rulesScope')}</label>
            <div class="settings-toggle-group" id="settingsRuleEditorScope">
              <button class="settings-toggle-btn ${rule.source === 'project' ? 'active' : ''}" data-value="project">${_t('settingsPage.rulesProject')}</button>
              <button class="settings-toggle-btn ${rule.source !== 'project' ? 'active' : ''}" data-value="user">${_t('settingsPage.rulesGlobal')}</button>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsRuleEditorContent" placeholder="${_t('settingsPage.rulesLoading')}" spellcheck="false"></textarea>
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
      textarea.placeholder = _t('settingsPage.rulesLoadFailed');
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
      showToast(_t('settingsPage.rulesNameRequired'), { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = _t('settingsPage.rulesSaving');
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
        showToast(_t('settingsPage.rulesSaved'), { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = _t('settingsPage.rulesSavedIcon');
        rule.filePath = result.filePath || rule.filePath;
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._editingRule = null;
          this._loadRules();
        }, 400);
      } else {
        showToast(_t('settingsPage.saveFailed') + (result.message || _t('settingsPage.modelUnknownError')), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = _t('settingsPage.rulesSave');
        }
      }
    } catch (e) {
      console.warn('保存规则失败:', e);
      showToast(_t('settingsPage.saveFailed') + _t('settingsPage.networkError'), { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = _t('settingsPage.rulesSave');
      }
    }
  }

  async _deleteRule(rule) {
    const confirmed = await ConfirmDialog.confirmDelete(`${_t('settingsPage.deleteConfirmRule')}${rule.name}${_t('settingsPage.deleteConfirmEnd')}`);
    if (!confirmed) return;

    try {
      const result = await apiPost('/api/rules/delete', { filePath: rule.filePath });
      if (result.success) {
        this._loadRules();
      } else {
        showToast(_t('settingsPage.saveFailed') + (result.message || _t('settingsPage.modelUnknownError')), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      console.warn('删除规则失败:', e);
      showToast(_t('settingsPage.deleteFailedRetry'), { type: 'error', duration: 3000 });
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
          <span class="settings-editor-title">${_t('settingsPage.rulesCreateTitle')}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsRuleCreateBack">${_t('settingsPage.rulesBackToList')}</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsRuleCreateSave">${_t('settingsPage.rulesCreate')}</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleCreateName">${_t('settingsPage.rulesName')}</label>
            <input class="settings-input" id="settingsRuleCreateName" type="text" placeholder="${_t('settingsPage.rulesNamePh')}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsRuleCreateDesc">${_t('settingsPage.rulesDesc')}</label>
            <input class="settings-input" id="settingsRuleCreateDesc" type="text" placeholder="${_t('settingsPage.rulesDescPh')}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">${_t('settingsPage.rulesMode')}</label>
            <div class="settings-toggle-group" id="settingsRuleCreateMode">
              <button class="settings-toggle-btn active" data-value="always">${_t('settingsPage.rulesGroupAlways')}</button>
              <button class="settings-toggle-btn" data-value="manual">${_t('settingsPage.rulesGroupManual')}</button>
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field-label">${_t('settingsPage.rulesScope')}</label>
            <div class="settings-toggle-group" id="settingsRuleCreateScope">
              <button class="settings-toggle-btn active" data-value="project">${_t('settingsPage.rulesProject')}</button>
              <button class="settings-toggle-btn" data-value="user">${_t('settingsPage.rulesGlobal')}</button>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsRuleCreateContent" placeholder="${_t('settingsPage.rulesContentPh')}" spellcheck="false"></textarea>
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
      showToast(_t('settingsPage.rulesNameRequired'), { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = _t('settingsPage.rulesCreating');
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
        showToast(_t('settingsPage.rulesCreated'), { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = _t('settingsPage.rulesCreatedIcon');
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsRulesCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._loadRules();
        }, 400);
      } else {
        showToast(_t('settingsPage.saveFailed') + (result.message || _t('settingsPage.modelUnknownError')), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = _t('settingsPage.rulesCreate');
        }
      }
    } catch (e) {
      console.warn('创建规则失败:', e);
      showToast(_t('settingsPage.saveFailed') + _t('settingsPage.networkError'), { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = _t('settingsPage.rulesCreate');
      }
    }
  }
}
