/**
 * PromptsSettingsPage - 提示词设置(列表 + 详情钻取)
 *
 * 把「模式系统提示词」「Git 提交信息生成提示词」「AI 优化提示词」三个设置页收敛到同一
 * 导航项。先展示三行列表(每行标题 + 说明),点击某行整体覆盖进对应详情编辑页,详情头
 * 带返回按钮回到列表。交互与样式对齐 Rules/Skills 的列表 → 编辑钻取。
 * 三个子页面各自独立文件,职责与行数不下沉。
 */
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { PromptSettingsPage } from './PromptSettingsPage';
import { GitCommitPromptSettingsPage } from './GitCommitPromptSettingsPage';
import { AiOptimizePromptSettingsPage } from './AiOptimizePromptSettingsPage';

type TabId = 'mode' | 'gitCommit' | 'aiOptimize';
type View = TabId | 'list';

const ITEMS: { id: TabId; titleKey: string; descKey: string }[] = [
  { id: 'mode', titleKey: 'settingsPage.promptSection', descKey: 'settingsPage.promptPageDesc' },
  { id: 'gitCommit', titleKey: 'settingsPage.gitCommitPageTitle', descKey: 'settingsPage.gitCommitPageDesc' },
  { id: 'aiOptimize', titleKey: 'settingsPage.aiOptimizePageTitle', descKey: 'settingsPage.aiOptimizePageDesc' },
];

export function PromptsSettingsPage({ initialTab }: { initialTab?: string }) {
  const { t } = useI18n();
  // 外部可指定初始页(如 GitPanel「提交提示词」→ gitCommit 详情);仅首次挂载读取
  const [view, setView] = useState<View>(initialTab === 'gitCommit' ? 'gitCommit' : 'list');

  const renderList = () => (
    <div className="settings-prompt-list">
      {ITEMS.map((it) => (
        <div key={it.id}>
          <div className="settings-field-group-title">{t(it.titleKey)}</div>
          <button
            type="button"
            className="settings-prompt-row"
            onClick={() => setView(it.id)}
          >
            <span className="settings-prompt-row-main">
              <span className="settings-prompt-row-title">{t('settingsPage.promptEdit')}</span>
              <span className="settings-prompt-row-desc">{t(it.descKey)}</span>
            </span>
            <span className="settings-prompt-row-chev">›</span>
          </button>
        </div>
      ))}
    </div>
  );

  const activeItem = ITEMS.find((it) => it.id === view);

  const renderDetail = () => (
    <div className="settings-prompt-detail">
      <div className="settings-prompt-detail-header">
        <span className="settings-prompt-detail-title">
          {t(activeItem?.titleKey ?? 'settingsPage.promptPageTitle')}
        </span>
        <button
          type="button"
          className="settings-btn"
          onClick={() => setView('list')}
        >
          {t('settingsPage.rulesBackPlain')}
        </button>
      </div>
      {view === 'mode' ? <PromptSettingsPage /> : view === 'gitCommit' ? <GitCommitPromptSettingsPage /> : <AiOptimizePromptSettingsPage />}
    </div>
  );

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.promptPageTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.promptListDesc')}</p>
      <hr className="settings-page-divider" />
      {view === 'list' ? renderList() : renderDetail()}
    </div>
  );
}