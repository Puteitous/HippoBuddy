/**
 * i18n — 国际化引擎
 * 支持中/英文切换，所有 UI 文案集中管理
 * 
 * 用法：
 *   i18n.t('chat.placeholder')       → 获取当前语言翻译
 *   i18n.setLang('en')               → 切换到英文
 *   i18n.setLang('zh')               → 切换到中文
 *   i18n.currentLang                 → 当前语言
 */
(function () {
  'use strict';

  const ZH = 'zh';
  const EN = 'en';

  // ============================================================
  // 翻译表
  // 按功能模块分块组织
  // ============================================================
  const messages = {

    /* ==================== HTML 通用 ==================== */
    'html.splash.skip':            { zh: '点击任意处跳过', en: 'Click anywhere to skip' },
    'html.header.sessionPanel':    { zh: '会话面板', en: 'Session Panel' },
    'html.header.newSession':      { zh: '新建会话', en: 'New Session' },
    'html.header.toggleActivity':  { zh: '切换活动栏', en: 'Toggle Activity Bar' },
    'html.header.resetWorkspace':  { zh: '重置到默认工作区', en: 'Reset to Default Workspace' },
    'html.header.compressContext': { zh: '压缩上下文', en: 'Compress Context' },
    'html.header.openFolder':      { zh: '打开工作区文件夹', en: 'Open Workspace Folder' },
    'html.header.recentFolders':   { zh: '最近打开的文件夹', en: 'Recent Folders' },
    'html.header.settings':        { zh: '模型配置', en: 'Model Settings' },
    'html.header.themeToggle':     { zh: '切换主题', en: 'Toggle Theme' },
    'html.header.devtools':        { zh: '打开 DevTools', en: 'Open DevTools' },
    'html.header.refresh':         { zh: '刷新页面 (Ctrl+F5)', en: 'Refresh (Ctrl+F5)' },
    'html.header.minimize':        { zh: '最小化', en: 'Minimize' },
    'html.header.maximize':        { zh: '最大化', en: 'Maximize' },
    'html.header.close':           { zh: '关闭', en: 'Close' },

    /* ==================== Activity Bar ==================== */
    'activity.token':              { zh: 'Token 统计', en: 'Token Stats' },
    'activity.monitor':            { zh: '实时监控', en: 'Live Monitor' },
    'activity.files':              { zh: '文件变更', en: 'File Changes' },
    'activity.terminal':           { zh: '打开终端', en: 'Open Terminal' },
    'activity.browser':            { zh: '打开浏览器', en: 'Open Browser' },
    'activity.skillMarket':        { zh: '技能市场', en: 'Skill Market' },
    'activity.panel':              { zh: '面板', en: 'Panel' },

    /* ==================== Session Panel ==================== */
    'session.title':               { zh: '会话', en: 'Sessions' },
    'session.sessionList':         { zh: '会话列表', en: 'Session List' },
    'session.fileBrowse':          { zh: '文件浏览', en: 'File Explorer' },
    'session.toggleGroup':         { zh: '切换分组方式', en: 'Toggle Grouping' },
    'session.groupProject':        { zh: '项目', en: 'Project' },
    'session.groupTime':           { zh: '时间', en: 'Time' },
    'session.openWorkspace':       { zh: '打开工作区以浏览文件', en: 'Open a workspace to browse files' },
    'session.today':               { zh: '今天', en: 'Today' },
    'session.yesterday':           { zh: '昨天', en: 'Yesterday' },
    'session.days7':               { zh: '7天内', en: 'Last 7 Days' },
    'session.days30':              { zh: '30天内', en: 'Last 30 Days' },
    'session.earlier':             { zh: '更早', en: 'Earlier' },
    'session.other':               { zh: '其他', en: 'Other' },
    'session.defaultName':         { zh: '新会话', en: 'New Session' },
    'session.namePrefix':          { zh: '会话', en: 'Session' },
    'session.rename':              { zh: '重命名', en: 'Rename' },
    'session.delete':              { zh: '删除', en: 'Delete' },

    /* ==================== Chat Panel ==================== */
    'chat.title':                  { zh: '聊天', en: 'Chat' },
    'chat.mode.chat':              { zh: '聊天', en: 'Chat' },
    'chat.mode.code':              { zh: '代码', en: 'Code' },
    'chat.mode.office':            { zh: '办公', en: 'Office' },
    'chat.mode.chatTitle':         { zh: '聊天模式 — 只读探索，不动手', en: 'Chat Mode — Read-only exploration' },
    'chat.mode.codeTitle':         { zh: '代码模式 — 全栈工程师', en: 'Code Mode — Full-stack Engineer' },
    'chat.mode.officeTitle':       { zh: '办公模式 — 文档/表格/演示文稿', en: 'Office Mode — Docs/Sheets/Slides' },
    'chat.placeholder':            { zh: '输入消息...', en: 'Type a message...' },
    'chat.heroPlaceholder':        { zh: '问点什么...', en: 'Ask anything...' },
    'chat.send':                   { zh: '发送', en: 'Send' },
    'chat.sendMessage':            { zh: '发送消息', en: 'Send Message' },
    'chat.stop':                   { zh: '停止生成', en: 'Stop Generation' },
    'chat.history':                { zh: '历史会话', en: 'History' },
    'chat.newSession':             { zh: '新建会话', en: 'New Session' },
    'chat.collapse':               { zh: '收起聊天', en: 'Collapse Chat' },
    'chat.expand':                 { zh: '展开聊天', en: 'Expand Chat' },
    'chat.scrollToBottom':         { zh: '滚动到底部', en: 'Scroll to Bottom' },
    'chat.modelQuickSelect':       { zh: '快速切换模型', en: 'Quick Model Switch' },
    'chat.tokenUsage':             { zh: 'Token 用量', en: 'Token Usage' },
    'chat.loading':                { zh: '加载中...', en: 'Loading...' },

    /* ==================== Preset Prompts ==================== */
    'preset.brainstorm':           { zh: '头脑风暴', en: 'Brainstorm' },
    'preset.polish':               { zh: '润色文案', en: 'Polish Text' },
    'preset.explain':              { zh: '解释概念', en: 'Explain Concept' },
    'preset.translate':            { zh: '翻译', en: 'Translate' },
    'preset.weeklyReport':         { zh: '写周报', en: 'Weekly Report' },
    'preset.analyzeData':          { zh: '分析数据', en: 'Analyze Data' },
    'preset.pptOutline':           { zh: 'PPT大纲', en: 'PPT Outline' },
    'preset.meetingMinutes':       { zh: '会议纪要', en: 'Meeting Minutes' },
    'preset.codeReview':           { zh: '代码审查', en: 'Code Review' },
    'preset.generateTest':         { zh: '生成测试', en: 'Generate Tests' },
    'preset.explainCode':          { zh: '解释代码', en: 'Explain Code' },
    'preset.refactor':             { zh: '重构优化', en: 'Refactor' },

    /* ==================== Preset Prompts Content ==================== */
    'preset.prompt.brainstorm':  { zh: '我们来一次头脑风暴！请推荐5个关于【人工智能在日常生活中的应用】的创意想法。每个想法需要说明：核心思路、实现方式和潜在价值。', en: 'Let\'s brainstorm! Please recommend 5 creative ideas about [Applications of Artificial Intelligence in Daily Life]. Each idea should include: core concept, implementation approach, and potential value.' },
    'preset.prompt.polish':      { zh: '请帮我润色以下文案，使其更专业、流畅、有说服力：\n\n尊敬的客户，您好！我们是一家专业的软件公司，可以为您提供高质量的软件服务。如果您有兴趣的话，欢迎随时联系我们，谢谢！', en: 'Please help me polish the following copy to make it more professional, fluent, and persuasive:\n\nDear Customer, Hello! We are a professional software company that can provide you with high-quality software services. If you are interested, please feel free to contact us at any time. Thank you!' },
    'preset.prompt.explain':     { zh: '请用通俗易懂的方式解释【什么是云计算】。要求：\n1. 用生活中的比喻说明核心概念\n2. 列出至少3个核心优势\n3. 举3个实际应用场景\n4. 让完全不懂技术的人也能听懂', en: 'Please explain [What is Cloud Computing] in an easy-to-understand way. Requirements:\n1. Use real-life analogies to explain core concepts\n2. List at least 3 key advantages\n3. Give 3 practical application scenarios\n4. Make it understandable for non-technical people' },
    'preset.prompt.translate':   { zh: '请将以下英文翻译成地道、自然的中文：\n\nIn today\'s rapidly evolving digital landscape, businesses must adapt to new technologies to remain competitive. Artificial intelligence and cloud computing are at the forefront of this transformation, enabling organizations to operate more efficiently and deliver better customer experiences.', en: 'Please translate the following Chinese into natural, authentic English:\n\n在当今快速发展的数字化环境中，企业必须适应新技术以保持竞争力。人工智能和云计算处于这一变革的前沿，使组织能够更高效地运营并提供更好的客户体验。' },
    'preset.prompt.weeklyReport': { zh: '请帮我写一份本周工作周报，按标准格式输出（包含本周完成、下周计划、风险与问题）。\n\n本周工作内容：\n- 完成新功能模块的开发与自测\n- 修复线上bug 5个\n- 参加2次需求评审会议\n- 整理并更新了项目技术文档\n\n下周计划：\n- 推进新功能上线部署\n- 准备系统架构评审材料', en: 'Please help me write a weekly work report in standard format (including tasks completed this week, plans for next week, risks and issues).\n\nThis week\'s work:\n- Completed development and self-testing of new feature modules\n- Fixed 5 production bugs\n- Attended 2 requirements review meetings\n- Organized and updated project technical documentation\n\nNext week\'s plan:\n- Deploy new features to production\n- Prepare system architecture review materials' },
    'preset.prompt.analyzeData': { zh: '请分析以下销售数据，给出关键洞察和改进建议：\n\n今年各季度收入：Q1 120万，Q2 150万，Q3 135万，Q4 190万\n去年同期：Q1 100万，Q2 115万，Q3 120万，Q4 155万\n\n请从以下维度分析：\n1. 同比增长情况\n2. 季度趋势与异常点\n3. 改善建议', en: 'Please analyze the following sales data and provide key insights and improvement suggestions:\n\nThis year\'s quarterly revenue: Q1 1.2M, Q2 1.5M, Q3 1.35M, Q4 1.9M\nLast year\'s: Q1 1.0M, Q2 1.15M, Q3 1.2M, Q4 1.55M\n\nPlease analyze from the following dimensions:\n1. Year-over-year growth\n2. Quarterly trends and anomalies\n3. Improvement suggestions' },
    'preset.prompt.pptOutline':  { zh: '请帮我列一份【年度工作总结】的内容大纲，共12个板块左右。\n\n需要包含以下内容：\n1. 年度工作概述\n2. 重点项目回顾\n3. 数据成果展示\n4. 团队建设情况\n5. 存在的问题与改进\n6. 明年工作计划\n\n每个板块需标注核心要点和推荐的数据呈现方式（图表、表格等）。', en: 'Please help me create a content outline for [Annual Work Summary], about 12 sections.\n\nIt should include:\n1. Annual work overview\n2. Key project review\n3. Data and results presentation\n4. Team building status\n5. Existing problems and improvements\n6. Next year\'s work plan\n\nEach section should include key points and recommended data presentation methods (charts, tables, etc.).' },
    'preset.prompt.meetingMinutes': { zh: '请根据以下会议记录整理一份结构清晰的会议纪要：\n\n会议主题：Q2产品迭代评审\n参会人：张总、王工、李设计、刘测试\n\n讨论内容：\n1. 新功能开发进度延后一周，原因是第三方API对接出现技术问题\n2. UI设计方案已确认通过\n3. 测试用例编写完成80%，预计下周三全部完成\n\n决议：\n- 延长开发周期一周，整体上线时间不变\n- 增加API对接的单元测试覆盖\n\n请输出包含会议主题、时间、参与人、讨论内容、决议事项和待办任务的完整会议纪要。', en: 'Please organize a clear meeting minutes from the following meeting notes:\n\nMeeting Topic: Q2 Product Iteration Review\nAttendees: Zhang (Manager), Wang (Engineer), Li (Designer), Liu (Tester)\n\nDiscussion:\n1. New feature development delayed by one week due to technical issues with third-party API integration\n2. UI design has been approved\n3. Test cases 80% complete, expected to be fully done by next Wednesday\n\nDecisions:\n- Extend development cycle by one week, overall launch date unchanged\n- Increase unit test coverage for API integration\n\nPlease output complete meeting minutes including topic, time, attendees, discussion, decisions, and action items.' },
    'preset.prompt.codeReview':  { zh: '请审查以下Java代码，指出潜在问题、性能瓶颈和改进建议：\n\n```java\npublic class UserService {\n    public List<User> getActiveUsers() {\n        List<User> users = new ArrayList<>();\n        for (int i = 0; i < 1000; i++) {\n            User user = userDao.findById(i);\n            if (user != null && user.isActive()) {\n                users.add(user);\n            }\n        }\n        return users;\n    }\n}\n```', en: 'Please review the following Java code and identify potential issues, performance bottlenecks, and improvement suggestions:\n\n```java\npublic class UserService {\n    public List<User> getActiveUsers() {\n        List<User> users = new ArrayList<>();\n        for (int i = 0; i < 1000; i++) {\n            User user = userDao.findById(i);\n            if (user != null && user.isActive()) {\n                users.add(user);\n            }\n        }\n        return users;\n    }\n}\n```' },
    'preset.prompt.generateTest': { zh: '请为以下Java方法使用JUnit 5 + Mockito编写单元测试：\n\n```java\npublic class Calculator {\n    public int divide(int a, int b) {\n        if (b == 0) {\n            throw new IllegalArgumentException("除数不能为0");\n        }\n        return a / b;\n    }\n}\n```\n\n要求覆盖正常情况、边界情况和异常情况。', en: 'Please write unit tests using JUnit 5 + Mockito for the following Java method:\n\n```java\npublic class Calculator {\n    public int divide(int a, int b) {\n        if (b == 0) {\n            throw new IllegalArgumentException("Divisor cannot be zero");\n        }\n        return a / b;\n    }\n}\n```\n\nRequirements: cover normal cases, boundary cases, and exception cases.' },
    'preset.prompt.explainCode': { zh: '请分析以下Java代码的工作原理：\n\n```java\npublic class Singleton {\n    private static volatile Singleton instance;\n    private Singleton() {}\n    public static Singleton getInstance() {\n        if (instance == null) {\n            synchronized (Singleton.class) {\n                if (instance == null) {\n                    instance = new Singleton();\n                }\n            }\n        }\n        return instance;\n    }\n}\n```\n\n请解释：1) 这是什么设计模式 2) 为什么用volatile 3) 为什么用双重检查 4) 这种实现方式的优缺点。', en: 'Please analyze how the following Java code works:\n\n```java\npublic class Singleton {\n    private static volatile Singleton instance;\n    private Singleton() {}\n    public static Singleton getInstance() {\n        if (instance == null) {\n            synchronized (Singleton.class) {\n                if (instance == null) {\n                    instance = new Singleton();\n                }\n            }\n        }\n        return instance;\n    }\n}\n```\n\nPlease explain: 1) What design pattern is this? 2) Why use volatile? 3) Why use double-checked locking? 4) Pros and cons of this implementation.' },
    'preset.prompt.refactor':    { zh: '请对以下Java代码进行重构和优化，提升可读性、可维护性和扩展性：\n\n```java\npublic class DiscountService {\n    public double calculate(double amount, String type) {\n        if (type.equals("VIP")) {\n            return amount * 0.8;\n        } else if (type.equals("GOLD")) {\n            return amount * 0.85;\n        } else if (type.equals("SILVER")) {\n            return amount * 0.9;\n        } else {\n            return amount;\n        }\n    }\n}\n```\n\n请给出重构后的代码并解释你的重构思路。', en: 'Please refactor and optimize the following Java code to improve readability, maintainability, and extensibility:\n\n```java\npublic class DiscountService {\n    public double calculate(double amount, String type) {\n        if (type.equals("VIP")) {\n            return amount * 0.8;\n        } else if (type.equals("GOLD")) {\n            return amount * 0.85;\n        } else if (type.equals("SILVER")) {\n            return amount * 0.9;\n        } else {\n            return amount;\n        }\n    }\n}\n```\n\nPlease provide the refactored code and explain your refactoring approach.' },

    /* ==================== Chat UI ==================== */
    'chatui.copy':                 { zh: '复制', en: 'Copy' },
    'chatui.retry':                { zh: '重试', en: 'Retry' },
    'chatui.rollback':             { zh: '回退此消息的文件修改', en: 'Rollback file changes' },
    'chatui.fork':                 { zh: '从此处分叉为新会话', en: 'Fork from here' },
    'chatui.undoing':              { zh: '撤销中...', en: 'Undoing...' },
    'chatui.undone':               { zh: '↩ 已撤销', en: '↩ Undone' },
    'chatui.undo':                 { zh: '↩ 撤销', en: '↩ Undo' },
    'chatui.undoFailed':           { zh: '撤销失败：', en: 'Undo failed: ' },
    'chatui.unknownError':         { zh: '未知错误', en: 'Unknown error' },
    'chatui.sessionExecuting':     { zh: '此会话正在后台执行中...', en: 'Session is running in background...' },
    'chatui.executionComplete':    { zh: '执行完成', en: 'Execution complete' },

    /* ==================== Token Monitor ==================== */
    'token.currentContext':        { zh: '当前上下文', en: 'Current Context' },

    /* ==================== Token Panel (Activity Bar) ==================== */
    'tokenPanel.usageRate':        { zh: '上下文使用率', en: 'Context Usage' },
    'tokenPanel.prompt':           { zh: 'Prompt', en: 'Prompt' },
    'tokenPanel.completion':       { zh: 'Completion', en: 'Completion' },
    'tokenPanel.totalInput':       { zh: '总输入', en: 'Total Input' },
    'tokenPanel.totalOutput':      { zh: '总输出', en: 'Total Output' },
    'tokenPanel.llmCalls':         { zh: 'LLM 调用', en: 'LLM Calls' },
    'tokenPanel.toolCalls':        { zh: '工具调用', en: 'Tool Calls' },
    'tokenPanel.cacheHit':         { zh: '缓存命中', en: 'Cache Hit' },
    'tokenPanel.cacheRate':        { zh: '缓存率', en: 'Cache Rate' },
    'tokenPanel.totalCacheHit':    { zh: '总缓存命中', en: 'Total Cache Hit' },
    'tokenPanel.totalCacheRate':   { zh: '总缓存率', en: 'Total Cache Rate' },
    'tokenPanel.sessionTotal':     { zh: '会话总消耗', en: 'Session Total' },
    'tokenPanel.tokens':           { zh: 'tokens', en: 'tokens' },
    'tokenPanel.trend':            { zh: 'Token 消耗趋势', en: 'Token Usage Trend' },
    'tokenPanel.cacheTrend':       { zh: '缓存命中率趋势', en: 'Cache Hit Rate Trend' },
    'tokenPanel.records':          { zh: ' 次记录', en: ' records' },
    'tokenPanel.waiting':          { zh: '等待数据...', en: 'Waiting for data...' },

    /* ==================== Monitor Panel ==================== */
    'monitor.llmCalls':            { zh: 'LLM 调用', en: 'LLM Calls' },
    'monitor.toolCalls':           { zh: '工具调用', en: 'Tool Calls' },
    'monitor.requestCount':        { zh: '请求次数', en: 'Requests' },
    'monitor.successRate':         { zh: '成功率', en: 'Success Rate' },
    'monitor.avgLatency':          { zh: '平均耗时', en: 'Avg Latency' },
    'monitor.slowest':             { zh: '最慢', en: 'Slowest' },
    'monitor.totalCalls':          { zh: '总调用', en: 'Total Calls' },
    'monitor.failed':              { zh: '失败', en: 'Failed' },
    'monitor.latencyTrend':        { zh: '延迟趋势', en: 'Latency Trend' },
    'monitor.trendCountZero':      { zh: '0 次记录', en: '0 records' },
    'monitor.trendCount':          { zh: '{count} 次记录 · 最近 {max}ms', en: '{count} records · last {max}ms' },

    /* ==================== File Changes Panel ==================== */
    'fileChanges.empty':           { zh: '暂无文件变更', en: 'No file changes' },
    'fileChanges.title':           { zh: '文件变更', en: 'File Changes' },
    'fileChanges.summaryFiles':    { zh: '{count} 个文件', en: '{count} files' },
    'fileChanges.rollback':        { zh: '回滚', en: 'Rollback' },
    'fileChanges.rollingBack':     { zh: '回滚中...', en: 'Rolling back...' },
    'fileChanges.rollbackFailed':  { zh: '回滚失败：', en: 'Rollback failed: ' },
    'fileChanges.rollbackSuccess': { zh: '文件已恢复：', en: 'File restored: ' },
    'fileChanges.overflow':        { zh: '{overflow} 个文件变更', en: '{overflow} more file changes' },

    /* ==================== Preview Panel ==================== */
    'preview.mdToggle':            { zh: '预览模式', en: 'Preview Mode' },
    'preview.htmlToggle':          { zh: '预览页面', en: 'Preview Page' },
    'preview.search':              { zh: '搜索 (Ctrl+F)', en: 'Search (Ctrl+F)' },
    'preview.refresh':             { zh: '重新加载', en: 'Reload' },
    'preview.openExternal':        { zh: '在外部程序中打开', en: 'Open in External App' },
    'preview.collapse':            { zh: '收起预览', en: 'Collapse Preview' },

    /* ==================== Settings Panel ==================== */
    'settings.title':              { zh: '模型配置', en: 'Model Settings' },
    'settings.close':              { zh: '关闭设置 (Esc)', en: 'Close Settings (Esc)' },
    'settings.model':              { zh: '模型配置', en: 'Model' },
    'settings.rules':              { zh: '规则管理', en: 'Rules' },
    'settings.skills':             { zh: '技能管理', en: 'Skills' },
    'settings.general':            { zh: '通用设置', en: 'General' },
    'settings.context':            { zh: '上下文', en: 'Context' },
    'settings.session':            { zh: '会话管理', en: 'Sessions' },
    'settings.tools':              { zh: '工具管理', en: 'Tools' },
    'settings.mcp':                { zh: 'MCP 配置', en: 'MCP Config' },

    /* ==================== Settings Pages ==================== */
    'settingsPage.toolsTitle':     { zh: '工具管理', en: 'Tool Management' },
    'settingsPage.toolsDesc':      { zh: '配置 Bash、文件、Web 搜索等内置工具的行为', en: 'Configure Bash, File, Web Search and other built-in tools' },
    'settingsPage.tools.bash':     { zh: 'Bash 命令执行', en: 'Bash Command Execution' },
    'settingsPage.tools.deleteFile': { zh: '删除文件', en: 'Delete File' },
    'settingsPage.tools.webSearch': { zh: 'Web 搜索', en: 'Web Search' },
    'settingsPage.tools.subagent': { zh: '子代理', en: 'Sub-agent' },
    'settingsPage.modelProvider':  { zh: '模型提供商', en: 'Model Provider' },
    'settingsPage.zhipu':          { zh: '智谱 GLM', en: 'Zhipu GLM' },
    'settingsPage.moonshot':       { zh: 'Kimi (月之暗面)', en: 'Kimi (Moonshot)' },
    'settingsPage.stepfun':        { zh: '阶跃星辰', en: 'Stepfun' },
    'settingsPage.lingyi':         { zh: '零一万物', en: 'Lingyi' },
    'settingsPage.doubao':         { zh: '豆包 (字节)', en: 'Doubao (ByteDance)' },
    'settingsPage.siliconflow':    { zh: '硅基流动', en: 'SiliconFlow' },

    /* ==================== Tool Renderers ==================== */
    'tool.default.running':        { zh: '运行中', en: 'Running' },
    'tool.default.runningWithEllipsis': { zh: '运行中...', en: 'Running...' },
    'tool.default.success':        { zh: '成功', en: 'Success' },
    'tool.default.failed':         { zh: '失败', en: 'Failed' },
    'tool.default.cancelled':      { zh: '已取消', en: 'Cancelled' },
    'tool.default.unconfirmed':    { zh: '未确认', en: 'Unconfirmed' },
    'tool.default.interrupted':    { zh: '执行中断', en: 'Interrupted' },
    'tool.default.parameters':     { zh: '参数:', en: 'Parameters:' },
    'tool.default.result':         { zh: '结果:', en: 'Result:' },
    'tool.default.error':          { zh: '错误:', en: 'Error:' },
    'tool.default.view':           { zh: '查看', en: 'View' },

    'tool.bash.title':             { zh: '终端命令', en: 'Terminal Command' },
    'tool.bash.exitCode':          { zh: '退出码:', en: 'Exit Code:' },
    'tool.bash.execTime':          { zh: '执行时间:', en: 'Execution Time:' },
    'tool.bash.output':            { zh: '输出:', en: 'Output:' },
    'tool.bash.success':           { zh: '成功', en: 'Success' },
    'tool.bash.failed':            { zh: '失败', en: 'Failed' },
    'tool.bash.cancelled':         { zh: '已取消', en: 'Cancelled' },
    'tool.bash.interrupted':       { zh: '中断', en: 'Interrupted' },
    'tool.bash.running':           { zh: '运行中', en: 'Running' },
    'tool.bash.terminateFailed':   { zh: '终止失败', en: 'Termination Failed' },
    'tool.bash.terminateFailedHint': { zh: '进程未能被终止，已转入后台继续运行', en: 'Process could not be terminated and continues running in background' },
    'tool.bash.pid':               { zh: '进程 PID', en: 'Process PID' },
    'tool.bash.remedy':            { zh: '补救', en: 'Remedy' },
    'tool.bash.highRisk':          { zh: '高风险', en: 'High Risk' },
    'tool.bash.mediumRisk':        { zh: '中风险', en: 'Medium Risk' },
    'tool.bash.lowRisk':           { zh: '低风险', en: 'Low Risk' },
    'tool.bash.waitConfirm':       { zh: '等待确认', en: 'Awaiting Confirmation' },
    'tool.bash.deny':              { zh: '拒绝', en: 'Deny' },
    'tool.bash.execute':           { zh: '执行', en: 'Execute' },
    'tool.bash.copyCmd':           { zh: '复制命令', en: 'Copy Command' },

    'tool.write.title':            { zh: '写入文件', en: 'Write File' },
    'tool.write.running':          { zh: '正在写入文件...', en: 'Writing file...' },
    'tool.write.executing':        { zh: '执行中', en: 'Executing' },
    'tool.write.failed':           { zh: '失败', en: 'Failed' },
    'tool.write.effective':        { zh: '已生效', en: 'Effective' },
    'tool.write.viewChanges':      { zh: '查看变更', en: 'View Changes' },
    'tool.write.undo':             { zh: '撤销', en: 'Undo' },

    'tool.edit.title':             { zh: '编辑文件', en: 'Edit File' },
    'tool.edit.running':           { zh: '正在编辑文件...', en: 'Editing file...' },
    'tool.edit.executing':         { zh: '执行中', en: 'Executing' },
    'tool.edit.failed':            { zh: '失败', en: 'Failed' },
    'tool.edit.effective':         { zh: '已生效', en: 'Effective' },
    'tool.edit.viewChanges':       { zh: '查看变更', en: 'View Changes' },
    'tool.edit.undo':              { zh: '撤销', en: 'Undo' },

    'tool.delete.title':           { zh: '删除文件', en: 'Delete File' },
    'tool.delete.label':           { zh: '删除:', en: 'Delete:' },
    'tool.delete.keep':            { zh: '保留', en: 'Keep' },
    'tool.delete.confirm':         { zh: '删除', en: 'Delete' },
    'tool.delete.waitConfirm':     { zh: '等待确认', en: 'Awaiting Confirmation' },
    'tool.delete.deleted':         { zh: '已删除', en: 'Deleted' },
    'tool.delete.failed':          { zh: '删除失败', en: 'Delete failed' },
    'tool.delete.skipped':         { zh: '已跳过', en: 'Skipped' },
    'tool.delete.pathNotExist':    { zh: '路径不存在', en: 'Path not found' },
    'tool.delete.count':           { zh: '个文件', en: ' files' },
    'tool.delete.denied':          { zh: '用户拒绝了删除操作', en: 'User denied the delete operation' },

    'tool.web.noResults':          { zh: '无搜索结果', en: 'No results' },
    'tool.web.noContent':          { zh: '无内容', en: 'No content' },
    'tool.web.characters':         { zh: '字符', en: ' characters' },
    'tool.web.truncated':          { zh: '已截断', en: 'Truncated' },
    'tool.web.results':            { zh: '条结果', en: ' results' },

    'tool.grep.noMatch':           { zh: '未找到匹配的内容', en: 'No matches found' },
    'tool.grep.files':             { zh: '个文件', en: ' files' },
    'tool.grep.matches':           { zh: '处匹配', en: ' matches' },
    'tool.glob.noMatch':           { zh: '未找到匹配的文件', en: 'No files found' },
    'tool.glob.files':             { zh: '个文件', en: ' files' },
    'tool.listDir.empty':          { zh: '空目录', en: 'Empty directory' },
    'tool.listDir.dirs':           { zh: '个目录', en: ' dirs' },
    'tool.listDir.files':          { zh: '个文件', en: ' files' },

    'tool.confirm.title':          { zh: '执行命令', en: 'Execute Command' },
    'tool.confirm.highRisk':       { zh: '高风险', en: 'High Risk' },
    'tool.confirm.mediumRisk':     { zh: '中风险', en: 'Medium Risk' },
    'tool.confirm.lowRisk':        { zh: '低风险', en: 'Low Risk' },
    'tool.confirm.deny':           { zh: '拒绝', en: 'Deny' },
    'tool.confirm.execute':        { zh: '执行', en: 'Execute' },

    /* ==================== Blocker 风险原因 ==================== */
    'blocker.bash.chainedCommand': { zh: '检测到链式命令，请确认后执行', en: 'Chained command detected, please confirm to execute' },
    'blocker.bash.localScript':    { zh: '执行本地脚本可能带来未知风险', en: 'Executing local script may introduce unknown risks' },
    'blocker.bash.sideEffect':     { zh: '命令 "{cmd}" 可能有副作用，请确认后执行', en: 'Command "{cmd}" may have side effects, please confirm to execute' },
    'blocker.bash.unknownCommand': { zh: '未知命令 "{cmd}"，请确认安全后执行', en: 'Unknown command "{cmd}", please confirm it is safe to execute' },

    'tool.askUser.title':          { zh: '需要确认', en: 'Confirmation Required' },
    'tool.todo.title':             { zh: '任务清单', en: 'Task List' },
    'tool.todo.unnamed':           { zh: '未命名任务', en: 'Unnamed Task' },
    'tool.todo.jumpToSession':     { zh: '跳转到关联会话', en: 'Jump to Session' },

    /* ==================== Web Search / Fetch ==================== */
    'tool.webSearch.noResults':    { zh: '无搜索结果', en: 'No results found' },
    'tool.webSearch.results':      { zh: '共 {count} 条结果', en: '{count} results' },
    'tool.webFetch.noContent':     { zh: '无内容', en: 'No content' },
    'tool.webFetch.chars':         { zh: '字符', en: 'chars' },
    'tool.webFetch.truncated':     { zh: '已截断', en: 'Truncated' },

    /* ==================== Diff Modal ==================== */
    'diff.title':                  { zh: '文件变更对比', en: 'File Diff' },
    'diff.overall':                { zh: '整体变更', en: 'Overall' },
    'diff.hunkSkipped':            { zh: '共 {count} 行未变化', en: '{count} unchanged lines' },
    'diff.hunkExpandTip':          { zh: '点击展开全部上下文', en: 'Click to expand all context' },
    'diff.hunkExpanded':           { zh: '已展开 {count} 行，点击收起', en: '{count} lines expanded, click to collapse' },
    'diff.hunkCollapseTip':        { zh: '点击收起上下文', en: 'Click to collapse' },
    'diff.hunkTooLarge':           { zh: '该段上下文过长，无法展开', en: 'Context too large to expand' },
    'diff.tabSuffix':              { zh: '(diff)', en: '(diff)' },
    'diff.openInEditor':           { zh: '在编辑器中打开', en: 'Open in Editor' },
    'diff.openInEditorTip':        { zh: '在编辑器中打开：', en: 'Open in editor: ' },
    'diff.expandAll':              { zh: '展开全部（{count}）', en: 'Expand all ({count})' },
    'diff.collapseAll':            { zh: '收起全部', en: 'Collapse all' },
    'diff.revealInTreeTip':        { zh: '在文件树中显示', en: 'Reveal in File Tree' },
    'diff.revealNoWorkspace':      { zh: '请先打开工作区，才能在文件树中定位该文件', en: 'Open a workspace first to reveal this file in the tree' },
    'diff.netStatsTip':            { zh: '该文件累计净变化行数', en: 'Net changes of this file' },
    'diff.loading':                { zh: '加载中...', en: 'Loading...' },
    'diff.noRecords':              { zh: '无变更记录', en: 'No change records' },
    'diff.noRecordsRollback':      { zh: '该变更已被回滚，暂无变更记录可查看', en: 'This change was rolled back, no records available' },
    'diff.loadFailed':             { zh: '加载失败：', en: 'Load failed: ' },
    'diff.binary':                 { zh: '此文件为二进制文件，无法显示差异', en: 'Binary file, cannot show diff' },
    'diff.noContent':              { zh: '无变更内容', en: 'No changes' },
    'diff.rolledBack':             { zh: '此变更已被回滚，以下显示该文件当前最新的变更列表', en: 'This change was rolled back, showing latest changes' },
    'diff.rollbackBtn':            { zh: '回滚此变更', en: 'Rollback This Change' },
    'diff.rollingBack':            { zh: '回滚中...', en: 'Rolling back...' },
    'diff.rollbackSuccess':        { zh: '文件已恢复：', en: 'File restored: ' },
    'diff.rollbackFailed':         { zh: '回滚失败：', en: 'Rollback failed: ' },
    'diff.typeEdit':               { zh: '编辑文件', en: 'Edit File' },
    'diff.typeWrite':              { zh: '写入文件', en: 'Write File' },
    'diff.typeDelete':             { zh: '删除文件', en: 'Delete File' },

    /* ==================== Toast ==================== */
    'toast.success':               { zh: '成功', en: 'Success' },
    'toast.error':                 { zh: '错误', en: 'Error' },
    'toast.info':                  { zh: '提示', en: 'Info' },
    'toast.warning':               { zh: '警告', en: 'Warning' },

    /* ==================== Modal ==================== */
    'modal.confirm':               { zh: '确定', en: 'OK' },
    'modal.cancel':                { zh: '取消', en: 'Cancel' },
    'modal.save':                  { zh: '保存', en: 'Save' },
    'modal.discard':               { zh: '不保存', en: "Don't Save" },
    'modal.delete':                { zh: '删除', en: 'Delete' },
    'modal.confirmDelete':         { zh: '确认删除', en: 'Confirm Delete' },
    'modal.unsavedTitle':          { zh: '未保存的修改', en: 'Unsaved Changes' },
    'modal.closeFileTitle':        { zh: '关闭文件', en: 'Close File' },

    /* ==================== Rollback Panel ==================== */
    'rollback.cantFindMsg':        { zh: '无法确定上一轮对话的消息 ID，请刷新后重试', en: 'Could not determine previous message ID, please refresh and retry' },
    'rollback.checkFailed':        { zh: '检查文件变更失败，请重试', en: 'Failed to check file changes, please retry' },
    'rollback.rollingBack':        { zh: '回滚中...', en: 'Rolling back...' },
    'rollback.fileRolledBack':     { zh: '文件已回滚', en: 'File rolled back' },
    'rollback.sessionCleared':     { zh: '此会话已清空，已自动创建新会话', en: 'Session cleared, new session created' },
    'rollback.rolledBack':         { zh: '已回滚到指定轮次', en: 'Rolled back to specified turn' },
    'rollback.failed':             { zh: '回滚失败：', en: 'Rollback failed: ' },
    'rollback.checkingFiles':      { zh: '正在检查文件变更...', en: 'Checking file changes...' },
    'rollback.panelTitle':         { zh: '回滚到上一轮对话', en: 'Rollback to Previous Turn' },
    'rollback.fileCount':          { zh: ' 个文件', en: ' files' },
    'rollback.noFileChanges':      { zh: '无文件变更', en: 'No file changes' },
    'rollback.cancel':             { zh: '取消', en: 'Cancel' },
    'rollback.rollbackShort':      { zh: '回滚', en: 'Rollback' },
    'rollback.moreOptions':        { zh: '更多回滚选项', en: 'More rollback options' },
    'rollback.rollbackAll':        { zh: '回滚会话与文件', en: 'Rollback Session & Files' },
    'rollback.rollbackFilesOnly':  { zh: '仅回滚文件', en: 'Rollback Files Only' },
    'rollback.actionDelete':       { zh: '即将移除', en: 'Will be removed' },
    'rollback.actionAdd':          { zh: '即将还原', en: 'Will be restored' },
    'rollback.actionRestore':      { zh: '即将恢复', en: 'Will be recovered' },

    /* ==================== Onboarding ==================== */
    'onboarding.welcome':          { zh: '👋 欢迎使用 HippoBuddy', en: '👋 Welcome to HippoBuddy' },
    'onboarding.welcomeSub':       { zh: '先选好你的偏好，我们马上开始！', en: 'Set your preferences and let\'s get started!' },
    'onboarding.welcomeLang':      { zh: '语言 / Language', en: 'Language / 语言' },
    'onboarding.welcomeLayout':    { zh: '页面排版', en: 'Panel Layout' },
    'onboarding.welcomeLayoutDesc': { zh: '选择你习惯的布局方式', en: 'Choose your preferred panel arrangement' },
    'onboarding.welcomeTheme':     { zh: '颜色主题', en: 'Color Theme' },
    'onboarding.themeLight':       { zh: '☀️ 浅色', en: '☀️ Light' },
    'onboarding.themeDark':        { zh: '🌙 深色', en: '🌙 Dark' },
    'onboarding.themeMidnight':    { zh: '🌃 Midnight', en: '🌃 Midnight' },
    'onboarding.layoutPreviewLeft': { zh: '预览区在左', en: 'Preview on Left' },
    'onboarding.layoutChatLeft':   { zh: '聊天区在左', en: 'Chat on Left' },
    'onboarding.layoutHintPreviewLeft': { zh: '类似 VS Code / Cursor 等经典 IDE 布局，左侧展示代码，右侧 AI 对话', en: 'Classic IDE layout like VS Code / Cursor — code on the left, AI chat on the right' },
    'onboarding.layoutHintChatLeft':   { zh: '类似 Codex / Copilot Chat 等 AI 应用布局，左侧 AI 对话，右侧展示代码', en: 'AI-native layout like Codex / Copilot Chat — AI chat on the left, code on the right' },
    'onboarding.start':            { zh: '开始导览 →', en: 'Start Tour →' },
    'onboarding.headerTitle':      { zh: '👋 欢迎使用 HippoBuddy', en: '👋 Welcome to HippoBuddy' },
    'onboarding.headerDesc':       { zh: '你的 AI 编程搭档，一切从顶部工具栏开始。<br><br>🔧 <b>模型配置</b>  — 切换 AI 模型与参数<br>🌙 <b>主题切换</b> — 明暗随意切换<br>📂 <b>工作区</b> — 选择项目文件夹，AI 直接读写代码<br>🛠️ <b>开发者工具</b> — 调试、刷新、窗口控制一应俱全', en: 'Your AI coding partner starts here.<br><br>🔧 <b>Model Settings</b> — Switch AI models & parameters<br>🌙 <b>Theme Toggle</b> — Light/Dark switch<br>📂 <b>Workspace</b> — Select project folder, AI reads/writes code directly<br>🛠️ <b>DevTools</b> — Debug, refresh, window controls' },
    'onboarding.chatTitle':        { zh: '💬 开始对话', en: '💬 Start Chatting' },
    'onboarding.chatDesc':         { zh: '在输入框中描述你的需求，按 <code>Enter</code> 发送。<br><br>上方可切换 <b>聊天/代码/办公</b> 三种模式，AI 会相应调整行为。', en: 'Describe your needs in the input box, press <code>Enter</code> to send.<br><br>Switch between <b>Chat/Code/Office</b> modes at the top.' },
    'onboarding.sessionTitle':     { zh: '📋 会话管理', en: '📋 Session Management' },
    'onboarding.sessionDesc':      { zh: '工具栏提供：<b>会话面板</b>折叠/展开 · <b>新建会话</b> · <b>切换活动栏</b>。<br><br>右侧胶囊按钮可在<b>会话列表</b>与<b>文件浏览</b>视图间切换。', en: 'Toolbar: <b>Session Panel</b> toggle · <b>New Session</b> · <b>Toggle Activity Bar</b>.<br><br>Capsule buttons switch between <b>Session List</b> and <b>File Explorer</b> views.' },
    'onboarding.sessionListTitle': { zh: '📋 会话列表', en: '📋 Session List' },
    'onboarding.sessionListDesc':  { zh: '左侧列表展示你的所有对话历史，点击即可切换会话。<br><br>每个会话支持<b>重命名</b>、<b>删除</b>。顶部 <b>「项目/时间」</b> 按钮可切换会话分组方式，轻松管理多个任务。', en: 'View all conversation history. Click to switch sessions.<br><br>Each session supports <b>Rename</b> and <b>Delete</b>. Toggle <b>Project/Time</b> grouping at the top.' },
    'onboarding.toolsTitle':       { zh: '🔧 功能工具箱', en: '🔧 Toolbox' },
    'onboarding.toolsDesc':        { zh: '右侧工具栏提供：<b>Token 统计</b> · <b>实时监控</b> · <b>文件变更</b> · <b>终端</b> · <b>浏览器</b> · <b>技能市场</b>', en: 'Toolbox: <b>Token Stats</b> · <b>Live Monitor</b> · <b>File Changes</b> · <b>Terminal</b> · <b>Browser</b> · <b>Skill Market</b>' },
    'onboarding.prev':             { zh: '← 上一步', en: '← Previous' },
    'onboarding.skip':             { zh: '跳过', en: 'Skip' },
    'onboarding.next':             { zh: '下一步 →', en: 'Next →' },
    'onboarding.done':             { zh: '完成 ✓', en: 'Done ✓' },

    /* ==================== Render Pipeline ==================== */
    'render.thinkingDone':         { zh: '已思考', en: 'Thought' },
    'render.thinking':             { zh: '思考中...', en: 'Thinking...' },
    'render.webSearching':         { zh: '正在联网搜索…', en: 'Searching the web…' },
    'render.webSearchDone':        { zh: '已联网搜索', en: 'Web search completed' },
    'render.webSearchSummary':     { zh: '已联网搜索{detail}', en: 'Web search completed{detail}' },
    'render.webSearchQueries':     { zh: ' · {n} 个关键词', en: ' · {n} queries' },
    'render.webSearchQueryOne':    { zh: ' · 1 个关键词', en: ' · 1 query' },
    'render.webSearchOpenPages':   { zh: ' · 打开 {n} 个网页', en: ' · opened {n} pages' },
    'render.webSearchOpenPageOne': { zh: ' · 打开 1 个网页', en: ' · opened 1 page' },
    'render.webSearchFindPages':   { zh: ' · 页内查找 {n} 次', en: ' · in-page search {n} times' },
    'render.webSearchFindPageOne': { zh: ' · 页内查找 1 次', en: ' · in-page search 1 time' },
    'render.webSearchDetailQueries': { zh: '搜索关键词', en: 'Search queries' },
    'render.webSearchDetailPages':   { zh: '打开的网页', en: 'Opened pages' },
    'render.webSearchDetailFinds':   { zh: '页内查找', en: 'In-page searches' },
    'render.webSearchDetailFailed':  { zh: '（失败）', en: ' (failed)' },
    'render.webSearchToggleHint':    { zh: '点击展开/收起详情', en: 'Click to expand/collapse details' },

    /* ==================== File Preview Browser ==================== */
    'browser.back':                { zh: '后退', en: 'Back' },
    'browser.forward':             { zh: '前进', en: 'Forward' },
    'browser.refresh':             { zh: '刷新', en: 'Refresh' },
    'browser.go':                  { zh: '前往', en: 'Go' },
    'browser.openExternal':        { zh: '在系统浏览器中打开', en: 'Open in System Browser' },
    'browser.placeholder':         { zh: '在地址栏输入网址后回车', en: 'Enter a URL and press Enter' },

    /* ==================== System Prompt Modal ==================== */
    'promptModal.title':           { zh: '自定义 System Prompt', en: 'Custom System Prompt' },
    'promptModal.placeholder':     { zh: '输入自定义系统提示词...', en: 'Enter custom system prompt...' },
    'promptModal.hint':            { zh: '修改后将在新会话中生效，当前会话不受影响', en: 'Changes will apply to new sessions' },
    'promptModal.cancel':          { zh: '取消', en: 'Cancel' },
    'promptModal.apply':           { zh: '应用', en: 'Apply' },

    /* ==================== Confirm Dialog ==================== */
    'confirm.deleteTitle':         { zh: '确认删除', en: 'Confirm Delete' },
    'confirm.deleteMessage':       { zh: '确定要删除会话', en: 'Are you sure you want to delete session' },
    'confirm.deleteIrreversible':  { zh: '吗？此操作无法撤销！', en: '? This action cannot be undone!' },
    'confirm.deleteFiles':         { zh: '确认删除', en: 'Confirm Delete' },
    'confirm.deleteFilesMessage':  { zh: '确认删除', en: 'Are you sure you want to delete' },
    'confirm.deleteFilesConfirm':  { zh: '确认删除', en: 'Confirm Delete' },
    'confirm.cancel':              { zh: '取消', en: 'Cancel' },
    'confirm.ok':                  { zh: '确定', en: 'OK' },

    /* ==================== Workspace ==================== */
    'workspace.switched':          { zh: '工作区已切换: ', en: 'Workspace switched: ' },
    'workspace.openFolder':        { zh: '打开工作目录', en: 'Open Workspace' },
    'workspace.unsavedSingle':     { zh: '"{name}" 有未保存的修改，是否保存？', en: '"{name}" has unsaved changes. Save?' },
    'workspace.fileRemoved':       { zh: '文件已被移除，已自动关闭标签: ', en: 'File was removed, tab closed: ' },
    'workspace.externalChangedDirty': { zh: '"{name}" 已被外部修改，但你有未保存的本地更改，未自动重载', en: '"{name}" was modified externally but has unsaved local changes; not auto-reloaded' },

    /* ==================== Skill Market ==================== */
    'skillMarket.title':           { zh: '技能市场', en: 'Skill Market' },
    'skillMarket.subtitle':        { zh: '浏览社区技能，一键安装到本地', en: 'Browse community skills, install with one click' },
    'skillMarket.searchPlaceholder': { zh: '搜索技能名称或描述...', en: 'Search skill name or description...' },
    'skillMarket.installed':       { zh: '已安装', en: 'Installed' },
    'skillMarket.all':             { zh: '全部', en: 'All' },
    'skillMarket.dev':             { zh: '开发', en: 'Development' },
    'skillMarket.frontend':        { zh: '前端', en: 'Frontend' },
    'skillMarket.security':        { zh: '安全', en: 'Security' },
    'skillMarket.devops':          { zh: 'DevOps', en: 'DevOps' },
    'skillMarket.data':            { zh: '数据', en: 'Data' },
    'skillMarket.sources':         { zh: '推荐来源', en: 'Recommended Sources' },
    'skillMarket.featured':        { zh: '精选技能', en: 'Featured Skills' },
    'skillMarket.noSkills':        { zh: '暂无已安装的技能', en: 'No installed skills yet' },
    'skillMarket.goInstall':       { zh: '去「推荐」或「精选技能」中安装吧', en: 'Go to "Sources" or "Featured" to install some' },
    'skillMarket.installedCount':  { zh: '已安装 <strong>{count}</strong> 个技能', en: 'Installed <strong>{count}</strong> skills' },
    'skillMarket.fromMarket':      { zh: '（其中 <strong>{count}</strong> 个来自精选市场）', en: '(<strong>{count}</strong> from featured market)' },
    'skillMarket.projectSkills':   { zh: '项目技能', en: 'Project Skills' },
    'skillMarket.globalSkills':    { zh: '全局技能', en: 'Global Skills' },
    'skillMarket.install':         { zh: '安装', en: 'Install' },
    'skillMarket.installedHint':   { zh: '已安装，点击卸载', en: 'Installed, click to uninstall' },
    'skillMarket.uninstall':       { zh: '卸载', en: 'Uninstall' },
    'skillMarket.loading':         { zh: '加载中...', en: 'Loading...' },
    'skillMarket.loadFailed':      { zh: '加载失败，请检查网络连接', en: 'Load failed, please check network' },
    'skillMarket.confirmInstall':  { zh: '确定安装技能「{name}」？\n来源：{source}', en: 'Install skill "{name}"?\nSource: {source}' },
    'skillMarket.installSuccess':  { zh: '✓ 技能「{name}」已安装', en: '✓ Skill "{name}" installed' },
    'skillMarket.installFailed':   { zh: '安装失败: ', en: 'Install failed: ' },
    'skillMarket.installNetworkError': { zh: '安装失败，请检查网络连接', en: 'Install failed, please check network' },
    'skillMarket.uninstallConfirm': { zh: '确定卸载技能「{name}」？', en: 'Uninstall skill "{name}"?' },
    'skillMarket.uninstallSuccess': { zh: '已卸载「{name}」', en: 'Uninstalled "{name}"' },
    'skillMarket.uninstallFailed':  { zh: '卸载失败: ', en: 'Uninstall failed: ' },
    'skillMarket.uninstallRetry':   { zh: '卸载失败，请重试', en: 'Uninstall failed, please retry' },
    'skillMarket.noMatch':         { zh: '没有匹配的技能', en: 'No matching skills' },
    'skillMarket.noMatchSource':   { zh: '该来源暂无匹配的技能', en: 'No matching skills from this source' },
    'skillMarket.backToList':      { zh: '← 返回推荐列表', en: '← Back to Sources' },
    'skillMarket.previewClose':    { zh: '关闭', en: 'Close' },
    'skillMarket.clearSearch':     { zh: '清除', en: 'Clear' },
    'skillMarket.viewOnGithub':    { zh: '在 GitHub 上查看', en: 'View on GitHub' },

    /* ---- 来源仓库描述 ---- */
    'skillMarket.source.anthropic':  { zh: 'Anthropic 官方技能仓库，Claude 技能生态标准，质量最稳定', en: 'Anthropic official skills repository, Claude skill ecosystem standard, most stable quality' },
    'skillMarket.source.aas':        { zh: '社区最大技能集合，1595+ 技能，覆盖全栈/安全/DevOps/数据科学', en: 'Largest community skill collection, 1595+ skills covering full-stack/security/DevOps/data science' },
    'skillMarket.source.vercel':     { zh: 'Vercel 团队工程最佳实践，Next.js/React 专项技能', en: 'Vercel team engineering best practices, Next.js/React specialized skills' },
    'skillMarket.source.addyosmani': { zh: '生产级工程实践：TDD、代码审查、调试、性能优化', en: 'Production-grade engineering practices: TDD, code review, debugging, performance optimization' },

    /* ---- 精选技能描述 ---- */
    'skillMarket.skill.codeReview':              { zh: '代码审查 — 五轴审查：正确性/可读性/架构/安全/性能', en: 'Code Review — Five-axis review: correctness/readability/architecture/security/performance' },
    'skillMarket.skill.tddWorkflow':             { zh: 'TDD 工作流 — Red → Green → Refactor 全流程引导', en: 'TDD Workflow — Red → Green → Refactor full workflow guide' },
    'skillMarket.skill.debugging':               { zh: '调试与错误恢复 — 六阶段诊断：构建反馈循环到复盘', en: 'Debugging & Error Recovery — Six-phase diagnosis: from feedback loop to postmortem' },
    'skillMarket.skill.securityAudit':           { zh: '安全审计与加固 — OWASP Top 10 检查、漏洞扫描、威胁建模', en: 'Security Audit & Hardening — OWASP Top 10 checks, vulnerability scanning, threat modeling' },
    'skillMarket.skill.apiDesign':               { zh: 'API 设计 — RESTful 规范、请求验证、错误处理、文档生成', en: 'API Design — RESTful conventions, request validation, error handling, documentation generation' },
    'skillMarket.skill.performance':             { zh: '性能优化 — 加载性能、渲染优化、数据库查询优化', en: 'Performance Optimization — loading perf, rendering optimization, database query tuning' },
    'skillMarket.skill.devops':                  { zh: 'DevOps 实践 — CI/CD 配置、Docker/K8s、监控告警', en: 'DevOps Practices — CI/CD setup, Docker/K8s, monitoring & alerting' },
    'skillMarket.skill.reactPatterns':           { zh: 'React 模式 — Hooks 规范、状态管理、性能优化、组件设计', en: 'React Patterns — Hooks conventions, state management, performance, component design' },
    'skillMarket.skill.databaseDesign':          { zh: '数据库设计 — 表结构设计、索引优化、迁移策略、ORM 使用', en: 'Database Design — schema design, index optimization, migration strategies, ORM usage' },
    'skillMarket.skill.incrementalImplementation': { zh: '增量实施 — 薄垂直切片实现，每步可测试可提交，避免大段一次性编码', en: 'Incremental Implementation — thin vertical slices, each step testable & commitable, avoid large monolithic coding' },

    /* ==================== Delete Confirm Modal ==================== */
    'deleteConfirm.message':       { zh: '确认删除？', en: 'Confirm delete?' },
    'deleteConfirm.cancel':        { zh: '取消', en: 'Cancel' },
    'deleteConfirm.confirm':       { zh: '确认删除', en: 'Confirm Delete' },
    'deleteConfirm.confirmFiles':  { zh: '确认删除 {count} 个文件？此操作不可撤销', en: 'Are you sure you want to delete {count} files? This cannot be undone.' },

    /* ==================== Event Router ==================== */
    'eventRouter.fallback':        { zh: 'tool_result 的 JSON 损坏导致 name 字段缺失，仍然尝试路由', en: 'tool_result JSON corrupted, name field missing, attempting route' },

    /* ==================== Settings Pages ==================== */
    'settingsPage.modelTitle':              { zh: '模型配置', en: 'Model Settings' },
    'settingsPage.modelDesc':               { zh: '配置 AI 聊天模型 Provider、API Key 等参数', en: 'Configure AI chat model Provider, API Key and more' },
    'settingsPage.modelList':               { zh: '模型列表', en: 'Model List' },
    'settingsPage.modelRefresh':            { zh: '刷新', en: 'Refresh' },
    'settingsPage.modelAdd':                { zh: '添加模型', en: 'Add Model' },

    'settingsPage.generalTitle':            { zh: '通用设置', en: 'General Settings' },
    'settingsPage.generalDesc':             { zh: '界面、行为等通用偏好设置', en: 'Interface and behavior preferences' },
    'settingsPage.generalBasic':            { zh: '基本偏好', en: 'General Preferences' },
    'settingsPage.generalTheme':            { zh: '主题模式', en: 'Theme' },
    'settingsPage.generalLight':            { zh: '浅色', en: 'Light' },
    'settingsPage.generalDark':             { zh: '深色', en: 'Dark' },
    'settingsPage.generalMidnight':         { zh: 'Midnight', en: 'Midnight' },
    'settingsPage.generalSystem':           { zh: '跟随系统', en: 'System' },
    'settingsPage.generalWorkspace':        { zh: '默认工作区路径', en: 'Default Workspace Path' },
    'settingsPage.generalWorkspaceHint':    { zh: '留空使用内置默认', en: 'empty = use default' },
    'settingsPage.generalWorkspacePh':      { zh: '留空则使用内置默认路径', en: 'Leave empty for default path' },
    'settingsPage.generalLayout':           { zh: '面板布局', en: 'Panel Layout' },
    'settingsPage.generalPreviewLeft':      { zh: '预览在左', en: 'Preview Left' },
    'settingsPage.generalChatLeft':         { zh: '聊天在左', en: 'Chat Left' },
    'settingsPage.generalBrowseFolder':     { zh: '选择文件夹', en: 'Browse Folder' },
    'settingsPage.generalLanguage':         { zh: '界面语言', en: 'Language' },
    'settingsPage.generalLangZh':           { zh: '简体中文', en: 'Chinese' },
    'settingsPage.generalLangEn':           { zh: 'English', en: 'English' },
    'settingsPage.generalDataDir':          { zh: '数据目录', en: 'Data Directory' },
    'settingsPage.generalDataDirHint':      { zh: '存储会话、配置、日志等数据，修改后需重启应用', en: 'stores sessions, config, memory, etc.;\nrestart required after change' },
    'settingsPage.generalDataDirDefault':   { zh: '(默认路径)', en: '(default)' },
    'settingsPage.generalDataDirBrowse':    { zh: '浏览', en: 'Browse' },
    'settingsPage.generalDataDirRestart':   { zh: '⚠️ 数据目录已变更，请重启应用以生效', en: '⚠️ Data directory changed, please restart the app' },
    'settingsPage.generalDataDirConfirm':   { zh: '确定将数据目录变更为以下路径？\n{path}\n\n现有数据将被复制到新位置。\n修改后需要重启应用才能生效。', en: 'Change data directory to:\n{path}\n\nExisting data will be copied to the new location.\nRestart required for the change to take effect.' },

    'settingsPage.rulesTitle':              { zh: '规则管理', en: 'Rules Management' },
    'settingsPage.rulesDesc':               { zh: '管理项目级和用户级规则文件，按「始终生效」和「手动引用」分组', en: 'Manage project and user rule files, grouped by Always and Manual' },
    'settingsPage.rulesList':               { zh: '规则列表', en: 'Rules List' },
    'settingsPage.rulesRefresh':            { zh: '刷新', en: 'Refresh' },
    'settingsPage.rulesCreate':             { zh: '新建', en: 'New' },
    'settingsPage.rulesLoading':            { zh: '加载中...', en: 'Loading...' },

    'settingsPage.skillsTitle':             { zh: '技能管理', en: 'Skills Management' },
    'settingsPage.skillsDesc':              { zh: '管理项目级和用户级技能文件，按「项目技能」和「全局技能」分组', en: 'Manage project and user skill files' },
    'settingsPage.skillsList':              { zh: '技能列表', en: 'Skills List' },
    'settingsPage.skillsRefresh':           { zh: '刷新', en: 'Refresh' },
    'settingsPage.skillsCreate':            { zh: '新建', en: 'New' },

    'settingsPage.sessionTitle':            { zh: '会话管理', en: 'Session Management' },
    'settingsPage.sessionDesc':             { zh: '配置会话保存数量和清理策略', en: 'Configure session save and cleanup' },
    'settingsPage.sessionSavePolicy':       { zh: '保存策略', en: 'Save Policy' },
    'settingsPage.sessionMaxSaved':         { zh: '最大保存会话数', en: 'Max Saved Sessions' },
    'settingsPage.sessionMaxHint':          { zh: '0 = 禁用持久化, 最大值 1000', en: '0 = disable persistence, max 1000' },
    'settingsPage.sessionDefault':          { zh: '1,000 (默认)', en: '1,000 (default)' },

    'settingsPage.contextTitle':            { zh: '上下文管理', en: 'Context Management' },
    'settingsPage.contextDesc':             { zh: '配置上下文窗口大小和截断策略，控制发送给 LLM 的上下文量', en: 'Configure context window and truncation policy' },
    'settingsPage.contextWindow':           { zh: '上下文窗口', en: 'Context Window' },
    'settingsPage.contextMaxTokens':        { zh: 'Max Tokens', en: 'Max Tokens' },
    'settingsPage.contextMaxHint':          { zh: '上下文窗口上限', en: 'Context window limit' },
    'settingsPage.contextToolTrunc':        { zh: '工具结果截断', en: 'Tool Result Truncation' },
    'settingsPage.contextToolMax':          { zh: '工具结果截断上限', en: 'Tool Result Max Tokens' },
    'settingsPage.contextToolHint':         { zh: '单工具结果最大 token 数，read 工具不设限', en: 'Max tokens per tool result, read tool unlimited' },

    'settingsPage.toolsNeedConfirm':        { zh: '需确认', en: 'Requires Confirmation' },
    'settingsPage.toolsSearchProvider':     { zh: '搜索 Provider', en: 'Search Provider' },
    'settingsPage.toolsProviderHint':       { zh: '搜索引擎服务商', en: 'Search engine provider' },
    'settingsPage.toolsApiKey':             { zh: 'API Key', en: 'API Key' },
    'settingsPage.toolsApiKeyPh':           { zh: '输入 API Key', en: 'Enter API Key' },
    'settingsPage.toolsShowHide':           { zh: '显示/隐藏', en: 'Show/Hide' },
    'settingsPage.toolsEnable':             { zh: '启用', en: 'Enabled' },
    'settingsPage.configUnavailable':       { zh: '配置 API 不可用（仅桌面端支持）', en: 'Config API unavailable (desktop only)' },
    'settingsPage.loadFailed':              { zh: '加载配置失败: ', en: 'Config load failed: ' },
    'settingsPage.saveFailed':              { zh: '保存失败: ', en: 'Save failed: ' },
    'settingsPage.loadConfigFailed':        { zh: '加载配置失败', en: 'Failed to load config' },

    /* ==================== MCP Settings ==================== */
    'settingsPage.mcpTitle':                { zh: 'MCP 配置', en: 'MCP Configuration' },
    'settingsPage.mcpDesc':                 { zh: '管理 MCP 服务器连接和工具注册', en: 'Manage MCP server connections and tool registration' },
    'settingsPage.mcpStdio':                { zh: 'STDIO（子进程）', en: 'STDIO (Child Process)' },
    'settingsPage.mcpSse':                  { zh: 'SSE（HTTP 流）', en: 'SSE (HTTP Stream)' },
    'settingsPage.mcpUnlimited':            { zh: '0 (不限制)', en: '0 (Unlimited)' },
    'settingsPage.mcpDefault':              { zh: '{n} (默认)', en: '{n} (default)' },
    'settingsPage.mcpSec':                  { zh: '{n} 秒', en: '{n} sec' },
    'settingsPage.mcpSecDefault':           { zh: '{n} 秒 (默认)', en: '{n} sec (default)' },
    'settingsPage.mcpMs':                   { zh: '{n} 毫秒', en: '{n} ms' },
    'settingsPage.mcpBasic':                { zh: '基本设置', en: 'Basic Settings' },
    'settingsPage.mcpEnabled':              { zh: '启用 MCP', en: 'Enable MCP' },
    'settingsPage.mcpAutoConnect':          { zh: '自动连接', en: 'Auto Connect' },
    'settingsPage.mcpAutoReconnect':        { zh: '自动重连', en: 'Auto Reconnect' },
    'settingsPage.mcpMaxReconnect':         { zh: '最大重连次数', en: 'Max Reconnect Attempts' },
    'settingsPage.mcpMaxReconnectHint':     { zh: '0 = 不限制', en: '0 = unlimited' },
    'settingsPage.mcpReconnectDelay':       { zh: '重连间隔', en: 'Reconnect Delay' },
    'settingsPage.mcpReconnectHint':        { zh: '秒', en: 'seconds' },
    'settingsPage.mcpReqTimeout':           { zh: '请求超时', en: 'Request Timeout' },
    'settingsPage.mcpTimeoutHint':          { zh: '毫秒', en: 'milliseconds' },
    'settingsPage.mcpServers':              { zh: '服务器', en: 'Servers' },
    'settingsPage.mcpAddServer':            { zh: '添加服务器', en: 'Add Server' },
    'settingsPage.mcpNoServers':            { zh: '暂无 MCP 服务器', en: 'No MCP servers yet' },
    'settingsPage.mcpAddFirst':             { zh: '点击「+ 添加服务器」添加第一个', en: 'Click "+ Add Server" to add one' },
    'settingsPage.mcpUnnamed':              { zh: '(未命名)', en: '(unnamed)' },
    'settingsPage.mcpAutoRegister':         { zh: '自动注册', en: 'Auto Register' },
    'settingsPage.mcpAddServerTitle':       { zh: '添加服务器', en: 'Add Server' },
    'settingsPage.mcpEditServerTitle':      { zh: '编辑服务器', en: 'Edit Server' },
    'settingsPage.mcpBackToList':           { zh: '← 返回列表', en: '← Back to List' },
    'settingsPage.mcpAdd':                  { zh: '添加', en: 'Add' },
    'settingsPage.mcpSave':                 { zh: '保存', en: 'Save' },
    'settingsPage.mcpServerId':             { zh: 'ID', en: 'ID' },
    'settingsPage.mcpServerIdHint':         { zh: '(唯一标识，字母数字连字符)', en: '(unique ID, alphanumeric + hyphens)' },
    'settingsPage.mcpServerIdPh':           { zh: 'my-mcp-server', en: 'my-mcp-server' },
    'settingsPage.mcpServerName':           { zh: '名称', en: 'Name' },
    'settingsPage.mcpServerNamePh':         { zh: '我的 MCP 服务器', en: 'My MCP Server' },
    'settingsPage.mcpType':                 { zh: '类型', en: 'Type' },
    'settingsPage.mcpCommand':              { zh: '命令', en: 'Command' },
    'settingsPage.mcpCommandPh':            { zh: 'npx', en: 'npx' },
    'settingsPage.mcpArgs':                 { zh: '参数', en: 'Arguments' },
    'settingsPage.mcpArgsHint':             { zh: '(空格分隔)', en: '(space-separated)' },
    'settingsPage.mcpArgsPh':               { zh: '-y @modelcontextprotocol/server-filesystem /path', en: '-y @modelcontextprotocol/server-filesystem /path' },
    'settingsPage.mcpUrl':                  { zh: 'URL', en: 'URL' },
    'settingsPage.mcpUrlPh':                { zh: 'http://localhost:3000/sse', en: 'http://localhost:3000/sse' },
    'settingsPage.mcpEnvVars':              { zh: '环境变量', en: 'Environment Variables' },
    'settingsPage.mcpEnvHint':              { zh: '(仅 STDIO 类型生效)', en: '(STDIO only)' },
    'settingsPage.mcpEnvNone':              { zh: '暂无环境变量', en: 'No environment variables' },
    'settingsPage.mcpEnvAdd':               { zh: '添加变量', en: 'Add Variable' },
    'settingsPage.mcpAutoRegTools':         { zh: '自动注册工具', en: 'Auto Register Tools' },
    'settingsPage.mcpServerIdRequired':     { zh: '服务器 ID 不能为空', en: 'Server ID is required' },
    'settingsPage.mcpServerIdExists':       { zh: '服务器 ID "', en: 'Server ID "' },
    'settingsPage.mcpServerIdExistsEnd':    { zh: '" 已存在', en: '" already exists' },
    'settingsPage.mcpServerAdded':          { zh: '服务器已添加', en: 'Server added' },
    'settingsPage.mcpServerSaved':          { zh: '服务器已保存', en: 'Server saved' },
    'settingsPage.mcpServerDeleted':        { zh: '已删除服务器: ', en: 'Server deleted: ' },
    'settingsPage.mcpDeleteConfirm':        { zh: '确定删除 MCP 服务器「', en: 'Are you sure you want to delete MCP server "' },
    'settingsPage.mcpDeleteConfirmEnd':     { zh: '」？', en: '"? ' },

    /* ==================== Model Settings Page ==================== */
    'settingsPage.modelLoading':            { zh: '加载中...', en: 'Loading...' },
    'settingsPage.modelLoadFailed':         { zh: '加载失败，请重试', en: 'Load failed, please retry' },
    'settingsPage.modelEmpty':              { zh: '暂无已添加的模型', en: 'No models added yet' },
    'settingsPage.modelProviderCol':        { zh: '服务商', en: 'Provider' },
    'settingsPage.modelModelCol':           { zh: '模型', en: 'Model' },
    'settingsPage.modelActionCol':          { zh: '操作', en: 'Actions' },
    'settingsPage.modelDeleteTitle':        { zh: '删除', en: 'Delete' },
    'settingsPage.modelDeleteConfirm':      { zh: '确定从历史记录中删除模型「', en: 'Delete model "' },
    'settingsPage.modelDeleteConfirmEnd':   { zh: '」？', en: '" from history?' },
    'settingsPage.modelDeleted':            { zh: '已删除模型: ', en: 'Model deleted: ' },
    'settingsPage.modelDeleteFailed':       { zh: '删除失败: ', en: 'Delete failed: ' },
    'settingsPage.modelUnknownError':       { zh: '未知错误', en: 'Unknown error' },

    /* ==================== Rules Settings Page ==================== */
    'settingsPage.rulesLoadFailed':         { zh: '加载失败，请重试', en: 'Load failed, please retry' },
    'settingsPage.rulesEmpty':              { zh: '暂无规则文件', en: 'No rule files yet' },
    'settingsPage.rulesEmptyHint':          { zh: '点击「+ 新建」创建第一条规则', en: 'Click "+ New" to create your first rule' },
    'settingsPage.rulesGroupAlways':        { zh: '始终生效', en: 'Always Active' },
    'settingsPage.rulesGroupManual':        { zh: '手动引用', en: 'Manual Reference' },
    'settingsPage.rulesProject':            { zh: '项目', en: 'Project' },
    'settingsPage.rulesGlobal':             { zh: '全局', en: 'Global' },
    'settingsPage.rulesDelete':             { zh: '删除', en: 'Delete' },
    'settingsPage.rulesEditTitle':          { zh: '编辑规则：', en: 'Edit Rule: ' },
    'settingsPage.rulesBackToList':         { zh: '← 返回列表', en: '← Back to List' },
    'settingsPage.rulesSave':               { zh: '保存', en: 'Save' },
    'settingsPage.rulesName':               { zh: '规则名称', en: 'Rule Name' },
    'settingsPage.rulesDesc':               { zh: '描述', en: 'Description' },
    'settingsPage.rulesMode':               { zh: '模式', en: 'Mode' },
    'settingsPage.rulesScope':              { zh: '作用域', en: 'Scope' },
    'settingsPage.rulesNameRequired':       { zh: '规则名称不能为空', en: 'Rule name is required' },
    'settingsPage.rulesSaved':              { zh: '规则已保存', en: 'Rule saved' },
    'settingsPage.rulesSaving':             { zh: '保存中…', en: 'Saving…' },
    'settingsPage.rulesSavedIcon':          { zh: '✓ 已保存', en: '✓ Saved' },

    /* ==================== Skills Settings Page ==================== */
    'settingsPage.skillsLoadFailed':        { zh: '加载失败，请重试', en: 'Load failed, please retry' },
    'settingsPage.skillsEmpty':             { zh: '暂无技能文件', en: 'No skill files yet' },
    'settingsPage.skillsEmptyHint':         { zh: '点击「+ 新建」创建第一个技能', en: 'Click "+ New" to create your first skill' },
    'settingsPage.skillsGroupProject':      { zh: '项目技能', en: 'Project Skills' },
    'settingsPage.skillsGroupUser':         { zh: '全局技能', en: 'Global Skills' },
    'settingsPage.skillsDelete':            { zh: '删除', en: 'Delete' },
    'settingsPage.skillsEditTitle':         { zh: '编辑技能：', en: 'Edit Skill: ' },
    'settingsPage.skillsBackToList':        { zh: '← 返回列表', en: '← Back to List' },
    'settingsPage.skillsSave':              { zh: '保存', en: 'Save' },
    'settingsPage.skillsName':              { zh: '技能名称', en: 'Skill Name' },
    'settingsPage.skillsDesc':              { zh: '描述', en: 'Description' },
    'settingsPage.skillsDescPh':            { zh: '简短说明，前端展示用', en: 'Brief description for display' },
    'settingsPage.skillsScope':             { zh: '作用域', en: 'Scope' },
    'settingsPage.skillsNameRequired':      { zh: '技能名称不能为空', en: 'Skill name is required' },
    'settingsPage.skillsSaved':             { zh: '技能已保存', en: 'Skill saved' },
    'settingsPage.skillsSaving':            { zh: '保存中…', en: 'Saving…' },
    'settingsPage.skillsSavedIcon':         { zh: '✓ 已保存', en: '✓ Saved' },
    'settingsPage.skillsSaveFailed':        { zh: '保存失败: ', en: 'Save failed: ' },
    'settingsPage.skillsCreate':            { zh: '创建', en: 'Create' },
    'settingsPage.rulesCreate':             { zh: '创建', en: 'Create' },
    'settingsPage.skillsCreating':          { zh: '创建中…', en: 'Creating…' },
    'settingsPage.skillsCreated':           { zh: '技能已创建', en: 'Skill created' },
    'settingsPage.skillsCreatedIcon':       { zh: '✓ 已创建', en: '✓ Created' },
    'settingsPage.rulesCreated':            { zh: '规则已创建', en: 'Rule created' },
    'settingsPage.rulesCreatedIcon':        { zh: '✓ 已创建', en: '✓ Created' },
    'settingsPage.rulesCreating':           { zh: '创建中…', en: 'Creating…' },
    'settingsPage.modelCreate':             { zh: '添加模型', en: 'Add Model' },
    'settingsPage.modelEdit':               { zh: '编辑模型: ', en: 'Edit Model: ' },
    'settingsPage.modelCreateAction':       { zh: '创建', en: 'Create' },
    'settingsPage.modelSaveAction':         { zh: '保存', en: 'Save' },
    'settingsPage.modelCreating':           { zh: '创建中…', en: 'Creating…' },
    'settingsPage.modelSaving':             { zh: '保存中…', en: 'Saving…' },
    'settingsPage.modelCreated':            { zh: '已创建模型: ', en: 'Model created: ' },
    'settingsPage.modelSaved':              { zh: '已保存模型: ', en: 'Model saved: ' },
    'settingsPage.modelCreateFailed':       { zh: '创建模型失败:', en: 'Create model failed: ' },
    'settingsPage.modelSaveFailed':         { zh: '保存模型失败:', en: 'Save model failed: ' },
    'settingsPage.networkError':            { zh: '网络错误，请重试', en: 'Network error, please retry' },
    'settingsPage.deleteFailedRetry':       { zh: '删除失败，请重试', en: 'Delete failed, please retry' },
    'settingsPage.deleteConfirmRule':       { zh: '确定删除规则「', en: 'Delete rule "' },
    'settingsPage.deleteConfirmSkill':      { zh: '确定删除技能「', en: 'Delete skill "' },
    'settingsPage.deleteConfirmEnd':        { zh: '」？', en: '"? ' },

    /* ---- Missing Rules keys ---- */
    'settingsPage.rulesCreateTitle':        { zh: '新建规则', en: 'New Rule' },
    'settingsPage.rulesNamePh':             { zh: 'my-rule（字母、数字、连字符、下划线、点）', en: 'my-rule (letters, numbers, hyphens, underscores, dots)' },
    'settingsPage.rulesDescPh':             { zh: '简短说明', en: 'Brief description' },
    'settingsPage.rulesContentPh':          { zh: '规则正文内容，Markdown 格式', en: 'Rule content in Markdown format' },

    /* ---- Missing Skills keys ---- */
    'settingsPage.skillsCreateTitle':       { zh: '新建技能', en: 'New Skill' },
    'settingsPage.skillsNamePh':            { zh: 'my-skill（字母、数字、连字符，不含 .md）', en: 'my-skill (letters, numbers, hyphens, no .md)' },
    'settingsPage.skillsLoading':           { zh: '加载中...', en: 'Loading...' },
    'settingsPage.skillsContentPh':         { zh: '技能正文内容，Markdown 格式', en: 'Skill content in Markdown format' },

    /* ---- Missing Model keys ---- */
    'settingsPage.xunfei':                  { zh: '讯飞星火', en: 'Spark (iFlytek)' },
    'settingsPage.modelNamePh':             { zh: '例如 deepseek-v4-flash', en: 'e.g. deepseek-v4-flash' },
    'settingsPage.modelBaseUrlPh':          { zh: 'https://api.deepseek.com', en: 'https://api.deepseek.com' },
    'settingsPage.modelMaxTokensHint':      { zh: '单次输出上限，含思维链+回答；Default=使用模型默认参数', en: 'max single output, includes CoT+reply; Default=use model default' },
    'settingsPage.modelThinkingHint':       { zh: '思考链推理，提高回答准确性', en: 'Chain-of-thought reasoning for better accuracy' },
    'settingsPage.modelReasoningHint':      { zh: '思考档位：low / high（默认）/ max，仅开启思考时生效', en: 'Effort levels: low / high (default) / max; only when Thinking is on' },
    'settingsPage.modelNameRequired':       { zh: 'Model 名称不能为空', en: 'Model name is required' },
    'settingsPage.modelBackToList':         { zh: '← 返回列表', en: '← Back to List' },
    'settingsPage.modelApiKeyPlaceholder':  { zh: '输入 API Key', en: 'Enter API Key' },
    'settingsPage.modelShowHide':           { zh: '显示/隐藏', en: 'Show/Hide' },
    'settingsPage.vision':                  { zh: '视觉能力', en: 'Vision' },
    'settingsPage.visionHint':              { zh: '多模态图片识别能力', en: 'Multimodal image recognition' },
    'settingsPage.visionSupported':         { zh: '支持', en: 'Supported' },
    'settingsPage.visionNotSupported':      { zh: '不支持', en: 'Not Supported' },

    /* ==================== Context Selector ==================== */
    'contextSelector.title':              { zh: '引用上下文', en: 'Reference Context' },
    'contextSelector.header':             { zh: '# 引用上下文', en: '# Reference Context' },
    'contextSelector.back':               { zh: '返回', en: 'Back' },
    'contextSelector.rules':              { zh: '规则', en: 'Rules' },
    'contextSelector.skills':             { zh: '技能', en: 'Skills' },
    'contextSelector.alwaysActive':       { zh: '始终生效', en: 'Always Active' },
    'contextSelector.manualRef':          { zh: '手动引用', en: 'Manual Reference' },
    'contextSelector.projectSkills':      { zh: '项目技能', en: 'Project Skills' },
    'contextSelector.userSkills':         { zh: '用户技能', en: 'User Skills' },
    'contextSelector.noRules':            { zh: '暂无规则', en: 'No rules' },
    'contextSelector.noSkills':           { zh: '暂无技能', en: 'No skills' },
    'contextSelector.goCreate':           { zh: '前往左侧活动栏创建', en: 'Create from activity bar' },

    /* ==================== Search Panel ==================== */
    'search.find':                        { zh: '查找', en: 'Find' },
    'search.replace':                     { zh: '替换', en: 'Replace' },
    'search.caseSensitive':               { zh: '区分大小写', en: 'Case Sensitive' },
    'search.regex':                       { zh: '正则表达式', en: 'Regex' },
    'search.wholeWord':                   { zh: '全词匹配', en: 'Whole Word' },
    'search.prev':                        { zh: '上一个 (Shift+Enter)', en: 'Previous (Shift+Enter)' },
    'search.next':                        { zh: '下一个 (Enter)', en: 'Next (Enter)' },
    'search.expandReplace':               { zh: '展开替换', en: 'Expand Replace' },
    'search.close':                       { zh: '关闭 (Esc)', en: 'Close (Esc)' },

    /* ==================== Mermaid ==================== */
    'mermaid.svgImage':                   { zh: 'SVG 图片', en: 'SVG Image' },
    'mermaid.pngImage':                   { zh: 'PNG 图片', en: 'PNG Image' },
    'mermaid.saved':                      { zh: '已保存: ', en: 'Saved: ' },
    'mermaid.preview':                    { zh: '预览', en: 'Preview' },
    'mermaid.showSource':                 { zh: '显示源码', en: 'Show Source' },
    'mermaid.syntaxError':                { zh: '图表语法错误', en: 'Diagram Syntax Error' },
    'mermaid.rendering':                  { zh: '渲染中...', en: 'Rendering...' },

    /* ==================== File Tree (additional) ==================== */
    'fileTree.newFile':                   { zh: '新建文件', en: 'New File' },
    'fileTree.newFolder':                 { zh: '新建文件夹', en: 'New Folder' },
    'fileTree.showInExplorer':            { zh: '在资源管理器中显示', en: 'Show in Explorer' },
    'fileTree.openInTerminal':            { zh: '在终端中打开', en: 'Open in Terminal' },
    'fileTree.fileName':                  { zh: '文件名', en: 'File Name' },
    'fileTree.folderName':                { zh: '文件夹名', en: 'Folder Name' },
    'fileTree.fileNameHint':              { zh: '例如: index.js', en: 'e.g. index.js' },
    'fileTree.folderNameHint':            { zh: '例如: my-folder', en: 'e.g. my-folder' },
    'fileTree.createFailed':              { zh: '创建失败: ', en: 'Create failed: ' },
    'fileTree.movedToRoot':               { zh: '已移动到根目录: ', en: 'Moved to root: ' },
    'fileTree.moved':                     { zh: '已移动: ', en: 'Moved: ' },
    'fileTree.moveFailed':                { zh: '移动失败: ', en: 'Move failed: ' },
    'fileTree.renameFailed':              { zh: '重命名失败: ', en: 'Rename failed: ' },
    'fileTree.deleteFailed':              { zh: '删除失败: ', en: 'Delete failed: ' },

    /* ==================== Chat (additional) ==================== */
    'chat.noExport':                      { zh: '没有可导出的对话', en: 'No sessions to export' },
    'chat.noMessages':                    { zh: '当前会话没有消息', en: 'Current session has no messages' },
    'chat.noModel':                       { zh: '未配置模型', en: 'No model configured' },
    'chat.noModelConfigTip':              { zh: '请先在设置中配置模型后再发送消息', en: 'Please configure a model in settings first' },
    'chat.noHistory':                     { zh: '暂无历史会话', en: 'No session history' },
    'chat.forkNoMessageId':               { zh: '无法确定分叉位置的消息 ID', en: 'Could not determine fork message ID' },
    'chat.forkFailedMsg':                 { zh: '分叉失败：{message}', en: 'Fork failed: {message}' },
    'chat.addModel':                      { zh: '✚ 添加模型...', en: '✚ Add Model...' },
    'chat.exportConfirm':                 { zh: '确定导出当前对话吗？\n\n会话：{name}\n消息数：{count} 条\n格式：Markdown (.md)', en: 'Export current conversation?\n\nSession: {name}\nMessages: {count}\nFormat: Markdown (.md)' },
    'chat.exportHeader':                  { zh: '> 导出时间：{time}', en: '> Exported at: {time}' },
    'chat.exportMessageCount':            { zh: '> 共 {count} 条消息', en: '> {count} messages' },
    'chat.exportUserLabel':               { zh: '## 🙋 你', en: '## 🙋 User' },
    'chat.exportAssistantLabel':          { zh: '## 🤖 AI', en: '## 🤖 AI' },
    'chat.exportErrorLabel':              { zh: '  - 错误: {message}', en: '  - Error: {message}' },
    'chat.exportEmptyResponse':           { zh: '*（空响应）*', en: '*(Empty response)*' },
    'chat.exportSuccess':                 { zh: '已导出：{filename}', en: 'Exported: {filename}' },
    'chat.exportFailed':                  { zh: '导出失败：{message}', en: 'Export failed: {message}' },
    'chat.timeoutError':                  { zh: '请求超时', en: 'Request timeout' },
    'chat.undoFailed':                    { zh: '撤销失败: ', en: 'Undo failed: ' },
    'chat.rewindFailed':                  { zh: '回滚失败: ', en: 'Rewind failed: ' },
    'chat.forkFailed':                    { zh: '分叉失败: ', en: 'Fork failed: ' },
    'chat.llmNoContent':                  { zh: 'LLM 未返回有效内容', en: 'LLM returned no content' },
    'chat.requestFailed':                 { zh: '请求失败', en: 'Request failed' },
    'chat.confirmFailed':                 { zh: '确认请求失败', en: 'Confirmation failed' },
    'chat.toolResultParseError':          { zh: '工具结果数据解析异常', en: 'Tool result data parse error' },

    'chatui.viewFileProducts':          { zh: '查看本轮文件产物', en: 'View file products' },

    /* ==================== Chat UI (additional) ==================== */
    'chatui.forkSuccess':                 { zh: '已分叉为新会话', en: 'Forked into new session' },
    'chatui.stopped':                     { zh: '已停止生成', en: 'Generation stopped' },
    'chatui.maxTurnsReached':             { zh: '已达工具调用轮数上限（50 轮）', en: 'Reached tool call turn limit (50)' },
    'chatui.maxTurnsReachedDetail':       { zh: '任务可能未完成。建议将目标拆分为更小的步骤重新发起，或继续提问让 AI 接着执行', en: 'The task may be incomplete. Consider breaking it into smaller steps or continue asking to keep going' },
    'chatui.errorNetwork':                { zh: '网络连接失败，请检查后端服务是否正常运行', en: 'Network connection failed, check if backend is running' },
    'chatui.errorNetworkDetail':          { zh: '无法与服务器建立连接，请确认服务已启动且网络通畅', en: 'Cannot connect to server, please ensure service is running' },
    'chatui.errorTimeout':                { zh: '请求超时，服务响应时间过长', en: 'Request timeout, server response too slow' },
    'chatui.errorTimeoutDetail':          { zh: '请稍后重试，或检查服务是否负载过高', en: 'Please retry later, or check server load' },
    'chatui.errorServiceUnavailable':     { zh: '服务暂时不可用 ({status})', en: 'Service temporarily unavailable ({status})' },
    'chatui.errorServiceUnavailableDetail': { zh: '后端服务暂时无法处理请求，请稍后重试', en: 'Backend temporarily unavailable, please retry later' },
    'chatui.errorTooManyRequests':        { zh: '请求过于频繁 (429)', en: 'Too many requests (429)' },
    'chatui.errorTooManyRequestsDetail':  { zh: '请稍后重试', en: 'Please retry later' },
    'chatui.errorPermission':             { zh: '权限不足 ({status})', en: 'Permission denied ({status})' },
    'chatui.errorPermissionDetail':       { zh: '请检查认证信息是否正确', en: 'Please check authentication credentials' },
    'chatui.errorServer':                 { zh: '服务异常 ({status})', en: 'Server error ({status})' },
    'chatui.errorServerDetail':           { zh: '请稍后重试，如问题持续请联系管理员', en: 'Please retry later, contact admin if persists' },
    'chatui.errorAiNoResponse':           { zh: 'AI 未返回有效响应', en: 'AI returned no valid response' },
    'chatui.errorAiNoResponseDetail':     { zh: '请尝试重新发送消息', en: 'Please try resending your message' },
    'chatui.errorAuthFailed':             { zh: 'API Key 无效或已过期，请检查模型配置', en: 'Invalid or expired API Key, please check model settings' },
    'chatui.errorAuthFailedDetail':       { zh: '请在设置中重新填写 API Key 后重试', en: 'Please re-enter API Key in settings and retry' },
    'chatui.errorInsufficientBalance':    { zh: '账户余额不足，请充值后继续使用', en: 'Insufficient account balance, please top up and retry' },
    'chatui.errorInsufficientBalanceDetail': { zh: '模型服务提示余额不足，请前往对应平台充值', en: 'Model provider reports insufficient balance, please top up on the platform' },
    'chatui.errorModelNotFound':          { zh: '模型不存在或不可用，请检查模型配置', en: 'Model not found or unavailable, please check model settings' },
    'chatui.errorModelNotFoundDetail':    { zh: '请确认模型名称是否正确，或切换到其他模型', en: 'Please verify the model name or switch to another model' },
    'chatui.errorContextTooLong':         { zh: '上下文长度超过模型限制', en: 'Context length exceeds model limit' },
    'chatui.errorContextTooLongDetail':   { zh: '请精简消息内容，或开启会话压缩后重试', en: 'Please shorten the message or enable conversation compaction' },
    'chatui.errorInvalidRequest':         { zh: '请求参数错误，请重试', en: 'Invalid request, please retry' },
    'chatui.errorInvalidRequestDetail':   { zh: '模型服务拒绝了本次请求，请调整输入后重试', en: 'Model provider rejected the request, please adjust input and retry' },
    'chatui.errorContentFiltered':        { zh: '内容被安全过滤器阻止', en: 'Content blocked by safety filter' },
    'chatui.errorContentFilteredDetail':  { zh: '请调整表述后重新发送', en: 'Please rephrase and resend' },
    'chatui.errorResponseLengthExceeded': { zh: '响应长度达到限制', en: 'Response length limit reached' },
    'chatui.errorResponseLengthExceededDetail': { zh: '请精简上下文，或在设置中增加 max_tokens', en: 'Please shorten the context or increase max_tokens in settings' },
    'chatui.errorConfigMissing':          { zh: '模型配置不完整，请先在设置中配置模型', en: 'Incomplete model config, please configure the model in settings' },
    'chatui.errorConfigMissingDetail':    { zh: '需要在设置中选择提供商并填写 API Key', en: 'Please select a provider and fill in the API Key in settings' },

    /* ==================== Preview (additional) ==================== */
    'preview.failed':                     { zh: '预览失败', en: 'Preview failed' },
    'preview.fileTooLarge':               { zh: '文件过大', en: 'File too large' },
    'preview.fileTooLargeDetail':         { zh: '文件大小超过预览上限（50MB），请在本地打开', en: 'File exceeds preview limit (50MB), open locally' },
    'preview.fileNotFound':               { zh: '文件未找到', en: 'File not found' },
    'preview.fileNotFoundDetail':         { zh: '文件可能已被移动或删除', en: 'File may have been moved or deleted' },
    'preview.badRequest':                 { zh: '请求错误', en: 'Bad request' },
    'preview.badRequestDetail':           { zh: '无效的文件路径', en: 'Invalid file path' },
    'preview.serverError':                { zh: '服务器错误', en: 'Server error' },
    'preview.serverErrorDetail':          { zh: '服务器处理文件时出错，请稍后重试', en: 'Server error processing file, please retry later' },
    'preview.httpError':                  { zh: '请求失败', en: 'HTTP error' },
    'preview.readFailed':                 { zh: '读取文件失败', en: 'Failed to read file' },
    'preview.saveFailed':                 { zh: '保存失败', en: 'Failed to save file' },

    /* ==================== Workspace (additional) ==================== */
    'workspace.defaultName':              { zh: '默认工作区', en: 'Default Workspace' },
    'workspace.noRecentFolders':          { zh: '暂无最近打开的文件夹', en: 'No recently opened folders' },

    /* ==================== Metrics Panel ==================== */
    'metrics.updatedAt':                  { zh: '更新于 ', en: 'Updated at ' },

    'window.restore':                { zh: '还原', en: 'Restore' },

    /* ==================== File Tree ==================== */
    'fileTree.copyAbsolutePath':     { zh: '复制绝对路径', en: 'Copy Absolute Path' },
    'fileTree.copyRelativePath':     { zh: '复制相对路径', en: 'Copy Relative Path' },
    'fileTree.rename':               { zh: '重命名', en: 'Rename' },
    'fileTree.delete':               { zh: '删除', en: 'Delete' },
    'fileTree.renameTitle':          { zh: '重命名', en: 'Rename' },
    'fileTree.newName':              { zh: '新名称', en: 'New Name' },
    'fileTree.folder':               { zh: '文件夹', en: 'Folder' },
    'fileTree.file':                 { zh: '文件', en: 'File' },
    'fileTree.deleteConfirm':        { zh: '确定要删除 <strong>{name}</strong> 吗？', en: 'Are you sure you want to delete <strong>{name}</strong>?' },
    'fileTree.deleteNote':           { zh: '文件将被移入系统回收站', en: 'The file will be moved to system trash' },
    'fileTree.inputTitle':           { zh: '输入', en: 'Input' },
    'fileTree.cancelBtn':            { zh: '取消', en: 'Cancel' },
    'fileTree.confirmBtn':           { zh: '确认', en: 'Confirm' },
    'fileTree.confirmTitle':         { zh: '确认', en: 'Confirm' },
    'fileTree.deleteBtn':            { zh: '删除', en: 'Delete' },

    /* ==================== File Preview ==================== */
    'preview.openInWord':            { zh: '在 Word 中打开', en: 'Open in Word' },
    'preview.openInExcel':           { zh: '在 Excel 中打开', en: 'Open in Excel' },
    'preview.openInPowerPoint':      { zh: '在 PowerPoint 中打开', en: 'Open in PowerPoint' },
    'preview.editMode':              { zh: '编辑模式', en: 'Edit Mode' },
    'preview.previewMode':           { zh: '预览模式', en: 'Preview Mode' },
    'preview.tocTitle':              { zh: '目录', en: 'Table of Contents' },
    'preview.tocCollapse':           { zh: '收起目录', en: 'Collapse TOC' },
    'preview.tocExpand':             { zh: '展开目录', en: 'Expand TOC' },
    'preview.lines':                 { zh: '行', en: ' lines' },
    'preview.pages':                 { zh: '页', en: ' pages' },
    'preview.warnings':              { zh: '条警告', en: ' warnings' },

    /* ==================== Image/PPTX Zoom ==================== */
    'preview.zoomOut':               { zh: '缩小', en: 'Zoom Out' },
    'preview.zoomIn':                { zh: '放大', en: 'Zoom In' },
    'preview.zoomReset':             { zh: '重置', en: 'Reset' },
    'preview.zoomFitWidth':          { zh: '适配宽度', en: 'Fit Width' },
    'preview.zoomResetScale':        { zh: '重置缩放', en: 'Reset Zoom' },

    /* ==================== Mermaid ==================== */
    'mermaid.zoomOut':               { zh: '缩小', en: 'Zoom Out' },
    'mermaid.zoomIn':                { zh: '放大', en: 'Zoom In' },
    'mermaid.zoomReset':             { zh: '重置', en: 'Reset' },
    'mermaid.fullscreen':            { zh: '全屏', en: 'Fullscreen' },
    'mermaid.export':                { zh: '导出', en: 'Export' },
    'mermaid.exportPng':             { zh: '导出 PNG', en: 'Export PNG' },
    'mermaid.exportSvg':             { zh: '导出 SVG', en: 'Export SVG' },

    /* ==================== Chat Hero ==================== */
    'chat.enterHint':                { zh: 'Enter 发送 · Shift+Enter 换行', en: 'Enter to send · Shift+Enter for new line' },
    'chat.compactHint':              { zh: '输入压缩指令（可选）：\n\n例如："保留所有代码示例"、"只保留重要信息"\n\n留空则自动智能压缩', en: 'Enter compression instructions (optional):\n\ne.g. "Keep all code examples", "Keep only important info"\n\nLeave empty for automatic smart compression' },

    /* ==================== Memory Panel ==================== */
    'memory.back':                   { zh: '返回', en: 'Back' },
    'memory.view':                   { zh: '查看', en: 'View' },
    'memory.edit':                   { zh: '编辑', en: 'Edit' },
    'memory.delete':                 { zh: '删除', en: 'Delete' },
    'memory.refresh':                { zh: '刷新', en: 'Refresh' },
    'memory.deleteConfirm':          { zh: '确定要删除记忆 "{id}" 吗？此操作不可撤销。', en: 'Are you sure you want to delete memory "{id}"? This action cannot be undone.' },
    'memory.deleteSuccess':          { zh: '删除成功', en: 'Delete successful' },
    'memory.deleteFailed':           { zh: '删除失败', en: 'Delete failed' },
    'memory.all':                    { zh: '全部', en: 'All' },
    'memory.empty':                  { zh: '暂无记忆', en: 'No memories' },
    'memory.saveFailed':             { zh: '保存失败', en: 'Save failed' },

    /* ==================== Markdown ==================== */
    'markdown.preview':              { zh: '预览', en: 'Preview' },
    'markdown.copyLatex':            { zh: '复制 LaTeX 源码', en: 'Copy LaTeX Source' },

    /* ==================== Chat Service ==================== */
    'chat.fetchFailed':              { zh: '获取消息失败', en: 'Failed to fetch messages' },
    'chat.retrying':                 { zh: '正在重试 ({attempt}/{maxRetries})...', en: 'Retrying ({attempt}/{maxRetries})...' },
    'chat.emptyMessage':             { zh: '(空消息)', en: '(Empty message)' },

    /* ==================== Chat UI ==================== */
    'chatui.copied':                 { zh: '已复制', en: 'Copied' },
    'chatui.exportSuccess':          { zh: '已导出：{filename}', en: 'Exported: {filename}' },
    'chatui.exportFailed':           { zh: '导出失败：{message}', en: 'Export failed: {message}' },
    'chatui.compactSuccess':         { zh: '压缩完成！方法：{method}\n原始{originalCount}条 → 压缩后{compactedCount}条\n减少{reducedCount}条，节省Token {savedTokens}({savedPercent}%)\n\n摘要：{summary}', en: 'Compacted! Method: {method}\nOriginal {originalCount} → Compacted {compactedCount}\nReduced {reducedCount}, Saved {savedTokens} tokens ({savedPercent}%)\n\nSummary: {summary}' },
    'chatui.compactFailed':          { zh: '压缩失败：{message}', en: 'Compaction failed: {message}' },
    'chatui.noValidResponse':        { zh: 'AI 未返回有效响应，请尝试重新发送', en: 'AI returned no valid response, please try resending' },
    'chatui.modelSwitched':          { zh: '模型已切换: {provider} · {model}', en: 'Model switched: {provider} · {model}' },
    'chatui.modelSwitchFailed':      { zh: '切换模型失败: {message}', en: 'Model switch failed: {message}' },
    'chatui.effortSwitched':         { zh: '思考强度已切换: {effort}', en: 'Reasoning effort: {effort}' },
    'chatui.effortSwitchFailed':     { zh: '切换思考强度失败: {message}', en: 'Effort switch failed: {message}' },
    'chatui.effortDefaultLabel':     { zh: 'Default', en: 'Default' },
    'chatui.effortSelectorTitle':    { zh: '思考强度（Reasoning Effort）', en: 'Reasoning Effort' },
    'chatui.effortDisabledTitle':    { zh: '需开启 Thinking Mode 才能调节思考强度', en: 'Enable Thinking Mode to adjust' },

    /* ==================== Model Selector Panel ==================== */
    'msp.modelSection':              { zh: '模型', en: 'Model' },
    'msp.effortSection':             { zh: '思考强度', en: 'Reasoning Effort' },
    'msp.back':                      { zh: '返回', en: 'Back' },

    /* ==================== File Tabs ==================== */
    'fileTabs.closeCurrent':         { zh: '关闭当前', en: 'Close Current' },
    'fileTabs.closeOthers':          { zh: '关闭其他', en: 'Close Others' },
    'fileTabs.closeRight':           { zh: '关闭右侧', en: 'Close Right' },
    'fileTabs.closeAll':             { zh: '关闭全部', en: 'Close All' },
    'fileTabs.copyPath':             { zh: '复制文件路径', en: 'Copy File Path' },
    'fileTabs.closeAllConfirm':      { zh: '{count} 个文件有未保存的修改，确定全部关闭吗？', en: '{count} files have unsaved changes. Close all?' },
    'fileTabs.closeAllBtn':          { zh: '全部关闭', en: 'Close All' },

    /* ==================== Search Panel ==================== */
    'search.replaceAll':             { zh: '全部替换', en: 'Replace All' },

    /* ==================== Hippo Speeches ==================== */
    'hippo.speeches': {
      zh: [
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
      ],
      en: [
        'Nice code! 👍',
        'So hot🫠',
        'Wanna swim💧',
        'Hungry? 🍉',
        'What‘s for lunch? 🍗',
        'Writing bugs again?',
        'Hello there! 👋',
        'Let me see… 👀',
        'I know this one!',
        'Need a hand?',
        '💤 A bit sleepy…',
        'Time to wrap up 🕐',
        'Thinking… 🤔',
        'Praise me! Praise me!',
        '👿 Hmph!',
        'Ooh, look at that! 😯',
        'What‘s the quietest animal in the world? 🤔',
        'Why does Spidey wear a bodysuit? 🤔',
        'Let‘s go! Let‘s go! 🚀',
      ],
    },

    /* ==================== 自动更新 ==================== */
    'updater.newVersion':            { zh: '发现新版本 v{version}', en: 'New version v{version} available' },
    'updater.checking':              { zh: '正在检查更新…', en: 'Checking for updates…' },
    'updater.upToDate':              { zh: '已是最新版本', en: 'You are up to date' },
    'updater.downloading':           { zh: '正在下载更新…', en: 'Downloading update…' },
    'updater.downloadReady':         { zh: '更新已就绪，重启后生效', en: 'Update ready, restart to apply' },
    'updater.download':              { zh: '立即更新', en: 'Update Now' },
    'updater.later':                 { zh: '稍后', en: 'Later' },
    'updater.restart':               { zh: '重启安装', en: 'Restart & Install' },
    'updater.checkFailed':           { zh: '检查更新失败：{message}', en: 'Update check failed: {message}' },
    'updater.downloadFailed':        { zh: '下载更新失败：{message}', en: 'Download failed: {message}' },
  };

  // ============================================================
  // i18n 引擎
  // ============================================================
  const i18n = {
    /** 当前语言 */
    currentLang: ZH,

    /** 支持的语言列表 */
    languages: [
      { code: ZH, label: '简体中文' },
      { code: EN, label: 'English' },
    ],

    /**
     * 翻译
     * @param {string} key - 翻译键
     * @param {Object} [params] - 插值参数，如 { count: 5 }
     * @returns {string} 翻译后的文本
     */
    t(key, params) {
      const entry = messages[key];
      if (!entry) {
        console.warn(`[i18n] Missing translation key: ${key}`);
        return key;
      }
      let text = entry[this.currentLang] || entry[ZH] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, v);
        }
      }
      return text;
    },

    /**
     * 获取数组类型的翻译（如随机台词列表）
     * @param {string} key - 翻译键
     * @returns {Array} 当前语言的数组
     */
    tArray(key) {
      const entry = messages[key];
      if (!entry) {
        console.warn(`[i18n] Missing translation key: ${key}`);
        return [];
      }
      return entry[this.currentLang] || entry[ZH] || [];
    },

    /**
     * 切换语言
     * @param {string} lang - 'zh' 或 'en'
     */
    setLang(lang) {
      if (lang !== ZH && lang !== EN) return;
      this.currentLang = lang;
      localStorage.setItem('hippo-lang', lang);
      document.documentElement.lang = lang === ZH ? 'zh-CN' : 'en';
      // 触发重新渲染事件
      window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
    },

    /**
     * 初始化：从 localStorage 恢复语言设置
     */
    init() {
      const saved = localStorage.getItem('hippo-lang');
      if (saved === EN || saved === ZH) {
        this.currentLang = saved;
      }
      document.documentElement.lang = this.currentLang === ZH ? 'zh-CN' : 'en';
    },

    /**
     * 将翻译应用到整个 DOM
     * 扫描所有带有 data-i18n / data-i18n-title / data-i18n-placeholder 属性的元素
     */
    applyToDOM(root) {
      root = root || document;
      // 处理 textContent
      const textEls = root.querySelectorAll('[data-i18n]');
      textEls.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = this.t(key);
      });
      // 处理 title
      const titleEls = root.querySelectorAll('[data-i18n-title]');
      titleEls.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = this.t(key);
      });
      // 处理 placeholder
      const phEls = root.querySelectorAll('[data-i18n-placeholder]');
      phEls.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = this.t(key);
      });
    },
  };

  // 暴露全局
  window.i18n = i18n;

  // 自动初始化
  i18n.init();

})();
