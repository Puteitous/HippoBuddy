package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class EditBeforeReadBlocker implements Blocker {

    private final Set<String> readFiles = ConcurrentHashMap.newKeySet();
    private final List<String> editTools = List.of("edit_file", "write_file");

    private FileOperationStateMachine stateMachine;

    private static String normalizePath(String path) {
        return Paths.get(path).normalize().toString();
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if ("read_file".equals(toolName) && arguments.has("path")) {
            readFiles.add(normalizePath(arguments.get("path").asText()));
            return HookResult.allow();
        }

        if (editTools.contains(toolName)) {
            return checkEditOperation(toolName, arguments);
        }

        return HookResult.allow();
    }

    private HookResult checkEditOperation(String toolName, JsonNode arguments) {
        if (!arguments.has("path")) {
            return HookResult.allow();
        }

        String pathStr = normalizePath(arguments.get("path").asText());

        if (stateMachine != null && stateMachine.isNewlyCreated(pathStr)) {
            return HookResult.allow();
        }

        if (!readFiles.contains(pathStr)) {
            return HookResult.warn(
                String.format("建议先读取文件内容: %s", pathStr),
                "如果还未读取过该文件，建议先调用 read_file 获取最新内容"
            );
        }

        return HookResult.allow();
    }

    public void setStateMachine(FileOperationStateMachine stateMachine) {
        this.stateMachine = stateMachine;
    }

    public void reset() {
        readFiles.clear();
    }

    public boolean hasReadFile(String path) {
        return readFiles.contains(path);
    }
}
