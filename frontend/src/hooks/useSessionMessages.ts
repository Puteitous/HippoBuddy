/**
 * useSessionMessages - 历史消息加载 Hook
 *
 * 行为:
 *  - 监听 currentSessionId 变化
 *  - 目标会话已有内存流式分区(chatStore.sessionStreams)时:直接复用,不重置不加载,
 *    使「切回正在流式的会话」能无缝续看实时进度(该会话的 SSE 一直在后台写入分区)。
 *  - 目标会话无分区时:初始化空分区,再从缓存(localStorage)/后端加载历史。
 *  - 切走时:空闲分区不立即删除,按 TTL + LRU 回收(见下方常量),使快速来回切
 *    会话时能命中内存、不重复请求历史;活跃流会话始终保留以便切回续看。
 *
 * 设计意图:
 *  - 流式状态按会话分区后,切会话不再需要 reset 清空全局流式缓冲(旧行为会丢失
 *    正在流式会话的进度并造成跨会话串扰),切换副作用集中在此处理。
 *  - 即使切到 Settings 视图,本 Hook 仍由 AppShell 调用,会话切换的副作用不会丢。
 */
import { useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { emit } from '@/utils/eventBus';

/** 空闲会话的内存分区保留时长:期间切回直接复用,不重新拉历史 */
const IDLE_PARTITION_TTL_MS = 5 * 60 * 1000;
/** 最多保留的空闲分区数量(不含当前会话与活跃流会话),超出按最久未用淘汰 */
const MAX_IDLE_PARTITIONS = 4;

export function useSessionMessages(): void {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const resetSessionStream = useChatStore((s) => s.resetSessionStream);
  const hasActiveStream = useChatStore((s) => s.hasActiveStream);
  const setMessages = useChatStore((s) => s.setMessages);
  const setError = useChatStore((s) => s.setError);
  const setIsLoadingMessages = useChatStore((s) => s.setIsLoadingMessages);
  const getCachedMessages = useChatStore((s) => s.getCachedMessages);
  /** 每个会话最后一次成为当前会话的时间(TTL 与 LRU 淘汰依据) */
  const lastUsedAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // 切走即中断未完成的请求,快速连切时只让最后一次请求真正落地
    const controller = new AbortController();
    const now = Date.now();
    if (currentSessionId) lastUsedAtRef.current.set(currentSessionId, now);

    // 切走时的分区回收:不立即删除(切回可直接复用内存),只清理超过 TTL 的
    // 空闲分区;空闲分区数量超过上限时按最久未用淘汰。活跃流分区始终保留。
    const streams = useChatStore.getState().sessionStreams;
    const idle: Array<{ id: string; at: number }> = [];
    for (const id of Object.keys(streams)) {
      if (id === currentSessionId || hasActiveStream(id)) continue;
      const at = lastUsedAtRef.current.get(id) ?? now;
      lastUsedAtRef.current.set(id, at);
      if (now - at > IDLE_PARTITION_TTL_MS) {
        resetSessionStream(id);
        lastUsedAtRef.current.delete(id);
        continue;
      }
      idle.push({ id, at });
    }
    if (idle.length > MAX_IDLE_PARTITIONS) {
      idle.sort((a, b) => a.at - b.at);
      for (const { id } of idle.slice(0, idle.length - MAX_IDLE_PARTITIONS)) {
        resetSessionStream(id);
        lastUsedAtRef.current.delete(id);
      }
    }

    if (!currentSessionId) {
      // hero 空态:无选中会话,无需加载
      return;
    }

    // 目标会话已有内存分区(含活跃流或已固化消息)→ 直接复用,不重置不加载。
    // 这正是"切回正在流式的会话"的关键:分区内是 SSE 后台持续写入的最新状态,
    // 渲染层(useSessionStream)立即读到,实时续看。
    const hasStreamState = !!useChatStore.getState().sessionStreams[currentSessionId];
    if (hasStreamState) {
      setError(null);
      return;
    }

    // 无内存分区:初始化空分区,并从缓存/后端加载历史
    setError(null);
    // 命中缓存:立即展示历史,免除请求等待;仍走后台刷新对齐后端最新数据。
    const cached = getCachedMessages(currentSessionId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setIsLoadingMessages(false);
    } else {
      setIsLoadingMessages(true);
    }

    (async () => {
      try {
        const data = await api.sessions.getMessages(currentSessionId, controller.signal);
        if (cancelled) return;
        // 后端 JSONL 不含前端固化的 roundElapsedMs,用本地缓存按消息 id 回填,
        // 保住重启后回看历史的精确耗时;匹配不到(缓存被清/rewind·fork 重写)
        // 时保留后端原值,HistoryRenderer 回退 timestamp 首尾差近似值。
        if (cached && cached.length > 0) {
          const cachedById = new Map(cached.map((m) => [m.id, m]));
          for (const m of data) {
            if (m.roundElapsedMs == null) {
              const cm = cachedById.get(m.id);
              if (cm?.roundElapsedMs != null && Number.isFinite(cm.roundElapsedMs) && cm.roundElapsedMs > 0) {
                m.roundElapsedMs = cm.roundElapsedMs;
              }
            }
          }
        }
        setMessages(data);
        // 后端 getMessages 已在返回前同步执行 loadSessionChanges(sessionId),
        // 此时该会话的变更数据已加载进内存。发出信号让依赖该数据的组件
        // (如 FileChangesMonitor) 刷新,而非与其并发请求造成竞态。
        emit('session:messages-loaded', { sessionId: currentSessionId });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setError(msg);
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentSessionId, resetSessionStream, hasActiveStream, setMessages, setError, setIsLoadingMessages, getCachedMessages]);
}
