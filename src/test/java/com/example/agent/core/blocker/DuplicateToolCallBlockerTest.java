package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("DuplicateToolCallBlocker 工具调用去重测试")
class DuplicateToolCallBlockerTest {

    private DuplicateToolCallBlocker blocker;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        blocker = new DuplicateToolCallBlocker(5);
        objectMapper = new ObjectMapper();
    }

    @Nested
    @DisplayName("基础去重测试")
    class BasicDedupTests {

        @Test
        @DisplayName("首次调用允许")
        void firstCallAllowed() {
            JsonNode args = createArgs("test.txt");
            HookResult result = blocker.check("read_file", args);
            
            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("第二次调用允许（警告）")
        void secondCallAllowedWithWarning() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            HookResult result = blocker.check("read_file", args);
            
            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("自保护工具第 3 次调用允许（给缓存引导机会）")
        void thirdCallAllowedForSelfProtectedTools() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            HookResult result = blocker.check("read_file", args);
            
            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("自保护工具第 4 次调用拦截")
        void fourthCallBlockedForSelfProtectedTools() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            HookResult result = blocker.check("read_file", args);
            
            assertFalse(result.isAllowed());
            assertTrue(result.getReason().contains("重复工具调用"));
        }

        @Test
        @DisplayName("非自保护工具第 3 次调用拦截")
        void thirdCallBlockedForOtherTools() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("grep", args);
            blocker.check("grep", args);
            HookResult result = blocker.check("grep", args);
            
            assertFalse(result.isAllowed());
            assertTrue(result.getReason().contains("重复工具调用"));
        }
    }

    @Nested
    @DisplayName("不同参数测试")
    class DifferentArgsTests {

        @Test
        @DisplayName("不同文件路径视为不同调用")
        void differentFilePathsAreDifferent() {
            JsonNode args1 = createArgs("file1.txt");
            JsonNode args2 = createArgs("file2.txt");
            
            blocker.check("read_file", args1);
            blocker.check("read_file", args1);
            
            HookResult result = blocker.check("read_file", args2);
            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("不同工具视为不同调用")
        void differentToolsAreDifferent() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            
            HookResult result = blocker.check("grep", args);
            assertTrue(result.isAllowed());
        }
    }

    @Nested
    @DisplayName("窗口滑动测试")
    class WindowSlidingTests {

        @Test
        @DisplayName("窗口内调用计数")
        void callsWithinWindowCounted() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            
            assertEquals(1, blocker.getActiveCallCount());
        }

        @Test
        @DisplayName("重置后清空状态")
        void resetClearsState() {
            JsonNode args = createArgs("test.txt");
            
            blocker.check("read_file", args);
            blocker.check("read_file", args);
            
            blocker.reset();
            
            HookResult result = blocker.check("read_file", args);
            assertTrue(result.isAllowed());
            assertEquals(1, blocker.getActiveCallCount());
        }

        @Test
        @DisplayName("每轮结束后清空计数")
        void turnCompleteUpdatesCount() {
            JsonNode args = createArgs("test.txt");
            
            // 调用 6 次同一工具
            for (int i = 0; i < 6; i++) {
                blocker.check("read_file", args);
            }
            
            // Map 中只有 1 个唯一键
            assertEquals(1, blocker.getActiveCallCount());
            
            // 调用 onTurnComplete 清空所有计数（跨轮次重置）
            blocker.onTurnComplete();
            
            // 清空后 activeCallCount 应为 0
            assertEquals(0, blocker.getActiveCallCount());
            
            // 清空后再次调用应该正常工作（计数重新开始）
            HookResult result = blocker.check("read_file", args);
            assertTrue(result.isAllowed());
        }
    }

    @Nested
    @DisplayName("签名规范化测试")
    class SignatureNormalizationTests {

        @Test
        @DisplayName("不同键顺序产生相同签名")
        void differentKeyOrderProducesSameSignature() {
            ObjectNode args1 = objectMapper.createObjectNode();
            args1.put("path", "test.txt");
            args1.put("max_tokens", 4000);

            ObjectNode args2 = objectMapper.createObjectNode();
            args2.put("max_tokens", 4000);
            args2.put("path", "test.txt");
            
            blocker.check("read_file", args1);
            blocker.check("read_file", args2);
            HookResult result = blocker.check("read_file", args1);
            
            assertTrue(result.isAllowed());
        }
    }

    private JsonNode createArgs(String path) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("path", path);
        return node;
    }
}
