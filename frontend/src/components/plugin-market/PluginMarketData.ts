/**
 * PluginMarketData - 插件市场数据源常量
 *
 * 由原 SkillMarketData 扩展而来：市场条目同时支持「技能(skill)」和「MCP 插件(mcp)」。
 *
 * - skill 条目：复用原 FEATURED_SKILLS；安装时 fetch skillUrl 内容 → skillsApi.create 写入本地用户级目录。
 * - mcp 条目：type='mcp'，携带完整 MCP server 配置；安装时通过 configApi.updateFull({mcp}) 写入 config.yaml 的 mcp.servers。
 *
 * 说明：desc / source 等展示字段存储为 i18n key（见 frontend/src/i18n/messages.ts 的 pluginMarket.*），
 * 渲染时经 useI18n().t() 翻译。
 */

/** 分类筛选 key(对应 messages.ts 中 pluginMarket.* 分类 key) */
export type PluginCategoryKey = 'all' | 'dev' | 'frontend' | 'security' | 'devops' | 'data';

/** 来源标记 tag(i18n key: pluginMarket.tag.*) */
export type PluginTagKey = 'official' | 'community' | 'vendor' | 'featured';

/** 插件类型 */
export type MarketPluginType = 'skill' | 'mcp' | 'package';

/** 推荐来源仓库 */
export interface PluginSource {
  id: string;
  name: string;
  stars: string;
  /** i18n key(如 pluginMarket.source.anthropic) */
  desc: string;
  url: string;
  /** i18n key(如 pluginMarket.tag.official = "官方") */
  tag: PluginTagKey;
}

/**
 * 市场插件条目。
 * type='skill' 时用 skillUrl；type='mcp' 时用 mcp(字段对齐后端 McpServerConfigSection)。
 */
export interface MarketPlugin {
  /** 唯一 id；skill 用 name，mcp 用 server id */
  id: string;
  type: MarketPluginType;
  name: string;
  /** i18n key(如 pluginMarket.skill.codeReview / pluginMarket.mcp.memory) */
  desc: string;
  /** 来源仓库 id(对应 PluginSource.id) */
  source: string;
  /** 显示分类 key(对应 PluginCategory.key) */
  category: Exclude<PluginCategoryKey, 'all'>;
  /** type='skill' 专用：安装 URL(GitHub raw 或本地 featured 路径) */
  skillUrl?: string;
  /** type='mcp' 专用：MCP server 配置(字段对齐 McpServerConfigSection) */
  mcp?: {
    id: string;
    name: string;
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    auto_register_tools?: boolean;
  };
  /** type='package' 专用：标准插件包(Agent Plugins 1.0)下载地址 */
  downloadUrl?: string;
}

/** 分类标签 */
export interface PluginCategory {
  /** 用于过滤匹配的 key */
  key: PluginCategoryKey;
  /** 显示标签 key(渲染时翻译为 pluginMarket.<label>) */
  label: PluginCategoryKey;
}

/** 推荐来源仓库(含官方技能仓库 + MCP servers 仓库) */
export const PLUGIN_SOURCES: PluginSource[] = [
  {
    id: 'anthropic',
    name: 'anthropics/skills',
    stars: '60.9k',
    desc: 'pluginMarket.source.anthropic',
    url: 'https://github.com/anthropics/skills',
    tag: 'official',
  },
  {
    id: 'modelcontextprotocol',
    name: 'modelcontextprotocol/servers',
    stars: '—',
    desc: 'pluginMarket.source.mcp',
    url: 'https://github.com/modelcontextprotocol/servers',
    tag: 'official',
  },
  {
    id: 'aas',
    name: 'antigravity-awesome-skills',
    stars: '41k+',
    desc: 'pluginMarket.source.aas',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    tag: 'community',
  },
  {
    id: 'vercel',
    name: 'vercel-labs/agent-skills',
    stars: '—',
    desc: 'pluginMarket.source.vercel',
    url: 'https://github.com/vercel-labs/agent-skills',
    tag: 'vendor',
  },
  {
    id: 'addyosmani',
    name: 'addyosmani/agent-skills',
    stars: '—',
    desc: 'pluginMarket.source.addyosmani',
    url: 'https://github.com/addyosmani/agent-skills',
    tag: 'featured',
  },
];

/**
 * 市场插件(技能 + MCP)。
 * 技能条目对齐原 FEATURED_SKILLS；MCP 条目为 stdio 类型、npx 启动、无必填参数的官方 server。
 */
