/**
 * RefChips - 引用芯片列表(显示 + 移除)
 *
 * 阶段 3.4:补齐 ChatPanel 的引用上下文能力。
 *
 * 设计要点:
 *  - 受控组件:chips state 由 ChatPanel 持有,本组件只负责渲染与触发 onRemove
 *  - 三种 chip:
 *    - file:文件路径 + 文件名 + 可选行号 + 可选选中文字 hover title
 *    - text:截断的纯文本,鼠标 hover 显示完整文本
 *    - rule:与 file 同形(显示规则文件路径),title 中标注 ruleId
 *  - 不在组件内做添加动作:添加由 ChatPanel 从外部(context-selector / 拖拽 / @path 触发)调用
 *  - 提交时合并由 utils/ref-chips.ts 的 combineChipsToMessage 负责
 *
 * 与旧版 RefChips.js 的差异:
 *  - 不再通过 DOM 直接 addRefChip,改用受控数据流
 *  - 不再依赖 file-icons.js,3.4 用 emoji 占位(📁/📄/📐),3.5 FileTree 可复用统一文件图标
 */
import { memo } from 'react';
import type { RefChip } from '@/types';
import './RefChips.css';

interface RefChipsProps {
  chips: RefChip[];
  onRemove: (id: string) => void;
}

function RefChipsComponent({ chips, onRemove }: RefChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="ref-chips" role="list">
      {chips.map((chip) => (
        <span key={chip.id} className="ref-chip" role="listitem" title={buildTitle(chip)}>
          <span className="ref-chip-icon" aria-hidden>
            {getChipIcon(chip)}
          </span>
          <span className="ref-chip-text">{chip.text}</span>
          {chip.startLine != null && chip.endLine != null && (
            <span className="ref-chip-lines">
              {chip.startLine}-{chip.endLine}
            </span>
          )}
          <button
            type="button"
            className="ref-chip-close"
            onClick={() => onRemove(chip.id)}
            aria-label="移除引用"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** 根据 chip 类型返回 emoji 占位图标 */
function getChipIcon(chip: RefChip): string {
  if (chip.kind === 'rule') return '📐';
  if (chip.kind === 'text') return '📝';
  // file:简化用文件 emoji,3.5 FileTree 接入后再统一文件图标
  return '📄';
}

/** 构建 hover title:展示完整路径 / 完整文本 / 规则 id */
function buildTitle(chip: RefChip): string {
  if (chip.kind === 'text') return chip.text;
  const parts: string[] = [];
  if (chip.filePath) {
    const hasLines = chip.startLine != null && chip.endLine != null;
    parts.push(hasLines ? `${chip.filePath}:${chip.startLine}-${chip.endLine}` : chip.filePath);
  }
  if (chip.ruleId) parts.push(`规则 id: ${chip.ruleId}`);
  if (chip.selectedText) {
    const preview = chip.selectedText.length > 200
      ? `${chip.selectedText.slice(0, 200)}…`
      : chip.selectedText;
    parts.push(`选中文字:\n${preview}`);
  }
  return parts.join('\n');
}

export const RefChips = memo(RefChipsComponent);
