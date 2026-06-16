/**
 * Activity Bar 组件 — 左侧固定竖条
 *
 * 管理按钮点击 → 浮动面板展开/收起
 * 支持从外部打开指定面板（如状态栏点击联动）
 */
export class ActivityBar {
    constructor() {
        // DOM 缓存
        this.bar = document.getElementById('activityBar');
        this.panel = document.getElementById('activityFloatingPanel');
        this.panelTitle = document.getElementById('activityPanelTitle');
        this.panelBody = document.getElementById('activityPanelBody');
        this.closeBtn = document.getElementById('activityPanelClose');

        /** 当前打开的面板名，null 表示关闭 */
        this.activePanel = null;

        /** 面板内容注册表：{ panelName: DOM_Element | () => DOM_Element } */
        this.registry = new Map();

        /** 面板打开回调：{ panelName: () => void } */
        this._openCallbacks = new Map();

        this.init();
    }

    init() {
        if (!this.bar || !this.panel) return;

        // 按钮点击切换面板
        this.bar.querySelectorAll('.activity-bar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelName = btn.dataset.panel;
                if (!panelName) return;
                this.togglePanel(panelName);
            });
        });

        // 关闭按钮
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.closePanel());
        }

        // 点击面板外部关闭（使用 pointerdown 而非 click，避免被程序化打开干扰）
        document.addEventListener('click', (e) => {
            if (!this.activePanel) return;
            // 如果这个 click 是由 openPanel 同一事件流触发的，跳过
            if (this._ignoreNextOutsideClick) {
                this._ignoreNextOutsideClick = false;
                return;
            }
            const target = e.target;
            if (this.panel.contains(target) || this.bar.contains(target)) return;
            this.closePanel();
        });

        // 面板内部阻止冒泡到 document
        this.panel.addEventListener('click', (e) => {
            // 不阻止默认行为，只阻止冒泡到外部关闭
            // closeBtn 已经单独绑定了
        });
    }

    /**
     * 注册面板内容供给方
     * @param {string} panelName - 面板名，对应 data-panel
     * @param {Function|HTMLElement} provider - 返回 DOM 的函数或 DOM 元素
     */
    registerPanel(panelName, provider) {
        this.registry.set(panelName, provider);
    }

    /**
     * 注册面板打开回调（打开面板时立即触发刷新）
     * @param {string} panelName
     * @param {Function} callback
     */
    onPanelOpen(panelName, callback) {
        this._openCallbacks.set(panelName, callback);
    }

    /**
     * 切换面板
     * @param {string} panelName - 面板名
     */
    togglePanel(panelName) {
        if (this.activePanel === panelName) {
            this.closePanel();
            return;
        }
        this.openPanel(panelName);
    }

    /**
     * 打开指定面板
     * @param {string} panelName - 面板名
     */
    openPanel(panelName) {
        // 标记本次忽略下次外部点击关闭（由调用者的事件冒泡引起）
        this._ignoreNextOutsideClick = true;

        const btn = this.bar.querySelector(`.activity-bar-btn[data-panel="${panelName}"]`);
        if (!btn) return;

        // 更新按钮 active 状态
        this.bar.querySelectorAll('.activity-bar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 设置标题
        this.panelTitle.textContent = btn.title || panelName;

        // 填充内容
        this.panelBody.innerHTML = '';
        if (this.registry.has(panelName)) {
            const content = this.registry.get(panelName);
            if (typeof content === 'function') {
                const el = content();
                if (el) this.panelBody.appendChild(el);
            } else if (content instanceof HTMLElement) {
                this.panelBody.appendChild(content.cloneNode(true));
            }
        } else {
            // 未注册内容的占位
            this.panelBody.innerHTML = `
                <div class="activity-panel-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                    </svg>
                    <span>暂未接入内容</span>
                </div>
            `;
        }

        // 显示面板（先在 display:none 状态下替换内容再显示，避免闪烁）
        this.panel.classList.remove('closing');
        this.panel.style.display = 'flex';
        this.activePanel = panelName;

        // 触发面板打开回调（立即刷新数据）
        if (this._openCallbacks.has(panelName)) {
            this._openCallbacks.get(panelName)();
        }

        // 下一帧清除忽略标记，避免误伤后续的点击
        setTimeout(() => {
            this._ignoreNextOutsideClick = false;
        }, 0);
    }

    /**
     * 关闭面板
     */
    closePanel() {
        if (!this.activePanel) return;

        // 移除按钮 active
        this.bar.querySelectorAll('.activity-bar-btn').forEach(b => b.classList.remove('active'));

        // 播放关闭动画
        this.panel.classList.add('closing');
        setTimeout(() => {
            this.panel.style.display = 'none';
            this.panel.classList.remove('closing');
        }, 150);

        this.activePanel = null;
    }

    /**
     * 从外部打开指定面板（供状态栏等调用）
     * @param {string} panelName
     */
    open(panelName) {
        this.openPanel(panelName);
    }

    /**
     * 从外部关闭面板
     */
    close() {
        this.closePanel();
    }

    /**
     * 当前是否有面板打开
     */
    isOpen() {
        return this.activePanel !== null;
    }

    /**
     * 获取当前打开的面板名
     */
    getActivePanel() {
        return this.activePanel;
    }
}
