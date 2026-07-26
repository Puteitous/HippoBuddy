/**
 * SkillMarket — 技能市场（嵌入主窗口）
 *
 * 替换聊天面板位置，与设置面板同款布局。
 * 浏览/搜索/安装社区技能，安装后自动刷新 SettingsPanel 技能列表。
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
    descKey: 'skillMarket.source.anthropic',
    url: 'https://github.com/anthropics/skills',
    tag: '官方',
  },
  {
    id: 'aas',
    name: 'antigravity-awesome-skills',
    stars: '41k+',
    desc: '社区最大技能集合，1595+ 技能，覆盖全栈/安全/DevOps/数据科学',
    descKey: 'skillMarket.source.aas',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    tag: '社区',
  },
  {
    id: 'vercel',
    name: 'vercel-labs/agent-skills',
    stars: '—',
    desc: 'Vercel 团队工程最佳实践，Next.js/React 专项技能',
    descKey: 'skillMarket.source.vercel',
    url: 'https://github.com/vercel-labs/agent-skills',
    tag: '大厂',
  },
  {
    id: 'addyosmani',
    name: 'addyosmani/agent-skills',
    stars: '—',
    desc: '生产级工程实践：TDD、代码审查、调试、性能优化',
    descKey: 'skillMarket.source.addyosmani',
    url: 'https://github.com/addyosmani/agent-skills',
    tag: '精选',
  },
];

/** 精选技能（可直接安装） */
const FEATURED_SKILLS = [
  {
    name: 'code-review',
    desc: '代码审查 — 五轴审查：正确性/可读性/架构/安全/性能',
    descKey: 'skillMarket.skill.codeReview',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/code-review.md',
  },
  {
    name: 'tdd-workflow',
    desc: 'TDD 工作流 — Red → Green → Refactor 全流程引导',
    descKey: 'skillMarket.skill.tddWorkflow',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/tdd-workflow.md',
  },
  {
    name: 'debugging',
    desc: '调试与错误恢复 — 六阶段诊断：构建反馈循环到复盘',
    descKey: 'skillMarket.skill.debugging',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/debugging.md',
  },
  {
    name: 'security-audit',
    desc: '安全审计与加固 — OWASP Top 10 检查、漏洞扫描、威胁建模',
    descKey: 'skillMarket.skill.securityAudit',
    source: 'addyosmani/agent-skills',
    category: '安全',
    skillUrl: '/skills/featured/security-audit.md',
  },
  {
    name: 'api-design',
    desc: 'API 设计 — RESTful 规范、请求验证、错误处理、文档生成',
    descKey: 'skillMarket.skill.apiDesign',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/api-design.md',
  },
  {
    name: 'performance',
    desc: '性能优化 — 加载性能、渲染优化、数据库查询优化',
    descKey: 'skillMarket.skill.performance',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/performance.md',
  },
  {
    name: 'devops',
    desc: 'DevOps 实践 — CI/CD 配置、Docker/K8s、监控告警',
    descKey: 'skillMarket.skill.devops',
    source: 'addyosmani/agent-skills',
    category: 'DevOps',
    skillUrl: '/skills/featured/devops.md',
  },
  {
    name: 'react-patterns',
    desc: 'React 模式 — Hooks 规范、状态管理、性能优化、组件设计',
    descKey: 'skillMarket.skill.reactPatterns',
    source: 'vercel-labs/agent-skills',
    category: '前端',
    skillUrl: '/skills/featured/react-patterns.md',
  },
  {
    name: 'database-design',
    desc: '数据库设计 — 表结构设计、索引优化、迁移策略、ORM 使用',
    descKey: 'skillMarket.skill.databaseDesign',
    source: 'antigravity-awesome-skills',
    category: '数据',
    skillUrl: '/skills/featured/database-design.md',
  },
  {
    name: 'incremental-implementation',
    desc: '增量实施 — 薄垂直切片实现，每步可测试可提交，避免大段一次性编码',
    descKey: 'skillMarket.skill.incrementalImplementation',
    source: 'addyosmani/agent-skills',
    category: '开发',
    skillUrl: '/skills/featured/incremental-implementation.md',
  },
];

const CATEGORIES = [
  { label: '全部',    key: 'all' },
  { label: '开发',    key: 'dev' },
  { label: '前端',    key: 'frontend' },
  { label: '安全',    key: 'security' },
  { label: 'DevOps',  key: 'devops' },
  { label: '数据',    key: 'data' },
];

