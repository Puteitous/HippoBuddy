package com.example.agent.core.blocker;

import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class SchemaValidationBlocker implements Blocker {

    private static final Logger logger = LoggerFactory.getLogger(SchemaValidationBlocker.class);
    
    private final ToolRegistry toolRegistry;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, Set<String>> requiredFieldsCache = new HashMap<>();
    private final Map<String, Map<String, String>> typeCache = new HashMap<>();

    public SchemaValidationBlocker(ToolRegistry toolRegistry) {
        this.toolRegistry = toolRegistry;
        initializeSchemaCache();
    }

    private void initializeSchemaCache() {
        for (ToolExecutor tool : toolRegistry.getAllTools()) {
            Set<String> requiredFields = parseRequiredFields(tool.getParametersSchema());
            requiredFieldsCache.put(tool.getName(), requiredFields);
            
            Map<String, String> fieldTypes = parseFieldTypes(tool.getParametersSchema());
            typeCache.put(tool.getName(), fieldTypes);
        }
    }

    private Set<String> parseRequiredFields(String schemaJson) {
        Set<String> required = new HashSet<>();
        try {
            if (schemaJson == null || schemaJson.trim().isEmpty()) {
                return required;
            }
            JsonNode schema = objectMapper.readTree(schemaJson);
            if (schema.has("required")) {
                for (JsonNode field : schema.get("required")) {
                    required.add(field.asText());
                }
            }
        } catch (Exception e) {
            logger.warn("解析 Schema 失败: {}", e.getMessage());
        }
        return required;
    }

    private Map<String, String> parseFieldTypes(String schemaJson) {
        Map<String, String> types = new HashMap<>();
        try {
            if (schemaJson == null || schemaJson.trim().isEmpty()) {
                return types;
            }
            JsonNode schema = objectMapper.readTree(schemaJson);
            if (schema.has("properties")) {
                JsonNode properties = schema.get("properties");
                Iterator<String> fieldNames = properties.fieldNames();
                while (fieldNames.hasNext()) {
                    String fieldName = fieldNames.next();
                    String type = properties.get(fieldName).has("type") 
                            ? properties.get(fieldName).get("type").asText() 
                            : "string";
                    types.put(fieldName, type);
                }
            }
        } catch (Exception e) {
            logger.warn("解析字段类型失败: {}", e.getMessage());
        }
        return types;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        Set<String> requiredFields = requiredFieldsCache.get(toolName);
        
        if (requiredFields == null || requiredFields.isEmpty()) {
            return HookResult.allow();
        }

        List<String> missingFields = new ArrayList<>();
        for (String field : requiredFields) {
            if (!arguments.has(field) || arguments.get(field).isNull()) {
                missingFields.add(field);
            }
        }

        if (!missingFields.isEmpty()) {
            String missingList = String.join(", ", missingFields);
            return HookResult.validationError(
                String.format("缺少必需参数: %s", missingList),
                String.format("正确示例: %s", getExampleForTool(toolName, missingFields.get(0)))
            );
        }

        Map<String, String> fieldTypes = typeCache.get(toolName);
        if (fieldTypes != null && !fieldTypes.isEmpty()) {
            for (Map.Entry<String, String> entry : fieldTypes.entrySet()) {
                String fieldName = entry.getKey();
                String expectedType = entry.getValue();
                
                if (arguments.has(fieldName) && !arguments.get(fieldName).isNull()) {
                    JsonNode value = arguments.get(fieldName);
                    if (!matchesType(value, expectedType)) {
                        return HookResult.validationError(
                            String.format("参数类型错误: %s 期望 %s，实际 %s", 
                                fieldName, expectedType, getNodeTypeName(value)),
                            String.format("正确示例: %s", getExampleForTool(toolName, fieldName))
                        );
                    }
                }
            }
        }

        return HookResult.allow();
    }

    private boolean matchesType(JsonNode value, String expectedType) {
        return switch (expectedType) {
            case "string" -> value.isTextual();
            case "number", "integer" -> value.isNumber();
            case "boolean" -> value.isBoolean();
            case "array" -> value.isArray();
            case "object" -> value.isObject();
            default -> true;
        };
    }

    private String getNodeTypeName(JsonNode node) {
        if (node.isTextual()) return "string";
        if (node.isNumber()) return "number";
        if (node.isBoolean()) return "boolean";
        if (node.isArray()) return "array";
        if (node.isObject()) return "object";
        return "unknown";
    }

    private String getExampleForTool(String toolName, String missingField) {
        Map<String, Map<String, String>> examples = getToolExamples();
        Map<String, String> toolExample = examples.get(toolName);
        
        if (toolExample != null) {
            return "{" + toolExample.entrySet().stream()
                    .map(e -> "\"" + e.getKey() + "\": \"" + e.getValue() + "\"")
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("") + "}";
        }
        
        return String.format("\"%s\": \"你的值\"", missingField);
    }

    private Map<String, Map<String, String>> getToolExamples() {
        Map<String, Map<String, String>> examples = new HashMap<>();
        
        examples.put("read_file", Map.of(
            "path", "src/main/java/com/example/Example.java"
        ));
        
        examples.put("edit_file", Map.of(
            "path", "src/main/java/com/example/Example.java",
            "old_text", "旧的代码内容",
            "new_text", "新的代码内容"
        ));
        
        examples.put("write_file", Map.of(
            "path", "src/main/java/com/example/Example.java",
            "content", "文件内容"
        ));
        
        examples.put("bash", Map.of(
            "command", "mvn compile -q",
            "timeout", "30"
        ));
        
        examples.put("glob", Map.of(
            "pattern", "**/*.java"
        ));
        
        examples.put("grep", Map.of(
            "pattern", "searchKeyword"
        ));
        
        examples.put("list_directory", Map.of(
            "path", "src/main/java/com/example"
        ));
        
        examples.put("ask_user", Map.of(
            "question", "你希望我怎么做？"
        ));
        
        examples.put("todo_write", Map.of(
            "title", "实现用户登录功能",
            "description", "需要添加登录页面和后端接口"
        ));
        
        examples.put("recall_memory", Map.of(
            "query", "用户偏好设置"
        ));
        
        examples.put("fork_agent", Map.of(
            "instruction", "搜索项目中的错误处理代码"
        ));
        
        examples.put("fork_agents", Map.of(
            "instructions", "[\"分析代码结构\", \"查找性能瓶颈\"]"
        ));
        
        examples.put("list_subagents", Map.of());
        
        examples.put("cancel_subagent", Map.of(
            "agent_id", "sub_agent_123"
        ));
        
        return examples;
    }

    public Set<String> getRequiredFields(String toolName) {
        return requiredFieldsCache.getOrDefault(toolName, Collections.emptySet());
    }
}
