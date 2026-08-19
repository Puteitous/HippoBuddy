/**
 * SidebarResizer - 左侧会话面板拖拽分隔条
 *
 * 对齐旧版 workspace-manager.js 中 sessionResizer 的逻辑:
 *  - mousedown 开始拖拽,宽度范围 180-500px
 *  - 拖拽时给 .sidebar 加 .resizing 取消过渡,避免卡顿
 *  - 拖拽即自动展开(移除 hidden)
 *  - 宽度写入 --session-panel-width CSS 变量(纯 CSS 响应,无 re-render)
 *  - 松手后持久化到 localStorage(key: hippo-session-width,与旧版一致,
 *    实现新旧版宽度记忆无缝衔接)
 *
 * 集成位置:AppShell 中 Sidebar 与 main 之间。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import './Sidebar.css';

/** 拖拽宽度范围(对齐旧版) */
const MIN_WIDTH = 180;
const MAX_WIDTH = 500;
/** 宽度持久化 key(对齐旧版,与 static/js/workspace-manager.js 一致) */
const WIDTH_KEY = 'hippo-session-width';

export function SidebarResizer() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  // 启动时恢复已保存的宽度(仅当尚未设置时,避免覆盖拖拽中的值)
  useEffect(() => {
    if (document.documentElement.style.getPropertyValue('--session-panel-width')) return;
    try {
      const saved = localStorage.getItem(WIDTH_KEY);
      if (saved) {
        document.documentElement.style.setProperty('--session-panel-width', saved + 'px');
      }
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const resizer = resizerRef.current;
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) return;

    resizer?.classList.add('resizing');
    sidebar.classList.add('resizing');
    const startX = e.clientX;
    const startWidth = sidebar.offsetWidth;

    const onMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX; // 拖右为正,拖左为负
      const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + diff));
      // 拖拽即自动展开(对齐旧版)
      sidebar.classList.remove('hidden');
      document.documentElement.style.setProperty('--session-panel-width', w + 'px');
    };

    const onUp = () => {
      resizer?.classList.remove('resizing');
      sidebar.classList.remove('resizing');
      const finalW = document.documentElement
        .style.getPropertyValue('--session-panel-width')
        .replace('px', '')
        .trim();
      if (finalW) {
        try {
          localStorage.setItem(WIDTH_KEY, finalW);
        } catch {
          /* localStorage 不可用时静默降级 */
        }
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // 折叠时隐藏分隔条(对齐旧版 .sidebar-area:has(.session-panel.hidden) + .session-resizer)
  if (collapsed) return null;

  return (
    <div
      ref={resizerRef}
      className="sidebar-resizer"
      onMouseDown={handleMouseDown}
      aria-hidden="true"
    />
  );
}
