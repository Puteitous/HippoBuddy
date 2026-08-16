package com.example.agent.domain.conversation;

import com.example.agent.service.TokenEstimatorFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 契约测试：System Prompt 会话内冻结。
 * <p>
 * 冻结语义：会话创建后 system prompt 不可变。LLM 服务端前缀缓存要求
 * 每次请求的 system 字段逐字节一致，运行中任何改写（切工作区/重启/
 * 规则变更/前端改 prompt）都会击穿缓存（曾观测到 cacheHitRate 96% → 6.7%）。
 * 本测试将"冻结"固化为编译期/测试期强制的不变式：二次 set 直接抛异常，
 * 未来任何代码想在会话存活期改写 prompt，会在测试期立刻暴露。
 * </p>
 */
class ConversationPromptFrozenTest {

    @Test
    @DisplayName("首次设置成功")
    void firstSetSucceeds() {
        Conversation conv = new Conversation(4000, TokenEstimatorFactory.getDefault(), "s1");
        conv.setSystemPrompt("你是一个助手");
        assertEquals("你是一个助手", conv.getSystemPrompt());
    }

    @Test
    @DisplayName("二次设置抛 IllegalStateException（冻结不变式）")
    void secondSetThrows() {
        Conversation conv = new Conversation(4000, TokenEstimatorFactory.getDefault(), "s1");
        conv.setSystemPrompt("原始 prompt");

        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> conv.setSystemPrompt("改写后的 prompt"),
            "会话创建后再次 setSystemPrompt 必须抛异常（冻结）");
        assertEquals("原始 prompt", conv.getSystemPrompt(),
            "冻结后 prompt 必须保持原值");
    }

    @Test
    @DisplayName("多次违规设置持续抛异常，prompt 保持首次值")
    void repeatedViolationKeepsOriginal() {
        Conversation conv = new Conversation(4000, TokenEstimatorFactory.getDefault(), "s1");
        conv.setSystemPrompt("prompt-A");

        assertThrows(IllegalStateException.class, () -> conv.setSystemPrompt("prompt-B"));
        assertThrows(IllegalStateException.class, () -> conv.setSystemPrompt("prompt-C"));
        assertEquals("prompt-A", conv.getSystemPrompt());
    }

    @Test
    @DisplayName("首次 set null 也视为已设置并冻结（后续 set 抛异常）")
    void firstNullSetStillFreezes() {
        Conversation conv = new Conversation(4000, TokenEstimatorFactory.getDefault(), "s1");
        conv.setSystemPrompt(null);

        assertThrows(IllegalStateException.class,
            () -> conv.setSystemPrompt("late prompt"),
            "首次 null 设置后同样冻结");
    }
}
