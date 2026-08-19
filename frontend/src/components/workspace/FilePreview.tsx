/**
 * FilePreview - 文件预览(阶段 3.5 简化版,阶段 3.7-2 接入二进制预览,阶段 3.8 接入 CodeMirror)
 *
 * 渲染策略(按文件扩展名分流):
 *   - 图片(png/jpg/gif/svg/webp/bmp/ico) → ImagePreview(缩放工具栏/滚轮缩放/拖拽/重置)
 *   - PDF → <iframe> 走 /api/file/raw
 *   - docx/pptx/xlsx/xls → BinaryPreview(Silurus / docx-preview 引擎,3.7-2)
 *   - md/markdown → MarkdownPreview(渲染预览 + TOC + 本地图片映射,批次 A)
 *   - 文本/代码 → FilePreviewEditor(CM6 只读编辑器,语法高亮 + 行号 + 搜索,3.8)
 *
 * 阶段 3.8 增强:
 *   - 文本预览从 <pre> 升级为 CM6 只读编辑器(语法高亮/行号/主题跟随系统)
 *   - SearchPanel 挂载 + Ctrl+F/Ctrl+H 快捷键(真实高亮/滚动导航)
 *   - FilePreviewEditor 容器带 data-file-path + _cmPreviewView,SelectionActions 可计算行号
 *
 * 简化(留 3.8-2 后续):
 *   - 不实现编辑保存(只读)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import { BinaryPreview } from '@/components/binary-preview/BinaryPreview';
import type { EditorView } from '@codemirror/view';
import { FilePreviewEditor } from './FilePreviewEditor';
import { ImagePreview } from './ImagePreview';
import { MarkdownPreview } from './MarkdownPreview';
import { SearchPanel } from '@/components/SearchPanel';
import './FilePreview.css';

interface FilePreviewProps {
  /** 文件绝对路径 */
  filePath: string;
  /** 可选:打开时定位的起始行(3.5 仅作展示,不滚动) */
  startLine?: number;
  /** 可选:打开时定位的结束行 */
  endLine?: number;
}

type PreviewKind = 'text' | 'markdown' | 'image' | 'pdf' | 'binary' | 'unknown';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

