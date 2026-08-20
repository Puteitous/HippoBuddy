/**
 * ActivityBar - 左侧固定竖条 + 浮动面板
 *
 * 对标旧版 components/ActivityBar.js。
 *
 * 功能:
 *  - 竖向按钮组,每个按钮可触发"打开浮动面板"或"执行动作"
 *  - 浮动面板根据当前激活按钮,渲染对应内容(props.panels[i].render())
 *  - 点击外部 / 再次点击当前按钮 → 关闭面板
 *  - 切换活动栏可见性(appStore.activityBarHidden,持久化到 localStorage)
 *
 * 阶段 3.7-1 简化:
 *  - 不再注册 token / monitor / files 等内嵌面板(旧版用 HTML 模板克隆),
 *    改为 React 组件注册:props.panels[i].render: () => ReactNode
 *  - 3.7-1 内置面板:
 *    - token → 复用 chat-panel/TokenMonitor(展示当前会话 Token)
 *  - 动作按钮:
 *    - skillMarket → 触发 appStore.setSkillMarketOpen(true)
 *    - toggleActivity → appStore.toggleActivityBar()
 *    - openBrowser / openTerminal → desktopBridge 调用(降级 toast 提示)
 *
 * 集成位置:挂在 AppShell 左侧 Sidebar 之外,浮动面板 absolute 定位。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { desktopBridge } from '@/utils/desktop-bridge';
import { showToast } from '@/utils/toastStore';
import { useI18n, translate } from '@/i18n';
import { TokenMonitor } from './chat-panel/TokenMonitor';
import { MetricsPanel } from './MetricsPanel';
import './ActivityBar.css';

/** 面板 id */
export type ActivityPanelId = 'token' | 'metrics';

/** 动作 id */
export type ActivityActionId =
  | 'skillMarket'
  | 'toggleActivity'
  | 'openBrowser'
  | 'openTerminal';

/** 按钮统一描述 */
interface ActivityButton {
  /** 唯一 id,作为 data-attr */
  id: string;
  /** 鼠标悬停 tooltip 的 i18n key */
  titleKey: string;
  /** SVG path(viewBox 0 0 24 24,fill=none stroke=currentColor) */
  icon: string;
  /** 若为面板按钮,指定 panelId */
  panel?: ActivityPanelId;
  /** 若为动作按钮,指定 action */
  action?: ActivityActionId;
}

const BUTTONS: ActivityButton[] = [
  {
    id: 'abToken',
    titleKey: 'activity.token',
    icon: 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19',
    panel: 'token',
  },
  {
    id: 'abMetrics',
    titleKey: 'activity.monitor',
    icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    panel: 'metrics',
  },
  {
    id: 'abSkillMarket',
    titleKey: 'activity.skillMarket',
    icon: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z',
    action: 'skillMarket',
  },
  {
    id: 'abOpenBrowser',
    titleKey: 'activity.browser',
    icon: 'M3 9h14v10H3zM17 13h4v4h-4M7 5h12v4M5 5h2v4H5z',
    action: 'openBrowser',
  },
  {
    id: 'abOpenTerminal',
    titleKey: 'activity.terminal',
    icon: 'M4 4h16v16H4zM8 9l3 3-3 3M14 15h3',
    action: 'openTerminal',
  },
];

/** 面板标题的 i18n key */
function panelTitleKey(id: ActivityPanelId): string {
  switch (id) {
    case 'token':
      return 'activity.token';
    case 'metrics':
      return 'activity.monitor';
  }
}

