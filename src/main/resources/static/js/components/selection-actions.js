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
 * 计算选区在代码元素中的起始/结束行号
 * @param {Selection} selection
 * @param {HTMLElement} codeEl - <code> 元素
 * @returns {{ startLine: number, endLine: number }}
 */
function calcLineNumbers(selection, codeEl) {
  const range = selection.getRangeAt(0);

  // 从 codeEl 开头到选区起点 → 数换行
  const startRange = document.createRange();
  startRange.selectNodeContents(codeEl);
  startRange.setEnd(range.startContainer, range.startOffset);
  const beforeText = startRange.toString();
  const startLine = beforeText.split('\n').length;

  // 选中文本中的换行数 → 计算结束行
  const selectedText = range.toString();
  const lineCount = selectedText.split('\n').length;
  const endLine = startLine + lineCount - 1;

  startRange.detach();
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
        if (previewContent && selection.rangeCount > 0) {
          const filePath = previewContent.dataset.currentPath;
          const codeEl = previewContent.querySelector('code');
          if (filePath && codeEl) {
            const { startLine, endLine } = calcLineNumbers(selection, codeEl);
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

    // 折叠到末尾，取光标精确位置，而非整个选区的边界框
    const endRange = range.cloneRange();
    endRange.collapse(false);
    const rect = endRange.getBoundingClientRect();
    if (!rect) return null;

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

  // ── 点击其他地方隐藏 ─────────────────────────
  document.addEventListener('mousedown', (e) => {
    if (btn && !btn.contains(e.target)) {
      hideBtn();
    }
  });

  // ── 滚动时隐藏 ───────────────────────────────
  document.addEventListener('scroll', () => {
    hideBtn();
  }, true);
}
