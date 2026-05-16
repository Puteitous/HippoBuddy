package com.example.agent.core.di;

import java.lang.reflect.Constructor;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

public final class ServiceLocator {
    private static final Map<Class<?>, Object> SINGLETONS = new ConcurrentHashMap<>();
    private static final Map<Class<?>, Supplier<?>> PROVIDERS = new ConcurrentHashMap<>();
    private static final ThreadLocal<ArrayDeque<Class<?>>> INIT_STACK = ThreadLocal.withInitial(ArrayDeque::new);

    /**
     * 记录哪些类型是通过 registerSingleton() 显式注册的（而非 get() 自动创建）。
     * 用于检测 registerSingleton() 覆盖自动创建实例的潜在错误。
     */
    private static final Set<Class<?>> EXPLICITLY_REGISTERED = ConcurrentHashMap.newKeySet();
    private static volatile boolean FROZEN = false;

    private ServiceLocator() {}

    /**
     * 冻结 DI 容器，冻结后所有 registerSingleton() / registerProvider() 调用将抛出异常。
     * 用于启动阶段完成后锁定 DI 容器，防止后续误注册覆盖已有实例。
     */
    public static void freeze() {
        FROZEN = true;
    }

    /**
     * 返回 DI 容器是否已冻结。
     */
    public static boolean isFrozen() {
        return FROZEN;
    }

    public static <T> void registerSingleton(Class<T> type, T instance) {
        Objects.requireNonNull(type, "type cannot be null");
        Objects.requireNonNull(instance, "instance cannot be null");
        checkNotFrozen("registerSingleton(" + type.getName() + ")");

        Object existing = SINGLETONS.put(type, instance);
        if (existing != null && existing != instance && !EXPLICITLY_REGISTERED.contains(type)) {
            System.err.println(
                "╔══════════════════════════════════════════════════════════════════════════╗\n" +
                "║  ServiceLocator 检测到潜在的双实例问题！                              ║\n" +
                "╠══════════════════════════════════════════════════════════════════════════╣\n" +
                "║  类型: " + padRight(type.getName(), 58) + "║\n" +
                "║  ┌─ 旧实例（通过 get() 自动创建，可能已被其他类构造时捕获）            ║\n" +
                "║  └─ hashCode=" + System.identityHashCode(existing) + "                                              ║\n" +
                "║  ┌─ 新实例（通过 registerSingleton() 注册）                           ║\n" +
                "║  └─ hashCode=" + System.identityHashCode(instance) + "                                              ║\n" +
                "║  如果任何类在构造时从 ServiceLocator.get() 获取了旧实例，               ║\n" +
                "║  它们将永远持有旧引用，无法感知新注册的实例。                           ║\n" +
                "║  建议：在创建任何依赖此类型的组件之前，先完成 registerSingleton()       ║\n" +
                "╚══════════════════════════════════════════════════════════════════════════╝"
            );
        }
        EXPLICITLY_REGISTERED.add(type);
    }

    public static <T> void registerSingleton(Class<T> type) {
        Objects.requireNonNull(type, "type cannot be null");
        T instance = createInstance(type);
        registerSingleton(type, instance);
    }

    public static <T> void registerProvider(Class<T> type, Supplier<T> provider) {
        Objects.requireNonNull(type, "type cannot be null");
        Objects.requireNonNull(provider, "provider cannot be null");
        checkNotFrozen("registerProvider(" + type.getName() + ")");
        PROVIDERS.put(type, provider);
    }

    @SuppressWarnings("unchecked")
    public static <T> T get(Class<T> type) {
        Objects.requireNonNull(type, "type cannot be null");
        
        Object existing = SINGLETONS.get(type);
        if (existing != null) {
            return (T) existing;
        }
        
        if (INIT_STACK.get().contains(type)) {
            String chain = String.join(" → ", 
                INIT_STACK.get().stream()
                    .map(Class::getSimpleName)
                    .toList());
            throw new DIException("♻️ 检测到循环依赖!\n依赖链: " + chain + " → " + type.getSimpleName());
        }
        
        return (T) SINGLETONS.computeIfAbsent(type, k -> {
            INIT_STACK.get().push(type);
            try {
                Supplier<?> provider = PROVIDERS.get(k);
                if (provider != null) {
                    return provider.get();
                }
                return createInstance(type);
            } finally {
                INIT_STACK.get().pop();
                if (INIT_STACK.get().isEmpty()) {
                    INIT_STACK.remove();
                }
            }
        });
    }

    public static <T> T getOrDefault(Class<T> type, T defaultValue) {
        T instance = getOrNull(type);
        return instance != null ? instance : defaultValue;
    }

    @SuppressWarnings("unchecked")
    public static <T> T getOrNull(Class<T> type) {
        Object instance = SINGLETONS.get(type);
        if (instance != null) {
            return (T) instance;
        }
        Supplier<?> provider = PROVIDERS.get(type);
        return provider != null ? (T) provider.get() : null;
    }

    public static boolean isRegistered(Class<?> type) {
        return SINGLETONS.containsKey(type) || PROVIDERS.containsKey(type);
    }

    public static void clear() {
        SINGLETONS.clear();
        PROVIDERS.clear();
        EXPLICITLY_REGISTERED.clear();
        FROZEN = false;
    }

    public static int countSingletons() {
        return SINGLETONS.size();
    }

    private static void checkNotFrozen(String operation) {
        if (FROZEN) {
            throw new DIException(
                "DI 容器已冻结，禁止 " + operation + "。\n" +
                "所有依赖应在启动阶段通过 registerSingleton() 注册，启动完成后容器被冻结以防止误覆盖。\n" +
                "如果需要在运行时注册动态服务，请使用 registerProvider() 并在启动前完成注册。"
            );
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T createInstance(Class<T> type) {
        try {
            Constructor<?>[] constructors = type.getConstructors();
            for (Constructor<?> ctor : constructors) {
                Class<?>[] paramTypes = ctor.getParameterTypes();
                Object[] params = new Object[paramTypes.length];
                boolean canCreate = true;
                for (int i = 0; i < paramTypes.length; i++) {
                    params[i] = getOrNull(paramTypes[i]);
                    if (params[i] == null) {
                        canCreate = false;
                        break;
                    }
                }
                if (canCreate) {
                    return type.cast(ctor.newInstance(params));
                }
            }
            throw new DIException("No suitable constructor with resolvable dependencies for: " + type.getName());
        } catch (DIException e) {
            throw e;
        } catch (Exception e) {
            throw new DIException("Failed to create instance for: " + type.getName(), e);
        }
    }

    public static class DIException extends RuntimeException {
        public DIException(String message) {
            super(message);
        }

        public DIException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /**
     * 将字符串填充到指定宽度（用于警告信息对齐）
     */
    private static String padRight(String s, int width) {
        if (s == null) return " ".repeat(width);
        if (s.length() >= width) return s.substring(0, width);
        return s + " ".repeat(width - s.length());
    }
}