/**
 * PluginMarket - 插件市场主面板
 *
 * 由 SkillMarket 重构而来：市场条目同时支持「技能(skill)」和「MCP 插件(mcp)」。
 * 内嵌于 app-shell-main(保留活动栏/会话列表),由 appStore.pluginMarketOpen 控制显隐。
 *
 * 功能:
 *  - 浏览精选插件(分类过滤 + 关键字搜索)
 *  - 浏览推荐来源仓库
 *  - 查看已安装插件(技能按 项目/用户 分组;MCP 插件来自 config.mcp.servers)
 *  - 安装:
 *    skill → fetch skillUrl 内容 → skillsApi.create(scope='user')
 *    mcp   → 读取 config.mcp.servers 追加该 server → configApi.updateFull({mcp})
 *  - 卸载:
 *    skill → skillsApi.delete(filePath)
 *    mcp   → 从 config.mcp.servers 移除该 id → configApi.updateFull({mcp})
 *  - 预览:skill 显示 .md 内容;mcp 显示其配置 JSON
 *  - 安装/卸载 skill 后 emit('skills:changed') 通知技能设置页刷新;mcp 后 emit('mcp:changed')
 *
 * 说明:MCP 插件安装/卸载后经 /api/mcp/refresh 即时建立/断开连接,无需重启。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { skillsApi, configApi, mcpApi, pluginsApi } from '@/api/client';
import { type RemotePluginEntry, type RemoteRegistry } from '@/api/client';
import { showToast } from '@/utils/toastStore';
import { emit as emitEvent } from '@/utils/eventBus';
import { useI18n } from '@/i18n';
import type { SkillEntry, McpConfigSection, McpServerConfigSection } from '@/types/config';
import {
  PLUGIN_SOURCES,
  MARKET_PLUGINS,
  PLUGIN_CATEGORIES,
  DEFAULT_CATEGORY_LABEL,
  type PluginSource,
  type MarketPlugin,
  type MarketPluginType,
} from '@/components/plugin-market/PluginMarketData';
import './PluginMarket.css';

/** 已安装插件统一的展示结构 */
interface InstalledPlugin {
  id: string;
  type: 'skill' | 'mcp';
  name: string;
  description: string;
  /** skill 类型:文件路径;mcp 类型:server id */
  filePath: string;
  source: 'project' | 'user' | 'mcp';
}

interface PluginMarketProps {
  /** 关闭面板回调(由 AppShell 传入 setPluginMarketOpen(false)) */
  onClose: () => void;
}

/** 来源标签 → i18n key */
const TAG_KEY: Record<string, string> = {
  官方: 'pluginMarket.tag.official',
  社区: 'pluginMarket.tag.community',
  大厂: 'pluginMarket.tag.vendor',
  精选: 'pluginMarket.tag.featured',
};

