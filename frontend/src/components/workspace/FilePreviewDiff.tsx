/**
 * FilePreviewDiff - 单组 diff 行渲染(git 式折叠 + 词级高亮版)
 *
 * 接收一组 DiffLine,逐行渲染为带颜色与行号的 diff 视图:
 *   - same(灰):未变化行
 *   - insert/add(绿):新增行
 *   - delete/removed(红):删除行
 *
 * 增强(批次 A 对齐旧版 FileDiffView):
 *   - 行号映射:后端只返回 type/content,行号由前端按 removed=旧行号、
 *     added=新行号、same=两表都递增预计算,折叠/展开后行号依旧准确
 *   - 词级(word-level)行内高亮:wordDiff.{old,new} 按 1-based 行号索引,
 *     存在 delete/insert 词时渲染 <del>/<ins> 标记
 *   - hunk 折叠:git 式折叠上下文行(buildHunkSequence),点击展开/收起,
 *     工具条提供"展开全部/收起全部"
 *
 * 由 FileDiffView 调用,渲染"整文件净 diff"或"单次变更 diff"。
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { DiffLine, WordDiffMap, WordDiffToken } from '@/types';
import { buildHunkSequence, HUNK_EXPAND_MAX_LINES } from '@/utils/diff-hunks';
import { highlightDiffLines } from '@/utils/diff-highlight';
import { useI18n } from '@/i18n';
import { showToast } from '@/utils/toastStore';
import './FilePreviewDiff.css';

interface FilePreviewDiffProps {
  lines: DiffLine[];
  /** 行内词级 diff(按 1-based 行号索引;缺省时不做词级高亮) */
  wordDiff?: WordDiffMap;
  /** 当前文件路径,用于按扩展名推断语法高亮语言(缺省时不启用语法高亮) */
  filePath?: string;
  /** 可选:起始聚焦行(高亮显示,3.5 不滚动) */
  focusStartLine?: number;
}

