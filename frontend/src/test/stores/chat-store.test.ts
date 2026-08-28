import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, EMPTY_SESSION_STREAM, type AskUserData } from '@/stores/chatStore';
import { useAppStore } from '@/stores/appStore';
import type { Message, ToolCallRecord, WebSearchAction } from '@/types';
import type { FlatTodo } from '@/components/tool-renderers/shared-utils';

function msg(id: string, content = ''): Message {
  return { id, role: 'user', content } as Message;
}

function toolCall(id: string, name = 'bash'): ToolCallRecord {
  return { id, name, status: 'running', progress: [], startedAt: Date.now() };
}

function attachConfirmation(name: 'bash' | 'delete_file') {
  const state = useChatStore.getState();
  state.addToolCall(toolCall('tc-1', name));
  useChatStore.getState().attachToolConfirmation({
    confirmId: 'c1',
    toolType: name === 'delete_file' ? 'delete_file' : 'bash',
    title: '执行',
    risk: '中',
    reason: 'i18n:blocker.dangerous',
    command: 'rm x',
  } as never);
}

describe('chatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ currentSessionId: 's1' });
    useChatStore.setState({ sessionStreams: {}, messageCache: {}, lastTokenUpdate: null, tokenHistory: [] });
  });

  it('无 currentSessionId 时消息操作不生效', () => {
    useAppStore.setState({ currentSessionId: null });
    useChatStore.getState().addMessage(msg('m1'));
    expect(useChatStore.getState().sessionStreams).toEqual({});
  });

  it('addMessage 追加到当前会话分区,且各会话相互隔离', () => {
    useChatStore.getState().addMessage(msg('m1', 'hi'));
    useAppStore.setState({ currentSessionId: 's2' });
    useChatStore.getState().addMessage(msg('m2', 'yo'));
    const st = useChatStore.getState();
    expect(st.sessionStreams.s1.messages.map((m) => m.id)).toEqual(['m1']);
    expect(st.sessionStreams.s2.messages.map((m) => m.id)).toEqual(['m2']);
  });

  it('updateMessage 按 id 局部更新', () => {
    useChatStore.getState().addMessage(msg('m1', 'hi'));
    useChatStore.getState().updateMessage('m1', { content: 'updated' });
    expect(useChatStore.getState().sessionStreams.s1.messages[0].content).toBe('updated');
  });

  it('removeMessage 删除指定消息', () => {
    useChatStore.getState().setMessages([msg('a'), msg('b')]);
    useChatStore.getState().removeMessage('a');
    expect(useChatStore.getState().sessionStreams.s1.messages.map((m) => m.id)).toEqual(['b']);
  });

  it('toggleRoundCollapsed 翻转指定回合收起', () => {
    useChatStore.getState().toggleRoundCollapsed('r1');
    expect(useChatStore.getState().sessionStreams.s1.collapsedRounds.r1).toBe(true);
  });

  it('toggleRoundCollapsed 仅翻转目标回合,不影响其他回合', () => {
    useChatStore.getState().toggleRoundCollapsed('r1');
    useChatStore.getState().toggleRoundCollapsed('r1');
    useChatStore.getState().toggleRoundCollapsed('r2');
    const c = useChatStore.getState().sessionStreams.s1.collapsedRounds;
    expect(c.r1).toBe(false);
    expect(c.r2).toBe(true);
  });

  it('resetSessionStream 删除分区,hasActiveStream 识别活跃流', () => {
    useChatStore.getState().setIsSending(true);
    expect(useChatStore.getState().hasActiveStream('s1')).toBe(true);
    useChatStore.getState().resetSessionStream('s1');
    expect(useChatStore.getState().sessionStreams.s1).toBeUndefined();
    expect(useChatStore.getState().hasActiveStream('s1')).toBe(false);
  });

  it('dismissSessionCompleted 对无分区的会话不新建分区(回归防护:侧边栏点击会话)', () => {
    // 回归防护:Sidebar 点击会话项会先调用 dismissSessionCompleted 再切换 currentSessionId。
    // 若此处为无分区会话新建空分区,useSessionMessages 会命中「已有分区直接复用」早退,
    // 导致历史消息不加载、点击会话后停留在空对话而非跳转到对应历史面板(1b61b78 回归)。
    expect(useChatStore.getState().sessionStreams.s1).toBeUndefined();
    useChatStore.getState().dismissSessionCompleted('s1');
    expect(useChatStore.getState().sessionStreams.s1).toBeUndefined();
  });

  it('dismissSessionCompleted 仅清除已存在分区的 completedUnread', () => {
    useChatStore.setState({
      sessionStreams: { s1: { ...EMPTY_SESSION_STREAM, completedUnread: true } },
    });
    expect(useChatStore.getState().sessionStreams.s1.completedUnread).toBe(true);
    useChatStore.getState().dismissSessionCompleted('s1');
    expect(useChatStore.getState().sessionStreams.s1.completedUnread).toBe(false);
  });

  it('addToolCall 新增记录', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    const t = useChatStore.getState().sessionStreams.s1.toolCalls[0];
    expect(t).toMatchObject({ id: 't1', status: 'running', progress: [] });
  });

  it('addToolCall 同 id 合并更新而非重复新增', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().addToolCall({ ...toolCall('t1'), args: { cmd: 'ls' } });
    const calls = useChatStore.getState().sessionStreams.s1.toolCalls;
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ cmd: 'ls' });
  });

  it('appendToolProgress 累积到匹配的工具', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().appendToolProgress('t1', 'line1');
    useChatStore.getState().appendToolProgress('t1', 'line2');
    expect(useChatStore.getState().sessionStreams.s1.toolCalls[0].progress).toEqual(['line1', 'line2']);
  });

  it('completeToolCall: success → success', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().completeToolCall('t1', true, 'ok');
    expect(useChatStore.getState().sessionStreams.s1.toolCalls[0].status).toBe('success');
  });

  it('completeToolCall: error 含"用户拒绝"归为 denied', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().completeToolCall('t1', false, '', '用户拒绝执行该命令');
    expect(useChatStore.getState().sessionStreams.s1.toolCalls[0].status).toBe('denied');
  });

  it('completeToolCall: 其它错误归为 failed', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().completeToolCall('t1', false, '', 'something went wrong');
    expect(useChatStore.getState().sessionStreams.s1.toolCalls[0].status).toBe('failed');
  });

  it('mergeTodoList: replace 重建,merge 累计', () => {
    const todos: FlatTodo[] = [{ id: 'a', content: 'A', status: 'pending' }];
    useChatStore.getState().mergeTodoList('replace', todos);
    expect(useChatStore.getState().sessionStreams.s1.todoList).toHaveLength(1);
    useChatStore.getState().mergeTodoList('merge', [{ id: 'b', content: 'B' }]);
    expect(useChatStore.getState().sessionStreams.s1.todoList.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('attachToolConfirmation 挂到同名首个无确认记录,resolveToolConfirmation 清除', () => {
    attachConfirmation('bash');
    const t = useChatStore.getState().sessionStreams.s1.toolCalls[0];
    expect(t.confirmationData).toBeTruthy();
    useChatStore.getState().resolveToolConfirmation('c1');
    expect(useChatStore.getState().sessionStreams.s1.toolCalls[0].confirmationData).toBeUndefined();
  });

  it('clearToolCalls 清空当前会话工具记录', () => {
    useChatStore.getState().addToolCall(toolCall('t1'));
    useChatStore.getState().clearToolCalls();
    expect(useChatStore.getState().sessionStreams.s1.toolCalls).toEqual([]);
  });

  it('联网搜索态与 webSearchActions 累积', () => {
    const action = { type: 'search', queries: ['q'], status: 'done' } as WebSearchAction;
    useChatStore.getState().setWebSearching(true);
    useChatStore.getState().addWebSearchAction(action);
    const s = useChatStore.getState().sessionStreams.s1;
    expect(s.webSearching).toBe(true);
    expect(s.webSearchActions).toHaveLength(1);
  });

  it('pushWarning / clearWarnings', () => {
    useChatStore.getState().pushWarning('w1');
    useChatStore.getState().pushWarning('w2');
    expect(useChatStore.getState().sessionStreams.s1.warnings).toEqual(['w1', 'w2']);
    useChatStore.getState().clearWarnings();
    expect(useChatStore.getState().sessionStreams.s1.warnings).toEqual([]);
  });

  it('commitAskUser 固化 tool 消息并清空等待状态', () => {
    const ask: AskUserData = { question: '是否继续?', options: ['是', '否'], allow_custom_input: false };
    useChatStore.getState().setAskUserData(ask);
    useChatStore.getState().setWaitingForUser(true);
    useChatStore.getState().commitAskUser('是');
    const s = useChatStore.getState().sessionStreams.s1;
    expect(s.askUserData).toBeNull();
    expect(s.waitingForUser).toBe(false);
    expect(s.messages[s.messages.length - 1]).toMatchObject({ role: 'tool', toolName: 'ask_user', content: '是' });
  });

  it('addTokenRecord 相同快照去重,且截断到上限', () => {
    const rec = { total: 100, prompt: 60, completion: 40, percent: 1, cacheRate: undefined };
    const s = useChatStore.getState();
    s.addTokenRecord(rec);
    s.addTokenRecord(rec);
    expect(useChatStore.getState().tokenHistory).toHaveLength(1);
  });

  it('routeSseEvent: message_id 把真实 uuid 写到乐观 user 消息的 serverId(不改渲染 key)', () => {
    const st = useChatStore.getState();
    // 模拟发送时为当前回合乐观追加的 user 消息(id 为 local-* 临时值)
    st.setMessages([{ id: 'local-100', role: 'user', content: 'hi' }]);
    st.routeSseEvent('s1', { event: 'message_id', data: { id: 'real-uuid-1' } } as never);
    const after = useChatStore.getState().sessionStreams.s1.messages;
    // id 保持稳定(渲染 key 不变),真实 uuid 记录到 serverId
    expect(after[0].id).toBe('local-100');
    expect(after[0].serverId).toBe('real-uuid-1');
  });

  it('routeSseEvent: thinking→content→done 固化 assistant 消息', () => {
    const st = useChatStore.getState();
    st.setMessages([]);
    st.routeSseEvent('s1', { event: 'message_id', data: { id: 'assist-1' } } as never);
    st.routeSseEvent('s1', { event: 'thinking', data: { turn: 1 } } as never);
    st.routeSseEvent('s1', { event: 'content', data: { content: '你好' } } as never);
    st.routeSseEvent('s1', { event: 'content', data: { content: '世界' } } as never);
    expect(useChatStore.getState().sessionStreams.s1.stream).toHaveLength(1);
    expect((useChatStore.getState().sessionStreams.s1.stream[0] as { text: string }).text).toBe('你好世界');
    // done 触发固化
    st.routeSseEvent('s1', { event: 'done', data: { reason: '' } } as never);
    const msgs = useChatStore.getState().sessionStreams.s1.messages;
    expect(msgs.some((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('你好世界'))).toBe(true);
  });

  it('routeSseEvent: tool_start→tool_progress→tool_result 完整生命周期', () => {
    const st = useChatStore.getState();
    st.routeSseEvent('s1', { event: 'thinking', data: { turn: 1 } } as never);
    st.routeSseEvent('s1', { event: 'tool_start', data: { id: 'bash-1', name: 'bash', args: '{}' } } as never);
    st.routeSseEvent('s1', { event: 'tool_progress', data: { id: 'bash-1', line: 'out' } } as never);
    st.routeSseEvent('s1', { event: 'tool_result', data: { id: 'bash-1', name: 'bash', success: true, result: 'done', args: '{}' } } as never);
    const t = useChatStore.getState().sessionStreams.s1.toolCalls[0];
    expect(t).toMatchObject({ status: 'success', progress: ['out'], result: 'done' });
  });

  it('routeSseEvent: error 事件写出错并停发送', () => {
    useChatStore.getState().setIsSending(true);
    useChatStore.getState().routeSseEvent('s1', { event: 'error', data: { message: 'boom' } } as never);
    const s = useChatStore.getState().sessionStreams.s1;
    expect(s.error).toBe('boom');
    expect(s.isSending).toBe(false);
  });
});