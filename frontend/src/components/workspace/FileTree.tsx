/**
 * FileTree - 工作区文件树(对齐旧版 FileTree.js 核心能力)
 *
 * 职责:
 *   1. 调用 desktopBridge.readDir 加载目录条目(Electron / JCEF / dev 降级)
 *   2. 递归渲染树节点(目录可展开/折叠,展开状态持久化到 localStorage)
 *   3. 点击文件 → onFileSelect 回调(由宿主打开 tab)
 *   4. Git 状态徽标(M/A/D,数据来自 /api/git/status)
 *   5. 右键菜单:新建文件/文件夹、重命名、删除、复制绝对/相对路径、
 *      在资源管理器中显示、在终端中打开
 *   6. 刷新(保留展开 + 高亮,refreshToken 变化时重载)、折叠全部
 *
 * 尚未对齐(留后续):拖拽移动、紧凑目录链合并(a › b › c)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { desktopBridge } from '@/utils/desktop-bridge';
import { getJson } from '@/api/http';
import { showToast } from '@/utils/toastStore';
import { FileIcon } from '../FileIcon';
import { FileTypeIcon } from '../FileTypeIcon';
import './FileTree.css';

interface FileTreeProps {
  /** 工作区根路径(绝对) */
  rootPath: string;
  /** 文件点击回调 */
  onFileSelect: (filePath: string) => void;
  /** 当前激活的文件路径(高亮) */
  activePath?: string | null;
  /** 外部触发刷新(工作区变更等),自增即重载 */
  refreshToken?: number;
}

/** 展开状态持久化 key(按 rootPath 分别保存,对齐旧版会话级持久化) */
const EXPANDED_KEY = 'hippo-file-tree-expanded';

function readExpanded(rootPath: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '{}');
    if (raw && typeof raw === 'object' && Array.isArray(raw[rootPath])) {
      return new Set<string>(raw[rootPath]);
    }
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return new Set();
}

function persistExpanded(rootPath: string, dirs: Set<string>): void {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '{}');
    raw[rootPath] = [...dirs];
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(raw));
  } catch {
    /* 忽略 */
  }
}

/** Git 状态数据(相对路径 → 状态) */
interface GitStatus {
  available: boolean;
  files: Record<string, string>;
}

