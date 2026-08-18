/**
 * Hippo Cockpit 主入口文件
 * 
 * 负责：
 * 1. 初始化所有组件
 * 2. 绑定全局事件
 * 3. 协调各模块通信
 */

import { appState } from './state/app-state.js';
import { ChatService } from './chat-service.js';
import { ChatUI } from './chat-ui.js';
import { SessionManager } from './session-manager.js';
import { ChatPanel } from './components/chat-panel/ChatPanel.js';
import { ChatNav } from './components/ChatNav.js';
import { TokenMonitor } from './components/TokenMonitor.js';
import { MetricsPanel } from './components/MetricsPanel.js';

import { diffModalManager } from './utils/diff-modal.js';
import { FileChangeManager } from './utils/file-change-manager.js';
import { EventBus } from './utils/event-bus.js';
import { showToast, showBottomToast } from './utils/toast.js';
import { generateSessionId, apiGet, apiPost } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { RollbackPanel } from './components/RollbackPanel.js';
import { initSelectionActions } from './components/selection-actions.js';
import { ActivityBar } from './components/ActivityBar.js';
import { ModelSelectorPanel } from './components/ModelSelectorPanel.js';
import { ConfirmDialog } from './utils/modal.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { SkillMarket } from './components/SkillMarket.js';
import { OnboardingTour } from './components/OnboardingTour.js';

// ========== 全局状态 ==========
let currentSessionId = null;
let currentSystemPrompt = null;
let promptPresets = [];
let selectedPresetId = appState.selectedPresetId;

// ========== 服务实例 ==========
const chatService = new ChatService();
const chatContainer = document.getElementById('chatContainer');
const chatUI = new ChatUI(chatContainer, {
  rollbackFile: (filePath) => chatService.rollbackFile(filePath)
});
const sessionList = document.getElementById('sessionList');

// ========== 组件实例 ==========
let sessionManager;
let chatPanel;
let chatNav;
let tokenMonitor;
let metricsPanel;
let fileChangeManager;
let rollbackPanel;
let activityBar;

