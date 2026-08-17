import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelSelectorPanel } from '../../main/resources/static/js/components/ModelSelectorPanel.js';

const t = (key) => window.i18n.t(key);

// jsdom 中多个测试共享 document.body，测试间清理面板 DOM 防止残留干扰
afterEach(() => {
  document.body.innerHTML = '';
});

/** 构造标准配置数据（deepseek 当前 + openai 历史） */
function makeData(overrides = {}) {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    modelHistory: [
      { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high', thinkingEnabled: true },
      { provider: 'openai', model: 'gpt-4o', reasoningEffort: '', thinkingEnabled: true },
    ],
    ...overrides,
  };
}

function makePanel(data, callbacks = {}) {
  // 模拟状态栏宿主：#statusBarModelSelector（.status-bar-item，position:relative）
  const host = document.createElement('span');
  host.id = 'statusBarModelSelector';
  host.className = 'status-bar-item';
  const trigger = document.createElement('button');
  trigger.id = 'modelQuickSelect';
  host.appendChild(trigger);
  document.body.appendChild(host);
  const panel = new ModelSelectorPanel({
    trigger,
    onModelSelect: callbacks.onModelSelect || vi.fn(),
    onAddModel: callbacks.onAddModel || vi.fn(),
    onEffortSelect: callbacks.onEffortSelect || vi.fn(),
  });
  panel.update(data);
  return { trigger, host, panel };
}

/** 点击第一级 menu 入口（.msp-menu-item），按 label 查找 */
function clickMenu(container, labelText) {
  const rows = container.querySelectorAll('.msp-menu-item');
  for (const row of rows) {
    if (row.querySelector('.msp-menu-label')?.textContent === labelText) {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return row;
    }
  }
  throw new Error(`未找到 msp-menu-item: ${labelText}`);
}

/** 点击第二级列表项（.msp-item），按 label 查找 */
function clickRow(container, labelText) {
  const rows = container.querySelectorAll('.msp-item');
  for (const row of rows) {
    if (row.querySelector('.msp-item-label')?.textContent === labelText) {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return row;
    }
  }
  throw new Error(`未找到 msp-item: ${labelText}`);
}

describe('ModelSelectorPanel — 双信息触发器', () => {
  it('显示「模型名 · 当前档位」', () => {
    const { trigger } = makePanel(makeData());
    expect(trigger.textContent).toContain('deepseek-chat');
    expect(trigger.textContent).toContain('·');
    expect(trigger.textContent).toContain('high');
  });

  it('档位为 Default（未设置）时不显示档位部分，触发器只含模型名', () => {
    const { trigger } = makePanel(makeData({ modelHistory: [
      { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: '', thinkingEnabled: true },
    ] }));
    expect(trigger.textContent).toContain('deepseek-chat');
    expect(trigger.textContent).not.toContain('·');
    expect(trigger.textContent).not.toContain('Default');
  });

  it('不支持的 Provider（anthropic）不显示档位部分', () => {
    const { trigger } = makePanel(makeData({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      modelHistory: [{ provider: 'anthropic', model: 'claude-sonnet-4', reasoningEffort: '', thinkingEnabled: true }],
    }));
    expect(trigger.textContent).toContain('claude-sonnet-4');
    expect(trigger.textContent).not.toContain('·');
  });

  it('非法 effort 残留自动回退，回退后不显示档位部分（openai 下的 max）', () => {
    const { trigger } = makePanel(makeData({
      provider: 'openai',
      model: 'gpt-4o',
      modelHistory: [{ provider: 'openai', model: 'gpt-4o', reasoningEffort: 'max', thinkingEnabled: true }],
    }));
    expect(trigger.textContent).toContain('gpt-4o');
    expect(trigger.textContent).not.toContain('·');
    expect(trigger.textContent).not.toContain('max');
  });
});

