/**
 * HippoBuddy 后端 API 客户端
 *
 * 类型对齐后端 com.example.agent.web.handler.* 实际接口。
 * 所有方法返回 Promise<T>,失败抛出 ApiError。
 */
import { deleteJson, getJson, postJson, putJson } from './http';
import { streamSse } from './sse';
import type { SseEvent } from './sse';
import type {
  ChatRequest,
  DefaultWorkspaceUpdateResult,
  DiffLine,
  FileDiffResponse,
  ForkResponse,
  LlmConfig,
  Message,
  MetricsResponse,
  RewindCheckResponse,
  RewindResponse,
  Session,
  SessionStatus,
  SessionTokenStats,
  ToolAbortRequest,
  ToolConfirmRequest,
  UpdateLlmConfigRequest,
  WorkspaceState,
} from '@/types';
import type { ChatSseEventName } from '@/types/sse';
import type {
  DataDirInfo,
  FullConfig,
  RuleGetResponse,
  RuleMutationResponse,
  RulesListResponse,
  SkillGetResponse,
  SkillMutationResponse,
  SkillsListResponse,
  UpdateConfigRequest,
  UpdateDataDirRequest,
  UpdateDataDirResponse,
} from '@/types/config';

const API_BASE = '/api';

// ============================================================================
// Session API (对应后端 SessionApiHandler)
// ============================================================================

