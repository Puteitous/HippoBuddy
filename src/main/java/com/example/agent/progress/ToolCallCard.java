package com.example.agent.progress;

import java.util.concurrent.atomic.AtomicBoolean;

public class ToolCallCard {

    private final String toolName;
    private final String toolCallId;
    private final int index;
    private final int total;
    private final boolean runInBackground;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile String currentStatus = "";
    private volatile long startTime;
    private volatile String completionMarker = "";
    private volatile String completionStatus = "";
    private volatile String completionDetail = "";
    private volatile boolean completed = false;

    public ToolCallCard(String toolName, String toolCallId, int index, int total, boolean runInBackground) {
        this.toolName = toolName;
        this.toolCallId = toolCallId;
        this.index = index;
        this.total = total;
        this.runInBackground = runInBackground;
    }

    public void start() {
        if ("ask_user".equals(toolName)) {
            running.set(false);
            return;
        }

        running.set(true);
        startTime = System.currentTimeMillis();
        currentStatus = "执行中...";

        if (runInBackground) {
            SpinnerManager.getInstance().registerCard(this);
        }
    }

    public void updateStatus(String status) {
        this.currentStatus = status;
    }

    public void completeSuccess(String resultPreview) {
        complete("✅", "成功", resultPreview);
    }

    public void completeFailure(String errorMessage) {
        complete("❌", "失败", errorMessage);
    }

    private void complete(String marker, String status, String detail) {
        running.set(false);
        completed = true;
        completionMarker = marker;
        completionStatus = status;
        completionDetail = truncate(detail, 60);

        if (runInBackground) {
            SpinnerManager.getInstance().unregisterCard(this);
        }
    }

    public boolean isRunning() {
        return running.get();
    }

    public boolean isCompleted() {
        return completed;
    }

    public String getCompletionMarker() {
        return completionMarker;
    }

    public String getCompletionStatus() {
        return completionStatus;
    }

    public String getCompletionDetail() {
        return completionDetail;
    }

    public String getToolName() {
        return toolName;
    }

    public int getIndex() {
        return index;
    }

    public int getTotal() {
        return total;
    }

    public String getCurrentStatus() {
        return currentStatus;
    }

    public String getElapsedTime() {
        long elapsed = System.currentTimeMillis() - startTime;
        if (elapsed < 1000) {
            return elapsed + "ms";
        }
        return String.format("%.1fs", elapsed / 1000.0);
    }

    private String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        String singleLine = text.replace("\n", " ").replace("\r", " ").trim();
        if (singleLine.length() <= maxLength) {
            return singleLine;
        }
        return singleLine.substring(0, maxLength) + "...";
    }
}
