import { apiGet } from '../utils.js';

/**
 * 上下文选择器组件 — 合并「规则」和「技能」的引用入口。
 *
 * 两级菜单：
 *   第一级 → 选择类别（规则 / 技能）
 *   第二级 → 对应的列表（规则：always灰显 + manual可选；技能：可选）
 *
 * 选中规则：内部维护 _selectedRuleIds，发送消息时通过 getSelectedRuleIds() 传给后端。
 * 选中技能：通过 onSkillToggle 回调实时在输入区 refs 栏生成/移除 @path chip，
 *           行为完全复用现有的文件引用机制。
 */
export class ContextSelector {
  /**
   * @param {{ onRulesChange?: (ids: string[]) => void, onSkillToggle?: (skill: object, selected: boolean) => void, onRuleToggle?: (rule: object, selected: boolean) => void }} opts
   */
  constructor({ onRulesChange, onSkillToggle, onRuleToggle } = {}) {
    this._rules = [];
    this._skills = [];
    this._selectedRuleIds = new Set();
    this._selectedSkillPaths = new Set();
    this._onRulesChange = onRulesChange;
    this._onSkillToggle = onSkillToggle;
    this._onRuleToggle = onRuleToggle;
    this._loading = false;
    this._loaded = false;
    this._panel = null;
    this._btn = null;
    this._level = 'menu'; // 'menu' | 'rules' | 'skills'
    this._closeTimer = null;
    this._sticky = false;   // true = 点击固定，hover 不关闭

    this._createButton();
  }

  // ==================== 公开方法 ====================

  getSelectedRuleIds() {
    return Array.from(this._selectedRuleIds);
  }

  /** 返回当前选中的规则对象列表 */
  getSelectedRules() {
    return Array.from(this._selectedRuleIds)
      .map(id => this._rules.find(r => r.id === id))
      .filter(Boolean);
  }

  getSelectedSkillPaths() {
    return Array.from(this._selectedSkillPaths);
  }

  clearSelection() {
    // 通知每个已选中的规则被取消
    for (const id of this._selectedRuleIds) {
      const rule = this._rules.find(r => r.id === id);
      if (rule) this._onRuleToggle?.(rule, false);
    }
    this._selectedRuleIds.clear();
    this._selectedSkillPaths.clear();
    this._updateButtonLabel();
  }

  /** 取消选中指定 ID 的规则（供 refs 栏关闭卡片时调用） */
  deselectRule(ruleId) {
    if (!this._selectedRuleIds.has(ruleId)) return;
    this._selectedRuleIds.delete(ruleId);
    const rule = this._rules.find(r => r.id === ruleId);
    if (rule) this._onRuleToggle?.(rule, false);
    this._updateButtonLabel();
    this._onRulesChange?.(this.getSelectedRuleIds());
  }

  destroy() {
    this._btn?.remove();
    this._panel?.remove();
  }

  // ==================== 按钮 ====================

  _createButton() {
    this._btn = document.createElement('button');
    this._btn.className = 'context-selector-btn';
    this._btn.title = '引用上下文';
    this._btn.innerHTML = this._getButtonHTML(0);
    this._btn.addEventListener('click', () => this._togglePanel());
    this._btn.addEventListener('mouseenter', () => this._onButtonEnter());
    this._btn.addEventListener('mouseleave', () => this._onButtonLeave());
  }

  _getButtonHTML(count) {
    const badge = count > 0
      ? `<span class="context-selector-badge">${count}</span>`
      : '';
    return `<span class="context-selector-hash">#</span>${badge}`;
  }

  _updateButtonLabel() {
    if (!this._btn) return;
    const total = this._selectedRuleIds.size + this._selectedSkillPaths.size;
    this._btn.innerHTML = this._getButtonHTML(total);
  }

  getButtonElement() {
    return this._btn;
  }

  // ==================== 面板 ====================

  async _togglePanel() {
    if (this._panel && this._panel.parentNode) {
      if (this._sticky) {
        this._closePanel();
      } else {
        this._sticky = true;
      }
      return;
    }

    if (!this._loaded && !this._loading) {
      this._loading = true;
      await this._loadData();
      this._loading = false;
      this._loaded = true;
    }

    this._level = 'menu';
    this._sticky = true;
    this._openPanel();
  }