// ========== DOM 元素 ==========
const elements = {
  themeToggle: document.getElementById('themeToggle'),

  compactBtn: document.getElementById('compactBtn'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  promptModal: document.getElementById('promptModal'),
  promptModalText: document.getElementById('promptModalText'),
  promptModalClose: document.getElementById('promptModalClose'),
  promptModalCancel: document.getElementById('promptModalCancel'),
  promptModalSave: document.getElementById('promptModalSave')
};

// ========== 初始化 ==========
function init() {
  console.log('🚀 Initializing Hippo Cockpit...');
  
  // 0. 初始化 Activity Bar
  activityBar = new ActivityBar();
  
  // 注册 Token 面板（克隆模板内容）
  const abTokenTemplate = document.getElementById('abTokenPanel');
  if (abTokenTemplate && activityBar) {
    activityBar.registerPanel('token', () => {
      return abTokenTemplate.content.cloneNode(true);
    });
  }

  // 注册监控面板
  const abMonitorTemplate = document.getElementById('abMonitorPanel');
  if (abMonitorTemplate && activityBar) {
    activityBar.registerPanel('monitor', () => {
      return abMonitorTemplate.content.cloneNode(true);
    });
  }

  // 注册文件变更面板
  const abFilesTemplate = document.getElementById('abFilesPanel');
  if (abFilesTemplate && activityBar) {
    activityBar.registerPanel('files', () => {
      return abFilesTemplate.content.cloneNode(true);
    });
  }

  // 注册打开浏览器动作
  if (activityBar) {
    activityBar.onAction('openBrowser', () => {
      const ws = window.HippoWorkspace;
      if (ws && ws.openWebBrowser) {
        ws.openWebBrowser('about:blank');
      }
    });
  }

  // 注册打开终端动作
  if (activityBar) {
    activityBar.onAction('openTerminal', () => {
      const HippoDesktop = window.HippoDesktop;
      if (HippoDesktop && HippoDesktop.isAvailable) {
        HippoDesktop.openTerminal().catch(() => {});
      }
    });
  }

  // 注册技能市场动作
  window.skillMarket = new SkillMarket();
  if (activityBar) {
    activityBar.onAction('skillMarket', () => {
      // 互斥：关闭设置面板
      if (window.settingsPanel && window.settingsPanel.isOpen()) {
        window.settingsPanel.close();
      }
      window.skillMarket.toggle();
    });
  }

  // 1. 初始化主题
  initTheme();

  // 2. 初始化面板布局
  const savedLayout = localStorage.getItem('hippo-layout');
  if (savedLayout === 'chat-left') {
    document.querySelector('.main-container')?.classList.add('layout-chat-first');
  }

  // 3. 初始化会话管理器
  sessionManager = new SessionManager(sessionList, switchSession);
  window.sessionManagerInstance = sessionManager;
  
  // 3. 初始化聊天面板
  chatPanel = new ChatPanel(chatContainer, chatService, chatUI);
  
  // 3.1 初始化回滚面板
  rollbackPanel = new RollbackPanel({
    chatService,
    chatPanel,
    chatContainer,
    messageInput: elements.messageInput,
    onCreateNewSession: () => createNewSession(),
    onUpdateFileChanges: () => fileChangeManager?.updateFileChanges(appState.currentSessionId)
  });
  
  // 4. 初始化对话导航
  chatNav = new ChatNav(chatContainer);
  
  // 5. 初始化 Token 监控
  tokenMonitor = new TokenMonitor(chatService);
  
  // 5. 初始化监控面板
  metricsPanel = new MetricsPanel();
  
  // 6. 预暖 markdown 渲染器（后台初始化，加速首次会话切换）
  renderMarkdown(' ').catch(() => {});
  
  // 7. 初始化文件变更监控
  fileChangeManager = new FileChangeManager();
  fileChangeManager.init();

  // 7.1 初始化文本选中快捷操作
  initSelectionActions();

  // 7.2 加载当前模型配置到快速切换器
  loadQuickModelConfig();

  // 语言切换时刷新模型选择按钮 + 预设提示词标签文本
  window.addEventListener('i18n:change', () => {
    loadQuickModelConfig();
    chatPanel?._syncModeUI(appState.getMode());
  });

  // 7.3 初始化会话面板标题（i18n）
  const sessionTitleEl = document.getElementById('sessionHeaderTitle');
  if (sessionTitleEl) {
    sessionTitleEl.textContent = i18n.t('session.title');
  }

  // 7.4 初始化设置面板
  window.settingsPanel = new SettingsPanel();
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    // 互斥：关闭技能市场
    if (window.skillMarket && window.skillMarket.isOpen()) {
      window.skillMarket.close();
    }
    window.settingsPanel.toggle();
  });

  // 8. 绑定全局事件
  bindGlobalEvents();
  
  // 9. 加载预设提示词
  loadPromptPresets();
  
  // 10. 尝试恢复上次会话，否则创建新会话
  _cachedLastSessionInfo = _readLastSessionInfo();
  (async () => {
    const lastSessionId = (() => {
      try { return localStorage.getItem('hippo-last-session-id'); } catch { return null; }
    })();
    if (lastSessionId) {
      try {
        const messages = await chatService.getSessionMessages(lastSessionId);
        if (messages && messages.length > 0) {
          await switchSession(lastSessionId);
          sessionManager.loadSessions().then(() => {
            updateHistoryDropdown?.();
            // 从后端同步会话模式到内存 Map
            if (sessionManager.sessions) {
              appState.batchSetSessionModes(sessionManager.sessions);
            }
          });
          return;
        }
      } catch (e) {
        console.warn('恢复上次会话失败，创建新会话:', e);
      }
    }
    // 走到这里说明没有会话可恢复或恢复失败，恢复 hero 显示
    document.getElementById('skip-hero-style')?.remove();
    currentSessionId = generateSessionId();
    sessionManager.setCurrentSession(currentSessionId);
    appState.currentSessionId = currentSessionId;
    sessionManager.loadSessions().then(() => {
      updateHistoryDropdown?.();
      // 从后端同步会话模式到内存 Map
      if (sessionManager.sessions) {
        appState.batchSetSessionModes(sessionManager.sessions);
      }
    });
    _switchToHeroMode();
    // 同步 hero 空态的模式 UI（高亮 + 标语 + 预设提示词），与全局模式保持一致
    chatPanel._syncModeUI(appState.getMode());

    // ✨ 刷新后触发空状态入场动画
    requestAnimationFrame(() => {
      const es = chatContainer?.querySelector('.empty-state');
      if (es) {
        es.classList.add('animate');
        setTimeout(() => es.classList.remove('animate'), 1000);
      }
    });
  })();
  
  // 10.5 初始化桌面端自动更新（检测到新版本时弹出更新卡片）
  initAutoUpdater();

  // 11. 启动自动更新
  tokenMonitor.startAutoUpdate(30000);
  metricsPanel.startAutoUpdate(10000);
  
  // 12. 初始化趋势图
  tokenMonitor.renderTrendChart();
  
  // 13. 订阅事件
  // 防抖：消息发送后刷新会话列表（使 lastActivityAt 排序生效），避免频繁重排
  let _debounceSessionRefresh = null;
  EventBus.on('message:sent', () => {
    chatService.invalidateMessageCache(appState.currentSessionId);
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    fileChangeManager.updateFileChanges(appState.currentSessionId);

    // 防抖刷新会话列表：连续发多条消息时只刷新一次
    if (_debounceSessionRefresh) clearTimeout(_debounceSessionRefresh);
    _debounceSessionRefresh = setTimeout(() => {
      _debounceSessionRefresh = null;
      sessionManager?.loadSessions();
    }, 1500);
  });

  // 流式实时 Token 统计推送（后端 token_update SSE 事件 → MessageSession → EventBus）
  // 直接交给 TokenMonitor 渲染，避免 30s 轮询滞后；趋势图历史记录仍以轮询拉取为准
  EventBus.on('token:update', (data) => {
    if (!data) return;
    tokenMonitor?.onLiveTokenUpdate(data);
  });
  
  EventBus.on('session:auto-name', ({ sessionId }) => {
    if (sessionId && sessionManager) {
      if (!sessionManager.sessionNames || !sessionManager.sessionNames[sessionId]) {
        sessionManager.setSessionName(sessionId, i18n.t('session.defaultName'));
        sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
      }
    }
  });

  // 接收 AI 生成的标题，局部更新 DOM（不重刷列表）
  EventBus.on('session:title-updated', ({ sessionId, title }) => {
    if (sessionId && sessionManager && title) {
      sessionManager.updateSessionTitle(sessionId, title);
      if (sessionId === currentSessionId) {
        _saveLastSessionInfo(sessionId, title, null); // 只更新标题，project 不变
        updateChatPanelTitle(sessionId);
      }
      // 同步更新历史记录下拉框
      updateHistoryDropdown?.();
    }
  });

  // 14. 注册 Activity Bar 面板打开回调（所有组件已就绪）
  if (activityBar) {
    activityBar.onPanelOpen('token', () => tokenMonitor?.updateTokenStats());
    activityBar.onPanelOpen('monitor', () => metricsPanel?.updateMetrics());
    activityBar.onPanelOpen('files', () => fileChangeManager?.updateFileChanges(appState.currentSessionId));

    // 会话面板折叠/展开 — 工具栏按钮 & 逃生工具栏
    const toolbarEscape = document.getElementById('toolbarEscape');

    function toggleSessionPanel(btn) {
      const sp = document.getElementById('sessionPanel');
      if (!sp) return;
      const nowHidden = !sp.classList.contains('hidden');
      sp.classList.toggle('hidden', nowHidden);
      if (btn) btn.classList.toggle('active', !nowHidden);
      // 逃生工具栏同步显示/隐藏
      if (toolbarEscape) {
        toolbarEscape.style.display = nowHidden ? 'flex' : 'none';
      }
    }

    const sessionToggleBtn = document.getElementById('sessionToggleBtn');
    if (sessionToggleBtn) {
      sessionToggleBtn.addEventListener('click', () => toggleSessionPanel(sessionToggleBtn));
      // 同步初始 active 状态
      const sp = document.getElementById('sessionPanel');
      if (sp) {
        sessionToggleBtn.classList.toggle('active', !sp.classList.contains('hidden'));
      }
    }
    const sessionToggleBtnEsc = document.getElementById('sessionToggleBtnEsc');
    if (sessionToggleBtnEsc) {
      sessionToggleBtnEsc.addEventListener('click', () => toggleSessionPanel(sessionToggleBtnEsc));
    }

    // 新建会话 — 工具栏 & 逃生按钮
    const newSessionBtn = document.getElementById('newSessionBtn');
    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', () => createNewSession());
    }
    const newSessionBtnEsc = document.getElementById('newSessionBtnEsc');
    if (newSessionBtnEsc) {
      newSessionBtnEsc.addEventListener('click', () => createNewSession());
    }

    // 活动栏显示/隐藏切换按钮（在工具栏 & 逃生中）
    function toggleActivityBar(btn) {
      const nowVisible = activityBar.toggleVisibility();
      btn.classList.toggle('active', nowVisible);
    }

    const toggleBtn = document.getElementById('activityBarToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggleActivityBar(toggleBtn));
      toggleBtn.classList.toggle('active', activityBar.isVisible());
    }
    const toggleBtnEsc = document.getElementById('activityBarToggleBtnEsc');
    if (toggleBtnEsc) {
      toggleBtnEsc.addEventListener('click', () => toggleActivityBar(toggleBtnEsc));
      toggleBtnEsc.classList.toggle('active', activityBar.isVisible());
    }
  }

  // 15. 新手指引（首次启动时展示）
  const onboardingTour = new OnboardingTour();
  setTimeout(() => onboardingTour.start(), 3000);
  
  console.log('✅ Hippo Cockpit initialized');
}

const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

