/**
 * ContextSelector - 规则/技能二级菜单
 *
 * 对标旧版 components/context-selector.js。
 *
 * 功能:
 *  - `#` 按钮 + 浮动面板,两级菜单
 *    第一级 → 选择类别(规则 / 技能)
 *    第二级 → 对应的列表(规则:always 灰显 + manual 可选;技能:可选)
 *  - hover 自动展开 + 点击 sticky(对齐旧版交互)
 *  - 选中规则 → 通过 onRuleToggle 回调通知父组件
 *  - 选中技能 → 通过 onSkillToggle 回调通知父组件,父组件生成 @filePath RefChip
 *
 * 简化(3.7-1):
 *  - 文案经 useI18n 迁移,随语言切换
 *  - 数据懒加载:首次展开时调用 rulesApi.list / skillsApi.list
 *  - 选中状态由父组件管理(selectedRuleIds / selectedSkillPaths),本组件只渲染
 *
 * 集成位置:ChatPanel 输入区(与 # 按钮同行)。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { rulesApi, skillsApi } from '@/api/client';
import type { RuleEntry, SkillEntry } from '@/types/config';
import { useI18n } from '@/i18n';
import './ContextSelector.css';

type Level = 'menu' | 'rules' | 'skills';

/** 带来源标记的规则项(对应旧版 _rules) */
export interface RuleItem extends RuleEntry {
  source: 'project' | 'user';
}

/** 带来源标记的技能项(对应旧版 _skills) */
export interface SkillItem extends SkillEntry {
  source: 'project' | 'user';
}

interface ContextSelectorProps {
  /** 已选中的规则 id 列表(由父组件管理,作为受控值) */
  selectedRuleIds: string[];
  /** 已选中的技能 filePath 列表(由父组件管理,作为受控值) */
  selectedSkillPaths: string[];
  /** 切换规则选中状态时回调 */
  onRuleToggle: (rule: RuleItem, selected: boolean) => void;
  /** 切换技能选中状态时回调 */
  onSkillToggle: (skill: SkillItem, selected: boolean) => void;
}

