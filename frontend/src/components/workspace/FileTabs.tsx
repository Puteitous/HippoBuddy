/**
 * FileTabs - 文件标签栏(React 声明式版,对齐旧版 command FileTabs.js 交互能力)
 *
 * 职责:
 *   1. 渲染打开的文件标签列表
 *   2. 标签激活 / 切换 / 关闭(含中键关闭)
 *   3. diff 模式标签带可视化区分
 *   4. 右键菜单(关闭当前/其他/右侧/全部、复制路径)
 *   5. 拖拽排序
 *   6. 滚轮横向滚动
 *   7. 脏标记(未保存改动圆点)
 *
 * 说明:状态(tabs/activePath)由 Zustand previewStore 承载,本组件保持"受控纯展示",
 *       交互仅分发回调,不持有标签数据(与旧版命令式持有 DOM Map 的方式不同)。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FileTab } from '@/types';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { useI18n } from '@/i18n';
import './FileTabs.css';

interface FileTabsProps {
  /** 当前打开的标签列表(顺序即展示顺序) */
  tabs: FileTab[];
  /** 当前激活的文件路径 */
  activePath: string | null;
  /** 点击标签切换 */
  onSelect: (path: string) => void;
  /** 关闭标签 */
  onClose: (path: string) => void;
  /** 关闭除指定外的所有标签 */
  onCloseOthers?: (path: string) => void;
  /** 关闭指定标签右侧的所有标签 */
  onCloseRight?: (path: string) => void;
  /** 关闭所有标签 */
  onCloseAll?: () => void;
  /** 拖拽排序:将 fromPath 移动到 toPath 前/后 */
  onReorder?: (fromPath: string, toPath: string, insertBefore: boolean) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
}

