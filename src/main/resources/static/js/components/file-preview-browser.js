/**
 * FilePreviewBrowser — 内嵌浏览器组件
 *
 * 渲染带地址栏/导航按钮的 iframe 浏览器。
 * 被 FilePreview 委托调用（用于 url: 协议的文件）。
 *
 * 支持标签切换保活（keep-alive）：
 *   iframe 是独立浏览上下文，DOM 被销毁即丢失页面状态（滚动/表单/JS 状态/导航历史）。
 *   切到其他标签时由 FilePreview 调用 detach() 把 iframe 摘除并缓存到隐藏容器，
 *   切回时 show() 命中缓存直接恢复原 DOM，页面状态不丢失。
 */

export class FilePreviewBrowser {
  constructor({ container, onUrlChange }) {
    this._container = container;
    this._onUrlChange = onUrlChange || (() => {});
    /** @private Map<string, HTMLElement> URL(tab key) → 保活的浏览器 DOM（含 iframe） */
    this._cache = new Map();
    /** @private 最近一次 show() 的 URL（detach 时作为缓存 key） */
    this._currentShownUrl = null;
    /** @private 隐藏保活容器（iframe 移出预览区后挂在这里，避免被 innerHTML 覆盖销毁） */
    this._keepAliveHost = null;
  }

