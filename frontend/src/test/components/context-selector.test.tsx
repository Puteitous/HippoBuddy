import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextSelector } from '@/components/ContextSelector';

const { rulesApiProps, skillsApiProps } = vi.hoisted(() => ({
  rulesApiProps: { list: vi.fn() },
  skillsApiProps: { list: vi.fn() },
}));

vi.mock('@/api/client', () => ({
  rulesApi: rulesApiProps,
  skillsApi: skillsApiProps,
}));

const projectRule = { name: 'p-rule', description: '项目规则描述', mode: 'manual' as const, filePath: '/rules/p-rule.md' };
const alwaysRule = { name: 'a-rule', description: '始终规则描述', mode: 'always' as const, filePath: '/rules/a-rule.md' };

function defaultList() {
  rulesApiProps.list.mockResolvedValue({
    projectRules: [projectRule, alwaysRule],
    userRules: [],
  });
  skillsApiProps.list.mockResolvedValue({
    projectSkills: [{ fileName: 'proj-skill.md', description: '项目技能描述', filePath: '/skills/proj-skill.md' }],
    userSkills: [{ fileName: 'my-skill.md', name: '我的技能', description: '技能描述', filePath: '/skills/my-skill.md' }],
  });
}

/** 打开面板并等待加载完成(第一级菜单出现) */
async function openPanel() {
  fireEvent.click(screen.getByTitle('选择规则 / 技能'));
  await screen.findByText('选择类别');
}