export const sessionApi = {
  /** GET /api/sessions - 列出所有会话(内存活跃 + 磁盘归档) */
  list: () => getJson<Session[]>(`${API_BASE}/sessions`),

  /** GET /api/sessions/:id/messages - 读取会话历史消息(从 JSONL) */
  getMessages: (sessionId: string) =>
    getJson<Message[]>(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`),

  /** GET /api/sessions/:id/tokens - 读取会话 Token 统计 */
  getTokens: (sessionId: string) =>
    getJson<SessionTokenStats>(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/tokens`),

  /** GET /api/sessions/:id/status - 查询 Agent 执行状态 */
  getStatus: (sessionId: string) =>
    getJson<SessionStatus>(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/status`),

  /** DELETE /api/sessions/:id - 删除会话(JSONL + 内存) */
  delete: (sessionId: string) =>
    deleteJson<{ success: boolean; message: string }>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}`,
    ),

  /** POST /api/sessions/:id/rename - 重命名会话(写入 custom-title) */
  rename: (sessionId: string, name: string) =>
    postJson<{ success: boolean; message: string }>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/rename`,
      { name },
    ),

  /** POST /api/sessions/:id/pin - 设置会话置顶状态(写入 session.json 的 pinned) */
  pin: (sessionId: string, pinned: boolean) =>
    postJson<{ success: boolean; pinned: boolean }>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/pin`,
      { pinned },
    ),

  /** POST /api/sessions/:id/title - 用 LLM 生成会话标题 */
  generateTitle: (sessionId: string, userMessage?: string) =>
    postJson<{ title: string }>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/title`,
      { userMessage },
    ),

  /** POST /api/sessions/:id/compact - 手动压缩会话上下文 */
  compact: (sessionId: string, instruction?: string) =>
    postJson<{
      success: boolean;
      method: string;
      originalCount: number;
      compactedCount: number;
      reducedCount: number;
      savedTokens: number;
      savedPercent: number;
      summary: string;
    }>(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/compact`, { instruction }),

  /** POST /api/sessions/:id/rewind-check - 回滚前检查(收集目标消息后的文件变更) */
  rewindCheck: (sessionId: string, body: { messageId: string }) =>
    postJson<RewindCheckResponse>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/rewind-check`,
      body,
    ),

  /**
   * POST /api/sessions/:id/rewind - 回滚会话到指定消息
   * @param mode 'all' = 回滚文件 + 截断会话;'files' = 仅回滚文件
   */
  rewind: (sessionId: string, body: { messageId: string; mode: 'all' | 'files' }) =>
    postJson<RewindResponse>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/rewind`,
      body,
    ),

  /** POST /api/sessions/:id/fork - 从指定消息分叉新会话 */
  fork: (sessionId: string, body: { messageId: string }) =>
    postJson<ForkResponse>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/fork`,
      body,
    ),
};

// ============================================================================
// Chat API (对应后端 ChatApiHandler + SseWriter)
// ============================================================================

export const chatApi = {
  /**
   * POST /api/chat - 流式发送消息
   *
   * 后端以 SSE 推送多类事件(thinking/reasoning/content/tool_start/tool_result/done 等),
   * 前端按事件名称分发到回调。
   *
   * @param request 聊天请求
   * @param onEvent SSE 事件回调
   * @param signal AbortController.signal,用于中断
   */
  stream: <K extends ChatSseEventName>(
    request: ChatRequest,
    onEvent: (event: SseEvent<K>) => void,
    signal?: AbortSignal,
  ) => streamSse<K>(`${API_BASE}/chat`, request, onEvent, signal),

  /**
   * POST /api/tool/confirm - 工具确认(bash/delete_file)
   *
   * 后端 /api/tool/confirm 是 SSE 响应流:allow 时在流内推送 tool_progress /
   * tool_result(以及后续 continueAfterConfirmation 的 Agent 事件),deny 时推送
   * tool_result。必须像 /api/chat 一样流式消费事件,否则确认后的工具状态/进度/结果
   * 以及后续回复都无法更新(旧版 ConfirmHandler 手动读流即为此原因)。
   */
  confirmTool: <K extends ChatSseEventName = ChatSseEventName>(
    request: ToolConfirmRequest,
    onEvent: (event: SseEvent<K>) => void,
    signal?: AbortSignal,
  ) => streamSse<K>(`${API_BASE}/tool/confirm`, request, onEvent, signal),

  /** POST /api/tool/abort - 中止当前会话的 Agent 循环 */
  abortTool: (request: ToolAbortRequest) =>
    postJson<{ success: boolean; message: string }>(`${API_BASE}/tool/abort`, request),
};

// ============================================================================
// Config API (对应后端 ConfigApiHandler)
// ============================================================================

export const configApi = {
  /** GET /api/config/llm - 读取 LLM 配置(含历史快照,apiKey 已遮掩) */
  getLlm: () => getJson<LlmConfig>(`${API_BASE}/config/llm`),

  /** GET /api/config/llm/defaults - 各 Provider 默认 base URL({provider: url}) */
  getLlmDefaults: () => getJson<Record<string, string>>(`${API_BASE}/config/llm/defaults`),

  /**
   * PUT /api/config/llm - 更新 LLM 配置
   * - 完整保存:来自配置弹窗(含 baseUrl/apiKey/maxTokens 等)
   * - 快速切换:仅 provider+model(后端从历史快照恢复)
   */
  updateLlm: (config: UpdateLlmConfigRequest) =>
    putJson<{ success: boolean }>(`${API_BASE}/config/llm`, config),

  /**
   * POST /api/config/llm/models - 从厂商的 OpenAI 兼容 /v1/models 端点拉取可用模型列表
   * @param provider 厂商(如 deepseek / zhipu / moonshot ...)
   * @param baseUrl 厂商 base URL(可为空,后端回退默认地址)
   * @param apiKey API Key(为空或已遮掩时后端回退已保存配置)
   */
  fetchLlmModels: (provider: string, baseUrl: string, apiKey?: string) =>
    postJson<{ success: boolean; provider: string; models: string[] }>(
      `${API_BASE}/config/llm/models`,
      { provider, baseUrl, apiKey },
    ),

  /**
   * DELETE /api/config/llm/history - 删除历史记录中的指定模型快照
   */
  deleteHistorySnapshot: (provider: string, model: string) =>
    deleteJson<{ success: boolean; removed: boolean }>(`${API_BASE}/config/llm/history`, {
      provider,
      model,
    }),

  /** GET /api/config - 读取完整配置(所有配置节) */
  getFull: () => getJson<FullConfig>(`${API_BASE}/config`),

  /** PUT /api/config - 部分更新配置
   * @param values 配置节字典(只更新出现的节)
   */
  updateFull: (values: UpdateConfigRequest) =>
    putJson<{ success: boolean }>(`${API_BASE}/config`, { values }),
};

/**
 * GET /api/system-prompts/default/{mode} - 某任务模式的内置默认基础提示词
 * 仅用于设置页展示该模式的系统预设提示词(实际发送时后端还会叠加规则/技能/工作区等增强)。
 */
export const systemPromptApi = {
  getDefault: (mode: string) =>
    getJson<{ mode: string; prompt: string }>(
      `${API_BASE}/system-prompts/default/${encodeURIComponent(mode)}`,
    ),
};

// ============================================================================
// Workspace API (对应后端 WorkspaceApiHandler)
// ============================================================================

export const workspaceApi = {
  /** GET /api/workspace - 当前工作区路径和是否默认 */
  getCurrent: () => getJson<WorkspaceState>(`${API_BASE}/workspace`),

  /** PUT /api/workspace - 设置当前工作区 */
  setCurrent: (path: string) => putJson<WorkspaceState>(`${API_BASE}/workspace`, { path }),

  /** DELETE /api/workspace - 重置为默认工作区 */
  resetCurrent: () => deleteJson<WorkspaceState>(`${API_BASE}/workspace`),

  /** GET /api/workspace/default - 默认工作区配置 */
  getDefault: () => getJson<WorkspaceState>(`${API_BASE}/workspace/default`),

  /** PUT /api/workspace/default - 设置默认工作区路径 */
  setDefault: (path: string) =>
    putJson<DefaultWorkspaceUpdateResult>(`${API_BASE}/workspace/default`, { path }),
};

// ============================================================================
// File API (对应后端 FileApiHandler / RawFileHandler / GitStatusHandler)
// ============================================================================

export const fileApi = {
  /**
   * GET /api/files/changes - 最近 50 条文件变更记录
   * 每条附带该文件在会话内的净变化行数 insertions/deletions
   * (由后端按 filePath 分组用 netDiffStats 计算,供面板 item 展示 +x/-y)
   * @param sessionId 可选,按会话过滤
   */
  getChanges: (sessionId?: string) =>
    getJson<
      Array<{
        filePath: string;
        toolName: string;
        timestamp: number;
        binary: boolean;
        insertions: number;
        deletions: number;
      }>
    >(`${API_BASE}/files/changes${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),

  /**
   * GET /api/files/summary?sessionId=xxx - 会话级文件变更汇总
   */
  getSummary: (sessionId: string) =>
    getJson<{
      fileCount: number;
      addedFiles: number;
      modifiedFiles: number;
      deletedFiles: number;
      binaryFiles: number;
      insertions: number;
      deletions: number;
    }>(`${API_BASE}/files/summary?sessionId=${encodeURIComponent(sessionId)}`),

  /**
   * GET /api/diff/original?path=xxx&sessionId=xxx - 获取 AI 修改前的原始内容(编辑器 diff 基线)
   *
   * 仅返回当前会话内该文件最早一次变更的 originalContent,作为编辑器内联 diff 的基线。
   * 无基线时返回 content 为 null(空对象)。
   */
  getDiffOriginal: (filePath: string, sessionId?: string) => {
    const params = new URLSearchParams({ path: filePath });
    if (sessionId) params.set('sessionId', sessionId);
    return getJson<{ content?: string | null; source?: string }>(
      `${API_BASE}/diff/original?${params.toString()}`,
    );
  },

  /**
   * GET /api/files/diff?path=xxx&all=true - 整文件 diff(历史 + 净 diff)
   *
   * 返回该文件所有工具变更记录,以及"最早 original vs 最新 newContent"的逐行 diff。
   * 用于 FileDiffView 渲染整文件变更视图。
   *
   * @param filePath 文件绝对路径
   * @param toolCallId 可选,指定聚焦的 toolCallId(后端返回 targetIndex)
   */
  getDiff: (filePath: string, toolCallId?: string) => {
    const params = new URLSearchParams({
      path: filePath,
      all: 'true',
    });
    if (toolCallId) params.set('toolCallId', toolCallId);
    return getJson<FileDiffResponse>(`${API_BASE}/files/diff?${params.toString()}`);
  },

  /**
   * GET /api/files/snapshot?path=xxx - 外部文件变更检测
   *
   * 前端按需轮询(3.5 不自动轮询,留 3.7 接入)。返回自上次调用以来的外部变更。
   */
  getSnapshot: (rootPath: string) =>
    getJson<{
      available: boolean;
      changes: Array<{ type: string; path: string }>;
    }>(`${API_BASE}/files/snapshot?path=${encodeURIComponent(rootPath)}`),

  /**
   * POST /api/files/rollback - 回滚文件到指定 toolCallId 之前的版本
   */
  rollback: (filePath: string, toolCallId?: string) =>
    postJson<{ success: boolean; message?: string; error?: string }>(
      `${API_BASE}/files/rollback`,
      { filePath, toolCallId: toolCallId ?? '' },
    ),

  /**
   * GET /api/file/raw?path=xxx - 原始二进制文件 URL
   *
   * 不通过 fetch 调用,而是直接拼成 URL 给 <img> / <iframe> 使用,
   * 让浏览器原生加载图片/PDF/Office 文件。
   */
  rawUrl: (filePath: string) =>
    `${API_BASE}/file/raw?path=${encodeURIComponent(filePath)}`,
};

