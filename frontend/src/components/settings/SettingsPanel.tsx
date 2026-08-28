/**
 * SettingsPanel - 设置面板主壳
 *
 * 左侧 8 个导航项(general/model/rules/skills/context/session/tools/mcp)
 * 右侧根据 activePage 渲染对应子页面;切换页面时旧组件 unmount、新组件 mount,
 * 行为对齐旧 SettingsPanel._switchPage。
 *
 * 关闭按钮(右上角)+ Escape 键 切回 chat 视图。
 * Toast 视图挂在右下角,供子页面通过 showToast 触发。
 *
 * 阶段 3.6:8 个设置页 + 主壳迁移完成。
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useI18n } from '@/i18n';
import { ToastViewport } from './toast';
import { GeneralSettingsPage } from './GeneralSettingsPage';
import { ModelSettingsPage } from './ModelSettingsPage';
import { PromptSettingsPage } from './PromptSettingsPage';
import { RulesSettingsPage } from './RulesSettingsPage';
import { SkillsSettingsPage } from './SkillsSettingsPage';
import { ContextSettingsPage } from './ContextSettingsPage';
import { SessionSettingsPage } from './SessionSettingsPage';
import { ToolsSettingsPage } from './ToolsSettingsPage';
import { McpSettingsPage } from './McpSettingsPage';
import './SettingsPanel.css';

/** 设置页 id */
type SettingsPageId =
  | 'general'
  | 'model'
  | 'prompt'
  | 'rules'
  | 'skills'
  | 'context'
  | 'session'
  | 'tools'
  | 'mcp';

interface NavItem {
  id: SettingsPageId;
  labelKey: string;
  /** SVG path 数据,viewBox 0 0 24 24,fill=none stroke=currentColor */
  icon: string;
}

/** 导航项定义(沿用旧 SettingsPanel.NAV_ITEMS 的 svg path) */
const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    labelKey: 'settingsPage.navGeneral',
    icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
  },
  {
    id: 'model',
    labelKey: 'settingsPage.navModel',
    icon: 'M4 4h16v16H4z M9 9h6v6H9z M2 12h2 M20 12h2 M12 2v2 M12 20v2',
  },
  {
    id: 'prompt',
    labelKey: 'settingsPage.navPrompt',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z M14 2v6h6 M9 13l2 2 4-4',
  },
  {
    id: 'rules',
    labelKey: 'settingsPage.navRules',
    icon: 'M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M14 2v4h4 M9 13l2 2 4-4',
  },
  {
    id: 'skills',
    labelKey: 'settingsPage.navSkills',
    icon: 'M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z',
  },
  {
    id: 'context',
    labelKey: 'settingsPage.navContext',
    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  },
  {
    id: 'session',
    labelKey: 'settingsPage.navSession',
    icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  {
    id: 'tools',
    labelKey: 'settingsPage.navTools',
    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  },
  {
    id: 'mcp',
    labelKey: 'settingsPage.navMcp',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
];

function renderPage(page: SettingsPageId) {
  switch (page) {
    case 'general':
      return <GeneralSettingsPage />;
    case 'model':
      return <ModelSettingsPage />;
    case 'prompt':
      return <PromptSettingsPage />;
    case 'rules':
      return <RulesSettingsPage />;
    case 'skills':
      return <SkillsSettingsPage />;
    case 'context':
      return <ContextSettingsPage />;
    case 'session':
      return <SessionSettingsPage />;
    case 'tools':
      return <ToolsSettingsPage />;
    case 'mcp':
      return <McpSettingsPage />;
    default:
      return null;
  }
}

export function SettingsPanel() {
  const setView = useAppStore((s) => s.setView);
  const settingsInitialPage = useAppStore((s) => s.settingsInitialPage);
  const setSettingsInitialPage = useAppStore((s) => s.setSettingsInitialPage);
  const { t } = useI18n();
  // 初始页:外部可指定(如 ModelSelectorPanel「添加模型」→ model 页);仅首次挂载读取
  const [activePage, setActivePage] = useState<SettingsPageId>(
    () => (settingsInitialPage === 'model' ? 'model' : 'general'),
  );

  // 消费初始页标记,避免下次进入 Settings 仍停留在上次指定的页
  useEffect(() => {
    if (settingsInitialPage !== 'general') {
      setSettingsInitialPage('general');
    }
  }, [settingsInitialPage, setSettingsInitialPage]);

  // Escape 键关闭设置面板
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setView('chat');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setView]);

  return (
    <div className="settings-panel">
      <aside className="settings-panel-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activePage;
          return (
            <button
              key={item.id}
              type="button"
              className={`settings-panel-nav-item${isActive ? ' active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="settings-panel-nav-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
              </span>
              <span className="settings-panel-nav-label">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </aside>

      <section className="settings-panel-content">
        <button
          type="button"
          className="settings-panel-close"
          title={t('settingsPage.closeSettings')}
          onClick={() => setView('chat')}
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
        <div className="settings-panel-page" key={activePage}>
          {renderPage(activePage)}
        </div>
      </section>

      <ToastViewport />
    </div>
  );
}
