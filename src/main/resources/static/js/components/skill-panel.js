/**
 * 技能面板组件 — 管理项目级和用户级技能文件。
 *
 * 展示技能列表（分组），支持新建、删除、刷新。
 * 注册为 Activity Bar 的 'skills' 面板。
 */
export class SkillPanel {
  constructor() {
    this._projectSkills = [];
    this._userSkills = [];
    this._loading = false;
    this._container = null;
    this._projectListEl = null;
    this._userListEl = null;
    this._emptyEl = null;
    this._errorEl = null;
  }

  /**
   * 创建面板 DOM，挂载到 Activity Bar 面板 body 中。
   */
  render() {
    this._container = document.createElement('div');
    this._container.className = 'skill-panel';

    // 标题 + 操作栏
    const header = document.createElement('div');
    header.className = 'skill-panel-header';

    const title = document.createElement('span');
    title.className = 'skill-panel-title';
    title.textContent = '技能管理';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'skill-panel-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'skill-panel-btn skill-panel-btn-icon';
    refreshBtn.title = '刷新';
    refreshBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>`;
    refreshBtn.addEventListener('click', () => this._loadSkills());
    actions.appendChild(refreshBtn);

    const createBtn = document.createElement('button');
    createBtn.className = 'skill-panel-btn skill-panel-btn-primary';
    createBtn.innerHTML = '+ 新建';
    createBtn.addEventListener('click', () => this._showCreateModal());
    actions.appendChild(createBtn);

    header.appendChild(actions);
    this._container.appendChild(header);

    // 加载状态
    this._loadingEl = document.createElement('div');
    this._loadingEl.className = 'skill-panel-loading';
    this._loadingEl.textContent = '加载中...';
    this._loadingEl.style.display = 'none';
    this._container.appendChild(this._loadingEl);

    // 错误提示
    this._errorEl = document.createElement('div');
    this._errorEl.className = 'skill-panel-error';
    this._errorEl.style.display = 'none';
    this._container.appendChild(this._errorEl);

    // 空状态
    this._emptyEl = document.createElement('div');
    this._emptyEl.className = 'skill-panel-empty';
    this._emptyEl.innerHTML = '暂无技能文件<br><span style="font-size:11px;opacity:0.6;">点击「+ 新建」创建第一个技能</span>';
    this._container.appendChild(this._emptyEl);

    // 技能列表容器
    const listContainer = document.createElement('div');
    listContainer.className = 'skill-panel-list';

    // 项目级
    const projectGroup = this._createGroup('项目技能', 'project');
    listContainer.appendChild(projectGroup);

    // 用户级
    const userGroup = this._createGroup('用户技能', 'user');
    listContainer.appendChild(userGroup);

    this._container.appendChild(listContainer);

    return this._container;
  }

  /**
   * 创建分组 DOM。
   */
  _createGroup(label, type) {
    const group = document.createElement('div');
    group.className = 'skill-panel-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'skill-panel-group-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'skill-panel-group-label';
    labelEl.textContent = label;

    const countEl = document.createElement('span');
    countEl.className = 'skill-panel-group-count';
    countEl.id = `skillCount${type.charAt(0).toUpperCase() + type.slice(1)}`;
    countEl.textContent = '0';

    groupHeader.appendChild(labelEl);
    groupHeader.appendChild(countEl);
    group.appendChild(groupHeader);

    const list = document.createElement('div');
    list.className = 'skill-panel-items';
    list.id = `skillList${type.charAt(0).toUpperCase() + type.slice(1)}`;
    group.appendChild(list);

    return group;
  }

  /**
   * 加载技能列表。
   */
  async _loadSkills() {
    if (this._loading) return;
    this._loading = true;

    this._loadingEl.style.display = 'block';
    this._errorEl.style.display = 'none';
    this._emptyEl.style.display = 'none';

    try {
      const resp = await fetch('/api/skills/list');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      this._projectSkills = data.projectSkills || [];
      this._userSkills = data.userSkills || [];

      this._renderList();
    } catch (e) {
      console.warn('加载技能列表失败:', e);
      this._errorEl.textContent = '加载失败，请重试';
      this._errorEl.style.display = 'block';
    } finally {
      this._loading = false;
      this._loadingEl.style.display = 'none';
    }
  }

  /**
   * 渲染技能列表。
   */
  _renderList() {
    this._projectListEl = this._container.querySelector('#skillListProject');
    this._userListEl = this._container.querySelector('#skillListUser');

    this._renderGroupList(this._projectListEl, this._projectSkills, 'project');
    this._renderGroupList(this._userListEl, this._userSkills, 'user');

    // 更新计数
    const projectCount = this._container.querySelector('#skillCountProject');
    const userCount = this._container.querySelector('#skillCountUser');
    if (projectCount) projectCount.textContent = this._projectSkills.length;
    if (userCount) userCount.textContent = this._userSkills.length;

    // 空状态
    const total = this._projectSkills.length + this._userSkills.length;
    this._emptyEl.style.display = total === 0 ? 'block' : 'none';
  }

  _renderGroupList(listEl, skills, source) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-panel-empty-item';
      empty.textContent = '暂无';
      listEl.appendChild(empty);
      return;
    }

    for (const skill of skills) {
      const item = document.createElement('div');
      item.className = 'skill-panel-item';
      item.addEventListener('click', () => this._showDetailModal(skill, source));

      const info = document.createElement('div');
      info.className = 'skill-panel-item-info';

      const name = document.createElement('div');
      name.className = 'skill-panel-item-name';
      name.textContent = skill.name || skill.fileName.replace(/\.md$/, '');
      info.appendChild(name);

      if (skill.description) {
        const desc = document.createElement('div');
        desc.className = 'skill-panel-item-desc';
        desc.textContent = skill.description;
        info.appendChild(desc);
      }

      item.appendChild(info);

      // 删除按钮
      const delBtn = document.createElement('button');
      delBtn.className = 'skill-panel-item-del';
      delBtn.title = '删除';
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteSkill(skill, source);
      });
      item.appendChild(delBtn);

      listEl.appendChild(item);
    }
  }

  /**
   * 删除技能。
   */
  async _deleteSkill(skill, source) {
    if (!confirm(`确定删除技能「${skill.name || skill.fileName}」？`)) return;

    try {
      const resp = await fetch('/api/skills/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: skill.filePath,
          fileName: skill.fileName,
          scope: source
        })
      });
      const result = await resp.json();

      if (result.success) {
        // 从本地列表移除
        if (source === 'project') {
          this._projectSkills = this._projectSkills.filter(s => s.fileName !== skill.fileName);
        } else {
          this._userSkills = this._userSkills.filter(s => s.fileName !== skill.fileName);
        }
        this._renderList();
      } else {
        alert('删除失败: ' + (result.message || '未知错误'));
      }
    } catch (e) {
      console.warn('删除技能失败:', e);
      alert('删除失败，请重试');
    }
  }

  // ==================== 技能详情/编辑弹窗 ====================

  async _showDetailModal(skill, source) {
    const overlay = document.createElement('div');
    overlay.className = 'skill-detail-overlay';

    const modal = document.createElement('div');
    modal.className = 'skill-detail-modal';

    // ── 名称输入 ──
    const nameGroup = document.createElement('div');
    nameGroup.className = 'skill-detail-field';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'skill-detail-label';
    nameLabel.textContent = '技能名称';
    nameLabel.htmlFor = 'detail-skill-name';
    const nameInput = document.createElement('input');
    nameInput.className = 'skill-detail-input';
    nameInput.id = 'detail-skill-name';
    nameInput.type = 'text';
    nameInput.value = skill.name || skill.fileName.replace(/\.md$/, '');
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    modal.appendChild(nameGroup);

    // ── 作用域切换 ──
    const scopeGroup = document.createElement('div');
    scopeGroup.className = 'skill-detail-field';
    const scopeLabel = document.createElement('label');
    scopeLabel.className = 'skill-detail-label';
    scopeLabel.textContent = '作用域';
    scopeGroup.appendChild(scopeLabel);

    const scopeToggle = document.createElement('div');
    scopeToggle.className = 'skill-detail-toggle';

    const projectBtn = document.createElement('button');
    projectBtn.type = 'button';
    projectBtn.className = 'skill-detail-toggle-btn';
    projectBtn.dataset.value = 'project';
    projectBtn.textContent = '项目技能';
    if (source === 'project') projectBtn.classList.add('active');

    const userBtn = document.createElement('button');
    userBtn.type = 'button';
    userBtn.className = 'skill-detail-toggle-btn';
    userBtn.dataset.value = 'user';
    userBtn.textContent = '全局技能';
    if (source === 'user') userBtn.classList.add('active');

    const updateScope = (active) => {
      [projectBtn, userBtn].forEach(b => b.classList.toggle('active', b === active));
    };
    projectBtn.addEventListener('click', () => updateScope(projectBtn));
    userBtn.addEventListener('click', () => updateScope(userBtn));

    scopeToggle.appendChild(projectBtn);
    scopeToggle.appendChild(userBtn);
    scopeGroup.appendChild(scopeToggle);
    modal.appendChild(scopeGroup);

    // ── 描述输入 ──
    const descGroup = document.createElement('div');
    descGroup.className = 'skill-detail-field';
    const descLabel = document.createElement('label');
    descLabel.className = 'skill-detail-label';
    descLabel.textContent = '描述';
    descLabel.htmlFor = 'detail-skill-desc';
    const descInput = document.createElement('input');
    descInput.className = 'skill-detail-input';
    descInput.id = 'detail-skill-desc';
    descInput.type = 'text';
    descInput.placeholder = '简短说明，前端展示用';
    descInput.value = skill.description || '';
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);
    modal.appendChild(descGroup);

    // ── 分隔线 ──
    const divider = document.createElement('div');
    divider.className = 'skill-detail-divider';
    modal.appendChild(divider);

    // ── 文件路径提示 ──
    const fileHint = document.createElement('div');
    fileHint.className = 'skill-detail-file-hint';
    fileHint.textContent = `📄 ${skill.fileName}`;
    modal.appendChild(fileHint);

    // ── 加载状态 ──
    const loadingEl = document.createElement('div');
    loadingEl.className = 'skill-detail-loading';
    loadingEl.textContent = '加载内容...';
    modal.appendChild(loadingEl);

    // ── Raw 编辑器 ──
    const editorWrap = document.createElement('div');
    editorWrap.className = 'skill-detail-editor-wrap';
    editorWrap.style.display = 'none';

    const textarea = document.createElement('textarea');
    textarea.className = 'skill-detail-textarea';
    textarea.id = 'detail-skill-content';
    textarea.spellcheck = false;
    textarea.placeholder = '...';
    editorWrap.appendChild(textarea);
    modal.appendChild(editorWrap);

    // ── 状态提示 ──
    const statusEl = document.createElement('div');
    statusEl.className = 'skill-detail-status';
    statusEl.id = 'detailSkillStatus';
    statusEl.style.display = 'none';
    modal.appendChild(statusEl);

    // ── 按钮区 ──
    const actions = document.createElement('div');
    actions.className = 'skill-detail-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'skill-detail-btn skill-detail-btn-primary';
    saveBtn.textContent = '保存';
    saveBtn.style.display = 'none';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'skill-detail-btn skill-detail-btn-ghost';
    closeBtn.textContent = '取消';
    closeBtn.addEventListener('click', () => overlay.remove());

    saveBtn.addEventListener('click', () => this._handleSaveDetail(overlay, modal, skill, source));

    actions.appendChild(closeBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // → 加载内容
    try {
      const resp = await fetch(`/api/skills/get?filePath=${encodeURIComponent(skill.filePath)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      loadingEl.remove();
      editorWrap.style.display = 'block';
      textarea.value = data.content;
      saveBtn.style.display = 'inline-flex';
    } catch (e) {
      console.warn('加载技能内容失败:', e);
      loadingEl.textContent = '加载失败，请重试';
      loadingEl.classList.add('skill-detail-loading-error');
    }
  }

