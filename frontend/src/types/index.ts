/**
 * HippoBuddy 前端核心类型定义
 *
 * 类型来源:对齐后端 com.example.agent.web.handler.* 实际返回的 JSON 结构。
 * 所有字段均与后端字段名保持一致(驼峰),便于直接 JSON.parse 后赋值使用。
 */
import type { ToolConfirmationPayload } from './sse';

// ============================================================================
// 会话相关 (对应后端 SessionListBuilder.buildSessionList)
// ============================================================================

/** 会话模式,对应后端 TaskMode 枚举 */
export type SessionMode = 'chat' | 'coding' | 'office';

/** 会话列表项 - GET /api/sessions */
export interface Session {
  id: string;
  messageCount: number;
  /** 创建时间戳(字符串形式,如 "1787046533000") */
  createdAt: string;
  /** 是否在内存中活跃(后端已加载 Conversation) */
  active: boolean;
  /** 是否正在执行 Agent 循环 */
  running: boolean;
  /** 会话标题(优先 custom-title > 首条用户消息截断) */
  title?: string;
  /** 工作区路径(来自 session.json 的 workspacePath) */
  projectPath?: string;
  /** 最后活跃时间(来自 session.json 的 lastActivityAt) */
  lastActivityAt?: string;
  /** 会话模式 */
  mode?: SessionMode;
  /** 是否置顶(来自 session.json 的 pinned;置顶会话在列表最上方独立分区) */
  pinned?: boolean;
}

/** 会话状态 - GET /api/sessions/:id/status */
export interface SessionStatus {
  sessionId: string;
  running: boolean;
}

// ============================================================================
// 消息相关 (对应后端 ConversationJsonlReader.readMessages)
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'tool';

/** 多模态 content 中的单个 part */
export interface ContentPart {
  type: 'text' | 'image_url';
  /** type === 'text' 时存在 */
  text?: string;
  /** type === 'image_url' 时存在 */
  image_url?: {
    /** 已转换为 /api/file/raw?path=... 的 HTTP URL */
    url: string;
  };
}

/** 工具调用(assistant 消息携带) */
export interface ToolCall {
  id: string;
  /** 工具名称(后端将 function.name 提升到顶层) */
  name: string;
  /** JSON 字符串形式的参数 */
  arguments: string;
}

/** 服务端联网搜索动作明细 */
export interface WebSearchAction {
  type: string;
  /** type === 'search' 时存在 */
  queries?: string[];
  /** type === 'open_page' / 'find_in_page' 时存在 */
  url?: string;
  /** type === 'find_in_page' 时存在 */
  pattern?: string;
  /** 动作状态 */
  status?: string;
}

/** 历史消息(从 JSONL 读取) - GET /api/sessions/:id/messages */
export interface Message {
  id: string;
  role: MessageRole;
  /**
   * 仅前端乐观追加(user/ask 等)消息记录服务器真实 id。
   * 乐观消息的 `id` 为 `local-*` 临时值(渲染 key 保持稳定,避免 key 变化重挂重放进场动画),
   * 后端 JSONL 以 `message_id` 事件分配的 uuid 为准;回滚/分叉需用该 uuid 才能定位,
   * 故在此记录 `serverId`,回滚/分叉目标以 `serverId ?? id` 取值。
   */
  serverId?: string;
  /** 消息时间戳(ms,后端 JSONL 写入;缺失时前端用当前时间兜底) */
  timestamp?: number;
  /**
   * 消息内容:
   * - 纯文本时为 string
   * - 多模态(含图片)时为 ContentPart[]
   */
  content: string | ContentPart[];
  /** assistant 的思考过程 */
  reasoning_content?: string;
  /** 标记该 assistant 消息由服务端联网搜索产生 */
  web_searched?: boolean;
  /** 联网搜索动作明细 */
  web_search_actions?: WebSearchAction[];
  /** assistant 消息携带的工具调用列表 */
  tool_calls?: ToolCall[];
  /** role === 'tool' 时:工具名称 */
  toolName?: string;
  /** role === 'tool' 时:对应的 tool_call.id */
  toolCallId?: string;
  /** role === 'tool' 时:工具执行是否成功 */
  success?: boolean;
  /** role === 'tool' 时:前端流式固化的工具参数(如 todo_write 的完整累计树)。
   *  后端历史加载走 tool_calls,故仅前端固化路径使用。 */
  args?: unknown;
}

// ============================================================================
// LLM 配置 (对应后端 ConfigApiHandler)
// ============================================================================

