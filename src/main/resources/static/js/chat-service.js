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
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`获取消息失败: ${response.status}`);
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

  async sendMessage(session, message, onChunk, signal, systemPrompt, editMessageId) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        console.warn(`空响应重试：第 ${attempt}/${this.maxRetries} 次`);
        if (onChunk) {
          onChunk({
            type: 'retry',
            attempt: attempt,
            maxRetries: this.maxRetries,
            message: `正在重试 (${attempt}/${this.maxRetries})...`
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }

      try {
        const result = await this.executeRequest(session, message, onChunk, signal, systemPrompt, editMessageId);
        if (result.hasContent) {
          return;
        }
        
        console.warn(`第 ${attempt} 次请求完成但 hasContent=false, 准备重试`);
        lastError = new Error('LLM 未返回有效内容');
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error;
        }
        console.warn(`第 ${attempt} 次请求异常:`, error.message);
        lastError = error;
      }
    }

    throw lastError || new Error('请求失败');
  }

  async executeRequest(session, message, onChunk, signal, systemPrompt, editMessageId) {
    const timeout = 5 * 60 * 1000;
    let timeoutReject;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutReject = reject;
    });
    const timeoutId = setTimeout(() => {
      timeoutReject(new Error('请求超时'));
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
            ...(editMessageId ? { editMessageId: editMessageId } : {})
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

      const flushDataBuffer = () => {
        const data = dataBuffer;
        dataBuffer = '';
        if (!data) return;

        if (data === '[DONE]') {
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
          if (onChunk) {
            onChunk({
              type: currentEvent || 'raw',
              content: data,
              _eventType: currentEvent
            });
          }
        }
      };

      const processSSELines = (lines) => {
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
            flushDataBuffer();
          }
        }

        flushDataBuffer();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        processSSELines(lines);
      }

      if (buffer.trim()) {
        const lines = buffer.split('\n');
        processSSELines(lines);
      }
    } catch (error) {
      buffer = '';
      dataBuffer = '';
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
      const err = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(err.error || `撤销失败: ${response.status}`);
    }
    return response.json();
  }

  /**
   * 截断会话：删除从指定消息开始及之后的所有消息，回滚文件变更，同步清理 JSONL
   * @param {string} sessionId - 会话 ID
   * @param {string} messageId - 用户消息的 UUID（截断锚点）
   * @param {number} startTime - 文件回滚开始时间戳
   * @param {number} endTime - 文件回滚结束时间戳
   */
  async truncateSession(sessionId, messageId, startTime, endTime) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/truncate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, startTime, endTime })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(err.error || `截断失败: ${response.status}`);
    }
    return response.json();
  }

  stopGeneration(abortController) {
    if (abortController) {
      abortController.abort();
    }
  }
}
