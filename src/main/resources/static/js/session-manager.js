import { truncateText } from './utils.js';
import { ChatService } from './chat-service.js';

export class SessionManager {
  constructor(listContainer, onSessionSwitch) {
    this.listContainer = listContainer;
    this.onSessionSwitch = onSessionSwitch;
    this.chatService = new ChatService();
    this.sessionNames = {};
    this.currentSessionId = null;
  }

  setCurrentSession(sessionId) {
    this.currentSessionId = sessionId;
  }

  getCurrentSession() {
    return this.currentSessionId;
  }

  async loadSessions() {
    try {
      const sessions = await this.chatService.getSessions();
      this.renderSessionList(sessions);
    } catch (e) {
      console.error('加载会话列表失败:', e);
    }
  }

  renderSessionList(sessions) {
    this.listContainer.innerHTML = '';
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    
    const grouped = this.groupSessionsByTime(sessions);
    
    for (const [category, categorySessions] of Object.entries(grouped)) {
      if (categorySessions.length === 0) continue;
      
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'session-category';
      categoryHeader.textContent = category;
      this.listContainer.appendChild(categoryHeader);
      
      for (const s of categorySessions) {
        const name = s.title || this.sessionNames[s.id] || ('会话 ' + s.id.replace('web-', '').slice(-6));
        if (s.title) this.sessionNames[s.id] = s.title;
        const isActive = s.id === this.currentSessionId;
        const timeStr = this.formatTimestamp(s.createdAt);
        
        const item = document.createElement('div');
        item.className = 'session-item' + (isActive ? ' active' : '');
        
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
        
        this.listContainer.appendChild(item);
      }
    }

    const currentInList = sessions.some(s => s.id === this.currentSessionId);
    if (!currentInList && this.currentSessionId) {
      const name = this.sessionNames[this.currentSessionId] || ('会话 ' + this.currentSessionId.replace('web-', '').slice(-6));
      const item = document.createElement('div');
      item.className = 'session-item active';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'session-name';
      nameSpan.textContent = name;
      
      const actionsDiv = document.createElement('span');
      actionsDiv.className = 'session-actions';
      
      const renameBtn = document.createElement('button');
      renameBtn.title = '重命名';
      renameBtn.innerHTML = '✏';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.renameSession(this.currentSessionId, e);
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.title = '删除';
      deleteBtn.innerHTML = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.deleteSession(this.currentSessionId, e);
      });
      
      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);
      
      item.appendChild(nameSpan);
      item.appendChild(actionsDiv);
      
      item.addEventListener('click', () => this.onSessionSwitch(this.currentSessionId));
      this.listContainer.insertBefore(item, this.listContainer.firstChild);
    }
  }

  groupSessionsByTime(sessions) {
    const now = new Date();
    const beijingOffset = 8 * 60 * 60 * 1000;
    const beijingNow = new Date(now.getTime() + beijingOffset);
    
    const todayStart = new Date(beijingNow);
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setTime(todayStart.getTime() - beijingOffset);
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    const weekStart = new Date(todayStart);
    const dayOfWeek = todayStart.getDay();
    weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    const groups = {
      '今天': [],
      '昨天': [],
      '本周': [],
      '更早': []
    };
    
    for (const s of sessions) {
      const ts = this.parseTimestamp(s.createdAt);
      const sessionDate = new Date(ts);
      
      if (sessionDate >= todayStart) {
        groups['今天'].push(s);
      } else if (sessionDate >= yesterdayStart) {
        groups['昨天'].push(s);
      } else if (sessionDate >= weekStart) {
        groups['本周'].push(s);
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
    input.select();

    const finish = async () => {
      const newName = input.value.trim() || oldName;
      
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