/** 模型历史快照(用于快速切换) */
export interface ModelSnapshot {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyMasked: string;
  maxTokens: number;
  thinkingEnabled: boolean;
  reasoningEffort: string;
}

/** LLM 配置 - GET /api/config/llm */
export interface LlmConfig {
  provider: string;
  model: string;
  baseUrl: string;
  /** API Key 遮掩形式(如 "sk****12") */
  apiKeyMasked: string;
  /** 是否已配置真实 API Key(非占位符) */
  hasApiKey: boolean;
  /** 模型历史快照列表 */
  modelHistory: ModelSnapshot[];
  /** 最大 token 数(完整保存时可选) */
  maxTokens?: number;
  /** 是否开启思考模式 */
  thinkingEnabled?: boolean;
  /** 思考强度(low/medium/high) */
  reasoningEffort?: string;
}

/** PUT /api/config/llm 请求体 */
export interface UpdateLlmConfigRequest {
  provider?: string;
  model?: string;
  baseUrl?: string;
  /** 明文 API Key,包含 "****" 时视为不修改 */
  apiKey?: string;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  /** 编辑历史记录时携带的旧 key(provider:model) */
  editingKey?: string;
}

// ============================================================================
// Token 统计 (对应后端 TokenStatsResponseBuilder)
// ============================================================================

/** 会话 Token 统计 - GET /api/sessions/:id/tokens */
export interface SessionTokenStats {
  currentTokens: number;
  maxTokens: number;
  usagePercent: number;
  messageCount: number;
  hasKnownUsage: boolean;
  /** hasKnownUsage === true 时存在 */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheHitTokens?: number;
  cacheHitRate?: number;
  /** stats != null 时存在(会话累计) */
  sessionTotalInput?: number;
  sessionTotalOutput?: number;
  sessionTotalTokens?: number;
  sessionLlmCalls?: number;
  sessionToolCalls?: number;
  sessionCacheHitTokens?: number;
  sessionCacheHitRate?: number;
}

// ============================================================================
// Chat 请求 (对应后端 ChatApiHandler)
// ============================================================================

/** POST /api/chat 请求体 */
export interface ChatRequest {
  sessionId: string;
  message: string;
  /** 自定义系统提示词 */
  systemPrompt?: string;
  /** 任务模式 */
  mode?: SessionMode;
  /** 编辑某条用户消息时携带其 id */
  editMessageId?: string;
  /** 手动引用的规则 id 列表 */
  selectedRules?: string[];
  /** 用户上传的图片(data: URI 列表) */
  images?: string[];
}

/** 工具确认请求 - POST /api/tool/confirm */
export interface ToolConfirmRequest {
  sessionId: string;
  confirmId: string;
  /** 'allow' 放行 / 其他值拒绝 */
  decision: 'allow' | 'deny';
}

/** 工具中止请求 - POST /api/tool/abort */
export interface ToolAbortRequest {
  sessionId: string;
  /** 可选,携带时同步杀掉对应 bash 进程 */
  toolCallId?: string;
}

// ============================================================================
// 工具调用记录 (chatStore 内部状态,源自 SSE tool_* 事件)
// ============================================================================

/** 工具调用状态 */
export type ToolCallStatus = 'running' | 'success' | 'failed' | 'denied';

/**
 * 工具调用运行时记录
 *
 * 与 Message.tool_calls 的静态 ToolCall 不同,这里聚合 SSE 实时事件:
 * - tool_start 创建记录
 * - tool_progress 累积流式输出(如 bash 逐行)
 * - tool_result 完成记录
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  args?: unknown;
  status: ToolCallStatus;
  /** 流式进度行(tool_progress 累积,如 bash 输出) */
  progress: string[];
  /** 成功结果(tool_result.success === true) */
  result?: string;
  /** 失败原因(tool_result.success === false) */
  error?: string;
  /**
   * 工具确认数据(tool_confirmation 挂载)。
   * 存在时该工具处于"待确认"(pending_confirmation)状态,
   * 由 timeline 行内渲染允许/拒绝,对齐旧版内嵌确认卡片。
   */
  confirmationData?: ToolConfirmationPayload;
  /** 开始时间戳 */
  startedAt: number;
  /** 结束时间戳 */
  endedAt?: number;
}

// ============================================================================
// 工作区 (对应后端 WorkspaceApiHandler)
// ============================================================================

/** GET /api/workspace 返回的当前工作区状态 */
export interface WorkspaceState {
  path: string;
  isDefault: boolean;
}

