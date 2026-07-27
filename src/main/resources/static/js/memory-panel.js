import { SSEClient } from './sse-client.js';
import { safeParseJSON, escapeHtml, apiGet, apiPost } from './utils.js';

export class MemoryPanel {
  constructor(container, sseUrl = '/sse/memory-events') {
    this.container = container;
    this.sseClient = new SSEClient(sseUrl);
    this.hasMemories = false;
    this.memories = [];
    this.currentView = 'list';
    this.selectedMemory = null;
    this.filterType = 'all';
  }

  init() {
    this.sseClient.on('memory_saved', (e) => {
      this.addMemoryCard(e.data);
    });

    this.sseClient.connect();
    this.loadMemories();
    return this.sseClient;
  }

  async loadMemories() {
    try {
      const data = await apiGet('/api/memories');
      this.memories = data.memories || [];
      this.hasMemories = this.memories.length > 0;
      this.renderList();
    } catch (e) {
      console.error('加载记忆列表失败:', e);
    }
  }

  renderList() {
    this.currentView = 'list';
    const filtered = this.filterType === 'all'
      ? this.memories
      : this.memories.filter(m => m.type === this.filterType);

    const typeCounts = {};
    for (const m of this.memories) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }

    let filterHtml = `<button class="memory-filter-btn ${this.filterType === 'all' ? 'active' : ''}" data-type="all">${i18n.t('memory.all')} (${this.memories.length})</button>`;
    for (const [type, count] of Object.entries(typeCounts)) {
      const label = this.getTypeLabel(type);
      filterHtml += `<button class="memory-filter-btn ${this.filterType === type ? 'active' : ''}" data-type="${type}">${label} (${count})</button>`;
    }

