/**
 * message-utils - 消息相关的纯工具函数与类型
 *
 * 与 MessageBubble 组件拆分,满足 react-refresh/only-export-components:
 * 组件文件只导出组件,工具函数/类型放独立文件。
 */
import type { ToolCall } from '@/types';

/** 消息产物文件(对齐旧版 extractFilesFromSegments 返回结构) */
export interface MessageFileProduct {
  /** 文件绝对路径 */
  path: string;
  /** 变更类型:A=新增 D=删除 M=修改 */
  action: 'A' | 'D' | 'M';
}

/**
 * 从 assistant 消息的 tool_calls 提取本轮文件产物(对齐旧版
 * HistoryRenderer.extractFilesFromSegments):
 *  - write_file / edit_file / write_office_file → 取 path 类参数(action A/M)
 *  - delete_file → 取 paths 列表(action D)
 *  - 同一文件多次出现只保留一次
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
    if (!args || typeof args !== 'object') continue;
    const a = args as Record<string, unknown>;

    let paths: string[] = [];
    let action: MessageFileProduct['action'] = 'M';
    if (tc.name === 'delete_file') {
      paths = Array.isArray(a.paths) ? (a.paths as string[]).filter((p): p is string => typeof p === 'string') : [];
      action = 'D';
    } else if (['write_file', 'edit_file', 'write_office_file'].includes(tc.name)) {
      const p =
        typeof a.path === 'string' ? a.path :
        typeof a.filePath === 'string' ? a.filePath :
        typeof a.file_path === 'string' ? a.file_path : '';
      if (p) paths = [p];
      if (tc.name === 'write_file' || tc.name === 'write_office_file') action = 'A';
    }

    for (const p of paths) {
      files.push({ path: p, action });
    }
  }

  // 去重:同一文件保留最后一次(以最新 action 为准)
  const seen = new Map<string, MessageFileProduct>();
  for (const f of files) seen.set(f.path, f);
  return Array.from(seen.values());
}