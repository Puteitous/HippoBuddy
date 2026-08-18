/**
 * ChatNav - 会话内用户消息导航条
 *
 * 对标旧版 components/ChatNav.js。
 *
 * 功能:
 *  - 提取当前会话所有 user-role 消息,显示为左侧竖向 strip(最多 32 字符截断)
 *  - 点击某条 → 滚动到对应 MessageBubble 并使其顶部对齐消息容器顶部
 *  - 滚动时实时高亮当前可见的最近一条用户消息(顶部对齐判定)
 *  - 切换会话时清空并重建
 *
 * 阶段 3.7-1 简化:
 *  - 滚动监听用 raf 节流(对齐旧版 _onScroll)
 *  - 不再使用 MutationObserver,而是订阅 chatStore.messages 变化(React 自动响应)
 *  - active 高亮通过 getBoundingClientRect 比较消息容器位置,与旧版算法一致
 *
 * 集成位置:挂在 ChatPanel 内部消息区右侧的窄条(由 ChatPanel.css 控制)。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import type { Message } from '@/types';
import './ChatNav.css';

/** 单条用户消息在导航条中的渲染数据 */
interface NavItem {
  messageId: string;
  /** 截断后的预览文本(<=32 字符) */
  preview: string;
}

/** 用户消息预览最大字符数(对齐旧版) */
const PREVIEW_MAX_CHARS = 32;

function extractUserText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((p) => (p.type === 'text' ? p.text ?? '' : ''))
      .join('');
  }
  return '';
}

function truncatePreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_MAX_CHARS) return trimmed;
  return trimmed.slice(0, PREVIEW_MAX_CHARS) + '…';
}

interface ChatNavProps {
  /**
   * 消息容器 ref(用于滚动同步与 active 项判定)。
   * 通常为 ChatPanel 中 messagesContainerRef。
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatNav({ containerRef }: ChatNavProps) {
  const messages = useChatStore((s) => s.messages);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  /** 当前会话所有用户消息(按 messages 顺序) */
  const items: NavItem[] = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({
      messageId: m.id,
      preview: truncatePreview(extractUserText(m)),
    }));

  /** 滚动到指定用户消息 */
  const scrollToMessage = useCallback((messageId: string) => {
    const container = containerRef.current;
    if (!container) return;
    const row = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [containerRef]);

  /** 根据容器视口与消息项位置计算当前 active(顶部对齐判定) */
  const syncActive = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    let topmostId: string | null = null;
    let topmostTop = Infinity;

    for (const item of items) {
      const row = container.querySelector<HTMLElement>(`[data-message-id="${item.messageId}"]`);
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      // 跳过完全在容器上方或下方的
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
      const dist = rect.top - containerRect.top;
      if (dist < topmostTop) {
        topmostTop = dist;
        topmostId = item.messageId;
      }
    }
    if (topmostId && topmostId !== activeMessageId) {
      setActiveMessageId(topmostId);
    }
  }, [containerRef, items, activeMessageId]);

  /** 滚动事件回调(raf 节流) */
  const handleScroll = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncActive();
    });
  }, [syncActive]);

  // 绑定 / 解绑滚动监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    syncActive();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [containerRef, handleScroll, syncActive]);

  // 切换会话或消息列表变化后,重算 active
  useEffect(() => {
    syncActive();
  }, [messages, syncActive]);

  // active 变化时让对应导航条项可见(自动滚动)
  useEffect(() => {
    if (!activeMessageId) return;
    const el = itemRefs.current.get(activeMessageId);
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    if (itemRect.top < parentRect.top) {
      parent.scrollTo({
        top: parent.scrollTop - (parentRect.top - itemRect.top),
        behavior: 'smooth',
      });
    } else if (itemRect.bottom > parentRect.bottom) {
      parent.scrollTo({
        top: parent.scrollTop + (itemRect.bottom - parentRect.bottom),
        behavior: 'smooth',
      });
    }
  }, [activeMessageId]);

  if (items.length === 0) return null;

  return (
    <aside className="chat-nav-strip" aria-label="会话内用户消息导航">
      <div className="chat-nav-panel">
        <div className="chat-nav-items">
          {items.map((item) => {
            const isActive = item.messageId === activeMessageId;
            return (
              <div
                key={item.messageId}
                ref={(el) => {
                  itemRefs.current.set(item.messageId, el);
                }}
                className={`chat-nav-item${isActive ? ' active' : ''}`}
                title={item.preview}
                onClick={() => scrollToMessage(item.messageId)}
              >
                {item.preview || '(空消息)'}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