export class SkillMarket {
  constructor() {
    this._container = null;
    this._installedNames = new Set();
    this._installedSkills = []; // 完整的已安装技能列表（含非市场技能）
    this._activeCategory = CATEGORIES[0].label;
    this._searchQuery = '';
    this._activeSource = null; // 浏览某来源仓库的技能列表
    this._showInstalled = false; // 是否显示已安装列表
    this._savedCategory = CATEGORIES[0].label; // 进入已安装模式前保存的活跃分类

    this._mainContainer = document.querySelector('.main-container');
    this._chatPanel = document.querySelector('.chat-panel');
    this._previewWasHidden = true;
  }

  async open() {
    if (!this._container) this._init();
    // 隐藏聊天面板
    if (this._chatPanel) this._chatPanel.style.display = 'none';
    // 隐藏预览面板，记录原始状态
    const preview = document.querySelector('.preview-panel');
    this._previewWasHidden = !preview || preview.classList.contains('hidden');
    if (preview) preview.classList.add('hidden');
    await this._loadInstalledSkills();
    this._render();
    this._container.style.display = 'flex';
  }

  close() {
    if (this._container) {
      this._container.style.display = 'none';
    }
    if (this._chatPanel) {
      this._chatPanel.style.display = '';
    }
    // 恢复预览面板原始状态
    if (!this._previewWasHidden) {
      const preview = document.querySelector('.preview-panel');
      if (preview) preview.classList.remove('hidden');
    }
  }

