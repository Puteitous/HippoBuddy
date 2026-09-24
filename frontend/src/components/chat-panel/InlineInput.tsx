/**
 * InlineInput - 行内芯片输入框
 *
 * 用 contenteditable div 替换 textarea，支持文件引用芯片作为行内元素嵌入文本中。
 * 用户可以在芯片前后自由输入文字，芯片为不可编辑的 inline-block 标签。
 *
 * 暴露方法(通过 ref):
 *  - insertChipAtCursor(chip): 在光标位置插入芯片
 *  - getContent(): 序列化为 { text, chips }，保留文本与芯片的混合顺序
 *  - clear(): 清空内容
 *  - focus(): 聚焦
 *  - setContent(text): 设置纯文本内容(草稿恢复/预设填充)
 *  - getTextContent(): 获取纯文本内容
 */
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import type { RefChip } from '@/types';
import { usePreviewStore } from '@/stores/previewStore';
import { getFileIconUrl } from '@/utils/file-icons';
import { desktopBridge, toRelativePath } from '@/utils/desktop-bridge';
import {
  buildPastedPreview,
  createPastedTextChip,
  shouldConvertPasteToChip,
} from '@/utils/paste-attachment';
import { translate } from '@/i18n';
import './InlineInput.css';

/**
 * paste 芯片正文的旁路存储(芯片元素 → 完整原文)。
 *
 * 为什么不写进 dataset:
 *  - serializeContent 在每次输入时都会执行,若把几千字塞进 dataset.chip,
 *    等于每次按键都 JSON.parse 一份大字符串,与「转芯片为了流畅」的初衷相悖;
 *  - 超长字符串作为 DOM 属性也会白占内存。
 * 以元素为 WeakMap 键:芯片被移除/替换后随元素被 GC 回收,无需手动清理。
 */
const chipContentStore = new WeakMap<HTMLElement, string>();

/**
 * 外部拖入但取不到真实路径(浏览器 dev)时的文本兜底上限。
 * 仅对小文本文件读内容转 paste chip,避免大文件/二进制读进输入框。
 */
const MAX_DROPPED_TEXT_BYTES = 512 * 1024;

/** 判断是否为图片文件(拖入时 OS 文件常带空 MIME,需按扩展名兜底) */
function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(file.name);
}

/** 判断是否可尝试按文本读取(MIME 或常见文本扩展名) */
function isLikelyTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type.startsWith('application/json') || file.type.startsWith('application/xml') ||
      file.type.startsWith('application/javascript') || file.type.startsWith('application/x-')) return true;
  return /\.(txt|md|log|json|xml|yml|yaml|csv|tsv|js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|hpp|css|scss|html|sh|bat|cmd|ps1|sql|ini|conf|toml|env|gitignore|dockerfile)$/i.test(file.name);
}


/** 从 chip 提取文件名(用于扩展名图标解析);无路径时返回 null → 回落通用图标 */
function getChipFileName(chip: RefChip): string | null {
  // text/paste 芯片的 text 是展示标签而非路径,不能据此解析扩展名
  if (chip.kind === 'text' || chip.kind === 'paste') return null;
  const path = chip.filePath || chip.text;
  if (!path) return null;
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

export interface InlineInputHandle {
  insertChipAtCursor: (chip: RefChip) => void;
  /** 按 filePath 移除匹配的芯片(用于技能取消选中等场景) */
  removeChipByFilePath: (filePath: string) => boolean;
  getContent: () => { text: string; chips: RefChip[] };
  clear: () => void;
  focus: () => void;
  setContent: (text: string) => void;
  /** 恢复「文本+芯片」完整结构(草稿恢复) */
  restore: (state: { text: string; chips: RefChip[] }) => void;
  getTextContent: () => string;
}

interface InlineInputProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: () => void;
  onChipAdd?: (chip: RefChip) => void;
  /** 粘贴图片时回调 */
  onPasteImage?: (blob: Blob, name: string) => void;
  /** 芯片列表变化时通知父组件(用于外部感知是否有内容) */
  onContentChange?: (hasContent: boolean) => void;
  /** 内容实时变化时通知父组件(用于按会话保存草稿,区分于按钮态的翻转语义) */
  onDraftChange?: (content: { text: string; chips: RefChip[] }) => void;
}

