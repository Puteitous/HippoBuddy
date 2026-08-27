import { truncateText } from './utils.js';
import { ChatService } from './chat-service.js';
import { showBottomToast } from './utils/toast.js';
import { ConfirmDialog } from './utils/modal.js';
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

/** 时间分组中文 → i18n key 映射 */
const TIME_GROUP_LABELS = {
  '今天': () => _t('session.today'),
  '昨天': () => _t('session.yesterday'),
  '7天内': () => _t('session.days7'),
  '30天内': () => _t('session.days30'),
  '更早': () => _t('session.earlier'),
};
const OTHER_PROJECT = '';

export class SessionManager {
  constructor(listContainer, onSessionSwitch) {
    this.listContainer = listContainer;
    this.onSessionSwitch = onSessionSwitch;
    this.chatService = new ChatService();
    this.sessionNames = {};
    this.currentSessionId = null;

    this.sessions = [];
    this._rows = [];
    this._renderedCount = 0;
    this._renderBatchSize = 20;
    this._observer = null;
    this._sentinel = null;
    this._collapsedProjects = new Set(JSON.parse(localStorage.getItem('hippo-collapsed-projects') || '[]'));
    this._groupMode = (localStorage.getItem('hippo-session-group-mode') === 'time') ? 'time' : 'project';
  }

  /** Toggle between project grouping and time grouping */
  toggleGroupMode() {
    this._groupMode = (this._groupMode === 'project') ? 'time' : 'project';
    localStorage.setItem('hippo-session-group-mode', this._groupMode);
    // Update toggle button text
    const btn = document.querySelector('.group-mode-toggle');
    if (btn) btn.textContent = this._groupMode === 'project' ? 'Project' : 'Time';
    // Rerender
    this._resetRenderer();
    this._rows = this._computeRows();
    this._renderNextBatch();
  }

  /** Persist collapsed project set to localStorage */
  _saveCollapsedState() {
    localStorage.setItem('hippo-collapsed-projects', JSON.stringify([...this._collapsedProjects]));
  }

  setCurrentSession(sessionId) {
    this.currentSessionId = sessionId;
  }

  getCurrentSession() {
    return this.currentSessionId;
  }

  /** Update active class on session items in-place (no DOM rebuild) */
  updateActiveSession(sessionId) {
    this.currentSessionId = sessionId;
    const items = this.listContainer.querySelectorAll('.session-item');
    let activeProjectKey = null;
    for (const item of items) {
      const sid = item.dataset.sessionId;
      const isActive = sid === sessionId;
      item.classList.toggle('active', isActive);
      if (isActive) activeProjectKey = item.dataset.projectKey || null;
    }
    // 同步项目标题高亮：仅当前活跃会话所属项目显示 has-active
    const headers = this.listContainer.querySelectorAll('.session-project-header');
    for (const h of headers) {
      h.classList.toggle('has-active', h.dataset.projectKey === activeProjectKey);
    }
  }

  /** Render a given list of sessions into the container (synchronous) */
  renderSessionList(sessions) {
    this.sessions = sessions;
    // 按 lastActivityAt 降序排列，没有则回退到 createdAt
    this.sessions.sort((a, b) => {
      const ta = parseInt(a.lastActivityAt || a.createdAt, 10) || 0;
      const tb = parseInt(b.lastActivityAt || b.createdAt, 10) || 0;
      return tb - ta;
    });
    this._ensureGroupToggle();
    this._resetRenderer();
    this._rows = this._computeRows();
    this._renderNextBatch();
  }

