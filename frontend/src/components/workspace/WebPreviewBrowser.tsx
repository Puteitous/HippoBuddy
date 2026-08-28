/**
 * WebPreviewBrowser - 内嵌浏览器标签页(React 版,对标旧版 components/file-preview-browser.js)
 *
 * 保活策略:采用"记忆地址"方案而非 iframe DOM 保活。
 *   iframe 是独立浏览上下文,组件卸载即丢状态(滚动/表单/JS/导航历史),但换来了
 *   预览面板内容区只呈现一份内容(不会与 .file-preview 并存)。为弥补切换丢失,
 *   浏览器内地址栏导航后通过 onNavigate 把当前地址写回 store(updateWebUrl),
 *   切回该标签时按记忆地址重新创建 iframe 重载页面。
 *
 * 功能:地址栏(回车/前往)、后退/前进、刷新、在系统浏览器中打开;
 *   about:blank 时显示占位页(对齐旧版 browser-placeholder)。
 */
import { useEffect, useRef, useState } from 'react';
import { desktopBridge } from '@/utils/desktop-bridge';
import { translate } from '@/i18n';
import './WebPreviewBrowser.css';

interface WebPreviewBrowserProps {
  /** 初始加载的 URL */
  url: string;
  /** 展示名(用于 iframe title) */
  displayName?: string;
  /** 导航到新地址后回调,用于写回 store 记忆地址 */
  onNavigate?: (url: string) => void;
}

const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals';

