import { AppShell } from '@/components/AppShell';

/**
 * 应用入口
 *
 * 阶段三 3.1:替换阶段二的连通性验证页,渲染 AppShell 三栏布局。
 * 阶段二建立的 types/api/stores 已就绪,这里通过 AppShell 串起:
 *  - appStore.sessions / currentSessionId / view
 *  - chatStore 全部 SSE 事件 reducer
 *  - useChatStream 启动 streamSse
 */
export default function App() {
  return <AppShell />;
}
