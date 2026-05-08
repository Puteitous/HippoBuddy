// Toast 通知系统

const TOAST_ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️'
};

const TOAST_TITLES = {
  success: '成功',
  error: '错误',
  info: '提示',
  warning: '警告'
};

const TOAST_DURATIONS = {
  short: 2000,
  normal: 4000,
  long: 8000
};

/**
 * 显示 Toast 通知
 * @param {string} message - 通知消息
 * @param {Object} options - 配置选项
 * @param {'success' | 'error' | 'info' | 'warning'} options.type - 通知类型
 * @param {number} options.duration - 持续时间（毫秒），0 表示不自动消失
 * @param {string} options.title - 自定义标题
 */
export function showToast(message, options = {}) {
  const {
    type = 'info',
    duration = TOAST_DURATIONS.normal,
    title = TOAST_TITLES[type]
  } = options;

  const container = document.getElementById('toastContainer');
  if (!container) {
    console.warn('Toast container not found');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">&times;</button>
  `;

  // 绑定关闭事件
  const closeBtn = toast.querySelector('.toast-close');
  const removeToast = () => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', removeToast);

  // 添加到容器
  container.appendChild(toast);

  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        removeToast();
      }
    }, duration);
  }
}

/**
 * 批量显示 Toast（用于多个错误）
 * @param {string[]} messages - 消息数组
 * @param {Object} options - 配置选项
 */
export function showToasts(messages, options = {}) {
  messages.forEach((msg, index) => {
    setTimeout(() => {
      showToast(msg, options);
    }, index * 300);
  });
}

/**
 * 关闭所有 Toast
 */
export function closeAllToasts() {
  const container = document.getElementById('toastContainer');
  if (container) {
    container.innerHTML = '';
  }
}
