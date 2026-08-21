/**
 * FileTabs - 文件标签栏(阶段 3.5 简化版)
 *
 * 职责:
 *   1. 渲染打开的文件标签列表
 *   2. 标签激活 / 切换 / 关闭
 *   3. diff 模式标签带可视化区分
 *
 * 简化(留 3.7):
 *   - 不实现右键菜单(关闭当前/其他/右侧/全部、复制路径)
 *   - 不实现拖拽排序
 *   - 不实现中键关闭
 *   - 不实现滚轮横向滚动(原生 overflow-x:auto 即可)
 */
import type { FileTab } from '@/types';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import './FileTabs.css';

interface FileTabsProps {
  /** 当前打开的标签列表(顺序即展示顺序) */
  tabs: FileTab[];
  /** 当前激活的文件路径 */
  activePath: string | null;
  /** 点击标签切换 */
  onSelect: (path: string) => void;
  /** 关闭标签 */
  onClose: (path: string) => void;
}

export function FileTabs({ tabs, activePath, onSelect, onClose }: FileTabsProps) {
  if (tabs.length === 0) {
    return <div className="file-tabs file-tabs-empty" />;
  }
  return (
    <div className="file-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            className={[
              'file-tab',
              isActive ? 'active' : '',
              tab.mode === 'diff' ? 'is-diff' : 'is-preview',
            ].join(' ').trim()}
            title={tab.path}
            onClick={() => onSelect(tab.path)}
          >
            <span className="file-tab-icon" aria-hidden>
              {tab.mode === 'diff' ? (
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h10" />
                  <path d="M3 8h7" />
                  <path d="M3 12h4" />
                  <path d="M11 10l3 2-3 2" />
                </svg>
              ) : (
                <FileTypeIcon fileName={tab.name} size={12} />
              )}
            </span>
            <span className="file-tab-name">{tab.name}</span>
            {tab.mode === 'diff' && (
              <span className="file-tab-mode">diff</span>
            )}
            <button
              type="button"
              className="file-tab-close"
              aria-label="关闭"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