export function FilePreviewDiff({ lines, wordDiff, filePath, focusStartLine }: FilePreviewDiffProps) {
  const { t } = useI18n();
  // 行号映射:预计算每个原始下标对应的旧/新文件行号,覆盖全部 changes
  // (含被折叠/丢弃的头部上下文段),保证折叠/展开后行号绝对准确
  const numMaps = useMemo(() => buildNumMaps(lines), [lines]);
  // git 式折叠显示序列
  const displaySeq = useMemo(() => buildHunkSequence(lines), [lines]);
  // 已展开的折叠段集合(存 hunk.from)
  const [expandedHunks, setExpandedHunks] = useState<ReadonlySet<number>>(new Set());

  // 语法高亮:整块 diff 文本交给 highlight.js 后按行切分(词级 diff 优先于语法高亮);
  // 无文件路径 / 高亮失败 / 超限时返回 null,由渲染处回退纯文本。
  const highlightedLines = useMemo(
    () => highlightDiffLines(lines, filePath ?? ''),
    [lines, filePath],
  );

  const hunks = useMemo(
    () => displaySeq.filter((it) => it.type === 'hunk') as Array<Extract<(typeof displaySeq)[number], { type: 'hunk' }>>,
    [displaySeq],
  );

  if (!lines || lines.length === 0) {
    return <div className="file-preview-diff empty">{t('diff.noContent')}</div>;
  }

  const collapsedCount = hunks.filter((h) => !expandedHunks.has(h.from)).length;
  const allExpanded = collapsedCount === 0;
  const hasToolbar = hunks.length > 0;

  const toggleHunk = (hunkFrom: number) => {
    setExpandedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(hunkFrom)) {
        next.delete(hunkFrom);
      } else {
        const hunk = hunks.find((h) => h.from === hunkFrom);
        if (hunk && hunk.count > HUNK_EXPAND_MAX_LINES) {
          showToast(t('diff.hunkTooLarge'), { type: 'warning', duration: 2500 });
          return prev;
        }
        next.add(hunkFrom);
      }
      return next;
    });
  };

  const expandAllHunks = () => {
    const expandable = hunks.filter((h) => h.count <= HUNK_EXPAND_MAX_LINES);
    if (expandable.length === 0) {
      showToast(t('diff.hunkTooLarge'), { type: 'warning', duration: 2500 });
      return;
    }
    setExpandedHunks(new Set(expandable.map((h) => h.from)));
  };

  const collapseAllHunks = () => setExpandedHunks(new Set());

  return (
    <div className="file-preview-diff">
      {hasToolbar && (
        <div className="diff-toolbar">
          <button
            type="button"
            className="diff-toolbar-btn"
            onClick={allExpanded ? collapseAllHunks : expandAllHunks}
          >
            {allExpanded ? t('diff.collapseAll') : t('diff.expandAll', { count: collapsedCount })}
          </button>
        </div>
      )}
      <table className="diff-table">
        {/* 显式声列宽:table-layout:fixed 时按 colgroup 分配,不依赖首行(折叠 hunk 行是 colSpan=4 首行,否则列宽会均分成 335px) */}
        <colgroup>
          <col className="diff-col-gutter" />
          <col className="diff-col-gutter" />
          <col className="diff-col-marker" />
          <col />
        </colgroup>
        <tbody>
          {displaySeq.map((item) => {
            if (item.type === 'hunk') {
              const isExpanded = expandedHunks.has(item.from);
              if (!isExpanded) {
                return (
                  <HunkRow
                    key={`hunk-${item.from}`}
                    label={t('diff.hunkSkip', { count: item.count })}
                    onClick={() => toggleHunk(item.from)}
                  />
                );
              }
              return (
                <ExpandedHunkRows
                  key={`hunk-open-${item.from}`}
                  item={item}
                  lines={lines}
                  numMaps={numMaps}
                  highlightedLines={highlightedLines}
                  onToggle={() => toggleHunk(item.from)}
                />
              );
            }

            const line = lines[item.idx];
            const cls = diffLineClass(line.type);
            const isFocus =
              focusStartLine != null &&
              (numMaps.oldNumAt.get(item.idx) === focusStartLine ||
                numMaps.newNumAt.get(item.idx) === focusStartLine);
            const oldNo = numMaps.oldNumAt.get(item.idx);
            const newNo = numMaps.newNumAt.get(item.idx);

            return (
              <tr key={item.idx} className={`diff-row ${cls} ${isFocus ? 'focused' : ''}`}>
                <td className="diff-gutter old" title={t('diff.oldLineNum')}>
                  {line.type !== 'added' && oldNo != null ? oldNo : ''}
                </td>
                <td className="diff-gutter new" title={t('diff.newLineNum')}>
                  {line.type !== 'removed' && newNo != null ? newNo : ''}
                </td>
                <td className="diff-marker" aria-hidden>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>
                <td className="diff-content">
                  {(() => {
                    const rendered = renderLineContent(item.idx, line, wordDiff, numMaps, highlightedLines);
                    return rendered.kind === 'html' ? (
                      <pre className="diff-line" dangerouslySetInnerHTML={{ __html: rendered.value as string }} />
                    ) : (
                      <pre className="diff-line">{rendered.value}</pre>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 内部渲染辅助
// ============================================================================

/** 已展开的折叠段:先渲染"收起"提示行,再渲染该段完整上下文行(行号查表) */
function ExpandedHunkRows({
  item,
  lines,
  numMaps,
  highlightedLines,
  onToggle,
}: {
  item: Extract<ReturnType<typeof buildHunkSequence>[number], { type: 'hunk' }>;
  lines: DiffLine[];
  numMaps: NumMaps;
  highlightedLines: string[] | null;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const rows = [];
  for (let k = item.from; k < item.to; k++) {
    const oldNo = numMaps.oldNumAt.get(k);
    const newNo = numMaps.newNumAt.get(k);
    const content = highlightedLines && k < highlightedLines.length
      ? highlightedLines[k]
      : lines[k].content;
    rows.push(
      <tr key={k} className="diff-row diff-equal">
        <td className="diff-gutter old" title={t('diff.oldLineNum')}>
          {oldNo != null ? oldNo : ''}
        </td>
        <td className="diff-gutter new" title={t('diff.newLineNum')}>
          {newNo != null ? newNo : ''}
        </td>
        <td className="diff-marker" aria-hidden>
          {' '}
        </td>
        <td className="diff-content">
          {highlightedLines && k < highlightedLines.length ? (
            <pre className="diff-line" dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <pre className="diff-line">{content}</pre>
          )}
        </td>
      </tr>,
    );
  }
  return (
    <>
      <HunkRow label={t('diff.hunkExpand', { count: item.count })} onClick={onToggle} />
      {rows}
    </>
  );
}

/** hunk 折叠分隔行(可点击展开/收起) */
function HunkRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <tr className="diff-row diff-hunk clickable" onClick={onClick}>
      <td colSpan={4}>
        <span className="diff-hunk-info">{label}</span>
      </td>
    </tr>
  );
}

/** 渲染单行内容:词级 token → 语法高亮 HTML → 纯文本(优先级递减) */
function renderLineContent(
  idx: number,
  line: DiffLine,
  wordDiff: WordDiffMap | undefined,
  numMaps: NumMaps,
  highlightedLines: string[] | null,
): { kind: 'react' | 'html'; value: ReactNode } {
  if (wordDiff && (line.type === 'removed' || line.type === 'added')) {
    const lineNo =
      line.type === 'removed' ? numMaps.oldNumAt.get(idx) : numMaps.newNumAt.get(idx);
    // 该行存在对应 delete/insert 词时才做词级渲染,否则回退整行高亮
    if (lineNo != null) {
      const linesArr = line.type === 'removed' ? wordDiff.old : wordDiff.new;
      const tokens = linesArr && Array.isArray(linesArr) ? linesArr[lineNo - 1] : null;
      if (tokens && tokens.some((t) => (line.type === 'removed' ? t.type === 'delete' : t.type === 'insert'))) {
        return { kind: 'react', value: renderWordTokens(tokens, line.type) };
      }
    }
  }
  // 语法高亮有效时返回高亮 HTML(仅当高亮行数与 changes 对齐,避免下标错位)
  if (highlightedLines && idx < highlightedLines.length) {
    return { kind: 'html', value: highlightedLines[idx] };
  }
  return { kind: 'react', value: line.content };
}

/**
 * 词级 token 渲染:removed 行 delete 词包 <del>,added 行 insert 词包 <ins>,
 * 其余原样输出(React 自动转义,无 XSS 风险)。
 */
function renderWordTokens(tokens: WordDiffToken[], lineType: 'removed' | 'added'): ReactNode {
  return tokens.map((t, i) => {
    if (lineType === 'removed' && t.type === 'delete') {
      return (
        <del key={i} className="diff-word-del">
          {t.value}
        </del>
      );
    }
    if (lineType === 'added' && t.type === 'insert') {
      return (
        <ins key={i} className="diff-word-ins">
          {t.value}
        </ins>
      );
    }
    return <span key={i}>{t.value}</span>;
  });
}

/** 行号映射表 */
interface NumMaps {
  oldNumAt: Map<number, number>;
  newNumAt: Map<number, number>;
}

/**
 * 预计算行号映射:removed 用旧行号、added 用新行号、same 两表都递增。
 * 与后端 wordDiff 的 {old, new} 行组织互为索引契约(removed 行查 old[旧行号-1],
 * added 行查 new[新行号-1]),折叠/展开后行号依旧准确。
 */
function buildNumMaps(changes: DiffLine[]): NumMaps {
  const oldNumAt = new Map<number, number>();
  const newNumAt = new Map<number, number>();
  let o = 1;
  let n = 1;
  for (let k = 0; k < changes.length; k++) {
    const t = changes[k].type;
    if (t === 'removed') {
      oldNumAt.set(k, o);
      o++;
    } else if (t === 'added') {
      newNumAt.set(k, n);
      n++;
    } else {
      oldNumAt.set(k, o);
      newNumAt.set(k, n);
      o++;
      n++;
    }
  }
  return { oldNumAt, newNumAt };
}

function diffLineClass(type: DiffLine['type']): string {
  switch (type) {
    case 'added':
      return 'diff-insert';
    case 'removed':
      return 'diff-delete';
    default:
      return 'diff-equal';
  }
}
