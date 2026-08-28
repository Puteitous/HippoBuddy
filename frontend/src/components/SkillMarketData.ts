/**
 * SkillMarketData - 技能市场数据源常量
 *
 * 从旧版 components/SkillMarket.js 顶部提取,避免组件文件膨胀。
 *
 * 来源:社区知名仓库的精选技能,内置避免 GitHub API 网络依赖。
 * skillUrl 指向 GitHub raw 文件(或本地 /skills/featured/xxx.md),
 * 安装时通过 fetch 拉取内容,再调 skillsApi.create 写入本地用户级目录。
 *
 * 说明:desc / tag / category 等展示字段存储为 i18n key(见 frontend/src/i18n/messages.ts),
 * 渲染时经 useI18n().t() 翻译,中文回退为 key 容器内的中文文案。
 */

/** 分类筛选 key(对应 messages.ts 中 skillMarket.* 分类 key) */
export type SkillCategoryKey = 'all' | 'dev' | 'frontend' | 'security' | 'devops' | 'data';

/** 来源标记 tag(i18n key: skillMarket.tag.*) */
export type SkillTagKey = 'official' | 'community' | 'vendor' | 'featured';

/** 推荐来源仓库 */
export interface SkillSource {
  id: string;
  name: string;
  stars: string;
  /** i18n key(如 skillMarket.source.anthropic) */
  desc: string;
  url: string;
  /** i18n key(如 skillMarket.tag.official = "官方") */
  tag: SkillTagKey;
}

/** 精选技能(可直接安装) */
export interface FeaturedSkill {
  name: string;
  /** i18n key(如 skillMarket.skill.codeReview) */
  desc: string;
  /** 来源仓库 id(对应 SkillSource.id) */
  source: string;
  /** 显示分类 key(对应 SkillCategory.key,渲染时翻译为 skillMarket.<key>) */
  category: Exclude<SkillCategoryKey, 'all'>;
  /** 安装 URL(GitHub raw 或本地 featured 路径) */
  skillUrl: string;
}

/** 分类标签 */
export interface SkillCategory {
  /** 用于过滤匹配的 key */
  key: SkillCategoryKey;
  /** 显示标签 key(渲染时翻译为 skillMarket.<label>) */
  label: SkillCategoryKey;
}

/** 推荐来源仓库(对齐旧版 SOURCES) */
export const SKILL_SOURCES: SkillSource[] = [
  {
    id: 'anthropic',
    name: 'anthropics/skills',
    stars: '60.9k',
    desc: 'skillMarket.source.anthropic',
    url: 'https://github.com/anthropics/skills',
    tag: 'official',
  },
  {
    id: 'aas',
    name: 'antigravity-awesome-skills',
    stars: '41k+',
    desc: 'skillMarket.source.aas',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    tag: 'community',
  },
  {
    id: 'vercel',
    name: 'vercel-labs/agent-skills',
    stars: '—',
    desc: 'skillMarket.source.vercel',
    url: 'https://github.com/vercel-labs/agent-skills',
    tag: 'vendor',
  },
  {
    id: 'addyosmani',
    name: 'addyosmani/agent-skills',
    stars: '—',
    desc: 'skillMarket.source.addyosmani',
    url: 'https://github.com/addyosmani/agent-skills',
    tag: 'featured',
  },
];

/** 精选技能(对齐旧版 FEATURED_SKILLS) */
export const FEATURED_SKILLS: FeaturedSkill[] = [
  {
    name: 'code-review',
    desc: 'skillMarket.skill.codeReview',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/code-review.md',
  },
  {
    name: 'tdd-workflow',
    desc: 'skillMarket.skill.tddWorkflow',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/tdd-workflow.md',
  },
  {
    name: 'debugging',
    desc: 'skillMarket.skill.debugging',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/debugging.md',
  },
  {
    name: 'security-audit',
    desc: 'skillMarket.skill.securityAudit',
    source: 'addyosmani',
    category: 'security',
    skillUrl: '/skills/featured/security-audit.md',
  },
  {
    name: 'api-design',
    desc: 'skillMarket.skill.apiDesign',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/api-design.md',
  },
  {
    name: 'performance',
    desc: 'skillMarket.skill.performance',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/performance.md',
  },
  {
    name: 'devops',
    desc: 'skillMarket.skill.devops',
    source: 'addyosmani',
    category: 'devops',
    skillUrl: '/skills/featured/devops.md',
  },
  {
    name: 'react-patterns',
    desc: 'skillMarket.skill.reactPatterns',
    source: 'vercel',
    category: 'frontend',
    skillUrl: '/skills/featured/react-patterns.md',
  },
  {
    name: 'database-design',
    desc: 'skillMarket.skill.databaseDesign',
    source: 'aas',
    category: 'data',
    skillUrl: '/skills/featured/database-design.md',
  },
  {
    name: 'incremental-implementation',
    desc: 'skillMarket.skill.incrementalImplementation',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/incremental-implementation.md',
  },
];

/** 分类标签(对齐旧版 CATEGORIES) */
export const SKILL_CATEGORIES: SkillCategory[] = [
  { key: 'all', label: 'all' },
  { key: 'dev', label: 'dev' },
  { key: 'frontend', label: 'frontend' },
  { key: 'security', label: 'security' },
  { key: 'devops', label: 'devops' },
  { key: 'data', label: 'data' },
];

/** 默认分类 key(对应旧版 CATEGORIES[0].label) */
export const DEFAULT_CATEGORY_LABEL = SKILL_CATEGORIES[0].label;