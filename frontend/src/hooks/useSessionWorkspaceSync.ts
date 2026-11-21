/**
 * useSessionWorkspaceSync - 切换会话时让工作区跟随该会话的归属项目
 *
 * 规则（条件自动跟随）：
 *  - 目标会话有归属路径且与当前工作区不同时，才请求切换；
 *  - 当前有会话正在运行（后端 running 或本地 SSE 仍在发送）时不切换，避免
 *    运行中的工具调用被带到其它目录，仅提示；
 *  - 归属目录已不存在时后端返回 400，前端提示且保持当前工作区；
 *  - 会话无归属路径（旧会话）或为尚未持久化的虚拟会话时不动作。
 *
 * 每个会话只在「切到它」时判定一次（handledRef），后台会话列表刷新
 * （messageCount/running 变化）不会把用户手动切换的工作区拽回去。
 */
import { useEffect, useRef } from 'react';
import { workspaceApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { showToast } from '@/utils/toastStore';
import { translate } from '@/i18n';

/** 路径归一化：统一分隔符、去掉末尾斜杠、忽略大小写（Windows 盘符/路径不区分大小写） */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

/** 是否有会话正在执行 Agent 循环（后端标记 + 本地流式状态双重判定） */
function hasRunningSession(): boolean {
  const app = useAppStore.getState();
  if (app.sessions.some((s) => s.running)) return true;
  const streams = useChatStore.getState().sessionStreams;
  return Object.values(streams).some((s) => s.isSending);
}

/**
 * 把工作区切换到指定会话的归属项目。
 * 请求返回后若用户已切到别的会话，按新会话的归属再校正一次。
 */
async function syncWorkspaceForSession(sessionId: string): Promise<void> {
  const app = useAppStore.getState();
  const target = app.sessions.find((s) => s.id === sessionId);
  const projectPath = target?.projectPath?.trim();
  if (!projectPath) return;
  if (app.workspacePath && samePath(app.workspacePath, projectPath)) return;

  if (hasRunningSession()) {
    showToast(translate('sidebar.workspaceFollowBlocked'), { type: 'info', duration: 3000 });
    return;
  }

  try {
    const state = await workspaceApi.setCurrent(projectPath);
    const latest = useAppStore.getState();
    latest.setWorkspacePath(state.path || projectPath);

    // 请求期间用户又切了会话：以最新会话的归属为准再同步一次
    const currentId = latest.currentSessionId;
    if (currentId && currentId !== sessionId) {
      await syncWorkspaceForSession(currentId);
    }
  } catch (e) {
    const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
    showToast(translate('sidebar.workspaceFollowFailed', { err: msg }), { type: 'error', duration: 3000 });
  }
}

export function useSessionWorkspaceSync() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      handledRef.current = null;
      return;
    }
    if (handledRef.current === currentSessionId) return;

    // 列表尚未包含该会话（虚拟会话 / 列表加载中）→ 等列表更新后再判定
    const target = useAppStore.getState().sessions.find((s) => s.id === currentSessionId);
    if (!target) return;

    handledRef.current = currentSessionId;
    void syncWorkspaceForSession(currentSessionId);
  }, [currentSessionId, sessions]);
}