export function WebPreviewBrowser({ url, displayName, onNavigate }: WebPreviewBrowserProps) {
  const [currentUrl, setCurrentUrl] = useState(() => normalizeUrl(url));
  const [draft, setDraft] = useState(() => url);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // 首次挂载不回写(避免 mount 时把初始 url 重复写回 store)
  const mountedRef = useRef(false);
  // 用 ref 持有最新 onNavigate,避免其身份变化触发 effect 重跑(否则父组件每次渲染的新函数
  // 会让下面的 effect 反复执行 → scaffold 无限更新循环 #185)
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const isPlaceholder = currentUrl === 'about:blank';

  // 地址栏展示跟随当前 URL(导航后同步;编辑中仅 enter/go 生效,不强制覆盖)
  useEffect(() => {
    setDraft(currentUrl);
  }, [currentUrl]);

  // 地址变化 → 上报 store 记忆地址(仅依赖 currentUrl,onNavigate 经 ref 读取)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onNavigateRef.current?.(currentUrl);
  }, [currentUrl]);

  const navigate = () => {
    const raw = draft.trim();
    if (!raw) return;
    const next = normalizeUrl(raw);
    setDraft(next);
    setCurrentUrl(next);
  };

  const refresh = () => {
    const frame = iframeRef.current;
    if (frame) frame.src = frame.src;
  };

  const goBack = () => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {
      /* 跨域历史访问被拒绝,忽略 */
    }
  };

  const goForward = () => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {
      /* 跨域历史访问被拒绝,忽略 */
    }
  };

  const openExternal = () => {
    desktopBridge.openExternal(currentUrl);
  };

  return (
    <div className="web-browser-preview">
      <div className="browser-toolbar">
        <button type="button" className="browser-nav-btn" onClick={goBack} title={translate('browser.back')}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="10 4 6 8 10 12" />
          </svg>
        </button>
        <button type="button" className="browser-nav-btn" onClick={goForward} title={translate('browser.forward')}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="6 4 10 8 6 12" />
          </svg>
        </button>
        <button type="button" className="browser-nav-btn" onClick={refresh} title={translate('browser.refresh')}>
          <svg viewBox="0 0 128 128" width="14" height="14" fill="currentColor">
            <path d="m118.527 58.378-18.441 18.731c-1.003 1.021-2.374 1.594-3.806 1.594-1.43 0-2.803-.572-3.804-1.594l-18.443-18.731c-2.068-2.102-2.043-5.481.059-7.548 2.101-2.073 5.479-2.045 7.552.058l10.308 10.47c-1.336-19.379-17.244-34.733-36.615-34.733-20.248 0-36.72 16.768-36.72 37.377s16.472 37.374 36.72 37.374c7.452 0 14.626-2.256 20.736-6.525 2.421-1.689 5.748-1.098 7.437 1.319 1.688 2.422 1.095 5.747-1.321 7.437-7.917 5.525-17.202 8.448-26.852 8.448-26.136 0-47.398-21.56-47.398-48.053 0-26.497 21.263-48.055 47.398-48.055 24.611 0 44.897 19.121 47.177 43.48l8.406-8.539c2.072-2.103 5.45-2.129 7.553-.058 2.098 2.066 2.126 5.446.054 7.548z" />
          </svg>
        </button>
        <div className="browser-url-bar">
          <input
            type="text"
            className="browser-url-input"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate();
            }}
          />
          <button type="button" className="browser-go-btn" onClick={navigate} title={translate('browser.go')}>
            <svg fill="none" viewBox="0 0 24 24" width="14" height="14">
              <path
                clipRule="evenodd"
                d="m20.4861 3.83591c.0785-.20173-.1203-.40049-.322-.32204l-16.51278 6.42163c-.2079.0809-.21254.3733-.00731.4608l6.3397 2.7002c.41389.1763.74349.5059.91979.9198l2.7002 6.3397c.0875.2052.3799.2006.4608-.0073zm-.863-1.71324c1.4121-.54916 2.8034.84215 2.2542 2.25427l-6.4216 16.51276c-.5659 1.4553-2.6134 1.4878-3.2253.0512l-2.70022-6.3397c-.02519-.0591-.07228-.1062-.1314-.1314l-6.33971-2.7002c-1.43659-.6119-1.40407-2.65935.05123-3.2253z"
                fill="currentColor"
                fillRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <button type="button" className="browser-open-btn" onClick={openExternal} title={translate('browser.openExternal')}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" />
            <path d="M10 2h4v4" />
            <path d="M14 2L8 8" />
          </svg>
        </button>
      </div>
      {isPlaceholder ? (
        <div className="browser-placeholder">
          <div className="browser-placeholder-content">
            <svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" opacity="0.3">
              <path d="M437,75A256,256,0,0,0,75,437,256,256,0,0,0,437,75ZM256,492c-30.84,0-60.34-23.7-83.08-66.72-10.76-20.36-19.32-43.8-25.49-69.28H364.57c-6.17,25.48-14.73,48.92-25.49,69.28C316.34,468.3,286.84,492,256,492ZM143.16,336a450.51,450.51,0,0,1,0-160H368.84A439.33,439.33,0,0,1,376,256a439.33,439.33,0,0,1-7.16,80ZM256,20c30.84,0,60.34,23.7,83.08,66.72,10.76,20.36,19.32,43.8,25.49,69.28H147.43c6.17-25.48,14.73-48.92,25.49-69.28C195.66,43.7,225.16,20,256,20ZM389.15,176H478a236,236,0,0,1,0,160H389.15A460.57,460.57,0,0,0,396,256,460.57,460.57,0,0,0,389.15,176Zm80.58-20H385.1c-6.63-28.94-16.16-55.58-28.33-78.62-10.34-19.57-22.14-35.67-35-48A237.09,237.09,0,0,1,469.73,156ZM190.21,29.34c-12.84,12.37-24.64,28.47-35,48-12.17,23-21.7,49.68-28.33,78.62H42.27A237.09,237.09,0,0,1,190.21,29.34ZM34,176h88.88a470.58,470.58,0,0,0,0,160H34a236,236,0,0,1,0-160Zm8.3,180H126.9c6.63,28.94,16.16,55.58,28.33,78.62,10.34,19.57,22.14,35.67,35,48A237.09,237.09,0,0,1,42.27,356ZM321.79,482.66c12.84-12.37,24.64-28.47,35-48,12.17-23,21.7-49.68,28.33-78.62h84.63A237.09,237.09,0,0,1,321.79,482.66Z" />
            </svg>
            <span className="browser-placeholder-text">{translate('browser.placeholder')}</span>
          </div>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        className="browser-iframe"
        src={isPlaceholder ? 'about:blank' : currentUrl}
        style={isPlaceholder ? { display: 'none' } : undefined}
        sandbox={IFRAME_SANDBOX}
        loading="lazy"
        title={displayName ?? currentUrl}
      />
    </div>
  );
}

/** 规范化 URL:已有协议(https/file/about 等)保持原样,否则自动补全 https(对齐旧版地址栏) */
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  // 已带任意 scheme(about:/file:/data: 等),保持原样
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(t)) return t;
  return 'https://' + t;
}