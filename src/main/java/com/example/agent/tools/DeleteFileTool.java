package com.example.agent.tools;

import com.example.agent.snapshot.FileSnapshotManager;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DeleteFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(DeleteFileTool.class);

    /** 受保护的目录名（即使 glob 匹配到也跳过） */
    private static final Set<String> PROTECTED_DIR_NAMES = Set.of(
        ".git", ".svn", ".hg", "node_modules", ".idea", ".gradle", "target", "build", "dist",
        ".hippo"
    );

    /** 受保护的文件扩展名（blockedExtensions 的补充，执行时硬拦截） */
    private static final Set<String> PROTECTED_EXTENSIONS = Set.of(
        ".env", ".pem", ".key", ".p12", ".jks", ".keystore"
    );

    /** 受保护的文件全名 */
    private static final Set<String> PROTECTED_FILE_NAMES = Set.of(
        ".gitignore", ".gitattributes", ".env.example"
    );

    /** 单次删除操作的最大文件数，超过直接拒绝 */
    private static final int MAX_DELETE_COUNT = 50;

    public DeleteFileTool() {
    }

    @Override
    public String getName() {
        return "delete_file";
    }

    @Override
    public String getDescription() {
        return "删除一个或多个文件或目录（不接收 glob 通配符，请使用精确路径）。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "要删除的文件或目录路径列表（不接收 glob 通配符）。传目录时会递归删除目录下所有文件"
                    }
                },
                "required": ["paths"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        List<String> paths = new ArrayList<>();
        if (arguments.has("paths") && arguments.get("paths").isArray()) {
            arguments.get("paths").forEach(p -> paths.add(p.asText()));
        }
        return paths;
    }

    @Override
    public boolean requiresFileLock() {
        return true;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("paths") || !arguments.get("paths").isArray()) {
            throw new ToolExecutionException("缺少必需参数: paths");
        }

        JsonNode pathsNode = arguments.get("paths");
        if (pathsNode.size() == 0) {
            throw new ToolExecutionException("paths 不能为空数组");
        }

        // Phase 1: 展开所有路径（目录递归）
        List<Path> allFiles = new ArrayList<>();
        List<String> rawPaths = new ArrayList<>();
        for (JsonNode p : pathsNode) {
            rawPaths.add(p.asText());
        }

        // 如果只有一个路径且是目录，在确认阶段展示目录名
        // 但在执行阶段展开为具体文件
        List<String> skippedProtected = new ArrayList<>();
        List<String> notFound = new ArrayList<>();

        for (String raw : rawPaths) {
            try {
                expandPath(raw, allFiles, skippedProtected, notFound);
            } catch (ToolExecutionException e) {
                // 路径安全校验失败（如试图删除项目外）
                throw e;
            }
        }

        if (allFiles.isEmpty()) {
            StringBuilder msg = new StringBuilder("没有文件需要删除。");
            if (!notFound.isEmpty()) {
                msg.append("\n不存在的路径（已跳过）：").append(String.join(", ", notFound));
            }
            if (!skippedProtected.isEmpty()) {
                msg.append("\n受保护的文件（已跳过）：").append(String.join(", ", skippedProtected));
            }
            return msg.toString();
        }

        // Phase 2: 去重
        allFiles = allFiles.stream().distinct().collect(Collectors.toList());

        // Phase 2.5: 检查批量删除数量限制（超过阈值直接拒绝，不给确认窗）
        if (allFiles.size() > MAX_DELETE_COUNT) {
            throw new ToolExecutionException(
                "安全限制: 单次删除操作最多允许 " + MAX_DELETE_COUNT + " 个文件（当前 " + allFiles.size() + " 个）。" +
                "请缩小删除范围，或分多次执行。"
            );
        }

        // Phase 3: 执行删除（先 track 再删，确保快照记录的是删除前的内容）
        List<String> deleted = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        for (Path file : allFiles) {
            try {
                // 先读原内容用于变更追踪
                String originalContent = "";
                byte[] originalBytes = null;
                if (Files.exists(file) && Files.isRegularFile(file)) {
                    try {
                        originalContent = Files.readString(file, StandardCharsets.UTF_8);
                    } catch (java.nio.charset.MalformedInputException e) {
                        // 非 UTF-8 文件（如 GBK），用 ISO_8859_1 无损读取所有字节，
                        // 同时保留原始字节用于精确回滚
                        originalBytes = Files.readAllBytes(file);
                        originalContent = new String(originalBytes, StandardCharsets.ISO_8859_1);
                        logger.debug("非 UTF-8 文件，使用 ISO_8859_1 编码读取: {}", file);
                    }
                }

                // 记录到变更追踪（以便单文件回滚）
                FileChangeTracker.recordChange(
                    file.toAbsolutePath().toString(),
                    originalContent,
                    originalBytes,
                    "",
                    "delete_file",
                    false
                );

                // 记录到快照追踪（以便会话级回滚）
                FileSnapshotManager.trackCurrentSessionFile(
                    file.toAbsolutePath().toString(),
                    false
                );

                // 执行删除
                Files.deleteIfExists(file);

                deleted.add(PathSecurityUtils.getRelativePath(file));
                logger.debug("已删除文件: {}", file);
            } catch (IOException e) {
                logger.warn("删除文件失败: {}", file, e);
                failed.add(PathSecurityUtils.getRelativePath(file) + " (" + e.getMessage() + ")");
            }
        }

        // Phase 4: 尝试删除空目录（如果原始路径是目录）
        for (String raw : rawPaths) {
            try {
                Path p = PathSecurityUtils.validateAndResolve(raw);
                if (Files.isDirectory(p)) {
                    try (Stream<Path> entries = Files.list(p)) {
                        if (entries.findAny().isEmpty()) {
                            Files.deleteIfExists(p);
                            logger.debug("已删除空目录: {}", p);
                        }
                    }
                }
            } catch (Exception e) {
                // 目录清理失败不阻塞主流程
                logger.debug("清理目录失败（可忽略）: {}", raw, e);
            }
        }

        // Phase 5: 格式化结果
        return formatResult(deleted, failed, skippedProtected, notFound);
    }

    // ====== 路径展开 ======

    /**
     * 展开一个原始路径（目录 / 普通文件），将结果加入 allFiles。
     *
     * 注意：* 和 ? 通配符被明确拒绝，必须使用精确路径。
     * Windows 上 Path.of("*") 会抛出 InvalidPathException，此处提前拦截。
     */
    private void expandPath(String raw, List<Path> allFiles,
                            List<String> skippedProtected, List<String> notFound)
            throws ToolExecutionException {

        // 拒绝通配符：delete_file 不接收 glob，LLM 应先 bash ls 再传精确路径
        if (raw.contains("*") || raw.contains("?")) {
            throw new ToolExecutionException(
                "安全限制: delete_file 不支持 glob 通配符（" + raw + "），请使用精确文件路径。" +
                "如需批量删除，请先用 bash ls/tree 列出文件后再指定精确路径。"
            );
        }

        Path resolved = PathSecurityUtils.validateAndResolve(raw);
        String rawFileName = resolved.getFileName() != null ? resolved.getFileName().toString() : "";

        // 禁止删除项目根目录（防止 "." 或 ".." 或显式传根目录路径误删整个项目）
        if (resolved.equals(PathSecurityUtils.getProjectRoot())) {
            throw new ToolExecutionException("安全限制: 禁止删除项目根目录");
        }

        // 检查是否直接匹配保护文件
        if (isProtectedFileName(rawFileName) || isProtectedExtension(rawFileName)) {
            skippedProtected.add(PathSecurityUtils.getRelativePath(resolved));
            return;
        }

        // 检查是否在受保护目录内
        if (isUnderProtectedDir(resolved)) {
            skippedProtected.add(PathSecurityUtils.getRelativePath(resolved));
            return;
        }

        if (!Files.exists(resolved)) {
            // 普通路径但不存在
            notFound.add(raw);
            return;
        }

        if (Files.isDirectory(resolved)) {
            // 递归展开目录下所有文件
            expandDirectory(resolved, allFiles, skippedProtected);
        } else {
            allFiles.add(resolved);
        }
    }

    /**
     * 递归展开目录。
     */
    private void expandDirectory(Path directory, List<Path> allFiles,
                                 List<String> skippedProtected) throws ToolExecutionException {
        // 兜底保护：禁止递归删除项目根目录
        if (directory.equals(PathSecurityUtils.getProjectRoot())) {
            throw new ToolExecutionException("安全限制: 禁止递归删除项目根目录");
        }
        try (Stream<Path> walk = Files.walk(directory, Integer.MAX_VALUE)) {
            walkAndFilterFiles(walk, allFiles, skippedProtected);
        } catch (IOException e) {
            logger.warn("目录展开失败: {}", directory, e);
        }
    }

    /**
     * walk 文件流，过滤出常规文件后执行保护文件检查并分类收集。
     *
     * @param walk             文件流
     * @param allFiles         收集到的可删除文件
     * @param skippedProtected 因保护规则跳过的文件
     */
    private void walkAndFilterFiles(Stream<Path> walk,
                                    List<Path> allFiles, List<String> skippedProtected) {
        Stream<Path> stream = walk.filter(Files::isRegularFile);
        stream.forEach(p -> {
            String fileName = p.getFileName() != null ? p.getFileName().toString() : "";
            if (isProtectedFileName(fileName) || isProtectedExtension(fileName)) {
                skippedProtected.add(PathSecurityUtils.getRelativePath(p));
            } else if (!isUnderProtectedDir(p) && PathSecurityUtils.isWithinAllowedPath(p)) {
                allFiles.add(p);
            } else {
                skippedProtected.add(PathSecurityUtils.getRelativePath(p));
            }
        });
    }

    // ====== 保护文件检查 ======

    /** 检查文件名是否在保护名单中 */
    private boolean isProtectedFileName(String fileName) {
        return PROTECTED_FILE_NAMES.contains(fileName);
    }

    /** 检查扩展名是否在保护名单中 */
    private boolean isProtectedExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) return false;
        return PROTECTED_EXTENSIONS.contains(fileName.substring(dot).toLowerCase());
    }

    /** 检查路径是否在受保护目录下（如 .git, node_modules） */
    private boolean isUnderProtectedDir(Path path) {
        for (Path component : path) {
            String name = component.toString();
            if (PROTECTED_DIR_NAMES.contains(name)) {
                return true;
            }
        }
        return false;
    }

    // ====== 工具方法 ======

    private String formatResult(List<String> deleted, List<String> failed,
                                List<String> skippedProtected, List<String> notFound) {
        StringBuilder sb = new StringBuilder();

        if (deleted.size() == 1) {
            sb.append("已删除文件: ").append(deleted.get(0)).append("\n");
        } else if (deleted.size() > 1) {
            sb.append("已删除 ").append(deleted.size()).append(" 个文件:\n");
            for (String f : deleted) {
                sb.append("  - ").append(f).append("\n");
            }
        }

        if (!failed.isEmpty()) {
            sb.append("\n删除失败 ").append(failed.size()).append(" 个:\n");
            for (String f : failed) {
                sb.append("  - ").append(f).append("\n");
            }
        }

        if (!skippedProtected.isEmpty()) {
            sb.append("\n已跳过受保护文件 ").append(skippedProtected.size()).append(" 个:\n");
            for (String f : skippedProtected) {
                sb.append("  - ").append(f).append("\n");
            }
        }

        if (!notFound.isEmpty()) {
            sb.append("\n路径不存在（已跳过）:\n");
            for (String f : notFound) {
                sb.append("  - ").append(f).append("\n");
            }
        }

        String result = sb.toString().trim();
        return result.isEmpty() ? "没有文件需要删除。" : result;
    }

    // ====== 供外部调用的预览方法 ======

    /**
     * 预览删除操作将影响哪些文件（展开目录，但不执行删除）。
     * 供 WebAgentOrchestrator 在确认弹窗前调用。
     *
     * @return PreviewResult，包含文件列表和保护文件信息
     */
    public static PreviewResult preview(JsonNode arguments) {
        List<String> allFiles = new ArrayList<>();
        List<String> skippedProtected = new ArrayList<>();
        List<String> notFound = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        if (!arguments.has("paths") || !arguments.get("paths").isArray()) {
            return new PreviewResult(List.of(), List.of(), List.of(), List.of("缺少必需参数: paths"));
        }

        // 临时创建一个实例用于调用非静态方法
        DeleteFileTool instance = new DeleteFileTool();

        for (JsonNode p : arguments.get("paths")) {
            String raw = p.asText();
            try {
                List<Path> files = new ArrayList<>();
                instance.expandPath(raw, files, skippedProtected, notFound);
                for (Path f : files) {
                    allFiles.add(PathSecurityUtils.getRelativePath(f));
                }
            } catch (ToolExecutionException e) {
                errors.add(raw + ": " + e.getMessage());
            }
        }

        return new PreviewResult(allFiles, skippedProtected, notFound, errors);
    }

    /**
     * 预览结果。
     */
    public static class PreviewResult {
        private final List<String> files;
        private final List<String> skippedProtected;
        private final List<String> notFound;
        private final List<String> errors;

        PreviewResult(List<String> files, List<String> skippedProtected,
                      List<String> notFound, List<String> errors) {
            this.files = Collections.unmodifiableList(files);
            this.skippedProtected = Collections.unmodifiableList(skippedProtected);
            this.notFound = Collections.unmodifiableList(notFound);
            this.errors = Collections.unmodifiableList(errors);
        }

        public List<String> getFiles() { return files; }
        public List<String> getSkippedProtected() { return skippedProtected; }
        public List<String> getNotFound() { return notFound; }
        public List<String> getErrors() { return errors; }

        public boolean hasProtectedFiles() { return !skippedProtected.isEmpty(); }
        public boolean hasErrors() { return !errors.isEmpty(); }
        public int totalCount() { return files.size(); }
    }
}
