/**
 * ToolTimeline 非组件导出(常量 / 类型 / 纯函数)
 *
 * 从 `ToolTimeline.tsx` 拆分,避免 react-refresh 因同一文件混合导出组件
 * 与非组件而告警(与 shared.tsx → shared-utils.ts 的拆分模式一致)。
 */
import type { Message, ToolCallRecord } from '@/types';
import type { ToolConfirmationPayload } from '@/types/sse';

// ============================================================================
// 类型
// ============================================================================

/** Timeline 行状态(在 ToolCallStatus 基础上补充旧版语义) */
export type TimelineStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'denied'
  | 'pending_confirmation';

/** Timeline 行数据(统一实时流与历史消息两种来源) */
export interface TimelineToolItem {
  id: string;
  name: string;
  /** 工具参数(实时流有,历史消息无) */
  args?: unknown;
  status: TimelineStatus;
  /** 流式进度行(执行中累积) */
  progress?: string[];
  /** 成功结果 */
  result?: string;
  /** 失败原因 */
  error?: string;
  /** 历史消息 fallback 内容(无 args 时作为摘要/详情) */
  content?: string;
  /** 工具确认数据(存在时行内渲染允许/拒绝,对齐旧版内嵌确认卡片) */
  confirmationData?: ToolConfirmationPayload;
}

/** 需要独立成卡、不进 timeline 的工具名(对齐旧版 todo_write/ask_user) */
export const TIMELINE_STANDALONE_TOOLS = new Set<string>(['todo_write', 'ask_user']);

// ============================================================================
// 转换函数
// ============================================================================

/** 从实时 ToolCallRecord 转换为 Timeline 行 */
export function fromToolCallRecord(rec: ToolCallRecord): TimelineToolItem {
  return {
    id: rec.id,
    name: rec.name,
    args: rec.args,
    // 存在确认数据时标记为待确认(供 timeline 行内渲染确认区),否则透传运行状态
    status: rec.confirmationData ? 'pending_confirmation' : rec.status,
    progress: rec.progress,
    result: rec.result,
    error: rec.error,
    confirmationData: rec.confirmationData,
  };
}

/** 提取消息内容纯文本(tool 消息 content 为 string 或 ContentPart[]) */
function extractContentText(content: Message['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text ?? '')
    .join('\n');
}

/**
 * 从历史 tool 消息转换为 Timeline 行。
 *
 * 历史消息仅含 toolName / content / success,无 args。
 * 状态从 success 推导,并尝试从 content 关键字还原旧版的
 * cancelled / denied 语义(后端 result 字段的历史约定)。
 */
export function fromToolMessage(msg: Message): TimelineToolItem {
  const content = extractContentText(msg.content);
  let status: TimelineStatus = msg.success === false ? 'failed' : 'success';
  // 仅明确失败时才从 content 关键字细分 cancelled / denied;
  // 成功态绝不被结果文本中的单词覆盖(否则正常执行易被误判为"已取消"，对齐旧版)。
  if (status === 'failed') {
    const lower = content.toLowerCase();
    if (lower.includes('用户拒绝')) {
      status = 'denied';
    } else if (
      lower.includes('cancelled') ||
      lower.includes('user_cancelled') ||
      lower.includes('interrupted')
    ) {
      // interrupted 与 cancelled 语义一致,统一合并为 cancelled
      status = 'cancelled';
    }
  }
  return {
    id: msg.id,
    name: msg.toolName ?? 'tool',
    // 前端固化路径携带 args(commitStreamingMessage 已补),透传后
    // timelineFilePath 可解析出 path,使「查看变更」在未刷新固化时仍可见,
    // 与刷新后走后端 tool_calls 的渲染保持一致。
    args: msg.args,
    status,
    result: content || undefined,
    content,
  };
}
