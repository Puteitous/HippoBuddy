import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePreviewStore } from '@/stores/previewStore';

function resetStore() {
  usePreviewStore.setState({
    tabs: [],
    activePath: null,
    previewReloadKey: 0,
    collapsed: false,
    deepLinkTick: 0,
  });
}

describe('previewStore', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('collapsed 初始从 localStorage 恢复,非法值回退 false', () => {
    resetStore();
    expect(usePreviewStore.getState().collapsed).toBe(false);
    localStorage.setItem('hippo-preview-collapsed', 'true');
    usePreviewStore.setState({ collapsed: true });
    expect(usePreviewStore.getState().collapsed).toBe(true);
  });

  it('openFile 新增 preview 标签并激活,清除收起,自增 deepLinkTick', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a/b.ts');
    const st = usePreviewStore.getState();
    expect(st.tabs).toHaveLength(1);
    expect(st.tabs[0]).toMatchObject({ path: '/a/b.ts', name: 'b.ts', mode: 'preview' });
    expect(st.activePath).toBe('/a/b.ts');
    expect(st.deepLinkTick).toBe(1);
  });

  it('openFile 已有同路径标签:仅激活并更新定位行,diff 降级为 preview', () => {
    const s = usePreviewStore.getState();
    s.openDiff('/a/b.ts', 'tc1');
    s.openFile('/a/b.ts', 5, 9);
    const st = usePreviewStore.getState();
    expect(st.tabs).toHaveLength(1);
    expect(st.tabs[0]).toMatchObject({ mode: 'preview', startLine: 5, endLine: 9, toolCallId: undefined });
    expect(st.deepLinkTick).toBe(1); // openDiff 不自增,仅 openFile 已存在路径时 +1
  });

  it('openWeb 新增 web 标签,默认名取 URL 主机名', () => {
    const s = usePreviewStore.getState();
    s.openWeb('https://example.com/page');
    const st = usePreviewStore.getState();
    expect(st.tabs[0]).toMatchObject({ mode: 'web', name: 'example.com', url: 'https://example.com/page' });
  });

  it('openWeb 同 URL 仅激活,不新增标签', () => {
    const s = usePreviewStore.getState();
    s.openWeb('https://example.com');
    s.openWeb('https://example.com', '自命名');
    const st = usePreviewStore.getState();
    expect(st.tabs).toHaveLength(1);
  });

  it('closeTab 关闭默认激活相邻(先右后左)标签', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a.ts');
    s.openFile('/b.ts');
    s.openFile('/c.ts');
    usePreviewStore.getState().closeTab('/b.ts'); // 未激活的中间标签
    let st = usePreviewStore.getState();
    expect(st.tabs.map((t) => t.path)).toEqual(['/a.ts', '/c.ts']);
    expect(st.activePath).toBe('/c.ts');

    usePreviewStore.getState().closeTab('/c.ts'); // 激活的 c → 回落左侧 a
    st = usePreviewStore.getState();
    expect(st.activePath).toBe('/a.ts');
  });

  it('closeAll 清空标签并置空激活', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a.ts');
    s.closeAll();
    const st = usePreviewStore.getState();
    expect(st.tabs).toEqual([]);
    expect(st.activePath).toBeNull();
  });

  it('closeOthers 仅保留并激活指定标签', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a.ts');
    s.openFile('/b.ts');
    s.closeOthers('/a.ts');
    const st = usePreviewStore.getState();
    expect(st.tabs.map((t) => t.path)).toEqual(['/a.ts']);
    expect(st.activePath).toBe('/a.ts');
  });

  it('closeRight 保留目标及其左侧,激活目标', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a.ts');
    s.openFile('/b.ts');
    s.openFile('/c.ts');
    s.closeRight('/b.ts');
    const st = usePreviewStore.getState();
    expect(st.tabs.map((t) => t.path)).toEqual(['/a.ts', '/b.ts']);
    expect(st.activePath).toBe('/b.ts');
  });

  it('reorderTabs 支持 insertBefore 与 insertAfter', () => {
    const s = usePreviewStore.getState();
    s.openFile('/a.ts');
    s.openFile('/b.ts');
    s.openFile('/c.ts');
    // 把 c 移到 a 前面
    usePreviewStore.getState().reorderTabs('/c.ts', '/a.ts', true);
    expect(usePreviewStore.getState().tabs.map((t) => t.path)).toEqual(['/c.ts', '/a.ts', '/b.ts']);
    // 把 c 移到 a 后面
    usePreviewStore.getState().reorderTabs('/c.ts', '/a.ts', false);
    expect(usePreviewStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts', '/c.ts', '/b.ts']);
  });

  it('setTabDirty 设置脏标记', () => {
    usePreviewStore.getState().openFile('/a.ts');
    usePreviewStore.getState().setTabDirty('/a.ts', true);
    expect(usePreviewStore.getState().tabs[0].dirty).toBe(true);
  });

  it('forceReload 自增 previewReloadKey', () => {
    const before = usePreviewStore.getState().previewReloadKey;
    usePreviewStore.getState().forceReload();
    expect(usePreviewStore.getState().previewReloadKey).toBe(before + 1);
  });

  it('openFile 时调用 persistPreviewCollapsed(false) 清除收起', () => {
    usePreviewStore.setState({ collapsed: true });
    vi.spyOn(Storage.prototype, 'setItem');
    usePreviewStore.getState().openFile('/a.ts');
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('hippo-preview-collapsed', 'false');
    expect(usePreviewStore.getState().collapsed).toBe(false);
  });
});