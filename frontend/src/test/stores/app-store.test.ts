import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/appStore';
import type { Session } from '@/types';

function session(id: string, partial: Partial<Session> = {}): Session {
  return { id, title: '', mode: 'chat', messageCount: 0, active: false, running: false, createdAt: '', ...partial };
}

function reset() {
  useAppStore.setState({
    sessions: [],
    currentSessionId: null,
    mode: 'coding',
    workspacePath: '',
    view: 'chat',
    activityBarHidden: false,
    activityPanel: null,
    activityPanelPinned: false,
    pluginMarketOpen: false,
    settingsInitialPage: 'general',
    panelLayout: 'preview-left',
    sessionInputDrafts: {},
    heroPendingDraft: '',
    sessionDisplayNames: {},
    openTabs: [],
    tabLastActiveAt: {},
    sessionTabLimit: 10,
  });
}

describe('appStore', () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it('setView 切换主视图', () => {
    useAppStore.getState().setView('settings');
    expect(useAppStore.getState().view).toBe('settings');
  });

  it('setCurrentSession 持久化并恢复会话已固化的 mode', () => {
    useAppStore.getState().setSessions([
      session('s1', { mode: 'coding' }),
      session('s2', { mode: 'chat' }),
    ]);
    useAppStore.getState().setCurrentSession('s2');
    expect(useAppStore.getState().currentSessionId).toBe('s2');
    expect(useAppStore.getState().mode).toBe('chat');
    expect(localStorage.getItem('hippo-current-session')).toBe('s2');
  });

  it('removeSession 清除 currentSessionId(当被删的是当前会话)', () => {
    useAppStore.getState().setCurrentSession('s1');
    localStorage.setItem('hippo-current-session', 's1');
    useAppStore.getState().removeSession('s1');
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(useAppStore.getState().currentSessionId).toBeNull();
    // 持久化的当前会话 id 也须清除:刷新后应回到 hero,而非被 AppShell 兜底选中其它会话
    expect(localStorage.getItem('hippo-current-session')).toBeNull();
  });

  it('removeSession 不清理其它会话的 currentSessionId', () => {
    useAppStore.getState().setSessions([session('s1'), session('s2')]);
    useAppStore.getState().setCurrentSession('s2');
    useAppStore.getState().removeSession('s1');
    expect(useAppStore.getState().currentSessionId).toBe('s2');
  });

  it('setSessions 为空时清除 localStorage 缓存', () => {
    useAppStore.getState().setSessions([session('s1')]);
    useAppStore.getState().setSessions([]);
    expect(localStorage.getItem('hippo-session-list-cache')).toBeNull();
  });

  it('setSessionDisplayName 仅首次生效', () => {
    useAppStore.getState().setSessionDisplayName('s1', '新会话');
    expect(useAppStore.getState().sessionDisplayNames['s1']).toBe('新会话');
    useAppStore.getState().setSessionDisplayName('s1', '覆盖');
    expect(useAppStore.getState().sessionDisplayNames['s1']).toBe('新会话');
  });

  it('createNewSession 生成 web-* id,携带 heroPendingDraft,写入 currentSessionId', () => {
    useAppStore.getState().saveHeroPendingDraft('需要看一下X');
    const id = useAppStore.getState().createNewSession();
    expect(id.startsWith('web-')).toBe(true);
    const st = useAppStore.getState();
    expect(st.currentSessionId).toBe(id);
    expect(st.sessionInputDrafts[id]).toBe('需要看一下X');
    expect(localStorage.getItem('hippo-current-session')).toBe(id);
    // 新建即开标签并激活
    expect(st.openTabs).toEqual([id]);
  });

  it('setCurrentSession 自动把会话加入标签栏并持久化', () => {
    useAppStore.getState().setCurrentSession('s1');
    useAppStore.getState().setCurrentSession('s2');
    const st = useAppStore.getState();
    expect(st.openTabs).toEqual(['s1', 's2']);
    expect(JSON.parse(localStorage.getItem('hippo-open-tabs') ?? '[]')).toEqual(['s1', 's2']);
    // 切回已有标签不重复添加,也不改变顺序
    useAppStore.getState().setCurrentSession('s1');
    expect(useAppStore.getState().openTabs).toEqual(['s1', 's2']);
  });

  it('标签超过上限时淘汰最久未激活的,只移出标签不删会话', () => {
    useAppStore.getState().setSessions([session('s1'), session('s2'), session('s3')]);
    useAppStore.setState({
      openTabs: ['s1', 's2', 's3'],
      tabLastActiveAt: { s1: 1, s2: 2, s3: 3 },
      sessionTabLimit: 2,
    });

    useAppStore.getState().setCurrentSession('s4');

    const st = useAppStore.getState();
    expect(st.openTabs).toEqual(['s3', 's4']);
    // 被淘汰的会话仍在 sessions 列表中(可从 Sidebar 找回)
    expect(st.sessions.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('上限为 0 时不淘汰标签', () => {
    useAppStore.setState({ openTabs: ['a', 'b', 'c'], sessionTabLimit: 0 });
    useAppStore.getState().setCurrentSession('d');
    expect(useAppStore.getState().openTabs).toEqual(['a', 'b', 'c', 'd']);
  });

  it('closeTab 关闭非当前标签不改变当前会话', () => {
    useAppStore.getState().setCurrentSession('s1');
    useAppStore.getState().setCurrentSession('s2');
    useAppStore.getState().closeTab('s1');
    const st = useAppStore.getState();
    expect(st.openTabs).toEqual(['s2']);
    expect(st.currentSessionId).toBe('s2');
  });

  it('closeTab 关闭当前标签时优先激活右邻,其次左邻,没有则回 hero', () => {
    useAppStore.getState().setCurrentSession('s1');
    useAppStore.getState().setCurrentSession('s2');
    useAppStore.getState().setCurrentSession('s3');
    useAppStore.getState().setCurrentSession('s2');

    // 右邻 s3
    useAppStore.getState().closeTab('s2');
    expect(useAppStore.getState().currentSessionId).toBe('s3');

    // 右邻不存在 → 左邻 s1
    useAppStore.getState().closeTab('s3');
    expect(useAppStore.getState().currentSessionId).toBe('s1');

    // 关掉最后一个标签 → hero
    useAppStore.getState().closeTab('s1');
    const st = useAppStore.getState();
    expect(st.openTabs).toEqual([]);
    expect(st.currentSessionId).toBeNull();
    expect(localStorage.getItem('hippo-current-session')).toBeNull();
  });

  it('removeSession 同步移出标签,删除当前会话时激活相邻标签', () => {
    useAppStore.getState().setSessions([session('s1'), session('s2'), session('s3')]);
    useAppStore.getState().setCurrentSession('s1');
    useAppStore.getState().setCurrentSession('s2');
    useAppStore.getState().setCurrentSession('s3');
    useAppStore.getState().setCurrentSession('s2');

    useAppStore.getState().removeSession('s2');

    const st = useAppStore.getState();
    expect(st.openTabs).toEqual(['s1', 's3']);
    expect(st.currentSessionId).toBe('s3');
  });

  it('setSessionTabLimit 调小上限时立即裁剪,保留当前会话', () => {
    useAppStore.getState().setCurrentSession('s1');
    useAppStore.getState().setCurrentSession('s2');
    useAppStore.getState().setCurrentSession('s3');
    useAppStore.setState({ tabLastActiveAt: { s1: 1, s2: 2, s3: 3 } });

    useAppStore.getState().setSessionTabLimit(1);

    const st = useAppStore.getState();
    expect(st.sessionTabLimit).toBe(1);
    expect(st.openTabs).toEqual(['s3']);
    expect(localStorage.getItem('hippo-session-tab-limit')).toBe('1');
  });

  it('toggleActivityBar 翻转并持久化 hidden', () => {
    expect(useAppStore.getState().activityBarHidden).toBe(false);
    useAppStore.getState().toggleActivityBar();
    expect(useAppStore.getState().activityBarHidden).toBe(true);
    expect(localStorage.getItem('hippo-activity-bar-hidden')).toBe('true');
  });

  it('openActivityPanel 固定展开面板,再次打开同一面板则 toggle 关闭', () => {
    useAppStore.getState().openActivityPanel('token');
    let st = useAppStore.getState();
    expect(st.activityPanel).toBe('token');
    expect(st.activityPanelPinned).toBe(true);

    useAppStore.getState().openActivityPanel('token');
    st = useAppStore.getState();
    expect(st.activityPanel).toBeNull();
    expect(st.activityPanelPinned).toBe(false);
  });

  it('setPanelLayout 持久化布局偏好', () => {
    useAppStore.getState().setPanelLayout('chat-left');
    expect(useAppStore.getState().panelLayout).toBe('chat-left');
    expect(localStorage.getItem('hippo-layout')).toBe('chat-left');
  });
});