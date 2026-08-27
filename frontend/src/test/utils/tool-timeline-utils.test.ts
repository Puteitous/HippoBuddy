import { describe, it, expect } from 'vitest';
import {
  fromToolCallRecord,
  fromToolMessage,
  TIMELINE_STANDALONE_TOOLS,
} from '@/components/tool-renderers/tool-timeline-utils';
import type { ToolCallRecord, Message } from '@/types';

const record: ToolCallRecord = {
  id: 'r1',
  name: 'bash',
  args: { command: 'ls' },
  status: 'success',
  progress: ['a', 'b'],
  result: 'ok',
  startedAt: 0,
};

function toolMsg(partial: Partial<Message>): Message {
  return { id: 'm1', role: 'tool', content: '', ...partial };
}

describe('fromToolCallRecord', () => {
  it('无确认数据时透传运行状态与字段', () => {
    const item = fromToolCallRecord(record);
    expect(item).toMatchObject({
      id: 'r1',
      name: 'bash',
      args: { command: 'ls' },
      status: 'success',
      progress: ['a', 'b'],
      result: 'ok',
    });
    expect(item.confirmationData).toBeUndefined();
  });

  it('存在确认数据时置为 pending_confirmation', () => {
    const confirmationData = {
      confirmId: 'c1',
      command: 'rm -rf x',
      riskLevel: 'high',
      riskReason: 'i18n:blocker.rm',
    };
    const item = fromToolCallRecord({ ...record, confirmationData });
    expect(item.status).toBe('pending_confirmation');
    expect(item.confirmationData).toBe(confirmationData);
  });

  it('透传 error', () => {
    const item = fromToolCallRecord({ ...record, status: 'failed', error: 'boom' });
    expect(item.status).toBe('failed');
    expect(item.error).toBe('boom');
  });
});

describe('fromToolMessage', () => {
  it('成功态标记 success', () => {
    const item = fromToolMessage(toolMsg({ content: 'done', success: true }));
    expect(item.status).toBe('success');
    expect(item.result).toBe('done');
  });

  it('success 缺失（后端历史）默认成功', () => {
    const item = fromToolMessage(toolMsg({ content: 'ok' }));
    expect(item.status).toBe('success');
  });

  it('success 为 false 且无关键词 → failed', () => {
    const item = fromToolMessage(toolMsg({ content: 'some error', success: false }));
    expect(item.status).toBe('failed');
  });

  it('失败且内容含「用户拒绝」→ denied', () => {
    const item = fromToolMessage(toolMsg({ content: '用户拒绝执行', success: false }));
    expect(item.status).toBe('denied');
  });

  it('失败且内容含 cancelled → cancelled', () => {
    for (const kw of ['cancelled', 'user_cancelled', 'interrupted']) {
      const item = fromToolMessage(toolMsg({ content: `xx${kw}xx`, success: false }));
      expect(item.status).toBe('cancelled');
    }
  });

  it('成功态绝不被结果文本中的关键词覆盖（关键回归约束）', () => {
    // 正常执行输出可能包含「用户拒绝」「cancelled」，不能误判为 denied/cancelled
    const item = fromToolMessage(
      toolMsg({ content: '用户拒绝次数统计 cancelled 输出正常', success: true }),
    );
    expect(item.status).toBe('success');
  });

  it('ContentPart[] 提取纯文本拼接', () => {
    const item = fromToolMessage(
      toolMsg({
        content: [
          { type: 'text', text: '第一行' },
          { type: 'text', text: '第二行' },
          { type: 'image', imageUrl: 'data:...' } as never,
        ] as Message['content'],
        success: true,
      }),
    );
    expect(item.result).toBe('第一行\n第二行');
  });

  it('提取 toolName 与 id，并透传 args', () => {
    const item = fromToolMessage(
      toolMsg({ toolName: 'write_file', args: { path: '/x.ts' } }),
    );
    expect(item.name).toBe('write_file');
    expect(item.id).toBe('m1');
    expect(item.args).toEqual({ path: '/x.ts' });
  });

  it('无 toolName 时兜底为 tool', () => {
    expect(fromToolMessage(toolMsg({})).name).toBe('tool');
  });
});

describe('TIMELINE_STANDALONE_TOOLS', () => {
  it('todo_write 与 ask_user 独立成卡不进 timeline', () => {
    expect(TIMELINE_STANDALONE_TOOLS.has('todo_write')).toBe(true);
    expect(TIMELINE_STANDALONE_TOOLS.has('ask_user')).toBe(true);
    expect(TIMELINE_STANDALONE_TOOLS.has('bash')).toBe(false);
  });
});