  /** @private 懒创建隐藏保活容器：移出视口但保持渲染（不可用 display:none，会销毁 iframe） */
  _ensureKeepAliveHost() {
    if (this._keepAliveHost) return;
    this._keepAliveHost = document.createElement('div');
    this._keepAliveHost.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1280px;height:800px;overflow:hidden;pointer-events:none;';
    this._keepAliveHost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._keepAliveHost);
  }

  /**
   * 将当前预览容器中的浏览器（若存在）摘除并保活。
   * 在渲染其他内容（普通文件/diff/另一浏览器）之前调用，防止 iframe 被销毁导致状态丢失。
   * 幂等：预览容器中没有浏览器时不做任何事。
   */
  detach() {
    const node = this._container.querySelector('.file-browser-preview');
    if (!node) return;
    this._ensureKeepAliveHost();
    this._container.removeChild(node);
    this._keepAliveHost.appendChild(node);
    // 缓存 key 用最近一次 show 的 URL（即 tab key），保证切回时能命中
    const key = this._currentShownUrl;
    if (key) {
      this._cache.set(key, node);
    }
    this._currentShownUrl = null;
  }

  /**
   * 释放指定 URL 的浏览器缓存（销毁 iframe，释放网络连接与内存）。
   * 用于关闭 web 标签时调用。
   * @param {string} url - 与 show() 传入一致的 URL（tab key）
   */
  dispose(url) {
    if (!url) return;
    const node = this._cache.get(url);
    if (node) {
      node.remove();
      this._cache.delete(url);
    }
  }

  /**
   * 渲染内嵌浏览器 — 地址栏 + iframe
   * 若该 URL 的浏览器此前被 detach 保活，则直接恢复原 DOM（页面状态不丢失）。
   * @param {string} url - 要加载的 URL
   */
  show(url) {
    // 先把当前预览容器中的浏览器（若有）摘除保活，避免被下面的 innerHTML 覆盖销毁
    this.detach();

    // 命中缓存：恢复保活的浏览器 DOM（节点上的事件监听器仍然有效，无需重新绑定）
    const cached = this._cache.get(url);
    if (cached) {
      this._container.appendChild(cached);
      this._cache.delete(url);
      this._currentShownUrl = url;
      // 尽力同步地址栏显示为 iframe 当前实际地址（跨域无法读取 location 时保留原值）
      const iframe = cached.querySelector('.browser-iframe');
      const input = cached.querySelector('.browser-url-input');
      if (iframe && input) {
        try {
          const href = iframe.contentWindow.location.href;
          if (href && href !== 'about:blank') input.value = href;
        } catch { /* 跨域读取被拒绝，保留原值 */ }
      }
      return;
    }

    const encodedUrl = encodeURI(url);
    const displayUrl = url;

    this._container.innerHTML = `
      <div class="file-browser-preview">
        <div class="browser-toolbar">
          <button class="browser-nav-btn" data-action="back" title="${i18n.t('browser.back')}" disabled>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="10 4 6 8 10 12"/></svg>
          </button>
          <button class="browser-nav-btn" data-action="forward" title="${i18n.t('browser.forward')}" disabled>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 4 10 8 6 12"/></svg>
          </button>
          <button class="browser-nav-btn browser-refresh-btn" data-action="refresh" title="${i18n.t('browser.refresh')}">
            <svg viewBox="0 0 128 128" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g id="icon"><path id="XMLID_151_" d="m118.527 58.378-18.441 18.731c-1.003 1.021-2.374 1.594-3.806 1.594-1.43 0-2.803-.572-3.804-1.594l-18.443-18.731c-2.068-2.102-2.043-5.481.059-7.548 2.101-2.073 5.479-2.045 7.552.058l10.308 10.47c-1.336-19.379-17.244-34.733-36.615-34.733-20.248 0-36.72 16.768-36.72 37.377s16.472 37.374 36.72 37.374c7.452 0 14.626-2.256 20.736-6.525 2.421-1.689 5.748-1.098 7.437 1.319 1.688 2.422 1.095 5.747-1.321 7.437-7.917 5.525-17.202 8.448-26.852 8.448-26.136 0-47.398-21.56-47.398-48.053 0-26.497 21.263-48.055 47.398-48.055 24.611 0 44.897 19.121 47.177 43.48l8.406-8.539c2.072-2.103 5.45-2.129 7.553-.058 2.098 2.066 2.126 5.446.054 7.548z"/></g></svg>
          </button>
          <div class="browser-url-bar">
            <input type="text" class="browser-url-input" value="${displayUrl}" spellcheck="false" autofocus>
            <button class="browser-go-btn" title="${i18n.t('browser.go')}"><svg fill="none" viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20.4861 3.83591c.0785-.20173-.1203-.40049-.322-.32204l-16.51278 6.42163c-.2079.0809-.21254.3733-.00731.4608l6.3397 2.7002c.41389.1763.74349.5059.91979.9198l2.7002 6.3397c.0875.2052.3799.2006.4608-.0073zm-.863-1.71324c1.4121-.54916 2.8034.84215 2.2542 2.25427l-6.4216 16.51276c-.5659 1.4553-2.6134 1.4878-3.2253.0512l-2.70022-6.3397c-.02519-.0591-.07228-.1062-.1314-.1314l-6.33971-2.7002c-1.43659-.6119-1.40407-2.65935.05123-3.2253z" fill="currentColor" fill-rule="evenodd"/></svg></button>
          </div>
          <button class="browser-open-btn" title="${i18n.t('browser.openExternal')}">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>
              <path d="M10 2h4v4"/>
              <path d="M14 2L8 8"/>
            </svg>
          </button>
        </div>
        ${url === 'about:blank'
          ? `<div class="browser-placeholder">
               <div class="browser-placeholder-content">
                 <svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" opacity="0.3">
                   <path d="M437,75A256,256,0,0,0,75,437,256,256,0,0,0,437,75ZM256,492c-30.84,0-60.34-23.7-83.08-66.72-10.76-20.36-19.32-43.8-25.49-69.28H364.57c-6.17,25.48-14.73,48.92-25.49,69.28C316.34,468.3,286.84,492,256,492ZM143.16,336a450.51,450.51,0,0,1,0-160H368.84A439.33,439.33,0,0,1,376,256a439.33,439.33,0,0,1-7.16,80ZM256,20c30.84,0,60.34,23.7,83.08,66.72,10.76,20.36,19.32,43.8,25.49,69.28H147.43c6.17-25.48,14.73-48.92,25.49-69.28C195.66,43.7,225.16,20,256,20ZM389.15,176H478a236,236,0,0,1,0,160H389.15A460.57,460.57,0,0,0,396,256,460.57,460.57,0,0,0,389.15,176Zm80.58-20H385.1c-6.63-28.94-16.16-55.58-28.33-78.62-10.34-19.57-22.14-35.67-35-48A237.09,237.09,0,0,1,469.73,156ZM190.21,29.34c-12.84,12.37-24.64,28.47-35,48-12.17,23-21.7,49.68-28.33,78.62H42.27A237.09,237.09,0,0,1,190.21,29.34ZM34,176h88.88a470.58,470.58,0,0,0,0,160H34a236,236,0,0,1,0-160Zm8.3,180H126.9c6.63,28.94,16.16,55.58,28.33,78.62,10.34,19.57,22.14,35.67,35,48A237.09,237.09,0,0,1,42.27,356ZM321.79,482.66c12.84-12.37,24.64-28.47,35-48,12.17-23,21.7-49.68,28.33-78.62h84.63A237.09,237.09,0,0,1,321.79,482.66Z"/>
                 </svg>
                 <span class="browser-placeholder-text">${i18n.t('browser.placeholder')}</span>
               </div>
             </div>
             <iframe class="browser-iframe" style="display:none;" src="about:blank"
               sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
               loading="lazy" title="${displayUrl}"></iframe>`
          : `<iframe class="browser-iframe" src="${encodedUrl}"
               sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
               loading="lazy" title="${displayUrl}"></iframe>`
        }
      </div>`;

    this._currentShownUrl = url;
    this._bindBrowserEvents(url);
  }

  /** @private 绑定浏览器工具栏事件 */
  _bindBrowserEvents(currentUrl) {
    const container = this._container;
    const iframe = container.querySelector('.browser-iframe');
    const placeholder = container.querySelector('.browser-placeholder');
    const urlInput = container.querySelector('.browser-url-input');
    const goBtn = container.querySelector('.browser-go-btn');
    const refreshBtn = container.querySelector('.browser-refresh-btn');
    const backBtn = container.querySelector('[data-action="back"]');
    const fwdBtn = container.querySelector('[data-action="forward"]');
    const openBtn = container.querySelector('.browser-open-btn');

    if (!urlInput) return;

    // 地址栏回车 / 前往按钮
    const navigate = () => {
      let rawUrl = urlInput.value.trim();
      if (!rawUrl) return;
      // 自动补全协议
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
        urlInput.value = rawUrl;
      }
      if (iframe) {
        iframe.style.display = '';
        iframe.src = rawUrl;
      }
      if (placeholder) placeholder.style.display = 'none';
      // 通知外部 URL 变更
      this._onUrlChange(rawUrl);
    };

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate();
    });
    if (goBtn) goBtn.addEventListener('click', navigate);

    // 刷新
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        iframe.src = iframe.src;
      });
    }

    // 后退 / 前进（尝试调用 iframe 的 history API）
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        try { iframe.contentWindow.history.back(); } catch {}
      });
    }
    if (fwdBtn) {
      fwdBtn.addEventListener('click', () => {
        try { iframe.contentWindow.history.forward(); } catch {}
      });
    }

    // 在系统浏览器中打开
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const url = urlInput.value;
        if (window.HippoDesktop && window.HippoDesktop.openExternal) {
          window.HippoDesktop.openExternal(url).catch(() => {
            window.open(url, '_blank');
          });
        } else {
          window.open(url, '_blank');
        }
      });
    }
  }
}
