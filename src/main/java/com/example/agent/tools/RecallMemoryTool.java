package com.example.agent.tools;

import com.example.agent.memory.MemoryEntry;
import com.example.agent.memory.MemoryStore;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 记忆回忆工具
 * 
 * 根据记忆 ID 获取完整内容
 */
public class RecallMemoryTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(RecallMemoryTool.class);
    private static final int MAX_CONTENT_LENGTH = 2000;

    private final MemoryStore memoryStore;

    public RecallMemoryTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public String getName() {
        return "recall_memory";
    }

    @Override
    public String getDescription() {
        return """
            recall_memory: 根据记忆 ID 获取完整记忆内容。
            返回完整记忆内容（如超过 2000 字符会自动截断）。""";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "The ID of the memory to retrieve "
                    }
                },
                "required": ["id"]
            }""";
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("id") || arguments.get("id").asText().isBlank()) {
            throw new ToolExecutionException("id 参数不能为空");
        }

        String id = arguments.get("id").asText();
        MemoryEntry entry = memoryStore.findById(id);

        if (entry == null) {
            return String.format("Memory not found: %s", id);
        }

        entry.recordAccess();

        String content = entry.getContent();
        boolean truncated = false;

        if (content.length() > MAX_CONTENT_LENGTH) {
            content = safeTruncate(content, MAX_CONTENT_LENGTH);
            truncated = true;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("## Memory: %s\n", extractTitle(content)));
        sb.append(String.format("ID: %s\n", entry.getId()));
        sb.append(String.format("Type: %s\n", entry.getType().getDisplayName()));
        sb.append(String.format("Tags: %s\n", String.join(", ", entry.getTags())));
        sb.append(String.format("Created: %s\n", entry.getCreatedAt()));
        sb.append(String.format("Last Updated: %s\n", entry.getLastUpdated()));
        sb.append("\n---\n\n");
        sb.append(content);

        if (truncated) {
            sb.append("\n\n... [content truncated at ").append(MAX_CONTENT_LENGTH).append(" characters]");
        }

        logger.info("记忆回忆：id={}, truncated={}", id, truncated);
        return sb.toString();
    }

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

    private String safeTruncate(String content, int maxLength) {
        if (content.length() <= maxLength) {
            return content;
        }

        String truncated = content.substring(0, maxLength);

        int lastParagraph = Math.max(
            truncated.lastIndexOf("\n\n"),
            Math.max(truncated.lastIndexOf("\n"), truncated.lastIndexOf(". "))
        );

        if (lastParagraph > maxLength * 0.7) {
            truncated = truncated.substring(0, lastParagraph).trim();
        }

        return truncated;
    }
}