// ========== 主题管理 ==========
function initTheme() {
  // 尝试从 Electron 已保存的主题同步（保证与 splash 一致）
  const electronThemePromise = window.electronAPI?.getTheme
    ? window.electronAPI.getTheme().then(t => {
        if (t === 'dark' || t === 'light' || t === 'midnight') {
          // 仅当 localStorage 未显式保存时才同步覆盖
          const fromLS = localStorage.getItem('hippo-theme');
          if (!fromLS || fromLS === 'light') {
            appState.setState('currentTheme', t);
          }
        }
      }).catch(() => {})
    : Promise.resolve();

  // 立即应用当前主题（localStorage 优先），IPC 完成后再校正
  const savedTheme = appState.getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle.innerHTML = savedTheme === 'dark' || savedTheme === 'midnight' ? ICON_SUN : ICON_MOON;
  applyHljsTheme(savedTheme);

  // 订阅主题变化（来自设置面板等外部变更）
  appState.subscribe('currentTheme', (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    elements.themeToggle.innerHTML = theme === 'dark' || theme === 'midnight' ? ICON_SUN : ICON_MOON;
    applyHljsTheme(theme);
    // 同步到 Electron（下次启动 splash 时保持一致）
    if (window.electronAPI?.setTheme) {
      window.electronAPI.setTheme(theme);
    }
  });

  // IPC 完成后如果有校正，重新应用
  electronThemePromise.then(() => {
    const corrected = appState.getTheme();
    if (corrected !== savedTheme) {
      document.documentElement.setAttribute('data-theme', corrected);
      elements.themeToggle.innerHTML = corrected === 'dark' || corrected === 'midnight' ? ICON_SUN : ICON_MOON;
      applyHljsTheme(corrected);
    }
  });
}

function applyHljsTheme(theme) {
  const lightSheet = document.getElementById('hljs-light-theme');
  const darkSheet = document.getElementById('hljs-dark-theme');
  
  const isDark = theme === 'dark' || theme === 'midnight';
  lightSheet.disabled = isDark;
  darkSheet.disabled = !isDark;
}

// ========== 全局事件绑定 ==========
function bindGlobalEvents() {
  // 主题切换
  elements.themeToggle?.addEventListener('click', () => {
    const next = appState.toggleTheme();
    document.documentElement.setAttribute('data-theme', next);
    elements.themeToggle.innerHTML = next === 'dark' || next === 'midnight' ? ICON_SUN : ICON_MOON;
    applyHljsTheme(next);
  });

  // 聊天面板头部 - 新建会话
  document.getElementById('chatNewBtn')?.addEventListener('click', createNewSession);
  
  // 工作区清除由 workspace-manager.js 处理，此处不再重复绑定

  // Phase 2: 输入草稿由 createNewSession/switchSession 统一管理，无需单独监听 heroInput
  // Phase 2: 模型选择已统一使用底部 #modelQuickSelect
  
  // 聊天面板头部 - 历史会话下拉点击外部关闭
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('chatHistoryWrapper');
    const dropdown = document.getElementById('chatHistoryDropdown');
    if (wrapper && dropdown && !wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // 恢复 hover 控制 + 刷新下拉内容
  const historyWrapper = document.getElementById('chatHistoryWrapper');
  if (historyWrapper) {
    historyWrapper.addEventListener('mouseenter', () => {
      updateHistoryDropdown?.();
      const dropdown = document.getElementById('chatHistoryDropdown');
      if (dropdown) dropdown.style.display = '';
    });
  }
  
  // 提示词预设
  elements.promptCustomBtn?.addEventListener('click', () => {
    elements.promptModal.style.display = 'flex';
    const preset = promptPresets.find(p => p.id === selectedPresetId);
    if (preset) {
      elements.promptModalText.value = currentSystemPrompt || preset.prompt;
    }
  });
  
  elements.promptModalClose?.addEventListener('click', closePromptModal);
  elements.promptModalCancel?.addEventListener('click', closePromptModal);
  elements.promptModal.querySelector('.prompt-modal-overlay')?.addEventListener('click', closePromptModal);
  
  elements.promptModalSave?.addEventListener('click', () => {
    const customPrompt = elements.promptModalText.value.trim();
    if (customPrompt) {
      currentSystemPrompt = customPrompt;
      selectedPresetId = 'custom';
      appState.setState('selectedPresetId', 'custom');
      appState.setSystemPrompt(customPrompt);
      localStorage.setItem('hippo-custom-prompt', customPrompt);
      document.querySelectorAll('.prompt-mode-btn').forEach(btn => btn.classList.remove('active'));
    }
    closePromptModal();
  });
  
  // 侧边栏折叠（通过事件代理处理）
  document.querySelectorAll('.sidebar-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('expanded');
      const body = header.nextElementSibling;
      if (body) body.classList.toggle('show');
    });
  });
  
  // 状态条各模块 → 打开 Activity Bar 对应面板
  // 注意：files 不在此联动列表 —— 状态栏文件项的点击由 FileChangeManager 处理（切换 popover 固定显示）
  const statusBarItems = document.querySelectorAll('.status-bar-item');
  statusBarItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (!section || !activityBar) return;
      
      // 映射 data-section → Activity Bar 面板名（files 除外，独立处理）
      const panelMap = { token: 'token', monitor: 'monitor' };
      const panelName = panelMap[section];
      if (!panelName) return;
      
      if (activityBar.getActivePanel() === panelName) {
        activityBar.closePanel();
      } else {
        activityBar.openPanel(panelName);
      }
    });
  });
  
  // 消息回滚事件
  EventBus.on('message:rollback', (msgDiv) => {
    rollbackPanel.execute(msgDiv, currentSessionId);
  });

  // 消息分叉事件
  EventBus.on('message:fork', async (msgDiv) => {
    const assistantRow = msgDiv.closest('.message-row');
    if (!assistantRow) return;

    const userRow = assistantRow.previousElementSibling;
    const messageId = userRow?.querySelector('.message.user')?.dataset?.messageId
      || chatPanel._lastUserMessageId;

    if (!messageId) {
      showToast(i18n.t('chat.forkNoMessageId'), { type: 'error', duration: 3000 });
      return;
    }

    try {
      const forkResult = await chatService.forkSession(currentSessionId, messageId);
      if (forkResult.newSessionId) {
        await switchSession(forkResult.newSessionId);
        await sessionManager.loadSessions();
        updateHistoryDropdown?.();
      showToast(i18n.t('chatui.forkSuccess'), { type: 'success', duration: 4000 });
      }
    } catch (e) {
      showToast(i18n.t('chat.forkFailedMsg', { message: e.message }), { type: 'error', duration: 3000 });
    }
  });

  // Ctrl+F5 刷新页面（桌面端无需重启）
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'F5') {
      e.preventDefault();
      location.reload();
    }
  });
}

// RollbackPanel 接管了回滚逻辑

// ── 保存/读取最后一次会话信息到 localStorage（重启恢复用） ──
function _saveLastSessionInfo(sessionId, title, projectPath) {
  try {
    localStorage.setItem('hippo-last-session-id', sessionId);
    if (title) localStorage.setItem('hippo-last-session-title', title);
    if (projectPath) localStorage.setItem('hippo-last-session-project', projectPath);
  } catch (e) {}
}

function _readLastSessionInfo() {
  try {
    return {
      sessionId: localStorage.getItem('hippo-last-session-id'),
      title: localStorage.getItem('hippo-last-session-title'),
      projectPath: localStorage.getItem('hippo-last-session-project'),
    };
  } catch { return {}; }
}

