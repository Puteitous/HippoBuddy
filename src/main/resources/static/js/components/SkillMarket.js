/**
 * SkillMarket — 技能市场覆盖层
 *
 * 独立覆盖层，不替换聊天面板，浏览/搜索/安装社区技能。
 * 安装后自动刷新 SettingsPanel 技能列表。
 */
import { apiPost } from '../utils.js';
import { showToast } from '../utils/toast.js';
import { ConfirmDialog } from '../utils/modal.js';

/* ===================================================================
 * 精选技能数据
 * 来源：社区知名仓库中的高质量技能，内置避免 GitHub API 网络依赖
 * skillUrl 指向 GitHub raw 文件，用于下载安装
 * =================================================================== */

/** 推荐来源仓库 */
const SOURCES = [
  {
    id: 'anthropic',
    name: 'anthropics/skills',
    stars: '60.9k',
    desc: 'Anthropic 官方技能仓库，Claude 技能生态标准，质量最稳定',
    url: 'https://github.com/anthropics/skills',
    tag: '官方',
  },
  {
    id: 'aas',
    name: 'antigravity-awesome-skills',
    stars: '41k+',
    desc: '社区最大技能集合，1595+ 技能，覆盖全栈/安全/DevOps/数据科学',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    tag: '社区',
  },
  {
    id: 'vercel',
    name: 'vercel-labs/agent-skills',
    stars: '—',
    desc: 'Vercel 团队工程最佳实践，Next.js/React 专项技能',
    url: 'https://github.com/vercel-labs/agent-skills',
    tag: '大厂',
  },
  {
    id: 'addyosmani',
    name: 'addyosmani/agent-skills',
    stars: '—',
    desc: '生产级工程实践：TDD、代码审查、调试、性能优化',
    url: 'https://github.com/addyosmani/agent-skills',
    tag: '精选',
  },
];

/** 精选技能（可直接安装） */
const FEATURED_SKILLS = [
  {
    name: 'code-review',
    desc: '代码审查 — 五轴审查：正确性/可读性/架构/安全/性能',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/code-review-and-quality/SKILL.md',
  },
  {
    name: 'tdd-workflow',
    desc: 'TDD 工作流 — Red → Green → Refactor 全流程引导',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/test-driven-development/SKILL.md',
  },
  {
    name: 'debugging',
    desc: '调试与错误恢复 — 六阶段诊断：构建反馈循环到复盘',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/debugging-and-error-recovery/SKILL.md',
  },
  {
    name: 'security-audit',
    desc: '安全审计与加固 — OWASP Top 10 检查、漏洞扫描、威胁建模',
    source: 'addyosmani/agent-skills',
    category: '安全',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/security-and-hardening/SKILL.md',
  },
  {
    name: 'api-design',
    desc: 'API 设计 — RESTful 规范、请求验证、错误处理、文档生成',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/api-and-interface-design/SKILL.md',
  },
  {
    name: 'performance',
    desc: '性能优化 — 加载性能、渲染优化、数据库查询优化',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/performance-optimization/SKILL.md',
  },
  {
    name: 'devops',
    desc: 'DevOps 实践 — CI/CD 配置、Docker/K8s、监控告警',
    source: 'addyosmani/agent-skills',
    category: 'DevOps',
    skillUrl: 'https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/ci-cd-and-automation/SKILL.md',
  },
  {
    name: 'react-patterns',
    desc: 'React 模式 — Hooks 规范、状态管理、性能优化、组件设计',
    source: 'vercel-labs/agent-skills',
    category: '前端',
    skillUrl: 'https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md',
  },
  {
    name: 'database-design',
    desc: '数据库设计 — 表结构设计、索引优化、迁移策略、ORM 使用',
    source: 'antigravity-awesome-skills',
    category: '数据',
    skillUrl: 'https://raw.githubusercontent.com/sickn33/antigravity-awesome-skills/main/skills/database-design/SKILL.md',
  },
];

const CATEGORIES = ['全部', '开发', '前端', '安全', 'DevOps', '数据'];

