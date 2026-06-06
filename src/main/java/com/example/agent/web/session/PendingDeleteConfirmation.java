package com.example.agent.web.session;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * delete_file 工具的待确认数据。
 * 独立于 PendingBashConfirmation，因为语义完全不同：
 * - bash: 存的是命令文本，确认后可能还有剩余工具队列
 * - delete_file: 存的是文件路径列表，确认后直接执行删除
 */
public class PendingDeleteConfirmation {
    public final String confirmId;
    public final String toolCallId;
    public final String toolName;
    public final JsonNode arguments;
    public final String[] filePaths;
    public final int totalFileCount;
    public final long createdAt;

    public PendingDeleteConfirmation(String confirmId, String toolCallId, String toolName,
                                      JsonNode arguments, String[] filePaths, int totalFileCount) {
        this.confirmId = confirmId;
        this.toolCallId = toolCallId;
        this.toolName = toolName;
        this.arguments = arguments;
        this.filePaths = filePaths;
        this.totalFileCount = totalFileCount;
        this.createdAt = System.currentTimeMillis();
    }

    public boolean isExpired(long timeoutMs) {
        return System.currentTimeMillis() - createdAt > timeoutMs;
    }
}