// 模块级缓存，启动时从 localStorage 预读，用于 sessions 加载完成前的回退
let _cachedLastSessionInfo = {};

// ── 更新聊天面板标题 ──
function updateChatPanelTitle(sessionId, fallbackTitle, fallbackProject) {
  const titleEl = document.getElementById('chatPanelTitle');
  if (!titleEl) return;
  let name = sessionManager?.sessionNames?.[sessionId];
  let projectPath = null;
  if (!name) {
    const session = sessionManager?.sessions?.find(s => s.id === sessionId);
    name = session?.title;
    projectPath = session?.projectPath;
  } else {
    const session = sessionManager?.sessions?.find(s => s.id === sessionId);
    projectPath = session?.projectPath;
  }
  // 如果 sessions 还没加载完，用 fallback 或缓存值
  if (!name) name = fallbackTitle || (!sessionId || sessionId === _cachedLastSessionInfo.sessionId ? _cachedLastSessionInfo.title : null);
  if (!projectPath) projectPath = fallbackProject || (!sessionId || sessionId === _cachedLastSessionInfo.sessionId ? _cachedLastSessionInfo.projectPath : null);
  titleEl.textContent = name || 'Chat';

  // 更新项目名后缀
  const groupEl = titleEl.parentNode; // .chat-panel-title-group
  let projectEl = groupEl.querySelector('.chat-panel-project');
  if (projectPath) {
    const dirName = projectPath.replace(/\\/g, '/').split('/').filter(Boolean).pop();
    if (!projectEl) {
      projectEl = document.createElement('span');
      projectEl.className = 'chat-panel-project';
      groupEl.appendChild(projectEl);
    }
    projectEl.textContent = dirName;
  } else if (projectEl) {
    projectEl.remove();
  }
}

// ========== 会话历史下拉（模块级，供多处调用） ==========
function updateHistoryDropdown() {
  const listEl = document.getElementById('chatHistoryList');
  if (!listEl) return;

  const sessions = sessionManager.sessions || [];

  // 处理虚拟会话（新建未持久化，仅在发送过消息后显示）
  const currentInList = currentSessionId && sessions.some(s => s.id === currentSessionId);
  const allSessions = [...sessions];
  if (!currentInList && currentSessionId && sessionManager.sessionNames?.[currentSessionId]) {
    const now = String(Date.now());
    allSessions.unshift({
      id: currentSessionId,
      createdAt: now,
      lastActivityAt: now,
      _isVirtual: true
    });
  }

  if (allSessions.length === 0) {
    listEl.innerHTML = '<div class="chat-history-empty">' + i18n.t('chat.noHistory') + '</div>';
    return;
  }

  listEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const grouped = sessionManager.groupSessionsByTime(allSessions);
  let totalCount = 0;
  const MAX_ITEMS = 40;

  // 时间分类中文 → i18n key 映射
  const CATEGORY_I18N_KEYS = {
    '今天': 'session.today',
    '昨天': 'session.yesterday',
    '7天内': 'session.days7',
    '30天内': 'session.days30',
    '更早': 'session.earlier',
  };

  for (const [category, categorySessions] of Object.entries(grouped)) {
    if (categorySessions.length === 0) continue;
    if (totalCount >= MAX_ITEMS) break;

    const header = document.createElement('div');
    header.className = 'chat-history-category';
    header.textContent = CATEGORY_I18N_KEYS[category] ? i18n.t(CATEGORY_I18N_KEYS[category]) : category;
    fragment.appendChild(header);

    for (const s of categorySessions) {
      if (totalCount >= MAX_ITEMS) break;
      totalCount++;

      const name = s._isVirtual
        ? (sessionManager.sessionNames?.[currentSessionId] || i18n.t('session.namePrefix') + ' ' + currentSessionId.replace('web-', '').slice(-6))
        : (sessionManager.sessionNames?.[s.id] || s.title || i18n.t('session.namePrefix') + ' ' + s.id.replace('web-', '').slice(-6));

      const item = document.createElement('div');
      item.className = 'chat-history-item' + (s.id === currentSessionId ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'history-item-name';
      nameSpan.textContent = name;
      item.appendChild(nameSpan);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        switchSession(s.id);
        const dropdown = document.getElementById('chatHistoryDropdown');
        if (dropdown) dropdown.style.display = 'none';
      });

      fragment.appendChild(item);
    }
  }

  listEl.appendChild(fragment);
}

// ── Phase 2: 模式切换辅助函数 ─────────────────────

/** 切换到 hero 空态模式：启用 #inputContainer.hero-mode，设置占位符 */
function _switchToHeroMode() {
  const inputContainer = document.getElementById('inputContainer');
  if (inputContainer) {
    // 强制回流确保 display:none → flex 变化被浏览器识别为动画触发条件
    void inputContainer.offsetHeight;
    inputContainer.classList.add('hero-mode');
  }
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.placeholder = i18n.t('chat.heroPlaceholder');
    msgInput.value = '';
    msgInput.style.height = 'auto';
  }
  // 确保 # 静态按钮可见
  const ctxBtn = document.getElementById('contextSelectorBtn');
  if (ctxBtn) ctxBtn.style.display = '';
  // 📷 按钮由 ImageUpload.updateBtnVisibility() 根据模型视觉能力动态控制，此处不干涉
}

/** 切换到 session 模式：关闭 #inputContainer.hero-mode */
function _switchToSessionMode() {
  const inputContainer = document.getElementById('inputContainer');
  if (inputContainer) inputContainer.classList.remove('hero-mode');
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.placeholder = i18n.t('chat.placeholder');
  }
}

// ========== 会话管理 ==========
async function createNewSession() {
  // 刷新后 hero 被 skip-hero-style 隐藏了，新建会话时恢复
  document.getElementById('skip-hero-style')?.remove();

  // 保存当前会话的输入草稿（如果当前在聊天模式且有输入内容）
  const msgInput = document.getElementById('messageInput');
  const isInChatMode = !!document.querySelector('.chat-panel.has-messages');
  
  if (msgInput && isInChatMode && currentSessionId) {
    appState.saveSessionInputDraft(currentSessionId, msgInput.value);
  }
  
  // 在 hero 空态时将输入同步保存为"待定草稿"，切到聊天模式再回来也能恢复
  if (msgInput && !isInChatMode) {
    appState.saveHeroPendingDraft(msgInput.value);
  }
  
  // 从聊天模式点击新建会话时，恢复上次的 hero 待定草稿而非取当前输入框（那是历史会话的内容）
  const savedDraft = msgInput && !isInChatMode ? msgInput.value : appState.getHeroPendingDraft();

  currentSessionId = await sessionManager.createNewSession();
  appState.currentSessionId = currentSessionId; // 同步到 appState
  chatUI.clear();
  _switchToHeroMode();

  // 同步 hero 空态的模式 UI（高亮 + 标语 + 预设提示词），与全局模式保持一致
  chatPanel._syncModeUI(appState.getMode());

  // 恢复 hero 输入内容 — 直接持久化到草稿 Map 并恢复，避免 rAF 竞态
  if (savedDraft) {
    appState.saveSessionInputDraft(currentSessionId, savedDraft);
  }
  // ✨ 为新会话记录当前模式
  appState.saveSessionMode(currentSessionId, appState.mode);
  if (elements.messageInput) {
    elements.messageInput.value = savedDraft;
    elements.messageInput.style.height = savedDraft ? elements.messageInput.scrollHeight + 'px' : 'auto';
    elements.messageInput.focus();
  }
  try { localStorage.setItem('hippo-last-session-id', currentSessionId); } catch(e) {}
  updateChatPanelTitle(currentSessionId);
  updateHistoryDropdown();
  // 清空前会话的文件变更缓存
  if (fileChangeManager) fileChangeManager._lastChangeSnapshot = null;
  fileChangeManager?.updateFileChanges(currentSessionId);

  // 重置 token 状态栏显示（新会话尚无 token 数据）
  const tokenValueEl = document.getElementById('statusBarTokenValue');
  if (tokenValueEl) tokenValueEl.textContent = '0%';
  tokenMonitor.updateTokenStats();
}