/** PUT /api/workspace/default 返回的设置结果 */
export interface DefaultWorkspaceUpdateResult {
  path: string;
  /** 设置默认工作区后,当前工作区是否被切换为该默认路径 */
  switched: boolean;
}

// ============================================================================
// ChatPanel 辅助组件 (阶段 3.4: 模式预设 / 引用芯片 / 待发送图片)
// ============================================================================

/** 模式预设项(每个模式 4 个,共 12 个) */
export interface ModePreset {
  /** 显示标签(i18n key,见 chat.preset.*) */
  label: string;
  /** SVG path 数据(viewBox 0 0 24 24,fill=none stroke=currentColor) */
  icon: string;
  /** 点击预设填充到输入框的提示词 */
  prompt: string;
}

/** 引用芯片类型 */
export type RefChipKind = 'file' | 'text' | 'rule';

/** 输入框下方的引用芯片(@path / 选中文本 / 规则) */
export interface RefChip {
  /** 唯一 id(本地生成) */
  id: string;
  kind: RefChipKind;
  /** 显示文本(file: 文件名;text: 截断后的纯文本) */
  text: string;
  /** kind === 'file' / 'rule' 时:相对工作区的文件路径 */
  filePath?: string;
  /** kind === 'file' 且为代码选区时:起始行 */
  startLine?: number;
  /** kind === 'file' 且为代码选区时:结束行 */
  endLine?: number;
  /** kind === 'rule' 时:规则 id */
  ruleId?: string;
  /** 选中文字(代码片段或二进制预览) */
  selectedText?: string;
}

/** 待发送的图片(转换为 base64 data URL 后随 ChatRequest.images 提交) */
export interface PendingImage {
  /** 唯一 id(本地生成) */
  id: string;
  /** base64 data URL(提交给后端 ChatRequest.images) */
  dataUrl: string;
  /** 文件名(用于展示) */
  name: string;
  /** 字节数(用于校验 20MB 上限) */
  size: number;
}

// ============================================================================
// 工作区组件 (阶段 3.5: FileTree / FilePreview / FileDiffView / FileTabs)
// ============================================================================

/** FilePreview 的渲染模式 */
export type FileViewMode = 'preview' | 'diff' | 'web';

/**
 * 工作区打开的文件标签
 *
 * - 默认 mode = 'preview'(只读文本/图片/PDF)
 * - 触发"查看 diff"操作时切换为 'diff'(对接 /api/files/diff)
 * - mode = 'web':内嵌浏览器标签(openWeb 打开,path 存 url 作为唯一 key)
 */
export interface FileTab {
  /** 对应文件绝对路径或 web 标签的 url(唯一键) */
  path: string;
  /** 展示名(文件名去路径前缀,web 标签为 URL 主机名或指定显示名) */
  name: string;
  /** 渲染模式 */
  mode: FileViewMode;
  /** web 标签:当前加载的 URL(仅 mode === 'web' 存在) */
  url?: string;
  /** 可选:打开时定位的起始行(用于工具卡片跳转) */
  startLine?: number;
  /** 可选:打开时定位的结束行 */
  endLine?: number;
  /** 可选:diff 模式下匹配的工具调用 id(定位历史变更) */
  toolCallId?: string;
  /** 可选:是否有未保存的改动(标签右侧显示脏标记圆点,对齐旧版 file-tab.dirty) */
  dirty?: boolean;
  /** 可选:md 渲染/编辑模式(仅 markdown;默认预览,切走切回保留工作上下文,首次打开才是预览) */
  mdMode?: 'preview' | 'edit';
  /** 可选:md 编辑态最新内容(未保存草稿;null/undefined 表示未编辑,渲染回退用磁盘内容) */
  mdDraft?: string | null;
}

/** 词级 diff 中的单个 token(对齐后端 DiffComputer.computeWordDiff) */
export interface WordDiffToken {
  /** equal 相同 / delete 旧文本中的删除词 / insert 新文本中的新增词 */
  type: 'equal' | 'delete' | 'insert';
  value: string;
}

/**
 * 词级 diff 按行组织(对齐后端 DiffComputer.computeWordDiffLines):
 * - old[i]:旧文件第 i+1 行的词标记序列(type ∈ {equal, delete})
 * - new[i]:新文件第 i+1 行的词标记序列(type ∈ {equal, insert})
 * 前端持有每行精确行号(removed 用旧行号、added 用新行号),按 1-based 行号索引。
 */