export function FilePreview({ filePath, startLine, endLine }: FilePreviewProps) {
  const kind = useMemo<PreviewKind>(() => detectKind(filePath), [filePath]);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawUrl = useMemo(() => fileApi.rawUrl(filePath), [filePath]);
  // 面包屑路径段:相对工作区根的 dir › dir › file(对齐旧版 .file-preview-path)
  const crumbs = useMemo(() => {
    const rel = toRelativePath(filePath) || filePath;
    return rel.replace(/\\/g, '/').split('/').filter(Boolean);
  }, [filePath]);

  // 阶段 3.8:CM6 编辑器实例 + 搜索浮层显隐
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [searchOpen, setSearchOpen] = useState<'find' | 'replace' | null>(null);
  // 阶段 3.8(对齐旧版):编辑脏状态(有未保存改动)
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // 头部"重新加载"按钮:文本直接重拉,其余类型通过 key 递增重挂载
  const [reloadTick, setReloadTick] = useState(0);

  const loadText = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setTextContent(null);
    try {
      // 优先走桌面端 fs(本地直读,快),失败降级 HTTP
      const direct = await desktopBridge.readFile(path);
      if (direct != null) {
        setTextContent(direct);
        return;
      }
      const res = await fetch(rawUrl);
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new ApiError(msg || `加载失败(${res.status})`, res.status);
      }
      setTextContent(await res.text());
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [rawUrl]);

  // 头部"重新加载"按钮:文本直接重拉,其余类型通过 key 递增重挂载
  const reload = useCallback(() => {
    if (kind === 'text') {
      void loadText(filePath);
    } else {
      setReloadTick((t) => t + 1);
    }
  }, [kind, filePath, loadText]);

  // 保存当前文本编辑器内容(对齐旧版 HippoDesktop.writeFile):
  // 优先桌面桥直写,成功清 dirty / 失败提示。
  const handleSave = useCallback(async () => {
    if (!editorView || kind !== 'text') return;
    const content = editorView.state.doc.toString();
    setSaveError(false);
    const ok = await desktopBridge.writeFile(filePath, content);
    if (ok) {
      setDirty(false);
    } else {
      setSaveError(true);
    }
  }, [editorView, filePath, kind]);

  useEffect(() => {
    if (kind !== 'text' && kind !== 'markdown') return;
    void loadText(filePath);
  }, [filePath, kind, loadText]);

  // 阶段 3.8:Ctrl+F / Ctrl+H 打开搜索浮层,Esc 关闭(仅文本预览生效)
  useEffect(() => {
    if (kind !== 'text') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        setSearchOpen('find');
      } else if (key === 'h') {
        e.preventDefault();
        setSearchOpen('replace');
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [kind]);

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        {/* 面包屑路径:dir › dir › file(对齐旧版 .file-preview-path),行号后缀保留 */}
        <div className="file-preview-path" title={filePath}>
          {crumbs.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="sep">{'>'}</span>}
              {part}
            </span>
          ))}
          {startLine != null && (
            <span className="file-preview-lines">
              :{startLine}{endLine && endLine !== startLine ? `-${endLine}` : ''}
            </span>
          )}
          {dirty && <span className="file-preview-dirty" title="有未保存的改动">●</span>}
        </div>
        {/* 动作按钮组(对齐旧版 .file-preview-toolbar-actions .preview-btn) */}
        <div className="file-preview-actions">
          {kind === 'text' && (
            <button
              type="button"
              className="preview-btn"
              onClick={() => { setSaveError(false); void handleSave(); }}
              disabled={!dirty}
              title={dirty ? '保存 (Ctrl+S)' : '已保存'}
              aria-label="保存"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill={dirty ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 2h7l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                <path d="M5 2v4h4V2" />
              </svg>
            </button>
          )}
          {kind === 'text' && (
            <button
              type="button"
              className="preview-btn"
              onClick={() => setSearchOpen('find')}
              title="搜索 (Ctrl+F)"
              aria-label="搜索"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="7" cy="7" r="3" />
                <line x1="9.5" y1="9.5" x2="13" y2="13" />
              </svg>
            </button>
          )}
          {saveError && (
            <span className="file-preview-save-error" title="保存失败:当前环境不支持写入">
              保存失败(仅桌面端可写)
            </span>
          )}
          <button
            type="button"
            className="preview-btn"
            onClick={reload}
            title="重新加载"
            aria-label="重新加载"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
              <polyline points="14 2 14 5 11 5" />
              <polyline points="2 14 2 11 5 11" />
            </svg>
          </button>
          <button
            type="button"
            className="preview-btn"
            onClick={() => void desktopBridge.showItemInFolder(filePath)}
            title="在资源管理器中显示"
            aria-label="在资源管理器中显示"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 2h4v4" />
              <path d="M14 2L8 8" />
              <path d="M11 10v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
            </svg>
          </button>
        </div>
      </div>
      <div className="file-preview-body">
        {kind === 'image' && (
          <ImagePreview key={reloadTick} src={rawUrl} fileName={basename(filePath)} />
        )}
        {kind === 'pdf' && (
          <iframe
            key={reloadTick}
            className="file-preview-pdf"
            src={rawUrl}
            title={basename(filePath)}
          />
        )}
        {kind === 'binary' && (
          <BinaryPreview key={reloadTick} filePath={filePath} />
        )}
        {kind === 'unknown' && (
          <div className="file-preview-unsupported">
            <p>未知文件类型</p>
          </div>
        )}
        {kind === 'markdown' && (
          <>
            {loading && <div className="file-preview-loading">加载中…</div>}
            {error && (
              <div className="file-preview-error">
                <p>{error}</p>
                <button type="button" onClick={() => void loadText(filePath)}>重试</button>
              </div>
            )}
            {textContent != null && (
              <MarkdownPreview key={reloadTick} filePath={filePath} content={textContent} />
            )}
          </>
        )}
        {kind === 'text' && (
          <>
            {loading && <div className="file-preview-loading">加载中…</div>}
            {error && (
              <div className="file-preview-error">
                <p>{error}</p>
                <button type="button" onClick={() => void loadText(filePath)}>重试</button>
              </div>
            )}
            {textContent != null && (
              <div className="file-preview-editor-wrap">
                <FilePreviewEditor
                  filePath={filePath}
                  content={textContent}
                  startLine={startLine}
                  endLine={endLine}
                  onViewReady={setEditorView}
                  onDocChange={() => setDirty(true)}
                  onSave={() => void handleSave()}
                />
                {/* 搜索浮层(绝对定位,挂在编辑器上方;仅编辑器就绪后可用) */}
                {searchOpen && editorView && (
                  <SearchPanel
                    view={editorView}
                    initialMode={searchOpen}
                    onClose={() => setSearchOpen(null)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

function detectKind(filePath: string): PreviewKind {
  const ext = getExt(filePath);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  // Markdown 渲染预览(批次 A)
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  // 已知二进制 office 类型(留给 3.7 BinaryPreview)
  if (['docx', 'pptx', 'xlsx', 'xls'].includes(ext)) return 'binary';
  // 其他扩展名(含无扩展名)默认按文本处理
  return 'text';
}

function getExt(path: string): string {
  if (!path) return '';
  const clean = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

function basename(path: string): string {
  if (!path) return '';
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}