export function FileTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  onReorder,
}: FileTabsProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 右键菜单定位(显隐通过 path 是否为空判断)
  const [ctx, setCtx] = useState<ContextMenuState | null>(null);
  // 拖拽:被拖标签路径 + 目标标签 drop 位置(用于高亮指示)
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ path: string; before: boolean } | null>(null);

  // 点击其它位置 / 键盘 Esc 关闭右键菜单
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('contextmenu', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctx]);

  // 滚轮横向滚动(对齐旧版 wheel handler:纵向滚轮映射为横向位移)
  // 注意:React 在根容器上默认把 wheel/touch 注册为 passive 监听器,
  // 内部调用 preventDefault() 无效且会触发警告,因此用原生非被动监听绑定到容器上。
  // 依赖 hasTabs:空标签时提前 return 的容器没有 ref,需在出现标签时重新绑定。
  const hasTabs = tabs.length > 0;
  useEffect(() => {
    if (!hasTabs) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) === 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasTabs]);

  // 点击标签 → 把激活标签滚到标签栏可视区中间(点谁谁居中)。
  // 注意 distinction:文件树(FileTree)定位用 nearest 避免展开树时莫名滚动;标签栏是主动点击跳转,居中更醒目。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activePath) return;
    requestAnimationFrame(() => {
      if (!container.isConnected) return;
      const tabEl = container.querySelector<HTMLElement>('.file-tab.active');
      if (!tabEl) return;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tabEl.getBoundingClientRect();
      // 目标:激活标签中心对准标签栏可视区中心;并 clamp 到合法滚动范围边界
      const tabLeftRel = tabRect.left - containerRect.left;
      const targetLeft = container.scrollLeft + tabLeftRel - (containerRect.width - tabRect.width) / 2;
      const maxScroll = container.scrollWidth - containerRect.width;
      const clamped = Math.max(0, Math.min(maxScroll, targetLeft));
      if (Math.abs(clamped - container.scrollLeft) > 1) {
        container.scrollTo({ left: clamped, behavior: 'smooth' });
      }
    });
  }, [activePath, tabs]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    // 定位菜单,保证不超出视口(对齐旧版 _showContextMenu 边界处理)
    const menuW = 172;
    const menuH = 5 * 32 + 8;
    let left = e.clientX;
    let top = e.clientY;
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
    if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    setCtx({ x: left, y: top, path });
  }, []);

  const runCtxAction = useCallback(
    (action: string) => {
      const target = ctx?.path;
      if (!target) return;
      switch (action) {
        case 'close-current':
          onClose(target);
          break;
        case 'close-others':
          onCloseOthers?.(target);
          break;
        case 'close-right':
          onCloseRight?.(target);
          break;
        case 'close-all':
          onCloseAll?.();
          break;
        case 'copy-path':
          void navigator.clipboard.writeText(target).catch(() => {});
          break;
      }
      setCtx(null);
    },
    [ctx, onClose, onCloseOthers, onCloseRight, onCloseAll],
  );

  /** 拖拽:目标 drop 位置 */
  const handleDragOver = useCallback(
    (e: React.DragEvent, path: string) => {
      e.preventDefault();
      if (!dragPath || dragPath === path) {
        setDropTarget(null);
        return;
      }
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      setDropTarget((prev) =>
        prev && prev.path === path && prev.before === before ? prev : { path, before },
      );
    },
    [dragPath],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, path: string) => {
      e.preventDefault();
      const from = dragPath;
      setDragPath(null);
      setDropTarget(null);
      if (!from || from === path) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const insertBefore = e.clientX < rect.left + rect.width / 2;
      onReorder?.(from, path, insertBefore);
    },
    [dragPath, onReorder],
  );

  if (tabs.length === 0) {
    return <div className="file-tabs file-tabs-empty" />;
  }

  return (
    <div className="file-tabs" role="tablist" ref={containerRef}>
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        const isDragSource = dragPath === tab.path;
        const isDropBefore = dropTarget?.path === tab.path && dropTarget.before;
        const isDropAfter = dropTarget?.path === tab.path && !dropTarget.before;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            draggable
            className={[
              'file-tab',
              isActive ? 'active' : '',
              tab.mode === 'diff' ? 'is-diff' : 'is-preview',
              tab.dirty ? 'dirty' : '',
              isDragSource ? 'dragging' : '',
              isDropBefore ? 'drop-before' : '',
              isDropAfter ? 'drop-after' : '',
            ]
              .join(' ')
              .trim()}
            title={tab.path}
            onClick={() => onSelect(tab.path)}
            onAuxClick={(e) => {
              // 中键关闭(对齐旧版 auxclick button===1)
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.path);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.path)}
            onDragStart={(e) => {
              setDragPath(tab.path);
              e.dataTransfer.effectAllowed = 'move';
              // 隐藏默认半透明克隆
              const ghost = document.createElement('div');
              ghost.style.position = 'absolute';
              ghost.style.top = '-1000px';
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 0, 0);
              window.setTimeout(() => document.body.removeChild(ghost), 0);
            }}
            onDragEnd={() => {
              setDragPath(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => handleDragOver(e, tab.path)}
            onDrop={(e) => handleDrop(e, tab.path)}
          >
            <span className="file-tab-icon" aria-hidden>
              {tab.mode === 'diff' ? (
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h10" />
                  <path d="M3 8h7" />
                  <path d="M3 12h4" />
                  <path d="M11 10l3 2-3 2" />
                </svg>
              ) : tab.mode === 'web' ? (
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M1.5 8h13" />
                  <path d="M8 1.5c1.8 1.8 2.8 4 2.8 6.5S9.8 12.7 8 14.5c-1.8-1.8-2.8-4-2.8-6.5S6.2 3.3 8 1.5z" />
                </svg>
              ) : (
                <FileTypeIcon fileName={tab.name} size={12} />
              )}
            </span>
            <span className="file-tab-name">{tab.name}</span>
            {tab.mode === 'diff' && (
              <span className="file-tab-mode">diff</span>
            )}
            <button
              type="button"
              className="file-tab-close"
              aria-label={t('fileTabs.close')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        );
      })}

      {ctx && <FileTabsContextMenu ctx={ctx} onAction={runCtxAction} />}
    </div>
  );
}

/** 右键菜单(经 portal 渲染到 body,避免被 .file-tabs 的 overflow 裁剪) */
function FileTabsContextMenu({
  ctx,
  onAction,
}: {
  ctx: ContextMenuState;
  onAction: (action: string) => void;
}) {
  return createPortal(
    <div
      className="file-tabs-context-menu"
      style={{ left: ctx.x, top: ctx.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ctx-item" data-action="close-current" onClick={() => onAction('close-current')}>
        关闭当前
      </div>
      <div className="ctx-item" data-action="close-others" onClick={() => onAction('close-others')}>
        关闭其他
      </div>
      <div className="ctx-item" data-action="close-right" onClick={() => onAction('close-right')}>
        关闭右侧
      </div>
      <div className="ctx-separator" />
      <div className="ctx-item" data-action="close-all" onClick={() => onAction('close-all')}>
        关闭全部
      </div>
      <div className="ctx-separator" />
      <div className="ctx-item" data-action="copy-path" onClick={() => onAction('copy-path')}>
        复制路径
      </div>
    </div>,
    document.body,
  );
}