describe('ModelSelectorPanel — 两级导航', () => {
  it('打开后是第一级 menu：模型/思考强度两行，带当前值摘要与箭头', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    const menus = [...document.querySelectorAll('.msp-menu-item')];
    expect(menus.length).toBe(2);
    const labels = menus.map(m => m.querySelector('.msp-menu-label').textContent);
    expect(labels).toEqual([t('msp.modelSection'), t('msp.effortSection')]);
    const values = menus.map(m => m.querySelector('.msp-menu-value').textContent);
    expect(values).toEqual(['deepseek-chat', 'high']);
    // 每行带 › 箭头，且第一级没有二级列表容器
    expect(menus.every(m => m.querySelector('.msp-menu-arrow')?.textContent === '›')).toBe(true);
    expect(document.querySelector('.msp-body')).toBeNull();
  });

  it('档位为 Default 时摘要显示 Default', () => {
    const { panel } = makePanel(makeData({ modelHistory: [
      { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: '', thinkingEnabled: true },
    ] }));
    panel.open();
    const effortMenu = [...document.querySelectorAll('.msp-menu-item')][1];
    expect(effortMenu.querySelector('.msp-menu-value').textContent).toBe('Default');
  });

  it('不支持的 Provider（anthropic）menu 只有模型行', () => {
    const { panel } = makePanel(makeData({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      modelHistory: [{ provider: 'anthropic', model: 'claude-sonnet-4', reasoningEffort: '', thinkingEnabled: true }],
    }));
    panel.open();
    const menus = [...document.querySelectorAll('.msp-menu-item')];
    expect(menus.length).toBe(1);
    expect(menus[0].querySelector('.msp-menu-label').textContent).toBe(t('msp.modelSection'));
    expect(menus[0].querySelector('.msp-menu-value').textContent).toBe('claude-sonnet-4');
  });

  it('Thinking Mode 关闭时思考强度入口置灰不可进，带 title 提示', () => {
    const { panel } = makePanel(makeData({
      modelHistory: [{ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high', thinkingEnabled: false }],
    }));
    panel.open();
    const effortMenu = [...document.querySelectorAll('.msp-menu-item')][1];
    expect(effortMenu.classList.contains('disabled')).toBe(true);
    expect(effortMenu.title).toBe(t('chatui.effortDisabledTitle'));
    effortMenu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // 点击不进入二级
    expect(document.querySelector('.msp-header')).toBeNull();
    expect(document.querySelector('.msp-body')).toBeNull();
  });

  it('点击模型入口 → 第二级模型列表：header 返回键 + 历史模型 + 当前高亮', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.modelSection'));
    const header = document.querySelector('.msp-header');
    expect(header).not.toBeNull();
    expect(header.querySelector('.msp-back')).not.toBeNull();
    expect(header.textContent).toContain(t('msp.modelSection'));
    const labels = [...document.querySelectorAll('.msp-item-label')].map(e => e.textContent);
    expect(labels).toContain('deepseek-chat');
    expect(labels).toContain('gpt-4o');
    const selected = document.querySelector('.msp-item.selected .msp-item-label');
    expect(selected?.textContent).toBe('deepseek-chat');
  });

  it('点击思考强度入口 → 第二级档位列表：官方档位 + 当前高亮', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.effortSection'));
    const header = document.querySelector('.msp-header');
    expect(header.textContent).toContain(t('msp.effortSection'));
    const labels = [...document.querySelectorAll('.msp-item-label')].map(e => e.textContent);
    expect(labels).toEqual(['Default', 'low', 'high', 'max']);
    expect(document.querySelector('.msp-item.selected .msp-item-label')?.textContent).toBe('high');
  });

  it('二级返回键 → 回到第一级 menu', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.modelSection'));
    document.querySelector('.msp-back').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const menus = [...document.querySelectorAll('.msp-menu-item')];
    expect(menus.length).toBe(2);
    expect(document.querySelector('.msp-header')).toBeNull();
  });

  it('每次 open 都从第一级 menu 开始', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.modelSection'));
    expect(document.querySelector('.msp-header')).not.toBeNull();
    panel.close();
    panel.open();
    expect(document.querySelector('.msp-header')).toBeNull();
    expect(document.querySelectorAll('.msp-menu-item').length).toBe(2);
  });
});

describe('ModelSelectorPanel — 交互回调', () => {
  it('二级点击模型项 → onModelSelect(provider, model) 并关闭面板', () => {
    const callbacks = { onModelSelect: vi.fn() };
    const { panel } = makePanel(makeData(), callbacks);
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.modelSection'));
    clickRow(document.querySelector('.msp-panel'), 'gpt-4o');
    expect(callbacks.onModelSelect).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(document.querySelector('.msp-panel')).toBeNull();
  });

  it('二级点击档位项 → onEffortSelect(provider, model, effort) 并关闭面板', () => {
    const callbacks = { onEffortSelect: vi.fn() };
    const { panel } = makePanel(makeData(), callbacks);
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.effortSection'));
    clickRow(document.querySelector('.msp-panel'), 'max');
    expect(callbacks.onEffortSelect).toHaveBeenCalledWith('deepseek', 'deepseek-chat', 'max');
    expect(document.querySelector('.msp-panel')).toBeNull();
  });

  it('二级点击「添加模型」→ onAddModel 并关闭面板', () => {
    const callbacks = { onAddModel: vi.fn() };
    const { panel } = makePanel(makeData(), callbacks);
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.modelSection'));
    clickRow(document.querySelector('.msp-panel'), t('chat.addModel'));
    expect(callbacks.onAddModel).toHaveBeenCalled();
    expect(document.querySelector('.msp-panel')).toBeNull();
  });
});

