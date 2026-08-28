/**
 * 回合默认展示模式 —— 进程内缓存。
 *
 * 语义对应后端 ui.default_process_view('full'|'result')与设置页「通用」中的
 * 默认展示模式开关:决定**每个新建回合**处理过程的初始收起状态(absent 时作为兜底)。
 * - full   :完整展示处理过程(默认展开) → collapsed = false
 * - result :只展示最终结果(默认收起)   → collapsed = true
 *
 * 不用全局 config store,沿用 PermissionBadge「组件自读 configApi + 写缓存」的模式:
 * ChatPanel 挂载时(GET /api/config)与设置页变更时都会 setDefaultProcessView;
 * chatStore 创建会话分区时经 getDefaultProcessCollapsed() 同步读取默认值。
 */
let defaultProcessView = 'full';

/** 是否应默认收起处理过程(new result → true,否则 false) */
export function getDefaultProcessCollapsed(): boolean {
  return defaultProcessView === 'result';
}

/** 同步默认展示模式('full' | 'result',兜底其余值按 full 处理) */
export function setDefaultProcessView(view: string | undefined | null): void {
  defaultProcessView = view === 'result' ? 'result' : 'full';
}