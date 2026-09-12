package com.example.agent.web.util;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * git 命令执行工具,供源码管理面板各 handler 复用。
 *
 * <p>统一走 {@code git} CLI:设置禁止分页、UTF-8、超时强制销毁。所有 handler 通过
 * 本工具执行 git 命令,避免各自重复 ProcessBuilder 样板(与 GitStatusHandler 一致)。
 */
public final class GitRunner {

    private static final long TIMEOUT_SECONDS = 10;

    private GitRunner() {}

    /** 一次 git 命令的结果 */
    public record Result(int exitCode, String stdout, String stderr) {
        public boolean ok() {
            return exitCode == 0;
        }
    }

    /** 在指定工作目录执行 git 命令并返回结果(不抛异常,错误在 Result 中体现) */
    public static Result run(Path workDir, String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        for (String a : args) cmd.add(a);

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(workDir.toFile());
        pb.redirectErrorStream(false);
        pb.environment().put("GIT_PAGER", "cat");
        pb.environment().put("PAGER", "cat");
        try {
            Process process = pb.start();
            // 必须在 waitFor 之前异步消费 stdout/stderr:管道缓冲填满时子进程会阻塞
            // 写入,若先 waitFor 会与子进程互相等待导致死锁(大输出命令如 git show 必超时)。
            CompletableFuture<String> stdoutF = CompletableFuture.supplyAsync(() -> {
                try {
                    return readAll(process.getInputStream());
                } catch (IOException e) {
                    return "";
                }
            });
            CompletableFuture<String> stderrF = CompletableFuture.supplyAsync(() -> {
                try {
                    return readAll(process.getErrorStream());
                } catch (IOException e) {
                    return "";
                }
            });

            boolean completed = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                return new Result(-1, "", "git 命令执行超时");
            }
            String stdout = await(stdoutF);
            String stderr = await(stderrF);
            return new Result(process.exitValue(), stdout, stderr);
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(-1, "", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    /** 等待异步读取结果;进程已退出但读取仍异常时返回空串兜底 */
    private static String await(CompletableFuture<String> f) {
        try {
            return f.get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            return "";
        }
    }

    /** 读取某 revision 下指定文件的文本内容;HEAD 等不存在该文件时返回 null */
    public static String showFile(Path workDir, String ref, String file) {
        Result r = run(workDir, "show", ref + ":" + file);
        if (!r.ok()) return null;
        // git show 输出的内容即文件文本(no-col 下不含前缀)
        return r.stdout();
    }

    /** 读取暂存区(index)中指定文件的文本内容;未暂存(不存在)时返回 null */
    public static String showIndex(Path workDir, String file) {
        Result r = run(workDir, "show", ":" + file);
        if (!r.ok()) return null;
        return r.stdout();
    }

    /** 解析 query 字符串为 map(URL 解码);空 query 返回空 map */
    public static Map<String, String> parseQuery(String query) {
        Map<String, String> params = new HashMap<>();
        if (query == null || query.isEmpty()) return params;
        String[] parts = query.split("&");
        for (String part : parts) {
            String[] kv = part.split("=", 2);
            String key = urlDecode(kv[0]);
            String val = kv.length == 2 ? urlDecode(kv[1]) : "";
            if (!key.isEmpty()) params.put(key, val);
        }
        return params;
    }

    /**
     * 校验并规范化 git 相对路径参数(file 类)。仅允许仓库内相对路径:
     * 拒绝绝对路径、以 {@code /} 开头、包含 {@code ..} 段或冒号(冒号会被 git show
     * 的 {@code rev:path} 语法误解析,也存在命令拼接风险)。非法返回 null。
     */
    public static String normalizeRelPath(String file) {
        if (file == null || file.isEmpty()) return null;
        String norm = file.replace('\\', '/');
        if (norm.startsWith("/") || norm.contains(":")) return null;
        String[] segs = norm.split("/");
        for (String seg : segs) {
            if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
        }
        return norm;
    }

    private static String urlDecode(String s) {
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return s;
        }
    }

    private static String readAll(java.io.InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(line);
            }
        }
        return sb.toString();
    }

    /** 读取文件文本;不存在或读取失败返回 null */
    public static String readFileText(Path path) {
        try {
            byte[] bytes = Files.readAllBytes(path);
            if (containsNul(bytes)) return null; // 二进制视为不可对比
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    /** 判断字节是否含 NUL(用于二进制检测) */
    public static boolean containsNul(byte[] bytes) {
        for (byte b : bytes) {
            if (b == 0) return true;
        }
        return false;
    }
}