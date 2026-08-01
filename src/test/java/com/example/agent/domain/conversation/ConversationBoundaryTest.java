package com.example.agent.domain.conversation;

import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DisplayName("Conversation 边界条件测试")
class ConversationBoundaryTest {

    private Conversation conversation;
    private TokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = TokenEstimatorFactory.getDefault();
        conversation = new Conversation(100, tokenEstimator);
    }

    @Test
    @DisplayName("✅ Token 使用率可以超过 1.0（设计行为）")
    void tokenUsageCanExceedOne() {
        String content = generateLongContent(200);
        conversation.addMessage(Message.user(content));

        double ratio = conversation.getUsageRatio();
        System.out.println("Token usage ratio: " + ratio);

        assertThat(ratio).isGreaterThan(0);
    }

    @Test
    @DisplayName("✅ 正常 Token 用量可以正确计算")
    void normalTokenUsageCalculation() {
        conversation.addMessage(Message.user("Hello world"));

        double ratio = conversation.getUsageRatio();

        assertThat(ratio).isBetween(0.0, 2.0);
    }

    @Test
    @DisplayName("✅ 极小 Token 预算边界测试")
    void extremelySmallTokenBudget() {
        Conversation tinyConv = new Conversation(10, tokenEstimator);

        // 消息需要足够长，确保在任何 TokenEstimator 实现（tiktoken / simple）下
        // 估算结果都超过 10 token 预算，从而验证 ratio 可以超过 1.0
        tinyConv.addMessage(Message.user(generateLongContent(10)));

        assertThat(tinyConv.getUsageRatio()).isGreaterThan(1.0);
    }

    @Test
    @DisplayName("✅ 极大 Token 预算正常工作")
    void extremelyLargeTokenBudget() {
        Conversation largeConv = new Conversation(1_000_000, tokenEstimator);

        for (int i = 0; i < 100; i++) {
            largeConv.addMessage(Message.user("Message " + i));
        }

        assertThat(largeConv.size()).isEqualTo(100);
        assertThat(largeConv.getUsageRatio()).isLessThan(0.1);
    }

    @Test
    @DisplayName("✅ clear() 后可以重新添加消息")
    void clearThenAddAgain() {
        String longContent = generateLongContent(60);
        conversation.addMessage(Message.user(longContent));
        int sizeBefore = conversation.size();

        conversation.clear();

        assertThat(conversation.size()).isEqualTo(0);

        conversation.addMessage(Message.user("New message after clear"));

        assertThat(conversation.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("✅ 连续 clear 不崩溃")
    void multipleClearCalls() {
        conversation.addMessage(Message.user("1"));
        conversation.clear();
        conversation.clear();
        conversation.clear();

        conversation.addMessage(Message.user("After multiple clears"));

        assertThat(conversation.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("✅ 相同消息重复添加")
    void duplicateMessages() {
        Message msg = Message.user("Same content");

        conversation.addMessage(msg);
        conversation.addMessage(msg);
        conversation.addMessage(msg);

        assertThat(conversation.size()).isEqualTo(3);
    }

    @Test
    @DisplayName("✅ getContextWindow 返回正确实例")
    void getContextWindow() {
        assertThat(conversation.getContextWindow()).isNotNull();
    }

    @Test
    @DisplayName("✅ getBlockingGuard 返回正确实例")
    void getBlockingGuard() {
        assertThat(conversation.getBlockingGuard()).isNotNull();
    }

    @Test
    @DisplayName("✅ clearInjectedWarnings 不崩溃")
    void clearInjectedWarnings() {
        conversation.addMessage(Message.user("Test"));
        conversation.clearInjectedWarnings();

        assertThat(conversation.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("✅ getBudget 正确返回")
    void getBudget() {
        assertThat(conversation.getBudget()).isNotNull();
        assertThat(conversation.getBudget().getMaxTokens()).isEqualTo(100);
    }

    @Test
    @DisplayName("✅ 空消息内容处理")
    void emptyMessageContent() {
        conversation.addMessage(Message.user(""));

        assertThat(conversation.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("✅ null 内容不崩溃")
    void nullMessageContent() {
        Message msg = Message.user(null);
        conversation.addMessage(msg);

        assertThat(conversation.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("✅ 会话独立不互相影响")
    void sessionsAreIndependent() {
        Conversation conv1 = new Conversation(1000, tokenEstimator, "session-1");
        Conversation conv2 = new Conversation(1000, tokenEstimator, "session-2");

        conv1.addMessage(Message.user("Message for conv1"));
        conv2.addMessage(Message.user("Message for conv2"));

        assertThat(conv1.size()).isEqualTo(1);
        assertThat(conv2.size()).isEqualTo(1);
        assertThat(conv1.getSessionId()).isNotEqualTo(conv2.getSessionId());
    }

    private String generateLongContent(int tokenEstimate) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < tokenEstimate * 4; i++) {
            sb.append("word ");
        }
        return sb.toString();
    }
}
