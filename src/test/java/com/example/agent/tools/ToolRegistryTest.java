package com.example.agent.tools;

import com.example.agent.llm.model.Tool;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class ToolRegistryTest {

    private ToolRegistry registry;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        registry = new ToolRegistry();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testRegisterTool() {
        registry.register(new MockTool("test_tool", "Test tool"));

        assertTrue(registry.hasTool("test_tool"));
        assertNotNull(registry.getExecutor("test_tool"));
    }

    @Test
    void testGetNonExistentTool() {
        assertNull(registry.getExecutor("non_existent"));
    }

    @Test
    void testHasTool() {
        assertFalse(registry.hasTool("test_tool"));

        registry.register(new MockTool("test_tool", "Test tool"));

        assertTrue(registry.hasTool("test_tool"));
    }

    @Test
    void testExecuteTool() throws Exception {
        registry.register(new MockTool("echo", "Echo tool"));

        ObjectNode args = objectMapper.createObjectNode();
        args.put("message", "Hello");

        String result = registry.execute("echo", objectMapper.writeValueAsString(args));

        assertEquals("Echo: Hello", result);
    }

    @Test
    void testExecuteUnknownTool() {
        assertThrows(ToolExecutionException.class, () -> {
            registry.execute("unknown", "{}");
        });
    }

    @Test
    void testExecuteWithNullToolName() {
        assertThrows(ToolExecutionException.class, () -> {
            registry.execute(null, "{}");
        });
    }

    @Test
    void testExecuteWithEmptyToolName() {
        assertThrows(ToolExecutionException.class, () -> {
            registry.execute("", "{}");
        });
    }

    @Test
    void testExecuteWithWhitespaceToolName() {
        assertThrows(ToolExecutionException.class, () -> {
            registry.execute("   ", "{}");
        });
    }

    @Test
    void testExecuteWithNullArguments() throws Exception {
        registry.register(new MockTool("echo", "Echo tool"));

        String result = registry.execute("echo", null);

        assertNotNull(result);
    }

    @Test
    void testExecuteWithEmptyArguments() throws Exception {
        registry.register(new MockTool("echo", "Echo tool"));

        String result = registry.execute("echo", "");

        assertNotNull(result);
    }

    @Test
    void testExecuteWithInvalidJsonArguments() {
        registry.register(new MockTool("echo", "Echo tool"));

        assertThrows(ToolExecutionException.class, () -> {
            registry.execute("echo", "not valid json");
        });
    }

    @Test
    void testToTools() {
        registry.register(new MockTool("tool1", "Tool 1"));
        registry.register(new MockTool("tool2", "Tool 2"));

        var tools = registry.toTools();

        assertEquals(2, tools.size());
    }

    @Test
    void testToToolsEmptyRegistry() {
        var tools = registry.toTools();

        assertTrue(tools.isEmpty());
    }

    @Test
    void testChainedRegistration() {
        registry.register(new MockTool("tool1", "Tool 1"))
                .register(new MockTool("tool2", "Tool 2"));

        assertTrue(registry.hasTool("tool1"));
        assertTrue(registry.hasTool("tool2"));
    }

    @Test
    void testUnregisterRemovesTool() {
        registry.register(new MockTool("tool1", "Tool 1"));

        ToolExecutor removed = registry.unregister("tool1");

        assertNotNull(removed);
        assertFalse(registry.hasTool("tool1"));
        assertNull(registry.getExecutor("tool1"));
    }

    @Test
    void testUnregisterNonExistentReturnsNull() {
        assertNull(registry.unregister("never_registered"));
    }

    @Test
    void testUnregisterThenReRegister() {
        registry.register(new MockTool("tool1", "Tool 1"));
        registry.unregister("tool1");
        assertFalse(registry.hasTool("tool1"));

        // 模拟热更新：重新启用后再次注册，toTools() 应立即包含该工具
        registry.register(new MockTool("tool1", "Tool 1 again"));
        assertTrue(registry.hasTool("tool1"));

        List<Tool> tools = registry.toTools();
        assertEquals(1, tools.size());
        assertEquals("tool1", tools.get(0).getFunction().getName());
    }

    private static class MockTool implements ToolExecutor {
        private final String name;
        private final String description;

        MockTool(String name, String description) {
            this.name = name;
            this.description = description;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public String getDescription() {
            return description;
        }

        @Override
        public String getParametersSchema() {
            return "{\"type\":\"object\",\"properties\":{\"message\":{\"type\":\"string\"}}}";
        }

        @Override
        public String execute(JsonNode arguments) throws ToolExecutionException {
            String message = arguments.has("message") ? arguments.get("message").asText() : "";
            return "Echo: " + message;
        }
    }

}
