/**
 * 规则选择器组件。
 * 从 /api/rules/list 加载规则列表，展示为悬浮框，支持多选。
 * 支持新建规则（POST /api/rules/create），区分 project/user 作用域。
 */
export class RuleSelector {
  constructor({ onRulesChange }) {
    this._rules = [];       // 所有可用规则
    this._selected = new Set(); // 已选的规则 ID
    this._onRulesChange = onRulesChange;
    this._loading = false;
    this._loaded = false;
    this._panel = null;
    this._btn = null;

    this._createButton();
  }

  // ==================== 公开方法 ====================

  getSelectedRuleIds() {
    return Array.from(this._selected);
  }

  clearSelection() {
    this._selected.clear();
    this._updateButtonLabel();
  }

  destroy() {
    this._btn?.remove();
    this._panel?.remove();
    this._createModal?.remove();
  }

  // ==================== UI 创建 ====================

  _createButton() {
    this._btn = document.createElement('button');
    this._btn.className = 'rule-selector-btn';
    this._btn.title = '引用规则';
    this._btn.innerHTML = this._getButtonHTML(0);
    this._btn.addEventListener('click', () => this._togglePanel());
  }

  _getButtonHTML(count) {
    if (count > 0) {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <span class="rule-selector-badge">${count}</span>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  }

  _updateButtonLabel() {
    if (!this._btn) return;
    this._btn.innerHTML = this._getButtonHTML(this._selected.size);
  }

  getButtonElement() {
    return this._btn;
  }

  // ==================== 面板 ====================

  async _togglePanel() {
    if (this._panel && this._panel.parentNode) {
      this._closePanel();
      return;
    }

    if (!this._loaded && !this._loading) {
      this._loading = true;
      await this._loadRules();
      this._loading = false;
      this._loaded = true;
    }

    this._openPanel();
  }

  _openPanel() {
    this._panel = document.createElement('div');
    this._panel.className = 'rule-selector-panel';

    const header = document.createElement('div');
    header.className = 'rule-selector-header';
    header.textContent = '引用规则';
    this._panel.appendChild(header);

    if (this._rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rule-selector-empty';
      empty.textContent = '暂无可用规则';
      empty.innerHTML += '<br><span style="font-size:11px;opacity:0.6;">点击下方按钮创建第一条规则</span>';
      this._panel.appendChild(empty);
    } else {
      // 分组：always / manual
      const alwaysRules = this._rules.filter(r => r.mode === 'always');
      const manualRules = this._rules.filter(r => r.mode !== 'always');

      if (alwaysRules.length > 0) {
        this._appendGroup(this._panel, '始终生效', alwaysRules, true);
      }
      if (manualRules.length > 0) {
        this._appendGroup(this._panel, '手动引用', manualRules, false);
      }
    }

    // 底部操作栏
    const footer = document.createElement('div');
    footer.className = 'rule-selector-footer';
    const createBtn = document.createElement('button');
    createBtn.className = 'rule-selector-create-btn';
    createBtn.innerHTML = '+ 新建规则';
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closePanel();
      this._showCreateModal();
    });
    footer.appendChild(createBtn);
    this._panel.appendChild(footer);

    document.body.appendChild(this._panel);
    this._positionPanel();