  async _handleSaveDetail(overlay, modal, skill, source) {
    const nameInput = modal.querySelector('#detail-skill-name');
    const descInput = modal.querySelector('#detail-skill-desc');
    const textarea = modal.querySelector('#detail-skill-content');
    const scopeBtn = modal.querySelector('.skill-detail-toggle-btn.active');
    const statusEl = modal.querySelector('#detailSkillStatus');
    const saveBtn = modal.querySelector('.skill-detail-btn-primary');

    const name = nameInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    const scope = scopeBtn?.dataset.value || source;
    const content = textarea?.value || '';

    if (!name) {
      this._showDetailStatus(statusEl, '⚠️ 技能名称不能为空', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';

    try {
      const resp = await fetch('/api/skills/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: skill.filePath,
          name,
          description,
          scope,
          content
        })
      });
      const result = await resp.json();

      if (result.success) {
        this._showDetailStatus(statusEl, '✓ 技能已保存', 'success');
        saveBtn.textContent = '✓ 已保存';
        // 更新内存中的 filePath（改名后路径可能变了）
        skill.filePath = result.filePath || skill.filePath;
        // 刷新列表
        this._loadSkills();
      } else {
        this._showDetailStatus(statusEl, '⚠️ ' + (result.message || '保存失败'), 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    } catch (e) {
      console.warn('保存技能失败:', e);
      this._showDetailStatus(statusEl, '⚠️ 网络错误，请重试', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  }

  _showDetailStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'skill-detail-status skill-detail-status-' + type;
    el.style.display = 'block';
  }

  // ==================== 新建技能弹窗 ====================

  _showCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'skill-create-overlay';

    const modal = document.createElement('div');
    modal.className = 'skill-create-modal';

    // 标题
    const title = document.createElement('div');
    title.className = 'skill-create-title';
    title.textContent = '新建技能';
    modal.appendChild(title);

    // 表单
    const form = document.createElement('div');
    form.className = 'skill-create-form';

    // 技能名称
    form.appendChild(this._createField('技能名称', 'skill-name-input', 'text', 'my-skill', '字母、数字、连字符，不含 .md'));
    // 描述
    form.appendChild(this._createField('描述（可选）', 'skill-desc-input', 'text', '', '简短说明，前端展示用'));
    // 作用域
    form.appendChild(this._createScopeSelect());
    // 内容
    form.appendChild(this._createContentField());

    modal.appendChild(form);

    // 按钮区
    const actions = document.createElement('div');
    actions.className = 'skill-create-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'skill-create-btn skill-create-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.className = 'skill-create-btn skill-create-btn-save';
    saveBtn.textContent = '创建';
    saveBtn.addEventListener('click', () => this._handleCreate(overlay, modal));

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 聚焦名称输入框
    const nameInput = modal.querySelector('#skill-name-input');
    if (nameInput) nameInput.focus();

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  _createField(label, id, type, placeholder, helpText) {
    const wrap = document.createElement('div');
    wrap.className = 'skill-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'skill-create-label';
    lbl.textContent = label;
    lbl.htmlFor = id;
    wrap.appendChild(lbl);

    const input = document.createElement('input');
    input.className = 'skill-create-input';
    input.id = id;
    input.type = type;
    input.placeholder = placeholder;
    wrap.appendChild(input);

    if (helpText) {
      const help = document.createElement('div');
      help.className = 'skill-create-help';
      help.textContent = helpText;
      wrap.appendChild(help);
    }

    return wrap;
  }

  _createScopeSelect() {
    const wrap = document.createElement('div');
    wrap.className = 'skill-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'skill-create-label';
    lbl.textContent = '作用域';
    wrap.appendChild(lbl);

    const toggle = document.createElement('div');
    toggle.className = 'skill-create-toggle';

    const projectBtn = document.createElement('button');
    projectBtn.type = 'button';
    projectBtn.className = 'skill-create-toggle-btn active';
    projectBtn.dataset.value = 'project';
    projectBtn.textContent = '项目技能';

    const userBtn = document.createElement('button');
    userBtn.type = 'button';
    userBtn.className = 'skill-create-toggle-btn';
    userBtn.dataset.value = 'user';
    userBtn.textContent = '全局技能';

    const updateActive = (active) => {
      [projectBtn, userBtn].forEach(b => b.classList.toggle('active', b === active));
    };
    projectBtn.addEventListener('click', () => updateActive(projectBtn));
    userBtn.addEventListener('click', () => updateActive(userBtn));

    toggle.appendChild(projectBtn);
    toggle.appendChild(userBtn);
    wrap.appendChild(toggle);

    const help = document.createElement('div');
    help.className = 'skill-create-help';
    help.textContent = '项目技能：随 Git 同步；全局技能：个人兜底';
    wrap.appendChild(help);

    return wrap;
  }

  _createContentField() {
    const wrap = document.createElement('div');
    wrap.className = 'skill-create-field';

    const lbl = document.createElement('label');
    lbl.className = 'skill-create-label';
    lbl.textContent = '内容（可选）';
    wrap.appendChild(lbl);

    const textarea = document.createElement('textarea');
    textarea.className = 'skill-create-textarea';
    textarea.id = 'skill-content-input';
    textarea.placeholder = '技能正文内容，Markdown 格式';
    textarea.rows = 6;
    wrap.appendChild(textarea);

    return wrap;
  }

  async _handleCreate(overlay, modal) {
    const name = modal.querySelector('#skill-name-input').value.trim();
    const description = modal.querySelector('#skill-desc-input').value.trim();
    const scope = modal.querySelector('.skill-create-toggle-btn.active')
      ?.dataset.value || 'project';
    const content = modal.querySelector('#skill-content-input')?.value || '';

    if (!name) {
      this._showError(modal, '请输入技能名称');
      return;
    }

    const saveBtn = modal.querySelector('.skill-create-btn-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '创建中...';
    }

    try {
      const resp = await fetch('/api/skills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, scope, content })
      });
      const result = await resp.json();

      if (result.success) {
        overlay.remove();
        this._loadSkills();
      } else {
        this._showError(modal, result.message || '创建失败');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '创建';
        }
      }
    } catch (e) {
      console.warn('创建技能失败:', e);
      this._showError(modal, '网络错误，请重试');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '创建';
      }
    }
  }

  _showError(modal, message) {
    const oldErr = modal.querySelector('.skill-create-error');
    oldErr?.remove();

    const err = document.createElement('div');
    err.className = 'skill-create-error';
    err.textContent = message;
    modal.insertBefore(err, modal.querySelector('.skill-create-actions'));
  }
}
