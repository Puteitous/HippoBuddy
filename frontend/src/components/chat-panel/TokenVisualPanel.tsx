/**
 * TokenVisualPanel - Activity Bar 的 Token 统计完整面板(对齐旧版 abTokenPanel 模板)。
 *
 * 展示内容:
 *  - 上下文使用率:三档表情 + 百分比 + 渐变进度条 + 当前/上限
 *  - 9 宫格字段:Prompt / Completion / 总输入 / 总输出 / LLM 调用 / 工具调用 /
 *    缓存命中 / 缓存率 / 总缓存命中 / 总缓存率(2 列 × 5 行)
 *  - 会话总消耗
 *  - Token 消耗趋势图(SVG 折线,primary 蓝)
 *  - 缓存命中率趋势图(SVG 折线,y 固定 0-100%,success 绿 + 100% 基准虚线)
 *
 * 数据源:合并后的当前用量(stats) + 全局历史 tokenHistory(chatStore,驱动趋势图)。
 */
import type { TokenRecord } from '@/stores/chatStore';
import { useChatStore } from '@/stores/chatStore';
import { useI18n } from '@/i18n';
import { getTokenColor } from './tokenUtils';
import type { MergedStats } from './tokenUtils';
import { TokenEmojiIcon } from './TokenEmojiIcon';
import './TokenVisualPanel.css';

/** 趋势图最多显示最近 N 条(对齐旧版 MAX = 30) */
const MAX_TREND_POINTS = 30;
/** 视图尺寸与内边距(对齐旧版 renderTrendChart) */
const CHART_WIDTH = 280;
const CHART_HEIGHT = 48;
const PADDING = 2;

function fmt(n: number): string {
  return (n || 0).toLocaleString();
}

/**
 * Token 消耗趋势图(对齐旧版 renderTrendChart):y 轴随历史 min/max 动态缩放。
 */
