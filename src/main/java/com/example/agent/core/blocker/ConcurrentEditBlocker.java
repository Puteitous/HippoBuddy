package com.example.agent.core.blocker;

import com.example.agent.tools.concurrent.FileLockManager;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

public class ConcurrentEditBlocker implements Blocker {

    private final FileLockManager lockManager = FileLockManager.getInstance();
    private final List<String> writeTools = List.of("edit_file", "write_file", "delete_file");

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!writeTools.contains(toolName)) {
            return HookResult.allow();
        }

        List<String> paths = extractPaths(arguments);
        if (paths.isEmpty()) {
            return HookResult.allow();
        }

        for (String path : paths) {
            if (lockManager.isLocked(path)) {
                return HookResult.validationError(
                    String.format("文件正在被其他操作编辑: %s", path),
                    "等待当前编辑完成后再操作，或使用不同的文件"
                );
            }
        }

        return HookResult.allow();
    }

    /**
     * 从工具参数中提取受影响路径。
     * edit_file / write_file 使用单个 path；delete_file 使用 paths 数组。
     */
    private List<String> extractPaths(JsonNode arguments) {
        List<String> paths = new ArrayList<>();
        if (arguments.has("path") && arguments.get("path").isTextual()) {
            paths.add(arguments.get("path").asText());
        }
        if (arguments.has("paths") && arguments.get("paths").isArray()) {
            arguments.get("paths").forEach(p -> paths.add(p.asText()));
        }
        return paths;
    }
}