  _onButtonEnter() {
    if (this._panel) return; // 已打开，不需要重复操作
    this._openPanelFromHover();
  }

  _onButtonLeave() {
    if (!this._panel || this._sticky) return;
    this._scheduleClose();
  }

  async _openPanelFromHover() {
    if (!this._loaded && !this._loading) {
      this._loading = true;
      await this._loadData();
      this._loading = false;
      this._loaded = true;
    }
    // 异步加载期间用户已移开鼠标，不再弹出
    if (this._closeTimer) return;
    this._level = 'menu';
    this._sticky = false;
    this._openPanel();
  }

  _scheduleClose() {
    this._cancelScheduledClose();
    this._closeTimer = setTimeout(() => {
      this._closePanel();
    }, 250);
  }

  _cancelScheduledClose() {
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
  }

  _openPanel() {
    this._panel = document.createElement('div');
    this._panel.className = 'context-selector-panel';
    this._render();

    // 会话态使用 .input-inner（可见），hero 态使用 .empty-hero-input-area（可见）
    const inputInner = document.querySelector('.input-inner');
    const parent = (inputInner && inputInner.offsetParent)
      ? inputInner
      : document.querySelector('.empty-hero-input-area') || document.body;
    parent.appendChild(this._panel);
    this._positionPanel();

    // 面板 hover 控制：鼠标移入面板取消关闭，移出后非 sticky 时延迟关闭
    this._panel.addEventListener('mouseenter', () => this._cancelScheduledClose());
    this._panel.addEventListener('mouseleave', () => {
      if (!this._sticky) this._scheduleClose();
    });

    this._outsideClickHandler = (e) => {
      if (!this._panel.contains(e.target) && e.target !== this._btn) {
        this._closePanel();
      }
    };
    setTimeout(() => document.addEventListener('click', this._outsideClickHandler), 0);
  }

