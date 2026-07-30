/**
 * ImageUpload — 图片上传处理模块
 * 管理图片文件选择、粘贴、拖放、预览渲染等
 */
import { showToast } from '../../utils/toast.js';
import { EventBus } from '../../utils/event-bus.js';
import { imageLightbox } from '../../utils/image-lightbox.js';

/**
 * @typedef {Object} PendingImage
 * @property {string} dataUrl - Base64 data URL
 * @property {string} name - 文件名
 * @property {number} size - 文件大小
 */

export class ImageUpload {
  constructor() {
    /** @type {PendingImage[]} */
    this._pendingImages = [];
    /** @type {HTMLInputElement|null} */
    this._imgFileRef = null;
    /** @type {HTMLElement|null} */
    this._imageBtnRef = null;
    /** @type {Function|null} */
    this._pasteHandler = null;
  }

  /**
   * 初始化图片上传功能
   */
  init() {
    this._imgFileRef = document.getElementById('inputImgFile');
    if (!this._imgFileRef) return;

    this._imageBtnRef = document.getElementById('inputImgBtn');
    if (!this._imageBtnRef) return;

    const updateVisionButton = () => {
      if (!this._imageBtnRef) return;
      this._imageBtnRef.style.display = this._isVisionSupported() ? 'flex' : 'none';
    };
    updateVisionButton();

    EventBus.on('config:model-changed', updateVisionButton);
    EventBus.on('session:switched', updateVisionButton);

    this._imageBtnRef.addEventListener('click', () => {
      this._imgFileRef.click();
    });

    this._imgFileRef.addEventListener('change', () => {
      this._handleImageFiles(this._imgFileRef.files);
      this._imgFileRef.value = '';
    });

    this._pasteHandler = (e) => {
      const input = e.target.closest('#messageInput');
      if (!input) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          if (!this._isVisionSupported()) {
            showToast('当前模型不支持图片上传', { type: 'warning', duration: 3000 });
            return;
          }
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) this._readImageFile(blob);
          break;
        }
      }
    };
    document.addEventListener('paste', this._pasteHandler);
  }

  /**
   * 检查当前模型是否支持视觉（图片上传）
   */
  _isVisionSupported() {
    try {
      const raw = localStorage.getItem('hippo_model_config');
      if (!raw) return false;
      const data = JSON.parse(raw);
      const provider = (data.provider || '').toLowerCase();
      const model = (data.model || '').toLowerCase();

      const visionProviders = ['openai', 'anthropic', 'google', 'gemini'];
      if (visionProviders.includes(provider)) return true;

      const visionKeywords = ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-5',
        'o1', 'o3', 'o4',
        'claude-3', 'claude-4', 'claude-sonnet-4', 'claude-opus-4', 'claude-opus-5',
        'llava', 'bakllava', 'qwen', 'vl', 'cogvlm', 'glm-4v', 'glm-5v', 'glm-ocr', 'internvl', 'minicpm',
        'kimi'];
      return visionKeywords.some(kw => model.includes(kw));
    } catch {
      return false;
    }
  }

  /** 更新 📷 按钮的显示状态 */
  updateBtnVisibility() {
    if (!this._imageBtnRef) return;
    this._imageBtnRef.style.display = this._isVisionSupported() ? 'flex' : 'none';
  }

  /** 确保图片上传按钮可见 */
  ensureButtonPosition(imgBtn) {
    if (!imgBtn) return;
    imgBtn.style.display = 'flex';
  }

  /** 重新获取图片上传按钮引用 */
  recreateButton() {
    if (!this._imgFileRef || !this._imgFileRef.parentNode) {
      this._ensureFileInput();
      this._imgFileRef = document.getElementById('inputImgFile');
    }
    if (!this._imgFileRef) {
      console.warn('[ImgUpload] 无法重建 inputImgFile，图片上传功能不可用');
      return;
    }
    this._imageBtnRef = document.getElementById('inputImgBtn');
    if (this._imageBtnRef) {
      this._imageBtnRef.style.display = 'flex';
      this.updateBtnVisibility();
    }
  }

  /**
   * 处理从文件选择器选择的图片文件
   * @param {FileList} fileList
   */
  _handleImageFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) {
        showToast(`图片 ${file.name} 超过 20MB 限制`, { type: 'warning', duration: 3000 });
        continue;
      }
      this._readImageFile(file);
    }
  }

  /**
   * 将图片文件读取为 base64 data URL 并加入待发送列表
   * @param {File|Blob} file
   */
  async _readImageFile(file) {
    try {
      const dataUrl = await this._fileToDataUrl(file);
      this._pendingImages.push({ dataUrl, name: file.name, size: file.size });
      this.renderPreviews();
    } catch (err) {
      console.error('[ImgUpload] 读取图片失败:', file.name, err);
      showToast(`读取图片失败: ${file.name}`, { type: 'error', duration: 3000 });
    }
  }

  /**
   * 将图片文件转为 data URL（绕过被 pptx-preview.js 覆盖的 FileReader）
   * @param {File|Blob} file
   * @returns {Promise<string>} data URL
   */
  async _fileToDataUrl(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return canvas.toDataURL(file.type || 'image/png');
      } catch (e) {
        // 降级到 Image 加载
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL(file.type || 'image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`图片加载失败: ${file.name}`));
      };
      img.src = url;
    });
  }

  /** 渲染图片预览缩略图 */
  renderPreviews() {
    this._renderPreviewInContainer('inputImgPreview');
  }

  /**
   * 在指定容器中渲染图片预览
   * @param {string} containerId
   */
  _renderPreviewInContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (this._pendingImages.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = '';

    const maxShow = 5;
    const showImages = this._pendingImages.slice(0, maxShow);

    showImages.forEach((img, index) => {
      const item = document.createElement('div');
      item.className = 'input-img-preview-item';
      item.innerHTML = `
        <img src="${img.dataUrl}" alt="${img.name}" class="input-img-preview-thumb">
        <button class="img-remove-btn" data-index="${index}" title="移除图片">×</button>
      `;
      const imgEl = item.querySelector('img');
      // 点击缩略图放大查看
      imgEl.addEventListener('click', (e) => {
        e.stopPropagation();
        imageLightbox.show(img.dataUrl, img.name);
      });
      item.querySelector('.img-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._pendingImages.splice(index, 1);
        this.renderPreviews();
      });
      container.appendChild(item);
    });

    if (this._pendingImages.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'input-img-preview-more';
      more.textContent = `+${this._pendingImages.length - maxShow}`;
      more.title = `还有 ${this._pendingImages.length - maxShow} 张图片`;
      container.appendChild(more);
    }
  }

  /** 清空待发送图片列表并刷新预览 */
  clearPending() {
    this._pendingImages = [];
    this.renderPreviews();
  }

  /**
   * 兜底创建隐藏的图片文件选择器 input
   */
  _ensureFileInput() {
    if (document.getElementById('inputImgFile')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'inputImgFile';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      this._handleImageFiles(input.files);
      input.value = '';
    });
    const container = document.getElementById('inputContainer') || document.getElementById('chatContainer') || document.body;
    container.appendChild(input);
  }

  /** 销毁（清理事件监听） */
  destroy() {
    if (this._pasteHandler) {
      document.removeEventListener('paste', this._pasteHandler);
      this._pasteHandler = null;
    }
  }
}
