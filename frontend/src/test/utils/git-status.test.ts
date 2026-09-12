import { describe, it, expect } from 'vitest';
import { gitBadgeLetter, gitBadgeKind, gitBadgeKindOf } from '@/utils/git-status';
import type { GitBadgeLetter } from '@/utils/git-status';

/** 构造条目:xy 为 porcelain 原始两字母,untracked 由调用方显式给出 */
function entry(xy: string, untracked = false) {
  return { xy, untracked };
}

describe('gitBadgeLetter', () => {
  it('未跟踪(??) → U,与"已 add 的新增"区分开', () => {
    expect(gitBadgeLetter(entry('??', true))).toBe('U');
    expect(gitBadgeLetter(entry('A ', false))).toBe('A');
  });

  it('暂存区新增(A ) → A', () => {
    expect(gitBadgeLetter(entry('A '))).toBe('A');
  });

  it('修改:M 位在中/在右/两处都改 均 → M', () => {
    expect(gitBadgeLetter(entry(' M'))).toBe('M'); // 仅工作区改
    expect(gitBadgeLetter(entry('M '))).toBe('M'); // 仅暂存区改
    expect(gitBadgeLetter(entry('MM'))).toBe('M'); // 两处都改
  });

  it('删除:D 位在中/在右 均 → D', () => {
    expect(gitBadgeLetter(entry(' D'))).toBe('D');
    expect(gitBadgeLetter(entry('D '))).toBe('D');
  });

  it('重命名(R ) → R(不再并入修改,信息更准)', () => {
    expect(gitBadgeLetter(entry('R '))).toBe('R');
  });

  it('复制(C ) → A(视作新增)', () => {
    expect(gitBadgeLetter(entry('C '))).toBe('A');
  });

  it('冲突组合 → !(若取 X 会得到 U,与未跟踪混淆)', () => {
    expect(gitBadgeLetter(entry('UU'))).toBe('!');
    expect(gitBadgeLetter(entry('AA'))).toBe('!');
    expect(gitBadgeLetter(entry('DD'))).toBe('!');
    expect(gitBadgeLetter(entry('UD'))).toBe('!');
    expect(gitBadgeLetter(entry('AU'))).toBe('!');
  });

  it('暂存位优先于工作区位(与面板分组以 X 为准一致)', () => {
    // 暂存区改了、工作区删了 → 以暂存位为准显示 M
    expect(gitBadgeLetter(entry('MD'))).toBe('M');
  });

  it('异常输入不抛错:空串/单字符按修改兜底', () => {
    expect(gitBadgeLetter(entry(''))).toBe('M');
    expect(gitBadgeLetter(entry(' '))).toBe('M');
  });
});

describe('gitBadgeKind / gitBadgeKindOf', () => {
  it('字母归类:U/A 绿,M/R 琥珀,D 红,! 红', () => {
    expect(gitBadgeKind('U')).toBe('add');
    expect(gitBadgeKind('A')).toBe('add');
    expect(gitBadgeKind('M')).toBe('mod');
    expect(gitBadgeKind('R')).toBe('mod');
    expect(gitBadgeKind('D')).toBe('del');
    expect(gitBadgeKind('!')).toBe('conflict');
  });

  it('每个字母都有配色类别,无遗漏', () => {
    const letters: GitBadgeLetter[] = ['U', 'A', 'M', 'D', 'R', '!'];
    for (const l of letters) {
      expect(gitBadgeKind(l)).toBeTruthy();
    }
  });

  it('gitBadgeKindOf 等价于先取字母再取类别', () => {
    expect(gitBadgeKindOf(entry('??', true))).toBe('add');
    expect(gitBadgeKindOf(entry('A '))).toBe('add');
    expect(gitBadgeKindOf(entry('M '))).toBe('mod');
    expect(gitBadgeKindOf(entry('D '))).toBe('del');
    expect(gitBadgeKindOf(entry('UU'))).toBe('conflict');
  });
});
