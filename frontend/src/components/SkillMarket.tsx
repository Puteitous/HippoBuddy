/**
 * SkillMarket - 技能市场主面板
 *
 * 对标旧版 components/SkillMarket.js,内嵌于 app-shell-main 替换聊天面板(保留活动栏/会话列表)。
 *
 * 功能:
 *  - 浏览精选技能(分类过滤 + 关键字搜索)
 *  - 浏览推荐来源仓库
 *  - 查看已安装技能(项目级 / 用户级分组)
 *  - 安装:fetch skillUrl 内容 → skillsApi.create(scope='user')
 *  - 卸载:skillsApi.delete(filePath)
 *  - 预览:模态层加载 raw 内容显示
 *  - 安装/卸载后 eventBus.emit('skills:changed'),通知 SkillsSettingsPage 刷新
 *
 * 集成位置:由 appStore.skillMarketOpen 控制是否渲染,挂在 AppShell 顶层。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { skillsApi } from '@/api/client';
import { showToast } from '@/utils/toastStore';
import { emit as emitEvent } from '@/utils/eventBus';
import { useI18n } from '@/i18n';
import type { SkillEntry } from '@/types/config';
import {
  SKILL_SOURCES,
  FEATURED_SKILLS,
  SKILL_CATEGORIES,
  DEFAULT_CATEGORY_LABEL,
  type SkillSource,
  type FeaturedSkill,
} from './SkillMarketData';
import './SkillMarket.css';

/** 带来源标记的已安装技能(对齐旧版 _installedSkills) */
interface InstalledSkill extends SkillEntry {
  source: 'project' | 'user';
}

interface SkillMarketProps {
  /** 关闭面板回调(由 AppShell 传入 setSkillMarketOpen(false)) */
  onClose: () => void;
}

/** 来源标签(中文) → i18n key */
const TAG_KEY: Record<string, string> = {
  官方: 'skillMarket.tag.official',
  社区: 'skillMarket.tag.community',
  大厂: 'skillMarket.tag.vendor',
  精选: 'skillMarket.tag.featured',
};

/** 技能名(kebab-case) → i18n key 后缀(camelCase) */
const skillKey = (name: string): string =>
  name
    .split('-')
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');

