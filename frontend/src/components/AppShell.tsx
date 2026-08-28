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
 * 历史消息加载由 useSessionMessages Hook 处理(切会话时复用活跃流分区 / 加载历史)。
 */
import { useEffect } from 'react';
import { api } from '@/api/client';
import { ApiError } from '@/api/error';
import { useAppStore, readSessionsCache } from '@/stores/appStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUpdateStore } from '@/stores/updateStore';
import { useSessionMessages } from '@/hooks/useSessionMessages';
import { useCompletedTaskNotification } from '@/hooks/useCompletedTaskNotification';
import { Sidebar } from './Sidebar';
import { SidebarResizer } from './SidebarResizer';
import { TopBar } from './TopBar';
import { ChatPanel } from './chat-panel/ChatPanel';
import { SettingsPanel } from './settings/SettingsPanel';
import { PreviewPanel } from './workspace/PreviewPanel';
import { PreviewResizer } from './workspace/PreviewResizer';
import { ActivityBar } from './ActivityBar';
import { SkillMarket } from './SkillMarket';
import { SelectionActions } from './SelectionActions';
import { OnboardingTour } from './OnboardingTour';
import { UpdateCard } from './UpdateCard';
import { ToastViewport } from '@/utils/toast';
import './AppShell.css';

export function AppShell() {
  const view = useAppStore((s) => s.view);
  const panelLayout = useAppStore((s) => s.panelLayout);
  const skillMarketOpen = useAppStore((s) => s.skillMarketOpen);
  const setSkillMarketOpen = useAppStore((s) => s.setSkillMarketOpen);
  const setSessions = useAppStore((s) => s.setSessions);
  const setIsLoadingSessions = useAppStore((s) => s.setIsLoadingSessions);
  const setSessionsError = useAppStore((s) => s.setSessionsError);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const currentSessionId = useAppStore((s) => s.currentSessionId);

  // 切换会话时:reset chatStore + 加载历史消息(由 Hook 统一处理)
  useSessionMessages();

  // 后台会话任务完成时弹 toast 提醒(仅监听 done 事件,不影响当前会话)
  useCompletedTaskNotification();

  // 启动时初始化主题(localStorage + 桌面端 Electron 校正)
  useEffect(() => {
    void useThemeStore.getState().initTheme();
  }, []);

  // 注册 Electron 自动更新事件监听(仅桌面端有效;浏览器端 onUpdateEvents 返回 noop)
  useEffect(() => {
    const unsubscribe = useUpdateStore.getState().registerListeners();
    return unsubscribe;
  }, []);

  // 启动时加载会话列表:先展示 localStorage 缓存(若有),再后台请求刷新对齐最新数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSessionsError(null);
      const cached = readSessionsCache();
      if (cached.length > 0) {
        // 命中缓存:立即渲染列表,免除刷新后的空白等待
        setSessions(cached);
        // 恢复上次会话;若持久化的 id 已失效(会话被删除),回退到缓存中的第一个会话
        const cachedExists = currentSessionId && cached.some((s) => s.id === currentSessionId);
        if (cached.length > 0 && !cachedExists) {
          setCurrentSession(cached[0].id);
        }
      } else {
        setIsLoadingSessions(true);
      }
      try {
        const data = await api.getSessions();
        if (cancelled) return;
        setSessions(data);
        // 以后台返回的最新列表为准,再次校正当前会话。
        // 注意必须读取「此刻」的 currentSessionId,而非挂载闭包里的旧值:
        // 等待 getSessions 期间用户可能已点击「新建」生成了 web-* 虚拟会话。
        // 若沿用旧值判断(旧值常为 null 或失效的 web-*,不在真实列表),会误判
        // 为当前会话失效,进而用 data[0] 覆盖用户主动新建的空会话,把 hero 跳回历史对话。
        // 故:当前会话为空、或为真实会话且确已失效时才兜底选中 data[0];
        // 当前为虚拟 web-*(用户正在新建)时保持原状,不跳回。
        const latestId = useAppStore.getState().currentSessionId;
        const latestExists = !!latestId && data.some((s) => s.id === latestId);
        const isVirtualNew = !!latestId && latestId.startsWith('web-');
        if (data.length > 0 && !latestExists && !isVirtualNew) {
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
        <SidebarResizer />
        {/* 技能市场在打开时于主内容区内嵌展示(对齐旧版:替换聊天面板,保留活动栏/会话列表) */}
        <main className="app-shell-main">
          {skillMarketOpen ? (
            <SkillMarket
              onClose={() => setSkillMarketOpen(false)}
            />
          ) : view === 'settings' ? (
            <SettingsPanel />
          ) : (
            /* 聊天常驻,文件预览面板与聊天并排(对齐旧版 chat-panel + preview-panel) */
            <div className={`chat-layout${panelLayout === 'chat-left' ? ' layout-chat-first' : ''}`}>
              <ChatPanel />
              <PreviewResizer />
              <PreviewPanel />
            </div>
          )}
        </main>
      </div>
      {/* 文本选中快捷操作(全局监听 selectionchange,选中内容 → 输入框 RefChip) */}
      <SelectionActions />
      {/* 全局 Toast 视图(任意组件可触发 showToast) */}
      <ToastViewport />
      {/* 新手指引(首次启动 3s 后展示欢迎面板 + 5 步聚光灯导览) */}
      <OnboardingTour />
      {/* 自动更新卡片(仅桌面端 available/downloading/downloaded 时渲染) */}
      <UpdateCard />
    </div>
  );
}