  isOpen() {
    return this._container && this._container.style.display !== 'none';
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  // ==================== 内部 ====================

  _init() {
    this._container = document.createElement('div');
    this._container.className = 'skill-market-container';
    this._container.style.display = 'none';
    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._container && this._container.style.display === 'flex') {
        this.close();
      }
    });
    if (this._mainContainer) {
      this._mainContainer.appendChild(this._container);
    }
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
    const container = this._container;
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'skill-market-header';
    header.innerHTML = `
      <h2 class="skill-market-title">${i18n.t('skillMarket.title')}</h2>
      <span class="skill-market-subtitle">${i18n.t('skillMarket.subtitle')}</span>
      <button class="skill-market-close" title="${i18n.t('skillMarket.previewClose')}">✕</button>
    `;
    header.querySelector('.skill-market-close').addEventListener('click', () => this.close());
    container.appendChild(header);

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
      if (this._activeCategory === CATEGORIES[0].label) {
        content.appendChild(this._renderSources());
      }
      content.appendChild(this._renderFeatured());
    }

    body.appendChild(content);
    container.appendChild(body);
  }

  _createSearchBar() {
    const bar = document.createElement('div');
    bar.className = 'skill-market-search';
    bar.innerHTML = `
      <svg class="skill-market-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="skill-market-search-input" type="text" placeholder="${i18n.t('skillMarket.searchPlaceholder')}" value="${this._escapeHtml(this._searchQuery)}">
      <button class="skill-market-search-clear" style="${this._searchQuery ? '' : 'display:none;'}" title="${i18n.t('skillMarket.clearSearch')}">✕</button>
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
    installedBtn.textContent = i18n.t('skillMarket.installed');
    installedBtn.addEventListener('click', () => {
      this._showInstalled = !this._showInstalled;
      if (this._showInstalled) {
        // 进入已安装模式，保存当前分类
        this._savedCategory = this._activeCategory;
        this._activeSource = null;
        this._loadInstalledSkills().then(() => this._renderContent());
      } else {
        // 退出已安装模式，恢复之前选中的分类
        this._activeCategory = this._savedCategory || CATEGORIES[0].label;
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
          if (b.dataset.catLabel === this._activeCategory) {
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
      const catLabel = i18n.t('skillMarket.' + cat.key);
      const btn = document.createElement('button');
      btn.className = 'skill-market-cat-btn skill-market-cat-filter' + (cat.label === this._activeCategory && !this._showInstalled ? ' active' : '');
      btn.textContent = catLabel;
      btn.dataset.catLabel = cat.label;
      btn.addEventListener('click', () => {
        this._activeCategory = cat.label;
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
    const content = this._container.querySelector('.skill-market-content');
    if (!content) return;
    content.innerHTML = '';

    if (this._showInstalled) {
      content.appendChild(this._renderInstalledSkills());
    } else if (this._activeSource) {
      content.appendChild(this._renderSourceDetail());
    } else {
      // 仅在「全部」分类时显示推荐来源
      if (this._activeCategory === CATEGORIES[0].label) {
        content.appendChild(this._renderSources());
      }
      content.appendChild(this._renderFeatured());
    }
  }

  // ==================== 来源仓库 ====================

  _renderSources() {
    const section = document.createElement('div');
    section.className = 'skill-market-section';
    section.innerHTML = `<h3 class="skill-market-section-title">${i18n.t('skillMarket.sources')}</h3>`;

    const grid = document.createElement('div');
    grid.className = 'skill-market-sources';

    for (const src of SOURCES) {
      const card = document.createElement('div');
      card.className = 'skill-market-source-card';

      card.innerHTML = `
        <div class="skill-market-source-info">
          <div class="skill-market-source-name">${this._escapeHtml(src.name)}</div>
          <a class="skill-market-source-github" href="${src.url}" target="_blank" title="${i18n.t('skillMarket.viewOnGithub')}">↗</a>
        </div>
        <div class="skill-market-source-desc">${this._escapeHtml(this._localizedDesc(src))}</div>
      `;

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
      <button class="skill-market-btn skill-market-btn-ghost">${i18n.t('skillMarket.backToList')}</button>
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
      const matchCat = this._activeCategory === CATEGORIES[0].label ||
        s.category === this._activeCategory;
      return matchSource && matchQuery && matchCat;
    });

    if (skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-market-empty';
      empty.textContent = i18n.t('skillMarket.noMatchSource');
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
    section.innerHTML = `<h3 class="skill-market-section-title">${i18n.t('skillMarket.featured')}</h3>`;

    const skills = this._filteredSkills();
    if (skills.length === 0) {
      section.innerHTML += `<div class="skill-market-empty">${i18n.t('skillMarket.noMatch')}</div>`;
      return section;
    }

    section.appendChild(this._renderSkillGrid(skills));
    return section;
  }

  _renderSkillGrid(skills) {
    const grid = document.createElement('div');
    grid.className = 'skill-market-grid';

    const ICON_PLUS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 7 12 13 4"/></svg>';

    for (const skill of skills) {
      const card = document.createElement('div');
      card.className = 'skill-market-skill-card';
      card.tabIndex = 0;

      const isInstalled = this._isInstalled(skill.name);

      card.innerHTML = `
        <div class="skill-market-skill-row">
          <div class="skill-market-skill-text">
            <div class="skill-market-skill-name">${this._escapeHtml(skill.name)}</div>
            <div class="skill-market-skill-desc">${this._escapeHtml(this._localizedDesc(skill))}</div>
          </div>
          <button class="skill-market-plus-btn${isInstalled ? ' installed' : ''}"
            data-skill-name="${skill.name}"
            title="${isInstalled ? i18n.t('skillMarket.installedHint') : i18n.t('skillMarket.install')}">
            ${isInstalled ? ICON_CHECK : ICON_PLUS}
          </button>
        </div>
      `;

      // 点击卡片 → 预览
      card.addEventListener('click', (e) => {
        if (e.target.closest('.skill-market-plus-btn')) return;
        this._previewSkill(skill);
      });

      // 点击加号 → 安装 / 卸载
      const plusBtn = card.querySelector('.skill-market-plus-btn');
      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isInstalled) {
          const installed = this._findInstalledSkill(skill.name);
          if (installed) {
            this._uninstallSkill({ name: skill.name, filePath: installed.filePath, skill });
          }
        } else {
          this._installSkill(skill);
        }
      });

      grid.appendChild(card);
    }

    return grid;
  }

  _findInstalledSkill(name) {
    const key = name.toLowerCase().replace(/\s+/g, '-');
    return this._installedSkills.find(s => {
      const n = s.name || (s.fileName && s.fileName.replace(/\.md$/, ''));
      return n && n.toLowerCase().replace(/\s+/g, '-') === key;
    });
  }

  _filteredSkills() {
    return FEATURED_SKILLS.filter(s => {
      const matchQuery = !this._searchQuery ||
        s.name.toLowerCase().includes(this._searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(this._searchQuery.toLowerCase());
      const matchCat = this._activeCategory === CATEGORIES[0].label ||
        s.category === this._activeCategory;
      return matchQuery && matchCat;
    });
  }

  _isInstalled(name) {
    const key = name.toLowerCase().replace(/\s+/g, '-');
    return this._installedNames.has(key);
  }

  /** 获取本地化描述，有 descKey 优先走 i18n，否则 fallback 到原始 desc */
  _localizedDesc(item) {
    if (item.descKey) {
      const translated = i18n.t(item.descKey);
      if (translated !== item.descKey) return translated;
    }
    return item.desc;
  }

  // ==================== 已安装技能列表 ====================

  _renderInstalledSkills() {
    const container = document.createElement('div');

    if (this._installedSkills.length === 0) {
      container.innerHTML = `<div class="skill-market-empty">${i18n.t('skillMarket.noSkills')}<br><span style="font-size:11px;opacity:0.6;">${i18n.t('skillMarket.goInstall')}</span></div>`;
      return container;
    }

    // 统计：已安装中哪些来自精选市场
    const marketInstalled = FEATURED_SKILLS.filter(s => this._isInstalled(s.name));

    container.innerHTML = `
      <div class="skill-market-installed-summary">
        ${i18n.t('skillMarket.installedCount', { count: this._installedSkills.length })}
        ${marketInstalled.length > 0 ? i18n.t('skillMarket.fromMarket', { count: marketInstalled.length }) : ''}
      </div>
    `;

    // 分组显示：项目级 / 用户级
    const projectSkills = this._installedSkills.filter(s => s.source === 'project');
    const userSkills = this._installedSkills.filter(s => s.source === 'user');

    if (projectSkills.length > 0) {
      container.appendChild(this._renderInstalledGroup(i18n.t('skillMarket.projectSkills'), projectSkills));
    }
    if (userSkills.length > 0) {
      container.appendChild(this._renderInstalledGroup(i18n.t('skillMarket.globalSkills'), userSkills));
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
          <div class="skill-market-installed-item-name">${this._escapeHtml(name)}</div>
          <div class="skill-market-installed-item-meta">
            ${skill.description ? this._escapeHtml(skill.description) : ''}
          </div>
        </div>
        <button class="skill-market-btn skill-market-btn-ghost skill-market-btn-uninstall" title="${i18n.t('skillMarket.uninstall')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      // 点击卡片 → 预览
      item.addEventListener('click', (e) => {
        if (e.target.closest('.skill-market-btn-uninstall')) return;
        this._previewSkill({
          name,
          skillUrl: `/api/file/raw?path=${encodeURIComponent(skill.filePath)}`,
        });
      });

      // 点击卸载按钮
      item.querySelector('.skill-market-btn-uninstall').addEventListener('click', (e) => {
        e.stopPropagation();
        this._uninstallSkill({ name, filePath: skill.filePath });
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
    const confirmed = await ConfirmDialog.confirm(i18n.t('skillMarket.uninstallConfirm', { name: skill.name }));
    if (!confirmed) return;

    try {
      const result = await apiPost('/api/skills/delete', { filePath: skill.filePath });
      if (result.success) {
        showToast(i18n.t('skillMarket.uninstallSuccess', { name: skill.name }), { type: 'success', duration: 2000 });
        // 刷新列表
        await this._loadInstalledSkills();
        this._renderContent();
        // 通知 SettingsPanel 刷新
        if (window.settingsPanel && typeof window.settingsPanel.reloadSkills === 'function') {
          window.settingsPanel.reloadSkills();
        }
      } else {
        showToast(i18n.t('skillMarket.uninstallFailed') + (result.message || i18n.t('chatui.unknownError')), { type: 'error', duration: 3000 });
      }
    } catch (e) {
      console.warn('卸载技能失败:', e);
      showToast(i18n.t('skillMarket.uninstallRetry'), { type: 'error', duration: 3000 });
    }
  }

  // ==================== 安装 / 预览 ====================

  async _installSkill(skill) {
    const confirmed = await ConfirmDialog.confirm(
      i18n.t('skillMarket.confirmInstall', { name: skill.name, source: skill.source })
    );
    if (!confirmed) return;

    const btn = this._container?.querySelector(`[data-skill-name="${skill.name}"]`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span style="opacity:0.5">...</span>';
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
        showToast(i18n.t('skillMarket.installSuccess', { name: skill.name }), { type: 'success', duration: 2000 });
        // 刷新列表
        this._loadInstalledSkills();
        this._renderContent();
        // 通知 SettingsPanel 刷新
        if (window.settingsPanel && typeof window.settingsPanel.reloadSkills === 'function') {
          window.settingsPanel.reloadSkills();
        }
      } else {
        showToast(i18n.t('skillMarket.installFailed') + (result.message || i18n.t('chatui.unknownError')), { type: 'error', duration: 3000 });
        if (btn) {
          btn.disabled = false;
          const ICON_PLUS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
          btn.innerHTML = ICON_PLUS;
        }
      }
    } catch (e) {
      console.warn('安装技能失败:', e);
      showToast(i18n.t('skillMarket.installNetworkError'), { type: 'error', duration: 3000 });
      if (btn) {
        btn.disabled = false;
        btn.textContent = i18n.t('skillMarket.install');
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
          <button class="skill-market-preview-close" title="${i18n.t('skillMarket.previewClose')}">✕</button>
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
                body.innerHTML = `<div class="skill-market-preview-error">${i18n.t('skillMarket.loadFailed')}</div>`;
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
