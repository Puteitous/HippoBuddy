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
 * 尚未对齐(留后续):拖拽移动。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { desktopBridge } from '@/utils/desktop-bridge';
import { getJson } from '@/api/http';
import { showToast } from '@/utils/toastStore';
import { translate, useI18n } from '@/i18n';
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
  /** 外部请求在文件树中定位的目录路径(面包屑点击触发;变化时展开祖先并高亮/滚动该目录) */
  revealDir?: string | null;
  /** 外部触发刷新(工作区变更等),自增即重载 */
  refreshToken?: number;
}

/** 展开状态持久化 key(按 rootPath 分别保存,对齐旧版会话级持久化) */
const EXPANDED_KEY = 'hippo-file-tree-expanded';

/** 单链目录折叠最大探测深度(对齐旧版 FileTree.js _compactMaxDepth) */
const COMPACT_MAX_DEPTH = 5;

/**
 * compact 检测用的 readDir 结果缓存,避免逐层重复读目录。
 * 在每次整体刷新 / 路径切换时由 clearCompactCache 清空。
 */
const compactReadDirCache = new Map<string, DirEntry[] | null>();

function clearCompactCache(): void {
  compactReadDirCache.clear();
}

/** 带缓存的 readDir(供 resolveCompactChain 使用) */
async function readDirCached(dirPath: string): Promise<DirEntry[] | null> {
  const cached = compactReadDirCache.get(dirPath);
  if (cached !== undefined) return cached;
  const entries = await desktopBridge.readDir(dirPath);
  compactReadDirCache.set(dirPath, entries ?? null);
  return entries ?? null;
}

/**
 * 单链目录折叠结果:chain 为后续链上目录名,leafDir 为链最深目录完整路径
 */
interface CompactChain {
  chain: string[];
  leafDir: string;
}

/**
 * 检测从 startPath 开始是否存在"单链"嵌套目录。
 * 单链:每层只有 1 个子目录且没有文件,一直延伸到分叉处(有文件 / 多个目录则停止)。
 * 返回 { chain, leafDir } 或 null。chain 不包含 startPath 本身的 name,只含后续链上目录名。
 */
async function resolveCompactChain(
  startPath: string,
): Promise<CompactChain | null> {
  const names: string[] = [];
  let currentPath = startPath;

  for (let i = 0; i < COMPACT_MAX_DEPTH; i++) {
    const entries = await readDirCached(currentPath);
    if (!entries) return null;

    const dirs = entries.filter((e) => e.isDirectory && !e.name.startsWith('.'));
    const files = entries.filter((e) => !e.isDirectory && !e.name.startsWith('.'));

    // 有文件或非单目录 → 不是单链,停止
    if (files.length > 0) break;
    if (dirs.length !== 1) break;

    names.push(dirs[0].name);
    currentPath = joinPath(currentPath, dirs[0].name);
  }

  if (names.length === 0) return null;
  return { chain: names, leafDir: currentPath };
}

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

