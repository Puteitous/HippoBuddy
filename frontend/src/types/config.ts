/**
 * /api/config 全量配置类型定义
 *
 * 对齐后端 com.example.agent.config.* 各 Config 类经 Jackson 序列化后的 JSON 结构。
 * 字段名严格使用后端实际返回的 key(经 @JsonProperty 注解的为 snake_case,
 * 未注解的为 Java 字段名 camelCase,如 workspace.defaultWorkspacePath)。
 *
 * 各配置节均为可选(后端可能未配置),业务层读取时需做 ?? 兜底。
 */

// ============================================================================
// Session (对应后端 SessionConfig)
// ============================================================================

export interface SessionConfigSection {
  /** 最大保存会话数(0~1000,0 表示禁用持久化) */
  max_saved_sessions: number;
  /** 是否启用历史会话数量清理(关闭则保留全部历史,不触发超限清理) */
  enable_max_saved_cleanup: boolean;
  /** 清理周期(天) */
  cleanup_period_days: number;
  /** 是否启用后台清理 */
  enable_background_cleanup: boolean;
  /** 墓碑阈值(MB) */
  tombstone_threshold_mb: number;
}

// ============================================================================
// Context (对应后端 ContextConfig)
// ============================================================================

export interface ContextConfigSection {
  /** 上下文窗口最大 token 数 */
  max_tokens: number;
  /** 单工具结果截断上限 */
  per_tool_safe_limit: number;
  /** 全局硬上限 */
  global_hard_limit: number;
  /** 自动执行轮数上限，0 表示不限制 */
  max_agent_turns?: number;
}

// ============================================================================
// Tools (对应后端 ToolsConfig 及内嵌类)
// ============================================================================

export interface BashToolConfigSection {
  enabled: boolean;
  /** 是否需要确认 */
  require_confirmation: boolean;
}

export interface WebSearchConfigSection {
  enabled: boolean;
  /** 搜索服务商:brave/google/bing/searxng/tavily */
  provider: string;
  api_key: string;
}

export interface SubagentToolConfigSection {
  enabled: boolean;
}

export interface DeleteFileToolConfigSection {
  /** 是否需要确认 */
  require_confirmation: boolean;
}

export interface ToolsConfigSection {
  /** 权限范围:strict=仅工作区;balanced=写限工作区、读可出工作区;relaxed=全目录。确认卡片由 bash/delete_file 的 require_confirmation 独立控制 */
  mode?: 'strict' | 'balanced' | 'relaxed';
  bash: BashToolConfigSection;
  /** FileToolConfig 当前为空对象,后端保留扩展位 */
  file: Record<string, unknown>;
  subagent: SubagentToolConfigSection;
  delete_file: DeleteFileToolConfigSection;
  web_search: WebSearchConfigSection;
}

// ============================================================================
// UI (对应后端 UiConfig)
// ============================================================================

export interface UiConfigSection {
  theme: string;
  prompt: string;
  /** 用户自定义系统提示词,按任务模式(coding/chat/office)分存。某模式缺省或空串=未自定义,用该模式内置默认提示词 */
  system_prompts?: Record<string, string>;
  /** Git 面板 AI 生成提交信息所用 system prompt;空=未自定义,用内置默认 */
  git_commit_prompt?: string;
  /** 输入区 AI 优化所用 system prompt;空=未自定义,用内置默认 */
  ai_optimize_prompt?: string;
  syntax_highlight: boolean;
  show_token_usage: boolean;
  show_timestamp: boolean;
  color_output: boolean;
  /** 推荐问答开关:回合结束后是否用 LLM 生成推荐问题 */
  suggestions_enabled?: boolean;
  /** 回合默认展示模式:full=完整展示处理过程;result=只展示最终结果(默认收起) */
  default_process_view: string;
}

// ============================================================================
// Workspace (对应后端 WorkspaceConfig)
//
// 注意:WorkspaceConfig 类未使用 @JsonProperty,直接序列化为 camelCase。
// ============================================================================

export interface WorkspaceConfigSection {
  /** 默认工作区路径 */
  defaultWorkspacePath: string;
}

// ============================================================================
// MCP (对应后端 McpConfig + McpServerConfig)
// ============================================================================

export type McpServerType = 'stdio' | 'sse';

export interface McpServerConfigSection {
  id: string;
  name: string;
  type: McpServerType;
  /** stdio 类型:可执行命令 */
  command: string;
  /** stdio 类型:命令参数 */
  args: string[];
  /** sse 类型:服务端 URL */
  url: string;
  /** stdio 类型:环境变量 */
  env: Record<string, string>;
  /** 是否自动注册工具 */
  auto_register_tools: boolean;
}

