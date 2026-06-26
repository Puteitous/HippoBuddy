/**
 * CustomDropdown — 通用现代化下拉框组件
 *
 * 替换原生 <select>，提供统一的视觉风格和交互体验。
 *
 * 用法：
 *   import { CustomDropdown } from './utils/dropdown.js';
 *
 *   const dd = new CustomDropdown({
 *     trigger: document.getElementById('myTrigger'),
 *     items: [
 *       { label: '选项一', value: 'opt1' },
 *       { label: '选项二', value: 'opt2' },
 *       { type: 'divider' },
 *       { label: '✚ 添加...', value: '__add__' },
 *     ],
 *     selectedValue: 'opt1',
 *     onSelect: (item) => console.log('选中', item),
 *     placement: 'bottom-left',  // 或 'bottom-right'
 *   });
 *
 *   // 更新选项
 *   dd.setItems(newItems);
 *   dd.setSelectedValue('opt2');
 *
 *   // 销毁
 *   dd.destroy();
 */

export class CustomDropdown {
  constructor({ trigger, items = [], selectedValue, onSelect, placement = 'bottom-left', offsetX = 0 }) {
    if (!trigger) throw new Error('CustomDropdown: trigger is required');
    
    this._trigger = trigger;
    this._items = items;
    this._selectedValue = selectedValue;
    this._onSelect = onSelect;
    this._placement = placement;
    this._offsetX = offsetX;
    this._isOpen = false;
    this._menu = null;
    this._highlightIdx = -1;
    this._id = 'dd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    // 标记 trigger，方便 CSS 定位
    this._trigger.classList.add('dd-trigger');

    this._bindEvents();
    this._renderLabel();
  }

  // ─── 公开方法 ───────────────────────────

  /** 更新选项列表 */
  setItems(items) {
    this._items = items;
    if (this._isOpen) this._renderMenu();
    this._renderLabel();
  }

  /** 更新选中值 */
  setSelectedValue(value) {
    this._selectedValue = value;
    if (this._isOpen) this._highlightSelected();
    this._renderLabel();
  }

  /** 获取当前选中项 */
  getSelectedItem() {
    return this._items.find(item => item.value === this._selectedValue) || null;
  }

  /** 更换 trigger DOM 元素（用于 hero 重建等场景） */
  setTrigger(newTrigger) {
    // 清理旧 trigger 上的标记和事件
    this._trigger.classList.remove('dd-trigger', 'dd-open');
    this._trigger.removeEventListener('click', this._onTriggerClick);
    // 更新为新 trigger
    this._trigger = newTrigger;
    this._trigger.classList.add('dd-trigger');
    this._trigger.addEventListener('click', this._onTriggerClick = (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this._renderLabel();
  }

  /** 打开下拉 */
  open() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._trigger.classList.add('dd-open');
    this._renderMenu();
    this._positionMenu();
    this._highlightSelected();
  }

  /** 关闭下拉 */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._trigger.classList.remove('dd-open');
    if (this._menu) {
      this._menu.remove();
      this._menu = null;
    }
  }

  /** 切换开关 */
  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  /** 销毁组件，清理 DOM 和事件 */
  destroy() {
    this.close();
    this._offBoundClick();
    this._offKeyDown();
    // 移除 trigger 上添加的类
    this._trigger.classList.remove('dd-trigger', 'dd-open');
  }

  // ─── 内部 ───────────────────────────────

  _renderLabel() {
    const item = this.getSelectedItem();
    if (item) {
      this._trigger.textContent = item.label;
    }
  }

