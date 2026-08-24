/**
 * useCompletedTaskNotification - 后台会话任务完成提醒
 *
 * 只读订阅 chatStore.sessionStreams,当「非当前会话」的分区因 done 事件
 * 首次获得 doneReason 时,弹一条应用内 toast:
 *  - 后台(切走)会话在内存分区里继续流式,任务真正结束(done)后用户看不到完成瞬间
 *  - 借此提示用户切回查看
 *
 * 设计要点(与 per-session 隔离契合):
 *  - 用 zustand 的 subscribe(state, prev) 增量对比 doneReason:由空→非空才是「刚完成」,
 *    避免 doneReason 长期保留导致的重复提醒
 *  - 仅后端 Agent 循环真正结束的 done 触发;ask_user / 工具确认等 isSending 翻转不触发
 *  - 当前正在查看的会话完成不弹(避免打扰)
 *  - notify 集合用 ref,避免 stale closure
 */
import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAppStore } from '@/stores/appStore';
import { showToast } from '@/utils/toastStore';

export function useCompletedTaskNotification() {
  // 已提醒过的会话(防止同一次 done 重复弹 / doneReason 保留期间二次提醒)
  const logged = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      for (const [sid, sess] of Object.entries(state.sessionStreams)) {
        // 仅「刚完成」(doneReason 由空变非空)的会话触发
        if (!sess?.doneReason || prev.sessionStreams[sid]?.doneReason) continue;
        if (logged.current.has(sid)) continue;
        const { currentSessionId, sessions } = useAppStore.getState();
        if (sid === currentSessionId) continue; // 当前会话不提醒
        logged.current.add(sid);
        const s = sessions.find((x) => x.id === sid);
        const title = s?.title?.trim()
          || (sid.replace(/^web-/, '').slice(-6) ?? sid);
        showToast(`后台会话「${title}」已完成`, { type: 'success', duration: 4000 });
      }
    });
    return unsub;
  }, []);
}