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
import { emit } from '@/utils/eventBus';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import { BinaryPreview } from '@/components/binary-preview/BinaryPreview';
import type { EditorView } from '@codemirror/view';
import { FilePreviewEditor } from './FilePreviewEditor';
import { ImagePreview } from './ImagePreview';
import { MarkdownPreview } from './MarkdownPreview';
import { SearchPanel } from '@/components/SearchPanel';
import { usePreviewStore } from '@/stores/previewStore';
import { translate, useI18n } from '@/i18n';
import './FilePreview.css';

interface FilePreviewProps {
  /** 文件绝对路径 */
  filePath: string;
  /** 可选:打开时定位的起始行(3.5 仅作展示,不滚动) */
  startLine?: number;
  /** 可选:打开时定位的结束行 */
  endLine?: number;
  /** 跳转触发信号:每次引用点击自增,即使 startLine 相同也重新定位(对齐旧版) */
  deepLinkTick?: number;
}

type PreviewKind = 'text' | 'markdown' | 'image' | 'pdf' | 'binary' | 'opaque' | 'unknown';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
const OFFICE_EXT = ['docx', 'pptx', 'xlsx', 'xls'];
const HTML_EXT = ['html', 'htm'];
// 无法预览的已知二进制(压缩包/可执行/库文件等,对齐旧版 shared.js isBinaryFile 黑名单)
const BINARY_EXT = new Set([
  'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'zst', 'tgz', 'tzst', 'lz4',
  'exe', 'dll', 'so', 'dylib', 'wasm',
  'class', 'jar', 'war', 'ear',
  'pyc', 'pyo',
  'o', 'obj', 'lib', 'a', 'la',
  'iso', 'img', 'dmg', 'deb', 'rpm', 'msi', 'pkg',
  'db', 'sqlite', 'sqlite3',
  'bin', 'dat',
]);
const WRAP_STORAGE_KEY = 'hb.filePreview.wrap';

