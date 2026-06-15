/**
 * ConfirmDialog — 自定义确认弹窗
 *
 * 替换原生 confirm()，提供统一风格、三选项（保存/不保存/取消）。
 *
 * 用法：
 *   import { ConfirmDialog } from './utils/modal.js';
 *
 *   // 简单确认
 *   if (await ConfirmDialog.confirm('确定要删除吗？')) { ... }
 *
 *   // 脏文件三选项
 *   const result = await ConfirmDialog.saveDiscardCancel(`"main.js" 有未保存的修改`);
 *   // result === 'save' | 'discard' | 'cancel'
 *
 *   也可用实例：new ConfirmDialog().confirm('xxx')，但推荐直接用静态方法。
 */

export class ConfirmDialog {
  constructor() {
    this._overlay = null;
    this._resolve = null;
  }

  /**
   * 简单确认弹窗
   * @param {string} message - 提示文本
   * @param {string} [confirmText='确定']
   * @param {string} [cancelText='取消']
   * @returns {Promise<boolean>}
   */
  static confirm(message, confirmText = '确定', cancelText = '取消') {
    return new ConfirmDialog()._show({
      message,
      actions: [
        { text: cancelText, value: false, variant: 'secondary' },
        { text: confirmText, value: true, variant: 'primary', focus: true },
      ],
    });
  }

  /**
   * 脏文件三选项弹窗：保存 / 不保存 / 取消
   * @param {string} message - 提示文本
   * @returns {Promise<'save'|'discard'|'cancel'>}
   */
  static saveDiscardCancel(message) {
    return new ConfirmDialog()._show({
      title: '未保存的修改',
      message,
      actions: [
        { text: '取消', value: 'cancel', variant: 'secondary' },
        { text: '不保存', value: 'discard', variant: 'danger' },
        { text: '保存', value: 'save', variant: 'primary', focus: true },
      ],
    });
  }

  /**
   * 关闭前确认弹窗：保存 / 不保存 / 取消（标题区分）
   * @param {string} message - 提示文本
   * @returns {Promise<'save'|'discard'|'cancel'>}
   */
  static closeConfirm(message) {
    return new ConfirmDialog()._show({
      title: '关闭文件',
      message,
      actions: [
        { text: '取消', value: 'cancel', variant: 'secondary' },
        { text: '不保存', value: 'discard', variant: 'danger' },
        { text: '保存', value: 'save', variant: 'primary', focus: true },
      ],
    });
  }

  _show({ title, message, actions }) {
    return new Promise((resolve) => {
      this._resolve = resolve;

      // 移除已有弹窗
      const existing = document.querySelector('.confirm-dialog-overlay');
      if (existing) existing.remove();

      this._overlay = document.createElement('div');
      this._overlay.className = 'confirm-dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';

      let html = '';
      if (title) {
        html += `<div class="confirm-dialog-title">${this._escape(title)}</div>`;
      }
      html += `<div class="confirm-dialog-message">${message}</div>`;

      html += '<div class="confirm-dialog-actions">';
      for (const action of actions) {
        const cls = `confirm-dialog-btn confirm-dialog-btn-${action.variant}`;
        html += `<button class="${cls}" data-value="${action.value}" data-focus="${action.focus ? '1' : '0'}">${this._escape(action.text)}</button>`;
      }
      html += '</div>';

      dialog.innerHTML = html;
      this._overlay.appendChild(dialog);
      document.body.appendChild(this._overlay);

      // 聚焦默认按钮
      requestAnimationFrame(() => {
        const focused = dialog.querySelector('[data-focus="1"]');
        if (focused) focused.focus();
      });

      // 事件绑定
      const onAction = (e) => {
        const btn = e.target.closest('.confirm-dialog-btn');
        if (!btn) return;
        const value = btn.dataset.value;
        // 尝试解析为 boolean 或原样返回
        const parsed = value === 'true' ? true : value === 'false' ? false : value;
        this._close(parsed);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          // 默认取最后一个 action 的值（通常是取消）
          this._close(actions[actions.length - 1].value);
        }
      };

      dialog.addEventListener('click', onAction);
      this._overlay.addEventListener('keydown', onKeyDown);
      // 点击遮罩 = 取消
      this._overlay.addEventListener('click', (e) => {
        if (e.target === this._overlay) {
          this._close(actions[actions.length - 1].value);
        }
      });

      // 保存引用以便销毁时清理
      this._onAction = onAction;
      this._onKeyDown = onKeyDown;
    });
  }

  _close(value) {
    if (this._resolve) {
      this._resolve(value);
      this._resolve = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
