/**
 * RollbackButton - 回滚按钮 + 回滚确认面板(拆分为两个展示组件)
 *
 * 对标旧版 components/RollbackPanel.js。状态与流程逻辑抽到 useRollback hook:
 *  1. 点击按钮 → emit('rollback:prepare') → 请求 POST /api/sessions/:id/rewind-check
 *  2. 展示确认面板:文件变更列表(delete/add/restore)+ 取消 / 确认(全部回滚 / 仅回滚文件)
 *  3. 确认 → POST /api/sessions/:id/rewind(mode='files' | 'all')
 *  4. 成功 → emit('rollback:completed', { paths, mode })
 *
 * 重构说明(对齐旧版布局):
 *  - 按钮固定在消息 footer 操作行内;面板作为「独立整行块」渲染在回合 footer 之后
 *    (旧版为独立 860px 块,此处对齐,由 useRollback + 组合组件 RoundRollback 协同)。
 *  - 文件图标用状态字母(D/A/M)替代旧版 file-icons 图片
 *  - 下拉选项用 CSS hover 展开(对齐旧版行为)
 *  - 中文硬编码,不引入 i18n
 */
import { useEffect, useRef, useState } from 'react';
import type { RollbackStatus } from './useRollback';
import type { RollbackPreviewFile } from '@/types';
import './RollbackButton.css';

interface RollbackButtonProps {
  /** 当前状态机(由父级 useRollback 驱动) */
  status: RollbackStatus;
  /** 是否禁用(无会话等) */
  disabled?: boolean;
  /** 点击按钮:请求回滚预览 */
  onOpen: () => void;
}

/** 回滚按钮:常驻消息 footer,idle 显示 ↩,loading/rolling 显示 ⋯ 并禁用 */
export function RollbackButton({ status, disabled, onOpen }: RollbackButtonProps) {
  return (
    <button
      type="button"
      className="rollback-btn message-action-btn"
      title="回滚到该轮之前(文件与会话)"
      aria-label="回滚"
      onClick={onOpen}
      disabled={disabled || status !== 'idle'}
    >
      {status === 'idle' ? '↩' : '⋯'}
    </button>
  );
}

interface RollbackPanelProps {
  status: RollbackStatus;
  previewFiles: RollbackPreviewFile[];
  onCancel: () => void;
  onConfirm: (mode: 'all' | 'files') => void;
}

/**
 * 回滚确认面板:独立整行块,渲染在回合 footer 之后(对齐旧版)。
 * 仅在 status != 'idle' 时由组合组件挂载,故内部不需再判断 idle。
 */
export function RollbackPanel({ status, previewFiles, onCancel, onConfirm }: RollbackPanelProps) {
  // ── 下拉固定开关:点击 ▾ 可固定展开,再次点击或点外部收起 ──
  const splitRef = useRef<HTMLSpanElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (splitRef.current && !splitRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [dropdownOpen]);

  // ── loading / rolling:加载态 ────────────────────────────
  if (status === 'loading' || status === 'rolling') {
    return (
      <div className="rollback-inline rollback-inline-loading">
        <svg
          className="rollback-loading-spinner"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
        </svg>
        {status === 'loading' ? '正在检查文件变更…' : '正在回滚…'}
      </div>
    );
  }

  // ── preview:确认面板 ─────────────────────────────────────
  const changedFiles = previewFiles.filter(
    (f) => f.action === 'delete' || f.action === 'add' || f.action === 'restore',
  );

  return (
    <div className="rollback-inline">
      <div className="rollback-inline-header">
        <span className="rollback-inline-icon">
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="6" />
            <line x1="8" y1="5" x2="8" y2="9" />
            <line x1="8" y1="11" x2="8" y2="11.5" />
          </svg>
        </span>
        <span>回滚到该轮之前</span>
        <span className="rollback-inline-count">
          {changedFiles.length > 0 ? `${changedFiles.length} 个文件变更` : '无文件变更'}
        </span>
      </div>

      {changedFiles.length > 0 && (
        <>
          <div className="rollback-inline-files">
            {changedFiles.map((f) => {
              const info = actionInfo(f.action);
              return (
                <div key={f.filePath} className={`rollback-inline-file ${info.cls}`}>
                  <span className={`file-status-letter ${info.cls}`}>{info.letter}</span>
                  <span className="file-name" title={f.filePath}>
                    {f.filePath}
                  </span>
                  <span className="file-action-badge">{info.label}</span>
                  {(f.insertions > 0 || f.deletions > 0) && (
                    <span className="diff-stats">
                      {f.insertions > 0 && <span className="diff-add">+{f.insertions}</span>}
                      {f.deletions > 0 && <span className="diff-del">-{f.deletions}</span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rollback-inline-divider" />
        </>
      )}

      <div className="rollback-inline-footer">
        <button
          type="button"
          className="rollback-inline-btn rollback-inline-btn-cancel"
          onClick={onCancel}
        >
          取消
        </button>
        <span
          className={`rollback-inline-split${dropdownOpen ? ' dropdown-open' : ''}`}
          ref={splitRef}
        >
          <button
            type="button"
            className="rollback-inline-btn rollback-inline-btn-confirm"
            onClick={() => onConfirm('all')}
          >
            回滚
          </button>
          <button
            type="button"
            className="rollback-inline-split-toggle"
            title={dropdownOpen ? '收起选项' : '更多选项'}
            aria-label="更多选项"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            ▾
          </button>
          <span className="rollback-inline-split-dropdown">
            <button
              type="button"
              className="rollback-inline-btn rollback-inline-btn-confirm"
              onClick={() => {
                setDropdownOpen(false);
                onConfirm('all');
              }}
            >
              <span className="dropdown-check"><svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 25l10 10 20-22"/></svg></span>全部回滚(文件 + 会话)
            </button>
            <button
              type="button"
              className="rollback-inline-btn rollback-inline-btn-files"
              onClick={() => {
                setDropdownOpen(false);
                onConfirm('files');
              }}
            >
              <span className="dropdown-check-placeholder" />仅回滚文件
            </button>
          </span>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

/** 文件动作 → 状态字母 / 样式类 / 中文标签 */
function actionInfo(action: RollbackPreviewFile['action']): {
  letter: string;
  cls: 'action-delete' | 'action-add' | 'action-restore';
  label: string;
} {
  switch (action) {
    case 'delete':
      return { letter: 'D', cls: 'action-delete', label: '回滚后删除' };
    case 'add':
      return { letter: 'A', cls: 'action-add', label: '回滚后还原' };
    case 'restore':
      return { letter: 'M', cls: 'action-restore', label: '回滚后恢复' };
  }
}
