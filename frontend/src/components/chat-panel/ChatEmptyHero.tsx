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
  const [isBouncing, setIsBouncing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const logoRef = useRef<HTMLDivElement | null>(null);

  const presets = MODE_PRESETS[mode] ?? MODE_PRESETS.coding;

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

/** 河马点击时冒泡(与旧版 .hippo-bubble 一致) */
function spawnBubbles(el: HTMLDivElement | null) {
  if (!el) return;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const bubble = document.createElement('span');
    bubble.className = 'hippo-bubble';
    const size = 10 + Math.random() * 14;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${50 + (Math.random() - 0.5) * 60}%`;
    bubble.style.top = `${40 + Math.random() * 20}%`;
    bubble.style.setProperty('--bubble-drift', `${(Math.random() - 0.5) * 32}px`);
    el.appendChild(bubble);
    bubble.addEventListener('animationend', () => bubble.remove());
  }
}

/** 河马点击时吐对话框气泡(对齐旧版 _spawnHippoSpeech 文案) */
const HIPPO_SPEECHES = [
  '代码写得不错嘛 👍',
  '好热🫠',
  '想泡水💧',
  '饿了吗🍉',
  '今天吃什么 🍗',
  '又在写 bug 了？',
  '你好呀 👋',
  '让我看看… 👀',
  '这个我熟！',
  '要帮忙吗？',
  '💤 有点困…',
  '该下班了 🕐',
  '正在思考中… 🤔',
  '快夸我快夸我',
  '👿 哼！',
  '好一个屁屁哦，😯',
];

function spawnHippoSpeech(el: HTMLDivElement | null) {
  if (!el) return;
  const existing = el.querySelector('.hippo-speech');
  if (existing) existing.remove();

  const text = HIPPO_SPEECHES[Math.floor(Math.random() * HIPPO_SPEECHES.length)];
  const speech = document.createElement('div');
  speech.className = 'hippo-speech';
  speech.textContent = text;
  el.appendChild(speech);
  speech.addEventListener('animationend', () => speech.remove());
}

export const ChatEmptyHero = memo(ChatEmptyHeroComponent);
