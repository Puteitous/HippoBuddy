/**
 * SkillsSettingsPage - 技能管理
 *
 * 列表(项目/用户分组)+ 编辑/创建/删除
 *
 * 状态:
 *  - mode: 'list' | 'edit' | 'create'
 *  - skills: { project: SkillEntry[]; user: SkillEntry[] }
 *  - editing: { skill, scope, content }
 *
 * 3.7-1:订阅 eventBus 'skills:changed',当 SkillMarket 安装/卸载技能时
 * 自动刷新本地列表(替代旧版 window.settingsPanel.reloadSkills())。
 */
import { useEffect, useState } from 'react';
import { skillsApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { on as onEvent } from '@/utils/eventBus';
import { showToast } from './toastStore';
import type { SkillEntry } from '@/types/config';

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

export function SkillsSettingsPage() {
  const [mode, setMode] = useState<Mode>('list');
  const [projectSkills, setProjectSkills] = useState<SkillEntry[]>([]);
  const [userSkills, setUserSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setEditor({
      skill,
      scope,
      name: skill.name || skill.fileName.replace(/\.md$/, ''),
      description: skill.description || '',
      content: '',
    });
    setContentLoading(true);
    try {
      const data = await skillsApi.get(skill.filePath);
      setEditor((prev) => ({ ...prev, content: data.content || '' }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('加载技能内容失败:' + msg, { type: 'error', duration: 3000 });
      setEditor((prev) => ({ ...prev, content: '' }));
    } finally {
      setContentLoading(false);
    }
  };

  const openCreate = () => {
    setMode('create');
    setEditor(emptyEditor());
  };

  const closeEditor = () => {
    setMode('list');
    setEditor(emptyEditor());
    loadSkills();
  };

  const handleSave = async () => {
    if (saving) return;
    const name = editor.name.trim();
    if (!name) {
      showToast('请输入技能名称', { type: 'warning', duration: 2000 });
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
        ? await skillsApi.update({ filePath: editor.skill.filePath, ...body })
        : await skillsApi.create(body);
      if (result.success) {
        showToast(mode === 'edit' ? '技能已保存' : '技能已创建', {
          type: 'success',
          duration: 2000,
        });
        setTimeout(closeEditor, 300);
      } else {
        showToast((mode === 'edit' ? '保存失败:' : '创建失败:') + (result.message || '未知错误'), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast((mode === 'edit' ? '保存失败:' : '创建失败:') + msg, {
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: SkillEntry) => {
    const name = skill.name || skill.fileName.replace(/\.md$/, '');
    if (!window.confirm(`确定删除技能「${name}」?`)) return;
    try {
      const result = await skillsApi.delete(skill.filePath);
      if (result.success) {
        showToast('技能已删除:' + name, { type: 'success', duration: 2000 });
        loadSkills();
      } else {
        showToast('删除失败:' + (result.message || '未知错误'), {
          type: 'error',
          duration: 3000,
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('删除失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const renderList = () => {
    const total = projectSkills.length + userSkills.length;
    return (
      <>
        <div className="settings-item-list-header">
          <h3>技能列表</h3>
          <div className="settings-item-list-actions">
            <button
              type="button"
              className="settings-btn settings-btn-icon"
              title="刷新"
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
              + 新建
            </button>
          </div>
        </div>

        {loading ? (
          <div className="settings-loading">加载中...</div>
        ) : error ? (
          <div className="settings-items-error">{error}</div>
        ) : total === 0 ? (
          <div className="settings-items-empty">
            暂无技能
            <span className="settings-items-empty-hint">点击右上角「+ 新建」创建第一个技能</span>
          </div>
        ) : (
          <>
            {projectSkills.length > 0 && (
              <div className="settings-item-group">
                <div className="settings-item-group-header">
                  <span className="settings-item-group-label">项目</span>
                  <span className="settings-item-group-count">{projectSkills.length}</span>
                </div>
                <div className="settings-items">
                  {projectSkills.map((s) => (
                    <SkillItemRow
                      key={s.filePath}
                      skill={s}
                      badge="项目"
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
                  <span className="settings-item-group-label">用户</span>
                  <span className="settings-item-group-count">{userSkills.length}</span>
                </div>
                <div className="settings-items">
                  {userSkills.map((s) => (
                    <SkillItemRow
                      key={s.filePath}
                      skill={s}
                      badge="用户"
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
    const title = mode === 'edit' && editor.skill
      ? `编辑技能:${editor.skill.name || editor.skill.fileName.replace(/\.md$/, '')}`
      : '新建技能';
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
              返回列表
            </button>
            <button
              type="button"
              className="settings-editor-btn settings-editor-btn-primary"
              onClick={handleSave}
              disabled={saving || contentLoading}
            >
              {mode === 'edit' ? '保存' : '创建'}
            </button>
          </div>
        </div>
        <div className="settings-editor-fields">
          <div className="settings-field">
            <label className="settings-field-label">名称</label>
            <input
              className="settings-input"
              type="text"
              value={editor.name}
              placeholder="技能名称"
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">描述</label>
            <input
              className="settings-input"
              type="text"
              value={editor.description}
              placeholder="技能用途"
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">作用域</label>
            <div className="settings-toggle-group">
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'project' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'project' })}
              >
                项目
              </button>
              <button
                type="button"
                className={`settings-toggle-btn${editor.scope === 'user' ? ' active' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'user' })}
              >
                用户
              </button>
            </div>
          </div>
        </div>
        <textarea
          className="settings-editor-textarea"
          value={editor.content}
          placeholder={contentLoading ? '加载中...' : '技能内容(Markdown)'}
          onChange={(e) => setEditor({ ...editor, content: e.target.value })}
          spellCheck={false}
        />
      </div>
    );
  };

  return (
    <div>
      <h2 className="settings-page-title">技能</h2>
      <p className="settings-page-desc">管理项目级与用户级技能(Markdown 文件),供 Agent 按需加载。</p>
      <hr className="settings-page-divider" />

      {mode === 'list' ? renderList() : renderEditor()}
    </div>
  );
}

function SkillItemRow({
  skill,
  badge,
  onClick,
  onDelete,
}: {
  skill: SkillEntry;
  badge: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="settings-item" onClick={onClick}>
      <span className="settings-item-icon">📄</span>
      <div className="settings-item-info">
        <div className="settings-item-name">
          {skill.name || skill.fileName.replace(/\.md$/, '')}
        </div>
        {skill.description && (
          <div className="settings-item-meta">{skill.description}</div>
        )}
      </div>
      <span className="settings-item-badge">{badge}</span>
      <button
        type="button"
        className="settings-item-del"
        title="删除"
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
