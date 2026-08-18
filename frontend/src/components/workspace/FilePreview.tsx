/**
 * FilePreview - 文件预览(阶段 3.5 简化版,阶段 3.7-2 接入二进制预览,阶段 3.8 接入 CodeMirror)
 *
 * 渲染策略(按文件扩展名分流):
 *   - 图片(png/jpg/gif/svg/webp/bmp/ico) → <img> 走 /api/file/raw
 *   - PDF → <iframe> 走 /api/file/raw
 *   - docx/pptx/xlsx/xls → BinaryPreview(Silurus / docx-preview 引擎,3.7-2)
 *   - 文本/代码 → FilePreviewEditor(CM6 只读编辑器,语法高亮 + 行号 + 搜索,3.8)
 *
 * 阶段 3.8 增强:
 *   - 文本预览从 <pre> 升级为 CM6 只读编辑器(语法高亮/行号/主题跟随系统)
 *   - SearchPanel 挂载 + Ctrl+F/Ctrl+H 快捷键(真实高亮/滚动导航)
 *   - FilePreviewEditor 容器带 data-file-path + _cmPreviewView,SelectionActions 可计算行号
 *
 * 简化(留 3.8-2 后续):
 *   - 不实现编辑保存(只读)
 *   - 不实现 Markdown 渲染
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import { BinaryPreview } from '@/components/binary-preview/BinaryPreview';
import type { EditorView } from '@codemirror/view';
import { FilePreviewEditor } from './FilePreviewEditor';
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

type PreviewKind = 'text' | 'image' | 'pdf' | 'binary' | 'unknown';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

export function FilePreview({ filePath, startLine, endLine }: FilePreviewProps) {
  const kind = useMemo<PreviewKind>(() => detectKind(filePath), [filePath]);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawUrl = useMemo(() => fileApi.rawUrl(filePath), [filePath]);

  // 阶段 3.8:CM6 编辑器实例 + 搜索浮层显隐
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [searchOpen, setSearchOpen] = useState<'find' | 'replace' | null>(null);

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

  useEffect(() => {
    if (kind !== 'text') return;
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
        <div className="file-preview-title">
          <span className="file-preview-name">{basename(filePath)}</span>
          <span className="file-preview-path" title={filePath}>
            {toRelativePath(filePath) || filePath}
          </span>
          {startLine != null && (
            <span className="file-preview-lines">
              :{startLine}{endLine && endLine !== startLine ? `-${endLine}` : ''}
            </span>
          )}
        </div>
        <div className="file-preview-actions">
          <button
            type="button"
            onClick={() => void desktopBridge.showItemInFolder(filePath)}
            title="在资源管理器中显示"
          >
            打开位置
          </button>
        </div>
      </div>
      <div className="file-preview-body">
        {kind === 'image' && (
          <img className="file-preview-image" src={rawUrl} alt={basename(filePath)} />
        )}
        {kind === 'pdf' && (
          <iframe
            className="file-preview-pdf"
            src={rawUrl}
            title={basename(filePath)}
          />
        )}
        {kind === 'binary' && (
          <BinaryPreview filePath={filePath} />
        )}
        {kind === 'unknown' && (
          <div className="file-preview-unsupported">
            <p>未知文件类型</p>
          </div>
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