export function FileTree({ rootPath, onFileSelect, activePath, refreshToken }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** 展开的目录集合(顶层管理,便于持久化 / 折叠全部 / 刷新保留) */
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => readExpanded(rootPath));
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  /** 刷新版本:变化时已展开目录重新加载子项 */
  const [treeVersion, setTreeVersion] = useState(0);
  /** 右键菜单 / 弹窗状态 */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  /** 树内拖放移动:当前高亮的目标目录(仅目录节点为拖放目标) */
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  /** 待确认的移动(拖放落点后弹窗确认,防误触) */
  const [pendingMove, setPendingMove] = useState<PendingMoveState | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 记录上次 rootPath,判断是否发生了路径切换(避免刷新时闪烁) */
  const prevRootRef = useRef<string | null>(null);

  // ── 根目录加载(路径变化 / 内部刷新 / 外部 refreshToken 变化时) ──
  useEffect(() => {
    const rootChanged = prevRootRef.current !== rootPath;
    prevRootRef.current = rootPath;
    if (rootChanged) {
      // 仅路径切换时重置加载态;刷新保留旧内容避免闪烁
      setLoading(true);
      setError(null);
      setRootEntries(null);
    }
    if (!rootPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await desktopBridge.readDir(rootPath);
      if (cancelled) return;
      if (entries === null) {
        setError('无法读取目录(桌面端桥接未注入或路径不可访问)');
        setRootEntries(null);
      } else {
        setRootEntries(sortEntries(entries));
      }
      setLoading(false);
    })();
    // 并行拉取 git status
    (async () => {
      try {
        const data = await getJson<GitStatus>(
          `/api/git/status?path=${encodeURIComponent(rootPath)}`,
        );
        if (!cancelled) setGitStatus(data);
      } catch {
        if (!cancelled) setGitStatus({ available: false, files: {} });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootPath, treeVersion, refreshToken]);

  const handleRefresh = useCallback(() => {
    setTreeVersion((v) => v + 1);
  }, []);

  const handleCollapseAll = useCallback(() => {
    setExpandedDirs(new Set());
    persistExpanded(rootPath, new Set());
    // 清空展开后不需要重载数据,但滚动区内容不变;直接清展开即可
    setTreeVersion((v) => v + 1);
  }, [rootPath]);

  /** 确认树内移动(拖放落点 → ConfirmDialog 确认后 rename + 刷新) */
  const handleConfirmMove = useCallback(
    async (confirmed: boolean) => {
      if (!pendingMove) return;
      const { sourcePath, destPath, fileName } = pendingMove;
      setPendingMove(null);
      if (!confirmed) return;
      const ok = await desktopBridge.rename(sourcePath, destPath);
      if (ok) {
        showToast(`已移动: ${fileName}`, { type: 'success' });
        setTreeVersion((v) => v + 1);
      } else {
        showToast('移动失败(目标目录可能已存在同名项或无权限)', { type: 'error' });
      }
    },
    [pendingMove],
  );

  // ── 展开/折叠目录 ──────────────────────────────────────────
  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) next.delete(dirPath);
        else next.add(dirPath);
        persistExpanded(rootPath, next);
        return next;
      });
    },
    [rootPath],
  );

  // ── 右键菜单项处理 ─────────────────────────────────────────
  const handleContextAction = useCallback(
    (action: string) => {
      if (!ctxMenu) return;
      const targetPath = ctxMenu.path;
      const isDir = ctxMenu.isDir;
      setCtxMenu(null);

      switch (action) {
        case 'new-file':
        case 'new-folder': {
          const isFile = action === 'new-file';
          const baseDir = isDir ? targetPath : parentOf(targetPath);
          setInputDialog({
            title: isFile ? '新建文件' : '新建文件夹',
            label: isFile ? '文件名称' : '文件夹名称',
            hint: isFile ? '将创建在: ' + baseDir : '将创建在: ' + baseDir,
            placeholder: isFile ? 'index.js' : 'my-folder',
            onSubmit: async (name) => {
              const newPath = joinPath(baseDir, name);
              const ok = isFile
                ? await desktopBridge.createFile(newPath)
                : await desktopBridge.createDir(newPath);
              if (ok) {
                showToast(`${isFile ? '文件' : '文件夹'}已创建: ${name}`, { type: 'success' });
                setTreeVersion((v) => v + 1);
              } else {
                showToast('创建失败(可能已存在或无权限)', { type: 'error' });
              }
            },
          });
          break;
        }
        case 'rename': {
          const oldName = basename(targetPath);
          setInputDialog({
            title: '重命名',
            label: '新名称',
            value: oldName,
            onSubmit: async (newName) => {
              if (newName === oldName) return;
              const parentPath = parentOf(targetPath);
              const newPath = joinPath(parentPath, newName);
              const ok = await desktopBridge.rename(targetPath, newPath);
              if (ok) {
                showToast('已重命名为: ' + newName, { type: 'success' });
                setTreeVersion((v) => v + 1);
              } else {
                showToast('重命名失败(可能已存在或无权限)', { type: 'error' });
              }
            },
          });
          break;
        }
        case 'delete': {
          setConfirmDialog({
            title: '删除' + (isDir ? '文件夹' : '文件'),
            message: `确认删除 <strong>${basename(targetPath)}</strong> 吗?`,
            note: '此操作不可撤销,将永久删除。',
            onSubmit: async (confirmed) => {
              if (!confirmed) return;
              const ok = await desktopBridge.deleteFile(targetPath);
              if (ok) {
                showToast('已删除: ' + basename(targetPath), { type: 'success' });
                setTreeVersion((v) => v + 1);
              } else {
                showToast('删除失败', { type: 'error' });
              }
            },
          });
          break;
        }
        case 'copy-absolute': {
          void copyToClipboard(targetPath);
          break;
        }
        case 'copy-relative': {
          const relative =
            rootPath && targetPath.startsWith(rootPath + '/')
              ? targetPath.slice(rootPath.length + 1)
              : targetPath;
          void copyToClipboard(relative);
          break;
        }
        case 'show-in-explorer': {
          void desktopBridge.showItemInFolder(targetPath);
          break;
        }
        case 'open-in-terminal': {
          const termDir = isDir ? targetPath : parentOf(targetPath);
          void desktopBridge.openTerminal(termDir);
          break;
        }
      }
    },
    [ctxMenu, rootPath],
  );

  // ── 点击外部 / Esc 关闭右键菜单 ────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      const el = document.querySelector('.file-tree-context-menu');
      if (e instanceof MouseEvent && el && el.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onDown);
    };
  }, [ctxMenu]);

  // 拖放结束(无论落在何处)清除目录高亮,避免残留 drag-over 类
  useEffect(() => {
    const onEnd = () => setDragOverPath(null);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', onEnd);
    return () => {
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', onEnd);
    };
  }, []);

  // ── 渲染分支 ──────────────────────────────────────────────
  let body: ReactNode;
  if (!rootPath) {
    body = <div className="file-tree-empty"><span>未设置工作区</span></div>;
  } else if (loading) {
    body = <div className="file-tree-loading"><span>加载中…</span></div>;
  } else if (error) {
    body = (
      <div className="file-tree-error">
        <p>{error}</p>
        <button type="button" onClick={handleRefresh}>重试</button>
      </div>
    );
  } else if (!rootEntries || rootEntries.length === 0) {
    body = <div className="file-tree-empty"><span>空目录</span></div>;
  } else {
    body = (
      <ul className="file-tree-list" role="tree">
        {rootEntries.map((entry) => (
          <FileTreeNode
            key={joinPath(rootPath, entry.name)}
            rootPath={rootPath}
            entry={entry}
            depth={0}
            expandedDirs={expandedDirs}
            onToggle={toggleDir}
            activePath={activePath}
            onFileSelect={onFileSelect}
            gitFiles={gitStatus?.available ? gitStatus.files : undefined}
            treeVersion={treeVersion}
            dragOverPath={dragOverPath}
            onDragOverChange={setDragOverPath}
            onMoveTo={setPendingMove}
            onContextMenu={(e, path, isDir) => {
              e.preventDefault();
              const menuW = 210;
              const menuH = 260;
              let left = e.clientX;
              let top = e.clientY;
              if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
              if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
              setCtxMenu({ x: Math.max(4, left), y: Math.max(4, top), path, isDir });
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="file-tree" ref={containerRef}>
      <div className="file-tree-header">
        <span className="file-tree-root-name" title={rootPath}>
          {basename(rootPath) || rootPath}
        </span>
        <div className="file-tree-header-actions">
          <button
            type="button"
            className="file-tree-refresh-btn"
            onClick={handleCollapseAll}
            title="折叠全部"
            aria-label="折叠全部"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 5.5L8 1l4.5 4.5" />
              <path d="M3.5 11.5L8 7l4.5 4.5" />
            </svg>
          </button>
          <button
            type="button"
            className="file-tree-refresh-btn"
            onClick={handleRefresh}
            title="刷新"
            aria-label="刷新"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 8a5 5 0 1 1-1.5-3.5" />
              <polyline points="13 3 13 6 10 6" />
            </svg>
          </button>
        </div>
      </div>
      {body}

      {/* 右键菜单:挂到 body,避免被 .sidebar 的 contain:layout 变成定位包含块后偏离视口 */}
      {ctxMenu &&
        createPortal(
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onAction={handleContextAction} />,
          document.body,
        )}

      {/* 输入弹窗(新建 / 重命名):挂到 body,避免被 .sidebar 的 contain:layout 限定为侧边栏内遮罩 */}
      {inputDialog &&
        createPortal(
          <InputDialog {...inputDialog} onClose={() => setInputDialog(null)} />,
          document.body,
        )}

      {/* 确认弹窗(删除):同样挂到 body */}
      {confirmDialog &&
        createPortal(
          <ConfirmDialog {...confirmDialog} onClose={() => setConfirmDialog(null)} />,
          document.body,
        )}

      {/* 移动确认弹窗(拖放落点后确认,防误触) */}
      {pendingMove &&
        createPortal(
          <ConfirmDialog
            title="移动"
            message={`确认将 <strong>${escapeHtml(pendingMove.fileName)}</strong> 移动到 <strong>${escapeHtml(basename(parentOf(pendingMove.destPath)))}</strong> 吗?`}
            note="移动后立即刷新文件树,此操作可撤销。"
            confirmLabel="移动"
            onSubmit={handleConfirmMove}
            onClose={() => setPendingMove(null)}
          />,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// 内部节点组件
// ============================================================================

interface FileTreeNodeProps {
  rootPath: string;
  entry: DirEntry;
  depth: number;
  expandedDirs: Set<string>;
  onToggle: (dirPath: string) => void;
  activePath?: string | null;
  onFileSelect: (filePath: string) => void;
  gitFiles?: Record<string, string>;
  treeVersion: number;
  /** 当前高亮的目标目录路径(树内拖放) */
  dragOverPath: string | null;
  /** 更新高亮目标目录 */
  onDragOverChange: (path: string | null) => void;
  /** 拖放落点:请求移动(source → dest) */
  onMoveTo: (move: PendingMoveState) => void;
  onContextMenu: (
    e: ReactMouseEvent,
    path: string,
    isDir: boolean,
  ) => void;
}

function FileTreeNode({
  rootPath,
  entry,
  depth,
  expandedDirs,
  onToggle,
  activePath,
  onFileSelect,
  gitFiles,
  treeVersion,
  dragOverPath,
  onDragOverChange,
  onMoveTo,
  onContextMenu,
}: FileTreeNodeProps) {
  const fullPath = joinPath(rootPath, entry.name);
  const isDir = entry.isDirectory;
  const expanded = expandedDirs.has(fullPath);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(false);

  // 展开时懒加载子目录;treeVersion 变化时已展开目录重新加载
  useEffect(() => {
    if (!isDir || !expanded) return;
    let cancelled = false;
    setChildrenLoading(true);
    (async () => {
      const entries = await desktopBridge.readDir(fullPath);
      if (cancelled) return;
      setChildren(entries ? sortEntries(entries) : []);
      setChildrenLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDir, expanded, fullPath, treeVersion]);

  const isActive = activePath === fullPath;
  const relativePath = rootPath && fullPath.startsWith(rootPath + '/')
    ? fullPath.slice(rootPath.length + 1)
    : fullPath;
  const status = gitFiles ? gitFiles[relativePath] : undefined;
  const indentStyle = useMemo(() => ({ paddingLeft: `${depth * 14 + 8}px` }), [depth]);

  const handleClick = useCallback(() => {
    if (isDir) onToggle(fullPath);
    else onFileSelect(fullPath);
  }, [isDir, fullPath, onToggle, onFileSelect]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // 文件与文件夹均可拖入输入框生成引用芯片(对齐旧版 FileTree.js)
      e.dataTransfer.setData('text/plain', fullPath);
      e.dataTransfer.setData('text/x-hippo-type', isDir ? 'directory' : 'file');
      e.dataTransfer.effectAllowed = 'copyMove';
    },
    [isDir, fullPath],
  );

  // 目录作为拖放目标:允许落点,设置高亮(仅目录)
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDir) return;
      // 只有携带路径的拖拽才视为移动意图,避免干扰其他拖放
      if (e.dataTransfer.types && !Array.from(e.dataTransfer.types).includes('text/plain')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      onDragOverChange(fullPath);
    },
    [isDir, fullPath, onDragOverChange],
  );

  // 移出目标目录(未进入其子节点)时清除高亮
  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      const to = e.relatedTarget as Node | null;
      if (to && e.currentTarget.contains(to)) return;
      onDragOverChange(null);
    },
    [onDragOverChange],
  );

  // 落点:读取被拖路径,禁止拖到自身或其子目录,再请求移动确认
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOverChange(null);
      if (!isDir) return;
      const sourcePath = e.dataTransfer.getData('text/plain');
      if (!sourcePath) return;
      // 禁止拖到自身 或 自己的子目录(对齐旧版 FileTree.js)
      if (sourcePath === fullPath || sourcePath.startsWith(fullPath + '/')) return;
      const fileName = sourcePath.split('/').pop() || sourcePath;
      onMoveTo({ sourcePath, destPath: joinPath(fullPath, fileName), fileName });
    },
    [isDir, fullPath, onDragOverChange, onMoveTo],
  );

  // 当前是否为高亮目标目录
  const isDragOver = isDir && dragOverPath === fullPath;

  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined} className="file-tree-node-wrap">
      <div
        className={[
          'file-tree-node',
          isDir ? 'is-dir' : 'is-file',
          isActive ? 'active' : '',
          expanded ? 'expanded' : '',
          isDragOver ? 'drag-over' : '',
          status ? `status-${status.toLowerCase()}` : '',
        ].join(' ').trim()}
        style={indentStyle}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, fullPath, isDir)}
      >
        <span className="file-tree-toggle">
          {isDir ? (
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 4 10 8 6 12" />
            </svg>
          ) : null}
        </span>
        <span className="file-tree-icon">
          {isDir ? (
            <FileIcon kind="folder" open={expanded} size={14} />
          ) : (
            <FileTypeIcon fileName={entry.name} size={14} />
          )}
        </span>
        <span className="file-tree-name" title={entry.name}>
          {entry.name}
        </span>
        {status && <span className={`file-tree-status-badge status-${status.toLowerCase()}`}>{status}</span>}
      </div>
      {isDir && expanded && (
        <ul className="file-tree-list" role="group">
          {childrenLoading && children === null ? (
            <li className="file-tree-node-loading">加载中…</li>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <FileTreeNode
                key={joinPath(fullPath, child.name)}
                rootPath={fullPath}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                onToggle={onToggle}
                activePath={activePath}
                onFileSelect={onFileSelect}
                gitFiles={gitFiles}
                treeVersion={treeVersion}
                dragOverPath={dragOverPath}
                onDragOverChange={onDragOverChange}
                onMoveTo={onMoveTo}
                onContextMenu={onContextMenu}
              />
            ))
          ) : (
            <li className="file-tree-node-empty" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
              (空)
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

// ============================================================================
// 右键菜单 / 弹窗(FileTree 内部 UI,不导出)
// ============================================================================

interface CtxMenuItem {
  action?: string;
  label?: string;
  separator?: boolean;
}

function ContextMenu({
  x,
  y,
  onAction,
}: {
  x: number;
  y: number;
  onAction: (action: string) => void;
}) {
  const items: CtxMenuItem[] = [
    { action: 'new-file', label: '新建文件' },
    { action: 'new-folder', label: '新建文件夹' },
    { separator: true },
    { action: 'copy-absolute', label: '复制绝对路径' },
    { action: 'copy-relative', label: '复制相对路径' },
    { separator: true },
    { action: 'rename', label: '重命名' },
    { action: 'delete', label: '删除' },
  ];
  if (desktopBridge.isDesktop) {
    items.push({ separator: true }, { action: 'show-in-explorer', label: '在资源管理器中显示' });
    items.push({ action: 'open-in-terminal', label: '在终端中打开' });
  }

  return (
    <div className="file-tree-context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="file-tree-context-separator" />
        ) : (
          <div
            key={item.action}
            className="file-tree-context-item"
            onClick={() => item.action && onAction(item.action)}
          >
            <span className="file-tree-context-label">{item.label}</span>
          </div>
        ),
      )}
    </div>
  );
}

interface InputDialogState {
  title: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value?: string;
  onSubmit: (value: string) => void | Promise<void>;
}

function InputDialog({
  title,
  label,
  hint,
  placeholder,
  value,
  onSubmit,
  onClose,
}: InputDialogState & { onClose: () => void }) {
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // 重命名:默认只选中主文件名,保留扩展名不动(如 index.js 只选中 index)
    const initial = value ?? '';
    const dot = initial.lastIndexOf('.');
    const baseLen = dot > 0 ? dot : initial.length;
    el.setSelectionRange(0, baseLen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    const val = text.trim();
    if (!val) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    onClose();
    void onSubmit(val);
  };

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <label className="file-tree-modal-input-label">{label}</label>
          <input
            ref={inputRef}
            className={`file-tree-modal-input${error ? ' error' : ''}`}
            value={text}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
              else if (e.key === 'Escape') onClose();
            }}
          />
          {hint && <span className="file-tree-modal-input-hint">{hint}</span>}
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="file-tree-modal-btn file-tree-modal-btn-primary" onClick={confirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogState {
  title: string;
  message: string;
  note?: string;
  /** 确认按钮文案(默认「删除」) */
  confirmLabel?: string;
  onSubmit: (confirmed: boolean) => void | Promise<void>;
}

function ConfirmDialog({
  title,
  message,
  note,
  confirmLabel = '删除',
  onSubmit,
  onClose,
}: ConfirmDialogState & { onClose: () => void }) {
  const confirm = () => {
    onClose();
    void onSubmit(true);
  };
  const cancel = () => {
    onClose();
    void onSubmit(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <p className="file-tree-modal-message" dangerouslySetInnerHTML={{ __html: message }} />
          {note && <p className="file-tree-modal-note">{note}</p>}
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={cancel}>
            取消
          </button>
          <button type="button" className="file-tree-modal-btn file-tree-modal-btn-danger" onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 工具函数(放本文件内部,仅 FileTree 用到)
// ============================================================================

/** 树内拖放移动待确认数据 */
interface PendingMoveState {
  sourcePath: string;
  destPath: string;
  fileName: string;
}

/** HTML 转义,用于 messages/多行提示防止注入(dangerouslySetInnerHTML) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 目录条目排序:目录优先,再按名称 */
function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh');
  });
}

/** 拼接路径(统一用 / 分隔) */
function joinPath(parent: string, name: string): string {
  const normParent = parent.replace(/\\/g, '/').replace(/\/$/, '');
  return `${normParent}/${name}`;
}

/** 取路径末段(类似 basename) */
function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** 取父目录路径 */
function parentOf(path: string): string {
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(0, idx) : norm;
}

/** 复制文本到剪贴板(带降级) */
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('已复制: ' + text, { type: 'success' });
  } catch {
    showToast('复制失败', { type: 'error' });
  }
}
