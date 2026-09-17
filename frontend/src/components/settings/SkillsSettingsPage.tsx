/**
 * SkillsSettingsPage - 技能管理
 *
 * 列表(项目/用户分组)+ 编辑/创建/删除
 *
 * 支持两种技能形态：
 *  - 扁平：单个 <name>.md
 *  - 目录：<name>/SKILL.md + 同目录资源(scripts/、references/ 等)，仅入口可编辑，资源只读浏览
 *
 * 状态:
 *  - mode: 'list' | 'edit' | 'create'
 *  - skills: { project: SkillEntry[]; user: SkillEntry[] }
 *  - editing: { skill, scope, name, description, content }
 *  - resourcePreview: 目录技能资源的只读预览
 *
 * 3.7-1:订阅 eventBus 'skills:changed',当 SkillMarket 安装/卸载技能时
 * 自动刷新本地列表(替代旧版 window.settingsPanel.reloadSkills())。
 */
import { useEffect, useState } from 'react';
import { skillsApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { on as onEvent } from '@/utils/eventBus';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { SkillEntry, SkillResourceEntry } from '@/types/config';

type SkillScope = 'project' | 'user';
type Mode = 'list' | 'edit' | 'create';

interface EditorState {
  skill: SkillEntry | null;
  scope: SkillScope;
  name: string;
  description: string;
  content: string;
}

function emptyEditor(): EditorState {
  return {
    skill: null,
    scope: 'project',
    name: '',
    description: '',
    content: '',
  };
}

/** 技能显示名：优先 Frontmatter name，否则用 skillId（目录技能不能显示 SKILL.md） */
function skillDisplayName(skill: SkillEntry): string {
  return skill.name || skill.skillId;
}

export function SkillsSettingsPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('list');
  const [projectSkills, setProjectSkills] = useState<SkillEntry[]>([]);
  const [userSkills, setUserSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 目录技能的只读资源预览 */
  const [resourcePreview, setResourcePreview] = useState<{ path: string; content: string } | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await skillsApi.list();
      setProjectSkills(data.projectSkills || []);
      setUserSkills(data.userSkills || []);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  // 3.7-1:订阅 eventBus 'skills:changed',SkillMarket 安装/卸载技能时自动刷新
  useEffect(() => {
    const unsubscribe = onEvent('skills:changed', () => {
      loadSkills();
    });
    return unsubscribe;
  }, []);

  const openEdit = async (skill: SkillEntry, scope: SkillScope) => {
    setMode('edit');
    setResourcePreview(null);
    setEditor({
      skill,
      scope,
      name: skillDisplayName(skill),
      description: skill.description || '',
      content: '',
    });
    setContentLoading(true);
    try {
      const data = await skillsApi.get(skill.filePath);
      setEditor((prev) => ({ ...prev, content: data.content || '' }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.skillsLoadFailedToast') + msg, { type: 'error', duration: 3000 });
      setEditor((prev) => ({ ...prev, content: '' }));
    } finally {
      setContentLoading(false);
    }
  };

  /** 只读查看目录技能的一项资源 */
  const openResourcePreview = async (resource: SkillResourceEntry) => {
    try {
      const data = await skillsApi.get(resource.filePath);
      setResourcePreview({ path: resource.path, content: data.content || '' });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.skillsLoadFailedToast') + msg, { type: 'error', duration: 3000 });
    }
  };

  const openCreate = () => {
    setMode('create');
    setResourcePreview(null);
    setEditor(emptyEditor());
  };

  const closeEditor = () => {
    setMode('list');
    setEditor(emptyEditor());
    setResourcePreview(null);
    loadSkills();
  };

  const handleSave = async () => {
    if (saving) return;
    const name = editor.name.trim();
    if (!name) {
      showToast(translate('settingsPage.skillsNameRequiredToast'), { type: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        description: editor.description.trim(),
        scope: editor.scope,
        content: editor.content,
      };
      const result = mode === 'edit' && editor.skill
        ? await skillsApi.update({
            filePath: editor.skill.filePath,
            ...body,
            directory: editor.skill.isDirectory,
          })
        : await skillsApi.create(body);
      if (result.success) {
        showToast(mode === 'edit' ? translate('settingsPage.skillsSaved') : translate('settingsPage.skillsCreated'), {
          type: 'success',
          duration: 2000,
        });
        setTimeout(closeEditor, 300);
      } else {
        showToast((mode === 'edit' ? translate('settingsPage.saveFailedToast') : translate('settingsPage.skillsCreateFailedPrefix')) + (result.message || translate('settingsPage.skillsUnknownError')), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast((mode === 'edit' ? translate('settingsPage.saveFailedToast') : translate('settingsPage.skillsCreateFailedPrefix')) + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: SkillEntry) => {
    const name = skillDisplayName(skill);
    const confirmKey = skill.isDirectory
      ? 'settingsPage.deleteConfirmSkillDir'
      : 'settingsPage.deleteConfirmSkill';
    if (!window.confirm(translate(confirmKey) + name + translate('settingsPage.deleteConfirmEnd'))) return;
    try {
      const result = await skillsApi.delete(skill.filePath, { directory: skill.isDirectory });
      if (result.success) {
        showToast(translate('settingsPage.skillsDeletedToast') + name, { type: 'success', duration: 2000 });
        loadSkills();
      } else {
        showToast(translate('settingsPage.skillsDeleteFailedPrefix') + (result.message || translate('settingsPage.skillsUnknownError')), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.skillsDeleteFailedPrefix') + msg, { type: 'error', duration: 3000 });
    }
  };

  const renderList = () => {
    const total = projectSkills.length + userSkills.length;
    return (
      <>
        <div className="settings-item-list-header">
          <h3>{t('settingsPage.skillsList')}</h3>
          <div className="settings-item-list-actions">
            <button
              type="button"
              className="settings-btn settings-btn-icon"
              title={t('settingsPage.skillsRefresh')}
              onClick={loadSkills}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              onClick={openCreate}
            >
              + {t('settingsPage.skillsCreate')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="settings-loading">{t('settingsPage.skillsLoading')}</div>
        ) : error ? (
          <div className="settings-items-error">{error}</div>
        ) : total === 0 ? (
          <div className="settings-items-empty">
            {t('settingsPage.skillsEmptyShort')}
            <span className="settings-items-empty-hint">{t('settingsPage.skillsEmptyHint')}</span>
          </div>
        ) : (
          <>
            {projectSkills.length > 0 && (
              <div className="settings-item-group">
                <div className="settings-item-group-header">
                  <span className="settings-item-group-label">{t('settingsPage.skillsGroupProject')}</span>
                  <span className="settings-item-group-count">{projectSkills.length}</span>
                </div>
                <div className="settings-items">
                  {projectSkills.map((s) => (
                    <SkillItemRow
                      key={s.filePath}
                      skill={s}
                      badgeKey="settingsPage.skillsScopeProject"
                      onClick={() => openEdit(s, 'project')}
                      onDelete={() => handleDelete(s)}
                    />
                  ))}
                </div>
              </div>
            )}
            {userSkills.length > 0 && (
              <div className="settings-item-group">
                <div className="settings-item-group-header">
                  <span className="settings-item-group-label">{t('settingsPage.skillsGroupUser')}</span>
                  <span className="settings-item-group-count">{userSkills.length}</span>
                </div>
                <div className="settings-items">
                  {userSkills.map((s) => (
                    <SkillItemRow
                      key={s.filePath}
                      skill={s}
                      badgeKey="settingsPage.skillsScopeUser"
                      onClick={() => openEdit(s, 'user')}
                      onDelete={() => handleDelete(s)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const renderEditor = () => {
    const editingSkill = editor.skill;
    const isDirectory = Boolean(editingSkill?.isDirectory);
    const resources = editingSkill?.resources ?? [];
    const title = mode === 'edit' && editingSkill
      ? translate('settingsPage.skillsEditTitlePrefix') + skillDisplayName(editingSkill)
      : translate('settingsPage.skillsCreateTitle');
    return (
      <div className="settings-editor">
        <div className="settings-editor-header">
          <span className="settings-editor-title">{title}</span>
          <div className="settings-editor-actions">
            <button
              type="button"
              className="settings-editor-btn"
              onClick={closeEditor}
              disabled={saving}
            >
              {t('settingsPage.skillsBackPlain')}
            </button>
            <button
              type="button"
              className="settings-editor-btn settings-editor-btn-primary"
              onClick={handleSave}
              disabled={saving || contentLoading}
            >
              {mode === 'edit' ? t('settingsPage.skillsSave') : t('settingsPage.skillsCreate')}
            </button>
          </div>
        </div>
        <div className="settings-editor-fields">
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.skillsNameLabel')}</label>
            <input
              className="settings-input"
              type="text"
              value={editor.name}
              placeholder={t('settingsPage.skillsNamePh2')}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.skillsDesc')}</label>
            <input
              className="settings-input"
              type="text"
              value={editor.description}
              placeholder={t('settingsPage.skillsDescPh2')}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.skillsScope')}</label>
            <div className="settings-toggle-group">
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'project' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'project' })}
                disabled={isDirectory}
              >
                {t('settingsPage.skillsScopeProject')}
              </button>
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'user' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'user' })}
                disabled={isDirectory}
              >
                {t('settingsPage.skillsScopeUser')}
              </button>
            </div>
            {isDirectory && (
              <div className="settings-field-hint">{t('settingsPage.skillsScopeLockedHint')}</div>
            )}
          </div>
        </div>
        <textarea
          className="settings-editor-textarea"
          value={editor.content}
          placeholder={contentLoading ? t('settingsPage.skillsLoading') : t('settingsPage.skillsContentPh2')}
          onChange={(e) => setEditor({ ...editor, content: e.target.value })}
          spellCheck={false}
        />
        {isDirectory && resources.length > 0 && (
          <div className="settings-field settings-skill-resources">
            <label className="settings-field-label">{t('settingsPage.skillsResources')}</label>
            <div className="settings-skill-resource-list">
              {resources.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  className={`settings-skill-resource${resourcePreview?.path === r.path ? ' active' : ''}`}
                  onClick={() => openResourcePreview(r)}
                >
                  {r.path}
                </button>
              ))}
            </div>
            <div className="settings-field-hint">{t('settingsPage.skillsResourcesHint')}</div>
            {resourcePreview && (
              <textarea
                className="settings-editor-textarea settings-skill-resource-view"
                value={resourcePreview.content}
                readOnly
                spellCheck={false}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.skillsPageTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.skillsPageDesc')}</p>
      <hr className="settings-page-divider" />

      {mode === 'list' ? renderList() : renderEditor()}
    </div>
  );
}

function SkillItemRow({
  skill,
  badgeKey,
  onClick,
  onDelete,
}: {
  skill: SkillEntry;
  badgeKey: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-item" onClick={onClick}>
      <span className="settings-item-icon">{skill.isDirectory ? '📁' : '📄'}</span>
      <div className="settings-item-info">
        <div className="settings-item-name">
          {skillDisplayName(skill)}
          {skill.isDirectory && (
            <span className="settings-skill-dir-badge">{t('settingsPage.skillsDirectoryBadge')}</span>
          )}
        </div>
        {skill.description && (
          <div className="settings-item-meta">{skill.description}</div>
        )}
      </div>
      <span className="settings-item-badge">{t(badgeKey)}</span>
      <button
        type="button"
        className="settings-item-del"
        title={t('settingsPage.skillsDelete')}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}