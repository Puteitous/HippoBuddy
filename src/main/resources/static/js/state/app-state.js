// 全局应用状态管理

// 可靠的主题读取：localStorage → cookie 后备
function _loadTheme() {
  const fromLS = localStorage.getItem('hippo-theme');
  if (fromLS === 'dark' || fromLS === 'light' || fromLS === 'midnight') return fromLS;
  // cookie 后备
  const match = document.cookie.match(/\bhippo-theme=(dark|light|midnight)\b/);
  return match ? match[1] : 'light';
}

function _saveTheme(value) {
  try { localStorage.setItem('hippo-theme', value); } catch (_) {}
  // cookie 后备，30 天过期
  document.cookie = `hippo-theme=${value}; path=/; max-age=2592000; SameSite=Lax`;
}

export const AppState = {
  // ========== 会话状态 ==========
  currentSessionId: null,
  
  // ========== 系统提示词状态 ==========
  currentSystemPrompt: null,
  promptPresets: [],
  selectedPresetId: localStorage.getItem('hippo-prompt-preset') || 'default',
  
  // ========== SSE 连接状态 ==========
  isSSEConnected: false,
  sseReconnectAttempts: 0,
  
  // ========== 聊天状态 ==========
  isSendingMessage: false,
  currentAbortController: null,
  userScrolledUp: false,
  /** 程序化滚动标记：在 doRender 恢复 scrollTop 前设为 true，scroll 事件中据此跳过误判 */
  _programmaticScroll: false,
  lastUserMessage: '',
  
  // ========== 会话输入草稿 ==========
  _sessionInputDrafts: new Map(),  // sessionId → 输入框内容

  saveSessionInputDraft(sessionId, text) {
    if (text && text.trim()) {
      this._sessionInputDrafts.set(sessionId, text);
    } else {
      this._sessionInputDrafts.delete(sessionId); // 空内容不占位
    }
  },

  getSessionInputDraft(sessionId) {
    return this._sessionInputDrafts.get(sessionId) || '';
  },

  clearSessionInputDraft(sessionId) {
    this._sessionInputDrafts.delete(sessionId);
  },

  // ========== Hero 待定草稿（独立于会话，回到 hero 空态时恢复） ==========
  _heroPendingDraft: '',

  saveHeroPendingDraft(text) {
    this._heroPendingDraft = text || '';
  },

  getHeroPendingDraft() {
    return this._heroPendingDraft;
  },

  clearHeroPendingDraft() {
    this._heroPendingDraft = '';
  },

  // ========== 会话级模式（每个会话独立记忆，切换时恢复） ==========
  _sessionModes: new Map(),  // sessionId → mode 字符串

  saveSessionMode(sessionId, mode) {
    if (sessionId && mode) {
      this._sessionModes.set(sessionId, mode);
    }
  },

  getSessionMode(sessionId) {
    return (sessionId && this._sessionModes.has(sessionId))
      ? this._sessionModes.get(sessionId)
      : this.mode;  // 无记录时返回全局模式
  },

  // ========== 从后端批量更新会话模式 ==========
  batchSetSessionModes(sessions) {
    if (!sessions || !Array.isArray(sessions)) return;
    for (const s of sessions) {
      if (s.id && s.mode) {
        this._sessionModes.set(s.id, s.mode);
      }
    }
  },

  // ========== Token 统计状态 ==========
  tokenHistory: [],
  maxTrendPoints: 30,
  
  // ========== 模式状态 ==========
  mode: localStorage.getItem('hippo-agent-mode') || 'coding',
  
  // ========== 主题状态 ==========
  currentTheme: _loadTheme(),
  _preferredDark: (() => { const t = _loadTheme(); return t === 'dark' || t === 'midnight' ? t : 'dark'; })(),
  
  // ========== 状态监听器 ==========
  listeners: new Map(),
  
  // ========== 状态设置方法 ==========
  setState(key, value) {
    const oldValue = this[key];
    this[key] = value;
    
    // 触发监听器
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(value, oldValue));
    }
    
    // 自动持久化
    if (key === 'currentTheme') {
      _saveTheme(value);
    } else if (key === 'selectedPresetId') {
      localStorage.setItem('hippo-prompt-preset', value);
    } else if (key === 'tokenHistory') {
      try {
        localStorage.setItem('hippo-token-trend', JSON.stringify(value.slice(-this.maxTrendPoints)));
      } catch (e) {
        console.warn('保存 Token 历史失败:', e);
      }
    } else if (key === 'mode') {
      localStorage.setItem('hippo-agent-mode', value);
    }
  },
  
  // ========== 订阅状态变化 ==========
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
    
    // 返回取消订阅函数
    return () => {
      const callbacks = this.listeners.get(key);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  },
  
  // ========== 初始化状态 ==========
  init() {
    // 从 localStorage 恢复 Token 历史
    try {
      const saved = localStorage.getItem('hippo-token-trend');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.tokenHistory = parsed.slice(-this.maxTrendPoints);
        }
      }
    } catch (e) {
      console.warn('恢复 Token 历史失败:', e);
    }
    
    // 从 localStorage 恢复自定义提示词
    if (this.selectedPresetId === 'custom') {
      const saved = localStorage.getItem('hippo-custom-prompt');
      if (saved) {
        this.currentSystemPrompt = saved;
      }
    }
    
    return this;
  },
  
  // ========== 辅助方法 ==========
  
  // 获取主题
  getTheme() {
    return this.currentTheme;
  },
  
  // 快速切换主题（light ↔ 偏好暗色主题，支持 dark / midnight）
  toggleTheme() {
    const next = this.currentTheme === 'dark' || this.currentTheme === 'midnight' ? 'light' : this._preferredDark;
    this.setState('currentTheme', next);
    return next;
  },

  // 设置指定主题（light / dark / midnight）
  setTheme(theme) {
    this.setState('currentTheme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    // 记录用户偏好的暗色主题，供 toggle 时跳转
    if (theme === 'dark' || theme === 'midnight') {
      this._preferredDark = theme;
    }
  },
  
  // 获取系统提示词
  getSystemPrompt() {
    return this.currentSystemPrompt;
  },
  
  // 设置系统提示词
  setSystemPrompt(prompt) {
    this.setState('currentSystemPrompt', prompt);
  },
  
  // 获取当前模式
  getMode() {
    return this.mode;
  },
  
  // 设置模式
  setMode(mode) {
    this.setState('mode', mode);
  },
  
  // 添加 Token 历史记录
  addTokenRecord(record) {
    const history = [...this.tokenHistory, { ...record, timestamp: Date.now() }];
    this.setState('tokenHistory', history.slice(-this.maxTrendPoints));
  }
};

// 导出单例
export const appState = AppState.init();