function TokenTrendChart({ history }: { history: TokenRecord[] }) {
  const { t } = useI18n();
  // 过滤全 0 记录,取最近 N 条
  const data = history
    .filter((h) => (h.total || 0) > 0 || (h.prompt || 0) > 0 || (h.completion || 0) > 0)
    .slice(-MAX_TREND_POINTS);

  const header = (
    <div className="token-trend-header">
      <span className="token-trend-label">{t('tokenPanel.trend')}</span>
      <span className="token-trend-value">{history.length}{t('tokenPanel.records')}</span>
    </div>
  );

  if (data.length < 2) {
    return (
      <div className="token-trend">
        {header}
        <div className="token-trend-chart">
          <div className="token-trend-empty">{t('tokenPanel.waiting')}</div>
        </div>
      </div>
    );
  }

  const values = data.map((h) => h.total || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartWidth = CHART_WIDTH - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;

  const points = values.map((v, i) => {
    const x = PADDING + (i / (values.length - 1)) * chartWidth;
    const y = PADDING + chartHeight - ((v - min) / range) * chartHeight;
    return `${x},${y}`;
  });
  const areaPoints = points
    .slice()
    .reverse()
    .map((p) => {
      const x = p.split(',')[0];
      return `${x},${PADDING + chartHeight}`;
    });
  const allPoints = [...points, ...areaPoints, points[0]];
  const last = points[points.length - 1].split(',');

  return (
    <div className="token-trend">
      {header}
      <div className="token-trend-chart">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-color)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary-color)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <polyline className="trend-area" points={allPoints.join(' ')} />
          <polyline points={points.join(' ')} />
          <circle
            cx={last[0]}
            cy={last[1]}
            r="2.5"
            fill="var(--primary-color)"
            stroke="var(--bg-white)"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * 缓存命中率趋势图(对齐旧版 renderCacheRateChart):y 轴固定 0-100%,
 * 顶部 100% 基准虚线直观反映与满命中的差距。
 */
function CacheRateTrendChart({ history }: { history: TokenRecord[] }) {
  const { t } = useI18n();
  // 过滤无缓存率数据的记录
  const data = history
    .filter((h) => typeof h.cacheRate === 'number' && !Number.isNaN(h.cacheRate))
    .slice(-MAX_TREND_POINTS);

  const header = (
    <div className="token-trend-header">
      <span className="token-trend-label">{t('tokenPanel.cacheTrend')}</span>
      <span className="token-trend-value">{data.length}{t('tokenPanel.records')}</span>
    </div>
  );

  if (data.length < 2) {
    return (
      <div className="token-trend cache-trend">
        {header}
        <div className="token-trend-chart">
          <div className="token-trend-empty">{t('tokenPanel.waiting')}</div>
        </div>
      </div>
    );
  }

  const values = data.map((h) => h.cacheRate as number);
  const chartWidth = CHART_WIDTH - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;

  const points = values.map((v, i) => {
    const x = PADDING + (i / (values.length - 1)) * chartWidth;
    const y = PADDING + chartHeight - (Math.min(Math.max(v, 0), 100) / 100) * chartHeight;
    return `${x},${y}`;
  });
  const areaPoints = points
    .slice()
    .reverse()
    .map((p) => {
      const x = p.split(',')[0];
      return `${x},${PADDING + chartHeight}`;
    });
  const allPoints = [...points, ...areaPoints, points[0]];
  const baselineY = PADDING;
  const last = points[points.length - 1].split(',');

  return (
    <div className="token-trend cache-trend">
      {header}
      <div className="token-trend-chart">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cacheTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success-color, #4caf50)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--success-color, #4caf50)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path
            className="cache-trend-baseline"
            d={`M ${PADDING} ${baselineY} L ${PADDING + chartWidth} ${baselineY}`}
          />
          <polyline className="trend-area" points={allPoints.join(' ')} />
          <polyline points={points.join(' ')} />
          <circle className="cache-trend-last-dot" cx={last[0]} cy={last[1]} r="2.5" />
        </svg>
      </div>
    </div>
  );
}

interface TokenVisualPanelProps {
  stats: MergedStats;
}

export function TokenVisualPanel({ stats }: TokenVisualPanelProps) {
  const { t } = useI18n();
  const tokenHistory = useChatStore((s) => s.tokenHistory);

  const percent = stats.usagePercent || 0;
  const color = getTokenColor(percent);
  const barWidth = Math.min(percent, 100);
  const overThreshold = percent > 80;

  // Prompt / Completion 带准确性标记(估算模式回退 current)
  const promptText = stats.hasKnownUsage
    ? fmt(stats.promptTokens)
    : `~${fmt(stats.currentTokens)}`;
  const completionText = stats.hasKnownUsage
    ? fmt(stats.completionTokens)
    : `~${fmt(stats.currentTokens)}`;

  const gridItems: Array<{ label: string; value: string; success?: boolean }> = [
    { label: t('tokenPanel.prompt'), value: promptText },
    { label: t('tokenPanel.completion'), value: completionText },
    { label: t('tokenPanel.totalInput'), value: fmt(stats.sessionTotalInput) },
    { label: t('tokenPanel.totalOutput'), value: fmt(stats.sessionTotalOutput) },
    { label: t('tokenPanel.llmCalls'), value: fmt(stats.sessionLlmCalls) },
    { label: t('tokenPanel.toolCalls'), value: fmt(stats.sessionToolCalls) },
    { label: t('tokenPanel.cacheHit'), value: `${stats.cacheHitTokens ? fmt(stats.cacheHitTokens) : '0'}`, success: true },
    { label: t('tokenPanel.cacheRate'), value: `${stats.cacheHitRate ? stats.cacheHitRate.toFixed(1) + '%' : '0%'}`, success: true },
    { label: t('tokenPanel.totalCacheHit'), value: `${stats.sessionCacheHitTokens ? fmt(stats.sessionCacheHitTokens) : '0'}`, success: true },
    { label: t('tokenPanel.totalCacheRate'), value: `${stats.sessionCacheHitRate ? stats.sessionCacheHitRate.toFixed(1) + '%' : '0%'}`, success: true },
  ];

  return (
    <div className="token-visual">
      {/* 上下文使用率 */}
      <div className="token-visual-item">
        <div className="token-visual-label">
          <span>{t('tokenPanel.usageRate')}</span>
          <span className="token-visual-value" style={{ color }}>
            <TokenEmojiIcon percent={percent} />
            {percent.toFixed(1)}%
          </span>
        </div>
        <div className="token-visual-track">
          <div
            className="token-visual-fill"
            style={{
              width: `${barWidth}%`,
              background: color,
              boxShadow: overThreshold ? `0 0 8px ${color}` : 'none',
            }}
          />
        </div>
        <div className="token-visual-sub">
          {fmt(stats.currentTokens)} / {fmt(stats.maxTokens)} tokens
        </div>
      </div>

      <div className="token-visual-divider" />

      {/* 统计字段 2 列网格 */}
      <div className="token-visual-grid">
        {gridItems.map((item) => (
          <div className="token-visual-stat" key={item.label}>
            <span className="tvs-label">{item.label}</span>
            <span className={`tvs-value${item.success ? ' success-text' : ''}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="token-visual-divider" />

      {/* 会话总消耗 */}
      <div className="token-visual-total">
        <span>{t('tokenPanel.sessionTotal')}</span>
        <span className="tv-total-value">{fmt(stats.sessionTotalTokens)}</span>
      </div>

      {/* 趋势图 */}
      <TokenTrendChart history={tokenHistory} />
      <CacheRateTrendChart history={tokenHistory} />
    </div>
  );
}