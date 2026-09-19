import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ToolCardDispatcher } from '@/components/tool-renderers/ToolCardDispatcher';
import type { ToolCallRecord } from '@/types';

vi.mock('@/components/tool-renderers/BashToolCard', () => ({
  BashToolCard: (p: { record: ToolCallRecord }) => <span data-testid="BashToolCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/WriteFileCard', () => ({
  WriteFileCard: (p: { record: ToolCallRecord }) => <span data-testid="WriteFileCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/EditFileCard', () => ({
  EditFileCard: (p: { record: ToolCallRecord }) => <span data-testid="EditFileCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/DeleteFileCard', () => ({
  DeleteFileCard: (p: { record: ToolCallRecord }) => <span data-testid="DeleteFileCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/FileSearchCard', () => ({
  FileSearchCard: (p: { record: ToolCallRecord }) => <span data-testid="FileSearchCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/TodoWriteCard', () => ({
  TodoWriteCard: (p: { record: ToolCallRecord }) => <span data-testid="TodoWriteCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/WebToolCard', () => ({
  WebToolCard: (p: { record: ToolCallRecord }) => <span data-testid="WebToolCard">{p.record.name}</span>,
}));
vi.mock('@/components/tool-renderers/AskUserCard', () => ({
  AskUserCard: (p: { record?: ToolCallRecord }) => <span data-testid="AskUserCard">{p.record?.name}</span>,
}));
vi.mock('@/components/tool-renderers/DefaultToolCard', () => ({
  DefaultToolCard: (p: { record: ToolCallRecord }) => <span data-testid="DefaultToolCard">{p.record.name}</span>,
}));

function mkRec(name: string): ToolCallRecord {
  return { id: name, name, status: 'success', args: {} } as unknown as ToolCallRecord;
}

function assertDispatches(name: string, testid: string) {
  const { container } = render(<ToolCardDispatcher record={mkRec(name)} />);
  expect(container.querySelector(`[data-testid="${testid}"]`)).not.toBeNull();
}

describe('ToolCardDispatcher', () => {
  it('bash → BashToolCard', () => assertDispatches('bash', 'BashToolCard'));
  it('write_file → WriteFileCard', () => assertDispatches('write_file', 'WriteFileCard'));
  it('edit_file → EditFileCard', () => assertDispatches('edit_file', 'EditFileCard'));
  it('delete_file → DeleteFileCard', () => assertDispatches('delete_file', 'DeleteFileCard'));
  it('todo_write → TodoWriteCard', () => assertDispatches('todo_write', 'TodoWriteCard'));
  it('ask_user → AskUserCard', () => assertDispatches('ask_user', 'AskUserCard'));
  it('web 工具集 → WebToolCard', () => {
    assertDispatches('web_search', 'WebToolCard');
    assertDispatches('web_fetch', 'WebToolCard');
  });
  it('文件类工具集 → FileSearchCard', () => {
    assertDispatches('read_file', 'FileSearchCard');
    assertDispatches('grep', 'FileSearchCard');
    assertDispatches('SearchCodebase', 'FileSearchCard');
    assertDispatches('skill', 'FileSearchCard');
  });
  it('未识别工具名 → DefaultToolCard 兜底', () => {
    assertDispatches('some_custom_tool', 'DefaultToolCard');
    assertDispatches('anything_else', 'DefaultToolCard');
  });
});