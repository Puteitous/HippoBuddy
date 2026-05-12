package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Phase 4: 速率限制 Blocker 测试")
class RateLimitBlockerTest {

    private RateLimitBlocker blocker;

    @BeforeEach
    void setUp() {
        blocker = new RateLimitBlocker(Duration.ofSeconds(1), 5);
    }

    @Nested
    @DisplayName("速率限制测试")
    class RateLimitTests {

        @Test
        @DisplayName("在限制范围内应该允许执行")
        void withinLimit_shouldBeAllowed() {
            JsonNode args = JsonNodeFactory.instance.objectNode().put("command", "ls");

            for (int i = 0; i < 5; i++) {
                HookResult result = blocker.check("bash", args);
                assertTrue(result.isAllowed());
            }
        }

        @Test
        @DisplayName("超过限制应该被拒绝")
        void exceedLimit_shouldBeBlocked() {
            JsonNode args = JsonNodeFactory.instance.objectNode().put("command", "ls");

            for (int i = 0; i < 5; i++) {
                blocker.check("bash", args);
            }

            HookResult result = blocker.check("bash", args);
            assertFalse(result.isAllowed());
            assertTrue(result.getReason().contains("频繁"));
            assertNotNull(result.getSuggestion());
        }

        @Test
        @DisplayName("不同工具应该有独立的限制")
        void differentTools_shouldHaveIndependentLimits() {
            JsonNode args = JsonNodeFactory.instance.objectNode();

            for (int i = 0; i < 5; i++) {
                blocker.check("bash", args);
            }

            HookResult bashResult = blocker.check("bash", args);
            assertFalse(bashResult.isAllowed());

            HookResult readResult = blocker.check("read_file", args);
            assertTrue(readResult.isAllowed());
        }

        @Test
        @DisplayName("窗口过期后应该重置计数")
        void windowExpiry_shouldResetCount() throws InterruptedException {
            RateLimitBlocker shortWindowBlocker = new RateLimitBlocker(Duration.ofMillis(100), 2);
            JsonNode args = JsonNodeFactory.instance.objectNode();

            shortWindowBlocker.check("bash", args);
            shortWindowBlocker.check("bash", args);

            HookResult result1 = shortWindowBlocker.check("bash", args);
            assertFalse(result1.isAllowed());

            Thread.sleep(150);

            HookResult result2 = shortWindowBlocker.check("bash", args);
            assertTrue(result2.isAllowed());
        }
    }

    @Nested
    @DisplayName("状态查询测试")
    class StateQueryTests {

        @Test
        @DisplayName("应该能获取当前调用计数")
        void getCurrentCallCount() {
            JsonNode args = JsonNodeFactory.instance.objectNode();

            assertEquals(0, blocker.getCurrentCallCount("bash"));

            blocker.check("bash", args);
            blocker.check("bash", args);

            assertEquals(2, blocker.getCurrentCallCount("bash"));
        }

        @Test
        @DisplayName("重置后应该清空所有计数")
        void reset_shouldClearAllCounts() {
            JsonNode args = JsonNodeFactory.instance.objectNode();

            blocker.check("bash", args);
            blocker.check("read_file", args);

            blocker.reset();

            assertEquals(0, blocker.getCurrentCallCount("bash"));
            assertEquals(0, blocker.getCurrentCallCount("read_file"));
        }
    }
}
