/**
 * ChatEmptyHero - 空会话欢迎屏(Hero)
 *
 * 视觉对齐旧版 cockpit.html 的 .empty-state:
 *  - 河马 logo(浮动动画,点击弹跳 + 气泡)
 *  - 标题 "HippoBuddy," + 标语(随模式切换,带动画)
 *  - 模式胶囊 Chat/Office/Coding(与 appStore.mode 联动)
 *  - 当前模式预设提示词标签(点击填入输入框)
 *
 * 主题色一律使用 index.css 中的全局 CSS 变量,随 data-theme 自动切换。
 */
import { memo, useRef, useState } from 'react';
import type { SessionMode } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { translate, useI18n } from '@/i18n';
import { MODE_ORDER, MODE_PRESETS, SLOGAN_MAP } from './modePresetsData';
import './ChatEmptyHero.css';

/** 河马 SVG path(与旧版 #hippoIcon 一致) */
const HIPPO_ICON_PATHS = (
  <>
    <path
      d="m42 9h20l-.859 4.293a5.332 5.332 0 0 1-.463 1.351 5.38 5.38 0 0 1-5.407 2.942l-1.071-.119-6.559-.91z"
      fill="#786C68"
    />
    <path
      d="m55.271 17.586-1.071-.119-6.559-.91-2.653-3.557h16.212l-.059.293a5.332 5.332 0 0 1-.463 1.351 5.38 5.38 0 0 1-5.407 2.942z"
      fill="#69574F"
    />
    <path
      d="m22 9h-20l.859 4.293a5.332 5.332 0 0 0 .463 1.351 5.38 5.38 0 0 0 5.407 2.942l1.071-.119 6.559-.91z"
      fill="#786C68"
    />
    <path
      d="m8.729 17.586 1.071-.119 6.559-.91 2.653-3.557h-16.212l.059.293a5.332 5.332 0 0 0 .463 1.351 5.38 5.38 0 0 0 5.407 2.942z"
      fill="#69574F"
    />
    <path d="m6.005 30.51a26 26 0 0 1 51.99 0" fill="#786C68" />
    <path
      d="m32 5c-.555 0-1.105.023-1.652.058-5.424 3.569-8.828 8.709-8.828 14.423a15.969 15.969 0 0 0 4.736 11.029h31.744a26 26 0 0 0-26-25.51z"
      fill="#766F6B"
    />
    <path
      d="m27.323 21.23c1.524-.152 3.086-.23 4.677-.23s3.153.078 4.677.23a6 6 0 0 1 11.323 2.695c8.412 3.365 14 9.307 14 16.075 0 10.493-13.431 19-30 19s-30-8.507-30-19c0-6.768 5.588-12.71 14-16.075a6 6 0 0 1 11.323-2.695z"
      fill="#E2C8E4"
    />
    <path
      d="m48 23.925a6 6 0 0 0-11.323-2.695c-1.524-.152-3.086-.23-4.677-.23s-3.153.078-4.677.23a6 6 0 0 0-11.323 2.695c-.3.12-.588.251-.882.377a44.541 44.541 0 0 0-.558 7.013 40.734 40.734 0 0 0 9.772 27.056 46.578 46.578 0 0 0 7.668.629c16.569 0 30-8.507 30-19 0-6.768-5.588-12.71-14-16.075z"
      fill="#E3CCE5"
    />
    <g fill="#3A2727">
      <path d="m24 13h5v2h-5z" />
      <path d="m35 13h5v2h-5z" />
      <circle cx="22" cy="24" r="2" />
      <circle cx="42" cy="24" r="2" />
      <path d="m36 54a5 5 0 0 1-4-2 5 5 0 0 1-9-3h2a3 3 0 0 0 6 0 1 1 0 0 1 2 0 3 3 0 0 0 6 0h2a5.006 5.006 0 0 1-5 5z" />
    </g>
  </>
);

/** 模式按钮图标(与旧版 cockpit.html hero-mode 胶囊一致,含各自 viewBox/stroke-width) */
const MODE_ICONS: Record<SessionMode, { icon: string; label: string; viewBox: string; strokeWidth: number }> = {
  chat: {
    icon: 'M44 7H4V37H11V42L21 37H44V7Z M31 16V17 M17 16V17 M31 25C31 25 29 29 24 29C19 29 17 25 17 25',
    label: 'Chat',
    viewBox: '0 0 48 48',
    strokeWidth: 4,
  },
  coding: {
    icon: 'M6 3.5 2 8l4 4.5M10 3.5l4 4.5-4 4.5',
    label: 'Code',
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
  },
  office: {
    icon: 'M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z M9 1v4h4 M5 8h6 M5 10h4',
    label: 'Office',
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
  },
};

interface ChatEmptyHeroProps {
  /** 预设提示词被点击:填入 ChatPanel 输入框 */
  onPresetSelect: (prompt: string) => void;
}

