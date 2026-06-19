package com.example.agent.prompt.model;

public enum PromptType {

    // ========== 旧版（保留向后兼容，逐渐废弃） ==========
    BASE_CODING("base", "coding", "基础编程助手"),
    BASE_RESEARCH("base", "research", "代码研究模式"),
    BASE_CHAT("base", "chat", "聊天对话模式"),

    // ========== 核心层（始终注入） ==========
    CORE_ROLE("core", "role", "角色定义 + 自主决策原则"),

    // ========== 模式层 ==========
    MODE_CODING("mode", "coding", "构建模式 - 工程师角色，全权限执行"),
    MODE_CHAT("mode", "chat", "顾问模式 - 只读探索"),

    // ========== 功能层 ==========
    FEATURE_MEMORY("feature", "memory", "长期记忆系统指南"),

    // ========== 任务/专家/工具层（预留） ==========
    TASK_REFACTOR("task", "refactor", "代码重构专家"),
    TASK_DEBUG("task", "debug", "调试专家"),
    TASK_CODEGEN("task", "codegen", "代码生成专家"),
    TASK_REVIEW("task", "review", "代码审查专家"),
    TASK_ARCHITECTURE("task", "architecture", "架构设计专家"),

    EXPERT_JAVA("expert", "java", "Java 语言专家"),
    EXPERT_SPRING("expert", "spring", "Spring 框架专家"),
    EXPERT_TESTING("expert", "testing", "测试专家"),
    EXPERT_PERFORMANCE("expert", "performance", "性能优化专家"),

    TOOL_EDIT_GUIDE("tool", "edit", "文件编辑指南"),
    TOOL_BASH_GUIDE("tool", "bash", "命令执行指南");

    private final String category;
    private final String key;
    private final String displayName;

    PromptType(String category, String key, String displayName) {
        this.category = category;
        this.key = key;
        this.displayName = displayName;
    }

    public String getCategory() {
        return category;
    }

    public String getKey() {
        return key;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isBase() {
        return "base".equals(category);
    }

    public boolean isCore() {
        return "core".equals(category);
    }

    public boolean isMode() {
        return "mode".equals(category);
    }

    public boolean isFeature() {
        return "feature".equals(category);
    }

    public boolean isTask() {
        return "task".equals(category);
    }

    public boolean isExpert() {
        return "expert".equals(category);
    }

    public boolean isTool() {
        return "tool".equals(category);
    }
}
