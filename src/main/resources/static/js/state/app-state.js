// 全局应用状态管理

// 可靠的主题读取：localStorage → cookie 后备
function _loadTheme() {
  const fromLS = localStorage.getItem('hippo-theme');
  if (fromLS === 'dark' || fromLS === 'light') return fromLS;
  // cookie 后备
  const match = document.cookie.match(/\bhippo-theme=(dark|light)\b/);
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
  lastUserMessage: '',
  
  // ========== Token 统计状态 ==========
  tokenHistory: [],
  maxTrendPoints: 30,
  
  // ========== 主题状态 ==========
  currentTheme: _loadTheme(),
  
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
  
  // 切换主题
  toggleTheme() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setState('currentTheme', next);
    return next;
  },
  
  // 获取系统提示词
  getSystemPrompt() {
    return this.currentSystemPrompt;
  },
  
  // 设置系统提示词
  setSystemPrompt(prompt) {
    this.setState('currentSystemPrompt', prompt);
  },
  
  // 添加 Token 历史记录
  addTokenRecord(record) {
    const history = [...this.tokenHistory, { ...record, timestamp: Date.now() }];
    this.setState('tokenHistory', history.slice(-this.maxTrendPoints));
  }
};

// 导出单例
export const appState = AppState.init();
