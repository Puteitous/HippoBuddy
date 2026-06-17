import { EventRouter } from './EventRouter.js';
import { renderMarkdown } from '../markdown-renderer.js';
import { escapeHtml } from '../utils.js';
import { EventBus } from '../utils/event-bus.js';

export class MessageSession {
  constructor({ chatUI, renderPipeline, chatService }) {
    this._chatUI = chatUI;
    this._renderPipeline = renderPipeline;
    this._chatService = chatService;

    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._hasReceivedData = false;
    this._runningToolCallIds = new Set();

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
        contentDiv.innerHTML = '';
      },

      retry: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🔄 ${escapeHtml(parsed.message)}</div>`;
        s._currentText = '';
        s._segments = [];
      },

      sse_error: (parsed) => {
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._reasoningSegment = null;
        }
        s._currentText = '⚠️ ' + parsed.message;
        s._renderPipeline.scheduleRender(s._segments, s._currentText);
      },

      raw_error: (parsed, contentDiv) => {
        contentDiv.innerHTML = `<span style="color: var(--error-color);">❌ ${escapeHtml(parsed.content)}</span>`;
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
        s._chatUI.scrollToBottom();
      },

      reasoning_done: () => {
        if (s._reasoningSegment) {
          s._reasoningSegment.done = true;
          s._renderPipeline.flush(s._segments, s._currentText);
          s._reasoningSegment = null;
        }
      },

      content: (parsed, contentDiv) => {
        if (s._reasoningSegment) {
          s._logReasoning('content_done');
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
        s._chatUI.scrollToBottom();
      },

      tool_start: (parsed, contentDiv) => {
        if (parsed.id) {
          if (s._runningToolCallIds.has(parsed.id)) {
            // 第二次 tool_start（来自 executeToolCalls）带有完整的 args，
            // 覆盖流式阶段创建的 segment 中可能不完整的 args，并触发重渲染
            const existing = s._segments.find(seg => seg.type === 'tool' && seg.id === parsed.id);
            if (existing && parsed.args) {
              existing.args = parsed.args;
              s._renderPipeline.flush(s._segments, s._currentText);
            }
            return;
          }
          s._runningToolCallIds.add(parsed.id);
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
          const existingTodoIndex = s._segments.findIndex(
            seg => seg.type === 'tool' && seg.name === 'todo_write' && !seg.result
          );
          const incomingTodos = s._chatUI.parseTodos(parsed.args);
          const finalTodos = s._mergeTodos(existingTodoIndex, incomingTodos);
          parsed.args = JSON.stringify({ todos: finalTodos });
          const todoSegment = {
            type: 'tool', id: parsed.id || null, name: 'todo_write',
            args: parsed.args, result: null, error: null
          };
          if (existingTodoIndex >= 0) {
            s._segments[existingTodoIndex] = todoSegment;
          } else {
            s._segments.push(todoSegment);
          }
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
          s._runningToolCallIds.delete(resultId);
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
          if (parsed.args) existingTool.args = parsed.args;
          existingTool.confirmationData = null;
          existingTool.progressLines = null;
          s._renderPipeline.flush(s._segments, s._currentText);
          s._renderPipeline.scheduleRender(s._segments, s._currentText);

          // 文件操作工具执行后刷新文件树 + 预览面板（主 SSE 流路径）
          if (parsed.success) {
            _emitFileEventsFromToolResult(parsed);
          }
        }
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
          }
        }
      }
    });
  }

  async start({ sessionId, content, signal, systemPrompt, editMessageId, useExecuteRequest, onMessageId, onRetry }) {
    this._onMessageId = onMessageId || null;

    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._hasReceivedData = false;

    const result = this._chatUI.appendAssistantMessage();
    this._contentDiv = result.contentDiv;
    this._btnContainer = result.btnContainer;
    this._copyBtn = result.copyBtn;
    this._retryBtn = result.retryBtn;
    this._renderPipeline.setContainer(this._contentDiv);

    this._setupCopyButton();

    if (onRetry) {
      this._retryBtn.onclick = onRetry;
    }

    const chunkHandler = (parsed) => {
      if (this._destroyed) return;
      this._eventRouter.handle(parsed, this._contentDiv, this._btnContainer);
    };

    try {
      if (useExecuteRequest) {
        await this._chatService.executeRequest(
          sessionId, content, chunkHandler, signal, null, null
        );
      } else {
        await this._chatService.sendMessage(
          sessionId, content, chunkHandler, signal, systemPrompt, editMessageId || null
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
        this._contentDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 8px;">🤖 AI 未返回有效响应，请尝试重新发送</div>';
      } else {
        this._renderPipeline.setContainer(this._contentDiv);
        await this._renderPipeline.renderFinal(this._segments, '');
      }

      if (!this._pendingInteraction) {
        this._btnContainer.style.display = 'flex';
      }
      this._chatUI.scrollToBottom();

    } catch (error) {
      if (error.name === 'AbortError' || error.constructor.name === 'AbortError') {
        if (this._currentText.trim()) {
          this._segments.push({ type: 'text', content: this._currentText });
        }
        for (const seg of this._segments) {
          if (seg.type === 'thinking' && !seg.done) {
            seg.done = true;
          }
        }
        this._renderPipeline.setContainer(this._contentDiv);
        await this._renderPipeline.renderFinal(this._segments, '');
        this._contentDiv.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ 已停止生成</div>';
      } else {
        const { message, detail } = this._classifyError(error);
        this._contentDiv.innerHTML = `
          <div style="color: var(--error-color); padding: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">❌ ${escapeHtml(message)}</div>
            ${detail ? `<div style="font-size: 12px; opacity: 0.7;">${escapeHtml(detail)}</div>` : ''}
          </div>`;
      }

      if (this._btnContainer && !this._pendingInteraction) this._btnContainer.style.display = 'flex';
      this._chatUI.scrollToBottom();
    }

    if (this._contentDiv) {
      // 从所有 text segment 重建完整内容，避免只保存 _currentText 遗漏之前已 flushing 的文本
      const textSegments = this._segments
        .filter(s => s.type === 'text')
        .map(s => s.content);
      if (this._currentText.trim()) textSegments.push(this._currentText);
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

  healStuckCards() {
    let changed = false;
    for (const seg of this._segments) {
      if (seg.type !== 'tool' || seg.result) continue;
      if (seg.confirmationData) {
        seg.result = 'cancelled';
        seg.confirmationData = null;
        changed = true;
      } else if (seg.progressLines && seg.progressLines.length > 0) {
        seg.result = 'interrupted';
        changed = true;
      } else {
        seg.result = 'cancelled';
        changed = true;
      }
    }
    return changed;
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
      this._runningToolCallIds.delete(resultId);
    }
    let existingTool;
    if (parsed.tool_call_id) {
      existingTool = this._segments.find(s => s.type === 'tool' && s.id === parsed.tool_call_id && !s.result);
    }
    if (!existingTool) {
      existingTool = this._segments.find(s => s.type === 'tool' && s.name === parsed.name && !s.result);
    }
    if (existingTool) {
      existingTool.result = parsed.success ? 'success' : 'error';
      existingTool.error = parsed.error || null;
      existingTool.resultContent = parsed.result || null;
      if (parsed.args) existingTool.args = parsed.args;
      existingTool.confirmationData = null;
      existingTool.progressLines = null;
    }

    // 文件操作工具执行后刷新文件树 + 预览面板（确认 SSE 流路径）
    if (parsed.success) {
      _emitFileEventsFromToolResult(parsed);
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
  }

  _pushTextSegment() {
    if (this._currentText.trim()) {
      this._segments.push({ type: 'text', content: this._currentText });
      this._currentText = '';
    }
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

  _mergeTodos(existingTodoIndex, incomingTodos) {
    if (existingTodoIndex >= 0) {
      const oldSegment = this._segments[existingTodoIndex];
      const oldTodos = this._chatUI.parseTodos(oldSegment.args);
      const todoMap = new Map();
      oldTodos.forEach(todo => { todoMap.set(todo.id, { ...todo }); });
      incomingTodos.forEach(newTodo => {
        if (todoMap.has(newTodo.id)) {
          const existing = todoMap.get(newTodo.id);
          if (newTodo.content) existing.content = newTodo.content;
          if (newTodo.status) existing.status = newTodo.status;
        } else {
          todoMap.set(newTodo.id, {
            id: newTodo.id,
            content: newTodo.content || '未命名任务',
            status: newTodo.status || 'pending'
          });
        }
      });
      return Array.from(todoMap.values());
    }
    return incomingTodos.map(todo => ({
      id: todo.id,
      content: todo.content || '未命名任务',
      status: todo.status || 'pending'
    }));
  }

  _classifyError(error) {
    const msg = error.message || '';
    if (error.name === 'TypeError' && (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
      return { message: '网络连接失败，请检查后端服务是否正常运行', detail: '无法与服务器建立连接，请确认服务已启动且网络通畅' };
    }
    if (msg.includes('超时') || msg.includes('timeout') || msg.includes('Timeout')) {
      return { message: '请求超时，服务响应时间过长', detail: '请稍后重试，或检查服务是否负载过高' };
    }
    if (msg.includes('HTTP error') || /status:? \d{3}/i.test(msg)) {
      const statusMatch = msg.match(/(\d{3})/);
      const status = statusMatch ? statusMatch[1] : '';
      if (status === '502' || status === '503' || status === '504') {
        return { message: `服务暂时不可用 (${status})`, detail: '后端服务暂时无法处理请求，请稍后重试' };
      }
      if (status === '429') {
        return { message: '请求过于频繁 (429)', detail: '请稍后重试' };
      }
      if (status === '401' || status === '403') {
        return { message: `权限不足 (${status})`, detail: '请检查认证信息是否正确' };
      }
      return { message: `服务异常 (${status || msg})`, detail: '请稍后重试，如问题持续请联系管理员' };
    }
    if (msg.includes('LLM 未返回有效内容')) {
      return { message: 'AI 未返回有效响应', detail: '请尝试重新发送消息' };
    }
    return { message: msg || '未知错误', detail: null };
  }

  destroy() {
    this._destroyed = true;
    this._segments = [];
    this._currentText = '';
    this._reasoningSegment = null;
    this._contentDiv = null;
    this._btnContainer = null;
  }
}

/**
 * 从 tool_result 事件中提取文件操作信息，触发文件树刷新和预览重新加载
 * 模块级函数，同时被主 SSE 流和确认 SSE 流调用
 */
function _emitFileEventsFromToolResult(parsed) {
  // 文件操作工具执行后刷新文件树
  if (parsed.name === 'bash' || parsed.name === 'write_file' || parsed.name === 'edit_file' || parsed.name === 'delete_file') {
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
