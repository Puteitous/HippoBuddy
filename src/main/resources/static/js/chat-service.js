import { safeParseJSON } from './utils.js';

export class ChatService {
  constructor(baseUrl = '', options = {}) {
    this.baseUrl = baseUrl;
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 1000;
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

      const processSSELines = (lines) => {
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            if (dataBuffer) {
              const data = dataBuffer;
              dataBuffer = '';
              
              if (data === '[DONE]') {
                hasContent = true;
              } else {
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
              }
            }
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            if (dataBuffer) {
              dataBuffer += '\n' + line.substring(6);
            } else {
              dataBuffer = line.substring(6);
            }
          }
        }
        
        if (dataBuffer) {
          const data = dataBuffer;
          dataBuffer = '';
          
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
        }
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

  async getSessionMessages(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/messages`);
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`获取消息失败: ${response.status}`);
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

  stopGeneration(abortController) {
    if (abortController) {
      abortController.abort();
    }
  }
}
