package com.example.agent.context;

import com.example.agent.llm.model.Message;
import com.example.agent.service.SimpleTokenEstimator;
import com.example.agent.service.TokenEstimator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("ContextWindow 压缩起点测试")
class ContextWindowStartIndexTest {

    private TokenEstimator tokenEstimator;
    private ContextWindow contextWindow;

    @BeforeEach
    void setUp() {
        tokenEstimator = new SimpleTokenEstimator();
        contextWindow = new ContextWindow(100000, tokenEstimator);
    }

    @Test
    @DisplayName("模型上下文从起点开始，但始终保留 system 消息")
    void effectiveMessagesStartFromBoundaryButKeepSystem() {
        Message system = Message.system("SYSTEM PROMPT");
        contextWindow.addMessage(system);
        contextWindow.addMessage(Message.user("old-1 " + "x".repeat(2000)));
        contextWindow.addMessage(Message.user("old-2 " + "x".repeat(2000)));
        int tokensBefore = contextWindow.getBudget().getCurrentTokens();

        contextWindow.setEffectiveStartIndex(3);
        contextWindow.addMessage(Message.user("handoff " + "y".repeat(100)));

        // UI 历史仍是全量
        assertEquals(4, contextWindow.getRawMessages().size());

        // 模型上下文 = system + 起点之后的消息
        List<Message> effective = contextWindow.getEffectiveMessages();
        assertEquals(2, effective.size());
        assertSame(system, effective.get(0));
        assertTrue(effective.get(1).getContent().startsWith("handoff"));

        // 预算只统计压缩后的上下文
        assertTrue(contextWindow.getBudget().getCurrentTokens() < tokensBefore);
    }

    @Test
    @DisplayName("replaceMessages 会把起点重置为 0")
    void replaceMessagesResetsStartIndex() {
        contextWindow.addMessage(Message.system("S"));
        contextWindow.addMessage(Message.user("old"));
        contextWindow.setEffectiveStartIndex(2);

        contextWindow.replaceMessages(List.of(Message.system("S"), Message.user("new")));

        assertEquals(0, contextWindow.getEffectiveStartIndex());
        assertEquals(2, contextWindow.getEffectiveMessages().size());
    }

    @Test
    @DisplayName("删除起点之前的消息会同步左移起点")
    void removeMessageBeforeStartShiftsIndex() {
        Message system = Message.system("S");
        contextWindow.addMessage(system);
        contextWindow.addMessage(Message.user("old"));
        contextWindow.addMessage(Message.user("handoff"));
        contextWindow.setEffectiveStartIndex(2);

        contextWindow.removeMessage(1);

        assertEquals(1, contextWindow.getEffectiveStartIndex());
        List<Message> effective = contextWindow.getEffectiveMessages();
        assertEquals(2, effective.size());
        assertSame(system, effective.get(0));
        assertEquals("handoff", effective.get(1).getContent());
    }
}
