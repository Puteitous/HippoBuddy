// 聊天面板核心组件
import { appState } from '../../state/app-state.js';
import { RunningToolRegistry } from '../../state/running-tool-registry.js';
import { escapeHtml } from '../../utils.js';
import { showToast } from '../../utils/toast.js';
import { formatSseError } from '../../utils/error-codes.js';
import { EventBus } from '../../utils/event-bus.js';
import { RenderPipeline } from '../RenderPipeline.js';
import { EventRouter } from '../EventRouter.js';
import { MessageSession } from '../MessageSession.js';
import { ContextSelector } from '../context-selector.js';
import { parseTodoArgs, deepMergeTodoList } from '../tool-renderers/shared.js';
import { ModePresets } from './ModePresets.js';
import { ImageUpload } from './ImageUpload.js';
import { RefChips } from './RefChips.js';
import { ConfirmHandler } from './ConfirmHandler.js';
import { HistoryRenderer } from './HistoryRenderer.js';

export class ChatPanel {
  constructor(container, chatService, chatUI) {
    this.container = container;
    this.chatService = chatService;
    this.chatUI = chatUI;
    
    // 状态
    this.isSendingMessage = false;
    this.isCompleted = false;
    this.currentAbortController = null;
    this.lastUserMessage = '';
    this._lastUserMsgDiv = null;
    this._lastUserMessageId = null;
    this._stuckTimer = null;
    this._destroyed = false;

    this._activeSession = null;

    // 跨轮次 todo 树缓存（通过 holder 对象引用共享给 MessageSession）
    this._todoTreeCacheHolder = { value: null };

    // 图片上传处理
    this.imageUpload = new ImageUpload();

    this.confirmHandler = new ConfirmHandler(this);
    this.historyRenderer = new HistoryRenderer(this);

    this.renderPipeline = new RenderPipeline(chatUI, {
      bindAskUserCard: (card) => this.confirmHandler.bindAskUserCardEvents(card),
      onConfirmationClick: (e) => this.confirmHandler.onConfirmationClick(e),
      afterRender: () => this.smartScroll()
    });

    this.eventRouter = this._createEventRouter();

    // 上下文选择器（规则 + 技能）
    this._contextSelector = new ContextSelector({
      onRulesChange: (selectedIds) => {
        // 选中变化时无需额外操作，sendMessage 时读取即可
      },
      onSkillToggle: (skill, selected) => {
        const bar = this.refChips._getActiveRefsBar();
        if (!bar) return;
        if (selected) {
          this.refChips.addRefChip(bar, skill.filePath, 'file', skill.filePath, null, null, { skillPath: skill.filePath });
        } else {
          const chip = bar.querySelector(`[data-file-path="${skill.filePath.replace(/\\/g, '/')}"]`);
          if (chip) chip.remove();
          if (bar.children.length === 0) bar.style.display = 'none';
        }
      },
      onRuleToggle: (rule, selected) => {
        const bar = this.refChips._getActiveRefsBar();
        if (!bar) return;
        if (selected) {
          this.refChips.addRuleRefChip(bar, rule);
        } else {
          const chip = bar.querySelector(`[data-rule-id="${rule.id}"]`);
          if (chip) chip.remove();
          if (bar.children.length === 0) bar.style.display = 'none';
        }
      }
    });

    this.refChips = new RefChips(this);
    this.modePresets = new ModePresets(this);
    this.init();
  }
  
