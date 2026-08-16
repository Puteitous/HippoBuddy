package com.example.agent.desktop;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class WorkspaceContext {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceContext.class);

    private static volatile String currentFolder;

    private WorkspaceContext() {
    }

    public static String getCurrentFolder() {
        return currentFolder;
    }

    public static void setCurrentFolder(String path) {
        String oldFolder = currentFolder;
        currentFolder = path;
        // 监控：切换工作区是全局状态变更的唯一入口（HTTP API / 桌面桥 / CLI 均汇聚于此）。
        // 注意：已有会话的 system prompt 在创建时已固化工作区路径快照，切换不会改变它们，
        // 只有新建会话才会拼入新路径。
        logger.info("工作区切换: {} -> {}", oldFolder != null ? oldFolder : "(null)", path);
    }

    public static void clear() {
        // 重置为默认工作区，确保 currentFolder 永不为 null
        currentFolder = WorkspaceManager.getDefaultWorkspaceDir().toString();
        logger.debug("工作区已重置为默认: {}", currentFolder);
    }

    public static void save() {
        try {
            Path file = getConfigPath();
            Files.createDirectories(file.getParent());
            Files.writeString(file, currentFolder);
            logger.debug("工作区配置已保存: {}", currentFolder);
        } catch (IOException e) {
            logger.warn("保存工作区配置失败", e);
        }
    }

    public static void load() {
        try {
            Path file = getConfigPath();
            if (Files.exists(file)) {
                String path = Files.readString(file).trim();
                if (!path.isBlank()) {
                    currentFolder = path;
                    logger.info("工作区配置已恢复: {}", currentFolder);
                    return;
                }
            }
        } catch (IOException e) {
            logger.warn("加载工作区配置失败", e);
        }
        // 无已保存的工作区 → 使用默认工作区并持久化
        currentFolder = WorkspaceManager.getDefaultWorkspaceDir().toString();
        save();
        logger.info("使用默认工作区: {}", currentFolder);
    }

    /**
     * 判断当前是否处于默认工作区（用户未主动选择工作区）。
     */
    public static boolean isDefaultWorkspace() {
        if (currentFolder == null) return false;
        Path defaultDir = WorkspaceManager.getDefaultWorkspaceDir();
        return defaultDir.equals(Paths.get(currentFolder).toAbsolutePath().normalize());
    }

    /**
     * 返回注入到 System Prompt 的运行环境描述。
     * <p>
     * 让 LLM 明确知道当前平台和 shell 类型，避免它按训练语料里占多数的
     * Unix 语法生成 bash 命令。具体的语法映射（dir/type/findstr 代替
     * ls/cat/grep）由 bash 工具自身的 description 承担，这里只告知环境事实。
     */
    public static String getEnvironmentPromptSnippet() {
        String os = System.getProperty("os.name", "unknown");
        String arch = System.getProperty("os.arch", "");
        boolean windows = os.toLowerCase().contains("win");
        String shell = windows ? "cmd" : "bash";
        String archPart = arch.isBlank() ? "" : " (" + arch + ")";
        return "\n\n## 运行环境\n操作系统: " + os + archPart + "\nbash 命令执行环境: " + shell;
    }

    private static Path getConfigPath() {
        return WorkspaceManager.getGlobalConfigDir().resolve("workspace.txt");
    }
}