export function ContextSelector({
  selectedRuleIds,
  selectedSkillPaths,
  onRuleToggle,
  onSkillToggle,
}: ContextSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [level, setLevel] = useState<Level>('menu');

  const [rules, setRules] = useState<RuleItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 加载规则 + 技能列表 */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesData, skillsData] = await Promise.all([
        rulesApi.list(),
        skillsApi.list(),
      ]);
      const ruleItems: RuleItem[] = [
        ...(rulesData.projectRules || []).map<RuleItem>((r) => ({ ...r, source: 'project' })),
        ...(rulesData.userRules || []).map<RuleItem>((r) => ({ ...r, source: 'user' })),
      ];
      const skillItems: SkillItem[] = [
        ...(skillsData.projectSkills || []).map<SkillItem>((s) => ({ ...s, source: 'project' })),
        ...(skillsData.userSkills || []).map<SkillItem>((s) => ({ ...s, source: 'user' })),
      ];
      setRules(ruleItems);
      setSkills(skillItems);
      setLoaded(true);
    } catch (e) {
      console.warn('[ContextSelector] 加载失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 打开面板(hover 或 click 触发) */
  const openPanel = useCallback(
    async (stickyMode: boolean) => {
      if (!loaded && !loading) {
        await loadData();
      }
      setSticky(stickyMode);
      setLevel('menu');
      setOpen(true);
    },
    [loaded, loading, loadData],
  );

  /** 关闭面板 */
  const closePanel = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSticky(false);
    setOpen(false);
  }, []);

  /** 点击按钮:切换 sticky 状态 */
  const handleButtonClick = useCallback(async () => {
    if (open && sticky) {
      closePanel();
      return;
    }
    await openPanel(true);
  }, [open, sticky, openPanel, closePanel]);

  /** hover 进入按钮(非 sticky 时延迟打开) */
  const handleButtonEnter = useCallback(() => {
    if (open) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    void openPanel(false);
  }, [open, openPanel]);

  /** hover 离开按钮(非 sticky 时延迟关闭) */
  const handleButtonLeave = useCallback(() => {
    if (!open || sticky) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closePanel();
    }, 250);
  }, [open, sticky, closePanel]);

  /** hover 进入面板(取消关闭) */
  const handlePanelEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  /** hover 离开面板(非 sticky 时延迟关闭) */
  const handlePanelLeave = useCallback(() => {
    if (!open || sticky) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closePanel();
    }, 250);
  }, [open, sticky, closePanel]);

  /** 点击外部关闭 */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      closePanel();
    };
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, closePanel]);

  const totalSelected = selectedRuleIds.length + selectedSkillPaths.length;

  return (
    <div className="context-selector" ref={containerRef}>
      <button
        type="button"
        className="context-selector-btn"
        title={t('context.selectorTitle')}
        onClick={handleButtonClick}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
      >
        <span className="context-selector-hash">#</span>
        {totalSelected > 0 && (
          <span className="context-selector-badge">{totalSelected}</span>
        )}
      </button>

      {open && (
        <div
          className="context-selector-panel"
          role="dialog"
          aria-label={t('context.dialogAria')}
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handlePanelLeave}
        >
          {loading ? (
            <div className="context-selector-loading">{t('chat.loading')}</div>
          ) : level === 'menu' ? (
            <MenuLevel
              onGoRules={() => setLevel('rules')}
              onGoSkills={() => setLevel('skills')}
            />
          ) : level === 'rules' ? (
            <RulesLevel
              rules={rules}
              selectedRuleIds={selectedRuleIds}
              onBack={() => setLevel('menu')}
              onToggle={onRuleToggle}
            />
          ) : (
            <SkillsLevel
              skills={skills}
              selectedSkillPaths={selectedSkillPaths}
              onBack={() => setLevel('menu')}
              onToggle={onSkillToggle}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 第一级:类别菜单
// ============================================================================

interface MenuLevelProps {
  onGoRules: () => void;
  onGoSkills: () => void;
}

function MenuLevel({ onGoRules, onGoSkills }: MenuLevelProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="context-selector-header">{t('context.chooseCategory')}</div>
      <div className="context-selector-body">
        <button
          type="button"
          className="context-selector-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            onGoRules();
          }}
        >
          <span className="context-selector-menu-icon">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6.5" y="0.5" width="3" height="1.5" rx="0.4" />
              <path d="M5 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-2" />
              <path d="M6 8.5l1.5 1.5L10 7" />
            </svg>
          </span>
          <span className="context-selector-menu-label">{t('context.rules')}</span>
          <span className="context-selector-menu-arrow"><svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7988 12L29.7988 24L17.7988 36"/></svg></span>
        </button>

        <button
          type="button"
          className="context-selector-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            onGoSkills();
          }}
        >
          <span className="context-selector-menu-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" />
            </svg>
          </span>
          <span className="context-selector-menu-label">{t('context.skills')}</span>
          <span className="context-selector-menu-arrow"><svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7988 12L29.7988 24L17.7988 36"/></svg></span>
        </button>
      </div>
    </>
  );
}

// ============================================================================
// 第二级:规则列表
// ============================================================================

interface RulesLevelProps {
  rules: RuleItem[];
  selectedRuleIds: string[];
  onBack: () => void;
  onToggle: (rule: RuleItem, selected: boolean) => void;
}

