package com.example.agent.web.orchestrator;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Usage;
import com.example.agent.tools.ToolRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * {@link WebAgentOrchestrator#shouldWarnOnCacheHitRate} 契约测试。
 * <p>
 * 告警语义（双路判定，任一触发即告警）：
 * <ul>
 *   <li>绝对低值：命中率严格低于阈值（默认 40%）；</li>
 *   <li>相对突降：上次命中率正常（≥ 阈值）时，本次较上次下跌 ≥ 40pp</li>
 *   <li>usage 为空或 cacheRead==0（新会话首轮无历史前缀可命中）不告警，避免首轮误报</li>
 * </ul>
 * </p>
 */
class CacheHitRateWarnTest {

    /** 与生产常量一致：绝对低值阈值 */
    private static final double THRESHOLD = 40.0;

    /** 与生产常量一致：相对突降阈值（百分点） */
    private static final double DROP_PP = 40.0;

    @BeforeEach
    void setUp() {
        // WebAgentOrchestrator 静态初始化（INSTANCE）依赖 DI 容器，先注册 mock 使类可加载
        ServiceLocator.clear();
        ServiceLocator.registerSingleton(LlmClient.class, mock(LlmClient.class));
        ServiceLocator.registerSingleton(ToolRegistry.class, new ToolRegistry());
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    private Usage usage(int promptTokens, int cacheHitTokens) {
        Usage u = new Usage();
        u.setPromptTokens(promptTokens);
        u.setPromptCacheHitTokens(cacheHitTokens);
        return u;
    }

    /** 便捷断言入口：命中率 = hit/prompt*100，lastRate 为上次命中率（0=无历史） */
    private boolean warn(int promptTokens, int cacheHitTokens, double lastRate) {
        return WebAgentOrchestrator.shouldWarnOnCacheHitRate(
            usage(promptTokens, cacheHitTokens), THRESHOLD, lastRate, DROP_PP);
    }

    // ---------- 基础过滤 ----------

    @Test
    @DisplayName("usage 为空不告警")
    void nullUsage_neverWarns() {
        assertFalse(WebAgentOrchestrator.shouldWarnOnCacheHitRate(null, THRESHOLD, 96.0, DROP_PP));
    }

    @Test
    @DisplayName("cacheRead==0（新会话首轮无前缀可命中）不告警")
    void zeroCacheRead_neverWarns() {
        // 命中率本身是 0，但无缓存可命中属正常，不告警
        assertFalse(warn(5000, 0, 96.0));
    }

    // ---------- 绝对低值判定 ----------

    @Test
    @DisplayName("高命中率（95%）不告警")
    void highHitRate_doesNotWarn() {
        assertFalse(warn(1000, 950, 96.0));
    }

    @Test
    @DisplayName("低命中率（6.7%，复现历史击穿场景）告警")
    void lowHitRate_warns() {
        // 实测击穿场景：prompt=48113, cacheHit=3200 → 6.65%
        assertTrue(warn(48113, 3200, 96.0));
    }

    @Test
    @DisplayName("命中率恰好等于阈值不告警（严格小于）")
    void exactlyAtThreshold_doesNotWarn() {
        assertFalse(warn(1000, 400, 0.0));
    }

    @Test
    @DisplayName("命中率略低于阈值告警")
    void justBelowThreshold_warns() {
        assertTrue(warn(1000, 399, 0.0));
    }

    @Test
    @DisplayName("自定义阈值生效（阈值 80%，95% 命中不告警）")
    void customThreshold_respected() {
        assertFalse(WebAgentOrchestrator.shouldWarnOnCacheHitRate(usage(1000, 950), 80.0, 0.0, DROP_PP));
    }

    // ---------- 相对突降判定 ----------

    @Test
    @DisplayName("上次 96% 本次 50%（跌 46pp，未跌破绝对线）仍告警")
    void suddenDrop_warns() {
        // 50% > 40% 绝对不触发，但 96-50=46pp ≥ 40pp，突降触发
        assertTrue(warn(1000, 500, 96.0));
    }

    @Test
    @DisplayName("上次 96% 本次 60%（跌 36pp，未达突降线）不告警")
    void smallDrop_doesNotWarn() {
        assertFalse(warn(1000, 600, 96.0));
    }

    @Test
    @DisplayName("恰好下跌 40pp（96% → 56%）告警（≥ 边界）")
    void dropExactlyAtThreshold_warns() {
        assertTrue(warn(1000, 560, 96.0));
    }

    @Test
    @DisplayName("上次已低于阈值（30%）时不走突降判定（避免低位重复报警）")
    void lastRateBelowThreshold_skipsDropCheck() {
        // 45% 未跌破绝对线，30→45 是上升；突降分支因上次 < 阈值被跳过 → 不告警
        assertFalse(warn(1000, 450, 30.0));
    }

    @Test
    @DisplayName("首次响应（无上次记录 lastRate=0）只看绝对判定，不做突降")
    void noHistory_onlyAbsoluteCheck() {
        // 60% 高于绝对线；lastRate=0 跳过突降 → 不告警
        assertFalse(warn(1000, 600, 0.0));
    }
}
