/**
 * ModelSelectorPanel — 状态栏「模型 + 思考强度」两级选择面板
 *
 * 参考 ContextSelector 的面板模式：一个双信息触发器（模型名 · 当前档位），
 * 点击展开后是「手机设置页」式的两级导航：
 *   - 第一级 menu：模型 / 思考强度两个入口，右侧带当前值摘要（› 进二级）
 *   - 第二级 models：历史模型列表 + 当前模型高亮 + 「添加模型」入口
 *   - 第二级 effort：按 Provider 官方协议列出档位（Default/low/high/max 等），
 *     当前档位高亮；Thinking Mode 关闭时第一级入口置灰不可进
 *
 * 数据源：GET /api/config/llm 返回的配置对象（含 provider/model/modelHistory，
 * 快照内含 reasoningEffort/thinkingEnabled）。
 * 变更通过回调交给宿主（main.js）执行 PUT 保存。
 */

import { getReasoningEffortItems, supportsReasoningEffort } from './settings/ModelSettingsPage.js';

const PANEL_WIDTH = 320;
const ADD_MODEL_VALUE = '__add_model__';
const t = (key) => (window.i18n && window.i18n.t ? window.i18n.t(key) : key);

export class ModelSelectorPanel {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.trigger  #modelQuickSelect 按钮
   * @param {(provider:string, model:string)=>void} [opts.onModelSelect]  切换模型
   * @param {()=>void} [opts.onAddModel]                                   打开「添加模型」
   * @param {(provider:string, model:string, effort:string)=>void} [opts.onEffortSelect] 切换思考强度
   */
  constructor({ trigger, onModelSelect, onAddModel, onEffortSelect } = {}) {
    if (!trigger) throw new Error('ModelSelectorPanel: trigger is required');
    this._trigger = trigger;
    this._onModelSelect = onModelSelect;
    this._onAddModel = onAddModel;
    this._onEffortSelect = onEffortSelect;
    this._data = null;
    this._panel = null;
    this._isOpen = false;
    // 两级导航层级：menu（摘要入口）→ models / effort（二级列表）
    this._level = 'menu';
    // 面板挂载到触发器所在的状态栏项（.status-bar-item，position:relative），
    // 与 files popover 同款：absolute 嵌套定位，面板永远紧贴按钮上方并跟随按钮。
    this._host = trigger.parentElement || document.body;

    this._trigger.classList.add('dd-trigger', 'model-dropdown-trigger');
    this._onTriggerClick = (e) => {
      e.stopPropagation();
      this.toggle();
    };
    this._trigger.addEventListener('click', this._onTriggerClick);
  }

