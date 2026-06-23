package com.example.agent.domain.rule;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * 规则文件加载器。
 * <p>
 * 从 {@code .hippo/rules/} 目录下扫描所有 {@code *.md} 文件，读取并合并内容。
 * 唯一规则来源，不扫描项目根目录，不支持多文件名变体。
 * </p>
 */
public final class RuleLoader {

    private static final Logger logger = LoggerFactory.getLogger(RuleLoader.class);

    private RuleLoader() {
    }

    /**
     * 扫描并返回 {@code .hippo/rules/} 下所有 {@code *.md} 文件的路径列表。
     * 目录不存在或为空时返回空列表。
     */
    public static List<Path> findAllRuleFiles() {
        List<Path> result = new ArrayList<>();
        Path rulesDir = WorkspaceManager.getUserRulesDir();
        if (!Files.exists(rulesDir)) {
            return result;
        }
        try (Stream<Path> stream = Files.list(rulesDir)) {
            stream.filter(p -> p.getFileName().toString().endsWith(".md"))
                  .sorted()
                  .forEach(result::add);
        } catch (IOException e) {
            logger.warn("扫描规则目录失败: {}", rulesDir, e);
        }
        return result;
    }

    /**
     * 读取所有规则文件并合并为一个字符串。
     * 每个文件内容前附带文件名注释，便于 LLM 识别来源。
     */
    public static String loadCombinedRules() {
        StringBuilder sb = new StringBuilder();
        List<Path> files = findAllRuleFiles();
        for (Path file : files) {
            try {
                sb.append("\n<!-- ").append(file.getFileName()).append(" -->\n");
                sb.append(Files.readString(file)).append("\n");
            } catch (IOException e) {
                logger.warn("读取规则文件失败: {}", file, e);
            }
        }
        if (!files.isEmpty()) {
            logger.info("📋 加载规则文件 {} 个", files.size());
        }
        return sb.toString();
    }

    /**
     * 返回规则文件数量，目录不存在时返回 0。
     */
    public static int countRuleFiles() {
        return findAllRuleFiles().size();
    }
}
