/**
 * FilePreviewDiff - 单组 diff 行渲染(阶段 3.5 简化版)
 *
 * 接收一组 DiffLine,逐行渲染为带颜色与行号的 diff 视图:
 *   - equal(灰):未变化行
 *   - insert(绿):新增行
 *   - delete(红):删除行
 *
 * 由 FileDiffView 调用,渲染"整文件净 diff"或"单次变更 diff"。
 *
 * 简化(留 3.7):
 *   - 不实现 hunk 折叠 / 上下文折叠
 *   - 不实现词级(word-level)行内高亮
 *   - 不实现差分同步滚动
 */
import type { DiffLine } from '@/types';
import './FilePreviewDiff.css';

interface FilePreviewDiffProps {
  lines: DiffLine[];
  /** 可选:起始聚焦行(高亮显示,3.5 不滚动) */
  focusStartLine?: number;
}

export function FilePreviewDiff({ lines, focusStartLine }: FilePreviewDiffProps) {
  if (!lines || lines.length === 0) {
    return <div className="file-preview-diff empty">无差异内容</div>;
  }
  return (
    <div className="file-preview-diff">
      <table className="diff-table">
        <tbody>
          {lines.map((line, idx) => {
            const cls = diffLineClass(line.type);
            const isFocus =
              focusStartLine != null &&
              (line.oldLine === focusStartLine || line.newLine === focusStartLine);
            return (
              <tr key={idx} className={`diff-row ${cls} ${isFocus ? 'focused' : ''}`}>
                <td className="diff-gutter old" title="旧行号">
                  {line.oldLine ?? ''}
                </td>
                <td className="diff-gutter new" title="新行号">
                  {line.newLine ?? ''}
                </td>
                <td className="diff-marker" aria-hidden>
                  {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
                </td>
                <td className="diff-content">
                  <pre className="diff-line">{line.content}</pre>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function diffLineClass(type: DiffLine['type']): string {
  switch (type) {
    case 'insert':
      return 'diff-insert';
    case 'delete':
      return 'diff-delete';
    default:
      return 'diff-equal';
  }
}
