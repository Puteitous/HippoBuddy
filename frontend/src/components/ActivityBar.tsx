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
 *    - pluginMarket → 触发 appStore.setPluginMarketOpen(true)
 *    - toggleActivity → appStore.toggleActivityBar()
 *    - openBrowser / openTerminal → desktopBridge 调用(降级 toast 提示)
 *
 * 集成位置:挂在 AppShell 左侧 Sidebar 之外,浮动面板 absolute 定位。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { ActivityPanelId } from '@/stores/appStore';
import { usePreviewStore } from '@/stores/previewStore';
import { desktopBridge } from '@/utils/desktop-bridge';
import { showToast } from '@/utils/toastStore';
import { useI18n, translate } from '@/i18n';
import { TokenMonitor } from './chat-panel/TokenMonitor';
import { MetricsPanel } from './MetricsPanel';
import { GitPanel } from './git-panel/GitPanel';
import { FeedbackFormModal } from './settings/FeedbackFormModal';
import './ActivityBar.css';

/**
 * 悬停展开浮动面板的延迟(ms)。
 * mouseEnter 立即展开会让鼠标"路过"活动栏时反复挂载/卸载面板(每次挂载都会拉一轮数据),
 * 延迟一拍即可让纯路过不触发;面板已展开时仍立即切换,不影响操作手感。
 */
export const HOVER_OPEN_DELAY = 180;

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
  /** SVG 图标(JXS,对齐旧版 cockpit.html 中各按钮的 SVG 结构) */
  icon: ReactNode;
  /** 若为面板按钮,指定 panelId */
  panel?: ActivityPanelId;
  /** 若为动作按钮,指定 action */
  action?: ActivityActionId;
}

const BUTTONS: ActivityButton[] = [
  {
    id: 'abToken',
    titleKey: 'activity.token',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="6" rx="0.5" />
        <rect x="10" y="8" width="4" height="12" rx="0.5" />
        <rect x="16" y="2" width="4" height="18" rx="0.5" />
      </svg>
    ),
    panel: 'token',
  },
  {
    id: 'abMetrics',
    titleKey: 'activity.monitor',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 17 7 11 11 14 18 6" />
        <polyline points="14 6 18 6 18 10" />
      </svg>
    ),
    panel: 'metrics',
  },
  {
    id: 'abGit',
    titleKey: 'activity.git',
    icon: (
      <svg viewBox="0 0 48 48" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path fillRule="evenodd" clipRule="evenodd" d="M36 12C38.2091 12 40 10.2091 40 8C40 5.79086 38.2091 4 36 4C33.7909 4 32 5.79086 32 8C32 10.2091 33.7909 12 36 12Z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M14 12C16.2091 12 18 10.2091 18 8C18 5.79086 16.2091 4 14 4C11.7909 4 10 5.79086 10 8C10 10.2091 11.7909 12 14 12Z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M14 44C16.2091 44 18 42.2091 18 40C18 37.7909 16.2091 36 14 36C11.7909 36 10 37.7909 10 40C10 42.2091 11.7909 44 14 44Z" />
        <path d="M14 12L14 36L14 33C14 25 36 24 36 16V12" />
      </svg>
    ),
    panel: 'git',
  },
  {
    id: 'abSkillMarket',
    titleKey: 'activity.pluginMarket',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    action: 'skillMarket',
  },
  {
    id: 'abOpenBrowser',
    titleKey: 'activity.browser',
    icon: (
      <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor">
        <path d="M437,75A256,256,0,0,0,75,437,256,256,0,0,0,437,75ZM256,492c-30.84,0-60.34-23.7-83.08-66.72-10.76-20.36-19.32-43.8-25.49-69.28H364.57c-6.17,25.48-14.73,48.92-25.49,69.28C316.34,468.3,286.84,492,256,492ZM143.16,336a450.51,450.51,0,0,1,0-160H368.84A439.33,439.33,0,0,1,376,256a439.33,439.33,0,0,1-7.16,80ZM256,20c30.84,0,60.34,23.7,83.08,66.72,10.76,20.36,19.32,43.8,25.49,69.28H147.43c6.17-25.48,14.73-48.92,25.49-69.28C195.66,43.7,225.16,20,256,20ZM389.15,176H478a236,236,0,0,1,0,160H389.15A460.57,460.57,0,0,0,396,256,460.57,460.57,0,0,0,389.15,176Zm80.58-20H385.1c-6.63-28.94-16.16-55.58-28.33-78.62-10.34-19.57-22.14-35.67-35-48A237.09,237.09,0,0,1,469.73,156ZM190.21,29.34c-12.84,12.37-24.64,28.47-35,48-12.17,23-21.7,49.68-28.33,78.62H42.27A237.09,237.09,0,0,1,190.21,29.34ZM34,176h88.88a470.58,470.58,0,0,0,0,160H34a236,236,0,0,1,0-160Zm8.3,180H126.9c6.63,28.94,16.16,55.58,28.33,78.62,10.34,19.57,22.14,35.67,35,48A237.09,237.09,0,0,1,42.27,356ZM321.79,482.66c12.84-12.37,24.64-28.47,35-48,12.17-23,21.7-49.68,28.33-78.62h84.63A237.09,237.09,0,0,1,321.79,482.66Z" />
      </svg>
    ),
    action: 'openBrowser',
  },
  {
    id: 'abOpenTerminal',
    titleKey: 'activity.terminal',
    icon: (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 4 8 8 4 12" />
        <line x1="11" y1="12" x2="13" y2="12" />
      </svg>
    ),
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
    case 'git':
      return 'activity.git';
  }
}