export class SkillMarket {
  constructor() {
    this._overlay = null;
    this._installedNames = new Set();
    this._installedSkills = []; // 完整的已安装技能列表（含非市场技能）
    this._activeCategory = '全部';
    this._searchQuery = '';
    this._activeSource = null; // 浏览某来源仓库的技能列表
    this._showInstalled = false; // 是否显示已安装列表
    this._savedCategory = '全部'; // 进入已安装模式前保存的活跃分类
  }

  async open() {
    if (!this._overlay) this._init();
    await this._loadInstalledSkills();
    this._render();
    this._overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (this._overlay) {
      this._overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  // ==================== 内部 ====================

  _init() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'skill-market-overlay';
    this._overlay.style.display = 'none';
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });
    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._overlay && this._overlay.style.display === 'flex') {
        this.close();
      }
    });
    document.body.appendChild(this._overlay);
  }

  async _loadInstalledSkills() {
    try {
      const resp = await fetch('/api/skills/list');
      const data = await resp.json();
      const all = [];
      for (const s of (data.projectSkills || [])) {
        all.push({ ...s, source: 'project' });
      }
      for (const s of (data.userSkills || [])) {
        all.push({ ...s, source: 'user' });
      }
      this._installedSkills = all;
      this._installedNames = new Set(all.map(s => {
        const n = s.name || s.fileName.replace(/\.md$/, '');
        return n.toLowerCase().replace(/\s+/g, '-');
      }));
    } catch {
      this._installedNames = new Set();
      this._installedSkills = [];
    }
  }

  _render() {
    const overlay = this._overlay;
    overlay.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'skill-market-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'skill-market-header';
    header.innerHTML = `
      <h2 class="skill-market-title">技能市场</h2>
      <span class="skill-market-subtitle">浏览社区技能，一键安装到本地</span>
      <button class="skill-market-close" title="关闭">✕</button>
    `;
    header.querySelector('.skill-market-close').addEventListener('click', () => this.close());
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'skill-market-body';

    // Search bar
    const searchBar = this._createSearchBar();
    body.appendChild(searchBar);

    // Category tabs
    const catTabs = this._createCategoryTabs();
    body.appendChild(catTabs);

    // Content area
    const content = document.createElement('div');
    content.className = 'skill-market-content';

    if (this._activeSource) {
      // 浏览某个来源仓库的全部技能
      content.appendChild(this._renderSourceDetail());
    } else {
      // 仅在「全部」分类时显示推荐来源
      if (this._activeCategory === '全部') {
        content.appendChild(this._renderSources());
      }
      content.appendChild(this._renderFeatured());
    }

    body.appendChild(content);
    panel.appendChild(body);
    overlay.appendChild(panel);
  }

  _createSearchBar() {
    const bar = document.createElement('div');
    bar.className = 'skill-market-search';
    bar.innerHTML = `
      <svg class="skill-market-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="skill-market-search-input" type="text" placeholder="搜索技能名称或描述..." value="${this._escapeHtml(this._searchQuery)}">
      <button class="skill-market-search-clear" style="${this._searchQuery ? '' : 'display:none;'}" title="清除">✕</button>
    `;
    const input = bar.querySelector('.skill-market-search-input');
    const clear = bar.querySelector('.skill-market-search-clear');

    input.addEventListener('input', () => {
      this._searchQuery = input.value;
      clear.style.display = this._searchQuery ? '' : 'none';
      this._renderContent();
    });

    clear.addEventListener('click', () => {
      input.value = '';
      this._searchQuery = '';
      clear.style.display = 'none';
      this._renderContent();
    });

    return bar;
  }

  _createCategoryTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'skill-market-cats';

    // 已安装按钮（特殊，置于最前）
    const installedBtn = document.createElement('button');
    installedBtn.className = 'skill-market-cat-btn skill-market-installed-btn' + (this._showInstalled ? ' active' : '');
    installedBtn.textContent = '📦 已安装';
    installedBtn.addEventListener('click', () => {
      this._showInstalled = !this._showInstalled;
      if (this._showInstalled) {
        // 进入已安装模式，保存当前分类
        this._savedCategory = this._activeCategory;
        this._activeSource = null;
        this._loadInstalledSkills().then(() => this._renderContent());
      } else {
        // 退出已安装模式，恢复之前选中的分类
        this._activeCategory = this._savedCategory || '全部';
      }
      tabs.querySelectorAll('.skill-market-cat-btn').forEach(b => b.classList.remove('active'));
      if (this._showInstalled) {
        installedBtn.classList.add('active');
      }
      if (!this._showInstalled) {
        // 亮起之前选中的分类按钮
        const catBtns = tabs.querySelectorAll('.skill-market-cat-filter');
        let found = false;
        catBtns.forEach(b => {
          if (b.textContent.trim() === this._activeCategory) {
            b.classList.add('active');
            found = true;
          }
        });
        if (!found) {
          const allBtn = tabs.querySelector('.skill-market-cat-filter');
          if (allBtn) allBtn.classList.add('active');
        }
      }
      this._renderContent();
    });
    tabs.appendChild(installedBtn);

    // 分隔线
    const divider = document.createElement('span');
    divider.className = 'skill-market-cats-divider';
    tabs.appendChild(divider);

    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'skill-market-cat-btn skill-market-cat-filter' + (cat === this._activeCategory && !this._showInstalled ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        this._activeCategory = cat;
        // 点击分类时自动退出已安装模式，切换到该分类的精选浏览
        if (this._showInstalled) {
          this._showInstalled = false;
          this._activeSource = null;
        }
        tabs.querySelectorAll('.skill-market-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderContent();
      });
      tabs.appendChild(btn);
    }
    return tabs;
  }

  /** 只刷新 content 区域，不重建整个面板 */
  _renderContent() {
    const content = this._overlay.querySelector('.skill-market-content');
    if (!content) return;
    content.innerHTML = '';

    if (this._showInstalled) {
      content.appendChild(this._renderInstalledSkills());
    } else if (this._activeSource) {
      content.appendChild(this._renderSourceDetail());
    } else {
      // 仅在「全部」分类时显示推荐来源
      if (this._activeCategory === '全部') {
        content.appendChild(this._renderSources());
      }
      content.appendChild(this._renderFeatured());
    }
  }

  // ==================== 来源仓库 ====================

  _renderSources() {
    const section = document.createElement('div');
    section.className = 'skill-market-section';
    section.innerHTML = '<h3 class="skill-market-section-title">推荐来源</h3>';

    const grid = document.createElement('div');
    grid.className = 'skill-market-sources';

    for (const src of SOURCES) {
      const card = document.createElement('div');
      card.className = 'skill-market-source-card';

      const tagEl = document.createElement('span');
      tagEl.className = 'skill-market-source-tag';
      tagEl.textContent = src.tag;

      card.innerHTML = `
        <div class="skill-market-source-info">
          <div class="skill-market-source-name">${this._escapeHtml(src.name)}</div>
          <div class="skill-market-source-stars">⭐ ${src.stars}</div>
        </div>
        <div class="skill-market-source-desc">${this._escapeHtml(src.desc)}</div>
      `;
      card.prepend(tagEl);

      const actions = document.createElement('div');
      actions.className = 'skill-market-source-actions';

      const browseBtn = document.createElement('button');
      browseBtn.className = 'skill-market-btn skill-market-btn-secondary';
      browseBtn.textContent = '浏览';
      browseBtn.addEventListener('click', () => {
        this._activeSource = src;
        this._renderContent();
      });
      actions.appendChild(browseBtn);

      const linkBtn = document.createElement('button');
      linkBtn.className = 'skill-market-btn skill-market-btn-ghost';
      linkBtn.textContent = 'GitHub ↗';
      linkBtn.addEventListener('click', () => window.open(src.url, '_blank'));
      actions.appendChild(linkBtn);

      card.appendChild(actions);
      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  _renderSourceDetail() {
    const src = this._activeSource;
    const container = document.createElement('div');

    // Back button
    const back = document.createElement('div');
    back.className = 'skill-market-source-back';
    back.innerHTML = `
      <button class="skill-market-btn skill-market-btn-ghost">← 返回推荐列表</button>
      <span class="skill-market-source-detail-title">${this._escapeHtml(src.name)}</span>
    `;
    back.querySelector('button').addEventListener('click', () => {
      this._activeSource = null;
      this._renderContent();
    });
    container.appendChild(back);

    // Filter skills by this source
    const skills = FEATURED_SKILLS.filter(s => {
      const matchSource = s.source.toLowerCase().includes(src.id);
      const matchQuery = !this._searchQuery ||
        s.name.toLowerCase().includes(this._searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(this._searchQuery.toLowerCase());
      const matchCat = this._activeCategory === '全部' ||
        s.category === this._activeCategory;
      return matchSource && matchQuery && matchCat;
    });

    if (skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-market-empty';
      empty.textContent = '该来源暂无匹配的技能';
      container.appendChild(empty);
    } else {
      container.appendChild(this._renderSkillGrid(skills));
    }

    return container;
  }

  // ==================== 精选技能 ====================

  _renderFeatured() {
    const section = document.createElement('div');
    section.className = 'skill-market-section';
    section.innerHTML = '<h3 class="skill-market-section-title">精选技能</h3>';

    const skills = this._filteredSkills();
    if (skills.length === 0) {
      section.innerHTML += '<div class="skill-market-empty">没有匹配的技能</div>';
      return section;
    }

    section.appendChild(this._renderSkillGrid(skills));
    return section;
  }

  _renderSkillGrid(skills) {
    const grid = document.createElement('div');
    grid.className = 'skill-market-grid';

    for (const skill of skills) {
      const card = document.createElement('div');
      card.className = 'skill-market-skill-card';

      const isInstalled = this._isInstalled(skill.name);

      card.innerHTML = `
        <div class="skill-market-skill-header">
          <span class="skill-market-skill-icon">📄</span>
          <div class="skill-market-skill-info">
            <div class="skill-market-skill-name">${this._escapeHtml(skill.name)}</div>
            <div class="skill-market-skill-source">${this._escapeHtml(skill.source)}</div>
          </div>
          <span class="skill-market-skill-cat">${skill.category}</span>
        </div>
        <div class="skill-market-skill-desc">${this._escapeHtml(skill.desc)}</div>
        <div class="skill-market-skill-actions">
          <button class="skill-market-btn ${isInstalled ? 'skill-market-btn-installed' : 'skill-market-btn-primary'}"
            ${isInstalled ? 'disabled' : ''}
            data-skill-name="${skill.name}">
            ${isInstalled ? '✓ 已安装' : '安装'}
          </button>
          <button class="skill-market-btn skill-market-btn-ghost skill-market-preview-btn" data-skill-name="${skill.name}">预览</button>
        </div>
      `;

      const installBtn = card.querySelector('.skill-market-btn-primary, .skill-market-btn-installed');
      installBtn.addEventListener('click', () => {
        if (!isInstalled) this._installSkill(skill);
      });

      const previewBtn = card.querySelector('.skill-market-preview-btn');
      previewBtn.addEventListener('click', () => this._previewSkill(skill));

      grid.appendChild(card);
    }

    return grid;
  }

  _filteredSkills() {
    return FEATURED_SKILLS.filter(s => {
      const matchQuery = !this._searchQuery ||
        s.name.toLowerCase().includes(this._searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(this._searchQuery.toLowerCase());
      const matchCat = this._activeCategory === '全部' ||
        s.category === this._activeCategory;
      return matchQuery && matchCat;
    });
  }

  _isInstalled(name) {
    const key = name.toLowerCase().replace(/\s+/g, '-');
    return this._installedNames.has(key);
  }

  // ==================== 已安装技能列表 ====================

  _renderInstalledSkills() {
    const container = document.createElement('div');

    if (this._installedSkills.length === 0) {
      container.innerHTML = '<div class="skill-market-empty">暂无已安装的技能<br><span style="font-size:11px;opacity:0.6;">去「推荐」或「精选技能」中安装吧</span></div>';
      return container;
    }

    // 统计：已安装中哪些来自精选市场
    const marketInstalled = FEATURED_SKILLS.filter(s => this._isInstalled(s.name));

    container.innerHTML = `
      <div class="skill-market-installed-summary">
        已安装 <strong>${this._installedSkills.length}</strong> 个技能
        ${marketInstalled.length > 0 ? `（其中 <strong>${marketInstalled.length}</strong> 个来自精选市场）` : ''}
      </div>
    `;

    // 分组显示：项目级 / 用户级
    const projectSkills = this._installedSkills.filter(s => s.source === 'project');
    const userSkills = this._installedSkills.filter(s => s.source === 'user');

    if (projectSkills.length > 0) {
      container.appendChild(this._renderInstalledGroup('项目技能', projectSkills));
    }
    if (userSkills.length > 0) {
      container.appendChild(this._renderInstalledGroup('全局技能', userSkills));
    }

    // 如果还有来自市场但尚未安装的精选技能，显示推荐
    const notInstalled = FEATURED_SKILLS.filter(s => !this._isInstalled(s.name));
    if (notInstalled.length > 0) {
      const tip = document.createElement('div');
      tip.className = 'skill-market-installed-tip';
      tip.innerHTML = `
        <span>还有 <strong>${notInstalled.length}</strong> 个精选技能未安装</span>
        <button class="skill-market-btn skill-market-btn-secondary" id="skillMarketBrowseMore">去浏览 →</button>
      `;
      tip.querySelector('#skillMarketBrowseMore').addEventListener('click', () => {
        this._showInstalled = false;
        this._activeCategory = this._savedCategory || '全部';
        this._renderContent();
        // 同时更新 tab 状态
        const tabs = this._overlay?.querySelector('.skill-market-cats');
        if (tabs) {
          tabs.querySelectorAll('.skill-market-cat-btn').forEach(b => b.classList.remove('active'));
          const catBtns = tabs.querySelectorAll('.skill-market-cat-filter');
          let found = false;
          catBtns.forEach(b => {
            if (b.textContent.trim() === this._activeCategory) {
              b.classList.add('active');
              found = true;
            }
          });
          if (!found) {
            const allBtn = tabs.querySelector('.skill-market-cat-filter');
            if (allBtn) allBtn.classList.add('active');
          }
        }
      });
      container.appendChild(tip);
    }

    return container;
  }

  _renderInstalledGroup(label, skills) {
    const group = document.createElement('div');
    group.className = 'skill-market-installed-group';

    const header = document.createElement('div');
    header.className = 'skill-market-installed-group-header';
    header.innerHTML = `
      <span class="skill-market-installed-group-label">${label}</span>
      <span class="skill-market-installed-group-count">${skills.length}</span>
    `;
    group.appendChild(header);

    const list = document.createElement('div');
    list.className = 'skill-market-installed-list';

    for (const skill of skills) {
      const item = document.createElement('div');
      item.className = 'skill-market-installed-item';

      const name = skill.name || skill.fileName.replace(/\.md$/, '');

      // 判断是否来自市场精选
      const isMarket = this._isMarketSkill(skill);

      item.innerHTML = `
        <div class="skill-market-installed-item-info">
          <div class="skill-market-installed-item-name">📄 ${this._escapeHtml(name)}</div>
          <div class="skill-market-installed-item-meta">
            ${skill.description ? this._escapeHtml(skill.description) : ''}
            ${isMarket ? '<span class="skill-market-installed-item-badge">市场</span>' : ''}
            <span class="skill-market-installed-item-source">${skill.source === 'project' ? '项目级' : '用户级'}</span>
          </div>
        </div>
        <button class="skill-market-btn skill-market-btn-ghost skill-market-btn-uninstall"
          data-skill-name="${name}" data-file-path="${this._escapeHtml(skill.filePath)}"
          title="卸载">卸载</button>
      `;

      item.querySelector('.skill-market-btn-uninstall').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this._uninstallSkill({
          name: btn.dataset.skillName,
          filePath: btn.dataset.filePath,
        });
      });

      list.appendChild(item);
    }

    group.appendChild(list);
    return group;
  }

  /** 判断一个本地技能是否来自精选市场 */
  _isMarketSkill(skill) {
    const name = skill.name || skill.fileName?.replace(/\.md$/, '') || '';
    return FEATURED_SKILLS.some(s => s.name.toLowerCase() === name.toLowerCase().replace(/\s+/g, '-'));
  }

  async _uninstallSkill(skill) {
    const confirmed = await ConfirmDialog.confirm(`确定卸载技能「${skill.name}」？`);
    if (!confirmed) return;

    try {
      const result = await apiPost('/api/skills/delete', { filePath: skill.filePath });
      if (result.success) {
        showToast(`已卸载「${skill.name}」`, { type: 'success', duration: 2000 });
        // 刷新列表
        await this._loadInstalledSkills();
        this._renderContent();
        // 通知 SettingsPanel 刷新
        if (window.settingsPanel && typeof window.settingsPanel.reloadSkills === 'function') {
          window.settingsPanel.reloadSkills();
        }
      } else {
        showToast('卸载失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      console.warn('卸载技能失败:', e);
      showToast('卸载失败，请重试', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 安装 / 预览 ====================

  async _installSkill(skill) {
    const confirmed = await ConfirmDialog.confirm(
      `确定安装技能「${skill.name}」？\n来源：${skill.source}`
    );
    if (!confirmed) return;

    const btn = this._overlay?.querySelector(`[data-skill-name="${skill.name}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '安装中…';
    }

    try {
      // 从 GitHub 拉取 raw 内容
      const resp = await fetch(skill.skillUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const content = await resp.text();

      // 写入本地用户级技能
      const result = await apiPost('/api/skills/create', {
        name: skill.name,
        description: skill.desc,
        scope: 'user',
        content,
      });

      if (result.success) {
        this._installedNames.add(skill.name.toLowerCase().replace(/\s+/g, '-'));
        showToast(`✓ 技能「${skill.name}」已安装`, { type: 'success', duration: 2000 });
        // 刷新列表
        this._loadInstalledSkills();
        this._renderContent();
        // 通知 SettingsPanel 刷新
        if (window.settingsPanel && typeof window.settingsPanel.reloadSkills === 'function') {
          window.settingsPanel.reloadSkills();
        }
      } else {
        showToast('安装失败: ' + (result.message || '未知错误'), { type: 'error', duration: 3000 });
        if (btn) {
          btn.disabled = false;
          btn.textContent = '安装';
        }
      }
    } catch (e) {
      console.warn('安装技能失败:', e);
      showToast('安装失败，请检查网络连接', { type: 'error', duration: 3000 });
      if (btn) {
        btn.disabled = false;
        btn.textContent = '安装';
      }
    }
  }

  async _previewSkill(skill) {
    const modal = document.createElement('div');
    modal.className = 'skill-market-preview-modal';
    modal.innerHTML = `
      <div class="skill-market-preview-backdrop"></div>
      <div class="skill-market-preview-panel">
        <div class="skill-market-preview-header">
          <span class="skill-market-preview-title">${this._escapeHtml(skill.name)}</span>
          <button class="skill-market-preview-close">✕</button>
        </div>
        <div class="skill-market-preview-body">
          <div class="skill-market-preview-loading">加载中...</div>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('.skill-market-preview-close').addEventListener('click', close);
    modal.querySelector('.skill-market-preview-backdrop').addEventListener('click', close);

    document.body.appendChild(modal);

    try {
      const resp = await fetch(skill.skillUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const content = await resp.text();
      const body = modal.querySelector('.skill-market-preview-body');
      body.innerHTML = `<pre class="skill-market-preview-code">${this._escapeHtml(content)}</pre>`;
    } catch (e) {
      const body = modal.querySelector('.skill-market-preview-body');
      body.innerHTML = '<div class="skill-market-preview-error">加载失败，请检查网络连接</div>';
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
