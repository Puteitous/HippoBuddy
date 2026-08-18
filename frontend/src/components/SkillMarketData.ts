/**
 * SkillMarketData - 技能市场数据源常量
 *
 * 从旧版 components/SkillMarket.js 顶部提取,避免组件文件膨胀。
 *
 * 来源:社区知名仓库的精选技能,内置避免 GitHub API 网络依赖。
 * skillUrl 指向 GitHub raw 文件(或本地 /skills/featured/xxx.md),
 * 安装时通过 fetch 拉取内容,再调 skillsApi.create 写入本地用户级目录。
 */

/** 推荐来源仓库 */
export interface SkillSource {
  id: string;
  name: string;
  stars: string;
  desc: string;
  url: string;
  tag: '官方' | '社区' | '大厂' | '精选';
}

/** 精选技能(可直接安装) */
export interface FeaturedSkill {
  name: string;
  desc: string;
  /** 来源仓库 id(对应 SkillSource.id) */
  source: string;
  /** 显示分类(对应 SkillCategory.label) */
  category: string;
  /** 安装 URL(GitHub raw 或本地 featured 路径) */
  skillUrl: string;
}

/** 分类标签 */
export interface SkillCategory {
  /** 用于过滤匹配的 key */
  key: 'all' | 'dev' | 'frontend' | 'security' | 'devops' | 'data';
  /** 显示标签 */
  label: string;
}

/** 推荐来源仓库(对齐旧版 SOURCES) */
export const SKILL_SOURCES: SkillSource[] = [
  {
    id: 'anthropic',
    name: 'anthropics/skills',
    stars: '60.9k',
    desc: 'Anthropic 官方技能仓库,Claude 技能生态标准,质量最稳定',
    url: 'https://github.com/anthropics/skills',
    tag: '官方',
  },
  {
    id: 'aas',
    name: 'antigravity-awesome-skills',
    stars: '41k+',
    desc: '社区最大技能集合,1595+ 技能,覆盖全栈/安全/DevOps/数据科学',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    tag: '社区',
  },
  {
    id: 'vercel',
    name: 'vercel-labs/agent-skills',
    stars: '—',
    desc: 'Vercel 团队工程最佳实践,Next.js/React 专项技能',
    url: 'https://github.com/vercel-labs/agent-skills',
    tag: '大厂',
  },
  {
    id: 'addyosmani',
    name: 'addyosmani/agent-skills',
    stars: '—',
    desc: '生产级工程实践:TDD、代码审查、调试、性能优化',
    url: 'https://github.com/addyosmani/agent-skills',
    tag: '精选',
  },
];

/** 精选技能(对齐旧版 FEATURED_SKILLS) */
export const FEATURED_SKILLS: FeaturedSkill[] = [
  {
    name: 'code-review',
    desc: '代码审查 — 五轴审查:正确性/可读性/架构/安全/性能',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/code-review.md',
  },
  {
    name: 'tdd-workflow',
    desc: 'TDD 工作流 — Red → Green → Refactor 全流程引导',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/tdd-workflow.md',
  },
  {
    name: 'debugging',
    desc: '调试与错误恢复 — 六阶段诊断:构建反馈循环到复盘',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/debugging.md',
  },
  {
    name: 'security-audit',
    desc: '安全审计与加固 — OWASP Top 10 检查、漏洞扫描、威胁建模',
    source: 'addyosmani',
    category: '安全',
    skillUrl: '/skills/featured/security-audit.md',
  },
  {
    name: 'api-design',
    desc: 'API 设计 — RESTful 规范、请求验证、错误处理、文档生成',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/api-design.md',
  },
  {
    name: 'performance',
    desc: '性能优化 — 加载性能、渲染优化、数据库查询优化',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/performance.md',
  },
  {
    name: 'devops',
    desc: 'DevOps 实践 — CI/CD 配置、Docker/K8s、监控告警',
    source: 'addyosmani',
    category: 'DevOps',
    skillUrl: '/skills/featured/devops.md',
  },
  {
    name: 'react-patterns',
    desc: 'React 模式 — Hooks 规范、状态管理、性能优化、组件设计',
    source: 'vercel',
    category: '前端',
    skillUrl: '/skills/featured/react-patterns.md',
  },
  {
    name: 'database-design',
    desc: '数据库设计 — 表结构设计、索引优化、迁移策略、ORM 使用',
    source: 'aas',
    category: '数据',
    skillUrl: '/skills/featured/database-design.md',
  },
  {
    name: 'incremental-implementation',
    desc: '增量实施 — 薄垂直切片实现,每步可测试可提交,避免大段一次性编码',
    source: 'addyosmani',
    category: '开发',
    skillUrl: '/skills/featured/incremental-implementation.md',
  },
];

/** 分类标签(对齐旧版 CATEGORIES) */
export const SKILL_CATEGORIES: SkillCategory[] = [
  { key: 'all', label: '全部' },
  { key: 'dev', label: '开发' },
  { key: 'frontend', label: '前端' },
  { key: 'security', label: '安全' },
  { key: 'devops', label: 'DevOps' },
  { key: 'data', label: '数据' },
];

/** 默认分类标签(对应旧版 CATEGORIES[0].label) */
export const DEFAULT_CATEGORY_LABEL = SKILL_CATEGORIES[0].label;
