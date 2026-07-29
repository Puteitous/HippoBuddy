/**
 * 模式预设模块 — 管理多模式（chat/office/coding）的预设提示词和 UI 切换
 */
import { appState } from '../../state/app-state.js';

// ── i18n 辅助 ──
const _ = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

// ── 多模式预设提示词 ──
export const MODE_PRESETS = {
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

/** 模式对应的标语 */
const SLOGAN_MAP = { chat: "Let's Chat!", office: "Let's Work!", coding: "Let's Code!" };

/**
 * ModePresets — 管理模式预设的 UI 交互
 * 作为 ChatPanel 的委托对象，通过 chatPanel 引用访问主实例的状态和方法
 */
export class ModePresets {
  constructor(chatPanel) {
    /** @type {import('./ChatPanel.js').ChatPanel} */
    this.chatPanel = chatPanel;
    /** @type {number|null} 标题动画计时器 */
    this._titleAnimTimer = null;
  }

  /** 绑定模式切换事件 */
  bindEvents() {
    document.addEventListener('click', (e) => {
      // 模式按钮
      const modeBtn = e.target.closest('.mode-btn');
      if (modeBtn) {
        const mode = modeBtn.dataset.mode;
        if (!mode || mode === appState.getMode()) return;
        appState.setMode(mode);
        this.syncUI(mode, true);
        return;
      }
      // 预设提示词按钮
      const presetBtn = e.target.closest('.mode-preset-btn');
      if (presetBtn) {
        const prompt = presetBtn.dataset.prompt;
        if (!prompt) return;
        this.fillPresetToInput(prompt);
      }
    });
  }

  /** 同步模式 UI（高亮激活按钮 + 更新标语 + 更新预设标签） */
  syncUI(mode, animate = false) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (animate) {
      this._animateTitleSwitch(mode);
    } else {
      const titleLast = document.querySelector('.title-last');
      if (titleLast) titleLast.textContent = SLOGAN_MAP[mode] || "Let's Code!";
    }
    this.renderPresets(mode);
  }

  /** 切换标题标语：旧文字淡出 → 更新 → 新文字飞入 */
  _animateTitleSwitch(newMode) {
    // 取消前一次动画的 pending timeout，防止快速点击冲突
    if (this._titleAnimTimer) {
      clearTimeout(this._titleAnimTimer);
      this._titleAnimTimer = null;
    }

    const titleLast = document.querySelector('.title-last');
    if (!titleLast) return;

    const newText = SLOGAN_MAP[newMode] || "Let's Code!";
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
  renderPresets(mode) {
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

  /** 点击预设标签 → 填充到输入框并聚焦 */
  fillPresetToInput(prompt) {
    const input = document.getElementById('messageInput');
    if (!input) return;
    input.value = prompt;
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(prompt.length, prompt.length);
  }

  /** 转义 HTML 属性，防 XSS */
  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
