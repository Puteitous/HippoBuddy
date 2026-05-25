package com.example.agent.tools;

public class GlobPathParser {

    public static record ParsedGlob(String baseDir, String relativePattern) {}

    public static ParsedGlob extractGlobBaseDirectory(String pattern) {
        int globIndex = findFirstGlobChar(pattern);
        if (globIndex == -1) {
            int lastSep = Math.max(pattern.lastIndexOf('/'), pattern.lastIndexOf('\\'));
            if (lastSep == -1) {
                return new ParsedGlob("", pattern);
            }
            return new ParsedGlob(pattern.substring(0, lastSep), pattern.substring(lastSep + 1));
        }

        String staticPrefix = pattern.substring(0, globIndex);
        int lastSepIndex = Math.max(staticPrefix.lastIndexOf('/'), staticPrefix.lastIndexOf('\\'));

        if (lastSepIndex == -1) {
            return new ParsedGlob("", pattern);
        }

        String baseDir = staticPrefix.substring(0, lastSepIndex);
        String relativePattern = pattern.substring(lastSepIndex + 1);

        if (baseDir.isEmpty() && lastSepIndex == 0) {
            baseDir = "/";
        }

        if (baseDir.length() == 2 && baseDir.charAt(1) == ':') {
            baseDir = baseDir + "\\";
        }

        return new ParsedGlob(baseDir, relativePattern);
    }

    private static int findFirstGlobChar(String pattern) {
        for (int i = 0; i < pattern.length(); i++) {
            char c = pattern.charAt(i);
            if (c == '*' || c == '?' || c == '[' || c == '{') {
                return i;
            }
        }
        return -1;
    }

    public static boolean isAbsolutePattern(String pattern) {
        if (pattern == null || pattern.isEmpty()) return false;
        if (pattern.length() >= 2 && pattern.charAt(0) == '/' && pattern.charAt(1) == '/') {
            return true;
        }
        if (pattern.startsWith("/")) {
            return true;
        }
        if (pattern.length() >= 2 && Character.isLetter(pattern.charAt(0)) && pattern.charAt(1) == ':') {
            return true;
        }
        return false;
    }
}