  /** 用 GET /api/config/llm 数据刷新触发器与面板内容 */
  update(data) {
    this._data = data || null;
    this._renderTrigger();
    if (this._isOpen) this._renderPanel();
  }

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;
    // 每次打开从第一级（menu）开始
    this._level = 'menu';
    this._trigger.classList.add('dd-open');
    this._renderPanel();
    this._positionPanel();
    this._bindOutside();
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._trigger.classList.remove('dd-open');
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    this._unbindOutside();
  }

  destroy() {
    this.close();
    this._trigger.classList.remove('dd-trigger', 'model-dropdown-trigger', 'dd-open');
    this._trigger.removeEventListener('click', this._onTriggerClick);
  }

  // ==================== 数据辅助 ====================

  /** 当前模型在历史快照中的条目（含 reasoningEffort/thinkingEnabled） */
  _currentSnapshot() {
    if (!this._data) return null;
    const provider = (this._data.provider || '').trim().toLowerCase();
    const model = this._data.model || '';
    return (this._data.modelHistory || []).find(s =>
      (s.provider || '').trim().toLowerCase() === provider && (s.model || '') === model
    ) || null;
  }

  /** 归一化档位：不在当前 Provider 合法集内时回退 Default（如 openai 下残留的 max） */
  _normalizedEffort() {
    if (!this._data) return '';
    const items = getReasoningEffortItems(this._data.provider || '');
    const raw = this._currentSnapshot()?.reasoningEffort ?? '';
    return items.some(i => i.value === raw) ? raw : '';
  }

  _currentCombo() {
    if (!this._data) return '';
    return (this._data.provider || '') + ':' + (this._data.model || '');
  }

  // ==================== 触发器（双信息：模型名 · 档位） ====================

  _renderTrigger() {
    if (!this._data) return;
    const model = this._data.model || '';

    this._trigger.textContent = '';
    const modelSpan = document.createElement('span');
    modelSpan.className = 'msp-trigger-model';
    modelSpan.textContent = model || t('chat.noModel');
    this._trigger.appendChild(modelSpan);

    // 仅当档位被主动设置（非 Default）时才显示「· 档位」：
    // Default（空值 = 不传参，交由模型服务商决定）对用户无决策价值，不占触发器空间；
    // 面板第一级 menu 的「思考强度」摘要仍会显示 Default，信息通路不受影响。
    const effort = this._normalizedEffort();
    if (effort) {
      const sep = document.createElement('span');
      sep.className = 'msp-trigger-sep';
      sep.textContent = '·';
      this._trigger.appendChild(sep);

      const effortSpan = document.createElement('span');
      effortSpan.className = 'msp-trigger-effort';
      effortSpan.textContent = effort;
      this._trigger.appendChild(effortSpan);
    }
  }

  // ==================== 面板（两级：menu → models/effort） ====================

  _renderPanel() {
    if (!this._isOpen) return;
    // 面板已打开时重新渲染（如后台刷新配置）：先移除旧面板，避免叠加
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    // 防御：当前层级失效时回退第一级（如二级开着时后台切到不支持档位的 Provider）
    if (this._level === 'effort' && !supportsReasoningEffort(this._data?.provider || '')) {
      this._level = 'menu';
    }

    this._panel = document.createElement('div');
    this._panel.className = 'msp-panel';
    this._host.appendChild(this._panel);

    if (this._level === 'models') {
      this._renderModelsLevel();
    } else if (this._level === 'effort') {
      this._renderEffortLevel();
    } else {
      this._renderMenu();
    }
  }

  /** 第一级：menu — 模型 / 思考强度两个入口，右侧带当前值摘要 */
  _renderMenu() {
    const provider = this._data?.provider || '';
    const model = this._data?.model || '';
    const supported = supportsReasoningEffort(provider);
    const snap = this._currentSnapshot();
    const thinkingEnabled = snap ? snap.thinkingEnabled !== false : true;

    // 模型入口
    this._panel.appendChild(this._buildMenuEntry(
      t('msp.modelSection'),
      model || t('chat.noModel'),
      () => {
        this._level = 'models';
        this._renderPanel();
      }
    ));

    // 思考强度入口（仅支持档位的 Provider 显示；Thinking 关闭时置灰不可进）
    if (supported) {
      this._panel.appendChild(this._buildMenuEntry(
        t('msp.effortSection'),
        this._normalizedEffort() || t('chatui.effortDefaultLabel'),
        () => {
          this._level = 'effort';
          this._renderPanel();
        },
        !thinkingEnabled,
        thinkingEnabled ? '' : t('chatui.effortDisabledTitle')
      ));
    }
  }

  /** 构造 menu 入口行：label + 当前值摘要 + › 箭头 */
  _buildMenuEntry(label, value, onClick, disabled = false, disabledTitle = '') {
    const row = document.createElement('div');
    row.className = 'msp-menu-item' + (disabled ? ' disabled' : '');
    if (disabledTitle) row.title = disabledTitle;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'msp-menu-label';
    labelSpan.textContent = label;
    row.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'msp-menu-value';
    valueSpan.textContent = value;
    row.appendChild(valueSpan);

    const arrow = document.createElement('span');
    arrow.className = 'msp-menu-arrow';
    arrow.textContent = '›';
    row.appendChild(arrow);

    if (!disabled) {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
    }
    return row;
  }

  /** 第二级 header：返回键 + 标题（sticky 吸顶） */
  _renderHeader(title) {
    const header = document.createElement('div');
    header.className = 'msp-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'msp-back';
    backBtn.textContent = '←';
    backBtn.title = t('msp.back');
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._level = 'menu';
      this._renderPanel();
    });
    header.appendChild(backBtn);

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    header.appendChild(titleSpan);

    this._panel.appendChild(header);
  }

  /** 第二级：模型列表（历史 + 添加模型） */
  _renderModelsLevel() {
    this._renderHeader(t('msp.modelSection'));
    const body = document.createElement('div');
    body.className = 'msp-body';

    const modelItems = this._buildModelItems();
    const currentCombo = this._currentCombo();
    for (const item of modelItems) {
      if (item.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'msp-divider';
        body.appendChild(divider);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'msp-item' + (item.value === currentCombo ? ' selected' : '') + (item.disabled ? ' disabled' : '');
      const label = document.createElement('span');
      label.className = 'msp-item-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.value === currentCombo) {
        const check = document.createElement('span');
        check.className = 'msp-item-check';
        check.textContent = '✓';
        row.appendChild(check);
      }
      if (!item.disabled) {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleModelClick(item);
        });
      }
      body.appendChild(row);
    }
    this._panel.appendChild(body);
  }

  /** 第二级：思考强度档位列表（Thinking 关闭时入口已在一级置灰，进入后档位始终可点） */
  _renderEffortLevel() {
    this._renderHeader(t('msp.effortSection'));
    const body = document.createElement('div');
    body.className = 'msp-body';

    const provider = this._data?.provider || '';
    const model = this._data?.model || '';
    const items = getReasoningEffortItems(provider);
    const current = this._normalizedEffort();

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'msp-item' + (item.value === current ? ' selected' : '');
      const label = document.createElement('span');
      label.className = 'msp-item-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.value === current) {
        const check = document.createElement('span');
        check.className = 'msp-item-check';
        check.textContent = '✓';
        row.appendChild(check);
      }
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleEffortClick(provider, model, item.value);
      });
      body.appendChild(row);
    }
    this._panel.appendChild(body);
  }

  _buildModelItems() {
    const provider = this._data?.provider || '';
    const model = this._data?.model || '';
    const currentCombo = provider + ':' + model;
    const items = [];
    const seen = new Set();
    const history = this._data?.modelHistory || [];

    for (const snap of history) {
      const key = (snap.provider || '') + ':' + (snap.model || '');
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ label: snap.model || key, value: key });
    }
    if (provider && model && !seen.has(currentCombo)) {
      items.push({ label: model, value: currentCombo });
    }
    if (items.length > 0) {
      items.push({ type: 'divider' });
    }
    items.push({ label: t('chat.addModel'), value: ADD_MODEL_VALUE });
    if (items.length <= 1) {
      items.unshift({ label: t('chat.noModel'), value: '', disabled: true });
    }
    return items;
  }

  // ==================== 点击处理 ====================

  _handleModelClick(item) {
    if (item.value === ADD_MODEL_VALUE) {
      this.close();
      this._onAddModel?.();
      return;
    }
    if (!item.value) return;
    const colonIdx = item.value.indexOf(':');
    if (colonIdx <= 0) return;
    this.close();
    this._onModelSelect?.(item.value.substring(0, colonIdx), item.value.substring(colonIdx + 1));
  }

  _handleEffortClick(provider, model, effort) {
    this.close();
    this._onEffortSelect?.(provider, model, effort);
  }

  // ==================== 定位 / 外部关闭 ====================

  _positionPanel() {
    if (!this._panel || !this._trigger) return;
    const rect = this._trigger.getBoundingClientRect();
    const hostRect = this._host.getBoundingClientRect();
    const style = this._panel.style;
    // 垂直：由 CSS bottom: calc(100% + 6px) 保证面板底边紧贴按钮顶上方 6px（与 files popover 一致）。
    // 水平：面板 absolute 相对宿主（.status-bar-item），默认 left:0 即面板左缘对齐按钮左缘；
    //       右侧放不下时右对齐宿主右缘；左侧溢出视口时贴左兜底。
    // 宽度用实际渲染宽度（面板按内容撑开，可能 > 320）；测试环境无布局时回退常量
    const panelWidth = this._panel.offsetWidth || PANEL_WIDTH;
    let left = 0;
    if (hostRect.left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - 8 - panelWidth - hostRect.left;
    }
    if (hostRect.left + left < 8) {
      left = 8 - hostRect.left;
    }
    style.left = left + 'px';
    // 高度上限：面板向上最多顶到视口顶部留 8px，内容超高时面板内部滚动
    style.maxHeight = Math.max(120, rect.top - 8) + 'px';

    // 定位监控：输出触发器位置、视口与面板最终落位，便于排查面板位置异常
    console.debug('[ModelSelectorPanel] 面板定位', {
      host: { left: hostRect.left, width: hostRect.width, top: hostRect.top, bottom: hostRect.bottom },
      trigger: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      panel: { left: style.left, bottom: 'calc(100% + 6px)', maxHeight: style.maxHeight, width: panelWidth },
    });
  }

  _bindOutside() {
    this._onOutsideClick = (e) => {
      if (this._panel && !this._panel.contains(e.target) && e.target !== this._trigger) {
        this.close();
      }
    };
    setTimeout(() => document.addEventListener('click', this._onOutsideClick), 0);
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindOutside() {
    if (this._onOutsideClick) {
      document.removeEventListener('click', this._onOutsideClick);
      this._onOutsideClick = null;
    }
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }
}