  /** Ensure the group mode toggle button exists in the session header */
  _ensureGroupToggle() {
    if (document.querySelector('.group-mode-toggle')) return;
    const headerLeft = document.querySelector('.session-header-left');
    if (!headerLeft) return;

    const toggle = document.createElement('span');
    toggle.className = 'group-mode-toggle';
    toggle.textContent = this._groupMode === 'project' ? 'Project' : 'Time';
    toggle.title = 'Toggle Grouping';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleGroupMode();
    });
    headerLeft.appendChild(toggle);
  }

  async loadSessions() {
    try {
      const sessions = await this.chatService.getSessions();
      this.renderSessionList(sessions);
    } catch (e) {
      console.error('加载会话列表失败:', e);
    }
  }

  /** Reset batch renderer state and clear container */
  _resetRenderer() {
    this._removeSentinel();
    this.listContainer.innerHTML = '';
    this._renderedCount = 0;
    this._rows = [];
  }

  /** Compute flat ordered rows based on current group mode */
  _computeRows() {
    return this._groupMode === 'project' ? this._computeProjectRows() : this._computeTimeRows();
  }

  /** Group sessions by project, projects sorted by latest session time */
  _computeProjectRows() {
    // 1. Group sessions by project (路径统一用 / 分隔)
    const projectMap = new Map();
    for (const s of this.sessions) {
      const projectKey = s.projectPath ? s.projectPath.replace(/\\/g, '/') : '';
      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, []);
      }
      projectMap.get(projectKey).push(s);
    }

    // 2. Build project info & sort by latest session time
    const projects = [];
    for (const [rawProjectPath, sessions] of projectMap) {
      // 统一使用归一化后的路径
      const projectPath = rawProjectPath;
      let latestTime = 0;
      for (const s of sessions) {
        const ts = parseInt(s.lastActivityAt || s.createdAt, 10);
        if (!isNaN(ts) && ts > latestTime) latestTime = ts;
      }
      const dirName = projectPath
        ? projectPath.split('/').filter(Boolean).pop() || projectPath
        : _t('session.other');
      projects.push({ projectPath, sessions, latestTime, dirName });
    }
    projects.sort((a, b) => b.latestTime - a.latestTime);
    // "其他" 放到最后
    const otherIdx = projects.findIndex(p => !p.projectPath);
    if (otherIdx > -1) {
      const other = projects.splice(otherIdx, 1)[0];
      projects.push(other);
    }

    // 3. Build rows: project-header → sessions (no time headers within)
    const rows = [];
    for (const project of projects) {
      if (project.sessions.length === 0 && project.projectPath !== '') continue;

      rows.push({
        type: 'project-header',
        projectKey: project.projectPath || '__other__',
        projectPath: project.projectPath,
        name: project.dirName,
        count: project.sessions.length,
        fullPath: project.projectPath,
        collapsed: this._collapsedProjects.has(project.projectPath || '__other__')
      });

      if (this._collapsedProjects.has(project.projectPath || '__other__')) continue;

      // Sort sessions by lastActivityAt descending within project
      const sorted = [...project.sessions].sort((a, b) => {
        const ta = parseInt(a.lastActivityAt || a.createdAt, 10) || 0;
        const tb = parseInt(b.lastActivityAt || b.createdAt, 10) || 0;
        return tb - ta;
      });

      for (const s of sorted) {
        const name = s.title || this.sessionNames[s.id] || (_t('session.namePrefix') + ' ' + s.id.replace('web-', '').slice(-6));
        if (s.title) this.sessionNames[s.id] = s.title;
        rows.push({ type: 'session', session: s, name, projectKey: project.projectPath || '__other__' });
      }
    }

    this._injectVirtualSession(rows);
    return rows;
  }

  /** Group sessions by time only (original behavior) */
  _computeTimeRows() {
    const grouped = this.groupSessionsByTime(this.sessions);
    const rows = [];

    for (const [category, categorySessions] of Object.entries(grouped)) {
      if (categorySessions.length === 0) continue;
      rows.push({ type: 'header', category });

      for (const s of categorySessions) {
        const name = s.title || this.sessionNames[s.id] || (_t('session.namePrefix') + ' ' + s.id.replace('web-', '').slice(-6));
        if (s.title) this.sessionNames[s.id] = s.title;
        rows.push({ type: 'session', session: s, name });
      }
    }

    this._injectVirtualSession(rows);
    return rows;
  }

  /** Inject virtual current session into rows if not present */
  _injectVirtualSession(rows) {
    const currentInList = this.sessions.some(s => s.id === this.currentSessionId);
    if (!currentInList && this.currentSessionId && this.sessionNames[this.currentSessionId]) {
      const isProjectMode = this._groupMode === 'project';
      const virtualSession = {
        id: this.currentSessionId,
        createdAt: String(Date.now()),
        _isVirtual: true,
        projectPath: ''
      };

      if (isProjectMode) {
        // Inject into other project
        const otherProjIdx = rows.findIndex(r => r.type === 'project-header' && !r.projectPath);
        if (otherProjIdx !== -1) {
          rows.splice(otherProjIdx + 1, 0, {
            type: 'session', session: virtualSession,
            name: this.sessionNames[this.currentSessionId], _isVirtual: true,
            projectKey: '__other__'
          });
          // Update "其他" count
          rows[otherProjIdx].count = (rows[otherProjIdx].count || 0) + 1;
        } else {
          rows.unshift(
            { type: 'project-header', projectKey: '__other__', projectPath: '', name: _t('session.other'), count: 1, fullPath: '', collapsed: false },
            { type: 'session', session: virtualSession, name: this.sessionNames[this.currentSessionId], _isVirtual: true, projectKey: '__other__' }
          );
        }
      } else {
        // Inject into "今天"
        const todayIdx = rows.findIndex(r => r.type === 'header' && r.category === '今天');
        if (todayIdx !== -1) {
          rows.splice(todayIdx + 1, 0, {
            type: 'session', session: virtualSession,
            name: this.sessionNames[this.currentSessionId], _isVirtual: true
          });
        } else {
          rows.unshift(
            { type: 'header', category: '今天' },
            { type: 'session', session: virtualSession, name: this.sessionNames[this.currentSessionId], _isVirtual: true }
          );
        }
      }
    }
  }

  /** Render next batch of rows */
  _renderNextBatch() {
    const end = Math.min(this._renderedCount + this._renderBatchSize, this._rows.length);
    if (this._renderedCount >= end) return;

    const fragment = document.createDocumentFragment();
    let skipProject = false;

    for (let i = this._renderedCount; i < end; i++) {
      const row = this._rows[i];
      if (row.type === 'project-header') {
        skipProject = this._collapsedProjects.has(row.projectKey);
        fragment.appendChild(this._createProjectHeaderElement(row));
      } else if (skipProject) {
        // Skip time headers and sessions under collapsed project
        continue;
      } else if (row.type === 'header') {
        fragment.appendChild(this._createHeaderElement(row.category));
      } else {
        fragment.appendChild(this._createSessionElement(row));
      }
    }

    this._renderedCount = end;
    this.listContainer.appendChild(fragment);

    if (this._renderedCount < this._rows.length) {
      this._attachSentinel();
    }
  }

  /** Create a sticky category header element */
  _createHeaderElement(category) {
    const el = document.createElement('div');
    el.className = 'session-category';
    el.textContent = TIME_GROUP_LABELS[category] ? TIME_GROUP_LABELS[category]() : category;
    return el;
  }

  /** Create a project header element with chevron, folder icon, directory name, and count badge */
  _createProjectHeaderElement(row) {
    const el = document.createElement('div');
    el.className = 'session-project-header' + (row.collapsed ? ' collapsed' : '');
    el.dataset.projectKey = row.projectKey;
    if (row.fullPath) {
      el.title = row.fullPath;
    }

    // 折叠/展开使用文件夹-关/开两个图标叠放，按 collapsed 状态切换
    const iconClose = document.createElement('span');
    iconClose.className = 'project-icon-close';
    iconClose.innerHTML = '<svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z"/><path d="M43 22H5"/><path d="M5 16V28"/><path d="M43 16V28"/></svg>';

    const iconOpen = document.createElement('span');
    iconOpen.className = 'project-icon-open';
    iconOpen.innerHTML = '<svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="m12 28 3-5.8A4 4 0 0 1 18.48 20H40a4 4 0 0 1 3.88 5l-3.08 12a4 4 0 0 1-3.9 3H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4h7.8a4 4 0 0 1 3.38 1.8l1.62 2.4a4 4 0 0 0 3.34 1.8H36a4 4 0 0 1 4 4v4"/></svg>';

    // 两个图标叠放在同一格，折叠显示“文件夹-关”，展开显示“文件夹-开”
    const iconWrap = document.createElement('span');
    iconWrap.className = 'project-icon-wrap';
    iconWrap.appendChild(iconClose);
    iconWrap.appendChild(iconOpen);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-name';
    nameSpan.textContent = row.name;

    const openBtn = document.createElement('button');
    openBtn.className = 'project-open-btn';
    openBtn.title = _t('session.openWorkspace');
    openBtn.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l6-6"/><path d="M5 5h6v6"/></svg>';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!row.fullPath) return;
      // 切换 Hippo 工作区到该目录
      const ws = window.HippoWorkspace;
      if (ws?.openWorkspace) {
        ws.openWorkspace(row.fullPath).then(() => {
          showBottomToast(_t('workspace.switched') + row.fullPath);
        }).catch(() => {});
      }
    });

    el.appendChild(iconWrap);
    el.appendChild(nameSpan);
    el.appendChild(openBtn);

    // Toggle collapse on click
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = row.projectKey;
      if (this._collapsedProjects.has(key)) {
        this._collapsedProjects.delete(key);
      } else {
        this._collapsedProjects.add(key);
      }
      this._saveCollapsedState();
      // Rerender with collapsed state
      this._resetRenderer();
      this._rows = this._computeRows();
      this._renderNextBatch();
    });

    return el;
  }

  /** Create a session item element */
  _createSessionElement(row) {
    const s = row.session;
    const name = row.name;
    const isActive = s.id === this.currentSessionId;

    const item = document.createElement('div');
    item.className = 'session-item' + (isActive ? ' active' : '');
    item.dataset.sessionId = s.id;
    if (row.projectKey) item.dataset.projectKey = row.projectKey;

    // 若该会话是当前活跃会话，将其所属项目标题标记为 has-active（高亮）
    if (isActive && row.projectKey) {
      const headers = this.listContainer.querySelectorAll('.session-project-header');
      for (const h of headers) {
        if (h.dataset.projectKey === row.projectKey) {
          h.classList.add('has-active');
          break;
        }
      }
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'session-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'session-name';
    nameSpan.textContent = name;

    infoDiv.appendChild(nameSpan);

    const actionsDiv = document.createElement('span');
    actionsDiv.className = 'session-actions';

    const renameBtn = document.createElement('button');
    renameBtn.title = _t('session.rename');
    renameBtn.className = 'session-action-btn';
    renameBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.renameSession(s.id, e);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.title = _t('session.delete');
    deleteBtn.className = 'session-action-btn';
    deleteBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.deleteSession(s.id, e);
    });

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);

    item.addEventListener('click', (e) => {
      if (!e.target.closest('.session-actions')) {
        this.onSessionSwitch(s.id);
      }
    });

    return item;
  }

  /** Attach sentinel for IntersectionObserver to trigger next batch */
  _attachSentinel() {
    this._removeSentinel();

    this._sentinel = document.createElement('div');
    this._sentinel.className = 'session-list-sentinel';
    this.listContainer.appendChild(this._sentinel);

    this._observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        this._renderNextBatch();
      }
    }, {
      root: this.listContainer,
      rootMargin: '150px'
    });

    this._observer.observe(this._sentinel);
  }

  /** Remove sentinel and disconnect observer */
  _removeSentinel() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._sentinel) {
      this._sentinel.remove();
      this._sentinel = null;
    }
  }

  groupSessionsByTime(sessions) {
    const now = Date.now();
    const BEIJING_OFFSET = 8 * 3600 * 1000;

    const dayIndex = (ts) => Math.floor((ts + BEIJING_OFFSET) / 86400000);

    const today = dayIndex(now);

    const groups = {
      '今天': [],
      '昨天': [],
      '7天内': [],
      '30天内': [],
      '更早': []
    };

    for (const s of sessions) {
      // 优先用 lastActivityAt 分组，没有则回退到 createdAt
      const ts = parseInt(s.lastActivityAt || s.createdAt, 10);
      if (isNaN(ts)) {
        groups['更早'].push(s);
        continue;
      }
      const day = dayIndex(ts);
      const daysAgo = today - day;

      if (daysAgo === 0) {
        groups['今天'].push(s);
      } else if (daysAgo === 1) {
        groups['昨天'].push(s);
      } else if (daysAgo <= 7) {
        groups['7天内'].push(s);
      } else if (daysAgo <= 30) {
        groups['30天内'].push(s);
      } else {
        groups['更早'].push(s);
      }
    }

    return groups;
  }

  formatTimestamp(timestamp) {
    const ts = this.parseTimestamp(timestamp);
    const date = new Date(ts);

    const beijingOffset = 8 * 60 * 60 * 1000;
    const beijingDate = new Date(date.getTime() + beijingOffset);

    const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  parseTimestamp(timestamp) {
    try {
      return parseInt(timestamp, 10);
    } catch (e) {
      return 0;
    }
  }

  async createNewSession() {
    const newId = `web-${Date.now()}`;
    this.currentSessionId = newId;
    await this.loadSessions();
    return newId;
  }

  async deleteSession(sessionId, event) {
    event.stopPropagation();
    const sessionName = this.sessionNames[sessionId] || (_t('session.namePrefix') + ' ' + sessionId.replace('web-', '').slice(-6));

    const confirmed = await ConfirmDialog.confirmDelete(`${_t('confirm.deleteMessage')} "${sessionName}" ${_t('confirm.deleteIrreversible')}`);
    if (!confirmed) return;

    try {
      await this.chatService.deleteSession(sessionId);
      this.chatService.invalidateMessageCache(sessionId);
      delete this.sessionNames[sessionId];
      if (sessionId === this.currentSessionId) {
        this.currentSessionId = `web-${Date.now()}`;
      }
      await this.loadSessions();
    } catch (e) {
      console.error('删除会话失败:', e);
    }
  }

  async renameSession(sessionId, event) {
    event.stopPropagation();
    const item = event.target.closest('.session-item');
    const nameSpan = item.querySelector('.session-name');
    const oldName = nameSpan.textContent;

    const input = document.createElement('input');
    input.className = 'session-rename-input';
    input.value = oldName;
    nameSpan.replaceWith(input);
    input.focus();

    const finish = async () => {
      const newName = input.value.trim() || oldName;

      if (newName === oldName) {
        const span = document.createElement('span');
        span.className = 'session-name';
        span.textContent = oldName;
        input.replaceWith(span);
        return;
      }

      try {
        await this.chatService.renameSession(sessionId, newName);
        this.sessionNames[sessionId] = newName;
        const span = document.createElement('span');
        span.className = 'session-name';
        span.textContent = newName;
        input.replaceWith(span);
        await this.loadSessions();
      } catch (e) {
        console.error('重命名失败:', e);
        const span = document.createElement('span');
        span.className = 'session-name';
        span.textContent = oldName;
        input.replaceWith(span);
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
  }

  setSessionName(sessionId, name) {
    if (!this.sessionNames[sessionId]) {
      this.sessionNames[sessionId] = truncateText(name, 20);
    }
  }

  /**
   * 局部更新会话标题（不重刷整个列表）。
   * 若标题已在 sessionNames 中且内容相同则跳过。
   */
  updateSessionTitle(sessionId, title) {
    const truncated = truncateText(title, 30);
    if (this.sessionNames[sessionId] === truncated) return;
    this.sessionNames[sessionId] = truncated;

    // 在 DOM 中找到该会话项，直接更新文字
    const items = this.listContainer.querySelectorAll('.session-item');
    for (const item of items) {
      if (item.dataset.sessionId === sessionId) {
        const nameSpan = item.querySelector('.session-name');
        if (nameSpan) {
          nameSpan.textContent = truncated;
        }
        break;
      }
    }
  }
}

window.renameSession = async (sessionId, event) => {
  if (window.sessionManagerInstance) {
    await window.sessionManagerInstance.renameSession(sessionId, event);
  }
};

window.deleteSession = async (sessionId, event) => {
  if (window.sessionManagerInstance) {
    await window.sessionManagerInstance.deleteSession(sessionId, event);
  }
};
