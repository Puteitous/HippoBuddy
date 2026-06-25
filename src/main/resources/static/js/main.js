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
import { ChatPanel } from './components/ChatPanel.js';
import { ChatNav } from './components/ChatNav.js';
import { TokenMonitor } from './components/TokenMonitor.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { SSEClient } from './sse-client.js';
import { diffModalManager } from './utils/diff-modal.js';
import { FileChangeManager } from './utils/file-change-manager.js';
import { EventBus } from './utils/event-bus.js';
import { showToast } from './utils/toast.js';
import { generateSessionId, apiGet, apiPost } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { SplashScreen } from './components/SplashScreen.js';
import { RollbackPanel } from './components/RollbackPanel.js';
import { initSelectionActions } from './components/selection-actions.js';
import { ActivityBar } from './components/ActivityBar.js';
import { SkillPanel } from './components/skill-panel.js';
import { RulesPanel } from './components/RulesPanel.js';
import { CustomDropdown } from './utils/dropdown.js';
import { ConfirmDialog } from './utils/modal.js';

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
let splashScreen;
let rollbackPanel;
let activityBar;

// ========== DOM 元素 ==========
const elements = {
  themeToggle: document.getElementById('themeToggle'),
  sseStatus: document.getElementById('sseStatus'),
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

// SplashScreen 接管了启动动画控制

// ========== 初始化 ==========
function init() {
  console.log('🚀 Initializing Hippo Cockpit...');
  
  // 0. 启动 splash 出水动画（与初始化并行）
  splashScreen = new SplashScreen();
  splashScreen.startAnimation();
  
  // 0.1 初始化 Activity Bar
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

  // 注册技能面板
  if (activityBar) {
    let skillPanelInstance = null;
    activityBar.registerPanel('skills', () => {
      if (!skillPanelInstance) {
        skillPanelInstance = new SkillPanel();
      }
      return skillPanelInstance.render();
    });
    activityBar.onPanelOpen('skills', () => {
      if (skillPanelInstance) {
        skillPanelInstance._loadSkills();
      }
    });
  }

  // 注册规则面板
  if (activityBar) {
    let rulesPanelInstance = null;
    activityBar.registerPanel('rules', () => {
      if (!rulesPanelInstance) {
        rulesPanelInstance = new RulesPanel();
      }
      return rulesPanelInstance.render();
    });
    activityBar.onPanelOpen('rules', () => {
      if (rulesPanelInstance) {
        rulesPanelInstance._loadRules();
      }
    });
  }

  // 1. 初始化主题
  initTheme();
  
  // 2. 初始化会话管理器
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
  
  // 7. 初始化 SSE 连接
  initSSE();
  
  // 7. 初始化文件变更监控
  fileChangeManager = new FileChangeManager();
  fileChangeManager.init();

  // 7.1 初始化文本选中快捷操作
  initSelectionActions();

  // 7.2 加载当前模型配置到快速切换器
  loadQuickModelConfig();

  // 8. 绑定全局事件
  bindGlobalEvents();
  
  // 9. 加载预设提示词
  loadPromptPresets();
  
  // 10. 尝试恢复上次会话，否则创建新会话
  (async () => {
    const lastSessionId = (() => {
      try { return localStorage.getItem('hippo-last-session-id'); } catch { return null; }
    })();
    if (lastSessionId) {
      try {
        const messages = await chatService.getSessionMessages(lastSessionId);
        if (messages && messages.length > 0) {
          await switchSession(lastSessionId);
          sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
          return;
        }
      } catch (e) {
        console.warn('恢复上次会话失败，创建新会话:', e);
      }
    }
    currentSessionId = generateSessionId();
    sessionManager.setCurrentSession(currentSessionId);
    appState.currentSessionId = currentSessionId;
    sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
    updateChatPanelTitle(currentSessionId);
  })();
  
  // 11. 启动自动更新
  tokenMonitor.startAutoUpdate(30000);
  metricsPanel.startAutoUpdate(10000);
  
  // 12. 初始化趋势图
  tokenMonitor.renderTrendChart();
  
  // 13. 订阅事件
  EventBus.on('message:sent', () => {
    chatService.invalidateMessageCache(appState.currentSessionId);
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    fileChangeManager.updateFileChanges(appState.currentSessionId);
  });
  
  EventBus.on('session:auto-name', ({ sessionId }) => {
    if (sessionId && sessionManager) {
      if (!sessionManager.sessionNames || !sessionManager.sessionNames[sessionId]) {
        sessionManager.setSessionName(sessionId, '新会话');
        sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
      }
    }
  });

  // 接收 AI 生成的标题，局部更新 DOM（不重刷列表）
  EventBus.on('session:title-updated', ({ sessionId, title }) => {
    if (sessionId && sessionManager && title) {
      sessionManager.updateSessionTitle(sessionId, title);
      if (sessionId === currentSessionId) updateChatPanelTitle(sessionId);
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

  // 15. 安排 splash 结束 + 页面内容渐入
  splashScreen.scheduleCleanup();
  
  console.log('✅ Hippo Cockpit initialized');
}

const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

// ========== 主题管理 ==========
function initTheme() {
  const savedTheme = appState.getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle.innerHTML = savedTheme === 'dark' ? ICON_SUN : ICON_MOON;
  applyHljsTheme(savedTheme);
}

function applyHljsTheme(theme) {
  const lightSheet = document.getElementById('hljs-light-theme');
  const darkSheet = document.getElementById('hljs-dark-theme');
  
  if (theme === 'dark') {
    lightSheet.disabled = true;
    darkSheet.disabled = false;
  } else {
    lightSheet.disabled = false;
    darkSheet.disabled = true;
  }
}

// ========== SSE 连接 ==========
let sseClient;

function initSSE() {
  sseClient = new SSEClient('/sse/memory-events');
  sseClient.connect();
  
  sseClient.onOpen(() => {
    if (elements.sseStatus) {
      elements.sseStatus.className = 'sse-status connected';
      elements.sseStatus.textContent = 'SSE 已连接';
    }
  });
  
  sseClient.onError((attempts) => {
    if (elements.sseStatus) {
      elements.sseStatus.className = 'sse-status disconnected';
      if (attempts >= sseClient.maxReconnectAttempts) {
        elements.sseStatus.textContent = '连接失败，请刷新页面';
      } else {
        elements.sseStatus.textContent = `SSE 断开，重连中 (${attempts}/${sseClient.maxReconnectAttempts})`;
      }
    }
  });
}

// ========== 全局事件绑定 ==========
function bindGlobalEvents() {
  // 主题切换
  elements.themeToggle?.addEventListener('click', () => {
    const next = appState.toggleTheme();
    document.documentElement.setAttribute('data-theme', next);
    elements.themeToggle.innerHTML = next === 'dark' ? ICON_SUN : ICON_MOON;
    applyHljsTheme(next);
  });

  
  // 聊天面板头部 - 新建会话
  document.getElementById('chatNewBtn')?.addEventListener('click', createNewSession);
  
  // 工作区清除由 workspace-manager.js 处理，此处不再重复绑定

  // 实时保存 hero 界面输入（通过事件委托，因为 heroInput 会动态创建和销毁）
  chatContainer.addEventListener('input', (e) => {
    if (e.target.id === 'heroInput') {
      appState.heroDraft = e.target.value;
    }
  });

  // hero 模型选择按钮（与底部栏共享同一个 modelDropdown 实例）
  chatContainer.addEventListener('click', (e) => {
    const heroTrigger = e.target.closest('#heroModelQuickSelect');
    if (heroTrigger && modelDropdown) {
      e.preventDefault();
      const origTrigger = modelDropdown._trigger;
      modelDropdown._trigger = heroTrigger;
      modelDropdown.toggle();
      modelDropdown._trigger = origTrigger;
    }
  });
  
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
  const statusBarItems = document.querySelectorAll('.status-bar-item');
  statusBarItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (!section || !activityBar) return;
      
      // 映射 data-section → Activity Bar 面板名
      const panelMap = { token: 'token', monitor: 'monitor', files: 'files' };
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
      showToast('无法确定分叉位置的消息 ID', { type: 'error', duration: 3000 });
      return;
    }

    try {
      const forkResult = await chatService.forkSession(currentSessionId, messageId);
      if (forkResult.newSessionId) {
        await switchSession(forkResult.newSessionId);
        await sessionManager.loadSessions();
        updateHistoryDropdown?.();
        showToast('已分叉为新会话', { type: 'success', duration: 4000 });
      }
    } catch (e) {
      showToast(`分叉失败：${e.message}`, { type: 'error', duration: 3000 });
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

// ── 更新聊天面板标题 ──
function updateChatPanelTitle(sessionId) {
  const titleEl = document.getElementById('chatPanelTitle');
  if (!titleEl) return;
  let name = sessionManager?.sessionNames?.[sessionId];
  if (!name) {
    const session = sessionManager?.sessions?.find(s => s.id === sessionId);
    name = session?.title;
  }
  titleEl.textContent = name || '聊天';
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
    allSessions.unshift({
      id: currentSessionId,
      createdAt: String(Date.now()),
      _isVirtual: true
    });
  }

  if (allSessions.length === 0) {
    listEl.innerHTML = '<div class="chat-history-empty">暂无历史会话</div>';
    return;
  }

  listEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const grouped = sessionManager.groupSessionsByTime(allSessions);
  let totalCount = 0;
  const MAX_ITEMS = 40;

  for (const [category, categorySessions] of Object.entries(grouped)) {
    if (categorySessions.length === 0) continue;
    if (totalCount >= MAX_ITEMS) break;

    const header = document.createElement('div');
    header.className = 'chat-history-category';
    header.textContent = category;
    fragment.appendChild(header);

    for (const s of categorySessions) {
      if (totalCount >= MAX_ITEMS) break;
      totalCount++;

      const name = s._isVirtual
        ? (sessionManager.sessionNames?.[currentSessionId] || ('会话 ' + currentSessionId.replace('web-', '').slice(-6)))
        : (sessionManager.sessionNames?.[s.id] || s.title || ('会话 ' + s.id.replace('web-', '').slice(-6)));

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

// ========== 会话管理 ==========
async function createNewSession() {
  currentSessionId = await sessionManager.createNewSession();
  appState.currentSessionId = currentSessionId; // 同步到 appState
  chatUI.clear();
  chatPanel?.reInjectContextSelector();

  // 恢复 hero 输入内容（appState.heroDraft 由 input 事件实时保存）
  if (appState.heroDraft) {
    requestAnimationFrame(() => {
      const newHeroInput = document.getElementById('heroInput');
      if (newHeroInput) {
        newHeroInput.value = appState.heroDraft;
      }
    });
  }

  if (elements.messageInput) {
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.messageInput.focus();
  }
  try { localStorage.setItem('hippo-last-session-id', currentSessionId); } catch(e) {}
  updateChatPanelTitle(currentSessionId);
  updateHistoryDropdown();
  // 清空前会话的文件变更缓存
  if (fileChangeManager) fileChangeManager._lastChangeSnapshot = null;
  fileChangeManager?.updateFileChanges(currentSessionId);
}

async function switchSession(sessionId) {
  if (sessionId === currentSessionId) return;
  
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
          <div class="empty-hero-logo"><span class="hippo-char">🦛</span></div>
          <h1 class="empty-hero-title">HippoBuddy</h1>
          <p class="empty-hero-subtitle">你的 AI 桌面伙伴</p>
          <div class="empty-hero-input-area">
            <div class="hero-input-wrapper">
              <div class="empty-hero-input-refs" id="heroInputRefs"></div>
              <textarea class="empty-hero-input" id="heroInput" placeholder="问点什么..." rows="1"></textarea>
            </div>
            <div class="hero-input-actions">
              <div class="hero-input-actions-left" id="heroContextSelector">
                <span class="hero-actions-divider"></span>
                <button class="dd-trigger model-dropdown-trigger" id="heroModelQuickSelect">加载中...</button>
              </div>
              <button class="hero-send-btn" id="heroSendBtn" title="发送">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="15" x2="8" y2="1"/>
                  <polyline points="2 7 8 1 14 7"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="empty-hero-suggestions">
            <button class="empty-hero-suggestion" data-prompt="分析一下这个项目的结构和主要功能">分析项目结构</button>
            <button class="empty-hero-suggestion" data-prompt="解释当前代码的工作原理">解释代码</button>
            <button class="empty-hero-suggestion" data-prompt="为这段代码生成单元测试">生成测试</button>
          </div>
          <div>Enter 发送 · Shift+Enter 换行</div>
        </div>`;
      chatPanel?.reInjectContextSelector();
      if (elements.messageInput) {
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
      }
    } else {
      await chatPanel.loadHistoryMessages(messages, true);
      chatContainer.classList.remove('switching');
      requestAnimationFrame(() => {
        chatContainer.querySelectorAll('.message-row.animate-in').forEach(el => el.classList.remove('animate-in'));
      });
      document.querySelector('.chat-panel')?.classList.add('has-messages');
    }
    
    // 保存为上次活跃会话
    try { localStorage.setItem('hippo-last-session-id', sessionId); } catch(e) {}
    updateChatPanelTitle(sessionId);
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    // 刷新文件变更列表（后端已在 handleGetMessages 中加载了目标会话的变更）
    // 重置文件变更快照，确保不会触发不必要的文件树刷新
    if (fileChangeManager) fileChangeManager._lastChangeSnapshot = null;
    fileChangeManager?.updateFileChanges(sessionId);
  } catch (e) {
    document.querySelector('.chat-panel')?.classList.remove('has-messages');
    chatContainer.classList.remove('switching');
    updateChatPanelTitle(sessionId);
    chatContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-hero-logo"><span class="hippo-char">🦛</span></div>
        <h1 class="empty-hero-title">HippoBuddy</h1>
        <p class="empty-hero-subtitle">你的 AI 桌面伙伴</p>
        <div class="empty-hero-input-area">
          <div class="hero-input-wrapper">
            <div class="empty-hero-input-refs" id="heroInputRefs"></div>
            <textarea class="empty-hero-input" id="heroInput" placeholder="问点什么..." rows="1"></textarea>
          </div>
          <div class="hero-input-actions">
            <div class="hero-input-actions-left" id="heroContextSelector">
              <span class="hero-actions-divider"></span>
              <button class="dd-trigger model-dropdown-trigger" id="heroModelQuickSelect">加载中...</button>
            </div>
            <button class="hero-send-btn" id="heroSendBtn" title="发送">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="15" x2="8" y2="1"/>
              <polyline points="2 7 8 1 14 7"/>
            </svg>
          </button>
          </div>
        </div>
      <div class="empty-hero-suggestions">
        <button class="empty-hero-suggestion" data-prompt="分析一下这个项目的结构和主要功能">分析项目结构</button>
        <button class="empty-hero-suggestion" data-prompt="解释当前代码的工作原理">解释代码</button>
        <button class="empty-hero-suggestion" data-prompt="为这段代码生成单元测试">生成测试</button>
      </div>
    </div>`;
    chatPanel?.reInjectContextSelector();
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
  const instruction = prompt('输入压缩指令（可选）：\n\n例如："保留所有代码示例"、"只保留重要信息"\n\n留空则自动智能压缩');
  
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
      showToast(`压缩完成！\n压缩方法：${result.method}\n原始消息：${result.originalCount} 条\n压缩后：${result.compactedCount} 条\n减少：${result.reducedCount} 条\n节省 Token：${result.savedTokens.toLocaleString()} (${result.savedPercent}%)\n\n摘要：${result.summary}`, 'success', 8000);
      await tokenMonitor.updateTokenStats();
    }
  } catch (error) {
    showToast(`压缩失败：${error.message}`, 'error');
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

// ========== 导出对话 ==========
async function exportConversation() {
  if (!currentSessionId) {
    showToast('没有可导出的对话', { type: 'warning', duration: 2000 });
    return;
  }

  const exportBtn = elements.exportBtn;
  const originalText = exportBtn.innerHTML;
  exportBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
    </svg>
    加载中...
  `;
  exportBtn.disabled = true;

  try {
    const messages = await chatService.getSessionMessages(currentSessionId);

    if (!messages || messages.length === 0) {
      showToast('当前会话没有消息', { type: 'warning', duration: 2000 });
      return;
    }

    const sessionName = sessionManager.sessionNames?.[currentSessionId] || '未命名会话';

    if (!confirm(`确定导出当前对话吗？\n\n会话：${sessionName}\n消息数：${messages.length} 条\n格式：Markdown (.md)`)) {
      return;
    }
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const markdownLines = [
      `# ${sessionName}`,
      ``,
      `> 导出时间：${timeStr}`,
      `> 共 ${messages.length} 条消息`,
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
          markdownLines.push(`## 🙋 你`);
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
              markdownLines.push(`## 🤖 AI`);
              markdownLines.push(``);
              markdownLines.push(text);
              markdownLines.push(``);
            }
            text = amText;
            i++;
            break;
          }

          if (text.trim()) {
            markdownLines.push(`## 🤖 AI`);
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
              markdownLines.push(`## 🤖 AI`);
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
                markdownLines.push(`  - 错误: ${tr.error}`);
              }
              markdownLines.push(``);
            }
          }
          i++;
        }

        if (text.trim()) {
          markdownLines.push(`## 🤖 AI`);
          markdownLines.push(``);
          markdownLines.push(text);
          markdownLines.push(``);
        }

        if (!hasToolCalls && !text.trim()) {
          markdownLines.push(`## 🤖 AI`);
          markdownLines.push(``);
          markdownLines.push(`*（空响应）*`);
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

    showToast(`已导出：${filename}`, { type: 'success', duration: 3000 });
  } catch (e) {
    showToast(`导出失败：${e.message}`, { type: 'error', duration: 3000 });
    console.error('导出对话失败:', e);
  } finally {
    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;
  }
}

// ========== 模型配置弹窗 ==========
const configModal = document.getElementById('configModal');
const configBtn = document.getElementById('settingsBtn');
const configClose = document.getElementById('configModalClose');
const configCancel = document.getElementById('configModalCancel');
const configSave = document.getElementById('configModalSave');
const configProviderBtn = document.getElementById('configProvider');
const configModel = document.getElementById('configModel');
const configApiKey = document.getElementById('configApiKey');
const configBaseUrl = document.getElementById('configBaseUrl');
const configApiKeyToggle = document.getElementById('configApiKeyToggle');
const configMaxTokens = document.getElementById('configMaxTokens');
const configHistoryList = document.getElementById('configHistoryList');
const configHistoryCount = document.getElementById('configHistoryCount');

/** Provider 可选列表 */
const PROVIDER_ITEMS = [
  { label: 'DashScope', value: 'dashscope' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '智谱 GLM', value: 'zhipu' },
  { label: 'Kimi (月之暗面)', value: 'moonshot' },
  { label: 'MiniMax', value: 'minimax' },
  { label: '阶跃星辰', value: 'stepfun' },
  { label: '零一万物', value: 'lingyi' },
  { label: '豆包 (字节)', value: 'doubao' },
  { label: '硅基流动', value: 'siliconflow' },
  { label: '讯飞星火', value: 'xunfei' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Local', value: 'local' },
];

let providerDropdown = null;

async function loadConfig() {
  try {
    const data = await apiGet('/api/config/llm');

    // Provider 下拉
    if (!providerDropdown && configProviderBtn) {
      providerDropdown = new CustomDropdown({
        trigger: configProviderBtn,
        items: PROVIDER_ITEMS,
        selectedValue: data.provider || 'dashscope',
        placement: 'bottom-left',
      });
    } else if (providerDropdown) {
      providerDropdown.setSelectedValue(data.provider || 'dashscope');
    }

    configModel.value = data.model || '';
    configBaseUrl.value = data.baseUrl || '';
    configMaxTokens.value = data.maxTokens || '';
    // API Key: 有 key 时显示 masked 值，否则留空
    if (data.hasApiKey) {
      configApiKey.value = data.apiKeyMasked || '';
      configApiKey.dataset.masked = 'true';
    } else {
      configApiKey.value = '';
      delete configApiKey.dataset.masked;
    }

    // 渲染已添加模型列表
    loadModelHistoryList(data);
  } catch (e) {
    console.warn('加载模型配置失败:', e);
    showToast('加载模型配置失败', 'error');
  }

  // 加载默认工作区路径（桌面端）
  const workspaceInput = document.getElementById('configDefaultWorkspace');
  if (workspaceInput && window.HippoDesktop?.getDefaultWorkspace) {
    try {
      const result = await window.HippoDesktop.getDefaultWorkspace();
      workspaceInput.value = result?.path || '';
    } catch (e) {
      // 非桌面端忽略
    }
  }
}

async function saveConfig() {
  const body = {
    provider: providerDropdown ? providerDropdown.getSelectedItem()?.value || 'dashscope' : 'dashscope',
    model: configModel.value,
    baseUrl: configBaseUrl.value,
    apiKey: configApiKey.value,
    maxTokens: configMaxTokens.value ? parseInt(configMaxTokens.value, 10) : undefined,
  };

  // 如果用户没改 masked 值，不传 apiKey
  if (configApiKey.dataset.masked === 'true') {
    delete body.apiKey;
  }

  try {
    const resp = await fetch('/api/config/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(await resp.text());

    // 保存默认工作区路径（桌面端）
    const workspaceInput = document.getElementById('configDefaultWorkspace');
    if (workspaceInput && window.HippoDesktop?.setDefaultWorkspace) {
      try {
        const result = await window.HippoDesktop.setDefaultWorkspace(workspaceInput.value.trim());
        // 如果当前在默认工作区，立即刷新文件树到新路径
        if (result?.switched && window.HippoWorkspace?.openWorkspace) {
          await window.HippoWorkspace.openWorkspace(result.path, true);
        }
      } catch (e) {
        // 非桌面端忽略
      }
    }

    showToast('模型配置已保存', 'success');
    // 同步更新快速选择器
    loadQuickModelConfig();
    // 重新加载完整数据以刷新历史列表
    loadConfig();
    closeConfigModal();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

function openConfigModal() {
  loadConfig();
  configModal.style.display = 'flex';
}

function closeConfigModal() {
  // 关闭 Provider 下拉（防止菜单悬浮在关闭的弹窗上）
  if (providerDropdown) providerDropdown.close();
  configModal.style.display = 'none';
}

if (configBtn) configBtn.addEventListener('click', openConfigModal);
if (configClose) configClose.addEventListener('click', closeConfigModal);
if (configCancel) configCancel.addEventListener('click', closeConfigModal);
if (configSave) configSave.addEventListener('click', saveConfig);
// 点击遮罩关闭
if (configModal) {
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) closeConfigModal();
  });
}
// API Key 显示/隐藏
if (configApiKeyToggle && configApiKey) {
  configApiKeyToggle.addEventListener('click', () => {
    const isPassword = configApiKey.type === 'password';
    configApiKey.type = isPassword ? 'text' : 'password';
    configApiKeyToggle.innerHTML = isPassword
      ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
}
// 默认工作区路径 — 选择文件夹
const workspaceBrowseBtn = document.getElementById('configDefaultWorkspaceBrowse');
const workspaceInput = document.getElementById('configDefaultWorkspace');
if (workspaceBrowseBtn && workspaceInput && window.HippoDesktop?.openFileDialog) {
  workspaceBrowseBtn.addEventListener('click', async () => {
    try {
      const result = await window.HippoDesktop.openFileDialog();
      if (result && result.path) {
        workspaceInput.value = result.path;
      }
    } catch (e) {
      // 用户取消选择
    }
  });
}
// 快捷键 ESC 关闭
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && configModal && configModal.style.display === 'flex') {
    closeConfigModal();
  }
});

// ========== 已添加模型管理 ==========

/** 渲染已添加模型列表 */
function loadModelHistoryList(data) {
  if (!configHistoryList) return;
  const history = data.modelHistory || [];
  configHistoryCount.textContent = history.length;

  if (history.length === 0) {
    configHistoryList.innerHTML = '<div class="config-history-empty">暂无已添加的模型</div>';
    return;
  }

  let html = '';
  const currentCombo = (data.provider || '') + ':' + (data.model || '');
  for (const snap of history) {
    const key = snap.provider + ':' + snap.model;
    const isActive = key === currentCombo;
    html += `
      <div class="config-history-item${isActive ? ' active' : ''}" title="${snap.provider} · ${snap.model}">
        <div class="config-history-item-info">
          <span class="config-history-item-provider">${escHtml(snap.provider)}</span>
          <span class="config-history-item-model">${escHtml(snap.model)}</span>
        </div>
        <div class="config-history-item-actions">
          <button class="config-history-item-edit" data-provider="${escHtml(snap.provider)}" data-model="${escHtml(snap.model)}" title="载入到表单编辑">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="config-history-item-delete" data-provider="${escHtml(snap.provider)}" data-model="${escHtml(snap.model)}" title="删除">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
  }
  configHistoryList.innerHTML = html;

  // 绑定编辑按钮事件
  configHistoryList.querySelectorAll('.config-history-item-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      editModelFromHistory(btn.dataset.provider, btn.dataset.model);
    });
  });

  // 绑定删除按钮事件
  configHistoryList.querySelectorAll('.config-history-item-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteModelFromHistory(btn.dataset.provider, btn.dataset.model);
    });
  });
}

/** 将历史模型加载到表单中编辑 */
function editModelFromHistory(provider, model) {
  // 先重新获取最新数据
  apiGet('/api/config/llm').then(data => {
      const history = data.modelHistory || [];
      const snap = history.find(s => s.provider === provider && s.model === model);
      if (!snap) {
        showToast('未找到该模型的完整配置', 'error');
        return;
      }
      // 填充到表单
      if (providerDropdown) providerDropdown.setSelectedValue(snap.provider);
      configModel.value = snap.model || '';
      configBaseUrl.value = snap.baseUrl || '';
      configMaxTokens.value = snap.maxTokens || '';
      if (snap.apiKeyMasked) {
        configApiKey.value = snap.apiKeyMasked;
        configApiKey.dataset.masked = 'true';
      } else {
        configApiKey.value = '';
        delete configApiKey.dataset.masked;
      }
      showToast('已载入模型: ' + provider + ' · ' + model + '，可直接修改后保存', 'info');
    })
    .catch(e => {
      showToast('加载模型详情失败: ' + e.message, 'error');
    });
}

/** 从历史记录中删除模型 */
async function deleteModelFromHistory(provider, model) {
  const confirmed = await ConfirmDialog.confirmDelete('确定从已添加列表中删除「' + provider + ' · ' + model + '」吗？');
  if (!confirmed) return;

  try {
    const resp = await fetch('/api/config/llm/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model })
    });
    if (!resp.ok) throw new Error(await resp.text());
    showToast('已删除: ' + provider + ' · ' + model, 'success');
    // 刷新配置弹窗和状态栏下拉
    loadConfig();
    loadQuickModelConfig();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}

/** 简单的 HTML 转义 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ========== 快速模型切换（状态栏） ==========
const modelQuickSelectTrigger = document.getElementById('modelQuickSelect');
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

/** 用数据更新下拉框 */
function applyModelConfigToDropdown(data) {
  const provider = data.provider || '';
  const model = data.model || '';
  const currentCombo = provider + ':' + model;
  const items = buildModelDropdownItems(data);

  if (!modelDropdown) {
    if (!modelQuickSelectTrigger) return;
    modelDropdown = new CustomDropdown({
      trigger: modelQuickSelectTrigger,
      items,
      selectedValue: provider && model ? currentCombo : '',
      offsetX: -9,
      onSelect: (item) => {
        if (item.value === ADD_MODEL_VALUE) {
          openConfigModal();
          setTimeout(() => loadQuickModelConfig(), 100);
          return;
        }
        if (!item.value) return;
        const colonIdx = item.value.indexOf(':');
        if (colonIdx > 0) {
          saveQuickModelConfig(
            item.value.substring(0, colonIdx),
            item.value.substring(colonIdx + 1)
          );
        }
      },
    });
  } else {
    modelDropdown.setItems(items);
    modelDropdown.setSelectedValue(provider && model ? currentCombo : '');
  }

  // 同步 hero 模型选择按钮的显示文本
  const heroTrigger = document.getElementById('heroModelQuickSelect');
  if (heroTrigger && modelDropdown) {
    const item = modelDropdown.getSelectedItem();
    heroTrigger.textContent = item ? item.label : '加载中...';
  }
}

const ADD_MODEL_VALUE = '__add_model__';
let modelDropdown = null;

/** 构建下拉选项列表 */
function buildModelDropdownItems(data) {
  const provider = data.provider || '';
  const model = data.model || '';
  const currentCombo = provider + ':' + model;
  const history = data.modelHistory || [];
  const items = [];
  const seen = new Set();

  // 历史记录
  if (history.length > 0) {
    for (const snap of history) {
      const key = snap.provider + ':' + snap.model;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        label: snap.model,
        value: key,
      });
    }
  }

  // 当前模型未在历史中
  if (provider && model && !seen.has(currentCombo)) {
    items.push({
      label: model,
      value: currentCombo,
    });
  }

  // 分隔线 + 添加入口
  if (items.length > 0) {
    items.push({ type: 'divider' });
  }
  items.push({
    label: '✚ 添加模型...',
    value: ADD_MODEL_VALUE,
  });

  // 如果没有模型，加占位
  if (items.length <= 1) { // 只有添加入口
    items.unshift({
      label: '未配置模型',
      value: '',
      disabled: true,
    });
  }

  return items;
}

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
    showToast('模型已切换: ' + provider + ' · ' + model, 'success');
    // 立即刷新下拉框及缓存
    loadQuickModelConfig();
  } catch (e) {
    showToast('切换模型失败: ' + e.message, 'error');
    loadQuickModelConfig();
  }
}

// ========== 启动应用 ==========
init();
