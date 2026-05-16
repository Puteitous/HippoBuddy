package com.example.agent.domain.truncation;

public class ContentClassifier {

    private static final double DIFF_THRESHOLD = 0.15;
    private static final double TREE_THRESHOLD = 0.2;
    private static final double LOG_THRESHOLD = 0.1;

    public static ContentType detect(String toolName, String content) {
        ContentType byTool = detectByToolName(toolName);
        if (byTool != null) {
            return byTool;
        }
        return detectByContent(content);
    }

    private static ContentType detectByToolName(String toolName) {
        if (toolName == null) {
            return null;
        }
        switch (toolName.toLowerCase()) {
            case "bash":
            case "run_command":
            case "shell":
                return ContentType.LOG;
            case "grep":
            case "glob":
                return ContentType.LIST;
            case "list_directory":
            case "ls":
            case "tree":
                return ContentType.TREE;
            case "read_file":
                return ContentType.CODE;
            default:
                return null;
        }
    }

    private static ContentType detectByContent(String content) {
        if (content == null || content.isEmpty()) {
            return ContentType.PLAIN_TEXT;
        }

        double diffScore = calculateDiffScore(content);
        if (diffScore > DIFF_THRESHOLD) {
            return ContentType.DIFF;
        }

        double treeScore = calculateTreeScore(content);
        if (treeScore > TREE_THRESHOLD) {
            return ContentType.TREE;
        }

        double logScore = calculateLogScore(content);
        if (logScore > LOG_THRESHOLD) {
            return ContentType.LOG;
        }

        if (looksLikeCode(content)) {
            return ContentType.CODE;
        }

        return ContentType.PLAIN_TEXT;
    }

    private static double calculateDiffScore(String content) {
        String[] lines = content.split("\n");
        int diffLines = 0;
        for (String line : lines) {
            if (line.startsWith("diff --git") ||
                line.startsWith("index ") ||
                line.startsWith("+++ ") ||
                line.startsWith("--- ") ||
                line.startsWith("@@ ") ||
                line.startsWith("+") && line.length() > 1 ||
                line.startsWith("-") && line.length() > 1) {
                diffLines++;
            }
        }
        return (double) diffLines / lines.length;
    }

    private static double calculateTreeScore(String content) {
        String[] lines = content.split("\n");
        int treeLines = 0;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("├") ||
                trimmed.startsWith("└") ||
                trimmed.startsWith("│") ||
                trimmed.startsWith("📄") ||
                trimmed.startsWith("📁")) {
                treeLines++;
            }
        }
        return (double) treeLines / lines.length;
    }

    private static double calculateLogScore(String content) {
        String[] lines = content.split("\n");
        int logLines = 0;
        for (String line : lines) {
            String lower = line.toLowerCase();
            if (lower.contains("error") ||
                lower.contains("warn") ||
                lower.contains("info") ||
                lower.contains("debug") ||
                lower.contains("trace") ||
                lower.contains("exception") ||
                line.matches("^\\d{4}[-/]\\d{2}[-/]\\d{2}.*") ||
                line.matches("^\\[?\\d{2}:\\d{2}:\\d{2}\\]?.*")) {
                logLines++;
            }
        }
        return (double) logLines / lines.length;
    }

    private static boolean looksLikeCode(String content) {
        String[] keywords = {"package ", "import ", "class ", "def ", "function ",
                             "fn ", "func ", "interface ", "enum ", "struct "};
        String lower = content.toLowerCase();
        for (String keyword : keywords) {
            if (lower.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
}
