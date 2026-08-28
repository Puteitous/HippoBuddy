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
    skillMarketOpen: false,
    settingsInitialPage: 'general',
    panelLayout: 'preview-left',
    sessionInputDrafts: {},
    heroPendingDraft: '',
    sessionDisplayNames: {},
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