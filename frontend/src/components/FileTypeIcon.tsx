/**
 * FileTypeIcon - 按扩展名显示文件类型彩色图标的共享组件
 *
 * 用途:FileTree 文件节点 / RefChips 引用徽章等需要"按文件类型区分图标"的场景。
 * 背景:新版部署于 /app context,无法引用旧版后端 /static/icons 静态资源,
 *       故由本组件消费 utils/file-icons.ts 的映射 + import.meta.glob 加载的本地图标 URL。
 *
 * 注意:
 *  - 文件夹/纯文本等场景仍走共享 FileIcon(file/folder/text 线框图标),
 *    本组件只负责"文件类型彩色图标"这一件事,避免职责混杂。
 *  - 目录时应显式渲染 FileIcon(kind="folder"),本组件不接受 isDirectory。
 */
import { getFileIconUrl } from '@/utils/file-icons';
import './FileTypeIcon.css';

interface FileTypeIconProps {
  /** 文件名(用于解析扩展名) */
  fileName: string;
  /** 展示尺寸(px),默认 14(与旧版 FileTree 一致) */
  size?: number;
  className?: string;
  alt?: string;
}

export function FileTypeIcon({ fileName, size = 14, className, alt = '' }: FileTypeIconProps) {
  const src = getFileIconUrl(fileName, false);
  return (
    <img
      className={`file-type-icon${className ? ` ${className}` : ''}`}
      src={src}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      loading="lazy"
    />
  );
}