    let listHtml = '';
    if (filtered.length === 0) {
      listHtml = '<div class="memory-empty">' + i18n.t('memory.empty') + '</div>';
    } else {
      for (const m of filtered) {
        const timeStr = m.lastUpdated ? this.formatTime(m.lastUpdated) : '';
        const typeLabel = this.getTypeLabel(m.type);
        const typeClass = `memory-type-${m.type.toLowerCase()}`;
        listHtml += `
          <div class="memory-card" data-id="${escapeHtml(m.id)}">
            <div class="memory-card-header">
              <span class="memory-type-badge ${typeClass}">${typeLabel}</span>
              <span class="memory-card-time">${timeStr}</span>
            </div>
            <div class="memory-card-title">${escapeHtml(m.title || m.id)}</div>
            ${m.tags && m.tags.length > 0 ? `<div class="memory-card-tags">${m.tags.map(t => `<span class="memory-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            <div class="memory-card-actions">
              <button class="memory-action-btn memory-view-btn" data-id="${escapeHtml(m.id)}" title="${i18n.t('memory.view')}">👁</button>
              <button class="memory-action-btn memory-edit-btn" data-id="${escapeHtml(m.id)}" title="${i18n.t('memory.edit')}">✏️</button>
              <button class="memory-action-btn memory-delete-btn" data-id="${escapeHtml(m.id)}" title="${i18n.t('memory.delete')}">🗑</button>
            </div>
          </div>
        `;
      }
    }

    this.container.innerHTML = `
      <div class="memory-toolbar">
        <div class="memory-filters">${filterHtml}</div>
        <button class="memory-refresh-btn" title="${i18n.t('memory.refresh')}">🔄</button>
      </div>
      <div class="memory-list-items">${listHtml}</div>
    `;

    this.bindListEvents();
  }

  bindListEvents() {
    this.container.querySelectorAll('.memory-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterType = btn.dataset.type;
        this.renderList();
      });
    });

    const refreshBtn = this.container.querySelector('.memory-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadMemories());
    }

    this.container.querySelectorAll('.memory-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.viewMemory(btn.dataset.id);
      });
    });

    this.container.querySelectorAll('.memory-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editMemory(btn.dataset.id);
      });
    });

    this.container.querySelectorAll('.memory-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteMemory(btn.dataset.id);
      });
    });

    this.container.querySelectorAll('.memory-card').forEach(card => {
      card.addEventListener('click', () => {
        this.viewMemory(card.dataset.id);
      });
    });
  }

  async viewMemory(id) {
    try {
      const data = await apiGet(`/api/memories/${encodeURIComponent(id)}`);
      this.selectedMemory = data;
      this.currentView = 'detail';
      this.renderDetail(data);
    } catch (e) {
      console.error('加载记忆详情失败:', e);
    }
  }

  renderDetail(data) {
    const typeLabel = this.getTypeLabel(data.type);
    const typeClass = `memory-type-${data.type.toLowerCase()}`;
    const createdStr = data.createdAt ? this.formatTime(data.createdAt) : '';
    const updatedStr = data.lastUpdated ? this.formatTime(data.lastUpdated) : '';

    this.container.innerHTML = `
      <div class="memory-detail">
        <div class="memory-detail-header">
          <button class="memory-back-btn">← ${i18n.t('memory.back')}</button>
          <div class="memory-detail-actions">
            <button class="memory-action-btn memory-edit-btn" data-id="${escapeHtml(data.id)}" title="${i18n.t('memory.edit')}">✏️</button>
            <button class="memory-action-btn memory-delete-btn" data-id="${escapeHtml(data.id)}" title="${i18n.t('memory.delete')}">🗑</button>
          </div>
        </div>
        <div class="memory-detail-meta">
          <span class="memory-type-badge ${typeClass}">${typeLabel}</span>
          <span class="memory-detail-id">${escapeHtml(data.id)}</span>
        </div>
        ${data.tags && data.tags.length > 0 ? `<div class="memory-card-tags">${data.tags.map(t => `<span class="memory-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="memory-detail-info">
          ${createdStr ? `<span>创建: ${createdStr}</span>` : ''}
          ${updatedStr ? `<span>更新: ${updatedStr}</span>` : ''}
          ${data.accessCount != null ? `<span>访问: ${data.accessCount} 次</span>` : ''}
          ${data.scope ? `<span>作用域: ${escapeHtml(data.scope)}</span>` : ''}
        </div>
        <div class="memory-detail-content">${escapeHtml(data.content || '')}</div>
      </div>
    `;

    this.container.querySelector('.memory-back-btn').addEventListener('click', () => {
      this.loadMemories();
    });

    this.container.querySelector('.memory-edit-btn').addEventListener('click', () => {
      this.editMemory(data.id);
    });

    this.container.querySelector('.memory-delete-btn').addEventListener('click', () => {
      this.deleteMemory(data.id);
    });
  }

  async editMemory(id) {
    try {
      const data = await apiGet(`/api/memories/${encodeURIComponent(id)}`);
      this.currentView = 'edit';
      this.renderEdit(data);
    } catch (e) {
      console.error('加载记忆编辑失败:', e);
    }
  }

  renderEdit(data) {
    const typeLabel = this.getTypeLabel(data.type);

    this.container.innerHTML = `
      <div class="memory-edit">
        <div class="memory-detail-header">
          <button class="memory-back-btn">← 返回</button>
          <button class="memory-save-btn">💾 保存</button>
        </div>
        <div class="memory-detail-meta">
          <span class="memory-type-badge memory-type-${data.type.toLowerCase()}">${typeLabel}</span>
          <span class="memory-detail-id">${escapeHtml(data.id)}</span>
        </div>
        <div class="memory-edit-field">
          <label>标签 (逗号分隔)</label>
          <input type="text" class="memory-edit-tags" value="${escapeHtml((data.tags || []).join(', '))}" />
        </div>
        <div class="memory-edit-field">
          <label>内容</label>
          <textarea class="memory-edit-content" rows="12">${escapeHtml(data.content || '')}</textarea>
        </div>
      </div>
    `;

    this.container.querySelector('.memory-back-btn').addEventListener('click', () => {
      this.viewMemory(data.id);
    });

    this.container.querySelector('.memory-save-btn').addEventListener('click', async () => {
      const tagsStr = this.container.querySelector('.memory-edit-tags').value;
      const content = this.container.querySelector('.memory-edit-content').value;
      const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

      try {
        const res = await apiPost(`/api/memories/${encodeURIComponent(data.id)}`, { content, tags }, 'PUT');
        if (res.success) {
          this.viewMemory(data.id);
        } else {
          showToast(window.i18n.t('memory.saveFailed'), 'error');
        }
      } catch (e) {
        showToast(window.i18n.t('memory.saveFailed') + ': ' + e.message, 'error');
      }
    });
  }

  async deleteMemory(id) {
    if (!confirm(i18n.t('memory.deleteConfirm', { id }))) return;

    try {
      const res = await apiPost(`/api/memories/${encodeURIComponent(id)}`, undefined, 'DELETE');
      if (res.success) {
        this.memories = this.memories.filter(m => m.id !== id);
        if (this.currentView === 'list') {
          this.renderList();
        } else {
          this.loadMemories();
        }
      } else {
        showToast(i18n.t('memory.deleteFailed'), 'error');
      }
    } catch (e) {
      showToast(i18n.t('memory.deleteFailed') + ': ' + e.message, 'error');
    }
  }

  addMemoryCard(dataStr) {
    const data = safeParseJSON(dataStr);
    if (!data) return;
    this.loadMemories();
  }

  getTypeLabel(type) {
    const labels = {
      'USER_PREFERENCE': '偏好',
      'PROJECT_CONTEXT': '项目',
      'FEEDBACK': '反馈',
      'REFERENCE': '参考',
      'CONVERSATION_SUMMARY': '摘要'
    };
    return labels[type] || type;
  }

  formatTime(isoStr) {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin} 分钟前`;

      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} 小时前`;

      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  getSSEClient() {
    return this.sseClient;
  }
}
