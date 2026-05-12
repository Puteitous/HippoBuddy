package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class FileOperationStateMachine implements Blocker {

    private static final Logger logger = LoggerFactory.getLogger(FileOperationStateMachine.class);

    private final Set<String> trackedNewFiles = ConcurrentHashMap.newKeySet();

    private final List<String> fileTools = List.of(
        "read_file", "write_file", "edit_file", "delete_file"
    );

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!fileTools.contains(toolName)) {
            return HookResult.allow();
        }

        if (!arguments.has("path")) {
            return HookResult.allow();
        }

        String pathStr = Paths.get(arguments.get("path").asText()).normalize().toString();
        Path path = Paths.get(pathStr);

        FileState state = determineState(path, pathStr);

        logger.debug("文件状态机: {} - 工具: {}, 状态: {}", pathStr, toolName, state);

        return routeByState(toolName, pathStr, state);
    }

    private FileState determineState(Path path, String pathStr) {
        if (trackedNewFiles.contains(pathStr)) {
            return FileState.NEWLY_CREATED;
        }

        if (!Files.exists(path)) {
            return FileState.NOT_EXISTS;
        }

        if (Files.isDirectory(path)) {
            return FileState.IS_DIRECTORY;
        }

        return FileState.EXISTS;
    }

    private HookResult routeByState(String toolName, String pathStr, FileState state) {
        switch (toolName) {
            case "write_file":
                return handleWriteFile(pathStr, state);
            case "edit_file":
                return handleEditFile(pathStr, state);
            case "read_file":
                return handleReadFile(pathStr, state);
            case "delete_file":
                return handleDeleteFile(pathStr, state);
            default:
                return HookResult.allow();
        }
    }

    private HookResult handleWriteFile(String pathStr, FileState state) {
        switch (state) {
            case IS_DIRECTORY:
                return HookResult.validationError(
                    String.format("路径是目录，无法写入: %s", pathStr),
                    "请提供文件路径而非目录路径"
                );
            case NOT_EXISTS:
            case NEWLY_CREATED:
                trackedNewFiles.add(pathStr);
                return HookResult.allow();
            case EXISTS:
                return HookResult.allow();
            default:
                return HookResult.allow();
        }
    }

    private HookResult handleEditFile(String pathStr, FileState state) {
        switch (state) {
            case NOT_EXISTS:
            case NEWLY_CREATED:
                return HookResult.validationError(
                    String.format("文件不存在，无法编辑: %s", pathStr),
                    "请先使用 write_file 创建文件"
                );
            case IS_DIRECTORY:
                return HookResult.validationError(
                    String.format("路径是目录，无法编辑: %s", pathStr),
                    "请提供文件路径而非目录路径"
                );
            case EXISTS:
                return HookResult.allow();
            default:
                return HookResult.allow();
        }
    }

    private HookResult handleReadFile(String pathStr, FileState state) {
        switch (state) {
            case NOT_EXISTS:
            case NEWLY_CREATED:
                return HookResult.validationError(
                    String.format("文件不存在，无法读取: %s", pathStr),
                    "请先使用 write_file 或 glob 确认文件路径"
                );
            case IS_DIRECTORY:
                return HookResult.validationError(
                    String.format("路径是目录，无法读取: %s", pathStr),
                    "请使用 list_directory 查看目录内容，或提供文件路径"
                );
            case EXISTS:
                return HookResult.allow();
            default:
                return HookResult.allow();
        }
    }

    private HookResult handleDeleteFile(String pathStr, FileState state) {
        switch (state) {
            case NOT_EXISTS:
            case NEWLY_CREATED:
                return HookResult.validationError(
                    String.format("文件不存在，无法删除: %s", pathStr),
                    "请确认文件路径是否正确"
                );
            case IS_DIRECTORY:
                return HookResult.validationError(
                    String.format("无法删除目录: %s", pathStr),
                    "请使用文件路径而非目录路径"
                );
            case EXISTS:
                trackedNewFiles.remove(pathStr);
                return HookResult.allow();
            default:
                return HookResult.allow();
        }
    }

    public boolean isNewlyCreated(String path) {
        return trackedNewFiles.contains(path);
    }

    public void reset() {
        trackedNewFiles.clear();
    }

    public enum FileState {
        NOT_EXISTS,
        EXISTS,
        IS_DIRECTORY,
        NEWLY_CREATED
    }
}
