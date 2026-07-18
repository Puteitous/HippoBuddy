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
import { parseTodoArgs } from './tool-renderers/shared.js';

// ── 多模式预设提示词 ──
const _ = (key) => window.i18n ? window.i18n.t(key) : key;
const MODE_PRESETS = {
  chat: [
    { label: () => _('preset.brainstorm'), icon: 'M12 2a5 5 0 0 0-5 5c0 2 1 3.5 2.5 4.5V15a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3.5C16 10.5 17 9 17 7a5 5 0 0 0-5-5z M9 17h6', prompt: '我们来一次头脑风暴！请推荐5个关于【人工智能在日常生活中的应用】的创意想法。每个想法需要说明：核心思路、实现方式和潜在价值。' },
    { label: () => _('preset.polish'), icon: 'M17 3a2 2 0 0 1 2 2L9 15l-4 1 1-4Z M15 5l4 4', prompt: '请帮我润色以下文案，使其更专业、流畅、有说服力：\n\n尊敬的客户，您好！我们是一家专业的软件公司，可以为您提供高质量的软件服务。如果您有兴趣的话，欢迎随时联系我们，谢谢！' },
    { label: () => _('preset.explain'), icon: 'M4 6h16v14H4z M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2', prompt: '请用通俗易懂的方式解释【什么是云计算】。要求：\n1. 用生活中的比喻说明核心概念\n2. 列出至少3个核心优势\n3. 举3个实际应用场景\n4. 让完全不懂技术的人也能听懂' },
    { label: () => _('preset.translate'), icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M6 4.5a16 16 0 0 0 0 15 M18 4.5a16 16 0 0 1 0 15', prompt: '请将以下英文翻译成地道、自然的中文：\n\nIn today\'s rapidly evolving digital landscape, businesses must adapt to new technologies to remain competitive. Artificial intelligence and cloud computing are at the forefront of this transformation, enabling organizations to operate more efficiently and deliver better customer experiences.' },
  ],
  office: [
    { label: () => _('preset.weeklyReport'), icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-4-4z M14 2v4h4 M8 10h8 M8 14h6', prompt: '请帮我写一份本周工作周报，按标准格式输出（包含本周完成、下周计划、风险与问题）。\n\n本周工作内容：\n- 完成新功能模块的开发与自测\n- 修复线上bug 5个\n- 参加2次需求评审会议\n- 整理并更新了项目技术文档\n\n下周计划：\n- 推进新功能上线部署\n- 准备系统架构评审材料' },
    { label: () => _('preset.analyzeData'), icon: 'M4 20h16 M6 16v-4 M12 16v-8 M18 16v-6', prompt: '请分析以下销售数据，给出关键洞察和改进建议：\n\n今年各季度收入：Q1 120万，Q2 150万，Q3 135万，Q4 190万\n去年同期：Q1 100万，Q2 115万，Q3 120万，Q4 155万\n\n请从以下维度分析：\n1. 同比增长情况\n2. 季度趋势与异常点\n3. 改善建议' },
    { label: () => _('preset.pptOutline'), icon: 'M2 3h20v12H2z M8 21h8 M12 15v6', prompt: '请帮我列一份【年度工作总结】的内容大纲，共12个板块左右。\n\n需要包含以下内容：\n1. 年度工作概述\n2. 重点项目回顾\n3. 数据成果展示\n4. 团队建设情况\n5. 存在的问题与改进\n6. 明年工作计划\n\n每个板块需标注核心要点和推荐的数据呈现方式（图表、表格等）。' },
    { label: () => _('preset.meetingMinutes'), icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M8 11h8 M8 15h5', prompt: '请根据以下会议记录整理一份结构清晰的会议纪要：\n\n会议主题：Q2产品迭代评审\n参会人：张总、王工、李设计、刘测试\n\n讨论内容：\n1. 新功能开发进度延后一周，原因是第三方API对接出现技术问题\n2. UI设计方案已确认通过\n3. 测试用例编写完成80%，预计下周三全部完成\n\n决议：\n- 延长开发周期一周，整体上线时间不变\n- 增加API对接的单元测试覆盖\n\n请输出包含会议主题、时间、参与人、讨论内容、决议事项和待办任务的完整会议纪要。' },
  ],
  coding: [
    { label: () => _('preset.codeReview'), icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-6-6', prompt: '请审查以下Java代码，指出潜在问题、性能瓶颈和改进建议：\n\n```java\npublic class UserService {\n    public List<User> getActiveUsers() {\n        List<User> users = new ArrayList<>();\n        for (int i = 0; i < 1000; i++) {\n            User user = userDao.findById(i);\n            if (user != null && user.isActive()) {\n                users.add(user);\n            }\n        }\n        return users;\n    }\n}\n```' },
    { label: () => _('preset.generateTest'), icon: 'M9 3v7L4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 10V3 M9 3h6', prompt: '请为以下Java方法使用JUnit 5 + Mockito编写单元测试：\n\n```java\npublic class Calculator {\n    public int divide(int a, int b) {\n        if (b == 0) {\n            throw new IllegalArgumentException("除数不能为0");\n        }\n        return a / b;\n    }\n}\n```\n\n要求覆盖正常情况、边界情况和异常情况。' },
    { label: () => _('preset.explainCode'), icon: 'M8 6l-5 6 5 6 M16 6l5 6-5 6', prompt: '请分析以下Java代码的工作原理：\n\n```java\npublic class Singleton {\n    private static volatile Singleton instance;\n    private Singleton() {}\n    public static Singleton getInstance() {\n        if (instance == null) {\n            synchronized (Singleton.class) {\n                if (instance == null) {\n                    instance = new Singleton();\n                }\n            }\n        }\n        return instance;\n    }\n}\n```\n\n请解释：1) 这是什么设计模式 2) 为什么用volatile 3) 为什么用双重检查 4) 这种实现方式的优缺点。' },
    { label: () => _('preset.refactor'), icon: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M20.5 15a9 9 0 0 1-14.9 3.4L1 14', prompt: '请对以下Java代码进行重构和优化，提升可读性、可维护性和扩展性：\n\n```java\npublic class DiscountService {\n    public double calculate(double amount, String type) {\n        if (type.equals("VIP")) {\n            return amount * 0.8;\n        } else if (type.equals("GOLD")) {\n            return amount * 0.85;\n        } else if (type.equals("SILVER")) {\n            return amount * 0.9;\n        } else {\n            return amount;\n        }\n    }\n}\n```\n\n请给出重构后的代码并解释你的重构思路。' },
  ],
};

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
        modalText.textContent = _('deleteConfirm.confirmFiles', { count: total }); 
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
    this._bindModeEvents();

    // 初始化模式 UI
    this._syncModeUI(appState.getMode());

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
            appState.clearSessionInputDraft(appState.currentSessionId); // ✨ 发送后清除草稿
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
        // 带选中文字（行数≤50的代码选区 / 二进制文件预览）→ 追加在 @path 后面
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

  // ── 模式切换 ────────────────────────────

  /** 绑定模式切换事件 */
  _bindModeEvents() {
    document.addEventListener('click', (e) => {
      // 模式按钮
      const modeBtn = e.target.closest('.mode-btn');
      if (modeBtn) {
        const mode = modeBtn.dataset.mode;
        if (!mode || mode === appState.getMode()) return;
        appState.setMode(mode);
        this._syncModeUI(mode, true);
        return;
      }
      // 预设提示词按钮
      const presetBtn = e.target.closest('.mode-preset-btn');
      if (presetBtn) {
        const prompt = presetBtn.dataset.prompt;
        if (!prompt) return;
        this._fillPresetToInput(prompt);
      }
    });
  }

  /** 同步模式 UI（高亮激活按钮 + 更新标语 + 更新预设标签） */
  _syncModeUI(mode, animate = false) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (animate) {
      this._animateTitleSwitch(mode);
    } else {
      const sloganMap = { chat: "Let's Chat!", office: "Let's Work!", coding: "Let's Code!" };
      const titleLast = document.querySelector('.title-last');
      if (titleLast) titleLast.textContent = sloganMap[mode] || "Let's Code!";
    }
    this._renderPresets(mode);
  }

  /** 切换标题标语：旧文字淡出 → 更新 → 新文字飞入 */
  _animateTitleSwitch(newMode) {
    // 取消前一次动画的 pending timeout，防止快速点击冲突
    if (this._titleAnimTimer) {
      clearTimeout(this._titleAnimTimer);
      this._titleAnimTimer = null;
    }

    const sloganMap = { chat: "Let's Chat!", office: "Let's Work!", coding: "Let's Code!" };
    const titleLast = document.querySelector('.title-last');
    if (!titleLast) return;

    const newText = sloganMap[newMode] || "Let's Code!";
    // 只有不处于活跃动画且文字相同时才跳过，防止快速切回时卡在淡出态
    if (!this._titleAnimTimer && titleLast.textContent === newText) {
      // 清理前一次动画中断后残留的 inline style
      titleLast.style.transition = '';
      titleLast.style.maxWidth = '';
      titleLast.style.transform = '';
      titleLast.style.opacity = '';
      return;
    }

    const MAX_W = '300px';

    // 1. 旧文字淡出 + 右滑 + 折叠宽度 → title-first 自然居中
    titleLast.style.transition = 'opacity 0.2s ease, transform 0.28s ease, max-width 0.3s ease';
    titleLast.style.maxWidth = MAX_W;
    void titleLast.offsetWidth; // 强制 reflow，让 max-width 生效
    titleLast.style.opacity = '0';
    titleLast.style.transform = 'translateX(20px)';
    titleLast.style.maxWidth = '0';

    this._titleAnimTimer = setTimeout(() => {
      // 2. 更新文字，重置到右侧起始位置（宽度折叠为 0）
      titleLast.textContent = newText;
      titleLast.style.transition = 'none';
      titleLast.style.maxWidth = '0';
      titleLast.style.opacity = '0';
      titleLast.style.transform = 'translateX(100px)';

      // 3. 强制 reflow
      void titleLast.offsetWidth;

      // 4. 飞入 + 弹性回弹 + 展开宽度 → 整体居中
      titleLast.style.transition = 'opacity 0.35s ease, transform 1s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.4s ease 0.05s';
      titleLast.style.maxWidth = MAX_W;
      titleLast.style.opacity = '1';
      titleLast.style.transform = 'translateX(0)';

      // 5. 清理 inline style
      this._titleAnimTimer = setTimeout(() => {
        titleLast.style.transition = '';
        titleLast.style.maxWidth = '';
        titleLast.style.transform = '';
        titleLast.style.opacity = '';
        this._titleAnimTimer = null;
      }, 900);
    }, 350);
  }

  /** 渲染当前模式的预设提示词标签 */
  _renderPresets(mode) {
    const container = document.getElementById('heroPresets');
    if (!container) return;
    const presets = MODE_PRESETS[mode] || MODE_PRESETS.coding;
    container.innerHTML = presets.map(p =>
      `<button class="mode-preset-btn" data-prompt="${this._escapeAttr(p.prompt)}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${p.icon}"/></svg>
        ${typeof p.label === 'function' ? p.label() : p.label}
      </button>`
    ).join('');
  }

  /** 点击预设标签 → 填充到 hero 输入框并聚焦 */
  _fillPresetToInput(prompt) {
    const input = document.getElementById('heroInput');
    if (!input) return;
    input.value = prompt;
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(prompt.length, prompt.length);
    // 保存草稿
    if (typeof appState.heroDraft !== 'undefined') {
      appState.heroDraft = prompt;
    }
  }

  /** 转义 HTML 属性，防 XSS */
  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    // 同步模式 UI（重建后 #heroPresets 为空，需重新填充预设标签）
    this._syncModeUI(appState.getMode());
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

    // 新消息开始，清理跨轮残留的 runningToolCallIds 和上一轮的 stuck 定时器
    this._clearStuckTimer();
    this._runningToolCallIds.clear();

    this._healStuckToolCards(true);

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

    try {
      await session.start({
        sessionId: appState.currentSessionId,
        content,
        signal: this.currentAbortController?.signal,
        systemPrompt: appState.getSystemPrompt(),
        mode: appState.getMode(),
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
    }

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
          const { mode, todos } = parseTodoArgs(parsed.args);
          session.pushTextSegment();
          const finalTodos = session._mergeTodos(todos, mode);
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null
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
      '世界上最安静的动物会是什么嘞🤔',
      '为什么蜘蛛侠喜欢穿紧身衣嘞🤔',
      'Let‘s go!, Let‘s go! 🚀',
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
    if (!message || this.isSendingMessage) {
      return;
    }
    
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

    // 卡片模式：显式收起确认卡，避免 flush 完成前卡在展开态
    const card = document.querySelector(`.confirmation-btn[data-confirm-id="${confirmId}"]`)
      ?.closest('.tool-card');
    if (card) {
      card.querySelector('.tool-header')?.classList.remove('expanded');
      card.querySelector('.tool-call-details')?.classList.remove('show');
    }

    if (item) {
      const detail = item.querySelector('.tool-timeline-detail');
      if (detail) {
        detail.style.maxHeight = '0';
      }
      item.classList.remove('expanded');
      // 确认完成后恢复 footer 显示
      const msgDiv = item.closest('.message.assistant');
      if (msgDiv) {
        msgDiv.classList.remove('pending-confirm');
      }
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
    if (!details) {
      return;
    }

    details.style.transition = 'none';
    const h = details.scrollHeight;
    details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
    details.style.transition = '';
    card.classList.add('expanded');

    const optionBtns = card.querySelectorAll('.option-btn');
    optionBtns.forEach((btn, idx) => {
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
    
    if (msg.includes(i18n.t('chat.llmNoContent'))) {
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
   * 自愈：标记所有未完成的 tool 卡片为已取消或中断
   * 用户忽略了确认弹窗，或停止了生成，需要修复 UI 状态
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

    // 收集所有 tool segment，按索引与 DOM 中的 .tool-timeline-item 顺序对应
    const toolSegments = session.getSegments().filter(s => s.type === 'tool');
    const stuckStatuses = new Map(); // DOM 索引 → 目标状态
    toolSegments.forEach((seg, i) => {
      if (seg.result === 'cancelled' || seg.result === 'interrupted') {
        stuckStatuses.set(i, seg.result);
      }
    });

    if (stuckStatuses.size === 0) {
      // 没有 stuck 的卡片，但可能来自停止按钮清理了 pending confirm，只需恢复 footer
      if (fromStopBtn) {
        this._restoreFooterAfterHeal(contentDiv);
      }
      return;
    }

    // 直接操作 DOM，不触发 RenderPipeline 全量重建
    // flush → doRender 有 await renderMarkdown，会被后续新消息覆盖
    const statusSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="5" x2="11" y2="11"/></svg>';
    const domModified = [];
    contentDiv.querySelectorAll('.tool-timeline-item').forEach((item, idx) => {
      const targetStatus = stuckStatuses.get(idx);
      if (!targetStatus) return; // ← 核心修复：只改数据层确认 stuck 的，不碰已成功的

      const segInfo = toolSegments[idx] ? `${toolSegments[idx].name}` : `#${idx}`;
      domModified.push(`${segInfo}→${targetStatus}`);
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

    // 恢复 footer 显示
    this._restoreFooterAfterHeal(contentDiv);

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
   * 在自愈操作后恢复消息 footer 的显示
   */
  _restoreFooterAfterHeal(contentDiv) {
    const msgDiv = contentDiv.closest('.message.assistant');
    if (msgDiv) {
      msgDiv.classList.remove('pending-confirm');
    }
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

            const btnContainer = document.createElement('div');
            btnContainer.className = 'message-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-action-btn';
            copyBtn.title = _('chatui.copy');
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

            const footer = document.createElement('div');
            footer.className = 'message-footer';
            footer.appendChild(btnContainer);
            footer.appendChild(timeDiv);

            const msgWrap = document.createElement('div');
            msgWrap.className = 'message-user-wrap';
            msgWrap.appendChild(userMsgDiv);
            msgWrap.appendChild(footer);
            userRow.appendChild(msgWrap);
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
            // 额外绑定 ask-user-card 的 option-btn 事件（与 RenderPipeline 顺序一致）
            contentDiv.querySelectorAll('.ask-user-card').forEach(card => {
              if (!card.dataset.eventsBound) {
                this._bindAskUserCardEvents(card);
              }
            });
          }
          msgDiv.appendChild(contentDiv);
          rowEl.appendChild(msgDiv);

          const btnContainer = document.createElement('div');
          btnContainer.className = 'message-actions';

          const retryBtn = document.createElement('button');
          retryBtn.className = 'message-action-btn';
          retryBtn.title = _('chatui.retry');
          retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
          btnContainer.appendChild(retryBtn);

          const userContent = precedingUserContent;
          retryBtn.onclick = () => {
            if (!userContent) return;
            this.sendMessage(userContent);
          };

          const copyBtn = document.createElement('button');
          copyBtn.className = 'message-action-btn';
          copyBtn.title = _('chatui.copy');
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          btnContainer.appendChild(copyBtn);

          const rollbackBtn = document.createElement('button');
          rollbackBtn.className = 'message-action-btn rollback-btn';
          rollbackBtn.title = _('chatui.rollback');
          rollbackBtn.innerHTML = '↩';
          rollbackBtn.addEventListener('click', () => EventBus.emit('message:rollback', msgDiv));
          btnContainer.appendChild(rollbackBtn);

          const forkBtn = document.createElement('button');
          forkBtn.className = 'message-action-btn fork-btn';
          forkBtn.title = _('chatui.fork');
          forkBtn.innerHTML = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;vertical-align:middle"><path fill="currentColor" d="m76.67 10c-7.366 0-13.337 5.97-13.337 13.333 0 6.204 4.258 11.374 10 12.861v7.139c0 1.841-1.494 3.333-3.333 3.333h-33.333c-3.77 0-7.207 1.299-10 3.412v-13.88c5.742-1.491 10-6.66 10-12.864 0-7.364-5.97-13.334-13.334-13.334s-13.333 5.97-13.333 13.333c0 6.204 4.258 11.374 10 12.858v27.617c-5.742 1.484-10 6.653-10 12.858 0 7.364 5.97 13.334 13.333 13.334s13.333-5.97 13.333-13.333c0-6.205-4.258-11.374-10-12.858v-.476c0-5.523 4.479-10 10-10h33.334c5.521 0 10-4.476 10-10v-7.137c5.739-1.488 10-6.657 10-12.863 0-7.363-5.97-13.333-13.33-13.333z"></path></svg>';
          forkBtn.addEventListener('click', () => EventBus.emit('message:fork', msgDiv));
          btnContainer.appendChild(forkBtn);

          const rawMarkdown = segments.filter(s => s.type === 'text').map(s => s.content).join('');
          contentDiv.dataset.markdown = rawMarkdown;

          // ── 文件产物指示器 ──
          const filesFromSegments = ChatPanel._extractFilesFromSegments(segments);
          const fileIndicator = document.createElement('span');
          fileIndicator.className = 'message-file-indicator';
          const filePopover = document.createElement('div');
          filePopover.className = 'message-file-popover';

          if (filesFromSegments.length > 0) {
            fileIndicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="padding-top: 1px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${filesFromSegments.length}`;
            fileIndicator.title = _('chatui.viewFileProducts');

            // 构建 popover 内容（最多显示 10 条）
            const MAX_VISIBLE = 10;
            const visibleFiles = filesFromSegments.slice(0, MAX_VISIBLE);
            const overflow = filesFromSegments.length - MAX_VISIBLE;
            let popoverHtml = '';
            for (const f of visibleFiles) {
              const fileName = f.path.split(/[/\\]/).pop();
              const { iconFile } = getFileIconInfo(fileName);
              let statusLetter = f.action;
              let statusClass = 'status-added';
              if (f.action === 'D') statusClass = 'status-deleted';
              else if (f.action === 'M') statusClass = 'status-modified';

              popoverHtml += `<div class="popover-file-item" data-path="${escapeHtml(f.path)}">
                <img class="popover-file-icon" src="icons/${iconFile}" draggable="false" alt="">
                <span class="file-name">${escapeHtml(fileName)}</span>
                <span class="file-status ${statusClass}">${statusLetter}</span>
              </div>`;
            }
            if (overflow > 0) {
              popoverHtml += `<div class="popover-file-overflow">还有 ${overflow} 个文件变更</div>`;
            }
            filePopover.innerHTML = popoverHtml;

            // hover 显隐
            let popoverTimer = null;
            const showPopover = () => {
              if (popoverTimer) clearTimeout(popoverTimer);
              popoverTimer = setTimeout(() => filePopover.classList.add('show'), 200);
            };
            const hidePopover = () => {
              if (popoverTimer) clearTimeout(popoverTimer);
              popoverTimer = setTimeout(() => filePopover.classList.remove('show'), 200);
            };
            fileIndicator.addEventListener('mouseenter', showPopover);
            fileIndicator.addEventListener('mouseleave', hidePopover);
            filePopover.addEventListener('mouseenter', showPopover);
            filePopover.addEventListener('mouseleave', hidePopover);

            // 点击文件项打开 diff
            filePopover.addEventListener('click', (e) => {
              const item = e.target.closest('.popover-file-item');
              if (item) {
                const path = item.dataset.path;
                filePopover.classList.remove('show');
                import('../utils/diff-modal.js').then(m => m.diffModalManager.show(path));
              }
            });

            fileIndicator.appendChild(filePopover);
          }

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
          if (filesFromSegments.length > 0) {
            btnContainer.appendChild(fileIndicator);
          }
          footer.appendChild(btnContainer);
          msgDiv.appendChild(footer);

          // 检查是否有工具正在等待用户确认 → 隐藏 footer（对话未完成不应显示操作按钮）
          const hasPendingConfirm = segments.some(s =>
            s.type === 'tool' && s.confirmationData && !s.result
          );
          if (hasPendingConfirm) {
            msgDiv.classList.add('pending-confirm');
          }

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
   * 从 segments 中提取本轮产出的文件列表
   * @param {Array} segments
   * @returns {Array<{path:string, action:string, toolName:string}>}
   */
  static _extractFilesFromSegments(segments) {
    const files = [];
    for (const seg of segments) {
      if (seg.type !== 'tool') continue;
      // 只统计已完成的工具
      if (seg.result !== 'success' && seg.result !== 'error') continue;
      let args = seg.args;
      if (!args) continue;
      // 历史消息中 args 可能是 JSON 字符串（后端 FunctionCall.arguments 为 String 类型）
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch (e) { continue; }
      }

      let paths = [];
      if (seg.name === 'delete_file') {
        paths = Array.isArray(args.paths) ? args.paths : [];
      } else if (['write_file', 'edit_file', 'write_office_file'].includes(seg.name)) {
        paths = args.path ? [args.path] :
                args.filePath ? [args.filePath] :
                args.file_path ? [args.file_path] :
                [];
      }

      for (const p of paths) {
        let action = 'M';
        if (seg.name === 'delete_file') action = 'D';
        else if (seg.name === 'write_file' || seg.name === 'write_office_file') action = 'A';
        files.push({ path: p, action, toolName: seg.name });
      }
    }
    // 去重：同一文件在同一轮中被多次写入只保留一次（以最新 action 为准）
    const seen = new Map();
    for (const f of files) {
      seen.set(f.path, f);
    }
    return Array.from(seen.values());
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
