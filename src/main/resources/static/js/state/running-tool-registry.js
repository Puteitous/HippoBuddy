/**
 * 运行中工具调用注册表（单例）。
 *
 * 统一登记"正在执行的工具调用 toolCallId"，供停止生成（stopGeneration）等消费方
 * 一次性收集全部运行中工具，再逐个向后端发 abort 终止进程。
 *
 * 历史教训（2026-08-07）：此前主 SSE 流的 toolCallId 注册在 MessageSession 内部集合、
 * 确认 SSE 流注册在 ChatPanel 内部集合，而 stopGeneration 只遍历了后者，
 * 导致主流里正在运行的 bash 进程 abort 永远带不上 toolCallId，进程不被终止，
 * 用户点终止后仍需等 bash 自然跑完才释放会话锁。
 * 收敛为单一数据源后，任何入口注册的运行中工具都能被消费方完整收集。
 */
const runningToolCallIds = new Set();

export const RunningToolRegistry = {
  /** 登记一个正在运行的工具调用；null/空 id 忽略 */
  add(id) {
    if (id) runningToolCallIds.add(id);
  },

  /** 移除一个已结束（或已停止）的工具调用 */
  delete(id) {
    if (id) runningToolCallIds.delete(id);
  },

  /** 查询某工具调用是否仍在运行 */
  has(id) {
    return !!id && runningToolCallIds.has(id);
  },

  /** 返回全部运行中 toolCallId 的快照数组 */
  all() {
    return [...runningToolCallIds];
  },

  /** 清空（停止生成/新一轮发送时调用） */
  clear() {
    runningToolCallIds.clear();
  },
};