export function ActivityBar() {
  const { t } = useI18n();
  const hidden = useAppStore((s) => s.activityBarHidden);
  const toggleActivityBar = useAppStore((s) => s.toggleActivityBar);
  const setPluginMarketOpen = useAppStore((s) => s.setPluginMarketOpen);
  const activePanel = useAppStore((s) => s.activityPanel);
  const activePanelPinned = useAppStore((s) => s.activityPanelPinned);
  const setActivityPanel = useAppStore((s) => s.setActivityPanel);

  const barRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** 延迟关闭定时器(hover 移出后留出移动到面板的时间) */
  const closeTimerRef = useRef<number | null>(null);
  /** 延迟展开定时器(hover 进入按钮后等一拍再展开,过滤掉"只是路过") */
  const openTimerRef = useRef<number | null>(null);
  /* 标记本次打开是否要忽略一次外部点击(由按钮点击冒泡触发) */
  const ignoreNextOutsideClickRef = useRef(false);
  /** 建议反馈弹窗开关 */
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  /** 取消待触发的悬停展开(鼠标移出活动栏 / 点到按钮 / 悬停到动作按钮时调用) */
  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  /** hover 移出后延迟关闭,留出鼠标移动到面板的时间;固定展开时不自动关闭 */
  const scheduleClose = useCallback(() => {
    if (activePanelPinned) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setActivityPanel(null), 150);
  }, [activePanelPinned, clearCloseTimer, setActivityPanel]);

  const closePanel = useCallback(() => {
    clearCloseTimer();
    setActivityPanel(null);
  }, [clearCloseTimer, setActivityPanel]);

  /** 点击按钮:面板 → toggle,动作 → 执行 */
  const handleClickButton = useCallback(
    (btn: ActivityButton) => {
      if (btn.panel) {
        // 再次点击已固定的当前面板 → 取消固定并关闭;否则点击固定展开
        if (activePanel === btn.panel && activePanelPinned) {
          closePanel();
          return;
        }
        clearCloseTimer();
        clearOpenTimer();
        ignoreNextOutsideClickRef.current = true;
        setActivityPanel(btn.panel, true);
        // 下一帧清除忽略标记,避免误伤后续点击
        setTimeout(() => {
          ignoreNextOutsideClickRef.current = false;
        }, 0);
        return;
      }
      if (btn.action) {
        switch (btn.action) {
          case 'skillMarket':
            setPluginMarketOpen(true);
            return;
          case 'toggleActivity':
            toggleActivityBar();
            return;
          case 'openBrowser':
            // 打开应用内嵌浏览器标签页(对齐旧版 ws.openWebBrowser → 内嵌浏览器,替代原 openExternal 调系统浏览器)
            usePreviewStore.getState().openWeb('about:blank');
            return;
          case 'openTerminal':
            try {
              const fn = window.electronAPI?.openTerminal;
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
    [activePanel, activePanelPinned, clearCloseTimer, clearOpenTimer, closePanel, setActivityPanel, setPluginMarketOpen, toggleActivityBar],
  );

  /** 悬停预览:鼠标移入面板按钮 → 展开对应面板(不影响点击固定状态) */
  const handleBtnHover = useCallback(
    (btn: ActivityButton) => {
      // 移入动作按钮(非面板)时,取消刚从面板按钮排队的展开
      clearOpenTimer();
      if (!btn.panel) return;
      clearCloseTimer();
      // 面板已展开(悬停或已固定)时立即切换,避免在按钮间移动时出现延迟感
      if (activePanel) {
        setActivityPanel(btn.panel, false);
        return;
      }
      // 仅"从无到有"时延迟:鼠标只是路过活动栏不会真的展开面板、也不会打接口
      const targetPanel = btn.panel;
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        setActivityPanel(targetPanel, false);
      }, HOVER_OPEN_DELAY);
    },
    [activePanel, clearCloseTimer, clearOpenTimer, setActivityPanel],
  );

  // 组件卸载时清理延迟关闭/展开定时器
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  // 点击外部关闭面板:仅作用于"预览态"(未固定)。源码管理面板固定展开(点击打开)时点空白
  // 不关闭(需点头部 ✕ 或再次点按钮收起),因其需专注操作;其余轻量面板仍点空白关闭。
  useEffect(() => {
    if (!activePanel) return;
    const onPointerDown = (e: MouseEvent) => {
      // 仅源码管理面板享受固定优先:固定后点空白保持打开,避免误关
      if (activePanelPinned && activePanel === 'git') return;
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
  }, [activePanel, activePanelPinned, closePanel]);

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
        onMouseLeave={() => {
          // 离开活动栏:取消待展开(鼠标只是路过),并按原逻辑延迟关闭已展开的面板
          clearOpenTimer();
          scheduleClose();
        }}
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
              {btn.icon}
            </button>
          );
        })}

        {/* 底部按钮组:建议反馈 + 切换可见性;容器用 margin-top:auto 推到底部 */}
        <div className="activity-bar-bottom-group">
          <button
            type="button"
            className="activity-bar-btn"
            title={t('feedback.title')}
            onClick={() => setFeedbackOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              <path d="M10 9a2 2 0 0 1 4 0c0 1.4-2 1.9-2 3.2" />
              <circle cx="12" cy="15.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button
            type="button"
            className="activity-bar-btn"
            title={t('activity.hide')}
            onClick={toggleActivityBar}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6H20" />
              <path d="M4 12H20" />
              <path d="M4 18H20" />
              <path d="M7 15L4 12L7 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* 浮动面板 */}
      {activePanel && (
        <div
          className="activity-floating-panel"
          data-active-panel={activePanel}
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

      {feedbackOpen && <FeedbackFormModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}

function renderPanel(id: ActivityPanelId) {
  switch (id) {
    case 'token':
      return <TokenMonitor />;
    case 'metrics':
      return <MetricsPanel />;
    case 'git':
      return <GitPanel />;
  }
}