// ============================================================================
// Skills API (对应后端 SkillsApiHandler)
// ============================================================================

export const skillsApi = {
  /** GET /api/skills/list - 列出项目技能 + 用户技能 */
  list: () => getJson<SkillsListResponse>(`${API_BASE}/skills/list`),

  /** GET /api/skills/get?filePath=xxx - 读取技能文件内容 */
  get: (filePath: string) =>
    getJson<SkillGetResponse>(
      `${API_BASE}/skills/get?filePath=${encodeURIComponent(filePath)}`,
    ),

  /** POST /api/skills/create - 创建技能文件 */
  create: (body: {
    name: string;
    description?: string;
    scope: 'project' | 'user';
    content: string;
  }) => postJson<SkillMutationResponse>(`${API_BASE}/skills/create`, body),

  /** POST /api/skills/update - 更新技能文件 */
  update: (body: {
    filePath: string;
    name: string;
    description?: string;
    scope: 'project' | 'user';
    content: string;
  }) => postJson<SkillMutationResponse>(`${API_BASE}/skills/update`, body),

  /** POST /api/skills/delete - 删除技能文件 */
  delete: (filePath: string) =>
    postJson<SkillMutationResponse>(`${API_BASE}/skills/delete`, { filePath }),
};

// ============================================================================
// Rules API (对应后端 RulesApiHandler)
// ============================================================================

