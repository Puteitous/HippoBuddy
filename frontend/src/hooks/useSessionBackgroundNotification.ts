/**
 * useSessionBackgroundNotification - 会话级"需要留意"的通知(完成 / 等待确认)
 *
 * 统一处理两类需要用户留意、但用户可能没在看窗口时的事件:
 *  - 会话完成(done):后台任务结束
 *  - 需要确认(工具确认卡片 tool_confirmation / ask_user 等待输入 waiting_user):
 *    任务被阻塞,等着用户点击卡片才能继续
 *
 * 双通道分发(关键设计):按 "窗口是否可见" 决定通知形式,避免打扰
 *  - document.hidden(最小化/隐藏到托盘/切到其他应用):发【系统通知】(含系统提示音),
 *    点击后聚焦窗口并跳转到对应会话
 *  - 窗口可见:维持应用内 toast;当前正在查看的会话默认不重复提醒(卡片已在屏上)
 *
 * 订阅 chatStore 增量对比(state vs prev)做「由空→非空」判定,天然按事件去重。
 */
import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAppStore } from '@/stores/appStore';
import { showToast } from '@/utils/toastStore';
import { desktopBridge } from '@/utils/desktop-bridge';
import { translate } from '@/i18n';

/** 取会话展示标题:优先 sessionTitle,否则用 sessionId 兜底(去 web- 前缀、截尾 6 位) */
function sessionTitle(sid: string): string {
  const s = useAppStore.getState().sessions.find((x) => x.id === sid);
  const title = s?.title?.trim();
  if (title) return title;
  const suffix = sid.replace(/^web-/, '');
  return suffix.length > 6 ? suffix.slice(-6) : (suffix || sid);
}

export function useSessionBackgroundNotification() {
  useEffect(() => {
    // 会话完成:隐藏发系统通知+任务栏闪烁;可见时仅后台会话弹 toast(当前会话不打扰)
    const notifyDone = (sid: string) => {
      const title = sessionTitle(sid);
      if (document.hidden) {
        desktopBridge.flashFrame();
        void desktopBridge.showNotification(
          translate('chat.notifySessionDoneTitle'),
          translate('chat.notifySessionDoneBody', { title }),
          undefined,
          sid,
        );
      } else {
        if (sid === useAppStore.getState().currentSessionId) return;
        showToast(translate('chat.backgroundSessionCompleted', { title }), { type: 'success', duration: 4000 });
      }
    };

    // 等待用户(确认卡片 / ask_user):隐藏发系统通知+任务栏闪烁;可见时仅后台会话弹 toast
    const notifyWait = (sid: string) => {
      const title = sessionTitle(sid);
      if (document.hidden) {
        desktopBridge.flashFrame();
        void desktopBridge.showNotification(
          translate('chat.notifyWaitTitle'),
          translate('chat.notifyWaitBody', { title }),
          undefined,
          sid,
        );
      } else {
        if (sid === useAppStore.getState().currentSessionId) return;
        showToast(translate('chat.notifyWaitToast', { title }), { type: 'info', duration: 6000 });
      }
    };

    const unsub = useChatStore.subscribe((state, prev) => {
      for (const [sid, sess] of Object.entries(state.sessionStreams)) {
        if (!sess) continue;
        const p = prev.sessionStreams[sid];
        // 会话完成:doneReason 由空→非空
        if (sess.doneReason && !p?.doneReason) {
          notifyDone(sid);
        }
        // ask_user 等待输入:waitingForUser 由 false→true
        if (sess.waitingForUser && !p?.waitingForUser) {
          notifyWait(sid);
        }
        // 工具确认卡片:toolCall 的 confirmationData 由无→有(按下标对齐,新增事件变更)
        sess.toolCalls.forEach((tc, i) => {
          if (tc.confirmationData && !p?.toolCalls[i]?.confirmationData) {
            notifyWait(sid);
          }
        });
      }
    });

    // 点击系统通知 → 聚焦窗口(主进程处理)并切到对应会话
    const unsubClick = desktopBridge.onNotificationClicked((payload) => {
      if (payload.sessionId) {
        useAppStore.getState().setCurrentSession(payload.sessionId);
      }
    });

    return () => {
      unsub();
      unsubClick();
    };
  }, []);
}