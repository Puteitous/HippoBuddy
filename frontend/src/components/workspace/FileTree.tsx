/**
 * FileTree - 工作区文件树(阶段 3.5 简化版)
 *
 * 职责:
 *   1. 调用 desktopBridge.readDir 加载目录条目(Electron / JCEF / dev 降级)
 *   2. 递归渲染树节点(目录可展开/折叠)
 *   3. 点击文件 → onFileSelect 回调(由 WorkspacePanel 打开 tab)
 *
 * 简化(留 3.7):
 *   - 不实现右键菜单(新建/重命名/删除)
 *   - 不实现拖拽移动
 *   - 不实现紧凑目录链合并(a › b › c)
 *   - 不显示 git status 徽标
 *   - 不持久化展开状态(进入 workspace 视图时重新加载)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { desktopBridge } from '@/utils/desktop-bridge';
import './FileTree.css';

interface FileTreeProps {
  /** 工作区根路径(绝对) */
  rootPath: string;
  /** 文件点击回调 */
  onFileSelect: (filePath: string) => void;
  /** 当前激活的文件路径(高亮) */
  activePath?: string | null;
}

export function FileTree({ rootPath, onFileSelect, activePath }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRoot = useCallback(async (path: string) => {
    if (!path) {
      setRootEntries(null);
      return;
    }
    setLoading(true);
    setError(null);
    const entries = await desktopBridge.readDir(path);
    if (entries === null) {
      setError('无法读取目录(桌面端桥接未注入或路径不可访问)');
      setRootEntries(null);
    } else {
      setRootEntries(sortEntries(entries));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRoot(rootPath);
  }, [rootPath, loadRoot]);

  const handleRefresh = useCallback(() => {
    void loadRoot(rootPath);
  }, [rootPath, loadRoot]);

  if (!rootPath) {
    return (
      <div className="file-tree file-tree-empty">
        <span>未设置工作区</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-tree file-tree-loading">
        <span>加载中…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-tree file-tree-error">
        <p>{error}</p>
        <button type="button" onClick={handleRefresh}>
          重试
        </button>
      </div>
    );
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div className="file-tree file-tree-empty">
        <span>空目录</span>
      </div>
    );
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-root-name" title={rootPath}>
          {basename(rootPath) || rootPath}
        </span>
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
      <ul className="file-tree-list" role="tree">
        {rootEntries.map((entry) => (
          <FileTreeNode
            key={joinPath(rootPath, entry.name)}
            rootPath={rootPath}
            entry={entry}
            depth={0}
            activePath={activePath}
            onFileSelect={onFileSelect}
          />
        ))}
      </ul>
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
  activePath?: string | null;
  onFileSelect: (filePath: string) => void;
}

function FileTreeNode({ rootPath, entry, depth, activePath, onFileSelect }: FileTreeNodeProps) {
  const fullPath = joinPath(rootPath, entry.name);
  const isDir = entry.isDirectory;
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (!isDir) {
      onFileSelect(fullPath);
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    // 展开:首次加载子目录
    if (children === null) {
      setLoading(true);
      const entries = await desktopBridge.readDir(fullPath);
      setChildren(entries ? sortEntries(entries) : []);
      setLoading(false);
    }
    setExpanded(true);
  }, [isDir, expanded, children, fullPath, onFileSelect]);

  const isActive = activePath === fullPath;
  const indentStyle = useMemo(() => ({ paddingLeft: `${depth * 14 + 8}px` }), [depth]);

  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined} className="file-tree-node-wrap">
      <div
        className={[
          'file-tree-node',
          isDir ? 'is-dir' : 'is-file',
          isActive ? 'active' : '',
          expanded ? 'expanded' : '',
        ].join(' ').trim()}
        style={indentStyle}
        onClick={() => void toggle()}
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
            expanded ? (
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V41L9 21H39.5V15C39.5 13.9 38.6 13 37.5 13H24L19 7H6C4.9 7 4 7.9 4 9Z" />
                <path d="M40 41L44 21H8.8L4 41H40Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
              </svg>
            )
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z" />
              <polyline points="10 2 10 5 13 5" />
            </svg>
          )}
        </span>
        <span className="file-tree-name" title={entry.name}>
          {entry.name}
        </span>
      </div>
      {isDir && expanded && (
        <ul className="file-tree-list" role="group">
          {loading ? (
            <li className="file-tree-node-loading">加载中…</li>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <FileTreeNode
                key={joinPath(fullPath, child.name)}
                rootPath={fullPath}
                entry={child}
                depth={depth + 1}
                activePath={activePath}
                onFileSelect={onFileSelect}
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
// 工具函数(放本文件内部,避免污染 utils/ — 仅 FileTree 用到)
// ============================================================================

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
