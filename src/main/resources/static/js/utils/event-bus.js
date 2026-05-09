export const EventBus = {
  _handlers: new Map(),

  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event).push(handler);
    return () => this.off(event, handler);
  },

  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  },

  emit(event, data) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.forEach(h => { try { h(data); } catch (e) { console.error(`EventBus handler error [${event}]:`, e); } });
    }
  }
};
