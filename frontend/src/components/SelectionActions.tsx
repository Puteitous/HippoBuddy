/**
 * SelectionActions - 文本选中快捷操作(阶段 3.7-2,阶段 3.8 升级行号)
 *
 * 对标旧版 components/selection-actions.js(248 行 → React 版本)。
 *
 * 职责:
 *  1. 监听 document 的 selectionchange 事件
 *  2. 在可选中区域选中文本时,显示浮动按钮(定位在选区末尾下方)
 *  3. 点击按钮将选中文本通过 eventBus 发送到聊天输入框(生成 RefChip)
 *
 * 支持区域(映射新版实际 DOM class):
 *  - .file-preview-editor(文件预览 CM6 编辑器,3.8)→ 文件引用(@path + 行号 + 选中片段)
 *  - .msg-markdown / .msg-user-text / .msg-reasoning-content-inner(聊天消息)
 *  - .tool-card / .tool-body / .bash-output(工具卡片代码区)
 *
 * 阶段 3.8 升级:
 *  - 文件预览从 <pre> 升级为 CM6 编辑器,选择器由 .file-preview-text 改为 .file-preview-editor
 *  - 从容器 DOM 的 _cmPreviewView(CM6 EditorView)读取选中行号(对齐旧版 calcLineNumbers)
 *  - 行数 ≤ 50 时内联携带选中片段(省去 LLM 一次 read_file)
 */
import { useEffect, useRef, useState } from 'react';
import { emit } from '@/utils/eventBus';
import type { SelectionAddToInputPayload } from '@/utils/eventBus';
import './SelectionActions.css';

/** 选中区域内才显示按钮(对齐旧版 SELECTABLE_AREAS,映射新版实际 DOM class) */
const SELECTABLE_AREAS = [
  '.file-preview-editor',
  '.msg-markdown',
  '.msg-user-text',
  '.msg-reasoning-content-inner',
  '.tool-card',
  '.tool-body',
  '.bash-output',
].join(',');

/** 行数 ≤ 50 时内联携带选中片段(对齐旧版 LINE_THRESHOLD) */
const LINE_THRESHOLD = 50;

/** CM6 EditorView 实例(挂载在容器 DOM 上,由 FilePreviewEditor 写入) */
interface CmHost extends HTMLElement {
  _cmPreviewView?: {
    state: {
      selection: { main: { from: number; to: number } };
      doc: {
        lineAt: (pos: number) => { number: number };
        lines: number;
        sliceString: (from: number, to: number) => string;
      };
    };
  } | null;
}

const BUTTON_HEIGHT = 32;
const GAP = 8;

interface Pos {
  x: number;
  y: number;
}

