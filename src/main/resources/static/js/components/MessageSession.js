import { EventRouter } from './EventRouter.js';
import { RenderPipeline } from './RenderPipeline.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { escapeHtml } from '../utils.js';
import { getFileIconInfo } from '../utils/file-icons.js';
import { EventBus } from '../utils/event-bus.js';
import { RunningToolRegistry } from '../state/running-tool-registry.js';
import { deepMergeTodoList, parseTodoArgs } from './tool-renderers/shared.js';
import { classifyError, formatSseError } from '../utils/error-codes.js';

/** 安全 i18n 辅助函数 */
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

export class MessageSession {
  constructor({ chatUI, renderPipeline, chatService, smartScroll, todoTreeCacheHolder }) {
    this._chatUI = chatUI;
    this._renderPipeline = renderPipeline;
    this._chatService = chatService;
    this._smartScroll = smartScroll;

    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._hasReceivedData = false;
    // 运行中工具调用统一登记到全局 RunningToolRegistry（单例），
    // 供 stopGeneration 等消费方一次性收集全部运行中工具
    this._todoTreeCacheHolder = todoTreeCacheHolder || { value: null };
    this._streamCompleted = false;

    this._contentDiv = null;
    this._btnContainer = null;
    this._pendingInteraction = false;

    this._destroyed = false;

    this._eventRouter = this._createEventRouter();
  }

