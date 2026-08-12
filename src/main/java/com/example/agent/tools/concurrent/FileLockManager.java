package com.example.agent.tools.concurrent;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public class FileLockManager {

    private final ConcurrentHashMap<String, ReentrantLock> fileLocks = new ConcurrentHashMap<>();
    
    private static final FileLockManager INSTANCE = new FileLockManager();

    private FileLockManager() {
    }

    public static FileLockManager getInstance() {
        return INSTANCE;
    }

    /**
     * 可抛出受检异常的动作接口（用于在锁保护下执行可能失败的文件操作）。
     */
    @FunctionalInterface
    public interface LockedAction<T> {
        T run() throws Exception;
    }

    /**
     * 对一组文件路径按固定顺序加写锁后执行动作，执行完毕释放全部锁。
     * 路径先规范化、去重、排序，避免多个调用以不同顺序加锁导致死锁。
     */
    public <T> T withWriteLocks(List<String> filePaths, LockedAction<T> action) throws Exception {
        List<String> normalized = new ArrayList<>();
        for (String p : filePaths) {
            String n = normalizePath(p);
            if (!normalized.contains(n)) {
                normalized.add(n);
            }
        }
        normalized.sort(String::compareTo);

        List<ReentrantLock> acquired = new ArrayList<>();
        try {
            for (String n : normalized) {
                ReentrantLock lock = fileLocks.computeIfAbsent(n, k -> new ReentrantLock());
                lock.lock();
                acquired.add(lock);
            }
            return action.run();
        } finally {
            for (int i = acquired.size() - 1; i >= 0; i--) {
                acquired.get(i).unlock();
            }
        }
    }

    public <T> T withReadLock(String filePath, Supplier<T> action) {
        String normalizedPath = normalizePath(filePath);
        ReentrantLock lock = fileLocks.computeIfAbsent(normalizedPath, k -> new ReentrantLock());
        
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }

    public <T> T withWriteLock(String filePath, Supplier<T> action) {
        String normalizedPath = normalizePath(filePath);
        ReentrantLock lock = fileLocks.computeIfAbsent(normalizedPath, k -> new ReentrantLock());
        
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }

    public boolean tryAcquireLock(String filePath) {
        String normalizedPath = normalizePath(filePath);
        ReentrantLock lock = fileLocks.computeIfAbsent(normalizedPath, k -> new ReentrantLock());
        return lock.tryLock();
    }

    public void releaseLock(String filePath) {
        String normalizedPath = normalizePath(filePath);
        ReentrantLock lock = fileLocks.get(normalizedPath);
        if (lock != null && lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }

    public boolean isLocked(String filePath) {
        String normalizedPath = normalizePath(filePath);
        ReentrantLock lock = fileLocks.get(normalizedPath);
        return lock != null && lock.isLocked();
    }

    private String normalizePath(String filePath) {
        try {
            Path path = Paths.get(filePath).toAbsolutePath().normalize();
            return path.toString();
        } catch (Exception e) {
            return filePath;
        }
    }

    public void clear() {
        fileLocks.clear();
    }

    public int getLockCount() {
        return fileLocks.size();
    }
}