  _closePanel() {
    this._cancelScheduledClose();
    this._sticky = false;
    if (this._outsideClickHandler) {
      document.removeEventListener('click', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
    this._panel?.remove();
    this._panel = null;
  }

  _positionPanel() {
    if (!this._panel || !this._btn) return;
    const parent = this._panel.parentElement;
    const panelWidth = 320;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const btnRect = this._btn.getBoundingClientRect();
    let left = btnRect.left - parentRect.left;
    if (left + panelWidth > parentRect.width - 8) {
      left = Math.max(8, parentRect.width - panelWidth - 8);
    }
    const bottom = parentRect.bottom - btnRect.top - 140;
    this._panel.style.position = 'absolute';
    this._panel.style.left = left + 'px';
    this._panel.style.bottom = bottom + 'px';
    this._panel.style.width = panelWidth + 'px';
  }

  // ==================== 渲染 ====================

  _render() {
    if (!this._panel) return;
    this._panel.innerHTML = '';

    if (this._level === 'menu') {
      this._renderMenu();
    } else if (this._level === 'rules') {
      this._renderRules();
    } else if (this._level === 'skills') {
      this._renderSkills();
    }
  }

  /** 第一级：类别菜单 */
  _renderMenu() {
    const header = document.createElement('div');
    header.className = 'context-selector-header';
    header.textContent = '# 引用上下文';
    this._panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'context-selector-body';

    // 规则入口
    const rulesEntry = document.createElement('div');
    rulesEntry.className = 'context-selector-menu-item';
    rulesEntry.innerHTML = `<span class="context-selector-menu-icon">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6.5" y="0.5" width="3" height="1.5" rx="0.4"/>
          <path d="M5 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-2"/>
          <path d="M5.5 2a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5.5.5 0 0 0-.5-.5H6a.5.5 0 0 0-.5.5z"/>
          <path d="M6 8.5l1.5 1.5L10 7"/>
        </svg>
      </span>
      <span class="context-selector-menu-label">规则</span>
      <span class="context-selector-menu-arrow">›</span>`;
    rulesEntry.addEventListener('click', (e) => {
      e.stopPropagation();
      this._level = 'rules';
      this._render();
    });
    body.appendChild(rulesEntry);

    // 技能入口
    const skillsEntry = document.createElement('div');
    skillsEntry.className = 'context-selector-menu-item';
    skillsEntry.innerHTML = `<span class="context-selector-menu-icon">
        <svg viewBox="0 0 612.003 612.003" width="14" height="14" fill="currentColor">
          <path d="M609.707,243.824l-66.984-89.758l35.964-106.065c1.414-4.175,0.336-8.792-2.781-11.905c-2.21-2.21-5.177-3.394-8.203-3.394c-1.239,0-2.493,0.199-3.708,0.608l-106.06,35.964L368.18,2.294C366.136,0.774,363.698,0,361.248,0c-1.794,0-3.597,0.416-5.254,1.263c-3.929,1.998-6.385,6.055-6.325,10.464l1.434,111.983l-91.441,64.667c-3.595,2.542-5.438,6.92-4.75,11.265c0.69,4.358,3.794,7.942,8.004,9.254l106.948,33.236L403.1,349.086c0.571,1.825,1.566,3.451,2.869,4.748c1.701,1.704,3.918,2.856,6.385,3.254c0.602,0.095,1.208,0.142,1.807,0.142c3.721,0,7.27-1.801,9.458-4.896l64.672-91.441l111.972,1.436c0.049,0,0.095,0,0.142,0c4.361,0,8.345-2.434,10.33-6.319C612.74,252.078,612.336,247.361,609.707,243.824z"/>
          <path d="M259.681,256.408L19.864,496.23c-26.484,26.48-26.48,69.422,0,95.906c26.486,26.489,69.426,26.489,95.906,0.007l239.815-239.82l-22.736-73.169L259.681,256.408z"/>
        </svg>
      </span>
      <span class="context-selector-menu-label">技能</span>
      <span class="context-selector-menu-arrow">›</span>`;
    skillsEntry.addEventListener('click', (e) => {
      e.stopPropagation();
      this._level = 'skills';
      this._render();
    });
    body.appendChild(skillsEntry);

    this._panel.appendChild(body);
  }

  /** 第二级：规则列表 */
  _renderRules() {
    // 标题 + 返回
    const header = document.createElement('div');
    header.className = 'context-selector-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'context-selector-back';
    backBtn.innerHTML = '←';
    backBtn.title = '返回';
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._level = 'menu';
      this._render();
    });
    header.appendChild(backBtn);

    const title = document.createElement('span');
    title.textContent = '规则';
    header.appendChild(title);
    this._panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'context-selector-body';

    if (this._rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'context-selector-empty';
      empty.innerHTML = '暂无规则<br><span style="font-size:11px;opacity:0.6;">前往左侧活动栏创建</span>';
      body.appendChild(empty);
    } else {
      const alwaysRules = this._rules.filter(r => r.mode === 'always');
      const manualRules = this._rules.filter(r => r.mode !== 'always');

      if (alwaysRules.length > 0) {
        this._appendRuleGroup(body, '始终生效', alwaysRules, true);
      }
      if (manualRules.length > 0) {
        this._appendRuleGroup(body, '手动引用', manualRules, false);
      }
    }

    this._panel.appendChild(body);
  }

