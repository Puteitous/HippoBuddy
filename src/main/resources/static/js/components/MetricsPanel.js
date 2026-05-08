// 实时监控面板组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';

export class MetricsPanel {
  constructor() {
    this.updateTimer = null;
    this.elements = {};
    
    this.init();
  }
  
  init() {
    this.elements = {
      // LLM 指标
      metLlmTotal: document.getElementById('metLlmTotal'),
      metLlmSuccessRate: document.getElementById('metLlmSuccessRate'),
      metLlmAvgLatency: document.getElementById('metLlmAvgLatency'),
      metLlmMaxLatency: document.getElementById('metLlmMaxLatency'),
      
      // 工具调用指标
      metToolTotal: document.getElementById('metToolTotal'),
      metToolSuccessRate: document.getElementById('metToolSuccessRate'),
      metToolFailed: document.getElementById('metToolFailed'),
      metToolList: document.getElementById('metToolList'),
      
      // 记忆系统指标
      metMemSearchCount: document.getElementById('metMemSearchCount'),
      metMemHitRate: document.getElementById('metMemHitRate'),
      metMemFallback: document.getElementById('metMemFallback'),
      metMemInjection: document.getElementById('metMemInjection'),
      
      // 更新时间
      metUpdateTime: document.getElementById('metUpdateTime')
    };
  }
  
  /**
   * 更新监控指标
   */
  async updateMetrics() {
    try {
      const response = await fetch('/api/metrics');
      if (!response.ok) return;
      const data = await response.json();
      
      // LLM 指标
      if (data.llm) {
        const llm = data.llm;
        this.setText('metLlmTotal', llm.totalRequests);
        
        const successRate = llm.totalRequests > 0
          ? Math.round(llm.successfulRequests / llm.totalRequests * 100) + '%'
          : '0%';
        this.setText('metLlmSuccessRate', successRate);
        this.setText('metLlmAvgLatency', llm.avgLatencyMs + 'ms');
        this.setText('metLlmMaxLatency', llm.maxLatencyMs + 'ms');
      }
      
      // 工具调用指标
      if (data.tools) {
        const tools = data.tools;
        this.setText('metToolTotal', tools.totalCalls);
        
        const toolSuccessRate = tools.totalCalls > 0
          ? Math.round(tools.successfulCalls / tools.totalCalls * 100) + '%'
          : '0%';
        this.setText('metToolSuccessRate', toolSuccessRate);
        this.setText('metToolFailed', tools.failedCalls);
        
        if (this.elements.metToolList && tools.details) {
          this.elements.metToolList.innerHTML = tools.details.map(t =>
            `<span class="metrics-tool-tag"><span class="tool-count">${t.count}</span> ${escapeHtml(t.name)}</span>`
          ).join('');
        }
      }
      
      // 记忆系统指标
      if (data.memory) {
        const mem = data.memory;
        this.setText('metMemSearchCount', mem.vectorSearchCount);
        this.setText('metMemHitRate', mem.searchHitRate + '%');
        this.setText('metMemFallback', mem.keywordFallbackCount);
        this.setText('metMemInjection', mem.injectionSuccessCount);
      }
      
      // 更新时间
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      
      if (this.elements.metUpdateTime) {
        this.elements.metUpdateTime.textContent = '更新于 ' + timeStr;
      }
      
    } catch (e) {
      console.error('更新监控指标失败:', e);
    }
  }
  
  /**
   * 设置文本内容
   */
  setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  }
  
  /**
   * 启动自动更新
   * @param {number} interval - 更新间隔（毫秒）
   */
  startAutoUpdate(interval = 10000) {
    // 立即更新一次
    this.updateMetrics();
    
    // 定时更新
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.updateTimer = setInterval(() => {
      this.updateMetrics();
    }, interval);
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
   * 销毁组件
   */
  destroy() {
    this.stopAutoUpdate();
  }
}