async function switchSession(sessionId) {
  if (sessionId === currentSessionId) return;
  // ✨ 保存当前会话的输入草稿 + 模式（在 currentSessionId 被覆盖之前）
  if (currentSessionId && elements.messageInput) {
    const text = elements.messageInput.value;
    appState.saveSessionInputDraft(currentSessionId, text);
    // 如果当前在 hero 空态，同步保存待定草稿，方便后续回到 hero 界面时恢复
    if (!document.querySelector('.chat-panel.has-messages')) {
      appState.saveHeroPendingDraft(text);
    }
  }
  if (currentSessionId) {
    appState.saveSessionMode(currentSessionId, appState.mode);
  }
  
  // 清理残留的回滚面板
  chatContainer.querySelectorAll('.rollback-inline, .rollback-inline-loading').forEach(el => el.remove());
  
  currentSessionId = sessionId;
  sessionManager.setCurrentSession(sessionId);
  appState.currentSessionId = sessionId;
  
  // Update active state in-place — no full session list rebuild
  sessionManager.updateActiveSession(sessionId);
  
  // Fade out current chat content while loading
  chatContainer.classList.add('switching');
  
  try {
    const messages = await chatService.getSessionMessages(sessionId);
    
    if (messages.length === 0) {
      document.querySelector('.chat-panel')?.classList.remove('has-messages');
      chatContainer.classList.remove('switching');
      chatContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-logo"><span class="hippo-char"><svg viewBox="0 0 64 64" width="56" height="56"><use href="#hippoIcon"/></svg></span></div>
          <div class="empty-heading">
            <h1 class="empty-title"><span class="title-first">HippoBuddy,</span> <span class="title-last">Let's Code!</span></h1>
          </div>
          <div class="empty-mode-selector" id="heroModeSelector">
            <span class="mode-capsule hero-mode-capsule" id="heroModeCapsule">
              <button class="mode-btn" data-mode="chat" title="Chat Mode — Read-only exploration">
                <svg class="mode-icon" viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M44 7H4V37H11V42L21 37H44V7Z"/>
                  <path d="M31 16V17"/>
                  <path d="M17 16V17"/>
                  <path d="M31 25C31 25 29 29 24 29C19 29 17 25 17 25"/>
                </svg>
                Chat
              </button>
              <button class="mode-btn active" data-mode="coding" title="Code Mode — Full-stack Engineer">
                <svg class="mode-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 3.5 2 8 6 12.5"/>
                  <polyline points="10 3.5 14 8 10 12.5"/>
                </svg>
                Code
              </button>
              <button class="mode-btn" data-mode="office" title="Office Mode — Docs/Sheets/Slides">
                <svg class="mode-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
                  <path d="M9 1v4h4"/>
                  <line x1="5" y1="8" x2="11" y2="8"/>
                  <line x1="5" y1="10" x2="9" y2="10"/>
                </svg>
                Office
              </button>
            </span>
          </div>
          <div class="empty-presets" id="heroPresets"></div>
        </div>`;
      _switchToHeroMode();
      // 同步 hero 空态的模式 UI（高亮 + 标语 + 预设提示词），与全局模式保持一致
      chatPanel._syncModeUI(appState.getMode());
      // ✨ 恢复该会话的输入草稿
      if (elements.messageInput) {
        const draft = appState.getSessionInputDraft(sessionId);
        elements.messageInput.value = draft;
        elements.messageInput.style.height = 'auto';
        if (draft) {
          elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
        }
      }
    } else {
      await chatPanel.loadHistoryMessages(messages, true);
      chatContainer.classList.remove('switching');
      requestAnimationFrame(() => {
        chatContainer.querySelectorAll('.message-row.animate-in').forEach(el => el.classList.remove('animate-in'));
      });
      document.querySelector('.chat-panel')?.classList.add('has-messages');
      _switchToSessionMode();
      // ✨ 恢复该会话的输入草稿
      if (elements.messageInput) {
        const draft = appState.getSessionInputDraft(sessionId);
        elements.messageInput.value = draft;
        elements.messageInput.style.height = 'auto';
        if (draft) {
          elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
        }
      }
    }
    
    // ✨ 恢复该会话的模式（优先用后端返回的，再查内存 Map）
    const sessionData = sessionManager?.sessions?.find(s => s.id === sessionId);
    const sessionMode = sessionData?.mode || appState.getSessionMode(sessionId);
    if (sessionMode && sessionMode !== appState.mode) {
      appState.setMode(sessionMode);
      chatPanel._syncModeUI(sessionMode);
      // 同步到内存 Map，后续 getSessionMode 直接命中
      appState.saveSessionMode(sessionId, sessionMode);
    }
    
    // 保存为上次活跃会话
    const _title = sessionManager?.sessionNames?.[sessionId];
    const _session = sessionManager?.sessions?.find(s => s.id === sessionId);
    _saveLastSessionInfo(sessionId, _title || _session?.title, _session?.projectPath);
    updateChatPanelTitle(sessionId);
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    // 刷新文件变更列表（后端已在 handleGetMessages 中加载了目标会话的变更）
    // 重置文件变更快照，确保不会触发不必要的文件树刷新
    if (fileChangeManager) fileChangeManager._lastChangeSnapshot = null;
    fileChangeManager?.updateFileChanges(sessionId);

    // 🆕 检查会话的 Agent 是否还在后台运行，如果是则轮询等待完成
    checkSessionRunning(sessionId).catch(() => {});
  } catch (e) {
    document.querySelector('.chat-panel')?.classList.remove('has-messages');
    chatContainer.classList.remove('switching');
    updateChatPanelTitle(sessionId);
    chatContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-logo"><span class="hippo-char"><svg viewBox="0 0 64 64" width="56" height="56"><use href="#hippoIcon"/></svg></span></div>
        <div class="empty-heading">
          <h1 class="empty-title"><span class="title-first">HippoBuddy,</span> <span class="title-last">Let's Code!</span></h1>
        </div>
        <div class="empty-mode-selector" id="heroModeSelector">
          <span class="mode-capsule hero-mode-capsule" id="heroModeCapsule">
            <button class="mode-btn" data-mode="chat" title="Chat Mode — Read-only exploration">
              <svg class="mode-icon" viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M44 7H4V37H11V42L21 37H44V7Z"/>
                <path d="M31 16V17"/>
                <path d="M17 16V17"/>
                <path d="M31 25C31 25 29 29 24 29C19 29 17 25 17 25"/>
              </svg>
              Chat
            </button>
            <button class="mode-btn active" data-mode="coding" title="Code Mode — Full-stack Engineer">
              <svg class="mode-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 3.5 2 8 6 12.5"/>
                <polyline points="10 3.5 14 8 10 12.5"/>
              </svg>
              Code
            </button>
            <button class="mode-btn" data-mode="office" title="Office Mode — Docs/Sheets/Slides">
              <svg class="mode-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
                <path d="M9 1v4h4"/>
                <line x1="5" y1="8" x2="11" y2="8"/>
                <line x1="5" y1="10" x2="9" y2="10"/>
              </svg>
              Office
            </button>
          </span>
        </div>
        <div class="empty-presets" id="heroPresets"></div>
      </div>`;
    _switchToHeroMode();
    // 同步 hero 空态的模式 UI（高亮 + 标语 + 预设提示词），与全局模式保持一致
    chatPanel._syncModeUI(appState.getMode());
  }
  
  requestAnimationFrame(() => {
    const es = chatContainer.querySelector('.empty-state');
    if (es) {
      es.classList.add('animate');
      setTimeout(() => es.classList.remove('animate'), 1000);
    }
  });
  elements.messageInput?.focus();
  updateHistoryDropdown();
}


async function loadPromptPresets() {
  try {
    const data = await apiGet('/api/system-prompts/presets');
    promptPresets = data.presets || [];
    renderPromptModeBar();
  } catch (e) {
    console.error('加载预设失败:', e);
  }
}

function renderPromptModeBar() {
  if (!elements.promptModeOptions) return;
  
  elements.promptModeOptions.innerHTML = '';
  for (const preset of promptPresets) {
    const btn = document.createElement('button');
    btn.className = 'prompt-mode-btn' + (preset.id === selectedPresetId ? ' active' : '');
    btn.textContent = preset.name;
    btn.title = preset.description;
    btn.dataset.presetId = preset.id;
    btn.addEventListener('click', () => selectPreset(preset.id));
    elements.promptModeOptions.appendChild(btn);
  }
  applySelectedPreset();
}

function selectPreset(presetId) {
  selectedPresetId = presetId;
  appState.setState('selectedPresetId', presetId);
  document.querySelectorAll('.prompt-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.presetId === presetId);
  });
  applySelectedPreset();
}