function renderDefault(props: Partial<Parameters<typeof ContextSelector>[0]> = {}) {
  return render(
    <ContextSelector
      selectedRuleIds={[]}
      selectedSkillPaths={[]}
      onRuleToggle={vi.fn()}
      onSkillToggle={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultList();
});

describe('ContextSelector', () => {
  it('默认渲染 # 按钮,无选中时不显示 badge', () => {
    renderDefault();
    expect(screen.getByTitle('选择规则 / 技能')).toBeInTheDocument();
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('有选中时 badge 显示规则+技能总数', () => {
    renderDefault({ selectedRuleIds: ['project:p-rule'], selectedSkillPaths: ['/skills/my-skill.md'] });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('首次展开时懒加载规则和技能列表(各调用一次)', async () => {
    renderDefault();
    await openPanel();
    expect(rulesApiProps.list).toHaveBeenCalledTimes(1);
    expect(skillsApiProps.list).toHaveBeenCalledTimes(1);
  });

  it('已加载后重复打开不会重复拉取', async () => {
    renderDefault();
    await openPanel();
    // sticky 模式再点按钮关闭
    fireEvent.click(screen.getByTitle('选择规则 / 技能'));
    await waitFor(() => expect(screen.queryByText('选择类别')).not.toBeInTheDocument());
    // 再打开,数据来自缓存
    await openPanel();
    expect(screen.getByText('选择类别')).toBeInTheDocument();
    expect(rulesApiProps.list).toHaveBeenCalledTimes(1);
    expect(skillsApiProps.list).toHaveBeenCalledTimes(1);
  });

  it('打开面板显示第一级菜单(选择类别 + 规则/技能入口)', async () => {
    renderDefault();
    await openPanel();
    expect(screen.getByText('选择类别')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /规则/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /技能/ })).toBeInTheDocument();
  });

  it('规则级:always 组禁用勾选,manual 组勾选/取消回调 true/false', async () => {
    const onRuleToggle = vi.fn();
    renderDefault({ onRuleToggle });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));

    // always 组:显示且 checkbox 为选中+禁用
    expect(screen.getByText('always(始终生效)')).toBeInTheDocument();
    const alwaysCheckbox = screen.getByRole('checkbox', { name: /a-rule/ });
    expect(alwaysCheckbox).toBeChecked();
    expect(alwaysCheckbox).toBeDisabled();

    // manual 组:初始未选中,点击后选中并回调 true
    expect(screen.getByText('manual(按需引用)')).toBeInTheDocument();
    const manualCheckbox = screen.getByRole('checkbox', { name: /p-rule/ });
    expect(manualCheckbox).not.toBeChecked();
    fireEvent.click(manualCheckbox);
    expect(onRuleToggle).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'p-rule', mode: 'manual' }), true);
  });

  it('已选中的 manual 规则保持勾选态', async () => {
    renderDefault({ selectedRuleIds: ['project:p-rule'] });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));
    expect(screen.getByRole('checkbox', { name: /p-rule/ })).toBeChecked();
  });

  it('规则为空时显示空态「暂无规则」', async () => {
    rulesApiProps.list.mockResolvedValue({ projectRules: [], userRules: [] });
    renderDefault();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));
    expect(screen.getByText('暂无规则')).toBeInTheDocument();
    expect(screen.getByText('前往设置 → 规则 创建')).toBeInTheDocument();
  });

  it('技能级:项目/用户分组,无 name 回退 fileName 去 .md,勾选回调 true', async () => {
    const onSkillToggle = vi.fn();
    skillsApiProps.list.mockResolvedValue({
      projectSkills: [{ fileName: 'proj-skill.md', description: '项目技能描述', filePath: '/skills/proj-skill.md' }],
      userSkills: [{ fileName: 'no-name.md', filePath: '/skills/no-name.md' }],
    });
    renderDefault({ onSkillToggle });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /技能/ }));

    expect(screen.getByText('项目技能')).toBeInTheDocument();
    expect(screen.getByText('用户技能')).toBeInTheDocument();

    // name 回退:proj-skill.md → 'proj-skill'
    expect(screen.getByText('proj-skill')).toBeInTheDocument();
    // no-name.md 无 name → 回退为 'no-name'
    expect(screen.getByText('no-name')).toBeInTheDocument();

    const projCheckbox = screen.getByRole('checkbox', { name: /proj-skill/ });
    fireEvent.click(projCheckbox);
    expect(onSkillToggle).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: '/skills/proj-skill.md' }), true);
  });

  it('已选中的技能保持勾选态', async () => {
    renderDefault({ selectedSkillPaths: ['/skills/my-skill.md'] });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /技能/ }));
    expect(screen.getByRole('checkbox', { name: /我的技能/ })).toBeChecked();
    expect(screen.getByText('我的技能')).toBeInTheDocument();
  });

  it('技能为空时显示空态「暂无技能」', async () => {
    skillsApiProps.list.mockResolvedValue({ projectSkills: [], userSkills: [] });
    renderDefault();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /技能/ }));
    expect(screen.getByText('暂无技能')).toBeInTheDocument();
    expect(screen.getByText('前往设置 → 技能 或技能市场 创建')).toBeInTheDocument();
  });

  it('返回按钮回到第一级菜单', async () => {
    renderDefault();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));
    expect(screen.getByText('always(始终生效)')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('返回'));
    expect(screen.getByText('选择类别')).toBeInTheDocument();
    expect(screen.queryByText('always(始终生效)')).not.toBeInTheDocument();
  });

  it('点击外部区域关闭面板', async () => {
    renderDefault();
    await openPanel();
    expect(screen.getByText('选择类别')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByText('选择类别')).not.toBeInTheDocument());
  });

  it('加载完成后才显示菜单(异步加载期间面板暂不渲染)', async () => {
    let resolveRules!: (v: unknown) => void;
    rulesApiProps.list.mockImplementation(() => new Promise((res) => (resolveRules = res)));
    skillsApiProps.list.mockResolvedValue({ projectSkills: [], userSkills: [] });
    renderDefault();
    fireEvent.click(screen.getByTitle('选择规则 / 技能'));
    // 加载挂起期间,面板尚未展开
    await waitFor(() => expect(rulesApiProps.list).toHaveBeenCalled());
    expect(screen.queryByText('选择类别')).not.toBeInTheDocument();
    // 完成加载后才显示菜单
    resolveRules({ projectRules: [], userRules: [] });
    await screen.findByText('选择类别');
  });

  it('首次加载失败后,关闭再打开会重新拉取并显示数据', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rulesApiProps.list.mockRejectedValueOnce(new Error('net'));
    renderDefault();
    await openPanel(); // 首次拉取失败,面板仍打开显示菜单
    expect(screen.getByText('选择类别')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[ContextSelector]'), expect.anything());

    // 进入规则级:因加载失败无数据 → 空态
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));
    expect(screen.getByText('暂无规则')).toBeInTheDocument();

    // 关闭(sticky 点按钮)后重新打开:loaded 仍 false,会再次拉取且成功
    fireEvent.click(screen.getByTitle('选择规则 / 技能'));
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /规则/ }));
    expect(screen.getByText('manual(按需引用)')).toBeInTheDocument();
    warnSpy.mockRestore();
  });
});