export class ChatNav {
  constructor(chatContainer) {
    this.chatContainer = chatContainer;
    this.strip = document.getElementById('chatNavStrip');
    this.itemsContainer = document.getElementById('chatNavItems');

    if (!this.strip || !this.itemsContainer) return;

    this._mutationObserver = null;
    this._rowItemMap = new Map();
    this._lastActiveItem = null;
    this._rafId = null;

    this._refresh();
    this._mutationObserver = new MutationObserver(() => this._refresh());
    this._mutationObserver.observe(this.chatContainer, { childList: true, subtree: false });

    this.chatContainer.addEventListener('scroll', () => this._onScroll(), { passive: true });
  }

  _refresh() {
    const userRows = this.chatContainer.querySelectorAll('.message-row.user-row');
    this.itemsContainer.innerHTML = '';
    this._rowItemMap.clear();
    this._lastActiveItem = null;

    if (userRows.length === 0) return;

    for (const row of userRows) {
      const contentDiv = row.querySelector('.message-content');
      const text = contentDiv ? contentDiv.textContent.trim() : '';
      const prefix = text.length > 32 ? text.substring(0, 32) + '…' : text;

      const item = document.createElement('div');
      item.className = 'chat-nav-item';
      item.textContent = prefix || '(空消息)';
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        row.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      this.itemsContainer.appendChild(item);
      this._rowItemMap.set(row, item);
    }
  }

  _onScroll() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._syncActiveItem();
    });
  }

  _syncActiveItem() {
    const userRows = this.chatContainer.querySelectorAll('.message-row.user-row');
    if (userRows.length === 0) return;

    const containerRect = this.chatContainer.getBoundingClientRect();
    let topmostRow = null;
    let topmostTop = Infinity;

    for (const row of userRows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
      const dist = rect.top - containerRect.top;
      if (dist < topmostTop) {
        topmostTop = dist;
        topmostRow = row;
      }
    }

    if (!topmostRow) return;

    const newActiveItem = this._rowItemMap.get(topmostRow);
    if (!newActiveItem) return;

    const changed = newActiveItem !== this._lastActiveItem;
    this._lastActiveItem = newActiveItem;

    for (const item of this._rowItemMap.values()) {
      item.classList.toggle('active', item === newActiveItem);
    }

    if (changed) {
      const listRect = this.itemsContainer.getBoundingClientRect();
      const itemRect = newActiveItem.getBoundingClientRect();

      if (itemRect.top < listRect.top) {
        this.itemsContainer.scrollTo({ top: this.itemsContainer.scrollTop - (listRect.top - itemRect.top), behavior: 'smooth' });
      } else if (itemRect.bottom > listRect.bottom) {
        this.itemsContainer.scrollTo({ top: this.itemsContainer.scrollTop + (itemRect.bottom - listRect.bottom), behavior: 'smooth' });
      }
    }
  }

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
    this._rowItemMap.clear();
  }
}
