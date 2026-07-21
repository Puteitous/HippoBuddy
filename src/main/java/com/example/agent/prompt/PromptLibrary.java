package com.example.agent.prompt;

import com.example.agent.prompt.loader.ClasspathPromptLoader;
import com.example.agent.prompt.loader.PromptLoader;
import com.example.agent.prompt.model.Prompt;
import com.example.agent.prompt.model.PromptType;
import com.example.agent.prompt.model.TaskMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

public class PromptLibrary {

    private static final Logger logger = LoggerFactory.getLogger(PromptLibrary.class);

    private static PromptLibrary instance;

    private final Map<PromptType, Prompt> promptCache;
    private final PromptLoader loader;
    private final AtomicBoolean initialized = new AtomicBoolean(false);

    private PromptLibrary() {
        this.promptCache = new ConcurrentHashMap<>();
        this.loader = new ClasspathPromptLoader();
    }

    public static PromptLibrary getInstance() {
        if (instance == null) {
            synchronized (PromptLibrary.class) {
                if (instance == null) {
                    instance = new PromptLibrary();
                }
            }
        }
        return instance;
    }

    public void initialize() {
        if (initialized.compareAndSet(false, true)) {
            logger.info("Initializing Prompt Library...");
            List<Prompt> prompts = loader.loadAll();
            for (Prompt prompt : prompts) {
                if (prompt.isEnabled()) {
                    promptCache.put(prompt.getType(), prompt);
                }
            }
            logger.info("Prompt Library initialized: {} prompts loaded", promptCache.size());
        }
    }

    /**
     * 构建完整的系统提示词。
     * 拼接规则：
     * 1. 核心层（CORE_*）— 始终注入
     * 2. 模式层（MODE_*）— 根据 context.mode() 匹配注入
     * 3. 功能层（FEATURE_*）— 根据 enabled 状态注入
     * 同层按 priority 降序排列
     */
    public String buildSystemPrompt(PromptService.TaskContext context) {
        List<Prompt> prompts = promptCache.values().stream()
                .filter(p -> p.isEnabled() && p.getContent() != null && !p.getContent().isEmpty())
                .filter(p -> matchesMode(p, context))
                .sorted(Comparator.comparingInt(Prompt::getPriority).reversed())
                .toList();

        if (prompts.isEmpty()) {
            logger.warn("No matching prompts found, using fallback");
            return getFallbackPrompt();
        }

        // 确保至少有一个 mode 层提示词，如果没有匹配到则兜底加载 MODE_CODING
        List<Prompt> finalPrompts = new ArrayList<>(prompts);
        boolean hasMode = finalPrompts.stream().anyMatch(p -> p.getType().isMode());
        if (!hasMode) {
            Prompt defaultMode = promptCache.get(PromptType.MODE_CODING);
            if (defaultMode != null && defaultMode.isEnabled()) {
                finalPrompts.add(defaultMode);
                logger.debug("No mode prompt matched for context, fallback to MODE_CODING");
            }
        }

        StringBuilder sb = new StringBuilder(4096);
        for (int i = 0; i < finalPrompts.size(); i++) {
            if (i > 0) sb.append('\n').append('\n');
            sb.append(finalPrompts.get(i).getContent());
        }
        return sb.toString();
    }

    /**
     * 获取某个模式的核心+模式层提示词（不含功能层）。
     * 用于模式切换时保留上下文的场景。
     */
    public String getModePrompt(TaskMode mode) {
        List<Prompt> prompts = promptCache.values().stream()
                .filter(p -> p.isEnabled() && p.getContent() != null && !p.getContent().isEmpty())
                .filter(p -> p.getType().isCore() || (p.getType().isMode() && matchesModeType(p.getType(), mode)))
                .sorted(Comparator.comparingInt(Prompt::getPriority).reversed())
                .toList();

        if (prompts.isEmpty()) {
            logger.warn("No mode prompts found for {}, using fallback", mode);
            return getFallbackPrompt();
        }

        StringBuilder sb = new StringBuilder(4096);
        for (int i = 0; i < prompts.size(); i++) {
            if (i > 0) sb.append('\n').append('\n');
            sb.append(prompts.get(i).getContent());
        }
        return sb.toString();
    }

    /**
     * 兼容旧版 getBasePrompt — 返回 core + mode 的组合提示词
     */
    public String getBasePrompt(TaskMode mode) {
        return getModePrompt(mode != null ? mode : TaskMode.CODING);
    }

    public Optional<Prompt> getPrompt(PromptType type) {
        return Optional.ofNullable(promptCache.get(type));
    }

    public String getFallbackPrompt() {
        return "你是一个专业的编程助手，可以协助用户进行软件开发任务。\n始终使用与用户消息相同的语言回复，保持专业且有帮助的态度。";
    }

    public void reload() {
        initialized.set(false);
        promptCache.clear();
        initialize();
    }

    public Collection<Prompt> getAllPrompts() {
        return promptCache.values();
    }

    public Collection<Prompt> getCorePrompts() {
        return promptCache.values().stream()
                .filter(p -> p.isEnabled() && p.getType().isCore())
                .collect(Collectors.toList());
    }

    public Collection<Prompt> getModePrompts() {
        return promptCache.values().stream()
                .filter(p -> p.isEnabled() && p.getType().isMode())
                .collect(Collectors.toList());
    }

    public Collection<Prompt> getFeaturePrompts() {
        return promptCache.values().stream()
                .filter(p -> p.isEnabled() && p.getType().isFeature())
                .collect(Collectors.toList());
    }

    // ========== 内部辅助 ==========

    private boolean matchesMode(Prompt prompt, PromptService.TaskContext context) {
        PromptType type = prompt.getType();
        if (type.isCore() || type.isFeature()) return true;
        if (type.isMode()) return matchesModeType(type, context.mode());
        return false;
    }

    private boolean matchesModeType(PromptType type, TaskMode mode) {
        if (mode == null) mode = TaskMode.CODING;
        return switch (type) {
            case MODE_CODING -> mode == TaskMode.CODING;
            case MODE_CHAT -> mode == TaskMode.CHAT;
            case MODE_OFFICE -> mode == TaskMode.OFFICE;
            default -> false;
        };
    }
}
