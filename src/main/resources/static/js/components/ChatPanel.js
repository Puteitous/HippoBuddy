// 聊天面板核心组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { showToast } from '../utils/toast.js';
import { EventBus } from '../utils/event-bus.js';
import { RenderPipeline } from './RenderPipeline.js';
import { EventRouter } from './EventRouter.js';
import { MessageSession } from './MessageSession.js';
import { getFileIconInfo } from '../utils/file-icons.js';
import { ContextSelector } from './context-selector.js';

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
    this._runningToolCallIds = new Set();
    this._stuckTimer = null;
    this._destroyed = false;

    this._activeSession = null;

    this.renderPipeline = new RenderPipeline(chatUI, {
      bindAskUserCard: (card) => this._bindAskUserCardEvents(card),
      onConfirmationClick: (e) => {
        const btn = e.currentTarget;
        const confirmId = btn.dataset.confirmId;
        const decision = btn.classList.contains('allow') ? 'allow' : 'deny';
        const item = btn.closest('.tool-timeline-item');
        const checkbox = item?.querySelector('.auto-allow-checkbox');
        const autoAllowSimilar = checkbox ? checkbox.checked : false;
        const session = this._activeSession;

        // 拒绝操作或非删除确认，直接执行
        if (decision !== 'allow' || !btn.classList.contains('delete-confirm')) {
          this._doConfirm(confirmId, decision, autoAllowSimilar, session, item);
          return;
        }

        // 删除文件二次确认弹窗
        const seg = session?.getSegments().find(s =>
          s.type === 'tool' && s.confirmationData && s.confirmationData.confirmId === confirmId
        );
        const total = seg?.confirmationData?.totalCount || 0;
        const overlay = document.getElementById('deleteConfirmOverlay');
        const modalText = document.getElementById('deleteConfirmModalText');
        modalText.textContent = `确认删除 ${total} 个文件？此操作不可撤销`; 
        overlay.style.display = 'flex';

        const onConfirm = () => {
          overlay.style.display = 'none';
          document.getElementById('deleteConfirmOk').removeEventListener('click', onConfirm);
          document.getElementById('deleteConfirmCancel').removeEventListener('click', onCancel);
          this._doConfirm(confirmId, decision, autoAllowSimilar, session, item);
        };
        const onCancel = () => {
          overlay.style.display = 'none';
          document.getElementById('deleteConfirmOk').removeEventListener('click', onConfirm);
          document.getElementById('deleteConfirmCancel').removeEventListener('click', onCancel);
        };

        document.getElementById('deleteConfirmOk').addEventListener('click', onConfirm);
        document.getElementById('deleteConfirmCancel').addEventListener('click', onCancel);
      },
      afterRender: () => this.smartScroll()
    });

    this.eventRouter = this._createEventRouter();

    // 上下文选择器（规则 + 技能）
    this._contextSelector = new ContextSelector({
      onRulesChange: (selectedIds) => {
        // 选中变化时无需额外操作，sendMessage 时读取即可
      },
      onSkillToggle: (skill, selected) => {
        const bar = this._getActiveRefsBar();
        if (!bar) return;
        if (selected) {
          this._addRefChip(bar, skill.filePath, 'file', skill.filePath, null, null, { skillPath: skill.filePath });
        } else {
          const chip = bar.querySelector(`[data-file-path="${skill.filePath.replace(/\\/g, '/')}"]`);
          if (chip) chip.remove();
          if (bar.children.length === 0) bar.style.display = 'none';
        }
      },
      onRuleToggle: (rule, selected) => {
        const bar = this._getActiveRefsBar();
        if (!bar) return;
        if (selected) {
          this._addRuleRefChip(bar, rule);
        } else {
          const chip = bar.querySelector(`[data-rule-id="${rule.id}"]`);
          if (chip) chip.remove();
          if (bar.children.length === 0) bar.style.display = 'none';
        }
      }
    });

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

    // 将上下文选择器按钮添加到输入区域
    this._injectContextSelectorButton();

    // 监听文本选中快捷操作 → 插入输入框
    this._unsubscribeSelectionAction = EventBus.on('selection:add-to-input', ({ text, refType, filePath, startLine, endLine, selectedText }) => {
      const bar = this._getActiveRefsBar();
      if (bar) {
        this._addRefChip(bar, text, refType, filePath, startLine, endLine, undefined, selectedText);
        const input = this._getActiveInput();
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
  }
  
  bindEvents() {
    if (!this.container) return;
    // 输入框事件：统一事件代理，自动适配 hero / session
    this.container.addEventListener('keydown', (e) => {
      const input = e.target.closest('#messageInput, #heroInput');
      if (!input) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.isSendingMessage) return;
        const content = this._getCombinedInput();
        if (content) {
          input.value = '';
          input.style.height = 'auto';
          if (input.id === 'heroInput') {
            appState.heroDraft = ''; // 清空 hero 草稿，避免重建会话时恢复
          }
          this.sendMessage(content);
        }
      }
      // Backspace 删除最后一个引用卡片（输入框为空或光标在开头时）
      if (e.key === 'Backspace' && (input.value === '' || input.selectionStart === 0)) {
        const refsBar = this._getActiveRefsBar();
        if (refsBar && refsBar.children.length > 0) {
          e.preventDefault();
          const chip = refsBar.lastElementChild;
          chip.remove();
          if (refsBar.children.length === 0) refsBar.style.display = 'none';
          this._notifyChipRemoved(chip);
        }
      }
    });
    
    this._inputResizeHandler = (e) => {
      const input = e.target.closest('#messageInput, #heroInput');
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
          const content = this._getCombinedInput();
          if (content) {
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = 'auto';
            this.sendMessage(content);
          }
        }
        // Backspace 删除最后一个引用卡片（输入框为空或光标在开头时）
        if (e.key === 'Backspace' && (this.elements.messageInput.value === '' || this.elements.messageInput.selectionStart === 0)) {
          const refsBar = this._getActiveRefsBar();
          if (refsBar && refsBar.children.length > 0) {
            e.preventDefault();
            const chip = refsBar.lastElementChild;
            chip.remove();
            if (refsBar.children.length === 0) refsBar.style.display = 'none';
            this._notifyChipRemoved(chip);
          }
        }
      });
    }
    
    // Hero 快捷建议按钮
    this.container.addEventListener('click', (e) => {
      // 河马互动：点击弹跳 + 吐泡泡
      const hippo = e.target.closest('.empty-hero-logo');
      if (hippo) {
        hippo.classList.remove('bouncing');
        void hippo.offsetWidth;
        hippo.classList.add('bouncing');
        setTimeout(() => hippo.classList.remove('bouncing'), 500);
        this._spawnHippoBubbles(hippo);
        this._spawnHippoSpeech(hippo);
        return;
      }
      
      const suggestionBtn = e.target.closest('.empty-hero-suggestion');
      if (suggestionBtn) {
        const prompt = suggestionBtn.dataset.prompt;
        if (prompt) {
          this.sendMessage(prompt);
        }
      }
      // Hero 发送按钮
      const heroSendBtn = e.target.closest('#heroSendBtn');
      if (heroSendBtn) {
        const input = this._getActiveInput();
        if (input) {
          const content = this._getCombinedInput();
          if (content) {
            input.value = '';
            input.style.height = 'auto';
            appState.heroDraft = ''; // 清空 hero 草稿，避免重建会话时恢复
            this.sendMessage(content);
          }
        }
      }
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
    
    // 点击新消息提示
    if (this.elements.newMsgHint) {
      this.elements.newMsgHint.addEventListener('click', () => {
        this.chatUI.scrollToBottom();
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
      const inputArea = e.target.closest('#inputContainer, .empty-hero-input-area');
      if (!inputArea) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      inputArea.classList.add('drag-over');
    };

    this._dragLeaveHandler = (e) => {
      const inputArea = e.target.closest('#inputContainer, .empty-hero-input-area');
      if (!inputArea) return;
      // 只在真正离开容器时移除高亮
      const related = e.relatedTarget;
      if (!related || !inputArea.contains(related)) {
        inputArea.classList.remove('drag-over');
      }
    };

    this._dropHandler = (e) => {
      const inputArea = e.target.closest('#inputContainer, .empty-hero-input-area');
      if (!inputArea) return;
      e.preventDefault();
      inputArea.classList.remove('drag-over');

      const bar = this._getActiveRefsBar();
      if (!bar) return;

      // 从文件树拖拽 → text/plain 包含文件路径
      const path = e.dataTransfer.getData('text/plain');
      if (path) {
        const dragType = e.dataTransfer.getData('text/x-hippo-type');
        this._addRefChip(bar, path, 'file', path, undefined, undefined, { isDirectory: dragType === 'directory' });
        const input = this._getActiveInput();
        if (input) input.focus();
        return;
      }

      // 从 OS 资源管理器拖入 → e.dataTransfer.files 包含 File 对象
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (const file of files) {
          const filePath = file.path || file.fullPath;
          if (filePath) {
            this._addRefChip(bar, filePath, 'file', filePath);
          }
        }
        const input = this._getActiveInput();
        if (input) input.focus();
      }
    };

    document.addEventListener('dragover', this._dragOverHandler);
    document.addEventListener('dragleave', this._dragLeaveHandler);
    document.addEventListener('drop', this._dropHandler);
  }
  
  /**
   * 获取合并后的输入内容：@path 引用 + 用户键入文字
   */
  _getCombinedInput() {
    const refsBar = this._getActiveRefsBar();
    const input = this._getActiveInput();
    const typed = input?.value.trim() || '';

    const chips = refsBar ? [...refsBar.querySelectorAll('.input-ref-chip')] : [];
    const refTexts = chips.map(c => {
      if ((c.dataset.refType === 'file' || c.dataset.refType === 'rule') && c.dataset.filePath) {
        const sl = c.dataset.startLine;
        const el = c.dataset.endLine;
        const hasLines = sl && el && sl !== 'undefined' && el !== 'undefined';
        const ref = hasLines
          ? `@${c.dataset.filePath}:${sl}-${el}`
          : `@${c.dataset.filePath}`;
        // 二进制文件预览带选中文字 → 追加在 @path 后面
        if (c.dataset.selectedText) {
          return ref + '\n```\n' + c.dataset.selectedText + '\n```';
        }
        return ref;
      }
      // 纯文本 → 代码块
      const full = c.title || c.textContent.replace('×', '').trim();
      return '```\n' + full + '\n```';
    });

    if (refTexts.length === 0) return typed;
    return refTexts.join('\n') + (typed ? '\n\n' + typed : '');
  }

  /**
   * 添加引用卡片到指定栏
   * @param {HTMLElement} bar - refs 栏容器
   * @param {string} text - 引用文本
   * @param {string} refType - 'file' | 'text'
   * @param {string} [filePath]
   * @param {number} [startLine]
   * @param {number} [endLine]
   * @param {{ isDirectory?: boolean, ruleId?: string }} [options] - ruleId 表示这是规则引用卡片
   * @param {string} [selectedText] - 二进制文件预览的选中文字内容
   */
  _addRefChip(bar, text, refType, filePath, startLine, endLine, options, selectedText) {
    const chip = document.createElement('span');
    chip.className = 'input-ref-chip';
    if (refType === 'file' && filePath) {
      const fileName = filePath.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName, { isDirectory: options?.isDirectory });
      const hasLines = startLine != null && endLine != null;
      chip.innerHTML = `<img src="icons/${iconFile}" class="input-ref-chip-icon" draggable="false"> <span class="input-ref-chip-text">${fileName}</span>${hasLines ? `<span class="input-ref-chip-lines">${startLine}-${endLine}</span>` : ''}`;
      chip.title = hasLines ? `${filePath}:${startLine}-${endLine}` : filePath;
      chip.dataset.refType = options?.ruleId ? 'rule' : 'file';
      chip.dataset.filePath = filePath.replace(/\\/g, '/');
      if (options?.ruleId) chip.dataset.ruleId = options.ruleId;
      if (options?.skillPath) chip.dataset.skillPath = options.skillPath;
      if (startLine != null) chip.dataset.startLine = startLine;
      if (endLine != null) chip.dataset.endLine = endLine;
      if (selectedText) chip.dataset.selectedText = selectedText;
      chip.classList.add('input-ref-chip-navigable');
    } else {
      const textSpan = document.createElement('span');
      textSpan.className = 'input-ref-chip-text';
      textSpan.textContent = text.length > 120 ? text.slice(0, 120) + '…' : text;
      chip.appendChild(textSpan);
      chip.title = text;
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'input-ref-chip-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chip.remove();
      // 卡片清空后隐藏栏
      if (bar.children.length === 0) bar.style.display = 'none';
      this._notifyChipRemoved(chip);
    });
    chip.appendChild(closeBtn);
    bar.appendChild(chip);
    bar.style.display = 'flex';
    bar.dispatchEvent(new Event('refs-changed', { bubbles: true }));
  }

  /** 在 refs 栏添加一条规则引用卡片 */
  _addRuleRefChip(bar, rule) {
    this._addRefChip(bar, rule.filePath || rule.name, 'file', rule.filePath, null, null, {
      ruleId: rule.id,
    });
  }

  /**
   * 清空当前可见的引用卡片栏
   */
  _clearRefs() {
    const bar = this._getActiveRefsBar();
    if (bar) {
      bar.innerHTML = '';
      bar.style.display = 'none';
    }
  }

  /**
   * 移除 chip 时同步通知 ContextSelector 取消勾选
   */
  _notifyChipRemoved(chip) {
    if (chip.dataset.ruleId) {
      this._contextSelector?.deselectRule(chip.dataset.ruleId);
    } else if (chip.dataset.skillPath) {
      this._contextSelector?.deselectSkill(chip.dataset.skillPath);
    }
  }

  // ── 模式检测辅助方法 ────────────────────────────

  /** 当前是否为会话态（相对于 hero 空态） */
  _isSession() {
    return this.container?.closest('.chat-panel')?.classList.contains('has-messages') ?? false;
  }

  /** 获取当前可见的输入框元素 */
  _getActiveInput() {
    // session 态用 #messageInput，hero 态用 #heroInput
    const id = this._isSession() ? 'messageInput' : 'heroInput';
    return document.getElementById(id) || document.getElementById('messageInput') || document.getElementById('heroInput');
  }

  /** 获取当前可见的引用卡片栏 */
  _getActiveRefsBar() {
    const id = this._isSession() ? 'inputRefs' : 'heroInputRefs';
    return document.getElementById(id) || document.getElementById('inputRefs') || document.getElementById('heroInputRefs');
  }

  /** 注入上下文选择器按钮到当前可见的输入区 */
  _injectContextSelectorButton() {
    if (!this._contextSelector) return;
    const btn = this._contextSelector.getButtonElement();

    // 有消息模式 → 注入到底部状态栏（hero 可能正在 fade-out，不能用 isConnected 判断）
    if (this._isSession()) {
      const statusBarLeft = document.querySelector('.status-bar-left');
      if (statusBarLeft) {
        statusBarLeft.insertBefore(btn, statusBarLeft.firstChild);
      }
      return;
    }

    // 空状态 → 注入到 hero 操作栏
    const heroSlot = document.getElementById('heroContextSelector');
    if (heroSlot?.isConnected) {
      if (btn.parentNode !== heroSlot) {
        heroSlot.prepend(btn);
      }
    }
  }

  /** 重新注入上下文选择器（在 hero 重建后调用） */
  reInjectContextSelector() {
    this._injectContextSelectorButton();
    // 同步 hero 模型按钮的显示文本
    const heroModelBtn = document.getElementById('heroModelQuickSelect');
    const bottomModelBtn = document.getElementById('modelQuickSelect');
    if (heroModelBtn && bottomModelBtn) {
      heroModelBtn.textContent = bottomModelBtn.textContent;
    }
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
    
    const content = (typeof overrideContent === 'string' && overrideContent)
      ? overrideContent
      : this._getCombinedInput();
    
    if (!content) {
      console.log('⏭️ sendMessage 跳过：内容为空');
      return;
    }

    // 新消息开始，清理跨轮残留的 runningToolCallIds
    this._runningToolCallIds.clear();

    this._healStuckToolCards();

    if (this.elements.messageInput) {
      this.elements.messageInput.value = '';
      this.elements.messageInput.style.height = 'auto';
    }
    
    this._clearRefs();
    this._contextSelector.clearSelection();
    
    this.lastUserMessage = content;
    EventBus.emit('session:auto-name', { sessionId: appState.currentSessionId });

    // 立即并行发起标题生成，不等第一轮对话结束
    // 传递 content 作为兜底，解决标题 API 比 Chat API 先到达后端的竞态
    this._generateSessionTitle(content);
    
    const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this._lastUserMessageId = tempId;
    const { msgDiv } = this.chatUI.appendUserMessage(content, tempId, true);
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
      smartScroll: () => this.smartScroll()
    });
    this._activeSession = session;

    const onRetry = () => {
      if (!this.lastUserMessage) return;
      this.chatService.stopGeneration(this.currentAbortController);
      this.currentAbortController = new AbortController();
      this.sendMessage(this.lastUserMessage);
    };

    const selectedRules = this._contextSelector?.getSelectedRuleIds() || [];

    await session.start({
      sessionId: appState.currentSessionId,
      content,
      signal: this.currentAbortController?.signal,
      systemPrompt: appState.getSystemPrompt(),
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

    // SSE 流结束，启动兜底定时器检查 stuck tool（30s 后运行）
    this._startStuckTimer();

    this.isCompleted = true;
    this.setSendingState(false);
    this.currentAbortController = null;
    
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
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
        this._showAskUserCard(parsed.question, parsed.options, parsed.allow_custom_input, contentDiv);
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
        contentDiv.innerHTML = '';
      },

      retry: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🔄 ${escapeHtml(parsed.message)}</div>`;
        const session = s();
        if (!session) return;
        session.clearAll();
      },

      sse_error: (parsed) => {
        const session = s();
        if (!session) return;
        session.clearReasoning();
        session.setCurrentText('⚠️ ' + parsed.message);
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
      },

      raw_error: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<span style="color: var(--error-color);">❌ ${escapeHtml(parsed.content)}</span>`;
      },

      reasoning: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        session.handleReasoning(parsed, contentDiv);
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
        this.smartScroll();
      },

      reasoning_done: () => {
        const session = s();
        if (!session) return;
        session.handleReasoningDone();
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      },

      content: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        session.handleContent(parsed, contentDiv);
        this.renderPipeline.markTextOnly();
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
        this.smartScroll();
      },

      tool_start: (parsed, contentDiv) => {
        const session = s();
        if (!session) return;
        if (parsed.id && this._runningToolCallIds.has(parsed.id)) {
          return;
        }
        if (parsed.id) this._runningToolCallIds.add(parsed.id);
        // 检查 session._segments 中是否已存在相同 id 的 tool segment
        // 主 SSE 流通过 MessageSession._eventRouter 创建 segment，不会更新 ChatPanel._runningToolCallIds
        // 确认 SSE 流通过 ChatPanel.eventRouter 到达此处，需要二次防重
        if (parsed.id && session.getSegments().some(seg => seg.type === 'tool' && seg.id === parsed.id)) {
          return;
        }
        session.handleToolStart(parsed, contentDiv);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());

        if (parsed.name === 'todo_write') {
          const incomingTodos = this.chatUI.parseTodos(parsed.args);
          session.pushTextSegment();
          const existingTodoIndex = session.getSegments().findIndex(
            seg => seg.type === 'tool' && seg.name === 'todo_write' && !seg.result
          );
          let finalTodos;
          if (existingTodoIndex >= 0) {
            const oldSegment = session.getSegments()[existingTodoIndex];
            const oldTodos = this.chatUI.parseTodos(oldSegment.args);
            const todoMap = new Map();
            oldTodos.forEach(todo => { todoMap.set(todo.id, { ...todo }); });
            incomingTodos.forEach(newTodo => {
              if (todoMap.has(newTodo.id)) {
                const existing = todoMap.get(newTodo.id);
                if (newTodo.content) existing.content = newTodo.content;
                if (newTodo.status) existing.status = newTodo.status;
              } else {
                todoMap.set(newTodo.id, {
                  id: newTodo.id, content: newTodo.content || '未命名任务',
                  status: newTodo.status || 'pending'
                });
              }
            });
            finalTodos = Array.from(todoMap.values());
          } else {
            finalTodos = incomingTodos.map(todo => ({
              id: todo.id, content: todo.content || '未命名任务',
              status: todo.status || 'pending'
            }));
          }
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null
          };
          if (existingTodoIndex >= 0) {
             session.updateTodoAtIndex(existingTodoIndex, todoSegment);
          } else {
            session.pushSegment(todoSegment);
          }
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
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
      },

      tool_progress: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleToolProgress(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
      },

      tool_confirmation: (parsed) => {
        const session = s();
        if (!session) return;
        session.handleToolConfirmation(parsed);
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
        this.renderPipeline.scheduleRender(session.getSegments(), session.getCurrentText());
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

    const speeches = [
      '代码写得不错嘛 🦛',
      '好热🫠',
      '想泡水💧',
      '饿了吗🍉',
      '今天吃什么',
      '又在写 bug 了？',
      '你好呀 👋',
      '让我看看…',
      '这个我熟！',
      '要帮忙吗？',
      '💤 有点困…',
      '该下班了 🕐',
      '正在思考中… 🤔',
      '快夸我快夸我',
      '🦛 哼！',
    ];

    const text = speeches[Math.floor(Math.random() * speeches.length)];

    const speech = document.createElement('div');
    speech.className = 'hippo-speech';
    speech.textContent = text;

    hippoEl.appendChild(speech);
    speech.addEventListener('animationend', () => speech.remove());
  }
  
  _showAskUserCard(question, options, allowCustomInput, container) {
    const session = this._activeSession;
    if (!session) {
      const { contentDiv } = this.chatUI.appendAssistantMessage('');
      const fallbackDiv = container || contentDiv;
      fallbackDiv.innerHTML = `<div style="padding:8px;color:var(--text-muted)">❓ ${escapeHtml(question)}</div>`;
      return;
    }

    const segment = {
      type: 'tool',
      name: 'ask_user',
      args: JSON.stringify({
        question: question,
        options: options || [],
        allow_custom_input: allowCustomInput !== false
      }),
      result: null,
      error: null
    };
    
    if (container) {
      session.pushTextSegment();
      session.pushSegment(segment);
      this._askUserContentDiv = container;
      
      this.renderPipeline.setContainer(container);
      this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
    } else {
      const { contentDiv } = this.chatUI.appendAssistantMessage('');
      const segments = [segment];
      this._askUserContentDiv = contentDiv;
      this.renderSegments(contentDiv, segments, '');
    }
  }
  
  _sendAskUserResponse(message) {
    if (!message || this.isSendingMessage) return;
    
    const sessionId = appState.currentSessionId;
    if (!sessionId) return;
    
    this.isSendingMessage = true;
    this.setSendingState(true);
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
    }
    this.currentAbortController = new AbortController();
    
    this.chatUI.appendUserMessage(message);
    
    const session = new MessageSession({
      chatUI: this.chatUI,
      renderPipeline: this.renderPipeline,
      chatService: this.chatService,
      smartScroll: () => this.smartScroll()
    });
    this._activeSession = session;

    const askUserMessage = message;
    const onRetry = () => {
      if (!askUserMessage) return;
      this.chatService.stopGeneration(this.currentAbortController);
      this.isSendingMessage = false;
      this.currentAbortController = new AbortController();
      this._sendAskUserResponse(askUserMessage);
    };

    session.start({
      sessionId,
      content: message,
      signal: this.currentAbortController?.signal,
      useExecuteRequest: true,
      onRetry
    }).finally(() => {
      this.isSendingMessage = false;
      this.setSendingState(false);
      this.currentAbortController = null;
      EventBus.emit('message:sent');
    });
  }

  _doConfirm(confirmId, decision, autoAllowSimilar, session, item) {
    // 清除 segment 的确认状态，UI 从确认弹窗切换到"运行中..."，防止重复点击
    if (session && confirmId) {
      const seg = session.getSegments().find(s =>
        s.type === 'tool' && s.confirmationData && s.confirmationData.confirmId === confirmId
      );
      if (seg) {
        seg.confirmationData = null;
        this._pendingConfirmSeg = seg; // 保存引用，供 404 错误恢复使用
        this.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      }
    }
    this._sendToolConfirmResponse(confirmId, decision, autoAllowSimilar);
    if (item) {
      const detail = item.querySelector('.tool-timeline-detail');
      if (detail) {
        detail.style.maxHeight = '0';
      }
      item.classList.remove('expanded');
    }
  }

  _sendToolConfirmResponse(confirmId, decision, autoAllowSimilar) {
    const sessionId = appState.currentSessionId;
    if (!sessionId || !confirmId) return;

    const btn = document.querySelector(`.confirmation-btn.${decision}[data-confirm-id="${confirmId}"]`);
    if (btn) btn.disabled = true;

    // 恢复发送状态，显示终止按钮
    this.isSendingMessage = true;
    this.setSendingState(true);
    this.currentAbortController = new AbortController();
    this.isCompleted = false;

    fetch('/api/tool/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        confirmId,
        decision,
        autoAllowSimilar: !!autoAllowSimilar
      }),
      signal: this.currentAbortController.signal
    }).then(async response => {
      if (!response.ok) {
        return response.json().then(err => {
          showToast(err.error || '确认请求失败', { type: 'error', duration: 4000 });
          // 后端超时或确认请求失败，将 segment 标记为已取消
          if (this._pendingConfirmSeg) {
            this._pendingConfirmSeg.result = 'cancelled';
            this._pendingConfirmSeg.error = err.error || '确认已超时';
            this._pendingConfirmSeg = null;
            if (this._activeSession) {
              this.renderPipeline.flush(this._activeSession.getSegments(), this._activeSession.getCurrentText());
            }
          }
          if (btn) btn.disabled = false;
        });
      }

      const contentDiv = this._activeSession?.getContentDiv();
      const btnContainer = this._activeSession?.getBtnContainer();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let dataBuffer = '';

      const flushDataBuffer = () => {
        if (!dataBuffer) return;
        try {
          const parsed = JSON.parse(dataBuffer);
          parsed._eventType = currentEvent;
          this.handleChunk(parsed, contentDiv, btnContainer);
        } catch (e) {
          console.error('[ConfirmSSE] 解析失败:', e.message, dataBuffer.slice(0, 500));
        }
        dataBuffer = '';
      };

      const processLines = (lines) => {
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            flushDataBuffer();
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataBuffer += line.substring(6);
          } else if (line === '') {
            flushDataBuffer();
          }
        }
        flushDataBuffer();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          processLines(lines);
        }

        if (buffer.trim()) {
          processLines(buffer.split('\n'));
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('读取确认 SSE 流失败:', e);
      }

      const session = this._activeSession;
      if (session) {
        session.pushTextSegment();
        if (contentDiv) this.renderPipeline.setContainer(contentDiv);
        this.renderPipeline.renderFinal(session.getSegments(), '');
        // 重建 dataset.markdown，使之包含确认流后新增的文本内容
        const textSegments = session.getSegments()
          .filter(s => s.type === 'text')
          .map(s => s.content);
        if (session.getCurrentText().trim()) textSegments.push(session.getCurrentText());
        contentDiv.dataset.markdown = textSegments.join('');
        // 内容已完整渲染，显示操作按钮
        session.showActionButtons();
        this.smartScroll();
      }

    }).catch(err => {
      if (err.name === 'AbortError') return;
      console.error('确认请求失败:', err);
      showToast('确认请求失败', { type: 'error', duration: 4000 });
      if (btn) btn.disabled = false;
      // 错误时也显示操作按钮，让用户能重试
      if (this._activeSession) {
        this._activeSession.showActionButtons();
      }
    }).finally(() => {
      this.isSendingMessage = false;
      this.setSendingState(false);
      this.currentAbortController = null;
      this.isCompleted = true;
      EventBus.emit('message:sent');
    });
  }
  
  _bindAskUserCardEvents(card) {
    const details = card.querySelector('.tool-call-details');
    if (!details) return;

    details.style.transition = 'none';
    const h = details.scrollHeight;
    details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
    details.style.transition = '';
    card.classList.add('expanded');

    const optionBtns = card.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const option = btn.getAttribute('data-option');
        if (option) {
          details.style.maxHeight = '0';
          card.classList.remove('expanded');
          this._sendAskUserResponse(option);
        }
      });
    });
  }
  
  /**
   * 智能滚动
   * 距底 < 100px 时总是滚动（不受 userScrolledUp 阻挡），
   * 解决内容增长导致 scroll 事件误将 userScrolledUp 置为 true 的问题。
   */
  smartScroll() {
    // 距底 < 100px → 不管 userScrolledUp 状态如何，重置并滚动
    if (this.isNearBottom(100)) {
      appState.userScrolledUp = false;
      this.chatUI.scrollToBottom();
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'none';
      }
      return;
    }

    // userScrolledUp 且不在底部附近 → 跳过滚动显示新消息提示
    if (appState.userScrolledUp) {
      if (this.elements.newMsgHint) {
        this.elements.newMsgHint.style.display = 'flex';
      }
      return;
    }

    // 不在底部附近但 userScrolledUp=false → 仅显示提示
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
   * 将错误分类为用户友好的消息
   */
  _classifyError(error) {
    const msg = error.message || '';
    
    if (error.name === 'TypeError' && (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
      return { message: '网络连接失败，请检查后端服务是否正常运行', detail: '无法与服务器建立连接，请确认服务已启动且网络通畅' };
    }
    
    if (msg.includes('超时') || msg.includes('timeout') || msg.includes('Timeout')) {
      return { message: '请求超时，服务响应时间过长', detail: '请稍后重试，或检查服务是否负载过高' };
    }
    
    if (msg.includes('HTTP error') || /status:? \d{3}/i.test(msg)) {
      const statusMatch = msg.match(/(\d{3})/);
      const status = statusMatch ? statusMatch[1] : '';
      if (status === '502' || status === '503' || status === '504') {
        return { message: `服务暂时不可用 (${status})`, detail: '后端服务暂时无法处理请求，请稍后重试' };
      }
      if (status === '429') {
        return { message: '请求过于频繁 (429)', detail: '请稍后重试' };
      }
      if (status === '401' || status === '403') {
        return { message: `权限不足 (${status})`, detail: '请检查认证信息是否正确' };
      }
      return { message: `服务异常 (${status || msg})`, detail: '请稍后重试，如问题持续请联系管理员' };
    }
    
    if (msg.includes('LLM 未返回有效内容')) {
      return { message: 'AI 未返回有效响应', detail: '请尝试重新发送消息' };
    }
    
    return { message: msg || '未知错误', detail: null };
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

    if (!this.currentAbortController) {
      return;
    }
    
    if (this.isCompleted) {
      return;
    }
    
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = true;
    }
    
    // 中止服务端正在运行的 bash 进程
    for (const toolCallId of this._runningToolCallIds) {
      fetch('/api/tool/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, sessionId })
      }).catch(() => {});
    }
    this._runningToolCallIds.clear();
    
    this.chatService.stopGeneration(this.currentAbortController);

    // 自愈：停止生成时标记所有未完成的 tool 卡片
    this._healStuckToolCards();
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
   * 自愈：标记所有未完成的 tool 卡片为已取消或中断
   * 用户忽略了确认弹窗，或停止了生成，需要修复 UI 状态
   */
  _healStuckToolCards() {
    const session = this._activeSession;
    if (!session) return;

    const modified = session.healStuckCards();
    if (modified.length === 0) return;

    const contentDiv = this._activeSession?.getContentDiv();
    if (!contentDiv) return;

    // 收集所有 tool segment，按索引与 DOM 中的 .tool-timeline-item 顺序对应
    const toolSegments = session.getSegments().filter(s => s.type === 'tool');
    const stuckStatuses = new Map(); // DOM 索引 → 目标状态
    toolSegments.forEach((seg, i) => {
      if (seg.result === 'cancelled' || seg.result === 'interrupted') {
        stuckStatuses.set(i, seg.result);
      }
    });
    if (stuckStatuses.size === 0) return;

    // 直接操作 DOM，不触发 RenderPipeline 全量重建
    // flush → doRender 有 await renderMarkdown，会被后续新消息覆盖
    const statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
    contentDiv.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const targetStatus = stuckStatuses.get(idx);
      if (!targetStatus) return; // ← 核心修复：只改数据层确认 stuck 的，不碰已成功的

      const isCancelled = targetStatus === 'cancelled';
      item.dataset.toolStatus = targetStatus;
      item.classList.remove('expanded');
      const detail = item.querySelector('.tool-timeline-detail');
      if (detail) {
        detail.style.maxHeight = '0';
        detail.innerHTML = isCancelled
          ? '<div class="timeline-detail-status cancelled">已取消（未确认）</div>'
          : '<div class="timeline-detail-status interrupted">执行中断</div>';
      }
      const statusEl = item.querySelector('.tool-timeline-status');
      if (statusEl) {
        statusEl.className = `tool-timeline-status ${targetStatus}`;
        statusEl.innerHTML = statusSvg;
      }
    });
    // 收起 ask_user 卡片
    contentDiv.querySelectorAll('.tool-card.ask-user-card.expanded').forEach(card => {
      const details = card.querySelector('.tool-call-details');
      if (details) {
        details.style.maxHeight = '0';
        card.classList.remove('expanded');
      }
    });
  }

  /**
   * 从消息内容中移除 [会话中断] 标记文本。
   * 用户忽略确认弹窗后刷新页面时，后端 detectAndFixInterruption
   * 会给 assistant 消息追加中断提示。此方法在加载历史时将其滤除，
   * 避免用户看到"待执行的操作: bash"等无用信息。
   */
  _cleanInterruptionText(content) {
    if (!content) return content;
    const idx = content.indexOf('[会话中断]');
    if (idx === -1) return content;
    const cleaned = content.substring(0, idx).trim();
    return cleaned;
  }

  /**
   * 从服务端消息数组加载历史消息（会话切换时调用）
   */
  async loadHistoryMessages(messages, noAnimation = false) {
    const toolResults = {};
    for (const msg of messages) {
      if ((msg.role === 'tool' || msg.role === 'tool-result') && msg.toolCallId) {
        toolResults[msg.toolCallId] = msg;
      }
    }

    const messageRows = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'tool' || msg.role === 'tool-result') {
        i++;
        continue;
      }

      if (msg.role === 'user') {
        messageRows.push({ type: 'user', content: msg.content, id: msg.id });
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

          const rawContent = am.content || '';
          const amText = this._cleanInterruptionText(rawContent);
          const amReasoning = am.reasoning_content || '';
          const hasToolCalls = am.tool_calls && am.tool_calls.length > 0;

          if (!firstMsgTime && am.timestamp) {
            firstMsgTime = am.timestamp;
          }

          if (amText.trim() && !hasToolCalls) {
            if (text.trim()) segments.push({ type: 'text', content: text });
            if (amReasoning) {
              segments.push({ type: 'thinking', content: amReasoning, done: true });
            }
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
              } else {
                // 自愈：历史中 tool 没有对应结果 → 未完成，标记为已取消
                result = 'cancelled';
              }
              segments.push({
                type: 'tool',
                name: tc.name,
                id: tc.id,
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

        messageRows.push({ type: 'assistant', segments, firstMsgTime });
      } else {
        i++;
      }
    }

    // Process markdown + DOM in batches — content appears progressively
    const BATCH_SIZE = 20;
    let isFirstBatch = true;

    this.container.innerHTML = '';

    let precedingUserContent = '';

    for (let batchStart = 0; batchStart < messageRows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, messageRows.length);

      // Render markdown for text segments in this batch only
      const batchRenderTasks = [];
      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];
        if (row.type !== 'assistant') continue;
        for (const seg of row.segments) {
          if (seg.type === 'text' && seg.content && !seg._rendered) {
            batchRenderTasks.push(seg);
          }
        }
      }
      if (batchRenderTasks.length > 0) {
        const results = await Promise.all(batchRenderTasks.map(seg => renderMarkdown(seg.content)));
        for (let ti = 0; ti < batchRenderTasks.length; ti++) {
          batchRenderTasks[ti]._rendered = results[ti];
        }
      }

      // Build DOM for this batch
      const fragment = document.createDocumentFragment();
      const pendingUserEditBtns = [];
      let rowIndex = 0;

      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];

        if (row.type === 'user') {
          if (row.content && row.content.trim()) {
            precedingUserContent = row.content;
            const userRow = document.createElement('div');
            userRow.className = 'message-row user-row';
            if (!noAnimation) {
              userRow.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
              userRow.classList.add('animate-in');
              rowIndex++;
            }

            const userMsgDiv = document.createElement('div');
            userMsgDiv.className = 'message user';
            if (row.id) userMsgDiv.dataset.messageId = row.id;

            // 解析 @path 引用并渲染为卡片
            const { refs, remainingContent } = this.chatUI._parseRefsFromContent(row.content);
            if (refs && refs.length > 0) {
              const refsBar = document.createElement('div');
              refsBar.className = 'message-user-refs';
              refs.forEach(ref => {
                refsBar.appendChild(this.chatUI._createRefChip(ref, true));
              });
              userMsgDiv.appendChild(refsBar);
            }

            const userContentDiv = document.createElement('div');
            userContentDiv.className = 'message-content';
            userContentDiv.textContent = remainingContent ?? row.content;
            userMsgDiv.appendChild(userContentDiv);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            userMsgDiv.appendChild(timeDiv);

            const btnContainer = document.createElement('div');
            btnContainer.className = 'message-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-action-btn';
            copyBtn.title = '复制';
            copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(row.content).then(() => {
                copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                  copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                  copyBtn.classList.remove('copied');
                }, 2000);
              }).catch(() => {});
            });
            btnContainer.appendChild(copyBtn);

            // btnContainer 先 append，让它在 msgDiv 左侧
            userRow.appendChild(btnContainer);
            userRow.appendChild(userMsgDiv);
            fragment.appendChild(userRow);
          }
          continue;
        }

        if (row.type === 'assistant') {
          const segments = row.segments;
          const firstMsgTime = row.firstMsgTime;

          const rowEl = document.createElement('div');
          rowEl.className = 'message-row assistant-row';
          if (!noAnimation) {
            rowEl.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
            rowEl.classList.add('animate-in');
            rowIndex++;
          }

          const msgDiv = document.createElement('div');
          msgDiv.className = 'message assistant';
          if (firstMsgTime) msgDiv.dataset.timestamp = firstMsgTime;
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';

          if (segments.length === 0) {
            contentDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🤖 AI 未返回有效响应，请尝试重新发送</div>';
          } else {
            let html = '';
            let toolTimelineHtml = '';
            const flushToolTimeline = () => {
              if (toolTimelineHtml) {
                html += `<div class="tool-timeline">${toolTimelineHtml}</div>`;
                toolTimelineHtml = '';
              }
            };
            for (const seg of segments) {
              if (seg.type === 'thinking') {
                flushToolTimeline();
                html += RenderPipeline.renderThinkingBubble(seg);
              } else if (seg.type === 'tool') {
                if (seg.name === 'todo_write' || seg.name === 'ask_user') {
                  flushToolTimeline();
                  html += this.chatUI.renderToolCard(seg);
                } else {
                  toolTimelineHtml += this.chatUI.renderToolTimelineRow(seg);
                }
              } else if (seg.type === 'text' && seg.content) {
                flushToolTimeline();
                html += seg._rendered || '';
              }
            }
            flushToolTimeline();
            contentDiv.innerHTML = html;
            contentDiv.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
              this.chatUI.bindToolCardEvents(card);
            });
          }
          msgDiv.appendChild(contentDiv);
          rowEl.appendChild(msgDiv);

          const btnContainer = document.createElement('div');
          btnContainer.className = 'message-actions';

          const retryBtn = document.createElement('button');
          retryBtn.className = 'message-action-btn';
          retryBtn.title = '重试';
          retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
          btnContainer.appendChild(retryBtn);

          const userContent = precedingUserContent;
          retryBtn.onclick = () => {
            if (!userContent) return;
            this.sendMessage(userContent);
          };

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

          const forkBtn = document.createElement('button');
          forkBtn.className = 'message-action-btn fork-btn';
          forkBtn.title = '从此处分叉为新会话';
          forkBtn.innerHTML = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;vertical-align:middle"><path fill="currentColor" d="m76.67 10c-7.366 0-13.337 5.97-13.337 13.333 0 6.204 4.258 11.374 10 12.861v7.139c0 1.841-1.494 3.333-3.333 3.333h-33.333c-3.77 0-7.207 1.299-10 3.412v-13.88c5.742-1.491 10-6.66 10-12.864 0-7.364-5.97-13.334-13.334-13.334s-13.333 5.97-13.333 13.333c0 6.204 4.258 11.374 10 12.858v27.617c-5.742 1.484-10 6.653-10 12.858 0 7.364 5.97 13.334 13.333 13.334s13.333-5.97 13.333-13.333c0-6.205-4.258-11.374-10-12.858v-.476c0-5.523 4.479-10 10-10h33.334c5.521 0 10-4.476 10-10v-7.137c5.739-1.488 10-6.657 10-12.863 0-7.363-5.97-13.333-13.33-13.333z"></path></svg>';
          forkBtn.addEventListener('click', () => EventBus.emit('message:fork', msgDiv));
          btnContainer.appendChild(forkBtn);

          const rawMarkdown = segments.filter(s => s.type === 'text').map(s => s.content).join('');
          contentDiv.dataset.markdown = rawMarkdown;

          copyBtn.onclick = () => {
            const textToCopy = contentDiv.dataset.markdown || contentDiv.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
              copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              copyBtn.classList.add('copied');
              setTimeout(() => {
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                copyBtn.classList.remove('copied');
              }, 2000);
            });
          };

          const footer = document.createElement('div');
          footer.className = 'message-footer';
          footer.appendChild(btnContainer);
          msgDiv.appendChild(footer);
          fragment.appendChild(rowEl);
        }
      }

      if (isFirstBatch) {
        isFirstBatch = false;
        this.container.appendChild(fragment);
        // Reveal container after first batch is in DOM — no flash, no drop
        this.container.classList.remove('switching');
        // Yield to browser so first batch paints before remaining batches
        await new Promise(r => requestAnimationFrame(r));
      } else {
        this.container.appendChild(fragment);
      }

    }

    // 切换到有消息的会话后，将上下文选择器注入到底部状态栏
    this._injectContextSelectorButton();

    this.chatUI.scrollToBottom();
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
