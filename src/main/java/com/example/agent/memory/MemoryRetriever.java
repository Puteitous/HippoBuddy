package com.example.agent.memory;

import com.example.agent.llm.model.Message;
import com.example.agent.domain.rule.HippoRulesParser;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 记忆检索器（文件即记忆设计）
 * 
 * 核心设计：
 * 1. 删除自动向量检索 + 全文注入逻辑
 * 2. 新增 injectPersistentContext()：仅注入持久上下文（偏好和项目约束）
 * 3. 提供 memoize 缓存，基于持久记忆的 lastUpdated 时间戳总和失效
 * 4. 不再自动注入可检索知识，改为提供 recall_memory 工具
 * 5. 移除 EmbeddingService 依赖，文件系统就是存储
 */
public class MemoryRetriever {

    private static final Logger logger = LoggerFactory.getLogger(MemoryRetriever.class);
    private static final int MAX_PERSISTENT_CONTEXTS = 10;
    private static final int MAX_CONTEXT_LENGTH = 2000;

    private static final Set<MemoryEntry.MemoryType> PERSISTENT_TYPES = Set.of(
        MemoryEntry.MemoryType.USER_PREFERENCE,
        MemoryEntry.MemoryType.PROJECT_CONTEXT
    );

    private final MemoryStore memoryStore;
    private final HippoRulesParser rulesParser;
    private final MemoryMetricsCollector metricsCollector;
    private boolean injectionEnabled = true;

    // memoize 缓存
    private volatile String persistentContextCache = null;
    private volatile long persistentContextCache_key = 0L;

    public MemoryRetriever(MemoryStore memoryStore, HippoRulesParser rulesParser) {
        this(memoryStore, rulesParser, null);
    }

    public MemoryRetriever(MemoryStore memoryStore, HippoRulesParser rulesParser, MemoryMetricsCollector metricsCollector) {
        this.memoryStore = memoryStore;
        this.rulesParser = rulesParser;
        this.metricsCollector = metricsCollector;
    }

    public MemoryRetriever(MemoryStore memoryStore) {
        this(memoryStore, new HippoRulesParser(), null);
    }

    /**
     * 准备上下文头部（每轮对话前调用）
     * 
     * 仅注入持久上下文（用户偏好和项目约束），不再自动注入可检索知识
     */
    public List<Message> prepareContextHeader(List<Message> rawMessages) {
        List<Message> enhancedContext = new ArrayList<>();

        if (rawMessages == null) {
            return enhancedContext;
        }

        if (injectionEnabled) {
            String rulesPrompt = rulesParser.getRulesAsSystemPrompt();
            if (!rulesPrompt.isEmpty()) {
                enhancedContext.add(Message.system(rulesPrompt));
            }

            // 注入持久上下文（memoized）
            String persistentContext = injectPersistentContext();
            if (!persistentContext.isEmpty()) {
                enhancedContext.add(Message.system(persistentContext));
            }
        }

        enhancedContext.addAll(rawMessages);

        memoryStore.triggerAutoDream();

        return enhancedContext;
    }

    /**
     * 注入持久上下文（用户偏好和项目约束）
     * 
     * 使用 memoize 缓存，首次调用执行筛选和注入，后续调用返回缓存
     * 缓存 key = 持久记忆数量 + lastUpdated 时间戳总和
     */
    public String injectPersistentContext() {
        long cacheKey = computePersistentContextCacheKey();
        
        if (persistentContextCache != null && persistentContextCache_key == cacheKey) {
            logger.debug("持久上下文缓存命中");
            return persistentContextCache;
        }

        logger.debug("持久上下文缓存未命中，重新计算（cacheKey={}）", cacheKey);
        
        List<MemoryEntry> persistentMemories = memoryStore.getAllMetas().stream()
            .filter(meta -> PERSISTENT_TYPES.contains(meta.getType()))
            .sorted(Comparator.comparing(MemoryStore.MemoryEntryMeta::getLastUpdated).reversed())
            .limit(MAX_PERSISTENT_CONTEXTS)
            .map(meta -> memoryStore.findById(meta.getId()))
            .filter(entry -> entry != null)
            .collect(java.util.stream.Collectors.toList());

        if (persistentMemories.isEmpty()) {
            persistentContextCache = "";
            persistentContextCache_key = cacheKey;
            return "";
        }

        // 构建持久上下文块
        StringBuilder sb = new StringBuilder();
        sb.append("## 持久上下文\n\n");
        sb.append("以下是你的长期记忆，包括用户偏好和项目约束，始终相关。\n\n");

        for (MemoryEntry memory : persistentMemories) {
            String title = extractTitle(memory.getContent());
            String content = truncateContent(memory.getContent(), MAX_CONTEXT_LENGTH);
            
            sb.append(String.format("### %s [%s]\n", title, memory.getType().getDisplayName()));
            sb.append(content).append("\n\n");
        }

        String result = sb.toString();
        persistentContextCache = result;
        persistentContextCache_key = cacheKey;
        
        logger.info("持久上下文注入完成：{} 条记忆，{} 字符", persistentMemories.size(), result.length());
        
        return result;
    }

    /**
     * 计算持久上下文缓存 key
     * 
     * 基于持久记忆数量 + lastUpdated 时间戳总和
     * 任何持久上下文变化都会导致缓存失效
     */
    private long computePersistentContextCacheKey() {
        long key = 0;
        int count = 0;
        
        for (MemoryStore.MemoryEntryMeta meta : memoryStore.getAllMetas()) {
            if (PERSISTENT_TYPES.contains(meta.getType())) {
                key += meta.getLastUpdated().toEpochMilli();
                count++;
            }
        }
        
        return key + count;
    }

    /**
     * 清除持久上下文缓存
     * 
     * 当外部明确知道持久上下文发生变化时调用
     */
    public void clearPersistentContextCache() {
        persistentContextCache = null;
        persistentContextCache_key = 0L;
        logger.debug("持久上下文缓存已清除");
    }

    /**
     * 从内容中提取标题
     */
    private String extractTitle(String content) {
        if (content == null || content.isEmpty()) {
            return "Untitled";
        }
        String[] lines = content.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (line.startsWith("# ")) {
                return line.substring(2).trim();
            }
        }
        return lines[0].trim();
    }

    /**
     * 安全截断内容（在段落或句子边界处截断）
     * 
     * @param content 原始内容
     * @param maxLength 最大长度
     * @return 截断后的内容
     */
    private String truncateContent(String content, int maxLength) {
        if (content == null || content.length() <= maxLength) {
            return content;
        }

        // 先截断到最大长度
        String truncated = content.substring(0, maxLength);
        
        // 尝试在段落边界处截断
        int lastParagraph = Math.max(
            truncated.lastIndexOf("\n\n"),
            Math.max(truncated.lastIndexOf("\n"), truncated.lastIndexOf(". "))
        );
        
        if (lastParagraph > maxLength * 0.7) {
            // 如果边界位置在合理范围内（超过70%），使用边界截断
            truncated = truncated.substring(0, lastParagraph).trim();
        }
        
        return truncated + "... [truncated]";
    }

    public void setInjectionEnabled(boolean enabled) {
        this.injectionEnabled = enabled;
    }

    public void markForMemory(String candidate) {
        if (candidate != null && !candidate.isBlank()) {
            memoryStore.addPendingMemory(candidate);
        }
    }

    public MemoryStore getMemoryStore() {
        return memoryStore;
    }

    public HippoRulesParser getRulesParser() {
        return rulesParser;
    }
}
