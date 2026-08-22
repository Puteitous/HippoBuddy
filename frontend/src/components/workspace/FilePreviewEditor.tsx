/**
 * FilePreviewEditor - CodeMirror 6 编辑器(阶段 3.8)
 *
 * 职责:把文件文本内容渲染为语法高亮的 CM6 编辑器,支持编辑与 Mod-s 保存。
 *
 * 设计决策:
 *  - 语言包按扩展名动态 import(vite 自动分包),不全部打进主 bundle
 *  - 主题跟随 data-theme(oneDark 深色 / vsCodeLight 浅色),用 Compartment 切换
 *  - 可编辑:history() + defaultKeymap 提供撤销/缩进等编辑能力;Mod-s 触发 onSave
 *  - 脏追踪:updateListener 监听 docChanged → onDocChange 通知(父组件维护 dirty 状态)
 *  - 暴露 view:onViewReady 回调 + 挂到容器 DOM 的 _cmPreviewView(供 SelectionActions 计算行号)
 *  - search() 扩展内置:高亮所有匹配 + SearchQuery 状态(SearchPanel 消费)
 *
 * 与旧版 FilePreview.js(CM6 编辑器)对齐:
 *  - 旧版可编辑 + Mod-s 保存 + onDirtyChange;本组件同步对齐
 */
