import { describe, it, expect } from 'vitest';
import {
  extractFilesFromToolCalls,
  extractFilesFromToolMessage,
} from '@/components/chat-panel/message-utils';
import type { ToolCall, Message } from '@/types';

function call(id: string, name: string, argsText: string): ToolCall {
  return { id, name, arguments: argsText };
}

function toolMsg(partial: Partial<Message>): Message {
  return { id: 't1', role: 'tool', content: '', ...partial };
}

describe('extractFilesFromToolCalls', () => {
  it('空或空数组返回空数组', () => {
    expect(extractFilesFromToolCalls()).toEqual([]);
    expect(extractFilesFromToolCalls([])).toEqual([]);
  });

  it('write_file 用 path 参数，action 为 A', () => {
    const res = extractFilesFromToolCalls([
      call('1', 'write_file', JSON.stringify({ path: '/x/a.ts' })),
    ]);
    expect(res).toEqual([{ path: '/x/a.ts', action: 'A' }]);
  });

  it('edit_file 用 filePath 参数，action 为 M', () => {
    const res = extractFilesFromToolCalls([
      call('1', 'edit_file', JSON.stringify({ filePath: '/x/b.ts' })),
    ]);
    expect(res).toEqual([{ path: '/x/b.ts', action: 'M' }]);
  });

  it('write_office_file 用 file_path 参数，action 为 A', () => {
    const res = extractFilesFromToolCalls([
      call('1', 'write_office_file', JSON.stringify({ file_path: '/x/c.docx' })),
    ]);
    expect(res).toEqual([{ path: '/x/c.docx', action: 'A' }]);
  });

  it('delete_file 用 paths 数组（多个），action 为 D', () => {
    const res = extractFilesFromToolCalls([
      call('1', 'delete_file', JSON.stringify({ paths: ['/x/a.ts', '/x/b.ts'] })),
    ]);
    expect(res).toEqual([
      { path: '/x/a.ts', action: 'D' },
      { path: '/x/b.ts', action: 'D' },
    ]);
  });

  it('arguments 为非法 JSON 时跳过该调用', () => {
    expect(extractFilesFromToolCalls([call('1', 'write_file', 'not-json{{{')])).toEqual([]);
  });

  it('同类文件路径去重：保留最后一次 action', () => {
    const res = extractFilesFromToolCalls([
      call('1', 'write_file', JSON.stringify({ path: '/x/a.ts' })),
      call('2', 'edit_file', JSON.stringify({ filePath: '/x/a.ts' })),
    ]);
    // 同一 /x/a.ts，最后一次为 edit_file → M
    expect(res).toEqual([{ path: '/x/a.ts', action: 'M' }]);
  });

  it('非文件类工具或无 path 的工具返回空', () => {
    expect(
      extractFilesFromToolCalls([call('1', 'bash', JSON.stringify({ command: 'ls' }))]),
    ).toEqual([]);
    expect(
      extractFilesFromToolCalls([call('1', 'write_file', JSON.stringify({ content: 'x' }))]),
    ).toEqual([]);
  });
});

describe('extractFilesFromToolMessage', () => {
  it('非 tool 角色返回空', () => {
    expect(extractFilesFromToolMessage(toolMsg({ role: 'assistant' }))).toEqual([]);
  });

  it('args 为 null 或非对象返回空', () => {
    expect(extractFilesFromToolMessage(toolMsg({ args: null }))).toEqual([]);
    expect(extractFilesFromToolMessage(toolMsg({ args: 'string' as unknown }))).toEqual([]);
  });

  it('write_file 提取 path 为 A', () => {
    const res = extractFilesFromToolMessage(
      toolMsg({ toolName: 'write_file', args: { path: '/x/a.ts' } }),
    );
    expect(res).toEqual([{ path: '/x/a.ts', action: 'A' }]);
  });

  it('delete_file 提取 paths 为 D', () => {
    const res = extractFilesFromToolMessage(
      toolMsg({ toolName: 'delete_file', args: { paths: ['/x/a.ts'] } }),
    );
    expect(res).toEqual([{ path: '/x/a.ts', action: 'D' }]);
  });

  it('edit_file 提取为 M', () => {
    const res = extractFilesFromToolMessage(
      toolMsg({ toolName: 'edit_file', args: { filePath: '/x/b.ts' } }),
    );
    expect(res).toEqual([{ path: '/x/b.ts', action: 'M' }]);
  });
});