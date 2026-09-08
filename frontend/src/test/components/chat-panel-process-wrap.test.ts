import { describe, it, expect } from 'vitest';
import {
  hasCommittedRoundContent,
  shouldWrapProcessSection,
  type ProcessWrapInput,
} from '@/components/chat-panel/ChatPanel';
import type { Message } from '@/types';

function msg(id: string, role: Message['role'], content = ''): Message {
  return { id, role, content } as Message;
}

function toolMsg(id: string): Message {
  return { id, role: 'tool', toolName: 'bash', content: '' } as Message;
}

describe('hasCommittedRoundContent', () => {
  const user = msg('u1', 'user', 'hi');

  it('user 消息之后存在 assistant 内容 → 回合已固化', () => {
    expect(hasCommittedRoundContent([user, msg('a1', 'assistant', 'ok')], user)).toBe(true);
  });

  it('user 消息之后存在 tool 内容 → 回合已固化', () => {
    expect(hasCommittedRoundContent([user, toolMsg('t1')], user)).toBe(true);
  });

  it('user 消息之后无任何内容 → 未固化(正常流式回合)', () => {
    expect(hasCommittedRoundContent([user], user)).toBe(false);
  });

  it('user 之前的 assistant 属于上一回合,不计入本回合 → 未固化', () => {
    const prevAssistant = msg('a0', 'assistant', '上一回合正文');
    expect(hasCommittedRoundContent([prevAssistant, user], user)).toBe(false);
  });

  it('lastUser 不在 messages 或为空 → false', () => {
    expect(hasCommittedRoundContent([], undefined)).toBe(false);
    expect(hasCommittedRoundContent([msg('x', 'user')], msg('ghost', 'user'))).toBe(false);
  });
});

describe('shouldWrapProcessSection', () => {
  const base: ProcessWrapInput = {
    hasThinking: false,
    toolCount: 0,
    streamLength: 0,
    roundCommitted: false,
  };

  it('正常流式:有思考或工具且 stream 非空且未固化 → 包 ProcessSection', () => {
    expect(shouldWrapProcessSection({ ...base, hasThinking: true, streamLength: 1 })).toBe(true);
    expect(shouldWrapProcessSection({ ...base, toolCount: 2, streamLength: 1 })).toBe(true);
  });

  it('thinking 追加新空段:stream 非空即保持摘要条(防工具后重新思考瞬间闪现)', () => {
    // 空段尚无 reasoning/text,hasThinking 由 isReasoning 兜底为 true
    expect(shouldWrapProcessSection({ ...base, hasThinking: true, streamLength: 1 })).toBe(true);
  });

  it('确认阶段:complete 已清空 stream → 不包(避免空摘要条双 process-summary)', () => {
    // 确认卡挂起期间 toolCalls 保留待确认记录(toolCount>0),但 stream 已被清空
    expect(shouldWrapProcessSection({ ...base, toolCount: 1, streamLength: 0 })).toBe(false);
  });

  it('确认流:回合已固化(roundCommitted) → 不包(避免与固化回合重 key 双摘要条)', () => {
    // continueAfterConfirmation 追加 thinking,stream 非空但回合内容已固化
    expect(
      shouldWrapProcessSection({ ...base, toolCount: 1, streamLength: 1, roundCommitted: true }),
    ).toBe(false);
  });

  it('纯文本回合:无思考无工具 → 不包', () => {
    expect(shouldWrapProcessSection({ ...base, streamLength: 1 })).toBe(false);
  });
});
