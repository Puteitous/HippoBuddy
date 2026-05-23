import { truncateText } from './utils.js';
import { ChatService } from './chat-service.js';

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
    this._resetRenderer();
    this._rows = this._computeRows();
    this._renderNextBatch();
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

  /** Compute flat ordered rows (headers + session items) from all sessions */
  _computeRows() {
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

    // If current session is not in the list (e.g. new session not persisted), inject it into "今天"
    const currentInList = this.sessions.some(s => s.id === this.currentSessionId);
    if (!currentInList && this.currentSessionId && this.sessionNames[this.currentSessionId]) {
      const todayIdx = rows.findIndex(r => r.type === 'header' && r.category === '今天');
      if (todayIdx !== -1) {
        rows.splice(todayIdx + 1, 0, {
          type: 'session',
          session: { id: this.currentSessionId, createdAt: String(Date.now()) },
          name: this.sessionNames[this.currentSessionId],
          _isVirtual: true
        });
      } else {
        rows.unshift({ type: 'header', category: '今天' });
        rows.splice(1, 0, {
          type: 'session',
          session: { id: this.currentSessionId, createdAt: String(Date.now()) },
          name: this.sessionNames[this.currentSessionId],
          _isVirtual: true
        });
      }
    }

    return rows;
  }

  /** Render next batch of rows */
  _renderNextBatch() {
    const end = Math.min(this._renderedCount + this._renderBatchSize, this._rows.length);
    if (this._renderedCount >= end) return;

    const fragment = document.createDocumentFragment();

    for (let i = this._renderedCount; i < end; i++) {
      const row = this._rows[i];
      if (row.type === 'header') {
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

  /** Create a session item element */
  _createSessionElement(row) {
    const s = row.session;
    const name = row.name;
    const isActive = s.id === this.currentSessionId;
    const timeStr = this.formatTimestamp(s.createdAt);

    const item = document.createElement('div');
    item.className = 'session-item' + (isActive ? ' active' : '');
    item.dataset.sessionId = s.id;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'session-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'session-name';
    nameSpan.textContent = name;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'session-time';
    timeSpan.textContent = timeStr;

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(timeSpan);

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