export function SkillMarket({ onClose }: SkillMarketProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(DEFAULT_CATEGORY_LABEL);
  const [activeSource, setActiveSource] = useState<SkillSource | null>(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [savedCategory, setSavedCategory] = useState<string>(DEFAULT_CATEGORY_LABEL);

  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());

  /** 预览中的技能(null 关闭) */
  const [previewing, setPreviewing] = useState<FeaturedSkill | { name: string; skillUrl: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /** 安装中按钮 disabled 集合 */
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  /** 已安装名规范化(对齐旧版:name.toLowerCase().replace(/\s+/g, '-')) */
  const normalizeName = (name: string): string => name.toLowerCase().replace(/\s+/g, '-');

  /** 重新加载已安装技能列表 */
  const reloadInstalled = useCallback(async () => {
    try {
      const data = await skillsApi.list();
      const all: InstalledSkill[] = [
        ...(data.projectSkills || []).map<InstalledSkill>((s) => ({ ...s, source: 'project' })),
        ...(data.userSkills || []).map<InstalledSkill>((s) => ({ ...s, source: 'user' })),
      ];
      setInstalledSkills(all);
      setInstalledNames(new Set(all.map((s) => normalizeName(s.name || s.fileName.replace(/\.md$/, '')))));
    } catch (e) {
      console.warn('[SkillMarket] 加载已安装技能失败:', e);
      setInstalledSkills([]);
      setInstalledNames(new Set());
    }
  }, []);

  // 切换为"已安装"模式时刷新
  useEffect(() => {
    if (showInstalled) {
      void reloadInstalled();
    }
  }, [showInstalled, reloadInstalled]);

  /** 关闭预览模态 */
  const closePreview = useCallback(() => {
    setPreviewing(null);
    setPreviewContent(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  // Esc 关闭(预览模态打开时优先关闭预览)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (previewing) {
          closePreview();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, previewing, closePreview]);

  /** 按当前过滤条件筛选精选技能 */
  const filteredFeatured = useMemo<FeaturedSkill[]>(() => {
    return FEATURED_SKILLS.filter((s) => {
      const matchQuery =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === DEFAULT_CATEGORY_LABEL || s.category === activeCategory;
      return matchQuery && matchCat;
    });
  }, [searchQuery, activeCategory]);

  /** 按当前过滤条件 + 来源仓库筛选 */
  const filteredBySource = useMemo<FeaturedSkill[]>(() => {
    if (!activeSource) return [];
    return FEATURED_SKILLS.filter((s) => {
      const matchSource = s.source.toLowerCase().includes(activeSource.id);
      const matchQuery =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === DEFAULT_CATEGORY_LABEL || s.category === activeCategory;
      return matchSource && matchQuery && matchCat;
    });
  }, [activeSource, searchQuery, activeCategory]);

  /** 判断是否已安装 */
  const isInstalled = useCallback(
    (name: string): boolean => installedNames.has(normalizeName(name)),
    [installedNames],
  );

  /** 安装技能 */
  const handleInstall = useCallback(
    async (skill: FeaturedSkill) => {
      if (!window.confirm(t('skillMarket.confirmInstall', { name: skill.name, source: skill.source }))) return;
      setInstalling((prev) => new Set(prev).add(skill.name));
      try {
        const resp = await fetch(skill.skillUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const content = await resp.text();
        const result = await skillsApi.create({
          name: skill.name,
          description: skill.desc,
          scope: 'user',
          content,
        });
        if (result.success) {
          showToast(t('skillMarket.installSuccess', { name: skill.name }), { type: 'success', duration: 2000 });
          await reloadInstalled();
          // 通知 SkillsSettingsPage / ContextSelector 等刷新
          emitEvent('skills:changed', { name: skill.name, action: 'install' });
        } else {
          showToast(t('skillMarket.installFailed') + (result.message || t('settingsPage.skillsUnknownError')), {
            type: 'error',
            duration: 3000,
          });
        }
      } catch (e) {
        console.warn('[SkillMarket] 安装失败:', e);
        showToast(t('skillMarket.installNetworkError'), { type: 'error', duration: 3000 });
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev);
          next.delete(skill.name);
          return next;
        });
      }
    },
    [reloadInstalled, t],
  );

  /** 卸载技能(来自已安装列表) */
  const handleUninstall = useCallback(
    async (skill: InstalledSkill) => {
      const name = skill.name || skill.fileName.replace(/\.md$/, '');
      if (!window.confirm(t('skillMarket.uninstallConfirm', { name }))) return;
      try {
        const result = await skillsApi.delete(skill.filePath);
        if (result.success) {
          showToast(t('skillMarket.uninstallSuccess', { name }), { type: 'success', duration: 2000 });
          await reloadInstalled();
          emitEvent('skills:changed', { name, action: 'uninstall' });
        } else {
          showToast(t('skillMarket.uninstallFailed') + (result.message || t('settingsPage.skillsUnknownError')), {
            type: 'error',
            duration: 3000,
          });
        }
      } catch (e) {
        console.warn('[SkillMarket] 卸载失败:', e);
        showToast(t('skillMarket.uninstallRetry'), { type: 'error', duration: 3000 });
      }
    },
    [reloadInstalled, t],
  );

  /** 预览技能 */
  const handlePreview = useCallback(
    async (skill: FeaturedSkill | { name: string; skillUrl: string }) => {
      setPreviewing(skill);
      setPreviewContent(null);
      setPreviewError(null);
      setPreviewLoading(true);
      try {
        const resp = await fetch(skill.skillUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        setPreviewContent(await resp.text());
      } catch (e) {
        setPreviewError(t('skillMarket.loadFailed'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [t],
  );

  /** 点击分类:退出已安装模式 + 切换分类 */
  const handleCategoryClick = (label: string) => {
    if (showInstalled) {
      setShowInstalled(false);
      setActiveSource(null);
    }
    setActiveCategory(label);
  };

  /** 点击"已安装"标签:进入已安装模式 */
  const handleInstalledClick = () => {
    if (!showInstalled) {
      setSavedCategory(activeCategory);
      setActiveSource(null);
      setShowInstalled(true);
    } else {
      setShowInstalled(false);
      setActiveCategory(savedCategory || DEFAULT_CATEGORY_LABEL);
    }
  };

  return (
    <div className="skill-market-container" role="dialog" aria-label={t('skillMarket.title')}>
      {/* Header */}
      <header className="skill-market-header">
        <div>
          <h2 className="skill-market-title">{t('skillMarket.title')}</h2>
          <span className="skill-market-subtitle">{t('skillMarket.subtitle')}</span>
        </div>
        <button
          type="button"
          className="skill-market-close"
          title={t('skillMarket.closeEsc')}
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      {/* Body */}
      <div className="skill-market-body">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <CategoryTabs
          activeCategory={activeCategory}
          showInstalled={showInstalled}
          onCategoryClick={handleCategoryClick}
          onInstalledClick={handleInstalledClick}
        />

        <div className="skill-market-content">
          {showInstalled ? (
            <InstalledSkillsList
              skills={installedSkills}
              isMarketSkill={(s) => {
                const name = s.name || s.fileName.replace(/\.md$/, '');
                return FEATURED_SKILLS.some(
                  (f) => normalizeName(f.name) === normalizeName(name),
                );
              }}
              onUninstall={handleUninstall}
              onPreview={(s) => {
                const name = s.name || s.fileName.replace(/\.md$/, '');
                void handlePreview({
                  name,
                  skillUrl: `/api/file/raw?path=${encodeURIComponent(s.filePath)}`,
                });
              }}
            />
          ) : activeSource ? (
            <SourceDetail
              source={activeSource}
              skills={filteredBySource}
              onBack={() => setActiveSource(null)}
              isInstalled={isInstalled}
              installing={installing}
              onInstall={handleInstall}
              onPreview={handlePreview}
            />
          ) : (
            <>
              {activeCategory === DEFAULT_CATEGORY_LABEL && (
                <SourcesSection sources={SKILL_SOURCES} />
              )}
              <FeaturedSection
                skills={filteredFeatured}
                isInstalled={isInstalled}
                installing={installing}
                onInstall={handleInstall}
                onPreview={handlePreview}
              />
            </>
          )}
        </div>
      </div>

      {/* 预览模态 */}
      {previewing && (
        <PreviewModal
          name={previewing.name}
          content={previewContent}
          loading={previewLoading}
          error={previewError}
          onClose={closePreview}
        />
      )}
    </div>
  );
}

// ============================================================================
// SearchBar
// ============================================================================

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-search">
      <svg
        className="skill-market-search-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className="skill-market-search-input"
        type="text"
        placeholder={t('skillMarket.searchPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="skill-market-search-clear"
          title={t('skillMarket.clearSearch')}
          onClick={() => onChange('')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ============================================================================
// CategoryTabs
// ============================================================================

interface CategoryTabsProps {
  activeCategory: string;
  showInstalled: boolean;
  onCategoryClick: (label: string) => void;
  onInstalledClick: () => void;
}

function CategoryTabs({
  activeCategory,
  showInstalled,
  onCategoryClick,
  onInstalledClick,
}: CategoryTabsProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-cats">
      <button
        type="button"
        className={`skill-market-cat-btn skill-market-installed-btn${showInstalled ? ' active' : ''}`}
        onClick={onInstalledClick}
      >
        {t('skillMarket.installed')}
      </button>
      <span className="skill-market-cats-divider" />
      {SKILL_CATEGORIES.map((cat) => {
        const active = cat.label === activeCategory && !showInstalled;
        return (
          <button
            key={cat.key}
            type="button"
            className={`skill-market-cat-btn skill-market-cat-filter${active ? ' active' : ''}`}
            onClick={() => onCategoryClick(cat.label)}
          >
            {t(`skillMarket.${cat.key}`)}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SourcesSection(推荐来源仓库)
// ============================================================================

interface SourcesSectionProps {
  sources: SkillSource[];
}

function SourcesSection({ sources }: SourcesSectionProps) {
  const { t } = useI18n();
  return (
    <section className="skill-market-section">
      <h3 className="skill-market-section-title">{t('skillMarket.sources')}</h3>
      <div className="skill-market-sources">
        {sources.map((src) => (
          <div key={src.id} className="skill-market-source-card">
            <div className="skill-market-source-info">
              <div className="skill-market-source-name">
                {src.name}
                <span className={`skill-market-source-tag tag-${src.tag}`}>{t(TAG_KEY[src.tag] || 'skillMarket.tag.featured')}</span>
              </div>
              <a
                className="skill-market-source-github"
                href={src.url}
                target="_blank"
                rel="noreferrer"
                title={t('skillMarket.viewOnGithub')}
              >
                ↗
              </a>
            </div>
            <div className="skill-market-source-desc">{t(`skillMarket.source.${src.id}`)}</div>
            {src.stars !== '—' && (
              <div className="skill-market-source-stars">★ {src.stars}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// SourceDetail(浏览某仓库的技能列表)
// ============================================================================

interface SourceDetailProps {
  source: SkillSource;
  skills: FeaturedSkill[];
  onBack: () => void;
  isInstalled: (name: string) => boolean;
  installing: Set<string>;
  onInstall: (skill: FeaturedSkill) => void;
  onPreview: (skill: FeaturedSkill) => void;
}

function SourceDetail({
  source,
  skills,
  onBack,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: SourceDetailProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-source-detail">
      <div className="skill-market-source-back">
        <button
          type="button"
          className="skill-market-btn skill-market-btn-ghost"
          onClick={onBack}
        >
          {t('skillMarket.backToList')}
        </button>
        <span className="skill-market-source-detail-title">{source.name}</span>
      </div>
      {skills.length === 0 ? (
        <div className="skill-market-empty">{t('skillMarket.noMatchSource')}</div>
      ) : (
        <SkillGrid
          skills={skills}
          isInstalled={isInstalled}
          installing={installing}
          onInstall={onInstall}
          onPreview={onPreview}
        />
      )}
    </div>
  );
}

// ============================================================================
// FeaturedSection(精选技能)
// ============================================================================

interface FeaturedSectionProps {
  skills: FeaturedSkill[];
  isInstalled: (name: string) => boolean;
  installing: Set<string>;
  onInstall: (skill: FeaturedSkill) => void;
  onPreview: (skill: FeaturedSkill) => void;
}

function FeaturedSection({
  skills,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: FeaturedSectionProps) {
  const { t } = useI18n();
  return (
    <section className="skill-market-section">
      <h3 className="skill-market-section-title">{t('skillMarket.featured')}</h3>
      {skills.length === 0 ? (
        <div className="skill-market-empty">{t('skillMarket.noMatch')}</div>
      ) : (
        <SkillGrid
          skills={skills}
          isInstalled={isInstalled}
          installing={installing}
          onInstall={onInstall}
          onPreview={onPreview}
        />
      )}
    </section>
  );
}

// ============================================================================
// SkillGrid(技能卡片网格)
// ============================================================================

interface SkillGridProps {
  skills: FeaturedSkill[];
  isInstalled: (name: string) => boolean;
  installing: Set<string>;
  onInstall: (skill: FeaturedSkill) => void;
  onPreview: (skill: FeaturedSkill) => void;
}

function SkillGrid({
  skills,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: SkillGridProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-grid">
      {skills.map((skill) => {
        const installed = isInstalled(skill.name);
        const installingThis = installing.has(skill.name);
        return (
          <div
            key={skill.name}
            className="skill-market-skill-card"
            tabIndex={0}
            onClick={() => onPreview(skill)}
          >
            <div className="skill-market-skill-row">
              <div className="skill-market-skill-text">
                <div className="skill-market-skill-name">{skill.name}</div>
                <div className="skill-market-skill-desc">{t(`skillMarket.skill.${skillKey(skill.name)}`)}</div>
              </div>
              <button
                type="button"
                className={`skill-market-plus-btn${installed ? ' installed' : ''}`}
                title={installed ? t('skillMarket.installed') : t('skillMarket.install')}
                disabled={installingThis || installed}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!installed) void onInstall(skill);
                }}
              >
                {installed ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 8 7 12 13 4" />
                  </svg>
                ) : installingThis ? (
                  <span className="skill-market-plus-loading">…</span>
                ) : (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="8" y1="2" x2="8" y2="14" />
                    <line x1="2" y1="8" x2="14" y2="8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// InstalledSkillsList(已安装技能列表)
// ============================================================================

interface InstalledSkillsListProps {
  skills: InstalledSkill[];
  isMarketSkill: (s: InstalledSkill) => boolean;
  onUninstall: (s: InstalledSkill) => void;
  onPreview: (s: InstalledSkill) => void;
}

function InstalledSkillsList({
  skills,
  isMarketSkill,
  onUninstall,
  onPreview,
}: InstalledSkillsListProps) {
  const { t } = useI18n();
  if (skills.length === 0) {
    return (
      <div className="skill-market-empty">
        {t('skillMarket.noSkills')}
        <span className="skill-market-empty-hint">{t('skillMarket.goInstall')}</span>
      </div>
    );
  }

  const projectSkills = skills.filter((s) => s.source === 'project');
  const userSkills = skills.filter((s) => s.source === 'user');
  const marketInstalled = skills.filter((s) => isMarketSkill(s)).length;

  return (
    <div className="skill-market-installed">
      <div className="skill-market-installed-summary">
        <span
          className="skill-market-installed-summary-count"
          dangerouslySetInnerHTML={{ __html: t('skillMarket.installedCount', { count: skills.length }) }}
        />
        {marketInstalled > 0 && (
          <span
            dangerouslySetInnerHTML={{ __html: t('skillMarket.fromMarket', { count: marketInstalled }) }}
          />
        )}
      </div>
      {projectSkills.length > 0 && (
        <InstalledGroup
          label={t('skillMarket.projectSkills')}
          skills={projectSkills}
          onUninstall={onUninstall}
          onPreview={onPreview}
        />
      )}
      {userSkills.length > 0 && (
        <InstalledGroup
          label={t('skillMarket.userSkills')}
          skills={userSkills}
          onUninstall={onUninstall}
          onPreview={onPreview}
        />
      )}
    </div>
  );
}

interface InstalledGroupProps {
  label: string;
  skills: InstalledSkill[];
  onUninstall: (s: InstalledSkill) => void;
  onPreview: (s: InstalledSkill) => void;
}

function InstalledGroup({ label, skills, onUninstall, onPreview }: InstalledGroupProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-installed-group">
      <div className="skill-market-installed-group-header">
        <span className="skill-market-installed-group-label">{label}</span>
        <span className="skill-market-installed-group-count">{skills.length}</span>
      </div>
      <div className="skill-market-installed-list">
        {skills.map((skill) => {
          const name = skill.name || skill.fileName.replace(/\.md$/, '');
          return (
            <div
              key={skill.filePath}
              className="skill-market-installed-item"
              tabIndex={0}
              onClick={() => onPreview(skill)}
            >
              <div className="skill-market-installed-item-info">
                <div className="skill-market-installed-item-name">{name}</div>
                <div className="skill-market-installed-item-meta">
                  {skill.description || ''}
                </div>
              </div>
              <button
                type="button"
                className="skill-market-btn skill-market-btn-ghost skill-market-btn-uninstall"
                title={t('skillMarket.uninstall')}
                onClick={(e) => {
                  e.stopPropagation();
                  onUninstall(skill);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PreviewModal(预览技能内容)
// ============================================================================

interface PreviewModalProps {
  name: string;
  content: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function PreviewModal({ name, content, loading, error, onClose }: PreviewModalProps) {
  const { t } = useI18n();
  return (
    <div className="skill-market-preview-modal" role="dialog" aria-label={t('skillMarket.previewAria', { name })}>
      <div className="skill-market-preview-backdrop" onClick={onClose} />
      <div className="skill-market-preview-panel">
        <div className="skill-market-preview-header">
          <span className="skill-market-preview-title">{name}</span>
          <button
            type="button"
            className="skill-market-preview-close"
            title={t('skillMarket.previewClose')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="skill-market-preview-body">
          {loading ? (
            <div className="skill-market-preview-loading">{t('skillMarket.loading')}</div>
          ) : error ? (
            <div className="skill-market-preview-error">{error}</div>
          ) : (
            <pre className="skill-market-preview-code">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}