  init() {
    this.elements = {
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      stopBtn: document.getElementById('stopBtn'),
      newMsgHint: document.getElementById('newMsgHint'),
      compactBtn: document.getElementById('compactBtn')
    };
    
    this.bindEvents();
    this.modePresets.bindEvents();

    // 初始化模式 UI
    this.modePresets.syncUI(appState.getMode());

    // 将上下文选择器按钮添加到输入区域
    this._injectContextSelectorButton();

    // 监听文本选中快捷操作 → 插入输入框
    this._unsubscribeSelectionAction = EventBus.on('selection:add-to-input', ({ text, refType, filePath, startLine, endLine, selectedText }) => {
      const bar = this.refChips._getActiveRefsBar();
      if (bar) {
        this.refChips.addRefChip(bar, text, refType, filePath, startLine, endLine, undefined, selectedText);
        const input = this.refChips._getActiveInput();
        if (input) input.focus();
      }
    });

    // 引用卡片点击跳转（同时覆盖输入区和历史消息区的卡片）
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.input-ref-chip-navigable');
      if (!chip) return;
      const filePath = chip.dataset.filePath;
      if (!filePath) return;
      const startLine = chip.dataset.startLine ? parseInt(chip.dataset.startLine) : null;
      const endLine = chip.dataset.endLine && chip.dataset.endLine !== 'undefined' ? parseInt(chip.dataset.endLine) : null;
      window.HippoWorkspace?.navigateToFile?.(filePath, startLine, endLine);
    });

    // 工具卡片文件路径点击跳转
    document.addEventListener('click', (e) => {
      const pathEl = e.target.closest('[data-file-path]');
      if (!pathEl) return;
      const filePath = pathEl.dataset.filePath;
      if (!filePath) return;
      e.stopPropagation();
      window.HippoWorkspace?.navigateToFile?.(filePath);
    });

    // ── 图片上传 ──
    this.imageUpload.init();
  }

  bindEvents() {
    if (!this.container) return;
    // 输入框事件：统一事件代理，自动适配 hero / session
    this.container.addEventListener('keydown', (e) => {
      const input = e.target.closest('#messageInput');
      if (!input) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.isSendingMessage) return;
        const content = this.refChips.getCombinedInput();
        if (content) {
          input.value = '';
          input.style.height = 'auto';
          this.sendMessage(content);
        }
      }
      // Backspace 删除最后一个引用卡片（输入框为空或光标在开头时）
      if (e.key === 'Backspace' && (input.value === '' || input.selectionStart === 0)) {
        const refsBar = this.refChips._getActiveRefsBar();
        if (refsBar && refsBar.children.length > 0) {
          e.preventDefault();
          const chip = refsBar.lastElementChild;
          chip.remove();
          if (refsBar.children.length === 0) refsBar.style.display = 'none';
          this.refChips._notifyChipRemoved(chip);
        }
      }
    });
    
    this._inputResizeHandler = (e) => {
      const input = e.target.closest('#messageInput');
      if (!input) return;
      const prev = input.style.height;
      // 测量时临时禁用过渡，避免干扰 scrollHeight
      const origTransition = input.style.transition;
      input.style.transition = 'none';
      input.style.height = 'auto';
      const newHeight = Math.min(input.scrollHeight, 300) + 'px';
      // 恢复旧高度，为过渡动画做准备
      input.style.height = prev || (input.offsetHeight + 'px');
      // 恢复 transition，强制 reflow 后让动画生效
      input.style.transition = origTransition || '';
      void input.offsetHeight;
      input.style.height = newHeight;
    };
    document.addEventListener('input', this._inputResizeHandler);
    
    // 单独为 #messageInput 绑定 Enter 事件（它在 #chatContainer 外部，事件委托捕获不到）
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.isSendingMessage) return;
          const content = this.refChips.getCombinedInput();
          if (content) {
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = 'auto';
            appState.clearSessionInputDraft(appState.currentSessionId); // ✨ 发送后清除草稿
            appState.clearHeroPendingDraft(); // ✨ 同时清除 hero 待定草稿
            this.sendMessage(content);
          }
        }
        // Backspace 删除最后一个引用卡片（输入框为空或光标在开头时）
        if (e.key === 'Backspace' && (this.elements.messageInput.value === '' || this.elements.messageInput.selectionStart === 0)) {
          const refsBar = this.refChips._getActiveRefsBar();
          if (refsBar && refsBar.children.length > 0) {
            e.preventDefault();
            const chip = refsBar.lastElementChild;
            chip.remove();
            if (refsBar.children.length === 0) refsBar.style.display = 'none';
            this.refChips._notifyChipRemoved(chip);
          }
        }
      });
    }
    
    // Hero 快捷建议按钮
    this.container.addEventListener('click', (e) => {
      // 河马互动：点击弹跳 + 吐泡泡
      const hippo = e.target.closest('.empty-logo');
      if (hippo) {
        hippo.classList.remove('bouncing');
        void hippo.offsetWidth;
        hippo.classList.add('bouncing');
        setTimeout(() => hippo.classList.remove('bouncing'), 500);
        this._spawnHippoBubbles(hippo);
        this._spawnHippoSpeech(hippo);
        return;
      }
      
      const suggestionBtn = e.target.closest('.empty-suggestion');
      if (suggestionBtn) {
        const prompt = suggestionBtn.dataset.prompt;
        if (prompt) {
          this.sendMessage(prompt);
        }
      }
      // Hero 发送按钮（已迁移至 #sendBtn，此处不再需要）
      
    });
    
    // 发送按钮
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    }
    
    // 停止按钮
    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener('click', () => this.stopGeneration());
    }
    
    // 滚动事件
    if (this.container) {
      let lastScrollTop = this.container.scrollTop;
      this.container.addEventListener('scroll', () => {
        // ── 程序化滚动（doRender 恢复 scrollTop）→ 跳过，不污染 userScrolledUp ──
        if (appState._programmaticScroll) {
          lastScrollTop = this.container.scrollTop;
          return;
        }

        const currentScrollTop = this.container.scrollTop;
        const goingUp = currentScrollTop < lastScrollTop;

        // ── 用户有意义上滚（≥20px）→ 停止自动滚动 ──
        // 死区 20px 过滤内容回流导致的亚像素抖动
        if (goingUp && (lastScrollTop - currentScrollTop) >= 20) {
          appState.userScrolledUp = true;
          if (this.elements.newMsgHint) {
            this.elements.newMsgHint.style.display = 'flex';
          }
        }

        // ── 用户滚回底部附近 → 恢复自动滚动 ──
        // 与 smartScroll 的滚动阈值一致，确保一旦回到底部附近就能恢复自动滚动
        if (!goingUp && this.isNearBottom(100)) {
          appState.userScrolledUp = false;
          if (this.elements.newMsgHint) {
            this.elements.newMsgHint.style.display = 'none';
          }
        }

        lastScrollTop = currentScrollTop;
      });
    }
    
    // 点击新消息提示 → 滚动到底部并恢复自动跟随
    if (this.elements.newMsgHint) {
      this.elements.newMsgHint.addEventListener('click', () => {
        appState.userScrolledUp = false;
        this.chatUI.scrollToBottom();
        this.elements.newMsgHint.style.display = 'none';
      });
    }

    // 二次确认弹窗 - 点击遮罩关闭
    const overlay = document.getElementById('deleteConfirmOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.display = 'none';
        }
      });
    }

    // ── 拖拽文件到输入框 ─────────────────────────────
    this._dragOverHandler = (e) => {
      const inputArea = e.target.closest('#inputContainer');
      if (!inputArea) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      inputArea.classList.add('drag-over');
    };

    this._dragLeaveHandler = (e) => {
      const inputArea = e.target.closest('#inputContainer');
      if (!inputArea) return;
      // 只在真正离开容器时移除高亮
      const related = e.relatedTarget;
      if (!related || !inputArea.contains(related)) {
        inputArea.classList.remove('drag-over');
      }
    };

    this._dropHandler = (e) => {
      const inputArea = e.target.closest('#inputContainer');
      if (!inputArea) return;
      e.preventDefault();
      inputArea.classList.remove('drag-over');

      const bar = this.refChips._getActiveRefsBar();
      if (!bar) return;

      // 从文件树拖拽 → text/plain 包含文件路径
      const path = e.dataTransfer.getData('text/plain');
      if (path) {
        const dragType = e.dataTransfer.getData('text/x-hippo-type');
        this.refChips.addRefChip(bar, path, 'file', path, undefined, undefined, { isDirectory: dragType === 'directory' });
        const input = this.refChips._getActiveInput();
        if (input) input.focus();
        return;
      }

      // 从 OS 资源管理器拖入 → e.dataTransfer.files 包含 File 对象
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const imageFiles = [];
        const textFiles = [];
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            imageFiles.push(file);
          } else {
            textFiles.push(file);
          }
        }
        // 图片文件 → 读取为 base64 预览
        if (imageFiles.length > 0) {
          if (!this.imageUpload._isVisionSupported()) {
            showToast('当前模型不支持图片上传', { type: 'warning', duration: 3000 });
          } else {
            this.imageUpload._handleImageFiles(imageFiles);
          }
        }
        // 非图片文件 → 添加为引用卡片
        for (const file of textFiles) {
          const filePath = file.path || file.fullPath;
          if (filePath) {
            this.refChips.addRefChip(bar, filePath, 'file', filePath);
          }
        }
        const input = this.refChips._getActiveInput();
        if (input) input.focus();
      }
    };

    document.addEventListener('dragover', this._dragOverHandler);
    document.addEventListener('dragleave', this._dragLeaveHandler);
    document.addEventListener('drop', this._dropHandler);
  }

  // ── 模式切换 ────────────────────────────

  /**
   * 兜底创建隐藏的图片文件选择器 input（#inputImgFile）。
   * 当 chatUI.clear() 或 DOM 替换导致 input 元素丢失时调用。
   */
  _ensureImageFileInput() {
    if (document.getElementById('inputImgFile')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'inputImgFile';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      this.imageUpload._handleImageFiles(input.files);
      input.value = '';
    });
    // 追加到 body 或最近的输入容器
    const container = document.getElementById('inputContainer') || document.getElementById('chatContainer') || document.body;
    container.appendChild(input);
  }

  /**
   * 渲染当前模式的预设提示词标签
   * 委托给 modePresets 处理
   * @param {string} mode 模式名称（chat/office/coding）
   */
  _renderPresets(mode) {
    this.modePresets.renderPresets(mode);
  }

  /** 更新 # 和 📷 按钮状态（Phase 2: 按钮已是静态，只需更新显隐） */
  _injectContextSelectorButton() {
    if (!this._contextSelector) return;
    this._contextSelector.getButtonElement();
    this.imageUpload.updateBtnVisibility();
  }

  /** 重新注入上下文选择器（Phase 2: 按钮已是静态，只需同步 UI） */
  reInjectContextSelector() {
    this.modePresets.syncUI(appState.getMode());
  }

  /**
   * 同步模式 UI（由 switchSession / i18n 切换时调用）
   * @param {string} mode - chat / coding / office
   */
  _syncModeUI(mode) {
    this.modePresets.syncUI(mode);
  }

  /**
   * 发送消息
   */
  async sendMessage(overrideContent) {
    console.log('📤 sendMessage 被调用', { overrideContent, isSending: this.isSendingMessage });
    
    if (this.isSendingMessage) {
      console.log('⏭️ sendMessage 跳过：LLM 正在输出中');
      return;
    }
    
    this.isCompleted = false;
    // 会话代际：自增序号标记本次发送。旧一轮 session.start 的收尾（await 返回后）若发现
    // 序号已变（用户已开始新一轮发送），则不再清理 isCompleted/currentAbortController，
    // 避免旧流收尾污染新消息（流式输出被丢弃、终止按钮失效）。
    this._sendSeq = (this._sendSeq || 0) + 1;
    const mySendSeq = this._sendSeq;
    
    const content = (typeof overrideContent === 'string' && overrideContent)
      ? overrideContent
      : this.refChips.getCombinedInput();
    
    if (!content && this.imageUpload._pendingImages.length === 0) {
      console.log('⏭️ sendMessage 跳过：内容为空');
      return;
    }

    // 检查模型是否已配置
    const MODEL_CONFIG_CACHE_KEY = 'hippo_model_config';
    try {
      const raw = localStorage.getItem(MODEL_CONFIG_CACHE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (!data.provider || !data.model) {
          showToast(_('chat.noModelConfigTip'), { type: 'warning', duration: 5000 });
          return;
        }
      } else {
        showToast(_('chat.noModelConfigTip'), { type: 'warning', duration: 5000 });
        return;
      }
    } catch (e) {
      console.warn('读取模型配置缓存失败:', e);
      showToast(_('chat.noModelConfigTip'), { type: 'warning', duration: 5000 });
      return;
    }

    // 新消息开始，清理跨轮残留的 runningToolCallIds 和上一轮的 stuck 定时器
    this._clearStuckTimer();
    RunningToolRegistry.clear();

    this._healStuckToolCards(true);

    if (this.elements.messageInput) {
      this.elements.messageInput.value = '';
      this.elements.messageInput.style.height = 'auto';
    }
    
    this._contextSelector.clearSelection();
    
    // 收集待发送的图片（需在 this.lastUserMessage 前定义 images）
    const pendingImages = this.imageUpload._pendingImages.slice();
    this.imageUpload.clearPending();
    const images = pendingImages.map(img => img.dataUrl);
    
    // 收集完图片后再清空引用卡片（避免 clearRefs 误清 _pendingImages）
    this.refChips.clearRefs();
    
    this.lastUserMessage = content || (images.length > 0 ? '[图片]' : '');
    EventBus.emit('session:auto-name', { sessionId: appState.currentSessionId });

    // 立即并行发起标题生成，不等第一轮对话结束
    this._generateSessionTitle(content || (images.length > 0 ? '[图片]' : ''));
    
    const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this._lastUserMessageId = tempId;
    const displayContent = content || (images.length > 0 ? '📷 发送了 ' + images.length + ' 张图片' : '');
    const { msgDiv } = this.chatUI.appendUserMessage(displayContent, tempId, true, images);
    this._lastUserMsgDiv = msgDiv;

    // hero 已被移除，将上下文选择器注入到底部状态栏
    this._injectContextSelectorButton();
    
    this.setSendingState(true);
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
    }
    
    this.currentAbortController = new AbortController();
    
    const session = new MessageSession({
      chatUI: this.chatUI,
      renderPipeline: this.renderPipeline,
      chatService: this.chatService,
      smartScroll: () => this.smartScroll(),
      todoTreeCacheHolder: this._todoTreeCacheHolder
    });
    this._activeSession = session;

    const onRetry = () => {
      if (!this.lastUserMessage) return;
      this.chatService.stopGeneration(this.currentAbortController);
      this.currentAbortController = new AbortController();
      this.sendMessage(this.lastUserMessage);
    };

    const selectedRules = this._contextSelector?.getSelectedRuleIds() || [];

    try {
      await session.start({
        sessionId: appState.currentSessionId,
        content,
        images,
        signal: this.currentAbortController?.signal,
        systemPrompt: appState.getSystemPrompt(),
        mode: appState.getSessionMode(appState.currentSessionId),
        selectedRules,
        useExecuteRequest: false,
        onMessageId: (id) => {
          if (this._lastUserMsgDiv) {
            this._lastUserMsgDiv.dataset.messageId = id;
            this._lastUserMessageId = id;
          }
        },
        onRetry
      });
      console.debug(`[ChatPanel] session.start 正常完成 session=${appState.currentSessionId}`);
    } catch (err) {
      console.error(`[ChatPanel] session.start 抛出异常 session=${appState.currentSessionId}`, err);
      // 兜底：避免"对话中断但界面毫无反馈"。用户主动停止（AbortError）不算异常，不提示。
      if (!(err && (err.name === 'AbortError' || err.constructor?.name === 'AbortError'))) {
        const fallbackMsg = window.i18n ? window.i18n.t('chatui.unknownError') : '未知错误';
        showToast(err?.message || fallbackMsg, { type: 'error', duration: 5000 });
      }
    }

    // SSE 流结束，启动兜底定时器检查 stuck tool（30s 后运行）
    this._startStuckTimer();

    // 代际守卫：仅当没有更新的发送（用户没在等待期间发新消息）时才清理本轮状态，
    // 否则旧流收尾会污染新消息（isCompleted 被置 true 导致流式输出被丢弃、
    // currentAbortController 被置空导致终止按钮失效）。
    if (this._sendSeq === mySendSeq) {
      this.isCompleted = true;
      this.setSendingState(false);
      this.currentAbortController = null;
    }
    
    EventBus.emit('message:sent');
  }

  /**
   * 异步调用后端 API 生成会话标题（基于第一条用户消息）。
   * 传递 content 解决标题 API 比 Chat API 先到达后端的竞态。
   * 不会覆盖用户手动重命名的标题。
   * @param {string} content 用户消息原文
   */
  async _generateSessionTitle(content) {
    try {
      const result = await this.chatService.generateTitle(appState.currentSessionId, content);
      if (result && result.title) {
        EventBus.emit('session:title-updated', {
          sessionId: appState.currentSessionId,
          title: result.title
        });
      }
    } catch {
      // 静默失败，保留现有的 auto-name 标题
    }
  }
  
  /**
   * 处理 SSE 数据块
   */
  _createEventRouter() {
    const s = () => this._activeSession;
    return new EventRouter({
      waiting_user: (parsed, contentDiv) => {
        console.log('📥 收到 waiting_user 事件:', parsed);
        this.confirmHandler.showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input, contentDiv);
      },

      message_id: (parsed) => {
        const userMsgDiv = this._lastUserMsgDiv;
        if (userMsgDiv) {
          userMsgDiv.dataset.messageId = parsed.id;
          this._lastUserMessageId = parsed.id;
        }
      },

      thinking: () => {
        const session = s();
        if (!session) return;
        session.pushTextSegment();
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      clear_content: (contentDiv) => {
        const session = s();
        if (!session) return;
        session.clearAll();
        // 清空跨轮次 todo 缓存，因为当前消息内容被完全清空（错误恢复/重新开始）
        this._todoTreeCacheHolder.value = null;
        contentDiv.innerHTML = '';
      },

      retry: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<div class="msg-note">🔄 ${escapeHtml(parsed.message)}</div>`;
        const session = s();
        if (!session) return;
        session.clearAll();
        // 重试时清空 todo 缓存，让新一轮从头开始
        this._todoTreeCacheHolder.value = null;
      },

      sse_error: (parsed) => {
        const session = s();
        if (!session) return;
        // 按后端下发的 code 渲染 i18n 文案；无 code（旧后端）时 fallback 原文。
        // 统一 .msg-error 红块（title + detail）
        const { message, detail } = formatSseError(parsed);
        session.pushError({ message, detail });
      },

      raw_error: (parsed) => {
        const session = s();
        if (!session) return;
        session.pushError({ message: parsed.content });
      },

      done: (parsed, contentDiv) => {
        // 会话结束事件：仅处理达到 MAX_TURNS 上限（50 轮）的截断提示。
        // 与 MessageSession 主流 handler 逻辑一致：保留已生成内容，仅追加警示块。
        if (parsed.reason !== 'max_turns') return;
        const session = s();
        if (!session) return;
        const _t = (key) => (window.i18n ? window.i18n.t(key) : key);
        session._pushTextSegment();
        session._segments.push({
          type: 'warn',
          content: _t('chatui.maxTurnsReached'),
          detail: _t('chatui.maxTurnsReachedDetail')
        });
        this.renderPipeline.setContainer(contentDiv);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      reasoning: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        session.handleReasoning(parsed, contentDiv);
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
        // smartScroll 由 afterRender 回调自动调用
      },

      reasoning_done: () => {
        const session = s();
        if (!session) return;
        session.handleReasoningDone();
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      web_search_start: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        session.handleWebSearchStart(parsed, contentDiv);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      web_search_done: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleWebSearchDone(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      content: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        session.handleContent(parsed, contentDiv);
        this.renderPipeline.markTextOnly();
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
        // smartScroll 由 afterRender 回调自动调用
      },

      tool_start: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        // 确认 SSE 流：运行中工具统一登记到全局 Registry（主流的登记在 MessageSession 里）
        if (parsed.id && RunningToolRegistry.has(parsed.id)) {
          return;
        }
        if (parsed.id) RunningToolRegistry.add(parsed.id);
        // 检查 session._segments 中是否已存在相同 id 的 tool segment
        // 主 SSE 流通过 MessageSession._eventRouter 创建 segment（toolCallId 已登记进 RunningToolRegistry）
        // 确认 SSE 流通过 ChatPanel.eventRouter 到达此处（上面也已登记进同一 Registry），需要二次防重
        if (parsed.id && session.getSegments().some(seg => seg.type === 'tool' && seg.id === parsed.id)) {
          return;
        }
        session.handleToolStart(parsed, contentDiv);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());

        if (parsed.name === 'todo_write') {
          const { mode, todos } = parseTodoArgs(parsed.args);
          session.pushTextSegment();
          const finalTodos = session._mergeTodos(todos, mode);
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null,
            defaultExpanded: mode === 'replace'
          };
          // 每张 todo 卡片都是独立快照，始终 push 新段
          session.pushSegment(todoSegment);
          this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        } else if (parsed.name !== 'ask_user') {
          session.pushTextSegment();
          session.pushSegment({
            type: 'tool', id: parsed.id || null, name: parsed.name,
            args: parsed.args, result: null, error: null
          });
          this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        }
      },

      tool_result: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleToolResult(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        // flush 已立即渲染，无需重复 scheduleRender
      },

      tool_progress: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleToolProgress(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        // flush 已立即渲染，无需重复 scheduleRender
      },

      tool_confirmation: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleToolConfirmation(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        // flush 已立即渲染，无需重复 scheduleRender
      },

      token_update: (parsed) => {
        // 确认流中也可能收到 token_update（后端回合结束校准值），
        // 与 MessageSession 主流一致，通过 EventBus 交给 TokenMonitor 实时渲染
        EventBus.emit('token:update', parsed);
      }
    });
  }

  handleChunk(parsed, contentDiv, btnContainer) {
    if (this.isCompleted) return;
    this.eventRouter.handle(parsed, contentDiv, btnContainer);
  }
  
  async renderSegments(container, segments, currentText) {
    this.renderPipeline.setContainer(container);
    this.renderPipeline.scheduleRender(segments, currentText);
  }

  // RenderPipeline 接管了所有渲染调度和 DOM 构建
  
  _setupCopyButton(copyBtn, contentDiv) {
    copyBtn.addEventListener('click', () => {
      const textToCopy = contentDiv.dataset.markdown || contentDiv.innerText;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
  }
  
  /**
   * 河马吐泡泡
   */
  _spawnHippoBubbles(hippoEl) {
    const state = hippoEl.closest('.empty-state');
    if (!state) return;
    const hippoRect = hippoEl.getBoundingClientRect();
    const stateRect = state.getBoundingClientRect();
    const cx = hippoRect.left - stateRect.left + hippoRect.width / 2;
    const cy = hippoRect.top - stateRect.top + hippoRect.height / 2;
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const bubble = document.createElement('div');
        bubble.className = 'hippo-bubble';
        const size = 6 + Math.random() * 5;
        const drift = (Math.random() - 0.5) * 30;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';
        bubble.style.left = (cx - size / 2) + 'px';
        bubble.style.top = (cy - size / 2) + 'px';
        bubble.style.setProperty('--bubble-drift', drift + 'px');
        state.appendChild(bubble);
        bubble.addEventListener('animationend', () => bubble.remove());
      }, i * 80);
    }
  }

  /**
   * 河马对话框气泡
   */
  _spawnHippoSpeech(hippoEl) {
    const existing = hippoEl.querySelector('.hippo-speech');
    if (existing) existing.remove();

    const speeches = window.i18n ? window.i18n.tArray('hippo.speeches') : [
      '代码写得不错嘛 👍',
      '好热🫠',
      '想泡水💧',
      '饿了吗🍉',
      '今天吃什么 🍗',
      '又在写 bug 了？',
      '你好呀 👋',
      '让我看看… 👀',
      '这个我熟！',
      '要帮忙吗？',
      '💤 有点困…',
      '该下班了 🕐',
      '正在思考中… 🤔',
      '快夸我快夸我',
      '👿 哼！',
      '好一个屁屁哦，😯',
    ];

    const text = speeches[Math.floor(Math.random() * speeches.length)];

    const speech = document.createElement('div');
    speech.className = 'hippo-speech';
    speech.textContent = text;

    hippoEl.appendChild(speech);
    speech.addEventListener('animationend', () => speech.remove());
  }
  
  /**
   * 智能滚动 — 流式输出时的滚动跟随策略
   *
   * ⚠️ 优先级说明：
   *   isNearBottom(100) 必须高于 userScrolledUp 检查。
   *   原因：内容增长/DOM 变更可能触发 scroll anchoring，导致 scroll 事件
   *   误将 userScrolledUp 置为 true。此时若用户距底 < 100px，应重置标志
   *   并自动滚动，而不是被错误的状态阻挡。
   *
   * 优先级：
   *  1. 距底部 < 100px              → 重置 userScrolledUp，自动滚动到底部
   *  2. 用户主动上滚过（userScrolledUp=true）→ 不滚动，显示「新消息」提示
   *  3. 距底部较远且未上滚           → 显示「新消息」提示
   */
  smartScroll() {
    // 距底 < 100px → 覆盖 userScrolledUp，重置并自动滚动
    // 防止内容增长/DOM 变更导致的 scroll 事件误将 userScrolledUp 置为 true
    if (this.isNearBottom(100)) {
      appState.userScrolledUp = false;
      this.chatUI.scrollToBottom();
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'none';
      }
      return;
    }

    // 用户主动上滚过且不在底部附近 → 不自动滚动，显示新消息提示
    if (appState.userScrolledUp) {
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'flex';
      }
      return;
    }

    // 不在底部附近 → 显示提示
    if (this.elements.newMsgHint) {
      this.elements.newMsgHint.style.display = 'flex';
    }
  }
  
  isNearBottom(threshold = 100) {
    if (!this.container) return true;
    const scrollTop = this.container.scrollTop;
    const scrollHeight = this.container.scrollHeight;
    const clientHeight = this.container.clientHeight;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }

  /**
   * 设置发送状态
   */
  setSendingState(isSending) {
    this.isSendingMessage = isSending;
    
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = isSending;
      this.elements.sendBtn.style.display = isSending ? 'none' : 'inline-block';
    }
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = !isSending;
      this.elements.stopBtn.style.display = isSending ? 'inline-block' : 'none';
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    console.warn(`[ChatPanel] stopGeneration (用户点击停止) session=${appState.currentSessionId}`);
    // 无论 currentAbortController 状态如何，都发送服务端终止请求
    // 解决前端状态已清空时停止按钮"无效"的问题
    const sessionId = appState.currentSessionId;
    if (sessionId) {
      fetch('/api/tool/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId: null, sessionId })
      }).catch(() => {});
    }

    // 立即恢复发送状态：不等 SSE abort 生效，用户点终止后可马上发新消息。
    // 旧流的收尾逻辑由 sendMessage 的代际守卫保护，不会污染新一轮发送。
    this.setSendingState(false);

    if (!this.currentAbortController) {
      return;
    }
    
    if (this.isCompleted) {
      return;
    }
    
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = true;
    }
    
    // 中止服务端正在运行的 bash 进程。
    // 运行中工具统一登记在全局 RunningToolRegistry（主 SSE 流与确认 SSE 流共用一份），
    // 一次性收集全部 toolCallId 发 abort，避免漏掉任一入口注册的运行中进程。
    for (const toolCallId of RunningToolRegistry.all()) {
      fetch('/api/tool/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, sessionId })
      }).catch(() => {});
    }
    RunningToolRegistry.clear();
    
    this.chatService.stopGeneration(this.currentAbortController);

    // 自愈：停止生成时标记所有未完成的 tool 卡片
    this._healStuckToolCards(true);
    this._clearStuckTimer();
  }

  /**
   * 启动 stuck 定时器：SSE 流结束后 30s 检查一次是否有卡在 running 状态的 tool。
   * 兜底机制——前 4 层防护都失效时的最终防线。
   */
  _startStuckTimer() {
    this._clearStuckTimer();
    this._stuckTimer = setTimeout(() => {
      this._healStuckToolCards();
      this._stuckTimer = null;
    }, 30000);
  }

  _clearStuckTimer() {
    if (this._stuckTimer) {
      clearTimeout(this._stuckTimer);
      this._stuckTimer = null;
    }
  }

  /**
   * 自愈：标记所有未完成的 tool 卡片为已取消或中断。
   * 不再直接操作 DOM——RenderPipeline 的增量更新会通过指纹检测到
   * seg.result 的变化（running → interrupted/cancelled），自动刷新 UI。
   * @param {boolean} fromStopBtn - 是否来自用户主动点击停止按钮（true 时也清理待确认的卡片）
   */
  _healStuckToolCards(fromStopBtn = false) {
    const session = this._activeSession;
    if (!session) return;

    const contentDiv = this._activeSession?.getContentDiv();
    if (!contentDiv) return;

    // 用户主动停止时，也把等待确认的卡片标记为已取消
    if (fromStopBtn) {
      const toolSegments = session.getSegments().filter(s => s.type === 'tool');
      for (const seg of toolSegments) {
        if (seg.confirmationData && !seg.result) {
          seg.confirmationData = null;
          seg.result = 'cancelled';
          seg.error = '用户中断了对话';
        }
      }
    }

    const modified = session.healStuckCards();
    if (modified.length === 0 && !fromStopBtn) return;

    // 恢复 footer 显示（移除 pending-confirm 状态）
    this._restoreFooterAfterHeal(contentDiv);
  }

  /**
   * 在自愈操作后恢复消息 footer 的显示
   */
  _restoreFooterAfterHeal(contentDiv) {
    const msgDiv = contentDiv.closest('.message.assistant');
    if (msgDiv) {
      msgDiv.classList.remove('pending-confirm');
    }
  }

  /**
   * 从服务端消息数组加载历史消息（会话切换时调用）
   * 委托给 HistoryRenderer 处理
   */
  async loadHistoryMessages(messages, noAnimation = false) {
    await this.historyRenderer.loadHistoryMessages(messages, noAnimation);
  }

  /**
   * 销毁组件
   */
  destroy() {
    this._destroyed = true;
    this.isCompleted = true;
    this.renderPipeline.destroy();
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    if (this._unsubscribeSelectionAction) {
      this._unsubscribeSelectionAction();
    }
    if (this._inputResizeHandler) {
      document.removeEventListener('input', this._inputResizeHandler);
      this._inputResizeHandler = null;
    }
    if (this._dragOverHandler) {
      document.removeEventListener('dragover', this._dragOverHandler);
      document.removeEventListener('dragleave', this._dragLeaveHandler);
      document.removeEventListener('drop', this._dropHandler);
      this._dragOverHandler = this._dragLeaveHandler = this._dropHandler = null;
    }
    if (this.imageUpload) {
      this.imageUpload.destroy();
    }
  }
}

window.toggleThinkingRow = function(headerEl) {
  const row = headerEl.closest('.thinking-row.completed');
  if (!row) return;
  const content = row.querySelector('.thinking-row-content');
  if (!content) return;

  if (row.classList.contains('expanded')) {
    content.style.maxHeight = '0';
    row.classList.remove('expanded');
    content.style.overflowY = '';
  } else {
    content.style.display = 'block';
    const h = content.scrollHeight;
    const expandedPadding = 16;
    const totalH = h + expandedPadding;
    const isCapped = totalH > 300;
    content.style.maxHeight = isCapped ? '300px' : totalH + 'px';
    content.style.overflowY = 'hidden';
    row.classList.add('expanded');
    const onEnd = (e) => {
      if (e.propertyName !== 'max-height') return;
      content.removeEventListener('transitionend', onEnd);
      if (isCapped) {
        content.style.overflowY = 'auto';
      }
    };
    content.addEventListener('transitionend', onEnd);
  }
};

/**
 * 展开/收起联网搜索摘要行的详情列表（与 toggleThinkingRow 同机制）。
 * 仅在完成态且有详情（web-search-row-detail）时可展开。
 */
window.toggleWebSearchRow = function(headerEl) {
  const row = headerEl.closest('.web-search-row.completed');
  if (!row) return;
  const content = row.querySelector('.web-search-row-detail');
  if (!content) return;

  if (row.classList.contains('expanded')) {
    content.style.maxHeight = '0';
    row.classList.remove('expanded');
    content.style.overflowY = '';
  } else {
    content.style.display = 'block';
    const h = content.scrollHeight;
    const expandedPadding = 16;
    const totalH = h + expandedPadding;
    const isCapped = totalH > 300;
    content.style.maxHeight = isCapped ? '300px' : totalH + 'px';
    content.style.overflowY = 'hidden';
    row.classList.add('expanded');
    const onEnd = (e) => {
      if (e.propertyName !== 'max-height') return;
      content.removeEventListener('transitionend', onEnd);
      if (isCapped) {
        content.style.overflowY = 'auto';
      }
    };
    content.addEventListener('transitionend', onEnd);
  }
};
