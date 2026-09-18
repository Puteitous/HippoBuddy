package com.example.agent.web.handler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 压缩包（zip）解包与技能目录落盘的共享工具。
 * <p>
 * 供 {@link PluginPackageInstallHandler}（标准插件包安装）与
 * {@link SkillsApiHandler}（用户自助导入技能）共用，避免护栏逻辑重复实现。
 * 所有解包入口都严格防路径穿越与 zip 炸弹。
 * </p>
 */
final class ZipPackageUtils {

    private static final Logger logger = LoggerFactory.getLogger(ZipPackageUtils.class);

    /** 解包文件数上限 */
    static final int MAX_ENTRIES = 200;
    /** 解包总量上限 100MB(防 zip 炸弹) */
    static final long MAX_TOTAL_BYTES = 100L * 1024 * 1024;
    /** 单个文件大小上限 5MB */
    static final long MAX_FILE_BYTES = 5L * 1024 * 1024;
    /** 单个技能目录落盘总量上限 20MB */
    static final long MAX_SKILL_DIR_BYTES = 20L * 1024 * 1024;

    private ZipPackageUtils() {
    }

    /**
     * 解压 zip 到目标目录，严格防路径穿越，并施加文件数 / 单文件 / 总量上限。
     *
     * @throws IllegalArgumentException 触发任一护栏时
     */
    static void extractZip(byte[] zipBytes, Path destRoot) throws IOException {
        long totalBytes = 0;
        int entryCount = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ENTRIES) {
                    throw new IllegalArgumentException("压缩包文件数超过上限(" + MAX_ENTRIES + ")");
                }

                if (entry.isDirectory()) {
                    continue;
                }

                String entryName = entry.getName();
                // 防路径穿越:拒绝绝对路径与 ../
                Path entryPath = Path.of(entryName);
                if (entryPath.isAbsolute() || entryName.contains("..")) {
                    throw new IllegalArgumentException("压缩包包含非法路径: " + entryName);
                }

                Path target = destRoot.resolve(entryPath).normalize();
                if (!target.startsWith(destRoot)) {
                    throw new IllegalArgumentException("压缩包路径越界: " + entryName);
                }

                // 限制单文件大小
                if (entry.getSize() > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("单个文件超过大小上限: " + entryName);
                }

                Files.createDirectories(target.getParent());
                long written = Files.copy(zis, target);
                if (written > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("单个文件超过大小上限("
                            + (MAX_FILE_BYTES / 1024 / 1024) + "MB): " + entryName);
                }
                totalBytes += written;
                if (totalBytes > MAX_TOTAL_BYTES) {
                    throw new IllegalArgumentException("压缩包解压总量超过上限("
                            + (MAX_TOTAL_BYTES / 1024 / 1024) + "MB)");
                }
            }
        }
    }

    /**
     * 递归复制技能目录（SKILL.md + scripts/ + references/ 等），校验单文件与目录总量上限。
     *
     * @return 复制的总字节数
     */
    static long copySkillTree(Path sourceDir, Path targetDir) throws IOException {
        long total = 0;
        try (var stream = Files.walk(sourceDir)) {
            for (Path source : stream.toList()) {
                Path relative = sourceDir.relativize(source);
                Path target = targetDir.resolve(relative);
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target);
                    continue;
                }
                long size = Files.size(source);
                if (size > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("技能文件超过大小上限("
                            + (MAX_FILE_BYTES / 1024 / 1024) + "MB): " + relative);
                }
                total += size;
                if (total > MAX_SKILL_DIR_BYTES) {
                    throw new IllegalArgumentException("技能目录超过大小上限("
                            + (MAX_SKILL_DIR_BYTES / 1024 / 1024) + "MB): " + sourceDir.getFileName());
                }
                Files.createDirectories(target.getParent());
                Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return total;
    }

    /** 递归删除目录（先子后父），失败只记录日志 */
    static void deleteRecursively(Path dir) {
        try (var stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    // 忽略清理失败
                }
            });
        } catch (IOException e) {
            logger.warn("清理临时目录失败: {}", dir);
        }
    }
}