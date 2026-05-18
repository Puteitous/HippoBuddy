package com.example.agent.tools;

import java.util.concurrent.ConcurrentHashMap;

public class BashProcessManager {

    private static final BashProcessManager INSTANCE = new BashProcessManager();

    private final ConcurrentHashMap<String, Process> processes = new ConcurrentHashMap<>();

    private BashProcessManager() {
    }

    public static BashProcessManager getInstance() {
        return INSTANCE;
    }

    public void register(String toolCallId, Process process) {
        if (toolCallId != null && process != null) {
            processes.put(toolCallId, process);
        }
    }

    public void unregister(String toolCallId) {
        if (toolCallId != null) {
            processes.remove(toolCallId);
        }
    }

    public boolean isRunning(String toolCallId) {
        if (toolCallId == null) {
            return false;
        }
        Process process = processes.get(toolCallId);
        return process != null && process.isAlive();
    }

    public boolean cancel(String toolCallId) {
        if (toolCallId == null) {
            return false;
        }
        Process process = processes.remove(toolCallId);
        if (process != null && process.isAlive()) {
            process.destroyForcibly();
            return true;
        }
        return false;
    }

    public void cancelAll() {
        processes.forEach((id, process) -> {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        });
        processes.clear();
    }
}
