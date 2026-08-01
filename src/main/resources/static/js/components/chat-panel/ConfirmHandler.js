/**
 * 确认对话框处理模块
 * 管理 ask_user 卡片、工具确认弹窗、SSE 确认流等
 */
import { appState } from '../../state/app-state.js';
import { escapeHtml } from '../../utils.js';
import { showToast } from '../../utils/toast.js';
import { EventBus } from '../../utils/event-bus.js';
import { MessageSession } from '../MessageSession.js';

const _ = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

export class ConfirmHandler {
  constructor(chatPanel) {
    this.chatPanel = chatPanel;
    this._pendingConfirmSeg = null;
    this._askUserContentDiv = null;
  }

  /**
   * 显示 ask_user 卡片
   */
  showAskUserCard(question, options, allowCustomInput, container) {
    const cp = this.chatPanel;
    const session = cp._activeSession;
    if (!session) {
      const { contentDiv } = cp.chatUI.appendAssistantMessage('');
      const fallbackDiv = container || contentDiv;
      fallbackDiv.innerHTML = `<div style="padding:8px;color:var(--text-muted)">❓ ${escapeHtml(question)}</div>`;
      return;
    }

    const segment = {
      type: 'tool',
      name: 'ask_user',
      args: JSON.stringify({
        question: question,
        options: options || [],
        allow_custom_input: allowCustomInput !== false
      }),
      result: null,
      error: null
    };

    if (container) {
      session.pushTextSegment();
      session.pushSegment(segment);
      this._askUserContentDiv = container;

      cp.renderPipeline.setContainer(container);
      cp.renderPipeline.flush(session.getSegments(), session.getCurrentText());
    } else {
      const { contentDiv } = cp.chatUI.appendAssistantMessage('');
      const segments = [segment];
      this._askUserContentDiv = contentDiv;
      cp.renderSegments(contentDiv, segments, '');
    }
  }

  /**
   * 发送用户对 ask_user 的回复
   */
  sendAskUserResponse(message) {
    const cp = this.chatPanel;
    if (!message || cp.isSendingMessage) {
      return;
    }

    const sessionId = appState.currentSessionId;
    if (!sessionId) return;

    cp.isSendingMessage = true;
    cp.setSendingState(true);
    if (cp.elements.messageInput) {
      cp.elements.messageInput.focus();
    }
    cp.currentAbortController = new AbortController();

    cp.chatUI.appendUserMessage(message);

    const session = new MessageSession({
      chatUI: cp.chatUI,
      renderPipeline: cp.renderPipeline,
      chatService: cp.chatService,
      smartScroll: () => cp.smartScroll()
    });
    cp._activeSession = session;

    const askUserMessage = message;
    const onRetry = () => {
      if (!askUserMessage) return;
      cp.chatService.stopGeneration(cp.currentAbortController);
      cp.isSendingMessage = false;
      cp.currentAbortController = new AbortController();
      this.sendAskUserResponse(askUserMessage);
    };

    session.start({
      sessionId,
      content: message,
      signal: cp.currentAbortController?.signal,
      useExecuteRequest: true,
      onRetry
    }).finally(() => {
      cp.isSendingMessage = false;
      cp.setSendingState(false);
      cp.currentAbortController = null;
      EventBus.emit('message:sent');
    });
  }

  /**
   * 执行工具确认
   */
  doConfirm(confirmId, decision, session, item) {
    const cp = this.chatPanel;
    // 清除 segment 的确认状态，UI 从确认弹窗切换到"运行中..."，防止重复点击
    if (session && confirmId) {
      const seg = session.getSegments().find(s =>
        s.type === 'tool' && s.confirmationData && s.confirmationData.confirmId === confirmId
      );
      if (seg) {
        seg.confirmationData = null;
        this._pendingConfirmSeg = seg; // 保存引用，供 404 错误恢复使用
        cp.renderPipeline.flush(session.getSegments(), session.getCurrentText());
      }
    }
    this._sendToolConfirmResponse(confirmId, decision);

    // 卡片模式：显式收起确认卡，避免 flush 完成前卡在展开态
    const card = document.querySelector(`.confirmation-btn[data-confirm-id="${confirmId}"]`)
      ?.closest('.tool-card');
    if (card) {
      card.querySelector('.tool-header')?.classList.remove('expanded');
      card.querySelector('.tool-call-details')?.classList.remove('show');
    }

    if (item) {
      const detail = item.querySelector('.tool-timeline-detail');
      if (detail) {
        detail.style.maxHeight = '0';
      }
      item.classList.remove('expanded');
      // 确认完成后恢复 footer 显示
      const msgDiv = item.closest('.message.assistant');
      if (msgDiv) {
        msgDiv.classList.remove('pending-confirm');
      }
    }
  }