  _renderMenu() {
    // 移除旧菜单
    const old = document.getElementById(this._id);
    if (old) {
      clearTimeout(old._closeTimer);
      old.remove();
    }

    this._menu = document.createElement('div');
    this._menu.id = this._id;
    this._menu.className = 'dd-menu';
    this._menu.setAttribute('role', 'listbox');

    let html = '';
    for (let i = 0; i < this._items.length; i++) {
      const item = this._items[i];
      if (item.type === 'divider') {
        html += '<div class="dd-divider"></div>';
      } else {
        const selected = item.value === this._selectedValue ? ' dd-option-selected' : '';
        html += `<div class="dd-option${selected}" role="option" data-index="${i}" data-value="${item.value}">`;
        if (item.icon) {
          html += `<span class="dd-option-icon">${item.icon}</span>`;
        }
        html += `<span class="dd-option-label">${item.label}</span>`;
        if (selected) {
          html += '<span class="dd-option-check">✓</span>';
        }
        html += '</div>';
      }
    }

    this._menu.innerHTML = html;
    document.body.appendChild(this._menu);

    // 选项点击
    this._menu.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.dd-option');
      if (!opt) return;
      e.preventDefault(); // 防止 blur 先触发关闭
      const value = opt.dataset.value;
      const item = this._items.find(it => it.value === value);
      if (item) {
        this._selectedValue = value;
        this._renderLabel();
        if (this._onSelect) this._onSelect(item);
      }
      this.close();
    });

    // 鼠标悬停高亮
    this._menu.addEventListener('mouseover', (e) => {
      const opt = e.target.closest('.dd-option');
      if (!opt) return;
      this._setHighlight(parseInt(opt.dataset.index));
    });
  }

  _positionMenu() {
    if (!this._menu) return;
    const triggerRect = this._trigger.getBoundingClientRect();
    const menu = this._menu;

    // 宽度与 trigger 保持一致
    menu.style.width = Math.max(180, triggerRect.width) + 'px';

    if (this._placement === 'bottom-right') {
      menu.style.left = '0px';
      menu.style.right = 'auto';
    } else {
      menu.style.left = '0px';
      menu.style.right = 'auto';
    }
    menu.style.top = (triggerRect.bottom + 4) + 'px';

    // 对齐方式
    if (this._placement === 'bottom-right') {
      menu.style.right = (window.innerWidth - triggerRect.right) + 'px';
      menu.style.left = 'auto';
    } else {
      menu.style.left = (triggerRect.left + this._offsetX) + 'px';
      menu.style.right = 'auto';
    }

    // 确保不超出视口底部
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight) {
      // 优先显示在上方
      const spaceAbove = triggerRect.top;
      if (spaceAbove > menuRect.height) {
        menu.style.top = (triggerRect.top - menuRect.height - 4) + 'px';
      } else {
        // 压缩高度
        menu.style.maxHeight = Math.floor(window.innerHeight - menuRect.top - 16) + 'px';
        menu.style.overflowY = 'auto';
      }
    }

    // 确保不超出右侧
    if (menuRect.right > window.innerWidth) {
      menu.style.left = 'auto';
      menu.style.right = '8px';
    }
  }

  _highlightSelected() {
    if (!this._menu) return;
    const options = this._menu.querySelectorAll('.dd-option');
    let idx = -1;
    options.forEach((opt, i) => {
      const isSelected = opt.dataset.value === this._selectedValue;
      opt.classList.toggle('dd-option-selected', isSelected);
      const check = opt.querySelector('.dd-option-check');
      if (isSelected) {
        if (!check) {
          opt.insertAdjacentHTML('beforeend', '<span class="dd-option-check">✓</span>');
        }
        idx = i;
      } else {
        if (check) check.remove();
      }
    });
    if (idx >= 0) {
      this._setHighlight(idx);
      this._scrollTo(idx);
    }
  }

  _setHighlight(idx) {
    if (!this._menu) return;
    this._highlightIdx = idx;
    this._menu.querySelectorAll('.dd-option').forEach((opt, i) => {
      opt.classList.toggle('dd-option-highlighted', i === idx);
    });
  }

  _scrollTo(idx) {
    if (!this._menu) return;
    const opts = this._menu.querySelectorAll('.dd-option');
    if (opts[idx]) {
      opts[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  // ─── 事件绑定 ─────────────────────────────

  _bindEvents() {
    this._trigger.addEventListener('click', this._onTriggerClick = (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this._onBoundClick = (e) => {
      if (this._isOpen && this._menu && !this._menu.contains(e.target) && e.target !== this._trigger) {
        this.close();
      }
    };
    document.addEventListener('click', this._onBoundClick, true);

    this._onKeyDown = (e) => {
      if (!this._isOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this._navigate(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._navigate(-1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (this._highlightIdx >= 0) {
            const opts = this._menu.querySelectorAll('.dd-option');
            if (opts[this._highlightIdx]) {
              opts[this._highlightIdx].click();
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _navigate(direction) {
    if (!this._menu) return;
    const opts = this._menu.querySelectorAll('.dd-option');
    if (opts.length === 0) return;

    let next = this._highlightIdx;
    if (next < 0) {
      next = direction > 0 ? 0 : opts.length - 1;
    } else {
      next += direction;
    }
    next = Math.max(0, Math.min(next, opts.length - 1));
    this._setHighlight(next);
    this._scrollTo(next);
  }

  _offBoundClick() {
    if (this._onBoundClick) {
      document.removeEventListener('click', this._onBoundClick, true);
    }
  }

  _offKeyDown() {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
    }
  }
}
