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
}: FilePreviewEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let view: EditorView | null = null;
    let cancelled = false;
    const themeCompartment = new Compartment();
    const langCompartment = new Compartment();

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
        // 编辑时通知父组件置 dirty(供保存按钮/标签标记)
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onDocChangeRef.current?.();
        }),
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

    // 可选:定位到指定行(1-based)
    if (startLine != null && view) {
      const lineNo = Math.min(Math.max(1, startLine), view.state.doc.lines);
      const pos = view.state.doc.line(lineNo).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
    }

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

    return () => {
      cancelled = true;
      darkMedia.removeEventListener('change', onMediaChange);
      themeObserver.disconnect();
      view?.destroy();
      view = null;
      (host as HTMLElement & { _cmPreviewView?: EditorView })._cmPreviewView = undefined;
    };
    // content/filePath 变化时重建编辑器(FilePreview 用 key 控制,这里双保险)
  }, [filePath, content, startLine, endLine]);

  return <div ref={hostRef} className="file-preview-editor" data-file-path={filePath} />;
}

/** 取文件扩展名(小写,不含点) */
function getExt(path: string): string {
  if (!path) return '';
  const clean = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}
