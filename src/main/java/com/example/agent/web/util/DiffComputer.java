package com.example.agent.web.util;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.DeltaType;
import com.github.difflib.patch.Patch;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DiffComputer {

    public static final DiffComputer DEFAULT = new DiffComputer();

    /** 按行分割，去掉文件末尾 \n 带来的尾部空串 */
    private static List<String> splitLines(String text) {
        List<String> lines = new ArrayList<>(Arrays.asList(text.split("\n", -1)));
        // 文件结尾有 \n 时 split("\n", -1) 会多一个空串，去掉它
        if (lines.size() > 1 && lines.get(lines.size() - 1).isEmpty()) {
            lines.remove(lines.size() - 1);
        }
        return lines;
    }

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
        List<String> origLines = splitLines(original);
        List<String> modLines = splitLines(modified);

        Patch<String> patch = DiffUtils.diff(origLines, modLines);
        List<String[]> result = new ArrayList<>();

        int origIdx = 0;

        for (AbstractDelta<String> delta : patch.getDeltas()) {
            while (origIdx < delta.getSource().getPosition()) {
                result.add(new String[]{"same", origLines.get(origIdx)});
                origIdx++;
            }

            switch (delta.getType()) {
                case DELETE:
                    for (String line : delta.getSource().getLines()) {
                        result.add(new String[]{"removed", line});
                    }
                    origIdx += delta.getSource().getLines().size();
                    break;
                case INSERT:
                    for (String line : delta.getTarget().getLines()) {
                        result.add(new String[]{"added", line});
                    }
                    break;
                case CHANGE:
                    for (String line : delta.getSource().getLines()) {
                        result.add(new String[]{"removed", line});
                    }
                    for (String line : delta.getTarget().getLines()) {
                        result.add(new String[]{"added", line});
                    }
                    origIdx += delta.getSource().getLines().size();
                    break;
            }
        }

        while (origIdx < origLines.size()) {
            result.add(new String[]{"same", origLines.get(origIdx)});
            origIdx++;
        }

        return result;
    }

    public List<Map<String, Object>> computeWordDiff(String original, String modified) {
        List<String> origWords = Arrays.asList(original.split("(?<=\\s)|(?=\\s)", -1));
        List<String> modWords = Arrays.asList(modified.split("(?<=\\s)|(?=\\s)", -1));

        Patch<String> patch = DiffUtils.diff(origWords, modWords);
        List<Map<String, Object>> result = new ArrayList<>();

        int origIdx = 0;

        for (AbstractDelta<String> delta : patch.getDeltas()) {
            while (origIdx < delta.getSource().getPosition()) {
                Map<String, Object> item = new HashMap<>();
                item.put("type", "equal");
                item.put("value", origWords.get(origIdx));
                result.add(item);
                origIdx++;
            }

            switch (delta.getType()) {
                case DELETE:
                    for (String word : delta.getSource().getLines()) {
                        Map<String, Object> item = new HashMap<>();
                        item.put("type", "delete");
                        item.put("value", word);
                        result.add(item);
                    }
                    origIdx += delta.getSource().getLines().size();
                    break;
                case INSERT:
                    for (String word : delta.getTarget().getLines()) {
                        Map<String, Object> item = new HashMap<>();
                        item.put("type", "insert");
                        item.put("value", word);
                        result.add(item);
                    }
                    break;
                case CHANGE:
                    for (String word : delta.getSource().getLines()) {
                        Map<String, Object> item = new HashMap<>();
                        item.put("type", "delete");
                        item.put("value", word);
                        result.add(item);
                    }
                    for (String word : delta.getTarget().getLines()) {
                        Map<String, Object> item = new HashMap<>();
                        item.put("type", "insert");
                        item.put("value", word);
                        result.add(item);
                    }
                    origIdx += delta.getSource().getLines().size();
                    break;
            }
        }

        while (origIdx < origWords.size()) {
            Map<String, Object> item = new HashMap<>();
            item.put("type", "equal");
            item.put("value", origWords.get(origIdx));
            result.add(item);
            origIdx++;
        }

        return result;
    }

    public int[] countDiffStats(String original, String modified) {
        List<String> origLines = Arrays.asList(original.split("\n", -1));
        List<String> modLines = Arrays.asList(modified.split("\n", -1));

        Patch<String> patch = DiffUtils.diff(origLines, modLines);

        int insertions = 0;
        int deletions = 0;

        for (AbstractDelta<String> delta : patch.getDeltas()) {
            switch (delta.getType()) {
                case INSERT:
                    insertions += delta.getTarget().getLines().size();
                    break;
                case DELETE:
                    deletions += delta.getSource().getLines().size();
                    break;
                case CHANGE:
                    deletions += delta.getSource().getLines().size();
                    insertions += delta.getTarget().getLines().size();
                    break;
            }
        }

        return new int[]{insertions, deletions};
    }
}
