// Token 监控面板组件
import { appState } from '../state/app-state.js';

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
      tvCacheHit: document.getElementById('tvCacheHit'),
      tvCacheRate: document.getElementById('tvCacheRate'),
      tvSessionCacheHit: document.getElementById('tvSessionCacheHit'),
      tvSessionCacheRate: document.getElementById('tvSessionCacheRate'),
      trendCount: document.getElementById('trendCount'),
      trendChart: document.getElementById('trendChart'),
      statusBarToken: document.getElementById('statusBarToken'),
      statusBarTokenValue: document.getElementById('statusBarTokenValue')
    };
    
    // 订阅主题变化
    appState.subscribe('currentTheme', () => {
      this.renderTrendChart();
      this.renderCacheRateChart();
    });
    
    // 初始化悬浮 tooltip
    this._initHoverTooltip();

    // 语言切换时刷新趋势图（动态文本如 "N 次记录" 需要重新渲染）
    this._onI18nChange = () => {
      this.renderTrendChart();
      this.renderCacheRateChart();
    };
    window.addEventListener('i18n:change', this._onI18nChange);
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
      
      // 添加到历史记录（只添加有实际数据的记录，去重）
      const totalTokens = stats.totalTokens || 0;
      const promptTokens = stats.promptTokens || 0;
      const completionTokens = stats.completionTokens || 0;
      
      const recordKey = `${totalTokens}|${promptTokens}|${completionTokens}`;
      if (recordKey !== this._lastRecordKey) {
        this._lastRecordKey = recordKey;
        if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0) {
          appState.addTokenRecord({
            total: totalTokens,
            prompt: promptTokens,
            completion: completionTokens,
            percent: stats.usagePercent,
            // 缓存率随记录快照（最近一次 LLM 调用的缓存命中率）；
            // 估算模式无已知 usage 时为 undefined，渲染时跳过
            cacheRate: stats.hasKnownUsage ? stats.cacheHitRate : undefined
          });
        }
      }
      
      // 更新趋势图
      this.renderTrendChart();
      this.renderCacheRateChart();
      
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
    if (!stats) return;
    this._lastStats = stats;
    
    const percent = stats.usagePercent || 0;
    const color = this.getTokenColor(percent);
    
    // 右侧面板元素可能不存在（右侧面板已移除），安全更新
    if (this.elements.tvPercent) {
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
      
      // 缓存命中
      if (this.elements.tvCacheHit) {
        this.elements.tvCacheHit.textContent = stats.cacheHitTokens ? stats.cacheHitTokens.toLocaleString() : '0';
      }
      if (this.elements.tvCacheRate) {
        this.elements.tvCacheRate.textContent = stats.cacheHitRate ? stats.cacheHitRate.toFixed(1) + '%' : '0%';
      }
      
      // 会话级缓存命中
      if (this.elements.tvSessionCacheHit) {
        this.elements.tvSessionCacheHit.textContent = stats.sessionCacheHitTokens ? stats.sessionCacheHitTokens.toLocaleString() : '0';
      }
      if (this.elements.tvSessionCacheRate) {
        this.elements.tvSessionCacheRate.textContent = stats.sessionCacheHitRate ? stats.sessionCacheHitRate.toFixed(1) + '%' : '0%';
      }
    }

    // 更新输入框状态条
    if (this.elements.statusBarTokenValue) {
      this.elements.statusBarTokenValue.textContent = `${percent.toFixed(1)}%`;
    }
    
    // === 同步更新 Activity Bar 面板元素 ===
    this._updateAbElements(stats, percent, color);
  }
  
  /**
   * 处理后端 token_update SSE 实时推送（流式中真实值 / 回合结束校准值）。
   * <p>
   * 与轮询 {@link #updateTokenStats} 不同：此方法不拉取 /tokens 接口、不写趋势图历史，
   * 仅把实时 usage 快照直接渲染到状态栏 / 右侧面板 / Activity Bar 面板，
   * 消除"回合一结束还要等最多 30s 轮询"的滞后感。
   * </p>
   * @param {Object} data - 后端 pushTokenUpdate 推送的字段：promptTokens / completionTokens /
   *                        totalTokens / cacheHitTokens / cacheHitRate / hasKnownUsage
   */
  onLiveTokenUpdate(data) {
    if (!data || !data.hasKnownUsage) return;
    // 尚无轮询基准（maxTokens 未知）时先跳过，首次轮询填充后再接管实时渲染
    const base = this._lastStats;
    if (!base || !base.maxTokens) return;

    const prompt = data.promptTokens || 0;
    const completion = data.completionTokens || 0;
    const total = data.totalTokens || (prompt + completion);
    const usagePercent = Math.round(total * 1000.0 / base.maxTokens) / 10.0;

    // 以最近一次完整统计为基础，仅覆盖当前回合实时字段，
    // 保留 sessionTotal / llmCalls / toolCalls 等累计值（避免 tooltip 显示为 0）
    const stats = {
      ...base,
      currentTokens: total,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      hasKnownUsage: true,
      cacheHitTokens: data.cacheHitTokens || 0,
      cacheHitRate: data.cacheHitRate || 0,
      usagePercent,
      live: true
    };
    this.updateTokenVisual(stats);
  }
  
  /**
   * 更新 Activity Bar 面板中的 Token 元素
   * 支持懒加载：元素可能晚于 TokenMonitor 初始化，每次检查并自动重缓存
   */
  _updateAbElements(stats, percent, color) {
    // 不依赖 document.getElementById（template 克隆的元素可能查找不到），
    // 直接从 activityPanelBody 中 querySelector 查找
    const panelBody = document.getElementById('activityPanelBody');
    if (!panelBody || !panelBody.querySelector('.token-visual')) return;
    
    const q = (id) => panelBody.querySelector('#' + id);
    
    const elPercent = q('abTvPercent');
    if (!elPercent) return;
    
    const emojiSvg = this._getTokenEmoji(percent);
    elPercent.innerHTML = `${emojiSvg} ${percent.toFixed(1)}%`;
    elPercent.style.color = color;
    
    const elBar = q('abTvBar');
    if (elBar) {
      elBar.style.width = `${Math.min(percent, 100)}%`;
      elBar.style.background = color;
      elBar.style.boxShadow = percent > 80 ? `0 0 8px ${color}` : 'none';
    }
    
    this._setText(q('abTvUsage'), (stats.currentTokens || 0).toLocaleString());
    this._setText(q('abTvMax'), (stats.maxTokens || 0).toLocaleString());
    
    this._setText(q('abTvPrompt'), stats.hasKnownUsage 
      ? (stats.promptTokens || 0).toLocaleString() 
      : '~' + (stats.currentTokens || 0).toLocaleString());
    this._setText(q('abTvCompletion'), stats.hasKnownUsage 
      ? (stats.completionTokens || 0).toLocaleString() 
      : '~' + (stats.currentTokens || 0).toLocaleString());
    
    this._setText(q('abTvSessionInput'), (stats.sessionTotalInput || 0).toLocaleString());
    this._setText(q('abTvSessionOutput'), (stats.sessionTotalOutput || 0).toLocaleString());
    this._setText(q('abTvLlmCalls'), (stats.sessionLlmCalls || 0).toLocaleString());
    this._setText(q('abTvToolCalls'), (stats.sessionToolCalls || 0).toLocaleString());
    this._setText(q('abTvSessionTotal'), (stats.sessionTotalTokens || 0).toLocaleString());
    
    this._setText(q('abTvCacheHit'), stats.cacheHitTokens ? stats.cacheHitTokens.toLocaleString() : '0');
    this._setText(q('abTvCacheRate'), stats.cacheHitRate ? stats.cacheHitRate.toFixed(1) + '%' : '0%');
    this._setText(q('abTvSessionCacheHit'), stats.sessionCacheHitTokens ? stats.sessionCacheHitTokens.toLocaleString() : '0');
    this._setText(q('abTvSessionCacheRate'), stats.sessionCacheHitRate ? stats.sessionCacheHitRate.toFixed(1) + '%' : '0%');
  }

  /**
   * 安全设置文本内容
   */
  _setText(el, text) {
    if (el) el.textContent = text;
  }
  
  /**
   * 渲染趋势图（SVG 折线图）
   */
  renderTrendChart() {
    if (!appState.tokenHistory) return;
    
    // 过滤掉全 0 的记录
    const history = appState.tokenHistory.filter(h => 
      (h.total || 0) > 0 || (h.prompt || 0) > 0 || (h.completion || 0) > 0
    );
    
    if (history.length < 2) {
      const msg = window.i18n ? window.i18n.t('tokenPanel.waiting') : '等待更多数据...';
      if (this.elements.trendChart) this.elements.trendChart.innerHTML = `<div class="token-trend-empty">${msg}</div>`;
      if (this.elements.trendCount) this.elements.trendCount.textContent = (history.length || 0) + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录');
      // 同步 Activity Bar
      this._syncAbTrendChart(`<div class="token-trend-empty">${msg}</div>`, (history.length || 0) + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录'));
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
    
    const countText = values.length + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录');
    if (this.elements.trendCount) this.elements.trendCount.textContent = countText;
    
    // 渲染 SVG 折线图
    const svgHtml = `
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
    if (this.elements.trendChart) this.elements.trendChart.innerHTML = svgHtml;
    
    // 同步 Activity Bar 趋势图
    this._syncAbTrendChart(svgHtml, countText);
  }

  /**
   * 渲染缓存命中率趋势图（SVG 折线，y 轴固定 0-100%）
   * <p>
   * 数据来自 tokenHistory 中快照的 cacheRate（每次 LLM 调用后随 token 记录写入）；
   * 估算模式（无已知 usage）的记录 cacheRate 为 undefined，渲染时过滤。
   * </p>
   */
  renderCacheRateChart() {
    if (!appState.tokenHistory) return;
    
    // 过滤掉无缓存率数据的记录
    const history = appState.tokenHistory.filter(h => 
      typeof h.cacheRate === 'number' && !isNaN(h.cacheRate)
    );
    
    const renderEmpty = () => {
      const msg = window.i18n ? window.i18n.t('tokenPanel.waiting') : '等待更多数据...';
      const count = (history.length || 0) + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录');
      // 同步 Activity Bar 面板
      this._syncAbCacheTrendChart(`<div class="token-trend-empty">${msg}</div>`, count);
    };
    
    if (history.length < 2) {
      renderEmpty();
      return;
    }
    
    // 最多显示最近 30 条记录
    const maxPoints = 30;
    const displayHistory = history.slice(-maxPoints);
    
    // 缓存率是百分比：y 轴固定 0-100%，不做动态缩放，直观反映与满命中的差距
    const values = displayHistory.map(h => h.cacheRate);
    
    const width = 280;
    const height = 48;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // 计算坐标点（y 固定映射 0-100 → 底部-顶部）
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * chartWidth;
      const y = padding + chartHeight - (Math.min(Math.max(v, 0), 100) / 100) * chartHeight;
      return `${x},${y}`;
    });
    
    // 计算面积图的点（底部镜像）
    const areaPoints = points.slice().reverse().map(p => {
      const [x] = p.split(',');
      return `${x},${padding + chartHeight}`;
    });
    const allPoints = [...points, ...areaPoints, points[0]];
    
    // 100% 基准线（灰色虚线，一眼看出与满命中的差距）
    const baselineY = padding + chartHeight - chartHeight; // = padding（顶部 100%）
    const baseline = `M ${padding} ${baselineY} L ${padding + chartWidth} ${baselineY}`;
    
    const countText = values.length + (window.i18n ? window.i18n.t('tokenPanel.records') : ' 次记录');
    
    const svgHtml = `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cacheTrendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--success-color, #4caf50)" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="var(--success-color, #4caf50)" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        <path class="cache-trend-baseline" d="${baseline}"/>
        <polyline class="trend-area" points="${allPoints.join(' ')}"/>
        <polyline points="${points.join(' ')}"/>
        <circle class="cache-trend-last-dot" cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="2.5"/>
      </svg>
    `;
    
    // 同步 Activity Bar 面板
    this._syncAbCacheTrendChart(svgHtml, countText);
  }

  /**
   * 同步 Activity Bar 面板的缓存命中率趋势图
   */
  _syncAbCacheTrendChart(svgHtml, countText) {
    const panelBody = document.getElementById('activityPanelBody');
    if (!panelBody || !panelBody.querySelector('.cache-trend')) return;
    
    const chart = panelBody.querySelector('#abCacheTrendChart');
    const count = panelBody.querySelector('#abCacheTrendCount');
    if (chart) chart.innerHTML = svgHtml;
    if (count) count.textContent = countText;
  }

  /**
   * 同步 Activity Bar 面板的趋势图
   */
  _syncAbTrendChart(svgHtml, countText) {
    const panelBody = document.getElementById('activityPanelBody');
    if (!panelBody || !panelBody.querySelector('.token-trend')) return;
    
    const chart = panelBody.querySelector('#abTrendChart');
    const count = panelBody.querySelector('#abTrendCount');
    if (chart) chart.innerHTML = svgHtml;
    if (count) count.textContent = countText;
  }
  
  /**
   * 根据使用率返回对应的 SVG 表情图标（三档）
   */
  _getTokenEmoji(percent) {
    // 根据当前主题选择表情颜色：浅色=黑，深色=白
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const stroke = (theme === 'dark' || theme === 'midnight') ? '#fff' : '#000';

    // 😊 开心 — 余量充足（≤ 50%）
    if (percent <= 50) {
      return `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M31 18V19" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 18V19" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M31 31C31 31 29 35 24 35C19 35 17 31 17 31" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    // 😐 平静 — 注意占用（50% ~ 75%）
    if (percent <= 75) {
      return `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M31 18V19" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 18V19" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="20" y="24" width="8" height="12" rx="4" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    // 😰 焦虑 — 占用较高（≥ 75%）
    return `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M24 29C29 29 31 33 31 33H17C17 33 19 29 24 29Z" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M32 17L29 20L32 23" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 17L19 20L16 23" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  /**
   * 初始化悬浮 tooltip：hover 到状态栏 Token 按钮上时简洁展示关键数据
   */
  _initHoverTooltip() {
    const el = this.elements.statusBarToken;
    if (!el) return;
    
    // 创建 tooltip 元素
    const tooltip = document.createElement('div');
    tooltip.className = 'status-bar-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    
    const showTooltip = () => {
      const stats = this._lastStats;
      if (!stats) return;
      
      const percent = stats.usagePercent || 0;
      const color = this.getTokenColor(percent);
      const barWidth = Math.min(percent, 100);
      const emoji = this._getTokenEmoji(percent);
      
      tooltip.innerHTML = `
        <div class="sbt-header">
          <span>${window.i18n ? window.i18n.t('tokenPanel.usageRate') : 'Token 使用率'}</span>
          <span class="sbt-percent" style="color:${color}">${emoji} ${percent.toFixed(1)}%</span>
        </div>
        <div class="sbt-bar-track">
          <div class="sbt-bar-fill" style="width:${barWidth}%;background:${color}"></div>
        </div>
        <div class="sbt-row">
          <span>${window.i18n ? window.i18n.t('token.currentContext') : '当前'}</span>
          <span>${(stats.currentTokens || 0).toLocaleString()} / ${(stats.maxTokens || 0).toLocaleString()}</span>
        </div>
        ${(stats.cacheHitTokens || stats.sessionCacheHitTokens) ? `
        <div class="sbt-divider"></div>
        <div class="sbt-row">
          <span>${window.i18n ? window.i18n.t('tokenPanel.cacheHit') : '缓存命中'}</span>
          <span>${(stats.cacheHitTokens || 0).toLocaleString()} (${stats.cacheHitRate ? stats.cacheHitRate.toFixed(1) + '%' : '0%'})</span>
        </div>
        ` : ''}
        <div class="sbt-divider"></div>
        <div class="sbt-row sbt-total">
          <span>${window.i18n ? window.i18n.t('tokenPanel.sessionTotal') : '会话总计'}</span>
          <span>${(stats.sessionTotalTokens || 0).toLocaleString()} <span data-i18n="tokenPanel.tokens">${window.i18n ? window.i18n.t('tokenPanel.tokens') : 'tokens'}</span></span>
        </div>
      `;
      
      // 定位 tooltip
      const rect = el.getBoundingClientRect();
      tooltip.style.display = 'block';
      tooltip.style.left = `${rect.left - 25}px`;
      tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      
      // 超出右侧边界时右对齐
      const tipWidth = tooltip.offsetWidth;
      if (rect.left - 30 + tipWidth > window.innerWidth - 16) {
        tooltip.style.left = `${window.innerWidth - tipWidth - 16}px`;
      }
    };
    
    const hideTooltip = () => {
      tooltip.style.display = 'none';
    };
    
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
    
    // 点击时隐藏（防止遮挡 Activity Bar 面板）
    el.addEventListener('click', hideTooltip);
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
   * 销毁组件
   */
  destroy() {
    this.stopAutoUpdate();
    if (this._onI18nChange) {
      window.removeEventListener('i18n:change', this._onI18nChange);
    }
  }
}
