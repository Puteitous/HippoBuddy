/**
 * RulesSettingsPage - 规则管理
 *
 * 列表按 mode 分组(always / manual),按 source 显示项目/用户徽标。
 * 编辑器多一个 mode(always/manual)与 scope(project/user)切换。
 *
 * 行为同 SkillsSettingsPage:列表 → 编辑/创建/删除。
 */
import { useEffect, useState } from 'react';
import { rulesApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { translate, useI18n } from '@/i18n';
import { showToast } from './toastStore';
import type { RuleEntry, RuleMode, RuleSource } from '@/types/config';

type Mode = 'list' | 'edit' | 'create';

interface EditorState {
  rule: RuleEntry | null;
  mode: RuleMode;
  scope: RuleSource;
  name: string;
  description: string;
  content: string;
}

function emptyEditor(): EditorState {
  return {
    rule: null,
    mode: 'always',
    scope: 'project',
    name: '',
    description: '',
    content: '',
  };
}

export function RulesSettingsPage() {
  const { t } = useI18n();
  const [pageMode, setPageMode] = useState<Mode>('list');
  const [alwaysRules, setAlwaysRules] = useState<Array<RuleEntry & { source: RuleSource }>>([]);
  const [manualRules, setManualRules] = useState<Array<RuleEntry & { source: RuleSource }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await rulesApi.list();
      const projectRules = data.projectRules || [];
      const userRules = data.userRules || [];
      const always: Array<RuleEntry & { source: RuleSource }> = [];
      const manual: Array<RuleEntry & { source: RuleSource }> = [];
      for (const r of projectRules) {
        (r.mode === 'always' ? always : manual).push({ ...r, source: 'project' });
      }
      for (const r of userRules) {
        (r.mode === 'always' ? always : manual).push({ ...r, source: 'user' });
      }
      setAlwaysRules(always);
      setManualRules(manual);
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openEdit = async (rule: RuleEntry & { source: RuleSource }) => {
    setPageMode('edit');
    setEditor({
      rule,
      mode: rule.mode,
      scope: rule.source,
      name: rule.name,
      description: rule.description || '',
      content: '',
    });
    setContentLoading(true);
    try {
      const data = await rulesApi.get(rule.filePath);
      setEditor((prev) => ({ ...prev, content: data.content || '' }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.rulesLoadFailedToast') + msg, { type: 'error', duration: 3000 });
      setEditor((prev) => ({ ...prev, content: '' }));
    } finally {
      setContentLoading(false);
    }
  };

  const openCreate = () => {
    setPageMode('create');
    setEditor(emptyEditor());
  };

  const closeEditor = () => {
    setPageMode('list');
    setEditor(emptyEditor());
    loadRules();
  };

  const handleSave = async () => {
    if (saving) return;
    const name = editor.name.trim();
    if (!name) {
      showToast(translate('settingsPage.rulesNameRequiredToast'), { type: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        description: editor.description.trim(),
        mode: editor.mode,
        scope: editor.scope,
        content: editor.content,
      };
      const result = pageMode === 'edit' && editor.rule
        ? await rulesApi.update({ filePath: editor.rule.filePath, ...body })
        : await rulesApi.create(body);
      if (result.success) {
        showToast(pageMode === 'edit' ? translate('settingsPage.rulesSaved') : translate('settingsPage.rulesCreatedToast'), {
          type: 'success',
          duration: 2000,
        });
        setTimeout(closeEditor, 300);
      } else {
        showToast((pageMode === 'edit' ? translate('settingsPage.saveFailedToast') : translate('settingsPage.rulesCreateFailedPrefix')) + (result.message || translate('settingsPage.rulesUnknownError')), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast((pageMode === 'edit' ? translate('settingsPage.saveFailedToast') : translate('settingsPage.rulesCreateFailedPrefix')) + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: RuleEntry & { source: RuleSource }) => {
    if (!window.confirm(translate('settingsPage.rulesDeleteConfirm') + rule.name + translate('settingsPage.deleteConfirmEnd'))) return;
    try {
      const result = await rulesApi.delete(rule.filePath);
      if (result.success) {
        showToast(translate('settingsPage.rulesDeletedToast') + rule.name, { type: 'success', duration: 2000 });
        loadRules();
      } else {
        showToast(translate('settingsPage.rulesDeleteFailedPrefix') + (result.message || translate('settingsPage.rulesUnknownError')), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast(translate('settingsPage.rulesDeleteFailedPrefix') + msg, { type: 'error', duration: 3000 });
    }
  };

  const renderList = () => {
    const total = alwaysRules.length + manualRules.length;
    return (
      <>
        <div className="settings-item-list-header">
          <h3>{t('settingsPage.rulesList')}</h3>
          <div className="settings-item-list-actions">
            <button
              type="button"
              className="settings-btn settings-btn-icon"
              title={t('settingsPage.rulesRefresh')}
              onClick={loadRules}
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
              + {t('settingsPage.rulesCreate')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="settings-loading">{t('settingsPage.rulesLoading')}</div>
        ) : error ? (
          <div className="settings-items-error">{error}</div>
        ) : total === 0 ? (
          <div className="settings-items-empty">
            {t('settingsPage.rulesEmptyShort')}
            <span className="settings-items-empty-hint">{t('settingsPage.rulesEmptyHint')}</span>
          </div>
        ) : (
          <>
            {alwaysRules.length > 0 && (
              <div className="settings-item-group">
                <div className="settings-item-group-header">
                  <span className="settings-item-group-label">⚡ {t('settingsPage.rulesGroupAlways')}</span>
                  <span className="settings-item-group-count">{alwaysRules.length}</span>
                </div>
                <div className="settings-items">
                  {alwaysRules.map((r) => (
                    <RuleItemRow
                      key={r.filePath}
                      rule={r}
                      onClick={() => openEdit(r)}
                      onDelete={() => handleDelete(r)}
                    />
                  ))}
                </div>
              </div>
            )}
            {manualRules.length > 0 && (
              <div className="settings-item-group">
                <div className="settings-item-group-header">
                  <span className="settings-item-group-label">📋 {t('settingsPage.rulesGroupManual')}</span>
                  <span className="settings-item-group-count">{manualRules.length}</span>
                </div>
                <div className="settings-items">
                  {manualRules.map((r) => (
                    <RuleItemRow
                      key={r.filePath}
                      rule={r}
                      onClick={() => openEdit(r)}
                      onDelete={() => handleDelete(r)}
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
    const title = pageMode === 'edit' && editor.rule
      ? translate('settingsPage.rulesEditTitlePrefix') + editor.rule.name
      : translate('settingsPage.rulesCreateTitle');
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
              {t('settingsPage.rulesBackPlain')}
            </button>
            <button
              type="button"
              className="settings-editor-btn settings-editor-btn-primary"
              onClick={handleSave}
              disabled={saving || contentLoading}
            >
              {pageMode === 'edit' ? t('settingsPage.rulesSave') : t('settingsPage.rulesCreate')}
            </button>
          </div>
        </div>
        <div className="settings-editor-fields">
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.rulesNameLabel')}</label>
            <input
              className="settings-input"
              type="text"
              value={editor.name}
              placeholder={t('settingsPage.rulesNamePh2')}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.rulesDesc')}</label>
            <input
              className="settings-input"
              type="text"
              value={editor.description}
              placeholder={t('settingsPage.rulesDescPh2')}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.rulesModeLabel')}</label>
            <div className="settings-toggle-group">
              <button
                type="button"
                className={`settings-toggle-btn${editor.mode === 'always' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, mode: 'always' })}
              >
                {t('settingsPage.rulesGroupAlways')}
              </button>
              <button
                type="button"
                className={`settings-toggle-btn${editor.mode === 'manual' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, mode: 'manual' })}
              >
                {t('settingsPage.rulesGroupManual')}
              </button>
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t('settingsPage.rulesScope')}</label>
            <div className="settings-toggle-group">
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'project' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'project' })}
              >
                {t('settingsPage.rulesProject')}
              </button>
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'user' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'user' })}
              >
                {t('settingsPage.rulesGlobal')}
              </button>
            </div>
          </div>
        </div>
        <textarea
          className="settings-editor-textarea"
          value={editor.content}
          placeholder={contentLoading ? t('settingsPage.rulesLoading') : t('settingsPage.rulesContentPh2')}
          onChange={(e) => setEditor({ ...editor, content: e.target.value })}
          spellCheck={false}
        />
      </div>
    );
  };

  return (
    <div>
      <h2 className="settings-page-title">{t('settingsPage.rulesPageTitle')}</h2>
      <p className="settings-page-desc">{t('settingsPage.rulesPageDesc')}</p>
      <hr className="settings-page-divider" />

      {pageMode === 'list' ? renderList() : renderEditor()}
    </div>
  );
}

function RuleItemRow({
  rule,
  onClick,
  onDelete,
}: {
  rule: RuleEntry & { source: RuleSource };
  onClick: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const isProject = rule.source === 'project';
  return (
    <div className="settings-item" onClick={onClick}>
      <span className="settings-item-icon">{rule.mode === 'always' ? '⚡' : '📋'}</span>
      <div className="settings-item-info">
        <div className="settings-item-name">{rule.name}</div>
        {rule.description && rule.description !== rule.name && (
          <div className="settings-item-meta">{rule.description}</div>
        )}
      </div>
      <span className="settings-item-badge">{isProject ? t('settingsPage.rulesProject') : t('settingsPage.rulesGlobal')}</span>
      <button
        type="button"
        className="settings-item-del"
        title={t('settingsPage.rulesDelete')}
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