// ── 工具函数 ──────────────────────────────────────────────

/** 创建芯片 DOM 元素 */
function createChipElement(chip: RefChip): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.contentEditable = 'false';
  wrapper.className = 'inline-chip';
  if (chip.kind === 'paste' && chip.selectedText != null) {
    // 超长粘贴文本:正文存旁路,dataset 只留元数据(selectedText 置 undefined 后
    // 被 JSON.stringify 丢弃),避免长文本进 DOM 属性并在每次序列化时被重新解析
    chipContentStore.set(wrapper, chip.selectedText);
    wrapper.dataset.chip = JSON.stringify({ ...chip, selectedText: undefined });
  } else {
    wrapper.dataset.chip = JSON.stringify(chip);
  }

  // 文件引用:按扩展名显示与文件树一致的彩色图标;rule/paste/text 回落 emoji
  const fileName = getChipFileName(chip);
  const icon =
    chip.kind === 'file' && fileName
      ? (() => {
          const img = document.createElement('img');
          img.className = 'inline-chip-icon';
          img.src = getFileIconUrl(fileName, false);
          img.alt = '';
          img.draggable = false;
          img.loading = 'lazy';
          return img;
        })()
      : (() => {
          const span = document.createElement('span');
          span.className = 'inline-chip-icon';
          span.textContent = chip.kind === 'rule' ? '📋' : chip.kind === 'paste' ? '📄' : '💬';
          return span;
        })();

  const text = document.createElement('span');
  text.className = 'inline-chip-text';
  text.textContent = chip.text;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'inline-chip-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.dataset.action = 'remove-chip';
  closeBtn.tabIndex = -1;

  // paste 芯片:title 给出摘要预览 + 展开提示,便于确认粘贴内容
  if (chip.kind === 'paste') {
    wrapper.title = `${translate('chat.pastedTextChipHint')}\n\n${buildPastedPreview(
      chip.selectedText ?? '',
    )}`;
  }

  // 文件引用:统一标记可点击跳转(对齐旧版 input-ref-chip-navigable),
  // 带行号时在文件名后显示 start-end 行号徽标(对齐旧版 input-ref-chip-lines);
  // title 展示完整路径 + 行号,文件名截断时可 hover 查看
  if (chip.kind === 'file' && chip.filePath) {
    wrapper.classList.add('inline-chip-navigable');
    const hasLines = chip.startLine != null && chip.endLine != null;
    wrapper.title = hasLines ? `${chip.filePath}:${chip.startLine}-${chip.endLine}` : chip.filePath;
    if (hasLines) {
      const lines = document.createElement('span');
      lines.className = 'inline-chip-lines';
      lines.textContent = `${chip.startLine}-${chip.endLine}`;
      wrapper.append(icon, text, lines, closeBtn);
    } else {
      wrapper.append(icon, text, closeBtn);
    }
  } else {
    wrapper.append(icon, text, closeBtn);
  }
  return wrapper;
}

