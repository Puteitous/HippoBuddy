package com.example.agent.llm.exception;


public class LlmConnectionException extends LlmException {

    private final String baseUrl;

    public LlmConnectionException(String message, String baseUrl) {
        super(message);
        this.baseUrl = baseUrl;
    }

    public LlmConnectionException(String message, String baseUrl, Throwable cause) {
        super(message, cause);
        this.baseUrl = baseUrl;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    @Override
    public String getErrorCode() {
        return LlmErrorClassifier.CODE_NETWORK_ERROR;
    }
}