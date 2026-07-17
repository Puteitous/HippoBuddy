/**
 * SkillsSettingsPage — 技能管理页面
 *
 * 技能文件列表（项目技能 / 全局技能分组）
 * 创建 / 编辑 / 删除技能
 */
import { apiGet, apiPost } from '../../utils.js';
import { showToast } from '../../utils/toast.js';
import { getFileIconInfo } from '../../utils/file-icons.js';
import { ConfirmDialog } from '../../utils/modal.js';

export class SkillsSettingsPage {
  constructor() {
    this._projectSkills = [];
    this._userSkills = [];
    this._editingSkill = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">技能管理</h2>
      <p class="settings-page-desc">管理项目级和用户级技能文件，按「项目技能」和「全局技能」分组</p>
      <hr class="settings-page-divider">

      <div class="settings-item-list-header">
        <h3>技能列表</h3>
        <div class="settings-item-list-actions">
          <button class="settings-btn settings-btn-icon" id="settingsSkillsRefresh" title="刷新">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="settings-btn settings-btn-primary" id="settingsSkillsCreate">+ 新建</button>
        </div>
      </div>

      <div class="settings-loading" id="settingsSkillsLoading" style="display:none;">加载中...</div>
      <div class="settings-items-error" id="settingsSkillsError" style="display:none;"></div>
      <div id="settingsSkillsList"></div>
    `;

    container.appendChild(page);

    document.getElementById('settingsSkillsRefresh')?.addEventListener('click', () => this._loadSkills());
    document.getElementById('settingsSkillsCreate')?.addEventListener('click', () => this._showCreateSkillModal());

    this._loadSkills();
  }

  destroy() {
    this._editingSkill = null;
    this._projectSkills = [];
    this._userSkills = [];
    this._container = null;
  }

  /**
   * 刷新技能列表（供外部调用，安装技能后自动刷新）
   */
  reloadSkills() {
    this._editingSkill = null;
    this._loadSkills();
  }

  // ==================== 加载列表 ====================

  async _loadSkills() {
    const loadingEl = document.getElementById('settingsSkillsLoading');
    const errorEl = document.getElementById('settingsSkillsError');
    const listEl = document.getElementById('settingsSkillsList');
    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';

    try {
      const data = await apiGet('/api/skills/list');
      this._projectSkills = data.projectSkills || [];
      this._userSkills = data.userSkills || [];
      this._renderSkillsList(listEl);
    } catch (e) {
      console.warn('加载技能列表失败:', e);
      if (errorEl) {
        errorEl.textContent = '加载失败，请重试';
        errorEl.style.display = 'block';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  _renderSkillsList(listEl) {
    if (this._projectSkills.length === 0 && this._userSkills.length === 0) {
      listEl.innerHTML = '<div class="settings-items-empty">暂无技能文件<br><span style="font-size:11px;opacity:0.6;">点击「+ 新建」创建第一个技能</span></div>';
      return;
    }

    listEl.innerHTML = '';

    if (this._projectSkills.length > 0) {
      listEl.appendChild(this._createSkillGroup('项目技能', this._projectSkills, 'project'));
    }
    if (this._userSkills.length > 0) {
      listEl.appendChild(this._createSkillGroup('全局技能', this._userSkills, 'user'));
    }
  }

  _createSkillGroup(label, skills, source) {
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
    count.textContent = skills.length;
    header.appendChild(count);

    group.appendChild(header);

    const items = document.createElement('div');
    items.className = 'settings-items';

    for (const skill of skills) {
      const item = document.createElement('div');
      item.className = 'settings-item';
      item.addEventListener('click', () => this._showSkillDetail(skill, source));

      const iconInfo = getFileIconInfo(skill.fileName);
      const iconEl = document.createElement('img');
      iconEl.className = 'settings-item-icon';
      iconEl.src = '/icons/' + iconInfo.iconFile;
      iconEl.style.width = '18px';
      iconEl.style.height = '18px';
      iconEl.alt = '';
      item.appendChild(iconEl);

      const info = document.createElement('div');
      info.className = 'settings-item-info';

      const name = document.createElement('div');
      name.className = 'settings-item-name';
      name.textContent = skill.name || skill.fileName.replace(/\.md$/, '');
      info.appendChild(name);

      if (skill.description) {
        const meta = document.createElement('div');
        meta.className = 'settings-item-meta';
        meta.textContent = skill.description;
        info.appendChild(meta);
      }

      item.appendChild(info);

      const delBtn = document.createElement('button');
      delBtn.className = 'settings-item-del';
      delBtn.title = '删除';
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteSkill(skill);
      });
      item.appendChild(delBtn);

      items.appendChild(item);
    }

    group.appendChild(items);
    return group;
  }

  // ==================== 详情 / 编辑 ====================

  _showSkillDetail(skill, source) {
    this._editingSkill = skill;
    this._renderSkillEditor(skill, source);
  }

  _renderSkillEditor(skill, source) {
    const listEl = document.getElementById('settingsSkillsList');
    if (!listEl) return;

    const headerActions = document.querySelector('#settingsSkillsCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    const iconInfo = getFileIconInfo(skill.fileName);

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">编辑技能：${skill.name || skill.fileName.replace(/\.md$/, '')}</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsSkillEditorBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsSkillEditorSave">保存</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsSkillEditorName">技能名称</label>
            <input class="settings-input" id="settingsSkillEditorName" type="text" value="${skill.name || skill.fileName.replace(/\.md$/, '')}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsSkillEditorDesc">描述</label>
            <input class="settings-input" id="settingsSkillEditorDesc" type="text" value="${skill.description || ''}" placeholder="简短说明，前端展示用">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">作用域</label>
            <div class="settings-toggle-group" id="settingsSkillEditorScope">
              <button class="settings-toggle-btn ${source === 'project' ? 'active' : ''}" data-value="project">项目技能</button>
              <button class="settings-toggle-btn ${source !== 'project' ? 'active' : ''}" data-value="user">全局技能</button>
            </div>
          </div>
          <div class="settings-field">
            <div style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-xs);color:var(--text-primary);font-family:var(--font-mono);user-select:none;">
              <img src="/icons/${iconInfo.iconFile}" style="width:16px;height:16px;" alt="">
              <span>${skill.fileName}</span>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsSkillEditorContent" placeholder="加载中..." spellcheck="false"></textarea>
        <div class="settings-editor-status" id="settingsSkillEditorStatus" style="display:none;"></div>
      </div>
    `;

    this._loadSkillContent(skill);

    document.getElementById('settingsSkillEditorBack')?.addEventListener('click', () => {
      this._editingSkill = null;
      if (headerActions) headerActions.style.display = '';
      this._loadSkills();
    });

    document.getElementById('settingsSkillEditorSave')?.addEventListener('click', () => {
      this._saveSkillEditor(skill, source);
    });

    document.querySelectorAll('#settingsSkillEditorScope .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsSkillEditorScope .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  async _loadSkillContent(skill) {
    const textarea = document.getElementById('settingsSkillEditorContent');
    if (!textarea) return;

    try {
      const resp = await fetch(`/api/skills/get?filePath=${encodeURIComponent(skill.filePath)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      textarea.value = data.content || '';
      textarea.placeholder = '';
    } catch (e) {
      console.warn('加载技能内容失败:', e);
      textarea.value = '';
      textarea.placeholder = '加载失败';
    }
  }

  async _saveSkillEditor(skill, source) {
    const nameInput = document.getElementById('settingsSkillEditorName');
    const descInput = document.getElementById('settingsSkillEditorDesc');
    const textarea = document.getElementById('settingsSkillEditorContent');
    const scopeBtn = document.querySelector('#settingsSkillEditorScope .settings-toggle-btn.active');
    const saveBtn = document.getElementById('settingsSkillEditorSave');

    if (!nameInput || !textarea) return;

    const name = nameInput.value.trim();
    const description = descInput?.value.trim() || '';
    const scope = scopeBtn?.dataset.value || source;
    const content = textarea.value;

    if (!name) {
      showToast('技能名称不能为空', { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }

    try {
      const result = await apiPost('/api/skills/update', {
        filePath: skill.filePath,
        name,
        description,
        scope,
        content,
      });

      if (result.success) {
        showToast('技能已保存', { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = '✓ 已保存';
        skill.filePath = result.filePath || skill.filePath;
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsSkillsCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._editingSkill = null;
          this._loadSkills();
        }, 400);
      } else {
        showToast('保存失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
        }
      }
    } catch (e) {
      console.warn('保存技能失败:', e);
      showToast('保存失败: 网络错误，请重试', { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    }
  }

  async _deleteSkill(skill) {
    const name = skill.name || skill.fileName.replace(/\.md$/, '');
    const confirmed = await ConfirmDialog.confirmDelete(`确定删除技能「${name}」？`);
    if (!confirmed) return;

    try {
      const result = await apiPost('/api/skills/delete', { filePath: skill.filePath });
      if (result.success) {
        this._loadSkills();
      } else {
        showToast('删除失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      console.warn('删除技能失败:', e);
      showToast('删除失败，请重试', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 创建 ====================

  _showCreateSkillModal() {
    const listEl = document.getElementById('settingsSkillsList');
    if (!listEl) return;

    const headerActions = document.querySelector('#settingsSkillsCreate')?.closest('.settings-item-list-actions');
    if (headerActions) headerActions.style.display = 'none';

    listEl.innerHTML = `
      <div class="settings-editor">
        <div class="settings-editor-header">
          <span class="settings-editor-title">新建技能</span>
          <div class="settings-editor-actions">
            <button class="settings-editor-btn" id="settingsSkillCreateBack">← 返回列表</button>
            <button class="settings-editor-btn settings-editor-btn-primary" id="settingsSkillCreateSave">创建</button>
          </div>
        </div>
        <div class="settings-editor-fields">
          <div class="settings-field">
            <label class="settings-field-label" for="settingsSkillCreateName">技能名称</label>
            <input class="settings-input" id="settingsSkillCreateName" type="text" placeholder="my-skill（字母、数字、连字符，不含 .md）">
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settingsSkillCreateDesc">描述</label>
            <input class="settings-input" id="settingsSkillCreateDesc" type="text" placeholder="简短说明，前端展示用">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">作用域</label>
            <div class="settings-toggle-group" id="settingsSkillCreateScope">
              <button class="settings-toggle-btn active" data-value="project">项目技能</button>
              <button class="settings-toggle-btn" data-value="user">全局技能</button>
            </div>
          </div>
        </div>
        <textarea class="settings-editor-textarea" id="settingsSkillCreateContent" placeholder="技能正文内容，Markdown 格式" spellcheck="false"></textarea>
      </div>
    `;

    document.getElementById('settingsSkillCreateBack')?.addEventListener('click', () => {
      if (headerActions) headerActions.style.display = '';
      this._loadSkills();
    });

    document.getElementById('settingsSkillCreateSave')?.addEventListener('click', () => this._handleCreateSkill());

    document.querySelectorAll('#settingsSkillCreateScope .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#settingsSkillCreateScope .settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  async _handleCreateSkill() {
    const nameInput = document.getElementById('settingsSkillCreateName');
    const descInput = document.getElementById('settingsSkillCreateDesc');
    const textarea = document.getElementById('settingsSkillCreateContent');
    const scopeBtn = document.querySelector('#settingsSkillCreateScope .settings-toggle-btn.active');
    const saveBtn = document.getElementById('settingsSkillCreateSave');

    const name = nameInput?.value?.trim();
    if (!name) {
      showToast('技能名称不能为空', { type: 'warning', duration: 2000 });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '创建中…';
    }

    try {
      const result = await apiPost('/api/skills/create', {
        name,
        description: descInput?.value?.trim() || '',
        scope: scopeBtn?.dataset?.value || 'project',
        content: textarea?.value || '',
      });

      if (result.success) {
        showToast('技能已创建', { type: 'success', duration: 2000 });
        if (saveBtn) saveBtn.textContent = '✓ 已创建';
        setTimeout(() => {
          const headerActions = document.querySelector('#settingsSkillsCreate')?.closest('.settings-item-list-actions');
          if (headerActions) headerActions.style.display = '';
          this._loadSkills();
        }, 400);
      } else {
        showToast('创建失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '创建';
        }
      }
    } catch (e) {
      console.warn('创建技能失败:', e);
      showToast('创建失败: 网络错误，请重试', { type: 'error', duration: 3000 });
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '创建';
      }
    }
  }
}
