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
import { MemoryPanel } from './memory-panel.js';
import { ChatPanel } from './components/ChatPanel.js';
import { TokenMonitor } from './components/TokenMonitor.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { diffModalManager } from './utils/diff-modal.js';
import { FileChangeManager } from './utils/file-change-manager.js';
import { EventBus } from './utils/event-bus.js';
import { showToast } from './utils/toast.js';
import { generateSessionId } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';

// ========== 全局状态 ==========
let currentSessionId = null;
let currentSystemPrompt = null;
let promptPresets = [];
let selectedPresetId = appState.selectedPresetId;

// ========== 服务实例 ==========
const chatService = new ChatService();
const chatContainer = document.getElementById('chatContainer');
const chatUI = new ChatUI(chatContainer);
const sessionList = document.getElementById('sessionList');
const memoryList = document.getElementById('memoryList');

// ========== 组件实例 ==========
let sessionManager;
let memoryPanel;
let chatPanel;
let tokenMonitor;
let metricsPanel;
let fileChangeManager;

// ========== DOM 元素 ==========
const elements = {
  themeToggle: document.getElementById('themeToggle'),
  sseStatus: document.getElementById('sseStatus'),
  compactBtn: document.getElementById('compactBtn'),
  exportBtn: document.getElementById('exportBtn'),
  newSessionBtn: document.getElementById('newSessionBtn'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  tokenStats: document.getElementById('tokenStats'),
  tokenUsage: document.getElementById('tokenUsage'),
  tokenPercent: document.getElementById('tokenPercent'),
  tokenDetailsBtn: document.getElementById('tokenDetailsBtn'),
  promptModeBar: document.getElementById('promptModeBar'),
  promptModeOptions: document.getElementById('promptModeOptions'),
  promptCustomBtn: document.getElementById('promptCustomBtn'),
  promptModal: document.getElementById('promptModal'),
  promptModalText: document.getElementById('promptModalText'),
  promptModalClose: document.getElementById('promptModalClose'),
  promptModalCancel: document.getElementById('promptModalCancel'),
  promptModalSave: document.getElementById('promptModalSave')
};

// ========== 初始化 ==========
function init() {
  console.log('🚀 Initializing Hippo Cockpit...');
  
  // 1. 初始化主题
  initTheme();
  
  // 2. 初始化会话管理器
  sessionManager = new SessionManager(sessionList, switchSession);
  window.sessionManagerInstance = sessionManager;
  
  // 3. 初始化记忆面板
  memoryPanel = new MemoryPanel(memoryList);
  
  // 4. 初始化聊天面板
  chatPanel = new ChatPanel(chatContainer, chatService, chatUI);
  
  // 5. 初始化 Token 监控
  tokenMonitor = new TokenMonitor(chatService);
  
  // 6. 初始化监控面板
  metricsPanel = new MetricsPanel();
  
  // 7. 初始化 SSE 连接
  initSSE();
  
  // 8. 初始化文件变更监控
  fileChangeManager = new FileChangeManager();
  fileChangeManager.init();
  
  // 9. 绑定全局事件
  bindGlobalEvents();
  
  // 10. 加载预设提示词
  loadPromptPresets();
  
  // 11. 生成并设置当前会话 ID
  currentSessionId = generateSessionId();
  sessionManager.setCurrentSession(currentSessionId);
  appState.currentSessionId = currentSessionId;
  sessionManager.loadSessions();
  
  // 12. 启动自动更新
  tokenMonitor.startAutoUpdate(30000);
  metricsPanel.startAutoUpdate(10000);
  
  // 13. 初始化趋势图
  tokenMonitor.renderTrendChart();
  
  // 14. 订阅事件
  EventBus.on('message:sent', () => {
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    fileChangeManager.updateFileChanges();
  });
  
  EventBus.on('session:auto-name', ({ sessionId, content }) => {
    if (sessionId && sessionManager) {
      if (!sessionManager.sessionNames || !sessionManager.sessionNames[sessionId]) {
        sessionManager.setSessionName(sessionId, content);
        sessionManager.loadSessions();
      }
    }
  });
  
  console.log('✅ Hippo Cockpit initialized');
}

// ========== 主题管理 ==========
function initTheme() {
  const savedTheme = appState.getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
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
function initSSE() {
  const sseClient = memoryPanel.init();
  
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
    elements.themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
    applyHljsTheme(next);
  });
  
  // 新建会话
  elements.newSessionBtn?.addEventListener('click', createNewSession);
  
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
  
  // 输入框事件
  elements.messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (chatPanel) {
        chatPanel.sendMessage();
      }
    }
  });
  
  // 发送按钮
  elements.sendBtn?.addEventListener('click', () => {
    if (chatPanel) {
      chatPanel.sendMessage();
    }
  });
  
  // 停止按钮
  elements.stopBtn?.addEventListener('click', () => {
    if (chatPanel) {
      chatPanel.stopGeneration();
    }
  });
  
  // Token 详情按钮
  elements.tokenDetailsBtn?.addEventListener('click', () => {
    tokenMonitor.showDetails();
  });

  // 导出对话
  elements.exportBtn?.addEventListener('click', exportConversation);
  
  // 侧边栏折叠（通过事件代理处理）
  document.querySelectorAll('.sidebar-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('expanded');
      const body = header.nextElementSibling;
      if (body) body.classList.toggle('show');
    });
  });
  
  // 消息回滚事件
  EventBus.on('message:rollback', (msgDiv) => handleMessageRollback(msgDiv));
}

