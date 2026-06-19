package com.example.agent.config;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public class UserResourceManager {
    
    private static final Logger logger = LoggerFactory.getLogger(UserResourceManager.class);
    
    private static final String[] RULE_FILE_NAMES = {
        ".hipporules",
        "HIPPO.md",
        "hippo.md"
    };
    
    private static final String[] MEMORY_FILE_NAMES = {
        "MEMORY.md",
        "memory.md",
        "PROJECT_CONTEXT.md"
    };
    
    private UserResourceManager() {}
    
    public static void initialize() {
        try {
            Files.createDirectories(WorkspaceManager.getUserRulesDir());
            Files.createDirectories(WorkspaceManager.getUserMemoryDir());
            Files.createDirectories(WorkspaceManager.getUserSkillsDir());
            logger.debug("用户资源目录初始化完成");
        } catch (IOException e) {
            logger.warn("初始化用户资源目录失败: {}", e.getMessage());
        }
    }
    
    public static List<Path> findAllRuleFiles() {
        List<Path> result = new ArrayList<>();
        Path projectDir = Paths.get(WorkspaceManager.getCurrentWorkingDir());
        
        for (String name : RULE_FILE_NAMES) {
            Path file = projectDir.resolve(name);
            if (Files.exists(file)) {
                result.add(file);
                logger.info("📋 加载项目级规则: {}", name);
            }
        }
        
        loadDirectoryRules(WorkspaceManager.getUserRulesDir(), result);
        
        return result;
    }
    
    public static List<Path> findAllMemoryFiles() {
        List<Path> result = new ArrayList<>();
        Path projectDir = Paths.get(WorkspaceManager.getCurrentWorkingDir());
        Path projectMemoryDir = WorkspaceManager.getHippoRoot().resolve("memory");
        
        for (String name : MEMORY_FILE_NAMES) {
            Path file = projectDir.resolve(name);
            if (Files.exists(file)) {
                result.add(file);
                logger.info("🧠 加载项目级记忆: {}", name);
            }
        }
        
        try {
            Files.createDirectories(projectMemoryDir);
            loadDirectoryRules(projectMemoryDir, result);
        } catch (IOException e) {
            logger.debug("创建项目记忆目录失败");
        }
        
        loadDirectoryRules(WorkspaceManager.getUserMemoryDir(), result);
        
        return result;
    }
    
    private static void loadDirectoryRules(Path dir, List<Path> result) {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> stream = Files.list(dir)) {
            stream.filter(p -> p.getFileName().toString().endsWith(".md"))
                  .forEach(p -> {
                      result.add(p);
                      logger.debug("加载资源文件: {}", p.getFileName());
                  });
        } catch (IOException e) {
            logger.debug("扫描目录失败: {}", dir, e);
        }
    }
    
    public static String loadCombinedRules() {
        StringBuilder sb = new StringBuilder();
        for (Path file : findAllRuleFiles()) {
            try {
                sb.append("\n<!-- 来自: ").append(file.getFileName()).append(" -->\n");
                sb.append(Files.readString(file)).append("\n");
            } catch (IOException e) {
                logger.warn("加载规则文件失败: {}", file, e);
            }
        }
        return sb.toString();
    }
    
    public static String loadCombinedMemory() {
        StringBuilder sb = new StringBuilder();
        for (Path file : findAllMemoryFiles()) {
            try {
                sb.append("\n--- 记忆来源: ").append(file.getFileName()).append(" ---\n");
                sb.append(Files.readString(file)).append("\n");
            } catch (IOException e) {
                logger.warn("加载记忆文件失败: {}", file, e);
            }
        }
        return sb.toString();
    }
    
    public static Path getProjectRulesDir() {
        return Paths.get(WorkspaceManager.getCurrentWorkingDir());
    }
    
    public static Path getGlobalRulesDir() {
        return WorkspaceManager.getUserRulesDir();
    }
    
    public static Path getSessionMemoryFile(String sessionId) {
        return WorkspaceManager.getHippoRoot()
            .resolve("memory")
            .resolve("session_" + sessionId + ".md");
    }
}