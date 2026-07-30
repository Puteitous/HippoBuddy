/**
 * ImageLightbox — 图片放大查看（lightbox）
 *
 * 用法:
 *   import { imageLightbox } from './utils/image-lightbox.js';
 *   imageLightbox.show('https://...');
 *   imageLightbox.show('data:image/png;base64,...');
 *
 * 或者绑定到元素:
 *   <img data-lightbox src="...">
 *   imageLightbox.bind(element);
 */

class ImageLightbox {
  constructor() {
    /** @type {HTMLElement|null} */
    this._overlay = null;
    /** @type {Function|null} */
    this._keydownHandler = null;
  }

  /**
   * 打开图片放大查看
   * @param {string} src - 图片 URL（HTTP URL 或 data: URI）
   * @param {string} [alt=''] - 图片 alt 文本
   */
  show(src, alt = '') {
    this._close(); // 关闭已存在的

    this._overlay = document.createElement('div');
    this._overlay.className = 'image-lightbox-overlay';
    this._overlay.innerHTML = `
      <div class="image-lightbox-backdrop"></div>
      <button class="image-lightbox-close" title="关闭 (ESC)" aria-label="关闭">×</button>
      <div class="image-lightbox-container">
        <img src="${this._escapeHtml(src)}" alt="${this._escapeHtml(alt)}" class="image-lightbox-img" />
      </div>
    `;

    // 点击背景关闭
    const backdrop = this._overlay.querySelector('.image-lightbox-backdrop');
    backdrop.addEventListener('click', () => this._close());

    // 点击关闭按钮
    const closeBtn = this._overlay.querySelector('.image-lightbox-close');
    closeBtn.addEventListener('click', () => this._close());

    // 点击图片本身也关闭（放大状态下再点一下收回去）
    const imgEl = this._overlay.querySelector('.image-lightbox-img');
    imgEl.addEventListener('click', () => this._close());

    // ESC 键关闭
    this._keydownHandler = (e) => {
      if (e.key === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._keydownHandler);

    document.body.appendChild(this._overlay);

    // 触发动画
    requestAnimationFrame(() => {
      this._overlay.classList.add('active');
    });
  }

  /**
   * 关闭 lightbox
   */
  _close() {
    if (!this._overlay) return;

    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }

    this._overlay.classList.remove('active');
    // 等过渡动画结束后移除 DOM
    const overlay = this._overlay;
    const onTransitionEnd = () => {
      overlay.removeEventListener('transitionend', onTransitionEnd);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };
    overlay.addEventListener('transitionend', onTransitionEnd);
    // 兜底：如果动画没触发，300ms 后强制移除
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);

    this._overlay = null;
  }

  /**
   * 给图片元素绑定点击放大查看
   * @param {HTMLImageElement} imgEl
   */
  bind(imgEl) {
    if (!imgEl || imgEl.dataset.lightboxBound) return;
    imgEl.style.cursor = 'pointer';
    imgEl.addEventListener('click', () => {
      this.show(imgEl.src, imgEl.alt);
    });
    imgEl.dataset.lightboxBound = 'true';
  }

  /**
   * 简单的 HTML 转义
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/** 全局单例 */
export const imageLightbox = new ImageLightbox();

// 暴露到 window 以便在 HTML onclick 等场景中使用
window.imageLightbox = imageLightbox;
