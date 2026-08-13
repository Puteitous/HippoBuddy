package com.example.agent.llm.exception;

public class LlmException extends Exception {

    public LlmException(String message) {
        super(message);
    }

    public LlmException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * 统一的业务错误码（见 {@link LlmErrorClassifier} 的 CODE_* 常量）。
     * 基类默认返回 null（无分类），子类按自身语义覆写。
     * 供上层（SSE error 事件、日志聚合）按稳定 code 渲染提示，而非直接透传异常文本。
     */
    public String getErrorCode() {
        return null;
    }
}