  /**
   * 发送工具确认的 SSE 请求
   */
  _sendToolConfirmResponse(confirmId, decision) {
    const cp = this.chatPanel;
    const sessionId = appState.currentSessionId;
    if (!sessionId || !confirmId) return;

    const btn = document.querySelector(`.confirmation-btn.${decision}[data-confirm-id="${confirmId}"]`);
    if (btn) btn.disabled = true;

    // 恢复发送状态，显示终止按钮
    cp.isSendingMessage = true;
    cp.setSendingState(true);
    cp.currentAbortController = new AbortController();
    cp.isCompleted = false;

    fetch('/api/tool/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        confirmId,
        decision
      }),
      signal: cp.currentAbortController.signal
    }).then(async response => {
      if (!response.ok) {
        return response.json().then(err => {
          showToast(err.error || window.i18n.t('chat.confirmFailed'), { type: 'error', duration: 4000 });
          // 后端超时或确认请求失败，将 segment 标记为已取消
          if (this._pendingConfirmSeg) {
            this._pendingConfirmSeg.result = 'cancelled';
            this._pendingConfirmSeg.error = err.error || '确认已超时';
            this._pendingConfirmSeg = null;
            if (cp._activeSession) {
              cp.renderPipeline.flush(cp._activeSession.getSegments(), cp._activeSession.getCurrentText());
            }
          }
          if (btn) btn.disabled = false;
        });
      }

      const contentDiv = cp._activeSession?.getContentDiv();
      const btnContainer = cp._activeSession?.getBtnContainer();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let dataBuffer = '';

      const flushDataBuffer = () => {
        if (!dataBuffer) return;
        try {
          const parsed = JSON.parse(dataBuffer);
          parsed._eventType = currentEvent;
          cp.handleChunk(parsed, contentDiv, btnContainer);
        } catch (e) {
          console.error('[ConfirmSSE] 解析失败:', e.message, dataBuffer.slice(0, 500));
        }
        dataBuffer = '';
      };

      const processLines = (lines) => {
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            flushDataBuffer();
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataBuffer += line.substring(6);
          } else if (line === '') {
            flushDataBuffer();
          }
        }
        flushDataBuffer();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          processLines(lines);
        }

        if (buffer.trim()) {
          processLines(buffer.split('\n'));
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('读取确认 SSE 流失败:', e);
      }

      const session = cp._activeSession;
      if (session) {
        session.pushTextSegment();
        if (contentDiv) cp.renderPipeline.setContainer(contentDiv);
        cp.renderPipeline.renderFinal(session.getSegments(), '');
        // 重建 dataset.markdown，使之包含确认流后新增的文本内容
        const textSegments = session.getSegments()
          .filter(s => s.type === 'text')
          .map(s => s.content);
        if (session.getCurrentText().trim()) textSegments.push(session.getCurrentText());
        contentDiv.dataset.markdown = textSegments.join('');
        // 内容已完整渲染，显示操作按钮
        session.showActionButtons();
        cp.smartScroll();
      }

    }).catch(err => {
      if (err.name === 'AbortError') return;
      console.error('确认请求失败:', err);
      showToast(window.i18n.t('chat.confirmFailed'), { type: 'error', duration: 4000 });
      if (btn) btn.disabled = false;
      // 错误时也显示操作按钮，让用户能重试
      if (cp._activeSession) {
        cp._activeSession.showActionButtons();
      }
    }).finally(() => {
      cp.isSendingMessage = false;
      cp.setSendingState(false);
      cp.currentAbortController = null;
      cp.isCompleted = true;
      EventBus.emit('message:sent');
    });
  }

  /**
   * 绑定 ask_user 卡片的事件
   */
  bindAskUserCardEvents(card) {
    const details = card.querySelector('.tool-call-details');
    if (!details) {
      return;
    }

    details.style.transition = 'none';
    const h = details.scrollHeight;
    details.style.maxHeight = h > 0 ? h + 'px' : '9999px';
    details.style.transition = '';
    card.classList.add('expanded');

    const optionBtns = card.querySelectorAll('.option-btn');
    optionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const option = btn.getAttribute('data-option');
        if (option) {
          details.style.maxHeight = '0';
          card.classList.remove('expanded');
          this.sendAskUserResponse(option);
        }
      });
    });
  }

  /**
   * 处理 RenderPipeline 传来的确认点击事件（包含删除文件的二次确认弹窗逻辑）
   */
  onConfirmationClick(e) {
    const cp = this.chatPanel;
    const btn = e.currentTarget;
    const confirmId = btn.dataset.confirmId;
    const decision = btn.classList.contains('allow') ? 'allow' : 'deny';
    const item = btn.closest('.tool-timeline-item');
    const session = cp._activeSession;

    // 拒绝操作或非删除确认，直接执行
    if (decision !== 'allow' || !btn.classList.contains('delete-confirm')) {
      this.doConfirm(confirmId, decision, session, item);
      return;
    }

    // 删除文件二次确认弹窗
    const seg = session?.getSegments().find(s =>
      s.type === 'tool' && s.confirmationData && s.confirmationData.confirmId === confirmId
    );
    const total = seg?.confirmationData?.totalCount || 0;
    const overlay = document.getElementById('deleteConfirmOverlay');
    const modalText = document.getElementById('deleteConfirmModalText');
    modalText.textContent = _('deleteConfirm.confirmFiles', { count: total });
    overlay.style.display = 'flex';

    const onConfirm = () => {
      overlay.style.display = 'none';
      document.getElementById('deleteConfirmOk').removeEventListener('click', onConfirm);
      document.getElementById('deleteConfirmCancel').removeEventListener('click', onCancel);
      this.doConfirm(confirmId, decision, session, item);
    };
    const onCancel = () => {
      overlay.style.display = 'none';
      document.getElementById('deleteConfirmOk').removeEventListener('click', onConfirm);
      document.getElementById('deleteConfirmCancel').removeEventListener('click', onCancel);
    };

    document.getElementById('deleteConfirmOk').addEventListener('click', onConfirm);
    document.getElementById('deleteConfirmCancel').addEventListener('click', onCancel);
  }
}
