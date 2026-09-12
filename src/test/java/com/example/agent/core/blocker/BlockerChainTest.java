package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("BlockerChain 测试")
class BlockerChainTest {

    private BlockerChain blockerChain;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        blockerChain = new BlockerChain();
        objectMapper = new ObjectMapper();
    }

    @Nested
    @DisplayName("基础功能测试")
    class BasicFunctionTests {

        @Test
        @DisplayName("空链允许所有请求")
        void emptyChainAllowsAll() {
            JsonNode args = createArgs("test.txt");
            HookResult result = blockerChain.check("read_file", args);

            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("添加 Blocker 后正常执行")
        void chainWithBlockersExecutesNormally() {
            blockerChain.add(new SchemaValidationBlocker());

            JsonNode args = createArgs("test.txt");
            HookResult result = blockerChain.check("read_file", args);

            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("第一个 Blocker 拦截后不执行后续")
        void firstBlockerBlocksStopsExecution() {
            blockerChain
                .add((toolName, args) -> HookResult.block("测试拦截"))
                .add((toolName, args) -> {
                    fail("第二个 Blocker 不应该被执行");
                    return HookResult.allow();
                });

            JsonNode args = createArgs("test.txt");
            HookResult result = blockerChain.check("read_file", args);

            assertFalse(result.isAllowed());
            assertEquals("测试拦截", result.getReason());
        }
    }

    @Nested
    @DisplayName("空值防御测试")
    class NullSafetyTests {

        @Test
        @DisplayName("Blocker 返回 null 抛出异常")
        void blockerReturnsNullThrowsException() {
            blockerChain.add((toolName, args) -> null);

            JsonNode args = createArgs("test.txt");
            assertThrows(NullPointerException.class, () -> {
                blockerChain.check("read_file", args);
            });
        }

        @Test
        @DisplayName("参数为 null 时正常工作")
        void nullArgumentsWorksNormally() {
            blockerChain.add(new SchemaValidationBlocker());

            HookResult result = blockerChain.check("read_file", null);

            assertTrue(result.isAllowed());
        }

        @Test
        @DisplayName("工具名为 null 时正常工作")
        void nullToolNameWorksNormally() {
            blockerChain.add(new SchemaValidationBlocker());

            JsonNode args = createArgs("test.txt");
            HookResult result = blockerChain.check(null, args);

            assertTrue(result.isAllowed());
        }
    }

    @Nested
    @DisplayName("多 Blocker 链测试")
    class MultiBlockerChainTests {

        @Test
        @DisplayName("多个 Blocker 顺序执行")
        void multipleBlockersExecuteInOrder() {
            final int[] executionOrder = {0};

            blockerChain
                .add((toolName, args) -> {
                    assertEquals(1, ++executionOrder[0]);
                    return HookResult.allow();
                })
                .add((toolName, args) -> {
                    assertEquals(2, ++executionOrder[0]);
                    return HookResult.allow();
                })
                .add((toolName, args) -> {
                    assertEquals(3, ++executionOrder[0]);
                    return HookResult.allow();
                });

            JsonNode args = createArgs("test.txt");
            blockerChain.check("read_file", args);

            assertEquals(3, executionOrder[0]);
        }

        @Test
        @DisplayName("中间 Blocker 拦截停止后续执行")
        void middleBlockerBlocksStopsSubsequent() {
            final boolean[] thirdExecuted = {false};

            blockerChain
                .add((toolName, args) -> HookResult.allow())
                .add((toolName, args) -> HookResult.block("中间拦截"))
                .add((toolName, args) -> {
                    thirdExecuted[0] = true;
                    return HookResult.allow();
                });

            JsonNode args = createArgs("test.txt");
            HookResult result = blockerChain.check("read_file", args);

            assertFalse(result.isAllowed());
            assertFalse(thirdExecuted[0]);
        }
    }


    private JsonNode createArgs(String path) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("path", path);
        return node;
    }

    static class SchemaValidationBlocker implements Blocker {
        @Override
        public HookResult check(String toolName, JsonNode arguments) {
            if (arguments == null) {
                return HookResult.allow();
            }
            return HookResult.allow();
        }
    }
}