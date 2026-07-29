// Toast 通知系统

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  info: '<svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C29.5228 44 34.5228 41.7614 38.1421 38.1421C41.7614 34.5228 44 29.5228 44 24C44 18.4772 41.7614 13.4772 38.1421 9.85786C34.5228 6.23858 29.5228 4 24 4C18.4772 4 13.4772 6.23858 9.85786 9.85786C6.23858 13.4772 4 18.4772 4 24C4 29.5228 6.23858 34.5228 9.85786 38.1421C13.4772 41.7614 18.4772 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path fill-rule="evenodd" clip-rule="evenodd" d="M24 11C25.3807 11 26.5 12.1193 26.5 13.5C26.5 14.8807 25.3807 16 24 16C22.6193 16 21.5 14.8807 21.5 13.5C21.5 12.1193 22.6193 11 24 11Z" fill="currentColor"/><path d="M24.5 34V20H23.5H22.5" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 34H28" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '▲'
};

function _getToastTitle(type) {
  const i18n = window.i18n;
  const titles = {
    success: i18n.t('toast.success'),
    error: i18n.t('toast.error'),
    info: i18n.t('toast.info'),
    warning: i18n.t('toast.warning')
  };
  return titles[type] || '';
}

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
    title = _getToastTitle(type)
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
    <button class="toast-close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
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

/**
 * 底部居中 Toast（桌面端提示，3 秒自动消失）
 * @param {string} msg - 消息内容
 */
export function showBottomToast(msg) {
  const existing = document.getElementById('hippoDesktopToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'hippoDesktopToast';
  toast.className = 'toast-bottom';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