function applySelectedPreset() {
  const preset = promptPresets.find(p => p.id === selectedPresetId);
  if (preset) {
    currentSystemPrompt = preset.id === 'default' ? null : preset.prompt;
    if (elements.promptModalText) {
      elements.promptModalText.value = preset.prompt;
    }
  }
}

function closePromptModal() {
  if (elements.promptModal) {
    elements.promptModal.style.display = 'none';
  }
}

// ========== 压缩会话 ==========
async function handleCompact() {
  const instruction = prompt(i18n.t('chat.compactHint'));
  
  if (instruction === null) return;
  
  try {
    elements.compactBtn.disabled = true;
    elements.compactBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      </svg>
    `;
    
    const result = await chatService.compactSession(currentSessionId, instruction || null);
    
    if (result.success) {
      showToast(i18n.t('chatui.compactSuccess', {
        method: result.method,
        originalCount: result.originalCount,
        compactedCount: result.compactedCount,
        reducedCount: result.reducedCount,
        savedTokens: result.savedTokens.toLocaleString(),
        savedPercent: result.savedPercent,
        summary: result.summary
      }), 'success', 8000);
      await tokenMonitor.updateTokenStats();
    }
  } catch (error) {
    showToast(i18n.t('chatui.compactFailed', { message: error.message }), 'error');
    console.error('压缩会话失败:', error);
  } finally {
    elements.compactBtn.disabled = false;
    elements.compactBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 14h6m0 0v6m0-6l-6 6M20 10h-6m0 0V4m0 6l6-6"/>
      </svg>
    `;
  }
}

/**
 * 检查会话的 Agent 是否还在后台运行。
 * 如果是，显示提示并轮询等待完成，完成后自动刷新消息。
 */
async function checkSessionRunning(sessionId) {
  try {
    const status = await chatService.getSessionStatus(sessionId);
    if (!status.running) return;

    // 用 toast 提示用户
    showToast(window.i18n.t('chatui.sessionExecuting'), { type: 'info', duration: 0 });

    // 轮询等待完成
    const completed = await chatService.waitForSessionComplete(sessionId, (messages) => {
      // 有新消息时增量更新前端
      chatPanel.loadHistoryMessages(messages, true);
    });
    // 先清除旧的 toast
    document.querySelectorAll('.toast').forEach(el => el.remove());
    if (completed) {
      // 加载完成后的最新消息
      const finalMessages = await chatService.getSessionMessages(sessionId);
      await chatPanel.loadHistoryMessages(finalMessages, true);
      showToast(window.i18n.t('chatui.executionComplete'), { type: 'success', duration: 3000 });
    }
  } catch (e) {
    console.warn('检查会话运行状态失败:', e);
  }
}

