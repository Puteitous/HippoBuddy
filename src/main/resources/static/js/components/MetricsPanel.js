// 实时监控面板组件 - 含可视化图表
import { appState } from '../state/app-state.js';
import { escapeHtml, apiGet } from '../utils.js';

export class MetricsPanel {
  constructor() {
    this.updateTimer = null;
    this.elements = {};
    
    // 延迟历史记录（用于趋势图）
    this._latencyHistory = [];
    this._lastKnownTotal = 0;
    
    // 语言切换时重新渲染趋势图（动态文本如 "N 次记录" 需要更新）
    this._onI18nChange = () => {
      this._ensureElements();
      this._renderTrendChart();
    };
    window.addEventListener('i18n:change', this._onI18nChange);
    
    this.init();
  }
  
  init() {
    this.elements = {
      // LLM 指标
      metLlmTotal: document.getElementById('metLlmTotal'),
      metLlmAvgLatency: document.getElementById('metLlmAvgLatency'),
      metLlmMaxLatency: document.getElementById('metLlmMaxLatency'),
      
      // 工具调用指标
      metToolTotal: document.getElementById('metToolTotal'),
      metToolFailed: document.getElementById('metToolFailed'),
      
      // 更新时间
      metUpdateTime: document.getElementById('metUpdateTime'),
      
      // Activity Bar 面板元素（懒加载）
      abMetLlmTotal: null,
      abMetLlmAvgLatency: null,
      abMetLlmMaxLatency: null,
      abMetLlmRingFg: null,
      abMetLlmRingText: null,
      abMetToolTotal: null,
      abMetToolFailed: null,

      abMetToolBarList: null,
      abMetTrendChart: null,
      abMetTrendCount: null,
      abMetUpdateTime: null
    };
  }

  /**
   * 获取环形图颜色（绿 → 黄 → 红渐变）
   */
  _getRingColor(percent) {
    if (percent >= 90) return 'var(--success-color, #4caf50)';
    if (percent >= 70) return 'var(--warning-color, #ff9800)';
    return 'var(--danger-color, #f44336)';
  }

  /**
   * 更新环形图的 SVG stroke-dasharray
   * @param {SVGPathElement} fgEl - 前景圆环元素
   * @param {number} percent - 百分比 (0-100)
   */
  _updateRing(fgEl, percent) {
    if (!fgEl) return;
    const pct = Math.min(Math.max(percent, 0), 100);
    const circumference = 100; // 圆的周长 = 2 * PI * r, r=15.9155, 归一化为100
    const offset = circumference - (pct / 100) * circumference;
    fgEl.style.strokeDasharray = `${circumference} ${circumference}`;
    fgEl.style.strokeDashoffset = offset;
    fgEl.style.stroke = this._getRingColor(pct);
  }

  /**
   * 获取延迟数据的采样值
   * 通过对比前后 totalRequests 的变化，估算新增请求的平均延迟
   */
  _sampleLatency(llm) {
    if (!llm || !llm.totalRequests) return null;
    
    const currentTotal = llm.totalRequests;
    const newCalls = currentTotal - this._lastKnownTotal;
    
    if (newCalls > 0 && llm.avgLatencyMs > 0) {
      // 记录当前平均延迟作为采样点
      this._lastKnownTotal = currentTotal;
      return llm.avgLatencyMs;
    } else if (this._lastKnownTotal === 0 && currentTotal > 0) {
      // 首次获取数据
      this._lastKnownTotal = currentTotal;
      return llm.avgLatencyMs;
    }
    return null;
  }