export const rulesApi = {
  /** GET /api/rules/list - 列出项目规则 + 用户规则 */
  list: () => getJson<RulesListResponse>(`${API_BASE}/rules/list`),

  /** GET /api/rules/get?filePath=xxx - 读取规则文件内容 */
  get: (filePath: string) =>
    getJson<RuleGetResponse>(
      `${API_BASE}/rules/get?filePath=${encodeURIComponent(filePath)}`,
    ),

  /** POST /api/rules/create - 创建规则文件 */
  create: (body: {
    name: string;
    description?: string;
    mode: 'always' | 'manual';
    scope: 'project' | 'user';
    content: string;
  }) => postJson<RuleMutationResponse>(`${API_BASE}/rules/create`, body),

  /** POST /api/rules/update - 更新规则文件 */
  update: (body: {
    filePath: string;
    name: string;
    description?: string;
    mode: 'always' | 'manual';
    scope: 'project' | 'user';
    content: string;
  }) => postJson<RuleMutationResponse>(`${API_BASE}/rules/update`, body),

  /** POST /api/rules/delete - 删除规则文件 */
  delete: (filePath: string) =>
    postJson<RuleMutationResponse>(`${API_BASE}/rules/delete`, { filePath }),
};

// ============================================================================
// DataDir API (对应后端 DataDirApiHandler)
// ============================================================================

export const dataDirApi = {
  /** GET /api/settings/data-dir - 读取当前数据目录 */
  get: () => getJson<DataDirInfo>(`${API_BASE}/settings/data-dir`),

  /** POST /api/settings/data-dir - 变更数据目录(需重启生效) */
  update: (path: string) =>
    postJson<UpdateDataDirResponse>(`${API_BASE}/settings/data-dir`, {
      path,
    } as UpdateDataDirRequest),
};

// ============================================================================
// Metrics API (对应后端 MetricsApiHandler)
// ============================================================================

export const metricsApi = {
  /** GET /api/metrics - 实时监控指标(LLM / 工具调用 / 记忆系统) */
  get: () => getJson<MetricsResponse>(`${API_BASE}/metrics`),
};

// 重导出 DiffLine 供组件直接引用
export type { DiffLine };

// ============================================================================
// 兼容旧 App.tsx 的默认导出
// ============================================================================

export const api = {
  sessions: sessionApi,
  chat: chatApi,
  config: configApi,
  workspace: workspaceApi,
  files: fileApi,
  skills: skillsApi,
  rules: rulesApi,
  dataDir: dataDirApi,
  metrics: metricsApi,
  /** 便捷方法:GET /api/sessions */
  getSessions: sessionApi.list,
};

// 重新导出类型,方便外部引用
export type { ChatRequest, SessionMode, Session, Message, LlmConfig } from '@/types';
export type { ChatSseEventName } from '@/types/sse';
