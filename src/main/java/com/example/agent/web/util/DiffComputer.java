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

    /** 按行分割，去掉文件末尾 \n 带来的尾部空串；空文本视为 0 行 */
    private static List<String> splitLines(String text) {
        if (text == null || text.isEmpty()) {
            return new ArrayList<>();
        }
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

    /**
     * 词级 diff 按行组织（供前端行内精确变更标记）。
     * <p>
     * 返回 {@code {old: [...], new: [...]}}：
     * <ul>
     *   <li>{@code old[i]}：旧文件第 i+1 行的词标记序列，type ∈ {equal, delete}，
     *       delete 词表示该行中被删掉的词（供 removed 行渲染删除标记）</li>
     *   <li>{@code new[i]}：新文件第 i+1 行的词标记序列，type ∈ {equal, insert}，
     *       insert 词表示该行中新插入的词（供 added 行渲染新增标记）</li>
     * </ul>
     * 前端已持有每行精确行号（removed 用旧行号、added 用新行号），直接按行号索引，
     * 无需再做词序列 → 行的对齐，杜绝行级 diff 与词级 diff 对不上的问题。
     */
    public Map<String, Object> computeWordDiffLines(String original, String modified) {
        List<Map<String, Object>> flat = computeWordDiff(original, modified);

        List<List<Map<String, Object>>> oldLines = new ArrayList<>();
        List<List<Map<String, Object>>> newLines = new ArrayList<>();
        List<Map<String, Object>> curOld = new ArrayList<>();
        List<Map<String, Object>> curNew = new ArrayList<>();

        for (Map<String, Object> item : flat) {
            String type = (String) item.get("type");
            String value = item.get("value") != null ? (String) item.get("value") : "";
            // value 可能包含换行（词级切分把 \n 作为独立 token，也可能出现在边界）
            String[] parts = value.split("\n", -1);
            for (int p = 0; p < parts.length; p++) {
                String part = parts[p];
                if (!part.isEmpty()) {
                    // old 侧只含 equal 与 delete（insert 属于新文本）
                    if (!"insert".equals(type)) {
                        curOld.add(Map.of("type", "equal".equals(type) ? "equal" : "delete", "value", part));
                    }
                    // new 侧只含 equal 与 insert（delete 属于旧文本）
                    if (!"delete".equals(type)) {
                        curNew.add(Map.of("type", "equal".equals(type) ? "equal" : "insert", "value", part));
                    }
                }
                // 换行符（非最后一段）→ 结束当前行
                if (p < parts.length - 1) {
                    oldLines.add(curOld);
                    curOld = new ArrayList<>();
                    newLines.add(curNew);
                    curNew = new ArrayList<>();
                }
            }
        }
        // 文本以换行结尾时，末尾 \n 后会产生一个空行占位；与 splitLines 的行号语义对齐：
        // 末尾两侧都为空的行不保留（空文本 → 0 行，末尾换行 → 不产生多余行）。
        // 中间"单侧空行"（如删整行时 new 侧）无害且保留，前端只按真实变更行号索引。
        if (!curOld.isEmpty() || !curNew.isEmpty()) {
            oldLines.add(curOld);
            newLines.add(curNew);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("old", oldLines);
        result.put("new", newLines);
        return result;
    }

    public int[] countDiffStats(String original, String modified) {
        // 复用 splitLines：空文本视为 0 行，去掉末尾 \n 的尾空串，
        // 避免 split("\n", -1) 把空串误算成 1 行导致统计失真
        List<String> origLines = splitLines(original);
        List<String> modLines = splitLines(modified);

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
