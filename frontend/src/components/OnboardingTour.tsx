/**
 * OnboardingTour — 新手指引聚光灯导览(React 版)
 *
 * 功能:
 *   - 首次启动时展示欢迎设置面板(语言/主题/面板布局) + 5 步聚光灯引导
 *   - 高亮核心功能区域 + 气泡说明
 *   - 可随时跳过,localStorage 记录完成状态
 *
 * 流程:① 顶部状态栏 → ② 对话输入区 → ③ 消息区 → ④ 会话列表 → ⑤ 活动栏
 *
 * 与旧版(OnboardingTour.js)差异:
 *   - 欢迎面板提供语言/主题/布局三组选择,复用 i18n store / themeStore / appStore,
 *     与设置面板共享同一状态源(主题按新版仅展示 light/dark/midnight 基础三档)
 *   - 步骤目标映射到新版 DOM class(.top-bar / .chat-panel-input-area / ...)
 *   - 样式改用 --hb 变量体系 + prefers-color-scheme
 *   - 调试入口:window.__resetOnboardingTour() 清除完成标记,可重新演示
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n, i18nStore } from '@/i18n';
import type { Lang } from '@/i18n/messages';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { useAppStore, type PanelLayout } from '@/stores/appStore';
import './OnboardingTour.css';

const STORAGE_KEY = 'hippo-onboarding-done';
const START_DELAY = 3000;
const SPOT_PADDING = 6;
const TOOLTIP_GAP = 14;
const ARROW_SIZE = 12;
const VIEW_MARGIN = 12;

type TourPhase = 'idle' | 'welcome' | 'tour' | 'done';

interface TourStep {
  id: string;
  target: () => HTMLElement | null;
  title: string;
  desc: string;
  position: 'above' | 'below' | 'right' | 'left';
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface PointStyle {
  left: number;
  top: number;
}

interface ArrowStyle extends PointStyle {
  rotation: string;
}

/** 新版 DOM 目标(与 AppShell / ChatPanel / Sidebar / ActivityBar 的 class 对齐) */
function buildSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: 'topbar',
      target: () => document.querySelector('.top-bar') as HTMLElement | null,
      title: t('onboarding.tourTopbarTitle'),
      desc: t('onboarding.tourTopbarDesc'),
      position: 'below',
    },
    {
      id: 'input',
      target: () => document.querySelector('.chat-panel-input-area') as HTMLElement | null,
      title: t('onboarding.tourInputTitle'),
      desc: t('onboarding.tourInputDesc'),
      position: 'above',
    },
    {
      id: 'messages',
      target: () =>
        // 消息态定位到消息区;hero 空态(无会话/无消息)下消息容器不存在,
        // 回退定位到欢迎屏 Hero,避免该步被跳过
        (document.querySelector('.chat-panel-messages') as HTMLElement | null) ||
        (document.querySelector('.chat-empty-hero') as HTMLElement | null),
      title: t('onboarding.tourMessagesTitle'),
      desc: t('onboarding.tourMessagesDesc'),
      position: 'right',
    },
    {
      id: 'sidebar',
      target: () => document.querySelector('.sidebar') as HTMLElement | null,
      title: t('onboarding.tourSidebarTitle'),
      desc: t('onboarding.tourSidebarDesc'),
      position: 'right',
    },
    {
      id: 'activity',
      target: () => document.querySelector('.activity-bar') as HTMLElement | null,
      title: t('onboarding.tourActivityTitle'),
      desc: t('onboarding.tourActivityDesc'),
      position: 'right',
    },
  ];
}

