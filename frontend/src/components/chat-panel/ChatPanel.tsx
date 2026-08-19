/**
 * ChatPanel - 聊天面板
 *
 * 阶段 3.4 升级 + 输入卡片对齐旧版布局:
 *  - 输入区上方:RefChips(引用芯片)+ ImageUpload 图片预览(对齐旧版 .input-refs + .input-img-preview)
 *  - 主输入行:textarea 独占一行(对齐旧版 .input-row)
 *  - 底部状态栏(对齐旧版 .input-status-bar):# / 📷 | Token | 文件变更 | 模型快速切换 | 发送/停止
 *  - @path 触发:textarea 内键入 @path/to/file 或 @path:1-10 后按空格自动提取为 chip
 *  - 提交:combineChipsToMessage 合并 chips + typed 文本,images 一并通过 send 传给后端
 *
 * 与旧版 ChatPanel.js 的差异:
 *  - 不再依赖全局 DOM 委托,改用 React 受控 props 与 state
 *  - ImageUpload 简化:缩略图点击开灯箱预览(Lightbox,对齐旧版 image-lightbox)
 *  - RefChips 简化:不依赖 file-icons.js,3.4 用 emoji 占位(3.5 FileTree 接入后再统一)
 *  - 模式切换仅保留在空会话 Hero(ChatEmptyHero),输入卡片内无模式预设(对齐旧版)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useChatStream } from '@/hooks/useChatStream';
import { api } from '@/api/client';
import { showToast } from '@/utils/toastStore';
import type { PendingImage, RefChip, ToolCallRecord } from '@/types';
import { combineChipsToMessage } from '@/utils/ref-chips';
import { on } from '@/utils/eventBus';
import type { SelectionAddToInputPayload } from '@/utils/eventBus';
import {
  MAX_IMAGE_SIZE_BYTES,
  fileToDataUrl,
  generateImageId,
  isVisionSupported,
} from '@/utils/image-vision';
import { MessageBubble } from './MessageBubble';
import { HistoryRenderer } from './HistoryRenderer';
import { ToolCardDispatcher } from '../tool-renderers/ToolCardDispatcher';
import { AskUserCard } from '../tool-renderers/AskUserCard';
import { ToolTimeline } from '../tool-renderers/ToolTimeline';
import { fromToolCallRecord, groupTimelineItems } from '../tool-renderers/tool-timeline-utils';
import { TokenMonitor } from './TokenMonitor';
import { RefChips } from './RefChips';
import { ImageUpload } from './ImageUpload';
import { Lightbox } from './Lightbox';
import { FileChangesMonitor } from './FileChangesMonitor';
import { ChatNav } from '../ChatNav';
import { ChatPanelHeader } from './ChatPanelHeader';
import { ContextSelector } from '../ContextSelector';
import { ChatEmptyHero } from './ChatEmptyHero';
import { ModelSelectorPanel } from '../ModelSelectorPanel';
import type { RuleItem as ContextRuleItem, SkillItem as ContextSkillItem } from '../ContextSelector';
import '../tool-renderers/tool-renderers.css';
import './ChatPanel.css';

export function ChatPanel() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setSessions = useAppStore((s) => s.setSessions);
  const messages = useChatStore((s) => s.messages);
  const isReasoning = useChatStore((s) => s.isReasoning);
  // 流式渲染序列(对齐旧版 segment 时序:思考/文本/工具按事件顺序交错)
  const stream = useChatStore((s) => s.stream);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const error = useChatStore((s) => s.error);
  const warnings = useChatStore((s) => s.warnings);
  const clearWarnings = useChatStore((s) => s.clearWarnings);
  // 工具调用(实时流中显示,回合结束后由 messages 中的 tool role 消息接管)
  const toolCalls = useChatStore((s) => s.toolCalls);
  // ask_user 触发的用户输入卡片(等待回答时显示)
  const waitingForUser = useChatStore((s) => s.waitingForUser);

  // 流式渲染行:按 stream 顺序交错渲染 assistant 气泡与工具卡片(对齐旧版 segment 时序)。
  // 文本/思考段落渲染为 assistant 气泡,连续普通工具合并为 timeline,todo_write 独立卡片;
  // ask_user 由下方 ask-user 区块渲染,这里跳过避免重复。
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
    let tlBuf: ToolCallRecord[] = [];
    const flushTools = () => {
      if (tlBuf.length === 0) return;
      const { standalone, groups } = groupTimelineItems(tlBuf);
      for (const tc of standalone) {
        if (tc.name === 'ask_user') continue;
        rows.push(<ToolCardDispatcher key={tc.id} record={tc} />);
      }
      for (const g of groups) {
        rows.push(<ToolTimeline key={`tl-${g[0].id}`} items={g.map(fromToolCallRecord)} />);
      }
      tlBuf = [];
    };
    stream.forEach((item, idx) => {
      if (item.kind === 'assistant') {
        flushTools();
        // 仅最后一段(当前打开的流式段)显示光标与"思考中"标签;
        // 中间被工具分隔的段落无光标、无 footer,避免多个光标闪烁
        const isOpen = idx === lastAssistantIdx;
        rows.push(
          <MessageBubble
            key={`s-${item.turn}-${idx}`}
            message={{
              id: streamingMessageId ?? `s-${item.turn}`,
              role: 'assistant',
              content: item.text || '',
              reasoning_content: item.reasoning || undefined,
            }}
            isStreaming={isOpen}
            isReasoning={isReasoning && isOpen}
            showFooter={false}
          />,
        );
      } else {
        const rec = toolMap.get(item.callId);
        if (rec) tlBuf.push(rec);
      }
    });
    flushTools();
    return rows;
  }, [stream, toolCalls, isReasoning, streamingMessageId]);

  const { send, abort, isSending: isStreamSending } = useChatStream();
  const [input, setInput] = useState('');
  /** 聊天面板是否已收起(对齐旧版 chat-panel.collapsed) */
  const [collapsed, setCollapsed] = useState(false);
  /** 是否显示"滚动到底部"提示按钮(用户上滚离开底部时显示) */
  const [showScrollHint, setShowScrollHint] = useState(false);
  /** 引用芯片列表(由 @path 触发或外部 context-selector 添加) */
  const [refChips, setRefChips] = useState<RefChip[]>([]);
  /** 待发送图片(转为 dataUrl 后随 ChatRequest.images 提交) */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  /** 灯箱预览的当前索引(null 为关闭) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 复用 chatStore.pushWarning 展示图片上传警告(语义可接受)
  const pushWarning = useChatStore((s) => s.pushWarning);

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

  /** 技能选中切换:同时维护 refChips(@filePath 形式) */
  const handleSkillToggle = useCallback(
    (skill: ContextSkillItem, selected: boolean) => {
      setSelectedSkillPaths((prev) =>
        selected
          ? [...prev, skill.filePath]
          : prev.filter((p) => p !== skill.filePath),
      );
      setRefChips((prev) => {
        if (selected) {
          // 添加技能引用芯片(@filePath)
          if (prev.some((c) => c.kind === 'file' && c.filePath === skill.filePath)) {
            return prev;
          }
          const fileName = skill.fileName || skill.filePath.split(/[/\\]/).pop() || '';
          const chip: RefChip = {
            id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: 'file',
            text: skill.name || fileName.replace(/\.md$/, ''),
            filePath: skill.filePath,
          };
          return [...prev, chip];
        }
        // 移除对应 chip
        return prev.filter((c) => !(c.kind === 'file' && c.filePath === skill.filePath));
      });
    },
    [],
  );

  // ── 自动滚动 ──────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  // 消息容器 DOM 实例(ChatNav 顶层常驻后,以 state 传递才能在其 effect 中触发
  // 重新绑定滚动监听;ref 对象本身变化不会触发子组件 effect)
  const [messagesContainerEl, setMessagesContainerEl] = useState<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 用户是否手动上滚(暂停自动滚动)
  const stickToBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // 消息列表/流式内容变化时滚到底部(若未被用户上滚打断)
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [messages.length, stream, isReasoning, scrollToBottom]);

  // 切换会话时,重置 stickToBottom,并滚到底
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowScrollHint(false);
    // 等下一帧渲染完历史消息再滚
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [currentSessionId, scrollToBottom]);

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

  // ── Chips / Images 管理 ─────────────────────────────────
  const addChip = useCallback((chip: RefChip) => {
    setRefChips((prev) => [...prev, chip]);
  }, []);

  const removeChip = useCallback((id: string) => {
    setRefChips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addImage = useCallback((image: PendingImage) => {
    setPendingImages((prev) => [...prev, image]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── 发送/中断 ────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const typed = input.trim();
    if (!typed || isStreamSending) return;
    // 合并 chips 到 message(file/rule chip → @path,text chip → 代码块)
    const message = combineChipsToMessage(refChips, typed);
    // 取出图片 dataUrl 列表
    const images = pendingImages.map((p) => p.dataUrl);
    // 当前选中的规则 id(由 ContextSelector 维护)
    const selectedRules = selectedRuleIds.length > 0 ? [...selectedRuleIds] : undefined;
    // 重置输入
    setInput('');
    setRefChips([]);
    setPendingImages([]);
    // 注意:不重置 selectedRuleIds / selectedSkillPaths,
    // 让用户可连续追问同一组上下文(对齐旧版行为)
    stickToBottomRef.current = true;
    clearWarnings();
    void send(message, {
      images: images.length > 0 ? images : undefined,
      selectedRules,
    });
  }, [input, isStreamSending, send, clearWarnings, refChips, pendingImages, selectedRuleIds]);

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
          showToast('已分叉为新会话', { type: 'success', duration: 4000 });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showToast(`分叉失败:${msg}`, { type: 'error', duration: 3000 });
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
      setInput(text);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.selectionStart = text.length;
        ta.selectionEnd = text.length;
      });
    });
    return () => {
      offPrepare();
      offRestore();
    };
  }, [isStreamSending, abort]);

  // ── 文本选中快捷操作订阅(阶段 3.7-2) ───────────────────
  // SelectionActions 将选中文本发来 → 生成 RefChip(file 带选中片段 / text 纯文本)
  useEffect(() => {
    const offSelection = on('selection:add-to-input', (payload: SelectionAddToInputPayload) => {
      const id = `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (payload.refType === 'file' && payload.filePath) {
        const fileName = payload.filePath.split(/[/\\]/).pop() || payload.text;
        addChip({
          id,
          kind: 'file',
          text: fileName,
          filePath: payload.filePath,
          selectedText: payload.selectedText,
          startLine: payload.startLine,
          endLine: payload.endLine,
        });
      } else {
        addChip({ id, kind: 'text', text: payload.text });
      }
      // 聚焦输入框,便于用户直接回车发送
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
    return () => {
      offSelection();
    };
  }, [addChip]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter 发送,Shift+Enter 换行
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
      // 空格触发 @path 提取为 chip(避免污染消息文本)
      if (e.key === ' ' && !e.nativeEvent.isComposing) {
        const target = e.currentTarget;
        const caret = target.selectionStart ?? 0;
        const extracted = tryExtractAtPathChip(input, caret);
        if (extracted) {
          e.preventDefault();
          addChip(extracted.chip);
          // 把 @path 从 textarea 中移除,保留前后文本
          const next = `${extracted.before}${extracted.after}`;
          setInput(next);
          // 还原光标位置(在 before 末尾,after 之前)
          requestAnimationFrame(() => {
            const pos = extracted.before.length;
            target.selectionStart = pos;
            target.selectionEnd = pos;
          });
        }
      }
    },
    [handleSend, input, addChip],
  );

  // ── 粘贴图片(检测 vision 能力后从 clipboard 提取 image/* 项) ────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (isStreamSending || !isVisionSupported()) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) break;
        if (blob.size > MAX_IMAGE_SIZE_BYTES) {
          pushWarning(`图片 ${blob.name || ''} 超过 20MB 限制`);
          break;
        }
        const name = blob.name || `pasted-${Date.now()}.png`;
        void fileToDataUrl(blob)
          .then((dataUrl) => {
            addImage({ id: generateImageId(), dataUrl, name, size: blob.size });
          })
          .catch((err) => {
            pushWarning(`读取图片失败${err instanceof Error ? `: ${err.message}` : ''}`);
          });
        break;
      }
    },
    [isStreamSending, addImage, pushWarning],
  );

  // ── 预设点击:把 prompt 填入输入框并聚焦 ─────────────────
  const handlePresetSelect = useCallback((prompt: string) => {
    setInput(prompt);
    // 等下一帧渲染后聚焦 + 光标移到末尾
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = prompt.length;
      ta.selectionEnd = prompt.length;
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

  const hasAttachments = refChips.length > 0 || pendingImages.length > 0;

  // ── 收起状态:仅显示右侧浮动展开按钮(对齐旧版 .chat-show-btn) ──
  if (collapsed) {
    return (
      <div className="chat-panel chat-panel-collapsed">
        <button
          type="button"
          className="chat-show-btn"
          onClick={() => setCollapsed(false)}
          title="展开聊天"
          aria-label="展开聊天"
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
            <HistoryRenderer onRetry={handleRetry} onFork={handleFork} />

        {/* 流式渲染(实时):按 stream 顺序交错渲染思考/文本气泡与工具卡片,
            对齐旧版 segment 时序,工具不再固定堆在尾部 */}
        {isStreamSending && streamRows.length > 0 && (
          <div className="chat-panel-streaming">{streamRows}</div>
        )}
        {/* ask_user 触发的用户输入卡片(等待回答时显示) */}
        {waitingForUser && (
          <div className="chat-panel-ask-user">
            {/* 从 toolCalls 找到 ask_user 调用 */}
            {toolCalls
              .filter((tc) => tc.name === 'ask_user' && tc.status === 'running')
              .map((tc) => (
                <AskUserCard key={tc.id} record={tc} />
              ))}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="chat-panel-error">
            <strong>错误:</strong> {error}
          </div>
        )}

        {/* 警告提示 */}
        {warnings.length > 0 && (
          <div className="chat-panel-warnings">
            <button
              type="button"
              className="chat-panel-warnings-close"
              onClick={clearWarnings}
              aria-label="清除警告"
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
            title="滚动到底部"
            aria-label="滚动到底部"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        <div className="chat-panel-input-card">
          {/* 引用芯片 + 图片预览(有附件时显示,对齐旧版 .input-refs + .input-img-preview) */}
          {hasAttachments && (
            <div className="chat-panel-input-attachments">
              <RefChips chips={refChips} onRemove={removeChip} />
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
                        aria-label={`移除 ${img.name}`}
                        title={`移除 ${img.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {pendingImages.length > 5 && (
                    <span className="image-upload-overflow" title={`还有 ${pendingImages.length - 5} 张图片`}>
                      +{pendingImages.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 主输入行:textarea 独占一行(对齐旧版 .input-row) */}
          <div className="chat-panel-input-row">
            <textarea
              ref={textareaRef}
              className="chat-panel-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isStreamSending
                  ? '正在等待回复…'
                  : '输入消息,Enter 发送,Shift+Enter 换行;输入 @path/To/file 触发引用芯片'
              }
              rows={2}
              disabled={isStreamSending}
            />
          </div>

          {/* 状态栏(对齐旧版 .input-status-bar):# / 📷 | Token | 文件变更 | 模型 | 发送/停止 */}
          <div className="chat-panel-input-status-bar">
            <div className="chat-panel-status-left">
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
              <TokenMonitor statusBar />
              <span className="chat-panel-status-divider" aria-hidden />
              <FileChangesMonitor />
              <span className="chat-panel-status-divider" aria-hidden />
              <ModelSelectorPanel placement="top" />
            </div>
            <div className="chat-panel-status-actions">
              {isStreamSending ? (
                <button
                  type="button"
                  className="chat-panel-abort-btn"
                  onClick={abort}
                  title="停止生成"
                  aria-label="停止生成"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="chat-panel-send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() && refChips.length === 0 && pendingImages.length === 0}
                  title="发送消息"
                  aria-label="发送消息"
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="15"
                    height="15"
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

// ============================================================================
// 纯函数:从 textarea 当前光标位置的 word 提取 @path chip
// ============================================================================

interface ExtractResult {
  /** 光标之前的文本(已移除 @path word 与尾随空白) */
  before: string;
  /** 提取出的 chip */
  chip: RefChip;
  /** 光标之后的文本(原样保留) */
  after: string;
}

/**
 * 尝试从 input 在 caretEnd 位置之前的一个 word 提取 @path 引用芯片。
 *
 * 触发条件(由 keydown 空格事件调用):
 *  - 当前 word 以 @ 开头
 *  - 移除 @ 后形如 `path[:start-end]`
 *  - path 包含路径分隔符 / \ 或包含 . (避免误识别 @用户名 等纯标识)
 *
 * @returns 提取成功返回 ExtractResult;不匹配返回 null
 */
function tryExtractAtPathChip(input: string, caretEnd: number): ExtractResult | null {
  if (caretEnd <= 0) return null;
  // 向前找到 word 边界(空白字符)
  let start = caretEnd;
  while (start > 0 && !/\s/.test(input[start - 1])) start--;
  const word = input.slice(start, caretEnd);
  if (!word.startsWith('@')) return null;

  const rest = word.slice(1);
  const match = rest.match(/^([^\s:]+)(?::(\d+)-(\d+))?$/);
  if (!match) return null;

  const filePath = match[1];
  // 必须包含 / \ 或 . ,否则视为普通 @mention(如 @用户名),不提取为 chip
  if (!filePath.includes('/') && !filePath.includes('\\') && !filePath.includes('.')) {
    return null;
  }

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const startLine = match[2] ? Number(match[2]) : undefined;
  const endLine = match[3] ? Number(match[3]) : undefined;

  const chip: RefChip = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'file',
    text: fileName,
    filePath,
    startLine,
    endLine,
  };

  // 移除 word + 前面的尾随空白
  const before = input.slice(0, start).replace(/\s+$/, '');
  const after = input.slice(caretEnd);
  return { before, chip, after };
}
