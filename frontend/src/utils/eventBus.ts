/**
 * 轻量事件总线 - 跨组件通信
 *
 * 使用场景(3.7-1):
 *   - SkillMarket 安装/卸载技能后,通知 SkillsSettingsPage 重新加载列表
 *     (旧版通过 window.settingsPanel.reloadSkills() 全局调用,新版改为事件订阅)
 *   - 后续 3.7-2 / 3.8 可扩展:
 *     - workspace:openDiff(filePath, toolCallId) - ChatPanel 工具卡片 → PreviewPanel 打开 diff
 *     - context:skillAdded(skill) - SkillMarket → ChatPanel RefChips
 *     - ui:activityBarToggled
 *
 * 实现:Map<event, Set<cb>>,on 返回取消订阅函数,避免组件 unmount 后泄漏。
 */

export type EventBusEvent =
  | 'skills:changed'
  | 'rules:changed'
  | 'workspace:openDiff'
  | 'context:skillAdded'
  | 'context:skillRemoved'
  | 'ui:activityBarToggled'
  // ── 3.7-2:会话回滚 ──────────────────────────────────
  /** RollbackButton 点击回滚前发出,ChatPanel 订阅后中断当前生成 */
  | 'rollback:prepare'
  /** 回滚(all 模式)成功后发出,携带目标用户消息原文,ChatPanel 订阅后回填输入框 */
  | 'rollback:restoreInput'
  // ── 3.7-2:文本选中快捷操作 ───────────────────────────
  /** SelectionActions 将选中文本发送到聊天输入框(生成 RefChip) */
  | 'selection:add-to-input'
  // ── 3.8:回滚完成联动 ───────────────────────────────
  /** 回滚成功后发出,携带被回滚文件路径列表(对齐旧版 file:rollback-completed),PreviewPanel 订阅后刷新预览 */
  | 'rollback:completed'
  // ── 3.8-x:AI 工具文件变更联动 ───────────────────────
  /**
   * AI 工具(write_file/edit_file/delete_file)执行后发出,携带被修改的文件路径
   * (对齐旧版 file:preview-reload)。PreviewPanel 订阅后,命中当前预览文件时自动重载,
   * 使 AI 边写代码边看预览实时更新。delete_file 对每个被删路径各发一次。
   */
  | 'file:preview-reload'
  // ── LLM 模型切换 ───────────────────────────────────
  /**
   * 模型切换成功后发出,携带新生效的 provider/model。
   * ModelSelectorPanel 切换成功后广播,ImageUpload 等依赖当前模型能力的组件订阅后即时刷新。
   */
  | 'llm:changed'
  // ── 文件树定位:面包屑目录段点击 ────────────────────
  /**
   * 预览面包屑点击目录段时发出,携带目标目录的绝对路径。
   * Sidebar 订阅后切换到文件视图并让 FileTree 展开/高亮该目录(对齐旧版 revealDirectory)。
   */
  | 'workspace:reveal-dir'
  // ── 会话切换:历史消息加载完成 ──────────────────────
  /**
   * useSessionMessages 在切换会话、历史消息加载完成后发出,携带当前会话 id。
   * 后端 handleGetMessages 此时已执行 loadSessionChanges 把该会话的变更数据加载进内存,
   * 故依赖该数据的组件(如 FileChangesMonitor)应订阅本事件再刷新,而非与消息加载并发,
   * 从而复刻旧版 switchSession 的顺序语义,消除"切换后读不到变更数据"的竞态。
   */
  | 'session:messages-loaded';

/** selection:add-to-input 的 payload(对齐旧版 selection-actions.js 事件结构) */
export interface SelectionAddToInputPayload {
  /** 引用文本(file 为路径,text 为选中内容) */
  text: string;
  /** 引用类型:file = 文件引用(带选中片段);text = 纯文本引用 */
  refType: 'file' | 'text';
  /** refType === 'file' 时:文件绝对路径 */
  filePath?: string;
  /** 选中的原文(文件预览区选中时,≤50 行内联携带) */
  selectedText?: string;
  /** 阶段 3.8:refType === 'file' 且预览区为 CM6 编辑器时,选中起始行(1-based) */
  startLine?: number;
  /** 阶段 3.8:选中结束行(1-based) */
  endLine?: number;
}

/** rollback:completed 的 payload(对齐旧版 file:rollback-completed 事件结构) */
export interface RollbackCompletedPayload {
  /** 被回滚的文件路径列表(供监听方精确匹配,避免任意文件导致预览误刷新) */
  paths: string[];
  /** 回滚模式:files = 仅回滚文件;all = 文件 + 会话截断 */
  mode: 'files' | 'all';
}

/** llm:changed 的 payload:模型切换后新生效的配置 */
export interface LlmChangedPayload {
  provider: string;
  model: string;
}

/** session:messages-loaded 的 payload:当前会话 id */
export interface SessionMessagesLoadedPayload {
  sessionId: string | null;
}

type Handler<T = unknown> = (payload: T) => void;

const listeners = new Map<EventBusEvent, Set<Handler>>();

function getSet(event: EventBusEvent): Set<Handler> {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  return set;
}

/** 订阅事件,返回取消订阅函数 */
export function on<T = unknown>(event: EventBusEvent, handler: Handler<T>): () => void {
  getSet(event).add(handler as Handler);
  return () => {
    getSet(event).delete(handler as Handler);
  };
}

/** 取消订阅(用于显式调用,推荐用 on 返回的 unsubscribe 函数) */
export function off<T = unknown>(event: EventBusEvent, handler: Handler<T>): void {
  getSet(event).delete(handler as Handler);
}

/** 触发事件(同步执行所有订阅者,异常不中断后续调用) */
export function emit<T = unknown>(event: EventBusEvent, payload?: T): void {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  // 复制一份避免迭代过程中订阅者自身又 off 导致 Set 大小变化
  for (const handler of [...set]) {
    try {
      handler(payload as T);
    } catch (e) {
      console.warn(`[eventBus] handler error on "${event}":`, e);
    }
  }
}

/** 清空指定事件的所有订阅(测试用) */
export function clear(event?: EventBusEvent): void {
  if (event) {
    listeners.delete(event);
  } else {
    listeners.clear();
  }
}
