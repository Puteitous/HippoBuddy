// 历史消息加载与渲染
import { renderMarkdown } from '../../markdown-renderer.js';
import { escapeHtml } from '../../utils.js';
import { getFileIconInfo } from '../../utils/file-icons.js';
import { parseTodoArgs, deepMergeTodoList } from '../tool-renderers/shared.js';
import { RenderPipeline } from '../RenderPipeline.js';
import { EventBus } from '../../utils/event-bus.js';
import { imageLightbox } from '../../utils/image-lightbox.js';

// ── 多模式预设提示词 ──
const _ = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

export class HistoryRenderer {
  constructor(chatPanel) {
    this.chatPanel = chatPanel;
  }

  /**
   * 从消息内容中移除 [会话中断] 标记文本。
   * 用户忽略确认弹窗后刷新页面时，后端 detectAndFixInterruption
   * 会给 assistant 消息追加中断提示。此方法在加载历史时将其滤除，
   * 避免用户看到"待执行的操作: bash"等无用信息。
   */
  _cleanInterruptionText(content) {
    if (!content) return content;
    const idx = content.indexOf('[会话中断]');
    if (idx === -1) return content;
    const cleaned = content.substring(0, idx).trim();
    return cleaned;
  }

  /**
   * 从服务端消息数组加载历史消息（会话切换时调用）
   */
  async loadHistoryMessages(messages, noAnimation = false) {
    const cp = this.chatPanel;
    const toolResults = {};
    for (const msg of messages) {
      if ((msg.role === 'tool' || msg.role === 'tool-result') && msg.toolCallId) {
        toolResults[msg.toolCallId] = msg;
      }
    }

    const messageRows = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'tool' || msg.role === 'tool-result') {
        i++;
        continue;
      }

      if (msg.role === 'user') {
        // 多模态消息：提取文本和图片
        let text = msg.content;
        let images = [];
        if (Array.isArray(msg.content)) {
          text = '';
          images = [];
          for (const part of msg.content) {
            if (part.type === 'text') {
              text += part.text || '';
            } else if (part.type === 'image_url') {
              const url = part.image_url?.url;
              if (url) images.push(url);
            }
          }
        }
        messageRows.push({ type: 'user', content: text, id: msg.id, images });
        i++;
        continue;
      }