/** 在光标位置插入芯片，返回是否成功插入 */
function insertChipAtDom(editor: HTMLElement, chip: RefChip): boolean {
  const sel = window.getSelection();
  if (!sel) return false;

  const wrapper = createChipElement(chip);
  const zwsp = document.createTextNode('\u200B');

  if (sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(wrapper);
    // 芯片后插入零宽空格，使光标可以停在芯片后面
    range.setStartAfter(wrapper);
    range.insertNode(zwsp);
    range.setStartAfter(zwsp);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // 选区不在编辑器内 → 追加到末尾
    editor.appendChild(wrapper);
    editor.appendChild(zwsp);
    // 光标移到末尾
    const range = document.createRange();
    range.setStartAfter(zwsp);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return true;
}

/**
 * 在 contenteditable 中按空格时提取 @path 为芯片。
 * 从光标位置往前取一个 word，若以 @ 开头则提取为 chip 并替换。
 */
function extractAtPathOnSpace(): RefChip | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const { startContainer, startOffset } = range;

  // 光标必须在文本节点中
  if (startContainer.nodeType !== Node.TEXT_NODE) return null;
  const textNode = startContainer as Text;
  const text = textNode.textContent || '';

  // 前一个字符应该就是空格，我们找空格前的 word
  let wordStart = startOffset - 1;
  // 跳过刚刚输入的空格
  if (wordStart > 0 && text[wordStart] === ' ') wordStart--;
  while (wordStart > 0 && text[wordStart] !== ' ' && text[wordStart] !== '\n' && text[wordStart] !== '\u200B') {
    wordStart--;
  }
  if ((text[wordStart] === ' ' || text[wordStart] === '\n' || text[wordStart] === '\u200B')) {
    wordStart++;
  }

  const word = text.slice(wordStart, startOffset).trim();
  if (!word.startsWith('@')) return null;

  const pathPart = word.slice(1);
  if (!pathPart) return null;

  // 解析行号: @path:1-10
  let filePath = pathPart;
  let startLine: number | undefined;
  let endLine: number | undefined;
  const lineMatch = pathPart.match(/^(.+?):(\d+)-(\d+)$/);
  if (lineMatch) {
    filePath = lineMatch[1];
    startLine = parseInt(lineMatch[2], 10);
    endLine = parseInt(lineMatch[3], 10);
  }

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  const chip: RefChip = {
    id: `path-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'file',
    text: fileName,
    filePath,
    startLine,
    endLine,
  };

  // 从文本节点中移除 @path 部分
  const before = text.slice(0, wordStart);
  const after = text.slice(startOffset);
  textNode.textContent = before + after;

  // 如果文本节点有剩余内容，chip 插在文本节点后面
  if (before || after) {
    textNode.parentNode?.insertBefore(createChipElement(chip), textNode.nextSibling);
    const zwsp = document.createTextNode('\u200B');
    textNode.parentNode?.insertBefore(zwsp, textNode.nextSibling);
    // 光标移到零宽空格后
    const newRange = document.createRange();
    newRange.setStartAfter(zwsp);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    // 文本节点空了，用 chip 元素替换
    const chipEl = createChipElement(chip);
    textNode.parentNode?.replaceChild(chipEl, textNode);
    const zwsp = document.createTextNode('\u200B');
    chipEl.parentNode?.insertBefore(zwsp, chipEl.nextSibling);
    const newRange = document.createRange();
    newRange.setStartAfter(zwsp);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  return chip;
}

/** 序列化编辑器内容为文本 + 芯片列表 */
function serializeContent(editor: HTMLElement | null): { text: string; chips: RefChip[] } {
  if (!editor) return { text: '', chips: [] };

  const chips: RefChip[] = [];
  const textParts: string[] = [];

  // 换行结构：<br> 或块级元素（div/p/li 等）代表一次换行，否则多行会拼成一行
  const isBreakTag = (el: HTMLElement) => el.tagName === 'BR';

  const isBlockElement = (el: HTMLElement) =>
    ['DIV', 'P', 'LI', 'UL', 'OL', 'TR', 'TD', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'FOOTER', 'HR'].includes(el.tagName);

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\u200B/g, '');
      if (t) textParts.push(t);
    } else if (node instanceof HTMLElement) {
      if (node.classList.contains('inline-chip')) {
        try {
          const chip = JSON.parse(node.dataset.chip || '{}') as RefChip;
          if (chip.id) {
            // paste 芯片正文不在 dataset 中,从旁路存储回填,
            // 保证草稿保存与发送组装拿到的是完整原文
            if (chip.kind === 'paste') {
              const content = chipContentStore.get(node);
              if (content != null) chip.selectedText = content;
            }
            chips.push(chip);
          }
        } catch {
          // 解析失败，跳过
        }
      } else if (isBreakTag(node)) {
        // <br> 触发换行
        textParts.push('\n');
      } else if (isBlockElement(node)) {
        // 块级元素：先遍历内容，再补一个换行表示块结束
        node.childNodes.forEach(walk);
        textParts.push('\n');
      } else {
        node.childNodes.forEach(walk);
      }
    }
  }

  editor.childNodes.forEach(walk);

  return {
    text: textParts.join('').trim(),
    chips,
  };
}

/** 检查编辑器是否有内容(文本或芯片) */
function editorHasContent(editor: HTMLElement | null): boolean {
  if (!editor) return false;
  if (editor.querySelector('.inline-chip')) return true;
  const text = (editor.textContent || '').replace(/\u200B/g, '').trim();
  return text.length > 0;
}

// ── 组件 ───────────────────────────────────────────────────

const InlineInput = forwardRef<InlineInputHandle, InlineInputProps>((props, ref) => {
  const { placeholder = '', disabled = false, onSend, onChipAdd, onPasteImage, onContentChange, onDraftChange } = props;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);
  // 拖拽悬停态(外部文件/内部文件树拖入时高亮输入框)
  const [isDragging, setIsDragging] = useState(false);

  // 更新占位符显隐
  const updatePlaceholder = useCallback(() => {
    const editor = editorRef.current;
    const ph = placeholderRef.current;
    if (!editor || !ph) return;
    const empty = !editorHasContent(editor);
    ph.style.display = empty ? '' : 'none';
    const next = !empty;
    if (next !== hasContent) {
      setHasContent(next);
      onContentChange?.(next);
    }
  }, [hasContent, onContentChange]);

  // 内容实时变化(输入、增删芯片)时通知父组件保存草稿
  const notifyDraftChange = useCallback(() => {
    onDraftChange?.(serializeContent(editorRef.current));
  }, [onDraftChange]);

  // 暴露方法
  useImperativeHandle(ref, () => ({
    insertChipAtCursor(chip: RefChip) {
      const editor = editorRef.current;
      if (!editor) return;
      insertChipAtDom(editor, chip);
      updatePlaceholder();
      onChipAdd?.(chip);
      notifyDraftChange();
    },

    removeChipByFilePath(filePath: string): boolean {
      const editor = editorRef.current;
      if (!editor) return false;
      const chips = editor.querySelectorAll<HTMLElement>('.inline-chip');
      for (const chip of chips) {
        try {
          const data = JSON.parse(chip.dataset.chip || '{}') as RefChip;
          if (data.filePath === filePath) {
            chip.remove();
            updatePlaceholder();
            notifyDraftChange();
            return true;
          }
        } catch {
          continue;
        }
      }
      return false;
    },

    getContent() {
      return serializeContent(editorRef.current);
    },

    clear() {
      const editor = editorRef.current;
      if (!editor) return;
      editor.innerHTML = '';
      updatePlaceholder();
    },

    focus() {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      // 光标移到末尾
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },

    setContent(text: string) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.textContent = text;
      updatePlaceholder();
    },

    restore(state: { text: string; chips: RefChip[] }) {
      const editor = editorRef.current;
      if (!editor) return;
      const { text = '', chips = [] } = state;
      editor.innerHTML = '';
      if (text) editor.appendChild(document.createTextNode(text));
      for (const chip of chips) {
        editor.appendChild(createChipElement(chip));
        editor.appendChild(document.createTextNode('\u200B'));
      }
      updatePlaceholder();
      // 光标移到末尾
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },

    getTextContent() {
      const editor = editorRef.current;
      if (!editor) return '';
      return (editor.textContent || '').replace(/\u200B/g, '').trim();
    },
  }));

  // ── 事件处理 ─────────────────────────────────────────────

  // 点击：关闭按钮移除芯片;文件引用芯片点击跳转(对齐旧版 input-ref-chip-navigable)
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action === 'remove-chip') {
      const chip = target.closest('.inline-chip') as HTMLElement | null;
      if (chip) {
        chip.remove();
        updatePlaceholder();
        notifyDraftChange();
        editorRef.current?.focus();
      }
      return;
    }
    // 点击文件引用芯片(非关闭按钮)→ 在应用内打开文件并定位行号(对齐旧版 input-ref-chip-navigable 跳转)
    const chip = target.closest('.inline-chip') as HTMLElement | null;
    if (chip) {
      try {
        const data = JSON.parse(chip.dataset.chip || '{}') as RefChip;
        if (data.kind === 'file' && data.filePath) {
          usePreviewStore.getState().openFile(data.filePath.replace(/\\/g, '/'), data.startLine, data.endLine);
        }
      } catch {
        // 忽略损坏的 chip 数据
      }
    }
  }, [updatePlaceholder, notifyDraftChange]);

  // 键盘
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;

    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

    // 空格触发 @path 提取
    if (e.key === ' ' && !e.shiftKey) {
      const editor = editorRef.current;
      if (!editor) return;
      // 先插入空格，再检查提取
      // 浏览器会在 keydown 后插入空格，所以我们在 keyup 时检查
      // 但为了避免污染，我们在这里先阻止默认，然后手动插入空格并检查
      // 简化：让浏览器插入空格，在 keyup 时检查
      return;
    }

    // Backspace 在芯片边界时删除芯片
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      const { startContainer, startOffset } = range;
      // 光标在文本节点开头，前一个 sibling 是芯片
      if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        const prev = startContainer.previousSibling;
        if (prev instanceof HTMLElement && prev.classList.contains('inline-chip')) {
          e.preventDefault();
          prev.remove();
          updatePlaceholder();
          notifyDraftChange();
          editorRef.current?.focus();
          return;
        }
      }
      // 光标在容器开头，前一个子节点是芯片
      if (startContainer === editorRef.current && startOffset > 0) {
        const prev = editorRef.current.childNodes[startOffset - 1];
        if (prev instanceof HTMLElement && prev.classList.contains('inline-chip')) {
          e.preventDefault();
          prev.remove();
          updatePlaceholder();
          notifyDraftChange();
          return;
        }
      }
    }
  }, [onSend, updatePlaceholder, notifyDraftChange]);

  // 键盘释放：检查 @path 提取
  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;
    if (e.key === ' ' && !e.shiftKey) {
      const chip = extractAtPathOnSpace();
      if (chip) {
        updatePlaceholder();
        onChipAdd?.(chip);
      }
    }
  }, [onChipAdd, updatePlaceholder]);

  // 粘贴：纯文本 + 图片
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    // 先检查是否有图片
    const items = e.clipboardData.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            onPasteImage?.(blob, blob.name || `pasted-${Date.now()}.png`);
          }
          return;
        }
      }
    }
    // 非图片粘贴：转纯文本，剥离富文本样式，避免 DOM 被样式节点污染
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    // 超长文本折叠为 paste 芯片:不让几千字直接进入 contentEditable DOM
    // (否则输入框被撑高、每次输入重排卡顿、无法单独删除、token 计数失真)
    if (shouldConvertPasteToChip(text)) {
      const editor = editorRef.current;
      if (editor) {
        const chip = createPastedTextChip(text);
        if (insertChipAtDom(editor, chip)) {
          updatePlaceholder();
          onChipAdd?.(chip);
          notifyDraftChange();
          return;
        }
      }
      // 插入失败(极端情况,如选区不可用) → 回落为原样插入,保证内容不丢
    }

    document.execCommand('insertText', false, text);
    // execCommand 插入后光标在末尾,直接把滚动条滚到底部(粘贴长文本浏览器不自动跟随)
    const editor = editorRef.current;
    if (editor) {
      // 延到下一帧,确保内容已撑开并出现滚动条后再滚动
      requestAnimationFrame(() => {
        editor.scrollTop = editor.scrollHeight;
      });
    }
  }, [onPasteImage, updatePlaceholder, onChipAdd, notifyDraftChange]);

  // 双击 paste 芯片 → 就地展开为纯文本
  // 逃生口:需要直接编辑粘贴内容时使用(芯片本身是折叠态,不便修改)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 点在关闭按钮上不展开(交给 click 处理为删除)
    if (target.dataset.action === 'remove-chip') return;
    const chipEl = target.closest('.inline-chip') as HTMLElement | null;
    if (!chipEl) return;
    try {
      const data = JSON.parse(chipEl.dataset.chip || '{}') as RefChip;
      if (data.kind !== 'paste') return;
      const content = chipContentStore.get(chipEl);
      if (content == null) return;

      // 换行需还原为 <br>,与 serializeContent 的换行识别保持一致(裸 \n 在 DOM 中会塌陷)
      const frag = document.createDocumentFragment();
      content.split('\n').forEach((line, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'));
        if (line) frag.appendChild(document.createTextNode(line));
      });
      const lastNode = frag.lastChild;
      chipEl.replaceWith(frag);
      updatePlaceholder();
      notifyDraftChange();

      if (lastNode) {
        const range = document.createRange();
        range.setStartAfter(lastNode);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    } catch {
      // 忽略损坏的 chip 数据
    }
  }, [updatePlaceholder, notifyDraftChange]);

  // 拖拽
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    // dragover 高频触发,幂等置 true,兜底 dragenter 偶发漏触发的情况
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 拖到编辑区内的子元素(芯片/文本)会触发 dragleave,此时不清除高亮;
    // 只有真正离开编辑区(relatedTarget 在外部或为 null)才清除
    const editor = editorRef.current;
    const related = e.relatedTarget;
    if (!editor || !(related instanceof Node) || !editor.contains(related)) {
      setIsDragging(false);
    }
  }, []);

  // 外部拖入且取不到真实路径(浏览器 dev)时的兜底:
  // 小文本文件读内容转 paste chip,尽力保留内容;非文本/过大直接忽略
  const insertDroppedFileAsText = useCallback(async (file: File) => {
    if (file.size > MAX_DROPPED_TEXT_BYTES || !isLikelyTextFile(file)) return;
    const content = await file.text().catch(() => '');
    if (!content.trim()) return;
    const editor = editorRef.current;
    if (!editor) return;
    if (shouldConvertPasteToChip(content)) {
      const chip = createPastedTextChip(content);
      if (insertChipAtDom(editor, chip)) {
        updatePlaceholder();
        onChipAdd?.(chip);
        notifyDraftChange();
      }
      return;
    }
    document.execCommand('insertText', false, content);
  }, [updatePlaceholder, onChipAdd, notifyDraftChange]);

  // 外部拖入(操作系统文件):图片走图片管线,文件/文件夹取真实路径做引用芯片(路径引用,不复制文件)
  const handleExternalFilesDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      // 图片 → 走图片管线(多模态识别),与粘贴图片一致
      if (isImageFile(file)) {
        onPasteImage?.(file, file.name);
        continue;
      }
      // 非图片 → 优先取真实路径做 file chip:工作区内精简为相对路径,
      // 工作区外保留绝对路径(后端 balanced/relaxed 读模式可访问,strict 会被护栏拦截并给出明确报错)
      const realPath = desktopBridge.getPathForFile(file);
      if (realPath) {
        const editor = editorRef.current;
        if (!editor) return;
        const chip: RefChip = {
          id: `drag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'file',
          text: realPath.split(/[/\\]/).pop() || file.name,
          filePath: toRelativePath(realPath),
        };
        insertChipAtDom(editor, chip);
        updatePlaceholder();
        onChipAdd?.(chip);
        notifyDraftChange();
        continue;
      }
      // 取不到路径(浏览器 dev)→ 读文本内容兜底
      await insertDroppedFileAsText(file);
    }
  }, [onPasteImage, insertDroppedFileAsText, updatePlaceholder, onChipAdd, notifyDraftChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const editor = editorRef.current;
    if (!editor) return;

    // 外部拖入(操作系统文件/文件夹):dataTransfer.files 非空
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      void handleExternalFilesDrop(files);
      return;
    }

    // 内部拖拽(文件树等):text/plain 携带工作区路径
    const path = e.dataTransfer.getData('text/plain');
    if (path) {
      const fileName = path.split(/[/\\]/).pop() || path;
      const chip: RefChip = {
        id: `drag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'file',
        text: fileName,
        filePath: path,
      };
      insertChipAtDom(editor, chip);
      updatePlaceholder();
      onChipAdd?.(chip);
      notifyDraftChange();
    }
  }, [handleExternalFilesDrop, onChipAdd, updatePlaceholder, notifyDraftChange]);

  // 组合事件
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  // 输入事件
  const handleInput = useCallback(() => {
    updatePlaceholder();
    notifyDraftChange();
  }, [updatePlaceholder, notifyDraftChange]);

  // 初始占位符
  useEffect(() => {
    updatePlaceholder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder]);

  return (
    <div className="inline-input-wrapper">
      <div
        className="inline-input-placeholder"
        ref={placeholderRef}
      >
        {placeholder}
      </div>
      <div
        ref={editorRef}
        className={isDragging ? 'inline-input-editor is-dragover' : 'inline-input-editor'}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onDoubleClick={handleDoubleClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onInput={handleInput}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
      />
    </div>
  );
});

InlineInput.displayName = 'InlineInput';

export default InlineInput;