  _appendRuleGroup(container, label, rules, disabled) {
    const group = document.createElement('div');
    group.className = 'context-selector-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'context-selector-group-label';
    groupLabel.textContent = label;
    group.appendChild(groupLabel);

    for (const rule of rules) {
      const item = document.createElement('div');
      item.className = 'context-selector-item';
      if (this._selectedRuleIds.has(rule.id)) {
        item.classList.add('selected');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this._selectedRuleIds.has(rule.id);
      checkbox.disabled = disabled;

      const applyRuleToggle = () => {
        if (disabled) return;
        const selected = checkbox.checked;
        if (selected) {
          this._selectedRuleIds.add(rule.id);
          item.classList.add('selected');
        } else {
          this._selectedRuleIds.delete(rule.id);
          item.classList.remove('selected');
        }
        this._updateButtonLabel();
        this._onRulesChange?.(this.getSelectedRuleIds());
        this._onRuleToggle?.(rule, selected);
      };
      checkbox.addEventListener('change', applyRuleToggle);
      item.addEventListener('click', (e) => {
        if (e.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        applyRuleToggle();
      });

      const info = document.createElement('div');
      info.className = 'context-selector-item-info';

      const name = document.createElement('div');
      name.className = 'context-selector-item-name';
      name.textContent = rule.name;
      info.appendChild(name);

      if (rule.description && rule.description !== rule.name) {
        const desc = document.createElement('div');
        desc.className = 'context-selector-item-desc';
        desc.textContent = rule.description;
        info.appendChild(desc);
      }

      item.appendChild(checkbox);
      item.appendChild(info);
      group.appendChild(item);
    }

    container.appendChild(group);
  }

  /** 第二级：技能列表 */
  _renderSkills() {
    // 标题 + 返回
    const header = document.createElement('div');
    header.className = 'context-selector-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'context-selector-back';
    backBtn.innerHTML = '←';
    backBtn.title = '返回';
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._level = 'menu';
      this._render();
    });
    header.appendChild(backBtn);

    const title = document.createElement('span');
    title.textContent = '技能';
    header.appendChild(title);
    this._panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'context-selector-body';

    if (this._skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'context-selector-empty';
      empty.innerHTML = '暂无技能<br><span style="font-size:11px;opacity:0.6;">前往左侧活动栏创建</span>';
      body.appendChild(empty);
    } else {
      const projectSkills = this._skills.filter(s => s.source === 'project');
      const userSkills = this._skills.filter(s => s.source === 'user');

      if (projectSkills.length > 0) {
        this._appendSkillGroup(body, '项目技能', projectSkills);
      }
      if (userSkills.length > 0) {
        this._appendSkillGroup(body, '用户技能', userSkills);
      }
    }

    this._panel.appendChild(body);
  }

  _appendSkillGroup(container, label, skills) {
    const group = document.createElement('div');
    group.className = 'context-selector-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'context-selector-group-label';
    groupLabel.textContent = label;
    group.appendChild(groupLabel);

    for (const skill of skills) {
      const item = document.createElement('div');
      item.className = 'context-selector-item';
      if (this._selectedSkillPaths.has(skill.filePath)) {
        item.classList.add('selected');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this._selectedSkillPaths.has(skill.filePath);

      const applySkillToggle = () => {
        const selected = checkbox.checked;
        if (selected) {
          this._selectedSkillPaths.add(skill.filePath);
          item.classList.add('selected');
        } else {
          this._selectedSkillPaths.delete(skill.filePath);
          item.classList.remove('selected');
        }
        this._updateButtonLabel();
        this._onSkillToggle?.(skill, selected);
      };
      checkbox.addEventListener('change', applySkillToggle);
      item.addEventListener('click', (e) => {
        if (e.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        applySkillToggle();
      });

      const info = document.createElement('div');
      info.className = 'context-selector-item-info';

      const name = document.createElement('div');
      name.className = 'context-selector-item-name';
      name.textContent = skill.name || skill.fileName?.replace(/\.md$/, '');
      info.appendChild(name);

      if (skill.description) {
        const desc = document.createElement('div');
        desc.className = 'context-selector-item-desc';
        desc.textContent = skill.description;
        info.appendChild(desc);
      }

      item.appendChild(checkbox);
      item.appendChild(info);
      group.appendChild(item);
    }

    container.appendChild(group);
  }

  // ==================== 数据加载 ====================

  async _loadData() {
    try {
      const [rulesData, skillsData] = await Promise.all([
        apiGet('/api/rules/list'),
        apiGet('/api/skills/list')
      ]);

      // 加载规则
      this._rules = [];
      if (rulesData.projectRules) {
        for (const r of rulesData.projectRules) {
          this._rules.push({ ...r, source: 'project' });
        }
      }
      if (rulesData.userRules) {
        for (const r of rulesData.userRules) {
          this._rules.push({ ...r, source: 'user' });
        }
      }

      // 加载技能
      this._skills = [];
      if (skillsData.projectSkills) {
        for (const s of skillsData.projectSkills) {
          this._skills.push({ ...s, source: 'project' });
        }
      }
      if (skillsData.userSkills) {
        for (const s of skillsData.userSkills) {
          this._skills.push({ ...s, source: 'user' });
        }
      }
    } catch (e) {
      console.warn('加载上下文数据失败:', e);
    }
  }
}
