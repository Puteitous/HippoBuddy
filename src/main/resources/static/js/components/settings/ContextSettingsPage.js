/**
 * ContextSettingsPage — 上下文管理页面
 *
 * 配置上下文窗口大小和截断策略：
 * - maxTokens（上下文窗口上限）
 * - maxMessages（消息条数上限）
 * - keepRecentTurns（保留最近几轮对话）
 * - policy（截断策略算法）
 * - toolResult: { maxTokens, truncateStrategy }
 *
 * 通过 HippoDesktop.getConfig() / updateConfig() 读写配置。
 */
import { showToast } from '../../utils/toast.js';

/** 截断策略选项 */
const TRUNCATE_STRATEGIES = [
  { label: '保留末尾', value: 'tail' },
  { label: '保留开头', value: 'head' },
  { label: '保留中间', value: 'middle' },
];

/** 上下文策略选项 */
const POLICY_ITEMS = [
  { label: '简单截断', value: 'simple' },
  { label: '滑动窗口', value: 'sliding' },
  { label: '重要性排序', value: 'priority' },
];

export class ContextSettingsPage {
  constructor() {
    this._config = null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'settings-page';

    page.innerHTML = `
      <h2 class="settings-page-title">上下文管理</h2>
      <p class="settings-page-desc">配置上下文窗口大小和截断策略，控制发送给 LLM 的上下文量</p>
      <hr class="settings-page-divider">

      <div class="settings-field-group-title">上下文窗口</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field">
            <label class="settings-field-label" for="ctxMaxTokens">
              Max Tokens <span class="settings-field-hint">(上下文窗口上限，最小 1000)</span>
            </label>
            <input class="settings-input" id="ctxMaxTokens" type="number" min="1000" step="1000" placeholder="30000">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="ctxMaxMessages">
              最大消息数 <span class="settings-field-hint">(保留的消息条数上限，最小 2)</span>
            </label>
            <input class="settings-input" id="ctxMaxMessages" type="number" min="2" step="1" placeholder="20">
          </div>

          <div class="settings-field">
            <label class="settings-field-label" for="ctxKeepRecentTurns">
              保留最近轮次 <span class="settings-field-hint">(截断时至少保留的对话轮数，最小 1)</span>
            </label>
            <input class="settings-input" id="ctxKeepRecentTurns" type="number" min="1" step="1" placeholder="6">
          </div>

          <div class="settings-field-horizontal">
            <label class="settings-field-label">上下文策略</label>
            <div class="settings-field-body">
              <div class="settings-toggle-group" id="ctxPolicy">
                ${POLICY_ITEMS.map(p => `
                  <button class="settings-toggle-btn" data-value="${p.value}">${p.label}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-group-title">工具结果截断</div>
      <div class="settings-field-group">
        <div class="settings-form">
          <div class="settings-field">
            <label class="settings-field-label" for="ctxToolMaxTokens">
              工具结果 Max Tokens <span class="settings-field-hint">(工具调用结果截断上限，最小 100)</span>
            </label>
            <input class="settings-input" id="ctxToolMaxTokens" type="number" min="100" step="100" placeholder="8000">
          </div>

          <div class="settings-field-horizontal">
            <label class="settings-field-label">截断方式</label>
            <div class="settings-field-body">
              <div class="settings-toggle-group" id="ctxTruncateStrategy">
                ${TRUNCATE_STRATEGIES.map(s => `
                  <button class="settings-toggle-btn" data-value="${s.value}">${s.label}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-save-bar">
        <button class="settings-save-btn" id="ctxSave">保存配置</button>
      </div>
    `;

    container.appendChild(page);

    this._bindEvents();
    this._loadConfig();
  }

  destroy() {
    this._container = null;
    this._config = null;
  }

  // ==================== 加载 ====================

  async _loadConfig() {
    try {
      const config = await this._getConfig();
      this._config = config;
      const ctx = config.context || {};
      const tr = ctx.tool_result || {};

      const maxTokens = document.getElementById('ctxMaxTokens');
      const maxMessages = document.getElementById('ctxMaxMessages');
      const keepRecentTurns = document.getElementById('ctxKeepRecentTurns');
      const toolMaxTokens = document.getElementById('ctxToolMaxTokens');

      if (maxTokens) maxTokens.value = ctx.max_tokens ?? 30000;
      if (maxMessages) maxMessages.value = ctx.max_messages ?? 20;
      if (keepRecentTurns) keepRecentTurns.value = ctx.keep_recent_turns ?? 6;
      if (toolMaxTokens) toolMaxTokens.value = tr.max_tokens ?? 8000;

      // Policy
      const policyValue = ctx.policy || 'simple';
      document.querySelectorAll('#ctxPolicy .settings-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === policyValue);
      });

      // Truncate strategy
      const strategyValue = tr.truncate_strategy || 'tail';
      document.querySelectorAll('#ctxTruncateStrategy .settings-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === strategyValue);
      });
    } catch (e) {
      console.warn('加载上下文配置失败:', e);
      showToast('加载配置失败', { type: 'error', duration: 3000 });
    }
  }

  // ==================== 保存 ====================

  async _saveConfig() {
    const maxTokens = parseInt(document.getElementById('ctxMaxTokens')?.value, 10) || 30000;
    const maxMessages = parseInt(document.getElementById('ctxMaxMessages')?.value, 10) || 20;
    const keepRecentTurns = parseInt(document.getElementById('ctxKeepRecentTurns')?.value, 10) || 6;
    const toolMaxTokens = parseInt(document.getElementById('ctxToolMaxTokens')?.value, 10) || 8000;
    const policyBtn = document.querySelector('#ctxPolicy .settings-toggle-btn.active');
    const strategyBtn = document.querySelector('#ctxTruncateStrategy .settings-toggle-btn.active');

    const values = {
      context: {
        max_tokens: Math.max(1000, maxTokens),
        max_messages: Math.max(2, maxMessages),
        keep_recent_turns: Math.max(1, keepRecentTurns),
        policy: policyBtn?.dataset.value || 'simple',
        tool_result: {
          max_tokens: Math.max(100, toolMaxTokens),
          truncate_strategy: strategyBtn?.dataset.value || 'tail',
        },
      },
    };

    const saveBtn = document.getElementById('ctxSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }

    try {
      await this._updateConfig(values);
      showToast('上下文配置已保存', { type: 'success', duration: 2000 });
    } catch (e) {
      console.warn('保存上下文配置失败:', e);
      showToast('保存失败: ' + e.message, { type: 'error', duration: 3000 });
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存配置';
      }
    }
  }

  // ==================== 事件绑定 ====================

  _bindEvents() {
    document.getElementById('ctxSave')?.addEventListener('click', () => this._saveConfig());

    // toggle 点击切换
    document.querySelectorAll('#ctxPolicy .settings-toggle-btn, #ctxTruncateStrategy .settings-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.settings-toggle-group');
        group.querySelectorAll('.settings-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // ==================== 数据访问 ====================

  async _getConfig() {
    if (window.HippoDesktop?.getConfig) {
      return window.HippoDesktop.getConfig();
    }
    throw new Error('HippoDesktop.getConfig() 不可用');
  }

  async _updateConfig(values) {
    if (window.HippoDesktop?.updateConfig) {
      return window.HippoDesktop.updateConfig(values);
    }
    // Web 端回退
    const resp = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }
}
