package com.example.agent.llm.exception;

public class LlmTimeoutException extends LlmException {

    private final int timeoutSeconds;

    public LlmTimeoutException(String message, int timeoutSeconds) {
        super(message);
        this.timeoutSeconds = timeoutSeconds;
    }

    public LlmTimeoutException(String message, int timeoutSeconds, Throwable cause) {
        super(message, cause);
        this.timeoutSeconds = timeoutSeconds;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    @Override
    public String getErrorCode() {
        return LlmErrorClassifier.CODE_TIMEOUT;
    }
}