function RulesLevel({ rules, selectedRuleIds, onBack, onToggle }: RulesLevelProps) {
  const { t } = useI18n();
  const alwaysRules = rules.filter((r) => r.mode === 'always');
  const manualRules = rules.filter((r) => r.mode !== 'always');

  return (
    <>
      <div className="context-selector-header">
        <button
          type="button"
          className="context-selector-back"
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          title={t('context.back')}
        >
          ←
        </button>
        <span>{t('context.rules')}</span>
      </div>
      <div className="context-selector-body">
        {rules.length === 0 ? (
          <div className="context-selector-empty">
            {t('context.noRules')}
            <span className="context-selector-empty-hint">{t('context.addRuleHint')}</span>
          </div>
        ) : (
          <>
            {alwaysRules.length > 0 && (
              <RuleGroup label={t('context.alwaysLabel')} rules={alwaysRules} disabled />
            )}
            {manualRules.length > 0 && (
              <RuleGroup
                label={t('context.manualLabel')}
                rules={manualRules}
                selectedRuleIds={selectedRuleIds}
                onToggle={onToggle}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

interface RuleGroupProps {
  label: string;
  rules: RuleItem[];
  disabled?: boolean;
  selectedRuleIds?: string[];
  onToggle?: (rule: RuleItem, selected: boolean) => void;
}

function RuleGroup({ label, rules, disabled, selectedRuleIds, onToggle }: RuleGroupProps) {
  return (
    <div className="context-selector-group">
      <div className="context-selector-group-label">{label}</div>
      {rules.map((rule) => {
        const id = `${rule.source}:${rule.name}`;
        const selected = selectedRuleIds?.includes(id) ?? false;
        return (
          <label
            key={id}
            className={`context-selector-item${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
          >
            <input
              type="checkbox"
              checked={disabled || selected}
              disabled={disabled}
              onChange={(e) => {
                if (disabled || !onToggle) return;
                onToggle(rule, e.target.checked);
              }}
            />
            <div className="context-selector-item-info">
              <div className="context-selector-item-name">{rule.name}</div>
              {rule.description && rule.description !== rule.name && (
                <div className="context-selector-item-desc">{rule.description}</div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ============================================================================
// 第二级:技能列表
// ============================================================================

interface SkillsLevelProps {
  skills: SkillItem[];
  selectedSkillPaths: string[];
  onBack: () => void;
  onToggle: (skill: SkillItem, selected: boolean) => void;
}

function SkillsLevel({ skills, selectedSkillPaths, onBack, onToggle }: SkillsLevelProps) {
  const { t } = useI18n();
  const projectSkills = skills.filter((s) => s.source === 'project');
  const userSkills = skills.filter((s) => s.source === 'user');

  return (
    <>
      <div className="context-selector-header">
        <button
          type="button"
          className="context-selector-back"
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          title={t('context.back')}
        >
          ←
        </button>
        <span>{t('context.skills')}</span>
      </div>
      <div className="context-selector-body">
        {skills.length === 0 ? (
          <div className="context-selector-empty">
            {t('context.noSkills')}
            <span className="context-selector-empty-hint">{t('context.addSkillHint')}</span>
          </div>
        ) : (
          <>
            {projectSkills.length > 0 && (
              <SkillGroup
                label={t('context.projectSkills')}
                skills={projectSkills}
                selectedSkillPaths={selectedSkillPaths}
                onToggle={onToggle}
              />
            )}
            {userSkills.length > 0 && (
              <SkillGroup
                label={t('context.userSkills')}
                skills={userSkills}
                selectedSkillPaths={selectedSkillPaths}
                onToggle={onToggle}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

interface SkillGroupProps {
  label: string;
  skills: SkillItem[];
  selectedSkillPaths: string[];
  onToggle: (skill: SkillItem, selected: boolean) => void;
}

function SkillGroup({ label, skills, selectedSkillPaths, onToggle }: SkillGroupProps) {
  return (
    <div className="context-selector-group">
      <div className="context-selector-group-label">{label}</div>
      {skills.map((skill) => {
        const selected = selectedSkillPaths.includes(skill.filePath);
        return (
          <label
            key={skill.filePath}
            className={`context-selector-item${selected ? ' selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggle(skill, e.target.checked)}
            />
            <div className="context-selector-item-info">
              <div className="context-selector-item-name">
                {skill.name || skill.fileName.replace(/\.md$/, '')}
              </div>
              {skill.description && (
                <div className="context-selector-item-desc">{skill.description}</div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