// ========== 消息回滚处理 ==========
async function handleMessageRollback(msgDiv) {
  const rollbackBtn = msgDiv.querySelector('.rollback-btn');
  if (!rollbackBtn || rollbackBtn.classList.contains('rolling')) return;
  rollbackBtn.classList.add('rolling');
  rollbackBtn.innerHTML = '<span style="font-size:12px;">⋯</span>';
  
  const msgTimestamp = parseInt(msgDiv.dataset.timestamp);
  if (!msgTimestamp) {
    showToast('无法确定消息时间', { type: 'error', duration: 3000 });
    rollbackBtn.innerHTML = '↩';
    rollbackBtn.classList.remove('rolling');
    return;
  }
  
  let startTime = 0;
  const prevMsg = msgDiv.previousElementSibling;
  if (prevMsg && prevMsg.dataset.timestamp) {
    startTime = parseInt(prevMsg.dataset.timestamp);
  } else {
    startTime = msgTimestamp - 5 * 60 * 1000;
  }
  
  try {
    const response = await fetch('/api/files/rollback-range', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime: msgTimestamp })
    });
    const result = await response.json();
    
    if (result.success) {
      showToast(result.message || '已回滚文件变更', { type: 'success', duration: 3000 });
      fileChangeManager.updateFileChanges();
    } else {
      showToast(`回滚失败：${result.error || '未知错误'}`, { type: 'error', duration: 3000 });
    }
  } catch (e) {
    showToast(`回滚失败：${e.message}`, { type: 'error', duration: 3000 });
  }
  
  rollbackBtn.innerHTML = '↩';
  rollbackBtn.classList.remove('rolling');
}

// ========== 会话管理 ==========
async function createNewSession() {
  currentSessionId = await sessionManager.createNewSession();
  appState.currentSessionId = currentSessionId; // 同步到 appState
  chatUI.clear();
  elements.messageInput?.focus();
}

async function switchSession(sessionId) {
  if (sessionId === currentSessionId) return;
  
  currentSessionId = sessionId;
  sessionManager.setCurrentSession(sessionId);
  appState.currentSessionId = sessionId; // 同步到 appState
  await sessionManager.loadSessions();
  
  chatContainer.innerHTML = '<div class="empty-state">加载中...</div>';
  
  try {
    const messages = await chatService.getSessionMessages(sessionId);
    chatContainer.innerHTML = '';
    
    if (messages.length === 0) {
      chatContainer.innerHTML = '<div class="empty-state">发送消息开始对话</div>';
    } else {
      await loadHistoryMessages(messages);
    }
    
    tokenMonitor.scheduleUpdate();
    metricsPanel.updateMetrics();
    fileChangeManager?.updateFileChanges();
  } catch (e) {
    chatContainer.innerHTML = '<div class="empty-state">发送消息开始对话</div>';
  }
  
  elements.messageInput?.focus();
}

