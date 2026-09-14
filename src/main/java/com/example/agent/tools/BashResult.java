package com.example.agent.tools;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * bash 命令执行的分类结果。
 * <p>
 * 语义参考 DeepSeek Harness 的 ShellRunResult："执行结果"不等于"执行失败"——
 * 非零退出、超时、用户取消都以结果呈现，而非异常；原因分类互斥，
 * 渲染层（formatResult/formatBackgroundResult）据此生成模型可见文本。
 * <p>
 * 便于会话转录记录结构化事实（而非只记渲染后的字符串）。
 */
public record BashResult(
        /** 退出码；-1 表示无有效退出码（信号终止 / 终止失败 / 后台启动成功）。 */
        int exitCode,
        /** 命令自身超时被终止。 */
        boolean timedOut,
        /** 被外部（用户）取消终止。 */
        boolean aborted,
        /** 终止失败，进程未能被终止、转入后台继续运行。 */
        boolean cancelFailed,
        /** 后台模式启动成功（进程持续运行，仅后台模式为 true）。 */
        boolean backgroundStarted,
        /** 执行耗时（毫秒）。 */
        long durationMs,
        /** 进程 PID；-1 表示无（前台正常结束）。 */
        long pid,
        /** 已按 output_mode 处理后的标准错误输出；空字符串表示无 stderr。 */
        String stderr,
        /** 已按 output_mode 处理后的模型可见输出。 */
        String output,
        /** 本次生效的输出策略（all/head/tail/errors）。 */
        String outputMode,
        /** 本次生效的输出行数上限；-1 表示未指定（使用模式默认）。 */
        int maxLines
) {
    /** 无有效退出码 / 无 PID 的哨兵值。 */
    public static final int NO_VALUE = -1;

    /**
     * 转为结构化 Map，供会话转录记录（{@code tool_result_detail}）：
     * 与渲染文本解耦，程序化分析/回放无需解析字符串。
     */
    public Map<String, Object> toDetailMap() {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("exitCode", exitCode);
        detail.put("timedOut", timedOut);
        detail.put("aborted", aborted);
        detail.put("cancelFailed", cancelFailed);
        detail.put("backgroundStarted", backgroundStarted);
        detail.put("durationMs", durationMs);
        detail.put("pid", pid);
        detail.put("output", output);
        detail.put("stderr", stderr);
        detail.put("outputMode", outputMode);
        detail.put("maxLines", maxLines);
        return detail;
    }
}