/**
 * 引用碎片管理模块
 * 管理输入框中的 @path 引用卡片和 refs 栏。
 */
import { getFileIconInfo } from '../../utils/file-icons.js';

export class RefChips {
  constructor(chatPanel) {
    this.chatPanel = chatPanel;
  }

  /**
   * 获取合并后的输入内容：@path 引用 + 用户键入文字
   */
  getCombinedInput() {
    const refsBar = this._getActiveRefsBar();
    const input = this._getActiveInput();
    const typed = input?.value.trim() || '';

    const chips = refsBar ? [...refsBar.querySelectorAll('.input-ref-chip')] : [];
    const refTexts = chips.map(c => {
      if ((c.dataset.refType === 'file' || c.dataset.refType === 'rule') && c.dataset.filePath) {
        const sl = c.dataset.startLine;
        const el = c.dataset.endLine;
        const hasLines = sl && el && sl !== 'undefined' && el !== 'undefined';
        const ref = hasLines
          ? `@${c.dataset.filePath}:${sl}-${el}`
          : `@${c.dataset.filePath}`;
        // 带选中文字（行数≤50的代码选区 / 二进制文件预览）→ 追加在 @path 后面
        if (c.dataset.selectedText) {
          return ref + '\n```\n' + c.dataset.selectedText + '\n```';
        }
        return ref;
      }
      // 纯文本 → 代码块
      const full = c.title || c.textContent.replace('×', '').trim();
      return '```\n' + full + '\n```';
    });

    if (refTexts.length === 0) return typed;
    return refTexts.join('\n') + (typed ? '\n\n' + typed : '');
  }

  /**
   * 添加引用卡片到指定栏
   * @param {HTMLElement} bar - refs 栏容器
   * @param {string} text - 引用文本
   * @param {string} refType - 'file' | 'text'
   * @param {string} [filePath]
   * @param {number} [startLine]
   * @param {number} [endLine]
   * @param {{ isDirectory?: boolean, ruleId?: string }} [options] - ruleId 表示这是规则引用卡片
   * @param {string} [selectedText] - 二进制文件预览的选中文字内容
   */
  addRefChip(bar, text, refType, filePath, startLine, endLine, options, selectedText) {
    const chip = document.createElement('span');
    chip.className = 'input-ref-chip';
    if (refType === 'file' && filePath) {
      const fileName = filePath.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName, { isDirectory: options?.isDirectory });
      const hasLines = startLine != null && endLine != null;
      chip.innerHTML = `<img src="icons/${iconFile}" class="input-ref-chip-icon" draggable="false"> <span class="input-ref-chip-text">${fileName}</span>${hasLines ? `<span class="input-ref-chip-lines">${startLine}-${endLine}</span>` : ''}`;
      chip.title = hasLines ? `${filePath}:${startLine}-${endLine}` : filePath;
      chip.dataset.refType = options?.ruleId ? 'rule' : 'file';
      chip.dataset.filePath = filePath.replace(/\\/g, '/');
      if (options?.ruleId) chip.dataset.ruleId = options.ruleId;
      if (options?.skillPath) chip.dataset.skillPath = options.skillPath;
      if (startLine != null) chip.dataset.startLine = startLine;
      if (endLine != null) chip.dataset.endLine = endLine;
      if (selectedText) chip.dataset.selectedText = selectedText;
      chip.classList.add('input-ref-chip-navigable');
    } else {
      const textSpan = document.createElement('span');
      textSpan.className = 'input-ref-chip-text';
      textSpan.textContent = text.length > 120 ? text.slice(0, 120) + '…' : text;
      chip.appendChild(textSpan);
      chip.title = text;
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'input-ref-chip-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chip.remove();
      // 卡片清空后隐藏栏
      if (bar.children.length === 0) bar.style.display = 'none';
      this._notifyChipRemoved(chip);
    });
    chip.appendChild(closeBtn);
    bar.appendChild(chip);
    bar.style.display = 'flex';
    bar.dispatchEvent(new Event('refs-changed', { bubbles: true }));
  }

  /** 在 refs 栏添加一条规则引用卡片 */
  addRuleRefChip(bar, rule) {
    this.addRefChip(bar, rule.filePath || rule.name, 'file', rule.filePath, null, null, {
      ruleId: rule.id,
    });
  }

  /**
   * 清空当前可见的引用卡片栏
   */
  clearRefs() {
    // 清除文件引用卡片
    const bar = this._getActiveRefsBar();
    if (bar) {
      bar.innerHTML = '';
      bar.style.display = 'none';
    }
    // 清除待发送图片
    this.chatPanel.imageUpload.clearPending();
  }

  /**
   * 移除 chip 时同步通知 ContextSelector 取消勾选
   */
  _notifyChipRemoved(chip) {
    if (chip.dataset.ruleId) {
      this.chatPanel._contextSelector?.deselectRule(chip.dataset.ruleId);
    } else if (chip.dataset.skillPath) {
      this.chatPanel._contextSelector?.deselectSkill(chip.dataset.skillPath);
    }
  }

  // ── 辅助方法 ────────────────────────────

  /** 当前是否为会话态（相对于 hero 空态） */
  isSession() {
    return this.chatPanel.container?.closest('.chat-panel')?.classList.contains('has-messages') ?? false;
  }

  /** 获取当前可见的输入框元素（Phase 2: 统一使用 #messageInput） */
  _getActiveInput() {
    return document.getElementById('messageInput');
  }

  /** 获取当前可见的引用卡片栏（Phase 2: 统一使用 #inputRefs） */
  _getActiveRefsBar() {
    return document.getElementById('inputRefs');
  }
}
