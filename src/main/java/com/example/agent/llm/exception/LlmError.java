package com.example.agent.llm.exception;

/**
 * LLM 错误归一化结果。
 * <p>
 * 由 {@link LlmErrorClassifier} 生成，包含三层信息：
 * <ul>
 *   <li>{@code code}：稳定的业务错误码（前后端契约，供前端按 code 渲染 i18n 文案）；</li>
 *   <li>{@code message}：面向用户的友好中文文案（兼容旧前端 / 日志兜底）；</li>
 *   <li>{@code detail}：厂商原始错误详情（保留给日志排查与高级展示，可为 null）。</li>
 * </ul>
 */
public final class LlmError {

    private final String code;
    private final String message;
    private final String detail;

    public LlmError(String code, String message, String detail) {
        this.code = code;
        this.message = message;
        this.detail = detail;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }

    public String getDetail() {
        return detail;
    }

    @Override
    public String toString() {
        return "LlmError{code='" + code + "', message='" + message + "', detail='" + detail + "'}";
    }
}