      if (msg.role === 'assistant') {
        const segments = [];
        let text = '';
        let firstMsgTime = null;

        while (i < messages.length) {
          const am = messages[i];

          if (am.role === 'tool' || am.role === 'tool-result') {
            i++;
            continue;
          }

          if (am.role !== 'assistant') {
            break;
          }

          const rawContent = am.content || '';
          const amText = this._cleanInterruptionText(rawContent);
          const amReasoning = am.reasoning_content || '';
          const hasToolCalls = am.tool_calls && am.tool_calls.length > 0;

          if (!firstMsgTime && am.timestamp) {
            firstMsgTime = am.timestamp;
          }

          if (amText.trim() && !hasToolCalls) {
            if (text.trim()) segments.push({ type: 'text', content: text });
            if (amReasoning) {
              segments.push({ type: 'thinking', content: amReasoning, done: true });
            }
            if (am.web_searched) {
              segments.push({ type: 'web-search', done: true, actions: am.web_search_actions || [] });
            }
            text = amText;
            i++;
            break;
          }

          if (text.trim()) {
            segments.push({ type: 'text', content: text });
            text = '';
          }

          if (amReasoning) {
            segments.push({ type: 'thinking', content: amReasoning, done: true });
          }

          if (am.web_searched) {
            segments.push({ type: 'web-search', done: true, actions: am.web_search_actions || [] });
          }

          if (amText.trim()) {
            text = amText;
          }

          if (hasToolCalls) {
            if (text.trim()) {
              segments.push({ type: 'text', content: text });
              text = '';
            }

            for (const tc of am.tool_calls) {
              let result = null;
              let resultContent = null;
              let error = null;
              const tr = toolResults[tc.id];
              if (tr) {
                result = tr.success ? 'success' : 'error';
                resultContent = tr.content || null;
                if (!tr.success) error = resultContent;
              } else {
                // 自愈：历史中 tool 没有对应结果 → 未完成，标记为已取消
                result = 'cancelled';
              }
              segments.push({
                type: 'tool',
                name: tc.name,
                id: tc.id,
                args: tc.arguments,
                result: result,
                resultContent: resultContent,
                error: error
              });
            }
          }
          i++;
        }

        if (text.trim()) {
          segments.push({ type: 'text', content: text });
        }

        // 加载历史消息时重建 todo_write 的 treeCache，使 merge 调用的 args 合并为完整树
        // 这样刷新后 todo 卡片与对话时显示一致（独立快照，每张卡片都是完整任务树）
        let _todoHistoryCache = null;
        for (const seg of segments) {
          if (seg.type === 'tool' && seg.name === 'todo_write' && seg.args) {
            const { mode, todos } = parseTodoArgs(seg.args);
            const merged = deepMergeTodoList(_todoHistoryCache || [], todos);
            _todoHistoryCache = merged;
            seg.args = JSON.stringify({ todos: merged });
          }
        }

        messageRows.push({ type: 'assistant', segments, firstMsgTime });
      } else {
        i++;
      }
    }

    // Process markdown + DOM in batches — content appears progressively
    const BATCH_SIZE = 20;
    let isFirstBatch = true;

    cp.container.innerHTML = '';

    let precedingUserContent = '';

    for (let batchStart = 0; batchStart < messageRows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, messageRows.length);

      // Render markdown for text segments in this batch only
      const batchRenderTasks = [];
      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];
        if (row.type !== 'assistant') continue;
        for (const seg of row.segments) {
          if (seg.type === 'text' && seg.content && !seg._rendered) {
            batchRenderTasks.push(seg);
          }
        }
      }
      if (batchRenderTasks.length > 0) {
        const results = await Promise.all(batchRenderTasks.map(seg => renderMarkdown(seg.content)));
        for (let ti = 0; ti < batchRenderTasks.length; ti++) {
          batchRenderTasks[ti]._rendered = results[ti];
        }
      }

      // Build DOM for this batch
      const fragment = document.createDocumentFragment();
      let rowIndex = 0;

      for (let ri = batchStart; ri < batchEnd; ri++) {
        const row = messageRows[ri];

        if (row.type === 'user') {
          if (row.content && row.content.trim()) {
            precedingUserContent = row.content;
            const userRow = document.createElement('div');
            userRow.className = 'message-row user-row';
            if (!noAnimation) {
              userRow.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
              userRow.classList.add('animate-in');
              rowIndex++;
            }

            const userMsgDiv = document.createElement('div');
            userMsgDiv.className = 'message user';
            if (row.id) userMsgDiv.dataset.messageId = row.id;

            // 解析 @path 引用并渲染为卡片
            const { refs, remainingContent } = cp.chatUI._parseRefsFromContent(row.content);
            if (refs && refs.length > 0) {
              const refsBar = document.createElement('div');
              refsBar.className = 'message-user-refs';
              refs.forEach(ref => {
                refsBar.appendChild(cp.chatUI._createRefChip(ref, true));
              });
              userMsgDiv.appendChild(refsBar);
            }

            // 图片展示区域（历史消息中的多模态图片）
            if (row.images && row.images.length > 0) {
              const imgGallery = document.createElement('div');
              imgGallery.className = 'message-user-images';
              row.images.forEach(imgUrl => {
                const imgItem = document.createElement('div');
                imgItem.className = 'message-user-image-item';
                const imgEl = document.createElement('img');
                imgEl.src = imgUrl;
                imgEl.loading = 'lazy';
                imgEl.alt = '用户上传图片';
                imgEl.draggable = false;
                // 点击放大查看
                imgEl.addEventListener('click', () => {
                  imageLightbox.show(imgUrl, '用户上传图片');
                });
                imgItem.appendChild(imgEl);
                imgGallery.appendChild(imgItem);
              });
              userMsgDiv.appendChild(imgGallery);
            }

            const userContentDiv = document.createElement('div');
            userContentDiv.className = 'message-content';
            userContentDiv.textContent = remainingContent ?? row.content;
            userMsgDiv.appendChild(userContentDiv);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

            const btnContainer = document.createElement('div');
            btnContainer.className = 'message-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-action-btn';
            copyBtn.title = _('chatui.copy');
            copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(row.content).then(() => {
                copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                  copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                  copyBtn.classList.remove('copied');
                }, 2000);
              }).catch(() => {});
            });
            btnContainer.appendChild(copyBtn);

            const footer = document.createElement('div');
            footer.className = 'message-footer';
            footer.appendChild(btnContainer);
            footer.appendChild(timeDiv);

            const msgWrap = document.createElement('div');
            msgWrap.className = 'message-user-wrap';
            msgWrap.appendChild(userMsgDiv);
            msgWrap.appendChild(footer);
            userRow.appendChild(msgWrap);
            fragment.appendChild(userRow);
          }
          continue;
        }

        if (row.type === 'assistant') {
          const segments = row.segments;
          const firstMsgTime = row.firstMsgTime;

          const rowEl = document.createElement('div');
          rowEl.className = 'message-row assistant-row';
          if (!noAnimation) {
            rowEl.style.setProperty('--msg-delay', `${Math.min(rowIndex * 0.04, 0.6)}s`);
            rowEl.classList.add('animate-in');
            rowIndex++;
          }

          const msgDiv = document.createElement('div');
          msgDiv.className = 'message assistant';
          if (firstMsgTime) msgDiv.dataset.timestamp = firstMsgTime;
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';

          if (segments.length === 0) {
            contentDiv.innerHTML = '<div class="msg-note">🤖 AI 未返回有效响应，请尝试重新发送</div>';
          } else {
            let html = '';
            let toolTimelineHtml = '';
            const flushToolTimeline = () => {
              if (toolTimelineHtml) {
                html += `<div class="tool-timeline">${toolTimelineHtml}</div>`;
                toolTimelineHtml = '';
              }
            };
            for (const seg of segments) {
              if (seg.type === 'thinking') {
                flushToolTimeline();
                html += RenderPipeline.renderThinkingBubble(seg);
              } else if (seg.type === 'web-search') {
                // 历史消息中联网搜索标记：随 assistant 消息持久化，刷新后恢复「已联网搜索」行
                flushToolTimeline();
                html += RenderPipeline.renderWebSearchRow(seg);
              } else if (seg.type === 'tool') {
                if (seg.name === 'todo_write' || seg.name === 'ask_user') {
                  flushToolTimeline();
                  html += cp.chatUI.renderToolCard(seg);
                } else {
                  toolTimelineHtml += cp.chatUI.renderToolTimelineRow(seg);
                }
              } else if (seg.type === 'text' && seg.content) {
                flushToolTimeline();
                html += seg._rendered || '';
              }
            }
            flushToolTimeline();
            contentDiv.innerHTML = html;
            contentDiv.querySelectorAll('.tool-card, .tool-call-card').forEach(card => {
              cp.chatUI.bindToolCardEvents(card);
            });
            // 额外绑定 ask-user-card 的 option-btn 事件（与 RenderPipeline 顺序一致）
            contentDiv.querySelectorAll('.ask-user-card').forEach(card => {
              if (!card.dataset.eventsBound) {
                cp.confirmHandler.bindAskUserCardEvents(card);
              }
            });
          }
          msgDiv.appendChild(contentDiv);
          rowEl.appendChild(msgDiv);

          const btnContainer = document.createElement('div');
          btnContainer.className = 'message-actions';

          const retryBtn = document.createElement('button');
          retryBtn.className = 'message-action-btn';
          retryBtn.title = _('chatui.retry');
          retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
          btnContainer.appendChild(retryBtn);

          const userContent = precedingUserContent;
          retryBtn.onclick = () => {
            if (!userContent) return;
            cp.sendMessage(userContent);
          };

          const copyBtn = document.createElement('button');
          copyBtn.className = 'message-action-btn';
          copyBtn.title = _('chatui.copy');
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          btnContainer.appendChild(copyBtn);

          const rollbackBtn = document.createElement('button');
          rollbackBtn.className = 'message-action-btn rollback-btn';
          rollbackBtn.title = _('chatui.rollback');
          rollbackBtn.innerHTML = '↩';
          rollbackBtn.addEventListener('click', () => EventBus.emit('message:rollback', msgDiv));
          btnContainer.appendChild(rollbackBtn);

          const forkBtn = document.createElement('button');
          forkBtn.className = 'message-action-btn fork-btn';
          forkBtn.title = _('chatui.fork');
          forkBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="2"></circle><circle cx="6" cy="3" r="2"></circle><circle cx="6" cy="15" r="2"></circle><path d="M18 8v1a4 4 0 01-4 4H8"></path></svg>';
          forkBtn.addEventListener('click', () => EventBus.emit('message:fork', msgDiv));
          btnContainer.appendChild(forkBtn);

          const rawMarkdown = segments.filter(s => s.type === 'text').map(s => s.content).join('');
          contentDiv.dataset.markdown = rawMarkdown;

          // ── 文件产物指示器 ──
          const filesFromSegments = HistoryRenderer.extractFilesFromSegments(segments);
          const fileIndicator = document.createElement('span');
          fileIndicator.className = 'message-file-indicator';
          const filePopover = document.createElement('div');
          filePopover.className = 'message-file-popover';

          if (filesFromSegments.length > 0) {
            fileIndicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="padding-top: 1px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${filesFromSegments.length}`;
            fileIndicator.title = _('chatui.viewFileProducts');

            // 构建 popover 内容（最多显示 10 条）
            const MAX_VISIBLE = 10;
            const visibleFiles = filesFromSegments.slice(0, MAX_VISIBLE);
            const overflow = filesFromSegments.length - MAX_VISIBLE;
            let popoverHtml = '';
            for (const f of visibleFiles) {
              const fileName = f.path.split(/[/\\]/).pop();
              const { iconFile } = getFileIconInfo(fileName);
              let statusLetter = f.action;
              let statusClass = 'status-added';
              if (f.action === 'D') statusClass = 'status-deleted';
              else if (f.action === 'M') statusClass = 'status-modified';

              popoverHtml += `<div class="popover-file-item" data-path="${escapeHtml(f.path)}">
                <img class="popover-file-icon" src="icons/${iconFile}" draggable="false" alt="">
                <span class="file-name">${escapeHtml(fileName)}</span>
                <span class="file-status ${statusClass}">${statusLetter}</span>
              </div>`;
            }
            if (overflow > 0) {
              popoverHtml += `<div class="popover-file-overflow">${window.i18n.t('fileChanges.overflow', { overflow })}</div>`;
            }
            filePopover.innerHTML = popoverHtml;

            // hover 显隐
            let popoverTimer = null;
            const showPopover = () => {
              if (popoverTimer) clearTimeout(popoverTimer);
              popoverTimer = setTimeout(() => filePopover.classList.add('show'), 200);
            };
            const hidePopover = () => {
              if (popoverTimer) clearTimeout(popoverTimer);
              popoverTimer = setTimeout(() => filePopover.classList.remove('show'), 200);
            };
            fileIndicator.addEventListener('mouseenter', showPopover);
            fileIndicator.addEventListener('mouseleave', hidePopover);
            filePopover.addEventListener('mouseenter', showPopover);
            filePopover.addEventListener('mouseleave', hidePopover);

            // 点击文件项打开 diff
            filePopover.addEventListener('click', (e) => {
              const item = e.target.closest('.popover-file-item');
              if (item) {
                const path = item.dataset.path;
                filePopover.classList.remove('show');
                // 统一分流：桌面端 diff 标签页 / Web 端弹窗降级
                window.showFileDiff(path);
              }
            });

            fileIndicator.appendChild(filePopover);
          }

          copyBtn.onclick = () => {
            const textToCopy = contentDiv.dataset.markdown || contentDiv.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
              copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              copyBtn.classList.add('copied');
              setTimeout(() => {
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                copyBtn.classList.remove('copied');
              }, 2000);
            });
          };

          const footer = document.createElement('div');
          footer.className = 'message-footer';
          if (filesFromSegments.length > 0) {
            btnContainer.appendChild(fileIndicator);
          }
          footer.appendChild(btnContainer);
          msgDiv.appendChild(footer);

          // 检查是否有工具正在等待用户确认 → 隐藏 footer（对话未完成不应显示操作按钮）
          const hasPendingConfirm = segments.some(s =>
            s.type === 'tool' && s.confirmationData && !s.result
          );
          if (hasPendingConfirm) {
            msgDiv.classList.add('pending-confirm');
          }

          fragment.appendChild(rowEl);
        }
      }

      if (isFirstBatch) {
        isFirstBatch = false;
        cp.container.appendChild(fragment);
        // Reveal container after first batch is in DOM — no flash, no drop
        cp.container.classList.remove('switching');
        // Yield to browser so first batch paints before remaining batches
        await new Promise(r => requestAnimationFrame(r));
      } else {
        cp.container.appendChild(fragment);
      }

    }

    // 切换到有消息的会话后，将上下文选择器注入到底部状态栏
    cp._injectContextSelectorButton();

    cp.chatUI.scrollToBottom();
  }

  /**
   * 从 segments 中提取本轮产出的文件列表
   * @param {Array} segments
   * @returns {Array<{path:string, action:string, toolName:string}>}
   */
  static extractFilesFromSegments(segments) {
    const files = [];
    for (const seg of segments) {
      if (seg.type !== 'tool') continue;
      // 只统计已完成的工具
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
        files.push({ path: p, action, toolName: seg.name });
      }
    }
    // 去重：同一文件在同一轮中被多次写入只保留一次（以最新 action 为准）
    const seen = new Map();
    for (const f of files) {
      seen.set(f.path, f);
    }
    return Array.from(seen.values());
  }
}