// ========== 加载历史消息 ==========
async function loadHistoryMessages(messages) {
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
        const { msgDiv, editBtn } = chatUI.appendUserMessage(msg.content, msg.id);
        if (editBtn) {
          editBtn.addEventListener('click', () => chatPanel.startEditMessage(msgDiv));
        }
      }
      i++;
      continue;
    }
    
    if (msg.role === 'assistant') {
      const segments = [];
      let text = '';
      let firstMsgTime = null;
      
      while (i < messages.length) {
        const am = messages[i];
        
        if (am.role === 'tool' || am.role === 'tool-result') {
          i++;
          continue;
        }
        
        if (am.role !== 'assistant') {
          break;
        }
        
        const amText = am.content || '';
        const amReasoning = am.reasoning_content || '';
        const hasToolCalls = am.tool_calls && am.tool_calls.length > 0;
        
        if (!firstMsgTime && am.timestamp) {
          firstMsgTime = am.timestamp;
        }
        
        if (amText.trim() && !hasToolCalls) {
          if (text.trim()) segments.push({ type: 'text', content: text });
          text = amText;
          i++;
          break;
        }
        
        if (text.trim()) {
          segments.push({ type: 'text', content: text });
          text = '';
        }
        
        if (amReasoning) {
          segments.push({ type: 'thinking', content: amReasoning, done: true });
        }
        
        if (amText.trim()) {
          text = amText;
        }
        
        if (hasToolCalls) {
          if (text.trim()) {
            segments.push({ type: 'text', content: text });
            text = '';
          }
          
          for (const tc of am.tool_calls) {
            let result = null;
            let resultContent = null;
            let error = null;
            const tr = toolResults[tc.id];
            if (tr) {
              result = tr.success ? 'success' : 'error';
              resultContent = tr.content || null;
              if (!tr.success) error = resultContent;
            }
            segments.push({
              type: 'tool',
              name: tc.name,
              args: tc.arguments,
              result: result,
              resultContent: resultContent,
              error: error
            });
          }
        }
        i++;
      }
      
      if (text.trim()) {
        segments.push({ type: 'text', content: text });
      }
      
      const msgDiv = document.createElement('div');
      msgDiv.className = 'message assistant';
      if (firstMsgTime) msgDiv.dataset.timestamp = firstMsgTime;
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      
      if (segments.length === 0 && !text.trim()) {
        contentDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🤖 AI 未返回有效响应，请尝试重新发送</div>';
      } else {
        let html = '';
        for (const seg of segments) {
          if (seg.type === 'thinking') {
            html += chatPanel._renderThinkingBubble(seg);
          } else if (seg.type === 'tool') {
            html += chatUI.renderToolCard(seg);
          } else if (seg.type === 'text' && seg.content) {
            html += await renderMarkdown(seg.content);
          }
        }
        contentDiv.innerHTML = html;
        contentDiv.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
          chatUI.bindToolCardEvents(card);
        });
      }
      msgDiv.appendChild(contentDiv);
      
      const btnContainer = document.createElement('div');
      btnContainer.className = 'message-actions';
      
      const retryBtn = document.createElement('button');
      retryBtn.className = 'message-action-btn';
      retryBtn.title = '重试';
      retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
      btnContainer.appendChild(retryBtn);
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'message-action-btn';
      copyBtn.title = '复制';
      copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      btnContainer.appendChild(copyBtn);
      
      const rollbackBtn = document.createElement('button');
      rollbackBtn.className = 'message-action-btn rollback-btn';
      rollbackBtn.title = '回退此消息的文件修改';
      rollbackBtn.innerHTML = '↩';
      rollbackBtn.addEventListener('click', () => EventBus.emit('message:rollback', msgDiv));
      btnContainer.appendChild(rollbackBtn);
      
      const rawMarkdown = segments.filter(s => s.type === 'text').map(s => s.content).join('');
      contentDiv.dataset.markdown = rawMarkdown;
      
      // 设置复制功能（简化版）
      copyBtn.onclick = () => {
        const textToCopy = contentDiv.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      };
      
      msgDiv.appendChild(btnContainer);
      
      const timeDiv = document.createElement('div');
      timeDiv.className = 'message-time';
      timeDiv.textContent = firstMsgTime 
        ? new Date(firstMsgTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) 
        : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      msgDiv.appendChild(timeDiv);
      
      chatContainer.appendChild(msgDiv);
    } else {
      i++;
    }
  }
  
  chatPanel.smartScroll();
}

// ========== 提示词管理 ==========
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
      压缩中...
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
      压缩
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

// ========== 启动应用 ==========
init();
