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
import { generateSessionId } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { SplashScreen } from './components/SplashScreen.js';
import { RollbackPanel } from './components/RollbackPanel.js';
import { initSelectionActions } from './components/selection-actions.js';

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

// ========== DOM 元素 ==========
const elements = {
  themeToggle: document.getElementById('themeToggle'),
  rightPanelShowBtn: document.getElementById('rightPanelShowBtn'),
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
  splashScreen = new SplashScreen({ rightPanelShowBtn: elements.rightPanelShowBtn });
  splashScreen.startAnimation();
  
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
    onUpdateFileChanges: () => fileChangeManager?.updateFileChanges()
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
  
  // 8. 绑定全局事件
  bindGlobalEvents();
  
  // 9. 加载预设提示词
  loadPromptPresets();
  
  // 10. 生成并设置当前会话 ID
  currentSessionId = generateSessionId();
  sessionManager.setCurrentSession(currentSessionId);
  appState.currentSessionId = currentSessionId;
  sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
  
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
    fileChangeManager.updateFileChanges();
  });
  
  EventBus.on('session:auto-name', ({ sessionId, content }) => {
    if (sessionId && sessionManager) {
      if (!sessionManager.sessionNames || !sessionManager.sessionNames[sessionId]) {
        sessionManager.setSessionName(sessionId, content);
        sessionManager.loadSessions().then(() => updateHistoryDropdown?.());
      }
    }
  });
  
  // 14. 安排 splash 结束 + 页面内容渐入
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

  // 监听桌面端后端恢复的主题
  window.addEventListener('theme-restored', (e) => {
    const theme = e.detail.theme;
    document.documentElement.setAttribute('data-theme', theme);
    elements.themeToggle.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    applyHljsTheme(theme);
  });
  
  // 新建会话
  document.getElementById('sessionNewBtn')?.addEventListener('click', createNewSession);
  
  // 聊天面板头部 - 新建会话
  document.getElementById('chatNewBtn')?.addEventListener('click', createNewSession);
  
  // 工作区清除按钮（workspace-manager 的守卫可能让它的绑定不生效）
  document.getElementById('workspaceClear')?.addEventListener('click', () => {
    const indicator = document.getElementById('workspaceIndicator');
    if (indicator) indicator.style.setProperty('display', 'none', 'important');
    const fileTreeEmpty = document.getElementById('fileTreeEmpty');
    if (fileTreeEmpty) fileTreeEmpty.style.display = '';
    const sessionList = document.getElementById('sessionList');
    if (sessionList) sessionList.style.display = '';
    // 切换到会话视图
    const viewBtns = document.querySelectorAll('[data-view]');
    for (const btn of viewBtns) {
      btn.classList.toggle('active', btn.dataset.view === 'sessions');
    }
    document.getElementById('sessionPanel')?.classList.remove('view-files');
    // 关闭预览
    const previewPanel = document.getElementById('previewPanel');
    if (previewPanel) previewPanel.classList.add('hidden');
    const chatPanelHeader = document.getElementById('chatPanelHeader');
    if (chatPanelHeader) chatPanelHeader.style.display = 'none';
    const chatPanel = document.querySelector('.chat-panel');
    if (chatPanel) chatPanel.classList.remove('collapsed');
    const chatShowBtn = document.getElementById('chatShowBtn');
    if (chatShowBtn) chatShowBtn.style.display = 'none';
    // 同步后端
    if (window.HippoDesktop?.clearCurrentFolder) {
      window.HippoDesktop.clearCurrentFolder();
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
  
  // 压缩会话
  elements.compactBtn?.addEventListener('click', handleCompact);
  
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
  
  // 左侧栏折叠（52px 仅图标）
  const sessionPanel = document.getElementById('sessionPanel');
  const sessionToggle = document.getElementById('sessionToggle');
  if (sessionPanel && sessionToggle) {
    sessionToggle.addEventListener('click', () => {
      sessionPanel.classList.toggle('collapsed');
      sessionToggle.title = sessionPanel.classList.contains('collapsed') ? '展开侧栏' : '折叠侧栏';
    });
  }
  
  // 侧边栏折叠（通过事件代理处理）
  document.querySelectorAll('.sidebar-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('expanded');
      const body = header.nextElementSibling;
      if (body) body.classList.toggle('show');
    });
  });
  
  // 右侧面板显隐折叠
  const rightPanel = document.getElementById('rightPanel');
  const rightPanelToggle = document.getElementById('rightPanelToggle');
  function updateRightPanelUI() {
    const isHidden = rightPanel.classList.contains('hidden');
    rightPanelToggle.title = isHidden ? '展开右侧面板' : '收起右侧面板';
    if (elements.rightPanelShowBtn) {
      elements.rightPanelShowBtn.style.display = isHidden ? '' : 'none';
    }
  }
  if (rightPanel && rightPanelToggle) {
    rightPanelToggle.addEventListener('click', () => {
      rightPanel.classList.toggle('hidden');
      updateRightPanelUI();
    });
  }
  
  // 顶栏展开右侧面板按钮
  if (elements.rightPanelShowBtn && rightPanel) {
    elements.rightPanelShowBtn.addEventListener('click', () => {
      rightPanel.classList.remove('hidden');
      updateRightPanelUI();
    });
  }
  
  // 状态条各模块独立点击切换
  const statusBarItems = document.querySelectorAll('.status-bar-item');
  let lastActiveSection = null;
  statusBarItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (!section || !rightPanel) return;
      
      const isHidden = rightPanel.classList.contains('hidden');
      
      // 如果右侧面板隐藏，或点击了不同的模块
      if (isHidden || lastActiveSection !== section) {
        // 显示面板
        rightPanel.classList.remove('hidden');
        updateRightPanelUI();
        
        // 找到对应的 section 并展开
        const targetSection = rightPanel.querySelector(`.sidebar-section[data-section="${section}"]`);
        if (targetSection) {
          // 展开该 section
          const header = targetSection.querySelector('.sidebar-section-header');
          const body = targetSection.querySelector('.sidebar-section-body');
          if (header && body) {
            header.classList.add('expanded');
            body.classList.add('show');
          }
          // 滚动到该 section
          targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        lastActiveSection = section;
      } else {
        // 点击了同一个模块 → 隐藏面板
        rightPanel.classList.add('hidden');
        updateRightPanelUI();
        lastActiveSection = null;
      }
    });
  });
  
  // 消息回滚事件
  EventBus.on('message:rollback', (msgDiv) => {
    rollbackPanel.execute(msgDiv, currentSessionId);
  });
}

