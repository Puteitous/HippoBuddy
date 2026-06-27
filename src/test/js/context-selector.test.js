import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock apiGet 返回测试数据
const mockRulesData = {
  projectRules: [
    { id: 'rule-1', name: '前端规范', description: '前端代码规范', mode: 'always' },
    { id: 'rule-2', name: 'API 规范', description: 'API 接口规范', mode: 'manual' },
    { id: 'rule-3', name: '数据库规范', mode: 'manual' },
  ],
  userRules: [
    { id: 'rule-4', name: '用户自定义规则', mode: 'manual' },
  ],
};

const mockSkillsData = {
  projectSkills: [
    { name: '安全扫描', filePath: 'skills/security.md', description: '代码安全扫描', source: 'project' },
    { name: '性能分析', filePath: 'skills/performance.md', description: '性能分析', source: 'project' },
  ],
  userSkills: [
    { name: '自定义技能', filePath: 'skills/custom.md', description: '用户创建', source: 'user' },
  ],
};

vi.mock('../../main/resources/static/js/utils.js', () => ({
  apiGet: vi.fn((url) => {
    if (url === '/api/rules/list') return Promise.resolve(mockRulesData);
    if (url === '/api/skills/list') return Promise.resolve(mockSkillsData);
    return Promise.reject(new Error('unknown url'));
  }),
}));

/** 初始化 DOM 环境 */
function setupDOM() {
  document.body.innerHTML = `
    <div class="chat-panel has-messages">
      <div id="chatContainer"></div>
      <div class="input-inner">
        <div id="inputRefs" class="input-refs"></div>
        <div id="messageInput"></div>
      </div>
      <div class="status-bar-left"></div>
    </div>
  `;
}

