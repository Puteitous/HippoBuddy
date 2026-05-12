package com.example.agent.core.blocker;

import com.example.agent.tools.concurrent.FileLockManager;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public class ConcurrentEditBlocker implements Blocker {

    private final FileLockManager lockManager = FileLockManager.getInstance();
    private final List<String> writeTools = List.of("edit_file", "write_file", "delete_file");

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!writeTools.contains(toolName)) {
            return HookResult.allow();
        }

        if (!arguments.has("path")) {
            return HookResult.allow();
        }

        String path = arguments.get("path").asText();

        if (lockManager.isLocked(path)) {
            return HookResult.validationError(
                String.format("文件正在被其他操作编辑: %s", path),
                "等待当前编辑完成后再操作，或使用不同的文件"
            );
        }

        return HookResult.allow();
    }
}
