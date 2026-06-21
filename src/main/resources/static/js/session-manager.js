import { truncateText } from './utils.js';
import { ChatService } from './chat-service.js';
import { showBottomToast } from './utils/toast.js';

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
    if (btn) btn.textContent = this._groupMode === 'project' ? '项目' : '时间';
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
    for (const item of items) {
      const sid = item.dataset.sessionId;
      item.classList.toggle('active', sid === sessionId);
    }
  }

  /** Render a given list of sessions into the container (synchronous) */
  renderSessionList(sessions) {
    this.sessions = sessions;
    this.sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    toggle.textContent = this._groupMode === 'project' ? '项目' : '时间';
    toggle.title = '切换分组方式';
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
        const ts = parseInt(s.createdAt, 10);
        if (!isNaN(ts) && ts > latestTime) latestTime = ts;
      }
      const dirName = projectPath
        ? projectPath.split('/').filter(Boolean).pop() || projectPath
        : '其他';
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

      // Sort sessions by createdAt descending within project
      const sorted = [...project.sessions].sort((a, b) => {
        const ta = parseInt(a.createdAt, 10) || 0;
        const tb = parseInt(b.createdAt, 10) || 0;
        return tb - ta;
      });

      for (const s of sorted) {
        const name = s.title || this.sessionNames[s.id] || ('会话 ' + s.id.replace('web-', '').slice(-6));
        if (s.title) this.sessionNames[s.id] = s.title;
        rows.push({ type: 'session', session: s, name });
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
        const name = s.title || this.sessionNames[s.id] || ('会话 ' + s.id.replace('web-', '').slice(-6));
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
        // Inject into "其他" project
        const otherProjIdx = rows.findIndex(r => r.type === 'project-header' && !r.projectPath);
        if (otherProjIdx !== -1) {
          rows.splice(otherProjIdx + 1, 0, {
            type: 'session', session: virtualSession,
            name: this.sessionNames[this.currentSessionId], _isVirtual: true
          });
          // Update "其他" count
          rows[otherProjIdx].count = (rows[otherProjIdx].count || 0) + 1;
        } else {
          rows.unshift(
            { type: 'project-header', projectKey: '__other__', projectPath: '', name: '其他', count: 1, fullPath: '', collapsed: false },
            { type: 'session', session: virtualSession, name: this.sessionNames[this.currentSessionId], _isVirtual: true }
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
    el.textContent = category;
    return el;
  }

  /** Create a project header element with chevron, folder icon, directory name, and count badge */
  _createProjectHeaderElement(row) {
    const el = document.createElement('div');
    el.className = 'session-project-header' + (row.collapsed ? ' collapsed' : '');
    if (row.fullPath) {
      el.title = row.fullPath;
    }

    const chevron = document.createElement('span');
    chevron.className = 'project-chevron';
    chevron.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

    const icon = document.createElement('span');
    icon.className = 'project-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-name';
    nameSpan.textContent = row.name;

    const openBtn = document.createElement('button');
    openBtn.className = 'project-open-btn';
    openBtn.title = '打开工作目录';
    openBtn.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l6-6"/><path d="M5 5h6v6"/></svg>';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!row.fullPath) return;
      // 切换 Hippo 工作区到该目录
      const ws = window.HippoWorkspace;
      if (ws?.openWorkspace) {
        ws.openWorkspace(row.fullPath).then(() => {
          showBottomToast('工作区已切换: ' + row.fullPath);
        }).catch(() => {});
      }
    });

    el.appendChild(chevron);
    el.appendChild(icon);
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

    const infoDiv = document.createElement('div');
    infoDiv.className = 'session-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'session-name';
    nameSpan.textContent = name;

    infoDiv.appendChild(nameSpan);

    const actionsDiv = document.createElement('span');
    actionsDiv.className = 'session-actions';

    const renameBtn = document.createElement('button');
    renameBtn.title = '重命名';
    renameBtn.innerHTML = '✏';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.renameSession(s.id, e);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.title = '删除';
    deleteBtn.innerHTML = '×';
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
      const ts = parseInt(s.createdAt, 10);
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
    const sessionName = this.sessionNames[sessionId] || ('会话 ' + sessionId.replace('web-', '').slice(-6));

    const confirmed = confirm(`确定要删除会话 "${sessionName}" 吗？\n\n此操作无法撤销！`);
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