export interface WordDiffMap {
  old: WordDiffToken[][];
  new: WordDiffToken[][];
}

/** /api/files/diff?all=true 返回的单次变更记录 */
export interface FileChangeDiffItem {
  /** 工具名(write_file/edit_file/delete_file/bash 等) */
  toolName: string;
  /** 时间戳(ms) */
  timestamp: number;
  /** 在该文件变更列表中的索引 */
  index: number;
  /** 对应的 toolCallId(可能为空串) */
  toolCallId: string;
  /** 是否二进制(二进制时不带 changes/wordDiff 字段) */
  binary: boolean;
  /** 逐行 diff 列表 */
  changes?: DiffLine[];
  /** 行内词级 diff(按 1-based 行号索引;二进制时无) */
  wordDiff?: WordDiffMap;
}

/** 单行 diff(对齐后端 DiffComputer.computeDiffAsMap) */
export interface DiffLine {
  /** 行类型:same 相同 / removed 旧 / added 新 */
  type: 'same' | 'removed' | 'added';
  /** 行内容 */
  content: string;
}

/** /api/files/diff?all=true 整体响应 */
export interface FileDiffResponse {
  filePath: string;
  /** 全部历史变更(按时间顺序) */
  allChanges: FileChangeDiffItem[];
  /** 当前应聚焦的变更索引(-1 表示无可聚焦) */
  targetIndex: number;
  /** 整文件净变化行数 [insertions, deletions] */
  netStats: [number, number];
  /** 整文件净 diff(最早 original vs 最新 newContent 逐行 diff) */
  netDiff: DiffLine[];
  /** 整文件净词级 diff(整体视图行内精确变更;与 netDiff 同口径) */
  netWordDiff: WordDiffMap;
}

// ============================================================================
// 监控指标 (阶段 3.7-2: MetricsPanel,对应后端 MetricsApiHandler)
// ============================================================================

/** LLM 指标 - /api/metrics.llm */
export interface LlmMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

/** 单个工具的用量详情 */
export interface ToolUsageDetail {
  name: string;
  count: number;
  /** 该工具的 JSON 解析错误次数 */
  jsonParseErrors: number;
  /** 最近一次错误详情(可能为空串) */
  lastParseError: string;
}

/** 工具调用指标 - /api/metrics.tools */
export interface ToolMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  jsonParseErrors: number;
  jsonParseErrorTools: number;
  repeatedParseErrors: number;
  rePromptRecovery: number;
  /** 按调用次数降序排列 */
  details: ToolUsageDetail[];
}

/** 记忆系统指标 - /api/metrics.memory */
export interface MemoryMetrics {
  vectorSearchCount: number;
  searchHitRate: number;
  keywordFallbackCount: number;
  injectionSuccessCount: number;
  injectionEmptyCount: number;
}

/** GET /api/metrics 整体响应(各节可能缺失) */
export interface MetricsResponse {
  llm?: LlmMetrics;
  tools?: ToolMetrics;
  memory?: MemoryMetrics;
}

// ============================================================================
// 会话回滚 / 分叉 (阶段 3.7-2: RollbackButton,对应后端 SessionRewindHandler)
// ============================================================================

/** 回滚预览中的单个文件变更 */
export interface RollbackPreviewFile {
  /** 文件绝对路径 */
  filePath: string;
  /**
   * 回滚后的净效果:
   *  - delete:回滚后文件消失(该轮新建的文件)
   *  - add:回滚后文件还原(该轮删除的文件)
   *  - restore:回滚后内容恢复(该轮被修改的文件)
   */
  action: 'delete' | 'add' | 'restore';
  insertions: number;
  deletions: number;
}

/** POST /api/sessions/:id/rewind-check 响应 */
export interface RewindCheckResponse {
  files: RollbackPreviewFile[];
}

/** POST /api/sessions/:id/rewind 响应 */
export interface RewindResponse {
  success: boolean;
  message: string;
  /** 实际回滚的文件数 */
  filesChanged: number;
  /** 回滚模式:all=文件+截断会话;files=仅回滚文件 */
  mode: 'all' | 'files';
  /** 回滚目标用户消息的内容(仅 all 模式、截断后会话非空时存在,供回填输入框) */
  lastUserMessage?: string;
}

/** POST /api/sessions/:id/fork 响应 */
export interface ForkResponse {
  /** 新分叉会话 id(形如 rootId_fork_<timestamp>) */
  newSessionId: string;
  /** 新会话保留的消息数(含系统消息) */
  messageCount: number;
}

