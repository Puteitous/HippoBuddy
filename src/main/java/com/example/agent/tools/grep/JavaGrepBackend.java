package com.example.agent.tools.grep;

import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.filter.FileFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class JavaGrepBackend implements GrepBackend {

    private static final int MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final int MAX_LINE_LENGTH = 2000;
    private static final int MAX_DEPTH = 20;
    private static final int SEARCH_TIMEOUT_SECONDS = 30;

    @Override
    public String getName() {
        return "java";
    }

    @Override
    public List<SearchResult> search(GrepOptions options) throws ToolExecutionException {
        Pattern pattern = compilePattern(options);
        Path basePath = options.getSearchPath();
        FileFilter fileFilter = new FileFilter(basePath);

        CompletableFuture<List<SearchResult>> future = CompletableFuture.supplyAsync(() -> {
            try {
                return doSearch(basePath, pattern, options, fileFilter);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        });

        try {
            return future.orTimeout(SEARCH_TIMEOUT_SECONDS, TimeUnit.SECONDS).join();
        } catch (CompletionException e) {
            if (e.getCause() instanceof TimeoutException) {
                throw new ToolExecutionException("搜索超时（" + SEARCH_TIMEOUT_SECONDS + "秒），请尝试指定更具体的搜索路径或模式");
            }
            if (e.getCause() instanceof IOException ioe) {
                throw new ToolExecutionException("搜索失败: " + ioe.getMessage(), ioe);
            }
            throw new ToolExecutionException("搜索失败: " + e.getMessage(), e);
        }
    }

    private List<SearchResult> doSearch(Path basePath, Pattern pattern, GrepOptions options,
                                        FileFilter fileFilter) throws IOException {
        // 如果 path 是单个文件，直接搜索该文件（不走目录遍历）
        if (Files.isRegularFile(basePath)) {
            if (matchesFilePattern(basePath, options.getFilePattern())) {
                return searchInFile(basePath, pattern, options);
            }
            return Collections.emptyList();
        }

        List<Path> files = fileFilter.walkFiles(basePath, MAX_DEPTH)
                .filter(p -> matchesFilePattern(p, options.getFilePattern()))
                .collect(Collectors.toList());

        if (files.isEmpty()) {
            return Collections.emptyList();
        }

        return files.parallelStream()
            .flatMap(file -> {
                try {
                    return searchInFile(file, pattern, options).stream();
                } catch (IOException e) {
                    return Stream.empty();
                }
            })
            .collect(Collectors.toList());
    }

    private Pattern compilePattern(GrepOptions options) throws ToolExecutionException {
        try {
            int flags = options.isCaseSensitive() ? 0 : Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
            if (options.isMultiline()) {
                flags |= Pattern.DOTALL;
            }
            return Pattern.compile(options.getPattern(), flags);
        } catch (PatternSyntaxException e) {
            throw new ToolExecutionException("无效的正则表达式: " + e.getMessage());
        }
    }

    private boolean matchesFilePattern(Path path, String filePattern) {
        if (filePattern == null || filePattern.isEmpty()) {
            return true;
        }

        String fileName = path.getFileName().toString();
        String normalizedPattern = filePattern.startsWith("*") ? filePattern : "*" + filePattern;

        try {
            return fileName.matches(convertGlobToRegex(normalizedPattern));
        } catch (Exception e) {
            return fileName.toLowerCase().contains(filePattern.toLowerCase());
        }
    }

    private String convertGlobToRegex(String glob) {
        StringBuilder regex = new StringBuilder();
        for (char c : glob.toCharArray()) {
            switch (c) {
                case '*':
                    regex.append(".*");
                    break;
                case '?':
                    regex.append(".");
                    break;
                case '.':
                case '\\':
                case '(':
                case ')':
                case '[':
                case ']':
                case '{':
                case '}':
                case '^':
                case '$':
                case '|':
                case '+':
                    regex.append("\\").append(c);
                    break;
                default:
                    regex.append(c);
            }
        }
        return regex.toString();
    }

    private List<SearchResult> searchInFile(Path file, Pattern pattern, GrepOptions options) throws IOException {
        List<SearchResult> results = new ArrayList<>();

        long fileSize = Files.size(file);
        if (fileSize > MAX_FILE_SIZE) {
            return results;
        }

        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        String relativePath = file.getFileName().toString();

        List<Integer> matchLines = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            if (pattern.matcher(lines.get(i)).find()) {
                matchLines.add(i);
            }
        }

        int offset = options.getOffset();
        if (offset > 0) {
            if (offset >= matchLines.size()) {
                return results;
            }
            matchLines = matchLines.subList(offset, matchLines.size());
        }

        int maxResults = options.getMaxResults();
        int contextBefore = options.getContextBefore();
        int contextAfter = options.getContextAfter();
        int lastEmittedLine = -1;
        int matchCount = 0;

        for (int idx = 0; idx < matchLines.size() && matchCount < maxResults; idx++) {
            int matchLine = matchLines.get(idx);

            int ctxStart = Math.max(0, matchLine - contextBefore);
            int ctxFrom = Math.max(ctxStart, lastEmittedLine + 1);
            for (int i = ctxFrom; i < matchLine; i++) {
                results.add(new SearchResult(relativePath, i + 1, trimLine(lines.get(i)), true));
            }

            results.add(new SearchResult(relativePath, matchLine + 1, trimLine(lines.get(matchLine)), false));
            matchCount++;

            int ctxEnd = Math.min(lines.size() - 1, matchLine + contextAfter);
            for (int i = matchLine + 1; i <= ctxEnd; i++) {
                results.add(new SearchResult(relativePath, i + 1, trimLine(lines.get(i)), true));
            }

            lastEmittedLine = matchLine + contextAfter;
        }

        return results;
    }

    private String trimLine(String line) {
        if (line.length() > MAX_LINE_LENGTH) {
            line = line.substring(0, MAX_LINE_LENGTH) + "...";
        }
        return line.trim();
    }
}
