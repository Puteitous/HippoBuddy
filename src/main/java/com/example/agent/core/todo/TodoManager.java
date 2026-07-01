package com.example.agent.core.todo;

import com.example.agent.console.AgentUi;
import com.example.agent.console.ConsoleStyle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

public class TodoManager {

    private static final Logger logger = LoggerFactory.getLogger(TodoManager.class);

    private final List<TodoTreeNode> rootNodes;

    public TodoManager() {
        this.rootNodes = new CopyOnWriteArrayList<>();
    }

    // ============ 写入操作 ============

    /**
     * 完全替换整个任务树。
     * items 的 Map 结构为：{id, content, status, sessionId, children}
     * children 是递归嵌套的相同结构。
     */
    public void replaceAll(List<Map<String, Object>> items) {
        rootNodes.clear();
        for (Map<String, Object> item : items) {
            rootNodes.add(buildNode(item));
        }
        logger.debug("Todo 树已替换: {} 个根节点", rootNodes.size());
    }

    /**
     * 深度合并更新任务树。
     * 按 id 匹配：已存在则更新 content/status/sessionId，并递归合并 children；
     * 不存在则新增。父节点存在但 children 不全时不会丢失已有的子节点。
     */
    public void mergeUpdates(List<Map<String, Object>> items) {
        for (Map<String, Object> item : items) {
            String id = (String) item.get("id");
            TodoTreeNode existing = findById(id);
            if (existing != null) {
                // 更新已有节点
                if (item.containsKey("content")) {
                    String content = (String) item.get("content");
                    if (content != null && !content.isEmpty()) {
                        existing.setContent(content);
                    }
                }
                if (item.containsKey("status")) {
                    existing.setStatus(TodoStatus.fromKey((String) item.get("status")));
                }
                if (item.containsKey("sessionId")) {
                    existing.setSessionId((String) item.get("sessionId"));
                }
                // 递归合并 children
                if (item.containsKey("children")) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> newChildren = (List<Map<String, Object>>) item.get("children");
                    if (newChildren != null) {
                        List<TodoTreeNode> merged = mergeNodeList(existing.getChildren(), newChildren);
                        existing.setChildren(new ArrayList<>(merged));
                    }
                }
                logger.debug("Todo 已更新: id={}", id);
            } else {
                // 新增节点
                rootNodes.add(buildNode(item));
                logger.debug("Todo 已添加: id={}", id);
            }
        }
    }

    // ============ 查询操作 ============

    /**
     * 递归按 id 查找节点（所有层级）。
     */
    public TodoTreeNode findById(String id) {
        for (TodoTreeNode node : rootNodes) {
            TodoTreeNode found = node.findById(id);
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    /**
     * 返回根节点列表（不可变快照）。
     */
    public List<TodoTreeNode> getRootNodes() {
        return new ArrayList<>(rootNodes);
    }

    /**
     * 递归统计所有节点的总数。
     */
    public int size() {
        long total = 0;
        for (TodoTreeNode node : rootNodes) {
            total += node.totalCount();
        }
        return (int) total;
    }

    public boolean isEmpty() {
        return rootNodes.isEmpty();
    }

    public void clear() {
        rootNodes.clear();
        logger.debug("Todo 树已清空");
    }

    /**
     * 递归统计树中指定状态的总数。
     */
    public long countByStatus(TodoStatus status) {
        long count = 0;
        for (TodoTreeNode node : rootNodes) {
            count += node.countByStatus(status);
        }
        return count;
    }

    // ============ 渲染输出 ============

    /**
     * 递归输出到控制台终端。
     */
    public void renderToUi(AgentUi ui) {
        if (rootNodes.isEmpty() || ui == null) {
            return;
        }

        ui.println();
        ui.println(ConsoleStyle.gray("══════════════════ 任务清单 ═════════════════"));

        for (TodoTreeNode node : rootNodes) {
            renderNodeToUi(ui, node, 0);
        }

        long completed = countByStatus(TodoStatus.COMPLETED);
        long total = size();
        String summary = String.format("  进度: %d/%d 已完成", completed, total);
        ui.println();
        ui.println(ConsoleStyle.cyan(summary));
        ui.println(ConsoleStyle.gray("═══════════════════════════════════════════════"));
        ui.println();
    }

    private void renderNodeToUi(AgentUi ui, TodoTreeNode node, int depth) {
        String indent = "  ".repeat(depth);
        String icon = node.getStatus().getIcon();
        String sessionTag = node.getSessionId() != null ? " 🔗" : "";
        String line = String.format("  %s%s%s  %s", indent, icon, sessionTag, node.getContent());

        if (node.getStatus() == TodoStatus.COMPLETED) {
            ui.println(ConsoleStyle.gray(line));
        } else if (node.getStatus() == TodoStatus.IN_PROGRESS) {
            ui.println(ConsoleStyle.yellow(line));
        } else {
            ui.println(line);
        }

        for (TodoTreeNode child : node.getChildren()) {
            renderNodeToUi(ui, child, depth + 1);
        }
    }

    /**
     * 递归格式化为 Markdown（带缩进）。
     */
    public String formatAsMarkdown() {
        if (rootNodes.isEmpty()) {
            return "暂无任务";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("## 任务清单\n\n");

        for (TodoTreeNode node : rootNodes) {
            renderNodeAsMarkdown(sb, node, 0);
        }

        long completed = countByStatus(TodoStatus.COMPLETED);
        long total = size();
        sb.append(String.format("\n**进度: %d/%d 已完成**\n", completed, total));
        return sb.toString();
    }

    private void renderNodeAsMarkdown(StringBuilder sb, TodoTreeNode node, int depth) {
        String indent = "  ".repeat(depth);
        String checkbox = node.getStatus() == TodoStatus.COMPLETED ? "- [x]" : "- [ ]";
        String sessionTag = node.getSessionId() != null ? " (🔗)" : "";
        sb.append(String.format("%s%s %s%s\n", indent, checkbox, node.getContent(), sessionTag));

        for (TodoTreeNode child : node.getChildren()) {
            renderNodeAsMarkdown(sb, child, depth + 1);
        }
    }

    // ============ 内部工具 ============

    @SuppressWarnings("unchecked")
    private TodoTreeNode buildNode(Map<String, Object> item) {
        String id = (String) item.get("id");
        String content = (String) item.get("content");
        String statusKey = (String) item.get("status");
        String sessionId = (String) item.get("sessionId");
        TodoStatus status = TodoStatus.fromKey(statusKey);

        TodoTreeNode node = new TodoTreeNode(id, content != null ? content : "", status);
        node.setSessionId(sessionId);

        if (item.containsKey("children")) {
            Object childrenObj = item.get("children");
            if (childrenObj instanceof List) {
                List<Map<String, Object>> childrenList = (List<Map<String, Object>>) childrenObj;
                List<TodoTreeNode> children = new ArrayList<>();
                for (Map<String, Object> childItem : childrenList) {
                    children.add(buildNode(childItem));
                }
                node.setChildren(children);
            }
        }

        return node;
    }

    /**
     * 递归合并两个节点列表（按 id）。
     * oldList 为已有节点，newList 为增量更新。
     * 父节点中不存在的子节点会被保留（newList 中未提及的保持不变）。
     */
    private List<TodoTreeNode> mergeNodeList(List<TodoTreeNode> oldList, List<Map<String, Object>> newList) {
        // 以 oldList 为基准构建 Map
        java.util.Map<String, TodoTreeNode> map = new java.util.LinkedHashMap<>();
        for (TodoTreeNode node : oldList) {
            map.put(node.getId(), node);
        }

        for (Map<String, Object> item : newList) {
            String id = (String) item.get("id");
            TodoTreeNode existing = map.get(id);
            if (existing != null) {
                // 更新已有节点
                if (item.containsKey("content")) {
                    String content = (String) item.get("content");
                    if (content != null && !content.isEmpty()) {
                        existing.setContent(content);
                    }
                }
                if (item.containsKey("status")) {
                    existing.setStatus(TodoStatus.fromKey((String) item.get("status")));
                }
                if (item.containsKey("sessionId")) {
                    existing.setSessionId((String) item.get("sessionId"));
                }
                // 递归合并 children
                if (item.containsKey("children")) {
                    Object childrenObj = item.get("children");
                    if (childrenObj instanceof List) {
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> newChildren = (List<Map<String, Object>>) childrenObj;
                        List<TodoTreeNode> merged = mergeNodeList(existing.getChildren(), newChildren);
                        existing.setChildren(new ArrayList<>(merged));
                    }
                }
            } else {
                // 新增节点
                map.put(id, buildNode(item));
            }
        }

        return new ArrayList<>(map.values());
    }
}
