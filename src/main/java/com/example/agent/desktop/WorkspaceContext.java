package com.example.agent.desktop;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class WorkspaceContext {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceContext.class);

    private static volatile String currentFolder;

    private WorkspaceContext() {
    }

    public static String getCurrentFolder() {
        return currentFolder;
    }

    public static void setCurrentFolder(String path) {
        currentFolder = path;
    }

    public static void clear() {
        currentFolder = null;
    }

    public static void save() {
        try {
            Path file = getConfigPath();
            Files.createDirectories(file.getParent());
            if (currentFolder != null && !currentFolder.isBlank()) {
                Files.writeString(file, currentFolder);
                logger.debug("工作区配置已保存: {}", currentFolder);
            } else {
                Files.deleteIfExists(file);
                logger.debug("工作区配置已清除");
            }
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
        currentFolder = null;
    }

    private static Path getConfigPath() {
        return WorkspaceManager.getGlobalConfigDir().resolve("workspace.txt");
    }
}
