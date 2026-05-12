package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

class BashToolTest {

    private BashTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new BashTool();
        objectMapper = new ObjectMapper();
    }

    @AfterEach
    void tearDown() {
        try {
            Files.deleteIfExists(Paths.get("file.txt"));
        } catch (Exception e) {
        }
    }

    @Test
    void testGetName() {
        assertEquals("bash", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("命令"));
        assertTrue(description.contains("安全"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("command"));
        assertTrue(schema.contains("timeout"));
        assertTrue(schema.contains("working_dir"));
    }

    @Test
    void testMissingCommandParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testBlockedCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "rm -rf /");
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("安全限制"));
    }

    @Test
    void testBlockedCommandSudo() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "sudo apt-get update");
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("安全限制"));
    }

    @Test
    void testNotAllowedCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "python script.py");
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("不在允许列表中"));
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "src");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("src", paths.get(0));
    }

    @Test
    void testGetAffectedPathsWithoutWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals(".", paths.get(0));
    }

    @Test
    void testParameterSchemaFormat() {
        String schema = tool.getParametersSchema();
        
        assertTrue(schema.contains("\"type\": \"object\""));
        assertTrue(schema.contains("\"required\": [\"command\"]"));
        assertTrue(schema.contains("\"minimum\": 1"));
        assertTrue(schema.contains("\"maximum\": 300"));
    }

    @Test
    void testInvalidWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "/non/existent/path");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullCommandParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("command");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testEmptyCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWhitespaceCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "   ");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullTimeoutParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("timeout");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testNullWorkingDirParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("working_dir");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testEmptyWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testNegativeTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", -1);
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testExcessiveTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 10000);
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testDangerousPatternRmRf() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git rm -rf .");
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("危险命令模式"));
    }

    @Test
    void testAllowedPipeOperator() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git log --oneline");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testAllowedRedirectOperator() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("echo"));
        }
    }

    @Test
    void testBlockedSemicolonOperator() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status; ls");
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("安全限制"));
    }

    @Test
    void testWorkingDirIsFile() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "pom.xml");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }
}