export function SelectionActions() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  // ── 计算选区位置(对齐旧版 getSelectionPosition 核心逻辑) ──────
  const getSelectionPosition = (): Pos | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (!isInSelectableArea(container)) return null;

    // 判断选择方向:从下往上选时,折叠到开头(真正的视觉末尾)
    const isBackwards = (() => {
      if (!selection.anchorNode || !selection.focusNode) return false;
      const pos = selection.anchorNode.compareDocumentPosition(selection.focusNode);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return true; // focus 在 anchor 之前 → 反向
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return false; // focus 在 anchor 之后 → 正向
      // 同一节点,比较 offset
      return selection.anchorOffset > selection.focusOffset;
    })();

    const endRange = range.cloneRange();
    endRange.collapse(isBackwards); // 反向选择时折叠到开头而非末尾
    let rect = endRange.getBoundingClientRect();
    if (!rect) return null;

    // 瞬态零坐标修复:拖选过程中 collapse() 偶尔返回 (0,0) 零高度矩形
    if (rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0) {
      const rects = range.getClientRects();
      if (rects.length > 0) {
        rect = isBackwards ? rects[0] : rects[rects.length - 1];
      } else {
        return null;
      }
    }

    // 检查选区末尾是否还在容器的可视区域内(选区滚出视口时隐藏按钮)
    const selectableEl = toElement(container)?.closest(SELECTABLE_AREAS);
    if (selectableEl) {
      const containerRect = selectableEl.getBoundingClientRect();
      const margin = 2; // 允许 2px 容差
      if (
        rect.bottom < containerRect.top - margin ||
        rect.top > containerRect.bottom + margin ||
        rect.right < containerRect.left - margin ||
        rect.left > containerRect.right + margin
      ) {
        return null; // 选区已滚出可视区域(垂直或水平方向)
      }
    }

    return { x: rect.left, y: rect.bottom };
  };

  /** 显示/隐藏按钮:默认在选区下方,太靠下则显示在上方 */
  const updateBtn = (p: Pos | null) => {
    if (!p) {
      setVisible(false);
      return;
    }
    let top = p.y + GAP;
    if (top + BUTTON_HEIGHT + GAP > window.innerHeight) {
      top = p.y - BUTTON_HEIGHT - GAP;
    }
    setPos({ x: p.x, y: top });
    setVisible(true);
  };

  // ── 点击:把选中文本发送到输入框 ───────────────────────────
  const handleClick = () => {
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    // 先隐藏按钮,再清除选区(避免 selectionchange 连锁)
    setVisible(false);
    if (!text) return;

    // 文件预览区选中 → 升级为文件引用(@path + 行号 + 选中片段)
    const anchorEl = toElement(selection.anchorNode);
    const previewHost = anchorEl?.closest?.('.file-preview-editor') as CmHost | null;
    const filePath = previewHost?.dataset.filePath;
    const cmView = previewHost?._cmPreviewView;

    const payload: SelectionAddToInputPayload = filePath
      ? buildFilePayload(filePath, cmView, text)
      : { text, refType: 'text' };

    emit('selection:add-to-input', payload);

    selection.removeAllRanges();
  };

  // ── 全局监听(挂载一次,卸载清理) ─────────────────────────
  useEffect(() => {
    const onSelectionChange = () => updateBtn(getSelectionPosition());

    const onMouseDown = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    // 滚动时重新定位(raf 节流)
    const onScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateBtn(getSelectionPosition());
      });
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      className="selection-action-btn"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      title="添加到输入框"
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 11l4-7 4 7" />
        <line x1="5.5" y1="9" x2="10.5" y2="9" />
        <line x1="3" y1="13" x2="13" y2="13" strokeWidth="1" />
      </svg>
      添加到输入框
    </button>
  );
}

/** 选区所在的容器是否在可选中区域内 */
function isInSelectableArea(node: Node | null): boolean {
  if (!node) return false;
  const el = toElement(node);
  if (!el) return false;
  return !!el.closest(SELECTABLE_AREAS);
}

/** 把 Node 归一化为 Element(文本节点取父元素) */
function toElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/**
 * 构造文件引用 payload(对齐旧版 selection-actions.js):
 *  - CM6 view 存在时计算选中行号(startLine/endLine)
 *  - 行数 ≤ LINE_THRESHOLD 时内联携带选中片段(省去 LLM 一次 read_file)
 *  - 无 CM6 view(理论不会发生,编辑器未就绪)时降级为纯路径引用
 */
function buildFilePayload(
  filePath: string,
  cmView: CmHost['_cmPreviewView'],
  selectedText: string,
): SelectionAddToInputPayload {
  if (cmView) {
    try {
      const sel = cmView.state.selection.main;
      const startLine = cmView.state.doc.lineAt(sel.from).number;
      const endLine = cmView.state.doc.lineAt(sel.to).number;
      const lineCount = endLine - startLine + 1;
      // 行数 ≤ LINE_THRESHOLD 时内联携带选中片段(省去 LLM 一次 read_file);
      // 超过阈值仅发 @path:start-end,不携带全量文本(对齐旧版)
      // 注意:sliceString 是 Text 的方法;sliceDoc 是 EditorState 的方法,不能挂在 doc 上
      const sliced = lineCount <= LINE_THRESHOLD ? cmView.state.doc.sliceString(sel.from, sel.to) : undefined;
      return {
        text: filePath,
        refType: 'file',
        filePath,
        startLine,
        endLine,
        selectedText: sliced,
      };
    } catch {
      // CM 状态异常时降级为纯路径引用
      return { text: filePath, refType: 'file', filePath, selectedText };
    }
  }
  return { text: filePath, refType: 'file', filePath, selectedText };
}