describe('ContextSelector', () => {
  let ContextSelector;
  let selector;
  let onRulesChange;
  let onSkillToggle;
  let onRuleToggle;

  beforeEach(async () => {
    setupDOM();
    vi.clearAllMocks();

    const mod = await import('../../main/resources/static/js/components/context-selector.js');
    ContextSelector = mod.ContextSelector;

    onRulesChange = vi.fn();
    onSkillToggle = vi.fn();
    onRuleToggle = vi.fn();

    selector = new ContextSelector({
      onRulesChange,
      onSkillToggle,
      onRuleToggle,
    });

    // 按钮需要追加到 DOM 中才能被 querySelector 找到
    document.body.appendChild(selector.getButtonElement());
  });

  afterEach(() => {
    if (selector) selector.destroy();
    document.body.innerHTML = '';
  });

  // ==================== 按钮 ====================

  describe('按钮', () => {
    it('构造时创建按钮并追加到面板', () => {
      const btn = document.querySelector('.context-selector-btn');
      expect(btn).toBeTruthy();
      expect(btn.title).toBe('引用上下文');
      expect(btn.innerHTML).toContain('#');
    });

    it('getButtonElement 返回按钮元素', () => {
      const btn = selector.getButtonElement();
      expect(btn).toBeInstanceOf(HTMLElement);
      expect(btn.className).toBe('context-selector-btn');
    });

    it('初始化 badge 不显示', () => {
      expect(selector._btn.querySelector('.context-selector-badge')).toBeFalsy();
    });
  });

  // ==================== 公开方法 ====================

  describe('选中状态管理', () => {
    it('初始选中状态为空', () => {
      expect(selector.getSelectedRuleIds()).toEqual([]);
      expect(selector.getSelectedRules()).toEqual([]);
      expect(selector.getSelectedSkillPaths()).toEqual([]);
    });

    it('clearSelection 清空所有选中并触发回调', () => {
      selector._selectedRuleIds.add('rule-1');
      selector._selectedSkillPaths.add('skills/security.md');
      selector._rules = mockRulesData.projectRules.map(r => ({ ...r, source: 'project' }));
      selector._skills = mockSkillsData.projectSkills.map(s => ({ ...s }));
      selector._skills.push(...mockSkillsData.userSkills.map(s => ({ ...s })));

      selector.clearSelection();

      expect(selector.getSelectedRuleIds()).toEqual([]);
      expect(selector.getSelectedSkillPaths()).toEqual([]);
      expect(onRuleToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }), false);
      expect(onSkillToggle).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'skills/security.md' }), false);
      expect(selector._btn.querySelector('.context-selector-badge')).toBeFalsy();
    });

    it('deselectRule 取消指定规则并触发回调', () => {
      selector._selectedRuleIds.add('rule-2');
      selector._rules = mockRulesData.projectRules.map(r => ({ ...r, source: 'project' }));
      selector._selectedSkillPaths.add('skills/custom.md');
      selector._updateButtonLabel();

      selector.deselectRule('rule-2');

      expect(selector.getSelectedRuleIds()).not.toContain('rule-2');
      expect(onRuleToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-2' }), false);
      expect(selector.getSelectedSkillPaths()).toContain('skills/custom.md');
    });

    it('deselectRule 对未选中的 ID 不做任何事', () => {
      selector._selectedRuleIds.add('rule-1');
      const before = selector.getSelectedRuleIds();
      selector.deselectRule('nonexistent');
      expect(selector.getSelectedRuleIds()).toEqual(before);
      expect(onRuleToggle).not.toHaveBeenCalled();
    });

    it('deselectSkill 取消指定技能并触发回调', () => {
      selector._selectedSkillPaths.add('skills/performance.md');
      selector._skills = mockSkillsData.projectSkills.map(s => ({ ...s }));
      selector._updateButtonLabel();

      selector.deselectSkill('skills/performance.md');

      expect(selector.getSelectedSkillPaths()).not.toContain('skills/performance.md');
      expect(onSkillToggle).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'skills/performance.md' }), false);
    });

    it('deselectSkill 对未选中的路径不做任何事', () => {
      selector._selectedSkillPaths.add('skills/security.md');
      const before = selector.getSelectedSkillPaths();
      selector.deselectSkill('skills/nonexistent.md');
      expect(selector.getSelectedSkillPaths()).toEqual(before);
      expect(onSkillToggle).not.toHaveBeenCalled();
    });

    it('获取选中规则对象列表', () => {
      selector._rules = [
        { id: 'r1', name: '规则1', mode: 'manual' },
        { id: 'r2', name: '规则2', mode: 'always' },
      ];
      selector._selectedRuleIds.add('r1');
      selector._selectedRuleIds.add('r2');

      const rules = selector.getSelectedRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].name).toBe('规则1');
      expect(rules[1].name).toBe('规则2');
    });

    it('getSelectedRules 跳过不存在的 ID', () => {
      selector._rules = [{ id: 'r1', name: '规则1', mode: 'manual' }];
      selector._selectedRuleIds.add('r1');
      selector._selectedRuleIds.add('ghost');

      const rules = selector.getSelectedRules();
      expect(rules).toHaveLength(1);
    });
  });

  // ==================== badge 更新 ====================

  describe('badge 数值', () => {
    function badge() {
      return selector._btn.querySelector('.context-selector-badge');
    }

    it('选中规则和技能时 badge 显示总数', () => {
      selector._selectedRuleIds.add('r1');
      selector._selectedRuleIds.add('r2');
      selector._selectedSkillPaths.add('s1');
      selector._updateButtonLabel();

      expect(badge()).toBeTruthy();
      expect(badge().textContent).toBe('3');
    });

    it('选中全部清除后 badge 消失', () => {
      selector._selectedRuleIds.add('r1');
      selector._updateButtonLabel();
      expect(badge()).toBeTruthy();

      selector.clearSelection();
      expect(badge()).toBeFalsy();
    });
  });

  // ==================== 面板 ====================

  describe('面板渲染', () => {
    beforeEach(async () => {
      await selector._loadData();
      selector._level = 'menu';
      selector._openPanel();
    });

    it('打开面板后显示菜单层级', () => {
      const panel = document.querySelector('.context-selector-panel');
      expect(panel).toBeTruthy();
      expect(panel.textContent).toContain('规则');
      expect(panel.textContent).toContain('技能');
    });

    it('点击规则入口渲染规则列表', () => {
      document.querySelector('.context-selector-menu-item').click();
      const panel = document.querySelector('.context-selector-panel');
      expect(panel.textContent).toContain('前端规范');
      expect(panel.textContent).toContain('API 规范');
      expect(panel.textContent).toContain('用户自定义规则');
    });

    it('always 规则的 checkbox 为禁用状态', () => {
      document.querySelector('.context-selector-menu-item').click();
      const items = document.querySelectorAll('.context-selector-item');
      const frontendItem = [...items].find(item => item.textContent.includes('前端规范'));
      expect(frontendItem.querySelector('input[type="checkbox"]').disabled).toBe(true);
    });

    it('manual 规则的 checkbox 可用', () => {
      document.querySelector('.context-selector-menu-item').click();
      const items = document.querySelectorAll('.context-selector-item');
      const apiItem = [...items].find(item => item.textContent.includes('API 规范'));
      expect(apiItem.querySelector('input[type="checkbox"]').disabled).toBe(false);
    });

    it('返回按钮回到菜单层级', () => {
      document.querySelector('.context-selector-menu-item').click();
      document.querySelector('.context-selector-back').click();
      const panel = document.querySelector('.context-selector-panel');
      expect(panel.textContent).toContain('# 引用上下文');
      expect(panel.textContent).not.toContain('前端规范');
    });

    it('选中 manual 规则触发回调并更新 badge', () => {
      document.querySelector('.context-selector-menu-item').click();
      const apiItem = [...document.querySelectorAll('.context-selector-item')]
        .find(item => item.textContent.includes('API 规范'));
      apiItem.querySelector('input[type="checkbox"]').click();

      expect(onRuleToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-2', name: 'API 规范' }),
        true
      );
      expect(selector.getSelectedRuleIds()).toContain('rule-2');
      expect(selector._btn.querySelector('.context-selector-badge')).toBeTruthy();

      apiItem.querySelector('input[type="checkbox"]').click();
      expect(onRuleToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-2', name: 'API 规范' }),
        false
      );
      expect(selector.getSelectedRuleIds()).not.toContain('rule-2');
    });

    it('点击技能入口渲染技能列表', () => {
      const menuItems = document.querySelectorAll('.context-selector-menu-item');
      menuItems[1].click();
      const panel = document.querySelector('.context-selector-panel');
      expect(panel.textContent).toContain('安全扫描');
      expect(panel.textContent).toContain('性能分析');
      expect(panel.textContent).toContain('自定义技能');
    });

    it('选中技能触发 onSkillToggle 回调', () => {
      document.querySelectorAll('.context-selector-menu-item')[1].click();
      const securityItem = [...document.querySelectorAll('.context-selector-item')]
        .find(item => item.textContent.includes('安全扫描'));
      securityItem.querySelector('input[type="checkbox"]').click();

      expect(onSkillToggle).toHaveBeenCalledWith(
        expect.objectContaining({ name: '安全扫描', filePath: 'skills/security.md' }),
        true
      );
      expect(selector.getSelectedSkillPaths()).toContain('skills/security.md');
    });

    it('空数据时显示空状态提示', () => {
      // 先关闭 beforeEach 中打开的 selector 面板，避免干扰
      selector._closePanel();

      const emptySelector = new ContextSelector();
      emptySelector._rules = [];
      emptySelector._skills = [];
      emptySelector._level = 'rules';
      emptySelector._openPanel();

      let panel = document.querySelector('.context-selector-panel');
      // 应该匹配到 emptySelector 的 panel（selector 的已关闭）
      expect(panel.querySelector('.context-selector-empty')).toBeTruthy();
      expect(panel.textContent).toContain('暂无规则');

      emptySelector._closePanel();
      emptySelector._level = 'skills';
      emptySelector._openPanel();
      panel = document.querySelector('.context-selector-panel');
      expect(panel.textContent).toContain('暂无技能');

      emptySelector.destroy();
    });
  });

  // ==================== 面板状态同步 ====================

  describe('面板状态同步 (_syncPanelSelection)', () => {
    beforeEach(async () => {
      await selector._loadData();
      selector._level = 'rules';
      selector._openPanel();
    });

    it('通过 deselectRule 取消后面板 checkbox 同步更新', () => {
      const apiItem = [...document.querySelectorAll('.context-selector-item')]
        .find(item => item.textContent.includes('API 规范'));
      apiItem.querySelector('input[type="checkbox"]').click();
      expect(selector.getSelectedRuleIds()).toContain('rule-2');

      selector.deselectRule('rule-2');

      const cb = apiItem.querySelector('input[type="checkbox"]');
      expect(cb.checked).toBe(false);
      expect(apiItem.classList.contains('selected')).toBe(false);
    });

    it('通过 clearSelection 清空后面板 checkbox 全部取消', () => {
      const items = document.querySelectorAll('.context-selector-item');
      const manualItems = [...items].filter(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        return cb && !cb.disabled;
      });
      manualItems.forEach(item => item.querySelector('input[type="checkbox"]').click());
      expect(selector.getSelectedRuleIds().length).toBeGreaterThan(0);

      selector.clearSelection();

      document.querySelectorAll('.context-selector-item input[type="checkbox"]').forEach(cb => {
        if (!cb.disabled) {
          expect(cb.checked).toBe(false);
        }
      });
    });
  });

  // ==================== 数据加载 ====================

  describe('数据加载', () => {
    it('_loadData 从 API 加载规则和技能', async () => {
      await selector._loadData();

      expect(selector._rules).toHaveLength(4);
      expect(selector._rules[0].name).toBe('前端规范');
      expect(selector._rules[0].mode).toBe('always');

      expect(selector._skills).toHaveLength(3);
      expect(selector._skills[0].name).toBe('安全扫描');

      expect(selector._rules[0].source).toBe('project');
      expect(selector._rules[3].source).toBe('user');
    });
  });

  // ==================== 面板开关 ====================

  describe('面板开关', () => {
    it('_closePanel 关闭并清理面板', () => {
      selector._openPanel();
      expect(document.querySelector('.context-selector-panel')).toBeTruthy();

      selector._closePanel();
      expect(document.querySelector('.context-selector-panel')).toBeFalsy();
      expect(selector._sticky).toBe(false);
    });

    it('destroy 移除按钮和面板', () => {
      const btn = document.querySelector('.context-selector-btn');
      expect(btn).toBeTruthy();

      selector.destroy();

      expect(document.querySelector('.context-selector-btn')).toBeFalsy();
      expect(selector._btn).toBeNull();
    });
  });
});