export interface McpConfigSection {
  enabled: boolean;
  auto_connect: boolean;
  auto_reconnect: boolean;
  max_reconnect_attempts: number;
  reconnect_delay_seconds: number;
  /** 请求超时(ms) */
  request_timeout: number;
  servers: McpServerConfigSection[];
}

/** 插件目录配置(plugins 节) */
export interface PluginConfigSection {
  /** 远程插件目录 index.json 地址,空串表示仅使用内置目录 */
  registry_url: string;
}

// ============================================================================
// Full Config (GET /api/config)
// ============================================================================

/**
 * GET /api/config 完整配置
 *
 * `llm` 节单独由 /api/config/llm 提供(含 modelHistory),
 * 这里仅占位为 unknown,业务层不要直接读取此字段。
 */
export interface FullConfig {
  llm?: unknown;
  session?: SessionConfigSection;
  context?: ContextConfigSection;
  tools?: ToolsConfigSection;
  ui?: UiConfigSection;
  workspace?: WorkspaceConfigSection;
  mcp?: McpConfigSection;
  plugins?: PluginConfigSection;
}

// ============================================================================
// PUT /api/config 请求体
//
// 后端按出现的节做 readerForUpdating,未出现的节不变。
// 传整个 section 替换该节所有字段。
// ============================================================================

export type UpdateConfigRequest = Partial<
  Pick<FullConfig, 'session' | 'context' | 'tools' | 'ui' | 'workspace' | 'mcp' | 'plugins'>
>;

// ============================================================================
// Skills (对应后端 SkillsApiHandler)
// ============================================================================

/** 目录形态技能附带的一项资源 */
export interface SkillResourceEntry {
  /** 相对技能目录的路径(如 references/api.md) */
  path: string;
  /** 绝对路径 */
  filePath: string;
}

/** 技能项（支持扁平 <name>.md 与目录 <name>/SKILL.md 两种形态） */
export interface SkillEntry {
  /** 统一身份键：扁平=文件名去后缀，目录=目录名 */
  skillId: string;
  /** 是否为目录形态技能（入口 SKILL.md + 同目录资源） */
  isDirectory: boolean;
  /** 入口文件名(扁平如 my-skill.md；目录恒为 SKILL.md) */
  fileName: string;
  /** 技能名 */
  name?: string;
  /** 描述 */
  description?: string;
  /** 入口文件绝对路径 */
  filePath: string;
  /** 目录形态技能的附带资源(扁平技能无此字段) */
  resources?: SkillResourceEntry[];
}

/** GET /api/skills/list 响应 */
export interface SkillsListResponse {
  projectSkills: SkillEntry[];
  userSkills: SkillEntry[];
}

/** GET /api/skills/get 响应 */
export interface SkillGetResponse {
  content: string;
}

/** POST /api/skills/create | /api/skills/update 响应 */
export interface SkillMutationResponse {
  success: boolean;
  message?: string;
  filePath?: string;
}

/** POST /api/skills/import 响应 */
export interface SkillImportResponse {
  success: boolean;
  message?: string;
  /** 落盘时解析出的技能名（仅 .md 导入） */
  name?: string;
  /** 落盘时解析出的描述（仅 .md 导入） */
  description?: string;
  filePath?: string;
  /** zip 导入：安装的技能数 */
  count?: number;
  /** zip 导入：各技能摘要 */
  skills?: { skillId: string; isDirectory: boolean; path?: string }[];
}

// ============================================================================
// Rules (对应后端 RulesApiHandler)
// ============================================================================

export type RuleMode = 'always' | 'manual';
export type RuleSource = 'project' | 'user';

/** 规则项 */
export interface RuleEntry {
  /** 规则名 */
  name: string;
  /** 描述 */
  description?: string;
  /** 生效模式 */
  mode: RuleMode;
  /** 绝对路径 */
  filePath: string;
}

/** GET /api/rules/list 响应(项目规则 + 用户规则) */
export interface RulesListResponse {
  projectRules: RuleEntry[];
  userRules: RuleEntry[];
}

/** GET /api/rules/get 响应 */
export interface RuleGetResponse {
  content: string;
}

/** POST /api/rules/create | /api/rules/update | /api/rules/delete 响应 */
export interface RuleMutationResponse {
  success: boolean;
  message?: string;
  filePath?: string;
}

// ============================================================================
// DataDir (对应后端 DataDirApiHandler,旧 SettingsPanel._fetchDataDir)
// ============================================================================

/** GET /api/settings/data-dir 响应 */
export interface DataDirInfo {
  path: string;
}

/** POST /api/settings/data-dir 请求体 */
export interface UpdateDataDirRequest {
  path: string;
}

/** POST /api/settings/data-dir 响应 */
export interface UpdateDataDirResponse {
  success: boolean;
  path?: string;
  error?: string;
}
