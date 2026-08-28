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
 *  - 图标用共享 FileIcon(与 FileTree 统一),替代 3.4 的 emoji 占位
 */
import { memo } from 'react';
import type { RefChip } from '@/types';
import { FileIcon } from '../FileIcon';
import { FileTypeIcon } from '../FileTypeIcon';
import { useI18n, translate } from '@/i18n';
import './RefChips.css';

interface RefChipsProps {
  chips: RefChip[];
  onRemove: (id: string) => void;
}

function RefChipsComponent({ chips, onRemove }: RefChipsProps) {
  const { t, lang } = useI18n();
  if (chips.length === 0) return null;

  return (
    <div className="ref-chips" role="list">
      {chips.map((chip) => (
        <span key={chip.id} className="ref-chip" role="listitem" title={buildTitle(chip, lang)}>
          <span className="ref-chip-icon" aria-hidden>
            {chip.kind === 'text' ? (
              <FileIcon kind="text" size={13} />
            ) : getChipFileName(chip) ? (
              <FileTypeIcon fileName={getChipFileName(chip)!} size={13} />
            ) : (
              <FileIcon kind="file" size={13} />
            )}
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
            aria-label={t('chat.refChipRemove')}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** 从 chip 提取文件名(用于扩展名图标解析);text/无路径时返回 null → 回落通用图标 */
function getChipFileName(chip: RefChip): string | null {
  if (chip.kind === 'text') return null;
  // file / rule 均按路径末段解析扩展名(规则展示规则文件路径,与 file 同形)
  const path = chip.filePath || chip.text;
  if (!path) return null;
  const norm = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** 构建 hover title:展示完整路径 / 完整文本 / 规则 id */
function buildTitle(chip: RefChip, _lang: string): string {
  if (chip.kind === 'text') return chip.text;
  const parts: string[] = [];
  if (chip.filePath) {
    const hasLines = chip.startLine != null && chip.endLine != null;
    parts.push(hasLines ? `${chip.filePath}:${chip.startLine}-${chip.endLine}` : chip.filePath);
  }
  if (chip.ruleId) parts.push(translate('chat.refChipRule', { id: chip.ruleId }));
  if (chip.selectedText) {
    const preview = chip.selectedText.length > 200
      ? `${chip.selectedText.slice(0, 200)}…`
      : chip.selectedText;
    parts.push(translate('chat.refChipSelection', { selection: preview }));
  }
  return parts.join('\n');
}

export const RefChips = memo(RefChipsComponent);
