package com.example.agent.domain.rule;

import com.example.agent.config.RuleConfig;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.memory.MemoryStore;
import com.example.agent.service.TokenEstimator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

/**
 * 规则管理器 — 负责加载规则文件并注入到 System Prompt。
 * <p>
 * 规则来源（两层，按优先级合并）：
 * <ol>
 *   <li>{@code {workspace}/.hippo/rules/*.md} — 项目级（高优先级）</li>
 *   <li>{@code {HIPPO_ROOT}/rules/*.md} — 用户级全局（低优先级，兜底）</li>
 * </ol>
 * 规则文件在首次调用 {@link #enhanceSystemPrompt(String)} 时自动加载（懒加载），
 * 不依赖任何入口（CLI / Web / Desktop）显式调用初始化方法。
 * </p>
 * <p>
 * 工作区切换时自动失效缓存，下次调用时重新加载对应项目规则。
 * </p>
 */
public class RuleManager {

    private static final Logger logger = LoggerFactory.getLogger(RuleManager.class);
    private static final int MAX_INJECTED_INDEX_ENTRIES = 50;

    private final TokenEstimator tokenEstimator;
    private final RuleConfig config;
    private MemoryStore memoryStore;

    private String projectRulesContent;
    private String userRulesContent;
    private int totalTokens;
    private boolean loaded;
    private String lastWorkspacePath;

    public RuleManager(TokenEstimator tokenEstimator, RuleConfig config) {
        if (tokenEstimator == null) {
            throw new IllegalArgumentException("TokenEstimator cannot be null");
        }
        this.tokenEstimator = tokenEstimator;
        this.config = config != null ? config : new RuleConfig();
        this.projectRulesContent = "";
        this.userRulesContent = "";
        this.totalTokens = 0;
        this.loaded = false;
        this.lastWorkspacePath = null;
    }

    public RuleManager(TokenEstimator tokenEstimator) {
        this(tokenEstimator, null);
    }

    public void setMemoryStore(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    /**
     * 确保规则文件已被加载（懒加载）。
     * <p>
     * 触发条件：
     * <ul>
     *   <li>首次调用 — 加载规则</li>
     *   <li>工作区路径发生变化 — 重新加载（缓存失效）</li>
     *   <li>显式调用 {@link #reload()} — 重新加载</li>
     * </ul>
     * 工作区变化检测通过 {@link WorkspaceContext#getCurrentFolder()} 实现，
     * 如果当前工作区为 null，只加载用户级全局规则。
     * </p>
     */
    private void ensureLoaded() {
        String currentWorkspacePath = WorkspaceContext.getCurrentFolder();

        // 工作区切换时缓存失效
        if (loaded && !Objects.equals(lastWorkspacePath, currentWorkspacePath)) {
            logger.debug("工作区路径变化: '{}' -> '{}'，规则缓存失效",
                    lastWorkspacePath, currentWorkspacePath);
            loaded = false;
        }

        if (loaded) {
            return;
        }

        // 分别加载项目级和用户级规则
        projectRulesContent = RuleLoader.loadProjectRulesContent(currentWorkspacePath);
        userRulesContent = RuleLoader.loadUserRulesContent();

        // 路径去重：如果项目级和用户级指向同一目录，清除用户级内容避免重复
        if (!projectRulesContent.isEmpty() && !userRulesContent.isEmpty()) {
            java.nio.file.Path projectDir = java.nio.file.Paths.get(currentWorkspacePath)
                    .toAbsolutePath().normalize().resolve(".hippo").resolve("rules");
            java.nio.file.Path userDir = com.example.agent.logging.WorkspaceManager.getUserRulesDir()
                    .toAbsolutePath().normalize();
            if (projectDir.equals(userDir)) {
                logger.debug("项目级和用户级规则目录相同，跳过用户级");
                userRulesContent = "";
            }
        }

        lastWorkspacePath = currentWorkspacePath;
        loaded = true;
    }

    /**
     * 增强系统提示词：将项目规则 + 用户全局规则 + 长期记忆索引注入到 base prompt 之后。
     * <p>
     * 首次调用时会自动触发规则文件的懒加载。
     * 后续调用时，如果工作区未变化则使用缓存内容。
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

        if (!projectRulesContent.isEmpty()) {
            enhanced.append("=== 项目规则 ===\n");
            enhanced.append(projectRulesContent).append("\n\n");
        }
        if (!userRulesContent.isEmpty()) {
            enhanced.append("=== 全局规则 ===\n");
            enhanced.append(userRulesContent).append("\n\n");
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
     * 调用后，下一次 {@link #enhanceSystemPrompt(String)} 会重新扫描所有规则目录。
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