  _createEventRouter() {
    const s = this;
    return new EventRouter({
      waiting_user: (parsed, contentDiv) => {
        s._pendingInteraction = true;
        s._pushTextSegment();
        const segment = {
          type: 'tool', name: 'ask_user',
          args: JSON.stringify({
            question: parsed.question,
            options: parsed.options || [],
            allow_custom_input: parsed.allow_custom_input !== false
          }),
          result: null, error: null
        };
        s._segments.push(segment);
        s._renderPipeline.setContainer(contentDiv);
        s._renderPipeline.flush(s._segments, s._currentText);
      },

      message_id: (parsed) => {
        if (s._onMessageId) s._onMessageId(parsed.id);
      },

      token_update: (parsed) => {
        // 流式实时 Token 统计推送（后端 token_update SSE 事件），
        // 交给 TokenMonitor 直接渲染（✓ 真实值 / ~ 估算值），不依赖轮询
        EventBus.emit('token:update', parsed);
      },

      thinking: () => {
        s._pushTextSegment();
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._reasoningSegment = null;
        }
        s._renderPipeline.flush(s._segments, s._currentText);
      },

      clear_content: (contentDiv) => {
        s._currentText = '';
        s._segments = [];
        s._reasoningSegment = null;
        // 缓存由 ChatPanel 管控生命周期，此处不清空
        contentDiv.innerHTML = '';
      },

      retry: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<div class="msg-note">🔄 ${escapeHtml(parsed.message)}</div>`;
        s._currentText = '';
        s._segments = [];
        // 缓存由 ChatPanel 管控生命周期，此处不清空
      },

      sse_error: (parsed) => {
        // 按后端下发的 code 渲染 i18n 文案；无 code（旧后端）时 fallback 原文。
        // 统一渲染为 .msg-error 红块（title + detail），不再走普通文本流。
        const { message, detail } = formatSseError(parsed);
        s.pushError({ message, detail });
      },

      raw_error: (parsed) => {
        s.pushError({ message: parsed.content });
      },

      done: (parsed) => {
        // 会话结束事件：仅处理达到 MAX_TURNS 上限（50 轮）的截断提示。
        // 保留已生成内容，仅追加警示块，不清空流式文本。
        if (parsed.reason !== 'max_turns') return;
        s._pushTextSegment();
        s._segments.push({
          type: 'warn',
          content: _t('chatui.maxTurnsReached'),
          detail: _t('chatui.maxTurnsReachedDetail')
        });
        s._renderPipeline.setContainer(s._contentDiv);
        s._renderPipeline.flush(s._segments, s._currentText);
        s._smartScroll?.();
      },

      reasoning: (parsed, contentDiv) => {
        if (!s._hasReceivedData) {
          s._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        if (!s._reasoningSegment) {
          s._reasoningSegment = { type: 'thinking', content: '', done: false };
          s._segments.push(s._reasoningSegment);
        }
        s._reasoningSegment.content += parsed.reasoning;
        s._renderPipeline.scheduleRender(s._segments, s._currentText);
        s._smartScroll?.();
      },

      reasoning_done: () => {
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._renderPipeline.flush(s._segments, s._currentText);
          s._reasoningSegment = null;
        }
      },

      web_search_start: (parsed, contentDiv) => {
        s.handleWebSearchStart(parsed, contentDiv);
      },

      web_search_done: (parsed) => {
        s.handleWebSearchDone(parsed);
      },

      content: (parsed, contentDiv) => {
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._renderPipeline.flush(s._segments, s._currentText);
          s._reasoningSegment = null;
        }
        s._currentText += parsed.content;
        if (!s._hasReceivedData) {
          s._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        s._renderPipeline.markTextOnly();
        s._renderPipeline.scheduleRender(s._segments, s._currentText);
        s._smartScroll?.();
      },

      tool_start: (parsed, contentDiv) => {
        if (parsed.id) {
          if (RunningToolRegistry.has(parsed.id)) {
            // 第二次 tool_start（来自 executeToolCalls）带有完整的 args，
            // 覆盖流式阶段创建的 segment 中可能不完整的 args，并触发重渲染
            const existing = s._segments.find(seg => seg.type === 'tool' && seg.id === parsed.id);
            if (existing && parsed.args) {
              if (existing.name === 'todo_write') {
                // todo_write: 重新合并，因为第一次 tool_start 的 args 可能不完整（流式分段）
                const { mode, todos } = parseTodoArgs(parsed.args);
                const finalTodos = s._mergeTodos(todos, mode);
                existing.args = JSON.stringify({ todos: finalTodos });
                // 同步更新 defaultExpanded，因为第一次 tool_start 的 mode 可能不完整
                existing.defaultExpanded = mode === 'replace';
              } else {
                existing.args = parsed.args;
              }
              s._renderPipeline.flush(s._segments, s._currentText);
            }
            return;
          }
          RunningToolRegistry.add(parsed.id);
        }
        if (!s._hasReceivedData) {
          s._hasReceivedData = true;
          contentDiv.querySelector('.typing-indicator')?.remove();
        }
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._reasoningSegment = null;
          s._renderPipeline.flush(s._segments, s._currentText);
        }

        if (parsed.name === 'ask_user') {
        } else if (parsed.name === 'todo_write') {
          s._pushTextSegment();
          const { mode, todos } = parseTodoArgs(parsed.args);
          const finalTodos = s._mergeTodos(todos, mode);
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null,
            defaultExpanded: mode === 'replace'
          };
          // 每张 todo 卡片都是独立快照，始终 push 新段
          s._segments.push(todoSegment);
          s._renderPipeline.flush(s._segments, s._currentText);
        } else {
          s._pushTextSegment();
          s._segments.push({
            type: 'tool', id: parsed.id || null, name: parsed.name,
            args: parsed.args, result: null, error: null
          });
          s._renderPipeline.flush(s._segments, s._currentText);
        }
      },

      tool_result: (parsed) => {
        const resultId = parsed.tool_call_id || parsed.id;
        if (resultId) {
          RunningToolRegistry.delete(resultId);
        }
        let existingTool;
        if (parsed.tool_call_id) {
          existingTool = s._segments.find(
            seg => seg.type === 'tool' && seg.id === parsed.tool_call_id && !seg.result
          );
        }
        if (!existingTool) {
          existingTool = s._segments.find(
            seg => seg.type === 'tool' && seg.name === parsed.name && !seg.result
          );
        }
        if (existingTool) {
          existingTool.result = parsed.success ? 'success' : 'error';
          existingTool.error = parsed.error || null;
          existingTool.resultContent = parsed.result || null;
          // todo_write 的 args 已在 tool_start 中由 _mergeTodos 合并为完整树，不要覆盖
          if (parsed.args && existingTool.name !== 'todo_write') {
            existingTool.args = parsed.args;
          }
          existingTool.confirmationData = null;
          existingTool.progressLines = null;
          s._togglePendingConfirmClass();
          s._renderPipeline.flush(s._segments, s._currentText);
          // flush 已立即渲染，无需重复 scheduleRender

          // 文件操作工具执行后刷新文件树 + 预览面板（主 SSE 流路径）
          if (parsed.success) {
            _emitFileEventsFromToolResult(parsed);
          }
        }
        // segments 有更新，刷新文件产物指示器
        s._updateFileIndicator();
      },

      tool_progress: (parsed) => {
        const existingTool = s._segments.find(
          seg => seg.type === 'tool' && seg.id === parsed.id && !seg.result
        );
        if (existingTool) {
          existingTool.progressLines = existingTool.progressLines || [];
          existingTool.progressLines.push(parsed.line);
          s._renderPipeline.flush(s._segments, s._currentText);
          s._renderPipeline.scheduleRender(s._segments, s._currentText);
        }
      },

      tool_confirmation: (parsed) => {
        s._pendingInteraction = true;

        if (parsed.toolType === 'delete_file') {
          // delete_file 确认：查找未完成的 delete_file 工具段
          const deleteSegment = s._segments.find(
            seg => seg.type === 'tool' && seg.name === 'delete_file' && !seg.result && !seg.confirmationData
          );
          if (deleteSegment) {
            deleteSegment.confirmationData = {
              confirmId: parsed.confirmId,
              files: parsed.files || [],
              directories: parsed.directories || [],
              totalCount: parsed.totalCount || 0,
              truncated: parsed.truncated || false
            };
            s._renderPipeline.flush(s._segments, s._currentText);
            s._renderPipeline.scheduleRender(s._segments, s._currentText);
            s._togglePendingConfirmClass();
          }
        } else {
          // bash 确认
          const bashSegment = s._segments.find(
            seg => seg.type === 'tool' && seg.name === 'bash' && !seg.result && !seg.confirmationData
          );
          if (bashSegment) {
            bashSegment.confirmationData = {
              confirmId: parsed.confirmId,
              command: parsed.command,
              riskLevel: parsed.riskLevel,
              riskReason: parsed.riskReason
            };
            bashSegment._savedCommand = parsed.command;
            s._renderPipeline.flush(s._segments, s._currentText);
            s._renderPipeline.scheduleRender(s._segments, s._currentText);
            s._togglePendingConfirmClass();
          }
        }
      }
    });
  }

  async start({ sessionId, content, signal, systemPrompt, editMessageId, useExecuteRequest, onMessageId, onRetry, selectedRules, mode, images }) {
    this._onMessageId = onMessageId || null;
    this._sessionIdForLog = sessionId;

    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._hasReceivedData = false;

    const result = this._chatUI.appendAssistantMessage();
    this._contentDiv = result.contentDiv;
    this._btnContainer = result.btnContainer;
    this._copyBtn = result.copyBtn;
    this._retryBtn = result.retryBtn;
    this._fileIndicator = result.fileIndicator;
    this._renderPipeline.setContainer(this._contentDiv);

    this._setupCopyButton();

    if (onRetry) {
      this._retryBtn.onclick = onRetry;
    }

    const chunkHandler = (parsed) => {
      if (this._destroyed) return;
      // SSE error 事件打日志
      if (parsed.type === 'sse_error' || parsed.type === 'raw_error') {
        console.error(`[SSE] 收到错误事件 type=${parsed.type} content="${parsed.message || parsed.content}" session=${this._sessionIdForLog || ''}`);
      }
      this._eventRouter.handle(parsed, this._contentDiv, this._btnContainer);
    };

    try {
      if (useExecuteRequest) {
        await this._chatService.executeRequest(
          sessionId, content, chunkHandler, signal, null, null
        );
      } else {
        await this._chatService.sendMessage(
          sessionId, content, chunkHandler, signal, systemPrompt, editMessageId || null, selectedRules, mode, images
        );
      }

      if (this._currentText.trim()) {
        this._segments.push({ type: 'text', content: this._currentText });
      }

      // safety net: 流式过程中任何原因导致 thinking segment 未标记 done
      // 在最终渲染前确保收起
      for (const seg of this._segments) {
        if (seg.type === 'thinking' && !seg.done) {
          seg.done = true;
        }
      }

      if (this._segments.length === 0 && !this._currentText.trim()) {
        this._contentDiv.innerHTML = '<div class="msg-note">' + _t('chatui.noValidResponse') + '</div>';
      } else {
        this._renderPipeline.setContainer(this._contentDiv);
        await this._renderPipeline.renderFinal(this._segments, '');
      }

      if (!this._pendingInteraction) {
        this._btnContainer.style.display = 'flex';
      }
      // btnContainer 从 display:none → flex 导致 footer 增高约 28px，
      // renderFinal 中 smartScroll 时按钮尚未显示，需再次跟随
      this._smartScroll?.();

      this._streamCompleted = true;
      this._updateFileIndicator();

    } catch (error) {
      if (error.name === 'AbortError' || error.constructor.name === 'AbortError') {
        console.warn(`[MessageSession] 流被中止(AbortError) session=${this._sessionIdForLog || ''}`);
        if (this._currentText.trim()) {
          this._segments.push({ type: 'text', content: this._currentText });
        }
        for (const seg of this._segments) {
          if (seg.type === 'thinking' && !seg.done) {
            seg.done = true;
          }
          if (seg.type === 'web-search' && !seg.done) {
            // 搜索已发起（started 已收到），停止时收尾为完成态，避免悬空「正在联网搜索…」
            seg.done = true;
          }
        }
        this._renderPipeline.setContainer(this._contentDiv);
        await this._renderPipeline.renderFinal(this._segments, '');
        this._contentDiv.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ ' + _t('chatui.stopped') + '</div>';
        this._streamCompleted = true;
        this._updateFileIndicator();
      } else {
        const { message, detail } = this._classifyError(error);
        console.error(`[MessageSession] 流异常终止 session=${this._sessionIdForLog || ''} type=Error msg="${error.message}"`);
        // 统一 .msg-error 红块（与 SSE error / raw_error 同款）
        this._contentDiv.innerHTML = RenderPipeline.renderErrorBlock({ content: message, detail });
        this._streamCompleted = true;
        this._updateFileIndicator();
      }

      if (this._btnContainer && !this._pendingInteraction) this._btnContainer.style.display = 'flex';
      this._smartScroll?.();
    }

    if (this._contentDiv) {
      // 从所有 text segment 重建完整内容，避免只保存 _currentText 遗漏之前已 flushing 的文本
      const textSegments = this._segments
        .filter(s => s.type === 'text')
        .map(s => s.content);
      if (this._currentText.trim()) textSegments.push(this._currentText);
      // error 段以 ⚠️ 前缀纳入复制内容，保留"这是错误"的语义
      for (const seg of this._segments) {
        if (seg.type === 'error') {
          textSegments.push('⚠️ ' + seg.content + (seg.detail ? '\n' + seg.detail : ''));
        }
      }
      this._contentDiv.dataset.markdown = textSegments.join('');
    }
  }

  // ⚠️ 只读！修改 segments 请走 MessageSession 的语义方法（pushTextSegment / pushSegment / updateTodoAtIndex / healStuckCards / clearAll）
  getSegments() {
    return this._segments;
  }

  getCurrentText() {
    return this._currentText;
  }

  getContentDiv() {
    return this._contentDiv;
  }

  getBtnContainer() {
    return this._btnContainer;
  }

  /**
   * 显示操作按钮（复制/重试/回撤）
   * 用于 pendingInteraction 场景下在外部控制按钮显示时机
   */
  showActionButtons() {
    if (this._btnContainer) {
      this._btnContainer.style.display = 'flex';
    }
  }

  setCurrentText(text) {
    this._currentText = text;
  }

  updateTodoAtIndex(index, segment) {
    this._segments[index] = segment;
  }

  /**
   * 自愈：将所有未完成的 tool segment 标记为 cancelled 或 interrupted。
   * @returns {Array<{name: string, fromStatus: string|null, toStatus: string}>} 被修改的 segment 列表
   */
  healStuckCards() {
    const modified = [];
    const toolSegs = this._segments.filter(s => s.type === 'tool');
    const statusCounts = {};
    for (const seg of toolSegs) {
      const status = seg.result || 'running';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    for (const seg of toolSegs) {
      if (seg.result) continue;
      // 待确认的卡片不属于卡死，跳过（用户未响应或自动确认配置尚未处理）
      if (seg.confirmationData) continue;
      const fromStatus = seg.result;
      if (seg.progressLines && seg.progressLines.length > 0) {
        seg.result = 'interrupted';
        modified.push({ name: seg.name, fromStatus, toStatus: 'interrupted' });
      } else {
        seg.result = 'cancelled';
        modified.push({ name: seg.name, fromStatus, toStatus: 'cancelled' });
      }
    }

    if (modified.length > 0) {
    }
    return modified;
  }

  pushTextSegment() {
    if (this._currentText.trim()) {
      this._segments.push({ type: 'text', content: this._currentText });
      this._currentText = '';
    }
  }

  pushSegment(segment) {
    this._segments.push(segment);
  }

  clearAll() {
    this._currentText = '';
    this._segments = [];
    this._reasoningSegment = null;
    // 缓存由 ChatPanel 管控生命周期，此处不清空
  }

  clearReasoning() {
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
    }
  }

  setCurrentText(text) {
    this._currentText = text;
  }

  handleReasoning(parsed, contentDiv) {
    if (!this._hasReceivedData) {
      this._hasReceivedData = true;
      contentDiv.querySelector('.typing-indicator')?.remove();
    }
    if (!this._reasoningSegment) {
      this._reasoningSegment = { type: 'thinking', content: '', done: false };
      this._segments.push(this._reasoningSegment);
    }
    this._reasoningSegment.content += parsed.reasoning;
  }

  handleReasoningDone() {
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
    }
  }

  handleContent(parsed, contentDiv) {
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
    }
    this._currentText += parsed.content;
    if (!this._hasReceivedData) {
      this._hasReceivedData = true;
      contentDiv.querySelector('.typing-indicator')?.remove();
    }
  }

  handleToolStart(parsed, contentDiv) {
    if (!this._hasReceivedData) {
      this._hasReceivedData = true;
      contentDiv.querySelector('.typing-indicator')?.remove();
    }
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
    }
  }

  handleToolResult(parsed) {
    const resultId = parsed.tool_call_id || parsed.id;
    if (resultId) {
      RunningToolRegistry.delete(resultId);
    }
    let existingTool;
    if (parsed.tool_call_id) {
      existingTool = this._segments.find(s => s.type === 'tool' && s.id === parsed.tool_call_id && !s.result);
    }
    if (!existingTool) {
      existingTool = this._segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
    }
    // 兜底：name 字段因 JSON 损坏而缺失，尝试通过 id 匹配
    if (!existingTool && parsed.id) {
      existingTool = this._segments.find(s => s.type === 'tool' && s.id === parsed.id && !s.result);
    }
    if (existingTool) {
      existingTool.result = parsed.success ? 'success' : 'error';
      existingTool.error = parsed.error || null;
      existingTool.resultContent = parsed.result || null;
      // todo_write 的 args 已在 tool_start 中由 _mergeTodos 合并为完整树，不要覆盖
      if (parsed.args && existingTool.name !== 'todo_write') {
        existingTool.args = parsed.args;
      }
      existingTool.confirmationData = null;
      existingTool.progressLines = null;
      this._togglePendingConfirmClass();
    }

    // 文件操作工具执行后刷新文件树 + 预览面板（确认 SSE 流路径）
    if (parsed.success) {
      _emitFileEventsFromToolResult(parsed);
    }

    // segments 有更新，刷新文件产物指示器
    this._updateFileIndicator();
  }

  _updateFileIndicator() {
    if (!this._fileIndicator) return;
    const files = _extractFilesFromSegments(this._segments);
    if (files.length === 0) {
      this._fileIndicator.style.display = 'none';
      return;
    }
    // 流未完成时不显示指示器（避免用户看到中间态）
    const show = this._streamCompleted || this._pendingInteraction;
    this._fileIndicator.style.display = show ? '' : 'none';
    const textEl = this._fileIndicator.querySelector('.file-indicator-text');
    if (textEl) textEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="padding-top: 1px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${files.length}`;
    this._fileIndicator.title = _t('chatui.viewFileProducts');

    // 重建 popover 内容（最多显示 10 条）
    const popover = this._fileIndicator.querySelector('.message-file-popover');
    if (!popover) return;
    const MAX_VISIBLE = 10;
    const visibleFiles = files.slice(0, MAX_VISIBLE);
    const overflow = files.length - MAX_VISIBLE;
    let html = '';
    for (const f of visibleFiles) {
      const fileName = f.path.split(/[/\\]/).pop();
      const { iconFile } = getFileIconInfo(fileName);
      let statusClass = 'status-added';
      if (f.action === 'D') statusClass = 'status-deleted';
      else if (f.action === 'M') statusClass = 'status-modified';

      html += `<div class="popover-file-item" data-path="${escapeHtml(f.path)}">
        <img class="popover-file-icon" src="icons/${iconFile}" draggable="false" alt="">
        <span class="file-name">${escapeHtml(fileName)}</span>
        <span class="file-status ${statusClass}">${f.action}</span>
      </div>`;
    }
    if (overflow > 0) {
      html += `<div class="popover-file-overflow">${window.i18n.t('fileChanges.overflow', { overflow })}</div>`;
    }
    popover.innerHTML = html;

    // hover 事件（只绑一次）
    if (!this._fileIndicator._popoverBound) {
      this._fileIndicator._popoverBound = true;
      let popoverTimer = null;
      const showPopover = () => {
        if (popoverTimer) clearTimeout(popoverTimer);
        popoverTimer = setTimeout(() => popover.classList.add('show'), 200);
      };
      const hidePopover = () => {
        if (popoverTimer) clearTimeout(popoverTimer);
        popoverTimer = setTimeout(() => popover.classList.remove('show'), 200);
      };
      this._fileIndicator.addEventListener('mouseenter', showPopover);
      this._fileIndicator.addEventListener('mouseleave', hidePopover);
      popover.addEventListener('mouseenter', showPopover);
      popover.addEventListener('mouseleave', hidePopover);
      popover.addEventListener('click', (e) => {
        const item = e.target.closest('.popover-file-item');
        if (item) {
          popover.classList.remove('show');
          // 统一分流：桌面端 diff 标签页 / Web 端弹窗降级
          window.showFileDiff(item.dataset.path);
        }
      });
    }
  }

  handleToolProgress(parsed) {
    const existingTool = this._segments.find(s =>
      s.type === 'tool' && s.id === parsed.id && !s.result
    );
    if (existingTool) {
      existingTool.progressLines = existingTool.progressLines || [];
      existingTool.progressLines.push(parsed.line);
    }
  }

  handleToolConfirmation(parsed) {
    if (parsed.toolType === 'delete_file') {
      const deleteSegment = this._segments.find(s =>
        s.type === 'tool' && s.name === 'delete_file' && !s.result && !s.confirmationData
      );
      if (deleteSegment) {
        deleteSegment.confirmationData = {
          confirmId: parsed.confirmId,
          files: parsed.files || [],
          directories: parsed.directories || [],
          totalCount: parsed.totalCount || 0,
          truncated: parsed.truncated || false
        };
      }
    } else {
      // bash 确认
      const bashSegment = this._segments.find(s =>
        s.type === 'tool' && s.name === 'bash' && !s.result && !s.confirmationData
      );
      if (bashSegment) {
        bashSegment.confirmationData = {
          confirmId: parsed.confirmId,
          command: parsed.command,
          riskLevel: parsed.riskLevel,
          riskReason: parsed.riskReason
        };
        bashSegment._savedCommand = parsed.command;
      }
    }
    this._togglePendingConfirmClass();
  }

  _togglePendingConfirmClass() {
    // 检查是否有工具正在等待用户确认，更新 msgDiv 的 pending-confirm 类
    const hasPendingConfirm = this._segments.some(s =>
      s.type === 'tool' && s.confirmationData && !s.result
    );
    const msgDiv = this._contentDiv?.closest('.message.assistant');
    if (!msgDiv) return;
    msgDiv.classList.toggle('pending-confirm', hasPendingConfirm);
  }

  _pushTextSegment() {
    if (this._currentText.trim()) {
      this._segments.push({ type: 'text', content: this._currentText });
      this._currentText = '';
    }
  }

  /**
   * 服务端联网搜索开始（Responses API web_search 内置工具）。
   * 展示瞬态标记「正在联网搜索…」，与 tool_start 一致先收起 reasoning 段。
   * 流式 in_progress/searching 事件不含 action，此处仅创建段，详情由 done 事件追加。
   */
  handleWebSearchStart(parsed, contentDiv) {
    if (!this._hasReceivedData) {
      this._hasReceivedData = true;
      contentDiv?.querySelector('.typing-indicator')?.remove();
    }
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
      this._renderPipeline.flush(this._segments, this._currentText);
    }
    // 复用未完成的 web-search 段（防止重复事件），否则 push 一个新的瞬态标记
    const existing = this._segments.find(seg => seg.type === 'web-search' && !seg.done);
    if (!existing) {
      this._pushTextSegment();
      this._segments.push({ type: 'web-search', done: false, actions: [] });
      this._renderPipeline.flush(this._segments, this._currentText);
    }
  }