export const MARKET_PLUGINS: MarketPlugin[] = [
  // ---- 技能 ----
  {
    id: 'code-review',
    type: 'skill',
    name: 'code-review',
    desc: 'pluginMarket.skill.codeReview',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/code-review.md',
  },
  {
    id: 'tdd-workflow',
    type: 'skill',
    name: 'tdd-workflow',
    desc: 'pluginMarket.skill.tddWorkflow',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/tdd-workflow.md',
  },
  {
    id: 'debugging',
    type: 'skill',
    name: 'debugging',
    desc: 'pluginMarket.skill.debugging',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/debugging.md',
  },
  {
    id: 'security-audit',
    type: 'skill',
    name: 'security-audit',
    desc: 'pluginMarket.skill.securityAudit',
    source: 'addyosmani',
    category: 'security',
    skillUrl: '/skills/featured/security-audit.md',
  },
  {
    id: 'api-design',
    type: 'skill',
    name: 'api-design',
    desc: 'pluginMarket.skill.apiDesign',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/api-design.md',
  },
  {
    id: 'performance',
    type: 'skill',
    name: 'performance',
    desc: 'pluginMarket.skill.performance',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/performance.md',
  },
  {
    id: 'devops',
    type: 'skill',
    name: 'devops',
    desc: 'pluginMarket.skill.devops',
    source: 'addyosmani',
    category: 'devops',
    skillUrl: '/skills/featured/devops.md',
  },
  {
    id: 'react-patterns',
    type: 'skill',
    name: 'react-patterns',
    desc: 'pluginMarket.skill.reactPatterns',
    source: 'vercel',
    category: 'frontend',
    skillUrl: '/skills/featured/react-patterns.md',
  },
  {
    id: 'database-design',
    type: 'skill',
    name: 'database-design',
    desc: 'pluginMarket.skill.databaseDesign',
    source: 'aas',
    category: 'data',
    skillUrl: '/skills/featured/database-design.md',
  },
  {
    id: 'incremental-implementation',
    type: 'skill',
    name: 'incremental-implementation',
    desc: 'pluginMarket.skill.incrementalImplementation',
    source: 'addyosmani',
    category: 'dev',
    skillUrl: '/skills/featured/incremental-implementation.md',
  },

  // ---- MCP 插件 ----
  {
    id: 'mcp-memory',
    type: 'mcp',
    name: 'memory',
    desc: 'pluginMarket.mcp.memory',
    source: 'modelcontextprotocol',
    category: 'data',
    mcp: {
      id: 'mcp-memory',
      name: 'Memory',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-fetch',
    type: 'mcp',
    name: 'fetch',
    desc: 'pluginMarket.mcp.fetch',
    source: 'modelcontextprotocol',
    category: 'dev',
    mcp: {
      id: 'mcp-fetch',
      name: 'Fetch',
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-server-fetch-typescript'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-playwright',
    type: 'mcp',
    name: 'playwright',
    desc: 'pluginMarket.mcp.playwright',
    source: 'modelcontextprotocol',
    category: 'devops',
    mcp: {
      id: 'mcp-playwright',
      name: 'Playwright',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-git',
    type: 'mcp',
    name: 'git',
    desc: 'pluginMarket.mcp.git',
    source: 'modelcontextprotocol',
    category: 'dev',
    mcp: {
      id: 'mcp-git',
      name: 'Git',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@cyanheads/git-mcp-server'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-filesystem',
    type: 'mcp',
    name: 'filesystem',
    desc: 'pluginMarket.mcp.filesystem',
    source: 'modelcontextprotocol',
    category: 'dev',
    mcp: {
      id: 'mcp-filesystem',
      name: 'Filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-github',
    type: 'mcp',
    name: 'github',
    desc: 'pluginMarket.mcp.github',
    source: 'modelcontextprotocol',
    category: 'dev',
    mcp: {
      id: 'mcp-github',
      name: 'GitHub',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      auto_register_tools: true,
    },
  },
  {
    id: 'mcp-postgres',
    type: 'mcp',
    name: 'postgres',
    desc: 'pluginMarket.mcp.postgres',
    source: 'modelcontextprotocol',
    category: 'data',
    mcp: {
      id: 'mcp-postgres',
      name: 'PostgreSQL',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      auto_register_tools: true,
    },
  },
];

/** 分类标签(对齐原 SKILL_CATEGORIES) */
export const PLUGIN_CATEGORIES: PluginCategory[] = [
  { key: 'all', label: 'all' },
  { key: 'dev', label: 'dev' },
  { key: 'frontend', label: 'frontend' },
  { key: 'security', label: 'security' },
  { key: 'devops', label: 'devops' },
  { key: 'data', label: 'data' },
];

/** 默认分类 key(对应 PLUGIN_CATEGORIES[0].label) */
export const DEFAULT_CATEGORY_LABEL = PLUGIN_CATEGORIES[0].label;