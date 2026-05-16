package com.example.agent.core.di;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ServiceLocator 冻结机制测试")
class ServiceLocatorTest {

    @Nested
    @DisplayName("freeze() 后注册操作应抛出异常")
    class FreezeTests {

        @Test
        @DisplayName("freeze() 后 registerSingleton(type, instance) 抛出 DIException")
        void registerSingletonAfterFreezeThrows() {
            ServiceLocator.clear();
            ServiceLocator.freeze();

            assertThrows(ServiceLocator.DIException.class,
                () -> ServiceLocator.registerSingleton(String.class, "test"),
                "冻结后 registerSingleton 应抛出异常");
            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 后 registerSingleton(type) 抛出 DIException")
        void registerSingletonClassAfterFreezeThrows() {
            ServiceLocator.clear();
            ServiceLocator.freeze();

            assertThrows(ServiceLocator.DIException.class,
                () -> ServiceLocator.registerSingleton(StringBuilder.class),
                "冻结后 registerSingleton(Class) 应抛出异常");
            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 后 registerProvider() 抛出 DIException")
        void registerProviderAfterFreezeThrows() {
            ServiceLocator.clear();
            ServiceLocator.freeze();

            assertThrows(ServiceLocator.DIException.class,
                () -> ServiceLocator.registerProvider(Integer.class, () -> 42),
                "冻结后 registerProvider 应抛出异常");
            ServiceLocator.clear();
        }
    }

    @Nested
    @DisplayName("freeze() 后读取操作仍然正常")
    class ReadAfterFreezeTests {

        @Test
        @DisplayName("freeze() 后 get() 能获取已注册实例")
        void getAfterFreezeReturnsExisting() {
            ServiceLocator.clear();
            ServiceLocator.registerSingleton(String.class, "hello");
            ServiceLocator.freeze();

            assertEquals("hello", ServiceLocator.get(String.class),
                "冻结后 get() 应能读到已注册实例");
            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 后 getOrNull() 正常工作")
        void getOrNullAfterFreezeWorks() {
            ServiceLocator.clear();
            ServiceLocator.registerSingleton(String.class, "world");
            ServiceLocator.freeze();

            assertEquals("world", ServiceLocator.getOrNull(String.class),
                "冻结后 getOrNull() 应正常工作");
            assertNull(ServiceLocator.getOrNull(Integer.class),
                "冻结后 getOrNull() 对未注册类型应返回 null");
            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 后 isRegistered() 正常工作")
        void isRegisteredAfterFreezeWorks() {
            ServiceLocator.clear();
            ServiceLocator.registerSingleton(String.class, "test");
            ServiceLocator.freeze();

            assertTrue(ServiceLocator.isRegistered(String.class),
                "冻结后 isRegistered() 应正常判断");
            assertFalse(ServiceLocator.isRegistered(Integer.class),
                "冻结后 isRegistered() 对未注册类型应返回 false");
            ServiceLocator.clear();
        }
    }

    @Nested
    @DisplayName("clear() 重置冻结状态")
    class ClearResetsFreezeTests {

        @Test
        @DisplayName("freeze() 后 clear() 可再次注册")
        void clearAfterFreezeAllowsRegister() {
            ServiceLocator.clear();
            ServiceLocator.freeze();
            ServiceLocator.clear();

            assertDoesNotThrow(() -> ServiceLocator.registerSingleton(String.class, "test"),
                "clear() 后应能再次注册");
            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 后 clear() → isFrozen() 返回 false")
        void isFrozenAfterClearReturnsFalse() {
            ServiceLocator.clear();
            ServiceLocator.freeze();
            ServiceLocator.clear();

            assertFalse(ServiceLocator.isFrozen(), "clear() 后 isFrozen() 应返回 false");
            ServiceLocator.clear();
        }
    }

    @Nested
    @DisplayName("正常流程（未冻结）")
    class NormalFlowTests {

        @Test
        @DisplayName("未冻结时可以正常注册")
        void registerWorksWhenNotFrozen() {
            ServiceLocator.clear();

            assertDoesNotThrow(() -> {
                ServiceLocator.registerSingleton(String.class, "hello");
                assertEquals("hello", ServiceLocator.get(String.class));
            }, "未冻结时应能正常注册和读取");

            ServiceLocator.registerSingleton(Supplier.class, () -> "supplied");
            assertEquals("supplied", ServiceLocator.get(Supplier.class).get());

            ServiceLocator.clear();
        }

        @Test
        @DisplayName("freeze() 双次调用不抛异常")
        void doubleFreezeDoesNotThrow() {
            ServiceLocator.clear();

            assertDoesNotThrow(() -> {
                ServiceLocator.freeze();
                ServiceLocator.freeze();
            }, "双次 freeze() 调用不应抛异常");

            ServiceLocator.clear();
        }
    }
}