  /**
   * 服务端联网搜索结束（completed / failed）。
   * 将瞬态标记更新为完成态；若事件携带 action 明细（output_item.done），追加到段 actions，
   * 驱动渲染层生成聚合摘要（已完成段也可追加——completed 事件先到标 done，action 后到）。
   */
  handleWebSearchDone(parsed) {
    const action = this._extractWebSearchAction(parsed);
    const seg = this._segments.find(seg => seg.type === 'web-search' && !seg.done);
    if (seg) {
      if (action) seg.actions.push(action);
      seg.done = true;
      this._renderPipeline.flush(this._segments, this._currentText);
    } else if (action) {
      const doneSeg = this._segments.find(s => s.type === 'web-search' && s.done);
      if (doneSeg) {
        doneSeg.actions.push(action);
        this._renderPipeline.flush(this._segments, this._currentText);
      }
    }
  }

  /**
   * 从 SSE payload 提取联网搜索动作明细（buildWebSearchPayload 平铺输出的 action 字段）。
   * payload 为空（{}）或字段缺失时返回 null，调用方静默跳过。
   */
  _extractWebSearchAction(parsed) {
    if (!parsed) return null;
    const type = parsed.type;
    if (type !== 'search' && type !== 'open_page' && type !== 'find_in_page') return null;
    const action = { type };
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      action.queries = parsed.queries.filter(q => q && q.length > 0);
    }
    if (parsed.url) action.url = parsed.url;
    if (parsed.pattern) action.pattern = parsed.pattern;
    if (parsed.status) action.status = parsed.status;
    return action;
  }

  _setupCopyButton() {
    this._copyBtn.addEventListener('click', () => {
      const textToCopy = this._contentDiv.dataset.markdown || this._contentDiv.innerText;
      navigator.clipboard.writeText(textToCopy).then(() => {
        this._copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        this._copyBtn.classList.add('copied');
        setTimeout(() => {
          this._copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          this._copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
  }

  _mergeTodos(incomingTodos, mode) {
    const holder = this._todoTreeCacheHolder;
    if (mode === 'replace') {
      holder.value = deepMergeTodoList([], incomingTodos);
    } else {
      holder.value = deepMergeTodoList(holder.value || [], incomingTodos);
    }
    return holder.value;
  }

  /** 委托给 utils/error-codes.js 的统一分类（fetch 层异常兜底） */
  _classifyError(error) {
    const { message, detail } = classifyError(error);
    return { message, detail };
  }

  /**
   * 统一错误入口：把错误渲染为 .msg-error 红块（title + detail）。
   * 同时清空流式残留文本 / 收起 thinking 段，避免与错误块叠加。
   * @param {{message: string, detail?: string|null}} payload
   */
  pushError({ message, detail }) {
    if (this._reasoningSegment) {
      this._reasoningSegment.done = true;
      this._reasoningSegment = null;
    }
    this._currentText = '';
    this._segments.push({ type: 'error', content: message, detail: detail || null });
    this._renderPipeline.setContainer(this._contentDiv);
    this._renderPipeline.flush(this._segments, this._currentText);
  }

  destroy() {
    this._destroyed = true;
    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._contentDiv = null;
    this._btnContainer = null;
    this._fileIndicator = null;
  }
}

/**
 * 从 segments 中提取本轮产出的文件列表
 * @param {Array} segments
 * @returns {Array<{path:string, action:string}>}
 */
function _extractFilesFromSegments(segments) {
  const files = [];
  for (const seg of segments) {
    if (seg.type !== 'tool') continue;
    if (seg.result !== 'success' && seg.result !== 'error') continue;
    let args = seg.args;
    if (!args) continue;
    // 历史消息中 args 可能是 JSON 字符串（后端 FunctionCall.arguments 为 String 类型）
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { continue; }
    }

    let paths = [];
    if (seg.name === 'delete_file') {
      paths = Array.isArray(args.paths) ? args.paths : [];
    } else if (['write_file', 'edit_file', 'write_office_file'].includes(seg.name)) {
      paths = args.path ? [args.path] :
              args.filePath ? [args.filePath] :
              args.file_path ? [args.file_path] :
              [];
    }

    for (const p of paths) {
      let action = 'M';
      if (seg.name === 'delete_file') action = 'D';
      else if (seg.name === 'write_file' || seg.name === 'write_office_file') action = 'A';
      files.push({ path: p, action });
    }
  }
  // 去重
  const seen = new Map();
  for (const f of files) {
    seen.set(f.path, f);
  }
  return Array.from(seen.values());
}

/**
 * 从 tool_result 事件中提取文件操作信息，触发文件树刷新和预览重新加载
 * 模块级函数，同时被主 SSE 流和确认 SSE 流调用
 */
function _emitFileEventsFromToolResult(parsed) {
  // 文件操作工具执行后刷新文件树
  if (parsed.name === 'bash' || parsed.name === 'write_office_file' || parsed.name === 'write_file' || parsed.name === 'edit_file' || parsed.name === 'delete_file') {
    EventBus.emit('file:changes-updated');
  }
  // write_file/edit_file：通知预览面板重新加载
  if (parsed.args) {
    try {
      const args = typeof parsed.args === 'string' ? JSON.parse(parsed.args) : parsed.args;
      if (parsed.name === 'write_file' || parsed.name === 'edit_file') {
        if (args.path) EventBus.emit('file:preview-reload', args.path);
      } else if (parsed.name === 'delete_file' && Array.isArray(args.paths)) {
        for (const p of args.paths) {
          EventBus.emit('file:preview-reload', p);
        }
      }
    } catch (_e) { /* ignore */ }
  }
}
