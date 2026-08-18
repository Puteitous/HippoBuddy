/**
 * AppShell - 应用主壳
 *
 * 四栏布局:
 *  ┌────┬─────────┬───────────────────────────────┐
 *  │ AB │ Sidebar │  ChatPanel / Settings         │
 *  │ 活 │ 会话列表 │  (按 appStore.view 切换)       │
 *  │ 动 │         │                               │
 *  │ 栏 │         │                               │
 *  └────┴─────────┴───────────────────────────────┘
 *
 * 顶部状态栏(显示当前会话 id、模式、视图切换按钮)。
 *
 * 阶段 3.1:建立骨架与会话列表。
 * 阶段 3.2:ChatPanel 由占位升级为真实实现(纯文本对话)。
 * 阶段 3.6:Settings 由占位升级为真实实现(8 个设置页 + 主壳 + Toast)。
 * 阶段 3.7-1:挂载全局 ToastViewport / ActivityBar / SkillMarket 浮层。
 * 历史消息加载由 useSessionMessages Hook 处理(切会话时自动 reset + load)。
 */
import { useEffect } from 'react';
import { api } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore } from '@/stores/appStore';
import { useSessionMessages } from '@/hooks/useSessionMessages';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ChatPanel } from './chat-panel/ChatPanel';
import { SettingsPanel } from './settings/SettingsPanel';
import { WorkspacePanel } from './workspace/WorkspacePanel';
import { ConfirmHandler } from './tool-renderers/ConfirmHandler';
import { ActivityBar } from './ActivityBar';
import { SkillMarket } from './SkillMarket';
import { SelectionActions } from './SelectionActions';
import { OnboardingTour } from './OnboardingTour';
import { ToastViewport } from '@/utils/toast';
import './AppShell.css';

export function AppShell() {
  const view = useAppStore((s) => s.view);
  const skillMarketOpen = useAppStore((s) => s.skillMarketOpen);
  const setSkillMarketOpen = useAppStore((s) => s.setSkillMarketOpen);
  const setSessions = useAppStore((s) => s.setSessions);
  const setIsLoadingSessions = useAppStore((s) => s.setIsLoadingSessions);
  const setSessionsError = useAppStore((s) => s.setSessionsError);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const currentSessionId = useAppStore((s) => s.currentSessionId);

  // 切换会话时:reset chatStore + 加载历史消息(由 Hook 统一处理)
  useSessionMessages();

  // 启动时加载会话列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingSessions(true);
      setSessionsError(null);
      try {
        const data = await api.getSessions();
        if (cancelled) return;
        setSessions(data);
        // 默认选中第一个会话(若存在)
        if (data.length > 0 && !currentSessionId) {
          setCurrentSession(data[0].id);
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setSessionsError(msg);
      } finally {
        if (!cancelled) setIsLoadingSessions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅在挂载时加载一次;后续会话增删由对应组件主动调用 api 后更新 store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell-body">
        <ActivityBar />
        <Sidebar />
        <main className="app-shell-main">
          {view === 'chat' ? (
            <ChatPanel />
          ) : view === 'workspace' ? (
            <WorkspacePanel />
          ) : (
            <SettingsPanel />
          )}
        </main>
      </div>
      {/* 工具确认弹窗(全局浮层,仅在 pendingConfirmations 非空时渲染) */}
      <ConfirmHandler />
      {/* 技能市场浮层(由 appStore.skillMarketOpen 控制) */}
      {skillMarketOpen && (
        <SkillMarket
          onClose={() => setSkillMarketOpen(false)}
        />
      )}
      {/* 文本选中快捷操作(全局监听 selectionchange,选中内容 → 输入框 RefChip) */}
      <SelectionActions />
      {/* 全局 Toast 视图(任意组件可触发 showToast) */}
      <ToastViewport />
      {/* 新手指引(首次启动 3s 后展示欢迎面板 + 5 步聚光灯导览) */}
      <OnboardingTour />
    </div>
  );
}
