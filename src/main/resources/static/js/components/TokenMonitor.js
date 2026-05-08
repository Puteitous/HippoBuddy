// Token 监控面板组件
import { appState } from '../state/app-state.js';
import { escapeHtml } from '../utils.js';
import { showToast } from '../utils/toast.js';

export class TokenMonitor {
  constructor(chatService) {
    this.chatService = chatService;
    this.updateTimer = null;
    
    // DOM 元素缓存
    this.elements = {};
    
    this.init();
  }
  
  init() {
    // 缓存 DOM 元素
    this.elements = {
      tokenUsage: document.getElementById('tokenUsage'),
      tokenPercent: document.getElementById('tokenPercent'),
      tokenDetailsBtn: document.getElementById('tokenDetailsBtn'),
      tvPercent: document.getElementById('tvPercent'),
      tvBar: document.getElementById('tvBar'),
      tvUsage: document.getElementById('tvUsage'),
      tvMax: document.getElementById('tvMax'),
      tvPrompt: document.getElementById('tvPrompt'),
      tvCompletion: document.getElementById('tvCompletion'),
      tvSessionInput: document.getElementById('tvSessionInput'),
      tvSessionOutput: document.getElementById('tvSessionOutput'),
      tvLlmCalls: document.getElementById('tvLlmCalls'),
      tvToolCalls: document.getElementById('tvToolCalls'),
      tvSessionTotal: document.getElementById('tvSessionTotal'),
      trendCount: document.getElementById('trendCount'),
      trendChart: document.getElementById('trendChart')
    };
    
    // 绑定事件
    if (this.elements.tokenDetailsBtn) {
      this.elements.tokenDetailsBtn.addEventListener('click', () => {
        this.showDetails();
      });
    }
    
    // 绑定关闭弹窗事件
    const closeBtn = document.getElementById('closeTokenModal');
    const modal = document.getElementById('tokenDetailsModal');
    
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      // 点击遮罩层关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    }
    
    // 订阅主题变化
    appState.subscribe('currentTheme', () => {
      this.renderTrendChart();
    });
  }
  