function ChatEmptyHeroComponent({ onPresetSelect }: ChatEmptyHeroProps) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const { t } = useI18n();
  const [isBouncing, setIsBouncing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const logoRef = useRef<HTMLDivElement | null>(null);

  /** 解析预设的 label/prompt(i18n key → 当前语言文本) */
  const presets = (MODE_PRESETS[mode] ?? MODE_PRESETS.coding).map((p) => ({
    ...p,
    label: t(p.label),
    prompt: t(p.prompt),
  }));

  /** 点击河马:弹跳 + 冒泡 + 吐对话框气泡 */
  const handleLogoClick = () => {
    if (isBouncing) return;
    setIsBouncing(true);
    spawnBubbles(logoRef.current);
    spawnHippoSpeech(logoRef.current);
    window.setTimeout(() => setIsBouncing(false), 520);
  };

  /** 切换模式:更新 appStore.mode + 播放标语动画 */
  const handleModeChange = (m: SessionMode) => {
    if (m === mode) return;
    setIsAnimating(true);
    setMode(m);
    window.setTimeout(() => setIsAnimating(false), 500);
  };

  return (
    <div className="chat-empty-hero">
      {/* 河马 logo */}
      <div
        ref={logoRef}
        className={`empty-logo ${isBouncing ? 'bouncing' : ''}`}
        onClick={handleLogoClick}
        role="button"
        tabIndex={0}
        aria-label="HippoBuddy"
      >
        <span className="hippo-char">
          <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
            {HIPPO_ICON_PATHS}
          </svg>
        </span>
      </div>

      {/* 标题 + 标语 */}
      <div className="empty-heading">
        <h1 className="empty-title">
          <span className="title-first">HippoBuddy,</span>{' '}
          <span
            key={mode}
            className={`title-last ${isAnimating ? 'title-switching' : ''}`}
          >
            {SLOGAN_MAP[mode]}
          </span>
        </h1>
      </div>

      {/* 模式胶囊 */}
      <div className="empty-mode-selector">
        <span className="mode-capsule hero-mode-capsule">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-btn ${mode === m ? 'active' : ''}`}
              data-mode={m}
              onClick={() => handleModeChange(m)}
              title={`${MODE_ICONS[m].label} Mode`}
            >
              <svg
                className="mode-icon"
                viewBox={MODE_ICONS[m].viewBox}
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth={MODE_ICONS[m].strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={MODE_ICONS[m].icon} />
              </svg>
              <span>{MODE_ICONS[m].label}</span>
            </button>
          ))}
        </span>
      </div>

      {/* 预设提示词 */}
      <div className="empty-presets">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="mode-preset-btn"
            onClick={() => onPresetSelect(p.prompt)}
            title={p.prompt}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={p.icon} />
            </svg>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 河马点击时冒泡(对齐旧版 _spawnHippoBubbles:2~3 个小泡,6~11px,从河马中心散布) */
function spawnBubbles(el: HTMLDivElement | null) {
  if (!el) return;
  const state = el.closest('.chat-empty-hero') as HTMLElement | null;
  if (!state) return;
  const hippoRect = el.getBoundingClientRect();
  const stateRect = state.getBoundingClientRect();
  const cx = hippoRect.left - stateRect.left + hippoRect.width / 2;
  const cy = hippoRect.top - stateRect.top + hippoRect.height / 2;
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    window.setTimeout(() => {
      const bubble = document.createElement('span');
      bubble.className = 'hippo-bubble';
      const size = 6 + Math.random() * 5;
      const drift = (Math.random() - 0.5) * 30;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.left = `${cx - size / 2}px`;
      bubble.style.top = `${cy - size / 2}px`;
      bubble.style.setProperty('--bubble-drift', `${drift}px`);
      state.appendChild(bubble);
      bubble.addEventListener('animationend', () => bubble.remove());
    }, i * 80);
  }
}

/** 河马点击时吐对话框气泡(对齐旧版 _spawnHippoSpeech 文案;值为 i18n key) */
const HIPPO_SPEECHES = [
  'chat.heroSpeech1',
  'chat.heroSpeech2',
  'chat.heroSpeech3',
  'chat.heroSpeech4',
  'chat.heroSpeech5',
  'chat.heroSpeech6',
  'chat.heroSpeech7',
  'chat.heroSpeech8',
  'chat.heroSpeech9',
  'chat.heroSpeech10',
  'chat.heroSpeech11',
  'chat.heroSpeech12',
  'chat.heroSpeech13',
  'chat.heroSpeech14',
  'chat.heroSpeech15',
  'chat.heroSpeech16',
];

function spawnHippoSpeech(el: HTMLDivElement | null) {
  if (!el) return;
  const existing = el.querySelector('.hippo-speech');
  if (existing) existing.remove();

  const text = translate(HIPPO_SPEECHES[Math.floor(Math.random() * HIPPO_SPEECHES.length)]);
  const speech = document.createElement('div');
  speech.className = 'hippo-speech';
  speech.textContent = text;
  el.appendChild(speech);
  speech.addEventListener('animationend', () => speech.remove());
}

export const ChatEmptyHero = memo(ChatEmptyHeroComponent);
