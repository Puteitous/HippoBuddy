package com.example.agent.web.util;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DiffComputer {

    public static final DiffComputer DEFAULT = new DiffComputer();

    public List<Map<String, String>> computeDiffAsMap(String original, String modified) {
        List<String[]> diffLines = computeDiff(original, modified);
        List<Map<String, String>> result = new ArrayList<>();
        for (String[] line : diffLines) {
            Map<String, String> item = new HashMap<>();
            item.put("type", line[0]);
            item.put("content", line[1]);
            result.add(item);
        }
        return result;
    }

    public List<String[]> computeDiff(String original, String modified) {
        String[] origLines = splitLines(original);
        String[] modLines = splitLines(modified);

        int m = origLines.length;
        int n = modLines.length;

        int[][] dp = buildLcsTable(origLines, modLines, m, n);

        return backtrackDiff(origLines, modLines, dp, m, n);
    }

    private static String[] splitLines(String text) {
        return text.split("\n", -1);
    }

    private static int[][] buildLcsTable(String[] origLines, String[] modLines, int m, int n) {
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (origLines[i - 1].equals(modLines[j - 1])) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    }

    private static List<String[]> backtrackDiff(String[] origLines, String[] modLines,
                                                  int[][] dp, int m, int n) {
        List<String[]> reversed = new ArrayList<>();
        int i = m, j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && origLines[i - 1].equals(modLines[j - 1])) {
                reversed.add(new String[]{"same", origLines[i - 1]});
                i--;
                j--;
            } else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                reversed.add(new String[]{"added", modLines[j - 1]});
                j--;
            } else if (i > 0) {
                reversed.add(new String[]{"removed", origLines[i - 1]});
                i--;
            }
        }

        List<String[]> result = new ArrayList<>();
        for (int k = reversed.size() - 1; k >= 0; k--) {
            result.add(reversed.get(k));
        }
        return result;
    }
}