// RollbackPanel 接管了回滚逻辑

// ========== 会话历史下拉（模块级，供多处调用） ==========
function updateHistoryDropdown() {
  const listEl = document.getElementById('chatHistoryList');
  if (!listEl) return;

  const sessions = sessionManager.sessions || [];
  if (sessions.length === 0) {
    listEl.innerHTML = '<div class="chat-history-empty">暂无历史会话</div>';
    return;
  }

  listEl.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (const s of sessions.slice(0, 30)) {
    const name = sessionManager.sessionNames?.[s.id] || s.title || ('会话 ' + s.id.replace('web-', '').slice(-6));
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

  listEl.appendChild(fragment);
}

// ========== 会话管理 ==========
async function createNewSession() {
  currentSessionId = await sessionManager.createNewSession();
  appState.currentSessionId = currentSessionId; // 同步到 appState
  chatUI.clear();
  if (elements.messageInput) {
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.messageInput.focus();
  }
  updateHistoryDropdown();
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
      chatContainer.classList.remove('switching');
      chatContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-hero-logo"><span class="hippo-char">🦛</span></div>
          <h1 class="empty-hero-title">Hippo Code</h1>
          <p class="empty-hero-subtitle">你的 AI 编码助手</p>
          <div class="empty-hero-input-area">
            <div class="hero-input-wrapper">
              <div class="empty-hero-input-refs" id="heroInputRefs"></div>
              <textarea class="empty-hero-input" id="heroInput" placeholder="问点什么..." rows="1"></textarea>
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
          <div class="empty-hero-hint">Enter 发送 · Shift+Enter 换行</div>
        </div>`;
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
    
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    // 刷新文件变更列表（后端已在 handleGetMessages 中加载了目标会话的变更）
    fileChangeManager?.updateFileChanges();
    EventBus.emit('file:changes-updated');
  } catch (e) {
    chatContainer.classList.remove('switching');
    chatContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-hero-logo"><span class="hippo-char">🦛</span></div>
        <h1 class="empty-hero-title">Hippo Code</h1>
        <p class="empty-hero-subtitle">你的 AI 编码助手</p>
        <div class="empty-hero-input-area">
          <div class="hero-input-wrapper">
            <div class="empty-hero-input-refs" id="heroInputRefs"></div>
            <textarea class="empty-hero-input" id="heroInput" placeholder="问点什么..." rows="1"></textarea>
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
    const response = await fetch('/api/system-prompts/presets');
    if (!response.ok) return;
    const data = await response.json();
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
const configProvider = document.getElementById('configProvider');
const configModel = document.getElementById('configModel');
const configApiKey = document.getElementById('configApiKey');
const configBaseUrl = document.getElementById('configBaseUrl');
const configApiKeyToggle = document.getElementById('configApiKeyToggle');

async function loadConfig() {
  try {
    const resp = await fetch('/api/config/llm');
    const data = await resp.json();
    configProvider.value = data.provider || 'dashscope';
    configModel.value = data.model || '';
    configBaseUrl.value = data.baseUrl || '';
    // API Key: 有 key 时显示 masked 值，否则留空
    if (data.hasApiKey) {
      configApiKey.value = data.apiKeyMasked || '';
      configApiKey.dataset.masked = 'true';
    } else {
      configApiKey.value = '';
      delete configApiKey.dataset.masked;
    }
  } catch (e) {
    console.warn('加载模型配置失败:', e);
    showToast('加载模型配置失败', 'error');
  }
}

async function saveConfig() {
  const body = {
    provider: configProvider.value,
    model: configModel.value,
    baseUrl: configBaseUrl.value,
    apiKey: configApiKey.value
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
    showToast('模型配置已保存', 'success');
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
// 快捷键 ESC 关闭
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && configModal && configModal.style.display === 'flex') {
    closeConfigModal();
  }
});

// ========== 启动应用 ==========
init();
