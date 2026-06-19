package com.example.agent.web.util;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.session.SessionTokenStats;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("TokenStatsResponseBuilder 单元测试")
class TokenStatsResponseBuilderTest {

    private static final int MAX_TOKENS = 10000;

    private TokenStatsResponseBuilder builder;

    @BeforeEach
    void setUp() {
        builder = new TokenStatsResponseBuilder();
    }

    private Conversation createConversation(String... userMessages) {
        Conversation conv = new Conversation(MAX_TOKENS, TokenEstimatorFactory.getDefault(), "test-session");
        for (String msg : userMessages) {
            if (msg != null) {
                conv.addMessage(Message.user(msg));
            }
        }
        return conv;
    }

    private Conversation createConversationWithUsage(String... userMessages) {
        Conversation conv = createConversation(userMessages);
        Usage usage = new Usage();
        usage.setPromptTokens(50);
        usage.setCompletionTokens(30);
        usage.setTotalTokens(80);
        conv.updateLastKnownUsage(usage);
        return conv;
    }

    private Conversation createConversationWithCacheHit(String... userMessages) {
        Conversation conv = createConversation(userMessages);
        Usage usage = new Usage();
        usage.setPromptTokens(100);
        usage.setCompletionTokens(60);
        usage.setTotalTokens(160);
        usage.setPromptCacheHitTokens(40);
        conv.updateLastKnownUsage(usage);
        return conv;
    }

    @Nested
    @DisplayName("conversation 为 null")
    class NullConversationTests {

        @Test
        @DisplayName("应返回全默认值的响应")
        void returnsEmptyResponse() {
            Map<String, Object> response = builder.build(null, MAX_TOKENS, null);

            assertEquals(0, response.get("currentTokens"));
            assertEquals(MAX_TOKENS, response.get("maxTokens"));
            assertEquals(0.0, response.get("usagePercent"));
            assertEquals(0, response.get("messageCount"));
            assertEquals(false, response.get("hasKnownUsage"));
            assertEquals(0, response.get("sessionTotalInput"));
            assertEquals(0, response.get("sessionTotalOutput"));
            assertEquals(0, response.get("sessionTotalTokens"));
            assertEquals(0, response.get("sessionLlmCalls"));
            assertEquals(0, response.get("sessionToolCalls"));
            assertEquals(0, response.get("cacheHitTokens"));
            assertEquals(0.0, response.get("cacheHitRate"));
        }
    }

    @Nested
    @DisplayName("conversation 存在，hasKnownUsage=false")
    class EstimatedUsageTests {

        @Test
        @DisplayName("应使用估算 token 值，不包含真实 usage 字段")
        void usesEstimatedTokens() {
            Conversation conv = createConversation("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, null);

            assertEquals(false, response.get("hasKnownUsage"));
            assertTrue((Integer) response.get("currentTokens") > 0);
            assertEquals(MAX_TOKENS, response.get("maxTokens"));
            assertEquals(1, response.get("messageCount"));
            assertFalse(response.containsKey("promptTokens"));
            assertFalse(response.containsKey("completionTokens"));
        }

        @Test
        @DisplayName("usagePercent 应在合理范围内")
        void usagePercentInRange() {
            Conversation conv = createConversation("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, null);
            double usagePercent = (Double) response.get("usagePercent");
            assertTrue(usagePercent > 0.0);
            assertTrue(usagePercent < 100.0);
        }
    }

    @Nested
    @DisplayName("conversation 存在，hasKnownUsage=true")
    class KnownUsageTests {

        @Test
        @DisplayName("应使用真实的 usage 数据")
        void usesRealUsage() {
            Conversation conv = createConversationWithUsage("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, null);
            assertEquals(true, response.get("hasKnownUsage"));
            assertEquals(80, response.get("currentTokens"));
            assertEquals(50, response.get("promptTokens"));
            assertEquals(30, response.get("completionTokens"));
            assertEquals(80, response.get("totalTokens"));
            assertEquals(0, response.get("cacheHitTokens"));
            assertEquals(0.0, response.get("cacheHitRate"));
        }

        @Test
        @DisplayName("缓存命中数据应正确填充")
        void cacheHitDataPopulated() {
            Conversation conv = createConversationWithCacheHit("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, null);
            assertEquals(true, response.get("hasKnownUsage"));
            assertEquals(160, response.get("currentTokens"));
            assertEquals(100, response.get("promptTokens"));
            assertEquals(60, response.get("completionTokens"));
            assertEquals(160, response.get("totalTokens"));
            assertEquals(40, response.get("cacheHitTokens"));
            assertEquals(40.0, response.get("cacheHitRate"));
        }
    }

    @Nested
    @DisplayName("SessionTokenStats 来源")
    class SessionStatsTests {

        @Test
        @DisplayName("stats 不为 null 时使用 stats 数据")
        void usesStatsWhenAvailable() {
            SessionTokenStats stats = new SessionTokenStats();
            stats.addLlmCall(100, 50, 150, 30, 70);
            stats.addToolCall();

            Conversation conv = createConversationWithUsage("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, stats);

            assertEquals(100, response.get("sessionTotalInput"));
            assertEquals(50, response.get("sessionTotalOutput"));
            assertEquals(150, response.get("sessionTotalTokens"));
            assertEquals(1, response.get("sessionLlmCalls"));
            assertEquals(1, response.get("sessionToolCalls"));
            assertEquals(30, response.get("sessionCacheHitTokens"));
            assertEquals(30.0, response.get("sessionCacheHitRate"));
        }

        @Test
        @DisplayName("stats 为 null 时不包含 session 统计字段")
        void noSessionFieldsWhenStatsNull() {
            Conversation conv = createConversationWithUsage("hello");
            Map<String, Object> response = builder.build(conv, MAX_TOKENS, null);
            assertFalse(response.containsKey("sessionTotalInput"));
            assertFalse(response.containsKey("sessionTotalOutput"));
            assertFalse(response.containsKey("sessionTotalTokens"));
            assertFalse(response.containsKey("sessionLlmCalls"));
            assertFalse(response.containsKey("sessionToolCalls"));
        }
    }

    @Nested
    @DisplayName("maxTokens 参数")
    class MaxTokensTests {

        @Test
        @DisplayName("不同的 maxTokens 影响 usagePercent")
        void differentMaxTokensAffectsUsagePercent() {
            Conversation conv = createConversationWithUsage("hello");

            Map<String, Object> responseSmall = builder.build(conv, 100, null);
            Map<String, Object> responseLarge = builder.build(conv, 10000, null);

            double percentSmall = (Double) responseSmall.get("usagePercent");
            double percentLarge = (Double) responseLarge.get("usagePercent");

            assertTrue(percentSmall > percentLarge);
        }

        @Test
        @DisplayName("conversation 为 null 时 maxTokens 传递正确")
        void maxTokensPassedWhenConversationNull() {
            Map<String, Object> response = builder.build(null, 5000, null);
            assertEquals(5000, response.get("maxTokens"));
        }
    }
}
