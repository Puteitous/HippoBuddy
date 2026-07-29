import { safeParseJSON } from './utils.js';

export class ChatService {
  constructor(baseUrl = '', options = {}) {
    this.baseUrl = baseUrl;
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 1000;
    this._messageCache = new Map();
    this._pendingRefreshes = new Map();
    this._maxCacheSize = 20;
    this._cacheAccessOrder = [];
  }

  _touchCache(sessionId) {
    const idx = this._cacheAccessOrder.indexOf(sessionId);
    if (idx !== -1) this._cacheAccessOrder.splice(idx, 1);
    this._cacheAccessOrder.push(sessionId);
    if (this._cacheAccessOrder.length > this._maxCacheSize) {
      const oldest = this._cacheAccessOrder.shift();
      this._messageCache.delete(oldest);
    }
  }

  invalidateMessageCache(sessionId) {
    this._messageCache.delete(sessionId);
    this._pendingRefreshes.delete(sessionId);
    const idx = this._cacheAccessOrder.indexOf(sessionId);
    if (idx !== -1) this._cacheAccessOrder.splice(idx, 1);
  }

  clearMessageCache() {
    this._messageCache.clear();
    this._pendingRefreshes.clear();
    this._cacheAccessOrder = [];
  }

  async _fetchSessionMessages(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/messages`);
    if (!response.ok) {
      throw new Error(i18n.t('chat.fetchFailed') + ': ' + response.status);
    }
    return response.json();
  }

  async getSessionMessages(sessionId) {
    const cached = this._messageCache.get(sessionId);
    if (cached) {
      this._touchCache(sessionId);
      // Background refresh: fetch latest data without blocking the caller
      this._refreshInBackground(sessionId);
      return cached.messages;
    }
    const messages = await this._fetchWithDedup(sessionId);
    this._messageCache.set(sessionId, { messages, timestamp: Date.now() });
    this._touchCache(sessionId);
    return messages;
  }

  async _fetchWithDedup(sessionId) {
    const pending = this._pendingRefreshes.get(sessionId);
    if (pending) return pending;
    const promise = this._fetchSessionMessages(sessionId).finally(() => {
      this._pendingRefreshes.delete(sessionId);
    });
    this._pendingRefreshes.set(sessionId, promise);
    return promise;
  }

  async _refreshInBackground(sessionId) {
    try {
      const messages = await this._fetchWithDedup(sessionId);
      this._messageCache.set(sessionId, { messages, timestamp: Date.now() });
      this._touchCache(sessionId);
    } catch {
      // Silent fail — cached data remains valid
    }
  }

  async sendMessage(session, message, onChunk, signal, systemPrompt, editMessageId, selectedRules, mode, images) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        console.warn(`空响应重试：第 ${attempt}/${this.maxRetries} 次`);
        if (onChunk) {
          onChunk({
            type: 'retry',
            attempt: attempt,
            maxRetries: this.maxRetries,
            message: i18n.t('chat.retrying', { attempt, maxRetries: this.maxRetries })
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }

      try {
        const result = await this.executeRequest(session, message, onChunk, signal, systemPrompt, editMessageId, selectedRules, mode, images);
        if (result.hasContent) {
          return;
        }
        
        console.warn(`第 ${attempt} 次请求完成但 hasContent=false, 准备重试`);
        lastError = new Error(i18n.t('chat.llmNoContent'));
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error;
        }
        console.warn(`第 ${attempt} 次请求异常:`, error.message);
        lastError = error;
      }
    }

    console.error(`[ChatService] ${session} 重试耗尽, 最终错误:`, lastError?.message || i18n.t('chat.requestFailed'));
    throw lastError || new Error(i18n.t('chat.requestFailed'));
  }

  async executeRequest(session, message, onChunk, signal, systemPrompt, editMessageId, selectedRules, mode, images) {
    const timeout = 5 * 60 * 1000;
    let timeoutReject;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutReject = reject;
    });
    const timeoutId = setTimeout(() => {
      timeoutReject(new Error(i18n.t('chat.timeoutError')));
    }, timeout);

    let hasContent = false;
    let buffer = '';
    let dataBuffer = '';

    try {
      const response = await Promise.race([
        fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: signal || null,
          body: JSON.stringify({
            session: session,
            message: message,
            ...(systemPrompt ? { systemPrompt: systemPrompt } : {}),
            ...(editMessageId ? { editMessageId: editMessageId } : {}),
            ...(selectedRules && selectedRules.length > 0 ? { selectedRules: selectedRules } : {}),
            ...(images && images.length > 0 ? { images: images } : {}),
            mode: mode || 'coding'
          })
        }),
        timeoutPromise
      ]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let currentEvent = 'message';

      const yieldToBrowser = () => new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });

      const flushDataBuffer = () => {
        const data = dataBuffer;
        dataBuffer = '';
        if (!data) return;

        if (data === '[DONE]') {
          _streamDone = true;
          hasContent = true;
          return;
        }

        const parsed = safeParseJSON(data);
        if (parsed) {
          if (onChunk) {
            if (parsed.content || parsed.name) {
              hasContent = true;
            }
            parsed._eventType = currentEvent;
            onChunk(parsed);
          }
        } else {
          // 正则兜底：JSON 解析失败时，尝试从 tool_result 数据中提取关键字段
          if (currentEvent === 'tool_result') {
            const idMatch = data.match(/"id"\s*:\s*"([^"]*)"/);
            const nameMatch = data.match(/"name"\s*:\s*"([^"]*)"/);
            const successMatch = data.match(/"success"\s*:\s*(true|false)/);
            if (idMatch && nameMatch) {
              if (onChunk) {
                hasContent = true;
                onChunk({
                  id: idMatch[1],
                  name: nameMatch[1],
                  success: successMatch?.[1] === 'true',
                  error: i18n.t('chat.toolResultParseError'),
                  _eventType: 'tool_result'
                });
              }
              return;
            }
          }
          if (onChunk) {
            onChunk({
              type: currentEvent || 'raw',
              content: data,
              _eventType: currentEvent
            });
          }
        }
      };

      let _streamDone = false; // 是否看到 [DONE]

      const processSSELines = async (lines) => {
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            flushDataBuffer();
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            if (dataBuffer) {
              dataBuffer += '\n' + line.substring(6);
            } else {
              dataBuffer = line.substring(6);
            }
          } else if (line === '') {
            const evt = currentEvent;
            flushDataBuffer();
            if (evt === 'tool_start' || evt === 'tool_result' || evt === 'tool_progress') {
              await yieldToBrowser();
            }
          }
        }

        flushDataBuffer();
      };

      console.debug(`[SSE] 开始读取流 session=${session}`);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (!_streamDone) {
            console.warn(`[SSE] 流意外结束(未收到[DONE]) session=${session}`);
          } else {
            console.debug(`[SSE] 流正常结束(收到[DONE]) session=${session}`);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        await processSSELines(lines);
      }

      if (buffer.trim()) {
        const lines = buffer.split('\n');
        await processSSELines(lines);
      }
    } catch (error) {
      buffer = '';
      dataBuffer = '';
      const isAbort = error.name === 'AbortError';
      const isTimeout = error.message && (error.message.includes('超时') || error.message.includes('timeout') || error.message.includes('Timeout'));
      console.warn(`[SSE] 流异常终止 session=${session} type=${isAbort ? 'Abort' : isTimeout ? 'Timeout' : 'Error'} msg="${error.message}" hasContent=${hasContent}`);
      if (hasContent) {
        return { hasContent: true };
      }
      throw error;
    } finally {
      buffer = '';
      dataBuffer = '';
      clearTimeout(timeoutId);
    }

    return { hasContent };
  }

  async getSessions() {
    const response = await fetch(`${this.baseUrl}/api/sessions`);
    if (!response.ok) {
      throw new Error(`获取会话列表失败: ${response.status}`);
    }
    return response.json();
  }

  async deleteSession(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`删除会话失败: ${response.status}`);
    }
  }

  async renameSession(sessionId, name) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    if (!response.ok) {
      throw new Error(`重命名会话失败: ${response.status}`);
    }
  }

  /**
   * 用 LLM 自动生成会话标题（基于第一条用户消息）。
   * 不会覆盖用户手动重命名的标题。
   * @param {string} sessionId 会话 ID
   * @param {string} [userMessage] 用户消息原文（作为兜底，解决标题 API 比 Chat API 先到达后端的竞态）
   * @returns {Promise<{title: string, source: string}|null>}
   */
  async generateTitle(sessionId, userMessage) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage })
      });
      if (!response.ok) return null;
      return response.json();
    } catch (e) {
      console.warn('生成标题失败:', e);
      return null;
    }
  }

  async compactSession(sessionId, instruction = null) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: instruction || '' })
    });
    if (!response.ok) {
      throw new Error(`压缩会话失败: ${response.status}`);
    }
    return response.json();
  }

  async getTokenStats(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/tokens`);
    if (!response.ok) {
      throw new Error(`获取 Token 统计失败: ${response.status}`);
    }
    return response.json();
  }

  async rollbackFile(filePath) {
    const response = await fetch(`${this.baseUrl}/api/files/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: i18n.t('chat.requestFailed') }));
      throw new Error(err.error || `${i18n.t('chat.undoFailed')}${response.status}`);
    }
    return response.json();
  }

  /**
   * 回滚文件变更和/或会话记录。
   * @param {string} sessionId
   * @param {string} messageId
   * @param {string} [mode='all'] - 'all' 回滚文件+截断会话，'files' 仅回滚文件
   * @returns {Promise<{success: boolean, filesChanged: number}>}
   */
  async rewind(sessionId, messageId, mode = 'all') {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, mode })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: i18n.t('chat.requestFailed') }));
      throw new Error(err.error || `${i18n.t('chat.rewindFailed')}${response.status}`);
    }
    return response.json();
  }

  /**
   * 会话分叉：从指定消息处复制历史到新会话。
   * @param {string} sessionId
   * @param {string} messageId
   * @returns {Promise<{newSessionId: string, messageCount: number}>}
   */
  async forkSession(sessionId, messageId) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: i18n.t('chat.requestFailed') }));
      throw new Error(err.error || `${i18n.t('chat.forkFailed')}${response.status}`);
    }
    return response.json();
  }

  /**
   * 快照回滚预览
   * @param {string} sessionId
   * @param {string} messageId
   * @returns {Promise<{files: Array}>}
   */
  async rewindPreview(sessionId, messageId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/rewind-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      if (!response.ok) {
        return { files: [] };
      }
      return response.json();
    } catch {
      return { files: [] };
    }
  }

  stopGeneration(abortController) {
    if (abortController) {
      abortController.abort();
    }
  }

  /**
   * 查询会话的 Agent 是否正在运行。
   * @param {string} sessionId
   * @returns {Promise<{sessionId: string, running: boolean}>}
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/status`);
      if (!response.ok) return { sessionId, running: false };
      return response.json();
    } catch {
      return { sessionId, running: false };
    }
  }

  /**
   * 轮询等待会话执行完成，期间如有新消息会自动更新前端。
   * @param {string} sessionId
   * @param {Function} [onProgress] 可选回调，每次轮询到新消息时调用 (messages) => void
   * @param {number} [interval=500] 轮询间隔（毫秒）
   * @param {number} [timeout=300000] 超时时间（毫秒，默认 5 分钟）
   * @returns {Promise<boolean>} true=已完成，false=超时
   */
  async waitForSessionComplete(sessionId, onProgress, interval = 500, timeout = 300000) {
    const start = Date.now();
    let lastMessageCount = -1;
    while (Date.now() - start < timeout) {
      const status = await this.getSessionStatus(sessionId);

      // 如果有新消息，通知回调更新前端
      if (onProgress) {
        const messages = await this.getSessionMessages(sessionId);
        if (messages.length > lastMessageCount && lastMessageCount >= 0) {
          onProgress(messages);
        }
        lastMessageCount = messages.length;
      }

      if (!status.running) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    console.warn(`等待会话完成超时: sessionId=${sessionId}`);
    return false;
  }
}