describe('ModelSelectorPanel — 开关与刷新', () => {
  it('toggle 开合、Esc 关闭', () => {
    const { panel } = makePanel(makeData());
    panel.toggle();
    expect(document.querySelector('.msp-panel')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.msp-panel')).toBeNull();
    panel.toggle();
    expect(document.querySelector('.msp-panel')).not.toBeNull();
  });

  it('面板打开时 update 新数据即时刷新内容（保持在当前二级）', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.effortSection'));
    // 后台切到 openai（仍支持档位）：保持在 effort 二级并刷新档位
    panel.update(makeData({
      provider: 'openai',
      model: 'gpt-4o',
      modelHistory: [
        { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high', thinkingEnabled: true },
        { provider: 'openai', model: 'gpt-4o', reasoningEffort: 'medium', thinkingEnabled: true },
      ],
    }));
    expect(document.querySelector('.msp-header')?.textContent).toContain(t('msp.effortSection'));
    const labels = [...document.querySelectorAll('.msp-item-label')].map(e => e.textContent);
    expect(labels).toEqual(['Default', 'low', 'medium', 'high']);
    expect(document.querySelector('.msp-item.selected .msp-item-label')?.textContent).toBe('medium');
  });

  it('effort 二级时后台切到不支持档位的 Provider → 回退 menu', () => {
    const { panel } = makePanel(makeData());
    panel.open();
    clickMenu(document.querySelector('.msp-panel'), t('msp.effortSection'));
    expect(document.querySelector('.msp-header')).not.toBeNull();
    panel.update(makeData({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      modelHistory: [{ provider: 'anthropic', model: 'claude-sonnet-4', reasoningEffort: '', thinkingEnabled: true }],
    }));
    // 回退第一级：无 header，只有模型行
    expect(document.querySelector('.msp-header')).toBeNull();
    const menus = [...document.querySelectorAll('.msp-menu-item')];
    expect(menus.length).toBe(1);
    expect(menus[0].querySelector('.msp-menu-label').textContent).toBe(t('msp.modelSection'));
  });

  it('destroy 后触发器不再响应点击', () => {
    const { panel } = makePanel(makeData());
    panel.destroy();
    expect(document.querySelector('.msp-panel')).toBeNull();
  });
});

describe('ModelSelectorPanel — 面板定位', () => {
  const ORIG_W = window.innerWidth;
  const ORIG_H = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true, writable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: ORIG_W, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: ORIG_H, configurable: true, writable: true });
  });

  /** mock 元素位置（状态栏在页面下部，top/bottom 靠下） */
  function mockRect(el, { left, width, top = 760, height = 20 }) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left, right: left + width, top, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}),
    });
  }

  it('默认面板左缘对齐按钮左缘（left:0 相对宿主），垂直紧贴由 CSS 保证', () => {
    const { trigger, host, panel } = makePanel(makeData());
    mockRect(host, { left: 210, width: 90 });
    mockRect(trigger, { left: 212, width: 86 });
    panel.open();
    const panelEl = document.querySelector('.msp-panel');
    expect(panelEl.style.left).toBe('0px');        // 相对宿主左缘 = 对齐按钮左缘
    expect(panelEl.style.maxHeight).toBe('752px'); // top(760) - 8，防止超高溢出屏幕顶
    // 垂直紧贴（bottom: calc(100% + 6px)）由 CSS 常量保证；JS 不得用 inline bottom 覆盖它
    expect(panelEl.style.bottom).toBe('');
  });

  it('宿主靠右且右侧放不下时，面板右缘对齐宿主右缘（left 为负向左收）', () => {
    const { trigger, host, panel } = makePanel(makeData());
    mockRect(host, { left: 1200, width: 90 });
    mockRect(trigger, { left: 1202, width: 86 });
    panel.open();
    const panelEl = document.querySelector('.msp-panel');
    // host.left(1200) + 320 > 1440-8 → left = 1440-8-320-1200 = -88，面板右缘 = 1200-88+320 = 1432 = 视口右 8px 内
    expect(panelEl.style.left).toBe('-88px');
  });

  it('极端窄视口放不下时贴左兜底不溢出视口左侧', () => {
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true, writable: true });
    const { trigger, host, panel } = makePanel(makeData());
    mockRect(host, { left: 210, width: 90 });
    mockRect(trigger, { left: 212, width: 86 });
    panel.open();
    const panelEl = document.querySelector('.msp-panel');
    // 第一轮：300-8-320-210 = -238；第二轮：host.left+(-238) = -28 < 8 → left = 8-210 = -202，面板左缘 = 210-202 = 8
    expect(panelEl.style.left).toBe('-202px');
  });
});
