package com.example.agent.core.blocker;

/**
 * 请求上下文，用于标识当前执行环境的类型
 */
public class RequestContext {

    private static final ThreadLocal<ContextType> currentContext = ThreadLocal.withInitial(() -> ContextType.CLI);

    public enum ContextType {
        CLI,      // 命令行界面
        WEB       // Web API 界面
    }

    /**
     * 设置当前请求上下文类型
     */
    public static void set(ContextType context) {
        currentContext.set(context);
    }

    /**
     * 获取当前请求上下文类型
     */
    public static ContextType get() {
        return currentContext.get();
    }

    /**
     * 判断当前是否是 Web 请求上下文
     */
    public static boolean isWeb() {
        return currentContext.get() == ContextType.WEB;
    }

    /**
     * 判断当前是否是 CLI 请求上下文
     */
    public static boolean isCli() {
        return currentContext.get() == ContextType.CLI;
    }

    /**
     * 清除当前线程的上下文（避免内存泄漏）
     */
    public static void clear() {
        currentContext.remove();
    }

    /**
     * 在指定的上下文环境中执行任务
     */
    public static <T> T runInContext(ContextType context, java.util.function.Supplier<T> task) {
        ContextType previous = currentContext.get();
        try {
            currentContext.set(context);
            return task.get();
        } finally {
            currentContext.set(previous);
        }
    }

    /**
     * 在 Web 上下文环境中执行任务
     */
    public static <T> T runInWebContext(java.util.function.Supplier<T> task) {
        return runInContext(ContextType.WEB, task);
    }

    /**
     * 在 CLI 上下文环境中执行任务
     */
    public static <T> T runInCliContext(java.util.function.Supplier<T> task) {
        return runInContext(ContextType.CLI, task);
    }
}
