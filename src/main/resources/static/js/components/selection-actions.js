/**
 * SelectionActions — 文本选中快捷操作
 *
 * 职责：
 *   1. 监听 document 的 selectionchange 事件
 *   2. 当用户在可选中区域选中文本时，显示浮动按钮
 *   3. 点击按钮将选中文本通过 EventBus 发送到聊天输入框
 *
 * 支持区域：
 *   - .file-preview-content（文件预览区）
 *   - .message-content（聊天消息）
 *   - .code-block-body, .bash-output 等工具卡片代码区
 *
 * 依赖：
 *   - EventBus
 */

import { EventBus } from '../utils/event-bus.js';

// 选择器：哪些区域内选中文本才显示按钮
const SELECTABLE_AREAS = [
  '.file-preview-content',
  '.message-content',
  '.code-block-body',
  '.bash-output',
  '.timeline-detail-output',
  '.confirmation-command',
  '.timeline-detail-progress'
];

/**
 * 计算选区在文件中的起始/结束行号（CM6 版本）
 * @param {object} cmView - CM6 EditorView 实例
 * @param {Selection} selection
 * @returns {{ startLine: number, endLine: number }}
 */
function calcLineNumbers(cmView, selection) {
  const sel = cmView.state.selection.main;
  const startLine = cmView.state.doc.lineAt(sel.from).number;
  const endLine = cmView.state.doc.lineAt(sel.to).number;
  return { startLine, endLine };
}

export function initSelectionActions() {
  let btn = null;
  let hideTimer = null;

  function getBtn() {
    if (!btn) {
      btn = document.createElement('div');
      btn.className = 'selection-action-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 11l4-7 4 7"/>
          <line x1="5.5" y1="9" x2="10.5" y2="9"/>
          <line x1="3" y1="13" x2="13" y2="13" stroke-width="1"/>
        </svg>
        添加到输入框
      `;
      btn.style.display = 'none';
      document.body.appendChild(btn);

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();   // 防止按钮点击时失去选区
      });

      btn.addEventListener('click', () => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';
        if (!text) return;

        // 判断是否来自文件预览区 → 计算路径+行号引用
        const anchorEl = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? selection.anchorNode
          : selection.anchorNode?.parentElement;
        const previewContent = anchorEl?.closest?.('.file-preview-content');
        // 渲染后的 MD 预览中的选区没有行号概念，降级为纯文本
        const isMdPreview = anchorEl?.closest?.('.file-md-preview');
        if (previewContent && selection.rangeCount > 0 && !isMdPreview) {
          const filePath = previewContent.dataset.currentPath;
          const cmView = previewContent._cmPreviewView;
          if (filePath && cmView) {
            const { startLine, endLine } = calcLineNumbers(cmView, selection);
            EventBus.emit('selection:add-to-input', {
              text: `${filePath}:${startLine}-${endLine}`,
              refType: 'file',
              filePath,
              startLine,
              endLine
            });
            hideBtn();
            if (selection) selection.removeAllRanges();
            return;
          }
        }

        // 其他区域 → 纯文本引用
        EventBus.emit('selection:add-to-input', { text, refType: 'text' });
        hideBtn();
        if (selection) selection.removeAllRanges();
      });
    }
    return btn;
  }

  function showBtn(x, y) {
    const el = getBtn();
    clearTimeout(hideTimer);
    // 定位：默认在选区下方，如果太靠下则显示在上方
    const viewportH = window.innerHeight;
    const btnH = 32;
    const gap = 8;
    let top = y + gap;
    if (top + btnH + gap > viewportH) {
      top = y - btnH - gap;
    }
    el.style.left = x + 'px';
    el.style.top = top + 'px';
    el.style.display = 'flex';
  }

  function hideBtn() {
    if (btn) {
      btn.style.display = 'none';
    }
  }

  // 判断选区是否在可选中区域内
  function isInSelectableArea(node) {
    if (!node) return false;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return false;
    const selectors = SELECTABLE_AREAS.join(',');
    return !!el.closest(selectors);
  }

  // 获取选中文本的末尾光标位置（用于定位按钮）
  function getSelectionPosition() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (!isInSelectableArea(container)) return null;

    // 判断选择方向：从下往上选时，折叠到开头（真正的视觉末尾）
    const isBackwards = (() => {
      if (!selection.anchorNode || !selection.focusNode) return false;
      const pos = selection.anchorNode.compareDocumentPosition(selection.focusNode);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return true;  // focusNode 在 anchorNode 之前 → 反向
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return false; // focusNode 在 anchorNode 之后 → 正向
      // 同一节点，比较 offset
      return selection.anchorOffset > selection.focusOffset;
    })();

    const endRange = range.cloneRange();
    endRange.collapse(isBackwards); // 反向选择时折叠到开头而非末尾
    const rect = endRange.getBoundingClientRect();
    if (!rect) return null;

    // 检查光标位置是否还在容器的可视区域内
    const selectableEl = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement).closest(SELECTABLE_AREAS.join(','));
    if (selectableEl) {
      const containerRect = selectableEl.getBoundingClientRect();
      const margin = 2; // 允许 2px 容差
      if (rect.bottom < containerRect.top - margin || rect.top > containerRect.bottom + margin) {
        return null; // 选区已滚出可视区域
      }
    }

    return { x: rect.left, y: rect.bottom };
  }

  // ── 选区变化 ─────────────────────────────────
  document.addEventListener('selectionchange', () => {
    clearTimeout(hideTimer);

    const pos = getSelectionPosition();
    if (pos) {
      showBtn(pos.x, pos.y);
    } else {
      // 延迟隐藏，给点击按钮留时间
      hideTimer = setTimeout(hideBtn, 200);
    }
  });

  // ── 点击其他地方隐藏（延迟隐藏，避免点击同区域空行时误隐藏） ──
  document.addEventListener('mousedown', (e) => {
    if (btn && !btn.contains(e.target)) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideBtn, 200);
    }
  });

  // ── 滚动时重新定位 ───────────────────────────
  let scrollRafId = null;
  document.addEventListener('scroll', () => {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      const pos = getSelectionPosition();
      clearTimeout(hideTimer);
      if (pos) {
        showBtn(pos.x, pos.y);
      } else {
        hideTimer = setTimeout(hideBtn, 200);
      }
    });
  }, true);
}