  /**
   * 更新 Token 统计
   */
  async updateTokenStats() {
    const sessionId = appState.currentSessionId;
    if (!sessionId) return;
    
    try {
      const stats = await this.chatService.getTokenStats(sessionId);
      
      // 添加准确性标记
      const accuracyMark = stats.hasKnownUsage ? '✓' : '~';
      const accuracyTitle = stats.hasKnownUsage 
        ? '真实值（来自 LLM 返回）' 
        : '估算值（首轮回退模式）';
      
      // 更新顶部统计
      if (this.elements.tokenUsage) {
        this.elements.tokenUsage.style.color = '';
        this.elements.tokenUsage.textContent = 
          `${accuracyMark} ${stats.currentTokens.toLocaleString()} / ${stats.maxTokens.toLocaleString()}`;
        this.elements.tokenUsage.title = accuracyTitle;
      }
      
      if (this.elements.tokenPercent) {
        this.elements.tokenPercent.style.color = '';
        this.elements.tokenPercent.textContent = `${stats.usagePercent.toFixed(1)}%`;
        this.elements.tokenPercent.title = accuracyTitle;
      }
      
      // 显示详细 Token 信息（包括总计）
      if (stats.hasKnownUsage) {
        const totalTitle = `✓ 真实值（来自 LLM 返回）\n\n` +
                         `├─ Prompt: ${stats.promptTokens.toLocaleString()}\n` +
                         `├─ Completion: ${stats.completionTokens.toLocaleString()}\n` +
                         `└─ Total: ${stats.totalTokens.toLocaleString()}`;
        if (this.elements.tokenUsage) {
          this.elements.tokenUsage.title = totalTitle;
        }
        if (this.elements.tokenPercent) {
          this.elements.tokenPercent.title = totalTitle;
        }
      }
      
      // 更新侧边栏可视化
      this.updateTokenVisual(stats);
      
      // 添加到历史记录（只添加有实际数据的记录）
      const totalTokens = stats.totalTokens || 0;
      const promptTokens = stats.promptTokens || 0;
      const completionTokens = stats.completionTokens || 0;
      
      if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0) {
        appState.addTokenRecord({
          total: totalTokens,
          prompt: promptTokens,
          completion: completionTokens,
          percent: stats.usagePercent
        });
      }
      
      // 更新趋势图
      this.renderTrendChart();
      
    } catch (error) {
      console.error('更新 Token 统计失败:', error);
    }
  }
  
  /**
   * 获取 Token 颜色（绿->黄->红渐变）
   */
  getTokenColor(percent) {
    const p = Math.min(percent, 100) / 100;
    let r, g, b;
    if (p <= 0.5) {
      const t = p / 0.5;
      r = Math.round(76 + (255 - 76) * t);
      g = Math.round(175 + (193 - 175) * t);
      b = Math.round(80 + (7 - 80) * t);
    } else if (p <= 0.75) {
      const t = (p - 0.5) / 0.25;
      r = Math.round(255 + (240 - 255) * t);
      g = Math.round(193 + (160 - 193) * t);
      b = Math.round(7 + (48 - 7) * t);
    } else {
      const t = (p - 0.75) / 0.25;
      r = Math.round(240 + (224 - 240) * t);
      g = Math.round(160 + (80 - 160) * t);
      b = Math.round(48 + (80 - 48) * t);
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  
  /**
   * 更新 Token 可视化
   */
  updateTokenVisual(stats) {
    if (!this.elements.tvPercent || !stats) return;
    
    const percent = stats.usagePercent || 0;
    const color = this.getTokenColor(percent);
    
    // 上下文使用率
    this.elements.tvPercent.textContent = `${percent.toFixed(1)}%`;
    this.elements.tvPercent.style.color = color;
    
    // 进度条
    this.elements.tvBar.style.width = `${Math.min(percent, 100)}%`;
    this.elements.tvBar.style.background = color;
    this.elements.tvBar.style.boxShadow = percent > 80 ? `0 0 8px ${color}` : 'none';
    
    // 当前上下文
    if (this.elements.tvUsage) {
      this.elements.tvUsage.textContent = (stats.currentTokens || 0).toLocaleString();
    }
    if (this.elements.tvMax) {
      this.elements.tvMax.textContent = (stats.maxTokens || 0).toLocaleString();
    }
    
    // Prompt 和 Completion（带准确性标记）
    if (this.elements.tvPrompt) {
      this.elements.tvPrompt.textContent = stats.hasKnownUsage 
        ? (stats.promptTokens || 0).toLocaleString() 
        : '~' + (stats.currentTokens || 0).toLocaleString();
    }
    if (this.elements.tvCompletion) {
      this.elements.tvCompletion.textContent = stats.hasKnownUsage 
        ? (stats.completionTokens || 0).toLocaleString() 
        : '~' + (stats.currentTokens || 0).toLocaleString();
    }
    
    // 会话总计
    if (this.elements.tvSessionInput) {
      this.elements.tvSessionInput.textContent = (stats.sessionTotalInput || 0).toLocaleString();
    }
    if (this.elements.tvSessionOutput) {
      this.elements.tvSessionOutput.textContent = (stats.sessionTotalOutput || 0).toLocaleString();
    }
    if (this.elements.tvLlmCalls) {
      this.elements.tvLlmCalls.textContent = (stats.sessionLlmCalls || 0).toLocaleString();
    }
    if (this.elements.tvToolCalls) {
      this.elements.tvToolCalls.textContent = (stats.sessionToolCalls || 0).toLocaleString();
    }
    if (this.elements.tvSessionTotal) {
      this.elements.tvSessionTotal.textContent = (stats.sessionTotalTokens || 0).toLocaleString();
    }
  }
  
  /**
   * 渲染趋势图（SVG 折线图）
   */
  renderTrendChart() {
    if (!this.elements.trendChart || !this.elements.trendCount) return;
    
    // 过滤掉全 0 的记录
    const history = appState.tokenHistory.filter(h => 
      (h.total || 0) > 0 || (h.prompt || 0) > 0 || (h.completion || 0) > 0
    );
    
    if (history.length < 2) {
      this.elements.trendChart.innerHTML = '<div class="token-trend-empty">等待更多数据...</div>';
      this.elements.trendCount.textContent = (history.length || 0) + ' 次记录';
      return;
    }
    
    // 最多显示最近 30 条记录
    const maxPoints = 30;
    const displayHistory = history.slice(-maxPoints);
    
    // 使用 total 值作为趋势数据
    const values = displayHistory.map(h => h.total || 0);
    
    const width = 280;
    const height = 48;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    // 计算坐标点
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((v - min) / range) * chartHeight;
      return `${x},${y}`;
    });
    
    // 计算面积图的点（底部镜像）
    const areaPoints = points.slice().reverse().map(p => {
      const [x] = p.split(',');
      return `${x},${padding + chartHeight}`;
    });
    const allPoints = [...points, ...areaPoints, points[0]];
    
    this.elements.trendCount.textContent = `${values.length} 次记录`;
    
    // 渲染 SVG 折线图
    this.elements.trendChart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary-color)" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        <polyline class="trend-area" points="${allPoints.join(' ')}"/>
        <polyline points="${points.join(' ')}"/>
        <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="2.5" fill="var(--primary-color)" stroke="var(--bg-white)" stroke-width="1.5"/>
      </svg>
    `;
  }
  
  /**
   * 定时更新
   */
  scheduleUpdate() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.updateTokenStats();
    }, 1000);
  }
  
  /**
   * 启动自动更新
   * @param {number} interval - 更新间隔（毫秒）
   */
  startAutoUpdate(interval = 30000) {
    // 立即更新一次
    this.updateTokenStats();
    
    // 定时更新
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.updateTimer = setInterval(() => {
      this.updateTokenStats();
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
   * 显示 Token 详情
   */
  async showDetails() {
    const modal = document.getElementById('tokenDetailsModal');
    if (!modal) {
      alert('Token 详情弹窗未初始化');
      return;
    }
    
    try {
      // 从 chatService 获取最新统计数据
      const stats = await this.chatService.getTokenStats(appState.currentSessionId);
      
      // 当前上下文
      document.getElementById('detailPrompt').textContent = stats.hasKnownUsage ? stats.promptTokens.toLocaleString() : 'N/A';
      document.getElementById('detailCompletion').textContent = stats.hasKnownUsage ? stats.completionTokens.toLocaleString() : 'N/A';
      document.getElementById('detailTotal').textContent = (stats.currentTokens || 0).toLocaleString();
      
      // 会话总计
      document.getElementById('detailSessionInput').textContent = stats.sessionTotalInput ? stats.sessionTotalInput.toLocaleString() : '0';
      document.getElementById('detailSessionOutput').textContent = stats.sessionTotalOutput ? stats.sessionTotalOutput.toLocaleString() : '0';
      document.getElementById('detailSessionTotal').textContent = stats.sessionTotalTokens ? stats.sessionTotalTokens.toLocaleString() : '0';
      document.getElementById('detailLlmCalls').textContent = stats.sessionLlmCalls ? stats.sessionLlmCalls.toLocaleString() : '0';
      document.getElementById('detailToolCalls').textContent = stats.sessionToolCalls ? stats.sessionToolCalls.toLocaleString() : '0';
      
      modal.style.display = 'flex';
    } catch (error) {
      console.error('获取 Token 详情失败:', error);
      showToast('获取 Token 详情失败：' + error.message, { type: 'error', duration: 3000 });
    }
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    this.stopAutoUpdate();
  }
}