export function PluginMarket({ onClose }: PluginMarketProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(DEFAULT_CATEGORY_LABEL);
  const [activeSource, setActiveSource] = useState<PluginSource | null>(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [savedCategory, setSavedCategory] = useState<string>(DEFAULT_CATEGORY_LABEL);
  /** 类型筛选:全部 / 技能 / MCP */
  const [typeFilter, setTypeFilter] = useState<MarketPluginType | 'all'>('all');

  /** 市场目录数据源:初始为内置,拉取远程成功后整体替换 */
  const [catalogPlugins, setCatalogPlugins] = useState<MarketPlugin[]>(MARKET_PLUGINS);
  /** 远程目录不可用(失败/未配置/空)时为 true,界面显示离线标记 */
  const [offlineMode, setOfflineMode] = useState(false);
  /** 正在拉取远程目录 */
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  /** skill 已安装名集合(kebab-case) */
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set());
  /** mcp 已安装 server id 集合 */
  const [installedMcpIds, setInstalledMcpIds] = useState<Set<string>>(new Set());

  /** 预览中的插件 */
  const [previewing, setPreviewing] = useState<MarketPlugin | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /** 安装中 id 集合(按钮 disabled) */
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  /** 名称规范化(对齐旧版:name.toLowerCase().replace(/\s+/g, '-')) */
  const normalizeName = (name: string): string => name.toLowerCase().replace(/\s+/g, '-');

  /** 重新加载已安装列表(skill + mcp) */
  const reloadInstalled = useCallback(async () => {
    try {
      const [skillData, cfg] = await Promise.all([
        skillsApi.list(),
        configApi.getFull().catch(() => null),
      ]);
      const list: InstalledPlugin[] = [
        ...(skillData?.projectSkills || []).map<InstalledPlugin>((s) => ({ ...toInstalledSkill(s), source: 'project' })),
        ...(skillData?.userSkills || []).map<InstalledPlugin>((s) => ({ ...toInstalledSkill(s), source: 'user' })),
        ...(cfg?.mcp?.servers || []).map<InstalledPlugin>((s) => ({
          id: s.id,
          type: 'mcp',
          name: s.name || s.id,
          description: '[MCP] ' + (s.type === 'sse' ? s.url : (s.command || '')),
          filePath: '',
          source: 'mcp',
        })),
      ];
      setInstalledPlugins(list);
      setInstalledSkillNames(new Set(list.filter((p) => p.type === 'skill').map((p) => normalizeName(p.id))));
      setInstalledMcpIds(new Set(list.filter((p) => p.type === 'mcp').map((p) => p.id)));
    } catch (e) {
      console.warn('[PluginMarket] 加载已安装插件失败:', e);
      setInstalledPlugins([]);
      setInstalledSkillNames(new Set());
      setInstalledMcpIds(new Set());
    }
  }, []);

  const toInstalledSkill = (s: SkillEntry): Omit<InstalledPlugin, 'source'> => ({
    id: s.name || s.fileName.replace(/\.md$/, ''),
    type: 'skill',
    name: s.name || s.fileName.replace(/\.md$/, ''),
    description: s.description || '',
    filePath: s.filePath,
  });

  /**
   * 远程目录条目 → 内置 MarketPlugin 结构。
   * - desc 原样透传:内置渲染走 t(),未知 key 会原样返回文本,兼容「i18n key / 纯文本」两种形态
   * - package 类型(标准插件包)在 Step 1 未支持,直接跳过
   */
  const toMarketPlugin = useCallback((r: RemotePluginEntry): MarketPlugin | null => {
    if (r.type === 'package') return null;
    if (r.type === 'mcp') {
      if (!r.mcp) return null;
      return {
        id: r.id,
        type: 'mcp',
        name: r.name,
        desc: r.desc || r.name,
        source: r.source || 'community',
        category: (r.category as MarketPlugin['category']) || 'dev',
        mcp: r.mcp,
      };
    }
    // skill
    if (!r.skillUrl) return null;
    return {
      id: r.id,
      type: 'skill',
      name: r.name,
      desc: r.desc || r.name,
      source: r.source || 'community',
      category: (r.category as MarketPlugin['category']) || 'dev',
      skillUrl: r.skillUrl,
    };
  }, []);

  /**
   * 拉取远程插件目录并整体替换市场数据源。
   * - 成功且非空 → 用远程条目替换内置目录,离线标记关闭
   * - 失败/未配置/空 → 回退内置目录,离线标记开启
   * - notify=true 时对结果 Toast(手动刷新场景)
   */
  const loadCatalog = useCallback(
    async (notify: boolean) => {
      setRefreshingCatalog(true);
      try {
        const registry: RemoteRegistry = await pluginsApi.getRegistry();
        const remote = (registry.plugins || [])
          .map(toMarketPlugin)
          .filter((p): p is MarketPlugin => p !== null);
        if (remote.length > 0) {
          setCatalogPlugins(remote);
          setOfflineMode(false);
          if (notify) {
            showToast(t('pluginMarket.registryUpdated'), { type: 'success', duration: 2000 });
          }
        } else {
          // 远程可达但目录为空/未配置 → 回退内置并标记离线
          setCatalogPlugins(MARKET_PLUGINS);
          setOfflineMode(true);
          if (notify) {
            showToast(t('pluginMarket.noRemotePlugins'), { type: 'warning', duration: 2500 });
          }
        }
      } catch (e) {
        // 拉取失败(网络/代理/超时)→ 回退内置并标记离线
        console.warn('[PluginMarket] 拉取远程目录失败,回退内置目录:', e);
        setCatalogPlugins(MARKET_PLUGINS);
        setOfflineMode(true);
        if (notify) {
          showToast(t('pluginMarket.offlineMode'), { type: 'warning', duration: 3000 });
        }
      } finally {
        setRefreshingCatalog(false);
      }
    },
    [toMarketPlugin, t],
  );

  // 打开市场时自动拉取远程目录(静默,失败回退内置)
  useEffect(() => {
    void loadCatalog(false);
  }, [loadCatalog]);

  useEffect(() => {
    void reloadInstalled();
  }, [reloadInstalled]);

  useEffect(() => {
    if (showInstalled) {
      void reloadInstalled();
    }
  }, [showInstalled, reloadInstalled]);

  const closePreview = useCallback(() => {
    setPreviewing(null);
    setPreviewContent(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

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

  const filteredPlugins = useMemo<MarketPlugin[]>(() => {
    return catalogPlugins.filter((p) => {
      const matchQuery =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t(p.desc).toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === DEFAULT_CATEGORY_LABEL || p.category === activeCategory;
      const matchType = typeFilter === 'all' || p.type === typeFilter;
      return matchQuery && matchCat && matchType;
    });
  }, [searchQuery, activeCategory, typeFilter, t, catalogPlugins]);

  const filteredBySource = useMemo<MarketPlugin[]>(() => {
    if (!activeSource) return [];
    return catalogPlugins.filter((p) => {
      const matchSource = p.source.includes(activeSource.id);
      const matchQuery =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t(p.desc).toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === DEFAULT_CATEGORY_LABEL || p.category === activeCategory;
      const matchType = typeFilter === 'all' || p.type === typeFilter;
      return matchSource && matchQuery && matchCat && matchType;
    });
  }, [activeSource, searchQuery, activeCategory, typeFilter, t, catalogPlugins]);

  const isInstalled = useCallback(
    (p: MarketPlugin): boolean =>
      p.type === 'skill' ? installedSkillNames.has(normalizeName(p.id)) : installedMcpIds.has(p.id),
    [installedSkillNames, installedMcpIds],
  );

  /** 安装插件(skill fetch+create;mcp 写 config) */
  const handleInstall = useCallback(
    async (plugin: MarketPlugin) => {
      const confirmKey = plugin.type === 'skill' ? 'pluginMarket.confirmInstall' : 'pluginMarket.confirmInstallMcp';
      if (!window.confirm(t(confirmKey, { name: plugin.name, source: plugin.source }))) return;
      setInstalling((prev) => new Set(prev).add(plugin.id));
      try {
        if (plugin.type === 'skill') {
          const resp = await fetch(plugin.skillUrl!);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const content = await resp.text();
          const result = await skillsApi.create({
            name: plugin.name,
            description: t(plugin.desc),
            scope: 'user',
            content,
          });
          if (result.success) {
            showToast(t('pluginMarket.installSuccess', { name: plugin.name }), { type: 'success', duration: 2000 });
            await reloadInstalled();
            emitEvent('skills:changed', { name: plugin.name, action: 'install' });
          } else {
            showToast(t('pluginMarket.installFailed') + (result.message || t('settingsPage.skillsUnknownError')), {
              type: 'error',
              duration: 3000,
            });
          }
        } else {
          // mcp:追加 server 到 config.mcp.servers
          const cfg = await configApi.getFull();
          const servers = cfg?.mcp?.servers || [];
          if (servers.some((s) => s.id === plugin.mcp!.id)) {
            showToast(t('pluginMarket.alreadyInstalledMcp', { name: plugin.name }), { type: 'warning', duration: 2500 });
            return;
          }
          const server: McpServerConfigSection = {
            id: plugin.mcp!.id,
            name: plugin.mcp!.name,
            type: plugin.mcp!.type,
            command: plugin.mcp!.command ?? '',
            args: plugin.mcp!.args ?? [],
            url: plugin.mcp!.url ?? '',
            env: plugin.mcp!.env ?? {},
            auto_register_tools: plugin.mcp!.auto_register_tools ?? true,
          };
          const base = cfg?.mcp;
          const mcp: McpConfigSection = {
            enabled: base?.enabled ?? true,
            auto_connect: base?.auto_connect ?? true,
            auto_reconnect: base?.auto_reconnect ?? true,
            max_reconnect_attempts: base?.max_reconnect_attempts ?? 5,
            reconnect_delay_seconds: base?.reconnect_delay_seconds ?? 5,
            request_timeout: base?.request_timeout ?? 60000,
            servers: [...servers, server],
          };
          const result = await configApi.updateFull({ mcp });
          if (result.success) {
            // 立即触发后端热连接,无需重启;失败不阻断安装流程
            await mcpApi.refresh('connect', plugin.mcp!.id).catch(() => {});
            showToast(t('pluginMarket.installMcpSuccess', { name: plugin.name }), { type: 'success', duration: 3000 });
            await reloadInstalled();
            emitEvent('mcp:changed', { id: plugin.mcp!.id, action: 'install' });
          } else {
            showToast(t('pluginMarket.installFailed') + (result as { message?: string }).message || '', {
              type: 'error',
              duration: 3000,
            });
          }
        }
      } catch (e) {
        console.warn('[PluginMarket] 安装失败:', e);
        showToast(t('pluginMarket.installNetworkError'), { type: 'error', duration: 3000 });
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev);
          next.delete(plugin.id);
          return next;
        });
      }
    },
    [reloadInstalled, t],
  );

  /** 卸载插件(skill 删文件;mcp 从 config 移除) */
  const handleUninstall = useCallback(
    async (item: InstalledPlugin) => {
      const confirmKey = item.type === 'skill' ? 'pluginMarket.uninstallConfirm' : 'pluginMarket.uninstallConfirmMcp';
      if (!window.confirm(t(confirmKey, { name: item.name }))) return;
      try {
        if (item.type === 'skill') {
          const result = await skillsApi.delete(item.filePath);
          if (result.success) {
            showToast(t('pluginMarket.uninstallSuccess', { name: item.name }), { type: 'success', duration: 2000 });
            await reloadInstalled();
            emitEvent('skills:changed', { name: item.name, action: 'uninstall' });
          } else {
            showToast(t('pluginMarket.uninstallFailed') + (result.message || t('settingsPage.skillsUnknownError')), {
              type: 'error',
              duration: 3000,
            });
          }
        } else {
          // mcp:从 config.mcp.servers 移除该 id
          const cfg = await configApi.getFull();
          const servers = (cfg?.mcp?.servers || []).filter((s) => s.id !== item.id);
          const base = cfg?.mcp;
          const mcp: McpConfigSection = {
            enabled: base?.enabled ?? true,
            auto_connect: base?.auto_connect ?? true,
            auto_reconnect: base?.auto_reconnect ?? true,
            max_reconnect_attempts: base?.max_reconnect_attempts ?? 5,
            reconnect_delay_seconds: base?.reconnect_delay_seconds ?? 5,
            request_timeout: base?.request_timeout ?? 60000,
            servers,
          };
          const result = await configApi.updateFull({ mcp });
          if (result.success) {
            // 立即触发后端热断开并注销工具,无需重启;失败不阻断卸载流程
            await mcpApi.refresh('disconnect', item.id).catch(() => {});
            showToast(t('pluginMarket.uninstallMcpSuccess', { name: item.name }), { type: 'success', duration: 3000 });
            await reloadInstalled();
            emitEvent('mcp:changed', { id: item.id, action: 'uninstall' });
          } else {
            showToast(t('pluginMarket.uninstallFailed') + (result as { message?: string }).message || '', {
              type: 'error',
              duration: 3000,
            });
          }
        }
      } catch (e) {
        console.warn('[PluginMarket] 卸载失败:', e);
        showToast(t('pluginMarket.uninstallRetry'), { type: 'error', duration: 3000 });
      }
    },
    [reloadInstalled, t],
  );

  /** 预览插件 */
  const handlePreview = useCallback(
    async (plugin: MarketPlugin) => {
      setPreviewing(plugin);
      setPreviewContent(null);
      setPreviewError(null);
      setPreviewLoading(true);
      try {
        if (plugin.type === 'skill') {
          const resp = await fetch(plugin.skillUrl!);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          setPreviewContent(await resp.text());
        } else {
          setPreviewContent(JSON.stringify(plugin.mcp, null, 2));
        }
      } catch (e) {
        setPreviewError(t('pluginMarket.loadFailed'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [t],
  );

  const handleCategoryClick = (label: string) => {
    if (showInstalled) {
      setShowInstalled(false);
      setActiveSource(null);
    }
    setActiveCategory(label);
  };

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
    <div className="plugin-market-container" role="dialog" aria-label={t('pluginMarket.title')}>
      <header className="plugin-market-header">
        <div>
          <h2 className="plugin-market-title">{t('pluginMarket.title')}</h2>
          <span className="plugin-market-subtitle">{t('pluginMarket.subtitle')}</span>
        </div>
        <div className="plugin-market-header-actions">
          {offlineMode && (
            <span className="plugin-market-offline" title={t('pluginMarket.offlineMode')}>
              {t('pluginMarket.offlineTitle')}
            </span>
          )}
          <button
            type="button"
            className="plugin-market-refresh"
            title={t('pluginMarket.refresh')}
            disabled={refreshingCatalog}
            onClick={() => void loadCatalog(true)}
          >
            {refreshingCatalog ? (
              <span className="plugin-market-refresh-spin">⟳</span>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
          </button>
          <button type="button" className="plugin-market-close" title={t('pluginMarket.closeEsc')} onClick={onClose}>
            ✕
          </button>
        </div>
      </header>

      <div className="plugin-market-body">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <TypeTabs value={typeFilter} onChange={setTypeFilter} />

        <CategoryTabs
          activeCategory={activeCategory}
          showInstalled={showInstalled}
          onCategoryClick={handleCategoryClick}
          onInstalledClick={handleInstalledClick}
        />

        <div className="plugin-market-content">
          {showInstalled ? (
            <InstalledPluginsList
              plugins={installedPlugins}
              onUninstall={handleUninstall}
              onPreview={(item) => {
                const plugin = catalogPlugins.find((p) => p.id === item.id);
                if (plugin) {
                  void handlePreview(plugin);
                } else if (item.type === 'skill') {
                  void handlePreview({
                    id: item.id,
                    type: 'skill',
                    name: item.name,
                    desc: 'pluginMarket.skill.generic',
                    source: 'anthropic',
                    category: 'dev',
                    skillUrl: `/api/file/raw?path=${encodeURIComponent(item.filePath)}`,
                  });
                }
              }}
            />
          ) : activeSource ? (
            <SourceDetail
              source={activeSource}
              plugins={filteredBySource}
              onBack={() => setActiveSource(null)}
              isInstalled={isInstalled}
              installing={installing}
              onInstall={handleInstall}
              onPreview={handlePreview}
            />
          ) : (
            <>
              {activeCategory === DEFAULT_CATEGORY_LABEL && <SourcesSection sources={PLUGIN_SOURCES} />}
              <FeaturedSection
                plugins={filteredPlugins}
                isInstalled={isInstalled}
                installing={installing}
                onInstall={handleInstall}
                onPreview={handlePreview}
              />
            </>
          )}
        </div>
      </div>

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

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-search">
      <svg className="plugin-market-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className="plugin-market-search-input"
        type="text"
        placeholder={t('pluginMarket.searchPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="plugin-market-search-clear" title={t('pluginMarket.clearSearch')} onClick={() => onChange('')}>
          ✕
        </button>
      )}
    </div>
  );
}

// ============================================================================
// TypeTabs(类型筛选:全部 / 技能 / MCP)
// ============================================================================

type TypeFilter = MarketPluginType | 'all';

function TypeTabs({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  const { t } = useI18n();
  const options: { value: TypeFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'pluginMarket.typeAll' },
    { value: 'skill', labelKey: 'pluginMarket.typeSkill' },
    { value: 'mcp', labelKey: 'pluginMarket.typeMcp' },
  ];
  return (
    <div className="plugin-market-types">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`plugin-market-type-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// CategoryTabs
// ============================================================================

function CategoryTabs({
  activeCategory,
  showInstalled,
  onCategoryClick,
  onInstalledClick,
}: {
  activeCategory: string;
  showInstalled: boolean;
  onCategoryClick: (label: string) => void;
  onInstalledClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-cats">
      <button
        type="button"
        className={`plugin-market-cat-btn plugin-market-installed-btn${showInstalled ? ' active' : ''}`}
        onClick={onInstalledClick}
      >
        {t('pluginMarket.installed')}
      </button>
      <span className="plugin-market-cats-divider" />
      {PLUGIN_CATEGORIES.map((cat) => {
        const active = cat.label === activeCategory && !showInstalled;
        return (
          <button
            key={cat.key}
            type="button"
            className={`plugin-market-cat-btn plugin-market-cat-filter${active ? ' active' : ''}`}
            onClick={() => onCategoryClick(cat.label)}
          >
            {t(`pluginMarket.${cat.key}`)}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SourcesSection(推荐来源仓库)
// ============================================================================

function SourcesSection({ sources }: { sources: PluginSource[] }) {
  const { t } = useI18n();
  return (
    <section className="plugin-market-section">
      <h3 className="plugin-market-section-title">{t('pluginMarket.sources')}</h3>
      <div className="plugin-market-sources">
        {sources.map((src) => (
          <div key={src.id} className="plugin-market-source-card">
            <div className="plugin-market-source-info">
              <div className="plugin-market-source-name">
                {src.name}
                <span className={`plugin-market-source-tag tag-${src.tag}`}>{t(TAG_KEY[src.tag] || 'pluginMarket.tag.featured')}</span>
              </div>
              <a className="plugin-market-source-github" href={src.url} target="_blank" rel="noreferrer" title={t('pluginMarket.viewOnGithub')}>
                ↗
              </a>
            </div>
            <div className="plugin-market-source-desc">{t(`pluginMarket.source.${src.id}`)}</div>
            {src.stars !== '—' && <div className="plugin-market-source-stars">★ {src.stars}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// SourceDetail(浏览某仓库的插件列表)
// ============================================================================

function SourceDetail({
  source,
  plugins,
  onBack,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: {
  source: PluginSource;
  plugins: MarketPlugin[];
  onBack: () => void;
  isInstalled: (p: MarketPlugin) => boolean;
  installing: Set<string>;
  onInstall: (p: MarketPlugin) => void;
  onPreview: (p: MarketPlugin) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-source-detail">
      <div className="plugin-market-source-back">
        <button type="button" className="plugin-market-btn plugin-market-btn-ghost" onClick={onBack}>
          {t('pluginMarket.backToList')}
        </button>
        <span className="plugin-market-source-detail-title">{source.name}</span>
      </div>
      {plugins.length === 0 ? (
        <div className="plugin-market-empty">{t('pluginMarket.noMatchSource')}</div>
      ) : (
        <PluginGrid plugins={plugins} isInstalled={isInstalled} installing={installing} onInstall={onInstall} onPreview={onPreview} />
      )}
    </div>
  );
}

// ============================================================================
// FeaturedSection(精选插件)
// ============================================================================

function FeaturedSection({
  plugins,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: {
  plugins: MarketPlugin[];
  isInstalled: (p: MarketPlugin) => boolean;
  installing: Set<string>;
  onInstall: (p: MarketPlugin) => void;
  onPreview: (p: MarketPlugin) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="plugin-market-section">
      <h3 className="plugin-market-section-title">{t('pluginMarket.featured')}</h3>
      {plugins.length === 0 ? (
        <div className="plugin-market-empty">{t('pluginMarket.noMatch')}</div>
      ) : (
        <PluginGrid plugins={plugins} isInstalled={isInstalled} installing={installing} onInstall={onInstall} onPreview={onPreview} />
      )}
    </section>
  );
}

// ============================================================================
// PluginGrid(插件卡片网格)
// ============================================================================

function PluginGrid({
  plugins,
  isInstalled,
  installing,
  onInstall,
  onPreview,
}: {
  plugins: MarketPlugin[];
  isInstalled: (p: MarketPlugin) => boolean;
  installing: Set<string>;
  onInstall: (p: MarketPlugin) => void;
  onPreview: (p: MarketPlugin) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-grid">
      {plugins.map((plugin) => {
        const installed = isInstalled(plugin);
        const installingThis = installing.has(plugin.id);
        return (
          <div
            key={plugin.id}
            className="plugin-market-skill-card"
            tabIndex={0}
            onClick={() => onPreview(plugin)}
          >
            <div className="plugin-market-skill-row">
              <div className="plugin-market-skill-text">
                <div className="plugin-market-skill-name">
                  {plugin.name}
                  {plugin.type === 'mcp' && <span className="plugin-market-type-badge">MCP</span>}
                </div>
                <div className="plugin-market-skill-desc">{t(plugin.desc)}</div>
              </div>
              <button
                type="button"
                className={`plugin-market-plus-btn${installed ? ' installed' : ''}`}
                title={installed ? t('pluginMarket.installed') : t('pluginMarket.install')}
                disabled={installingThis || installed}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!installed) void onInstall(plugin);
                }}
              >
                {installed ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 8 7 12 13 4" />
                  </svg>
                ) : installingThis ? (
                  <span className="plugin-market-plus-loading">…</span>
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
// InstalledPluginsList(已安装插件)
// ============================================================================

function InstalledPluginsList({
  plugins,
  onUninstall,
  onPreview,
}: {
  plugins: InstalledPlugin[];
  onUninstall: (p: InstalledPlugin) => void;
  onPreview: (p: InstalledPlugin) => void;
}) {
  const { t } = useI18n();
  if (plugins.length === 0) {
    return (
      <div className="plugin-market-empty">
        {t('pluginMarket.noPlugins')}
        <span className="plugin-market-empty-hint">{t('pluginMarket.goInstall')}</span>
      </div>
    );
  }

  const skills = plugins.filter((p) => p.type === 'skill');
  const mcpList = plugins.filter((p) => p.type === 'mcp');

  return (
    <div className="plugin-market-installed">
      <div className="plugin-market-installed-summary">
        <span dangerouslySetInnerHTML={{ __html: t('pluginMarket.installedCount', { count: plugins.length }) }} />
      </div>
      {mcpList.length > 0 && (
        <InstalledGroup label={t('pluginMarket.groupMcp')} plugins={mcpList} onUninstall={onUninstall} onPreview={onPreview} />
      )}
      {skills.length > 0 && (
        <InstalledGroup label={t('pluginMarket.groupSkills')} plugins={skills} onUninstall={onUninstall} onPreview={onPreview} />
      )}
    </div>
  );
}

function InstalledGroup({
  label,
  plugins,
  onUninstall,
  onPreview,
}: {
  label: string;
  plugins: InstalledPlugin[];
  onUninstall: (p: InstalledPlugin) => void;
  onPreview: (p: InstalledPlugin) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-installed-group">
      <div className="plugin-market-installed-group-header">
        <span className="plugin-market-installed-group-label">{label}</span>
        <span className="plugin-market-installed-group-count">{plugins.length}</span>
      </div>
      <div className="plugin-market-installed-list">
        {plugins.map((plugin) => (
          <div
            key={`${plugin.type}-${plugin.id}`}
            className="plugin-market-installed-item"
            tabIndex={0}
            onClick={() => onPreview(plugin)}
          >
            <div className="plugin-market-installed-item-info">
              <div className="plugin-market-installed-item-name">{plugin.name}</div>
              {plugin.description && <div className="plugin-market-installed-item-meta">{plugin.description}</div>}
            </div>
            <button
              type="button"
              className="plugin-market-btn plugin-market-btn-ghost plugin-market-btn-uninstall"
              title={t('pluginMarket.uninstall')}
              onClick={(e) => {
                e.stopPropagation();
                onUninstall(plugin);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PreviewModal(预览插件内容)
// ============================================================================

function PreviewModal({
  name,
  content,
  loading,
  error,
  onClose,
}: {
  name: string;
  content: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="plugin-market-preview-modal" role="dialog" aria-label={t('pluginMarket.previewAria', { name })}>
      <div className="plugin-market-preview-backdrop" onClick={onClose} />
      <div className="plugin-market-preview-panel">
        <div className="plugin-market-preview-header">
          <span className="plugin-market-preview-title">{name}</span>
          <button type="button" className="plugin-market-preview-close" title={t('pluginMarket.previewClose')} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="plugin-market-preview-body">
          {loading ? (
            <div className="plugin-market-preview-loading">{t('pluginMarket.loading')}</div>
          ) : error ? (
            <div className="plugin-market-preview-error">{error}</div>
          ) : (
            <pre className="plugin-market-preview-code">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}