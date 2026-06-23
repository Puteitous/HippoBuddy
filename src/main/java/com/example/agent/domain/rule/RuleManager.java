package com.example.agent.domain.rule;

import com.example.agent.config.RuleConfig;
import com.example.agent.memory.MemoryStore;
import com.example.agent.service.TokenEstimator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 规则管理器 — 负责加载规则文件并注入到 System Prompt。
 * <p>
 * 规则来源唯一路径：{@code .hippo/rules/*.md}。
 * 规则文件在首次调用 {@link #enhanceSystemPrompt(String)} 时自动加载（懒加载），
 * 不依赖任何入口（CLI / Web / Desktop）显式调用初始化方法。
 * </p>
 */
public class RuleManager {

    private static final Logger logger = LoggerFactory.getLogger(RuleManager.class);
    private static final int MAX_INJECTED_INDEX_ENTRIES = 50;

    private final TokenEstimator tokenEstimator;
    private final RuleConfig config;
    private MemoryStore memoryStore;

    private String rulesContent;
    private int totalTokens;
    private boolean loaded;

    public RuleManager(TokenEstimator tokenEstimator, RuleConfig config) {
        if (tokenEstimator == null) {
            throw new IllegalArgumentException("TokenEstimator cannot be null");
        }
        this.tokenEstimator = tokenEstimator;
        this.config = config != null ? config : new RuleConfig();
        this.rulesContent = "";
        this.totalTokens = 0;
        this.loaded = false;
    }

    public RuleManager(TokenEstimator tokenEstimator) {
        this(tokenEstimator, null);
    }

    public void setMemoryStore(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    /**
     * 确保规则文件已被加载（懒加载）。
     * 仅在第一次调用时扫描 {@code .hippo/rules/} 目录。
     */
    private void ensureLoaded() {
        if (loaded) {
            return;
        }
        rulesContent = RuleLoader.loadCombinedRules();
        loaded = true;
    }

    /**
     * 增强系统提示词：将项目规则 + 长期记忆索引注入到 base prompt 之后。
     * <p>
     * 首次调用时会自动触发规则文件的懒加载。
     * 如果配置中 {@code inject_at_startup = false}，直接返回原始 prompt，不做任何增强。
     * </p>
     *
     * @param baseSystemPrompt 原始系统提示词，可以为 null 或空
     * @return 增强后的系统提示词
     */
    public String enhanceSystemPrompt(String baseSystemPrompt) {
        if (!config.isInjectAtStartup()) {
            logger.debug("RuleManager 注入已禁用");
            return baseSystemPrompt;
        }

        ensureLoaded();

        StringBuilder enhanced = new StringBuilder();
        if (baseSystemPrompt != null && !baseSystemPrompt.isEmpty()) {
            enhanced.append(baseSystemPrompt).append("\n\n");
        }

        if (!rulesContent.isEmpty()) {
            enhanced.append("=== 项目规则 ===\n");
            enhanced.append(rulesContent).append("\n\n");
        }

        // 注入长期记忆索引（会话启动时一次注入）
        if (memoryStore != null) {
            String indexText = memoryStore.getIndexText(MAX_INJECTED_INDEX_ENTRIES);
            if (!indexText.isEmpty()) {
                enhanced.append("## 🧠 Long-term Memories\n");
                enhanced.append("Below is a summary of key information from past sessions. ");
                enhanced.append("Do not repeat this verbatim to the user unless asked.\n");
                enhanced.append("```markdown\n").append(indexText).append("\n```\n\n");
                logger.info("🧠 注入长期记忆索引，共 {} 条", MAX_INJECTED_INDEX_ENTRIES);
            }
        }

        String result = enhanced.toString();
        totalTokens = tokenEstimator.estimateTextTokens(result);
        logger.debug("RuleManager 增强系统提示词，共 {} tokens", totalTokens);
        return result;
    }

    /**
     * 重新加载规则文件（热重载）。
     * 调用后，下一次 {@link #enhanceSystemPrompt(String)} 会重新扫描 {@code .hippo/rules/}。
     */
    public void reload() {
        logger.info("重新加载规则文件...");
        loaded = false;
        ensureLoaded();
    }

    /**
     * 返回增强后的总 token 数。
     */
    public int getTotalTokens() {
        return totalTokens;
    }

}
