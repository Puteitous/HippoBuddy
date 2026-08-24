/**
 * message-utils - 消息相关的纯工具函数与类型
 *
 * 与 MessageBubble 组件拆分,满足 react-refresh/only-export-components:
 * 组件文件只导出组件,工具函数/类型放独立文件。
 */
import type { Message, ToolCall } from '@/types';

/** 消息产物文件(对齐旧版 extractFilesFromSegments 返回结构) */
export interface MessageFileProduct {
  /** 文件绝对路径 */
  path: string;
  /** 变更类型:A=新增 D=删除 M=修改 */
  action: 'A' | 'D' | 'M';
}

/**
 * 从单个工具调用(name + args 对象)提取文件产物:
 *  - write_file / edit_file / write_office_file → 取 path 类参数(action A/M)
 *  - delete_file → 取 paths 列表(action D)
 *  - 无有效 path 的工具或非文件类工具返回空(不产生文件产物)
 */
function extractFilesFromCall(
  name: string,
  rawArgs: unknown,
): MessageFileProduct[] {
  if (!rawArgs || typeof rawArgs !== 'object') return [];

  const files: MessageFileProduct[] = [];
  const a = rawArgs as Record<string, unknown>;

  let paths: string[] = [];
  let action: MessageFileProduct['action'] = 'M';
  if (name === 'delete_file') {
    paths = Array.isArray(a.paths) ? (a.paths as string[]).filter((p): p is string => typeof p === 'string') : [];
    action = 'D';
  } else if (['write_file', 'edit_file', 'write_office_file'].includes(name)) {
    const p =
      typeof a.path === 'string' ? a.path :
      typeof a.filePath === 'string' ? a.filePath :
      typeof a.file_path === 'string' ? a.file_path : '';
    if (p) paths = [p];
    if (name === 'write_file' || name === 'write_office_file') action = 'A';
  }

  for (const p of paths) {
    files.push({ path: p, action });
  }
  return files;
}

/** 领取文件列表 + 去重:同一文件保留最后一次(以最新 action 为准) */
function dedupeExtractedFiles(files: MessageFileProduct[]): MessageFileProduct[] {
  const seen = new Map<string, MessageFileProduct>();
  for (const f of files) seen.set(f.path, f);
  return Array.from(seen.values());
}

/**
 * 从 assistant 消息的 tool_calls 提取本轮文件产物(对齐旧版
 * HistoryRenderer.extractFilesFromSegments,refresh 后历史加载路径)。
 */
export function extractFilesFromToolCalls(toolCalls?: ToolCall[]): MessageFileProduct[] {
  if (!toolCalls || toolCalls.length === 0) return [];

  const files: MessageFileProduct[] = [];
  for (const tc of toolCalls) {
    let args: unknown;
    try {
      args = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch {
      continue;
    }
    files.push(...extractFilesFromCall(tc.name, args));
  }
  return dedupeExtractedFiles(files);
}

/**
 * 从单条 tool 消息的前端固化 args 提取文件产物(实时流内存固化路径)。
 * 实时固化时工具消息带 args(见 commitStreamingMessage),assistant 不带 tool_calls,
 * 故需从该来源补全文件产物;refresh 后工具消息无 args、该函数返回空,由
 * extractFilesFromToolCalls 兜底。两者互补使未刷新与刷新后渲染一致。
 */
export function extractFilesFromToolMessage(msg: Message): MessageFileProduct[] {
  if (msg.role !== 'tool' || msg.args == null) return [];
  if (typeof msg.args !== 'object') return [];
  return extractFilesFromCall(msg.toolName ?? '', msg.args);
}