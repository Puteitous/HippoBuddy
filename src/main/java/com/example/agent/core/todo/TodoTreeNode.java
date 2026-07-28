package com.example.agent.core.todo;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 树状任务节点，支持嵌套子任务。
 * 每个节点包含 id、内容、状态、可选关联的会话 ID 和子任务列表。
 */
public class TodoTreeNode {

    private final String id;
    private String content;
    private TodoStatus status;
    private String sessionId;
    private String parentId;
    private List<TodoTreeNode> children;

    public TodoTreeNode(String id, String content, TodoStatus status) {
        this.id = id;
        this.content = content;
        this.status = status != null ? status : TodoStatus.PENDING;
    }

    public TodoTreeNode(String id, String content) {
        this(id, content, TodoStatus.PENDING);
    }

    public String getId() {
        return id;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public TodoStatus getStatus() {
        return status;
    }

    public void setStatus(TodoStatus status) {
        this.status = status;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getParentId() {
        return parentId;
    }

    public void setParentId(String parentId) {
        this.parentId = parentId;
    }

    public List<TodoTreeNode> getChildren() {
        return children != null ? children : Collections.emptyList();
    }

    public void setChildren(List<TodoTreeNode> children) {
        this.children = children;
    }

    public boolean hasChildren() {
        return children != null && !children.isEmpty();
    }

    /**
     * 合并另一个节点的数据（不合并 children 字段，children 由外部递归处理）。
     */
    public void merge(TodoTreeNode other) {
        if (other.content != null && !other.content.isEmpty()) {
            this.content = other.content;
        }
        if (other.status != null) {
            this.status = other.status;
        }
        if (other.sessionId != null) {
            this.sessionId = other.sessionId;
        }
        if (other.parentId != null) {
            this.parentId = other.parentId;
        }
    }

    /**
     * 递归统计本节点及子节点中指定状态的数量。
     */
    public long countByStatus(TodoStatus target) {
        long count = (this.status == target) ? 1 : 0;
        if (children != null) {
            for (TodoTreeNode child : children) {
                count += child.countByStatus(target);
            }
        }
        return count;
    }

    /**
     * 递归统计本节点及子节点的总数。
     */
    public long totalCount() {
        long count = 1;
        if (children != null) {
            for (TodoTreeNode child : children) {
                count += child.totalCount();
            }
        }
        return count;
    }

    /**
     * 递归按 id 查找节点。
     */
    public TodoTreeNode findById(String targetId) {
        if (this.id.equals(targetId)) {
            return this;
        }
        if (children != null) {
            for (TodoTreeNode child : children) {
                TodoTreeNode found = child.findById(targetId);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