// ========== 导出对话 ==========
async function exportConversation() {
  if (!currentSessionId) {
      showToast(i18n.t('chat.noExport'), { type: 'warning', duration: 2000 });
    return;
  }

  const exportBtn = elements.exportBtn;
  const originalText = exportBtn.innerHTML;
  exportBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
    </svg>
    ${i18n.t('chat.loading')}
  `;
  exportBtn.disabled = true;

  try {
    const messages = await chatService.getSessionMessages(currentSessionId);

    if (!messages || messages.length === 0) {
      showToast(i18n.t('chat.noMessages'), { type: 'warning', duration: 2000 });
      return;
    }

    const sessionName = sessionManager.sessionNames?.[currentSessionId] || i18n.t('session.defaultName');

    if (!confirm(i18n.t('chat.exportConfirm', { name: sessionName, count: messages.length }))) {
      return;
    }
    const now = new Date();
    const timeStr = now.toLocaleString(i18n.currentLang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const markdownLines = [
      `# ${sessionName}`,
      ``,
      i18n.t('chat.exportHeader', { time: timeStr }),
      i18n.t('chat.exportMessageCount', { count: messages.length }),
      ``,
      `---`,
      ``
    ];

    const toolResults = {};
    for (const msg of messages) {
      if ((msg.role === 'tool' || msg.role === 'tool-result') && msg.toolCallId) {
        toolResults[msg.toolCallId] = msg;
      }
    }

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'tool' || msg.role === 'tool-result') {
        i++;
        continue;
      }

      if (msg.role === 'user') {
        if (msg.content && msg.content.trim()) {
          markdownLines.push(i18n.t('chat.exportUserLabel'));
          markdownLines.push(``);
          markdownLines.push(msg.content);
          markdownLines.push(``);
        }
        i++;
        continue;
      }

      if (msg.role === 'assistant') {
        let text = '';
        let hasToolCalls = false;

        while (i < messages.length) {
          const am = messages[i];
          if (am.role === 'tool' || am.role === 'tool-result') {
            i++;
            continue;
          }
          if (am.role !== 'assistant') break;

          const amText = am.content || '';
          const amToolCalls = am.tool_calls && am.tool_calls.length > 0;

          if (amText.trim() && !amToolCalls) {
            if (text.trim()) {
              markdownLines.push(i18n.t('chat.exportAssistantLabel'));
              markdownLines.push(``);
              markdownLines.push(text);
              markdownLines.push(``);
            }
            text = amText;
            i++;
            break;
          }

          if (text.trim()) {
            markdownLines.push(i18n.t('chat.exportAssistantLabel'));
            markdownLines.push(``);
            markdownLines.push(text);
            markdownLines.push(``);
            text = '';
          }

          if (amText.trim()) {
            text = amText;
          }

          if (amToolCalls) {
            if (text.trim()) {
              markdownLines.push(i18n.t('chat.exportAssistantLabel'));
              markdownLines.push(``);
              markdownLines.push(text);
              markdownLines.push(``);
              text = '';
            }

            for (const tc of am.tool_calls) {
              hasToolCalls = true;
              const toolName = tc.name || tc.function?.name || 'unknown';
              const args = tc.arguments || tc.function?.arguments || '{}';
              const parsedArgs = (() => {
                try {
                  return typeof args === 'string' ? JSON.parse(args) : args;
                } catch { return args; }
              })();

              const tr = toolResults[tc.id];
              const isSuccess = tr?.success !== false;
              const statusIcon = isSuccess ? '✅' : '❌';

              let toolArgsText = '';
              if (typeof parsedArgs === 'object' && parsedArgs !== null) {
                const entries = Object.entries(parsedArgs);
                toolArgsText = entries.map(([k, v]) => {
                  const val = typeof v === 'string' && v.length > 200 ? v.substring(0, 200) + '...' : v;
                  return `  - ${k}: ${val}`;
                }).join('\n');
              }

              markdownLines.push(`### 🔧 ${toolName} ${statusIcon}`);
              if (toolArgsText) {
                markdownLines.push(``);
                markdownLines.push(toolArgsText);
              }
              if (tr?.error) {
                markdownLines.push(i18n.t('chat.exportErrorLabel', { message: tr.error }));
              }
              markdownLines.push(``);
            }
          }
          i++;
        }

        if (text.trim()) {
          markdownLines.push(i18n.t('chat.exportAssistantLabel'));
          markdownLines.push(``);
          markdownLines.push(text);
          markdownLines.push(``);
        }

        if (!hasToolCalls && !text.trim()) {
          markdownLines.push(i18n.t('chat.exportAssistantLabel'));
          markdownLines.push(``);
          markdownLines.push(i18n.t('chat.exportEmptyResponse'));
          markdownLines.push(``);
        }

        continue;
      }

      i++;
    }

    const content = markdownLines.join('\n');
    const filename = `${sessionName.replace(/[\\/:*?"<>|]/g, '_')}_${now.toISOString().slice(0, 10)}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(i18n.t('chat.exportSuccess', { filename }), { type: 'success', duration: 3000 });
  } catch (e) {
    showToast(i18n.t('chat.exportFailed', { message: e.message }), { type: 'error', duration: 3000 });
    console.error('导出对话失败:', e);
  } finally {
    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;
  }
}

const MODEL_CONFIG_CACHE_KEY = 'hippo_model_config';

/** 从 localStorage 加载缓存的模型配置 */
function loadModelConfigFromCache() {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('读取模型配置缓存失败:', e);
    return null;
  }
}

/** 保存模型配置到 localStorage 缓存 */
function saveModelConfigToCache(data) {
  try {
    localStorage.setItem(MODEL_CONFIG_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('保存模型配置缓存失败:', e);
  }
}

/** 用配置数据刷新状态栏「模型 + 思考强度」复合选择面板 */
function applyModelConfigToDropdown(data) {
  modelSelectorPanel?.update(data);
}

/** 保存思考强度（PUT /api/config/llm，携带 reasoningEffort 走完整保存分支，不覆盖其他字段） */
async function saveQuickEffort(provider, model, effort) {
  try {
    const resp = await fetch('/api/config/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, reasoningEffort: effort })
    });
    if (!resp.ok) throw new Error(await resp.text());
    showToast(window.i18n.t('chatui.effortSwitched', {
      effort: effort || window.i18n.t('chatui.effortDefaultLabel')
    }), 'success');
    // 后台刷新下拉框及缓存（含历史快照里的新 effort），失败时也会把按钮文本刷回旧值
    loadQuickModelConfig();
  } catch (e) {
    console.warn('切换思考强度失败:', e);
    showToast(window.i18n.t('chatui.effortSwitchFailed', { message: e.message }), 'error');
    loadQuickModelConfig();
  }
}

// ========== 状态栏「模型 + 思考强度」复合选择面板 ==========
const modelQuickSelectTrigger = document.getElementById('modelQuickSelect');
const modelSelectorPanel = new ModelSelectorPanel({
  trigger: modelQuickSelectTrigger,
  onModelSelect: (provider, model) => saveQuickModelConfig(provider, model),
  onAddModel: () => {
    window.settingsPanel.open();
    setTimeout(() => loadQuickModelConfig(), 100);
  },
  onEffortSelect: (provider, model, effort) => saveQuickEffort(provider, model, effort),
});

/** 加载当前配置并同步到快速选择器（缓存优先 + 后台刷新） */
async function loadQuickModelConfig() {
  // 1. 缓存优先：立即展示
  const cached = loadModelConfigFromCache();
  if (cached) {
    applyModelConfigToDropdown(cached);
  }

  // 2. 后台异步请求最新数据
  try {
    const data = await apiGet('/api/config/llm');
    saveModelConfigToCache(data);
    applyModelConfigToDropdown(data);
    // 通知图片按钮等组件检查模型视觉能力（解决刷新后 📷 按钮不出现的问题）
    EventBus.emit('config:model-changed');
  } catch (e) {
    console.warn('加载模型配置失败:', e);
    // 缓存已有数据，静默失败即可
  }
}

/** 保存模型配置（快捷切换） */
async function saveQuickModelConfig(provider, model) {
  try {
    const resp = await fetch('/api/config/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model })
    });
    if (!resp.ok) throw new Error(await resp.text());
    showToast(i18n.t('chatui.modelSwitched', { provider, model }), 'success');
    // 乐观更新缓存，确保依赖 localStorage 的组件（如图片按钮）能立即读到新模型
    saveModelConfigToCache({ provider, model });
    // 通知图片按钮等组件检查模型视觉能力
    EventBus.emit('config:model-changed');
    // 后台刷新下拉框及完整缓存（含历史记录等）
    loadQuickModelConfig();
  } catch (e) {
    showToast(i18n.t('chatui.modelSwitchFailed', { message: e.message }), 'error');
    loadQuickModelConfig();
  }
}

// 暴露到全局，供 SettingsPanel 等模块组件在关闭时刷新下拉框
window.loadQuickModelConfig = loadQuickModelConfig;

// ========== 桌面端自动更新 ==========

/**
 * 初始化桌面端自动更新 UI（仅 Electron 桌面端生效）。
 *
 * 生命周期：发现新版本 → 弹更新卡片 → 用户点"立即更新" → 下载进度条
 *          → 下载完成 → "重启安装" → 重启应用完成更新。
 *
 * 事件来源：主进程 electron/main.js 通过 IPC 推送；
 * 静默规则：启动自动检查的失败/无新版事件已在主进程抑制，这里只会收到
 *          "发现新版本" 与手动检查（托盘"检查更新"）的反馈事件。
 */
function initAutoUpdater() {
  const HippoDesktop = window.HippoDesktop;
  if (!HippoDesktop || !HippoDesktop.isAvailable) return;

  let card = null;
  let dismissed = false;   // 用户点"稍后"/× 关闭"发现新版本"卡片后，本次会话不再弹出
  let downloading = false; // 是否处于下载中（用于区分错误提示文案）
  let background = false;  // 下载中用户关闭卡片 → 下载转后台，完成后仅靠系统通知提醒
  let state = null;        // 'available' | 'downloading' | 'downloaded'，用于 × 按钮行为分流

  /** 创建（或复用）更新卡片 DOM */
  function ensureCard() {
    if (card && document.body.contains(card)) return card;
    card = document.createElement('div');
    card.id = 'hippoUpdateCard';
    card.className = 'update-card';
    card.innerHTML = `
      <button type="button" class="update-card-close" aria-label="关闭" title="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="update-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9"/>
          <path d="M21 3v6h-6"/>
        </svg>
      </div>
      <div class="update-card-body">
        <div class="update-card-title"></div>
        <div class="update-card-desc"></div>
        <div class="update-card-progress" style="display:none">
          <div class="update-card-progress-track"><div class="update-card-progress-fill"></div></div>
          <span class="update-card-progress-text">0%</span>
        </div>
        <div class="update-card-actions"></div>
      </div>
    `;
    // 右上角 ×：根据当前状态决定行为
    //   available   → 同【稍后】：本次会话不再弹出
    //   downloading → 关闭卡片，下载转后台继续（系统通知在完成时提醒）
    //   downloaded  → 暂不安装，关闭卡片（主进程已持久化待安装标志，下次启动再提示）
    const closeBtn = card.querySelector('.update-card-close');
    closeBtn.addEventListener('click', () => {
      if (state === 'downloading') {
        // 不取消下载：卡片关闭但下载继续，完成后由系统通知提醒用户
        background = true;
        removeCard();
        return;
      }
      if (state === 'available') dismissed = true;
      removeCard();
    });
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));
    return card;
  }

  /** 移除卡片（带淡出动画） */
  function removeCard() {
    if (!card) return;
    const el = card;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
    card = null;
  }

  /** 设置卡片操作按钮（actions 为空则清空按钮区） */
  function setActions(actions) {
    const host = card.querySelector('.update-card-actions');
    host.innerHTML = '';
    actions.forEach(({ label, primary, onClick }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = primary ? 'update-btn update-btn-primary' : 'update-btn update-btn-ghost';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      host.appendChild(btn);
    });
  }

  /** 开始下载更新 */
  function startDownload() {
    state = 'downloading';
    downloading = true;
    setActions([]);
    HippoDesktop.downloadUpdate().catch(() => {
      // 错误提示统一走 onUpdateError 事件；这里仅兜底复位
      downloading = false;
      removeCard();
    });
  }

  // ---------- 注册事件 ----------

  // 发现新版本 → 弹出更新卡片
  HippoDesktop.onUpdateAvailable((info) => {
    if (dismissed) return;
    state = 'available';
    const c = ensureCard();
    c.querySelector('.update-card-title').textContent =
      i18n.t('updater.newVersion', { version: info?.version });
    c.querySelector('.update-card-desc').textContent = _formatReleaseNotes(info?.releaseNotes);
    c.querySelector('.update-card-progress').style.display = 'none';
    setActions([
      { label: i18n.t('updater.later'), onClick: () => { dismissed = true; removeCard(); } },
      { label: i18n.t('updater.download'), primary: true, onClick: startDownload },
    ]);
  });

  // 下载进度 → 进度条
  HippoDesktop.onUpdateDownloadProgress((p) => {
    state = 'downloading';
    downloading = true;
    const c = ensureCard();
    c.querySelector('.update-card-title').textContent = i18n.t('updater.downloading');
    c.querySelector('.update-card-desc').textContent = '';
    const progress = c.querySelector('.update-card-progress');
    progress.style.display = '';
    const percent = Math.min(100, Math.max(0, Math.round(p?.percent || 0)));
    c.querySelector('.update-card-progress-fill').style.width = percent + '%';
    c.querySelector('.update-card-progress-text').textContent = percent + '%';
    setActions([]);
  });

  // 下载完成 → 提示重启安装
  HippoDesktop.onUpdateDownloaded((info) => {
    state = 'downloaded';
    downloading = false;
    // 用户此前关闭了下载中卡片（后台下载）：不再自动弹卡片，
    // 由主进程的系统通知提醒；用户点击通知后主进程会再次推送本事件 → 此时正常弹卡片。
    if (background) {
      background = false;
      return;
    }
    const c = ensureCard();
    c.querySelector('.update-card-title').textContent = i18n.t('updater.downloadReady');
    c.querySelector('.update-card-desc').textContent = info?.version ? `v${info.version}` : '';
    c.querySelector('.update-card-progress').style.display = 'none';
    setActions([
      {
        label: i18n.t('updater.restart'),
        primary: true,
        onClick: () => HippoDesktop.quitAndInstall(),
      },
    ]);
  });

  // 手动检查：正在检查
  HippoDesktop.onUpdateChecking(() => {
    showBottomToast(i18n.t('updater.checking'));
  });

  // 手动检查：已是最新版本
  HippoDesktop.onUpdateNotAvailable(() => {
    showBottomToast(i18n.t('updater.upToDate'));
  });

  // 检查/下载出错 → toast 提示（自动检查失败已在主进程静默，不会走到这里）
  HippoDesktop.onUpdateError((msg) => {
    const key = downloading ? 'updater.downloadFailed' : 'updater.checkFailed';
    downloading = false;
    state = null;
    background = false;
    showToast(i18n.t(key, { message: msg || 'unknown' }), {
      type: 'error',
      duration: 5000,
    });
    removeCard();
  });
}

/** 将 electron-updater 的 releaseNotes 转成纯文本（可能是字符串或对象数组） */
function _formatReleaseNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.slice(0, 160);
  if (Array.isArray(notes)) {
    const first = notes[0];
    if (typeof first === 'string') return first.slice(0, 160);
    if (first && typeof first === 'object') {
      // 形如 { language, nodes: [{ text }] }
      const text = first.nodes?.map((n) => n.text || '').join('') || '';
      return text.slice(0, 160);
    }
  }
  return '';
}

// ========== 启动应用 ==========
init();
