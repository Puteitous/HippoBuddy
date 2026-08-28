/**
 * ChatPanel - 聊天面板
 *
 * 输入区使用 InlineInput(contenteditable)实现行内芯片:
 *  - 文件引用芯片与文本同级混合,前后均可输入文字
 *  - 图片预览保持在输入框上方独立区域
 *  - 底部状态栏:# / 📷 | Token | 文件变更 | 模型快速切换 | 发送/停止
 *  - @path 触发:键入 @path/to/file 或 @path:1-10 后按空格自动提取为行内芯片
 *  - 提交:inlineInputRef.getContent() 获取 chips + text,combineChipsToMessage 合并后发送
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useChatStream } from '@/hooks/useChatStream';
import { useSessionStream } from '@/hooks/useSessionStream';
import { useVisionSupport } from '@/hooks/useVisionSupport';
import { api, configApi } from '@/api/client';
import { showToast } from '@/utils/toastStore';
import { translate, useI18n } from '@/i18n';
import { setDefaultProcessView, getDefaultProcessCollapsed } from '@/utils/process-view-config';
import type { Message, PendingImage, RefChip, ToolCallRecord } from '@/types';
import { combineChipsToMessage } from '@/utils/ref-chips';
import { on } from '@/utils/eventBus';
import type { SelectionAddToInputPayload } from '@/utils/eventBus';
import {
  MAX_IMAGE_SIZE_BYTES,
  fileToDataUrl,
  generateImageId,
} from '@/utils/image-vision';

import { MessageBubble, WebSearchStreamingRow } from './MessageBubble';
import { HistoryRenderer } from './HistoryRenderer';
import { ProcessSection } from './ProcessSection';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import { ToolTimeline } from '../tool-renderers/ToolTimeline';
import { ToolTimelineConfirmation } from '../tool-renderers/ToolTimelineConfirmation';
import {
  fromToolCallRecord,
  TIMELINE_STANDALONE_TOOLS,
} from '../tool-renderers/tool-timeline-utils';
import { TokenMonitor } from './TokenMonitor';
import { ImageUpload } from './ImageUpload';
import { Lightbox } from './Lightbox';
import { FileChangesMonitor } from './FileChangesMonitor';
import { ChatNav } from '../ChatNav';
import { ChatPanelHeader } from './ChatPanelHeader';
import { ContextSelector } from '../ContextSelector';
import { ChatEmptyHero } from './ChatEmptyHero';
import { ModelSelectorPanel } from '../ModelSelectorPanel';
import type { RuleItem as ContextRuleItem, SkillItem as ContextSkillItem } from '../ContextSelector';
import InlineInput from './InlineInput';
import type { InlineInputHandle } from './InlineInput';
import { PermissionBadge } from './PermissionBadge';
import '../tool-renderers/tool-renderers.css';
import './ChatPanel.css';

export function ChatPanel() {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setSessions = useAppStore((s) => s.setSessions);
  const saveSessionInputDraft = useAppStore((s) => s.saveSessionInputDraft);
  const clearSessionInputDraft = useAppStore((s) => s.clearSessionInputDraft);
  const saveHeroPendingDraft = useAppStore((s) => s.saveHeroPendingDraft);
  const clearHeroPendingDraft = useAppStore((s) => s.clearHeroPendingDraft);
  // 当前会话的流式分区(权威数据源;含 messages/stream/toolCalls/isSending 等)
  const {
    messages,
    isReasoning,
    stream,
    error,
    warnings,
    toolCalls,
    webSearchActions,
    webSearching,
    todoList,
    isSending,
    collapsedRounds,
    processStartedAt,
    processEndedAt,
  } = useSessionStream();
  const clearWarnings = useChatStore((s) => s.clearWarnings);
  const toggleRoundCollapsed = useChatStore((s) => s.toggleRoundCollapsed);

  // 挂载时同步一次默认展示模式(来源于后端 ui.default_process_view),供新建会话初始态使用。
  // 沿 PermissionBadge 模式:组件自读 configApi,避免引入全局 config store。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await configApi.getFull();
        if (!cancelled) setDefaultProcessView(config.ui?.default_process_view);
      } catch {
        // 读取失败保持内存默认(full),不打扰
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 流式渲染行:按 stream 顺序交错渲染 assistant 气泡与工具卡片(对齐旧版 segment 时序)。
  // 文本/思考段落渲染为 assistant 气泡,连续普通工具合并为 timeline,todo_write 独立卡片;
  // ask_user 由 HistoryRenderer 内联渲染(数据源 waiting_user 事件,不在流式行重复出现)。
  const streamRows = useMemo(() => {
    const rows: ReactNode[] = [];
    const toolMap = new Map(toolCalls.map((tc) => [tc.id, tc]));
    // 最后一段 assistant(当前打开的流式段)才显示"思考中",其余历史上周显示"已思考"
    let lastAssistantIdx = -1;
    for (let i = stream.length - 1; i >= 0; i--) {
      if (stream[i].kind === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    // 当前"打开"的流式段 = 最后一段 assistant,且它确实在流的末尾(后面没有 tool 段)。
    // 若只有 assistant 后紧跟着 tool,说明这段文本已定稿,不应再带闪烁光标/思考中;
    // 否则最后一段已定稿的 assistant 在工具运行期间会一直被误标为 streaming。
    const tailIsAssistant = stream[stream.length - 1]?.kind === 'assistant';
    let tlBuf: ToolCallRecord[] = [];
    const flushTools = () => {
      if (tlBuf.length === 0) return;
      // 待确认的 bash/delete_file 抽离到 HistoryRenderer 下方的独立确认区
      // (pendingConfirmRecords)持久渲染,对齐旧版"确认区是回合数据、流结束不消失"
      // 的语义;不再放入依赖 isStreamSending 的流式 timeline,避免 isSending=false
      // 时确认卡片随 tail 卸载。决策后 confirmationData 清除,独立区消失,
      // 该记录由后续 tool_result 固化到 timeline 回到执行中态。
      const restBuf = tlBuf.filter((tc) => !tc.confirmationData);
      tlBuf = [];
      if (restBuf.length === 0) return;
      // 按原始顺序交错渲染独立卡片与 timeline,与固化后 HistoryRenderer 的插入顺序
      // 保持一致(对齐其 flushToolGroup/tool-card 逻辑)。若改用 groupTimelineItems 把
      // standalone 统一前移,则 [普通工具, todo_write, 普通工具] 这类交错序列在流式与
      // 固化会顺序翻转 + DOM 重排重挂,导致进入动画重放(key 也不同)。
      const group: ToolCallRecord[] = [];
      const flushGroup = () => {
        if (group.length === 0) return;
        const g = group.splice(0);
        rows.push(<ToolTimeline key={`tl-${g[0].id}`} items={g.map(fromToolCallRecord)} />);
      };
      for (const tc of restBuf) {
        if (TIMELINE_STANDALONE_TOOLS.has(tc.name)) {
          // 遇到独立工具先收尾当前 timeline 组,再渲染独立卡片,保留交错顺序
          flushGroup();
          if (tc.name === 'ask_user') continue;
          if (tc.name === 'todo_write') {
            // todo_write 渲染会话级累计树(tool_start 已驱动 mergeTodoList 更新)。
            rows.push(
              <ToolCardDispatcher
                key={tc.id}
                record={{ ...tc, args: { mode: 'merge', todos: todoList } }}
              />,
            );
          } else {
            rows.push(<ToolCardDispatcher key={tc.id} record={tc} />);
          }
        } else {
          group.push(tc);
        }
      }
      flushGroup();
    };
    stream.forEach((item, idx) => {
      if (item.kind === 'assistant') {
        flushTools();
        // 空白 assistant 段(thinking 事件创建的初始段,尚无 reasoning/text):
        // 与 commitStreamingMessage 固化时跳过空段(logic 对称)同样不渲染,
        // 避免"流式中显示空气泡 → done 固化后消失"导致该节点卸载重挂。
        if (!item.text && !item.reasoning) return;
        // 仅最后一段(当前打开的流式段)显示光标与"思考中"标签;
        // 中间被工具分隔的段落无光标、无 footer,避免多个光标闪烁
        const isOpen = idx === lastAssistantIdx && tailIsAssistant;
        // 联网搜索动作注入当前流式段:使实时流与固化后 HistoryRenderer 渲染同一
        // WebSearchRow,且 key 一致时 DOM 复用,避免进入动画重放。
        const msg: Message = {
          id: `s-${item.turn}-${idx}`,
          role: 'assistant',
          content: item.text || '',
          reasoning_content: item.reasoning || undefined,
        };
        if (isOpen && webSearchActions.length > 0) {
          msg.web_searched = true;
          msg.web_search_actions = webSearchActions;
        }
        rows.push(
          <MessageBubble
            key={`s-${item.turn}-${idx}`}
            message={msg}
            isStreaming={isOpen}
            isReasoning={isReasoning && isOpen}
            className={idx === lastAssistantIdx ? 'round-final-text' : undefined}
          />,
        );
      } else {
        const rec = toolMap.get(item.callId);
        if (rec) tlBuf.push(rec);
      }
    });
    flushTools();

    // 实时流搜索进行中:末尾渲染瞬态行「正在联网搜索…」(对齐旧版流式态标记)
    if (webSearching) {
      rows.push(<WebSearchStreamingRow key="web-search-streaming" />);
    }

    // ── 处理过程统一收起(Codex 风格) ──────────────────────────
    // 仅当回合存在思考或工具调用时才包 ProcessSection(纯文本回合不显示摘要条)。
    const hasThinking =
      isReasoning || stream.some((a) => a.kind === 'assistant' && !!a.reasoning);
    // 工具数为回合级累计:thinking 不再中途清空 toolCalls,流式期间 toolCalls 即整个
    // 回合的工具数(无需再累加已固化到 messages 的部分)。done 后 toolCalls 清空
    // (仅留待确认),wrap 随之失效,避免 stream 清空后仍因已固化工具数渲染出空 ProcessSection。
    const toolCount = toolCalls.length;
    // wrap 不依赖 rows.length:thinking 追加新空段、该段尚无 reasoning/text 时也要保持
    // 摘要条,否则工具调用后重新思考的瞬间摘要条短暂消失又出现(闪现)。
    const wrap = hasThinking || toolCount > 0;
    // 回合级稳定 key:取当前 user 消息 id(而非首行 key),使同一回合内多次 thinking
    // 不改变 ProcessSection key,避免 DOM 卸载重挂导致摘要条闪现。
    // 必须与 HistoryRenderer 固化侧一致用 serverId ?? id:user 消息乐观追加时 id 为
    // local-* 临时值,message_id 事件会把后端真实 uuid 记到 serverId;若这里只用 id
    // 而固化侧用 serverId,done 固化时 key 从 process-local-* 变为 process-{uuid},
    // 整回合被判定为新节点卸载重挂,重放进场动画(闪烁回归,由 4407e85 引入)。
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const roundKey = lastUser ? (lastUser.serverId ?? lastUser.id) : 'tail';
    if (wrap) {
      // 处理过程总耗时:起点 = 思考/首个工具开始;终点 = 已定格结束时间,
      // 仍在运行(isSending / 思考中 / 工具 running)时取当前时间实时跳动。
      let end = processEndedAt ?? 0;
      for (const tc of toolCalls) {
        if (tc.endedAt) end = Math.max(end, tc.endedAt);
      }
      if (isSending || isReasoning || toolCalls.some((tc) => tc.status === 'running')) {
        end = Date.now();
      }
      const elapsedMs =
        processStartedAt != null && end > 0 ? Math.max(0, end - processStartedAt) : null;
      // key 用回合级 user 消息 id,与固化后 HistoryRenderer 回合包装的 key 一致,保证 DOM 复用
      return [
        <ProcessSection
          key={`process-${roundKey}`}
          collapsed={collapsedRounds[roundKey] ?? getDefaultProcessCollapsed()}
          onToggle={() => toggleRoundCollapsed(roundKey)}
          hasThinking={hasThinking}
          toolCount={toolCount}
          elapsedMs={elapsedMs}
          streaming={isSending}
        >
          {rows}
        </ProcessSection>,
      ];
    }
    return rows;
  }, [
    messages,
    stream,
    toolCalls,
    isReasoning,
    webSearchActions,
    webSearching,
    todoList,
    isSending,
    collapsedRounds,
    processStartedAt,
    processEndedAt,
    toggleRoundCollapsed,
  ]);

  // 待确认工具记录:独立于流式 tail 持久渲染(对齐旧版回合级行内确认)。
  // 从 toolCalls 过滤带 confirmationData 的记录,不依赖 isStreamSending;
  // done 固化时 chatStore 也会保留待确认记录(见 commitStreamingMessage),
  // 直到用户决策后 confirmationData 被清除,此处自动消失。
  const pendingConfirmRecords = useMemo(
    () => toolCalls.filter((tc) => !!tc.confirmationData),
    [toolCalls],
  );

  const { send, abort, isSending: isStreamSending } = useChatStream();

  /** 聊天面板是否已收起(对齐旧版 chat-panel.collapsed) */
  const [collapsed, setCollapsed] = useState(false);
  /** 是否显示"滚动到底部"提示按钮(用户上滚离开底部时显示) */
  const [showScrollHint, setShowScrollHint] = useState(false);
  /** 行内输入框引用，用于外部操作 */
  const inlineInputRef = useRef<InlineInputHandle | null>(null);
  /** 行内输入框是否有内容(用于控制发送按钮禁用态) */
  const [hasInputContent, setHasInputContent] = useState(false);
  /** 待发送图片(转为 dataUrl 后随 ChatRequest.images 提交) */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  /** 灯箱预览的当前索引(null 为关闭) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 复用 chatStore.pushWarning 展示图片上传警告(语义可接受)
  const pushWarning = useChatStore((s) => s.pushWarning);
  /** 当前模型是否支持视觉(粘贴图片时校验,对齐旧版 ImageUpload._isVisionSupported) */
  const visionSupported = useVisionSupport();

  // ── ContextSelector 选中状态(规则/技能) ──────────────────
  /** 选中的规则 id 列表(规则 id = `${source}:${name}`) */
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  /** 选中的技能 filePath 列表(同时映射为 refChips,显示在输入区) */
  const [selectedSkillPaths, setSelectedSkillPaths] = useState<string[]>([]);

  /** 规则选中切换 */
  const handleRuleToggle = useCallback(
    (rule: ContextRuleItem, selected: boolean) => {
      const id = `${rule.source}:${rule.name}`;
      setSelectedRuleIds((prev) =>
        selected ? [...prev, id] : prev.filter((x) => x !== id),
      );
    },
    [],
  );

  /** 技能选中切换:行内插入/移除芯片 */
  const handleSkillToggle = useCallback(
    (skill: ContextSkillItem, selected: boolean) => {
      setSelectedSkillPaths((prev) =>
        selected
          ? [...prev, skill.filePath]
          : prev.filter((p) => p !== skill.filePath),
      );
      if (selected) {
        const fileName = skill.fileName || skill.filePath.split(/[/\\]/).pop() || '';
        const chip: RefChip = {
          id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'file',
          text: skill.name || fileName.replace(/\.md$/, ''),
          filePath: skill.filePath,
        };
        inlineInputRef.current?.insertChipAtCursor(chip);
      } else {
        inlineInputRef.current?.removeChipByFilePath(skill.filePath);
      }
    },
    [],
  );

  // ── 自动滚动 ──────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  // 消息容器 DOM 实例(ChatNav 顶层常驻后,以 state 传递才能在其 effect 中触发
  // 重新绑定滚动监听;ref 对象本身变化不会触发子组件 effect)
  const [messagesContainerEl, setMessagesContainerEl] = useState<HTMLDivElement | null>(null);
  // 用户是否手动上滚(暂停自动滚动)
  const stickToBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // 消息列表/流式内容变化时滚到底部(若未被用户上滚打断)
  // pendingConfirmRecords.length:确认阶段 SSE 已结束(stream 不再变化),
  // 独立确认区出现在消息列表末尾,需主动触发一次滚动使其进入可视区(对齐旧版
  // 确认后 _smartScroll 跟随行为);用 length 而非数组引用,避免工具进度更新误触发。
  // 待确认区存在时直接对滚动容器设 scrollTop(不依赖 scrollIntoView,后者受布局
  // 影响可能滚不到位),确保确认卡片进入可视区。
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (pendingConfirmRecords.length > 0) {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    scrollToBottom('auto');
  }, [pendingConfirmRecords.length, messages.length, stream, isReasoning, scrollToBottom]);

  // 切换会话时,重置 stickToBottom,并滚到底
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowScrollHint(false);
    // 等下一帧渲染完历史消息再滚
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [currentSessionId, scrollToBottom]);

  // 切换会话:恢复该会话的输入草稿,清空图片,并聚焦输入框
  useEffect(() => {
    const drafts = useAppStore.getState().sessionInputDrafts;
    const heroDraft = useAppStore.getState().heroPendingDraft;
    const draft = currentSessionId ? (drafts[currentSessionId] || '') : heroDraft;
    setPendingImages([]);
    requestAnimationFrame(() => {
      const input = inlineInputRef.current;
      if (!input) return;
      if (draft) {
        try {
          const state = JSON.parse(draft) as { text?: string; chips?: RefChip[] };
          input.restore({ text: state.text || '', chips: state.chips || [] });
        } catch {
          // 旧格式(纯文本)或解析失败 → 作为纯文本回填
          input.restore({ text: draft, chips: [] });
        }
      } else {
        input.clear();
      }
      input.focus();
    });
  }, [currentSessionId]);

  // 监听滚动事件,判断是否贴底;离开底部 ≥100px 时显示回底提示(对齐旧版)
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    setShowScrollHint(distanceFromBottom >= 100);
  }, []);

  /** 点击回底提示:平滑滚到底部并恢复自动跟随(对齐旧版 newMsgHint click) */
  const handleScrollToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    setShowScrollHint(false);
    scrollToBottom('smooth');
  }, [scrollToBottom]);

  // ── Images 管理 ─────────────────────────────────────────
  const addImage = useCallback((image: PendingImage) => {
    setPendingImages((prev) => [...prev, image]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── 发送/中断 ────────────────────────────────────────────
  // 内容空/非空翻转 → 仅更新发送按钮态
  const handleInlineContentChange = useCallback((hasContent: boolean) => {
    setHasInputContent(hasContent);
  }, []);

  // 内容实时变化(输入、增删芯片) → 按会话保存草稿
  const handleDraftChange = useCallback(
    (content: { text: string; chips: RefChip[] }) => {
      const heroVirtual = currentSessionId?.startsWith('web-') && messages.length === 0;
      const empty = !content.text && content.chips.length === 0;
      if (empty) {
        if (currentSessionId) clearSessionInputDraft(currentSessionId);
        else clearHeroPendingDraft();
        if (heroVirtual) clearHeroPendingDraft();
        return;
      }
      const draft = JSON.stringify(content);
      if (currentSessionId) saveSessionInputDraft(currentSessionId, draft);
      else saveHeroPendingDraft(draft);
      // hero 空态(web-* 虚拟会话且尚无消息)输入时,同步 hero 待定草稿
      if (heroVirtual) saveHeroPendingDraft(draft);
    },
    [currentSessionId, messages.length, saveSessionInputDraft, clearSessionInputDraft, saveHeroPendingDraft, clearHeroPendingDraft],
  );

  // 粘贴图片处理
  const handlePasteImage = useCallback(
    (blob: Blob, name: string) => {
      if (isStreamSending) return;
      // 模型不支持视觉时拦截粘贴图片(对齐旧版 ImageUpload 粘贴校验)
      if (!visionSupported) {
        pushWarning(translate('chat.noVisionSupport'));
        return;
      }
      if (blob.size > MAX_IMAGE_SIZE_BYTES) {
        pushWarning(translate('chat.imageTooLarge', { name }));
        return;
      }
      void fileToDataUrl(blob)
        .then((dataUrl) => {
          addImage({ id: generateImageId(), dataUrl, name, size: blob.size });
        })
        .catch((err) => {
          pushWarning(`${translate('chat.readImageFailed')}${err instanceof Error ? `: ${err.message}` : ''}`);
        });
    },
    [isStreamSending, visionSupported, addImage, pushWarning],
  );

  const handleSend = useCallback(() => {
    const content = inlineInputRef.current?.getContent() ?? { text: '', chips: [] };
    const { text, chips } = content;
    const typed = text.trim();
    // 无输入且无芯片且无图片 → 不发送
    if (!typed && chips.length === 0 && pendingImages.length === 0 && !selectedRuleIds.length) return;
    if (isStreamSending) return;
    // 合并 chips 到 message(file/rule chip → @path,text chip → 代码块)
    const message = combineChipsToMessage(chips, typed);
    // 取出图片 dataUrl 列表
    const images = pendingImages.map((p) => p.dataUrl);
    // 当前选中的规则 id(由 ContextSelector 维护)
    const selectedRules = selectedRuleIds.length > 0 ? [...selectedRuleIds] : undefined;
    // 重置输入
    inlineInputRef.current?.clear();
    setPendingImages([]);
    // 清除该会话的输入草稿 + hero 待定草稿
    if (currentSessionId) clearSessionInputDraft(currentSessionId);
    clearHeroPendingDraft();
    // 注意:不重置 selectedRuleIds / selectedSkillPaths,
    // 让用户可连续追问同一组上下文(对齐旧版行为)
    stickToBottomRef.current = true;
    clearWarnings();
    void send(message, {
      images: images.length > 0 ? images : undefined,
      selectedRules,
    });

    // 对齐旧版虚拟会话机制:新建会话(当前 id 尚不在列表中)发送消息后,后台刷新会话列表,
    // 让新会话实时进入侧边栏列表与历史下拉,不必等刷新页面。
    // 稍作延迟以等待请求到达后端、用户消息已落盘到 JSONL。
    const knownSessions = useAppStore.getState().sessions;
    if (currentSessionId && !knownSessions.some((s) => s.id === currentSessionId)) {
      window.setTimeout(() => {
        api.getSessions().then(setSessions).catch(() => {});
      }, 300);
    }

    // 发送后聚焦输入框,便于继续输入
    requestAnimationFrame(() => inlineInputRef.current?.focus());
  }, [isStreamSending, send, clearWarnings, pendingImages, selectedRuleIds, currentSessionId, clearSessionInputDraft, clearHeroPendingDraft]);

  // ── 重试(assistant footer 按钮,对齐旧版 retryBtn) ───────
  // 重发指定用户消息文本,不经过输入框
  const handleRetry = useCallback(
    (content: string) => {
      if (!content.trim() || isStreamSending) return;
      stickToBottomRef.current = true;
      clearWarnings();
      void send(content);
    },
    [send, isStreamSending, clearWarnings],
  );

  // ── 分叉(assistant footer 按钮,对齐旧版 forkBtn) ────────
  // POST /api/sessions/:id/fork → 切换到新会话 + 刷新会话列表 + toast
  const handleFork = useCallback(
    async (messageId: string) => {
      if (!currentSessionId) return;
      try {
        const res = await api.sessions.fork(currentSessionId, { messageId });
        if (res.newSessionId) {
          setCurrentSession(res.newSessionId);
          // 刷新会话列表(新分叉会话出现在列表)
          api.getSessions().then(setSessions).catch(() => {});
          showToast(translate('chat.forkSuccess'), { type: 'success', duration: 4000 });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showToast(translate('chat.forkFailedMsg', { message: msg }), { type: 'error', duration: 3000 });
      }
    },
    [currentSessionId, setCurrentSession, setSessions],
  );

  // ── 回滚事件订阅(阶段 3.7-2) ───────────────────────────
  // rollback:prepare → 中断当前生成;rollback:restoreInput → 回填输入框
  useEffect(() => {
    const offPrepare = on('rollback:prepare', () => {
      if (isStreamSending) abort();
    });
    const offRestore = on('rollback:restoreInput', (text: string) => {
      requestAnimationFrame(() => {
        const input = inlineInputRef.current;
        if (!input) return;
        input.setContent(text);
        input.focus();
      });
    });
    return () => {
      offPrepare();
      offRestore();
    };
  }, [isStreamSending, abort]);

  // ── 文本选中快捷操作订阅(阶段 3.7-2) ───────────────────
  // SelectionActions 将选中文本发来 → 生成 RefChip 并插入行内
  useEffect(() => {
    const offSelection = on('selection:add-to-input', (payload: SelectionAddToInputPayload) => {
      const id = `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let chip: RefChip;
      if (payload.refType === 'file' && payload.filePath) {
        const fileName = payload.filePath.split(/[/\\]/).pop() || payload.text;
        chip = {
          id,
          kind: 'file',
          text: fileName,
          filePath: payload.filePath,
          selectedText: payload.selectedText,
          startLine: payload.startLine,
          endLine: payload.endLine,
        };
      } else {
        chip = { id, kind: 'text', text: payload.text };
      }
      inlineInputRef.current?.insertChipAtCursor(chip);
      // 聚焦输入框,便于用户直接回车发送
      requestAnimationFrame(() => inlineInputRef.current?.focus());
    });
    return () => {
      offSelection();
    };
  }, []);

  // ── 预设点击:把 prompt 填入输入框并聚焦 ─────────────────
  const handlePresetSelect = useCallback((prompt: string) => {
    requestAnimationFrame(() => {
      const input = inlineInputRef.current;
      if (!input) return;
      input.setContent(prompt);
      input.focus();
    });
  }, []);

  // ── 欢迎屏 Hero 显示条件(对齐旧版 createNewSession) ──────
  // 无选中会话 → 显示;或当前为"新建后尚未发送消息"的虚拟 web- 会话 → 回到 hero 空态。
  // 首次发送(乐观追加消息)→ messages 非空即切回消息区,与旧版 .has-messages 行为一致。
  const isEmptyVirtual =
    !!currentSessionId &&
    currentSessionId.startsWith('web-') &&
    messages.length === 0 &&
    !isStreamSending &&
    toolCalls.length === 0;
  const showHero = !currentSessionId || isEmptyVirtual;

  const hasAttachments = pendingImages.length > 0;

  // ── 收起状态:仅显示右侧浮动展开按钮(对齐旧版 .chat-show-btn) ──
  if (collapsed) {
    return (
      <div className="chat-panel chat-panel-collapsed">
        <button
          type="button"
          className="chat-show-btn"
          onClick={() => setCollapsed(false)}
          title={t('chat.expand')}
          aria-label={t('chat.expand')}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 4 12 8 4 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      {/* 面板头部(对齐旧版 .chat-panel-header) */}
      <ChatPanelHeader onCollapse={() => setCollapsed(true)} />

      {/* 会话内用户消息导航(右侧浮动窄条)。
          对齐旧版:chatNavStrip 为静态 DOM 元素,始终存在(空态由 CSS data-empty 隐藏),
          故放在 .chat-panel 顶层、条件分支之外,不随会话/消息有无而卸载。 */}
      <ChatNav container={messagesContainerEl} />

      {/* 空会话:欢迎屏 Hero(对齐旧版 .empty-state)
          显示条件对齐旧版 createNewSession:除了无选中会话外,
          新建(尚未发送消息的虚拟 web- 会话)也回到 hero 空态;首次发送后即切换为消息区。 */}
      {showHero ? (
        <ChatEmptyHero onPresetSelect={handlePresetSelect} />
      ) : (
        <>
          {/* 消息区(滚动容器) */}
          <div
            ref={(el) => {
              messagesContainerRef.current = el;
              // 同步给 ChatNav(state),触发其重新绑定滚动监听
              setMessagesContainerEl(el);
            }}
            className="chat-panel-messages"
            onScroll={handleScroll}
          >
            {/* 实时流式 rows 作为 tail 并入同一 history-list 容器:与固化后消息
                同 key 复用 DOM,避免卸载重挂导致进入动画重放 */}
            <HistoryRenderer
              onRetry={handleRetry}
              onFork={handleFork}
              // tail 不依赖 isStreamSending:确认阶段(tool_confirmation 后 complete 置
              // isSending=false)stream 尚未固化,若切断 tail 会导致已输出的思考/工具
              // 从屏幕消失只剩确认卡。改为仅看是否有流式内容;done/ask/abort 都会清空
              // stream,此时 streamRows 为空自然消失,由 HistoryRenderer 固化渲染接管。
              tail={streamRows.length > 0 ? streamRows : undefined}
            />
            {/* 待确认工具独立确认区:对齐旧版行内确认持久化。
                不依赖 isStreamSending,流式结束后确认区仍保留在回合内,
                直到用户决策(confirmTool)清除 confirmationData 才消失。 */}
            {pendingConfirmRecords.length > 0 && (
              <div className="history-confirm-zone">
                {pendingConfirmRecords.map((tc) =>
                  tc.confirmationData ? (
                    // 直接渲染自足的确认块(命令+风险+允许/拒绝),不再包一层
                    // ToolTimeline,避免出现冗余的 bash 摘要行(命令重复显示+多余复制按钮)。
                    <ToolTimelineConfirmation
                      key={`confirm-${tc.id}`}
                      confirmationData={tc.confirmationData}
                    />
                  ) : null,
                )}
              </div>
            )}
        {/* 错误提示 */}
        {error && (
          <div className="chat-panel-error">
            <strong>{t('chat.error')}:</strong> {error}
          </div>
        )}

        {/* 警告提示 */}
        {warnings.length > 0 && (
          <div className="chat-panel-warnings">
            <button
              type="button"
              className="chat-panel-warnings-close"
              onClick={clearWarnings}
              aria-label={t('chat.clearWarnings')}
            >
              ×
            </button>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 滚动锚点 */}
        <div ref={messagesEndRef} className="chat-panel-anchor" />
      </div>

        </>
      )}

      {/* 输入区(始终显示,对齐旧版 .input-container 常驻,hero 与消息态均可见) */}
      <div className="chat-panel-input-area">
        {/* 回底提示按钮(对齐旧版 .new-msg-hint:用户上滚离开底部时显示) */}
        {showScrollHint && (
          <button
            type="button"
            className="new-msg-hint"
            onClick={handleScrollToBottom}
            title={t('chat.scrollToBottom')}
            aria-label={t('chat.scrollToBottom')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        <div className="chat-panel-input-card">
          {/* 图片预览(有附件时显示,保持在上方) */}
          {hasAttachments && (
            <div className="chat-panel-input-attachments">
              {pendingImages.length > 0 && (
                <div className="image-upload-previews">
                  {pendingImages.slice(0, 5).map((img) => (
                    <div key={img.id} className="image-upload-thumb-wrapper">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="image-upload-thumb"
                        onClick={() => setLightboxIndex(pendingImages.findIndex((p) => p.id === img.id))}
                      />
                      <button
                        type="button"
                        className="image-upload-remove"
                        onClick={() => removeImage(img.id)}
                        aria-label={t('chat.removeImage', { name: img.name })}
                        title={t('chat.removeImage', { name: img.name })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {pendingImages.length > 5 && (
                    <span className="image-upload-overflow" title={t('chat.moreImages', { count: pendingImages.length - 5 })}>
                      +{pendingImages.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 主输入行:行内芯片输入框(芯片与文本同级混合) */}
          <div className="chat-panel-input-row">
            <InlineInput
              ref={inlineInputRef}
              placeholder={t('chat.inputPlaceholder')}
              onSend={handleSend}
              onPasteImage={handlePasteImage}
              onContentChange={handleInlineContentChange}
              onDraftChange={handleDraftChange}
            />
          </div>

          {/* 状态栏(对齐旧版 .input-status-bar):# / 📷 | Token | 文件变更 | 模型 | 发送/停止 */}
          <div className="chat-panel-input-status-bar">
            <div className="chat-panel-status-left">
              <PermissionBadge />
              <span className="chat-panel-status-divider" aria-hidden />
              <ContextSelector
                selectedRuleIds={selectedRuleIds}
                selectedSkillPaths={selectedSkillPaths}
                onRuleToggle={handleRuleToggle}
                onSkillToggle={handleSkillToggle}
              />
              {/* ImageUpload 始终挂载,内部按 visionSupported 控制按钮可见性;预览已上移到附件行 */}
              <ImageUpload
                images={pendingImages}
                onAdd={addImage}
                onRemove={removeImage}
                disabled={isStreamSending}
                showPreview={false}
              />
              <span className="chat-panel-status-divider" aria-hidden />
              {/* Token 使用率 / 文件变更:hero 空态下隐藏,仅消息态显示(对齐旧版
                  .hero-mode .status-bar-item:not(#statusBarModelSelector) 隐藏;旧版隐藏全部
                  除模型选择器外的状态项,此处按需求仅收敛这两个) */}
              {!showHero && (
                <>
                  <TokenMonitor statusBar />
                  <span className="chat-panel-status-divider" aria-hidden />
                  <FileChangesMonitor />
                  <span className="chat-panel-status-divider" aria-hidden />
                </>
              )}
              <ModelSelectorPanel placement="top" />
            </div>
            <div className="chat-panel-status-actions">
              {isStreamSending ? (
                <button
                  type="button"
                  className="chat-panel-abort-btn"
                  onClick={abort}
                  title={t('chat.stop')}
                  aria-label={t('chat.stop')}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="chat-panel-send-btn"
                  onClick={handleSend}
                  disabled={!hasInputContent && pendingImages.length === 0}
                  title={t('chat.sendMessage')}
                  aria-label={t('chat.sendMessage')}
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <line x1="8" y1="15" x2="8" y2="1" />
                    <polyline points="2 7 8 1 14 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {lightboxIndex != null && pendingImages[lightboxIndex] && (
        <Lightbox
          images={pendingImages.map((p) => ({ src: p.dataUrl, name: p.name }))}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}