export function ActivityBar() {
  const { t } = useI18n();
  const hidden = useAppStore((s) => s.activityBarHidden);
  const toggleActivityBar = useAppStore((s) => s.toggleActivityBar);
  const setSkillMarketOpen = useAppStore((s) => s.setSkillMarketOpen);

  const [activePanel, setActivePanel] = useState<ActivityPanelId | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** 是否被点击固定展开(hover 预览时为 false) */
  const pinnedRef = useRef(false);
  /** 延迟关闭定时器(hover 移出后留出移动到面板的时间) */
  const closeTimerRef = useRef<number | null>(null);
  /** 标记本次打开是否要忽略一次外部点击(由按钮点击冒泡触发) */
  const ignoreNextOutsideClickRef = useRef(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  /** hover 移出后延迟关闭,留出鼠标移动到面板的时间;固定展开时不自动关闭 */
  const scheduleClose = useCallback(() => {
    if (pinnedRef.current) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setActivePanel(null), 150);
  }, [clearCloseTimer]);

  const closePanel = useCallback(() => {
    clearCloseTimer();
    pinnedRef.current = false;
    setActivePanel(null);
  }, [clearCloseTimer]);

  /** 点击按钮:面板 → toggle,动作 → 执行 */
  const handleClickButton = useCallback(
    (btn: ActivityButton) => {
      if (btn.panel) {
        // 再次点击已固定的当前面板 → 取消固定并关闭;否则点击固定展开
        if (activePanel === btn.panel && pinnedRef.current) {
          closePanel();
          return;
        }
        pinnedRef.current = true;
        clearCloseTimer();
        ignoreNextOutsideClickRef.current = true;
        setActivePanel(btn.panel);
        // 下一帧清除忽略标记,避免误伤后续点击
        setTimeout(() => {
          ignoreNextOutsideClickRef.current = false;
        }, 0);
        return;
      }
      if (btn.action) {
        switch (btn.action) {
          case 'skillMarket':
            setSkillMarketOpen(true);
            return;
          case 'toggleActivity':
            toggleActivityBar();
            return;
          case 'openBrowser':
            desktopBridge.openExternal('about:blank');
            return;
          case 'openTerminal':
            try {
              const electron = window.electronAPI?.openTerminal;
              const jcef = window.HippoDesktop?.openTerminal;
              const fn = electron ?? jcef;
              if (fn) {
                void fn(desktopBridge.getCurrentPath() || '.').catch(() => {
                  showToast(translate('topbar.openTerminalFailed'), { type: 'error' });
                });
              } else {
                showToast(translate('topbar.terminalUnsupported'), { type: 'warning' });
              }
            } catch {
              showToast(translate('topbar.terminalUnsupported'), { type: 'warning' });
            }
            return;
        }
      }
    },
    [activePanel, clearCloseTimer, closePanel, setSkillMarketOpen, toggleActivityBar],
  );

  /** 悬停预览:鼠标移入面板按钮 → 展开对应面板(不影响点击固定状态) */
  const handleBtnHover = useCallback(
    (btn: ActivityButton) => {
      if (!btn.panel) return;
      clearCloseTimer();
      setActivePanel(btn.panel);
    },
    [clearCloseTimer],
  );

  // 组件卸载时清理延迟关闭定时器
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // 点击外部关闭面板
  useEffect(() => {
    if (!activePanel) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ignoreNextOutsideClickRef.current) {
        ignoreNextOutsideClickRef.current = false;
        return;
      }
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || barRef.current?.contains(target)) return;
      closePanel();
    };
    // 用 setTimeout 延迟一帧绑定,避免本次打开事件的冒泡误触发关闭
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [activePanel, closePanel]);

  if (hidden) {
    return (
      <button
        type="button"
        className="activity-bar-show-btn"
        title={t('activity.show')}
        onClick={toggleActivityBar}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <div
        className="activity-bar"
        id="activityBar"
        ref={barRef}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        {BUTTONS.map((btn) => {
          const isActive = btn.panel != null && activePanel === btn.panel;
          return (
            <button
              key={btn.id}
              type="button"
              className={`activity-bar-btn${isActive ? ' active' : ''}`}
              title={t(btn.titleKey)}
              data-panel={btn.panel}
              data-action={btn.action}
              onClick={() => handleClickButton(btn)}
              onMouseEnter={() => handleBtnHover(btn)}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={btn.icon} />
              </svg>
            </button>
          );
        })}

        {/* 底部:切换活动栏可见性 */}
        <button
          type="button"
          className="activity-bar-btn activity-bar-bottom-btn"
          title={t('activity.hide')}
          onClick={toggleActivityBar}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="6" width="3" height="12" rx="0.5" />
            <line x1="10" y1="12" x2="20" y2="12" strokeLinecap="round" />
            <polyline points="17 9 20 12 17 15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 浮动面板 */}
      {activePanel && (
        <div
          className="activity-floating-panel"
          ref={panelRef}
          role="dialog"
          aria-label={t('activity.panelLabel')}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <div className="activity-panel-header">
            <span className="activity-panel-title">{t(panelTitleKey(activePanel))}</span>
            <button
              type="button"
              className="activity-panel-close"
              onClick={closePanel}
              aria-label={t('activity.panelClose')}
            >
              ✕
            </button>
          </div>
          <div className="activity-panel-body">
            {renderPanel(activePanel)}
          </div>
        </div>
      )}
    </>
  );
}

function renderPanel(id: ActivityPanelId) {
  switch (id) {
    case 'token':
      return <TokenMonitor />;
    case 'metrics':
      return <MetricsPanel />;
  }
}