import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { history, defaultKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
import type { LanguageSupport } from '@codemirror/language';
import { fileApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import {
  computeDiffInfo,
  buildDiffGutter,
  computeOverviewMarkers,
  type DiffLineInfo,
  type OverviewLineBlock,
} from '@/utils/editor-diff';
import {
  readScrollPosition,
  writeScrollPosition,
  type SavedScrollPosition,
} from '@/utils/scroll-positions';
import './FilePreviewEditor.css';

/**
 * 依据 <html data-theme> 与系统偏好解析编辑器是否深色(对齐 themeStore):
 *  - data-theme=light → 浅色;dark / midnight → 深色
 *  - 无 data-theme 或 system → 跟随系统 prefers-color-scheme
 */
function resolveIsDark(): boolean {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light') return false;
  if (theme === 'dark' || theme === 'midnight') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface FilePreviewEditorProps {
  /** 文件绝对路径(用于扩展名推断语言) */
  filePath: string;
  /** 文件文本内容 */
  content: string;
  /** 可选:打开时定位的起始行(1-based,滚动到中间) */
  startLine?: number;
  /** 可选:打开时定位的结束行 */
  endLine?: number;
  /** 编辑器实例就绪回调(供 SearchPanel / 父组件使用) */
  onViewReady?: (view: EditorView) => void;
  /** 文档发生编辑时回调(父组件据此置 dirty) */
  onDocChange?: () => void;
  /** 保存回调(Mod-s 触发;由父组件负责写入文件) */
  onSave?: (content: string) => void;
  /** 保存成功版本号:父组件每次成功写入文件后自增,触发编辑器清空 diff 基线(对齐旧版保存后清基线) */
  saveRevision?: number;
  /** 自动换行(对齐旧版 previewWrapBtn,通过 Compartment 动态切换,不重建编辑器) */
  wrapEnabled?: boolean;
}

/** 扩展名 → 语言标识(对齐旧版支持的 13 种语言) */
const CODE_EXT: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'css',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  svg: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  rs: 'rust',
  php: 'php',
  go: 'go',
};

/** 动态加载语言支持(按需分包) */
async function loadLanguage(lang: string): Promise<LanguageSupport | null> {
  switch (lang) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'sass':
      return (await import('@codemirror/lang-sass')).sass();
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown();
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml();
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust();
    case 'php':
      return (await import('@codemirror/lang-php')).php();
    case 'go':
      return (await import('@codemirror/lang-go')).go();
    default:
      return null;
  }
}

export function FilePreviewEditor({
  filePath,
  content,
  startLine,
  endLine,
  onViewReady,
  onDocChange,
  onSave,
  saveRevision,
  wrapEnabled = false,
}: FilePreviewEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // 主 effect 创建编辑器时写入 wrap Compartment,供切换 effect 动态 reconfigure
  const wrapCompartmentRef = useRef<Compartment | null>(null);
  const wrapViewRef = useRef<EditorView | null>(null);
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // 供 updateListener 在 docChanged 时触发 diff 防抖重算(ref 持有,避免闭包捕获过期)
  const scheduleDiffRefreshRef = useRef<(() => void) | null>(null);
  // 供 saveRevision 变化 effect 触发清空 diff 基线标记
  const clearDiffRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let view: EditorView | null = null;
    let cancelled = false;
    const themeCompartment = new Compartment();
    const langCompartment = new Compartment();
    // 自动换行 Compartment(对齐旧版 wrap,可动态 reconfigure 不重建编辑器)
    const wrapCompartment = new Compartment();
    // diff 基线 Compartment(AI 变更标记;基线就绪后 reconfigure 注入,保存后置空清除)
    const diffCompartment = new Compartment();

    const theme = resolveIsDark() ? oneDark : vsCodeLight;

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([
          // Mod-s 保存(对齐旧版),保存成功后由父组件清 dirty
          { key: 'Mod-s', run: () => { onSaveRef.current?.(view!.state.doc.toString()); return true; } },
          ...defaultKeymap,
        ]),
        lineNumbers(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search(),
        wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : []),
        // 编辑时通知父组件置 dirty(供保存按钮/标签标记) + 防抖重算 AI diff 标记
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onDocChangeRef.current?.();
            scheduleDiffRefreshRef.current?.();
          }
          // 选中文字时挂 has-selection 类,隐藏 .cm-activeLine(对齐旧版,避免与选中背景视觉冲突)
          if (update.selectionSet) {
            host.classList.toggle('has-selection', update.state.selection.ranges.some((r) => !r.empty));
          }
        }),
        diffCompartment.of([]), // 暂不启用 diff,等基线就绪后 reconfigure 注入
        themeCompartment.of(theme),
        langCompartment.of([]),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "var(--hb-mono, 'JetBrains Mono', 'Consolas', 'Monaco', monospace)" },
          '.cm-content': { fontFamily: "var(--hb-mono, 'JetBrains Mono', 'Consolas', 'Monaco', monospace)", fontSize: '12.5px' },
        }),
      ],
    });

    view = new EditorView({ state, parent: host });

    // 语言按需加载(扩展名 → 语言包),加载完成后 reconfigure
    const ext = getExt(filePath);
    const lang = CODE_EXT[ext];
    if (lang) {
      void loadLanguage(lang).then((support) => {
        if (cancelled || !view || !support) return;
        view.dispatch({ effects: langCompartment.reconfigure(support) });
      });
    }

    // 滚动位置恢复/定位(对齐旧版):
    //   - 有已存滚动位置 → 恢复(保持上次阅读位置;AI 改文件 reload 重建后不丢位置)
    //   - 无已存位置但有 startLine → 用 startLine 定位(工具卡片跳转,对齐旧版 scrollToLine 覆盖)
    const savedScroll = readScrollPosition(filePath);
    if (savedScroll != null) {
      restoreScrollPosition(view, savedScroll);
    } else if (startLine != null) {
      const lineNo = Math.min(Math.max(1, startLine), view.state.doc.lines);
      const pos = view.state.doc.line(lineNo).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
    }

    // ── 滚动位置持久化:滚动节流 1.5s 保存 + beforeunload 保存 + 卸载保存(对齐旧版) ──
    let scrollThrottleTimer: number | null = null;
    const onScroll = () => {
      if (scrollThrottleTimer != null) return;
      scrollThrottleTimer = window.setTimeout(() => {
        scrollThrottleTimer = null;
        if (view) writeScrollPosition(filePath, captureScrollPos(view));
      }, 1500);
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    const onBeforeUnload = () => {
      if (view) writeScrollPosition(filePath, captureScrollPos(view));
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // 主题对齐 <html data-theme>:手动主题(light/dark/midnight)优先,无或 system 回退系统偏好。
    // 同时监听 data-theme 变化(MutationObserver)与系统偏好变化,切换时 reconfigure。
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const applyResolvedTheme = () => {
      view?.dispatch({ effects: themeCompartment.reconfigure(resolveIsDark() ? oneDark : vsCodeLight) });
    };
    const onMediaChange = () => {
      if (!document.documentElement.getAttribute('data-theme')) applyResolvedTheme();
    };
    darkMedia.addEventListener('change', onMediaChange);
    const themeObserver = new MutationObserver(applyResolvedTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // 暴露 view:回调 + DOM 引用(对齐旧版 previewContent._cmPreviewView,供 SelectionActions 读行号)
    (host as HTMLElement & { _cmPreviewView?: EditorView })._cmPreviewView = view;
    onViewReadyRef.current?.(view);
    // 存供 wrap 切换 effect 使用
    wrapCompartmentRef.current = wrapCompartment;
    wrapViewRef.current = view;

    // ── AI 变更标记(diff 基线高亮,对齐旧版 FilePreview.js) ──
    // 1) 异步取当前会话内该文件 AI 修改前的原始内容作基线
    // 2) 注入整行背景(decoSet)+ 行号 gutter 竖条 + 滚动条色带(overview)
    // 3) 编辑后防抖重算;保存成功后由父组件增 saveRevision → 清空基线清除标记
    let originalContent: string | null | undefined = undefined;
    let lineInfo: Map<number, DiffLineInfo> | null = null;
    let diffRefreshTimer: number | null = null;
    let diffOverviewEl: HTMLDivElement | null = null;
    let diffOverviewRO: ResizeObserver | null = null;

    const rebuildDiffDecorations = () => {
      if (!view || originalContent == null) return;
      const { decoSet, lineInfo: li } = computeDiffInfo(view.state.doc, originalContent);
      lineInfo = li;
      view.dispatch({
        effects: diffCompartment.reconfigure([
          EditorView.decorations.of(decoSet),
          ...buildDiffGutter(li),
        ]),
      });
      renderDiffOverview();
    };

    // 编辑后防抖重算 diff 标记:仅当存在 AI 基线时生效(保存后基线清空不再重算)
    const scheduleDiffRefresh = () => {
      if (!view || originalContent == null) return;
      if (diffRefreshTimer != null) window.clearTimeout(diffRefreshTimer);
      diffRefreshTimer = window.setTimeout(() => {
        diffRefreshTimer = null;
        rebuildDiffDecorations();
      }, 300);
    };
    scheduleDiffRefreshRef.current = scheduleDiffRefresh;

    // 清空 diff 标记:保存成功后调用(父组件增 saveRevision),清基线并移除全部标记
    const clearDiff = () => {
      if (diffRefreshTimer != null) {
        window.clearTimeout(diffRefreshTimer);
        diffRefreshTimer = null;
      }
      originalContent = null;
      lineInfo = null;
      removeDiffOverview();
      if (view) {
        view.dispatch({ effects: diffCompartment.reconfigure([]) });
      }
    };
    clearDiffRef.current = clearDiff;

    const stopDiffOverviewObserver = () => {
      if (diffOverviewRO) {
        diffOverviewRO.disconnect();
        diffOverviewRO = null;
      }
    };
    const removeDiffOverview = () => {
      stopDiffOverviewObserver();
      if (diffOverviewEl) {
        diffOverviewEl.remove();
        diffOverviewEl = null;
      }
    };
    const renderDiffOverview = () => {
      if (!view || !lineInfo || lineInfo.size === 0 || originalContent == null) {
        removeDiffOverview();
        return;
      }
      const scrollDOM = view.scrollDOM;
      const docHeight = scrollDOM.scrollHeight;
      const stripHeight = scrollDOM.clientHeight;
      if (!(docHeight > 0) || !(stripHeight > 0)) return;

      const lineBlocks: OverviewLineBlock[] = [];
      const DELETED_BLOCK_HEIGHT = 2;
      for (const [lineNum, info] of lineInfo) {
        if (info.type === 'deleted') {
          const anchorLine = Math.min(lineNum, view.state.doc.lines);
          let top = 0;
          if (anchorLine >= 1) {
            const block = view.lineBlockAt(view.state.doc.line(anchorLine).from);
            if (block) top = block.top;
          }
          lineBlocks.push({ top, bottom: top + DELETED_BLOCK_HEIGHT, type: 'deleted' });
          continue;
        }
        const block = view.lineBlockAt(view.state.doc.line(lineNum).from);
        if (!block) continue;
        lineBlocks.push({ top: block.top, bottom: block.bottom, type: info.type });
      }
      if (lineBlocks.length === 0) {
        removeDiffOverview();
        return;
      }

      const markers = computeOverviewMarkers(lineBlocks, docHeight, stripHeight);
      if (!diffOverviewEl) {
        const el = document.createElement('div');
        el.className = 'cm-diff-overview';
        view.dom.appendChild(el);
        diffOverviewEl = el;
      }
      const host = diffOverviewEl;
      host.textContent = '';
      for (const m of markers) {
        const seg = document.createElement('div');
        seg.className = `cm-diff-overview-marker ${m.type}`;
        seg.style.top = m.top + 'px';
        seg.style.height = m.height + 'px';
        host.appendChild(seg);
      }

      // 尺寸变化(窗口 resize / 面板开合)时按新比例重算
      if (typeof ResizeObserver !== 'undefined' && !diffOverviewRO) {
        diffOverviewRO = new ResizeObserver(() => renderDiffOverview());
        diffOverviewRO.observe(scrollDOM);
      }
    };

    // 拉取基线并激活标记
    const sessionId = useAppStore.getState().currentSessionId;
    void (async () => {
      if (cancelled || !view) return;
      try {
        const resp = await fileApi.getDiffOriginal(filePath, sessionId ?? undefined);
        if (cancelled) return;
        // 无基线(空对象 / content 为 null)时不显示标记
        if (resp.content === undefined || resp.content === null) {
          originalContent = null;
          return;
        }
        originalContent = resp.content;
        rebuildDiffDecorations();
      } catch {
        // 静默失败:无基线时不做 diff 标记
      }
    })();

    // 编辑后防抖重算由 updateListener.docChanged 触发(scheduleDiffRefreshRef),无需 DOM 监听

    return () => {
      cancelled = true;
      if (diffRefreshTimer != null) window.clearTimeout(diffRefreshTimer);
      removeDiffOverview();
      scheduleDiffRefreshRef.current = null;
      clearDiffRef.current = null;
      // 卸载前保存当前滚动位置(切换文件/内容重建/收起面板时均不丢位置)
      if (view) writeScrollPosition(filePath, captureScrollPos(view));
      if (scrollThrottleTimer != null) window.clearTimeout(scrollThrottleTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      view?.scrollDOM.removeEventListener('scroll', onScroll);
      darkMedia.removeEventListener('change', onMediaChange);
      themeObserver.disconnect();
      view?.destroy();
      view = null;
      wrapCompartmentRef.current = null;
      wrapViewRef.current = null;
      (host as HTMLElement & { _cmPreviewView?: EditorView })._cmPreviewView = undefined;
    };
    // content/filePath 变化时重建编辑器(FilePreview 用 key 控制,这里双保险)
  }, [filePath, content, startLine, endLine]);

  // 自动换行动态切换(对齐旧版:通过 Compartment reconfigure,不重建编辑器、不丢光标/滚动)
  useEffect(() => {
    const view = wrapViewRef.current;
    const comp = wrapCompartmentRef.current;
    if (!view || !comp) return;
    view.dispatch({ effects: comp.reconfigure(wrapEnabled ? EditorView.lineWrapping : []) });
  }, [wrapEnabled]);

  // 保存成功后清空 diff 基线:父组件每次成功写入文件自增 saveRevision,
  // 此处监听到变化即触发 clearDiff(保存 = 接受内容,AI 变更标记使命完成,对齐旧版)
  const prevSaveRevisionRef = useRef(saveRevision ?? 0);
  useEffect(() => {
    const prev = prevSaveRevisionRef.current;
    const cur = saveRevision ?? 0;
    if (cur !== prev) {
      prevSaveRevisionRef.current = cur;
      clearDiffRef.current?.();
    }
  }, [saveRevision]);

  return <div ref={hostRef} className="file-preview-editor" data-file-path={filePath} />;
}

/** 取文件扩展名(小写,不含点) */
function getExt(path: string): string {
  if (!path) return '';
  const clean = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

// ============================================================================
// 滚动位置捕获/恢复(对齐旧版 FilePreview.js 的 _captureScrollPosition / tryRestoreScroll)
// ============================================================================

/**
 * 捕获当前滚动位置,存为 { line, offset }:
 *   line   = 视口顶部所在文档行号(内容变化后仍可定位)
 *   offset = 该行内已滚过的像素偏移(行高未变时精确还原)
 */
function captureScrollPos(view: EditorView): { line: number; offset: number } {
  const scrollDOM = view.scrollDOM;
  const top = scrollDOM.scrollTop;
  let pos = { line: 1, offset: 0 };
  if (top > 0) {
    try {
      const block = view.lineBlockAtHeight(top);
      if (block && block.from != null) {
        const lineNo = view.state.doc.lineAt(block.from).number;
        pos = { line: lineNo, offset: Math.max(0, top - block.top) };
      }
    } catch {
      pos = { line: 1, offset: 0 };
    }
  }
  return pos;
}

/**
 * 恢复到上次保存的滚动位置。等待 CM6 完成布局(有可滚动内容)后再设置,
 * 最多重试 30 帧(≈500ms),大文件渲染慢也不至于丢失(对齐旧版 tryRestoreScroll)。
 * 兼容旧版纯数字(scrollTop 像素)格式。
 */
function restoreScrollPosition(view: EditorView, saved: SavedScrollPosition): void {
  const tryRestore = (attempt: number) => {
    if (!view || attempt > 30) return;
    const scrollDOM = view.scrollDOM;
    if (scrollDOM.scrollHeight > scrollDOM.clientHeight) {
      let target = 0;
      if (typeof saved === 'object') {
        try {
          const lineNo = Math.min(saved.line, view.state.doc.lines);
          const docLine = view.state.doc.line(lineNo);
          target = view.lineBlockAt(docLine.from).top + (saved.offset || 0);
        } catch {
          target = 0;
        }
      } else {
        target = saved;
      }
      scrollDOM.scrollTop = target;
    } else {
      requestAnimationFrame(() => tryRestore(attempt + 1));
    }
  };
  requestAnimationFrame(() => tryRestore(0));
}