  /**
   * 渲染延迟趋势折线图（SVG）
   */
  _renderTrendChart() {
    const container = this.elements.abMetTrendChart;
    const countEl = this.elements.abMetTrendCount;
    if (!container) return;
    
    const history = this._latencyHistory;
    
    if (history.length < 2) {
      const msg = window.i18n ? window.i18n.t('tokenPanel.waiting') : '等待更多数据...';
      container.innerHTML = `<div class="metrics-trend-empty">${msg}</div>`;
      if (countEl) countEl.textContent = (history.length || 0) + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录');
      return;
    }
    
    const maxPoints = 30;
    const displayData = history.slice(-maxPoints);
    const values = displayData;
    
    const width = 260;
    const height = 44;
    const padding = 2;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    // 折线坐标
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * chartW;
      const y = padding + chartH - ((v - min) / range) * chartH;
      return `${x},${y}`;
    });
    
    // 面积图底部填充
    const areaBottom = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * chartW;
      return `${x},${padding + chartH}`;
    }).reverse();
    const allPoints = [...points, ...areaBottom, points[0]];
    
    const svg = `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="trend-svg">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary-color)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0.04"/>
          </linearGradient>
        </defs>
        <polyline class="trend-area" points="${allPoints.join(' ')}"/>
        <polyline class="trend-line" points="${points.join(' ')}"/>
        <circle cx="${points[points.length - 1].split(',')[0]}"
                cy="${points[points.length - 1].split(',')[1]}"
                r="2.5" fill="var(--primary-color)" stroke="var(--bg-white)" stroke-width="1.5"/>
      </svg>
    `;
    
    container.innerHTML = svg;
    if (countEl) {
      countEl.textContent = window.i18n
        ? window.i18n.t('monitor.trendCount', { count: values.length, max: Math.round(max) })
        : `${values.length} 次记录 · 最近 ${Math.round(max)}ms`;
    }
  }

  /**
   * 渲染工具调用分布条形图
   */
  _renderToolBarChart(tools) {
    const container = this.elements.abMetToolBarList;
    if (!container || !tools || !tools.details) return;
    
    const details = tools.details;
    if (details.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    const maxCount = details[0].count;
    
    container.innerHTML = details.map(t => {
      const pct = maxCount > 0 ? (t.count / maxCount * 100) : 0;
      return `
        <div class="metrics-bar-row">
          <span class="metrics-bar-label">${escapeHtml(t.name)}</span>
          <div class="metrics-bar-track">
            <div class="metrics-bar-fill" style="width:${pct}%">
              <span class="metrics-bar-count">${t.count}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 更新监控指标
   */
  async updateMetrics() {
    try {
      // 每次更新前确保元素已加载（支持懒加载场景）
      this._ensureElements();
      
      const data = await apiGet('/api/metrics');
      
      // ====== LLM 指标 ======
      if (data.llm) {
        const llm = data.llm;
        
        // 环形图（SVG stroke-dasharray 方式）
        const llmRate = llm.totalRequests > 0
          ? Math.round(llm.successfulRequests / llm.totalRequests * 100)
          : 0;
        
        this._updateRing(this.elements.abMetLlmRingFg, llmRate);
        this._setText(this.elements.abMetLlmRingText, llmRate + '%');
        if (this.elements.abMetLlmRingText) {
          this.elements.abMetLlmRingText.style.fill = this._getRingColor(llmRate);
        }
        
        // 文本指标
        this._setText(this.elements.abMetLlmTotal, llm.totalRequests);
        this._setText(this.elements.abMetLlmAvgLatency, llm.avgLatencyMs + 'ms');
        this._setText(this.elements.abMetLlmMaxLatency, llm.maxLatencyMs + 'ms');
        
        // 采集延迟样本用于趋势图
        const sample = this._sampleLatency(llm);
        if (sample !== null && sample > 0) {
          this._latencyHistory.push(Math.round(sample));
        }
        // 每次都渲染趋势图，确保面板 DOM 重建后图表恢复（不依赖是否采到新数据）
        this._renderTrendChart();
      }
      
      // ====== 工具调用指标 ======
      if (data.tools) {
        const tools = data.tools;
        
        this._setText(this.elements.abMetToolTotal, tools.totalCalls);
        this._setText(this.elements.abMetToolFailed, tools.failedCalls);
        
        // 条形图
        this._renderToolBarChart(tools);
      }
      
      // ====== 更新时间 ======
      const now = new Date();
      const locale = window.i18n && window.i18n.currentLang === 'en' ? 'en-US' : 'zh-CN';
      const timeStr = now.toLocaleTimeString(locale, {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const i18n = window.i18n;
      if (this.elements.abMetUpdateTime) {
        this.elements.abMetUpdateTime.textContent =
          (i18n ? i18n.t('metrics.updatedAt') : '更新于 ') + timeStr;
      }
      
    } catch (e) {
      console.error('更新监控指标失败:', e);
    }
  }
  
  /**
   * 懒加载 Activity Bar 面板元素
   */
  _lazyCacheAbElements() {
    const get = (id) => document.getElementById(id);
    
    this.elements.abMetLlmTotal = get('abMetLlmTotal') || this.elements.abMetLlmTotal;
    this.elements.abMetLlmAvgLatency = get('abMetLlmAvgLatency') || this.elements.abMetLlmAvgLatency;
    this.elements.abMetLlmMaxLatency = get('abMetLlmMaxLatency') || this.elements.abMetLlmMaxLatency;
    this.elements.abMetLlmRingFg = get('abMetLlmRingFg') || this.elements.abMetLlmRingFg;
    this.elements.abMetLlmRingText = get('abMetLlmRingText') || this.elements.abMetLlmRingText;
    
    this.elements.abMetToolTotal = get('abMetToolTotal') || this.elements.abMetToolTotal;
    this.elements.abMetToolFailed = get('abMetToolFailed') || this.elements.abMetToolFailed;
    this.elements.abMetToolBarList = get('abMetToolBarList') || this.elements.abMetToolBarList;
    
    this.elements.abMetTrendChart = get('abMetTrendChart') || this.elements.abMetTrendChart;
    this.elements.abMetTrendCount = get('abMetTrendCount') || this.elements.abMetTrendCount;
    
    this.elements.abMetUpdateTime = get('abMetUpdateTime') || this.elements.abMetUpdateTime;
  }

  /**
   * 元素懒加载（每次更新前调用，支持 template 克隆后延迟加载）
   */
  _ensureElements() {
    this._lazyCacheAbElements();
  }

  /**
   * 启动自动更新
   * @param {number} interval - 更新间隔（毫秒）
   */
  startAutoUpdate(interval = 10000) {
    // 立即更新
    this._ensureElements();
    this.updateMetrics();
    
    // 定时更新
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.updateTimer = setInterval(() => {
      this._ensureElements();
      this.updateMetrics();
    }, interval);
  }
  
  /**
   * 强制立即刷新（由外部调用，如面板切换时）
   */
  refresh() {
    this._ensureElements();
    this.updateMetrics();
  }
  
  /**
   * 停止自动更新
   */
  stopAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
  
  /**
   * 安全设置文本内容
   */
  _setText(el, text) {
    if (el) el.textContent = text;
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    this.stopAutoUpdate();
    if (this._onI18nChange) window.removeEventListener('i18n:change', this._onI18nChange);
  }
}
