/**
 * PreviewResizer - 预览面板拖拽分隔条(对齐旧版 .panel-resizer)
 *
 * 旧版 workspace-manager.js 通过 .panel-resizer 拖拽调整预览面板宽度,
 * 写入 CSS 变量并持久化到 localStorage。
 * 新版预览面板固定宽度,此处补齐拖拽能力:
 *  - mousedown 开始拖拽,宽度范围 360-960px
 *  - 拖拽时写 --preview-panel-width CSS 变量(纯 CSS 响应,无 re-render)
 *  - 松手后持久化到 localStorage(key: hippo-preview-width,新旧版记忆衔接)
 *  - 无预览标签时隐藏分隔条(对应 PreviewPanel 返回 null 的空态)
 */
import { useCallback, useEffect, useRef } from 'react';
import { usePreviewStore } from '@/stores/previewStore';
import { useAppStore } from '@/stores/appStore';
import './PreviewPanel.css';

/** 拖拽宽度范围 */
const MIN_WIDTH = 360;
const MAX_WIDTH = 960;
/** 宽度持久化 key */
const WIDTH_KEY = 'hippo-preview-width';

export function PreviewResizer() {
  const hasTabs = usePreviewStore((s) => s.tabs.length > 0);
  const panelLayout = useAppStore((s) => s.panelLayout);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  // 启动时恢复已保存的宽度(仅当尚未设置时)
  useEffect(() => {
    if (document.documentElement.style.getPropertyValue('--preview-panel-width')) return;
    try {
      const saved = localStorage.getItem(WIDTH_KEY);
      if (saved) {
        document.documentElement.style.setProperty('--preview-panel-width', saved + 'px');
      }
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const resizer = resizerRef.current;
    const panel = document.querySelector<HTMLElement>('.preview-panel');
    if (!panel) return;

    resizer?.classList.add('resizing');
    panel.classList.add('resizing');
    const startX = e.clientX;
    const startWidth = panel.offsetWidth;

    const onMove = (ev: MouseEvent) => {
      // 分隔条贴近预览面板的一侧:chat-left(预览在右)时是预览左边界 → -diff;
      // preview-left(预览在左)时是预览右边界 → +diff,保证朝分隔条方向拖拽面板变宽
      const diff = ev.clientX - startX;
      const w = Math.max(
        MIN_WIDTH,
        Math.min(
          MAX_WIDTH,
          panelLayout === 'chat-left' ? startWidth - diff : startWidth + diff,
        ),
      );
      document.documentElement.style.setProperty('--preview-panel-width', w + 'px');
    };

    const onUp = () => {
      resizer?.classList.remove('resizing');
      panel.classList.remove('resizing');
      const finalW = document.documentElement
        .style.getPropertyValue('--preview-panel-width')
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
  }, [panelLayout]);

  // 无打开文件时不显示分隔条(对应 PreviewPanel 空态)
  if (!hasTabs) return null;

  return (
    <div
      ref={resizerRef}
      className="preview-resizer"
      onMouseDown={handleMouseDown}
      aria-hidden="true"
    />
  );
}