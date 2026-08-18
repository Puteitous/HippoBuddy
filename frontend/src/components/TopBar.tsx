/**
 * TopBar - 顶部状态栏
 *
 * 显示:
 *  - 应用名 HippoBuddy + 阶段标识
 *  - 当前会话 id(若选中)+ 模型快速选择(ModelSelectorPanel)
 *  - Chat / Workspace / Settings 视图切换按钮
 *
 * 阶段 3.5:新增 Workspace 视图(FileTree + FileTabs + FilePreview/FileDiffView)
 * 阶段 3.7-2:center 区域挂载 ModelSelectorPanel(模型 + 思考强度快速切换)
 */
import { useAppStore } from '@/stores/appStore';
import { ModelSelectorPanel } from './ModelSelectorPanel';
import './TopBar.css';

export function TopBar() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        <span className="top-bar-name">HippoBuddy</span>
        <span className="top-bar-tag">React + TS · 阶段三 3.7-2</span>
      </div>

      <div className="top-bar-center">
        {currentSessionId ? (
          <code className="top-bar-session-id" title="当前会话 id">
            {currentSessionId}
          </code>
        ) : (
          <span className="top-bar-no-session">未选中会话</span>
        )}
        <span className="top-bar-sep" aria-hidden />
        <ModelSelectorPanel />
      </div>

      <nav className="top-bar-nav">
        <button
          type="button"
          className={`top-bar-tab ${view === 'chat' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`top-bar-tab ${view === 'workspace' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('workspace')}
        >
          Workspace
        </button>
        <button
          type="button"
          className={`top-bar-tab ${view === 'settings' ? 'top-bar-tab-active' : ''}`}
          onClick={() => setView('settings')}
        >
          Settings
        </button>
      </nav>
    </header>
  );
}
