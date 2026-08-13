package com.example.agent.llm.exception;

/**
 * LLM API 调用异常（携带 HTTP 状态码与原始错误体）。
 * <p>
 * 通过 {@link #classify(String, int, String)} 工厂方法创建时，会自动用
 * {@link LlmErrorClassifier} 归一化出稳定的业务错误码（{@link #getErrorCode()}）
 * 与面向用户的友好文案（{@link #getMessage()}），厂商原始详情保留在
 * {@link #getDetail()} / {@link #getErrorBody()} 中。
 */
public class LlmApiException extends LlmException {

    private final int statusCode;
    private final String errorBody;
    private final String errorCode;
    private final String detail;

    public LlmApiException(String message, int statusCode) {
        this(message, statusCode, null, null, null);
    }

    public LlmApiException(String message, int statusCode, String errorBody) {
        this(message, statusCode, errorBody, null, null);
    }

    public LlmApiException(String message, int statusCode, String errorBody, String errorCode) {
        this(message, statusCode, errorBody, errorCode, null);
    }

    private LlmApiException(String message, int statusCode, String errorBody, String errorCode, String detail) {
        super(message);
        if (statusCode < 0) {
            statusCode = 0;
        }
        this.statusCode = statusCode;
        this.errorBody = errorBody;
        this.errorCode = errorCode;
        this.detail = detail;
    }

    /**
     * 归一化工厂：按 {@code (provider, statusCode, body)} 分类并创建异常。
     * message 为面向用户的友好文案，errorCode 为稳定业务错误码。
     */
    public static LlmApiException classify(String provider, int statusCode, String body) {
        LlmError error = LlmErrorClassifier.classify(provider, statusCode, body);
        return new LlmApiException(error.getMessage(), statusCode, body, error.getCode(), error.getDetail());
    }

    public int getStatusCode() {
        return statusCode;
    }

    public String getErrorBody() {
        return errorBody;
    }

    /** 归一化后的业务错误码（见 {@link LlmErrorClassifier} 的 CODE_* 常量），可为 null（未分类） */
    public String getErrorCode() {
        return errorCode != null ? errorCode : super.getErrorCode();
    }

    /** 厂商原始错误详情（提取后的简短文本），可为 null */
    public String getDetail() {
        return detail;
    }

    public boolean isClientError() {
        return statusCode >= 400 && statusCode < 500;
    }

    public boolean isServerError() {
        return statusCode >= 500 && statusCode < 600;
    }

    public boolean isRateLimited() {
        return statusCode == 429;
    }

    public boolean isAuthenticationError() {
        return statusCode == 401 || statusCode == 403;
    }
    
    public boolean isValidStatusCode() {
        return statusCode >= 100 && statusCode < 600;
    }
}
