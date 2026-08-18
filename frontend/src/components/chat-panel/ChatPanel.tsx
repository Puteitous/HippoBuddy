/**
 * ChatPanel - 聊天面板
 *
 * 阶段 3.4 升级:
 *  - 输入区上方:RefChips(引用芯片)+ ImageUpload(图片预览)
 *  - 输入区下方:ModePresets(模式预设)+ TokenMonitor(实时 Token)
 *  - @path 触发:textarea 内键入 @path/to/file 或 @path:1-10 后按空格自动提取为 chip
 *  - 提交:combineChipsToMessage 合并 chips + typed 文本,images 一并通过 send 传给后端
 *
 * 与旧版 ChatPanel.js 的差异:
 *  - 不再依赖全局 DOM 委托,改用 React 受控 props 与 state
 *  - ModePresets 简化:去掉标语动画(title-first/title-last),只保留模式按钮 + 预设标签
 *  - ImageUpload 简化:缩略图点击在新标签打开,不引入 image-lightbox
 *  - RefChips 简化:不依赖 file-icons.js,3.4 用 emoji 占位(3.5 FileTree 接入后再统一)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { useChatStream } from '@/hooks/useChatStream';
import type { Message, PendingImage, RefChip } from '@/types';
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
import { ModePresets } from './ModePresets';
import { TokenMonitor } from './TokenMonitor';
import { RefChips } from './RefChips';
import { ImageUpload } from './ImageUpload';
import { ChatNav } from '../ChatNav';
import { ContextSelector } from '../ContextSelector';
import type { RuleItem as ContextRuleItem, SkillItem as ContextSkillItem } from '../ContextSelector';
import '../tool-renderers/tool-renderers.css';
import './ChatPanel.css';

export function ChatPanel() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const messages = useChatStore((s) => s.messages);
  const isReasoning = useChatStore((s) => s.isReasoning);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const error = useChatStore((s) => s.error);
  const warnings = useChatStore((s) => s.warnings);
  const clearWarnings = useChatStore((s) => s.clearWarnings);
  // 工具调用(实时流中显示,回合结束后由 messages 中的 tool role 消息接管)
  const toolCalls = useChatStore((s) => s.toolCalls);
  // ask_user 触发的用户输入卡片(等待回答时显示)
  const waitingForUser = useChatStore((s) => s.waitingForUser);

  const { send, abort, isSending: isStreamSending } = useChatStream();
  const [input, setInput] = useState('');
  /** 引用芯片列表(由 @path 触发或外部 context-selector 添加) */
  const [refChips, setRefChips] = useState<RefChip[]>([]);
  /** 待发送图片(转为 dataUrl 后随 ChatRequest.images 提交) */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
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
  }, [messages.length, streamingContent, streamingReasoning, isReasoning, scrollToBottom]);

  // 切换会话时,重置 stickToBottom,并滚到底
  useEffect(() => {
    stickToBottomRef.current = true;
    // 等下一帧渲染完历史消息再滚
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [currentSessionId, scrollToBottom]);

  // 监听滚动事件,判断是否贴底
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

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

  // ── 流式气泡:构造临时 Message 对象 ─────────────────────────
  const showStreamingBubble =
    isStreamSending &&
    !!(streamingContent || streamingReasoning || isReasoning);

  const streamingMessage: Message | null = showStreamingBubble
    ? {
        id: streamingMessageId ?? '__streaming__',
        role: 'assistant',
        content: streamingContent || '',
        reasoning_content: streamingReasoning || undefined,
      }
    : null;

  const hasAttachments = refChips.length > 0 || pendingImages.length > 0;

  // ── 空会话提示 ────────────────────────────────────────────
  if (!currentSessionId) {
    return (
      <div className="chat-panel chat-panel-empty">
        <p>请在左侧选择一个会话,或新建会话(待 3.7 实现)。</p>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      {/* 消息区(滚动容器) */}
      <div
        ref={messagesContainerRef}
        className="chat-panel-messages"
        onScroll={handleScroll}
      >
        <HistoryRenderer />

        {/* 流式气泡(实时) */}
        {streamingMessage && (
          <div className="chat-panel-streaming">
            <MessageBubble message={streamingMessage} isStreaming />
          </div>
        )}

        {/* 实时工具调用卡片(仅发送中显示;回合结束后由 messages 中的 tool role 接管) */}
        {isStreamSending && toolCalls.length > 0 && (
          <div className="chat-panel-toolcalls">
            {toolCalls.map((tc) => (
              <ToolCardDispatcher key={tc.id} record={tc} />
            ))}
          </div>
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

        {/* 会话内用户消息导航(右侧浮动窄条) */}
        <ChatNav containerRef={messagesContainerRef} />
      </div>

      {/* 输入区 */}
      <div className="chat-panel-input-area">
        {/* 引用芯片 + 图片预览(有附件时显示) */}
        {hasAttachments && (
          <div className="chat-panel-input-attachments">
            <RefChips chips={refChips} onRemove={removeChip} />
          </div>
        )}

        {/* 主输入行:ContextSelector(#) + textarea + 图片上传按钮 + 发送按钮 */}
        <div className="chat-panel-input-row">
          <ContextSelector
            selectedRuleIds={selectedRuleIds}
            selectedSkillPaths={selectedSkillPaths}
            onRuleToggle={handleRuleToggle}
            onSkillToggle={handleSkillToggle}
          />
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
          {/* ImageUpload 始终挂载,内部按 visionSupported 控制按钮可见性 */}
          <ImageUpload
            images={pendingImages}
            onAdd={addImage}
            onRemove={removeImage}
            disabled={isStreamSending}
          />
          <div className="chat-panel-actions">
            {isStreamSending ? (
              <button
                type="button"
                className="chat-panel-abort-btn"
                onClick={abort}
              >
                中断
              </button>
            ) : (
              <button
                type="button"
                className="chat-panel-send-btn"
                onClick={handleSend}
                disabled={!input.trim() && refChips.length === 0 && pendingImages.length === 0}
              >
                发送
              </button>
            )}
          </div>
        </div>

        {/* 底部:模式预设 + Token 监控 */}
        <div className="chat-panel-input-footer">
          <ModePresets onPresetSelect={handlePresetSelect} disabled={isStreamSending} />
          <TokenMonitor />
        </div>
      </div>
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
