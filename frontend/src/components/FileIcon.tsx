/**
 * FileIcon - 共享文件/文件夹图标组件
 *
 * 统一 RefChips、FileTree 等处的文件图标来源(替代 RefChips 的 emoji 占位)。
 * SVG 路径与旧 FileTree 内联图标保持一致,避免多处重复定义。
 */
interface FileIconProps {
  /** 图标类型 */
  kind: 'file' | 'folder' | 'text';
  /** 文件夹是否展开(仅 kind === 'folder' 生效) */
  open?: boolean;
  /** 图标尺寸(px) */
  size?: number;
  className?: string;
}

export function FileIcon({ kind, open = false, size = 14, className }: FileIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (kind === 'folder') {
    if (open) {
      /* 展开的文件夹(对齐原 FileTree expanded 大图标) */
      return (
        <svg
          {...common}
          viewBox="0 0 48 48"
          strokeWidth={4}
          className={className}
        >
          <path d="M4 9V41L9 21H39.5V15C39.5 13.9 38.6 13 37.5 13H24L19 7H6C4.9 7 4 7.9 4 9Z" />
          <path d="M40 41L44 21H8.8L4 41H40Z" />
        </svg>
      );
    }
    /* 关闭的文件夹(对齐原 FileTree collapsed 图标) */
    return (
      <svg {...common} className={className}>
        <path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
      </svg>
    );
  }

  if (kind === 'text') {
    return (
      <svg {...common} className={className}>
        <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z" />
        <polyline points="9 2 9 5 12 5" />
        <line x1="6" y1="9" x2="10" y2="9" />
        <line x1="6" y1="11" x2="10" y2="11" />
      </svg>
    );
  }

  // file:通用文件图标(对齐旧 FileTree 文件图标)
  return (
    <svg {...common} className={className}>
      <path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z" />
      <polyline points="10 2 10 5 13 5" />
    </svg>
  );
}