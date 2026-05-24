package com.example.agent.snapshot;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class Snapshot {
    private final String messageId;
    private final long timestamp;
    private final List<TrackedFile> trackedFiles;

    public Snapshot(String messageId, long timestamp, List<TrackedFile> trackedFiles) {
        this.messageId = messageId;
        this.timestamp = timestamp;
        this.trackedFiles = trackedFiles != null ? new ArrayList<>(trackedFiles) : new ArrayList<>();
    }

    public String getMessageId() { return messageId; }
    public long getTimestamp() { return timestamp; }
    public List<TrackedFile> getTrackedFiles() { return new ArrayList<>(trackedFiles); }

    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"messageId\":\"").append(escapeJson(messageId))
          .append("\",\"timestamp\":").append(timestamp)
          .append(",\"trackedFiles\":[");
        for (int i = 0; i < trackedFiles.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(trackedFiles.get(i).toJson());
        }
        sb.append("]}");
        return sb.toString();
    }

    public static Snapshot fromJson(String json) {
        String messageId = extractJsonString(json, "messageId");
        long timestamp = extractJsonLong(json, "timestamp");
        List<TrackedFile> files = new ArrayList<>();
        String filesArray = extractJsonArray(json, "trackedFiles");
        if (filesArray != null && !filesArray.isBlank()) {
            List<String> items = splitJsonArray(filesArray);
            for (String item : items) {
                files.add(TrackedFile.fromJson(item.trim()));
            }
        }
        return new Snapshot(messageId, timestamp, files);
    }

    public static class TrackedFile {
        private final String path;
        private final String hash;
        private final String backup;
        private final boolean created;

        public TrackedFile(String path, String hash, String backup) {
            this(path, hash, backup, false);
        }

        public TrackedFile(String path, String hash, String backup, boolean created) {
            this.path = path;
            this.hash = hash;
            this.backup = backup;
            this.created = created;
        }

        public String getPath() { return path; }
        public String getHash() { return hash; }
        public String getBackup() { return backup; }
        public boolean isCreated() { return created; }

        public String toJson() {
            return "{\"path\":\"" + escapeJson(path)
                + "\",\"hash\":\"" + escapeJson(hash)
                + "\",\"backup\":" + (backup != null ? "\"" + escapeJson(backup) + "\"" : "null")
                + ",\"created\":" + created
                + "}";
        }

        public static TrackedFile fromJson(String json) {
            String path = extractJsonString(json, "path");
            String hash = extractJsonString(json, "hash");
            String backup = extractJsonStringOrNull(json, "backup");
            boolean created = extractJsonBoolean(json, "created");
            return new TrackedFile(path, hash, backup, created);
        }
    }

    private static String extractJsonString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start < 0) return "";
        start += search.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(i + 1);
                switch (next) {
                    case 'n': sb.append('\n'); i++; break;
                    case 'r': sb.append('\r'); i++; break;
                    case 't': sb.append('\t'); i++; break;
                    case '"': sb.append('"'); i++; break;
                    case '\\': sb.append('\\'); i++; break;
                    default: sb.append(c);
                }
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static String extractJsonStringOrNull(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start >= 0) {
            start += search.length();
            StringBuilder sb = new StringBuilder();
            for (int i = start; i < json.length(); i++) {
                char c = json.charAt(i);
                if (c == '\\' && i + 1 < json.length()) {
                    char next = json.charAt(i + 1);
                    switch (next) {
                        case 'n': sb.append('\n'); i++; break;
                        case 'r': sb.append('\r'); i++; break;
                        case 't': sb.append('\t'); i++; break;
                        case '"': sb.append('"'); i++; break;
                        case '\\': sb.append('\\'); i++; break;
                        default: sb.append(c);
                    }
                } else if (c == '"') {
                    break;
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }
        String nullSearch = "\"" + key + "\":null";
        if (json.contains(nullSearch)) {
            return null;
        }
        return "";
    }

    private static long extractJsonLong(String json, String key) {
        String search = "\"" + key + "\":";
        int start = json.indexOf(search);
        if (start < 0) return 0;
        start += search.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (Character.isDigit(c) || c == '-') {
                sb.append(c);
            } else {
                break;
            }
        }
        try {
            return Long.parseLong(sb.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean extractJsonBoolean(String json, String key) {
        String search = "\"" + key + "\":";
        int start = json.indexOf(search);
        if (start < 0) return false;
        start += search.length();
        if (start >= json.length()) return false;
        char c = json.charAt(start);
        return c == 't' || c == '1';
    }

    private static String extractJsonArray(String json, String key) {
        String search = "\"" + key + "\":[";
        int start = json.indexOf(search);
        if (start < 0) return null;
        start += search.length();
        int depth = 1;
        int end = start;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '[') depth++;
            else if (c == ']') {
                depth--;
                if (depth == 0) { end = i; break; }
            }
        }
        return json.substring(start, end);
    }

    private static List<String> splitJsonArray(String arrayContent) {
        List<String> items = new ArrayList<>();
        if (arrayContent.isBlank()) return items;
        int depth = 0;
        int itemStart = 0;
        boolean inString = false;
        for (int i = 0; i < arrayContent.length(); i++) {
            char c = arrayContent.charAt(i);
            if (c == '\\' && i + 1 < arrayContent.length()) {
                i++;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (c == '{') {
                if (depth == 0) itemStart = i;
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    items.add(arrayContent.substring(itemStart, i + 1));
                }
            }
        }
        return items;
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }
}
