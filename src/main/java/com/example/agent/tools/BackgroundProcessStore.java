package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 后台进程历史记录的磁盘持久化。
 * <p>
 * 只保存<b>已结束</b>的记录（运行中的进程在应用退出时会被终止，崩溃时也无法恢复句柄）：
 * <ul>
 *   <li>{@code <hippoRoot>/background/processes.json}：元数据（命令/PID/目录/会话/起止时间/状态）</li>
 *   <li>{@code <hippoRoot>/background/logs/<toolCallId>.log}：每条记录的输出快照</li>
 * </ul>
 * 写入策略：进程结束时整体重写一次（记录数上限很小，开销可忽略）；
 * 读取失败 / 写入失败都只记录日志，不影响主流程。
 */
public final class BackgroundProcessStore {

    private static final Logger logger = LoggerFactory.getLogger(BackgroundProcessStore.class);

    private static final String META_FILE = "processes.json";
    private static final String LOG_DIR = "logs";
    private static final String LOG_SUFFIX = ".log";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Path baseDir;
    private final Path logDir;
    private final Path metaFile;

    public BackgroundProcessStore(Path hippoRoot) {
        this.baseDir = hippoRoot.resolve("background");
        this.logDir = baseDir.resolve(LOG_DIR);
        this.metaFile = baseDir.resolve(META_FILE);
    }

    /**
     * 读取磁盘上的历史记录；不存在或损坏时返回空列表。
     */
    public List<BashProcessManager.BackgroundRecord> load() {
        List<BashProcessManager.BackgroundRecord> records = new ArrayList<>();
        if (!Files.isRegularFile(metaFile)) {
            return records;
        }
        try {
            JsonNode root = MAPPER.readTree(Files.readString(metaFile, StandardCharsets.UTF_8));
            JsonNode array = root.path("processes");
            if (!array.isArray()) {
                return records;
            }
            for (JsonNode node : array) {
                String toolCallId = text(node, "toolCallId");
                if (toolCallId == null || toolCallId.isEmpty()) {
                    continue;
                }
                String logName = text(node, "log");
                String logText = logName != null ? readLog(logName) : "";
                records.add(BashProcessManager.BackgroundRecord.restored(
                    toolCallId,
                    text(node, "command"),
                    text(node, "workingDir"),
                    text(node, "sessionId"),
                    node.path("pid").asInt(-1),
                    node.path("startedAt").asLong(0),
                    node.path("endedAt").asLong(0),
                    node.path("stopped").asBoolean(false),
                    logText,
                    ""));
            }
        } catch (Exception e) {
            logger.warn("读取后台进程历史失败（忽略并使用空历史）: {}", metaFile, e);
        }
        return records;
    }

    /**
     * 整体保存当前已结束记录，并清理不再引用的日志文件。
     */
    public void save(Collection<BashProcessManager.BackgroundRecord> records) {
        try {
            Files.createDirectories(logDir);
            List<BashProcessManager.BackgroundRecord> ordered = new ArrayList<>(records);
            ordered.sort(Comparator.comparingLong(BashProcessManager.BackgroundRecord::getStartTime).reversed());

            ObjectNode root = MAPPER.createObjectNode();
            ArrayNode array = root.putArray("processes");
            Set<String> keptLogs = new HashSet<>();
            for (BashProcessManager.BackgroundRecord record : ordered) {
                String logName = logFileName(record.getToolCallId());
                keptLogs.add(logName);
                writeLog(logName, record);

                ObjectNode node = array.addObject();
                node.put("toolCallId", record.getToolCallId());
                node.put("command", record.getCommand());
                node.put("pid", record.pid());
                node.put("workingDir", record.getWorkingDir());
                node.put("sessionId", record.getSessionId());
                node.put("startedAt", record.getStartTime());
                node.put("endedAt", record.getEndedAt());
                node.put("stopped", record.isStoppedByUser());
                node.put("log", logName);
            }
            writeMeta(root);
            pruneLogs(keptLogs);
        } catch (Exception e) {
            logger.warn("保存后台进程历史失败（忽略）", e);
        }
    }

    private void writeMeta(ObjectNode root) throws Exception {
        Files.createDirectories(baseDir);
        Path tmp = baseDir.resolve(META_FILE + ".tmp");
        Files.writeString(tmp, root.toString(), StandardCharsets.UTF_8,
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        try {
            Files.move(tmp, metaFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, metaFile, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void writeLog(String logName, BashProcessManager.BackgroundRecord record) throws Exception {
        String output = record.getOutputSnapshot();
        String error = record.getErrorSnapshot();
        StringBuilder content = new StringBuilder(output);
        if (!error.isEmpty()) {
            if (content.length() > 0 && content.charAt(content.length() - 1) != '\n') {
                content.append('\n');
            }
            content.append(error);
        }
        Files.writeString(logDir.resolve(logName), content.toString(), StandardCharsets.UTF_8,
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    private String readLog(String logName) {
        try {
            Path path = logDir.resolve(logName);
            if (!Files.isRegularFile(path)) {
                return "";
            }
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (Exception e) {
            logger.warn("读取后台进程日志失败: {}", logName, e);
            return "";
        }
    }

    /** 删除已不再被元数据引用的日志文件，避免历史淘汰后残留。 */
    private void pruneLogs(Set<String> keptLogs) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(logDir, "*" + LOG_SUFFIX)) {
            for (Path path : stream) {
                String name = path.getFileName().toString();
                if (!keptLogs.contains(name)) {
                    Files.deleteIfExists(path);
                }
            }
        } catch (Exception e) {
            logger.warn("清理后台进程历史日志失败（忽略）", e);
        }
    }

    /** toolCallId → 安全的日志文件名。 */
    private static String logFileName(String toolCallId) {
        String safe = toolCallId == null ? "" : toolCallId.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.isEmpty()) {
            safe = "unknown";
        }
        if (safe.length() > 80) {
            safe = safe.substring(0, 80);
        }
        return safe + LOG_SUFFIX;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
