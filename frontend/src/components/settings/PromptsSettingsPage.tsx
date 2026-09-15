/**
 * PromptsSettingsPage - 提示词设置(Tab 容器)
 *
 * 把「模式系统提示词」与「Git 提交信息生成提示词」两个设置页收敛到同一导航项,
 * 用页内 Tab 切换,避免导航项过多。两个子页面各自独立文件,职责与行数不下沉。
 * Tab 外观复用 settings-toggle-btn 模式切换样式,与 PromptSettingsPage 内部三态切换视觉一致。
 */
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { PromptSettingsPage } from './PromptSettingsPage';
import { GitCommitPromptSettingsPage } from './GitCommitPromptSettingsPage';
import { AiOptimizePromptSettingsPage } from './AiOptimizePromptSettingsPage';

type TabId = 'mode' | 'gitCommit' | 'aiOptimize';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'mode', labelKey: 'settingsPage.promptSection' },
  { id: 'gitCommit', labelKey: 'settingsPage.gitCommitPageTitle' },
  { id: 'aiOptimize', labelKey: 'settingsPage.aiOptimizePageTitle' },
];

export function PromptsSettingsPage({ initialTab }: { initialTab?: string }) {
  const { t } = useI18n();
  // 外部可指定初始 Tab(如 GitPanel「提交提示词」→ gitCommit);仅首次挂载读取
  const [tab, setTab] = useState<TabId>(initialTab === 'gitCommit' ? 'gitCommit' : 'mode');

  return (
    <div>
      <div className="settings-toggle-group" style={{ marginBottom: 12 }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={`settings-toggle-btn${tab === tb.id ? ' active' : ''}`}
            onClick={() => setTab(tb.id)}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>
      {tab === 'mode' ? <PromptSettingsPage /> : tab === 'gitCommit' ? <GitCommitPromptSettingsPage /> : <AiOptimizePromptSettingsPage />}
    </div>
  );
}