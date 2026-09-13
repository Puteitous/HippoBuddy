/**
 * Git 状态徽章工具(纯函数,可单测)
 *
 * GitPanel(源码管理面板)与 FileTree(文件树)共用同一套字母与配色规则。
 * 此前两处各写一份推导逻辑,同一个未跟踪文件在文件树显示 A、在面板显示 ?,
 * 收敛到本模块后不会再出现规则漂移。
 *
 * 字母沿用 VSCode 源码管理的约定:
 *   U 未跟踪(`??`,git 尚未纳入版本控制,与"已 add 的新增"是两种状态)
 *   A 新增(已 git add)
 *   M 修改
 *   D 删除
 *   R 重命名
 *   ! 冲突(未合并)
 *
 * 配色归类为四类,由 {@link gitBadgeKind} 给出,调用方不再按字母猜颜色:
 *   add(绿) / mod(琥珀) / del(红) / conflict(红)
 */

/** 徽章推导所需的最小字段(GitStatusEntry 结构兼容,避免 utils 依赖 api 层) */
export interface GitBadgeInput {
  /** git status --porcelain 的原始两字母:X=暂存区(index),Y=工作区(worktree) */
  xy: string;
  /** 是否为未跟踪(`??`) */
  untracked: boolean;
}

/** 徽章字母 */
export type GitBadgeLetter = 'U' | 'A' | 'M' | 'D' | 'R' | '!';

/** 徽章配色类别 */
export type GitBadgeKind = 'add' | 'mod' | 'del' | 'conflict';

/** 字母 → 配色类别的唯一映射(集中在此,避免调用方按字母猜) */
const KIND_BY_LETTER: Record<GitBadgeLetter, GitBadgeKind> = {
  U: 'add',
  A: 'add',
  M: 'mod',
  R: 'mod',
  D: 'del',
  '!': 'conflict',
};

/**
 * 推导徽章字母。
 *
 * 规则:未跟踪与冲突状态单独识别,其余优先取暂存区(X)位,该位为空时取工作区(Y)位。
 * 暂存位优先是刻意的——与面板「已暂存 / 未暂存」分组以 X 为准的语义保持一致。
 */
export function gitBadgeLetter(e: GitBadgeInput): GitBadgeLetter {
  // 未跟踪(`??`):单独识别,不能落到下面的字母分支(否则 '?' 会被当成未知状态)
  if (e.untracked) return 'U';

  const x = e.xy.charAt(0) || ' ';
  const y = e.xy.charAt(1) || ' ';

  // 未合并(冲突):UU / AA / DD / UD / DU / AU / UA 等组合。
  // 必须早于下面按 X 取字母——否则 'UU' 会取到 'U',与"未跟踪"混淆。
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return '!';

  const c = x !== ' ' ? x : y;
  switch (c) {
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case 'R':
      return 'R';
    case 'C':
      return 'A'; // 复制视作新增
    default:
      return 'M'; // M / T(类型变更)及其他一律按修改展示
  }
}

/** 由字母取配色类别 */
export function gitBadgeKind(letter: GitBadgeLetter): GitBadgeKind {
  return KIND_BY_LETTER[letter];
}

/** 便捷:直接由条目取配色类别(等价于 gitBadgeKind(gitBadgeLetter(e))) */
export function gitBadgeKindOf(e: GitBadgeInput): GitBadgeKind {
  return KIND_BY_LETTER[gitBadgeLetter(e)];
}

/**
 * 由「提交文件列表」的状态推导徽章字母。
 * 输入是 {@code git show --name-status} 首列字母(A/M/D/R/C/T/U/X/B),与工作区条目语义不同:
 * git 以单个大写字母表达该文件在本提交内的变更类型,直接映射到现有徽章字母与配色,
 * 复用 gitBadgeKind 的 add/mod/del/conflict 分类,保证与变更行徽章视觉一致。
 */
export function gitCommitStatusLetter(status?: string): GitBadgeLetter {
  switch ((status ?? '').trim().toUpperCase()) {
    case 'A':
    case 'C': // 复制视作新增
      return 'A';
    case 'D':
      return 'D';
    case 'R':
      return 'R';
    case 'T': // 类型变更按修改
      return 'M';
    case 'U': // 未合并
      return '!';
    default: // M / X / B(二进制)及其他一律按修改展示
      return 'M';
  }
}

/** 由提交文件状态取配色类别 */
export function gitCommitStatusKind(status?: string): GitBadgeKind {
  return KIND_BY_LETTER[gitCommitStatusLetter(status)];
}
