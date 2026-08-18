/**
 * ToolCardDispatcher - 工具卡片分发器
 *
 * 按 record.name 把 ToolCallRecord 分发到对应的 ToolCard 组件。
 * 未识别的工具名落到 DefaultToolCard 兜底。
 *
 * 用法:
 *   <ToolCardDispatcher record={record} />
 *
 * 分发规则(与 shared.tsx 中的常量集合保持一致):
 *   bash              → BashToolCard
 *   write_file        → WriteFileCard
 *   edit_file         → EditFileCard
 *   delete_file       → DeleteFileCard
 *   read_file / grep / glob / list_directory / SearchCodebase /
 *   read_office_file / write_office_file / lint_diagnostics /
 *   undo_file / skill → FileSearchCard
 *   todo_write        → TodoWriteCard
 *   web_search / web_fetch → WebToolCard
 *   ask_user          → AskUserCard
 *   其他              → DefaultToolCard
 */
import { memo } from 'react';
import type { ToolCallRecord } from '@/types';
import { FILE_SEARCH_TOOL_NAMES, WEB_TOOL_NAMES } from './shared-utils';
import { BashToolCard } from './BashToolCard';
import { WriteFileCard } from './WriteFileCard';
import { EditFileCard } from './EditFileCard';
import { DeleteFileCard } from './DeleteFileCard';
import { FileSearchCard } from './FileSearchCard';
import { TodoWriteCard } from './TodoWriteCard';
import { WebToolCard } from './WebToolCard';
import { AskUserCard } from './AskUserCard';
import { DefaultToolCard } from './DefaultToolCard';

interface ToolCardDispatcherProps {
  record: ToolCallRecord;
}

function ToolCardDispatcherComponent({ record }: ToolCardDispatcherProps) {
  const { name } = record;

  if (name === 'bash') return <BashToolCard record={record} />;
  if (name === 'write_file') return <WriteFileCard record={record} />;
  if (name === 'edit_file') return <EditFileCard record={record} />;
  if (name === 'delete_file') return <DeleteFileCard record={record} />;
  if (name === 'todo_write') return <TodoWriteCard record={record} />;
  if (name === 'ask_user') return <AskUserCard record={record} />;
  if (WEB_TOOL_NAMES.has(name)) return <WebToolCard record={record} />;
  if (FILE_SEARCH_TOOL_NAMES.has(name)) return <FileSearchCard record={record} />;

  return <DefaultToolCard record={record} />;
}

export const ToolCardDispatcher = memo(ToolCardDispatcherComponent);