export function FilePreview({ filePath, startLine, endLine, deepLinkTick }: FilePreviewProps) {
  const { t } = useI18n();
  const kind = useMemo<PreviewKind>(() => detectKind(filePath), [filePath]);
  // 收起预览面板(对齐旧版 previewCollapseBtn;标签保留,打开/切换文件时恢复)
  const collapsePreview = usePreviewStore((s) => s.collapsePreview);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawUrl = useMemo(() => fileApi.rawUrl(filePath), [filePath]);
  // 面包屑路径段:相对工作区根的 dir › dir › file(对齐旧版 .file-preview-path)
  const crumbs = useMemo(() => {
    const rel = toRelativePath(filePath) || filePath;
    return rel.replace(/\\/g, '/').split('/').filter(Boolean);
  }, [filePath]);

  // 点击目录段 → 在文件树中定位该目录(对齐旧版 .path-segment 点击 → revealDirectory)。
  // 目录段绝对路径:工作区内文件用「根路径 + 相对目录」;工作区外(面包屑即绝对路径)直接用段前缀。
  const handleBreadcrumbDirClick = useCallback(
    (dirRel: string) => {
      const root = desktopBridge.getCurrentPath();
      const normRoot = root ? root.replace(/\\/g, '/').replace(/\/$/, '') : null;
      const normFile = filePath.replace(/\\/g, '/');
      const abs = normRoot && normFile.startsWith(normRoot + '/') ? `${normRoot}/${dirRel}` : dirRel;
      emit('workspace:reveal-dir', abs.replace(/\/+/g, '/'));
    },
    [filePath],
  );

  // 阶段 3.8:CM6 编辑器实例 + 搜索浮层显隐
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [searchOpen, setSearchOpen] = useState<'find' | 'replace' | null>(null);
  // 阶段 3.8(对齐旧版):编辑脏状态(有未保存改动)随标签持久化(tab.dirty),编辑置 true / 保存重置
  const [saveError, setSaveError] = useState(false);
  // 头部"重新加载"按钮:文本直接重拉,其余类型通过 key 递增重挂载
  const [reloadTick, setReloadTick] = useState(0);
  // 保存成功版本号:每次成功写入文件自增,传给编辑器清空 AI diff 基线(对齐旧版保存后清基线)
  const [saveRevision, setSaveRevision] = useState(0);
  // 自动换行(对齐旧版 previewWrapBtn;按文件持久化,md 默认换行其余默认不换行)
  const [wrapEnabled, setWrapEnabled] = useState<boolean>(() => getWrapPref(filePath));

  // 按旧版 toolbar 分派按钮显隐的类型标记
  const isHtml = HTML_EXT.includes(getExt(filePath));
  const isOffice = OFFICE_EXT.includes(getExt(filePath));

  // MD 预览/编辑切换(对齐旧版 previewMdToggleBtn):首次打开默认渲染预览,点击切换编辑模式。
  // 模式 / 未保存草稿(tab.mdMode / tab.mdDraft)与脏状态(tab.dirty)均随标签持久化,
  // 切走再切回保留编辑上下文(编辑态、草稿、滚动位置),避免回到预览与丢失进度。
  const mdMode = usePreviewStore((s) => s.tabs.find((t) => t.path === filePath)?.mdMode ?? 'preview');
  const mdContent = usePreviewStore((s) => s.tabs.find((t) => t.path === filePath)?.mdDraft ?? null);
  const dirty = usePreviewStore((s) => s.tabs.find((t) => t.path === filePath)?.dirty ?? false);
  const setMdMode = usePreviewStore((s) => s.setMdMode);
  const setMdDraft = usePreviewStore((s) => s.setMdDraft);
  const setTabDirty = usePreviewStore((s) => s.setTabDirty);
  // 当前是否处于"可编辑"态:纯文本,或 md 编辑模式(对齐旧版 _updateSearchBtn/_updateWrapBtn)
  const isEditable = kind === 'text' || (kind === 'markdown' && mdMode === 'edit');
  // 切换 md 预览/编辑:从编辑切回预览时用编辑器当前内容写入草稿(切回预览仍可见未保存修改)
  const toggleMdMode = useCallback(() => {
    if (mdMode === 'edit' && editorView) {
      setMdDraft(filePath, editorView.state.doc.toString());
    }
    setMdMode(filePath, mdMode === 'preview' ? 'edit' : 'preview');
    // 切换时关闭搜索浮层(对齐旧版 _registerMdToggleBtn 中 close)
    setSearchOpen(null);
  }, [mdMode, editorView, filePath, setMdMode, setMdDraft]);

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
        throw new ApiError(msg || translate('preview.loadFailed', { status: res.status }), res.status);
      }
      setTextContent(await res.text());
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [rawUrl]);

  // 头部"重新加载"按钮:文本直接重拉,其余类型通过 key 递增重挂载。
  // md 特殊:丢弃未保存草稿并重新拉取磁盘内容(对齐"重新加载"语义)
  const reload = useCallback(() => {
    if (kind === 'text' || kind === 'markdown') {
      if (kind === 'markdown') {
        setMdDraft(filePath, null);
        setTabDirty(filePath, false);
      }
      void loadText(filePath);
    } else {
      setReloadTick((t) => t + 1);
    }
  }, [kind, filePath, loadText, setMdDraft, setTabDirty]);

  // 保存当前文本编辑器内容(对齐旧版 HippoDesktop.writeFile):
  // 优先桌面桥直写,成功清 dirty / 失败提示。md 编辑模式同样可保存。
  const handleSave = useCallback(async () => {
    if (!editorView || !isEditable) return;
    const content = editorView.state.doc.toString();
    setSaveError(false);
    const ok = await desktopBridge.writeFile(filePath, content);
    if (ok) {
      setTabDirty(filePath, false);
      // 不在这里更新草稿:执行保存时正处在编辑态,若更新 mdDraft 会改变传给编辑器的
      // content prop,触发 FilePreviewEditor 按 [filePath, content] 重建、清空撤销历史。
      // 切回预览时 toggleMdMode 自会用当前编辑器内容同步草稿,无需在此更新。
      setSaveRevision((v) => v + 1);
    } else {
      setSaveError(true);
    }
  }, [editorView, filePath, isEditable, setTabDirty]);

  // 切换自动换行并持久化到本地(对齐旧版 _setWrapPreference)
  const toggleWrap = useCallback(() => {
    setWrapEnabled((prev) => {
      const next = !prev;
      setWrapPref(filePath, next);
      return next;
    });
  }, [filePath]);

  // 切换文件时按该文件持久化偏好重置换行态;md 模式/草稿/脏状态随标签保存在 store,不在此重置
  useEffect(() => {
    setWrapEnabled(getWrapPref(filePath));
    setSearchOpen(null);
  }, [filePath]);

  // 在外部程序中打开(对齐旧版 previewOpenInOfficeBtn:_openExternal file://)
  const openExternal = useCallback(() => {
    const fileUrl = 'file:///' + encodeURI(filePath.replace(/\\/g, '/'));
    desktopBridge.openExternal(fileUrl);
  }, [filePath]);

  useEffect(() => {
    if (kind !== 'text' && kind !== 'markdown') return;
    void loadText(filePath);
  }, [filePath, kind, loadText]);

  // 同步脏状态到标签栏(对齐旧版:FilePreview 编辑变更 → FileTabs.setDirty,标签显示圆点)
  // 已在 onDocChange / handleSave / reload 直接调用 setTabDirty 写入,无需额外 effect。
  // 阶段 3.8:Ctrl+F / Ctrl+H 打开搜索浮层,Esc 关闭(文本/md 编辑模式生效)
  useEffect(() => {
    if (!isEditable) return;
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
  }, [isEditable]);

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        {/* 面包屑路径:dir › dir › file(对齐旧版 .file-preview-path),行号后缀保留 */}
        <div className="file-preview-path" title={filePath}>
          {crumbs.map((part, i) => {
            // 目录段可点击:在文件树中定位该目录(最后一段为文件名不可点,对齐旧版 .path-segment)
            const isDirSegment = i < crumbs.length - 1;
            return (
              <span key={i}>
                {i > 0 && <span className="sep">{'>'}</span>}
                {isDirSegment ? (
                  <span
                    className="path-segment"
                    data-path={crumbs.slice(0, i + 1).join('/')}
                    title={t('diff.revealInTreeTip')}
                    onClick={() => handleBreadcrumbDirClick(crumbs.slice(0, i + 1).join('/'))}
                  >
                    {part}
                  </span>
                ) : (
                  part
                )}
              </span>
            );
          })}
          {startLine != null && (
            <span className="file-preview-lines">
              :{startLine}{endLine && endLine !== startLine ? `-${endLine}` : ''}
            </span>
          )}
          {dirty && <span className="file-preview-dirty" title={t('preview.dirtyUnsaved')}>●</span>}
        </div>
        {/* 动作按钮组(对齐旧版 .file-preview-toolbar-actions,按文件类型分派显隐) */}
        <div className="file-preview-actions">
          {/* MD 预览/编辑切换:仅 markdown(对齐旧版 previewMdToggleBtn;预览态高亮+眼睛,编辑态铅笔) */}
          {kind === 'markdown' && (
            <button
              type="button"
              className={`preview-btn${mdMode === 'preview' ? ' active' : ''}`}
              onClick={toggleMdMode}
              title={mdMode === 'preview' ? t('preview.editMode') : t('preview.previewMode')}
              aria-label={mdMode === 'preview' ? t('preview.editMode') : t('preview.previewMode')}
            >
              {mdMode === 'preview' ? (
                <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" aria-hidden>
                  <path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z" />
                  <path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9.85786 18C6.23858 21 4 24 4 24C4 24 12.9543 36 24 36C25.3699 36 26.7076 35.8154 28 35.4921M20.0318 12.5C21.3144 12.1816 22.6414 12 24 12C35.0457 12 44 24 44 24C44 24 41.7614 27 38.1421 30" />
                  <path d="M20.3142 20.6211C19.4981 21.5109 19 22.6972 19 23.9998C19 26.7612 21.2386 28.9998 24 28.9998C25.3627 28.9998 26.5981 28.4546 27.5 27.5705" />
                  <path d="M42 42L6 6" />
                </svg>
              )}
            </button>
          )}
          {/* 搜索:仅文本/md 编辑模式(对齐旧版 _updateSearchBtn:无文件/二进制/md 预览态隐藏) */}
          {isEditable && (
            <button
              type="button"
              className="preview-btn"
              onClick={() => setSearchOpen('find')}
              title={t('preview.search')}
              aria-label={t('preview.searchAria')}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="7" cy="7" r="3" />
                <line x1="9.5" y1="9.5" x2="13" y2="13" />
              </svg>
            </button>
          )}
          {/* 自动换行:仅文本/md 编辑模式(对齐旧版 previewWrapBtn,Compartment 动态切换) */}
          {isEditable && (
            <button
              type="button"
              className={`preview-btn${wrapEnabled ? ' active' : ''}`}
              onClick={toggleWrap}
              title={t('preview.wrap')}
              aria-label={t('preview.wrap')}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="2" y1="4" x2="14" y2="4" />
                <path d="M2 8h10a2 2 0 1 1 0 4H8.5" />
                <polyline points="11 10.5 12.5 12 11 13.5" />
              </svg>
            </button>
          )}
          {saveError && (
            <span className="file-preview-save-error" title={t('preview.saveFailedTitle')}>
              {t('preview.saveFailedDetail')}
            </span>
          )}
          {/* HTML 预览页面:在外部浏览器打开(对齐旧版 previewHtmlToggleBtn,仅 html) */}
          {isHtml && (
            <button
              type="button"
              className="preview-btn"
              onClick={openExternal}
              title={t('preview.htmlToggle')}
              aria-label={t('preview.htmlToggle')}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" />
                <path d="M10 2h4v4" />
                <path d="M14 2L8 8" />
              </svg>
            </button>
          )}
          {/* 在外部程序中打开:office 文件(对齐旧版 previewOpenInOfficeBtn) */}
          {isOffice && (
            <button
              type="button"
              className="preview-btn"
              onClick={openExternal}
              title={t('preview.openExternal')}
              aria-label={t('preview.openExternal')}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 2h4v4" />
                <path d="M14 2L8 8" />
                <path d="M11 10v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
              </svg>
            </button>
          )}
          {/* 重新加载:二进制/渲染预览(对齐旧版 _updateRefreshBtn:二进制视图显示;文本不显示) */}
          {kind !== 'text' && (
            <button
              type="button"
              className="preview-btn"
              onClick={reload}
              title={t('preview.refresh')}
              aria-label={t('preview.refresh')}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 8a6 6 0 0 1 11.2-3.2M14 8a6 6 0 0 1-11.2 3.2" />
                <polyline points="14 2 14 5 11 5" />
                <polyline points="2 14 2 11 5 11" />
              </svg>
            </button>
          )}
          {/* 收起预览(对齐旧版 previewCollapseBtn,独立 panel-toggle-btn 样式,末尾固定) */}
          <button
            type="button"
            className="panel-toggle-btn"
            onClick={collapsePreview}
            title={t('preview.collapse')}
            aria-label={t('preview.collapse')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="12 4 4 8 12 12" />
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
        {kind === 'opaque' && (
          <div className="file-preview-unsupported">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <p><strong>{basename(filePath)}</strong></p>
            <p>{t('preview.opaque', { ext: getExt(filePath).toUpperCase() })}</p>
            <button
              type="button"
              className="file-preview-download"
              onClick={() => void desktopBridge.showItemInFolder(filePath)}
            >
              {t('preview.showInFolder')}
            </button>
          </div>
        )}
        {kind === 'unknown' && (
          <div className="file-preview-unsupported">
            <p>{t('ooxml.unknownType')}</p>
          </div>
        )}
        {kind === 'markdown' && (
          <>
            {loading && <div className="file-preview-loading">{t('preview.loading')}</div>}
            {error && (
              <div className="file-preview-error">
                <p>{error}</p>
                <button type="button" onClick={() => void loadText(filePath)}>{t('chatui.retry')}</button>
              </div>
            )}
            {/* 渲染预览(默认;content 优先用编辑草稿,保证未保存修改切回预览仍可见) */}
            {textContent != null && mdMode === 'preview' && (
              <MarkdownPreview key={reloadTick} filePath={filePath} content={mdContent ?? textContent} />
            )}
            {textContent != null && mdMode === 'edit' && (
              <div className="file-preview-editor-wrap">
                <FilePreviewEditor
                  filePath={filePath}
                  content={mdContent ?? textContent}
                  startLine={startLine}
                  endLine={endLine}
                  deepLinkTick={deepLinkTick}
                  wrapEnabled={wrapEnabled}
                  saveRevision={saveRevision}
                  onViewReady={setEditorView}
                  onDocChange={() => setTabDirty(filePath, true)}
                  onSave={() => void handleSave()}
                  onContentSnapshot={(c) => setMdDraft(filePath, c)}
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
        {kind === 'text' && (
          <>
            {loading && <div className="file-preview-loading">{t('preview.loading')}</div>}
            {error && (
              <div className="file-preview-error">
                <p>{error}</p>
                <button type="button" onClick={() => void loadText(filePath)}>{t('chatui.retry')}</button>
              </div>
            )}
            {textContent != null && (
              <div className="file-preview-editor-wrap">
                <FilePreviewEditor
                  filePath={filePath}
                  content={textContent}
                  startLine={startLine}
                  endLine={endLine}
                  deepLinkTick={deepLinkTick}
                  wrapEnabled={wrapEnabled}
                  saveRevision={saveRevision}
                  onViewReady={setEditorView}
                  onDocChange={() => setTabDirty(filePath, true)}
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
  // 其他已知二进制(压缩包/可执行/库文件等)→ 只读占位提示,避免按文本打开乱码
  if (BINARY_EXT.has(ext)) return 'opaque';
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

// ============================================================================
// 自动换行偏好读写(对齐旧版 _getWrapEnabled/_setWrapPreference:按文件持久化,md 默认换行)
// ============================================================================

function getWrapPref(filePath: string): boolean {
  try {
    const raw = localStorage.getItem(WRAP_STORAGE_KEY);
    if (raw) {
      const map: Record<string, boolean> = JSON.parse(raw);
      if (typeof map[filePath] === 'boolean') return map[filePath];
    }
  } catch {
    /* ignore */
  }
  return getExt(filePath) === 'md' || getExt(filePath) === 'markdown';
}

function setWrapPref(filePath: string, enabled: boolean): void {
  try {
    const raw = localStorage.getItem(WRAP_STORAGE_KEY);
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    map[filePath] = enabled;
    localStorage.setItem(WRAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
