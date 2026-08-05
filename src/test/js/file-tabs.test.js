/**
 * FileTabs diff 标签去重 / toolCallId 定位参数单元测试
 *
 * 覆盖：
 *   - openDiffTab 新建标签：diff-tab class + dataset.toolCallId 暂存
 *   - openDiffTab 重复打开同文件（未激活）：去重不新建、更新 toolCallId、触发切换
 *   - openDiffTab 重复打开同文件（已激活）：force 强制触发回调（重新定位到新 toolCallId）
 *   - 普通 openTab 重复打开同文件（已激活）：保持原行为不重复触发
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FileTabs } from '../../main/resources/static/js/components/FileTabs.js';

function createTabs(onTabSelect) {
  const container = document.createElement('div');
  const tabs = new FileTabs({
    container,
    onTabSelect: onTabSelect || vi.fn(),
    onTabClose: vi.fn(),
  });
  return { container, tabs };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FileTabs openDiffTab', () => {
  it('新建 diff 标签：diff-tab class + dataset 暂存 toolCallId', async () => {
    const onSelect = vi.fn();
    const { tabs } = createTabs(onSelect);
    await tabs.openDiffTab('src/app.js', 'app.js (diff)', 'call-123');

    const key = 'diff:src/app.js';
    expect(tabs.openPaths).toContain(key);
    const tabEl = tabs._tabs.get(key);
    expect(tabEl).toBeTruthy();
    expect(tabEl.classList.contains('diff-tab')).toBe(true);
    expect(tabEl.dataset.isDiff).toBe('true');
    expect(tabEl.dataset.toolCallId).toBe('call-123');
    // 首次打开即激活并触发回调
    expect(onSelect).toHaveBeenCalledWith(key);
  });

  it('不传 toolCallId 时 dataset 为空字符串（默认整体视图）', async () => {
    const { tabs } = createTabs();
    await tabs.openDiffTab('src/utils.js', 'utils.js (diff)');
    const tabEl = tabs._tabs.get('diff:src/utils.js');
    expect(tabEl.dataset.toolCallId).toBe('');
  });

  it('重复打开同文件（未激活）：去重不新建、更新 toolCallId、触发切换', async () => {
    const onSelect = vi.fn();
    const { tabs } = createTabs(onSelect);
    await tabs.openDiffTab('src/app.js', 'app.js (diff)', 'call-1');
    onSelect.mockClear();

    // 先打开另一个文件 tab 使 diff 标签变为非激活
    await tabs.openTab('src/other.js', 'other.js');
    onSelect.mockClear();

    await tabs.openDiffTab('src/app.js', 'app.js (diff)', 'call-2');

    expect(tabs.count).toBe(2); // 未新建
    const tabEl = tabs._tabs.get('diff:src/app.js');
    expect(tabEl.dataset.toolCallId).toBe('call-2'); // 更新定位参数
    expect(tabs.activePath).toBe('diff:src/app.js'); // 切换激活
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('diff:src/app.js');
  });

  it('重复打开同文件（已激活）：force 强制触发回调以便重新定位', async () => {
    const onSelect = vi.fn();
    const { tabs } = createTabs(onSelect);
    await tabs.openDiffTab('src/app.js', 'app.js (diff)', 'call-1');
    onSelect.mockClear();

    // 已激活时重复打开同一 diff 标签：仍应触发回调（force），携带更新后的 toolCallId
    await tabs.openDiffTab('src/app.js', 'app.js (diff)', 'call-2');

    const tabEl = tabs._tabs.get('diff:src/app.js');
    expect(tabEl.dataset.toolCallId).toBe('call-2');
    expect(tabs.count).toBe(1); // 不新建
    expect(onSelect).toHaveBeenCalledTimes(1); // 已激活也强制触发一次
    expect(onSelect).toHaveBeenCalledWith('diff:src/app.js');
  });

  it('普通文件 tab 已激活时重复打开不重复触发回调（原行为不变）', async () => {
    const onSelect = vi.fn();
    const { tabs } = createTabs(onSelect);
    await tabs.openTab('src/app.js', 'app.js');
    onSelect.mockClear();

    await tabs.openTab('src/app.js', 'app.js');
    expect(tabs.count).toBe(1);
    expect(onSelect).not.toHaveBeenCalled(); // activePath 相同，提前 return
  });
});
