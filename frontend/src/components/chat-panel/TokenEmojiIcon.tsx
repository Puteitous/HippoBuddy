/**
 * TokenEmojiIcon - 根据 Token 使用率返回三档表情图标(对齐旧版 _getTokenEmoji)。
 * 轮廓色由 CSS 变量 --sbt-emoji-stroke 控制(亮色 #000 / 暗色 #fff),
 * 避免读取 document.documentElement,跟随主题自动切换。
 */
export function TokenEmojiIcon({ percent }: { percent: number }) {
  const svgProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'var(--sbt-emoji-stroke)',
    strokeWidth: 4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  // 😊 开心 — 余量充足(≤ 50%)
  if (percent <= 50) {
    return (
      <svg {...svgProps}>
        <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" />
        <path d="M31 18V19" />
        <path d="M17 18V19" />
        <path d="M31 31C31 31 29 35 24 35C19 35 17 31 17 31" />
      </svg>
    );
  }
  // 😐 平静 — 注意占用(50% ~ 75%)
  if (percent <= 75) {
    return (
      <svg {...svgProps}>
        <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" />
        <path d="M31 18V19" />
        <path d="M17 18V19" />
        <rect x="20" y="24" width="8" height="12" rx="4" />
      </svg>
    );
  }
  // 😰 焦虑 — 占用较高(≥ 75%)
  return (
    <svg {...svgProps}>
      <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" />
      <path d="M24 29C29 29 31 33 31 33H17C17 33 19 29 24 29Z" />
      <path d="M32 17L29 20L32 23" />
      <path d="M16 17L19 20L16 23" />
    </svg>
  );
}