export function FileTree({ rootPath, onFileSelect, activePath, revealDir, refreshToken }: FileTreeProps) {
  const { t } = useI18n();
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
  /** 面包屑目录点击要定位到的目录路径(高亮目录节点,可同时保留当前文件高亮) */
  const [activeDirPath, setActiveDirPath] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 记录上次 rootPath,判断是否发生了路径切换(避免刷新时闪烁) */
  const prevRootRef = useRef<string | null>(null);

  // ── 根目录加载(路径变化 / 内部刷新 / 外部 refreshToken 变化时) ──
  useEffect(() => {
    // 刷新 / 切路径时 compact 检测缓存失效(对齐旧版 _doRefresh 清空 _readDirCache)
    clearCompactCache();
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
        setError(translate('fileTree.loadDirFailed'));
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
        showToast(translate('fileTree.moved', { name: fileName }), { type: 'success' });
        setTreeVersion((v) => v + 1);
      } else {
        showToast(translate('fileTree.moveFailed'), { type: 'error' });
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

  // 对齐旧版 revealFile:激活文件标签变化时,递归展开其在文件树中的祖先目录。
  // 仅当 activePath 是工作区内的文件绝对路径才处理,排除 web(url:)等非文件标签与越界路径。
  useEffect(() => {
    if (!rootPath || !activePath) return;
    const rootBase = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
    const norm = activePath.replace(/\\/g, '/').replace(/\/$/, '');
    // 前缀带分隔符判断(大小写不敏感,兼容盘符大小写差异),避免 rootPath="/a" 误匹配 "/ab/..." 这类越界路径
    if (!isUnderPath(rootBase, norm)) return;
    const fileDir = parentOf(norm);
    if (!fileDir || pathKey(fileDir) === pathKey(rootBase)) return;
    // 逐层展开:相对段从 activePath 掐掉 root 长度得到,再以本组件 rootPath 的大小写拼出规范路径,
    // 保证 expandedDirs 的 key 与渲染时 FileTreeNode 的 dirPath 完全一致
    const dirsToAdd: string[] = [];
    const relParts = fileDir.slice(rootBase.length).split('/').filter(Boolean);
    let cur = rootBase;
    for (const part of relParts) {
      cur += '/' + part;
      dirsToAdd.push(cur);
    }
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const missing = dirsToAdd.filter((d) => !next.has(d));
      if (missing.length === 0) return prev; // 引用不变,避免驱动无谓重渲染
      for (const d of missing) next.add(d);
      persistExpanded(rootPath, next);
      return next;
    });
  }, [rootPath, activePath]);

  // 点击标签联动:把激活文件节点滚到文件树可视区中间(与标签栏居中保持一致);
  // 目录递归展开是异步懒加载(子项 readDir 后才渲染),故仅在 activePath 变化时启动一次轮询,
  // 去掉 expandedDirs 依赖,避免树逐层展开时反复触发滚动导致"突然滚动到中间"。
  useEffect(() => {
    if (!rootPath || !activePath) return;
    // 与上方一致的工作区内文件路径判定(大小写不敏感),非文件标签不滚动
    if (!isUnderPath(rootPath, activePath)) return;
    let attempt = 0;
    let timer: number | undefined;
    const tryScroll = () => {
      const el = containerRef.current?.querySelector('.file-tree-node.is-file.active');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 80) {
        attempt += 1;
        timer = window.setTimeout(tryScroll, 60);
      }
    };
    tryScroll();
    return () => window.clearTimeout(timer);
  }, [rootPath, activePath]);

  // 对齐旧版 revealDirectory:面包屑点击目录段时,展开该目录及全部父目录,高亮目录节点并滚动定位。
  useEffect(() => {
    if (!rootPath || !revealDir) return;
    const normTarget = revealDir.replace(/\\/g, '/').replace(/\/$/, '');
    if (!isUnderPath(rootPath, normTarget)) return;
    // 逐层展开:相对段从目标掐掉 root 长度得到,再以本组件 rootPath 的大小写拼出规范路径,
    // 保证 expandedDirs 的 key 与渲染时 FileTreeNode 的 dirPath 一致;activeDirPath 同步用该规范形式
    const rootBase = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
    const dirsToAdd: string[] = [];
    const relParts = normTarget.slice(rootBase.length).split('/').filter(Boolean);
    let cur = rootBase;
    for (const part of relParts) {
      cur += '/' + part;
      dirsToAdd.push(cur);
    }
    setActiveDirPath(dirsToAdd[dirsToAdd.length - 1] ?? normTarget);
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const missing = dirsToAdd.filter((d) => !next.has(d));
      if (missing.length === 0) return prev;
      for (const d of missing) next.add(d);
      persistExpanded(rootPath, next);
      return next;
    });
  }, [rootPath, revealDir]);

  // 滚动定位到高亮目录节点(目录递归展开是异步懒加载,多帧重试直到渲染出来)。
  useEffect(() => {
    if (!activeDirPath) return;
    let attempt = 0;
    let timer: number | undefined;
    const tryScroll = () => {
      const el = containerRef.current?.querySelector('.file-tree-node.is-dir.active');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (attempt < 50) {
        attempt += 1;
        timer = window.setTimeout(tryScroll, 60);
      }
    };
    tryScroll();
    return () => window.clearTimeout(timer);
  }, [activeDirPath, expandedDirs]);

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
            title: isFile ? translate('fileTree.newFile') : translate('fileTree.newFolder'),
            label: isFile ? translate('fileTree.fileName') : translate('fileTree.folderName'),
            hint: translate('fileTree.existsHint', { dir: baseDir }),
            placeholder: isFile ? 'index.js' : 'my-folder',
            onSubmit: async (name) => {
              const newPath = joinPath(baseDir, name);
              const ok = isFile
                ? await desktopBridge.createFile(newPath)
                : await desktopBridge.createDir(newPath);
              if (ok) {
                showToast(
                  translate('fileTree.created', {
                    kind: isFile ? translate('fileTree.file') : translate('fileTree.folder'),
                    name,
                  }),
                  { type: 'success' },
                );
                setTreeVersion((v) => v + 1);
              } else {
                showToast(translate('fileTree.createFailed'), { type: 'error' });
              }
            },
          });
          break;
        }
        case 'rename': {
          const oldName = basename(targetPath);
          setInputDialog({
            title: translate('fileTree.renameTitle'),
            label: translate('fileTree.newName'),
            value: oldName,
            onSubmit: async (newName) => {
              if (newName === oldName) return;
              const parentPath = parentOf(targetPath);
              const newPath = joinPath(parentPath, newName);
              const ok = await desktopBridge.rename(targetPath, newPath);
              if (ok) {
                showToast(translate('fileTree.renamed', { name: newName }), { type: 'success' });
                setTreeVersion((v) => v + 1);
              } else {
                showToast(translate('fileTree.renameFailed'), { type: 'error' });
              }
            },
          });
          break;
        }
        case 'delete': {
          setConfirmDialog({
            title:
              translate('fileTree.deleteBtn') +
              (isDir ? translate('fileTree.folder') : translate('fileTree.file')),
            message: translate('fileTree.deleteConfirm', { name: basename(targetPath) }),
            note: translate('fileTree.deleteFallbackNote'),
            onSubmit: async (confirmed) => {
              if (!confirmed) return;
              const ok = await desktopBridge.deleteFile(targetPath);
              if (ok) {
                showToast(translate('fileTree.deleted', { name: basename(targetPath) }), {
                  type: 'success',
                });
                setTreeVersion((v) => v + 1);
              } else {
                showToast(translate('fileTree.deleteFailed'), { type: 'error' });
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
    body = <div className="file-tree-empty"><span>{t('fileTree.unsetWorkspace')}</span></div>;
  } else if (loading) {
    body = <div className="file-tree-loading"><span>{t('fileTree.loading')}</span></div>;
  } else if (error) {
    body = (
      <div className="file-tree-error">
        <p>{error}</p>
        <button type="button" onClick={handleRefresh}>{t('chatui.retry')}</button>
      </div>
    );
  } else if (!rootEntries || rootEntries.length === 0) {
    body = <div className="file-tree-empty"><span>{t('fileTree.emptyDir')}</span></div>;
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
            activeDirPath={activeDirPath}
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
            title={t('fileTree.collapseAll')}
            aria-label={t('fileTree.collapseAll')}
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
            title={t('fileTree.refresh')}
            aria-label={t('fileTree.refresh')}
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
            title={t('fileTree.moveTitle')}
            message={t('fileTree.moveConfirm', {
              name: escapeHtml(pendingMove.fileName),
              dir: escapeHtml(basename(parentOf(pendingMove.destPath))),
            })}
            note={t('fileTree.moveNote')}
            confirmLabel={t('fileTree.moveAction')}
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
  /** 面包屑点击定位到的目录路径(目录节点据此高亮) */
  activeDirPath?: string | null;
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
  activeDirPath,
  onFileSelect,
  gitFiles,
  treeVersion,
  dragOverPath,
  onDragOverChange,
  onMoveTo,
  onContextMenu,
}: FileTreeNodeProps) {
  const { t } = useI18n();
  const fullPath = joinPath(rootPath, entry.name);
  const isDir = entry.isDirectory;

  // 单链紧凑折叠检测:对目录异步探测是否存在只含单目录的嵌套链
  const [compact, setCompact] = useState<CompactChain | null>(null);
  useEffect(() => {
    if (!isDir) {
      setCompact(null);
      return;
    }
    let cancelled = false;
    void resolveCompactChain(fullPath).then((c) => {
      if (!cancelled) setCompact(c);
    });
    return () => {
      cancelled = true;
    };
  }, [isDir, fullPath, treeVersion]);

  // compact 生效时,本节点代表链最深目录(leafDir),展开 key / 加载 / 跳转均以它为基准
  const dirPath = compact ? compact.leafDir : fullPath;
  // 合并展示名:如 "src › components › ui"
  const displayName = compact ? `${entry.name} › ${compact.chain.join(' › ')}` : entry.name;
  const expanded = expandedDirs.has(dirPath);

  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(false);

  // 展开时懒加载子目录;treeVersion 变化时已展开目录重新加载
  useEffect(() => {
    if (!isDir || !expanded) return;
    let cancelled = false;
    setChildrenLoading(true);
    (async () => {
      const entries = await desktopBridge.readDir(dirPath);
      if (cancelled) return;
      setChildren(entries ? sortEntries(entries) : []);
      setChildrenLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDir, expanded, dirPath, treeVersion]);

  const isActive = pathKey(activePath ?? '') === pathKey(dirPath) || (isDir && pathKey(activeDirPath ?? '') === pathKey(dirPath));
  const relativePath = rootPath && dirPath.startsWith(rootPath + '/')
    ? dirPath.slice(rootPath.length + 1)
    : dirPath;
  const status = gitFiles ? gitFiles[relativePath] : undefined;
  const indentStyle = useMemo(() => ({ paddingLeft: `${depth * 14 + 8}px` }), [depth]);

  const handleClick = useCallback(() => {
    if (isDir) onToggle(dirPath);
    else onFileSelect(dirPath);
  }, [isDir, dirPath, onToggle, onFileSelect]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // 文件与文件夹均可拖入输入框生成引用芯片(对齐旧版 FileTree.js)
      e.dataTransfer.setData('text/plain', dirPath);
      e.dataTransfer.setData('text/x-hippo-type', isDir ? 'directory' : 'file');
      e.dataTransfer.effectAllowed = 'copyMove';
    },
    [isDir, dirPath],
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
      onDragOverChange(dirPath);
    },
    [isDir, dirPath, onDragOverChange],
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
      if (sourcePath === dirPath || sourcePath.startsWith(dirPath + '/')) return;
      const fileName = sourcePath.split('/').pop() || sourcePath;
      onMoveTo({ sourcePath, destPath: joinPath(dirPath, fileName), fileName });
    },
    [isDir, dirPath, onDragOverChange, onMoveTo],
  );

  // 当前是否为高亮目标目录
  const isDragOver = isDir && dragOverPath === dirPath;

  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined} className="file-tree-node-wrap">
      <div
        className={[
          'file-tree-node',
          isDir ? 'is-dir' : 'is-file',
          isActive ? 'active' : '',
          expanded ? 'expanded' : '',
          isDragOver ? 'drag-over' : '',
          compact ? 'is-compact' : '',
          status ? `status-${status.toLowerCase()}` : '',
        ].join(' ').trim()}
        style={indentStyle}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, dirPath, isDir)}
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
        <span className={compact ? 'file-tree-name file-tree-name-compact' : 'file-tree-name'} title={displayName}>
          {displayName}
        </span>
        {status && <span className={`file-tree-status-badge status-${status.toLowerCase()}`}>{status}</span>}
      </div>
      {isDir && expanded && (
        <ul className="file-tree-list" role="group">
          {childrenLoading && children === null ? (
            <li className="file-tree-node-loading">{t('fileTree.loading')}</li>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <FileTreeNode
                key={joinPath(dirPath, child.name)}
                rootPath={dirPath}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                onToggle={onToggle}
                activePath={activePath}
                activeDirPath={activeDirPath}
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

interface CtxItem {
  action?: string;
  labelKey?: string;
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
  const { t } = useI18n();
  const items: CtxItem[] = [
    { action: 'new-file', labelKey: 'fileTree.newFile' },
    { action: 'new-folder', labelKey: 'fileTree.newFolder' },
    { separator: true },
    { action: 'copy-absolute', labelKey: 'fileTree.copyAbsolutePath' },
    { action: 'copy-relative', labelKey: 'fileTree.copyRelativePath' },
    { separator: true },
    { action: 'rename', labelKey: 'fileTree.renameTitle' },
    { action: 'delete', labelKey: 'fileTree.deleteBtn' },
  ];
  if (desktopBridge.isDesktop) {
    items.push({ separator: true }, { action: 'show-in-explorer', labelKey: 'fileTree.showInExplorer' });
    items.push({ action: 'open-in-terminal', labelKey: 'fileTree.openInTerminal' });
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
            <span className="file-tree-context-label">{item.labelKey ? t(item.labelKey) : ''}</span>
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
  const { t } = useI18n();
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
            {t('fileTree.cancelBtn')}
          </button>
          <button type="button" className="file-tree-modal-btn file-tree-modal-btn-primary" onClick={confirm}>
            {t('fileTree.confirmBtn')}
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
  confirmLabel,
  onSubmit,
  onClose,
}: ConfirmDialogState & { onClose: () => void }) {
  const { t } = useI18n();
  const resolveLabel = confirmLabel ?? t('fileTree.deleteBtn');
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
            {t('fileTree.cancelBtn')}
          </button>
          <button type="button" className="file-tree-modal-btn file-tree-modal-btn-danger" onClick={confirm}>
            {resolveLabel}
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

/**
 * Windows 下有无意义的大小写差异(盘符 E:/ vs e:/ 等),统一折叠用于路径比较/前缀判断,
 * 避免 FilePreview(desktopBridge.getCurrentPath) 与 FileTree(rootPath) 因盘符大小写不一而误判越界。
 */
function pathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
/** 判断 base 是否为主路径的规范化前缀(含目录分隔),用于工作区内路径校验 */
function isUnderPath(base: string, target: string): boolean {
  return pathKey(target).startsWith(pathKey(base).replace(/\/$/, '') + '/');
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
    showToast(translate('fileTree.copied', { text }), { type: 'success' });
  } catch {
    showToast(translate('fileTree.copyFailed'), { type: 'error' });
  }
}