/** 目标元素 rect(含聚光灯 padding) */
function getTargetRect(el: HTMLElement): Rect {
  const rect = el.getBoundingClientRect();
  const p = SPOT_PADDING;
  return {
    left: rect.left - p,
    top: rect.top - p,
    right: rect.right + p,
    bottom: rect.bottom + p,
    width: rect.width + p * 2,
    height: rect.height + p * 2,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

/**
 * 计算气泡 + 箭头位置(含视口边界修正)。
 * 完整复刻旧版 _positionTooltip 逻辑。
 */
function calcPositions(
  r: Rect,
  tW: number,
  tH: number,
  position: TourStep['position'],
): { tooltip: PointStyle; arrow: ArrowStyle } {
  const gap = TOOLTIP_GAP;
  const arrowSize = ARROW_SIZE;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowTop = 0;
  let arrowLeft = 0;
  let arrowRotation = '-45deg';

  switch (position) {
    case 'above': {
      top = r.top - gap - tH;
      left = r.centerX - tW / 2;
      arrowTop = r.top - gap - arrowSize / 2;
      arrowLeft = r.centerX - arrowSize / 2;
      arrowRotation = '135deg';
      break;
    }
    case 'below': {
      top = r.bottom + gap;
      left = r.centerX - tW / 2;
      arrowTop = r.bottom + gap - arrowSize / 2;
      arrowLeft = r.centerX - arrowSize / 2;
      arrowRotation = '-45deg';
      break;
    }
    case 'right': {
      top = r.centerY - tH / 2;
      left = r.right + gap;
      arrowTop = r.centerY - arrowSize / 2;
      arrowLeft = r.right + gap - arrowSize / 2;
      arrowRotation = '45deg';
      break;
    }
    case 'left': {
      top = r.centerY - tH / 2;
      left = r.left - gap - tW;
      arrowTop = r.centerY - arrowSize / 2;
      arrowLeft = r.left - gap - arrowSize / 2;
      arrowRotation = '-135deg';
      break;
    }
  }

  // 气泡边界修正(防止溢出屏幕)
  if (left < VIEW_MARGIN) left = VIEW_MARGIN;
  if (left + tW > viewW - VIEW_MARGIN) left = viewW - VIEW_MARGIN - tW;
  if (top < VIEW_MARGIN) top = VIEW_MARGIN;
  if (top + tH > viewH - VIEW_MARGIN) top = viewH - VIEW_MARGIN - tH;

  // 箭头边界修正(与气泡同步)
  if (arrowLeft < VIEW_MARGIN) arrowLeft = VIEW_MARGIN;
  if (arrowLeft + arrowSize > viewW - VIEW_MARGIN) arrowLeft = viewW - VIEW_MARGIN - arrowSize;
  if (arrowTop < VIEW_MARGIN) arrowTop = VIEW_MARGIN;
  if (arrowTop + arrowSize > viewH - VIEW_MARGIN) arrowTop = viewH - VIEW_MARGIN - arrowSize;

  return {
    tooltip: { left, top },
    arrow: { left: arrowLeft, top: arrowTop, rotation: arrowRotation },
  };
}

export function OnboardingTour() {
  const { t, lang } = useI18n();
  const appTheme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const appPanelLayout = useAppStore((s) => s.panelLayout);
  const setPanelLayout = useAppStore((s) => s.setPanelLayout);
  const steps = useMemo(() => buildSteps(t), [t]);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<TourPhase>('idle');
  const [stepIndex, setStepIndex] = useState(0);

  /** 欢迎面板上的待选偏好(初值取自当前 store,点开始时统一应用) */
  const [selLang, setSelLang] = useState<Lang>(lang);
  const [selTheme, setSelTheme] = useState<Theme>(appTheme);
  const [selLayout, setSelLayout] = useState<PanelLayout>(appPanelLayout);

  /** 主题选择:即时生效并持久化 */
  const pickTheme = useCallback((th: Theme) => {
    setSelTheme(th);
    applyTheme(th);
  }, [applyTheme]);

  /** 语言选择:即时生效并持久化 */
  const pickLang = useCallback((l: Lang) => {
    setSelLang(l);
    i18nStore.getState().setLang(l);
  }, []);

  /** 布局选择:仅记录,进入导览时统一应用 */
  const pickLayout = useCallback((l: PanelLayout) => setSelLayout(l), []);
  const [spotRect, setSpotRect] = useState<PointStyle & { width: number; height: number } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<PointStyle | null>(null);
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle | null>(null);
  const [tooltipReady, setTooltipReady] = useState(false);

  /** 完成引导(跳过 / 走完):写入 localStorage,卸载 UI */
  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* localStorage 不可用时静默降级(每次都会重新引导) */
    }
    setPhase('done');
  }, []);

  /** 定位当前步骤(测量 tooltip 尺寸后计算位置) */
  const reposition = useCallback(() => {
    if (phase !== 'tour') return;
    const step = steps[stepIndex];
    if (!step) {
      finish();
      return;
    }
    const el = step.target();
    if (!el) {
      console.warn(`[Onboarding] 未找到目标元素: ${step.id},跳过`);
      setStepIndex((i) => i + 1);
      return;
    }
    const r = getTargetRect(el);
    setSpotRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    const tip = tooltipRef.current;
    if (!tip) return;
    const tW = tip.offsetWidth;
    const tH = tip.offsetHeight;
    const pos = calcPositions(r, tW, tH, step.position);
    setTooltipStyle(pos.tooltip);
    setArrowStyle(pos.arrow);
    setTooltipReady(true);
  }, [phase, stepIndex, steps, finish]);

  // 步骤变化(进入 tour / 切换步骤)时定位
  useLayoutEffect(() => {
    if (phase !== 'tour') return;
    setTooltipReady(false);
    setTooltipStyle(null);
    setArrowStyle(null);
    reposition();
  }, [phase, stepIndex, reposition]);

  // 窗口 resize 时重新定位
  useEffect(() => {
    if (phase !== 'tour') return;
    const onResize = () => reposition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [phase, reposition]);

  // 启动:检查完成标记 + 延迟展示欢迎面板
  useEffect(() => {
    let done = false;
    try {
      done = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      done = false;
    }
    if (done) return;
    const timer = window.setTimeout(() => {
      setPhase('welcome');
      setStepIndex(0);
    }, START_DELAY);
    return () => window.clearTimeout(timer);
  }, []);

  // 调试入口:清除完成标记
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__resetOnboardingTour = () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setPhase('idle');
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__resetOnboardingTour;
    };
  }, []);

  if (phase === 'idle' || phase === 'done') return null;

  const step = phase === 'tour' ? steps[stepIndex] : null;

  const startTour = () => {
    setPanelLayout(selLayout);
    setStepIndex(0);
    setPhase('tour');
  };

  const goNext = () => setStepIndex((i) => i + 1);
  const goPrev = () => setStepIndex((i) => Math.max(0, i - 1));

  return (
    <>
      {phase === 'welcome' && (
        <div className="ob-welcome-overlay">
          <div className="ob-welcome-panel">
            <div className="ob-welcome-title">{t('onboarding.welcome')}</div>
            <div className="ob-welcome-sub">{t('onboarding.welcomeSub')}</div>

            {/* 语言选择 */}
            <div className="ob-welcome-section">
              <div className="ob-welcome-section-label">{t('onboarding.welcomeLang')}</div>
              <div className="ob-welcome-toggle-group">
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selLang === 'zh' ? ' active' : ''}`}
                  onClick={() => pickLang('zh')}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selLang === 'en' ? ' active' : ''}`}
                  onClick={() => pickLang('en')}
                >
                  English
                </button>
              </div>
            </div>

            {/* 主题选择 */}
            <div className="ob-welcome-section">
              <div className="ob-welcome-section-label">
                {t('onboarding.welcomeTheme')}
                <span className="ob-welcome-theme-hint">{t('onboarding.welcomeThemeHint')}</span>
              </div>
              <div className="ob-welcome-toggle-group">
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selTheme === 'light' ? ' active' : ''}`}
                  onClick={() => pickTheme('light')}
                >
                  {t('onboarding.themeLight')}
                </button>
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selTheme === 'dark' ? ' active' : ''}`}
                  onClick={() => pickTheme('dark')}
                >
                  {t('onboarding.themeDark')}
                </button>
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selTheme === 'midnight' ? ' active' : ''}`}
                  onClick={() => pickTheme('midnight')}
                >
                  {t('onboarding.themeMidnight')}
                </button>
              </div>
            </div>

            {/* 布局选择 + 动画预览 */}
            <div className="ob-welcome-section">
              <div className="ob-welcome-section-label">{t('onboarding.welcomeLayout')}</div>
              <div className="ob-welcome-toggle-group">
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selLayout === 'preview-left' ? ' active' : ''}`}
                  onClick={() => pickLayout('preview-left')}
                >
                  {t('onboarding.layoutPreviewLeft')}
                </button>
                <button
                  type="button"
                  className={`ob-welcome-toggle-btn${selLayout === 'chat-left' ? ' active' : ''}`}
                  onClick={() => pickLayout('chat-left')}
                >
                  {t('onboarding.layoutChatLeft')}
                </button>
              </div>
              <div
                className={`ob-layout-preview${selLayout === 'preview-left' ? ' has-preview-left' : ' has-chat-left'}`}
                id="obLayoutPreview"
              >
                <div className="ob-preview-left">
                  <div className="preview-header">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                    <span className="title-tag">EDITOR</span>
                  </div>
                  <div className="code-line" />
                  <div className="code-line highlight" />
                  <div className="code-line" />
                  <div className="code-line" />
                </div>
                <div className="ob-preview-right">
                  <div className="chat-bubble incoming">✨ {t('onboarding.previewIncoming')}</div>
                  <div className="chat-bubble outgoing">{t('onboarding.previewOutgoing')}</div>
                  <div className="chat-label">{t('onboarding.layoutPreviewLeft')}</div>
                </div>
              </div>
              <div className="ob-layout-hint" id="obLayoutHint">
                <span className="hint-icon">💡</span>
                <span className="hint-text">
                  {selLayout === 'preview-left'
                    ? t('onboarding.layoutHintPreviewLeft')
                    : t('onboarding.layoutHintChatLeft')}
                </span>
              </div>
            </div>

            <button type="button" className="ob-welcome-start-btn" onClick={startTour}>
              {t('onboarding.start')}
            </button>
          </div>
        </div>
      )}

      {phase === 'tour' && step && (
        <>
          {/* 遮罩 + 聚光灯 + 箭头 */}
          <div className="ob-overlay" aria-hidden />
          {spotRect && (
            <div
              className="ob-spotlight"
              style={{
                left: spotRect.left,
                top: spotRect.top,
                width: spotRect.width,
                height: spotRect.height,
              }}
            />
          )}
          {arrowStyle && (
            <div
              className="ob-arrow"
              style={{
                left: arrowStyle.left,
                top: arrowStyle.top,
                transform: `rotate(${arrowStyle.rotation})`,
              }}
            />
          )}

          {/* 气泡 */}
          <div
            ref={tooltipRef}
            className="ob-tooltip"
            style={
              tooltipReady && tooltipStyle
                ? { left: tooltipStyle.left, top: tooltipStyle.top }
                : { visibility: 'hidden' as const }
            }
          >
            <div className="ob-tooltip-title">{step.title}</div>
            <div className="ob-tooltip-desc">{step.desc}</div>
            <div className="ob-tooltip-actions">
              <span className="ob-step-counter">
                {stepIndex + 1} / {steps.length}
              </span>
              <div className="ob-btn-group">
                <button type="button" className="ob-btn ob-btn-skip" onClick={finish}>
                  {t('onboarding.tourSkip')}
                </button>
                {stepIndex > 0 && (
                  <button type="button" className="ob-btn ob-btn-prev" onClick={goPrev}>
                    {t('onboarding.tourPrev')}
                  </button>
                )}
                <button
                  type="button"
                  className="ob-btn ob-btn-next"
                  onClick={stepIndex < steps.length - 1 ? goNext : finish}
                >
                  {stepIndex < steps.length - 1 ? t('onboarding.tourNext') : t('onboarding.tourDone')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