    // 点击外部关闭
    this._outsideClickHandler = (e) => {
      if (!this._panel.contains(e.target) && e.target !== this._btn) {
        this._closePanel();
      }
    };
    setTimeout(() => document.addEventListener('click', this._outsideClickHandler), 0);
  }

  _appendGroup(panel, label, rules, disabled) {
    const group = document.createElement('div');
    group.className = 'rule-selector-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'rule-selector-group-label';
    groupLabel.textContent = label;
    group.appendChild(groupLabel);

    for (const rule of rules) {
      const item = document.createElement('div');
      item.className = 'rule-selector-item';
      if (this._selected.has(rule.id)) {
        item.classList.add('selected');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this._selected.has(rule.id);
      checkbox.disabled = disabled;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this._selected.add(rule.id);
          item.classList.add('selected');
        } else {
          this._selected.delete(rule.id);
          item.classList.remove('selected');
        }
        this._updateButtonLabel();
        this._onRulesChange?.(this.getSelectedRuleIds());
      });

      const info = document.createElement('div');
      info.className = 'rule-selector-item-info';

      const name = document.createElement('div');
      name.className = 'rule-selector-item-name';
      name.textContent = rule.name;
      info.appendChild(name);

      if (rule.description && rule.description !== rule.name) {
        const desc = document.createElement('div');
        desc.className = 'rule-selector-item-desc';
        desc.textContent = rule.description;
        info.appendChild(desc);
      }

      item.appendChild(checkbox);
      item.appendChild(info);
      group.appendChild(item);
    }

    panel.appendChild(group);
  }

  _closePanel() {
    if (this._outsideClickHandler) {
      document.removeEventListener('click', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
    this._panel?.remove();
    this._panel = null;
  }

  _positionPanel() {
    if (!this._panel || !this._btn) return;
    const btnRect = this._btn.getBoundingClientRect();
    const panelWidth = 320;
    let left = btnRect.left;
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }
    this._panel.style.position = 'fixed';
    this._panel.style.left = left + 'px';
    this._panel.style.bottom = (window.innerHeight - btnRect.top + 8) + 'px';
    this._panel.style.width = panelWidth + 'px';
  }

  // ==================== 数据加载 ====================

  async _loadRules() {
    try {
      const response = await fetch('/api/rules/list');
      if (!response.ok) return;
      const data = await response.json();
      this._rules = [];

      if (data.projectRules) {
        for (const r of data.projectRules) {
          this._rules.push({ ...r, source: 'project' });
        }
      }
      if (data.userRules) {
        for (const r of data.userRules) {
          this._rules.push({ ...r, source: 'user' });
        }
      }
    } catch (e) {
      console.warn('加载规则列表失败:', e);
    }
  }

  // ==================== 新建规则弹窗 ====================

  _showCreateModal() {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'rule-create-overlay';

    const modal = document.createElement('div');
    modal.className = 'rule-create-modal';

    // 标题
    const title = document.createElement('div');
    title.className = 'rule-create-title';
    title.textContent = '新建规则';
    modal.appendChild(title);

    // 表单
    const form = document.createElement('div');
    form.className = 'rule-create-form';

    // 规则名称
    form.appendChild(this._createField('规则名称', 'rule-name-input', 'text', 'my-rule', '字母、数字、连字符、下划线、点，不含 .md'));
    // 规则描述
    form.appendChild(this._createField('描述（可选）', 'rule-desc-input', 'text', '', '简短说明，前端展示用'));
    // Mode 选择
    form.appendChild(this._createModeSelect());
    // Scope 选择
    form.appendChild(this._createScopeSelect());
    // 内容（可选）
    form.appendChild(this._createContentField());

    modal.appendChild(form);

    // 按钮区
    const actions = document.createElement('div');
    actions.className = 'rule-create-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'rule-create-btn rule-create-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.className = 'rule-create-btn rule-create-btn-save';
    saveBtn.textContent = '创建';
    saveBtn.addEventListener('click', () => this._handleCreate(overlay, modal));

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 聚焦到名称输入框
    const nameInput = modal.querySelector('#rule-name-input');
    if (nameInput) nameInput.focus();

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  _createField(label, id, type, placeholder, helpText) {
    const wrap = document.createElement('div');
    wrap.className = 'rule-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'rule-create-label';
    lbl.textContent = label;
    lbl.htmlFor = id;
    wrap.appendChild(lbl);

    const input = document.createElement('input');
    input.className = 'rule-create-input';
    input.id = id;
    input.type = type;
    input.placeholder = placeholder;
    wrap.appendChild(input);

    if (helpText) {
      const help = document.createElement('div');
      help.className = 'rule-create-help';
      help.textContent = helpText;
      wrap.appendChild(help);
    }

    return wrap;
  }

  _createModeSelect() {
    const wrap = document.createElement('div');
    wrap.className = 'rule-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'rule-create-label';
    lbl.textContent = '模式';
    wrap.appendChild(lbl);

    const toggle = document.createElement('div');
    toggle.className = 'rule-create-toggle';

    const alwaysBtn = document.createElement('button');
    alwaysBtn.type = 'button';
    alwaysBtn.className = 'rule-create-toggle-btn active';
    alwaysBtn.dataset.value = 'always';
    alwaysBtn.textContent = '始终生效';

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'rule-create-toggle-btn';
    manualBtn.dataset.value = 'manual';
    manualBtn.textContent = '手动引用';

    const updateActive = (active) => {
      [alwaysBtn, manualBtn].forEach(b => b.classList.toggle('active', b === active));
    };
    alwaysBtn.addEventListener('click', () => updateActive(alwaysBtn));
    manualBtn.addEventListener('click', () => updateActive(manualBtn));

    toggle.appendChild(alwaysBtn);
    toggle.appendChild(manualBtn);
    wrap.appendChild(toggle);

    const help = document.createElement('div');
    help.className = 'rule-create-help';
    help.textContent = '始终生效：自动注入 system prompt；手动引用：用户点选引用';
    wrap.appendChild(help);

    return wrap;
  }

  _createScopeSelect() {
    const wrap = document.createElement('div');
    wrap.className = 'rule-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'rule-create-label';
    lbl.textContent = '作用域';
    wrap.appendChild(lbl);

    const toggle = document.createElement('div');
    toggle.className = 'rule-create-toggle';

    const projectBtn = document.createElement('button');
    projectBtn.type = 'button';
    projectBtn.className = 'rule-create-toggle-btn active';
    projectBtn.dataset.value = 'project';
    projectBtn.textContent = '项目规则';

    const userBtn = document.createElement('button');
    userBtn.type = 'button';
    userBtn.className = 'rule-create-toggle-btn';
    userBtn.dataset.value = 'user';
    userBtn.textContent = '全局规则';

    const updateActive = (active) => {
      [projectBtn, userBtn].forEach(b => b.classList.toggle('active', b === active));
    };
    projectBtn.addEventListener('click', () => updateActive(projectBtn));
    userBtn.addEventListener('click', () => updateActive(userBtn));

    toggle.appendChild(projectBtn);
    toggle.appendChild(userBtn);
    wrap.appendChild(toggle);

    const help = document.createElement('div');
    help.className = 'rule-create-help';
    help.textContent = '项目规则：随 Git 同步；全局规则：个人兜底';
    wrap.appendChild(help);

    return wrap;
  }

  _createContentField() {
    const wrap = document.createElement('div');
    wrap.className = 'rule-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'rule-create-label';
    lbl.textContent = '内容（可选）';
    wrap.appendChild(lbl);

    const textarea = document.createElement('textarea');
    textarea.className = 'rule-create-textarea';
    textarea.id = 'rule-content-input';
    textarea.placeholder = '规则正文内容，不填则生成模板';
    textarea.rows = 6;
    wrap.appendChild(textarea);

    return wrap;
  }

  async _handleCreate(overlay, modal) {
    const name = modal.querySelector('#rule-name-input').value.trim();
    const description = modal.querySelector('#rule-desc-input').value.trim();
    const mode = modal.querySelector('.rule-create-toggle-btn.active[data-value="always"], .rule-create-toggle-btn.active[data-value="manual"]')
      ?.dataset.value || 'always';
    const scope = modal.querySelector('.rule-create-toggle-btn.active[data-value="project"], .rule-create-toggle-btn.active[data-value="user"]')
      ?.dataset.value || 'project';
    const content = modal.querySelector('#rule-content-input')?.value || '';

    if (!name) {
      this._showError(modal, '请输入规则名称');
      return;
    }

    // 禁用按钮防止重复提交
    const saveBtn = modal.querySelector('.rule-create-btn-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '创建中...';
    }

    try {
      const response = await fetch('/api/rules/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mode, description, scope, content })
      });
      const result = await response.json();

      if (result.success) {
        overlay.remove();
        // 刷新规则列表
        this._loaded = false;
        this._rules = [];
      } else {
        this._showError(modal, result.message || '创建失败');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '创建';
        }
      }
    } catch (e) {
      this._showError(modal, '网络错误，请重试');
      console.warn('创建规则失败:', e);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '创建';
      }
    }
  }

  _showError(modal, message) {
    // 移除旧错误提示
    const oldErr = modal.querySelector('.rule-create-error');
    oldErr?.remove();

    const err = document.createElement('div');
    err.className = 'rule-create-error';
    err.textContent = message;
    modal.insertBefore(err, modal.querySelector('.rule-create-actions'));
  }
}
