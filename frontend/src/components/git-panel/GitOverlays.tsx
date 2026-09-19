/**
 * GitOverlays - GitPanel 的全部弹层组件
 *
 * 右键菜单、危险操作确认弹窗、分支下拉、同步菜单、新建/重命名分支输入弹窗。
 * 均为无面板级状态的展示组件,通过 props 接线;portal 到 body 的定位与关闭逻辑内聚于此。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useI18n } from '@/i18n';

/** 右键菜单项 */
interface CtxItem {
  label: string;
  action: string;
  danger?: boolean;
}

/** 右键菜单(复用 file-tree-context-* 样式,portal 渲染;点击外部关闭) */
export function GitContextMenu({
  x,
  y,
  items,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  items: CtxItem[];
  onSelect: (action: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDown = () => onClose();
    // 延迟一帧绑定,避免本次右键冒泡立即关闭
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      className="file-tree-context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.action}
          className={`file-tree-context-item${item.danger ? ' danger' : ''}`}
          onClick={() => onSelect(item.action)}
        >
          <span className="file-tree-context-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 危险操作确认弹窗(复用 file-tree-modal-* 样式) */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
      else if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <p className="file-tree-modal-message">{message}</p>
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onCancel}>
            {t('fileTree.cancelBtn')}
          </button>
          <button
            type="button"
            className="file-tree-modal-btn file-tree-modal-btn-danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 分支下拉列表(portal 到 body,定位在分支触发器下方;顶部过滤、本地/远端分组、底部新建) */
export function BranchDropdown({
  triggerRef,
  currentBranch,
  names,
  remotes,
  onCheckout,
  onOpenBranchCtx,
  onCreate,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement>;
  currentBranch: string;
  names: string[];
  remotes: string[];
  onCheckout: (branch: string) => void;
  onOpenBranchCtx: (e: ReactMouseEvent, branch: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: el.offsetWidth });
    }
  }, [triggerRef]);

  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      // 点在分支列表内部不关闭:避免 pointerdown 先于 click 卸载列表,导致 item 的
      // click 落空而切换失败(与 SyncMenu 的内部 contains 防护同理)
      const el = document.querySelector('.git-panel-branch-list');
      if (el && el.contains(ev.target as Node)) return;
      // 左键/触屏关闭;右键(button=2)保留以弹分支项菜单
      if (ev.button !== 2) onClose();
    };
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  if (!pos) return null;
  const q = filter.trim().toLowerCase();
  // 当前分支缺失于 names 时并入(HEAD 游离时也让它可见);但 currentBranch 为空(detached)时不插入空项
  const local = currentBranch
    ? (names.includes(currentBranch) ? names : [currentBranch, ...names])
    : names;
  const localFiltered = q ? local.filter((b) => b.toLowerCase().includes(q)) : local;
  const remoteFiltered = q ? remotes.filter((r) => r.toLowerCase().includes(q)) : remotes;
  const showRemoteGroup = remoteFiltered.length > 0;
  return createPortal(
    <div
      className="file-tree-context-menu git-panel-branch-list"
      style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        className="git-panel-branch-filter"
        placeholder={t('git.branchFilter')}
        value={filter}
        // 分支名非自然语言,关闭浏览器原生拼写检查避免误划红线(与项目其它输入框一致)
        spellCheck={false}
        onChange={(e) => setFilter(e.target.value)}
      />
      {localFiltered.length === 0 && !showRemoteGroup ? (
        <div className="git-panel-branch-list-empty">{t('git.branchNoMatch')}</div>
      ) : (
        <>
          {localFiltered.map((b) => (
            <div
              key={b}
              className={`git-panel-branch-list-item${b === currentBranch ? ' current' : ''}`}
              title={b}
              onClick={() => {
                onClose(); // pointerdown 不再负责关闭(列表内),点击后由这里收起
                if (b !== currentBranch) onCheckout(b);
              }}
              onContextMenu={(e) => onOpenBranchCtx(e, b)}
            >
              <span className="git-panel-branch-list-name">{b}</span>
              {b === currentBranch && <span className="git-panel-branch-list-check">✓</span>}
            </div>
          ))}
          {showRemoteGroup && (
            <div className="git-panel-branch-list-grp">{t('git.branchRemote')}</div>
          )}
          {remoteFiltered.map((b) => (
            <div
              key={b}
              className="git-panel-branch-list-item"
              title={b}
              onClick={() => {
                onClose();
                onCheckout(b);
              }}
            >
              <span className="git-panel-branch-list-name">{b}</span>
            </div>
          ))}
        </>
      )}
      <div className="git-panel-branch-list-new" onClick={onCreate}>
        <span>{t('git.newBranch')}</span>
      </div>
    </div>,
    document.body,
  );
}

/** 同步(远端操作)菜单:拉取 / 拉取合并 / 推送(portal 到 body) */
export function SyncMenu({
  triggerRef,
  remoteOp,
  pushDisabled,
  onSelect,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement>;
  remoteOp: 'fetch' | 'pull' | 'push' | null;
  pushDisabled: boolean;
  onSelect: (action: 'fetch' | 'pull' | 'push') => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: el.offsetWidth });
    }
  }, [triggerRef]);

  useEffect(() => {
    // 点击菜单内部不关闭,避免 pointerdown 先关掉菜单导致 item 的 click 落空
    const onDown = (e: PointerEvent) => {
      const el = document.querySelector('.git-panel-sync-menu');
      if (el && el.contains(e.target as Node)) return;
      onClose();
    };
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  if (!pos) return null;
  const items = [
    { action: 'fetch' as const, label: t('git.fetch'), disabled: false },
    { action: 'pull' as const, label: t('git.pull'), disabled: false },
    { action: 'push' as const, label: t('git.push'), disabled: pushDisabled },
  ];
  return createPortal(
    <div
      className="file-tree-context-menu git-panel-sync-menu"
      style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.action}
          className={`git-panel-sync-item${item.disabled ? ' disabled' : ''}`}
          onClick={() => {
            if (!item.disabled) onSelect(item.action);
          }}
        >
          <span className="file-tree-context-label">
            {remoteOp === item.action ? `${t('git.loading')}…` : item.label}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** 新建/重命名分支输入弹窗(复用 file-tree-modal-* 样式) */
export function InputDialog({
  title,
  placeholder,
  initialValue,
  submitLabel,
  hint,
  onCancel,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  initialValue: string;
  submitLabel: string;
  /** 可选说明文字(如新建分支的起始点) */
  hint?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const { t } = useI18n();
  const [val, setVal] = useState(initialValue);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onSubmit(val);
      else if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="file-tree-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="file-tree-modal">
        <div className="file-tree-modal-header">
          <span className="file-tree-modal-title">{title}</span>
        </div>
        <div className="file-tree-modal-body">
          <input
            autoFocus
            className="git-panel-input"
            value={val}
            placeholder={placeholder}
            // 分支名非自然语言,关闭浏览器原生拼写检查避免误划红线(与项目其它输入框一致)
            spellCheck={false}
            onChange={(e) => setVal(e.target.value)}
          />
          {hint && <div className="git-panel-input-hint">{hint}</div>}
        </div>
        <div className="file-tree-modal-footer">
          <button type="button" className="file-tree-modal-btn" onClick={onCancel}>
            {t('fileTree.cancelBtn')}
          </button>
          <button
            type="button"
            className="file-tree-modal-btn file-tree-modal-btn-danger"
            disabled={!val.trim()}
            onClick={() => onSubmit(val.trim())}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
